'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), acorn = require('acorn');
const source = fs.readFileSync('C:/Users/pc/Desktop/server2.js', 'utf8'), ast = acorn.parse(source, { ecmaVersion: 'latest' });
test('el endpoint antiguo no permite inventar ni restar monedas desde el navegador', async () => {
  const route = ast.body.find(n => n.expression?.callee?.object?.name === 'app' && n.expression.arguments?.[0]?.value === '/api/stats/:playerName/update');
  const fn = route.expression.arguments.at(-1), money = { oro: 7, plata: 8, bronce: 9 };
  let writes = 0;
  const address = '0x' + 'a'.repeat(40);
  const context = vm.createContext({ resolvePlayerName: async n => n, STAT_TYPES_LIST: ['oro', 'plata', 'bronce', 'exp'],
    GamePlayer: { findOne: () => ({ lean: async () => ({ address }) }) },
    PlayerStats: { findOne: () => ({ lean: async () => ({ ...money }) }), updateOne: async () => { writes++; } },
    buildStatsResponse: x => x, console });
  const handler = vm.runInContext('(' + source.slice(fn.start, fn.end) + ')', context);
  for (const stats of [{ oro: 99999999, plata: 99999999, bronce: 99999999 }, { oro: 0, plata: 0, bronce: 0 }]) {
    let result;
    await handler({ params: { playerName: 'Ana' }, body: { stats }, user: { address } }, { json: d => { result = d; }, status() { return this; } });
    assert.deepEqual(JSON.parse(JSON.stringify(result.stats)), money);
    assert.equal(result.monedasAutoritativas, true);
  }
  assert.equal(writes, 0);
});
test('el relay tampoco puede acuñar ni borrar las tablas de monedas del jugador', async () => {
  const klass = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'RelayManager');
  const method = klass.body.body.find(n => n.key.name === 'blockClientServerTables');
  const context = vm.createContext({ TABLAS_SOLO_SERVIDOR: new Set(['oro', 'plata', 'bronce']), TABLAS_SOLO_ACUNA_SERVIDOR: new Set() });
  const check = vm.runInContext('({' + source.slice(method.start, method.end) + '}).blockClientServerTables', context);
  for (const tipo of ['oro', 'plata', 'bronce']) {
    const contract = { getInvoice: async () => ({ tipo }) };
    await assert.rejects(() => check(contract, 'createInvoice', ['0xabc', tipo, 99999, 'free']), /server_table_blocked/);
    await assert.rejects(() => check(contract, 'increaseInvoiceQuantity', [1, 99999]), /server_table_blocked/);
    await assert.rejects(() => check(contract, 'deleteInvoice', [1]), /server_table_blocked/);
  }
});
