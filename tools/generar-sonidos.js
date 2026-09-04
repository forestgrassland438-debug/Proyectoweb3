#!/usr/bin/env node
/**
 * =============================================================================
 * GENERADOR DE SONIDOS DE 8 BITS  ->  Game/MUSIC/
 * =============================================================================
 *
 * POR QUÉ EXISTE ESTE SCRIPT
 * ---------------------------------------------------------------------------
 * El juego pide sonido de ambiente: lluvia, truenos, viento, hojas, grillos,
 * bichos, pisadas según lo que se pise, y dos temas nuevos de música. Comprar
 * o descargar cincuenta archivos sueltos tiene tres problemas conocidos en
 * este proyecto:
 *
 *   1. Ya pasó con el clima: catorce PNG que nadie subió a producción tumbaron
 *      el sistema entero. Un archivo que no está es un sistema que no arranca.
 *   2. Cada archivo suelto es una licencia distinta que auditar.
 *   3. No se pueden retocar. Si el trueno suena flojo, hay que buscar otro.
 *
 * Aquí los sonidos se ESCRIBEN, no se buscan. Este script los sintetiza con
 * las mismas cuatro voces que tenía una NES —onda de pulso, triángulo y ruido
 * de registro de desplazamiento— y los deja en `Game/MUSIC/` como WAV de 8
 * bits. Si mañana el trueno tiene que retumbar más, se toca un número de este
 * archivo y se vuelve a ejecutar. No hace falta nada instalado: ni ffmpeg, ni
 * paquetes de npm, ni conexión.
 *
 * POR QUÉ WAV DE 8 BITS Y NO OGG
 * ---------------------------------------------------------------------------
 * No hay codificador de OGG en esta máquina (ni ffmpeg ni oggenc), y meter una
 * dependencia para esto no compensa. El WAV PCM de 8 bits sin signo lo
 * descodifica cualquier navegador desde hace veinte años, y además ES el
 * formato: 256 niveles de amplitud son exactamente lo que da el crujido de
 * consola antigua que se ha pedido. Lo que en un disco de música sería un
 * defecto, aquí es el timbre.
 *
 * El tamaño sale de sobra: los dos temas que se sustituyen (Principal.ogg 1,7
 * MB y tienda.ogg 3,4 MB) pesan más que TODO lo que genera este script.
 *
 * CÓMO SE USA
 * ---------------------------------------------------------------------------
 *     node tools/generar-sonidos.js                 (todo)
 *     node tools/generar-sonidos.js trueno paso     (solo lo que case)
 *     node tools/generar-sonidos.js --listar        (qué generaría, sin tocar disco)
 *
 * LOS BUCLES NO CHASQUEAN
 * ---------------------------------------------------------------------------
 * Un bucle de audio que empalma mal se oye como un golpecito cada vez que da
 * la vuelta, y una vez que lo oyes ya no lo puedes dejar de oír. Aquí se evita
 * de dos maneras:
 *
 *   - La música se escribe en CIRCULAR (`sumar()` envuelve por el final): la
 *     cola de la última nota cae sobre el primer compás, que es exactamente lo
 *     que pasaría si el tema sonara seguido.
 *   - Los ambientes modulan con osciladores cuyo número de ciclos dentro del
 *     bucle es ENTERO, así que llegan al final en la misma fase en la que
 *     empezaron.
 * ========================================================================= */

'use strict';

const fs   = require('fs');
const path = require('path');

const RAIZ    = path.resolve(__dirname, '..');
const DESTINO = path.join(RAIZ, 'Game', 'MUSIC');

/* Frecuencias de muestreo. El ambiente va a la mitad a propósito: es ruido
   filtrado y no tiene nada que contar por encima de 5 kHz, así que a 11025 Hz
   suena idéntico y ocupa la mitad. */
const SR_MUSICA   = 22050;
const SR_EFECTO   = 22050;
const SR_AMBIENTE = 11025;

/* Valor eficaz al que se igualan los tres temas. Se midieron normalizados por
   pico y salían a 0,19 (campo), 0,25 (noche) y 0,13 (tienda): entrar a la
   tienda bajaba el volumen a la mitad sin que nadie tocara nada. Con un
   objetivo común los tres suenan igual de fuertes, que es lo único que se
   nota al cambiar de escena. */
const NIVEL_MUSICA = 0.21;

// ===========================================================================
// 1. LAS VOCES  (las cuatro de una consola de 8 bits)
// ===========================================================================

/**
 * Onda de PULSO. Es la voz principal de la NES: dos canales de pulso llevaban
 * melodía y acompañamiento en casi todo lo que sonó en aquella máquina.
 *
 * El `ciclo` (duty) cambia el carácter sin cambiar la nota:
 *   0.50 → cuadrada pura, redonda, para melodías
 *   0.25 → nasal, se abre paso por encima de todo
 *   0.125 → fina y metálica, para arpegios de fondo
 *
 * SE LE QUITA LA COMPONENTE CONTINUA. Un pulso al 12,5 % pasa el 87,5 % del
 * tiempo abajo, así que su valor medio es −0,75: la onda entera está corrida
 * hacia abajo. Eso tiene dos consecuencias malas, y las dos se midieron aquí
 * antes de corregirlo:
 *
 *   - El gruñido del cocodrilo salía con una continua de −0,24. Al normalizar
 *     por el pico, esa continua se lleva un cuarto del margen y el sonido
 *     acaba sonando la mitad de fuerte de lo que debería.
 *   - Un efecto corto que empieza y acaba con la señal lejos del cero da un
 *     CHASQUIDO al arrancar y otro al parar. Encima de la música se oye.
 *
 * Restar `2·ciclo − 1` centra la onda sin tocar su timbre: el salto sigue
 * siendo instantáneo y los armónicos son los mismos.
 */
function pulso(fase, ciclo) {
  return ((fase % 1) < ciclo ? 1 : -1) - (2 * ciclo - 1);
}

/** Triángulo: el canal del bajo. Sin ataque, redondo, no molesta a la melodía. */
function triangulo(fase) {
  const t = (fase + 0.25) % 1;
  return 4 * Math.abs(t - 0.5) - 1;
}

/**
 * RUIDO DE REGISTRO DE DESPLAZAMIENTO (LFSR), como el canal 4 de la NES.
 *
 * No es ruido blanco: es un registro de 15 bits que se realimenta consigo
 * mismo y se refresca cada `periodo` muestras. Ese refresco a saltos es lo que
 * le da el grano — un periodo corto suena a siseo de lluvia y uno largo a
 * retumbo de trueno, con la MISMA fórmula. El ruido blanco de verdad suena a
 * televisor sin señal y no pega en un juego así.
 *
 * El modo "corto" (registro de 6 bits) da el timbre metálico que usaban las
 * consolas para los golpes; se usa aquí en las pisadas de ladrillo.
 */
function crearRuido(periodo, corto) {
  let reg = 1;
  let cuenta = 0;
  let valor = 1;
  return function () {
    if (cuenta <= 0) {
      const bit = (reg ^ (reg >> (corto ? 6 : 1))) & 1;
      reg = (reg >> 1) | (bit << 14);
      valor = (reg & 1) ? 1 : -1;
      cuenta = periodo;
    }
    cuenta--;
    return valor;
  };
}

// ===========================================================================
// 2. HERRAMIENTAS DE SEÑAL
// ===========================================================================

/** Filtro de un polo. `k` de 0 (todo cerrado) a 1 (abierto). */
function pasoBajo(k) {
  let y = 0;
  return function (x) { y += k * (x - y); return y; };
}
function pasoAlto(k) {
  let y = 0;
  return function (x) { y += k * (x - y); return x - y; };
}

/**
 * Envolvente ADSR en fracción de la nota (0..1 de recorrido).
 * Devuelve la ganancia para una posición `p` dentro de una nota de `n` muestras.
 */
function envolvente(p, n, a, d, s, r) {
  const ma = a * n, md = d * n, mr = r * n;
  if (p < ma) return ma > 0 ? p / ma : 1;
  if (p < ma + md) return md > 0 ? 1 - (1 - s) * (p - ma) / md : s;
  if (p < n - mr) return s;
  return mr > 0 ? s * Math.max(0, (n - p) / mr) : 0;
}

/** Suma en circular: lo que se sale por el final entra por el principio. */
function sumar(buf, i, v) {
  buf[((i % buf.length) + buf.length) % buf.length] += v;
}

// ===========================================================================
// 3. NOTAS
// ===========================================================================

const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** 'A4' → 440. 'C#5' → 554.37. */
function nota(nombre) {
  const m = /^([A-G]#?)(-?\d)$/.exec(nombre);
  if (!m) throw new Error('nota mal escrita: ' + nombre);
  const n = SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12;   // C-1 = 0, A4 = 69
  return 440 * Math.pow(2, (n - 69) / 12);
}

// ===========================================================================
// 4. EL SECUENCIADOR
// ===========================================================================

/**
 * Toca una nota dentro del búfer.
 *
 * op: { onda, f, ini, dur, vol, ciclo, a, d, s, r, vibrato, caida, ruidoP }
 *   onda   'pulso' | 'triangulo' | 'ruido'
 *   caida  semitonos que baja la nota mientras suena (los golpes de percusión
 *          y los efectos de rayo viven de esto)
 */
function tocarNota(buf, sr, op) {
  const n = Math.round(op.dur * sr);
  const ini = Math.round(op.ini * sr);
  const vol = op.vol === undefined ? 0.2 : op.vol;
  const a = op.a === undefined ? 0.004 : op.a;
  const d = op.d === undefined ? 0.10 : op.d;
  const s = op.s === undefined ? 0.75 : op.s;
  const r = op.r === undefined ? 0.28 : op.r;
  const ciclo = op.ciclo === undefined ? 0.5 : op.ciclo;
  const vib = op.vibrato || 0;
  const vibHz = op.vibratoHz || 5.5;
  const caida = op.caida || 0;

  const ruido = op.onda === 'ruido' ? crearRuido(op.ruidoP || 8, op.corto) : null;
  const filtro = op.filtro ? pasoBajo(op.filtro) : null;
  const filtroAlto = op.filtroAlto ? pasoAlto(op.filtroAlto) : null;

  let fase = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    let f = op.f;
    if (caida) f *= Math.pow(2, -caida * p / 12);
    if (vib) f *= 1 + vib * Math.sin(2 * Math.PI * vibHz * i / sr);

    let v;
    if (ruido) v = ruido();
    else {
      fase += f / sr;
      v = op.onda === 'triangulo' ? triangulo(fase) : pulso(fase, ciclo);
    }
    if (filtro) v = filtro(v);
    if (filtroAlto) v = filtroAlto(v);

    sumar(buf, ini + i, v * vol * envolvente(i, n, a, d, s, r));
  }
}

/**
 * Un canal entero escrito como patrón de tracker.
 *
 * El texto son PASOS separados por espacios, uno por semicorchea:
 *   'C5'  empieza una nota      '.'  la anterior sigue sonando
 *   '-'   silencio
 *
 * Se comprueba que cada compás tenga 16 pasos: un compás descuadrado
 * desplaza todo lo que viene detrás y el fallo aparece treinta segundos más
 * tarde, donde nadie lo busca.
 */
function canal(buf, sr, bpm, texto, op) {
  const pasos = texto.trim().split(/\s+/);
  if (pasos.length % 16 !== 0) {
    throw new Error('el patrón tiene ' + pasos.length + ' pasos; no es múltiplo de 16 (compás incompleto)');
  }
  const dpaso = 60 / bpm / 4;             // duración de una semicorchea
  const desfase = op.desfase || 0;

  let i = 0;
  while (i < pasos.length) {
    if (pasos[i] === '-' || pasos[i] === '.') { i++; continue; }
    let largo = 1;
    while (i + largo < pasos.length && pasos[i + largo] === '.') largo++;
    const notas = pasos[i].split(',');     // 'C4,E4,G4' = acorde
    for (const nn of notas) {
      tocarNota(buf, sr, Object.assign({}, op, {
        f: nota(nn),
        ini: desfase + i * dpaso,
        dur: largo * dpaso * (op.picado || 0.94)
      }));
    }
    i += largo;
  }
  return pasos.length * dpaso;
}

// ===========================================================================
// 5. PERCUSIÓN
// ===========================================================================

/** Bombo: golpe de triángulo que cae dos octavas en 90 ms. Se siente más que se oye. */
function bombo(buf, sr, t, vol) {
  tocarNota(buf, sr, { onda: 'triangulo', f: 150, ini: t, dur: 0.11, vol: vol * 0.9,
                       a: 0.001, d: 0.9, s: 0.05, r: 0.05, caida: 26 });
}
/** Caja: ruido corto con cuerpo. */
function caja(buf, sr, t, vol) {
  tocarNota(buf, sr, { onda: 'ruido', ruidoP: 3, ini: t, dur: 0.10, vol: vol * 0.55,
                       a: 0.001, d: 0.5, s: 0.18, r: 0.5, f: 1, filtroAlto: 0.35 });
  tocarNota(buf, sr, { onda: 'triangulo', f: 320, ini: t, dur: 0.05, vol: vol * 0.35,
                       a: 0.001, d: 0.7, s: 0.05, r: 0.3, caida: 12 });
}
/** Charles: chispita de ruido muy fino. */
function charles(buf, sr, t, vol) {
  tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, ini: t, dur: 0.035, vol: vol * 0.3,
                       a: 0.001, d: 0.6, s: 0.05, r: 0.4, f: 1, filtroAlto: 0.6 });
}

/** Escribe una línea de percusión: 'B - c - ' con B bombo, c caja, h charles. */
function ritmo(buf, sr, bpm, texto, vol) {
  const pasos = texto.trim().split(/\s+/);
  const dpaso = 60 / bpm / 4;
  pasos.forEach((p, i) => {
    const t = i * dpaso;
    if (p.indexOf('B') >= 0) bombo(buf, sr, t, vol);
    if (p.indexOf('c') >= 0) caja(buf, sr, t, vol);
    if (p.indexOf('h') >= 0) charles(buf, sr, t, vol);
  });
}

// ===========================================================================
// 6. ESCRIBIR EL WAV
// ===========================================================================

/**
 * Normaliza y guarda como WAV PCM de 8 bits sin signo.
 *
 * La normalización IMPORTA: en 8 bits solo hay 256 escalones, así que un
 * archivo grabado a media escala pierde un bit entero de resolución y suena
 * el doble de sucio. Se normaliza al 92 % —no al 100 %— para dejar aire y que
 * el recorte no muerda si dos voces coinciden justo en el pico.
 *
 * DOS PASOS ANTES DE ESCRIBIR:
 *
 *   1. Se quita la continua que quede. Las voces ya vienen centradas, pero
 *      un ruido filtrado con paso bajo muy cerrado deriva solo.
 *   2. Si se pide `rms`, se iguala por VOLUMEN PERCIBIDO y no por pico. Los
 *      tres temas se midieron y salían a 0,19 / 0,25 / 0,13 de valor eficaz:
 *      la tienda sonaba notablemente más floja que el campo aunque los tres
 *      llegaban al mismo pico, porque el tema de tienda es picado y está
 *      lleno de huecos. El pico manda sobre el recorte; el valor eficaz manda
 *      sobre lo que oye una persona.
 */
function guardar(nombre, sr, buf, op) {
  op = op || {};

  // 1. fuera la continua
  let media = 0;
  for (let i = 0; i < buf.length; i++) media += buf[i];
  media /= buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= media;

  let pico = 0, energia = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]); if (a > pico) pico = a;
    energia += buf[i] * buf[i];
  }
  const techo = op.pico || 0.92;
  let g = pico > 0 ? techo / pico : 1;

  /* 2. igualar por valor eficaz.
     Cuando se pide, el valor eficaz manda y los picos que sobresalgan los
     redondea una tangente hiperbólica. Es un limitador blando de un renglón:
     por debajo del techo no toca nada (tanh(x)≈x) y por encima dobla la punta
     en vez de cortarla en seco. Recortar a lo bruto en 8 bits mete un
     zumbido áspero que se oye; doblar la punta, no. */
  let limitar = false;
  if (op.rms) {
    const rms = Math.sqrt(energia / buf.length);
    if (rms > 0) { g = op.rms / rms; limitar = true; }
  }

  const datos = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * g;
    if (limitar) v = techo * Math.tanh(v / techo);
    /* Un pelín de temblor en los ambientes. Sin él, el ruido muy bajo se queda
       pegado a dos o tres escalones y suena a robot; con él vuelve a sonar a
       aire. En la música NO se usa: ahí el escalón limpio ES el sonido. */
    if (op.temblor) v += (Math.random() + Math.random() - 1) / 256;
    datos[i] = Math.max(0, Math.min(255, Math.round(v * 127) + 128));
  }

  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0, 'ascii');
  cab.writeUInt32LE(36 + datos.length, 4);
  cab.write('WAVEfmt ', 8, 'ascii');
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);        // PCM
  cab.writeUInt16LE(1, 22);        // mono
  cab.writeUInt32LE(sr, 24);
  cab.writeUInt32LE(sr, 28);       // bytes por segundo
  cab.writeUInt16LE(1, 32);        // alineación de bloque
  cab.writeUInt16LE(8, 34);        // bits
  cab.write('data', 36, 'ascii');
  cab.writeUInt32LE(datos.length, 40);

  const ruta = path.join(DESTINO, nombre);
  fs.writeFileSync(ruta, Buffer.concat([cab, datos]));
  const kb = Math.round((cab.length + datos.length) / 1024);
  console.log('  ✔ ' + nombre.padEnd(24) + String(kb).padStart(6) + ' KB   ' +
              (buf.length / sr).toFixed(2) + ' s');
  return kb;
}

function lienzo(sr, segundos) { return new Float64Array(Math.round(sr * segundos)); }

// ===========================================================================
// 7. LOS TEMAS
// ===========================================================================

/**
 * PRADERA — el tema de GameScene.
 *
 * Do mayor, 124 pulsos por minuto, dieciséis compases. Va por delante de una
 * vuelta de acordes I–vi–IV–V, que es la de medio siglo de canciones porque
 * funciona, y en la segunda mitad sube a la subdominante para que la vuelta al
 * principio se note como una vuelta y no como que se ha quedado colgado.
 *
 * Cuatro voces, como la máquina que imita: melodía en pulso al 50 %, arpegios
 * en pulso al 12,5 % (fino, para que no tape la melodía), bajo de triángulo y
 * percusión de ruido.
 */
function temaPradera() {
  const sr = SR_MUSICA, bpm = 124;
  const compas = 16 * (60 / bpm / 4);
  const buf = lienzo(sr, compas * 16);

  //         |1 . . . 2 . . . 3 . . . 4 . . .|
  const mel =
    'E5 .  .  G5 A5 .  G5 .  E5 .  D5 .  C5 .  .  .  ' +   // C
    'C5 .  E5 .  G5 .  .  E5 A4 .  C5 .  B4 .  .  .  ' +   // Am
    'F5 .  .  E5 D5 .  C5 .  D5 .  E5 .  F5 .  .  .  ' +   // F
    'G5 .  F5 .  E5 .  D5 .  C5 .  .  .  -  -  -  -  ' +   // G
    'E5 .  .  G5 A5 .  C6 .  B5 .  A5 .  G5 .  .  .  ' +   // C
    'A5 .  G5 .  E5 .  .  D5 C5 .  D5 .  E5 .  .  .  ' +   // Am
    'F5 .  .  A5 G5 .  F5 .  E5 .  D5 .  C5 .  .  .  ' +   // F
    'D5 .  E5 .  F5 .  G5 .  A5 .  .  .  G5 .  .  .  ' +   // G
    'C6 .  .  B5 A5 .  G5 .  E5 .  G5 .  A5 .  .  .  ' +   // C
    'G5 .  E5 .  D5 .  E5 .  C5 .  .  .  A4 .  .  .  ' +   // Am
    'F5 .  G5 .  A5 .  .  G5 F5 .  E5 .  D5 .  .  .  ' +   // F
    'C5 .  D5 .  E5 .  F5 .  G5 .  .  .  .  .  -  -  ' +   // G
    'A5 .  .  G5 F5 .  E5 .  D5 .  .  C5 D5 .  E5 .  ' +   // F  (la vuelta larga)
    'G5 .  .  A5 G5 .  E5 .  D5 .  C5 .  .  .  -  -  ' +   // G
    'C5 .  E5 .  G5 .  C6 .  B5 .  A5 .  G5 .  E5 .  ' +   // C
    'D5 .  .  .  G4 .  B4 .  D5 .  .  .  -  -  -  -  ';    // G7 → vuelve a C

  const arp =
    'C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 ' +
    'A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 ' +
    'F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 ' +
    'G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 ' +
    'C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 ' +
    'A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 ' +
    'F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 ' +
    'G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 ' +
    'C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 ' +
    'A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 ' +
    'F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 ' +
    'G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 ' +
    'F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 ' +
    'G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 ' +
    'C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 ' +
    'G3 B3 D4 F4 G3 B3 D4 F4 G3 B3 D4 F4 G3 B3 D4 F4 ';

  const bajo =
    'C2 .  .  .  G2 .  C2 .  E2 .  .  .  G2 .  .  .  ' +
    'A1 .  .  .  E2 .  A1 .  C2 .  .  .  E2 .  .  .  ' +
    'F1 .  .  .  C2 .  F1 .  A1 .  .  .  C2 .  .  .  ' +
    'G1 .  .  .  D2 .  G1 .  B1 .  .  .  D2 .  .  .  ' +
    'C2 .  .  .  G2 .  C2 .  E2 .  .  .  G2 .  .  .  ' +
    'A1 .  .  .  E2 .  A1 .  C2 .  .  .  E2 .  .  .  ' +
    'F1 .  .  .  C2 .  F1 .  A1 .  .  .  C2 .  .  .  ' +
    'G1 .  .  .  D2 .  G1 .  B1 .  .  .  D2 .  .  .  ' +
    'C2 .  .  .  G2 .  C2 .  E2 .  .  .  G2 .  .  .  ' +
    'A1 .  .  .  E2 .  A1 .  C2 .  .  .  E2 .  .  .  ' +
    'F1 .  .  .  C2 .  F1 .  A1 .  .  .  C2 .  .  .  ' +
    'G1 .  .  .  D2 .  G1 .  B1 .  .  .  D2 .  .  .  ' +
    'F1 .  .  .  C2 .  F1 .  A1 .  .  .  C2 .  .  .  ' +
    'G1 .  .  .  D2 .  G1 .  B1 .  .  .  D2 .  .  .  ' +
    'C2 .  .  .  G2 .  C2 .  E2 .  .  .  G2 .  .  .  ' +
    'G1 .  .  .  G1 .  .  .  G1 .  D2 .  F2 .  .  .  ';

  canal(buf, sr, bpm, mel,  { onda: 'pulso', ciclo: 0.5,   vol: 0.30, a: 0.005, d: 0.14, s: 0.72, r: 0.30 });
  canal(buf, sr, bpm, arp,  { onda: 'pulso', ciclo: 0.125, vol: 0.085, a: 0.002, d: 0.35, s: 0.30, r: 0.45, picado: 0.9 });
  canal(buf, sr, bpm, bajo, { onda: 'triangulo',           vol: 0.34, a: 0.004, d: 0.20, s: 0.80, r: 0.25 });

  // Percusión: cuatro compases que se repiten, con remate en el octavo.
  const base = 'Bh -  h  -  ch -  h  B  Bh -  h  -  ch -  h  -  ';
  const cola = 'Bh -  h  -  ch -  h  B  Bh -  ch h  c  c  c  c  ';
  const dpaso = 60 / bpm / 4;
  for (let c = 0; c < 16; c++) {
    const trozo = lienzo(sr, compas);
    ritmo(trozo, sr, bpm, (c % 8 === 7) ? cola : base, 0.5);
    for (let i = 0; i < trozo.length; i++) sumar(buf, Math.round(c * compas * sr) + i, trozo[i]);
  }
  void dpaso;

  return { sr, buf, rms: NIVEL_MUSICA };
}

/**
 * NOCHE — el tema que suena cuando anochece en GameScene.
 *
 * La misma pradera, doce horas después: la mitad de pulso (78 bpm), la menor,
 * sin percusión ninguna y con el bajo sosteniendo compases enteros. La melodía
 * deja huecos de dos tiempos a propósito — de noche lo que se tiene que oír
 * son los grillos y el búho, y una melodía apretada no los dejaría pasar.
 */
function temaNoche() {
  const sr = SR_MUSICA, bpm = 78;
  const compas = 16 * (60 / bpm / 4);
  const buf = lienzo(sr, compas * 12);

  const mel =
    'A4 .  .  .  .  .  C5 .  B4 .  .  .  -  -  -  -  ' +
    'E5 .  .  .  D5 .  .  .  C5 .  B4 .  A4 .  .  .  ' +
    'F4 .  .  .  .  .  A4 .  G4 .  .  .  -  -  -  -  ' +
    'C5 .  .  .  B4 .  .  .  A4 .  .  .  -  -  -  -  ' +
    'A4 .  .  .  .  .  E5 .  D5 .  .  .  -  -  -  -  ' +
    'C5 .  .  .  B4 .  C5 .  A4 .  .  .  -  -  -  -  ' +
    'D5 .  .  .  .  .  F5 .  E5 .  .  .  -  -  -  -  ' +
    'E5 .  D5 .  C5 .  B4 .  A4 .  .  .  -  -  -  -  ' +
    'F4 .  .  .  .  .  C5 .  A4 .  .  .  -  -  -  -  ' +
    'G4 .  .  .  .  .  D5 .  B4 .  .  .  -  -  -  -  ' +
    'A4 .  .  .  C5 .  .  .  E5 .  .  .  D5 .  .  .  ' +
    'A4 .  .  .  .  .  .  .  .  .  .  .  -  -  -  -  ';

  const pad =
    'A3,C4,E4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'A3,C4,E4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'F3,A3,C4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'E3,G3,B3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'A3,C4,E4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'A3,C4,E4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'D3,F3,A3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'E3,G3,B3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'F3,A3,C4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'G3,B3,D4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'A3,C4,E4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ' +
    'E3,G3,B3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ';

  const bajo =
    'A1 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  .  ' +
    'A1 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  .  ' +
    'F1 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  .  ' +
    'E1 .  .  .  .  .  .  .  B1 .  .  .  .  .  .  .  ' +
    'A1 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  .  ' +
    'A1 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  .  ' +
    'D1 .  .  .  .  .  .  .  A1 .  .  .  .  .  .  .  ' +
    'E1 .  .  .  .  .  .  .  B1 .  .  .  .  .  .  .  ' +
    'F1 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  .  ' +
    'G1 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  .  ' +
    'A1 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  .  ' +
    'E1 .  .  .  .  .  .  .  E1 .  .  .  .  .  .  .  ';

  canal(buf, sr, bpm, mel,  { onda: 'pulso', ciclo: 0.5,  vol: 0.24, a: 0.03, d: 0.25, s: 0.55, r: 0.55,
                              vibrato: 0.006, vibratoHz: 4.5 });
  canal(buf, sr, bpm, pad,  { onda: 'pulso', ciclo: 0.25, vol: 0.045, a: 0.25, d: 0.30, s: 0.55, r: 0.45, picado: 0.99 });
  canal(buf, sr, bpm, bajo, { onda: 'triangulo',          vol: 0.30, a: 0.02, d: 0.25, s: 0.70, r: 0.40, picado: 0.99 });

  return { sr, buf, rms: NIVEL_MUSICA };
}

/**
 * TIENDA — el tema de tiendajuego.
 *
 * Fa mayor, 132 bpm y bajo andante: la tienda tiene que dar ganas de quedarse
 * un rato mirando, así que va más alegre y más movida que el campo, con la
 * melodía picada y un charles constante que marca el paso.
 */
function temaTienda() {
  const sr = SR_MUSICA, bpm = 132;
  const compas = 16 * (60 / bpm / 4);
  const buf = lienzo(sr, compas * 16);

  const mel =
    'F5 -  A5 -  C6 -  A5 -  G5 -  F5 -  E5 -  -  -  ' +
    'D5 -  F5 -  A5 -  F5 -  E5 -  D5 -  C5 -  -  -  ' +
    'A#4 - D5 -  F5 -  D5 -  C5 -  A#4 - A4 -  -  -  ' +
    'C5 -  E5 -  G5 -  E5 -  D5 -  C5 -  D5 -  E5 -  ' +
    'F5 -  A5 -  C6 -  D6 -  C6 -  A5 -  F5 -  -  -  ' +
    'D5 -  F5 -  A5 -  C6 -  A5 -  G5 -  F5 -  -  -  ' +
    'A#4 - D5 -  F5 -  A5 -  G5 -  F5 -  E5 -  D5 -  ' +
    'C5 -  E5 -  G5 -  F5 -  E5 -  D5 -  C5 -  -  -  ' +
    'A5 -  G5 -  F5 -  E5 -  D5 -  C5 -  A#4 - -  -  ' +
    'A4 -  C5 -  F5 -  A5 -  G5 -  E5 -  C5 -  -  -  ' +
    'D5 -  F5 -  A5 -  D6 -  C6 -  A5 -  F5 -  D5 -  ' +
    'C5 -  E5 -  G5 -  A5 -  F5 -  -  -  -  -  -  -  ' +
    'A#4 - D5 -  F5 -  A5 -  G5 -  F5 -  D5 -  -  -  ' +
    'C5 -  E5 -  G5 -  C6 -  A5 -  G5 -  E5 -  -  -  ' +
    'D5 -  F5 -  A5 -  D6 -  C6 -  A5 -  F5 -  D5 -  ' +
    'G5 -  F5 -  E5 -  D5 -  C5 -  -  -  -  -  -  -  ';

  const bajo =
    'F1 -  F2 -  A1 -  C2 -  F1 -  F2 -  C2 -  A1 -  ' +
    'D1 -  D2 -  F1 -  A1 -  D1 -  D2 -  A1 -  F1 -  ' +
    'A#0 - A#1 - D1 -  F1 -  A#0 - A#1 - F1 -  D1 -  ' +
    'C1 -  C2 -  E1 -  G1 -  C1 -  C2 -  G1 -  E1 -  ' +
    'F1 -  F2 -  A1 -  C2 -  F1 -  F2 -  C2 -  A1 -  ' +
    'D1 -  D2 -  F1 -  A1 -  D1 -  D2 -  A1 -  F1 -  ' +
    'A#0 - A#1 - D1 -  F1 -  A#0 - A#1 - F1 -  D1 -  ' +
    'C1 -  C2 -  E1 -  G1 -  C1 -  C2 -  G1 -  E1 -  ' +
    'D1 -  D2 -  F1 -  A1 -  D1 -  D2 -  A1 -  F1 -  ' +
    'F1 -  F2 -  A1 -  C2 -  F1 -  F2 -  C2 -  A1 -  ' +
    'A#0 - A#1 - D1 -  F1 -  A#0 - A#1 - F1 -  D1 -  ' +
    'C1 -  C2 -  G1 -  C2 -  C1 -  -  -  C2 -  -  -  ' +
    'A#0 - A#1 - D1 -  F1 -  A#0 - A#1 - F1 -  D1 -  ' +
    'C1 -  C2 -  E1 -  G1 -  C1 -  C2 -  G1 -  E1 -  ' +
    'D1 -  D2 -  F1 -  A1 -  D1 -  D2 -  A1 -  F1 -  ' +
    'C1 -  C2 -  E1 -  G1 -  A#1 - -  -  C2 -  -  -  ';

  const arp =
    'A4 C5 F5 C5 A4 C5 F5 C5 A4 C5 F5 C5 A4 C5 F5 C5 ' +
    'F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 ' +
    'D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 ' +
    'E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 ' +
    'A4 C5 F5 C5 A4 C5 F5 C5 A4 C5 F5 C5 A4 C5 F5 C5 ' +
    'F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 ' +
    'D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 ' +
    'E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 ' +
    'F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 ' +
    'A4 C5 F5 C5 A4 C5 F5 C5 A4 C5 F5 C5 A4 C5 F5 C5 ' +
    'D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 ' +
    'E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 ' +
    'D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 D4 F4 A#4 F4 ' +
    'E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 E4 G4 C5 G4 ' +
    'F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 F4 A4 D5 A4 ' +
    'E4 G4 A#4 G4 E4 G4 A#4 G4 E4 G4 A#4 G4 E4 G4 A#4 G4 ';

  canal(buf, sr, bpm, mel,  { onda: 'pulso', ciclo: 0.25,  vol: 0.27, a: 0.003, d: 0.12, s: 0.60, r: 0.30, picado: 0.7 });
  canal(buf, sr, bpm, arp,  { onda: 'pulso', ciclo: 0.125, vol: 0.07, a: 0.002, d: 0.30, s: 0.25, r: 0.45, picado: 0.85 });
  canal(buf, sr, bpm, bajo, { onda: 'triangulo',           vol: 0.30, a: 0.003, d: 0.18, s: 0.70, r: 0.20, picado: 0.8 });

  const patron = 'Bh -  h  -  ch -  h  -  Bh -  h  B  ch -  h  h  ';
  for (let c = 0; c < 16; c++) {
    const trozo = lienzo(sr, compas);
    ritmo(trozo, sr, bpm, patron, 0.45);
    for (let i = 0; i < trozo.length; i++) sumar(buf, Math.round(c * compas * sr) + i, trozo[i]);
  }

  return { sr, buf, rms: NIVEL_MUSICA };
}

// ===========================================================================
// 8. AMBIENTES  (bucles largos que suenan siempre)
// ===========================================================================

/**
 * Todas las modulaciones de los ambientes pasan por aquí. `ciclos` es un
 * ENTERO: así el oscilador termina el bucle en la misma fase en la que
 * empezó y el empalme no se oye. Ése es todo el truco.
 */
function onda(i, n, ciclos, fase) {
  return Math.sin(2 * Math.PI * (ciclos * i / n + (fase || 0)));
}

/**
 * Recorre el bucle DOS VECES y solo guarda la segunda.
 *
 * EL FALLO QUE ARREGLA: los filtros de un polo arrancan con la memoria a
 * cero, así que el primer cuarto de segundo de cada ambiente entraba
 * subiendo desde el silencio. En un archivo que se repite toda la partida
 * eso no es un detalle: es un bajón audible CADA VEZ que el bucle da la
 * vuelta, y con el viento —que lleva dos polos muy cerrados— se oía como si
 * alguien tapara y destapara el altavoz cada diez segundos.
 *
 * Dando una vuelta en falso, el filtro llega al principio de la vuelta buena
 * con la misma memoria que tendrá al final. El bucle empalma consigo mismo.
 */
function dosVueltas(n, fn, guardarEn) {
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < n; i++) {
      const v = fn(i);
      if (p === 1) guardarEn[i] += v;
    }
  }
}

/** LLUVIA: siseo de ruido con gotas sueltas por encima. */
function ambienteLluvia() {
  const sr = SR_AMBIENTE, seg = 8;
  const buf = lienzo(sr, seg), n = buf.length;
  const r1 = crearRuido(1), r2 = crearRuido(3);
  const f1 = pasoBajo(0.42), f2 = pasoAlto(0.25);

  dosVueltas(n, function (i) {
    /* Dos capas: la fina es el agua sobre las hojas y la gruesa el agua
       contra el suelo. Respiran a ritmos distintos (3 y 2 vueltas por bucle)
       para que la lluvia parezca que va y viene en vez de ser un ventilador. */
    const respira = 0.78 + 0.22 * onda(i, n, 3) * 0.5 + 0.11 * onda(i, n, 2, 0.3);
    return (f2(r1()) * 0.55 + f1(r2()) * 0.45) * 0.5 * respira;
  }, buf);
  // Gotas gordas sueltas: pequeños chasquidos agudos que caen a destiempo.
  for (let g = 0; g < 46; g++) {
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, corto: true, f: 1,
                         ini: Math.random() * seg, dur: 0.035,
                         vol: 0.10 + Math.random() * 0.14,
                         a: 0.001, d: 0.6, s: 0.05, r: 0.4 });
  }
  return { sr, buf, temblor: true };
}

/** VIENTO: ruido muy filtrado cuyo filtro se abre y se cierra en rachas. */
function ambienteViento() {
  const sr = SR_AMBIENTE, seg = 10;
  const buf = lienzo(sr, seg), n = buf.length;
  const r = crearRuido(2);
  let y = 0, y2 = 0;

  dosVueltas(n, function (i) {
    /* Tres rachas por bucle, cada una con su propio temblor encima: el viento
       no sube y baja como un seno, sube a tirones. */
    const racha = 0.30 + 0.34 * (0.5 + 0.5 * onda(i, n, 3, 0.15))
                       + 0.16 * (0.5 + 0.5 * onda(i, n, 7, 0.6));
    const k = 0.02 + 0.13 * racha;            // el filtro se abre con la racha
    const x = r();
    y += k * (x - y);
    y2 += k * (y - y2);                       // dos polos: más sordo, más aire
    return y2 * 3.4 * racha;
  }, buf);
  return { sr, buf, temblor: true };
}

/** ÁRBOLES: hojas. Muchos granos cortos y agudos, ninguno igual al anterior. */
function ambienteArboles() {
  const sr = SR_AMBIENTE, seg = 8;
  const buf = lienzo(sr, seg), n = buf.length;

  /* 900 granos de entre 8 y 30 ms. Menos de eso suena a arena cayendo; más,
     a fritura. El grano es ruido corto pasado por un paso alto, que es lo que
     hace una hoja seca rozando con otra. */
  for (let g = 0; g < 900; g++) {
    const t = Math.random() * seg;
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1 + Math.floor(Math.random() * 2), f: 1,
                         ini: t, dur: 0.008 + Math.random() * 0.022,
                         vol: 0.04 + Math.random() * 0.09,
                         a: 0.25, d: 0.35, s: 0.4, r: 0.4, filtroAlto: 0.45 });
  }
  // Y un soplo de fondo muy bajo, para que los granos no floten en el vacío.
  const r = crearRuido(3); let y = 0;
  dosVueltas(n, function (i) {
    y += 0.05 * (r() - y);
    return y * 0.9 * (0.6 + 0.4 * onda(i, n, 2));
  }, buf);
  return { sr, buf, temblor: true };
}

/** DÍA SOLEADO: zumbido cálido de campo con pájaros lejanos de vez en cuando. */
function ambienteSoleado() {
  const sr = SR_AMBIENTE, seg = 12;
  const buf = lienzo(sr, seg), n = buf.length;

  // El zumbido de mediodía: insectos. Ruido muy cerrado y muy bajo.
  const r = crearRuido(6); let y = 0;
  dosVueltas(n, function (i) {
    y += 0.03 * (r() - y);
    return y * 1.1 * (0.7 + 0.3 * onda(i, n, 5));
  }, buf);
  // Pájaros lejanos: trinos de dos o tres notas que suben.
  for (let p = 0; p < 14; p++) {
    const t = Math.random() * seg;
    const base = 1500 + Math.random() * 900;
    const cuantas = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < cuantas; k++) {
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: base * (1 + k * 0.16),
                           ini: t + k * 0.055, dur: 0.05,
                           vol: 0.045 + Math.random() * 0.03,
                           a: 0.1, d: 0.4, s: 0.5, r: 0.4, caida: -7 });
    }
  }
  return { sr, buf, temblor: true };
}

/** NOCHE: grillos. Tres tandas a ritmos distintos para que no cuadren nunca. */
function ambienteNoche() {
  const sr = SR_AMBIENTE, seg = 10;
  const buf = lienzo(sr, seg), n = buf.length;

  /* Un grillo es un pulso agudo repetido cuatro veces muy seguidas. Lo que lo
     hace grillo no es la nota, es la CADENCIA: cri-cri-cri-cri, pausa. */
  function grillo(t0, hz, cada, veces, vol) {
    for (let v = 0; v < veces; v++) {
      const t = t0 + v * cada;
      if (t > seg) break;
      for (let k = 0; k < 4; k++) {
        tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.25, f: hz,
                             ini: t + k * 0.022, dur: 0.014, vol: vol,
                             a: 0.2, d: 0.4, s: 0.4, r: 0.4 });
      }
    }
  }
  grillo(0.10, 3950, 0.50, 20, 0.075);
  grillo(0.33, 4400, 0.625, 16, 0.055);
  grillo(0.71, 3600, 0.833, 12, 0.045);
  grillo(1.40, 4750, 1.25,  8,  0.035);

  // Fondo: la noche no está en silencio, tiene un colchón de aire muy bajo.
  const r = crearRuido(8); let y = 0;
  dosVueltas(n, function () {
    y += 0.02 * (r() - y);
    return y * 0.7;
  }, buf);
  return { sr, buf, temblor: true };
}

/** NIEVE: como el viento pero sordo y sin agudos. Nevar casi no suena. */
function ambienteNieve() {
  const sr = SR_AMBIENTE, seg = 8;
  const buf = lienzo(sr, seg), n = buf.length;
  const r = crearRuido(4);
  let y = 0, y2 = 0, y3 = 0;
  dosVueltas(n, function (i) {
    const respira = 0.55 + 0.45 * (0.5 + 0.5 * onda(i, n, 2, 0.2));
    const k = 0.012 + 0.03 * respira;
    y += k * (r() - y); y2 += k * (y - y2); y3 += k * (y2 - y3);
    return y3 * 6 * respira;
  }, buf);
  return { sr, buf, temblor: true };
}

// ===========================================================================
// 9. RAYOS Y TRUENOS
// ===========================================================================

/**
 * TRUENO. Tres piezas, y las tres hacen falta:
 *
 *   1. El CHASQUIDO: ruido finísimo de 40 ms. Es el latigazo del aire.
 *   2. El GOLPE: ruido medio que se abre de golpe y se cierra en medio segundo.
 *   3. El RETUMBO: ruido muy grave y muy largo, con la amplitud temblando,
 *      que es el eco rebotando entre las nubes y el suelo.
 *
 * Un trueno sin retumbo suena a globo. Un retumbo sin chasquido suena a
 * camión pasando. Juntos, suena a tormenta.
 */
function trueno(semilla, cerca) {
  const sr = SR_EFECTO;
  /* MÁS LARGOS QUE ANTES. Los primeros duraban 2,6 s y el jugador pidió
     truenos nuevos: el que había se acababa antes de que te diera tiempo a
     mirar al cielo. Un trueno de verdad rueda cinco o seis segundos y ESO es
     lo que impone; el golpe seco solo asusta. */
  const seg = cerca ? 5.2 : 4.6;
  const buf = lienzo(sr, seg), n = buf.length;
  const rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(semilla);
  const az = (a, b) => a + rnd() * (b - a);

  if (cerca) {
    /* 1. EL DESGARRO. Antes eran 50 ms de ruido y ya. Ahora son tres
       chasquidos seguidos y desiguales, porque el rayo no es una descarga:
       son varias por el mismo canal, en unas centésimas. Eso es lo que hace
       ese sonido de tela rasgada que tiene un rayo cercano. */
    for (let k = 0; k < 3; k++) {
      tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, corto: true, f: 1,
                           ini: k * az(0.012, 0.030), dur: az(0.030, 0.075),
                           vol: 0.9 - k * 0.22, a: 0.0005, d: 0.9, s: 0.03, r: 0.1,
                           filtroAlto: 0.55 - k * 0.08 });
    }
    // y el destello eléctrico que lo acompaña: barrido rapidísimo hacia abajo
    tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: az(2200, 3000), ini: 0.004, dur: 0.11,
                         vol: 0.24, a: 0.001, d: 0.8, s: 0.05, r: 0.2, caida: 44 });
  }

  // 2. el golpe
  const golpe = crearRuido(cerca ? 6 : 12);
  const fg = pasoBajo(cerca ? 0.10 : 0.045);
  const dur2 = Math.round(sr * (cerca ? 0.95 : 1.2));
  const ini2 = Math.round(sr * (cerca ? 0.02 : 0.10));
  for (let i = 0; i < dur2; i++) {
    const p = i / dur2;
    const env = Math.pow(1 - p, cerca ? 1.6 : 2.2) * (cerca ? 1 : 0.7);
    sumar(buf, ini2 + i, fg(golpe()) * 1.9 * env);
  }

  // 3. el retumbo
  const rum = crearRuido(cerca ? 26 : 40);
  const fr1 = pasoBajo(0.020), fr2 = pasoBajo(0.020);
  const ini3 = Math.round(sr * (cerca ? 0.12 : 0.25));
  const dur3 = n - ini3 - 1;
  /* Tres temblores lentos a frecuencias que no son múltiplos entre sí. Si lo
     fueran, el retumbo latiría con un compás y se oiría el truco. */
  const w = [0.7 + rnd() * 0.7, 1.9 + rnd() * 1.1, 3.7 + rnd() * 1.9];
  for (let i = 0; i < dur3; i++) {
    const p = i / dur3;
    const t = i / sr;
    const tiembla = 0.55 + 0.45 * (0.34 * Math.sin(2 * Math.PI * w[0] * t + semilla)
                                 + 0.33 * Math.sin(2 * Math.PI * w[1] * t)
                                 + 0.33 * Math.sin(2 * Math.PI * w[2] * t + 1.7));
    /* La cola cae MÁS DESPACIO que antes (exponente 1.15 en vez de 1.5): es lo
       que convierte un golpe en un trueno que se aleja rodando. */
    const env = Math.pow(1 - p, 1.15) * (p < 0.05 ? p / 0.05 : 1);
    sumar(buf, ini3 + i, fr2(fr1(rum())) * 9 * env * tiembla * (cerca ? 1 : 0.8));
  }

  /* 4. LOS REBOTES. Dos o tres golpes graves y flojos, muy separados, dentro
     de la cola. Son el eco en las montañas, y es lo que faltaba: sin ellos el
     retumbo se apaga liso y suena a ruido bajando de volumen, no a tormenta.
     Con ellos el trueno "rueda". */
  const nEcos = cerca ? 3 : 2;
  for (let k = 0; k < nEcos; k++) {
    const eco = crearRuido(cerca ? 34 + k * 8 : 46 + k * 10);
    const fe = pasoBajo(0.014);
    const t0 = Math.round(sr * az(0.7 + k * 0.9, 1.2 + k * 1.1));
    const dur = Math.round(sr * az(0.5, 0.9));
    if (t0 + dur >= n) continue;
    const pico = (cerca ? 0.55 : 0.38) * Math.pow(0.62, k);
    for (let i = 0; i < dur; i++) {
      const p = i / dur;
      // sube y baja: un eco entra y sale, no aparece de golpe
      const env = Math.sin(Math.PI * p);
      sumar(buf, t0 + i, fe(eco()) * 9 * env * pico);
    }
  }
  return { sr, buf, temblor: true };
}

/** CHISPA: el zumbido eléctrico del instante del fogonazo. Corto y agudo. */
function chispa(semilla) {
  const sr = SR_EFECTO;
  const buf = lienzo(sr, 0.30);
  const base = 1800 + semilla * 500;
  // Barrido descendente + ruido metálico encima: el "zap" de toda la vida.
  tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.125, f: base, ini: 0, dur: 0.16,
                       vol: 0.5, a: 0.001, d: 0.5, s: 0.30, r: 0.5, caida: 30 });
  tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, corto: true, f: 1, ini: 0, dur: 0.10,
                       vol: 0.40, a: 0.001, d: 0.7, s: 0.10, r: 0.3, filtroAlto: 0.55 });
  tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: base * 1.6, ini: 0.02, dur: 0.07,
                       vol: 0.18, a: 0.001, d: 0.6, s: 0.10, r: 0.4, caida: 40 });
  return { sr, buf };
}

// ===========================================================================
// 10. PISADAS
// ===========================================================================

/**
 * Cada suelo es un timbre distinto, y la diferencia se nota SIN mirar:
 *
 *   hierba    siseo agudo y corto, nada de cuerpo
 *   tierra    golpe sordo con un poco de arena encima
 *   ladrillo  chasquido duro con resonancia media; el ruido va en modo corto,
 *             que es el que suena metálico
 *   cemento   como el ladrillo pero plano y más seco: no resuena
 *   madera    golpe hueco — un tono grave que decae rápido, que es lo que hace
 *             una tabla con aire debajo
 *   agua      chapoteo: ruido que se abre y se cierra deprisa
 *   nieve     crujido: muchos granos diminutos apretados
 */
function pisada(tipo, v) {
  const sr = SR_EFECTO;
  /* Lo que dura de verdad cada una. Estaban todas a 0,30 s y el analizador
     cantó el problema: el 67 % del archivo de cemento era silencio. No es
     grave en disco (son kilobytes) pero sí en memoria, porque el navegador
     descodifica a coma flotante y ahí un silencio ocupa lo mismo que un
     trueno. */
  const largo = (tipo === 'agua') ? 0.26 : (tipo === 'nieve') ? 0.22 : 0.17;
  const buf = lienzo(sr, largo);
  const r = 0.85 + v * 0.12;          // cada variante, un pelín distinta

  if (tipo === 'hierba') {
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, f: 1, ini: 0, dur: 0.075 * r,
                         vol: 0.5, a: 0.05, d: 0.5, s: 0.15, r: 0.45, filtroAlto: 0.40 });
    tocarNota(buf, sr, { onda: 'triangulo', f: 120 * r, ini: 0, dur: 0.045,
                         vol: 0.14, a: 0.002, d: 0.8, s: 0.05, r: 0.2, caida: 10 });

  } else if (tipo === 'tierra') {
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 4, f: 1, ini: 0, dur: 0.085 * r,
                         vol: 0.55, a: 0.01, d: 0.6, s: 0.12, r: 0.4, filtro: 0.30 });
    tocarNota(buf, sr, { onda: 'triangulo', f: 95 * r, ini: 0, dur: 0.07,
                         vol: 0.42, a: 0.002, d: 0.75, s: 0.08, r: 0.25, caida: 14 });

  } else if (tipo === 'ladrillo') {
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, corto: true, f: 1, ini: 0, dur: 0.055 * r,
                         vol: 0.62, a: 0.001, d: 0.7, s: 0.08, r: 0.3, filtroAlto: 0.30 });
    tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.25, f: 1500 * r, ini: 0, dur: 0.035,
                         vol: 0.22, a: 0.001, d: 0.8, s: 0.05, r: 0.2, caida: 22 });
    tocarNota(buf, sr, { onda: 'triangulo', f: 210 * r, ini: 0, dur: 0.09,
                         vol: 0.30, a: 0.001, d: 0.6, s: 0.10, r: 0.4, caida: 8 });

  } else if (tipo === 'cemento') {
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 2, f: 1, ini: 0, dur: 0.05 * r,
                         vol: 0.58, a: 0.001, d: 0.75, s: 0.06, r: 0.25, filtroAlto: 0.20 });
    tocarNota(buf, sr, { onda: 'triangulo', f: 150 * r, ini: 0, dur: 0.05,
                         vol: 0.28, a: 0.001, d: 0.8, s: 0.05, r: 0.2, caida: 12 });

  } else if (tipo === 'madera') {
    /* El hueco es el tono, no el ruido: 300 Hz que caen media octava en 80 ms.
       Sin ese tono, la madera suena igual que el cemento. */
    tocarNota(buf, sr, { onda: 'triangulo', f: 300 * r, ini: 0, dur: 0.11,
                         vol: 0.55, a: 0.001, d: 0.45, s: 0.20, r: 0.55, caida: 7 });
    tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 600 * r, ini: 0, dur: 0.045,
                         vol: 0.14, a: 0.001, d: 0.7, s: 0.06, r: 0.3, caida: 9 });
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 2, f: 1, ini: 0, dur: 0.035,
                         vol: 0.20, a: 0.001, d: 0.7, s: 0.05, r: 0.3, filtroAlto: 0.35 });

  } else if (tipo === 'agua') {
    tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, f: 1, ini: 0, dur: 0.17 * r,
                         vol: 0.55, a: 0.02, d: 0.35, s: 0.25, r: 0.6, filtroAlto: 0.30 });
    tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 420 * r, ini: 0.005, dur: 0.10,
                         vol: 0.16, a: 0.01, d: 0.6, s: 0.10, r: 0.4, caida: -14 });

  } else {  // nieve
    for (let k = 0; k < 9; k++) {
      tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, corto: true, f: 1,
                           ini: k * 0.011 + Math.random() * 0.006, dur: 0.016,
                           vol: 0.24 + Math.random() * 0.14,
                           a: 0.05, d: 0.5, s: 0.15, r: 0.45, filtroAlto: 0.45 });
    }
    tocarNota(buf, sr, { onda: 'triangulo', f: 110 * r, ini: 0, dur: 0.06,
                         vol: 0.18, a: 0.004, d: 0.8, s: 0.05, r: 0.2, caida: 10 });
  }
  return { sr, buf, pico: 0.78 };
}

// ===========================================================================
// 11. BICHOS
// ===========================================================================

/**
 * Cada especie del mapa tiene su voz. La regla que se ha seguido: la voz sale
 * del TAMAÑO del bicho (grave = grande) y de su CARÁCTER (barrido rápido =
 * nervioso, tono sostenido = tranquilo). Con eso, aunque no se vea, se sabe
 * lo que hay al lado.
 */
function bicho(especie, v) {
  const sr = SR_EFECTO;
  const r = 0.9 + v * 0.1;
  let buf;

  switch (especie) {
    case 'pajaro':            // trino corto que sube
      buf = lienzo(sr, 0.45);
      for (let k = 0; k < 3; k++) {
        tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: (2100 + k * 320) * r,
                             ini: k * 0.07, dur: 0.055, vol: 0.42,
                             a: 0.06, d: 0.35, s: 0.5, r: 0.45, caida: -9 });
      }
      break;

    case 'paloma':            // arrullo: grave, con vibrato y una caída al final
      buf = lienzo(sr, 0.85);
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 470 * r, ini: 0, dur: 0.16,
                           vol: 0.34, a: 0.06, d: 0.3, s: 0.6, r: 0.4, vibrato: 0.03, vibratoHz: 22 });
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 400 * r, ini: 0.20, dur: 0.34,
                           vol: 0.38, a: 0.10, d: 0.3, s: 0.55, r: 0.5, vibrato: 0.03, vibratoHz: 18, caida: 3 });
      break;

    case 'cuervo':            // graznido: pulso sucio con ruido encima, dos veces
      buf = lienzo(sr, 0.75);
      for (let k = 0; k < 2; k++) {
        const t = k * 0.30;
        tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.125, f: 720 * r, ini: t, dur: 0.19,
                             vol: 0.40, a: 0.008, d: 0.25, s: 0.55, r: 0.45, caida: 9,
                             vibrato: 0.05, vibratoHz: 42 });
        tocarNota(buf, sr, { onda: 'ruido', ruidoP: 3, f: 1, ini: t, dur: 0.16,
                             vol: 0.22, a: 0.01, d: 0.3, s: 0.4, r: 0.5, filtroAlto: 0.25 });
      }
      break;

    case 'buho':              // uh-uhúuu: dos notas huecas, la segunda larga
      buf = lienzo(sr, 1.35);
      tocarNota(buf, sr, { onda: 'triangulo', f: 400 * r, ini: 0, dur: 0.18,
                           vol: 0.42, a: 0.12, d: 0.25, s: 0.6, r: 0.45, vibrato: 0.012, vibratoHz: 6 });
      tocarNota(buf, sr, { onda: 'triangulo', f: 372 * r, ini: 0.32, dur: 0.60,
                           vol: 0.50, a: 0.10, d: 0.20, s: 0.70, r: 0.45, vibrato: 0.014, vibratoHz: 5.2, caida: 2 });
      // una pizca de pulso muy bajo por debajo, que le da el cuerpo de ave grande
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 199 * r, ini: 0.32, dur: 0.58,
                           vol: 0.10, a: 0.12, d: 0.2, s: 0.7, r: 0.5 });
      break;

    case 'vaca':              // mugido: sube y luego cae, largo
      buf = lienzo(sr, 1.30);
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 155 * r, ini: 0, dur: 0.35,
                           vol: 0.40, a: 0.15, d: 0.2, s: 0.75, r: 0.3, caida: -3, vibrato: 0.01, vibratoHz: 7 });
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.25, f: 178 * r, ini: 0.34, dur: 0.72,
                           vol: 0.44, a: 0.05, d: 0.25, s: 0.65, r: 0.55, caida: 8, vibrato: 0.014, vibratoHz: 6 });
      break;

    case 'cerdo':             // gruñido: tres bufidos con caída brusca
      buf = lienzo(sr, 0.70);
      for (let k = 0; k < 3; k++) {
        tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.125, f: (330 - k * 25) * r,
                             ini: k * 0.16, dur: 0.11, vol: 0.40,
                             a: 0.02, d: 0.3, s: 0.45, r: 0.5, caida: 14, vibrato: 0.06, vibratoHz: 55 });
      }
      break;

    case 'zorro':             // ladrido agudo y seco, dos veces
      buf = lienzo(sr, 0.60);
      for (let k = 0; k < 2; k++) {
        tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.25, f: 900 * r, ini: k * 0.22, dur: 0.13,
                             vol: 0.42, a: 0.005, d: 0.3, s: 0.4, r: 0.5, caida: 16 });
        tocarNota(buf, sr, { onda: 'ruido', ruidoP: 2, f: 1, ini: k * 0.22, dur: 0.05,
                             vol: 0.14, a: 0.002, d: 0.6, s: 0.1, r: 0.4, filtroAlto: 0.4 });
      }
      break;

    case 'cocodrilo':         // ronquido grave con temblor: suena a algo grande
      buf = lienzo(sr, 1.00);
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.125, f: 82 * r, ini: 0, dur: 0.80,
                           vol: 0.45, a: 0.10, d: 0.2, s: 0.75, r: 0.35, vibrato: 0.09, vibratoHz: 27 });
      tocarNota(buf, sr, { onda: 'ruido', ruidoP: 14, f: 1, ini: 0.02, dur: 0.70,
                           vol: 0.20, a: 0.15, d: 0.3, s: 0.6, r: 0.4, filtro: 0.10 });
      break;

    case 'serpiente':         // siseo: ruido fino que entra y sale despacio
      buf = lienzo(sr, 0.85);
      tocarNota(buf, sr, { onda: 'ruido', ruidoP: 1, f: 1, ini: 0, dur: 0.75,
                           vol: 0.40, a: 0.22, d: 0.2, s: 0.7, r: 0.45, filtroAlto: 0.50 });
      break;

    case 'conejo':            // chillido cortísimo
      buf = lienzo(sr, 0.25);
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.125, f: 1700 * r, ini: 0, dur: 0.07,
                           vol: 0.35, a: 0.01, d: 0.3, s: 0.4, r: 0.55, caida: 10 });
      break;

    case 'topo':              // escarbar: tres raspaduras
      buf = lienzo(sr, 0.55);
      for (let k = 0; k < 3; k++) {
        tocarNota(buf, sr, { onda: 'ruido', ruidoP: 5, f: 1, ini: k * 0.14, dur: 0.10,
                             vol: 0.34, a: 0.15, d: 0.3, s: 0.4, r: 0.5, filtro: 0.35 });
      }
      break;

    default:                  // por si algún día hay una especie nueva
      buf = lienzo(sr, 0.30);
      tocarNota(buf, sr, { onda: 'pulso', ciclo: 0.5, f: 800 * r, ini: 0, dur: 0.08,
                           vol: 0.3, a: 0.01, d: 0.4, s: 0.4, r: 0.5, caida: 6 });
  }
  return { sr, buf, pico: 0.82 };
}

// ===========================================================================
// 12. QUÉ SE GENERA
// ===========================================================================

const CATALOGO = [
  // --- música ---
  ['gf_pradera.wav',  temaPradera],
  ['gf_noche.wav',    temaNoche],
  ['gf_tienda.wav',   temaTienda],

  // --- ambientes ---
  ['amb_lluvia.wav',  ambienteLluvia],
  ['amb_viento.wav',  ambienteViento],
  ['amb_arboles.wav', ambienteArboles],
  ['amb_soleado.wav', ambienteSoleado],
  ['amb_noche.wav',   ambienteNoche],
  ['amb_nieve.wav',   ambienteNieve],

  // --- rayos ---
  ['rayo_1.wav',      () => trueno(11, true)],
  ['rayo_2.wav',      () => trueno(29, true)],
  ['rayo_3.wav',      () => trueno(47, true)],
  ['centella_1.wav',  () => trueno(63, false)],
  ['centella_2.wav',  () => trueno(97, false)],
  ['chispa_1.wav',    () => chispa(0)],
  ['chispa_2.wav',    () => chispa(1)],
];

/* LAS PISADAS ESTÁN APAGADAS.
 *
 * El jugador las quitó: no quería oír los pasos ni en el campo ni en la
 * tienda. El sintetizador se queda entero (`pisada()` sigue ahí arriba, con
 * sus siete suelos) porque escribirlo fue el trabajo y borrarlo no ahorra
 * nada; lo que se apaga es que salgan al catálogo.
 *
 * Para volver a tenerlas: descomentar estas seis líneas, ejecutar el script y
 * reponer en gf-audio.js la tabla SUELOS y la función `pisar()`. */
// ['hierba', 'tierra', 'ladrillo', 'cemento', 'madera'].forEach(t => {
//   for (let v = 1; v <= 3; v++) CATALOGO.push(['paso_' + t + '_' + v + '.wav', () => pisada(t, v)]);
// });
// ['agua', 'nieve'].forEach(t => {
//   for (let v = 1; v <= 2; v++) CATALOGO.push(['paso_' + t + '_' + v + '.wav', () => pisada(t, v)]);
// });
void pisada;

// Los que hablan más de una vez llevan variantes; los demás, una sola.
[['pajaro', 3], ['paloma', 2], ['cuervo', 2], ['buho', 2], ['vaca', 2], ['cerdo', 2],
 ['zorro', 2], ['cocodrilo', 1], ['serpiente', 2], ['conejo', 2], ['topo', 1]
].forEach(([e, n]) => {
  for (let v = 1; v <= n; v++) CATALOGO.push(['an_' + e + '_' + v + '.wav', () => bicho(e, v)]);
});

// ===========================================================================
// 13. ARRANQUE
// ===========================================================================

function principal() {
  const args = process.argv.slice(2);
  const soloListar = args.indexOf('--listar') >= 0;
  const filtros = args.filter(a => a[0] !== '-');

  const cola = CATALOGO.filter(([n]) => !filtros.length || filtros.some(f => n.indexOf(f) >= 0));
  if (!cola.length) {
    console.error('Nada que case con: ' + filtros.join(' '));
    process.exit(1);
  }

  if (soloListar) {
    console.log('Generaría ' + cola.length + ' archivos en ' + DESTINO + ':');
    cola.forEach(([n]) => console.log('  ' + n));
    return;
  }

  if (!fs.existsSync(DESTINO)) fs.mkdirSync(DESTINO, { recursive: true });
  console.log('Sonidos de 8 bits → ' + DESTINO + '\n');

  const t0 = Date.now();
  let total = 0;
  for (const [nombre, hacer] of cola) {
    const r = hacer();
    total += guardar(nombre, r.sr, r.buf, { temblor: r.temblor, pico: r.pico, rms: r.rms });
  }
  console.log('\n' + cola.length + ' archivos, ' + (total / 1024).toFixed(2) + ' MB, ' +
              ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

if (require.main === module) principal();

module.exports = { nota, pulso, triangulo, crearRuido, envolvente, canal, CATALOGO };
