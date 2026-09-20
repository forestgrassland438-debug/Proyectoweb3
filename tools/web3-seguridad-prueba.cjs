'use strict';

// Offline regression tests: no real wallet, account, signature or network call.
// Run: node --test bin/tools/web3-seguridad-prueba.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const silent = { log() {}, warn() {}, error() {} };
function clock() {
  let now = 0, next = 1;
  const jobs = new Map();
  const add = (fn, ms, repeat) => { const id = next++; jobs.set(id, { fn, at: now + ms, ms, repeat }); return id; };
  return {
    jobs,
    setTimeout: (fn, ms = 0) => add(fn, ms, false), clearTimeout: id => jobs.delete(id),
    setInterval: (fn, ms) => add(fn, ms, true), clearInterval: id => jobs.delete(id),
    requestAnimationFrame: fn => add(fn, 16, false), cancelAnimationFrame: id => jobs.delete(id),
    performance: { now: () => now },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const ready = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!ready) break;
        const [id, job] = ready; now = job.at;
        if (job.repeat) job.at += job.ms; else jobs.delete(id);
        job.fn();
      }
      now = end;
    }
  };
}
function context(extra = {}) {
  const timers = clock();
  const listeners = new Map();
  const window = {
    location: { href: 'https://game.example.test/play', origin: 'https://game.example.test' },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); }
  };
  const ctx = vm.createContext({ console: silent, URL, AbortController, TextEncoder, TextDecoder,
    Uint8Array, btoa, atob, window, self: window, location: window.location,
    document: { cookie: 'csrf-token=offline', getElementById: () => null },
    ...timers, ...extra });
  return { ctx, timers, window, listeners };
}
function load(name, env, exported) {
  vm.runInContext(fs.readFileSync(path.join(BIN, name), 'utf8'), env.ctx, { filename: name });
  return exported ? vm.runInContext(exported, env.ctx) : undefined;
}
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status,
  text: async () => JSON.stringify(data), json: async () => data });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const address = '0x' + '1'.repeat(40);
const hash = '0x' + 'a'.repeat(64);

test('History hub attaches CSRF to mutations, encodes IDs and discards stale account history', async () => {
  const calls = [];
  let resolveHistory;
  const token = 'a'.repeat(64);
  const env = context({ AbortSignal, document: { getElementById: () => null, querySelectorAll: () => [] }, fetch: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/csrf-token')) return response({ csrfToken: token });
    if (url.includes('?playerName=')) return new Promise(resolve => { resolveHistory = resolve; });
    return response({ success: true });
  } });
  const History = load('hub.js', env, 'hub');
  const history = new History(); history.disabled = false; history.renderCategory = () => {}; history.statusSpan = {};
  history.setUser('Alice', address);
  await history.saveToBackend({ id: 'local-test' });
  assert.equal(calls.at(-1).options.headers['X-CSRF-Token'], token);
  await history.deleteFromBackend('unsafe/id');
  assert.match(calls.at(-1).url, /unsafe%2Fid$/);
  assert.equal(calls.at(-1).options.headers['X-CSRF-Token'], token);
  const pending = history.loadFromBackend(); await flush();
  history.setUser('Bob', '0x' + '2'.repeat(40));
  resolveHistory(response({ interaction: [{ name: 'Alice private entry' }], items: [] }));
  await pending;
  assert.equal(history.transactions.interaction.length, 0);
});

test('TxGate removes timeout listeners and clears heartbeat after each timed-out wait', async () => {
  const env = context();
  vm.runInContext(`const originalPush = Array.prototype.push; Array.prototype.push = function (...values) {
    if (values.some(v => typeof v === 'function' && v.name === 'alVaciarse')) globalThis.waiters = this;
    return originalPush.apply(this, values);
  };`, env.ctx);
  load('tx-gate.js', env);
  const gate = env.window.GFTxGate, end = gate.begin('purchase');
  for (let i = 0; i < 20; i++) {
    const waiting = gate.whenIdle({ timeout: 10, onTick() {} });
    env.timers.tick(10);
    assert.equal((await waiting).idle, false);
    assert.equal(vm.runInContext('waiters.length', env.ctx), 0);
    assert.equal(env.timers.jobs.size, 1, 'only the transaction safety timer remains');
  }
  end(); end();
  assert.equal(env.timers.jobs.size, 0);
});

function hubFixture() {
  const env = context();
  const Hub = load('TransactionHub.js', env, 'TransactionHub');
  const hub = new Hub();
  const node = () => ({ style: {}, attributes: {}, textContent: '',
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; } });
  hub.isInitialized = true;
  hub.currentNotification = node();
  for (const key of ['_hubElement', '_messageElement', '_hashElement', '_explorerElement', '_statusDot']) hub[key] = node();
  return { ...env, hub };
}
test('TransactionHub rejects active explorer URLs and malformed transaction hashes', () => {
  const { hub } = hubFixture();
  hub.showCompleted(hash, 'done', 'javascript:alert(1)//');
  assert.equal(hub._explorerElement.attributes.href, undefined);
  hub.showCompleted(hash, 'done', 'https://explorer.example.test/tx/');
  assert.equal(hub._explorerElement.attributes.href, 'https://explorer.example.test/tx/' + hash);
  hub.showCompleted('../script', 'done', 'https://explorer.example.test/tx/');
  assert.equal(hub._explorerElement.attributes.href, undefined);
});
test('TransactionHub does not hide a new notification from an older timer; destroy clears all jobs', () => {
  const { hub, timers } = hubFixture();
  hub.showPending('first');
  hub.hideNotification();
  hub.showPending('second');
  timers.tick(600);
  assert.equal(hub._hubElement.style.display, 'block');
  assert.equal(hub._messageElement.textContent, 'second');
  hub.showCompleted(hash);
  hub.destroy();
  assert.equal(timers.jobs.size, 0);
});
test('TransactionHub bounds style/timer inputs instead of accepting CSS strings or Infinity', () => {
  const { hub } = hubFixture();
  hub.updateConfig({ width: '1px;}body{display:none}', animationDuration: Infinity, visibleDuration: NaN });
  assert.equal(hub.config.width, 320);
  assert.equal(hub.config.animationDuration, 500);
  assert.equal(hub.config.visibleDuration, 10000);
});

test('BlockchainManager rolls a failed reservation back only once and rejects inherited functions', async () => {
  const env = context({ fetch: async () => response({ error: 'rejected' }, 400),
    sessionStorage: { getItem: () => JSON.stringify({ accessToken: 'offline-test' }) } });
  const Manager = load('BlockchainManager.js', env, 'BlockchainManager');
  const manager = new Manager({ serverclient: 'https://api.example.test/api' });
  manager.registerContract('logger', { address, functions: { log: { parameters: {} } } });
  manager.setUser({ address, nonce: '5', playerName: 'test' });
  await assert.rejects(manager.execute('logger', 'toString'), /Función no disponible/);
  await assert.rejects(manager.execute('logger', 'log'), /rejected/);
  assert.equal(manager.userNonce, '5');
  assert.throws(() => manager.registerContract('bad', { address: 'not-an-address' }));
});

test('TransactionSystem serializes automatic nonces and rejects invalid payloads', async () => {
  const env = context();
  const System = load('SystemaTransaccion.js', env, 'TransactionSystem');
  const system = new System({ serverclient: 'https://api.example.test/api' });
  system.isAuthenticated = true; system.accessToken = 'offline-test'; system.userNonce = '1';
  system.allowedContracts[address] = { functions: ['logMessage'] };
  const used = [];
  system.executeTransaction = async tx => { used.push(tx.userNonce); await Promise.resolve(); return { success: true, newNonce: String(Number(tx.userNonce) + 1) }; };
  const payload = { contract: address, function: 'logMessage', message: 'hello' };
  await Promise.all([system.send(payload), system.send(payload)]);
  assert.deepEqual(used, ['1', '2']);
  assert.equal(system.validatePayload(null).valid, false);
  assert.equal(system.validatePayload({ contract: '__proto__', function: 'x' }).valid, false);
  system.destroy();
  await assert.rejects(system.send(payload), /cerrado/);
});

function walletFixture(extra) {
  const env = context(extra);
  load('gf-wallet-sdk/gf-wallet.js', env);
  const api = env.window.GFWallet;
  const wallet = api.create({ apiBase: 'https://api.example.test', autoLockMs: 100 });
  return { ...env, api, wallet };
}
test('Wallet validates transport endpoints, hex and exact recovery code length', () => {
  const { api } = walletFixture();
  assert.throws(() => api.create({ apiBase: 'http://insecure.example.test' }), /HTTPS/);
  assert.throws(() => api._internals.hexToBytes('zz'), /hexadecimal/);
  const code = api._internals.encodeRecoveryCode(new Uint8Array(20));
  assert.equal(api._internals.decodeRecoveryCode(code).length, 20);
  assert.throws(() => api._internals.decodeRecoveryCode(code + 'A'));
});
test('Wallet provider supports prototype-like event names, preserves listeners on init and validates accounts', async () => {
  const { wallet } = walletFixture({ fetch: async () => response({ providers: {} }) });
  const provider = wallet.getProvider();
  let count = 0;
  provider.on('__proto__', () => count++);
  provider._emit('__proto__');
  assert.equal(count, 1);
  await wallet.init();
  assert.equal(wallet.getProvider(), provider);
  wallet._address = address;
  await assert.rejects(provider.request({ method: 'personal_sign', params: ['hello', '0x' + '2'.repeat(40)] }), /cuenta/);
  provider.removeAllListeners(); provider._emit('__proto__');
  assert.equal(count, 1);
});
test('Wallet OAuth ignores matching origin/state from any window except its popup', async () => {
  let verified = 0;
  const env = walletFixture({ fetch: async url => {
    if (url.endsWith('/start')) return response({ state: 'test-state', nonce: 'test-nonce' });
    if (url.endsWith('/verify')) { verified++; return response({ exists: true, ticket: 'offline-ticket', walletId: 'test-id' }); }
    throw new Error('Unexpected offline request: ' + url);
  } });
  const popup = { closed: false, close() { this.closed = true; } };
  env.window.open = () => popup;
  env.wallet._remoteCfg = { providers: { google: { enabled: true, clientId: 'offline' } } };
  env.wallet._abrirBoveda = async () => ({ address });
  const login = env.wallet.loginWith('google');
  await flush();
  const handler = env.listeners.get('message');
  assert.equal(typeof handler, 'function');
  const data = { __gfWallet: 'oauth-result', state: 'test-state', idToken: 'fake-offline-token' };
  handler({ origin: env.window.location.origin, source: {}, data });
  await flush(); assert.equal(verified, 0);
  handler({ origin: env.window.location.origin, source: popup, data });
  assert.equal((await login).address, address);
  assert.equal(verified, 1);
  assert.equal(env.listeners.has('message'), false);
  assert.equal(env.timers.jobs.size, 0);
});
test('Wallet clears previous key material and autolock timer on lock', async () => {
  const { wallet, timers } = walletFixture();
  const before = new Uint8Array(32).fill(1), after = new Uint8Array(32).fill(2);
  wallet._aplicarClave(before, { address });
  wallet._aplicarClave(after, { address });
  assert.ok(before.every(b => b === 0));
  await wallet.lock();
  assert.ok(after.every(b => b === 0));
  assert.equal(timers.jobs.size, 0);
});
test('Wallet closes IndexedDB connections when creating a transaction throws or aborts', async () => {
  for (const mode of ['throw', 'abort']) {
    let closed = 0;
    const db = { close() { closed++; }, transaction() {
      if (mode === 'throw') throw new Error('offline transaction failed');
      const tx = { objectStore: () => ({ get: () => ({}) }), error: null };
      queueMicrotask(() => tx.onabort()); return tx;
    } };
    const indexedDB = { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request; } };
    const { wallet } = walletFixture({ indexedDB });
    await assert.rejects(wallet.unlock());
    assert.equal(closed, 1);
  }
});

test('Relay cleanup aborts pending requests, destroys providers and cannot restart refresh', async () => {
  const env = context({ fetch: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }) });
  const Relay = load('phaser-relay-library.js', env, 'window.PhaserRelay');
  const relay = new Relay({ apiBase: 'https://api.example.test', useNotificationHub: false });
  let destroyed = 0;
  relay.readProvider = { destroy() { destroyed++; } };
  relay.contractsCache.set(address, {});
  relay.cleanup(); relay.cleanup();
  await flush();
  relay.auth = { authenticated: true, address }; relay.startAutoRefresh();
  assert.equal(destroyed, 1);
  assert.equal(relay.contractsCache.size, 0);
  assert.equal(env.timers.jobs.size, 0);
  await assert.rejects(relay._apiRequest('/api/auth/me'), /cleaned up/);
  assert.throws(() => new Relay({ apiBase: 'javascript:alert(1)' }), /HTTPS/);
});
test('Relay timeout stays active until the response body finishes', async () => {
  const env = context({ fetch: async (_url, options) => ({ ok: true, status: 200,
    text: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })) }) });
  const Relay = load('phaser-relay-library.js', env, 'window.PhaserRelay');
  const relay = new Relay({ apiBase: 'https://api.example.test', useNotificationHub: false, timeout: 20 });
  const pending = relay._apiRequest('/slow');
  await flush(); env.timers.tick(20);
  await assert.rejects(pending, error => error.code === 'REQUEST_TIMEOUT');
  relay.cleanup(); await flush();
  assert.equal(env.timers.jobs.size, 0);
});
