/* ¿Escapan de verdad los escapadores del proyecto?
 *
 * Hay CINCO escapadores distintos repartidos (GameScene, tiendajuego,
 * CraftingHub, missionspanel y market.html) y todos alimentan `innerHTML`. Con
 * varias copias sueltas es cuestión de tiempo que una se quede corta — ya pasó
 * dos veces:
 *
 *   · `GameScene._escHtml` no escapaba las comillas NI pasaba por String(), y
 *     se usa dentro de atributos (`data-id="…"`, `src="…"`).
 *   · `market.html escapeHtml` usaba el truco de `div.textContent` →
 *     `innerHTML`, que no escapa comillas, y se usa en
 *     `data-owner="${escapeHtml(nombreDeOtroJugador)}"`.
 *
 * Esta prueba saca cada escapador del fuente y le pasa las cargas de siempre.
 * No hace falta navegador.
 *
 *   node tools/escapado-prueba.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || '.';

/* Las cargas. La de la comilla es la que importa: se puede inyectar un
   manejador de evento sin usar ni un solo `<`, y por eso los escapadores que
   solo miran & < > parecen correctos y no lo son. */
const CARGAS = [
  { nombre: 'etiqueta',        entrada: '<img src=x onerror=alert(1)>',  prohibido: ['<', '>'] },
  { nombre: 'comilla doble',   entrada: 'x" onmouseover="alert(1)',      prohibido: ['"'] },
  { nombre: 'comilla simple',  entrada: "x' onmouseover='alert(1)",      prohibido: ["'"] },
  { nombre: 'ampersand',       entrada: '&lt;script&gt;',                prohibido: [] },
  { nombre: 'nulo',            entrada: null,                            prohibido: [] },
  { nombre: 'numero',          entrada: 12345,                           prohibido: [] }
];

/* Cada escapador, sacado de su fichero. Se copia el CUERPO real en vez de
   reimplementarlo: si alguien cambia el del proyecto, esta prueba cambia con
   él y no se queda comprobando una copia vieja. */
function sacar(fichero, desde, hasta) {
  const txt = fs.readFileSync(path.join(BIN, fichero), 'utf8');
  const i = txt.indexOf(desde);
  if (i < 0) return null;
  const j = txt.indexOf(hasta, i);
  if (j < 0) return null;
  return txt.slice(i, j + hasta.length);
}

const escapadores = [
  { nombre: 'GameScene._escHtml',
    fuente: sacar('Scenes/GameScene.js', '  _escHtml(t) {', "replace(/'/g, '&#39;');") },
  { nombre: 'tiendajuego._escHtml',
    fuente: sacar('Scenes/tiendajuego.js', '  _escHtml(t) {', "replace(/'/g, '&#39;');") },
  { nombre: 'CraftingHub._esc',
    fuente: sacar('CraftingHub.js', '  _esc(str) {', "replace(/'/g,'&#039;');") },
  { nombre: 'missionspanel._esc',
    fuente: sacar('missionspanel.js', '  _esc(v) {', "replace(/'/g, '&#039;');") },
  { nombre: 'market.html escapeHtml',
    fuente: sacar('market.html', '  function escapeHtml(str){', "replace(/'/g, '&#39;');") },
  { nombre: 'GameScene._escapeRankHtml',
    fuente: sacar('Scenes/GameScene.js', '_escapeRankHtml(s) {', '));') },
  { nombre: 'NotificationHub _escNotif',
    fuente: sacar('NotificationHub.js', 'const _escNotif =', "replace(/'/g, '&#39;');") }
];

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('    OK   ' + m); }
                          else { fallos++; console.log('    FALLO ' + m + (x ? '  → ' + x : '')); } };

for (const e of escapadores) {
  console.log('\n=== ' + e.nombre + ' ===');
  if (!e.fuente) { ok(false, 'se encuentra en el fuente'); continue; }

  // Se envuelve el cuerpo en una función suelta que se pueda llamar.
  let fn;
  try {
    const cuerpo = e.fuente
      .replace(/^\s*(?:function\s+)?[\w.$]+\s*\(([^)]*)\)\s*\{/, 'function _f($1) {')
      .replace(/^\s*const\s+[\w$]+\s*=\s*\(([^)]*)\)\s*=>/, 'function _f($1) { return ')
      .replace(/^\s*_?[\w$]+\s*\(([^)]*)\)\s*\{/, 'function _f($1) {');
    const src = cuerpo.trim().startsWith('function')
      ? cuerpo + (cuerpo.trim().endsWith('}') ? '' : '; }')
      : 'function _f(x){ return (' + cuerpo + '); }';
    fn = new Function(src + '; return _f;')();
  } catch (err) {
    ok(false, 'se puede evaluar', err.message);
    continue;
  }

  for (const c of CARGAS) {
    let salida;
    try { salida = String(fn(c.entrada)); }
    catch (err) { ok(false, c.nombre + ': no revienta', err.message); continue; }

    const cuela = c.prohibido.filter((ch) => salida.includes(ch));
    ok(cuela.length === 0,
       c.nombre + ' → ' + JSON.stringify(salida).slice(0, 60),
       cuela.length ? 'deja pasar: ' + cuela.join(' ') : '');
  }
}

console.log('\n' + '='.repeat(60));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
