'use strict';
/* (2026-11-20) "Intento comprar o vender un ítem y sale The server did not answer. Your coins are
 * safe: check your balance before trying again" (junto a "⏳ 1 transaction(s) still finishing").
 *
 * La tienda PAUSA la escena del juego al abrirse (TiendaSistema.open) y la reanuda al cerrarse.
 * GFMascota.api apunta quién juega al salir la petición y lo vuelve a mirar al llegar la respuesta,
 * para no aplicar respuestas de otra cuenta. Pero solo miraba las escenas que CORREN
 * (Phaser getScenes(true) deja fuera las pausadas), así que con la tienda abierta el jugador salía
 * vacío. Si la tienda se cerraba mientras la compra seguía en la cadena, la respuesta volvía con
 * nombre, api() la tiraba como si fuera de otra cuenta (409 sin datos) y la tienda enseñaba el aviso
 * de "el servidor no contestó"… de una compra que el servidor sí había hecho.
 *
 *   node --test tools/tienda-escena-pausada.test.cjs
 *   GF_MASCOTA=<copia> node --test tools/tienda-escena-pausada.test.cjs   (para probar un mutante)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const BIN = path.resolve(__dirname, '..');
const MASCOTA = process.env.GF_MASCOTA || path.join(BIN, 'gf-mascota.js');
const TIENDA = path.join(BIN, 'tienda_sistema.js');

// Los estados de Phaser 3.90 (vendor/phaser.min.js): isActive() es RUNNING, isPaused() PAUSED…
const RUNNING = 5, PAUSED = 6, SLEEPING = 7, SHUTDOWN = 8;
function escena(nombre, status = RUNNING) {
  return {
    serverBase: 'https://api.grasslandforest.com', playerName: nombre,
    sys: {
      settings: { status },
      isActive() { return this.settings.status === RUNNING; },
      isPaused() { return this.settings.status === PAUSED; },
      isSleeping() { return this.settings.status === SLEEPING; }
    }
  };
}
// El mismo filtro que SceneManager.getScenes de Phaser: con isActive (por defecto) solo las RUNNING.
const gestor = (escenas) => ({ getScenes(isActive = true) { return escenas.filter((s) => !isActive || s.sys.isActive()); } });
const respuesta = (datos, status = 200) => ({ ok: status < 400, status, json: async () => datos });
const vaciarCola = () => new Promise((fin) => setImmediate(fin));

function cargar() {
  const peticiones = [];
  const window = { location: { hostname: 'game.grasslandforest.com' } };
  const context = vm.createContext({
    window, document: { cookie: 'csrf-token=abc' }, console: { log() {}, warn() {}, error() {} },
    AbortController, clearTimeout,
    setTimeout(fn, ms) { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
    fetch(url, opts) { return new Promise((resolve, reject) => peticiones.push({ url, opts, resolve, reject })); }
  });
  vm.runInContext(fs.readFileSync(MASCOTA, 'utf8'), context, { filename: 'gf-mascota.js' });
  return { window, context, peticiones };
}

/** Una TiendaSistema con su _operacionEconomicaTienda de verdad y lo demás de pega. */
function tiendaEn(context) {
  const src = fs.readFileSync(TIENDA, 'utf8');
  let metodo = null;
  (function buscar(n) {
    if (metodo || !n || typeof n !== 'object') return;
    if (n.type === 'MethodDefinition' && n.key && n.key.name === '_operacionEconomicaTienda') { metodo = src.slice(n.start, n.end); return; }
    for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(buscar); else if (v && typeof v === 'object') buscar(v);
  })(acorn.parse(src, { ecmaVersion: 'latest' }));
  assert.ok(metodo, '_operacionEconomicaTienda no está en tienda_sistema.js');
  const C = vm.runInContext('(class S {' + metodo + '})', context), s = new C();
  const avisos = [];
  Object.assign(s, {
    dailyLimits: {}, saveDailyLimits() {}, _statsSync: () => null, getItemCurrency: (x) => x.currency,
    _persistConfirmedPurchase: async () => {}, addToHistorial() {}, showTransactionAnimation() {},
    updateMonedaDisplay() {}, _refrescarDisponibles() {}, showNotification: (texto, tipo) => avisos.push({ tipo, texto })
  });
  return { s, avisos };
}

test('api(): la respuesta llega aunque la escena se reanude entre la petición y la respuesta (tienda cerrada a mitad)', async () => {
  const f = cargar(), sc = escena('Ana', PAUSED);
  f.window.game = { scene: gestor([sc]) };
  const p = f.window.GFMascota.api('/api/economia/tienda', { op: 'compra', itemId: 'seed_trigo', cantidad: 1, ref: 'ref_prueba_0001' });
  assert.equal(f.peticiones.length, 1);
  assert.equal(f.peticiones[0].url, 'https://api.grasslandforest.com/api/economia/tienda');
  sc.sys.settings.status = RUNNING; // TiendaSistema.close(): scene.resume
  f.peticiones[0].resolve(respuesta({ ok: true, confirmadas: 1 }));
  const r = await p;
  assert.equal(r.status, 200, 'la respuesta del servidor se tiró como si fuera de otra cuenta');
  assert.equal(r.ok, true);
  assert.equal(r.datos && r.datos.confirmadas, 1);
});

test('api(): tampoco se tira si la tienda se abre (escena en pausa) mientras la petición está en vuelo', async () => {
  const f = cargar(), sc = escena('Ana', RUNNING);
  f.window.game = { scene: gestor([sc]) };
  const p = f.window.GFMascota.api('/api/pet');
  sc.sys.settings.status = PAUSED; // TiendaSistema.open(): scene.pause
  f.peticiones[0].resolve(respuesta({ pet: { health: 80 } }));
  const r = await p;
  assert.equal(r.status, 200);
  assert.equal(r.datos && r.datos.pet && r.datos.pet.health, 80);
});

test('api(): una escena dormida también dice quién juega', async () => {
  const f = cargar(), sc = escena('Ana', SLEEPING);
  f.window.game = { scene: gestor([sc]) };
  const p = f.window.GFMascota.api('/api/pet');
  sc.sys.settings.status = RUNNING;
  f.peticiones[0].resolve(respuesta({ pet: { health: 70 } }));
  const r = await p;
  assert.equal(r.status, 200);
  assert.equal(r.datos && r.datos.pet && r.datos.pet.health, 70);
});

test('api(): al cruzar una puerta (ninguna escena viva al volver) no cuenta como otra cuenta', async () => {
  const f = cargar(), dentro = escena('Ana', RUNNING), escenas = [dentro];
  f.window.game = { scene: gestor(escenas) };
  const p = f.window.GFMascota.api('/api/economia/tienda', { op: 'venta', itemId: 'trigo', cantidad: 2, ref: 'ref_prueba_0002' });
  dentro.sys.settings.status = SHUTDOWN; // tiendajuego se para; la escena de fuera aún no ha arrancado
  f.peticiones[0].resolve(respuesta({ ok: true, confirmadas: 2 }));
  const r = await p;
  assert.equal(r.status, 200);
  assert.equal(r.datos && r.datos.confirmadas, 2);
});

test('api(): sigue sin aplicar la respuesta si al volver juega OTRA cuenta (también con la escena en pausa)', async () => {
  const f = cargar(), escenas = [escena('Ana', PAUSED)];
  f.window.game = { scene: gestor(escenas) };
  const p = f.window.GFMascota.api('/api/economia/tienda', { op: 'compra', itemId: 'seed_trigo', cantidad: 1, ref: 'ref_prueba_0003' });
  escenas[0] = escena('Bob', RUNNING);
  f.peticiones[0].resolve(respuesta({ ok: true, confirmadas: 1 }));
  const r = await p;
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.equal(r.datos, null);

  // Y entre escenas se recuerda quién jugaba: salir sin escena y volver con otra cuenta tampoco vale.
  escenas.length = 0;
  escenas.push(escena('Ana', RUNNING));
  const previa = f.window.GFMascota.api('/api/pet');
  f.peticiones[1].resolve(respuesta({ pet: { health: 100 } }));
  assert.equal((await previa).status, 200);
  escenas.length = 0; // puerta: no hay escena viva
  const q = f.window.GFMascota.api('/api/pet');
  escenas.push(escena('Bob', RUNNING));
  f.peticiones[2].resolve(respuesta({ pet: { health: 55 } }));
  const r2 = await q;
  assert.equal(r2.status, 409);
  assert.equal(r2.datos, null);
});

for (const op of ['compra', 'venta']) {
  test(`tienda (${op}): cerrar la tienda con la operación en marcha no enseña "The server did not answer"`, async () => {
    const f = cargar(), sc = escena('Ana', PAUSED); // la tienda está abierta: escena en pausa
    f.window.game = { scene: gestor([sc]) };
    const { s, avisos } = tiendaEn(f.context);
    const item = { id: 'seed_trigo', name: 'Wheat seeds', buyPrice: 5, sellPrice: 2, currency: 'silver' };
    const p = s._operacionEconomicaTienda(op, item, 1, 'ref_prueba_' + op + '_01');
    await vaciarCola();
    assert.equal(f.peticiones.length, 1);
    assert.equal(JSON.parse(f.peticiones[0].opts.body).precioBronce, op === 'compra' ? 5000 : 2000);
    sc.sys.settings.status = RUNNING; // "⏳ 1 transaction(s) still finishing": el jugador cerró la tienda
    f.peticiones[0].resolve(respuesta({ ok: true, confirmadas: 1, fee: 75, stats: { oro: 0, plata: 3, bronce: 925 } }));
    const d = await p;
    assert.equal(d.confirmadas, 1);
    assert.deepEqual(avisos.filter((a) => a.tipo === 'error').map((a) => a.texto), []);
    assert.ok(avisos.some((a) => a.tipo === 'success' && /payment and delivery confirmed/.test(a.texto)), JSON.stringify(avisos));
    assert.equal(f.peticiones.length, 1, 'una sola petición: no se repitió nada');
  });
}
