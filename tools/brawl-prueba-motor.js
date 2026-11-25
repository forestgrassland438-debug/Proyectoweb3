/* El motor de la arena (gf-brawl-motor.js), probado a fondo y sin navegador.
 *
 *   1. Que la copia de server2.js es ESTE archivo (si no, el cliente y el
 *      servidor chocarían con paredes distintas).
 *   2. Que las arenas están bien hechas (marco macizo, apariciones libres y
 *      comunicadas) y que el suelo pintado (recortadas_arena_<id>) es el de
 *      ESA rejilla: mismo agua, mismos puentes, mismos comederos.
 *   3. La física: nadie acaba dentro de un muro ni del agua, por mucho que se
 *      le empuje; se resbala por las paredes; los puentes se cruzan.
 *   4. El anti-trampas: teletransportes recortados, entradas viejas ignoradas,
 *      paquetes basura sin efecto, munición y cadencia del servidor, y que al
 *      volver a mitad no se regala la posición de quien está escondido.
 *   5. El combate: daño (al cuerpo, que es donde se ve), súper, KO, huesos de
 *      poder, hierba alta y el GAS que entra desde los bordes.
 *   6. Los bots: encuentran al rival, le pegan, no se atascan, las partidas
 *      solo de bots acaban siempre, el listo gana al torpe y la dificultad se
 *      adapta al humano.
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

/** La huella del SUELO de una rejilla: lo que va pintado (agua, puentes y
    comederos). La misma cuenta que tools/generar-arenas.py y BattleScene. */
function huellaSuelo(filas) {
  let h = 0x811c9dc5;
  const txt = filas.map((f) => f.replace(/[^~=+]/g, '.')).join('\n');
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. LA COPIA DEL SERVIDOR ===');
if (fs.existsSync(SERVIDOR)) {
  const r = require('./brawl-a-servidor.js').comprobar(SERVIDOR);
  ok(r.ok, 'server2.js lleva exactamente gf-brawl-motor.js', r.motivo);
} else console.log('  (no encuentro ' + SERVIDOR + ': se salta)');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. LAS ARENAS Y SU SUELO PINTADO ===');
for (const id of Object.keys(M.ARENAS)) {
  const A = M.ARENAS[id];
  const Rj = M.crearRejilla(A);
  const m = Rj.marco;
  ok(m >= 3 && Rj.ancho === A.ancho + 2 * m && Rj.alto === A.alto + 2 * m, id + ': la rejilla lleva su marco de ' + m + ' casillas', [Rj.ancho, Rj.alto, m]);
  let hueco = 0;
  for (let y = 0; y < Rj.alto; y++) for (let x = 0; x < Rj.ancho; x++) {
    const dentro = x >= m && x < Rj.ancho - m && y >= m && y < Rj.alto - m;
    if (!dentro && M.celdaEn(Rj, x, y) !== '#') hueco++;
  }
  ok(hueco === 0, id + ': el marco es macizo (no se sale del campo)', hueco);
  ok(A.apariciones.length === 6 && A.apariciones.every(([x, y]) => !M.bloqueaPaso(A.filas[y][x])), id + ': las 6 apariciones están libres');
  // Todas las apariciones se alcanzan andando desde la primera.
  const p0 = [(A.apariciones[0][0] + m + 0.5) * 32, (A.apariciones[0][1] + m + 0.5) * 32];
  const sueltas = A.apariciones.slice(1).filter(([x, y]) => !M.buscarRuta(Rj, p0[0], p0[1], (x + m + 0.5) * 32, (y + m + 0.5) * 32, 4000));
  ok(sueltas.length === 0, id + ': se llega andando de una aparición a cualquier otra', sueltas);
  // Ida y vuelta con el servidor: la rejilla que se manda (con el marco ya
  // dentro) da la misma que la de aquí.
  const ida = M.crearRejilla({ ancho: Rj.ancho, alto: Rj.alto, celda: Rj.celda, marco: Rj.marco, marcoIncluido: true, filas: M.filasDe(Rj) });
  ok(ida.ancho === Rj.ancho && ida.marco === Rj.marco && M.filasDe(ida).join('|') === M.filasDe(Rj).join('|') && JSON.stringify(ida.juego) === JSON.stringify(Rj.juego),
     id + ': la rejilla que recibe el cliente es la del servidor');
  // El suelo pintado es el de ESTA rejilla.
  const rutaSuelo = path.join(BIN, 'recortadas_arena_' + id, 'mapa.json');
  if (!fs.existsSync(rutaSuelo)) { ok(false, id + ': existe recortadas_arena_' + id + '/mapa.json (python tools/generar-arenas.py)'); continue; }
  const suelo = JSON.parse(fs.readFileSync(rutaSuelo, 'utf8'));
  ok(suelo.width === Rj.anchoPx && suelo.height === Rj.altoPx, id + ': el suelo mide lo que la rejilla (' + Rj.anchoPx + '×' + Rj.altoPx + ')', [suelo.width, suelo.height]);
  ok(suelo.huella === huellaSuelo(M.filasDe(Rj)), id + ': el agua, los puentes y los comederos pintados son los del motor', [suelo.huella, huellaSuelo(M.filasDe(Rj))]);
  const faltan = suelo.tiles.filter((t) => ['hd', 'md', 'low'].some((n) => !fs.existsSync(path.join(BIN, 'recortadas_arena_' + id, n, t.lods[n].filename)) || !fs.existsSync(path.join(BIN, 'recortadas_arena_' + id, n, t.lods[n].fallback))));
  ok(faltan.length === 0, id + ': están todos los trozos (webp y png, tres niveles)', faltan.length);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. LA FÍSICA ===');
{
  let dentro = 0, fueraCampo = 0;
  for (const id of Object.keys(M.ARENAS)) {
    const Rj = M.crearRejilla(M.ARENAS[id]);
    const rnd = azar(id.length * 97);
    let x = (M.ARENAS[id].apariciones[0][0] + Rj.marco + 0.5) * 32, y = (M.ARENAS[id].apariciones[0][1] + Rj.marco + 0.5) * 32;
    for (let i = 0; i < 40000; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 40;      // a veces pasos enormes
      const p = M.moverCirculo(Rj, x, y, Math.cos(a) * d, Math.sin(a) * d, R.RADIO);
      x = p[0]; y = p[1];
      // el CENTRO nunca en una casilla bloqueada…
      if (M.bloqueaPaso(M.celdaDePunto(Rj, x, y))) dentro++;
      // …y el círculo entero dentro del campo (el marco es un muro como otro)
      const j = Rj.juego;
      if (x < j.x0 + R.RADIO - 0.01 || y < j.y0 + R.RADIO - 0.01 || x > j.x1 - R.RADIO + 0.01 || y > j.y1 - R.RADIO + 0.01) fueraCampo++;
    }
  }
  ok(dentro === 0, 'paseo aleatorio de 200.000 pasos: nunca dentro de un muro, el agua o una caja', dentro);
  ok(fueraCampo === 0, 'y nunca fuera del campo (el marco para como un muro)', fueraCampo);

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
  // Y en el marco.
  const conMarco = M.crearRejilla({ ancho: 4, alto: 4, celda: 32, marco: 2, filas: ['....', '....', '....', '....'] });
  const b4 = { x: 3.5 * 32, y: 3.5 * 32, dx: 1, dy: 0, resto: 400 };
  const r4 = M.avanzarBala(conMarco, b4, 300);
  ok(r4 && r4.muro && b4.x >= conMarco.juego.x1 && b4.x < conMarco.juego.x1 + 8, 'una bala para en el marco', [r4, b4.x, conMarco.juego]);

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
const bot = (n, especie, astucia, extra) => Object.assign({ clave: 'b' + n, humano: false, especie: especie || 'perro', nivel: 5, maxHp: 140, ataque: 20, astucia: astucia == null ? 0.4 : astucia }, extra || {});

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
  // Velocidad: 60 entradas de 50 ms cada una pidiendo ir al doble.
  const J2 = partida({ luchadores: [humano(1), humano(2)] });
  J2.avanzar(R.CUENTA_MS + 100);
  const v = J2.P.porId[1];
  let s = 1, recorrido = 0;
  const Rj = J2.P.R;
  for (let i = 0; i < 60; i++) {
    J2.avanzar(50);
    const p = M.moverCirculo(Rj, v.x, v.y, 0, v.vel * 0.1 * (i % 2 ? 1 : -1), R.RADIO);   // el doble de lo permitido
    M.entrada(J2.P, 1, { s: s++, x: p[0], y: p[1], c: v.correccion });
    recorrido += Math.abs(v.y - (v._yPrev || v.y)); v._yPrev = v.y;
  }
  ok(recorrido <= v.vel * 3 * R.TOLERANCIA + 40, 'ir más rápido de la cuenta no cuela (recorrido ' + Math.round(recorrido) + ' px en 3 s)');
  ok(R.TOLERANCIA <= 1.1, 'y el margen de velocidad es de un ' + Math.round((R.TOLERANCIA - 1) * 100) + ' % (era un 25 %)');
  // A paso legal, en cambio, no se le corrige ni una vez (si no, daría tirones).
  const J2b = partida({ luchadores: [humano(1), humano(2)] });
  J2b.avanzar(R.CUENTA_MS + 100);
  const w = J2b.P.porId[1];
  let px = w.x, py = w.y, sb = 1;
  for (let i = 0; i < 100; i++) {
    J2b.avanzar(50);
    const dir = Math.floor(i / 25) % 4;                    // un cuadrado: derecha, abajo, izquierda, arriba
    const p = M.moverCirculo(J2b.P.R, px, py, [1, 0, -1, 0][dir] * w.vel * 0.05, [0, 1, 0, -1][dir] * w.vel * 0.05, R.RADIO);
    px = p[0]; py = p[1];
    M.entrada(J2b.P, 1, { s: sb++, x: px, y: py, c: w.correccion });
  }
  ok(w.correccion === 0 && Math.abs(w.x - px) < 0.01 && Math.abs(w.y - py) < 0.01, 'andando a su paso (5 s, en cuadrado) no se le corrige nunca', [w.correccion, w.x - px, w.y - py]);
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
  // Una ráfaga de peticiones de disparo: se dejan de mirar al pasar el tope.
  const J4 = partida({ luchadores: [humano(1), humano(2)] });
  J4.avanzar(R.CUENTA_MS + 100);
  const l4 = J4.P.porId[1];
  for (let i = 0; i < 200; i++) M.disparar(J4.P, 1, { a: 0 });
  ok(l4.disparosSegundo > R.DISPAROS_POR_S && l4.municion >= R.MUNICION - 1, '200 peticiones de disparo de golpe: una bala, y el resto ni se miran', [l4.disparosSegundo, l4.municion]);
  J4.avanzar(400);
  ok(M.disparar(J4.P, 1, { a: 0 }) === false, 'mientras dura el castigo, tampoco la siguiente');
  J4.avanzar(800);
  ok(M.disparar(J4.P, 1, { a: 0 }) === true, 'pasado el segundo, vuelve a disparar');
}
{
  // AL VOLVER A MITAD NO SE REGALA LA POSICIÓN DE QUIEN ESTÁ ESCONDIDO.
  const arena = { ancho: 12, alto: 3, celda: 32, filas: ['............', '.......****.', '............'], apariciones: [[1, 1], [0, 0], [0, 2], [8, 1], [11, 0], [11, 2]] };
  const J = partida({ arena, luchadores: [humano(1), humano(2)] });
  const ini0 = J.de(1, 'brawl:inicio')[0][2];
  ok(ini0.luchadores.every((f) => f.x != null), 'al empezar se sabe dónde sale cada uno');
  J.avanzar(R.CUENTA_MS + 300);
  ok(M.resincronizar(J.P, 1) === true, 'se puede pedir el estado otra vez');
  const ini1 = J.de(1, 'brawl:inicio').pop()[2];
  const otro = ini1.luchadores.find((f) => f.id === 2), yo = ini1.luchadores.find((f) => f.id === 1);
  ok(ini1.reanudar === true && otro.x === null && otro.y === null && otro.oculto === 1, 'y el que está en la hierba llega SIN posición', otro);
  ok(yo.x != null, 'la tuya sí');
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
  ok(b.recibido === hp0 - b.hp, 'y lo recibido se apunta (para el resumen)', b.recibido);
  // Súper: cargarla y lanzarla.
  a.superCarga = 1;
  const hp1 = b.hp, x1 = b.x;
  ok(M.disparar(J.P, 1, { a: Math.atan2(b.y - a.y, b.x - a.x), sup: 1 }) === true, 'con la súper cargada, sale');
  J.avanzar(1200);
  ok(b.hp < hp1 && Math.abs(b.x - x1) > 30, 'la súper pega fuerte y empuja', [hp1 - b.hp, b.x - x1]);
  ok(b.correccion > 0, 'al empujado se le manda su posición nueva');
  // Regeneración: tarda, y va despacio.
  const hp2 = b.hp;
  J.avanzar(R.REGEN_ESPERA_MS - 1500);
  ok(b.hp === hp2, 'a los ' + (R.REGEN_ESPERA_MS - 1500) / 1000 + ' s sin pelear todavía no se cura', [hp2, b.hp]);
  // (el último golpe fue hace algo menos de un segundo al medir hp2: de los
  //  3,5 s que siguen, se cura como mucho durante 3)
  J.avanzar(1500 + 2000);
  const curado = (b.hp - hp2) / b.maxHp;
  ok(b.hp > hp2 && curado <= R.REGEN_POR_S * 3.05, 'pasados ' + R.REGEN_ESPERA_MS / 1000 + ' s se regenera, despacio (' + Math.round(curado * 100) + ' % en unos 3 s)', [hp2, b.hp]);
  ok(R.REGEN_POR_S <= 0.06 && R.REGEN_ESPERA_MS >= 3500, 'la cura es de un ' + Math.round(R.REGEN_POR_S * 100) + ' % por segundo (era un 10 %)');
  // KO.
  b.hp = 1;
  a.ultimoDisparo = 0; a.municion = 3;
  M.disparar(J.P, 1, { a: Math.atan2(b.y - a.y, b.x - a.x) });
  J.avanzar(1500);
  ok(!b.vivo, 'a cero, cae');
  ok(J.P.fase === 'fin' && J.P.__fin && J.P.__fin.ganador === 1, 'y con uno solo en pie, gana', J.P.__fin && J.P.__fin.ganador);
  ok(J.de(1, 'brawl:ko').length === 1 && J.de(1, 'brawl:ko')[0][2].k === 1, 'el KO dice quién lo hizo');
  ok(J.de(1, 'brawl:objeto').length >= 1, 'el caído suelta huesos');
  const fila = J.P.__fin.puestos.find((f) => f.id === 1);
  ok(fila && fila.dano > 0 && fila.recibido === 0 && fila.vida === 1, 'el resumen lleva lo hecho, lo recibido y la vida con la que acaba', fila);
}
{
  // EL CUERPO ESTÁ DONDE SE VE: una bala que cruza la cabeza da; una que pasa
  // por debajo de los pies, no. (Antes era al revés: solo daba en los pies.)
  const vacia = { ancho: 12, alto: 8, celda: 32, filas: Array(8).fill('............'), apariciones: [[2, 4], [8, 4], [2, 1], [9, 1], [2, 6], [9, 6]] };
  const probar = (dy) => {
    const J = partida({ arena: vacia, luchadores: [humano(1), humano(2)] });
    J.avanzar(R.CUENTA_MS + 100);
    const a = J.P.porId[1], b = J.P.porId[2];
    b.y = a.y + dy;                                 // b, más arriba o más abajo que a
    const hp = b.hp;
    M.disparar(J.P, 1, { a: 0 });                   // en horizontal, a la altura del cuerpo de a
    J.avanzar(900);
    return b.hp < hp;
  };
  ok(probar(0), 'a la misma altura, da');
  ok(probar(16), 'la bala le cruza la cabeza (él 16 px más abajo): da');
  ok(!probar(-22), 'la bala le pasa por debajo de los pies (él 22 px más arriba): no da');
  ok(R.ALTO_CUERPO >= 5 && R.RADIO_GOLPE >= R.RADIO, 'el cuerpo va ' + R.ALTO_CUERPO + ' px por encima de los pies');
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
  for (let i = 0; i < 2; i++) { a.ultimoDisparo = 0; a.municion = 3; a.disparosSegundo = 0; M.disparar(J.P, 1, { a: 0 }); J.avanzar(500); }
  ok(J.P.R.celdas[1 * 8 + 2] === '.', 'dos ladridos rompen una caja (y deja de bloquear)', J.P.R.celdas[10]);
  for (let i = 0; i < 4; i++) { a.ultimoDisparo = 0; a.municion = 3; a.disparosSegundo = 0; M.disparar(J.P, 1, { a: 0 }); J.avanzar(500); }
  ok(J.P.R.celdas[1 * 8 + 5] === '.', 'cuatro rompen la dorada');
  ok(J.de(1, 'brawl:objeto').some(e => e[2].tipo === 'hueso') && J.de(1, 'brawl:objeto').length === 3,
    'y la dorada suelta un hueso y un suministro');
}
{
  // Las cajas que el servidor reparte al azar van TODAS en lo que se manda:
  // el cliente las dibuja de ahí (antes pintaba solo las del mapa y las
  // demás eran muros invisibles).
  const J = partida({ luchadores: [humano(1), humano(2)] });
  const ini = J.de(1, 'brawl:inicio')[0][2];
  const enRejilla = ini.arena.filas.join('').split('').filter((c) => c === 'c' || c === 'o' || c === 'x').length;
  const deSerie = M.ARENAS.pradera.filas.join('').split('').filter((c) => c === 'c' || c === 'o' || c === 'x').length;
  ok(ini.arena.cajas.length === enRejilla && enRejilla > deSerie, 'las ' + (enRejilla - deSerie) + ' cajas añadidas al azar viajan en la rejilla y en la lista', [ini.arena.cajas.length, enRejilla, deSerie]);
  const W = ini.arena.ancho;
  ok(ini.arena.cajas.every((c) => 'cox'.indexOf(ini.arena.filas[Math.floor(c[0] / W)][c[0] % W]) >= 0), 'y cada una está donde dice su casilla');
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
  ok(ultimo(1).f[0].length === 8 && ultimo(1).f.every((f) => Number.isInteger(f[7]) && f[7] >= 0 && f[7] < 16), 'cada uno lleva hacia dónde mira (0-15)', ultimo(1).f[0]);
}
{
  // EL GAS: entra desde los bordes, sin zona marcada.
  const J = partida({ luchadores: [humano(1, { maxHp: 100000 }), humano(2, { maxHp: 100000 })] });
  const ini = J.de(1, 'brawl:inicio')[0][2];
  const jg = J.P.R.juego;
  ok(ini.gas && ini.gas.inicioMs === R.GAS_INICIO_MS && ini.gas.vel === R.GAS_VEL && ini.gas.x0 === jg.x0 && ini.gas.y1 === jg.y1 && ini.zona === undefined,
     'el inicio dice cuándo entra el gas, a qué paso y por dónde (y ya no hay "zona")', ini.gas);
  J.avanzar(R.CUENTA_MS + 1000);
  const z0 = J.de(1, 'brawl:snap').pop()[2].z;
  ok(Array.isArray(z0) && z0.length === 2 && z0[0] === 0 && z0[1] === 0, 'la instantánea lleva el gas en dos números; al principio, nada', z0);
  const a = J.P.porId[1], b = J.P.porId[2];
  // a, en la esquina del campo; b, en el centro.
  a.x = jg.x0 + a.r; a.y = jg.y0 + a.r; a.px = a.x; a.py = a.y;
  b.x = (jg.x0 + jg.x1) / 2; b.y = (jg.y0 + jg.y1) / 2; b.px = b.x; b.py = b.y;
  // (que no se regeneren: aquí se mide solo el gas)
  const quietos = () => { a.regenDesde = b.regenDesde = J.t + 1e9; };
  quietos();
  const hpA = a.hp;
  J.avanzar(R.GAS_INICIO_MS - 2000);
  ok(a.hp === hpA && J.P.gas.d === 0 && J.P.gas.estado === 0, 'antes de su hora no hay gas ni hace nada', [a.hp, hpA, J.P.gas]);
  J.avanzar(1000 + 10000);
  ok(Math.abs(J.P.gas.d - R.GAS_VEL * 10) < 1 && J.P.gas.estado === 1, 'a los 10 s ha entrado ' + Math.round(J.P.gas.d) + ' px por cada lado (paso fijo)', J.P.gas);
  ok(a.hp < hpA, 'quien está pegado al borde pierde vida', [hpA, a.hp]);
  ok(b.hp === b.maxHp, 'y quien está en el centro, no', [b.hp, b.maxHp]);
  ok(M.enGas(J.P, jg.x0 + 5, (jg.y0 + jg.y1) / 2) && M.enGas(J.P, (jg.x0 + jg.x1) / 2, jg.y1 - 5) && !M.enGas(J.P, jg.x0 + J.P.gas.d + 6, jg.y0 + J.P.gas.d + 6),
     'entra por los cuatro lados a la vez');
  const z1 = J.de(1, 'brawl:snap').pop()[2].z;
  ok(Math.abs(z1[0] - J.P.gas.d) <= 0.11 && z1[1] === 1, 'y la instantánea lo cuenta', z1);
  // Hasta el final: se para dejando una franja libre, y cada vez quema más.
  const danos = [];
  let dAntes = 0, retrocede = 0;
  for (let t = 0; t < 110000; t += 1000) {
    a.x = (jg.x0 + jg.x1) / 2 + 20; a.y = (jg.y0 + jg.y1) / 2;      // los dos a salvo, para que la partida siga
    J.avanzar(1000);
    quietos();
    if (J.P.gas.d < dAntes) retrocede++;
    dAntes = J.P.gas.d;
    danos.push(J.P.gas.dano);
  }
  const g = J.P.gas;
  const libreX = (jg.x1 - jg.x0) - 2 * g.d, libreY = (jg.y1 - jg.y0) - 2 * g.d;
  ok(g.estado === 2 && g.d === g.max && retrocede === 0, 'el gas llega a su tope y no retrocede nunca', g);
  ok(Math.min(libreX, libreY) >= R.GAS_HUECO_MIN - 1 && Math.min(libreX, libreY) <= R.GAS_HUECO_MIN + 2, 'y deja libre una franja de ' + Math.round(libreX) + '×' + Math.round(libreY) + ' px en el centro', [libreX, libreY]);
  ok(danos.every((d, i) => i === 0 || d >= danos[i - 1]) && danos[danos.length - 1] > danos[0] * 2, 'cada vez quema más (de ' + Math.round(danos[0] * 100) + ' % a ' + Math.round(danos[danos.length - 1] * 100) + ' % por segundo)');
  ok(a.hp === a.maxHp || a.hp > 0, 'en la franja del centro no quema');
  J.avanzar(R.DURACION_MAX_MS);
  ok(J.P.fase === 'fin', 'la partida acaba siempre', J.P.fase);
  // En un campo diminuto no hay gas (no queda sitio que cerrar).
  const mini = partida({ arena: { ancho: 5, alto: 4, celda: 32, filas: Array(4).fill('.....'), apariciones: [[0, 0], [4, 3], [0, 3], [4, 0], [2, 0], [2, 3]] }, luchadores: [humano(1), humano(2)] });
  mini.avanzar(R.CUENTA_MS + R.GAS_INICIO_MS + 20000);
  ok(mini.P.gas.max === 0 && mini.P.gas.d === 0 && mini.P.porId[1].hp === mini.P.porId[1].maxHp, 'en un campo diminuto no entra gas');
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
  for (let i = 0; i < 2; i++) { a.ultimoDisparo = 0; a.municion = 3; a.disparosSegundo = 0; M.disparar(J.P, 1, { a: 0 }); J.avanzar(500); }
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
  const J = partida({ modo: 'practica', luchadores: [humano(1), bot(1, 'zorro', 0.3)] });
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
  const J = partida({ modo: 'practica', luchadores: [humano(1), bot(1, 'zorro', 0.3)] });
  M.abandonar(J.P, 1);
  ok(J.P.fase === 'fin', 'el único humano se va: la práctica termina');
}

console.log('\n=== 6. LOS BOTS ===');
const especies = Object.keys(M.ESPECIES);
{
  // Un bot contra un humano quieto: le encuentra y le pega.
  let pegaron = 0, atascados = 0, nunca = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 4; s++) {
      const J = partida({ arena: id, semilla: s * 13, modo: 'bot', luchadores: [humano(1), bot(1, ['conejo', 'cerdo', 'cuervo', 'zorro', 'cocodrilo'][s % 5], 0.2 + s * 0.1, { vidaFija: true })] });
      J.avanzar(R.CUENTA_MS + 100);
      const yo = J.P.porId[1];
      const hp0 = yo.hp;
      J.avanzar(30000);
      if (yo.hp < hp0 || !yo.vivo) pegaron++; else nunca++;
      const b = J.P.porId[2];
      if (b.ia && b.ia.atascado > 1) atascados++;
    }
  }
  ok(pegaron >= 17, 'en 30 s el bot encuentra y le pega a un jugador quieto (' + pegaron + '/20)', nunca);
  ok(atascados === 0, 'ningún bot se queda atascado');
  // Partidas solo de bots: siempre acaban y nadie atraviesa nada.
  let sinFin = 0, dentro = 0, partidas = 0, enMarco = 0;
  let duraciones = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 10; s++) {
      const n = 2 + (s % 5);
      const luch = [];
      for (let i = 0; i < n; i++) luch.push(bot(i, especies[(s + i * 3) % especies.length], 0.2 + (i % 5) * 0.18));
      const J = partida({ arena: id, semilla: s * 7 + 1, luchadores: luch });
      let t = 0;
      const jg = J.P.R.juego;
      while (J.P.fase !== 'fin' && t < 230000) {
        J.avanzar(500); t += 500;
        J.P.luchadores.forEach((l) => {
          if (!l.vivo) return;
          if (M.bloqueaPaso(M.celdaDePunto(J.P.R, l.x, l.y))) dentro++;
          if (l.x < jg.x0 || l.y < jg.y0 || l.x > jg.x1 || l.y > jg.y1) enMarco++;
        });
      }
      partidas++;
      duraciones += t;
      if (J.P.fase !== 'fin') sinFin++;
    }
  }
  ok(sinFin === 0, 'las ' + partidas + ' partidas solo de bots terminan todas (media ' + Math.round(duraciones / partidas / 1000) + ' s)', sinFin);
  ok(dentro === 0 && enMarco === 0, 'y nadie acaba nunca dentro de un muro ni fuera del campo', [dentro, enMarco]);

  // PELEAN ENTRE ELLOS: una práctica (tú quieto + 3 bots).
  let conPelea = 0, practicas = 0, aTi = 0, entreEllos = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 6; s++) {
      // Tú, quieto y con vida de sobra (si cayeras, la práctica acabaría).
      const luch = [humano(1, { maxHp: 5000 })];
      for (let i = 0; i < 3; i++) luch.push(bot(i, especies[(s + i * 2) % especies.length], 0.30 + 0.08 * i));
      const J = partida({ arena: id, semilla: s * 17 + 3, modo: 'practica', luchadores: luch });
      J.avanzar(R.CUENTA_MS + 40000);
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

  // EL GAS NO LES PILLA: en partidas largas de bots que no se pegan (ataque
  // ridículo), casi nadie muere por el gas antes de que cierre del todo.
  let porGas = 0, vivosAlCerrar = 0, totalBots = 0;
  for (const id of Object.keys(M.ARENAS)) {
    for (let s = 1; s <= 3; s++) {
      const luch = [];
      for (let i = 0; i < 4; i++) luch.push(bot(i, especies[(s + i) % especies.length], 0.25 + i * 0.2, { maxHp: 100000, ataque: 1 }));
      const J = partida({ arena: id, semilla: s * 41 + 9, luchadores: luch });
      J.avanzar(R.CUENTA_MS + R.GAS_INICIO_MS + (J.P.gas.max / R.GAS_VEL) * 1000 + 3000);
      // Dentro "de verdad": que sigan dentro dos segundos después (un empujón
      // de una súper puede meter a alguien un instante; sale solo).
      const dentro = J.P.luchadores.filter((l) => l.vivo && M.enGas(J.P, l.x, l.y));
      J.avanzar(2000);
      J.P.luchadores.forEach((l) => { totalBots++; if (l.vivo) { vivosAlCerrar++; if (dentro.includes(l) && M.enGas(J.P, l.x, l.y)) porGas++; } });
    }
  }
  ok(vivosAlCerrar === totalBots && porGas === 0, 'con el gas cerrado del todo, los ' + totalBots + ' bots siguen vivos y ninguno se queda dentro', [vivosAlCerrar, porGas]);

  // ESQUIVAN, pero no todo: un bot listo contra un tirador que le apunta bien.
  const tiro = (astucia) => {
    let dados = 0, tiros = 0;
    for (let s = 1; s <= 20; s++) {
      const vacia = { ancho: 14, alto: 9, celda: 32, filas: Array(9).fill('..............'), apariciones: [[2, 4], [9, 4], [0, 0], [13, 0], [0, 8], [13, 8]] };
      const J = partida({ arena: vacia, semilla: s * 29, modo: 'practica', dda: false, luchadores: [humano(1), bot(1, 'perro', astucia, { maxHp: 9999, ataque: 1 })] });
      J.avanzar(R.CUENTA_MS + 100);
      const a = J.P.porId[1], b = J.P.porId[2];
      for (let k = 0; k < 6; k++) {
        a.ultimoDisparo = 0; a.municion = 3; a.disparosSegundo = 0;
        b.x = a.x + 200; b.y = a.y; b.px = b.x; b.py = b.y; b.ia.esquiva = null;
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
  const listo = tiro(0.85), torpe = tiro(0.15);
  ok(listo > 0.12 && listo < 0.9, 'un bot listo esquiva muchas balas de lejos, no todas (' + Math.round(listo * 100) + ' % le dan a 6 casillas)');
  ok(torpe > listo + 0.1, 'y uno torpe esquiva bastante menos (' + Math.round(torpe * 100) + ' % le dan)');

  // LA ASTUCIA ES DIFICULTAD DE VERDAD: mismo bicho, misma vida, mismo ataque.
  const duelo = (a1, a2, n) => {
    let gana1 = 0, total = 0;
    for (const id of Object.keys(M.ARENAS)) {
      for (let s = 1; s <= n; s++) {
        // Se alternan los sitios de salida: que no gane el que sale en mejor esquina.
        const uno = bot(1, 'perro', a1, { nivel: 8, maxHp: 176, ataque: 26 }), dos = bot(2, 'perro', a2, { nivel: 8, maxHp: 176, ataque: 26 });
        const J = partida({ arena: id, semilla: s * 53 + id.length, luchadores: s % 2 ? [uno, dos] : [dos, uno] });
        J.avanzar(R.CUENTA_MS + R.DURACION_MAX_MS + 2000);
        total++;
        const g = J.P.__fin && J.P.__fin.puestos.find((f) => f.puesto === 1);
        if (g && g.clave === 'b1') gana1++;
      }
    }
    return gana1 / total;
  };
  const d1 = duelo(0.9, 0.3, 8), d2 = duelo(0.6, 0.3, 8), d3 = duelo(0.5, 0.5, 8);
  ok(d1 >= 0.85, 'un bot de astucia 0,9 gana casi siempre a uno de 0,3 (' + Math.round(d1 * 100) + ' %)');
  ok(d2 >= 0.65 && d2 <= d1 + 0.05, 'uno de 0,6 gana a uno de 0,3 con claridad, pero menos (' + Math.round(d2 * 100) + ' %)');
  ok(d3 >= 0.3 && d3 <= 0.7, 'y dos iguales se reparten las partidas (' + Math.round(d3 * 100) + ' %)');
  const p0 = M.perfil(0.1), p1 = M.perfil(0.95);
  ok(p1.reaccion < p0.reaccion && p1.error < p0.error && p1.adelanto > p0.adelanto && p1.esquiva > p0.esquiva && p1.giro > p0.giro && p1.ritmo > p0.ritmo,
     'de la astucia salen los reflejos, el pulso, el adelanto, la esquiva, el giro y el paso');
  ok(p0.ritmo <= 0.75, 'los bots flojos pelean a paso lento (' + Math.round(p0.ritmo * 100) + ' % de su velocidad): "los enemigos van muy rápidos"');
}
{
  // LA DIFICULTAD SE ADAPTA AL HUMANO, DURANTE la partida.
  const vacia = { ancho: 14, alto: 9, celda: 32, filas: Array(9).fill('..............'), apariciones: [[2, 4], [9, 4], [0, 0], [13, 0], [0, 8], [13, 8]] };
  // (La vida, la de verdad: la cuenta va en fracción de vida. Se rellena a
  //  cada segundo para que la partida no se acabe.)
  const rellenar = (X, ms) => { for (let i = 0; i < ms; i += 500) { X.avanzar(500); X.P.luchadores.forEach((l) => { l.hp = l.maxHp; }); } };
  // 1) Un humano que no se defiende: el bot afloja con él.
  const J = partida({ arena: vacia, modo: 'bot', semilla: 11, luchadores: [humano(1), bot(1, 'perro', 0.6)] });
  J.avanzar(R.CUENTA_MS);
  rellenar(J, 20000);
  const h = J.P.porId[1], b = J.P.porId[2];
  ok(h.dda.ajuste < -0.12 && b.ia.a < b.ia.astucia - 0.1, 'a quien recibe sin pegar, el bot le afloja (astucia ' + b.ia.astucia + ' → ' + b.ia.a.toFixed(2) + ')', [h.dda, b.ia.a]);
  // 2) Un humano que barre al bot (le pega sin fallar y no recibe): el bot afina.
  const K = partida({ arena: vacia, modo: 'bot', semilla: 12, luchadores: [humano(1), bot(1, 'perro', 0.4, { ataque: 1 })] });
  K.avanzar(R.CUENTA_MS + 100);
  const hk = K.P.porId[1], bk = K.P.porId[2];
  for (let i = 0; i < 50; i++) {
    hk.ultimoDisparo = 0; hk.municion = 3; hk.disparosSegundo = 0;
    bk.x = hk.x + 60; bk.y = hk.y; bk.px = bk.x; bk.py = bk.y;       // a bocajarro: no falla
    bk.hp = bk.maxHp; hk.hp = hk.maxHp;
    M.disparar(K.P, 1, { a: 0 });
    K.avanzar(400);
  }
  ok(hk.dda.ajuste > 0.12 && bk.ia.a > bk.ia.astucia + 0.1, 'a quien le barre, el bot le afina (astucia ' + bk.ia.astucia + ' → ' + bk.ia.a.toFixed(2) + ')', [hk.dda, bk.ia.a]);
  ok(Math.abs(hk.dda.ajuste) <= R.DDA_FUERZA + 1e-9 && Math.abs(h.dda.ajuste) <= R.DDA_FUERZA + 1e-9, 'sin pasarse: como mucho ±' + R.DDA_FUERZA + ' de astucia');
  // 3) Con `dda: false` (o entre bots) no se toca nada.
  const L = partida({ arena: vacia, modo: 'bot', semilla: 11, dda: false, luchadores: [humano(1), bot(1, 'perro', 0.6)] });
  L.avanzar(R.CUENTA_MS);
  rellenar(L, 20000);
  ok(L.P.porId[1].dda.ajuste === 0 && Math.abs(L.P.porId[2].ia.a - 0.6) < 1e-9, 'y se puede apagar');
  // 4) Antes de empezar: el mismo bot aprieta más al veterano que al novato.
  const N = partida({ arena: vacia, modo: 'pvp', semilla: 5, luchadores: [humano(1, { habilidad: 0.9, maxHp: 100000 }), humano(2, { habilidad: 0.2, maxHp: 100000 }), bot(1, 'perro', 0.5)] });
  N.avanzar(R.CUENTA_MS + 200);
  ok(Math.abs(N.P.habMedia - 0.55) < 1e-9, 'la partida sabe lo hábiles que son sus humanos (media ' + N.P.habMedia + ')');
}

console.log('\n=== 7. EQUILIBRIO ENTRE ESPECIES (perro contra cada una, mismo nivel y astucia) ===');
{
  const fila = [];
  for (const esp of ['conejo', 'cerdo', 'cuervo', 'zorro', 'cocodrilo', 'vibora', 'topo', 'vaca']) {
    let gana = 0, total = 0;
    for (const id of Object.keys(M.ARENAS)) {
      for (let s = 1; s <= 8; s++) {
        const J = partida({ arena: id, semilla: s * 31 + esp.length, luchadores: [
          bot('p', 'perro', 0.45, { nivel: 8, maxHp: 176, ataque: 26 }),
          bot('e', esp, 0.45, { nivel: 8, maxHp: 176, ataque: 26 })] });
        J.avanzar(R.CUENTA_MS + R.DURACION_MAX_MS + 2000);
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
          bot('p', 'perro', 0.45, { nivel: 8, maxHp: 176, ataque: 26 }),
          bot('e', esp, 0.45, { nivel: 8, maxHp: 176, ataque: 26, vidaFija: true })] });
        J.avanzar(R.CUENTA_MS + R.DURACION_MAX_MS + 2000);
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
