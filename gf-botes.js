/* ===========================================================================
 * EL BOTE                                                          (2026-10-21)
 *
 * "Quiero en la tienda poder comprar o vender un bote 2.5D (con su tabla de
 * creación automática) en el cual me pueda poner en cualquier agua de
 * GameScene, el desierto, el mapa de nieve, la mina, el cementerio y el mapa
 * salvaje, y que pueda pescar desde el bote; si me bajo y le doy clic con la
 * pala, que me lo devuelva al inventario. Y que los otros personajes vean el
 * bote: cuando me subo, cuando pesco y cuando me bajo y lo quito con la pala."
 *
 * QUÉ HACE
 *   · PONERLO: con el bote cogido de la bolsa (arrastrándolo, como la
 *     antorcha), un clic en el AGUA cerca del personaje: /api/botes/poner
 *     quema 1 de la tabla `bote` y lo apunta para toda la zona (los diez
 *     canales). Uno por jugador.
 *   · SUBIR: clic en TU bote (o la tecla G) estando cerca. El servidor dice
 *     quién va a bordo (bote:subir → bote:estado) y el personaje se sienta
 *     dentro: el bote son DOS capas (el fondo debajo del remero y el costado
 *     de cerca encima), así que se le ven el cuerpo y los brazos y no las
 *     piernas.
 *   · REMAR: las mismas teclas y el mismo clic de siempre, pero solo por el
 *     agua y algo más despacio. Se hace cambiando, en ESTA escena, el
 *     `_resolverChoqueJugador` de GameScene (lo llaman el pueblo, la mina, el
 *     mapa salvaje y las tres zonas después de mover al jugador): a bordo,
 *     "chocar" es salirse del agua. Al bajar se quita y vuelve el de siempre.
 *   · PESCAR: gf-pesca no sabe nada del bote: con los pies en el agua está "en
 *     la orilla" y el lance cae alrededor. El servidor lo acepta igual (la
 *     posición está en el agua de la pesca).
 *   · BAJAR: el botón "Land" (o G): el personaje salta a la orilla libre más
 *     cercana y el bote se queda flotando donde estaba (bote:bajar).
 *   · RECOGERLO: bajado, con la PALA de construcción cogida de la bolsa, clic
 *     en tu bote: /api/botes/recoger lo saca del agua y lo vuelve a acuñar.
 *   · LOS DEMÁS lo ven todo: el bote quieto, el remero dentro (el bote sigue a
 *     su sprite), su pesca (va en su playerMove, como siempre), cuando se baja
 *     y cuando lo recoge (desaparece con una onda).
 *
 * DÓNDE HAY AGUA
 *   La de gf-agua.js (clase 2 = agua entera) en el pueblo, el mapa salvaje y
 *   las zonas; en la mina, el mapa de la pesca que MinaScene arma con sus
 *   charcas (`__gfPescaAgua`). El servidor comprueba lo mismo (gfEsAgua).
 *
 * CÓMO SE ENGANCHA
 *   GFBotes.montar(scene) en GameScene (el pueblo), MinaScene, SalvajeScene
 *   y ZonasScenes. Las demás escenas (la isla, las casas) se descartan por su
 *   clave. Se desmonta solo al apagarse la escena (y si iba a bordo, el bote
 *   se queda donde estaba).
 * ======================================================================== */
(function () {
  'use strict';

  var V = '20261021a';
  var ZONAS = { GameScene: 'game', MinaScene: 'mina', SalvajeScene: 'salvaje',
                CementerioScene: 'cementerio', DesiertoScene: 'desierto', TundraScene: 'tundra' };
  var TEX = 'gfbo_bote';
  var ESCALA = 2;                 // 72 px de largo × 2: el remero (102 px) cabe sentado
  var QUILLA = 40;                // los pies = p.y + 40 (lo mismo que la pesca y el servidor)
  var BAJO_QUILLA = 12;           // el borde de abajo del dibujo, bajo los pies
  var ALCANCE = 220;              // de los pies al bote (el servidor admite 260)
  var REMO = 0.62;                // remando se va al 62 % de la velocidad a pie
  var ORILLA_MAX = 260;           // hasta dónde se busca tierra al bajar

  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function socketDe(scene) { return scene.socket || window.globalSocket || null; }
  function miSocket(scene) { var s = socketDe(scene); return s && s.id ? s.id : null; }
  function fantasma(scene) { return !!(window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene)); }

  // ─────────────────────────────────────────────────────── EL AGUA
  /** 0 seco, 1 orilla, 2 agua entera. */
  function claseAgua(scene, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    if (scene.__gfAgua && window.GFAgua && window.GFAgua.claseEn) return window.GFAgua.claseEn(scene, x, y);
    var pa = scene.__gfPescaAgua;                  // la mina (charcas de area_agua)
    if (pa && pa.m) {
      var t = pa.tileSize || 16, cx = Math.floor(x / t), cy = Math.floor(y / t);
      if (cx < 0 || cy < 0 || cx >= pa.w || cy >= pa.h) return 0;
      return pa.m[cy * pa.w + cx] || 0;
    }
    return 0;
  }
  /* La forma del casco a ×2, desde la quilla: `h` de lado (144 px de largo),
     `v` de frente (la proa hacia arriba, 108 px). [dx, dy, clase mínima]: el
     cuerpo en agua entera (2) y las puntas al menos en la orilla (1). */
  var CASCO = {
    h: [[0, 0, 2], [-40, 0, 2], [40, 0, 2], [-62, 0, 1], [62, 0, 1], [0, -14, 1], [0, 10, 1]],
    v: [[0, 0, 2], [0, -40, 2], [0, -76, 1], [-26, -20, 1], [26, -20, 1], [0, 10, 1]]
  };
  /** ¿Cabe el casco con la quilla en (x, ky), mirando de lado (h) o de frente (v)? */
  function cabeCasco(scene, x, ky, vista) {
    var pts = CASCO[vista] || CASCO.h;
    for (var i = 0; i < pts.length; i++) if (claseAgua(scene, x + pts[i][0], ky + pts[i][1]) < pts[i][2]) return false;
    return true;
  }

  // ─────────────────────────────────────────────────────── EL DIBUJO
  function texturas(scene) {
    var listo = function () {
      if (!scene.textures.exists(TEX)) return false;
      try { scene.textures.get(TEX).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
      return true;
    };
    if (scene.textures.exists(TEX)) return Promise.resolve(listo());
    return new Promise(function (ok) {
      var hecho = false, reloj = null;
      var fin = function (vivo) {
        if (hecho) return;
        hecho = true;
        clearTimeout(reloj);
        scene.load.off('complete', completo);
        scene.events.off('shutdown', apagar);
        scene.events.off('destroy', apagar);
        ok(vivo ? listo() : false);
      };
      var completo = function () { fin(true); };
      var apagar = function () { fin(false); };
      scene.load.atlas(TEX, './Game/Objetos/bote/bote_mundo.png?v=' + V, './Game/Objetos/bote/bote_mundo.json?v=' + V);
      scene.load.once('complete', completo);
      scene.events.once('shutdown', apagar);
      scene.events.once('destroy', apagar);
      reloj = setTimeout(completo, 8000);
      scene.load.start();
    });
  }

  /** Cada bote: sus dos capas, su sombra en el agua y hacia dónde mira. */
  function crear(st, d) {
    if (!d || !d.id || d.zona !== st.zona) return;
    var e = st.botes[d.id];
    if (!e) {
      if (!st.arte) { st.pendientes[d.id] = d; return; }
      var scene = st.scene;
      var atras = scene.add.image(0, 0, TEX, 'h_atras').setOrigin(0.5, 1).setScale(ESCALA);
      var delante = scene.add.image(0, 0, TEX, 'h_delante').setOrigin(0.5, 1).setScale(ESCALA);
      // La sombra del casco en el agua: una elipse lisa y oscura, sin puntos.
      var sombra = scene.add.ellipse(0, 0, 120, 22, 0x0a2030, 0.22).setDepth(0.6);
      e = st.botes[d.id] = { id: d.id, x: Number(d.x), y: Number(d.y), atras: atras, delante: delante, sombra: sombra,
                             vista: 'h', izquierda: false, fase: Math.random() * 6.28, aBordo: null, ultimo: null, visible: true };
      atras.setAlpha(0); delante.setAlpha(0);
      scene.tweens.add({ targets: [atras, delante], alpha: 1, duration: 260 });
    }
    e.dueno = d.dueno; e.deNombre = d.deNombre || '';
    // El que rema manda en dónde está SU bote: lo del servidor llega con retraso.
    if (Number.isFinite(Number(d.x)) && Number.isFinite(Number(d.y)) && st.aBordo !== e.id) {
      e.x = Number(d.x); e.y = Number(d.y);
    }
    var antes = e.aBordo;
    e.aBordo = d.aBordo || null;
    if (antes && !e.aBordo) e.ultimo = null;
    colocar(st, e, st.scene.time ? st.scene.time.now : 0);
  }

  /* LA MASCOTA SE QUEDA EN TIERRA (2026-10-21): mientras su dueño rema, el
     perro no anda por encima del agua; se esconde (el suyo y el de los demás)
     y vuelve a verse al bajar. Se esconde en 'postupdate', después de que
     GameScene lo mueva y lo enseñe: así manda esto en el dibujo. */
  function mascotaDe(st, e, remero) {
    var scene = st.scene;
    if (remero === scene.player) return [scene.dog && scene.dog.sprite, scene.dog && scene.dog.shadowContainer, scene.dogNameText];
    var o = scene.otherPlayers && scene.otherPlayers[e.aBordo], d = o && o.dog;
    return d ? [d.sprite, d.shadowContainer, d.nameText] : [];
  }
  function esconderMascota(st, e, remero) {
    // Solo se apunta lo que se escondió AQUÍ: lo que ya estaba oculto (el
    // reposo de gf-reposo, sin mascota…) no se enseña luego por error.
    e.mascota = e.mascota || [];
    mascotaDe(st, e, remero).forEach(function (o) {
      if (!o || !o.scene || !o.setVisible || !o.visible) return;
      o.setVisible(false);
      if (e.mascota.indexOf(o) < 0) e.mascota.push(o);
    });
  }
  function devolverMascota(e) {
    if (!e.mascota) return;
    e.mascota.forEach(function (o) { try { if (o && o.scene) o.setVisible(true); } catch (x) {} });
    e.mascota = null;
  }

  /* A BORDO NO SE ANDA (2026-10-21): "cuando navego con el bote se ve que
     camino y se ven las sombras de pasos en el agua". GameScene pone la
     animación de andar en cada fotograma en que el remero se mueve (la suya
     y la de los demás): aquí, en 'postupdate', se para en su primer
     fotograma, el de quieto: sentado en el bote. Pescando no se toca (manda
     la caña). Y la marca `__gfABordo` en el sprite hace que gf-pisadas y
     gf-nieve no dejen huellas ni polvo en el agua. */
  function sentar(remero) {
    var an = remero.anims;
    if (!an || !an.isPlaying) return;
    var a = an.currentAnim, f = a && a.frames && a.frames[0];
    an.stop();
    if (f && f.textureKey) remero.setTexture(f.textureKey, f.textureFrame);
  }
  function soltarRemero(e) {
    if (e.remero) { try { e.remero.__gfABordo = false; } catch (x) {} }
    e.remero = null;
  }

  function destruir(st, e, conOnda) {
    soltarRemero(e);
    devolverMascota(e);
    if (conOnda) onda(st, e.x, e.y);
    [e.atras, e.delante, e.sombra].forEach(function (o) {
      try { if (o && o.scene) { st.scene.tweens.killTweensOf(o); o.destroy(); } } catch (x) {}
    });
    if (st.botes[e.id] === e) delete st.botes[e.id];
  }

  function onda(st, x, y) {
    try { if (window.GFAgua && window.GFAgua.anillo) window.GFAgua.anillo(st.scene, x, y, 1.4); } catch (e) {}
  }

  /** Pone las dos capas donde toca: quieto en (x, y), o siguiendo al remero. */
  function colocar(st, e, t) {
    var scene = st.scene, remero = null;
    if (e.aBordo) {
      if (e.aBordo === miSocket(scene) && st.aBordo === e.id) remero = scene.player;
      else {
        var o = scene.otherPlayers && scene.otherPlayers[e.aBordo];
        if (o && o.sprite && o.sprite.active) remero = o.sprite;
      }
    }
    if (remero) {
      var nx = remero.x, ny = remero.y + QUILLA;
      // Hacia dónde mira: hacia donde se mueve (si no se mueve, como estaba).
      if (e.ultimo) {
        var dx = nx - e.ultimo.x, dy = ny - e.ultimo.y;
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
          if (Math.abs(dx) >= Math.abs(dy)) { e.vista = 'h'; e.izquierda = dx < 0; }
          else e.vista = 'v';
          // La estela: un anillo en el agua detrás, de vez en cuando.
          if (t - (e.estelaEn || 0) > 520) { e.estelaEn = t; onda(st, nx - Math.sign(dx) * 34, ny - Math.sign(dy) * 18); }
        }
      }
      e.ultimo = { x: nx, y: ny };
      e.x = nx; e.y = ny;
      esconderMascota(st, e, remero);
      if (e.remero !== remero) soltarRemero(e);
      e.remero = remero;
      remero.__gfABordo = true;
      var otro = remero === scene.player ? null : scene.otherPlayers && scene.otherPlayers[e.aBordo];
      var pescando = otro ? !!otro._pesca : !!scene._accionPersonaje;
      if (!pescando) sentar(remero);
      var prof = remero.depth || remero.y;
      e.atras.setDepth(prof - 0.5);
      e.delante.setDepth(prof + 0.5);
      if (remero === scene.player && st.aBordo === e.id) {
        // Lo que se mira con el teclado manda sobre el movimiento (girarse quieto).
        var d = scene.lastDirection;
        if (d === 'left' || d === 'right') { e.vista = 'h'; e.izquierda = d === 'left'; }
        else if (d === 'up' || d === 'down') e.vista = 'v';
      }
    } else {
      soltarRemero(e);
      devolverMascota(e);
      e.atras.setDepth(e.y - 30);
      e.delante.setDepth(e.y - 29.9);
    }
    var vaivem = Math.round(Math.sin(t / 650 + e.fase) * 1.2);
    var fA = e.vista + '_atras', fD = e.vista + '_delante';
    if (e.atras.frame.name !== fA) e.atras.setFrame(fA);
    if (e.delante.frame.name !== fD) e.delante.setFrame(fD);
    var flip = e.vista === 'h' && e.izquierda;
    e.atras.setFlipX(flip); e.delante.setFlipX(flip);
    e.atras.setPosition(e.x, e.y + BAJO_QUILLA + vaivem);
    e.delante.setPosition(e.x, e.y + BAJO_QUILLA + vaivem);
    e.sombra.setPosition(e.x, e.y + BAJO_QUILLA - 4);
    if (e.vista === 'v') e.sombra.setSize(56, 30); else e.sombra.setSize(120, 22);
  }

  /** ¿El punto del mundo cae sobre el dibujo de ese bote? */
  function tocaBote(e, x, y) {
    var ancho = e.vista === 'v' ? 40 : 76, alto = e.vista === 'v' ? 112 : 64;
    return Math.abs(x - e.x) <= ancho && y <= e.y + BAJO_QUILLA + 6 && y >= e.y + BAJO_QUILLA - alto;
  }
  function miBote(st) {
    var yo = st.scene.playerName;
    for (var id in st.botes) if (st.botes[id].dueno && st.botes[id].dueno === yo) return st.botes[id];
    return null;
  }

  // ─────────────────────────────────────────────────────── EL SERVIDOR
  function cargar(st) {
    api('/api/botes?zona=' + encodeURIComponent(st.zona)).then(function (r) {
      if (!st.vivo || !r) return;
      if (r.status === 404) { st.sinServidor = true; return; }
      if (!r.ok || !r.datos) return;
      var vistos = {};
      (r.datos.lista || []).forEach(function (b) { vistos[b.id] = true; crear(st, b); });
      for (var id in st.botes) if (!vistos[id] && st.aBordo !== id) destruir(st, st.botes[id], false);
      // Volver a cargar con los pies en el agua junto a TU bote (se recargó la
      // página remando): de vuelta a bordo, en vez de andar sobre el agua.
      var p = st.scene.player, mio = miBote(st);
      if (!st.aBordo && p && mio && !mio.aBordo && claseAgua(st.scene, p.x, p.y + QUILLA) === 2 &&
          Math.hypot(mio.x - p.x, mio.y - (p.y + QUILLA)) < 160) pedirSubir(st, mio);
    }).catch(function () {});
  }

  function atarSocket(st) {
    var s = socketDe(st.scene);
    if (s === st.socket) return;
    soltarSocket(st);
    if (!s || !s.on) return;
    st.socket = s;
    st.oyentes = {
      'bote:nuevo': function (d) { if (st.vivo) crear(st, d); },
      'bote:estado': function (d) { if (st.vivo) alEstado(st, d); },
      'bote:quitado': function (d) {
        if (!st.vivo || !d || !st.botes[d.id]) return;
        if (st.aBordo === d.id) bajarLocal(st, null);
        destruir(st, st.botes[d.id], true);
      },
      'bote:rechazado': function (d) {
        if (!st.vivo) return;
        st.subiendo = null;
        // Iba a bordo y no se pudo volver a subir (tras reconectar): a la orilla.
        if (st.aBordo) bajarLocal(st, orillaCercana(st));
        var textos = { no_es_tuyo: 'That boat is not yours.', fuera_de_zona: 'Walk a little first, then try again.',
                       lejos: 'Walk closer to your boat.', ocupado: 'Someone is already in that boat.' };
        aviso(st.scene, textos[d && d.motivo] || 'You cannot get in the boat right now.', 'warning');
      },
      /* Al reconectar el socket cambia de id y el servidor (al cortarse) dejó
         el bote libre: se vuelve a subir, un momento después de entrar en la
         sala (sin sala, el servidor contesta `fuera_de_zona`). */
      'connect': function () {
        if (!st.vivo) return;
        cargar(st);
        var id = st.aBordo;
        if (id) setTimeout(function () {
          var s2 = socketDe(st.scene);
          if (!st.vivo || st.aBordo !== id || !s2 || !s2.connected) return;
          st.subiendo = id; st.subiendoHasta = (st.scene.time ? st.scene.time.now : 0) + 5000;
          s2.emit('bote:subir', { id: id });
        }, 1500);
      }
    };
    Object.keys(st.oyentes).forEach(function (ev) { s.on(ev, st.oyentes[ev]); });
  }
  function soltarSocket(st) {
    if (st.socket && st.oyentes) Object.keys(st.oyentes).forEach(function (ev) { try { st.socket.off(ev, st.oyentes[ev]); } catch (e) {} });
    st.socket = null; st.oyentes = null;
  }

  function alEstado(st, d) {
    if (!d || !d.id) return;
    var yo = miSocket(st.scene);
    crear(st, d);
    if (st.subiendo === d.id && d.aBordo && d.aBordo === yo) {
      st.subiendo = null;
      if (st.aBordo !== d.id) subirLocal(st, st.botes[d.id]);   // (al reconectar ya iba dentro)
    }
    // El servidor dice que ya no voy en él (otra pestaña, una reconexión…): abajo.
    else if (st.aBordo === d.id && d.aBordo !== yo && !st.subiendo) bajarLocal(st, null);
  }

  // ─────────────────────────────────────────────────────── SUBIR, REMAR, BAJAR
  function pedirSubir(st, e) {
    var scene = st.scene, p = scene.player, s = socketDe(scene);
    if (!p || !e || st.aBordo || st.subiendo) return;
    if (fantasma(scene)) { aviso(scene, 'You are a ghost — revive first.', 'warning'); return; }
    if (scene._accionPersonaje) return;                       // pescando en la orilla, etc.
    if (Math.hypot(e.x - p.x, e.y - (p.y + QUILLA)) > ALCANCE) { aviso(scene, 'Walk closer to your boat.', 'info'); return; }
    if (e.aBordo) { aviso(scene, 'Someone is already in that boat.', 'info'); return; }
    if (!s || !s.connected) { aviso(scene, 'Connecting… try again in a moment.', 'info'); return; }
    st.subiendo = e.id;
    s.emit('bote:subir', { id: e.id });
    // Si el servidor no contesta (sin la parte del bote), no se queda colgado.
    st.subiendoHasta = (scene.time ? scene.time.now : 0) + 5000;
  }

  function subirLocal(st, e) {
    var scene = st.scene, p = scene.player;
    if (!e || !p) return;
    st.aBordo = e.id;
    e.ultimo = null;
    // De un salto, sentado en el bote.
    var desde = { x: p.x, y: p.y };
    p.x = e.x; p.y = e.y - QUILLA;
    try { scene.tweens.add({ targets: p, y: { from: p.y - 14, to: p.y }, duration: 200, ease: 'Quad.easeIn' }); } catch (x) {}
    if (Math.hypot(desde.x - p.x, desde.y - p.y) > 4) onda(st, e.x, e.y);
    // A bordo, "chocar" es salirse del agua (y se rema algo más despacio).
    var propio = Object.prototype.hasOwnProperty.call(scene, '_resolverChoqueJugador') ? scene._resolverChoqueJugador : undefined;
    st.resolverPropio = propio;
    scene._resolverChoqueJugador = function (prevX, prevY, alto) {
      st.alto = alto || st.alto;
      var pl = this.player;
      if (!pl) return;
      var nx = prevX + (pl.x - prevX) * REMO, ny = prevY + (pl.y - prevY) * REMO;
      // El casco gira con el rumbo: de lado si va más en horizontal, de frente si no.
      var vista = Math.abs(nx - prevX) >= Math.abs(ny - prevY) ? 'h' : 'v';
      if (!cabeCasco(scene, nx, prevY + QUILLA, vista)) nx = prevX;
      if (!cabeCasco(scene, nx, ny + QUILLA, vista)) ny = prevY;
      pl.x = nx; pl.y = ny;
    };
    boton(st).hidden = false;
    aviso(scene, '⛵ In your boat — row with the usual keys. "Land" (G) to get off.', 'info');
  }

  /** Se baja: el bote se queda donde estaba; el remero, a `orilla` (o donde esté). */
  function bajarLocal(st, orilla) {
    var scene = st.scene, p = scene.player, e = st.botes[st.aBordo];
    if (!st.aBordo) return;
    st.aBordo = null;
    if (st.resolverPropio === undefined) delete scene._resolverChoqueJugador;
    else scene._resolverChoqueJugador = st.resolverPropio;
    st.resolverPropio = undefined;
    if (e) { e.ultimo = null; colocar(st, e, scene.time ? scene.time.now : 0); }
    if (p && orilla) {
      try { scene.tweens.add({ targets: p, x: orilla.x, y: orilla.y, duration: 220, ease: 'Quad.easeOut' }); }
      catch (x) { p.x = orilla.x; p.y = orilla.y; }
    }
    if (st.boton) st.boton.hidden = true;
  }

  /** La tierra libre más cercana para los pies (y que no choque con nada). */
  function orillaCercana(st) {
    var scene = st.scene, p = scene.player, alto = st.alto || 15;
    var libre = function (x, y) {
      if (claseAgua(scene, x, y + QUILLA) !== 0) return false;
      if (scene.map && (x < 20 || y < 20 || x > scene.map.widthInPixels - 20 || y > scene.map.heightInPixels - 60)) return false;
      return !(typeof scene._chocaConEscenario === 'function' && scene._chocaConEscenario(x - 15, y + 25, 30, alto));
    };
    for (var r = 16; r <= ORILLA_MAX; r += 10) {
      var n = Math.max(12, Math.round(r / 6));
      for (var k = 0; k < n; k++) {
        var a = (k / n) * Math.PI * 2;
        var x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (libre(x, y)) return { x: x, y: y };
      }
    }
    return null;
  }

  function pedirBajar(st) {
    var scene = st.scene, p = scene.player, e = st.botes[st.aBordo];
    if (!st.aBordo || !p) return;
    if (scene._accionPersonaje === 'pesca') { aviso(scene, 'Reel in the line first.', 'info'); return; }
    var orilla = orillaCercana(st);
    if (!orilla) { aviso(scene, 'Row closer to the shore to land.', 'info'); return; }
    var s = socketDe(scene);
    if (s && s.connected && e) s.emit('bote:bajar', { id: e.id, x: Math.round(e.x), y: Math.round(e.y) });
    bajarLocal(st, orilla);
  }

  // ─────────────────────────────────────────────────────── EL BOTÓN "LAND"
  function boton(st) {
    if (st.boton && st.boton.isConnected) return st.boton;
    var b = document.getElementById('gf-bote-btn');
    if (!b) {
      b = document.createElement('button');
      b.id = 'gf-bote-btn';
      b.type = 'button';
      // El mismo aspecto que el botón de pescar, encima de él.
      b.className = 'gf-pesca-btn gf-bote-btn';
      b.style.bottom = 'calc(160px + env(safe-area-inset-bottom, 0px))';
      b.innerHTML = '<img src="./Game/Objetos/bote/bote.png" alt="" draggable="false"><span class="gf-pesca-txt">Land</span><kbd>G</kbd>';
      b.hidden = true;
      document.body.appendChild(b);
    }
    b.tabIndex = -1;
    if (b._gfbo) b.removeEventListener('click', b._gfbo);
    b._gfbo = function (ev) { ev.stopPropagation(); ev.preventDefault(); var s2 = b._st; if (s2 && s2.vivo) pedirBajar(s2); };
    b.addEventListener('click', b._gfbo);
    b._st = st;
    st.boton = b;
    return b;
  }

  // ─────────────────────────────────────────────────────── LOS CLICS
  function ajustarFacturaLocal(scene, invoiceId, quedan) {
    var S = scene.STATE;
    if (!S) return;
    var listas = [S.slots || [], S.quickSlots || []];
    for (var a = 0; a < listas.length; a++) {
      for (var i = 0; i < listas[a].length; i++) {
        if (listas[a][i] && Number(listas[a][i].idx) === Number(invoiceId)) {
          if (quedan > 0) listas[a][i].count = quedan; else listas[a][i] = null;
          try { scene.renderAllSlots(); } catch (x) {}
          try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (x) {}
          return;
        }
      }
    }
  }
  /** El bote vuelve a la bolsa (acuñado por el servidor): como el pez de la pesca. */
  function meterFactura(scene, f) {
    var meter = window.GFPesca && window.GFPesca._interno && window.GFPesca._interno.meterFactura;
    if (meter) { meter(scene, 'bote', f); return; }
    var S = scene.STATE;
    if (!S || !f) return;
    var nuevo = { id: 'bote', idx: Number(f.invoiceId), idm: f.manualId, count: Math.max(1, Number(f.cantidad) || 1) };
    var k = (S.slots || []).indexOf(null);
    if (k >= 0) S.slots[k] = nuevo;
    try { scene.renderAllSlots(); } catch (e) {}
  }

  function poner(st, w) {
    var scene = st.scene, p = scene.player;
    if (Math.hypot(w.x - p.x, w.y - (p.y + QUILLA)) > ALCANCE) { aviso(scene, 'Too far — put the boat on the water closer to you.', 'info'); return; }
    if (!cabeCasco(scene, w.x, w.y)) { aviso(scene, 'The boat goes on open water.', 'info'); return; }
    if (miBote(st)) { aviso(scene, 'You already have a boat on the water: pick it up with the shovel first.', 'info'); return; }
    if (st.ocupado) return;
    st.ocupado = true;
    api('/api/botes/poner', { zona: st.zona, x: Math.round(w.x), y: Math.round(w.y) }).then(function (r) {
      var d = (r && r.datos) || {};
      if (!st.vivo) return;
      if (!r.ok || !d.ok) {
        var textos = { no_tienes: 'You have no boat.', fantasma: 'You are a ghost — revive first.',
          fuera_de_zona: 'Walk a little first, then put the boat down.', no_es_agua: 'The boat goes on the water.',
          lejos: 'Put the boat on the water closer to you.', ya_tienes: 'You already have a boat on the water: pick it up with the shovel first.',
          name_required: 'Choose your character name first.' };
        aviso(scene, r.status === 404 ? 'Boats are not enabled on this server yet (server update pending).'
                                      : (textos[d.error] || d.message || 'The boat could not be placed.'), 'warning');
        return;
      }
      crear(st, d.bote);
      if (d.gastado) ajustarFacturaLocal(scene, d.gastado.invoiceId, Number(d.gastado.cantidadRestante));
      aviso(scene, '⛵ Your boat is on the water — click it to get in.', 'success');
    }).catch(function () {
      if (st.vivo) aviso(scene, 'Connection problem. Try again.', 'error');
    }).then(function () { st.ocupado = false; });
  }

  function recoger(st, e) {
    var scene = st.scene, p = scene.player;
    if (e.dueno !== scene.playerName) { aviso(scene, 'That boat is not yours.', 'info'); return; }
    if (e.aBordo) { aviso(scene, 'Get off the boat first.', 'info'); return; }
    if (Math.hypot(e.x - p.x, e.y - (p.y + QUILLA)) > ALCANCE) { aviso(scene, 'Walk closer to your boat.', 'info'); return; }
    if (st.ocupado) return;
    st.ocupado = true;
    api('/api/botes/recoger', { id: e.id }).then(function (r) {
      var d = (r && r.datos) || {};
      if (!st.vivo) return;
      if (!r.ok || !d.ok) {
        var textos = { sin_pala: 'You need the Construction Shovel to pick up the boat.', a_bordo: 'Get off the boat first.',
          lejos: 'Walk closer to your boat.', no_es_tuyo: 'That boat is not yours.', cadena: 'The chain is busy. Try again.' };
        aviso(scene, textos[d.error] || d.message || 'The boat could not be picked up.', 'warning');
        return;
      }
      if (st.botes[e.id]) destruir(st, st.botes[e.id], true);
      if (d.factura) meterFactura(scene, d.factura);
      aviso(scene, '⛵ Boat back in your bag.', 'success');
    }).catch(function () {
      if (st.vivo) aviso(scene, 'Connection problem. Try again.', 'error');
    }).then(function () { st.ocupado = false; });
  }

  function alClic(st, pointer) {
    var scene = st.scene, S = scene.STATE, p = scene.player;
    if (!p || pointer.button !== 0) return;
    var canvas = scene.sys.canvas, ev = pointer.event;
    if (!ev || !(ev.target === canvas || canvas.contains(ev.target))) return;
    var w = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    var sel = S && S.selectedItem && S.selectedItem.isGhost ? S.selectedItem.id : null;
    if (sel === 'bote') {
      try { scene.clearSelectedItem(); } catch (e) {}
      if (fantasma(scene)) { aviso(scene, 'You are a ghost — revive first.', 'warning'); return; }
      if (window.GFSinNombre && !window.GFSinNombre.exigir(scene, 'boat')) return;
      poner(st, w);
      return;
    }
    var tocado = null;
    for (var id in st.botes) if (tocaBote(st.botes[id], w.x, w.y)) { tocado = st.botes[id]; break; }
    if (sel === 'pala_construccion') {
      try { scene.clearSelectedItem(); } catch (e) {}
      if (tocado) recoger(st, tocado);
      else aviso(scene, 'Click your boat with the shovel to pick it up.', 'info');
      return;
    }
    if (sel || !tocado || st.aBordo) return;
    if (tocado.dueno === scene.playerName) pedirSubir(st, tocado);
    else aviso(scene, '⛵ ' + (tocado.deNombre || 'Someone') + '\'s boat.', 'info');
  }

  // ─────────────────────────────────────────────────────── CADA FOTOGRAMA
  function actualizar(st, t) {
    var scene = st.scene, cam = scene.cameras && scene.cameras.main, v = cam ? cam.worldView : null;
    for (var id in st.botes) {
      var e = st.botes[id];
      var ve = !v || (e.x > v.x - 160 && e.x < v.right + 160 && e.y > v.y - 160 && e.y < v.bottom + 200);
      if (ve !== e.visible) { e.visible = ve; e.atras.setVisible(ve); e.delante.setVisible(ve); e.sombra.setVisible(ve); }
      if (ve || e.aBordo) colocar(st, e, t);
    }
    var mio = st.aBordo ? st.botes[st.aBordo] : null;
    if (mio) {
      // Dónde va, para que no vuelva atrás si se corta la conexión (cada ~0,8 s).
      if (t - (st.posEn || 0) > 800 && (!st.posMandada || Math.hypot(mio.x - st.posMandada.x, mio.y - st.posMandada.y) > 6)) {
        var s = socketDe(scene);
        if (s && s.connected) { s.emit('bote:pos', { id: mio.id, x: Math.round(mio.x), y: Math.round(mio.y) }); st.posMandada = { x: mio.x, y: mio.y }; }
        st.posEn = t;
      }
      if (fantasma(scene)) pedirBajar(st);
    }
    if (st.subiendo && t > (st.subiendoHasta || 0)) {
      st.subiendo = null;
      aviso(scene, 'The boat did not answer. Try again.', 'warning');
    }
    if (t - st.ultimoSocket > 2000) { st.ultimoSocket = t; atarSocket(st); }
    if (t - st.ultimaCarga > 60000) { st.ultimaCarga = t; cargar(st); }
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfBotes) return null;
    var clave = scene.sys && scene.sys.settings && scene.sys.settings.key;
    var zona = ZONAS[clave];
    if (!zona) return null;
    var st = { scene: scene, zona: zona, botes: {}, pendientes: {}, arte: false, vivo: true, aBordo: null, subiendo: null,
               ultimoSocket: 0, ultimaCarga: 0, socket: null, oyentes: null, ocupado: false, alto: zona === 'game' ? 15 : 26 };
    scene.__gfBotes = st;
    texturas(scene).then(function (ok) {
      if (!st.vivo) return;
      st.arte = !!ok;
      if (!ok) { console.warn('[botes] falta Game/Objetos/bote/bote_mundo'); return; }
      Object.keys(st.pendientes).forEach(function (id) { crear(st, st.pendientes[id]); });
      st.pendientes = {};
    });
    // Después de mover al jugador ('postupdate'): el bote va con él en el mismo fotograma.
    st.onUpdate = function (t) { if (st.vivo) actualizar(st, t); };
    scene.events.on('postupdate', st.onUpdate);
    st.onClic = function (pointer) { if (st.vivo) alClic(st, pointer); };
    if (scene.input) scene.input.on('pointerdown', st.onClic);
    st.onTecla = function (ev) {
      var el = document.activeElement;
      if (ev && ev.repeat || el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (st.aBordo) { pedirBajar(st); return; }
      var mio = miBote(st), p = scene.player;
      if (mio && p && Math.hypot(mio.x - p.x, mio.y - (p.y + QUILLA)) <= ALCANCE) pedirSubir(st, mio);
    };
    if (scene.input && scene.input.keyboard) scene.input.keyboard.on('keydown-G', st.onTecla);
    boton(st);
    atarSocket(st);
    cargar(st);
    st.ultimaCarga = 0;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfBotes;
    if (!st) return;
    // Si iba a bordo, el bote se queda donde estaba.
    if (st.aBordo) {
      var e = st.botes[st.aBordo], s = socketDe(scene);
      try { if (s && s.connected && e) s.emit('bote:bajar', { id: e.id, x: Math.round(e.x), y: Math.round(e.y) }); } catch (x) {}
      bajarLocal(st, null);
    }
    st.vivo = false;
    scene.__gfBotes = null;
    scene.events.off('postupdate', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (scene.input) scene.input.off('pointerdown', st.onClic);
    if (scene.input && scene.input.keyboard) scene.input.keyboard.off('keydown-G', st.onTecla);
    soltarSocket(st);
    if (st.boton) { st.boton.hidden = true; if (st.boton._st === st) st.boton._st = null; }
    Object.keys(st.botes).forEach(function (id) { destruir(st, st.botes[id], false); });
    st.pendientes = {};
  }

  window.GFBotes = {
    montar: montar,
    desmontar: desmontar,
    /** ¿Va a bordo el jugador de esta escena? */
    aBordo: function (scene) { var st = scene && scene.__gfBotes; return !!(st && st.aBordo); },
    _interno: { estado: function (s) { return s && s.__gfBotes; }, claseAgua: claseAgua, cabeCasco: cabeCasco, crear: crear,
                orillaCercana: orillaCercana, pedirSubir: pedirSubir, pedirBajar: pedirBajar, QUILLA: QUILLA }
  };
})();
