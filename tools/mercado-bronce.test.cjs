'use strict';
/* EL BRONCE EN EL MERCADO P2P (2026-11-25).
   "Al market le falta el bronce, no lo tiene ni para comercializar."

   Se prueba marketplace-routes.js de verdad (sus rutas, su transacción y sus
   cuentas) contra un Mongo de mentira que guarda en memoria, confirma al final
   de cada transacción y deshace si la ruta responde con error. Lo que se mira:
   - se publica, se compra, se oferta y se venden lotes en bronce (precio entero);
   - se paga por VALOR: si falta de la moneda de la publicación pagan las otras,
     con su vuelta, y nunca queda nada en negativo;
   - al vendedor le llega lo justo en monedas ENTERAS (1,9 de oro = 1 de oro y
     900 de plata), porque en la cadena cada moneda es un número entero;
   - cada moneda que cambia queda marcada para la cadena (chainPending): sin esa
     marca, el /sync siguiente daba la razón a la factura vieja y la compra o la
     venta se deshacía al volver al juego.
   Los importes esperados están hechos a mano, no recalculados con el código. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

// GF_MERCADO_ARCHIVO solo sirve para probar mutaciones sobre una copia (con sus dos catálogos al lado).
const ARCHIVO = process.env.GF_MERCADO_ARCHIVO || path.join(__dirname, '../marketplace-routes.js');
const fuente = fs.readFileSync(ARCHIVO, 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const plano = (o) => JSON.parse(JSON.stringify(o)); // lo que sale del vm tiene otro Object.prototype
const esFecha = (v) => Object.prototype.toString.call(v) === '[object Date]';
const esRegex = (v) => Object.prototype.toString.call(v) === '[object RegExp]';

function contexto() {
  const c = vm.createContext({ module: { exports: {} }, require: Module.createRequire(ARCHIVO), console: quiet, setTimeout() {}, setInterval() {} });
  vm.runInContext(fuente, c);
  return c;
}
const M = contexto();
const f = vm.runInContext('({ planPago, planAbono, saldoEntero, importeDe, precioValido, leerPrecio })', M);

// ── Un Mongo de mentira con transacciones ──────────────────────────────────
function banco(semilla = {}) {
  const data = structuredClone(semilla);
  let version = 0, siguiente = 1;
  const rutas = new Map();

  function valor(doc, k) {
    return k.split('.').reduce((o, p) => (Array.isArray(o) ? o.map((x) => x && x[p]) : o == null ? undefined : o[p]), doc);
  }
  function vale(doc, filtro) {
    return Object.entries(filtro || {}).every(([k, v]) => {
      if (k === '$or') return v.some((sub) => vale(doc, sub));
      const real = valor(doc, k);
      if (esRegex(v)) return v.test(String(real ?? ''));
      if (v === null) return real == null;
      if (v && typeof v === 'object' && !esFecha(v) && !Array.isArray(v)) {
        return Object.entries(v).every(([op, x]) => {
          if (op === '$gte') return real >= x;
          if (op === '$lte') return real <= x;
          if (op === '$gt') return real > x;
          if (op === '$lt') return real < x;
          if (op === '$ne') return Array.isArray(real) ? !real.some((r) => String(r) === String(x)) : String(real) !== String(x);
          if (op === '$in') return x.some((y) => String(y) === String(real));
          if (op === '$nin') return !x.some((y) => String(y) === String(real));
          if (op === '$elemMatch') return Array.isArray(real) && real.some((r) => vale(r, x));
          throw new Error('operador que el banco no sabe hacer: ' + op);
        });
      }
      return Array.isArray(real) ? real.some((r) => String(r) === String(v)) : String(real) === String(v);
    });
  }
  // Rutas con punto: objetos anidados, `arr.$.campo` (el del $elemMatch) y `arr.$[x].campo` (arrayFilters).
  function tocar(doc, k, filtro, opciones, hacer) {
    const partes = k.split('.');
    const i = partes.findIndex((p) => p.startsWith('$'));
    if (i < 0) { let o = doc; for (const p of partes.slice(0, -1)) o = (o[p] ||= {}); return hacer(o, partes.at(-1)); }
    const arr = partes.slice(0, i).join('.'), pos = partes[i], campo = partes.slice(i + 1).join('.');
    const lista = doc[arr] || [];
    let elegidos;
    if (pos === '$') {
      const em = filtro[arr] && filtro[arr].$elemMatch;
      elegidos = em ? lista.filter((e) => vale(e, em)).slice(0, 1) : [];
    } else {
      const nombre = pos.slice(2, -1);
      const af = (opciones.arrayFilters || []).find((a) => Object.keys(a).some((x) => x.startsWith(nombre + '.'))) || {};
      elegidos = lista.filter((e) => Object.entries(af).every(([x, v]) => String(e[x.slice(nombre.length + 1)]) === String(v)));
    }
    for (const e of elegidos) hacer(e, campo);
  }
  function aplicar(doc, u, filtro, opciones) {
    const conocidos = new Set(['$set', '$inc', '$push', '$addToSet', '$pull']);
    for (const op of Object.keys(u)) if (!conocidos.has(op)) throw new Error('actualización que el banco no sabe hacer: ' + op);
    for (const [k, v] of Object.entries(u.$set || {})) tocar(doc, k, filtro, opciones, (o, c) => { o[c] = structuredClone(v); });
    for (const [k, v] of Object.entries(u.$inc || {})) tocar(doc, k, filtro, opciones, (o, c) => { o[c] = (o[c] || 0) + v; });
    for (const [k, v] of Object.entries(u.$push || {})) (doc[k] ||= []).push(structuredClone(v));
    for (const [k, v] of Object.entries(u.$addToSet || {})) {
      const lista = (doc[k] ||= []);
      for (const x of (v && Array.isArray(v.$each)) ? v.$each : [v]) if (!lista.includes(x)) lista.push(x);
    }
    for (const [k, v] of Object.entries(u.$pull || {})) doc[k] = (doc[k] || []).filter((e) => !vale(e, v));
  }

  function modelo(nombre) {
    data[nombre] ||= [];
    const almacen = (sesion) => (sesion ? sesion.store : data);
    function hidratar(d, sesion) {
      if (!d) return d;
      Object.defineProperty(d, 'save', { enumerable: false, value: async function () {
        const filas = almacen(sesion)[nombre], j = filas.findIndex((x) => String(x._id) === String(this._id));
        const limpio = structuredClone({ ...this });
        if (j >= 0) filas[j] = limpio; else filas.push(limpio);
        return this;
      } });
      return d;
    }
    const consulta = (op, filtro = {}, u = {}, opciones = {}) => {
      let sesion = opciones.session || null, tope = Infinity, saltar = 0;
      const q = {
        session(s) { sesion = s; return q; }, lean() { return q; }, sort() { return q; },
        skip(n) { saltar = n; return q; }, limit(n) { tope = n; return q; }, maxTimeMS() { return q; },
        async exec() {
          const escribe = !['find', 'findOne', 'findById', 'countDocuments'].includes(op);
          if (escribe && !sesion) throw new Error('escritura del mercado fuera de su transacción: ' + nombre + '.' + op);
          const filas = (almacen(sesion)[nombre] ||= []);
          if (op === 'find') return filas.filter((d) => vale(d, filtro)).slice(saltar, saltar + tope).map((d) => hidratar(structuredClone(d), sesion));
          if (op === 'countDocuments') return filas.filter((d) => vale(d, filtro)).length;
          const doc = filas.find((d) => vale(d, filtro));
          if (op === 'findOne' || op === 'findById') return doc ? hidratar(structuredClone(doc), sesion) : null;
          if (op === 'deleteOne') { if (doc) filas.splice(filas.indexOf(doc), 1); return { deletedCount: doc ? 1 : 0 }; }
          if (op === 'deleteMany') { const antes = filas.length; almacen(sesion)[nombre] = filas.filter((d) => !vale(d, filtro)); return { deletedCount: antes - almacen(sesion)[nombre].length }; }
          let objetivo = doc;
          if (!objetivo && opciones.upsert) {
            objetivo = {};
            for (const [k, v] of Object.entries(filtro)) if (!k.startsWith('$') && (v === null || typeof v !== 'object')) objetivo[k] = v;
            if (objetivo._id == null) objetivo._id = 'auto' + siguiente++;
            filas.push(objetivo);
          }
          if (!objetivo) return op === 'findOneAndUpdate' ? null : { matchedCount: 0, modifiedCount: 0 };
          aplicar(objetivo, u, filtro, opciones);
          return op === 'findOneAndUpdate' ? hidratar(structuredClone(objetivo), sesion) : { matchedCount: 1, modifiedCount: 1 };
        },
        then(si, no) { return q.exec().then(si, no); }
      };
      return q;
    };
    const m = {};
    for (const op of ['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments']) m[op] = (...a) => consulta(op, ...a);
    m.findById = (id) => consulta('findById', { _id: id });
    m.create = async (docs, opciones) => {
      if (!opciones || !opciones.session) throw new Error('create fuera de su transacción: ' + nombre);
      const filas = docs.map((d) => ({ _id: nombre.toLowerCase() + siguiente++, createdAt: new Date(), ...structuredClone(d) }));
      opciones.session.store[nombre].push(...filas);
      return filas.map((d) => hidratar(structuredClone(d), opciones.session));
    };
    m.insertMany = (docs, opciones) => m.create(docs, opciones);
    m.aggregate = () => { throw new Error('aggregate no hace falta en estas pruebas'); };
    return m;
  }

  const modelos = {};
  const mongoose = {
    models: modelos, Schema: class {}, Types: { ObjectId: { isValid: () => true } },
    model(nombre) { return (modelos[nombre] ||= modelo(nombre)); },
    async startSession() {
      const sesion = { store: null,
        async withTransaction(trabajo) {
          for (let i = 0; i < 10; i++) {
            const v = version; sesion.store = structuredClone(data);
            const r = await trabajo();          // si la ruta falla, lanza y no se confirma nada
            if (v !== version) continue;
            for (const k of Object.keys(data)) delete data[k];
            Object.assign(data, sesion.store); version++; return r;
          }
          throw new Error('demasiados choques');
        },
        async endSession() {} };
      return sesion;
    }
  };
  const app = {};
  for (const metodo of ['get', 'post', 'patch', 'delete']) app[metodo] = (url, ...h) => rutas.set(metodo + ' ' + url, h.at(-1));
  contexto().module.exports(app, {   // un módulo nuevo por banco: sus modelos son de este banco
    mongoose,
    GamePlayer: mongoose.model('GamePlayer'), PlayerStats: mongoose.model('PlayerStats'), Listing: mongoose.model('Listing'),
    Tesoro: mongoose.model('Tesoro'), TesoroJuego: mongoose.model('TesoroJuego'), TesoroMov: mongoose.model('TesoroMov'),
    isAdminAddress: async (a) => a === 'admin',
    authMiddleware() {}, csrfProtection() {}, apiLimiter() {}
  });
  async function llamar(metodoYRuta, quien, { params = {}, body = {}, query = {} } = {}) {
    const h = rutas.get(metodoYRuta);
    assert.ok(h, 'no existe la ruta ' + metodoYRuta);
    const res = { st: 200, cuerpo: undefined, status(n) { this.st = n; return this; }, json(c) { this.cuerpo = c; return this; } };
    await h({ user: { address: quien }, params, body, query, headers: {} }, res, () => assert.fail('next inesperado'));
    return { st: res.st, out: plano(res.cuerpo === undefined ? null : res.cuerpo) };
  }
  const stats = (nombre) => data.PlayerStats.find((s) => s.playerName === nombre);
  const monedas = (nombre) => { const s = stats(nombre); return [s.oro, s.plata, s.bronce ?? 0]; };
  const pendiente = (nombre) => [...(stats(nombre).chainPending || [])].sort();
  return { data, llamar, stats, monedas, pendiente };
}

const jugador = (playerName, address, inventory = []) => ({ _id: 'g-' + address, playerName, address, inventory, chest: [] });
const saldo = (playerName, address, m) => ({ _id: 's-' + address, playerName, address, ...m });

// ── Las cuentas, solas ──────────────────────────────────────────────────────
test('pagar: primero la moneda de la publicación y las menores; lo que falte, rompiendo la más pequeña con vuelta', () => {
  const P = (cuanto, s, m) => { const r = f.planPago(cuanto, s, m); return r && plano(r); };
  assert.deepEqual(P(75, { oro: 0, plata: 1, bronce: 0 }, 'bronce'), { oro: 0, plata: 0, bronce: 925 });
  assert.deepEqual(P(75, { oro: 1, plata: 0, bronce: 0 }, 'bronce'), { oro: 0, plata: 999, bronce: 925 });
  assert.deepEqual(P(2000000, { oro: 0, plata: 2500, bronce: 0 }, 'oro'), { oro: 0, plata: 500, bronce: 0 });
  assert.deepEqual(P(1500000, { oro: 2, plata: 0, bronce: 0 }, 'oro'), { oro: 0, plata: 500, bronce: 0 });
  assert.deepEqual(P(1500, { oro: 0, plata: 1, bronce: 600 }, 'plata'), { oro: 0, plata: 0, bronce: 100 });
  assert.deepEqual(P(1500, { oro: 1, plata: 0, bronce: 0 }, 'plata'), { oro: 0, plata: 998, bronce: 500 });
  assert.deepEqual(P(1500, { oro: 0, plata: 2, bronce: 0 }, 'plata'), { oro: 0, plata: 0, bronce: 500 });
  assert.deepEqual(P(1000500, { oro: 1, plata: 0, bronce: 1000 }, 'oro'), { oro: 0, plata: 0, bronce: 500 });
  // Con la moneda de la publicación en la mano, se paga con ella y no con el suelto.
  assert.deepEqual(P(1000, { oro: 0, plata: 1, bronce: 1000 }, 'plata'), { oro: 0, plata: 0, bronce: 1000 });
  assert.deepEqual(P(2000000, { oro: 2, plata: 2000, bronce: 0 }, 'oro'), { oro: 0, plata: 2000, bronce: 0 });
  // Sin dinero bastante (sumando las tres) o con un importe que no es un entero de bronce: nada.
  assert.equal(P(2000000, { oro: 1, plata: 999, bronce: 999 }, 'oro'), null);
  assert.equal(P(1, { oro: 0, plata: 0, bronce: 0 }, 'bronce'), null);
  assert.equal(P(-5, { oro: 9, plata: 0, bronce: 0 }, 'oro'), null);
  assert.equal(P(1.5, { oro: 9, plata: 0, bronce: 0 }, 'oro'), null);
});

test('cobrar: monedas enteras desde la de la publicación hacia las pequeñas', () => {
  const A = (cuanto, s, m) => { const r = f.planAbono(cuanto, s, m); return r && plano(r); };
  assert.deepEqual(A(1900000, { oro: 0, plata: 0, bronce: 0 }, 'oro'), { oro: 1, plata: 900, bronce: 0 });
  assert.deepEqual(A(71, { oro: 0, plata: 0, bronce: 0 }, 'bronce'), { oro: 0, plata: 0, bronce: 71 });
  assert.deepEqual(A(2000500, { oro: 1, plata: 2, bronce: 3 }, 'plata'), { oro: 1, plata: 2002, bronce: 503 });
  assert.equal(A(-1, { oro: 0, plata: 0, bronce: 0 }, 'oro'), null);
  assert.equal(A(0.5, { oro: 0, plata: 0, bronce: 0 }, 'oro'), null);
});

test('un saldo viejo con decimales pasa a monedas enteras sin perder ni ganar valor', () => {
  assert.deepEqual(plano(f.saldoEntero({ oro: 9.95, plata: 0 })), { oro: 9, plata: 950, bronce: 0 });
  assert.deepEqual(plano(f.saldoEntero({ oro: 1.0005, plata: 2.5, bronce: 3 })), { oro: 1, plata: 2, bronce: 1003 });
  assert.deepEqual(plano(f.saldoEntero({ oro: -5, plata: NaN })), { oro: 0, plata: 0, bronce: 0 });
  assert.deepEqual(plano(f.saldoEntero(null)), { oro: 0, plata: 0, bronce: 0 });
});

test('precio e importe: en bronce el precio es entero y la comisión del 5 % también', () => {
  assert.deepEqual(plano(f.importeDe(3, 25, 'bronce')), { total: 75, fee: 4, sellerReceives: 71, totalB: 75, feeB: 4, sellerB: 71 });
  assert.deepEqual(plano(f.importeDe(2, 1, 'oro')), { total: 2, fee: 0.1, sellerReceives: 1.9, totalB: 2000000, feeB: 100000, sellerB: 1900000 });
  assert.deepEqual(plano(f.importeDe(4, 2.5, 'plata')), { total: 10, fee: 0.5, sellerReceives: 9.5, totalB: 10000, feeB: 500, sellerB: 9500 });
  for (const [q, p, m] of [[1, 2.5, 'bronce'], [1, 0, 'bronce'], [1, 1, 'cobre'], [0, 1, 'oro'], [1.5, 1, 'oro'], [1, -1, 'plata'], [1, NaN, 'oro']]) {
    assert.equal(f.importeDe(q, p, m), null, JSON.stringify([q, p, m]));
  }
  assert.equal(f.leerPrecio('25', 'bronce'), 25);
  assert.equal(f.leerPrecio('1.239', 'plata'), 1.24);
  assert.equal(f.precioValido(f.leerPrecio('2.5', 'bronce'), 'bronce'), false);
  assert.equal(f.precioValido(1, 'bronce'), true);
  assert.equal(f.precioValido(0.01, 'plata'), true);
  assert.equal(f.precioValido(0, 'oro'), false);
});

// ── Las rutas ───────────────────────────────────────────────────────────────
test('publicar en bronce: precio entero y una de las tres monedas; si no, el objeto no sale del inventario', async () => {
  const b = banco({ GamePlayer: [jugador('Seller', 'seller', [{ id: 0, IDX: 0, Manualid: 'palo', objeto: 'palo', cantidad: 10, tipo: 'inventario' }])],
                    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0, bronce: 0 })] });
  let r = await b.llamar('post /api/marketplace/list', 'seller', { body: { slotId: 0, itemId: 'palo', qty: 3, pricePerUnit: 25, currency: 'bronce' } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(b.data.Listing.length, 1);
  assert.deepEqual([b.data.Listing[0].currency, b.data.Listing[0].pricePerUnit, b.data.Listing[0].qty], ['bronce', 25, 3]);
  assert.equal(b.data.GamePlayer[0].inventory[0].cantidad, 7);
  for (const [body, error] of [
    [{ pricePerUnit: 2.5, currency: 'bronce' }, 'invalid_price'],
    [{ pricePerUnit: 0, currency: 'bronce' }, 'invalid_price'],
    [{ pricePerUnit: 5, currency: 'cobre' }, 'invalid_currency'],
    [{ pricePerUnit: 5, currency: ['bronce'] }, 'invalid_currency']
  ]) {
    r = await b.llamar('post /api/marketplace/list', 'seller', { body: { slotId: 0, itemId: 'palo', qty: 1, ...body } });
    assert.deepEqual([r.st, r.out.error], [400, error], JSON.stringify(body));
  }
  assert.equal(b.data.GamePlayer[0].inventory[0].cantidad, 7, 'un precio que no vale no se lleva nada');
  assert.equal(b.data.Listing.length, 1);
});

test('comprar en bronce con plata: paga, recibe la vuelta, el vendedor cobra en bronce y el 5 % va a los dos tesoros', async () => {
  const b = banco({
    GamePlayer: [jugador('Seller', 'seller'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0 }), saldo('Buyer', 'buyer', { oro: 0, plata: 1, bronce: 0 })],
    Listing: [{ _id: 'L1', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 3, pricePerUnit: 25, currency: 'bronce' }]
  });
  const r = await b.llamar('post /api/marketplace/buy/:id', 'buyer', { params: { id: 'L1' }, body: { qty: 3 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual([r.out.oro, r.out.plata, r.out.bronce, r.out.paid, r.out.fee], [0, 0, 925, 75, 4]);
  assert.deepEqual(b.monedas('Buyer'), [0, 0, 925]);
  assert.deepEqual(b.pendiente('Buyer'), ['bronce', 'plata']);
  assert.ok(esFecha(b.stats('Buyer').chainPendingSince));
  assert.deepEqual(b.monedas('Seller'), [0, 0, 71]);
  assert.deepEqual(b.pendiente('Seller'), ['bronce'], 'solo la moneda que cambió');
  assert.equal(b.data.Tesoro[0].saldo, 1);       // 1,5 % de 4 de bronce, hacia abajo
  assert.equal(b.data.TesoroJuego[0].saldo, 3);  // el resto
  assert.equal(b.data.Listing.length, 0, 'publicación agotada');
  assert.deepEqual(b.data.GamePlayer[1].inventory.map((e) => [e.objeto, e.cantidad]), [['palo', 3]]);
  const venta = b.data.MarketHistory.find((h) => h.type === 'sell');
  assert.deepEqual([venta.total, venta.fee, venta.sellerReceives, venta.currency], [75, 4, 71, 'bronce']);
});

test('una publicación en oro se paga con plata si no hay oro, y al vendedor le llegan 1 de oro y 900 de plata', async () => {
  const b = banco({
    GamePlayer: [jugador('Seller', 'seller'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0, bronce: 0 }), saldo('Buyer', 'buyer', { oro: 0, plata: 2500, bronce: 0 })],
    Listing: [{ _id: 'L2', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 5, pricePerUnit: 1, currency: 'oro' }]
  });
  const r = await b.llamar('post /api/marketplace/buy/:id', 'buyer', { params: { id: 'L2' }, body: { qty: 2 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual(b.monedas('Buyer'), [0, 500, 0]);
  assert.deepEqual(b.pendiente('Buyer'), ['plata']);
  assert.deepEqual(b.monedas('Seller'), [1, 900, 0]);
  assert.deepEqual(b.pendiente('Seller'), ['oro', 'plata']);
  assert.equal(b.data.Tesoro[0].saldo + b.data.TesoroJuego[0].saldo, 100000, '0,1 de oro de comisión, en bronce');
  assert.equal(b.data.Tesoro[0].saldo, 30000);
  assert.equal(b.data.Listing[0].qty, 3);
});

test('si no llega sumando oro, plata y bronce no se cobra nada ni se toca la publicación', async () => {
  const b = banco({
    GamePlayer: [jugador('Seller', 'seller'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0, bronce: 0 }), saldo('Buyer', 'buyer', { oro: 1, plata: 999, bronce: 999 })],
    Listing: [{ _id: 'L3', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 1, pricePerUnit: 2, currency: 'oro' }]
  });
  const r = await b.llamar('post /api/marketplace/buy/:id', 'buyer', { params: { id: 'L3' }, body: { qty: 1 } });
  assert.deepEqual([r.st, r.out.error], [402, 'insufficient_funds']);
  assert.deepEqual(b.monedas('Buyer'), [1, 999, 999]);
  assert.deepEqual(b.pendiente('Buyer'), []);
  assert.equal(b.data.Listing[0].qty, 1);
  assert.deepEqual(b.monedas('Seller'), [0, 0, 0]);
});

test('un saldo viejo de 9,95 de oro compra en plata y queda en monedas enteras con el mismo valor', async () => {
  const b = banco({
    GamePlayer: [jugador('Seller', 'seller'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0, bronce: 0 }), saldo('Buyer', 'buyer', { oro: 9.95, plata: 0 })],
    Listing: [{ _id: 'L4', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 1, pricePerUnit: 10, currency: 'plata' }]
  });
  const r = await b.llamar('post /api/marketplace/buy/:id', 'buyer', { params: { id: 'L4' }, body: { qty: 1 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual(b.monedas('Buyer'), [9, 940, 0]);   // 9.950.000 − 10.000 de bronce
  assert.deepEqual(b.pendiente('Buyer'), ['oro', 'plata']);
  assert.deepEqual(b.monedas('Seller'), [0, 9, 500]);  // 9,5 de plata
});

test('una oferta en bronce retiene su valor (rompiendo plata) y al cancelarla vuelve el mismo valor', async () => {
  const b = banco({
    GamePlayer: [jugador('Seller', 'seller'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0, bronce: 0 }), saldo('Buyer', 'buyer', { oro: 0, plata: 1, bronce: 0 })],
    Listing: [{ _id: 'L5', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 3, pricePerUnit: 25, currency: 'bronce' }]
  });
  let r = await b.llamar('post /api/marketplace/offer/:listingId', 'buyer', { params: { listingId: 'L5' }, body: { qty: 2, pricePerUnit: 2.5 } });
  assert.deepEqual([r.st, r.out.error], [400, 'invalid_price'], 'en bronce no hay medio bronce');
  r = await b.llamar('post /api/marketplace/offer/:listingId', 'buyer', { params: { listingId: 'L5' }, body: { qty: 2, pricePerUnit: 20 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual([r.out.offer.total, r.out.offer.currency, r.out.bronce], [40, 'bronce', 960]);
  assert.deepEqual(b.monedas('Buyer'), [0, 0, 960]);
  r = await b.llamar('post /api/marketplace/offer/:id/cancel', 'buyer', { params: { id: r.out.offer.id } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual(b.monedas('Buyer'), [0, 0, 1000]);
  assert.equal(r.out.bronce, 1000);
  assert.equal(b.data.MarketOffer[0].status, 'cancelled');
});

test('al aceptar una oferta en oro, el vendedor cobra en monedas enteras y el comprador recibe el objeto', async () => {
  const b = banco({
    GamePlayer: [jugador('Seller', 'seller'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Seller', 'seller', { oro: 0, plata: 0, bronce: 0 }), saldo('Buyer', 'buyer', { oro: 5, plata: 0, bronce: 0 })],
    Listing: [{ _id: 'L6', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 3, pricePerUnit: 1, currency: 'oro' }]
  });
  let r = await b.llamar('post /api/marketplace/offer/:listingId', 'buyer', { params: { listingId: 'L6' }, body: { qty: 1, pricePerUnit: 0.5 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual(b.monedas('Buyer'), [4, 500, 0]);      // rompe 1 de oro: 500 de plata de vuelta
  // Una oferta nueva cancela la anterior: vuelven sus 0,5 de oro (500 de plata) y se retienen 0,6.
  r = await b.llamar('post /api/marketplace/offer/:listingId', 'buyer', { params: { listingId: 'L6' }, body: { qty: 1, pricePerUnit: 0.6 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual(b.monedas('Buyer'), [4, 400, 0]);
  assert.deepEqual(b.data.MarketOffer.map((o) => o.status).sort(), ['cancelled', 'pending']);
  r = await b.llamar('post /api/marketplace/offer/:id/accept', 'seller', { params: { id: r.out.offer.id } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual([r.out.received, r.out.fee], [0.57, 0.03]);
  assert.deepEqual(b.monedas('Seller'), [0, 570, 0]);
  assert.deepEqual(b.pendiente('Seller'), ['plata']);
  assert.equal(b.data.Tesoro[0].saldo + b.data.TesoroJuego[0].saldo, 30000);
  assert.deepEqual(b.data.GamePlayer[1].inventory.map((e) => [e.objeto, e.cantidad]), [['palo', 1]]);
  assert.equal(b.data.Listing[0].qty, 2);
});

test('los lotes limitados del admin se venden en bronce y su precio también tiene que ser entero', async () => {
  const b = banco({
    GamePlayer: [jugador('Admin', 'admin'), jugador('Buyer', 'buyer')],
    PlayerStats: [saldo('Buyer', 'buyer', { oro: 0, plata: 0, bronce: 100 })]
  });
  let r = await b.llamar('post /api/marketplace/limited', 'admin', { body: { itemId: 'palo', qty: 10, pricePerUnit: 1.5, currency: 'bronce', hours: 2 } });
  assert.deepEqual([r.st, r.out.error], [400, 'invalid_price']);
  r = await b.llamar('post /api/marketplace/limited', 'admin', { body: { itemId: 'palo', qty: 10, pricePerUnit: 30, currency: 'bronce', hours: 2 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.limited.currency, 'bronce');
  const id = r.out.limited.id;
  r = await b.llamar('post /api/marketplace/limited/:id/buy', 'buyer', { params: { id }, body: { qty: 3 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual([r.out.bronce, r.out.remaining, r.out.paid], [10, 7, 90]);
  assert.deepEqual(b.monedas('Buyer'), [0, 0, 10]);
  assert.deepEqual(b.pendiente('Buyer'), ['bronce']);
  r = await b.llamar('post /api/marketplace/limited/:id/buy', 'buyer', { params: { id }, body: { qty: 1 } });
  assert.deepEqual([r.st, r.out.error], [402, 'insufficient_funds']);
  r = await b.llamar('patch /api/marketplace/limited/:id', 'admin', { params: { id }, body: { pricePerUnit: 2.5 } });
  assert.deepEqual([r.st, r.out.error], [400, 'invalid_price']);
  r = await b.llamar('patch /api/marketplace/limited/:id', 'admin', { params: { id }, body: { pricePerUnit: 40 } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(r.out.limited.pricePerUnit, 40);
});

test('la lista filtra por bronce y la categoría la decide el catálogo de hoy (un pez guardado como "otros" sale en Pesca)', async () => {
  const b = banco({
    GamePlayer: [jugador('Buyer', 'buyer')],
    Listing: [
      { _id: 'A', owner: 'seller', ownerName: 'Seller', itemId: 'pes1', name: 'pes1', category: 'otros', qty: 2, pricePerUnit: 40, currency: 'bronce' },
      { _id: 'B', owner: 'seller', ownerName: 'Seller', itemId: 'palo', name: 'Palo', category: 'madera', qty: 1, pricePerUnit: 1, currency: 'oro' },
      { _id: 'C', owner: 'seller', ownerName: 'Seller', itemId: 'cosa_rara', name: 'Cosa rara', category: 'pesca', qty: 1, pricePerUnit: 3, currency: 'plata' }
    ]
  });
  let r = await b.llamar('get /api/marketplace/listings', 'buyer', { query: { category: 'pesca' } });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual(r.out.listings.map((l) => [l.id, l.category]).sort(), [['A', 'pesca'], ['C', 'pesca']]);
  r = await b.llamar('get /api/marketplace/listings', 'buyer', { query: { currency: 'bronce' } });
  assert.deepEqual(r.out.listings.map((l) => l.id), ['A']);
  r = await b.llamar('get /api/marketplace/listings', 'buyer', { query: { currency: { $ne: 'x' } } });
  assert.equal(r.out.listings.length, 3, 'un objeto en la query no es un filtro');
});

test('la cuenta trae el bronce y los peces y pociones con su nombre, su icono y su pila', async () => {
  const b = banco({
    GamePlayer: [jugador('Buyer', 'buyer', [{ id: 0, objeto: 'pes1', cantidad: 4 }, { id: 1, objeto: 'elixir_revivir', cantidad: 1 }])],
    PlayerStats: [saldo('Buyer', 'buyer', { oro: 1, plata: 2, bronce: 3 })]
  });
  const r = await b.llamar('get /api/marketplace/account', 'buyer');
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.deepEqual([r.out.oro, r.out.plata, r.out.bronce], [1, 2, 3]);
  const pez = r.out.inventory.find((e) => e.itemId === 'pes1'), elixir = r.out.inventory.find((e) => e.itemId === 'elixir_revivir');
  assert.deepEqual([pez.name, pez.category, pez.icon, pez.maxStack], ['Brown Trout', 'pesca', '/Game/Objetos/pesca/pes1.png', 20]);
  assert.deepEqual([elixir.category, elixir.maxStack], ['pociones', 5]);
  for (const e of r.out.inventory) assert.ok(fs.existsSync(path.join(__dirname, '..', decodeURI(e.icon))), 'falta el icono ' + e.icon);
});
