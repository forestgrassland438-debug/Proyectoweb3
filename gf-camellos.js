/* ===========================================================================
 * gf-camellos.js — LOS CAMELLOS DEL DESIERTO                     (2026-10-19)
 * ===========================================================================
 *
 * "En el mapa del desierto deben haber camellos." Dos manadas pequeñas de
 * dromedarios en 2.5D (tools/generar-camellos.py -> Game/Sprites/camello3d/):
 *
 *   · los salvajes ('camello') pasean despacio por la arena, se paran, pastan
 *     y a ratos se echan a descansar;
 *   · los de caravana ('camello_manta', con manta y alforjas) se quedan cerca
 *     de donde nacieron, casi siempre echados o quietos.
 *
 * Andan en las cuatro direcciones (de lado, de frente y de espaldas), no
 * cruzan muros ni agua (las colisiones del mapa, las mismas del jugador),
 * se apartan sin prisa si el jugador se les echa encima y van ordenados en
 * profundidad por los pies, como todo lo que está de pie.
 *
 * Es solo ambiente: no se pelean, no sueltan nada y no viajan por la red.
 *
 * Uso (Scenes/ZonasScenes.js):
 *   preload():  window.GFCamellos && window.GFCamellos.precargar(this)   (solo en el desierto)
 *   create():   window.GFCamellos && window.GFCamellos.montar(this)
 * Se desmonta solo al apagarse la escena.
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Sprites/camello3d/';
  var V = '?v=20261019a';
  var ESCALA = 2;
  var CUADRO = { w: 72, h: 66, suelo: 4 };
  var POSES = { camina: 4, quieto: 2, come: 2, echado: 2 };
  var CUATRO_LADOS = { camina: true, quieto: true, come: true };
  var RITMO = { camina: 5, quieto: 1.4, come: 2.5, echado: 0.7 };
  var ESPECIES = ['camello', 'camello_manta'];
  var VEL = 30;                    // px/s: un camello no tiene prisa
  var RADIO_PASEO = 340;           // lo más lejos que se aleja de su sitio
  var HUELLA = [44, 14];           // la caja de los pies contra las colisiones
  var CERCA_JUGADOR = 78;          // a esta distancia se aparta
  var LEJOS_CAMARA = 260;          // fuera de la vista + esto, ni se mueve

  function clave(esp, pose, n, vista) {
    return 'gfc_' + esp + '_' + pose + (vista ? '_' + vista : '') + '_' + n;
  }
  function archivo(esp, pose, n, vista) {
    return esp + '_' + pose + (vista ? '_' + vista : '') + '_' + n + '.png';
  }
  function cadaFotograma(fn) {
    ESPECIES.forEach(function (esp) {
      Object.keys(POSES).forEach(function (pose) {
        for (var n = 1; n <= POSES[pose]; n++) {
          fn(esp, pose, n, null);
          if (CUATRO_LADOS[pose]) { fn(esp, pose, n, 'abajo'); fn(esp, pose, n, 'arriba'); }
        }
      });
    });
  }

  function precargar(scene) {
    if (!scene || !scene.load) return;
    cadaFotograma(function (esp, pose, n, vista) {
      var k = clave(esp, pose, n, vista);
      if (!scene.textures.exists(k)) scene.load.image(k, RUTA + archivo(esp, pose, n, vista) + V);
    });
  }

  /* Las animaciones son del JUEGO entero (no de la escena) y una que se crea
     sin su textura nace vacía y tumba el bucle: solo se crean si están TODAS
     sus texturas, y una sola vez. */
  function animaciones(scene) {
    var ok = true;
    ESPECIES.forEach(function (esp) {
      Object.keys(POSES).forEach(function (pose) {
        [null, 'abajo', 'arriba'].forEach(function (vista) {
          if (vista && !CUATRO_LADOS[pose]) return;
          var nombre = 'gfc_' + esp + '_' + pose + (vista ? '_' + vista : '');
          if (scene.anims.exists(nombre)) return;
          var frames = [];
          for (var n = 1; n <= POSES[pose]; n++) {
            var k = clave(esp, pose, n, vista);
            if (!scene.textures.exists(k)) { ok = false; return; }
            frames.push({ key: k });
          }
          scene.anims.create({ key: nombre, frames: frames, frameRate: RITMO[pose], repeat: -1 });
        });
      });
    });
    return ok;
  }

  function texturaSombra(scene) {
    if (scene.textures.exists('gfc_sombra')) return;
    var t = scene.textures.createCanvas('gfc_sombra', 96, 28);
    var x = t.getContext();
    x.save(); x.scale(1, 28 / 96);
    var g = x.createRadialGradient(48, 48, 4, 48, 48, 48);
    g.addColorStop(0, 'rgba(40,24,10,0.55)'); g.addColorStop(0.6, 'rgba(40,24,10,0.3)'); g.addColorStop(1, 'rgba(40,24,10,0)');
    x.fillStyle = g; x.beginPath(); x.arc(48, 48, 48, 0, Math.PI * 2); x.fill(); x.restore();
    t.refresh();
  }

  /** ¿Caben los pies de un camello con la base en (x, y)? */
  function libre(scene, x, y) {
    if (!scene.map) return false;
    if (x < 60 || y < 60 || x > scene.map.widthInPixels - 60 || y > scene.map.heightInPixels - 20) return false;
    if (typeof scene._chocaConEscenario !== 'function') return true;
    return !scene._chocaConEscenario(x - HUELLA[0] / 2, y - HUELLA[1], HUELLA[0], HUELLA[1]);
  }
  /** Lejos de las salidas: que no tapen el paso a otro mapa. */
  function lejosDeSalidas(scene, x, y) {
    var s = scene._salidas || [];
    for (var i = 0; i < s.length; i++) {
      var r = s[i].rect;
      if (x > r.x - 260 && x < r.right + 260 && y > r.y - 260 && y < r.bottom + 260) return false;
    }
    return true;
  }
  function sitioLibre(scene, cx, cy, radio, intentos) {
    for (var i = 0; i < intentos; i++) {
      var a = Math.random() * Math.PI * 2, d = Math.random() * radio;
      var x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (libre(scene, x, y) && libre(scene, x, y + 6) && lejosDeSalidas(scene, x, y)) return { x: x, y: y };
    }
    return null;
  }

  function entre(a, b) { return a + Math.random() * (b - a); }

  /* ───────────────────────────────────────────────────────── un camello */
  function crear(scene, esp, x, y) {
    var spr = null, sombra = null;
    try {
    var c = {
      esp: esp, x: x, y: y, casa: { x: x, y: y },
      vista: null, flip: Math.random() < 0.5, pose: 'quieto',
      spr: spr = scene.add.sprite(x, y, clave(esp, 'quieto', 1, null)),
      sombra: sombra = scene.add.image(x, y, 'gfc_sombra'),
      hasta: 0, meta: null, atasco: 0
    };
    c.spr.setOrigin(0.5, (CUADRO.h - CUADRO.suelo) / CUADRO.h).setScale(ESCALA);
    c.sombra.setScale(1.05, 1).setAlpha(0.9);
    poner(c, 'quieto', null);
    return c;
    } catch (e) { [spr, sombra].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (error) {} }); throw e; }
  }
  function poner(c, pose, vista) {
    if (vista && !CUATRO_LADOS[pose]) vista = null;
    if (c.pose === pose && c.vista === vista && c.spr.anims.isPlaying) return;
    c.pose = pose; c.vista = vista;
    var nombre = 'gfc_' + c.esp + '_' + pose + (vista ? '_' + vista : '');
    if (c.spr.scene && c.spr.scene.anims.exists(nombre)) c.spr.play({ key: nombre, startFrame: Math.floor(Math.random() * POSES[pose]) }, true);
    c.spr.setFlipX(!vista && c.flip);
  }
  /** Qué hace ahora: los de caravana descansan mucho más. */
  function decidir(scene, c, t) {
    var r = Math.random(), caravana = c.esp === 'camello_manta';
    if (c.pose === 'echado' && Math.random() < 0.5) { poner(c, 'quieto', c.vista); c.hasta = t + entre(2500, 5000); return; }
    if (r < (caravana ? 0.45 : 0.14)) { poner(c, 'echado', null); c.hasta = t + entre(12000, 30000); return; }
    if (r < (caravana ? 0.7 : 0.36)) { poner(c, 'come', c.vista); c.hasta = t + entre(4000, 9000); return; }
    if (r < (caravana ? 0.88 : 0.5)) { poner(c, 'quieto', c.vista); c.hasta = t + entre(3000, 8000); return; }
    var m = sitioLibre(scene, c.casa.x, c.casa.y, caravana ? 120 : RADIO_PASEO, 10);
    if (m) { c.meta = m; c.hasta = t + 25000; c.atasco = 0; } else { c.hasta = t + 3000; }
  }
  function andar(scene, c, t, dt) {
    var dx = c.meta.x - c.x, dy = c.meta.y - c.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 6 || t > c.hasta) { c.meta = null; poner(c, 'quieto', c.vista); c.hasta = t + entre(1500, 4000); return; }
    var paso = Math.min(d, VEL * c.prisa * dt);
    var nx = c.x + dx / d * paso, ny = c.y + dy / d * paso;
    if (libre(scene, nx, ny)) { c.x = nx; c.y = ny; c.atasco = 0; }
    else if (libre(scene, nx, c.y)) { c.x = nx; }
    else if (libre(scene, c.x, ny)) { c.y = ny; }
    else if (++c.atasco > 20) { c.meta = null; poner(c, 'quieto', c.vista); c.hasta = t + 1500; return; }
    // La vista según hacia dónde va de verdad: de lado si va más en x.
    var vista = Math.abs(dx) >= Math.abs(dy) * 0.9 ? null : (dy > 0 ? 'abajo' : 'arriba');
    if (!vista) c.flip = dx < 0;
    poner(c, 'camina', vista);
  }
  function apartarse(scene, c, jx, jy, t) {
    var dx = c.x - jx, dy = c.y - jy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var x = c.x + dx / d * 120, y = c.y + dy / d * 120;
    if (!libre(scene, x, y)) return false;
    if (c.pose === 'echado') { poner(c, 'quieto', null); }
    c.meta = { x: x, y: y }; c.hasta = t + 6000; c.prisa = 1.6;
    return true;
  }

  /* ───────────────────────────────────────────────────────── montar */
  function montar(scene) {
    if (!scene || !scene.map || !scene.add) return;
    desmontar(scene);
    if (!animaciones(scene)) { console.warn('[camellos] faltan texturas: no se montan'); return; }
    texturaSombra(scene);
    var st = { scene: scene, camellos: [], vivo: true, prox: 0 };
    scene.__gfCamellos = st;
    var W = scene.map.widthInPixels, H = scene.map.heightInPixels;
    // Dos manadas salvajes de 3 y una caravana de 2, en sitios distintos.
    try { [['camello', 3], ['camello', 3], ['camello_manta', 2]].forEach(function (g) {
      var centro = null;
      for (var k = 0; k < 60 && !centro; k++) {
        var p = sitioLibre(scene, W * 0.15 + Math.random() * W * 0.7, H * 0.15 + Math.random() * H * 0.7, 10, 1);
        if (p && st.camellos.every(function (o) { return Math.abs(o.x - p.x) + Math.abs(o.y - p.y) > 700; })) centro = p;
      }
      if (!centro) return;
      // Juntos pero sin pisarse: cada uno a 90 px como poco de los demás.
      for (var i = 0; i < g[1]; i++) {
        for (var k2 = 0; k2 < 12; k2++) {
          var s = sitioLibre(scene, centro.x, centro.y, 200, 25);
          if (s && st.camellos.every(function (o) { return Math.abs(o.x - s.x) > 90 || Math.abs(o.y - s.y) > 40; })) {
            st.camellos.push(crear(scene, g[0], s.x, s.y));
            break;
          }
        }
      }
    }); } catch (e) { desmontar(scene); console.warn('[camellos]', e); return; }
    st.onUpdate = function (t, delta) {
      if (!st.vivo) return;
      var dt = Math.min(0.1, (delta || 16) / 1000);
      var cam = scene.cameras && scene.cameras.main, v = cam && cam.worldView;
      var p = scene.player;
      for (var i = 0; i < st.camellos.length; i++) {
        var c = st.camellos[i];
        var cerca = !v || (c.x > v.x - LEJOS_CAMARA && c.x < v.right + LEJOS_CAMARA && c.y > v.y - LEJOS_CAMARA && c.y < v.bottom + LEJOS_CAMARA);
        c.spr.setVisible(cerca); c.sombra.setVisible(cerca);
        if (!cerca) continue;
        if (p && !c.meta && t > (c.mirado || 0)) {
          c.mirado = t + 400;
          var jx = p.x, jy = p.y + 51;
          if (Math.abs(jx - c.x) < CERCA_JUGADOR && Math.abs(jy - c.y) < CERCA_JUGADOR * 0.6) apartarse(scene, c, jx, jy, t);
        }
        if (c.meta) andar(scene, c, t, dt);
        else if (t > c.hasta) { c.prisa = 1; decidir(scene, c, t); }
        c.spr.setPosition(Math.round(c.x), Math.round(c.y));
        c.spr.setDepth(c.y);
        c.sombra.setPosition(c.x, c.y - 2).setDepth(2.5);
      }
    };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    st.camellos.forEach(function (c) { c.prisa = 1; c.hasta = 0; });
    console.log('[camellos] ' + st.camellos.length + ' en el desierto');
  }

  function desmontar(scene) {
    var st = scene && scene.__gfCamellos;
    if (!st) return;
    st.vivo = false;
    try {
      if (st.onUpdate) scene.events.off('update', st.onUpdate);
      if (st.onApagar) { scene.events.off('shutdown', st.onApagar); scene.events.off('destroy', st.onApagar); }
    } catch (e) {}
    st.camellos.forEach(function (c) {
      try { if (c.spr && c.spr.scene) c.spr.destroy(); } catch (e) {}
      try { if (c.sombra && c.sombra.scene) c.sombra.destroy(); } catch (e) {}
    });
    st.camellos = [];
    scene.__gfCamellos = null;
  }

  window.GFCamellos = { precargar: precargar, montar: montar, desmontar: desmontar,
                        _interno: { libre: libre, ESPECIES: ESPECIES, POSES: POSES } };
})();
