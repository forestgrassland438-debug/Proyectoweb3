/* Un objeto raro no puede vaciar el inventario entero.
 *
 * EL FALLO QUE REPRODUCE — "en GameScene se ven todos los objetos, en la tienda
 * no": `renderSlot` leia `this.ItemDefinitions[itemObj.id].src` sin comprobar.
 * Con un objeto que no estuviera en el catalogo, eso lanza un TypeError que
 * sale de `renderSlot`, sube al bucle de `renderAllSlots()` —que no tenia
 * red— y LO CORTA. Todas las casillas siguientes se quedaban en blanco.
 *
 * A la tienda le faltaban cuatro objetos que GameScene si tenia (el carbon y
 * las tres pociones del alquimista). Con una pocion en la casilla 12, la tienda
 * pintaba doce objetos de cuarenta.
 *
 * Aqui se sacan `renderSlot`, `renderAllSlots` y sus ayudantes DE LOS FUENTES
 * DE VERDAD y se ejecutan contra un DOM de mentira, con una pocion en la
 * casilla 12 y un objeto inventado en la 20. Sin navegador.
 *
 *   node tools/inventario-prueba-pintado.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');

/** Saca un metodo entero contando llaves desde su cabecera. */
function metodo(txt, cabecera) {
  const i = txt.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro el metodo: ' + cabecera);
  const j = txt.indexOf('{', i);
  let nivel = 0, k = j;
  for (; k < txt.length; k++) {
    if (txt[k] === '{') nivel++;
    else if (txt[k] === '}') { nivel--; if (nivel === 0) break; }
  }
  return txt.slice(i, k + 1);
}

// ── Un DOM con lo justo ──────────────────────────────────────────────────────
function elemento(clase, indice) {
  const el = {
    _clase: clase, _indice: indice,
    innerHTML: '', hijos: [],
    style: {},
    dataset: {},
    classList: {
      _c: new Set(),
      add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); },
      contains(c) { return this._c.has(c); }
    },
    appendChild(h) { this.hijos.push(h); return h; }
  };
  // `innerHTML = ""` vacia la casilla, igual que en el navegador.
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set() { el.hijos.length = 0; }
  });
  return el;
}

function montarDom(nInv, nQuick) {
  const inv = [], quick = [];
  for (let i = 0; i < nInv; i++) inv.push(elemento('inv-slot', i));
  for (let i = 0; i < nQuick; i++) quick.push(elemento('quick-slot', i));
  return {
    inv, quick,
    createElement: (t) => {
      const e = elemento(t, -1);
      e.tag = t;
      let _src = null;
      Object.defineProperty(e, 'src', { get: () => _src, set: (v) => { _src = v; } });
      e.removeAttribute = () => { _src = null; };
      e.textContent = '';
      return e;
    },
    querySelector: (sel) => {
      let m = sel.match(/\.inv-slot\[data-slot-index="(\d+)"\]/);
      if (m) return inv[Number(m[1])] || null;
      m = sel.match(/\.quick-slot\[data-slot-index="(\d+)"\]/);
      if (m) return quick[Number(m[1])] || null;
      return null;
    }
  };
}

// ── Se arma un objeto con los metodos REALES de la escena ────────────────────
function escenaDe(rel) {
  const txt = fs.readFileSync(path.join(BIN, rel), 'utf8');
  const piezas = [
    metodo(txt, '_crearIconoDeItem(itemId) {'),
    metodo(txt, '_srcDeItem(itemId) {'),
    metodo(txt, 'renderSlot(index) {'),
    metodo(txt, 'renderAllSlots() {')
  ];
  // Los metodos de clase se envuelven en un objeto literal para poder llamarlos.
  const fuente = '({\n' + piezas.join(',\n') + '\n})';
  return (0, eval)(fuente);
}

// ── La prueba ────────────────────────────────────────────────────────────────
let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); } };

const CATALOGO = {
  calabaza_buena: { src: './a.png', tipo: 'x', usos: null },
  zanahoria_buena: { src: './b.png', tipo: 'x', usos: null },
  pocion_mascota: { src: './c.png', tipo: 'x', usos: null }
};

/** 40 casillas llenas: la 12 lleva una pocion y la 20 un objeto inventado. */
function inventarioDePrueba(catalogo) {
  const slots = [];
  for (let i = 0; i < 40; i++) {
    let id = (i % 2) ? 'zanahoria_buena' : 'calabaza_buena';
    if (i === 12) id = 'pocion_mascota';
    if (i === 20) id = 'objeto_que_no_existe';   // uno que NUNCA estara en el catalogo
    slots.push({ id, count: 5 });
  }
  return slots;
}

for (const rel of ['Scenes/tiendajuego.js', 'Scenes/GameScene.js']) {
  console.log('\n=== ' + path.basename(rel) + ' ===');
  const escena = escenaDe(rel);
  const dom = montarDom(40, 7);

  global.document = { createElement: dom.createElement, querySelector: dom.querySelector };
  const avisos = [];
  const warnOriginal = console.warn, errorOriginal = console.error;
  console.warn = (...a) => avisos.push(String(a[0]));
  console.error = (...a) => avisos.push(String(a[0]));

  escena.ItemDefinitions = CATALOGO;
  escena.STATE = {
    slots: inventarioDePrueba(CATALOGO),
    quickSlots: new Array(7).fill(null).map(() => ({ id: 'calabaza_buena', count: 2 })),
    ghostSlots: { inv: new Array(40).fill(null), quick: new Array(7).fill(null) }
  };

  let reviento = false;
  try { escena.renderAllSlots(); }
  catch (e) { reviento = true; avisos.push('EXCEPCION: ' + e.message); }

  console.warn = warnOriginal; console.error = errorOriginal;

  ok(!reviento, 'renderAllSlots() no se propaga hacia fuera');

  const pintadas = dom.inv.filter((d) => d.hijos.length > 0).length;
  ok(pintadas === 40,
     'se pintan las 40 casillas, incluida la 20 con un objeto desconocido',
     'solo se pintaron ' + pintadas + ' (antes del arreglo: 12, y el resto en blanco)');

  // La casilla 20 existe y lleva su contador, aunque no tenga dibujo.
  const c20 = dom.inv[20];
  const cuenta20 = c20.hijos.filter((h) => h.textContent === 'x5').length;
  ok(cuenta20 === 1, 'la casilla del objeto desconocido conserva su contador (x5)');

  const icono20 = c20.hijos.find((h) => h.tag === 'img');
  ok(icono20 && icono20.style.visibility === 'hidden',
     'y su icono queda oculto en vez de salir roto');

  // Las de despues del objeto raro se pintan con normalidad.
  const despues = dom.inv.slice(21).filter((d) => d.hijos.length > 0).length;
  ok(despues === 19, 'las 19 casillas POSTERIORES al objeto raro se pintan igual',
     'se pintaron ' + despues);

  // La 12 (una pocion) ahora si tiene dibujo: era la que cortaba el pintado.
  const icono12 = dom.inv[12].hijos.find((h) => h.tag === 'img');
  ok(icono12 && icono12.src === './c.png', 'la casilla 12 (pocion) se pinta con su icono');

  ok(avisos.some((a) => a.indexOf('objeto_que_no_existe') >= 0),
     'y queda un aviso en la consola diciendo QUE objeto falta',
     avisos.join(' | ').slice(0, 120));

  // Las casillas rapidas tambien.
  const rapidas = dom.quick.filter((d) => d.hijos.length > 0).length;
  ok(rapidas === 7, 'las 7 casillas rapidas se pintan', 'se pintaron ' + rapidas);
}

console.log('\n' + '='.repeat(64));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
