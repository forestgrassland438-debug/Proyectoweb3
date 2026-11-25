'use strict';
/* RECOGER EL BOTE CON LA PALA (2026-11-25).
 * "Cuando pongo un barco en el agua y quiero tomarlo con la pala me dice que debo
 * acercarme más, y es un bug." Al bajar a tierra ("Land" / G), gf-botes buscaba la
 * orilla libre hasta a 260 px del bote, pero la pala (y volver a subir) solo llega a
 * 220 px: el jugador quedaba en tierra, con agua por medio, sin poder acercarse más.
 *
 * Parte 1, el cliente (gf-botes.js en un vm con una escena de mentira): bajar a tierra
 *   nunca deja el bote fuera del alcance de la pala; si la orilla está más lejos, se
 *   pide remar más cerca. Morir a bordo lejos de la orilla tampoco lo deja varado.
 * Parte 2, el servidor (el tramo REAL "EL BOTE" de server2.js contra un mongod de
 *   verdad, como tools/botes-sin-uso.test.cjs): si no ve al jugador en la zona, lo
 *   dice, en vez de "Walk closer to your boat.".
 *
 *   node --test tools/botes-recoger.test.cjs
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const net = require('node:net');

const BIN = path.resolve(__dirname, '..');
const T = 16;                          // casillas de 16 px, como el agua de la pesca
const ANCHO = 200, ALTO = 100;          // 3200 x 1600 px
const SECO_HASTA = 943;                 // columnas 0..58 secas (x <= 943), 59 orilla, 60..139 agua
const ALCANCE_PALA = 240;               // lo que pide gf-botes para la pala y para subir (el servidor: 260)

/* ───────────────────────────────────────── PARTE 1: EL CLIENTE */

function aguaDelRio() {
  const m = new Uint8Array(ANCHO * ALTO);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) m[y * ANCHO + x] = x === 59 || x === 140 ? 1 : (x >= 60 && x <= 139 ? 2 : 0);
  }
  return { w: ANCHO, h: ALTO, m, tileSize: T };
}

/** gf-botes de verdad sobre una escena de mentira (los tweens acaban al instante). */
function montarEscena(opciones = {}) {
  const avisos = [], llamadas = [], emitidos = [], oyentesSocket = {}, oyentesEscena = {};
  let muerto = false;
  const META = new Set(['targets', 'duration', 'ease', 'delay', 'onComplete', 'onUpdate', 'yoyo', 'repeat']);
  const objeto = () => ({
    x: 0, y: 0, alpha: 1, depth: 0, visible: true, scene: {}, frame: { name: '' },
    setOrigin() { return this; }, setScale() { return this; }, setDepth(d) { this.depth = d; return this; },
    setAlpha(a) { this.alpha = a; return this; }, setVisible(v) { this.visible = v; return this; },
    setFrame(f) { this.frame = { name: f }; return this; }, setFlipX() { return this; }, setSize() { return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; }, destroy() { this.scene = null; }
  });
  const boton = { style: {}, hidden: true, isConnected: true, addEventListener() {}, removeEventListener() {} };
  const documento = { getElementById: (id) => (id === 'gf-bote-btn' && boton.creado ? boton : null),
    createElement: () => { boton.creado = true; return boton; }, body: { appendChild() {} }, activeElement: null };
  const canvas = { contains: () => true };
  const scene = {
    sys: { settings: { key: 'GameScene' }, canvas },
    add: { image: objeto, ellipse: objeto },
    textures: { exists: () => true, get: () => ({ setFilter() {} }) },
    tweens: {
      add(c) {
        for (const o of [].concat(c.targets)) for (const k of Object.keys(c)) {
          if (META.has(k)) continue;
          const v = c[k];
          o[k] = (v && typeof v === 'object' && 'to' in v) ? v.to : v;
        }
        if (c.onComplete) c.onComplete();
        return { stop() {} };
      },
      killTweensOf() {}
    },
    events: {
      on(ev, fn) { (oyentesEscena[ev] = oyentesEscena[ev] || []).push(fn); },
      once(ev, fn) { (oyentesEscena[ev] = oyentesEscena[ev] || []).push(fn); },
      off(ev, fn) { oyentesEscena[ev] = (oyentesEscena[ev] || []).filter((f) => f !== fn); }
    },
    input: { on(ev, fn) { if (ev === 'pointerdown') scene._clic = fn; }, off() {},
      keyboard: { on(ev, fn) { if (ev === 'keydown-G') scene._teclaG = fn; }, off() {} } },
    cameras: { main: { getWorldPoint: (x, y) => ({ x, y }), worldView: { x: 0, y: 0, right: 3200, bottom: 1600 } } },
    time: { now: 1000 },
    map: { widthInPixels: ANCHO * T, heightInPixels: ALTO * T },
    player: { x: 880, y: 800, depth: 800, anims: { isPlaying: false } },
    playerName: 'Ana',
    STATE: { selectedItem: null, slots: [null, null], quickSlots: [] },
    clearSelectedItem() { this.STATE.selectedItem = null; },
    renderAllSlots() {},
    notifications: { show: (t) => avisos.push(String(t)) },
    _chocaConEscenario: () => false,
    __gfPescaAgua: aguaDelRio(),
    socket: { id: 's1', connected: true, on(ev, fn) { oyentesSocket[ev] = fn; }, off() {},
      emit(ev, d) { emitidos.push({ ev, d }); } }
  };
  const enElAgua = [];
  const api = (ruta, cuerpo) => {
    llamadas.push({ ruta, cuerpo });
    if (ruta.indexOf('/api/botes?') === 0) return Promise.resolve({ ok: true, status: 200, datos: { ok: true, lista: enElAgua.slice() } });
    if (ruta === '/api/botes/poner') {
      const bote = { id: 'b1', zona: 'game', x: cuerpo.x, y: cuerpo.y, dueno: 'Ana', deNombre: 'Ana' };
      enElAgua.push(bote);
      return Promise.resolve({ ok: true, status: 200, datos: { ok: true, bote } });
    }
    if (ruta === '/api/botes/recoger') {
      enElAgua.length = 0;
      return Promise.resolve({ ok: true, status: 200, datos: { ok: true, itemId: 'bote', factura: { invoiceId: 5, manualId: 'bote#5', cantidad: 1 } } });
    }
    return Promise.resolve({ ok: false, status: 404, datos: null });
  };
  const ctx = { console: { log() {}, warn() {}, error: console.error }, Math, Date, JSON, Promise, Number, Object, Array,
    setTimeout, clearTimeout, document: documento, Phaser: { Textures: { FilterMode: { NEAREST: 0 } } },
    GFMascota: { api }, GFMuerte: { muerto: () => muerto } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-botes.js'), 'utf8'), ctx);
  const st = ctx.GFBotes.montar(scene);
  assert.ok(st, 'gf-botes no se montó en la escena de mentira');
  const fotograma = () => { scene.time.now += 16; (oyentesEscena.postupdate || []).forEach((f) => f(scene.time.now)); };
  const clic = (x, y) => scene._clic({ button: 0, x, y, event: { target: canvas } });
  const esperar = () => new Promise((r) => setImmediate(r));
  return { scene, st, avisos, llamadas, emitidos, oyentesSocket, fotograma, clic, esperar,
    morir() { muerto = true; }, revivir() { muerto = false; } };
}

/** Pone el bote, se sube y rema hasta que la quilla queda a `lejos` px de la tierra seca. */
async function remarHasta(m, lejos) {
  const { scene, st } = m;
  await m.esperar();
  scene.STATE.selectedItem = { id: 'bote', isGhost: true };
  m.clic(1030, 840);                       // a 150 px de los pies (880, 840), en agua entera
  await m.esperar(); await m.esperar();
  assert.ok(st.botes.b1, 'no se puso el bote: ' + m.avisos.join(' | '));
  scene._teclaG({});                       // subir
  assert.ok(m.emitidos.some((e) => e.ev === 'bote:subir'), 'G no pidió subir: ' + m.avisos.join(' | '));
  m.oyentesSocket['bote:estado']({ id: 'b1', zona: 'game', x: st.botes.b1.x, y: st.botes.b1.y, dueno: 'Ana', aBordo: 's1' });
  assert.equal(st.aBordo, 'b1', 'no se subió');
  m.fotograma();
  remar(m, SECO_HASTA + lejos);
  const e = st.botes.b1;
  assert.ok(Math.abs(e.x - (SECO_HASTA + lejos)) < 2, 'la quilla no llegó a ' + (SECO_HASTA + lejos) + ' (va en ' + e.x + ')');
  return e;
}
/** Rema en horizontal hasta que la quilla esté en x = `objetivo` (con el choque de a bordo de verdad). */
function remar(m, objetivo, alPaso) {
  const { scene } = m;
  for (let k = 0; k < 600 && Math.abs(scene.player.x - objetivo) > 0.5; k++) {
    const px = scene.player.x, py = scene.player.y;
    const paso = Math.sign(objetivo - px) * Math.min(4, Math.abs(objetivo - px));   // lo que se anda en un fotograma
    scene.player.x = px + paso / 0.62;
    if (scene._resolverChoqueJugador) scene._resolverChoqueJugador.call(scene, px, py, 15);   // a bordo: casco y 62 %
    m.fotograma();
    if (alPaso && alPaso() === false) return;
    if (scene.player.x === px) break;                              // el casco ya no cabe más allá
  }
}
/** Lo que el servidor contesta tras `bote:bajar`: el bote queda libre. */
function servidorDejaLibre(m) {
  const e = m.st.botes.b1;
  m.oyentesSocket['bote:estado']({ id: 'b1', zona: 'game', x: Math.round(e.x), y: Math.round(e.y), dueno: 'Ana', aBordo: null });
}

const distanciaPala = (m, e) => Math.hypot(e.x - m.scene.player.x, e.y - (m.scene.player.y + 40));

test('tras bajar a tierra, la pala alcanza el bote sin tener que andar (o se pide remar más cerca)', async () => {
  for (const lejos of [80, 150, 190, 215, 237, 250]) {
    const m = montarEscena();
    const e = await remarHasta(m, lejos);
    m.avisos.length = 0;
    m.scene._teclaG({});                   // "Land"
    m.fotograma();
    if (m.st.aBordo) {
      assert.ok(m.avisos.some((t) => /Row closer to the shore/.test(t)),
        `a ${lejos} px de la orilla ni bajó ni pidió acercarse: ${m.avisos.join(' | ')}`);
      continue;
    }
    servidorDejaLibre(m);
    const d = distanciaPala(m, e);
    m.avisos.length = 0;
    m.scene.STATE.selectedItem = { id: 'pala_construccion', isGhost: true };
    m.clic(e.x, e.y - 10);                 // sobre el dibujo del bote
    await m.esperar();
    assert.ok(!m.avisos.some((t) => /Walk closer to your boat/.test(t)),
      `a ${lejos} px de la orilla bajó a ${Math.round(d)} px del bote y la pala dice "acércate"`);
    assert.ok(m.llamadas.some((l) => l.ruta === '/api/botes/recoger'), `a ${lejos} px: la pala no pidió recoger`);
  }
});

test('desde la orilla donde se bajó también se puede volver a subir', async () => {
  let bajadas = 0;
  for (const lejos of [150, 190, 237, 250]) {
    const m = montarEscena();
    await remarHasta(m, lejos);
    m.scene._teclaG({});
    m.fotograma();
    if (m.st.aBordo) continue;             // no bajó: ya lo cubre la prueba de arriba
    bajadas++;
    servidorDejaLibre(m);
    m.emitidos.length = 0; m.avisos.length = 0;
    m.scene._teclaG({});                   // volver a subir con G
    assert.ok(m.emitidos.some((x) => x.ev === 'bote:subir'), `a ${lejos} px no deja volver a subir: ` + m.avisos.join(' | '));
  }
  assert.ok(bajadas > 0, 'no bajó en ninguna');
});

test('morir a bordo lejos de la orilla no deja el bote varado donde la pala no llega', async () => {
  const m = montarEscena();
  const e = await remarHasta(m, 250);
  m.avisos.length = 0;
  m.morir();
  for (let k = 0; k < 5; k++) m.fotograma();
  if (m.st.aBordo) {
    // Sigue a bordo, de fantasma: rema hacia la orilla y entonces baja él solo.
    assert.ok(m.avisos.length <= 1, 'un aviso por fotograma: ' + m.avisos.length);
    remar(m, SECO_HASTA + 100, () => !!m.st.aBordo);
    assert.equal(m.st.aBordo, null, 'de fantasma, cerca de la orilla, no bajó');
  }
  // Fuera del bote, de pie en tierra firme: nunca "bajado" en medio del agua (de ahí la
  // escena lo saca empujándolo a la tierra más cercana, lejos del bote).
  const pies = m.scene.player.y + 40, col = Math.floor(m.scene.player.x / T), fil = Math.floor(pies / T);
  assert.equal(m.scene.__gfPescaAgua.m[fil * ANCHO + col], 0,
    `al morir quedó de pie en el agua (${Math.round(m.scene.player.x)}, ${Math.round(pies)}), fuera del bote`);
  assert.ok(distanciaPala(m, e) <= ALCANCE_PALA,
    `al morir quedó a ${Math.round(distanciaPala(m, e))} px de su bote: la pala no llega (${ALCANCE_PALA})`);
});

/* ───────────────────────────────────────── PARTE 2: EL SERVIDOR */

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const MONGOOSE = process.env.GF_MONGOOSE || path.join(BIN, 'GrasslandBuild/repositories/backend/node_modules/mongoose');
const MONGOD = process.env.GF_MONGOD || path.join(BIN, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.14.exe');
const FALTA = [SERVIDOR, MONGOOSE, MONGOD].filter((p) => !fs.existsSync(p));
const conServidor = FALTA.length ? { skip: 'falta ' + FALTA.join(', ') } : {};

function trozo(txt, desde, hasta) {
  const i = txt.indexOf(desde);
  assert.ok(i >= 0 && txt.indexOf(desde, i + 1) < 0, 'ancla perdida o repetida: ' + desde.slice(0, 60));
  const j = txt.indexOf(hasta, i);
  assert.ok(j > i, 'sin final para: ' + desde.slice(0, 60));
  return txt.slice(i, j + hasta.length);
}
const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer(); s.unref(); s.on('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

let mongod = null, conn = null, datos = null, S = null;
const rutas = {};
const sockets = [];
const rooms = {};

before(async () => {
  if (FALTA.length) return;
  const mongoose = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-botes-pala-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !conn; k++) {
    try { conn = await mongoose.createConnection('mongodb://127.0.0.1:' + puerto + '/gfbotespala', { serverSelectionTimeoutMS: 800 }).asPromise(); }
    catch (_) { conn = null; await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(conn, 'no arrancó el mongod de prueba');
  const txt = fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n');
  const codigo = trozo(txt, 'function salaBase(sala) {', '\n}\n') +
    trozo(txt, 'function _salaYPosicion(playerName) {', '\n}\n') +
    trozo(txt, 'const BOTE_ZONAS = new Set(', '\n// =============================================================================\n// EL TRADUCTOR DEL CHAT').replace(/\n\/\/ =+\n\/\/ EL TRADUCTOR DEL CHAT$/, '') +
    '\nreturn { Bote, _boteABordo, BOTE_ALCANCE };';
  const falso = {
    mongoose: { Schema: mongoose.Schema, model: (...a) => conn.model(...a),
      connection: { get readyState() { return conn.readyState; }, once() {} } },
    app: { get() {}, post(ruta, ...resto) { rutas[ruta] = resto[resto.length - 1]; } },
    io: { on() {}, to: () => ({ emit() {} }), sockets: { sockets: new Map() } },
    setInterval: () => ({ unref() {} }),
    _avisarZona() {}, socketsDeJugador: (n) => sockets.filter((s) => s.authenticatedPlayer === n), rooms,
    frenado: () => false, cuentaDelSocket: async (s) => s.authenticatedPlayer,
    pescaCercaDelAgua: () => true, GF_PESCA_ZONAS: {}, gfZonaCercaDelAgua: () => true,
    apiLimiter: null, authMiddleware: null, csrfProtection: null, gfExigeNombre: null,
    jugadorDeLaSesion: async (req) => req.gp, esFantasma: async () => false, responderFantasma: (res) => res.status(403).json({ error: 'fantasma' }),
    relayerWallet: {}, enColaDelJugador: async (_k, fn) => fn(),
    contratoItemsServidor: () => null, facturasLibresDeCadena: async () => [], txRelayer: async () => null,
    GamePlayer: { findOne: () => ({ select: () => ({ lean: async () => ({ inventory: [{ objeto: 'pala_construccion', cantidad: 1 }], chest: [] }) }),
      then: (ok) => ok(null) }) },
    quitarUnaDeFacturaEnSlots: null, mintGatherReward: async () => ({ id: 91, manualId: 'bote#91', cantidad: 1 }), ponerFacturaEnSlots: null
  };
  const nombres = Object.keys(falso);
  // eslint-disable-next-line no-new-func
  S = new Function(...nombres, codigo)(...nombres.map((k) => falso[k]));
  await S.Bote.init();
});

after(async () => {
  try { if (conn) await conn.close(); } catch (_) {}
  if (mongod) { const fuera = new Promise((ok) => { mongod.once('exit', ok); setTimeout(ok, 8000).unref(); }); try { mongod.kill(); } catch (_) {} await fuera; }
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (_) {}
});

async function pedirRecoger(playerName, id) {
  const res = { codigo: 200, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  await rutas['/api/botes/recoger']({ gp: { playerName, address: '0xabc', Username: playerName }, body: { id } }, res);
  return res;
}

test('servidor: con el jugador junto a su bote, la pala lo recoge', conServidor, async () => {
  sockets.length = 0;
  const b = await S.Bote.create({ zona: 'game', playerName: 'luz', deNombre: 'Luz', x: 1100, y: 840 });
  sockets.push({ id: 'sl', authenticatedPlayer: 'luz', playerData: { room: 'game#c2' } });
  rooms['game#c2'] = { sl: { x: 1000, y: 800, lastUpdate: Date.now() } };
  const r = await pedirRecoger('luz', String(b._id));
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.ok, true);
});

test('servidor: lejos de verdad sigue siendo "acércate"', conServidor, async () => {
  sockets.length = 0;
  const b = await S.Bote.create({ zona: 'game', playerName: 'mar', deNombre: 'Mar', x: 1500, y: 840 });
  sockets.push({ id: 'sm', authenticatedPlayer: 'mar', playerData: { room: 'game#c1' } });
  rooms['game#c1'] = { sm: { x: 1000, y: 800, lastUpdate: Date.now() } };
  const r = await pedirRecoger('mar', String(b._id));
  assert.equal(r.codigo, 400);
  assert.equal(r.cuerpo.error, 'lejos');
});

test('servidor: si no ve al jugador en la zona del bote, lo dice (no "acércate")', conServidor, async () => {
  sockets.length = 0;
  const b = await S.Bote.create({ zona: 'game', playerName: 'sol', deNombre: 'Sol', x: 1100, y: 840 });
  // Recién reconectado: el socket aún no ha entrado en ninguna sala.
  sockets.push({ id: 'ss', authenticatedPlayer: 'sol', playerData: {} });
  let r = await pedirRecoger('sol', String(b._id));
  assert.ok(r.codigo >= 400, 'contestó ' + r.codigo);
  assert.equal(r.cuerpo.error, 'fuera_de_zona', 'dice ' + JSON.stringify(r.cuerpo));
  // En otra zona (otra pestaña en el desierto, la última que se movió).
  sockets.length = 0;
  sockets.push({ id: 'ss2', authenticatedPlayer: 'sol', playerData: { room: 'desierto#c1' } });
  rooms['desierto#c1'] = { ss2: { x: 1000, y: 800, lastUpdate: Date.now() } };
  r = await pedirRecoger('sol', String(b._id));
  assert.equal(r.cuerpo.error, 'fuera_de_zona', 'dice ' + JSON.stringify(r.cuerpo));
  assert.ok(await S.Bote.exists({ _id: b._id }), 'se lo quitó del agua sin recogerlo');
});
