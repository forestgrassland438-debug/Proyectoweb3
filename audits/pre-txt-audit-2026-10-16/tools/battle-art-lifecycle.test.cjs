'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gf-batalla-arte.js'), 'utf8');

function art() {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(source, context);
  return context.window.GFBatallaArte;
}

function drawingContext() {
  const noop = () => ({ addColorStop() {} });
  return new Proxy({}, {
    get(target, key) { return key in target ? target[key] : noop; },
    set(target, key, value) { target[key] = value; return true; }
  });
}

function manager() {
  const live = new Map();
  const released = [];
  return {
    live, released,
    exists(key) { return live.has(key); },
    get(key) { return live.get(key); },
    createCanvas(key, width, height) {
      const texture = { width, height, getContext: drawingContext, refresh() {} };
      live.set(key, texture);
      return texture;
    },
    remove(key) { released.push(key); live.delete(key); }
  };
}

test('twenty battles release every owned arena and effect texture', () => {
  const A = art(), textures = manager(), scene = { textures };
  for (let cycle = 0; cycle < 20; cycle++) {
    assert.equal(A.efectos(scene), 16);
    const arena = A.arena(scene, A.elegirArena('match_' + cycle), cycle + 1);
    assert.ok(arena);
    assert.equal(textures.live.size, 17);
    A.efectos(scene);
    A.arena(scene, A.elegirArena('match_' + cycle), cycle + 1);
    assert.equal(textures.live.size, 17, 'repeated drawing does not acquire extra ownership');
    assert.equal(A.olvidar(scene), 17);
    assert.equal(textures.live.size, 0);
    assert.equal(A.olvidar(scene), 0);
  }
});

test('recreating a Phaser game keeps each texture manager independent', () => {
  const A = art();
  const first = { textures: manager() }, second = { textures: manager() };
  for (const scene of [first, second]) {
    A.efectos(scene);
    A.arena(scene, 'noche', 33);
  }
  A.olvidar(first);
  assert.equal(first.textures.live.size, 0);
  assert.equal(second.textures.live.size, 17);
  A.olvidar(second);
  assert.equal(second.textures.live.size, 0);
});

test('one scene cannot release an arena or effects still used by another', () => {
  const A = art(), textures = manager();
  const first = { textures }, second = { textures };
  for (const scene of [first, second]) {
    A.efectos(scene);
    A.arena(scene, 'nieve', 19);
  }
  A.olvidar(first);
  assert.equal(textures.live.size, 17);
  A.olvidar(second);
  assert.equal(textures.live.size, 0);
});

test('LRU evicts old ownership without destroying another scene background', () => {
  const A = art(), textures = manager();
  const first = { textures }, second = { textures };
  const shared = A.arena(first, 'bosque', 1);
  A.arena(second, 'bosque', 1);
  for (let seed = 2; seed <= 25; seed++) A.arena(first, 'bosque', seed);
  assert.equal(textures.live.size, 3);
  assert.ok(textures.exists(shared.clave));
  assert.equal(A._interno.arenasVivas(first).length, 2);
  A.olvidar(first);
  assert.equal(textures.live.size, 1);
  A.olvidar(second);
  assert.equal(textures.live.size, 0);
});

test('unknown arena identifiers use the canonical meadow key', () => {
  const A = art(), scene = { textures: manager() };
  const meadow = A.arena(scene, 'pradera', 4);
  for (const id of ['unexpected', '__proto__', 'toString', 'constructor', null]) {
    assert.equal(A.arena(scene, id, 4).clave, meadow.clave);
  }
  assert.equal(scene.textures.live.size, 1);
  A.olvidar(scene);
  assert.equal(scene.textures.live.size, 0);
});

test('cleanup preserves pre-existing and externally replaced textures', () => {
  const A = art(), textures = manager(), scene = { textures };
  const existing = textures.createCanvas(A.pieza('chispa'), 16, 16);
  A.efectos(scene);
  const arena = A.arena(scene, 'canon', 7);
  const replacement = textures.createCanvas(arena.clave, 24, 24);
  A.olvidar(scene);
  assert.equal(textures.live.size, 2);
  assert.equal(textures.get(A.pieza('chispa')), existing);
  assert.equal(textures.get(arena.clave), replacement);
});

test('a failed canvas render rolls back allocations and can retry', () => {
  const A = art(), textures = manager(), scene = { textures };
  const original = textures.createCanvas;
  for (const failure of ['context', 'refresh', 'return-null']) {
    textures.createCanvas = function (key, w, h) {
      const canvas = original.call(this, key, w, h);
      if (failure === 'context') canvas.getContext = () => null;
      if (failure === 'refresh') canvas.refresh = () => { throw new Error('context lost'); };
      return failure === 'return-null' ? null : canvas;
    };
    assert.equal(A.arena(scene, 'noche', 9), null);
    assert.equal(textures.live.size, 0);
    assert.equal(A._interno.arenasVivas(scene).length, 0);
  }
  textures.createCanvas = original;
  assert.ok(A.arena(scene, 'noche', 9));
  A.olvidar(scene);
  assert.equal(textures.live.size, 0);
});

test('painter exception preserves an external texture replacement', () => {
  const A = art(), textures = manager(), scene = { textures };
  let external;
  assert.equal(A._interno.lienzo(scene, 'custom', 8, 8, () => {
    external = textures.createCanvas('custom', 10, 10);
    throw new Error('paint failed');
  }), null);
  assert.equal(textures.get('custom'), external);
});

test('empty cleanup cannot erase another manager resource registry', () => {
  const A = art(), scene = { textures: manager() };
  A.arena(scene, 'pradera', 12);
  assert.equal(A.olvidar(null), 0);
  assert.equal(A.olvidar({}), 0);
  assert.equal(A.olvidar(scene), 1);
  assert.equal(scene.textures.live.size, 0);
});

test('lost texture manager fails gracefully without deleting foreign data', () => {
  const A = art(), scene = { textures: {
    exists() { throw new Error('destroyed'); },
    remove() { assert.fail('should not remove an unowned resource'); }
  } };
  assert.equal(A.arena(scene, 'bosque', 2), null);
  assert.equal(A.efectos(scene), 0);
  assert.equal(A._interno.lienzo(scene, 'x', 8, 8, () => {}), null);
});
