/* El servidor de las batallas de arena, sin servidor.
 *
 * Saca del server2.js DE VERDAD todo el bloque de las batallas (cola, sala de
 * espera, diarias, práctica, el motor incrustado, los sockets) y lo ejecuta
 * con una base de datos de mentira, sockets de mentira y un reloj de mentira.
 * Así se juegan partidas enteras en un segundo y se comprueba lo que de otra
 * forma solo se ve con dos navegadores y un Mongo:
 *
 *   · que una diaria arranca, se juega, suma el contador y suelta el candado;
 *   · que dos jugadores en cola abren una sala, un tercero entra, y empieza;
 *   · que quien se va a mitad cae, y el otro gana y recibe su resultado;
 *   · que quien se rinde se queda mirando y recibe el final;
 *   · que la práctica no da puntos;
 *   · que la mascota tiene SU nivel, de SU experiencia (2026-10-03): arranca
 *     en el del personaje (nadie baja), sube peleando, y un nivel inflado
 *     guardado no se cuela;
 *   · que la arena da EXP al personaje y a la mascota;
 *   · que un perro que intenta teletransportarse es recolocado.
 *
 *   node tools/brawl-prueba-servidor.js  [ruta a server2.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SERVIDOR = process.argv[2] ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');
if (!fs.existsSync(SERVIDOR)) {
  console.error('No encuentro el servidor en: ' + SERVIDOR);
  process.exit(2);
}
const TXT = fs.readFileSync(SERVIDOR, 'utf8');

function sacar(desde, hasta) {
  const i = TXT.indexOf(desde);
  if (i < 0) throw new Error('no encuentro en el servidor: ' + desde);
  const j = TXT.indexOf(hasta, i);
  if (j < 0) throw new Error('no encuentro el final de: ' + desde);
  return TXT.slice(i, j + hasta.length);
}

const BLOQUE = sacar('// BATALLAS DE ARENA EN TIEMPO REAL (estilo brawl)',
  "console.log('✅ Battle routes cargados: GET /api/battle/leaderboard + sockets brawl:* (arenas: ' + BRAWL_ARENAS.join(', ') + ')');");
const PIEZAS = [
  sacar('function computePetLevel(wins, battles) {', '\n}'),
  sacar('function nivelMascotaEfectivo(gp) {', '\n}'),
  sacar('const BATTLE_DAILY_MAX = 5;', ';'),
  // La experiencia propia de la mascota (bloque de identidad en la cadena).
  sacar('const MAX_LEVEL_MASCOTA = 150;', ';'),
  sacar('function expMascotaParaNivel(n) {', '\n}'),
  sacar('function nivelMascotaPorExp(exp) {', '\n}'),
  sacar('const BRAWL_EXP_MASCOTA = {', '\n};'),
  sacar('function expMascotaDeArena(match, fila) {', '\n}'),
  sacar('async function sembrarExpMascota(playerName) {', '\n}'),
  sacar('function progresoMascota(petExp) {', '\n}')
].join('\n\n');

// ── reloj de mentira ────────────────────────────────────────────────────────
let RELOJ = 1790000000000;
const temporizadores = [];
let sigT = 1;
function ponerT(fn, ms, repite) {
  const t = { id: sigT++, fn, cuando: RELOJ + Math.max(0, ms | 0), cada: repite ? Math.max(1, ms | 0) : 0, vivo: true };
  temporizadores.push(t);
  return { _t: t, unref() { return this; }, ref() { return this; } };
}
const falsos = {
  setTimeout: (fn, ms) => ponerT(fn, ms, false),
  setInterval: (fn, ms) => ponerT(fn, ms, true),
  clearTimeout: (h) => { if (h && h._t) h._t.vivo = false; },
  clearInterval: (h) => { if (h && h._t) h._t.vivo = false; }
};
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(RELOJ); }
  static now() { return RELOJ; }
}
function avanzar(ms) {
  const fin = RELOJ + ms;
  for (;;) {
    let prox = null;
    for (const t of temporizadores) if (t.vivo && t.cuando <= fin && (!prox || t.cuando < prox.cuando)) prox = t;
    if (!prox) break;
    RELOJ = Math.max(RELOJ, prox.cuando);
    if (prox.cada) prox.cuando += prox.cada; else prox.vivo = false;
    prox.fn();
  }
  RELOJ = fin;
}
async function avanzarAsync(ms, paso) {
  const p = paso || 50;
  for (let t = 0; t < ms; t += p) {
    avanzar(p);
    await new Promise((r) => setImmediate(r));
    if (hooks.cadaPaso) hooks.cadaPaso();
  }
}
const hooks = { cadaPaso: null };

// ── base de datos de mentira ───────────────────────────────────────────────
const DB = { players: {}, scores: [], logs: [], daily: {} };
function lean(v) { return { lean: () => Promise.resolve(v), select() { return this; }, exec: () => Promise.resolve(v) }; }
const GamePlayer = {
  findOne(q) {
    const gp = DB.players[q.playerName];
    let r = gp ? { ...gp } : null;
    if (r && q.petBattles && q.petBattles.$exists === false && r.petBattles != null) r = null;
    if (r && q.petExp && q.petExp.$exists === false && r.petExp != null) r = null;
    return { select() { return this; }, lean: () => Promise.resolve(r), exec: () => Promise.resolve(r) };
  },
  findOneAndUpdate(q, upd) {
    const gp = DB.players[q.playerName];
    if (gp && upd.$inc) for (const k in upd.$inc) gp[k] = (gp[k] || 0) + upd.$inc[k];
    return { lean: () => Promise.resolve(gp ? { ...gp } : null) };
  },
  updateOne(q, upd) {
    const gp = Object.values(DB.players).find((p) => (q._id ? p._id === q._id : p.playerName === q.playerName));
    if (gp) {
      if (q.petBattles && q.petBattles.$exists === false && gp.petBattles != null) return Promise.resolve({});
      if (q.petExp && q.petExp.$exists === false && gp.petExp != null) return Promise.resolve({});
      if (upd.$set) Object.assign(gp, upd.$set);
      if (upd.$max) for (const k in upd.$max) gp[k] = Math.max(gp[k] || 0, upd.$max[k]);
    }
    return Promise.resolve({});
  }
};
const BattleScore = {
  findOneAndUpdate(q, upd) {
    let d = DB.scores.find((s) => s.seasonNumber === q.seasonNumber && s.playerName === q.playerName);
    if (!d) { d = { _id: 's' + DB.scores.length, seasonNumber: q.seasonNumber, playerName: q.playerName, points: 0, wins: 0, losses: 0, battles: 0, streak: 0, bestStreak: 0 }; DB.scores.push(d); }
    Object.assign(d, upd.$set || {});
    for (const k in (upd.$inc || {})) d[k] = (d[k] || 0) + upd.$inc[k];
    return Promise.resolve({ ...d });
  },
  updateOne(q, upd) { const d = DB.scores.find((s) => s._id === q._id); if (d) Object.assign(d, upd.$set); return Promise.resolve({}); },
  aggregate(p) {
    const name = p[0].$match.playerName;
    const f = DB.scores.filter((s) => s.playerName === name);
    if (!f.length) return Promise.resolve([]);
    return Promise.resolve([{ w: f.reduce((a, s) => a + s.wins, 0), b: f.reduce((a, s) => a + s.battles, 0) }]);
  }
};
const BattleLog = { create(d) { DB.logs.push(d); return Promise.resolve(d); } };
const BattleDaily = {
  findOne(q) { return lean(DB.daily[q.playerName + '|' + q.day] || null); },
  findOneAndUpdate(q, upd) {
    const k = q.playerName + '|' + q.day;
    const d = DB.daily[k] || (DB.daily[k] = { playerName: q.playerName, day: q.day, done: 0, wins: 0 });
    for (const x in upd.$inc) d[x] += upd.$inc[x];
    return Promise.resolve({ ...d });
  }
};
const PlayerAuth = { findOne: () => lean(null) };
// La factura de exp (la que manda al cargar) y su deuda con la cadena.
DB.stats = {};
const PlayerStats = {
  findOne(q) {
    const d = DB.stats[q.playerName];
    if (!d) return Promise.resolve(null);
    return Promise.resolve(Object.assign(d, { save() { return Promise.resolve(this); } }));
  }
};
const clampStat = (stat, v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const marcarPendienteDeCadena = (doc, stats) => {
  doc.chainPending = Array.from(new Set([...(doc.chainPending || []), ...[].concat(stats)]));
};
const getCurrentBattleSeason = () => Promise.resolve({ seasonNumber: 7 });
// La escritura en la cadena (tablas nivel/nombre) se apunta, no se hace.
const identidadProgramada = [];
const programarIdentidadEnCadena = (n) => { identidadProgramada.push(n); };
const battleTodayKey = () => '2026-10-02';
// lo que toca la purga
const vacios = { plantSpamTracker: new Map(), _gatherLastByPlayer: new Map(), _verifierCooldown: new Map(),
  _cuervoUltimo: new Map(), chatHistory: new Map(), rooms: {}, _adminAddrCache: new Map() };

// ── sockets de mentira ─────────────────────────────────────────────────────
const conexiones = [];
const io = { on(ev, fn) { if (ev === 'connection') conexiones.push(fn); }, of() { return { sockets: new Map() }; } };
let sigSocket = 1;
function socketFalso(nombre, address) {
  const s = {
    id: 'S' + (sigSocket++), connected: true, authenticatedAddress: address,
    authenticatedPlayer: nombre, oyentes: {}, recibidos: [],
    on(ev, fn) { (this.oyentes[ev] = this.oyentes[ev] || []).push(fn); },
    emit(ev, d) { this.recibidos.push([ev, d]); },
    mandar(ev, d) { (this.oyentes[ev] || []).forEach((fn) => fn(d)); },
    ultimo(ev) { for (let i = this.recibidos.length - 1; i >= 0; i--) if (this.recibidos[i][0] === ev) return this.recibidos[i][1]; return null; },
    cuantos(ev) { return this.recibidos.filter((r) => r[0] === ev).length; },
    desconectar() { this.connected = false; this.mandar('disconnect'); }
  };
  conexiones.forEach((fn) => fn(s));
  return s;
}
function jugador(nombre, nivelExp, extra) {
  DB.players[nombre] = Object.assign({ _id: 'p_' + nombre, playerName: nombre, petName: 'Rex_' + nombre, nivel_exp: nivelExp || 0, petLevel: 1, petHealth: 100 }, extra || {});
  return socketFalso(nombre, '0x' + nombre.toLowerCase().padEnd(40, '0'));
}

// ── cargar el bloque del servidor ──────────────────────────────────────────
const consola = { log() {}, warn() {}, error: (...a) => { errores.push(a.map(String).join(' ')); } };
const errores = [];
const nombres = ['io', 'GamePlayer', 'BattleScore', 'BattleLog', 'BattleDaily', 'PlayerAuth', 'PlayerStats',
  'clampStat', 'marcarPendienteDeCadena', 'getCurrentBattleSeason', 'programarIdentidadEnCadena',
  'battleTodayKey', 'console', 'Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'].concat(Object.keys(vacios));
const valores = [io, GamePlayer, BattleScore, BattleLog, BattleDaily, PlayerAuth, PlayerStats,
  clampStat, marcarPendienteDeCadena, getCurrentBattleSeason, programarIdentidadEnCadena,
  battleTodayKey, consola, FakeDate, falsos.setTimeout, falsos.setInterval, falsos.clearTimeout, falsos.clearInterval]
  .concat(Object.values(vacios));
const fabrica = new Function(...nombres, PIEZAS + '\n\n' + BLOQUE +
  '\nreturn { GFBrawlMotor, battleMatches, socketMatch, battleQueue, battleAdmissions, purgarMapasEnMemoria, nivelMascotaEfectivo, nivelPorExperiencia, expDeArena, expMascotaDeArena, expMascotaParaNivel, nivelMascotaPorExp, progresoMascota, brawlSalaActual: () => brawlSala };');
const S = fabrica(...valores);
const M = S.GFBrawlMotor;

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK    ' + m); } else { fallos++; console.log('  FALLO ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };

/* Un humano de mentira con dos dedos de frente: va hacia el rival más cercano
   que ve (con la misma física que el cliente) y le dispara. */
function piloto(sock) {
  const st = { seq: 0, c: 0, x: null, y: null, R: null, yo: null, armas: null, ultDisparo: 0, ves: [] };
  const ini = () => {
    const d = sock.ultimo('brawl:inicio');
    if (!d || (st.inicio === d)) return;
    st.inicio = d; st.R = M.crearRejilla(d.arena); st.yo = d.yo;
    const me = d.luchadores.find((l) => l.id === d.yo); st.x = me.x; st.y = me.y; st.vel = me.vel; st.seq = 0; st.c = 0;
  };
  return {
    st,
    paso() {
      ini();
      if (!st.R) return;
      const snap = sock.ultimo('brawl:snap');
      if (!snap) return;
      if (snap.y && snap.y.c > st.c) { if (snap.y.x != null) { st.x = snap.y.x; st.y = snap.y.y; } st.c = snap.y.c; }
      const otros = snap.f.filter((f) => f[0] !== st.yo);
      if (!otros.length) return;
      otros.sort((a, b) => Math.hypot(a[1] - st.x, a[2] - st.y) - Math.hypot(b[1] - st.x, b[2] - st.y));
      const o = otros[0];
      const dx = o[1] - st.x, dy = o[2] - st.y, d = Math.hypot(dx, dy) || 1;
      if (d > 150) {
        const p = M.moverCirculo(st.R, st.x, st.y, dx / d * st.vel * 0.05, dy / d * st.vel * 0.05, M.REGLAS.RADIO);
        st.x = p[0]; st.y = p[1];
      }
      sock.mandar('brawl:mover', { s: ++st.seq, x: st.x, y: st.y, c: st.c, a: Math.atan2(dy, dx) });
      if (d < 220 && RELOJ - st.ultDisparo > 380) { st.ultDisparo = RELOJ; sock.mandar('brawl:disparo', { a: Math.atan2(dy, dx), s: st.seq }); }
    }
  };
}

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 1. UNA BATALLA DIARIA, DE PRINCIPIO A FIN ===');
  const ana = jugador('Ana', 2000);               // nivel de personaje 4
  DB.stats.Ana = { playerName: 'Ana', exp: 2000 };
  ana.mandar('brawl:bot');
  await avanzarAsync(100);
  const ini = ana.ultimo('brawl:inicio');
  ok(!!ini, 'llega brawl:inicio');
  ok(ini && ini.modo === 'bot' && ini.luchadores.length === 2, 'diaria: ella y un bot', ini && ini.luchadores.length);
  ok(ini && ini.extra && ini.extra.daily && ini.extra.daily.nextRound === 1, 'el inicio trae la ronda del día');
  ok(ini && ini.arena && ini.arena.filas.length === ini.arena.alto, 'el inicio trae la rejilla de la arena');
  ok(S.socketMatch.has(ana.id), 'queda apuntada en su partida');
  const pa = piloto(ana);
  hooks.cadaPaso = () => pa.paso();
  await avanzarAsync(200000);
  hooks.cadaPaso = null;
  const fin = ana.ultimo('brawl:fin');
  ok(!!fin, 'llega brawl:fin', fin);
  ok(ana.cuantos('brawl:ya') === 1, 'la cuenta atrás termina una vez');
  ok(ana.cuantos('brawl:snap') > 40, 'recibe instantáneas', ana.cuantos('brawl:snap'));
  ok(fin && fin.daily && fin.daily.done === 1, 'la diaria cuenta 1/5', fin && fin.daily);
  ok(fin && fin.puntos === (fin.resultado === 'win' ? 1 : 0), 'puntos de diaria: 1 si gana, 0 si no', fin && [fin.resultado, fin.puntos]);
  ok(!S.socketMatch.has(ana.id) && !S.battleAdmissions.size, 'el candado se suelta al acabar');
  ok(S.battleMatches.size === 0, 'la partida se borra de memoria');
  ok(DB.players.Ana.petBattles === 1, 'contador de por vida: 1 batalla', DB.players.Ana.petBattles);
  ok(ana.cuantos('petLevelUpdate') === 1, 'se avisa del nivel de la mascota');
  ok(fin && fin.petLevel === S.nivelMascotaEfectivo(DB.players.Ana), 'el nivel del final es el mismo que da /api/load', fin && fin.petLevel);
  const expEsperada = fin && fin.resultado === 'win' ? 60 : 15;
  ok(fin && fin.exp === expEsperada, 'la diaria da EXP (60 si gana, 15 si no)', fin && [fin.resultado, fin.exp]);
  ok(DB.players.Ana.nivel_exp === 2000 + expEsperada, 'la exp llega a GamePlayer.nivel_exp', DB.players.Ana.nivel_exp);
  ok(DB.stats.Ana.exp === 2000 + expEsperada && (DB.stats.Ana.chainPending || []).includes('exp'),
     'y a la factura de exp, apuntada para la cadena', DB.stats.Ana);
  const aviso = ana.ultimo('petLevelUpdate');
  ok(aviso && aviso.expTotal === 2000 + expEsperada, 'el aviso al mapa lleva la exp total (para quien ya se fue)', aviso);
  // La MASCOTA: sembrada en el nivel del personaje (4 -> 1000) y con lo suyo.
  const petEsperada = fin && fin.resultado === 'win' ? 100 : 25;
  ok(DB.players.Ana.petExp === S.expMascotaParaNivel(4) + petEsperada,
     'la mascota arranca en el nivel que se veía (4) y suma SU experiencia', DB.players.Ana.petExp);
  ok(fin && fin.petExpGanada === petEsperada && fin.petLevelAntes === 4, 'el final dice lo que ganó la mascota y su nivel de antes', fin && [fin.petExpGanada, fin.petLevelAntes]);
  ok(aviso && aviso.petExp === DB.players.Ana.petExp && aviso.petExpSiguiente > aviso.petExpBase,
     'el aviso lleva la barra de la mascota', aviso);
  ok(identidadProgramada.includes('Ana'), 'y se programa escribir el nivel en la cadena');
  ok(DB.logs.length === 1, 'queda en el registro');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 2. UN SOLO NIVEL (el fallo de "tengo 5 o 6 y me dice 34 o 52") ===');
  /* Un veterano: 160 batallas en temporadas pasadas y un nivel de mascota
     guardado de 34 (lo que daban los contadores de toda la vida), pero el
     PERSONAJE es nivel 3. Antes salía 34 en el perro y 3 en el HUD. */
  DB.players.Veterano = { _id: 'p_v', playerName: 'Veterano', nivel_exp: 1200, petLevel: 34, petName: 'Old' };
  DB.scores.push({ _id: 'sv', seasonNumber: 3, playerName: 'Veterano', wins: 80, battles: 160, points: 0 });
  const nivelPersonaje = S.nivelPorExperiencia(1200);
  ok(S.nivelMascotaEfectivo(DB.players.Veterano) === nivelPersonaje,
     'sin sembrar, el perro tiene el nivel que se veía (el del personaje), no el 34 guardado', [S.nivelMascotaEfectivo(DB.players.Veterano), nivelPersonaje]);
  const vet = socketFalso('Veterano', '0xvet'.padEnd(42, '0'));
  vet.mandar('brawl:bot');
  await avanzarAsync(100);
  const pv = piloto(vet);
  hooks.cadaPaso = () => pv.paso();
  await avanzarAsync(200000);
  hooks.cadaPaso = null;
  ok(DB.players.Veterano.petBattles === 161, 'los contadores se siguen llevando (estadística)', DB.players.Veterano.petBattles);
  ok(DB.players.Veterano.petLevel === S.nivelMascotaPorExp(DB.players.Veterano.petExp) && DB.players.Veterano.petLevel === nivelPersonaje,
     'el 34 guardado NO se cuela: se siembra en el que se veía', [DB.players.Veterano.petLevel, DB.players.Veterano.petExp]);
  ok(S.nivelMascotaEfectivo({ nivel_exp: 1e9, petLevel: 2 }) === 150, 'sin sembrar y con mucha exp, el tope es 150');
  ok(S.nivelMascotaEfectivo({ nivel_exp: 1e9, petExp: 0 }) === 1, 'sembrada, manda SU experiencia, no la del personaje');
  ok(S.expDeArena({ modo: 'practica' }, { puesto: 1 }) === 0, 'la práctica no da exp');
  ok(S.expDeArena({ modo: 'pvp', esBot: false }, { puesto: 1 }) === 100 &&
     S.expDeArena({ modo: 'pvp', esBot: false }, { puesto: 7 }) === 25, 'PvP: 100 el primero, 25 del cuarto en adelante');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 2b. LA MASCOTA SUBE PELEANDO ("siempre me sale nivel 5 y nunca subo") ===');
  ok(S.nivelMascotaPorExp(S.expMascotaParaNivel(5)) === 5, 'la curva es coherente: la exp del nivel 5 da nivel 5');
  let curvaSube = true;
  for (let n = 1; n < 150; n++) if (S.expMascotaParaNivel(n + 1) <= S.expMascotaParaNivel(n)) curvaSube = false;
  ok(curvaSube, 'la curva sube siempre, del 1 al 150');
  ok(S.expMascotaDeArena({ modo: 'practica' }, { puesto: 1 }) === 0, 'la práctica no da experiencia a la mascota');
  ok(S.expMascotaDeArena({ modo: 'bot', esBot: true }, { puesto: 1 }) === 100 &&
     S.expMascotaDeArena({ modo: 'bot', esBot: true }, { puesto: 2 }) === 25, 'diaria: 100 si gana, 25 si no');
  ok(S.expMascotaDeArena({ modo: 'pvp', esBot: false }, { puesto: 1 }) === 180 &&
     S.expMascotaDeArena({ modo: 'pvp', esBot: false }, { puesto: 9 }) === 45, 'PvP: 180 el primero, 45 del cuarto en adelante');
  const del5al6 = S.expMascotaParaNivel(6) - S.expMascotaParaNivel(5);
  ok(Math.ceil(del5al6 / 100) <= 6, 'del 5 al 6: como mucho 6 victorias diarias', [del5al6, Math.ceil(del5al6 / 100)]);
  // Mascota y personaje en 5: diarias hasta que la mascota pasa a 6, y en el
  // camino nada baja.
  const rey = jugador('Rey', 3000);
  DB.stats.Rey = { playerName: 'Rey', exp: 3000 };
  let partidas = 0, minimo = 99, ultimo = null;
  while (partidas < 30) {
    rey.mandar('brawl:bot');
    await avanzarAsync(100);
    const pr = piloto(rey);
    hooks.cadaPaso = () => pr.paso();
    await avanzarAsync(200000);
    hooks.cadaPaso = null;
    partidas++;
    ultimo = rey.ultimo('brawl:fin');
    if (DB.players.Rey.petExp != null) minimo = Math.min(minimo, DB.players.Rey.petLevel);
    if (DB.players.Rey.petLevel >= 6) break;
    DB.daily = {};               // la diaria tiene tope de 5 al día: otro día
  }
  ok(DB.players.Rey.petLevel >= 6, 'la mascota pasa del 5 al 6 jugando', [partidas, DB.players.Rey.petLevel, DB.players.Rey.petExp]);
  ok(minimo >= 5, 'y nunca baja de 5 por el camino', minimo);
  ok(ultimo && ultimo.petLevel === DB.players.Rey.petLevel, 'el final de la partida enseña el nivel nuevo', ultimo && ultimo.petLevel);

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 3. COLA, SALA DE ESPERA Y PARTIDA DE TRES ===');
  const a = jugador('Alba', 2000), b = jugador('Bruno', 2000), c = jugador('Carla', 2500);
  a.mandar('brawl:cola'); await avanzarAsync(50);
  ok(!!a.ultimo('brawl:enCola'), 'Alba entra en la cola');
  ok(!S.brawlSalaActual(), 'sola no hay sala');
  b.mandar('brawl:cola'); await avanzarAsync(50);
  ok(!!S.brawlSalaActual() && S.brawlSalaActual().regs.length === 2, 'con dos, se abre la sala');
  ok(!!a.ultimo('brawl:sala') && a.ultimo('brawl:sala').jugadores === 2, 'a los dos se les avisa');
  c.mandar('brawl:cola'); await avanzarAsync(50);
  ok(S.brawlSalaActual() && S.brawlSalaActual().regs.length === 3, 'un tercero entra en la sala');
  await avanzarAsync(8200);
  const iniA = a.ultimo('brawl:inicio'), iniC = c.ultimo('brawl:inicio');
  ok(iniA && iniA.modo === 'pvp' && iniA.luchadores.length === 3, 'empieza con los tres', iniA && iniA.luchadores.length);
  ok(iniA && iniC && iniA.matchId === iniC.matchId && iniA.arena.id === iniC.arena.id, 'misma partida y misma arena para todos');
  ok(iniA && iniC && iniA.yo !== iniC.yo, 'cada uno sabe cuál es él');
  // Teletransporte: Alba manda una posición a 300 px.
  await avanzarAsync(3200);
  const yoA = iniA.luchadores.find((l) => l.id === iniA.yo);
  a.mandar('brawl:mover', { s: 1, x: yoA.x + 300, y: yoA.y, c: 0 });
  await avanzarAsync(100);
  const snapA = a.ultimo('brawl:snap');
  const yoSnap = snapA && snapA.f.find((f) => f[0] === iniA.yo);
  ok(yoSnap && Math.abs(yoSnap[1] - yoA.x) < 60, 'el teletransporte se recorta a lo que da tiempo a andar', yoSnap && yoSnap[1] - yoA.x);
  ok(snapA && snapA.y && snapA.y.c >= 1 && snapA.y.x != null, 'y se le manda la posición buena para que se recoloque', snapA && snapA.y);
  // Bruno se va a mitad.
  b.mandar('brawl:salir'); await avanzarAsync(100);
  ok(!S.socketMatch.has(b.id) && !S.battleAdmissions.has(String(b.authenticatedAddress).toLowerCase()), 'quien se va queda libre al momento');
  ok(a.ultimo('brawl:ko') && a.ultimo('brawl:ko').t === a.ultimo('brawl:inicio').luchadores.find((l) => l.playerName === 'Bruno').id, 'y para los demás cuenta como caído');
  // Carla se rinde: cae, pero se queda mirando.
  c.mandar('brawl:rendirse'); await avanzarAsync(200);
  const finA = a.ultimo('brawl:fin'), finC = c.ultimo('brawl:fin'), finB = b.ultimo('brawl:fin');
  ok(finA && finA.resultado === 'win' && finA.puesto === 1, 'Alba, la última en pie, gana', finA && [finA.resultado, finA.puesto]);
  ok(finA && finA.puntos === 3, 'PvP: 3 puntos al ganador', finA && finA.puntos);
  ok(finC && finC.puesto === 2 && finC.puntos === 1, 'quien se rinde se queda y recibe su final (2.º, 1 punto)', finC && [finC.puesto, finC.puntos]);
  ok(!finB, 'quien se fue ya no recibe nada de esta partida');
  ok(S.battleMatches.size === 0 && S.socketMatch.size === 0 && S.battleAdmissions.size === 0, 'todo suelto al acabar');
  ok(DB.scores.find((s) => s.playerName === 'Bruno' && s.seasonNumber === 7) &&
     DB.scores.find((s) => s.playerName === 'Bruno' && s.seasonNumber === 7).losses === 1, 'a quien se fue se le apunta la derrota');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 4. LA SALA SE DESHACE SI SE VAN ===');
  const d1 = jugador('Dani', 2000), d2 = jugador('Eva', 2000);
  d1.mandar('brawl:cola'); d2.mandar('brawl:cola'); await avanzarAsync(100);
  ok(!!S.brawlSalaActual(), 'sala de dos');
  d2.desconectar(); await avanzarAsync(100);
  ok(!S.brawlSalaActual() && S.battleQueue.length === 1, 'si uno se desconecta, el otro vuelve a la cola', S.battleQueue.length);
  await avanzarAsync(9000);
  ok(!d1.ultimo('brawl:inicio'), 'y no empieza ninguna partida de uno');
  d1.mandar('brawl:practica'); await avanzarAsync(100);
  const iniP = d1.ultimo('brawl:inicio');
  ok(iniP && iniP.modo === 'practica' && iniP.luchadores.length === 4, 'desde la cola se puede pasar a practicar (tú + 3 bots)', iniP && iniP.luchadores.length);
  ok(S.battleQueue.length === 0, 'y sale de la cola');
  const scoresAntes = DB.scores.length + DB.scores.reduce((t, s) => t + s.battles, 0);
  d1.mandar('brawl:salir'); await avanzarAsync(300);
  ok(DB.scores.length + DB.scores.reduce((t, s) => t + s.battles, 0) === scoresAntes, 'la práctica no da puntos ni cuenta batallas');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 5. CANDADOS Y PAQUETES RAROS ===');
  const f = jugador('Fede', 2000);
  f.mandar('brawl:bot'); f.mandar('brawl:bot'); await avanzarAsync(100);
  ok(f.cuantos('brawl:inicio') === 1 && !f.ultimo('brawl:error'),
    'un doble clic pendiente no abre dos batallas ni cancela la primera');
  f.mandar('brawl:bot'); await avanzarAsync(50);
  ok(f.cuantos('brawl:inicio') === 2 && S.battleMatches.size === 1,
    'si se pierde el inicio, repetir la solicitud devuelve la misma partida');
  ok(f.ultimo('brawl:inicio').reanudar === true,
    'también se puede resincronizar durante la cuenta atrás');
  f.mandar('brawl:mover', null); f.mandar('brawl:mover', { s: 'x', x: NaN }); f.mandar('brawl:disparo', { a: 'hola' });
  f.mandar('brawl:disparo', null); f.mandar('brawl:mover', { s: 1e99, x: 1e99, y: -1e99 });
  await avanzarAsync(3500);
  ok(errores.length === 0, 'paquetes basura no rompen nada', errores);
  const sn = f.ultimo('brawl:snap');
  const yoF = sn && sn.f.find((x) => x[0] === f.ultimo('brawl:inicio').yo);
  ok(yoF && yoF[1] > 0 && yoF[1] < 30 * 32 && yoF[2] > 0 && yoF[2] < 22 * 32, 'y el perro sigue dentro de la arena', yoF);
  f.desconectar(); await avanzarAsync(300);
  ok(S.battleMatches.size === 1, 'un corte de red NO cierra la partida al instante (se le espera)');
  await avanzarAsync(21000);
  ok(S.battleMatches.size === 0 && S.battleAdmissions.size === 0, 'si no vuelve en 20 s, se cierra su diaria y se suelta todo');
  ok(DB.daily['Fede|2026-10-02'] && DB.daily['Fede|2026-10-02'].done === 1, 'y la diaria abandonada cuenta como jugada');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 5b. SE CORTA LA RED Y VUELVE ===');
  const hugo = jugador('Hugo', 2000);
  hugo.mandar('brawl:practica'); await avanzarAsync(4000);
  const iniH = hugo.ultimo('brawl:inicio');
  const mH = [...S.battleMatches.values()][0];
  const lH = mH && mH.P.porId[iniH.yo];
  ok(!!iniH && !!lH, 'Hugo empieza una práctica');
  hugo.desconectar(); await avanzarAsync(1500);
  ok(lH.vivo && lH.sinConexion > 0 && !S.socketMatch.has(hugo.id), 'se le corta la red: su perro sigue, con el piloto automático');
  // Otra cuenta no puede quedarse con su perro diciendo el id de la partida.
  const ladron = jugador('Ladron', 2000);
  ladron.mandar('brawl:volver', { matchId: mH.id }); await avanzarAsync(50);
  ok(ladron.ultimo('brawl:volverError') && !S.socketMatch.has(ladron.id), 'otra cuenta que pide volver a esa partida no entra');
  // Vuelve con un socket NUEVO de la misma cuenta.
  const hugo2 = socketFalso('Hugo', hugo.authenticatedAddress);
  hugo2.mandar('brawl:volver', { matchId: mH.id }); await avanzarAsync(100);
  const ini2 = hugo2.ultimo('brawl:inicio');
  ok(ini2 && ini2.reanudar === true && ini2.matchId === mH.id && ini2.yo === iniH.yo, 'vuelve: recibe SU partida tal y como va (reanudar)', ini2 && [ini2.reanudar, ini2.yo]);
  ok(S.socketMatch.get(hugo2.id) === mH.id && !lH.sinConexion, 'y el servidor le reconoce en el socket nuevo');
  const snapsAntes = hugo2.cuantos('brawl:snap');
  await avanzarAsync(500);
  ok(hugo2.cuantos('brawl:snap') > snapsAntes, 'le vuelven a llegar las instantáneas');
  hugo2.mandar('brawl:volver', { matchId: mH.id }); await avanzarAsync(50);
  ok(hugo2.cuantos('brawl:inicio') === 2 && !hugo2.ultimo('brawl:volverError'),
    'un socket conectado puede recuperar instantáneas sin ser expulsado');
  hugo2.mandar('brawl:volver', { matchId: 'otra-partida' }); await avanzarAsync(50);
  ok(hugo2.ultimo('brawl:volverError') && S.socketMatch.get(hugo2.id) === mH.id,
    'resincronizar otro id no altera la partida auténtica');
  const ph = piloto(hugo2);
  hooks.cadaPaso = () => ph.paso();
  await avanzarAsync(200000);
  hooks.cadaPaso = null;
  ok(!!hugo2.ultimo('brawl:fin'), 'y la partida acaba con normalidad en el socket nuevo');
  ok(S.battleMatches.size === 0 && S.socketMatch.size === 0 && S.battleAdmissions.size === 0, 'todo suelto al acabar');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=== 6. LA PURGA ===');
  const g = jugador('Gus', 2000);
  g.mandar('brawl:bot'); await avanzarAsync(100);
  const m = [...S.battleMatches.values()][0];
  m.creada -= 60 * 60 * 1000;          // una partida colgada desde hace una hora
  S.purgarMapasEnMemoria();
  ok(S.battleMatches.size === 0 && !S.socketMatch.has(g.id) && S.battleAdmissions.size === 0, 'una partida colgada se tira y suelta a su jugador');

  console.log('\n' + pasadas + ' bien, ' + fallos + ' mal' + (errores.length ? ' · errores: ' + errores.length : ''));
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
