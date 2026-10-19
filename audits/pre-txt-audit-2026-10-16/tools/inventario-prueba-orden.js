/* ¿SE DESORDENA EL INVENTARIO AL ENTRAR AL MAPA?            (2026-10-03)
 *
 * Carga Scenes/LoadingScenegame.js DE VERDAD (con un Phaser de mentira) y le
 * pasa por la sincronización con la cadena un inventario con los tres tipos
 * de casilla que existen en la vida real:
 *
 *   · casillas buenas (idx y manualId de su factura);
 *   · casillas con idx BASURA — el número de casilla que pone `addItem`
 *     cuando no le pasan una factura, y el manualId con el nombre del objeto;
 *   · casillas con el idx de una factura que ya se gastó (otra del mismo
 *     objeto sigue viva).
 *
 * Con la versión anterior (`_applySyncToSlots`) las dos últimas se vaciaban y
 * su factura acababa en la PRIMERA casilla libre: "siempre se desordenan los
 * items". Ahora tienen que quedarse donde estaban. Además:
 *
 *   · dos casillas con el mismo idx no pueden enseñar la misma factura dos
 *     veces (se duplicaba el objeto en pantalla);
 *   · una factura sin casilla va a la que recuerda la cadena (contrato v3),
 *     no a la primera libre;
 *   · las tablas que no son objetos (vida, nivel, nombre, cons_parcelas…) no
 *     entran en el inventario.
 *
 *   node tools/inventario-prueba-orden.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2] || path.join(__dirname, '..');
const fuente = fs.readFileSync(path.join(BIN, 'Scenes', 'LoadingScenegame.js'), 'utf8');

const contexto = {
  console: { log() {}, warn() {}, error() {} },
  Phaser: { Scene: class { constructor() {} } },
  window: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {} },
  location: { hostname: 'game.grasslandforest.com', protocol: 'https:', search: '', href: 'https://game.grasslandforest.com/' },
  // Lo que el constructor crea y esta prueba no usa.
  LoadingSystem: class { constructor() {} },
  setTimeout, clearTimeout, setInterval, clearInterval
};
contexto.window = contexto;
vm.createContext(contexto);
vm.runInContext(fuente, contexto, { filename: 'LoadingScenegame.js' });
const Clase = contexto.LoadingScenegame;
const proto = Clase.prototype;

let pasan = 0, fallan = 0;
const ok = (c, m, x) => {
  if (c) { pasan++; console.log('  OK    ' + m); }
  else { fallan++; console.log('  FALLO ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); }
};

/* Una escena de mentira con los métodos REALES de la clase y su catálogo. */
function escena() {
  const e = Object.create(proto);
  const real = new Clase();          // para sacar ItemDefinitions y TIPO_TO_ITEM_ID tal cual
  e.ItemDefinitions = real.ItemDefinitions;
  e.TIPO_TO_ITEM_ID = real.TIPO_TO_ITEM_ID;
  e.STATE = { slots: new Array(40).fill(null), quickSlots: new Array(7).fill(null) };
  return e;
}
function factura(id, manualId, tipo, cantidad) { return [id, { id, manualId, tipo, cantidad, active: true }]; }

console.log('\n=== 1. NADIE SE MUEVE DE SU CASILLA ===');
{
  const e = escena();
  // Lo que el jugador tenía ordenado a mano:
  e.STATE.slots[0]  = { id: 'hacha_de_madera', idx: 101, idm: 'hm1', count: 1 };      // buena
  e.STATE.slots[5]  = { id: 'zanahoria_buena', idx: 5,   idm: 'zanahoria_buena', count: 12 }; // basura (nº de casilla)
  e.STATE.slots[9]  = { id: 'parcela',         idx: 77,  idm: 'p-viejo', count: 20 };  // factura gastada, hay otra
  e.STATE.slots[17] = { id: 'tomate_buena',    idx: 104, idm: 'tm1', count: 3 };       // cantidad desfasada
  e.STATE.quickSlots[2] = { id: 'Regaderax',   idx: 2,   idm: 'Regaderax', count: 1 }; // basura en el cofre
  const cadena = new Map([
    factura(101, 'hm1', 'hacha de madera', 1),
    factura(102, 'zx9', 'zanahoria_buena', 12),
    factura(103, 'p-nuevo', 'parcelas', 20),
    factura(104, 'tm1', 'tomate_buena', 7),
    factura(105, 'rg1', 'Regaderax', 1),
    factura(900, 's_x_vida', 'vida', 100),
    factura(901, 'nv:pj:0xabc', 'nivel', 5),
    factura(902, 'pj:Ana', 'nombre', 1),
    factura(903, 'cp:3.4:0xabc', 'cons_parcelas', 1)
  ]);
  const arreglos = e._reconciliarCasillas(cadena);
  const nuevos = e._addMissingBlockchainItems(cadena, {});
  const S = e.STATE.slots, Q = e.STATE.quickSlots;
  ok(S[0] && S[0].id === 'hacha_de_madera' && S[0].idx === 101, 'la casilla buena sigue igual');
  ok(S[5] && S[5].id === 'zanahoria_buena' && S[5].idx === 102 && S[5].idm === 'zx9', 'idx basura: la zanahoria SE QUEDA en la casilla 5, con su factura de verdad', S[5]);
  ok(S[9] && S[9].id === 'parcela' && S[9].idx === 103, 'factura gastada: la parcela se queda en la 9 con la factura viva', S[9]);
  ok(S[17] && S[17].count === 7, 'la cantidad la pone la cadena', S[17]);
  ok(Q[2] && Q[2].id === 'Regaderax' && Q[2].idx === 105, 'en el cofre igual', Q[2]);
  ok(nuevos === 0, 'no se añade nada en otra casilla (antes: 3 objetos movidos)', nuevos);
  ok(S.filter(Boolean).length === 4 && Q.filter(Boolean).length === 1, 'ni la vida, ni el nivel, ni el nombre, ni lo construido entran al inventario',
     [S.filter(Boolean).map(s => s.id), Q.filter(Boolean).map(s => s.id)]);
  ok(arreglos.inv === 3 && arreglos.quick === 1, 'y se marcan como cambios para guardarlos', arreglos);
}

console.log('\n=== 2. LO QUE NO TIENE FACTURA SE VA; LO DUPLICADO NO SE DUPLICA ===');
{
  const e = escena();
  e.STATE.slots[0] = { id: 'carbon', idx: 300, idm: 'c1', count: 4 };
  e.STATE.slots[1] = { id: 'carbon', idx: 300, idm: 'c1', count: 4 };     // misma factura dos veces
  e.STATE.slots[2] = { id: 'fresa_buena', idx: 2, idm: 'fresa_buena', count: 5 }; // sin ninguna factura
  const cadena = new Map([factura(300, 'c1', 'carbon', 4)]);
  e._reconciliarCasillas(cadena);
  e._addMissingBlockchainItems(cadena, {});
  const S = e.STATE.slots;
  ok(S[0] && S[0].idx === 300, 'la primera casilla se queda la factura');
  ok(S[1] === null, 'la copia se quita: el carbón no aparece dos veces', S[1]);
  ok(S[2] === null, 'lo que no existe en la cadena se quita', S[2]);
}

console.log('\n=== 3. LO NUEVO DE LA CADENA VA A LA CASILLA QUE ELLA RECUERDA ===');
{
  const e = escena();
  e.STATE.slots[0] = { id: 'carbon', idx: 300, idm: 'c1', count: 4 };
  const cadena = new Map([
    factura(300, 'c1', 'carbon', 4),
    factura(301, 'x1', 'tomate_buena', 2),                // sin casilla
    factura(302, 'x2', 'zanahoria_buena', 9),             // la cadena dice: inventario 12
    factura(303, 'x3', 'parcelas', 20),                   // la cadena dice: cofre 4
    factura(304, 'x4', 'calabaza_buena', 1)               // dice inventario 0, pero está ocupada
  ]);
  const casillas = { 302: 13, 303: 10005, 304: 1 };
  e._reconciliarCasillas(cadena);
  e._addMissingBlockchainItems(cadena, casillas);
  const S = e.STATE.slots, Q = e.STATE.quickSlots;
  ok(S[12] && S[12].idx === 302, 'la zanahoria vuelve a la casilla 12', S[12]);
  ok(Q[4] && Q[4].idx === 303 && Q[4].id === 'parcela', 'la parcela vuelve al cofre 4', Q[4]);
  ok(S[0].idx === 300, 'una casilla ocupada no se pisa');
  const tomate = S.findIndex(s => s && s.idx === 301);
  const calabaza = S.findIndex(s => s && s.idx === 304);
  ok([tomate, calabaza].sort().join() === '1,2', 'lo que no tiene casilla (o la tiene ocupada) va a las primeras libres', [tomate, calabaza]);
}

console.log('\n=== 4. LA VERSIÓN ANTERIOR SÍ DESORDENABA (la prueba vale) ===');
{
  /* Reproducción literal de lo que hacía `_applySyncToSlots` con la casilla
     de idx basura: la vaciaba, y después la factura iba a la primera libre. */
  const S = new Array(40).fill(null);
  S[5] = { id: 'zanahoria_buena', idx: 5, idm: 'zanahoria_buena', count: 12 };
  const viva = new Map([factura(102, 'zx9', 'zanahoria_buena', 12)]);
  if (!viva.get(Number(S[5].idx))) S[5] = null;
  const libre = S.findIndex(s => s === null);
  ok(libre === 0, 'con la lógica vieja, la zanahoria de la casilla 5 acababa en la 0');
}

console.log('\nPasan: ' + pasan + '   Fallan: ' + fallan);
process.exit(fallan ? 1 : 0);
