'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const BIN = path.resolve(__dirname, '..');

function fixture(...files) {
  let serial = 0;
  const timers = new Map();
  function canvas() {
    const cv = { width: 0, height: 0 };
    const pixels = (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i += 4) { data[i] = 10; data[i + 1] = 70; data[i + 2] = 180; data[i + 3] = 255; }
      return { width: w, height: h, data };
    };
    const ctx = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: (_x, _y, w, h) => pixels(w, h), createImageData: pixels }, { get: (o, k) => k in o ? o[k] : () => {} });
    cv.getContext = () => ctx;
    return cv;
  }
  const ctx = { console: { log() {}, warn() {} }, performance: { now: () => 0 }, AbortController, location: { hostname: 'localhost' }, navigator: {},
    document: { readyState: 'loading', hidden: false, visibilityState: 'visible', createElement: canvas, getElementById: () => null, querySelector: () => null,
      addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {},
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { timers.set(++serial, fn); return serial; }, clearInterval: id => timers.delete(id),
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, ahora: 18000, epocaMs: 0, cicloMs: 24000, diaMs: 12000, nocheMs: 12000 }) }),
    Phaser: { BlendModes: { ADD: 1, MULTIPLY: 2 }, Textures: { FilterMode: { LINEAR: 1 } } } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(BIN, file), 'utf8'), ctx, { filename: file });
  function textures() {
    const map = new Map();
    return { map, exists: key => map.has(key), get: key => map.get(key),
      remove(key) { const t = map.get(key); if (t && t.canvas) t.canvas.width = t.canvas.height = 0; map.delete(key); },
      addCanvas(key, cv) { const tex = { key, canvas: cv, getSourceImage: () => cv, getContext: () => cv.getContext('2d'), refresh() {}, setFilter() {} }; map.set(key, tex); return tex; },
      createCanvas(key, w, h) { assert.ok(!map.has(key), 'texture collision: ' + key); const cv = canvas(); cv.width = w; cv.height = h; return this.addCanvas(key, cv); },
      source(key, w = 16, h = 16) { const img = { width: w, height: h }; const tex = { key, getSourceImage: () => img }; map.set(key, tex); return tex; } };
  }
  function scene(tm = textures()) {
    const live = new Set(), children = { list: [] }, events = new EventEmitter(), tweenList = [], clocks = [];
    const sc = { textures: tm, events, children, time: { now: 0, addEvent(config) { const clock = { config, removed: false, remove() { this.removed = true; } }; clocks.push(clock); return clock; } },
      scene: { key: 'test' }, map: { widthInPixels: 5008, heightInPixels: 5008 }, treeStumps: {} };
    function object(x, y, key) {
      const o = { scene: sc, x, y, texture: { key }, active: true, visible: true, alpha: 1, scaleX: 1, scaleY: 1, width: 16, height: 16,
        displayWidth: 16, displayHeight: 16, originX: .5, originY: 1, depth: 1, rotation: 0,
        frame: { name: '__BASE', cutWidth: 16, cutHeight: 16, cutX: 0, cutY: 0, source: { image: { width: 16, height: 16 } } },
        anims: { timeScale: 1, isPlaying: true }, play() { return this; },
        destroy() { if (!this.active) return; this.active = false; this.scene = null; live.delete(this); const i = children.list.indexOf(this); if (i >= 0) children.list.splice(i, 1); },
        setPosition(x, y) { assert.ok(this.active); this.x = x; this.y = y; return this; }, setAlpha(v) { assert.ok(this.active); this.alpha = v; return this; },
        setVisible(v) { assert.ok(this.active); this.visible = v; return this; }, setOrigin(x, y) { this.originX = x; this.originY = y; return this; },
        setDepth(v) { this.depth = v; return this; }, setFlipX(v) { this.flipX = v; return this; }, setTexture(key) { this.texture = { key }; return this; },
        setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
        getBounds() { return { x: this.x - 8, y: this.y - 16, width: 16, height: 16, centerX: this.x, top: this.y - 16, bottom: this.y }; } };
      for (const m of ['setScrollFactor', 'setBlendMode', 'setDisplaySize', 'setSize', 'setFlipY', 'setTint', 'clearTint', 'setRotation', 'clear', 'fill', 'erase']) o[m] = function () { return this; };
      live.add(o); children.list.push(o); return o;
    }
    function tween(config) { const tw = { config, stopped: false, getValue: () => .5, stop() { this.stopped = true; }, finish() { if (!this.stopped && config.onComplete) config.onComplete(); } }; tweenList.push(tw); return tw; }
    sc.tweens = { add: tween, addCounter: tween, killTweensOf(obj) { for (const tw of tweenList) if (tw.config.targets === obj) tw.stop(); } };
    sc.add = { sprite: object, image: object, rectangle: (x, y) => object(x, y, 'rectangle'), ellipse: (x, y) => object(x, y, 'ellipse'), renderTexture: (x, y) => object(x, y, 'rt') };
    sc.make = { image: cfg => object(0, 0, cfg.key), tilemap: () => ({ width: 1, height: 1, addTilesetImage: () => ({ setImage() {} }),
      createLayer: () => ({ setDepth() {}, forEachTile() {} }), destroy() { this.destroyed = true; } }) };
    sc.anims = { exists: () => true, create() {} };
    sc.cameras = { main: { width: 800, height: 600, zoom: 1, worldView: { x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600 }, shake() {} } };
    sc._chocaConEscenario = () => false;
    return { sc, live, object, tweenList, clocks, tick(now, delta = 16) { sc.time.now = now; events.emit('update', now, delta); } };
  }
  function water(s) { s.sc.textures.source('water', 2, 2); Object.assign(s.sc.map, { tileWidth: 2, tilesets: [{ image: { key: 'water' }, firstgid: 1 }],
    getLayer: () => ({ width: 1, height: 1, data: [[{ index: 1 }]] }) }); }
  function weather(tm) { for (const family of ['gota', 'copo', 'salpica', 'posa', 'fuego', 'humo', 'brasa']) for (let i = 1; i <= 4; i++) tm.source('gfc_' + family + '_' + i); }
  return { ctx, scene, textures, water, weather };
}

test('TXT 1: water readback is local and never reuses pixels after the source changes', () => {
  const f = fixture('gf-agua.js'), s = f.scene(); s.sc.textures.source('water', 2, 2);
  const a = f.ctx.GFAgua._interno.leerTextura(s.sc, 'water'); s.sc.textures.source('water', 4, 4);
  const b = f.ctx.GFAgua._interno.leerTextura(s.sc, 'water'); assert.equal(a.w, 2); assert.equal(b.w, 4); assert.notEqual(a, b);
});
test('TXT 2-4: water stops counter and target tweens, destroys airborne fish and ignores stale callbacks', () => {
  const f = fixture('gf-agua.js'), s = f.scene(), api = f.ctx.GFAgua; f.water(s);
  const st = api.montar(s.sc, { capa: 'base', textura: 'water' }); st.T = 32;
  st.peces = [{ spr: s.object(1, 1, 'shadow'), colocado: true, salta: false, vx: 1 }];
  st.anillos = [{ spr: s.object(0, 0, 'ring'), vivo: false }]; st.gotas = [{ spr: s.object(0, 0, 'drop'), vivo: false }];
  s.sc.textures.source('gfa_pez'); s.sc.textures.source('gfa_pez2');
  api._interno.saltarPez(st, { contains: () => true }); assert.equal(s.live.size, 4);
  const tweens = s.tweenList.slice(); assert.equal(tweens.length, 3); api.desmontar(s.sc);
  assert.equal(s.live.size, 0); assert.ok(tweens.every(tw => tw.stopped));
  for (const tw of tweens) { if (tw.config.onUpdate) tw.config.onUpdate(tw); if (tw.config.onComplete) tw.config.onComplete(); }
  assert.equal(s.tweenList.length, 3); assert.equal(s.sc.events.eventNames().length, 0);
});
test('TXT 3: distinct water scenes get distinct atlases and release only their own frames', () => {
  const f = fixture('gf-agua.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm); f.water(a); f.water(b);
  const api = f.ctx.GFAgua, sa = api.montar(a.sc, { capa: 'base', textura: 'water' }), sb = api.montar(b.sc, { capa: 'base', textura: 'water' });
  assert.notEqual(sa.claves[0], sb.claves[0]); api.desmontar(a.sc);
  assert.ok(sa.claves.every(k => !tm.exists(k))); assert.ok(sb.claves.every(k => tm.exists(k)));
  api.desmontar(b.sc); assert.equal(tm.map.size, 1);
});
test('water rolls back generated frames if tilemap construction fails', () => {
  const f = fixture('gf-agua.js'), s = f.scene(); f.water(s); s.sc.make.tilemap = () => { throw Error('allocation'); };
  assert.equal(f.ctx.GFAgua.montar(s.sc, { capa: 'base', textura: 'water' }), null); assert.equal(s.sc.textures.map.size, 1); assert.equal(s.sc.__gfAgua, null);
});
test('TXT 10,13: death effects have unique keys across shared scenes and tear down timers, copies and textures', () => {
  const f = fixture('gf-animales.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm), api = f.ctx.GFAnimales;
  const sa = api.montar(a.sc, { elenco: [] }), sb = api.montar(b.sc, { elenco: [] });
  const animal = s => ({ spr: s.object(500, 500, 'animal'), grupo: 'tierra', especie: 'vaca' });
  const aa = animal(a), ab = animal(b); sa.animales.push(aa); sb.animales.push(ab);
  api._interno.morirAnimal(sa, aa, 0); api._interno.morirAnimal(sb, ab, 0);
  const keys = [...tm.map.keys()].filter(k => /^gfa_muerte_/.test(k)); assert.equal(keys.length, 2);
  a.tweenList[0].finish(); assert.equal(a.clocks.length, 1); api.desmontar(a.sc);
  assert.equal(a.live.size, 0); assert.equal(a.clocks[0].removed, true); assert.equal(tm.exists(keys[0]), false);
  assert.equal(tm.exists(keys[1]), true); assert.equal(tm.exists('gfa_mota_muerte'), true);
  a.clocks[0].config.callback(); api.desmontar(b.sc); assert.equal(b.live.size, 0); assert.equal(tm.map.size, 0);
});
test('TXT 11-12: perched butterflies throttle occlusion checks and restore their center on escape', () => {
  const f = fixture('gf-animales.js'), s = f.scene(), api = f.ctx.GFAnimales._interno;
  const flower = s.object(1000, 1000, 'flower'); flower.depth = 2; s.sc.flower = flower;
  let reads = 0; const house = s.object(4000, 4000, 'house'); house.depth = 100; const bounds = house.getBounds; house.getBounds = () => { reads++; return bounds.call(house); };
  f.ctx.GFProfundidad = { medir: () => ({ leida: false }) };
  const m = { spr: s.object(1000, 1000, 'gfa_mariposa'), especie: 'mariposa_monarca', ficha: { huye: 20, vel: 50 }, fase: 'posada', soporte: 'flower', hasta: 100000 };
  const st = { scene: s.sc, animales: [m] }; m.spr.setOrigin(.5, .8);
  for (let now = 1; now <= 1000; now += 10) api.actualizarMariposa(st, m, now, .01);
  assert.equal(reads, 1); s.sc.player = { x: 1001, y: 1000 }; api.actualizarMariposa(st, m, 1100, .01);
  assert.equal(m.fase, 'revolotea'); assert.equal(m.spr.originY, .5);
});
test('TXT 23-24: owl and eyes follow branch sway, release shared textures last, and depart if the last tree vanishes', () => {
  const f = fixture('gf-buho.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm), api = f.ctx.GFBuho;
  let trees = []; f.ctx.GFCuervo = { _interno: { arbolesDisponibles: () => trees } };
  const tree = a.object(1000, 1100, 'tree'); a.sc.tree = tree; trees = [{ clave: 'tree', spr: tree }];
  const sa = api.montar(a.sc), sb = api.montar(b.sc); sa.forzado = true;
  a.tick(1); const owl = sa.buho; assert.ok(owl); owl.spr.setPosition(owl.destino.x, owl.destino.y); a.tick(2);
  const original = owl.spr.x; tree.rotation = .1; a.tick(3); assert.notEqual(owl.spr.x, original); assert.equal(owl.ojos.x, owl.spr.x);
  a.tick(4); assert.equal(owl.spr.x, original + Math.sin(.1) * (tree.y - owl.posY));
  tree.active = false; trees = []; a.tick(5); assert.equal(owl.fase, 'se_va');
  api.desmontar(a.sc); assert.ok(tm.exists('gfb_posado')); assert.equal(sa.scene, null);
  api.desmontar(b.sc); assert.equal(tm.map.size, 0); assert.equal(sb.scene, null);
});
test('owl creation rolls back its body when allocating its eyes fails', () => {
  const f = fixture('gf-buho.js'), s = f.scene(), tree = s.object(1000, 1100, 'tree'); s.sc.tree = tree;
  f.ctx.GFCuervo = { _interno: { arbolesDisponibles: () => [{ clave: 'tree', spr: tree }] } };
  const st = f.ctx.GFBuho.montar(s.sc); st.forzado = true; s.sc.add.image = () => { throw Error('eyes allocation'); };
  s.tick(1); assert.equal(st.buho, null); assert.equal(s.live.size, 1); f.ctx.GFBuho.desmontar(s.sc);
});
test('TXT 41: night textures survive another scene and preexisting external textures remain owned externally', () => {
  const f = fixture('gf-ciclo-dia.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm), api = f.ctx.GFCiclo;
  const external = tm.source('gf_resplandor'); api.montarEscena(a.sc); api.montarEscena(b.sc);
  api.desmontarEscena(a.sc); assert.ok(tm.exists('gf_luz_poste')); api.detener();
  assert.equal(tm.exists('gf_luz_poste'), false); assert.equal(tm.exists('gf_luz_jugador'), false); assert.equal(tm.get('gf_resplandor'), external);
});
test('TXT 42-43: weather canvas ownership follows scenes and stopped counter callbacks cannot touch destroyed sprites', () => {
  const f = fixture('gf-clima.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm), api = f.ctx.GFClima; f.weather(tm); const base = tm.map.size;
  const sa = api.montar(a.sc, { sinRed: true }), sb = api.montar(b.sc, { sinRed: true }); assert.ok(sa && sb); assert.ok(tm.map.size > base);
  api._interno.chapoteo(sa, 100, 100, 1); const tweens = a.tweenList.slice(); assert.ok(tweens.length >= 5);
  api.desmontar(a.sc); assert.ok(tweens.every(tw => tw.stopped)); assert.ok(tm.map.size > base);
  for (const tw of tweens) { if (tw.config.onUpdate) tw.config.onUpdate(tw); if (tw.config.onComplete) tw.config.onComplete(); }
  api.desmontar(b.sc); api.detener(); assert.equal(tm.map.size, base); assert.equal(a.live.size, 0); assert.equal(b.live.size, 0);
});
test('TXT 13,44: frame caches distinguish textures with equal keys and release cached measurements on stop', () => {
  const f = fixture('gf-animales.js', 'gf-clima.js'), a = f.scene(), b = f.scene();
  const one = a.object(0, 0, 'same-tree'), two = b.object(0, 0, 'same-tree'), api = f.ctx.GFClima;
  const p = api._interno.puntosDeCopa(one); assert.equal(api._interno.puntosDeCopa(one), p);
  assert.notEqual(api._interno.puntosDeCopa(two), p); api.detener(); assert.notEqual(api._interno.puntosDeCopa(one), p);
  const tr = f.ctx.GFAnimales._interno.troncoDe(one); assert.equal(f.ctx.GFAnimales._interno.troncoDe(one), tr);
  assert.notEqual(f.ctx.GFAnimales._interno.troncoDe(two), tr);
  a.sc.textures.source('source'); b.sc.textures.source('source');
  const w = f.ctx.GFAnimales._interno.medirAgua(a.sc, 'source');
  assert.equal(f.ctx.GFAnimales._interno.medirAgua(a.sc, 'source'), w);
  assert.notEqual(f.ctx.GFAnimales._interno.medirAgua(b.sc, 'source'), w);
});
test('wind rolls back partial allocation and shares procedural textures until its last scene exits', () => {
  const f = fixture('gf-viento.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm), api = f.ctx.GFViento;
  const sa = api.montar(a.sc), sb = api.montar(b.sc); assert.ok(sa && sb); assert.ok(tm.map.size > 0);
  api.desmontar(a.sc); assert.equal(a.live.size, 0); assert.ok(tm.map.size > 0);
  api.desmontar(b.sc); assert.equal(b.live.size, 0); assert.equal(tm.map.size, 0);
  const c = f.scene(); let n = 0; const image = c.sc.add.image;
  c.sc.add.image = (...args) => { const spr = image(...args); if (++n === 3) spr.setScale = () => { throw Error('leaf allocation'); }; return spr; };
  assert.equal(api.montar(c.sc), null); assert.equal(c.live.size, 0); assert.equal(c.sc.textures.map.size, 0); assert.equal(c.sc.__gfViento, null);
});
test('mine loot cleanup stops its jump counter and halo loop before destroying their sprites', () => {
  const f = fixture('gf-mina-serpiente.js'), s = f.scene(), api = f.ctx.GFMinaSerpiente._botin;
  s.sc.textures.source('gfsp_item_5'); const st = { scene: s.sc, vivo: true, botin: [] };
  api.crear(st, { id: 'loot', itemId: 5, cantidad: 1 }, 0, 0, 20, 20, 10000);
  assert.equal(st.botin.length, 1); assert.equal(s.tweenList.length, 2); st.vivo = false; api.limpiar(st);
  assert.equal(s.live.size, 0); assert.equal(st.botin.length, 0); assert.ok(s.tweenList.every(tw => tw.stopped));
  s.tweenList[0].config.onUpdate(s.tweenList[0]);
});
test('mine loot removes pending file and failure listeners on cleanup and on a failed download', () => {
  const f = fixture('gf-mina-serpiente.js'), s = f.scene(), api = f.ctx.GFMinaSerpiente._botin;
  s.sc.load = new EventEmitter(); s.sc.load.image = () => {}; s.sc.load.start = () => {};
  s.sc.ItemDefinitions = { 5: { src: '/item.png' } }; const st = { scene: s.sc, vivo: true, botin: [] };
  api.crear(st, { id: 'loot', itemId: 5, cantidad: 1 }, 0, 0, 20, 20, 10000);
  assert.equal(s.sc.load.listenerCount('filecomplete-image-gfsp_item_5'), 1); assert.equal(s.sc.load.listenerCount('loaderror'), 1);
  api.limpiar(st); assert.equal(s.sc.load.eventNames().length, 0); assert.equal(st.cargasBotin.size, 0);
  api.crear(st, { id: 'loot', itemId: 5, cantidad: 1 }, 0, 0, 20, 20, 10000);
  s.sc.load.emit('loaderror', { key: 'gfsp_item_5' }); assert.equal(s.sc.load.eventNames().length, 0); assert.equal(st.cargasBotin.size, 0);
});
test('zombie teardown stops the boss jump and all sprite tweens and releases scene references', () => {
  const f = fixture('gf-mina-zombis.js'), s = f.scene(); const body = s.object(0, 0, 'body'), shadow = s.object(0, 0, 'shadow');
  const jump = s.sc.tweens.addCounter({}), stretch = s.sc.tweens.add({ targets: body });
  const z = { vivo: true, spr: body, sombra: shadow, saltoTween: jump };
  const st = { scene: s.sc, vivo: true, bichos: [z], onUpdate() {}, onApagar() {} }; s.sc.__gfZombis = st;
  f.ctx.GFMinaZombis.desmontar(s.sc); assert.equal(jump.stopped, true); assert.equal(stretch.stopped, true);
  assert.equal(s.live.size, 0); assert.equal(st.scene, null); assert.equal(z.vivo, false);
});

process.argv[2] = BIN;
const bank = require('./fauna-banco.js');
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-cuervo.js'), 'utf8'), bank.ctx);
test('shadow rebaking preserves another scene and releases every obsolete canvas after its last user', () => {
  const f = fixture('gf-sombras.js'), tm = f.textures(), a = f.scene(tm), b = f.scene(tm), api = f.ctx.GFSombras;
  tm.source('tree'); a.sc.sprite_arbolx1 = a.object(100, 100, 'tree'); b.sc.sprite_arbolx1 = b.object(200, 200, 'tree');
  api.montar(a.sc); api.montar(b.sc); a.tick(1); b.tick(1);
  const original = b.sc.__gfSombras.sombras[0].horno.clave;
  assert.equal(a.sc.__gfSombras.sombras[0].horno.clave, original);
  for (let n = 0; n < 20; n++) {
    api.rehornear(a.sc);
    assert.ok(tm.exists(original));
    assert.equal(tm.map.size, 3, 'source + other scene shadow + current scene shadow');
  }
  api.desmontar(a.sc); assert.ok(tm.exists(original)); assert.equal(tm.map.size, 2);
  api.desmontar(b.sc); assert.equal(tm.map.size, 1); assert.equal(Object.keys(api._interno.horneadas()).length, 0);
});

test('shadow caches distinguish equal source keys in separate TextureManagers', () => {
  const f = fixture('gf-sombras.js'), a = f.scene(), b = f.scene(), api = f.ctx.GFSombras;
  a.sc.textures.source('tree', 16, 16); b.sc.textures.source('tree', 32, 48);
  const one = api._interno.hornear(a.sc, 'tree', .5), two = api._interno.hornear(b.sc, 'tree', .5);
  assert.ok(one && two); assert.notEqual(one, two); assert.notEqual(one.clave, two.clave);
  assert.equal(api._interno.hornear(a.sc, 'tree', .5), one);
});

test('TXT 45: walking crow turns before solid obstacles and map edges', () => {
  const scene = bank.crearEscena(); scene.player = null; const exists = scene.textures.exists; scene.textures.exists = k => exists(k) || k.startsWith('cuervo_');
  const api = bank.ctx.GFCuervo, st = api.montar(scene, { cantidad: 1 }), c = st.cuervos[0];
  c.fase = 'camina'; c.hasta = 1e9; c.huyeEn = 1e9; c.rumbo = 1; c.spr.setPosition(990, 1050);
  api._interno.actualizarCuervo(st, c, .1); assert.equal(c.spr.x, 990); assert.equal(c.rumbo, -1);
  c.spr.setPosition(5000, 2000); c.rumbo = 1; api._interno.actualizarCuervo(st, c, .1); assert.equal(c.spr.x, 5000); assert.equal(c.rumbo, -1); api.desmontar(scene);
});
test('TXT 46: crow without trees chooses ground movement even with a low random draw and no player', () => {
  const scene = bank.crearEscena(); scene.player = null;
  for (const key of Object.keys(scene)) if (/^sprite_(arbolx|pinos)/.test(key)) delete scene[key];
  const exists = scene.textures.exists; scene.textures.exists = k => exists(k) || k.startsWith('cuervo_');
  const api = bank.ctx.GFCuervo, st = api.montar(scene, { cantidad: 1 }), c = st.cuervos[0]; c.spr.setPosition(2000, 2000); c.hasta = 0;
  const original = vm.runInContext('Math.random', bank.ctx); bank.ctx.__auditRandom = original;
  try { vm.runInContext('Math.random = () => .1', bank.ctx); api._interno.actualizarCuervo(st, c, .01); assert.equal(c.fase, 'volando'); assert.equal(c.alFinal, 'camina'); }
  finally { vm.runInContext('Math.random = __auditRandom', bank.ctx); api.desmontar(scene); }
});
