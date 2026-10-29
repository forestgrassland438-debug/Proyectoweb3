/* ===========================================================================
 * ÁRBOLES: ¿CHOCAN Y SE ORDENAN BIEN? — comprobador para el navegador
 *                                                                (2026-10-26)
 * "Si me pongo detrás de cualquier árbol y aprieto siempre hacia abajo, el
 * personaje sale delante del árbol; y muchos árboles no tienen bien sus
 * colisiones, en todos los mapas."
 *
 * Para CADA árbol de la escena activa, con la caja de los pies y la cuenta de
 * profundidad de ESA escena:
 *   · se baja desde detrás (norte) por la línea del tronco hasta chocar: el
 *     personaje tiene que quedar DETRÁS (su profundidad < la del árbol);
 *   · se sube desde delante (sur) hasta chocar: tiene que quedar DELANTE;
 *   · si no choca nunca, el árbol no tiene colisión (se atraviesa).
 *
 * Uso (consola del juego o el banco de pruebas):
 *   (cargar con <script src="./tools/arboles-auditoria.js">: la CSP prohíbe eval)
 *   gfArbolesAuditoria()            → { escena, arboles, fallos: [...] }
 *   gfArbolesAuditoria({ todos: true })  → también los que están bien
 * ======================================================================== */
(function () {
  'use strict';

  // Lo que es un árbol, por la clave de su textura.
  var ES_ARBOL = /arbol|pino|abeto|abedul|cerezo|roble|palmera|hongo|arbust/i;
  // Píxeles mínimos entre "parado detrás" y la línea del árbol (y lo mismo delante).
  var MARGEN = 10;

  function escena() {
    var l = [];
    try { l = window.game.scene.getScenes(true); } catch (e) {}
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].player && typeof l[i]._chocaConEscenario === 'function') return l[i];
    return null;
  }

  /** La geometría de los pies de cada escena (la misma que su update()). */
  function pies(sc) {
    var key = sc.sys.settings.key;
    var alto = (key === 'GameScene' || key === 'tiendajuego') ? 15 : 26;
    var prof = function (y) {
      if (key === 'GameScene' && window.GFProfundidad && window.GFProfundidad.piesDe) {
        var p = sc.player, y0 = p.y;
        p.y = y;
        try { return window.GFProfundidad.piesDe(sc, p); } finally { p.y = y0; }
      }
      return y + 51;
    };
    return { alto: alto, prof: prof };
  }

  function recorrer(lista, fuera) {
    for (var i = 0; i < lista.length; i++) {
      var o = lista[i];
      if (o && o.list) recorrer(o.list, fuera);
      var k = o && o.texture && o.texture.key;
      // Visibles o no: el juego esconde los que quedan lejos de la cámara.
      if (k && ES_ARBOL.test(k) && !/sombra/i.test(k) && o.active !== false) fuera.push(o);
    }
    return fuera;
  }

  /** La X del tronco: donde el dibujo toca el suelo (gf-profundidad la mide). */
  function xTronco(sc, o) {
    var w = o.displayWidth || o.width || 0;
    var x0 = o.x - w * (o.originX === undefined ? 0.5 : o.originX);
    try {
      var m = window.GFProfundidad && window.GFProfundidad.medir ? window.GFProfundidad.medir(sc, o.texture.key) : null;
      if (m && m.leida && m.pieX) {
        var px = m.pieX / m.ancho;
        if (o.flipX) px = 1 - px;
        return x0 + px * w;
      }
    } catch (e) {}
    return o.x;
  }

  window.gfArbolesAuditoria = function (op) {
    op = op || {};
    var sc = escena();
    if (!sc) return { error: 'sin escena con jugador' };
    try { if (sc._asegurarIndiceColisiones) sc._asegurarIndiceColisiones(); } catch (e) {}
    var g = pies(sc);
    var choca = function (x, y) { return sc._chocaConEscenario(x - 15, y + 25, 30, g.alto); };
    var arboles = recorrer(sc.children.list, []);
    var fallos = [], todos = [];
    arboles.forEach(function (o) {
      var d = o.depth;
      var h = o.displayHeight || o.height || 0;
      var xt = xTronco(sc, o);
      var r = { clave: o.texture.key, x: Math.round(o.x), y: Math.round(o.y), depth: Math.round(d), xTronco: Math.round(xt) };
      /* ¿Hay algo sólido en el TRONCO? Una cajita de 12 px de ancho en el pie,
         desde 40 px por encima de la línea hasta 6 por debajo. Si no, el
         árbol se atraviesa (lo que se choque al acercarse es de otra cosa). */
      var tronco = sc._chocaConEscenario(xt - 6, d - 40, 12, 46);
      // Desde detrás: arranca 70 px por encima del tronco (no de la copa: lo
      // de más arriba es el árbol o la valla de atrás).
      var paso = 2, y = d - 51 - 70, libreArriba = null, libreAbajo = null;
      for (var n = 0; n < 40 && choca(xt, y); n++) y -= 4;
      for (; y < d + 60; y += paso) {
        if (choca(xt, y + paso)) { libreArriba = y; break; }
      }
      // Desde delante.
      for (y = d + 70, n = 0; n < 40 && choca(xt, y); n++) y += 4;
      for (; y > d - 160; y -= paso) {
        if (choca(xt, y - paso)) { libreAbajo = y; break; }
      }
      if (!tronco) {
        r.fallo = 'sin colision en el tronco (se atraviesa)';
      } else if (libreArriba === null) {
        r.fallo = 'sin colision (se atraviesa)';
      } else {
        r.detras = Math.round(g.prof(libreArriba)) ;
        r.delante = libreAbajo === null ? null : Math.round(g.prof(libreAbajo));
        if (r.detras >= d) r.fallo = 'por detras sale DELANTE (' + r.detras + ' >= ' + Math.round(d) + ')';
        else if (r.delante !== null && r.delante <= d) r.fallo = 'por delante sale DETRAS (' + r.delante + ' <= ' + Math.round(d) + ')';
        /* EL MARGEN. Bien ordenado pero por pocos píxeles tampoco vale: al
           apretar contra el tronco el paso de un fotograma (4 px a 60 fps, 8 a
           30, más en un tirón) y la diferencia entre personajes lo dan la
           vuelta. Ese era el árbol de la captura: 3 px. */
        else if (d - r.detras < MARGEN) r.fallo = 'margen corto por detras (' + Math.round(d - r.detras) + ' px)';
        else if (r.delante !== null && r.delante - d < MARGEN) r.fallo = 'margen corto por delante (' + Math.round(r.delante - d) + ' px)';
      }
      // El rectángulo contra el que se choca por detrás (para saber de quién es).
      if (libreArriba !== null && op.rects) {
        var py = libreArriba + paso + 25, cand = [];
        [].concat(sc.collisionRectangles || [], sc.collisionRectangles1 || []).forEach(function (q) {
          if (q && xt + 15 >= q.x && xt - 15 <= q.x + q.width && py + g.alto >= q.y && py <= q.y + q.height) cand.push([Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]);
        });
        r.rect = cand;
      }
      if (r.fallo) fallos.push(r);
      if (op.todos) todos.push(r);
    });
    return { escena: sc.sys.settings.key, arboles: arboles.length, fallos: fallos, todos: op.todos ? todos : undefined };
  };
})();
