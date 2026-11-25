'use strict';
/* LOS BOTES QUE NADIE USA SE HUNDEN (2026-11-12): "los botes que pongan en el agua deben
 * autodestruirse si llevan 30 minutos sin usar". El tramo REAL de server2.js ("EL BOTE")
 * contra un Mongo de verdad (el mongod.exe de la caché de mongodb-memory-server) y mongoose
 * del clon del backend. Se salta si falta alguno (SERVIDOR=ruta, GF_MONGOOSE=ruta, GF_MONGOD=ruta). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const MONGOOSE = process.env.GF_MONGOOSE || path.join(BIN, 'GrasslandBuild/repositories/backend/node_modules/mongoose');
const MONGOD = process.env.GF_MONGOD || path.join(BIN, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.14.exe');
const FALTA = [SERVIDOR, MONGOOSE, MONGOD].filter((p) => !fs.existsSync(p));
const opciones = FALTA.length ? { skip: 'falta ' + FALTA.join(', ') } : {};

function tramo() {
  const txt = fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n');
  const i = txt.indexOf('const BOTE_ZONAS = new Set(');
  const j = txt.indexOf('\n// =============================================================================\n// EL TRADUCTOR DEL CHAT', i);
  assert.ok(i > 0 && j > i, 'no encuentro el tramo de los botes en ' + SERVIDOR);
  return txt.slice(i, j);
}

const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer(); s.unref(); s.on('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

let mongod = null, conn = null, datos = null;
const H = {};                       // lo que el tramo deja suelto: el barrido, el arranque, la conexión
const avisos = [];                  // _avisarZona(zona, evento, datos)
const alDueno = new Map();          // playerName -> [{ e, d }]
const socketsVivos = new Map();     // io.sockets.sockets
let B = null;                       // { Bote, gfBotesHundirSinUso, _boteABordo, BOTE_SIN_USO_MS, _botePublico }

function socketFalso(id, cuenta) {
  const oyentes = {};
  const s = { id, cuenta, authenticatedPlayer: cuenta, playerData: { room: 'game' }, _boteId: null,
    on: (ev, fn) => { oyentes[ev] = fn; }, emit: (e, d) => { (alDueno.get(cuenta) || alDueno.set(cuenta, []).get(cuenta)).push({ e, d }); },
    disparar: (ev, d) => oyentes[ev](d) };
  socketsVivos.set(id, s);
  return s;
}

before(async () => {
  if (FALTA.length) return;
  const mongoose = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-botes-db-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !conn; k++) {
    try { conn = await mongoose.createConnection('mongodb://127.0.0.1:' + puerto + '/gfbotes', { serverSelectionTimeoutMS: 800 }).asPromise(); }
    catch (_) { conn = null; await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(conn, 'no arrancó el mongod de prueba');

  const filas = { game: {} };
  const falso = {
    mongoose: { Schema: mongoose.Schema, model: (...a) => conn.model(...a),
      connection: { get readyState() { return conn.readyState; }, once: (ev, fn) => { if (ev === 'open') H.abrir = fn; } } },
    app: { get() {}, post() {} },
    io: { on: (ev, fn) => { if (ev === 'connection') H.conexion = fn; }, to: () => ({ emit() {} }), sockets: { sockets: socketsVivos } },
    setInterval: (fn, ms) => { H.barrido = fn; H.cada = ms; return { unref() {} }; },
    _avisarZona: (zona, e, d) => avisos.push({ zona, e, d }),
    socketsDeJugador: (n) => [...socketsVivos.values()].filter((s) => s.authenticatedPlayer === n),
    frenado: () => false, cuentaDelSocket: async (s) => s.cuenta, rooms: filas, salaBase: (s) => String(s),
    pescaCercaDelAgua: () => true, GF_PESCA_ZONAS: {}, gfZonaCercaDelAgua: () => true,
    apiLimiter: null, authMiddleware: null, csrfProtection: null, gfExigeNombre: null, jugadorDeLaSesion: null,
    esFantasma: null, responderFantasma: null, relayerWallet: null, _salaYPosicion: null, enColaDelJugador: null,
    contratoItemsServidor: null, facturasLibresDeCadena: null, txRelayer: null, GamePlayer: null,
    quitarUnaDeFacturaEnSlots: null, mintGatherReward: null, ponerFacturaEnSlots: null
  };
  const nombres = Object.keys(falso);
  const codigo = tramo() + '\nreturn { Bote, gfBotesHundirSinUso, _boteABordo, BOTE_SIN_USO_MS, _botePublico };';
  // eslint-disable-next-line no-new-func
  B = new Function(...nombres, codigo)(...nombres.map((k) => falso[k]));
  B.filas = filas;
  await B.Bote.init();
});

after(async () => {
  try { if (conn) await conn.close(); } catch (_) {}
  // mongod suelta sus archivos al SALIR: borrar antes deja 300 MB por ejecución en %TEMP% (Windows).
  if (mongod) { const fuera = new Promise((ok) => { mongod.once('exit', ok); setTimeout(ok, 8000).unref(); }); try { mongod.kill(); } catch (_) {} await fuera; }
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (_) {}
});

const hace = (min) => new Date(Date.now() - min * 60000);

test('el tramo se engancha: barrido cada minuto y 30 minutos sin uso', opciones, () => {
  assert.equal(typeof H.barrido, 'function');
  assert.equal(H.cada, 60000);
  assert.equal(B.BOTE_SIN_USO_MS, 30 * 60000);
  assert.equal(typeof H.abrir, 'function', 'falta lo de los botes viejos sin hora de uso');
});

test('sin nadie a bordo y 31 minutos sin uso: se hunde y se avisa a la zona y al dueño', opciones, async () => {
  const dueno = socketFalso('s-dueno-1', 'ana');
  const viejo = await B.Bote.create({ zona: 'desierto', playerName: 'ana', deNombre: 'Ana', x: 100, y: 200, usadoEn: hace(31) });
  const nuevo = await B.Bote.create({ zona: 'game', playerName: 'beto', deNombre: 'Beto', x: 300, y: 400, usadoEn: hace(5) });
  avisos.length = 0;
  await H.barrido();
  assert.equal(await B.Bote.exists({ _id: viejo._id }), null, 'el de 31 minutos sigue en el agua');
  assert.ok(await B.Bote.exists({ _id: nuevo._id }), 'el de 5 minutos no debía hundirse');
  const q = avisos.find((a) => a.e === 'bote:quitado');
  assert.ok(q, 'no se avisó a la zona');
  assert.equal(q.zona, 'desierto');
  assert.deepEqual(q.d, { id: String(viejo._id), por: '', motivo: 'sin_uso', x: 100, y: 200 });
  const h = (alDueno.get('ana') || []).find((m) => m.e === 'bote:hundido');
  assert.ok(h, 'el dueño no se enteró');
  assert.deepEqual(h.d, { id: String(viejo._id), zona: 'desierto', minutos: 30 });
  socketsVivos.delete(dueno.id);
  await B.Bote.deleteMany({});
});

test('con alguien remando no se hunde aunque pasen 30 minutos; si su conexión murió, sí', opciones, async () => {
  const s = socketFalso('s-remero', 'carla');
  B.filas.game[s.id] = { x: 500, y: 460 };
  const b = await B.Bote.create({ zona: 'game', playerName: 'carla', deNombre: 'Carla', x: 500, y: 500, usadoEn: hace(10) });
  H.conexion(s);
  await s.disparar('bote:subir', { id: String(b._id) });
  assert.equal(B._boteABordo.get(String(b._id)), s.id, 'no se subió');
  const subido = await B.Bote.findById(b._id).lean();
  assert.ok(Date.now() - subido.usadoEn.getTime() < 5000, 'subir no renovó la hora de uso');
  // Rema más de media hora.
  await B.Bote.updateOne({ _id: b._id }, { $set: { usadoEn: hace(45) } });
  await H.barrido();
  const sigue = await B.Bote.findById(b._id).lean();
  assert.ok(sigue, 'se hundió con el remero dentro');
  assert.ok(Date.now() - sigue.usadoEn.getTime() < 5000, 'el barrido no renovó la hora de quien rema');
  // Se le cae la conexión sin pasar por el disconnect (el socket ya no existe): ahora sí.
  await B.Bote.updateOne({ _id: b._id }, { $set: { usadoEn: hace(31) } });
  socketsVivos.delete(s.id);
  await H.barrido();
  assert.equal(await B.Bote.exists({ _id: b._id }), null, 'un remero fantasma lo mantenía a flote');
  assert.equal(B._boteABordo.has(String(b._id)), false);
});

test('al bajarse, los 30 minutos empiezan a contar desde ese momento', opciones, async () => {
  const s = socketFalso('s-baja', 'dani');
  B.filas.game[s.id] = { x: 700, y: 660 };
  const b = await B.Bote.create({ zona: 'game', playerName: 'dani', deNombre: 'Dani', x: 700, y: 700, usadoEn: hace(29) });
  H.conexion(s);
  await s.disparar('bote:subir', { id: String(b._id) });
  await B.Bote.updateOne({ _id: b._id }, { $set: { usadoEn: hace(50) } });
  s.disparar('bote:bajar', { x: 720, y: 710 });
  for (let k = 0; k < 40; k++) { const d = await B.Bote.findById(b._id).lean(); if (d && Date.now() - d.usadoEn.getTime() < 5000) break; await new Promise((r) => setTimeout(r, 50)); }
  const d = await B.Bote.findById(b._id).lean();
  assert.ok(d && Date.now() - d.usadoEn.getTime() < 5000, 'bajarse no renovó la hora de uso');
  assert.deepEqual([d.x, d.y], [720, 710]);
  await H.barrido();
  assert.ok(await B.Bote.exists({ _id: b._id }), 'se hundió nada más bajarse');
  const pub = B._botePublico(d);
  assert.equal(pub.hundeEn, d.usadoEn.getTime() + 30 * 60000, 'el cliente no sabe cuándo se hunde');
  socketsVivos.delete(s.id);
  await B.Bote.deleteMany({});
});

test('los botes de antes (sin hora de uso) cuentan desde que arranca el servidor', opciones, async () => {
  const r = await B.Bote.collection.insertOne({ zona: 'game', playerName: 'eva', deNombre: 'Eva', x: 1, y: 2,
    createdAt: hace(600), updatedAt: hace(600) });
  await H.abrir();
  for (let k = 0; k < 40; k++) { const d = await B.Bote.findById(r.insertedId).lean(); if (d && d.usadoEn) break; await new Promise((ok) => setTimeout(ok, 50)); }
  const d = await B.Bote.findById(r.insertedId).lean();
  assert.ok(d.usadoEn && Date.now() - d.usadoEn.getTime() < 5000, 'no se le dio hora de uso');
  await H.barrido();
  assert.ok(await B.Bote.exists({ _id: r.insertedId }), 'se hundió de golpe al desplegar');
  await B.Bote.deleteMany({});
});

test('dos barridos a la vez no se pisan', opciones, async () => {
  await B.Bote.create({ zona: 'mina', playerName: 'fede', deNombre: 'Fede', x: 9, y: 9, usadoEn: hace(40) });
  avisos.length = 0;
  await Promise.all([H.barrido(), H.barrido(), H.barrido()]);
  assert.equal(avisos.filter((a) => a.e === 'bote:quitado').length, 1, 'el mismo bote se hundió varias veces');
  assert.equal(await B.Bote.countDocuments({}), 0);
});
