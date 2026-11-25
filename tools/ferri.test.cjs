'use strict';
/* EL FERRI Y EL CANAL DEL PUEBLO (2026-11-24).
 * "En el río de GameScene no existe un barco con un NPC para llevarte a los
 * otros mapas ... además el río es corto: repáralo para el paso del barco."
 *
 * Lo que se rompe aquí NO da error en el juego: un choque de más deja al
 * jugador clavado en el muelle, uno de menos le deja andar sobre el agua, un
 * número del dibujo que no casa con gf-ferri.js pone al pasajero flotando, y
 * una llegada encima de un choque le encierra al bajar del barco. Se mira:
 *   · el canal: sus casillas de agua hasta el borde este, su choque y la tabla
 *     del agua del servidor (si no, no se pesca ni se rema en él);
 *   · el muelle: la pasarela se pisa de punta a punta, el agua de los lados y
 *     la punta donde amarra el ferri siguen cerradas;
 *   · que el pueblo pide el mapa con versión (la caché daba el viejo);
 *   · las llegadas de los dos viajes, fuera de todo choque y de toda salida;
 *   · el dibujo: lo que hay en disco es lo que sale del generador, y sus cotas
 *     son las que usa gf-ferri.js;
 *   · las reglas del barquero: el viaje pagado mira la muerte, el nivel y el
 *     VIP; la vuelta a casa no (un fantasma vuelve a pie... y en barco).
 *
 *   node --test tools/ferri.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const leer = (f) => fs.readFileSync(path.join(BIN, f), 'utf8').replace(/\r\n/g, '\n');

const PUEBLO = JSON.parse(leer('Maps/mapa_principal.json'));
const PUERTO = JSON.parse(leer('Maps/puerto.json'));
const capa = (mapa, nombre) => mapa.layers.find((l) => l.name === nombre);
const objetos = (mapa, nombre) => (capa(mapa, nombre) || { objects: [] }).objects;

/* Los choques que mira cada escena (GameScene._reconstruirIndiceColisiones:
   colisión general + entrada de la tienda; ZonasScenes: la capa `colisiones`). */
const CHOQUES_PUEBLO = objetos(PUEBLO, 'area_colision_general').concat(objetos(PUEBLO, 'area_entrada_tienda'));
const CHOQUES_PUERTO = objetos(PUERTO, 'colisiones');

/** La MISMA regla que GameScene._chocaConEscenario: los bordes que se tocan chocan. */
function choca(rects, x, y, w, h) {
  return rects.some((o) => o.width > 0 && o.height > 0 &&
    !(x + w < o.x || y + h < o.y || x > o.x + o.width || y > o.y + o.height));
}
/** La caja de los pies del jugador (x - 15, y + 25, 30 de ancho; alto 15 en el pueblo, 26 en las zonas). */
const pisaPueblo = (x, y) => !choca(CHOQUES_PUEBLO, x - 15, y + 25, 30, 15);
const pisaPuerto = (x, y) => !choca(CHOQUES_PUERTO, x - 15, y + 25, 30, 26);

function cargarFerri(extra) {
  const clases = new Set();
  const ctx = Object.assign({
    console: { log() {}, warn() {}, error: console.error }, Math, Date, JSON, Promise, setTimeout, clearTimeout,
    document: { body: { classList: { contains: (c) => clases.has(c) } }, getElementById: () => null }
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('gf-ferri.js'), ctx, { filename: 'gf-ferri.js' });
  return { ctx, F: ctx.GFFerri, clases };
}

// ─────────────────────────────────────────────────────────────── EL CANAL
test('el canal: agua hasta el borde este, su choque y la tabla del servidor', () => {
  const suelo = capa(PUEBLO, 'mapa_principal');
  assert.equal(suelo.width, 313);
  const g = (c, f) => suelo.data[f * suelo.width + c];
  // Filas 171-176: agua de la orilla del río (columna 297) a la última columna del mapa.
  for (let f = 171; f <= 176; f++) {
    for (let c = 297; c <= 312; c++) assert.equal(g(c, f), 1610, `casilla ${c},${f} sin agua`);
  }
  const canal = objetos(PUEBLO, 'area_colision_general').find((o) => o.name === 'canal_este');
  assert.ok(canal, 'falta el choque canal_este');
  assert.deepEqual([canal.x, canal.y, canal.width, canal.height], [4780, 2690, 260, 174]);
  // Por la arena de encima y de debajo del canal se anda; por el agua, no.
  assert.equal(pisaPueblo(4900, 2600), true, 'la arena al norte del canal debe pisarse');
  assert.equal(pisaPueblo(4900, 2780), false, 'sobre el agua del canal no se anda');
});

test('el servidor sabe que el canal es agua (pesca y bote)', { skip: !HAY && 'sin server2.js' }, () => {
  const m = SRV.match(/const PESCA_AGUA_RLE = \(\s*((?:'[^']*'\s*\+?\s*)+)\)/);
  assert.ok(m, 'no encuentro PESCA_AGUA_RLE en server2.js');
  const filas = m[1].match(/'([^']*)'/g).map((t) => t.slice(1, -1)).join('').split(';');
  assert.equal(filas.length, 313);
  const esAgua = (c, f) => filas[f].split(',').filter(Boolean).some((t) => {
    const [a, b] = t.split('-').map(Number);
    return c >= a && c <= b;
  });
  for (let f = 170; f <= 177; f++) {
    for (let c = 297; c <= 312; c++) assert.equal(esAgua(c, f), true, `el servidor no ve agua en ${c},${f}`);
  }
  assert.equal(esAgua(305, 165), false, 'la arena de encima del canal no es agua');
});

// ─────────────────────────────────────────────────────────────── EL MUELLE
test('el muelle se pisa de punta a punta y el agua de los lados sigue cerrada', () => {
  const general = objetos(PUEBLO, 'area_colision_general');
  const rio = general.find((o) => o.id === 139);
  const sur = general.find((o) => o.name === 'muelle_sur');
  const punta = general.find((o) => o.name === 'muelle_punta');
  assert.ok(rio && sur && punta, 'faltan los trozos del río partido por el muelle');
  // El río se parte en la pasarela (y 2770-2834) y la punta queda cerrada desde x 4598.
  assert.equal(rio.y + rio.height, 2770);
  assert.equal(sur.y, 2834);
  assert.equal(sur.x, rio.x);
  assert.equal(sur.width, rio.width);
  assert.deepEqual([punta.x, punta.y, punta.height], [4598, 2770, 64]);
  assert.ok(Math.abs(punta.x + punta.width - (rio.x + rio.width)) < 0.01, 'la punta debe cerrar hasta la orilla este');
  assert.ok(PUEBLO.nextobjectid > Math.max(...general.map((o) => o.id)), 'nextobjectid por detrás de los ids');
  // De la orilla a la punta, a dos alturas de la tabla.
  for (const y of [2750, 2762, 2790]) {
    for (let x = 4380; x <= 4580; x += 4) assert.equal(pisaPueblo(x, y), true, `el muelle no se pisa en ${x},${y}`);
  }
  assert.equal(pisaPueblo(4600, 2762), false, 'más allá de la punta es agua (amarra el ferri)');
  assert.equal(pisaPueblo(4700, 2762), false, 'el ferri no se pisa');
  assert.equal(pisaPueblo(4500, 2700), false, 'el agua al norte del muelle no se pisa');
  assert.equal(pisaPueblo(4500, 2830), false, 'el agua al sur del muelle no se pisa');
});

test('el pueblo pide su mapa con versión (el canal y el muelle cambiaron el JSON)', () => {
  const g = leer('Scenes/GameScene.js');
  // (La otra carga de 'tilemap' que hay, la de mapaxd.json, está en un comentario.)
  const cargas = [...g.matchAll(/this\.load\.tilemapTiledJSON\('tilemap',\s*'\.\/Maps\/mapa_principal\.json([^']*)'\)/g)].map((m) => m[1]);
  assert.deepEqual(cargas, ['?v=20261124b']);
});

// ─────────────────────────────────────────────────────────────── LAS LLEGADAS
test('se baja del ferri fuera de todo choque y de toda salida', () => {
  const { F } = cargarFerri();
  const zonas = leer('gf-zonas.js');
  const m = zonas.match(/pueblo_desde_puerto:\s*\{[^}]*llegada:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)/);
  assert.ok(m, 'no encuentro la llegada de pueblo_desde_puerto');
  const llegaPueblo = { x: Number(m[1]), y: Number(m[2]) };
  assert.equal(pisaPueblo(llegaPueblo.x, llegaPueblo.y), true, 'la vuelta al pueblo cae en un choque');
  assert.ok(llegaPueblo.x > 4406 && llegaPueblo.x < 4598, 'la vuelta al pueblo debe caer en el muelle');
  const g = F.SITIOS.GameScene, p = F.SITIOS.PuertoScene;
  assert.equal(pisaPueblo(g.bajada.x, g.bajada.y), true, 'si el viaje no empieza, se baja en un choque del pueblo');
  assert.equal(pisaPuerto(g.destino.x, g.destino.y), true, 'la llegada al puerto cae en un choque');
  assert.equal(pisaPuerto(p.bajada.x, p.bajada.y), true, 'si la vuelta no empieza, se baja en un choque del puerto');
  // Y lejos de las salidas del puerto (la del oeste devuelve al pueblo andando).
  const dentro = (o, x, y) => x >= o.x - 40 && x <= o.x + o.width + 40 && y >= o.y - 60 && y <= o.y + o.height + 60;
  objetos(PUERTO, 'salidas').forEach((o) => {
    assert.equal(dentro(o, g.destino.x, g.destino.y), false, 'la llegada al puerto está en la salida ' + o.name);
  });
  // El viaje pagado es el del mapa del mundo: el mismo destino y el mismo mundo.
  assert.equal(g.destino.id, 'puerto');
  assert.equal(g.destino.mundo, 13);
  assert.match(zonas, /puerto:\s*\{\s*mundo:\s*13,\s*escena:\s*'PuertoScene'/);
  assert.equal(p.destino.clave, 'pueblo_desde_puerto');
});

// ─────────────────────────────────────────────────────────────── EL DIBUJO
const DIR = path.join(BIN, 'Game', 'Objetos', 'ferri');
const ARCHIVOS = ['ferri.png', 'ferri.json', 'muelle.png', 'cartel.png'];
const PY = (() => {
  const r = spawnSync('python', ['-c', 'import PIL'], { encoding: 'utf8' });
  return r.status === 0;
})();

test('lo que hay en disco es lo que sale del generador', { skip: !PY && 'sin python con PIL' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-ferri-'));
  try {
    const r = spawnSync('python', [path.join(BIN, 'tools', 'generar-ferri.py'), '--salida', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, 'el generador falló: ' + (r.stderr || r.stdout));
    ARCHIVOS.forEach((a) => {
      assert.ok(fs.readFileSync(path.join(DIR, a)).equals(fs.readFileSync(path.join(tmp, a))),
        a + ' no es lo que da tools/generar-ferri.py (¿se editó a mano?)');
    });
    assert.deepEqual(fs.readdirSync(tmp).sort(), ARCHIVOS.slice().sort(), 'el generador deja archivos de más');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('las cotas del dibujo son las que usa gf-ferri.js', () => {
  const { F } = cargarFerri();
  const C = F.COTAS;
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'ferri.json'), 'utf8'));
  assert.equal(meta.frames.atras.frame.w, C.CUADRO);
  assert.equal(meta.frames.atras.frame.h, C.CUADRO);
  assert.equal(meta.frames.delante.frame.w, C.CUADRO);
  assert.equal(meta.meta.agua, C.AGUA);
  assert.deepEqual(meta.meta.barquero, Array.from(C.BARQUERO));
  assert.deepEqual(meta.meta.pasajero, Array.from(C.PASAJERO));
  assert.equal(C.CENTRO * 2, C.CUADRO);
  // Los pies del pasajero en el mundo: a la derecha del centro si mira al este, a la izquierda si al oeste.
  assert.deepEqual({ ...F._interno.delCuadro({ x: 4740, agua: 2846, mira: 1 }, 88, 130) }, { x: 4764, y: 2814 });
  assert.deepEqual({ ...F._interno.delCuadro({ x: 250, agua: 2716, mira: -1 }, 88, 130) }, { x: 226, y: 2684 });
  // El barquero: el atlas que pide gf-ferri (gfn_<arte>) con las cuatro miradas.
  const npc = JSON.parse(leer('Game/Sprites/npcs/barquero.json'));
  ['abajo_1', 'arriba_1', 'derecha_1', 'izquierda_1'].forEach((f) => assert.ok(npc.frames[f], 'falta ' + f + ' en barquero.json'));
});

// ─────────────────────────────────────────────────────────────── LAS REGLAS
test('el barquero no lleva fantasmas al puerto, pero sí los devuelve a casa', () => {
  let muerto = false;
  const { F, clases } = cargarFerri({ GFMuerte: { muerto: () => muerto } });
  const ir = { scene: {}, sitio: F.SITIOS.GameScene };
  const volver = { scene: {}, sitio: F.SITIOS.PuertoScene };
  const imp = F._interno.impedimento;
  assert.equal(imp(ir), null);
  assert.equal(imp(volver), null);
  muerto = true;
  assert.match(imp(ir), /ghosts/);
  assert.equal(imp(volver), null, 'un fantasma tiene que poder volver a casa');
  muerto = false;
  clases.add('in-battle');
  assert.match(imp(ir), /battle/);
  assert.match(imp(volver), /battle/);
  clases.delete('in-battle');
  ir.scene._cambiandoEscena = true;
  assert.match(imp(ir), /on your way/);
});

test('el viaje pagado mira el nivel y el VIP; la vuelta no', () => {
  let tiene = false, estado = { cargado: true }, refrescos = 0, puede = true;
  const { F } = cargarFerri({
    GFVip: { tiene: () => tiene, estado: () => estado, refrescar: () => { refrescos++; } },
    GFNivelMapa: { puede: (s, mundo) => (assert.equal(mundo, 13), puede), minimo: () => 11 }
  });
  const ir = { scene: {}, sitio: F.SITIOS.GameScene };
  const volver = { scene: {}, sitio: F.SITIOS.PuertoScene };
  const imp = F._interno.impedimento;
  assert.match(imp(ir), /VIP/);
  assert.equal(imp(volver), null, 'volver al pueblo no pide VIP');
  estado = { cargado: false };
  assert.match(imp(ir), /Checking your VIP/);
  assert.equal(refrescos, 1);
  estado = { cargado: true, sinServicio: true };
  assert.equal(imp(ir), null, 'sin servicio de VIP decide el servidor');
  tiene = true;
  estado = { cargado: true };
  assert.equal(imp(ir), null);
  puede = false;
  assert.match(imp(ir), /level 11/);
  assert.equal(imp(volver), null);
});

// ─────────────────────────────────────────────────────────────── EL MONTAJE
test('el juego carga gf-ferri y las dos escenas lo montan con su agua', () => {
  const index = leer('index.html');
  const iFerri = index.indexOf('gf-ferri.js');
  assert.ok(iFerri > 0, 'index.html no carga gf-ferri.js');
  assert.ok(iFerri < index.indexOf('Scenes/GameScene.js'), 'gf-ferri.js debe cargarse antes que las escenas');
  assert.match(index, /<script src="\.\/gf-ferri\.js\?v=22\.9\.[0-9a-f]{12}" defer><\/script>/);
  assert.doesNotMatch(index, /gf-ferri\.js\?v=22\.9\.0{12}"/, 'gf-ferri.js sin sellar (pasa el sellado de versiones)');
  const g = leer('Scenes/GameScene.js'), z = leer('Scenes/ZonasScenes.js');
  assert.match(g, /window\.GFFerri\.montar\(this\)/);
  assert.match(z, /window\.GFFerri\.montar\(this\)/);
  // El agua animada no pone nada fijo debajo del muelle ni en la ruta del ferri.
  assert.match(g, /GFAgua\.montar\(this, \{[^}]*excluir: \(window\.GFFerri && window\.GFFerri\.excluir\)/);
  assert.match(z, /GFAgua\.montar\(this, \{[\s\S]{0,200}excluir: \(window\.GFFerri && window\.GFFerri\.excluir\)/);
  const { F } = cargarFerri();
  assert.deepEqual(Object.keys(F.SITIOS).sort(), ['GameScene', 'PuertoScene']);
  const sinSitio = { sys: { settings: { key: 'MinaScene' } }, add: {}, events: {} };
  assert.equal(F.montar(sinSitio), null, 'en las demás escenas no se monta');
  assert.deepEqual(Array.from(F.excluir(sinSitio)), []);
});

test('el servidor tiene la ruta que usa el ferri (la del mapa del mundo)', { skip: !HAY && 'sin server2.js' }, () => {
  assert.match(SRV, /app\.(get|post)\(\s*['"]\/api\/viaje\/mapa['"]/);
  assert.match(SRV, /['"]\/api\/viaje\/mapa\/devolver['"]/);
  const ferri = leer('gf-ferri.js');
  assert.match(ferri, /api\('\/api\/viaje\/mapa', \{ destino: d\.id, precio: st\.ui\.precio \}\)/);
  assert.match(ferri, /api\('\/api\/viaje\/mapa\/devolver', \{ billete: pago\.billete \}\)/);
});
