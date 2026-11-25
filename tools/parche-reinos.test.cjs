'use strict';
/* LOS SIETE REINOS VAN EN EL PARCHE DE DESPLIEGUE (2026-11-21).
 *
 * GrasslandBuild/scripts/prepare-deploy.cjs copia los scripts que enlaza
 * index.html y una LISTA de recursos: lo que no esté en ella no llega a la web
 * publicada, y el juego pediría el suelo, el mapa o los sonidos de un reino y
 * recibiría un 404. Aquí se ejecuta prepare-deploy de verdad, pero con un `fs`
 * que no escribe nada (copiar, borrar y crear carpetas solo se apuntan; leer
 * lee de bin), y se exige que la lista lleve todo lo de los reinos: el suelo
 * en trozos, el mapa, los objetos y árboles 2.5D, la música y el ambiente; el
 * arte de los monstruos, la fauna y los NPC; y los ambientes que se
 * regeneraron para que no chasqueen al dar la vuelta.
 *
 *   node --test tools/parche-reinos.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const PREPARAR = process.env.GF_PREPARE_DEPLOY || path.join(BIN, 'GrasslandBuild/scripts/prepare-deploy.cjs');
const HAY_LOGIN = fs.existsSync(path.join(BIN, '../../login-sonmia/dist/index.html'));

// Lo esperado (escrito a mano).
const REINOS = ['puerto', 'pantano', 'aldor', 'colinas', 'selva', 'volcan', 'hongos'];
const SCRIPTS = ['Scenes/ReinosScenes.js', 'gf-reinos.js'];
// Los ambientes que ya estaban en el juego y se regeneraron (tools/ambientes-bucle.test.cjs).
const REGENERADOS = ['amb_nieve.wav', 'amb_cementerio.wav', 'amb_glaciar.wav', 'amb_ventisca.wav', 'amb_caverna.wav'];

/** Lo que copiaría prepare-deploy.cjs a deploy/game-patch, sin tocar el disco. */
let listaYa = null;
function listaDelParche() {
  if (listaYa) return listaYa;
  const copias = new Map();   // destino → origen
  const falso = Object.assign({}, fs, {
    mkdirSync() {}, rmSync() {}, cpSync() {}, writeFileSync() {},
    copyFileSync(origen, destino) { copias.set(path.resolve(String(destino)), path.resolve(String(origen))); },
    // El manifiesto lee el destino recién copiado para su sha256: se lee el origen.
    readFileSync(f, ...resto) { return fs.readFileSync(copias.get(path.resolve(String(f))) || f, ...resto); }
  });
  const exigir = (m) => (m === 'node:fs' || m === 'fs' ? falso : require(m));
  const envuelto = '(function (require, __dirname, __filename, module, exports, console) {' + fs.readFileSync(PREPARAR, 'utf8') + '\n})';
  vm.runInThisContext(envuelto, { filename: PREPARAR })(exigir, path.dirname(PREPARAR), PREPARAR, { exports: {} }, {}, { log() {} });
  const raiz = path.resolve(path.dirname(PREPARAR), '..', 'deploy', 'game-patch');
  listaYa = new Set();
  for (const destino of copias.keys()) {
    const rel = path.relative(raiz, destino);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) listaYa.add(rel.split(path.sep).join('/'));
  }
  return listaYa;
}

/** Los archivos de una carpeta de bin (con sus subcarpetas) que cumplen `ok`. */
function archivos(dir, ok) {
  const abs = path.join(BIN, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? archivos(dir + '/' + e.name, ok) : (ok(e.name) ? [dir + '/' + e.name] : [])));
}
const trozo = (n) => /\.(png|webp|json)$/.test(n) && !n.startsWith('_');
const arte = (n) => /\.(png|json)$/.test(n) && !n.startsWith('_');

/** Los que faltan en el parche (y los que no existen en bin, que son otro fallo). */
function fuera(lista) {
  const parche = listaDelParche();
  const noExisten = lista.filter((f) => !fs.existsSync(path.join(BIN, f)));
  assert.deepEqual(noExisten, [], 'no existen en bin');
  return lista.filter((f) => !parche.has(f));
}

test('el parche lleva cada reino: el suelo en trozos, el mapa, sus objetos y árboles, su música y su ambiente', { skip: !HAY_LOGIN && 'sin el login compilado prepare-deploy no arranca' }, () => {
  const faltan = [];
  for (const z of REINOS) {
    const trozos = archivos('recortadas_' + z, trozo), suyos = archivos('Game/MAPAS/' + z, arte);
    assert.ok(trozos.length >= 150, z + ': ' + trozos.length + ' trozos de suelo');   // 25 por calidad, en PNG y WebP
    assert.ok(suyos.length >= 4, z + ': ' + suyos.length + ' archivos de objetos y árboles');
    faltan.push(...fuera([...trozos, ...suyos, 'Maps/' + z + '.json', 'Game/MUSIC/gf_' + z + '.wav', 'Game/MUSIC/amb_' + z + '.wav']));
  }
  assert.deepEqual(faltan.slice(0, 12), [], faltan.length + ' archivos de los reinos fuera del parche');
});

test('el parche lleva sus escenas, el arte de monstruos, fauna y NPC, el mapa del mundo y los ambientes regenerados', { skip: !HAY_LOGIN && 'sin el login compilado prepare-deploy no arranca' }, () => {
  const lista = [...SCRIPTS, ...REGENERADOS.map((n) => 'Game/MUSIC/' + n),
                 ...archivos('Game/Sprites/monstruos', arte), ...archivos('Game/Sprites/fauna3d', arte),
                 ...archivos('Game/Sprites/npcs', arte), ...archivos('Game/MAPAS/mundo', trozo)];
  assert.ok(lista.length > 200, 'archivos mirados: ' + lista.length);
  const faltan = fuera(lista);
  assert.deepEqual(faltan.slice(0, 12), [], faltan.length + ' fuera del parche');
});
