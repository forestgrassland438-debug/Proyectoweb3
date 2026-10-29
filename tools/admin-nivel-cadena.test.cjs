'use strict';
/* (2026-10-25) EL NIVEL DEL PANEL DE ADMINISTRACIÓN, TAMBIÉN EN LA CADENA.
 * "Quiero ponerle otro nivel al personaje: solo se cambia el off-chain, no el
 * on-chain." Se ejecuta el código REAL de server2.js (la ruta PATCH del
 * administrador y sincronizarIdentidadEnCadena) con Mongo y contrato de
 * mentira, y el módulo del cliente que adopta el aviso (gf-admin-ajuste.js). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';

/** Un trozo de server2.js desde `inicio` hasta el primer `fin` posterior (incluido). */
function trozo(inicio, fin) {
  const i = SRV.indexOf(inicio);
  assert.ok(i >= 0, 'no está en server2.js: ' + inicio);
  const j = SRV.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return SRV.slice(i, j + fin.length);
}
// Las funciones de la curva, las de verdad.
function curva() {
  return trozo('function expTotalParaNivel(n) {', '\n}\n') + '\n' + trozo('function nivelPorExperiencia(exp) {', '\n}\n') +
    '\n' + trozo('function expMascotaParaNivel(n) {', '\n}\n') + '\n' + trozo('function nivelMascotaPorExp(exp) {', '\n}\n') +
    '\n' + trozo('function progresoMascota(petExp) {', '\n}\n') + '\n' + trozo('const VITAL_MAX ', ';\n') +
    '\n' + trozo('const isVitalStat = ', ';\n') + '\n' + trozo('function clampStat(stat, value) {', '\n}\n');
}
const lean = (v) => ({ select() { return this; }, lean: async () => (v ? JSON.parse(JSON.stringify(v)) : v) });

test('cambiar el Nivel mueve la exp en Mongo y en su factura, pone exacto el nivel del personaje en la cadena y avisa al jugador', { skip: !HAY }, async () => {
  const llamadas = { set: null, stats: [], identidad: [], avisos: [], programada: 0 };
  let handler = null;
  const gp = { playerName: 'p1', nivel: 5, nivel_exp: 3000, petLevel: 4, petExp: 1000, address: '0xabc' };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error(...a) { throw new Error(a.join(' ')); } }, Math, Number, String, Object, JSON, Promise, Array,
    MAX_LEVEL_PERSONAJE: 150, MAX_LEVEL_MASCOTA: 150,
    ADMIN_CAMPOS_SEGUROS: ['Username', 'nivel', 'nivel_exp', 'petLevel'],
    ADMIN_CAMPOS_ONCHAIN: ['vida', 'agua', 'comida', 'oro', 'plata', 'bronce', 'exp'],
    app: { patch(ruta, ...mw) { if (ruta === '/api/admin/players/:playerName') handler = mw[mw.length - 1]; } },
    adminAuth() {}, strictLimiter() {},
    resolvePlayerName: async (n) => n,
    GamePlayer: {
      findOne(q) {
        if (!llamadas.set) return Object.assign({ then: undefined }, lean(gp), gp);
        return lean(Object.assign({}, gp, llamadas.set));
      },
      updateOne: async (q, u) => { llamadas.set = u.$set; }
    },
    PlayerStats: {
      findOne(q) {
        const doc = { exp: 3000, oro: 7, invoiceIds: { exp: 42 }, save: async () => {} };
        const p = Promise.resolve(doc);
        p.lean = async () => ({ exp: llamadas.stats.length ? llamadas.stats[llamadas.stats.length - 1].valor : 3000, oro: 7 });
        return p;
      }
    },
    getStatsContract: () => ({}), getSafeGasPriceStats: async () => 1,
    applyStatOnChain: async (c, stat, id, valor) => { llamadas.stats.push({ stat, id, valor }); return { ok: true, chainQty: valor }; },
    _identidadFirma: new Map(), _identidadTimer: new Map(),
    programarIdentidadEnCadena() { llamadas.programada++; },
    enColaDelJugador: (clave, fn) => fn(),
    sincronizarIdentidadEnCadena: async (n, op) => { llamadas.identidad.push(op); return { ok: true, objetivo: { pj: 10, pet: 4 } }; },
    avisarAJugador: (n, ev, d) => llamadas.avisos.push({ n, ev, d })
  });
  vm.runInContext(curva() + '\n' + trozo("app.patch('/api/admin/players/:playerName'", '\n});\n'), ctx);
  assert.ok(handler, 'la ruta PATCH');
  let respuesta = null;
  const res = { status() { return this; }, json(b) { respuesta = b; return this; } };
  await handler({ params: { playerName: 'p1' }, body: { cambios: { nivel: '10' } }, admin: { address: '0xadmin' } }, res);

  const exp10 = vm.runInContext('expTotalParaNivel(10)', ctx);
  assert.equal(llamadas.set.nivel_exp, exp10, 'la exp de Mongo es la del nivel 10');
  assert.equal(llamadas.set.nivel, 10);
  assert.deepEqual(llamadas.stats.map(s => [s.stat, s.id, s.valor]), [['exp', 42, exp10]], 'y la factura `exp` va con ella');
  assert.equal(llamadas.identidad.length, 1, 'la tabla de nivel se escribe ya, esperando');
  assert.equal(JSON.stringify(llamadas.identidad[0].exacto), JSON.stringify({ pj: true, pet: false }), 'exacta solo para el personaje');
  assert.equal(llamadas.programada, 0, 'sin el antirrebote de 4 s encima');
  assert.equal(llamadas.avisos.length, 1);
  assert.equal(llamadas.avisos[0].ev, 'admin:ajuste');
  assert.equal(llamadas.avisos[0].d.stats.exp, exp10);
  assert.equal(respuesta.ok, true, JSON.stringify(respuesta.errores));
  const campos = respuesta.aplicados.map(a => a.campo).sort();
  assert.equal(campos.join(','), 'exp,nivel,nivel_en_cadena,nivel_exp');
  assert.equal(respuesta.aplicados.find(a => a.campo === 'nivel').a, 10);
});

test('la identidad en cadena: con `exacto` baja el nivel; sin él, solo sube y la mascota se recupera', { skip: !HAY }, async () => {
  const fuente = curva() + '\n' + trozo('async function sincronizarIdentidadEnCadena(playerName, opciones) {', '\n}\n');
  function montar(nivelExp, petExp, facturas) {
    const tx = [];
    const ctx = vm.createContext({
      console: { log() {}, warn() {} }, Math, Number, String, JSON, Buffer, MAX_LEVEL_PERSONAJE: 150, MAX_LEVEL_MASCOTA: 150,
      TABLA_NIVEL: 'nivel', TABLA_NOMBRE: 'nombre',
      contratoItemsServidor: () => ({
        createInvoice: (...a) => ({ op: 'create', a }), increaseInvoiceQuantity: (id, d) => ({ op: 'up', id, d }),
        decreaseInvoiceQuantity: (id, d) => ({ op: 'down', id, d })
      }),
      GamePlayer: { findOne: () => lean({ address: '0xABC', Username: 'Ana', petName: 'Rex', nivel_exp: nivelExp, petExp }),
                    updateOne: async (q, u) => { tx.push({ op: 'mongo', set: u.$set }); } },
      nivelMascotaEfectivo: (g) => vm.runInContext('nivelMascotaPorExp(' + Number(g.petExp) + ')', ctx),
      _identidadFirma: new Map(), tablaExiste: async () => true, facturasDeCadena: async () => facturas,
      manualIdNivel: (a, q) => 'nv:' + q + ':' + String(a).toLowerCase(), manualIdNombre: (q, n) => q + ':' + n,
      txRelayer: async (nombre, fn) => { tx.push(fn({})); }
    });
    vm.runInContext(fuente, ctx);
    return { ctx, tx };
  }
  const nombres = [{ id: 7, tipo: 'nombre', manualId: 'pj:Ana', cantidad: 1 }, { id: 8, tipo: 'nombre', manualId: 'pet:Rex', cantidad: 1 }];
  const fact = (pj, pet) => [{ id: 1, tipo: 'nivel', manualId: 'nv:pj:0xabc', cantidad: pj }, { id: 2, tipo: 'nivel', manualId: 'nv:pet:0xabc', cantidad: pet }, ...nombres];

  // El administrador baja al personaje del 12 al 3 (la mascota no la tocó y va por delante en la cadena).
  let m = montar(1200, 0, fact(12, 9));
  const exp3 = vm.runInContext('expTotalParaNivel(3)', m.ctx);
  m = montar(exp3, 0, fact(12, 9));
  await m.ctx.sincronizarIdentidadEnCadena('p1', { exacto: { pj: true, pet: false } });
  assert.deepEqual(m.tx.filter(t => t.op === 'down').map(t => [t.id, t.d]), [[1, 9]], 'el personaje baja 12 → 3');
  assert.ok(m.tx.some(t => t.op === 'mongo' && t.set.petLevel === 9), 'y la mascota se sigue recuperando de la cadena, no se baja');

  // Sin `exacto` (el juego): nunca baja.
  m = montar(exp3, 0, fact(12, 9));
  await m.ctx.sincronizarIdentidadEnCadena('p1');
  assert.equal(m.tx.filter(t => t.op === 'down').length, 0);

  // Subir sigue igual.
  const exp20 = vm.runInContext('expTotalParaNivel(20)', m.ctx);
  m = montar(exp20, 0, fact(12, 1));
  await m.ctx.sincronizarIdentidadEnCadena('p1', { exacto: { pj: true, pet: false } });
  assert.deepEqual(m.tx.filter(t => t.op === 'up').map(t => [t.id, t.d]), [[1, 8]]);
});

test('el jugador conectado adopta lo que puso el administrador (gf-admin-ajuste.js)', () => {
  const escena = {
    sys: { isActive: () => true }, nivel_exp: 3000, _lastExpSynced: 3000, moneda: 7, moneda_plata: 1, vidaPorcentaje: 50,
    statsSync: { _pending: { exp: 3005, oro: 7, agua: 40 } }, notifications: { show(t) { escena.aviso = t; } },
    _nivelDesdeExp() { escena.recalculado = true; }, _aplicarNivelMascota(d) { escena.mascota = d.petLevel; }
  };
  const win = { console: { log() {}, warn() {} }, setInterval() {}, playerStats: { exp: 3000, oro: 7 },
                game: { scene: { scenes: [escena] } }, globalSocket: null };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-admin-ajuste.js'), 'utf8'), ctx);
  ctx.GFAdminAjuste.aplicar({ stats: { exp: 11000, oro: 250 }, pet: { petLevel: 6, petExp: 2100 } });
  assert.equal(escena.nivel_exp, 11000);
  assert.equal(escena._lastExpSynced, 11000, '_syncExp no la vuelve a mandar');
  assert.equal(escena.recalculado, true);
  assert.equal(escena.moneda, 250);
  assert.equal(escena.mascota, 6);
  assert.equal(win.playerStats.exp, 11000);
  assert.equal(win.playerStats.oro, 250);
  assert.equal(JSON.stringify(escena.statsSync._pending), JSON.stringify({ agua: 40 }), 'lo pendiente viejo de exp y oro se tira; el agua no');
  assert.ok(escena.aviso, 'se le avisa');
  // Basura: no rompe ni toca nada.
  ctx.GFAdminAjuste.aplicar({ stats: { exp: -5, oro: 'x' } });
  assert.equal(escena.nivel_exp, 11000);
});

test('admin.html: Nivel, Exp y Nivel mascota cuentan como cambios en la cadena, y el bronce se puede editar', () => {
  const html = fs.readFileSync(path.join(BIN, 'admin.html'), 'utf8');
  assert.match(html, /var CAMPOS_A_CADENA = \['nivel', 'nivel_exp', 'petLevel'\];/);
  assert.match(html, /CAMPOS_A_CADENA\.indexOf\(k\) >= 0/);
  assert.match(html, /\['bronce', 'Bronce'\]/);
  const idx = fs.readFileSync(path.join(BIN, 'index.html'), 'utf8');
  assert.match(idx, /<script src="\.\/gf-admin-ajuste\.js\?v=[^"]+" defer><\/script>/);
});
