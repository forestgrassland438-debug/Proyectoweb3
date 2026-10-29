/* =============================================================================
 * LA ECONOMÍA Y LOS DOS TESOROS — herramienta del centro de control (economia.html)
 *                                                                  (2026-10-26)
 * -----------------------------------------------------------------------------
 * "Actualiza control-center.html: quiero los gráficos y todos los datos
 * específicos de los dos tesoros." Lo que cuenta server2.js en "LA ECONOMÍA":
 *   GET  /api/admin/economia            los dos tesoros, la economía (precio,
 *                                       inflación, masa), compras y movimientos
 *   POST /api/admin/economia/config     el precio del oro y las reglas de compra
 *   POST /api/admin/economia/foto       rehacer la foto del día ahora
 *   POST /api/admin/tesoro-juego/ajuste meter o sacar bronce del tesoro del juego
 *
 * Todo con textContent (nada de innerHTML con datos) y los gráficos en SVG
 * hechos nodo a nodo. Un eje por gráfico; las tres monedas, en índice.
 * ========================================================================== */
(function (root) {
  'use strict';
  const ui = root.GFAdminUI, session = root.GFAdminSession;
  const $ = id => document.getElementById(id);
  const t = s => (ui ? ui.t(s) : String(s));
  if (!ui || !session) {
    const m = $('ec-gate-msg');
    if (m) { m.textContent = 'The administration suite did not load. Reload the page.'; m.dataset.error = 'true'; }
    return;
  }

  // Los seis orígenes del tesoro del juego, con los seis primeros colores de la paleta (orden fijo).
  const ORIGENES = [
    ['tienda', 'Game shop', '#3987e5'], ['p2p', 'P2P market', '#d95926'], ['viajes', 'Map travel', '#199e70'],
    ['vip', 'VIP', '#c98500'], ['revivir', 'Revive potions', '#d55181'], ['admin', 'Admin', '#008300'],
    // (2026-10-28) Lo que se cobra por fundir y craftear (economia2.js lo configura).
    ['servicios', 'Smelting & crafting', '#9085e9']
  ];
  const SALUD = { sin_datos: ['Collecting data', '◌'], deflacion: ['Deflation', '▼'], estable: ['Stable', '✓'], caliente: ['Warming up', '!'], recalentada: ['Overheated', '▲'] };
  const ESTADOS = { cotizada: 'Quoted', pagada: 'Paid · waiting', acreditada: 'Credited', fallida: 'Failed' };

  let verificado = false, cerrado = false, cargando = false, ocupado = false, sucio = false;
  let datos = null, peticion = null, reloj = 0, ultimaCarga = 0;
  // (2026-10-28) Con la 2.ª parte (economia2.js): sus formularios también cuentan como "cambios sin guardar".
  root.GFTreasuryLifecycle = Object.freeze({ status: () => (ocupado ? 'busy' : sucio ? 'dirty'
    : (root.GFEconomia2 && typeof root.GFEconomia2.status === 'function' && root.GFEconomia2.status()) || '') });

  const loc = () => (ui.language === 'es' ? 'es-EC' : 'en-US');
  const fmt = (n, d = 0) => new Intl.NumberFormat(loc(), { maximumFractionDigits: d }).format(Number(n) || 0);
  const zk = n => fmt(n, Number(n) >= 1 ? 4 : 8);
  const pct = v => (v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(2) + '%');
  const fecha = f => { const d = new Date(f); return isNaN(d) ? '—' : new Intl.DateTimeFormat(loc(), { dateStyle: 'short', timeStyle: 'short' }).format(d); };
  const diaCorto = d => { const p = String(d).split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : d; };
  // Fechas del eje: cada 7 días contando desde hoy (la última siempre); la primera
  // solo si no se monta con la siguiente. Devuelve el text-anchor o null.
  const fechaEnEje = (i, n) => {
    const resto = (n - 1 - i) % 7;
    if (resto !== 0 && !(i === 0 && resto >= 3)) return null;
    return i === n - 1 && n > 1 ? 'end' : (i === 0 ? 'start' : 'middle');
  };

  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = String(texto); return e; }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, texto) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); if (texto != null) e.textContent = String(texto); return e; }
  function tabla(cols, filas, vacio) {
    if (!filas.length) return el('div', 'tz-empty', t(vacio));
    const tb = el('table', 'tz-table'), cab = el('thead'), tr = el('tr');
    cols.forEach(c => { const h = el('th', c.num ? 'num' : '', t(c.t)); h.scope = 'col'; tr.append(h); });
    cab.append(tr); tb.append(cab);
    const cuerpo = el('tbody');
    filas.forEach(f => { const r = el('tr'); f.forEach((v, i) => { const d = el('td', cols[i] && cols[i].num ? 'num' : ''); if (v instanceof Node) d.append(v); else d.textContent = v == null || v === '' ? '—' : String(v); r.append(d); }); cuerpo.append(r); });
    tb.append(cuerpo);
    return tb;
  }
  function filas(destino, pares) { destino.replaceChildren(...pares.flatMap(([k, v]) => [el('span', '', t(k)), el('span', '', v)])); }

  // ── La puerta ─────────────────────────────────────────────────────────────
  function mensajePuerta(texto, error) { const m = $('ec-gate-msg'); m.textContent = t(texto); m.dataset.error = String(!!error); }
  function errorDeAcceso(e) {
    if (e && e.code === 4001) return 'Signature rejected.';
    if (e && (e.code === 'not_admin' || e.status === 403)) return 'Your wallet is not an administrator.';
    if (e && e.status === 401) return 'Your session expired. Connect again.';
    if (e instanceof TypeError) return 'Connection unavailable. Check that your backend is running.';
    return (e && e.message) || 'Session could not be verified.';
  }
  function aPuerta(motivo, error) {
    verificado = false; clearInterval(reloj); reloj = 0; if (peticion) { peticion.abort(); peticion = null; }
    $('ec-app').hidden = true; $('ec-gate').hidden = false; $('ec-connect').disabled = false;
    if (motivo) mensajePuerta(motivo, error);
  }
  async function verificar(interactivo) {
    if (cerrado) return;
    $('ec-connect').disabled = true;
    try {
      const yo = interactivo ? await session.signIn(m => mensajePuerta(m)) : await session.request('/api/admin/whoami');
      if (!/^0x[0-9a-f]{40}$/i.test((yo && yo.address) || '')) throw new Error('This account has no administrator permission.');
      if (cerrado) return;
      verificado = true;
      $('ec-gate').hidden = true; $('ec-app').hidden = false;
      if (!reloj) reloj = setInterval(() => { if (document.visibilityState !== 'hidden' && !ocupado && !sucio) cargar(); }, 60000);
      await cargar();
    } catch (e) {
      if (cerrado) return;
      if (!interactivo && e && e.status === 401) aPuerta('Connect your administrator wallet to continue.', false);
      else aPuerta(errorDeAcceso(e), true);
    } finally { if (!cerrado) $('ec-connect').disabled = false; }
  }

  // ── Cargar ────────────────────────────────────────────────────────────────
  function aviso(texto) { const n = $('ec-notice'); n.hidden = !texto; n.textContent = texto ? t(texto) : ''; }
  async function cargar() {
    if (!verificado || cargando || cerrado) return;
    cargando = true; $('ec-refresh').disabled = true;
    const ctl = new AbortController(); peticion = ctl;
    try {
      const d = await session.request('/api/admin/economia', { signal: ctl.signal });
      if (cerrado || ctl.signal.aborted) return;
      if (!d || !d.juego || !d.economia) throw new Error('The server answered without economy data.');
      datos = d; ultimaCarga = Date.now(); aviso('');
      pintar();
      // (2026-10-28) La 2.ª parte (economia2.js: quemar, fondo de reserva, índice, muerte, servicios) carga lo suyo.
      try { document.dispatchEvent(new CustomEvent('gf-economia:cargada', { detail: d })); } catch (_) {}
      $('ec-updated').textContent = t('Last updated · ') + new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ultimaCarga));
    } catch (e) {
      if (cerrado || (e && e.name === 'AbortError')) return;
      aviso(e && e.status === 404 ? 'This backend does not have the economy routes yet. Update server2.js.' : (e && e.message) || 'Could not load the economy.');
    } finally { cargando = false; if (!cerrado) $('ec-refresh').disabled = false; if (peticion === ctl) peticion = null; }
  }

  // ── Pintar ────────────────────────────────────────────────────────────────
  function pintar() {
    const d = datos, j = d.juego, c = d.circular, e = d.economia;
    $('ec-circ-saldo').textContent = fmt(c.saldo);
    filas($('ec-circ-filas'), [
      ['Reserved for dropped coins', fmt(c.reservado)], ['From the game shop (1.5%)', fmt(c.ingresado.tienda)], ['From the P2P market (1.5%)', fmt(c.ingresado.p2p)],
      ['From exchange fees', fmt(c.ingresado.cambio || 0)], ['Deposited by admins', fmt(c.ingresado.admin)],
      ['Paid to free players', fmt(c.pagado.free)], ['Paid to VIP players', fmt(c.pagado.vip)], ['Withdrawn', fmt(c.retirado)]
    ]);
    $('ec-juego-saldo').textContent = fmt(j.saldo);
    filas($('ec-juego-filas'), ORIGENES.map(([k, nombre]) => [nombre, fmt(j.ingresado[k] || 0)]).concat([
      ['Withdrawn', fmt(j.retirado)], ['zkLTC received for Gold', zk(j.zkltc.recibido) + ' zkLTC'], ['Gold sold', fmt(j.zkltc.oro) + ' · ' + fmt(j.zkltc.compras) + ' ' + t('purchases')]
    ]));
    pintarIngresos(d.serieJuego || []);
    pintarEconomia(e);
    cargarCompras().catch(() => pintarCompras());
    $('ec-movs').replaceChildren(tabla([{ t: 'When' }, { t: 'Source' }, { t: 'Bronze', num: true }, { t: 'Player' }, { t: 'Detail' }],
      (d.ultimos || []).map(m => [fecha(m.t), t((ORIGENES.find(o => o[0] === m.origen) || [0, m.origen === 'compra_oro' ? 'Gold purchase' : m.origen])[1]),
        m.bronce ? (m.bronce > 0 ? '+' : '') + fmt(m.bronce) : '—', m.playerName || '—', m.detalle || '']), 'No movements yet.'));
    if (!sucio) rellenarForm(d.config, d.destino, d.destinoServidor);
  }

  // El viewBox mide lo que mide su caja (como en tesoro.js): con un ancho fijo el
  // texto salía a 20 px en el gráfico ancho y a 6 px en los pequeños.
  let ANCHO = 600;
  const ALTO = 190, IZQ = 64, DER = 10, ARR = 12, ABA = 24;
  const medir = id => { const caja = $(id); ANCHO = Math.max(300, Math.round((caja && caja.clientWidth) || 600)); };

  /* (2026-10-28) "Gráficos más profesionales, mejores y más movibles, con
     fechas y hora exactas de internet": gf-graficos.js (hora del servidor en
     UTC, rueda o pellizco para acercar, arrastrar, rangos, ficha y tabla). Si
     no cargara, se pintan los de antes. Un gráfico vivo por caja. */
  const G = root.GFGraficos || null;
  const vivos = {};
  function grafico(id, op) {
    const caja = $(id);
    if (!caja) return;
    const idioma = ui.language === 'es' ? 'es' : 'en';
    const datosG = { series: op.series, datos: op.datos };
    if (vivos[id]) { vivos[id].actualizar(datosG); return; }
    vivos[id] = G.crear(caja, Object.assign({ idioma, alto: 230, rango: '30d', rangos: ['7d', '30d', '90d', 'todo'] }, op));
  }
  const cuandoFoto = f => { const a = f && f.actualizado ? Date.parse(f.actualizado) : NaN; return isFinite(a) ? a : Date.parse(f.dia + 'T00:00:00Z'); };
  function pintarIngresos(serie) {
    if (G) {
      grafico('ec-ingresos', { tipo: 'barras', etiqueta: t('Game treasury income by day and source'), rango: '30d', rangos: ['7d', '30d', 'todo'],
        series: ORIGENES.map(([k, n, col]) => ({ id: k, nombre: t(n), color: col })),
        datos: Object.fromEntries(ORIGENES.map(([k]) => [k, serie.map(f => [f.dia, Math.max(0, f[k] || 0)])])),
        formato: v => fmt(v) + ' ' + t('bronze'), vacio: t('No movements yet.') });
      $('ec-ingresos-leyenda').replaceChildren();
      return;
    }
    medir('ec-ingresos');
    $('ec-ingresos-leyenda').replaceChildren(...ORIGENES.map(([k, n, col]) => { const s = el('span'); const i = el('i'); i.style.background = col; s.append(i, el('span', '', t(n))); return s; }));
    const svg = sv('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'ec-svg', role: 'img', 'aria-label': t('Game treasury income by day and source') });
    const totales = serie.map(f => ORIGENES.reduce((s, [k]) => s + Math.max(0, f[k] || 0), 0));
    const max = Math.max(1, ...totales);
    const paso = (ANCHO - IZQ - DER) / Math.max(1, serie.length), ancho = Math.max(4, paso - 4);
    const y = v => ARR + (1 - v / max) * (ALTO - ARR - ABA);
    for (let g = 0; g <= 3; g++) { const v = max * g / 3; svg.append(sv('line', { x1: IZQ, x2: ANCHO - DER, y1: y(v), y2: y(v), class: g ? 'ec-rejilla' : 'ec-eje' }), sv('text', { x: IZQ - 6, y: y(v) + 3, 'text-anchor': 'end' }, fmt(v))); }
    serie.forEach((f, i) => {
      const x = IZQ + i * paso + 2;
      let base = 0;
      const grupo = sv('g', {});
      ORIGENES.forEach(([k, , col]) => {
        const v = Math.max(0, f[k] || 0);
        if (!v) return;
        const y0 = y(base), y1 = y(base + v);
        // 2 px de hueco entre segmentos: se distinguen sin depender solo del color.
        grupo.append(sv('rect', { x, y: y1, width: ancho, height: Math.max(1, y0 - y1 - 2), rx: 2, fill: col }));
        base += v;
      });
      const hit = sv('rect', { x: x - 2, y: ARR, width: paso, height: ALTO - ARR - ABA, fill: 'transparent', class: 'ec-hit' });
      hit.append(sv('title', {}, diaCorto(f.dia) + ' — ' + ORIGENES.map(([k, n]) => t(n) + ': ' + fmt(f[k] || 0)).join(' · ') + (f.compras ? ' · ' + t('Gold purchases') + ': ' + f.compras : '')));
      grupo.append(hit);
      svg.append(grupo);
      const anclaI = fechaEnEje(i, serie.length);
      if (anclaI) svg.append(sv('text', { x: x + ancho / 2, y: ALTO - 6, 'text-anchor': anclaI }, diaCorto(f.dia)));
    });
    $('ec-ingresos').replaceChildren(svg);
  }

  function linea(serie, valor, etiqueta, opciones) {
    const svg = sv('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'ec-svg', role: 'img', 'aria-label': t(etiqueta) });
    const lineas = opciones.lineas;
    const todos = lineas.flatMap(l => serie.map(f => l.valor(f))).filter(v => v !== null && isFinite(v));
    if (!todos.length) { const s = el('div', 'tz-empty', t(opciones.vacio)); return s; }
    let min = Math.min(...todos, opciones.incluir !== undefined ? opciones.incluir : Infinity), max = Math.max(...todos, opciones.incluir !== undefined ? opciones.incluir : -Infinity);
    if (max - min < Math.abs(max) * 0.02 || max === min) { max = max * 1.02 + 1e-9; min = min * 0.98 - 1e-9; }
    const x = i => IZQ + (serie.length <= 1 ? (ANCHO - IZQ - DER) / 2 : i * (ANCHO - IZQ - DER) / (serie.length - 1));
    const y = v => ARR + (max - v) / (max - min) * (ALTO - ARR - ABA);
    for (let g = 0; g <= 3; g++) { const v = min + (max - min) * g / 3; svg.append(sv('line', { x1: IZQ, x2: ANCHO - DER, y1: y(v), y2: y(v), class: g ? 'ec-rejilla' : 'ec-eje' }), sv('text', { x: IZQ - 6, y: y(v) + 3, 'text-anchor': 'end' }, opciones.eje(v))); }
    lineas.forEach(l => {
      let dd = '';
      serie.forEach((f, i) => { const v = l.valor(f); if (v === null || !isFinite(v)) return; dd += (dd ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; });
      if (dd) svg.append(sv('path', { d: dd, fill: 'none', stroke: l.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    });
    // Varias líneas: todas continuas (nada de trazos ni puntos) y cada una con su
    // nombre al final, para que no la distinga solo el color.
    if (lineas.length > 1) {
      const finales = lineas.map(l => {
        for (let i = serie.length - 1; i >= 0; i--) { const v = l.valor(serie[i]); if (v !== null && isFinite(v)) return { l, y: y(v) - 5 < 10 ? y(v) + 13 : y(v) - 5 }; }
        return null;
      }).filter(Boolean).sort((a, b) => a.y - b.y);
      finales.forEach((f, k) => {
        if (k && f.y - finales[k - 1].y < 11) f.y = finales[k - 1].y + 11;
        svg.append(sv('text', { x: ANCHO - DER - 2, y: f.y, 'text-anchor': 'end' }, t(f.l.nombre)));
      });
    }
    serie.forEach((f, i) => {
      const hit = sv('rect', { x: x(i) - (ANCHO - IZQ - DER) / Math.max(2, serie.length) / 2, y: ARR, width: (ANCHO - IZQ - DER) / Math.max(1, serie.length), height: ALTO - ARR - ABA, fill: 'transparent', class: 'ec-hit' });
      hit.append(sv('title', {}, diaCorto(f.dia) + ' — ' + lineas.map(l => t(l.nombre) + ': ' + opciones.dato(l.valor(f))).join(' · ')));
      svg.append(hit);
      const anclaL = fechaEnEje(i, serie.length);
      if (anclaL) svg.append(sv('text', { x: x(i), y: ALTO - 6, 'text-anchor': anclaL }, diaCorto(f.dia)));
    });
    return svg;
  }
  function barrasInflacion(serie) {
    const v = serie.map(f => (f.inflacion1 === null || f.inflacion1 === undefined ? null : Number(f.inflacion1)));
    if (!v.some(a => a !== null)) return el('div', 'tz-empty', t('Inflation appears after the second day of data.'));
    const tope = Math.max(0.001, ...v.map(a => Math.abs(a || 0)));
    const svg = sv('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'ec-svg', role: 'img', 'aria-label': t('Daily inflation') });
    const cero = ARR + (ALTO - ARR - ABA) / 2, alto = (ALTO - ARR - ABA) / 2, paso = (ANCHO - IZQ - DER) / Math.max(1, v.length);
    svg.append(sv('line', { x1: IZQ, x2: ANCHO - DER, y1: cero, y2: cero, class: 'ec-eje' }), sv('text', { x: IZQ - 6, y: ARR + 8, 'text-anchor': 'end' }, pct(tope)),
               sv('text', { x: IZQ - 6, y: cero + 3, 'text-anchor': 'end' }, '0%'), sv('text', { x: IZQ - 6, y: ALTO - ABA, 'text-anchor': 'end' }, pct(-tope)));
    v.forEach((a, i) => {
      const x = IZQ + i * paso + 2;
      if (a !== null) {
        const h = Math.abs(a) / tope * alto;
        // Diverging: encima del cero (más monedas) naranja, debajo (menos) azul.
        svg.append(sv('rect', { x, y: a >= 0 ? cero - h : cero, width: Math.max(3, paso - 4), height: Math.max(1, h), rx: 2, fill: a >= 0 ? '#d95926' : '#3987e5' }));
      }
      const hit = sv('rect', { x: x - 2, y: ARR, width: paso, height: ALTO - ARR - ABA, fill: 'transparent', class: 'ec-hit' });
      hit.append(sv('title', {}, diaCorto(serie[i].dia) + ' — ' + (a === null ? t('no data') : pct(a))));
      svg.append(hit);
      const anclaB = fechaEnEje(i, v.length);
      if (anclaB) svg.append(sv('text', { x: x + paso / 2, y: ALTO - 6, 'text-anchor': anclaB }, diaCorto(serie[i].dia)));
    });
    return svg;
  }
  function pintarEconomia(e) {
    const s = SALUD[e.salud] || SALUD.sin_datos;
    $('ec-salud').replaceChildren(el('span', '', s[1] + ' ' + t(s[0])));
    $('ec-salud').dataset.on = String(e.salud === 'estable');
    const kpi = (v, k) => { const d = el('div', 'ec-kpi'); d.append(el('b', '', v), el('span', '', t(k))); return d; };
    $('ec-kpis').replaceChildren(
      kpi(zk(e.precioOro.zkltc) + ' zkLTC', 'Price of 1 Gold today'), kpi(pct(e.inflacion1), 'Inflation, 1 day'), kpi(pct(e.inflacion7), 'Inflation, 7 days'),
      kpi(fmt(e.tope), 'Daily Gold limit per player'), kpi(fmt(e.masa.oro), 'Gold in circulation'), kpi(fmt(e.masa.plata), 'Silver in circulation'),
      kpi(fmt(e.masa.bronce), 'Bronze in circulation'), kpi(fmt(e.masa.total), 'Total money (in bronze)'), kpi(fmt(e.masa.jugadores), 'Accounts'));
    const serie = e.serie || [];
    if (G) {
      if (e.ahora) G.reloj.ajustar(e.ahora);
      grafico('ec-g-precio', { etiqueta: t('Gold price in zkLTC'), hastaAhora: true, alto: 210,
        series: [{ id: 'precio', nombre: t('Gold price'), color: '#c98500', area: true, escalon: true }],
        datos: { precio: serie.filter(f => Number(f.precio) > 0).map(f => [cuandoFoto(f), Number(f.precio)]) },
        formato: v => zk(v) + ' zkLTC', vacio: t('No price history yet.') });
      grafico('ec-g-inflacion', { etiqueta: t('Inflation'), alto: 210, referencia: { valor: 0, nombre: '0%' },
        series: [{ id: 'dia', nombre: t('Daily'), color: '#3987e5' }, { id: 'neta', nombre: t('Net, 7 days'), color: '#d95926' }],
        datos: { dia: serie.filter(f => f.inflacion1 != null).map(f => [cuandoFoto(f), f.inflacion1 * 100]),
                 neta: serie.filter(f => f.inflacionNeta7 != null).map(f => [cuandoFoto(f), f.inflacionNeta7 * 100]) },
        formato: v => (v > 0 ? '+' : '') + Number(v).toFixed(3) + '%', vacio: t('Inflation appears after the second day of data.') });
      const base0 = k => { for (const f of serie) if (Number(f[k]) > 0) return Number(f[k]); return 0; };
      const indice = k => { const b = base0(k); return b ? serie.map(f => [cuandoFoto(f), (Number(f[k]) || 0) / b * 100]) : []; };
      grafico('ec-g-masa', { etiqueta: t('Coins in circulation, index'), alto: 210, referencia: { valor: 100, nombre: '100' },
        series: [{ id: 'oro', nombre: t('Gold'), color: '#c98500' }, { id: 'plata', nombre: t('Silver'), color: '#3987e5' }, { id: 'bronce', nombre: t('Bronze'), color: '#d95926' }],
        datos: { oro: indice('oro'), plata: indice('plata'), bronce: indice('bronce') },
        formato: v => fmt(v, 1), vacio: t('No coins in circulation yet.') });
      $('ec-g-masa-leyenda').replaceChildren();
      return;
    }
    medir('ec-g-precio');
    $('ec-g-precio').replaceChildren(linea(serie, null, 'Gold price in zkLTC', {
      lineas: [{ nombre: 'Gold price', color: '#c98500', valor: f => Number(f.precio) || null }], vacio: 'No price history yet.', eje: v => String(Number(v.toPrecision(3))), dato: v => zk(v) + ' zkLTC' }));
    medir('ec-g-inflacion');
    $('ec-g-inflacion').replaceChildren(barrasInflacion(serie));
    const base = k => { for (const f of serie) if (Number(f[k]) > 0) return Number(f[k]); return 0; };
    const bOro = base('oro'), bPlata = base('plata'), bBronce = base('bronce');
    const monedas = [{ nombre: 'Gold', color: '#c98500', valor: f => (bOro ? f.oro / bOro * 100 : null) },
                     { nombre: 'Silver', color: '#3987e5', valor: f => (bPlata ? f.plata / bPlata * 100 : null) },
                     { nombre: 'Bronze', color: '#d95926', valor: f => (bBronce ? f.bronce / bBronce * 100 : null) }];
    medir('ec-g-masa');
    $('ec-g-masa').replaceChildren(linea(serie, null, 'Coins in circulation, index', { lineas: monedas, incluir: 100, vacio: 'No coins in circulation yet.', eje: v => fmt(v), dato: v => (v === null ? '—' : fmt(v, 1)) }));
    $('ec-g-masa-leyenda').replaceChildren(...monedas.map(m => { const s = el('span'); const i = el('i'); i.style.background = m.color; s.append(i, el('span', '', t(m.nombre))); return s; }));
  }
  /* LAS RECARGAS (2026-10-27): "el registro de entrada de dinero y toda la información de recarga en el centro de control".
     Con el servidor nuevo, de /api/admin/economia/compras (búsqueda, estado, totales y "revisar en la cadena");
     con el de antes, las 40 de /api/admin/economia. */
  const compras = { q: '', estado: '', filas: null, resumen: null, recibido: 0, destino: '', nuevo: true };
  async function cargarCompras() {
    if (!compras.nuevo) { pintarCompras(); return; }
    const qs = new URLSearchParams();
    if (compras.q) qs.set('q', compras.q);
    if (compras.estado) qs.set('estado', compras.estado);
    try {
      const r = await session.request('/api/admin/economia/compras' + (qs.toString() ? '?' + qs : ''));
      compras.filas = r.compras || []; compras.resumen = r.resumen || []; compras.recibido = r.recibidoZk || 0; compras.destino = r.destino || '';
    } catch (e) {
      if (e && e.status === 404) { compras.nuevo = false; compras.filas = null; } else throw e;
    }
    pintarCompras();
  }
  function pintarCompras() {
    const explorer = 'https://liteforge.explorer.caldera.xyz/tx/';
    const lista = compras.filas || (datos && datos.compras) || [];
    const res = compras.resumen || [];
    const de = k => res.find(x => x.estado === k) || { n: 0, oro: 0, reclamadas: 0 };
    const kpi = (v, k) => { const d = el('div', 'ec-kpi'); d.append(el('b', '', v), el('span', '', t(k))); return d; };
    $('ec-c-kpis').hidden = !compras.filas;
    if (compras.filas) {
      $('ec-c-kpis').replaceChildren(kpi(zk(compras.recibido) + ' zkLTC', 'zkLTC received'), kpi(fmt(de('acreditada').n), 'Credited top-ups'),
        kpi(fmt(de('acreditada').oro), 'Gold credited'), kpi(fmt(de('pagada').n), 'Paid, waiting'), kpi(fmt(de('fallida').n), 'Failed'),
        kpi(fmt(res.reduce((s, x) => s + (x.reclamadas || 0), 0)), 'Claimed with a hash'));
      $('ec-c-destino').textContent = compras.destino ? t('Payments go to ') + compras.destino : '';
    }
    $('ec-compras').replaceChildren(tabla([{ t: 'When' }, { t: 'Player' }, { t: 'Gold', num: true }, { t: 'Quoted zkLTC', num: true }, { t: 'Paid zkLTC', num: true }, { t: 'State' }, { t: 'Transaction' }, { t: 'Action' }],
      lista.map(c => {
        let tx = '—';
        if (c.txHash && /^0x[0-9a-f]{64}$/.test(c.txHash)) {
          tx = el('span', 'ec-tx');
          const a = el('a', 'ec-mono', c.txHash.slice(0, 10) + '…'); a.href = explorer + c.txHash; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = c.txHash;
          const cp = el('button', 'ec-mini', t('Copy')); cp.type = 'button';
          cp.addEventListener('click', () => { try { navigator.clipboard.writeText(c.txHash).then(() => { cp.textContent = '✓'; setTimeout(() => { cp.textContent = t('Copy'); }, 1500); }); } catch (_) {} });
          tx.append(a, cp);
        }
        const estado = el('span', c.estado === 'acreditada' ? 'ec-estado-ok' : c.estado === 'fallida' ? 'ec-estado-mal' : '', t(ESTADOS[c.estado] || c.estado) + (c.motivo ? ' · ' + c.motivo : ''));
        const est = el('span', 'ec-celda'); est.append(estado);
        if (c.reclamada) est.append(el('small', '', t('claimed by the player with the hash')));
        if (c.revisadaPor) est.append(el('small', '', t('re-checked by') + ' ' + c.revisadaPor.slice(0, 6) + '…' + c.revisadaPor.slice(-4)));
        const quien = el('span', 'ec-celda');
        quien.append(el('b', '', c.username || c.playerName || '—'));
        if (c.address) quien.append(el('small', 'ec-mono', c.address.slice(0, 6) + '…' + c.address.slice(-4)));
        let accion = '—';
        if (compras.nuevo && c.estado !== 'acreditada' && c.txHash) {
          accion = el('button', 'ec-mini', t('Re-check on-chain')); accion.type = 'button';
          accion.addEventListener('click', async () => {
            if (ocupado) return;
            ocupado = true; accion.disabled = true; $('ec-c-estado').textContent = t('Checking the transaction…');
            try {
              const r = await session.request('/api/admin/economia/compras/' + encodeURIComponent(c.id) + '/revisar', { method: 'POST', body: '{}' });
              $('ec-c-estado').textContent = r && r.ok ? t('Credited: ') + fmt(r.oro) + ' ' + t('Gold') : t('Not credited.');
              ocupado = false; await cargarCompras();
            } catch (e) {
              $('ec-c-estado').textContent = e && e.status === 202 ? t('The transaction is not confirmed yet.') : ((e && (e.code || e.message)) || t('Could not check it.'));
            } finally { ocupado = false; if (accion.isConnected) accion.disabled = false; }
          });
        }
        return [fecha(c.t), quien, fmt(c.oroDado || c.oro), zk(c.zkltc), c.pagado ? zk(c.pagado) : '—', est, tx, accion];
      }), 'No Gold purchases yet.'));
  }

  // ── Las reglas del precio ─────────────────────────────────────────────────
  function rellenarForm(c, destino, delServidor) {
    $('ec-activa').checked = !!c.compraActiva;
    $('ec-base').value = c.precioBase; $('ec-sens').value = c.sensibilidad; $('ec-paso').value = (c.pasoMax * 100).toFixed(1);
    $('ec-tope').value = c.topeDiario; $('ec-topemin').value = c.topeMin; $('ec-min').value = c.minimoCompra; $('ec-cartera').value = c.cartera || '';
    $('ec-destino').textContent = destino ? t('Payments go to ') + destino + (delServidor ? ' ' + t('(server wallet)') : '') : t('No treasury wallet: purchases cannot open until one is set.');
  }
  function leerForm() {
    const n = id => Number($(id).value);
    const cartera = $('ec-cartera').value.trim();
    if (cartera && !/^0x[0-9a-fA-F]{40}$/.test(cartera)) throw new Error('The treasury wallet is not a valid address.');
    return { compraActiva: $('ec-activa').checked, precioBase: n('ec-base'), sensibilidad: n('ec-sens'), pasoMax: n('ec-paso') / 100,
             topeDiario: n('ec-tope'), topeMin: n('ec-topemin'), minimoCompra: n('ec-min'), cartera: cartera.toLowerCase() };
  }
  $('ec-form').addEventListener('input', () => { sucio = true; });
  $('ec-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (ocupado) return;
    const estado = $('ec-form-estado');
    try {
      const cfg = leerForm();
      ocupado = true; estado.textContent = t('Saving…');
      const r = await session.request('/api/admin/economia/config', { method: 'POST', body: JSON.stringify({ config: cfg }) });
      sucio = false; estado.textContent = t('Saved.');
      if (datos && r && r.config) datos.config = r.config;
      ocupado = false;
      await cargar();
    } catch (e) { estado.textContent = (e && e.message) || t('Could not save.'); }
    finally { ocupado = false; }
  });
  $('ec-foto').addEventListener('click', async () => {
    if (ocupado) return;
    ocupado = true; $('ec-form-estado').textContent = t('Taking a snapshot…');
    try { await session.request('/api/admin/economia/foto', { method: 'POST', body: '{}' }); $('ec-form-estado').textContent = t('Snapshot taken.'); ocupado = false; await cargar(); }
    catch (e) { $('ec-form-estado').textContent = (e && e.message) || t('Could not take the snapshot.'); }
    finally { ocupado = false; }
  });
  $('ec-ajuste').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (ocupado) return;
    const tipo = $('ec-aj-tipo').value, bronce = Math.floor(Number($('ec-aj-cantidad').value)), motivo = $('ec-aj-motivo').value.trim();
    const estado = $('ec-aj-estado');
    if (!(bronce >= 1)) { estado.textContent = t('Type an amount.'); return; }
    if (motivo.length < 3) { estado.textContent = t('Write a reason (3 characters or more).'); return; }
    ocupado = true; estado.textContent = t('Applying…');
    try {
      await session.request('/api/admin/tesoro-juego/ajuste', { method: 'POST', body: JSON.stringify({ tipo, bronce, motivo }) });
      estado.textContent = t('Done.'); $('ec-aj-cantidad').value = ''; $('ec-aj-motivo').value = '';
      ocupado = false; await cargar();
    } catch (e) { estado.textContent = e && e.code === 'saldo_insuficiente' ? t('The game treasury does not have that much.') : (e && e.message) || t('Could not apply.'); }
    finally { ocupado = false; }
  });

  // Al cambiar el ancho de la página se vuelven a dibujar los gráficos (no los datos).
  let anchoPintado = 0, vigiaReloj = 0;
  if (typeof root.ResizeObserver === 'function') {
    new root.ResizeObserver(() => {
      clearTimeout(vigiaReloj);
      vigiaReloj = setTimeout(() => {
        const w = $('ec-ingresos').clientWidth;
        if (!datos || cerrado || !w || Math.abs(w - anchoPintado) < 24) return;
        anchoPintado = w;
        pintarIngresos(datos.serieJuego || []); pintarEconomia(datos.economia);
      }, 150);
    }).observe($('ec-body'));
  }
  // (2026-10-27) Buscar y filtrar las recargas.
  $('ec-c-form').addEventListener('submit', ev => {
    ev.preventDefault();
    compras.q = $('ec-c-q').value.trim(); compras.estado = $('ec-c-est').value;
    cargarCompras().catch(e => { $('ec-c-estado').textContent = (e && e.message) || t('Could not load the top-ups.'); });
  });
  $('ec-connect').addEventListener('click', () => verificar(true));
  $('ec-refresh').addEventListener('click', () => cargar());
  root.addEventListener('pagehide', ev => { if (ev.persisted) return; cerrado = true; clearInterval(reloj); if (peticion) peticion.abort(); });
  verificar(false);
})(window);
