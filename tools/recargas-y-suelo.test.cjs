'use strict';
/* (2026-10-27) LAS RECARGAS DE ORO Y LAS REGLAS DEL SUELO
 *   · "en el panel de recargas, el tx de su historial: si se le va la luz y no
 *     le caen las monedas, que pueda reclamar con el tx";
 *   · "el dinero de comprar esas monedas debe ir a la wallet admin" (y la propia
 *     cartera del juego no se compra oro a sí misma: sería oro gratis);
 *   · "uno de nivel 2 no puede recoger lo de nivel 11 que le suelta uno de nivel 12";
 *   · "suspender por días o bloquear que un usuario suelte objetos".
 * Las rutas REALES de server2.js con Mongo y cadena de mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
function trozo(fuente, inicio, fin) {
  const i = fuente.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio);
  const j = fuente.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return fuente.slice(i, j + fin.length);
}
const YO = '0x' + 'a'.repeat(40), OTRO = '0x' + 'b'.repeat(40), TESORO = '0x' + 'c'.repeat(40);

/** El Mongo de mentira de economia.test.cjs, con lo que usan también reclamar y el panel. */
function modelo() {
  const t = [];
  const val = (d, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d);
  const casa = (d, q) => Object.entries(q || {}).every(([k, v]) => {
    if (k === '$or') return v.some((x) => casa(d, x));
    const x = val(d, k);
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      return Object.entries(v).every(([op, w]) => {
        const a = x instanceof Date ? x.getTime() : x, b = w instanceof Date ? w.getTime() : w;
        return op === '$in' ? w.includes(x) : op === '$ne' ? x !== w : op === '$gte' ? a >= b : op === '$lte' ? a <= b : op === '$lt' ? a < b
          : op === '$exists' ? (x !== undefined) === w : false;
      });
    }
    return x === v;
  });
  const poner = (d, k, v) => { const p = k.split('.'); let o = d; while (p.length > 1) { const q = p.shift(); o = o[q] = o[q] || {}; } o[p[0]] = v; };
  const aplicar = (d, u) => {
    for (const [k, v] of Object.entries(u.$set || {})) poner(d, k, v);
    for (const [k, v] of Object.entries(u.$inc || {})) poner(d, k, (val(d, k) || 0) + v);
  };
  const cur = (f) => { const c = { sort(s) { const [[k, o]] = Object.entries(s); f.sort((a, b) => (a[k] > b[k] ? o : a[k] < b[k] ? -o : 0)); return c; }, limit(n) { f = f.slice(0, n); return c; }, select() { return c; }, lean: async () => f.map((x) => ({ ...x })) }; return c; };
  const uno = (d) => ({ select() { return this; }, lean: async () => (d ? JSON.parse(JSON.stringify(d)) : null), sort() { return this; } });
  return {
    _t: t,
    find: (q) => cur(t.filter((d) => casa(d, q))),
    findOne: (q) => { const f = t.filter((d) => casa(d, q)); const o = uno(f[0]); o.sort = (s) => { const [[k, w]] = Object.entries(s); f.sort((a, b) => (a[k] > b[k] ? w : a[k] < b[k] ? -w : 0)); return uno(f[0]); }; return o; },
    findById: (id) => uno(t.find((d) => d._id === id)),
    distinct: async (k, q) => [...new Set(t.filter((d) => casa(d, q)).map((d) => val(d, k)))],
    create: async (d) => { if (d.txHash && t.some((x) => x.txHash === d.txHash)) { const e = new Error('dup'); e.code = 11000; throw e; } const x = { ...d }; t.push(x); return { ...x, toObject: () => ({ ...x }) }; },
    updateOne: async (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); if (!d && o.upsert) { d = { ...(q._id ? { _id: q._id } : {}) }; t.push(d); } if (d) aplicar(d, u); return { matchedCount: d ? 1 : 0 }; },
    findOneAndUpdate: (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); if (!d && o.upsert) { d = { ...(q._id ? { _id: q._id } : {}) }; t.push(d); } if (d) aplicar(d, u); return uno(d); },
    init: async () => {}
  };
}

function economia(op = {}) {
  const rutas = new Map(), devueltos = [], alertas = [];
  const M = { EconomiaDia: modelo(), CompraOro: modelo(), TesoroJuego: modelo(), Tesoro: modelo(), TesoroMov: modelo() };
  const crear = M.CompraOro.create;
  M.CompraOro.create = (d) => crear({ estado: 'cotizada', creada: new Date(), ...d });
  const cadena = op.cadena || {};
  const stats = { oro: 10, plata: 0, bronce: 0 };
  class Schema { constructor() {} index() {} }
  const nada = (req, res, next) => next && next();
  let sesion = { playerName: 'Ana', address: op.yo || YO };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Number, String, Date, Object, JSON, BigInt, Promise, Array, Map, Set, isFinite,
    process: { env: op.env || {} }, crypto, setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }),
    mongoose: { Schema, models: M, connection: { readyState: 0 } },
    app: { get: (p, ...h) => rutas.set('GET ' + p, h[h.length - 1]), post: (p, ...h) => rutas.set('POST ' + p, h[h.length - 1]) },
    apiLimiter: nada, strictLimiter: nada, authMiddleware: nada, csrfProtection: nada, adminAuth: nada,
    jugadorDeLaSesion: async () => ({ ...sesion }),
    enColaDelJugador: async (k, fn) => fn(),
    gfAlertar: (tipo) => alertas.push(tipo),
    PlayerStats: { aggregate: async () => [{ oro: 100, plata: 1000, bronce: 5000, n: 3 }], findOne: () => ({ lean: async () => ({ ...stats }) }) },
    Tesoro: M.Tesoro, TesoroJuego: M.TesoroJuego, TesoroMov: M.TesoroMov,
    TESORO_ID: 'principal', TESORO_JUEGO_ID: 'juego', TESORO_JUEGO_ORIGENES: ['tienda', 'p2p', 'viajes', 'vip', 'revivir', 'admin'],
    TESORO_BRONCE_POR: { bronce: 1, plata: 1000, oro: 1000000 }, TESORO_COMISION_BPS: 500, TESORO_CIRCULAR_BPS: 150,
    CAMBIO_COMISION_BPS: { oro: 100, plata: 200, bronce: 300 }, CHAIN_ID: 4441, CHAIN_SETTLE_DELAY_MS: 60000,
    relayerWallet: { address: TESORO }, tesoroPublico: (x) => x || {},
    _diaUTC: () => new Date().toISOString().slice(0, 10),
    gfDevolverStat: async (n, s, c) => { devueltos.push([n, s, c]); stats[s] += c; return { ...stats }; },
    buildStatsResponse: (d) => ({ oro: d.oro }),
    provider: {
      send: async () => '0x1159',
      getTransaction: async (h) => (cadena[h] ? { from: cadena[h].from, to: cadena[h].to, value: cadena[h].valor, data: '0x', chainId: 4441n } : null),
      getTransactionReceipt: async (h) => (cadena[h] && !cadena[h].pendiente ? { status: cadena[h].revertida ? 0 : 1, blockNumber: 10 } : null),
      getBlockNumber: async () => 12,
      getBlock: async () => ({ timestamp: Math.floor(Date.now() / 1000) })
    }
  });
  // New atomic credit path: exercise the actual transaction helper with a rollback-capable DB double.
  ctx.PlayerStats.findOneAndUpdate = async (q, u) => {
    if (u.$inc && u.$inc.oro) { stats.oro += u.$inc.oro; devueltos.push(['Ana', 'oro', u.$inc.oro]); }
    return { ...stats };
  };
  require('./economy-mock-transactions.cjs')(ctx, Object.values(M), [stats]);
  vm.runInContext(trozo(SRV, 'async function ecoTransaccion(', '\n}\n'), ctx);
  // (2026-10-28) La economía, 2.ª parte: la foto del día usa el fondo de reserva, el índice de precios y la
  // inflación neta. Sus funciones de verdad; lo demás, de mentira (sus pruebas: tools/economia2.test.cjs).
  Object.assign(ctx, { TesoroReserva: modelo(), TESORO_RESERVA_ID: 'reserva', eco2MigrarReserva: async () => {}, eco2TrasFoto: async () => {},
    eco2Config: async () => ({ indiceActivo: true, sensibilidad: 0.6, pasoMax: 0.03, pesoObjetos: 1 }) });
  vm.runInContext(['eco2IndiceObjetivo', 'eco2Masas', 'eco2Inflaciones'].map((n) => trozo(SRV, 'function ' + n + '(', '\n}\n')).join('\n'), ctx);
  const fin = "console.log('✅ Economía:";
  const codigo = trozo(SRV, 'const ECONOMIA_CONFIG_BASE = ', fin).slice(0, -fin.length);
  vm.runInContext(codigo, ctx);
  const llamar = async (clave, body) => {
    let st = 200, out = null;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; } };
    await rutas.get(clave)({ body: body || {}, user: { address: sesion.address }, admin: { address: '0x' + 'e'.repeat(40) }, query: {} }, res);
    return { st, out: JSON.parse(JSON.stringify(out)) };
  };
  return { M, llamar, devueltos, cadena, alertas };
}

test('recargas: el historial trae el tx de cada una; la cartera del juego no se compra oro a sí misma', { skip: !HAY }, async () => {
  const b = economia();
  const c = await b.llamar('POST /api/currency/oro/cotizar', { oro: 10 });
  const H = '0x' + '1'.repeat(64);
  b.cadena[H] = { from: YO, to: TESORO, valor: BigInt(c.out.wei) };
  assert.equal((await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: H })).out.oro, 10);
  const e = await b.llamar('GET /api/currency/oro/estado');
  assert.equal(e.out.historial.length, 1);
  assert.equal(e.out.historial[0].txHash, H); assert.equal(e.out.historial[0].estado, 'acreditada'); assert.equal(e.out.historial[0].oroDado, 10);
  assert.ok(e.out.historial[0].pagado > 0);
  // Quien juega con la cartera que cobra no puede comprarse oro (pagaría y cobraría él mismo).
  const t = economia({ yo: TESORO });
  const m = await t.llamar('POST /api/currency/oro/cotizar', { oro: 5 });
  assert.equal(m.st, 409); assert.equal(m.out.error, 'misma_cartera');
});

test('recargas: sin cartera en el panel, el zkLTC va a la del administrador (ADMIN_ADDRESSES)', { skip: !HAY }, async () => {
  const ADMIN = '0x' + 'f'.repeat(40);
  const b = economia({ env: { ADMIN_ADDRESSES: ' ' + ADMIN.toUpperCase().replace('0X', '0x') + ',0x' + '9'.repeat(40) } });
  const c = await b.llamar('POST /api/currency/oro/cotizar', { oro: 3 });
  assert.equal(c.out.destino, ADMIN);
});

test('reclamar con el tx: el pago casa con su cotización perdida y se da el oro UNA vez', { skip: !HAY }, async () => {
  const b = economia();
  const c = await b.llamar('POST /api/currency/oro/cotizar', { oro: 20 });
  const H = '0x' + '2'.repeat(64);
  b.cadena[H] = { from: YO, to: TESORO, valor: BigInt(c.out.wei) };
  // "Se fue la luz": no hubo confirmar. Con el hash, desde el historial.
  const r = await b.llamar('POST /api/currency/oro/reclamar', { txHash: H });
  assert.equal(r.st, 200, JSON.stringify(r.out)); assert.equal(r.out.oro, 20);
  assert.equal(b.M.CompraOro._t[0].estado, 'acreditada'); assert.equal(b.M.CompraOro._t[0].reclamada, true);
  const otra = await b.llamar('POST /api/currency/oro/reclamar', { txHash: H });
  assert.equal(otra.out.repetida, true); assert.equal(b.devueltos.length, 1, 'el mismo tx no da oro dos veces');
  // Un pago sin ninguna cotización (se perdió): al precio de ahora, a la cartera del juego.
  const H2 = '0x' + '3'.repeat(64);
  b.cadena[H2] = { from: YO, to: TESORO, valor: 7n * 1000000n * 1000000000n };
  const r2 = await b.llamar('POST /api/currency/oro/reclamar', { txHash: H2 });
  assert.equal(r2.st, 200, JSON.stringify(r2.out)); assert.equal(r2.out.oro, 7);
  assert.equal(b.M.CompraOro._t.length, 2); assert.equal(b.M.CompraOro._t[1].reclamada, true);
});

test('reclamar con el tx: lo que NO vale', { skip: !HAY }, async () => {
  const b = economia();
  await b.llamar('POST /api/currency/oro/cotizar', { oro: 5 });
  const DE_OTRO = '0x' + '4'.repeat(64), A_OTRO = '0x' + '5'.repeat(64), PEND = '0x' + '6'.repeat(64), NADA = '0x' + '7'.repeat(64), MAL = '0x' + '8'.repeat(64);
  b.cadena[DE_OTRO] = { from: OTRO, to: TESORO, valor: 5n * 1000000n * 1000000000n };
  b.cadena[A_OTRO] = { from: YO, to: OTRO, valor: 5n * 1000000n * 1000000000n };
  b.cadena[PEND] = { from: YO, to: TESORO, valor: 1n, pendiente: true };
  b.cadena[MAL] = { from: YO, to: TESORO, valor: 1n, revertida: true };
  assert.equal((await b.llamar('POST /api/currency/oro/reclamar', { txHash: DE_OTRO })).out.error, 'otra_cartera');
  assert.ok(b.alertas.includes('recarga_cartera_ajena'), 'el intento queda en el centro de control');
  assert.equal((await b.llamar('POST /api/currency/oro/reclamar', { txHash: A_OTRO })).out.error, 'otro_destino');
  assert.equal((await b.llamar('POST /api/currency/oro/reclamar', { txHash: PEND })).st, 202);
  assert.equal((await b.llamar('POST /api/currency/oro/reclamar', { txHash: NADA })).out.error, 'no_encontrada');
  assert.equal((await b.llamar('POST /api/currency/oro/reclamar', { txHash: MAL })).out.error, 'revertida');
  assert.equal((await b.llamar('POST /api/currency/oro/reclamar', { txHash: 'hola' })).out.error, 'hash_invalido');
  assert.equal(b.devueltos.length, 0, 'nada de oro');
});

/* ── EL SUELO: la ruta real de recoger y la de soltar ───────────────────── */
function suelo(op = {}) {
  const rutas = new Map(), alertas = [], acunados = [];
  const montones = new Map();
  const yo = op.yo || { playerName: 'Bea', Username: 'Bea', address: OTRO };
  const nada = (req, res, next) => next && next();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Number, String, Date, Object, JSON, Promise, Map, Set, crypto,
    setInterval: () => ({ unref() {} }),
    app: { get: (p, ...h) => rutas.set('GET ' + p, h[h.length - 1]), post: (p, ...h) => rutas.set('POST ' + p, h[h.length - 1]) },
    apiLimiter: nada, authMiddleware: nada, csrfProtection: nada, gfExigeNombre: nada, gfExigeVip: nada,
    jugadorDeLaSesion: async () => ({ ...yo }), esFantasma: async () => false, responderFantasma: (res) => res.status(409).json({ error: 'fantasma' }),
    _sueloSalvaje: montones, _salaYPosicion: () => ({ sala: 'salvaje', x: 100, y: 100 }), esSalaSalvaje: () => true, SUELO_ALCANCE: 260,
    gfNivelDeObjeto: (id) => ({ cofre3: 7, espada_cobre: 4 }[id] || 1), gfNivelDeJugador: async () => op.nivel || 2,
    gfAlertar: (tipo, g, gp, datos) => alertas.push([tipo, datos]), gfSueloRecogido: () => {}, gfSueloSoltado: () => {},
    gfCastigoSoltar: async () => op.castigo || null, relayerWallet: {},
    io: { to: () => ({ emit() {} }) }, _ticketSuelo: () => null, _montonPublico: (m) => ({ id: m.id }), _avisarJugadorSuelo() {},
    enColaDelJugador: async (k, fn) => fn(), itemTipoOnChain: (id) => id,
    mintGatherReward: async (a, tipo, n) => { acunados.push([a, tipo, n]); return { id: 9, manualId: 'g', cantidad: n }; },
    GamePlayer: { findOne: async () => null }, ponerFacturaEnSlots: () => ({}),
    res: null
  });
  vm.runInContext(trozo(SRV, "app.post('/api/salvaje/recoger',", '\n});\n'), ctx);
  vm.runInContext(trozo(SRV, "app.post('/api/salvaje/soltar',", '\n});\n'), ctx);
  const llamar = async (clave, body) => {
    let st = 200, out = null;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; } };
    await rutas.get(clave)({ body: body || {}, user: { address: yo.address } }, res);
    return { st, out: JSON.parse(JSON.stringify(out)) };
  };
  return { llamar, montones, alertas, acunados };
}

test('recoger del suelo: por debajo del nivel del objeto no se recoge lo de otro (y queda el intento)', { skip: !HAY }, async () => {
  const b = suelo({ nivel: 2 });
  b.montones.set('m1', { id: 'm1', sala: 'salvaje', itemId: 'cofre3', cantidad: 1, x: 100, y: 120, de: 'Ana', deNombre: 'AnaFarm', hasta: Date.now() + 60000 });
  const r = await b.llamar('POST /api/salvaje/recoger', { id: 'm1' });
  assert.equal(r.out.ok, false); assert.equal(r.out.motivo, 'nivel'); assert.equal(r.out.nivelRequerido, 7);
  assert.equal(b.acunados.length, 0, 'no se acuña nada');
  assert.equal(b.montones.get('m1').recogiendo, undefined, 'el montón sigue libre en el suelo');
  assert.equal(b.alertas[0][0], 'recoger_nivel'); assert.equal(b.alertas[0][1].de, 'Ana');
  // Lo de nivel 1 sí.
  b.montones.set('m2', { id: 'm2', sala: 'salvaje', itemId: 'palo', cantidad: 3, x: 100, y: 120, de: 'Ana', deNombre: 'AnaFarm', hasta: Date.now() + 60000 });
  const r2 = await b.llamar('POST /api/salvaje/recoger', { id: 'm2' });
  assert.equal(r2.out.ok, true, JSON.stringify(r2.out)); assert.equal(b.acunados.length, 1);
  // Y lo que soltó uno mismo, siempre (aunque sea de más nivel).
  const c = suelo({ nivel: 2, yo: { playerName: 'Ana', Username: 'AnaFarm', address: YO } });
  c.montones.set('m3', { id: 'm3', sala: 'salvaje', itemId: 'cofre3', cantidad: 1, x: 100, y: 120, de: 'Ana', deNombre: 'AnaFarm', hasta: Date.now() + 60000 });
  assert.equal((await c.llamar('POST /api/salvaje/recoger', { id: 'm3' })).out.ok, true);
});

test('soltar: suspendido o bloqueado no suelta nada (y queda el intento)', { skip: !HAY }, async () => {
  const hasta = new Date(Date.now() + 86400000);
  const b = suelo({ castigo: { permanente: false, hasta } });
  const r = await b.llamar('POST /api/salvaje/soltar', { itemId: 'palo', cantidad: 1 });
  assert.equal(r.st, 403); assert.equal(r.out.error, 'soltar_suspendido'); assert.match(r.out.message, /until/);
  assert.equal(b.alertas[0][0], 'soltar_suspendido');
  const c = suelo({ castigo: { permanente: true } });
  const r2 = await c.llamar('POST /api/salvaje/soltar', { itemId: 'palo' });
  assert.equal(r2.out.error, 'soltar_suspendido'); assert.equal(r2.out.permanente, true); assert.match(r2.out.message, /blocked/);
});
