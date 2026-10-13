'use strict';
/* LAS INVITACIONES Y LA ACTIVIDAD (2026-10-11): el bloque REAL de server2.js
 * ("LAS INVITACIONES Y LA ACTIVIDAD DE CADA JUGADOR") contra un Mongo de
 * mentira en memoria. Se salta si no encuentra el servidor (SERVIDOR=ruta). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const TXT = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
function bloque() {
  const i = TXT.indexOf('// LAS INVITACIONES Y LA ACTIVIDAD DE CADA JUGADOR');
  const fin = "    return res.status(500).json({ ok: false, error: 'No se pudo leer la actividad' });\n  }\n});";
  const j = TXT.indexOf(fin, i);
  assert.ok(i > 0 && j > i, 'no encuentro el bloque en ' + SERVIDOR);
  return TXT.slice(TXT.lastIndexOf('\n', i), j + fin.length);
}

// ── Mongo de mentira ─────────────────────────────────────────────────────
function vale(doc, q) {
  for (const [k, v] of Object.entries(q || {})) {
    if (k === '$or') { if (!v.some(s => vale(doc, s))) return false; continue; }
    const d = doc[k];
    if (v === null) { if (d !== undefined && d !== null) return false; continue; }
    if (v instanceof RegExp) { if (!v.test(String(d === undefined ? '' : d))) return false; continue; }
    if (v && typeof v === 'object' && '$in' in v) { if (!v.$in.some(x => x instanceof RegExp ? x.test(String(d)) : x === d)) return false; continue; }
    if (d !== v) return false;
  }
  return true;
}
function aplicar(doc, u, nuevo) {
  if (nuevo && u.$setOnInsert) Object.assign(doc, u.$setOnInsert);
  Object.assign(doc, u.$set || {});
  for (const k of Object.keys(u.$unset || {})) delete doc[k];
  for (const [k, n] of Object.entries(u.$inc || {})) doc[k] = (Number(doc[k]) || 0) + n;
  for (const [k, n] of Object.entries(u.$max || {})) if (doc[k] === undefined || doc[k] < n) doc[k] = n;
  for (const [k, n] of Object.entries(u.$min || {})) if (doc[k] === undefined || doc[k] > n) doc[k] = n;
}
function cursor(lista) {
  let l = lista.slice();
  const c = {
    select() { return c; },
    sort(s) { const [k, dir] = Object.entries(s)[0]; l.sort((a, b) => ((a[k] || 0) < (b[k] || 0) ? -1 : (a[k] || 0) > (b[k] || 0) ? 1 : 0) * dir); return c; },
    skip(n) { l = l.slice(n); return c; },
    limit(n) { l = l.slice(0, n); return c; },
    lean: async () => l.map(x => ({ ...x })),
    then: (a, b) => Promise.resolve(l.map(x => ({ ...x }))).then(a, b)
  };
  return c;
}
function modelo(filas) {
  const uno = (d) => { const p = Promise.resolve(d ? { ...d } : null); return { select() { return this; }, lean: () => p, then: (a, b) => p.then(a, b) }; };
  return {
    filas,
    findOne: (q) => uno(filas.find(r => vale(r, q))),
    find: (q) => cursor(filas.filter(r => vale(r, q))),
    exists: async (q) => filas.some(r => vale(r, q)) ? { _id: 1 } : null,
    countDocuments: async (q) => filas.filter(r => vale(r, q)).length,
    findOneAndUpdate(q, u, o) {
      let d = filas.find(r => vale(r, q));
      if (!d && o && o.upsert) { d = { ...Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v !== 'object')) }; filas.push(d); aplicar(d, u, true); }
      else if (d) aplicar(d, u, false);
      return uno(d);
    },
    async updateOne(q, u, o) {
      let d = filas.find(r => vale(r, q));
      if (!d && o && o.upsert) { d = { ...Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v !== 'object')) }; filas.push(d); aplicar(d, u, true); return {}; }
      if (d) aplicar(d, u, false);
      return {};
    },
    async aggregate(p) {
      const m = p[0].$match.invitadoPor.$in;
      const cuenta = new Map();
      for (const r of filas) if (m.includes(r.invitadoPor)) cuenta.set(r.invitadoPor, (cuenta.get(r.invitadoPor) || 0) + 1);
      return [...cuenta].map(([k, n]) => ({ _id: k, n }));
    }
  };
}

function montaje() {
  const rutas = new Map(), conexiones = [];
  const UA = modelo([]), GP = modelo([]);
  const pasa = () => {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Date, Math, Map, Set, Number, String, Object, Promise, RegExp, Array, JSON,
    crypto, setTimeout, clearTimeout, process: { env: {} },
    app: { get: (u, ...f) => rutas.set('GET ' + u, f.at(-1)), post: (u, ...f) => rutas.set('POST ' + u, f.at(-1)) },
    io: { on: (ev, fn) => conexiones.push(fn), of: () => ({ sockets: new Map() }) },
    apiLimiter: pasa, authMiddleware: pasa, csrfProtection: pasa, adminAuth: pasa,
    UserActivity: UA, GamePlayer: GP,
    jugadorDeLaSesion: async (req) => GP.filas.find(g => g.address === req.user.address) || null,
    frenado: (s, k, ms) => { const t = Date.now(); s._f = s._f || {}; if (t - (s._f[k] || 0) < ms) return true; s._f[k] = t; return false; }
  };
  vm.createContext(ctx);
  vm.runInContext(bloque() + '\n;this.__x = { anotarCambioDeSala, anotarTiempoDeSala, anotarPesca, pistasDeBot, INVITA_DIAS };', ctx);
  async function llamar(metodo, ruta, address, body, query) {
    let estado = 200, cuerpo;
    await rutas.get(metodo + ' ' + ruta)({ user: { address }, body: body || {}, query: query || {} },
      { status(n) { estado = n; return this; }, json(d) { cuerpo = d; return this; } });
    return { estado, cuerpo };
  }
  function jugador(nombre, extra) {
    const address = '0x' + crypto.createHash('sha1').update(nombre).digest('hex').slice(0, 40);
    GP.filas.push({ playerName: nombre, Username: nombre[0].toUpperCase() + nombre.slice(1), address, nivel: 5 });
    UA.filas.push(Object.assign({ playerName: nombre, registeredAt: new Date(), tiempoJugadoMs: 0 }, extra || {}));
    return address;
  }
  return { ctx, llamar, jugador, UA, GP, conexiones, x: ctx.__x };
}

test('invitaciones: código único y estable, enlace y totales', { skip: !HAY }, async () => {
  const m = montaje();
  const ana = m.jugador('ana');
  const a1 = await m.llamar('GET', '/api/invitaciones/mia', ana);
  assert.equal(a1.estado, 200);
  assert.match(a1.cuerpo.codigo, /^[A-HJ-NP-Z2-9]{8}$/);
  const a2 = await m.llamar('GET', '/api/invitaciones/mia', ana);
  assert.equal(a2.cuerpo.codigo, a1.cuerpo.codigo, 'el mismo código siempre');
  assert.equal(a1.cuerpo.wallet, ana);
  assert.equal(a1.cuerpo.total, 0);
  assert.equal(a1.cuerpo.puedeReclamar, true);
  // El enlace es el del LOGIN (app.grasslandforest.com), con el código.
  assert.equal(a1.cuerpo.enlace, 'https://app.grasslandforest.com/?ref=' + a1.cuerpo.codigo);
  const bea = m.jugador('bea');
  const b1 = await m.llamar('GET', '/api/invitaciones/mia', bea);
  assert.notEqual(b1.cuerpo.codigo, a1.cuerpo.codigo, 'cada cuenta el suyo');
});

test('invitaciones: reclamar con todas sus reglas', { skip: !HAY }, async () => {
  const m = montaje();
  const ana = m.jugador('ana', { ip: '1.1.1.1' });
  const bea = m.jugador('bea', { ip: '1.1.1.1' });
  const cid = m.jugador('cid', { registeredAt: new Date(Date.now() - 30 * 86400000) });
  const cod = (await m.llamar('GET', '/api/invitaciones/mia', ana)).cuerpo.codigo;
  assert.equal((await m.llamar('POST', '/api/invitaciones/reclamar', bea, { codigo: 'nope' })).cuerpo.error, 'codigo_invalido');
  assert.equal((await m.llamar('POST', '/api/invitaciones/reclamar', bea, { codigo: 'ZZZZ2222' })).cuerpo.error, 'codigo_desconocido');
  assert.equal((await m.llamar('POST', '/api/invitaciones/reclamar', ana, { codigo: cod })).cuerpo.error, 'propio');
  const ok = await m.llamar('POST', '/api/invitaciones/reclamar', bea, { codigo: cod.toLowerCase() });
  assert.equal(ok.cuerpo.ok, true, JSON.stringify(ok.cuerpo));
  assert.equal(ok.cuerpo.invitadoPor.nombre, 'Ana');
  assert.equal(ok.cuerpo.invitadoPor.wallet, ana, 'la wallet de quien invita');
  const filaBea = m.UA.filas.find(r => r.playerName === 'bea');
  assert.equal(filaBea.invitadoPor, 'ana');
  assert.equal(filaBea.invitaMismaIp, true, 'misma IP: pista para el admin');
  assert.equal((await m.llamar('POST', '/api/invitaciones/reclamar', bea, { codigo: cod })).cuerpo.error, 'ya_invitado', 'una sola vez');
  // Devolver la invitación a quien te invitó, no.
  const codBea = (await m.llamar('GET', '/api/invitaciones/mia', bea)).cuerpo.codigo;
  assert.equal((await m.llamar('POST', '/api/invitaciones/reclamar', ana, { codigo: codBea })).cuerpo.error, 'circular');
  // Una cuenta que ya jugaba: el ENLACE no le vale (no es un jugador nuevo)...
  assert.equal((await m.llamar('POST', '/api/invitaciones/reclamar', cid, { codigo: cod, origen: 'enlace' })).cuerpo.error, 'no_nuevo');
  // ...y (2026-10-12) ya no hay código escrito a mano: pedirlo como 'codigo'
  // tampoco le vale. Quién te invitó lo detecta el sistema por el enlace.
  const tarde = await m.llamar('POST', '/api/invitaciones/reclamar', cid, { codigo: cod.slice(0, 4) + '-' + cod.slice(4), origen: 'codigo' });
  assert.equal(tarde.cuerpo.error, 'no_nuevo', JSON.stringify(tarde.cuerpo));
  assert.equal(m.UA.filas.find(r => r.playerName === 'cid').invitadoPor, undefined);
  // Una cuenta recién creada sí entra por el enlace.
  const dan = m.jugador('dan');
  const porEnlace = await m.llamar('POST', '/api/invitaciones/reclamar', dan, { codigo: cod, origen: 'enlace' });
  assert.equal(porEnlace.cuerpo.ok, true, JSON.stringify(porEnlace.cuerpo));
  // Los totales de Ana.
  m.UA.filas.find(r => r.playerName === 'bea').tiempoJugadoMs = 45 * 60000;
  const mia = (await m.llamar('GET', '/api/invitaciones/mia', ana)).cuerpo;
  assert.equal(mia.total, 2);
  assert.equal(mia.activos, 1);
  assert.ok(mia.invitados.some(i => i.nombre === 'Bea' && i.activo));
  const deBea = (await m.llamar('GET', '/api/invitaciones/mia', bea)).cuerpo;
  assert.equal(deBea.invitadoPor.nombre, 'Ana');
  assert.equal(deBea.puedeReclamar, false);
});

test('invitaciones: el usuario de Discord se valida y se puede borrar', { skip: !HAY }, async () => {
  const m = montaje();
  const ana = m.jugador('ana');
  assert.equal((await m.llamar('POST', '/api/invitaciones/discord', ana, { discord: 'mal nombre!' })).cuerpo.error, 'discord_invalido');
  assert.equal((await m.llamar('POST', '/api/invitaciones/discord', ana, { discord: '@grass.player_01' })).cuerpo.discord, 'grass.player_01');
  assert.equal(m.UA.filas.find(r => r.playerName === 'ana').discord, 'grass.player_01');
  assert.equal((await m.llamar('POST', '/api/invitaciones/discord', ana, { discord: 'Old#1234' })).cuerpo.ok, true, 'el formato viejo con #');
  await m.llamar('POST', '/api/invitaciones/discord', ana, { discord: '' });
  assert.equal(m.UA.filas.find(r => r.playerName === 'ana').discord, undefined);
});

test('actividad: el tiempo por sala lo cuenta el servidor; la pesca y el panel de la tienda', { skip: !HAY }, async () => {
  const m = montaje();
  m.jugador('ana');
  const sock = { authenticatedPlayer: 'ana', on(ev, fn) { this['_' + ev] = fn; } };
  m.x.anotarCambioDeSala(sock, 'mina');
  sock._salaDesde -= 120000;                       // dos minutos en la mina
  m.x.anotarCambioDeSala(sock, 'tienda');
  await new Promise(r => setImmediate(r));
  const fila = m.UA.filas.find(r => r.playerName === 'ana');
  assert.ok(fila.tiempoMinaMs >= 120000 && fila.tiempoMinaMs < 125000, String(fila.tiempoMinaMs));
  assert.ok(fila.primeraPartida && fila.ultimaPartida, 'primera y última partida');
  sock._salaDesde -= 30000;
  m.x.anotarTiempoDeSala(sock);                    // el volcado de cada 5 min / al desconectar
  await new Promise(r => setImmediate(r));
  assert.ok(fila.tiempoTiendaMs >= 30000);
  m.x.anotarPesca('ana', 40000, false);
  m.x.anotarPesca('ana', 999999, true);           // con tope: dos minutos
  await new Promise(r => setImmediate(r));
  assert.equal(fila.capturas, 1);
  assert.equal(fila.tiempoPescaMs, 40000 + 120000);
  // El panel de la tienda: como mucho un aviso cada 25 s.
  m.conexiones.forEach(fn => fn(sock));
  sock['_actividad:tienda'](); sock['_actividad:tienda']();
  await new Promise(r => setImmediate(r));
  assert.equal(fila.tiempoTiendaAbiertaMs, 30000);
});

test('admin: actividad con sus pistas de bot', { skip: !HAY }, async () => {
  const m = montaje();
  const hace2d = new Date(Date.now() - 2 * 86400000);
  m.jugador('bot', { tiempoJugadoMs: 40 * 3600000, primeraPartida: hace2d, tiempoPescaMs: 30 * 3600000, capturas: 9000, invitadoPor: 'ana', invitaMismaIp: true });
  m.jugador('ana', { tiempoJugadoMs: 3 * 3600000 });
  const r = await m.llamar('GET', '/api/admin/actividad', null, null, { orden: 'tiempo' });
  assert.equal(r.cuerpo.ok, true);
  assert.equal(r.cuerpo.jugadores[0].playerName, 'bot', 'de más tiempo a menos');
  const p = r.cuerpo.jugadores[0].pistas;
  for (const esperada of ['14h+ per day', 'fishing 60%+ of the time', 'catches too fast', 'same IP as inviter']) assert.ok(p.includes(esperada), esperada);
  assert.equal(r.cuerpo.jugadores[1].pistas.length, 0, 'una persona normal, sin pistas');
  assert.equal(r.cuerpo.jugadores[1].invitados, 1);
  assert.equal(r.cuerpo.jugadores[0].invitadoPor, 'Ana');
  const q = await m.llamar('GET', '/api/admin/actividad', null, null, { q: 'an' });
  assert.deepEqual(q.cuerpo.jugadores.map(j => j.playerName), ['ana']);
});
