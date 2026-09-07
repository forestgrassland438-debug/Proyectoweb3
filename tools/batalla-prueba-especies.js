/* Que en una batalla se VEA siempre a los dos luchadores.
 *
 * EL FALLO QUE VIGILA — "entro a batalla y estoy peleando con alguien invisible".
 *
 * En una batalla se piden DOS especies casi a la vez (la tuya y la del rival,
 * al emparejar). `this.load.start()` de Phaser NO HACE NADA si el cargador ya
 * esta en marcha, asi que la segunda tanda se quedaba encolada sin arrancar; y
 * como se esperaba con `load.once('complete')`, el 'complete' de la PRIMERA
 * resolvia tambien la segunda dando por buenas unas texturas inexistentes.
 * Luego `vestirLuchador` no encontraba textura y hacia `setVisible(false)`.
 *
 * Aqui se sacan los metodos REALES de BattleScene.js y se ejecutan contra un
 * cargador de mentira que se comporta como el de Phaser: ignora start() si ya
 * esta cargando.
 *
 *   node tools/batalla-prueba-especies.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const RUTA = path.join(BIN, 'Scenes', 'BattleScene.js');
if (!fs.existsSync(RUTA)) { console.error('No encuentro ' + RUTA); process.exit(2); }
const SRC = fs.readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => {
  if (c) { pasadas++; console.log('  OK    ' + m); }
  else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); }
};

/** Extrae `nombre(...) { … }` contando llaves. */
function metodo(nombre) {
  const m = new RegExp('\\n( +' + nombre + '\\([^)]*\\)\\s*\\{)').exec(SRC);
  if (!m) throw new Error('no encuentro el metodo ' + nombre);
  const ini = m.index + 1;
  let i = m.index + m[0].length - 1, prof = 0, cad = null, blo = false, lin = false;
  while (i < SRC.length) {
    const c = SRC[i], dos = SRC.substr(i, 2);
    if (lin) { if (c === '\n') lin = false; }
    else if (blo) { if (dos === '*/') { blo = false; i += 2; continue; } }
    else if (cad) { if (c === '\\') { i += 2; continue; } if (c === cad) cad = null; }
    else {
      if (dos === '//') { lin = true; i += 2; continue; }
      if (dos === '/*') { blo = true; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') cad = c;
      else if (c === '{') prof++;
      else if (c === '}') { if (--prof === 0) return SRC.slice(ini, i + 1); }
    }
    i++;
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

/** La tabla de especies, tal cual. */
function especies() {
  const i = SRC.indexOf('static ESPECIES = {');
  const ini = SRC.indexOf('{', i + 18);
  let p = 0, j = ini;
  for (; j < SRC.length; j++) { const c = SRC[j]; if (c === '{') p++; else if (c === '}') { p--; if (!p) { j++; break; } } }
  return eval('(' + SRC.slice(ini, j) + ')');
}

const ESPECIES = especies();

// ── Cargador de mentira: ignora start() mientras carga, como Phaser ────────
function hacerEscena({ tardanza = 40, quePngFalten = [] } = {}) {
  const texturas = new Set();
  const esc = {
    _especiesListas: null,
    cargados: [],
    arranques: 0,
    textures: {
      exists: (k) => texturas.has(k),
      _add: (k) => texturas.add(k)
    },
    make: { graphics: () => ({ fillStyle() {}, fillRect() {}, generateTexture: (k) => texturas.add(k), destroy() {} }) },
    time: { delayedCall: (ms, fn) => { const t = setTimeout(fn, ms); return { remove: () => clearTimeout(t) }; } },
    load: {
      _cola: [],
      _cargando: false,
      // 'complete' existe para poder correr tambien la version ANTIGUA del
      // metodo, que esperaba por ese evento en vez de por las texturas.
      _oyentes: [],
      once(ev, fn) { if (ev === 'complete') this._oyentes.push(fn); },
      off(ev, fn) { const i = this._oyentes.indexOf(fn); if (i >= 0) this._oyentes.splice(i, 1); },
      image(clave, ruta) { this._cola.push([clave, ruta]); },
      isLoading() { return this._cargando; },
      start() {
        esc.arranques++;
        if (this._cargando) return;              // ← lo que hace Phaser de verdad
        if (!this._cola.length) return;
        this._cargando = true;
        const tanda = this._cola.slice();
        this._cola.length = 0;
        setTimeout(() => {
          tanda.forEach(([k, r]) => {
            if (!quePngFalten.some((f) => r.includes(f))) { texturas.add(k); esc.cargados.push(k); }
          });
          this._cargando = false;
          const avisar = this._oyentes.slice();
          this._oyentes.length = 0;
          avisar.forEach((f) => { try { f(); } catch (e) {} });
        }, tardanza);
      }
    }
  };
  esc.constructor = { ESPECIES };
  return esc;
}

// Se montan los metodos reales sobre la escena de mentira.
// Los metodos de clase se pegan como miembros de un objeto: hacen falta comas.
const cuerpo = ['_rutasEspecie', 'cargarEspecie', '_framesDe'].map(metodo).join(',\n\n');
const Fabrica = new Function('BattleScene', 'return { ' + cuerpo.replace(/^\s*/, '') + ' };');
const metodos = Fabrica({ ESPECIES });

console.log('=== LOS DOS LUCHADORES SE TIENEN QUE VER ===\n');

(async () => {
  // ── 1. Dos especies pedidas a la vez ──────────────────────────────────
  console.log('1) Se piden dos especies casi a la vez (tu y el rival)');
  const e = hacerEscena();
  Object.assign(e, metodos);

  const a = e.cargarEspecie('perro');
  const b = e.cargarEspecie('conejo');      // el rival del informe: un conejo
  const [ra, rb] = await Promise.all([a, b]);

  ok(ra === true, 'la primera especie carga');
  ok(rb === true, 'y la SEGUNDA tambien (era la que se perdia)',
     'resultado: ' + rb);

  const framesConejo = e._framesDe('conejo', 'quieto');
  ok(framesConejo.length > 0, 'el conejo tiene fotogramas para dibujarse',
     framesConejo.length + ' fotogramas');

  // ── 2. Aunque falte un PNG, se resuelve y no se cuelga ────────────────
  console.log('\n2) Si falta un PNG, no se cuelga la batalla');
  const e2 = hacerEscena({ quePngFalten: ['zorro_'] });
  Object.assign(e2, metodos);
  const t0 = Date.now();
  const r2 = await e2.cargarEspecie('zorro');
  const tardo = Date.now() - t0;
  ok(r2 === false, 'avisa de que no cargo entera');
  ok(tardo < 9000, 'y no se queda esperando para siempre', tardo + ' ms');

  // ── 3. vestirLuchador nunca esconde al luchador ───────────────────────
  console.log('\n3) Un luchador sin textura no se esconde');
  const vestir = metodo('vestirLuchador');
  ok(!/L\.spr\.setVisible\(false\)/.test(vestir),
     'ya no hay ningun setVisible(false) en vestirLuchador');
  ok(/bfp_perro_quieto_1/.test(vestir),
     'usa como respaldo el perro que carga la propia BattleScene');

  console.log('\n' + '='.repeat(60));
  console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
  if (fallos) { console.log('\nHay fallos en la carga de especies.'); process.exit(1); }
  console.log('Sin fallos.');
  process.exit(0);
})().catch((err) => { console.error('EXPLOTO:', err); process.exit(1); });
