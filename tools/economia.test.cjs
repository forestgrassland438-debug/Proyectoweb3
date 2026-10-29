'use strict';
/* (2026-10-26) LA ECONOMÍA Y LOS DOS TESOROS
 *   · "un precio estable que suba y baje según la inflación, no al dólar";
 *   · "un botón con un input para elegir cuánto oro, que cobre en la moneda de
 *     LitVM testnet y compre esa cantidad sin errores";
 *   · comisiones de cambio de menor a mayor (oro, plata, bronce), al tesoro
 *     circular; el viaje, el VIP y el elixir de revivir, al tesoro del juego;
 *   · "quita los tres botones de dar oro, plata y bronce".
 * El bloque REAL de server2.js con Mongo y cadena de mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const leer = (f) => fs.readFileSync(path.join(BIN, f), 'utf8').replace(/\r\n/g, '\n');
function trozo(fuente, inicio, fin) {
  const i = fuente.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio);
  const j = fuente.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return fuente.slice(i, j + fin.length);
}

const YO = '0x' + 'a'.repeat(40), OTRO = '0x' + 'b'.repeat(40), TESORO = '0x' + 'c'.repeat(40);

/** Un Mongo de mentira: lo que usa el bloque. */
function modelo() {
  const t = [];
  const val = (d, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d);
  const casa = (d, q) => Object.entries(q || {}).every(([k, v]) => {
    if (k === '$or') return v.some((x) => casa(d, x));
    const x = val(d, k);
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      return Object.entries(v).every(([op, w]) => (op === '$in' ? w.includes(x) : op === '$ne' ? x !== w : op === '$gte' ? x >= w : op === '$lt' ? x < w
        : op === '$exists' ? (x !== undefined) === w : false));
    }
    return x === v;
  });
  const poner = (d, k, v) => { const p = k.split('.'); let o = d; while (p.length > 1) { const q = p.shift(); o = o[q] = o[q] || {}; } o[p[0]] = v; };
  const aplicar = (d, u) => {
    for (const [k, v] of Object.entries(u.$set || {})) poner(d, k, v);
    for (const [k, v] of Object.entries(u.$inc || {})) poner(d, k, (val(d, k) || 0) + v);
  };
  const cur = (f) => { const c = { sort(s) { const [[k, o]] = Object.entries(s); f.sort((a, b) => (a[k] > b[k] ? o : a[k] < b[k] ? -o : 0)); return c; }, limit(n) { f = f.slice(0, n); return c; }, select() { return c; }, lean: async () => f.map((x) => ({ ...x })) }; return c; };
  const uno = (d) => ({ select() { return this; }, lean: async () => (d ? JSON.parse(JSON.stringify(d)) : null) });
  return {
    _t: t,
    find: (q) => cur(t.filter((d) => casa(d, q))),
    findOne: (q) => uno(t.find((d) => casa(d, q))),
    findById: (id) => uno(t.find((d) => d._id === id)),
    create: async (d) => { if (d.txHash && t.some((x) => x.txHash === d.txHash)) { const e = new Error('dup'); e.code = 11000; throw e; } const x = { ...d }; t.push(x); return { ...x }; },
    updateOne: async (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); if (!d && o.upsert) { d = { ...(q._id ? { _id: q._id } : {}) }; t.push(d); } if (d) aplicar(d, u); return { matchedCount: d ? 1 : 0 }; },
    findOneAndUpdate: (q, u, o = {}) => { let d = t.find((x) => casa(x, q)); if (!d && o.upsert) { d = { ...(q._id ? { _id: q._id } : {}) }; t.push(d); } if (d) aplicar(d, u); return uno(d); },
    init: async () => {}
  };
}

function bloque(op = {}) {
  const rutas = new Map(), devueltos = [];
  const M = { EconomiaDia: modelo(), CompraOro: modelo(), TesoroJuego: modelo(), Tesoro: modelo(), TesoroMov: modelo() };
  // Los valores por defecto del esquema de CompraOro (los pone mongoose).
  const crear = M.CompraOro.create;
  M.CompraOro.create = (d) => crear({ estado: 'cotizada', creada: new Date(), ...d });
  const cadena = op.cadena || {};
  const stats = { oro: 10, plata: 0, bronce: 0 };
  class Schema { constructor() {} index() {} }
  Schema.Types = { Mixed: Object };
  const nada = (req, res, next) => next && next();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Number, String, Date, Object, JSON, BigInt, Promise, Array, Map, Set, isFinite,
    process: { env: {} }, crypto, setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }),
    mongoose: { Schema, models: M, connection: { readyState: 0 } },
    app: { get: (p, ...h) => rutas.set('GET ' + p, h[h.length - 1]), post: (p, ...h) => rutas.set('POST ' + p, h[h.length - 1]) },
    apiLimiter: nada, strictLimiter: nada, authMiddleware: nada, csrfProtection: nada, adminAuth: nada,
    jugadorDeLaSesion: async () => ({ playerName: 'Ana', address: YO }),
    enColaDelJugador: async (k, fn) => fn(),
    PlayerStats: { aggregate: async () => [{ oro: op.masa ? op.masa.oro : 100, plata: 1000, bronce: 5000, n: 3 }],
                   findOne: () => ({ lean: async () => ({ ...stats }) }) },
    Tesoro: M.Tesoro, TesoroJuego: M.TesoroJuego, TesoroMov: M.TesoroMov,
    TESORO_ID: 'principal', TESORO_JUEGO_ID: 'juego', TESORO_JUEGO_ORIGENES: ['tienda', 'p2p', 'viajes', 'vip', 'revivir', 'admin'],
    TESORO_BRONCE_POR: { bronce: 1, plata: 1000, oro: 1000000 }, TESORO_COMISION_BPS: 500, TESORO_CIRCULAR_BPS: 150,
    CAMBIO_COMISION_BPS: { oro: 100, plata: 200, bronce: 300 }, CHAIN_ID: 4441, CHAIN_SETTLE_DELAY_MS: 60000,
    relayerWallet: { address: TESORO }, tesoroPublico: (x) => x || {},
    _diaUTC: () => new Date().toISOString().slice(0, 10),
    gfDevolverStat: async (n, s, c) => { devueltos.push([n, s, c]); stats[s] += c; return { ...stats }; },
    buildStatsResponse: (d) => ({ oro: d.oro }),
    provider: {
      send: async () => '0x1159',
      getTransaction: async (h) => (cadena[h] ? { from: cadena[h].from, to: cadena[h].to, value: cadena[h].valor, data: '0x', chainId: 4441n } : null),
      getTransactionReceipt: async (h) => (cadena[h] && !cadena[h].pendiente ? { status: cadena[h].revertida ? 0 : 1, blockNumber: 10 } : null),
      getBlockNumber: async () => 12,
      getBlock: async () => ({ timestamp: Math.floor((op.hora || Date.now()) / 1000) })
    }
  });
  // New atomic credit path: exercise the actual transaction helper with a rollback-capable DB double.
  ctx.PlayerStats.findOneAndUpdate = async (q, u) => {
    if (u.$inc && u.$inc.oro) { stats.oro += u.$inc.oro; devueltos.push(['Ana', 'oro', u.$inc.oro]); }
    return { ...stats };
  };
  require('./economy-mock-transactions.cjs')(ctx, Object.values(M), [stats]);
  vm.runInContext(trozo(SRV, 'async function ecoTransaccion(', '\n}\n'), ctx);
  // (2026-10-28) La economía, 2.ª parte: la foto del día usa el fondo de reserva, el índice de precios y la
  // inflación neta. Sus funciones de verdad; lo demás, de mentira (sus pruebas: tools/economia2.test.cjs).
  Object.assign(ctx, { TesoroReserva: modelo(), TESORO_RESERVA_ID: 'reserva', eco2MigrarReserva: async () => {}, eco2TrasFoto: async () => {},
    eco2Config: async () => ({ indiceActivo: true, sensibilidad: 0.6, pasoMax: 0.03, pesoObjetos: 1 }) });
  vm.runInContext(['eco2IndiceObjetivo', 'eco2Masas', 'eco2Inflaciones'].map((n) => trozo(SRV, 'function ' + n + '(', '\n}\n')).join('\n'), ctx);
  const fin = "console.log('✅ Economía:";
  const codigo = trozo(SRV, 'const ECONOMIA_CONFIG_BASE = ', fin).slice(0, -fin.length);
  vm.runInContext(codigo + '\nthis.f = { economiaPrecioGwei, economiaSalud, economiaTope, economiaNormalizarConfig, economiaFoto };', ctx);
  const llamar = async (clave, body) => {
    let st = 200, out = null;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; } };
    await rutas.get(clave)({ body: body || {}, user: { address: YO }, query: {} }, res);
    return { st, out: JSON.parse(JSON.stringify(out)) };
  };
  return { f: ctx.f, M, llamar, devueltos, cadena, stats };
}

test('el precio del oro: arranca en la base, sube con la inflación y como mucho un 5 % al día', { skip: !HAY }, () => {
  const { f } = bloque();
  const cfg = f.economiaNormalizarConfig({});
  assert.equal(cfg.precioBase, 0.001);
  assert.equal(f.economiaPrecioGwei(cfg, 0, null), 1000000, 'sin historia: el precio base (0,001 zkLTC = 1.000.000 gwei)');
  assert.equal(f.economiaPrecioGwei(cfg, 1000000, 0.5), 1050000, 'con mucha inflación sube, pero solo un 5 %');
  assert.equal(f.economiaPrecioGwei(cfg, 1000000, -0.5), 950000, 'con deflación baja, también como mucho un 5 %');
  assert.equal(f.economiaPrecioGwei(cfg, 1000000, 0.01), 1008000, 'cerca del objetivo, va al objetivo (base × (1 + 1 % × 0,8))');
  for (const [inf, salud] of [[null, 'sin_datos'], [-0.1, 'deflacion'], [0.03, 'estable'], [0.15, 'caliente'], [0.4, 'recalentada']]) assert.equal(f.economiaSalud(inf), salud);
  assert.equal(f.economiaTope(cfg, 'estable'), 300);
  assert.equal(f.economiaTope(cfg, 'caliente'), 163, 'a medio camino');
  assert.equal(f.economiaTope(cfg, 'recalentada'), 25);
  assert.equal(f.economiaNormalizarConfig({ cartera: 'nada', precioBase: -5 }).cartera, '', 'una cartera mala no se guarda');
  assert.equal(f.economiaNormalizarConfig({ precioBase: -5 }).precioBase, 0.000001);
});

test('comprar oro: cotiza, el pago se mira en la cadena y el oro se da UNA vez', { skip: !HAY }, async () => {
  const b = bloque();
  const pub = await b.llamar('GET /api/economia/estado');
  assert.equal(pub.out.compra.activa, true);
  assert.equal(pub.out.compra.destino, TESORO, 'sin cartera en el panel: la del servidor');
  assert.equal(pub.out.comisiones.mercadoBps, 500);
  const c = await b.llamar('POST /api/currency/oro/cotizar', { oro: 20 });
  assert.equal(c.st, 200, JSON.stringify(c.out));
  assert.equal(c.out.wei, String(20n * 1000000n * 1000000000n), '20 de oro a 0,001 zkLTC');
  const H = '0x' + '1'.repeat(64), MALO = '0x' + '2'.repeat(64), AJENO = '0x' + '3'.repeat(64);
  b.cadena[H] = { from: YO, to: TESORO, valor: BigInt(c.out.wei) };
  b.cadena[MALO] = { from: OTRO, to: TESORO, valor: BigInt(c.out.wei) };
  b.cadena[AJENO] = { from: YO, to: OTRO, valor: BigInt(c.out.wei) };
  assert.equal((await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: MALO })).out.error, 'otra_cartera');
  assert.equal((await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: AJENO })).out.error, 'otro_destino');
  const ok = await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: H });
  assert.equal(ok.st, 200, JSON.stringify(ok.out));
  assert.equal(ok.out.oro, 20);
  assert.deepEqual(b.devueltos, [['Ana', 'oro', 20]]);
  const otra = await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: H });
  assert.equal(otra.out.repetida, true, 'la misma confirmación no da oro dos veces');
  assert.equal(b.devueltos.length, 1);
  // El mismo pago no vale para otra cotización.
  const c2 = await b.llamar('POST /api/currency/oro/cotizar', { oro: 5 });
  assert.equal((await b.llamar('POST /api/currency/oro/confirmar', { id: c2.out.id, txHash: H })).out.error, 'hash_ya_usado');
  // Al tesoro del juego: el zkLTC recibido y el oro vendido.
  const tj = b.M.TesoroJuego._t[0];
  assert.equal(tj.zkltc.gwei, 20 * 1000000); assert.equal(tj.zkltc.oro, 20); assert.equal(tj.zkltc.compras, 1);
});

test('comprar oro: pendiente se vuelve a mirar, el tope diario manda y pagar de menos da solo lo pagado', { skip: !HAY }, async () => {
  const b = bloque();
  const c = await b.llamar('POST /api/currency/oro/cotizar', { oro: 10 });
  const H = '0x' + '4'.repeat(64);
  b.cadena[H] = { from: YO, to: TESORO, valor: BigInt(c.out.wei), pendiente: true };
  const p = await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: H });
  assert.equal(p.st, 202);
  assert.equal(b.M.CompraOro._t[0].estado, 'pagada', 'el hash queda apuntado');
  b.cadena[H].pendiente = false;
  b.cadena[H].valor = BigInt(c.out.wei) / 2n;          // pagó la mitad
  const r = await b.llamar('POST /api/currency/oro/confirmar', { id: c.out.id, txHash: H });
  assert.equal(r.out.oro, 5, 'la mitad del dinero, la mitad del oro');
  // El tope: 300 al día contando lo comprado y las cotizaciones vivas.
  const grande = await b.llamar('POST /api/currency/oro/cotizar', { oro: 296 });
  assert.equal(grande.st, 429);
  assert.equal(grande.out.quedan, 295, '300 menos los 5 ya acreditados');
  assert.equal((await b.llamar('POST /api/currency/oro/cotizar', { oro: 295 })).st, 200);
  assert.equal((await b.llamar('POST /api/currency/oro/cotizar', { oro: 1 })).st, 429, 'la cotización viva también cuenta');
  assert.equal((await b.llamar('POST /api/currency/oro/cotizar', { oro: 0 })).out.error, 'cantidad_invalida');
});

test('la comisión de los cambios: de menor a mayor (oro 1 %, plata 2 %, bronce 3 %) y el navegador cuenta lo mismo', { skip: !HAY }, async () => {
  const ctx = vm.createContext({ Math, Number, Object });
  vm.runInContext(trozo(SRV, 'const CAMBIO_COMISION_BPS = ', ';\n') + '\nconst TESORO_BRONCE_POR = { bronce: 1, plata: 1000, oro: 1000000 };\n' +
                  trozo(SRV, 'function gfComisionCambio(direction, qty) {', '\n}\n') + '\nthis.f = gfComisionCambio;', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.f('goldToSilver', 100))), { moneda: 'plata', cantidad: 1000, bronce: 1000000, bps: 100 });
  assert.equal(ctx.f('silverToGold', 1).cantidad, 20);
  assert.equal(ctx.f('silverToBronze', 1).cantidad, 20);
  assert.equal(ctx.f('bronzeToSilver', 1).cantidad, 30);
  const cli = vm.createContext({ window: { addEventListener() {}, GFMascota: null }, document: {}, setTimeout: () => 0, Math, Number, BigInt, Promise, Object, String, JSON });
  vm.runInContext(leer('gf-economia.js'), cli);
  // Sin datos del servidor (viejo) no se enseña comisión.
  assert.equal(cli.window.GFEconomia.comisionCambio('bronzeToSilver', 3).cantidad, 0);
  // Con la tabla del servidor, lo mismo que él.
  cli.window.GFMascota = { api: async () => ({ ok: true, status: 200, datos: { ok: true, comisiones: { cambioBps: { oro: 100, plata: 200, bronce: 300 } } } }) };
  await cli.window.GFEconomia.cargar(true);
  for (const d of ['goldToSilver', 'silverToGold', 'silverToBronze', 'bronzeToSilver']) {
    for (const q of [1, 3, 7, 250]) assert.equal(cli.window.GFEconomia.comisionCambio(d, q).cantidad, ctx.f(d, q).cantidad, d + ' x' + q);
  }
});

test('lo que va a cada tesoro, y sin monedas gratis', { skip: !HAY }, () => {
  // Tienda y P2P: 5 % (1,5 circular + 3,5 del juego).
  assert.match(SRV, /const TESORO_COMISION_BPS = 500;/);
  assert.match(SRV, /const TESORO_CIRCULAR_BPS = 150;/);
  assert.match(SRV, /await tesoroJuegoIngresar\('tienda', juego, gp\.playerName,/);
  // Viaje del mapa, VIP y el elixir de revivir: al tesoro del juego.
  assert.match(SRV, /await tesoroJuegoIngresar\('viajes', e\.precio, gp\.playerName, 'mapa ' \+ id\);/);
  assert.match(SRV, /await tesoroJuegoIngresar\('vip', precio \* \(TESORO_BRONCE_POR\[moneda\] \|\| 0\), gp\.playerName,/);
  assert.match(SRV, /if\(cfg\.revive\)await tesoroJuegoIngresar\('revivir',cost\*TESORO_BRONCE_POR\.plata,gp\.playerName,itemId\+' x'\+qty\);/);
  // Los cambios: al circular.
  assert.ok((SRV.match(/await tesoroCircularIngresar\('cambio', fee(X)?\.bronce,/g) || []).length >= 2);
  // Sin regalos semanales ni la compra vieja que no cobraba.
  assert.match(SRV, /const WEEKLY_GIFTS_ACTIVOS = false;/);
  assert.match(SRV, /return res\.status\(410\)\.json\(\{ error: 'usa_compra_con_zkltc'/);
  // Y en el navegador: ni los botones de regalo ni los paquetes en dólares.
  for (const f of ['Scenes/GameScene.js', 'Scenes/tiendajuego.js']) {
    const s = leer(f), hub = s.slice(s.indexOf('async _buildCurrencyHub(tab) {'), s.indexOf('async _buildCurrencyHub(tab) {') + 9000);
    assert.doesNotMatch(hub, /id="gfc-gift-gold"/, f + ': sin "Get Gold"');
    assert.doesNotMatch(hub, /this\._montarRegaloSemanal\(card\);/, f);
    assert.match(hub, /<div id="gfc-economia">/, f + ': la compra en zkLTC');
  }
  assert.doesNotMatch(leer('gf-bronce.js'), /try \{ regaloBronce\(card\); \}/, 'sin "Get Bronze"');
  assert.match(leer('index.html'), /<script src="\.\/gf-economia\.js\?v=[^"]+" defer><\/script>/);
  assert.match(leer('control-center.js'), /\{ id:'economia', file:'economia\.html'/);
});

test('cotizaciones concurrentes respetan el cupo reservado en Mongo', async () => {
  const b = bloque();
  const quotes = await Promise.all(Array.from({ length: 20 }, () => b.llamar('POST /api/currency/oro/cotizar', { oro: 30 })));
  assert.equal(quotes.filter(r => r.st === 200).length, 10);
  assert.equal(quotes.filter(r => r.st === 429).length, 10);
  assert.equal(b.M.CompraOro._t.reduce((sum, q) => sum + q.oro, 0), 300);
});

test('si falla el libro de recargas no queda oro entregado sin recibo; reintentar acredita una vez', async () => {
  const b = bloque();
  const quote = await b.llamar('POST /api/currency/oro/cotizar', { oro: 10 });
  const hash = '0x' + 'e'.repeat(64);
  b.cadena[hash] = { from: YO, to: TESORO, valor: BigInt(quote.out.wei) };
  const write = b.M.TesoroJuego.updateOne; let fail = true;
  b.M.TesoroJuego.updateOne = async (q, u, options) => {
    if (fail && u.$inc && u.$inc['zkltc.gwei']) { fail = false; throw new Error('injected_ledger_failure'); }
    return write(q, u, options);
  };
  assert.equal((await b.llamar('POST /api/currency/oro/confirmar', { id: quote.out.id, txHash: hash })).st, 500);
  assert.equal(b.stats.oro, 10);
  assert.equal(b.M.CompraOro._t[0].estado, 'cotizada');
  assert.equal((await b.llamar('POST /api/currency/oro/confirmar', { id: quote.out.id, txHash: hash })).st, 200);
  assert.equal(b.stats.oro, 20);
});
