/* ===========================================================================
 * gf-ferri.js — EL FERRI ENTRE EL PUEBLO Y EL PUERTO                (2026-11-24)
 * ===========================================================================
 *
 * "En el río de GameScene no existe un barco con un NPC para llevarte a los
 * otros mapas, como por ejemplo el otro pueblo; además el río es corto:
 * repáralo para el paso del barco. La idea es el barco para ir a GameScene y
 * el de ir al nuevo pueblo."
 *
 * LO QUE HAY
 *   · En el pueblo (GameScene): el muelle de madera que sale de la orilla
 *     oeste del río (se pisa: tools/canal-del-pueblo.py --muelle), su cartel
 *     y el ferri amarrado en la boca del canal que lleva al mar por el este
 *     (el canal: tools/canal-del-pueblo.py --aplicar).
 *   · En el puerto (PuertoScene): el mismo ferri amarrado al sur del espigón
 *     del oeste, junto al cartel "Ferry to Grassland Village".
 *   · Ferryman Odo, el barquero (Game/Sprites/npcs/barquero, de
 *     tools/generar-reinos-criaturas.py), de pie en la cubierta junto a su
 *     cabina. Clic (o toque) en él o en el barco: la tarjeta del viaje.
 *
 * LO QUE CUESTA (respuesta del usuario: "precio del mapa")
 *   · Del pueblo al puerto: lo MISMO que el mapa del mundo, con su misma
 *     ruta (/api/viaje/mapa, destino 'puerto'): el servidor pone el precio,
 *     mira el VIP, el nivel y la muerte, cobra con cambio, reparte 30 % al
 *     tesoro circular y 70 % al del juego, y da un billete que se devuelve
 *     si el viaje no puede empezar. No hay ruta nueva en el servidor.
 *   · Del puerto al pueblo: gratis, como siempre lo fue la salida del
 *     espigón (GFZonas 'pueblo_desde_puerto'). Volver a casa no pide VIP, y
 *     un fantasma también vuelve: "que no le impidas moverse entre mapas si
 *     camina por su cuenta". Cobrarla dejaba atrapado en el este a quien no
 *     tuviera bronce.
 *
 * EL VIAJE
 *   Se sube de un salto, el barco zarpa con su estela (el pasajero va de pie
 *   en la cubierta: el costado le tapa los tobillos, como el bote al remero),
 *   la cámara lo sigue y se funde a negro al salir del mapa. Entonces viaja:
 *   GFViaje.viajar (el pagado) o GFZonas.viajar (la vuelta). Si no puede
 *   empezar, se devuelve el billete y todo vuelve a su sitio.
 *   Mientras navega: sin teclado ni ratón, y `_resolverChoqueJugador` no
 *   choca (como en gf-botes): la cubierta está sobre el agua.
 *
 * CÓMO SE ENGANCHA
 *   GameScene (en el arranque de una vez, junto a GFBotes) y ZonasScenes:
 *     window.GFFerri && window.GFFerri.montar(this);
 *   Y al montar el agua animada, para que no salgan piedras ni troncos
 *   debajo del muelle ni en la ruta: excluir: GFFerri.excluir(this).
 *   Las demás escenas se descartan por su clave. Se desmonta solo.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFFerri) return;

  var V = '20261124a';
  var RUTA = './Game/Objetos/ferri/';
  var RUTA_NPC = './Game/Sprites/npcs/';
  var ESCALA = 2;
  var TEX = 'gffe_ferri', TEX_MUELLE = 'gffe_muelle', TEX_CARTEL = 'gffe_cartel';
  var TEX_BARQUERO = 'gfn_barquero';          // la misma clave que pondría gf-npcs
  // Cotas del dibujo a 1x (tools/generar-ferri.py; las repite ferri.json).
  var CUADRO = 152, CENTRO = 76, AGUA = 146, BORDA_LEJOS = 106;
  var SITIO_BARQUERO = [72, 130], SITIO_PASAJERO = [88, 130];
  var PIES = 44;                               // del centro del jugador a sus pies
  var CERCA = 210, LEJOS = 340;                // saluda / se cierra la tarjeta
  var ZARPA_MS = 3600, FUNDIDO_MS = 700;

  var NOMBRE = 'Ferryman Odo';
  var SITIOS = {
    GameScene: {
      muelle: { x: 4406, y: 2760 },
      cartel: { x: 4380, y: 2752 },
      ferri: { x: 4740, agua: 2846, mira: 1 },
      hastaX: 5420,
      bajada: { x: 4560, y: 2762 },            // si el viaje no empieza: en la punta del muelle
      // Se llega al espigón del puerto, al norte del ferri (que no lo tape la cabina).
      destino: { tipo: 'pagado', id: 'puerto', mundo: 13, x: 190, y: 2470, nombre: 'Saltwind Harbor' },
      excluir: [{ x: 4396, y: 2600, width: 640, height: 300 }],
      frases: ['All aboard for Saltwind Harbor! The canal takes us straight to the sea.',
               'They dug this canal for my ferry. Fifty strokes and we are at sea.',
               'Hold on to your hat. The east wind blows hard past the canal.']
    },
    PuertoScene: {
      // Amarrado al sur del espigón, con agua entre los dos: la cabina no tapa el paso.
      ferri: { x: 250, agua: 2716, mira: -1 },
      hastaX: -460,
      bajada: { x: 190, y: 2470 },
      destino: { tipo: 'zona', clave: 'pueblo_desde_puerto', nombre: 'Grassland Village' },
      excluir: [{ x: 0, y: 2600, width: 560, height: 170 }],
      frases: ['Back to Grassland Village? The ride home is on the house.',
               'The tide is always right for going home.',
               'Mind the gulls. They steal sandwiches.']
    }
  };

  // ── UTILIDADES ─────────────────────────────────────────────────────────────
  function clave(scene) { return scene && scene.sys && scene.sys.settings ? scene.sys.settings.key : ''; }
  function sitioDe(scene) { var k = clave(scene); return Object.prototype.hasOwnProperty.call(SITIOS, k) ? SITIOS[k] : null; }
  function api(ruta, cuerpo) {
    if (window.GFMascota && typeof window.GFMascota.api === 'function') return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function avisar(scene, texto, tipo) {
    try { if (scene && scene.notifications) { scene.notifications.show(texto, tipo || 'info'); return; } } catch (e) {}
    console.log('[ferri]', texto);
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(n) { return Math.floor(Number(n) || 0).toLocaleString('en-US'); }
  function muerto(scene) {
    try { return !!(window.GFMuerte && typeof window.GFMuerte.muerto === 'function' && window.GFMuerte.muerto(scene)); }
    catch (e) { return false; }
  }
  function enBatalla() { try { return document.body.classList.contains('in-battle'); } catch (e) { return false; } }
  function enBote(scene) { try { return !!(window.GFBotes && window.GFBotes.aBordo && window.GFBotes.aBordo(scene)); } catch (e) { return false; } }
  function cuenta(scene) { return scene ? String(scene.playerName || scene.address || '') : ''; }

  /** Un punto del cuadro (1x) en el mundo, con el barco donde esté. */
  function delCuadro(f, px, py) {
    return { x: f.x + (px - CENTRO) * ESCALA * f.mira, y: f.agua - (AGUA - py) * ESCALA };
  }

  // ── LAS TEXTURAS ───────────────────────────────────────────────────────────
  function faltan(scene) {
    var t = scene.textures, l = [];
    if (!t.exists(TEX)) l.push(function () { scene.load.atlas(TEX, RUTA + 'ferri.png?v=' + V, RUTA + 'ferri.json?v=' + V); });
    if (!t.exists(TEX_MUELLE)) l.push(function () { scene.load.image(TEX_MUELLE, RUTA + 'muelle.png?v=' + V); });
    if (!t.exists(TEX_CARTEL)) l.push(function () { scene.load.image(TEX_CARTEL, RUTA + 'cartel.png?v=' + V); });
    if (!t.exists(TEX_BARQUERO)) l.push(function () { scene.load.atlas(TEX_BARQUERO, RUTA_NPC + 'barquero.png?v=' + V, RUTA_NPC + 'barquero.json?v=' + V); });
    return l;
  }

  // ── EL MONTAJE ─────────────────────────────────────────────────────────────
  function montar(scene) {
    var sitio = sitioDe(scene);
    if (!sitio || !scene.add || !scene.events || scene.__gfFerri) return null;
    var st = { scene: scene, sitio: sitio, vivo: true, objetos: [], fase: 'amarrado', ui: null, ocupado: false,
               saludoEn: 0, frase: -1, bocadillo: null, relojBocadillo: null, estela: 0 };
    scene.__gfFerri = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    var cargas = faltan(scene);
    var nacer = function () {
      if (st.alCargar) { scene.load.off('complete', st.alCargar); st.alCargar = null; }
      clearTimeout(st.limite);
      if (!st.vivo) return;
      if (!scene.textures.exists(TEX)) { console.warn('[ferri] falta Game/Objetos/ferri/ferri'); return; }
      try { construir(st); } catch (e) { console.warn('[ferri]', e); desmontar(scene); }
    };
    if (cargas.length) {
      cargas.forEach(function (f) { f(); });
      st.alCargar = nacer;
      scene.load.once('complete', nacer);
      st.limite = setTimeout(nacer, 15000);
      scene.load.start();
    } else nacer();
    return st;
  }

  function propio(st, o) { st.objetos.push(o); return o; }

  function construir(st) {
    var scene = st.scene, s = st.sitio, f = { x: s.ferri.x, agua: s.ferri.agua, mira: s.ferri.mira };
    st.f = f;
    if (s.muelle && scene.textures.exists(TEX_MUELLE)) {
      // Plano en el agua: encima del agua animada (0.5) y debajo de todo lo demás.
      propio(st, scene.add.image(s.muelle.x, s.muelle.y, TEX_MUELLE).setOrigin(0, 0).setScale(ESCALA).setDepth(1.4));
    }
    if (s.cartel && scene.textures.exists(TEX_CARTEL)) {
      propio(st, scene.add.image(s.cartel.x, s.cartel.y, TEX_CARTEL).setOrigin(0.5, 1).setScale(ESCALA).setDepth(s.cartel.y));
    }
    // La mancha del casco en el agua y el barco en sus dos mitades.
    st.sombra = propio(st, scene.add.ellipse(f.x, f.agua - 6, 290, 26, 0x06222e, 0.28).setDepth(0.9));
    var origenY = AGUA / CUADRO;
    st.atras = propio(st, scene.add.image(f.x, f.agua, TEX, 'atras').setOrigin(0.5, origenY).setScale(ESCALA));
    st.delante = propio(st, scene.add.image(f.x, f.agua, TEX, 'delante').setOrigin(0.5, origenY).setScale(ESCALA));
    st.atras.setFlipX(f.mira < 0).setDepth(f.agua - (AGUA - BORDA_LEJOS) * ESCALA);
    st.delante.setFlipX(f.mira < 0).setDepth(f.agua);
    // El barquero, de pie en la cubierta junto a la cabina.
    if (scene.textures.exists(TEX_BARQUERO)) {
      var pb = delCuadro(f, SITIO_BARQUERO[0], SITIO_BARQUERO[1]);
      st.barquero = propio(st, scene.add.sprite(pb.x, pb.y, TEX_BARQUERO, 'abajo_1').setOrigin(0.5, 1).setScale(ESCALA).setDepth(pb.y));
      st.nombre = propio(st, scene.add.text(pb.x, pb.y - 112, NOMBRE, {
        fontFamily: '"PressStart2P", monospace', fontSize: '7px', color: '#ffe08a', resolution: 4,
        stroke: '#1a1208', strokeThickness: 3
      }).setOrigin(0.5, 1).setDepth(pb.y + 1));
      st.mira = 'abajo';
    }
    // El vaivén del agua (todo lo que va a bordo sube y baja a la vez).
    st.vaiven = { dy: 0 };
    st.tweenVaiven = scene.tweens.add({ targets: st.vaiven, dy: 2, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Se le habla con un clic (o un toque) en él o en el barco.
    var tocar = function (ptr, lx, ly, ev) {
      if (ptr && ptr.downElement && scene.sys && scene.sys.canvas && ptr.downElement !== scene.sys.canvas) return;
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (st.fase !== 'amarrado') return;
      abrirTarjeta(st);
    };
    [st.barquero, st.atras, st.delante].forEach(function (o) {
      if (!o) return;
      o.setInteractive({ useHandCursor: true, pixelPerfect: o !== st.barquero, alphaTolerance: 1 });
      o.on('pointerdown', tocar);
    });
    st.onUpdate = function (t, d) { if (st.vivo) tic(st, t, Math.min(0.1, (d || 16) / 1000)); };
    st.onPost = function () { if (st.vivo) fijarPasajero(st); };
    scene.events.on('update', st.onUpdate);
    scene.events.on('postupdate', st.onPost);
    colocar(st);
    console.log('⛵ ferri en ' + clave(scene));
  }

  /** Pone el barco, el barquero y su nombre donde toca (con el vaivén). */
  function colocar(st) {
    var f = st.f, dy = st.vaiven ? st.vaiven.dy : 0;
    st.atras.setPosition(f.x, f.agua + dy);
    st.delante.setPosition(f.x, f.agua + dy);
    st.sombra.setPosition(f.x, f.agua - 6);
    if (st.barquero) {
      var pb = delCuadro(f, SITIO_BARQUERO[0], SITIO_BARQUERO[1]);
      st.barquero.setPosition(pb.x, pb.y + dy);
      st.nombre.setPosition(pb.x, pb.y - 112 + dy);
      if (st.bocadillo) st.bocadillo.setPosition(pb.x, pb.y - 124 + dy);
    }
  }

  function piesJugador(scene) {
    var p = scene.player;
    return p ? { x: p.x, y: p.y + PIES } : null;
  }

  function tic(st, t, dt) {
    var scene = st.scene;
    if (!st.atras || !st.atras.scene) return;
    colocar(st);
    if (st.fase === 'navegando') estela(st, t);
    if (!st.barquero || st.fase !== 'amarrado') return;
    var pie = piesJugador(scene);
    if (!pie) return;
    var pb = st.barquero, d = Math.hypot(pie.x - pb.x, pie.y - pb.y);
    // Te mira si te acercas; si no, mira al agua por donde se va.
    var dir = 'abajo';
    if (d < CERCA) {
      var dx = pie.x - pb.x, dyy = pie.y - pb.y;
      dir = Math.abs(dx) > Math.abs(dyy) ? (dx < 0 ? 'izquierda' : 'derecha') : (dyy < 0 ? 'arriba' : 'abajo');
      if (t > st.saludoEn) { st.saludoEn = t + 25000; decirFrase(st); }
    }
    if (dir !== st.mira) { st.mira = dir; pb.setFrame(dir + '_1'); }
    // La tarjeta se cierra si te vas lejos.
    if (st.ui && !st.ocupado && d > LEJOS) cerrarTarjeta(st);
  }

  function decirFrase(st) {
    var scene = st.scene, fr = st.sitio.frases || [];
    if (!fr.length || !st.barquero) return;
    st.frase = (st.frase + 1) % fr.length;
    quitarBocadillo(st);
    var texto = scene.add.text(0, 0, fr[st.frase], {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#2a2016', resolution: 3,
      wordWrap: { width: 210 }, align: 'center'
    }).setOrigin(0.5, 1);
    var w = texto.width + 18, h = texto.height + 12;
    var fondo = scene.add.graphics();
    fondo.fillStyle(0xfffaf0, 0.96);
    fondo.lineStyle(2, 0x5a4630, 1);
    fondo.fillRoundedRect(-w / 2, -h - 6, w, h, 8);
    fondo.strokeRoundedRect(-w / 2, -h - 6, w, h, 8);
    fondo.fillTriangle(-6, -7, 6, -7, 0, 2);
    texto.setPosition(0, -12);
    st.bocadillo = scene.add.container(st.barquero.x, st.barquero.y - 124, [fondo, texto]).setDepth(9400);
    var b = st.bocadillo;
    st.relojBocadillo = scene.time.delayedCall(4500, function () { if (st.bocadillo === b) quitarBocadillo(st); });
  }
  function quitarBocadillo(st) {
    if (st.relojBocadillo) { try { st.relojBocadillo.remove(false); } catch (e) {} st.relojBocadillo = null; }
    if (st.bocadillo) { try { st.bocadillo.destroy(); } catch (e) {} st.bocadillo = null; }
  }

  // ── LA TARJETA DEL VIAJE ───────────────────────────────────────────────────
  var CSS = [
    '.gffe-tarjeta{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);',
    ' width:min(430px,calc(100vw - 24px));z-index:100010;box-sizing:border-box;',
    ' background:linear-gradient(#fbefcc,#ecd29a);border:3px solid #3b2615;border-radius:14px;',
    ' box-shadow:0 6px 0 rgba(29,18,9,.55),0 10px 30px rgba(0,0,0,.5);padding:12px 14px;color:#2c1d10;',
    ' font:14px/1.45 "Segoe UI",Arial,sans-serif;animation:gffe-entra .22s ease-out}',
    '@keyframes gffe-entra{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}',
    '.gffe-cab{display:flex;align-items:center;gap:10px}',
    '.gffe-ico{flex:0 0 auto;width:44px;height:44px;border-radius:50%;border:3px solid #1d1428;display:flex;align-items:center;',
    ' justify-content:center;font-size:22px;background:radial-gradient(circle at 35% 30%,#fff6d8,#7fc8d8 65%)}',
    '.gffe-cab b{display:block;font:800 17px/1.15 Georgia,"Times New Roman",serif}',
    '.gffe-cab small{display:block;font-size:12px;color:#6b4a26;margin-top:2px}',
    '.gffe-x{margin-left:auto;flex:0 0 auto;border:0;background:none;font:900 20px/1 Arial;color:#6b4a26;cursor:pointer;min-width:36px;min-height:36px}',
    '.gffe-texto{margin:10px 0 0}',
    '.gffe-nota{margin:6px 0 0;font-size:12px;color:#6b4a26}',
    '.gffe-mal{color:#9b2020;font-weight:700}',
    '.gffe-botones{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}',
    '.gffe-btn{border:2px solid #1d1209;border-radius:10px;background:linear-gradient(#f3dc9e,#d6aa55);color:#3a2310;',
    ' font:800 13px/1 "Segoe UI",Arial,sans-serif;min-height:42px;padding:0 16px;cursor:pointer;box-shadow:0 2px 0 #1d1209;',
    ' display:inline-flex;align-items:center;gap:6px;-webkit-tap-highlight-color:transparent}',
    '.gffe-btn:hover{filter:brightness(1.08)}.gffe-btn:active{transform:translateY(1px);box-shadow:0 1px 0 #1d1209}',
    '.gffe-btn[disabled]{opacity:.5;cursor:default}',
    '.gffe-si{background:linear-gradient(#8fdc7a,#3f9a3a);color:#0f2a0c}'
  ].join('');
  function asegurarCss() {
    if (document.getElementById('gffe-css')) return;
    var s = document.createElement('style');
    s.id = 'gffe-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function abrirTarjeta(st) {
    if (st.ui || st.fase !== 'amarrado') return;
    asegurarCss();
    var d = st.sitio.destino;
    var el = document.createElement('div');
    el.className = 'gffe-tarjeta';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Ferry to ' + d.nombre);
    el.innerHTML = '<div class="gffe-cab"><span class="gffe-ico">⛵</span><div><b>Ferry to ' + esc(d.nombre) + '</b>' +
      '<small>' + esc(NOMBRE) + ', at the pier</small></div><button type="button" class="gffe-x" data-a="no" aria-label="Close">✕</button></div>' +
      '<div class="gffe-cuerpo"></div>';
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]');
      if (!b || b.disabled) return;
      var a = b.getAttribute('data-a');
      if (a === 'no') cerrarTarjeta(st);
      else if (a === 'si') zarpar(st);
    });
    document.body.appendChild(el);
    st.ui = { el: el, cuerpo: el.querySelector('.gffe-cuerpo'), precio: null };
    if (d.tipo === 'zona') {
      pintar(st, 'The ride home to <b>' + esc(d.nombre) + '</b> is free. We sail west and drop you on the village pier.',
             null, '⛵ Sail home');
      return;
    }
    pintar(st, '⏳ Checking the fare…', null, null);
    consultar(st);
  }

  function pintar(st, html, nota, boton, mal) {
    if (!st.ui) return;
    st.ui.cuerpo.innerHTML = '<p class="gffe-texto' + (mal ? ' gffe-mal' : '') + '">' + html + '</p>' +
      (nota ? '<p class="gffe-nota">' + nota + '</p>' : '') +
      '<div class="gffe-botones"><button type="button" class="gffe-btn" data-a="no">' + (boton ? 'Not now' : 'OK') + '</button>' +
      (boton ? '<button type="button" class="gffe-btn gffe-si" data-a="si">' + boton + '</button>' : '') + '</div>';
  }

  function cerrarTarjeta(st) {
    if (!st.ui) return;
    try { st.ui.el.remove(); } catch (e) {}
    st.ui = null;
  }

  /** Lo que no deja viajar, visto desde aquí (el servidor lo mira otra vez). */
  function impedimento(st) {
    var scene = st.scene, d = st.sitio.destino;
    if (scene._cambiandoEscena) return 'You are already on your way.';
    if (enBatalla()) return 'You cannot travel during a battle.';
    if (enBote(scene)) return 'Tie up your rowboat first: press <b>Land</b> (G).';
    if (d.tipo !== 'pagado') return null;
    if (muerto(scene)) return '👻 The ferry does not carry ghosts. Revive first — you can still <b>walk</b> to other maps on your own.';
    if (window.GFNivelMapa && !window.GFNivelMapa.puede(scene, d.mundo)) {
      return '🔒 ' + esc(d.nombre) + ' opens at <b>level ' + num(window.GFNivelMapa.minimo(d.mundo)) + '</b>.';
    }
    var vip = window.GFVip;
    if (vip && !vip.tiene()) {
      var e = vip.estado ? vip.estado() : null;
      if (e && e.sinServicio) return null;
      if (e && !e.cargado) { try { vip.refrescar(); } catch (x) {} return '👑 Checking your VIP… try again in a moment.'; }
      return '👑 ' + esc(d.nombre) + ' and the eastern lands are for <b>VIP</b> travelers. Get VIP from Rosalind the VIP Merchant, inside Farmer Joe’s house.';
    }
    return null;
  }

  function consultar(st) {
    var scene = st.scene, d = st.sitio.destino, dueno = cuenta(scene);
    var no = impedimento(st);
    if (no) { pintar(st, no, null, null, true); return; }
    api('/api/viaje/mapa').then(function (r) {
      if (!st.ui || cuenta(scene) !== dueno) return;
      var x = r && r.datos;
      if (r && r.status === 404) { pintar(st, 'The ferry is not running right now. Try again later.', null, null, true); return; }
      if (!r || !r.ok || !x || !x.ok || !x.destinos || !x.destinos[d.id]) {
        pintar(st, 'The fare could not be checked. Try again.', null, null, true);
        return;
      }
      var e = x.destinos[d.id];
      if (e.bloqueo === 'nivel') { pintar(st, '🔒 ' + esc(d.nombre) + ' opens at <b>level ' + num(e.nivelMin) + '</b>. You are level ' + num(x.nivel) + '.', null, null, true); return; }
      if (e.bloqueo === 'vip') { pintar(st, '👑 ' + esc(d.nombre) + ' and the eastern lands are for <b>VIP</b> travelers. Get VIP from Rosalind the VIP Merchant, inside Farmer Joe’s house.', null, null, true); return; }
      if (e.precio === null || e.precio === undefined) { pintar(st, 'The ferry cannot find you yet. Walk a few steps and try again.', null, null, true); return; }
      st.ui.precio = Number(e.precio);
      var tienes = Number.isFinite(Number(x.valorBronce)) ? Number(x.valorBronce) : null;
      var falta = tienes !== null && tienes < st.ui.precio;
      pintar(st, 'The crossing to <b>' + esc(d.nombre) + '</b> costs <b>' + num(st.ui.precio) + ' Bronze</b>, the same fare as the world map.',
             tienes === null ? null : (falta ? '<span class="gffe-mal">All your coins are worth ' + num(tienes) + ' Bronze.</span>'
                                             : 'Your coins are worth ' + num(tienes) + ' Bronze. Silver and gold are changed for you.'),
             falta ? null : '⛵ Sail (' + num(st.ui.precio) + ' Bronze)', false);
    }).catch(function () { pintar(st, 'Connection error. Try again.', null, null, true); });
  }

  // ── EL VIAJE ───────────────────────────────────────────────────────────────
  function zarpar(st) {
    if (st.ocupado || st.fase !== 'amarrado') return;
    var scene = st.scene, d = st.sitio.destino;
    var no = impedimento(st);
    if (no) { pintar(st, no, null, null, true); return; }
    if (d.tipo === 'zona') { cerrarTarjeta(st); embarcar(st, null); return; }
    if (!(st.ui && st.ui.precio > 0)) return;
    st.ocupado = true;
    pintar(st, '⏳ Paying the fare…', null, null);
    var dueno = cuenta(scene);
    api('/api/viaje/mapa', { destino: d.id, precio: st.ui.precio }).then(function (r) {
      if (cuenta(scene) !== dueno || !st.vivo) return;
      var x = (r && r.datos) || {};
      if (r && r.ok && x.ok && x.destino) {
        if (window.GFBronce && x.stats) window.GFBronce.adoptarStats(x.stats);
        if (x.stats && window.playerStats) {
          ['oro', 'plata', 'bronce'].forEach(function (k) { if (Number.isFinite(Number(x.stats[k]))) window.playerStats[k] = Number(x.stats[k]); });
        }
        cerrarTarjeta(st);
        avisar(scene, '⛵ Fare paid: −' + num(x.precio) + ' Bronze. Next stop, ' + d.nombre + '!', 'success');
        embarcar(st, { billete: x.billete, precio: x.precio });
        return;
      }
      var e = x.error;
      if (e === 'insufficient_funds') pintar(st, 'You need <b>' + num(x.need) + ' Bronze</b> and all your coins are worth ' + num(x.have) + ' Bronze.', null, null, true);
      else if (e === 'precio_cambio') { st.ui.precio = Number(x.precio); pintar(st, 'The fare changed: <b>' + num(x.precio) + ' Bronze</b>.', null, '⛵ Sail (' + num(x.precio) + ' Bronze)'); }
      else if (e === 'nivel_bajo') pintar(st, '🔒 ' + esc(d.nombre) + ' opens at <b>level ' + num(x.nivelMinimo) + '</b>. You are level ' + num(x.nivel) + '.', null, null, true);
      else if (e === 'vip_required') pintar(st, '👑 You need <b>VIP</b> to sail to ' + esc(d.nombre) + '. Get it from Rosalind the VIP Merchant, inside Farmer Joe’s house.', null, null, true);
      else if (e === 'fantasma') pintar(st, '👻 The ferry does not carry ghosts. Revive first — you can still <b>walk</b> to other maps on your own.', null, null, true);
      else if (e === 'sin_posicion') pintar(st, 'The ferry cannot find you yet. Walk a few steps and try again.', null, null, true);
      else if (r && r.status === 429) pintar(st, 'Too many journeys at once. Wait a moment.', null, null, true);
      else pintar(st, esc(x.message || 'The fare could not be paid. Try again.'), null, null, true);
    }).catch(function () {
      pintar(st, 'Connection error. Try again.', null, null, true);
    }).finally(function () { st.ocupado = false; });
  }

  /* Sin teclado ni ratón mientras va a bordo (como el mapa del mundo), y sin
     choques: la cubierta está sobre el agua. */
  function soltarMandos(st) {
    var scene = st.scene, kb = scene.input && scene.input.keyboard;
    try { if (kb) { kb.enabled = false; if (typeof kb.resetKeys === 'function') kb.resetKeys(); } } catch (e) {}
    try { if (typeof scene.stopMouseMovement === 'function' && scene.mouseMovement && scene.player) scene.stopMouseMovement(); } catch (e) {}
    st.resolverPropio = Object.prototype.hasOwnProperty.call(scene, '_resolverChoqueJugador') ? scene._resolverChoqueJugador : undefined;
    st.resolverCambiado = true;
    scene._resolverChoqueJugador = function () { /* a bordo del ferri: lo coloca gf-ferri */ };
  }
  function devolverMandos(st) {
    var scene = st.scene, kb = scene.input && scene.input.keyboard;
    if (st.resolverCambiado) {
      if (st.resolverPropio === undefined) delete scene._resolverChoqueJugador;
      else scene._resolverChoqueJugador = st.resolverPropio;
      st.resolverCambiado = false;
      st.resolverPropio = undefined;
    }
    try { if (kb) kb.enabled = typeof scene._tecladoLibre === 'function' ? scene._tecladoLibre() : true; } catch (e) {}
  }

  function embarcar(st, pago) {
    var scene = st.scene, p = scene.player;
    if (!p || st.fase !== 'amarrado') { if (pago) devolver(st, pago); return; }
    st.fase = 'subiendo';
    st.pago = pago;
    quitarBocadillo(st);
    soltarMandos(st);
    var mira = st.f.mira;
    scene.lastDirection = mira > 0 ? 'right' : 'left';
    try { p.anims.stop(); p.setTexture(mira > 0 ? 'player_right_1' : 'player_left_1'); } catch (e) {}
    // De un salto a la cubierta.
    var meta = delCuadro(st.f, SITIO_PASAJERO[0], SITIO_PASAJERO[1]);
    var desde = { x: p.x, y: p.y }, hasta = { x: meta.x, y: meta.y - PIES };
    var salto = { t: 0 };
    st.tweenSalto = scene.tweens.add({
      targets: salto, t: 1, duration: 620, ease: 'Sine.easeInOut',
      onUpdate: function () {
        if (!p.scene) return;
        var k = salto.t;
        p.x = desde.x + (hasta.x - desde.x) * k;
        p.y = desde.y + (hasta.y - desde.y) * k - Math.sin(k * Math.PI) * 26;
      },
      onComplete: function () {
        st.tweenSalto = null;
        if (!st.vivo) return;
        if (st.barquero) { st.mira = mira > 0 ? 'derecha' : 'izquierda'; st.barquero.setFrame(st.mira + '_1'); }
        navegar(st);
      }
    });
  }

  /* El pasajero va donde vaya la cubierta: después del update de la escena,
     que lo habría movido o le habría puesto la profundidad de sus pies. */
  function fijarPasajero(st) {
    if (st.fase !== 'navegando' && st.fase !== 'llegando') return;
    var scene = st.scene, p = scene.player;
    if (!p || !p.scene) return;
    var dy = st.vaiven ? st.vaiven.dy : 0;
    var m = delCuadro(st.f, SITIO_PASAJERO[0], SITIO_PASAJERO[1]);
    var ancho = scene.map ? scene.map.widthInPixels : Infinity;
    p.x = Math.max(24, Math.min(ancho - 24, m.x));
    p.y = m.y - PIES + dy;
    p.setDepth(m.y + 2);
    if (scene.usuariox) { try { scene.usuariox.setDepth(m.y + 3); } catch (e) {} }
  }

  function navegar(st) {
    var scene = st.scene, cam = scene.cameras && scene.cameras.main;
    st.fase = 'navegando';
    st.tweenViaje = scene.tweens.add({
      targets: st.f, x: st.sitio.hastaX, duration: ZARPA_MS, ease: 'Sine.easeIn',
      onComplete: function () { st.tweenViaje = null; }
    });
    st.relojFundido = scene.time.delayedCall(ZARPA_MS - FUNDIDO_MS - 200, function () {
      st.relojFundido = null;
      if (!st.vivo) return;
      st.fase = 'llegando';
      if (cam && typeof cam.fadeOut === 'function') {
        cam.fadeOut(FUNDIDO_MS, 0, 0, 0);
        cam.once('camerafadeoutcomplete', function () { if (st.vivo) viajar(st); });
      } else viajar(st);
    });
  }

  function viajar(st) {
    var scene = st.scene, d = st.sitio.destino;
    if (d.tipo === 'pagado') {
      var fue = false;
      try { fue = !!(window.GFViaje && window.GFViaje.viajar({ mundo: d.mundo, x: d.x, y: d.y })); } catch (e) { fue = false; }
      if (!fue) { devolver(st, st.pago); volverAlMuelle(st, 'The ferry could not leave the harbor.'); }
      return;
    }
    var p = null;
    try { p = window.GFZonas && window.GFZonas.viajar ? window.GFZonas.viajar(scene, d.clave) : null; } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') { volverAlMuelle(st, 'The ferry could not leave the harbor.'); return; }
    p.then(function (ok) { if (!ok && st.vivo) volverAlMuelle(st, 'The ferry could not leave the harbor. Try again.'); })
     .catch(function () { if (st.vivo) volverAlMuelle(st, 'The ferry could not leave the harbor. Try again.'); });
  }

  /** El viaje no empezó: el barco vuelve a su sitio y el pasajero baja al muelle. */
  function volverAlMuelle(st, texto) {
    var scene = st.scene, p = scene.player, cam = scene.cameras && scene.cameras.main;
    pararTweens(st);
    st.f.x = st.sitio.ferri.x;
    st.fase = 'amarrado';
    if (p && p.scene) { p.x = st.sitio.bajada.x; p.y = st.sitio.bajada.y; }
    devolverMandos(st);
    try { if (cam) { cam.resetFX(); cam.fadeIn(400, 0, 0, 0); } } catch (e) {}
    colocar(st);
    if (texto) avisar(scene, texto, 'warning');
  }

  /** Pagado, pero el viaje no pudo ni empezar: se devuelve el billete. */
  function devolver(st, pago) {
    var scene = st.scene;
    if (!pago || !pago.billete) return;
    api('/api/viaje/mapa/devolver', { billete: pago.billete }).then(function (r) {
      var x = (r && r.datos) || {};
      if (r && r.ok && x.ok) {
        if (window.GFBronce && x.stats) window.GFBronce.adoptarStats(x.stats);
        avisar(scene, 'Your ' + num(x.devuelto) + ' Bronze were refunded.', 'warning');
      } else avisar(scene, 'The refund failed. Contact support.', 'error');
    }).catch(function () { avisar(scene, 'The refund failed. Contact support.', 'error'); });
  }

  /** La estela: espuma que nace en la popa y se abre detrás. */
  function estela(st, t) {
    if (t < st.estela) return;
    st.estela = t + 110;
    var scene = st.scene, f = st.f;
    var popa = delCuadro(f, 6, AGUA - 2);
    var e = scene.add.ellipse(popa.x - 8 * f.mira, popa.y + (Math.random() * 8 - 4), 22, 8, 0xeaf6ff, 0.55).setDepth(0.95);
    scene.tweens.add({ targets: e, scaleX: 2.6, scaleY: 1.8, alpha: 0, x: e.x - 40 * f.mira, duration: 900,
                       ease: 'Quad.easeOut', onComplete: function () { try { e.destroy(); } catch (x) {} } });
  }

  function pararTweens(st) {
    ['tweenSalto', 'tweenViaje'].forEach(function (k) { if (st[k]) { try { st[k].stop(); } catch (e) {} st[k] = null; } });
    if (st.relojFundido) { try { st.relojFundido.remove(false); } catch (e) {} st.relojFundido = null; }
  }

  // ── DESMONTAJE ─────────────────────────────────────────────────────────────
  function desmontar(scene) {
    var st = scene && scene.__gfFerri;
    if (!st) return;
    st.vivo = false;
    scene.__gfFerri = null;
    cerrarTarjeta(st);
    quitarBocadillo(st);
    pararTweens(st);
    if (st.tweenVaiven) { try { st.tweenVaiven.stop(); } catch (e) {} }
    devolverMandos(st);
    if (st.alCargar) { try { scene.load.off('complete', st.alCargar); } catch (e) {} }
    clearTimeout(st.limite);
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onPost) scene.events.off('postupdate', st.onPost);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    st.objetos.forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    st.objetos.length = 0;
  }

  /** Para GFAgua.montar: ni piedras ni troncos debajo del muelle ni en la ruta. */
  function excluir(scene) {
    var s = sitioDe(scene);
    return s ? s.excluir.map(function (z) { return { x: z.x, y: z.y, width: z.width, height: z.height }; }) : [];
  }

  window.GFFerri = {
    montar: montar, desmontar: desmontar, excluir: excluir, SITIOS: SITIOS,
    COTAS: { CUADRO: CUADRO, CENTRO: CENTRO, AGUA: AGUA, BORDA_LEJOS: BORDA_LEJOS, ESCALA: ESCALA, PIES: PIES,
             BARQUERO: SITIO_BARQUERO, PASAJERO: SITIO_PASAJERO },
    _interno: { estado: function (s) { return s && s.__gfFerri; }, delCuadro: delCuadro, impedimento: impedimento,
                abrirTarjeta: abrirTarjeta, zarpar: zarpar, cerrarTarjeta: cerrarTarjeta }
  };
})();
