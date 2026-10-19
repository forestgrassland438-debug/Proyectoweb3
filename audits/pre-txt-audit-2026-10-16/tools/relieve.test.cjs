'use strict';
/* EL RELIEVE 2.5D (gf-relieve.js, 2026-10-12): el volumen que se pone a los
 * personajes, la mascota y los NPC al cargar su textura. Se prueba el código
 * REAL en una vm: a qué claves se aplica, que no cambia la silueta (alfa) ni
 * el contorno, que no deja motas sueltas y que es determinista. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargar() {
  const ctx = { console, Math, Float64Array, Int8Array, Uint8Array, WeakSet,
                setInterval: () => 0, clearInterval: () => {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gf-relieve.js'), 'utf8'), ctx);
  return ctx.GFRelieve;
}

/** Un muñeco de 20x30: contorno negro, cabeza clara, cuerpo azul con un
    brazo separado por una línea, sobre fondo transparente. */
function muneco() {
  const w = 20, h = 30, px = new Uint8ClampedArray(w * h * 4);
  const pon = (x, y, c) => { const o = (y * w + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
  for (let y = 2; y < 28; y++) for (let x = 3; x < 17; x++) pon(x, y, [0, 0, 0]);
  for (let y = 3; y < 12; y++) for (let x = 4; x < 16; x++) pon(x, y, [240, 200, 170]);
  for (let y = 13; y < 27; y++) for (let x = 4; x < 16; x++) pon(x, y, [60, 90, 200]);
  for (let y = 15; y < 26; y++) pon(7, y, [0, 0, 0]);          // la línea del brazo
  return { px, w, h };
}

test('a qué texturas: personajes, mascota, NPC, árboles y casas; rocas, pozo y monstruos no', () => {
  const R = cargar();
  for (const k of ['player', 'player_down_1', 'player_left_7', 'sb_personaje3_player_right_2',
                   'gfp_personaje1_down_3', 'perro_derecha_1', 'NPCmago', 'bz_esp_perro_d_1',
                   'pinos_png', 'arbol_png', 'arbustos_png', 'arbusto_formado3_png', 'tronco_pinos_png',
                   'tronco_acostado_1png', 'sv_arbol_abedul', 'casa_tienda_png', 'molino_png',
                   'arbolxd', 'estatua_gato_png', 'postas_encendido_png', 'pilar_portal2_png']) {
    assert.equal(R.claveValida(k), true, k);
  }
  // Las rocas no se tocan (lo pidió el usuario), el pozo tampoco (gf-animales
  // mide el azul de su agua) y los monstruos y animales ya van en 3D.
  for (const k of ['__sb_tmp_1__player_down_1', 'imagen_Perfil', 'gfm_zombi_a', 'tiles', 'arbol', 'playerX',
                   'bz_esp_zorro_camina_1', 'piedras_1png', 'pozo_png', 'gfa_vaca_quieto_1', 'flor_formado1_png']) {
    assert.equal(R.claveValida(k), false, k);
  }
});

test('con menos fuerza, el relieve cambia menos (las casas)', () => {
  const R = cargar();
  const a = muneco(), b = muneco(), base = muneco();
  R._interno.relieve(a.px, a.w, a.h, { fuerza: 1 });
  R._interno.relieve(b.px, b.w, b.h, { fuerza: 0.6 });
  let da = 0, db = 0;
  for (let i = 0; i < base.px.length; i++) { da += Math.abs(a.px[i] - base.px[i]); db += Math.abs(b.px[i] - base.px[i]); }
  assert.ok(db < da * 0.75 && db > 0, 'fuerza 0.6 = ' + db + ' frente a ' + da);
});

test('no cambia la silueta ni el contorno, y da luz y sombra', () => {
  const R = cargar();
  const { px, w, h } = muneco();
  const antes = Uint8ClampedArray.from(px);
  R._interno.relieve(px, w, h);
  let claros = 0, oscuros = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    assert.equal(px[o + 3], antes[o + 3], 'el alfa no cambia');
    const lum = (0.299 * antes[o] + 0.587 * antes[o + 1] + 0.114 * antes[o + 2]) / 255;
    if (antes[o + 3] && lum < 0.13) {
      assert.deepEqual([px[o], px[o + 1], px[o + 2]], [antes[o], antes[o + 1], antes[o + 2]], 'el contorno no cambia');
    }
    const s0 = antes[o] + antes[o + 1] + antes[o + 2], s1 = px[o] + px[o + 1] + px[o + 2];
    if (s1 > s0 + 6) claros++;
    if (s1 < s0 - 6) oscuros++;
  }
  assert.ok(claros > 10 && oscuros > 10, 'hay lado de luz y lado de sombra: ' + claros + '/' + oscuros);
});

test('sin motas: ningún píxel de relleno distinto de sus cuatro vecinos de su color', () => {
  const R = cargar();
  const { px, w, h } = muneco();
  const antes = Uint8ClampedArray.from(px);
  R._interno.relieve(px, w, h);
  const clave = (i) => px[i * 4] + ',' + px[i * 4 + 1] + ',' + px[i * 4 + 2];
  const base = (i) => antes[i * 4] + ',' + antes[i * 4 + 1] + ',' + antes[i * 4 + 2];
  let sueltos = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!antes[i * 4 + 3]) continue;
    const vec = [i - 1, i + 1, i - w, i + w].filter((j) => antes[j * 4 + 3] && base(j) === base(i));
    if (vec.length === 4 && vec.every((j) => clave(j) !== clave(i)) && new Set(vec.map(clave)).size === 1) sueltos++;
  }
  assert.equal(sueltos, 0);
});

/** Una casa de 40x40: tejado a dos aguas azul (dos faldones separados por una
    viga), pared de piedra con juntas y una ventana con cristal. */
function casita() {
  const w = 40, h = 40, px = new Uint8ClampedArray(w * h * 4);
  const pon = (x, y, c) => { const o = (y * w + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
  for (let y = 0; y < 18; y++) {
    for (let x = 2; x <= 19; x++) if (y >= 2 + (19 - x) * 0.8) pon(x, y, [62, 72, 108]);   // faldón izquierdo
    for (let x = 21; x <= 37; x++) if (y >= 2 + (x - 21) * 0.8) pon(x, y, [62, 72, 108]);  // faldón derecho
    pon(20, y, [120, 40, 50]);                                                              // la viga
  }
  for (let y = 18; y < 38; y++) for (let x = 4; x < 36; x++) pon(x, y, (y - 18) % 5 === 4 ? [20, 20, 20] : [170, 160, 150]);
  for (let y = 24; y < 32; y++) for (let x = 10; x < 20; x++) pon(x, y, [20, 20, 20]);       // el marco
  for (let y = 25; y < 31; y++) for (let x = 11; x < 19; x++) pon(x, y, [110, 160, 210]);    // el cristal
  return { px, w, h };
}

test('casas: el faldón de la luz se aclara, el otro se oscurece; sombra bajo el tejado y cristal hundido', () => {
  const R = cargar();
  assert.equal(R.claveValida('casa_npc1_png'), true);
  const { px, w, h } = casita();
  const antes = Uint8ClampedArray.from(px);
  R._interno.relieveCasa(px, w, h, { fuerza: 1 });
  const suma = (a, x, y) => { const o = (y * w + x) * 4; return a[o] + a[o + 1] + a[o + 2]; };
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    assert.equal(px[o + 3], antes[o + 3], 'el alfa no cambia');
    const lum = (0.299 * antes[o] + 0.587 * antes[o + 1] + 0.114 * antes[o + 2]) / 255;
    if (antes[o + 3] && lum < 0.13) assert.deepEqual([px[o], px[o + 1], px[o + 2]], [antes[o], antes[o + 1], antes[o + 2]], 'las líneas no cambian');
  }
  assert.ok(suma(px, 12, 14) > suma(antes, 12, 14), 'el faldón izquierdo mira a la luz');
  assert.ok(suma(px, 28, 14) < suma(antes, 28, 14), 'el derecho queda en sombra');
  assert.ok(suma(px, 8, 18) < suma(antes, 8, 18) - 30, 'la pared bajo el tejado, en sombra');
  assert.ok(suma(px, 14, 25) < suma(px, 14, 28), 'el cristal, más oscuro bajo el marco');
  const otra = casita();
  R._interno.relieveCasa(otra.px, w, h, { fuerza: 1 });
  assert.deepEqual(Array.from(otra.px), Array.from(px), 'determinista');
});

test('determinista', () => {
  const R = cargar();
  const a = muneco(), b = muneco();
  R._interno.relieve(a.px, a.w, a.h);
  R._interno.relieve(b.px, b.w, b.h);
  assert.deepEqual(Array.from(a.px), Array.from(b.px));
});
