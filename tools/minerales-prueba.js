/* LOS TRES MINERALES NUEVOS: que estén EN TODAS PARTES y que la mina los suelte.
 * =============================================================================
 * `mineral_piedra_cobre`, `mineral_piedra_hierro` y `mineral_carbon` son la
 * piedra en bruto que se pica; `mineral_cobre` y `mineral_hierro` son los
 * lingotes que salen del horno. Son tablas DISTINTAS del contrato.
 *
 * Un ítem nuevo hay que darlo de alta en CINCO sitios, y olvidarse de uno no
 * da error — da un fallo mudo distinto en cada caso:
 *
 *   · GameScene.ItemDefinitions      → sin `tipo` no se acuña y /api/save lo tira
 *   · tiendajuego.ItemDefinitions    → el inventario se ve distinto en la tienda
 *   · LoadingScenegame.ItemDefinitions → lo que está en la cadena y no en la BD
 *                                       se descarta al entrar al mapa
 *   · server2 ITEM_TIPO_MAP          → la tabla no se da de alta en el contrato
 *                                       y createInvoice revierta (TipoNotConfigured)
 *   · marketplace-routes             → no se puede publicar en el mercado
 *
 *     node tools/minerales-prueba.js  [carpeta bin]  [ruta de server2.js]
 * =============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const SERVER = process.argv[3] || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');

let fallos = 0, pasadas = 0;
function ok(cond, mensaje, extra) {
  if (cond) { pasadas++; console.log('  OK   ' + mensaje); }
  else { fallos++; console.log('  FALLO ' + mensaje + (extra !== undefined ? '  -> ' + extra : '')); }
}

/** Saca un objeto literal del fuente contando llaves desde una marca. */
function objetoTras(txt, marca) {
  const i = txt.indexOf(marca);
  if (i < 0) return null;
  const ini = txt.indexOf('{', i + marca.length - 1);
  let p = 0, j = ini;
  for (; j < txt.length; j++) {
    const c = txt[j];
    if (c === '{') p++;
    else if (c === '}') { p--; if (!p) { j++; break; } }
  }
  try { return eval('(' + txt.slice(ini, j) + ')'); } catch (e) { return null; }
}

const leer = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const NUEVOS = {
  mineral_piedra_cobre:  { src: './Game/Source/piedra_cobre.png',  tipo: 'mineral_piedra_cobre',  maxStack: 20 },
  mineral_piedra_hierro: { src: './Game/Source/piedra_hierro.png', tipo: 'mineral_piedra_hierro', maxStack: 20 },
  mineral_carbon:        { src: './Game/Source/piedra_carbon.png', tipo: 'mineral_carbon',        maxStack: 20 }
};
const LINGOTES = ['mineral_cobre', 'mineral_hierro'];

console.log('=== LOS TRES MINERALES NUEVOS ===\n');

// ── 1. Los catálogos del cliente ────────────────────────────────────────────
console.log('1) Están en los cuatro catálogos, con el mismo src y el mismo tipo');
const catalogos = {
  'GameScene':        objetoTras(leer(path.join(BIN, 'Scenes', 'GameScene.js')),        'this.ItemDefinitions = {'),
  'tiendajuego':      objetoTras(leer(path.join(BIN, 'Scenes', 'tiendajuego.js')),      'this.ItemDefinitions = {'),
  'LoadingScenegame': objetoTras(leer(path.join(BIN, 'Scenes', 'LoadingScenegame.js')), 'this.ItemDefinitions = {'),
  'tienda_sistema':   objetoTras(leer(path.join(BIN, 'tienda_sistema.js')),             '_ItemDefinitionsRespaldo = {')
};

for (const [nombre, cat] of Object.entries(catalogos)) {
  if (!cat) { ok(false, 'se pudo leer el catálogo de ' + nombre); continue; }
  for (const [id, esperado] of Object.entries(NUEVOS)) {
    const def = cat[id];
    if (!def) { ok(false, `${nombre}: falta ${id}`); continue; }
    const mismaImagen = String(def.src).replace(/^\.\//, '') === esperado.src.replace(/^\.\//, '');
    ok(mismaImagen, `${nombre}: ${id} apunta a ${esperado.src}`, def.src);
    ok(Number(def.maxStack) === esperado.maxStack, `${nombre}: ${id} apila ${esperado.maxStack}`, String(def.maxStack));
    // LoadingScenegame no guarda `tipo` en su catálogo (no acuña); los demás sí.
    if (nombre !== 'LoadingScenegame') {
      ok(def.tipo === esperado.tipo, `${nombre}: ${id} usa la tabla ${esperado.tipo}`, String(def.tipo));
    }
  }
}

// ── 2. Las imágenes existen ─────────────────────────────────────────────────
console.log('\n2) Las imágenes están en el disco');
for (const [id, esperado] of Object.entries(NUEVOS)) {
  const ruta = path.join(BIN, esperado.src.replace(/^\.\//, ''));
  ok(fs.existsSync(ruta), `${id}: existe ${esperado.src}`, ruta);
}

// ── 3. Las tablas nuevas NO son las de los lingotes ─────────────────────────
console.log('\n3) Las tablas de la piedra y las del lingote son distintas');
{
  const g = catalogos.GameScene || {};
  const tipos = [...Object.keys(NUEVOS), ...LINGOTES].map(id => g[id] && g[id].tipo);
  ok(tipos.every(Boolean), 'los cinco tienen tabla on-chain', JSON.stringify(tipos));
  ok(new Set(tipos).size === tipos.length, 'y las cinco tablas son distintas', JSON.stringify(tipos));
}

// ── 4. Lo que suelta la mina ────────────────────────────────────────────────
console.log('\n4) La mina suelta piedra en bruto, NO lingotes');
{
  const src = leer(path.join(BIN, 'Scenes', 'GameScene.js'));
  const rewards = objetoTras(src, 'const mineRewards = {');
  ok(!!rewards, 'se pudo leer mineRewards');

  if (rewards) {
    const idsDe = (clave) => (rewards[clave] ? rewards[clave].items.map(i => i.id) : []);

    const cobres  = Object.keys(rewards).filter(k => k.includes('cobre'));
    const hierros = Object.keys(rewards).filter(k => k.includes('hierro'));
    const carbons = Object.keys(rewards).filter(k => k.includes('carbon'));
    ok(cobres.length === 4 && hierros.length === 3 && carbons.length === 2,
       'siguen estando las 9 vetas de siempre',
       `${cobres.length}/${hierros.length}/${carbons.length}`);

    cobres.forEach(k => {
      const ids = idsDe(k);
      ok(ids.includes('mineral_piedra_cobre'), `${k} da piedra de cobre`, ids.join(','));
      ok(!ids.includes('mineral_cobre'), `${k} YA NO da el lingote`, ids.join(','));
    });
    hierros.forEach(k => {
      const ids = idsDe(k);
      ok(ids.includes('mineral_piedra_hierro'), `${k} da piedra de hierro`, ids.join(','));
      ok(!ids.includes('mineral_hierro'), `${k} YA NO da el lingote`, ids.join(','));
    });
    carbons.forEach(k => {
      const ids = idsDe(k);
      ok(ids.includes('carbon'), `${k} sigue dando carbón (el combustible)`, ids.join(','));
      ok(ids.includes('mineral_carbon'), `${k} da además la piedra de carbón`, ids.join(','));
    });

    // Nada que se suelte puede quedarse sin ficha: sin `tipo` no se acuña.
    const g = catalogos.GameScene || {};
    const sueltos = new Set();
    Object.values(rewards).forEach(r => (r.items || []).forEach(i => sueltos.add(i.id)));
    const sinFicha = [...sueltos].filter(id => !g[id] || !g[id].tipo);
    ok(sinFicha.length === 0, 'todo lo que suelta la mina tiene ficha y tabla', sinFicha.join(', '));
  }
}

// ── 5. Las recetas del horno cuadran con el catálogo ────────────────────────
console.log('\n5) El horno funde lo que existe');
{
  const src = leer(path.join(BIN, 'Scenes', 'GameScene.js'));
  const recetas = objetoTras(src, 'get FURNACE_RECIPES() {\n    return {');
  ok(!!recetas, 'se pudo leer FURNACE_RECIPES');
  if (recetas) {
    const g = catalogos.GameScene || {};
    for (const [entrada, r] of Object.entries(recetas)) {
      ok(!!(g[entrada] && g[entrada].tipo), `la entrada ${entrada} existe y tiene tabla`);
      ok(!!(g[r.resultado] && g[r.resultado].tipo), `el resultado ${r.resultado} existe y tiene tabla`);
      ok(g[entrada].tipo !== g[r.resultado].tipo,
         `${entrada} y ${r.resultado} NO comparten tabla`, g[entrada].tipo);
    }
    ok(recetas.mineral_piedra_cobre && recetas.mineral_piedra_cobre.segundos === 60,
       'el cobre tarda 1 minuto');
    ok(recetas.mineral_piedra_hierro && recetas.mineral_piedra_hierro.segundos === 300,
       'el hierro tarda 5 minutos');
  }
}

// ── 6. El backend ───────────────────────────────────────────────────────────
console.log('\n6) El backend puede dar de alta las tablas nuevas');
if (!fs.existsSync(SERVER)) {
  console.log('  (no encuentro server2.js en ' + SERVER + ' — se salta)');
} else {
  const s = leer(SERVER);
  const mapa   = objetoTras(s, 'const ITEM_TIPO_MAP = {');
  const stacks = objetoTras(s, 'const ITEM_MAX_STACK = {');
  const gather = objetoTras(s, 'const GATHER_REWARD_TIPO = {');

  for (const [id, esperado] of Object.entries(NUEVOS)) {
    ok(!!mapa && mapa[id] === esperado.tipo,
       `ITEM_TIPO_MAP: ${id} → ${esperado.tipo}`, mapa ? String(mapa[id]) : 'no leído');
    ok(!!stacks && Number(stacks[id]) === esperado.maxStack,
       `ITEM_MAX_STACK: ${id} = ${esperado.maxStack}`, stacks ? String(stacks[id]) : 'no leído');
  }

  /* GATHER_TIPOS (los valores de GATHER_REWARD_TIPO) es la lista de tablas que
     el CLIENTE tiene prohibido acuñar cuando GATHER_ENFORCE está activo. Los
     lingotes NO pueden estar ahí: los acuña el horno, desde el cliente. */
  ok(!!gather && gather.cobre === 'mineral_piedra_cobre',
     'la veta de cobre suelta piedra, no lingote', gather ? String(gather.cobre) : 'no leído');
  ok(!!gather && gather.hierro === 'mineral_piedra_hierro',
     'la veta de hierro suelta piedra, no lingote', gather ? String(gather.hierro) : 'no leído');
  const prohibidos = gather ? Object.values(gather) : [];
  ok(!prohibidos.includes('mineral_cobre') && !prohibidos.includes('mineral_hierro'),
     'los lingotes NO están en la lista que el cliente no puede acuñar',
     prohibidos.join(', '));
}

// ── 7. El mercado ───────────────────────────────────────────────────────────
console.log('\n7) Se pueden publicar en el mercado');
{
  const m = leer(path.join(BIN, 'marketplace-routes.js'));
  for (const id of Object.keys(NUEVOS)) {
    ok(new RegExp('\\n\\s*' + id + '\\s*:').test(m), `marketplace-routes conoce ${id}`);
  }
}

console.log('\n' + '='.repeat(62));
console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
if (fallos) { console.log('\nHay minerales mal dados de alta.'); process.exit(1); }
console.log('Sin fallos.');
process.exit(0);
