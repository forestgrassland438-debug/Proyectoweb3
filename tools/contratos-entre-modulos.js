/* ¿Llama alguien a un metodo de otro modulo que NO existe?
 *
 * Es el fallo que ya aparecio dos veces en este proyecto y que no da error:
 *   - `tm.emergencyCleanup()` no existia; la llamada iba envuelta en
 *     `if (typeof … === 'function')` y no hacia nada, en silencio.
 *   - gf-audio leia `scene.__gfCuervo` y gf-cuervo guarda `__gfCuervos`:
 *     los cuervos no graznaban nunca.
 *
 * Se cargan todos los modulos gf-* en un entorno de mentira, se lee su API
 * publica y se comprueba contra todas las llamadas `GFxxx.metodo(` que
 * aparecen en el codigo.
 *
 *   node tools/contratos-entre-modulos.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2] || '.';

// ── entorno de mentira, lo justo para que los modulos se declaren ───────────
const nada = () => {};
const ctx = {
  console: { log: nada, warn: nada, error: nada, info: nada },
  Math, Date, JSON, Object, Array, Number, String, Boolean, Set, Map, Promise,
  isFinite, parseFloat, parseInt, Infinity, NaN, Error, RegExp, Symbol,
  setTimeout: () => 0, clearTimeout: nada, setInterval: () => 0, clearInterval: nada,
  fetch: () => Promise.reject(new Error('sin red')),
  document: {
    createElement: () => ({ getContext: () => null, style: {}, classList: { add: nada, remove: nada } }),
    getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], addEventListener: nada, removeEventListener: nada,
    body: { appendChild: nada }, head: { appendChild: nada }, readyState: 'complete'
  },
  localStorage: { getItem: () => null, setItem: nada, removeItem: nada },
  sessionStorage: { getItem: () => null, setItem: nada, removeItem: nada },
  location: { origin: 'http://x', href: 'http://x', hostname: 'x' },
  navigator: { userAgent: '', language: 'es' },
  performance: { now: () => 0 },
  Phaser: { BlendModes: { ADD: 1, MULTIPLY: 2, NORMAL: 0, SCREEN: 3 },
            Math: { Between: () => 0, FloatBetween: () => 0 },
            Display: { Color: { GetColor: () => 0 } },
            Geom: { Rectangle: function () {} },
            Textures: { FilterMode: { NEAREST: 0 } } }
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.self = ctx;
vm.createContext(ctx);

const modulos = fs.readdirSync(BIN)
  .filter((f) => /^gf-.*\.js$/.test(f) && f !== 'gf-redirect.js')
  .sort();

const cargados = [];
for (const f of modulos) {
  try {
    vm.runInContext(fs.readFileSync(path.join(BIN, f), 'utf8'), ctx, { filename: f });
    cargados.push(f);
  } catch (e) {
    console.log('  (no se pudo cargar ' + f + ': ' + e.message + ')');
  }
}

// ── que API publica ha quedado declarada ────────────────────────────────────
const api = {};
for (const k of Object.keys(ctx)) {
  if (!/^GF[A-Z]/.test(k)) continue;
  const o = ctx[k];
  if (!o || typeof o !== 'object') continue;
  api[k] = new Set(Object.keys(o));
}

// ── todas las llamadas GFxxx.metodo( que hay en el codigo ───────────────────
function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'temp_old', 'XDPRUEBA', 'tools'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (/\.(js|html)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const llamadas = new Map();          // "GFClima.ahora" -> [ficheros]
const re = /\b(?:window\.)?(GF[A-Z][A-Za-z]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
for (const f of ficheros(BIN)) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(txt)) !== null) {
    const clave = m[1] + '.' + m[2];
    if (!llamadas.has(clave)) llamadas.set(clave, new Set());
    llamadas.get(clave).add(path.relative(BIN, f));
  }
}

let fallos = 0, comprobadas = 0;
console.log('Modulos cargados: ' + cargados.length +
            '  ·  APIs vistas: ' + Object.keys(api).join(', '));
console.log('');

const rotas = [];
for (const [clave, donde] of [...llamadas].sort()) {
  const [mod, met] = clave.split('.');
  if (!api[mod]) continue;                       // modulo que no se pudo cargar
  comprobadas++;
  if (!api[mod].has(met)) {
    rotas.push({ clave, donde: [...donde] });
    fallos++;
  }
}

if (rotas.length) {
  console.log('LLAMADAS A METODOS QUE NO EXISTEN:');
  for (const r of rotas) {
    console.log('  FALLO  ' + r.clave + '()   llamado desde: ' + r.donde.join(', '));
  }
} else {
  console.log('  OK   las ' + comprobadas + ' llamadas entre modulos apuntan a metodos que existen');
}

// ── y el estado que cada modulo guarda en la escena ─────────────────────────
console.log('');
const guardados = new Set();
const usados = new Map();
for (const f of ficheros(BIN)) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  /* Cualquier cosa a la que se le cuelgue la marca, no solo `scene.`: hay
     estados que viven en sprites (`spr.__gfSombra`), en `window`
     (`window.__gfCraftingSystem`) o en variables sueltas. Mirando solo
     `scene.` salian dieciseis falsos positivos. */
  const reGuarda = /\.(__gf[A-Za-z]+)\s*=[^=]/g;
  while ((m = reGuarda.exec(txt)) !== null) guardados.add(m[1]);
  const reUsa = /\.(__gf[A-Za-z]+)\b/g;
  while ((m = reUsa.exec(txt)) !== null) {
    if (!usados.has(m[1])) usados.set(m[1], new Set());
    usados.get(m[1]).add(path.relative(BIN, f));
  }
}
/* Los que se leen a proposito sin que nadie de aqui los escriba. Cada uno con
   su motivo: si alguno deja de tenerlo, se quita de aqui y vuelve a saltar. */
const CON_MOTIVO = {
  __gfNombre: 'respaldo de spr.getData("gfNombre"); se lee con || y puede no estar',
  __gfWallet: 'campo de un postMessage que manda la pagina de login, no este codigo'
};
const huerfanos = [...usados.keys()]
  .filter((k) => !guardados.has(k) && !CON_MOTIVO[k]);
if (huerfanos.length) {
  console.log('ESTADOS DE ESCENA QUE SE LEEN Y NADIE ESCRIBE:');
  for (const h of huerfanos) {
    console.log('  FALLO  ' + h + '   leido en: ' + [...usados.get(h)].join(', '));
    fallos++;
  }
} else {
  console.log('  OK   todo `__gfXxx` que se lee lo escribe alguien (' +
              guardados.size + ' estados, ' + Object.keys(CON_MOTIVO).length +
              ' con motivo declarado)');
}

console.log('\n' + '='.repeat(60));
console.log(fallos ? 'FALLOS: ' + fallos : 'Sin fallos.');
process.exit(fallos ? 1 : 0);
