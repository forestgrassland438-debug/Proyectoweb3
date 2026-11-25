'use strict';
/* CRAFTEAR NO COBRA COMISIÓN MIENTRAS DURA EL TUTORIAL (2026-11-25).
 * "...y el crafteo debe ser gratis mientras esté en el tutorial."
 *
 * crafting-authority.js (el del Escritorio, el que carga server2.js) DE VERDAD, contra
 * un mongod de verdad. La cadena es de mentira: create() solo la consulta para planear
 * (facturas libres y capacidad de la tabla), no firma nada. Los materiales se siguen
 * gastando: lo que se regala es la comisión.
 *
 * Y el enlace de server2.js (`tutorialCrafts`, en el objeto que se le pasa a
 * crafting-authority) también de verdad: decide con el paso GUARDADO del tutorial.
 *
 *   node --test tools/tutorial-crafteo-gratis.test.cjs
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const ESCRITORIO = 'C:/Users/pc/Desktop';
const SERVIDOR = process.env.SERVIDOR || ESCRITORIO + '/server2.js';
const AUTORIDAD = process.env.GF_CRAFTING || ESCRITORIO + '/crafting-authority.js';
const RECETAS = ESCRITORIO + '/craft-recipes.json';
const MONGOOSE = process.env.GF_MONGOOSE || path.join(BIN, 'GrasslandBuild/repositories/backend/node_modules/mongoose');
const MONGOD = process.env.GF_MONGOD || path.join(BIN, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.14.exe');
const FALTA = [SERVIDOR, AUTORIDAD, RECETAS, MONGOOSE, MONGOD].filter((p) => !fs.existsSync(p));
const conMongo = FALTA.length ? { skip: 'falta ' + FALTA.join(', ') } : {};

const WALLET = '0x' + 'a'.repeat(40);
const gp = { playerName: 'Ana', address: WALLET };
let mongod = null, conn = null, datos = null, A = null, M = {}, tope = 10;

const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer(); s.unref(); s.on('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

before(async () => {
  if (FALTA.length) return;
  const mongoose = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-tutorial-craft-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !conn; k++) {
    try { conn = await mongoose.createConnection('mongodb://127.0.0.1:' + puerto + '/gftutorialcraft', { serverSelectionTimeoutMS: 800 }).asPromise(); }
    catch (_) { conn = null; await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(conn, 'no arrancó el mongod de prueba');
  const modelo = (nombre, forma) => conn.model(nombre, new mongoose.Schema(forma, { strict: false, versionKey: false }));
  // Como en server2.js: `tutorial` con 0 por defecto. Mongoose lo pone al leer un documento
  // que no lo tiene, así que una cuenta de antes del tutorial PARECE estar en el paso 0.
  M.Player = modelo('GamePlayer', { playerName: String, address: String, tutorial: { type: Number, default: 0 } });
  M.Stats = modelo('PlayerStats', { playerName: String, oro: Number, plata: Number, bronce: Number, chainPending: [String] });
  M.Treasury = modelo('TesoroJuego', { _id: String, saldo: Number, retenidoServicios: Number });
  M.Service = modelo('ServicioCobro', { _id: String, bronce: Number });
  M.Mov = modelo('TesoroMov', { bronce: Number });
  const pasa = () => {};
  A = require(AUTORIDAD)({
    mongoose: { Schema: mongoose.Schema, models: conn.models, model: (...a) => conn.model(...a), connection: conn },
    ethers: null, crypto, recipes: JSON.parse(fs.readFileSync(RECETAS, 'utf8')), consumables: [], services: [],
    app: { get() {}, post() {} }, authMiddleware: pasa, adminAuth: pasa, csrfProtection: pasa, strictLimiter: pasa, apiLimiter: pasa,
    itemType: (id) => (id === 'madera_pinos' ? 'madera pinos' : id), maxStack: () => 5,
    items: () => ({ getTipoStats: async () => ({ exists: true, limit: 100000n, totalQuantity: 0n, perInvoiceLimit: 1000n }) }),
    freeInvoices: async (w) => [{ id: 7, owner: w, tipo: 'madera pinos', cantidad: 300, manualId: 'madera-7' }],
    player: async () => null, ghost: async () => false, level: async () => 30,
    transaction: async (fn) => fn(null), queue: (_k, fn) => fn(), loadEconomy: async () => {},
    price: (_tipo, _item, q) => 50 * q,
    planPayment: (n, s) => (s.bronce >= n ? { oro: s.oro, plata: s.plata, bronce: s.bronce - n } : null),
    Stats: M.Stats, Player: M.Player, Treasury: M.Treasury, treasuryId: 'juego', Service: M.Service, Mov: M.Mov,
    statsResponse: (s) => s,
    tutorialCrafts: async () => tope
  });
  await A.Job.init();
});

after(async () => {
  try { if (conn) await conn.close(); } catch (_) {}
  try { if (mongod) mongod.kill(); } catch (_) {}
  await new Promise((r) => setTimeout(r, 300));
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true }); } catch (_) {}
});

async function deNuevo(cuantoTope) {
  tope = cuantoTope;
  await Promise.all([A.Job.deleteMany({}), M.Stats.deleteMany({}), M.Service.deleteMany({}), M.Treasury.deleteMany({}), M.Mov.deleteMany({})]);
  await M.Stats.create({ playerName: 'Ana', oro: 0, plata: 0, bronce: 1000, chainPending: [] });
}
const bronce = async () => (await M.Stats.findOne({ playerName: 'Ana' }).lean()).bronce;
/** Lo que haría el ejecutor al terminar: la operación deja de estar en curso. */
const terminar = (job, status = 'completed') => A.Job.updateOne({ _id: job._id }, { $set: { status, active: false } });
const balde = (quantity, ref) => ({ recipeId: 'balde_vacio', quantity, ref });

test('en el tutorial craftear el balde no cobra comisión', conMongo, async () => {
  await deNuevo(10);
  const job = await A.create(gp, balde(1, 'tutorial-balde-0001'));
  assert.equal(job.fee, 0, 'la comisión del crafteo del tutorial');
  assert.equal(await bronce(), 1000, 'no se tocó el saldo');
  const cobro = await M.Service.findById(job.serviceId).lean();
  assert.equal(cobro.bronce, 0);
  assert.equal((await M.Treasury.findById('juego').lean()) && (await M.Treasury.findById('juego').lean()).retenidoServicios || 0, 0, 'nada retenido');
  assert.equal(await A.tutorialRestante(gp), 9);
});

test('fuera del tutorial se cobra como siempre', conMongo, async () => {
  await deNuevo(0);
  const job = await A.create(gp, balde(1, 'tutorial-balde-0002'));
  assert.equal(job.fee, 50);
  assert.equal(await bronce(), 950);
  assert.equal(await A.tutorialRestante(gp), 0);
});

test('el regalo tiene tope: lo que pasa de 10 unidades se cobra', conMongo, async () => {
  await deNuevo(10);
  const primero = await A.create(gp, balde(12, 'tutorial-balde-0003'));
  assert.equal(primero.fee, 2 * 50, '10 gratis y 2 cobradas');
  assert.equal(await bronce(), 900);
  await terminar(primero);
  const segundo = await A.create(gp, balde(1, 'tutorial-balde-0004'));
  assert.equal(segundo.fee, 50, 'ya no queda regalo');
  assert.equal(await bronce(), 850);
});

test('repetir la misma referencia no regala dos veces', conMongo, async () => {
  await deNuevo(10);
  const a = await A.create(gp, balde(3, 'tutorial-balde-0005'));
  const b = await A.create(gp, balde(3, 'tutorial-balde-0005'));
  assert.equal(String(a._id), String(b._id));
  assert.equal(await A.tutorialRestante(gp), 7);
});

test('un crafteo cancelado sin empezar devuelve su parte del regalo', conMongo, async () => {
  await deNuevo(10);
  const job = await A.create(gp, balde(4, 'tutorial-balde-0006'));
  assert.equal(await A.tutorialRestante(gp), 6);
  await terminar(job, 'cancelled');
  assert.equal(await A.tutorialRestante(gp), 10);
});

/* El enlace de server2.js: `tutorialCrafts` en el objeto de require('./crafting-authority'). */
test('server2: el regalo se da con el paso GUARDADO del tutorial, y solo mientras dura', conMongo, async () => {
  const acorn = require('acorn');
  const txt = fs.readFileSync(SERVIDOR, 'utf8');
  const ast = acorn.parse(txt, { ecmaVersion: 'latest' });
  const inicial = (nombre) => {
    for (const n of ast.body) { const d = n.declarations && n.declarations.find((x) => x.id && x.id.name === nombre); if (d) return d.init; }
    throw new Error('no está: ' + nombre);
  };
  const funcion = (nombre) => { const n = ast.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === nombre); assert.ok(n, 'no está: ' + nombre); return txt.slice(n.start, n.end); };
  const adaptador = inicial('authoritativeCrafts').arguments[0];
  const prop = adaptador.properties.find((p) => p.key && p.key.name === 'tutorialCrafts');
  assert.ok(prop, 'server2.js no le pasa tutorialCrafts a crafting-authority');
  const ctx = vm.createContext({ GamePlayer: M.Player, Number });
  const tope0 = inicial('TUTORIAL_CRAFTEO_UNIDADES_GRATIS');
  vm.runInContext('var TUTORIAL_CRAFTEO_UNIDADES_GRATIS = ' + txt.slice(tope0.start, tope0.end) + ';\n' +
    funcion('isTutorialCompleted') + '\n' + funcion('tutorialEnCurso') + '\n' + funcion('tutorialPasoGuardado') + '\n' +
    'var tutorialCrafts = ' + txt.slice(prop.value.start, prop.value.end) + ';', ctx);
  await M.Player.deleteMany({});
  const casos = [['paso0', 0, true], ['paso6', 6, true], ['paso21', 21, true], ['fin8', 8, false], ['fin22', 22, false], ['vieja', undefined, false]];
  for (const [nombre, paso] of casos) {
    // La cuenta vieja se escribe sin pasar por el esquema: así no le pone el 0 por defecto.
    if (paso === undefined) await M.Player.collection.insertOne({ playerName: nombre, address: '0x' + nombre });
    else await M.Player.create({ playerName: nombre, address: '0x' + nombre, tutorial: paso });
  }
  for (const [nombre, paso, regalo] of casos) {
    const jugador = await M.Player.findOne({ playerName: nombre });   // como jugadorDeLaSesion: sin .lean()
    if (paso === undefined) assert.equal(jugador.tutorial, 0, 'la prueba necesita que el esquema ponga el 0 por defecto');
    const n = await ctx.tutorialCrafts(jugador);
    if (regalo) assert.ok(n > 0, 'paso ' + paso + ': sin regalo');
    else assert.equal(n, 0, (paso === undefined ? 'cuenta sin el campo' : 'paso ' + paso) + ': no toca regalo');
  }
});
