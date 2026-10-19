'use strict';
// Only evaluate production declarations extracted by AST; never start the backend or access a live RPC/database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const backendPath = process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js';
const source = fs.readFileSync(backendPath, 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
function declaration(name) {
  const node = ast.body.find(n => n.id?.name === name || n.declarations?.some(d => d.id.name === name));
  assert.ok(node, 'Missing production declaration: ' + name);
  return source.slice(node.start, node.end);
}
const address = '0x' + '1'.repeat(40);
function fixture(extra = {}) {
  let now = 100000, calls = 0, csrfCalls = 0, rpc = async () => true;
  const providers = [], transports = [], tokens = new Map([
    ['session', { type: 'access', address }], ['refresh', { type: 'refresh', address }],
    ['bearer', { role: 'admin', address }], ['other', { role: 'player', address }]
  ]);
  const context = {
    process: { env: {} }, console: { log() {}, warn() {}, error() {} },
    Date: class extends Date { static now() { return now; } }, setTimeout, clearTimeout,
    provider: { name: 'gameplay' }, impactReadProvider: { name: 'bounded-read' },
    adminReadProvider: null, RPC_URL: 'https://game.rpc.example.invalid', CHAIN_ID: 4441,
    describeChainAuditError: require('../backend-impact/litvm-chain-audit.cjs').describeError,
    crearProveedorLecturaImpacto(url, chainId) {
      const transport = { name: 'admin-read', url, chainId, async send(method) {
        assert.equal(method, 'eth_chainId'); return context.adminNetworkId ?? '0x1159';
      } };
      transports.push(transport); return transport;
    },
    CONTRACTS: { ITEMS_CONTRACT: { address, abi: [] } }, JWT_SECRET: 'fixture-only',
    ethers: { Contract: class {
      constructor(_address, _abi, provider) {
        assert.deepEqual(Array.from(_abi), ['function isAdmin(address) view returns (bool)']);
        providers.push(provider); if (context.constructorError) throw Error('Invalid contract configuration');
      }
      isAdmin(addr) { calls++; assert.equal(addr, address); return rpc(); }
    } },
    jwt: { verify(token, secret, options) {
      assert.equal(secret, 'fixture-only'); assert.deepEqual(Array.from(options.algorithms), ['HS256']);
      if (!tokens.has(token)) throw Error('JWT rejected');
      return tokens.get(token);
    } },
    csrfProtection(req, res, next) {
      csrfCalls++;
      if (req.method === 'POST' && req.headers['x-csrf-token'] !== 'fresh-csrf') return res.status(403).json({ error: 'csrf_token_invalid' });
      return next();
    }, ...extra
  };
  vm.createContext(context);
  const names = ['obtenerProveedorLecturaAdmin', 'verifyAdminAddress', 'isAdminAddress', '_accessCfgCache', '_adminAddrCache', 'ACCESS_CACHE_MS',
    'ADMIN_VERIFIED_CACHE_MS', 'ADMIN_RPC_ERROR_CACHE_MS', 'invalidateAccessCache', 'isAdminAddressCached', 'adminAuth'];
  vm.runInContext(names.map(declaration).join('\n') + '\nthis.helpers = { verifyAdminAddress, isAdminAddress, isAdminAddressCached, invalidateAccessCache, adminAuth, cache: _adminAddrCache };', context);
  return {
    ...context.helpers, context, tokens, providers, transports,
    advance(ms) { now += ms; }, setRpc(fn) { rpc = fn; }, get calls() { return calls; }, get csrfCalls() { return csrfCalls; },
    async request({ cookie = 'session', bearer = null, method = 'GET', csrf = null } = {}) {
      let nextCalls = 0;
      const req = { cookies: cookie ? { session: cookie } : {}, headers: {}, method };
      if (bearer) req.headers.authorization = 'Bearer ' + bearer;
      if (csrf) req.headers['x-csrf-token'] = csrf;
      const res = { statusCode: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
      await context.helpers.adminAuth(req, res, () => { nextCalls++; });
      return { req, res, nextCalls };
    }
  };
}

test('concurrent admin checks share a bounded read and a short verified cache', async () => {
  const f = fixture(); let resolve;
  f.setRpc(() => new Promise(r => { resolve = r; }));
  const requests = Array.from({ length: 15 }, () => f.request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls, 1);
  resolve(true);
  const results = await Promise.all(requests);
  assert.ok(results.every(r => r.nextCalls === 1 && r.req.admin.via === 'wallet'));
  assert.equal(f.providers[0].name, 'admin-read');
  assert.equal(await f.verifyAdminAddress(address.toUpperCase().replace('0X', '0x')), true);
  assert.equal(f.calls, 1);
  f.advance(10001); f.setRpc(async () => false);
  const revoked = await f.request();
  assert.equal(revoked.res.statusCode, 403); assert.equal(revoked.res.body.error, 'not_admin'); assert.equal(revoked.nextCalls, 0);
  assert.equal(f.calls, 2);
  assert.equal((await f.request()).res.statusCode, 403); assert.equal(f.calls, 2);
});

test('RPC bandwidth failure remains unknown with 503, singleflight and cooldown, then recovers', async () => {
  const f = fixture();
  f.setRpc(async () => { throw Object.assign(Error('Bandwidth limit exceeded'), { code: -31002 }); });
  const results = await Promise.all(Array.from({ length: 20 }, () => f.request()));
  assert.equal(f.calls, 1); assert.equal(f.csrfCalls, 0);
  assert.ok(results.every(r => r.res.statusCode === 503 && r.res.body.error === 'admin_verification_unavailable' && !r.req.admin && !r.nextCalls));
  assert.equal(results[0].res.headers['Retry-After'], '30');
  assert.equal(f.cache.get(address).value, undefined);
  assert.equal(await f.isAdminAddress(address), false);
  assert.equal(await f.isAdminAddressCached(address), false);
  assert.equal(f.cache.get(address).value, undefined); assert.equal(f.calls, 1);
  f.setRpc(async () => true); f.advance(15000);
  assert.equal((await f.request()).res.statusCode, 503); assert.equal(f.calls, 1);
  f.advance(15001);
  assert.equal((await f.request()).nextCalls, 1); assert.equal(f.calls, 2);
});

test('an expired positive cache cannot authorize unknown state or become a false revocation', async () => {
  const f = fixture();
  assert.equal((await f.request()).nextCalls, 1);
  f.advance(10001); f.setRpc(async () => { throw Error('RPC offline'); });
  const result = await f.request();
  assert.equal(result.res.statusCode, 503); assert.equal(result.nextCalls, 0);
  assert.equal(f.cache.get(address).value, undefined);
});

test('environment admins are immediate and never need RPC, including during an RPC cooldown', async () => {
  const f = fixture(); f.setRpc(async () => { throw Error('RPC offline'); });
  assert.equal((await f.request()).res.statusCode, 503);
  f.context.process.env.ADMIN_ADDRESSES = ' 0x' + '2'.repeat(40) + ', ' + address.toUpperCase() + ' ';
  assert.equal((await f.request()).nextCalls, 1); assert.equal(f.calls, 1);
  delete f.context.process.env.ADMIN_ADDRESSES;
  assert.equal((await f.request()).res.statusCode, 503); assert.equal(f.calls, 1);
});

test('timeout denies unknown admin state without hanging requests or bypassing CSRF', async () => {
  let timeout;
  const f = fixture({ setTimeout(fn, ms) { assert.equal(ms, 8000); timeout = fn; return { unref() {} }; }, clearTimeout() {} });
  f.setRpc(() => new Promise(() => {}));
  const pending = f.request(); await new Promise(resolve => setImmediate(resolve)); timeout();
  const result = await pending;
  assert.equal(result.res.statusCode, 503); assert.equal(result.nextCalls, 0); assert.equal(f.csrfCalls, 0);
  assert.equal((await f.request()).res.statusCode, 503); assert.equal(f.calls, 1);
});

test('synchronous configuration errors are retryable after cooldown and never cache a rejected init promise', async () => {
  const f = fixture({ constructorError: true });
  assert.equal((await f.request()).res.statusCode, 503); assert.equal(f.cache.get(address).work, null);
  f.context.constructorError = false; f.advance(30001);
  assert.equal((await f.request()).nextCalls, 1); assert.equal(f.calls, 1);
});

test('administrative reads remain independent of an overloaded audit endpoint and an outdated deployed ABI', async () => {
  const f = fixture();
  f.context.CONTRACTS.ITEMS_CONTRACT.abi = [];
  f.context.process.env.LITVM_AUDIT_RPC_URL = 'https://overloaded.archive.invalid';
  f.context.impactReadProvider.send = () => { throw Error('Audit quota exhausted'); };
  assert.equal((await f.request()).nextCalls, 1);
  assert.equal(f.transports.length, 1); assert.equal(f.transports[0].url, f.context.RPC_URL);
  assert.equal(f.calls, 1);
  const configured = fixture();
  configured.context.process.env.ADMIN_RPC_URL = 'https://admin.rpc.example.invalid';
  assert.equal((await configured.request()).nextCalls, 1);
  assert.equal(configured.transports[0].url, 'https://admin.rpc.example.invalid');
});

test('a misconfigured administrative RPC cannot authorize a role on the wrong network', async () => {
  const f = fixture({ adminNetworkId: '0x1' });
  const wrong = await f.request();
  assert.equal(wrong.res.statusCode, 503); assert.equal(wrong.nextCalls, 0); assert.equal(f.calls, 0);
  assert.equal(wrong.res.body.diagnostic.code, 'ADMIN_RPC_CHAIN_MISMATCH');
  f.context.adminNetworkId = '0x1159'; f.advance(30001);
  assert.equal((await f.request()).nextCalls, 1); assert.equal(f.calls, 1);
});

test('administrative diagnostics preserve the RPC error code while redacting connection secrets', async () => {
  const logged = [];
  const f = fixture({ console: { log() {}, error() {}, warn(...args) { logged.push(args.join(' ')); } } });
  f.setRpc(async () => { throw Object.assign(Error('exceeded maximum retry limit at https://user:secret@rpc.invalid/private'), {
    code: 'SERVER_ERROR', info: { responseBody: JSON.stringify({ error: { code: -31002,
      message: 'Bandwidth limit exceeded at https://rpc.invalid/private?api_key=hidden' } }) }
  }); });
  const failed = await f.request();
  assert.equal(failed.res.statusCode, 503); assert.equal(failed.res.body.retryAfterSeconds, 30);
  assert.equal(failed.res.body.diagnostic.code, -31002);
  assert.equal(failed.res.body.diagnostic.stage, 'admin_role_verification');
  assert.doesNotMatch(JSON.stringify(failed.res.body) + logged.join(' '), /user:secret|rpc\.invalid|api_key=hidden/);
  assert.equal(logged.length, 1); await f.request(); assert.equal(logged.length, 1);
});

test('valid cookie admin checks still enforce CSRF, and invalid/wrong-type JWTs cannot call the RPC', async () => {
  const f = fixture();
  const rejected = await f.request({ method: 'POST' });
  assert.equal(rejected.res.statusCode, 403); assert.equal(rejected.res.body.error, 'csrf_token_invalid'); assert.equal(rejected.nextCalls, 0);
  const accepted = await f.request({ method: 'POST', csrf: 'fresh-csrf' });
  assert.equal(accepted.nextCalls, 1); assert.equal(f.csrfCalls, 2);
  const calls = f.calls;
  for (const cookie of [null, 'invalid', 'refresh']) {
    const result = await f.request({ cookie });
    assert.equal(result.res.statusCode, 401); assert.equal(result.nextCalls, 0);
  }
  assert.equal(f.calls, calls);
});

test('legacy Bearer admin authorization preserves JWT roles and never uses an unverified wallet result', async () => {
  const f = fixture();
  const accepted = await f.request({ cookie: 'invalid', bearer: 'bearer' });
  assert.equal(accepted.nextCalls, 1); assert.equal(accepted.req.admin.role, 'admin'); assert.equal(f.calls, 0);
  assert.equal((await f.request({ cookie: null, bearer: 'other' })).res.statusCode, 403);
  assert.equal((await f.request({ cookie: null, bearer: 'invalid' })).res.statusCode, 403);
  f.setRpc(async () => false);
  assert.equal((await f.request({ bearer: 'bearer' })).res.body.error, 'not_admin');
});

test('explicit access-cache invalidation discards verified roles and prevents stale in-flight results repopulating the cache', async () => {
  const f = fixture(); let resolve;
  f.setRpc(() => new Promise(r => { resolve = r; }));
  const first = f.verifyAdminAddress(address); await new Promise(resolve => setImmediate(resolve));
  f.invalidateAccessCache(); resolve(true); assert.equal(await first, true);
  assert.equal(f.cache.size, 0);
  f.setRpc(async () => false);
  assert.equal((await f.request()).res.body.error, 'not_admin'); assert.equal(f.calls, 2);
});
