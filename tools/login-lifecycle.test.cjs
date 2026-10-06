'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../../login-sonmia/src/components/ConnectRoninWalletButton.jsx'), 'utf8');
function body(name) {
  const start = source.indexOf('function ' + name + '(');
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  if (start < 0 || depth) throw Error('No se encontró ' + name);
  return source.slice(open + 1, end - 1);
}
test('el refresco consulta la conexión actual, aunque la función naciera desconectada', async () => {
  let refreshes = 0, callback;
  const run = new Function('connected', 'connectedRef', 'mounted', 'refreshTimerRef', 'cleanupRefreshTimer',
    'setTimeout', 'refreshAccessToken', 'setCsrfToken', 'console', body('startRefreshTimer'));
  run(false, { current: true }, { current: true }, { current: null }, () => {},
    fn => { callback = fn; return 1; }, async () => { refreshes++; return { success: false }; }, () => {}, { log() {}, warn() {} });
  await callback(); assert.equal(refreshes, 1);
});
test('un refresh pendiente no vuelve a crear temporizadores después de desmontar', async () => {
  let callback, finish, reschedules = 0;
  const mounted = { current: true };
  const run = new Function('connectedRef', 'mounted', 'refreshTimerRef', 'cleanupRefreshTimer',
    'setTimeout', 'refreshAccessToken', 'setCsrfToken', 'console', 'startRefreshTimer', body('startRefreshTimer'));
  run({ current: true }, mounted, { current: null }, () => {},
    fn => { callback = fn; return 1; }, () => new Promise(resolve => { finish = resolve; }),
    () => { throw Error('Estado de componente desmontado'); }, { log() {}, warn() {} }, () => { reschedules++; });
  const pending = callback(); mounted.current = false;
  finish({ success: true, data: { csrfToken: 'late' } });
  await pending; assert.equal(reschedules, 0);
});
test('los oyentes se eliminan del proveedor original incluso si cambia window.ethereum', () => {
  const { EventEmitter } = require('node:events');
  const first = new EventEmitter(), second = new EventEmitter();
  let current = first;
  const binding = { current: null };
  const handlers = [() => {}, () => {}, () => {}];
  const clean = new Function('providerListenersRef', 'console', body('cleanupProviderListeners'));
  const setup = new Function('cleanupProviderListeners', 'getMetaMaskProvider', 'providerListenersRef',
    'handleAccountsChanged', 'handleChainChanged', 'handleDisconnect', 'console', body('setupProviderListeners'));
  const quiet = { log() {}, warn() {} };
  for (let i = 0; i < 30; i++) setup(() => clean(binding, quiet), () => current, binding, ...handlers, quiet);
  assert.equal(first.listenerCount('accountsChanged'), 1);
  current = second; clean(binding, quiet);
  assert.equal(first.listenerCount('accountsChanged'), 0);
  assert.equal(first.eventNames().length, 0); assert.equal(binding.current, null);
});

test('cambiar cuenta invalida la autenticación y usa el estado actual del listener', () => {
  const connectedRef = { current: true }, addressRef = { current: '0xA' };
  let connected = true, clears = 0, selected;
  const run = new Function('mounted', 'addressRef', 'connectedRef', 'setAddress', 'cleanupRefreshTimer',
    'setConnected', 'setPlayerName', 'setStatus', 'handleDisconnect', 'console', 'accounts', body('handleAccountsChanged'));
  const invoke = accounts => run({ current: true }, addressRef, connectedRef, address => { selected = address; },
    () => { clears++; }, value => { connected = value; }, () => {}, () => {}, () => {}, { log() {} }, accounts);
  invoke(['0xa']); assert.equal(connected, true); assert.equal(clears, 0);
  addressRef.current = '0xB'; // estado actualizado después de registrar el handler
  invoke(['0xb']); assert.equal(connected, true);
  invoke(['0xC']); assert.equal(connected, false); assert.equal(connectedRef.current, false);
  assert.equal(clears, 1); assert.equal(selected, '0xC');
});
