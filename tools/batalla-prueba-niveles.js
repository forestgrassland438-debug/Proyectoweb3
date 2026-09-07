/* La cuesta de las cinco batallas diarias.
 *
 * Los cinco animales del día salían TODOS con el nivel del jugador: las cinco
 * tarjetas decían lo mismo y subir de nivel no se notaba. Ahora la ronda 1 es
 * más floja que tu mascota y la 5 es el jefe, con una pequeña posibilidad de
 * que salga uno IGUALADO (mismo nivel, algo más de fuerza).
 *
 * Esta prueba saca `crearBotDeRonda` del servidor de verdad y la ejecuta
 * suelta, sin Mongo ni sockets. Si alguien cambia los números en el servidor,
 * la prueba cambia con ellos y no se queda comprobando una copia vieja.
 *
 *   node tools/batalla-prueba-niveles.js  [ruta a server2.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SERVIDOR = process.argv[2] ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');

if (!fs.existsSync(SERVIDOR)) {
  console.error('No encuentro el servidor en: ' + SERVIDOR);
  console.error('Pasalo como argumento:  node tools/batalla-prueba-niveles.js <ruta>');
  process.exit(2);
}
const TXT = fs.readFileSync(SERVIDOR, 'utf8');

/** Saca un trozo literal del servidor, de `desde` hasta `hasta` incluido. */
function sacar(desde, hasta) {
  const i = TXT.indexOf(desde);
  if (i < 0) throw new Error('no encuentro en el servidor: ' + desde);
  const j = TXT.indexOf(hasta, i);
  if (j < 0) throw new Error('no encuentro el final de: ' + desde);
  return TXT.slice(i, j + hasta.length);
}

const piezas = [
  sacar('function battleStatsForLevel(nivel) {', '\n}'),
  sacar('const BATTLE_DAILY_MAX = 5;', ';'),
  sacar('const BATTLE_BOTS = [', '\n];'),
  sacar('const BATTLE_BOTS_EXTRA = [', '\n];'),
  sacar('const BOT_VIDA_POR_RONDA', '\n}')     // hasta el final de crearBotDeRonda
];
const crearBotDeRonda = new Function(piezas.join('\n\n') + '\nreturn crearBotDeRonda;')();
const stats = new Function(piezas[0] + '\nreturn battleStatsForLevel;')();

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); } };

const NIVELES = [1, 2, 5, 10, 20, 35, 50];
const MUESTRAS = 4000;

// ─────────────────────────────────────────────────────────────────────────────
console.log('=== LA CUESTA DE LAS 5 BATALLAS ===\n');

// 1) Con la mascota a nivel 10, tabla de lo que sale en cada ronda.
console.log('  Mascota nivel 10 -> jugador ' + stats(10).maxHp + ' hp / ' + stats(10).attack + ' atq');
console.log('  ronda  nivel(min..max)  vida media  ataque medio  igualados');
const resumen = [];
for (let r = 1; r <= 5; r++) {
  let min = 99, max = -99, hp = 0, atk = 0, ig = 0, nivelSuma = 0;
  for (let i = 0; i < MUESTRAS; i++) {
    const b = crearBotDeRonda(r, 10);
    const d = b.level - 10;
    if (d < min) min = d;
    if (d > max) max = d;
    hp += b.maxHp; atk += b.attack; nivelSuma += b.level;
    if (b.igualado) ig++;
  }
  const fila = { r, min, max, hp: hp / MUESTRAS, atk: atk / MUESTRAS,
                 nivel: nivelSuma / MUESTRAS, ig: ig / MUESTRAS };
  resumen.push(fila);
  console.log('    ' + r + '     ' + String(min).padStart(3) + ' .. ' + String(max).padStart(3) +
              '        ' + fila.hp.toFixed(0).padStart(5) + '        ' + fila.atk.toFixed(1).padStart(5) +
              '        ' + (fila.ig * 100).toFixed(1) + '%');
}
console.log('');

// 2) LO QUE PIDIO EL JUGADOR, punto por punto.
ok(new Set(resumen.map((f) => f.nivel.toFixed(2))).size === 5,
   'los 5 animales del dia NO tienen todos el mismo nivel');

ok(resumen[0].min === -2 && resumen[0].max <= 0,
   'ronda 1: el animal esta 1 o 2 niveles POR DEBAJO de la mascota',
   'salio ' + resumen[0].min + '..' + resumen[0].max);

ok(resumen[4].max === 2 && resumen[4].min >= 0,
   'ronda 5: el animal esta 1 o 2 niveles POR ENCIMA de la mascota',
   'salio ' + resumen[4].min + '..' + resumen[4].max);

let sube = true;
for (let i = 1; i < 5; i++) if (resumen[i].nivel <= resumen[i - 1].nivel) sube = false;
ok(sube, 'el nivel medio va graduandose hacia arriba ronda a ronda',
   resumen.map((f) => f.nivel.toFixed(2)).join(' -> '));

let subeFuerza = true;
for (let i = 1; i < 5; i++) {
  if (resumen[i].hp <= resumen[i - 1].hp || resumen[i].atk <= resumen[i - 1].atk) subeFuerza = false;
}
ok(subeFuerza, 'y la fuerza tambien sube ronda a ronda');

// 3) La sorpresa del igualado.
const probIg = resumen.reduce((a, f) => a + f.ig, 0) / 5;
ok(probIg > 0.05 && probIg < 0.30,
   'existe una posibilidad PEQUENA de que salga igualado (' + (probIg * 100).toFixed(1) + '%)');

{
  // Un igualado de la ronda 1 tiene el MISMO nivel y pega un poco mas que uno
  // normal de ese mismo nivel.
  const forzarIgualado = () => 0;          // azar() = 0    -> siempre igualado
  const forzarNormal   = () => 0.99;       // azar() = 0.99 -> nunca igualado
  const ig = crearBotDeRonda(1, 10, { azar: forzarIgualado });
  const no = crearBotDeRonda(1, 10, { azar: forzarNormal });
  ok(ig.level === 10, 'el igualado tiene EXACTAMENTE el nivel de la mascota', 'salio ' + ig.level);
  ok(ig.attack >= stats(10).attack && ig.attack <= stats(10).attack * 1.15,
     'y pega un poquito mas, no mucho mas (' + ig.attack + ' vs ' + stats(10).attack + ' del jugador)');
  ok(no.level < 10, 'sin la sorpresa, la ronda 1 sigue estando por debajo (' + no.level + ')');
}

// 4) EL NIVEL DE LA MASCOTA IMPORTA: la ronda 1 siempre es mas floja que tu.
console.log('\n=== LA PRIMERA BATALLA, SIEMPRE LA FACIL ===');
let ronda1Floja = true, detalle = '';
for (const L of NIVELES) {
  const yo = stats(L);
  let peorHp = 0, peorAtk = 0;
  for (let i = 0; i < 600; i++) {
    const b = crearBotDeRonda(1, L, { azar: () => 0.99 });   // sin la sorpresa
    peorHp = Math.max(peorHp, b.maxHp); peorAtk = Math.max(peorAtk, b.attack);
  }
  const bien = peorHp < yo.maxHp && peorAtk < yo.attack;
  if (!bien) ronda1Floja = false;
  detalle += '\n    nivel ' + String(L).padStart(2) + ': tu ' + yo.maxHp + '/' + yo.attack +
             '   rival ' + peorHp + '/' + peorAtk + (bien ? '   ok' : '   NO');
}
console.log(detalle);
ok(ronda1Floja, 'la ronda 1 es mas floja que la mascota A CUALQUIER NIVEL, incluido el 1');

// 5) La ronda 5 es dura pero no imposible (el muro que ya se habia quitado).
console.log('\n=== LA RONDA 5: DURA PERO GANABLE ===');
let razonable = true; detalle = '';
for (const L of NIVELES) {
  const yo = stats(L);
  let maxHp = 0, maxAtk = 0;
  for (let i = 0; i < 600; i++) {
    const b = crearBotDeRonda(5, L);
    maxHp = Math.max(maxHp, b.maxHp); maxAtk = Math.max(maxAtk, b.attack);
  }
  const pctHp = (maxHp / yo.maxHp - 1) * 100, pctAtk = (maxAtk / yo.attack - 1) * 100;
  // El caso viejo que se documento como imposible era +78 % / +77 %.
  const bien = pctHp <= 33 && pctAtk <= 33;
  if (!bien) razonable = false;
  detalle += '\n    nivel ' + String(L).padStart(2) + ': +' + pctHp.toFixed(0) + '% vida, +' +
             pctAtk.toFixed(0) + '% ataque' + (bien ? '   ok' : '   NO, pasa del muro');
}
console.log(detalle);
ok(razonable, 'la ronda 5 nunca pasa del techo, tampoco a nivel 1 (era +78%/+77%)');

// 6) Cordura general: nunca nivel 0 ni estadisticas absurdas.
let sano = true;
for (const L of [1, 1, 2, 3, 50]) {
  for (let r = 1; r <= 5; r++) {
    for (let i = 0; i < 300; i++) {
      const b = crearBotDeRonda(r, L);
      if (!(b.level >= 1) || !(b.maxHp >= 1) || !(b.attack >= 1) ||
          !Number.isFinite(b.maxHp) || !Number.isFinite(b.attack)) sano = false;
    }
  }
}
ok(sano, 'nunca sale un rival de nivel 0 ni con vida o ataque invalidos');

// 7) Y cada ronda sigue teniendo su bicho.
const especies = [1, 2, 3, 4, 5].map((r) => crearBotDeRonda(r, 10).species);
ok(new Set(especies).size === 5, 'las 5 rondas siguen siendo 5 animales distintos', especies.join(', '));

console.log('\n' + '='.repeat(64));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
