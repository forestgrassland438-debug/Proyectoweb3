'use strict';
// Offline behavioral regressions. No server, RPC, signing or real inventory.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ROOT = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {} };
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function manager(fetch) {
  let token = '{"accessToken":"offline"}';
  const c = vm.createContext({ window: {}, console: quiet, AbortController, setTimeout, clearTimeout, fetch,
    sessionStorage: { getItem: () => token } });
  vm.runInContext(read('BlockchainManager.js'), c);
  const m = new c.window.BlockchainManager({ events: new EventEmitter(), serverclient: 'https://offline.test/api' });
  m.registerContract('log', { address: '0x' + '1'.repeat(40), functions: { write: { parameters: {} } } });
  m.setUser({ address: '0x' + '2'.repeat(40), nonce: '0x1f', playerName: 'Offline' });
  return { m, setToken(v) { token = v; } };
}
const response = (value, ok = true) => ({ ok, text: async () => JSON.stringify(value) });

test('TXT 32: corrupt or null token storage cannot consume a nonce', async () => {
  const { m, setToken } = manager(() => assert.fail('no network allowed'));
  for (const invalid of ['{', 'null', '[]', '{}']) {
    setToken(invalid);
    await assert.rejects(m.execute('log', 'write'), /Token de acceso/);
    assert.equal(m.userNonce, '1f');
  }
  m.destroy();
});
test('TXT 33: nonce formats normalize and a failed operation cannot corrupt a queued one', async () => {
  const first = deferred(), seen = [];
  const { m } = manager(async (_url, options) => {
    seen.push(JSON.parse(options.body).userNonce);
    return seen.length === 1 ? first.promise : response({ newNonce: '0x20' });
  });
  const failed = m.execute('log', 'write');
  const next = m.execute('log', 'write');
  await flush(); assert.deepEqual(seen, ['20']);
  first.resolve(response({ error: 'rejected' }, false));
  await assert.rejects(failed, /rejected/); await next;
  assert.deepEqual(seen, ['20', '20']); assert.equal(m.userNonce, '20');
  m.setUser({ nonce: 31 }); assert.equal(m.incrementLocalNonce(), '20');
  m.setUser({ nonce: 0 }); assert.equal(m.incrementLocalNonce(), '1');
  m.destroy();
});
test('a queued blockchain operation is rejected after switching account', async () => {
  const first = deferred(); let calls = 0;
  const { m } = manager(async () => { calls++; return first.promise; });
  const a = m.execute('log', 'write'), b = m.execute('log', 'write');
  await flush(); m.setUser({ nonce: 'a', playerName: 'Other' });
  first.resolve(response({ newNonce: '21' })); await a;
  await assert.rejects(b, /sesión cambió/); assert.equal(calls, 1); assert.equal(m.userNonce, 'a'); m.destroy();
});

function craft(scene) {
  const c = vm.createContext({ window: {}, document: { getElementById: () => null }, console: quiet, setTimeout, clearTimeout, clearInterval });
  vm.runInContext(read('CraftingHub.js'), c);
  const h = Object.create(c.window.CraftingSystem.prototype);
  Object.assign(h, { _sceneActual: scene, _domBindings: [], _keysPressed: new Set(), _maxStackSize: 99,
    _nonStackableItems: [], _craftPending: 1, _destroyed: false });
  return h;
}
test('TXT 34: failed or partial chain mint never grants local fallback items', async () => {
  for (const behavior of ['reject', 'partial', 'confirmed']) {
    let amount = 0, local = 0;
    const scene = { ItemDefinitions: { plank: { tipo: 'resource' } },
      contarItemEnInventario: () => amount,
      async ejecutarDivision() { if (behavior === 'reject') throw Error('reverted'); amount += behavior === 'partial' ? 1 : 2; },
      addItemWithCheck() { local++; return true; } };
    const h = craft(scene);
    assert.equal(await h.addPlayerItem('plank', 2), behavior === 'confirmed');
    assert.equal(local, 0);
  }
});
test('TXT 35: destroy releases current and deferred scenes even while craft queue is busy', async () => {
  const scene = { events: new EventEmitter() }, next = { events: new EventEmitter() };
  const h = craft(scene); h.hide = () => {}; let unbound = 0;
  h._unbindScene = () => { unbound++; }; h.setScene(next);
  assert.equal(next.events.listenerCount('shutdown'), 1);
  h.destroy();
  assert.equal(h.scene, null); assert.equal(h._nextScene, null); assert.equal(unbound, 1);
  assert.equal(next.events.eventNames().length, 0);
  assert.equal(await h._craftItemInterno({ recipe: { resources: [] }, quantity: 1 }), false);
});

const M = require('../gf-brawl-motor.js');
function battle() {
  let t = 1000000;
  const P = M.crearPartida({ id: 'offline', modo: 'pvp', arena: 'pradera', ahora: () => t, azar: () => 0.5,
    luchadores: [1, 2].map(n => ({ clave: 'h' + n, humano: true, playerName: 'H' + n, maxHp: 140, ataque: 20 })) });
  P.fase = 'combate';
  const l = P.porId[1]; l.presupuesto = 30; l.ultimaEntrada = t;
  return { P, l, tick(ms = 1000) { t += ms; M.paso(P); } };
}
test('TXT 21: missing, stale and future correction ACKs cannot move a player or suppress correction', () => {
  const { P, l } = battle(); l.correccion = 3;
  const x = l.x;
  for (const [i, c] of [undefined, null, 2, 99999999, '3'].entries()) {
    M.entrada(P, 1, { s: i + 1, x: x + 3, y: l.y, c });
    assert.equal(l.x, x); assert.equal(l.cAck, 0);
  }
  M.entrada(P, 1, { s: 6, x: x + 3, y: l.y, c: 3 });
  assert.equal(l.x, x + 3); assert.equal(l.cAck, 3);
});
test('TXT 22: malicious sequences cannot freeze valid inputs; extreme finite aim is normalized', () => {
  const { P, l } = battle(); const x = l.x;
  for (const s of [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, 0.5, 1201]) M.entrada(P, 1, { s, x: x + 3, y: l.y, c: 0 });
  assert.equal(l.seq, 0);
  M.entrada(P, 1, { s: 1, x: x + 3, y: l.y, c: 0, a: Number.MAX_VALUE });
  assert.equal(l.seq, 1); assert.ok(Math.abs(l.apunta) <= Math.PI);
  assert.equal(M.disparar(P, 1, { a: Number.MAX_VALUE, s: { injected: 'payload' } }), true);
  assert.ok(Math.abs(l.apunta) <= Math.PI);
  assert.ok(P.balas.every(b => Number.isFinite(b.dx) && Number.isFinite(b.dy) && Math.abs(b.ang) < 4));
});

test('TXT 19: shared battle art is released automatically on shutdown and destroy without accumulating listeners', () => {
  const c = vm.createContext({ window: {}, console: quiet }); vm.runInContext(read('gf-batalla-arte.js'), c);
  const A = c.window.GFBatallaArte, live = new Map();
  const noop = () => ({ addColorStop() {} }), clips = [];
  const ctx = new Proxy({ clip(rule) { clips.push(rule); } }, { get: (o, k) => k in o ? o[k] : noop, set: (o, k, v) => (o[k] = v, true) });
  const textures = { exists: k => live.has(k), get: k => live.get(k), remove: k => live.delete(k),
    createCanvas(k) { const t = { getContext: () => ctx, refresh() {} }; live.set(k, t); return t; } };
  const first = { textures, events: new EventEmitter() }, second = { textures, events: new EventEmitter() };
  for (let i = 0; i < 20; i++) {
    A.efectos(first); A.efectos(second); A.arena(first, 'noche', 3); A.arena(second, 'noche', 3);
    assert.equal(first.events.listenerCount('shutdown'), 1);
    first.events.emit('shutdown'); assert.equal(live.size, 17); assert.equal(first.events.eventNames().length, 0);
    second.events.emit('destroy'); assert.equal(live.size, 0); assert.equal(second.events.eventNames().length, 0);
  }
  assert.equal(clips.length, 20, 'TXT 20: crescent uses a canvas mask on each recreated night arena');
  assert.ok(clips.every(rule => rule === 'evenodd'));
});
