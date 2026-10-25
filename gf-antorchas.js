/* ===========================================================================
 * LAS ANTORCHAS                                                    (2026-10-11)
 *
 * "Quiero que en la tienda se puedan comprar y vender antorchas que podría
 * poner en la mina, en el mapa nuevo o en GameScene, que tengan duración y que,
 * cuando se acaben, se desvanezcan poco a poco. Antorchas iguales a la de la
 * mina."
 *
 * QUÉ HACE
 *   · Con la antorcha cogida de la bolsa (arrastrándola), un clic en el suelo
 *     cerca del personaje la clava allí: /api/antorchas/poner quema 1 de la
 *     tabla `antorcha` en la cadena y la apunta para TODOS los que estén en
 *     esa zona (pueblo, mina o mapa salvaje), en cualquier canal.
 *   · El dibujo es el de la antorcha de la mina (tools/generar-antorchas.py),
 *     con la llama que se mueve, su brillo y su sombra.
 *   · ALUMBRA: en la mina abre la oscuridad (MinaScene._lucesExtras) y en el
 *     pueblo y el mapa salvaje recorta la noche (gf-ciclo-dia, _lucesNoche).
 *   · ARDE 30 MINUTOS (lo dice el servidor con `hasta`). El último minuto y
 *     medio la llama se va haciendo pequeña y la luz se apaga con ella; al
 *     final sale una voluta de humo y la antorcha se desvanece.
 *
 * CÓMO SE ENGANCHA
 *   GFAntorchas.montar(scene)  en GameScene (el pueblo), MinaScene y
 *   SalvajeScene. Las demás escenas (la isla, las casas) se descartan por su
 *   clave. Se desmonta solo al apagarse la escena.
 * ======================================================================== */
(function () {
  'use strict';

  var V = '20261011a';
  var ZONAS = { GameScene: 'game', MinaScene: 'mina', SalvajeScene: 'salvaje',
                // (2026-10-18) Los mapas nuevos: el servidor tiene la misma lista.
                CementerioScene: 'cementerio', DesiertoScene: 'desierto', TundraScene: 'tundra',
                // (2026-10-25) Los de nivel 8, 9 y 10 (el servidor: ANTORCHA_ZONAS).
                GlaciarScene: 'glaciar', CavernaScene: 'caverna', PraderaScene: 'pradera' };
  var TEX = 'gfa_antorcha';
  var ANIM = 'gfa_antorcha_fuego';
  var BRILLO = 'gfa_antorcha_brillo';
  var DESVANECE_MS = 90 * 1000;     // lo que tarda en apagarse al final
  var ADIOS_MS = 2600;              // el humo y el desvanecido del palo
  var ALCANCE = 220;                // px desde los pies a donde se clava
  var ALTO = 80, BASE_LLAMA = 24;   // el dibujo: 32 x 80, la llama en 0..23
  var RADIO_MINA = 160, RADIO_NOCHE = 175;

  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function socketDe(scene) { return scene.socket || window.globalSocket || null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ─────────────────────────────────────────────────────── LOS DIBUJOS
  /** Atlas, animación (del JUEGO: se hace una vez) y el brillo. */
  function texturas(scene) {
    if (!scene.textures.exists(BRILLO)) {
      var c = scene.textures.createCanvas(BRILLO, 96, 96), x = c.getContext();
      var g = x.createRadialGradient(48, 48, 2, 48, 48, 48);
      g.addColorStop(0, 'rgba(255,224,150,0.95)');
      g.addColorStop(0.35, 'rgba(255,170,70,0.45)');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      x.fillStyle = g; x.fillRect(0, 0, 96, 96);
      c.refresh();
    }
    var hacerAnim = function () {
      if (!scene.textures.exists(TEX)) return false;
      try { scene.textures.get(TEX).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
      if (!scene.anims.exists(ANIM)) {
        scene.anims.create({ key: ANIM, frameRate: 9, repeat: -1,
          frames: [1, 2, 3, 4, 5, 6].map(function (n) { return { key: TEX, frame: 'fuego_' + n }; }) });
      }
      return true;
    };
    if (scene.textures.exists(TEX)) return Promise.resolve(hacerAnim());
    return new Promise(function (ok) {
      var listo = false, reloj = null;
      var fin = function (vivo) {
        if (listo) return;
        listo = true;
        clearTimeout(reloj);
        scene.load.off('complete', completo);
        scene.events.off('shutdown', apagar);
        scene.events.off('destroy', apagar);
        ok(vivo ? hacerAnim() : false);
      };
      var completo = function () { fin(true); };
      var apagar = function () { fin(false); };
      scene.load.atlas(TEX, './Game/Objetos/antorcha/antorcha_suelo.png?v=' + V, './Game/Objetos/antorcha/antorcha_suelo.json?v=' + V);
      scene.load.once('complete', completo);
      scene.events.once('shutdown', apagar);
      scene.events.once('destroy', apagar);
      reloj = setTimeout(completo, 8000);
      scene.load.start();
    });
  }

  // ─────────────────────────────────────────────────────── CADA ANTORCHA
  function crear(st, d) {
    if (!d || !d.id || d.zona !== st.zona) return;
    var e = st.mapa[d.id];
    if (e && e.adios && Number(d.hasta) > Date.now() + st.desfase) { destruir(st, e); e = null; }
    if (e) { e.hasta = Number(d.hasta) || e.hasta; return; }
    if (!st.arte) { st.pendientes[d.id] = d; return; }
    var scene = st.scene, x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // El palo (la antorcha apagada) y, encima, la llama recortada: así al
    // final se apaga la LLAMA y el palo se queda hasta el humo.
    var palo = scene.add.sprite(x, y, TEX, 'apagada').setOrigin(0.5, 1).setDepth(y);
    var llama = scene.add.sprite(x, y - ALTO + BASE_LLAMA, TEX, 'fuego_1')
      .setOrigin(0.5, BASE_LLAMA / ALTO).setDepth(y + 0.01);
    llama.setCrop(0, 0, 32, BASE_LLAMA + 2);
    llama.play({ key: ANIM, startFrame: Math.floor(Math.random() * 6) });
    var brillo = scene.add.image(x, y - ALTO + 12, BRILLO).setDepth(y + 0.02).setAlpha(0.5);
    if (window.Phaser && Phaser.BlendModes) brillo.setBlendMode(Phaser.BlendModes.ADD);
    var sombra = scene.add.ellipse(x + 3, y - 2, 30, 9, 0x000000, 0.24).setDepth(2.4);
    e = st.mapa[d.id] = { id: d.id, x: x, y: y, hasta: Number(d.hasta) || 0, palo: palo, llama: llama, brillo: brillo,
                          sombra: sombra, fase: Math.random() * 6.28, k: 1, visible: true, adios: false };
    // Al encenderse, un pequeño "pop".
    palo.setScale(1, 0.6);
    scene.tweens.add({ targets: palo, scaleY: 1, duration: 240, ease: 'Back.easeOut' });
  }

  function destruir(st, e) {
    [e.palo, e.llama, e.brillo, e.sombra, e.humo].forEach(function (o) {
      try { if (o && o.scene) { st.scene.tweens.killTweensOf(o); o.destroy(); } } catch (x) {}
    });
    if (st.mapa[e.id] === e) delete st.mapa[e.id];
  }

  /** Se consumió: una voluta de humo sube y el palo se desvanece. */
  function despedir(st, e) {
    if (e.adios) return;
    e.adios = true;
    var scene = st.scene;
    try { e.llama.setVisible(false); e.brillo.setVisible(false); } catch (x) {}
    if (scene.textures.exists(TEX)) {
      e.humo = scene.add.image(e.x, e.y - ALTO + BASE_LLAMA, TEX, 'humo').setOrigin(0.5, 1).setDepth(e.y + 0.03).setAlpha(0.85);
      scene.tweens.add({ targets: e.humo, y: e.humo.y - 26, alpha: 0, scaleX: 1.4, duration: ADIOS_MS, ease: 'Sine.easeOut' });
    }
    scene.tweens.add({ targets: [e.palo, e.sombra], alpha: 0, delay: 600, duration: ADIOS_MS - 600,
      onComplete: function () { if (st.vivo) destruir(st, e); } });
  }

  // ─────────────────────────────────────────────────────── CADA FOTOGRAMA
  function actualizar(st, t) {
    var scene = st.scene, cam = scene.cameras && scene.cameras.main;
    var ahora = Date.now() + st.desfase;
    var v = cam ? cam.worldView : null;
    var mirar = t - st.ultimaVista > 250;
    if (mirar) st.ultimaVista = t;
    for (var id in st.mapa) {
      var e = st.mapa[id];
      if (e.adios) continue;
      var resta = e.hasta - ahora;
      if (resta <= 0) { despedir(st, e); continue; }
      if (mirar && v) {
        var ve = e.x > v.x - 200 && e.x < v.right + 200 && e.y > v.y - 120 && e.y < v.bottom + 260;
        if (ve !== e.visible) {
          e.visible = ve;
          [e.palo, e.llama, e.brillo, e.sombra].forEach(function (o) { o.setVisible(ve); });
        }
      }
      if (!e.visible) continue;
      // 1 mientras arde; en el último minuto y medio baja hasta 0.
      e.k = clamp(resta / DESVANECE_MS, 0, 1);
      var parpadeo = 0.9 + 0.07 * Math.sin(t / 95 + e.fase) + 0.04 * Math.sin(t / 37 + e.fase * 2);
      e.parpadeo = parpadeo;
      var k = e.k;
      e.llama.setScale(0.35 + 0.65 * k, 0.2 + 0.8 * k).setAlpha(0.35 + 0.65 * k);
      e.brillo.setAlpha(0.5 * k * parpadeo).setScale((0.75 + 0.35 * k) * parpadeo);
    }
    if (t - st.ultimoSocket > 2000) { st.ultimoSocket = t; atarSocket(st); }
    if (t - st.ultimaCarga > 60000) { st.ultimaCarga = t; cargar(st); }
  }

  // ─────────────────────────────────────────────────────── LA LUZ
  function luzMina(st, luz) {
    for (var id in st.mapa) {
      var e = st.mapa[id];
      if (e.adios || !e.visible || !(e.k > 0.02)) continue;
      luz(e.x, e.y - ALTO + 14, RADIO_MINA * (0.35 + 0.65 * e.k) * (e.parpadeo || 1), 0xffdca6, 0.95);
    }
  }
  function luzNoche(st, luz) {
    for (var id in st.mapa) {
      var e = st.mapa[id];
      if (e.adios || !e.visible || !(e.k > 0.02)) continue;
      luz(e.x, e.y - ALTO + 14, RADIO_NOCHE * (0.4 + 0.6 * e.k) * (e.parpadeo || 1), e.k);
    }
  }

  // ─────────────────────────────────────────────────────── EL SERVIDOR
  function cargar(st) {
    api('/api/antorchas?zona=' + encodeURIComponent(st.zona)).then(function (r) {
      if (!st.vivo || !r || !r.ok || !r.datos) return;
      var d = r.datos;
      if (Number.isFinite(Number(d.ahora))) st.desfase = Number(d.ahora) - Date.now();
      var vistas = {};
      (d.lista || []).forEach(function (a) { vistas[a.id] = true; crear(st, a); });
      // Las que el servidor ya no tiene (consumidas mientras no mirábamos).
      for (var id in st.mapa) if (!vistas[id] && !st.mapa[id].adios) despedir(st, st.mapa[id]);
    }).catch(function () {});
  }

  /** El socket puede cambiar (reconexión): se escucha al que haya ahora. */
  function atarSocket(st) {
    var s = socketDe(st.scene);
    if (s === st.socket) return;
    soltarSocket(st);
    if (!s || !s.on) return;
    st.socket = s;
    st.oyentes = {
      'antorcha:nueva': function (d) { if (st.vivo) crear(st, d); },
      'connect': function () { if (st.vivo) cargar(st); }
    };
    Object.keys(st.oyentes).forEach(function (ev) { s.on(ev, st.oyentes[ev]); });
  }
  function soltarSocket(st) {
    if (st.socket && st.oyentes) Object.keys(st.oyentes).forEach(function (ev) { try { st.socket.off(ev, st.oyentes[ev]); } catch (e) {} });
    st.socket = null; st.oyentes = null;
  }

  /** Lo que queda en la casilla de la factura que se quemó. */
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

  // ─────────────────────────────────────────────────────── PONERLA
  function sitioLibre(scene, x, y) {
    if (!scene.map) return false;
    if (x < 24 || y < 60 || x > scene.map.widthInPixels - 24 || y > scene.map.heightInPixels - 8) return false;
    if (typeof scene._chocaConEscenario === 'function' && scene._chocaConEscenario(x - 8, y - 8, 16, 10)) return false;
    if (window.GFAgua && window.GFAgua.claseEn && window.GFAgua.claseEn(scene, x, y) > 0) return false;
    return true;
  }

  function alClic(st, pointer) {
    var scene = st.scene, S = scene.STATE;
    if (!S || !S.selectedItem || S.selectedItem.id !== 'antorcha' || !S.selectedItem.isGhost || pointer.button !== 0) return;
    var canvas = scene.sys.canvas, ev = pointer.event;
    if (!ev || !(ev.target === canvas || canvas.contains(ev.target))) return;
    try { if ((scene.input.hitTestPointer(pointer) || []).length) return; } catch (e) {}
    var w = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (window.GFMuerte && window.GFMuerte.bloquear && window.GFMuerte.bloquear(scene, 'torch')) return;
    var p = scene.player;
    if (!p) return;
    if (Math.hypot(w.x - p.x, w.y - (p.y + 45)) > ALCANCE) { aviso(scene, 'Too far — put the torch closer to you.', 'info'); return; }
    if (!sitioLibre(scene, w.x, w.y)) { aviso(scene, 'A torch cannot go there.', 'info'); return; }
    if (st.poniendo) return;
    // Solo un intento válido devuelve la antorcha a su casilla.
    try { scene.clearSelectedItem(); } catch (e) {}
    st.poniendo = true;
    api('/api/antorchas/poner', { zona: st.zona, x: Math.round(w.x), y: Math.round(w.y) }).then(function (r) {
      var d = (r && r.datos) || {};
      if (!st.vivo) return;
      if (!r.ok || !d.ok) {
        var textos = { no_tienes: 'You have no torch.', fantasma: 'You are a ghost — revive first.',
          fuera_de_zona: 'Walk a little first, then place the torch.',
          // (2026-10-19) Un servidor sin ANTORCHA_ZONAS al día (los mapas
          // nuevos) contesta esto; sin texto propio se leía "could not be placed".
          zona_invalida: 'Torches are not enabled on this map yet (server update pending).' };
        aviso(scene, textos[d.error] || d.message || 'The torch could not be placed.', 'warning');
        return;
      }
      crear(st, d.antorcha);
      if (d.gastado) ajustarFacturaLocal(scene, d.gastado.invoiceId, Number(d.gastado.cantidadRestante));
      aviso(scene, '🔥 Torch lit — it burns for 30 minutes.', 'success');
    }).catch(function () {
      if (st.vivo) aviso(scene, 'Connection problem. Try again.', 'error');
    }).then(function () { st.poniendo = false; });
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfAntorchas) return null;
    var clave = scene.sys && scene.sys.settings && scene.sys.settings.key;
    var zona = ZONAS[clave];
    if (!zona) return null;
    var st = { scene: scene, zona: zona, mapa: {}, pendientes: {}, arte: false, vivo: true, desfase: 0,
               ultimaVista: 0, ultimoSocket: 0, ultimaCarga: 0, socket: null, oyentes: null, poniendo: false };
    scene.__gfAntorchas = st;
    texturas(scene).then(function (ok) {
      if (!st.vivo) return;
      st.arte = !!ok;
      if (!ok) { console.warn('[antorchas] falta Game/Objetos/antorcha/antorcha_suelo'); return; }
      Object.keys(st.pendientes).forEach(function (id) { crear(st, st.pendientes[id]); });
      st.pendientes = {};
    });
    st.onUpdate = function (t) { if (st.vivo) actualizar(st, t); };
    scene.events.on('update', st.onUpdate);
    st.onClic = function (pointer) { if (st.vivo) alClic(st, pointer); };
    if (scene.input) scene.input.on('pointerdown', st.onClic);
    // La luz: la oscuridad de la mina o la noche del pueblo y del mapa salvaje.
    if (zona === 'mina') {
      st.luz = function (luz) { luzMina(st, luz); };
      if (!Array.isArray(scene._lucesExtras)) scene._lucesExtras = [];
      scene._lucesExtras.push(st.luz);
    } else {
      st.luz = function (luz) { luzNoche(st, luz); };
      if (!Array.isArray(scene._lucesNoche)) scene._lucesNoche = [];
      scene._lucesNoche.push(st.luz);
    }
    atarSocket(st);
    cargar(st);
    st.ultimaCarga = 0;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfAntorchas;
    if (!st) return;
    st.vivo = false;
    scene.__gfAntorchas = null;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (scene.input) scene.input.off('pointerdown', st.onClic);
    soltarSocket(st);
    [scene._lucesExtras, scene._lucesNoche].forEach(function (lista) {
      if (!Array.isArray(lista)) return;
      var i = lista.indexOf(st.luz);
      if (i >= 0) lista.splice(i, 1);
    });
    Object.keys(st.mapa).forEach(function (id) { destruir(st, st.mapa[id]); });
    st.pendientes = {};
  }

  window.GFAntorchas = {
    montar: montar,
    desmontar: desmontar,
    _interno: { estado: function (s) { return s && s.__gfAntorchas; }, crear: crear, texturas: texturas, DESVANECE_MS: DESVANECE_MS }
  };
})();
