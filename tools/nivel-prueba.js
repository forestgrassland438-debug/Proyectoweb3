/* Un solo nivel, que sale de la experiencia.
 *
 * FALLO QUE VIGILA (2026-10-02): "tengo nivel 5 o 6 y de pronto me dice 34
 * o 52". El nivel solo subía (nivel++), así que cualquier número que entrara
 * por otro camino se quedaba pegado; el espejo de habilidades (/api/skills)
 * metía una exp del personaje vieja "solo hacia arriba"; y el perro mostraba
 * el nivel ganado peleando en TODA LA VIDA, que no tenía nada que ver con el
 * del personaje.
 *
 * Saca de GameScene.js y tiendajuego.js los métodos DE VERDAD
 * (_expTotalParaNivel, _nivelPorExp, _nivelDesdeExp, _adoptarSkills) y los
 * ejecuta sobre una escena de mentira. Y compara la curva con la del servidor.
 *
 *   node tools/nivel-prueba.js  [ruta a server2.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
global.window = global.window || {};          // los métodos publican globalPetLevel
const SERVIDOR = process.argv[2] ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');

let bien = 0, mal = 0;
function ok(c, txt, extra) {
  if (c) { bien++; console.log('  OK    ' + txt); }
  else { mal++; console.log('  MAL   ' + txt + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

/** Saca el método `nombre(...) { ... }` del cuerpo de una clase (llaves equilibradas). */
function metodo(src, nombre) {
  const re = new RegExp('^[ \\t]*' + nombre + '\\s*\\(([^)]*)\\)\\s*\\{', 'm');
  const m = re.exec(src);
  if (!m) throw new Error('no encuentro ' + nombre);
  let i = m.index + m[0].length, prof = 1;
  // Recorrido simple: el código de estos métodos no tiene llaves dentro de
  // cadenas ni de expresiones regulares.
  while (prof > 0 && i < src.length) {
    const ch = src[i++];
    if (ch === '{') prof++;
    else if (ch === '}') prof--;
  }
  return { args: m[1], cuerpo: src.slice(m.index + m[0].length, i - 1) };
}

function escenaDe(archivo) {
  const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  const proto = {};
  for (const n of ['_expTotalParaNivel', '_nivelPorExp', '_nivelDesdeExp']) {
    const m = metodo(src, n);
    proto[n] = new Function(m.args, m.cuerpo);
  }
  return function nueva(datos) {
    const sonidos = [], barras = [], etiquetas = [];
    const s = Object.assign(Object.create(proto), {
      MAX_LEVEL_PERSONAJE: 150,
      vidaPorcentaje: 80,
      playSFX: (k) => sonidos.push(k),
      actualizarBarraVida: () => barras.push(s.nivel),
      _updateDogNameLabel: () => etiquetas.push(s.petLevel),
    }, datos || {});
    s._sonidos = sonidos; s._barras = barras; s._etiquetas = etiquetas;
    return s;
  };
}

function probarEscena(archivo) {
  console.log('\n=== ' + archivo + ' ===');
  const nueva = escenaDe(archivo);

  const a = nueva({});
  a._nivelDesdeExp();
  ok(a.nivel === undefined && a.petLevel === undefined, 'antes de cargar no se toca nada (ni Lv.0 ni perro a Lv.1)');

  const b = nueva({ nivel_exp: 4500 });
  b._nivelDesdeExp();
  ok(b.nivel === 6 && b.petLevel === 6, '4500 de exp = nivel 6, y el perro también 6', [b.nivel, b.petLevel]);
  ok(b._sonidos.length === 0, 'al cargar no suena el "subes de nivel"');

  const c = nueva({ nivel: 34, nivel_exp: 4500, petLevel: 34 });
  c._nivelDesdeExp();
  ok(c.nivel === 6 && c.petLevel === 6, 'un 34 que la exp no paga se CORRIGE a 6', [c.nivel, c.petLevel]);
  ok(c._sonidos.length === 0, 'y corregir hacia abajo no suena');

  const d = nueva({ nivel: 5, nivel_exp: '3400', petLevel: 5 });
  d._nivelDesdeExp();
  ok(d.nivel_exp === 3400 && typeof d.nivel_exp === 'number', 'una exp en texto se pasa a número ("3400" + 50 daba "340050")');
  d.nivel_exp = d.nivel_exp + 50;
  d._nivelDesdeExp();
  ok(d.nivel === 5, 'y sumarle 50 deja el nivel en 5', d.nivel);

  const e = nueva({ nivel: 6, nivel_exp: 5590, petLevel: 6 });
  e.nivel_exp += 50;
  e._nivelDesdeExp();
  ok(e.nivel === 7 && e._sonidos.length === 1 && e.petLevel === 7, 'al pasar de 5600 sube a 7, suena una vez y el perro sube con él');
  e._nivelDesdeExp();
  ok(e._sonidos.length === 1 && e._barras.length === 1, 'sin cambios no repinta ni vuelve a sonar');

  const f = nueva({ nivel: 2, nivel_exp: 20000, petLevel: 2 });
  f._nivelDesdeExp();
  ok(f.nivel === 13 && f._sonidos.length === 1, 'subir varios niveles de golpe suena UNA vez', [f.nivel, f._sonidos.length]);

  return nueva;
}

const gs = probarEscena('Scenes/GameScene.js');
probarEscena('Scenes/tiendajuego.js');

// ── el espejo de habilidades ya no toca la exp del personaje ───────────────
console.log('\n=== el espejo de habilidades ===');
{
  const src = fs.readFileSync(path.join(RAIZ, 'Scenes', 'GameScene.js'), 'utf8');
  const m = metodo(src, '_adoptarSkills');
  const s = gs({ nivel: 6, nivel_exp: 4500, agricultura: 1, agricultura_exp: 0 });
  s.constructor = { SKILL_PROP_MAP: { farming: 'agricultura' } };
  const fn = new Function('GameScene', 'return function(' + m.args + '){' + m.cuerpo + '}')({ SKILL_PROP_MAP: { farming: 'agricultura' } });
  fn.call(s, { level: 34, farming: 3, exp: { level: 119000, farming: 900 } });
  ok(s.nivel_exp === 4500, 'una exp.level de 119000 en /api/skills NO entra en la escena', s.nivel_exp);
  ok(s.agricultura === 3 && s.agricultura_exp === 900, 'las habilidades de verdad sí se siguen adoptando');
  const tienda = fs.readFileSync(path.join(RAIZ, 'Scenes', 'tiendajuego.js'), 'utf8');
  ok(!/fusion\.exp\.level/.test(tienda), 'la tienda tampoco adopta fusion.exp.level');
}

// ── misma curva que el servidor ────────────────────────────────────────────
console.log('\n=== misma curva que el servidor ===');
if (fs.existsSync(SERVIDOR)) {
  const TXT = fs.readFileSync(SERVIDOR, 'utf8');
  const ini = TXT.indexOf('const MAX_LEVEL_PERSONAJE = 150;');
  const fin = TXT.indexOf('\n}', TXT.indexOf('function nivelPorExperiencia(exp) {'));
  const nivelServidor = new Function(TXT.slice(ini, fin + 2) + '\nreturn nivelPorExperiencia;')();
  const s = gs({});
  let distintos = 0;
  for (let e = 0; e <= 300000; e += 97) if (s._nivelPorExp(e) !== nivelServidor(e)) distintos++;
  ok(distintos === 0, 'cliente y servidor dan el mismo nivel para 0..300000 de exp', distintos);

  const nme = TXT.indexOf('function nivelMascotaEfectivo(gp) {');
  const cuerpo = TXT.slice(nme, TXT.indexOf('\n}', nme) + 2);
  const efectivo = new Function('nivelPorExperiencia', 'MAX_LEVEL_PERSONAJE', cuerpo + '\nreturn nivelMascotaEfectivo;')(nivelServidor, 150);
  ok(efectivo({ nivel_exp: 4500, petLevel: 34, petWins: 80, petBattles: 160 }) === 6,
     'servidor: el perro de un nivel 6 es nivel 6 aunque tenga 160 batallas y un 34 guardado');
} else {
  console.log('  (sin server2.js: se salta la comparación)');
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
