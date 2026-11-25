'use strict';
/* (2026-11-19) "Cuando entro a las batallas y al terminar las colisiones fallan y el
 * personaje queda así" (dibujado detrás de la casa, metido en la fuente).
 *
 * Medido en el banco offline (Phaser real): tras ir a la arena y volver, las 10 casas y
 * el pozo tenían la profundidad SIN calibrar (herrería 1977 → 1847, tienda 1497 → 1464…)
 * y las sombras del escenario no estaban. `_buildingDepthsCalibrated` se ponía a true la
 * primera vez y no se rearmaba: Phaser REUTILIZA la instancia de la escena, así que en
 * la segunda visita la calibración (GFProfundidad) y las sombras (GFSombras) no corrían.
 *
 * La regla de "escenas-que-se-reutilizan": la bandera se rearma en create() ANTES del
 * primer await (create es async y update() empieza a correr mientras espera). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const BIN = path.resolve(__dirname, '..');

function recorrer(n, fn, raiz) {
  if (!n || typeof n !== 'object') return;
  fn(n);
  if (n !== raiz && /Function/.test(n.type)) return;           // las funciones anidadas no cuentan
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach((x) => recorrer(x, fn, raiz));
    else if (v && typeof v.type === 'string') recorrer(v, fn, raiz);
  }
}

function create(archivo, clase) {
  const src = fs.readFileSync(path.join(BIN, 'Scenes', archivo), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  let metodo = null;
  recorrer(ast, (n) => {
    if (!metodo && n.type === 'ClassDeclaration' && n.id && n.id.name === clase) {
      metodo = n.body.body.find((m) => m.type === 'MethodDefinition' && m.key.name === 'create');
    }
  }, ast);
  assert.ok(metodo, clase + '.create no encontrado');
  // El primer `await` DE VERDAD: un nodo AwaitExpression (no la palabra en un comentario).
  let primerAwait = Infinity;
  recorrer(metodo.value, (n) => { if (n.type === 'AwaitExpression' && n.start < primerAwait) primerAwait = n.start; }, metodo.value);
  // La asignación this._buildingDepthsCalibrated = false (también como nodo).
  let rearme = Infinity;
  recorrer(metodo.value, (n) => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'ThisExpression' &&
        n.left.property.name === '_buildingDepthsCalibrated' && n.right.type === 'Literal' && n.right.value === false && n.start < rearme) rearme = n.start;
  }, metodo.value);
  return { rearme, primerAwait };
}

for (const [archivo, clase] of [['GameScene.js', 'GameScene'], ['tiendajuego.js', 'tiendajuego']]) {
  test(clase + ': la calibración de profundidad y las sombras se rearman en cada entrada (antes del primer await)', () => {
    const { rearme, primerAwait } = create(archivo, clase);
    assert.ok(rearme < Infinity, clase + '.create no rearma _buildingDepthsCalibrated: al volver de una batalla las casas quedan sin calibrar');
    assert.ok(rearme < primerAwait, 'el rearme tiene que ir antes del primer await');
  });
}
