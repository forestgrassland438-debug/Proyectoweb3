'use strict';
/* (2026-11-19) LA CUENTA EN LA CADENA (Desktop/cuenta-en-cadena.js).
 *
 * "Que no se reinicie si hay un borrado del backend": tutorial, habilidades,
 * misiones, ranking, amigos, invitados, Lands, privados, la cartera del inicio con
 * Google y la ficha de la cuenta. Con microtransacciones y sin tocar el contrato.
 *
 * Contrato REAL (Desktop/rr.txt.txt) en ganache, Mongo de verdad (el mongod de la
 * caché) y el módulo de verdad. Se BORRA el backend y se recupera de la cadena.
 * Se salta si falta alguna pieza (GF_TEST_DEPS, GF_MONGOOSE, GF_MONGOD, GF_CONTRATO, GF_CUENTA). */
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
    MensajePrivado: m.model('MensajePrivado', new S({ de: String, para: String, deNombre: { type: String, default: '---' }, texto: String, ts: { type: Date, default: Date.now },
      leido: { type: Boolean, default: false }, editado: { type: Boolean, default: false }, re: { type: Object, default: null },
      reacciones: { type: Array, default: [] }, ocultoPara: { type: [String], default: [] } }, { collection: 'player_dms', versionKey: false })),
    Construccion: m.model('Construccion', new S({ playerName: String, address: { type: String, lowercase: true }, tipo: String, gx: Number, gy: Number,
      ancho: Number, alto: Number, invoiceId: { type: Number, default: null }, manualId: { type: String, default: null },
      devolucionPendiente: { type: Boolean, default: false }, escala: Number, contenido: { type: Array, default: [] } }, { timestamps: true, versionKey: false })),
    UserActivity: m.model('UserActivity', new S({ playerName: String, codigoInvitacion: String, invitadoPor: String, invitadoEn: Date, discord: String }, { timestamps: true }))
  };
}

before(async () => {
  if (FALTA.length) return;
  const { Mongoose } = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-cuenta-db-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !db; k++) {
    const m = new Mongoose();
    try { await m.connect('mongodb://127.0.0.1:' + puerto + '/gfcuenta', { serverSelectionTimeoutMS: 800 }); db = m; }
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
  const [A, B, C] = cuentas.slice(1, 4).map((x) => x[0].toLowerCase());
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
  const nivelPorExperiencia = (e) => { let n = 0; while (n < 150 && e >= Math.min(200 * 2 ** Math.min(n, 40), 100 * (n + 1) ** 2 + 100 * (n + 1))) n++; return n; };
  const cuenta = require(CUENTA)({ mongoose: db, ethers, crypto, zlib, log: { log() {}, warn() {}, error() {} },
    wallet: () => relayer, direccionContrato: () => contrato.target, proveedor: () => provider, txRelayer, modelos: M,
    temporadaActual: async () => 3, nivelPorExperiencia, claveRespaldo: () => 'clave-de-prueba-del-respaldo', pausaEscaneoMs: 0 });
  X = { ethers, provider, relayer, contrato, M, A, B, C, cuenta, enviadas, nivelPorExperiencia, rpc };
});

after(async () => {
  try { if (X) X.cuenta.detener(); } catch (_) {}
  try { if (db) await db.disconnect(); } catch (_) {}
  try { if (X && X.rpc) await X.rpc.disconnect(); } catch (_) {}
  // mongod suelta sus archivos al SALIR: borrar antes deja 300 MB por ejecución en %TEMP% (Windows).
  if (mongod) { const fuera = new Promise((ok) => { mongod.once('exit', ok); setTimeout(ok, 8000).unref(); }); try { mongod.kill(); } catch (_) {} await fuera; }
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (_) {}
});

const enCadena = async (mid) => {
  const r = await X.contrato.getInvoiceByManualIdSafe(mid);
  return r[1] ? { id: r[0].id, owner: r[0].owner.toLowerCase(), tipo: r[0].tipo, cantidad: r[0].cantidad } : null;
};
const COMPLETADO = new Date('2026-11-01T12:34:56.789Z');

// ── Las piezas puras ─────────────────────────────────────────────────────────
test('empaquetar: cada campo vuelve igual, satura en su máximo y nunca da 0', { skip: !puras }, () => {
  const F = puras.FORMATOS.habilidades;
  const v = puras.empaquetar(F, { agricultura: 1234, mineria: 50, deforestacion: 0, pesca: 7, cocina: 2 ** 40, fuerza: 3 });
  assert.deepEqual({ ...puras.desempaquetar(F, v), _marca: undefined },
    { agricultura: 1234, mineria: 50, deforestacion: 0, pesca: 7, cocina: 4294967295, fuerza: 3, _marca: undefined });
  assert.ok(puras.empaquetar(F, {}) > 0n, 'todo a cero sigue siendo una cantidad válida (la factura no se desactiva)');
  for (const [t, f] of Object.entries(puras.FORMATOS)) assert.ok(puras.empaquetar(f, {}) < (puras.TABLAS[t].porFactura), t + ': cabe en su tope por factura');
  const tut = puras.empaquetarTutorial(22, COMPLETADO);
  assert.equal(puras.desempaquetarTutorial(tut).paso, 22);
  assert.equal(puras.desempaquetarTutorial(tut).terminadoEn.toISOString(), '2026-11-01T12:34:56.000Z');
  assert.ok(puras.empaquetarTutorial(21, null) < tut, 'terminar siempre SUBE la cantidad (solo aumentos)');
});

test('manualId: todos caben en 64 bytes y se leen de vuelta', { skip: !puras }, () => {
  const a = '0x' + 'f'.repeat(40), b = '0x' + '0'.repeat(39) + '1';
  const mids = [puras.MANUAL.tutorial(a), puras.MANUAL.amigo(a, b), puras.MANUAL.invitado(b), puras.MANUAL.codigo('ABCDEFGH'),
    puras.MANUAL.land({ tipo: 'espantapajaros', gx: 999999, gy: 999999 }, a), puras.MANUAL.cabeza()];
  for (const m of mids) assert.ok(Buffer.byteLength(m) <= 64, m + ' (' + m.length + ')');
  assert.deepEqual(puras.leerManual(puras.MANUAL.amigo(a, b)), { tabla: 'amigos', yo: a, otro: b });
  assert.deepEqual(puras.leerManual(puras.MANUAL.land({ tipo: 'cofre2', gx: 10, gy: 12 }, a)), { tabla: 'lands', tipo: 'cofre2', gx: 10, gy: 12, dir: a });
  assert.equal(puras.leerManual('zanahoria'), null);
  assert.equal(puras.esTablaDeCuenta('cta_amigos'), true);
  assert.equal(puras.esTablaDeCuenta('oro'), false);
});

test('el ancla va cifrada y no se puede alterar', { skip: !puras }, () => {
  const k = puras.claveDerivada(crypto, 'una-clave');
  const lote = { dms: [{ x: 'mensaje secreto para Bea' }] };
  const bytes = puras.cifrarLote(crypto, zlib, k, lote);
  assert.ok(!bytes.toString('latin1').includes('secreto'), 'no se lee nada en claro');
  assert.deepEqual(puras.descifrarLote(crypto, zlib, k, bytes), lote);
  const mal = Buffer.from(bytes); mal[mal.length - 1] ^= 1;
  assert.throws(() => puras.descifrarLote(crypto, zlib, k, mal));
  assert.throws(() => puras.descifrarLote(crypto, zlib, puras.claveDerivada(crypto, 'otra'), bytes));
});

// ── Con la cadena y Mongo de verdad ──────────────────────────────────────────
test('tutorial, habilidades, misiones y ranking: una transacción por tabla; sin cambios, ninguna', opciones, async () => {
  const { M, A, cuenta, provider, relayer, nivelPorExperiencia } = X;
  // El panel mira antes de que exista nada: su caché se queda con "no existe" (la prueba del estado lo necesita).
  const previo = await cuenta.estado();
  assert.equal(previo.tablas.tutorial.existe, false);
  await M.GamePlayer.create({ playerName: 'Ana', address: A, Username: 'Ana', tutorial: 22, tutorialCompletedAt: COMPLETADO, misiones: 7,
    agricultura_exp: 1234, agricultura: nivelPorExperiencia(1234), mineria_exp: 50, petWins: 4, petBattles: 9 });
  await M.MissionsPlayer.create({ playerName: 'Ana', misionesCompletadas: 7, misiones_granjero: 5, misiones_guardian: 2, estadomision: 1 });
  await M.BattleScore.create({ seasonNumber: 3, playerName: 'Ana', points: 120, wins: 4, losses: 2, battles: 6, bestStreak: 3, streak: 1 });
  const r = await cuenta.sincronizarJugador('Ana');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.escritas.sort(), ['habilidades', 'misiones', 'ranking', 'tutorial']);
  // Contra el servidor real el panel seguía diciendo "no existe" hasta 60 s después (su caché).
  assert.equal((await cuenta.estado()).tablas.tutorial.existe, true, 'el estado ve la tabla en cuanto se crea');
  const tut = await enCadena('tu:' + A);
  assert.equal(tut.tipo, 'cta_tutorial'); assert.equal(tut.owner, A);
  assert.equal(tut.cantidad, BigInt(Math.floor(COMPLETADO.getTime() / 1000)) * 256n + 22n);
  const hb = puras.desempaquetar(puras.FORMATOS.habilidades, (await enCadena('hb:' + A)).cantidad);
  assert.equal(hb.agricultura, 1234); assert.equal(hb.mineria, 50);
  const mi = puras.desempaquetar(puras.FORMATOS.misiones, (await enCadena('mi:' + A)).cantidad);
  assert.deepEqual([mi.completadas, mi.granjero, mi.guardian, mi.total, mi.estado], [7, 5, 2, 7, 1]);
  const rk = puras.desempaquetar(puras.FORMATOS.ranking, (await enCadena('rk:' + A)).cantidad);
  assert.deepEqual([rk.temporada, rk.puntos, rk.victorias, rk.derrotas, rk.petWins, rk.petBattles], [3, 120, 4, 2, 4, 9]);

  const antes = await provider.getTransactionCount(relayer.address);
  const otra = await cuenta.sincronizarJugador('Ana');
  assert.deepEqual(otra.escritas, []);
  assert.equal(await provider.getTransactionCount(relayer.address), antes, 'sin cambios no se gasta ni una comisión');
});

test('lo que cambia mucho espera su intervalo; el panel lo puede forzar', opciones, async () => {
  const { M, A, cuenta, provider, relayer } = X;
  await M.GamePlayer.updateOne({ playerName: 'Ana' }, { $set: { agricultura_exp: 1300 } });
  const antes = await provider.getTransactionCount(relayer.address);
  const r = await cuenta.sincronizarJugador('Ana');
  assert.deepEqual(r.aplazadas, ['habilidades']);
  assert.equal(await provider.getTransactionCount(relayer.address), antes, 'aplazado: ninguna transacción');
  const f = await cuenta.sincronizarJugador('Ana', { forzar: true });
  assert.ok(f.escritas.includes('habilidades'));
  assert.equal(puras.desempaquetar(puras.FORMATOS.habilidades, (await enCadena('hb:' + A)).cantidad).agricultura, 1300);
});

test('amigos (cada lado el suyo), invitación y lo construido en la isla; deshacer quema', opciones, async () => {
  const { M, A, B, C, cuenta } = X;
  await M.GamePlayer.create({ playerName: 'Bea', address: B, Username: 'Bea' });
  await M.GamePlayer.create({ playerName: 'Ciro', address: C, Username: 'Ciro' });
  await M.Amistad.create({ playerName: 'Ana', amigos: [{ playerName: 'Bea' }] });
  await M.Amistad.create({ playerName: 'Bea', amigos: [{ playerName: 'Ana' }] });
  await M.UserActivity.create({ playerName: 'Ana', codigoInvitacion: 'ANA23456' });
  await M.UserActivity.create({ playerName: 'Ciro', invitadoPor: 'Ana' });
  await M.Construccion.create({ playerName: 'Ana', address: A, tipo: 'cofre2', gx: 10, gy: 12, ancho: 2, alto: 2, escala: 2 });
  await M.Construccion.create({ playerName: 'Ana', address: A, tipo: 'parcela', gx: 4, gy: 4, ancho: 2, alto: 2, escala: 2, invoiceId: 77, manualId: 'cq:4.4:x' });
  for (const p of ['Ana', 'Bea', 'Ciro']) assert.equal((await cuenta.sincronizarJugador(p, { forzar: true })).ok, true);
  const ab = await enCadena(puras.MANUAL.amigo(A, B)), ba = await enCadena(puras.MANUAL.amigo(B, A));
  assert.equal(ab.owner, A); assert.equal(ba.owner, B); assert.equal(ab.tipo, 'cta_amigos');
  assert.equal((await enCadena('ic:ANA23456')).owner, A);
  assert.equal((await enCadena(puras.MANUAL.invitado(C))).owner, A, 'la marca del invitado es de quien invitó');
  const land = await enCadena(puras.MANUAL.land({ tipo: 'cofre2', gx: 10, gy: 12 }, A));
  assert.deepEqual(puras.leerCantidadLand(land.cantidad), { ancho: 2, alto: 2, escala: 2 });
  assert.equal(await enCadena(puras.MANUAL.land({ tipo: 'parcela', gx: 4, gy: 4 }, A)), null, 'la parcela ya va en cons_parcelas');
  // Se deshace la amistad: cada uno quema su lado.
  await M.Amistad.updateMany({}, { $set: { amigos: [], updatedAt: new Date() } });
  await cuenta.sincronizarJugador('Ana'); await cuenta.sincronizarJugador('Bea');
  assert.equal(await enCadena(puras.MANUAL.amigo(A, B)), null);
  assert.equal(await enCadena(puras.MANUAL.amigo(B, A)), null);
  // Y vuelven a ser amigos (para lo que sigue).
  await M.Amistad.updateOne({ playerName: 'Ana' }, { $set: { amigos: [{ playerName: 'Bea' }] } });
  await M.Amistad.updateOne({ playerName: 'Bea' }, { $set: { amigos: [{ playerName: 'Ana' }] } });
  await cuenta.sincronizarJugador('Ana'); await cuenta.sincronizarJugador('Bea');
  assert.ok(await enCadena(puras.MANUAL.amigo(A, B)));
});

test('el ancla cifrada: privados, cartera de Google y ficha; sin novedades no se manda nada', opciones, async () => {
  const { M, cuenta, provider } = X;
  assert.equal((await cuenta.estado()).tablas.respaldo.existe, false, 'la tabla del ancla aún no existe');
  const viejo = new Date(Date.now() - 60 * 60000);
  await M.MensajePrivado.create({ de: 'Ana', para: 'Bea', deNombre: 'Ana', texto: 'hola Bea, nos vemos en el pozo', ts: viejo });
  await M.MensajePrivado.create({ de: 'Bea', para: 'Ana', deNombre: 'Bea', texto: 'vale!', ts: viejo, reacciones: [{ emoji: '👍', quienes: ['Ana'] }] });
  await db.connection.collection('social_wallets').insertOne({ subHash: 'g:abc', address: X.A, deviceShares: [{ deviceId: 'd1', ct: 'xx', lastUsedAt: new Date() }],
    recoveryEnc: { salt: 's', iv: 'i', ct: 'c' }, createdAt: new Date(), updatedAt: new Date() });
  const r = await cuenta.anclar();
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.enviado, true);
  assert.equal(r.dms, 2); assert.equal(r.carteras, 1); assert.ok(r.cuentas >= 3);
  assert.equal((await cuenta.estado()).tablas.respaldo.existe, true, 'y el panel la ve al momento, sin esperar su caché');
  const tx = await provider.getTransaction(r.hash);
  assert.ok(!Buffer.from(tx.data.slice(2), 'hex').toString('latin1').includes('pozo'), 'en la cadena no se lee el privado');
  const otra = await cuenta.anclar();
  assert.equal(otra.enviado, false, 'sin nada nuevo no se gasta una transacción');
});

test('BORRADO DEL BACKEND: todo vuelve desde la cadena (y lo más nuevo de Mongo no se pisa)', opciones, async () => {
  const { M, A, C, cuenta } = X;
  // El borrado: se van todas las colecciones del juego y el estado del respaldo.
  for (const Mo of Object.values(M)) await Mo.deleteMany({});
  await db.connection.collection('social_wallets').deleteMany({});
  await db.connection.collection('cuenta_cadena').deleteMany({});
  await db.connection.collection('cuenta_cadena_firmas').deleteMany({});
  const t = await cuenta.restaurarTodo({});
  for (let i = 0; i < 400 && t.estado === 'en_curso'; i++) await espera(50);
  assert.equal(t.estado, 'hecho', t.error);
  const ana = await M.GamePlayer.findOne({ playerName: 'Ana' }).lean();
  assert.ok(ana, 'la ficha de Ana vuelve (del ancla)');
  assert.equal(ana.address, A); assert.equal(ana.Username, 'Ana');
  assert.equal(ana.tutorial, 22, 'el tutorial NO vuelve a empezar');
  // La ficha del ancla trae la fecha exacta (la tabla cta_tutorial la guarda al segundo).
  assert.equal(new Date(ana.tutorialCompletedAt).toISOString(), COMPLETADO.toISOString());
  assert.equal(ana.agricultura_exp, 1300); assert.equal(ana.misiones, 7); assert.equal(ana.petWins, 4);
  const mp = await M.MissionsPlayer.findOne({ playerName: 'Ana' }).lean();
  assert.deepEqual([mp.misionesCompletadas, mp.misiones_granjero, mp.misiones_guardian], [7, 5, 2]);
  const bs = await M.BattleScore.findOne({ playerName: 'Ana', seasonNumber: 3 }).lean();
  assert.deepEqual([bs.points, bs.wins, bs.losses], [120, 4, 2]);
  assert.deepEqual((await M.Amistad.findOne({ playerName: 'Ana' }).lean()).amigos.map((a) => a.playerName), ['Bea']);
  assert.deepEqual((await M.Amistad.findOne({ playerName: 'Bea' }).lean()).amigos.map((a) => a.playerName), ['Ana']);
  assert.equal((await M.UserActivity.findOne({ playerName: 'Ana' }).lean()).codigoInvitacion, 'ANA23456');
  const ciro = await M.GamePlayer.findOne({ address: C }).lean();
  assert.equal((await M.UserActivity.findOne({ playerName: ciro.playerName }).lean()).invitadoPor, 'Ana');
  const cofre = await M.Construccion.findOne({ address: A, tipo: 'cofre2' }).lean();
  assert.deepEqual([cofre.gx, cofre.gy, cofre.ancho, cofre.alto], [10, 12, 2, 2]);
  const dms = await M.MensajePrivado.find({}).sort({ _id: 1 }).lean();
  assert.deepEqual(dms.map((x) => x.texto), ['hola Bea, nos vemos en el pozo', 'vale!']);
  assert.equal(dms[1].reacciones[0].emoji, '👍');
  const w = await db.connection.collection('social_wallets').findOne({ subHash: 'g:abc' });
  assert.ok(w && w.recoveryEnc && w.recoveryEnc.ct === 'c', 'la cartera del inicio con Google vuelve: puede volver a entrar');

  // Lo más nuevo de Mongo no se pisa: más exp de minería que la de la cadena.
  await M.GamePlayer.updateOne({ playerName: 'Ana' }, { $set: { mineria_exp: 999, tutorial: 22 } });
  await cuenta.restaurarJugador('Ana');
  assert.equal((await M.GamePlayer.findOne({ playerName: 'Ana' }).lean()).mineria_exp, 999);
});

test('una cuenta que vuelve a entrar tras el borrado recupera su tutorial al cargar (restaurarSiVacio)', opciones, async () => {
  const { M, A, cuenta } = X;
  await M.GamePlayer.deleteOne({ playerName: 'Ana' });
  await M.GamePlayer.create({ playerName: 'Ana', address: A });               // la cuenta recién creada al iniciar sesión
  const r = await cuenta.restaurarSiVacio('Ana');
  assert.equal(r.ok, true);
  const ana = await M.GamePlayer.findOne({ playerName: 'Ana' }).lean();
  assert.equal(ana.tutorial, 22);
  assert.equal(ana.agricultura_exp, 1300);
});

test('(server2 real, sonda local) tutorial a 0 con otras habilidades guardadas: al cargar también se recupera', opciones, async () => {
  const { M, cuenta } = X;
  // Visto contra el server2.js de verdad: la regla de "cuenta nueva" exigía TODO a cero y una
  // cuenta con algo de minería y el tutorial perdido volvía a empezar el tutorial.
  await M.GamePlayer.updateOne({ playerName: 'Ana' }, { $set: { tutorial: 0, tutorialCompletedAt: null, mineria_exp: 999 } });
  const r = await cuenta.restaurarSiVacio('Ana');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await M.GamePlayer.findOne({ playerName: 'Ana' }).lean()).tutorial, 22, 'el tutorial no vuelve a empezar');
});

test('una amistad con UN solo lado en la cadena (el otro la quitó) no se repone', opciones, async () => {
  const { M, A, C, contrato, cuenta } = X;
  // Ana tiene su lado con Ciro, pero Ciro no tiene el suyo (la quitó y quemó su factura).
  await (await contrato.createInvoice(A, 'cta_amigos', 1, puras.MANUAL.amigo(A, C))).wait();
  await M.Amistad.deleteOne({ playerName: 'Ana' });
  const r = await cuenta.restaurarJugador('Ana');
  assert.equal(r.ok, true);
  assert.deepEqual((await M.Amistad.findOne({ playerName: 'Ana' }).lean()).amigos.map((a) => a.playerName), ['Bea'],
    'Bea (los dos lados) vuelve; Ciro (un lado) no');
});

test('ENSAMBLADO: los campos que lee el módulo existen con ese nombre en server2.js', { skip: !fs.existsSync(SERVIDOR) }, () => {
  const s = fs.readFileSync(SERVIDOR, 'utf8');
  for (const campo of ['tutorialCompletedAt:', 'agricultura_exp:', 'deforestacion_exp:', 'misiones_granjero:', 'misiones_guardian:', 'estadomision1:',
    'bestStreak:', 'petWins:', 'petBattles:', 'limpiezaDM:', 'ocultoPara:', 'codigoInvitacion:', 'invitadoPor:', 'devolucionPendiente:', 'contenido:']) {
    assert.ok(s.includes(campo), 'server2.js ya no tiene ' + campo);
  }
  assert.ok(/collection: 'player_friends'/.test(s) && /collection: 'player_dms'/.test(s));
});
