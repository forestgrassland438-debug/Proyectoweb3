'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Emitter = require('eventemitter3');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

class Element extends Emitter {
  constructor() {
    super(); this.dataset = {}; this.style = {}; this.textContent = ''; this.innerHTML = '';
    const classes = new Set();
    this.classList = { add: k => classes.add(k), remove: k => classes.delete(k), contains: k => classes.has(k) };
  }
  addEventListener(type, fn) { this.on(type, fn); }
  removeEventListener(type, fn) { this.off(type, fn); }
}
function fixture() {
  const nodes = new Map(), timers = new Map(), requests = [];
  let timerId = 0;
  const document = new Element();
  document.getElementById = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  document.querySelector = document.getElementById;
  const window = new Element();
  window.playerStats = { vida: 30, agua: 40, comida: 50 };
  const context = vm.createContext({ window, document, AbortController, console: { log() {}, warn() {}, error() {} },
    Phaser: { Scene: class {} },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
    fetch(url, options) { const d = deferred(); requests.push({ ...d, url, options }); return d.promise; }
  });
  for (const name of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Scenes', name + '.js'), 'utf8'), context);
  }
  const socket = new Emitter(); socket.connected = true;
  function scene(name = 'GameScene') {
    const sc = Object.create(window[name].prototype);
    Object.assign(sc, { events: new Emitter(), input: { keyboard: { enabled: true } }, socket,
      _sceneRunId: 1, _sceneStopped: false, playerName: 'test', isAuthenticated: true,
      vidaPorcentaje: 30, aguaPorcentaje: 40, comidaPorcentaje: 50,
      _refreshBarrasUI() { this.refreshes = (this.refreshes || 0) + 1; }
    });
    return sc;
  }
  return { nodes, document, window, timers, requests, socket, scene };
}
const ranking = number => ({ ok: true, json: async () => ({ season: { number, msRemaining: 1000 }, rows: [], minBattlesForRanking: 5, me: null }) });

test('battle hub buttons belong to the current scene and release DOM/socket listeners over twenty transitions', () => {
  const f = fixture(); let foreignEvents = 0;
  const foreign = () => foreignEvents++;
  f.socket.on('battle:daily', foreign);
  for (let i = 0; i < 20; i++) {
    const sc = f.scene(i % 2 ? 'MinaScene' : 'GameScene'); let starts = 0;
    sc.startPvpBattle = mode => { assert.equal(mode, 'bot'); starts++; };
    sc.openBattleHub(); sc.openBattleHub();
    assert.equal(f.socket.listenerCount('battle:daily'), 2);
    f.socket.emit('battle:daily', { remaining: 3, max: 5, nextRound: 3 });
    const adventure = f.document.getElementById('battleHubAdventureBtn');
    assert.equal(adventure.listenerCount('click'), 1);
    adventure.emit('click'); assert.equal(starts, 1);
    assert.equal(f.socket.listenerCount('battle:daily'), 1);
    sc.openBattleHub(); sc._sceneStopped = true; sc.events.emit('shutdown');
    assert.equal(f.socket.listenerCount('battle:daily'), 1);
    assert.equal(f.document.getElementById('battleHubOverlay').classList.contains('hidden'), true);
    for (const node of f.nodes.values()) assert.equal(node.eventNames().length, 0);
    assert.equal(sc.events.eventNames().length, 0);
  }
  assert.equal(foreignEvents, 20);
});

test('leaderboard refresh aborts the previous read and late responses cannot overwrite new or closed panels', async () => {
  const f = fixture(), sc = f.scene(), pending = [];
  sc.fetchWithTokenRetry = (url, options) => { const d = deferred(); pending.push({ ...d, options }); return d.promise; };
  const old = sc.openBattleLeaderboard();
  const latest = sc.openBattleLeaderboard();
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(ranking(2)); await latest;
  const meta = f.document.getElementById('battleRankSeason');
  assert.match(meta.textContent, /Season 2/);
  pending[0].resolve(ranking(1)); await old;
  assert.match(meta.textContent, /Season 2/);
  const closed = sc.openBattleLeaderboard(); sc.closeBattleLeaderboard();
  assert.equal(pending[2].options.signal.aborted, true);
  meta.textContent = 'other scene'; pending[2].resolve(ranking(3)); await closed;
  assert.equal(meta.textContent, 'other scene');
  const leaving = sc.openBattleLeaderboard(); sc.events.emit('shutdown');
  assert.equal(pending[3].options.signal.aborted, true);
  meta.textContent = 'battle'; pending[3].resolve(ranking(4)); await leaving;
  assert.equal(meta.textContent, 'battle');
  assert.equal(sc._battleRankRequest, null);
  for (const node of f.nodes.values()) assert.equal(node.eventNames().length, 0);
});

test('vital refresh requests do not overlap and a departing scene cannot write stats after entering battle', async () => {
  for (const name of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene']) {
    const f = fixture(), sc = f.scene(name);
    sc._iniciarRegeneracionVitales(); sc._iniciarRegeneracionVitales();
    assert.equal(f.timers.size, 1, name);
    const tick = [...f.timers.values()][0], pending = tick(); await tick();
    assert.equal(f.requests.length, 1, name);
    sc._sceneStopped = true; sc.events.emit('shutdown');
    assert.equal(f.requests[0].options.signal.aborted, true, name);
    f.requests[0].resolve({ ok: true, json: async () => ({ stats: { vida: 100, agua: 100, comida: 100 } }) });
    await pending;
    assert.equal(f.window.playerStats.vida, 30, name);
    assert.equal(sc.refreshes, undefined, name);
    assert.equal(f.timers.size, 0, name);
    assert.equal(sc.events.eventNames().length, 0, name);
  }
});

test('a restarted scene accepts current vital stats and rejects JSON still pending from its previous visit', async () => {
  const f = fixture(), sc = f.scene(), body = deferred();
  sc._iniciarRegeneracionVitales();
  const oldTick = [...f.timers.values()][0]();
  f.requests[0].resolve({ ok: true, json: () => body.promise }); await Promise.resolve();
  sc.events.emit('shutdown'); sc._sceneRunId++;
  sc._iniciarRegeneracionVitales();
  const newTick = [...f.timers.values()][0]();
  f.requests[1].resolve({ ok: true, json: async () => ({ stats: { vida: 45, agua: 55, comida: 65 } }) });
  await newTick;
  body.resolve({ stats: { vida: 100, agua: 100, comida: 100 } }); await oldTick;
  assert.equal(sc.vidaPorcentaje, 45); assert.equal(f.window.playerStats.vida, 45);
  assert.equal(sc.refreshes, 1); sc.events.emit('shutdown');
});

test('shop notification controls rebind after cleanup without retaining a previous shop', () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) {
    const sc = f.scene('tiendajuego'); let hits = 0;
    sc._closeNotifPanel = sc._markAllNotifRead = sc._clearAllNotif = () => hits++;
    sc._wireNotificationPanel(); sc._wireNotificationPanel();
    for (const id of ['notif-close', 'notif-mark-all-read', 'notif-clear-all']) {
      const node = f.document.getElementById(id);
      assert.equal(node.listenerCount('click'), 1); node.emit('click');
    }
    assert.equal(hits, 3); sc._offDOM();
    for (const node of f.nodes.values()) assert.equal(node.eventNames().length, 0);
  }
});
