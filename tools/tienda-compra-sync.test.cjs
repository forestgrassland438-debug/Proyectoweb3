'use strict';
/* LO QUE SE COMPRA EN LA TIENDA SOBREVIVE AL VOLVER AL MAPA.     (2026-10-09)
 *
 * Fallo real: "compro algo en la tienda, me lo da, y al salir a GameScene se
 * me quita". La compra SÍ llegaba a la blockchain; lo que fallaba era la
 * sincronización de LoadingScenegame al volver al mapa: el `tipo` con el que
 * la tienda crea la factura ("bolsa zanahorias", "bolsa de tomates"…) no se
 * sabía traducir de vuelta a la clave del juego (Semillax…), y
 * `_reconciliarCasillas` vaciaba la casilla por "no tener factura".
 *
 * Esta prueba carga los fuentes DE VERDAD:
 *   1. todo `tipo` de los catálogos que escriben en la cadena (tienda y mapa)
 *      se traduce de vuelta a SU objeto;
 *   2. una semilla recién comprada (idx = factura, idm = manualId) se queda en
 *      su casilla tras la sincronización;
 *   3. una factura de semillas que no está en ninguna casilla se repone;
 *   4. una casilla que apunta exactamente a una factura viva no se borra
 *      aunque el `tipo` sea desconocido.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { sinComentarios } = require('./_sin-comentarios');

const ROOT = path.join(__dirname, '..');

function cargarLoading() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Phaser: { Scene: class { constructor() {} } },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
    location: { hostname: 'game.grasslandforest.com', protocol: 'https:', search: '', href: 'https://game.grasslandforest.com/' },
    LoadingSystem: class { constructor() {} },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Scenes/LoadingScenegame.js'), 'utf8'), ctx, { filename: 'LoadingScenegame.js' });
  return ctx.LoadingScenegame;
}

/** El objeto literal `this.ItemDefinitions = {…}` de un fuente. */
function catalogo(rel) {
  const s = sinComentarios(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const i = s.search(/this\.ItemDefinitions\s*=\s*\{/);
  assert.ok(i >= 0, 'sin catálogo en ' + rel);
  const j = s.indexOf('{', i);
  let nivel = 0, k = j;
  for (; k < s.length; k++) {
    if (s[k] === '{') nivel++;
    else if (s[k] === '}') { nivel--; if (nivel === 0) break; }
  }
  return vm.runInNewContext('(' + s.slice(j, k + 1) + ')');
}

const Loading = cargarLoading();

function escena() {
  const real = new Loading();
  const e = Object.create(Loading.prototype);
  e.ItemDefinitions = real.ItemDefinitions;
  e.TIPO_TO_ITEM_ID = real.TIPO_TO_ITEM_ID;
  e.STATE = { slots: new Array(40).fill(null), quickSlots: new Array(7).fill(null) };
  return e;
}

test('todo tipo on-chain de la tienda y del mapa vuelve a su objeto', () => {
  const e = escena();
  for (const rel of ['Scenes/tiendajuego.js', 'Scenes/GameScene.js']) {
    const defs = catalogo(rel);
    for (const [clave, def] of Object.entries(defs)) {
      if (!def.tipo) continue;
      assert.equal(e._tipoToItemId(def.tipo), clave,
        `${rel}: "${clave}" se crea en la cadena como "${def.tipo}" y no se traduce de vuelta`);
    }
  }
});

test('una semilla recién comprada se queda en su casilla tras sincronizar', () => {
  const e = escena();
  e.STATE.slots[3] = { id: 'Semillax', idx: 501, idm: 'Ab3dEfGh1jKlMnOpQr9', count: 10 };
  e.STATE.quickSlots[0] = { id: 'Semillax4', idx: 502, idm: 'Zz9yXw8vUt7sRq6pOn5', count: 5 };
  const cadena = new Map([
    [501, { id: 501, manualId: 'Ab3dEfGh1jKlMnOpQr9', tipo: 'bolsa zanahorias', cantidad: 10, active: true }],
    [502, { id: 502, manualId: 'Zz9yXw8vUt7sRq6pOn5', tipo: 'bolsa_de_fresas', cantidad: 5, active: true }]
  ]);
  e._reconciliarCasillas(cadena);
  assert.deepEqual(e.STATE.slots[3], { id: 'Semillax', idx: 501, idm: 'Ab3dEfGh1jKlMnOpQr9', count: 10 });
  assert.deepEqual(e.STATE.quickSlots[0], { id: 'Semillax4', idx: 502, idm: 'Zz9yXw8vUt7sRq6pOn5', count: 5 });
  assert.equal(e._addMissingBlockchainItems(cadena, {}), 0, 'no se duplica lo que ya está');
});

test('una factura de semillas sin casilla se repone en el inventario', () => {
  const e = escena();
  const cadena = new Map([
    [610, { id: 610, manualId: 'QwErTyUiOpAsDfGhJkL', tipo: 'bolsa de trigo', cantidad: 7, active: true }]
  ]);
  e._reconciliarCasillas(cadena);
  assert.equal(e._addMissingBlockchainItems(cadena, {}), 1);
  // JSON: el hueco lo crea el código del vm, con otro Object.prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(e.STATE.slots[0])),
    { id: 'Semillax2', idx: 610, idm: 'QwErTyUiOpAsDfGhJkL', count: 7 });
});

test('id y manualId exactos con un tipo desconocido: se conserva, solo cambia la cantidad', () => {
  const e = escena();
  e.STATE.slots[8] = { id: 'hacha_de_cobre', idx: 700, idm: 'MnBvCxZlKjHgFdSaPoI', count: 1 };
  const cadena = new Map([
    [700, { id: 700, manualId: 'MnBvCxZlKjHgFdSaPoI', tipo: 'tabla_que_este_catalogo_no_conoce', cantidad: 2, active: true }]
  ]);
  e._reconciliarCasillas(cadena);
  assert.deepEqual(e.STATE.slots[8], { id: 'hacha_de_cobre', idx: 700, idm: 'MnBvCxZlKjHgFdSaPoI', count: 2 });
});

test('una casilla sin ninguna factura detrás sí se limpia (la cadena manda)', () => {
  const e = escena();
  e.STATE.slots[1] = { id: 'Semillax', idx: 999, idm: 'NoExisteEnLaCadena1', count: 3 };
  e._reconciliarCasillas(new Map());
  assert.equal(e.STATE.slots[1], null);
});

test('las tablas que no son objetos no se enlazan aunque coincidan id y manualId', () => {
  const e = escena();
  e.STATE.slots[2] = { id: 'palo', idx: 42, idm: 'vida-manual', count: 1 };
  e._reconciliarCasillas(new Map([[42, { id: 42, manualId: 'vida-manual', tipo: 'vida', cantidad: 9000, active: true }]]));
  assert.equal(e.STATE.slots[2], null);
});
