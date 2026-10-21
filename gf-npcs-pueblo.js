/* ===========================================================================
 * gf-npcs-pueblo.js — LOS NPC DEL PUEBLO Y DE LA TIENDA, NUEVOS    (2026-10-20)
 * ===========================================================================
 *
 * "Así como hiciste los NPC nuevos con ojos, cabello y ropa diferentes, hazlo
 * con todos los de GameScene y tiendajuego, y que se puedan mover o hablar en
 * inglés sin dañar el mecanismo de cada uno: ni el tutorial, ni el crafteo,
 * ni las pociones, ni la tienda, ni los paneles de misiones."
 *
 * CÓMO, SIN TOCAR NADA DE LO QUE YA FUNCIONA
 *   El NPC de siempre (la imagen de una pieza que pone GameScene desde el
 *   mapa, o tiendajuego a mano) SE QUEDA donde está con todos sus manejadores
 *   (el clic que abre las misiones, el crafteo, las pociones, la tienda; el
 *   tutorial que lo señala; su nombre encima). Solo se vuelve casi
 *   transparente (alfa 0,01: así sigue recibiendo los clics) y ENCIMA, en sus
 *   pies, se pone el personaje nuevo (Game/Sprites/npcs/<arte>.png, de
 *   tools/generar-npcs.py) a escala 2, como el jugador.
 *
 *   El nuevo está vivo: respira, mira a los lados, se gira hacia el jugador
 *   cuando se acerca y lo saluda con un bocadillo en inglés (con un rato de
 *   espera entre saludo y saludo). No anda: el tutorial y los paneles cuentan
 *   con que esté en su sitio.
 *
 *   Si algo falla (no carga el arte), el original vuelve a verse tal cual.
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Sprites/npcs/';
  var V = '20261021a';   // (2026-10-21) ojos por papel, frente libre y Franklin
  var ESCALA = 2;
  var CERCA = 170;             // a esta distancia se gira a mirarte
  var SALUDA = 130;            // a esta, te saluda
  var ESPERA_SALUDO = 25000;

  // GameScene: la propiedad de la escena (createImagesFromObjectLayer) → quién es.
  var DEL_PUEBLO = {
    sprite_npc1: { arte: 'joe', frases: ['Howdy, friend! I always have chores for strong hands.', 'Crops will not water themselves!',
                                          'Bring me what I ask and I will pay you well.'] },
    sprite_npc2: { arte: 'jack', frases: ['Wood, stone, iron... give me materials and I will build you tools.',
                                           'A good pickaxe is worth its weight in gold.'] },
    sprite_npc3: { arte: 'colin', frases: ['Potions! Fresh potions! Mind the purple one.', 'A pinch of herbs, a drop of magic...'] },
    sprite_npc4: { arte: 'rurik', frases: ['Halt! ...Oh, it is you. Stay safe out there.',
                                            'The wild lands to the west are dangerous. Train before you go.'] },
    sprite_npc5: { arte: 'digby', frases: ['The stars whisper of seeds and harvests...', 'Bring me seeds, young one, and you shall be rewarded.'] }
  };
  // tiendajuego: las imágenes con esta textura. (2026-10-21) "En tiendajuego los
  // dos NPC son iguales": las dos usan la misma imagen, así que cada uno se
  // reconoce por su sitio (tiendajuego: boton3 en 685,1435 y boton4 en 775,650).
  var DE_LA_TIENDA = { NPCtiendas: [
    { x: 685, y: 1435, arte: 'johnny', frases: ['Welcome to my shop! Best prices in Grassland Forest.',
                                               'Buy low, sell high: that is my motto!', 'Take your time, browse around.'] },
    { x: 775, y: 650, arte: 'franklin', frases: ['I keep the storeroom in order. Johnny does the talking.',
                                                'Looking for something special? Ask Johnny at the counter.',
                                                'Fresh stock arrives every morning.'] }
  ] };
  function deLaTienda(o) {
    var lista = Object.prototype.hasOwnProperty.call(DE_LA_TIENDA, o.texture.key) ? DE_LA_TIENDA[o.texture.key] : null;
    if (!lista) return null;
    var mejor = null, d0 = Infinity;
    lista.forEach(function (c) { var d = Math.hypot(c.x - o.x, c.y - o.y); if (d < d0) { d0 = d; mejor = c; } });
    return mejor;
  }

  function cargar(st, artes, listo) {
    var scene = st.scene;
    var faltan = artes.filter(function (a) { return !scene.textures.exists('gfn_' + a); });
    if (!faltan.length) { listo(true); return; }
    var hecho = false, reloj = null;
    var completo = function () { fin(faltan.every(function (a) { return scene.textures.exists('gfn_' + a); })); };
    var fin = function (ok) {
      if (hecho) return; hecho = true; clearTimeout(reloj); scene.load.off('complete', completo);
      st.cancelarCarga = null;
      if (st.vivo && scene.__gfNpcsPueblo === st) listo(ok);
    };
    st.cancelarCarga = function () { fin(false); };
    faltan.forEach(function (a) { scene.load.atlas('gfn_' + a, RUTA + a + '.png?v=' + V, RUTA + a + '.json?v=' + V); });
    scene.load.once('complete', completo);
    reloj = setTimeout(completo, 15000);
    scene.load.start();
  }
  function propio(st, o) { st.objetos.push(o); if (o.once) o.once('destroy', function () { var i = st.objetos.indexOf(o); if (i >= 0) st.objetos.splice(i, 1); }); return o; }

  function texturaSombra(scene) {
    if (scene.textures.exists('gfnp_sombra')) return;
    var t = scene.textures.createCanvas('gfnp_sombra', 48, 16), x = t.getContext();
    x.save(); x.scale(1, 16 / 48);
    var g = x.createRadialGradient(24, 24, 1, 24, 24, 24);
    g.addColorStop(0, 'rgba(10,14,10,0.42)'); g.addColorStop(0.7, 'rgba(10,14,10,0.2)'); g.addColorStop(1, 'rgba(10,14,10,0)');
    x.fillStyle = g; x.beginPath(); x.arc(24, 24, 24, 0, Math.PI * 2); x.fill(); x.restore();
    t.refresh();
  }

  /** Pies del original (con su origen y su tamaño en pantalla). */
  function piesDe(o) {
    return { x: o.x + (0.5 - o.originX) * o.displayWidth, y: o.y + (1 - o.originY) * o.displayHeight };
  }

  function vestir(st, original, cfg) {
    var scene = st.scene, tex = 'gfn_' + cfg.arte;
    if (!original || !original.scene || !scene.textures.exists(tex) || original.__gfVestido) return;
    var p = piesDe(original);
    var spr = propio(st, scene.add.image(p.x, p.y, tex, 'abajo_1')).setOrigin(0.5, 1).setScale(ESCALA).setDepth(original.depth);
    var sombra = propio(st, scene.add.image(p.x, p.y - 2, 'gfnp_sombra')).setDepth(2.5).setScale(1.1);
    var n = { original: original, spr: spr, sombra: sombra, cfg: cfg, x: p.x, y: p.y, mira: 'abajo',
              miraHasta: 0, saludoEn: 0, bocadillo: null, fase: Math.random() * 6 };
    st.npcs.push(n);
    original.__gfVestido = true;
    original.__gfAlfa = original.alpha;
    original.setAlpha(0.01);                       // sigue recibiendo clics
    // El resaltado de siempre (pointerover tiñe el original) pasa al nuevo.
    var sobre = function () { try { spr.setTint(0x88bbff); } catch (e) {} };
    var fuera = function () { try { spr.clearTint(); } catch (e) {} };
    if (original.input) { original.on('pointerover', sobre); original.on('pointerout', fuera); }
    n.sobre = sobre; n.fuera = fuera;
  }

  function mirar(n, dir) {
    if (n.mira === dir) return;
    n.mira = dir;
    try { n.spr.setFrame(dir + '_1'); } catch (e) {}
  }

  function decir(st, n, texto) {
    var scene = st.scene;
    if (n.reloj) { n.reloj.remove(false); n.reloj = null; }
    if (n.bocadillo) { try { n.bocadillo.destroy(); } catch (e) {} }
    var t = propio(st, scene.add.text(0, 0, texto, {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#2a2016', resolution: 3, wordWrap: { width: 210 }, align: 'center'
    })).setOrigin(0.5, 1);
    var w = t.width + 18, h = t.height + 12, g = propio(st, scene.add.graphics());
    g.fillStyle(0xfffaf0, 0.96); g.lineStyle(2, 0x5a4630, 1);
    g.fillRoundedRect(-w / 2, -h - 6, w, h, 8); g.strokeRoundedRect(-w / 2, -h - 6, w, h, 8);
    g.fillTriangle(-6, -7, 6, -7, 0, 2);
    t.setPosition(0, -12);
    n.bocadillo = propio(st, scene.add.container(n.x, n.y - 132, [g, t])).setDepth(9400);
    var b = n.bocadillo;
    n.reloj = scene.time.delayedCall(4200, function () { n.reloj = null; if (st.vivo && n.bocadillo === b && b && b.scene) scene.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: function () { if (b.scene) b.destroy(); } }); });
  }

  function tic(st, t) {
    var scene = st.scene, p = scene.player;
    var px = p ? p.x : -1e9, py = p ? p.y + 45 : -1e9;
    for (var i = 0; i < st.npcs.length; i++) {
      var n = st.npcs[i];
      if (!n.original.scene) continue;
      // Si el original se movió o se escondió (el tutorial, una cinemática), le sigue.
      var pie = piesDe(n.original);
      if (Math.abs(pie.x - n.x) > 0.5 || Math.abs(pie.y - n.y) > 0.5) {
        n.x = pie.x; n.y = pie.y;
        n.spr.setPosition(n.x, n.y); n.sombra.setPosition(n.x, n.y - 2);
      }
      var visible = n.original.visible;
      n.spr.setVisible(visible); n.sombra.setVisible(visible);
      n.spr.setDepth(n.original.depth);
      // Respira (un poquito más alto y más bajo).
      n.spr.setScale(ESCALA, ESCALA * (1 + 0.012 * Math.sin(t / 700 + n.fase)));
      var dx = px - n.x, dy = py - n.y, d = Math.hypot(dx, dy);
      if (d < CERCA) {
        mirar(n, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'derecha' : 'izquierda') : (dy > 0 ? 'abajo' : 'arriba'));
        n.miraHasta = t + 2500;
        if (d < SALUDA && t > n.saludoEn && visible) {
          n.saludoEn = t + ESPERA_SALUDO;
          var fr = n.cfg.frases;
          n.frase = n.frase === undefined ? Math.floor(Math.random() * fr.length) : (n.frase + 1) % fr.length;
          decir(st, n, fr[n.frase]);
        }
      } else if (t > n.miraHasta) {
        // Lejos: mira de frente y, de vez en cuando, a un lado.
        var r = Math.random();
        mirar(n, r < 0.6 ? 'abajo' : (r < 0.8 ? 'izquierda' : 'derecha'));
        n.miraHasta = t + 3000 + Math.random() * 4000;
      }
      if (n.bocadillo && n.bocadillo.scene) n.bocadillo.setPosition(n.x, n.y - 132);
    }
  }

  function desmontar(scene) {
    var st = scene && scene.__gfNpcsPueblo;
    if (!st) return;
    st.vivo = false;
    try { if (st.onUpdate) scene.events.off('update', st.onUpdate); } catch (e) {}
    try { scene.events.off('shutdown', st.onApagar); scene.events.off('destroy', st.onApagar); } catch (e) {}
    if (st.cancelarCarga) st.cancelarCarga();
    if (st.reintento) { st.reintento.remove(false); st.reintento = null; }
    st.npcs.forEach(function (n) {
      if (n.reloj) { n.reloj.remove(false); n.reloj = null; }
      try { if (n.original && n.original.scene) { n.original.setAlpha(n.original.__gfAlfa == null ? 1 : n.original.__gfAlfa); n.original.__gfVestido = false;
                                                  n.original.off('pointerover', n.sobre); n.original.off('pointerout', n.fuera); } } catch (e) {}
      [n.spr, n.sombra, n.bocadillo].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    });
    st.objetos.slice().forEach(function (o) { try { if (o && o.scene) { scene.tweens.killTweensOf(o); o.destroy(); } } catch (e) {} });
    st.objetos = [];
    st.npcs = [];
    scene.__gfNpcsPueblo = null;
  }

  /** GameScene y tiendajuego, al final de su create() (o un poco después). */
  function montar(scene) {
    if (!scene || !scene.add || !scene.events) return;
    desmontar(scene);
    var st = { scene: scene, vivo: true, npcs: [], objetos: [] };
    scene.__gfNpcsPueblo = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar); scene.events.once('destroy', st.onApagar);
    try { texturaSombra(scene); } catch (e) { desmontar(scene); console.warn('[npcs-pueblo]', e); return; }
    var clave = scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    var buscar = function () {
      var lista = [];
      if (clave === 'tiendajuego') {
        scene.children.list.forEach(function (o) {
          var c = o && o.texture && o.type === 'Image' ? deLaTienda(o) : null;
          if (c) lista.push({ o: o, c: c });
        });
      } else {
        Object.keys(DEL_PUEBLO).forEach(function (k) { if (scene[k] && scene[k].scene) lista.push({ o: scene[k], c: DEL_PUEBLO[k] }); });
      }
      return lista;
    };
    var intentos = 0;
    var probar = function () {
      if (!st.vivo || scene.__gfNpcsPueblo !== st) return;
      var lista = buscar();
      if (!lista.length && intentos++ < 20) { st.reintento = scene.time.delayedCall(500, function () { st.reintento = null; probar(); }); return; }
      var artes = lista.map(function (x) { return x.c.arte; }).filter(function (a, i, l) { return l.indexOf(a) === i; });
      cargar(st, artes, function () {
        if (!st.vivo || scene.__gfNpcsPueblo !== st) return;
        lista.forEach(function (x) { if (!st.vivo) return; try { vestir(st, x.o, x.c); } catch (e) { desmontar(scene); console.warn('[npcs-pueblo]', e); } });
      });
    };
    try { probar(); } catch (e) { desmontar(scene); console.warn('[npcs-pueblo]', e); return; }
    if (!st.vivo) return;
    st.onUpdate = function (t) { if (st.vivo) { try { tic(st, t); } catch (e) {} } };
    scene.events.on('update', st.onUpdate);
  }

  window.GFNpcsPueblo = { montar: montar, desmontar: desmontar };
})();
