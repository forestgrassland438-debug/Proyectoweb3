'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'phaser-memory-cleaner.js'), 'utf8');
function fixture() {
  const env = vm.createContext({ console: { info() {}, log() {} }, ArrayBuffer, Uint8Array, Map, Set, WeakSet });
  env.window = env;
  vm.runInContext(source, env);
  return env;
}
test('Memory diagnostics report buffers instead of silently estimating every node as zero', () => {
  const env = fixture();
  env.game = { buffer: new Uint8Array(2 * 1024 * 1024) };
  const result = env.PhaserSleuth.run({ exportReport: false, maxDepth: 3, sizeThresholdMB: 1 });
  assert.ok(result.found.some(root => root.top.some(item => item.path === 'game.buffer' && item.MB >= 2)));
});
test('Aggressive diagnostics require explicit targets and cannot automatically destroy live caches', () => {
  const env = fixture(); let destroyed = 0;
  env.game = { cache: { images: { destroy() { destroyed++; } } }, buffer: new Uint8Array(2 * 1024 * 1024) };
  const result = env.PhaserSleuth.run({ exportReport: false, aggressive: true, dryRun: false, sizeThresholdMB: 1 });
  assert.equal(destroyed, 0); assert.equal(result.attemptedCleanup.length, 0); assert.ok(env.game.buffer);
});
test('Property names are never executed and object inspection avoids getters', () => {
  const env = fixture(); let reads = 0;
  env.game = { ['x; window.compromised = true; //']: new Uint8Array(2 * 1024 * 1024) };
  Object.defineProperty(env.game, 'dangerous', { enumerable: true, get() { reads++; throw new Error('must not read'); } });
  env.PhaserSleuth.run({ exportReport: false, aggressive: true, dryRun: false, sizeThresholdMB: 1, cleanupPaths: ['game.x; window.compromised = true; //'] });
  assert.equal(reads, 0); assert.equal(env.compromised, undefined); assert.doesNotMatch(source, /new Function\(/);
});

test('Reporter drops completed timeout records, including callbacks that throw', () => {
  const reporter = fs.readFileSync(path.join(__dirname, '..', 'phaser-memory-reporter.js'), 'utf8');
  const start = reporter.indexOf('(function wrapTimers()');
  const end = reporter.indexOf('// --- WRAP addEventListener', start);
  const tasks = new Map(); let id = 0;
  const instr = { timers: { count: 0, list: [] }, manualNotes: [] };
  const env = vm.createContext({ instr, nowISO: () => '', stackSample: () => '', window: {
    setTimeout(fn, delay, ...args) { const key = ++id; tasks.set(key, () => fn(...args)); return key; },
    setInterval() { return ++id; }, clearTimeout(key) { tasks.delete(key); }, clearInterval() {}
  } });
  vm.runInContext(reporter.slice(start, end), env);
  let received;
  for (let i = 0; i < 100; i++) { const key = env.window.setTimeout(value => { received = value; }, 1, 'argument'); tasks.get(key)(); tasks.delete(key); }
  assert.equal(received, 'argument'); assert.equal(instr.timers.count, 0); assert.equal(instr.timers.list.length, 0);
  const key = env.window.setTimeout(() => { throw new Error('expected'); }, 1);
  assert.throws(tasks.get(key), /expected/); assert.equal(instr.timers.count, 0); assert.equal(instr.timers.list.length, 0);
});
