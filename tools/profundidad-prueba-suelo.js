/* Lo que esta pintado en el SUELO nunca puede taparte.
 *
 * EL FALLO QUE VIGILA — "al estar encima de la siembra salgo DEBAJO de ella".
 *
 * Las 24 parcelas se crean con `setDepth(0)` (son suelo) y con
 * `setData('optimized', true)` para que el recorte por distancia se las lleve.
 * Pero gf-profundidad.js elegia a quien recalcularle la profundidad POR ESA
 * MISMA MARCA, asi que se llevaba las parcelas y les cambiaba el 0 por su linea
 * de suelo. A partir de ahi las parcelas al sur del jugador tenian una Y mayor
 * y se dibujaban encima de el: plantado en medio del huerto, quedabas enterrado.
 *
 * Aqui se carga el gf-profundidad.js REAL contra una escena de mentira con tres
 * cosas dentro: una parcela (suelo), un arbol (objeto del mundo) y un cartel de
 * NPC (texto), y se mira que profundidad acaba teniendo cada uno.
 *
 *   node tools/profundidad-prueba-suelo.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const RUTA = path.join(BIN, 'gf-profundidad.js');
if (!fs.existsSync(RUTA)) { console.error('No encuentro ' + RUTA); process.exit(2); }

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => {
  if (c) { pasadas++; console.log('  OK    ' + m); }
  else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); }
};

// ── Navegador de mentira ────────────────────────────────────────────────────
global.window = global;
global.document = {
  addEventListener() {}, removeEventListener() {},
  createElement() { return { getContext: () => null, style: {} }; }
};
global.addEventListener = function () {};
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

const hablar = console.log;
console.log = () => {};
try { eval(fs.readFileSync(RUTA, 'utf8')); } finally { console.log = hablar; }

const GFP = global.GFProfundidad;
if (!GFP || typeof GFP.montar !== 'function') {
  console.error('No se pudo cargar GFProfundidad'); process.exit(2);
}

// ── Sprites de mentira ──────────────────────────────────────────────────────
function sprite({ x, y, w, h, clave, datos }) {
  const d = Object.assign({}, datos);
  return {
    type: 'Image', x, y,
    displayWidth: w, displayHeight: h,
    originX: 0.5, originY: 0.5,
    scaleX: 1, scaleY: 1,
    texture: { key: clave, getSourceImage: () => null },
    frame: { cutWidth: w, cutHeight: h },
    depth: 0,
    setDepth(v) { this.depth = v; return this; },
    getData(k) { return d[k]; },
    setData(k, v) { d[k] = v; return this; },
    getBounds() { return { x: x - w / 2, y: y - h / 2, width: w, height: h }; }
  };
}

function escena(hijos) {
  return {
    children: { each: (fn) => hijos.forEach(fn), list: hijos },
    add: { image: () => sprite({ x: 0, y: 0, w: 1, h: 1, clave: 'x', datos: {} }) },
    events: { on() {}, off() {}, once() {} },
    sys: { game: { canvas: null } },
    textures: { exists: () => false, get: () => null },
    game: { renderer: {} },
    scale: { on() {}, off() {} },
    collisionRectangles: [],
    collisionRectangles1: []
  };
}

console.log('=== EL SUELO NO TAPA A NADIE ===\n');

// parcela de siembra: suelo, a depth 0, con la marca optimized que la delataba
const parcela = sprite({ x: 1000, y: 4000, w: 64, h: 64, clave: 'tierra_seca',
                         datos: { optimized: true, gfSuelo: true } });
// un arbol del mapa: objeto del mundo, SI se ordena
const arbol   = sprite({ x: 1200, y: 4000, w: 192, h: 256, clave: 'arbol_png',
                         datos: { optimized: true } });
// un cartel de NPC: texto, ya estaba exceptuado
const cartel  = Object.assign(sprite({ x: 1400, y: 4000, w: 80, h: 12, clave: 'txt',
                                       datos: { optimized: true } }), { type: 'Text' });

const esc = escena([parcela, arbol, cartel]);

console.log('1) A quien se le recalcula la profundidad');
console.log = () => {};
let st = null;
try { st = GFP.montar(esc); } catch (e) { console.log = hablar; console.error('montar exploto:', e); }
console.log = hablar;

// `montar` devuelve su estado con la lista de candidatos: eso es EXACTAMENTE
// la decision que se cambio, y no depende de que el calibrado pueda medir
// pixeles (aqui no hay lienzo de verdad).
const lista = (st && st.pendientes) || [];
ok(lista.indexOf(parcela) < 0, 'la parcela de siembra NO entra en el reparto');
ok(lista.indexOf(cartel) < 0, 'el cartel del NPC tampoco (ya estaba exceptuado)');
ok(lista.indexOf(arbol) >= 0, 'pero el arbol SI: es un objeto del mundo',
   lista.length + ' candidatos');
ok(parcela.depth === 0, 'y la parcela se queda en el suelo (depth 0)',
   'depth = ' + parcela.depth);

console.log('\n2) El jugador plantado en medio del huerto');
// El jugador tiene los pies en 4000; una parcela al SUR llega hasta 4064.
const parcelaSur = sprite({ x: 1000, y: 4064, w: 64, h: 64, clave: 'tierra_seca',
                            datos: { optimized: true, gfSuelo: true } });
const esc2 = escena([parcelaSur]);
console.log = () => {};
try { GFP.montar(esc2); } catch (e) {}
console.log = hablar;
const piesJugador = 4000;
ok(parcelaSur.depth < piesJugador,
   'la parcela de mas al sur sigue por DEBAJO del jugador',
   'parcela ' + parcelaSur.depth + ' vs pies ' + piesJugador);

console.log('\n' + '='.repeat(60));
console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
if (fallos) { console.log('\nAlgo pintado en el suelo se pone por delante del jugador.'); process.exit(1); }
console.log('Sin fallos.');
process.exit(0);
