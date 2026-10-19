'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

for (const name of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene', 'InteriorScene', 'LoadingScenegame']) {
  test(`${name} carga objetos y la revisión del servidor sin depender del reloj local`, async () => {
    const errors = [];
    const context = { window: {}, document: {}, console: { log() {}, warn() {}, error(...args) { errors.push(args); } },
      Phaser: { Scene: class {}, Math: { Clamp: (x, a, b) => Math.min(b, Math.max(a, x)) } },
      setTimeout, clearTimeout, setInterval, clearInterval, AbortController };
    vm.createContext(context);
    for (const script of ['GameScene', 'tiendajuego', 'MinaScene', 'LandsScene', 'InteriorScene', 'LoadingScenegame']) {
      vm.runInContext(fs.readFileSync(path.join(root, 'Scenes', script + '.js'), 'utf8'), context);
    }
    const data = { inventoryLoadedAt: '2026-10-11T02:00:00.123Z', moneda: 0, moneda_plata: 0,
      inventory: [{ id: 8, IDX: 42, Manualid: 'semilla', objeto: 'Semillax', cantidad: 3 }],
      chest: [{ id: 1, IDX: 55, Manualid: 'hacha', objeto: 'Hacha', cantidad: 1 }] };
    const scene = Object.create(context.window[name].prototype);
    Object.assign(scene, { playerName: 'Ana', isAuthenticated: true, serverBase: 'https://prueba.local',
      _sceneRunId: 1, _sceneStopped: false, sys: { settings: { key: name } },
      fetchWithTokenRetry: async () => ({ ok: true, json: async () => data }),
      _aplicarTutorialDeBD() {}, _aplicarNivelMascota() {}, _updateDogNameLabel() {}, _nivelDesdeExp() {},
      renderInventoryAfterLoad() {}, startWorldTutorial() {}, startShopTutorial() {},
      rebuildPlayerInventoryFromState() {}, _puntoDeLlegadaTienda: () => ({ x: 100, y: 100 }) });
    const result = await scene.loadPlayerData();
    assert.deepEqual(errors, []);
    assert.equal(result, data);
    assert.equal(scene._inventoryLoadedAt, data.inventoryLoadedAt);
    assert.equal(scene.STATE.slots[8].idx, 42);
    assert.equal(scene.STATE.slots[8].count, 3);
    assert.equal(scene.STATE.quickSlots[1].idx, 55);
    if (name !== 'LoadingScenegame') assert.equal(scene._inventarioCargado, true);
  });
}
