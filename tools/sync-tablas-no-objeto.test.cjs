'use strict';
/* (2026-11-19) El centro de control se llenaba de avisos
 *   "🚫 [sync] invoice id=161 tipo="agua" sin itemId → omitiendo"
 * (y oro, plata, exp, vida, comida, cons_parcelas…). No eran fallos: esas facturas son
 * las barras, las monedas, el nivel o lo construido, y viven en la MISMA lista del
 * jugador que sus objetos. `_tipoToItemId` ya las reconocía en silencio, pero quien lo
 * llama (`_addMissingBlockchainItems`) avisaba igual. Desde hoy, además, están las
 * tablas de la cuenta (cta_*): tampoco son objetos.
 *
 * Carga Scenes/LoadingScenegame.js DE VERDAD con un Phaser de mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const avisos = [];
const contexto = {
  console: { log() {}, warn: (...a) => avisos.push(a.join(' ')), error: (...a) => avisos.push(a.join(' ')) },
  Phaser: { Scene: class { constructor() {} } },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {} },
  location: { hostname: 'game.grasslandforest.com', protocol: 'https:', search: '', href: 'https://game.grasslandforest.com/' },
  LoadingSystem: class { constructor() {} },
  setTimeout, clearTimeout, setInterval, clearInterval
};
contexto.window = contexto;
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(BIN, 'Scenes', 'LoadingScenegame.js'), 'utf8'), contexto, { filename: 'LoadingScenegame.js' });
const Clase = contexto.LoadingScenegame;

function escena() {
  const e = Object.create(Clase.prototype);
  const real = new Clase();
  e.ItemDefinitions = real.ItemDefinitions;
  e.TIPO_TO_ITEM_ID = real.TIPO_TO_ITEM_ID;
  e.STATE = { slots: new Array(40).fill(null), quickSlots: new Array(7).fill(null) };
  return e;
}
const facturas = (lista) => new Map(lista.map(([id, tipo, cantidad]) => [id, { id, manualId: 'm' + id, tipo, cantidad, active: true }]));

test('las tablas que no son objetos (barras, monedas, nivel, cuenta…) no avisan ni entran al inventario', () => {
  const e = escena();
  avisos.length = 0;
  const tablas = ['vida', 'agua', 'comida', 'oro', 'plata', 'bronce', 'exp', 'vip', 'nivel', 'nombre', 'cons_parcelas',
    'player_strength', 'cta_tutorial', 'cta_habilidades', 'cta_misiones', 'cta_ranking', 'cta_amigos', 'cta_invitados', 'cta_lands', 'cta_respaldo'];
  const n = e._addMissingBlockchainItems(facturas(tablas.map((t, i) => [161 + i, t, 50])), {});
  assert.equal(n, 0);
  assert.deepEqual(e.STATE.slots.filter(Boolean), []);
  assert.deepEqual([...avisos], [], 'sin ruido en la consola (ni en el centro de control)');
});

test('un tipo de verdad desconocido SÍ sigue avisando, y un objeto real sí entra', () => {
  const e = escena();
  avisos.length = 0;
  const n = e._addMissingBlockchainItems(facturas([[900, 'cosa_que_no_existe', 3], [901, 'hacha de madera', 1]]), {});
  assert.equal(n, 1);
  assert.equal(e.STATE.slots.filter(Boolean)[0].id, 'hacha_de_madera');
  assert.ok(avisos.some((a) => a.includes('cosa_que_no_existe')), 'lo desconocido se sigue viendo');
});
