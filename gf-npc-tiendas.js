/* ===========================================================================
 * gf-npc-tiendas.js — LOS PANELES DE MARTHA Y DE TOBIAS            (2026-11-02)
 * ===========================================================================
 *
 * "Quiero que Tobias tenga nombre de repostero y venda tortas, con sus tablas
 * automáticas y su panel con los precios respetando la subida o bajada de la
 * economía, y que Martha pida recetas para fabricar panes: 20 que ella venda."
 *
 * Dos pestañas:
 *   · Buy: lo que vende, al precio de HOY. Paga por la misma operación de la
 *     tienda (TiendaSistema._operacionEconomicaTienda → /api/economia/tienda):
 *     mismos precios con inflación y demanda, misma comisión, misma cola y misma
 *     referencia si hay que repetir. Aquí no se calcula ningún precio.
 *   · Recipes: lo que te hace si le traes los ingredientes. Crafteo autoritativo
 *     (/api/craft/execute): el servidor mira nivel y materiales y cobra la comisión.
 *
 * Los datos salen de gf-items-v2.js (window.GFItemsV2.npcs). Lo abre gf-npcs.js
 * al hablar con el NPC; si te alejas, se cierra.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFNpcTiendas) return;

  var st = null;
  var CSS =
    '#gfnt-fondo{position:fixed;inset:0;z-index:990;background:rgba(0,0,0,.42)}' +
    '#gfnt{position:fixed;left:50%;top:calc(50% + 26px);transform:translate(-50%,-50%);z-index:995;width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);display:flex;flex-direction:column;gap:8px;padding:0 14px 12px;box-sizing:border-box;' +
      'background:linear-gradient(165deg,rgba(42,34,66,.98),rgba(24,20,40,.98) 52%,rgba(14,12,26,.98));border:1.5px solid rgba(242,195,92,.58);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.62);color:#fff4dd;font:500 13px "Segoe UI",Tahoma,Geneva,Verdana,sans-serif}' +
    '#gfnt *{box-sizing:border-box}' +
    '.gfnt-cab{display:flex;align-items:center;gap:10px;padding:10px 0 6px;border-bottom:1px solid rgba(242,195,92,.25)}' +
    '.gfnt-cab img{width:34px;height:34px;object-fit:contain;image-rendering:pixelated}' +
    '.gfnt-tit{flex:1;min-width:0}.gfnt-tit b{display:block;font-size:16px;color:#ffd678}.gfnt-tit span{display:block;font-size:12px;font-style:italic;color:#d9cfe9}' +
    '.gfnt-x{flex:0 0 auto;width:32px;height:32px;border:0;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:15px;cursor:pointer}.gfnt-x:hover{background:rgba(255,255,255,.18)}' +
    '.gfnt-pes{display:flex;gap:6px}.gfnt-pes button{flex:1;min-height:34px;border:1.5px solid rgba(242,195,92,.35);border-radius:8px;background:rgba(255,255,255,.05);color:#f1e3d2;font-weight:700;cursor:pointer}' +
    '.gfnt-pes button[aria-selected="true"]{background:rgba(242,195,92,.2);border-color:#f2c35c;color:#ffe9b0}' +
    '.gfnt-bolsa{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#d9cfe9}.gfnt-bolsa span{display:inline-flex;align-items:center;gap:4px}.gfnt-bolsa img{width:14px;height:14px;image-rendering:pixelated}' +
    '.gfnt-lista{flex:1 1 auto;min-height:120px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:6px;align-content:start;padding-right:2px}' +
    '.gfnt-c{position:relative;display:flex;align-items:center;gap:8px;min-height:58px;padding:6px 8px;text-align:left;border:1.5px solid rgba(185,127,86,.45);border-radius:8px;background:rgba(153,100,62,.16);color:inherit;font:inherit;cursor:pointer}' +
    '.gfnt-c:hover{background:rgba(153,100,62,.28)}.gfnt-c[aria-pressed="true"]{border-color:#f2c35c;background:rgba(242,195,92,.16)}' +
    '.gfnt-c img{flex:0 0 auto;width:36px;height:36px;object-fit:contain;image-rendering:pixelated}' +
    '.gfnt-c.bloq img{filter:grayscale(1) brightness(.65)}.gfnt-c.bloq{opacity:.72}' +
    '.gfnt-c b{display:block;font-size:12px;line-height:1.2;color:#fff4dd}.gfnt-c small{display:block;font-size:11px;line-height:1.25;color:#cfc4df}' +
    '.gfnt-pr{display:inline-flex;align-items:center;gap:3px;font-weight:700;color:#ffd678}.gfnt-pr img{width:12px;height:12px}' +
    '.gfnt-sube{color:#ff9d7a}.gfnt-baja{color:#8fe08f}' +
    '.gfnt-pie{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:8px;border-top:1px solid rgba(242,195,92,.25)}' +
    '.gfnt-pie .gfnt-det{flex:1 1 220px;min-width:0;font-size:12px;color:#e6dcf2}' +
    '.gfnt-ing{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}.gfnt-ing span{display:inline-flex;align-items:center;gap:3px;padding:1px 6px 1px 3px;border-radius:999px;background:rgba(255,255,255,.08);font-size:11px}.gfnt-ing img{width:16px;height:16px;object-fit:contain;image-rendering:pixelated}.gfnt-ing .falta{color:#ff9d7a;background:rgba(200,60,40,.2)}' +
    '.gfnt-cant{display:inline-flex;align-items:center;gap:4px}.gfnt-cant button{width:34px;height:34px;border:0;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;font-size:17px;cursor:pointer}.gfnt-cant output{min-width:26px;text-align:center;font-weight:700}' +
    '.gfnt-ok{min-height:38px;padding:0 16px;border:0;border-radius:8px;background:#3f8f4a;color:#fff;font-weight:700;cursor:pointer}.gfnt-ok:hover{background:#4da559}.gfnt-ok:disabled{background:#555a55;color:#c9c9c9;cursor:not-allowed}' +
    '.gfnt-nota{font-size:11px;color:#b9aecb}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function v2() { return window.GFItemsV2; }
  function objeto(id) { return window.GFPlantCatalog && window.GFPlantCatalog.items[id]; }
  function nombre(id) {
    var o = objeto(id);
    if (o && o.name) return o.name;
    var e = st && st.scene;
    try { if (e && typeof e.getItemDisplayName === 'function') return e.getItemDisplayName(id); } catch (x) {}
    return id;
  }
  function icono(id) {
    var o = objeto(id);
    if (o && o.src) return o.src;
    var defs = st && st.scene && st.scene.ItemDefinitions;
    return (defs && defs[id] && defs[id].src) || '';
  }
  function cuantos(id) {
    var e = st && st.scene;
    try { return e && typeof e.contarItemEnInventario === 'function' ? Number(e.contarItemEnInventario(id)) || 0 : 0; } catch (x) { return 0; }
  }
  function tienda() {
    if (window.tiendaSistema) { window.tiendaSistema.scene = st.scene; return window.tiendaSistema; }
    if (typeof window.initTienda === 'function') return window.initTienda(st.scene);
    try { return typeof initTienda === 'function' ? initTienda(st.scene) : null; } catch (x) { return null; } // eslint-disable-line no-undef
  }
  function nivel() {
    var t = tienda();
    try { return t && typeof t._playerLevel === 'function' ? Number(t._playerLevel()) || 1 : 1; } catch (x) { return 1; }
  }
  function fichaHoy(id) {
    var t = tienda(), listas = t && t.itemsTienda ? Object.values(t.itemsTienda) : [];
    for (var i = 0; i < listas.length; i++) {
      if (!Array.isArray(listas[i])) continue;
      for (var j = 0; j < listas[i].length; j++) if (listas[i][j] && listas[i][j].id === id) return listas[i][j];
    }
    return null;
  }
  function moneda(t, f) {
    var c = t.getItemCurrency(f);
    return { icono: t.getCurrencyIconPath(c), etiqueta: t.getCurrencyLabel(c) };
  }
  function precioHtml(t, f, cantidad) {
    var m = moneda(t, f);
    return '<span class="gfnt-pr"><img src="' + esc(m.icono) + '" alt="">' + (f.buyPrice * (cantidad || 1)).toLocaleString('en-US') + ' ' + esc(m.etiqueta) + '</span>';
  }
  function tendencia(f) {
    var base = f._precioDefecto && Number(f._precioDefecto.buyPrice);
    if (!base || !f.buyPrice || f.buyPrice === base) return '';
    var pct = Math.round((f.buyPrice / base - 1) * 100);
    if (!pct) return '';
    return ' <span class="' + (pct > 0 ? 'gfnt-sube' : 'gfnt-baja') + '" title="Compared with the base price">' + (pct > 0 ? '▲ +' : '▼ ') + pct + '%</span>';
  }

  function montar() {
    if (document.getElementById('gfnt')) return;
    if (!document.getElementById('gfnt-css')) {
      var s = document.createElement('style');
      s.id = 'gfnt-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    var f = document.createElement('div');
    f.id = 'gfnt-fondo';
    f.addEventListener('click', cerrar);
    document.body.appendChild(f);
    var p = document.createElement('div');
    p.id = 'gfnt';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-labelledby', 'gfnt-nombre');
    p.innerHTML =
      '<div class="gfnt-cab"><img id="gfnt-ico" alt="" draggable="false">' +
        '<div class="gfnt-tit"><b id="gfnt-nombre"></b><span id="gfnt-saludo"></span></div>' +
        '<button type="button" class="gfnt-x" data-accion="cerrar" aria-label="Close">✕</button></div>' +
      '<div class="gfnt-pes" role="tablist">' +
        '<button type="button" role="tab" data-pestana="comprar">Buy</button>' +
        '<button type="button" role="tab" data-pestana="recetas">Recipes</button></div>' +
      '<div class="gfnt-bolsa" id="gfnt-bolsa"></div>' +
      '<div class="gfnt-lista" id="gfnt-lista"></div>' +
      '<div class="gfnt-pie" id="gfnt-pie"></div>';
    p.addEventListener('click', alPulsar);
    // Que un clic en el panel no llegue a Phaser (andar, pescar...).
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(function (ev) {
      p.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    document.body.appendChild(p);
  }

  function saldo(t) {
    var e = st.scene;
    var d = (window.playerStats || {});
    var cosas = [['gold', d.oro], ['silver', d.plata], ['bronze', d.bronce]];
    return cosas.map(function (c) {
      return '<span><img src="' + esc(t.getCurrencyIconPath(c[0])) + '" alt="">' + (Number(c[1]) || 0).toLocaleString('en-US') + ' ' + t.getCurrencyLabel(c[0]) + '</span>';
    }).join('') + (e ? '<span class="gfnt-nota">Your level: ' + nivel() + '</span>' : '');
  }

  function pintar() {
    if (!st) return;
    var t = tienda(), d = v2().npcs[st.npc];
    if (!t || !d) return;
    document.querySelectorAll('#gfnt .gfnt-pes button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.pestana === st.pestana ? 'true' : 'false'); });
    document.getElementById('gfnt-bolsa').innerHTML = saldo(t);
    var lista = document.getElementById('gfnt-lista'), arriba = lista.scrollTop, h = '', yo = nivel();
    if (st.pestana === 'comprar') {
      d.venta.forEach(function (id) {
        var f = fichaHoy(id);
        if (!f || !(f.buyPrice > 0)) return;
        var nv = Number(f.nivelRequerido) || 1, bloq = yo < nv, gana = v2().food[id];
        h += '<button type="button" class="gfnt-c' + (bloq ? ' bloq' : '') + '" data-id="' + esc(id) + '" aria-pressed="' + (st.sel === id ? 'true' : 'false') + '">' +
          '<img src="' + esc(f.image) + '" alt="" loading="lazy"><span><b>' + esc(f.name) + '</b>' +
          '<small>' + (bloq ? '🔒 ' : '') + 'Level ' + nv + (gana ? ' · +' + gana + ' food' : '') + '</small>' +
          '<small>' + precioHtml(t, f) + tendencia(f) + '</small></span></button>';
      });
    } else {
      d.recetas.forEach(function (rid) {
        var r = v2().recipes.find(function (x) { return x.id === rid; });
        if (!r) return;
        var bloq = yo < r.level, listo = r.resources.every(function (m) { return cuantos(m.itemId) >= m.quantity; });
        h += '<button type="button" class="gfnt-c' + (bloq ? ' bloq' : '') + '" data-id="' + esc(rid) + '" aria-pressed="' + (st.sel === rid ? 'true' : 'false') + '">' +
          '<img src="' + esc(icono(r.itemId)) + '" alt="" loading="lazy"><span><b>' + esc(nombre(r.itemId)) + (r.quantity > 1 ? ' ×' + r.quantity : '') + '</b>' +
          '<small>' + (bloq ? '🔒 ' : '') + 'Level ' + r.level + '</small>' +
          '<small>' + (listo ? '<span class="gfnt-baja">Ingredients ready</span>' : 'Needs ' + r.resources.length + ' ingredient' + (r.resources.length > 1 ? 's' : '')) + '</small></span></button>';
      });
    }
    lista.innerHTML = h;
    lista.scrollTop = arriba;
    pintarPie(t);
  }

  function pintarPie(t) {
    var pie = document.getElementById('gfnt-pie'), yo = nivel();
    if (!st.sel) {
      pie.innerHTML = '<div class="gfnt-det gfnt-nota">' + (st.pestana === 'comprar'
        ? 'Prices follow the game\'s economy: they move with inflation and demand. Sell what you make at the shop.'
        : 'Bring the ingredients and pick a recipe. A small fee is charged when it is ready.') + '</div>';
      return;
    }
    var cant = '<span class="gfnt-cant"><button type="button" data-accion="menos" aria-label="Less">−</button><output>' + st.cantidad + '</output><button type="button" data-accion="mas" aria-label="More">+</button></span>';
    if (st.pestana === 'comprar') {
      var f = fichaHoy(st.sel);
      if (!f) { st.sel = null; pie.innerHTML = ''; return; }
      var nv = Number(f.nivelRequerido) || 1;
      pie.innerHTML = '<div class="gfnt-det"><b>' + esc(f.name) + '</b>: ' + esc(f.descripcion || '') + '<br>Total: ' + precioHtml(t, f, st.cantidad) + ' <span class="gfnt-nota">+ 1.5% treasury fee · you have ' + cuantos(st.sel) + '</span></div>' + cant +
        '<button type="button" class="gfnt-ok" data-accion="comprar"' + (st.ocupado || yo < nv ? ' disabled' : '') + '>' + (st.ocupado ? 'Working…' : yo < nv ? 'Level ' + nv : 'Buy') + '</button>';
      return;
    }
    var r = v2().recipes.find(function (x) { return x.id === st.sel; });
    if (!r) { st.sel = null; pie.innerHTML = ''; return; }
    var chips = r.resources.concat([]).map(function (m) {
      var hace = m.quantity * st.cantidad, hay = cuantos(m.itemId);
      return '<span class="' + (hay < hace ? 'falta' : '') + '" title="' + esc(nombre(m.itemId)) + '"><img src="' + esc(icono(m.itemId)) + '" alt="">' + hay + '/' + hace + ' ' + esc(nombre(m.itemId)) + '</span>';
    }).join('');
    var alcanza = r.resources.every(function (m) { return cuantos(m.itemId) >= m.quantity * st.cantidad; });
    var fee = st.feeTexto ? ' · Fee ' + st.feeTexto : '';
    pie.innerHTML = '<div class="gfnt-det"><b>' + esc(nombre(r.itemId)) + ' ×' + (r.quantity * st.cantidad) + '</b>' + fee +
      (r.returns ? ' <span class="gfnt-nota">· you get the bucket back</span>' : '') + '<div class="gfnt-ing">' + chips + '</div></div>' + cant +
      '<button type="button" class="gfnt-ok" data-accion="cocinar"' + (st.ocupado || yo < r.level || !alcanza ? ' disabled' : '') + '>' + (st.ocupado ? 'Working…' : yo < r.level ? 'Level ' + r.level : !alcanza ? 'Missing items' : 'Make it') + '</button>';
    pedirComision(r);
  }

  function pedirComision(r) {
    var clave = r.id + '|' + st.cantidad;
    if (st.feeClave === clave || !window.GFServicios) return;
    st.feeClave = clave;
    st.feeTexto = '';
    window.GFServicios.precio('craftear', r.itemId, r.quantity * st.cantidad).then(function (b) {
      if (!st || st.feeClave !== clave) return;
      st.feeTexto = b != null ? Number(b).toLocaleString('en-US') + ' BR' : '';
      pintarPie(tienda());
    }).catch(function () {});
  }

  function aviso(texto, tipo) {
    var e = st && st.scene;
    try { if (e && e.notifications && e.notifications.show) { e.notifications.show(texto, tipo || 'info'); return; } } catch (x) {}
    var t = window.tiendaSistema;
    if (t && t.showNotification) t.showNotification(texto, tipo || 'info');
  }

  async function comprar() {
    if (!st || st.ocupado || !st.sel) return;
    var t = tienda(), f = fichaHoy(st.sel);
    if (!t || !f) return;
    st.ocupado = true;
    pintarPie(t);
    try {
      await t._cargarPreciosServidor();
      await t._operacionEconomicaTienda('compra', Object.assign({}, fichaHoy(st.sel) || f), st.cantidad, t._nuevaRef());
    } catch (e) {
      // _operacionEconomicaTienda ya le dijo al jugador qué pasó.
      if (e && !e.code) aviso((e && e.message) || 'The purchase could not be completed.', 'error');
    } finally {
      if (st) { st.ocupado = false; pintar(); }
    }
  }

  async function llamar(ruta, cuerpo) {
    var r = await window.GFMascota.api(ruta, cuerpo);
    var d = r && r.datos;
    if (!r || !d) throw Object.assign(new Error('The server did not answer. Please try again.'), { pasajero: true });
    if (!r.ok && r.status !== 202) throw Object.assign(new Error(MENSAJES[d.error] || d.message || 'This could not be made right now.'), { code: d.error });
    return d;
  }
  var MENSAJES = {
    craft_materials_missing: 'You do not have all the ingredients.',
    craft_level_required: 'Your level is too low for this recipe.',
    saldo_insuficiente: 'You do not have enough coins for the fee.',
    fantasma: 'You cannot do this while you are a ghost.',
    craft_previous_pending: 'Another item operation is still finishing. Try again in a moment.'
  };

  async function cocinar() {
    if (!st || st.ocupado || !st.sel) return;
    var yo = st, r = v2().recipes.find(function (x) { return x.id === st.sel; });
    if (!r) return;
    yo.ocupado = true;
    pintarPie(tienda());
    try {
      var scene = yo.scene, run = scene._sceneRunId, data;
      var clave = r.id + ':' + yo.cantidad;
      // Si se corta la red y se repite, la misma referencia no cobra dos veces.
      if (!yo.ticket || yo.ticket.clave !== clave) yo.ticket = { clave: clave, ref: window.crypto.randomUUID() };
      var pendiente = await llamar('/api/craft/pending');
      if (pendiente.rows && pendiente.rows.length && pendiente.rows[0].recipe !== r.id) {
        aviso('Finishing your previous operation first…', 'info');
        var previa = await llamar('/api/craft/reconcile', { operationId: pendiente.rows[0]._id });
        if (window.GFNativeCrops) window.GFNativeCrops.adopt(scene, previa, run);
        if (!previa.ok) { aviso('Your previous operation is still being confirmed. Try again in a moment.', 'warning'); return; }
      }
      data = await llamar('/api/craft/execute', { recipeId: r.id, quantity: yo.cantidad, ref: yo.ticket.ref });
      if (window.GFNativeCrops) window.GFNativeCrops.adopt(scene, data, run);
      if (!data.ok) {
        if (data.status === 'cancelled') { yo.ticket = null; aviso('It could not be started: nothing was charged. Check your ingredients.', 'warning'); }
        else aviso('Saved. It is being confirmed on-chain and will arrive in your bag.', 'info');
        return;
      }
      yo.ticket = null;
      aviso('✓ ' + (data.resultQuantity || r.quantity * yo.cantidad) + 'x ' + nombre(r.itemId) + ' ready!', 'success');
    } catch (e) {
      aviso((e && e.message) || 'This could not be made right now.', 'error');
    } finally {
      yo.ocupado = false;
      if (st === yo) pintar();
    }
  }

  function alPulsar(e) {
    if (!st) return;
    var obj = e.target && e.target.closest ? e.target.closest('[data-accion],[data-pestana],.gfnt-c') : null;
    if (!obj) return;
    if (obj.dataset.pestana) {
      st.pestana = obj.dataset.pestana; st.sel = null; st.cantidad = 1; st.feeClave = null; st.feeTexto = '';
      document.getElementById('gfnt-lista').scrollTop = 0;
      pintar();
      return;
    }
    if (obj.classList.contains('gfnt-c')) {
      st.sel = obj.dataset.id; st.cantidad = 1; st.feeClave = null; st.feeTexto = '';
      pintar();
      return;
    }
    var a = obj.dataset.accion;
    if (a === 'cerrar') cerrar();
    else if (a === 'menos') { st.cantidad = Math.max(1, st.cantidad - 1); pintarPie(tienda()); }
    else if (a === 'mas') { st.cantidad = Math.min(20, st.cantidad + 1); pintarPie(tienda()); }
    else if (a === 'comprar') comprar();
    else if (a === 'cocinar') cocinar();
  }

  function alEsc(e) { if (e.key === 'Escape') cerrar(); }

  function abrir(scene, npc) {
    var d = v2() && v2().npcs[npc];
    if (!d || !window.GFMascota) return false;
    if (st && st.npc === npc) return true;
    cerrar();
    st = { scene: scene, npc: npc, pestana: 'comprar', sel: null, cantidad: 1, ocupado: false, ticket: null, feeClave: null, feeTexto: '' };
    var t = tienda();
    if (!t) { st = null; return false; }
    montar();
    document.getElementById('gfnt-nombre').textContent = d.nombre;
    document.getElementById('gfnt-saludo').textContent = d.saludo;
    document.getElementById('gfnt-ico').src = icono(d.venta[0]);
    document.addEventListener('keydown', alEsc);
    pintar();
    t._cargarPreciosServidor().then(function () { if (st && st.npc === npc) pintar(); }).catch(function () {});
    return true;
  }

  function cerrar() {
    st = null;
    document.removeEventListener('keydown', alEsc);
    ['gfnt', 'gfnt-fondo'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
  }

  window.GFNpcTiendas = { abrir: abrir, cerrar: cerrar, abierta: function () { return !!st; }, _interno: { estado: function () { return st; }, pintar: pintar } };
})();
