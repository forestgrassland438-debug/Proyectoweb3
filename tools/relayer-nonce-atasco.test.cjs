'use strict';
/* (2026-11-02) "No puedo comprar ni vender: recorded for chain review."
 *
 * El contador persistente del relayer solo subía: una reserva que no llegaba a la
 * cadena dejaba a todas las siguientes con un nonce por delante, LitVM las rechaza
 * ("nonce too high") sin guardarlas y cada intento gastaba otro número. Tres días
 * sin una sola transacción minada, y reiniciar no lo curaba.
 *
 * Evalúa solo lo sacado por AST de server2.js, con un Mongo de mentira; nunca lo
 * arranca. La prueba de punta a punta con Mongo y contrato de verdad está en
 * tools/shop-relayer-stall-integration.cjs. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const acorn = require('acorn');

const source = fs.readFileSync(process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js', 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
const decl = (name) => {
  const n = ast.body.find(n => n.id?.name === name);
  assert.ok(n, 'Declaración ausente: ' + name);
  return source.slice(n.start, n.end);
};
const quiet = { log() {}, warn() {}, error() {} };

/** Lo justo del pipeline de actualización que usa el contador. */
function evaluar(expr, doc) {
  if (expr instanceof Date || typeof expr !== 'object' || expr === null) return typeof expr === 'string' && expr[0] === '$' ? doc[expr.slice(1)] : expr;
  if ('$literal' in expr) return expr.$literal;
  if ('$add' in expr) return expr.$add.reduce((s, x) => s + evaluar(x, doc), 0);
  if ('$max' in expr) return Math.max(...expr.$max.map(x => evaluar(x, doc)));
  if ('$ifNull' in expr) { const v = evaluar(expr.$ifNull[0], doc); return v ?? evaluar(expr.$ifNull[1], doc); }
  throw new Error('expresión inesperada: ' + JSON.stringify(expr));
}
function coleccion() {
  const filas = new Map();
  return {
    filas,
    async findOne(q) { const d = filas.get(q._id); return d ? { ...d } : null; },
    async findOneAndUpdate(q, pipeline) {
      const d = filas.get(q._id) || { _id: q._id };
      for (const paso of pipeline) { const nuevos = {}; for (const [k, v] of Object.entries(paso.$set)) nuevos[k] = evaluar(v, d); Object.assign(d, nuevos); }
      filas.set(q._id, d);
      return { value: { ...d }, ok: 1 };
    },
    async insertOne(d) { if (filas.has(d._id)) throw new Error('duplicado'); filas.set(d._id, { ...d }); },
    async updateOne(q, u) { const d = filas.get(q._id); Object.assign(d, u.$set); }
  };
}
function gestor({ nonce = 100, conProveedor = {} } = {}) {
  let reloj = 1793592000000;
  class FalsaFecha extends Date {
    constructor(...a) { super(...(a.length ? a : [reloj])); }
    static now() { return reloj; }
  }
  const counters = coleccion(), requests = coleccion(), avisos = [];
  const chain = { nonce };
  const c = {
    Date: FalsaFecha, Math, Number, String, Promise, crypto, console: { ...quiet, warn: (m) => avisos.push(String(m)) }, CHAIN_ID: 4441,
    ethers: { Transaction: { from: (r) => ({ nonce: Number(r) }) } },
    relayerWallet: { address: '0xRELAYER' },
    provider: { async getTransactionCount() { return chain.nonce; }, ...conProveedor },
    mongoose: { connection: { readyState: 1, collection: (n) => n === 'relayer_nonce_counters' ? counters : requests,
      async startSession() { return { async withTransaction(fn) { await fn(); }, async endSession() {} }; } } }
  };
  vm.createContext(c);
  vm.runInContext(decl('RelayerNonceManager') + ';this.manager=new RelayerNonceManager();', c);
  const clave = '4441:0xrelayer';
  return { c, m: c.manager, chain, counters, requests, avisos, clave,
    pasar: (ms) => { reloj += ms; }, adelantar: (next, hace = 0) => counters.filas.set(clave, { _id: clave, next, updatedAt: new Date(reloj - hace) }) };
}

test('EL FALLO DE PRODUCCIÓN: contador muy por delante y nadie reservando: vuelve a la cadena a la primera', async () => {
  const g = gestor({ nonce: 14615 });
  g.adelantar(20000, 60000);
  assert.equal(await g.m.getNextNonce('compra'), 14615);
  assert.equal(g.counters.filas.get(g.clave).next, 14616);
  assert.equal(g.counters.filas.get(g.clave).rebobinado.desde, 20000);
  assert.equal(g.counters.filas.get(g.clave).primerRebobinado.a, 14615);
  assert.ok(g.avisos.some(a => a.includes('20000') && a.includes('14615')), 'queda en el registro');
  assert.equal(await g.m.getNextNonce('otra'), 14616, 'la siguiente sigue en orden');
});

test('con tráfico constante: el rechazo del nodo por nonce alto basta para volver', async () => {
  const g = gestor({ nonce: 500 });
  g.adelantar(900);
  assert.equal(await g.m.getNextNonce('a'), 900, 'sin ninguna prueba aún, sigue contando');
  g.m._notarNonceAlto('900');
  g.pasar(100);
  assert.equal(await g.m.getNextNonce('b'), 500, 'el nodo dijo que era alto: vuelve');
  assert.equal(await g.m.getNextNonce('c'), 501);
});

test('sin rechazos (un RPC que lo tragara todo): a los 30 s sin moverse la cadena también vuelve', async () => {
  const g = gestor({ nonce: 500 });
  g.adelantar(900);
  for (let i = 0; i < 5; i++) { assert.ok(await g.m.getNextNonce('t' + i) >= 900); g.pasar(5000); }
  g.pasar(6000);
  assert.equal(await g.m.getNextNonce('fin'), 500);
});

test('lo que acaba de reservarse no se recicla aunque el nodo aún no lo cuente', async () => {
  const g = gestor({ nonce: 50 });
  const n = await Promise.all(Array.from({ length: 100 }, (_, i) => g.m.getNextNonce('c' + i)));
  assert.deepEqual([...n], Array.from({ length: 100 }, (_, i) => 50 + i));
  assert.deepEqual(g.avisos, []);
});

test('una cadena que avanza nunca dispara la vuelta, por mucho tiempo que pase', async () => {
  const g = gestor({ nonce: 50 });
  for (let i = 0; i < 40; i++) {
    const n = await g.m.getNextNonce('m' + i);
    assert.equal(n, 50 + i);
    g.pasar(29000);
    g.chain.nonce = n + 1;          // el nodo la aceptó
  }
  assert.deepEqual(g.avisos, []);
});

test('tras volver, una reserva en vuelo tiene su margen: no se vuelve otra vez enseguida', async () => {
  const g = gestor({ nonce: 500 });
  g.adelantar(900, 60000);
  assert.equal(await g.m.getNextNonce('a'), 500);
  assert.equal(await g.m.getNextNonce('b'), 501, 'b no choca con a aunque el nodo aún no los cuente');
  g.m._notarNonceAlto('501');
  g.pasar(500);
  assert.equal(await g.m.getNextNonce('c'), 502, 'menos de 2 s desde la última vuelta: se espera');
  g.pasar(2000);
  assert.equal(await g.m.getNextNonce('d'), 500, 'si de verdad se perdieron, vuelve de nuevo');
});

test('una firma vieja de antes de volver no prueba nada', async () => {
  const g = gestor({ nonce: 500 });
  g.adelantar(900, 60000);
  await g.m.getNextNonce('a');
  g.pasar(5000);
  g.m._notarNonceAlto('899');       // diario reenviando bytes del atasco
  assert.notEqual(g.m._rechazoAlto, true);
});

test('el mismo ticket conserva su nonce: es lo que impide ejecutar dos veces tras una caída', async () => {
  const g = gestor({ nonce: 7 });
  assert.equal(await g.m.getNextNonce('craft:1:0'), 7);
  assert.equal(await g.m.getNextNonce('craft:1:0'), 7, 'fresco');
  g.chain.nonce = 9;
  g.pasar(120000);
  assert.equal(await g.m.getNextNonce('craft:1:0'), 7, 'ya gastado: el mismo, y la cadena lo rechazará por bajo');
});

test('un ticket cuyo nonce la cadena nunca alcanzó se renueva a los 30 s; recién pedido, no', async () => {
  const g = gestor({ nonce: 7 });
  g.adelantar(40, 60000);
  await g.m.getNextNonce('otra');   // vuelve a 7
  const g2 = gestor({ nonce: 7 });
  g2.adelantar(40);
  assert.equal(await g2.m.getNextNonce('stat:9'), 40);
  g2.pasar(10000);
  assert.equal(await g2.m.getNextNonce('stat:9'), 40, 'aún puede venir de camino');
  g2.pasar(25000);
  const n = await g2.m.getNextNonce('stat:9');
  assert.equal(n, 7, 'perdido: otro nonce, y el contador vuelve a la cadena');
  assert.equal(g2.requests.filas.size, 1, 'el mismo ticket, sin duplicar la reserva');
  assert.equal([...g2.requests.filas.values()][0].nonce, 7);
  assert.equal([...g2.requests.filas.values()][0].nonceAnterior, 40);
});

test('primerRebobinado guarda la PRIMERA vuelta: es la prueba del atasco', async () => {
  const g = gestor({ nonce: 14615 });
  g.adelantar(20000, 60000);
  await g.m.getNextNonce('a');
  const primero = g.counters.filas.get(g.clave).primerRebobinado;
  g.chain.nonce = 14700;
  g.adelantar(15000, 60000);
  g.counters.filas.get(g.clave).primerRebobinado = primero;
  await g.m.getNextNonce('b');
  assert.equal(g.counters.filas.get(g.clave).primerRebobinado.a, 14615);
  assert.equal(g.counters.filas.get(g.clave).rebobinado.a, 14700);
});

test('vigilar se engancha una vez, deja pasar el resultado y el error, y solo avisa del nonce alto', async () => {
  let respuesta = () => ({ hash: '0xaa' });
  const proveedor = { broadcastTransaction: async () => respuesta() };
  const g = gestor();
  g.m.vigilar(proveedor);
  const enganchado = proveedor.broadcastTransaction;
  g.m.vigilar(proveedor);
  assert.equal(proveedor.broadcastTransaction, enganchado);
  assert.equal((await proveedor.broadcastTransaction('5')).hash, '0xaa');
  respuesta = () => { throw new Error('network error'); };
  await assert.rejects(proveedor.broadcastTransaction('5'), /network error/);
  assert.notEqual(g.m._rechazoAlto, true);
  respuesta = () => { throw new Error('could not coalesce error (error={ "message": "nonce too high: tx: 5 state: 1" })'); };
  await assert.rejects(proveedor.broadcastTransaction('5'), /nonce too high/);
  assert.equal(g.m._rechazoAlto, true);
});

// ── Qué significa que un envío falle ────────────────────────────────────────
function envios(extra = {}) {
  const pedidos = [], c = { console: quiet, setTimeout: (f) => { queueMicrotask(f); return { unref() {} }; }, Promise, Number, Math,
    relayerNonceManager: { async getNextNonce(t) { pedidos.push(t); return 100 + pedidos.length; } }, provider: {}, ...extra };
  vm.createContext(c);
  vm.runInContext(['relayerTextoDeError', 'relayerRechazoDeNonce', 'relayerRechazoSeguro', 'relayerEnviarConNonce', 'relayerFirmaMuerta'].map(decl).join('\n'), c);
  return { c, pedidos };
}
const coalesce = (m) => Object.assign(new Error(`could not coalesce error (error={ "code": -32000, "message": "${m}" }, code=UNKNOWN_ERROR)`), { code: 'UNKNOWN_ERROR', shortMessage: 'could not coalesce error' });
const alto = () => coalesce('nonce too high: address 0x1, tx: 9 state: 3');

test('qué rechazos prueban que nada quedó vivo (y un error de red NO)', () => {
  const { c } = envios();
  for (const e of [alto(), Object.assign(new Error('nonce has already been used'), { code: 'NONCE_EXPIRED' }), Object.assign(new Error('x'), { code: 'REPLACEMENT_UNDERPRICED' }),
    Object.assign(new Error('insufficient funds for gas'), { code: 'INSUFFICIENT_FUNDS' }), coalesce('max fee per gas less than block base fee'), coalesce('Bandwidth limit exceeded'),
    Object.assign(new Error('transaction execution reverted'), { receipt: { status: 0 } })]) assert.equal(c.relayerRechazoSeguro(e), true, e.message);
  for (const e of [new Error('network error'), new Error('timeout'), new Error('already known'), Object.assign(new Error('wait for transaction timeout'), { code: 'TIMEOUT' }), null])
    assert.equal(c.relayerRechazoSeguro(e), false, String(e && e.message));
});

test('nonce alto: se reenvía una vez el mismo y luego pide otro; a la tercera entra', async () => {
  const { c, pedidos } = envios(); const usados = [], envio = {};
  const tx = await c.relayerEnviarConNonce('t', async (n) => { usados.push(n); if (usados.length < 3) throw alto(); return { hash: 'h' }; }, envio);
  assert.equal(tx.hash, 'h');
  assert.deepEqual(usados, [101, 101, 102]);
  assert.deepEqual(pedidos, ['t', 't:r1']);
  assert.equal(envio.sinEfecto, false, 'lo que salió bien puede estar vivo');
});

test('nonce bajo: otro nonce a la primera', async () => {
  const { c } = envios(); const usados = [];
  await c.relayerEnviarConNonce('t', async (n) => { usados.push(n); if (usados.length < 2) throw Object.assign(new Error('nonce too low'), { code: 'NONCE_EXPIRED' }); return {}; });
  assert.deepEqual(usados, [101, 102]);
});

test('un error ambiguo NUNCA se repite: ejecutaría dos veces', async () => {
  const { c, pedidos } = envios(); const envio = {}; let n = 0;
  await assert.rejects(c.relayerEnviarConNonce('t', async () => { n++; throw new Error('network response lost'); }, envio), /lost/);
  assert.equal(n, 1); assert.equal(pedidos.length, 1);
  assert.equal(envio.sinEfecto, false, 'pudo entrar: queda en duda');
});

test('rechazos sin fin: se rinde con tope y deja dicho que no hay nada vivo', async () => {
  const { c } = envios(); const envio = {}; let n = 0;
  await assert.rejects(c.relayerEnviarConNonce('t', async () => { n++; throw alto(); }, envio), /nonce too high/);
  assert.equal(n, 7); assert.equal(envio.sinEfecto, true);
});

test('una firma solo está muerta con prueba', async () => {
  let recibo = null;
  const { c } = envios({ provider: { async getTransactionReceipt() { return recibo; } } });
  assert.equal(await c.relayerFirmaMuerta(alto(), '0xa'), true, 'alta: el nodo no la guarda');
  assert.equal(await c.relayerFirmaMuerta(Object.assign(new Error('x'), { code: 'NONCE_EXPIRED' }), '0xa'), true, 'nonce gastado y sin recibo propio');
  recibo = { status: 1 };
  assert.equal(await c.relayerFirmaMuerta(Object.assign(new Error('x'), { code: 'NONCE_EXPIRED' }), '0xa'), false, 'nonce gastado POR ELLA: viva');
  assert.equal(await c.relayerFirmaMuerta(new Error('network error'), '0xa'), false, 'no se sabe: viva');
  assert.equal(await c.relayerFirmaMuerta(new Error('already known'), '0xa'), false);
});

// ── mintGatherReward / burnItemOnChain: el aviso de envio.sinEfecto ─────────
function cadena(opciones = {}) {
  const llamadas = [];
  const metodo = (nombre) => {
    const f = async (...a) => { llamadas.push(nombre); return opciones.enviar ? opciones.enviar(nombre, a) : { hash: '0xh', wait: async () => ({ logs: [] }) }; };
    f.estimateGas = async () => { if (opciones.estimar) throw opciones.estimar; return 100n; };
    return f;
  };
  const contrato = { getTipoStats: async () => ({ perInvoiceLimit: 50 }), getUserInventorySnapshot: async () => opciones.facturas || [],
    createInvoice: metodo('createInvoice'), increaseInvoiceQuantity: metodo('increaseInvoiceQuantity'), deleteInvoice: metodo('deleteInvoice'), decreaseInvoiceQuantity: metodo('decreaseInvoiceQuantity'),
    interface: { parseLog: () => null } };
  const c = { ethers: { Contract: function () { return contrato; } }, crypto, Set, Date, Math, Number, BigInt, String, Promise, console: quiet, setTimeout: (f) => { queueMicrotask(f); return { unref() {} }; },
    relayerWallet: { address: '0xr' }, CONTRACTS: { ITEMS_CONTRACT: { address: 'c', abi: [] } }, gatherGasPrice: () => 1n, ensureItemTipoOnChain: opciones.asegurar || (async () => {}),
    facturasGuardadasEnCofres: async () => new Set(), relayerNonceManager: { async getNextNonce() { return 7; }, async resetNonce() {} }, provider: {} };
  vm.createContext(c);
  vm.runInContext(['relayerTextoDeError', 'relayerRechazoDeNonce', 'relayerRechazoSeguro', 'relayerEnviarConNonce', 'mintGatherReward', 'burnItemOnChain'].map(decl).join('\n'), c);
  return { c, llamadas };
}
const espera = (e) => ({ hash: '0xh', wait: async () => { throw e; } });

test('acuñar: sin enviar nada, sinEfecto; enviada y sin confirmar, en duda; revertida, sinEfecto', async () => {
  let envio = {};
  assert.equal(await cadena({ estimar: new Error('reverted') }).c.mintGatherReward('o', 't', 1, envio), null);
  assert.equal(envio.sinEfecto, true, 'la estimación falló: no salió nada');
  envio = {};
  await assert.rejects(cadena({ asegurar: async () => { throw new Error('resource_capacity_exhausted'); } }).c.mintGatherReward('o', 't', 1, envio));
  assert.equal(envio.sinEfecto, true, 'sin cupo: no salió nada');
  envio = {};
  assert.equal(await cadena({ enviar: () => espera(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })) }).c.mintGatherReward('o', 't', 1, envio), null);
  assert.equal(envio.sinEfecto, false, 'pudo minarse');
  assert.equal(envio.hash, '0xh', 'y su hash queda para revisarla');
  envio = {};
  assert.equal(await cadena({ enviar: () => espera(Object.assign(new Error('reverted'), { receipt: { status: 0 } })) }).c.mintGatherReward('o', 't', 1, envio), null);
  assert.equal(envio.sinEfecto, true, 'minada y revertida: sin efecto');
  envio = {};
  const ok = await cadena().c.mintGatherReward('o', 't', 1, envio);
  assert.ok(ok); assert.equal(envio.sinEfecto, false);
});

test('acuñar sin `envio` sigue funcionando para los demás que lo llaman', async () => {
  assert.ok(await cadena().c.mintGatherReward('o', 't', 1));
  assert.equal(await cadena({ estimar: new Error('x') }).c.mintGatherReward('o', 't', 1), null);
});

test('quemar: cuenta lo confirmado; lo siguiente rechazado no deja duda, lo no confirmado sí', async () => {
  const facturas = [{ id: 1, active: true, tipo: 't', cantidad: 2n }, { id: 2, active: true, tipo: 't', cantidad: 3n }];
  let envio = {}, n = 0;
  assert.equal(await cadena({ facturas, enviar: () => { if (++n === 2) throw alto(); return { hash: '0xh', wait: async () => ({}) }; } }).c.burnItemOnChain('o', 't', 4, envio), 4, 'el reintento entra');
  envio = {}; n = 0;
  const siempreAlto = cadena({ facturas, enviar: () => { if (++n > 1) throw alto(); return { hash: '0xh', wait: async () => ({}) }; } });
  assert.equal(await siempreAlto.c.burnItemOnChain('o', 't', 4, envio), 2);
  assert.equal(envio.sinEfecto, true, 'la primera factura contada; la segunda, rechazada');
  envio = {}; n = 0;
  assert.equal(await cadena({ facturas, enviar: () => { n++; return n === 1 ? { hash: '0xh', wait: async () => ({}) } : espera(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })); } }).c.burnItemOnChain('o', 't', 4, envio), 2);
  assert.equal(envio.sinEfecto, false, 'la segunda pudo minarse: en duda');
  envio = {};
  assert.equal(await cadena({ facturas: [] }).c.burnItemOnChain('o', 't', 4, envio), 0);
  assert.equal(envio.sinEfecto, true, 'no tenía nada que quemar');
  // Nunca espera sin tope a la confirmación: dejaba la cola del jugador colgada.
  assert.match(decl('burnItemOnChain'), /tx\.wait\(1, 120000\)/);
});
