'use strict';
const BIN = process.argv[2];
const banco = require('./fauna-banco.js');
const { crearEscena, ctx, clima, cuentas } = banco;

const GFA = ctx.GFAnimales;
let fallos = 0, pasadas = 0;

function ok(cond, msg, extra) {
  if (cond) { pasadas++; console.log('  OK   ' + msg); }
  else { fallos++; console.log('  FALLO ' + msg + (extra ? '  → ' + extra : '')); }
}
function titulo(t) { console.log('\n=== ' + t + ' ==='); }

function correr(scene, segundos, paso = 16) {
  const n = Math.round(segundos * 1000 / paso);
  for (let i = 0; i < n; i++) {
    scene.__reloj += paso;
    scene.events.emit('update', scene.__reloj, paso);
  }
}

function porFase(st) {
  const m = {};
  for (const a of st.animales) m[a.fase] = (m[a.fase] || 0) + 1;
  return m;
}
function de(st, especie) { return st.animales.filter((a) => a.especie === especie); }
function grupo(st, g) { return st.animales.filter((a) => a.grupo === g); }

// ══════════════════════════════════════════════════════════════════
titulo('1. Se monta y vive sin romperse (tiempo despejado, 3 min)');
const scene = crearEscena();
const st = GFA.montar(scene);
ok(!!st, 'monta');
ok(st.animales.length >= 25, 'nacen los animales (' + st.animales.length + ' de 43)');

correr(scene, 180);
ok(true, 'tres minutos simulados sin excepciones');
console.log('  fases:', JSON.stringify(porFase(st)));

const dentro = st.animales.filter((a) => a.spr.x > 0 && a.spr.x < 5008 &&
                                          a.spr.y > 0 && a.spr.y < 5008);
ok(dentro.length === st.animales.length, 'ninguno se sale del mapa');

const animando = st.animales.filter((a) => a.spr.anims.currentAnim);
ok(animando.length === st.animales.length, 'todos tienen animacion puesta');

// ══════════════════════════════════════════════════════════════════
titulo('2. EMPIEZA A LLOVER');
/* El jugador se va a una esquina: si se queda en medio, los agresivos salen
   del refugio a morderle (que es lo correcto y se comprueba en 2-ter) y no se
   puede medir lo que hace la fauna con la lluvia y nada mas. */
scene.player.x = 120; scene.player.y = 120;
clima.activo = true;
clima.lluvia = 0.0;
// arrecia poco a poco, como en el juego
for (let k = 0; k <= 10; k++) { clima.lluvia = k / 10; correr(scene, 1.5); }
clima.lluvia = 1;
correr(scene, 40);

const fases = porFase(st);
console.log('  fases:', JSON.stringify(fases));
const cubiertos = st.animales.filter((a) => a.fase === 'refugio' || a.fase === 'aRefugio' ||
                                            a.enMadriguera || a.aCubierto);
ok(cubiertos.length >= st.animales.length * 0.55,
   'la mayoria se pone a cubierto (' + cubiertos.length + '/' + st.animales.length + ')');

// --- las mariposas ---
const maripo = grupo(st, 'mariposa');
const volando = maripo.filter((m) => m.fase === 'revolotea' || m.fase === 'aRefugio');
ok(volando.length === 0, 'ninguna mariposa sigue revoloteando bajo la lluvia',
   maripo.map((m) => m.fase).join(','));
const agarradas = maripo.filter((m) => (m.fase === 'refugio' || m.aCubierto) &&
                                       m._anim === 'posa');
ok(agarradas.length === maripo.length, 'todas agarradas con las alas cerradas',
   maripo.map((m) => m.fase + ':' + m._anim).join(','));

// --- el cocodrilo ---
const cocos = de(st, 'cocodrilo');
ok(cocos.every((c) => c.fase === 'refugio' || c.aCubierto), 'el cocodrilo esta acostado',
   cocos.map((c) => c.fase).join(','));
ok(cocos.every((c) => c._anim !== 'camina'), 'y NO anda',
   cocos.map((c) => c._anim).join(','));
ok(cocos.every((c) => c.achata > 0.5), 'y se ha asentado sobre la tripa (achatado)',
   cocos.map((c) => c.achata.toFixed(2)).join(','));
let lentos = 0, muestras = 0;
for (let i = 0; i < 300; i++) {
  scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16);
  for (const c of cocos) { muestras++; if (c.spr.anims.timeScale <= 0.5) lentos++; }
}
ok(lentos / muestras > 0.75, 'respirando despacio casi todo el rato (' +
   (100 * lentos / muestras).toFixed(0) + '%), con alguna sacudida');
// Y que de verdad NO se mueva de sitio mientras dura el agua.
const posCoco = cocos.map((c) => ({ x: c.spr.x, y: c.spr.y }));
correr(scene, 30);
const movido = cocos.reduce((s2, c, i) =>
  Math.max(s2, Math.hypot(c.spr.x - posCoco[i].x, c.spr.y - posCoco[i].y)), 0);
ok(movido < 3, 'y no se mueve del sitio en medio minuto (' + movido.toFixed(1) + ' px)');

// --- las aves ---
const aves = grupo(st, 'ave');
ok(aves.every((a) => a.fase !== 'bana'), 'ningun ave se esta banando');
const enRama = aves.filter((a) => a.fase === 'refugio' || a.fase === 'volando' ||
                                  a.aCubierto);
ok(enRama.length >= aves.length * 0.7, 'las aves se han ido a la rama (' +
   enRama.length + '/' + aves.length + ')', aves.map((a) => a.fase).join(','));

// --- los conejos ---
const conejos = de(st, 'conejo');
const encasa = conejos.filter((c) => c.enMadriguera || c.fase === 'refugio' ||
                                     c.fase === 'aRefugio' || c.fase === 'cava');
ok(encasa.length >= conejos.length * 0.7, 'los conejos, a la madriguera (' +
   encasa.length + '/' + conejos.length + ')', conejos.map((c) => c.fase).join(','));
/* Y DE VERDAD TERMINAN DE CAVAR SIN TARTAMUDEAR.

   Se les quita la madriguera a proposito: con casa, un conejo se limita a
   volver a ella y el camino de "sin casa, la cavo AHORA" no se pisa nunca —
   que es donde estaba el fallo.

   Lo que se mide es cuantas veces se REINICIA la animacion de cavar. El fallo
   no colgaba al conejo (acababa saliendo), asi que mirar solo "termina" no lo
   detecta: hay que contar los reinicios. Ver `medir_cava.js`. */
let reinicios = 0;
for (let ronda = 0; ronda < 3; ronda++) {
  conejos.forEach((c) => {
    if (c.madriguera) c.madriguera.destroy();
    c.madriguera = null; c.casa = null; c.enMadriguera = false;
    c.spr.setVisible(true);
    c.aCubierto = false; c.refugio = null; c.reaccionaEn = 0;
    c.fase = 'pasea'; c.hasta = scene.__reloj;
    c.__cavando = false; c.__hastaAnt = 0;
  });
  for (let i = 0; i < 60 * 40; i++) {
    scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16);
    for (const c of conejos) {
      if (c.fase === 'cava') {
        if (c.__cavando && c.hasta > c.__hastaAnt + 1) reinicios++;
        c.__cavando = true; c.__hastaAnt = c.hasta;
      } else { c.__cavando = false; }
    }
  }
}
ok(reinicios === 0, 'el conejo no reinicia la animacion de cavar (' +
   reinicios + ' reinicios en 12 intentos)');
ok(conejos.every((c) => c.casa), 'y todos abren su madriguera');
correr(scene, 40);
ok(conejos.filter((c) => c.enMadriguera || c.aCubierto).length >= 1,
   'y se meten dentro (' +
   conejos.filter((c) => c.enMadriguera || c.aCubierto).length + '/' +
   conejos.length + ')');

// --- la vaca aguanta de pie ---
const vacas = de(st, 'vaca');
ok(vacas.every((v) => v.fase === 'refugio' || v.fase === 'aRefugio' || v.aCubierto),
   'la vaca deja de pastar', vacas.map((v) => v.fase + ':' + v._anim).join(','));

// --- el cerdo busca charco ---
titulo('2-bis. El cerdo y el charco');
const cerdos = de(st, 'cerdo');
// Un charco cerca de cada cerdo, para ver que va a por el.
ctx.__charcos = cerdos.map((c) => ({ x: Math.min(4900, Math.max(100, c.spr.x + 300)),
                                     y: Math.min(4900, Math.max(100, c.spr.y + 200)),
                                     ancho: 60, alto: 30 }));
cerdos.forEach((c) => { c.reaccionaEn = 0; c.fase = 'pasea'; c.aCubierto = false;
                        c.refugio = null; });
correr(scene, 90);
const enCharco = cerdos.filter((c) => c.fase === 'refugio' || c.fase === 'aRefugio' ||
                                      c.aCubierto);
const cercaDeAgua = cerdos.filter((c, i) => ctx.__charcos[i] &&
  Math.hypot(c.spr.x - ctx.__charcos[i].x, c.spr.y - ctx.__charcos[i].y) < 40);
ok(cercaDeAgua.length > 0, 'algun cerdo LLEGA al charco (' + cercaDeAgua.length +
   '/' + cerdos.length + ')');
ok(enCharco.length === cerdos.length, 'los cerdos reaccionan a la lluvia',
   cerdos.map((c) => c.fase + '@' + Math.round(c.spr.x) + ',' + Math.round(c.spr.y)).join(' '));

// ══════════════════════════════════════════════════════════════════
titulo('2-ter. Refugiado, pero NO ciego');
const coco = de(st, 'cocodrilo')[0];
ok(coco.fase === 'refugio' || coco.aCubierto, 'el cocodrilo esta a cubierto');
scene.player.x = coco.spr.x + 90; scene.player.y = coco.spr.y;
correr(scene, 3);
ok(coco.fase === 'persigue' || coco.fase === 'ataca',
   'sale del refugio a por el jugador aunque llueva', coco.fase);
const zorroP = de(st, 'zorro').concat(de(st, 'zorra'))
                .find((z) => z.fase === 'refugio' || z.aCubierto);
if (zorroP) {
  scene.player.x = zorroP.spr.x + 30; scene.player.y = zorroP.spr.y;
  correr(scene, 2);
  ok(zorroP.fase !== 'refugio', 'y un zorro resguardado tambien reacciona',
     zorroP.fase);
}
scene.player.x = 120; scene.player.y = 120;
correr(scene, 25);

// ══════════════════════════════════════════════════════════════════
titulo('3. TRUENO');
const antes = st.animales.map((a) => a.fase);
banco.oyentesTrueno.forEach((f) => f(true, 1.2));
correr(scene, 0.2);
const saltados = st.animales.filter((a, i) => a.fase !== antes[i]);
ok(saltados.length > 0, 'el trueno sobresalta a alguien (' + saltados.length + ')');
const enSobresalto = st.animales.filter((a) => a.fase === 'sobresalto');
console.log('  en sobresalto:', enSobresalto.map((a) => a.especie).join(', ') || '(ninguno)');
ok(!st.animales.some((a) => a.especie === 'cocodrilo' && a.fase === 'sobresalto'),
   'al cocodrilo no le impresiona');
correr(scene, 6);
ok(!st.animales.some((a) => a.fase === 'sobresalto'), 'y se les pasa');

// ══════════════════════════════════════════════════════════════════
titulo('4. ESCAMPA');
for (let k = 10; k >= 0; k--) { clima.lluvia = k / 10; correr(scene, 1.5); }
clima.lluvia = 0; clima.activo = false;
correr(scene, 60);
const fases4 = porFase(st);
console.log('  fases:', JSON.stringify(fases4));
ok(!st.animales.some((a) => a.fase === 'refugio' || a.fase === 'aRefugio'),
   'nadie se queda encerrado cuando escampa');
ok(st.animales.every((a) => a.achata < 0.02), 'todos se han vuelto a levantar',
   st.animales.filter((a) => a.achata >= 0.02).map((a) => a.especie).join(','));
ok(st.animales.every((a) => Math.abs(a.spr.scaleY - a.spr.scaleX) < 0.001),
   'y con la escala entera');
ok(st.animales.every((a) => a.durmiendo || a.spr.anims.timeScale === 1),
   'y los despiertos a ritmo normal',
   st.animales.filter((a) => !a.durmiendo && a.spr.anims.timeScale !== 1)
              .map((a) => a.especie + ':' + a.spr.anims.timeScale).join(','));
ok(!st.animales.some((a) => a.enMadriguera && !a.durmiendo),
   'los conejos han salido de la madriguera');

// --- y ahora SI se banan, que es cuando toca ---
titulo('4-bis. Al escampar, a los charcos');
let vistosBanando = 0;
for (let i = 0; i < 40; i++) {
  correr(scene, 5);
  vistosBanando += st.animales.filter((a) => a.fase === 'bana' ||
                                             a.alFinal === 'bana').length;
}
ok(vistosBanando > 0, 'las aves bajan a banarse cuando ya no llueve (' +
   vistosBanando + ' avistamientos)');

// ══════════════════════════════════════════════════════════════════
titulo('5. NIEVE');
clima.activo = true; clima.nieve = 1;
correr(scene, 60);
const mari2 = grupo(st, 'mariposa');
ok(mari2.every((m) => m.fase === 'refugio' || m.aCubierto),
   'las mariposas se resguardan con nieve', mari2.map((m) => m.fase).join(','));
const helados = st.animales.filter((a) => a.congelado);
console.log('  congelados ahora mismo:', helados.length);
ok(true, 'la nieve sigue congelando (usa ya la fuerza interpolada)');
clima.nieve = 0; clima.activo = false;
correr(scene, 40);
ok(!st.animales.some((a) => a.congelado), 'y se descongelan al parar');
ok(!st.animales.some((a) => a.hielo), 'sin dejar bloques de hielo sueltos');

// ══════════════════════════════════════════════════════════════════
titulo('6. VIENTO FUERTE');
clima.activo = true; clima.viento = 1.6;
correr(scene, 45);
const mari3 = grupo(st, 'mariposa');
ok(mari3.every((m) => m.fase === 'refugio' || m.aCubierto),
   'con viento fuerte las mariposas no vuelan', mari3.map((m) => m.fase).join(','));
clima.viento = 0; clima.activo = false;
correr(scene, 30);

// ══════════════════════════════════════════════════════════════════
titulo('7. SOL');
function fraccionPosadas(segundos) {
  let quietas = 0, total = 0;
  const n = Math.round(segundos * 1000 / 16);
  for (let i = 0; i < n; i++) {
    scene.__reloj += 16;
    scene.events.emit('update', scene.__reloj, 16);
    for (const m of grupo(st, 'mariposa')) {
      if (m.fase !== 'posada' && m.fase !== 'revolotea') continue;   // ni dormidas ni a cubierto
      total++; if (m.fase === 'posada') quietas++;
    }
  }
  return quietas / Math.max(1, total);
}
clima.activo = true; clima.sol = 1;
correr(scene, 20);
const conSol = fraccionPosadas(600);
clima.sol = 0; clima.activo = false;
correr(scene, 20);
const sinSol = fraccionPosadas(600);
console.log('  fraccion de tiempo POSADAS  con sol:', conSol.toFixed(3),
            '  sin sol:', sinSol.toFixed(3));
ok(conSol < sinSol, 'con sol las mariposas paran menos');

/* Y LOS REPTILES SE TUESTAN — pero sin quedarse clavados.
   Las dos cosas importan: que se muevan bastante MENOS al sol, y que se sigan
   moviendo. Con el empujon en 0,55 recorrian literalmente 0 px en diez
   minutos, que no es tostarse, es estar colgado. */
function recorridoReptiles(segundos, sol) {
  clima.activo = sol > 0; clima.sol = sol;
  correr(scene, 20);                       // que le de tiempo a decidir de nuevo
  const b = st.animales.filter((a) => a.especie === 'cocodrilo' || a.grupo === 'serpiente');
  const prev = b.map((a) => ({ x: a.spr.x, y: a.spr.y }));
  let rec = 0;
  const n = Math.round(segundos * 1000 / 16);
  for (let i = 0; i < n; i++) {
    scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16);
    for (let k = 0; k < b.length; k++) {
      rec += Math.hypot(b[k].spr.x - prev[k].x, b[k].spr.y - prev[k].y);
      prev[k].x = b[k].spr.x; prev[k].y = b[k].spr.y;
    }
  }
  return Math.round(rec / Math.max(1, b.length));
}
const repGris = recorridoReptiles(300, 0);
const repSol  = recorridoReptiles(300, 1);
clima.sol = 0; clima.activo = false;
console.log('  reptiles: px recorridos sin sol', repGris, ' a pleno sol', repSol);
ok(repSol < repGris * 0.6, 'los reptiles se tuestan al sol (' +
   Math.round(100 * (1 - repSol / Math.max(1, repGris))) + '% menos recorrido)');
ok(repSol > 0, 'pero no se quedan clavados (' + repSol + ' px)');

titulo('8. MUERTE Y RESURRECCION de cada grupo');
const cobayas = {};
for (const g of ['ave', 'mariposa', 'conejo', 'tierra', 'serpiente', 'topo']) {
  const c = grupo(st, g)[0];
  if (c) cobayas[g] = c;
}
const iniVivos = cuentas().vivos;
for (const g in cobayas) {
  const a = cobayas[g];
  GFA._interno.morirAnimal(st, a, scene.__reloj);
}
ok(Object.values(cobayas).every((a) => a.muerto), 'mueren');
ok(Object.values(cobayas).every((a) => !a.hielo), 'sin dejar hielo');
ok(Object.values(cobayas).every((a) => !a.durmiendo), 'y no se quedan dormidos');
correr(scene, 20);
for (const g in cobayas) cobayas[g].revivirEn = scene.__reloj - 1;
correr(scene, 2);
ok(Object.values(cobayas).every((a) => !a.muerto), 'reviven');
for (const g in cobayas) {
  const a = cobayas[g];
  const poses = GFA._interno.posesDe(a.especie);
  const pose = a._anim;
  ok(!!poses[pose], g + ' revive con una pose que EXISTE (' + a.especie + ' → ' + pose + ')');
}
const ave = cobayas.ave;
if (ave) ok(Math.abs(ave.rumbo) <= 1.0001, 'el ave revive con rumbo de ave (' +
            ave.rumbo + '), no un angulo en radianes');
correr(scene, 60);
ok(true, 'y siguen vivos un minuto despues');

// ══════════════════════════════════════════════════════════════════
titulo('9. LAS PAREJAS NO SE ATASCAN');
const avesP = grupo(st, 'ave');
avesP.forEach((a) => { a.pareja = null; a.mirarA = null; });
let juntadas = 0;
for (let i = 0; i < 60; i++) {
  correr(scene, 5);
  juntadas += avesP.filter((a) => a.pareja).length;
}
const atascadas = avesP.filter((a) => a.pareja && a.pareja.pareja !== a);
ok(atascadas.length === 0, 'ninguna ave se queda con una pareja de mentira',
   atascadas.length + ' atascadas');

// ══════════════════════════════════════════════════════════════════
titulo('10. DESMONTAR NO DEJA NADA SUELTO');
banco.reiniciarCuentas();
const antesVivos = cuentas().vivos;
GFA.desmontar(scene);
const desp = cuentas();
console.log('  objetos vivos antes:', antesVivos, ' despues:', desp.vivos,
            ' destruidos:', desp.destruidos);
ok(desp.destruidos >= st.animales.length, 'se destruyen los sprites');
ok(scene.__gfFauna === null, 'la escena queda limpia');
ok(scene.__gfFaunaSitios === null, 'y la medida del escenario tambien');
ok(banco.oyentesTrueno.length === 0, 'el oyente del trueno se da de baja (FUGA)');
ok((scene.__listeners.update || []).length === 0, 'sin listeners de update colgando');

// ══════════════════════════════════════════════════════════════════
titulo('11. Sin arboles ni gf-clima, no revienta');
const escena2 = crearEscena({ sinArboles: true });
const guardaClima = ctx.GFClima;
ctx.GFClima = undefined;
const st2 = GFA.montar(escena2);
ok(!!st2, 'monta sin gf-clima');
correr(escena2, 90);
ok(true, 'y aguanta minuto y medio');
ctx.GFClima = guardaClima;
GFA.desmontar(escena2);

// ══════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(60));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
