'use strict';
/* (2026-10-26) "Si me pongo detrás de cualquier árbol y aprieto siempre hacia
 * abajo, el personaje sale delante; y muchos árboles no tienen bien sus
 * colisiones, en todos los mapas."
 * Se ejecuta el código REAL (gf-profundidad.js, gf-troncos.js, GameScene.js)
 * con un Phaser y un lienzo de mentira. En el navegador, árbol por árbol y en
 * todos los mapas: tools/arboles-auditoria.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(BIN, f), 'utf8').replace(/\r\n/g, '\n');

/** Una textura de 20×30 con la copa arriba y el tronco (2 columnas) abajo, en `colTronco`. */
function documentoFalso(colTronco) {
  return {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData(x, y, w, h) {
          const d = new Uint8ClampedArray(w * h * 4);
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const copa = yy < 22 && xx >= 3 && xx <= 16;
            const tronco = yy >= 22 && (xx === colTronco || xx === colTronco + 1);
            if (copa || tronco) d[(yy * w + xx) * 4 + 3] = 255;
          }
          return { data: d };
        }
      })
    })
  };
}

function cargarProfundidad(colTronco) {
  const ctx = vm.createContext({ window: {}, document: documentoFalso(colTronco), console, Math, Number, isFinite, Infinity, Array, Object, performance: { now: () => 0 } });
  vm.runInContext(leer('gf-profundidad.js'), ctx);
  return ctx.window.GFProfundidad;
}

/** Un árbol de 40×60 (textura 20×30 a ×2) con su pie en (110, 255) y el choque del tronco. */
function escena(rects, clave) {
  const dentro = (x, y, w, h) => rects.some((o) => !(x + w < o.x || y + h < o.y || x > o.x + o.width || y > o.y + o.height));
  const spr = {
    x: 110, y: 255, originX: 0.5, originY: 1, displayWidth: 40, displayHeight: 60, width: 20, height: 30,
    scaleY: 2, flipX: false, texture: { key: clave }, depth: 0, _d: {},
    setDepth(v) { this.depth = v; return this; }, getData(k) { return this._d[k]; }, setData(k, v) { this._d[k] = v; }
  };
  const sc = {
    sys: { settings: { key: 'GameScene' } }, _idxColision: {}, _chocaConEscenario: dentro,
    collisionRectangles: rects, textures: { get: () => ({ getSourceImage: () => ({ width: 20, height: 30 }) }) }
  };
  return { sc, spr };
}

test('la línea de un árbol queda a MITAD entre estar pegado detrás y pegado delante', () => {
  const P = cargarProfundidad(9);                     // tronco en el centro: x 108..112
  const rects = [{ x: 90, y: 231, width: 39, height: 16 }];   // el choque del "arbusto solo"
  const { sc, spr } = escena(rects, 'arbustos_png');
  const r = P._interno.calibrar(sc, spr, [rects]);
  assert.equal(r.fuente, 'tronco');
  // Pueblo: caja de pies 25..40 bajo la Y, profundidad a +51.
  const detras = 231 - 25 - 15 + 51, delante = 247 - 25 + 51;   // 242 y 273
  assert.ok(Math.abs(spr.depth - (detras + delante) / 2) <= 1.5, 'línea ' + spr.depth);
  assert.ok(spr.depth - detras >= 14 && delante - spr.depth >= 14, 'margen a los dos lados');
  // La cuenta vieja (el borde de abajo del choque) dejaba 3 px por detrás.
  const vieja = P._interno.sondearSuelo(sc, P._interno.cajaMundo(spr));
  assert.ok(vieja - detras < 8, 'antes: ' + (vieja - detras) + ' px');
});

test('una casa, o un árbol sin choque en el tronco, se quedan como estaban', () => {
  const P = cargarProfundidad(9);
  const rects = [{ x: 90, y: 231, width: 39, height: 16 }];
  const casa = escena(rects, 'casa_png');
  assert.notEqual(P._interno.calibrar(casa.sc, casa.spr, [rects]).fuente, 'tronco');
  const sinTronco = escena([], 'pinos_png');
  assert.notEqual(P._interno.calibrar(sinTronco.sc, sinTronco.spr, [[]]).fuente, 'tronco');
  // Una zona enorme debajo (un huerto vallado) no es un tronco.
  const zona = [{ x: 0, y: 150, width: 400, height: 100 }];
  const z = escena(zona, 'pinos_png');
  assert.notEqual(P._interno.calibrar(z.sc, z.spr, [zona]).fuente, 'tronco');
});

test('gf-troncos: el dibujo de un tronco torcido se corre encima de su choque y el que no tiene, lo recibe', () => {
  const avisos = [];
  const ctx = vm.createContext({
    window: { GFProfundidad: { medir: (sc, k) => (k === 'palmera' ? { leida: true, ancho: 100, pieX: 75 } : { leida: true, ancho: 100, pieX: 52 }) } },
    console: { log: (m) => avisos.push(m) }, Math, isFinite, Array,
    Phaser: { Geom: { Rectangle: function (x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; } } }
  });
  vm.runInContext(leer('gf-troncos.js'), ctx);
  const T = ctx.window.GFTroncos;
  const rects = [{ x: 480.5, y: 783, width: 39, height: 17 }];      // el del mapa, en el pie (500)
  const sc = {
    _idxColision: {}, collisionRectangles: rects, _colisionesSucias: false,
    _chocaConEscenario: (x, y, w, h) => rects.some((o) => !(x + w < o.x || y + h < o.y || x > o.x + o.width || y > o.y + o.height))
  };
  const spr = (k, x) => ({ x, originX: 0.5, displayWidth: 130, flipX: false, texture: { key: k } });
  const palmera = { spr: spr('palmera', 500), sombra: { x: 506 }, x: 500, y: 800 };
  const recto = { spr: spr('abeto', 900), sombra: { x: 906 }, x: 900, y: 800 };
  const r = T.ajustar(sc, [palmera, recto]);
  // La palmera tiene el tronco al 75 %: 32,5 px a la derecha. Se corre a la izquierda.
  assert.equal(palmera.spr.x, 467.5);
  assert.equal(palmera.sombra.x, 473.5);
  assert.equal(recto.spr.x, 900, 'un desvío de 2,6 px no se toca');
  assert.equal(r.movidos, 1);
  // El abeto no tenía choque: se le pone uno en el tronco, apoyado en la base.
  assert.equal(r.choques, 1);
  const nuevo = rects[1];
  assert.equal(JSON.stringify([nuevo.x, nuevo.y, nuevo.width, nuevo.height]), JSON.stringify([880.5, 783, 39, 17]));
  assert.equal(sc._colisionesSucias, true);
});

test('el pueblo ordena al jugador con la posición YA corregida por el choque', () => {
  const gs = leer('Scenes/GameScene.js');
  const i = gs.indexOf('this._resolverChoqueJugador(prevX, prevY, 15);');
  assert.ok(i > 0);
  const despues = gs.slice(i, i + 1400);
  assert.match(despues, /this\.player\.setDepth\(pies\)/, 'después de resolver el choque se vuelve a poner la profundidad');
  // Y el salvaje y las zonas montan gf-troncos.
  assert.match(leer('Scenes/SalvajeScene.js'), /this\._montarArboles\(\);\s*\/\/[^\n]*\n[^\n]*\n\s*if \(window\.GFTroncos\) window\.GFTroncos\.ajustar\(this, this\._arboles\);/);
  assert.match(leer('Scenes/ZonasScenes.js'), /if \(window\.GFTroncos\) window\.GFTroncos\.ajustar\(this, this\._arboles\);/);
  assert.match(leer('index.html'), /<script src="\.\/gf-troncos\.js\?v=[^"]+" defer><\/script>/);
});
