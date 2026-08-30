/* ===========================================================================
 * PROFUNDIDAD: QUÉ VA DELANTE Y QUÉ VA DETRÁS
 *
 * EL PROBLEMA
 *   El juego ordena por Y: cuanto más abajo está algo, más delante se dibuja.
 *   Eso funciona con un árbol, porque el punto por el que toca el suelo es el
 *   pie del sprite. Con una casa no: el sprite trae tejado, alero y a veces un
 *   trozo de camino dibujado debajo, así que su "pie" cae MUCHO más abajo que
 *   la pared por la que de verdad pasas por delante. Resultado: te plantas
 *   delante de la puerta y sigues viéndote por detrás de la casa.
 *
 *   Hasta ahora eso se compensaba a mano, capa por capa, con números sueltos
 *   (-40, -48, -148...). Un número por capa entera, con lo que dentro de la
 *   misma capa unas casas quedaban bien y otras no; y cualquier objeto sin
 *   número —la fuente, el pozo, el molino— se quedaba sin arreglar.
 *
 * QUÉ HACE ESTE MÓDULO
 *   Calcula la LÍNEA DE SUELO de cada objeto: la Y por la que, si la pasas,
 *   estás delante. Y la calcula midiendo, no adivinando, en este orden:
 *
 *     1. Su rectángulo de COLISIÓN. Es la mejor fuente que hay: marca por dónde
 *        se puede andar, o sea exactamente dónde acaba la pared. Se busca el
 *        que se solapa con el objeto y cuyo borde de abajo cae dentro de él; si
 *        hay varios (una casa suele tener varios), gana el más bajo, que es la
 *        pared de delante.
 *
 *     2. Sus PÍXELES. Sin colisión, se mide dónde acaba de verdad el dibujo:
 *        casi todos los PNG traen transparencia de sobra por abajo, y esa
 *        transparencia es la que descolocaba el orden.
 *
 *     3. El pie del sprite, como último recurso.
 *
 * POR QUÉ SE MIDE A TROZOS
 *   Leer los píxeles de una textura grande cuesta unos milisegundos. Hacerlo
 *   con doscientos objetos de golpe es un tirón de medio segundo justo al
 *   entrar. Se hace de unos pocos por frame hasta acabar; nadie lo nota y a los
 *   dos segundos está todo colocado.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFProfundidad && GFProfundidad.montar(this);
 *   Y se puede volver a llamar cuando aparezcan objetos nuevos: lo ya medido no
 *   se vuelve a medir.
 *
 * API
 *   GFProfundidad.montar(scene, op) / desmontar(scene)
 *   GFProfundidad.lineaDeSuelo(scene, sprite)   la Y de referencia de un objeto
 *   GFProfundidad.piesDe(scene, sprite)         la Y de los pies de un personaje
 *   GFProfundidad.medir(scene, clave)           la caja opaca de una textura
 *   GFProfundidad.recalcular(scene)             fuerza otra pasada
 *   GFProfundidad.estado(scene)
 * ======================================================================== */
(function () {
  'use strict';

  /* Cuántos objetos se miden por frame. Con 12 y ~200 objetos, la calibración
     entera cabe en menos de veinte frames — un tercio de segundo repartido, en
     vez de un tirón. */
  var POR_FRAME = 12;

  /* Cuánto tiene que solaparse un rectángulo de colisión con el objeto para
     darlo por suyo. Por debajo de esto puede ser la valla del vecino. */
  var SOLAPE_MIN = 0.55;

  /* Un rectángulo que sobresale mucho por los lados no es la pared de este
     edificio, es una zona de colisión general que pasa por encima. */
  var DESBORDE_MAX = 1.6;

  /* Alfa a partir del cual un píxel cuenta como dibujo. 8 y no 0: los bordes
     antialiaseados dejan restos casi invisibles que, contados como dibujo,
     mueven la medida varios píxeles. */
  var ALFA_MIN = 8;

  var cacheMedidas = {};        // clave de textura -> caja opaca

  function log() {
    if (!window.GF_PROFUNDIDAD_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[profundidad]');
    console.log.apply(console, a);
  }

  // ------------------------------------------------------------- medir
  /**
   * La caja OPACA de una textura, en píxeles de la propia textura.
   *
   * Devuelve { ancho, alto, arriba, abajo, izq, der } donde `abajo` es la
   * última fila que tiene dibujo. Si la textura no se puede leer —por ejemplo
   * porque viene de otro dominio y el canvas queda manchado— devuelve la caja
   * entera, que es lo mismo que hacía el juego antes.
   */
  function medir(scene, clave) {
    if (cacheMedidas[clave]) return cacheMedidas[clave];
    var caja = null;
    try {
      var tex = scene.textures.get(clave);
      var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
      if (!img || !img.width) throw new Error('sin imagen');
      var w = img.width, h = img.height;

      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      var datos = ctx.getImageData(0, 0, w, h).data;

      /* Se busca de ABAJO hacia arriba y se para en la primera fila con
         dibujo: en la inmensa mayoría de los sprites eso son dos o tres filas,
         no la imagen entera. */
      var abajo = -1, y, x, i;
      for (y = h - 1; y >= 0 && abajo < 0; y--) {
        for (x = 0; x < w; x++) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { abajo = y; break; }
        }
      }
      if (abajo < 0) throw new Error('textura vacía');

      // arriba, y los lados: solo hace falta recorrer una vez más
      var arriba = 0;
      for (y = 0; y < h; y++) {
        var hay = false;
        for (x = 0; x < w; x++) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { hay = true; break; }
        }
        if (hay) { arriba = y; break; }
      }
      var izq = w, der = -1;
      for (y = arriba; y <= abajo; y++) {
        for (x = 0; x < izq; x++) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { izq = x; break; }
        }
        for (x = w - 1; x > der; x--) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { der = x; break; }
        }
      }
      caja = { ancho: w, alto: h, arriba: arriba, abajo: abajo,
               izq: Math.min(izq, w - 1), der: Math.max(der, 0), leida: true };
    } catch (e) {
      // Textura ilegible: se da por buena entera. Es lo que había antes.
      var t2 = null;
      try { t2 = scene.textures.get(clave); } catch (e2) {}
      var iw = (t2 && t2.source && t2.source[0]) ? t2.source[0].width : 0;
      var ih = (t2 && t2.source && t2.source[0]) ? t2.source[0].height : 0;
      caja = { ancho: iw, alto: ih, arriba: 0, abajo: Math.max(0, ih - 1),
               izq: 0, der: Math.max(0, iw - 1), leida: false };
    }
    cacheMedidas[clave] = caja;
    return caja;
  }

  /** Cuánto sobra de transparencia por debajo del sprite, en píxeles de MUNDO. */
  function sobranteAbajo(scene, spr) {
    var clave = spr.texture && spr.texture.key;
    if (!clave) return 0;
    var m = medir(scene, clave);
    if (!m.leida || !m.alto) return 0;
    var escala = Math.abs(spr.scaleY) || 1;
    return (m.alto - 1 - m.abajo) * escala;
  }

  // --------------------------------------------------- caja del sprite
  /** La caja del sprite en el MUNDO, sin depender de getBounds. */
  function cajaMundo(spr) {
    var w = spr.displayWidth || spr.width || 0;
    var h = spr.displayHeight || spr.height || 0;
    var ox = (spr.originX === undefined) ? 0.5 : spr.originX;
    var oy = (spr.originY === undefined) ? 0.5 : spr.originY;
    var x = spr.x - w * ox;
    var y = spr.y - h * oy;
    return { x: x, y: y, ancho: w, alto: h, der: x + w, abajo: y + h };
  }

  // ------------------------------------------------- línea de suelo
  /**
   * ¿Hay un rectángulo de colisión que sea la PARED de este objeto?
   *
   * Se pide que se solape de verdad con el objeto por los lados, que no lo
   * desborde (eso sería una zona general que pasa por encima) y que su borde
   * de abajo caiga dentro del cuerpo del sprite. De los que valgan gana el más
   * bajo: en una casa con varios rectángulos, ese es el de la fachada.
   */
  function paredDe(colisiones, caja) {
    var mejor = null;
    for (var a = 0; a < colisiones.length; a++) {
      var arr = colisiones[a];
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) {
        var r = arr[i];
        if (!r || typeof r.width !== 'number' || !r.width) continue;
        var rDer = r.x + r.width, rAbajo = r.y + r.height;

        var solape = Math.min(caja.der, rDer) - Math.max(caja.x, r.x);
        if (solape <= 0) continue;
        if (solape < Math.min(r.width, caja.ancho) * SOLAPE_MIN) continue;
        // que no sea una zona enorme que pasa por encima del objeto
        if (r.width > caja.ancho * DESBORDE_MAX) continue;

        // el borde de abajo tiene que caer DENTRO del cuerpo del sprite
        if (rAbajo < caja.y + caja.alto * 0.12) continue;
        if (rAbajo > caja.abajo + 6) continue;

        if (mejor === null || rAbajo > mejor) mejor = rAbajo;
      }
    }
    return mejor;
  }

  /**
   * La Y por la que este objeto deja de taparte.
   *
   * Devuelve { y, fuente } para poder ver de dónde salió cada número al
   * depurar: 'pared' (colisión), 'pixeles' o 'sprite'.
   */
  function lineaDeSuelo(scene, spr, colisiones) {
    var caja = cajaMundo(spr);
    if (!colisiones) {
      colisiones = [scene.collisionRectangles, scene.collisionRectangles1,
                    scene.collisionRectangles2];
    }
    var pared = paredDe(colisiones, caja);
    if (pared !== null) return { y: pared, fuente: 'pared' };

    var sobra = sobranteAbajo(scene, spr);
    if (sobra > 1) return { y: caja.abajo - sobra, fuente: 'pixeles' };

    return { y: caja.abajo, fuente: 'sprite' };
  }

  /**
   * La Y de los PIES de un personaje, midiendo el dibujo.
   *
   * GameScene usaba `y + displayHeight/2`, que da el borde de abajo del sprite.
   * Los personajes traen unas cuantas filas transparentes ahí, así que sus pies
   * quedaban más abajo de lo que se ve y el personaje se ponía delante de las
   * cosas antes de tiempo.
   */
  function piesDe(scene, spr) {
    if (!spr) return 0;
    var caja = cajaMundo(spr);
    return caja.abajo - sobranteAbajo(scene, spr);
  }

  // ------------------------------------------------------------ montaje
  /** Los objetos del mapa a los que hay que ponerles la profundidad. */
  function candidatos(scene) {
    var out = [];
    if (!scene.children || !scene.children.each) return out;
    scene.children.each(function (o) {
      if (!o || o.__gfProf) return;                 // ya calibrado
      if (typeof o.getData !== 'function') return;
      if (!o.getData('optimized')) return;          // solo los del mapa
      /* LOS TEXTOS NO.

         EL FALLO QUE ARREGLA: los carteles con el nombre de los NPC tambien
         llevan puesto `optimized` (lo usa el sistema de culling), y un Text de
         Phaser tiene textura, asi que pasaban el filtro y se les recalculaba la
         profundidad como si fueran un edificio. Un cartel no esta apoyado en el
         suelo: flota sobre la cabeza del NPC y su sitio lo decide el NPC, no su
         propia Y. */
      if (o.type === 'Text' || o.type === 'BitmapText') return;
      if (!o.texture || !o.texture.key) return;
      out.push(o);
    });
    return out;
  }

  function calibrar(scene, spr, colisiones) {
    var r = lineaDeSuelo(scene, spr, colisiones);
    spr.setDepth(r.y);
    spr.__gfProf = r.fuente;
    spr.setData && spr.setData('lineaSuelo', r.y);
    return r;
  }

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.children) return null;
    if (scene.__gfProf) { scene.__gfProf.pendientes = candidatos(scene); return scene.__gfProf; }

    var st = {
      scene: scene,
      pendientes: candidatos(scene),
      hechos: 0,
      porFuente: { pared: 0, pixeles: 0, sprite: 0 },
      porFrame: opciones.porFrame || POR_FRAME
    };
    scene.__gfProf = st;

    st.onUpdate = function () {
      if (!st.pendientes.length) return;
      var colisiones = [scene.collisionRectangles, scene.collisionRectangles1,
                        scene.collisionRectangles2];
      /* Sin colisiones cargadas todavía no se mide nada: se calibraría todo
         por píxeles y luego habría que rehacerlo. Se espera. */
      var hayColisiones = colisiones.some(function (a) { return a && a.length; });
      if (!hayColisiones && !opciones.sinEsperarColisiones) return;

      var n = Math.min(st.porFrame, st.pendientes.length);
      for (var i = 0; i < n; i++) {
        var spr = st.pendientes.shift();
        if (!spr || !spr.active) continue;
        try {
          var r = calibrar(scene, spr, colisiones);
          st.porFuente[r.fuente]++;
          st.hechos++;
        } catch (e) { /* un objeto raro no puede parar a los demás */ }
      }
      if (!st.pendientes.length) {
        log('calibrados', st.hechos, 'objetos:', JSON.stringify(st.porFuente));
      }
    };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    log('montado con', st.pendientes.length, 'objetos por calibrar');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfProf;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    scene.__gfProf = null;
  }

  /** Vuelve a mirar si hay objetos nuevos sin calibrar (chunks, spawns...). */
  function recalcular(scene) {
    var st = scene && scene.__gfProf;
    if (!st) return 0;
    var nuevos = candidatos(scene);
    st.pendientes = st.pendientes.concat(nuevos);
    return nuevos.length;
  }

  window.GFProfundidad = {
    montar: montar,
    desmontar: desmontar,
    recalcular: recalcular,
    medir: medir,
    lineaDeSuelo: lineaDeSuelo,
    piesDe: piesDe,
    sobranteAbajo: sobranteAbajo,
    estado: function (scene) {
      var st = scene && scene.__gfProf;
      if (!st) return null;
      return { pendientes: st.pendientes.length, hechos: st.hechos,
               porFuente: st.porFuente };
    },
    _interno: { cajaMundo: cajaMundo, paredDe: paredDe, candidatos: candidatos,
                calibrar: calibrar, SOLAPE_MIN: SOLAPE_MIN,
                DESBORDE_MAX: DESBORDE_MAX, ALFA_MIN: ALFA_MIN,
                limpiarCache: function () { cacheMedidas = {}; } }
  };
})();
