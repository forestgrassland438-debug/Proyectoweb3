/* Prueba de emergencyCleanup() y destroy() de TileManager, sin navegador.
 *
 *   node --experimental-vm-modules tools/... (no hace falta: se importa directo)
 *   node tools/tiles-prueba.mjs  <carpeta bin>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const BIN = process.argv[2] || '.';

// ── Phaser de mentira, solo lo que toca TileManager ──────────────────────────
let texturasVivas = new Set();
let spritesVivos = 0;
let bitmapsAbiertos = 0;

function nuevoSprite() {
  spritesVivos++;
  const s = {
    activo: true, x: 0, y: 0,
    setOrigin() { return s; }, setDepth() { return s; },
    setDisplaySize() { return s; }, setScrollFactor() { return s; },
    setVisible() { return s; }, setAlpha() { return s; }, setPipeline() { return s; },
    destroy() { if (s.activo) { s.activo = false; spritesVivos--; } }
  };
  return s;
}

const escena = {
  textures: {
    exists: (k) => texturasVivas.has(k),
    remove: (k) => { texturasVivas.delete(k); },
    addImage: (k) => { texturasVivas.add(k); },
    get: () => ({})
  },
  add: { image: () => nuevoSprite(), sprite: () => nuevoSprite() },
  load: { start() {}, on() {}, image() {} },
  cameras: { main: { worldView: { x: 0, y: 0, width: 800, height: 600 },
                     scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 } },
  scale: { width: 800, height: 600 },
  sys: { game: { renderer: {} } },
  time: { now: 0, addEvent: () => ({ destroy() {} }) },
  events: { on() {}, off() {}, once() {} }
};

// ── se carga la clase ────────────────────────────────────────────────────────
const src = readFileSync(path.join(BIN, 'lib/tileManager.js'), 'utf8');
/* Se escribe una copia .mjs al lado y se importa: mas simple y, si algo falla,
   el error apunta a un fichero de verdad en vez de a un data: URL de 100 KB. */
const copia = path.join(process.env.TEMP || '.', '_tilemanager_prueba.mjs');
const limpio = src.replace(/if \(typeof window[\s\S]*$/m, '');
writeFileSync(copia, limpio + '\nexport { TileManager };\n', 'utf8');
const mod = await import(pathToFileURL(copia).href);
const TileManager = mod.TileManager || mod.default;

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  → ' + x : '')); } };

// ── se monta un gestor con tiles ya "cargados" a mano ────────────────────────
function montar() {
  texturasVivas = new Set();
  spritesVivos = 0;
  // El metadata REAL del juego, no uno inventado: asi la prueba se rompe si
  // algun dia cambia el formato de recortadas/mapa.json.
  const meta = JSON.parse(readFileSync(path.join(BIN, 'recortadas/mapa.json'), 'utf8'));
  const tm = new TileManager(escena, meta, { debugMode: false });
  // Se simulan 9 tiles cargados: sprite + textura + la marca de "es mia".
  tm._texturasPropias = tm._texturasPropias || new Set();
  for (let r = 0; r < meta.rows; r++) {
    for (let c = 0; c < meta.cols; c++) {
      const key = tm.tileKey(r, c);
      texturasVivas.add(key);
      tm._texturasPropias.add(key);
      tm.loaded.set(key, { sprite: nuevoSprite(), row: r, col: c, key });
    }
  }
  // Y un par de mapas de bits descodificados sin usar.
  tm._listos = [
    { key: 'x1', _bitmap: { close() { bitmapsAbiertos--; } } },
    { key: 'x2', _bitmap: { close() { bitmapsAbiertos--; } } }
  ];
  bitmapsAbiertos = 2;
  tm.loadQueue = [{ key: 'z1' }, { key: 'z2' }];
  tm.currentLoads = 2;
  return tm;
}

console.log('\n=== emergencyCleanup(): suelta la memoria y deja el gestor VIVO ===');
let tm = montar();
const N = 9;   // 3x3 en recortadas/mapa.json
ok(texturasVivas.size === N && spritesVivos === N,
   'de partida: ' + N + ' texturas y ' + N + ' sprites');
const r = tm.emergencyCleanup();
ok(texturasVivas.size === 0, 'libera TODAS las texturas (' + texturasVivas.size + ' quedan)');
ok(spritesVivos === 0, 'destruye todos los sprites (' + spritesVivos + ' quedan)');
ok(bitmapsAbiertos === 0, 'cierra los mapas de bits sin usar');
ok(tm.loadQueue.length === 0 && tm.currentLoads === 0, 'vacia la cola de descarga');
ok(tm._destroyed !== true, 'NO marca el gestor como destruido (sigue usable)');
ok(r && r.tiles === N, 'informa de lo liberado: ' + JSON.stringify(r));

console.log('\n=== y es idempotente ===');
const r2 = tm.emergencyCleanup();
ok(r2.tiles === 0 && r2.texturas === 0, 'llamarlo dos veces no revienta ni resta de mas');

console.log('\n=== sigue usable despues: se pueden volver a cargar tiles ===');
texturasVivas.add(tm.tileKey(0, 0));
tm._texturasPropias.add(tm.tileKey(0, 0));
tm.loaded.set(tm.tileKey(0, 0), { sprite: nuevoSprite(), row: 0, col: 0, key: tm.tileKey(0, 0) });
ok(tm.loaded.size === 1, 'admite un tile nuevo despues de la emergencia');
tm.emergencyCleanup();
ok(texturasVivas.size === 0, 'y lo vuelve a soltar');

console.log('\n=== destroy(): lo mismo, pero deja el gestor inservible ===');
tm = montar();
tm.destroy();
ok(texturasVivas.size === 0, 'libera las texturas');
ok(spritesVivos === 0, 'destruye los sprites');
ok(tm._destroyed === true, 'marca el gestor como destruido');
ok(tm.emergencyCleanup().tiles === 0, 'y emergencyCleanup ya no toca nada sobre un gestor muerto');

console.log('\n' + '='.repeat(56));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
