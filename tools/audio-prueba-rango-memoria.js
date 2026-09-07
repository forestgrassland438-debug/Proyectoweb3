/* El sonido: que tenga rango y que no se coma la memoria.
 *
 * DOS COSAS QUE ESTABAN MAL:
 *
 * 1. RANGO. Habia UN solo alcance (430 px) para todos los bichos y el trueno
 *    no tenia ninguno: se soltaba con `sinSitio`, o sea centrado y a pleno
 *    volumen, cayera el rayo donde cayera. Un topo no se oye tan lejos como
 *    una vaca, y un trueno se oye MUCHISIMO mas lejos que cualquier bicho.
 *
 * 2. MEMORIA. Web Audio guarda el sonido DESCODIFICADO: Float32, por canal y
 *    remuestreado a la frecuencia del AudioContext (48 kHz). La frecuencia del
 *    fichero da igual — lo que cuenta es duracion x canales. Y la cache de
 *    Phaser es global: no suelta nada nunca. Medido en el navegador con
 *    `_prueba_audio_memoria.html`: 107 MB, de los cuales 64 MB eran los dos
 *    temas .ogg que gf-audio SUSTITUYE nada mas arrancar y que por tanto nunca
 *    llegaban a sonar.
 *
 * Aqui se carga gf-audio.js de verdad contra un Phaser de mentira. Sin
 * navegador.
 *
 *   node tools/audio-prueba-rango-memoria.js  <carpeta bin>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2] || path.join(__dirname, '..');

// ── Un Phaser de mentira, con cache de sonido y gestor global ────────────────
function mundoFalso() {
  const cache = new Map();
  const sonidosVivos = [];
  const sonados = [];          // lo que se ha llegado a reproducir

  const sound = {
    locked: false,
    context: { sampleRate: 48000, decodeAudioData: null },
    sounds: sonidosVivos,
    add(key) {
      const s = {
        key, isPlaying: false, volume: 0, rate: 1, pan: 0,
        setVolume(v) { this.volume = v; return this; },
        setRate(v) { this.rate = v; return this; },
        setPan(v) { this.pan = v; return this; },
        play() { this.isPlaying = true; sonados.push({ key, volume: this.volume, pan: this.pan }); return this; },
        stop() { this.isPlaying = false; return this; },
        destroy() {
          this.isPlaying = false;
          const i = sonidosVivos.indexOf(this);
          if (i >= 0) sonidosVivos.splice(i, 1);
        }
      };
      sonidosVivos.push(s);
      return s;
    },
    once() {}, off() {}, on() {}
  };

  const escena = {
    sound,
    sys: { isActive: () => true },
    time: { now: 100000 },
    events: { on() {}, once() {}, off() {} },
    load: { audio() {} },
    audioState: { sfxVolumeApplied: 1, musicVolumeApplied: 1, sfxMuted: false,
                  musicMuted: false, currentMusic: null, currentMusicKey: null },
    player: { x: 0, y: 0 },
    cameras: { main: { midPoint: { x: 0, y: 0 } } },
    cache: {
      audio: {
        exists: (k) => cache.has(k),
        get: (k) => cache.get(k),
        add: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
        entries: { each(fn) { for (const [k, v] of cache) if (fn(k, v) === false) break; } }
      }
    },
    _cache: cache, _sonados: sonados, _vivos: sonidosVivos
  };
  return escena;
}

/** Un AudioBuffer de mentira con el peso que tendria de verdad a 48 kHz. */
function buffer(segundos, canales) {
  return { length: Math.round(segundos * 48000), numberOfChannels: canales,
           duration: segundos, sampleRate: 48000 };
}
const MB = (b) => b / 1048576;

// ── Se carga gf-audio.js de verdad ───────────────────────────────────────────
const ventana = {};
const caja = {
  window: ventana, console: { log() {}, warn() {}, error() {} },
  Math, Date, Object, Array, String, Number, JSON, Promise,
  setTimeout, clearTimeout, fetch: () => new Promise(() => {}),
  isNaN, parseInt, parseFloat
};
caja.globalThis = caja;
vm.createContext(caja);
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-audio.js'), 'utf8'), caja,
                { filename: 'gf-audio.js' });
const A = ventana.GFAudio;

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); } };

// Los sonidos que el juego carga de verdad, con su duracion y canales reales.
const CATALOGO = [
  ['gfa_gf_pradera', 31.0, 1], ['gfa_gf_noche', 36.9, 1], ['gfa_gf_tienda', 29.1, 1],
  ['gfa_amb_lluvia', 8, 1], ['gfa_amb_nieve', 8, 1], ['gfa_amb_viento', 10, 1],
  ['gfa_amb_arboles', 8, 1], ['gfa_amb_soleado', 12, 1], ['gfa_amb_noche', 10, 1],
  ['gfa_rayo_1', 5.2, 1], ['gfa_rayo_2', 5.2, 1], ['gfa_rayo_3', 5.2, 1],
  ['gfa_centella_1', 4.6, 1], ['gfa_centella_2', 4.6, 1],
  ['gfa_chispa_1', 0.3, 1], ['gfa_chispa_2', 0.3, 1],
  ['main-theme', 69.8, 2], ['main-theme1', 104.7, 2]
];
const VOCES = { pajaro: 3, paloma: 2, cuervo: 2, buho: 2, vaca: 2, cerdo: 2,
                zorro: 2, cocodrilo: 1, serpiente: 2, conejo: 2, topo: 1 };
for (const v in VOCES) for (let i = 1; i <= VOCES[v]; i++) CATALOGO.push(['gfa_an_' + v + '_' + i, 1.0, 1]);

function llenar(escena) {
  for (const [k, seg, ch] of CATALOGO) escena.cache.audio.add(k, buffer(seg, ch));
}
function pesoTotal(escena) {
  let t = 0;
  for (const [, b] of escena._cache) t += b.length * b.numberOfChannels * 4;
  return t;
}

console.log('=== MEMORIA DEL AUDIO ===\n');

{
  const e = mundoFalso();
  llenar(e);
  const antes = pesoTotal(e);
  console.log('  Con todo cargado: ' + MB(antes).toFixed(1) + ' MB en ' + e._cache.size + ' sonidos');
  ok(MB(antes) > 95 && MB(antes) < 115,
     'el total cuadra con lo medido en el navegador (107 MB)', MB(antes).toFixed(1) + ' MB');

  // 1) Los dos temas .ogg que gf-audio sustituye y que nunca suenan.
  const liberadoOgg = A.soltarTemaDelJuego(e) ;
  console.log('  Soltando los dos .ogg: ' + MB(liberadoOgg).toFixed(1) + ' MB');
  ok(MB(liberadoOgg) > 60,
     'soltar Principal.ogg + tienda.ogg libera mas de 60 MB',
     MB(liberadoOgg).toFixed(1) + ' MB');
  ok(!e.cache.audio.exists('main-theme') && !e.cache.audio.exists('main-theme1'),
     'y salen de la cache');
  ok(MB(pesoTotal(e)) < 45, 'lo que queda baja de 45 MB', MB(pesoTotal(e)).toFixed(1));
}

{
  // 2) Al entrar en la tienda se sueltan los sonidos del campo.
  const e = mundoFalso();
  llenar(e);
  A.soltarTemaDelJuego(e);
  const antes = pesoTotal(e);
  A.montar(e, { tipo: 'tienda' });
  const despues = pesoTotal(e);
  console.log('\n  Al entrar en la tienda: ' + MB(antes).toFixed(1) + ' -> ' +
              MB(despues).toFixed(1) + ' MB');
  ok(despues < antes * 0.35,
     'entrar en la tienda suelta la mayoria del audio del campo',
     MB(antes - despues).toFixed(1) + ' MB liberados');
  ok(e.cache.audio.exists('gfa_gf_tienda'), 'pero se queda el tema de la tienda');
  ok(e.cache.audio.exists('gfa_amb_lluvia'), 'y la lluvia, que se oye desde dentro');
  ok(!e.cache.audio.exists('gfa_an_vaca_1'), 'las voces de animales se sueltan');
  ok(!e.cache.audio.exists('gfa_rayo_1'), 'y los truenos tambien');
  ok(!e.cache.audio.exists('gfa_gf_pradera'), 'y los dos temas del campo');
  A.desmontar(e);
}

{
  // 3) Y al volver al campo se suelta el de la tienda.
  const e = mundoFalso();
  llenar(e);
  A.soltarTemaDelJuego(e);
  A.montar(e, { tipo: 'campo' });
  ok(!e.cache.audio.exists('gfa_gf_tienda'), 'volver al campo suelta el tema de la tienda');
  ok(e.cache.audio.exists('gfa_an_vaca_1') && e.cache.audio.exists('gfa_rayo_1'),
     'y conserva lo del campo');
  const m = A.memoria(e);
  console.log('  En el campo quedan ' + m.MB + ' MB (' + m.sonidos + ' sonidos)');
  ok(m && m.MB < 45, 'en el campo el audio se queda por debajo de 45 MB', m && m.MB);
  A.desmontar(e);
}

{
  // 4) Un sonido que esta SONANDO tambien se para al soltarlo: si no, el Sound
  //    mantiene vivo el buffer y no se libera nada.
  const e = mundoFalso();
  llenar(e);
  const s = e.sound.add('main-theme');
  s.play();
  ok(s.isPlaying, 'preparado: main-theme esta sonando');
  A.soltarTemaDelJuego(e, 'main-theme');
  ok(!s.isPlaying, 'soltar un tema para lo que estuviera sonando con esa clave');
  ok(e._vivos.indexOf(s) < 0, 'y destruye el objeto Sound, que era quien retenia el buffer');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== RANGOS ===\n');

function escenaCampo() {
  const e = mundoFalso();
  llenar(e);
  A.montar(e, { tipo: 'campo' });
  e._sonados.length = 0;
  return e;
}

/** Intenta que hable un bicho a `d` pixeles y dice si ha sonado. */
function hablaA(e, especie, d) {
  e._sonados.length = 0;
  e.time.now += 100000;                      // saltarse la cadencia global
  return A.bicho(e, especie, d, 0, { aLaFuerza: true }) === true;
}

{
  const e = escenaCampo();
  // Cada especie con su alcance: cerca se oye, lejos no.
  const casos = [
    ['conejo',    150, 500],
    ['topo',      150, 500],
    ['serpiente_verde', 120, 500],
    ['cerdo',     300, 700],
    ['zorro',     300, 700],
    ['vaca',      600, 1100],
    ['cocodrilo', 500, 1100]
  ];
  let bien = true, detalle = '';
  for (const [esp, cerca, lejos] of casos) {
    const c = hablaA(e, esp, cerca), l = hablaA(e, esp, lejos);
    if (!c || l) bien = false;
    detalle += '\n    ' + esp.padEnd(18) + ' a ' + String(cerca).padStart(4) + 'px: ' +
               (c ? 'suena' : 'NO suena') + '   a ' + String(lejos).padStart(4) + 'px: ' +
               (l ? 'SUENA (mal)' : 'no suena');
  }
  console.log(detalle);
  ok(bien, 'cada bicho se oye de cerca y NO se oye de lejos');

  // Y la vaca llega mas lejos que el conejo, que es de lo que se trata.
  ok(hablaA(e, 'vaca', 600) && !hablaA(e, 'conejo', 600),
     'a 600 px se oye la vaca pero ya no el conejo');
  A.desmontar(e);
}

{
  const e = escenaCampo();
  // El trueno: alcance enorme, pero alcance al fin y al cabo.
  const truenoA = (d) => {
    e._sonados.length = 0;
    A.trueno(true, 1, d, 0);
    return e._sonados.length > 0 ? e._sonados[e._sonados.length - 1] : null;
  };
  const cerca = truenoA(200), medio = truenoA(1800), lejos = truenoA(3200), fuera = truenoA(5000);
  console.log('    trueno a  200px: ' + (cerca ? 'vol ' + cerca.volume.toFixed(3) : 'no suena'));
  console.log('    trueno a 1800px: ' + (medio ? 'vol ' + medio.volume.toFixed(3) : 'no suena'));
  console.log('    trueno a 3200px: ' + (lejos ? 'vol ' + lejos.volume.toFixed(3) : 'no suena'));
  console.log('    trueno a 5000px: ' + (fuera ? 'vol ' + fuera.volume.toFixed(3) : 'no suena'));

  ok(!!cerca, 'el trueno de al lado suena');
  ok(!!medio, 'y el de 1800 px tambien (alcance mucho mayor que el de un bicho)');
  ok(!!lejos, 'y el de 3200 px tambien: el alcance declarado (3400) es el real');
  ok(!fuera, 'pero uno a 5000 px NO suena: el trueno tiene rango, ya no es global');
  ok(cerca && medio && cerca.volume > medio.volume * 1.5,
     'y cuanto mas lejos cae, mas flojo se oye (antes sonaban todos igual)');

  // Panea: un rayo a la derecha se oye por la derecha.
  e._sonados.length = 0; A.trueno(true, 1, 2000, 0);
  const derecha = e._sonados[0];
  e._sonados.length = 0; A.trueno(true, 1, -2000, 0);
  const izquierda = e._sonados[0];
  ok(derecha && izquierda && derecha.pan > 0.2 && izquierda.pan < -0.2,
     'y suena por el lado por el que ha caido', derecha && (derecha.pan.toFixed(2) + ' / ' + izquierda.pan.toFixed(2)));

  // Sin coordenadas se queda centrado, como antes.
  e._sonados.length = 0; A.trueno(true, 1);
  ok(e._sonados.length === 1 && e._sonados[0].pan === 0,
     'un trueno sin sitio (centella lejana) sigue sonando centrado');

  // La chispa tiene un alcance intermedio.
  const chispaA = (d) => { e._sonados.length = 0; A.chispa(1, d, 0); return e._sonados.length > 0; };
  ok(chispaA(600), 'el crujido electrico se oye a 600 px');
  ok(!chispaA(2200), 'pero no a 2200 px: llega menos lejos que el trueno');
  A.desmontar(e);
}

console.log('\n' + '='.repeat(66));
console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
process.exit(fallos ? 1 : 0);
