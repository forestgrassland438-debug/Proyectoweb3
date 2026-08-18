/* =============================================================================
 * GF TIRONES — cazador de micro-parones
 * =============================================================================
 *
 * PARA QUÉ SIRVE
 * --------------
 * Un tirón que aparece "cada tanto" es de lo más difícil de localizar leyendo
 * código: cuando lo ves, ya pasó. Esto lo graba mientras juegas y luego te dice
 * CUÁNDO ocurrió, CUÁNTO duró y QUÉ estaba pasando justo en ese instante.
 *
 * CÓMO SE USA (consola del juego, con F12):
 *
 *      GFTirones.empezar()    → empieza a vigilar (avisa en consola en cuanto
 *                               detecta un fotograma largo)
 *      …juega un par de minutos, caminando por el mapa…
 *      GFTirones.informe()    → tabla con todos los tirones y su causa probable
 *      GFTirones.parar()
 *
 * QUÉ VIGILA EN CADA TIRÓN
 * ------------------------
 *   · cuánto duró el fotograma (ms) y en qué segundo de la sesión
 *   · si justo antes hubo una carga de textura (tiles del mapa)
 *   · si justo antes se recogió basura (memoria que baja de golpe)
 *   · cuántas peticiones de red había en vuelo
 *   · cuántas texturas y objetos hay vivos, por si van creciendo
 *
 * NO se activa solo ni deja nada encendido: si no lo llamas, no hace nada.
 * ========================================================================== */
(function (global) {
  'use strict';

  var UMBRAL_MS = 45;      // un fotograma normal a 60 fps son ~16,7 ms
  var vigilando = false;
  var tirones   = [];
  var rafId     = null;
  var t0        = 0;
  var ultimo    = 0;
  var memAnterior = 0;
  var redEnVuelo  = 0;
  var texturasAntes = 0;
  var ultimaTextura = { clave: null, en: 0 };

  // ── Enganches ligeros (solo mientras se vigila) ──────────────────────────
  var fetchOriginal = null;

  function juego() {
    return global.game || (global.phaserScaler && global.phaserScaler.game) || null;
  }
  function escenaViva() {
    var g = juego();
    if (!g || !g.scene || typeof g.scene.getScenes !== 'function') return null;
    var e = g.scene.getScenes(true) || [];
    return e.length ? e[e.length - 1] : null;
  }
  function memoriaMB() {
    try {
      return global.performance && global.performance.memory
        ? global.performance.memory.usedJSHeapSize / 1048576 : 0;
    } catch (e) { return 0; }
  }
  function numTexturas() {
    var esc = escenaViva();
    try { return esc ? esc.textures.getTextureKeys().length : 0; } catch (e) { return 0; }
  }
  function numObjetos() {
    var esc = escenaViva();
    try { return esc && esc.children ? esc.children.list.length : 0; } catch (e) { return 0; }
  }

  function engancharRed() {
    if (fetchOriginal) return;
    fetchOriginal = global.fetch;
    global.fetch = function () {
      redEnVuelo++;
      var fin = function () { redEnVuelo = Math.max(0, redEnVuelo - 1); };
      var p;
      try { p = fetchOriginal.apply(this, arguments); }
      catch (e) { fin(); throw e; }
      return p.then(function (r) { fin(); return r; },
                    function (e) { fin(); throw e; });
    };
  }
  function soltarRed() {
    if (!fetchOriginal) return;
    global.fetch = fetchOriginal;
    fetchOriginal = null;
  }

  function engancharTexturas() {
    var esc = escenaViva();
    if (!esc || !esc.textures || esc.textures._gfTironesEnganchado) return;
    esc.textures._gfTironesEnganchado = true;
    esc.textures.on('addtexture', function (clave) {
      ultimaTextura = { clave: clave, en: global.performance.now() };
    });
  }

  // ── Bucle de vigilancia ──────────────────────────────────────────────────
  function tick() {
    if (!vigilando) return;
    var ahora = global.performance.now();
    var dur = ahora - ultimo;

    if (dur > UMBRAL_MS) {
      var mem = memoriaMB();
      var texturas = numTexturas();
      var causa = [];

      if (ultimaTextura.clave && (ahora - ultimaTextura.en) < dur + 120) {
        causa.push('carga de textura (' + ultimaTextura.clave + ')');
      }
      if (memAnterior && mem < memAnterior - 8) {
        causa.push('recogida de basura (' + Math.round(memAnterior - mem) + ' MB liberados)');
      }
      if (redEnVuelo > 0) causa.push(redEnVuelo + ' petición(es) de red en vuelo');
      if (texturasAntes && texturas > texturasAntes) {
        causa.push('+' + (texturas - texturasAntes) + ' texturas nuevas');
      }
      if (!causa.length) causa.push('sin pista clara (probable trabajo de CPU en el bucle)');

      var t = {
        segundo: +((ahora - t0) / 1000).toFixed(1),
        ms: Math.round(dur),
        memoriaMB: Math.round(mem),
        texturas: texturas,
        objetos: numObjetos(),
        causaProbable: causa.join(' + ')
      };
      tirones.push(t);
      console.warn('[GFTirones] parón de ' + t.ms + ' ms en el segundo ' +
                   t.segundo + ' — ' + t.causaProbable);
      texturasAntes = texturas;
    }

    if (!texturasAntes) texturasAntes = numTexturas();
    memAnterior = memoriaMB();
    ultimo = ahora;
    rafId = global.requestAnimationFrame(tick);
  }

  // ── API ──────────────────────────────────────────────────────────────────
  global.GFTirones = {
    /** Empieza a vigilar. `umbral` en ms (por defecto 45). */
    empezar: function (umbral) {
      if (vigilando) { console.log('[GFTirones] ya estaba vigilando'); return; }
      if (typeof umbral === 'number' && umbral > 16) UMBRAL_MS = umbral;
      vigilando = true;
      tirones = [];
      t0 = ultimo = global.performance.now();
      memAnterior = memoriaMB();
      texturasAntes = numTexturas();
      engancharRed();
      engancharTexturas();
      rafId = global.requestAnimationFrame(tick);
      console.log('[GFTirones] vigilando. Camina un par de minutos y luego llama a GFTirones.informe(). ' +
                  'Umbral: ' + UMBRAL_MS + ' ms');
    },

    parar: function () {
      vigilando = false;
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = null;
      soltarRed();
      console.log('[GFTirones] parado. ' + tirones.length + ' parones registrados.');
    },

    /** Tabla en consola + resumen. */
    informe: function () {
      if (!tirones.length) {
        console.log('[GFTirones] ningún parón por encima de ' + UMBRAL_MS +
                    ' ms durante ' + ((global.performance.now() - t0) / 1000).toFixed(0) + ' s. ' +
                    'Si aun así lo notas, baja el umbral: GFTirones.empezar(30)');
        return [];
      }
      console.table(tirones);

      // ¿Es periódico? Se mira la separación entre parones.
      if (tirones.length >= 3) {
        var huecos = [];
        for (var i = 1; i < tirones.length; i++) {
          huecos.push(+(tirones[i].segundo - tirones[i - 1].segundo).toFixed(1));
        }
        var media = huecos.reduce(function (a, b) { return a + b; }, 0) / huecos.length;
        var desvia = Math.max.apply(null, huecos.map(function (h) { return Math.abs(h - media); }));
        console.log('[GFTirones] separación entre parones: ' + huecos.join(' s, ') + ' s');
        if (desvia < media * 0.25) {
          console.log('[GFTirones] ⏱ Son PERIÓDICOS, cada ~' + media.toFixed(0) +
                      ' s. Busca un setInterval o un this.time.addEvent con ese ritmo.');
        } else {
          console.log('[GFTirones] No son periódicos: dependen de lo que hagas ' +
                      '(cargar zona del mapa, abrir paneles…), no de un temporizador.');
        }
      }

      var causas = {};
      tirones.forEach(function (t) { causas[t.causaProbable] = (causas[t.causaProbable] || 0) + 1; });
      console.log('[GFTirones] causas más repetidas:', causas);
      return tirones;
    },

    datos: function () { return tirones.slice(); }
  };

})(window);
