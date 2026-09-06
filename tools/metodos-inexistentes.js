/* ¿Se llama a algún `this.algo()` que no existe?
 *
 * En ficheros de veinte y treinta mil líneas es facilísimo llamar a un método
 * con el nombre mal escrito, o a uno que se borró hace meses. JavaScript no
 * avisa: revienta en tiempo de ejecución, y solo si se llega a esa línea. En
 * este proyecto ya apareció uno así (`cleanupWaterSystem()`, que no existía en
 * ninguna parte y mataba el shutdown a la mitad, dejando el juego congelado al
 * cambiar de escena).
 *
 * CÓMO LO HACE
 *   Por cada fichero recoge todo lo que puede ser un método:
 *     - `nombre(...) {` dentro de una clase
 *     - `nombre = function` / `nombre = (...) =>` / `nombre: function`
 *     - `this.nombre = ...`   (campos que guardan funciones)
 *     - `Clase.prototype.nombre = ...`
 *   Y luego busca los `this.nombre(` que no estén en esa lista ni en la de
 *   Phaser.
 *
 * NO ES UN COMPILADOR. Puede haber falsos positivos si un método se cuelga de
 * forma rara (Object.assign, mixins). Por eso NO falla el proceso: informa. Lo
 * que hay que mirar es que la lista no crezca.
 *
 *   node tools/metodos-inexistentes.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || '.';

/* Lo que trae Phaser.Scene puesto, más lo que el juego cuelga en las escenas
   desde fuera. Nada de esto se define en el fichero, así que sin esta lista
   saldría como "inexistente". */
const DE_PHASER = new Set([
  'init', 'preload', 'create', 'update', 'sys', 'game', 'anims', 'cache',
  'plugins', 'registry', 'scale', 'sound', 'textures', 'events', 'cameras',
  'add', 'make', 'scene', 'children', 'lights', 'data', 'input', 'load',
  'time', 'physics', 'tweens', 'matter', 'renderer',
  // helpers que el proyecto cuelga desde otros ficheros (mixins sueltos)
  'setInteractive', 'on', 'off', 'once', 'emit',
  /* Los `setNf` son de Phaser.Renderer.WebGL.Pipelines.PostFXPipeline: dentro
     de un shader, `this` es la tubería, no la escena. gf-postproceso los usa
     nueve veces y eran nueve falsos positivos. */
  'set1f', 'set2f', 'set3f', 'set4f', 'set1i', 'setMatrix4fv', 'bindTexture',
  /* `has` sale del relleno de WeakMap que llevan app.js y phaser-rpg-perf.js
     para navegadores viejos: ahí `this` es el propio relleno. */
  'has', 'get', 'set', 'delete'
]);

/* Llamadas que YA SE SABE que apuntan a un método inexistente y que están
   protegidas con un `typeof … === 'function'` que avisa en vez de reventar.
   Se dejan aquí para que el informe no las repita: si aparece una que no esté
   en esta lista, es nueva. Ver los comentarios en el propio GameScene. */
const CONOCIDAS = new Set([
  'getPlayerDataForMissions',   // updatePlayerDataAfterMission, sin llamar
  'openHudEstadisticas_1'       // familia de HUD a medio hacer
]);

/* Quita los COMENTARIOS, dejando los mismos saltos de linea para que los
   numeros de linea sigan cuadrando.

   Sin esto la herramienta avisaba de código comentado: en GameScene hay un
   bloque entero de "movimiento por clic" dentro de un comentario, con tres
   llamadas a métodos que no existen. Ahí no hay ningún fallo —no se ejecuta— y
   sacarlo en el informe solo consigue que nadie se fie del informe.

   Las CADENAS no se quitan a proposito: al intentarlo, un literal de
   expresion regular como /['"]/ abria una cadena falsa que se tragaba el
   resto del fichero, y con el las definiciones. Los sospechosos pasaban de
   17 a 90. Una cadena con `this.algo(` dentro es rarisima; una regex con
   comillas, no. */
function soloCodigo(txt) {
  var out = '';
  var i = 0, n = txt.length;
  var estado = 'codigo';        // codigo | linea | bloque
  while (i < n) {
    var c = txt[i], d = txt[i + 1];
    if (estado === 'codigo') {
      if (c === '/' && d === '/') { estado = 'linea';  out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { estado = 'bloque'; out += '  '; i += 2; continue; }
      out += c; i++; continue;
    }
    if (estado === 'linea') {
      if (c === '\n') { estado = 'codigo'; out += '\n'; i++; continue; }
      out += ' '; i++; continue;
    }
    // bloque
    if (c === '*' && d === '/') { estado = 'codigo'; out += '  '; i += 2; continue; }
    out += (c === '\n') ? '\n' : ' '; i++;
  }
  return out;
}

function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'temp_old', 'XDPRUEBA', 'tools', 'recortadas',
         'Game', 'assets', 'fonts', 'Maps'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (/\.js$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/* Los nombres definidos en TODO el proyecto, no solo en el fichero: los
   métodos de las escenas se reparten entre varios ficheros (tienda_sistema.js
   define métodos que se usan desde tiendajuego.js, por ejemplo). */
const definidos = new Set();
const lista = ficheros(BIN);

const RE_DEF = [
  /^\s{0,8}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm,   // metodo de clase
  /\bthis\.([A-Za-z_$][\w$]*)\s*=/g,                               // campo
  /\.prototype\.([A-Za-z_$][\w$]*)\s*=/g,                          // prototipo
  /\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function/g,             // objeto literal
  /\b([A-Za-z_$][\w$]*)\s*:\s*\([^)]*\)\s*=>/g,                    // objeto literal flecha
  /\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g             // funciones sueltas
];

const textos = new Map();     // código despintado, para buscar
const crudos = new Map();     // el original, para enseñar la línea en el informe
for (const f of lista) {
  const crudo = fs.readFileSync(f, 'utf8');
  const txt = soloCodigo(crudo);
  crudos.set(f, crudo);
  textos.set(f, txt);
  for (const re of RE_DEF) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(txt)) !== null) definidos.add(m[1]);
  }
}

// ── ahora, las llamadas ─────────────────────────────────────────────────────
let total = 0;
const sospechosos = [];
for (const f of lista) {
  const txt = textos.get(f);
  const lineas = (crudos.get(f) || '').split('\n');
  const re = /\bthis\.([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    total++;
    const nombre = m[1];
    if (definidos.has(nombre) || DE_PHASER.has(nombre) || CONOCIDAS.has(nombre)) continue;
    const linea = txt.slice(0, m.index).split('\n').length;
    sospechosos.push({
      fichero: path.relative(BIN, f), linea, nombre,
      texto: (lineas[linea - 1] || '').trim().slice(0, 100)
    });
  }
}

console.log('Llamadas `this.algo()` revisadas: ' + total);
console.log('Nombres definidos en el proyecto: ' + definidos.size);
console.log('');

if (!sospechosos.length) {
  console.log('  OK   ninguna llamada NUEVA apunta a un metodo inexistente');
  console.log('       (' + CONOCIDAS.size + ' conocidas y ya protegidas: ' +
              [...CONOCIDAS].join(', ') + ')');
} else {
  console.log('LLAMADAS SOSPECHOSAS (' + sospechosos.length + '):');
  for (const s of sospechosos) {
    console.log('  ' + s.fichero + ':' + s.linea + '  this.' + s.nombre + '()');
    console.log('      ' + s.texto);
  }
  console.log('');
  console.log('Repasa cada una: puede ser un metodo colgado de forma rara, o un');
  console.log('nombre mal escrito que reventara en cuanto se llegue a esa linea.');
}
