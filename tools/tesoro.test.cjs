'use strict';
/* =============================================================================
 * EL TESORO (2026-10-22) — la comisión del 1,5 %, los incentivos y los mapas por nivel
 * -----------------------------------------------------------------------------
 * Saca de server2.js (por AST, como admin-auth-rpc.test.cjs) la sección "EL
 * TESORO Y SUS INCENTIVOS" y la ejecuta con modelos falsos en memoria: nunca
 * arranca el backend ni toca Mongo. Comprueba también que las COPIAS del
 * cliente dan lo mismo que el servidor:
 *   - tesoro.js (el panel) ......... normalizar / probabilidad / cantidad
 *   - tienda_sistema.js ............ gfComisionTesoroBronce (la tienda cobra)
 *   - gf-niveles-mapas.js .......... nivel mínimo por mapa y curva de nivel
 *   - marketplace-routes.js ........ el 1,5 % del P2P va al tesoro, en bronce
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const acorn = require('acorn');

const raiz = path.join(__dirname, '..');
const backendPath = process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js';
const source = fs.readFileSync(backendPath, 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
const quiet = { log() {}, warn() {}, error() {} };
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

function declaration(name) {
  const node = ast.body.find(n => n.id?.name === name || n.declarations?.some(d => d.id.name === name));
  assert.ok(node, 'Falta la declaración en server2.js: ' + name);
  return source.slice(node.start, node.end);
}
function ruta(metodo, ruta) {
  const inicio = 'app.' + metodo + "('" + ruta + "'";
  const node = ast.body.find(n => n.type === 'ExpressionStatement' && source.slice(n.start, n.start + inicio.length) === inicio);
  assert.ok(node, 'Falta la ruta en server2.js: ' + metodo.toUpperCase() + ' ' + ruta);
  return source.slice(node.start, node.end);
}
function buscar(nodo, cumple) {
  if (!nodo || typeof nodo.type !== 'string') return null;
  if (cumple(nodo)) return nodo;
  for (const k of Object.keys(nodo)) {
    const v = nodo[k];
    if (Array.isArray(v)) { for (const x of v) { const r = buscar(x, cumple); if (r) return r; } }
    else if (v && typeof v.type === 'string') { const r = buscar(v, cumple); if (r) return r; }
  }
  return null;
}

// ── Mongo de mentira (lo justo para lo que hace la sección) ─────────────────
function leer(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
function poner(o, p, v) { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) a = (a[k] ??= {}); a[ks[ks.length - 1]] = v; }
function cumple(d, f) {
  return Object.entries(f || {}).every(([k, v]) => {
    const a = leer(d, k);
    if (v && typeof v === 'object') {
      if ('$gte' in v) return a >= v.$gte;
      if ('$gt' in v) return a > v.$gt;
    }
    return a === v;
  });
}
function consulta(fn) {
  const q = { select() { return q; }, lean() { return q; }, exec: () => Promise.resolve().then(fn),
              then(ok, mal) { return Promise.resolve().then(fn).then(ok, mal); } };
  return q;
}
function tesoroFalso(inicial) {
  const vacio = () => ({ _id: 'principal', saldo: 0, reservado: 0, ingresado: { tienda: 0, p2p: 0, admin: 0 }, ingresos: { tienda: 0, p2p: 0 },
                         pagado: { free: 0, vip: 0 }, pagos: { free: 0, vip: 0 }, retirado: 0, caducados: 0, config: null });
  let doc = inicial ? Object.assign(vacio(), clone(inicial)) : null;
  const aplicar = u => {
    if (Array.isArray(u)) {                                     // la tubería de tesoroListo
      for (const etapa of u) for (const [k, v] of Object.entries(etapa.$set)) {
        poner(doc, k, v && v.$add ? v.$add.reduce((s, x) => s + (typeof x === 'string' ? leer(doc, x.slice(1)) : x), 0) : v);
      }
      return;
    }
    for (const [k, v] of Object.entries(u.$inc || {})) poner(doc, k, (leer(doc, k) || 0) + v);
    for (const [k, v] of Object.entries(u.$set || {})) poner(doc, k, clone(v));
  };
  return {
    get doc() { return doc; },
    findById: () => consulta(() => clone(doc)),
    updateOne: (f, u, o = {}) => consulta(() => {
      if (!doc) { if (!o.upsert) return { modifiedCount: 0 }; doc = vacio(); }
      if (!cumple(doc, f)) return { modifiedCount: 0 };
      aplicar(u); return { modifiedCount: 1 };
    }),
    findOneAndUpdate: (f, u, o = {}) => consulta(() => {
      if (!doc) { if (!o.upsert) return null; doc = vacio(); }
      if (!cumple(doc, f)) return null;
      aplicar(u); return clone(doc);
    })
  };
}
function movimientosFalsos() {
  const filas = [], refs = new Set();
  return { filas, async create(d) {
    if (d.ref) { if (refs.has(d.ref)) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; } refs.add(d.ref); }
    filas.push(clone(d)); return d;
  } };
}

// ── La sección del tesoro, viva en un contexto aislado ──────────────────────
const NOMBRES = ['TIENDA_PRECIOS', 'TESORO_ID', 'TESORO_COMISION_BPS', 'TESORO_BRONCE_POR', 'TESORO_TOPE_TIENDA_DIA', 'TESORO_PROB_MAX',
  'TESORO_CONFIG_BASE', 'GF_NIVEL_MAPA', 'gfNivelMinimoSala', 'gfNivelDeJugador', '_diaUTC', '_tesoroRacha', '_tesoroDia', '_tesoroTiendaDia',
  'tesoroNormalizarConfig', '_tesoroCfg', 'tesoroConfig', 'tesoroProbabilidad', 'tesoroCantidad', '_tesoroListo', 'tesoroListo',
  'tesoroIncentivo', 'tesoroDevolverReserva', 'tesoroPagar', 'tesoroComisionTienda', 'tesoroPublico',
  'MAX_LEVEL_PERSONAJE', 'expTotalParaNivel', 'nivelPorExperiencia', 'salaBase', 'gfNombreValido'];
function seccion({ tesoro = null, vips = [], stats = {}, devolver = true } = {}) {
  const rutas = new Map(), pagados = [];
  const Tesoro = tesoroFalso(tesoro), TesoroMov = movimientosFalsos();
  const nada = (req, res, next) => next && next();
  const c = {
    console: quiet, Tesoro, TesoroMov,
    PlayerStats: { findOne: f => consulta(() => (stats[f.playerName] != null ? { exp: stats[f.playerName] } : null)) },
    gfTieneVipPorDireccion: async a => vips.includes(a),
    gfDevolverStat: async (playerName, stat, n) => { if (!devolver) return null; pagados.push({ playerName, stat, n }); return { playerName, [stat]: n }; },
    jugadorDeLaSesion: async req => req.gp || null,
    app: { get: (p, ...h) => rutas.set('GET ' + p, h[h.length - 1]), post: (p, ...h) => rutas.set('POST ' + p, h[h.length - 1]) },
    apiLimiter: nada, strictLimiter: nada, authMiddleware: nada, csrfProtection: nada, adminAuth: nada,
    azar: () => 0
  };
  vm.createContext(c);
  const codigo = NOMBRES.map(declaration).join('\n') + '\n' +
    ruta('post', '/api/tesoro/comision') + '\n' + ruta('post', '/api/admin/tesoro/config') + '\n' + ruta('post', '/api/admin/tesoro/ajuste') + '\n' +
    `Math.random = () => azar();
     this.h = { TIENDA_PRECIOS, TESORO_CONFIG_BASE, TESORO_PROB_MAX, TESORO_TOPE_TIENDA_DIA, GF_NIVEL_MAPA, gfNivelMinimoSala, gfNivelDeJugador,
       tesoroNormalizarConfig, tesoroConfig, tesoroProbabilidad, tesoroCantidad, tesoroListo, tesoroIncentivo, tesoroDevolverReserva,
       tesoroPagar, tesoroComisionTienda, tesoroPublico, expTotalParaNivel, nivelPorExperiencia, _tesoroRacha, _tesoroDia, _tesoroTiendaDia,
       olvidarConfig() { _tesoroCfg = null; _tesoroCfgEn = 0; }, olvidarListo() { _tesoroListo = null; } };`;
  // El contexto trae sus propios Math/Date/Map: cambiar Math.random dentro no toca el de las pruebas.
  vm.runInContext(codigo, c);
  async function llamar(metodo, p, req = {}) {
    const h = rutas.get(metodo + ' ' + p);
    assert.ok(h, 'ruta no montada: ' + metodo + ' ' + p);
    const res = { statusCode: 200, body: null, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
    await h({ body: {}, ...req }, res);
    return res;
  }
  return { ...c.h, Tesoro, TesoroMov, pagados, llamar, setAzar(fn) { c.azar = fn; } };
}

// ── Las copias del cliente ──────────────────────────────────────────────────
const Panel = require(path.join(raiz, 'tesoro.js'));
function comisionCliente() {
  const src = fs.readFileSync(path.join(raiz, 'tienda_sistema.js'), 'utf8');
  const a = acorn.parse(src, { ecmaVersion: 'latest' });
  const trozo = n => { const x = a.body.find(b => b.id?.name === n || b.declarations?.some(d => d.id.name === n)); assert.ok(x, 'tienda_sistema.js: falta ' + n); return src.slice(x.start, x.end); };
  const c = { Math, Number };
  vm.createContext(c);
  vm.runInContext(trozo('GF_COMISION_TESORO_BPS') + '\n' + trozo('gfComisionTesoroBronce') + '\nthis.f = gfComisionTesoroBronce; this.bps = GF_COMISION_TESORO_BPS;', c);
  return c;
}
function nivelesCliente() {
  const c = { window: { addEventListener() {}, playerStats: null }, setInterval, clearInterval, Date, Math, Number, Object };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'gf-niveles-mapas.js'), 'utf8'), c);
  return c.window.GFNivelMapa;
}

// =============================================================================
test('la configuración se acota: nada fuera de rango, nada que no sea número', () => {
  const s = seccion();
  const base = clone(s.TESORO_CONFIG_BASE);
  assert.deepEqual(clone(s.tesoroNormalizarConfig(null)), base);
  assert.deepEqual(clone(s.tesoroNormalizarConfig('basura')), base);
  const c = s.tesoroNormalizarConfig({ activo: 'si', modo: 'raro', manual: { free: 200, vip: -3, conBonos: 1 },
    auto: { baseFree: 'x', nivelTope: 9999.6, rachaTope: Infinity }, parteDelTesoro: 0, pagoMin: 500, pagoMax: 10, topeDiario: 0.2 });
  assert.equal(c.activo, true);                // solo un booleano cambia `activo`
  assert.equal(c.modo, 'auto');
  assert.equal(c.manual.free, 75);
  assert.equal(c.manual.vip, 0);
  assert.equal(c.manual.conBonos, false);
  assert.equal(c.auto.baseFree, base.auto.baseFree);
  assert.equal(c.auto.nivelTope, 150);
  assert.equal(c.auto.rachaTope, base.auto.rachaTope);
  assert.equal(c.parteDelTesoro, 0.01);
  assert.equal(c.pagoMax, 500, 'el tope nunca queda por debajo del mínimo');
  assert.equal(c.topeDiario, 1);
  assert.equal(s.tesoroNormalizarConfig({ modo: 'manual', activo: false }).modo, 'manual');
  assert.equal(s.tesoroNormalizarConfig({ modo: 'manual', activo: false }).activo, false);
});

test('la probabilidad: automática por free/VIP + nivel + suerte, manual fija, jefes al doble y nunca más del 75 %', () => {
  const s = seccion(), auto = s.tesoroNormalizarConfig({});
  const p = (cfg, o) => Math.round(s.tesoroProbabilidad(cfg, o) * 1e6) / 1e6;
  assert.equal(p(auto, { vip: false, nivel: 0, racha: 0 }), 0.04);
  assert.equal(p(auto, { vip: true, nivel: 0, racha: 0 }), 0.07);
  assert.equal(p(auto, { vip: false, nivel: 10, racha: 0 }), 0.065);
  assert.equal(p(auto, { vip: false, nivel: 1000, racha: 0 }), 0.14, 'el bono de nivel se para en nivelTope');
  assert.equal(p(auto, { vip: false, nivel: 0, racha: 4 }), 0.06);
  assert.equal(p(auto, { vip: false, nivel: 0, racha: 1e6 }), 0.10, 'la suerte tiene techo');
  assert.equal(p(auto, { vip: false, nivel: 0, racha: 0, jefe: true }), 0.08);
  const manual = s.tesoroNormalizarConfig({ modo: 'manual', manual: { free: 12, vip: 30 } });
  assert.equal(p(manual, { vip: false, nivel: 40, racha: 50 }), 0.12, 'manual sin bonos: el % que puso el admin');
  assert.equal(p(manual, { vip: true, nivel: 40, racha: 50 }), 0.30);
  const conBonos = s.tesoroNormalizarConfig({ modo: 'manual', manual: { free: 12, vip: 30, conBonos: true } });
  assert.equal(p(conBonos, { vip: false, nivel: 4, racha: 2 }), 0.14);
  const alto = s.tesoroNormalizarConfig({ modo: 'manual', manual: { free: 75, vip: 75, conBonos: true } });
  assert.equal(s.tesoroProbabilidad(alto, { vip: true, nivel: 99, racha: 99, jefe: true }), s.TESORO_PROB_MAX);
  assert.equal(s.tesoroProbabilidad(s.tesoroNormalizarConfig({ modo: 'manual', manual: { free: 0, vip: 0 } }), { vip: false, nivel: 9, racha: 9 }), 0);
});

test('la cantidad: una parte del saldo, nunca más que el tope ni que el propio saldo, y más para VIP y jefes', () => {
  const s = seccion(), cfg = s.tesoroNormalizarConfig({});
  assert.equal(s.tesoroCantidad(cfg, 0, { vip: true, nivel: 40, exp: 999, jefe: true }, 1), 0);
  const free = s.tesoroCantidad(cfg, 1e6, { vip: false, nivel: 5, exp: 150 }, 0.5);
  const vip = s.tesoroCantidad(cfg, 1e6, { vip: true, nivel: 5, exp: 150 }, 0.5);
  const jefe = s.tesoroCantidad(cfg, 1e6, { vip: false, nivel: 5, exp: 150, jefe: true }, 0.5);
  assert.equal(free, Math.floor(1e6 * 0.0025 * 1 * 1 * 1.1 * 1 * 1));
  assert.ok(vip > free && jefe > free);
  assert.equal(s.tesoroCantidad(cfg, 1e12, { vip: true, nivel: 40, exp: 9999, jefe: true }, 1), cfg.pagoMax);
  const todo = s.tesoroNormalizarConfig({ parteDelTesoro: 5, pagoMax: 1e12 });
  assert.equal(s.tesoroCantidad(todo, 300, { vip: true, nivel: 40, exp: 9999, jefe: true }, 1), 300, 'nunca más que el saldo');
});

test('el panel (tesoro.js) calcula EXACTAMENTE lo mismo que el servidor', () => {
  const s = seccion();
  assert.deepEqual(clone(Panel.BASE), clone(s.TESORO_CONFIG_BASE));
  assert.equal(Panel.PROB_MAX, s.TESORO_PROB_MAX);
  let semilla = 7;
  const r = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const valor = () => [undefined, null, '', 'x', -5, 0, r() * 3, r() * 80, r() * 2e6, Infinity, true][Math.floor(r() * 11)];
  for (let i = 0; i < 400; i++) {
    const crudo = { activo: r() < 0.5 ? r() < 0.5 : valor(), modo: r() < 0.5 ? 'manual' : valor(),
      manual: r() < 0.9 ? { free: valor(), vip: valor(), conBonos: r() < 0.5 ? r() < 0.5 : valor() } : valor(),
      auto: r() < 0.9 ? { baseFree: valor(), baseVip: valor(), porNivel: valor(), nivelTope: valor(), rachaPaso: valor(), rachaTope: valor() } : valor(),
      parteDelTesoro: valor(), pagoMin: valor(), pagoMax: valor(), vipExtraPago: valor(), topeDiario: valor() };
    const srv = s.tesoroNormalizarConfig(crudo), cli = Panel.normalizar(crudo);
    assert.deepEqual(clone(cli), clone(srv), 'normalizar #' + i);
    for (const o of [{ vip: false, nivel: 0, racha: 0 }, { vip: true, nivel: 7, racha: 3 }, { vip: false, nivel: 60, racha: 1000, jefe: true }]) {
      assert.equal(Panel.probabilidad(cli, o), s.tesoroProbabilidad(srv, o), 'probabilidad #' + i);
      const saldo = Math.floor(r() * 5e7), azar = r(), q = { ...o, exp: Math.floor(r() * 900) };
      assert.equal(Panel.cantidad(cli, saldo, q, azar), s.tesoroCantidad(srv, saldo, q, azar), 'cantidad #' + i);
    }
  }
  assert.deepEqual(clone(Panel.monedas(12345678)), { oro: 12, plata: 345, bronce: 678 });
  assert.equal(Panel.aBronce(3, 'oro'), 3e6);
  assert.equal(Panel.aBronce(250, 'plata'), 250000);
});

test('la comisión de la tienda: el servidor cobra con SU tabla lo mismo que el navegador', () => {
  const s = seccion(), cli = comisionCliente();
  assert.equal(cli.bps, 150);
  const ids = Object.keys(s.TIENDA_PRECIOS);
  assert.ok(ids.length >= 40, 'la tabla de precios está entera');
  for (const id of ids) {
    const [compra, venta, moneda] = s.TIENDA_PRECIOS[id];
    for (const q of [1, 3, 7, 999]) {
      assert.equal(s.tesoroComisionTienda(id, 'compra', q), cli.f(compra, moneda === 'p' ? 'silver' : 'gold', q), id + ' compra x' + q);
      assert.equal(s.tesoroComisionTienda(id, 'venta', q), cli.f(venta, moneda === 'p' ? 'silver' : 'gold', q), id + ' venta x' + q);
    }
  }
  assert.equal(s.tesoroComisionTienda('arco', 'compra', 1), 4500, '300 de plata → 1,5 % = 4.500 de bronce');
  assert.equal(s.tesoroComisionTienda('pes1', 'compra', 1), 0, 'lo que no se vende no cobra');
  assert.equal(s.tesoroComisionTienda('constructor', 'compra', 1), 0, 'un id heredado no existe');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'tienda-precios-a-servidor.js'), '--comprobar', backendPath], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'TIENDA_PRECIOS de server2.js no coincide con el catálogo del cliente:\n' + r.stdout + r.stderr);
});

test('POST /api/tesoro/comision: cuenta una sola vez por ref, valida y respeta el tope diario', async () => {
  const s = seccion();
  const gp = { playerName: 'Ana', Username: 'Ana' };
  const pedir = body => s.llamar('POST', '/api/tesoro/comision', { gp, body });
  let r = await pedir({ operacion: 'compra', itemId: 'arco', cantidad: 2, ref: 'ref-00000001' });
  assert.equal(r.statusCode, 200); assert.equal(r.body.bronce, 9000);
  assert.equal(s.Tesoro.doc.saldo, 9000); assert.equal(s.Tesoro.doc.ingresado.tienda, 9000); assert.equal(s.Tesoro.doc.ingresos.tienda, 1);
  r = await pedir({ operacion: 'compra', itemId: 'arco', cantidad: 2, ref: 'ref-00000001' });
  assert.equal(r.body.repetido, true); assert.equal(s.Tesoro.doc.saldo, 9000, 'el mismo ref no cuenta dos veces');
  r = await pedir({ operacion: 'venta', itemId: 'arco', cantidad: 1, ref: 'ref-00000002' });
  assert.equal(r.body.bronce, 2250); assert.equal(s.Tesoro.doc.saldo, 11250);
  for (const [body, error] of [[{ operacion: 'regalo', itemId: 'arco', cantidad: 1, ref: 'ref-00000003' }, 'operacion_invalida'],
    [{ operacion: 'compra', itemId: 'arco', cantidad: 0, ref: 'ref-00000003' }, 'cantidad_invalida'],
    [{ operacion: 'compra', itemId: 'arco', cantidad: 1000, ref: 'ref-00000003' }, 'cantidad_invalida'],
    [{ operacion: 'compra', itemId: 'arco', cantidad: 1, ref: 'corta' }, 'ref_invalida'],
    [{ operacion: 'compra', itemId: 'arco', cantidad: 1, ref: '../../etc/passwd' }, 'ref_invalida'],
    [{ operacion: 'compra', itemId: 'nada', cantidad: 1, ref: 'ref-00000003' }, 'objeto_sin_precio']]) {
    r = await pedir(body);
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, error);
  }
  assert.equal((await s.llamar('POST', '/api/tesoro/comision', { gp: null, body: { operacion: 'compra', itemId: 'arco', cantidad: 1, ref: 'ref-00000009' } })).statusCode, 403);
  // El tope por jugador y día.
  const hoy = new Date().toISOString().slice(0, 10);
  s._tesoroTiendaDia.set('Ana', { dia: hoy, bronce: s.TESORO_TOPE_TIENDA_DIA - 1000 });
  r = await pedir({ operacion: 'compra', itemId: 'arco', cantidad: 1, ref: 'ref-00000004' });
  assert.equal(r.body.bronce, 1000, 'solo lo que cabe hasta el tope');
  r = await pedir({ operacion: 'compra', itemId: 'arco', cantidad: 1, ref: 'ref-00000005' });
  assert.equal(r.body.bronce, 0); assert.equal(r.body.tope, true);
  assert.equal(s.Tesoro.doc.saldo, 12250);
  assert.equal(s.TesoroMov.filas.length, 3);
});

test('el incentivo: sin nombre no hay, se reserva del saldo, la suerte sube sin premio y baja al cobrar, tope diario', async () => {
  const s = seccion({ tesoro: { saldo: 1e6 }, vips: ['0xvip'] });
  const def = { exp: 150 };
  for (const Username of [undefined, null, '', '   ', '---']) {
    s.setAzar(() => 0);
    assert.equal(await s.tesoroIncentivo({ playerName: 'Anon', Username, address: '0xa' }, def, 'lobo', 10), null);
  }
  assert.equal(s._tesoroRacha.size, 0, 'a quien no tiene nombre ni se le cuenta la suerte');
  const ana = { playerName: 'Ana', Username: 'Ana', address: '0xa' };
  s.setAzar(() => 0.99);                                        // no sale
  assert.equal(await s.tesoroIncentivo(ana, def, 'lobo', 5), null);
  assert.equal(await s.tesoroIncentivo(ana, def, 'lobo', 5), null);
  assert.equal(s._tesoroRacha.get('Ana'), 2);
  s.setAzar(() => 0);                                           // sale
  const b = await s.tesoroIncentivo(ana, def, 'lobo', 5);
  assert.ok(b && b.cantidad >= 100); assert.equal(b.vip, false); assert.equal(b.nivel, 5);
  assert.equal(s._tesoroRacha.get('Ana'), 0);
  assert.equal(s.Tesoro.doc.saldo + s.Tesoro.doc.reservado, 1e6, 'reservar no crea ni destruye monedas');
  assert.equal(s.Tesoro.doc.reservado, b.cantidad);
  const vip = await s.tesoroIncentivo({ playerName: 'Rosa', Username: 'Rosa', address: '0xvip' }, def, 'lobo', 5);
  assert.equal(vip.vip, true);
  assert.ok(vip.cantidad > b.cantidad * 1.2, 'el VIP cobra más con la misma suerte');
  // Tope diario.
  s.Tesoro.doc.config = { topeDiario: 2 }; s.olvidarConfig();
  assert.ok(await s.tesoroIncentivo(ana, def, 'lobo', 5));
  assert.equal(await s.tesoroIncentivo(ana, def, 'lobo', 5), null, 'tercer premio del día: no');
  // Apagado.
  s.Tesoro.doc.config = { activo: false }; s.olvidarConfig();
  assert.equal(await s.tesoroIncentivo({ playerName: 'Leo', Username: 'Leo', address: '0xl' }, def, 'lobo', 5), null);
});

test('el incentivo no sale si el tesoro no da para el pago mínimo (y la suerte sigue)', async () => {
  const s = seccion({ tesoro: { saldo: 50 } });
  s.setAzar(() => 0);
  const ana = { playerName: 'Ana', Username: 'Ana', address: '0xa' };
  assert.equal(await s.tesoroIncentivo(ana, { exp: 150 }, 'lobo', 5), null);
  assert.equal(s.Tesoro.doc.saldo, 50); assert.equal(s.Tesoro.doc.reservado, 0);
  const vacio = seccion();
  vacio.setAzar(() => 0);
  assert.equal(await vacio.tesoroIncentivo(ana, { exp: 150 }, 'lobo', 5), null, 'sin documento del tesoro no hay premio');
});

test('pagar y devolver: el premio va a la moneda de bronce; si no hay stats o caduca, vuelve al saldo', async () => {
  const s = seccion({ tesoro: { saldo: 1000, reservado: 600 } });
  const gp = { playerName: 'Ana', Username: 'Ana' };
  const doc = await s.tesoroPagar(gp, { cantidad: 400, incentivo: { vip: true, nivel: 6, monstruo: 'jefe_desierto' } });
  assert.deepEqual(clone(doc), { playerName: 'Ana', bronce: 400 });
  assert.deepEqual(clone(s.pagados), [{ playerName: 'Ana', stat: 'bronce', n: 400 }], 'a PlayerStats.bronce, nunca al inventario');
  assert.equal(s.Tesoro.doc.reservado, 200); assert.equal(s.Tesoro.doc.pagado.vip, 400); assert.equal(s.Tesoro.doc.pagos.vip, 1);
  await new Promise(r => setImmediate(r));
  assert.equal(s.TesoroMov.filas[0].tipo, 'pago'); assert.equal(s.TesoroMov.filas[0].vip, true); assert.equal(s.TesoroMov.filas[0].detalle, 'jefe_desierto');
  await s.tesoroDevolverReserva(200, 'caducado');
  assert.equal(s.Tesoro.doc.reservado, 0); assert.equal(s.Tesoro.doc.saldo, 1200); assert.equal(s.Tesoro.doc.caducados, 1);
  const sinStats = seccion({ tesoro: { saldo: 0, reservado: 300 }, devolver: false });
  assert.equal(await sinStats.tesoroPagar(gp, { cantidad: 300, incentivo: { vip: false } }), null);
  assert.equal(sinStats.Tesoro.doc.saldo, 300); assert.equal(sinStats.Tesoro.doc.reservado, 0);
  assert.equal(sinStats.Tesoro.doc.caducados, 0, 'no es un caducado');
});

test('al arrancar, lo reservado por el proceso anterior vuelve al saldo una sola vez', async () => {
  const s = seccion({ tesoro: { saldo: 1000, reservado: 250 } });
  assert.equal(await s.tesoroListo(), true);
  assert.equal(s.Tesoro.doc.saldo, 1250); assert.equal(s.Tesoro.doc.reservado, 0);
  s.Tesoro.doc.reservado = 99;                                  // una reserva NUEVA de este proceso
  assert.equal(await s.tesoroListo(), true);
  assert.equal(s.Tesoro.doc.reservado, 99, 'la segunda vez no toca nada');
});

test('el panel: configurar normaliza y guarda; meter y sacar exigen motivo y saldo', async () => {
  const s = seccion({ tesoro: { saldo: 5000 } });
  let r = await s.llamar('POST', '/api/admin/tesoro/config', { body: { config: { modo: 'manual', manual: { free: 90, vip: 12 } } }, admin: { address: '0xadmin' } });
  assert.equal(r.statusCode, 200); assert.equal(r.body.config.modo, 'manual'); assert.equal(r.body.config.manual.free, 75);
  assert.equal(s.Tesoro.doc.config.manual.vip, 12);
  assert.equal((await s.tesoroConfig()).modo, 'manual', 'la caché toma la configuración nueva al momento');
  const ajuste = body => s.llamar('POST', '/api/admin/tesoro/ajuste', { body, admin: { address: '0xadmin' } });
  assert.equal((await ajuste({ tipo: 'robo', bronce: 5, motivo: 'abc' })).body.error, 'tipo_invalido');
  assert.equal((await ajuste({ tipo: 'ingreso', bronce: 0, motivo: 'abc' })).body.error, 'cantidad_invalida');
  assert.equal((await ajuste({ tipo: 'ingreso', bronce: 5, motivo: '  a ' })).body.error, 'motivo_requerido');
  r = await ajuste({ tipo: 'retiro', bronce: 6000, motivo: 'too much' });
  assert.equal(r.statusCode, 409); assert.equal(s.Tesoro.doc.saldo, 5000);
  r = await ajuste({ tipo: 'ingreso', bronce: 2500, motivo: 'Launch boost' });
  assert.equal(r.statusCode, 200); assert.equal(r.body.tesoro.saldo, 7500); assert.equal(s.Tesoro.doc.ingresado.admin, 2500);
  r = await ajuste({ tipo: 'retiro', bronce: 7000, motivo: 'Event prizes' });
  assert.equal(r.body.tesoro.saldo, 500); assert.equal(s.Tesoro.doc.retirado, 7000);
  assert.deepEqual(s.TesoroMov.filas.map(m => m.bronce), [2500, -7000]);
  assert.match(s.TesoroMov.filas[1].detalle, /Event prizes — 0xadmin/);
});

test('los mapas por nivel: misma tabla y misma curva en el servidor y en el cliente', async () => {
  const s = seccion({ stats: { Ana: 1600, Leo: 10 } });
  const cli = nivelesCliente();
  const salaDeMundo = { 3: 'mina', 6: 'salvaje', 7: 'cementerio', 8: 'desierto', 9: 'tundra', 10: 'glaciar', 11: 'caverna', 12: 'pradera' };
  assert.deepEqual(clone(s.GF_NIVEL_MAPA), { mina: 2, salvaje: 4, desierto: 5, cementerio: 6, tundra: 7,
                                             glaciar: 8, caverna: 9, pradera: 10 }, 'lo que pidió el usuario');
  for (const [mundo, sala] of Object.entries(salaDeMundo)) {
    assert.equal(cli.minimo(mundo), s.GF_NIVEL_MAPA[sala], 'mundo ' + mundo);
    assert.equal(s.gfNivelMinimoSala(sala + '#c3'), s.GF_NIVEL_MAPA[sala], 'el canal no cambia el nivel');
  }
  assert.equal(s.gfNivelMinimoSala('game#c1'), 0);
  assert.equal(s.gfNivelMinimoSala('isla@ana'), 0);
  assert.equal(s.gfNivelMinimoSala('constructor'), 0, 'nada heredado de Object');
  for (let e = 0; e <= 20000; e += 37) assert.equal(cli.nivelDeExp(e), s.nivelPorExperiencia(e), 'exp ' + e);
  assert.equal(s.nivelPorExperiencia(400), 2); assert.equal(s.nivelPorExperiencia(1600), 4);
  assert.equal(s.nivelPorExperiencia(3000), 5); assert.equal(s.nivelPorExperiencia(4200), 6); assert.equal(s.nivelPorExperiencia(5600), 7);
  // La experiencia vive en dos sitios: manda la mayor.
  assert.equal(await s.gfNivelDeJugador({ playerName: 'Ana', nivel_exp: 10 }), 4);
  assert.equal(await s.gfNivelDeJugador({ playerName: 'Leo', nivel_exp: 3000 }), 5);
  assert.equal(await s.gfNivelDeJugador(null), 0);
});

test('el mercado P2P cobra el 1,5 % y lo apunta en el tesoro, en bronce', async () => {
  const src = fs.readFileSync(path.join(raiz, 'marketplace-routes.js'), 'utf8');
  assert.match(src, /const MARKET_FEE_BPS = 150;/);
  const desk = 'C:/Users/pc/Desktop/marketplace-routes.js';
  if (fs.existsSync(desk)) assert.equal(fs.readFileSync(desk, 'utf8'), src, 'bin/marketplace-routes.js y el del servidor son el mismo archivo');
  const a = acorn.parse(src, { ecmaVersion: 'latest' });
  const n = buscar(a, x => x.type === 'FunctionDeclaration' && x.id && x.id.name === 'ingresarAlTesoro');
  assert.ok(n, 'falta ingresarAlTesoro en marketplace-routes.js');
  const Tesoro = tesoroFalso(), TesoroMov = movimientosFalsos();
  const c = { Tesoro: { updateOne: (f, u, o) => ({ exec: () => Tesoro.updateOne(f, u, o).exec() }) }, TesoroMov, TESORO_ID: 'principal', Math, Date };
  vm.createContext(c);
  vm.runInContext(src.slice(n.start, n.end) + '\nthis.f = ingresarAlTesoro;', c);
  await c.f('plata', 4.5, 'Vendedor', 'espada_hierro', 3);
  await c.f('oro', 0.02, 'Vendedor', 'cofre1', 1);
  await c.f('plata', 0, 'Vendedor', 'nada', 1);
  assert.equal(Tesoro.doc.saldo, 4500 + 20000);
  assert.equal(Tesoro.doc.ingresado.p2p, 24500); assert.equal(Tesoro.doc.ingresos.p2p, 2);
  assert.deepEqual(TesoroMov.filas.map(m => [m.origen, m.bronce, m.detalle]), [['p2p', 4500, 'p2p espada_hierro x3'], ['p2p', 20000, 'p2p cofre1 x1']]);
});
