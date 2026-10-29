'use strict';
// Offline regressions: no real backend requests, signatures or funds.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data), json: async () => data });
const address = '0x' + '1'.repeat(40), secondAddress = '0x' + '2'.repeat(40);

class Element extends EventEmitter {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.value = ''; this.id = ''; this.className = ''; this.attributes = new Map(); this.classes = new Set();
    this.classList = { add: (...v) => v.forEach(k => this.classes.add(k)), remove: (...v) => v.forEach(k => this.classes.delete(k)), contains: k => this.classes.has(k), toggle: (k, on) => on ? this.classes.add(k) : this.classes.delete(k) };
  }
  addEventListener(k, fn, opts) { opts?.once ? this.once(k, fn) : this.on(k, fn); }
  removeEventListener(k, fn) { this.off(k, fn); }
  dispatchEvent(e) { this.emit(e.type, e); }
  appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
  removeChild(el) { this.children = this.children.filter(x => x !== el); el.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  contains(el) { return this === el || this.children.some(x => x.contains(el)); }
  get isConnected() { return !!this.root || !!this.parentNode?.isConnected; }
  setAttribute(k, v) { this.attributes.set(k, v); }
  getAttribute(k) { return this.attributes.get(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  getBoundingClientRect() { return { left: 10, top: 20, bottom: 40, width: 100, height: 30 }; }
  set textContent(v) { this._text = String(v); this.children.forEach(x => x.parentNode = null); this.children = []; }
  get textContent() { return this._text || ''; }
  set innerHTML(v) {
    this.textContent = '';
    for (const match of v.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) { const el = new Element(match[1]); el.id = match[2]; this.appendChild(el); }
  }
  get innerHTML() { return this.textContent; }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  querySelectorAll(s) { return this.children.flatMap(el => [...((s[0] === '#' ? el.id === s.slice(1) : s[0] === '.' && el.className.split(' ').includes(s.slice(1))) ? [el] : []), ...el.querySelectorAll(s)]); }
}
function fixture(files = [], extra = {}) {
  let now = 100000, id = 0; const timers = new Map(), calls = [], storage = new Map();
  const document = new Element(); document.cookie = ''; document.readyState = 'complete'; document.visibilityState = 'visible';
  document.body = new Element('body'); document.head = new Element('head'); document.body.root = document.head.root = true;
  document.getElementById = k => document.body.querySelector('#' + k) || document.head.querySelector('#' + k);
  document.querySelectorAll = s => document.body.querySelectorAll(s); document.querySelector = s => document.querySelectorAll(s)[0] || null; document.createElement = t => new Element(t);
  const add = k => { const el = new Element(); el.id = k; document.body.appendChild(el); return el; };
  const clock = { setTimeout(fn, ms = 0) { const k = ++id; timers.set(k, { fn, ms, at: now + ms }); return k; }, clearTimeout: k => timers.delete(k),
    setInterval(fn, ms) { const k = ++id; timers.set(k, { fn, ms, at: now + ms, repeat: true }); return k; }, clearInterval: k => timers.delete(k) };
  const window = new Element(); window.document = document; window.location = { hostname: 'game.grasslandforest.com', href: 'https://game.grasslandforest.com/index.html', search: '', hash: '' };
  const context = vm.createContext({ window, document, location: window.location, URL, URLSearchParams, Headers, Request, AbortController,
    crypto: require('node:crypto').webcrypto, console: { log() {}, warn() {}, error() {} }, navigator: {}, Event,
    Date: class extends Date { static now() { return now; } }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    fetch: async (url, opts = {}) => { calls.push({ url, opts }); return json({}); }, ...clock,
    requestAnimationFrame: fn => clock.setTimeout(fn, 16), cancelAnimationFrame: k => timers.delete(k), ...extra });
  window.fetch = (...args) => context.fetch(...args);
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  for (const file of files) load(file);
  return { context, window, document, timers, calls, storage, add, load,
    tick(ms) { const end = now + ms; for (let count = 0; count < 10000; count++) { const next = [...timers].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; const [k, j] = next; now = j.at; j.repeat ? j.at += j.ms : timers.delete(k); j.fn(); } now = end; } };
}
function relayFixture() {
  const f = fixture(['phaser-relay-library.js']); const relay = new f.window.PhaserRelay({ apiBase: 'https://api.test', useNotificationHub: false, maxRetries: 0 });
  return { ...f, relay, Relay: f.window.PhaserRelay };
}

test('pathfinding releases both lifecycle listeners over 100 scene restarts and supports prototype-like cache names', () => {
  const f = fixture(['gf-rutas.js']), scene = { events: new EventEmitter() };
  for (let i = 0; i < 100; i++) {
    f.window.GFRutas.siguiente(scene, { x: 20, y: 20 }, { x: 100, y: 100 }, { libre: () => true, clave: '__proto__' });
    assert.equal(scene.events.listenerCount('destroy'), 1);
    scene.events.emit(i % 2 ? 'shutdown' : 'destroy');
    assert.equal(scene.events.listenerCount('destroy') + scene.events.listenerCount('shutdown'), 0);
    assert.equal(scene.__gfRutas, null);
  }
});
test('a slow invite claim keeps its retry interval alive, does not overlap, and retries a network failure', async () => {
  const f = fixture(); f.storage.set('gf_ref', 'ABCD2345'); const requests = [];
  f.window.game = { scene: { getScenes: () => [{ playerName: 'Alice', player: {} }] } };
  f.window.GFMascota = { api() { const p = deferred(); requests.push(p); return p.promise; } };
  f.load('gf-invitaciones.js'); f.tick(4000); assert.equal(requests.length, 1);
  f.tick(8000); assert.equal(requests.length, 1); requests[0].reject(new Error('network')); await flush();
  f.tick(4000); assert.equal(requests.length, 2);
  requests[1].resolve({ ok: true, datos: { ok: true } }); await flush(); assert.equal(f.storage.has('gf_ref'), false);
});
test('TxGate abort removes all wait timers and listeners without cancelling the actual transaction', async () => {
  const f = fixture(['tx-gate.js']), gate = f.window.GFTxGate, end = gate.begin('purchase'), ctl = new AbortController();
  const p = gate.whenIdle({ signal: ctl.signal, timeout: 50000, onTick() {} });
  assert.equal(f.timers.size, 3); ctl.abort(); const result = await p;
  assert.equal(result.cancelled, true); assert.equal(result.idle, false); assert.equal(gate.pending(), 1); assert.equal(f.timers.size, 1);
  end(); assert.equal(f.timers.size, 0);
  const aborted = await gate.whenIdle({ signal: ctl.signal }); assert.equal(aborted.cancelled, true);
});
test('single-session fetch handles URL and Request inputs and never sends its identifier to third-party APIs', async () => {
  const f = fixture(['gf-sesion-unica.js']), socket = new EventEmitter(); f.window.GFSesionUnica._enganchar(socket); socket.emit('sesion:aceptada', { cabecera: true });
  await f.window.fetch(new URL('https://api.grasslandforest.com/api/data'));
  await f.window.fetch(new Request('https://api.grasslandforest.com/api/data', { headers: { 'X-Original': 'yes' } }));
  await f.window.fetch('https://third-party.test/api/data');
  assert.equal(f.calls[0].opts.headers.get('X-GF-Sesion'), f.window.GFSesionUnica.id());
  assert.equal(f.calls[1].opts.headers.get('X-Original'), 'yes'); assert.equal(f.calls[2].opts.headers, undefined);
});
test('session renewal respects an aborted Request signal and the explicit API base', async () => {
  const f = fixture(); let refreshes = 0; const ctl = new AbortController();
  f.window.GF_API_BASE = 'https://custom.test'; f.window.PhaserRelay = { refreshSession(base) { assert.equal(base, 'https://custom.test'); refreshes++; return Promise.resolve(json({ csrfToken: 'rotated' })); } };
  f.context.fetch = async () => { ctl.abort(); return json({}, 401); }; f.load('gf-session-api.js');
  await f.window.fetch(new Request('https://custom.test/api/data', { signal: ctl.signal })); assert.equal(refreshes, 0);
  f.window.game = { scene: { getScenes: () => [{ player: {}, address }] } }; await f.window.GFSessionAPI.tick(); assert.equal(refreshes, 1);
  f.window.GFSessionAPI.destroy(); await f.window.GFSessionAPI.tick(); assert.equal(refreshes, 1); assert.equal(f.timers.size, 0);
});
test('destroying an uninitialized TransactionHub preserves the existing hub and cannot recreate its DOM later', () => {
  const f = fixture(['TransactionHub.js']), existing = f.add('transaction-hub'), style = f.add('transaction-hub-styles'), Hub = f.window.TransactionHub;
  const hub = new Hub(); hub.destroy(); hub.initialize(); assert.equal(existing.isConnected, true); assert.equal(style.isConnected, true); assert.equal(hub.isInitialized, false);
});
test('relay converts multidimensional ABI arrays and tuple arrays without flattening them', () => {
  const f = relayFixture(); const r = f.relay;
  assert.deepEqual(JSON.parse(JSON.stringify(r._convertParameter([[1, 2], [3, 4]], 'uint256[2][]'))), [['1', '2'], ['3', '4']]);
  const input = { type: 'tuple[]', components: [{ name: 'count', type: 'uint256' }, { name: 'enabled', type: 'bool' }] };
  assert.deepEqual(JSON.parse(JSON.stringify(r._convertParameter([{ count: 3n, enabled: 'false' }], input.type, input))), [['3', false]]);
  assert.throws(() => r._convertParameter([1], 'uint256[2]'), /length/); r.cleanup();
});
test('relay normalizes all elements and nested bigint values in a single array output', () => {
  const f = relayFixture(), r = f.relay;
  const result = r._normalizeResult([1n, 2n, 3n], { outputs: [{ name: 'ids', type: 'uint256[]' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ids: ['1', '2', '3'] });
  const tuple = r._normalizeResult([[1n, true], [2n, false]], { outputs: [{ type: 'tuple[]' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(tuple)), { out0: [['1', true], ['2', false]] }); r.cleanup();
});
test('authentication and malformed ABI errors never mean an invoice is absent; a definite revert does', async () => {
  const f = relayFixture(), r = f.relay;
  for (const error of [Object.assign(new Error('Forbidden'), { status: 403 }), new Error('ABI unavailable'), new Error('Invalid JSON response')]) {
    r.accion = async () => { throw error; }; await assert.rejects(r.leerFactura(address, 1), e => e === error);
    await assert.rejects(r.leerFacturaPorManualId(address, 'unique'), e => e === error);
  }
  r.accion = async () => { throw Object.assign(new Error('execution reverted: Invoice does not exist'), { code: 'CALL_EXCEPTION' }); };
  assert.equal(await r.leerFactura(address, 1), null); r.cleanup();
});
test('inventory cache is scoped to the authenticated owner and cleared on relay cleanup', async () => {
  const f = relayFixture(), r = f.relay; await r.initialize(); let current = address, reads = 0;
  r.checkAuth = async () => { r.auth = { authenticated: true, address: current }; return { success: true, address: current }; };
  r._funcionDeInventario = async () => 'getUserInventorySnapshot';
  r._apiRequest = async () => { reads++; return { success: true, result: [[String(reads), 'm', current, 'seed', '1', true]] }; };
  const a = await r.misFacturas(address); const a2 = await r.misFacturas(address); assert.equal(reads, 1); assert.equal(a2, a);
  current = secondAddress; const b = await r.misFacturas(address); assert.equal(reads, 2); assert.equal(b[0].owner, secondAddress);
  r.cleanup(); assert.equal(r._facturasCache, null);
});
test('an ambiguous decrease never falls back to a second delete transaction', async () => {
  const f = relayFixture(), r = f.relay;
  r.checkAuth = async () => ({ success: true, address }); r.leerFactura = async () => ({ id: 1, owner: address, tipo: 'seed', cantidad: 1, activa: true });
  const sent = []; r.sendTransaction = async (_contract, fn) => { sent.push(fn); return { success: false, uncertain: true, error: 'Request timeout after 75000ms' }; };
  const result = await r.quitarDeFactura(address, { idx: 1, tipo: 'seed', cantidad: 1 }); assert.equal(result.ok, false); assert.deepEqual(sent, ['decreaseInvoiceQuantity']); r.cleanup();
});
test('relay cleanup immediately releases polling delays even with a long interval', async () => {
  const f = relayFixture(), r = f.relay; await r.initialize(); r.getTransactionStatus = async () => ({ status: 'pending' });
  const p = r.waitForTransaction('id', { interval: 60000, timeout: 120000 }); await flush(); assert.equal(f.timers.size, 1);
  r.cleanup(); await assert.rejects(p, /cleaned up/); assert.equal(f.timers.size, 0);
});
test('returning from an island waits for persistence and saves only once before loading', async () => {
  const f = fixture(['gf-lands.js']), saved = deferred(), started = []; let saves = 0;
  const scene = { _dejarPartidaEnElMapa() { saves++; return saved.promise; }, savegg() { saves++; }, scene: { start(...args) { started.push(args); } }, sys: { settings: { key: 'LandsScene' } } };
  f.window.GFLands.volver(scene); assert.equal(started.length, 0); assert.equal(saves, 1); saved.resolve(); await flush();
  assert.equal(started.length, 1); assert.equal(started[0][0], 'LoadingScenegame'); assert.equal(saves, 1);
});
test('a late private key reveal cannot repopulate the dashboard after a tab switch', async () => {
  const f = fixture(), reveal = deferred(); const body = f.add('gfw-wallet-body'), tab = f.add('wallet-tab'), other = f.add('general-tab');
  tab.setAttribute('data-cat', 'wallet'); other.setAttribute('data-cat', 'general');
  const section = f.add('gfw-cat-wallet'); f.add('gfw-cat-general');
  f.document.querySelectorAll = s => s === '.hub-cat_101' ? [tab, other] : [];
  f.window.gfWallet = { getAddress: () => address, getBalance: async () => ({ formatted: '1', symbol: 'TEST', chainName: 'Test', chainId: 1 }), getActivity: async () => ({ txs: [] }), exportPrivateKey: () => reveal.promise };
  f.load('gf-wallet-dashboard.js'); tab.emit('click', {}); await flush();
  const secret = f.document.getElementById('gfw-w-pk-secret'), output = f.document.getElementById('gfw-w-pk-out'), button = f.document.getElementById('gfw-w-showpk');
  secret.value = 'offline'; button.onclick.call(button); other.emit('click', {}); reveal.resolve({ privateKey: 'SECRET-TEST' }); await flush();
  assert.equal(output.textContent, ''); assert.equal(output.style.display, 'none'); assert.equal(secret.value, ''); assert.equal(section.style.display, 'none');
  assert.ok(body.isConnected);
});

test('notification destruction cancels the delayed settings button and releases named instances', () => {
  const f = fixture(['NotificationHub.js']), Hub = f.window.NotificationHub;
  const hub = Hub.getInstance('test', { autoCleanup: false }); hub._ensureSettingsButton(); assert.equal(f.timers.size, 1);
  const panel = f.add('owned-settings-panel'); hub._settingsPanel = panel;
  hub.destroy(); assert.equal(f.timers.size, 0); assert.equal(panel.isConnected, false); assert.equal(Hub.instances.size, 0);
  f.add('round-buttons-container'); f.tick(2000); assert.equal(f.document.getElementById('gf-notif-btn'), null);
  const fresh = Hub.getInstance('test', { autoCleanup: false }); assert.notEqual(fresh, hub); fresh.destroy();
});
test('remote character cancellation settles its promise, removes all listeners and permits a fresh load', async () => {
  const f = fixture(); f.window.requestIdleCallback = () => {}; f.load('gf-soulbound.js');
  const create = () => { const keys = new Set(), loader = new EventEmitter(); loader.image = k => keys.add(k); loader.start = () => {};
    return { scene: { events: new EventEmitter(), load: loader, textures: { exists: () => false }, anims: { exists: () => false, create() {} } }, keys }; };
  for (let i = 0; i < 25; i++) {
    const { scene, keys } = create(); const p = f.window.GFSoulbound.asegurarPersonaje(scene, '__proto__'); assert.equal(typeof p.then, 'function'); assert.equal(keys.size, 28);
    scene.events.emit(i % 2 ? 'shutdown' : 'destroy'); assert.equal(await p, false);
    assert.equal(scene.load.listenerCount('complete'), 0); assert.equal(scene.events.listenerCount('shutdown') + scene.events.listenerCount('destroy'), 0); assert.equal(f.timers.size, 0);
  }
  const { scene } = create(), p = f.window.GFSoulbound.asegurarPersonaje(scene, 'personaje3'); f.tick(20000); assert.equal(await p, false); assert.equal(f.timers.size, 0);
});
function missionFixture() {
  const f = fixture(['missionspanel.js']); for (const id of ['missions-panel', 'missions-overlay', 'missions-npc-title', 'missions-reset-time', 'missions-progress', 'missions-list', 'close-missions', 'refresh-missions']) f.add(id);
  const Scene = { currentNpcMission: 'farmer', scene: { isPaused: () => false }, loadDailyMissions: async () => true };
  const Panel = vm.runInContext('missionspanel', f.context); const panel = new Panel(Scene); return { ...f, panel, Scene };
}
test('closing a mission panel prevents a slow show from reopening it; refresh network rejection is handled', async () => {
  const f = missionFixture(), pending = deferred(); f.Scene.loadDailyMissions = () => pending.promise;
  f.panel.panel.classList.add('hidden'); const show = f.panel.show('farmer'); f.panel.close(); pending.resolve(true); await show; assert.equal(f.panel.panel.classList.contains('hidden'), true);
  f.Scene.currentNpcMission = 'farmer'; f.Scene.loadDailyMissions = async () => { throw new Error('offline'); }; await f.panel.refreshMissions(); assert.equal(f.panel.refreshButton.disabled, false); f.panel.destroy();
});
test('a requirement check completed after scene destruction cannot submit a mission', async () => {
  const f = missionFixture(), pending = deferred(); let submitted = 0;
  f.Scene.checkMissionRequirements = () => pending.promise; f.Scene.completeMission = async () => { submitted++; };
  const card = f.panel.createMissionElement({ mission: { missionId: 'one', itemId: 'seed' }, completada: false, tiene: 1, pedido: 1, lista: true }, 'en-US', false);
  card.querySelector('.complete-button').emit('click', {}); f.panel.destroy(); pending.resolve(true); await flush(); assert.equal(submitted, 0);
});
test('chat reaction controls from a previous scene use the current scene and do not reattach a closed palette listener', () => {
  const f = fixture(['gf-chat-social.js']); f.window.requestIdleCallback = () => {}; f.window.innerWidth = 1000; f.window.innerHeight = 600;
  const first = new EventEmitter(), second = new EventEmitter(); first.connected = second.connected = true;
  const a = { events: new EventEmitter(), _socketVivo: () => first }, b = { events: new EventEmitter(), _socketVivo: () => second };
  let old = 0, current = 0; first.on('chatReact', () => old++); second.on('chatReact', () => current++);
  f.window.GFChatSocial.montar(a); const line = f.add('one-line'), text = new Element(); text.textContent = 'Message'; line.appendChild(text);
  f.window.GFChatSocial.decorar(a, { mid: 'm1' }, line, null, text); a.events.emit('shutdown'); f.window.GFChatSocial.montar(b);
  line.querySelector('.gfcs-bot').emit('click', { stopPropagation() {} }); f.document.getElementById('gfcs-paleta').children[0].emit('click', { stopPropagation() {} });
  f.tick(0); assert.equal(old, 0); assert.equal(current, 1); assert.equal(f.document.listenerCount('pointerdown'), 0);
});
test('relay polling bounds invalid attempts and delay values instead of polling forever', async () => {
  const f = relayFixture(), r = f.relay; let reads = 0, delays = [];
  r.readView = async () => { reads++; return 1; }; r._delay = async ms => { delays.push(ms); };
  const result = await r.verifyByPolling({ contractAddress: address, attempts: Infinity, delayMs: Infinity });
  assert.equal(result.verified, false); assert.equal(reads, 9); assert.deepEqual(delays, Array(8).fill(3000)); r.cleanup();
});
test('reporter load ignores an older query and keeps the timeout active through the response body', async () => {
  const f = fixture(), requests = [];
  for (const id of ['btnRelaySearch','qRelay','btnRelayClear', 'btnConnect', 'btnRefresh', 'btnWipe', 'btnSearch', 'q', 'fType', 'prevE', 'nextE', 'prevR', 'nextR', 'gateMsg', 'gate', 'panel', 'whoAddr', 'whoDot', 'rowsErrors', 'mUnique', 'mOccur', 'mTypes', 'mShown', 'emptyErrors', 'pageE', 'toast']) f.add(id);
  f.document.getElementById('fType').options = [{}]; f.context.fetch = (url, opts) => { const d = deferred(); requests.push({ ...d, url, opts }); return d.promise; };
  f.load('reporter.js'); requests[0].resolve(json({ address })); await flush(); assert.equal(requests.length, 2);
  f.document.getElementById('btnRefresh').emit('click'); assert.equal(requests.length, 3);
  requests[2].resolve(json({ total: 2, items: [], tipos: [] })); await flush(); requests[1].resolve(json({ total: 9, items: [], tipos: [] })); await flush();
  assert.equal(f.document.getElementById('mUnique').textContent, '2');
  f.document.getElementById('btnRefresh').emit('click'); const body = deferred(); requests[3].resolve({ ok: true, status: 200, json: () => body.promise }); await flush();
  f.tick(15000); assert.equal(requests[3].opts.signal.aborted, true); body.resolve({ total: 7, items: [], tipos: [] }); await flush(); assert.equal(f.document.getElementById('mUnique').textContent, '2');
  f.window.emit('pagehide', { persisted: false }); assert.equal(f.timers.size, 0);
});
test('an island return whose save fails keeps the scene playable and restores its world and position', async () => {
  for (const rejected of [false, true]) {
    const f = fixture(['gf-lands.js']), messages = []; let started = 0;
    const scene = { mundo: 4, posicionplayerx: 100, posicionplayery: 200, _cambiandoEscena: false, _salaDestino: null,
      notifications: { show: m => messages.push(m) }, scene: { start() { started++; } },
      _dejarPartidaEnElMapa(x, y) { this.mundo = 1; this.posicionplayerx = x; this.posicionplayery = y; return rejected ? Promise.reject(new Error('offline')) : Promise.resolve(false); } };
    f.window.GFLands.volver(scene); await flush();
    assert.equal(started, 0); assert.equal(scene.mundo, 4); assert.equal(scene.posicionplayerx, 100); assert.equal(scene.posicionplayery, 200);
    assert.equal(scene._cambiandoEscena, false); assert.equal(scene._salaDestino, null); assert.equal(messages.length, 1);
  }
});
test('the shop retry helper preserves one idempotency key through an ambiguous submission failure', async () => {
  const f = fixture(['phaser-relay-library.js']), source = fs.readFileSync(path.join(root, 'tienda_sistema.js'), 'utf8');
  f.context.sleep = ms => new Promise(resolve => f.context.setTimeout(resolve, ms));
  // Execute the real nested helper with a simulated transport; no copied implementation.
  const begin = source.indexOf('  async function _sendAndWaitWithRetries('), end = source.indexOf('\n  // Parser robusto', begin);
  assert.ok(begin >= 0 && end > begin); vm.runInContext(source.slice(begin, end), f.context);
  const retry = vm.runInContext('_sendAndWaitWithRetries', f.context), calls = [];
  const relay = { accion: async (_address, action) => { calls.push(action); return calls.length === 1 ? { success: false, uncertain: true, error: 'timeout' } : { success: true, transactionId: 'existing' }; },
    waitForTransaction: async id => { assert.equal(id, 'existing'); return { success: true, txHash: 'test' }; } };
  const p = retry(relay, address, { funcion: 'increaseInvoiceQuantity', _id: 1, _increaseAmount: 2 }); await flush(); f.tick(800); await flush();
  assert.equal((await p).success, true); assert.equal(calls.length, 2); assert.match(calls[0]._metadata.idem, /^[A-Za-z0-9_-]{8,80}$/);
  assert.equal(calls[0]._metadata.idem, calls[1]._metadata.idem);
});
test('loading rejects invalid progress and uses a finite duration when given Infinity', async () => {
  const f = fixture(['LoadingSystem.js']), loading = new f.window.LoadingSystem();
  loading.show({ initialProgress: NaN }); assert.equal(loading.currentProgress, 0); assert.equal(loading.update(Infinity), false);
  const p = loading.showTimed(Infinity); f.tick(4000); await p; assert.equal(f.timers.size, 0); loading.destroy();
});
