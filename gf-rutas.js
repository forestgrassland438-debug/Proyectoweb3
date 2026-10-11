/* ===========================================================================
 * RUTAS PARA LOS MONSTRUOS                                         (2026-10-11)
 *
 * Los zombis de la mina iban en línea recta hacia el jugador y, con una pared
 * en medio, se quedaban pegados a ella. Esto les da el camino: una rejilla de
 * casillas de CELDA px sobre el mapa (se mira si cada una es pisable con la
 * función que pase la escena: la misma colisión que usa el jugador) y una
 * búsqueda en anchura (BFS) desde el bicho hasta su objetivo, dentro de una
 * ventana alrededor (no el mapa entero: 5008 px son 125x125 casillas).
 *
 *   GFRutas.siguiente(scene, desde, hasta, op) -> {x, y} | null
 *     El siguiente punto al que andar. `op.libre(x, y)` dice si los pies
 *     caben en (x, y); `op.clave` separa las cachés (un jefe grande no cabe
 *     por donde un zombi). null = no hay camino (o ya ha llegado).
 *
 * Lo pisable de cada casilla se calcula UNA vez por escena y clave (el mapa
 * no cambia) y se suelta al apagar la escena. Cada bicho pide ruta como
 * mucho cada 700 ms; entre medias sigue el punto que tenía.
 * ======================================================================== */
(function () {
  'use strict';

  var CELDA = 40;
  var RADIO = 18;                   // casillas alrededor del bicho que se miran
  var MAX_VISITAS = 2600;

  function cache(scene, clave) {
    var c = scene.__gfRutas;
    if (!c) {
      c = scene.__gfRutas = {};
      try {
        scene.events.once('shutdown', function () { scene.__gfRutas = null; });
        scene.events.once('destroy', function () { scene.__gfRutas = null; });
      } catch (e) {}
    }
    if (!c[clave]) c[clave] = new Map();
    return c[clave];
  }

  function pisable(scene, mapa, op, cx, cy) {
    var k = cx * 4096 + cy;
    var v = mapa.get(k);
    if (v !== undefined) return v;
    // Pisable de verdad: el centro y cuatro puntos alrededor. Mirando solo el
    // centro, una pared fina entre dos casillas no se veía y el bicho se
    // quedaba empujándola.
    var x0 = cx * CELDA + CELDA / 2, y0 = cy * CELDA + CELDA / 2, q = CELDA * 0.3;
    v = cx >= 0 && cy >= 0 && !!op.libre(x0, y0) && !!op.libre(x0 - q, y0) && !!op.libre(x0 + q, y0) &&
        !!op.libre(x0, y0 - q) && !!op.libre(x0, y0 + q);
    mapa.set(k, v);
    return v;
  }

  function siguiente(scene, desde, hasta, op) {
    op = op || {};
    if (typeof op.libre !== 'function') return { x: hasta.x, y: hasta.y };
    var mapa = cache(scene, op.clave || 'normal');
    var sx = Math.floor(desde.x / CELDA), sy = Math.floor(desde.y / CELDA);
    var tx = Math.floor(hasta.x / CELDA), ty = Math.floor(hasta.y / CELDA);
    if (sx === tx && sy === ty) return null;
    // El objetivo fuera de la ventana: se apunta al borde en su dirección.
    var dx = tx - sx, dy = ty - sy;
    var lejos = Math.max(Math.abs(dx), Math.abs(dy));
    if (lejos > RADIO - 1) {
      var f = (RADIO - 1) / lejos;
      tx = sx + Math.round(dx * f); ty = sy + Math.round(dy * f);
    }
    // El destino tiene que ser pisable: si no, el vecino pisable más cerca.
    if (!pisable(scene, mapa, op, tx, ty)) {
      var mejor = null, md = 1e9;
      for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
        if (pisable(scene, mapa, op, tx + ox, ty + oy)) {
          var d = ox * ox + oy * oy;
          if (d < md) { md = d; mejor = [tx + ox, ty + oy]; }
        }
      }
      if (!mejor) return null;
      tx = mejor[0]; ty = mejor[1];
    }
    // BFS dentro de la ventana.
    var W = RADIO * 2 + 1;
    var ox0 = sx - RADIO, oy0 = sy - RADIO;
    var previo = new Int32Array(W * W).fill(-1);
    var cola = new Int32Array(W * W);
    var ini = (sy - oy0) * W + (sx - ox0);
    var fin = (ty - oy0) * W + (tx - ox0);
    previo[ini] = ini;
    var cab = 0, col = 0, visitas = 0;
    cola[col++] = ini;
    var VEC = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    var hallado = false;
    while (cab < col && visitas < MAX_VISITAS) {
      var cur = cola[cab++];
      visitas++;
      if (cur === fin) { hallado = true; break; }
      var cx = cur % W, cy = (cur - cx) / W;
      for (var i = 0; i < VEC.length; i++) {
        var nx = cx + VEC[i][0], ny = cy + VEC[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        var n = ny * W + nx;
        if (previo[n] !== -1) continue;
        if (!pisable(scene, mapa, op, nx + ox0, ny + oy0)) continue;
        // En diagonal, que no se corte una esquina de pared.
        if (VEC[i][0] && VEC[i][1] &&
            (!pisable(scene, mapa, op, cx + VEC[i][0] + ox0, cy + oy0) ||
             !pisable(scene, mapa, op, cx + ox0, cy + VEC[i][1] + oy0))) continue;
        // Y el paso entre las dos casillas (el punto medio), por si acaso.
        var mx = (cx + nx + 2 * ox0 + 1) * CELDA / 2, my = (cy + ny + 2 * oy0 + 1) * CELDA / 2;
        if (!op.libre(mx, my)) continue;
        previo[n] = cur;
        cola[col++] = n;
      }
    }
    if (!hallado) return null;
    // Se vuelve hacia atrás hasta el primer paso desde el bicho.
    var paso = fin;
    while (previo[paso] !== ini && previo[paso] !== paso) paso = previo[paso];
    var px = paso % W, py = (paso - px) / W;
    return { x: (px + ox0) * CELDA + CELDA / 2, y: (py + oy0) * CELDA + CELDA / 2 };
  }

  window.GFRutas = { siguiente: siguiente, CELDA: CELDA };
})();
