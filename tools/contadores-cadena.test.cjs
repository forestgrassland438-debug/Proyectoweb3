'use strict';
/* (2026-11-25) LOS CONTADORES DEL CONTRATO (Desktop/cuenta-en-cadena.js, CONTADORES).
 *
 * "En control-center.html las tx o las minadas deben guardarse en el contrato
 *  mismo, no en la base de datos; así mismo las cuentas creadas en total."
 * (Por lotes.) Las cuentas creadas, las tx minadas con éxito y las revertidas van
 * en UNA factura del relayer (cta_contadores · ct:contrato), con los cursores de
 * hasta dónde están contadas. Aquí, con el contrato REAL (Desktop/rr.txt.txt) en
 * ganache y un Mongo de verdad:
 *   · el primer lote crea la factura; sin nada nuevo no se gasta ninguna comisión;
 *   · cada lote es UNA transacción y suma solo lo nuevo (sin contarse a sí mismo);
 *   · se BORRA Mongo: nada baja, lo nuevo se suma y lo reimportado no cuenta dos veces;
 *   · con recibos sin ver, las tx esperan (las cuentas no);
 *   · una cuenta que vuelve de la cadena conserva su fecha y no cuenta como nueva;
 *   · la restauración general no toma al relayer por un jugador;
 *   · un lote a la vez (cerrojo) y una factura estropeada no se toca.
 * Se salta si falta alguna pieza (GF_TEST_DEPS, GF_MONGOOSE, GF_MONGOD, GF_CONTRATO, GF_CUENTA).
 *
 *   node --test tools/contadores-cadena.test.cjs
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const BIN = path.resolve(__dirname, '..');
const DEPS = process.env.GF_TEST_DEPS || 'C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules';
const MONGOOSE = process.env.GF_MONGOOSE || path.join(BIN, 'GrasslandBuild/repositories/backend/node_modules/mongoose');
const MONGOD = process.env.GF_MONGOD || path.join(BIN, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.14.exe');
const CONTRATO = process.env.GF_CONTRATO || 'C:/Users/pc/Desktop/rr.txt.txt';
const CUENTA = process.env.GF_CUENTA || 'C:/Users/pc/Desktop/cuenta-en-cadena.js';
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const FALTA = [path.join(DEPS, 'ganache'), path.join(DEPS, 'solc'), path.join(DEPS, '@openzeppelin'), MONGOOSE, MONGOD, CONTRATO, CUENTA]
  .filter((p) => !fs.existsSync(p));
const opciones = FALTA.length ? { skip: 'falta ' + FALTA.join(', ') } : { timeout: 240000 };
const puras = fs.existsSync(CUENTA) ? require(CUENTA).puras : null;

const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer(); s.unref(); s.on('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let mongod = null, db = null, datos = null, X = null;

function modelos(m) {
  const S = m.Schema;
  const HAB = ['agricultura', 'mineria', 'deforestacion', 'pesca', 'cocina', 'fuerza'];
  const campos = { playerName: { type: String, unique: true }, address: { type: String, lowercase: true }, Username: { type: String, default: '---' },
    petName: { type: String, default: '---' }, tutorial: { type: Number, default: 0 }, tutorialCompletedAt: { type: Date, default: null },
    misiones: { type: Number, default: 0 }, nivel_exp: { type: Number, default: 0 }, petWins: Number, petBattles: Number, petExp: Number,
    nameColor: { type: String, default: null }, lenguaje: { type: Number, default: 1 } };
  for (const h of HAB) { campos[h] = { type: Number, default: 0 }; campos[h + '_exp'] = { type: Number, default: 0 }; }
  return {
    GamePlayer: m.model('GamePlayer', new S(campos, { timestamps: true, versionKey: false })),
    MissionsPlayer: m.model('MissionsPlayer', new S({ playerName: { type: String, unique: true }, misionesCompletadas: { type: Number, default: 0 },
      misionesEnProgreso: { type: Number, default: 0 }, misionesFallidas: { type: Number, default: 0 }, misiones_granjero: { type: Number, default: 0 },
      estadomision: { type: Number, default: 0 }, misiones_guardian: { type: Number, default: 0 }, estadomision1: { type: Number, default: 0 } }, { timestamps: true })),
    BattleScore: m.model('BattleScore', new S({ seasonNumber: Number, playerName: String, address: String, petName: String, points: { type: Number, default: 0 },
      wins: { type: Number, default: 0 }, losses: { type: Number, default: 0 }, battles: { type: Number, default: 0 }, bestStreak: { type: Number, default: 0 },
      streak: { type: Number, default: 0 } }, { timestamps: true })),
    Amistad: m.model('Amistad', new S({ playerName: { type: String, unique: true }, amigos: [{ _id: false, playerName: String, desde: { type: Date, default: Date.now } }],
      entrantes: [], salientes: [], limpiezaDM: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } }, { collection: 'player_friends', versionKey: false })),
    Construccion: m.model('Construccion', new S({ playerName: String, address: { type: String, lowercase: true }, tipo: String, gx: Number, gy: Number,
      ancho: Number, alto: Number, invoiceId: { type: Number, default: null }, manualId: { type: String, default: null },
      devolucionPendiente: { type: Boolean, default: false }, escala: Number, contenido: { type: Array, default: [] } }, { timestamps: true, versionKey: false })),
    UserActivity: m.model('UserActivity', new S({ playerName: String, codigoInvitacion: String, invitadoPor: String, invitadoEn: Date, discord: String }, { timestamps: true })),
    // El libro de la auditoría (server2.js, LITVM_IMPACT_BUNDLE): lo que el módulo lee de él.
    Libro: m.model('LitvmChainTransaction', new S({ chainId: Number, contractAddress: String, txHash: String, status: String, canonical: Boolean,
      blockNumber: Number, invoiceIds: [String], submittedAt: Date, source: String }, { collection: 'litvm_chain_transactions', versionKey: false }))
  };
}

before(async () => {
  if (FALTA.length) return;
  const { Mongoose } = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-contadores-db-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !db; k++) {
    const m = new Mongoose();
    try { await m.connect('mongodb://127.0.0.1:' + puerto + '/gfcontadores', { serverSelectionTimeoutMS: 800 }); db = m; }
    catch (_) { try { await m.disconnect(); } catch (e) {} await espera(250); }
  }
  assert.ok(db, 'no arrancó el mongod de prueba');

  const ethers = require('ethers');
  const ganache = require(path.join(DEPS, 'ganache'));
  const solc = require(path.join(DEPS, 'solc'));
  const salida = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Game.sol': { content: fs.readFileSync(CONTRATO, 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } }),
  { import: (p) => ({ contents: fs.readFileSync(path.join(DEPS, p), 'utf8') }) }));
  const art = salida.contracts['Game.sol'].InvoiceSystem;
  const rpc = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 5 }, chain: { chainId: 1337 }, miner: { blockGasLimit: 60000000 } });
  const provider = new ethers.BrowserProvider(rpc); provider.pollingInterval = 20;
  const cuentas = Object.entries(rpc.getInitialAccounts());
  const relayer = new ethers.Wallet(cuentas[0][1].secretKey, provider);
  const [A, B] = cuentas.slice(1, 3).map((x) => x[0].toLowerCase());
  const contrato = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, relayer).deploy(relayer.address);
  await contrato.waitForDeployment();
  const M = modelos(db);
  for (const Mo of Object.values(M)) await Mo.init();
  const enviadas = [];
  const txRelayer = async (nombre, fn, preflight) => {
    const gasPrice = 1000000000n;
    const est = await preflight({ gasPrice });
    const nonce = await provider.getTransactionCount(relayer.address, 'pending');
    const tx = await fn({ gasPrice, gasLimit: BigInt(est) * 12n / 10n, nonce });
    enviadas.push(nombre);
    return tx.wait();
  };
  const T0 = Date.now();
  const reloj = { t: T0 };
  const nivelPorExperiencia = (e) => { let n = 0; while (n < 150 && e >= 100 * (n + 1) ** 2) n++; return n; };
  const cuenta = require(CUENTA)({ mongoose: db, ethers, crypto, zlib, log: { log() {}, warn() {}, error() {} },
    wallet: () => relayer, direccionContrato: () => contrato.target, proveedor: () => provider, txRelayer, modelos: M,
    temporadaActual: async () => 3, nivelPorExperiencia, claveRespaldo: () => 'clave-de-prueba-del-respaldo', pausaEscaneoMs: 0,
    chainId: () => 1337, explorador: () => 'https://explorer.example', margenBloques: 0, ahora: () => reloj.t });
  // El freno de tx por minuto mira el reloj de la prueba, que solo anda cuando se le dice.
  await cuenta.guardarConfig({ txPorMinuto: 100000 });
  X = { ethers, provider, relayer, contrato, M, A, B, cuenta, enviadas, reloj, T0, rpc };
});

after(async () => {
  try { if (X) X.cuenta.detener(); } catch (_) {}
  try { if (db) await db.disconnect(); } catch (_) {}
  try { if (X && X.rpc) await X.rpc.disconnect(); } catch (_) {}
  // mongod suelta sus archivos al SALIR: borrar antes deja 300 MB por ejecución en %TEMP% (Windows).
  if (mongod) { const fuera = new Promise((ok) => { mongod.once('exit', ok); setTimeout(ok, 8000).unref(); }); try { mongod.kill(); } catch (_) {} await fuera; }
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (_) {}
});

// ── Utilidades de la prueba ─────────────────────────────────────────────────
const leerFactura = async () => {
  const r = await X.contrato.getInvoiceByManualIdSafe('ct:contrato');
  if (!r[1]) return null;
  const v = puras.desempaquetar(puras.FORMATOS.contadores, r[0].cantidad);
  return { id: r[0].id, owner: r[0].owner.toLowerCase(), tipo: r[0].tipo, cantidad: r[0].cantidad, ...v };
};
const txDelRelayer = () => X.provider.getTransactionCount(X.relayer.address);
const cabeza = () => X.provider.getBlockNumber();
let n = 0;
/** Una cuenta con su fecha (sin pasar por los timestamps de Mongoose). */
const cuentaNueva = (nombre, fecha) => X.M.GamePlayer.collection.insertOne({ playerName: nombre, address: '0x' + crypto.randomBytes(20).toString('hex'),
  Username: nombre, tutorial: 1, createdAt: new Date(fecha), updatedAt: new Date(fecha) });
/** Una cuenta que nace AHORA en el reloj de la prueba (entra en el lote de dentro de 30 s o más). */
const nace = (nombre, extra = {}) => X.M.GamePlayer.collection.insertOne({ playerName: nombre, address: '0x' + crypto.randomBytes(20).toString('hex'),
  Username: nombre, tutorial: 1, createdAt: new Date(X.reloj.t), updatedAt: new Date(X.reloj.t), ...extra });
const pasa = (ms) => { X.reloj.t += ms; };
/** Una fila del libro de la auditoría. */
const fila = (status, blockNumber, extra = {}) => X.M.Libro.collection.insertOne({ chainId: 1337, contractAddress: X.contrato.target.toLowerCase(),
  txHash: '0x' + (++n).toString(16).padStart(64, '0'), status, canonical: true, blockNumber, invoiceIds: [], source: 'live', ...extra });

// ── Las piezas puras ─────────────────────────────────────────────────────────
test('los contadores caben en su factura y sumar siempre SUBE la cantidad', { skip: !puras }, () => {
  const F = puras.FORMATOS.contadores;
  assert.equal(puras.bitsDe(F), 236);
  assert.ok(puras.empaquetar(F, { cuentas: 2 ** 40, txExito: 2 ** 48, txRevertidas: 2 ** 40, lotes: 2 ** 24, bloque: 2 ** 40, cuentasHasta: 2 ** 44 }) <
    puras.TABLAS.contadores.porFactura, 'todo al máximo cabe en el tope por factura');
  assert.equal(puras.MANUAL.contadores(), 'ct:contrato');
  assert.equal(puras.TABLAS.contadores.tipo, 'cta_contadores');
  assert.equal(puras.esTablaDeCuenta('cta_contadores'), true, 'el relay la cierra y el cliente la ignora por su prefijo');
  // Lo nuevo nunca resta: cualquier lote da una cantidad MAYOR (la escritura es un solo aumento).
  let azar = 7;
  const r = (m) => { azar = (azar * 1103515245 + 12345) % 2147483648; return azar % m; };
  for (let i = 0; i < 300; i++) {
    const v = { cuentas: r(1e6), txExito: r(1e9), txRevertidas: r(1e6), lotes: r(1e5), bloque: r(7e7), cuentasHasta: 1.7e12 + r(1e9) };
    const nuevo = puras.sumarContadores(v, { cuentas: r(3), txExito: r(3), txRevertidas: r(2) }, { bloque: v.bloque + r(5), cuentasHasta: v.cuentasHasta + r(5) });
    assert.ok(puras.empaquetar(F, nuevo) > puras.empaquetar(F, v), 'el lote ' + i + ' no sube');
  }
  // Los cursores no van hacia atrás aunque se lo pidan.
  const s = puras.sumarContadores({ bloque: 50, cuentasHasta: 900 }, {}, { bloque: 10, cuentasHasta: 100 });
  assert.deepEqual([s.bloque, s.cuentasHasta, s.lotes], [50, 900, 1]);
  assert.equal(puras.masAntigua([{ creada: 300 }, { creada: 0 }, { creada: 200 }]), 200000);
  assert.equal(puras.masAntigua([]), 0);
});

// ── Con la cadena y Mongo de verdad ──────────────────────────────────────────
test('el primer lote crea la factura con lo de antes; sin nada nuevo, ninguna comisión', opciones, async () => {
  const { cuenta, relayer, reloj, T0 } = X;
  for (const k of ['Ana', 'Beto', 'Ceci']) await cuentaNueva(k, T0 - 3600e3);
  await X.M.GamePlayer.collection.insertOne({ playerName: 'Vieja', address: '0x' + '1'.repeat(40) });   // de antes de las fechas
  const h = await cabeza();
  for (let i = 0; i < 5; i++) await fila('confirmed', h);
  for (let i = 0; i < 2; i++) await fila('reverted', h);
  await fila('orphaned', h);                                         // se cayó del bloque: no cuenta
  await fila('confirmed', h, { canonical: false });                  // no canónica: no cuenta
  await fila('confirmed', h, { contractAddress: '0x' + '2'.repeat(40) });   // otro contrato: no cuenta
  await fila('pending', null, { submittedAt: new Date(reloj.t - 2 * 3600e3) });   // perdida hace 2 h: no frena

  assert.equal(await leerFactura(), null);
  const r = await cuenta.escribirContadores();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.creada, true);
  const f = await leerFactura();
  assert.equal(f.owner, relayer.address.toLowerCase(), 'la factura es del relayer');
  assert.equal(f.tipo, 'cta_contadores');
  assert.deepEqual([f.cuentas, f.txExito, f.txRevertidas, f.lotes], [4, 5, 2, 1]);
  assert.equal(f.bloque, h, 'las tx están contadas hasta la cabeza de entonces (margen 0)');
  assert.equal(f.cuentasHasta, T0 - 30000, 'las cuentas, hasta 30 s antes del lote');
  assert.equal(f._marca, true);

  const antes = await txDelRelayer();
  const otra = await cuenta.escribirContadores();
  assert.equal(otra.nada, true);
  assert.equal(await txDelRelayer(), antes, 'sin nada nuevo no se gasta ni una comisión');
});

test('cada lote es UNA transacción, suma solo lo nuevo y no se cuenta a sí mismo', opciones, async () => {
  const { cuenta, reloj, T0, enviadas } = X;
  const f0 = await leerFactura();
  await cuentaNueva('Dani', T0 + 10000);
  await cuentaNueva('Eva', T0 + 20000);
  await cuentaNueva('Fede', T0 + 50000);                            // después del corte (ahora − 30 s): al siguiente
  const h = await cabeza();
  assert.ok(h > f0.bloque, 'el primer lote minó bloques nuevos');
  await fila('confirmed', h); await fila('confirmed', h); await fila('reverted', h);
  await fila('confirmed', h, { invoiceIds: [String(f0.id)] });      // la escritura de los propios contadores
  await fila('confirmed', f0.bloque);                               // de un bloque ya contado: no vuelve a sumar
  reloj.t = T0 + 60000;
  const antes = await txDelRelayer(), nombres = enviadas.length;
  const r = await cuenta.escribirContadores();
  assert.equal(r.escrito, true, JSON.stringify(r));
  assert.equal(await txDelRelayer(), antes + 1, 'una sola transacción por lote');
  assert.deepEqual(enviadas.slice(nombres), ['cuenta contadores (lote)']);
  const f = await leerFactura();
  assert.equal(f.id, f0.id, 'la misma factura de siempre');
  assert.deepEqual([f.cuentas, f.txExito, f.txRevertidas, f.lotes], [6, 7, 3, 2]);
  assert.equal(f.cuentasHasta, T0 + 30000);
  assert.equal(r.lote.cuadra, true, 'releída, la factura da lo escrito');

  reloj.t = T0 + 90000;                                             // Fede ya entra
  await cuenta.escribirContadores();
  assert.equal((await leerFactura()).cuentas, 7);
});

test('se borra Mongo: nada baja, lo nuevo se suma y lo reimportado no cuenta dos veces', opciones, async () => {
  const { cuenta, reloj, T0, M } = X;
  const f0 = await leerFactura();
  for (const c of Object.values(db.connection.collections)) await c.deleteMany({});
  // Después del borrado: una cuenta nueva y una tx nueva…
  await cuentaNueva('Gala', T0 + 100000);
  const h = await cabeza();
  await fila('confirmed', h);
  // …y el escaneo histórico reimporta lo de antes (bloques ya contados).
  for (let i = 0; i < 6; i++) await fila('confirmed', f0.bloque, { source: 'historical' });
  // Y vuelven las cuentas de antes, con su fecha de antes.
  for (const k of ['Ana', 'Beto']) await cuentaNueva(k, T0 - 3600e3);
  reloj.t = T0 + 150000;
  const r = await cuenta.escribirContadores();
  assert.equal(r.escrito, true, JSON.stringify(r));
  const f = await leerFactura();
  assert.deepEqual([f.cuentas, f.txExito, f.txRevertidas], [f0.cuentas + 1, f0.txExito + 1, f0.txRevertidas]);
  assert.ok(await M.GamePlayer.countDocuments({}) < f.cuentas, 'Mongo tiene menos cuentas que el contrato: el contrato manda');
});

test('con recibos sin ver, las tx esperan al lote siguiente (las cuentas no)', opciones, async () => {
  const { cuenta, reloj, T0 } = X;
  const f0 = await leerFactura();
  const h = await cabeza();
  await fila('confirmed', h);
  await fila('pending', null, { submittedAt: new Date(reloj.t - 5 * 60000), txHash: '0x' + 'ab'.repeat(32) });
  await cuentaNueva('Hugo', T0 + 160000);
  reloj.t = T0 + 200000;
  const r = await cuenta.escribirContadores();
  assert.equal(r.escrito, true, JSON.stringify(r));
  assert.equal(r.esperando, 1);
  let f = await leerFactura();
  assert.equal(f.cuentas, f0.cuentas + 1, 'las cuentas no esperan');
  assert.deepEqual([f.txExito, f.bloque], [f0.txExito, f0.bloque], 'las tx y su cursor esperan');
  // Llega el recibo (minado en la ventana): ahora entran las dos.
  await X.M.Libro.collection.updateOne({ txHash: '0x' + 'ab'.repeat(32) }, { $set: { status: 'confirmed', blockNumber: h } });
  reloj.t = T0 + 230000;
  await cuenta.escribirContadores();
  f = await leerFactura();
  assert.equal(f.txExito, f0.txExito + 2);
  assert.ok(f.bloque > f0.bloque);
});

test('una cuenta que vuelve de la cadena conserva su fecha y no cuenta otra vez', opciones, async () => {
  const { cuenta, T0, M, A, B } = X;
  const fechaDe = async (pn) => (await M.GamePlayer.findOne({ playerName: pn }).lean()).createdAt.getTime();
  // Juan nace y el lote lo cuenta; luego sus datos suben a la cadena.
  await nace('Juan', { address: B, tutorial: 22, misiones: 3 });
  pasa(60000);
  const f0 = await leerFactura();
  assert.equal((await cuenta.escribirContadores()).suma.cuentas, 1);
  const desde = Math.floor(Date.now() / 1000) * 1000;
  const s = await cuenta.sincronizarJugador('Juan', { forzar: true });
  const hasta = Date.now();
  assert.equal(s.ok, true, JSON.stringify(s));
  // Se pierde su ficha; al volver a entrar nace otra "ahora", y la cadena dice que ya existía.
  pasa(60000);
  await M.GamePlayer.deleteOne({ playerName: 'Juan' });
  await nace('Juan', { address: B, Username: '---', tutorial: 0 });
  const vuelta = await cuenta.restaurarSiVacio('Juan');
  assert.ok(vuelta.repuestas && vuelta.repuestas.tutorial, JSON.stringify(vuelta));
  const t = await fechaDe('Juan');
  assert.ok(t >= desde && t <= hasta, 'vuelve con la fecha en que sus datos llegaron a la cadena: ' + new Date(t).toISOString());
  // Del ancla: la ficha trae su fecha (Mongoose la pisaba con "ahora" en el upsert)…
  const hace = T0 - 7 * 86400e3;
  const ap = await cuenta.aplicarAnclas([{ cuentas: [{ playerName: 'Ines', address: A, Username: 'Ines', createdAt: new Date(hace).toISOString() }] }]);
  assert.equal(ap.cuentas, 1);
  assert.equal(await fechaDe('Ines'), hace);
  // …y corrige también la de una cuenta que ya había vuelto (con la de su primera factura).
  await cuenta.aplicarAnclas([{ cuentas: [{ playerName: 'Juan', address: B, Username: 'Juan', createdAt: new Date(t - 3600e3).toISOString() }] }]);
  assert.equal(await fechaDe('Juan'), t - 3600e3);
  // Nunca hacia delante.
  await cuenta.aplicarAnclas([{ cuentas: [{ playerName: 'Juan', address: B, Username: 'Juan', createdAt: new Date(t).toISOString() }] }]);
  assert.equal(await fechaDe('Juan'), t - 3600e3);
  // Ninguna de las dos cuenta otra vez: no hay nada que escribir.
  pasa(60000);
  const antes = await txDelRelayer();
  const r = await cuenta.escribirContadores();
  assert.equal(r.nada, true, JSON.stringify(r));
  assert.equal(await txDelRelayer(), antes);
  assert.equal((await leerFactura()).cuentas, f0.cuentas + 1);
});

test('la restauración general no toma al relayer por un jugador', opciones, async () => {
  const { cuenta, relayer } = X;
  const esc = await cuenta.escanearCadena();
  assert.equal(esc.porDueno.has(relayer.address.toLowerCase()), false, 'la factura de los contadores no es de un jugador');
});

test('un lote a la vez y el panel lee lo que dice la factura', opciones, async () => {
  const { cuenta, reloj } = X;
  await nace('Kira');
  pasa(60000);
  const antes = await txDelRelayer();
  const [a, b] = await Promise.all([cuenta.escribirContadores(), cuenta.escribirContadores()]);
  assert.equal(a, b, 'dos a la vez en la misma instancia: el mismo lote');
  assert.equal(await txDelRelayer(), antes + 1);
  // Otra instancia lo tiene: este no escribe.
  await cuenta._modelos.Cerrojo.collection.insertOne({ _id: 'contadores', dueno: 'otra-instancia', hasta: new Date(reloj.t + 60000) });
  pasa(1000);
  await nace('Leo');
  pasa(40000);
  assert.deepEqual(await cuenta.escribirContadores(), { ok: false, motivo: 'ocupado' });
  // Lo que espera al próximo lote, para el panel.
  const v = await cuenta.leerContadores();
  const f = await leerFactura();
  assert.equal(v.existe, true);
  assert.equal(v.factura, String(f.id));
  assert.deepEqual([v.enCadena.cuentas, v.enCadena.txExito, v.enCadena.txRevertidas, v.enCadena.txMinadas], [f.cuentas, f.txExito, f.txRevertidas, f.txExito + f.txRevertidas]);
  assert.equal(v.pendiente.cuentas, 1, 'Leo espera al próximo lote');
  assert.equal(v.explorador, 'https://explorer.example');
  assert.ok(v.ultimoLote && /^0x[0-9a-f]{64}$/.test(v.ultimoLote.hash));
  // Caduca el cerrojo de la otra: escribe.
  pasa(20000);
  const r = await cuenta.escribirContadores();
  assert.equal(r.escrito, true, JSON.stringify(r));
  assert.equal(r.suma.cuentas, 1);
});

test('el ciclo escribe cada 10 minutos, también con el respaldo de cuentas en pausa', opciones, async () => {
  const { cuenta } = X;
  await cuenta.guardarConfig({ activo: false });
  await nace('Mar');
  pasa(600000);
  const antes = await txDelRelayer();
  await cuenta.ciclo();
  assert.equal(await txDelRelayer(), antes + 1, 'el ciclo escribió el lote');
  await nace('Nico');
  pasa(60000);
  await cuenta.ciclo();
  assert.equal(await txDelRelayer(), antes + 1, 'al minuto no vuelve a escribir');
  await cuenta.guardarConfig({ contadoresActivos: false });
  pasa(600000);
  await cuenta.ciclo();
  assert.equal(await txDelRelayer(), antes + 1, 'en pausa no escribe');
  await cuenta.guardarConfig({ contadoresActivos: true });
  await cuenta.ciclo();
  assert.equal(await txDelRelayer(), antes + 2, 'al reanudar escribe lo que esperaba (Nico)');
  assert.equal((await leerFactura()).lotes > 0, true);
});

test('las rutas del centro de control son de administrador', opciones, async () => {
  const rutas = [];
  const app = { get: (r, ...mw) => rutas.push(['GET', r, mw]), post: (r, ...mw) => rutas.push(['POST', r, mw]) };
  const adminAuth = () => {}, apiLimiter = () => {}, strictLimiter = () => {};
  X.cuenta.montarRutas(app, { adminAuth, apiLimiter, strictLimiter });
  const get = rutas.find((r) => r[0] === 'GET' && r[1] === '/api/admin/contadores');
  const post = rutas.find((r) => r[0] === 'POST' && r[1] === '/api/admin/contadores/escribir');
  assert.ok(get && post);
  assert.equal(get[2][0], adminAuth); assert.equal(post[2][0], adminAuth);
  assert.equal(post[2][1], strictLimiter);
  if (fs.existsSync(SERVIDOR)) {
    const srv = fs.readFileSync(SERVIDOR, 'utf8');
    assert.match(srv, /chainId: \(\) => Number\(CHAIN_ID\),\r?\n\s*explorador: \(\) => EXPLORER_URL,/, 'server2.js le pasa la cadena y el explorador');
  }
});

test('una factura estropeada no se toca', opciones, async () => {
  const { cuenta, contrato } = X;
  const f = await leerFactura();
  // Alguien suma por encima de la marca: los campos ya no se pueden leer.
  await (await contrato.increaseInvoiceQuantity(f.id, 1n << 240n)).wait();
  const antes = await txDelRelayer();
  await assert.rejects(cuenta.escribirContadores(), /contadores_factura_rota/);
  assert.equal(await txDelRelayer(), antes, 'no escribe encima');
  await assert.rejects(cuenta.leerContadores(), /contadores_factura_rota/);
});
