'use strict';
/* LA VELOCIDAD A PIE (2026-10-18). Bug: "en las tormentas de arena el
 * personaje no puede escapar, y camina lento y sin animación".
 *
 * `loadPlayerData()` (GameScene, heredado por todas) llega DESPUÉS de create()
 * y copia el `speed` guardado en la partida: en muchas cuentas el de antes,
 * 2,7 píxeles por FOTOGRAMA. Las escenas con su propio update() mueven en
 * píxeles por SEGUNDO (`dx * this.speed * seg`): con 2,7 se andaba a 3 px/s,
 * el remolino del desierto ganaba siempre y el paso por fotograma (0,045 px)
 * no llegaba al umbral de _animarJugador (0,05), así que la animación se
 * paraba. Por eso cada escena la repone en cada fotograma, como el pueblo.
 *
 * Las escenas se descubren solas: cualquiera que mueva con
 * `dx * this.speed * seg` entra en la prueba. (GF_ESCENAS cambia la carpeta,
 * para comprobar que la prueba falla con los archivos de antes.) */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BIN = path.resolve(__dirname, '..');
const ESCENAS = process.env.GF_ESCENAS || path.join(BIN, 'Scenes');
const leer = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const MUEVE = /this\.player\.x \+= dx \* this\.speed \* seg/;

const conMovimiento = fs.readdirSync(ESCENAS)
  .filter(n => n.endsWith('.js'))
  .map(n => ({ n, src: leer(path.join(ESCENAS, n)) }))
  .filter(e => MUEVE.test(e.src));

test('se encuentran las escenas que andan por su cuenta', () => {
  const nombres = conMovimiento.map(e => e.n);
  for (const n of ['ZonasScenes.js', 'SalvajeScene.js', 'MinaScene.js', 'LandsScene.js', 'InteriorScene.js']) {
    assert.ok(nombres.includes(n), n + ' ya no mueve con `dx * this.speed * seg`: revisa esta prueba');
  }
});

for (const { n, src } of conMovimiento) {
  test(n + ' repone la velocidad en cada fotograma, justo antes de mover', () => {
    const lineas = src.split('\n');
    const i = lineas.findIndex(l => MUEVE.test(l));
    // Desde el `Math.hypot(dx, dy)` del mismo bloque hasta la línea que mueve.
    let j = i;
    while (j > 0 && !/Math\.hypot\(dx, dy\)/.test(lineas[j])) j--;
    assert.ok(j > 0 && i - j < 40, n + ': no se encuentra el bloque del movimiento');
    const tramo = lineas.slice(j, i).join('\n');
    const m = tramo.match(/this\.speed = (\d+(?:\.\d+)?);/);
    assert.ok(m, n + ': no repone `this.speed` antes de mover; loadPlayerData() deja la guardada (2,7 = 3 px/s)');
    assert.ok(Number(m[1]) >= 100, n + ': ' + m[1] + ' parece una velocidad por fotograma, no por segundo');
  });
}

test('la pantalla de carga no arranca con una velocidad por fotograma', () => {
  const src = leer(path.join(BIN, 'Scenes', 'LoadingScenegame.js'));
  const m = src.match(/this\.speed\s*=\s*(\d+(?:\.\d+)?);/);
  assert.ok(m, 'LoadingScenegame ya no da valor a `speed`: revisa esta prueba');
  assert.ok(Number(m[1]) >= 100, 'LoadingScenegame arranca con speed ' + m[1] + ': si /api/load no trae ninguna, se guarda esa');
});

test('el remolino tira menos de lo que anda el personaje (siempre se escapa)', () => {
  const src = leer(path.join(BIN, 'gf-zonas.js'));
  const m = src.match(/var vel = (\d+(?:\.\d+)?) \+ (\d+(?:\.\d+)?) \* f \* f;/);
  assert.ok(m, 'gf-zonas.js: no se encuentra la fuerza del remolino');
  const maximo = Number(m[1]) + Number(m[2]);
  const zonas = conMovimiento.find(e => e.n === 'ZonasScenes.js');
  const andar = Number(zonas.src.match(/this\.speed = (\d+);\n\s*const seg/)[1]);
  // Con el freno de la savia (×0,55) también tiene que poder salir.
  assert.ok(maximo < andar * 0.55, 'el remolino (' + maximo + ' px/s) puede con el personaje (' + andar + ' px/s)');
});
