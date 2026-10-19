'use strict';

// Offline history-panel tests. No wallet, network, signature or transaction.
// Run: node --test bin/tools/hub-lifecycle.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = readFileSync(path.join(__dirname, '..', 'hub.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const response = data => ({ ok: true, json: async () => data });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function element() {
  const node = new EventEmitter();
  const classes = new Set();
  Object.assign(node, {
    addEventListener: node.on.bind(node), removeEventListener: node.off.bind(node),
    style: {}, dataset: {}, children: [], className: '', innerText: '', textContent: '',
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = null; },
    querySelector() { return null; }, select() {},
    click() { this.emit('click', { stopPropagation() {} }); }
  });
  Object.defineProperty(node, 'innerHTML', { set() { node.children = []; }, get() { return ''; } });
  return node;
}
function fixture(fetchImpl = async () => response({ interaction: [], items: [] })) {
  let id = 0;
  const timers = new Map();
  const nodes = new Map(['tx-hub', 'tx-hub-close', 'tx-refresh', 'tx-status-text', 'tx-list-interaction', 'tx-list-items'].map(name => [name, element()]));
  const header = element();
  nodes.get('tx-hub').querySelector = () => header;
  const document = Object.assign(element(), {
    getElementById: name => nodes.get(name), querySelectorAll: () => [], createElement: () => element(), body: element(), execCommand: () => true
  });
  const window = {};
  const context = vm.createContext({
    document, window, location: { hostname: 'example.test' }, navigator: {}, AbortController,
    console: { log() {}, warn() {}, error() {} }, fetch: fetchImpl,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { fn, delay }); return key; },
    clearTimeout(key) { timers.delete(key); }
  });
  vm.runInContext(source, context, { filename: 'hub.js' });
  const hub = window.hub;
  hub.setUser('Alice', '0xAlice');
  return { hub, nodes, header, document, timers, context };
}
function reverted(f) {
  const tx = { id: 'failed-1', category: 'items', status: 'reverted', hash: '0x1234567890', quantity: 1, name: 'Seed', hiddenData: { item: 42 } };
  f.hub.transactions.items.push(tx);
  f.hub.renderCategory('items');
  const row = f.nodes.get('tx-list-items').children[0];
  const button = row.children.find(child => child.className === 'tx-retry-btn');
  return { tx, row, button };
}

test('retry catches a rejected callback, keeps the log and permits an explicit later attempt', async () => {
  const f = fixture();
  const { tx, button } = reverted(f);
  let deletes = 0;
  f.hub.deleteFromBackend = async () => { deletes++; };
  f.hub.onRetry = async () => { throw new Error('wallet declined'); };
  button.click();
  await flush();
  assert.equal(deletes, 0);
  assert.equal(f.hub.transactions.items[0], tx);
  assert.equal(button.disabled, false);
  assert.equal(f.hub.statusSpan.innerText, '❌ Retry failed');
  assert.equal(f.hub._retryStates.size, 0);
});

test('retry catches synchronous callback errors and explicit cancellation', async () => {
  for (const callback of [() => { throw new Error('offline'); }, () => false]) {
    const f = fixture();
    const { tx, button } = reverted(f);
    f.hub.onRetry = callback;
    f.hub.deleteFromBackend = () => { throw new Error('must not delete'); };
    assert.equal(await f.hub._retryTransaction(tx, button), false);
    assert.equal(button.disabled, false);
    assert.equal(f.hub.transactions.items.length, 1);
  }
});

test('callback rejection re-enables the current button after a pending row was rerendered', async () => {
  const f = fixture();
  const { button } = reverted(f);
  const pending = deferred();
  f.hub.onRetry = () => pending.promise;
  button.click();
  f.hub.renderCategory('items');
  pending.reject(new Error('cancelled'));
  await flush();
  const currentButton = f.nodes.get('tx-list-items').children[0].children.find(child => child.className === 'tx-retry-btn');
  assert.equal(currentButton.disabled, false);
  assert.equal(f.hub.transactions.items.length, 1);
});

test('retry runs once across repeated clicks and rerenders, then removes only its own record', async () => {
  const f = fixture();
  const { tx, button } = reverted(f);
  f.hub.transactions.items.push({ ...tx, id: 'another-record' });
  const pending = deferred();
  let retries = 0, deletes = 0;
  f.hub.onRetry = () => { retries++; return pending.promise; };
  f.hub.deleteFromBackend = async id => { assert.equal(id, tx.id); deletes++; };
  button.click();
  button.click();
  f.hub.renderCategory('items');
  const freshButton = f.nodes.get('tx-list-items').children[0].children.find(child => child.className === 'tx-retry-btn');
  assert.equal(freshButton.disabled, true);
  freshButton.click();
  assert.equal(retries, 1);
  pending.resolve();
  await flush();
  assert.equal(deletes, 1);
  assert.equal(f.hub.transactions.items.length, 1);
  assert.equal(f.hub.transactions.items[0].id, 'another-record');
  assert.equal(f.hub._retryStates.size, 0);
});

test('a failed history deletion after retry never re-enables transaction submission', async () => {
  const f = fixture();
  const { tx, button } = reverted(f);
  let retries = 0;
  f.hub.onRetry = async () => { retries++; };
  f.hub.deleteFromBackend = async () => { throw new Error('database offline'); };
  button.click();
  await flush();
  assert.equal(f.hub.transactions.items[0], tx);
  assert.match(f.hub.statusSpan.innerText, /history cleanup failed/);
  const currentButton = f.nodes.get('tx-list-items').children[0].children.find(child => child.className === 'tx-retry-btn');
  assert.equal(currentButton.disabled, true);
  currentButton.click();
  await flush();
  assert.equal(retries, 1);
  assert.equal(f.hub._retryStates.get(tx.id), 'completed');
});

test('account switch while retry is pending never deletes history under the new account', async () => {
  const f = fixture();
  const { button } = reverted(f);
  const pending = deferred();
  let deletes = 0;
  f.hub.onRetry = () => pending.promise;
  f.hub.deleteFromBackend = async () => { deletes++; };
  button.click();
  f.hub.setUser('Bob', '0xBob');
  f.hub.statusSpan.innerText = 'Bob status';
  pending.resolve();
  await flush();
  assert.equal(deletes, 0);
  assert.equal(f.hub.transactions.items.length, 0);
  assert.equal(f.hub.statusSpan.innerText, 'Bob status');
});

test('latest refresh wins and aborts its predecessor even if old transport ignores abort', async () => {
  const requests = [];
  const f = fixture((url, options) => { const item = deferred(); requests.push({ ...item, options }); return item.promise; });
  const first = f.hub.loadFromBackend();
  const second = f.hub.loadFromBackend();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(response({ interaction: [], items: [{ id: 'new', category: 'items', hash: '0xnew' }] }));
  await second;
  requests[0].resolve(response({ interaction: [], items: [{ id: 'old', category: 'items', hash: '0xold' }] }));
  await first;
  assert.equal(f.hub.transactions.items[0].id, 'new');
  assert.equal(f.timers.size, 0);
});

test('old account failures cannot overwrite a new account status', async () => {
  const pending = deferred();
  const f = fixture(() => pending.promise);
  const load = f.hub.loadFromBackend();
  f.hub.setUser('Bob', '0xBob');
  f.hub.statusSpan.innerText = 'Bob status';
  pending.reject(new Error('old request failed'));
  await load;
  assert.equal(f.hub.statusSpan.innerText, 'Bob status');
});

test('an old refresh cannot overwrite a newly added optimistic transaction', async () => {
  const pending = deferred();
  const f = fixture(() => pending.promise);
  const load = f.hub.loadFromBackend();
  f.hub.saveToBackend = async () => {};
  f.hub.addTransaction('items', { hash: '0xnew', name: 'Seed', status: 'pending' });
  pending.resolve(response({ interaction: [], items: [] }));
  await load;
  assert.equal(f.hub.transactions.items.length, 1);
  assert.equal(f.hub.transactions.items[0].hash, '0xnew');
});

test('account switch during CSRF handshake prevents the pending write from being sent', async () => {
  const handshake = deferred();
  const calls = [];
  const f = fixture(url => { calls.push(url); return handshake.promise; });
  const save = f.hub.saveToBackend({ id: 'old-user' });
  f.hub.setUser('Bob', '0xBob');
  handshake.resolve(response({ csrfToken: 'a'.repeat(64) }));
  await assert.rejects(save, /session changed/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /csrf-token$/);
  assert.equal(f.timers.size, 0);
});

test('destroy cancels request, drag handlers and feedback timers without disturbing unrelated listeners', async () => {
  let signal;
  const f = fixture((url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  const external = () => {};
  f.document.addEventListener('mousemove', external);
  f.header.emit('mousedown', { clientX: 0, clientY: 0 });
  f.hub._restoreHashLater(element(), '0xabc');
  const load = f.hub.loadFromBackend();
  f.hub.destroy();
  f.hub.destroy();
  await load;
  assert.equal(signal.aborted, true);
  assert.equal(f.document.listenerCount('mousemove'), 1);
  assert.equal(f.document.listeners('mousemove')[0], external);
  assert.equal(f.document.listenerCount('mouseup'), 0);
  assert.equal(f.header.listenerCount('mousedown'), 0);
  assert.equal(f.nodes.get('tx-refresh').listenerCount('click'), 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.hub._requests.size, 0);
});

test('timeout remains active until JSON body completes and clears its timer after abort', async () => {
  const f = fixture((url, options) => response(null));
  f.context.fetch = async (url, options) => ({ ok: true, json: () => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('body timed out')), { once: true });
  }) });
  const load = f.hub.loadFromBackend();
  await flush();
  assert.equal(f.timers.size, 1);
  [...f.timers.values()][0].fn();
  await load;
  assert.equal(f.hub.statusSpan.innerText, '❌ Load error');
  assert.equal(f.timers.size, 0);
});

test('clipboard fallback removes its textarea on failure and schedules bounded feedback', async () => {
  const f = fixture();
  const { row } = reverted(f);
  f.document.execCommand = () => { throw new Error('clipboard denied'); };
  const hashSpan = row.children[1].children[1].children[0];
  hashSpan.click();
  await flush();
  assert.equal(f.document.body.children.length, 0);
  assert.equal(hashSpan.textContent, '❌ Error');
  assert.equal(f.hub._copyTimers.size, 1);
  hashSpan.click();
  await flush();
  assert.equal(f.hub._copyTimers.size, 1);
  f.hub.destroy();
  assert.equal(f.timers.size, 0);
});
