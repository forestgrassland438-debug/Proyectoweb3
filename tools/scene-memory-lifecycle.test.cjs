'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Emitter = require('eventemitter3');
const BIN = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

class Element extends Emitter {
  constructor() {
    super(); this.style = { removeProperty() {}, setProperty() {} }; this.dataset = {};
    this.value = ''; this.textContent = ''; this.children = [];
    const classes = new Set();
    this.classList = { add: k => classes.add(k), remove: k => classes.delete(k), contains: k => classes.has(k),
      toggle(k, on = !classes.has(k)) { if (on) classes.add(k); else classes.delete(k); } };
  }
  addEventListener(name, fn) { this.on(name, fn); }
  removeEventListener(name, fn) { this.off(name, fn); }
  setAttribute() {}
  focus() { this.emit('focus'); }
  blur() { this.emit('blur'); }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  contains(child) { return child === this || this.children.some(c => c.contains(child)); }
  closest() { return this; }
}
function fixture() {
  const nodes = new Map(), document = new Element(), window = new Element();
  document.getElementById = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  document.querySelector = key => document.getElementById(key);
  document.createElement = () => new Element();
  document.body = new Element();
  const timers = new Map(); let next = 0;
  const ctx = { window, document, console: { log() {}, warn() {}, error() {}, info() {} },
    Phaser: { Scene: class {}, Math: { Clamp: (x,a,b) => Math.min(b,Math.max(a,x)) } },
    setTimeout(fn) { const id = ++next; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn) { const id = ++next; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
    localStorage: { getItem() { return null; }, setItem() {} }, AbortController,
    NotificationHub: class { destroy() { this.destroyed = true; } }
  };
  window.game = { events: new Emitter(), scene: { getScenes: () => [] } };
  vm.createContext(ctx);
  for (const name of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene']) {
    vm.runInContext(fs.readFileSync(path.join(BIN, 'Scenes', name + '.js'), 'utf8'), ctx);
  }
  function scene(name = 'GameScene') {
    const sc = Object.create(window[name].prototype);
    Object.assign(sc, { events: new Emitter(), game: window.game, _sceneRunId: 1, _sceneStopped: false,
      time: { delayedCall() {}, removeAllEvents() {} }, textures: { exists: () => false },
      _seguirTecladoMovil() {}, _sendChatFromInput() { this.sent = (this.sent || 0) + 1; },
      _aplicarSesion() { return false; } });
    return sc;
  }
  return { ctx, window, document, nodes, timers, scene };
}

test('DOM groups, properties and paired teardown listeners stay bounded across twenty restarts', () => {
  const f = fixture(), sc = f.scene(), target = new Element(); let clicks = 0, released = 0;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 3; j++) {
      const bind = sc._domGroup('panel');
      bind(target, 'click', () => clicks++);
      sc._setDOMProperty(target, 'onclick', () => {}, 'panel');
    }
    sc._onceSceneEnd(() => released++);
    assert.equal(target.listenerCount('click'), 1);
    target.emit('click'); sc.events.emit('shutdown');
    assert.equal(target.listenerCount('click'), 0);
    assert.equal(target.onclick, null);
    assert.equal(sc.events.eventNames().length, 0);
  }
  assert.equal(clicks, 20); assert.equal(released, 20);
});

test('late cleanup from a previous HUD owner does not remove the current click handler', () => {
  const f = fixture(), first = f.scene(), second = f.scene(), button = new Element(); let clicks = 0;
  for (let i = 0; i < 30; i++) first._bindDomClick(button, 'test', () => assert.fail('stale click'));
  assert.equal(first._domClickBindings.length, 1);
  second._bindDomClick(button, 'test', () => clicks++);
  first._unbindAllDomClicks(); button.emit('click'); assert.equal(clicks, 1);
  second._unbindAllDomClicks(); assert.equal(button.listenerCount('click'), 0);
});

test('chat, send button and emoji grid bind to each new scene and detach on exit', () => {
  const f = fixture();
  const evt = target => ({ target, key: 'Enter', preventDefault() {}, stopPropagation() {} });
  for (let i = 0; i < 20; i++) {
    const sc = f.scene(i % 2 ? 'tiendajuego' : 'GameScene');
    sc._insertarEmojiEnChat = () => { sc.emojis = (sc.emojis || 0) + 1; };
    sc._setupChatDom(); sc._setupChatDom();
    const input = f.document.getElementById('chat-input'), send = f.document.getElementById('chat-send-btn');
    input.emit('keydown', evt(input)); send.emit('pointerdown', evt(send)); assert.equal(sc.sent, 2);
    const panel = f.document.getElementById('chat-emoji-picker');
    panel.emit('pointerdown', evt(panel.children[1].children[0])); assert.equal(sc.emojis, 1);
    if (sc._offDOM) sc._offDOM(); else { sc.events.emit('shutdown'); sc._unbindAllDomClicks(); }
    for (const node of f.nodes.values()) assert.equal(node.eventNames().length, 0);
    assert.equal(f.document.eventNames().length, 0);
  }
});

test('the sound panel may reopen repeatedly without retaining input or Escape handlers', () => {
  const f = fixture(), sc = f.scene();
  sc.soundHubElements = Object.fromEntries(['panel','closeBtn','musicSlider','musicTestBtn','musicMuteBtn','sfxSlider','sfxTestBtn','sfxMuteBtn','musicChangeBtn','saveBtn'].map(k => [k,new Element()]));
  for (let i = 0; i < 20; i++) sc.setupSoundHubEvents();
  assert.equal(f.document.listenerCount('keydown'), 1);
  assert.equal(sc.soundHubElements.musicSlider.listenerCount('input'), 1);
  sc.events.emit('shutdown');
  assert.equal(f.document.eventNames().length, 0);
  for (const node of Object.values(sc.soundHubElements)) assert.equal(node.eventNames().length, 0);
});

test('completed, stopped and failed SFX are destroyed while another scene retains its sound', async () => {
  const f = fixture(), sc = f.scene(), sounds = new Set();
  sc.audioState = { activeSFX: new Set(), sfxVolumeApplied: .7, musicVolumeApplied: .7 };
  sc.cache = { audio: { exists: () => true } }; let fail = false;
  sc.sound = { add() { const sound = new Emitter(); sounds.add(sound);
    sound.play = () => !fail; sound.stop = () => sound.emit('stop');
    sound.destroy = () => {
      assert.equal(sound.destroying, undefined, 'Phaser STOP during destroy must not reenter destruction');
      sound.destroying = true; sound.emit('stop');
      sounds.delete(sound); sound.emit('destroy'); sound.removeAllListeners();
    };
    return sound; } };
  const foreign = sc.sound.add();
  for (let i = 0; i < 30; i++) { const s = sc.playSFX('click'); s.emit(i % 2 ? 'complete' : 'stop'); await Promise.resolve(); }
  assert.equal(sounds.size, 1); assert.equal(sc.audioState.activeSFX.size, 0);
  fail = true; assert.equal(sc.playSFX('click'), null); assert.equal(sounds.size, 1);
  fail = false; sc.playSFX('loop', { loop: true }); sc._disposeSceneAudio();
  await Promise.resolve();
  assert.equal(sounds.size, 1); assert.ok(sounds.has(foreign));
});

test('leaving GameScene, shop, mine or lands during create cannot revive that entry', async () => {
  const f = fixture();
  for (const name of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene']) {
    const sc = f.scene(name), pending = deferred(); let cleanups = 0;
    sc.loadx = () => pending.promise;
    sc.cleanupScene = () => { sc._sceneStopped = true; cleanups++; };
    sc.liberarMemoriaPesada = () => {};
    sc._lavaCapas = []; sc._burbujas = [];
    if (name === 'MinaScene') sc._construirMina = () => pending.promise;
    if (name === 'tiendajuego') {
      sc.clearOtherPlayers = () => {}; sc.removeSocketListeners = () => {};
      sc.stopMusicSafely = () => {}; sc._cleanupTutorial = () => {}; sc._cancelarArrastre = () => {};
    }
    const creating = sc.create(); sc.events.emit('shutdown'); pending.resolve(true); await creating;
    assert.equal(sc._sceneStopped, true, name);
    if (name !== 'tiendajuego') assert.equal(cleanups, 1, name);
    else assert.equal(sc.notifications, null);
  }
});

test('late authentication and inventory responses do not mount stale systems or overwrite a restarted scene', async () => {
  const f = fixture(), sc = f.scene(), response = deferred();
  sc.getCSRFToken = async () => true; sc.fetchWithTokenRetry = () => response.promise;
  sc.startAutoRefresh = () => assert.fail('stale auth restarted a timer');
  const auth = sc.loadx(); await Promise.resolve(); sc._sceneRunId++;
  response.resolve({ ok: true, json: async () => ({ authenticated: true, address: '0x123456789012' }) }); await auth;
  assert.equal(sc.isAuthenticated, undefined);
  const inventory = deferred(); sc.isAuthenticated = true; sc.playerName = 'test';
  sc.fetchWithTokenRetry = () => inventory.promise; sc.STATE = { slots: ['preserve'] };
  const loading = sc.loadPlayerData(); sc._sceneStopped = true;
  inventory.resolve({ ok: true, json: async () => ({ inventory: [] }) }); await loading;
  assert.deepEqual(sc.STATE.slots, ['preserve']);
});

test('session refresh has one timer across scene instances and releases it with the game', () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) {
    const sc = f.scene(); Object.assign(sc, { autoRefreshEnabled: true, isAuthenticated: true, serverBase: '/api' });
    sc.startAutoRefresh();
  }
  assert.equal(f.timers.size, 1);
  assert.equal(f.window.game.events.listenerCount('destroy'), 1);
  const service = f.window.__gfAuthRefreshService;
  assert.equal(service.scene, undefined); assert.equal(service.game, undefined);
  f.window.game.events.emit('destroy'); assert.equal(f.timers.size, 0);
  assert.equal(f.window.__gfAuthRefreshService, null);
});

test('map shutdown drops tile data, pending labels and collision indices even when one resource throws', () => {
  const f = fixture(), sc = f.scene(); let maps = 0, labels = 0, managers = 0;
  sc.map = { destroy() { maps++; } }; sc.backgroundLayer = {};
  sc.chunkObjectsMap = new Map([['chunk', {}]]);
  sc.collisionRectangles = [{ large: [] }]; sc.collisionRectangles3 = [{}];
  sc.pendingLabels = new Map([['bad', { destroy() { throw Error('already gone'); } }], ['good', { destroy() { labels++; } }]]);
  sc._tileManagers = [{ destroy() { throw Error('broken'); } }, { destroy() { managers++; } }];
  sc.cleanupTexturesAndMaps(); sc.cleanupTexturesAndMaps();
  assert.equal(maps, 1); assert.equal(labels, 1); assert.equal(managers, 1);
  assert.equal(sc.map, null); assert.equal(sc.backgroundLayer, null);
  assert.equal(sc.chunkObjectsMap.size, 0); assert.equal(sc.pendingLabels.size, 0);
  assert.equal(sc.collisionRectangles.length, 0); assert.equal(sc.collisionRectangles3.length, 0);
});
