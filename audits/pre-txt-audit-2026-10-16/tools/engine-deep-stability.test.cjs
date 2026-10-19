'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {}, table() {} };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function sandbox(extra = {}) {
  let next = 0;
  const timers = new Map(), frames = new Map();
  const c = {
    console: quiet, Promise, Map, Set, WeakMap, WeakSet, Number, AbortController,
    setTimeout(fn) { const id = ++next; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { const id = ++next; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ...extra,
    timers, frames
  };
  c.window = c;
  vm.createContext(c);
  return c;
}
function load(c, file) { vm.runInContext(readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file }); }
function sueloFixture(extra = {}) {
  const managers = [], json = new Map();
  class TileManager {
    constructor() { this.destroyed = 0; managers.push(this); }
    init() {}
    updateVisible() {}
    bombear() {}
    visibleCount() { return 1; }
    destroy() { this.destroyed++; }
  }
  const scene = {
    events: new EventEmitter(), load: Object.assign(new EventEmitter(), { json() {}, start() {} }),
    cache: { json: { exists: key => json.has(key), remove: key => json.delete(key), get: key => json.get(key) } },
    game: { device: { features: {} } }, cameras: { main: {} },
    time: { addEvent(opts) { const event = { ...opts, removed: false, remove() { this.removed = true; } }; scene.poll = event; return event; } },
    ...extra
  };
  const c = sandbox({ GrasslandForest: { TileManager } });
  load(c, 'gf-suelo.js');
  return { c, scene, managers, json, complete() { json.set('gfsuelo_land', { tiles: [] }); scene.load.emit('filecomplete-json-gfsuelo_land'); } };
}

test('painted ground cancels every owned loader callback across thirty abandoned mounts', () => {
  const f = sueloFixture();
  const foreign = () => {};
  f.scene.load.on('loaderror', foreign);
  for (let i = 0; i < 30; i++) {
    f.c.GFSuelo.montar(f.scene, { carpeta: 'land' });
    f.scene.load.emit('loaderror', { key: 'unrelated' });
    assert.equal(f.scene.load.listenerCount('loaderror'), 2);
    f.c.GFSuelo.desmontar(f.scene);
    assert.equal(f.scene.load.listenerCount('filecomplete-json-gfsuelo_land'), 0);
    assert.equal(f.scene.load.listenerCount('loaderror'), 1);
    assert.equal(f.scene.events.eventNames().length, 0);
  }
  f.complete();
  assert.equal(f.managers.length, 0);
});

test('ground restores only layers it hid and rolls back a failed scene clock allocation', () => {
  const f = sueloFixture();
  const visible = { visible: true, setVisible(v) { this.visible = v; } };
  const hidden = { visible: false, setVisible(v) { this.visible = v; } };
  f.c.GFSuelo.montar(f.scene, { carpeta: 'land', capas: [visible, hidden] });
  f.complete();
  f.scene.poll.callback();
  assert.equal(visible.visible, false);
  f.c.GFSuelo.desmontar(f.scene);
  assert.equal(visible.visible, true);
  assert.equal(hidden.visible, false);
  assert.equal(f.managers[0].destroyed, 1);
  assert.equal(f.scene._tileManagers.length, 0);
  assert.equal(f.scene.events.listenerCount('update'), 0);
  f.scene.time.addEvent = () => { throw new Error('clock unavailable'); };
  f.c.GFSuelo.montar(f.scene, { carpeta: 'land' });
  f.complete();
  assert.equal(f.managers[1].destroyed, 1);
  assert.equal(f.scene.__gfSuelo, null);
  assert.equal(f.scene._tileManagers.length, 0);
  assert.equal(f.scene.events.eventNames().length, 0);
});

test('tileset extrusion frees a failed canvas, rejects invalid sizes and preserves a replacement', () => {
  const c = sandbox(); load(c, 'gf-suelo.js');
  const textures = new Map([['tiles', { getSourceImage: () => ({ width: 16, height: 16 }) }]]);
  let created = 0, draws = 0;
  const scene = { textures: {
    exists: key => textures.has(key), get: key => textures.get(key), remove: key => textures.delete(key),
    createCanvas(key) {
      created++;
      const texture = { getContext: () => ({ drawImage() { draws++; } }), refresh() {}, setFilter() {} };
      textures.set(key, texture);
      return texture;
    }
  } };
  for (const t of [0, -1, NaN, Infinity, 0.1]) assert.equal(c.GFSuelo.extruir(scene, 'tiles', t), null);
  assert.equal(created, 0);
  assert.equal(c.GFSuelo.extruir(scene, 'tiles', 16), 'tiles_x');
  assert.equal(draws, 9, 'center, four edges and four corners are all extruded');
  textures.delete('tiles_x');
  const original = scene.textures.createCanvas;
  scene.textures.createCanvas = key => { const texture = original(key); texture.refresh = () => { throw new Error('upload failed'); }; return texture; };
  assert.equal(c.GFSuelo.extruir(scene, 'tiles', 16), null);
  assert.equal(textures.has('tiles_x'), false);
  const replacement = {};
  scene.textures.createCanvas = key => { const texture = original(key); texture.refresh = () => { textures.set(key, replacement); throw new Error('owner replaced'); }; return texture; };
  assert.equal(c.GFSuelo.extruir(scene, 'tiles', 16), null);
  assert.equal(textures.get('tiles_x'), replacement);
});

function tironesFixture() {
  let now = 0;
  const textures = Object.assign(new EventEmitter(), { getTextureKeys: () => [] });
  const scene = { textures, children: { list: [] } };
  const requests = [];
  const nativeFetch = () => { const d = deferred(); requests.push(d); return d.promise; };
  const c = sandbox({ performance: { now: () => now }, game: { scene: { getScenes: () => [scene] } }, fetch: nativeFetch });
  load(c, 'gf-tirones.js');
  return { c, scene, textures, requests, nativeFetch, frame() {
    now += 50;
    const [id, fn] = c.frames.entries().next().value;
    c.frames.delete(id); fn();
  } };
}

test('frame diagnostics release texture hooks and keep wrappers installed by another owner usable', async () => {
  const f = tironesFixture();
  const foreign = () => {};
  f.textures.on('addtexture', foreign);
  f.c.GFTirones.empezar();
  const captured = f.c.fetch;
  const outside = (...args) => captured(...args);
  f.c.fetch = outside;
  const first = f.c.fetch('/first');
  f.c.GFTirones.parar();
  assert.equal(f.c.fetch, outside);
  assert.equal(f.textures.listenerCount('addtexture'), 1);
  const afterStop = f.c.fetch('/after-stop');
  f.requests[0].resolve({ ok: true }); f.requests[1].resolve({ ok: true });
  await Promise.all([first, afterStop]);
  f.c.GFTirones.empezar();
  assert.equal(f.textures.listenerCount('addtexture'), 2);
  const other = Object.assign(new EventEmitter(), { getTextureKeys: () => [] });
  f.scene.textures = other; f.frame();
  assert.equal(f.textures.listenerCount('addtexture'), 1);
  assert.equal(other.listenerCount('addtexture'), 1);
  f.c.GFTirones.parar();
  assert.equal(other.listenerCount('addtexture'), 0);
  assert.equal(f.c.frames.size, 0);
});

test('old requests cannot decrement a new diagnostics session and long sessions have bounded reports', async () => {
  const f = tironesFixture();
  f.c.GFTirones.empezar();
  const old = f.c.fetch('/old'); f.c.GFTirones.parar();
  f.c.GFTirones.empezar(); const fresh = f.c.fetch('/fresh');
  f.requests[0].resolve({ ok: true }); await old;
  f.frame();
  assert.match(f.c.GFTirones.datos()[0].causaProbable, /1 petición/);
  f.requests[1].resolve({ ok: true }); await fresh;
  for (let i = 0; i < 2500; i++) f.frame();
  assert.equal(f.c.GFTirones.datos().length, 2000);
  assert.equal(f.c.GFTirones.informe().length, 2000);
  f.c.GFTirones.parar();
});

test('scarecrow teardown releases every island guard ring and scene alias', async () => {
  const c = sandbox(); load(c, 'gf-espantapajaros.js');
  const rings = [];
  const scene = { events: new EventEmitter(), textures: { exists: () => true },
    add: { graphics() {
      const ring = { destroyed: 0, setDepth() { return this; }, setAlpha() { return this; },
        lineStyle() {}, strokeEllipse() {}, fillStyle() {}, fillEllipse() {}, destroy() { this.destroyed++; } };
      rings.push(ring); return ring;
    } }, tweens: { killTweensOf() {} }
  };
  const spr = { active: true };
  c.GFEspantapajaros.guardar(scene, 'guard', spr, { x: 100, y: 100 });
  const state = scene.__gfEspanta;
  await flush();
  scene.events.emit('shutdown');
  assert.equal(rings[0].destroyed, 1);
  assert.equal(state.guardas.size, 0);
  assert.equal(scene.espanta_guard, undefined);
  assert.equal(scene.__gfEspanta, null);
  assert.equal(scene.events.eventNames().length, 0);
});

test('water, torches and scarecrow texture waits settle and release clocks and hooks at every terminal event', async () => {
  for (const [file, api, method, args] of [
    ['gf-agua.js', 'GFAgua', 'cargarImagenes', [[['missing', 'missing.png']]]],
    ['gf-antorchas.js', 'GFAntorchas', 'texturas', []],
    ['gf-espantapajaros.js', 'GFEspantapajaros', 'cargarTexturas', []]
  ]) {
    for (const terminal of ['complete', 'shutdown', 'destroy', 'timeout']) {
      const c = sandbox({ Phaser: { Textures: { FilterMode: { NEAREST: 0 } } } });
      load(c, file);
      let animations = 0;
      const scene = { events: new EventEmitter(),
        textures: { exists: key => key === 'gfa_antorcha_brillo', createCanvas() { throw new Error('unexpected canvas'); } },
        anims: { exists: () => false, create() { animations++; } },
        load: Object.assign(new EventEmitter(), { image() {}, atlas() {}, start() {} })
      };
      const promise = c[api]._interno[method](scene, ...args);
      assert.equal(c.timers.size, 1, file + ' ' + terminal);
      if (terminal === 'timeout') Array.from(c.timers.values())[0]();
      else if (terminal === 'complete') scene.load.emit('complete');
      else scene.events.emit(terminal);
      await promise;
      assert.equal(c.timers.size, 0, file + ' clock');
      assert.equal(scene.load.listenerCount('complete'), 0, file + ' loader');
      assert.equal(scene.events.eventNames().length, 0, file + ' lifecycle');
      assert.equal(animations, 0, file + ' cannot construct missing atlas');
    }
  }
});

test('name colours detach prior sockets and scene clocks and do not revert an acknowledged preference', () => {
  const c = sandbox({ document: { getElementById: () => null } });
  load(c, 'gf-nombre-color.js');
  const a = Object.assign(new EventEmitter(), { connected: true });
  const b = Object.assign(new EventEmitter(), { connected: true });
  const first = { events: new EventEmitter(), socket: a, nameColor: '#ffffff' };
  const second = { events: new EventEmitter(), socket: b, nameColor: null };
  c.GFNombreColor.montar(first);
  assert.equal(c.timers.size, 1);
  a.emit('player:nameColor', { ok: true, color: '#ffd166' });
  assert.equal(c.GFNombreColor.mio(), '#ffd166');
  const [id, next] = c.timers.entries().next().value;
  c.timers.delete(id); next();
  assert.equal(c.GFNombreColor.mio(), '#ffd166');
  c.GFNombreColor.montar(second);
  assert.equal(c.GFNombreColor.mio(), null, 'explicit default from the server resets the old colour');
  assert.equal(a.listenerCount('player:nameColor'), 0);
  assert.equal(a.listenerCount('player:petNameColor'), 0);
  assert.equal(first.events.eventNames().length, 0);
  a.emit('player:nameColor', { ok: true, color: '#ff0000' });
  assert.equal(c.GFNombreColor.mio(), null);
  assert.equal(c.GFNombreColor.poner('#ffd166', true, '__proto__'), false);
  second.events.emit('shutdown');
  assert.equal(c.timers.size, 0);
  assert.equal(b.listenerCount('player:nameColor'), 0);
  assert.equal(second.events.eventNames().length, 0);
});

test('remote fishing releases both lifecycle hooks across thirty visits and cancels delayed fight results', () => {
  const win = new EventEmitter();
  const c = sandbox({ document: {}, addEventListener: win.on.bind(win), removeEventListener: win.off.bind(win) });
  load(c, 'gf-pesca.js');
  const scene = { events: new EventEmitter() };
  for (let i = 0; i < 30; i++) {
    c.GFPesca._interno.bucleRemoto(scene);
    assert.equal(scene.events.listenerCount('destroy'), 1);
    scene.events.emit('shutdown');
    assert.equal(scene.events.eventNames().length, 0);
  }
  const unrelatedPoll = c.timers.size;
  const el = { hidden: false, classList: { add() {} }, removeEventListener() {} };
  const state = { scene: {}, sesion: 'catch', lucha: null };
  const fight = { el, raf: 0, arriba() {}, teclaAbajo() {}, teclaArriba() {}, abajo() {} };
  state.lucha = fight;
  c.GFPesca._interno.finLucha(state, fight, true, 0);
  assert.equal(c.timers.size, unrelatedPoll + 1);
  c.GFPesca._interno.cerrarLucha(state);
  assert.equal(c.timers.size, unrelatedPoll);
  assert.equal(el.hidden, true);
  assert.equal(state.lucha, null);
});

test('crow allocation rollback and teardown tolerate partial creation and a broken destructor', () => {
  process.argv[2] = ROOT;
  const { crearEscena, ctx } = require('./fauna-banco.js');
  load(ctx, 'gf-cuervo.js');
  const scene = crearEscena();
  const exists = scene.textures.exists;
  scene.textures.exists = key => exists(key) || key.startsWith('cuervo_');
  const allocated = [], sprite = scene.add.sprite, ellipse = scene.add.ellipse;
  scene.add.sprite = (...args) => { const item = sprite(...args); allocated.push(item); return item; };
  scene.add.ellipse = (...args) => { const item = ellipse(...args); allocated.push(item); return item; };
  let calls = 0;
  const nativeSprite = scene.add.sprite;
  scene.add.sprite = (...args) => { if (++calls === 2) throw new Error('sprite budget exhausted'); return nativeSprite(...args); };
  assert.equal(ctx.GFCuervo.montar(scene, { cantidad: 3 }), null);
  assert.equal(scene.__gfCuervos, null);
  assert.equal(allocated.filter(o => o.active).length, 0);
  scene.add.sprite = nativeSprite;
  const state = ctx.GFCuervo.montar(scene, { cantidad: Infinity });
  assert.ok(state.cuervos.length <= 32);
  state.cuervos[0].spr.destroy = () => { throw new Error('broken sprite'); };
  ctx.GFCuervo.desmontar(scene);
  assert.equal(scene.__gfCuervos, null);
  assert.equal(state.scene, null);
  assert.equal(allocated.filter(o => o.active).length, 1, 'all remaining objects release despite the failed destructor');
});

test('TileManager preserves replacement textures and rolls back an image rejected after allocation', () => {
  const TileManager = require(path.join(ROOT, 'lib/tileManager.js'));
  const textures = new Map(), images = [];
  const scene = { textures: { exists: key => textures.has(key), get: key => textures.get(key),
      addImage(key, image) { const texture = { image }; textures.set(key, texture); return texture; }, remove: key => textures.delete(key) },
    add: { image() { const image = { destroyed: 0, setOrigin() { throw new Error('origin unavailable'); }, destroy() { this.destroyed++; } }; images.push(image); return image; } }
  };
  const meta = { tileSize: 16, width: 16, height: 16, lods: [{ name: 'hd' }], tiles: [
    { row: 0, col: 0, x: 0, y: 0, width: 16, height: 16, lods: { hd: { filename: 'tile.png' } } }
  ] };
  const manager = new TileManager(scene, meta, { usarImageBitmap: false, maxConcurrentLoads: Infinity, creaPorFrame: Infinity });
  manager.init();
  const key = manager.tileKey(0, 0), owned = {};
  textures.set(key, owned); manager._recordOwnedTexture(key);
  const replacement = {}; textures.set(key, replacement);
  manager._liberarTextura(key);
  assert.equal(textures.get(key), replacement);
  textures.delete(key);
  const bitmap = { closed: 0, close() { this.closed++; } };
  const item = { key, row: 0, col: 0, x: 0, y: 0, w: 16, h: 16, _generation: 0, _bitmap: bitmap };
  manager.loading.add(key); manager._createTileSprite(item);
  assert.equal(images[0].destroyed, 1);
  assert.equal(bitmap.closed, 1);
  assert.equal(textures.has(key), false);
  assert.equal(manager._ownedBitmaps.size, 0);
  assert.equal(manager.maxLoads, 3);
  assert.equal(manager.creaPorFrame, 1);
  manager.updateVisible({ worldView: { x: 0, y: 0, width: Infinity, height: 16 } });
  assert.equal(manager.loadQueue.length, 0);
  assert.equal(manager.setMarginPx(Infinity), false);
  manager.destroy();
  assert.equal(manager.scene, null);
  assert.equal(manager.meta, null);
  assert.equal(manager.tilesRaw.length, 0);
  assert.throws(() => new TileManager(scene, { ...meta, width: Infinity }), /Invalid tile dimensions/);
});

test('memory reporter observes resources weakly, bounds metadata and preserves native constructor constants', () => {
  const refs = [];
  class TestWeakRef { constructor(value) { this.value = value; refs.push(this); } deref() { return this.value; } }
  class Canvas { constructor() { this.width = 16; this.height = 8; this.requests = []; } getContext(type) { this.requests.push(type); return {}; } }
  class Offscreen extends Canvas {}
  class Image extends EventTarget { constructor() { super(); this.src = ''; this.width = 16; this.height = 8; } }
  class Socket extends EventTarget { static OPEN = 1; static CONNECTING = 0; send() {} close() {} }
  const untouched = new Canvas();
  const doc = { images: [], getElementsByTagName: name => name === 'canvas' ? [untouched] : [], querySelectorAll: () => [] };
  const c = sandbox({ WeakRef: TestWeakRef, HTMLCanvasElement: Canvas, OffscreenCanvas: Offscreen,
    Image, WebSocket: Socket, document: doc, performance: { now: () => 0 }, TextEncoder, Blob });
  c.console = { ...quiet, info() {}, group() {}, groupEnd() {}, groupCollapsed() {} };
  load(c, 'phaser-memory-reporter.js');
  const reporter = c.PhaserMemoryReporterV3, state = reporter.getInstrumentationState();
  assert.deepEqual(untouched.requests, [], 'inspection cannot choose an unrelated canvas context');
  const canvas = new Canvas(); canvas.getContext('2d');
  const offscreen = new Offscreen(); offscreen.getContext('2d'); offscreen.getContext('2d');
  const image = new c.Image(); image.src = 'data:image/png;base64,' + 'a'.repeat(10000); image.dispatchEvent(new Event('load'));
  const buffer = { length: 10, sampleRate: 10, duration: 1, numberOfChannels: 1 };
  reporter.registerAudioBuffer(buffer);
  const game = { events: new EventEmitter(), sound: { sounds: [{ key: 'shared', buffer }, { key: 'same', buffer }] } };
  c.game = game;
  const snapshot = reporter.snapshot();
  assert.equal(snapshot.canvases.offscreenBytes, 16 * 8 * 4, 'repeated getContext does not add allocations');
  assert.equal(snapshot.phaserAudio.totalBytes, 40, 'shared buffers are counted once');
  assert.ok(Array.from(state.imageList.values())[0].src.length <= 512);
  assert.equal(c.WebSocket.OPEN, 1);
  const socket = new c.WebSocket('ws://test');
  assert.equal(state.wsSockets.size, 1);
  socket.dispatchEvent(new Event('close'));
  assert.equal(state.wsSockets.size, 0, 'remote close removes an inactive socket');
  for (let i = 0; i < 200; i++) { reporter.note('note'); reporter.snapshot(); }
  assert.ok(state.manualNotes.length <= 100);
  assert.ok(state.dataUriImages.length <= 100);
  for (const ref of refs) ref.value = undefined;
  c.game = null;
  const released = reporter.snapshot();
  assert.equal(state.canvases.size, 0);
  assert.equal(state.imageList.size, 0);
  assert.equal(state.audioBufferList.length, 0);
  assert.equal(released.canvases.offscreenBytes, 0);
  reporter.attach(game, { logToConsole: false });
  assert.equal(game.events.listenerCount('destroy'), 1);
  game.events.emit('destroy');
  assert.equal(reporter._game, null);
  assert.equal(reporter._intervalId, null);
  assert.equal(game.events.listenerCount('destroy'), 0);
});

test('reporter without WeakRef omits native liveness without holding canvases strongly', () => {
  class Canvas { constructor() { this.width = this.height = 10; } getContext() { return {}; } }
  const c = sandbox({ WeakRef: undefined, HTMLCanvasElement: Canvas, document: { images: [], getElementsByTagName: () => [] }, performance: {} });
  c.console = { ...quiet, info() {} };
  load(c, 'phaser-memory-reporter.js');
  const canvas = new Canvas(); canvas.getContext('2d');
  assert.equal(c.PhaserMemoryReporterV3.getInstrumentationState().canvases.size, 0);
  assert.ok(c.PhaserMemoryReporterV3.snapshot().notes.some(note => /WeakRef unavailable/.test(note)));
});

test('arena engine rejects inherited selectors, invalid maps and numeric inputs without hanging physics or routing', () => {
  const M = require(path.join(ROOT, 'gf-brawl-motor.js'));
  for (const dims of [{ ancho: 0, alto: 2 }, { ancho: -1, alto: 2 }, { ancho: Infinity, alto: 2 }, { ancho: 1000000, alto: 1000000 }, { ancho: 2, alto: 2, celda: Infinity }]) {
    assert.throws(() => M.crearRejilla(dims), /inválid/);
  }
  assert.throws(() => M.crearPartida({ arena: '__proto__', luchadores: [{ humano: true }] }), /arena desconocida/);
  let now = 100000;
  const P = M.crearPartida({ arena: 'pradera', ahora: () => now, azar: () => 0.5,
    luchadores: [{ humano: true, especie: '__proto__', maxHp: Infinity, ataque: Infinity }, { humano: true, especie: 'constructor', nivel: Infinity }] });
  for (const fighter of P.luchadores) {
    assert.equal(fighter.especie, 'perro');
    assert.ok([fighter.maxHp, fighter.ataque, fighter.nivel, fighter.vel].every(Number.isFinite));
  }
  assert.equal(M.celdaEn(P.R, NaN, 1), '#');
  assert.equal(M.buscarRuta(P.R, 100, 100, NaN, 100), null);
  assert.equal(M.lineaDeTiro(P.R, 100, 100, Infinity, 100), false);
  assert.ok(M.moverCirculo(P.R, 100, 100, 1e308, 1e308, M.REGLAS.RADIO).every(Number.isFinite));
  assert.ok(M.moverCirculo(P.R, 100, 100, Infinity, 0, M.REGLAS.RADIO).every(Number.isFinite));
  assert.equal(M.avanzarBala(P.R, { x: 100, y: 100, dx: 1, dy: 0, resto: 100 }, Infinity).fin, true);
  now = Infinity; M.paso(P); assert.equal(P.fase, 'cuenta');
});

test('alchemist ignores stale catalogues and purchase replies belonging to a departed scene', async () => {
  const requests = [];
  const fields = {};
  const panel = { classList: { add() {}, remove() {} }, querySelector(selector) { return fields[selector] || (fields[selector] = {}); } };
  const c = sandbox({ document: { getElementById: id => id === 'gf-alq' ? panel : null },
    GFMascota: { api(route) { const d = deferred(); requests.push({ route, ...d }); return d.promise; } } });
  load(c, 'gf-alquimista.js');
  const first = { events: new EventEmitter(), add: {} }, second = { events: new EventEmitter(), add: {}, moneda_plata: 10 };
  c.GFAlquimista.montar(first);
  const old = c.GFAlquimista.refrescar(), fresh = c.GFAlquimista.refrescar();
  const catalogue = { ok: true, silver: 30, pet: { health: 100, maxHealth: 100 }, items: [] };
  requests[1].resolve({ ok: true, datos: catalogue }); await fresh;
  requests[0].resolve({ ok: true, datos: { ...catalogue, silver: 1 } }); await old;
  assert.equal(c.GFAlquimista._interno.catalogo().silver, 30);
  const buy = c.GFAlquimista.comprar('pocion_vida');
  first.events.emit('shutdown'); c.GFAlquimista.montar(second);
  requests[2].resolve({ ok: true, datos: { ok: true, stats: { plata: 999 } } });
  assert.equal(await buy, null);
  assert.equal(second.moneda_plata, 10);
  assert.equal(c.GFAlquimista._interno.catalogo(), null);
  second.events.emit('shutdown');
  assert.equal(second.events.eventNames().length, 0);
});

test('death effects release the camera owned by each scene and ignore an old synchronization reply', async () => {
  const responses = [];
  const c = sandbox({ document: { getElementById: () => null, createElement() { throw new Error('old reply tried to paint'); } },
    GFMascota: { estado: () => ({ ghost: false }), alCambiar: () => () => {}, sincronizar() { const d = deferred(); responses.push(d); return d.promise; } } });
  load(c, 'gf-muerte.js');
  function scene() {
    const removed = [];
    return { events: new EventEmitter(), add: {}, vidaPorcentaje: 100, removed,
      cameras: { main: { postFX: { addColorMatrix: () => ({ grayscale() {} }), remove: matrix => removed.push(matrix) } } } };
  }
  const first = scene(), second = scene();
  c.GFMuerte.montar(first); c.GFMuerte._interno.grisear(first, true);
  const firstMatrix = first.__gfMuerte.matriz;
  c.GFMuerte.montar(second); c.GFMuerte._interno.grisear(second, true);
  const secondMatrix = second.__gfMuerte.matriz;
  first.events.emit('shutdown');
  assert.equal(first.removed[0], firstMatrix);
  assert.equal(second.__gfMuerte.matriz, secondMatrix);
  responses[0].resolve(); await flush();
  assert.equal(second.removed.length, 0);
  second.events.emit('shutdown');
  assert.equal(second.removed[0], secondMatrix);
  assert.equal(c.timers.size, 0);
});

test('pet observer dispatch survives self-unsubscription and invalid damage cannot poison the shared state', () => {
  const c = sandbox({ document: { getElementById: () => null }, location: { hostname: 'localhost' } });
  load(c, 'gf-mascota.js');
  const calls = [];
  let leave;
  leave = c.GFMascota.alCambiar(() => { calls.push('first'); leave(); });
  c.GFMascota.alCambiar(() => calls.push('second'));
  c.GFMascota._interno.aplicar({ pet: { health: 60, maxHealth: 100, alive: true } });
  assert.deepEqual(calls, ['first', 'second']);
  for (const damage of [Infinity, NaN, -1]) c.GFMascota.golpear(damage);
  assert.equal(c.GFMascota.vida(), 60);
  assert.equal(c.GFMascota._interno.pendiente(), 0);
  assert.equal(c.timers.size, 0);
});

test('specter shutdown clears all resources and registration even when the first destructor throws', async () => {
  const c = sandbox(); load(c, 'gf-mina-espectros.js');
  const scene = { events: new EventEmitter(), _lucesExtras: [] };
  c.GFMinaEspectros.montar(scene); await flush();
  const st = scene.__gfEspectros;
  const destroyed = [];
  const item = name => ({ destroy() { destroyed.push(name); } });
  st.mobs.push({ sprite: { destroy() { throw new Error('broken ghost'); } }, shadow: item('shadow'), bar: item('bar') });
  st.shots.push({ sprite: item('shot') }); st.warnings.push(item('warning'));
  st.light = () => {}; scene._lucesExtras.push(st.light);
  scene.events.emit('shutdown');
  assert.deepEqual(destroyed, ['shadow', 'bar', 'shot', 'warning']);
  assert.equal(scene.__gfEspectros, null);
  assert.equal(st.scene, null);
  assert.equal(scene._lucesExtras.length, 0);
  assert.equal(scene.events.eventNames().length, 0);
});

test('wind teardown releases every later allocation when one leaf destructor fails', () => {
  const c = sandbox(); load(c, 'gf-viento.js');
  const destroyed = [];
  const item = name => ({ destroy() { destroyed.push(name); } });
  const scene = { events: new EventEmitter() };
  const st = { scene, arboles: [], hojas: [{ spr: { destroy() { throw new Error('broken leaf'); } } }, { spr: item('leaf') }],
    rafagas: [{ spr: item('gust') }], capa: item('container') };
  scene.__gfViento = st;
  c.GFViento.desmontar(scene);
  assert.deepEqual(destroyed, ['leaf', 'gust', 'container']);
  assert.equal(scene.__gfViento, null);
  assert.equal(st.scene, null);
});

test('graphics quality rejects inherited names before changing settings or starting persistence', () => {
  const c = sandbox({ document: { readyState: 'loading', addEventListener() {} } });
  load(c, 'gf-graphics-settings.js');
  const original = c.GFGraphics.get();
  for (const name of ['__proto__', 'constructor', 'toString']) c.GFGraphics.setCalidad(name);
  assert.equal(c.GFGraphics.get().calidad, original.calidad);
  assert.equal(c.timers.size, 0);
});
