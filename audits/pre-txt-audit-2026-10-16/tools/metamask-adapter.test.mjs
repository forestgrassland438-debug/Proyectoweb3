import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetaMaskAdapter } from './metamask-adapter.mjs';
test('prefiere la extensión instalada y no crea una conexión móvil', async () => {
  let calls = 0;
  const provider = { isMetaMask: true, request: async () => { calls++; } };
  const sdk = createMetaMaskAdapter(() => { throw new Error('no debe crear cliente'); }, { ethereum: provider });
  assert.equal(await sdk.connect(), provider); assert.equal(calls, 1);
});
test('preparar para móvil no abre permisos y reutiliza un solo cliente', async () => {
  let created = 0, connected = 0, disconnected = 0;
  const p = { request() {} };
  const sdk = createMetaMaskAdapter(async () => { created++; return { getProvider: () => p,
    connect: async () => { connected++; }, disconnect: async () => { disconnected++; } }; },
  { location: { origin: 'https://app.grasslandforest.com' } });
  await Promise.all([sdk.prepare(), sdk.prepare()]);
  assert.equal(created, 1); assert.equal(connected, 0);
  assert.equal(await sdk.connect(), p); assert.equal(connected, 1);
  await sdk.disconnect(); assert.equal(disconnected, 1); assert.equal(sdk.getProvider(), null);
});
test('una inicialización fallida se puede reintentar', async () => {
  let calls = 0;
  const sdk = createMetaMaskAdapter(async () => { if (++calls === 1) throw new Error('offline');
    return { getProvider: () => ({}) }; }, { location: { origin: 'https://app.grasslandforest.com' } });
  await assert.rejects(sdk.prepare()); await sdk.prepare(); assert.equal(calls, 2);
});

test('EIP-6963 selecciona MetaMask frente a Brave y libera un único listener', async () => {
  const events = new EventTarget(); let requested = 0, clients = 0;
  const provider = { request: async () => { requested++; } };
  events.addEventListener('eip6963:requestProvider', () => {
    const event = new Event('eip6963:announceProvider');
    event.detail = { info: { rdns: 'io.metamask' }, provider }; events.dispatchEvent(event);
  });
  let listeners = 0;
  const host = { ethereum: { isMetaMask: true, isBraveWallet: true },
    addEventListener: (...args) => { listeners++; events.addEventListener(...args); },
    removeEventListener: (...args) => { listeners--; events.removeEventListener(...args); },
    dispatchEvent: event => events.dispatchEvent(event) };
  const sdk = createMetaMaskAdapter(() => { clients++; }, host);
  for (let i = 0; i < 30; i++) assert.equal(await sdk.prepare(), provider);
  assert.equal(listeners, 1); assert.equal(clients, 0);
  assert.equal(await sdk.connect(), provider); assert.equal(requested, 1);
  await sdk.disconnect(); assert.equal(listeners, 0); assert.equal(sdk.getProvider(), null);
});

test('un disconnect fallido no retiene proveedor ni cliente móvil', async () => {
  let created = 0;
  const sdk = createMetaMaskAdapter(async () => { created++; return { getProvider: () => ({ request() {} }),
    disconnect: async () => { throw Error('offline'); } }; }, { location: { origin: 'https://app.grasslandforest.com' } });
  await sdk.prepare(); await assert.rejects(sdk.disconnect(), /offline/);
  assert.equal(sdk.getProvider(), null); await sdk.prepare(); assert.equal(created, 2);
});
