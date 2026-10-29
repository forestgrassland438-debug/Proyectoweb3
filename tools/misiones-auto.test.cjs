'use strict';
/* LAS MISIONES AUTOMÁTICAS Y LAS DE CAZAR (2026-10-19): el código REAL de
 * server2.js (el generador, el saneado de las reglas y de las misiones) con
 * los modelos de Mongo de mentira. Se salta si no encuentra el servidor
 * (SERVIDOR=ruta). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const TXT = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';

function tramo(desde, hasta) {
  const i = TXT.indexOf(desde);
  const j = TXT.indexOf(hasta, i + 1);
  assert.ok(i > 0 && j > i, 'no encuentro el tramo "' + desde.slice(0, 40) + '" en ' + SERVIDOR);
  return TXT.slice(i, j);
}

function montar() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    MONSTRUOS_BOTIN: {
      lobo_salvaje: { nombre: 'Shadow Wolf' }, arana_salvaje: { nombre: 'Thorn Spider' },
      golem_salvaje: { nombre: 'Stone Golem' }
    },
    ITEM_TIPO_MAP: { Semillax: 'bolsa zanahorias', pocion_vida: 'pocion_vida', carbon: 'carbon' },
    MISSION_NPCS: ['granjero', 'guardian'],
    MisionCaza: {}, DailyMission: {}, MisionesAutoConfig: {}, app: { get() {}, put() {}, post() {} }
  };
  ctx.itemTipoOnChain = (id) => (Object.prototype.hasOwnProperty.call(ctx.ITEM_TIPO_MAP, id) ? ctx.ITEM_TIPO_MAP[id] : null);
  vm.createContext(ctx);
  const codigo = [
    "const MISSION_LANGS = ['en-US', 'en-PH', 'es-419', 'pt-BR', 'zh-CN', 'ko-KR'];",
    // (2026-10-28) "En misiones no podemos dar ítems, solo monedas de los tres tipos": la regla de verdad.
    tramo('const GF_MISIONES_SOLO_MONEDAS', '\n'),
    // (2026-10-26) Los premios pasan por gfPremioJusto (nunca la roca de carbón).
    tramo('function gfPremioJusto(itemId) {', '/** Suma cuántas unidades'),
    tramo('function sanearMisionesDelDia(missions)', '// Leer las misiones de un NPC en un día'),
    tramo('/** Los monstruos que se pueden pedir', '// Lo que se puede elegir en el panel'),
    'this.sanearMisionesDelDia = sanearMisionesDelDia; this.gfGenerarMisiones = gfGenerarMisiones;',
    'this.gfSanearReglas = gfSanearReglas; this.gfCazasDe = gfCazasDe; this.POR_DEFECTO = MISIONES_AUTO_POR_DEFECTO;'
  ].join('\n');
  vm.runInContext(codigo, ctx);
  return ctx;
}

const REGLAS = {
  activo: true, cuantas: 4, pesoEntregar: 50, pesoCazar: 50,
  pedidos: [{ itemId: 'madera_pinos', nombre: 'Pine Wood', min: 3, max: 6 }, { itemId: 'carbon', nombre: 'Coal', min: 2, max: 2 }],
  presas: [{ tipo: 'lobo_salvaje', nombre: 'Wolves', min: 2, max: 4 }, { tipo: '*', nombre: 'monsters', min: 5, max: 5 }],
  premios: [{ itemId: 'Semillax', nombre: 'Seeds', min: 1, max: 3, peso: 5 }, { itemId: 'no_se_acuna', min: 1, max: 1, peso: 100 }],
  probPremio: 100, expMin: 10, expMax: 20, oroMin: 0, oroMax: 0, plataMin: 5, plataMax: 5, bronceMin: 700, bronceMax: 700, semilla: 0
};

test('el generador es determinista por NPC + día + semilla', { skip: !HAY }, () => {
  const s = montar();
  const a = JSON.stringify(s.gfGenerarMisiones(REGLAS, 'granjero', '2026-10-19'));
  const b = JSON.stringify(s.gfGenerarMisiones(REGLAS, 'granjero', '2026-10-19'));
  const c = JSON.stringify(s.gfGenerarMisiones(Object.assign({}, REGLAS, { semilla: 1 }), 'granjero', '2026-10-19'));
  assert.equal(a, b);
  assert.notEqual(a, c, 'otra semilla (reroll) da otras misiones');
});

test('salen las que se piden, de los dos tipos y SOLO con monedas (2026-10-28)', { skip: !HAY }, () => {
  const s = montar();
  let cazar = 0, entregar = 0;
  for (let d = 1; d <= 20; d++) {
    const day = '2026-11-' + String(d).padStart(2, '0');
    const ms = s.sanearMisionesDelDia(s.gfGenerarMisiones(REGLAS, 'granjero', day));
    assert.equal(ms.length, 4);
    for (const m of ms) {
      if (m.tipo === 'cazar') {
        cazar++;
        assert.ok(m.monstruo === 'lobo_salvaje' || m.monstruo === '*');
        assert.ok(m.requiredAmount >= 2 && m.requiredAmount <= 5);
        assert.match(m.texts['en-US'].title, /^Defeat \d+ /);
      } else {
        entregar++;
        assert.ok(m.itemId === 'madera_pinos' || m.itemId === 'carbon');
        assert.match(m.texts['en-US'].title, /^Bring \d+ /);
      }
      assert.ok(m.expReward >= 10 && m.expReward <= 20);
      assert.equal(m.silverReward, 5);
      assert.equal(m.bronzeReward, 700, 'y bronce');
      // (2026-10-28) Ningún objeto de premio, aunque las reglas viejas traigan una lista.
      assert.equal(m.rewardItemId, undefined);
      assert.equal(m.rewardAmount, undefined);
    }
  }
  assert.ok(cazar > 10 && entregar > 10, 'la mezcla sale de los pesos (' + cazar + '/' + entregar + ')');
});

test('el saneado de una misión de cazar: monstruo válido, título y nombre', { skip: !HAY }, () => {
  const s = montar();
  const [m] = s.sanearMisionesDelDia([{ missionId: 'c1', tipo: 'cazar', monstruo: 'arana_salvaje', requiredAmount: 3, expReward: 50 }]);
  assert.equal(m.tipo, 'cazar');
  assert.equal(m.itemId, 'caza_arana_salvaje');
  assert.equal(m.texts['en-US'].itemName, 'Thorn Spider');
  assert.equal(m.texts['en-US'].title, 'Defeat 3 Thorn Spider');
  assert.throws(() => s.sanearMisionesDelDia([{ missionId: 'c2', tipo: 'cazar', monstruo: 'dragon_falso', requiredAmount: 1 }]), /no existe/);
  const [todos] = s.sanearMisionesDelDia([{ missionId: 'c3', tipo: 'cazar', requiredAmount: 7 }]);
  assert.equal(todos.monstruo, '*');
  // Las de entregar, como siempre.
  const [e] = s.sanearMisionesDelDia([{ missionId: 'e1', itemId: 'carbon', requiredAmount: 2 }]);
  assert.equal(e.tipo, 'entregar');
  assert.equal(e.itemId, 'carbon');
});

test('las reglas del panel se acotan y lo que no se puede acuñar no entra', { skip: !HAY }, () => {
  const s = montar();
  const r = s.gfSanearReglas({
    activo: 1, cuantas: 99, oroMax: 50000, expMin: -5,
    presas: [{ tipo: 'lobo_salvaje', min: 9, max: 2 }, { tipo: 'inventado' }],
    premios: [{ itemId: 'pocion_vida', min: 1, max: 2 }, { itemId: 'oro_gratis', min: 1 }],
    pedidos: [{ itemId: '<b>carbon</b>' }]
  });
  assert.equal(r.activo, true);
  assert.equal(r.cuantas, 10);
  assert.equal(r.oroMax, 1000);
  assert.equal(r.expMin, 0);
  assert.deepEqual(r.presas.map((p) => [p.tipo, p.min, p.max]), [['lobo_salvaje', 2, 9]]);
  assert.equal(JSON.stringify(r.premios), '[]', '(2026-10-28) solo monedas: no se guardan premios en objetos');
  assert.equal(s.gfSanearReglas({ bronceMin: -3, bronceMax: 5e9 }).bronceMax, 10000000, 'el bronce, acotado');
  // Una misión a mano con un objeto de premio: el objeto no entra; las monedas sí.
  const [x] = s.sanearMisionesDelDia([{ missionId: 'x1', itemId: 'carbon', requiredAmount: 1, rewardItemId: 'pocion_vida', rewardAmount: 2, bronzeReward: 1500 }]);
  assert.equal(x.rewardItemId, undefined);
  assert.equal(x.bronzeReward, 1500);
  assert.equal(r.pedidos[0].itemId, 'carbon');
});

test('Farmer Joe trae reglas de serie activas; el guardián no', { skip: !HAY }, () => {
  const s = montar();
  assert.equal(s.POR_DEFECTO.granjero.activo, true);
  assert.equal(s.POR_DEFECTO.guardian.activo, false);
  assert.equal(s.gfCazasDe({ '*': 7, lobo_salvaje: 3 }, 'lobo_salvaje'), 3);
  assert.equal(s.gfCazasDe({ '*': 7 }, '*'), 7);
  assert.equal(s.gfCazasDe({ '*': 7 }, 'golem_salvaje'), 0);
});
