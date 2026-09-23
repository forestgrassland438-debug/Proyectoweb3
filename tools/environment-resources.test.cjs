'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function fixture(file) {
  let now = 0, serial = 0;
  const canvases = [], timers = new Map();
  function canvas() {
    const cv = { width: 0, height: 0 };
    const context = new Proxy({
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: () => {
        const data = new Uint8ClampedArray(cv.width * cv.height * 4);
        for (let x = 0; x < cv.width; x++) data[x * 4 + 3] = 255;
        return { data };
      }
    }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
    cv.getContext = () => context;
    canvases.push(cv);
    return cv;
  }
  const context = {
    console: { log() {}, warn() {} }, performance: { now: () => now }, AbortController,
    location: { hostname: 'localhost' }, navigator: {},
    document: { readyState: 'loading', getElementById: () => null, createElement: canvas,
      querySelector: () => null, addEventListener() {}, removeEventListener() {} },
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { timers.set(++serial, fn); return serial; }, clearInterval: id => timers.delete(id),
    addEventListener() {},
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, ahora: 18000, epocaMs: 0, cicloMs: 24000, diaMs: 12000, nocheMs: 12000 }) }),
    Phaser: { BlendModes: { ADD: 1, MULTIPLY: 2 }, Textures: { FilterMode: { LINEAR: 1 } }, WEBGL: 2 },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), context, { filename: file });
  function textures() {
    const map = new Map();
    const tm = {
      map, exists: key => map.has(key), get: key => map.get(key),
      remove(key) { const texture = map.get(key); if (texture && texture.canvas) texture.canvas.width = texture.canvas.height = 0; map.delete(key); },
      addCanvas(key, cv) {
        const texture = { canvas: cv, getSourceImage: () => cv, getContext: () => cv.getContext('2d'), refresh() {}, setFilter() {} };
        map.set(key, texture); return texture;
      },
      createCanvas(key, w, h) { const cv = canvas(); cv.width = w; cv.height = h; return this.addCanvas(key, cv); },
      source(key, w = 32, h = 32) { map.set(key, { getSourceImage: () => ({ width: w, height: h }) }); }
    };
    return tm;
  }
  function scene(tm = textures()) {
    const live = new Set(), children = { list: [] }, events = new EventEmitter();
    const sc = { events, textures: tm, children, time: { now: 0 }, scene: { key: 'test' } };
    function object(x, y, key) {
      const o = { scene: sc, x, y, width: 32, height: 32, displayWidth: 32, displayHeight: 32,
        alpha: 1, visible: true, active: true, texture: { key }, depth: 1, list: [],
        destroy() {
          if (!this.active) return;
          this.active = false; this.scene = null; live.delete(this);
          const at = children.list.indexOf(this); if (at >= 0) children.list.splice(at, 1);
          this.list.slice().forEach(child => child.destroy()); this.list.length = 0;
        },
        setAlpha(value) { this.alpha = value; return this; },
        setVisible(value) { this.visible = value; return this; },
        setPosition(x, y) { this.x = x; this.y = y; return this; },
        setTexture(key) { this.texture = { key }; return this; },
        setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
        setSize(w, h) { this.width = w; this.height = h; return this; },
        add(child) { this.list.push(child); return this; },
        getCenter() { return { x: this.x, y: this.y }; }
      };
      for (const method of ['setOrigin', 'setDepth', 'setScrollFactor', 'setTint', 'setBlendMode', 'setRotation', 'setScale', 'setFlipX', 'setFlipY', 'disableInteractive', 'clear', 'fill', 'erase']) o[method] = function () { return this; };
      live.add(o); children.list.push(o); return o;
    }
    sc.add = { image: object, rectangle: (x, y) => object(x, y, 'rectangle'), container: (x, y) => object(x, y, 'container'), renderTexture: (x, y, w, h) => object(x, y, 'rt').setSize(w, h) };
    sc.make = { image: config => object(0, 0, config.key) };
    const cam = { width: 800, height: 600, zoom: 1, worldView: { x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600 }, shake() {} };
    sc.cameras = { main: cam };
    return { sc, live, cam, object, tick(time, delta = 100) { sc.time.now = time; events.emit('update', time, delta); } };
  }
  return { context, scene, textures, canvases, setNow: value => { now = value; } };
}

test('daybreak releases the night render target and each subsequent night recreates only one', async () => {
  const f = fixture('gf-ciclo-dia.js'), api = f.context.GFCiclo, s = f.scene();
  await api.sincronizar();
  const st = api.montarEscena(s.sc);
  const first = st.rt;
  assert.ok(first);
  assert.equal(s.sc.textures.get('gf_luz_poste').canvas.width, 256);
  for (let cycle = 0; cycle < 20; cycle++) {
    f.setNow(cycle * 24000); s.tick(cycle * 24000);
    assert.ok(st.rt && st.rt.active);
    assert.equal([...s.live].filter(o => o.texture.key === 'rt').length, 1);
    f.setNow(cycle * 24000 + 12000); s.tick(cycle * 24000 + 12000);
    assert.equal(st.rt, null);
    assert.equal([...s.live].filter(o => o.texture.key === 'rt').length, 0);
  }
  assert.equal(first.active, false);
  s.sc.events.emit('shutdown'); assert.equal(s.live.size, 0); api.detener();
});

function addTree(s, key = 'tree') {
  s.sc.textures.source(key);
  s.sc.sprite_arbolx1 = s.object(10, 10, key);
  return s.sc.sprite_arbolx1;
}

test('snow stays allocation-free at strength zero, deduplicates candidates, releases after melting and returns', () => {
  const f = fixture('gf-nieve.js'), api = f.context.GFNieve, s = f.scene();
  addTree(s);
  f.context.GFClima = { estado: () => ({ activo: true, nieve: true, nieveFuerza: 0 }) };
  const st = api.montar(s.sc);
  for (let i = 0; i < 10; i++) api.recalcular(s.sc);
  assert.equal(st.pendientes.length, 1);
  for (let t = 0; t < 1000; t += 100) s.tick(t);
  assert.equal(s.live.size, 1); assert.equal(s.sc.textures.map.size, 1); assert.equal(st.manto, 0);
  for (let cycle = 0; cycle < 5; cycle++) {
    api.forzar(1);
    for (let t = 0; t < 41000; t += 100) s.tick(t);
    assert.equal(st.capas.length, 1); assert.equal(s.sc.textures.map.size, 6);
    api.forzar(0);
    for (let t = 0; t < 91000; t += 100) s.tick(t);
    assert.equal(st.capas.length, 0); assert.equal(st.manchas.length, 0);
    assert.equal(s.sc.textures.map.size, 1); assert.equal(s.live.size, 1);
  }
  api.desmontar(s.sc); assert.equal(st.scene, null); assert.equal(s.sc.events.eventNames().length, 0);
});

test('snow textures are shared until the last scene exits and teardown survives a throwing destructor', () => {
  const f = fixture('gf-nieve.js'), api = f.context.GFNieve, tm = f.textures(), a = f.scene(tm), b = f.scene(tm);
  addTree(a); addTree(b); api.forzar(1);
  const sa = api.montar(a.sc), sb = api.montar(b.sc);
  for (let t = 0; t < 2000; t += 100) { a.tick(t); b.tick(t); }
  const texture = tm.get('gfn_capa_tree'); assert.ok(texture);
  const broken = sa.capas[0].spr, destroy = broken.destroy;
  broken.destroy = function () { destroy.call(this); throw Error('callback failed'); };
  a.sc.events.emit('shutdown'); assert.equal(a.live.size, 1); assert.equal(tm.get('gfn_capa_tree'), texture);
  b.sc.events.emit('shutdown'); assert.equal(b.live.size, 1); assert.equal(tm.map.size, 1);
  assert.equal(sa.scene, null); assert.equal(sb.scene, null);
});

test('snow caps large generated canvases and frees the temporary pixel readback', () => {
  const f = fixture('gf-nieve.js'), api = f.context.GFNieve, s = f.scene();
  addTree(s); s.sc.textures.source('tree', 8192, 4096);
  api.forzar(1); const st = api.montar(s.sc);
  for (let t = 0; t < 1000; t += 100) s.tick(t);
  assert.equal(st.capas.length, 1);
  const cv = s.sc.textures.get('gfn_capa_tree').canvas;
  assert.equal(cv.width, 1024); assert.equal(cv.height, 512);
  assert.ok(f.canvases.some(canvas => canvas.width === 0 && canvas.height === 0));
  for (const delta of [NaN, Infinity, -1]) s.tick(100, delta);
  assert.ok(Number.isFinite(st.manto)); api.desmontar(s.sc);
});

test('weather does not spawn pending lightning or thunder while rain fades after disabling it', () => {
  const f = fixture('gf-clima.js'), api = f.context.GFClima, s = f.scene();
  for (const family of ['gota', 'copo', 'salpica', 'posa', 'fuego', 'humo', 'brasa']) for (let i = 1; i <= 4; i++) s.sc.textures.source('gfc_' + family + '_' + i);
  const st = api.montar(s.sc, { sinRed: true }); assert.ok(st);
  let thunder = 0; f.context.GFAudio = { trueno() { thunder++; } };
  Object.assign(api.estado(), { activo: false, lluvia: true, truenos: true });
  Object.assign(st, { fuerzaLluvia: 1, proximoTrueno: 1, proximaCentella: 1, truenoEn: 1 });
  s.tick(10000);
  assert.equal(st.rayoHasta, 0); assert.equal(st.proximoTrueno, 0); assert.equal(st.proximaCentella, 0); assert.equal(thunder, 0);
  st.bordeHasta = 20000; st.bordeAlfa = 1;
  for (let t = 10100; t < 16000; t += 100) s.tick(t);
  assert.equal(st.fuerzaLluvia, 0); assert.equal(st.cortina.alpha, 0); assert.equal(st.bordeHasta, 0); assert.equal(st.bordeAlfa, 0);
  assert.ok(st.gotas.every(g => g.spr.alpha === 0));
  s.sc.events.emit('shutdown'); assert.equal(s.live.size, 0); api.detener();
});

test('postprocessing registers for each renderer and cleanup preserves unrelated camera effects', () => {
  const f = fixture('gf-postproceso.js'), api = f.context.GFPost;
  f.context.Phaser.Renderer = { WebGL: { Pipelines: { PostFXPipeline: class {} } } };
  function setup() {
    const s = f.scene(), registered = new Map(), instances = new Set();
    s.sc.game = { renderer: { type: 2, pipelines: { addPostPipeline(key, type) { registered.set(key, type); } } } };
    s.cam.postPipelines = [{ name: 'death-effect' }];
    s.cam.setPostPipeline = key => {
      assert.ok(registered.has(key), 'renderer must own the registered class');
      const pipeline = { name: key }; instances.add(pipeline); s.cam.postPipelines.push(pipeline);
    };
    s.cam.removePostPipeline = key => {
      s.cam.postPipelines = s.cam.postPipelines.filter(p => { if (p.name !== key) return true; instances.delete(p); return false; });
    };
    return { ...s, registered, instances };
  }
  for (let restart = 0; restart < 3; restart++) {
    const s = setup();
    for (let i = 0; i < 15; i++) {
      const st = api.montar(s.sc); assert.ok(st); assert.equal(s.instances.size, 1);
      assert.equal(api.estado().valores.pulso, 0); api.pulso(1); assert.equal(api.estado().valores.pulso, 1);
      s.sc.events.emit('shutdown');
      assert.equal(s.instances.size, 0); assert.equal(s.cam.postPipelines.length, 1);
      assert.equal(s.cam.postPipelines[0].name, 'death-effect'); assert.equal(api.estado().valores, null);
      assert.equal(st.scene, null); assert.equal(st.cam, null); assert.equal(s.sc.events.eventNames().length, 0);
    }
  }
});
