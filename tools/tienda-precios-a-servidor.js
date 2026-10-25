#!/usr/bin/env node
/* ===========================================================================
 * LOS PRECIOS DE LA TIENDA, PARA EL SERVIDOR                       (2026-10-22)
 *
 * La comisión del 1,5 % de la tienda del juego va al TESORO (server2.js,
 * "EL TESORO"). El navegador la cobra, pero el servidor NO se fía de cuánto
 * dice que fue: la vuelve a calcular con su propia tabla de precios. Esa
 * tabla sale de aquí, del mismo catálogo que ve el jugador
 * (tienda_sistema.js, `this.itemsTienda`), para que no haya dos verdades.
 *
 * USO (desde bin/):
 *   node tools/tienda-precios-a-servidor.js                 imprime la tabla
 *   node tools/tienda-precios-a-servidor.js <server2.js>    la escribe entre
 *        las marcas  // <TIENDA_PRECIOS>  y  // </TIENDA_PRECIOS>  (con copia
 *        .bak al lado y sin tocar nada más del archivo)
 *   node tools/tienda-precios-a-servidor.js --comprobar <server2.js>
 *        sale con código 1 si la tabla del servidor no es la del catálogo
 *
 * Formato:  { itemId: [precioCompra, precioVenta, 'p' | 'o'] }   (plata / oro)
 * ======================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');

/** El catálogo de la tienda tal cual (es un objeto literal: se evalúa). */
function catalogo(raiz) {
  const src = fs.readFileSync(path.join(raiz || RAIZ, 'tienda_sistema.js'), 'utf8');
  const a = src.indexOf('this.itemsTienda = {');
  if (a < 0) throw new Error('tienda_sistema.js: no encuentro `this.itemsTienda = {`');
  let i = src.indexOf('{', a), d = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function('return ' + src.slice(i, j + 1))();
}

function tabla(raiz) {
  const out = {};
  for (const lista of Object.values(catalogo(raiz))) {
    for (const it of lista) {
      if (!it || !it.id) continue;
      out[it.id] = [Number(it.buyPrice) || 0, Number(it.sellPrice) || 0, it.currency === 'silver' ? 'p' : 'o'];
    }
  }
  return out;
}

function texto(t) {
  return 'const TIENDA_PRECIOS = ' + JSON.stringify(t) + ';';
}

function leerDelServidor(ruta) {
  const s = fs.readFileSync(ruta, 'utf8');
  const m = s.match(/\/\/ <TIENDA_PRECIOS>\r?\n([\s\S]*?)\r?\n\/\/ <\/TIENDA_PRECIOS>/);
  if (!m) return null;
  const t = m[1].trim().replace(/^const TIENDA_PRECIOS = /, '').replace(/;$/, '');
  return JSON.parse(t);
}

function escribir(ruta) {
  const original = fs.readFileSync(ruta, 'utf8');
  const crlf = original.includes('\r\n');
  const fin = crlf ? '\r\n' : '\n';
  const re = /\/\/ <TIENDA_PRECIOS>\r?\n[\s\S]*?\r?\n\/\/ <\/TIENDA_PRECIOS>/;
  if (!re.test(original)) throw new Error(ruta + ': faltan las marcas // <TIENDA_PRECIOS> … // </TIENDA_PRECIOS>');
  const nuevo = original.replace(re, '// <TIENDA_PRECIOS>' + fin + texto(tabla()) + fin + '// </TIENDA_PRECIOS>');
  if (nuevo === original) { console.log('La tabla ya estaba al día.'); return; }
  fs.writeFileSync(ruta + '.bak', original);
  const tmp = ruta + '.tmp';
  fs.writeFileSync(tmp, nuevo);
  fs.renameSync(tmp, ruta);
  console.log('Tabla de precios escrita en ' + ruta + ' (copia en .bak).');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--comprobar') {
    const ruta = args[1];
    const servidor = ruta ? leerDelServidor(ruta) : null;
    const local = tabla();
    const igual = servidor && JSON.stringify(servidor) === JSON.stringify(local);
    console.log(igual ? 'OK: la tabla del servidor es la del catálogo.' : 'DISTINTA: ejecuta  node tools/tienda-precios-a-servidor.js ' + (ruta || '<server2.js>'));
    process.exit(igual ? 0 : 1);
  } else if (args[0]) {
    escribir(args[0]);
  } else {
    console.log(texto(tabla()));
  }
}

module.exports = { catalogo, tabla, texto, leerDelServidor };
