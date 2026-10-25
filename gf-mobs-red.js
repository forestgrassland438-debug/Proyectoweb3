/* ===========================================================================
 * LA RED DE LOS MONSTRUOS                                          (2026-10-11)
 *
 * "Los enemigos en la mina o el mapa nuevo deben estar vinculados para que a
 * los otros usuarios conectados les salgan en la misma ubicación, con el
 * enemigo que yo, y los vean como yo. Y si ataco, quiero que él me vea
 * atacarlo."
 *
 * CÓMO
 *   El servidor (server2.js, "LOS MONSTRUOS COMPARTIDOS") elige en cada sala
 *   a UN jugador ANFITRIÓN. Solo su navegador piensa por los monstruos (los
 *   mueve, elige a quién perseguir —a él o a cualquiera de los demás— y cuándo
 *   atacar) y manda su foto unas seis veces por segundo. Los demás no piensan:
 *   los dibujan donde dice la foto, suavizando el movimiento.
 *     · Los ATAQUES los anuncia el anfitrión (evento) y CADA jugador los
 *       dibuja y mira si le alcanzan A ÉL: el daño se pide al servidor como
 *       siempre (/api/stats/:p/consume). Nadie hace daño a otro desde lejos.
 *     · Los ESPADAZOS de los demás se le mandan al anfitrión (golpe), que
 *       resta la vida, empuja al monstruo y, si muere, dice QUIÉN lo mató:
 *       solo ése cobra la experiencia y el botín.
 *     · El TAJO de cada uno se reenvía a la sala ('combate:tajo') y aquí se
 *       dibuja sobre el jugador que lo dio: se ve atacar a los demás.
 *   Si el anfitrión se va, el servidor elige otro y ése sigue desde donde
 *   estaban. Sin red (o sin servidor nuevo) cada uno es anfitrión de los
 *   suyos, como antes.
 *
 *   EL ANFITRIÓN DORMIDO (2026-10-11): "en la mina los zombis y los demás
 *   monstruos no hacen daño". Con la pestaña oculta (o el móvil bloqueado)
 *   Phaser para su bucle, pero el socket sigue vivo: el servidor lo seguía
 *   teniendo por anfitrión, nadie movía a los monstruos y los de los demás se
 *   quedaban quietos, sin perseguir ni morder. Ahora:
 *     · al ocultarse la pestaña se avisa ('mobs:dormido') y el servidor pasa
 *       el mando a otro que esté despierto;
 *     · y si de todos modos no llega foto del anfitrión en HUERFANO_MS, este
 *       navegador piensa por sus monstruos (sin mandar nada) hasta que vuelva.
 *
 * USO (un módulo de monstruos)
 *   var red = GFMobsRed.crear(scene, 'zombis', {
 *     exportar: function () { return [[id, x, y, ...], ...]; },   // anfitrión
 *     importar: function (lista) { ... },                           // los demás
 *     alEvento: function (d) { ... },        // un ataque anunciado
 *     alGolpe:  function (d) { ... },        // anfitrión: {id, dano, ux, uy, de}
 *     alCambiarHost: function (soyYo) { ... }
 *   });
 *   red.esHost()  red.tick(t)  red.evento({...})  red.golpe({...})
 *   red.soy(socketId)  red.cerrar()
 *   GFMobsRed.jugadores(scene)   → los pies de todos los jugadores vivos
 *   GFMobsRed.anunciarTajo(scene, dir, arma, poder)   (lo llama gf-espada)
 * ======================================================================== */
(function () {
  'use strict';

  var ESTADO_MS = 160;              // cada cuánto manda la foto el anfitrión
  var HUERFANO_MS = 3000;           // sin foto del anfitrión en este tiempo: se piensa aquí
  var SALAS = { MinaScene: true, SalvajeScene: true,
                // (2026-10-18) Los mapas nuevos (el servidor: MOBS_SALAS).
                CementerioScene: true, DesiertoScene: true, TundraScene: true,
                // (2026-10-25) Los de nivel 8, 9 y 10.
                GlaciarScene: true, CavernaScene: true, PraderaScene: true };
  // Los compartidos vivos, para el aviso de "pestaña oculta" (un solo oyente
  // de document para todos: ninguno se queda atado a una escena muerta).
  var vivos = [];

  function socketDe(scene) { return window.globalSocket || (scene && scene.socket) || null; }

  function muertoLocal(scene) {
    try {
      if (window.GFMuerte && window.GFMuerte.muerto) return !!window.GFMuerte.muerto(scene);
      var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado();
      return !!(e && e.ghost);
    } catch (e2) { return false; }
  }

  function hayOtros(scene) {
    var o = scene.otherPlayers;
    if (!o) return false;
    for (var k in o) if (o[k] && o[k].sprite && o[k].sprite.active) return true;
    return false;
  }

  /**
   * Los pies de los jugadores a los que un monstruo puede ir: el local (si no
   * es un fantasma) y los demás que se ven. `id` null es el local.
   */
  function jugadores(scene, out) {
    out = out || [];
    out.length = 0;
    var p = scene.player;
    if (p && p.active && !muertoLocal(scene)) out.push({ id: null, x: p.x, y: p.y + 45, local: true });
    var o = scene.otherPlayers || {};
    for (var id in o) {
      var r = o[id], s = r && r.sprite;
      if (!s || !s.active || s.visible === false || s.alpha < 0.2) continue;
      out.push({ id: id, x: s.x, y: s.y + 45, local: false });
    }
    return out;
  }

  /** El jugador más cercano a (x, y) a menos de `max` px, o null. */
  function masCercano(scene, x, y, max) {
    var lista = jugadores(scene), mejor = null, md = max || Infinity;
    for (var i = 0; i < lista.length; i++) {
      var d = Math.hypot(lista[i].x - x, lista[i].y - y);
      if (d < md) { md = d; mejor = lista[i]; }
    }
    if (mejor) mejor.d = md;
    return mejor;
  }

  // ─────────────────────────────────────────────────────── LO COMPARTIDO
  function esHost(c) {
    var s = c.socket;
    if (!s || !s.connected) return true;          // sin red: cada uno los suyos
    if (!c.hostConocido || !c.host) return true;  // aún sin respuesta: se piensa
    return c.host === s.id;
  }

  /** Hay anfitrión, no soy yo, y hace HUERFANO_MS que no manda foto de este
      grupo (pestaña oculta, se le colgó el juego…): se piensa aquí. */
  function huerfano(red) {
    var c = red.c, s = c.socket;
    if (!s || !s.connected || !c.hostConocido || !c.host || c.host === s.id) return false;
    var ahora = Date.now();
    return ahora - red.fotoEn > HUERFANO_MS && ahora - c.hostDesde > HUERFANO_MS;
  }
  /** ¿Mueve este navegador a los monstruos de `red`? (anfitrión o huérfano) */
  function piensaAqui(red) { return esHost(red.c) || huerfano(red); }

  /** Pestaña oculta o visible: se le dice al servidor para que el mando lo
      tenga alguien despierto. */
  function avisarSueno(c) {
    var s = c.socket;
    if (!c.vivo || !s || !s.connected) return;
    try { s.emit('mobs:dormido', { si: !!document.hidden }); } catch (e) {}
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      vivos.slice().forEach(avisarSueno);
    });
  }

  function compartido(scene) {
    if (scene.__gfMobsRed) return scene.__gfMobsRed;
    var c = scene.__gfMobsRed = { scene: scene, redes: {}, socket: null, oyentes: null, host: null,
                                  hostConocido: false, hostDesde: 0, saludadoEn: 0, miradoEn: -1e9, vivo: true, efimeros: [] };
    vivos.push(c);
    c.onUpdate = function (t) { if (c.vivo) revisar(c, t); };
    c.onApagar = function () { cerrarCompartido(scene); };
    scene.events.on('update', c.onUpdate);
    scene.events.once('shutdown', c.onApagar);
    scene.events.once('destroy', c.onApagar);
    revisar(c, 0);
    return c;
  }

  function revisar(c, t) {
    if (t - c.miradoEn < 800) return;
    c.miradoEn = t;
    var s = socketDe(c.scene);
    if (s !== c.socket) { soltar(c); atar(c, s); }
    if (!c.socket || !c.socket.connected) return;
    // "Tengo monstruos aquí". Si el servidor no contesta (llegó antes que el
    // joinRoom de la escena), se repite cada 3 s hasta que conteste.
    if (!c.saludadoEn || (!c.hostConocido && t - c.saludadoEn > 3000)) {
      c.saludadoEn = t || 1;
      c.socket.emit('mobs:hola', { dormido: typeof document !== 'undefined' && !!document.hidden });
    }
  }

  function avisarRedes(c) {
    Object.keys(c.redes).forEach(function (g) { c.redes[g].revisarHost(); });
  }

  function atar(c, s) {
    if (!s || !s.on) return;
    c.socket = s;
    c.hostConocido = false; c.host = null; c.saludadoEn = 0;
    c.oyentes = {
      'mobs:host': function (d) {
        var nuevo = d && d.host ? String(d.host) : null;
        if (nuevo !== c.host || !c.hostConocido) c.hostDesde = Date.now();
        c.hostConocido = true;
        c.host = nuevo;
        avisarRedes(c);
      },
      'mobs:estado': function (d) {
        if (!d || !c.redes[d.g]) return;
        // Quien manda la foto es el anfitrión, diga lo que diga lo de antes.
        if (d.de && d.de !== c.host) { c.host = String(d.de); c.hostConocido = true; c.hostDesde = Date.now(); }
        // Antes de mirar si se piensa aquí: con foto nueva ya no hay huérfano.
        c.redes[d.g].fotoEn = Date.now();
        avisarRedes(c);
        if (esHost(c)) return;
        try { c.redes[d.g].h.importar(d.l || []); } catch (e) { console.warn('[red] foto ' + d.g, e); }
      },
      'mobs:evento': function (d) {
        if (!d || !c.redes[d.g] || esHost(c)) return;
        try { c.redes[d.g].h.alEvento && c.redes[d.g].h.alEvento(d); } catch (e) { console.warn('[red] evento ' + d.g, e); }
      },
      'mobs:golpe': function (d) {
        if (!d || !c.redes[d.g] || !esHost(c)) return;
        try { c.redes[d.g].h.alGolpe && c.redes[d.g].h.alGolpe(d); } catch (e) { console.warn('[red] golpe ' + d.g, e); }
      },
      'mobs:pideFoto': function () {
        Object.keys(c.redes).forEach(function (g) { c.redes[g].forzar = true; });
      },
      'combate:tajo': function (d) { if (c.vivo) verTajo(c, d); },
      'connect': function () { c.hostConocido = false; c.host = null; c.saludadoEn = 0; c.miradoEn = -1e9; avisarRedes(c); }
    };
    Object.keys(c.oyentes).forEach(function (ev) { s.on(ev, c.oyentes[ev]); });
  }

  function soltar(c) {
    if (c.socket && c.oyentes) Object.keys(c.oyentes).forEach(function (ev) { try { c.socket.off(ev, c.oyentes[ev]); } catch (e) {} });
    c.socket = null; c.oyentes = null;
  }

  function cerrarCompartido(scene) {
    var c = scene.__gfMobsRed;
    if (!c) return;
    c.vivo = false;
    var i = vivos.indexOf(c);
    if (i >= 0) vivos.splice(i, 1);
    soltar(c);
    scene.events.off('update', c.onUpdate);
    scene.events.off('shutdown', c.onApagar);
    scene.events.off('destroy', c.onApagar);
    c.efimeros.slice().forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    c.efimeros.length = 0;
    c.redes = {};
    scene.__gfMobsRed = null;
  }

  // ─────────────────────────────────────────────────────── UNA RED
  function crear(scene, grupo, h) {
    var c = compartido(scene);
    var red = { c: c, grupo: grupo, h: h || {}, ultimoEnvio: -1e9, eraHost: null, forzar: false, fotoEn: Date.now() };
    c.redes[grupo] = red;
    red.esHost = function () { return piensaAqui(red); };
    red.miId = function () { return c.socket && c.socket.connected ? c.socket.id : 'local'; };
    red.soy = function (id) { return !id || id === red.miId(); };
    red.revisarHost = function () {
      var ahora = piensaAqui(red);
      if (ahora === red.eraHost) return;
      red.eraHost = ahora;
      red.forzar = ahora;
      try { if (red.h.alCambiarHost) red.h.alCambiarHost(ahora); } catch (e) { console.warn('[red] host ' + grupo, e); }
    };
    /** Cada fotograma (lo llama el módulo): manda la foto si toca. */
    red.tick = function (t) {
      red.revisarHost();
      // El huérfano piensa pero no manda: el servidor no se lo aceptaría.
      if (!red.eraHost || !esHost(c) || !c.socket || !c.socket.connected || !c.hostConocido) return;
      if (!red.forzar && (t - red.ultimoEnvio < ESTADO_MS || !hayOtros(scene))) return;
      red.forzar = false;
      red.ultimoEnvio = t;
      var l;
      try { l = red.h.exportar ? red.h.exportar() : null; } catch (e) { return; }
      if (l && l.length) c.socket.emit('mobs:estado', { g: grupo, l: l });
    };
    /** Anfitrión: un ataque, una muerte… para los demás. */
    red.evento = function (d) {
      if (!esHost(c) || !c.socket || !c.socket.connected || !hayOtros(scene)) return;
      d.g = grupo;
      c.socket.emit('mobs:evento', d);
    };
    /** Un espadazo a un monstruo: el anfitrión lo aplica; los demás se lo mandan. */
    red.golpe = function (d) {
      d.g = grupo;
      // Anfitrión o huérfano: se aplica aquí (y el huérfano no lo manda, que
      // el anfitrión dormido lo contaría otra vez al despertar).
      if (piensaAqui(red)) { d.de = red.miId(); try { red.h.alGolpe && red.h.alGolpe(d); } catch (e) {} return; }
      if (c.socket && c.socket.connected) c.socket.emit('mobs:golpe', d);
    };
    red.cerrar = function () { if (c.redes[grupo] === red) delete c.redes[grupo]; };
    red.revisarHost();
    return red;
  }

  // ─────────────────────────────────────────────────────── EL TAJO DE LOS DEMÁS
  /** Lo llama gf-espada.js en cada tajo: que los demás lo vean. */
  function anunciarTajo(scene, dir, arma, poder) {
    if (!scene || !scene.sys || !SALAS[scene.sys.settings.key]) return;
    var s = socketDe(scene);
    if (!s || !s.connected || !hayOtros(scene)) return;
    s.emit('combate:tajo', { dir: dir, arma: arma, poder: poder || null });
  }

  function efimero(c, o) { c.efimeros.push(o); return o; }
  function soltarEfimero(c, o) {
    var i = c.efimeros.indexOf(o);
    if (i >= 0) c.efimeros.splice(i, 1);
    try { if (o && o.scene) o.destroy(); } catch (e) {}
  }

  /** La espada de otro jugador, vista desde aquí: el mismo barrido que la nuestra. */
  function verTajo(c, d) {
    var scene = c.scene, o = d && scene.otherPlayers && scene.otherPlayers[d.id];
    var s = o && o.sprite;
    if (!s || !s.active || !s.visible) return;
    var k = 'gfs_' + d.arma;
    var dir = ['left', 'right', 'up', 'down'].indexOf(d.dir) >= 0 ? d.dir : 'right';
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
    var mano = { right: [14, 7], left: [-14, 7], up: [-8, 0], down: [10, 12] }[dir];
    var prof = dir === 'up' ? s.depth - 1 : s.depth + 1;
    // (2026-10-21) El arco y el bastón no barren: se ve volar la flecha o el rayo.
    var E = window.GFEspada;
    if (E && E.esDistancia && E.esDistancia(d.arma)) {
      var largo = E.ESPADAS[d.arma].alcance * (d.poder === 'b' ? 1.3 : 1);
      E.dibujarDisparo(scene, s.x + mano[0], s.y + mano[1], dir, d.arma, largo, prof);
      if (d.poder === 'v') [-0.4, 0.4].forEach(function (a) { E.dibujarDisparo(scene, s.x + mano[0], s.y + mano[1], dir, d.arma, largo, prof, a); });
      return;
    }
    var arco = d.poder === 'v' ? Math.PI : d.poder === 'b' ? 0.55 : 1.3;
    var desde = ang - arco, hasta = ang + arco;
    if (dir === 'left') { desde = ang + arco; hasta = ang - arco; }
    var BASE = -Math.PI / 4;
    if (scene.textures.exists(k)) {
      var arma = efimero(c, scene.add.image(s.x + mano[0], s.y + mano[1], k).setOrigin(0.15, 0.85).setScale(2.2).setDepth(prof));
      arma.rotation = desde - BASE;
      scene.tweens.addCounter({ from: 0, to: 1, duration: 170, ease: 'Cubic.easeOut', onUpdate: function (tw) {
        if (!arma.scene) return;
        var t = tw.getValue();
        var estocada = d.poder === 'b' ? Math.sin(t * Math.PI) * 30 : 0;
        arma.setPosition(s.x + mano[0] + Math.cos(ang) * estocada, s.y + mano[1] + Math.sin(ang) * estocada);
        arma.rotation = estocada ? ang - BASE : desde + (hasta - desde) * t - BASE;
      }, onComplete: function () { soltarEfimero(c, arma); } });
    }
    if (scene.textures.exists('gfs_tajo')) {
      var tajo = efimero(c, scene.add.image(s.x + mano[0] + Math.cos(ang) * 18, s.y + mano[1] + Math.sin(ang) * 18, 'gfs_tajo')
        .setRotation(ang).setDepth(prof + 0.5).setAlpha(0.9));
      if (window.Phaser && Phaser.BlendModes) tajo.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: tajo, alpha: 0, scale: tajo.scale * 1.15, duration: 230, onComplete: function () { soltarEfimero(c, tajo); } });
    }
    if (d.poder === 'v') {
      var rueda = efimero(c, scene.add.circle(s.x + mano[0], s.y + mano[1], 60, 0xdfe8f0, 0.08).setStrokeStyle(2, 0xdfe8f0, 0.8).setDepth(prof + 0.5));
      scene.tweens.add({ targets: rueda, alpha: 0, scale: 1.15, duration: 260, onComplete: function () { soltarEfimero(c, rueda); } });
    }
  }

  window.GFMobsRed = {
    crear: crear,
    jugadores: jugadores,
    masCercano: masCercano,
    anunciarTajo: anunciarTajo,
    muertoLocal: muertoLocal,
    _interno: { compartido: function (s) { return s && s.__gfMobsRed; }, esHost: esHost, verTajo: verTajo,
                huerfano: huerfano, HUERFANO_MS: HUERFANO_MS }
  };
})();
