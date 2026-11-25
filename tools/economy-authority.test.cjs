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
test('(2026-11-19) las tablas de la cuenta (cta_*) tampoco: ni crear, ni subir, ni bajar, ni pasar', async () => {
  const klass = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'RelayManager');
  const method = klass.body.body.find(n => n.key.name === 'blockClientServerTables');
  // Solo las de monedas en la lista: las cta_ se cierran por su prefijo.
  const context = vm.createContext({ TABLAS_SOLO_SERVIDOR: new Set(['oro']), TABLAS_SOLO_ACUNA_SERVIDOR: new Set() });
  const check = vm.runInContext('({' + source.slice(method.start, method.end) + '}).blockClientServerTables', context);
  for (const tipo of ['cta_tutorial', 'cta_habilidades', 'cta_amigos', 'cta_invitados', 'cta_lands', 'cta_respaldo', 'cta_lo_que_venga']) {
    const contract = { getInvoice: async () => ({ tipo }) };
    await assert.rejects(() => check(contract, 'createInvoice', ['0xabc', tipo, 22, 'tu:0xabc']), /server_table_blocked/, tipo);
    await assert.rejects(() => check(contract, 'increaseInvoiceQuantity', [1, 99]), /server_table_blocked/, tipo);
    await assert.rejects(() => check(contract, 'decreaseInvoiceQuantity', [1, 1]), /server_table_blocked/, tipo);
    await assert.rejects(() => check(contract, 'transferQuantityBetweenInvoices', [1, 2, 1]), /server_table_blocked/, tipo);
  }
  // Un objeto normal sigue pasando.
  await check({ getInvoice: async () => ({ tipo: 'bolsa zanahorias' }) }, 'decreaseInvoiceQuantity', [1, 1]);
});
test('(2026-11-19) GET /api/missions/:jugador existe y solo devuelve las misiones de su dueño', async () => {
  const route = ast.body.find(n => n.expression?.callee?.object?.name === 'app' && n.expression.callee.property?.name === 'get' &&
    n.expression.arguments?.[0]?.value === '/api/missions/:playerName');
  assert.ok(route, 'la tienda y el mapa la piden en cada carga; sin ella el centro de control se llena de 404');
  const fn = route.expression.arguments.at(-1);
  const docs = { Ana: { playerName: 'Ana', misionesCompletadas: 7, misiones_granjero: 5, misiones_guardian: 2, estadomision: 1, misionesEnProgreso: 0, misionesFallidas: 0, estadomision1: 0 } };
  const context = vm.createContext({ console,
    resolvePlayerName: async (n) => n,
    requireOwner: async (req, res, n) => { if (req.user.playerName === n) return true; res.status(403).json({ error: 'Forbidden' }); return false; },
    MissionsPlayer: { findOne: (q) => ({ lean: async () => docs[q.playerName] || null }) } });
  const handler = vm.runInContext('(' + source.slice(fn.start, fn.end) + ')', context);
  const llamar = async (quien, de) => { let st = 200, out = null;
    await handler({ params: { playerName: de }, user: { playerName: quien } }, { status(c) { st = c; return this; }, json(o) { out = o; return this; } });
    return { st, out }; };
  const mia = await llamar('Ana', 'Ana');
  assert.equal(mia.st, 200);
  assert.deepEqual([mia.out.misionesCompletadas, mia.out.misiones_granjero, mia.out.misiones_guardian, mia.out.estadomision], [7, 5, 2, 1]);
  assert.equal((await llamar('Bea', 'Ana')).st, 403, 'nadie lee las misiones de otro');
  const nueva = await llamar('Bea', 'Bea');
  assert.equal(nueva.st, 200); assert.equal(nueva.out.misionesCompletadas, 0, 'una cuenta sin misiones recibe ceros, no un 404');
});
