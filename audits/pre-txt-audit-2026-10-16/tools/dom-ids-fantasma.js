/* ¿Busca el JavaScript elementos del DOM que no existen en ningún HTML?
 *
 * `document.getElementById('x')` devuelve null sin quejarse. La línea de al
 * lado —`el.addEventListener(...)`, `el.textContent = ...`— sí revienta, y solo
 * cuando se llega a ella. En este proyecto ya han aparecido varios casos con su
 * parche puesto ("FIX: si el HTML de la página no incluye el panel…"), así que
 * merece la pena mirarlo entero.
 *
 * QUÉ CUENTA COMO "EXISTE"
 *   Un id="x" en cualquier .html del proyecto, o un elemento que el propio
 *   JavaScript crea con `.id = 'x'` / `id="x"` dentro de un innerHTML. Los
 *   paneles de gf-muerte, gf-alquimista y compañía se construyen así.
 *
 * NO ES UN COMPILADOR: un id compuesto ('fila-' + i) no se puede resolver y se
 * ignora. Por eso solo mira los literales.
 *
 *   node tools/dom-ids-fantasma.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sinComentarios, sinComentariosHtml } = require('./_sin-comentarios.js');

const BIN = process.argv[2] || '.';

/** El fuente sin comentarios, del tipo que sea.
 *
 * A un .html se le quitan SOLO los comentarios de HTML. Pasarle tambien el
 * despintado de JavaScript lo destroza: los `//` de cualquier URL
 * (https://cdn...) se toman por un comentario de linea y se traga el resto del
 * renglon, y los `/*` del CSS dentro de <style> se comen bloques enteros. Con
 * eso, los ids declarados bajaban de 736 a 489 y salian 203 fantasmas falsos. */
function limpio(f) {
  const txt = fs.readFileSync(f, 'utf8');
  return /\.html$/.test(f) ? sinComentariosHtml(txt) : sinComentarios(txt);
}

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

// ── los ids que EXISTEN ─────────────────────────────────────────────────────
const existen = new Set();

// 1) en el HTML
for (const f of ficheros(BIN, /\.html$/)) {
  const txt = limpio(f);
  let m;
  const re = /\bid\s*=\s*["']([^"']+)["']/g;
  while ((m = re.exec(txt)) !== null) existen.add(m[1]);
}

// 2) los que crea el propio JavaScript
for (const f of ficheros(BIN, /\.js$/)) {
  const txt = limpio(f);
  let m;
  // p.id = 'gf-death';
  const reProp = /\.id\s*=\s*["']([^"']+)["']/g;
  while ((m = reProp.exec(txt)) !== null) existen.add(m[1]);
  // setAttribute('id', 'x')
  const reAttr = /setAttribute\(\s*["']id["']\s*,\s*["']([^"']+)["']\s*\)/g;
  while ((m = reAttr.exec(txt)) !== null) existen.add(m[1]);
  // id="x" dentro de un innerHTML
  const reHtml = /\bid\s*=\s*\\?["']([A-Za-z][\w-]*)\\?["']/g;
  while ((m = reHtml.exec(txt)) !== null) existen.add(m[1]);
}

// ── los que se BUSCAN ───────────────────────────────────────────────────────
const buscados = new Map();          // id -> [fichero:linea]
for (const f of ficheros(BIN, /\.(js|html)$/)) {
  const txt = limpio(f);          // sin comentarios: lo comentado no se ejecuta
  const rel = path.relative(BIN, f);
  let m;
  const re = /getElementById\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = re.exec(txt)) !== null) {
    const id = m[1];
    const linea = txt.slice(0, m.index).split('\n').length;
    if (!buscados.has(id)) buscados.set(id, []);
    buscados.get(id).push(rel + ':' + linea);
  }
}

/* Los que ya se han mirado a mano y NO son un fallo: el código comprueba el
   null antes de tocarlo. Se apuntan aquí con su motivo para que el informe
   quede en cero y cualquier fantasma NUEVO salte a la vista. Si alguno deja de
   estar protegido, se quita de esta lista y vuelve a aparecer. */
const REVISADOS = {
  '_mail-clear-all': 'panel de correo que no está en el HTML; todos los usos comprueban null',
  '_mail-close':     'idem',
  '_mail-empty':     'idem',
  '_mail-list':      'idem, y hace `if (!list) return`',
  '_mail-read-all':  'idem',
  'gf-notif-settings-btn': 'se busca A PROPÓSITO para borrar el botón viejo: `if (legacy) legacy.remove()`',
  'inventory-cursor':      'guardado con `if (cursor)`',
  'inventory-items':       'guardado con `if(!container) return`',
  'mission-hub':           'guardado con `if (hub)`',
  'music-change-btn':      'guardado con `if (el.musicChangeBtn)`',
  'music-select':          'guardado con `el.musicSelect ? … : …`',
  'player-level-display':  'guardado con `if(a)`',
  'recipe-description':    'guardado con `if(descEl)`'
};

const fantasmas = [...buscados.keys()]
  .filter((id) => !existen.has(id) && !REVISADOS[id]).sort();

console.log('ids que existen (HTML + creados por JS): ' + existen.size);
console.log('ids que se buscan con getElementById:    ' + buscados.size);
console.log('');

if (!fantasmas.length) {
  console.log('  OK   ningun getElementById NUEVO apunta a un id inexistente');
  console.log('       (' + Object.keys(REVISADOS).length +
              ' ya revisados a mano: todos comprueban el null antes de tocarlo)');
} else {
  console.log('IDS QUE SE BUSCAN Y NO EXISTEN EN NINGUN SITIO (' + fantasmas.length + '):');
  for (const id of fantasmas) {
    console.log("  '" + id + "'");
    for (const d of buscados.get(id).slice(0, 4)) console.log('      ' + d);
  }
  console.log('');
  console.log('Cada uno devuelve null. Mira si la linea siguiente lo usa sin comprobar:');
  console.log('eso es un TypeError esperando a que se pase por ahi.');
}
