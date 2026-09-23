/* ¿Qué función puede dejar una escena retenida para siempre sin que se vea?
 *
 * EL FALLO QUE VIGILA (encontrado midiendo con WeakRef, 2026-09-23): en
 * gf-mascota.montar(scene), un cierre usaba `scene` (`desmontar(scene)`) y, en
 * la MISMA función, se creaba un setInterval que vive toda la página. El motor
 * de JavaScript guarda las variables que usa cualquier cierre en UN contexto
 * compartido por todos los cierres de esa llamada: el intervalo, aunque no
 * nombrara `scene`, la retenía. Resultado: la primera GameScene no se liberaba
 * nunca, por muchas veces que se fuera y volviera de la tienda.
 *
 * Esto no se ve leyendo, ni con el recorrido de propiedades de window: hay que
 * buscar el patrón. Una función es sospechosa si:
 *   1. tiene un parámetro que es una escena (`scene`, `escena`, `sc`), y
 *   2. algún cierre suyo usa ese parámetro (va al contexto), y
 *   3. crea OTRO cierre que se escapa a nivel de página: setInterval,
 *      addEventListener sobre window/document/global/visualViewport, `.on(` de
 *      un socket global, o se asigna a una variable del módulo o de window.
 *
 *   node tools/contexto-retenido.js [carpeta bin]
 *
 * Lo que salga hay que mirarlo a mano: si el cierre que escapa se libera en el
 * apagado de esa escena no hay fuga. Lo seguro es que NO se cree dentro de la
 * función: una función del módulo no arrastra ningún contexto.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const espree = require(path.resolve(BIN, 'node_modules', 'espree'));

const PARAMS = new Set(['scene', 'escena', 'sc', 'gameScene', 'targetScene', 'owner']);
const ES_FUNCION = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' ||
                                n.type === 'ArrowFunctionExpression');

function hijos(n) {
  const out = [];
  for (const k of Object.keys(n)) {
    if (k === 'parent') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(x => { if (x && typeof x.type === 'string') out.push(x); });
    else if (v && typeof v.type === 'string') out.push(v);
  }
  return out;
}

/* DOS PASADAS A PROPÓSITO: primero se enlaza cada nodo con su padre y luego
   se analiza. Haciéndolo en una, al mirar una función sus cierres todavía no
   tenían `parent` y nada "escapaba": el detector decía "ninguno" con el fallo
   delante (se comprobó con un caso de prueba que debía cazar). */
function enlazarPadres(n, padre) {
  n.parent = padre;
  hijos(n).forEach(h => enlazarPadres(h, n));
}
function recorrer(n, fn) {
  fn(n);
  hijos(n).forEach(h => recorrer(h, fn));
}

/** ¿Usa `nombre` algún identificador dentro de `nodo` (sin contar funciones que lo redeclaren)? */
function usa(nodo, nombre) {
  let si = false;
  (function mira(n) {
    if (si) return;
    if (n.type === 'Identifier' && n.name === nombre) {
      const p = n.parent;
      // `obj.nombre` no es la variable
      if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;
      if (p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand) return;
      si = true; return;
    }
    if (ES_FUNCION(n) && n.params.some(pr => pr.type === 'Identifier' && pr.name === nombre)) return;
    hijos(n).forEach(mira);
  })(nodo);
  return si;
}

/** ¿Usa `this` (el léxico: se atraviesan flechas, no funciones normales)? */
function usaThis(nodo) {
  let si = false;
  (function mira(n, raiz) {
    if (si) return;
    if (n.type === 'ThisExpression') { si = true; return; }
    if (!raiz && (n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration')) return;
    hijos(n).forEach(h => mira(h, false));
  })(nodo.body, true);
  return si;
}

/** Cierres de primer nivel dentro de F (no los de dentro de otros cierres). */
function cierres(F) {
  const out = [];
  (function mira(n) {
    for (const h of hijos(n)) {
      if (ES_FUNCION(h)) out.push(h);
      else mira(h);
    }
  })(F.body);
  return out;
}

const OBJETIVOS_PAGINA = /^(window|document|global|root|doc|globalThis|visualViewport|vv)$/;
const EMISORES_JUEGO = /^(this\.|scene\.|escena\.)?(sys\.)?(game\.events|scale|registry(\.events)?|sound|textures|anims)$/;

/** Variables locales de F que son un alias de `this` (`const self = this`). */
function aliasDeThis(F) {
  const out = [];
  (function mira(n) {
    for (const h of hijos(n)) {
      if (ES_FUNCION(h)) continue;
      if (h.type === 'VariableDeclarator' && h.id.type === 'Identifier' && h.init &&
          h.init.type === 'ThisExpression') out.push(h.id.name);
      mira(h);
    }
  })(F.body);
  return out;
}

/** ¿Este cierre se escapa a nivel de página? Devuelve el motivo o null. */
function escapa(c) {
  const p = c.parent;
  if (!p) return null;
  if (p.type === 'CallExpression' && p.arguments.includes(c)) {
    const cal = p.callee;
    const nombre = cal.type === 'Identifier' ? cal.name
      : (cal.type === 'MemberExpression' && !cal.computed ? cal.property.name : '');
    const obj = cal.type === 'MemberExpression' ? cal.object : null;
    const objNombre = obj ? (obj.type === 'Identifier' ? obj.name
      : (obj.type === 'MemberExpression' && !obj.computed ? obj.property.name : '')) : '';
    if (nombre === 'setInterval') return 'setInterval';
    if (nombre === 'addEventListener' && OBJETIVOS_PAGINA.test(objNombre)) return objNombre + '.addEventListener';
    if (nombre === 'on' && /globalSocket|socket/i.test(objNombre) && /global/i.test(src(obj))) return 'globalSocket.on';
    /* El socket en una variable local (`var s = socketVivo(); s.on(...)`) o a
       través de un ayudante que lo engancha (`poner('chatMessage', fn)`): así
       estaba la fuga de gf-chat-social, que este detector no veía. */
    if ((nombre === 'on' || nombre === 'once') && /^(s|sk|sock|socket|sockete|io)$/.test(objNombre)) return objNombre + '.' + nombre;
    if (!obj && /^(poner|escuchar|engancharSocket|ponerOyente)$/.test(nombre)) return nombre + '(…)';
    /* Los gestores de Phaser que son del JUEGO, no de la escena: un oyente
       puesto ahí desde una escena vive tanto como la partida. (`this.anims` de
       una ESCENA es el gestor global; el de un sprite es `x.anims` y no cuenta.) */
    if ((nombre === 'on' || nombre === 'once' || nombre === 'addListener') && obj &&
        EMISORES_JUEGO.test(src(obj))) return src(obj) + '.' + nombre;
  }
  if (p.type === 'AssignmentExpression' && p.right === c) {
    const l = p.left;
    if (l.type === 'MemberExpression' && l.object.type === 'Identifier' &&
        OBJETIVOS_PAGINA.test(l.object.name)) return 'asignado a ' + l.object.name + '.' + (l.property.name || '?');
    if (l.type === 'MemberExpression' && !l.computed && l.property.type === 'Identifier') {
      // `sceneManager.start = fn`: un gestor de Phaser es del JUEGO entero
      // (así estaba el envoltorio de GameScene que retenía la primera escena).
      const base = l.object.type === 'Identifier' ? l.object.name
        : (l.object.type === 'MemberExpression' && !l.object.computed ? l.object.property.name : '');
      if (/^(sceneManager|manager|game|registry|sound|textures|anims|scale)$/.test(base)) {
        return 'asignado a ' + src(l.object) + '.' + l.property.name;
      }
    }
  }
  return null;
}

let FUENTE = '';
function src(n) { return FUENTE.slice(n.start, n.end); }

/* `this` solo es una escena dentro de una clase que hereda de una. En los
   hubs, gestores y librerías `this` es un objeto de la página y su intervalo
   no retiene ninguna escena: marcarlos era puro ruido. */
const PADRE_ESCENA = /(^|\.)(Scene|GameScene|tiendajuego|MinaScene|LandsScene|BattleScene)$/;
function claseDeEscena(n) {
  // Solo los MÉTODOS de la clase: en un método de un objeto literal (el
  // reportero de errores, por ejemplo) `this` es ese objeto, no la escena.
  if (!n.parent || n.parent.type !== 'MethodDefinition' || n.parent.static) return false;
  for (let p = n.parent; p; p = p.parent) {
    if (p.type === 'ClassDeclaration' || p.type === 'ClassExpression') {
      return !!(p.superClass && PADRE_ESCENA.test(src(p.superClass)));
    }
  }
  return false;
}

/** Nombre de la función (método, declaración o propiedad) para las excepciones. */
function nombreFuncion(n) {
  if (n.id && n.id.name) return n.id.name;
  const p = n.parent;
  if (p && (p.type === 'MethodDefinition' || p.type === 'Property') && p.key) return p.key.name || p.key.value || '?';
  if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  return '?';
}

/* REVISADOS A MANO, cada uno con su motivo. Están aquí para que el detector
   quede en CERO: lo que aparezca a partir de ahora es nuevo. Si una función
   cambia y el motivo deja de valer, se quita de la lista y vuelve a saltar. */
const EXCEPCIONES = {
  'Scenes/GameScene.js#setupResourceLockSocket':
    'sus oyentes del socket se quitan en `soltar` (_onceSceneEnd) al apagar la escena',
  'Scenes/GameScene.js#setupCropSocketEvents':
    'los 13 eventos de cultivo se quitan al apagar la escena (_onceSceneEnd) y otra vez al entrar',
  'Scenes/GameScene.js#_registrarEventosModeracion':
    'los eventos de moderación los quita `soltar` de setupResourceLockSocket al apagar la escena',
  'Scenes/GameScene.js#setupAudioCleanup':
    '_audioCleanupTimer se cancela antes de crear otro y en shutdown',
  'Scenes/GameScene.js#_iniciarRegeneracionVitales':
    '_regenVitalesTimer lo para _stopVitalRegen al apagar la escena',
  'Scenes/LoadingScenegame.js#startAutoRefresh':
    'autoRefreshInterval lo para _pararRelojes al apagar la escena',
  'Scenes/LoadingScenegame.js#create':
    'intervalId lo para _pararRelojes al apagar la escena (turno/vigente)',
  'Scenes/LoadingScenegame.js#setupActivityTracking':
    '_actividadTimer y los oyentes de window los suelta _pararSeguimientoActividad en shutdown/destroy'
};
function exceptuado(fichero, F) {
  const clave = fichero.split(path.sep).join('/') + '#' + nombreFuncion(F);
  return Object.prototype.hasOwnProperty.call(EXCEPCIONES, clave);
}

function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'temp_old', 'XDPRUEBA', 'tools', 'recortadas', 'vendor',
         'Game', 'assets', 'fonts', 'Maps', '.claude'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (/\.js$/.test(e.name) && !/^_prueba/.test(e.name)) acc.push(p);
  }
  return acc;
}

const hallazgos = [];
for (const f of ficheros(BIN)) {
  FUENTE = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = espree.parse(FUENTE, { ecmaVersion: 'latest', sourceType: 'script', range: false, loc: true }); }
  catch (e) {
    try { ast = espree.parse(FUENTE, { ecmaVersion: 'latest', sourceType: 'module', loc: true }); }
    catch (e2) { console.log('  !    no se pudo leer ' + path.relative(BIN, f) + ': ' + e2.message); continue; }
  }
  enlazarPadres(ast, null);
  recorrer(ast, (n) => {
    if (!ES_FUNCION(n) || !n.body || n.body.type !== 'BlockStatement') return;
    const cs = cierres(n);

    /* EL MISMO CASO CON `this`, que es como lo tienen las escenas: en un método
       normal, si alguna función FLECHA usa `this`, la escena entera va al
       contexto de esa llamada, y cualquier otro cierre que se escape de allí
       la arrastra. (Las funciones normales tienen su propio `this`: no cuentan.) */
    if (n.type !== 'ArrowFunctionExpression' && claseDeEscena(n) && !exceptuado(path.relative(BIN, f), n)) {
      const flechasConThis = cs.filter(c => c.type === 'ArrowFunctionExpression' && usaThis(c));
      if (flechasConThis.length) {
        for (const c of cs) {
          const motivo = escapa(c);
          if (!motivo) continue;
          hallazgos.push(path.relative(BIN, f) + ':' + c.loc.start.line + '  ' + motivo +
            '  (la función de la línea ' + n.loc.start.line + ' guarda `this` en su contexto)');
        }
      }
    }

    const params = n.params.filter(p => p.type === 'Identifier' && PARAMS.has(p.name)).map(p => p.name)
      .concat(n.type !== 'ArrowFunctionExpression' ? aliasDeThis(n) : []);
    if (!params.length || exceptuado(path.relative(BIN, f), n)) return;
    for (const param of params) {
      const usanParam = cs.filter(c => usa(c, param));
      if (!usanParam.length) continue;
      for (const c of cs) {
        const motivo = escapa(c);
        if (!motivo) continue;
        hallazgos.push(path.relative(BIN, f) + ':' + c.loc.start.line + '  ' + motivo +
          '  (la función de la línea ' + n.loc.start.line + ' guarda `' + param + '` en su contexto)');
      }
    }
  });
}

console.log('=== CIERRES QUE PUEDEN RETENER UNA ESCENA ===\n');
console.log('  (' + Object.keys(EXCEPCIONES).length + ' funciones revisadas a mano: motivo en EXCEPCIONES)\n');
if (!hallazgos.length) { console.log('  OK   ninguno'); process.exit(0); }
hallazgos.forEach(h => console.log('  ?    ' + h));
console.log('\n' + hallazgos.length + ' para revisar a mano.');
