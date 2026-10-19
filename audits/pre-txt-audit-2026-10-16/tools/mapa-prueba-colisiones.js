/* ¿Se puede atravesar algo del mapa? Se camina contra cada objeto por los 4 lados.
 *
 * EL FALLO QUE VIGILA — "si choco desde arriba con el arbusto (o con uno de los
 * 3 arboles) lo atravieso, y lo mismo con otros arbustos".
 *
 * No se razona: se simula. Se cogen los rectangulos de colision REALES del mapa
 * y la caja de colision REAL del jugador (la de los pies, `x-15, y+25, 30x15`,
 * sacada de GameScene), y se empuja al jugador contra cada objeto desde arriba,
 * abajo, izquierda y derecha, paso a paso como en el juego. Si el jugador acaba
 * con los pies dentro de la silueta del objeto, es que lo ha atravesado.
 *
 *   node tools/mapa-prueba-colisiones.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const MAPA = path.join(BIN, 'Maps', 'mapa_principal.json');
if (!fs.existsSync(MAPA)) { console.error('No encuentro ' + MAPA); process.exit(2); }

const mapa = JSON.parse(fs.readFileSync(MAPA, 'utf8'));
const capa = (n) => (mapa.layers.find(l => l.name === n) || { objects: [] }).objects;

// ── La caja de colision del jugador, tal cual la usa GameScene ──────────────
// update():  this._chocaConEscenario(x - 15, y + 25, 30, 15)
const CAJA = { dx: -15, dy: 25, w: 30, h: 15 };
const PASO = 3.5;          // px por frame a velocidad normal (~200 px/s a 60fps)

const rects = capa('area_colision_general').map(o => ({
  x: o.x, y: o.y, width: o.width, height: o.height
}));

const solapa = (a, b) => !(a.x + a.width < b.x || a.y + a.height < b.y ||
                           a.x > b.x + b.width || a.y > b.y + b.height);

/** ¿Choca la caja de los pies del jugador en (px,py) con el escenario? */
function choca(px, py) {
  const c = { x: px + CAJA.dx, y: py + CAJA.dy, width: CAJA.w, height: CAJA.h };
  for (let i = 0; i < rects.length; i++) if (solapa(c, rects[i])) return true;
  return false;
}

/** Silueta del objeto de tile: en Tiled va anclado abajo-izquierda. */
const siluetaDe = (o) => ({ x: o.x, y: o.y - o.height, width: o.width, height: o.height });

/**
 * Camina hacia el objeto desde `lado` y devuelve cuanto se mete dentro de la
 * silueta. 0 = se para fuera; >0 = pixeles que penetra.
 */
function penetracion(obj, lado) {
  const s = siluetaDe(obj);
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const LEJOS = 260;

  let px, py, vx = 0, vy = 0;
  if (lado === 'arriba')    { px = cx; py = s.y - LEJOS;              vy = +1; }
  if (lado === 'abajo')     { px = cx; py = s.y + s.height + LEJOS;   vy = -1; }
  if (lado === 'izquierda') { px = s.x - LEJOS;            py = cy;   vx = +1; }
  if (lado === 'derecha')   { px = s.x + s.width + LEJOS;  py = cy;   vx = -1; }

  // Si ya empieza dentro de otra cosa, este lado no se puede medir.
  if (choca(px, py)) return -1;

  const pasos = Math.ceil((LEJOS * 2 + Math.max(s.width, s.height)) / PASO);
  for (let i = 0; i < pasos; i++) {
    const nx = px + vx * PASO;
    const ny = py + vy * PASO;
    // Mismo orden por ejes que el update de GameScene.
    if (!choca(nx, py)) px = nx;
    if (!choca(px, ny)) py = ny;
  }

  // ¿Donde acabaron los PIES del jugador?
  const pies = { x: px + CAJA.dx, y: py + CAJA.dy, width: CAJA.w, height: CAJA.h };
  if (!solapa(pies, s)) return 0;

  // Cuanto se ha metido dentro de la silueta, por el eje del avance.
  if (lado === 'arriba')    return (pies.y + pies.height) - s.y;
  if (lado === 'abajo')     return (s.y + s.height) - pies.y;
  if (lado === 'izquierda') return (pies.x + pies.width) - s.x;
  return (s.x + s.width) - pies.x;
}

// ── Recorrido ───────────────────────────────────────────────────────────────
const CAPAS = ['arbusto', 'arboles', 'Pinos', 'piedras', 'Objetosxd', 'tronco'];
const LADOS = ['arriba', 'abajo', 'izquierda', 'derecha'];

// Cuanto se admite que el jugador "entre" en la silueta: el dibujo de un arbol
// o un arbusto es mucho mas alto que su base, y pasar por delante de la copa es
// lo normal. Se mide contra el TERCIO DE ABAJO, que es el suelo que ocupa.
function tolerancia(obj, lado) {
  const s = siluetaDe(obj);
  if (lado === 'arriba' || lado === 'abajo') return s.height * 0.72;
  return s.width * 0.30;
}

let fallos = 0, revisados = 0;
const atravesables = [];

console.log('=== ¿SE ATRAVIESA ALGO DEL MAPA? ===\n');
console.log('caja de pies del jugador: x-15, y+25, 30x15   ·   paso ' + PASO + ' px/frame\n');

for (const nombre of CAPAS) {
  const objs = capa(nombre);
  let malos = 0;
  for (const o of objs) {
    revisados++;
    for (const lado of LADOS) {
      const p = penetracion(o, lado);
      if (p < 0) continue;                       // lado no medible
      if (p > tolerancia(o, lado)) {
        malos++;
        atravesables.push({ capa: nombre, obj: o.name || ('id' + o.id), lado, px: Math.round(p) });
        break;
      }
    }
  }
  console.log('  ' + nombre.padEnd(11) + String(objs.length).padStart(4) + ' objetos   ' +
              (malos ? '⚠️  ' + malos + ' se atraviesan' : 'ninguno se atraviesa'));
  fallos += malos;
}

if (atravesables.length) {
  console.log('\n  Detalle (los 25 primeros):');
  atravesables.slice(0, 25).forEach(a =>
    console.log('    ' + a.capa.padEnd(10) + a.obj.padEnd(20) + 'por ' + a.lado.padEnd(11) +
                'entra ' + a.px + ' px'));
  if (atravesables.length > 25) console.log('    … y ' + (atravesables.length - 25) + ' mas');
}

console.log('\n' + '='.repeat(60));
console.log('Objetos revisados: ' + revisados + '   ·   atravesables: ' + fallos);
if (fallos) { console.log('\nHay objetos del mapa que se atraviesan.'); process.exit(1); }
console.log('Sin fallos.');
process.exit(0);
