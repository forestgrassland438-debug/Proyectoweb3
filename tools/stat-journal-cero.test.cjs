'use strict';
/* (2026-11-19) "❌ liquidación [oro] de 0x25bf…: stat_invoice_quantity_invalid" (también plata y bronce).
 *
 * Desde 2026-11 las cuentas NUEVAS crean su factura de oro, plata y bronce con 0
 * (STAT_INITIAL_MAP: "new wallets do not create unbacked money") y el contrato lo
 * permite a propósito (createInvoice admite _cantidad == 0). Pero el diario de stats
 * (stat-chain-journal.js) leía la factura y, si su cantidad era < 1, lanzaba
 * stat_invoice_quantity_invalid: esas tres facturas no podían SUBIR nunca, y el
 * liquidador lo repetía cada 20 s para siempre.
 *
 * Contrato REAL (Desktop/rr.txt.txt compilado) en ganache, Mongo de verdad (el mongod de
 * la caché) y el diario de verdad. Se salta si falta alguna pieza:
 *   GF_TEST_DEPS (node_modules con ganache, solc, @openzeppelin), GF_MONGOOSE, GF_MONGOD,
 *   GF_CONTRATO, GF_JOURNAL. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');

const BIN = path.resolve(__dirname, '..');
const DEPS = process.env.GF_TEST_DEPS || 'C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules';
const MONGOOSE = process.env.GF_MONGOOSE || path.join(BIN, 'GrasslandBuild/repositories/backend/node_modules/mongoose');
const MONGOD = process.env.GF_MONGOD || path.join(BIN, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.14.exe');
const CONTRATO = process.env.GF_CONTRATO || 'C:/Users/pc/Desktop/rr.txt.txt';
const JOURNAL = process.env.GF_JOURNAL || 'C:/Users/pc/Desktop/stat-chain-journal.js';
const FALTA = [path.join(DEPS, 'ganache'), path.join(DEPS, 'solc'), path.join(DEPS, '@openzeppelin'), MONGOOSE, MONGOD, CONTRATO, JOURNAL]
  .filter((p) => !fs.existsSync(p));
const opciones = FALTA.length ? { skip: 'falta ' + FALTA.join(', ') } : { timeout: 120000 };

const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer(); s.unref(); s.on('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

let mongod = null, conn = null, datos = null, cadena = null;

before(async () => {
  if (FALTA.length) return;
  // Una instancia propia de mongoose (el diario usa mongoose.Schema / mongoose.model como server2).
  const { Mongoose } = require(MONGOOSE);
  datos = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-journal-db-'));
  const puerto = await puertoLibre();
  mongod = cp.spawn(MONGOD, ['--dbpath', datos, '--port', String(puerto), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore', windowsHide: true });
  for (let k = 0; k < 80 && !conn; k++) {
    const m = new Mongoose();
    try { await m.connect('mongodb://127.0.0.1:' + puerto + '/gfjournal', { serverSelectionTimeoutMS: 800 }); conn = m; }
    catch (_) { try { await m.disconnect(); } catch (e) {} await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(conn, 'no arrancó el mongod de prueba');

  const ethers = require('ethers');
  const ganache = require(path.join(DEPS, 'ganache'));
  const solc = require(path.join(DEPS, 'solc'));
  const fuente = fs.readFileSync(CONTRATO, 'utf8');
  const salida = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Game.sol': { content: fuente } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } }),
  { import: (p) => ({ contents: fs.readFileSync(path.join(DEPS, p), 'utf8') }) }));
  assert.equal((salida.errors || []).filter((e) => e.severity === 'error').length, 0, JSON.stringify(salida.errors));
  const art = salida.contracts['Game.sol'].InvoiceSystem;
  const rpc = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 2 }, chain: { chainId: 1337 } });
  const provider = new ethers.BrowserProvider(rpc); provider.pollingInterval = 20;
  const cuentas = Object.entries(rpc.getInitialAccounts());
  const relayer = new ethers.Wallet(cuentas[0][1].secretKey, provider);
  const jugador = cuentas[1][0].toLowerCase();
  const contrato = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, relayer).deploy(relayer.address);
  await contrato.waitForDeployment();
  for (const t of ['oro', 'plata', 'bronce']) await (await contrato.setLimit(t, 1000000000000n, 1000000000n)).wait();
  // La factura de una cuenta NUEVA: nace con 0 (lo que hace el sync con STAT_INITIAL_MAP).
  const ids = {};
  for (const t of ['oro', 'plata', 'bronce']) {
    const r = await (await contrato.createInvoice(jugador, t, 0, 'st:' + t + ':' + jugador)).wait();
    ids[t] = Number(r.logs.map((l) => { try { return contrato.interface.parseLog(l); } catch (_) { return null; } })
      .find((p) => p && p.name === 'InvoiceCreated').args.id);
  }
  const nonce = async () => provider.getTransactionCount(relayer.address, 'pending');
  const journal = require(JOURNAL)({ mongoose: conn, ethers, crypto, wallet: () => relayer, nonce, deadSignatureWaitMs: 50 });
  await journal.Intent.init();
  cadena = { ethers, provider, relayer, jugador, contrato, ids, journal, rpc };
});

after(async () => {
  try { if (conn) await conn.disconnect(); } catch (_) {}
  try { if (cadena && cadena.rpc) await cadena.rpc.disconnect(); } catch (_) {}
  // mongod suelta sus archivos al SALIR: borrar antes deja 300 MB por ejecución en %TEMP% (Windows).
  if (mongod) { const fuera = new Promise((ok) => { mongod.once('exit', ok); setTimeout(ok, 8000).unref(); }); try { mongod.kill(); } catch (_) {} await fuera; }
  try { if (datos) fs.rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (_) {}
});

test('una factura de oro/plata/bronce creada a 0 SÍ se puede subir (el liquidador no se atasca)', opciones, async () => {
  const { contrato, ids, journal } = cadena;
  for (const [t, objetivo] of [['oro', 3], ['plata', 250], ['bronce', 1500]]) {
    assert.equal(Number((await contrato.getInvoice(ids[t])).cantidad), 0, t + ' nace a 0');
    const r = await journal.apply(contrato, t, ids[t], objetivo, 1000000000n);
    assert.deepEqual({ ok: r.ok, chainQty: r.chainQty, error: r.error }, { ok: true, chainQty: objetivo, error: undefined }, t + ': ' + JSON.stringify(r));
    assert.equal(Number((await contrato.getInvoice(ids[t])).cantidad), objetivo, t + ': la cadena tiene el valor pedido');
  }
});

test('lo que no se puede tocar sigue rechazado: factura inactiva, otro tipo y objetivo 0', opciones, async () => {
  const { contrato, ids, journal, jugador } = cadena;
  // Otro tipo: la factura de plata no se mueve como si fuera oro.
  const plataAntes = Number((await contrato.getInvoice(ids.plata)).cantidad);
  const otro = await journal.apply(contrato, 'oro', ids.plata, 999, 1000000000n);
  assert.equal(otro.ok, false);
  assert.ok(['stat_invoice_not_active', 'stat_intent_identity_mismatch'].includes(otro.error), otro.error);
  assert.equal(Number((await contrato.getInvoice(ids.plata)).cantidad), plataAntes, 'la plata no se movió');
  // Objetivo 0: el piso de 1 lo pone applyStatOnChain; el diario nunca baja una factura a 0.
  await assert.rejects(() => journal.apply(contrato, 'oro', ids.oro, 0, 1000000000n), /stat_invalid_target/);
  // Inactiva: bajar a 0 la desactiva (lo hace el contrato) y ya no se reutiliza.
  await (await contrato.setLimit('vida', 1000000, 100)).wait();
  const r = await (await contrato.createInvoice(jugador, 'vida', 5, 'st:vida:' + jugador)).wait();
  const idVida = Number(r.logs.map((l) => { try { return contrato.interface.parseLog(l); } catch (_) { return null; } })
    .find((p) => p && p.name === 'InvoiceCreated').args.id);
  await (await contrato.decreaseInvoiceQuantity(idVida, 5)).wait();
  const muerta = await journal.apply(contrato, 'vida', idVida, 50, 1000000000n);
  assert.equal(muerta.ok, false); assert.equal(muerta.error, 'stat_invoice_not_active');
});
