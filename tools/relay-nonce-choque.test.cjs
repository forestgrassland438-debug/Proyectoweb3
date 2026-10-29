'use strict';
// "Cuando compro en la tienda nunca se hace la compra" (2026-10-27).
//
// El cobro de la compra lo firma applyStatOnChain con un nonce leído de la
// cadena y el objeto lo firma el relay con relayerNonceManager: misma clave,
// dos contadores. Salían a la vez con el MISMO nonce, la createInvoice recibía
// "nonce too low" y el servidor devolvía su hash como enviado: un hash que no
// se iba a minar nunca. El cliente lo esperaba 3 × 2 min y reembolsaba.
//
// Evalúa solo funciones/clases sacadas por AST de server2.js; nunca lo arranca.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
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
function rutaPost(ruta) {
  const n = ast.body.find(n => n.type === 'ExpressionStatement' &&
    n.expression.type === 'CallExpression' &&
    n.expression.callee.type === 'MemberExpression' &&
    n.expression.callee.object.name === 'app' && n.expression.callee.property.name === 'post' &&
    n.expression.arguments[0] && n.expression.arguments[0].value === ruta);
  assert.ok(n, 'Ruta ausente: ' + ruta);
  const args = n.expression.arguments;
  const h = args[args.length - 1];
  return source.slice(h.start, h.end);
}
const quiet = { log() {}, warn() {}, error() {} };
const inmediato = (fn) => { queueMicrotask(fn); return 1; };
const errNonce = (msg = 'nonce has already been used') =>
  Object.assign(new Error(msg + ' (code=NONCE_EXPIRED)'), { code: 'NONCE_EXPIRED', shortMessage: msg });

function contexto(extra = {}) {
  const c = { ethers, Buffer, console: quiet, crypto, relayerWallet: {}, uuidv4: () => 'fijo',
    setTimeout: inmediato, ...extra };
  vm.createContext(c);
  vm.runInContext(declaration('RelayManager') + '\n' + declaration('broadcastRelayTransaction') +
    '\nthis.RelayManager = RelayManager;this.broadcastRelayTransaction = broadcastRelayTransaction;' +
    'this.manager = Object.create(RelayManager.prototype);' +
    'this.manager.stats = {totalRelayed:0,successful:0,failed:0,totalGasUsed:0n,totalCost:0n};', c);
  return c;
}
function registro(campos = {}) {
  return { status: 'processing', saves: 0, async save() { this.saves++; }, ...campos };
}

// ── broadcastRelayTransaction ───────────────────────────────────────────────
test('nonce gastado en el PRIMER envío: choque claro, sin hash pendiente', async () => {
  const tx = registro();
  const c = contexto({ provider: { async broadcastTransaction() { throw errNonce('nonce too low'); } },
    relayerWallet: { async signTransaction() { return '0x0102'; } } });
  await assert.rejects(c.broadcastRelayTransaction({ nonce: 7 }, tx), e => e.code === 'RELAY_NONCE_COLLISION');
  assert.equal(tx.txHash, undefined);
  assert.equal(tx.broadcastedAt, undefined);
});

test('"replacement underpriced" en el primer envío también es choque', async () => {
  const tx = registro();
  const c = contexto({ provider: { async broadcastTransaction() {
    throw Object.assign(new Error('replacement fee too low'), { code: 'REPLACEMENT_UNDERPRICED', shortMessage: 'replacement fee too low' });
  } }, relayerWallet: { async signTransaction() { return '0x0102'; } } });
  await assert.rejects(c.broadcastRelayTransaction({ nonce: 7 }, tx), e => e.code === 'RELAY_NONCE_COLLISION');
});

test('tras un envío ambiguo, "nonce too low" sigue siendo "quizá entró" (no se refirma)', async () => {
  const tx = registro(); let envios = 0;
  const c = contexto({ provider: { async broadcastTransaction() {
    if (++envios === 1) throw new Error('network error'); throw errNonce('nonce too low');
  } }, relayerWallet: { async signTransaction() { return '0x0102'; } } });
  const r = await c.broadcastRelayTransaction({ nonce: 7 }, tx);
  assert.equal(r.broadcastUncertain, true);
  assert.equal(r.hash, ethers.keccak256('0x0102'));
  assert.equal(tx.txHash, r.hash);
});

test('"already known" en el primer envío: son estos bytes, se da por enviada', async () => {
  const tx = registro();
  const c = contexto({ provider: { async broadcastTransaction() { throw new Error('already known'); } },
    relayerWallet: { async signTransaction() { return '0x0102'; } } });
  const r = await c.broadcastRelayTransaction({ nonce: 7 }, tx);
  assert.equal(r.hash, ethers.keccak256('0x0102'));
});

// ── processTransaction ──────────────────────────────────────────────────────
function relayProceso({ chocaHasta = 1, nonces = [7, 8, 9, 10, 11] } = {}) {
  const firmados = [], guardados = [];
  let pedidos = 0;
  class FalsoContrato {
    constructor() {
      const fn = async () => ({});
      fn.estimateGas = async () => 50000n;
      fn.populateTransaction = async () => ({ to: '0x686e17d89bf97247fadc04c3a3f0dfd02f914115', data: '0xca4528bf' });
      this.createInvoice = fn;
    }
  }
  class FalsoRelayed {
    constructor(d) { Object.assign(this, d); }
    async save() { guardados.push({ status: this.status, txHash: this.txHash, nonce: this.nonce }); }
    static async findOne() { return null; }
  }
  const c = contexto({
    ethers: { ...ethers, Contract: FalsoContrato },
    relayerWallet: { address: '0x1dda2cdc8e35908d27ce7f1622d30839d15510ae',
      async signTransaction(tx) { firmados.push(tx.nonce); return '0x' + tx.nonce.toString(16).padStart(4, '0'); } },
    provider: {
      async getFeeData() { return { gasPrice: 10000000n }; },
      async getBalance() { return ethers.parseEther('9'); },
      async broadcastTransaction(signed) {
        const nonce = parseInt(signed.slice(2), 16);
        if (nonce < nonces[0] + chocaHasta) throw errNonce('nonce too low');
        return { hash: ethers.keccak256(signed) };
      }
    },
    RelayedTransaction: FalsoRelayed,
    ContractWhitelist: { async findOne() { return { abi: [], securityConfig: { maxGasLimit: 10000000, gasPriceMultiplier: 1 } }; } },
    relayerNonceManager: { async getNextNonce() { return nonces[pedidos++]; } },
    ensureItemTipoParaTransaccion: async () => {},
    multiSigManager: { async requireTimeLock() {} },
    FIXED_GAS_PRICE_GWEI: null, MIN_GAS_PRICE_GWEI: '0.001', GAS_PRICE_MULTIPLIER: 1, FALLBACK_GAS_PRICE_GWEI: '50',
    SECURITY_CONFIG: { THRESHOLDS: { MAX_GAS_LIMIT: 10000000, MAX_GAS_PRICE_GWEI: 1000, MIN_VALUE_PER_GAS: 0 } },
    CHAIN_ID: 4441, NETWORK_NAME: 'liteforge'
  });
  const m = c.manager;
  m.checkPlayerLimits = async () => ({ allowed: true });
  m.verifyRelayPrivileges = async () => {};
  m.verifyInvoiceOwnership = async () => {};
  m.blockClientGatherMint = async () => {};
  m.blockClientServerTables = async () => {};
  m.updatePlayerLimits = async () => {};
  m.updateContractStats = async () => {};
  m.waitForConfirmation = async () => {};
  const datos = { playerAddress: '0x1dda2cdc8e35908d27ce7f1622d30839d15510ae', playerName: 'p',
    contractAddress: '0x686e17d89bf97247fadc04c3a3f0dfd02f914115', contractName: 'ItemContract',
    functionName: 'createInvoice', parameters: { 0: '0x1dda2cdc8e35908d27ce7f1622d30839d15510ae', 1: 'tomate_buena', 2: 1, 3: 'm1' } };
  return { m, datos, firmados, guardados };
}

test('la compra que choca con el cobro se firma de nuevo con el siguiente nonce y sale', async () => {
  const { m, datos, firmados } = relayProceso({ chocaHasta: 1 });
  const r = await m.processTransaction(datos);
  assert.equal(r.success, true);
  assert.deepEqual(firmados, [7, 8]);
  assert.equal(r.txHash, ethers.keccak256('0x0008'), 'el hash devuelto es el de la firma que entró');
});

test('si choca cuatro veces seguidas, falla de verdad (sin hash muerto) para que la ruta la encole', async () => {
  const { m, datos, firmados, guardados } = relayProceso({ chocaHasta: 10 });
  await assert.rejects(m.processTransaction(datos), e => e.code === 'RELAY_NONCE_COLLISION' && m.shouldRetry(e));
  assert.deepEqual(firmados, [7, 8, 9, 10]);
  const ultimo = guardados[guardados.length - 1];
  assert.equal(ultimo.status, 'failed');
  assert.equal(ultimo.txHash, undefined);
});

// ── getTransactionStatus / envioDescartado ──────────────────────────────────
function estado({ doc, latest = 10, conocida = false, recibo = null }) {
  const escrituras = [];
  const c = contexto({
    relayerWallet: { address: '0x1dda2cdc8e35908d27ce7f1622d30839d15510ae' },
    EXPLORER_URL: 'https://x',
    provider: {
      async getTransactionReceipt() { return recibo; },
      async getTransaction() { return conocida ? { hash: doc.txHash } : null; },
      async getTransactionCount(_a, tag) { assert.equal(tag, 'latest'); return latest; }
    },
    RelayedTransaction: {
      async findOne() { return doc; },
      async updateOne(filtro, cambio) { escrituras.push({ filtro, cambio }); return { modifiedCount: 1 }; }
    }
  });
  doc.toObject = function () { const o = { ...this }; delete o.toObject; delete o.save; return o; };
  doc.save = async () => {};
  return { m: c.manager, escrituras };
}
const hace = (ms) => new Date(Date.now() - ms);

test('firma sin recibo cuyo nonce ya gastó otra: se da por fallida (relay_dropped)', async () => {
  const doc = { transactionId: 'relay_a', status: 'broadcasted', txHash: '0xaa', nonce: 7, broadcastedAt: hace(60000) };
  const { m, escrituras } = estado({ doc, latest: 9 });
  const st = await m.getTransactionStatus('relay_a');
  assert.equal(st.status, 'failed');
  assert.match(st.error, /^relay_dropped/);
  assert.deepEqual(Array.from(escrituras[0].filtro.status.$in), ['broadcasted', 'signed']);
  assert.equal(await m.envioDescartado('relay_a'), true);
});

test('no se descarta: muy reciente, nonce aún libre, o el nodo todavía la conoce', async () => {
  for (const caso of [
    { doc: { status: 'broadcasted', txHash: '0xaa', nonce: 7, broadcastedAt: hace(10000) }, latest: 9 },
    { doc: { status: 'broadcasted', txHash: '0xaa', nonce: 7, broadcastedAt: hace(60000) }, latest: 7 },
    { doc: { status: 'broadcasted', txHash: '0xaa', nonce: 7, broadcastedAt: hace(60000) }, latest: 9, conocida: true },
    { doc: { status: 'broadcasted', txHash: '0xaa', broadcastedAt: hace(60000) }, latest: 9 }
  ]) {
    const { m, escrituras } = estado(caso);
    const st = await m.getTransactionStatus('x');
    assert.equal(st.status, 'broadcasted');
    assert.equal(escrituras.length, 0);
    assert.equal(await m.envioDescartado('x'), false);
  }
});

test('con recibo manda el recibo, aunque el nonce esté gastado', async () => {
  const doc = { status: 'broadcasted', txHash: '0xaa', nonce: 7, broadcastedAt: hace(60000) };
  const { m } = estado({ doc, latest: 9, recibo: { status: 1, blockNumber: 5, gasUsed: 1n } });
  const st = await m.getTransactionStatus('x');
  assert.equal(st.status, 'confirmed');
  assert.equal(await m.envioDescartado('x'), false);
});

test('envioDescartado: fallida sin hash sí; revertida o fallida con hash por otro motivo, no', async () => {
  const casos = [
    [{ status: 'failed' }, true],
    [{ status: 'failed', txHash: '0xaa', error: 'relay_dropped: nonce 7 …' }, true],
    [{ status: 'failed', txHash: '0xaa', error: 'otra cosa' }, false],
    [{ status: 'reverted', txHash: '0xaa' }, false],
    [{ status: 'pending' }, false]
  ];
  for (const [doc, esperado] of casos) {
    const { m } = estado({ doc });
    assert.equal(await m.envioDescartado('x'), esperado, JSON.stringify(doc));
  }
  const { m } = estado({ doc: { status: 'failed' } });
  assert.equal(await m.envioDescartado(undefined), false);
});

test('waitForConfirmation no devuelve a "broadcasted" lo que ya se descartó', async () => {
  let filtro;
  const c = contexto({ provider: { async waitForTransaction() { throw new Error('timeout'); } },
    RelayedTransaction: { async updateOne(q) { filtro = q; return { matchedCount: 0 }; } } });
  await c.manager.waitForConfirmation('0xaa', registro({ status: 'broadcasted', transactionId: 't' }));
  // La RegExp nace en el contexto de vm: instanceof no vale entre reinos.
  assert.equal(Object.prototype.toString.call(filtro.error && filtro.error.$not), '[object RegExp]');
  assert.ok(filtro.error.$not.test('relay_dropped: x'));
});

// ── /api/relay/transaction con la misma clave idem ──────────────────────────
function ruta() {
  const llamadas = [];
  let descartado = false, n = 0;
  const c = {
    console: quiet, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
    Promise, Date, _relayIdem: new Map(), RELAY_IDEM_MS: 15 * 60 * 1000,
    validationResult: () => ({ isEmpty: () => true }),
    relayerWallet: {}, uuidv4: () => 'fijo', CONTRACTS: {}, EXPLORER_URL: 'https://x', global: {},
    PlayerAuth: { async findOne() { return { playerName: 'p' }; } },
    ContractWhitelist: { async findOne() { return { contractName: 'ItemContract' }; } },
    relayManager: {
      async processTransaction() { n++; llamadas.push(n); return { transactionId: 'relay_' + n, txHash: '0x' + n }; },
      shouldRetry: () => false,
      async envioDescartado(id) { return descartado && id === 'relay_1'; }
    }
  };
  vm.createContext(c);
  vm.runInContext('this.handler = ' + rutaPost('/api/relay/transaction'), c);
  const pedir = () => new Promise((ok) => {
    const res = { statusCode: 200, status(s) { this.statusCode = s; return this; },
      json(cuerpo) { ok({ status: this.statusCode, cuerpo }); return this; } };
    c.handler({ body: { contractAddress: '0x686e17d89bf97247fadc04c3a3f0dfd02f914115', functionName: 'createInvoice',
      parameters: {}, idem: 'clave-de-prueba-123' }, user: { address: '0x1dda2cdc8e35908d27ce7f1622d30839d15510ae' },
      cookies: {}, headers: {} }, res);
  });
  return { pedir, llamadas, descartar() { descartado = true; } };
}

test('misma clave idem: se repite lo ya contestado... salvo que nunca llegara a la cadena', async () => {
  const r = ruta();
  const a = await r.pedir();
  assert.equal(a.cuerpo.transactionId, 'relay_1');
  const b = await r.pedir();
  assert.equal(b.cuerpo.transactionId, 'relay_1', 'mientras pueda minarse, la misma respuesta');
  assert.deepEqual(r.llamadas, [1]);
  r.descartar();
  const d = await r.pedir();
  assert.equal(d.cuerpo.transactionId, 'relay_2', 'descartada: se envía de nuevo');
  assert.deepEqual(r.llamadas, [1, 2]);
  const e = await r.pedir();
  assert.equal(e.cuerpo.transactionId, 'relay_2', 'y la nueva queda como la respuesta de esa clave');
  assert.deepEqual(r.llamadas, [1, 2]);
});

// The former blind nonce retry has been replaced by a durable signed intent.
// EVM/Mongo recovery and concurrent-worker behavior are integration-tested in
// audit-gemini-craft-integration.cjs; these cases verify the public wrapper.
function statWrapper(results) {
  const calls=[],expanded=[];
  const c={STAT_CHAIN_FLOOR:1,Math,Number,clampStat:(_s,v)=>v,
    authoritativeStatJournal:{apply:async(...args)=>{calls.push(args);return results.shift();}},
    ensureStatTipo:async(...args)=>expanded.push(args)};
  vm.createContext(c);vm.runInContext(declaration('applyStatOnChain')+';this.apply=applyStatOnChain;',c);
  return {c,calls,expanded};
}
test('stats use the shared durable intent with an absolute target and canonical numeric invoice',async()=>{
 const {c,calls}=statWrapper([{ok:true,chainQty:3889}]),contract={};const r=await c.apply(contract,'plata','5',3889.1,1n);
 assert.equal(r.ok,true);assert.deepEqual(calls,[[contract,'plata',5,3889,1n]]);
});
test('a pending signed stats intent is not replaced or expanded after an uncertain response',async()=>{
 const original={ok:false,chainQty:null,pending:true,error:'ExceedsTipoLimit response from old request'};
 const {c,calls,expanded}=statWrapper([original]);assert.equal(await c.apply({},'oro',5,100,1n),original);
 assert.equal(calls.length,1);assert.equal(expanded.length,0);
});
test('only a rejected unsigned stats capacity preflight may expand and retry once',async()=>{
 const {c,calls,expanded}=statWrapper([{ok:false,pending:false,error:'ExceedsTipoLimit'},{ok:true,chainQty:100}]);
 assert.equal((await c.apply({},'oro',5,100,1n)).ok,true);assert.equal(calls.length,2);assert.equal(expanded.length,1);
 assert.equal(expanded[0][3].minPerInvoice,100);
});

