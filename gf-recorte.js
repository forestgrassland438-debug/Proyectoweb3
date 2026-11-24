/* ===========================================================================
 * EL RECORTE DE LO LEJANO, IGUAL EN TODOS LOS MAPAS                (2026-11-24)
 *
 * QUÉ ARREGLA
 *   "En GameScene los chunks quitan casas y objetos a distancia; en los demás
 *   mapas no quita nada, y hay tirones al moverse." Medido en la selva con la
 *   barra "chunks" en 3 (radio de ~1000 px) y la cámara alejada:
 *     · DOS recortes peleaban por el mismo `visible`. El de la escena
 *       (ZonasScenes._recortarVisibles, SalvajeScene._recortarArboles: lo que
 *       cae cerca de la cámara) volvía a encender lo que la barra
 *       (gf-graphics-settings.js, por distancia) acababa de apagar: con la
 *       cámara quieta quedaban 106 árboles encendidos más allá del radio, y en
 *       un paseo de 3 s parpadearon 36 (uno apaga, el otro enciende).
 *     · La barra apagaba el árbol y NO su sombra: ~100 sombras sueltas en el
 *       suelo, sin nada encima.
 *     · El de la escena medía por el punto de apoyo, con márgenes a ojo
 *       (+420 por abajo "por si la copa es alta"). Una casa grande que asoma
 *       por arriba de la vista se apagaba con media fachada en pantalla.
 *
 * CÓMO
 *   UN solo recorte por escena, que decide con las dos reglas a la vez:
 *       se ve  ⇔  su rectángulo toca la vista (+ margen)
 *              Y  su punto de apoyo cae dentro del radio de la barra.
 *   Las dos con histéresis: se enciende al entrar en la vista + MARGEN_VER y
 *   en el radio R; se apaga al salir de la vista + MARGEN_OCULTAR o pasar de
 *   R·1,12 (como gf-graphics), así lo que está justo en el borde no parpadea.
 *   Cada cosa va con sus acompañantes (la sombra, el letrero): se apagan y se
 *   encienden JUNTOS.
 *   Una rejilla de celdas de CELDA px: en cada repaso solo se miran las celdas
 *   que tocan la vista de ahora o la del repaso anterior (lo único que puede
 *   cambiar), y solo si la cámara se movió, cambió el zoom o la barra.
 *
 *   NO RESUCITA: lo que el JUEGO tiene apagado (un tocón, una puerta) no se
 *   enciende. Al apagar, solo se marcan (__gfRecOculto) los que estaban
 *   encendidos; al encender, solo se tocan esos.
 *
 *   gf-graphics-settings.js deja en paz todo lo que lleve __gfRecortePropio:
 *   lo de aquí y lo que se apaga solo (los monstruos: GFRecorte.propio).
 *
 * CÓMO SE ENGANCHA
 *   GFRecorte.anadir(scene, spr, [sombra, ...])  → la cosa (o null)
 *   GFRecorte.quitar(cosa)
 *   GFRecorte.propio(obj)        → que gf-graphics no lo toque
 *   GFRecorte.radio()            → el radio de la barra en px (Infinity = sin tope)
 *   GFRecorte.cerca(d, seVe)     → ¿a esa distancia se dibuja? (para lo que se mueve)
 *   GFRecorte.activo(scene)      → ¿la escena tiene recorte montado?
 *   Se monta solo con la primera cosa y se desmonta al apagarse la escena.
 *   GameScene NO lo usa: tiene el suyo (enableAutoCullingForLayer) y la barra.
 * ======================================================================== */
(function () {
  'use strict';

  var PASO_MS = 100;            // como mucho un repaso cada 100 ms...
  var MOVIDO_PX = 16;           // ...y solo si la cámara se movió esto (o cambió algo)
  var MARGEN_VER = 128;         // se enciende lo que toca la vista + 128 px
  var MARGEN_OCULTAR = 320;     // y se apaga lo que se aleja más de 320 px de ella
  var HISTERESIS = 1.12;        // el radio de apagar (como gf-graphics-settings)
  var CELDA = 512;
  var HOLGURA = 8;              // px alrededor del rectángulo (el viento mece los árboles)
  var DESPL = 64, ANCHO = 1024; // la clave de la celda: (cx + 64) * 1024 + (cy + 64)

  // ── El radio de la barra "chunks" ──────────────────────────────────────────
  function radio() {
    var G = window.GFGraphics;
    if (!G || typeof G.get !== 'function') return Infinity;
    var c = Number(G.get().chunks);
    var max = Number(G.CHUNK_MAX) || 16;
    if (!(c > 0) || c >= max) return Infinity;      // al máximo: sin tope (como mostrarTodo)
    return c * (Number(G.CHUNK_PX) || 320);
  }

  /** Para lo que se mueve y decide solo (monstruos): ¿a la distancia `d` del
      jugador o de la cámara se dibuja? `seVe`: si ahora se ve (histéresis). */
  function cerca(d, seVe) {
    var R = radio();
    return R === Infinity || d <= (seVe ? R * HISTERESIS : R);
  }

  function propio(obj) {
    if (obj) obj.__gfRecortePropio = true;
    return obj;
  }

  // ── Estado por escena ──────────────────────────────────────────────────────
  function estadoDe(scene) {
    var st = scene.__gfRecorte;
    if (st && st.scene === scene) return st;
    st = {
      scene: scene, celdas: new Map(), cosas: [], nuevos: [], vuelta: 0,
      ult: null, proximo: 0, onUpdate: null, onApagar: null
    };
    scene.__gfRecorte = st;
    st.onUpdate = function (t) {
      if (!(t >= st.proximo) && !st.nuevos.length) return;
      st.proximo = (Number(t) || 0) + PASO_MS;
      try { repasar(st); } catch (e) { /* una escena a medio apagar: el próximo */ }
    };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfRecorte;
    if (!st) return;
    scene.__gfRecorte = null;
    try {
      scene.events.off('update', st.onUpdate);
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    } catch (e) {}
    st.cosas.forEach(function (c) { c.st = null; });
    st.celdas.clear();
    st.cosas.length = 0;
    st.nuevos.length = 0;
    st.scene = null;
  }

  // ── Las cosas ──────────────────────────────────────────────────────────────
  /** El rectángulo de lo que ocupa (todas sus piezas), en px de mundo. */
  function medir(objs) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i], b = null;
      try { b = typeof o.getBounds === 'function' ? o.getBounds() : null; } catch (e) { b = null; }
      if (b && [b.x, b.y, b.width, b.height].every(Number.isFinite)) {
        if (b.x < x0) x0 = b.x;
        if (b.y < y0) y0 = b.y;
        if (b.x + b.width > x1) x1 = b.x + b.width;
        if (b.y + b.height > y1) y1 = b.y + b.height;
      } else if (Number.isFinite(o.x) && Number.isFinite(o.y)) {
        var w = (Number(o.displayWidth) || 0) / 2, h = Number(o.displayHeight) || 0;
        if (o.x - w < x0) x0 = o.x - w;
        if (o.y - h < y0) y0 = o.y - h;
        if (o.x + w > x1) x1 = o.x + w;
        if (o.y > y1) y1 = o.y;
      }
    }
    if (!(x1 >= x0) || !(y1 >= y0)) return null;
    return { x0: x0 - HOLGURA, y0: y0 - HOLGURA, x1: x1 + HOLGURA, y1: y1 + HOLGURA };
  }

  function clave(cx, cy) { return (cx + DESPL) * ANCHO + (cy + DESPL); }

  function meterEnCeldas(st, c) {
    for (var cx = Math.floor(c.x0 / CELDA); cx <= Math.floor(c.x1 / CELDA); cx++) {
      for (var cy = Math.floor(c.y0 / CELDA); cy <= Math.floor(c.y1 / CELDA); cy++) {
        var k = clave(cx, cy), l = st.celdas.get(k);
        if (!l) { l = []; st.celdas.set(k, l); }
        l.push(c);
      }
    }
  }

  function sacarDeCeldas(st, c) {
    for (var cx = Math.floor(c.x0 / CELDA); cx <= Math.floor(c.x1 / CELDA); cx++) {
      for (var cy = Math.floor(c.y0 / CELDA); cy <= Math.floor(c.y1 / CELDA); cy++) {
        var k = clave(cx, cy), l = st.celdas.get(k);
        if (!l) continue;
        var i = l.indexOf(c);
        if (i >= 0) l.splice(i, 1);
        if (!l.length) st.celdas.delete(k);
      }
    }
  }

  /**
   * Da de alta `spr` y sus acompañantes. Devuelve la cosa (para quitarla) o
   * null si no se pudo (sin escena, sin cámara, sin medida). Nace como está
   * (encendida) y se decide en el próximo repaso.
   */
  function anadir(scene, spr, con) {
    if (!scene || !scene.events || !scene.cameras || !spr) return null;
    var objs = [spr].concat((con || []).filter(Boolean));
    var r = medir(objs);
    if (!r) return null;
    var st = estadoDe(scene);
    var c = { objs: objs, ax: Number(spr.x) || 0, ay: Number(spr.y) || 0,
              x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, visto: true, vuelta: 0, st: st };
    objs.forEach(propio);
    st.cosas.push(c);
    meterEnCeldas(st, c);
    st.nuevos.push(c);
    if (typeof spr.once === 'function') spr.once('destroy', function () { quitar(c); });
    return c;
  }

  function quitar(c) {
    var st = c && c.st;
    if (!st) return;
    c.st = null;
    sacarDeCeldas(st, c);
    var i = st.cosas.indexOf(c);
    if (i >= 0) st.cosas.splice(i, 1);
    i = st.nuevos.indexOf(c);
    if (i >= 0) st.nuevos.splice(i, 1);
    // Lo que apagamos nosotros vuelve como estaba (si aún existe).
    if (!c.visto) encender(c);
  }

  // ── Encender y apagar ──────────────────────────────────────────────────────
  function apagar(c) {
    for (var i = 0; i < c.objs.length; i++) {
      var o = c.objs[i];
      if (!o || !o.scene || !o.visible) continue;      // lo apagado por el juego, se queda
      o.__gfRecOculto = true;
      o.setVisible(false);
    }
  }

  function encender(c) {
    for (var i = 0; i < c.objs.length; i++) {
      var o = c.objs[i];
      if (!o || !o.__gfRecOculto) continue;           // solo lo que apagamos nosotros
      o.__gfRecOculto = false;
      if (o.scene && !o.visible) o.setVisible(true);
    }
  }

  // ── El repaso ──────────────────────────────────────────────────────────────
  function evaluar(c, q) {
    if (c.vuelta === q.vuelta) return;
    c.vuelta = q.vuelta;
    var m = c.visto ? MARGEN_OCULTAR : MARGEN_VER;
    var ve = c.x1 > q.vx - m && c.x0 < q.vr + m && c.y1 > q.vy - m && c.y0 < q.vb + m;
    if (ve && q.R !== Infinity) {
      var dx = c.ax - q.cx, dy = c.ay - q.cy, r = c.visto ? q.R * HISTERESIS : q.R;
      ve = dx * dx + dy * dy <= r * r;
    }
    if (ve === c.visto) return;
    c.visto = ve;
    if (ve) encender(c); else apagar(c);
  }

  function recorrer(st, x0, y0, x1, y1, q) {
    var c0 = Math.floor(x0 / CELDA), c1 = Math.floor(x1 / CELDA);
    var f0 = Math.floor(y0 / CELDA), f1 = Math.floor(y1 / CELDA);
    for (var cx = c0; cx <= c1; cx++) {
      for (var cy = f0; cy <= f1; cy++) {
        var l = st.celdas.get(clave(cx, cy));
        if (!l) continue;
        for (var i = 0; i < l.length; i++) evaluar(l[i], q);
      }
    }
  }

  /** Un repaso. Devuelve true si miró algo, false si no hacía falta. */
  function repasar(st, forzar) {
    var scene = st.scene;
    var cam = scene && scene.cameras && scene.cameras.main;
    var v = cam && cam.worldView;
    if (!v || !(v.width > 0) || !(v.height > 0)) return false;
    var R = radio();
    var cx = v.x + v.width / 2, cy = v.y + v.height / 2;
    var u = st.ult;
    if (!forzar && !st.nuevos.length && u && u.R === R && u.w === v.width && u.h === v.height &&
        Math.abs(cx - u.cx) < MOVIDO_PX && Math.abs(cy - u.cy) < MOVIDO_PX) return false;
    var q = { vuelta: ++st.vuelta, vx: v.x, vy: v.y, vr: v.x + v.width, vb: v.y + v.height, cx: cx, cy: cy, R: R };
    // Las recién llegadas, estén donde estén.
    var nuevos = st.nuevos.splice(0, st.nuevos.length);
    for (var i = 0; i < nuevos.length; i++) if (nuevos[i].st === st) evaluar(nuevos[i], q);
    // Lo que puede cambiar: lo que toca la zona de apagar de ahora (se enciende
    // o sigue) y lo que tocaba la del repaso anterior (lo que estaba encendido).
    recorrer(st, q.vx - MARGEN_OCULTAR, q.vy - MARGEN_OCULTAR, q.vr + MARGEN_OCULTAR, q.vb + MARGEN_OCULTAR, q);
    if (u) recorrer(st, u.vx - MARGEN_OCULTAR, u.vy - MARGEN_OCULTAR, u.vr + MARGEN_OCULTAR, u.vb + MARGEN_OCULTAR, q);
    st.ult = { cx: cx, cy: cy, w: v.width, h: v.height, R: R, vx: q.vx, vy: q.vy, vr: q.vr, vb: q.vb };
    return true;
  }

  window.GFRecorte = {
    anadir: anadir,
    quitar: quitar,
    propio: propio,
    radio: radio,
    cerca: cerca,
    activo: function (scene) { return !!(scene && scene.__gfRecorte && scene.__gfRecorte.scene === scene); },
    /** Un repaso ya, sin esperar a que se mueva la cámara. */
    repasar: function (scene) { var st = scene && scene.__gfRecorte; return st ? repasar(st, true) : false; },
    estado: function (scene) {
      var st = scene && scene.__gfRecorte;
      if (!st) return null;
      var vistas = 0;
      st.cosas.forEach(function (c) { if (c.visto) vistas++; });
      return { cosas: st.cosas.length, vistas: vistas, celdas: st.celdas.size, vuelta: st.vuelta };
    },
    desmontar: desmontar,
    MARGEN_VER: MARGEN_VER,
    MARGEN_OCULTAR: MARGEN_OCULTAR,
    HISTERESIS: HISTERESIS,
    CELDA: CELDA
  };
})();
