/* ===========================================================================
 * gf-dibujo-seguro.js — UN SPRITE CON LA TEXTURA BORRADA NO CORTA EL DIBUJO
 *                                                                (2026-11-19)
 * ===========================================================================
 *
 * En el centro de control:
 *   "[GF] Error en el bucle del juego (el juego sigue): TypeError: Cannot read
 *    properties of null (reading 'glTexture') at batchSprite …"
 * y de los jugadores: "a veces los enemigos desaparecen todos de repente y no se
 * ven ni los monstruos".
 *
 * Son el mismo fallo. `textures.remove(clave)` DESTRUYE los Frame de esa textura
 * (frame.source = null). Si algún sprite todavía la usa, al dibujarlo revienta en
 * batchSprite. app.js atrapa el error para que el juego no se congele, pero el
 * dibujo de ESE fotograma se corta ahí: todo lo que va DETRÁS en la lista de
 * dibujo (los monstruos, los enemigos, sus nombres) deja de verse de golpe, todo
 * a la vez, y así fotograma tras fotograma mientras el sprite roto siga vivo.
 *
 * Aquí se envuelve el renderWebGL / renderCanvas de los objetos que dibujan un
 * Frame: si su fuente ya no existe, ese objeto se salta (y se avisa UNA vez con
 * el nombre de la textura, para encontrar quién la borró) y el resto se dibuja.
 *
 * Se carga justo después de phaser.min.js y antes de que se cree el juego.
 * ======================================================================== */
(function () {
  'use strict';
  var P = window.Phaser;
  if (!P || !P.GameObjects || window.GFDibujoSeguro) return;

  var avisadas = Object.create(null);
  var saltados = 0;

  function roto(obj) {
    var f = obj && obj.frame;
    return !!(f && !f.source);
  }

  function avisar(obj) {
    saltados++;
    var clave = (obj && obj.texture && obj.texture.key) || '?';
    if (avisadas[clave]) return;
    avisadas[clave] = true;
    try {
      console.warn('[GF] Se iba a dibujar un ' + ((obj && obj.type) || 'objeto') + ' con la textura "' + clave +
                   '" ya borrada: se salta (el resto del fotograma se dibuja).');
    } catch (e) {}
  }

  function envolver(nombre) {
    var C = P.GameObjects[nombre];
    var proto = C && C.prototype;
    if (!proto) return false;
    var hecho = false;
    ['renderWebGL', 'renderCanvas'].forEach(function (m) {
      var original = proto[m];
      if (typeof original !== 'function' || original.__gfSeguro) return;
      var seguro = function (renderer, src) {
        // Phaser llama child.renderWebGL(renderer, child, camera, parentMatrix):
        // el objeto que se dibuja es `src` (o `this`).
        var obj = src || this;
        if (roto(obj)) { avisar(obj); return; }
        return original.apply(this, arguments);
      };
      seguro.__gfSeguro = true;
      proto[m] = seguro;
      hecho = true;
    });
    return hecho;
  }

  var envueltos = ['Image', 'Sprite', 'TileSprite', 'NineSlice', 'Rope', 'Text', 'BitmapText'].filter(envolver);

  /* Y EL FRAME DESTRUIDO NO REVIENTA A QUIEN LO MIRE. Tras textures.remove(),
     frame.data y frame.source son null, y no solo lo lee el dibujo: cualquiera que
     pida displayWidth/Height (gf-animales en su update, el orden por profundidad,
     los límites) lanzaba "Cannot read properties of null (reading 'sourceSize')" y
     entonces se cortaba el PASO ENTERO del bucle, no solo el dibujo (medido en el
     banco offline con Phaser 3.90). Los getters del Frame devuelven ahora valores
     neutros (tamaño 0, sin textura) en vez de reventar. */
  var framesSeguros = (function () {
    var F = P.Textures && P.Textures.Frame && P.Textures.Frame.prototype;
    if (!F) return [];
    var vacio = { x: 0, y: 0, width: 0, height: 0 };
    var seguros = {
      glTexture: function () { return this.source ? this.source.glTexture : null; },
      realWidth: function () { return this.data ? this.data.sourceSize.w : 0; },
      realHeight: function () { return this.data ? this.data.sourceSize.h : 0; },
      radius: function () { return this.data ? this.data.radius : 0; },
      trimmed: function () { return this.data ? this.data.trim : false; },
      scale9: function () { return this.data ? this.data.scale9 : false; },
      is3Slice: function () { return this.data ? this.data.is3Slice : false; },
      canvasData: function () { return this.data ? this.data.drawImage : vacio; }
    };
    return Object.keys(seguros).filter(function (k) {
      var d = Object.getOwnPropertyDescriptor(F, k);
      if (!d || typeof d.get !== 'function' || d.get.__gfSeguro) return false;
      var g = seguros[k];
      g.__gfSeguro = true;
      try {
        Object.defineProperty(F, k, { get: g, set: d.set, enumerable: d.enumerable, configurable: true });
        return true;
      } catch (e) { return false; }
    });
  })();

  /* LOS TILESETS EXTERNOS DE LOS MAPAS (2026-11-19).
     Maps/mapa_principal.json (19) y Maps/tienda_nueva.json (37) traen tilesets
     "externos" (.tsx del PC donde se dibujó el mapa). Phaser no los lee: los salta
     y avisa "External tilesets unsupported. Use Embed Tileset and re-export" uno por
     uno, en cada entrada a la escena, y el centro de control lo apunta como error.
     Los mapas no se tocan: se quitan de la copia EN MEMORIA justo antes de
     make.tilemap. El resultado es idéntico (Phaser ya los ignoraba), sin avisos. */
  function sinTilesetsExternos(scene, clave) {
    try {
      var entrada = scene && scene.cache && scene.cache.tilemap && scene.cache.tilemap.get(clave);
      var datos = entrada && entrada.data;
      if (!datos || !Array.isArray(datos.tilesets)) return 0;
      var antes = datos.tilesets.length;
      datos.tilesets = datos.tilesets.filter(function (t) { return !(t && t.source); });
      return antes - datos.tilesets.length;
    } catch (e) { return 0; }
  }

  window.GFDibujoSeguro = {
    envueltos: envueltos,
    framesSeguros: framesSeguros,
    saltados: function () { return saltados; },
    texturasRotas: function () { return Object.keys(avisadas); },
    sinTilesetsExternos: sinTilesetsExternos
  };
})();
