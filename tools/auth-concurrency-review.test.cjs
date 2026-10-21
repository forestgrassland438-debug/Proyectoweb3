'use strict';
// Execute the Desktop backend handlers in isolation, with real local crypto and
// an atomic in-memory DB fixture. Never load startup, live Mongo, RPC or secrets.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const path = require('node:path'), { createRequire } = require('node:module');
const acorn = require('acorn'), ethers = require('ethers');
const backendRequire = createRequire(path.resolve(__dirname, '../GrasslandBuild/repositories/backend/package.json'));
const jwt = backendRequire('jsonwebtoken');
const source = fs.readFileSync(process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js', 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
function declaration(name) { const node = ast.body.find(n => n.id?.name === name); assert.ok(node, name); return source.slice(node.start, node.end); }
function handler(method, route) {
  const node = ast.body.find(n => n.expression?.callee?.object?.name === 'app' && n.expression.callee.property.name === method && n.expression.arguments[0]?.value === route);
  const fn = node.expression.arguments.at(-1); return '(' + source.slice(fn.start, fn.end) + ')';
}
const wallet = ethers.Wallet.createRandom(), address = wallet.address.toLowerCase();
const copy = value => value ? structuredClone(value) : value;
function matches(doc, query) {
  if (!doc) return false;
  return Object.entries(query).every(([k, v]) => {
    if (k === '$or') return v.some(q => matches(doc, q));
    if (v && !(v instanceof Date) && typeof v === 'object') return Object.entries(v).every(([op, n]) => op === '$gt' ? doc[k] > n : op === '$gte' ? doc[k] >= n : op === '$lte' ? doc[k] <= n : op === '$eq' ? doc[k] === n : false);
    return v == null ? doc[k] == null : doc[k] instanceof Date ? +doc[k] === +v : doc[k] === v;
  });
}
function fixture(extra = {}) {
  let player = { address, nonce: 'n'.repeat(64), nonceTimestamp: new Date(), loginAttempts: 0, loginBlockedUntil: null };
  const tokens = [], writes = []; let bcryptCalls = 0;
  const query = result => ({ exec: async () => copy(result), lean() { return this; } });
  const PlayerAuth = {
    findOne(q) { return query(matches(player, q) ? player : null); },
    async findOneAndUpdate(q, update) { writes.push({ model: 'PlayerAuth', q, update }); if (!matches(player, q)) return null; Object.assign(player, update.$set); return copy(player); },
    async updateOne(q, update) { if (!matches(player, q)) return { matchedCount: 0 }; Object.assign(player, update.$set); return { matchedCount: 1 }; }
  };
  const RefreshToken = {
    async findOne(q) { return copy(tokens.find(t => matches(t, q))); },
    async create(value) { if (extra.failCreate) throw Error('DB offline'); const doc = { _id: crypto.randomUUID(), ...value }; tokens.push(doc); return copy(doc); },
    async deleteOne(q) { const index = tokens.findIndex(t => matches(t, q)); if (index >= 0) tokens.splice(index, 1); },
    async findOneAndUpdate(q, update) { if (extra.failRotate) throw Error('DB offline'); const doc = tokens.find(t => matches(t, q)); if (!doc) return null; Object.assign(doc, update.$set); return copy(doc); }
  };
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Date, Buffer, process: { env: {} }, crypto, ethers, jwt,
    APP_NAME: 'Grassland Forest', JWT_SECRET: 'offline-fixture-only', REFRESH_TOKEN_TTL_DAYS: 7, ACCESS_TOKEN_EXPIRES: '15m',
    uuidv4: () => crypto.randomUUID(), bcrypt: { async hash(raw) { bcryptCalls++; if (extra.duringHash) await extra.duringHash(); return 'fixture:' + raw.slice(-16); } },
    PlayerAuth, RefreshToken, GamePlayer: { findOne: () => query({ playerName: 'Alice' }) },
    checkGameAccess: async () => ({ allowed: true }), setCookieOptions: () => ({ httpOnly: true }),
    generateCSRFToken: () => 'csrf-fixture', ...extra.context });
  vm.runInContext(declaration('generateNonce') + declaration('isValidEthereumAddress') + declaration('validateSignedMessage'), c);
  async function run(route, req) {
    const response = { statusCode: 200, cookies: [], headers: {}, status(n) { this.statusCode = n; return this; },
      json(body) { this.body = body; return this; }, cookie(...args) { this.cookies.push(args); }, clearCookie() {}, setHeader(k, v) { this.headers[k] = v; } };
    await vm.runInContext(handler(route.endsWith('/nonce') ? 'get' : 'post', route), c)({ headers: {}, ...req }, response); return response;
  }
  return { c, tokens, writes, run, get player() { return player; }, get bcryptCalls() { return bcryptCalls; },
    async loginBody() { const token = player.nonce + ':' + Math.floor(Date.now() / 1000); const message = 'Signing in to Grassland Forest: ' + Buffer.from(token).toString('base64'); return { address, token, message, signature: await wallet.signMessage(message) }; },
    refresh() { const raw = jwt.sign({ address, type: 'refresh', jti: crypto.randomUUID() }, 'offline-fixture-only', { expiresIn: '7d' }); tokens.push({ _id: crypto.randomUUID(), token: crypto.createHash('sha256').update(raw).digest('hex'), address, expiresAt: new Date(Date.now() + 86400000) }); return raw; }
  };
}
test('the same valid signature can claim its nonce once under concurrent login', async () => {
  const f = fixture(), body = await f.loginBody(); const results = await Promise.all(Array.from({ length: 10 }, () => f.run('/api/auth/login', { body })));
  assert.equal(results.filter(r => r.statusCode === 200).length, 1); assert.equal(f.tokens.length, 1); assert.equal(f.bcryptCalls, 1);
  assert.ok(results.filter(r => r.statusCode !== 200).every(r => r.statusCode === 401 && r.cookies.length === 0));
});
test('a newly issued nonce survives completion of an earlier successful login', async () => {
  let f; f = fixture({ duringHash() { f.player.nonce = 'new-nonce'; f.player.nonceTimestamp = new Date(); } });
  const r = await f.run('/api/auth/login', { body: await f.loginBody() }); assert.equal(r.statusCode, 200); assert.equal(f.player.nonce, 'new-nonce');
});
test('a blocked account cannot log in with its previously valid signature', async () => {
  const f = fixture(), body = await f.loginBody(); f.player.loginBlockedUntil = new Date(Date.now() + 60000);
  const r = await f.run('/api/auth/login', { body }); assert.equal(r.statusCode, 429); assert.equal(f.tokens.length, 0); assert.ok(f.player.nonce);
});
test('nonce requests validate types and reuse one read for an existing unblocked challenge', async () => {
  const f = fixture(); let reads = 0; const original = f.c.PlayerAuth.findOne;
  f.c.PlayerAuth.findOne = q => { reads++; return original(q); };
  assert.equal((await f.run('/api/auth/nonce', { query: { address: { $gt: '' } } })).statusCode, 400);
  assert.equal((await f.run('/api/auth/nonce', { query: { address } })).body.nonce, f.player.nonce); assert.equal(reads, 1);
  f.player.loginBlockedUntil = new Date(Date.now() + 60000); assert.equal((await f.run('/api/auth/nonce', { query: { address } })).statusCode, 429);
  f.player.loginBlockedUntil = null; f.player.nonceTimestamp = new Date(Date.now() - 3600000); reads = 0;
  assert.equal((await f.run('/api/auth/nonce', { query: { address } })).body.reused, false); assert.equal(reads, 1);
});
test('refresh rotation atomically replaces the old token and has one winner', async () => {
  const f = fixture(), raw = f.refresh(); const results = await Promise.all(Array.from({ length: 8 }, () => f.run('/api/auth/refresh', { cookies: { refresh: raw } })));
  assert.equal(results.filter(r => r.statusCode === 200).length, 1); assert.equal(f.tokens.length, 1);
  const winner = results.find(r => r.statusCode === 200), next = winner.cookies.find(row => row[0] === 'refresh')[1];
  assert.equal(f.tokens[0].token, crypto.createHash('sha256').update(next).digest('hex'));
  assert.equal((await f.run('/api/auth/refresh', { cookies: { refresh: raw } })).statusCode, 401);
});
test('a failed replacement leaves the previous refresh token usable', async () => {
  const f = fixture({ failRotate: true, failCreate: true }), raw = f.refresh(), before = copy(f.tokens[0]);
  const r = await f.run('/api/auth/refresh', { cookies: { refresh: raw } }); assert.equal(r.statusCode, 500); assert.deepEqual(f.tokens, [before]); assert.equal(r.cookies.length, 0);
});
test('a noncritical PlayerAuth metadata failure after rotation does not strand the new token', async () => {
  const f = fixture(), raw = f.refresh(); f.c.PlayerAuth.updateOne = async () => { throw Error('metadata DB error'); };
  const r = await f.run('/api/auth/refresh', { cookies: { refresh: raw } }); assert.equal(r.statusCode, 200); assert.ok(r.cookies.some(row => row[0] === 'refresh'));
});
test('access-check failure cannot issue login cookies or pass protected middleware', async () => {
  const f = fixture({ context: { checkGameAccess: async () => { throw Error('DB unavailable'); } } });
  const r = await f.run('/api/auth/login', { body: await f.loginBody() }); assert.equal(r.statusCode, 503); assert.equal(f.tokens.length, 0); assert.ok(f.player.nonce);
  f.c.ACCESS_EXEMPT_PATHS = new Set(['/api/auth/logout']); vm.runInContext(declaration('enforceGameAccess'), f.c);
  let next = 0; const response = { status(n) { this.code = n; return this; }, setHeader() {}, json(body) { this.body = body; } };
  await f.c.enforceGameAccess({ path: '/api/player/save', user: { address } }, response, () => next++);
  assert.equal(next, 0); assert.equal(response.code, 503);
  await f.c.enforceGameAccess({ path: '/api/auth/logout', user: { address } }, response, () => next++); assert.equal(next, 1);
});
test('a failed suspension lookup never becomes permission to enter an open game', async () => {
  const f = fixture({ context: { isAdminAddressCached: async () => false, getAccessControlCached: async () => ({ mode: 'open' }),
    getActiveSuspension: async () => { throw Error('DB unavailable'); } } });
  vm.runInContext(declaration('checkGameAccess'), f.c); await assert.rejects(f.c.checkGameAccess(address), /DB unavailable/);
});
test('expired nonce cleanup cannot erase a newer challenge issued concurrently', async () => {
  const f = fixture(), body = await f.loginBody(); f.player.nonceTimestamp = new Date(Date.now() - 3600000);
  f.c.PlayerAuth.updateOne = async (query, update) => { f.player.nonce = 'new-challenge'; if (matches(f.player, query)) Object.assign(f.player, update.$set); };
  const r = await f.run('/api/auth/login', { body }); assert.equal(r.statusCode, 401); assert.equal(f.player.nonce, 'new-challenge');
});
