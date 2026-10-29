/* =============================================================================
 * GF GRÁFICOS — gráficos interactivos en SVG, sin librerías de fuera  (2026-10-28)
 * -----------------------------------------------------------------------------
 * "Quiero gráficos más profesionales, mejores y más movibles, con fechas y hora
 * exactas de internet, no locales." Los usan el centro de control (economía,
 * precios de la tienda y del P2P, misiones), el panel de recarga del juego y el
 * panel "Price history" de la tienda y del mercado.
 *
 *   · LA HORA ES LA DEL SERVIDOR, EN UTC. `GFGraficos.reloj.ajustar(ahora)` con
 *     el `ahora` que manda el servidor (o `sincronizar(apiBase)` con /api/tiempo)
 *     y todas las fechas se pintan en UTC, con su hora exacta. El reloj del
 *     equipo del jugador no cuenta.
 *   · SE MUEVE: rueda (o pellizco con dos dedos) para acercar, arrastrar para
 *     desplazarse, botones de rango (1D, 7D, 30D, 90D, Todo) y "Restablecer".
 *   · AL PASAR POR ENCIMA (o tocar): una línea vertical y una ficha con la fecha
 *     y la hora exactas y el valor de cada serie.
 *   · LEYENDA que oculta y enseña cada serie; TABLA con los datos (accesible).
 *   · Nada de líneas a trazos ni nubes de puntos: líneas continuas de 2 px y un
 *     único marcador en el punto señalado.
 *   · El color va con la serie, nunca con su posición: ocultar una no repinta
 *     las demás. Paleta categórica validada (ver los colores de abajo).
 *
 * Uso:
 *   var g = GFGraficos.crear(contenedor, {
 *     tipo: 'linea' | 'barras',                 // barras = apiladas por fecha
 *     series: [{ id, nombre, color, area, escalon }],
 *     datos: { id: [[t, valor], ...] },          // t = ms (o Date o 'YYYY-MM-DD')
 *     formato: function (v, serie) { return '…' }, // eje y ficha
 *     rangos: ['1d','7d','30d','90d','todo'], rango: '30d',
 *     referencia: { valor: 1, nombre: 'Default' },  // línea horizontal fina
 *     incluirCero: true, alto: 240, vacio: 'No data yet.', etiqueta: '…', idioma: 'en'
 *   });
 *   g.actualizar({ datos, series }); g.destruir();
 * ========================================================================== */
(function (root) {
  'use strict';
  if (root.GFGraficos) return;

  var SVGNS = 'http://www.w3.org/2000/svg';
  var DIA = 86400000, HORA = 3600000;
  var RANGOS = { '1d': DIA, '7d': 7 * DIA, '30d': 30 * DIA, '90d': 90 * DIA, '1a': 365 * DIA };
  var NOMBRE_RANGO = { '1d': '1D', '7d': '7D', '30d': '30D', '90d': '90D', '1a': '1Y', todo: 'All' };
  // La paleta categórica (orden fijo; validada para daltonismo en claro y oscuro).
  var PALETA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

  /* ── EL RELOJ DEL SERVIDOR ─────────────────────────────────────────────── */
  var desfase = 0, sincronizado = false;
  var baseServidor = 0, basePulso = 0;
  function pulso() { return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : null; }
  var reloj = {
    /** `ahora` del servidor (ms). Se guarda la diferencia con el reloj del equipo. */
    ajustar: function (ahoraServidor) {
      var n = Number(ahoraServidor);
      if (!isFinite(n) || n <= 0) return;
      desfase = n - Date.now();
      baseServidor = n; basePulso = pulso();
      sincronizado = true;
    },
    ahora: function () { var p = pulso(); return sincronizado && p !== null && basePulso !== null ? baseServidor + p - basePulso : Date.now() + desfase; },
    sincronizado: function () { return sincronizado; },
    /** Pide la hora a /api/tiempo (una vez basta; luego se va sumando). */
    sincronizar: function (apiBase) {
      var base = String(apiBase || '').replace(/\/+$/, '');
      var t0 = Date.now();
      return fetch(base + '/api/tiempo', { credentials: 'include', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.ahora) reloj.ajustar(Number(d.ahora) + (Date.now() - t0) / 2);
          return sincronizado;
        })
        .catch(function () { return false; });
    }
  };

  /* ── FORMATOS (siempre UTC) ────────────────────────────────────────────── */
  var fmtCache = {};
  function fmt(idioma, op) {
    var k = idioma + JSON.stringify(op);
    if (!fmtCache[k]) {
      if (Object.keys(fmtCache).length >= 32) delete fmtCache[Object.keys(fmtCache)[0]];
      try { fmtCache[k] = new Intl.DateTimeFormat(idioma === 'es' ? 'es-ES' : 'en-GB', Object.assign({ timeZone: 'UTC' }, op)); }
      catch (e) { fmtCache[k] = { format: function (d) { return d.toISOString().slice(0, 16).replace('T', ' '); } }; }
    }
    return fmtCache[k];
  }
  function fechaHora(t, idioma) {
    var d = new Date(t);
    return fmt(idioma, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(d) + ' · ' +
           fmt(idioma, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d) + ' UTC';
  }
  function etiquetaEje(t, paso, idioma) {
    var d = new Date(t);
    if (paso >= 28 * DIA) return fmt(idioma, { month: 'short', year: 'numeric' }).format(d);
    if (paso >= DIA) return fmt(idioma, { day: 'numeric', month: 'short' }).format(d);
    var hm = fmt(idioma, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? fmt(idioma, { day: 'numeric', month: 'short' }).format(d) : hm;
  }
  function aMs(t) {
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'number') return t;
    var s = String(t || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + 'T00:00:00Z');
    var n = Date.parse(s);
    return isFinite(n) ? n : NaN;
  }
  function numeroCorto(v) {
    var a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(a >= 1e13 ? 0 : 1) + 'T';
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
    if (a >= 100) return String(Math.round(v));
    if (a >= 1) return String(Math.round(v * 100) / 100);
    if (a === 0) return '0';
    return String(Number(v.toPrecision(3)));
  }

  /* ── ESCALAS ───────────────────────────────────────────────────────────── */
  function marcasBonitas(min, max, cuantas) {
    if (!(max > min)) { var c = min || 0; min = c - (Math.abs(c) * 0.05 || 1); max = c + (Math.abs(c) * 0.05 || 1); }
    var rango = max - min, paso = Math.pow(10, Math.floor(Math.log10(rango / cuantas)));
    var err = (cuantas / rango) * paso;
    if (err <= 0.15) paso *= 10; else if (err <= 0.35) paso *= 5; else if (err <= 0.75) paso *= 2;
    var ini = Math.floor(min / paso) * paso, fin = Math.ceil(max / paso) * paso, l = [];
    for (var v = ini; v <= fin + paso * 0.5; v += paso) l.push(Math.round(v / paso) * paso);
    return { min: ini, max: fin, marcas: l };
  }
  var PASOS_T = [HORA, 3 * HORA, 6 * HORA, 12 * HORA, DIA, 2 * DIA, 7 * DIA, 14 * DIA, 30 * DIA, 91 * DIA, 182 * DIA, 365 * DIA];
  function marcasTiempo(t0, t1, ancho) {
    var quiero = Math.max(2, Math.floor(ancho / 92));
    var paso = PASOS_T[PASOS_T.length - 1];
    for (var i = 0; i < PASOS_T.length; i++) if ((t1 - t0) / PASOS_T[i] <= quiero) { paso = PASOS_T[i]; break; }
    var l = [], t;
    if (paso >= 30 * DIA) {
      var d = new Date(t0); d = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      var meses = Math.round(paso / (30 * DIA));
      for (t = d; t <= t1; ) { if (t >= t0) l.push(t); var x = new Date(t); t = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + meses, 1); }
    } else {
      for (t = Math.ceil(t0 / paso) * paso; t <= t1; t += paso) l.push(t);
    }
    return { paso: paso, marcas: l };
  }

  function el(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = String(texto); return e; }
  function sv(tag, a) { var e = document.createElementNS(SVGNS, tag); for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) e.setAttribute(k, String(a[k])); return e; }

  /* ── LOS ESTILOS (una vez) ─────────────────────────────────────────────── */
  function estilos() {
    if (document.getElementById('gfg-estilos')) return;
    var s = document.createElement('style');
    s.id = 'gfg-estilos';
    s.textContent = [
      '.gfg{--gfg-texto:#52514e;--gfg-texto-fuerte:#0b0b0b;--gfg-rejilla:rgba(11,11,11,.08);--gfg-eje:rgba(11,11,11,.28);--gfg-ficha:#ffffff;--gfg-borde:rgba(11,11,11,.14);--gfg-boton:rgba(11,11,11,.05);--gfg-activo:#2a78d6;position:relative;font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--gfg-texto);min-width:0;user-select:none;-webkit-user-select:none}',
      '[data-theme="dark"] .gfg,.gfg.gfg-oscuro{--gfg-texto:#c3c2b7;--gfg-texto-fuerte:#f0efec;--gfg-rejilla:rgba(240,239,236,.08);--gfg-eje:rgba(240,239,236,.3);--gfg-ficha:#232322;--gfg-borde:rgba(240,239,236,.16);--gfg-boton:rgba(240,239,236,.07);--gfg-activo:#3987e5}',
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .gfg:not(.gfg-claro){--gfg-texto:#c3c2b7;--gfg-texto-fuerte:#f0efec;--gfg-rejilla:rgba(240,239,236,.08);--gfg-eje:rgba(240,239,236,.3);--gfg-ficha:#232322;--gfg-borde:rgba(240,239,236,.16);--gfg-boton:rgba(240,239,236,.07);--gfg-activo:#3987e5}}',
      '.gfg-barra{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 8px}',
      '.gfg-rangos{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--gfg-boton)}',
      '.gfg-b{appearance:none;border:0;background:transparent;color:var(--gfg-texto);font:inherit;font-weight:600;padding:5px 9px;border-radius:6px;cursor:pointer;min-height:28px}',
      '.gfg-b:hover{color:var(--gfg-texto-fuerte)}',
      '.gfg-b[aria-pressed="true"]{background:var(--gfg-ficha);color:var(--gfg-texto-fuerte);box-shadow:0 1px 2px rgba(0,0,0,.18)}',
      '.gfg-b:focus-visible{outline:2px solid var(--gfg-activo);outline-offset:1px}',
      '.gfg-aux{margin-left:auto;display:inline-flex;gap:4px}',
      '.gfg-leyenda{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 6px}',
      '.gfg-l{appearance:none;border:0;background:none;color:var(--gfg-texto-fuerte);font:inherit;display:inline-flex;align-items:center;gap:6px;padding:3px 2px;cursor:pointer}',
      '.gfg-l i{width:12px;height:12px;border-radius:3px;display:inline-block}',
      '.gfg-l[aria-pressed="false"]{opacity:.42}',
      '.gfg-l[aria-pressed="false"] span{text-decoration:line-through}',
      '.gfg-lienzo{position:relative;touch-action:pan-y;cursor:crosshair}',
      '.gfg-lienzo.arrastrando{cursor:grabbing}',
      '.gfg svg{display:block;width:100%;overflow:visible}',
      '.gfg svg text{fill:var(--gfg-texto);font-size:11px;font-variant-numeric:tabular-nums}',
      '.gfg-rej{stroke:var(--gfg-rejilla);stroke-width:1}',
      '.gfg-eje{stroke:var(--gfg-eje);stroke-width:1}',
      '.gfg-cruz{stroke:var(--gfg-eje);stroke-width:1}',
      '.gfg-ref{stroke:var(--gfg-eje);stroke-width:1}',
      '.gfg-ficha{position:absolute;z-index:3;pointer-events:none;background:var(--gfg-ficha);color:var(--gfg-texto-fuerte);border:1px solid var(--gfg-borde);border-radius:8px;padding:8px 10px;box-shadow:0 6px 18px rgba(0,0,0,.22);min-width:150px;max-width:260px;font-size:12px}',
      '.gfg-ficha b{display:block;font-size:11px;font-weight:600;color:var(--gfg-texto);margin-bottom:5px;white-space:nowrap}',
      '.gfg-ficha div{display:flex;align-items:center;gap:7px;justify-content:space-between;white-space:nowrap}',
      '.gfg-ficha div span:first-child{display:inline-flex;align-items:center;gap:6px}',
      '.gfg-ficha i{width:9px;height:9px;border-radius:2px;display:inline-block}',
      '.gfg-ficha em{font-style:normal;font-weight:600;font-variant-numeric:tabular-nums}',
      '.gfg-pie{display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:11px}',
      '.gfg-vacio{display:flex;align-items:center;justify-content:center;color:var(--gfg-texto);border:1px solid var(--gfg-rejilla);border-radius:8px;font-size:12px;text-align:center;padding:12px}',
      '.gfg-tabla{max-height:240px;overflow:auto;margin-top:8px;border:1px solid var(--gfg-rejilla);border-radius:8px}',
      '.gfg-tabla table{border-collapse:collapse;width:100%;font-size:12px}',
      '.gfg-tabla th,.gfg-tabla td{padding:5px 8px;border-bottom:1px solid var(--gfg-rejilla);text-align:right;white-space:nowrap}',
      '.gfg-tabla th:first-child,.gfg-tabla td:first-child{text-align:left}',
      '.gfg-tabla thead th{position:sticky;top:0;background:var(--gfg-ficha);color:var(--gfg-texto-fuerte)}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  /* ── EL GRÁFICO ────────────────────────────────────────────────────────── */
  function crear(contenedor, opciones) {
    estilos();
    var op = Object.assign({ tipo: 'linea', alto: 240, rangos: ['7d', '30d', '90d', 'todo'], rango: 'todo', idioma: 'en',
                             incluirCero: false, vacio: 'No data yet.', etiqueta: 'Chart', tabla: true }, opciones || {});
    var idioma = op.idioma === 'es' ? 'es' : 'en';
    var T = { reset: idioma === 'es' ? 'Restablecer' : 'Reset', tabla: idioma === 'es' ? 'Tabla' : 'Table', grafico: idioma === 'es' ? 'Gráfico' : 'Chart',
              todo: idioma === 'es' ? 'Todo' : 'All', fecha: idioma === 'es' ? 'Fecha (UTC)' : 'Date (UTC)',
              ayuda: idioma === 'es' ? 'Rueda o pellizco: acercar · arrastrar: mover' : 'Wheel or pinch: zoom · drag: pan' };
    var series = [], datos = {}, indices = {}, ocultas = {};
    var vista = null, extension = null;           // [t0, t1]
    var destruido = false, verTabla = false;
    var ancho = 600;

    var raiz = el('div', 'gfg');
    if (op.tema === 'oscuro') raiz.classList.add('gfg-oscuro');
    if (op.tema === 'claro') raiz.classList.add('gfg-claro');
    var barra = el('div', 'gfg-barra');
    var grupoRangos = el('div', 'gfg-rangos');
    grupoRangos.setAttribute('role', 'group');
    grupoRangos.setAttribute('aria-label', idioma === 'es' ? 'Periodo' : 'Range');
    var botonesRango = {};
    op.rangos.forEach(function (r) {
      var b = el('button', 'gfg-b', r === 'todo' ? T.todo : (NOMBRE_RANGO[r] || r));
      b.type = 'button';
      b.addEventListener('click', function () { ponerRango(r); });
      botonesRango[r] = b;
      grupoRangos.appendChild(b);
    });
    var aux = el('div', 'gfg-aux');
    var bReset = el('button', 'gfg-b', T.reset); bReset.type = 'button';
    bReset.addEventListener('click', function () { ponerRango(op.rango); });
    var bTabla = el('button', 'gfg-b', T.tabla); bTabla.type = 'button'; bTabla.setAttribute('aria-pressed', 'false');
    bTabla.addEventListener('click', function () { verTabla = !verTabla; bTabla.setAttribute('aria-pressed', String(verTabla)); pintar(); });
    aux.appendChild(bReset);
    if (op.tabla) aux.appendChild(bTabla);
    if (op.rangos.length) barra.appendChild(grupoRangos);
    barra.appendChild(aux);
    var leyenda = el('div', 'gfg-leyenda');
    var lienzo = el('div', 'gfg-lienzo');
    var ficha = el('div', 'gfg-ficha'); ficha.hidden = true; ficha.setAttribute('role', 'status');
    var pie = el('div', 'gfg-pie');
    var tablaCaja = el('div', 'gfg-tabla'); tablaCaja.hidden = true;
    raiz.appendChild(barra); raiz.appendChild(leyenda); raiz.appendChild(lienzo); raiz.appendChild(pie); raiz.appendChild(tablaCaja);
    lienzo.appendChild(ficha);
    contenedor.replaceChildren ? contenedor.replaceChildren(raiz) : (contenedor.innerHTML = '', contenedor.appendChild(raiz));

    var svg = null, capaHover = null, geo = null;

    function normalizar(nuevos) {
      var out = {};
      for (var k in nuevos) {
        if (!Object.prototype.hasOwnProperty.call(nuevos, k)) continue;
        var l = (Array.isArray(nuevos[k]) ? nuevos[k].slice(-5000) : []).filter(function (p) { return p != null; }).map(function (p) {
          var v = Array.isArray(p) ? p[1] : p.v;
          return [aMs(Array.isArray(p) ? p[0] : p.t), v === null || v === undefined || v === '' ? null : Number(v)]; })
          .filter(function (p) { return isFinite(p[0]) && (isFinite(p[1]) || p[1] === null); })
          .sort(function (a, b) { return a[0] - b[0]; });
        out[k] = l;
      }
      return out;
    }
    function calcularExtension() {
      var t0 = Infinity, t1 = -Infinity;
      series.forEach(function (s) { var l = datos[s.id] || []; if (l.length) { t0 = Math.min(t0, l[0][0]); t1 = Math.max(t1, l[l.length - 1][0]); } });
      if (!isFinite(t0)) return null;
      if (op.hastaAhora) t1 = Math.max(t1, reloj.ahora());
      if (t1 - t0 < HORA) { t0 -= 12 * HORA; t1 += 12 * HORA; }
      if (op.tipo === 'barras') { t0 -= DIA / 2; t1 += DIA / 2; }
      return [t0, t1];
    }
    function ponerRango(r) {
      if (!extension) { pintar(); return; }
      var fin = extension[1];
      if (r === 'todo' || !RANGOS[r]) vista = [extension[0], extension[1]];
      else vista = [Math.max(extension[0], fin - RANGOS[r]), fin];
      if (vista[1] - vista[0] < HORA) vista = [extension[0], extension[1]];
      for (var k in botonesRango) botonesRango[k].setAttribute('aria-pressed', String(k === r));
      pintar();
    }
    function marcarRangoLibre() { for (var k in botonesRango) botonesRango[k].setAttribute('aria-pressed', 'false'); }

    function visibles() { return series.filter(function (s) { return !ocultas[s.id]; }); }
    function valorEn(s, t) {
      // Para un precio (escalón) vale el último punto anterior; si no, el punto más cercano.
      var l = datos[s.id] || [];
      if (!l.length) return null;
      if (s.escalon) {
        var ult = null;
        for (var i = 0; i < l.length; i++) { if (l[i][0] <= t) ult = l[i]; else break; }
        return ult;
      }
      var mejor = null, dist = Infinity;
      for (var j = 0; j < l.length; j++) { var d = Math.abs(l[j][0] - t); if (d < dist) { dist = d; mejor = l[j]; } }
      return mejor;
    }

    function pintarLeyenda() {
      leyenda.replaceChildren();
      if (series.length < 2) { leyenda.hidden = true; return; }
      leyenda.hidden = false;
      series.forEach(function (s) {
        var b = el('button', 'gfg-l'); b.type = 'button';
        var i = el('i'); i.style.background = s.color;
        b.appendChild(i); b.appendChild(el('span', '', s.nombre));
        b.setAttribute('aria-pressed', String(!ocultas[s.id]));
        b.addEventListener('click', function () {
          // Siempre queda al menos una serie a la vista.
          if (!ocultas[s.id] && visibles().length <= 1) return;
          ocultas[s.id] = !ocultas[s.id];
          pintarLeyenda(); pintar();
        });
        leyenda.appendChild(b);
      });
    }

    function pintar() {
      if (destruido) return;
      ancho = Math.max(240, Math.round(lienzo.clientWidth || contenedor.clientWidth || 600));
      var alto = op.alto;
      if (svg) svg.remove();
      svg = null; capaHover = null; ficha.hidden = true;
      var vis = visibles();
      var hay = vis.some(function (s) { return (datos[s.id] || []).some(function (p) { return p[1] !== null && isFinite(p[1]); }); });
      lienzo.querySelectorAll('.gfg-vacio').forEach(function (n) { n.remove(); });
      if (!hay || !vista) {
        var v = el('div', 'gfg-vacio', op.vacio); v.style.height = alto + 'px';
        lienzo.appendChild(v);
        pie.replaceChildren(); tablaCaja.hidden = true;
        return;
      }
      var IZQ = op.izquierda || 58, DER = 12, ARR = 10, ABA = 26;
      var t0 = vista[0], t1 = vista[1];
      // El eje y con lo que se ve.
      var min = Infinity, max = -Infinity;
      var apilado = op.tipo === 'barras';
      if (apilado) {
        var sumas = {};
        min = 0;
        vis.forEach(function (s) { (datos[s.id] || []).forEach(function (p) {
          if (p[0] < t0 - DIA || p[0] > t1 + DIA || p[1] === null || !isFinite(p[1])) return;
          var bucket = sumas[p[0]] || (sumas[p[0]] = { positive: 0, negative: 0 });
          if (p[1] >= 0) bucket.positive += p[1]; else bucket.negative += p[1];
        }); });
        for (var k in sumas) if (Object.prototype.hasOwnProperty.call(sumas, k)) {
          max = Math.max(max, sumas[k].positive); min = Math.min(min, sumas[k].negative);
        }
        if (!isFinite(max)) max = 1;
      } else {
        vis.forEach(function (s) {
          var l = datos[s.id] || [];
          for (var i = 0; i < l.length; i++) {
            var p = l[i];
            var dentro = p[0] >= t0 && p[0] <= t1;
            // El escalón que entra por la izquierda también cuenta.
            if (!dentro && s.escalon && p[0] < t0 && (i === l.length - 1 || l[i + 1][0] >= t0)) dentro = true;
            if (dentro && p[1] !== null && isFinite(p[1])) { min = Math.min(min, p[1]); max = Math.max(max, p[1]); }
          }
        });
        if (op.referencia && isFinite(op.referencia.valor)) { min = Math.min(min, op.referencia.valor); max = Math.max(max, op.referencia.valor); }
        if (op.incluirCero) { min = Math.min(min, 0); max = Math.max(max, 0); }
        if (!isFinite(min)) { min = 0; max = 1; }
        var hol = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1;
        if (!op.incluirCero || min < 0) min -= hol;
        max += hol;
      }
      var ny = marcasBonitas(min, max, Math.max(3, Math.min(6, Math.floor(alto / 48))));
      var y0 = ny.min, y1 = ny.max;
      var X = function (t) { return IZQ + (t - t0) / (t1 - t0) * (ancho - IZQ - DER); };
      var Y = function (v) { return ARR + (y1 - v) / (y1 - y0 || 1) * (alto - ARR - ABA); };
      geo = { IZQ: IZQ, DER: DER, ARR: ARR, ABA: ABA, alto: alto, X: X, Y: Y, t0: t0, t1: t1 };

      svg = sv('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, height: alto, role: 'img', 'aria-label': op.etiqueta });
      var clip = 'gfg-c' + Math.random().toString(36).slice(2, 9);
      var defs = sv('defs', {});
      var cp = sv('clipPath', { id: clip });
      cp.appendChild(sv('rect', { x: IZQ, y: 0, width: ancho - IZQ - DER, height: alto - ABA + 1 }));
      defs.appendChild(cp); svg.appendChild(defs);
      // Rejilla y eje y.
      var fy = op.formatoEje || op.formato || numeroCorto;
      ny.marcas.forEach(function (v, i) {
        var yy = Y(v);
        if (yy < ARR - 1 || yy > alto - ABA + 1) return;
        svg.appendChild(sv('line', { x1: IZQ, x2: ancho - DER, y1: yy, y2: yy, 'class': i === 0 ? 'gfg-eje' : 'gfg-rej' }));
        var tx = sv('text', { x: IZQ - 6, y: yy + 3.5, 'text-anchor': 'end' });
        var etiqueta = String(fy(v, null)); tx.textContent = etiqueta.length > 10 ? numeroCorto(v) : etiqueta;
        svg.appendChild(tx);
      });
      // Eje x (UTC).
      var mt = marcasTiempo(t0, t1, ancho - IZQ - DER);
      var ultimoX = -Infinity;
      mt.marcas.forEach(function (t) {
        var xx = X(t);
        if (xx < IZQ + 14 || xx > ancho - DER - 14 || xx - ultimoX < 64) return;
        ultimoX = xx;
        svg.appendChild(sv('line', { x1: xx, x2: xx, y1: alto - ABA, y2: alto - ABA + 4, 'class': 'gfg-eje' }));
        var tx = sv('text', { x: xx, y: alto - 8, 'text-anchor': 'middle' }); tx.textContent = etiquetaEje(t, mt.paso, idioma);
        svg.appendChild(tx);
      });
      var dibujo = sv('g', { 'clip-path': 'url(#' + clip + ')' });
      svg.appendChild(dibujo);
      if (op.referencia && isFinite(op.referencia.valor)) {
        var yr = Y(op.referencia.valor);
        dibujo.appendChild(sv('line', { x1: IZQ, x2: ancho - DER, y1: yr, y2: yr, 'class': 'gfg-ref' }));
        if (op.referencia.nombre) { var tr = sv('text', { x: ancho - DER - 4, y: yr - 4, 'text-anchor': 'end' }); tr.textContent = op.referencia.nombre; svg.appendChild(tr); }
      }
      if (apilado) pintarBarras(dibujo, vis, X, Y, t0, t1);
      else pintarLineas(dibujo, vis, X, Y, t0, t1);
      capaHover = sv('g', {});
      svg.appendChild(capaHover);
      lienzo.insertBefore(svg, ficha);
      // El pie: el periodo visible, con su hora UTC.
      pie.replaceChildren(el('span', '', fechaHora(t0, idioma).replace(/ · .*$/, '') + ' — ' + fechaHora(t1, idioma).replace(/:\d\d UTC$/, ' UTC')),
                          el('span', '', T.ayuda));
      pintarTabla(vis);
    }

    function pintarLineas(g, vis, X, Y, t0, t1) {
      vis.forEach(function (s) {
        var l = datos[s.id] || [];
        if (!l.length) return;
        var d = '', area = '', abierto = false, primeroX = null, ultimoX = null, prev = null;
        for (var i = 0; i < l.length; i++) {
          var p = l[i];
          if (p[1] === null || !isFinite(p[1])) { abierto = false; continue; }
          var x = X(p[0]), y = Y(p[1]);
          if (!abierto) { d += 'M' + x.toFixed(1) + ' ' + y.toFixed(1); abierto = true; if (primeroX === null) primeroX = x; }
          else if (s.escalon) d += 'H' + x.toFixed(1) + 'V' + y.toFixed(1);
          else d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1);
          ultimoX = x; prev = p;
        }
        // Un precio sigue vigente hasta ahora: el último escalón llega al borde.
        if (s.escalon && prev) { var fin = X(Math.min(t1, Math.max(prev[0], reloj.ahora()))); if (fin > ultimoX) { d += 'H' + fin.toFixed(1); ultimoX = fin; } }
        if (!d) return;
        if (s.area && primeroX !== null) {
          var base = Y(Math.max(geo ? 0 : 0, 0));
          area = d + 'V' + base.toFixed(1) + 'H' + primeroX.toFixed(1) + 'Z';
          g.appendChild(sv('path', { d: area, fill: s.color, 'fill-opacity': 0.12, stroke: 'none' }));
        }
        g.appendChild(sv('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        // Un único punto (sin línea que pintar): una marca pequeña.
        if (l.length === 1 && l[0][1] !== null) g.appendChild(sv('circle', { cx: X(l[0][0]), cy: Y(l[0][1]), r: 4, fill: s.color }));
      });
    }
    function pintarBarras(g, vis, X, Y, t0, t1) {
      var tiempos = {};
      vis.forEach(function (s) { (datos[s.id] || []).forEach(function (p) { if (p[0] >= t0 - DIA && p[0] <= t1 + DIA) tiempos[p[0]] = true; }); });
      var lista = Object.keys(tiempos).map(Number).sort(function (a, b) { return a - b; });
      var paso = lista.length > 1 ? Math.min.apply(null, lista.slice(1).map(function (t, i) { return t - lista[i]; })) : DIA;
      var anchoBarra = Math.max(2, Math.min(28, (X(t0 + paso) - X(t0)) * 0.72));
      lista.forEach(function (t) {
        var basePositiva = 0, baseNegativa = 0;
        vis.forEach(function (s) {
          var p = indices[s.id] && indices[s.id].get(t);
          var v = p ? Number(p[1]) || 0 : 0;
          if (!v) return;
          var base = v > 0 ? basePositiva : baseNegativa;
          var ya = Y(base), yb = Y(base + v);
          // 2 px de separación entre segmentos: se distinguen sin depender del color.
          g.appendChild(sv('rect', { x: X(t) - anchoBarra / 2, y: Math.min(ya, yb), width: anchoBarra, height: Math.max(1, Math.abs(ya - yb) - 2), rx: 2, fill: s.color }));
          if (v > 0) basePositiva += v; else baseNegativa += v;
        });
      });
    }

    function pintarTabla(vis) {
      tablaCaja.hidden = !verTabla;
      if (!verTabla) { tablaCaja.replaceChildren(); return; }
      var tiempos = {};
      vis.forEach(function (s) { (datos[s.id] || []).forEach(function (p) { if (p[0] >= vista[0] && p[0] <= vista[1]) tiempos[p[0]] = true; }); });
      var lista = Object.keys(tiempos).map(Number).sort(function (a, b) { return b - a; }).slice(0, 400);
      var tb = el('table'), cab = el('thead'), fila = el('tr');
      fila.appendChild(el('th', '', T.fecha));
      vis.forEach(function (s) { fila.appendChild(el('th', '', s.nombre)); });
      cab.appendChild(fila); tb.appendChild(cab);
      var cuerpo = el('tbody');
      var f = op.formato || numeroCorto;
      lista.forEach(function (t) {
        var r = el('tr');
        r.appendChild(el('td', '', fechaHora(t, idioma)));
        vis.forEach(function (s) {
          var p = indices[s.id] && indices[s.id].get(t);
          r.appendChild(el('td', '', p && p[1] !== null ? f(p[1], s) : '—'));
        });
        cuerpo.appendChild(r);
      });
      tb.appendChild(cuerpo);
      tablaCaja.replaceChildren(tb);
    }

    /* ── LA FICHA Y LA CRUZ ── */
    function señalar(clientX) {
      if (!svg || !geo) return;
      var caja = svg.getBoundingClientRect();
      var x = (clientX - caja.left) * (ancho / caja.width);
      if (x < geo.IZQ || x > ancho - geo.DER) { quitarSeñal(); return; }
      var t = geo.t0 + (x - geo.IZQ) / (ancho - geo.IZQ - geo.DER) * (geo.t1 - geo.t0);
      var vis = visibles();
      // El punto de datos más cercano (de cualquier serie) manda la fecha.
      var mejorT = null, dist = Infinity;
      vis.forEach(function (s) { (datos[s.id] || []).forEach(function (p) { if (p[0] < geo.t0 || p[0] > geo.t1) return; var d = Math.abs(p[0] - t); if (d < dist) { dist = d; mejorT = p[0]; } }); });
      var esc = vis.some(function (s) { return s.escalon; });
      if (mejorT === null || esc) mejorT = esc ? t : mejorT;
      if (mejorT === null) { quitarSeñal(); return; }
      capaHover.replaceChildren();
      var xx = geo.X(mejorT);
      capaHover.appendChild(sv('line', { x1: xx, x2: xx, y1: geo.ARR, y2: geo.alto - geo.ABA, 'class': 'gfg-cruz' }));
      ficha.replaceChildren(el('b', '', fechaHora(mejorT, idioma)));
      var f = op.formato || numeroCorto;
      var acum = 0;
      vis.forEach(function (s) {
        var p = op.tipo === 'barras' ? indices[s.id] && indices[s.id].get(mejorT) : valorEn(s, mejorT);
        var v = p && p[1] !== null && isFinite(p[1]) ? p[1] : null;
        var linea = el('div'), izq = el('span'), cuadro = el('i');
        cuadro.style.background = s.color;
        izq.appendChild(cuadro); izq.appendChild(document.createTextNode(s.nombre));
        linea.appendChild(izq); linea.appendChild(el('em', '', v === null ? '—' : f(v, s)));
        ficha.appendChild(linea);
        if (v !== null && op.tipo !== 'barras') {
          capaHover.appendChild(sv('circle', { cx: xx, cy: geo.Y(v), r: 4.5, fill: s.color, stroke: 'var(--gfg-ficha)', 'stroke-width': 2 }));
        }
        if (v !== null) acum += v;
      });
      if (op.tipo === 'barras' && vis.length > 1) {
        var tot = el('div'); tot.appendChild(el('span', '', idioma === 'es' ? 'Total' : 'Total')); tot.appendChild(el('em', '', f(acum, null)));
        ficha.appendChild(tot);
      }
      ficha.hidden = false;
      var cajaL = lienzo.getBoundingClientRect();
      var px = (xx / ancho) * cajaL.width;
      var w = ficha.offsetWidth || 180;
      var izqF = px + 14 + w > cajaL.width ? px - w - 14 : px + 14;
      ficha.style.left = Math.max(0, izqF) + 'px';
      ficha.style.top = '6px';
    }
    function quitarSeñal() { if (capaHover) capaHover.replaceChildren(); ficha.hidden = true; }

    /* ── MOVER Y ACERCAR ── */
    var punteros = new Map(), arrastre = null, pellizco = null;
    function limitarVista(a, b) {
      var ext = extension;
      var span = b - a, total = ext[1] - ext[0];
      var minimo = Math.min(total, op.tipo === 'barras' ? 3 * DIA : 2 * HORA);
      if (span < minimo) { var c = (a + b) / 2; a = c - minimo / 2; b = c + minimo / 2; span = minimo; }
      if (span >= total) return [ext[0], ext[1]];
      if (a < ext[0]) { b += ext[0] - a; a = ext[0]; }
      if (b > ext[1]) { a -= b - ext[1]; b = ext[1]; }
      return [a, b];
    }
    function acercar(factor, clientX) {
      if (!vista || !extension || !svg) return;
      var caja = svg.getBoundingClientRect();
      var x = clientX === undefined ? caja.left + caja.width / 2 : clientX;
      var frac = Math.max(0, Math.min(1, ((x - caja.left) * (ancho / caja.width) - geo.IZQ) / (ancho - geo.IZQ - geo.DER)));
      var span = (vista[1] - vista[0]) * factor;
      var centro = vista[0] + frac * (vista[1] - vista[0]);
      vista = limitarVista(centro - frac * span, centro + (1 - frac) * span);
      marcarRangoLibre(); pintar();
    }
    function alRueda(e) {
      if (!vista) return;
      e.preventDefault();
      acercar(e.deltaY > 0 ? 1.2 : 1 / 1.2, e.clientX);
    }
    function alBajar(e) {
      if (!vista) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 1) arrastre = { x: e.clientX, vista: vista.slice(), movido: false, id: e.pointerId };
      if (punteros.size === 2) {
        var ps = Array.from(punteros.values());
        pellizco = { d: Math.abs(ps[0].x - ps[1].x) || 1, vista: vista.slice(), c: (ps[0].x + ps[1].x) / 2 };
        arrastre = null;
      }
      try { lienzo.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function alMover(e) {
      if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pellizco && punteros.size === 2 && svg) {
        var ps = Array.from(punteros.values());
        var d = Math.abs(ps[0].x - ps[1].x) || 1;
        var caja = svg.getBoundingClientRect();
        var frac = Math.max(0, Math.min(1, ((pellizco.c - caja.left) * (ancho / caja.width) - geo.IZQ) / (ancho - geo.IZQ - geo.DER)));
        var span = (pellizco.vista[1] - pellizco.vista[0]) * (pellizco.d / d);
        var centro = pellizco.vista[0] + frac * (pellizco.vista[1] - pellizco.vista[0]);
        vista = limitarVista(centro - frac * span, centro + (1 - frac) * span);
        marcarRangoLibre(); pintar();
        return;
      }
      if (arrastre && arrastre.id === e.pointerId && svg) {
        var dx = e.clientX - arrastre.x;
        if (Math.abs(dx) > 4) arrastre.movido = true;
        if (arrastre.movido) {
          lienzo.classList.add('arrastrando');
          var caja2 = svg.getBoundingClientRect();
          var dt = -dx / ((caja2.width * (ancho - geo.IZQ - geo.DER) / ancho) || 1) * (arrastre.vista[1] - arrastre.vista[0]);
          vista = limitarVista(arrastre.vista[0] + dt, arrastre.vista[1] + dt);
          marcarRangoLibre(); pintar();
          return;
        }
      }
      if (e.pointerType === 'mouse' || punteros.size === 0 || (arrastre && !arrastre.movido)) señalar(e.clientX);
    }
    function alSoltar(e) {
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pellizco = null;
      if (arrastre && arrastre.id === e.pointerId) {
        if (!arrastre.movido) señalar(e.clientX);
        arrastre = null;
      }
      lienzo.classList.remove('arrastrando');
    }
    function alSalir(e) { if (e.pointerType === 'mouse' && !arrastre) quitarSeñal(); }
    function alTecla(e) {
      if (!vista) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); acercar(1 / 1.25); }
      else if (e.key === '-') { e.preventDefault(); acercar(1.25); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        var dt = (vista[1] - vista[0]) * 0.15 * (e.key === 'ArrowLeft' ? -1 : 1);
        vista = limitarVista(vista[0] + dt, vista[1] + dt); marcarRangoLibre(); pintar();
      }
    }
    lienzo.tabIndex = 0;
    lienzo.setAttribute('aria-label', op.etiqueta + '. ' + T.ayuda);
    lienzo.addEventListener('wheel', alRueda, { passive: false });
    lienzo.addEventListener('pointerdown', alBajar);
    lienzo.addEventListener('pointermove', alMover);
    lienzo.addEventListener('pointerup', alSoltar);
    lienzo.addEventListener('pointercancel', alSoltar);
    lienzo.addEventListener('pointerleave', alSalir);
    lienzo.addEventListener('keydown', alTecla);

    var vigia = null, vigiaReloj = 0, anchoPintado = 0;
    if (typeof root.ResizeObserver === 'function') {
      vigia = new root.ResizeObserver(function () {
        clearTimeout(vigiaReloj);
        vigiaReloj = setTimeout(function () {
          var w = lienzo.clientWidth;
          if (destruido || !w || Math.abs(w - anchoPintado) < 8) return;
          anchoPintado = w; pintar();
        }, 120);
      });
      vigia.observe(lienzo);
    }

    function actualizar(nuevo) {
      if (destruido) return;
      nuevo = nuevo || {};
      if (nuevo.series) {
        series = nuevo.series.map(function (s, i) { return Object.assign({ color: PALETA[i % PALETA.length] }, s); });
        var vivas = {};
        series.forEach(function (s) { vivas[s.id] = true; });
        for (var k in ocultas) if (!vivas[k]) delete ocultas[k];
      }
      if (nuevo.datos) { datos = normalizar(nuevo.datos); indices = {}; for (var id in datos) indices[id] = new Map(datos[id].map(function(p){return [p[0],p];}).reverse()); }
      if (nuevo.referencia !== undefined) op.referencia = nuevo.referencia;
      var antes = extension;
      extension = calcularExtension();
      pintarLeyenda();
      if (!extension) { vista = null; pintar(); return; }
      // Se conserva el periodo que se está mirando; la primera vez, el de serie.
      if (!vista || !antes) ponerRango(op.rango);
      else { vista = limitarVista(vista[0], vista[1]); pintar(); }
    }
    actualizar({ series: op.series || [], datos: op.datos || {} });

    return {
      actualizar: actualizar,
      pintar: pintar,
      rango: ponerRango,
      destruir: function () {
        if (destruido) return;
        destruido = true;
        clearTimeout(vigiaReloj);
        if (vigia) vigia.disconnect();
        lienzo.removeEventListener('wheel', alRueda);
        lienzo.removeEventListener('pointerdown', alBajar);
        lienzo.removeEventListener('pointermove', alMover);
        lienzo.removeEventListener('pointerup', alSoltar);
        lienzo.removeEventListener('pointercancel', alSoltar);
        lienzo.removeEventListener('pointerleave', alSalir);
        lienzo.removeEventListener('keydown', alTecla);
        punteros.clear(); arrastre = pellizco = null;
        datos = {}; indices = {}; series = []; geo = svg = capaHover = null;
        raiz.remove();
      }
    };
  }

  root.GFGraficos = Object.freeze({ crear: crear, reloj: reloj, fechaHora: fechaHora, numeroCorto: numeroCorto, PALETA: PALETA, aMs: aMs });
})(typeof window !== 'undefined' ? window : this);
