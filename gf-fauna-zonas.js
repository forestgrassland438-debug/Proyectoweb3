/* ===========================================================================
 * gf-fauna-zonas.js — LOS ANIMALES DE LOS MAPAS DE NIVEL 8, 9 Y 10 (2026-10-25)
 * ===========================================================================
 *
 * "Haz animales nuevos según esos 3 mapas." En 2.5D (tools/generar-fauna-
 * zonas.py -> Game/Sprites/fauna3d/<especie>.png + .json):
 *
 *   · GLACIAR   pingüinos (en grupos, junto al agua), zorros árticos y renos;
 *   · CAVERNA   salamandras con su raya que brilla, escarabajos de roca y
 *               cangrejos en la orilla del lago;
 *   · PRADERA   ciervos, ovejas y conejos.
 *
 * Como los camellos del desierto (gf-camellos.js): andan en las cuatro
 * direcciones (de lado, de frente y de espaldas), se paran, comen, no cruzan
 * muros ni agua (las colisiones del mapa, las del jugador) y se apartan si
 * el jugador se les echa encima. Van ordenados en profundidad por los pies.
 * Es ambiente: no pelean, no sueltan nada y no viajan por la red.
 *
 * Uso (Scenes/ZonasScenes.js):
 *   preload():  window.GFFaunaZonas && window.GFFaunaZonas.precargar(this)
 *   create():   window.GFFaunaZonas && window.GFFaunaZonas.montar(this)
 * Se desmonta solo al apagarse la escena.
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Sprites/fauna3d/';
  var V = '?v=20261025a';
  var ESCALA = 2;
  var LEJOS_CAMARA = 260;           // fuera de la vista + esto, ni se mueve
  var POSES = { camina: 4, quieto: 2, come: 2 };
  var RITMO = { camina: 7, quieto: 1.6, come: 3 };

  /* [especie, grupos, cuántos por grupo, junto al agua]. */
  var POR_ESCENA = {
    GlaciarScene: [['pinguino', 3, 5, true], ['zorro_artico', 3, 1, false], ['reno', 2, 3, false]],
    CavernaScene: [['salamandra', 4, 2, false], ['escarabajo', 4, 2, false], ['cangrejo', 2, 3, true]],
    PraderaScene: [['ciervo', 3, 3, false], ['oveja', 3, 4, false], ['conejo', 4, 2, false]]
  };
  /* Cómo es cada uno: velocidad (px/s), lo lejos que pasea de su sitio, la
     huella de los pies contra las colisiones, a qué distancia se aparta del
     jugador y con qué prisa, y cuánto le gusta comer o quedarse quieto. */
  var DATOS = {
    pinguino:     { vel: 28, radio: 200, huella: [16, 8], huye: 80, prisa: 1.6, come: 0.25, quieto: 0.35 },
    zorro_artico: { vel: 60, radio: 420, huella: [28, 10], huye: 150, prisa: 2.6, come: 0.2, quieto: 0.25 },
    reno:         { vel: 34, radio: 360, huella: [34, 12], huye: 110, prisa: 2.0, come: 0.4, quieto: 0.25 },
    salamandra:   { vel: 26, radio: 220, huella: [28, 8], huye: 90, prisa: 2.2, come: 0.15, quieto: 0.45 },
    escarabajo:   { vel: 18, radio: 160, huella: [16, 8], huye: 60, prisa: 1.8, come: 0.25, quieto: 0.4 },
    cangrejo:     { vel: 30, radio: 160, huella: [22, 8], huye: 80, prisa: 2.2, come: 0.3, quieto: 0.35 },
    ciervo:       { vel: 40, radio: 400, huella: [32, 12], huye: 160, prisa: 2.6, come: 0.45, quieto: 0.2 },
    oveja:        { vel: 24, radio: 260, huella: [26, 10], huye: 70, prisa: 1.6, come: 0.5, quieto: 0.25 },
    conejo:       { vel: 46, radio: 240, huella: [16, 8], huye: 120, prisa: 2.8, come: 0.35, quieto: 0.25 }
  };

  function claveTex(esp) { return 'gff_' + esp; }
  function claveAnim(esp, pose, vista) { return 'gff_' + esp + '_' + pose + (vista ? '_' + vista : ''); }
  function lista(scene) {
    var k = scene && scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    return Object.prototype.hasOwnProperty.call(POR_ESCENA, k) ? POR_ESCENA[k] : [];
  }

  function precargar(scene) {
    if (!scene || !scene.load) return;
    lista(scene).forEach(function (g) {
      var k = claveTex(g[0]);
      if (!scene.textures.exists(k)) scene.load.atlas(k, RUTA + g[0] + '.png' + V, RUTA + g[0] + '.json' + V);
    });
  }

  /* Las animaciones son del JUEGO entero y una que nace sin su textura (o sin
     fotogramas) tumba el bucle: solo se crean si están, y una sola vez. */
  function animaciones(scene, esp) {
    var k = claveTex(esp);
    if (!scene.textures.exists(k)) return false;
    var tex = scene.textures.get(k);
    try { tex.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
    Object.keys(POSES).forEach(function (pose) {
      [null, 'abajo', 'arriba'].forEach(function (vista) {
        var nombre = claveAnim(esp, pose, vista);
        if (scene.anims.exists(nombre)) return;
        var frames = [];
        for (var n = 1; n <= POSES[pose]; n++) {
          var f = pose + (vista ? '_' + vista : '') + '_' + n;
          if (tex.has(f)) frames.push({ key: k, frame: f });
        }
        if (frames.length) scene.anims.create({ key: nombre, frames: frames, frameRate: RITMO[pose], repeat: -1 });
      });
    });
    return scene.anims.exists(claveAnim(esp, 'quieto', null));
  }

  function texturaSombra(scene) {
    if (scene.textures.exists('gff_sombra')) return;
    var t = scene.textures.createCanvas('gff_sombra', 64, 20);
    var x = t.getContext();
    x.save(); x.scale(1, 20 / 64);
    var g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(14,16,20,0.5)'); g.addColorStop(0.65, 'rgba(14,16,20,0.24)'); g.addColorStop(1, 'rgba(14,16,20,0)');
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 32, 0, Math.PI * 2); x.fill(); x.restore();
    t.refresh();
  }

  /** ¿Caben sus pies con la base en (x, y)? */
  function libre(scene, d, x, y) {
    if (!scene.map) return false;
    if (x < 60 || y < 60 || x > scene.map.widthInPixels - 60 || y > scene.map.heightInPixels - 20) return false;
    if (typeof scene._chocaConEscenario !== 'function') return true;
    return !scene._chocaConEscenario(x - d.huella[0] / 2, y - d.huella[1], d.huella[0], d.huella[1]);
  }
  function lejosDeSalidas(scene, x, y) {
    var s = scene._salidas || [];
    for (var i = 0; i < s.length; i++) {
      var r = s[i].rect;
      if (x > r.x - 260 && x < r.right + 260 && y > r.y - 260 && y < r.bottom + 260) return false;
    }
    return true;
  }
  function sitioLibre(scene, d, cx, cy, radio, intentos) {
    for (var i = 0; i < intentos; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.random() * radio;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
      if (libre(scene, d, x, y) && lejosDeSalidas(scene, x, y)) return { x: x, y: y };
    }
    return null;
  }
  /** Un sitio de orilla (para los pingüinos y los cangrejos): una casilla de
      orilla del agua animada (gf-agua) y, cerca, suelo libre. */
  function sitioJuntoAlAgua(scene, d) {
    var ga = scene.__gfAgua;
    if (!ga || !ga.clase || !ga.W) return null;
    if(!ga._faunaOrillas || ga._faunaOrillas.clase!==ga.clase){
      var indices=[];for(var j=0;j<ga.clase.length;j++)if(ga.clase[j]===1)indices.push(j);
      ga._faunaOrillas={clase:ga.clase,indices:indices};
    }
    var orillas=ga._faunaOrillas.indices;if(!orillas.length)return null;
    for (var k = 0; k < Math.min(20,orillas.length); k++) {
      var i = orillas[Math.floor(Math.random() * orillas.length)];
      var x = (i % ga.W) * ga.T + ga.T / 2, y = Math.floor(i / ga.W) * ga.T + ga.T / 2;
      var s = sitioLibre(scene, d, x, y + 30, 90, 12);
      if (s) return s;
    }
    return null;
  }
  function entre(a, b) { return a + Math.random() * (b - a); }

  // ─────────────────────────────────────────────────────── un animal
  function crear(scene, esp, x, y) {
    var spr = null, sombra = null;
    try {
      var d = DATOS[esp];
      spr = scene.add.sprite(x, y, claveTex(esp), 'quieto_1');
      spr.setOriginFromFrame().setScale(ESCALA);
      sombra = scene.add.image(x, y, 'gff_sombra').setAlpha(0.85);
      var ancho = (spr.frame && spr.frame.width) || 32;
      sombra.setScale(Math.max(0.35, Math.min(1.6, ancho / 46)), Math.max(0.35, Math.min(1.4, ancho / 52)));
      var a = { esp: esp, d: d, x: x, y: y, casa: { x: x, y: y }, vista: null, flip: Math.random() < 0.5,
                pose: null, spr: spr, sombra: sombra, hasta: 0, meta: null, atasco: 0, prisa: 1, mirado: 0 };
      poner(a, 'quieto', null);
      return a;
    } catch (e) { [spr, sombra].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e2) {} }); throw e; }
  }
  function poner(a, pose, vista) {
    if (a.pose === pose && a.vista === vista && a.spr.anims.isPlaying) return;
    a.pose = pose; a.vista = vista;
    var nombre = claveAnim(a.esp, pose, vista);
    if (!a.spr.scene || !a.spr.scene.anims.exists(nombre)) nombre = claveAnim(a.esp, pose, null);
    if (a.spr.scene && a.spr.scene.anims.exists(nombre)) a.spr.play({ key: nombre, startFrame: Math.floor(Math.random() * POSES[pose]) }, true);
    a.spr.setFlipX(!vista && a.flip);
  }
  function decidir(scene, a, t) {
    var r = Math.random(), d = a.d;
    if (r < d.come) { poner(a, 'come', a.vista); a.hasta = t + entre(3000, 7000); return; }
    if (r < d.come + d.quieto) { poner(a, 'quieto', a.vista); a.hasta = t + entre(2500, 6000); return; }
    var m = sitioLibre(scene, d, a.casa.x, a.casa.y, d.radio, 10);
    if (m) { a.meta = m; a.hasta = t + 20000; a.atasco = 0; } else a.hasta = t + 2500;
  }
  function andar(scene, a, t, dt) {
    var dx = a.meta.x - a.x, dy = a.meta.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 6 || t > a.hasta) { a.meta = null; a.prisa = 1; poner(a, 'quieto', a.vista); a.hasta = t + entre(1200, 3500); return; }
    var paso = Math.min(dist, a.d.vel * a.prisa * dt);
    var nx = a.x + dx / dist * paso, ny = a.y + dy / dist * paso;
    if (libre(scene, a.d, nx, ny)) { a.x = nx; a.y = ny; a.atasco = 0; }
    else if (libre(scene, a.d, nx, a.y)) a.x = nx;
    else if (libre(scene, a.d, a.x, ny)) a.y = ny;
    else if (++a.atasco > 20) { a.meta = null; a.prisa = 1; poner(a, 'quieto', a.vista); a.hasta = t + 1500; return; }
    var vista = Math.abs(dx) >= Math.abs(dy) * 0.9 ? null : (dy > 0 ? 'abajo' : 'arriba');
    if (!vista) a.flip = dx < 0;
    poner(a, 'camina', vista);
  }
  function apartarse(scene, a, jx, jy, t) {
    var dx = a.x - jx, dy = a.y - jy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var lejos = a.d.huye + 80;
    var x = a.x + dx / dist * lejos, y = a.y + dy / dist * lejos;
    if (!libre(scene, a.d, x, y)) return false;
    a.meta = { x: x, y: y }; a.hasta = t + 5000; a.prisa = a.d.prisa;
    return true;
  }

  // ─────────────────────────────────────────────────────── montar
  function montar(scene) {
    if (!scene || !scene.map || !scene.add) return null;
    desmontar(scene);
    var grupos = lista(scene);
    if (!grupos.length) return null;
    texturaSombra(scene);
    var st = { scene: scene, animales: [], vivo: true };
    scene.__gfFaunaZonas = st;
    var W = scene.map.widthInPixels, H = scene.map.heightInPixels;
    try {
      grupos.forEach(function (g) {
        var esp = g[0], d = DATOS[esp];
        if (!d || !animaciones(scene, esp)) { console.warn('[fauna-zonas] faltan dibujos de ' + esp); return; }
        for (var k = 0; k < g[1]; k++) {
          var centro = null;
          for (var n = 0; n < 60 && !centro; n++) {
            var p = g[3] ? sitioJuntoAlAgua(scene, d) : sitioLibre(scene, d, W * 0.08 + Math.random() * W * 0.84, H * 0.08 + Math.random() * H * 0.84, 10, 1);
            if (p && st.animales.every(function (o) { return Math.abs(o.x - p.x) + Math.abs(o.y - p.y) > 420; })) centro = p;
          }
          if (!centro) continue;
          for (var i = 0; i < g[2]; i++) {
            var s = i === 0 ? centro : sitioLibre(scene, d, centro.x, centro.y, 120, 25);
            if (s && st.animales.every(function (o) { return Math.abs(o.x - s.x) > 40 || Math.abs(o.y - s.y) > 24; })) {
              st.animales.push(crear(scene, esp, s.x, s.y));
            }
          }
        }
      });
    } catch (e) { desmontar(scene); console.warn('[fauna-zonas]', e); return null; }
    st.onUpdate = function (t, delta) {
      if (!st.vivo) return;
      var dt = Math.min(0.1, (delta || 16) / 1000);
      var cam = scene.cameras && scene.cameras.main, v = cam && cam.worldView;
      var p = scene.player;
      for (var i = 0; i < st.animales.length; i++) {
        var a = st.animales[i];
        var cerca = !v || (a.x > v.x - LEJOS_CAMARA && a.x < v.right + LEJOS_CAMARA && a.y > v.y - LEJOS_CAMARA && a.y < v.bottom + LEJOS_CAMARA);
        if (cerca !== a.spr.visible) { a.spr.setVisible(cerca); a.sombra.setVisible(cerca); }
        if (!cerca) continue;
        if (p && t > a.mirado) {
          a.mirado = t + 300;
          var jx = p.x, jy = p.y + 51;
          if (Math.abs(jx - a.x) < a.d.huye && Math.abs(jy - a.y) < a.d.huye * 0.7 && a.prisa === 1) apartarse(scene, a, jx, jy, t);
        }
        if (a.meta) andar(scene, a, t, dt);
        else if (t > a.hasta) decidir(scene, a, t);
        a.spr.setPosition(Math.round(a.x), Math.round(a.y)).setDepth(a.y);
        a.sombra.setPosition(a.x, a.y - 1).setDepth(2.5);
      }
    };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    console.log('[fauna-zonas] ' + st.animales.length + ' animales');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfFaunaZonas;
    if (!st) return;
    st.vivo = false;
    try {
      if (st.onUpdate) scene.events.off('update', st.onUpdate);
      if (st.onApagar) { scene.events.off('shutdown', st.onApagar); scene.events.off('destroy', st.onApagar); }
    } catch (e) {}
    st.animales.forEach(function (a) {
      try { if (a.spr && a.spr.scene) a.spr.destroy(); } catch (e) {}
      try { if (a.sombra && a.sombra.scene) a.sombra.destroy(); } catch (e) {}
    });
    st.animales = [];
    scene.__gfFaunaZonas = null;
  }

  window.GFFaunaZonas = { precargar: precargar, montar: montar, desmontar: desmontar,
                          _interno: { POR_ESCENA: POR_ESCENA, DATOS: DATOS, libre: libre,
                                      estado: function (s) { return s && s.__gfFaunaZonas; } } };
})();
