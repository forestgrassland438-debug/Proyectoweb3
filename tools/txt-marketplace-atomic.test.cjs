'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const source = fs.readFileSync(path.join(__dirname, '../marketplace-routes.js'), 'utf8');
const declaration = acorn.parse(source, { ecmaVersion: 'latest' }).body.find(n => n.id?.name === 'createMarketAtomic');
const quiet = { log() {}, warn() {}, error() {} };
const createAtomic = vm.runInNewContext('(' + source.slice(declaration.start, declaration.end) + ')', { require, console: quiet });
const loadRoutes = () => {
  const c = vm.createContext({ module: { exports: {} }, require, console: quiet, setTimeout() {}, setInterval() {} });
  vm.runInContext(source, c); return c.module.exports;
};
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const clone = value => structuredClone(value);
function fixture({ unsupported = false, commitGate = null } = {}) {
  let version = 0, ended = 0, attempts = 0, failed = false;
  const routes = new Map(), queries = [], sessions = [];
  const data = { GamePlayer: [{ _id: 'g1', address: 'seller', playerName: 'Seller', inventory: [] }],
    PlayerStats: [{ _id: 's1', address: 'seller', playerName: 'Seller', oro: 0, plata: 0 }],
    Listing: [{ _id: 'listing', owner: 'seller', ownerName: 'Seller', itemId: 'palo', qty: 3, pricePerUnit: 1, currency: 'oro' }] };
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
    const actual = key === 'inventory.id' ? doc.inventory?.map(i => i.id) : doc[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$gte' in value) return actual >= value.$gte;
      if ('$lte' in value) return actual <= value.$lte;
      if ('$ne' in value) return Array.isArray(actual) ? !actual.includes(value.$ne) : actual !== value.$ne;
      if ('$elemMatch' in value) return actual?.some(row => matches(row, value.$elemMatch));
    }
    return String(actual) === String(value);
  });
  const mongoose = { models: {}, Schema: class {}, Types: { ObjectId: { isValid: () => true } },
    async startSession() {
      const session = { store: null,
        async withTransaction(work) {
          if (unsupported) throw Error('Transaction numbers are only allowed on a replica set');
          for (let i = 0; i < 10; i++) {
            attempts++; const current = version; session.store = clone(data);
            const result = await work();
            if (commitGate) await commitGate.promise;
            if (current !== version) continue;
            for (const key of Object.keys(data)) delete data[key];
            Object.assign(data, session.store); version++; return result;
          }
          throw Error('too many conflicts');
        }, async endSession() { ended++; } };
      sessions.push(session); return session;
    },
    model(name) {
      if (mongoose.models[name]) return mongoose.models[name];
      data[name] ||= [];
      const model = {};
      const query = (op, filter = {}, update = {}, options = {}) => {
        let session = options.session;
        const q = { session(s) { session = s; return q; }, lean() { return q; }, sort() { return q; }, limit() { return q; },
          async exec() {
            queries.push({ name, op, session });
            if (!session) assert.fail('market mutation escaped its session');
            if (failed && name === 'GamePlayer' && op === 'updateOne' && update.$push) throw Error('delivery failed');
            const rows = session.store[name], doc = rows.find(row => matches(row, filter));
            if (op === 'find') return clone(rows.filter(row => matches(row, filter)));
            if (op === 'findOne' || op === 'findById') return doc ? clone(doc) : null;
            if (op === 'deleteOne') { if (doc) rows.splice(rows.indexOf(doc), 1); return { deletedCount: doc ? 1 : 0 }; }
            if (!doc) return op === 'findOneAndUpdate' ? null : { matchedCount: 0 };
            for (const [key, value] of Object.entries(update.$set || {})) doc[key] = clone(value);
            for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
            for (const [key, value] of Object.entries(update.$push || {})) (doc[key] ||= []).push(clone(value));
            return op === 'findOneAndUpdate' ? clone(doc) : { matchedCount: 1 };
          }, then(yes, no) { return q.exec().then(yes, no); } };
        return q;
      };
      for (const op of ['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'deleteOne', 'deleteMany']) model[op] = (...args) => query(op, ...args);
      model.findById = id => query('findById', { _id: id });
      model.create = async (docs, opts) => {
        assert.ok(opts.session); const rows = docs.map(doc => ({ ...clone(doc), _id: 'created' }));
        opts.session.store[name].push(...rows); return rows;
      };
      mongoose.models[name] = model; return model;
    } };
  const app = {};
  for (const method of ['get', 'post', 'patch', 'delete']) app[method] = (url, ...handlers) => routes.set(method + ' ' + url, handlers.at(-1));
  loadRoutes()(app, { mongoose, GamePlayer: mongoose.model('GamePlayer'), PlayerStats: mongoose.model('PlayerStats'), Listing: mongoose.model('Listing'), authMiddleware() {}, csrfProtection() {}, apiLimiter() {} });
  async function call(route, user, id, body = {}) {
    const sent = [], res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { sent.push(value); this.body = value; return this; } };
    const promise = routes.get('post ' + route)({ user: { address: user }, params: { id }, body }, res, () => assert.fail('unexpected next'));
    return { promise, res, sent };
  }
  return { data, mongoose, queries, sessions, call, get ended() { return ended; }, get attempts() { return attempts; }, failDelivery() { failed = true; } };
}
test('simultaneous listing cancellations return inventory exactly once after transaction conflict retry', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.call('/api/marketplace/cancel/:id', 'seller', 'listing'), f.call('/api/marketplace/cancel/:id', 'seller', 'listing')]);
  await Promise.all([a.promise, b.promise]);
  assert.deepEqual([a.res.statusCode, b.res.statusCode].sort(), [200, 404]);
  assert.equal(f.data.Listing.length, 0); assert.equal(f.data.GamePlayer[0].inventory.reduce((n, x) => n + x.cantidad, 0), 3);
  assert.ok(f.attempts >= 3); assert.equal(f.ended, 2);
});
test('failed inventory delivery rolls back listing deletion and inventory marker', async () => {
  const f = fixture(); f.failDelivery();
  const a = await f.call('/api/marketplace/cancel/:id', 'seller', 'listing'); await a.promise;
  assert.equal(a.res.statusCode, 500); assert.equal(f.data.Listing.length, 1);
  assert.deepEqual(f.data.GamePlayer[0].inventory, []); assert.equal(f.data.GamePlayer[0].marketWriteAt, undefined);
});
test('simultaneous offer cancellation and rejection refund escrow only once', async () => {
  const f = fixture();
  f.data.GamePlayer.push({ _id: 'g2', address: 'buyer', playerName: 'Buyer', inventory: [] });
  f.data.PlayerStats.push({ _id: 's2', address: 'buyer', playerName: 'Buyer', oro: 0, plata: 0 });
  f.data.MarketOffer.push({ _id: 'offer', buyer: 'buyer', seller: 'seller', total: 10, currency: 'oro', status: 'pending' });
  const [a, b] = await Promise.all([f.call('/api/marketplace/offer/:id/cancel', 'buyer', 'offer'), f.call('/api/marketplace/offer/:id/reject', 'seller', 'offer')]);
  await Promise.all([a.promise, b.promise]);
  assert.deepEqual([a.res.statusCode, b.res.statusCode].sort(), [200, 409]);
  assert.equal(f.data.PlayerStats[1].oro, 10); assert.ok(['cancelled', 'rejected'].includes(f.data.MarketOffer[0].status));
});
test('success response is held until commit; unsupported transactions never move funds', async () => {
  const gate = deferred(), f = fixture({ commitGate: gate });
  const a = await f.call('/api/marketplace/cancel/:id', 'seller', 'listing');
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(a.sent.length, 0); assert.equal(f.data.Listing.length, 1);
  gate.resolve(); await a.promise; assert.equal(a.res.statusCode, 200);
  const blocked = fixture({ unsupported: true }), b = await blocked.call('/api/marketplace/cancel/:id', 'seller', 'listing'); await b.promise;
  assert.equal(b.res.statusCode, 503); assert.equal(blocked.queries.length, 0); assert.equal(blocked.data.Listing.length, 1); assert.equal(blocked.ended, 1);
});
test('transaction proxy passes session through create and query chaining without global Mongoose options', async () => {
  const seen = [], session = { withTransaction: fn => fn(), async endSession() {} };
  const atomic = createAtomic({ startSession: async () => session });
  const raw = { async create(docs, opts) { seen.push(opts.session); return docs; },
    findOne() { const q = { session(value) { seen.push(value); return q; }, lean() { return q; }, async exec() { return { name: 'offline' }; } }; return q; } };
  const model = atomic.model(raw);
  await atomic.transaction(async () => {
    assert.equal((await model.create({ name: 'new' })).name, 'new');
    assert.equal((await model.findOne({}).lean().exec()).name, 'offline');
    await atomic.transaction(async () => assert.equal((await model.create({ name: 'nested' })).name, 'nested'));
  });
  assert.deepEqual(seen, [session, session, session]);
});

test('installed Mongoose propagates sessions through hydrated save, query and create without opening a connection', async t => {
  let modulePath;
  try { modulePath = require.resolve('mongoose', { paths: [path.join(__dirname, '../GrasslandBuild/repositories/backend')] }); }
  catch { t.skip('Backend Mongoose dependency is not installed'); return; }
  const mongoose = require(modulePath);
  const name = 'TxtMarketAtomicOffline';
  const model = mongoose.model(name, new mongoose.Schema({ name: String }, { bufferCommands: false }));
  class OfflineSession { withTransaction(fn) { return fn(); } async endSession() {} inTransaction() { return true; } }
  const session = new OfflineSession(), seen = [];
  // Replace every used collection transport. Any missing stub fails because
  // buffering is disabled and no Mongo connection exists.
  for (const op of ['findOne', 'updateOne', 'insertOne']) model.collection[op] = async (...args) => {
    seen.push({ op, bound: args.at(-1).session === session });
    return op === 'findOne' ? { _id: new mongoose.Types.ObjectId(), name: 'old' } : { matchedCount: 1 };
  };
  try {
    const atomic = createAtomic({ startSession: async () => session });
    await atomic.transaction(async () => {
      const proxy = atomic.model(model), doc = await proxy.findOne({});
      assert.equal(doc.$session(), session); doc.name = 'changed'; await doc.save();
      await proxy.create({ name: 'created' });
    });
    assert.deepEqual(seen.map(x => x.op), ['findOne', 'updateOne', 'insertOne']);
    assert.ok(seen.every(x => x.bound));
  } finally { mongoose.deleteModel(name); }
});
