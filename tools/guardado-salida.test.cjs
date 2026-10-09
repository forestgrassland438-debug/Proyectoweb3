'use strict';
/* EL ÚLTIMO GUARDADO AL SALIR DE UNA ESCENA LO ESPERA LA PANTALLA DE CARGA.
 *                                                                (2026-10-09)
 * Fallo: "compro, me lo da, y al volver a GameScene no está". Al cerrar la
 * tienda (o el mapa), `flushGuardado` lanza el último /api/save sin esperarlo
 * —el apagado de Phaser no es asíncrono— y la pantalla de carga siguiente pedía
 * /api/load a la vez. Si la carga ganaba, la escena nueva arrancaba con el
 * inventario de antes y su próximo guardado lo dejaba así.
 *
 * Se comprueba con las clases REALES de GameScene y tiendajuego:
 *   1. mientras un guardado está en vuelo, el TxGate lo cuenta (las pantallas
 *      de carga esperan con `whenIdle`), y se suelta al terminar;
 *   2. si se cierra la escena con una tanda esperando, sale UN guardado (el
 *      del cierre) y la tanda no se repite después con la foto vieja.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function cargar() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Phaser: { Scene: class { constructor() {} } },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    location: { hostname: 'game.grasslandforest.com', protocol: 'https:', search: '', href: 'https://game.grasslandforest.com/' },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['tx-gate.js', 'Scenes/GameScene.js', 'Scenes/tiendajuego.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, GameScene: vm.runInContext('GameScene', ctx), tiendajuego: vm.runInContext('tiendajuego', ctx) };
}

/** Una escena con los métodos reales de guardado y un servidor que tarda. */
function escena(Clase, ctx) {
  const e = Object.create(Clase.prototype);
  e._queue = [];
  e._processing = false;
  e._windowMs = 30;
  e.envios = [];
  let soltar = null;
  e._guardarEnServidor = function () {
    // Foto del inventario en el momento de guardar (lo que viajaría).
    this.envios.push(JSON.stringify(this.STATE));
    return new Promise(r => { soltar = () => r(true); });
  };
  e.terminarEnvio = () => { const s = soltar; soltar = null; if (s) s(); };
  e.STATE = { slots: [null], quickSlots: [] };
  return e;
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

for (const nombre of ['GameScene', 'tiendajuego']) {
  test(`${nombre}: un guardado en vuelo cuenta en el TxGate`, async () => {
    const m = cargar();
    const e = escena(m[nombre], m.ctx);
    const gate = m.ctx.GFTxGate;
    assert.equal(gate.pending(), 0);
    const p = e.savegg();
    assert.equal(gate.pending(), 1, 'la pantalla de carga tiene que esperar a este guardado');
    let libre = false;
    gate.whenIdle({ timeout: 5000 }).then(() => { libre = true; });
    await dormir(5);
    assert.equal(libre, false);
    e.terminarEnvio();
    await p;
    await dormir(0);
    assert.equal(gate.pending(), 0);
    assert.equal(libre, true);
  });

  test(`${nombre}: cerrar con una tanda esperando guarda una vez y no repite la foto vieja`, async () => {
    const m = cargar();
    const e = escena(m[nombre], m.ctx);
    e.STATE.slots[0] = { id: 'Semillax', count: 3 };
    e.queuedAction({ type: 'forSpam2' });               // tanda esperando su segundo
    await dormir(5);
    const cierre = e.flushGuardado('cerrar');            // performCleanup
    assert.equal(e.envios.length, 1, 'el cierre guarda en el acto');
    e.terminarEnvio();
    await cierre;
    // Llega la escena siguiente y cambia el inventario (sincroniza, etc.).
    e.STATE.slots[0] = { id: 'Semillax', count: 5 };
    await dormir(80);                                    // pasa la ventana de la tanda
    assert.equal(e.envios.length, 1, 'la tanda vieja no se vuelve a mandar después del cierre');
    assert.equal(e._processing, false);
  });
}
