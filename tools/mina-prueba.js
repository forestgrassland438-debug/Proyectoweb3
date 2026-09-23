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
/* DOS REJILLAS, Y ESTE BANCO MIRA LA DEL ARTE.
 *
 * El mapa va en casillas de 16 px (313 x 313 = 5008, igual que
 * mapa_principal) pero las tiles del tileset son de 32: cada una ocupa 2 x 2
 * casillas y se ancla ABAJO a la izquierda. Tres de cada cuatro casillas
 * estan a 0 y eso NO es un agujero.
 *
 * Todas las comprobaciones de forma -galerias, salas, pasarelas- razonan en
 * la rejilla del ARTE, que es como se excava. Asi que las capas de tiles se
 * COMPACTAN aqui una vez, y el resto del fichero sigue hablando de W, H y
 * TILE como siempre. Si algun dia las dos rejillas vuelven a ser la misma,
 * ESCALA vale 1 y esto es la identidad. */
const REJILLA = mapa.tilewidth;                 // la casilla del MAPA: 16
const TILE = mapa.tilesets[0].tilewidth;        // la tile del ARTE: 32
const ESCALA = Math.max(1, Math.round(TILE / REJILLA));
const DESP = ESCALA > 1 ? ESCALA - 1 : 0;       // el anclaje de abajo
const WM = mapa.width;
const HM = mapa.height;
const W = Math.floor(WM / ESCALA);
const H = Math.floor(HM / ESCALA);

mapa.layers.forEach(l => {
  if (l.type !== 'tilelayer' || !Array.isArray(l.data)) return;
  const origen = l.data;
  const salida = new Array(W * H).fill(0);
  for (let ay = 0; ay < H; ay++) {
    for (let ax = 0; ax < W; ax++) {
      salida[ay * W + ax] = origen[(ay * ESCALA + DESP) * WM + ax * ESCALA] || 0;
    }
  }
  l.data = salida;
  l.width = W;
  l.height = H;
});

const capas = {};
mapa.layers.forEach(l => { capas[l.name] = l; });

console.log('\n=== FORMA DEL MAPA ===\n');

// 157 x 32 = 5024 px, practicamente los 5008 de mapa_principal. Lo que
// cambia frente a la primera version no es el tamano del MUNDO sino el de la
// CASILLA: de 16 a 32, porque el personaje mide 46x102 y con casillas de 16
// todo lo que ocupaba una salia a la sexta parte de su altura.
// 5008 CLAVADOS, igual que mapa_principal.
//
// Con casillas de 32 no habia forma: 5008/32 = 156,5. La salida fue separar
// las dos rejillas -el mapa en casillas de 16, el tileset en tiles de 32- que
// es lo que admiten Tiled y Phaser cuando la tile es mas grande que la
// casilla. Esta prueba fija las dos cosas a la vez, porque cambiar una sin la
// otra descuadra el mapa entero.
comprueba('el mundo mide 5008 x 5008 exactos, como mapa_principal',
  WM === 313 && HM === 313 && REJILLA === 16 && mapa.tileheight === 16 &&
  WM * REJILLA === 5008,
  `es ${WM}x${HM} de ${REJILLA}px = ${WM * REJILLA}px`);

comprueba('el arte sigue en tiles de 32 (una tile = 2x2 casillas)',
  TILE === 32 && mapa.tilesets[0].tileheight === 32 && ESCALA === 2,
  `tile ${TILE}px / casilla ${REJILLA}px = x${ESCALA}`);

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

// EL MURO TIENE QUE SACARLE ALTURA AL PERSONAJE, que mide 102 px en pantalla
// (23x51 a escala 2). Empezo en 16 px y se leia como un bordillo. Se subio a
// 96 y seguia pareciendo bajo, con razon: 96 contra 102 es una pared que te
// llega al hombro, no una galeria excavada. Ahora son 160, vez y media el
// personaje. El tope de arriba existe para que esto siga siendo una prueba:
// un muro de 400 px taparia la galeria y el jugador no veria por donde va.
// El personaje mide 102 px. Un muro tiene que acercarse a eso o se lee como
// un bordillo, que es de lo que se quejaba la primera version (16 px).
comprueba('el muro le saca altura al personaje (102 px)',
  ficha.muro && ficha.muro.alto_px >= 128 && ficha.muro.alto_px <= 224,
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


console.log('\n=== LA CONEXION ENTRE ESCENAS ===\n');

// Estas tres comprobaciones son de CODIGO, no de mapa. Cada una corresponde a
// un fallo que se vio en el juego real y que no daba ningun error en consola.
/**
 * SE QUITAN LOS COMENTARIOS ANTES DE MIRAR.
 *
 * La primera version de estas comprobaciones fallaba las tres, y el mapa y el
 * codigo estaban bien: buscaba `typeof window.MinaScene` y `onClick` en el
 * texto del archivo, y los encontraba... en los COMENTARIOS donde se explica
 * el fallo que se acababa de arreglar. Una prueba que lee comentarios no
 * comprueba el codigo, comprueba la prosa.
 */
function soloCodigo(ruta) {
  const src = fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const gameScene = soloCodigo(path.join('Scenes', 'GameScene.js'));
const minaScene = soloCodigo(path.join('Scenes', 'MinaScene.js'));
const landsScene = soloCodigo(path.join('Scenes', 'LandsScene.js'));
const gfLands = soloCodigo('gf-lands.js');
const fuenteGen = fs.readFileSync(path.join(RAIZ, 'tools', 'generar-mina.py'), 'utf8');
const fuenteAudio = soloCodigo('gf-audio.js');
const fuentePost  = soloCodigo('gf-postproceso.js');

// 1. "choco con la puerta de la mina y no pasa nada".
//    `register-scenes.js` BORRA los globales de las escenas cuando termina de
//    registrarlas (`delete root[name]`). Preguntar por `window.MinaScene` da
//    siempre undefined, asi que la guarda se cumplia y la funcion salia sin
//    hacer nada — con la colision detectada correctamente.
comprueba('entrarEnLaMina NO depende de window.MinaScene',
  !/typeof\s+window\.MinaScene/.test(gameScene),
  'register-scenes.js borra ese global: la guarda se cumpliria siempre');

comprueba('entrarEnLaMina pregunta al gestor de escenas',
  /this\.scene\.get\(['"]MinaScene['"]\)/.test(gameScene));

// 2. "a la puerta se le puede dar click y no lo quiero".
//    createImagesFromObjectLayer solo llama a setInteractive si hay onClick,
//    asi que quitarlo es lo que deja la puerta como decorado.
const iPuerta = gameScene.indexOf('puerta_mina: {');
const bloquePuerta = gameScene.slice(iPuerta, gameScene.indexOf('}', iPuerta) + 1);
comprueba('la puerta de la mina NO es clicable',
  iPuerta > 0 && bloquePuerta.indexOf('onClick') === -1,
  'un onClick la deja interactiva, con cursor de mano');

// 3. "entro a la isla y sale SESSION EXPIRED".
//    serverBase se rellenaba en preload(), y las escenas hijas tienen el suyo
//    propio: la peticion salia a `undefined/api/auth/me`.
// El constructor es lo primero de la clase, asi que su llamada tiene que
// aparecer ANTES de la definicion de preload().
comprueba('serverBase se resuelve desde el CONSTRUCTOR',
  gameScene.indexOf('this._resolverServidor();') > 0 &&
  gameScene.indexOf('this._resolverServidor();') <
    gameScene.search(/^\s{2}preload\(\)\s*\{/m),
  'si solo se hiciera en preload(), la mina y la isla se quedarian sin el');

// 4. Y ninguna de las dos escenas se reautentica si le dan la sesion.
[['MinaScene', minaScene], ['LandsScene', landsScene]].forEach(([n, src]) => {
  comprueba(n + ' hereda la sesion en vez de reautenticarse',
    /_aplicarSesion\(this\.__sesionRecibida\)/.test(src) &&
    /init\(datos\)/.test(src),
    'sin esto vuelve a llamar a loadx() y puede salir el cartel de sesion');
});

/* LA MINA Y LA ISLA SE ENTRAN POR LA PANTALLA DE CARGA, como la tienda.
   Antes se hacia `scene.start('MinaScene')` a pelo, que funcionaba pero se
   saltaba la carga -y con ella el contraste del inventario con la cadena-.
   Ademas, el mundo NO se guardaba: la isla se marcaba como mundo 4 solo en la
   instancia, asi que recargar la pagina te sacaba al mapa. */
comprueba('a la mina se entra por la pantalla de carga',
  /entrarEnLaMina[\s\S]{0,2600}scene\.start\('LoadingScenegame'\)/.test(gameScene) &&
  !/scene\.start\(['"]MinaScene['"]/.test(gameScene));

comprueba('a la isla se entra por la pantalla de carga',
  /function ir\(escena\)[\s\S]{0,1400}scene\.start\('LoadingScenegame'\)/.test(gfLands) &&
  !/scene\.start\(CLAVE_ISLA/.test(gfLands));

comprueba('el mundo se guarda ANTES de irse, y se espera al guardado',
  /this\.mundo = 3;[\s\S]{0,200}await this\.savegg\(\)/.test(gameScene) &&
  /escena\.mundo = 4;[\s\S]{0,400}then\(irYa, irYa\)/.test(gfLands),
  'la carga decide leyendo /api/load: un guardado en vuelo lee el mundo viejo');


// ===========================================================================
//  LA VUELTA A CASA
// ===========================================================================
//
// Los cuatro fallos que dejaron el juego en negro, cada uno con su prueba.
// Son comprobaciones sobre el CODIGO FUENTE, no sobre el mapa: no hay forma de
// arrancar Phaser aqui, pero si de comprobar que la linea que arregla el fallo
// sigue estando. Es tosco, y aun asi habria cazado los cuatro.

console.log('\n=== LA VUELTA A CASA ===\n');

const cargador = soloCodigo(path.join('Scenes', 'LoadingScenegame.js'));

// --- 1. la pantalla de carga conoce los cuatro mundos ----------------------
//
// EL FALLO: `if (mundo === 1 || mundo === 2)`. La mina se guarda como mundo 3
// y la isla como mundo 4, asi que al volver a entrar no se cumplia ninguna
// rama, no se llamaba a scene.start NUNCA y la carga se quedaba colgada. Negro
// para siempre y sin un error en consola.
comprueba('la pantalla de carga sabe llevar al mundo 3 (la mina)',
  /3\s*:\s*['"]MinaScene['"]/.test(cargador));

comprueba('la pantalla de carga sabe llevar al mundo 4 (la isla)',
  /4\s*:\s*['"]LandsScene['"]/.test(cargador));

comprueba('un mundo desconocido no cuelga la carga: cae en GameScene',
  /if\s*\(!nextScene\)[\s\S]{0,220}nextScene\s*=\s*['"]GameScene['"]/.test(cargador));

comprueba('una escena sin registrar tampoco cuelga la carga',
  /scene\.get\(nextScene\)[\s\S]{0,220}nextScene\s*=\s*['"]GameScene['"]/.test(cargador));

comprueba('la carga le pasa la sesion a la mina y a la isla',
  /nextScene === ['"]MinaScene['"][\s\S]{0,400}sesion:/.test(cargador));

// --- 2. salir deja la partida apuntando al mapa ----------------------------
//
// EL FALLO DE FONDO: LoadingScenegame NO TIENE init(). El `playerData` que se
// le pasa en scene.start no lo lee nadie: el mundo y la posicion salen siempre
// de /api/load. Y savegg() guarda `mundo: this.mundo`, que en la isla vale 4.
// Resultado: salir de la isla guardaba "estoy en la isla" y la carga te
// devolvia a la isla. Un bucle sin salida.
comprueba('LoadingScenegame sigue sin leer playerData (por eso hace falta lo de abajo)',
  !/^\s*init\s*\(/m.test(cargador),
  'si algun dia se le anade init(), esta prueba avisa de que hay otro camino');

comprueba('GameScene trae _dejarPartidaEnElMapa',
  /_dejarPartidaEnElMapa\s*\(x,\s*y\)\s*\{/.test(gameScene));

comprueba('_dejarPartidaEnElMapa pone mundo 1 ANTES de guardar',
  /_dejarPartidaEnElMapa[\s\S]{0,700}this\.mundo\s*=\s*1[\s\S]{0,700}this\.savegg\(\)/.test(gameScene));

comprueba('la mina corrige el mundo al salir (no un savegg a secas)',
  /_volverAlMapa[\s\S]{0,1600}_dejarPartidaEnElMapa\(destino\.x,\s*destino\.y\)/.test(minaScene));

comprueba('la isla vuelve a la plaza de las cuentas nuevas (2097, 2359)',
  /PLAZA_X\s*=\s*2097/.test(gfLands) && /PLAZA_Y\s*=\s*2359/.test(gfLands));

comprueba('la isla corrige el mundo ANTES de apagar el HUD (que tambien guarda)',
  /_dejarPartidaEnElMapa\(PLAZA_X,\s*PLAZA_Y\)[\s\S]{0,200}apagarHUD\(escena\)/.test(gfLands),
  'si se corrige despues, quedan dos guardados en carrera');

// --- 3. la mina no puede quedarse en negro y muda -------------------------
//
// EL FALLO: create() es async. Lo que revienta dentro se convierte en una
// promesa rechazada que nadie mira: la escena se queda a medias, update() se
// va por su primer return y no hay ni una linea roja que diga donde.
comprueba('la mina monta dentro de un try/catch',
  /await this\._construirMina\(/.test(minaScene) &&
  /catch \(e\)[\s\S]{0,200}_faseMina/.test(minaScene));

comprueba('la mina dice EN QUE FASE se rompio',
  (minaScene.match(/this\._faseMina\s*=/g) || []).length >= 10,
  (minaScene.match(/this\._faseMina\s*=/g) || []).length + ' fases marcadas');

comprueba('la mina comprueba que quedo montada (fallo mudo)',
  /!this\.map \|\| !this\.player \|\| !this\.keys/.test(minaScene));

comprueba('si la mina no monta, devuelve al jugador al mapa',
  /_rescatar\s*\(motivo\)\s*\{[\s\S]{0,900}scene\.start\(['"]LoadingScenegame['"]/.test(minaScene));

comprueba('el tileset de la mina se comprueba antes de usarlo',
  /if \(!tileset\)[\s\S]{0,200}throw new Error/.test(minaScene));

comprueba('la capa "mina" se comprueba antes de setDepth',
  /if \(!this\.backgroundLayer\)[\s\S]{0,160}throw new Error/.test(minaScene));

comprueba('sin sesion, la mina ya no se queda en una escena vacia',
  !/showTokenErrorHub\(\);\s*\n\s*return;/.test(minaScene));

comprueba('el rescate de la mina no puede hacer bucle con la carga',
  /window\.__gfMinaRota\s*=/.test(minaScene) &&
  /__gfMinaRota[\s\S]{0,300}nextScene = ['"]GameScene['"]/.test(cargador),
  'la partida dice mundo 3: sin cortacircuitos, carga -> mina -> revienta -> carga');

comprueba('el rescate tambien deja la partida guardada en el mapa',
  /_rescatar[\s\S]{0,1200}_dejarPartidaEnElMapa\(3334, 760\)/.test(minaScene));

// --- 4. la puerta de la isla ----------------------------------------------
comprueba('la isla lee la capa de objetos "puerta" del mapa',
  /getObjectLayer\(['"]puerta['"]\)/.test(landsScene));

comprueba('la isla respeta el origen de los objetos con gid',
  /o\.gid \? \(o\.y - o\.height\) : o\.y/.test(landsScene));

comprueba('se aparece DELANTE de la puerta, no encima',
  /puerta\.y - M/.test(landsScene));

comprueba('la isla no te deja aparecer en el agua',
  /_esTierraEnPixeles/.test(landsScene));

comprueba('pisar la puerta saca de la isla',
  /_comprobarSalida\s*\(\)\s*\{[\s\S]{0,900}GFLands\.volver\(this\)/.test(landsScene));

comprueba('la salida de la isla tiene el candado de "armada"',
  /_salidaArmada[\s\S]{0,300}_cambiandoEscena/.test(landsScene));

comprueba('el update de la isla se para al cambiar de escena',
  /update\(time, delta\)\s*\{[\s\S]{0,400}if \(this\._cambiandoEscena\) return;/.test(landsScene));

comprueba('el update de la mina se para al cambiar de escena',
  /update\(time, delta\)\s*\{[\s\S]{0,400}if \(this\._cambiandoEscena\) return;/.test(minaScene));

// --- 4b. la burbuja que tiraba el juego entero ----------------------------
//
// EL FALLO: `lava_burbuja_anim` se creaba en GameScene._crearAnimaciones(),
// que heredan TODAS las escenas. La hoja de sprites solo la carga la mina, asi
// que en la isla la animacion nacia con CERO fotogramas. Las animaciones son
// globales del juego: la mina se la encontraba hecha y vacia, y el primer
// play() moria en frames[0].duration. Como salia de un TimerEvent, se llevaba
// por delante el paso entero del bucle: pantalla negra y "no corre nada", pero
// SOLO si habias pasado por la isla antes de bajar.
comprueba('GameScene ya no crea la animacion de la burbuja',
  !/lava_burbuja_anim/.test(gameScene),
  'la textura es de la mina: la animacion tiene que nacer alli');

comprueba('la mina comprueba la textura antes de crear la animacion',
  /textures\.exists\(['"]lava_burbuja['"]\)/.test(minaScene));

comprueba('la mina REHACE la animacion en cada entrada',
  /anims\.remove\(['"]lava_burbuja_anim['"]\)[\s\S]{0,300}anims\.create\(/.test(minaScene),
  'al salir se suelta la textura: las tramas viejas apuntan a una destruida');

comprueba('recolocar() no puede tirar el bucle de Phaser',
  /const recolocar = \(spr\) => \{[\s\S]{0,400}try \{/.test(minaScene),
  'corre desde un temporizador, y alli una excepcion corta el fotograma');

// --- 4c. el ancla: que loadPlayerData no arrastre al jugador --------------
//
// EL FALLO: `loadPlayerData()` recoloca al jugador en la posicion guardada,
// que es del mapa de fuera (hasta 5008). La mina y la isla lo llaman DESPUES
// de colocarlo en su entrada. En la isla, de 2048x1536, una x de 3300 se
// recorta contra el limite del mundo: el jugador aparecia EN LA ESQUINA.
comprueba('loadPlayerData respeta el punto de aparicion de la escena',
  /if \(this\._anclaPropia\)[\s\S]{0,260}this\.player\.setPosition/.test(gameScene));

comprueba('la mina pone su ancla antes de arrancar los sistemas',
  /_anclaPropia = \{ x: inicio\.x, y: inicio\.y \}/.test(minaScene));

comprueba('la isla pone su ancla antes de arrancar los sistemas',
  /_anclaPropia = \{ x: inicio\.x, y: inicio\.y \}/.test(landsScene));

comprueba('el hub de avisos se monta fuera de GameScene',
  /_montarNotificaciones\(\)\s*\{/.test(gameScene) &&
  /_arrancarSistemas[\s\S]{0,1200}_montarNotificaciones\(\)/.test(gameScene),
  'sin el, los 167 this.notifications.* de la clase revientan; entre ellos, comer');

comprueba('el hub de avisos es idempotente',
  /_montarNotificaciones\(\)\s*\{\s*if \(this\.notifications\) return/.test(gameScene));

comprueba('los botones Music, Transactions y ocultar-HUD tienen manejador',
  /this\.onRoundBtnStats = \(\) =>[\s\S]{0,200}showSoundHub/.test(gameScene) &&
  /this\.onRoundBtnReputation = \(\) =>[\s\S]{0,400}tx-hub/.test(gameScene) &&
  /this\.onInnerBtnClick = \(e\) =>[\s\S]{0,400}round-buttons/.test(gameScene),
  'se definian solo en create(): _cablearHUD enganchaba undefined');

comprueba('el agua de la isla frena por sub-casilla, no por casilla entera',
  /_mascarasDeAgua\(SUB\)/.test(landsScene) && /const SUB = 4/.test(landsScene),
  'las orillas son mitad arena mitad agua: bloquearlas enteras taparia la playa');

comprueba('las mascaras de agua se leen del tileset, no de una lista a mano',
  /getImageData/.test(landsScene) && /_cacheMascarasAgua/.test(landsScene));

comprueba('la penumbra de la mina es una IMAGEN (las figuras ignoran MULTIPLY)',
  /add\.image\(0, 0, CLAVE_PEN\)/.test(minaScene) &&
  !/add\.rectangle\([\s\S]{0,120}0x4a5a78/.test(minaScene));

comprueba('la mina y la isla van en modo INTERIOR de audio',
  /GFAudio\.montar\(this, \{ tipo: 'tienda'[\s\S]{0,60}interior: true/.test(minaScene) &&
  /GFAudio\.montar\(this, \{ tipo: 'tienda'[\s\S]{0,60}interior: true/.test(landsScene),
  'ni ambiente, ni bichos, ni truenos, ni lluvia');

comprueba('gf-audio respeta el modo interior',
  /if \(st\.interior\) \{[\s\S]{0,200}o\.lluvia = o\.viento/.test(fuenteAudio) &&
  /if \(st\.interior\) return false;/.test(fuenteAudio));

comprueba('el post-procesado no mete la noche en la mina',
  /GFPost\.montar\(this, \{ interior: true \}\)/.test(minaScene) &&
  /if \(st && st\.interior\) return 0;/.test(fuentePost),
  'GFCiclo.oscuridad() es el reloj GLOBAL: no pregunta por la escena');

comprueba('el post-procesado tampoco mete el clima en la mina',
  /st && st\.interior\) \? \{ activo: false/.test(fuentePost));

comprueba('las casillas del inventario se crean ANTES de pedir los datos',
  /this\.initInventory\(\);[\s\S]{0,900}await this\.initialize\(\)[\s\S]{0,500}rebuildPlayerInventoryFromState/.test(gameScene),
  'initInventory hace STATE.slots = [] : despues de los datos, los borra');

comprueba('el refresco del token esta ENCENDIDO',
  /this\.autoRefreshEnabled = true/.test(gameScene),
  'startAutoRefresh salia por su primera linea: el JWT no se renovaba nunca');

comprueba('el token se refresca tambien fuera de GameScene',
  /_arrancarSistemas[\s\S]{0,900}this\.startAutoRefresh\(\)/.test(gameScene),
  'la mina y la isla no pasan por loadx(), que era el unico sitio que lo arrancaba');

comprueba('la X del inventario se engancha en el HUD compartido',
  /_cablearHUD\(\)[\s\S]{0,4000}#inventory-panel \.cerrar-hud/.test(gameScene));

comprueba('el HUD se ensena antes de esperar a la red',
  /_mostrarHUD\(\);[\s\S]{0,60}await this\._arrancarSistemas\(\)/.test(minaScene) &&
  /_mostrarHUD\(\);[\s\S]{0,60}await this\._arrancarSistemas\(\)/.test(landsScene),
  'estaba despues: dos o tres segundos de mapa sin barras ni botones');

comprueba('el chat se monta antes de cablear el HUD',
  /_setupChatDom\(\)[\s\S]{0,700}_mostrarHUD\(\)/.test(minaScene) &&
  /_setupChatDom\(\)[\s\S]{0,700}_mostrarHUD\(\)/.test(landsScene),
  '_cablearHUD engancha el boton del chat solo si this._toggleChat ya existe');

comprueba('nunca me dibujo a mi mismo como jugador remoto',
  /_esMiCuenta\(info\)\s*\{/.test(gameScene) &&
  (gameScene.match(/_esMiCuenta\(/g) || []).length >= 4,
  'myId es el SOCKET y cambia al reconectar; la cuenta no');

// --- 5. y la geometria de verdad, sobre mapa_lands.json --------------------
//
// Lo unico de este bloque que no mira codigo: se coge la puerta que el jugador
// dibujo en Tiled y se comprueba, casilla a casilla, que el sitio donde se
// aparece es tierra y que NO toca la puerta. Si tocara, el jugador saldria
// disparado de vuelta al mapa nada mas llegar.
const rutaLands = path.join(RAIZ, 'Maps', 'mapa_lands.json');
if (fs.existsSync(rutaLands)) {
  const isla = JSON.parse(fs.readFileSync(rutaLands, 'utf8'));
  const T2 = isla.tilewidth;
  const terr = isla.layers.find(l => l.name === 'Terrain' && l.type === 'tilelayer');
  const capaPuerta = isla.layers.find(l => l.name === 'puerta');
  const AGUA = [43];

  comprueba('mapa_lands.json trae la capa de objetos "puerta"',
    !!(capaPuerta && capaPuerta.objects && capaPuerta.objects.length));

  if (terr && capaPuerta && capaPuerta.objects && capaPuerta.objects.length) {
    const o = capaPuerta.objects[0];
    const arriba = o.gid ? (o.y - o.height) : o.y;
    const tierra = (px, py) => {
      const tx = Math.floor(px / T2), ty = Math.floor(py / T2);
      if (tx < 0 || ty < 0 || tx >= isla.width || ty >= isla.height) return false;
      const g = terr.data[ty * isla.width + tx];
      return g > 0 && AGUA.indexOf(g) === -1;
    };

    const M = 60;
    const lados = [
      ['norte', o.x + o.width / 2, arriba - M],
      ['sur',   o.x + o.width / 2, arriba + o.height + M],
      ['oeste', o.x - M,           arriba + o.height / 2],
      ['este',  o.x + o.width + M, arriba + o.height / 2]
    ];
    const elegido = lados.find(([, cx, cy]) => tierra(cx, cy + 32));

    comprueba('hay al menos un lado de la puerta que es tierra',
      !!elegido, elegido ? 'se aparece al ' + elegido[0] : 'los cuatro son agua');

    if (elegido) {
      const cy = elegido[2];
      const cx = elegido[1];
      // La caja de pies del jugador: 30x15 en (x-15, y+25), la misma del juego.
      const pieY = cy + 25 + 15;
      comprueba('al aparecer NO se esta tocando la puerta',
        pieY < arriba || cy + 25 > arriba + o.height,
        'pies hasta y=' + pieY.toFixed(0) + ', puerta desde y=' + arriba.toFixed(0));

      comprueba('los pies pisan tierra en todo el ancho',
        tierra(cx - 15, pieY - 1) && tierra(cx, pieY - 1) && tierra(cx + 14, pieY - 1));
    }
  }
}

// ===========================================================================
//  LO QUE LA MINA Y LA ISLA SE ESTABAN PERDIENDO
// ===========================================================================
//
// Las dos heredan de GameScene pero NO pasan por su create(), que son 6.000
// lineas. Todo lo que estuviera suelto ahi dentro -y no en un metodo- se les
// quedaba fuera sin que nada lo avisara: ni un error, ni una advertencia.
// Estas pruebas fijan lo que se saco a metodos para que lo compartan.

console.log('\n=== LO COMPARTIDO CON GAMESCENE ===\n');

comprueba('el zoom es un metodo, no codigo suelto en create()',
  /_montarZoom\(\)\s*\{[\s\S]{0,3000}this\.zoomValues =/.test(gameScene));

// Las escenas de TILEMAP no pueden usar 0.5x: el borde de cada casilla cae a
// medio pixel y salen rayas por todo el mapa.
comprueba('la mina y la isla no ofrecen el 0.5x que raya el tilemap',
  /_nivelesDeZoom = \[1\.0, 2\.0\]/.test(minaScene) &&
  /_nivelesDeZoom = \[1\.0, 2\.0\]/.test(landsScene) &&
  /Array\.isArray\(this\._nivelesDeZoom\)/.test(gameScene));

comprueba('el indice del zoom se BUSCA, no se escribe a mano',
  /zoomValues\.indexOf\(1\.0\)/.test(gameScene),
  'con [0.5,1,2] el 1x es el indice 1; con [1,2] es el 0');

comprueba('la mina monta el zoom', /this\._montarZoom\(\)/.test(minaScene));
comprueba('la isla monta el zoom', /this\._montarZoom\(\)/.test(landsScene));

comprueba('el zoom no acumula manejadores de rueda al reusar la escena',
  /input\.off\('wheel', this\._alaRueda\)/.test(gameScene),
  'Phaser reutiliza la instancia: sin el off, un golpe de rueda daria dos saltos');

comprueba('el zoom respeta la animacion de entrada de GameScene',
  /zoomEffect && cam\.zoomEffect\.isRunning/.test(gameScene),
  'asignar el zoom mientras corre el zoomTo se pierde en silencio');

comprueba('el hub de monedas se monta con el zoom',
  /_montarZoom\(\)[\s\S]{0,2500}_setupCurrencyHub\(\)/.test(gameScene));

comprueba('los botes de basura se arrancan fuera de GameScene',
  /_arrancarSistemas[\s\S]{0,5000}initTrashSystem\(\)/.test(gameScene));

comprueba('las notificaciones se inicializan fuera de GameScene',
  /_arrancarSistemas[\s\S]{0,5000}_loadNotifications\(\)/.test(gameScene),
  'sin _notifList, marcar como leido revienta al pulsar la campana');

comprueba('el inventario se sincroniza con la cadena fuera del cargador',
  /_sincronizarInventarioConLaCadena\(\)\s*\{/.test(gameScene) &&
  /_arrancarSistemas[\s\S]{0,5000}_sincronizarInventarioConLaCadena\(\)/.test(gameScene));

comprueba('la sincronizacion PIDE PRESTADOS los metodos, no los copia',
  /scene\.get\('LoadingScenegame'\)[\s\S]{0,1200}_buildSyncMaps/.test(gameScene),
  'copiarlos serian 400 lineas duplicadas, como ya pasa con ItemDefinitions');

// --- colisiones -----------------------------------------------------------
comprueba('la caja de pies llega hasta los pies (26 de alto, no 15)',
  /_chocaConEscenario\(this\.player\.x - 15, prevY \+ 25, 30, 26\)/.test(minaScene) &&
  /_chocaConEscenario\(this\.player\.x - 15, prevY \+ 25, 30, 26\)/.test(landsScene),
  'el sprite es 23x51 a escala 2: los pies caen en y+51, no en y+40');

// Y frenan EN LA LISTA BUENA: `_reconstruirIndiceColisiones()` solo indexa
// `collisionRectangles` y `collisionRectangles1`. En `...2`, que es donde
// estaban al principio, no frenaban absolutamente nada.
comprueba('las piezas de la mina frenan, y en la lista que SI se indexa',
  /collisionRectangles = this\.collisionRectangles\.concat\(solidas\)/.test(minaScene) &&
  !/collisionRectangles2 = solidas/.test(minaScene));

// La boca de la galeria NO puede estar en `collisionRectangles1`: ahi seria un
// muro, el jugador chocaria con ella sin llegar a solaparla nunca y la salida
// no saltaria jamas. Es lo que impedia salir de la mina.
comprueba('la salida de la mina no es un muro',
  /this\._salida = \(this\._rectsDeCapa\('area_salida_mina'\)/.test(minaScene) &&
  /collisionRectangles1 = \[\]/.test(minaScene));

comprueba('la antorcha y el puntal NO frenan',
  /SIN_COLISION = new Set\(\['antorcha', 'puntal'\]\)/.test(minaScene),
  'el puntal es un arco de paso: frenarlo taponaria la galeria');

// --- la salida se ve ------------------------------------------------------
comprueba('la salida de la mina esta senalada',
  /_montarSalidaVisible\(\)\s*\{/.test(minaScene) &&
  /this\._montarSalidaVisible\(\)/.test(minaScene));

comprueba('el degradado sale del rectangulo de salida, no de numeros a mano',
  /_montarSalidaVisible\(\)\s*\{\s*const r = this\._salida;/.test(minaScene));

comprueba('el cartel de la salida se suelta al apagar',
  /mina_salida_luz[\s\S]{0,400}textures\.remove/.test(minaScene) ||
  /textures\.remove[\s\S]{0,400}mina_salida_luz/.test(minaScene));

// --- el arte, a la escala a la que se juega -------------------------------
comprueba('los tablones son de 16 px, no de 8',
  /franjas = \[\(0, 16\), \(16, T\)\]/.test(fuenteGen),
  'cuatro tablas en una casilla de 32 es el dibujo de un suelo de 16');

comprueba('los sillares del muro son de 32, no de 16',
  /alto=18, ancho=\(22, 34\)/.test(fuenteGen));

comprueba('las traviesas de la via dividen la casilla (no dan salto)',
  /range\(2, W, 16\)/.test(fuenteGen) && /range\(2, H, 16\)/.test(fuenteGen));

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
