'use strict';
/* EL HAMBRE Y LA SED (2026-11-25).
 * "La comida se debe gastar una variación de 2 a 3 % cada minuto y el agua una variación
 * de 1 a 2 % cada minuto."
 *
 * El código REAL de server2.js (el esquema de PlayerStats, las vitales, la lectura de
 * cada 6 s /api/player/vitals, GET /api/stats, el liquidador y el /sync) contra un mongod
 * de verdad. La cadena es de mentira: applyStatOnChain apunta lo que escribiría.
 *
 *   node --test tools/metabolismo.test.cjs
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const cp = require('node:child_process');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const MONGOOSE = process.env.GF_MONGOOSE || path.join(BIN, 'GrasslandBuild/repositories/backend/node_modules/mongoose');
const MONGOD = process.env.GF_MONGOD || path.join(BIN, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.14.exe');
const FALTA = [SERVIDOR, MONGOOSE, MONGOD].filter((p) => !fs.existsSync(p));
const conMongo = FALTA.length ? { skip: 'falta ' + FALTA.join(', ') } : {};

const WALLET = '0x' + 'b'.repeat(40);
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 25, 12, 0, 0);
let mongod = null, conn = null, datos = null, S = null, Stats = null, Player = null;
const azar = { valor: 0 };          // Math.random dentro del servidor
const escrito = [];                 // [stat, valor] que applyStatOnChain mandaría a la cadena
let cadena = {};                    // lo que hay en las facturas (para el /sync)

const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer(); s.unref(); s.on('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

/** Las declaraciones de primer nivel de server2.js, por nombre, y los manejadores de sus rutas. */
function leerServidor() {
  const acorn = require('acorn');
  const txt = fs.readFileSync(SERVIDOR, 'utf8');
  const ast = acorn.parse(txt, { ecmaVersion: 'latest', allowHashBang: true });
  const decl = new Map(), rutas = new Map();
  for (const n of ast.body) {
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) if (d.id && d.id.type === 'Identifier' && d.init && !decl.has(d.id.name)) decl.set(d.id.name, { en: n.start, src: 'var ' + d.id.name + ' = ' + txt.slice(d.init.start, d.init.end) + ';' });
    } else if (n.type === 'FunctionDeclaration' && n.id) {
      decl.set(n.id.name, { en: n.start, src: txt.slice(n.start, n.end) });     // la última gana, como en JS
    } else if (n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression') {
      const c = n.expression, f = c.callee, a0 = c.arguments[0];
      if (f.type === 'MemberExpression' && f.object.name === 'app' && (f.property.name === 'get' || f.property.name === 'post') && a0 && a0.type === 'Literal') {
        const k = f.property.name.toUpperCase() + ' ' + a0.value, h = c.arguments[c.arguments.length - 1];
        if (!rutas.has(k)) rutas.set(k, txt.slice(h.start, h.end));                // Express atiende con la primera
      }
    }
  }
  return { decl, rutas };
}

before(async () => {
  if (FALTA.length) return;
  const mongoose = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-metabolismo-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !conn; k++) {
    try { conn = await mongoose.createConnection('mongodb://127.0.0.1:' + puerto + '/gfmetabolismo', { serverSelectionTimeoutMS: 800 }).asPromise(); }
    catch (_) { conn = null; await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(conn, 'no arrancó el mongod de prueba');

  const { decl, rutas } = leerServidor();
  const NOMBRES = ['playerStatsSchema', 'STAT_TYPES_LIST', 'VITAL_MAX', 'STAT_DEFAULTS_MAP', 'STAT_INITIAL_MAP', 'isVitalStat', 'VITAL_STATS', 'clampStat',
    'VITAL_REGEN_TICK_MS', 'VITAL_REGEN_PER_TICK', 'VITAL_REGEN_MAX_TICKS', 'applyGhostVitalRegen', 'regenerarVitalesEnBD',
    'CHAIN_SETTLE_DELAY_MS', 'CHAIN_SETTLE_TICK_MS', 'CHAIN_SETTLE_BATCH', 'marcarPendienteDeCadena', 'liquidarPendientesDeCadena',
    '_liquidacionEnCurso', 'rondaDeLiquidacion', 'STAT_CHAIN_FLOOR', 'gfFullVitalHealing', 'buildStatsResponse', 'persistStatsSync'];
  // Lo de esta entrega: si aún no está, las pruebas fallan por lo que hacen, no al cargar.
  const NUEVOS = ['METABOLISMO_MINUTO_MS', 'METABOLISMO_HUECO_MS', 'METABOLISMO_POR_MINUTO', 'VIDA_CURA_RAPIDA_MIN', 'gfMetabolismo', 'marcarMetabolismoPendiente'];
  for (const n of NOMBRES) assert.ok(decl.has(n), 'server2.js no tiene ' + n);
  const piezas = NOMBRES.concat(NUEVOS.filter((n) => decl.has(n))).map((n) => decl.get(n)).sort((a, b) => a.en - b.en);
  const RUTAS = { vitales: 'GET /api/player/vitals', leer: 'GET /api/stats/:playerName', sync: 'POST /api/stats/:playerName/sync' };
  for (const r of Object.values(RUTAS)) assert.ok(rutas.has(r), 'server2.js no tiene la ruta ' + r);

  const gp = { _id: 'gp-ana', playerName: 'Ana', address: WALLET };
  const ctx = {
    mongoose, console: { log() {}, warn() {}, error() {} },
    Math: Object.create(Math, { random: { value: () => azar.valor } }),
    Date, Object, Array, Set, Map, Number, String, Boolean, JSON, Promise, Error,
    _venenos: new Map(), _syncLocks: new Map(), _tipoCheckCache: new Map(), relayerWallet: {},
    jugadorDeLaSesion: async (req) => (req.user ? gp : null),
    resolvePlayerName: async (p) => p,
    getStatsContract: () => ({ falsa: true }),
    getSafeGasPriceStats: async () => 1n,
    ensureStatTipo: async () => ({ exists: true, perInvoiceLimit: 1e9, available: 1e12 }),
    consolidateDuplicateStatInvoices: async () => { throw new Error('no hay duplicadas en esta prueba'); },
    buildStatManualId: (a, s) => a + ':' + s,
    getOnChainStats: async () => {
      const m = {};
      for (const [stat, cantidad] of Object.entries(cadena)) m[stat] = { id: { vida: 1, agua: 2, comida: 3, oro: 4, plata: 5, bronce: 6, exp: 7 }[stat], cantidad, manualId: WALLET + ':' + stat, duplicates: [] };
      return m;
    },
    applyStatOnChain: async (_c, stat, _id, objetivo) => { escrito.push([stat, objetivo]); cadena[stat] = objetivo; return { ok: true }; }
  };
  vm.createContext(ctx);
  vm.runInContext(piezas.map((p) => p.src).join('\n'), ctx, { filename: 'server2-vitales.js' });
  for (const [k, r] of Object.entries(RUTAS)) vm.runInContext('var RUTA_' + k + ' = ' + rutas.get(r) + ';', ctx, { filename: 'server2-' + k + '.js' });
  assert.equal(vm.runInContext('Math.random()', ctx), azar.valor, 'el dado del servidor se controla desde la prueba');

  Stats = conn.model('PlayerStats', ctx.playerStatsSchema);
  Player = conn.model('GamePlayer', new mongoose.Schema({ playerName: String, address: String, nivel_exp: Number }, { strict: false, versionKey: false }));
  ctx.PlayerStats = Stats; ctx.GamePlayer = Player;
  await Stats.init();
  S = ctx;
});

after(async () => {
  try { if (conn) await conn.close(); } catch (_) {}
  try { if (mongod) mongod.kill(); } catch (_) {}
  await new Promise((r) => setTimeout(r, 300));
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true }); } catch (_) {}
});

beforeEach(async () => {
  azar.valor = 0; escrito.length = 0; cadena = {};
  if (Stats) await Promise.all([Stats.deleteMany({}), Player.deleteMany({})]);
});

/** Un documento de Mongoose (sin guardar) con los relojes en `t`. */
const jugador = (campos, t = T0) => new Stats({ playerName: 'Ana', address: WALLET, vida: 100, agua: 100, comida: 100,
  lastVitalRegen: new Date(t), lastMetabolism: new Date(t), ...campos });
/** Una pasada de las vitales en el minuto `m` desde T0 con el dado fijo en `dado`. */
const pasada = (doc, m, dado) => S.applyGhostVitalRegen(doc, new Date(T0 + m * MIN), () => dado);
/** Llama al manejador de una ruta como lo haría Express. */
async function llamar(nombre, req) {
  let status = 200, cuerpo = null;
  const res = { status(n) { status = n; return this; }, json(d) { cuerpo = d; return this; } };
  await S['RUTA_' + nombre]({ user: { address: WALLET }, params: { playerName: 'Ana' }, body: {}, ...req }, res);
  return { status, cuerpo };
}
const leerDoc = () => Stats.findOne({ playerName: 'Ana' }).lean();

test('jugando, cada minuto la comida baja 2 o 3 y el agua 1 o 2', conMongo, () => {
  const d = jugador({});
  pasada(d, 1, 0);
  assert.deepEqual([d.comida, d.agua], [98, 99], 'el dado más bajo: 2 de comida y 1 de agua');
  pasada(d, 2, 0.999);
  assert.deepEqual([d.comida, d.agua], [95, 97], 'el dado más alto: 3 de comida y 2 de agua');
  pasada(d, 2.5, 0);
  assert.deepEqual([d.comida, d.agua], [95, 97], 'medio minuto todavía no gasta');
  pasada(d, 3, 0);
  assert.deepEqual([d.comida, d.agua], [93, 96], 'el medio minuto de antes no se perdió');
});

test('las lecturas sueltas (cada 7 s) no se comen los segundos sobrantes', conMongo, () => {
  const d = jugador({});
  for (let k = 1; k <= 26; k++) S.applyGhostVitalRegen(d, new Date(T0 + k * 7000), () => 0);   // 182 s
  assert.deepEqual([d.comida, d.agua], [94, 97], 'tres minutos enteros, ni uno menos');
});

test('un hueco de 3 minutos jugando gasta los 3 minutos, no uno', conMongo, () => {
  const d = jugador({});
  pasada(d, 3, 0);
  assert.deepEqual([d.comida, d.agua], [94, 97]);
});

test('el gasto varía minuto a minuto, siempre entre 2 y 3 de comida y entre 1 y 2 de agua', conMongo, () => {
  const d = jugador({});
  const comida = [], agua = [];
  for (let m = 1; m <= 30; m++) {
    const c = d.comida, a = d.agua;
    S.applyGhostVitalRegen(d, new Date(T0 + m * MIN), Math.random);
    comida.push(c - d.comida); agua.push(a - d.agua);
  }
  assert.ok(comida.every((x) => x === 2 || x === 3), 'comida por minuto: ' + comida.join(','));
  assert.ok(agua.every((x) => x === 1 || x === 2), 'agua por minuto: ' + agua.join(','));
  assert.ok(new Set(comida).size === 2 && new Set(agua).size === 2, 'no siempre lo mismo: hay variación');
});

test('jugando, la comida y el agua ya no se reponen solas; la vida sí (+1 cada 3 min)', conMongo, () => {
  const d = jugador({ vida: 50, agua: 70, comida: 70 });
  for (let m = 1; m <= 3; m++) pasada(d, m, 0);
  assert.deepEqual([d.vida, d.comida, d.agua], [51, 64, 67]);
});

test('fuera del juego no se gasta: tras 2 h la comida y el agua suben como siempre', conMongo, () => {
  const d = jugador({ vida: 50, agua: 40, comida: 30 });
  pasada(d, 120, 0.999);
  assert.deepEqual([d.vida, d.comida, d.agua], [90, 70, 80], '40 tics de 3 min, ni un minuto de hambre');
  pasada(d, 121, 0);
  assert.deepEqual([d.comida, d.agua], [68, 79], 'al volver a jugar, vuelve a gastar desde ese momento');
});

test('un muerto no pasa hambre, y al revivir no le llega la cuenta del rato muerto', conMongo, () => {
  const d = jugador({ vida: 0, vidaCongelada: true, agua: 60, comida: 60 });
  for (let m = 1; m <= 5; m++) pasada(d, m, 0.999);
  assert.deepEqual([d.vida, d.comida, d.agua], [0, 61, 61], 'muerto: ni hambre ni vida; agua y comida, como antes');
  d.vidaCongelada = false; d.vida = 50;
  pasada(d, 6, 0);
  assert.deepEqual([d.vida, d.comida, d.agua], [51, 59, 60], 'vivo otra vez: un solo minuto de hambre');
});

test('no baja de 0', conMongo, () => {
  const d = jugador({ agua: 1, comida: 2 });
  pasada(d, 2, 0.999);
  assert.deepEqual([d.comida, d.agua], [0, 0]);
});

test('bajar por hambre no pide una transacción por minuto', conMongo, async () => {
  const d = jugador({}, Date.now() - 2 * MIN);
  S.applyGhostVitalRegen(d, new Date(), () => 0);
  assert.deepEqual([d.comida, d.agua], [96, 98]);
  assert.deepEqual(Array.from(d.chainPending), [], 'el liquidador no tiene nada que escribir');
  assert.deepEqual(Array.from(d.metabolismoPendiente || []).sort(), ['agua', 'comida'], 'pero se sabe qué barras van por delante de la cadena');
  d.invoiceIds = { vida: 1, agua: 2, comida: 3 };
  await d.save();
  await S.rondaDeLiquidacion({ inmediato: true });
  assert.deepEqual(escrito, [], 'ni una transacción');
});

test('la siguiente transacción de esa barra se lleva el hambre', conMongo, async () => {
  await Stats.create({ playerName: 'Ana', address: WALLET, vida: 100, agua: 90, comida: 80, invoiceIds: { vida: 1, agua: 2, comida: 3 },
    lastVitalRegen: new Date(), lastMetabolism: new Date(), metabolismoPendiente: ['agua', 'comida'],
    chainPending: ['comida'], chainPendingSince: new Date(Date.now() - 5 * MIN) });   // p. ej. comió o taló
  await S.rondaDeLiquidacion({ inmediato: true });
  assert.deepEqual(escrito, [['comida', 80]]);
  const doc = await leerDoc();
  assert.deepEqual(doc.chainPending, []);
  assert.deepEqual(doc.metabolismoPendiente, ['agua'], 'la comida ya está en la cadena; el agua, no');
});

test('/api/player/vitals (la lectura de cada 6 s) gasta el hambre y lo guarda, una sola vez', conMongo, async () => {
  await Stats.create({ playerName: 'Ana', address: WALLET, vida: 100, agua: 100, comida: 100,
    lastVitalRegen: new Date(Date.now() - 61 * 1000), lastMetabolism: new Date(Date.now() - 61 * 1000) });
  const [a, b] = await Promise.all([llamar('vitales', {}), llamar('vitales', {})]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  let doc = await leerDoc();
  assert.deepEqual([doc.comida, doc.agua], [98, 99], 'dos lecturas a la vez cobran un solo minuto');
  assert.deepEqual([a.cuerpo.stats.comida, b.cuerpo.stats.comida], [98, 98], 'y las dos responden lo guardado');
  assert.deepEqual(doc.chainPending, []);
  assert.deepEqual(doc.metabolismoPendiente.slice().sort(), ['agua', 'comida']);
  await llamar('vitales', {});
  doc = await leerDoc();
  assert.deepEqual([doc.comida, doc.agua], [98, 99], 'seis segundos después no se cobra otra vez');
});

test('/api/player/vitals también gasta en una cuenta de antes de que existiera vidaCongelada', conMongo, async () => {
  // Mongoose pone el `false` por defecto al leer, pero no lo escribe: en Mongo el campo no está.
  await Stats.collection.insertOne({ playerName: 'Ana', address: WALLET, vida: 100, agua: 100, comida: 100, chainPending: [],
    lastVitalRegen: new Date(Date.now() - 61 * 1000), lastMetabolism: new Date(Date.now() - 61 * 1000) });
  await llamar('vitales', {});
  const doc = await leerDoc();
  assert.equal(doc.vidaCongelada, undefined, 'la prueba necesita la cuenta sin el campo');
  assert.deepEqual([doc.comida, doc.agua], [98, 99]);
});

test('/api/player/vitals guarda el reloj aunque no toque gastar: jugar seguido no cuenta como ausencia', conMongo, async () => {
  const hace = new Date(Date.now() - 20 * 1000);
  await Stats.create({ playerName: 'Ana', address: WALLET, vida: 100, agua: 100, comida: 100, lastVitalRegen: hace, lastMetabolism: null });
  await llamar('vitales', {});
  const doc = await leerDoc();
  assert.ok(doc.lastMetabolism, 'el reloj del hambre arranca');
  assert.deepEqual([doc.comida, doc.agua], [100, 100], 'arrancar el reloj no cobra nada');
});

test('GET /api/stats también gasta el hambre y guarda su reloj', conMongo, async () => {
  await Stats.create({ playerName: 'Ana', address: WALLET, vida: 100, agua: 100, comida: 100,
    lastVitalRegen: new Date(Date.now() - 61 * 1000), lastMetabolism: new Date(Date.now() - 61 * 1000) });
  const r = await llamar('leer', {});
  assert.deepEqual([r.cuerpo.stats.comida, r.cuerpo.stats.agua], [98, 99]);
  const doc = await leerDoc();
  assert.deepEqual([doc.comida, doc.agua], [98, 99]);
  assert.ok(Date.now() - new Date(doc.lastMetabolism).getTime() < 61 * 1000, 'el reloj avanzó');
});

test('el /sync no deshace el hambre: con la barra apuntada manda Mongo y se escribe una vez', conMongo, async () => {
  const ids = { vida: 1, agua: 2, comida: 3, oro: 4, plata: 5, bronce: 6, exp: 7 };
  await Stats.create({ playerName: 'Ana', address: WALLET, vida: 100, agua: 85, comida: 70, oro: 0, plata: 0, bronce: 0, exp: 0, invoiceIds: ids,
    lastVitalRegen: new Date(), lastMetabolism: new Date(), metabolismoPendiente: ['comida', 'agua'] });
  cadena = { vida: 100, agua: 100, comida: 100, oro: 1, plata: 1, bronce: 1, exp: 1 };
  const r = await llamar('sync', {});
  assert.equal(r.status, 200);
  const doc = await leerDoc();
  assert.deepEqual([doc.comida, doc.agua], [70, 85], 'Mongo manda');
  assert.deepEqual(escrito.filter(([s]) => s === 'comida' || s === 'agua').sort(), [['agua', 85], ['comida', 70]], 'una escritura por barra');
  assert.deepEqual(doc.metabolismoPendiente, [], 'la cadena ya va al día');
});

test('sin la marca del hambre, el /sync sigue dejando mandar a la cadena cuando Mongo va por debajo', conMongo, async () => {
  const ids = { vida: 1, agua: 2, comida: 3, oro: 4, plata: 5, bronce: 6, exp: 7 };
  await Stats.create({ playerName: 'Ana', address: WALLET, vida: 100, agua: 100, comida: 70, oro: 0, plata: 0, bronce: 0, exp: 0, invoiceIds: ids,
    lastVitalRegen: new Date(), lastMetabolism: new Date() });
  cadena = { vida: 100, agua: 100, comida: 100, oro: 1, plata: 1, bronce: 1, exp: 1 };
  await llamar('sync', {});
  assert.equal((await leerDoc()).comida, 100);
});

test('bien comido y bebido (80 o más) la vida se cura rápido; con hambre, no', conMongo, () => {
  const t = 100000;
  const d = jugador({ vida: 50, agua: 85, comida: 82, lastFullVitalHeal: new Date(t) });
  assert.equal(S.gfFullVitalHealing(d, new Date(t + 5000)), true);
  assert.equal(d.vida, 51);
  d.comida = 79;
  assert.equal(S.gfFullVitalHealing(d, new Date(t + 10000)), false);
  assert.equal(d.vida, 51);
});
