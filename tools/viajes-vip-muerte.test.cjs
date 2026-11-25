'use strict';
/* (2026-11-23) LOS SIETE DEL ESTE, SOLO CON VIP; Y MUERTO NO SE VIAJA (A PIE, SÍ)
 *
 *   · "los 7 mapas que pusiste deben ser solo para vip";
 *   · "cuando un personaje muere no puede viajar a otros mapas por el botón map
 *     ni teletransportarse a un usuario, pero que no le impidas moverse entre
 *     mapas si camina por su cuenta".
 *
 * Se ejecuta el código REAL (server2.js: la ruta del mapa del mundo, el oyente
 * de 'friends:ir' y el de 'joinRoom'; y gf-zonas, gf-lands, gf-mapa-mundo,
 * gf-amigos, gf-vip, ZonasScenes y GameScene en el navegador) con piezas de
 * mentira alrededor. Lo esperado va escrito a mano.
 *
 *   node --test tools/viajes-vip-muerte.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const leer = (f) => fs.readFileSync(path.join(BIN, f), 'utf8').replace(/\r\n/g, '\n');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const copia = (o) => JSON.parse(JSON.stringify(o === undefined ? null : o));

// Los siete del este y sus sitios del mapa del mundo (escrito a mano).
const REINOS = ['puerto', 'pantano', 'aldor', 'colinas', 'selva', 'volcan', 'hongos'];
const VIP_EN_EL_MAPA = ['puerto', 'pantano', 'aldor', 'colinas', 'selva', 'volcan', 'hongos',
  'puerto_tienda', 'puerto_faro', 'puerto_lonja', 'puerto_parque', 'pantano_santuario', 'aldor_plaza',
  'aldor_laguna', 'colinas_granja', 'selva_aldea', 'volcan_termas', 'hongos_runas', 'isla'].sort();

function trozo(fuente, inicio, fin) {
  const i = fuente.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio);
  const j = fuente.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return fuente.slice(i, j + fin.length);
}
/** Una función de server2.js, de `function nombre(` a la llave que la cierra. */
function funcion(nombre) {
  const m = new RegExp('\\n(async )?function ' + nombre + '\\(').exec(SRV);
  assert.ok(m, 'no está la función ' + nombre + ' en server2.js');
  const i = m.index + 1;
  return SRV.slice(i, SRV.indexOf('\n}\n', i) + 2);
}
/** Un oyente de socket, del `socket.on(` al `});` que lo cierra (dos espacios). */
function oyente(ancla) { return trozo(SRV, ancla, '\n  });\n'); }

// ═════════════════════════════════════════════════════════════ EL SERVIDOR

test('el mapa del mundo: los siete del este y sus sitios piden VIP (y la isla, como siempre)', () => {
  const MAPA = JSON.parse(leer('Game/MAPAS/mundo/mapa_mundo.json'));
  assert.deepEqual(MAPA.destinos.filter((d) => d.vip).map((d) => d.id).sort(), VIP_EN_EL_MAPA);
  for (const d of MAPA.destinos) {
    if (REINOS.includes(d.sala)) assert.equal(d.vip, true, d.id + ' está en un reino del este');
  }
  for (const id of ['pueblo', 'salvaje', 'pradera', 'caverna', 'pueblo_tienda', 'pueblo_mina']) {
    assert.ok(!MAPA.destinos.find((d) => d.id === id).vip, id + ' no pide VIP');
  }
});

/** La ruta del mapa del mundo, entera, con piezas de mentira (como tools/mapa-mundo.test.cjs). */
function rutaMapa(op = {}) {
  const rutas = {};
  const app = { get: (r, ...h) => { rutas['GET ' + r] = h[h.length - 1]; }, post: (r, ...h) => { rutas['POST ' + r] = h[h.length - 1]; } };
  const bolsa = { Ana: op.bronce ?? 99999 }, tesoro = [];
  const ctx = vm.createContext({
    console: { log() {}, error() {}, warn() {} }, Math, Number, String, Date, Map, Object, JSON, Promise, Array,
    setInterval: () => ({ unref() {} }), crypto: { randomBytes: () => ({ toString: () => 'billete' + Math.random().toString(16).slice(2) }) },
    app, apiLimiter: 1, authMiddleware: 1, csrfProtection: 1,
    jugadorDeLaSesion: async () => ({ playerName: 'Ana', address: '0xA', isGhost: !!op.fantasma }),
    enColaDelJugador: async (_k, fn) => fn(),
    socketsDeJugador: () => [{ id: 's1', playerData: { room: 'game#c1' } }],
    rooms: { 'game#c1': { s1: { x: 2097, y: 2359 } } },
    gfNivelDeJugador: async () => op.nivel ?? 30, gfTieneVipPorDireccion: async () => !!op.vip,
    PlayerStats: { findOne: () => ({ select: () => ({ lean: async () => ({ bronce: bolsa.Ana }) }) }) },
    gfCobrarConCambio: async (n, c) => (bolsa[n] >= c ? (bolsa[n] -= c, { bronce: bolsa[n] }) : null),
    gfValorEnBronce: (st) => Math.floor(Number(st && st.bronce) || 0),
    gfDevolverStat: async (n, s, c) => ((bolsa[n] += c), { bronce: bolsa[n] }),
    buildStatsResponse: (d) => ({ bronce: d.bronce }),
    gfViajeReparto: (b) => ({ circular: 7, juego: b - 7 }),
    gfViajeAlTesoro: async (b, quien, detalle) => { tesoro.push([b, quien, detalle]); },
    gfViajeDevolverTesoro: async () => {}
  });
  const codigo = [funcion('salaBase'), trozo(SRV, 'const GF_NIVEL_MAPA = ', '\n}\n'), funcion('responderFantasma'),
                  trozo(SRV, 'const GF_MAPA_MUNDO = ', "' destinos)');\n")].join('\n');
  vm.runInContext(codigo, ctx);
  const llamar = async (clave, body) => {
    let st = 200, out;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; } };
    await rutas[clave]({ body }, res);
    return { st, out: copia(out) };
  };
  return { llamar, bolsa, tesoro };
}

test('mapa del mundo (M): muerto no se paga ni se viaja', { skip: !HAY }, async () => {
  const r = rutaMapa({ fantasma: true, bronce: 5000 });
  const v = await r.llamar('POST /api/viaje/mapa', { destino: 'salvaje' });
  assert.equal(v.st, 423);
  assert.equal(v.out.error, 'fantasma');
  assert.equal(r.bolsa.Ana, 5000, 'no se cobra nada');
  assert.equal(r.tesoro.length, 0, 'y no se apunta nada al tesoro');
});

test('mapa del mundo (M): a los siete del este solo con VIP', { skip: !HAY }, async () => {
  const sin = rutaMapa({ nivel: 30, vip: false, bronce: 99999 });
  const g = await sin.llamar('GET /api/viaje/mapa');
  for (const id of ['puerto', 'aldor', 'hongos', 'puerto_tienda', 'selva_aldea']) assert.equal(g.out.destinos[id].bloqueo, 'vip', id);
  assert.equal(g.out.destinos.pradera.bloqueo, null, 'la pradera no pide VIP');
  const no = await sin.llamar('POST /api/viaje/mapa', { destino: 'puerto', precio: g.out.destinos.puerto.precio });
  assert.equal(no.st, 403);
  assert.equal(no.out.error, 'vip_required');
  assert.equal(sin.bolsa.Ana, 99999, 'sin VIP no se cobra');

  const con = rutaMapa({ nivel: 30, vip: true, bronce: 99999 });
  const g2 = await con.llamar('GET /api/viaje/mapa');
  assert.equal(g2.out.destinos.puerto.bloqueo, null);
  const si = await con.llamar('POST /api/viaje/mapa', { destino: 'puerto', precio: g2.out.destinos.puerto.precio });
  assert.equal(si.st, 200);
  assert.equal(si.out.destino.mundo, 13);
});

/** El oyente de 'friends:ir' con un socket y una base de datos de mentira. Bob es el amigo. */
function viajeConAmigo(op = {}) {
  const emitidos = [], cobros = [];
  const salaBob = op.salaBob || 'game#c1';
  const socket = { id: 's1', playerData: { canal: 1, room: 'game#c1' }, authenticatedAddress: '0xana', handlers: {},
                   on(ev, fn) { this.handlers[ev] = fn; }, emit(ev, d) { emitidos.push([ev, copia(d)]); } };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Number, String, Object, JSON, Promise, Map, Array, Date,
    socket,
    cuentaDelSocket: async () => 'Ana', frenado: () => false,
    socketsDeJugador: (n) => (n === 'Bob' ? [{ id: 'b1', playerData: { room: salaBob, canal: 1 } }] : []),
    rooms: { [salaBob]: { b1: { x: 300, y: 400, lastUpdate: 5 } } },
    fichasDe: async (l) => new Map(l.map((n) => [n, { username: n }])),
    GamePlayer: { findOne: (q) => ({ select: () => ({ lean: async () => ({ playerName: q.playerName, address: '0x' + String(q.playerName).toLowerCase(), nivel_exp: 0 }) }) }) },
    gfTieneVipPorDireccion: async (a) => !!(op.vip || {})[a],
    gfNivelDeJugador: async () => op.nivel ?? 30,
    gfPrecioViaje: () => 500,
    PlayerStats: { findOne: () => ({ select: () => ({ lean: async () => ({ oro: 0, plata: 0, bronce: 5000 }) }) }) },
    gfValorEnBronce: (st) => Math.floor(Number(st && st.bronce) || 0),
    gfCobrarConCambio: async (n, c) => { cobros.push([n, c]); return { bronce: 5000 - c }; },
    gfViajeAlTesoro: async () => {},
    buildStatsResponse: (d) => d,
    esFantasma: async (q) => !!(op.fantasmas || {})[q && q.playerName]
  });
  const codigo = [funcion('salaBase'), funcion('islaDeSala'), funcion('zonaDeSala'), trozo(SRV, 'const GF_NIVEL_MAPA = ', '\n}\n'),
                  trozo(SRV, 'const GF_SALAS_REINO = ', ';\n'), funcion('gfSalaEsReino'),
                  '(function (socket) {\n' + oyente("  socket.on('friends:ir', async (data) => {") + '})(socket);'].join('\n');
  vm.runInContext(codigo, ctx);
  const pedir = async (data) => { await socket.handlers['friends:ir'](data); return emitidos[emitidos.length - 1]; };
  return { pedir, emitidos, cobros };
}

test('ir con un amigo: muerto no se viaja y no se cobra (ni pagando)', { skip: !HAY }, async () => {
  const v = viajeConAmigo({ fantasmas: { Ana: true } });
  const r = await v.pedir({ playerName: 'Bob', pagar: true, precio: 500 });
  assert.equal(r[0], 'friends:ir');
  assert.equal(r[1].ok, false);
  assert.equal(r[1].motivo, 'fantasma');
  assert.deepEqual(v.cobros, [], 'no se cobra');
  // Vivo, el mismo viaje se paga (el amigo está en el pueblo: sin VIP vale).
  const vivo = viajeConAmigo({});
  assert.equal((await vivo.pedir({ playerName: 'Bob' }))[1].motivo, 'precio');
  assert.equal((await vivo.pedir({ playerName: 'Bob', pagar: true, precio: 500 }))[1].ok, true);
  assert.deepEqual(vivo.cobros, [['Ana', 500]]);
});

test('ir con un amigo que está en un reino del este: solo con VIP', { skip: !HAY }, async () => {
  const sin = viajeConAmigo({ salaBob: 'puerto#c1' });
  const r = await sin.pedir({ playerName: 'Bob', pagar: true, precio: 500 });
  assert.equal(r[1].ok, false);
  assert.equal(r[1].motivo, 'reino_sin_vip');
  assert.deepEqual(sin.cobros, []);
  const con = viajeConAmigo({ salaBob: 'selva#c1', vip: { '0xana': true } });
  const p = await con.pedir({ playerName: 'Bob' });
  assert.equal(p[1].motivo, 'precio');
  assert.equal(p[1].zona, 'jungle');
  assert.equal((await con.pedir({ playerName: 'Bob', pagar: true, precio: 500 }))[1].ok, true);
  assert.deepEqual(con.cobros, [['Ana', 500]]);
  // El VIP que cuenta es el de quien viaja, no el del amigo.
  const delAmigo = viajeConAmigo({ salaBob: 'selva#c1', vip: { '0xbob': true } });
  assert.equal((await delAmigo.pedir({ playerName: 'Bob' }))[1].motivo, 'reino_sin_vip');
});

/** El oyente de 'joinRoom' entero, con un socket que está en 'game#c1' junto a otro jugador. */
function entrarEnSala(op = {}) {
  const emitidos = [], aLaSala = [];
  const rooms = { 'game#c1': { s1: { id: 's1', x: 10, y: 10 }, s2: { id: 's2', x: 5, y: 5 } } };
  const socket = {
    id: 's1', connected: true, _nameColor: null,
    authenticatedAddress: op.anonimo ? null : '0xana', authenticatedPlayer: op.anonimo ? null : 'Ana',
    playerData: { id: 's1', room: 'game#c1', username: 'Ana', lastScene: 'GameScene', canal: 1 },
    handlers: {}, unidas: [], dejadas: [],
    on(ev, fn) { this.handlers[ev] = fn; },
    emit(ev, d) { emitidos.push([ev, copia(d)]); },
    join(r) { this.unidas.push(r); }, leave(r) { this.dejadas.push(r); },
    to(r) { return { emit: (ev) => aLaSala.push([r, ev]) }; }
  };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Date, Math, Number, String, Object, JSON, Promise, Array, Map, Set,
    socket, rooms, io: { to: (r) => ({ emit: (ev) => aLaSala.push([r, ev]) }) },
    anotarCambioDeSala() {}, livePresenceJoin() {}, purgarFantasmas() {},
    NOMBRE_SOULBOUND_VALIDO: /^personaje\d+$/,
    PlayerAuth: { findOne: () => ({ lean: async () => null }) },
    GamePlayer: { findOne: () => { const d = op.anonimo ? null : { playerName: 'Ana', address: '0xana' }; return { lean: async () => d, select: () => ({ lean: async () => d }) }; } },
    gfNivelDeJugador: async () => op.nivel ?? 30,
    gfTieneVipPorDireccion: async () => !!op.vip
  });
  const codigo = [funcion('salaConCanal'), funcion('salaBase'), funcion('islaDeSala'),
                  trozo(SRV, 'const GF_NIVEL_MAPA = ', '\n}\n'), trozo(SRV, 'const GF_SALAS_REINO = ', ';\n'),
                  funcion('gfSalaEsReino'), funcion('gfAccesoSala'), funcion('gfSalirDeSala'),
                  '(function (socket) {\n' + oyente('  socket.on("joinRoom", async (data) => {') + '})(socket);'].join('\n');
  vm.runInContext(codigo, ctx);
  const entrar = async (room) => { await socket.handlers.joinRoom({ room, username: 'Ana', lastScene: 'X', x: 100, y: 100 }); };
  const rechazo = () => { const e = emitidos.find((x) => x[0] === 'sala:rechazada'); return e ? e[1] : null; };
  return { socket, rooms, emitidos, aLaSala, entrar, rechazo };
}

test('entrar en la sala de un reino sin VIP: no se entra, se sale de la de antes y el cliente se entera', { skip: !HAY }, async () => {
  const s = entrarEnSala({ vip: false, nivel: 30 });
  await s.entrar('puerto');
  assert.equal(s.rechazo().sala, 'puerto');
  assert.equal(s.rechazo().motivo, 'vip');
  assert.deepEqual(s.socket.unidas, [], 'no entra en puerto#c1');
  assert.equal(s.rooms['puerto#c1'], undefined);
  // Sus pasos (con las coordenadas del puerto) ya no llegan a los del pueblo.
  assert.deepEqual(s.socket.dejadas, ['game#c1']);
  assert.equal(s.rooms['game#c1'].s1, undefined);
  assert.ok(s.rooms['game#c1'].s2, 'al otro no se le toca');
  assert.ok(s.aLaSala.some(([r, ev]) => r === 'game#c1' && ev === 'playerLeft'), 'los del pueblo ven que se fue');
  assert.equal(s.socket.playerData.room, null);
});

test('entrar en la sala de un reino: con VIP y nivel, sí; con VIP y poco nivel, no', { skip: !HAY }, async () => {
  const si = entrarEnSala({ vip: true, nivel: 11 });
  await si.entrar('puerto');
  assert.equal(si.rechazo(), null);
  assert.deepEqual(si.socket.unidas, ['puerto#c1']);
  assert.ok(si.rooms['puerto#c1'].s1);
  const bajo = entrarEnSala({ vip: true, nivel: 10 });
  await bajo.entrar('puerto');
  assert.equal(bajo.rechazo().motivo, 'nivel');
  assert.deepEqual(bajo.socket.unidas, []);
});

test('entrar en las demás salas: como antes (el pueblo y el salvaje sin VIP; la isla con VIP; sin sesión, no)', { skip: !HAY }, async () => {
  for (const [sala, op] of [['game', { vip: false, nivel: 1 }], ['salvaje', { vip: false, nivel: 30 }]]) {
    const s = entrarEnSala(op);
    await s.entrar(sala);
    assert.equal(s.rechazo(), null, sala);
    assert.deepEqual(s.socket.unidas, [sala + '#c1'], sala);
  }
  const isla = entrarEnSala({ vip: false });
  await isla.entrar('isla');
  assert.equal(isla.rechazo().motivo, 'vip');
  const anon = entrarEnSala({ anonimo: true });
  await anon.entrar('selva');
  assert.equal(anon.rechazo().motivo, 'auth');
});

// ═════════════════════════════════════════════════════════════ EL CLIENTE

/** Un navegador de mentira: un documento que no pinta nada, relojes a mano y lo que se pida en `extra`. */
function navegador(extra = {}) {
  const relojes = [];
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
                      setAttribute() {}, getAttribute: () => null, appendChild(x) { return x; }, addEventListener() {},
                      removeEventListener() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], contains: () => false });
  const document = { readyState: 'complete', visibilityState: 'visible', addEventListener() {}, removeEventListener() {},
                     getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el,
                     head: el(), body: el() };
  const ctx = Object.assign({
    console: { log() {}, warn() {}, error() {}, info() {} }, Math, Date, JSON, Promise, Object, Array, Number, String, Map, Set, WeakMap,
    document, navigator: {}, location: { search: '', hostname: 'localhost' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn, ms) => { relojes.push({ fn, ms }); return relojes.length; }, clearTimeout: (k) => { if (relojes[k - 1]) relojes[k - 1].fn = null; },
    setInterval: () => 0, clearInterval() {}
  }, extra);
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.cargar = (f) => vm.runInContext(leer(f), ctx, { filename: f });
  /** Ejecuta los relojes pendientes (los que se programen mientras, también). */
  ctx.pasarTiempo = () => { for (let i = 0; i < relojes.length; i++) { const r = relojes[i]; if (r && r.fn) { const f = r.fn; r.fn = null; f(); } } };
  return ctx;
}

/** Una escena de un mapa (lo que GFZonas.viajar toca). */
function escenaDeZona(clave) {
  const inicios = [], avisos = [];
  const sc = {
    scene: { get: () => ({}), start: (k, d) => inicios.push([k, copia(d)]) },
    sys: { settings: { key: clave || 'PuertoScene' }, isActive: () => true },
    events: { once() {}, off() {} }, savegg: () => Promise.resolve(true),
    socket: { connected: true, emit() {} }, player: { anims: { stop() {} } },
    _cancelarArrastre() {}, _ocultarHUD() {}, removeListener() {}, _unbindAllDomClicks() {}, stopMusicSafely() {}, cleanupScene() {},
    Username: 'Ana', playerName: 'Ana', mundo: 13, posicionplayerx: 100, posicionplayery: 100,
    notifications: { show: (t) => avisos.push(String(t)) }
  };
  return { sc, inicios, avisos };
}

test('a pie entre los reinos: sin VIP no se pasa; al pueblo, sí; y muerto se camina igual', async () => {
  const caso = async ({ vip, muerto }, destino) => {
    const pedidos = [];
    const w = navegador({
      GFVip: { exigir: (sc, accion) => { pedidos.push(accion); return vip; } },
      GFNivelMapa: { exigir: () => true },
      GFMuerte: { muerto: () => muerto, bloquear: () => muerto }
    });
    w.cargar('gf-zonas.js');
    const e = escenaDeZona('PuertoScene');
    const fue = await w.GFZonas.viajar(e.sc, destino);
    return { fue, pedidos, inicios: e.inicios };
  };
  const sin = await caso({ vip: false, muerto: false }, 'pantano_desde_puerto');
  assert.equal(sin.fue, false);
  assert.deepEqual(sin.inicios, [], 'no arranca el viaje');
  assert.deepEqual(sin.pedidos, ['reinos'], 'pregunta por el VIP de los reinos');
  const con = await caso({ vip: true, muerto: false }, 'pantano_desde_puerto');
  assert.equal(con.fue, true);
  assert.equal(con.inicios[0][1].targetScene, 'PantanoScene');
  const alPueblo = await caso({ vip: false, muerto: false }, 'pueblo_desde_puerto');
  assert.equal(alPueblo.fue, true, 'volver al pueblo no pide VIP');
  assert.deepEqual(alPueblo.pedidos, []);
  const muertoAPie = await caso({ vip: true, muerto: true }, 'pantano_desde_puerto');
  assert.equal(muertoAPie.fue, true, 'muerto se sigue pudiendo caminar a otro mapa');
  const muertoAlSalvaje = await caso({ vip: false, muerto: true }, 'salvaje_desde_cementerio');
  assert.equal(muertoAlSalvaje.fue, true);
});

test('GFViaje (amigos, mapa, islas): a los mundos 13-19 solo con VIP', () => {
  const caso = (vip, mundo) => {
    const pedidos = [];
    const boton = { style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, querySelector: () => null };
    const w = navegador({ GFVip: { exigir: (sc, accion) => { pedidos.push(accion); return vip; } }, GFNivelMapa: { exigir: () => true } });
    w.document.getElementById = (id) => (id === 'lands-btn' ? boton : null);
    w.cargar('gf-lands.js');
    const e = escenaDeZona('GameScene');
    e.sc.sys.settings.key = 'GameScene';
    w.GFLands.montar(e.sc);
    return { fue: w.GFViaje.viajar({ mundo, x: 2504, y: 2640 }), pedidos };
  };
  const sin = caso(false, 13);
  assert.equal(sin.fue, false);
  assert.deepEqual(sin.pedidos, ['reinos']);
  assert.equal(caso(true, 19).fue, true);
  assert.equal(caso(false, 12).fue, true, 'la pradera no pide VIP');
});

test('el panel del mapa (M): muerto, ni se paga ni se viaja, y se dice por qué', async () => {
  const caso = async (muerto) => {
    const llamadas = [];
    const w = navegador({
      GFMuerte: { muerto: () => muerto },
      GFNivelMapa: { puede: () => true, minimo: () => 0 },
      GFViaje: { viajar: () => true },
      // Con cuerpo es el pago (POST); sin él, el panel refrescando su estado (GET).
      GFMascota: { api: (ruta, cuerpo) => { llamadas.push((cuerpo ? 'POST ' : 'GET ') + ruta + (cuerpo ? ' ' + cuerpo.destino : '')); return Promise.resolve({ ok: false, status: 500, datos: {} }); } }
    });
    const e = escenaDeZona('GameScene');
    e.sc.player = {};
    w.game = { scene: { getScenes: () => [e.sc] } };
    w.cargar('gf-mapa-mundo.js');
    w.GFMapaMundo._interno.viajarA({ id: 'salvaje', mundo: 6, sala: 'salvaje', nombre: 'The Wild Lands', tipo: 'mapa', region: 'salvaje' }, 300);
    await flush();
    return { llamadas, mensaje: w.GFMapaMundo._interno.mensaje() };
  };
  const m = await caso(true);
  assert.deepEqual(m.llamadas, [], 'no se pide el viaje al servidor');
  assert.match(m.mensaje.html, /ghost/i);
  assert.match(m.mensaje.html, /walk/i, 'y se dice que a pie sí');
  assert.deepEqual((await caso(false)).llamadas.filter((l) => l.startsWith('POST')), ['POST /api/viaje/mapa salvaje'], 'vivo, sí se paga');
});

test('el panel de amigos: muerto no se va con nadie ni se visita su isla', () => {
  const caso = (muerto) => {
    const emitidos = [], bloqueos = [];
    const w = navegador({
      GFMuerte: { muerto: () => muerto, bloquear: (sc, accion) => { bloqueos.push(accion); return muerto; } },
      GFViaje: { viajar: () => true, MUNDO_DE_ZONA: {} },
      GFVip: { islaAbierta: () => Promise.resolve(true), exigir: () => true }
    });
    w.globalSocket = { id: 'x', connected: true, on() {}, off() {}, emit: (ev, d) => emitidos.push([ev, copia(d)]) };
    w.cargar('gf-amigos.js');
    w.GFAmigos._interno.irCon({ playerName: 'Bob', username: 'Bob' });
    return { emitidos: emitidos.filter((e) => e[0] === 'friends:ir'), bloqueos };
  };
  const m = caso(true);
  assert.deepEqual(m.emitidos, [], 'muerto no pregunta ni paga');
  assert.deepEqual(m.bloqueos, ['travel']);
  assert.deepEqual(caso(false).emitidos, [['friends:ir', { playerName: 'Bob' }]]);
});

/** gf-vip.js con una API de mentira. `activo`: lo que contesta /api/vip/estado. */
function vipConApi(activo) {
  const viajes = [], avisos = [];
  const e = escenaDeZona('PuertoScene');
  e.sc.notifications.show = (t) => avisos.push(String(t));
  const ahora = Date.now();
  const w = navegador({
    GFMascota: { api: () => Promise.resolve({ ok: true, status: 200, datos: { ok: true, activo, fin: activo ? ahora + 864e5 : 0, ahora } }) },
    GFZonas: { ZONAS: { pueblo_desde_puerto: {} }, viajar: (sc, k) => { viajes.push(k); return Promise.resolve(true); } }
  });
  w.game = { scene: { getScenes: () => [e.sc] } };
  w.cargar('gf-vip.js');
  return { w, sc: e.sc, viajes, avisos };
}

test('dentro de un reino sin VIP (caducó, o se entró con la partida guardada): aviso y al muelle del pueblo', async () => {
  const sin = vipConApi(false);
  sin.w.GFVip.vigilarReino(sin.sc);
  await flush(); sin.w.pasarTiempo(); await flush();
  assert.deepEqual(sin.viajes, ['pueblo_desde_puerto']);
  assert.ok(sin.avisos.some((t) => /VIP/.test(t)), 'se dice por qué');

  const con = vipConApi(true);
  con.w.GFVip.vigilarReino(con.sc);
  await flush(); con.w.pasarTiempo(); await flush();
  assert.deepEqual(con.viajes, [], 'con VIP se queda');

  // Si el servidor ya dijo que no ('sala:rechazada'), manda él aunque aquí se crea que sí.
  const rechazado = vipConApi(true);
  rechazado.w.GFVip.vigilarReino(rechazado.sc, { yaRechazado: true });
  await flush(); rechazado.w.pasarTiempo(); await flush();
  assert.deepEqual(rechazado.viajes, ['pueblo_desde_puerto']);
});

test('ZonaScene: si el servidor rechaza la sala de un reino, vuelve al muelle; en otro mapa no hace nada', () => {
  const vigiladas = [];
  const w = navegador({ GFVip: { vigilarReino: (sc, op) => vigiladas.push([sc.cfg.zona, copia(op)]) } });
  vm.runInContext('class GameScene { constructor(o) { this.key = o && o.key; } }', w);
  w.cargar('Scenes/ZonasScenes.js');
  w.cargar('Scenes/ReinosScenes.js');
  const puerto = vm.runInContext('new PuertoScene()', w);
  puerto._alRechazarSala({ sala: 'puerto', motivo: 'vip' });
  puerto._alRechazarSala({ sala: 'game', motivo: 'vip' });         // otra sala: un aviso viejo
  const pradera = vm.runInContext('new PraderaScene()', w);
  pradera._alRechazarSala({ sala: 'pradera', motivo: 'nivel' });    // no es de los siete
  pradera._alRechazarSala({ sala: 'pradera', motivo: 'vip' });      // ni aunque el motivo sea VIP
  assert.deepEqual(vigiladas, [['puerto', { yaRechazado: true, motivo: 'vip' }]]);
});

test('GameScene: el aviso del servidor (sala:rechazada) llega a la escena activa', () => {
  const GS = leer('Scenes/GameScene.js');
  const cuerpo = trozo(GS, '    setupGlobalSocketEvents(socket) {', '\n      socket._globalEventsSet = true;\n    }\n');
  const oyentes = {}, recibidos = [];
  const socket = { listeners: () => [], on(ev, fn) { oyentes[ev] = fn; }, off() {} };
  const w = navegador();
  w.activeScene = { _alRechazarSala: (d) => recibidos.push(copia(d)) };
  vm.runInContext('var montar = function ' + cuerpo.trim().replace(/^setupGlobalSocketEvents/, ''), w);
  w.montar(socket);
  assert.equal(typeof oyentes['sala:rechazada'], 'function');
  oyentes['sala:rechazada']({ sala: 'puerto', motivo: 'vip' });
  assert.deepEqual(recibidos, [{ sala: 'puerto', motivo: 'vip' }]);
  w.activeScene = {};                                    // una escena sin el método: no rompe
  oyentes['sala:rechazada']({ sala: 'game', motivo: 'nivel' });
});
