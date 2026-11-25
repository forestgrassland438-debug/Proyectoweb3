'use strict';
/* (2026-11-02) "En el mapa y en amigos solo cobra bronce: si no tengo bronce no aplica la conversión
 * con plata u oro." Se prueba el código real de server2.js, sacado por anclas: gfCobrarConCambio,
 * gfValorEnBronce y eco2PlanPago, contra un PlayerStats de mentira que comprueba y escribe junto. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const RUTA = 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(RUTA);
const SRV = HAY ? fs.readFileSync(RUTA, 'utf8').split('\r\n').join('\n') : '';

function trozo(inicio, fin) {
  const i = SRV.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio);
  const j = SRV.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return SRV.slice(i, j + fin.length);
}

function montar(inicial) {
  const fila = { _id: 1, ...inicial };
  let conflictos = 0;
  const PlayerStats = {
    findOne: () => ({ select: () => ({ lean: async () => ({ ...fila }) }) }),
    findOneAndUpdate: async (filtro, cambio) => {
      if (conflictos > 0) { conflictos--; return null; }
      if (['oro', 'plata', 'bronce'].some((k) => filtro[k] !== fila[k])) return null;
      Object.assign(fila, cambio.$set);
      fila.chainPending = cambio.$addToSet.chainPending.$each;
      return { ...fila };
    }
  };
  const ctx = vm.createContext({ Math, Number, Date, PlayerStats });
  vm.runInContext(trozo('function eco2PlanPago(cuanto, s) {', '\n}\n') +
    trozo('function gfValorEnBronce(st) {', '\n}\n') +
    trozo('async function gfCobrarConCambio(playerName, cuanto) {', '\n}\n') +
    '\nthis.cobrar = gfCobrarConCambio; this.valor = gfValorEnBronce;', ctx);
  return { ctx, fila, conflicto(n) { conflictos = n; } };
}

test('con bronce de sobra no se toca ni la plata ni el oro', { skip: !HAY }, async () => {
  const m = montar({ oro: 1, plata: 2, bronce: 5000 });
  const doc = await m.ctx.cobrar('Ana', 1500);
  assert.equal(doc.bronce, 3500);
  assert.equal(doc.plata, 2);
  assert.equal(doc.oro, 1);
});

test('sin bronce se cambia lo justo de plata y la vuelta queda en bronce', { skip: !HAY }, async () => {
  const m = montar({ oro: 0, plata: 3, bronce: 200 });
  const doc = await m.ctx.cobrar('Ana', 1500);
  // 200 de bronce + 2 de plata (2000) = 2200; vuelta 700.
  assert.equal(doc.plata, 1);
  assert.equal(doc.bronce, 700);
  assert.equal(m.ctx.valor(doc), 3200 - 1500, 'el valor total baja exactamente el precio');
  assert.deepEqual([...m.fila.chainPending], ['oro', 'plata', 'bronce'], 'las tres facturas se ponen al día');
});

test('sin bronce ni plata se rompe oro y el cambio vuelve en plata y bronce', { skip: !HAY }, async () => {
  const m = montar({ oro: 1, plata: 0, bronce: 0 });
  const doc = await m.ctx.cobrar('Ana', 2500);
  assert.equal(doc.oro, 0);
  assert.equal(doc.plata, 997);
  assert.equal(doc.bronce, 500);
  assert.equal(m.ctx.valor(doc), 1000000 - 2500);
});

test('si entre todo no llega, no se cobra nada', { skip: !HAY }, async () => {
  const m = montar({ oro: 0, plata: 1, bronce: 100 });
  assert.equal(await m.ctx.cobrar('Ana', 1500), null);
  assert.equal(m.fila.plata, 1);
  assert.equal(m.fila.bronce, 100);
});

test('si el saldo cambia entre leer y escribir, se vuelve a mirar', { skip: !HAY }, async () => {
  const m = montar({ oro: 0, plata: 2, bronce: 0 });
  m.conflicto(2);
  const doc = await m.ctx.cobrar('Ana', 500);
  assert.equal(doc.plata, 1);
  assert.equal(doc.bronce, 500);
});
