'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../gf-brawl-motor.js');
function match() {
  let now = 1000000, seed = 77;
  const P = M.crearPartida({ arena: { ancho: 30, alto: 26, celda: 32,
    filas: Array(26).fill('.'.repeat(30)), apariciones: [[3, 3], [20, 20], [3, 20], [20, 3]] },
    ahora: () => now, azar: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
    luchadores: [{ humano: true, especie: 'perro', maxHp: 9999, ataque: 1 },
      { humano: false, especie: 'perro', maxHp: 9999, ataque: 1, astucia: 0.6 }] });
  const human = P.porId[1], bot = P.porId[2];
  human.x = 600; human.y = 380; bot.x = 280; bot.y = 380;
  now = P.tCombate;
  return { P, human, bot, tick: (ms = 50) => { now += ms; M.paso(P); } };
}
test('el bot elige un flanco con duración y un destino distinto del rival', () => {
  const J = match(); J.tick();
  assert.equal(J.bot.ia.modo, 'flanquear');
  const plan = J.bot.ia.plan;
  assert.ok(plan.hasta > J.P.tUltimo);
  assert.ok(Math.hypot(plan.x - J.human.x, plan.y - J.human.y) > 60);
  assert.ok(Math.abs(plan.y - J.human.y) > 15);
  J.tick(); assert.equal(J.bot.ia.plan, plan);
});
test('incluso el agresivo se retira sin disparar para cargar munición', () => {
  const J = match(); J.bot.x = 460; J.bot.municion = 0;
  J.bot.ia.estilo = 'agresivo'; J.tick();
  assert.equal(J.bot.ia.modo, 'recargar');
  assert.equal(J.bot.ia.contenerFuego, true);
  const plan = J.bot.ia.plan; J.tick(200);
  assert.equal(J.bot.ia.plan, plan);
  assert.equal(J.P.balas.filter(b => b.duenio === J.bot.id).length, 0);
});
test('perder un rival escondido conserva su última posición vista', () => {
  const J = match(); J.tick(); const recuerdo = { ...J.bot.ia.recuerdo };
  J.human.x = 790; J.human.y = 640;
  const i = Math.floor(J.human.x / 32) + Math.floor(J.human.y / 32) * J.P.R.ancho;
  J.P.R.celdas[i] = '*'; J.human.enArbusto = true; J.human.reveladoHasta = 0;
  J.tick(250);
  assert.deepEqual(J.bot.ia.recuerdo, recuerdo);
  assert.ok(J.bot.ia.dirX * (recuerdo.x - J.bot.x) + J.bot.ia.dirY * (recuerdo.y - J.bot.y) > 0);
});
test('con poca vida guarda el plan de recuperación sin reiniciar su plazo', () => {
  const J = match(); J.bot.x = 455; J.bot.hp = J.bot.maxHp * 0.1;
  J.bot.regenDesde = J.P.tCombate + 5000; J.tick();
  assert.equal(J.bot.ia.modo, 'recuperar');
  const plan = J.bot.ia.plan; assert.ok(plan); J.tick(250);
  assert.equal(J.bot.ia.plan, plan); assert.equal(J.bot.ia.contenerFuego, true);
});
test('la cámara respeta movimiento reducido y limita los impactos consecutivos', () => {
  let now = 1000; const calls = [];
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Scenes/BattleScene.js'), 'utf8'),
    { window, Phaser: { Scene: class {} }, document: { hidden: false }, performance: { now: () => now }, console });
  const b = new window.BattleScene();
  Object.assign(b, { cameras: { main: { shake: (...args) => calls.push(args) } },
    _camaraGolpeEn: -Infinity, _camaraRetroceso: { x: 0, y: 0 } });
  b._impulsoCamara('super', 0); assert.equal(calls.length, 1); assert.equal(b._camaraRetroceso.x, -7);
  b._impulsoCamara('explosion', 0, 10); assert.equal(calls.length, 1);
  now += 200; b._impulsoCamara('explosion', 0, 10); assert.equal(calls[1][1], 0.0025);
  b._reducedMotion = true; now += 200; b._impulsoCamara('dano', 0); assert.equal(calls.length, 2);
});
