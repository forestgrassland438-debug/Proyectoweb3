'use strict';
// Evalúa solamente funciones/clases extraídas por AST; nunca arranca el servidor.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const acorn = require('acorn');
const ethers = require('ethers');
const backendPath = process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js';
const source = fs.readFileSync(backendPath, 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
function declaration(name) {
  const n = ast.body.find(n => n.id?.name === name);
  assert.ok(n, 'Declaración ausente: ' + name);
  return source.slice(n.start, n.end);
}
const quiet = { log() {}, warn() {}, error() {} };
function relayFixture(provider, extra = {}) {
  const context = { provider, ethers, Buffer, console: quiet, relayerWallet: {}, uuidv4: () => 'fixture',
    RelayedTransaction: { async updateOne() { return { matchedCount: 1 }; } },
    setTimeout(fn) { queueMicrotask(fn); return 1; }, ...extra };
  vm.createContext(context);
  vm.runInContext(declaration('RelayManager') + '\n' + declaration('broadcastRelayTransaction') +
    '\nthis.manager = Object.create(RelayManager.prototype);this.manager.stats = {successful:0,failed:0,totalGasUsed:0n,totalCost:0n};', context);
  return context;
}
function record(fields = {}) {
  return { status: 'broadcasted', txHash: '0xabc', saves: 0,
    async save() { this.saves++; }, ...fields };
}
test('un timeout de confirmación conserva el hash pendiente y permite confirmación tardía', async () => {
  let receipt = null;
  const c = relayFixture({ async waitForTransaction() { if (!receipt) throw Error('timeout'); return receipt; } });
  const tx = record();
  await c.manager.waitForConfirmation(tx.txHash, tx);
  assert.equal(tx.status, 'broadcasted');
  receipt = { status: 1, blockNumber: 12, index: 0, gasUsed: 21000n, gasPrice: 7n, logs: [] };
  await c.manager.waitForConfirmation(tx.txHash, tx);
  assert.equal(tx.status, 'confirmed');
  assert.equal(tx.actualCost, '147000');
  assert.equal(c.manager.stats.totalGasUsed, 21000n);
  assert.equal(c.manager.stats.totalCost, 147000n);
});
test('un rechazo de confirmación no pisa un estado terminal ya observado', async () => {
  const c = relayFixture({ async waitForTransaction() { throw Error('offline'); } });
  for (const status of ['confirmed', 'reverted']) {
    const tx = record({ status });
    await c.manager.waitForConfirmation(tx.txHash, tx);
    assert.equal(tx.status, status); assert.equal(tx.saves, 0);
  }
});
test('el timeout protege el estado terminal escrito por otro documento concurrente', async () => {
  let filter;
  const c = relayFixture({ async waitForTransaction() { throw Error('timeout'); } }, {
    RelayedTransaction: { async updateOne(query) { filter = query; return { matchedCount: 0 }; } }
  });
  await c.manager.waitForConfirmation('0xabc', record({ transactionId: 'fixture' }));
  assert.equal(filter.transactionId, 'fixture'); assert.equal(filter.txHash, '0xabc');
  assert.deepEqual(Array.from(filter.status.$nin), ['confirmed', 'reverted']);
});
test('recovery no vuelve a ejecutar una operación cuyo hash sigue sin receipt', async () => {
  let resent = 0;
  const tx = record({ createdAt: new Date(Date.now() - 600000), transactionId: 'fixture' });
  const c = relayFixture({ async getTransactionReceipt() { return null; } }, {
    RelayedTransaction: { find() { return { async limit() { return [tx]; } }; } }
  });
  c.manager.processTransactionFromQueue = async () => { resent++; };
  await c.manager.recoverPendingTransactions();
  assert.equal(resent, 0); assert.equal(tx.status, 'broadcasted');
});
test('reprocesar un documento con hash solo reconcilia ese hash', async () => {
  const c = relayFixture({}); let checked = 0;
  c.manager.getTransactionStatus = async id => { assert.equal(id, 'fixture'); checked++; };
  const result = await c.manager.processTransactionFromQueue(record({ transactionId: 'fixture' }));
  assert.equal(result, '0xabc'); assert.equal(checked, 1);
});
test('una caída RPC no puede retener una cola ilimitada ni cuerpos de 1 MB', async () => {
  const c = relayFixture({}); c.manager.transactionQueue = [];
  for (let i = 0; i < 250; i++) await c.manager.addToQueue({ parameters: { id: i } });
  await assert.rejects(c.manager.addToQueue({ parameters: {} }), e => e.code === 'RELAY_QUEUE_CAPACITY');
  assert.equal(c.manager.transactionQueue.length, 250);
  c.manager.transactionQueue = [];
  await assert.rejects(c.manager.addToQueue({ parameters: { text: 'x'.repeat(65536) } }), e => e.code === 'RELAY_QUEUE_CAPACITY');
  assert.equal(c.manager.transactionQueue.length, 0);
});
test('un fallo RPC ambiguo reenvía los mismos bytes y firma una sola vez', async () => {
  const bytes = '0x010203', seen = []; let signs = 0, calls = 0;
  const tx = record({ txHash: undefined });
  const c = relayFixture({ async broadcastTransaction(signed) {
    assert.equal(tx.status, 'signed'); assert.ok(tx.saves > 0);
    seen.push(signed); if (++calls < 3) throw Error('network error'); return { hash: ethers.keccak256(signed) };
  } }, { relayerWallet: { async signTransaction() { signs++; return bytes; } } });
  const result = await c.broadcastRelayTransaction({ nonce: 9 }, tx);
  assert.equal(signs, 1); assert.deepEqual(seen, [bytes, bytes, bytes]);
  assert.equal(result.hash, ethers.keccak256(bytes));
});
test('agotado el transporte queda hash pendiente, sin pedir nonce nuevo ni reencolar', async () => {
  const bytes = '0x0102'; const tx = record({ txHash: undefined });
  const c = relayFixture({ async broadcastTransaction() { throw Error('timeout'); } }, {
    relayerWallet: { async signTransaction() { return bytes; } }
  });
  const result = await c.broadcastRelayTransaction({ nonce: 3 }, tx, 2);
  assert.equal(result.hash, ethers.keccak256(bytes)); assert.equal(result.broadcastUncertain, true);
  assert.equal(tx.txHash, result.hash); assert.ok(tx.broadcastedAt);
});
test('un rechazo definitivo del mempool se propaga como fallo', async () => {
  const tx = record({ txHash: undefined });
  const c = relayFixture({ async broadcastTransaction() { throw Error('insufficient funds'); } }, {
    relayerWallet: { async signTransaction() { return '0x0102'; } }
  });
  await assert.rejects(c.broadcastRelayTransaction({ nonce: 3 }, tx), /insufficient funds/);
  assert.equal(tx.txHash, undefined); assert.equal(tx.broadcastedAt, undefined);
});
test('un rechazo posterior no prueba ausencia después de un primer envío ambiguo', async () => {
  const tx = record({ txHash: undefined }); let sends = 0, signs = 0;
  const c = relayFixture({ async broadcastTransaction() {
    if (++sends === 1) throw Error('network error'); throw Error('insufficient funds');
  } }, { relayerWallet: { async signTransaction() { signs++; return '0x0102'; } } });
  const result = await c.broadcastRelayTransaction({ nonce: 3 }, tx);
  assert.equal(signs, 1); assert.equal(sends, 2); assert.equal(result.broadcastUncertain, true);
  assert.equal(result.hash, ethers.keccak256('0x0102')); assert.equal(tx.txHash, result.hash);
});

function functionFixture(name, extra = {}) {
  const c = { console: quiet, ...extra }; vm.createContext(c);
  vm.runInContext(declaration(name), c); return c;
}
test('el wrapper Express4 pasa rechazos y excepciones a next una sola vez', async () => {
  const c = functionFixture('asyncRoute');
  for (const handler of [async () => { throw Error('DB unavailable'); }, () => { throw Error('sync'); }]) {
    const seen = [];
    c.asyncRoute(handler)({}, {}, e => seen.push(e));
    await new Promise(setImmediate);
    assert.equal(seen.length, 1); assert.match(seen[0].message, /DB unavailable|sync/);
  }
});
test('los intervalos async no se solapan y se liberan después de error', async () => {
  let tick, resolve, calls = 0; const registered = new Set();
  const c = functionFixture('setIntervalAsync', { _intervalosAsync: registered,
    setInterval(fn) { tick = fn; return 'fixture timer'; } });
  c.setIntervalAsync(async () => { calls++; if (calls === 1) await new Promise(r => { resolve = r; }); else throw Error('DB'); }, 1000);
  const first = tick(); await tick(); await tick(); assert.equal(calls, 1);
  resolve(); await first; await tick(); await tick(); assert.equal(calls, 3);
  assert.equal(registered.size, 1);
});
test('el saneado de Mongo elimina operadores profundos sin agotar pila y admite ciclos', () => {
  const c = functionFixture('sanearClavesMongo'); const root = {}; let node = root;
  for (let i = 0; i < 12000; i++) { node.child = {}; node = node.child; }
  node.$where = 'injected'; node['nested.key'] = 1;
  node.keep = 'text'; node.loop = root;
  assert.equal(c.sanearClavesMongo(root, 0), 2);
  assert.equal(node.$where, undefined); assert.equal(node['nested.key'], undefined);
  assert.equal(node.keep, 'text');
});
test('el lookup de ítems no acepta claves heredadas como tipos on-chain', () => {
  const c = functionFixture('itemTipoOnChain', { ITEM_TIPO_MAP: { carbon: 'carbon' } });
  for (const key of ['__proto__', 'constructor', 'toString']) assert.equal(c.itemTipoOnChain(key), null);
  assert.equal(c.itemTipoOnChain('carbon'), 'carbon');
});
test('evicción NFT destruye proveedores y separa chainId incluso con RPC idéntico', () => {
  let destroyed = 0, created = 0; const providers = new Map(); const game = {};
  class Provider { constructor(url, chain) { this.url = url; this.chain = chain; created++; } destroy() { destroyed++; } }
  const c = functionFixture('proveedorNft', { provider: game, _nftProveedores: providers,
    ethers: { JsonRpcProvider: Provider } });
  assert.equal(c.proveedorNft({}), game);
  const first = c.proveedorNft({ rpc: 'https://example.invalid', chainId: 1 });
  assert.equal(c.proveedorNft({ rpc: 'https://example.invalid', chainId: 1 }), first);
  assert.notEqual(c.proveedorNft({ rpc: 'https://example.invalid', chainId: 2 }), first);
  for (let chainId = 3; chainId <= 12; chainId++) c.proveedorNft({ rpc: 'https://example.invalid', chainId });
  assert.equal(created, 12); assert.equal(providers.size, 8); assert.equal(destroyed, 4);
});
test('fallo del stream de traducción después de cabeceras rechaza sin error huérfano', async () => {
  let response; const request = new EventEmitter();
  const c = functionFixture('tradPedirJson', { TRAD_TIMEOUT_MS: 5000,
    https: { get(url, options, callback) {
      response = new EventEmitter(); response.setEncoding = () => {}; response.complete = false;
      callback(response); return request;
    } } });
  const failure = c.tradPedirJson('https://example.invalid');
  response.emit('error', Error('ECONNRESET')); await assert.rejects(failure, /ECONNRESET/);
  const interrupted = c.tradPedirJson('https://example.invalid');
  response.emit('aborted'); await assert.rejects(interrupted, /respuesta_interrumpida/);
});
test('lecturas fallidas de las tablas de servidor nunca habilitan la acuñación', async () => {
  const c = relayFixture({}, { TABLAS_SOLO_SERVIDOR: new Set(['nivel']),
    TABLAS_SOLO_ACUNA_SERVIDOR: new Set(['pes1']), GATHER_ENFORCE: true,
    GATHER_TIPOS: new Set(['carbon']) });
  const contract = { async getInvoice() { throw Error('network error'); } };
  await assert.rejects(c.manager.blockClientServerTables(contract, 'increaseInvoiceQuantity', { id: 7 }), /network/);
  await assert.rejects(c.manager.blockClientGatherMint(contract, 'increaseInvoiceQuantity', { id: 7 }), /network/);
  await assert.rejects(c.manager.blockClientServerTables(contract, 'increaseInvoiceQuantity(uint256,uint256)', { id: 7 }), /network/);
});
test('whitelist del contrato no delega privilegios administrativos a jugadores', async () => {
  let admin = false;
  const c = relayFixture({}, { isAdminAddressCached: async () => admin });
  for (const name of ['setLimit', 'deprecateTipo', 'addAdmin', 'removeAdmin', 'transferOwnership',
    'renounceOwnership', 'migrateInvoicesBatch', 'sealMigration', 'setLimit(string,uint256,uint256)']) {
    await assert.rejects(c.manager.verifyRelayPrivileges(name, 'fixture'), /relay_admin_required/);
  }
  await c.manager.verifyRelayPrivileges('createInvoice', 'fixture');
  admin = true; await c.manager.verifyRelayPrivileges('setLimit', 'fixture');
});
test('el nonce inicial no se inventa en cero ni rebaja una reserva concurrente', async () => {
  let fail = false;
  const c = { provider: { async getTransactionCount() { if (fail) throw Error('network error'); return 4; } },
    relayerWallet: { address: 'fixture' }, uuidv4: () => 'fixture', console: quiet,
    setTimeout, clearTimeout };
  vm.createContext(c); vm.runInContext(declaration('RelayerNonceManager') +
    ';this.manager=Object.create(RelayerNonceManager.prototype);this.manager.currentNonce=9;this.manager.lock=false;this.manager.queue=[];', c);
  await c.manager.init(); assert.equal(c.manager.currentNonce, 9);
  fail = true; c.manager.currentNonce = null;
  await c.manager.init(); assert.equal(c.manager.currentNonce, null);
  await assert.rejects(c.manager.getNextNonce(), /network error/); assert.equal(c.manager.lock, false);
});
function findNode(predicate, tree = ast) {
  if (predicate(tree)) return tree;
  for (const value of Object.values(tree)) {
    if (Array.isArray(value)) { for (const n of value) if (n?.type) { const found = findNode(predicate, n); if (found) return found; } }
    else if (value?.type) { const found = findNode(predicate, value); if (found) return found; }
  }
}
function joinFixture() {
  const callbacks = [], rooms = Object.create(null);
  const c = { rooms, console: quiet, salaBase: r => r, salaConCanal: (r, channel) => r + '#c' + channel,
    islaDeSala: () => null, anotarCambioDeSala() {}, purgarFantasmas() {},
    NOMBRE_SOULBOUND_VALIDO: /^[A-Za-z0-9_-]{1,40}$/,
    PlayerAuth: { findOne() { return { lean() { return new Promise(resolve => callbacks.push(resolve)); } }; } },
    io: { to() { return { emit() {} }; } } };
  const events = [], socket = { id: 'fixture', connected: true, authenticatedAddress: 'fixture',
    authenticatedPlayer: null, _nameColor: null, playerData: { room: null, canal: 1 },
    emit(...args) { events.push(args); }, join() {}, leave() {}, to() { return { emit() {} }; } };
  c.socket = socket; vm.createContext(c);
  const call = findNode(n => n.type === 'CallExpression' && n.callee.property?.name === 'on' && n.arguments[0]?.value === 'joinRoom');
  vm.runInContext('this.join=' + source.slice(call.arguments[1].start, call.arguments[1].end), c);
  return { c, socket, callbacks, rooms, events };
}
test('joinRoom rechaza paquetes vacíos y no resucita salas tras desconectarse', async () => {
  const f = joinFixture(); await f.c.join(null); assert.equal(f.events[0][0], 'error');
  const pending = f.c.join({ room: 'game', username: 'Ana' });
  f.socket.connected = false; f.callbacks[0]({ playerName: 'Ana' }); await pending;
  assert.equal(Object.keys(f.rooms).length, 0);
});
test('dos joins superpuestos solo publican la sala de la última solicitud', async () => {
  const f = joinFixture(); const old = f.c.join({ room: 'game', username: 'Ana' });
  const latest = f.c.join({ room: 'mina', username: 'Ana' });
  f.callbacks[1]({ playerName: 'Ana' }); await latest;
  f.callbacks[0]({ playerName: 'Ana' }); await old;
  assert.deepEqual(Object.keys(f.rooms), ['mina#c1']); assert.equal(f.socket.playerData.room, 'mina#c1');
});
test('la purga recupera cachés de cuentas que abandonaron el juego', () => {
  const now = Date.now(); const c = { Date, console: quiet, PURGA_EDAD_MS: 3600000,
    PESCA_SESION_MS: 45000, FANTASMA_CACHE_MS: 3000, rooms: {},
    GFBrawlMotor: { REGLAS: { CUENTA_MS: 1000, DURACION_MAX_MS: 10000 } }, brawlSoltarJugadores() {} };
  for (const name of ['plantSpamTracker','_gatherLastByPlayer','_verifierCooldown','_cuervoUltimo','_pescaUltimo',
    '_casillasUltimoEnvio','_pescaSesiones','_pvpEspadas','_cacheFantasma','_tradUso','_nftCacheJugador',
    'chatHistory','_adminAddrCache','battleMatches','socketMatch']) c[name] = new Map();
  c._pescaUltimo.set('old', now - 4000000); c._casillasUltimoEnvio.set('old', now - 4000000);
  c._pescaSesiones.set('old', { t0: now - 50000 }); c._pescaSesiones.set('active', { t0: now });
  c._pvpEspadas.set('old', { hasta: now - 1 }); c._pvpEspadas.set('active', { hasta: now + 10000 });
  c._cacheFantasma.set('old', { t: now - 4000 }); c._tradUso.set('old', { desde: now - 120000 });
  c._nftCacheJugador.set('old', { at: now - 240000 });
  vm.createContext(c); vm.runInContext(declaration('purgarMapaDeTiempos') + declaration('purgarMapasEnMemoria'), c);
  c.purgarMapasEnMemoria();
  for (const name of ['_pescaUltimo','_casillasUltimoEnvio','_cacheFantasma','_tradUso','_nftCacheJugador']) assert.equal(c[name].size, 0);
  assert.equal(c._pescaSesiones.size, 1); assert.equal(c._pvpEspadas.size, 1);
});
const marketSource = fs.readFileSync(path.join(__dirname, '../marketplace-routes.js'), 'utf8');
const marketAst = acorn.parse(marketSource, { ecmaVersion: 'latest' });
function marketFunction(name) {
  const n = findNode(n => n.type === 'FunctionDeclaration' && n.id.name === name, marketAst);
  assert.ok(n, name); return marketSource.slice(n.start, n.end);
}
test('marketplace rechaza importes infinitos e inseguros y catálogos heredados', () => {
  const c = { ITEM_CATALOG: { carbon: { name: 'Carbón' } } }; vm.createContext(c);
  vm.runInContext(marketFunction('catalogMeta') + marketFunction('validMarketAmount'), c);
  assert.equal(c.catalogMeta('constructor').category, 'otros'); assert.equal(c.catalogMeta('carbon').name, 'Carbón');
  for (const n of [Infinity, NaN, 0, -1, Number.MAX_SAFE_INTEGER]) assert.equal(c.validMarketAmount(n), false);
  assert.equal(c.validMarketAmount(19.25), true);
});
test('plan de marketplace tolera entradas nulas y evita stacks corruptos y qty insegura', () => {
  const c = {}; vm.createContext(c); vm.runInContext(marketFunction('computeInsertPlan'), c);
  assert.equal(c.computeInsertPlan([], 'carbon', Infinity, 20), null);
  assert.equal(c.computeInsertPlan([], 'carbon', 1, 0), null);
  assert.equal(c.computeInsertPlan({}, 'carbon', 1, 20), null);
  const result = c.computeInsertPlan([null, { id: 0, objeto: 'carbon', cantidad: 19 },
    { id: 1, objeto: 'carbon', cantidad: -100 }], 'carbon', 3, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ type: 'inc', id: 0, amount: 1 }, { type: 'new', id: 2, amount: 2 }]);
});
