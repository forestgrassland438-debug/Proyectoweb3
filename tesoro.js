/* =============================================================================
 * EL TESORO — panel del centro de control (tesoro.html)            (2026-10-22)
 * -----------------------------------------------------------------------------
 * Lo que cuenta server2.js en "EL TESORO Y SUS INCENTIVOS":
 *   GET  /api/admin/tesoro          saldo, serie de 30 días, free/VIP, mapas…
 *   POST /api/admin/tesoro/config   modo automático/manual y los números del reparto
 *   POST /api/admin/tesoro/ajuste   meter o sacar monedas a mano (con motivo)
 *
 * Todo en BRONCE (1 plata = 1.000, 1 oro = 1.000.000).
 *
 * LAS CUENTAS de la tabla "lo que gana un jugador" son una COPIA de las del
 * servidor (tesoroNormalizarConfig, tesoroProbabilidad, tesoroCantidad): así
 * se ve el efecto de un cambio ANTES de guardarlo. tools/tesoro.test.cjs
 * comprueba que dan lo mismo; si se toca una, hay que tocar la otra.
 *
 * Sin fugas: los escuchadores se ponen UNA vez sobre nodos fijos (los gráficos
 * se redibujan enteros y el tooltip escucha por delegación), la petición en
 * curso se aborta al salir y el refresco automático se para al cerrar.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ── Las cuentas (las mismas que server2.js) ───────────────────────────────
  const PROB_MAX = 0.75;
  const BASE = Object.freeze({
    activo: true,
    modo: 'auto',
    manual: Object.freeze({ free: 5, vip: 10, conBonos: false }),
    auto: Object.freeze({ baseFree: 4, baseVip: 7, porNivel: 0.25, nivelTope: 40, rachaPaso: 0.5, rachaTope: 6 }),
    parteDelTesoro: 0.25,
    pagoMin: 100,
    pagoMax: 250000,
    vipExtraPago: 1.5,
    topeDiario: 25
  });
  const BRONCE_POR = Object.freeze({ bronce: 1, plata: 1000, oro: 1000000 });
  const NIVELES_EJEMPLO = Object.freeze([1, 4, 7, 10, 20, 40]);

  /** Copia de tesoroNormalizarConfig: cualquier configuración, acotada a lo que tiene sentido. */
  function normalizar(c) {
    const B = BASE, src = (c && typeof c === 'object') ? c : {};
    const num = (v, def, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
    const m = src.manual && typeof src.manual === 'object' ? src.manual : {};
    const a = src.auto && typeof src.auto === 'object' ? src.auto : {};
    const out = {
      activo: typeof src.activo === 'boolean' ? src.activo : B.activo,
      modo: src.modo === 'manual' ? 'manual' : 'auto',
      manual: { free: num(m.free, B.manual.free, 0, 75), vip: num(m.vip, B.manual.vip, 0, 75),
                conBonos: typeof m.conBonos === 'boolean' ? m.conBonos : B.manual.conBonos },
      auto: { baseFree: num(a.baseFree, B.auto.baseFree, 0, 50), baseVip: num(a.baseVip, B.auto.baseVip, 0, 50),
              porNivel: num(a.porNivel, B.auto.porNivel, 0, 2), nivelTope: Math.round(num(a.nivelTope, B.auto.nivelTope, 1, 150)),
              rachaPaso: num(a.rachaPaso, B.auto.rachaPaso, 0, 5), rachaTope: num(a.rachaTope, B.auto.rachaTope, 0, 30) },
      parteDelTesoro: num(src.parteDelTesoro, B.parteDelTesoro, 0.01, 5),
      pagoMin: Math.round(num(src.pagoMin, B.pagoMin, 1, 1000000)),
      pagoMax: Math.round(num(src.pagoMax, B.pagoMax, 1, 1e12)),
      vipExtraPago: num(src.vipExtraPago, B.vipExtraPago, 1, 5),
      topeDiario: Math.round(num(src.topeDiario, B.topeDiario, 1, 500))
    };
    if (out.pagoMax < out.pagoMin) out.pagoMax = out.pagoMin;
    return out;
  }
  /** Copia de tesoroProbabilidad: 0..PROB_MAX por monstruo. */
  function probabilidad(cfg, o) {
    const a = cfg.auto, nivel = Math.max(0, Number(o.nivel) || 0), racha = Math.max(0, Number(o.racha) || 0);
    const bonos = Math.min(nivel, a.nivelTope) * a.porNivel + Math.min(racha * a.rachaPaso, a.rachaTope);
    let pct;
    if (cfg.modo === 'manual') pct = (o.vip ? cfg.manual.vip : cfg.manual.free) + (cfg.manual.conBonos ? bonos : 0);
    else pct = (o.vip ? a.baseVip : a.baseFree) + bonos;
    if (o.jefe) pct *= 2;
    return Math.max(0, Math.min(PROB_MAX, pct / 100));
  }
  /** Copia de tesoroCantidad: bronce entero. `azar` en 0..1. */
  function cantidad(cfg, saldo, o, azar) {
    const r = Number.isFinite(azar) ? azar : Math.random();
    const dureza = Math.min(4, Math.max(0.6, (Number(o.exp) || 100) / 150));
    const nivel = Math.max(0, Math.min(40, Number(o.nivel) || 0));
    let c = Math.max(0, Number(saldo) || 0) * (cfg.parteDelTesoro / 100) * dureza *
            (o.vip ? cfg.vipExtraPago : 1) * (1 + nivel * 0.02) * (o.jefe ? 2.5 : 1) * (0.7 + 0.6 * r);
    c = Math.min(c, cfg.pagoMax, Math.max(0, Number(saldo) || 0));
    return Math.floor(c);
  }
  function aBronce(n, moneda) { return Math.floor(Number(n) || 0) * (BRONCE_POR[moneda] || 1); }
  /** El bronce partido en oro, plata y bronce. */
  function monedas(b) {
    const n = Math.max(0, Math.floor(Number(b) || 0));
    return { oro: Math.floor(n / 1000000), plata: Math.floor((n % 1000000) / 1000), bronce: n % 1000 };
  }

  const Calc = Object.freeze({ PROB_MAX, BASE, BRONCE_POR, NIVELES_EJEMPLO, normalizar, probabilidad, cantidad, aBronce, monedas });
  // En Node (tools/tesoro.test.cjs) solo interesan las cuentas.
  if (typeof module === 'object' && module && module.exports) { module.exports = Calc; return; }
  root.GFTesoroCalc = Calc;

  // ── La página ─────────────────────────────────────────────────────────────
  const ui = root.GFAdminUI, session = root.GFAdminSession;
  const $ = id => document.getElementById(id);
  const t = s => (ui ? ui.t(s) : String(s));
  if (!ui || !session) {
    const m = $('tz-gate-msg');
    if (m) { m.textContent = 'The administration suite did not load. Reload the page.'; m.dataset.error = 'true'; }
    return;
  }

  let verificado = false, cerrado = false, cargando = false, ocupado = false, sucio = false;
  let datos = null, cfgServidor = null, peticion = null, reloj = 0, ultimaCarga = 0, verTabla = false;
  let quitarSesion = null, tipDia = -1, anchoFlujo = 0, rafFlujo = 0;

  // admin-suite.js pregunta por GFTreasuryLifecycle para el "cambios sin guardar" y para no dejar salir a medias.
  root.GFTreasuryLifecycle = Object.freeze({ status: () => (ocupado ? 'busy' : sucio ? 'dirty' : '') });

  // ── Formatos (según el idioma elegido) ────────────────────────────────────
  let formatos = null;
  function fmtos() {
    const loc = ui.language === 'es' ? 'es-EC' : 'en-US';
    if (!formatos || formatos.loc !== loc) {
      formatos = {
        loc,
        n: new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }),
        c: new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 }),
        p: new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 }),
        dia: new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        diaLargo: new Intl.DateTimeFormat(loc, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
        fecha: new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short' }),
        hora: new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' })
      };
    }
    return formatos;
  }
  const fmt = n => fmtos().n.format(Math.round(Number(n) || 0));
  const fmtC = n => fmtos().c.format(Number(n) || 0);
  const pct = x => fmtos().p.format(Math.max(0, Number(x) || 0));
  const signo = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  const fechaDia = d => new Date(d + 'T00:00:00Z');
  function cuando(f) {
    const d = new Date(f);
    if (isNaN(d)) return '—';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return t('just now');
    if (s < 3600) return t(Math.floor(s / 60) + ' min ago');
    if (s < 86400) return t(Math.floor(s / 3600) + ' h ago');
    if (s < 604800) return t(Math.floor(s / 86400) + ' d ago');
    return fmtos().fecha.format(d);
  }

  // ── Piezas de DOM (siempre textContent: nada de innerHTML con datos) ──────
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = String(texto);
    return e;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    return e;
  }
  /** cols: [{ t, num }]; filas: celdas texto o nodo. */
  function hacerTabla(cols, filas, vacio, pie) {
    if (!filas.length) return el('div', 'tz-empty', t(vacio));
    const tabla = el('table', 'tz-table'), cab = el('thead'), tr = el('tr');
    cols.forEach(c => { const h = el('th', c.num ? 'num' : '', t(c.t)); h.scope = 'col'; tr.append(h); });
    cab.append(tr); tabla.append(cab);
    const cuerpo = el('tbody');
    const fila = (celdas, destino) => {
      const r = el('tr');
      celdas.forEach((v, i) => {
        const d = el('td', cols[i] && cols[i].num ? 'num' : '');
        if (v instanceof Node) d.append(v); else d.textContent = v == null || v === '' ? '—' : String(v);
        r.append(d);
      });
      destino.append(r);
    };
    filas.forEach(f => fila(f, cuerpo));
    tabla.append(cuerpo);
    if (pie) { const tf = el('tfoot'); fila(pie, tf); tabla.append(tf); }
    return tabla;
  }
  function etiqueta(texto) { return el('span', 'tz-tag', t(texto)); }

  // ── La puerta ─────────────────────────────────────────────────────────────
  function mensajePuerta(texto, error) {
    const m = $('tz-gate-msg');
    m.textContent = t(texto);
    m.dataset.error = String(!!error);
  }
  function errorDeAcceso(e) {
    if (e && e.code === 4001) return 'Signature rejected.';
    if (e && (e.code === 'not_admin' || e.status === 403)) return 'Your wallet is not an administrator.';
    if (e && (e.status === 503 || e.status === 429)) return 'The API could not verify your role. Retry verification without signing again.';
    if (e && e.status === 401) return 'Your session expired. Connect again.';
    if (e && e.name === 'AbortError') return 'Requests were cancelled because the session changed.';
    if (e instanceof TypeError) return 'Connection unavailable. Check that your backend is running.';
    return (e && e.message) || 'Session could not be verified.';
  }
  function abortar() { if (peticion) { peticion.abort(); peticion = null; } }
  function aPuerta(motivo, error) {
    verificado = false;
    pararReloj(); abortar(); ocultarTip();
    $('tz-app').hidden = true; $('tz-gate').hidden = false; $('tz-connect').disabled = false;
    if (motivo) mensajePuerta(motivo, error);
  }
  async function verificar(interactivo) {
    if (cerrado) return;
    $('tz-connect').disabled = true;
    try {
      const yo = interactivo ? await session.signIn(m => mensajePuerta(m)) : await session.request('/api/admin/whoami');
      if (!/^0x[0-9a-f]{40}$/i.test((yo && yo.address) || '')) throw new Error('This account has no administrator permission.');
      if (cerrado) return;
      verificado = true;
      $('tz-gate').hidden = true; $('tz-app').hidden = false;
      armarReloj();
      await cargar();
    } catch (e) {
      if (cerrado) return;
      if (!interactivo && e && e.status === 401) aPuerta('Connect your administrator wallet to continue.', false);
      else aPuerta(errorDeAcceso(e), true);
    } finally {
      if (!cerrado) $('tz-connect').disabled = false;
    }
  }

  // ── Cargar ────────────────────────────────────────────────────────────────
  function aviso(texto) {
    const n = $('tz-notice');
    n.hidden = !texto;
    n.textContent = texto ? t(texto) : '';
  }
  function pintarHora() {
    $('tz-updated').textContent = ultimaCarga ? t('Last updated · ' + fmtos().hora.format(new Date(ultimaCarga))) : t('No data loaded');
  }
  async function cargar() {
    if (!verificado || cargando || cerrado) return;
    cargando = true;
    $('tz-refresh').disabled = true;
    $('tz-body').classList.add('tz-loading');
    const ctl = new AbortController();
    peticion = ctl;
    try {
      const d = await session.request('/api/admin/tesoro', { signal: ctl.signal });
      if (cerrado || ctl.signal.aborted) return;
      if (!d || !d.tesoro || !Array.isArray(d.serie)) throw new Error('The server answered without treasury data.');
      datos = d;
      ultimaCarga = Date.now();
      aviso('');
      pintar();
      pintarHora();
    } catch (e) {
      if (cerrado || (e && e.name === 'AbortError')) return;
      if (e && (e.status === 401 || e.status === 403 || e.code === 'not_admin')) { aPuerta(errorDeAcceso(e), true); return; }
      if (e && e.status === 404) aviso('This game server does not have the treasury yet. Deploy the latest backend and refresh.');
      else aviso(datos ? 'Refresh failed. The previous snapshot is still displayed.' : 'Data could not be loaded.');
      $('tz-body').hidden = !datos;
    } finally {
      if (peticion === ctl) peticion = null;
      cargando = false;
      if (!cerrado) { $('tz-refresh').disabled = false; $('tz-body').classList.remove('tz-loading'); }
    }
  }
  function armarReloj() {
    pararReloj();
    reloj = root.setInterval(() => {
      if (verificado && !ocupado && document.visibilityState === 'visible') cargar();
    }, 60000);
  }
  function pararReloj() { if (reloj) { root.clearInterval(reloj); reloj = 0; } }
  function alCambiarVisibilidad() {
    if (document.visibilityState === 'visible' && verificado && !ocupado && Date.now() - ultimaCarga > 60000) cargar();
  }

  // ── Pintar ────────────────────────────────────────────────────────────────
  function pintar() {
    if (!datos) return;
    $('tz-body').hidden = false;
    cfgServidor = normalizar(datos.config);
    pintarSaldo();
    pintarFichas();
    pintarFlujo();
    pintarGente();
    pintarMapas();
    pintarTop();
    pintarMovs();
    if (!sucio && !ocupado) llenarForm(cfgServidor);
    else revisarForm();
  }

  function pintarSaldo() {
    const tz = datos.tesoro, m = monedas(tz.saldo), cfg = cfgServidor || normalizar(datos.config);
    $('tz-saldo').textContent = fmt(tz.saldo);
    const cajas = $('tz-monedas');
    cajas.replaceChildren();
    [['oro', 'gold'], ['plata', 'silver'], ['bronce', 'bronze']].forEach(([k, nombre]) => {
      const s = el('span'), b = el('b', '', fmt(m[k]));
      s.append(b, document.createTextNode(' ' + t(nombre)));
      cajas.append(s);
    });
    const chip = $('tz-chip-activo');
    chip.dataset.on = String(!!cfg.activo);
    chip.querySelector('span').textContent = t(cfg.activo ? 'Incentives on' : 'Incentives off');
    $('tz-chip-modo').querySelector('span').textContent = t(cfg.modo === 'manual' ? 'Manual mode' : 'Automatic mode');
  }

  const suma = (serie, k) => serie.reduce((a, d) => a + (Number(d[k]) || 0), 0);

  function pintarFichas() {
    const tz = datos.tesoro, s = datos.serie;
    const fichas = [
      ['Fees · 30 days', suma(s, 'tienda') + suma(s, 'p2p'), true, [['Shop', suma(s, 'tienda'), true], ['P2P', suma(s, 'p2p'), true]]],
      ['Paid out · 30 days', suma(s, 'pagoFree') + suma(s, 'pagoVip'), true, [['Prizes', suma(s, 'premios'), false]]],
      ['Reserved in drops', tz.reservado, true, 'Dropped but not picked up yet'],
      ['Income, all time', tz.ingresado.tienda + tz.ingresado.p2p + tz.ingresado.admin, true, [['Admin deposits', tz.ingresado.admin, true]]],
      ['Paid out, all time', tz.pagado.free + tz.pagado.vip, true, [['Prizes', tz.pagos.free + tz.pagos.vip, false]]],
      ['Withdrawn by admins', tz.retirado, true, [['Expired drops returned', tz.caducados, false]]]
    ];
    const host = $('tz-tiles');
    host.replaceChildren();
    fichas.forEach(([nombre, valor, enBronce, pie]) => {
      const f = el('div', 'tz-tile');
      const v = el('div', 'tz-tile-value', fmt(valor));
      if (enBronce) v.append(document.createTextNode(' '), el('small', 'tz-muted', 'BR'));
      const p = el('div', 'tz-tile-foot');
      if (typeof pie === 'string') p.textContent = t(pie);
      else pie.forEach(([k, n, br], i) => {
        if (i) p.append(document.createTextNode(' · '));
        p.append(document.createTextNode(t(k) + ' '), el('b', '', fmt(n) + (br ? ' BR' : '')));
      });
      f.append(el('div', 'tz-tile-label', t(nombre)), v, p);
      host.append(f);
    });
  }

  // ── Entra y sale: columnas divergentes apiladas ───────────────────────────
  const SERIES = Object.freeze([
    { k: 'tienda', nombre: 'Game shop fees', clase: 'f1', sw: 's1', sube: true },
    { k: 'p2p', nombre: 'P2P market fees', clase: 'f2', sw: 's2', sube: true },
    { k: 'pagoFree', nombre: 'Paid to free players', clase: 'f3', sw: 's3', sube: false },
    { k: 'pagoVip', nombre: 'Paid to VIP players', clase: 'f4', sw: 's4', sube: false }
  ]);
  function pasoBonito(x) {
    if (!(x > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p);
  }
  /** Rectángulo con las dos esquinas del extremo de datos redondeadas (r 4) y el otro lado recto. */
  function barra(x, y, w, h, r, arriba) {
    r = Math.max(0, Math.min(r, w / 2, h));
    if (arriba) return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
    return 'M' + x + ',' + y + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - r) + 'V' + y + 'Z';
  }
  function pintarFlujo() {
    ocultarTip();
    const host = $('tz-flujo'), tablaHost = $('tz-flujo-tabla');
    host.hidden = verTabla; tablaHost.hidden = !verTabla;
    if (verTabla) { pintarFlujoTabla(); return; }
    host.replaceChildren();
    const serie = datos.serie, n = serie.length;
    const sube = serie.map(d => (Number(d.tienda) || 0) + (Number(d.p2p) || 0));
    const baja = serie.map(d => (Number(d.pagoFree) || 0) + (Number(d.pagoVip) || 0));
    const maxSube = Math.max(0, ...sube), maxBaja = Math.max(0, ...baja);
    if (!n || (!maxSube && !maxBaja)) { host.append(el('div', 'tz-empty', t('No fees or prizes in the last 30 days yet.'))); anchoFlujo = host.clientWidth; return; }

    const W = Math.max(300, Math.round(host.clientWidth || 900)), H = W < 600 ? 230 : 290;
    anchoFlujo = W;
    const izq = W < 600 ? 44 : 58, der = 6, arr = 10, abj = 26;
    const plotW = W - izq - der, plotH = H - arr - abj;
    const paso = pasoBonito(Math.max(maxSube, maxBaja) / 3);
    const techo = Math.ceil(maxSube / paso) * paso, suelo = Math.ceil(maxBaja / paso) * paso;
    const k = plotH / (techo + suelo), y0 = arr + techo * k;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    svg.setAttribute('aria-label', t('Money in and out, last 30 days'));

    // La rejilla y el eje (uno solo): recesivos.
    for (let v = -suelo; v <= techo + 1e-9; v += paso) {
      const y = Math.round(y0 - v * k) + 0.5;
      if (v !== 0) svg.append(sv('line', { x1: izq, x2: W - der, y1: y, y2: y, class: 'grid' }));
      const txt = sv('text', { x: izq - 8, y: y + 4, 'text-anchor': 'end' });
      txt.textContent = v === 0 ? '0' : (v < 0 ? '−' : '') + fmtC(Math.abs(v));
      svg.append(txt);
    }

    const ranura = plotW / n, ancho = Math.min(24, Math.max(3, ranura * 0.64)), HUECO = 2, R = 4;
    const cadaCuantos = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))));
    serie.forEach((d, i) => {
      const x = izq + i * ranura + (ranura - ancho) / 2;
      // Arriba: tienda pegada a la línea y P2P encima. Abajo: free pegado a la línea y VIP debajo.
      [true, false].forEach(arriba => {
        const capas = SERIES.filter(s => s.sube === arriba).map(s => ({ s, h: (Number(d[s.k]) || 0) * k })).filter(c => c.h > 0);
        let usado = 0;
        capas.forEach((c, j) => {
          const ultima = j === capas.length - 1;
          let h = Math.max(1.5, c.h), y;
          if (j > 0) { h = Math.max(1, h - HUECO); usado += HUECO; }
          y = arriba ? y0 - usado - h : y0 + usado;
          svg.append(sv('path', { d: barra(x, y, ancho, h, ultima ? R : 0, arriba), class: c.s.clase }));
          usado += h;
        });
      });
      if ((n - 1 - i) % cadaCuantos === 0) {
        // La última fecha, pegada al borde derecho, se cortaría centrada: se alinea a la derecha.
        const cx = izq + i * ranura + ranura / 2, alBorde = cx + 24 > W;
        const txt = sv('text', { x: alBorde ? W - 2 : cx, y: H - 8, 'text-anchor': alBorde ? 'end' : 'middle' });
        txt.textContent = fmtos().dia.format(fechaDia(d.dia));
        svg.append(txt);
      }
    });
    svg.append(sv('line', { x1: izq, x2: W - der, y1: Math.round(y0) + 0.5, y2: Math.round(y0) + 0.5, class: 'base' }));
    // Las zonas para el ratón y el teclado, encima de todo y más grandes que la barra.
    serie.forEach((d, i) => {
      const entra = sube[i], sale = baja[i];
      const hit = sv('rect', { x: izq + i * ranura, y: arr, width: ranura, height: plotH, class: 'hit', tabindex: 0, 'data-i': i });
      hit.setAttribute('aria-label', fmtos().diaLargo.format(fechaDia(d.dia)) + ' — ' + t('Fees') + ' ' + fmt(entra) + ' BR · ' + t('Paid out') + ' ' + fmt(sale) + ' BR');
      svg.append(hit);
    });
    host.append(svg);
  }
  function pintarFlujoTabla() {
    const host = $('tz-flujo-tabla');
    host.replaceChildren();
    const cols = [{ t: 'Day' }, { t: 'Game shop fees', num: true }, { t: 'P2P market fees', num: true }, { t: 'Admin deposits', num: true },
                  { t: 'Paid to free players', num: true }, { t: 'Paid to VIP players', num: true }, { t: 'Prizes', num: true }, { t: 'Net', num: true }];
    const neto = d => (Number(d.tienda) || 0) + (Number(d.p2p) || 0) + (Number(d.admin) || 0) - (Number(d.pagoFree) || 0) - (Number(d.pagoVip) || 0);
    const filas = datos.serie.slice().reverse().map(d => [fmtos().diaLargo.format(fechaDia(d.dia)), fmt(d.tienda), fmt(d.p2p), fmt(d.admin),
      fmt(d.pagoFree), fmt(d.pagoVip), fmt(d.premios), signo(neto(d))]);
    const s = datos.serie;
    const pie = [t('Total'), fmt(suma(s, 'tienda')), fmt(suma(s, 'p2p')), fmt(suma(s, 'admin')), fmt(suma(s, 'pagoFree')), fmt(suma(s, 'pagoVip')),
      fmt(suma(s, 'premios')), signo(s.reduce((a, d) => a + neto(d), 0))];
    host.append(hacerTabla(cols, filas, 'No data loaded', pie));
  }
  function csvFlujo() {
    if (!datos) return;
    const c = ui.csvCell;
    const lineas = [['day', 'shop_fees_bronze', 'p2p_fees_bronze', 'admin_deposits_bronze', 'paid_free_bronze', 'paid_vip_bronze', 'prizes'].map(c).join(',')];
    datos.serie.forEach(d => lineas.push([d.dia, d.tienda, d.p2p, d.admin, d.pagoFree, d.pagoVip, d.premios].map(c).join(',')));
    ui.download('treasury-30-days-' + new Date().toISOString().slice(0, 10) + '.csv', lineas.join('\r\n') + '\r\n', 'text/csv');
  }

  // El tooltip: uno solo, por delegación sobre el gráfico.
  function mostrarTip(i, x, y) {
    const tip = $('tz-tip'), d = datos && datos.serie[i];
    if (!d) { ocultarTip(); return; }
    if (tipDia !== i) {
      tipDia = i;
      tip.replaceChildren(el('h4', '', fmtos().diaLargo.format(fechaDia(d.dia))));
      SERIES.forEach(s => {
        const fila = el('div', 'row'), et = el('span');
        et.append(el('i', 'tz-sw ' + s.sw), document.createTextNode(t(s.nombre)));
        fila.append(et, el('b', '', fmt(d[s.k]) + ' BR'));
        tip.append(fila);
      });
      if (Number(d.admin) > 0) {
        const fila = el('div', 'row');
        fila.append(el('span', '', t('Admin deposits')), el('b', '', fmt(d.admin) + ' BR'));
        tip.append(fila);
      }
      const neto = (Number(d.tienda) || 0) + (Number(d.p2p) || 0) + (Number(d.admin) || 0) - (Number(d.pagoFree) || 0) - (Number(d.pagoVip) || 0);
      const fila = el('div', 'row');
      fila.style.borderTop = '1px solid var(--s-line)'; fila.style.marginTop = '6px'; fila.style.paddingTop = '6px';
      fila.append(el('span', '', t('Net') + ' · ' + fmt(d.premios) + ' ' + t('prizes')), el('b', '', signo(neto) + ' BR'));
      tip.append(fila);
    }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = root.innerWidth, vh = root.innerHeight;
    let left = x + 14, top = y + 14;
    if (left + w > vw - 8) left = x - w - 14;
    if (top + h > vh - 8) top = y - h - 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function ocultarTip() {
    const tip = $('tz-tip');
    if (tip && !tip.hidden) tip.hidden = true;
    tipDia = -1;
  }

  // ── Free y VIP ────────────────────────────────────────────────────────────
  function pintarSplit(id, free, vip, nombre) {
    const host = $(id), total = free + vip;
    host.replaceChildren();
    if (!(total > 0)) {
      const s = el('span'); s.style.flex = '1 1 0'; s.style.background = 'var(--tz-grid)';
      host.append(s);
      host.setAttribute('aria-label', t(nombre) + ': ' + t('no data yet'));
      return;
    }
    if (free > 0) { const s = el('span', 's3'); s.style.flex = free + ' 1 0'; host.append(s); }
    if (vip > 0) { const s = el('span', 's4'); s.style.flex = vip + ' 1 0'; host.append(s); }
    host.setAttribute('aria-label', t(nombre) + ': ' + t('Free') + ' ' + pct(free / total) + ' · VIP ' + pct(vip / total));
  }
  function filas(id, lista) {
    const host = $(id);
    host.replaceChildren();
    lista.forEach(([k, v]) => { const d = el('div'); d.append(el('span', 'tz-muted', t(k)), el('b', '', v)); host.append(d); });
  }
  function pintarGente() {
    const j = datos.jugadores || {}, tz = datos.tesoro;
    const free = Number(j.free) || 0, vip = Number(j.vip) || 0, total = free + vip;
    pintarSplit('tz-split-cuentas', free, vip, 'Accounts');
    filas('tz-filas-cuentas', [
      ['Free accounts', fmt(free) + (total ? ' · ' + pct(free / total) : '')],
      ['VIP accounts', fmt(vip) + (total ? ' · ' + pct(vip / total) : '')],
      ['With a name', fmt(j.conNombre)],
      ['Without a name (no incentives)', fmt(j.sinNombre)],
      ['Active in 24 hours', fmt(j.activos24h)],
      ['VIP active in 24 hours', fmt(j.vipActivos24h)]
    ]);
    pintarSplit('tz-split-pagos', tz.pagado.free, tz.pagado.vip, 'Paid out, all time');
    filas('tz-filas-pagos', [
      ['Paid to free players', fmt(tz.pagado.free) + ' BR · ' + fmt(tz.pagos.free) + ' ' + t('prizes')],
      ['Paid to VIP players', fmt(tz.pagado.vip) + ' BR · ' + fmt(tz.pagos.vip) + ' ' + t('prizes')]
    ]);
  }

  // ── Los mapas por nivel ───────────────────────────────────────────────────
  const NOMBRE_MAPA = Object.freeze({ mina: 'The Mine', salvaje: 'The Wild Lands', desierto: 'The Desert', cementerio: 'The Cemetery', tundra: 'The Frost Tundra' });
  function filaBarra(nombre, sub, valor, fraccion, texto) {
    const fila = el('div', 'tz-bar-row'), et = el('span', '', nombre);
    if (sub) et.append(el('small', '', sub));
    const pista = el('div', 'tz-bar-track'), relleno = el('div', 'tz-bar-fill');
    relleno.style.width = Math.max(0, Math.min(100, fraccion * 100)) + '%';
    if (!(valor > 0)) relleno.style.minWidth = '0';
    pista.append(relleno);
    fila.append(et, pista, el('b', '', texto));
    return fila;
  }
  function pintarMapas() {
    const cuentas = Math.max(0, Number(datos.jugadores && datos.jugadores.cuentas) || 0);
    const mapas = (datos.mapas || []).slice().sort((a, b) => a.nivel - b.nivel);
    const host = $('tz-mapas');
    host.replaceChildren();
    if (!mapas.length) host.append(el('div', 'tz-empty', t('No data loaded')));
    mapas.forEach(m => {
      const n = Number(m.jugadores) || 0, f = cuentas ? n / cuentas : 0;
      host.append(filaBarra(t(NOMBRE_MAPA[m.sala] || m.sala), t('Opens at level') + ' ' + m.nivel, n, f, fmt(n) + ' · ' + pct(f)));
    });
    const niveles = datos.niveles || [], max = Math.max(1, ...niveles.map(x => Number(x.jugadores) || 0));
    const hostN = $('tz-niveles');
    hostN.replaceChildren();
    niveles.forEach(x => {
      const n = Number(x.jugadores) || 0;
      hostN.append(filaBarra(t('Level') + ' ' + x.tramo, '', n, n / max, fmt(n)));
    });
  }

  // ── Tablas ────────────────────────────────────────────────────────────────
  function pintarTop() {
    const host = $('tz-top');
    host.replaceChildren(hacerTabla(
      [{ t: 'Player' }, { t: 'Group' }, { t: 'Prizes', num: true }, { t: 'Bronze', num: true }],
      (datos.top || []).map(r => [r.playerName || '—', etiqueta(r.vip ? 'VIP' : 'Free'), fmt(r.premios), fmt(r.bronce)]),
      'Nobody has picked up treasury coins in the last 30 days.'));
  }
  function tipoMov(m) {
    if (m.tipo === 'ingreso') return m.origen === 'p2p' ? 'P2P fee' : 'Shop fee';
    if (m.tipo === 'pago') return 'Prize';
    return Number(m.bronce) >= 0 ? 'Admin deposit' : 'Admin withdrawal';
  }
  function detalleMov(m) {
    const d = String(m.detalle || '');
    if (m.tipo === 'ingreso' && m.origen === 'tienda') {
      const x = d.match(/^(compra|venta) (.+)$/);
      return x ? t(x[1] === 'compra' ? 'Purchase' : 'Sale') + ' · ' + x[2] : d;
    }
    if (m.tipo === 'ingreso' && m.origen === 'p2p') return t('P2P sale') + ' · ' + d.replace(/^p2p /, '');
    if (m.tipo === 'pago') {
      let s = t('Monster') + (d ? ' · ' + d : '');
      if (m.nivel != null) s += ' · ' + t('Level') + ' ' + m.nivel;
      return s;
    }
    return d;
  }
  function pintarMovs() {
    const host = $('tz-movs');
    host.replaceChildren(hacerTabla(
      [{ t: 'When' }, { t: 'Type' }, { t: 'Player' }, { t: 'Detail' }, { t: 'Bronze', num: true }],
      (datos.ultimos || []).map(m => {
        const tipo = el('span');
        tipo.append(etiqueta(tipoMov(m)));
        if (m.tipo === 'pago') tipo.append(document.createTextNode(' '), etiqueta(m.vip ? 'VIP' : 'Free'));
        const b = Number(m.bronce) || 0;
        return [cuando(m.t), tipo, m.playerName || '—', detalleMov(m), signo(m.tipo === 'pago' ? -Math.abs(b) : b)];
      }),
      'No movements yet.'));
  }

  // ── El control ────────────────────────────────────────────────────────────
  const CAMPOS = Object.freeze([
    ['tz-m-free', c => c.manual.free], ['tz-m-vip', c => c.manual.vip],
    ['tz-a-basefree', c => c.auto.baseFree], ['tz-a-basevip', c => c.auto.baseVip], ['tz-a-pornivel', c => c.auto.porNivel],
    ['tz-a-niveltope', c => c.auto.nivelTope], ['tz-a-rachapaso', c => c.auto.rachaPaso], ['tz-a-rachatope', c => c.auto.rachaTope],
    ['tz-p-parte', c => c.parteDelTesoro], ['tz-p-vip', c => c.vipExtraPago], ['tz-p-min', c => c.pagoMin],
    ['tz-p-max', c => c.pagoMax], ['tz-p-dia', c => c.topeDiario]
  ]);
  function modoElegido() {
    const r = document.querySelector('input[name="tz-modo"]:checked');
    return r && r.value === 'manual' ? 'manual' : 'auto';
  }
  function llenarForm(c) {
    $('tz-activo').checked = !!c.activo;
    document.querySelectorAll('input[name="tz-modo"]').forEach(r => { r.checked = r.value === c.modo; });
    $('tz-m-bonos').checked = !!c.manual.conBonos;
    CAMPOS.forEach(([id, leer]) => { $(id).value = String(leer(c)); });
    $('tz-m-free-r').value = String(c.manual.free);
    $('tz-m-vip-r').value = String(c.manual.vip);
    revisarForm();
  }
  function mostrarGrupos() {
    const manual = modoElegido() === 'manual', bonos = $('tz-m-bonos').checked;
    $('tz-campos-manual').hidden = !manual;
    document.querySelectorAll('[data-tz-solo="auto"]').forEach(l => { l.hidden = manual; });
    document.querySelectorAll('[data-tz-solo="bonos"]').forEach(l => { l.hidden = manual && !bonos; });
    $('tz-campos-auto').hidden = manual && !bonos;
  }
  /** Lo que hay escrito. Un campo visible fuera de rango cuenta como error; uno oculto toma lo guardado. */
  function leerForm() {
    let malos = 0;
    const guardada = cfgServidor || BASE;
    const n = (id, leer) => {
      const campo = $(id), texto = campo.value.trim(), x = texto === '' ? NaN : Number(texto);
      const min = campo.min === '' ? -Infinity : Number(campo.min), max = campo.max === '' ? Infinity : Number(campo.max);
      let ok = Number.isFinite(x) && x >= min && x <= max;
      if (id === 'tz-p-max' && ok) { const mn = Number($('tz-p-min').value); if (Number.isFinite(mn) && x < mn) ok = false; }
      const oculto = !!campo.closest('[hidden]');
      campo.setAttribute('aria-invalid', String(!ok && !oculto));
      if (ok) return x;
      if (!oculto) malos++;
      return leer(guardada);
    };
    const crudo = { activo: $('tz-activo').checked, modo: modoElegido(), manual: {}, auto: {} };
    crudo.manual.conBonos = $('tz-m-bonos').checked;
    const destino = {
      'tz-m-free': v => { crudo.manual.free = v; }, 'tz-m-vip': v => { crudo.manual.vip = v; },
      'tz-a-basefree': v => { crudo.auto.baseFree = v; }, 'tz-a-basevip': v => { crudo.auto.baseVip = v; },
      'tz-a-pornivel': v => { crudo.auto.porNivel = v; }, 'tz-a-niveltope': v => { crudo.auto.nivelTope = v; },
      'tz-a-rachapaso': v => { crudo.auto.rachaPaso = v; }, 'tz-a-rachatope': v => { crudo.auto.rachaTope = v; },
      'tz-p-parte': v => { crudo.parteDelTesoro = v; }, 'tz-p-vip': v => { crudo.vipExtraPago = v; },
      'tz-p-min': v => { crudo.pagoMin = v; }, 'tz-p-max': v => { crudo.pagoMax = v; }, 'tz-p-dia': v => { crudo.topeDiario = v; }
    };
    CAMPOS.forEach(([id, leer]) => destino[id](n(id, leer)));
    return { cfg: normalizar(crudo), malos };
  }
  /** `validacion`: el aviso de campos mal escritos, que se va solo al corregirlos. */
  function estadoForm(texto, error, bien, validacion) {
    const s = $('tz-form-estado');
    s.textContent = texto ? t(texto) : '';
    s.dataset.error = String(!!error);
    s.dataset.ok = String(!!bien);
    s.dataset.validacion = String(!!validacion);
  }
  function revisarForm() {
    mostrarGrupos();
    const { cfg, malos } = leerForm();
    sucio = malos > 0 || (!!cfgServidor && JSON.stringify(cfg) !== JSON.stringify(cfgServidor));
    $('tz-guardar').disabled = !sucio || malos > 0 || ocupado;
    $('tz-descartar').disabled = !sucio || ocupado;
    $('tz-base').disabled = ocupado;
    $('tz-preview-tag').hidden = !sucio;
    if (malos) {
      estadoForm('Check the highlighted fields.', true, false, true);
      // Un campo mal escrito dentro de "Payout size" cerrado no se vería.
      document.querySelectorAll('#tz-control [aria-invalid="true"]').forEach(c => { const d = c.closest('details'); if (d) d.open = true; });
    } else if ($('tz-form-estado').dataset.validacion === 'true') estadoForm('');
    ui.markDirty(sucio);
    pintarEjemplos(cfg);
    return { cfg, malos };
  }
  function pintarEjemplos(cfg) {
    const host = $('tz-ejemplos');
    if (!cfg) cfg = leerForm().cfg;
    const saldo = datos ? Math.max(0, Number(datos.tesoro.saldo) || 0) : 0;
    const pago = (vip, nivel) => {
      const c = cantidad(cfg, saldo, { vip, nivel, exp: 130 }, 0.5);
      return c >= cfg.pagoMin ? fmt(c) + ' BR' : t('Treasury too low');
    };
    const tabla = hacerTabla(
      [{ t: 'Level' }, { t: 'Free', num: true }, { t: 'VIP', num: true }, { t: 'Free · full luck', num: true }, { t: 'VIP · full luck', num: true },
       { t: 'Free payout', num: true }, { t: 'VIP payout', num: true }],
      NIVELES_EJEMPLO.map(nivel => [String(nivel),
        pct(probabilidad(cfg, { vip: false, nivel, racha: 0 })), pct(probabilidad(cfg, { vip: true, nivel, racha: 0 })),
        pct(probabilidad(cfg, { vip: false, nivel, racha: 1000 })), pct(probabilidad(cfg, { vip: true, nivel, racha: 1000 })),
        pago(false, nivel), pago(true, nivel)]),
      'No data loaded');
    if (!cfg.activo && tabla.tagName === 'TABLE') {
      const cap = el('caption', '', t('Incentives are off: monsters drop no treasury coins until you turn them on and save.'));
      cap.style.cssText = 'caption-side:top;text-align:left;padding:8px 10px;color:var(--s-warn);font-size:12.5px';
      tabla.prepend(cap);
    }
    host.replaceChildren(tabla);
  }
  function alEditar(e) {
    const id = e.target && e.target.id;
    // El deslizador y la casilla de cada % van juntos.
    if (id === 'tz-m-free-r') $('tz-m-free').value = e.target.value;
    else if (id === 'tz-m-vip-r') $('tz-m-vip').value = e.target.value;
    else if (id === 'tz-m-free' || id === 'tz-m-vip') {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && e.target.value.trim() !== '') $(id + '-r').value = String(Math.max(0, Math.min(75, v)));
    }
    if (!ocupado) estadoForm('');
    revisarForm();
  }
  async function guardar(e) {
    e.preventDefault();
    if (ocupado || !verificado) return;
    const { cfg, malos } = revisarForm();
    if (malos || !sucio) return;
    if (cfgServidor && cfgServidor.activo && !cfg.activo &&
        !root.confirm(t('Turn off treasury incentives? Monsters will stop dropping treasury coins.'))) return;
    ocupado = true;
    revisarForm();
    estadoForm('Saving…');
    try {
      const r = await session.request('/api/admin/tesoro/config', { method: 'POST', body: JSON.stringify({ config: cfg }) });
      if (cerrado) return;
      cfgServidor = normalizar(r && r.config ? r.config : cfg);
      if (datos) datos.config = cfgServidor;
      ocupado = false;
      llenarForm(cfgServidor);
      if (datos) pintarSaldo();
      estadoForm('Saved.', false, true);
      cargar();
    } catch (err) {
      if (cerrado) return;
      ocupado = false;
      revisarForm();
      estadoForm(err && err.status === 404 ? 'This game server does not have the treasury yet. Deploy the latest backend and refresh.'
        : (err && err.message) || 'Could not save.', true);
    }
  }

  // ── Meter o sacar ─────────────────────────────────────────────────────────
  function estadoAjuste(texto, error, bien) {
    const s = $('tz-aj-estado');
    s.textContent = texto ? t(texto) : '';
    s.dataset.error = String(!!error);
    s.dataset.ok = String(!!bien);
  }
  async function ajustar(e) {
    e.preventDefault();
    if (ocupado || !verificado) return;
    const tipo = $('tz-aj-tipo').value === 'retiro' ? 'retiro' : 'ingreso';
    const moneda = Object.prototype.hasOwnProperty.call(BRONCE_POR, $('tz-aj-moneda').value) ? $('tz-aj-moneda').value : 'bronce';
    const texto = $('tz-aj-cantidad').value.trim(), n = Number(texto);
    if (!texto || !Number.isInteger(n) || n < 1) { estadoAjuste('Write a whole amount of at least 1.', true); return; }
    const bronce = aBronce(n, moneda);
    if (!(bronce <= 1e12)) { estadoAjuste('That amount is too large.', true); return; }
    const motivo = $('tz-aj-motivo').value.trim();
    if (motivo.length < 3) { estadoAjuste('Write a reason of at least 3 characters.', true); return; }
    if (tipo === 'retiro' && datos && bronce > datos.tesoro.saldo) { estadoAjuste('The treasury does not have that much.', true); return; }
    const pregunta = t(tipo === 'ingreso' ? 'Deposit into the treasury' : 'Withdraw from the treasury') + ': ' + fmt(bronce) + ' BR\n' +
      t('Reason') + ': ' + motivo + '\n\n' + t('Continue?');
    if (!root.confirm(pregunta)) return;
    ocupado = true;
    $('tz-aj-aplicar').disabled = true;
    revisarForm();
    estadoAjuste('Saving…');
    try {
      const r = await session.request('/api/admin/tesoro/ajuste', { method: 'POST', body: JSON.stringify({ tipo, bronce, motivo }) });
      if (cerrado) return;
      $('tz-aj-cantidad').value = '';
      $('tz-aj-motivo').value = '';
      estadoAjuste('Adjustment saved.', false, true);
      if (r && r.tesoro && datos) { datos.tesoro = r.tesoro; pintarSaldo(); }
    } catch (err) {
      if (cerrado) return;
      const msg = err && err.code === 'saldo_insuficiente' ? 'The treasury does not have that much.'
        : err && err.code === 'motivo_requerido' ? 'Write a reason of at least 3 characters.'
        : err && err.status === 404 ? 'This game server does not have the treasury yet. Deploy the latest backend and refresh.'
        : (err && err.message) || 'Could not save.';
      estadoAjuste(msg, true);
    } finally {
      if (!cerrado) {
        ocupado = false;
        $('tz-aj-aplicar').disabled = false;
        revisarForm();
        cargar();
      }
    }
  }

  // ── Cablear (una sola vez) ────────────────────────────────────────────────
  $('tz-connect').addEventListener('click', () => verificar(true));
  $('tz-refresh').addEventListener('click', () => cargar());
  $('tz-ver-tabla').addEventListener('click', () => {
    verTabla = !verTabla;
    $('tz-ver-tabla').setAttribute('aria-pressed', String(verTabla));
    $('tz-ver-tabla').textContent = t(verTabla ? 'Show chart' : 'Show table');
    if (datos) pintarFlujo();
  });
  $('tz-csv').addEventListener('click', csvFlujo);
  $('tz-control').addEventListener('input', alEditar);
  $('tz-control').addEventListener('change', alEditar);
  $('tz-form').addEventListener('submit', guardar);
  $('tz-descartar').addEventListener('click', () => { if (cfgServidor && !ocupado) { llenarForm(cfgServidor); estadoForm(''); } });
  $('tz-base').addEventListener('click', () => {
    if (ocupado) return;
    llenarForm(normalizar(datos && datos.base ? datos.base : BASE));
    estadoForm(sucio ? 'Defaults loaded. Save to apply them.' : '');
  });
  $('tz-ajuste').addEventListener('submit', ajustar);

  const grafico = $('tz-flujo');
  grafico.addEventListener('pointermove', e => {
    const r = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
    if (r) mostrarTip(Number(r.getAttribute('data-i')), e.clientX, e.clientY); else ocultarTip();
  });
  grafico.addEventListener('pointerleave', ocultarTip);
  grafico.addEventListener('focusin', e => {
    const r = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
    if (!r) return;
    const b = r.getBoundingClientRect();
    mostrarTip(Number(r.getAttribute('data-i')), b.left + b.width / 2, b.top + 24);
  });
  grafico.addEventListener('focusout', ocultarTip);
  root.addEventListener('scroll', ocultarTip, { passive: true });
  document.addEventListener('visibilitychange', alCambiarVisibilidad);

  // El gráfico se dibuja al ancho real: se rehace si cambia el ancho (un rAF como mucho).
  const vigia = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(() => {
    if (rafFlujo) return;
    rafFlujo = root.requestAnimationFrame(() => {
      rafFlujo = 0;
      const w = grafico.clientWidth;
      if (datos && !verTabla && w && Math.abs(w - anchoFlujo) > 4) pintarFlujo();
    });
  }) : null;
  if (vigia) vigia.observe(grafico);

  root.addEventListener('gf-admin-preferences', () => {
    $('tz-ver-tabla').textContent = t(verTabla ? 'Show chart' : 'Show table');
    pintarHora();
    if (datos) pintar();
  });
  // En la página suelta (sin el centro de control), si la sesión cae se vuelve a la puerta.
  if (!ui.embedded) {
    quitarSesion = session.subscribe(motivo => {
      if (!verificado) return;
      aPuerta(motivo === 'account_changed' ? 'The wallet account changed. Connect again.'
        : motivo === 'signed_out' ? 'Signed out.' : 'Your session expired. Connect again.', true);
    });
  }
  root.addEventListener('pagehide', e => {
    if (e.persisted) { pararReloj(); return; }
    cerrado = true;
    pararReloj(); abortar(); ocultarTip();
    if (vigia) vigia.disconnect();
    if (rafFlujo) { root.cancelAnimationFrame(rafFlujo); rafFlujo = 0; }
    root.removeEventListener('scroll', ocultarTip);
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    if (quitarSesion) { quitarSesion(); quitarSesion = null; }
  });
  root.addEventListener('pageshow', e => { if (e.persisted && verificado) { armarReloj(); cargar(); } });

  pintarHora();
  verificar(false);
})(typeof window !== 'undefined' ? window : globalThis);
