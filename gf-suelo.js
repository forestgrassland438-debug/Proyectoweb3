/* ===========================================================================
 * EL SUELO PINTADO DE LA ISLA, LA TIENDA Y LA MINA                 (2026-10-05)
 *
 * QUÉ HACE
 *   Lo que el pueblo hace desde hace tiempo (GameScene.createImagesFromObjectLayer1
 *   + lib/tileManager.js): el suelo NO es la capa de casillas, son trozos de
 *   imagen ya pintados (`recortadas_<escena>/`), con su pase de detalle encima.
 *   Esto se lo da a cualquier escena.
 *
 *   DOS COSAS QUE GANA LA ESCENA:
 *     · el detalle a escala de mundo (tools/detallar-escena.py) que una
 *       casilla repetida no puede tener;
 *     · el ZOOM A 0.5x. Una capa de casillas a medio zoom enseña rayas entre
 *       casilla y casilla (el borde cae a medio píxel); unos pocos trozos
 *       grandes, no. Por eso la isla y la mina estaban limitadas a 1x y 2x.
 *
 *   La capa de casillas SIGUE: se lee para colisiones, agua y demás, y se
 *   esconde solo cuando el primer trozo ya está en pantalla. Si los trozos
 *   no llegan (falta la carpeta, no hay red), la capa se queda visible y la
 *   escena se ve como antes.
 *
 * CÓMO SE GENERAN LOS TROZOS
 *   node tools/captura-mapa.mjs <dir>  con URL_CAPTURA=.../tools/captura-escena.html?escena=<x>
 *   python tools/detallar-escena.py <x> <captura> <detallada>
 *   python tools/trocear-escena.py <detallada> recortadas_<x> <version>
 *
 * CÓMO SE ENGANCHA
 *   GFSuelo.montar(scene, { carpeta: 'recortadas_lands', prefijo: 'lands',
 *                           capas: [this.backgroundLayer] })
 *   Se desmonta solo al apagarse la escena.
 * ======================================================================== */
(function () {
  'use strict';

  function claseGestor() {
    var gf = window.GrasslandForest;
    return gf && gf.TileManager ? gf.TileManager : null;
  }

  function montar(scene, opts) {
    opts = opts || {};
    var TM = claseGestor();
    if (!scene || !scene.load || !TM || !opts.carpeta) return null;
    if (scene.__gfSuelo) desmontar(scene);
    var st = { scene: scene, tm: null, capas: (opts.capas || []).filter(Boolean), escondidas: false, vivo: true };
    scene.__gfSuelo = st;
    var clave = 'gfsuelo_' + opts.carpeta;
    if (scene.cache.json.exists(clave)) scene.cache.json.remove(clave);
    scene.load.json(clave, opts.carpeta + '/mapa.json?v=' + Date.now().toString(36).slice(0, 6));
    var alCargar = function () {
      if (!st.vivo) return;
      var meta = scene.cache.json.get(clave);
      if (!meta || !Array.isArray(meta.tiles)) { console.warn('🧱 suelo: sin ' + opts.carpeta + '/mapa.json — se queda la capa de casillas'); return; }
      try {
        st.tm = new TM(scene, meta, {
          basePath: opts.carpeta,
          prefijo: opts.prefijo || '',
          supportsWebP: !!(scene.game.device.features && scene.game.device.features.webP),
          preferredLOD: 'hd',
          marginPx: opts.margenPx || 700,
          unloadPadPx: 300,
          maxConcurrentLoads: 3,
          creaPorFrame: 1,
          borraPorFrame: 1,
          depth: opts.profundidad !== undefined ? opts.profundidad : -1,
          debug: false
        });
        st.tm.init();
        /* En la lista de la escena: así el selector de calidad (gf-graphics-
           settings) le aplica el nivel de detalle elegido, y GameScene (de la
           que heredan la isla y la mina) lo libera al salir. */
        if (!Array.isArray(scene._tileManagers)) scene._tileManagers = [];
        scene._tileManagers.push(st.tm);
        var cam = scene.cameras && scene.cameras.main;
        if (cam) st.tm.updateVisible(cam);
        /* bombear(): crea los sprites de los trozos ya descargados, UNO por
           fotograma (lib/tileManager.js). En el pueblo lo llama
           GameScene.update; aquí, el evento update de la escena. Sin esto se
           descargan pero nunca se pintan. */
        st.onUpdate = function () { try { if (st.tm) st.tm.bombear(); } catch (e) {} };
        scene.events.on('update', st.onUpdate);
        st.evento = scene.time.addEvent({ delay: 250, loop: true, callback: function () {
          var c = scene.cameras && scene.cameras.main;
          if (!c || !st.tm) return;
          st.tm.updateVisible(c);
          if (!st.escondidas && st.tm.visibleCount() > 0) {
            st.escondidas = true;
            st.capas.forEach(function (l) { try { l.setVisible(false); } catch (e) {} });
            if (typeof opts.alListo === 'function') { try { opts.alListo(); } catch (e) {} }
          }
        } });
        console.log('🧱 suelo pintado: ' + opts.carpeta + ' (' + meta.tiles.length + ' trozos)');
      } catch (e) {
        console.warn('🧱 suelo: no se pudo montar ' + opts.carpeta, e);
      }
    };
    scene.load.once('filecomplete-json-' + clave, alCargar);
    scene.load.once('loaderror', function (f) { if (f && f.key === clave) console.warn('🧱 suelo: no se pudo bajar', f.src); });
    scene.load.start();
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfSuelo;
    if (!st) return;
    scene.__gfSuelo = null;
    st.vivo = false;
    try { scene.events.off('shutdown', st.onApagar); scene.events.off('destroy', st.onApagar); } catch (e) {}
    try { if (st.evento) st.evento.remove(false); } catch (e) {}
    try { if (st.onUpdate) scene.events.off('update', st.onUpdate); } catch (e) {}
    if (st.tm) {
      if (Array.isArray(scene._tileManagers)) {
        var i = scene._tileManagers.indexOf(st.tm);
        if (i >= 0) scene._tileManagers.splice(i, 1);
      }
      try { st.tm.destroy(); } catch (e) {}
    }
    st.tm = null;
    st.scene = null;
  }

  /**
   * Copia de un tileset con cada tile EXTRUIDO un píxel (margen 1, separación
   * 2): el borde de cada tile repetido por fuera. Es el arreglo de siempre
   * para las rayas entre casillas cuando el zoom no es entero. Se hace una vez
   * por textura (`<clave>_x`) y se reutiliza. Devuelve la clave o null.
   */
  function extruir(scene, clave, T) {
    var kx = clave + '_x';
    if (scene.textures.exists(kx)) return kx;
    try {
      var img = scene.textures.get(clave).getSourceImage();
      if (!img || !img.width) return null;
      var cols = Math.floor(img.width / T), filas = Math.floor(img.height / T);
      var ct = scene.textures.createCanvas(kx, cols * (T + 2), filas * (T + 2));
      var ctx = ct.getContext();
      for (var j = 0; j < filas; j++) {
        for (var i = 0; i < cols; i++) {
          var sx = i * T, sy = j * T, dx = i * (T + 2) + 1, dy = j * (T + 2) + 1;
          ctx.drawImage(img, sx, sy, T, T, dx, dy, T, T);
          ctx.drawImage(img, sx, sy, T, 1, dx, dy - 1, T, 1);
          ctx.drawImage(img, sx, sy + T - 1, T, 1, dx, dy + T, T, 1);
          ctx.drawImage(img, sx, sy, 1, T, dx - 1, dy, 1, T);
          ctx.drawImage(img, sx + T - 1, sy, 1, T, dx + T, dy, 1, T);
        }
      }
      ct.refresh();
      if (window.Phaser) ct.setFilter(Phaser.Textures.FilterMode.NEAREST);
      return kx;
    } catch (e) {
      console.warn('🧱 no se pudo extruir ' + clave, e);
      return null;
    }
  }

  window.GFSuelo = {
    montar: montar,
    desmontar: desmontar,
    extruir: extruir,
    estado: function (scene) {
      var st = scene && scene.__gfSuelo;
      return st ? { trozos: st.tm ? st.tm.visibleCount() : 0, capaEscondida: st.escondidas } : null;
    }
  };
})();
