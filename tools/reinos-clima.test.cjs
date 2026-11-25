'use strict';
/* EL TIEMPO Y SU SONIDO EN LOS SIETE REINOS (2026-11-21).
 *
 * "Que los sonidos de climas funcionen bien." Tres módulos se hablan a través
 * de la escena: ZonasScenes.js monta gf-clima con { sinNieve } (en las ruinas,
 * la selva y la hondonada no nieva: cuando nieva en el pueblo, allí llueve),
 * gf-clima pinta la lluvia o la nieve con su fuerza (scene.__gfClima) y
 * gf-audio suena LO PINTADO, más el ambiente propio de cada reino. Entre
 * módulos un nombre mal escrito es silencio, no error: aquí corren los tres de
 * verdad, con el trozo de ZonasScenes.js que los monta sacado del archivo.
 *
 * Lo de mentira es solo lo de fuera: el tiempo que manda el servidor
 * (GFClima.estado), la hora (GFCiclo), la escena de Phaser y la caché de
 * sonido (los WAV ya cargados, como en tools/audio-footprints-lifecycle.test.cjs).
 *
 *   node --test tools/reinos-clima.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const BIN = path.resolve(__dirname, '..');
const leer = (r) => fs.readFileSync(path.join(BIN, r), 'utf8');

// ── LO ESPERADO (escrito a mano) ────────────────────────────────────────────
const REINOS = { puerto: 'PuertoScene', pantano: 'PantanoScene', aldor: 'AldorScene', colinas: 'ColinasScene',
                 selva: 'SelvaScene', volcan: 'VolcanScene', hongos: 'HongosScene' };
const ZONAS = Object.keys(REINOS);
const SIN_NIEVE = ['aldor', 'selva', 'hongos'];   // la nieve del pueblo cae (y suena) como lluvia
const TIEMPO_PROPIO = ['volcan'];                 // la caldera: ni la lluvia ni la nieve del pueblo

// ── LAS CONFIGURACIONES DE VERDAD Y EL TROZO QUE MONTA EL CLIMA Y EL AUDIO ──
const CFG = (() => {
  const ctx = { console, Math, Phaser: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('var GameScene = class { constructor() {} };', ctx);
  for (const a of ['Scenes/ZonasScenes.js', 'Scenes/ReinosScenes.js']) vm.runInContext(leer(a), ctx, { filename: a });
  const r = {};
  for (const n of ZONAS) r[n] = ctx[REINOS[n]].CFG;
  return r;
})();
const MONTAJE = (() => {
  const src = leer('Scenes/ZonasScenes.js');
  const clima = src.indexOf('window.GFClima.montar(this'), audio = src.indexOf('window.GFAudio.montar(this');
  assert.ok(clima > 0 && clima === src.lastIndexOf('window.GFClima.montar(this'), 'ZonasScenes.js monta gf-clima en un solo sitio');
  assert.ok(audio > clima && audio === src.lastIndexOf('window.GFAudio.montar(this'), 'y gf-audio después, en un solo sitio');
  const desde = src.lastIndexOf('\n    if (c.clima) {', clima);
  assert.ok(desde > 0 && clima - desde < 120, 'gf-clima se monta dentro de `if (c.clima)`');
  return src.slice(desde, src.indexOf('\n', audio));
})();

// ── EL MUNDO DE MENTIRA: un contexto con gf-clima y gf-audio y una escena para los dos ──
function mundo() {
  let ahora = 0, serie = 0;
  const reloj = { oscuro: 0 };
  function lienzo() {
    const cv = { width: 0, height: 0 };
    const c2d = new Proxy({
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(Math.max(1, cv.width * cv.height) * 4) })
    }, { get: (o, k) => (k in o ? o[k] : () => {}) });
    cv.getContext = () => c2d;
    return cv;
  }
  class Fecha extends Date { static now() { return ahora; } }
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Math, JSON, Promise, AbortController, Date: Fecha,
    performance: { now: () => ahora }, location: { hostname: 'localhost', search: '' }, navigator: {},
    document: { readyState: 'loading', getElementById: () => null, createElement: lienzo, querySelector: () => null,
                addEventListener() {}, removeEventListener() {} },
    setTimeout: () => ++serie, clearTimeout() {}, setInterval: () => ++serie, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    fetch: () => new Promise(() => {}),       // nada llega por la red: lo que haga falta ya está en la caché
    Phaser: { BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2, SCREEN: 3 }, Textures: { FilterMode: { LINEAR: 1, NEAREST: 0 } }, WEBGL: 2 },
    GFCiclo: { hayHora: () => true, oscuridad: () => reloj.oscuro }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const a of ['gf-clima.js', 'gf-audio.js']) vm.runInContext(leer(a), ctx, { filename: a });
  return { ctx, reloj, avanzar: (ms) => { ahora += ms; } };
}

function escena(m, n) {
  const eventos = new EventEmitter(), texturas = new Map(), hijos = { list: [] };
  const tm = {
    exists: (k) => texturas.has(k), get: (k) => texturas.get(k), remove: (k) => texturas.delete(k),
    addCanvas(k, cv) {
      const t = { canvas: cv, getSourceImage: () => cv, getContext: () => cv.getContext('2d'), refresh() {}, setFilter() {} };
      texturas.set(k, t); return t;
    },
    createCanvas(k, w, h) { const cv = m.ctx.document.createElement('canvas'); cv.width = w; cv.height = h; return this.addCanvas(k, cv); },
    source(k, w = 32, h = 32) { texturas.set(k, { getSourceImage: () => ({ width: w, height: h }) }); }
  };
  // Las imágenes del clima (sin la gota gf-clima no se monta; lo demás, si falta, no se pinta).
  for (const fam of ['gota', 'copo', 'salpica', 'posa', 'fuego', 'humo', 'brasa']) for (let i = 1; i <= 4; i++) tm.source('gfc_' + fam + '_' + i);
  const sc = { events: eventos, textures: tm, children: hijos, time: { now: 0 }, scene: { key: REINOS[n] },
               sys: { isActive: () => true }, cfg: CFG[n], player: { x: 1000, y: 1000 },
               audioState: { sfxVolumeApplied: 1, musicVolumeApplied: 1 } };
  function objeto(x, y, key) {
    const o = { scene: sc, x, y, width: 32, height: 32, displayWidth: 32, displayHeight: 32, alpha: 1, visible: true,
                active: true, texture: { key }, depth: 1, list: [],
                destroy() { if (!this.active) return; this.active = false; const i = hijos.list.indexOf(this); if (i >= 0) hijos.list.splice(i, 1); },
                setAlpha(v) { this.alpha = v; return this; }, setVisible(v) { this.visible = v; return this; },
                setPosition(px, py) { this.x = px; this.y = py; return this; }, setTexture(k) { this.texture = { key: k }; return this; },
                setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
                setSize(w, h) { this.width = w; this.height = h; return this; }, add(c) { this.list.push(c); return this; },
                getCenter() { return { x: this.x, y: this.y }; } };
    for (const f of ['setOrigin', 'setDepth', 'setScrollFactor', 'setTint', 'setBlendMode', 'setRotation', 'setScale',
                     'setFlipX', 'setFlipY', 'disableInteractive', 'clear', 'fill', 'erase']) o[f] = function () { return this; };
    hijos.list.push(o);
    return o;
  }
  sc.add = { image: objeto, rectangle: (x, y) => objeto(x, y, 'rectangle'), container: (x, y) => objeto(x, y, 'container'),
             renderTexture: (x, y, w, h) => objeto(x, y, 'rt').setSize(w, h) };
  sc.make = { image: (c) => objeto(0, 0, c.key) };
  sc.cameras = { main: { width: 800, height: 600, zoom: 1, scrollX: 600, scrollY: 700, midPoint: { x: 1000, y: 1000 },
                         worldView: { x: 600, y: 700, width: 800, height: 600, right: 1400, bottom: 1300 }, shake() {} } };
  // El sonido: la caché de Phaser y los bucles que gf-audio crea en ella.
  const datos = new Map(), sonidos = [];
  sc.cache = { audio: { exists: (k) => datos.has(k), get: (k) => datos.get(k), add: (k, v) => datos.set(k, v),
                        remove: (k) => datos.delete(k), entries: { each(fn) { for (const e of datos) fn(...e); } } } };
  sc.sound = Object.assign(new EventEmitter(), { locked: false, sounds: sonidos,
    context: { sampleRate: 48000, decodeAudioData() {} },
    add(key) {
      const s = { key, manager: this, isPlaying: false, volume: 0, pendingRemove: false, audioBuffer: datos.get(key),
                  play() { this.isPlaying = true; return this; }, stop() { this.isPlaying = false; return this; },
                  setVolume(v) { this.volume = v; return this; }, setRate() { return this; }, setPan() { return this; },
                  destroy() { this.pendingRemove = true; this.isPlaying = false; const i = sonidos.indexOf(this); if (i >= 0) sonidos.splice(i, 1); } };
      sonidos.push(s);
      return s;
    } });
  sc.datos = datos;
  // Un bosquecillo a los pies del jugador: donde haya grillos y pájaros, que se oigan.
  for (let i = 0; i < 8; i++) objeto(1000, 1000, 'arbol_prueba');
  sc.correr = (ms) => {
    for (let t = 0; t < ms; t += 100) { m.avanzar(100); sc.time.now += 100; eventos.emit('update', sc.time.now, 100); }
  };
  return sc;
}

/** Entra en el reino `n` con este tiempo del pueblo y esta hora, y deja correr ocho segundos. */
function entrar(n, tiempo, oscuro) {
  const m = mundo(), sc = escena(m, n);
  m.reloj.oscuro = oscuro || 0;
  // El trozo de ZonasScenes.js tal cual, con `this` = la escena y `c` = su configuración.
  vm.runInContext('(function (c) {' + MONTAJE + '\n})', m.ctx).call(sc, CFG[n]);
  const A = m.ctx.GFAudio._interno;
  // Todos los sonidos en la caché: si suena algo que no toca, no será porque faltaba el archivo.
  for (const f of Object.values(A.AMBIENTES).concat(Object.values(A.TEMAS))) sc.datos.set(A.PREFIJO + f, { length: 480000, numberOfChannels: 1, duration: 10 });
  Object.assign(m.ctx.GFClima.estado(), { activo: true }, tiempo || {});
  sc.correr(8000);
  return { clima: sc.__gfClima, audio: sc.__gfAudio, M: A.MEZCLA, suena: (b) => !!(sc.__gfAudio.bucles[b] && sc.__gfAudio.bucles[b].son.isPlaying) };
}

test('montar: el clima del pueblo en los reinos que lo llevan (con sinNieve donde no nieva) y el audio con su zona', () => {
  for (const n of ZONAS) {
    const e = entrar(n, { soleado: true });
    // (Booleanos: si fallan, que el informe no intente volcar la escena entera.)
    assert.ok(e.audio !== undefined, n + ': gf-audio montado');
    assert.equal(e.audio.zona, n, n + ': gf-audio sabe en qué reino está');
    if (TIEMPO_PROPIO.includes(n)) { assert.ok(e.clima === undefined, n + ': sin el clima del pueblo'); continue; }
    assert.ok(e.clima !== undefined, n + ': gf-clima montado');
    assert.equal(e.clima.sinNieve, SIN_NIEVE.includes(n), n + ': sinNieve');
  }
});

test('de día y despejado: en cada reino suena su ambiente y ningún otro', () => {
  for (const n of ZONAS) {
    const e = entrar(n, { soleado: true });
    assert.equal(e.audio.objetivo[n], e.M.zona, n + ': su ambiente, al volumen de los mapas');
    assert.ok(e.suena(n), n + ': su bucle suena');
    for (const m of ZONAS) if (m !== n) assert.ok(!(e.audio.objetivo[m] > 0) && !e.suena(m), n + ': suena el ambiente de ' + m);
    assert.ok(!e.suena('lluvia') && !e.suena('nieve'), n + ': ni lluvia ni nieve');
  }
});

test('nieva en el pueblo: en las ruinas, la selva y la hondonada se ve y se oye lluvia; en el resto, nieve; la caldera, nada', () => {
  for (const n of ZONAS) {
    const e = entrar(n, { nieve: true, nieveFuerza: 0.8 });
    const o = e.audio.objetivo;
    if (TIEMPO_PROPIO.includes(n)) {
      assert.equal(o.lluvia, 0, n); assert.equal(o.nieve, 0, n);
      assert.ok(!e.suena('lluvia') && !e.suena('nieve'), n + ': ni lluvia ni nieve');
    } else if (SIN_NIEVE.includes(n)) {
      assert.equal(e.clima.fuerzaLluvia, 0.8, n + ': gf-clima pinta lluvia con la fuerza de la nieve');
      assert.equal(e.clima.fuerzaNieve, 0, n + ': y nada de nieve');
      assert.equal(o.lluvia, e.M.lluvia * 0.8, n + ': suena la lluvia');
      assert.equal(o.nieve, 0, n + ': no suena la nieve');
      assert.ok(e.suena('lluvia') && !e.suena('nieve'), n + ': el bucle de la lluvia, no el de la nieve');
    } else {
      assert.equal(e.clima.fuerzaNieve, 0.8, n + ': gf-clima pinta la nieve');
      assert.equal(e.clima.fuerzaLluvia, 0, n + ': sin lluvia');
      assert.equal(o.nieve, e.M.nieve * 0.8, n + ': suena la nieve');
      assert.equal(o.lluvia, 0, n + ': no suena lluvia');
      assert.ok(e.suena('nieve') && !e.suena('lluvia'), n + ': el bucle de la nieve, no el de la lluvia');
    }
  }
});

test('llueve en el pueblo: el ambiente del reino cede ante la lluvia; la caldera ni la oye ni baja el suyo', () => {
  for (const n of ZONAS) {
    const e = entrar(n, { lluvia: true, lluviaFuerza: 1 });
    const o = e.audio.objetivo;
    if (TIEMPO_PROPIO.includes(n)) {
      assert.equal(o.lluvia, 0, n + ': no suena la lluvia del pueblo');
      assert.equal(o[n], e.M.zona, n + ': su ambiente, entero');
      assert.ok(!e.suena('lluvia'), n);
    } else {
      assert.equal(o.lluvia, e.M.lluvia, n + ': suena la lluvia');
      assert.equal(o[n], e.M.zona * 0.5, n + ': su ambiente cede la mitad');
      assert.ok(e.suena('lluvia') && e.suena(n), n + ': los dos bucles');
    }
  }
});

test('con árboles cerca: de noche, grillos en la ciénaga y la hondonada; de día, el campo en las colinas; en la caldera, nada de eso', () => {
  const cienaga = entrar('pantano', {}, 1), hondonada = entrar('hongos', {}, 1), calderaNoche = entrar('volcan', {}, 1);
  assert.ok(cienaga.audio.objetivo.noche > 0 && cienaga.suena('noche'), 'la ciénaga, de noche, con sus grillos');
  assert.ok(hondonada.audio.objetivo.noche > 0 && hondonada.suena('noche'), 'la hondonada, de noche, con sus grillos');
  assert.equal(calderaNoche.audio.objetivo.noche, 0, 'en la caldera no hay grillos');
  assert.ok(!calderaNoche.suena('noche'));
  const colinas = entrar('colinas', { soleado: true }, 0), calderaDia = entrar('volcan', { soleado: true }, 0);
  assert.ok(colinas.audio.objetivo.soleado > 0 && colinas.suena('soleado'), 'las colinas, de día, con el zumbido del campo');
  assert.equal(calderaDia.audio.objetivo.soleado, 0, 'en la caldera no zumba el campo');
  assert.ok(!calderaDia.suena('soleado'));
});
