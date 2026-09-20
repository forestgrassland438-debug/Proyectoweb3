#!/usr/bin/env node
/**
 * =============================================================================
 * MINA — banco de pruebas del mapa
 * =============================================================================
 *
 * Corre con:  node tools/mina-prueba.js
 *
 * QUE COMPRUEBA Y POR QUE
 * ---------------------------------------------------------------------------
 * Un mapa generado por un script puede estar perfectamente bien formado y ser
 * INJUGABLE: que el punto de aparicion caiga dentro de la roca, que una sala
 * quede aislada porque la galeria no llego a abrirse, o que la salida quede al
 * otro lado de un lago de lava. Nada de eso da error en ningun sitio: el juego
 * arranca, se ve bonito, y el jugador se queda encerrado.
 *
 * Por eso estas pruebas no miran el JSON: SIMULAN andar. Hacen una inundacion
 * desde donde aparece el jugador usando las mismas casillas que el juego deja
 * pisar, y exigen que se llegue a la salida, a las nueve salas y a todos los
 * puntos de mineral.
 *
 * UNA PRUEBA QUE PASA CON EL FALLO PUESTO NO VALE
 * ---------------------------------------------------------------------------
 * Todas las comprobaciones de aqui se vieron FALLAR antes de darlas por buenas
 * (tapando a mano la galeria de las profundidades, moviendo la aparicion a la
 * roca). Si alguna no es capaz de fallar, sobra.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.dirname(__dirname);
const MAPA = path.join(RAIZ, 'Maps', 'mina.json');
const FICHA = path.join(RAIZ, 'Game', 'MAPAS', 'Mina', 'tileset_mina.json');

let fallos = 0;
let pruebas = 0;

function comprueba(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) {
    console.log('  OK   ' + nombre);
  } else {
    fallos++;
    console.log('  FALLA ' + nombre + (detalle ? '\n        ' + detalle : ''));
  }
}

// ---------------------------------------------------------------------------

const mapa = JSON.parse(fs.readFileSync(MAPA, 'utf8'));
const ficha = JSON.parse(fs.readFileSync(FICHA, 'utf8'));
const W = mapa.width;
const H = mapa.height;
const TILE = mapa.tilewidth;

const capas = {};
mapa.layers.forEach(l => { capas[l.name] = l; });

console.log('\n=== FORMA DEL MAPA ===\n');

// 157 x 32 = 5024 px, practicamente los 5008 de mapa_principal. Lo que
// cambia frente a la primera version no es el tamano del MUNDO sino el de la
// CASILLA: de 16 a 32, porque el personaje mide 46x102 y con casillas de 16
// todo lo que ocupaba una salia a la sexta parte de su altura.
comprueba('casillas de 32 px y mundo del tamano de mapa_principal',
  W === 157 && H === 157 && TILE === 32 && mapa.tileheight === 32 &&
  Math.abs(W * TILE - 5008) < 32,
  `es ${W}x${H} de ${TILE}px = ${W * TILE}px`);

comprueba('es ortogonal y no infinito',
  mapa.orientation === 'orthogonal' && mapa.infinite === false);

comprueba('lleva UN solo tileset y va embebido (sin .tsx externos)',
  mapa.tilesets.length === 1 && !mapa.tilesets[0].source,
  JSON.stringify(mapa.tilesets.map(t => t.source || t.name)));

const ts = mapa.tilesets[0];
const rutaImagen = path.resolve(path.dirname(MAPA), ts.image);
comprueba('la imagen del tileset existe donde dice el mapa',
  fs.existsSync(rutaImagen), ts.image + ' -> ' + rutaImagen);

comprueba('el tileset del mapa y el generado tienen los mismos tiles',
  ts.tilecount === ficha.tiles && ts.columns === ficha.columnas,
  `mapa: ${ts.tilecount}/${ts.columns}  ficha: ${ficha.tiles}/${ficha.columnas}`);

const capaMina = capas['mina'];
comprueba('la capa de suelo existe y esta completa',
  capaMina && capaMina.data && capaMina.data.length === W * H,
  capaMina ? String(capaMina.data.length) : 'no existe');

const gidMax = ts.firstgid + ts.tilecount - 1;
const fuera = capaMina.data.filter(g => g !== 0 && (g < ts.firstgid || g > gidMax));
comprueba('ningun gid de la capa de suelo se sale del tileset',
  fuera.length === 0, fuera.slice(0, 5).join(', '));

const huecosSuelo = capaMina.data.filter(g => g === 0).length;
comprueba('la capa de suelo no tiene agujeros',
  huecosSuelo === 0, huecosSuelo + ' casillas vacias');

// La capa de sombras: es lo que separa la pared del suelo a la vista. Si
// faltara, las paredes volverian a verse "pegadas al suelo".
comprueba('existe la capa de sombras y tiene contenido',
  !!capas['mina_sombras'] && capas['mina_sombras'].data.filter(Boolean).length > 500,
  capas['mina_sombras'] ? String(capas['mina_sombras'].data.filter(Boolean).length) : 'no existe');

// El muro tiene que ser de VARIAS filas o vuelve a medir 16 px contra un
// personaje de 102.
// El personaje mide 102 px. Un muro tiene que acercarse a eso o se lee como
// un bordillo, que es de lo que se quejaba la primera version (16 px).
comprueba('el muro llega a los 96 px (el personaje mide 102)',
  ficha.muro && ficha.muro.alto_px >= 90 && ficha.muro.alto_px <= 128,
  JSON.stringify(ficha.muro && { alto: ficha.muro.alto_tiles, px: ficha.muro.alto_px }));

// Y las piezas grandes tienen que estar en la liga del personaje, no en la de
// un cascote: en el mapa de fuera una piedra normal ocupa 74x60 px.
const medidas = ficha.piezas_grandes.medidas;
// Se mira el lado LARGO: una antorcha de pared mide 32x64 y esta bien asi
// (es alta y estrecha). Lo que no puede haber es una pieza que quepa entera
// en una casilla, porque entonces no es una pieza.
const pequenas = Object.keys(medidas)
  .filter(k => Math.max(medidas[k].px[0], medidas[k].px[1]) < 64);
comprueba('ninguna pieza grande cabe en una sola casilla',
  pequenas.length === 0, 'demasiado pequenas: ' + pequenas.join(', '));

// Las piezas ALTAS tienen que salir como objetos (sprites en 2.5D), no como
// tiles: en una capa de tiles el jugador nunca puede pasar por detras.
const piezas = capas['piezas'];
const altas = Object.keys(ficha.piezas_grandes.medidas)
  .filter(k => ficha.piezas_grandes.medidas[k].alta);
comprueba('hay piezas altas declaradas en el tileset',
  altas.length >= 8, altas.length + ' altas: ' + altas.slice(0, 5).join(', '));
comprueba('las piezas altas se colocan como OBJETOS, para el 2.5D',
  !!piezas && piezas.objects.length > 10,
  piezas ? piezas.objects.length + ' objetos' : 'no hay capa piezas');
comprueba('toda pieza colocada existe en el atlas',
  !!piezas && piezas.objects.every(o => !o.name || altas.indexOf(o.name) >= 0),
  piezas ? (piezas.objects.filter(o => o.name && altas.indexOf(o.name) < 0)
            .map(o => o.name).slice(0, 4).join(', ') || 'todas ok') : '');

const capaObj = capas['mina_objetos'];
comprueba('la capa de objetos existe y no se sale del tileset',
  capaObj && capaObj.data.length === W * H &&
  capaObj.data.every(g => g === 0 || (g >= ts.firstgid && g <= gidMax)));

console.log('\n=== CAPAS QUE LA ESCENA BUSCA POR SU NOMBRE ===\n');

// Si uno de estos nombres no coincide, MinaScene no encuentra la capa y no
// da error: simplemente la mina se queda sin colisiones, o sin salida, o sin
// lava. Es el fallo silencioso tipico de este proyecto.
['area_colision_general', 'area_lava', 'area_lava_interior',
 'area_agua', 'area_agua_interior', 'area_salida_mina',
 'aparicion', 'puntos_mineral', 'antorchas', 'vigas', 'piezas'].forEach(n => {
  comprueba('existe la capa "' + n + '"', !!capas[n]);
});

console.log('\n=== SE PUEDE ANDAR POR AHI ===\n');

// Reconstruir que casillas son pisables a partir de los MISMOS rectangulos de
// colision que usa el juego. No se mira la rejilla de materiales del generador
// a proposito: lo que frena al jugador son estos rectangulos, y son ellos los
// que hay que comprobar.
const bloqueado = new Uint8Array(W * H);
capas['area_colision_general'].objects.forEach(o => {
  const x0 = Math.floor(o.x / TILE), y0 = Math.floor(o.y / TILE);
  const x1 = Math.ceil((o.x + o.width) / TILE), y1 = Math.ceil((o.y + o.height) / TILE);
  for (let y = y0; y < y1 && y < H; y++) {
    for (let x = x0; x < x1 && x < W; x++) {
      if (x >= 0 && y >= 0) bloqueado[y * W + x] = 1;
    }
  }
});

// El umbral va en PROPORCION, no en un numero suelto: al pasar de casillas
// de 16 a casillas de 32 el mapa paso de 97.969 a 24.649 y un umbral fijo de
// 15.000 fallaba con un mapa perfectamente bien.
const pisables = bloqueado.reduce((n, v) => n + (v ? 0 : 1), 0);
comprueba('hay sitio por donde andar',
  pisables > W * H * 0.20,
  `${pisables} libres de ${W * H} (${(100 * pisables / (W * H)).toFixed(0)} %)`);

const ap = capas['aparicion'].objects[0];
const apX = Math.floor(ap.x / TILE);
const apY = Math.floor(ap.y / TILE);
comprueba('el punto de aparicion NO esta dentro de la roca',
  bloqueado[apY * W + apX] === 0,
  `aparicion en la casilla (${apX}, ${apY})`);

// Inundacion en 4 direcciones desde la aparicion. Cuatro y no ocho: el jugador
// no puede colarse por una diagonal entre dos esquinas de roca, asi que
// contarlas daria por alcanzables sitios a los que no se llega.
const visto = new Uint8Array(W * H);
const cola = new Int32Array(W * H);
let cab = 0, fin = 0;
cola[fin++] = apY * W + apX;
visto[apY * W + apX] = 1;
while (cab < fin) {
  const i = cola[cab++];
  const x = i % W, y = (i / W) | 0;
  if (x > 0 && !visto[i - 1] && !bloqueado[i - 1]) { visto[i - 1] = 1; cola[fin++] = i - 1; }
  if (x < W - 1 && !visto[i + 1] && !bloqueado[i + 1]) { visto[i + 1] = 1; cola[fin++] = i + 1; }
  if (y > 0 && !visto[i - W] && !bloqueado[i - W]) { visto[i - W] = 1; cola[fin++] = i - W; }
  if (y < H - 1 && !visto[i + W] && !bloqueado[i + W]) { visto[i + W] = 1; cola[fin++] = i + W; }
}
const alcanzadas = visto.reduce((n, v) => n + v, 0);

// Se exige el 100 %: el generador sella las bolsas sin salida (ver el paso 4c
// de generar-mina-mapa.py), asi que si aparece UNA casilla suelta es que algo
// se abrio despues de sellar.
comprueba('no queda ni una casilla en una bolsa sin salida',
  alcanzadas === pisables,
  `alcanzadas ${alcanzadas} de ${pisables} (${(100 * alcanzadas / pisables).toFixed(1)} %)`);

// La salida. Basta con que UNA casilla de su rectangulo sea alcanzable: si no,
// el jugador entra en la mina y no puede volver.
const salida = capas['area_salida_mina'].objects[0];
let salidaOk = false;
for (let y = Math.floor(salida.y / TILE); y < Math.ceil((salida.y + salida.height) / TILE); y++) {
  for (let x = Math.floor(salida.x / TILE); x < Math.ceil((salida.x + salida.width) / TILE); x++) {
    if (x >= 0 && y >= 0 && x < W && y < H && visto[y * W + x]) salidaOk = true;
  }
}
comprueba('SE PUEDE VOLVER: la salida es alcanzable a pie', salidaOk);

// Las nueve salas. El centro de cada una tiene que ser alcanzable o esa sala
// esta amurallada y el jugador nunca la vera.
// En casillas de 32, las mismas que usa generar-mina-mapa.py.
const SALAS = {
  entrada: [78, 16], cruce_norte: [78, 42], piedra_oeste: [29, 49],
  cobre_este: [126, 49], cristales: [78, 76], hierro_oeste: [28, 100],
  carbon_este: [127, 100], cruce_sur: [78, 112], profundidades: [78, 136]
};
// OJO: NO se mira la casilla exacta del centro.
//
// La primera version de esta prueba lo hacia, y fallaba en tres salas... pero
// el mapa estaba bien. El centro de las profundidades cae DENTRO de un lago de
// lava, y la lava esta bloqueada: la prueba decia "no se llega a la sala"
// cuando lo que pasaba era "no se puede pisar ese pixel concreto".
//
// Lo que importa no es una casilla, es si la SALA esta conectada. Asi que se
// cuenta cuanto de su superficie libre es alcanzable y se exige el 95 %.
function trozoAlcanzable(cx, cy, r) {
  let libres = 0, alc = 0;
  for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) {
      const i = y * W + x;
      if (!bloqueado[i]) { libres++; if (visto[i]) alc++; }
    }
  }
  return { libres, alc, pct: libres ? (100 * alc / libres) : 0 };
}

let salasOk = 0;
const salasMal = [];
Object.keys(SALAS).forEach(n => {
  const [x, y] = SALAS[n];
  const t = trozoAlcanzable(x, y, 11);
  if (t.libres > 50 && t.pct >= 95) salasOk++;
  else salasMal.push(`${n} (${t.alc}/${t.libres})`);
});
comprueba('se llega a las nueve salas',
  salasOk === 9, 'mal conectadas: ' + salasMal.join(', '));

// Los minerales. Si alguno cayo en un rincon amurallado, es un punto que nunca
// se podra picar.
const minerales = capas['puntos_mineral'].objects;
const mineralesMal = minerales.filter(o => {
  const x = Math.floor(o.x / TILE), y = Math.floor(o.y / TILE);
  return !visto[y * W + x];
});
comprueba('se llega a todos los puntos de mineral',
  mineralesMal.length === 0,
  mineralesMal.length + ' de ' + minerales.length + ' aislados');

console.log('\n=== LAVA Y PASARELAS ===\n');

// La lava tiene que estar EN la capa de colision. Si no, se cruza andando y el
// lago deja de ser un obstaculo.
const lava = capas['area_lava'].objects;
let lavaSinColision = 0;
lava.forEach(o => {
  const x = Math.floor((o.x + o.width / 2) / TILE);
  const y = Math.floor((o.y + o.height / 2) / TILE);
  if (!bloqueado[y * W + x]) lavaSinColision++;
});
// El interior tiene que ser un subconjunto propio: si tuviera los mismos
// rectangulos que area_lava seria que el recorte no se aplico y volveria el
// filo recto en el borde del lago.
comprueba('la capa de interior de la lava esta recortada de verdad',
  capas['area_lava_interior'].objects.length > 0 &&
  capas['area_lava_interior'].objects.length < capas['area_lava'].objects.length,
  `interior ${capas['area_lava_interior'].objects.length} de ${capas['area_lava'].objects.length}`);

comprueba('la lava frena al jugador',
  lavaSinColision === 0, lavaSinColision + ' trozos de lava sin colision');

// Y tiene que haber un camino de un lado a otro de las profundidades, o la
// mitad sur del mapa queda partida en dos.
// Igual que arriba: no se mira un pixel (caeria en la lava), sino si los dos
// extremos de las profundidades estan conectados con la entrada.
const oeste = trozoAlcanzable(44, 136, 7);
const este = trozoAlcanzable(116, 136, 7);
comprueba('las pasarelas cruzan las profundidades de lado a lado',
  oeste.pct >= 90 && este.pct >= 90,
  `oeste ${oeste.alc}/${oeste.libres}, este ${este.alc}/${este.libres}`);

console.log('\n=== LA PUERTA, DESDE EL MAPA DE FUERA ===\n');

// GameScene saca la zona de entrada del objeto `puerta_mina` de
// mapa_principal.json. Si ese objeto se mueve, se renombra o pierde su gid, la
// puerta deja de funcionar Y NO DA NINGUN ERROR: el jugador pasa por delante y
// no baja. Por eso se comprueba aqui y no solo a ojo dentro del juego.
const principal = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'Maps', 'mapa_principal.json'), 'utf8'));
const capaXd = principal.layers.find(l => l.name === 'Objetosxd');
const puerta = capaXd && capaXd.objects.find(o => o.name === 'puerta_mina');

comprueba('existe el objeto puerta_mina en la capa Objetosxd', !!puerta);

comprueba('puerta_mina lleva gid (es un objeto de tile)',
  !!(puerta && puerta.gid),
  'sin gid, GameScene calcularia su Y un alto entero mas abajo');

// El rectangulo tal y como lo calcula GameScene: un objeto CON gid tiene el
// origen abajo a la izquierda, asi que la esquina de arriba es y - height.
const pr = puerta ? {
  x: puerta.x, y: puerta.y - puerta.height,
  w: puerta.width, h: puerta.height
} : null;

const colP = principal.layers.find(l => l.name === 'area_colision_general');
function chocaEnElMapa(x, y, w, h) {
  return colP.objects.some(o =>
    !(x + w < o.x || y + h < o.y || x > o.x + o.width || y > o.y + o.height));
}

// El jugador se para justo debajo del hueco: su rectangulo son 30x15 a los
// pies, el mismo que usa GameScene.
comprueba('se puede ESTAR en el hueco de la puerta sin chocar',
  !chocaEnElMapa(3334 - 15, 690, 30, 15),
  'el hueco entre los dos muros de la entrada esta tapado');

comprueba('de pie en el hueco, el jugador TOCA el rectangulo de la puerta',
  !!pr && !(3334 + 15 < pr.x || 690 + 15 < pr.y ||
            3334 - 15 > pr.x + pr.w || 690 > pr.y + pr.h),
  pr ? `puerta en (${pr.x.toFixed(0)}, ${pr.y.toFixed(0)}) ${pr.w.toFixed(0)}x${pr.h.toFixed(0)}` : '');

// Y donde se reaparece al salir de la mina no puede ser dentro de una piedra.
comprueba('al salir de la mina se reaparece en suelo libre',
  !chocaEnElMapa(3334 - 15, 760 + 25, 30, 15),
  'la posicion de vuelta (3334, 760) cae dentro de una colision');


console.log('\n=== RENDIMIENTO ===\n');

comprueba('las colisiones estan fusionadas (no una por casilla)',
  capas['area_colision_general'].objects.length < 2000,
  capas['area_colision_general'].objects.length + ' rectangulos');

const pesoKB = fs.statSync(MAPA).size / 1024;
comprueba('el mapa no es desproporcionado',
  pesoKB < 1200, pesoKB.toFixed(0) + ' KB');

console.log('\n============================================================');
if (fallos) {
  console.log(fallos + ' de ' + pruebas + ' comprobaciones FALLAN');
  process.exit(1);
} else {
  console.log('Las ' + pruebas + ' comprobaciones pasan.');
}
