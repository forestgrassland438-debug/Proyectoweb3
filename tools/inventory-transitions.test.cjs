'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(require('node:os').homedir(), 'Desktop', 'server2.js'), 'utf8');
const mapStart = server.indexOf('const ITEM_TIPO_MAP = {');
const mapEnd = server.indexOf('function itemTipoOnChain', mapStart);
const catalog = require('../gf-crop-catalog');
const types = vm.runInNewContext(server.slice(mapStart, mapEnd) + '\nITEM_TIPO_MAP', { GF_CROP_CATALOG: catalog });
const names = ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene', 'InteriorScene', 'LoadingScenegame'];
function fixture() {
  const logs = [];
  const context = { window: { GFPlantCatalog: catalog, location: { hostname: 'localhost' } }, document: {},
    console: { log() {}, warn(...a) { logs.push(a); }, error(...a) { logs.push(a); } },
    Phaser: { Scene: class {}, Math: { Clamp: (x, a, b) => Math.min(b, Math.max(a, x)) } },
    LoadingSystem: class {}, setTimeout, clearTimeout, setInterval, clearInterval, AbortController };
  vm.createContext(context);
  for (const name of names) vm.runInContext(fs.readFileSync(path.join(root, 'Scenes', name + '.js'), 'utf8'), context);
  const loader = new context.window.LoadingScenegame();
  const state = { inventory: [], chest: [], inventoryLoadedAt: '2026-10-11T02:00:00.123Z', moneda: 0, moneda_plata: 0 };
  let snapshot = [], writes = 0;
  const setup = (scene, name) => Object.assign(scene, {
    playerName: 'Ana', address: '0xaaa', isAuthenticated: true, serverBase: 'https://prueba.local',
    _sceneRunId: 1, _sceneStopped: false, sys: { settings: { key: name } },
    scene: { get: () => loader },
    fetchWithTokenRetry: async url => ({ ok: true, json: async () =>
      url.includes('call-view') ? { success: true, result: snapshot } : structuredClone(state) }),
    _ensureRelayClient: async () => ({ checkAuth: async () => ({ success: true }), findContract: async () => ({ address: '0xcontract' }) }),
    _leerCasillasDeCadena: async () => ({}),
    _aplicarTutorialDeBD() {}, _aplicarNivelMascota() {}, _updateDogNameLabel() {}, _nivelDesdeExp() {},
    renderInventoryAfterLoad() {}, startWorldTutorial() {}, startShopTutorial() {}, rebuildPlayerInventoryFromState() {},
    _puntoDeLlegadaTienda: () => ({ x: 100, y: 100 }),
    savegg: async () => {
      writes++;
      const serialize = a => a.flatMap((s, id) => s ? [{ id, IDX: s.idx, Manualid: s.idm, objeto: s.id, cantidad: s.count }] : []);
      state.inventory = serialize(scene.STATE.slots); state.chest = serialize(scene.STATE.quickSlots);
    }
  });
  setup(loader, 'LoadingScenegame');
  return { context, loader, state, logs, types,
    setSnapshot(value) { snapshot = value; }, get writes() { return writes; },
    scene(name) { return setup(Object.create(context.window[name].prototype), name); }
  };
}
function invoice(id, item, cantidad = 3) {
  return { id: String(id), manualId: 'compra-' + id, owner: '0xaaa', tipo: types[item], cantidad: String(cantidad), active: true };
}
function saved(id, item, position, cantidad = 3) {
  return { id: position, IDX: id, Manualid: 'compra-' + id, objeto: item, cantidad };
}

test('el cargador reconoce TODOS los tipos canónicos que el backend entrega', () => {
  const f = fixture();
  const missing = Object.entries(types).filter(([id, tipo]) => f.loader._tipoToItemId(tipo) !== id);
  assert.deepEqual(missing, [], 'Tipos que desaparecen al salir de la tienda');
});

test('compras anteriores y nuevas sobreviven tienda → cargador → mapa → tienda → mina → Lands', async () => {
  const f = fixture();
  const items = ['Semillax', 'Semillax1', 'Semillax2', 'Semillax3', 'Semillax4', 'hacha_de_madera', 'parcela'];
  f.state.inventory = items.map((item, i) => saved(i + 10, item, i + 4));
  f.state.chest = [saved(99, 'pico_de_hierro', 2, 1)];
  f.setSnapshot([...items.map((item, i) => invoice(i + 10, item)), invoice(99, 'pico_de_hierro', 1)]);
  await f.loader.loadPlayerData();
  await f.loader.syncInventoryWithBlockchain();
  for (const name of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene', 'InteriorScene', 'tiendajuego', 'GameScene']) {
    const scene = f.scene(name);
    // Usar los mismos catálogos que crean las escenas reales.
    if (typeof scene._definirObjetos === 'function') scene._definirObjetos();
    else scene.ItemDefinitions = f.loader.ItemDefinitions;
    await scene.loadPlayerData();
    if (['MinaScene', 'LandsScene', 'InteriorScene'].includes(name)) await scene._sincronizarInventarioConLaCadena();
    for (let i = 0; i < items.length; i++) {
      assert.equal(scene.STATE.slots[i + 4]?.id, items[i], name + ': compra ' + items[i]);
      assert.equal(scene.STATE.slots[i + 4]?.count, 3);
    }
    assert.equal(scene.STATE.quickSlots[2]?.idx, 99, name + ': cofre');
    assert.equal(scene._inventoryLoadedAt, f.state.inventoryLoadedAt);
    await scene.savegg();
  }
});

test('una respuesta ilegible de la cadena no vacía ni guarda la mochila', async () => {
  const f = fixture(); f.state.inventory = [saved(10, 'Semillax', 4)];
  f.setSnapshot({ inesperado: true });
  await f.loader.loadPlayerData(); await f.loader.syncInventoryWithBlockchain();
  assert.equal(f.loader.STATE.slots[4]?.idx, 10);
  assert.equal(f.writes, 0);
});

test('las compras antiguas borradas de Mongo se recuperan desde la cadena sin comprar otra vez', async () => {
  const f = fixture();
  f.setSnapshot(['Semillax', 'Semillax1', 'Semillax2', 'Semillax3', 'Semillax4'].map((item, i) => invoice(i + 10, item, 4)));
  await f.loader.loadPlayerData(); await f.loader.syncInventoryWithBlockchain();
  assert.equal(f.state.inventory.length, 5);
  assert.equal(f.state.inventory.reduce((n, s) => n + s.cantidad, 0), 20);
  const shop = f.scene('tiendajuego'); await shop.loadPlayerData();
  assert.equal(shop.STATE.slots.filter(Boolean).length, 5);
});

for (const format of ['objetos', 'tuplas', 'wrapper', 'facturaSuelta']) {
  test('snapshot ' + format + ' conserva las casillas y cantidades confirmadas', async () => {
    const f = fixture();
    f.state.inventory = [saved(10, 'Semillax', 4, 2), saved(11, 'Semillax1', 8, 7)];
    const a = invoice(10, 'Semillax', 60), b = invoice(11, 'Semillax1', 7);
    const tuple = x => [x.id, x.manualId, x.owner, x.tipo, x.cantidad, x.active, '99'];
    f.setSnapshot(format === 'objetos' ? [a, b] : format === 'tuplas' ? [tuple(a), tuple(b)] :
      format === 'wrapper' ? { result: [a, b] } : a);
    await f.loader.loadPlayerData(); await f.loader.syncInventoryWithBlockchain();
    assert.equal(f.loader.STATE.slots[4]?.count, 60);
    assert.equal(f.loader.STATE.slots[8]?.count, 7);
    assert.equal(f.loader.STATE.slots.filter(Boolean).length, 2);
  });
}

for (const broken of [null, {}, [invoice(10, 'Semillax'), {}],
  [{ ...invoice(10, 'Semillax'), cantidad: 'NaN' }],
  [{ ...invoice(10, 'Semillax'), owner: '0xotro' }]]) {
  test('snapshot inválido se conserva sin guardado destructivo: ' + JSON.stringify(broken), async () => {
    const f = fixture(); f.state.inventory = [saved(10, 'Semillax', 4)]; f.setSnapshot(broken);
    await f.loader.loadPlayerData(); await f.loader.syncInventoryWithBlockchain();
    assert.equal(f.loader.STATE.slots[4]?.count, 3); assert.equal(f.writes, 0);
  });
}

test('las semillas guardadas en cofres de Lands no se duplican en la mochila', async () => {
  const f = fixture(); f.state.inventory = [saved(10, 'Semillax', 4)];
  f.setSnapshot([invoice(10, 'Semillax'), invoice(11, 'Semillax1')]);
  f.loader._leerCasillasDeCadena = async () => { f.loader._facturasEnCofres = new Set([11]); return {}; };
  await f.loader.loadPlayerData(); await f.loader.syncInventoryWithBlockchain();
  assert.equal(f.loader.STATE.slots.filter(Boolean).length, 1);
  assert.equal(f.loader.STATE.slots[4]?.idx, 10);
});

test('si no se pueden leer los cofres no se reintroducen sus objetos ni se vacía la mochila', async () => {
  const f = fixture(); f.state.inventory = [saved(10, 'Semillax', 4)];
  f.setSnapshot([invoice(10, 'Semillax'), invoice(11, 'Semillax1')]);
  f.loader._leerCasillasDeCadena = async () => null;
  await f.loader.loadPlayerData(); await f.loader.syncInventoryWithBlockchain();
  assert.equal(f.loader.STATE.slots.filter(Boolean).length, 1); assert.equal(f.writes, 0);
});

test('una sincronización pendiente no modifica otra entrada de la misma escena', async () => {
  const f = fixture(); f.state.inventory = [saved(10, 'Semillax', 4)]; await f.loader.loadPlayerData();
  let resolve;
  f.loader.fetchWithTokenRetry = async () => ({ ok: true, json: () => new Promise(r => { resolve = r; }) });
  const pending = f.loader.syncInventoryWithBlockchain();
  while (!resolve) await new Promise(r => setImmediate(r));
  f.loader._sceneRunId++; f.loader.STATE.slots[4].count = 8;
  resolve({ success: true, result: [] }); await pending;
  assert.equal(f.loader.STATE.slots[4]?.count, 8); assert.equal(f.writes, 0);
});

for (const name of names) {
  test(name + ': una carga anterior no sobrescribe una compra que acaba de confirmarse', async () => {
    const f = fixture(), scene = name === 'LoadingScenegame' ? f.loader : f.scene(name);
    let resolve;
    scene.fetchWithTokenRetry = async () => ({ ok: true, json: () => new Promise(r => { resolve = r; }) });
    const pending = scene.loadPlayerData();
    while (!resolve) await new Promise(r => setImmediate(r));
    scene.STATE = { slots: Array(40).fill(null), quickSlots: Array(7).fill(null) };
    scene.STATE.slots[4] = { id: 'Semillax', idx: 10, idm: 'compra-10', count: 3 };
    scene._inventoryLoadedAt = '2026-10-11T02:00:01.123Z';
    resolve(f.state); await pending;
    assert.equal(scene.STATE.slots[4]?.count, 3);
    assert.equal(scene._inventoryLoadedAt, '2026-10-11T02:00:01.123Z');
  });
}

for (const name of names.filter(n => n !== 'LoadingScenegame')) {
  test(name + ': las semillas se pintan antes de recibir los usos de herramientas', async () => {
    const f = fixture(), scene = f.scene(name);
    scene.ItemDefinitions = f.loader.ItemDefinitions;
    scene.STATE = { slots: [{ id: 'Semillax', idx: 10, count: 3 }, { id: 'hacha_de_madera', idx: 20, count: 1 }], quickSlots: [] };
    scene.events = new (require('node:events').EventEmitter)();
    let resolve, paints = 0;
    scene.renderAllSlots = () => { paints++; };
    scene.renderSlot = () => {};
    scene.fetchWithTokenRetry = async () => new Promise(r => { resolve = r; });
    const pending = f.context.window[name].prototype.renderInventoryAfterLoad.call(scene);
    assert.equal(paints, 1, 'Dibujo inmediato aunque el servidor aún no conteste');
    resolve({ json: async () => ({ uses: { 20: { usos: 4 } } }) }); await pending;
    assert.equal(scene.STATE.slots[1].usosRestantes, 4); assert.equal(paints, 2);
    assert.equal(scene.events.eventNames().length, 0, 'Se liberan los oyentes temporales');
  });
}

test('al salir del mapa se cancela la lectura de usos y no se pinta la siguiente escena', async () => {
  const f = fixture(), scene = f.scene('GameScene'); scene.ItemDefinitions = f.loader.ItemDefinitions;
  scene.STATE = { slots: [{ id: 'hacha_de_madera', idx: 20, count: 1 }], quickSlots: [] };
  scene.events = new (require('node:events').EventEmitter)();
  let resolve, signal, paints = 0;
  scene.renderAllSlots = () => { paints++; }; scene.renderSlot = () => {};
  scene.fetchWithTokenRetry = async (_url, opts) => { signal = opts.signal; return new Promise(r => { resolve = r; }); };
  const pending = f.context.window.GameScene.prototype.renderInventoryAfterLoad.call(scene);
  scene._sceneStopped = true; scene.events.emit('shutdown'); assert.equal(signal.aborted, true);
  resolve({ json: async () => ({ uses: { 20: { usos: 4 } } }) }); await pending;
  assert.equal(paints, 1); assert.equal(scene.STATE.slots[0].usosRestantes, undefined);
  assert.equal(scene.events.eventNames().length, 0);
});

module.exports = { fixture, invoice, saved, types };


test('all 240 expanded crop invoices survive every map and chest layout round trip', async () => {
  const f=fixture(), ids=Object.keys(catalog.items);
  for(let start=0;start<ids.length;start+=12){
    const batch=ids.slice(start,start+12), inv=batch.slice(0,8), chest=batch.slice(8);
    f.state.inventory=inv.map((id,i)=>saved(start+i+100,id,i,2));
    f.state.chest=chest.map((id,i)=>saved(start+i+108,id,i,1));
    f.setSnapshot(batch.map((id,i)=>invoice(start+i+100,id,i<8?2:1)));
    await f.loader.loadPlayerData();await f.loader.syncInventoryWithBlockchain();
    for(const name of ['GameScene','tiendajuego','MinaScene','LandsScene','InteriorScene']){
      const scene=f.scene(name);if(typeof scene._definirObjetos==='function')scene._definirObjetos();else scene.ItemDefinitions=f.loader.ItemDefinitions;
      await scene.loadPlayerData();if(['MinaScene','LandsScene','InteriorScene'].includes(name))await scene._sincronizarInventarioConLaCadena();
      for(let i=0;i<inv.length;i++){assert.equal(scene.STATE.slots[i]?.id,inv[i],name+': '+inv[i]);assert.equal(scene.STATE.slots[i]?.idx,start+i+100);assert.equal(scene.STATE.slots[i]?.count,2);}
      for(let i=0;i<chest.length;i++){assert.equal(scene.STATE.quickSlots[i]?.id,chest[i],name+': chest '+chest[i]);assert.equal(scene.STATE.quickSlots[i]?.idx,start+i+108);assert.equal(scene.STATE.quickSlots[i]?.count,1);}
      await scene.savegg();
    }
  }
});
