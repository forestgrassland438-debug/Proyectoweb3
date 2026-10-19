/* ¿De verdad se tuestan los reptiles al sol? Se mide cuánto se mueven y qué
   parte del rato se pasan quietos, con y sin sol. */
'use strict';
const banco = require('./fauna-banco.js');
const { crearEscena, ctx, clima } = banco;
const GFA = ctx.GFAnimales;

const scene = crearEscena();
scene.player = { x: 60, y: 60 };            // lejos, que no los espante
const st = GFA.montar(scene, {
  elenco: [['cocodrilo', 3], ['serpiente_verde', 3], ['serpiente_coral', 2],
           ['zorro', 3], ['vaca', 2], ['cerdo', 3]]
});

function medir(segundos, filtro) {
  const bichos = st.animales.filter(filtro);
  const p0 = bichos.map((a) => ({ x: a.spr.x, y: a.spr.y }));
  let quietos = 0, total = 0, recorrido = 0;
  const prev = bichos.map((a) => ({ x: a.spr.x, y: a.spr.y }));
  const n = Math.round(segundos * 1000 / 16);
  for (let i = 0; i < n; i++) {
    scene.__reloj += 16;
    scene.events.emit('update', scene.__reloj, 16);
    for (let k = 0; k < bichos.length; k++) {
      const a = bichos[k];
      total++;
      if (a.fase === 'quieto' || a.fase === 'come' || a.fase === 'tumbado') quietos++;
      recorrido += Math.hypot(a.spr.x - prev[k].x, a.spr.y - prev[k].y);
      prev[k].x = a.spr.x; prev[k].y = a.spr.y;
    }
  }
  return { quieto: +(100 * quietos / total).toFixed(1),
           recorrido: Math.round(recorrido / bichos.length) };
}

const reptil = (a) => a.especie === 'cocodrilo' || a.grupo === 'serpiente';
const mamifero = (a) => a.especie === 'zorro' || a.especie === 'vaca' || a.especie === 'cerdo';

// Se deja rodar un poco para salir del arranque.
for (let i = 0; i < 60 * 30; i++) { scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16); }

clima.activo = false; clima.sol = 0;
const gr = medir(600, reptil);
const gm = medir(600, mamifero);

clima.activo = true; clima.sol = 1;
for (let i = 0; i < 60 * 30; i++) { scene.__reloj += 16; scene.events.emit('update', scene.__reloj, 16); }
const sr = medir(600, reptil);
const sm = medir(600, mamifero);

console.log('                    quieto      px recorridos por bicho');
console.log('REPTILES  sin sol   ' + gr.quieto + '%'.padEnd(8) + '   ' + gr.recorrido);
console.log('REPTILES  a pleno   ' + sr.quieto + '%'.padEnd(8) + '   ' + sr.recorrido);
console.log('MAMIFEROS sin sol   ' + gm.quieto + '%'.padEnd(8) + '   ' + gm.recorrido);
console.log('MAMIFEROS a pleno   ' + sm.quieto + '%'.padEnd(8) + '   ' + sm.recorrido);
console.log('');
console.log('los reptiles se mueven un ' +
            Math.round(100 * (1 - sr.recorrido / gr.recorrido)) + '% menos al sol');
console.log('los mamiferos, un ' +
            Math.round(100 * (1 - sm.recorrido / gm.recorrido)) + '% menos');
