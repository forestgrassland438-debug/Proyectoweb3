/* La escalera de buffers de PreFX: 400 MB reservados para nada.
 *
 * DE DONDE SALEN LOS 400 MB DE MAS
 * --------------------------------
 * Phaser reserva AL ARRANCAR, y por defecto, una escalera entera de buffers de
 * dibujo para los efectos "PreFX". En `PipelineManager.boot()` (phaser 3.90):
 *
 *     var qty = Math.ceil(Math.min(ancho, alto) / 32);
 *     for (var i = 1; i < qty; i++) {
 *         targets.push(new RenderTarget(r, i*32, i*32));   // y dos copias mas
 *     }
 *     // y tres mas a pantalla completa
 *
 * O sea 32x32, 64x64, 96x96... hasta el lado menor de la pantalla, TRES copias
 * de cada una. Y el juego renderiza a `tamaño CSS x floor(devicePixelRatio)`
 * (ver `_gameSize` en app.js), asi que el coste crece con el CUBO de la
 * resolucion: doblar el dpr no lo dobla, lo multiplica por siete.
 *
 * El juego NO USA PREFX en ningun sitio — el unico efecto que hay es
 * `cam.postFX.addColorMatrix()` en gf-muerte.js, y PostFX se crea su propio
 * buffer (`config.renderTarget = 1`) sin tocar esta escalera. Por eso
 * `disablePreFX: true` no cambia nada de lo que se ve.
 *
 * Esta herramienta comprueba las dos cosas: que la bandera sigue puesta y que
 * nadie ha empezado a usar preFX (que la haria falsa).
 *
 *   node tools/vram-prefx.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const { sinComentarios, sinComentariosHtml } = require('./_sin-comentarios.js');

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m); if (x) console.log(x); } };

/** Lo que cuesta la escalera de PreFX a una resolucion dada. */
function costeEscalera(ancho, alto, frameInc) {
  frameInc = frameInc || 32;
  const qty = Math.ceil(Math.min(ancho, alto) / frameInc);
  let px = 0;
  for (let i = 1; i < qty; i++) { const t = i * frameInc; px += 3 * t * t; }
  return px * 4;                                  // RGBA, 4 bytes por pixel
}
/** Y los tres buffers a pantalla completa que van con ella. */
function costePantallaCompleta(ancho, alto) { return 3 * ancho * alto * 4; }

const MB = (b) => b / 1048576;

// ── Ficheros del proyecto ────────────────────────────────────────────────────
function ficherosJs() {
  const out = [];
  (function anda(dir) {
    for (const n of fs.readdirSync(dir)) {
      if (['temp_old', 'node_modules', '.git', 'tools'].includes(n)) continue;
      const p = path.join(dir, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) anda(p);
      else if (n.endsWith('.js') || n.endsWith('.html')) out.push(p);
    }
  })(BIN);
  return out;
}

console.log('=== LA ESCALERA DE BUFFERS DE PREFX ===\n');

// 1) La bandera esta puesta en la configuracion del juego.
{
  const app = sinComentarios(fs.readFileSync(path.join(BIN, 'app.js'), 'utf8'));
  ok(/disablePreFX\s*:\s*true/.test(app),
     'app.js pasa `disablePreFX: true` a Phaser',
     '       sin esto Phaser reserva la escalera entera al arrancar');
  ok(!/disablePostFX\s*:\s*true/.test(app),
     'y NO desactiva PostFX, que si se usa (gf-postproceso y gf-muerte)');
}

// 2) Nadie usa preFX: si alguien empieza, la bandera pasa a ser un fallo.
{
  const PRE = /\.preFX\b|setPreFX\s*\(/;
  const culpables = [];
  for (const p of ficherosJs()) {
    const crudo = fs.readFileSync(p, 'utf8');
    const txt = p.endsWith('.html') ? sinComentariosHtml(crudo) : sinComentarios(crudo);
    txt.replace(/\r/g, '').split('\n').forEach((l, i) => {
      if (PRE.test(l)) culpables.push('       ' + path.relative(BIN, p).replace(/\\/g, '/') +
                                      ':' + (i + 1) + '  ' + l.trim().slice(0, 90));
    });
  }
  ok(culpables.length === 0,
     'nadie usa `preFX` (por eso apagarlo no quita nada de lo que se ve)',
     culpables.join('\n') +
     '\n       Si esto se quiere de verdad, hay que quitar `disablePreFX: true`\n' +
     '       de app.js Y poner GF_MAX_DPR = 2, porque el coste es el de abajo.');
}

// 3) Y el tamaño interno sigue siendo CSS x floor(dpr), que es lo que multiplica.
{
  const app = sinComentarios(fs.readFileSync(path.join(BIN, 'app.js'), 'utf8'));
  ok(/GF_MAX_DPR/.test(app),
     'existe la palanca GF_MAX_DPR para poner techo a la resolucion interna');
}

// ── La tabla, para que el numero se vea ──────────────────────────────────────
console.log('\n  Lo que costaria la escalera si estuviera encendida');
console.log('  (ventana de 1600x900, que es lo normal en un portatil):\n');
const col = (t, n) => String(t).padStart(n);
const izq = (t, n) => String(t).padEnd(n);
console.log('  ' + izq('dpr', 5) + izq('interna', 14) +
            col('escalera MB', 14) + col('pant.completa MB', 18) + col('TOTAL MB', 12));
for (const dpr of [1, 2, 3]) {
  const w = 1600 * dpr, h = 900 * dpr;
  const e = costeEscalera(w, h), f = costePantallaCompleta(w, h);
  console.log('  ' + izq(dpr, 5) + izq(w + 'x' + h, 14) +
              col(MB(e).toFixed(1), 14) + col(MB(f).toFixed(1), 18) +
              col(MB(e + f).toFixed(1), 12));
}
console.log('\n  Con `disablePreFX: true` todo eso es CERO. Lo unico que se reserva');
console.log('  es un buffer a pantalla completa por cada PostFX activo, que es');
console.log('  lo que de verdad hace falta.');

console.log('\n' + '='.repeat(66));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
