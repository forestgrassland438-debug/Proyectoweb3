'use strict';
/* LOS AMBIENTES DAN LA VUELTA SIN CHASQUIDO (2026-11-21).
 *
 * "Que los sonidos de climas funcionen bien." Un ambiente es un archivo corto
 * (de 4 a 12 s) que gf-audio.js repite toda la partida: si su última muestra
 * no enlaza con la primera, se oye un chasquido CADA VEZ que da la vuelta.
 * Pasaba en la nieve, la ventisca, el glaciar, la caverna, el cementerio y en
 * cuatro de los reinos del este. dosVueltas() asentaba la memoria del filtro,
 * pero la vuelta buena oía OTRO ruido que la de calentamiento (el registro de
 * crearRuido no se repite hasta 32 767 refrescos después), así que con un
 * filtro lento la vuelta acababa lejos de donde empezó.
 *
 * La regla: el empalme no puede ser el peor salto del archivo. Se mira lo que
 * suena (los WAV del disco), lo que saldría al regenerarlos (el generador) y
 * que lo uno sea lo otro (que nadie arregle el generador y olvide regenerar).
 *
 *   node --test tools/ambientes-bucle.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BIN = path.resolve(__dirname, '..');
const MUSIC = path.join(BIN, 'Game', 'MUSIC');

// Los que reparten sus gotas, hojas o pájaros con Math.random: salen distintos
// cada vez que se generan y no se pueden comparar con el disco (escrito a mano).
const CON_AZAR = ['amb_lluvia.wav', 'amb_arboles.wav', 'amb_soleado.wav', 'amb_desierto.wav'];

/** Las muestras de un WAV PCM de 8 bits mono (buscando el trozo `data`). */
function muestrasWav(ruta) {
  const b = fs.readFileSync(ruta);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', ruta);
  assert.equal(b.toString('ascii', 8, 12), 'WAVE', ruta);
  let p = 12, fmt = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), tam = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { canales: b.readUInt16LE(p + 10), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') {
      assert.ok(fmt && fmt.canales === 1 && fmt.bits === 8, ruta + ': 8 bits mono');
      return b.subarray(p + 8, p + 8 + tam);
    }
    p += 8 + tam + (tam & 1);
  }
  return assert.fail(ruta + ': sin datos');
}

/** El salto de la última muestra a la primera y el mayor salto entre dos vecinas de dentro. */
function empalme(m) {
  let maximo = 0;
  for (let i = 1; i < m.length; i++) maximo = Math.max(maximo, Math.abs(m[i] - m[i - 1]));
  return { salto: Math.abs(m[0] - m[m.length - 1]), maximo };
}

/** Math.random con semilla mientras dura `fn`: la prueba da lo mismo cada vez. */
function conSemilla(semilla, fn) {
  const real = Math.random;
  let s = semilla >>> 0;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  try { return fn(); } finally { Math.random = real; }
}

/** Cada ambiente del catálogo, generado en memoria (dos veces: así se sabe si depende del azar). */
let generadosYa = null;
function generados() {
  if (generadosYa) return generadosYa;
  const G = require('./generar-sonidos.js');
  generadosYa = G.CATALOGO.filter(([n]) => /^amb_/.test(n)).map(([nombre, hacer]) => {
    const a = conSemilla(7, hacer), b = conSemilla(99991, hacer);
    const determinista = a.buf.length === b.buf.length && a.buf.every((v, i) => v === b.buf[i]);
    return { nombre, buf: a.buf, determinista };
  });
  return generadosYa;
}

test('los ambientes que suenan (Game/MUSIC/amb_*.wav) dan la vuelta sin chasquido', () => {
  const archivos = fs.readdirSync(MUSIC).filter((n) => /^amb_.*\.wav$/.test(n)).sort();
  for (const g of generados()) assert.ok(archivos.includes(g.nombre), g.nombre + ': está en el catálogo y no en Game/MUSIC');
  const malos = [];
  for (const n of archivos) {
    const e = empalme(muestrasWav(path.join(MUSIC, n)));
    if (e.salto > e.maximo) malos.push(n + ': el empalme salta ' + e.salto + ' niveles y dentro nunca más de ' + e.maximo);
  }
  assert.deepEqual(malos, []);
});

test('el generador: cada ambiente del catálogo empalma consigo mismo', () => {
  const lista = generados();
  assert.ok(lista.length >= 22, 'ambientes en el catálogo: ' + lista.length);
  const malos = [];
  for (const g of lista) {
    const e = empalme(g.buf);
    if (e.salto > e.maximo) malos.push(g.nombre + ': empalme ' + e.salto.toFixed(4) + ' > ' + e.maximo.toFixed(4));
  }
  assert.deepEqual(malos, []);
});

test('lo que suena es lo que sale del generador de hoy (salvo el temblor de ±1 nivel)', () => {
  const comparados = [];
  for (const g of generados()) {
    if (!g.determinista) {
      assert.ok(CON_AZAR.includes(g.nombre), g.nombre + ': ahora depende de Math.random y ya no se compara con el disco');
      continue;
    }
    // Recta de mínimos cuadrados del disco frente al generador (el volumen y la continua
    // los pone guardar()); lo que sobra tiene que ser solo el redondeo y el temblor.
    const x = muestrasWav(path.join(MUSIC, g.nombre)), y = g.buf;
    assert.equal(x.length, y.length, g.nombre + ': la misma duración');
    let mx = 0, my = 0;
    for (let i = 0; i < y.length; i++) { mx += x[i]; my += y[i]; }
    mx /= y.length; my /= y.length;
    let sxy = 0, syy = 0;
    for (let i = 0; i < y.length; i++) { sxy += (x[i] - mx) * (y[i] - my); syy += (y[i] - my) * (y[i] - my); }
    const k = sxy / syy;
    let peor = 0;
    for (let i = 0; i < y.length; i++) peor = Math.max(peor, Math.abs(x[i] - mx - k * (y[i] - my)));
    assert.ok(peor <= 1.5, g.nombre + ': el disco se aparta ' + peor.toFixed(1) + ' niveles de lo que genera tools/generar-sonidos.js (¿falta regenerarlo?)');
    comparados.push(g.nombre);
  }
  assert.ok(comparados.length >= 18, 'comparados con el disco: ' + comparados.length);
});
