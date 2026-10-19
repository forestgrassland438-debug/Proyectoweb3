/* ¿Se acumulan los escenarios de batalla en memoria?
 *
 * Cada combate pinta su propio fondo: un lienzo de 1024×576 cuya clave lleva
 * el `matchId` dentro. Eso son 2,36 MB de VRAM más otro tanto de canvas en RAM
 * por batalla. Nadie los borraba, así que se apilaban hasta cerrar la pestaña.
 *
 * Esta prueba juega veinte batallas seguidas contra un gestor de texturas de
 * mentira y cuenta cuántos lienzos quedan vivos. Sin navegador.
 *
 *   node tools/batalla-prueba-arenas.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2] || path.join(__dirname, '..');

/* Un contexto de dibujo que no dibuja: devuelve una función para todo lo que
   le pidan. Los pintores de arena llaman a veintitantos métodos distintos de
   canvas y no interesa ninguno — lo que se mide es qué texturas quedan. */
function ctxFalso() {
  const nada = () => ({ addColorStop: () => {} });
  return new Proxy({}, {
    get: (o, k) => {
      if (k === 'canvas') return { width: 1024, height: 576 };
      return typeof o[k] === 'undefined' ? nada : o[k];
    },
    set: (o, k, v) => { o[k] = v; return true; }
  });
}

function escenaFalsa() {
  const mapa = new Map();
  return {
    _mapa: mapa,
    textures: {
      exists: (k) => mapa.has(k),
      createCanvas: (k, w, h) => {
        mapa.set(k, { w, h });
        return { getContext: ctxFalso, refresh: () => {} };
      },
      remove: (k) => { if (!mapa.has(k)) throw new Error('no existe: ' + k); mapa.delete(k); }
    }
  };
}

const ventana = {};
const caja = { window: ventana, console: { log: () => {}, warn: () => {} },
               Math, Date, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat };
caja.globalThis = caja;
vm.createContext(caja);
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-batalla-arte.js'), 'utf8'), caja,
                { filename: 'gf-batalla-arte.js' });

const A = ventana.GFBatallaArte;
let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  → ' + x : '')); } };

console.log('=== ESCENARIOS DE BATALLA ===');
ok(!!A, 'gf-batalla-arte.js se carga y publica GFBatallaArte');
ok(typeof A.olvidarArenas === 'function', 'existe olvidarArenas()');

const scene = escenaFalsa();
A.efectos(scene);
const piezas = scene._mapa.size;
ok(piezas > 0, 'las piezas de efecto se crean (' + piezas + ')');

// Veinte batallas, cada una con su matchId, como en el juego.
const arenas = [];
for (let i = 1; i <= 20; i++) {
  const semilla = (i * 7919) >>> 0;
  const id = A.elegirArena('match_' + i);
  const a = A.arena(scene, id, semilla);
  if (a) arenas.push(a.clave);
}
ok(arenas.length === 20, 'se piden 20 escenarios distintos', 'salieron ' + arenas.length);
ok(new Set(arenas).size === 20, 'los 20 tienen clave distinta (es lo que causaba la fuga)');

const vivas = [...scene._mapa.keys()].filter((k) => k.indexOf('arena_') >= 0);
ok(vivas.length <= 2,
   'tras 20 batallas quedan como mucho 2 escenarios en memoria',
   'quedan ' + vivas.length + ' (antes del arreglo quedaban 20 = ~47 MB)');
ok(vivas.includes(arenas[arenas.length - 1]), 'el escenario de la batalla en curso NO se borra');

// Las piezas de efecto no se tocan: son compartidas y se reusan.
const efectosVivos = [...scene._mapa.keys()].filter((k) => k.indexOf('arena_') < 0).length;
ok(efectosVivos === piezas, 'las piezas de efecto siguen todas', efectosVivos + ' de ' + piezas);

// Y al salir de la batalla no queda ninguna.
const soltadas = A.olvidarArenas(scene);
ok(soltadas >= 1, 'olvidarArenas() suelta las que quedaban (' + soltadas + ')');
ok([...scene._mapa.keys()].filter((k) => k.indexOf('arena_') >= 0).length === 0,
   'al salir de la batalla no queda ningún escenario');
ok([...scene._mapa.keys()].length === piezas, 'y las piezas de efecto siguen intactas');

// Llamarlo dos veces no puede reventar (limpiar() se ejecuta dos veces al salir).
let revento = false;
try { A.olvidarArenas(scene); A.olvidarArenas(scene); } catch (e) { revento = true; }
ok(!revento, 'olvidarArenas() se puede llamar de más sin romper nada');

console.log('\n' + '='.repeat(60));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
