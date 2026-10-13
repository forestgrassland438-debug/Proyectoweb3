'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const bank = require('./gf-banco-tienda.js');
const root = path.resolve(__dirname, '..');
const serverPath = path.join(require('node:os').homedir(), 'Desktop', 'server2.js');
const server = fs.readFileSync(serverPath, 'utf8');
const a = server.indexOf('// <<SHOP-PVP-SYNC>>');
const b = server.indexOf('// <<SHOP-PVP-SYNC-FIN>>', a);
const source = server.slice(a, b);
function backend(gp = {}) {
  const routes = new Map(), writes = [], queues = new Map();
  const state = { playerName: 'Ana', address: '0xaaa', inventory: [], chest: [], ...gp };
  const context = { console, Date, Map, Set, Number, String, Math,
    ITEM_TIPO_MAP: { seed: 'seed', axe: 'axe' }, INV_SLOTS: 3, CHEST_SLOTS: 2,
    itemTipoOnChain: id => ['seed', 'axe'].includes(id) ? id : null,
    apiLimiter() {}, authMiddleware() {}, csrfProtection() {},
    app: { post: (url, ...args) => routes.set(url, args.at(-1)) },
    PlayerAuth: { findOne: () => ({ lean: async () => ({ playerName: 'Ana' }) }) },
    GamePlayer: {
      findOne: () => ({ select() { return this; }, lean: async () => structuredClone(state) }),
      findOneAndUpdate: async (filter, update) => {
        for (const k of ['inventory', 'chest', 'marketWriteAt']) {
          if (JSON.stringify(filter[k] ?? null) !== JSON.stringify(state[k] ?? null)) return null;
        }
        Object.assign(state, update.$set); writes.push(structuredClone(update.$set)); return state;
      }
    },
    facturasLibresDeCadena: async () => context.facturas,
    facturas: [], programarCasillasEnCadena() {},
    enColaDelJugador(key, job) {
      const work = (queues.get(key) || Promise.resolve()).then(job);
      const end = work.catch(() => {}).finally(() => { if (queues.get(key) === end) queues.delete(key); });
      queues.set(key, end); return work;
    },
    saveGamePlayerWithTutorial: async (_name, fields) => { Object.assign(state, fields); writes.push(structuredClone(fields)); }
  };
  const fnStart = server.indexOf('function ponerFacturaEnSlots(inventory, chest, itemId, factura) {');
  const fnEnd = server.indexOf('/* Resta una unidad', fnStart);
  vm.createContext(context);
  vm.runInContext(server.slice(fnStart, fnEnd) + source, context);
  return { context, state, writes, queues, routes };
}
const slot = (id, IDX, cantidad, objeto = 'seed') => ({ id, IDX, Manualid: 'f' + IDX, objeto, cantidad });
const invoice = (id, cantidad, tipo = 'seed', owner = '0xaaa') => ({ id, cantidad, tipo, owner, manualId: 'f' + id });

test('el backend recupera compras huérfanas, conserva las facturas distintas y reutiliza huecos vacíos', async () => {
  const f = backend({ inventory: [slot(0, 1, 3), slot(1, 2, 0, null)] });
  f.context.facturas = [invoice(1, 4), invoice(3, 2), invoice(8, 1, 'axe'), invoice(99, 50, 'seed', '0xotro')];
  let result, status;
  await f.routes.get('/api/inventory/reconcile')({ user: { address: '0xaaa' }, body: { itemId: 'seed' } },
    { status(n) { status = n; return this; }, json(data) { result = data; } });
  assert.equal(status, 200); assert.equal(result.success, true);
  assert.deepEqual(Array.from(f.state.inventory, s => s.IDX), [1, 3, 8]);
  assert.equal(f.state.inventory[0].cantidad, 4);
  assert.equal(f.state.inventory[1].cantidad, 2);
  assert.ok(result.inventoryLoadedAt);
});

test('un guardado antiguo nunca borra una compra; la copia recién cargada sí puede guardarse', async () => {
  const at = new Date();
  const f = backend({ marketWriteAt: at, inventory: [slot(0, 3, 5)] });
  const old = { inventory: [], chest: [], mundo: 'mina' };
  assert.equal(await f.context.guardarInventarioProtegido('Ana', '0xaaa', old, new Date(at.getTime() - 1).toISOString()), true);
  assert.equal(f.state.inventory[0].IDX, 3); assert.equal(f.state.mundo, 'mina');
  assert.equal(await f.context.guardarInventarioProtegido('Ana', '0xaaa', { inventory: [slot(1, 3, 5)] }, at.toISOString()), false);
  assert.equal(f.state.inventory[0].id, 1);
});

test('una mochila llena conserva lo comprado en cadena y no confirma una entrega inexistente', async () => {
  const f = backend({ inventory: [slot(0, 1, 1), slot(1, 2, 1), slot(2, 3, 1)], chest: [slot(0, 4, 1), slot(1, 5, 1)] });
  f.context.facturas = [1, 2, 3, 4, 5, 6].map(id => invoice(id, 1));
  let result, status;
  await f.routes.get('/api/inventory/reconcile')({ user: { address: '0xaaa' }, body: { itemId: 'seed' } },
    { status(n) { status = n; return this; }, json(data) { result = data; } });
  assert.equal(status, 409); assert.equal(result.error, 'inventory_full');
  assert.equal(f.context.facturas.length, 6);
});

test('una lectura de cadena anterior a la compra no entrega, borra ni confirma objetos', async () => {
  const f = backend({ inventory: [slot(0, 1, 2)] });
  f.context.facturas = [invoice(1, 2)];
  let result, status;
  await f.routes.get('/api/inventory/reconcile')({ user: { address: '0xaaa' },
    body: { itemId: 'seed', expectedInvoices: [{ manualId: 'f2', cantidad: 3 }] } },
    { status(n) { status = n; return this; }, json(data) { result = data; } });
  assert.equal(status, 503); assert.equal(result.success, false);
  assert.equal(f.writes.length, 0); assert.equal(f.state.inventory[0].cantidad, 2);
  assert.equal(f.context.facturas.length, 1);
});

test('la conciliación reintenta si otro guardado cambia las casillas mientras lee la cadena', async () => {
  const f = backend({ inventory: [slot(0, 1, 1)] });
  f.context.facturas = [invoice(1, 1), invoice(2, 3), invoice(3, 1, 'axe')];
  let reads = 0;
  f.context.facturasLibresDeCadena = async () => {
    if (++reads === 1) f.state.inventory = [slot(1, 1, 1), slot(2, 3, 1, 'axe')];
    return f.context.facturas;
  };
  let result;
  await f.routes.get('/api/inventory/reconcile')({ user: { address: '0xaaa' }, body: { itemId: 'seed' } },
    { status() { return this; }, json(data) { result = data; } });
  assert.equal(reads, 2); assert.equal(f.writes.length, 1);
  assert.equal(result.success, true);
  assert.equal(f.state.inventory.find(s => s.IDX === 1).id, 1);
  assert.equal(f.state.inventory.find(s => s.IDX === 3).id, 2);
  assert.equal(f.state.inventory.find(s => s.IDX === 2).cantidad, 3);
});

test('actualizar una compra conserva los usos de los objetos que ya tenía el jugador', async t => {
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  f.escena.ponerRapido(0, 'Semillax', 2, 11, 'once');
  f.escena.STATE.quickSlots[0].usosRestantes = 7;
  f.servidor.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true,
    inventory: [{ id: 2, IDX: 11, Manualid: 'once', objeto: 'Semillax', cantidad: 3 }],
    chest: [], inventoryLoadedAt: '2026-10-11T01:00:00.000Z' }) });
  await f.tienda._persistConfirmedPurchase('Semillax');
  assert.equal(f.escena.STATE.slots[2].count, 3);
  assert.equal(f.escena.STATE.slots[2].usosRestantes, 7);
  assert.equal(f.escena.STATE.quickSlots[0], null);
});

test('comprar y salir antes de confirmar entrega y guarda sin retener la escena de tienda', async t => {
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  f.tienda.playerMonedaPlata = 1000;
  f.servidor.scene = f.escena;
  const original = f.servidor.fetch.bind(f.servidor);
  f.servidor.fetch = async (url, options) => {
    if (!String(url).endsWith('/api/inventory/reconcile')) return original(url, options);
    const slots = f.cadena.getUserInventorySnapshot(f.JUGADOR).map((i, id) =>
      ({ id, IDX: i.id, Manualid: i.manualId, objeto: 'Semillax', cantidad: i.cantidad }));
    f.servidor.saved = slots;
    return { ok: true, status: 200, json: async () => ({ success: true, inventory: slots, chest: [], inventoryLoadedAt: new Date().toISOString() }) };
  };
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const division = f.tienda.ejecutarDivision.bind(f.tienda);
  f.tienda.ejecutarDivision = async (...args) => { await pending; return division(...args); };
  const item = bank.itemTienda(f.tienda, 'Semillax');
  let confirmed = 0; f.tienda.showTransactionAnimation = () => confirmed++;
  await f.tienda.processPurchase(item, 3);
  assert.equal(confirmed, 0);
  f.escena.salir(f.tienda);
  release(); await f.tienda._colaTienda; await new Promise(setImmediate);
  assert.equal(f.cadena.totalDe('bolsa zanahorias'), 3);
  assert.equal(f.servidor.saved[0].cantidad, 3);
  assert.equal(confirmed, 1);
  assert.equal(f.tienda.scene, null);
  assert.equal(global.GFTxGate.pending(), 0);
});

test('el inventario local nunca agrega unidades de una factura a otra del mismo objeto', t => {
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  f.escena.ponerRapido(0, 'Semillax', 2, 11, 'once');
  f.escena.poner(1, 'Semillax', 3, 12, 'doce');
  assert.equal(f.tienda.addItemWithCheck('Semillax', 2, 12, 'doce'), true);
  assert.equal(f.escena.STATE.quickSlots[0].count, 2);
  assert.equal(f.escena.STATE.slots[1].count, 5);
  assert.equal(f.tienda.addItemWithCheck('Semillax', 4, 13, 'trece'), true);
  assert.equal(f.escena.STATE.quickSlots[0].count, 2);
  assert.equal(f.escena.STATE.quickSlots[1].idx, 13);
});

test('una compra acuñada no se reembolsa si falla la lectura posterior o el guardado', async t => {
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  f.tienda.playerMonedaPlata = 1000;
  const item = bank.itemTienda(f.tienda, 'Semillax');
  const silver = f.tienda.playerMonedaPlata;
  f.tienda.ejecutarDivision = async () => { f.tienda._confirmedPurchaseQuantity = 3; };
  f.tienda._persistConfirmedPurchase = async () => { throw new Error('network'); };
  await f.tienda.processPurchase(item, 3); await f.tienda._colaTienda;
  assert.equal(f.tienda.playerMonedaPlata, silver - item.buyPrice * 3);
  assert.ok(f.tienda.avisos.some(s => s.includes('sync is pending')));
});

test('una compra parcial registra lo entregado y devuelve solo el precio de lo que no confirmó', async t => {
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  f.tienda.playerMonedaPlata = 1000;
  const item = bank.itemTienda(f.tienda, 'Semillax'), history = [];
  f.tienda.ejecutarDivision = async () => { f.tienda._confirmedPurchaseQuantity = 2; };
  f.tienda._persistConfirmedPurchase = async () => ({ success: true });
  f.tienda.addToHistorial = (_type, _item, qty, cost) => history.push({ qty, cost });
  await f.tienda.processPurchase(item, 3); await f.tienda._colaTienda;
  assert.equal(f.tienda.playerMonedaPlata, 1000 - item.buyPrice * 2);
  assert.deepEqual(history, [{ qty: 2, cost: item.buyPrice * 2 }]);
  assert.ok(f.tienda.avisos.some(s => s.includes('1x') && s.includes('refunded')));
});
