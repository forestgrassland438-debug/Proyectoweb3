/* =============================================================================
 * LA ECONOMÍA, 2.ª PARTE — en la herramienta "Economy & treasuries"  (2026-10-28)
 * -----------------------------------------------------------------------------
 * "Opciones para quemar tokens según el token, su cantidad y de qué tesorería;
 * que me refleje en tiempo real el porcentaje de inflación que bajaría mientras
 * escribo las cantidades; en cuánto valdrá el token de recarga y más datos
 * relevantes. El precio de la muerte en el centro de control, que suba y baje
 * con la inflación y vaya al fondo de reserva. Fundir y craftear con un precio
 * justo que corra con la economía."
 *
 * Lo que cuenta server2.js en "LA ECONOMÍA, 2.ª PARTE":
 *   GET  /api/admin/economia/v2             tesoros, índice, inflaciones, series, quemas, muerte, servicios
 *   POST /api/admin/economia/v2/config      índice, muerte, fundir y craftear
 *   POST /api/admin/economia/v2/recalcular  foto, índice y precios de hoy
 *   POST /api/admin/economia/quemar         { tesoro, moneda, cantidad, motivo }
 *   POST /api/admin/tesoro-reserva/ajuste   meter o sacar del fondo de reserva
 *
 * La proyección de la quema se calcula AQUÍ, con las mismas fórmulas que el
 * servidor (economiaPrecioGwei, eco2IndiceObjetivo), cada vez que se teclea.
 * Se carga cuando economia.js termina (evento 'gf-economia:cargada').
 * ========================================================================== */
(function (root) {
  'use strict';
  const ui = root.GFAdminUI, session = root.GFAdminSession, G = root.GFGraficos || null;
  const $ = id => document.getElementById(id);
  const t = s => (ui ? ui.t(s) : String(s));
  if (!ui || !session || !$('e2-quemar')) return;

  const POR = { oro: 1000000, plata: 1000, bronce: 1 };
  const TESOROS = { circular: 'Circular-economy treasury', juego: 'Game treasury', reserva: 'Reserve fund' };
  let datos = null, cargando = false, ocupado = false, sucio = false, cerrado = false;
  root.GFEconomia2 = Object.freeze({ status: () => (ocupado ? 'busy' : sucio ? 'dirty' : '') });

  const loc = () => (ui.language === 'es' ? 'es-EC' : 'en-US');
  const fmt = (n, d = 0) => new Intl.NumberFormat(loc(), { maximumFractionDigits: d }).format(Number(n) || 0);
  const pct = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
  const zk = n => fmt(n, Number(n) >= 1 ? 4 : 8);
  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = String(texto); return e; }
  function filas(destino, pares) { destino.replaceChildren(...pares.flatMap(([k, v]) => [el('span', '', t(k)), el('span', '', v)])); }
  const kpi = (v, k, nota) => { const d = el('div', 'ec-kpi'); d.append(el('b', '', v), el('span', '', t(k))); if (nota) d.append(el('small', 'e2-nota', nota)); return d; };

  // ── LAS FÓRMULAS (las mismas que server2.js) ──────────────────────────────
  function precioOroGwei(cfg, previoGwei, inf) {
    const base = cfg.precioBase * 1e9;
    const i = Number.isFinite(Number(inf)) && inf !== null ? Math.max(-0.5, Math.min(1.5, Number(inf))) : 0;
    const objetivo = base * (1 + i * cfg.sensibilidad);
    const previo = previoGwei > 0 ? previoGwei : base;
    return { objetivo, manana: Math.max(previo * (1 - cfg.pasoMax), Math.min(previo * (1 + cfg.pasoMax), objetivo)) };
  }
  function indiceObjetivo(cfg, previo, inf) {
    const p = Number(previo) > 0 ? Number(previo) : 1;
    const i = Number.isFinite(Number(inf)) && inf !== null ? Math.max(-0.5, Math.min(1.5, Number(inf))) : 0;
    const objetivo = Math.min(5, Math.max(0.2, 1 + i * cfg.sensibilidad));
    return { objetivo, manana: Math.max(p * (1 - cfg.pasoMax), Math.min(p * (1 + cfg.pasoMax), objetivo)) };
  }
  function precioMuerte(cfg, indice, n) {
    const f = Number(indice) > 0 ? Number(indice) : 1;
    return Math.max(1, Math.round(Math.min(cfg.muerteBase * f * Math.pow(cfg.muerteMultiplicador, n), cfg.muerteTope * f)));
  }

  // ── CARGAR ────────────────────────────────────────────────────────────────
  function aviso(texto) { const n = $('e2-aviso'); if (n) { n.hidden = !texto; n.textContent = texto ? t(texto) : ''; } }
  async function cargar() {
    if (cargando || cerrado) return;
    cargando = true;
    try {
      const d = await session.request('/api/admin/economia/v2');
      if (!d || !d.ok) throw new Error('The server answered without economy data.');
      datos = d; aviso('');
      if (G && d.ahora) G.reloj.ajustar(d.ahora);
      pintar();
    } catch (e) {
      aviso(e && e.status === 404 ? 'This backend does not have the economy part 2 routes yet (burns, reserve fund, price index). Update server2.js.'
        : (e && e.message) || 'Could not load the economy part 2.');
    } finally { cargando = false; }
  }
  document.addEventListener('gf-economia:cargada', () => { if (!ocupado && !sucio) cargar(); });

  // ── PINTAR ────────────────────────────────────────────────────────────────
  function pintar() {
    const d = datos, tr = d.tesoros;
    $('e2-res-saldo').textContent = fmt(tr.reserva.saldo);
    filas($('e2-res-filas'), [
      ['From deaths (revives)', fmt(tr.reserva.ingresado.muerte || 0)], ['Deposited by admins', fmt(tr.reserva.ingresado.admin || 0)],
      ['Withdrawn', fmt(tr.reserva.retirado)], ['Burned', fmt(tr.reserva.quemado)],
      ['Death payments, 30 days', fmt(d.muerte.cobros30) + ' · ' + fmt(d.muerte.cobrado30) + ' ' + t('bronze')]
    ]);
    const h = d.hoy || {};
    $('e2-kpis').replaceChildren(
      kpi('×' + fmt(d.indice, 4), 'Price index today', d.indiceAyer ? t('yesterday ×') + fmt(d.indiceAyer, 4) : ''),
      kpi(pct(h.inflacionNeta7, 3), 'Net inflation, 7 days', t('drives prices')),
      kpi(pct(h.inflacionActiva7, 3), 'Active money inflation, 7 days', t('players + circular treasury')),
      kpi(pct(h.inflacionTotal7, 3), 'Total supply inflation, 7 days', t('every coin that exists')),
      kpi(fmt(h.masaActiva), 'Active money (bronze)'), kpi(fmt(h.masaTotal), 'Total supply (bronze)'),
      kpi(fmt(h.quemadoObjetos7), 'Items destroyed, 7 days (bronze value)'),
      kpi(fmt(tr.circular.quemado + tr.juego.quemado + tr.reserva.quemado), 'Coins burned from treasuries'));
    if (!sucio) rellenarConfig(d.config);
    pintarTablaMuerte();
    $('e2-ejemplos').replaceChildren(...(d.ejemplosServicio || []).map(x => el('span', 'tz-chip',
      (x.tipo === 'fundir' ? t('Smelt') : t('Craft')) + ' ' + x.itemId + ': ' + fmt(x.bronce) + ' ' + t('bronze'))));
    filas($('e2-serv-filas'), [
      ['Smelting fees, 30 days', fmt(d.servicios.fundir.n) + ' · ' + fmt(d.servicios.fundir.bronce) + ' ' + t('bronze')],
      ['Crafting fees, 30 days', fmt(d.servicios.craftear.n) + ' · ' + fmt(d.servicios.craftear.bronce) + ' ' + t('bronze')]
    ]);
    pintarQuemas();
    proyectar();
    pintarGraficos();
  }

  function pintarQuemas() {
    const ORIGEN = { admin: 'Burned from a treasury', monedas_caducadas: 'Monster coins nobody picked up', basura: 'Trash bin', suelo_caducado: 'Dropped item nobody picked up' };
    const tb = el('table', 'tz-table'), cab = el('thead'), tr = el('tr');
    ['When (UTC)', 'What', 'Treasury / item', 'Amount', 'Bronze value', 'Player / detail'].forEach((c, i) => { const th = el('th', i === 3 || i === 4 ? 'num' : '', t(c)); th.scope = 'col'; tr.append(th); });
    cab.append(tr); tb.append(cab);
    const cuerpo = el('tbody');
    const ultimas = (datos.quemas && datos.quemas.ultimas) || [];
    ultimas.forEach(q => {
      const r = el('tr');
      const cuando = G ? G.fechaHora(Date.parse(q.t), ui.language === 'es' ? 'es' : 'en') : new Date(q.t).toUTCString();
      [cuando, t(ORIGEN[q.origen] || q.origen), q.tipo === 'monedas' ? t(TESOROS[q.tesoro] || q.tesoro || '—') : (q.itemId || '—'),
       q.tipo === 'monedas' ? fmt(q.cantidad) + ' ' + t({ oro: 'Gold', plata: 'Silver', bronce: 'Bronze' }[q.moneda] || '') : fmt(q.cantidad),
       fmt(q.bronce), [q.playerName, q.detalle].filter(Boolean).join(' · ') || '—'].forEach((v, i) => r.append(el('td', i === 3 || i === 4 ? 'num' : '', v)));
      cuerpo.append(r);
    });
    tb.append(cuerpo);
    $('e2-quemas').replaceChildren(ultimas.length ? tb : el('div', 'tz-empty', t('Nothing burned yet.')));
    const por = (datos.quemas && datos.quemas.porOrigen) || [];
    $('e2-quemas-res').replaceChildren(...por.map(p => el('span', 'tz-chip', t(ORIGEN[p.origen] || p.origen) + ': ' + fmt(p.bronce) + ' ' + t('bronze') + ' · ' + fmt(p.n))));
  }

  // ── LA PROYECCIÓN DE LA QUEMA (en vivo) ───────────────────────────────────
  function leerQuema() {
    const tesoro = $('e2-q-tesoro').value, moneda = $('e2-q-moneda').value;
    const cantidad = Math.max(0, Math.floor(Number($('e2-q-cantidad').value) || 0));
    return { tesoro, moneda, cantidad, bronce: cantidad * (POR[moneda] || 0) };
  }
  function proyectar() {
    if (!datos) return;
    const q = leerQuema(), h = datos.hoy || {}, tr = datos.tesoros;
    const saldo = q.tesoro === 'circular' ? tr.circular.saldo : q.tesoro === 'juego' ? tr.juego.saldo : tr.reserva.saldo;
    const A = Number(h.masaActiva) || 0, S = Number(h.masaTotal) || 0;
    const a7 = h.inflacionActiva7, s7 = h.inflacionTotal7, n7 = h.inflacionNeta7;
    const A7 = a7 !== null && a7 !== undefined ? A / (1 + a7) : null;
    const S7 = s7 !== null && s7 !== undefined ? S / (1 + s7) : null;
    const quemaObj = a7 !== null && a7 !== undefined && n7 !== null && n7 !== undefined ? a7 - n7 : 0;
    const A2 = A - (q.tesoro === 'circular' ? q.bronce : 0), S2 = S - q.bronce;
    const a7b = A7 ? (A2 - A7) / A7 : null, s7b = S7 ? (S2 - S7) / S7 : null;
    const n7b = a7b === null ? null : a7b - quemaObj;
    const cfgOro = datos.proyeccion.cfgOro, cfg = datos.config;
    const oroHoy = Number(h.precioGwei) || 0;
    const oroA = precioOroGwei(cfgOro, oroHoy, n7), oroB = precioOroGwei(cfgOro, oroHoy, n7b);
    const idxA = indiceObjetivo(cfg, datos.indice, n7), idxB = indiceObjetivo(cfg, datos.indice, n7b);
    const pasa = q.bronce > saldo;
    const fila = (k, antes, despues, nota) => {
      const r = el('div', 'e2-proy-fila');
      r.append(el('span', '', t(k)), el('b', '', antes), el('span', 'e2-flecha', '→'), el('b', '', despues));
      if (nota) r.append(el('small', '', nota));
      return r;
    };
    const delta = (a, b) => (a === null || b === null ? '' : t('change ') + pct(b - a, 5));
    $('e2-proy').replaceChildren(
      fila('Burn', fmt(q.cantidad) + ' ' + t({ oro: 'Gold', plata: 'Silver', bronce: 'Bronze' }[q.moneda]), fmt(q.bronce) + ' ' + t('bronze'),
        saldo > 0 ? pct(q.bronce / saldo, 2) + ' ' + t('of the treasury balance') : t('the treasury is empty')),
      fila('Net inflation, 7 days (drives prices)', pct(n7, 5), pct(n7b, 5), delta(n7, n7b)),
      fila('Active money inflation, 7 days', pct(a7, 5), pct(a7b, 5), q.tesoro === 'circular' ? delta(a7, a7b)
        : t('Game and reserve funds are already out of circulation: burning them lowers the total supply, not the money players hold.')),
      fila('Total supply inflation, 7 days', pct(s7, 5), pct(s7b, 5), delta(s7, s7b)),
      fila('Top-up Gold price, tomorrow (zkLTC)', zk(oroA.manana / 1e9), zk(oroB.manana / 1e9), t('target ') + zk(oroB.objetivo / 1e9) + ' zkLTC'),
      fila('Shop price index, tomorrow', '×' + fmt(idxA.manana, 4), '×' + fmt(idxB.manana, 4), t('target ×') + fmt(idxB.objetivo, 4))
    );
    $('e2-q-saldo').textContent = t('Balance: ') + fmt(saldo) + ' ' + t('bronze') + ' (' + fmt(Math.floor(saldo / (POR[q.moneda] || 1))) + ' ' +
      t({ oro: 'Gold', plata: 'Silver', bronce: 'Bronze' }[q.moneda]) + ')';
    $('e2-q-go').disabled = ocupado || !(q.cantidad >= 1) || pasa;
    $('e2-q-estado').textContent = pasa ? t('The treasury does not have that much.') : '';
  }
  ['e2-q-tesoro', 'e2-q-moneda', 'e2-q-cantidad'].forEach(id => { $(id).addEventListener('input', proyectar); $(id).addEventListener('change', proyectar); });
  $('e2-q-todo').addEventListener('click', () => {
    if (!datos) return;
    const q = leerQuema(), tr = datos.tesoros;
    const saldo = q.tesoro === 'circular' ? tr.circular.saldo : q.tesoro === 'juego' ? tr.juego.saldo : tr.reserva.saldo;
    $('e2-q-cantidad').value = String(Math.floor(saldo / (POR[q.moneda] || 1)));
    proyectar();
  });
  $('e2-quemar').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (ocupado || !datos) return;
    const q = leerQuema(), motivo = $('e2-q-motivo').value.trim(), estado = $('e2-q-estado');
    if (!(q.cantidad >= 1)) { estado.textContent = t('Type an amount.'); return; }
    if (motivo.length < 3) { estado.textContent = t('Write a reason (3 characters or more).'); return; }
    const texto = t('Burn') + ' ' + fmt(q.cantidad) + ' ' + t({ oro: 'Gold', plata: 'Silver', bronce: 'Bronze' }[q.moneda]) + ' (' + fmt(q.bronce) + ' ' + t('bronze') + ') ' +
      t('from the') + ' ' + t(TESOROS[q.tesoro]) + '?\n' + t('This cannot be undone: the coins are destroyed.');
    if (!root.confirm(texto)) return;
    ocupado = true; estado.textContent = t('Burning…'); $('e2-q-go').disabled = true;
    try {
      const r = await session.request('/api/admin/economia/quemar', { method: 'POST', body: JSON.stringify({ tesoro: q.tesoro, moneda: q.moneda, cantidad: q.cantidad, motivo }) });
      estado.textContent = t('Burned: ') + fmt(r.bronce) + ' ' + t('bronze') + '.';
      $('e2-q-cantidad').value = ''; $('e2-q-motivo').value = '';
      ocupado = false; await cargar();
    } catch (e) {
      estado.textContent = e && e.code === 'saldo_insuficiente' ? t('The treasury does not have that much.') : (e && (e.message || e.code)) || t('Could not burn.');
    } finally { ocupado = false; proyectar(); }
  });

  // ── LA CONFIGURACIÓN (índice, muerte, fundir, craftear) ───────────────────
  const CAMPOS = [
    ['e2-c-sens', 'sensibilidad', 1], ['e2-c-paso', 'pasoMax', 100], ['e2-c-demanda', 'demanda', 100], ['e2-c-peso', 'pesoObjetos', 100],
    ['e2-c-mbase', 'muerteBase', 1], ['e2-c-mmult', 'muerteMultiplicador', 1], ['e2-c-mtope', 'muerteTope', 1],
    ['e2-c-ftasa', 'fundirTasa', 100], ['e2-c-fmin', 'fundirMin', 1], ['e2-c-ctasa', 'craftearTasa', 100], ['e2-c-cmin', 'craftearMin', 1]
  ];
  function rellenarConfig(c) {
    $('e2-c-activo').checked = !!c.indiceActivo;
    CAMPOS.forEach(([id, k, f]) => { $(id).value = String(Math.round(c[k] * f * 1000) / 1000); });
  }
  function leerConfig() {
    const c = { indiceActivo: $('e2-c-activo').checked };
    CAMPOS.forEach(([id, k, f]) => { c[k] = Number($(id).value) / f; });
    return c;
  }
  function pintarTablaMuerte() {
    if (!datos) return;
    const c = Object.assign({}, datos.config, sucio ? leerConfig() : {});
    const idx = c.indiceActivo ? datos.indice : 1;
    const tb = el('table', 'tz-table'), cab = el('thead'), fila = el('tr');
    [t('Death in 24 h'), t('Revive cost (silver)'), t('In bronze')].forEach((x, i) => { const th = el('th', i ? 'num' : '', x); th.scope = 'col'; fila.append(th); });
    cab.append(fila); tb.append(cab);
    const cuerpo = el('tbody');
    for (let n = 0; n <= 6; n++) {
      const p = precioMuerte(c, idx, n), r = el('tr');
      r.append(el('td', '', '#' + (n + 1)), el('td', 'num', fmt(p)), el('td', 'num', fmt(p * 1000)));
      cuerpo.append(r);
    }
    tb.append(cuerpo);
    $('e2-muerte-tabla').replaceChildren(tb);
  }
  $('e2-config').addEventListener('input', () => { sucio = true; pintarTablaMuerte(); });
  $('e2-config').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (ocupado) return;
    const estado = $('e2-c-estado');
    ocupado = true; estado.textContent = t('Saving…');
    try {
      const r = await session.request('/api/admin/economia/v2/config', { method: 'POST', body: JSON.stringify({ config: leerConfig() }) });
      sucio = false; estado.textContent = t('Saved. Death, smelting and crafting prices use it now; shop prices follow at the next daily snapshot or when you recalculate.');
      if (datos && r && r.config) datos.config = r.config;
      ocupado = false; await cargar();
    } catch (e) { estado.textContent = (e && e.message) || t('Could not save.'); }
    finally { ocupado = false; }
  });
  $('e2-recalcular').addEventListener('click', async () => {
    if (ocupado) return;
    if (!root.confirm(t('Recalculate today\'s price index and every shop price now? Players see the new prices the next time they open the shop.'))) return;
    const estado = $('e2-c-estado');
    ocupado = true; estado.textContent = t('Recalculating…');
    try {
      const r = await session.request('/api/admin/economia/v2/recalcular', { method: 'POST', body: '{}' });
      estado.textContent = t('Done. Price index ×') + fmt(r.indice, 4);
      ocupado = false; await cargar();
    } catch (e) { estado.textContent = (e && e.message) || t('Could not recalculate.'); }
    finally { ocupado = false; }
  });

  // ── EL FONDO DE RESERVA: meter o sacar ────────────────────────────────────
  $('e2-res-ajuste').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (ocupado) return;
    const tipo = $('e2-r-tipo').value, bronce = Math.floor(Number($('e2-r-cantidad').value)), motivo = $('e2-r-motivo').value.trim();
    const estado = $('e2-r-estado');
    if (!(bronce >= 1)) { estado.textContent = t('Type an amount.'); return; }
    if (motivo.length < 3) { estado.textContent = t('Write a reason (3 characters or more).'); return; }
    ocupado = true; estado.textContent = t('Applying…');
    try {
      await session.request('/api/admin/tesoro-reserva/ajuste', { method: 'POST', body: JSON.stringify({ tipo, bronce, motivo }) });
      estado.textContent = t('Done.'); $('e2-r-cantidad').value = ''; $('e2-r-motivo').value = '';
      ocupado = false; await cargar();
    } catch (e) { estado.textContent = e && e.code === 'saldo_insuficiente' ? t('The reserve fund does not have that much.') : (e && e.message) || t('Could not apply.'); }
    finally { ocupado = false; }
  });

  // ── LOS GRÁFICOS ──────────────────────────────────────────────────────────
  const vivos = {};
  function grafico(id, op) {
    const caja = $(id);
    if (!caja || !G) return;
    if (vivos[id]) { vivos[id].actualizar({ series: op.series, datos: op.datos, referencia: op.referencia }); return; }
    vivos[id] = G.crear(caja, Object.assign({ idioma: ui.language === 'es' ? 'es' : 'en', alto: 230, rango: '30d', rangos: ['7d', '30d', '90d', 'todo'] }, op));
  }
  function pintarGraficos() {
    const serie = datos.serie || [];
    const de = (k, f = 1) => serie.filter(x => x[k] !== null && x[k] !== undefined && isFinite(Number(x[k]))).map(x => [x.dia, Number(x[k]) * f]);
    grafico('e2-g-indice', { etiqueta: t('Price index'), series: [{ id: 'i', nombre: t('Price index'), color: '#3987e5', escalon: true, area: true }],
      datos: { i: de('indice') }, referencia: { valor: 1, nombre: t('default prices') }, formato: v => '×' + fmt(v, 4), vacio: t('The index starts with the first daily snapshot.') });
    grafico('e2-g-infl', { etiqueta: t('Inflation, 7 days'), referencia: { valor: 0, nombre: '0%' },
      series: [{ id: 'n', nombre: t('Net'), color: '#d95926' }, { id: 'a', nombre: t('Active money'), color: '#3987e5' }, { id: 's', nombre: t('Total supply'), color: '#199e70' }],
      datos: { n: de('inflacionNeta7', 100), a: de('inflacionActiva7', 100), s: de('inflacionTotal7', 100) },
      formato: v => (v > 0 ? '+' : '') + Number(v).toFixed(3) + '%', vacio: t('Inflation appears after the second day of data.') });
    grafico('e2-g-tesoros', { etiqueta: t('Treasury balances'),
      series: [{ id: 'c', nombre: t('Circular'), color: '#3987e5' }, { id: 'j', nombre: t('Game'), color: '#d95926' }, { id: 'r', nombre: t('Reserve'), color: '#199e70' }],
      datos: { c: de('tesoroCircular'), j: de('tesoroJuego'), r: de('tesoroReserva') }, incluirCero: true,
      formato: v => fmt(v) + ' ' + t('bronze'), vacio: t('No treasury history yet.') });
    grafico('e2-g-sumideros', { tipo: 'barras', etiqueta: t('Burns and sinks per day'), rangos: ['7d', '30d', 'todo'],
      series: [{ id: 'qm', nombre: t('Coins burned'), color: '#d95926' }, { id: 'qo', nombre: t('Items destroyed'), color: '#9085e9' },
               { id: 'm', nombre: t('Deaths → reserve'), color: '#d55181' }, { id: 's', nombre: t('Smelting & crafting'), color: '#199e70' }],
      datos: { qm: de('quemadoMonedas'), qo: de('quemadoObjetos'), m: de('muerteBronce'), s: de('serviciosBronce') },
      formato: v => fmt(v) + ' ' + t('bronze'), vacio: t('Nothing burned or collected yet.') });
  }

  root.addEventListener('pagehide', ev => { if (ev.persisted) return; cerrado = true; Object.values(vivos).forEach(g => { try { g.destruir(); } catch (_) {} }); });
})(window);
