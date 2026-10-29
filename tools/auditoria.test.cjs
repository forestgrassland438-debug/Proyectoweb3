'use strict';
/* (2026-10-27) LA AUDITORÍA DE LA TIENDA, DEL P2P Y DEL SUELO, Y LOS NIVELES DE LOS OBJETOS
 *   · "quién compró, cuánto gastó y si pagó o no; si el gasto al comprar y al
 *     vender es el correcto; cualquier error de compra o venta en el historial";
 *   · "quién recogió un dropeo y de quién, y si se lo pasó a otro (un explorer)";
 *   · "suspender por días o bloquear que un usuario suelte objetos";
 *   · "todos los objetos tienen un nivel; uno de nivel 2 no recoge lo de nivel 11";
 *   · "los intentos desesperados, en el centro de control con carteras y nombres".
 * El bloque REAL de server2.js ("AUDITORÍA") con un Mongo de mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const leer = (f) => fs.readFileSync(path.join(BIN, f), 'utf8').replace(/\r\n/g, '\n');
function trozo(fuente, inicio, fin) {
  const i = fuente.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio);
  const j = fuente.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return fuente.slice(i, j + fin.length);
}

/** Un Mongo de mentira con lo que usa el bloque ($set, $setOnInsert, $inc, $addToSet, $max, upsert…). */
function modelo() {
  const t = [];
  const val = (d, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d);
  const cmp = (x, op, w) => {
    const a = x instanceof Date ? x.getTime() : x, b = w instanceof Date ? w.getTime() : w;
    if (op === '$in') return w.includes(x);
    if (op === '$ne') return x !== w;
    if (op === '$gte') return a >= b; if (op === '$gt') return a > b;
    if (op === '$lt') return a < b; if (op === '$lte') return a <= b;
    if (op === '$exists') return (x !== undefined) === w;
    throw new Error('operador sin hacer: ' + op);
  };
  const casa = (d, q) => Object.entries(q || {}).every(([k, v]) => {
    if (k === '$or') return v.some((x) => casa(d, x));
    const x = val(d, k);
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp)) return Object.entries(v).every(([op, w]) => cmp(x, op, w));
    if (v instanceof RegExp) return typeof x === 'string' && v.test(x);
    if (Array.isArray(x)) return x.includes(v);
    return x === v;
  });
  const poner = (d, k, v) => { const p = k.split('.'); let o = d; while (p.length > 1) { const q = p.shift(); o = o[q] = o[q] || {}; } o[p[0]] = v; };
  const aplicar = (d, u, nuevo) => {
    for (const [k, v] of Object.entries(u.$set || {})) poner(d, k, v);
    if (nuevo) for (const [k, v] of Object.entries(u.$setOnInsert || {})) poner(d, k, v);
    for (const [k, v] of Object.entries(u.$inc || {})) poner(d, k, (val(d, k) || 0) + v);
    for (const [k, v] of Object.entries(u.$max || {})) { const x = val(d, k); if (x === undefined || v > x) poner(d, k, v); }
    for (const [k, v] of Object.entries(u.$addToSet || {})) {
      const arr = Array.isArray(val(d, k)) ? val(d, k) : [];
      for (const x of (v && v.$each) ? v.$each : [v]) if (!arr.includes(x)) arr.push(x);
      poner(d, k, arr);
    }
  };
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const cur = (f) => { const c = { sort(s) { const [[k, o]] = Object.entries(s); f = f.slice().sort((a, b) => { const x = val(a, k), y = val(b, k); const xa = x instanceof Date ? x.getTime() : new Date(x).getTime() || x, ya = y instanceof Date ? y.getTime() : new Date(y).getTime() || y; return xa > ya ? o : xa < ya ? -o : 0; }); return c; }, limit(n) { f = f.slice(0, n); return c; }, select() { return c; }, lean: async () => f.map((x) => ({ ...x })), toArray: async () => f.map((x) => ({ ...x })) }; return c; };
  const uno = (d) => { const o = { select() { return o; }, lean: async () => (d ? { ...d } : null), catch() { return o; }, then: (a, b) => Promise.resolve(d ? { ...d } : null).then(a, b) }; return o; };
  const upd = (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); let nuevo = false; if (!d && o.upsert) { d = q._id !== undefined ? { _id: q._id } : {}; t.push(d); nuevo = true; } if (d) aplicar(d, u, nuevo); return { d, r: { matchedCount: d && !nuevo ? 1 : 0, upsertedCount: nuevo ? 1 : 0 } }; };
  return {
    _t: t,
    find: (q) => cur(t.filter((d) => casa(d, q))),
    findOne: (q) => uno(t.find((d) => casa(d, q))),
    findById: (id) => uno(t.find((d) => d._id === id)),
    countDocuments: async (q) => t.filter((d) => casa(d, q)).length,
    create: async (d) => { if (d._id !== undefined && t.some((x) => x._id === d._id)) { const e = new Error('dup'); e.code = 11000; throw e; } const x = { ...d }; t.push(x); return { ...x, toObject: () => ({ ...x }) }; },
    insertMany: async (ds) => { ds.forEach((d) => t.push({ _id: crypto.randomBytes(6).toString('hex'), ...d })); return ds; },
    updateOne: async (q, u, o) => upd(q, u, o).r,
    updateMany: async (q, u) => { const ds = t.filter((d) => casa(d, q)); ds.forEach((d) => aplicar(d, u, false)); return { matchedCount: ds.length }; },
    deleteOne: async (q) => { const i = t.findIndex((d) => casa(d, q)); if (i >= 0) t.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    distinct: async (k, q) => [...new Set(t.filter((d) => casa(d, q)).map((d) => val(d, k)))],
    aggregate: async () => [],
    init: async () => {},
    _copia: copia
  };
}

const ANA = { playerName: 'Ana', Username: 'AnaFarm', address: '0x' + 'a'.repeat(40), nivel_exp: 1 };
const BEA = { playerName: 'Bea', Username: 'Bea', address: '0x' + 'b'.repeat(40), nivel_exp: 1 };
const CRIS = { playerName: 'Cris', Username: 'Cris', address: '0x' + 'c'.repeat(40), nivel_exp: 1 };

function bloque(op = {}) {
  const rutas = new Map(), relojes = [];
  const M = {};
  const niveles = Object.assign({ Ana: 12, Bea: 2, Cris: 9 }, op.niveles || {});
  class Schema { constructor() {} index() {} }
  const mongoose = { Schema, models: {}, model: (n) => (M[n] = M[n] || modelo()), connection: { collection: (n) => (M['col:' + n] = M['col:' + n] || modelo()) } };
  const GamePlayer = modelo();
  [ANA, BEA, CRIS].forEach((g) => GamePlayer._t.push({ ...g }));
  let sesion = ANA;
  const nada = (req, res, next) => next && next();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Number, String, Date, Object, JSON, BigInt, Promise, Array, Map, Set, isFinite, RegExp, URLSearchParams,
    process: { env: {} }, crypto, setTimeout: (fn, ms) => { relojes.push(fn); return { unref() {} }; }, setInterval: () => ({ unref() {} }),
    mongoose, app: { get: (p, ...h) => rutas.set('GET ' + p, h[h.length - 1]), post: (p, ...h) => rutas.set('POST ' + p, h[h.length - 1]) },
    apiLimiter: nada, strictLimiter: nada, authMiddleware: nada, csrfProtection: nada, adminAuth: nada,
    jugadorDeLaSesion: async () => ({ ...sesion }),
    GamePlayer, VipEstado: modelo(), CompraOro: modelo(), TesoroJuego: modelo(), TESORO_JUEGO_ID: 'juego',
    gfNivelDeJugador: async (gp) => niveles[gp && gp.playerName] || 0,
    TESORO_BRONCE_POR: { bronce: 1, plata: 1000, oro: 1000000 }, TESORO_COMISION_BPS: 500,
    economiaConfig: async () => ({}), economiaDestino: () => '0x' + 'd'.repeat(40), economiaLeerPago: async () => ({ error: 'pendiente' }),
    enColaDelJugador: async (k, fn) => fn(), economiaAcreditar: async () => ({ status: 200, body: { ok: true } })
  });
  vm.runInContext(trozo(SRV, 'const TIENDA_PRECIOS = ', ';\n') + '\n' + trozo(SRV, 'function tesoroComisionTienda(itemId, operacion, cantidad) {', '\n}\n'), ctx);
  const fin = "require('./marketplace-routes')(app, {";
  const codigo = trozo(SRV, '// AUDITORÍA: RECARGAS, TIENDA, P2P, SUELO E INTENTOS', fin).slice(0, -fin.length);
  vm.runInContext(codigo + '\nthis.f = { gfNivelDeObjeto, gfEsperadoTienda, gfVerificarCobro, gfSueloSoltado, gfSueloRecogido, gfSueloCaducados, gfApuntarMovMoneda,' +
    ' gfCastigoSoltar, gfAuditarMercado, gfAlertar, GF_NIVEL_OBJETO };', ctx);
  const espera = () => new Promise((r) => setTimeout(r, 15));
  const llamar = async (clave, body, query) => {
    let st = 200, out = null;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; } };
    await rutas.get(clave)({ body: body || {}, user: { address: sesion.address }, admin: { address: '0x' + 'e'.repeat(40) }, query: query || {}, params: (body && body.__params) || {} }, res);
    await espera();
    return { st, out: JSON.parse(JSON.stringify(out)) };
  };
  return { f: ctx.f, M, llamar, relojes, espera, como: (g) => { sesion = g; } };
}

test('el nivel de cada objeto: la MISMA tabla en el servidor, en la tienda y en el suelo', { skip: !HAY }, () => {
  const srv = vm.createContext({ Object });
  vm.runInContext(trozo(SRV, 'const GF_NIVEL_OBJETO = Object.freeze({', '});') + '\nthis.t = GF_NIVEL_OBJETO;', srv);
  const cli = vm.createContext({ window: {}, Object, Number, String });
  vm.runInContext(leer('gf-niveles-objetos.js'), cli);
  assert.deepEqual(JSON.parse(JSON.stringify(cli.window.GFNivelesObjetos.tabla)), JSON.parse(JSON.stringify(srv.t)));
  // La cosecha tiene el nivel de su semilla.
  const t = srv.t;
  for (const [semilla, fruto] of [['Semillax', 'zanahoria'], ['Semillax1', 'tomate'], ['Semillax2', 'trigo'], ['Semillax3', 'calabaza'], ['Semillax4', 'fresa']]) {
    for (const c of ['buena', 'corta', 'mala']) assert.equal(t[fruto + '_' + c] || 1, t[semilla] || 1, fruto + '_' + c + ' = ' + semilla);
  }
  // Los niveles que ya tenía la tienda a mano (tomate 3, trigo 5, calabaza 6, fresa 3) se respetan.
  assert.equal(t.Semillax1, 3); assert.equal(t.Semillax2, 5); assert.equal(t.Semillax3, 6); assert.equal(t.Semillax4, 3);
  // Todo lo que se compra en la tienda tiene un nivel entre 1 y 10.
  const precios = vm.createContext({});
  vm.runInContext(trozo(SRV, 'const TIENDA_PRECIOS = ', ';\n') + '\nthis.p = TIENDA_PRECIOS;', precios);
  for (const k of Object.keys(precios.p)) { const n = t[k] || 1; assert.ok(n >= 1 && n <= 10, k + ' nivel ' + n); }
});

test('lo que se puede soltar: la MISMA lista en el servidor y en el cliente, sin herramientas que se gastan', { skip: !HAY }, () => {
  const srv = vm.createContext({ Set });
  vm.runInContext(trozo(SRV, 'const SUELO_SOLTABLES = new Set([', ']);') + '\nthis.s = [...SUELO_SOLTABLES];', srv);
  const txt = leer('gf-salvaje.js');
  const lista = trozo(txt, "  var SOLTABLES = {};", '.forEach(function (k) { SOLTABLES[k] = true; });');
  const cli = [...lista.matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(cli.slice().sort(), JSON.parse(JSON.stringify(srv.s)).sort());
  for (const h of ['hacha_de_madera', 'pico_de_madera', 'Regaderax', 'Tijerasx', 'balde_con_agua']) assert.ok(!srv.s.includes(h), h + ' no se suelta');
  for (const c of ['cofre1', 'espada_cobre', 'parcela', 'tablon_de_madera']) assert.ok(srv.s.includes(c), c + ' sí se suelta');
});

test('la tienda del juego: el servidor recalcula el precio con SU tabla y avisa si no cuadra', { skip: !HAY }, async () => {
  const b = bloque();
  // Ana (nivel 12) compra 4 semillas de tomate (15 de plata, comisión del 5 % en bronce).
  let r = await b.llamar('POST /api/tienda/registro', { ref: 'ref-compra-1', fase: 'inicio', op: 'compra', itemId: 'Semillax1', cantidad: 4, moneda: 'silver', precioUnidad: 15, total: 60, fee: 3000 });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  let op = b.M.TiendaOp._t[0];
  assert.equal(op.estado, 'en_curso'); assert.deepEqual(op.avisos || [], []); assert.equal(op.problema, false);
  assert.equal(op.esperado.precioUnidad, 15); assert.equal(op.esperado.fee, 3000); assert.equal(op.username, 'AnaFarm');
  // Termina con 3 de 4: reembolso justo de 1 × 15.
  r = await b.llamar('POST /api/tienda/registro', { ref: 'ref-compra-1', fase: 'fin', op: 'compra', itemId: 'Semillax1', cantidad: 4, moneda: 'silver', precioUnidad: 15, confirmadas: 3, reembolso: 15, guardada: true });
  op = b.M.TiendaOp._t[0];
  assert.equal(op.estado, 'parcial'); assert.equal(op.problema, true, 'una compra parcial es un problema que revisar');
  assert.ok(!(op.avisos || []).includes('reembolso_distinto'));
  assert.equal(b.relojes.length, 1, 'el cobro se verifica más tarde');
  // Un precio que no es el de la tabla.
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-compra-2', fase: 'inicio', op: 'compra', itemId: 'Semillax1', cantidad: 2, moneda: 'silver', precioUnidad: 1, total: 2 });
  op = b.M.TiendaOp._t.find((x) => x._id === 'ref-compra-2');
  assert.ok(op.avisos.includes('precio_distinto') && op.avisos.includes('total_distinto'));
  assert.ok(b.M.AlertaJuego._t.some((a) => a.tipo === 'tienda_precio' && a.playerName === 'Ana'));
  // Bea (nivel 2) compra algo de nivel 3: avisa y deja la alerta con su cartera.
  b.como(BEA);
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-compra-3', fase: 'inicio', op: 'compra', itemId: 'Semillax1', cantidad: 1, moneda: 'silver', precioUnidad: 15, total: 15 });
  const al = b.M.AlertaJuego._t.find((a) => a.tipo === 'compra_nivel');
  assert.ok(al, 'alerta de compra por debajo del nivel');
  assert.equal(al.address, BEA.address); assert.equal(al.datos.nivelRequerido, 3); assert.equal(al.datos.nivel, 2);
  // Pagar en bronce: el precio de la tabla × 1.000.
  assert.equal(b.f.gfEsperadoTienda('compra', 'Semillax', 2, 'bronce').precioUnidad, 10000);
  assert.equal(b.f.gfEsperadoTienda('compra', 'pes1', 1, 'plata').soloVenta, true, 'los peces no se compran');
  // Un fallo antes de cobrar (sin fondos) queda como rechazado, sin tumbar nada.
  r = await b.llamar('POST /api/tienda/registro', { ref: 'ref-error-1', fase: 'error', op: 'compra', itemId: 'Semillax', cantidad: 1, error: 'Insufficient funds' });
  assert.equal(b.M.TiendaOp._t.find((x) => x._id === 'ref-error-1').estado, 'rechazada');
  assert.equal((await b.llamar('POST /api/tienda/registro', { ref: 'x', fase: 'inicio', op: 'compra' })).st, 400, 'una ref rara no entra');
});

test('la venta: el pago al jugador se comprueba con la tabla (precio menos el 5 %)', { skip: !HAY }, async () => {
  const b = bloque();
  // 5 zanahorias a 14 de plata = 70.000 bronce, comisión 3.500 → 66.500.
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-venta-1', fase: 'inicio', op: 'venta', itemId: 'zanahoria_buena', cantidad: 5, moneda: 'silver', precioUnidad: 14, total: 70, fee: 3500 });
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-venta-1', fase: 'fin', op: 'venta', itemId: 'zanahoria_buena', cantidad: 5, moneda: 'silver', precioUnidad: 14, fee: 3500, confirmadas: 5, pagadoBronce: 66500 });
  let op = b.M.TiendaOp._t[0];
  assert.equal(op.estado, 'ok'); assert.ok(!(op.avisos || []).length, JSON.stringify(op.avisos));
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-venta-2', fase: 'fin', op: 'venta', itemId: 'zanahoria_buena', cantidad: 5, moneda: 'silver', precioUnidad: 14, confirmadas: 5, pagadoBronce: 90000 });
  op = b.M.TiendaOp._t.find((x) => x._id === 'ref-venta-2');
  assert.ok(op.avisos.includes('pago_distinto'), 'pagar de más se ve');
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-venta-3', fase: 'fin', op: 'venta', itemId: 'zanahoria_buena', cantidad: 2, confirmadas: 0, pagadoBronce: 0, error: 'nonce too low' });
  op = b.M.TiendaOp._t.find((x) => x._id === 'ref-venta-3');
  assert.equal(op.estado, 'no_vendida'); assert.equal(op.problema, true); assert.equal(op.error, 'nonce too low');
});

test('¿pagó o no? El servidor mira lo que cambió el saldo alrededor de la operación', { skip: !HAY }, async () => {
  const b = bloque();
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-cobro-1', fase: 'inicio', op: 'compra', itemId: 'Semillax', cantidad: 3, moneda: 'silver', precioUnidad: 10, total: 30, fee: 1500 });
  // El cliente cobró: 30 de plata (30.000 bronce) y 1.500 de comisión en bronce.
  b.f.gfApuntarMovMoneda('Ana', [{ stat: 'plata', antes: 100, despues: 70, delta: -30 }, { stat: 'bronce', antes: 2000, despues: 500, delta: -1500 }]);
  await b.espera();
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-cobro-1', fase: 'fin', op: 'compra', itemId: 'Semillax', cantidad: 3, moneda: 'silver', precioUnidad: 10, fee: 1500, confirmadas: 3, reembolso: 0, guardada: true });
  await b.f.gfVerificarCobro('ref-cobro-1');
  let op = b.M.TiendaOp._t.find((x) => x._id === 'ref-cobro-1');
  assert.equal(op.verificacion.visto, -31500); assert.equal(op.verificacion.esperado, -31500);
  assert.ok(!(op.avisos || []).length, 'cuadra: ' + JSON.stringify(op.avisos));
  // Otra compra (más tarde) cuyo cobro no llegó nunca al servidor.
  b.M.TiendaOp._t.forEach((x) => { x.t = new Date(Date.now() - 3600000); x.tFin = new Date(Date.now() - 3600000); });
  b.M.MovMoneda._t.forEach((x) => { x.t = new Date(Date.now() - 3600000); });
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-cobro-2', fase: 'inicio', op: 'compra', itemId: 'Semillax', cantidad: 1, moneda: 'silver', precioUnidad: 10, total: 10 });
  await b.llamar('POST /api/tienda/registro', { ref: 'ref-cobro-2', fase: 'fin', op: 'compra', itemId: 'Semillax', cantidad: 1, moneda: 'silver', precioUnidad: 10, confirmadas: 1 });
  await b.f.gfVerificarCobro('ref-cobro-2');
  op = b.M.TiendaOp._t.find((x) => x._id === 'ref-cobro-2');
  assert.ok(op.avisos.includes('cobro_no_visto'), JSON.stringify(op.avisos));
  await b.espera();
  assert.ok(b.M.AlertaJuego._t.some((a) => a.tipo === 'tienda_cobro'));
  // Las subidas de saldo sin ninguna operación alrededor salen en el panel.
  b.f.gfApuntarMovMoneda('Bea', [{ stat: 'oro', antes: 1, despues: 500, delta: 499 }]);
  await b.espera();
  const s = await b.llamar('GET /api/admin/auditoria/subidas', null, { dias: '7' });
  assert.equal(s.st, 200, JSON.stringify(s.out));
  assert.ok(s.out.subidas.some((x) => x.playerName === 'Bea' && x.bronce === 499000000));
});

test('el suelo: quién soltó, quién recogió y a quién se lo pasó después (el rastro)', { skip: !HAY }, async () => {
  const b = bloque();
  const A = { ...ANA }, B = { ...CRIS };
  b.f.gfSueloSoltado(A, { id: 'm1', itemId: 'espada_cobre', cantidad: 1, sala: 'salvaje', x: 10, y: 20, de: 'Ana', deNombre: 'AnaFarm' });
  await b.espera();
  b.f.gfSueloRecogido(B, { id: 'm1', itemId: 'espada_cobre', cantidad: 1, sala: 'salvaje', de: 'Ana', deNombre: 'AnaFarm' });
  await b.espera();
  b.f.gfSueloSoltado(B, { id: 'm2', itemId: 'espada_cobre', cantidad: 1, sala: 'salvaje', x: 30, y: 40, de: 'Cris', deNombre: 'Cris' });
  await b.espera();
  const m1 = b.M.SueloMov._t.find((x) => x._id === 'm1'), m2 = b.M.SueloMov._t.find((x) => x._id === 'm2');
  assert.equal(m1.estado, 'recogido'); assert.equal(m1.para.playerName, 'Cris'); assert.equal(m1.de.address, ANA.address);
  // (los arrays nacen en el contexto del vm: se comparan por su JSON)
  assert.deepEqual(JSON.parse(JSON.stringify(m2.viene)), ['m1'], 'Cris soltó lo que había recogido de Ana');
  assert.deepEqual(JSON.parse(JSON.stringify(m1.pasadoA)), ['m2']);
  const r = await b.llamar('GET /api/admin/suelo/rastro/:id', { __params: { id: 'm2' } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.antes.length, 1); assert.equal(r.out.antes[0].id, 'm1'); assert.equal(r.out.antes[0].de.playerName, 'Ana');
  const f = await b.llamar('GET /api/admin/suelo/buscar', null, { q: CRIS.address });
  assert.equal(f.out.jugador.playerName, 'Cris');
  assert.equal(f.out.soltados.length, 1); assert.equal(f.out.recogidos.length, 1);
  b.f.gfSueloCaducados(['m2']);
  await b.espera();
  assert.equal(b.M.SueloMov._t.find((x) => x._id === 'm2').estado, 'caducado');
});

test('suspender o bloquear para soltar, y levantarlo', { skip: !HAY }, async () => {
  const b = bloque();
  assert.equal(await b.f.gfCastigoSoltar('Bea'), null);
  assert.equal((await b.llamar('POST /api/admin/suelo/castigo', { jugador: 'Bea', dias: 3, motivo: 'x' })).st, 400, 'sin motivo no');
  assert.equal((await b.llamar('POST /api/admin/suelo/castigo', { jugador: 'Bea', dias: 0, motivo: 'spam de objetos' })).st, 400, 'sin días no');
  const r = await b.llamar('POST /api/admin/suelo/castigo', { jugador: BEA.address, dias: 3, motivo: 'spam de objetos' });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  const c = await b.f.gfCastigoSoltar('Bea');
  assert.ok(c && !c.permanente && new Date(c.hasta).getTime() > Date.now() + 2.9 * 86400000);
  await b.llamar('POST /api/admin/suelo/castigo', { jugador: 'Bea', permanente: true, motivo: 'reincide' });
  assert.equal((await b.f.gfCastigoSoltar('Bea')).permanente, true);
  await b.llamar('POST /api/admin/suelo/castigo/quitar', { jugador: 'Bea' });
  assert.equal(await b.f.gfCastigoSoltar('Bea'), null);
  assert.equal((await b.llamar('POST /api/admin/suelo/castigo', { jugador: 'Nadie', dias: 1, motivo: 'no existe' })).st, 404);
});

test('los intentos se agrupan (veces) y vuelven a salir sin revisar si se repiten', { skip: !HAY }, async () => {
  const b = bloque();
  for (let i = 0; i < 3; i++) b.f.gfAlertar('recoger_nivel', 'aviso', 'Bea', { itemId: 'cofre3', nivelRequerido: 7, nivel: 2 }, 'recoger_nivel:Bea:m9');
  await b.espera(); await b.espera();
  assert.equal(b.M.AlertaJuego._t.length, 1); assert.equal(b.M.AlertaJuego._t[0].veces, 3);
  await b.llamar('POST /api/admin/auditoria/alertas/:id/revisada', { __params: { id: 'recoger_nivel:Bea:m9' } });
  assert.equal(b.M.AlertaJuego._t[0].revisada, true);
  b.f.gfAlertar('recoger_nivel', 'aviso', 'Bea', { itemId: 'cofre3' }, 'recoger_nivel:Bea:m9');
  await b.espera(); await b.espera();
  assert.equal(b.M.AlertaJuego._t[0].revisada, false); assert.equal(b.M.AlertaJuego._t[0].veces, 4);
  const l = await b.llamar('GET /api/admin/auditoria/alertas', null, { q: 'Bea' });
  assert.equal(l.out.alertas.length, 1); assert.equal(l.out.alertas[0].username, 'Bea');
});

test('el P2P: cada respuesta de error queda en la auditoría con su jugador', { skip: !HAY }, async () => {
  const b = bloque();
  b.f.gfAuditarMercado({ method: 'POST', originalUrl: '/api/marketplace/buy/abc', user: { address: BEA.address }, body: { qty: 2 } }, 402, { error: 'insufficient_funds' });
  await b.espera(); await b.espera();
  const op = b.M.TiendaOp._t[0];
  assert.equal(op.tienda, 'p2p'); assert.equal(op.playerName, 'Bea'); assert.equal(op.estado, 'rechazada'); assert.match(op.error, /insufficient_funds/);
  b.f.gfAuditarMercado({ method: 'POST', originalUrl: '/api/marketplace/buy/abc', user: { address: BEA.address }, body: {} }, 503, { error: 'marketplace_transaction_unavailable' });
  await b.espera(); await b.espera();
  assert.ok(b.M.AlertaJuego._t.some((a) => a.tipo === 'p2p_error'), 'un 5xx es una alerta grave');
  const l = await b.llamar('GET /api/admin/auditoria/tienda', null, { tienda: 'p2p', solo: 'errores' });
  assert.equal(l.st, 200, JSON.stringify(l.out)); assert.equal(l.out.filas.length, 2);
});

test('el mercado P2P no deja comprar por debajo del nivel del objeto (y lo cuenta)', { skip: !HAY }, () => {
  const src = leer('marketplace-routes.js');
  assert.match(src, /async function nivelInsuficiente\(gp, itemId, tipo\)/);
  // En las tres compras: publicación, oferta y lote limitado.
  assert.equal((src.match(/await nivelInsuficiente\(/g) || []).length, 3);
  assert.match(src, /createMarketAtomic\(ctx\.mongoose, ctx\.auditarMercado\)/);
  assert.match(SRV, /auditarMercado: gfAuditarMercado,\n  nivelObjeto: gfNivelDeObjeto,\n  nivelJugador: gfNivelDeJugador,/);
  assert.equal(fs.readFileSync('C:/Users/pc/Desktop/marketplace-routes.js', 'utf8'), fs.readFileSync(path.join(BIN, 'marketplace-routes.js'), 'utf8'),
               'la copia junto a server2.js es la misma');
});
