/* ¿Pide gf-audio algun WAV que no existe? ¿Y sobra alguno?
 *
 * El modulo esta hecho para que un archivo que falte sea un silencio y no un
 * juego roto, asi que un fallo aqui NO rompe nada — pero es un sonido que el
 * jugador no oye nunca y que nadie se entera de que falta.
 *
 *   node tools/sonidos-prueba-catalogo.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2] || '.';

// Se carga gf-audio en un entorno de mentira solo para leerle el catalogo.
const ctx = {
  console: { log() {}, warn() {}, error() {} },
  Math, Date, JSON, Object, Array, Number, String, Boolean,
  isFinite, parseFloat, parseInt, Infinity, NaN, Error, RegExp,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: { createElement: () => ({ getContext: () => null }) },
  fetch: () => Promise.reject(new Error('sin red'))
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-audio.js'), 'utf8'), ctx, {});

const A = ctx.GFAudio;
let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '\n         ' + x : '')); } };

const I = A && A._interno;
if (!I || !I.listaDe) {
  console.log('gf-audio no expone _interno.listaDe: no se puede comprobar el catalogo.');
  process.exit(0);
}

const enDisco = new Set(
  fs.readdirSync(path.join(BIN, 'Game/MUSIC'))
    .filter((f) => f.toLowerCase().endsWith('.wav'))
    .map((f) => f.replace(/\.wav$/i, ''))
);

for (const tipo of ['campo', 'tienda']) {
  console.log('\n=== catalogo de "' + tipo + '" ===');
  const pide = I.listaDe(tipo);
  const faltan = pide.filter((n) => !enDisco.has(n));
  console.log('  pide ' + pide.length + ' sonidos; en disco hay ' + enDisco.size);
  ok(faltan.length === 0,
     'no pide ningun WAV que no exista',
     faltan.length ? 'faltan: ' + faltan.join(', ') : '');

  const esenciales = I.esenciales ? I.esenciales(tipo) : [];
  const faltanEse = esenciales.filter((n) => !enDisco.has(n));
  ok(faltanEse.length === 0,
     'los esenciales estan todos',
     faltanEse.length ? 'faltan: ' + faltanEse.join(', ') : '');
}

// Los que el modulo compone a mano (rayo_N, chispa_N, an_voz_N): se comprueba
// que cada numero prometido tenga su archivo.
console.log('\n=== los que se numeran (voces y rayos) ===');
const sinArchivo = [];
if (I.VOCES) {
  for (const voz in I.VOCES) {
    for (let i = 1; i <= I.VOCES[voz]; i++) {
      const n = 'an_' + voz + '_' + i;
      if (!enDisco.has(n)) sinArchivo.push(n);
    }
  }
}
if (I.RAYOS) {
  for (const fam in I.RAYOS) {
    for (let i = 1; i <= I.RAYOS[fam]; i++) {
      const n = fam + '_' + i;
      if (!enDisco.has(n)) sinArchivo.push(n);
    }
  }
}
ok(sinArchivo.length === 0,
   'todas las variantes numeradas tienen archivo',
   sinArchivo.length ? 'faltan: ' + sinArchivo.join(', ') : '');

// Y al reves: WAV en disco que el modulo no pide nunca (pueden ser del juego
// viejo, y entonces no es un fallo; solo se informa).
const pideTodo = new Set([...I.listaDe('campo'), ...I.listaDe('tienda')]);
const huerfanos = [...enDisco].filter((n) => !pideTodo.has(n));
console.log('\n=== informativo ===');
console.log('  WAV en disco que gf-audio NO pide (' + huerfanos.length + '): ' +
            (huerfanos.join(', ') || 'ninguno'));

// Y que cada voz declarada tenga una especie que la use, y al reves.
console.log('\n=== coherencia de las voces ===');
const vocesUsadas = new Set(Object.values(I.VOZ_DE || {}));
const declaradas = new Set(Object.keys(I.VOCES || {}));
const sinUsar = [...declaradas].filter((v) => !vocesUsadas.has(v));
const sinDeclarar = [...vocesUsadas].filter((v) => !declaradas.has(v));
ok(sinDeclarar.length === 0,
   'toda especie apunta a una voz que existe',
   sinDeclarar.length ? 'voces sin declarar: ' + sinDeclarar.join(', ') : '');
console.log('  voces declaradas que ninguna especie del mapa usa: ' +
            (sinUsar.join(', ') || 'ninguna') + '  (buho y cuervo llegan por su modulo)');

console.log('\n' + '='.repeat(56));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
