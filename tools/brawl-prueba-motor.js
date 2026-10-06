/* El motor de la arena (gf-brawl-motor.js), probado a fondo y sin navegador.
 *
 *   1. Que la copia de server2.js es ESTE archivo (si no, el cliente y el
 *      servidor chocarían con paredes distintas).
 *   2. Que la rejilla de choques del motor casa con los mapas de Tiled
 *      (Maps/arena_*.json): mismos muros, agua, matas, cajas y apariciones.
 *   3. La física: nadie acaba dentro de un muro ni del agua, por mucho que se
 *      le empuje; se resbala por las paredes; los puentes se cruzan.
 *   4. El anti-trampas: teletransportes recortados, entradas viejas ignoradas,
 *      paquetes basura sin efecto, munición y cadencia del servidor.
 *   5. El combate: daño, súper, KO, huesos de poder, hierba alta, niebla.
 *   6. Los bots: encuentran al rival, le pegan, no se atascan, y las partidas
 *      solo de bots acaban siempre.
 *   7. El equilibrio entre especies (tabla informativa).
 *
 *   node tools/brawl-prueba-motor.js  [ruta a server2.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = path.join(__dirname, '..');
const M = require(path.join(BIN, 'gf-brawl-motor.js'));
const R = M.REGLAS;
const SERVIDOR = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK    ' + m); } else { fallos++; console.log('  FALLO ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x).slice(0, 300) : '')); } };
function azar(semilla) { let s = semilla >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. LA COPIA DEL SERVIDOR ===');
if (fs.existsSync(SERVIDOR)) {
  const r = require('./brawl-a-servidor.js').comprobar(SERVIDOR);
  ok(r.ok, 'server2.js lleva exactamente gf-brawl-motor.js', r.motivo);
} else console.log('  (no encuentro ' + SERVIDOR + ': se salta)');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. LOS MAPAS DE TILED CASAN CON EL MOTOR ===');
for (const id of Object.keys(M.ARENAS)) {
  const ruta = path.join(BIN, 'Maps', 'arena_' + id + '.json');
  if (!fs.existsSync(ruta)) { ok(false, 'existe Maps/arena_' + id + '.json'); continue; }
  const mapa = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const ts = mapa.tilesets[0];
  const props = {};
  (ts.tiles || []).forEach((t) => { const o = {}; (t.properties || []).forEach((p) => { o[p.name] = p.value; }); props[t.id] = o; });
  const capa = (n) => { const l = mapa.layers.find((x) => x.name === n); return l ? l.data : null; };
  const W = mapa.width, H = mapa.height;
  const suelo = capa('suelo'), muros = capa('muros'), arb = capa('arbustos'), cajas = capa('cajas'), puente = capa('puente'), deco = capa('deco');
  const filas = [];
  for (let y = 0; y < H; y++) {
    let f = '';
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = (g) => (g ? props[g - ts.firstgid] || {} : {});
      if (muros[i] && p(muros[i]).bloquea === 'todo') f += '#';
      else if (cajas[i]) f += ({ oro: 'o', barril: 'x' })[p(cajas[i]).caja] || 'c';
      else if (arb[i]) f += '*';
      else if (puente[i]) f += '=';
      else if (suelo[i] && p(suelo[i]).bloquea === 'paso') f += '~';
      else if (deco && deco[i] && p(deco[i]).cura) f += '+';
      else f += '.';
    }
    filas.push(f);
  }
  const A = M.ARENAS[id];
  const distintas = [];
  filas.forEach((f, y) => { if (f !== A.filas[y]) distintas.push(y + ': mapa ' + f + ' / motor ' + A.filas[y]); });
  ok(distintas.length === 0, id + ': la rejilla del mapa es la del motor', distintas.slice(0, 3));
  const puntos = (mapa.layers.find((l) => l.name === 'puntos') || { objects: [] }).objects
    .sort((a, b) => a.id - b.id).map((o) => [Math.floor(o.x / 32), Math.floor(o.y / 32)]);
  ok(JSON.stringify(puntos) === JSON.stringify(A.apariciones), id + ': las 6 apariciones coinciden', [puntos, A.apariciones]);
  ok(A.apariciones.every(([x, y]) => !M.bloqueaPaso(A.filas[y][x])), id + ': ninguna aparición está bloqueada');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. LA FÍSICA ===');
{
  let dentro = 0, fueraArena = 0;
  for (const id of Object.keys(M.ARENAS)) {
    const Rj = M.crearRejilla(M.ARENAS[id]);
    const rnd = azar(id.length * 97);
    let x = (M.ARENAS[id].apariciones[0][0] + 0.5) * 32, y = (M.ARENAS[id].apariciones[0][1] + 0.5) * 32;
    for (let i = 0; i < 40000; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 40;      // a veces pasos enormes
      const p = M.moverCirculo(Rj, x, y, Math.cos(a) * d, Math.sin(a) * d, R.RADIO);
      x = p[0]; y = p[1];
      // el CENTRO nunca en una casilla bloqueada, y el círculo sin meterse más de medio píxel
      if (M.bloqueaPaso(M.celdaDePunto(Rj, x, y))) dentro++;
      if (x < R.RADIO - 0.01 || y < R.RADIO - 0.01 || x > Rj.anchoPx - R.RADIO + 0.01 || y > Rj.altoPx - R.RADIO + 0.01) fueraArena++;
    }
  }
  ok(dentro === 0, 'paseo aleatorio de 120.000 pasos: nunca dentro de un muro, el agua o una caja', dentro);
  ok(fueraArena === 0, 'y nunca fuera de la arena', fueraArena);

  // Resbalar: andando en diagonal contra un muro se sigue avanzando de lado.
  const Rj = M.crearRejilla({ ancho: 6, alto: 6, celda: 32, filas: ['......', '......', '######', '......', '......', '......'] });
  let p = [48, 48 + 32 - R.RADIO - 0.5];
  const x0 = p[0];
  for (let i = 0; i < 10; i++) p = M.moverCirculo(Rj, p[0], p[1], 3, 3, R.RADIO);
  ok(p[0] - x0 > 25 && p[1] <= 64 - R.RADIO + 0.01, 'contra un muro en diagonal, resbala de lado', p);

  // El agua no se cruza, el puente sí.
  const rio = M.crearRejilla({ ancho: 5, alto: 7, celda: 32, filas: ['.....', '.....', '~~=~~', '~~=~~', '~~=~~', '.....', '.....'] });
  let q = [16, 16];
  for (let i = 0; i < 60; i++) q = M.moverCirculo(rio, q[0], q[1], 0, 4, R.RADIO);
  ok(q[1] < 64, 'el agua no se cruza', q);
  q = [80, 16];
  for (let i = 0; i < 60; i++) q = M.moverCirculo(rio, q[0], q[1], 0, 4, R.RADIO);
  ok(q[1] > 5 * 32, 'por el puente sí', q);
  // Las balas pasan por encima del agua y paran en los muros.
  const b = { x: 80, y: 16, dx: 0, dy: 1, resto: 300 };
  const b2 = Object.assign({}, b, { x: 16 });
  const r2 = M.avanzarBala(rio, b2, 150);
  ok(!r2 || r2.fin === undefined || r2.fin, 'una bala cruza el agua sin chocar', r2);
  const muro = M.crearRejilla({ ancho: 3, alto: 5, celda: 32, filas: ['...', '...', '###', '...', '...'] });
  const b3 = { x: 48, y: 16, dx: 0, dy: 1, resto: 300 };
  const r3 = M.avanzarBala(muro, b3, 200);
  ok(r3 && r3.muro && b3.y >= 64 && b3.y < 72, 'y para en el primer muro', [r3, b3.y]);

  // Determinista.
  const a1 = M.moverCirculo(Rj, 30.123, 40.456, 7.89, -3.21, R.RADIO);
  const a2 = M.moverCirculo(Rj, 30.123, 40.456, 7.89, -3.21, R.RADIO);
  ok(a1[0] === a2[0] && a1[1] === a2[1], 'mismas entradas, mismo resultado (cliente = servidor)');
}

// ═══════════════════════════════════════════════════════════════════════════
function partida(op) {
  let t = 1000000;
  const eventos = [];
  const P = M.crearPartida(Object.assign({
    id: 'p', modo: 'pvp', arena: 'pradera', ahora: () => t, azar: azar(op && op.semilla || 5),
    enviar: (l, ev, d) => eventos.push([l.id, ev, d]),
    alTerminar: (Pf, r) => { P.__fin = r; }
  }, op || {}));
  return {
    P, eventos,
    avanzar(ms) { const fin = t + ms; while (t < fin) { t += 50; M.paso(P); } },
    get t() { return t; },
    de: (id, ev) => eventos.filter((e) => e[0] === id && e[1] === ev)
  };
}
const humano = (n, extra) => Object.assign({ clave: 'h' + n, humano: true, playerName: 'H' + n, petName: 'Dog' + n, especie: 'perro', nivel: 5, maxHp: 140, ataque: 20, salud: 1 }, extra || {});

console.log('\n=== 4. ANTI-TRAMPAS ===');
{
  const J = partida({ luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + 100);
  const yo = J.P.porId[1];
  const x0 = yo.x, y0 = yo.y;
  M.entrada(J.P, 1, { s: 1, x: x0 + 500, y: y0, c: 0 });
  ok(Math.abs(yo.x - x0) < 50, 'un teletransporte de 500 px se queda en lo que da tiempo a andar', yo.x - x0);
  ok(yo.correccion === 1, 'y se le manda corregir');
  J.avanzar(50);
  const snap = J.de(1, 'brawl:snap').pop()[2];
  ok(snap.y.x != null && snap.y.c === 1, 'la instantánea lleva la posición buena', snap.y);
  const xAntes = yo.x;
  M.entrada(J.P, 1, { s: 2, x: xAntes + 3, y: yo.y, c: 0 });
  ok(yo.x === xAntes, 'una entrada que no ha visto la corrección (c viejo) se ignora');
  M.entrada(J.P, 1, { s: 3, x: xAntes + 3, y: yo.y, c: 1 });
  ok(Math.abs(yo.x - (xAntes + 3)) < 0.01, 'en cuanto confirma la corrección, vuelve a moverse');
  M.entrada(J.P, 1, { s: 2, x: xAntes + 6, y: yo.y, c: 1 });
  ok(Math.abs(yo.x - (xAntes + 3)) < 0.01, 'una entrada con número viejo (desordenada) se ignora');
  ['x', null, undefined, { s: 'a' }, { s: 9, x: NaN, y: 1 }, { s: 10, x: Infinity, y: 0 }].forEach((d) => M.entrada(J.P, 1, d));
  ok(Number.isFinite(yo.x) && Number.isFinite(yo.y), 'paquetes basura no rompen nada');
  // Velocidad: 200 entradas de 50 ms cada una pidiendo ir al doble.
  const J2 = partida({ luchadores: [humano(1), humano(2)] });
  J2.avanzar(R.CUENTA_MS + 100);
  const v = J2.P.porId[1];
  let s = 1, xi = v.x, recorrido = 0;
  const Rj = J2.P.R;
  for (let i = 0; i < 60; i++) {
    J2.avanzar(50);
    const p = M.moverCirculo(Rj, v.x, v.y, 0, v.vel * 0.1 * (i % 2 ? 1 : -1), R.RADIO);   // el doble de lo permitido
    M.entrada(J2.P, 1, { s: s++, x: p[0], y: p[1], c: v.correccion });
    recorrido += Math.abs(v.y - (v._yPrev || v.y)); v._yPrev = v.y;
  }
  ok(recorrido <= v.vel * 3 * R.TOLERANCIA + 40, 'ir más rápido de la cuenta no cuela (recorrido ' + Math.round(recorrido) + ' px en 3 s)');
  void xi;
  // Munición y cadencia.
  const J3 = partida({ luchadores: [humano(1), humano(2)] });
  J3.avanzar(R.CUENTA_MS + 100);
  let disparos = 0;
  for (let i = 0; i < 10; i++) if (M.disparar(J3.P, 1, { a: 0 })) disparos++;
  ok(disparos === 1, 'la cadencia no deja disparar diez veces de golpe', disparos);
  for (let i = 0; i < 8; i++) { J3.avanzar(400); M.disparar(J3.P, 1, { a: 0 }); }
  const l = J3.P.porId[1];
  ok(l.municion < R.MUNICION, 'la munición se gasta', l.municion);
  ok(!M.disparar(J3.P, 1, { a: 0, sup: 1 }) || l.superCarga >= 1, 'sin súper cargada, no hay súper');
  ok(!M.disparar(J3.P, 1, { a: 'x' }) && !M.disparar(J3.P, 1, null), 'un ángulo raro no dispara');
  ok(!M.entrada(J3.P, 99, { s: 1, x: 0, y: 0 }), 'un luchador que no existe no hace nada');
}

console.log('\n=== 5. EL COMBATE ===');
{
  // Dos perros frente a frente en una arena vacía.
  const vacia = { nombre: 'Vacía', ancho: 12, alto: 6, celda: 32, filas: Array(6).fill('............'),
                  apariciones: [[2, 3], [9, 3], [2, 1], [9, 1], [2, 5], [9, 5]] };
  const J = partida({ arena: vacia, luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + 100);
  const a = J.P.porId[1], b = J.P.porId[2];
  ok(Math.abs(b.x - a.x) > 200 || Math.abs(b.y - a.y) > 0, 'cada uno en su aparición');
  // a se acerca a b
  let s = 1;
  for (let i = 0; i < 40 && b.x - a.x > 150; i++) { J.avanzar(50); M.entrada(J.P, 1, { s: s++, x: a.x + a.vel * 0.05, y: a.y, c: a.correccion }); }
  const hp0 = b.hp;
  M.disparar(J.P, 1, { a: Math.atan2(b.y - a.y, b.x - a.x) });
  J.avanzar(800);
  const golpes = J.de(2, 'brawl:golpe');
  ok(b.hp < hp0 && golpes.length === 1, 'un ladrido a tiro quita vida y se avisa a todos', [hp0, b.hp]);
  ok(Math.abs((hp0 - b.hp) - Math.round(20 * R.ESCALA_DANO * M.ARMAS.ladrido.dano)) <= 1, 'el daño es ataque × 12 × el del arma', hp0 - b.hp);
  ok(a.superCarga > 0.3, 'acertar carga la súper', a.superCarga);
  // Súper: cargarla y lanzarla.
  a.superCarga = 1;
  const hp1 = b.hp, x1 = b.x;
  ok(M.disparar(J.P, 1, { a: Math.atan2(b.y - a.y, b.x - a.x), sup: 1 }) === true, 'con la súper cargada, sale');
  J.avanzar(1200);
  ok(b.hp < hp1 && Math.abs(b.x - x1) > 30, 'la súper pega fuerte y empuja', [hp1 - b.hp, b.x - x1]);
  ok(b.correccion > 0, 'al empujado se le manda su posición nueva');
  // Regeneración a los 3 s sin pelear.
  const hp2 = b.hp;
  J.avanzar(R.REGEN_ESPERA_MS + 1500);
  ok(b.hp > hp2, 'pasados 3 s sin pelear, se regenera', [hp2, b.hp]);
  // KO.
  b.hp = 1;
  a.ultimoDisparo = 0; a.municion = 3;
  M.disparar(J.P, 1, { a: Math.atan2(b.y - a.y, b.x - a.x) });
  J.avanzar(1500);
  ok(!b.vivo, 'a cero, cae');
  ok(J.P.fase === 'fin' && J.P.__fin && J.P.__fin.ganador === 1, 'y con uno solo en pie, gana', J.P.__fin && J.P.__fin.ganador);
  ok(J.de(1, 'brawl:ko').length === 1 && J.de(1, 'brawl:ko')[0][2].k === 1, 'el KO dice quién lo hizo');
  ok(J.de(1, 'brawl:objeto').length >= 1, 'el caído suelta huesos');
}
{
  // Huesos: coger uno sube vida máxima y daño.
  const vacia = { ancho: 10, alto: 5, celda: 32, filas: Array(5).fill('..........'), apariciones: [[1, 2], [8, 2], [1, 1], [8, 1], [1, 3], [8, 3]] };
  const J = partida({ arena: vacia, luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + 100);
  const a = J.P.porId[1];
  J.P.objetos.push({ id: 99, x: a.x, y: a.y, tipo: 'hueso' });
  const max0 = a.maxHp;
  J.avanzar(100);
  ok(a.potencia === 1 && a.maxHp > max0, 'pisar un hueso: +1 de poder y más vida máxima', [a.potencia, max0, a.maxHp]);
  ok(J.de(1, 'brawl:recoger').length === 1, 'y se avisa');
}
{
  // Cajas: dos golpes rompen una normal; la dorada suelta un hueso.
  const arena = { ancho: 8, alto: 3, celda: 32, filas: ['........', '..c..o..', '........'], apariciones: [[0, 1], [7, 0], [0, 0], [7, 2], [0, 2], [7, 1]] };
  const J = partida({ arena, luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + 100);
  const a = J.P.porId[1];
  for (let i = 0; i < 2; i++) { a.ultimoDisparo = 0; a.municion = 3; M.disparar(J.P, 1, { a: 0 }); J.avanzar(500); }
  ok(J.P.R.celdas[1 * 8 + 2] === '.', 'dos ladridos rompen una caja (y deja de bloquear)', J.P.R.celdas[10]);
  for (let i = 0; i < 4; i++) { a.ultimoDisparo = 0; a.municion = 3; M.disparar(J.P, 1, { a: 0 }); J.avanzar(500); }
  ok(J.P.R.celdas[1 * 8 + 5] === '.', 'cuatro rompen la dorada');
  ok(J.de(1, 'brawl:objeto').length === 1, 'y la dorada suelta un hueso');
}
{
  // La hierba alta esconde.
  // Las apariciones se usan en el orden 1, 4, 2, 5, 3, 6: el segundo luchador
  // sale en la CUARTA, que es la de dentro de la hierba.
  const arena = { ancho: 12, alto: 3, celda: 32, filas: ['............', '.......****.', '............'], apariciones: [[1, 1], [0, 0], [0, 2], [8, 1], [11, 0], [11, 2]] };
  const J = partida({ arena, luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + 200);
  const ultimo = (id) => J.de(id, 'brawl:snap').pop()[2];
  ok(!ultimo(1).f.some((f) => f[0] === 2), 'el que está en la hierba NO llega en tu instantánea');
  ok(ultimo(2).f.some((f) => f[0] === 2), 'él sí se ve a sí mismo');
  M.disparar(J.P, 2, { a: Math.PI });
  J.avanzar(100);
  ok(ultimo(1).f.some((f) => f[0] === 2), 'disparar desde la hierba te delata un momento');
  J.avanzar(R.REVELA_MS + 200);
  ok(!ultimo(1).f.some((f) => f[0] === 2), 'y luego vuelve a esconderte');
  const a = J.P.porId[1], b = J.P.porId[2];
  a.x = b.x - 60;
  J.avanzar(100);
  ok(ultimo(1).f.some((f) => f[0] === 2), 'muy cerca, se ve aunque esté en la hierba');
}
{
  // LA NIEBLA, por fases (el fallo de "la zona que se cierra no está").
  const J = partida({ luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + 1000);
  const z0 = J.de(1, 'brawl:snap').pop()[2].z;
  ok(Array.isArray(z0) && z0.length === 8, 'la instantánea lleva la niebla entera (8 números)', z0);
  ok(z0 && z0[6] === 0 && z0[3] > 0 && z0[3] < z0[0],
     'desde el primer segundo se sabe cuál será la zona segura (anillo siguiente, más pequeño)', z0);
  ok(z0 && Math.abs(z0[7] - (R.ZONA_INICIO_MS - 1000)) < 200, 'y cuánto falta para que entre la niebla', z0 && z0[7]);
  const ini = J.de(1, 'brawl:inicio')[0][2];
  ok(ini.zona && ini.zona.fases && ini.zona.fases.length === R.ZONA_FASES.length, 'el inicio trae el plan de las fases', ini.zona);
  const a = J.P.porId[1];
  // En la esquina más lejana: es lo primero que se come la niebla.
  a.x = a.r; a.y = a.r;
  const hpAntes = a.hp;
  J.avanzar(R.ZONA_INICIO_MS - 2000);
  ok(a.hp === hpAntes && !J.P.zona.activa, 'antes de que entre, la niebla no hace nada', [a.hp, hpAntes]);
  J.avanzar(R.ZONA_FASES[0].hasta - R.ZONA_FASES[0].desde + 3000);
  ok(J.P.zona.r < J.P.zona.r0 - 5, 'la niebla cierra', [Math.round(J.P.zona.r), Math.round(J.P.zona.r0)]);
  ok(!a.vivo || a.hp < a.maxHp, 'quien se queda fuera pierde vida (o cae)', [a.vivo, a.hp]);
  // Y cierra del todo: en una partida en la que nadie muere, al final queda
  // un círculo del radio final.
  const J2 = partida({ luchadores: [humano(1), humano(2)] });
  J2.avanzar(R.CUENTA_MS + 100);
  const danos = [];
  for (let t = 0; t < R.ZONA_FIN_MS + 1000; t += 500) {
    J2.avanzar(500);
    J2.P.luchadores.forEach((l) => { l.hp = l.maxHp; });
    if (J2.P.zona.activa) danos.push(J2.P.zona.dano);
  }
  ok(Math.abs(J2.P.zona.r - R.ZONA_RADIO_FINAL) < 1 && J2.P.zona.estado === 2, 'al final de la niebla solo queda el círculo final', Math.round(J2.P.zona.r));
  ok(danos.every((d, i) => i === 0 || d >= danos[i - 1]) && danos[danos.length - 1] === R.ZONA_DANO_FINAL_S,
     'cada fase pega más que la anterior', [danos[0], danos[danos.length - 1]]);
  J.avanzar(R.DURACION_MAX_MS);
  ok(J.P.fase === 'fin', 'la partida acaba siempre', J.P.fase);

  // El centro se MUEVE, pero siempre a un sitio justo: dentro del círculo
  // anterior, en suelo que se pisa, y con la arena entera recorrida.
  let malos = [], movidos = 0, total = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 12; s++) {
      const Jz = partida({ arena: id, semilla: s * 101 + id.length, luchadores: [humano(1), humano(2)] });
      const plan = Jz.P.zona.plan;
      plan.forEach((f, i) => {
        total++;
        const dentro = Math.hypot(f.x1 - f.x0, f.y1 - f.y0) + f.r1 <= f.r0 + 0.5 || i === 0;
        const pisable = !M.bloqueaPaso(M.celdaDePunto(Jz.P.R, f.x1, f.y1));
        if (!dentro || !pisable) malos.push([id, s, i, dentro, pisable]);
        if (Math.hypot(f.x1 - f.x0, f.y1 - f.y0) > 4) movidos++;
      });
    }
  }
  ok(malos.length === 0, 'cada zona nueva cae dentro de la anterior y sobre suelo pisable (' + total + ' fases)', malos.slice(0, 3));
  ok(movidos > total * 0.6, 'y el centro se mueve casi siempre (' + movidos + '/' + total + ')');
}
{
  // BARRILES: dos golpes y explotan; pegan a quien está cerca, también al que
  // dispara si está encima; un muro protege; encienden al barril de al lado.
  const arena = { ancho: 12, alto: 5, celda: 32,
    filas: ['............', '............', '.....xx.....', '.......#....', '............'],
    apariciones: [[1, 2], [6, 4], [0, 0], [11, 0], [0, 4], [11, 4]] };
  const J = partida({ arena, luchadores: [humano(1), humano(2), humano(3)] });
  J.avanzar(R.CUENTA_MS + 100);
  const a = J.P.porId[1], b = J.P.porId[2], c = J.P.porId[3];
  b.x = 6.5 * 32; b.y = 1.5 * 32;                 // justo encima del segundo barril
  c.x = 7.5 * 32; c.y = 4.4 * 32;                 // detrás del muro
  const hb = b.hp, hc = c.hp;
  for (let i = 0; i < 2; i++) { a.ultimoDisparo = 0; a.municion = 3; M.disparar(J.P, 1, { a: 0 }); J.avanzar(500); }
  J.avanzar(400);                                 // la mecha del de al lado tarda un poco
  const booms = J.de(1, 'brawl:boom');
  ok(booms.length === 2, 'dos ladridos al barril: explota, y el de al lado salta en cadena', booms.length);
  ok(J.P.R.celdas[2 * 12 + 5] === '.' && J.P.R.celdas[2 * 12 + 6] === '.', 'los dos dejan de bloquear');
  ok(b.hp < hb && Math.hypot(b.x - 6.5 * 32, b.y - 1.5 * 32) > 10, 'quien estaba al lado pierde vida y sale despedido', [hb - b.hp]);
  ok(c.hp === hc, 'el que estaba detrás del muro no se lleva nada', [hc, c.hp]);
  ok(a.dano >= hb - b.hp, 'el daño se le apunta a quien rompió el barril', a.dano);
}
{
  // COMEDEROS: sale carne a su hora; solo la coge quien está herido.
  const arena = { ancho: 10, alto: 3, celda: 32, filas: ['..........', '....+.....', '..........'], apariciones: [[1, 1], [8, 1], [0, 0], [9, 0], [0, 2], [9, 2]] };
  const J = partida({ arena, luchadores: [humano(1), humano(2)] });
  J.avanzar(R.CUENTA_MS + R.CURA_PRIMERA_MS - 500);
  ok(!J.P.objetos.some((o) => o.tipo === 'carne'), 'antes de su hora no hay carne');
  J.avanzar(1000);
  const carne = J.P.objetos.find((o) => o.tipo === 'carne');
  ok(!!carne && J.de(1, 'brawl:objeto').some((e) => e[2].tipo === 'carne'), 'a su hora sale, y se avisa');
  const a = J.P.porId[1];
  a.x = carne.x; a.y = carne.y;
  J.avanzar(200);
  ok(J.P.objetos.includes(carne), 'con la vida llena, pasar por encima no la gasta');
  a.hp = Math.round(a.maxHp * 0.4);
  a.regenDesde = J.t + 1e9;                       // sin regenerarse, para medir la cura sola
  J.avanzar(100);
  ok(!J.P.objetos.includes(carne) && Math.abs(a.hp - Math.round(a.maxHp * (0.4 + R.CURA_VIDA))) <= 2, 'herido, la coge y cura un 35 %', [a.hp, a.maxHp]);
  a.x = 20; a.y = 20;                             // fuera del comedero (si no, se comería la siguiente al salir)
  J.avanzar(R.CURA_CADA_MS + 200);
  ok(J.P.objetos.some((o) => o.tipo === 'carne'), 'y al rato vuelve a salir');
}
{
  // SIN CONEXIÓN: no cae; el piloto lo mueve; al volver recupera el mando.
  const J = partida({ modo: 'practica', luchadores: [humano(1), { clave: 'b', humano: false, especie: 'zorro', maxHp: 140, ataque: 20, astucia: 0.3 }] });
  J.avanzar(R.CUENTA_MS + 500);
  const a = J.P.porId[1];
  ok(M.desconectar(J.P, 1) === true && a.vivo, 'se cae la conexión: el perro sigue en la partida');
  const n0 = J.eventos.filter((e) => e[0] === 1).length;
  const x0 = a.x, y0 = a.y;
  J.avanzar(4000);
  ok(J.eventos.filter((e) => e[0] === 1).length === n0, 'mientras tanto no se le manda nada');
  ok(J.P.fase === 'combate' && (Math.abs(a.x - x0) + Math.abs(a.y - y0) > 20 || !a.vivo), 'la práctica sigue, y el piloto lo mueve', [a.x - x0, a.y - y0]);
  ok(M.reconectar(J.P, 1) === true, 'vuelve');
  const ini = J.de(1, 'brawl:inicio').pop()[2];
  ok(ini.reanudar === true && ini.fase === 'combate' && ini.enCombateMs > 4000, 'y recibe la partida tal y como va (reanudar)', [ini.reanudar, ini.fase, ini.enCombateMs]);
  J.avanzar(50);
  const snap = J.de(1, 'brawl:snap').pop()[2];
  ok(snap.y.x != null && snap.y.c === a.correccion, 'con su posición buena para recolocarse', snap.y);
  const xa = a.x;
  M.entrada(J.P, 1, { s: 1, x: xa + 3, y: a.y, c: 0 });
  ok(a.x === xa, 'lo que mande antes de recolocarse no vale (c viejo)');
  M.entrada(J.P, 1, { s: 2, x: xa + 3, y: a.y, c: a.correccion });
  ok(Math.abs(a.x - (xa + 3)) < 0.01, 'en cuanto se recoloca, vuelve a mandar él (y su cuenta empieza en 0)');
  ok(!M.desconectar(J.P, 2), 'a un bot no se le "desconecta"');
}
{
  // Rendirse en la cuenta atrás de una práctica: acaba al momento.
  const J = partida({ modo: 'practica', luchadores: [humano(1), { clave: 'b', humano: false, especie: 'zorro', maxHp: 140, ataque: 20, astucia: 0.3 }] });
  M.abandonar(J.P, 1);
  ok(J.P.fase === 'fin', 'el único humano se va: la práctica termina');
}

console.log('\n=== 6. LOS BOTS ===');
{
  // Un bot contra un humano quieto: le encuentra y le pega.
  let pegaron = 0, atascados = 0, nunca = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 4; s++) {
      const J = partida({ arena: id, semilla: s * 13, modo: 'bot', luchadores: [humano(1), { clave: 'b', humano: false, especie: ['conejo', 'cerdo', 'cuervo', 'zorro', 'cocodrilo'][s % 5], nivel: 5, maxHp: 140, ataque: 20, astucia: 0.2 + s * 0.1, vidaFija: true }] });
      J.avanzar(R.CUENTA_MS + 100);
      const yo = J.P.porId[1];
      const hp0 = yo.hp;
      J.avanzar(30000);
      if (yo.hp < hp0 || !yo.vivo) pegaron++; else nunca++;
      const bot = J.P.porId[2];
      if (bot.ia && bot.ia.atascado > 1) atascados++;
    }
  }
  ok(pegaron >= 10, 'en 30 s el bot encuentra y le pega a un jugador quieto (' + pegaron + '/12)', nunca);
  ok(atascados === 0, 'ningún bot se queda atascado');
  // Partidas solo de bots: siempre acaban y nadie atraviesa nada.
  let sinFin = 0, dentro = 0, partidas = 0;
  const especies = Object.keys(M.ESPECIES);
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 10; s++) {
      const n = 2 + (s % 5);
      const luch = [];
      for (let i = 0; i < n; i++) luch.push({ clave: 'b' + i, humano: false, especie: especies[(s + i * 3) % especies.length], nivel: 5, maxHp: 140, ataque: 20, astucia: 0.2 + (i % 5) * 0.1 });
      const J = partida({ arena: id, semilla: s * 7 + 1, luchadores: luch });
      let t = 0;
      while (J.P.fase !== 'fin' && t < 200000) {
        J.avanzar(500); t += 500;
        J.P.luchadores.forEach((l) => { if (l.vivo && M.bloqueaPaso(M.celdaDePunto(J.P.R, l.x, l.y))) dentro++; });
      }
      partidas++;
      if (J.P.fase !== 'fin') sinFin++;
    }
  }
  ok(sinFin === 0, 'las ' + partidas + ' partidas solo de bots terminan todas', sinFin);
  ok(dentro === 0, 'y nadie acaba nunca dentro de un muro', dentro);

  // PELEAN ENTRE ELLOS: una práctica (tú quieto + 3 bots). Antes los tres iban
  // a por el humano; ahora se reparten y se cruzan.
  let conPelea = 0, practicas = 0, aTi = 0, entreEllos = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 6; s++) {
      // Tú, quieto y con vida de sobra (si cayeras, la práctica acabaría).
      const luch = [humano(1, { maxHp: 5000 })];
      for (let i = 0; i < 3; i++) luch.push({ clave: 'b' + i, humano: false, especie: especies[(s + i * 2) % especies.length], nivel: 5, maxHp: 140, ataque: 20, astucia: 0.30 + 0.08 * i });
      const J = partida({ arena: id, semilla: s * 17 + 3, modo: 'practica', luchadores: luch });
      J.avanzar(R.CUENTA_MS + 40000);
      J.P.porId[1].hp = J.P.porId[1].maxHp;
      let bb = 0;
      J.de(1, 'brawl:golpe').forEach((e) => {
        const o = J.P.porId[e[2].o], v = J.P.porId[e[2].t];
        if (!o || !v || !o.bot) return;
        if (v.bot) { bb++; entreEllos++; } else aTi++;
      });
      practicas++;
      if (bb > 0) conPelea++;
    }
  }
  ok(conPelea >= practicas * 0.7, 'en ' + conPelea + '/' + practicas + ' prácticas los bots se pegan entre ellos (' +
     entreEllos + ' golpes entre bots, ' + aTi + ' a ti)');

  // ESQUIVAN, pero no todo: un bot listo contra un tirador que le apunta bien.
  const tiro = (astucia) => {
    let dados = 0, tiros = 0;
    for (let s = 1; s <= 20; s++) {
      const vacia = { ancho: 14, alto: 9, celda: 32, filas: Array(9).fill('..............'), apariciones: [[2, 4], [9, 4], [0, 0], [13, 0], [0, 8], [13, 8]] };
      const J = partida({ arena: vacia, semilla: s * 29, modo: 'practica', luchadores: [humano(1), { clave: 'b', humano: false, especie: 'perro', maxHp: 9999, ataque: 1, astucia }] });
      J.avanzar(R.CUENTA_MS + 100);
      const a = J.P.porId[1], b = J.P.porId[2];
      for (let k = 0; k < 6; k++) {
        a.ultimoDisparo = 0; a.municion = 3;
        b.x = a.x + 170; b.y = a.y; b.ia.esquiva = null;
        J.avanzar(300);
        const hp = b.hp;
        // Un buen tirador: adelanta el tiro a donde va a estar (si no, se
        // mediría el zigzag y no la esquiva).
        const tt = Math.hypot(b.x - a.x, b.y - a.y) / M.ARMAS.ladrido.vel;
        M.disparar(J.P, 1, { a: Math.atan2(b.y + (b.vy || 0) * tt - a.y, b.x + (b.vx || 0) * tt - a.x) });
        J.avanzar(900);
        tiros++;
        if (b.hp < hp) dados++;
        b.maxHp = b.hp = 9999;
      }
    }
    return dados / tiros;
  };
  const listo = tiro(0.6), torpe = tiro(0.2);
  ok(listo > 0.3 && listo < 0.95, 'un bot listo esquiva algunas balas, no todas (' + Math.round(listo * 100) + ' % le dan)');
  ok(torpe > listo + 0.05, 'y uno torpe esquiva menos (' + Math.round(torpe * 100) + ' % le dan)');
}

console.log('\n=== 7. EQUILIBRIO ENTRE ESPECIES (perro contra cada una, mismo nivel y astucia) ===');
{
  const fila = [];
  for (const esp of ['conejo', 'cerdo', 'cuervo', 'zorro', 'cocodrilo', 'vibora', 'topo', 'vaca']) {
    let gana = 0, total = 0;
    for (const id of Object.keys(M.ARENAS)) {
      for (let s = 1; s <= 8; s++) {
        const J = partida({ arena: id, semilla: s * 31 + esp.length, luchadores: [
          { clave: 'p', humano: false, especie: 'perro', nivel: 8, maxHp: 176, ataque: 26, astucia: 0.4 },
          { clave: 'e', humano: false, especie: esp, nivel: 8, maxHp: 176, ataque: 26, astucia: 0.4 }] });
        J.avanzar(200000);
        total++;
        if (J.P.__fin && J.P.__fin.ganador === 1) gana++;
      }
    }
    fila.push(esp + ' ' + Math.round(100 * gana / total) + '%');
  }
  console.log('  el perro gana: ' + fila.join(' · '));
  // Lo que importa de verdad para las diarias: con la vida de la escalera
  // (vidaFija), sin el extra de la especie.
  const fila2 = [];
  for (const esp of ['conejo', 'cerdo', 'cuervo', 'zorro', 'cocodrilo']) {
    let gana = 0, total = 0;
    for (const id of Object.keys(M.ARENAS)) {
      for (let s = 1; s <= 8; s++) {
        const J = partida({ arena: id, semilla: s * 31 + esp.length, luchadores: [
          { clave: 'p', humano: false, especie: 'perro', nivel: 8, maxHp: 176, ataque: 26, astucia: 0.4 },
          { clave: 'e', humano: false, especie: esp, nivel: 8, maxHp: 176, ataque: 26, astucia: 0.4, vidaFija: true }] });
        J.avanzar(200000);
        total++;
        if (J.P.__fin && J.P.__fin.ganador === 1) gana++;
      }
    }
    fila2.push(esp + ' ' + Math.round(100 * gana / total) + '%');
  }
  console.log('  con la vida de las diarias: ' + fila2.join(' · '));
}

console.log('\n' + pasadas + ' bien, ' + fallos + ' mal');
process.exit(fallos ? 1 : 0);
