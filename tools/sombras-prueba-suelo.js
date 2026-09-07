/* Una sombra NUNCA puede quedar por encima de su bicho.
 *
 * EL FALLO QUE VIGILA — "las sombras de los cuervos estan arriba del cuervo":
 *
 * Las dos rutinas de sombra (gf-cuervo y gf-animales) hacian lo mismo:
 *
 *     if (!alto) sombraSuelo = spr.y;        // recuerda el ultimo suelo
 *     var y = alto ? sombraSuelo : spr.y;
 *
 * O sea que mientras el bicho estaba en alto —volando o POSADO— la sombra se
 * quedaba en la ultima Y que hubiera tenido a ras de suelo. En pantalla la Y
 * crece hacia abajo, asi que en cuanto el bicho se movia hacia ABAJO su Y
 * pasaba de largo a la de la sombra y la sombra quedaba DIBUJADA ENCIMA DE EL.
 *
 * En el cuervo era peor porque nace POSADO en un arbol y `sombraSuelo`
 * arrancaba valiendo la Y de la COPA: la sombra empezaba ya a la altura de la
 * rama.
 *
 * Esta prueba saca las rutinas de sombra DE LOS FUENTES DE VERDAD y las somete
 * a los recorridos que hacen los bichos: nacer posado, volar hacia abajo, volar
 * hacia arriba, aterrizar, andar. En ninguno la sombra puede acabar por encima.
 *
 *   node tools/sombras-prueba-suelo.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');

/** Saca una funcion entera contando llaves desde su cabecera. */
function fn(txt, cabecera) {
  const i = txt.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  const j = txt.indexOf('{', i);
  let nivel = 0, k = j;
  for (; k < txt.length; k++) {
    if (txt[k] === '{') nivel++;
    else if (txt[k] === '}') { nivel--; if (nivel === 0) break; }
  }
  return txt.slice(i, k + 1);
}

/** Una elipse de mentira, con lo que las rutinas le piden. */
function elipse() {
  return {
    x: 0, y: 0, depth: 0, alpha: 1, width: 20, visible: true, scaleX: 1,
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setDepth(d) { this.depth = d; return this; },
    setAlpha(a) { this.alpha = a; return this; },
    setScale(s) { this.scaleX = s; return this; },
    setSize(w, h) { this.width = w; this.height = h; return this; },
    setVisible(v) { this.visible = v; return this; }
  };
}

/** Una escena con arboles: cada arbol es una propiedad, con origen (0,1). */
function escena(arboles) {
  const s = {};
  for (const [clave, pieY] of Object.entries(arboles)) {
    s[clave] = { y: pieY, rotation: 0, depth: pieY };
  }
  return s;
}

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); } };

// ═══════════════════════════════════════════════════════════ EL CUERVO
console.log('=== gf-cuervo ===\n');
{
  const src = fs.readFileSync(path.join(BIN, 'gf-cuervo.js'), 'utf8');
  const piezas = [
    fn(src, 'function pieDelSoporte(scene, clave, porDefecto) {'),
    fn(src, 'function actualizarSombraCuervo(c) {')
  ];
  const mod = new Function(piezas.join('\n') +
                           '\nreturn { pie: pieDelSoporte, sombra: actualizarSombraCuervo };')();

  const sc = escena({ arbol_alto: 400, arbol_bajo: 1600 });
  // Nace posado en la copa del arbol de arriba (copa a 240, pie a 400).
  const c = {
    spr: { x: 100, y: 240, scene: sc },
    sombra: elipse(),
    fase: 'posado',
    arbol: 'arbol_alto',
    sombraSuelo: mod.pie(sc, 'arbol_alto', 240)
  };

  mod.sombra(c);
  ok(c.sombra.y >= c.spr.y, 'recien nacido y posado, la sombra NO esta encima',
     'sombra en y=' + c.sombra.y + ', cuervo en y=' + c.spr.y);
  ok(c.sombra.y === 400, 'y esta al PIE del arbol (400), no en la rama (240)', 'y=' + c.sombra.y);

  // Vuela al arbol de abajo: copa a 1440, pie a 1600. Es el caso que fallaba.
  c.fase = 'volando';
  c.arbol = 'arbol_bajo';
  c.destino = { x: 900, y: 1440 };
  c.sueloDesde = 400;
  c.sueloHasta = mod.pie(sc, 'arbol_bajo', 1440);
  c.vueloDist = Math.hypot(900 - 100, 1440 - 240);

  let peor = -Infinity, pasos = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    c.spr.x = 100 + (900 - 100) * t;
    c.spr.y = 240 + (1440 - 240) * t;
    mod.sombra(c);
    peor = Math.max(peor, c.spr.y - c.sombra.y);   // >0 = sombra por encima
    pasos++;
  }
  ok(peor <= 0, 'durante TODO el vuelo hacia abajo la sombra sigue por debajo (' +
                pasos + ' pasos)',
     'en el peor punto quedaba ' + peor.toFixed(0) + ' px por encima');

  // Aterriza y se posa.
  c.fase = 'posado'; c.spr.x = 900; c.spr.y = 1440;
  c.sombraSuelo = mod.pie(sc, 'arbol_bajo', 1440);
  mod.sombra(c);
  ok(c.sombra.y === 1600, 'ya posado, la sombra esta al pie del arbol nuevo', 'y=' + c.sombra.y);

  // Baja a andar por el suelo.
  c.fase = 'camina'; c.spr.y = 1700;
  mod.sombra(c);
  ok(c.sombra.y === 1700, 'andando, la sombra va justo bajo sus patas', 'y=' + c.sombra.y);

  // Y la red: aunque el suelo recordado sea una barbaridad, no puede subir.
  c.fase = 'posado'; c.arbol = null; c.sombraSuelo = -5000; c.spr.y = 800;
  mod.sombra(c);
  ok(c.sombra.y >= c.spr.y,
     'con un suelo recordado absurdo, la red lo deja a sus pies', 'y=' + c.sombra.y);
}

// ═══════════════════════════════════════════════════════════ LAS AVES
console.log('\n=== gf-animales ===\n');
{
  const src = fs.readFileSync(path.join(BIN, 'gf-animales.js'), 'utf8');
  const piezas = [
    'var SOMBRA_ALFA = 0.26;',
    'var SOMBRA_POR_ESPECIE = {}, SOMBRA_POR_GRUPO = { tierra: { dy: 2, alto: 0.4, alfa: 1, ancho: 0.8 } };',
    fn(src, 'function pieDelSoporte(scene, clave, porDefecto) {'),
    fn(src, 'function fichaSombra(a) {'),
    fn(src, 'function anchoSombra(a) {'),
    fn(src, 'function actualizarSombra(a) {')
  ];
  const mod = new Function(piezas.join('\n') +
                           '\nreturn { pie: pieDelSoporte, sombra: actualizarSombra };')();

  const sc = escena({ arbol_arriba: 300, arbol_abajo: 1900 });
  const a = {
    spr: { x: 50, y: 150, scene: sc, displayWidth: 24, visible: true },
    sombra: elipse(), fase: 'posado', grupo: 'tierra', especie: 'pajaro',
    soporte: 'arbol_arriba', hw: 12,
    sombraSuelo: mod.pie(sc, 'arbol_arriba', 150)
  };

  mod.sombra(a);
  ok(a.sombra.y >= a.spr.y, 'posada en la copa, la sombra NO esta encima',
     'sombra y=' + a.sombra.y + ', ave y=' + a.spr.y);
  ok(a.sombra.y === 300, 'esta al pie del arbol (300), no en la rama (150)', 'y=' + a.sombra.y);

  // El vuelo largo hacia abajo, que es el que se veia mal.
  a.fase = 'volando';
  a.soporte = 'arbol_abajo';
  a.destino = { x: 1200, y: 1750 };
  a.sueloDesde = 300;
  a.sueloHasta = mod.pie(sc, 'arbol_abajo', 1750);
  a.vueloDist = Math.hypot(1200 - 50, 1750 - 150);

  let peor = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    a.spr.x = 50 + (1200 - 50) * t;
    a.spr.y = 150 + (1750 - 150) * t;
    mod.sombra(a);
    peor = Math.max(peor, a.spr.y - a.sombra.y);
  }
  ok(peor <= 0, 'durante TODO el vuelo hacia abajo la sombra sigue por debajo',
     'en el peor punto quedaba ' + peor.toFixed(0) + ' px por encima');

  // Vuelo hacia ARRIBA: la sombra se queda abajo, que es lo que da altura.
  a.fase = 'volando';
  a.destino = { x: 50, y: 200 };
  a.sueloDesde = 1900; a.sueloHasta = 300;
  a.vueloDist = Math.hypot(50 - 1200, 200 - 1750);
  a.spr.x = 700; a.spr.y = 1000;
  mod.sombra(a);
  ok(a.sombra.y > a.spr.y, 'volando hacia arriba, la sombra se queda ABAJO (da altura)',
     'sombra y=' + a.sombra.y.toFixed(0) + ', ave y=' + a.spr.y);

  // En el suelo, andando.
  a.fase = 'camina'; a.spr.y = 2000;
  mod.sombra(a);
  ok(a.sombra.y >= a.spr.y, 'andando, la sombra va a sus pies', 'y=' + a.sombra.y);

  // Banandose: sin sombra, como estaba.
  a.fase = 'bana';
  mod.sombra(a);
  ok(a.sombra.visible === false, 'banandose sigue sin sombra (eso no se ha tocado)');

  // La red.
  a.fase = 'posado'; a.soporte = null; a.sombraSuelo = -9999; a.spr.y = 600;
  a.sombra.setVisible(true);
  mod.sombra(a);
  ok(a.sombra.y >= a.spr.y, 'con un suelo absurdo, la red la deja a sus pies', 'y=' + a.sombra.y);
}

console.log('\n' + '='.repeat(64));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
