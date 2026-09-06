/* Cuanto tarda un conejo SIN CASA, bajo la lluvia, en abrir su madriguera,
   y cuantas veces reinicia la animacion de cavar por el camino. */
'use strict';
const banco = require('./fauna-banco.js');
const { crearEscena, ctx, clima } = banco;
const GFA = ctx.GFAnimales;

const scene = crearEscena();
scene.player = { x: 100, y: 100 };
const st = GFA.montar(scene, { elenco: [['conejo', 8]] });

clima.activo = true; clima.lluvia = 1;

// que arranque el clima interpolado
for (let i = 0; i < 60; i++) { scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16); }

const tiempos = [];
let reinicios = 0;
for (const c of st.animales) {
  if (c.madriguera) c.madriguera.destroy();
  c.madriguera = null; c.casa = null; c.enMadriguera = false;
  c.spr.setVisible(true);
  c.aCubierto = false; c.refugio = null; c.reaccionaEn = 0;
  c.fase = 'pasea'; c.hasta = scene.__reloj;
  c.__t0 = scene.__reloj;
  c.__cavando = false;
  c.__reinicios = 0;
  c.__hastaAnterior = 0;
}

for (let i = 0; i < 60 * 90; i++) {          // 90 s
  scene.__reloj += 16;
  scene.events.emit('update', scene.__reloj, 16);
  for (const c of st.animales) {
    if (c.fase === 'cava') {
      // Un reinicio se ve porque le vuelven a poner el reloj de cavar.
      if (c.__cavando && c.hasta > c.__hastaAnterior + 1) c.__reinicios++;
      c.__cavando = true;
      c.__hastaAnterior = c.hasta;
    } else {
      c.__cavando = false;
    }
    if (c.casa && c.__t1 === undefined) c.__t1 = scene.__reloj;
  }
}

for (const c of st.animales) {
  const ms = (c.__t1 === undefined) ? null : c.__t1 - c.__t0;
  tiempos.push(ms);
  reinicios += c.__reinicios;
}
console.log('conejos:', st.animales.length);
console.log('ms hasta abrir la madriguera:', tiempos.map((t) => t === null ? 'NUNCA' : t).join(', '));
const buenos = tiempos.filter((t) => t !== null);
console.log('media:', buenos.length ? Math.round(buenos.reduce((a, b) => a + b, 0) / buenos.length) : '-');
console.log('sin casa a los 90 s:', tiempos.filter((t) => t === null).length);
console.log('veces que se reinicia la animacion de cavar:', reinicios);
