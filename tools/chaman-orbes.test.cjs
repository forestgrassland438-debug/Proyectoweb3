'use strict';
/* EL CHAMÁN DE LA SELVA LANZA MAGIA, NO FLECHAS (2026-11-23).
 * "En la jungla los magos tiran flechas, ¿ellos deberían tener arco o vara?"
 * El chamán lleva un BÁCULO con un cristal verde (tools/generar-reinos-criaturas.py,
 * RECETA_CHAMAN) pero disparaba dardos con plumas (efectos/dardo.png: una
 * flecha). Ahora lanza orbes de magia verdes: redondos, que no se giran como
 * una flecha, con su brillo, y que nacen arriba, en el cristal del báculo, y
 * bajan a la altura a la que vuelan (la del golpe, que no cambia). Su ataque de
 * siempre (tres) y su poder (el abanico de cinco). La araña de verdad sigue
 * escupiendo espinas.
 *
 *   node --test tools/chaman-orbes.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { leerPNG } = require('./leer-png.cjs');

const BIN = path.resolve(__dirname, '..');

function cargar(archivo, extra) {
  const ctx = Object.assign({ console: { log() {}, warn() {}, error: console.error }, Math, Date, JSON, Promise, setTimeout, clearTimeout }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, archivo), 'utf8'), ctx);
  return ctx;
}
const ARTE = cargar('gf-monstruos-arte.js');
const SV = cargar('gf-salvaje.js', { GFMonstruosArte: { anim: (a, b) => a + '_' + b }, Phaser: { BlendModes: { ADD: 1, NORMAL: 0 } } });
const I = SV.GFSalvaje._interno;
const CHAMAN = I.ESPECIES.chaman_selva;

/** La ruta de una clave de las piezas sueltas de GFMonstruosArte. */
function archivoDe(clave) {
  const src = fs.readFileSync(path.join(BIN, 'gf-monstruos-arte.js'), 'utf8');
  const m = src.match(new RegExp('\\b' + clave + ":\\s*'([^']+)'"));
  return m ? path.join(BIN, 'Game', 'Sprites', 'monstruos', m[1]) : null;
}

function mundo(def) {
  const creados = [], pendientes = [];
  const sprite = (x, y, key) => {
    const s = { x, y, key, rot: 0, sx: 1, sy: 1, alpha: 1, depth: 0, blend: 0, tint: null, scene: { anims: { exists: () => false } }, anims: { isPlaying: false },
      setScale(a, b) { this.sx = a; this.sy = b === undefined ? a : b; return this; },
      setRotation(r) { this.rot = r; return this; }, setDepth(d) { this.depth = d; return this; },
      setAlpha(a) { this.alpha = a; return this; }, setBlendMode(b) { this.blend = b; return this; },
      setTint(t) { this.tint = t; return this; }, setPosition(px, py) { this.x = px; this.y = py; return this; },
      setVisible() { return this; }, setOrigin() { return this; }, setFlipX() { return this; }, play() { return this; },
      destroy() { this.scene = null; this.destruido = true; } };
    creados.push(s);
    return s;
  };
  const scene = {
    time: { now: 10000, delayedCall(ms, fn) { pendientes.push(fn); return { remove() {} }; } },
    add: { image: (x, y, k) => sprite(x, y, k) },
    textures: { exists: () => true },
    tweens: { add() {}, addCounter() {}, killTweensOf() {} },
    player: { x: 99999, y: 99999 },                 // lejos: nadie recibe el golpe
    map: { widthInPixels: 1e6, heightInPixels: 1e6 }
  };
  const st = { scene, vivo: true, proyectiles: [], efimeros: [], charcos: [], ultimoGolpe: 0 };
  const m = { x: 2000, y: 2000, def, spr: sprite(2000, 2000, def.arte), vivo: true, dir: 'right', tipo: 'x' };
  return { st, m, scene, creados, disparar: () => { while (pendientes.length) pendientes.shift()(); } };
}

test('el arte: el proyectil del chamán es un orbe verde y redondo (no la flecha de los dardos)', () => {
  const clave = CHAMAN.tex && CHAMAN.tex.espina;
  assert.ok(clave && clave !== 'gfm_dardo', 'el chamán no dispara dardos (' + clave + ')');
  const ruta = archivoDe(clave);
  assert.ok(ruta && fs.existsSync(ruta), clave + ' registrado en gf-monstruos-arte.js y con su PNG');
  const png = leerPNG(ruta);
  assert.equal(png.ancho, png.alto, 'redondo, no alargado como una flecha');
  let verde = 0, otro = 0;
  for (let y = 0; y < png.alto; y++) for (let x = 0; x < png.ancho; x++) {
    const [r, g, b, a] = png.rgba(x, y);
    if (a < 128) continue;
    if (g > r && g > b) verde++; else otro++;
  }
  assert.ok(verde > otro * 2, 'verde como el cristal de su báculo (' + verde + ' frente a ' + otro + ')');
  // Y se carga en la selva: es la `espina` de su molde.
  assert.equal(CHAMAN.molde, 'arana');
});

function comprobarOrbes(w, cuantos, quien) {
  const { st, m, creados } = w;
  const orbes = st.proyectiles.slice();                 // una copia: al acabar, la lista se vacía
  assert.equal(orbes.length, cuantos, quien + ': ' + cuantos + ' orbes');
  for (const b of orbes) {
    assert.equal(b.spr.key, CHAMAN.tex.espina, quien + ': con la textura del orbe');
    assert.equal(b.spr.rot, 0, quien + ': un orbe no se gira hacia donde va, como una flecha');
    assert.ok(b.brillo && b.brillo.blend === 1 && creados.includes(b.brillo), quien + ': con su brillo (aditivo)');
  }
  // Nace en el cristal del báculo (arriba, a la altura de la cabeza) y baja a su línea de vuelo.
  I.actualizarProyectiles(st, w.scene.time.now, 0, { x: 99999, y: 99999 });
  for (const b of orbes) {
    assert.ok(b.spr.y <= m.y - 90, quien + ': nace arriba, en el báculo (' + (b.spr.y - m.y) + ')');
    assert.ok(Math.abs(b.brillo.y - b.spr.y) < 0.01, quien + ': y su brillo nace con él');
  }
  I.actualizarProyectiles(st, w.scene.time.now + 320, 0, { x: 99999, y: 99999 });
  for (const b of orbes) {
    assert.ok(Math.abs(b.spr.y - b.y) < 0.01, quien + ': ya vuela a la altura del golpe');
    assert.ok(Math.abs(b.brillo.x - b.spr.x) < 0.01 && Math.abs(b.brillo.y - b.spr.y) < 0.01, quien + ': el brillo va con él');
  }
  // Al acabar su vida se van los dos (orbe y brillo).
  I.actualizarProyectiles(st, w.scene.time.now + 5000, 0, { x: 99999, y: 99999 });
  assert.equal(st.proyectiles.length, 0);
  for (const b of orbes) assert.ok(b.spr.destruido && b.brillo.destruido, quien + ': no quedan restos (ni el orbe ni su brillo)');
}

test('su ataque de siempre: tres orbes', () => {
  const w = mundo(CHAMAN);
  I.aranaEspinas(w.st, w.m, w.m.x + 34, w.m.y - 30, 0.4);
  w.disparar();
  comprobarOrbes(w, 3, 'ataque');
});

test('su poder (el abanico): cinco orbes', () => {
  const w = mundo(CHAMAN);
  I.pxDardos(w.st, w.m, { bx: w.m.x + 30, by: w.m.y - 34, a: 0.2 });
  w.disparar();
  comprobarOrbes(w, 5, 'poder');
});

test('la araña de verdad sigue escupiendo espinas que miran hacia donde van', () => {
  const arana = Object.values(I.ESPECIES).find((d) => d.molde === 'arana' && !d.humanoide);
  assert.ok(arana, 'hay una araña');
  const w = mundo(arana);
  I.aranaEspinas(w.st, w.m, w.m.x + 34, w.m.y - 30, 0.4);
  w.disparar();
  assert.equal(w.st.proyectiles.length, 3);
  for (const b of w.st.proyectiles) { assert.notEqual(b.spr.rot, 0); assert.ok(!b.brillo); }
});
