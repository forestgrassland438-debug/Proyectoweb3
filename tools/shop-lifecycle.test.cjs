'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const EventEmitter = require('eventemitter3');

function fixture() {
  const masks = new Set(), graphics = new Set(), timers = new Set();
  let walletResolve;
  class Node extends EventEmitter {
    constructor(x = 0, y = 0, text = '') { super(); this.x = x; this.y = y; this.text = text; this.children = []; }
    setInteractive() { return this; }
    setText(text) { assert.ok(!this.destroyed, 'respuesta aplicada a un texto destruido'); this.text = text; return this; }
    setMask(mask) { this.mask = mask; return this; }
    clearMask() { this.mask = null; return this; }
    add(node) { this.children.push(node); return this; }
    removeAll(destroy) { if (destroy) this.children.forEach(n => n.destroy()); this.children = []; }
    destroy() { this.destroyed = true; this.removeAll(true); this.removeAllListeners(); }
    fillRect() { return this; } lineStyle() { return this; } fillStyle() { return this; } strokeRect() { return this; }
    getBounds() { return { height: this.children.length * 30 }; }
  }
  const add = { text: (x,y,text) => new Node(x,y,text), container: (x,y) => new Node(x,y), graphics: () => new Node() };
  class Scene { constructor() { this.add = add; this.events = new EventEmitter(); this.input = new EventEmitter(); this.cameras = { main: { width: 360, height: 700 } }; } }
  class Rectangle { constructor(x,y,width,height) { Object.assign(this, { x,y,width,height }); } static ContainsPoint() { return false; } }
  const window = { ethereum: { request: () => new Promise(resolve => { walletResolve = resolve; }) } };
  const SceneClass = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Scenes/ShopScene.js'), 'utf8') + '\nShopScene;', {
    window, console: { log() {}, error() {}, warn() {} }, Phaser: { Scene, Geom: { Rectangle }, Math: { Between: min => min, Clamp: (n,min,max) => Math.max(min,Math.min(max,n)) } } });
  const scene = new SceneClass();
  scene.make = { graphics: () => {
    const node = new Node(); graphics.add(node);
    node.createGeometryMask = () => { const mask = { destroy: () => masks.delete(mask) }; masks.add(mask); return mask; };
    node.destroy = () => graphics.delete(node);
    return node;
  } };
  scene.time = { delayedCall: (_, callback) => { const timer = { callback, remove: () => timers.delete(timer) }; timers.add(timer); return timer; } };
  return { scene, masks, graphics, timers, finishWallet: accounts => walletResolve(accounts), flush: () => { for (const t of [...timers]) { timers.delete(t); t.callback(); } } };
}

test('30 entradas y salidas liberan máscaras y gráficos sin borrar listeners ajenos', () => {
  const f = fixture(); let unrelated = 0;
  f.scene.input.on('wheel', () => { unrelated++; });
  for (let i = 0; i < 30; i++) {
    f.scene.create(); assert.equal(f.masks.size, 3); assert.equal(f.graphics.size, 3);
    assert.equal(f.scene.input.listenerCount('wheel'), 2);
    f.scene.events.emit('shutdown');
    assert.equal(f.masks.size, 0); assert.equal(f.graphics.size, 0);
    assert.equal(f.scene.input.listenerCount('wheel'), 1);
    assert.equal(f.scene.events.listenerCount('destroy'), 0);
  }
  f.scene.input.emit('wheel'); assert.equal(unrelated, 1);
});

test('la compra usa el ítem original aunque cambie la selección y acota el texto/timer', () => {
  const f = fixture(); f.scene.create();
  f.scene.selectedItem = { name: 'Original', price: '0.10' }; f.scene.buySelectedItem();
  f.scene.selectedItem = { name: 'Other', price: '2.00' }; f.scene.buySelectedItem();
  assert.equal(f.timers.size, 1); f.flush();
  assert.equal(f.scene.stats.volumenCompra, 0.10);
  assert.match(f.scene._purchaseText.text, /^Original /);
  const old = f.scene._purchaseText; f.scene.buySelectedItem();
  assert.equal(old.destroyed, true);
  f.scene.events.emit('shutdown'); assert.equal(f.timers.size, 0);
});

test('una respuesta de wallet de una entrada anterior no altera la nueva escena', async () => {
  const f = fixture(); f.scene.create();
  const pending = f.scene.connectWallet();
  f.scene.events.emit('shutdown'); f.scene.create();
  const text = f.scene.walletText.text;
  f.finishWallet(['0x123456789abcdef']); await pending;
  assert.equal(f.scene.walletText.text, text);
});
