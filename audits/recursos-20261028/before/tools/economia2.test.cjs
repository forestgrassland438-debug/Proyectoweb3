'use strict';
/* (2026-10-28) LA ECONOMÍA, 2.ª PARTE — el bloque REAL de server2.js con Mongo de mentira.
 *   · quemar monedas de un tesoro (moneda, cantidad, tesoro) y apuntarlo;
 *   · el fondo de reserva (la muerte paga ahí, no a la economía circular);
 *   · el índice de precios (inflación neta, ±pasoMax al día) y la tienda que lo sigue;
 *   · cambiar el precio por defecto de un objeto (oro, plata o bronce);
 *   · fundir y craftear cobran un precio justo (con cambio) y se devuelve si falla;
 *   · la basura y lo que caduca en el suelo cuentan como valor quemado;
 *   · solo los jefes dan objetos; el suelo y las monedas duran 5 minutos;
 *   · las misiones solo dan monedas.
 * Se salta si no encuentra el servidor (SERVIDOR=ruta). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
function trozo(inicio, fin) {
  const i = SRV.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio.slice(0, 60));
  const j = SRV.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio.slice(0, 60));
  return SRV.slice(i, j);
}
const J = (x) => JSON.parse(JSON.stringify(x));

/** Un Mongo de mentira con lo que usa el bloque. */
function modelo(inicial) {
  const t = (inicial || []).map((d) => ({ ...d }));
  const val = (d, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d);
  const cmp = (x) => (x instanceof Date ? x.getTime() : x);
  const casa = (d, q) => Object.entries(q || {}).every(([k, v]) => {
    const x = val(d, k);
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      return Object.entries(v).every(([op, w]) => (op === '$in' ? w.includes(x) : op === '$nin' ? !w.includes(x) : op === '$ne' ? x !== w
        : op === '$gte' ? cmp(x) >= cmp(w) : op === '$gt' ? cmp(x) > cmp(w) : op === '$lt' ? cmp(x) < cmp(w) : op === '$lte' ? cmp(x) <= cmp(w)
        : op === '$exists' ? (x !== undefined) === w : false));
    }
    return x === v;
  });
  const poner = (d, k, v) => { const p = k.split('.'); let o = d; while (p.length > 1) { const q = p.shift(); o = o[q] = o[q] || {}; } o[p[0]] = v; };
  const aplicar = (d, u) => {
    for (const [k, v] of Object.entries(u.$set || {})) poner(d, k, v);
    for (const [k, v] of Object.entries(u.$inc || {})) poner(d, k, (val(d, k) || 0) + v);
    for (const [k, v] of Object.entries(u.$addToSet || {})) { const a = val(d, k) || []; for (const x of (v && v.$each ? v.$each : [v])) if (!a.includes(x)) a.push(x); poner(d, k, a); }
  };
  const copia = (d) => (d ? JSON.parse(JSON.stringify(d)) : null);
  const cur = (f) => { const c = { sort(s) { const [[k, o]] = Object.entries(s); f = f.slice().sort((a, b) => (cmp(val(a, k)) > cmp(val(b, k)) ? o : cmp(val(a, k)) < cmp(val(b, k)) ? -o : 0)); return c; },
    limit(n) { f = f.slice(0, n); return c; }, select() { return c; }, lean: async () => f.map(copia), then(r, j) { return Promise.resolve(f.map(copia)).then(r, j); } }; return c; };
  const uno = (d) => ({ select() { return this; }, lean: async () => copia(d), then(r, j) { return Promise.resolve(copia(d)).then(r, j); } });
  const refs = new Set();
  return {
    _t: t,
    find: (q) => cur(t.filter((d) => casa(d, q))),
    findOne: (q) => uno(t.find((d) => casa(d, q))),
    findById: (id) => uno(t.find((d) => d._id === id)),
    exists: async (q) => (t.some((d) => casa(d, q)) ? { _id: 1 } : null),
    create: async (d) => {
      if (d.ref) { if (refs.has(d.ref)) { const e = new Error('dup'); e.code = 11000; throw e; } refs.add(d.ref); }
      if (d._id && t.some((x) => x._id === d._id)) { const e = new Error('dup'); e.code = 11000; throw e; }
      const x = { t: new Date(), ...d }; t.push(x); return copia(x);
    },
    insertMany: async (l) => { for (const d of l) t.push({ ...d }); return l; },
    deleteOne: async (q) => { const i = t.findIndex((d) => casa(d, q)); if (i >= 0) t.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    updateOne: async (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); if (!d && o.upsert) { d = { ...(q._id ? { _id: q._id } : {}) }; t.push(d); } if (d) aplicar(d, u); return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 }; },
    findOneAndUpdate: (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); if (!d && o.upsert) { d = { ...(q._id ? { _id: q._id } : {}) }; t.push(d); } if (d) aplicar(d, u); return uno(d); },
    aggregate: async () => [],
    init: async () => {}
  };
}

function bloque(op = {}) {
  const rutas = new Map(), apuntes = [], juego = [], devueltos = [];
  const M = { TesoroReserva: modelo(), EconomiaQuema: modelo(), PrecioBase: modelo(op.precios || []), PrecioHist: modelo(), ServicioCobro: modelo() };
  M.ServicioCobro.aggregate = async pipeline => pipeline[0]?.$match?.tipo ? op.ops || [] : [];
  // Los valores por defecto del esquema (los pone mongoose al crear).
  const crearCobro = M.ServicioCobro.create;
  M.ServicioCobro.create = (d) => crearCobro({ devuelto: false, estado: 'cobrado', t: new Date(), ...d });
  const Tesoro = modelo([{ _id: 'principal', saldo: 50000, reservado: 300 }]);
  const TesoroJuego = modelo([{ _id: 'juego', saldo: 9000 }]);
  const TesoroMov = modelo();
  const stats = modelo([{ _id: 's1', playerName: 'Ana', oro: 1, plata: 2, bronce: 300, chainPending: [] }]);
  class Schema { constructor(def) { this.def = def; } index() {} }
  Schema.Types = { Mixed: Object };
  const nada = (req, res, next) => next && next();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }),
    mongoose: { Schema, models: M, model: () => { throw new Error('modelo inesperado'); }, connection: { readyState: 0 } },
    _cero: () => ({ type: Number, default: 0 }),
    Tesoro, TESORO_ID: 'principal', TesoroJuego, TESORO_JUEGO_ID: 'juego', TesoroMov,
    TESORO_BRONCE_POR: { bronce: 1, plata: 1000, oro: 1000000 },
    TESORO_COMISION_BPS: 500,
    tesoroParteCircular: n => Math.floor(n * 150 / 500),
    esFantasma: async () => false,
    gfNivelDeJugador: async () => 50,
    itemTipoOnChain: id => id,
    ITEM_MAX_STACK: { Semillax: 50 },
    mintGatherReward: async () => ({ id: 1 }),
    burnItemOnChain: async (address, tipo, qty) => qty,
    ITEM_TIPO_MAP: { Semillax: 'bolsa zanahorias', mineral_cobre: 'mineral_cobre', palo: 'palo', tomate_buena: 'tomate_buena' },
    EconomiaDia: modelo([{ _id: '2026-10-27', indice: 1.02 }]),
    economiaHoy: async () => null, economiaFoto: async () => null, economiaConfig: async () => ({ precioBase: 0.001, sensibilidad: 0.8, pasoMax: 0.05 }),
    economiaApuntar: (x) => apuntes.push(x), _diaUTC: () => '2026-10-28',
    _diaMenos: (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10), _gwei: (g) => g / 1e9,
    TiendaOp: { aggregate: async () => op.ops || [], updateOne: async () => ({ matchedCount: 1 }) }, UserDailyProgress: { aggregate: async () => [] },
    gfNivelDeObjeto: () => 1, PlayerStats: stats,
    app: { get: (p, ...h) => rutas.set('GET ' + p, h[h.length - 1]), post: (p, ...h) => rutas.set('POST ' + p, h[h.length - 1]) },
    apiLimiter: nada, strictLimiter: nada, authMiddleware: nada, csrfProtection: nada, adminAuth: nada,
    jugadorDeLaSesion: async () => ({ playerName: 'Ana', address: '0xa' }),
    enColaDelJugador: async (k, fn) => fn(),
    buildStatsResponse: (d) => ({ oro: d.oro, plata: d.plata, bronce: d.bronce }),
    gfDevolverStat: async (n, s, c) => { devueltos.push([n, s, c]); const d = stats._t[0]; d[s] += c; return { ...d }; },
    tesoroJuegoIngresar: async (origen, bronce, playerName, detalle) => { juego.push([origen, bronce]); }
  });
  require('./economy-mock-transactions.cjs')(ctx, [...Object.values(M), Tesoro, TesoroJuego, TesoroMov, stats]);
  vm.runInContext(trozo('const TIENDA_PRECIOS = ', ';\n') + ';', ctx);
  const fin = "console.log('✅ Economía (2.ª parte)";
  vm.runInContext(trozo('// LA ECONOMÍA, 2.ª PARTE: QUEMAS, FONDO DE RESERVA', fin) +
    '\nthis.f = { eco2PlanPago, eco2PrecioDinamico, eco2FactorDemanda, eco2IndiceObjetivo, eco2Inflaciones, eco2PrecioMuerte, eco2NormalizarConfig,' +
    ' eco2BaseDe, eco2PrecioTienda, eco2ValorUnidad, eco2PrecioServicio, eco2RecalcularPrecios, eco2PreciosActuales, eco2PrecioAnteriorValido,' +
    ' gfMonstruoDaObjetos, eco2QuemarObjetos, tesoroQuemarCaducado, tesoroReservaIngresar, eco2Catalogo, eco2Config, eco2MigrarReserva, ecoQuemarSeguro, ecoTransferirCircular, ecoSaldoDisponible, ecoTransaccion };' +
    '\nthis.ponerIndice = (v) => { _eco2Indice = { valor: v, dia: "2026-10-28" }; };' +
    '\nthis.GF_MISIONES_SOLO_MONEDAS = GF_MISIONES_SOLO_MONEDAS;', ctx);
  const llamar = async (clave, body, query) => {
    let st = 200, out = null;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; }, set() { return this; } };
    const h = rutas.get(clave);
    assert.ok(h, 'ruta no montada: ' + clave);
    await h({ body: body || {}, query: query || {}, params: body && body.params || {}, admin: { address: '0xadmin' }, user: { address: '0xa' } }, res);
    return { st, out: out ? J(out) : null };
  };
  return { f: ctx.f, ctx, M, Tesoro, TesoroJuego, TesoroMov, stats, llamar, apuntes, juego, devueltos };
}

test('pagar en bronce: primero bronce; si no llega se rompe plata y luego oro, y el cambio vuelve', { skip: !HAY }, () => {
  const { f } = bloque();
  assert.deepEqual(J(f.eco2PlanPago(200, { oro: 0, plata: 0, bronce: 500 })), { oro: 0, plata: 0, bronce: 300 });
  assert.deepEqual(J(f.eco2PlanPago(1250, { oro: 0, plata: 3, bronce: 500 })), { oro: 0, plata: 2, bronce: 250 }, '500 + 1 plata rota (devuelve 250)');
  assert.deepEqual(J(f.eco2PlanPago(1500, { oro: 1, plata: 0, bronce: 0 })), { oro: 0, plata: 998, bronce: 500 }, 'se rompe un oro: 998 plata y 500 bronce de cambio');
  assert.equal(f.eco2PlanPago(5000, { oro: 0, plata: 2, bronce: 999 }), null, 'no alcanza');
  assert.deepEqual(J(f.eco2PlanPago(0, { oro: 1, plata: 1, bronce: 1 })), { oro: 1, plata: 1, bronce: 1 });
});

test('el índice de precios: sigue la inflación neta y como mucho ±pasoMax al día', { skip: !HAY }, () => {
  const { f } = bloque();
  const cfg = f.eco2NormalizarConfig(null);
  assert.equal(cfg.sensibilidad, 0.6); assert.equal(cfg.pasoMax, 0.03); assert.equal(cfg.muerteBase, 30);
  assert.equal(f.eco2IndiceObjetivo(cfg, 1, 0.5), 1.03, 'mucha inflación: sube solo un 3 %');
  assert.equal(f.eco2IndiceObjetivo(cfg, 1, -0.5), 0.97, 'deflación: baja un 3 %');
  assert.equal(f.eco2IndiceObjetivo(cfg, 1, 0.02), 1.012, 'cerca: al objetivo 1 + 2 % × 0,6');
  assert.equal(f.eco2IndiceObjetivo(cfg, 1.2, null), 1.164, 'sin datos: vuelve hacia 1, despacio');
  // Las masas y la inflación neta: A = jugadores + circular; S = A + juego + reserva.
  const hoy = { masa: 1100, tesoroCircular: 100, tesoroReservado: 0, tesoroJuego: 50, tesoroReserva: 50 };
  const h7 = { masa: 1000, tesoroCircular: 0, tesoroJuego: 0 };
  const inf = f.eco2Inflaciones(hoy, h7, h7, 30, 1);
  assert.equal(inf.A, 1200); assert.equal(inf.S, 1300);
  assert.equal(Math.round(inf.activa7 * 1000) / 1000, 0.2);
  assert.equal(Math.round(inf.total7 * 1000) / 1000, 0.3);
  assert.equal(Math.round(inf.neta7 * 1000) / 1000, 0.2, 'destruir objetos no destruye monedas');
});

test('precios de la tienda: por defecto × índice × demanda, en enteros; vender nunca da más que comprar', { skip: !HAY }, () => {
  const { f } = bloque();
  assert.deepEqual(J(f.eco2PrecioDinamico({ compra: 10, venta: 5, sigueIndice: true }, 1.1, 1)), { compra: 11, venta: 6 });
  assert.deepEqual(J(f.eco2PrecioDinamico({ compra: 10, venta: 5, sigueIndice: false }, 1.5, 1.1)), { compra: 10, venta: 5 }, 'fijo: no sigue el índice');
  assert.deepEqual(J(f.eco2PrecioDinamico({ compra: 2, venta: 2, sigueIndice: true }, 1, 1)), { compra: 2, venta: 1 }, 'la venta queda por debajo');
  const cfg = f.eco2NormalizarConfig(null);
  assert.equal(f.eco2FactorDemanda(cfg, { compras: 1000, ventas: 0 }) <= 1.1, true);
  assert.equal(f.eco2FactorDemanda(cfg, { compras: 0, ventas: 1000 }) >= 0.9, true);
  assert.equal(f.eco2FactorDemanda(cfg, null), 1);
  assert.equal(f.eco2BaseDe('mineral_cobre', null).moneda, 'bronce', 'lo que no se vende tiene valor de referencia en bronce');
  assert.equal(f.eco2BaseDe('Semillax', { compra: 9000, venta: 4000, moneda: 'bronce' }).moneda, 'bronce', 'el panel puede ponerlo en bronce');
});

test('recalcular: el índice del día mueve la tienda y queda un punto en el historial', { skip: !HAY }, async () => {
  const b = bloque({ ops: [{ _id: { item: 'tomate_buena', op: 'compra' }, n: 40 }] });
  b.ctx.ponerIndice(1.1);
  await b.f.eco2RecalcularPrecios('diario');
  const p = b.f.eco2PreciosActuales().items;
  assert.equal(p.Semillax.compra, 11, '10 de plata × 1,1');
  assert.equal(p.Semillax.moneda, 'plata');
  assert.ok(p.tomate_buena.compra > 31 && p.tomate_buena.compra <= 34, 'más compras que ventas: algo más caro (' + p.tomate_buena.compra + ')');
  assert.deepEqual(J(b.f.eco2PrecioTienda('Semillax')), [11, 6, 'p']);
  assert.equal(b.f.eco2PrecioTienda('mineral_cobre'), null, 'lo que no vende la tienda no tiene precio de tienda');
  assert.ok(b.M.PrecioHist._t.length >= b.f.eco2Catalogo().length, 'un punto por objeto');
  // El precio de antes vale 30 minutos en la auditoría (la compra ya iba de camino).
  b.ctx.ponerIndice(1.2);
  await b.f.eco2RecalcularPrecios('recalculo');
  assert.equal(b.f.eco2PrecioTienda('Semillax')[0], 12);
  assert.equal(b.f.eco2PrecioAnteriorValido('compra', 'Semillax', 11, 'plata'), true);
  assert.equal(b.f.eco2PrecioAnteriorValido('compra', 'Semillax', 11000, 'bronce'), true, 'pagado en bronce');
  assert.equal(b.f.eco2PrecioAnteriorValido('compra', 'Semillax', 7, 'plata'), false);
});

test('el panel cambia el precio por defecto (oro, plata o bronce) y solo ese objeto se rehace', { skip: !HAY }, async () => {
  const b = bloque();
  await b.f.eco2RecalcularPrecios('diario');
  const antes = b.f.eco2PreciosActuales().items.Tijerasx;
  let r = await b.llamar('POST /api/admin/precios/item', { itemId: 'Semillax', compra: 9000, venta: 4000, moneda: 'bronce' });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.item.moneda, 'bronce');
  assert.equal(r.out.item.compra, 9000);
  assert.deepEqual(J(b.f.eco2PrecioTienda('Semillax')), [9000, 4000, 'b']);
  assert.deepEqual(J(b.f.eco2PreciosActuales().items.Tijerasx), J(antes), 'los demás no cambian a media partida');
  assert.equal(b.M.PrecioHist._t.filter((h) => h.itemId === 'Semillax' && h.motivo === 'admin').length, 1, 'el gráfico tiene su punto');
  r = await b.llamar('POST /api/admin/precios/item', { itemId: 'Semillax', compra: 10, venta: 12, moneda: 'plata' });
  assert.equal(r.out.error, 'venta_mayor');
  r = await b.llamar('POST /api/admin/precios/item', { itemId: 'Semillax', compra: 10, venta: 5, moneda: 'diamante' });
  assert.equal(r.out.error, 'moneda_invalida');
  r = await b.llamar('POST /api/admin/precios/item', { itemId: 'no_existe', compra: 1, venta: 0, moneda: 'oro' });
  assert.equal(r.out.error, 'objeto_desconocido');
  r = await b.llamar('POST /api/admin/precios/item', { itemId: 'Semillax', quitar: true });
  assert.deepEqual(J(b.f.eco2PrecioTienda('Semillax')), [10, 5, 'p'], 'quitar vuelve al de por defecto');
  // Un objeto que no vende la tienda: solo su valor de referencia.
  r = await b.llamar('POST /api/admin/precios/item', { itemId: 'mineral_cobre', compra: 999, venta: 30000, moneda: 'bronce' });
  assert.equal(r.out.item.compra, 0); assert.equal(r.out.item.venta, 30000);
});

test('la muerte: el precio del panel con el índice (30, 60, 120… hasta el tope)', { skip: !HAY }, () => {
  const { f } = bloque();
  const cfg = f.eco2NormalizarConfig(null);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => f.eco2PrecioMuerte(cfg, 1, n)), [30, 60, 120, 240, 480, 480]);
  assert.deepEqual([0, 1, 4].map((n) => f.eco2PrecioMuerte(cfg, 1.1, n)), [33, 66, 528], 'con un índice de 1,1 sube un 10 % (y su tope)');
  const otra = f.eco2NormalizarConfig({ muerteBase: 50, muerteMultiplicador: 1.5, muerteTope: 100 });
  assert.deepEqual([0, 1, 2].map((n) => f.eco2PrecioMuerte(otra, 1, n)), [50, 75, 100]);
  assert.equal(f.eco2NormalizarConfig({ muerteBase: 500, muerteTope: 10 }).muerteTope, 500, 'el tope nunca por debajo de la base');
});

test('fundir y craftear: precio justo con el índice, cobro con cambio, al tesoro del juego y devolución una vez', { skip: !HAY }, async () => {
  const b = bloque();
  await b.f.eco2RecalcularPrecios('diario');
  assert.equal(b.f.eco2PrecioServicio('fundir', 'mineral_cobre', 1), 1250, '5 % de 25.000');
  assert.equal(b.f.eco2PrecioServicio('craftear', 'palo', 1), 50, 'el mínimo');
  let r = await b.llamar('GET /api/economia/servicio/precio', null, { tipo: 'fundir', itemId: 'mineral_cobre', cantidad: '2' });
  assert.equal(r.out.bronce, 2500);
  r = await b.llamar('POST /api/economia/servicio', { tipo: 'fundir', itemId: 'mineral_cobre', cantidad: 1, ref: 'ref-fundir-1' });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.bronce, 1250);
  assert.deepEqual(r.out.stats, { oro: 1, plata: 1, bronce: 50 }, '300 bronce + 1 plata rota - 1.250');
  assert.equal(b.TesoroJuego._t[0].saldo, 10250);
  assert.equal(b.TesoroJuego._t[0].retenidoServicios, 1250);
  const otra = await b.llamar('POST /api/economia/servicio', { tipo: 'fundir', itemId: 'mineral_cobre', cantidad: 1, ref: 'ref-fundir-1' });
  assert.equal(otra.out.repetido, true, 'el mismo ref no cobra dos veces');
  r = await b.llamar('POST /api/economia/servicio/devolver', { ref: 'ref-fundir-1' });
  assert.equal(r.st, 202, 'el navegador solicita revisión; no se autorreembolsa');
  assert.equal(b.stats._t[0].bronce, 50);
  r = await b.llamar('POST /api/admin/economia/servicios/revisar', { id: 'Ana:ref-fundir-1', accion: 'devolver', motivo: 'Fallo confirmado en la cadena' });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(b.stats._t[0].bronce, 1300);
  assert.equal(b.TesoroJuego._t[0].retenidoServicios, 0);
  const again = await b.llamar('POST /api/admin/economia/servicios/revisar', { id: 'Ana:ref-fundir-1', accion: 'devolver', motivo: 'Fallo confirmado en la cadena' });
  assert.equal(again.st, 409, 'solo devuelve una vez');
});

test('quemar: de cada tesoro, en oro/plata/bronce, sin pasarse del saldo, y queda apuntado', { skip: !HAY }, async () => {
  const b = bloque();
  b.Tesoro._t[0].saldo = 150000;
  let r = await b.llamar('POST /api/admin/economia/quemar', { tesoro: 'circular', moneda: 'plata', cantidad: 20, motivo: 'prueba', ref: 'burn-test-001' });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.bronce, 20000);
  assert.equal(b.Tesoro._t[0].saldo, 130000); assert.equal(b.Tesoro._t[0].quemado, 20000);
  r = await b.llamar('POST /api/admin/economia/quemar', { tesoro: 'juego', moneda: 'oro', cantidad: 1, motivo: 'demasiado', ref: 'burn-test-002' });
  assert.equal(r.st, 409); assert.equal(r.out.error, 'reserva_protegida');
  r = await b.llamar('POST /api/admin/economia/quemar', { tesoro: 'reserva', moneda: 'bronce', cantidad: 5, motivo: 'x' });
  assert.equal(r.out.error, 'datos_invalidos');
  r = await b.llamar('POST /api/admin/economia/quemar', { tesoro: 'otro', moneda: 'bronce', cantidad: 5, motivo: 'prueba' });
  assert.equal(r.out.error, 'datos_invalidos');
  assert.equal(b.M.EconomiaQuema._t.length, 1);
  assert.deepEqual(J(b.apuntes.find((a) => a.quemadoMonedas)), { quemadoMonedas: 20000 });
});

test('fondo de reserva y monedas caducadas: la muerte entra en la reserva; lo que nadie recoge se quema', { skip: !HAY }, async () => {
  const b = bloque();
  await b.f.tesoroReservaIngresar('muerte', 60000, 'Ana', 'revive');
  assert.deepEqual(J(b.juego), [['muerte', 60000]]);
  assert.equal(b.M.TesoroReserva._t.length, 0, 'sin tercer tesoro activo');
  await b.f.tesoroQuemarCaducado(300, { playerName: 'Ana', incentivo: { monstruo: 'lobo_salvaje' } });
  assert.equal(b.Tesoro._t[0].reservado, 0); assert.equal(b.Tesoro._t[0].quemado || 0, 0); assert.equal(b.Tesoro._t[0].saldo, 50300, 'la recompensa no recogida vuelve al tesoro');
  assert.equal(b.M.EconomiaQuema._t.length, 0, 'caducar el botín no destruye la reserva');
});

test('basura y suelo caducado: el valor de lo destruido (tienda, referencia o P2P), con tope', { skip: !HAY }, async () => {
  const b = bloque();
  await b.f.eco2RecalcularPrecios('diario');
  const v = await b.f.eco2QuemarObjetos('suelo_caducado', [{ itemId: 'mineral_cobre', cantidad: 2 }], 'Ana', 'suelo:abc', 'salvaje');
  assert.equal(v, 50000, '2 lingotes de 25.000');
  assert.equal(await b.f.eco2QuemarObjetos('suelo_caducado', [{ itemId: 'mineral_cobre', cantidad: 2 }], 'Ana', 'suelo:abc'), 0, 'el mismo montón no cuenta dos veces');
  let r = await b.llamar('POST /api/economia/quema/basura', { ref: 'basura-ref-1', items: [{ itemId: 'tomate_buena', cantidad: 3 }, { itemId: 'inventado', cantidad: 9 }] });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.bronce, 3 * 20000, 'la venta de la tienda (20 plata)');
  r = await b.llamar('POST /api/economia/quema/basura', { ref: 'basura-ref-2', items: [{ itemId: 'palo', cantidad: 9999 }] });
  r = await b.llamar('POST /api/economia/quema/basura', { ref: 'basura-ref-3', items: [{ itemId: 'palo', cantidad: 1 }] });
  assert.equal(r.out.tope, true, 'tope por jugador y día');
});

test('solo los jefes dan objetos; las misiones solo monedas', { skip: !HAY }, () => {
  const { f, ctx } = bloque();
  for (const t of ['jefe_golem', 'jefe_ent', 'serpiente_mina']) assert.equal(f.gfMonstruoDaObjetos(t), true, t);
  for (const t of ['lobo_salvaje', 'golem_salvaje', 'nigromante_cementerio', '']) assert.equal(f.gfMonstruoDaObjetos(t), false, t);
  assert.equal(ctx.GF_MISIONES_SOLO_MONEDAS, true);
});

test('el servidor lo usa donde toca (muerte, botín, suelo, tienda, misiones, foto del día)', { skip: !HAY }, () => {
  assert.match(trozo('function precioRevivir(muertes) {', '\n}\n'), /eco2PrecioMuerte\(eco2ConfigSync\(\), eco2IndiceSync\(\), muertes\)/);
  assert.match(SRV, /reviveCost: precioRevivir\(gp\.isGhost \? Math\.max\(0, \(Number\(gp\.deathCount\) \|\| 1\) - 1\) : gp\.deathCount\)/,
    'muerto: el precio que se cobra de verdad (antes el doble)');
  const revivir = trozo("app.post('/api/player/revive'", '\n});\n');
  assert.match(revivir, /tesoroReservaIngresar\('muerte', precio \* TESORO_BRONCE_POR\.plata/);
  assert.match(SRV, /const BOTIN_CADUCA_MS = 5 \* 60 \* 1000;/);
  assert.match(SRV, /const SUELO_CADUCA_MS = 5 \* 60 \* 1000;/);
  assert.match(trozo("app.post('/api/monstruos/derrotado'", '\n});\n'), /!conNombre \|\| !gfMonstruoDaObjetos\(tipo\) \? 0/);
  assert.match(SRV, /if \(b\.incentivo && !b\.recogiendo\) tesoroQuemarCaducado\(b\.cantidad, b\)/);
  assert.match(SRV, /eco2QuemarObjetos\('suelo_caducado', \[\{ itemId: m\.itemId, cantidad: m\.cantidad \}\]/);
  assert.match(trozo('function tesoroComisionTienda(', '\n}\n'), /eco2PrecioTienda\(itemId\)/);
  assert.match(trozo('function gfEsperadoTienda(', '\n}\n'), /eco2PrecioTienda\(itemId\)/);
  const completar = trozo("app.post('/api/missions/daily/complete',", "console.log('✅ Missions route");
  assert.match(completar, /\['bronce', broncePremio\]/);
  assert.match(completar, /if \(rewardId && rewardQty > 0 && !GF_MISIONES_SOLO_MONEDAS\)/, 'ningún objeto se acuña como premio');
  const foto = trozo('async function economiaFoto(forzarIndice) {', '\n}\n');
  assert.match(foto, /eco2Inflaciones\(/);
  assert.match(foto, /economiaPrecioGwei\(cfg, ayer \? ayer\.precioGwei : 0, infPrecio\)/, 'el oro de recarga sigue la inflación neta');
});

module.exports = { bloque, modelo, J };

test('fallo de escritura: saldo, recibo y tesoro revierten juntos; reintentar no duplica', async () => {
  const b = bloque();
  b.TesoroMov._failNext = 'create';
  const request = { tipo: 'craftear', itemId: 'palo', cantidad: 2, ref: 'craft-rollback-1' };
  const before = J(b.stats._t[0]);
  const failed = await b.llamar('POST /api/economia/servicio', request);
  assert.equal(failed.st, 503);
  assert.deepEqual(J(b.stats._t[0]), before);
  assert.equal(b.M.ServicioCobro._t.length, 0);
  assert.equal(b.TesoroJuego._t[0].saldo, 9000);
  const ok = await b.llamar('POST /api/economia/servicio', request);
  assert.equal(ok.st, 200, JSON.stringify(ok.out));
  assert.equal(ok.out.bronce, 100, 'el mínimo se cobra por unidad, sin descuento por lotes');
  const replay = await Promise.all(Array.from({ length: 20 }, () => b.llamar('POST /api/economia/servicio', request)));
  assert.ok(replay.every(r => r.out.repetido));
  assert.equal(b.stats._t[0].bronce, 200);
  assert.equal(b.M.ServicioCobro._t.length, 1);
  assert.equal(b.TesoroJuego._t[0].retenidoServicios, 100);
});

test('migrar la tercera reserva conserva cada moneda y su configuración, una sola vez', async () => {
  const b = bloque();
  b.M.TesoroReserva._t.push({ _id: 'reserva', saldo: 123456, quemado: 99, config: { craftearMin: 75 } });
  await Promise.all([b.f.eco2MigrarReserva(), b.f.eco2MigrarReserva()]);
  assert.equal(b.TesoroJuego._t[0].saldo, 132456);
  assert.equal(b.M.TesoroReserva._t[0].saldo, 0);
  assert.equal(b.M.TesoroReserva._t[0].archivado, true);
  assert.equal(b.TesoroJuego._t[0].economia2.craftearMin, 75);
  await b.f.eco2MigrarReserva();
  assert.equal(b.TesoroJuego._t[0].saldo, 132456);
  assert.equal(b.TesoroMov._t.filter(r => r.origen === 'migracion_reserva_v1').length, 1);
});

test('transferir y quemar protegen el capital del juego y las devoluciones; no crean dinero', async () => {
  const b = bloque();
  b.TesoroJuego._t[0].saldo = 8000000;
  b.TesoroJuego._t[0].retenidoServicios = 2000000;
  await assert.rejects(() => b.f.ecoTransferirCircular(1000001, 'test', 'admin:fund-1'), /reserva_protegida/);
  const before = b.TesoroJuego._t[0].saldo + b.Tesoro._t[0].saldo;
  await b.f.ecoTransferirCircular(1000000, 'test', 'admin:fund-2');
  assert.equal(b.TesoroJuego._t[0].saldo + b.Tesoro._t[0].saldo, before);
  await b.f.ecoTransferirCircular(1000000, 'test', 'admin:fund-2');
  assert.equal(b.TesoroJuego._t[0].saldo, 7000000);
  await assert.rejects(() => b.f.ecoQuemarSeguro('juego', 'bronce', 1, 'test', 'admin:burn-1'), /reserva_protegida/);
  await b.f.ecoQuemarSeguro('circular', 'bronce', 50000, 'test', 'admin:burn-2');
  assert.equal(b.TesoroJuego._t[0].saldo + b.Tesoro._t[0].saldo, before - 50000);
  await b.f.ecoQuemarSeguro('circular', 'bronce', 50000, 'test', 'admin:burn-2');
  assert.equal(b.TesoroJuego._t[0].saldo + b.Tesoro._t[0].saldo, before - 50000);
});

test('diez mil cambios conservan valor y rechazan números inválidos sin saldos negativos', () => {
  const { f } = bloque();
  const value = x => x.oro * 1000000 + x.plata * 1000 + x.bronce;
  let seed = 20261028;
  const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 10000; i++) {
    const s = { oro: random(25), plata: random(1000), bronce: random(2000) }, cost = random(26000000);
    const result = f.eco2PlanPago(cost, s);
    if (result) { assert.equal(value(result), value(s) - cost); assert.ok(Object.values(result).every(n => Number.isSafeInteger(n) && n >= 0)); }
    else assert.ok(value(s) < cost);
  }
  for (const bad of [Infinity, NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(f.eco2PlanPago(bad, { oro: 1, plata: 0, bronce: 0 }), null);
  assert.equal(f.eco2PlanPago(1, { oro: Infinity, plata: 0, bronce: 0 }), null);
});

test('autorreembolso, referencias alteradas y lotes inválidos no producen monedas', async () => {
  const b = bloque();
  const request = { tipo: 'craftear', itemId: 'palo', cantidad: 1, ref: 'ref-validation-1' };
  assert.equal((await b.llamar('POST /api/economia/servicio', { ...request, cantidad: 1.2 })).st, 400);
  assert.equal((await b.llamar('POST /api/economia/servicio', { ...request, itemId: 'inventado' })).st, 400);
  assert.equal((await b.llamar('POST /api/economia/servicio', request)).st, 200);
  assert.equal((await b.llamar('POST /api/economia/servicio', { ...request, cantidad: 2 })).st, 409);
  const before = b.stats._t[0].bronce;
  for (let n = 0; n < 5; n++) assert.equal((await b.llamar('POST /api/economia/servicio/devolver', { ref: request.ref })).st, 202);
  assert.equal(b.stats._t[0].bronce, before);
});

test('tienda autoritativa: comprar y vender conservan cada bronce y el servidor cobra sus precios', async () => {
  const b = bloque();
  b.TesoroJuego._t[0].saldo = 10000000;
  const value = () => b.stats._t[0].oro * 1000000 + b.stats._t[0].plata * 1000 + b.stats._t[0].bronce + b.TesoroJuego._t[0].saldo + b.Tesoro._t[0].saldo;
  const before = value();
  const buy = { op: 'compra', itemId: 'Semillax', cantidad: 2, precioBronce: 10000, ref: 'shop-authority-1' };
  assert.equal((await b.llamar('POST /api/economia/tienda', { ...buy, precioBronce: 1 })).st, 409);
  const paid = await b.llamar('POST /api/economia/tienda', buy);
  assert.equal(paid.st, 200, JSON.stringify(paid.out));
  assert.equal(paid.out.confirmadas, 2);
  assert.equal(value(), before, 'compra: precio y comisión se transfieren, no desaparecen');
  const balance = J(b.stats._t[0]);
  assert.equal((await b.llamar('POST /api/economia/tienda', buy)).out.ok, true);
  assert.deepEqual(J(b.stats._t[0]), balance, 'repetir no cobra ni entrega dos veces');
  const sale = await b.llamar('POST /api/economia/tienda', { op: 'venta', itemId: 'Semillax', cantidad: 2, precioBronce: 5000, ref: 'shop-authority-2' });
  assert.equal(sale.st, 200, JSON.stringify(sale.out));
  assert.equal(sale.out.bronce, 9500);
  assert.equal(value(), before, 'vender tampoco crea monedas');
});

test('tienda sin liquidez no quema objetos; una confirmación ambigua no se vuelve a ejecutar', async () => {
  const b = bloque(); let burns = 0, mints = 0;
  b.ctx.burnItemOnChain = async () => { burns++; return 1; };
  const sale = await b.llamar('POST /api/economia/tienda', { op: 'venta', itemId: 'Semillax', cantidad: 1, precioBronce: 5000, ref: 'shop-funds-001' });
  assert.equal(sale.st, 409); assert.equal(burns, 0);
  b.ctx.mintGatherReward = async () => { mints++; return null; };
  const request = { op: 'compra', itemId: 'Semillax', cantidad: 1, precioBronce: 10000, ref: 'shop-chain-001' };
  assert.equal((await b.llamar('POST /api/economia/tienda', request)).st, 202);
  assert.equal((await b.llamar('POST /api/economia/tienda', request)).st, 202);
  assert.equal(mints, 1, 'no vuelve a emitir en un resultado ambiguo');
  assert.equal(b.M.ServicioCobro._t.find(r => r.tipo === 'tienda_compra').estado, 'revision');
});
