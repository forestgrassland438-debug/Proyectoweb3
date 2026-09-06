/* Quita los comentarios de un fuente dejando los MISMOS saltos de línea, para
 * que los números de línea del informe sigan cuadrando con el fichero.
 *
 * POR QUÉ HACE FALTA: sin esto, las herramientas de este directorio avisaban de
 * código comentado. En GameScene hay un bloque entero de "movimiento por clic"
 * dentro de un comentario, con tres llamadas a métodos que no existen; y en
 * tiendajuego hay dos `getElementById('hubdia-text').textContent = …` sin
 * proteger, también comentados. Nada de eso se ejecuta, y sacarlo en el informe
 * solo consigue que nadie se fíe del informe.
 *
 * LAS CADENAS NO SE TOCAN, A PROPÓSITO. Al intentarlo, un literal de expresión
 * regular como /['"]/ abría una cadena falsa que se tragaba el resto del
 * fichero y con él las definiciones: los sospechosos pasaban de 17 a 90. Una
 * cadena que contenga `this.algo(` o `getElementById('x')` es rarísima; una
 * expresión regular con comillas dentro, no.
 *
 * Sirve igual para .js y para el <script> de un .html.
 */
'use strict';

function sinComentarios(txt) {
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

/** Y los comentarios de HTML, que son otros. */
function sinComentariosHtml(txt) {
  return txt.replace(/<!--[\s\S]*?-->/g, function (m) {
    return m.replace(/[^\n]/g, ' ');       // se conservan los saltos de línea
  });
}

module.exports = { sinComentarios: sinComentarios, sinComentariosHtml: sinComentariosHtml };
