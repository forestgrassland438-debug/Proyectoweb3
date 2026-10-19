'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../gf-brawl-motor.js');
function arena() {
  let now = 100000, seed = 7;
  const events = [];
  const P = M.crearPartida({ arena: { ancho: 30, alto: 26, celda: 32,
    filas: Array(26).fill('.'.repeat(30)), apariciones: [[3, 3], [20, 20]] },
    ahora: () => now, azar: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
    enviar: (who, event, data) => events.push({ who: who.id, event, data }),
    luchadores: [{ humano: true, especie: 'perro', maxHp: 100, ataque: 1 },
      { humano: true, especie: 'perro', maxHp: 100, ataque: 1 }] });
  const tick = (ms = 50) => { for (let t = 0; t < ms; t += 50) { now += 50; M.paso(P); } };
  tick(3000);
  return { P, human: P.porId[1], enemy: P.porId[2], tick, events };
}
function pickup(f, tipo) {
  const h = f.human;
  f.P.objetos.push({ id: f.P.sigObjeto++, tipo, x: h.x, y: h.y }); f.tick();
}
test('los cuatro poderes modifican el combate y expiran con el reloj del servidor', () => {
  const f = arena(), h = f.human;
  h.municion = 0; pickup(f, 'municion'); assert.ok(h.municion >= 1.5);
  pickup(f, 'super'); assert.equal(h.superCarga, 0.35);
  pickup(f, 'rapidez'); assert.equal(h.vel, h.velBase * 1.2);
  pickup(f, 'escudo'); assert.equal(h.escudo, Math.round(h.maxHp * 0.25));
  f.tick(8050); assert.equal(h.vel, h.velBase); assert.equal(h.escudo, 0);
  const snap = f.events.filter(e => e.event === 'brawl:snap' && e.who === h.id).at(-1);
  assert.equal(snap.data.y.v, h.velBase); assert.equal(snap.data.y.r, 0);
});
test('el escudo absorbe daño real de proyectiles antes de reducir la vida', () => {
  const f = arena(); f.enemy.x = f.human.x + 80; f.enemy.y = f.human.y;
  pickup(f, 'escudo'); const hp = f.human.hp, shield = f.human.escudo;
  M.disparar(f.P, f.enemy.id, { a: Math.PI, sup: 0, s: 1 }); f.tick(400);
  assert.equal(f.human.hp, hp); assert.ok(f.human.escudo < shield);
});
test('la niebla respeta el porcentaje por segundo incluso para mascotas de poca vida', () => {
  const f = arena(); f.tick(75000);
  const h = f.human; h.x = h.r; h.y = h.r; h.maxHp = h.hp = 100;
  h.fraccionNiebla = 0; f.tick(1000);
  assert.equal(h.hp, 96);
  assert.equal(M.REGLAS.ZONA_INICIO_MS, 45000);
  assert.equal(M.REGLAS.ZONA_FIN_MS, 195000);
});
test('las cinco arenas añaden suministros sin cajas sobre las apariciones', () => {
  for (const id of Object.keys(M.ARENAS)) {
    const initial = M.crearRejilla(M.ARENAS[id]);
    const P = M.crearPartida({ arena: id, azar: () => 0.45, luchadores: Array.from({ length: 6 }, () => ({ humano: true })) });
    assert.ok(Object.keys(P.R.cajas).length > Object.keys(initial.cajas).length, id);
    for (const l of P.luchadores) assert.equal(M.bloqueaPaso(M.celdaDePunto(P.R, l.x, l.y)), false);
  }
});
test('un bot puede romper una caja y no se atasca buscando un recurso que no necesita', () => {
  const f = arena(), bot = f.enemy;
  bot.humano = false; bot.bot = true;
  // Crear una IA real con el mismo motor y transferirla al rival de la fixture.
  const sample = M.crearPartida({ arena: 'pradera', luchadores: [{ humano: false, astucia: 0.75 }] });
  bot.ia = sample.luchadores[0].ia;
  bot.x = 112; bot.y = 112;
  f.human.x = 700; f.human.y = 650; f.human.enArbusto = true;
  f.P.R.celdas[Math.floor(650 / 32) * 30 + Math.floor(700 / 32)] = '*';
  const i = 3 * 30 + 5; f.P.R.celdas[i] = 'c'; f.P.R.cajas[i] = { vida: 2, max: 2, oro: false };
  f.tick(6000);
  assert.equal(f.P.R.cajas[i], undefined);
  assert.ok(f.events.some(e => e.event === 'brawl:objeto' && e.data.tipo !== 'hueso'));
});
