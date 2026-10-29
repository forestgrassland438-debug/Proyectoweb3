'use strict';
/* (2026-10-26) LO QUE EL JUGADOR VIO EN SU PARTIDA:
 *   · "la vida baja sola y se sube sola" y "llego a 0 % y no muero";
 *   · "no puedo cambiar plata por bronce";
 *   · "me regalaron 1000 monedas de la nada" (el bronce);
 *   · el VIP contaba los días con el reloj del PC.
 * Se ejecuta el código REAL (server2.js y los módulos del cliente) con piezas
 * de mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('applyStats pinta lo del servidor SIN devolvérselo (y respeta lo pendiente más nuevo)', () => {
  const fuente = trozo(leer('gf-character-skills.js'), '  function applyStats(scene, stats) {', '\n  }\n');
  const enviados = [];
  const scene = {
    _statsReady: true, vidaPorcentaje: 40, aguaPorcentaje: 50, comidaPorcentaje: 60,
    statsSync: { _pending: { comida: 70 }, set(k, v) { enviados.push([k, v]); } },
    // Como GameScene.actualizarBarraVida: con _statsReady, MANDA el valor.
    actualizarBarraVida(v) { this.vidaPorcentaje = v; if (this._statsReady) this.statsSync.set('vida', v); },
    actualizarBarraAgua(v) { this.aguaPorcentaje = v; if (this._statsReady) this.statsSync.set('agua', v); },
    actualizarBarraComida(v) { this.comidaPorcentaje = v; if (this._statsReady) this.statsSync.set('comida', v); }
  };
  const ctx = vm.createContext({ window: {}, Number, Math });
  vm.runInContext(fuente + '\nthis.applyStats = applyStats;', ctx);
  ctx.applyStats(scene, { vida: 0, agua: 55, comida: 20 });
  assert.equal(scene.vidaPorcentaje, 0, 'se pinta');
  assert.equal(scene.aguaPorcentaje, 55);
  assert.equal(scene.comidaPorcentaje, 60, 'comer que aún no salió es más nuevo que la lectura: se queda');
  assert.equal(JSON.stringify(enviados), '[]', 'nada vuelve al servidor (antes: vida y agua, 1,5 s después)');
  assert.equal(scene._statsReady, true, 'y se deja como estaba');
  assert.equal(ctx.window.playerStats.vida, 0);
});

test('el servidor declara la muerte cuando ÉL deja la vida a 0 (golpe, mordisco, veneno)', { skip: !HAY }, async () => {
  const fuente = trozo(SRV, 'async function gfMorirSiVidaCero(playerName, stats) {', '\n}\n');
  const gp = { playerName: 'Ana', address: '0xa', isGhost: false, deathCount: 0, guardado: 0, async save() { this.guardado++; } };
  const olvidados = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {} }, Math, Number, Date,
    clampStat: (s, v) => Math.max(0, Number(v) || 0), GamePlayer: { findOne: async () => gp },
    normalizarVentanaMuertes() {}, olvidarFantasma: (n) => olvidados.push(n), precioRevivir: () => 30,
    estadoVivo: (g) => ({ ok: true, player: { ghost: !!g.isGhost, deaths: g.deathCount } })
  });
  vm.runInContext(fuente + '\nthis.f = gfMorirSiVidaCero;', ctx);
  const vivo = { vida: 3, async save() {} };
  assert.equal(await ctx.f('Ana', vivo), null, 'con vida no hace nada');
  assert.equal(gp.isGhost, false);
  const stats = { vida: 0, vidaCongelada: false, async save() { this.guardada = true; } };
  const r = await ctx.f('Ana', stats);
  assert.equal(r.player.ghost, true);
  assert.equal(gp.isGhost, true);
  assert.equal(gp.deathCount, 1);
  assert.equal(stats.vidaCongelada, true, 'un muerto no se cura solo');
  assert.equal(JSON.stringify(olvidados), '["Ana"]');
  const otra = await ctx.f('Ana', stats);
  assert.equal(gp.deathCount, 1, 'ya fantasma: no se cuenta otra muerte');
  assert.equal(otra.player.ghost, true);
  // Y se llama donde el servidor quita vida.
  const consumo = trozo(SRV, "app.post('/api/stats/:playerName/consume'", '\n});\n');
  assert.match(consumo, /if \(esDano\) \{\s*try \{ muerte = await gfMorirSiVidaCero\(playerName, doc\); \}/);
  assert.match(consumo, /player: muerte \? muerte\.player : undefined/);
  assert.match(trozo(SRV, 'async function _ticDeVeneno(playerName) {', '\n}\n'), /gfMorirSiVidaCero\(playerName, doc\)/);
});

test('el cliente: si el servidor dice "sigue vivo", la barra coge la vida de verdad', () => {
  const m = leer('gf-mascota.js');
  assert.match(m, /r\.status === 409 && r\.datos && r\.datos\.error === 'sigue_vivo' && typeof r\.datos\.vida === 'number'/);
});

test('cambios de moneda: atómicos en Mongo, sin esperar a la cadena y con su comisión al tesoro circular', { skip: !HAY }, async () => {
  const ruta = trozo(SRV, "app.post('/api/currency/exchange'", '\n});\n');
  const respuesta = trozo(SRV, 'function buildStatsResponse(doc) {', '\n}\n');
  // (2026-10-26) La comisión: 1 % oro→plata, 2 % desde la plata, 3 % desde el bronce.
  const comision = trozo(SRV, 'const CAMBIO_COMISION_BPS = ', ';\n') + '\n' + trozo(SRV, 'function gfComisionCambio(direction, qty) {', '\n}\n');
  let handler = null;
  const doc = { _id: 1, playerName: 'Ana', plata: 10, bronce: 500, oro: 1, chainPending: [], chainPendingSince: null };
  const marcas = [], tesoro = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Math, Number, Date, Object, JSON,
    app: { post(p, ...mw) { handler = mw[mw.length - 1]; } }, apiLimiter() {}, authMiddleware() {}, csrfProtection() {},
    SILVER_PER_GOLD: 1000, BRONZE_PER_SILVER: 1000, CHAIN_SETTLE_DELAY_MS: 60000,
    TESORO_BRONCE_POR: { bronce: 1, plata: 1000, oro: 1000000 },
    tesoroCircularIngresar: async (origen, bronce) => { tesoro.push([origen, bronce]); }, economiaApuntar() {},
    clampStat: (s, v) => Math.max(0, Number(v) || 0),
    GamePlayer: { findOne: () => ({ lean: async () => ({ playerName: 'Ana' }) }) },
    PlayerStats: {
      async findOneAndUpdate(f, u) {
        for (const [k, c] of Object.entries(f)) if (c && c.$gte !== undefined && !(doc[k] >= c.$gte)) return null;
        for (const [k, v] of Object.entries(u.$inc)) doc[k] += v;
        for (const k of u.$addToSet.chainPending.$each) if (!doc.chainPending.includes(k)) doc.chainPending.push(k);
        return { ...doc, chainPending: doc.chainPending.slice() };
      },
      async updateOne(f, u) { marcas.push(u.$set); },
      async findOne() { return doc; }
    },
    getStatsContract() { throw new Error('el cambio no debe esperar a la cadena'); },
    getSafeGasPriceStats() { throw new Error('el cambio no debe esperar a la cadena'); },
    applyStatOnChain() { throw new Error('el cambio no debe esperar a la cadena'); }
  });
  vm.runInContext(respuesta + '\n' + comision + '\n' + ruta, ctx);
  const llamar = async (body) => {
    let out = null;
    await handler({ user: { address: '0xa' }, body }, { status(c) { this.c = c; return this; }, json(b) { out = { c: this.c || 200, b }; return this; } });
    return out;
  };
  let r = await llamar({ direction: 'silverToBronze', amount: 3 });
  assert.equal(r.c, 200, JSON.stringify(r.b));
  assert.equal(r.b.ok, true);
  // 3 de plata = 3.000 de bronce, menos el 2 % (60) que va al tesoro circular.
  assert.equal(doc.plata, 7); assert.equal(doc.bronce, 3440);
  assert.equal(r.b.stats.bronce, 3440); assert.equal(r.b.fee.cantidad, 60); assert.equal(r.b.fee.bps, 200);
  assert.equal(JSON.stringify(doc.chainPending.sort()), '["bronce","plata"]', 'las facturas las pone al día el liquidador');
  assert.ok(marcas.some(s => s.chainPendingSince), 'y empieza a contar la deuda');
  // 3 de plata cuestan 3.000 de bronce más el 3 % (90).
  r = await llamar({ direction: 'bronzeToSilver', amount: 3 });
  assert.equal(doc.plata, 10); assert.equal(doc.bronce, 350);
  r = await llamar({ direction: 'silverToBronze', amount: 99 });
  assert.equal(r.c, 400); assert.equal(r.b.error, 'insufficient_silver');
  assert.equal(doc.plata, 10, 'sin bastante, nada se mueve');
  // Oro ⇄ plata: también en Mongo y con su comisión (1 % al dar oro, 2 % al pedirlo con plata).
  r = await llamar({ direction: 'goldToSilver', amount: 1 });
  assert.equal(r.c, 200, JSON.stringify(r.b));
  assert.equal(doc.oro, 0); assert.equal(doc.plata, 1000);
  r = await llamar({ direction: 'silverToGold', amount: 1 });
  assert.equal(r.c, 400, 'con 1.000 de plata no llega: 1 de oro cuesta 1.020'); assert.equal(r.b.error, 'insufficient_silver');
  doc.plata = 1020;
  r = await llamar({ direction: 'silverToGold', amount: 1 });
  assert.equal(doc.oro, 1); assert.equal(doc.plata, 0);
  assert.equal(JSON.stringify(tesoro), JSON.stringify([['cambio', 60], ['cambio', 90], ['cambio', 10000], ['cambio', 20000]]), 'todo, en bronce, al tesoro circular');
});

test('el bronce: una cuenta que ya tenía monedas no recibe los 1000 de bienvenida', { skip: !HAY }, () => {
  const sync = trozo(SRV, "app.post('/api/stats/:playerName/sync'", '\n});\n');
  assert.match(sync, /const cuentaConMonedas = !!\(chainMap\.oro \|\| chainMap\.plata\);/);
  assert.match(sync, /if \(stat === 'bronce' && cuentaConMonedas\) \{\s*valorEnMongo = Math\.max\(0, Math\.round\(clampStat\('bronce', Number\(statsDoc\.bronce \|\| 0\)\)\)\);\s*createVal = Math\.max\(STAT_CHAIN_FLOOR, valorEnMongo\);/);
  assert.match(sync, /statsDoc\[stat\]\s+= clampStat\(stat, valorEnMongo !== null \? valorEnMongo : createVal\);/);
  // Las cuentas nuevas siguen con su bienvenida.
  assert.match(SRV, /const STAT_INITIAL_MAP\s+= \{[^}]*bronce: 0/);
});

test('el VIP cuenta con la hora del servidor', { skip: !HAY }, () => {
  assert.match(SRV, /return res\.json\(\{ ok: true, \.\.\.estado, planes: VIP_PLANES, ahora: Date\.now\(\) \}\);/);
  assert.match(SRV, /stats: buildStatsResponse\(cobrado\), planes: VIP_PLANES, ahora: Date\.now\(\) \}\);/);
  const v = leer('gf-vip.js');
  assert.match(v, /function ahora\(\) \{ return Date\.now\(\) \+ desfase; \}/);
  assert.match(v, /if \(Number\.isFinite\(srv\) && srv > 0\) desfase = srv - Date\.now\(\);/);
  assert.doesNotMatch(v.replace(/desfase = [^;]+;/g, '').replace(/var ya = Date\.now\(\);/, ''), /\(estado\.fin - Date\.now\(\)\)|> Date\.now\(\)/,
    'nada del VIP compara con el reloj del PC');
});
