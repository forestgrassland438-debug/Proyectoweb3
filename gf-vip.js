/* ===========================================================================
 * gf-vip.js — EL VIP                                              (2026-10-20)
 * ===========================================================================
 *
 * "En la casa del granjero Joe está Rosalind the Weaver: al darle clic, un
 * panel (teléfono y PC) que venda un VIP de 1, 3 y 6 meses, con la imagen
 * del ticket, comprable en oro, plata y bronce. La tabla `vip` en la
 * blockchain guarda cuándo inicia y cuándo vence. Al lado de la hora del
 * sol/luna, la marca del VIP; al tocarla, la información y sus facturas
 * guardadas en la blockchain. Sin VIP no se pueden soltar cosas para que
 * otros las cojan, ni usar la tienda P2P (la del juego sí), ni entrar en tu
 * isla; y nadie viaja a una isla sin VIP con el botón de amigos."
 *
 * Quien manda es el SERVIDOR (server2.js: /api/vip/*, gfExigeVip, la tabla
 * `vip`). Aquí:
 *   · el estado (GET /api/vip/estado: lee las facturas de la cadena);
 *   · la marca del HUD (#hud-vip, junto al reloj) y su panel con las facturas;
 *   · la tienda de Rosalind (GFVip.abrirTienda, la abre gf-npcs.js);
 *   · GFVip.exigir(scene, 'drop' | 'market' | 'lands'): para antes de
 *     intentarlo, con un aviso que dice dónde se consigue.
 *   · GFVip.vigilarIsla(scene): dentro de una isla sin VIP, de vuelta al pueblo.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFVip) return;

  var TICKETS = { '1m': './Game/Source/vip/ticket_1m.png', '3m': './Game/Source/vip/ticket_3m.png', '6m': './Game/Source/vip/ticket_6m.png' };
  var MONEDAS = [
    { k: 'oro', nombre: 'Gold', img: './Game/Source/moneda de oro.png', color: '#7a5c12' },
    { k: 'plata', nombre: 'Silver', img: './Game/Source/moneda de plata.png', color: '#4a5563' },
    { k: 'bronce', nombre: 'Bronze', img: './Game/Source/moneda de bronce.png', color: '#8a4f2a' }
  ];
  var QUE = { drop: 'drop items for other players', market: 'use the P2P Market', lands: 'enter your island' };
  var estado = { cargado: false, activo: false, inicio: null, fin: null, facturas: [], planes: null };
  var pidiendo = null, avisadoEn = Object.create(null), propietario = '', destruido = false, compraRef = null;
  /* (2026-10-26) LA HORA DEL SERVIDOR. Los días que quedan y si el VIP sigue
     activo se contaban con el reloj del PC: en la captura iba 3,5 h atrasado y
     salían "361 days left" (son 360) y un inicio "en el futuro". `desfase` es
     lo que va el servidor por delante del PC (llega con cada respuesta). */
  var desfase = 0;
  function ahora() { return Date.now() + desfase; }
  var relojes = [], modales = Object.create(null), guardas = new Set();

  function cuenta() { var sc = escena(); return sc ? String(sc.playerName || sc.address || '') : ''; }
  function asegurarCuenta() {
    var id = cuenta();
    if (id && id !== propietario) {
      propietario = id; pidiendo = null; compraRef = null; avisadoEn = Object.create(null);
      estado = { cargado: false, activo: false, inicio: null, fin: null, facturas: [], planes: null };
      Object.keys(modales).forEach(function (key) { modales[key].cerrar(); });
    }
    return id;
  }
  function vigente(id) { return !destruido && !!id && cuenta() === id; }

  function api(ruta, cuerpo) {
    if (window.GFMascota && typeof window.GFMascota.api === 'function') return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, datos: null });
  }
  function escena() {
    try {
      var g = window.game, l = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].playerName) return l[i];
    } catch (e) {}
    return null;
  }
  function avisar(scene, texto, tipo) {
    var sc = scene && scene.notifications ? scene : escena();
    try { if (sc && sc.notifications) { sc.notifications.show(texto, tipo || 'info'); return; } } catch (e) {}
    console.log('[vip]', texto);
  }
  function fecha(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // ── EL ESTADO ──────────────────────────────────────────────────────────────
  function adoptar(d) {
    if (!d) return;
    estado.cargado = true;
    var srv = Number(d.ahora);
    if (Number.isFinite(srv) && srv > 0) desfase = srv - Date.now();
    else if (Number(d.msRestantes) > 0 && Number(d.fin) > 0) desfase = (Number(d.fin) - Number(d.msRestantes)) - Date.now();
    estado.activo = !!d.activo && Number(d.fin) > ahora();
    estado.inicio = d.inicio || null;
    estado.fin = d.fin || null;
    if (Array.isArray(d.facturas)) estado.facturas = d.facturas;
    if (d.planes) estado.planes = d.planes;
    estado.sinCadena = !!d.sinCadena;
    pintarMarca();
  }
  function refrescar() {
    var dueno = asegurarCuenta();
    if (destruido || !dueno) return Promise.resolve(estado);
    if (pidiendo) return pidiendo;
    var trabajo = api('/api/vip/estado').then(function (r) {
      if (vigente(dueno) && r && r.ok && r.datos && r.datos.ok) { estado.sinServicio = false; estado.fallo = 0; adoptar(r.datos); }
      /* (2026-10-21) Un servidor sin /api/vip (aún sin actualizar) contesta
         404: el panel se quedaba en "Loading the tickets…" para siempre y
         exigir() bloqueaba soltar, el P2P y la isla con "Checking your VIP…"
         aunque ese servidor no pida VIP para nada. Se apunta y se dice. */
      else if (vigente(dueno) && r) {
        estado.fallo = Number(r.status) || -1;
        if (r.status === 404) { estado.sinServicio = true; estado.cargado = true; pintarMarca(); }
      }
      return estado;
    }).catch(function () { return estado; }).finally(function () { if (pidiendo === trabajo) pidiendo = null; });
    pidiendo = trabajo;
    return pidiendo;
  }
  function tiene() { asegurarCuenta(); return !!(!destruido && estado.activo && Number(estado.fin) > ahora()); }

  /** Antes de hacer algo que pide VIP. false (y avisa) si no lo tiene. */
  function exigir(scene, accion) {
    if (tiene()) return true;
    // El servidor no tiene VIP (404): tampoco lo exige; no se bloquea nada.
    if (estado.sinServicio) return true;
    var ya = Date.now();   // (solo el freno de avisos: vale el reloj del PC)
    if (!estado.cargado) { refrescar(); avisar(scene, 'Checking your VIP… try again in a moment.', 'info'); return false; }
    if (ya - (avisadoEn[accion] || 0) > 3000) {
      avisadoEn[accion] = ya;
      avisar(scene, '👑 You need VIP to ' + (QUE[accion] || 'do that') + '. Get it from Rosalind the Weaver in Farmer Joe\'s house.', 'warning');
    }
    return false;
  }

  // ── LA MARCA DEL HUD (junto a la hora) ──────────────────────────────────────
  function marca() {
    var el = document.getElementById('hud-vip');
    if (el) return el;
    var reloj = document.getElementById('hud-reloj');
    if (!reloj) return null;
    el = document.createElement('button');
    el.id = 'hud-vip';
    el.type = 'button';
    el.className = 'hud-vip';
    el.setAttribute('aria-label', 'VIP status');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:38px;padding:2px 8px;margin:0;' +
      'align-self:stretch;border:none;border-right:1px solid rgba(255,255,255,.12);border-radius:0;background:transparent;cursor:pointer;' +
      'font:800 10px/1 "Segoe UI",sans-serif;-webkit-tap-highlight-color:transparent;';
    el.innerHTML = '<img src="./Game/Source/vip/vip_corona.png" alt="" style="width:22px;height:18px;image-rendering:pixelated">' +
                   '<span class="hud-vip-txt" style="white-space:nowrap">VIP</span>';
    reloj.parentNode.insertBefore(el, reloj.nextSibling);
    el.addEventListener('click', function (e) { e.stopPropagation(); abrirInfo(); });
    ajustarHueco(el);
    return el;
  }
  function alResize() { var el = document.getElementById('hud-vip'); if (el) ajustarHueco(el); }
  /* (2026-10-20) "Donde dice VIP hay un espacio a su izquierda inutilizable":
     el hueco de la caja (su `gap`) quedaba entre la raya del reloj y la
     corona sin hacer nada. La marca se mete en ese hueco (margen negativo del
     mismo tamaño): todo lo que hay entre la raya del reloj y la suya es VIP. */
  function ajustarHueco(el) {
    try {
      var cs = getComputedStyle(el.parentNode);
      var gap = parseFloat(cs.columnGap || cs.gap) || 0;
      el.style.marginLeft = (-gap) + 'px';
      el.style.paddingLeft = Math.max(8, gap) + 'px';
    } catch (e) {}
  }
  function pintarMarca() {
    var el = marca();
    if (!el) return;
    var txt = el.querySelector('.hud-vip-txt'), img = el.querySelector('img');
    if (tiene()) {
      var dias = Math.max(0, Math.ceil((estado.fin - ahora()) / 86400000));
      txt.textContent = 'VIP ' + dias + 'd';
      txt.style.color = '#ffd76a';
      img.style.filter = 'drop-shadow(0 0 4px rgba(255,210,90,.8))';
      el.title = 'VIP until ' + fecha(estado.fin);
    } else {
      txt.textContent = 'VIP';
      txt.style.color = '#8a8fa3';
      img.style.filter = 'grayscale(1) opacity(.55)';
      el.title = estado.cargado ? 'No VIP — tap for info' : 'VIP';
    }
  }

  // ── LOS PANELES (teléfono y PC) ─────────────────────────────────────────────
  function modal(id, titulo) {
    var dueno = asegurarCuenta(), cerrado = false;
    if (modales[id]) modales[id].cerrar();
    var viejo = document.getElementById(id);
    if (viejo) viejo.remove();
    var ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:12px;';
    var card = document.createElement('div');
    card.style.cssText = 'width:min(96vw,520px);max-height:90vh;overflow:auto;box-sizing:border-box;background:linear-gradient(160deg,#2a1f3d,#1a1426);' +
      'border:3px solid #ffd23f;border-radius:16px;color:#fff;font-family:Arial,sans-serif;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.6);';
    card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<b style="font-size:clamp(15px,4.2vw,19px);">' + titulo + '</b>' +
      '<button type="button" class="gfv-x" aria-label="Close" style="background:transparent;border:none;color:#ffd23f;font-size:24px;cursor:pointer;min-width:40px;min-height:40px;">✕</button></div>' +
      '<div class="gfv-cuerpo"></div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    var cerrar = function () { if (cerrado) return; cerrado = true; ov.remove(); document.removeEventListener('keydown', alTecla); if (modales[id] === m) delete modales[id]; };
    var alTecla = function (e) { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', alTecla);
    card.querySelector('.gfv-x').onclick = cerrar;
    ov.onclick = function (e) { if (e.target === ov) cerrar(); };
    var m = { ov: ov, cuerpo: card.querySelector('.gfv-cuerpo'), cerrar: cerrar,
      valido: function () { return !cerrado && vigente(dueno) && ov.isConnected; } };
    modales[id] = m;
    return m;
  }

  function bloqueEstado() {
    if (tiene()) {
      return '<div style="background:#3a2a10;border:1px solid #c9a24a;border-radius:12px;padding:10px 12px;margin-bottom:12px;line-height:1.6;font-size:13px;">' +
        '<div style="font-size:15px;"><b>👑 VIP active</b> · ' + Math.max(0, Math.ceil((estado.fin - ahora()) / 86400000)) + ' days left</div>' +
        '<div>Started: <b>' + fecha(estado.inicio) + '</b></div>' +
        '<div>Expires: <b>' + fecha(estado.fin) + '</b></div></div>';
    }
    return '<div style="background:#262033;border:1px solid #4a4060;border-radius:12px;padding:10px 12px;margin-bottom:12px;line-height:1.6;font-size:13px;">' +
      '<b>No VIP</b>' + (estado.fin ? ' · expired on ' + fecha(estado.fin) : '') + '<br>' +
      '<span style="color:#cbbfe6">Without VIP you cannot drop items for other players, use the P2P Market or enter your island.</span></div>';
  }

  function abrirInfo() {
    var m = modal('gf-vip-info', '👑 VIP');
    var pintarCuerpo = function (cargando) {
      if (!m.valido()) return;
      var filas = (estado.facturas || []).map(function (f) {
        var plan = estado.planes && estado.planes[f.plan] ? estado.planes[f.plan].nombre : (f.dias + ' days');
        var mon = MONEDAS.filter(function (x) { return x.k === f.moneda; })[0];
        return '<div style="display:flex;gap:10px;align-items:center;background:#1f1830;border:1px solid #3d3256;border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:12px;line-height:1.5;">' +
          '<img src="' + (TICKETS[f.plan] || TICKETS['1m']) + '" alt="" style="width:72px;image-rendering:pixelated;flex:0 0 auto">' +
          '<div style="min-width:0"><div><b>' + esc(plan) + '</b> · Invoice #' + esc(f.id) + '</div>' +
          '<div>' + fecha(f.inicio) + ' → ' + fecha(f.fin) + '</div>' +
          (mon ? '<div>Paid: ' + Number(f.precio || 0).toLocaleString('en-US') + ' ' + mon.nombre + '</div>' : '') +
          '<div style="color:#8f86a8;word-break:break-all">' + esc(f.manualId) + '</div></div></div>';
      }).join('');
      m.cuerpo.innerHTML = bloqueEstado() +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 8px;">' +
        '<b style="font-size:14px;">Your VIP invoices (blockchain)</b>' +
        '<button type="button" class="gfv-ref" style="border:none;border-radius:8px;padding:6px 10px;background:#4a3d6a;color:#fff;cursor:pointer;">↻ Refresh</button></div>' +
        (cargando ? '<p style="color:#cbbfe6;font-size:12px;">Reading the chain…</p>' : '') +
        (filas || (!cargando ? '<p style="color:#cbbfe6;font-size:12px;">No VIP invoices yet.</p>' : '')) +
        (estado.sinCadena ? '<p style="color:#ffb86b;font-size:12px;">The chain is not answering right now: showing the last known status.</p>' : '') +
        '<p style="color:#cbbfe6;font-size:12px;margin-top:10px;">Get or extend your VIP with <b>Rosalind the Weaver</b>, inside Farmer Joe\'s house.</p>';
      m.cuerpo.querySelector('.gfv-ref').onclick = function () { pintarCuerpo(true); refrescar().then(function () { pintarCuerpo(false); }); };
    };
    pintarCuerpo(true);
    refrescar().then(function () { if (document.body.contains(m.ov)) pintarCuerpo(false); });
  }

  function saldos() {
    var sc = escena();
    return { oro: Math.floor(Number(sc && sc.moneda) || 0), plata: Math.floor(Number(sc && sc.moneda_plata) || 0),
             bronce: Math.floor(Number(window.GFBronce && window.GFBronce.valor()) || 0) };
  }

  /** La tienda de Rosalind: los tres tickets y sus precios en las tres monedas. */
  function abrirTienda(scene) {
    if (window.GFSinNombre && !window.GFSinNombre.exigir(scene, 'shop')) return;
    var m = modal('gf-vip-tienda', '🧵 Rosalind the Weaver — VIP Tickets');
    var pintar = function (msg, color) {
      if (!m.valido()) return;
      var planes = estado.planes || {};
      var s = saldos();
      var tarjetas = ['1m', '3m', '6m'].map(function (k) {
        var p = planes[k];
        if (!p) return '';
        var botones = MONEDAS.map(function (mo) {
          var precio = p.precio[mo.k], alcanza = s[mo.k] >= precio;
          return '<button type="button" class="gfv-comprar" data-plan="' + k + '" data-moneda="' + mo.k + '"' +
            ' style="flex:1;min-width:90px;min-height:44px;border:none;border-radius:10px;background:' + mo.color + ';color:#fff;font-weight:bold;cursor:pointer;' +
            'font-size:12px;opacity:' + (alcanza ? '1' : '.5') + ';display:flex;align-items:center;justify-content:center;gap:5px;">' +
            '<img src="' + mo.img + '" alt="" style="width:16px;height:16px;image-rendering:pixelated">' +
            (window.GFBronce && mo.k === 'bronce' ? window.GFBronce.corto(precio) : Number(precio).toLocaleString('en-US')) + '</button>';
        }).join('');
        return '<div style="background:#1f1830;border:1px solid #3d3256;border-radius:14px;padding:10px;margin-bottom:10px;">' +
          '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
          '<img src="' + TICKETS[k] + '" alt="' + esc(p.nombre) + '" style="width:min(42vw,170px);image-rendering:pixelated;">' +
          '<div style="flex:1;min-width:140px;font-size:13px;line-height:1.5;"><b style="font-size:15px;">' + esc(p.nombre) + '</b><br>' + p.dias + ' days of VIP' +
          (tiene() ? '<br><span style="color:#ffd76a">Adds to your current VIP</span>' : '') + '</div></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' + botones + '</div></div>';
      }).join('');
      m.cuerpo.innerHTML = '<p style="margin:0 0 10px;font-size:13px;color:#e8dcff;font-style:italic;">"Every thread tells a story… and this one gives you VIP. Which ticket will it be, dear?"</p>' +
        bloqueEstado() +
        '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;background:#140f1e;border-radius:10px;padding:8px;margin-bottom:10px;font-size:12px;">' +
        MONEDAS.map(function (mo) { return '<span><img src="' + mo.img + '" alt="" style="width:14px;height:14px;vertical-align:-2px;image-rendering:pixelated"> ' + mo.nombre + ': <b>' + s[mo.k].toLocaleString('en-US') + '</b></span>'; }).join('') +
        '</div>' + (tarjetas || sinTarjetas()) +
        '<div class="gfv-msg" style="min-height:18px;font-size:13px;text-align:center;color:' + (color || '#ffd76a') + '">' + esc(msg || '') + '</div>' +
        '<p style="font-size:11px;color:#8f86a8;margin:6px 0 0;">Each purchase is saved on the blockchain (table "vip") with its start and expiry dates. Without VIP you cannot drop items for others, use the P2P Market or enter your island.</p>';
      if (compraRef) {
        var revisar = document.createElement('button');revisar.type='button';revisar.textContent='↻ Check pending purchase';
        revisar.style.cssText='display:block;width:100%;min-height:44px;margin-top:10px;border:1px solid #ffd76a;border-radius:10px;background:#49365f;color:white;cursor:pointer';
        revisar.onclick=function(){comprar(compraRef.plan,compraRef.moneda);};m.cuerpo.appendChild(revisar);
      }
      Array.prototype.forEach.call(m.cuerpo.querySelectorAll('.gfv-comprar'), function (b) {
        b.onclick = function () { comprar(b.getAttribute('data-plan'), b.getAttribute('data-moneda')); };
      });
      var otra = m.cuerpo.querySelector('.gfv-otra');
      if (otra) otra.onclick = function () {
        cargando = true; pintar();
        refrescar().then(function () { cargando = false; if (document.body.contains(m.ov) && !ocupado) pintar(); });
      };
    };
    /* (2026-10-21) Sin planes: o aún se están pidiendo, o el servidor no los
       tiene (404: falta actualizarlo) o no contestó. Antes era siempre
       "Loading the tickets…", también cuando ya había fallado. */
    var cargando = true;
    var sinTarjetas = function () {
      if (cargando) return '<p style="font-size:13px;">Loading the tickets…</p>';
      var texto = estado.sinServicio
        ? 'The VIP tickets are not on sale yet: the game server is being updated. Come back later, dear.'
        : 'The tickets could not be loaded right now.';
      return '<p style="font-size:13px;color:#ffb86b;">' + texto + '</p>' +
        '<button type="button" class="gfv-otra" style="border:none;border-radius:8px;padding:8px 12px;min-height:40px;background:#4a3d6a;color:#fff;cursor:pointer;">↻ Try again</button>';
    };
    var ocupado = false;
    // Keep the reference across modal closures. After a lost response the same
    // purchase is reconciled before another plan can be charged.
    var comprar = async function (plan, moneda) {
      if (ocupado || !m.valido()) return;
      var p=estado.planes && estado.planes[plan],mo=MONEDAS.filter(function(x){return x.k===moneda;})[0];
      if(!p || !mo)return;
      ocupado=true;
      try {
        var existing=await api('/api/craft/pending');if(!m.valido())return;
        if(!existing || !existing.ok || !existing.datos || !existing.datos.ok)throw Error('Pending operations could not be checked. Try again.');
        var pending=existing.datos.rows && existing.datos.rows[0],r,d;
        if(pending || compraRef && compraRef.operationId){
          if(!pending)pending={_id:compraRef.operationId,recipe:'vip_'+compraRef.plan+'_'+compraRef.moneda};
          if(!/^vip_/.test(pending.recipe || '')){pintar('Finish your pending crafting or consumption operation first.','#ffb86b');return;}
          var pendingBits=String(pending.recipe).split('_');
          compraRef={plan:pendingBits[1],moneda:pendingBits[2],operationId:pending._id};
          pintar('⏳ Checking the existing VIP purchase…','#ffd76a');
          r=await api('/api/craft/reconcile',{operationId:pending._id});
        }else{
          if(!compraRef){
            if(saldos()[moneda]<p.precio[moneda]){pintar('You do not have enough '+mo.nombre+'.','#ff8a8a');return;}
            if(!window.confirm('Buy '+p.nombre+' for '+Number(p.precio[moneda]).toLocaleString('en-US')+' '+mo.nombre+'?'))return;
            if(!m.valido())return;
            compraRef={plan:plan,moneda:moneda,ref:crypto.randomUUID().replace(/-/g,'')};
          }
          pintar('⏳ Saving your VIP on the blockchain…','#ffd76a');
          r=await api('/api/vip/comprar',compraRef);
        }
        if(!m.valido())return;d=(r && r.datos)||{};
        if(r && r.ok && d.ok){
          compraRef=null;adoptar(d);
          if(window.GFBronce && d.stats)window.GFBronce.adoptarStats(d.stats);
          avisar(scene,'👑 VIP until '+fecha(d.fin),'success');
          pintar('Your VIP is confirmed until '+fecha(d.fin)+'.','#6fcf97');
        }else if(d.status==='cancelled'){
          compraRef=null;pintar('The untouched operation was cancelled and refunded.','#ffb86b');
        }else if(d.operationId){
          // The backend owns durable recovery even after a page reload.
          if(compraRef)compraRef.operationId=d.operationId;
          if(d.stats && window.GFBronce)window.GFBronce.adoptarStats(d.stats);
          pintar('Your purchase is recorded and awaiting confirmation. Use Check pending purchase; it will not charge again.','#ffd76a');
        }else{
          if(['saldo_insuficiente','craft_result_capacity_unavailable','craft_level_required','craft_invalid_request'].indexOf(d.error)!==-1)compraRef=null;
          pintar(d.error==='saldo_insuficiente'?'You do not have enough coins.':d.message || 'The purchase could not be confirmed. Check it again.','#ff8a8a');
        }
      }catch(e){if(m.valido())pintar(e.message || 'Connection error. Check the pending purchase again.','#ff8a8a');}
      finally{ocupado=false;}
    };
    pintar();
    refrescar().then(function () { cargando = false; if (document.body.contains(m.ov) && !ocupado) pintar(); });
  }

  // ── LA ISLA ────────────────────────────────────────────────────────────────
  /** Dentro de una isla: si no se puede estar (sin VIP), de vuelta al pueblo. */
  function vigilarIsla(scene) {
    if (!scene || !scene.sys) return;
    if (scene.__gfVipGuard) scene.__gfVipGuard.cerrar();
    var dueno = asegurarCuenta(), espera = null, cerrado = false;
    var guarda = { cerrar: function () {
      if (cerrado) return; cerrado = true; clearTimeout(espera); guardas.delete(guarda);
      if (scene.events) { scene.events.off('shutdown', guarda.cerrar); scene.events.off('destroy', guarda.cerrar); }
      if (scene.__gfVipGuard === guarda) scene.__gfVipGuard = null;
    } };
    scene.__gfVipGuard = guarda; guardas.add(guarda);
    if (scene.events) { scene.events.once('shutdown', guarda.cerrar); scene.events.once('destroy', guarda.cerrar); }
    function actual() { return !cerrado && vigente(dueno) && scene.__gfVipGuard === guarda && scene.sys && scene.sys.isActive(); }
    var ajena = scene._islaDe && scene._islaDe !== scene.playerName;
    var fuera = function (texto) {
      if (!actual()) return;
      avisar(scene, texto, 'warning');
      espera = setTimeout(function () {
        if (actual() && window.GFViaje) window.GFViaje.viajar({ mundo: 1 });
        guarda.cerrar();
      }, 1600);
    };
    if (ajena) {
      api('/api/vip/de/' + encodeURIComponent(scene._islaDe)).then(function (r) {
        if (!actual()) return;
        if (r && r.ok && r.datos && r.datos.ok && !r.datos.vip) fuera('🏝 This island is closed: its owner has no VIP.');
        else guarda.cerrar();
      }).catch(guarda.cerrar);
      return;
    }
    refrescar().then(function () {
      if (!actual()) return;
      if (estado.cargado && !estado.sinServicio && !tiene()) fuera('👑 You need VIP to enter your island. Get it from Rosalind the Weaver in Farmer Joe\'s house.');
      else guarda.cerrar();
    }).catch(guarda.cerrar);
  }

  /** Antes de visitar la isla de otro: ¿su dueño tiene VIP? → Promise<boolean>. */
  function islaAbierta(playerName) {
    var dueno = asegurarCuenta();
    return api('/api/vip/de/' + encodeURIComponent(playerName)).then(function (r) {
      // Un servidor sin VIP (404) no cierra ninguna isla.
      if (vigente(dueno) && r && r.status === 404) return true;
      return !!(vigente(dueno) && r && r.ok && r.datos && r.datos.vip);
    }).catch(function () { return false; });
  }

  function arrancar() {
    if (destruido) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', arrancar); return; }
    var t = setInterval(function () {
      marca();
      var sc = escena();
      if (sc && sc.playerName) { clearInterval(t); refrescar(); }
    }, 1500);
    relojes.push(t, setInterval(function () { if (document.visibilityState !== 'hidden') refrescar(); }, 5 * 60 * 1000), setInterval(pintarMarca, 60 * 1000));
  }
  function destruir(e) {
    if (destruido || (e && e.persisted)) return;
    destruido = true; pidiendo = null;
    relojes.forEach(clearInterval); relojes = [];
    Object.keys(modales).forEach(function (id) { modales[id].cerrar(); });
    Array.from(guardas).forEach(function (g) { g.cerrar(); });
    document.removeEventListener('DOMContentLoaded', arrancar);
    window.removeEventListener('resize', alResize); window.removeEventListener('pagehide', destruir);
  }
  window.addEventListener('resize', alResize); window.addEventListener('pagehide', destruir);
  arrancar();

  /* (2026-10-21) Para Rosalind (gf-npcs.js): con su tienda abierta no se va
     paseando, y si el jugador se aleja mucho, la tienda se cierra. */
  function tiendaAbierta() { var m = modales['gf-vip-tienda']; return !!(m && m.valido()); }
  function cerrarTienda() { var m = modales['gf-vip-tienda']; if (m) m.cerrar(); }

  window.GFVip = { estado: function () { asegurarCuenta(); return estado; }, tiene: tiene, exigir: exigir, refrescar: refrescar,
                   abrirTienda: abrirTienda, abrirInfo: abrirInfo, vigilarIsla: vigilarIsla, islaAbierta: islaAbierta, destruir: destruir,
                   tiendaAbierta: tiendaAbierta, cerrarTienda: cerrarTienda };
})();
