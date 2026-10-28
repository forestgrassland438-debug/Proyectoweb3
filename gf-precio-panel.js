/* =============================================================================
 * EL PANEL "PRICE HISTORY" DE UN OBJETO                            (2026-10-28)
 * -----------------------------------------------------------------------------
 * "En la tienda del juego, un botón en inglés para ver el historial de
 * estadísticas de precio de ese objeto: un panel profesional y cómodo para PC
 * y teléfonos, que ajuste su precio si yo cambio el precio por defecto. Y al
 * lado del botón comprar, ese mismo panel en la tienda P2P."
 *
 *   GFPrecioPanel.abrir({ itemId, nombre, imagen, apiBase, idioma, origen })
 *   GFPrecioPanel.cerrar()
 *
 * Lo pide a /api/economia/precio/:itemId cada vez que se abre (si el panel de
 * administración cambió el precio, se ve al momento). Los gráficos son de
 * gf-graficos.js: hora del servidor en UTC, se acercan y se mueven. Todo con
 * textContent (nada de HTML con datos). Sin velo oscuro detrás: solo el panel.
 * ========================================================================== */
(function (root) {
  'use strict';
  if (root.GFPrecioPanel) return;

  var POR = { bronce: 1, plata: 1000, oro: 1000000 };
  var ICONO = { oro: './Game/Source/moneda de oro.png', plata: './Game/Source/moneda de plata.png', bronce: './Game/Source/moneda de bronce.png' };
  var NOMBRE_MONEDA = { oro: 'Gold', plata: 'Silver', bronce: 'Bronze' };
  var abierto = null;           // { caja, graficos, ctl, alTecla }

  function el(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = String(texto); return e; }
  function num(v, dec) {
    var n = Number(v);
    if (!isFinite(n)) return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: dec === undefined ? (Math.abs(n) < 10 ? 2 : 0) : dec });
  }
  function enMoneda(valor, desde, hacia) { return Number(valor) * (POR[desde] || 1) / (POR[hacia] || 1); }

  function estilos() {
    if (document.getElementById('gfpp-estilos')) return;
    var s = document.createElement('style');
    s.id = 'gfpp-estilos';
    s.textContent = [
      '#gfpp{position:fixed;z-index:100060;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;',
      'background:#14181f;color:#ece9e1;border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.55);',
      'font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:18px 20px 16px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}',
      '#gfpp *{box-sizing:border-box}',
      '#gfpp .gfpp-cab{display:flex;align-items:center;gap:12px;margin-bottom:12px}',
      '#gfpp .gfpp-img{width:52px;height:52px;border-radius:12px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
      '#gfpp .gfpp-img img{max-width:40px;max-height:40px;image-rendering:pixelated}',
      '#gfpp h2{margin:0;font-size:18px;line-height:1.2;color:#fff}',
      '#gfpp .gfpp-sub{font-size:12px;color:#a9a69c;margin-top:2px}',
      '#gfpp .gfpp-x{margin-left:auto;appearance:none;border:0;background:rgba(255,255,255,.08);color:#fff;width:36px;height:36px;border-radius:10px;font-size:18px;cursor:pointer;flex:0 0 auto}',
      '#gfpp .gfpp-x:hover{background:rgba(255,255,255,.16)}',
      '#gfpp .gfpp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px}',
      '#gfpp .gfpp-kpi{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 12px;min-width:0}',
      '#gfpp .gfpp-kpi span{display:block;font-size:11px;color:#a9a69c;text-transform:uppercase;letter-spacing:.04em}',
      '#gfpp .gfpp-kpi b{display:flex;align-items:center;gap:6px;font-size:18px;color:#fff;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '#gfpp .gfpp-kpi b img{width:18px;height:18px;image-rendering:pixelated}',
      '#gfpp .gfpp-kpi small{display:block;font-size:11px;color:#a9a69c;margin-top:2px}',
      '#gfpp .gfpp-cambios{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 14px}',
      '#gfpp .gfpp-cambio{font-size:12px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.06);font-variant-numeric:tabular-nums}',
      '#gfpp .gfpp-cambio[data-sube="true"]{color:#f2a07b}',
      '#gfpp .gfpp-cambio[data-sube="false"]{color:#7fb4f0}',
      '#gfpp section{border-top:1px solid rgba(255,255,255,.08);padding-top:12px;margin-top:12px}',
      '#gfpp h3{font-size:14px;margin:0 0 2px;color:#fff}',
      '#gfpp .gfpp-nota{font-size:12px;color:#a9a69c;margin:0 0 8px}',
      '#gfpp .gfpp-pie{font-size:11px;color:#8d8a80;margin-top:12px}',
      '#gfpp .gfpp-estado{padding:30px 0;text-align:center;color:#a9a69c}',
      '@media (max-width:640px){#gfpp{left:0;right:0;top:auto;bottom:0;transform:none;width:100%;max-height:88vh;border-radius:18px 18px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom))}',
      '#gfpp .gfpp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#gfpp h2{font-size:16px}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  function cerrar() {
    if (!abierto) return;
    try { abierto.ctl.abort(); } catch (_) {}
    abierto.graficos.forEach(function (g) { try { g.destruir(); } catch (_) {} });
    document.removeEventListener('keydown', abierto.alTecla, true);
    abierto.caja.remove();
    var volver = abierto.volver;
    abierto = null;
    try { if (volver && volver.focus) volver.focus(); } catch (_) {}
  }

  function kpi(etiqueta, valor, moneda, nota) {
    var k = el('div', 'gfpp-kpi');
    k.appendChild(el('span', '', etiqueta));
    var b = el('b');
    if (moneda && ICONO[moneda]) { var i = el('img'); i.src = ICONO[moneda]; i.alt = NOMBRE_MONEDA[moneda]; b.appendChild(i); }
    b.appendChild(document.createTextNode(valor));
    k.appendChild(b);
    if (nota) k.appendChild(el('small', '', nota));
    return k;
  }

  /** El cambio de un precio entre hace `dias` y ahora (sobre la serie de la tienda). */
  function cambio(puntos, dias, ahora) {
    if (!puntos.length) return null;
    var limite = ahora - dias * 86400000, ref = null;
    for (var i = 0; i < puntos.length; i++) { if (puntos[i][0] <= limite) ref = puntos[i]; else break; }
    if (!ref) return null;
    var fin = puntos[puntos.length - 1][1];
    return ref[1] > 0 ? (fin - ref[1]) / ref[1] : null;
  }

  function abrir(o) {
    o = o || {};
    if (!o.itemId) return;
    cerrar();
    estilos();
    var G = root.GFGraficos;
    var idioma = o.idioma === 'es' ? 'es' : 'en';
    var es = idioma === 'es';
    var caja = el('div');
    caja.id = 'gfpp';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'false');
    caja.setAttribute('aria-label', (es ? 'Historial de precio: ' : 'Price history: ') + (o.nombre || o.itemId));
    var cab = el('div', 'gfpp-cab');
    var img = el('div', 'gfpp-img');
    if (o.imagen) { var im = el('img'); im.src = o.imagen; im.alt = ''; im.onerror = function () { im.remove(); }; img.appendChild(im); }
    var tit = el('div');
    tit.appendChild(el('h2', '', o.nombre || o.itemId));
    tit.appendChild(el('div', 'gfpp-sub', es ? 'Historial y estadísticas de precio' : 'Price history & statistics'));
    var x = el('button', 'gfpp-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', es ? 'Cerrar' : 'Close');
    x.addEventListener('click', cerrar);
    cab.appendChild(img); cab.appendChild(tit); cab.appendChild(x);
    var cuerpo = el('div');
    cuerpo.appendChild(el('div', 'gfpp-estado', es ? 'Cargando precios…' : 'Loading prices…'));
    caja.appendChild(cab); caja.appendChild(cuerpo);
    document.body.appendChild(caja);
    // Que lo de debajo (la tienda, el juego) no reciba los toques del panel.
    ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(function (ev) { caja.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    var alTecla = function (e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('keydown', alTecla, true);
    var ctl = typeof AbortController === 'function' ? new AbortController() : { abort: function () {}, signal: undefined };
    abierto = { caja: caja, graficos: [], ctl: ctl, alTecla: alTecla, volver: document.activeElement };
    try { x.focus(); } catch (_) {}

    var base = String(o.apiBase || '').replace(/\/+$/, '');
    var yo = abierto;
    fetch(base + '/api/economia/precio/' + encodeURIComponent(o.itemId) + '?dias=365', { credentials: 'include', cache: 'no-store', signal: ctl.signal })
      .then(function (r) { if (!r.ok) { var e = new Error('http'); e.status = r.status; throw e; } return r.json(); })
      .then(function (d) { if (abierto === yo) pintar(yo, cuerpo, d, o, idioma); })
      .catch(function (e) {
        if (abierto !== yo || (e && e.name === 'AbortError')) return;
        cuerpo.replaceChildren(el('div', 'gfpp-estado', e && e.status === 404
          ? (es ? 'El servidor todavía no tiene el historial de precios.' : 'The server does not have price history yet.')
          : (es ? 'No se pudieron cargar los precios. Inténtalo otra vez.' : 'Prices could not be loaded. Try again.')));
      });
  }

  function pintar(yo, cuerpo, d, o, idioma) {
    var G = root.GFGraficos, es = idioma === 'es';
    if (G && d.ahora) G.reloj.ajustar(d.ahora);
    var ahora = G ? G.reloj.ahora() : Date.now();
    var a = d.actual || null;
    var moneda = a ? a.moneda : 'plata';
    cuerpo.replaceChildren();
    // Las series de la tienda, en la moneda de HOY (si el panel la cambió, lo de antes se convierte).
    var hist = (d.historial || []).map(function (h) { return { t: G ? G.aMs(h.t) : Date.parse(h.t), compra: enMoneda(h.compra, h.moneda, moneda), venta: enMoneda(h.venta, h.moneda, moneda), indice: h.indice }; });
    var compra = hist.filter(function (h) { return h.compra > 0; }).map(function (h) { return [h.t, h.compra]; });
    var venta = hist.filter(function (h) { return h.venta > 0; }).map(function (h) { return [h.t, h.venta]; });
    var principal = compra.length ? compra : venta;

    var kpis = el('div', 'gfpp-kpis');
    if (a && a.tienda && a.compra > 0) kpis.appendChild(kpi(es ? 'Precio de compra' : 'Buy price', num(a.compra), moneda, es ? 'Tienda del juego, hoy' : 'Game shop, today'));
    if (a && a.venta > 0) kpis.appendChild(kpi(a.tienda ? (es ? 'Precio de venta' : 'Sell price') : (es ? 'Valor de referencia' : 'Reference value'), num(a.venta), moneda,
      a.tienda ? (es ? 'Lo que paga la tienda' : 'What the shop pays') : (es ? 'No se vende en la tienda' : 'Not sold in the shop')));
    if (a && a.base) {
      var bm = a.base.moneda || moneda;
      kpis.appendChild(kpi(es ? 'Precio por defecto' : 'Default price', num(a.base.compra > 0 ? a.base.compra : a.base.venta), bm,
        (a.cambiado ? (es ? 'Ajustado por el administrador · ' : 'Set by the admin · ') : '') + (es ? 'índice ×' : 'index ×') + num(d.indice || 1, 3)));
    }
    var p2 = d.p2p && d.p2p.resumen;
    if (p2 && p2.n) kpis.appendChild(kpi(es ? 'Mediana P2P (14 d)' : 'P2P median (14 d)', num(enMoneda(p2.mediana, 'bronce', moneda)), moneda,
      p2.n + (es ? ' ventas · ' : ' sales · ') + num(p2.volumen) + (es ? ' uds.' : ' units')));
    else kpis.appendChild(kpi(es ? 'Valor de mercado' : 'Market value', num(enMoneda(d.valorBronce, 'bronce', moneda)), moneda, es ? 'Para quemas y servicios' : 'Used for burns and services'));
    cuerpo.appendChild(kpis);

    var cambios = el('div', 'gfpp-cambios');
    [[1, '24h'], [7, '7d'], [30, '30d'], [90, '90d']].forEach(function (c) {
      var v = cambio(principal, c[0], ahora);
      if (v === null) return;
      var s = el('span', 'gfpp-cambio', c[1] + ' ' + (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '■ ') + (v * 100).toFixed(1) + '%');
      if (v !== 0) s.dataset.sube = String(v > 0);
      cambios.appendChild(s);
    });
    if (cambios.childNodes.length) cuerpo.appendChild(cambios);

    var etiquetaMoneda = es ? { oro: 'oro', plata: 'plata', bronce: 'bronce' }[moneda] : NOMBRE_MONEDA[moneda];
    var formato = function (v) { return num(v) + ' ' + etiquetaMoneda; };
    var seccion = function (titulo, nota) { var s = el('section'); s.appendChild(el('h3', '', titulo)); if (nota) s.appendChild(el('p', 'gfpp-nota', nota)); var c = el('div'); s.appendChild(c); cuerpo.appendChild(s); return c; };

    if (G) {
      var c1 = seccion(es ? 'Precio en la tienda del juego' : 'Game shop price',
        es ? 'Sube y baja con la inflación de la economía y la demanda del objeto. Cada escalón es un cambio de precio.' : 'It moves with the economy\'s inflation and the item\'s demand. Each step is a price change.');
      var series = [];
      if (compra.length) series.push({ id: 'compra', nombre: es ? 'Compra' : 'Buy', color: '#3987e5', escalon: true, area: true });
      if (venta.length) series.push({ id: 'venta', nombre: a && !a.tienda ? (es ? 'Valor' : 'Value') : (es ? 'Venta' : 'Sell'), color: '#d95926', escalon: true });
      yo.graficos.push(G.crear(c1, { series: series, datos: { compra: compra, venta: venta }, formato: formato, rango: '30d', rangos: ['7d', '30d', '90d', 'todo'],
        hastaAhora: true, idioma: idioma, tema: 'oscuro', alto: 220, etiqueta: (es ? 'Precio de ' : 'Price of ') + (o.nombre || o.itemId),
        vacio: es ? 'Todavía no hay historial de precio.' : 'No price history yet.' }));

      // El P2P: la mediana de cada día (línea) y cuántas unidades se vendieron (barras), en gráficos separados.
      var porDia = {};
      ((d.p2p && d.p2p.ventas) || []).forEach(function (v) {
        var t = G.aMs(v.t); if (!isFinite(t)) return;
        var dia = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate());
        var u = enMoneda(v.precio, v.moneda, moneda);
        (porDia[dia] = porDia[dia] || { p: [], q: 0 }).p.push(u);
        porDia[dia].q += Math.max(1, Number(v.cantidad) || 1);
      });
      var dias = Object.keys(porDia).map(Number).sort(function (x, y) { return x - y; });
      var c2 = seccion(es ? 'Mercado P2P' : 'P2P market', es ? 'Lo que pagan los jugadores entre ellos: la mediana por día.' : 'What players pay each other: the daily median.');
      yo.graficos.push(G.crear(c2, { series: [{ id: 'mediana', nombre: es ? 'Mediana P2P' : 'P2P median', color: '#199e70' }],
        datos: { mediana: dias.map(function (t) { var p = porDia[t].p.slice().sort(function (x, y) { return x - y; }); return [t, p[Math.floor(p.length / 2)]]; }) },
        formato: formato, rango: 'todo', rangos: ['30d', '90d', 'todo'], idioma: idioma, tema: 'oscuro', alto: 170, tabla: true,
        etiqueta: es ? 'Mediana del P2P' : 'P2P median', vacio: es ? 'Nadie lo ha vendido en el P2P en los últimos 90 días.' : 'No P2P sales in the last 90 days.' }));
      if (dias.length) {
        var c3 = seccion(es ? 'Unidades vendidas en el P2P' : 'Units sold on P2P', null);
        yo.graficos.push(G.crear(c3, { tipo: 'barras', series: [{ id: 'q', nombre: es ? 'Unidades' : 'Units', color: '#9085e9' }],
          datos: { q: dias.map(function (t) { return [t, porDia[t].q]; }) }, formato: function (v) { return num(v, 0); }, rango: 'todo', rangos: ['30d', '90d', 'todo'],
          idioma: idioma, tema: 'oscuro', alto: 140, etiqueta: es ? 'Unidades vendidas' : 'Units sold' }));
      }
      if ((d.tienda || []).length) {
        var c4 = seccion(es ? 'Tienda del juego: compras y ventas' : 'Game shop: bought & sold', es ? 'Unidades por día (30 días).' : 'Units per day (30 days).');
        yo.graficos.push(G.crear(c4, { tipo: 'barras', series: [{ id: 'c', nombre: es ? 'Compradas' : 'Bought', color: '#3987e5' }, { id: 'v', nombre: es ? 'Vendidas' : 'Sold', color: '#d95926' }],
          datos: { c: d.tienda.map(function (x) { return [x.dia, x.compras]; }), v: d.tienda.map(function (x) { return [x.dia, x.ventas]; }) },
          formato: function (v) { return num(v, 0); }, rango: 'todo', rangos: [], idioma: idioma, tema: 'oscuro', alto: 140, etiqueta: es ? 'Compras y ventas de la tienda' : 'Shop purchases and sales' }));
      }
    }
    cuerpo.appendChild(el('div', 'gfpp-pie', (es ? 'Horas en UTC, con el reloj del servidor · actualizado ' : 'Times in UTC, server clock · updated ') +
      (G ? G.fechaHora(ahora, idioma) : new Date().toUTCString())));
  }

  /* El botón "Price history" de la tienda (index.html) está desde el principio:
     su hueco se pone al cargar, no al abrir el panel. */
  (function estiloBoton() {
    if (typeof document === 'undefined' || document.getElementById('gfpp-boton')) return;
    var s = document.createElement('style');
    s.id = 'gfpp-boton';
    s.textContent = '.detail-actions-simple .gf-precio-btn{margin:0;background:#153e38;border:1px solid #679c87;box-shadow:none;font:600 13px/1.4 system-ui;letter-spacing:0;text-transform:none;min-height:44px}' +
      '.mobile-action-section .gf-precio-btn{width:100%;margin:0 0 8px}' +
      '.gf-precio-btn[disabled]{opacity:.5;cursor:not-allowed}';
    (document.head || document.documentElement).appendChild(s);
  })();

  root.GFPrecioPanel = Object.freeze({ abrir: abrir, cerrar: cerrar, abierto: function () { return !!abierto; } });
})(typeof window !== 'undefined' ? window : this);
