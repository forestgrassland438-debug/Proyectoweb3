/* Los dos catalogos de objetos, ¿dicen lo mismo?
 *
 * `ItemDefinitions` esta DUPLICADO: una copia en Scenes/GameScene.js y otra en
 * Scenes/tiendajuego.js. Las dos pintan el MISMO inventario (los mismos
 * `.inv-slot` del mismo HTML), asi que en cuanto una se queda atras, el
 * inventario se ve distinto segun donde estes.
 *
 * Y no se ve "un hueco": `renderSlot` hacia
 *
 *     img.src = this.ItemDefinitions[itemObj.id].src;
 *
 * que con una definicion ausente lanza un TypeError, sube hasta el bucle de
 * `renderAllSlots()` y LO CORTA. Todas las casillas siguientes se quedaban en
 * blanco. Le paso de verdad: a la tienda le faltaban el carbon y las tres
 * pociones del alquimista, y con una pocion en la casilla 12 la tienda pintaba
 * doce objetos de cuarenta mientras el mapa los pintaba todos.
 *
 * Esta herramienta compara los dos catalogos y ademas comprueba que cada PNG
 * exista de verdad — una ruta rota es la otra forma silenciosa de que un objeto
 * se vuelva invisible.
 *
 *   node tools/inventario-catalogos.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');

/** Saca el objeto literal que sigue a `marca` contando llaves. */
function bloque(rel, marca) {
  const s = fs.readFileSync(path.join(BIN, rel), 'utf8');
  const i = s.indexOf(marca);
  if (i < 0) throw new Error('no encuentro "' + marca + '" en ' + rel);
  const j = s.indexOf('{', i);
  let nivel = 0, k = j;
  for (; k < s.length; k++) {
    if (s[k] === '{') nivel++;
    else if (s[k] === '}') { nivel--; if (nivel === 0) break; }
  }
  return s.slice(j, k + 1);
}

/* Los fuentes de este proyecto llevan finales de linea CRLF, y en JavaScript el
   punto de una expresion regular NO casa con `\r`: es un terminador de linea.
   Con un `(.*)$` al final del patron, NINGUNA linea casaba y el catalogo salia
   vacio — la herramienta decia "0 objetos" y daba todo por bueno, que es la
   peor forma de fallar que puede tener un detector. Se quitan aqui. */
function lineas(txt) { return txt.replace(/\r/g, '').split('\n'); }

/** Las entradas de primer nivel: id -> { src, tipo, maxStack }. */
function catalogo(txt) {
  const out = {};
  let nivel = 0;
  for (const linea of lineas(txt)) {
    const m = linea.match(/^\s*["']?([A-Za-z0-9_\- ]+)["']?\s*:\s*\{(.*)$/);
    if (m && nivel === 1) {
      const cuerpo = m[2];
      const src = (cuerpo.match(/src\s*:\s*["']([^"']+)["']/) || [])[1] || null;
      const tipo = (cuerpo.match(/tipo\s*:\s*["']([^"']+)["']/) || [])[1] || null;
      const stack = (cuerpo.match(/maxStack\s*:\s*(\d+)/) || [])[1] || null;
      out[m[1].trim()] = { src, tipo, maxStack: stack };
    }
    nivel += (linea.split('{').length - 1) - (linea.split('}').length - 1);
  }
  return out;
}

const G = catalogo(bloque('Scenes/GameScene.js', 'this.ItemDefinitions = {'));
const T = catalogo(bloque('Scenes/tiendajuego.js', 'this.ItemDefinitions = {'));

let fallos = 0, pasadas = 0;
const ok = (c, m, extra) => {
  if (c) { pasadas++; console.log('  OK   ' + m); }
  else { fallos++; console.log('  FALLO ' + m); if (extra) console.log(extra); }
};

console.log('=== CATALOGOS DE OBJETOS ===\n');
console.log('  GameScene   : ' + Object.keys(G).length + ' objetos');
console.log('  tiendajuego : ' + Object.keys(T).length + ' objetos\n');

// 1) Mismos identificadores en las dos copias.
const soloG = Object.keys(G).filter((k) => !(k in T)).sort();
const soloT = Object.keys(T).filter((k) => !(k in G)).sort();

ok(soloG.length === 0,
   'todo objeto de GameScene esta tambien en la tienda',
   soloG.length ? '       faltan en tiendajuego: ' + soloG.join(', ') +
                  '\n       (con uno de estos en el inventario, la tienda deja de pintar\n' +
                  '        desde esa casilla en adelante)' : '');

ok(soloT.length === 0,
   'todo objeto de la tienda esta tambien en GameScene',
   soloT.length ? '       faltan en GameScene: ' + soloT.join(', ') : '');

// 2) Y con los mismos datos: una misma manzana no puede tener dos dibujos
//    ni dos `tipo` distintos (el `tipo` es lo que decide si se acuña en cadena).
const comunes = Object.keys(G).filter((k) => k in T).sort();
const distintos = [];
for (const k of comunes) {
  for (const campo of ['src', 'tipo', 'maxStack']) {
    if (G[k][campo] !== T[k][campo]) {
      distintos.push('       ' + k + '.' + campo + ':  GameScene=' +
                     JSON.stringify(G[k][campo]) + '   tienda=' + JSON.stringify(T[k][campo]));
    }
  }
}
ok(distintos.length === 0,
   'los ' + comunes.length + ' objetos comunes tienen el mismo src, tipo y maxStack',
   distintos.join('\n'));

// 3) Los PNG existen. Una ruta rota no da error: deja el objeto invisible.
console.log('');
const rotas = [];
for (const [nombre, cat] of [['GameScene', G], ['tiendajuego', T]]) {
  for (const k of Object.keys(cat)) {
    const src = cat[k].src;
    if (!src) { rotas.push('       ' + nombre + ' / ' + k + ': sin `src`'); continue; }
    const rel = src.replace(/^\.\//, '').split('?')[0];
    if (!fs.existsSync(path.join(BIN, rel.replace(/\//g, path.sep)))) {
      rotas.push('       ' + nombre + ' / ' + k + ': no existe ' + src);
    }
  }
}
ok(rotas.length === 0,
   'todos los iconos declarados existen en el disco',
   rotas.join('\n'));

// 4) Las dos escenas tienen que pasar por el guardian del icono, no por
//    `ItemDefinitions[...].src` a pelo, que es lo que reventaba el bucle.
console.log('');
for (const rel of ['Scenes/GameScene.js', 'Scenes/tiendajuego.js']) {
  const s = fs.readFileSync(path.join(BIN, rel), 'utf8');
  const aPelo = [];
  /* Con su motivo escrito, como el resto de herramientas de esta carpeta.
     `getItemImage` SI comprueba (`if (this.ItemDefinitions && ...)`) en la
     linea de antes, asi que su lectura es segura; se salta por el texto de la
     linea y no por su numero, para que siga valiendo si el fichero se mueve. */
  const CONOCIDAS = [
    'return this.ItemDefinitions[itemId].src;'   // getItemImage, ya protegida
  ];
  lineas(s).forEach((linea, i) => {
    if (/ItemDefinitions\s*\[[^\]]+\]\s*\.\s*src/.test(linea) &&
        !/^\s*(\*|\/\/)/.test(linea) &&
        CONOCIDAS.indexOf(linea.trim()) < 0) {
      aPelo.push('       ' + rel + ':' + (i + 1) + '  ' + linea.trim());
    }
  });
  ok(aPelo.length === 0,
     path.basename(rel) + ' no lee `ItemDefinitions[...].src` sin comprobar',
     aPelo.join('\n') + (aPelo.length ? '\n       (usa _crearIconoDeItem / _srcDeItem)' : ''));
}

// 5) Y el bucle que pinta todas las casillas tiene que llevar red.
for (const rel of ['Scenes/GameScene.js', 'Scenes/tiendajuego.js']) {
  const s = fs.readFileSync(path.join(BIN, rel), 'utf8');
  const i = s.indexOf('renderAllSlots() {');
  const cuerpo = i >= 0 ? s.slice(i, i + 1600) : '';
  ok(i >= 0 && /try\s*\{\s*this\.renderSlot/.test(cuerpo),
     path.basename(rel) + ': renderAllSlots pinta cada casilla en su propio try',
     '       sin eso, una casilla que falle deja en blanco todas las siguientes');
}

console.log('\n' + '='.repeat(64));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
