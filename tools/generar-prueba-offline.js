/* Genera _prueba_offline.html: el index.html de verdad con el backend de
 * mentira (_prueba_offline_mock.js) cargado ANTES que nada.
 *
 * Se genera en vez de copiarse a mano para que nunca se quede atrás: cada vez
 * que cambie index.html basta con volver a correr esto.
 *
 *   node tools/generar-prueba-offline.js  [carpeta bin]
 *
 * Luego, con el servidor estático de siempre (python -m http.server 8123):
 *   http://localhost:8123/_prueba_offline.html
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const html = fs.readFileSync(path.join(BIN, 'index.html'), 'utf8');

const MARCA = '<head>';
const i = html.indexOf(MARCA);
if (i < 0) { console.error('index.html sin <head>'); process.exit(1); }

let inyectado = html.slice(0, i + MARCA.length) +
  '\n  <!-- PRUEBA SIN SERVIDOR: generado por tools/generar-prueba-offline.js. NO subir. -->' +
  '\n  <script src="./_prueba_offline_mock.js"></script>' +
  html.slice(i + MARCA.length);

// Rompe-caché: el navegador guarda los .js del juego aunque cambien, y la
// prueba tiene que correr SIEMPRE la versión que hay en disco.
const sello = Date.now().toString(36);
inyectado = inyectado.replace(/(<script\s+src="(?!https?:)[^"?]+\.js)(\?[^"]*)?"/g,
  (m, a, q) => a + (q ? q + '&' : '?') + 'nc=' + sello + '"');

fs.writeFileSync(path.join(BIN, '_prueba_offline.html'), inyectado);
console.log('Generado _prueba_offline.html (' + inyectado.length + ' bytes)');
