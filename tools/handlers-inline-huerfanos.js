/* ¿Hay `onclick="algo()"` en el HTML que apunte a una función que no existe?
 *
 * Un manejador inline se resuelve contra el ámbito GLOBAL: si la función no
 * está colgada de `window`, al pulsar el botón salta
 * "Uncaught ReferenceError: algo is not defined" y no pasa nada más — el botón
 * simplemente no hace nada, sin ninguna pista salvo la consola.
 *
 * Ojo con el detalle que lo hace fácil de romper en este proyecto: una
 * `function suelta()` en la raíz de un <script> clásico SÍ queda en window,
 * pero una `const suelta = () => {}` o una función dentro de un IIFE
 * `(function(){ … })()` NO. Mover código a un módulo envuelto deja los botones
 * mudos sin tocar el HTML.
 *
 *   node tools/handlers-inline-huerfanos.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sinComentarios, sinComentariosHtml } = require('./_sin-comentarios.js');

const BIN = process.argv[2] || '.';

function ficheros(dir, ext, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'temp_old', 'XDPRUEBA', 'recortadas',
         'Game', 'assets', 'fonts', 'Maps'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, ext, acc);
    else if (ext.test(e.name)) acc.push(p);
  }
  return acc;
}

/* Lo que queda accesible desde un manejador inline: funciones declaradas en la
   raíz de un script clásico, y cualquier cosa colgada de window. */
const globales = new Set();
for (const f of ficheros(BIN, /\.(js|html)$/)) {
  const crudo = fs.readFileSync(f, 'utf8');
  const txt = /\.html$/.test(f) ? sinComentariosHtml(crudo) : sinComentarios(crudo);
  let m;
  // function nombre(...)  al principio de línea (raíz del script)
  const reFn = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
  while ((m = reFn.exec(txt)) !== null) globales.add(m[1]);
  // window.nombre = ...   /  window['nombre'] = ...
  const reWin = /\bwindow\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = reWin.exec(txt)) !== null) globales.add(m[1]);
  const reWin2 = /\bwindow\s*\[\s*["']([^"']+)["']\s*\]\s*=/g;
  while ((m = reWin2.exec(txt)) !== null) globales.add(m[1]);
  // class Nombre  (queda en el ámbito del script, alcanzable desde inline si es raíz)
  const reCls = /^class\s+([A-Za-z_$][\w$]*)/gm;
  while ((m = reCls.exec(txt)) !== null) globales.add(m[1]);
}

/* Y ahora los manejadores inline del HTML. Solo se mira el PRIMER
   identificador de la expresión: `onclick="cerrar()"` → cerrar. Lo que empieza
   por `window.`, `this.` o un literal no cuenta. */
const rotos = new Map();
let revisados = 0;
for (const f of ficheros(BIN, /\.html$/)) {
  const txt = sinComentariosHtml(fs.readFileSync(f, 'utf8'));
  const rel = path.relative(BIN, f);
  const re = /\son[a-z]+\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const cuerpo = m[1].trim();
    const ident = /^([A-Za-z_$][\w$]*)\s*\(/.exec(cuerpo);
    if (!ident) continue;                       // window.x(), this.x(), return false, …
    revisados++;
    const nombre = ident[1];
    if (globales.has(nombre)) continue;
    const linea = txt.slice(0, m.index).split('\n').length;
    if (!rotos.has(nombre)) rotos.set(nombre, []);
    rotos.get(nombre).push(rel + ':' + linea);
  }
}

console.log('Manejadores inline revisados: ' + revisados);
console.log('Nombres globales encontrados: ' + globales.size);
console.log('');

if (!rotos.size) {
  console.log('  OK   todo manejador inline apunta a una funcion que existe en el ambito global');
} else {
  console.log('MANEJADORES QUE APUNTAN A NADA (' + rotos.size + '):');
  for (const [n, donde] of [...rotos].sort()) {
    console.log('  ' + n + '()   en: ' + donde.slice(0, 5).join(', '));
  }
  console.log('');
  console.log('Al pulsar, cada uno lanza ReferenceError y el boton no hace nada.');
}
