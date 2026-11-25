'use strict';
/* (2026-11-02) "No puedo comprar ni vender: Your operation is recorded for chain review".
 *
 * Prueba de punta a punta con Mongo de verdad (réplica, transacciones) y el
 * contrato real compilado, sobre el código REAL sacado por AST de server2.js:
 * RelayerNonceManager, mintGatherReward, burnItemOnChain, ecoTiendaResolver y la
 * ruta /api/economia/tienda. Arranca en el estado exacto de producción: el
 * contador persistente del relayer muy por delante de la cadena y un nodo que,
 * como el secuenciador de LitVM, RECHAZA los nonces altos sin guardarlos.
 *
 * No se ejecuta con `node --test` (necesita las dependencias de pruebas de
 * .codex/tmp); se lanza a mano: node tools/shop-relayer-stall-integration.cjs */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), vm = require('node:vm'), acorn = require('acorn');
const temp = 'C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules';
const mongoose = require(temp + '/mongoose'), { MongoMemoryReplSet } = require(temp + '/mongodb-memory-server'), ganache = require(temp + '/ganache'), solc = require(temp + '/solc'), ethers = require('ethers');
const SERVIDOR = process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js';
const backend = fs.readFileSync(SERVIDOR, 'utf8'), ast = acorn.parse(backend, { ecmaVersion: 'latest' });
const quiet = { log() {}, warn() {}, error() {} };

const decl = (name) => {
  for (const n of ast.body) {
    if (n.id?.name === name) return backend.slice(n.start, n.end);
    if (n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === name)) return backend.slice(n.start, n.end);
  }
  throw Error('Declaración ausente: ' + name);
};
const ruta = (url) => {
  const n = ast.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' &&
    n.expression.callee.type === 'MemberExpression' && n.expression.callee.object.name === 'app' &&
    n.expression.arguments[0]?.value === url);
  if (!n) throw Error('Ruta ausente: ' + url);
  return backend.slice(n.start, n.end);
};

let fallos = 0;
const check = (ok, etiqueta, detalle) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + etiqueta + (ok || detalle === undefined ? '' : ' -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};

let mongo, connection, rpc, provider;
(async () => {
  try {
    mongo = await MongoMemoryReplSet.create({ binary: { version: '7.0.14' }, replSet: { count: 1, storageEngine: 'wiredTiger', spawn: { windowsHide: true } } });
    connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'stall_audit', maxPoolSize: 12 }).asPromise();
    rpc = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 }, chain: { chainId: 1337 } });
    provider = new ethers.BrowserProvider(rpc); provider.pollingInterval = 20;
    const accounts = Object.entries(rpc.getInitialAccounts());
    const owner = new ethers.Wallet(accounts[0][1].secretKey, provider), jugador = accounts[1][0].toLowerCase();

    // El contrato real.
    const source = fs.readFileSync('C:/Users/pc/Desktop/rr.txt.txt', 'utf8');
    const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Game.sol': { content: source } },
      settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } }),
      { import: p => ({ contents: fs.readFileSync(path.join(temp, p), 'utf8') }) }));
    assert.equal((compiled.errors || []).filter(e => e.severity === 'error').length, 0);
    const art = compiled.contracts['Game.sol'].InvoiceSystem;
    const contrato = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, owner).deploy(owner.address);
    await contrato.waitForDeployment();
    await (await contrato.setLimit('bolsa zanahorias', 100000, 50)).wait();
    await (await contrato.createInvoice(jugador, 'bolsa zanahorias', 5, 'inicial-1')).wait();

    /* EL NODO DE LITVM. Un nonce por delante de la cuenta se RECHAZA y no se
       guarda: por eso `pending` == `latest` durante todo el atasco. */
    const difundir = provider.broadcastTransaction.bind(provider);
    let nodoCaido = 0, sinRespuesta = 0;
    // Directo al nodo: el provider guarda las lecturas 250 ms y el nodo no puede ver el pasado.
    const nonceDe = async (direccion) => parseInt(await rpc.request({ method: 'eth_getTransactionCount', params: [direccion, 'latest'] }), 16);
    provider.broadcastTransaction = async (firmada) => {
      if (nodoCaido > 0) { nodoCaido--; throw Object.assign(new Error('Bandwidth limit exceeded'), { code: 'SERVER_ERROR', error: { code: -31002, message: 'Bandwidth limit exceeded' } }); }
      const tx = ethers.Transaction.from(firmada);
      const estado = await nonceDe(tx.from);
      if (tx.nonce > estado) throw Object.assign(new Error(`could not coalesce error (error={ "code": -32000, "message": "nonce too high: address ${tx.from}, tx: ${tx.nonce} state: ${estado}" }, code=UNKNOWN_ERROR)`), { code: 'UNKNOWN_ERROR' });
      if (tx.nonce < estado) throw Object.assign(new Error(`nonce has already been used (error={ "message": "nonce too low: address ${tx.from}, tx: ${tx.nonce} state: ${estado}" }, code=NONCE_EXPIRED)`), { code: 'NONCE_EXPIRED' });
      const r = await difundir(firmada);
      if (sinRespuesta > 0) { sinRespuesta--; throw new Error('network response lost after send'); }
      return r;
    };

    // Los modelos reales del servidor.
    const db = { Schema: mongoose.Schema, Types: mongoose.Types, models: connection.models, model: (...a) => connection.model(...a), connection,
      startSession: (...a) => connection.startSession(...a) };
    const PlayerStats = connection.model('PlayerStats', new mongoose.Schema({ playerName: { type: String, unique: true }, oro: Number, plata: Number, bronce: Number,
      chainPending: [String], chainPendingSince: Date }, { strict: false, versionKey: false }));
    const rutas = new Map();
    const res = () => { let st = 200, cuerpo; return { status(n) { st = n; return this; }, json(o) { cuerpo = o; return this; }, set() { return this; }, get resultado() { return { st, cuerpo: cuerpo && JSON.parse(JSON.stringify(cuerpo)) }; } }; };
    const c = {
      console: quiet, ethers, crypto, Date, Math, Number, String, Map, Set, Promise, BigInt, JSON, Object, Array, Error, RegExp, setTimeout, clearTimeout,
      mongoose: db, provider, relayerWallet: owner, CHAIN_ID: 1337, FIXED_GAS_PRICE_GWEI: null, MIN_GAS_PRICE_GWEI: '5',
      CONTRACTS: { ITEMS_CONTRACT: { address: await contrato.getAddress(), abi: art.abi } }, PlayerStats,
      GF_CROP_CATALOG: { items: {}, tables: [] }, ITEM_TIPO_MAP: { Semillax: 'bolsa zanahorias' }, ITEM_MAX_STACK: { Semillax: 50 },
      TABLAS_MANUALES: new Set(), tiposDeItemPermitidos: () => new Set(['bolsa zanahorias']), facturasGuardadasEnCofres: async () => new Set(),
      itemTipoOnChain: id => id === 'Semillax' ? 'bolsa zanahorias' : null, crearTablaSiFalta: async () => true, resourcePurchaseBatch: async () => null,
      eco2Config: async () => ({}), eco2TrasFoto: async () => {}, economiaHoy: async () => null, eco2PrecioTienda: id => id === 'Semillax' ? [10, 5, 'p'] : null,
      esFantasma: async () => false, gfNivelDeJugador: async () => 50, gfNivelDeObjeto: () => 1, ECO2_MONEDA_DE: { p: 'plata', o: 'oro', b: 'bronce' },
      TESORO_BRONCE_POR: { bronce: 1, plata: 1000, oro: 1000000 }, TESORO_COMISION_BPS: 500, tesoroParteCircular: n => Math.floor(n * 150 / 500),
      TESORO_ID: 'principal', _diaUTC: () => new Date().toISOString().slice(0, 10), ECO_SUPERVISOR_BASE: { pisoJuego: 5000000, pisoCircular: 100000 },
      enColaDelJugador: (_k, fn) => fn(), jugadorDeLaSesion: async () => ({ playerName: 'Ana', address: jugador }),
      buildStatsResponse: s => ({ oro: s.oro, plata: s.plata, bronce: s.bronce }), economiaApuntar() {},
      app: { post: (url, ...h) => rutas.set(url, h[h.length - 1]) }, strictLimiter() {}, authMiddleware() {}, csrfProtection() {}, adminAuth() {},
      _cero: () => ({ type: Number, default: 0 })
    };
    vm.createContext(c);
    const piezas = ['tesoroSchema', 'Tesoro', 'tesoroMovSchema', 'TesoroMov', 'TESORO_JUEGO_ID', 'TESORO_JUEGO_ORIGENES', 'tesoroJuegoSchema', 'TesoroJuego',
      'tiendaOpSchema', 'TiendaOp', 'servicioCobroSchema', 'ServicioCobro', 'ECO_TIENDA_LIMITES', 'ensureItemTipoOnChain', 'gatherGasPrice',
      'mintGatherReward', 'burnItemOnChain', 'eco2PlanPago', 'ecoError', 'ecoResponderError', 'ecoTransaccion', 'ecoSaldoDisponible', 'ecoTiendaResolver'];
    // Lo nuevo del arreglo: se carga si existe (la misma prueba corre contra el servidor sin arreglar).
    for (const opcional of ['relayerTextoDeError', 'relayerRechazoDeNonce', 'relayerRechazoSeguro', 'relayerEnviarConNonce', 'TIENDA_ATASCO_RELAYER', 'tiendaSaldarAtasco']) {
      try { decl(opcional); piezas.push(opcional); } catch (_) {}
    }
    vm.runInContext(piezas.map(decl).join('\n'), c);
    vm.runInContext(decl('RelayerNonceManager') + '\nvar relayerNonceManager = new RelayerNonceManager();\nthis.relayerNonceManager = relayerNonceManager;' +
      '\nthis.modelos = { Tesoro, TesoroMov, TesoroJuego, TiendaOp, ServicioCobro };\nthis.ecoTiendaResolver = ecoTiendaResolver;' +
      (piezas.includes('tiendaSaldarAtasco') ? '\nthis.tiendaSaldarAtasco = tiendaSaldarAtasco;' : ''), c);
    vm.runInContext(ruta('/api/economia/tienda'), c);
    if (typeof c.relayerNonceManager.vigilar === 'function') c.relayerNonceManager.vigilar(provider);
    const { TesoroJuego, Tesoro, ServicioCobro, TiendaOp } = c.modelos;
    await Promise.all([PlayerStats, TesoroJuego, Tesoro, ServicioCobro, TiendaOp, c.modelos.TesoroMov].map(m => m.init()));
    for (const n of ['relayer_nonce_counters', 'relayer_nonce_reservations']) await connection.createCollection(n).catch(() => {});

    await PlayerStats.create({ playerName: 'Ana', oro: 0, plata: 2946, bronce: 0, chainPending: [] });
    await TesoroJuego.create({ _id: 'juego', saldo: 50000000 });
    await Tesoro.create({ _id: 'principal', saldo: 1000000 });

    const clave = '1337:' + owner.address.toLowerCase();
    const contadores = connection.collection('relayer_nonce_counters');
    const contarCadena = () => nonceDe(owner.address);
    const enCadena = async () => (await contrato.getUserInventorySnapshot(jugador)).filter(i => i.active && i.tipo === 'bolsa zanahorias').reduce((n, i) => n + Number(i.cantidad), 0);
    const valor = async () => {
      const s = await PlayerStats.findOne({ playerName: 'Ana' }).lean(), j = await TesoroJuego.findById('juego').lean(), t = await Tesoro.findById('principal').lean();
      return s.oro * 1e6 + s.plata * 1e3 + s.bronce + j.saldo + t.saldo;
    };
    const tienda = async (cuerpo) => {
      const r = res();
      await rutas.get('/api/economia/tienda')({ body: cuerpo, user: { address: jugador } }, r);
      return r.resultado;
    };
    const compra = (ref, cantidad = 3) => tienda({ op: 'compra', itemId: 'Semillax', cantidad, precioBronce: 10000, ref });
    const venta = (ref, cantidad = 2) => tienda({ op: 'venta', itemId: 'Semillax', cantidad, precioBronce: 5000, ref });

    /* ── EL ATASCO DE PRODUCCIÓN ─────────────────────────────────────────── */
    const nonceReal = await contarCadena();
    const ultimaReserva = new Date();
    await contadores.updateOne({ _id: clave }, { $set: { next: nonceReal + 40, updatedAt: ultimaReserva } }, { upsert: true });
    const valorInicial = await valor(), objetosIniciales = await enCadena();

    const r1 = await compra('atasco-compra-0001');
    check(r1.st === 200 && r1.cuerpo.ok === true && r1.cuerpo.confirmadas === 3, 'con el contador adelantado, la compra sale a la primera', r1);
    check(await enCadena() === objetosIniciales + 3, 'la cadena entrega las 3 semillas compradas', await enCadena());
    check(await contarCadena() > nonceReal, 'el relayer vuelve a minar: el nonce de la cadena avanza', await contarCadena());

    const r2 = await venta('atasco-venta-0001');
    check(r2.st === 200 && r2.cuerpo.ok === true && r2.cuerpo.confirmadas === 2, 'vender también sale', r2);
    check(await enCadena() === objetosIniciales + 1, 'la cadena quema las 2 vendidas', await enCadena());
    check(await valor() === valorInicial, 'comprar y vender conservan cada bronce', [await valor(), valorInicial]);

    const fila = await ServicioCobro.findById('Ana:shop-atasco-compra-0001').lean();
    check(fila?.estado === 'completado' && fila.confirmadas === 3, 'el recibo de la compra queda completado', fila);

    /* ── OTRA RACHA, CON TRÁFICO QUE NO DEJA CADUCAR LA RESERVA ─────────────── */
    const antes = await contarCadena();
    await contadores.updateOne({ _id: clave }, { $set: { next: antes + 25, updatedAt: new Date() } });
    const tres = await Promise.all([compra('racha-0001', 1), compra('racha-0002', 1), compra('racha-0003', 1)]);
    check(tres.every(r => r.st === 200 && r.cuerpo.ok), 'tres compras a la vez sobre un contador adelantado salen las tres', tres);
    const nFinal = await contarCadena();
    check(nFinal >= antes + 3, 'el contador vuelve a seguir a la cadena', [antes, nFinal]);

    /* ── SIN ATASCO NO SE RECICLA NADA ──────────────────────────────────────── */
    const pedidos = await Promise.all(Array.from({ length: 20 }, (_, i) => c.relayerNonceManager.getNextNonce('concurrente-' + i)));
    check(new Set(pedidos).size === 20, '20 reservas a la vez dan 20 nonces distintos', pedidos);
    check(await c.relayerNonceManager.getNextNonce('concurrente-3') === pedidos[3], 'el mismo ticket conserva su nonce mientras siga fresco', pedidos[3]);
    // Se dejan consumidas para seguir limpios.
    await contadores.updateOne({ _id: clave }, { $set: { next: await contarCadena(), updatedAt: new Date(0) } });

    /* ── RECHAZO DEFINITIVO: REEMBOLSO, NO "REVISIÓN" ───────────────────────── */
    const v0 = await valor(), o0 = await enCadena(), s0 = await PlayerStats.findOne({ playerName: 'Ana' }).lean();
    nodoCaido = 40;
    const r3 = await compra('rechazada-0001', 2);
    nodoCaido = 0;
    check(r3.st === 409 && r3.cuerpo.ok === false && !r3.cuerpo.revision && r3.cuerpo.confirmadas === 0, 'un nodo que rechaza todo devuelve el dinero sin "revisión"', r3);
    check(await enCadena() === o0, 'y no se entrega nada', await enCadena());
    check(await valor() === v0, 'el reembolso conserva el valor exacto', [await valor(), v0]);
    const s1 = await PlayerStats.findOne({ playerName: 'Ana' }).lean();
    check(s1.plata * 1000 + s1.bronce === s0.plata * 1000 + s0.bronce, 'el jugador recupera lo pagado, comisión incluida', [s0.plata, s0.bronce, s1.plata, s1.bronce]);
    check((await TesoroJuego.findById('juego').lean()).retenidoServicios === 0, 'no queda nada retenido en el tesoro');
    const r4 = await compra('rechazada-0002', 1);
    check(r4.st === 200 && r4.cuerpo.ok, 'en cuanto el nodo responde, la siguiente compra sale', r4);

    /* ── RESPUESTA PERDIDA: AQUÍ SÍ ES AMBIGUO ─────────────────────────────── */
    await contadores.updateOne({ _id: clave }, { $set: { updatedAt: new Date(0) } });
    const o1 = await enCadena(), v1 = await valor();
    sinRespuesta = 1;
    const r5 = await compra('ambigua-0001', 1);
    check(r5.st === 202 && r5.cuerpo.revision === true, 'si la transacción pudo entrar, sigue en revisión (nunca se repite ni se reembolsa a ciegas)', r5);
    check(await enCadena() === o1 + 1, 'y la cadena solo la ejecutó una vez', await enCadena());
    check((await ServicioCobro.findById('Ana:shop-ambigua-0001').lean()).estado === 'revision', 'el recibo queda en revisión para el panel');
    const r6 = await compra('ambigua-0001', 1);
    check(r6.st === 202 && await enCadena() === o1 + 1, 'repetir la misma referencia no vuelve a acuñar', r6);
    check(await valor() === v1, 'el dinero sigue retenido, no duplicado', [await valor(), v1]);
    await c.ecoTiendaResolver('Ana:shop-ambigua-0001', 1);

    /* ── LAS FIRMAS QUE SE QUEDARON A MEDIAS DURANTE EL ATASCO ─────────────────
       Los diarios guardan los bytes firmados y los reenvían. Con un nonce por
       delante el nodo los rechaza siempre, y si la cadena lo adelanta ya nunca
       se minarán: hay que firmar de nuevo, solo con esa prueba. */
    const nonceFicha = async (ticket) => c.relayerNonceManager.getNextNonce(ticket);
    const directo = async (metodo, ...args) => { const tx = await contrato[metodo](...args, { nonce: await contarCadena() }); await tx.wait(); return tx; };
    const firmar = async (contract, metodo, args, nonce) => {
      const u = await contract[metodo].populateTransaction(...args);
      const gasLimit = (await provider.estimateGas({ ...u, from: owner.address })) * 120n / 100n;
      const raw = await owner.signTransaction({ to: u.to, data: u.data, value: 0, gasLimit, gasPrice: 5000000000n, nonce, chainId: 1337 });
      return { raw, hash: ethers.keccak256(raw), to: u.to, data: u.data, gasLimit };
    };
    await directo('setLimit', 'oro', 1000000, 100000);
    const recibo = await (await directo('createInvoice', jugador, 'oro', 100, 'stat-oro-1')).wait();
    const facturaOro = Number(recibo.logs.map(l => { try { return contrato.interface.parseLog(l); } catch (_) { return null; } }).find(e => e?.name === 'InvoiceCreated').args.id);
    const journal = require('../backend-gameplay/stat-chain-journal.cjs')({ mongoose: db, ethers, crypto, wallet: () => owner, nonce: nonceFicha, deadSignatureWaitMs: 300 });
    await journal.Intent.init();

    // 1) Firma de stats con un nonce muy por delante: el nodo la rechaza por alta.
    const idIntento = crypto.createHash('sha256').update('1337:' + (await contrato.getAddress()).toLowerCase() + ':' + facturaOro).digest('hex');
    const altaAhora = await contarCadena();
    const alta = await firmar(contrato, 'increaseInvoiceQuantity', [facturaOro, 10], altaAhora + 500);
    await journal.Intent.updateOne({ _id: idIntento }, { $set: { stat: 'oro', invoiceId: facturaOro, to: (await contrato.getAddress()).toLowerCase(), chainId: '1337', status: 'signed',
      current: 100, target: 110, ticket: 'stat:vieja:alta', tx: { to: (await contrato.getAddress()).toLowerCase(), data: alta.data, value: '0', gasLimit: String(alta.gasLimit), gasPrice: '5000000000', chainId: '1337' }, raw: alta.raw, hash: alta.hash } }, { upsert: true });
    const j1 = await journal.apply(contrato, 'oro', facturaOro, 110, 5000000000n);
    check(j1.pending === true && j1.error === 'stat_signature_replaced', 'stats: la firma con nonce alto se da por muerta en vez de reenviarse para siempre', j1);
    const j2 = await journal.apply(contrato, 'oro', facturaOro, 110, 5000000000n);
    check(j2.ok === true && j2.chainQty === 110, 'stats: el siguiente intento vuelve a planear y llega al valor pedido', j2);

    // 2) Firma de stats cuyo nonce ya gastó otra transacción: "nonce too low".
    const baja = await firmar(contrato, 'increaseInvoiceQuantity', [facturaOro, 7], (await contarCadena()) - 1);
    await journal.Intent.updateOne({ _id: idIntento }, { $set: { status: 'signed', current: 110, target: 117, ticket: 'stat:vieja:baja',
      tx: { to: (await contrato.getAddress()).toLowerCase(), data: baja.data, value: '0', gasLimit: String(baja.gasLimit), gasPrice: '5000000000', chainId: '1337' }, raw: baja.raw, hash: baja.hash } });
    const j3 = await journal.apply(contrato, 'oro', facturaOro, 117, 5000000000n);
    check(j3.pending === true && j3.error === 'stat_signature_replaced', 'stats: nonce gastado por otra y sin recibo propio: también muerta', j3);
    const j4 = await journal.apply(contrato, 'oro', facturaOro, 117, 5000000000n);
    check(j4.ok === true && j4.chainQty === 117 && Number((await contrato.getInvoice(facturaOro)).cantidad) === 117, 'stats: y el delta se aplica una sola vez', j4);

    // 3) Firma ya minada cuyo recibo se reenvía: NO está muerta aunque diga "too low".
    const buena = await firmar(contrato, 'increaseInvoiceQuantity', [facturaOro, 3], await contarCadena());
    const nodo = await provider.broadcastTransaction(buena.raw); await nodo.wait();
    await journal.Intent.updateOne({ _id: idIntento }, { $set: { status: 'signed', current: 117, target: 120, ticket: 'stat:vieja:buena',
      tx: { to: (await contrato.getAddress()).toLowerCase(), data: buena.data, value: '0', gasLimit: String(buena.gasLimit), gasPrice: '5000000000', chainId: '1337' }, raw: buena.raw, hash: buena.hash } });
    const j5 = await journal.apply(contrato, 'oro', facturaOro, 120, 5000000000n);
    check(j5.ok === true && j5.chainQty === 120, 'stats: una firma que sí se minó se reconoce por su recibo y no se repite', j5);

    // 4) Un crafteo con la firma muerta: se firma de nuevo y termina, sin entregar dos veces.
    const rutasCraft = new Map(), pasar = () => {};
    const StatsCraft = PlayerStats, Service = ServicioCobro, Mov = c.modelos.TesoroMov;
    await directo('setLimit', 'madera pinos', 1000, 50);
    await directo('setLimit', 'balde_vacio', 1000, 50);
    await directo('createInvoice', jugador, 'madera pinos', 6, 'madera-craft-1');
    const authority = require('../backend-gameplay/crafting-authority.cjs')({ mongoose: db, ethers, crypto, recipes: require('../backend-gameplay/recipes.json'), consumables: [],
      app: { get: (p, ...h) => rutasCraft.set('get ' + p, h.at(-1)), post: (p, ...h) => rutasCraft.set('post ' + p, h.at(-1)) }, authMiddleware: pasar, adminAuth: pasar, csrfProtection: pasar, strictLimiter: pasar, apiLimiter: pasar,
      itemType: id => id === 'madera_pinos' ? 'madera pinos' : id, maxStack: () => 5, items: () => contrato, wallet: () => owner, nonce: nonceFicha, gasPrice: () => 5000000000n, deadSignatureWaitMs: 300,
      freeInvoices: async w => (await contrato.getUserInventorySnapshot(w)).filter(i => i.active).map(i => ({ id: Number(i.id), owner: i.owner.toLowerCase(), tipo: i.tipo, cantidad: Number(i.cantidad), manualId: i.manualId })),
      player: async () => ({ playerName: 'Ana', address: jugador }), ghost: async () => false, level: async () => 30, transaction: async fn => { const s = await connection.startSession(); let r; try { await s.withTransaction(async () => { r = await fn(s); }); return r; } finally { await s.endSession(); } },
      queue: (_, fn) => fn(), loadEconomy: async () => {}, price: (_t, _i, q) => 50 * q, planPayment: (n, s) => { const b = s.plata * 1000 + s.bronce; return b >= n ? { oro: s.oro, plata: Math.floor((b - n) / 1000), bronce: (b - n) % 1000 } : null; },
      Stats: StatsCraft, Player: { findOne: () => ({ select() { return this; }, lean: async () => ({}) }) }, Treasury: TesoroJuego, treasuryId: 'juego', Service, Mov, persistInventory: async () => {}, statsResponse: s => s,
      award: async () => {}, gain: async () => {} });
    await authority.Job.init();
    const job = await authority.create({ playerName: 'Ana', address: jugador }, { recipeId: 'balde_vacio', quantity: 1, ref: 'craft_atasco_0001' });
    const pasoMuerto = await firmar(contrato, 'transferInvoice', [jugador, owner.address.toLowerCase(), Number((await contrato.getUserInventorySnapshot(jugador)).find(i => i.active && i.tipo === 'madera pinos').id), 3, 'cf:' + job._id.slice(6, 38) + ':0'], (await contarCadena()) + 800);
    await authority.Job.updateOne({ _id: job._id }, { $set: { 'privateSteps.0.status': 'signed', 'privateSteps.0.rawTx': pasoMuerto.raw, 'privateSteps.0.txHash': pasoMuerto.hash, 'privateSteps.0.nonce': (await contarCadena()) + 800, 'privateSteps.0.nonceTicket': 'craft:' + job._id + ':0' } });
    const hecho = await authority.execute(job._id);
    check(hecho.status === 'completed', 'crafteo: la firma muerta se rehace y la operación termina sola', hecho);
    check(Number((await contrato.getTipoStats('balde_vacio')).totalQuantity) === 1, 'crafteo: entrega exactamente una vez');
    check(Number((await contrato.getTipoStats('madera pinos')).totalBurned) === 3, 'crafteo: consume los materiales una sola vez');

    /* ── LO QUE SE QUEDÓ EN REVISIÓN DURANTE EL ATASCO ──────────────────────── */
    if (typeof c.tiendaSaldarAtasco === 'function') {
      const fijar = (txt) => txt.replace(/relayer: '0x[0-9a-f]{40}'/, `relayer: '${owner.address.toLowerCase()}'`).replace(/nonce: 14615/, 'nonce: ' + (globalThis.__nonceAtasco));
      globalThis.__nonceAtasco = await contarCadena();
      vm.runInContext(fijar(decl('TIENDA_ATASCO_RELAYER')).replace('const TIENDA_ATASCO_RELAYER', 'var TIENDA_ATASCO_RELAYER2') + '\n' +
        decl('tiendaSaldarAtasco').replace('A = TIENDA_ATASCO_RELAYER', 'A = TIENDA_ATASCO_RELAYER2') + '\nthis.tiendaSaldarAtasco2 = tiendaSaldarAtasco;', c);
      const ahora = Date.now(), dentro = new Date(ahora - 3600000);
      const compraDeAtasco = { _id: 'Ana:shop-vieja-compra', playerName: 'Ana', tipo: 'tienda_compra', itemId: 'Semillax', cantidad: 2, bronce: 21000, precioBronce: 10000, estado: 'revision', confirmadas: 0, t: dentro };
      const ventaDeAtasco = { _id: 'Ana:shop-vieja-venta', playerName: 'Ana', tipo: 'tienda_venta', itemId: 'Semillax', cantidad: 1, bronce: 4750, precioBronce: 5000, estado: 'revision', confirmadas: 0, t: dentro };
      const anterior = { _id: 'Ana:shop-anterior', playerName: 'Ana', tipo: 'tienda_compra', itemId: 'Semillax', cantidad: 1, bronce: 10500, precioBronce: 10000, estado: 'revision', confirmadas: 0, t: new Date('2026-10-30T07:00:00Z') };
      const enMarcha = { _id: 'Ana:shop-en-marcha', playerName: 'Ana', tipo: 'tienda_compra', itemId: 'Semillax', cantidad: 1, bronce: 10500, precioBronce: 10000, estado: 'cobrado', confirmadas: 0, t: new Date(ahora - 60000) };
      const parcial = { _id: 'Ana:shop-parcial', playerName: 'Ana', tipo: 'tienda_compra', itemId: 'Semillax', cantidad: 2, bronce: 21000, precioBronce: 10000, estado: 'revision', confirmadas: 1, t: dentro };
      await ServicioCobro.collection.insertMany([compraDeAtasco, ventaDeAtasco, anterior, enMarcha, parcial]);
      await PlayerStats.updateOne({ playerName: 'Ana' }, { $inc: { plata: -21 - 11 - 11 - 21 } });  // lo que retuvieron las compras
      await TesoroJuego.updateOne({ _id: 'juego' }, { $inc: { saldo: 21000 + 10500 + 10500 + 21000, retenidoServicios: 21000 + 4750 + 10500 + 10500 + 21000 } });
      const bronceAntes = (await PlayerStats.findOne({ playerName: 'Ana' }).lean()).bronce, retenidoAntes = (await TesoroJuego.findById('juego').lean()).retenidoServicios;
      const primero = await c.tiendaSaldarAtasco2();
      check(primero === false, 'atasco: la primera vuelta salda lo que encuentra');
      const estado = async (id) => (await ServicioCobro.findById(id).lean()).estado;
      check(await estado('Ana:shop-vieja-compra') === 'completado' && (await PlayerStats.findOne({ playerName: 'Ana' }).lean()).bronce === bronceAntes + 21000, 'atasco: la compra retenida vuelve entera al jugador');
      check(await estado('Ana:shop-vieja-venta') === 'completado', 'atasco: la venta retenida se libera');
      check((await TesoroJuego.findById('juego').lean()).retenidoServicios === retenidoAntes - 21000 - 4750, 'atasco: el tesoro suelta exactamente lo retenido de esas dos');
      check(await estado('Ana:shop-anterior') === 'revision', 'atasco: lo anterior al atasco no se toca (pudo minarse)');
      check(await estado('Ana:shop-en-marcha') === 'cobrado', 'atasco: lo que aún puede estar en marcha no se toca');
      check(await estado('Ana:shop-parcial') === 'revision', 'atasco: lo que ya tiene unidades confirmadas se queda para el panel');
      const bronceYa = (await PlayerStats.findOne({ playerName: 'Ana' }).lean()).bronce;
      check(await c.tiendaSaldarAtasco2() === true && (await PlayerStats.findOne({ playerName: 'Ana' }).lean()).bronce === bronceYa, 'atasco: repetir no devuelve dos veces');
      check((await contadores.findOne({ _id: 'tienda-atasco-20261030' })).hecho === true, 'atasco: queda apuntado que ya se hizo');
      // Sin la prueba en la cadena no se toca nada.
      await contadores.deleteOne({ _id: 'tienda-atasco-20261030' });
      await contadores.updateOne({ _id: clave }, { $unset: { primerRebobinado: 1 } });
      await ServicioCobro.collection.insertOne({ _id: 'Ana:shop-sin-prueba', playerName: 'Ana', tipo: 'tienda_compra', itemId: 'Semillax', cantidad: 1, bronce: 10500, precioBronce: 10000, estado: 'revision', confirmadas: 0, t: dentro });
      await directo('setLimit', 'otra', 10, 5);
      await c.tiendaSaldarAtasco2();
      check(await estado('Ana:shop-sin-prueba') === 'revision', 'atasco: si el nonce de la cadena ya no es el del atasco, no se devuelve nada');
      await ServicioCobro.deleteOne({ _id: 'Ana:shop-sin-prueba' });
    } else check(false, 'tiendaSaldarAtasco no existe en el servidor');

    console.log(fallos ? `\n${fallos} comprobaciones fallaron` : '\nTodo correcto');
    process.exitCode = fallos ? 1 : 0;
  } finally {
    try { if (provider) provider.destroy(); } catch (_) {}
    try { if (connection) await connection.close(true); } catch (_) {}
    try { if (mongo) await mongo.stop(); } catch (_) {}
    try { if (rpc) await rpc.disconnect(); } catch (_) {}
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
process.on('uncaughtException', e => { if (!/ECONNRESET/.test(String(e && e.message))) { console.error(e); process.exitCode = 1; } });
