'use strict';
/* (2026-10-25) EL ESCANEO HISTÓRICO DE LA AUDITORÍA, EN PAUSA.
 * El RPC de LitVM cortaba a la IP del servidor ("Bandwidth limit exceeded") y
 * el escaneo histórico (un bloque completo cada ~0,5 s, contra 3,67 bloques/s
 * de la cadena) no acaba nunca. server2.js lo deja en pausa salvo
 * LITVM_AUDIT_HISTORICO=1 o que el panel lo reanude.
 * (2026-10-26) Y se pausa / reanuda desde el panel: /api/admin/impact/historico.
 * Aquí se ejecuta ESE trozo del servidor de verdad con un Express y un Mongo de
 * mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const MARCA = '// --- AUDITORIA LITVM: ledger aditivo';
const ID = '4441:0x686e17d89bf97247fadc04c3a3f0dfd02f914115';

function trozo() {
  const i = SRV.indexOf('const LITVM_AUDIT_HISTORICO_ENV');
  const j = SRV.indexOf(MARCA);
  assert.ok(i >= 0 && j > i, 'la pausa va justo antes del bloque de la auditoría');
  return SRV.slice(i, j);
}

/** Un Mongo de mentira que entiende lo justo: _id, status $ne, $or con pausaAdmin, $set, $unset, upsert. */
function mongoFalso(inicial) {
  const docs = new Map();
  if (inicial) docs.set(inicial._id, JSON.parse(JSON.stringify(inicial)));
  const ordenes = [];
  const casa = (d, f) => {
    if (!d || d._id !== f._id) return false;
    if (f.status && f.status.$ne !== undefined && d.status === f.status.$ne) return false;
    if (typeof f.status === 'string' && d.status !== f.status) return false;
    if (f.$or && !f.$or.some((c) => (c.pausaAdmin === true && d.pausaAdmin === true) ||
                                    (c.pausaAdmin && c.pausaAdmin.$exists === false && d.pausaAdmin === undefined))) return false;
    return true;
  };
  const col = {
    updateOne: async (f, u, op) => {
      ordenes.push({ f, u });
      let d = docs.get(f._id);
      if (!casa(d, f)) {
        if (!(op && op.upsert) || d) return { modifiedCount: 0 };
        d = { _id: f._id, ...(u.$setOnInsert || {}) }; docs.set(f._id, d);
      }
      Object.assign(d, u.$set || {});
      Object.keys(u.$unset || {}).forEach((k) => delete d[k]);
      return { modifiedCount: 1 };
    },
    findOne: async (f) => (docs.has(f._id) ? JSON.parse(JSON.stringify(docs.get(f._id))) : null)
  };
  return { docs, ordenes, mongoose: { connection: { collection: (n) => { assert.equal(n, 'litvm_chain_scans'); return col; } } } };
}

function montar(env, inicial) {
  const rutas = [], M = mongoFalso(inicial), arrancados = [];
  const app = {
    post(ruta, ...mw) { rutas.push({ metodo: 'POST', ruta, mw }); },
    get(ruta, ...mw) { rutas.push({ metodo: 'GET', ruta, mw }); }
  };
  const adminAuth = (req, res, next) => (req.admin ? next() : res.status(401).json({ error: 'authentication_required' }));
  const pasa = (req, res, next) => next();
  const ctx = vm.createContext({
    process: { env }, app, mongoose: M.mongoose, adminAuth, strictLimiter: pasa, csrfProtection: pasa, apiLimiter: pasa,
    CHAIN_ID: 4441, CONTRACTS: { ITEMS_CONTRACT: { address: '0x686E17D89bf97247FADC04c3a3F0DFD02f914115' } },
    chainAudit: { startScan: async (op) => { arrancados.push(op); return {}; } },
    console: { log() {}, warn() {} }, Date, String, Promise
  });
  vm.runInContext(trozo(), ctx);
  return { rutas, M, adminAuth, arrancados, ctx };
}

async function llamar(r, req) {
  const out = { cabeceras: {} };
  const res = { set(k, v) { out.cabeceras[k] = v; return this; }, status(c) { out.status = c; return this; },
                json(b) { out.body = b; if (!out.status) out.status = 200; return this; } };
  let i = 0, siguiente = null;
  await new Promise((fin) => {
    const next = (arg) => { if (arg === 'route') { siguiente = 'route'; return fin(); } const h = r.mw[i++]; if (!h) return fin(); const p = h(req, res, next); if (p && p.then) p.then(fin, fin); else if (out.body) fin(); };
    next();
  });
  await new Promise((f) => setTimeout(f, 0));
  out.siguiente = siguiente;
  return out;
}
const ruta = (m, metodo, p) => m.rutas.find((r) => r.metodo === metodo && r.ruta === p);
const esperar = () => new Promise((f) => setTimeout(f, 5));

test('sin decisión del panel ni variable: al arrancar se pausa lo que quedó a medias y analizarCC responde 409', { skip: !HAY }, async () => {
  const m = montar({}, { _id: ID, status: 'running', autoResume: true, owner: 'uuid-viejo' });
  await esperar();
  const d = m.M.docs.get(ID);
  assert.equal(d.autoResume, false);
  assert.equal(d.status, 'paused');
  assert.equal(d.owner, 'pausa-admin', 'el que corría pierde su dueño: su siguiente renew no casa y se corta');
  const scan = ruta(m, 'POST', '/api/admin/impact/scan');
  assert.equal((await llamar(scan, { admin: null })).status, 401, 'pide administrador');
  const r = await llamar(scan, { admin: { address: '0xadmin' } });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'historical_scan_paused');
});

test('el botón: pausar corta y guarda la decisión; reanudar la quita y lo pone en marcha', { skip: !HAY }, async () => {
  const m = montar({ LITVM_AUDIT_HISTORICO: '1' }, { _id: ID, status: 'running', autoResume: true, owner: 'uuid-1' });
  await esperar();
  assert.equal(m.M.docs.get(ID).status, 'running', 'con la variable y sin decisión del panel, sigue');
  const post = ruta(m, 'POST', '/api/admin/impact/historico');
  assert.equal((await llamar(post, { admin: null, body: { activo: false } })).status, 401);

  let r = await llamar(post, { admin: { address: '0xadmin' }, body: { activo: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.activo, false);
  let d = m.M.docs.get(ID);
  assert.equal(d.pausaAdmin, true);
  assert.equal(d.status, 'paused');
  assert.equal(d.autoResume, false);
  assert.equal(d.owner, 'pausa-admin');
  assert.equal((await llamar(ruta(m, 'POST', '/api/admin/impact/scan'), { admin: { address: '0xadmin' } })).status, 409);

  r = await llamar(post, { admin: { address: '0xadmin' }, body: { activo: true } });
  assert.equal(r.body.activo, true);
  d = m.M.docs.get(ID);
  assert.equal(d.pausaAdmin, false);
  assert.equal(d.autoResume, true);
  assert.equal(d.owner, undefined);
  assert.equal(m.arrancados.length, 1, 'se pone en marcha sin esperar al mantenimiento');
  const sigue = await llamar(ruta(m, 'POST', '/api/admin/impact/scan'), { admin: { address: '0xadmin' } });
  assert.equal(sigue.siguiente, 'route', 'reanudado, analizarCC vuelve a la ruta del módulo');

  const g = await llamar(ruta(m, 'GET', '/api/admin/impact/historico'), { admin: { address: '0xadmin' } });
  assert.equal(g.body.activo, true);
  assert.equal(g.body.scan.status, 'interrupted');
});

test('la decisión del panel manda al reiniciar: reanudado no se vuelve a pausar aunque falte la variable', { skip: !HAY }, async () => {
  const m = montar({}, { _id: ID, status: 'interrupted', autoResume: true, pausaAdmin: false });
  await esperar();
  assert.equal(m.M.docs.get(ID).status, 'interrupted');
  assert.equal(m.M.docs.get(ID).autoResume, true);
  const r = await llamar(ruta(m, 'POST', '/api/admin/impact/scan'), { admin: { address: '0xadmin' } });
  assert.equal(r.siguiente, 'route');
  // Y pausado por el panel, la variable no lo arranca.
  const p = montar({ LITVM_AUDIT_HISTORICO: '1' }, { _id: ID, status: 'interrupted', autoResume: true, pausaAdmin: true });
  await esperar();
  assert.equal(p.M.docs.get(ID).autoResume, false);
});

test('el módulo solo retoma un escaneo con autoResume distinto de false, y su renew exige su dueño', { skip: !HAY }, () => {
  // Si el módulo embebido cambia estas reglas, la pausa deja de servir.
  assert.match(SRV, /state\.autoResume !== false/);
  assert.match(SRV, /Scan\.updateOne\(\{ _id: key, owner, generation: activeGeneration, leaseUntil: \{ \$gt: now \} \}/);
  // Las rutas de la pausa se registran ANTES de montar el módulo (que define
  // la suya dentro de mountImpactAnalytics): Express usa la primera.
  const pausa = SRV.indexOf("app.post('/api/admin/impact/scan'", SRV.indexOf('const LITVM_AUDIT_HISTORICO_ENV'));
  const montaje = SRV.indexOf('impactAnalytics = mountImpactAnalytics({');
  assert.ok(pausa > 0 && montaje > pausa);
});
