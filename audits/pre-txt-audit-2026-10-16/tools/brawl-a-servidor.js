#!/usr/bin/env node
/**
 * brawl-a-servidor.js — copia gf-brawl-motor.js dentro de server2.js
 * ===========================================================================
 *
 *   node tools/brawl-a-servidor.js                 (server2.js del Escritorio)
 *   node tools/brawl-a-servidor.js <ruta/server2.js>
 *   node tools/brawl-a-servidor.js --comprobar [ruta]   solo dice si casan
 *
 * POR QUÉ UNA COPIA Y NO UN require()
 * ---------------------------------------------------------------------------
 * El backend se despliega como UN archivo (server2.js) en Render/Railway. Un
 * require('./gf-brawl-motor.js') obligaría a acordarse de subir otro archivo
 * más, y si se olvida el servidor no arranca. Con la copia dentro, server2.js
 * sigue valiendo solo.
 *
 * El precio es que hay dos copias. Por eso esto es lo ÚNICO que las toca: se
 * edita gf-brawl-motor.js y se lanza esto. tools/brawl-prueba-motor.js avisa
 * si alguna vez dejan de ser iguales.
 *
 * CÓMO ESCRIBE (ver la memoria "editar-server2")
 * ---------------------------------------------------------------------------
 * server2.js mezcla finales de línea CRLF y LF y ha tenido sustitutos UTF-16
 * sueltos: leerlo como texto y volver a escribirlo puede cambiar miles de
 * líneas o dejarlo a cero bytes. Aquí se trabaja con BYTES: se buscan las dos
 * marcas, se sustituye lo de en medio y nada más. Antes se hace una copia
 * (.bak-motor-<fecha>), se escribe a un .tmp, se comprueba que el resultado
 * compila (vm.Script) y no ha encogido de forma rara, y solo entonces se
 * renombra encima.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');

const BIN = path.resolve(__dirname, '..');
const MOTOR = path.join(BIN, 'gf-brawl-motor.js');
const INICIO = Buffer.from('// <<BRAWL-MOTOR-INICIO>>');
const FIN = Buffer.from('// <<BRAWL-MOTOR-FIN>>');

function rutaServidor(arg) {
  if (arg) return path.resolve(arg);
  return path.join(os.homedir(), 'Desktop', 'server2.js');
}

/** El bloque que va entre las marcas (con el final de línea del servidor). */
function bloque(eol) {
  const motor = fs.readFileSync(MOTOR, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const lineas = [
    '// <<BRAWL-MOTOR-INICIO>>',
    '// Copia de gf-brawl-motor.js (el juego). NO SE EDITA AQUÍ: se cambia aquel',
    '// archivo y se copia con `node tools/brawl-a-servidor.js`.',
    'const GFBrawlMotor = (function () {',
    '  const module = { exports: {} };',
    motor,
    '  return module.exports;',
    '})();',
    '// <<BRAWL-MOTOR-FIN>>'
  ];
  return Buffer.from(lineas.join('\n').replace(/\n/g, eol), 'utf8');
}

/** Lo que hay ahora entre las marcas, como texto del motor (sin envoltorio). */
function motorIncrustado(buf) {
  const a = buf.indexOf(INICIO);
  const b = buf.indexOf(FIN);
  if (a < 0 || b < 0 || b < a) return null;
  return buf.slice(a, b + FIN.length).toString('utf8').replace(/\r\n/g, '\n');
}

function comprobar(ruta) {
  const buf = fs.readFileSync(ruta);
  const dentro = motorIncrustado(buf);
  if (dentro == null) return { ok: false, motivo: 'server2.js no tiene las marcas <<BRAWL-MOTOR-INICIO>>/<<BRAWL-MOTOR-FIN>>' };
  const esperado = bloque('\n').toString('utf8');
  if (dentro !== esperado) return { ok: false, motivo: 'la copia del motor en server2.js NO es gf-brawl-motor.js: lanza `node tools/brawl-a-servidor.js`' };
  return { ok: true };
}

function escribir(ruta) {
  const buf = fs.readFileSync(ruta);
  const a = buf.indexOf(INICIO);
  const b = buf.indexOf(FIN);
  if (a < 0 || b < 0 || b < a) throw new Error('No están las marcas del motor en ' + ruta);
  // El final de línea que manda alrededor de la marca.
  const trasMarca = buf.slice(b + FIN.length, b + FIN.length + 2).toString('latin1');
  const eol = trasMarca.startsWith('\r\n') ? '\r\n' : '\n';
  const nuevo = Buffer.concat([buf.slice(0, a), bloque(eol), buf.slice(b + FIN.length)]);
  if (Buffer.compare(nuevo, buf) === 0) { console.log('server2.js ya tenía este motor; nada que hacer.'); return; }

  // ¿Compila?
  try { new vm.Script(nuevo.toString('utf8'), { filename: 'server2.js' }); }
  catch (e) { throw new Error('El resultado no compila; NO se escribe nada. ' + e.message); }
  // ¿Ha encogido de forma rara? (el motor no pasa de unos 60 KB)
  if (nuevo.length < buf.length - 80 * 1024) throw new Error('El resultado encoge demasiado; NO se escribe nada.');

  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  fs.copyFileSync(ruta, ruta + '.bak-motor-' + sello);
  fs.writeFileSync(ruta + '.tmp', nuevo);
  fs.renameSync(ruta + '.tmp', ruta);
  console.log('Motor copiado en ' + ruta + ' (' + buf.length + ' → ' + nuevo.length + ' bytes; copia en .bak-motor-' + sello + ')');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const soloComprobar = args[0] === '--comprobar';
  const ruta = rutaServidor(soloComprobar ? args[1] : args[0]);
  if (!fs.existsSync(ruta)) { console.error('No existe ' + ruta); process.exit(2); }
  if (soloComprobar) {
    const r = comprobar(ruta);
    console.log(r.ok ? 'OK: server2.js lleva el mismo motor que gf-brawl-motor.js' : 'FALLO: ' + r.motivo);
    process.exit(r.ok ? 0 : 1);
  }
  try { escribir(ruta); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { bloque, comprobar, escribir, motorIncrustado };
