/* ===========================================================================
 * gf-troncos.js — EL TRONCO DE CADA ÁRBOL, DONDE ESTÁ SU CHOQUE (2026-10-26)
 * ===========================================================================
 *
 * "Muchos árboles no tienen bien sus colisiones, en todos los mapas."
 *
 * Lo que se midió (tools/arboles-auditoria.js, árbol por árbol):
 *   · El roble curvado (mapa salvaje y pradera) y la palmera cocotera
 *     (desierto) tienen el tronco DIBUJADO a un lado: 31 y 42 px fuera del
 *     centro. El mapa les pone el choque en el centro (`pie_x`), así que la
 *     parte del tronco que se ve se atravesaba y el choque quedaba en el aire.
 *   · Algún árbol suelto (uno en la tundra) se quedó sin choque.
 *
 * Los mapas no se tocan. Al montar los árboles de una escena:
 *   1. se mide dónde toca el suelo el DIBUJO de cada textura (la fila de
 *      abajo; GFProfundidad.medir) y, si cae a más de 10 px del choque, se
 *      corre el sprite (y su sombra) para que el tronco quede encima;
 *   2. si en el tronco no hay nada sólido, se le pone el choque de serie de
 *      los árboles de estos mapas (39 × 17, apoyado en la base).
 *
 * Uso: GFTroncos.ajustar(scene, scene._arboles)   (SalvajeScene, ZonasScenes)
 *      cada elemento: { spr, sombra, x, y }  (x, y = el pie según el mapa)
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFTroncos) return;

  var DESVIO_MAX = 10;              // px de desvío que se toleran sin mover nada
  var CHOQUE_ANCHO = 39, CHOQUE_ALTO = 17;

  /** La X del mundo en la que el dibujo toca el suelo, o null si no se puede leer. */
  function xDelTronco(scene, spr) {
    if (!window.GFProfundidad || !window.GFProfundidad.medir) return null;
    var m = null;
    try { m = window.GFProfundidad.medir(scene, spr.texture.key); } catch (e) { return null; }
    if (!m || !m.leida || !m.ancho || !(m.pieX >= 0)) return null;
    var w = spr.displayWidth || spr.width || 0;
    var f = m.pieX / m.ancho;
    if (spr.flipX) f = 1 - f;
    var ox = spr.originX === undefined ? 0.5 : spr.originX;
    return spr.x + (f - ox) * w;
  }

  function ajustar(scene, lista) {
    var r = { movidos: 0, choques: 0 };
    if (!scene || !Array.isArray(lista) || !lista.length) return r;
    var nuevos = [];
    for (var i = 0; i < lista.length; i++) {
      var a = lista[i];
      if (!a || !a.spr || !a.spr.texture) continue;
      // 1. El dibujo encima del choque.
      var xt = xDelTronco(scene, a.spr);
      if (xt !== null && isFinite(a.x)) {
        var desvio = xt - a.x;
        if (Math.abs(desvio) > DESVIO_MAX) {
          a.spr.x -= desvio;
          if (a.sombra) a.sombra.x -= desvio;
          r.movidos++;
        }
      }
      // 2. Un choque en el tronco si no lo tiene.
      if (typeof scene._chocaConEscenario === 'function' && scene._idxColision &&
          !scene._chocaConEscenario(a.x - 6, a.y - 40, 12, 46)) {
        nuevos.push(new Phaser.Geom.Rectangle(a.x - CHOQUE_ANCHO / 2, a.y - CHOQUE_ALTO, CHOQUE_ANCHO, CHOQUE_ALTO));
      }
    }
    if (nuevos.length && Array.isArray(scene.collisionRectangles)) {
      for (var j = 0; j < nuevos.length; j++) scene.collisionRectangles.push(nuevos[j]);
      scene._colisionesSucias = true;
      try { if (scene._asegurarIndiceColisiones) scene._asegurarIndiceColisiones(); } catch (e) {}
      r.choques = nuevos.length;
    }
    if (r.movidos || r.choques) console.log('🌳 troncos: ' + r.movidos + ' árboles alineados con su choque, ' + r.choques + ' choques añadidos');
    return r;
  }

  window.GFTroncos = { ajustar: ajustar, xDelTronco: xDelTronco };
})();
