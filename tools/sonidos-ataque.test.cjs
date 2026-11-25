'use strict';
/* LOS SONIDOS DE LOS ATAQUES (2026-11-24).
 * "Los sonidos de algunos enemigos o monstruos al atacar suenan muy básicos
 * o falsos: haz nuevos para cada ataque, profesionales."
 *
 * tools/generar-sonidos-ataque.js escribe los WAV (Game/MUSIC/ataques) y
 * gf-sonidos-ataque.js elige cuál suena en cada momento de cada ataque. Lo
 * que falla aquí NO da error en el juego: un nombre mal escrito deja el
 * ataque con el pitido sintetizado de antes, en silencio. Así que se mira:
 *   · que todo lo que nombran las tablas tiene su WAV, bien hecho, que lo que
 *     hay en disco es lo que sale del generador y que no sobra nada;
 *   · que cada especie de cada mapa (y su jefe) tiene sonido para todo lo que
 *     hace, que lo que carga un mapa cabe en memoria y que el sonido va al
 *     compás del dibujo;
 *   · que gf-salvaje pide el grabado y, si aún no ha llegado, toca el de antes;
 *   · cómo se toca: el volumen de efectos, la distancia y el lado, el grito que
 *     no se dobla, las voces a la vez, los reintentos, el cierre de la escena y
 *     el presupuesto de memoria.
 *
 *   node --test tools/sonidos-ataque.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const BIN = path.resolve(__dirname, '..');
const DIR = path.join(BIN, 'Game', 'MUSIC', 'ataques');
const MANIFIESTO = JSON.parse(fs.readFileSync(path.join(DIR, 'ataques.json'), 'utf8'));
const GEN = require('./generar-sonidos-ataque.js');
const SR = 32000;
const db = (v) => Math.pow(10, v / 20);
const fuente = (archivo) => fs.readFileSync(path.join(BIN, archivo), 'utf8');

function cargar(archivos, extra) {
  const ctx = Object.assign({ console: { log() {}, warn() {}, error: console.error }, Math, Date, JSON, Promise, setTimeout, clearTimeout }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  [].concat(archivos).forEach((a) => vm.runInContext(fuente(a), ctx, { filename: a }));
  return ctx;
}
const ARTE_FALSO = { GFMonstruosArte: { anim: (a, b) => a + '_' + b }, Phaser: { BlendModes: { ADD: 1, NORMAL: 0 } } };
const S = cargar('gf-sonidos-ataque.js').GFSonAtaque;
const I = S._interno;
const ESPECIES = cargar('gf-salvaje.js', ARTE_FALSO).GFSalvaje._interno.ESPECIES;

/** Todos los sonidos que nombran las tablas de gf-sonidos-ataque.js. */
function nombrados() {
  const ids = new Set();
  const echar = (v) => { if (typeof v === 'string') ids.add(v); else if (v && typeof v === 'object') Object.values(v).forEach(echar); };
  [I.MOLDE, I.COMUN, I.GRITO, I.ESPECIE, I.RAYO, I.PODER, I.DE_JEFE, S.SERPIENTE].forEach(echar);
  ids.add('orbes');                         // `de`: el chamán y su báculo (def.orbe)
  return ids;
}
function muestras(id) {
  const b = fs.readFileSync(path.join(DIR, id + '.wav'));
  const x = new Float32Array((b.length - 44) / 2);
  for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  return x;
}
/** El tramo de `ms` más fuerte: su nivel (dB) y dónde está su centro (ms). */
function tramoMasFuerte(x, ms) {
  const n = Math.round(SR * ms / 1000);
  let s = 0, mejor = 0, en = 0;
  for (let i = 0; i < x.length; i++) {
    s += x[i] * x[i];
    if (i >= n) s -= x[i - n] * x[i - n];
    if (i >= n - 1 && s > mejor) { mejor = s; en = i - n + 1; }
  }
  if (x.length < n) mejor = s * n / Math.max(1, x.length);
  return { db: 10 * Math.log10(mejor / n + 1e-12), ms: (en + n / 2) * 1000 / SR };
}
/** La sonoridad como la mide el generador: el peor tramo de 100 ms tras un paso alto a 80 Hz. */
function sonoridad(x) {
  const w = 2 * Math.PI * 80 / SR, al = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w);
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = (1 + c) / 2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return tramoMasFuerte(y, 100).db;
}

// ─── Los archivos ────────────────────────────────────────────────────────────

test('todo lo que nombran las tablas tiene su WAV, en el manifiesto y con receta; y no sobra nada', () => {
  const ids = nombrados();
  const enDisco = fs.readdirSync(DIR).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4));
  for (const id of ids) {
    assert.ok(enDisco.includes(id), 'falta Game/MUSIC/ataques/' + id + '.wav');
    assert.ok(MANIFIESTO.sonidos[id], id + ' no está en ataques.json');
    assert.ok(GEN.SONIDOS[id], id + ' no tiene receta en el generador');
  }
  assert.deepEqual(enDisco.filter((id) => !ids.has(id)), [], 'WAV que no toca nadie (pesan en el paquete)');
  assert.deepEqual(Object.keys(MANIFIESTO.sonidos).filter((id) => !enDisco.includes(id)), [], 'en el manifiesto, sin WAV');
  assert.deepEqual(Object.keys(GEN.SONIDOS).filter((id) => !ids.has(id)), [], 'recetas que no usa nadie');
});

test('generador, manifiesto y juego dicen la misma versión (es el ?v= de cada WAV: si no, la caché sirve los viejos)', () => {
  assert.equal(S.V, GEN.VERSION, 'gf-sonidos-ataque.js V ≠ VERSION del generador');
  assert.equal(MANIFIESTO.version, GEN.VERSION, 'ataques.json es de otra versión: hay que volver a generar');
  assert.equal(GEN.SR, SR);
  assert.deepEqual([MANIFIESTO.sr, MANIFIESTO.bits, MANIFIESTO.canales], [SR, 16, 1]);
  assert.equal(I.RUTA, './Game/MUSIC/ataques/');
});

test('cada WAV: PCM de 16 bits, mono, 32 kHz, su duración, sin recortar y a la sonoridad de su receta', () => {
  for (const [id, info] of Object.entries(MANIFIESTO.sonidos)) {
    const b = fs.readFileSync(path.join(DIR, id + '.wav'));
    assert.equal(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 16), 'RIFFWAVEfmt ', id);
    assert.equal(b.readUInt32LE(4), b.length - 8, id + ': tamaño RIFF');
    assert.deepEqual([b.readUInt32LE(16), b.readUInt16LE(20), b.readUInt16LE(22), b.readUInt32LE(24), b.readUInt32LE(28), b.readUInt16LE(32), b.readUInt16LE(34)],
      [16, 1, 1, SR, SR * 2, 2, 16], id + ': PCM, mono, 32 kHz, 16 bits');
    assert.equal(b.toString('ascii', 36, 40), 'data', id);
    assert.equal(b.readUInt32LE(40), b.length - 44, id + ': tamaño de los datos');
    const x = muestras(id), seg = x.length / SR;
    assert.ok(Math.abs(seg - info.seg) < 0.001, id + ': ' + seg + ' s, el manifiesto dice ' + info.seg);
    assert.ok(seg >= 0.15 && seg <= 4.5, id + ': ' + seg.toFixed(2) + ' s');
    let pico = 0;
    for (let i = 0; i < x.length; i++) pico = Math.max(pico, Math.abs(x[i]));
    assert.ok(pico <= db(-0.9), id + ': pico a ' + (20 * Math.log10(pico)).toFixed(2) + ' dBFS (el limitador lo deja en −1)');
    // Las metas van de −12 (los jefes, el meteoro) a −17 (lo que acompaña):
    // GANANCIA las pone a la altura de los demás efectos del juego.
    assert.ok(info.nivel >= -17 && info.nivel <= -12, id + ': meta ' + info.nivel + ' dB');
    // El limitador no siempre llega a la meta sin aplastar el golpe (rayos_golpe se queda a −1,3).
    const son = sonoridad(x);
    assert.ok(Math.abs(son - info.nivel) <= 2, id + ': sonoridad ' + son.toFixed(1) + ' dB, meta ' + info.nivel);
  }
});

test('lo que hay en disco es lo que sale del generador, byte a byte (no se retocan a mano: se pierde al regenerar)', () => {
  for (const id of Object.keys(GEN.SONIDOS)) {
    const r = GEN.generar(id);
    const b = GEN.wav16(r.x);
    assert.ok(b.equals(fs.readFileSync(path.join(DIR, id + '.wav'))), id + '.wav no es el de la receta: node tools/generar-sonidos-ataque.js ' + id);
  }
});

// ─── Al compás del dibujo ─────────────────────────────────────────────────────

test('los golpes, las caídas y el pisotón se tocan cuando dan: suenan desde el primer instante', () => {
  // Los demás llevan dentro el reloj de su dibujo (abajo): estos, no.
  const instante = new Set([I.COMUN.cae]);
  Object.values(I.MOLDE).concat(Object.values(I.ESPECIE)).forEach((o) => ['golpe', 'cae', 'pisoton'].forEach((k) => { if (o[k]) instante.add(o[k]); }));
  for (const id of instante) {
    const x = muestras(id);
    let pico = 0;
    for (let i = 0; i < x.length; i++) pico = Math.max(pico, Math.abs(x[i]));
    let i = 0;
    while (i < x.length && Math.abs(x[i]) < pico * 0.1) i++;
    assert.ok(i * 1000 / SR <= 15, id + ': empieza a sonar a los ' + Math.round(i * 1000 / SR) + ' ms del golpe');
  }
});

/** El cuerpo de `function nombre(` en gf-salvaje.js (hasta la siguiente función). */
function cuerpo(nombre) {
  const src = fuente('gf-salvaje.js'), i = src.indexOf('  function ' + nombre + '(');
  assert.ok(i >= 0, nombre + ' en gf-salvaje.js');
  const j = src.indexOf('\n  function ', i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
function numero(re, texto, que) {
  const m = re.exec(texto);
  assert.ok(m, 'no encuentro ' + que + ' en gf-salvaje.js');
  return Number(m[1]);
}

test('el golpe de cada poder cae cuando cae en el dibujo (los tiempos se leen de gf-salvaje.js)', () => {
  // El sonido se toca al ANUNCIAR el ataque y lleva el golpe donde lo lleva la
  // animación: si cambia el dibujo, hay que rehacer el sonido.
  const casos = [
    ['meteoro', numero(/targets: roca,[^}]*?duration: (\d+)/, cuerpo('pxMeteoro'), 'la caída del meteoro'), 'la roca llega al suelo'],
    ['ancla', numero(/addCounter\(\{ from: 0, to: 1, duration: (\d+)/, cuerpo('pxAncla'), 'el vuelo del ancla'), 'el ancla da'],
    ['prision', numero(/delayedCall\((\d+)/, cuerpo('pxPrision'), 'las púas de la prisión'), 'salen las púas'],
    ['maldicion', numero(/delayedCall\((\d+)/, cuerpo('pxMaldicion'), 'el sello de la maldición'), 'el sello se cierra'],
    ['roca_arranca', numero(/delayedCall\((\d+)/, cuerpo('golemRoca'), 'el lanzamiento de la roca'), 'el gólem lanza la roca']
  ];
  for (const [id, ms, que] of casos) {
    const t = tramoMasFuerte(muestras(id), 10).ms;
    assert.ok(t >= ms - 40 && t <= ms + 80, id + ': lo más fuerte a los ' + Math.round(t) + ' ms, y ' + que + ' a los ' + ms);
  }
});

// ─── Cada mapa ────────────────────────────────────────────────────────────────

/** Lo que hay en cada mapa: sus especies (capa `monstruos`) y su jefe (gf-jefes.js). */
function mapas() {
  const jefes = {};
  for (const m of fuente('gf-jefes.js').matchAll(/(\w+)Scene:\s*\{\s*tipo:\s*'(jefe_\w+)'/g)) jefes[m[1].toLowerCase()] = m[2];
  const res = {};
  for (const f of fs.readdirSync(path.join(BIN, 'Maps')).filter((f) => f.endsWith('.json'))) {
    let mapa;
    try { mapa = JSON.parse(fs.readFileSync(path.join(BIN, 'Maps', f), 'utf8')); } catch (e) { continue; }
    const capa = (mapa.layers || []).find((l) => l.name === 'monstruos');
    if (!capa) continue;
    const zona = f.slice(0, -5);
    res[zona] = [...new Set(capa.objects.map((o) => o.name).concat(jefes[zona] ? [jefes[zona]] : []))];
  }
  return { res, jefes };
}

test('cada especie de cada mapa, y su jefe, tiene un sonido grabado para todo lo que hace', () => {
  const { res, jefes } = mapas();
  assert.ok(Object.keys(res).length >= 14, 'los mapas con monstruos: ' + Object.keys(res).join(' '));
  for (const zona of Object.keys(jefes)) assert.ok(res[zona] && res[zona].includes(jefes[zona]), zona + ': su jefe ' + jefes[zona]);
  for (const [zona, tipos] of Object.entries(res)) {
    for (const tipo of tipos) {
      const def = ESPECIES[tipo];
      assert.ok(def, zona + ': ' + tipo + ' no es una especie de gf-salvaje.js');
      // Lo que se precarga al entrar en el mapa: lo que no esté ahí suena sintetizado la primera vez.
      const precarga = new Set(S.idsDe(tipo, def));
      const necesita = (ev, id) => {
        assert.ok(id && MANIFIESTO.sonidos[id], zona + ' · ' + tipo + ' · ' + ev + ' → ' + id);
        assert.ok(precarga.has(id), zona + ' · ' + tipo + ' · ' + ev + ': ' + id + ' no se precarga');
      };
      for (const ev of I.EVENTOS[def.molde]) {
        if (ev === 'golpe' && !def.golpe) continue;             // los que no pegan de cerca
        necesita(ev, S.de(tipo, def, ev));
      }
      for (const p of def.poderes || []) {
        const ev = p === 'espinos' ? 'espinas' : 'px:' + p;      // el jabalí dispara con el ataque de la araña
        necesita(ev, S.de(tipo, def, ev));
        for (const s of ['bola_nieve:fin', 'emerger:sale', 'emboscada:sale'].filter((s) => s.startsWith(p + ':'))) necesita('px:' + s, S.de(tipo, def, 'px:' + s));
        if (p === 'meteoro') necesita('cae', S.de(tipo, def, 'cae'));   // por si el del meteoro no sonó
      }
      if (def.jefe) I.DE_JEFE.forEach((id) => necesita('jefe', id));
      for (const id of precarga) assert.ok(MANIFIESTO.sonidos[id], zona + ' · ' + tipo + ' precarga ' + id + ', que no existe');
    }
  }
});

test('lo que carga un mapa cabe en el presupuesto de memoria (Phaser lo descodifica a 48 kHz)', () => {
  const presupuesto = numero(/var PRESUPUESTO = (\d+)/, fuente('gf-sonidos-ataque.js'), 'PRESUPUESTO');
  const { res } = mapas();
  res.mina = [];
  for (const [zona, tipos] of Object.entries(res)) {
    const ids = new Set(zona === 'mina' ? S.SERPIENTE : []);
    tipos.forEach((t) => S.idsDe(t, ESPECIES[t]).forEach((id) => ids.add(id)));
    let seg = 0;
    ids.forEach((id) => { seg += MANIFIESTO.sonidos[id].seg; });
    assert.ok(seg <= presupuesto, zona + ': ' + seg.toFixed(1) + ' s de sonidos, el presupuesto es ' + presupuesto);
    // Un sonido descodificado pesa segundos × 48000 × 4 bytes (memoria "audio-memoria-y-rangos").
    assert.ok(seg * 48000 * 4 <= 16 * 1048576, zona + ': ' + (seg * 48000 * 4 / 1048576).toFixed(1) + ' MB');
  }
});

// ─── Los contratos entre módulos (un nombre mal escrito es silencio, no error) ─

test('las tablas nombran especies, gritos y poderes que existen en gf-salvaje.js', () => {
  assert.deepEqual(Object.keys(I.ESPECIE).filter((k) => !ESPECIES[k]), [], 'especies que no existen');
  const gritos = [...new Set(Object.values(ESPECIES).map((d) => d.grito).filter(Boolean))];
  assert.deepEqual(gritos.filter((g) => !Object.prototype.hasOwnProperty.call(I.GRITO, g)), [], 'gritos sin sonido (aullarían como lobos)');
  const poderes = [...new Set(Object.values(ESPECIES).flatMap((d) => [...(d.poderes || [])]))];
  assert.deepEqual(poderes.filter((p) => p !== 'espinos' && !Object.prototype.hasOwnProperty.call(I.PODER, p)), [], 'poderes sin sonido');
  assert.deepEqual(Object.keys(I.MOLDE).sort(), [...new Set(Object.values(ESPECIES).map((d) => d.molde))].sort(), 'los moldes');
});

test('gf-salvaje.js pide cada momento que tiene sonido, y nada que no lo tenga', () => {
  const src = fuente('gf-salvaje.js');
  const pedidos = new Set([...src.matchAll(/sonarAtaque\(st, m, '([a-z_:]+)'/g)].map((m) => m[1]));
  const conSonido = new Set([].concat(...Object.values(I.EVENTOS).map((l) => [...l])).concat(Object.keys(I.PODER).map((p) => 'px:' + p)));
  assert.deepEqual([...conSonido].filter((e) => !pedidos.has(e)).sort(), [], 'momentos con sonido que nadie pide');
  assert.deepEqual([...pedidos].filter((e) => !conSonido.has(e)).sort(), [], 'momentos que se piden y no tienen sonido');
});

test('gf-jefes.js y la serpiente de la mina piden sonidos que existen', () => {
  const jefes = [...new Set([...fuente('gf-jefes.js').matchAll(/sonidoJefe\(st, m, '(\w+)'/g)].map((m) => m[1]))];
  assert.deepEqual(jefes.sort(), ['impacto', 'nova', 'orbes', 'pincho', 'rugido'], 'los momentos del jefe');
  jefes.filter((t) => t !== 'rugido').forEach((t) => {
    assert.ok(I.DE_JEFE.includes('jefe_' + t), 'jefe_' + t + ' en DE_JEFE (se precarga con el jefe)');
    assert.ok(MANIFIESTO.sonidos['jefe_' + t], 'jefe_' + t + '.wav');
  });
  const src = fuente('gf-mina-serpiente.js');
  // El segundo argumento de cada GFSonAtaque.sonar(scene, …): los textos que no se comparan ('aliento' ? …).
  const ids = [...new Set([...src.matchAll(/GFSonAtaque\.sonar\(scene,\s*([^,]+),/g)]
    .flatMap((m) => [...m[1].matchAll(/(?<!===\s*)'([a-z_]+)'/g)].map((q) => q[1])))];
  assert.ok(ids.length >= 3, 'las llamadas de la serpiente: ' + ids.join(' '));
  assert.deepEqual(ids.sort(), [...S.SERPIENTE].sort(), 'lo que toca la serpiente es lo que precarga');
  assert.match(src, /GFSonAtaque\.precargar\(scene, window\.GFSonAtaque\.SERPIENTE\)/);
});

test('index.html carga gf-sonidos-ataque.js con el sello de su contenido (sha256), y la página de pruebas también', () => {
  const m = /<script src="\.\/gf-sonidos-ataque\.js\?v=[\d.]+\.([0-9a-f]{12})" defer><\/script>/.exec(fuente('index.html'));
  assert.ok(m, 'index.html no carga gf-sonidos-ataque.js');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(BIN, 'gf-sonidos-ataque.js'))).digest('hex').slice(0, 12);
  assert.equal(m[1], sha, 'el ?v= de gf-sonidos-ataque.js es de otra versión del archivo: los navegadores siguen con la vieja');
  assert.match(fuente('_prueba_offline.html'), /gf-sonidos-ataque\.js\?v=/);
});

// ─── gf-salvaje: el grabado, o el de antes ────────────────────────────────────

/** Un monstruo de `tipo` en (2000, 2000) y MI jugador donde diga `jugador`. */
function monstruo(tipo, jugador, conSonidos) {
  const ctx = cargar(conSonidos === false ? ['gf-salvaje.js'] : ['gf-sonidos-ataque.js', 'gf-salvaje.js'], ARTE_FALSO);
  const osciladores = [];
  const audio = { currentTime: 0, createOscillator() { osciladores.push(1); throw new Error('(el sintetizado de antes)'); } };
  const spr = { x: 2000, y: 2000, scene: { anims: { exists: () => false } }, anims: { isPlaying: false },
    setFlipX() { return this; }, setScale() { return this; }, play() { return this; } };
  const scene = { time: { now: 10000, delayedCall() { return { remove() {} }; } }, sound: { context: audio, mute: false, volume: 1 }, player: jugador };
  const st = { scene, vivo: true, proyectiles: [], efimeros: [], charcos: [] };
  const def = ctx.GFSalvaje._interno.ESPECIES[tipo];
  const m = { x: 2000, y: 2000, def, spr, vivo: true, dir: 'right', tipo };
  const pedidos = [];
  let responde = true;
  if (ctx.GFSonAtaque) ctx.GFSonAtaque.sonar = (sc, id, x, y, op) => { pedidos.push({ id, x, y, radio: op && op.radio }); return responde; };
  return { I: ctx.GFSalvaje._interno, st, m, pedidos, osciladores, responde: (v) => { responde = v; } };
}
const CERCA = { x: 2000, y: 1955 }, LEJOS = { x: 9000, y: 9000 };   // sus pies: y + 45

test('un ataque pide el grabado de su especie; si aún no ha llegado, suena el de antes; lejos, ninguno', () => {
  const a = monstruo('arana_salvaje', CERCA);
  a.I.aranaEspinas(a.st, a.m, 2030, 1970, 0.4);
  assert.deepEqual(a.pedidos.map((p) => [p.id, p.x, p.y, p.radio]), [['espinas', 2000, 2000, 700]]);
  assert.equal(a.osciladores.length, 0, 'sonó el grabado: el sintetizado no');

  const b = monstruo('arana_salvaje', CERCA);
  b.responde(false);                                     // el WAV aún no ha llegado
  b.I.aranaEspinas(b.st, b.m, 2030, 1970, 0.4);
  assert.equal(b.pedidos.length, 1);
  assert.equal(b.osciladores.length, 1, 'sin el grabado, el siseo de siempre: ningún ataque se queda mudo');

  const c = monstruo('arana_salvaje', LEJOS);
  c.I.aranaEspinas(c.st, c.m, 2030, 1970, 0.4);
  assert.equal(c.pedidos.length + c.osciladores.length, 0, 'lejos de mi jugador no suena nada');

  const d = monstruo('arana_salvaje', CERCA, false);      // sin gf-sonidos-ataque.js
  d.I.aranaEspinas(d.st, d.m, 2030, 1970, 0.4);
  assert.equal(d.osciladores.length, 1, 'sin el módulo, el sintetizado');
});

test('el chamán de la selva lanza magia: sus disparos y su abanico suenan a orbes, no a flechas', () => {
  const ch = monstruo('chaman_selva', CERCA);
  ch.I.aranaEspinas(ch.st, ch.m, 2030, 1970, 0.4);
  ch.I.pxDardos(ch.st, ch.m, { bx: 2030, by: 1966, a: 0.2 });
  assert.deepEqual(ch.pedidos.map((p) => p.id), ['orbes', 'orbes']);
  assert.equal(S.de('esqueleto_cementerio', ESPECIES.esqueleto_cementerio, 'espinas'), 'flechas', 'el esqueleto sí lleva arco');
  assert.equal(S.de('golem_cristal', ESPECIES.golem_cristal, 'espinas'), 'esquirlas');
  assert.equal(S.de('x', { molde: 'arana' }, 'px:dardos'), 'flechas', 'los dardos sin báculo');
});

// ─── Cómo se toca ─────────────────────────────────────────────────────────────

/** Un WebAudio de mentira que apunta lo que se toca. */
function audio(seg) {
  const nodo = (extra) => Object.assign({ destino: null, connect(n) { this.destino = n; return n; }, disconnect() {} }, extra);
  const ctx = {
    currentTime: 0, destination: { nombre: 'el destino del contexto' }, fuentes: [],
    decodeAudioData(bytes, ok) {
      const buf = { duration: seg || 1, length: Math.round((seg || 1) * 48000), numberOfChannels: 1 };
      if (ok) ok(buf);
      return Promise.resolve(buf);
    },
    createBufferSource() {
      return nodo({ context: ctx, playbackRate: { value: 1 }, inicio: null, parada: null,
        start(t) { this.inicio = t; ctx.fuentes.push(this); }, stop(t) { this.parada = t === undefined ? ctx.currentTime : t; } });
    },
    createGain() {
      const g = nodo({ gain: { value: 1, rampa: null, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime(v, t) { g.gain.rampa = [v, t]; } } });
      return g;
    },
    createStereoPanner() { return nodo({ pan: { value: 0 } }); }
  };
  return ctx;
}
function escena(ctx) {
  const oyentes = {};
  return {
    sound: { context: ctx, mute: false, volume: 1, destination: { nombre: 'el volumen general de Phaser', connect() {} } },
    player: { x: 1000, y: 955 },                        // sus pies en (1000, 1000)
    events: {
      once(n, f) { (oyentes[n] = oyentes[n] || []).push(f); },
      off(n, f) { oyentes[n] = (oyentes[n] || []).filter((g) => g !== f); },
      emit(n) { const l = oyentes[n] || []; oyentes[n] = []; l.forEach((f) => f()); }
    }
  };
}
const llega = () => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
/** gf-sonidos-ataque.js recién cargado (su caché vacía), con este fetch. Las pausas de los reintentos, cortas. */
function modulo(fetchFalso, extra) {
  return cargar('gf-sonidos-ataque.js', Object.assign({ fetch: fetchFalso, AbortController,
    setTimeout: (f, ms) => setTimeout(f, ms >= 10000 ? ms : Math.min(ms, 5)) }, extra)).GFSonAtaque;
}
const cerca = (a, b) => Math.abs(a - b) < 1e-9;

test('sin WebAudio, o con el WAV aún en camino, devuelve false (y lo pide una sola vez); al llegar, suena por Phaser', async () => {
  const urls = [];
  const M = modulo((u) => { urls.push(u); return llega(); });
  assert.equal(M.sonar(null, 'golpe_piedra', 0, 0), false);
  assert.equal(M.sonar({ sound: {} }, 'golpe_piedra', 0, 0), false);
  assert.equal(await M.precargar({ sound: {} }, ['golpe_piedra']), false);
  assert.equal(urls.length, 0, 'sin WebAudio no se descarga nada');

  const ctx = audio(), sc = escena(ctx);
  assert.equal(M.sonar(sc, 'golpe_piedra', 1000, 1000), false, 'aún no ha llegado: el que llama sintetiza');
  assert.equal(urls.length, 1, 'y lo pide él mismo (un sonido que no se precargó llega para la próxima)');
  assert.equal(M.sonar(sc, 'golpe_piedra', 1000, 1000), false);
  assert.equal(await M.precargar(sc, ['golpe_piedra']), true);
  assert.deepEqual(urls, ['./Game/MUSIC/ataques/golpe_piedra.wav?v=' + GEN.VERSION], 'una sola descarga, con la versión');
  assert.equal(M.sonar(sc, 'golpe_piedra', 1000, 1000), true);
  assert.equal(ctx.fuentes.length, 1);
  const f = ctx.fuentes[0];
  assert.equal(f.destino.destino, sc.sound.destination, 'fuente → ganancia → el volumen general de Phaser');
  assert.ok(f.playbackRate.value >= 0.96 && f.playbackRate.value <= 1.04, 'un poco de variación: no suenan todos idénticos');
});

test('el volumen: el de efectos del jugador × 0,62, con la fuerza, más bajo y de lado cuanto más lejos, y nada si lo silencia', async () => {
  const M = modulo(llega), ctx = audio(), sc = escena(ctx);
  await M.precargar(sc, ['golpe_piedra']);
  const toca = (x, y, op) => { ctx.currentTime += 1; const n = ctx.fuentes.length; const r = M.sonar(sc, 'golpe_piedra', x, y, op); return { r, f: ctx.fuentes.length > n ? ctx.fuentes[n] : null }; };
  const ganancia = (f) => f.destino.gain.value;

  let t = toca(1000, 1000);                                   // a sus pies, sin ajuste guardado: 0,6
  assert.ok(cerca(ganancia(t.f), 0.6 * 0.62), String(ganancia(t.f)));
  sc.audioState = { sfxVolumeApplied: 0.5 };
  t = toca(1000, 1000);
  assert.ok(cerca(ganancia(t.f), 0.31), String(ganancia(t.f)));
  t = toca(1000, 1000, { fuerza: 0.5 });
  assert.ok(cerca(ganancia(t.f), 0.155), String(ganancia(t.f)));
  t = toca(1700, 1000);                                       // a 700 px a la derecha (el radio): al 30 % y a la derecha
  assert.ok(cerca(ganancia(t.f), 0.5 * 0.62 * 0.3), String(ganancia(t.f)));
  assert.equal(t.f.destino.destino.pan.value, 0.6);
  assert.equal(t.f.destino.destino.destino, sc.sound.destination);
  t = toca(300, 1000);
  assert.equal(t.f.destino.destino.pan.value, -0.6, 'a la izquierda');

  sc.audioState = { sfxVolumeApplied: 0.5, sfxMuted: true };
  t = toca(1000, 1000);
  assert.deepEqual([t.r, t.f], [true, null], 'efectos silenciados: no suena (y no hace falta el sintetizado)');
  sc.audioState = { sfxVolumeApplied: 0.5 };
  sc.sound.mute = true;
  t = toca(1000, 1000);
  assert.deepEqual([t.r, t.f], [true, null], 'el juego en silencio');
  sc.sound.mute = false;

  sc.sound.destination = null;                                // otro sistema de sonido: al contexto, × el volumen general
  sc.sound.volume = 0.5;
  t = toca(1000, 1000);
  assert.ok(cerca(ganancia(t.f), 0.5 * 0.62 * 0.5), String(ganancia(t.f)));
  assert.equal(t.f.destino.destino, ctx.destination);
});

test('el grito de un jefe no se dobla (lo piden gf-salvaje y gf-jefes), ni cinco mordiscos a la vez', async () => {
  const M = modulo(llega), ctx = audio(), sc = escena(ctx);
  await M.precargar(sc, ['jefe_rugido', 'mordisco']);
  const n = () => ctx.fuentes.length;
  ctx.currentTime = 10;
  assert.equal(M.sonar(sc, 'jefe_rugido', 1000, 1000, { unico: 'grito:7' }), true);
  ctx.currentTime = 11;
  assert.equal(M.sonar(sc, 'jefe_rugido', 1000, 1000, { unico: 'grito:7' }), true);
  assert.equal(n(), 1, 'dentro de los 3 s: una vez');
  ctx.currentTime = 13.5;
  M.sonar(sc, 'jefe_rugido', 1000, 1000, { unico: 'grito:7' });
  assert.equal(n(), 2, 'pasados los 3 s, otra vez');

  ctx.currentTime = 20;
  M.sonar(sc, 'mordisco', 1000, 1000);
  ctx.currentTime = 20.03;
  assert.equal(M.sonar(sc, 'mordisco', 1000, 1000), true);
  assert.equal(n(), 3, 'el mismo sonido a menos de 50 ms: uno');
  ctx.currentTime = 20.06;
  M.sonar(sc, 'mordisco', 1000, 1000);
  assert.equal(n(), 4);
});

test('como mucho 4 voces de un mismo sonido y 14 en total: la más vieja se apaga con un fundido corto', async () => {
  const M = modulo(llega), ctx = audio(), sc = escena(ctx);
  const ids = Array.from({ length: 15 }, (v, k) => 'son' + k);
  await M.precargar(sc, ids.concat(['mordisco']));
  for (let k = 0; k < 5; k++) { ctx.currentTime = 30 + k * 0.1; M.sonar(sc, 'mordisco', 1000, 1000); }
  const [primera, segunda] = ctx.fuentes;
  assert.ok(cerca(primera.parada, 30.4 + 0.04 + 0.01), 'la primera se apaga: ' + primera.parada);
  assert.deepEqual(primera.destino.gain.rampa.map((v) => Math.round(v * 1000) / 1000), [0, 30.44]);
  assert.equal(segunda.parada, null, 'las otras siguen');

  const sc2 = escena(ctx);
  ctx.fuentes.length = 0;
  ids.forEach((id, k) => { ctx.currentTime = 40 + k * 0.1; M.sonar(sc2, id, 1000, 1000); });
  assert.equal(ctx.fuentes.length, 15);
  assert.notEqual(ctx.fuentes[0].parada, null, 'la decimoquinta apaga la más vieja');
  assert.ok(ctx.fuentes.slice(1).every((f) => f.parada === null));
});

test('un corte de red o un 5xx se reintentan; un 404 no, y no se vuelve a pedir en un minuto', async () => {
  const ctx = audio(), sc = escena(ctx);
  let n = 0;
  let M = modulo(() => (++n < 3 ? Promise.reject(new TypeError('Failed to fetch')) : llega()));
  assert.equal(await M.precargar(sc, ['golpe_piedra']), true, 'a la tercera llega');
  assert.equal(n, 3);

  n = 0;
  M = modulo(() => (++n < 2 ? Promise.resolve({ ok: false, status: 503 }) : llega()));
  assert.equal(await M.precargar(escena(ctx), ['golpe_piedra']), true, 'el 503 también se reintenta');
  assert.equal(n, 2);

  const avisos = [];
  n = 0;
  M = modulo(() => { n++; return Promise.resolve({ ok: false, status: 404 }); },
    { console: { log() {}, warn: (...a) => avisos.push(a.join(' ')), error: console.error } });
  const sc3 = escena(ctx);
  assert.equal(await M.precargar(sc3, ['nada']), false);
  assert.equal(n, 1, 'un 404 no se reintenta');
  assert.match(avisos.join('\n'), /\[sonidos de ataque\] nada: HTTP 404/);
  assert.equal(await M.precargar(sc3, ['nada']), false);
  assert.equal(M.sonar(sc3, 'nada', 1000, 1000), false);
  assert.equal(n, 1, 'ni se vuelve a pedir enseguida');

  n = 0;
  M = modulo(() => { n++; return Promise.reject(new TypeError('Failed to fetch')); },
    { console: { log() {}, warn: (...a) => avisos.push(a.join(' ')), error: console.error } });
  assert.equal(await M.precargar(escena(ctx), ['golpe_piedra']), false, 'tres cortes seguidos: se rinde');
  assert.equal(n, 3);
});

test('al cerrarse la escena se callan sus voces y se olvida lo que pedía (Phaser la vuelve a usar)', async () => {
  const M = modulo(llega), ctx = audio(), sc = escena(ctx);
  await M.precargar(sc, ['golpe_piedra']);
  M.sonar(sc, 'golpe_piedra', 1000, 1000);
  const reg = M._interno.regs.get(sc);
  assert.ok(reg && reg.ids.golpe_piedra);
  sc.events.emit('shutdown');
  assert.equal(M._interno.regs.get(sc), undefined, 'se olvida');
  assert.notEqual(ctx.fuentes[0].parada, null, 'se calla');
  await M.precargar(sc, ['golpe_piedra']);
  const nuevo = M._interno.regs.get(sc);
  assert.ok(nuevo && nuevo !== reg, 'al volver a entrar empieza de cero');
});

test('pasados 70 s se tiran los que no usa ningún mapa abierto, los más viejos antes; los de un mapa abierto, nunca', async () => {
  const M = modulo(llega), ctx = audio(30);                  // 30 s cada uno
  const a = escena(ctx), b = escena(ctx), c = escena(ctx);
  const hay = () => [...M._interno.buffers.keys()].sort();
  await M.precargar(a, ['x1', 'x2']);
  a.events.emit('shutdown');                                  // se va del mapa a
  await M.precargar(b, ['y1']);                               // 90 s: fuera x1, el más viejo de los que ya no usa nadie
  assert.deepEqual(hay(), ['x2', 'y1']);
  await M.precargar(c, ['z1', 'z2']);                         // fuera x2; y1, z1 y z2 son de mapas abiertos: se quedan
  assert.deepEqual(hay(), ['y1', 'z1', 'z2']);
  assert.deepEqual(JSON.parse(JSON.stringify(M.memoria())), { sonidos: 3, segundos: 90, bytes: 3 * 30 * 48000 * 4, cargando: 0 });
});
