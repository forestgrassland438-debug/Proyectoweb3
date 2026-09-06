/* Cuervo y buho: comportamiento con el tiempo, y los bugs de vuelo/fuga. */
'use strict';
const BIN = process.argv[2];
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const banco = require('./fauna-banco.js');
const { crearEscena, ctx, clima, oyentesTrueno } = banco;

// El banco solo carga gf-animales; aqui se anaden los otros dos.
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-cuervo.js'), 'utf8'), ctx, {});
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-buho.js'), 'utf8'), ctx, {});

// Texturas del cuervo y del buho: en el banco `exists` solo dice si a algo
// gfa_*; se amplia para que los dos modulos se den por cargados.
let fallos = 0, pasadas = 0;
function ok(c, m, x) {
  if (c) { pasadas++; console.log('  OK   ' + m); }
  else { fallos++; console.log('  FALLO ' + m + (x ? '  → ' + x : '')); }
}
function titulo(t) { console.log('\n=== ' + t + ' ==='); }

function escenaConTexturas(op) {
  const s = crearEscena(op);
  const exists = s.textures.exists;
  s.textures.exists = (k) => exists(k) || /^(cuervo_|gfb_)/.test(k);
  return s;
}
function correr(scene, segundos, paso = 16) {
  const n = Math.round(segundos * 1000 / paso);
  for (let i = 0; i < n; i++) {
    scene.__reloj += paso;
    scene.events.emit('update', scene.__reloj, paso);
  }
}

// ══════════════════════════════════════════════════════════════════
titulo('CUERVO: aterriza aunque el juego vaya a 30 fps (bug de la orbita)');
{
  const scene = escenaConTexturas();
  scene.player = { x: 100, y: 100 };
  const st = ctx.GFCuervo.montar(scene, { cantidad: 3 });
  ok(!!st, 'monta');
  // 30 fps: paso de 33 ms, que es donde se veia el fallo.
  let vecesVolando = 0, muestras = 0;
  for (let i = 0; i < 60 * 30; i++) {   // 60 s a 30 fps
    scene.__reloj += 33;
    scene.events.emit('update', scene.__reloj, 33);
    for (const c of st.cuervos) { muestras++; if (c.fase === 'volando') vecesVolando++; }
  }
  const frac = vecesVolando / muestras;
  console.log('  fraccion de tiempo VOLANDO a 30 fps:', frac.toFixed(3));
  ok(frac < 0.5, 'no se pasa la vida orbitando el arbol (' +
     (frac * 100).toFixed(0) + '% volando)');
  ctx.GFCuervo.desmontar(scene);
}

// ══════════════════════════════════════════════════════════════════
titulo('CUERVO: sombra visible (bug del fillAlpha x alpha)');
{
  const scene = escenaConTexturas();
  scene.player = { x: 100, y: 100 };
  const st = ctx.GFCuervo.montar(scene, { cantidad: 1 });
  const c = st.cuervos[0];
  c.fase = 'camina';
  correr(scene, 0.1);
  ok(c.sombra.alpha > 0.2, 'la sombra en el suelo va al 0,26 y no al 0,068 (' +
     c.sombra.alpha + ')');
  ctx.GFCuervo.desmontar(scene);
}

// ══════════════════════════════════════════════════════════════════
titulo('CUERVO: con lluvia, ni suelo ni parcela');
{
  const scene = escenaConTexturas();
  scene.player = { x: 100, y: 100 };
  // Parcelas de cultivo para que tenga a donde bajar.
  scene.plotImages = new Map();
  for (let i = 1; i <= 6; i++) {
    const o = scene.add.sprite(1500 + i * 120, 2000, 'plot');
    scene.plotImages.set('field' + i, o);
  }
  const st = ctx.GFCuervo.montar(scene, { cantidad: 3 });
  clima.activo = false; clima.lluvia = 0;
  correr(scene, 120);
  let enSuelo = 0, total = 0;
  for (let i = 0; i < 60 * 60; i++) {
    scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16);
    for (const c of st.cuervos) {
      total++;
      if (c.fase === 'camina' || c.fase === 'come') enSuelo++;
    }
  }
  const secoEnSuelo = enSuelo / total;
  console.log('  seco: fraccion de tiempo en el suelo/parcela:', secoEnSuelo.toFixed(3));
  ok(secoEnSuelo > 0.05, 'con buen tiempo SI baja al suelo');

  clima.activo = true; clima.lluvia = 1;
  correr(scene, 60);
  enSuelo = 0; total = 0;
  for (let i = 0; i < 60 * 60; i++) {
    scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16);
    for (const c of st.cuervos) {
      total++;
      if (c.fase === 'camina' || c.fase === 'come') enSuelo++;
    }
  }
  const mojadoEnSuelo = enSuelo / total;
  console.log('  lloviendo: fraccion de tiempo en el suelo/parcela:',
              mojadoEnSuelo.toFixed(3));
  ok(mojadoEnSuelo < 0.02, 'bajo la lluvia NO baja (' +
     (mojadoEnSuelo * 100).toFixed(1) + '%)');
  ok(st.cuervos.every((c) => c.encogido), 'y se queda encogido en la copa',
     st.cuervos.map((c) => c.fase + ':' + c.encogido).join(','));
  ok(st.cuervos.every((c) => c.spr.scaleY < c.spr.scaleX),
     'con el cuello metido (achatado)');
  ok(st.cuervos.every((c) => !c.parcela), 'sin cultivo apuntado');

  titulo('CUERVO: el trueno lo levanta');
  /* Cada cuervo reacciona con probabilidad 0,6, asi que con tres cuervos y UN
     solo trueno hay un 6% de que no se mueva ninguno — y la prueba fallaba una
     de cada dieciseis veces por diseno, no por fallo. Se tiran seis truenos y
     se cuenta el total: que no reaccione nadie en seis pasa una vez cada
     cincuenta mil. */
  let reacciones = 0;
  for (let t = 0; t < 6; t++) {
    const arboles = st.cuervos.map((c) => c.arbol);
    const fases = st.cuervos.map((c) => c.fase);
    oyentesTrueno.forEach((f) => f(true, 1.2));
    correr(scene, 0.2);
    reacciones += st.cuervos.filter((c, i) => c.arbol !== arboles[i] ||
                                    (c.fase === 'volando' && fases[i] !== 'volando')).length;
    correr(scene, 12);
  }
  ok(reacciones > 0, 'el trueno levanta al cuervo (' + reacciones +
     ' reacciones en 6 truenos x ' + st.cuervos.length + ' cuervos)');

  titulo('CUERVO: escampa y vuelve a bajar');
  clima.lluvia = 0; clima.activo = false;
  correr(scene, 120);
  ok(st.cuervos.every((c) => !c.encogido), 'se estira otra vez',
     st.cuervos.map((c) => c.encogido).join(','));
  ok(st.cuervos.every((c) => Math.abs(c.spr.scaleY - c.spr.scaleX) < 0.001),
     'y recupera la escala entera');
  ok(st.cuervos.every((c) => c.spr.anims.timeScale === 1), 'y el ritmo normal');

  titulo('CUERVO: desmontar no deja nada');
  const antes = (scene.__listeners.update || []).length;
  const oyentesAntes = oyentesTrueno.length;
  ctx.GFCuervo.desmontar(scene);
  ok((scene.__listeners.update || []).length < antes, 'quita el update');
  ok((scene.__listeners.shutdown || []).length === 0, 'y el shutdown/destroy');
  ok(oyentesTrueno.length < oyentesAntes, 'y suelta el oyente del trueno (FUGA)');
  ok(scene.__gfCuervos === null, 'la escena queda limpia');
}

// ══════════════════════════════════════════════════════════════════
titulo('CUERVO: sin arboles no se cuelga (bug del huir en bucle)');
{
  const scene = escenaConTexturas({ sinArboles: true });
  scene.player = { x: 2500, y: 2500 };
  const st = ctx.GFCuervo.montar(scene, { cantidad: 2 });
  if (st) {
    st.cuervos.forEach((c) => { c.spr.x = 2510; c.spr.y = 2510; });
    const t0 = Date.now();
    correr(scene, 30);
    ok(Date.now() - t0 < 4000, 'medio minuto simulado en menos de 4 s reales (' +
       (Date.now() - t0) + ' ms)');
    ctx.GFCuervo.desmontar(scene);
  } else { ok(true, 'sin arboles no monta (aceptable)'); }
}

// ══════════════════════════════════════════════════════════════════
titulo('BUHO: con chaparron no sale, y si estaba se va');
{
  const scene = escenaConTexturas();
  scene.player = { x: 100, y: 100 };
  ctx.GFCiclo = { hayHora: () => true, oscuridad: () => 0.9,
                  estado: () => ({ esDia: false }) };
  clima.activo = false; clima.lluvia = 0;
  const st = ctx.GFBuho.montar(scene);
  ok(!!st, 'monta');
  correr(scene, 30);
  ok(!!st.buho, 'de noche y despejado, aparece el buho');
  // Se espera a que se pose: el vuelo de entrada viene de fuera de pantalla.
  let posadoVisto = false, tiempoPosado = 0, muestras = 0;
  for (let i = 0; i < 60 * 120; i++) {
    scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16);
    if (st.buho) {
      muestras++;
      if (st.buho.fase === 'posado') { posadoVisto = true; tiempoPosado++; }
    }
  }
  ok(posadoVisto, 'y se posa');
  const frac = tiempoPosado / Math.max(1, muestras);
  console.log('  fraccion de la noche POSADO:', frac.toFixed(3));
  ok(frac > 0.6, 'y se pasa la noche posado, no cruzando el mapa (' +
     (frac * 100).toFixed(0) + '%)');

  clima.activo = true; clima.lluvia = 1;
  correr(scene, 5);
  ok(!st.buho || st.buho.fase === 'se_va', 'con chaparron se va',
     st.buho ? st.buho.fase : '(ya no esta)');
  correr(scene, 60);
  ok(!st.buho, 'y no vuelve mientras llueva asi');

  clima.lluvia = 0.35;    // llovizna: sale, pero encogido
  correr(scene, 80);
  ok(!!st.buho, 'con llovizna si sale');
  if (st.buho) {
    correr(scene, 60);
    const arbol0 = st.buho.arbol;
    correr(scene, 200);
    ok(st.buho && st.buho.arbol === arbol0,
       'pero no se cambia de arbol mientras llueve');
  }
  clima.lluvia = 0; clima.activo = false;
  correr(scene, 60);
  ctx.GFBuho.desmontar(scene);
  ok(scene.__gfBuho === null, 'desmonta limpio');
  ok((scene.__listeners.update || []).length === 0, 'sin update colgando');
  delete ctx.GFCiclo;
}

console.log('\n' + '='.repeat(60));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
