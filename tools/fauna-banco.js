/* BANCO DE PRUEBAS SIN NAVEGADOR PARA LA FAUNA.
 *
 * Monta una escena de mentira con la superficie de Phaser que usan los modulos
 * (add, textures, anims, events, cameras, time) y le da al reloj a mano: en un
 * segundo real se simulan minutos de juego, y se puede repetir veinte veces
 * para cazar los fallos intermitentes, que son los que no se ven leyendo.
 *
 * COMO SE USA (desde bin/):
 *     node tools/fauna-prueba-clima.js  .     los animales y el tiempo
 *     node tools/fauna-prueba-aves.js   .     el cuervo y el buho
 *     node tools/fauna-medir-sol.js     .     cuanto se tuestan los reptiles
 *     node tools/fauna-medir-cava.js    .     el conejo abriendo su madriguera
 *
 * El argumento es la carpeta donde estan los gf-*.js (normalmente ".").
 *
 * LO QUE ESTE BANCO NO PUEDE VER, y por eso hace falta ademas la pagina
 * `_prueba_fauna_clima.html`: aqui Phaser es de mentira y los otros modulos
 * (gf-viento, gf-clima) estan simulados, asi que no salen los numeros REALES
 * que dan en el juego. Tres umbrales se calibraron mal por eso y solo se
 * arreglaron midiendo en el navegador.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2];

// ─────────────────────────────────────────────────────── escena de mentira
let vivos = 0, creados = 0, destruidos = 0;

function objBase(x, y, tipo) {
  vivos++; creados++;
  return {
    __tipo: tipo,
    x: x || 0, y: y || 0, depth: 0, alpha: 1, visible: true, active: true,
    scaleX: 1, scaleY: 1, rotation: 0, flipX: false,
    width: 10, height: 10, displayWidth: 20, displayHeight: 20,
    anims: {
      currentAnim: null, timeScale: 1, isPlaying: false,
      play(k) { this.currentAnim = { key: k }; this.isPlaying = true; },
      pause() { this.isPlaying = false; },
      resume() { this.isPlaying = true; }
    },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setOrigin() { return this; },
    setScale(a, b) {
      this.scaleX = a; this.scaleY = (b === undefined ? a : b);
      this.displayWidth = this.width * this.scaleX;
      this.displayHeight = this.height * this.scaleY;
      return this;
    },
    setDepth(d) { this.depth = d; return this; },
    setAlpha(a) { this.alpha = a; return this; },
    setVisible(v) { this.visible = v; return this; },
    setFlipX(v) { this.flipX = !!v; return this; },
    setTint() { this.tinted = true; return this; },
    clearTint() { this.tinted = false; return this; },
    setTexture(k) { this.textureKey = k; this.texture = { key: k }; return this; },
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
    setSize(w, h) { this.width = w; this.height = h; return this; },
    setStrokeStyle() { return this; },
    setBlendMode() { return this; },
    setPipeline() { return this; },
    play(k) { this.anims.play(k); return this; },
    getBounds() {
      return { x: this.x - 20, y: this.y - 40, width: 40, height: 40,
               centerX: this.x, top: this.y - 40, bottom: this.y,
               right: this.x + 20 };
    },
    destroy() { if (this.active) { this.active = false; vivos--; destruidos++; } }
  };
}

function crearEscena(op = {}) {
  const listeners = {};
  const texturas = new Set();

  // Todas las texturas que pide el modulo existen.
  const anims = new Set();

  const scene = {
    __reloj: 0,
    map: { widthInPixels: 5008, heightInPixels: 5008 },
    player: { x: 2500, y: 2500 },
    treeStumps: {},
    time: { get now() { return scene.__reloj; } },
    sys: { isActive: () => true },
    cameras: { main: { midPoint: { x: 2500, y: 2500 }, width: 800, height: 600 } },
    textures: {
      exists: (k) => texturas.has(k) || /^gfa_/.test(k),
      get: () => ({ getSourceImage: () => null }),
      addCanvas: (k) => { texturas.add(k); return {}; },
      createCanvas: (k) => { texturas.add(k); return { getContext: () => null, refresh() {} }; }
    },
    anims: {
      exists: (k) => anims.has(k),
      create: (cfg) => { anims.add(cfg.key); return {}; }
    },
    add: {
      sprite: (x, y, k) => { const o = objBase(x, y, 'sprite'); o.setTexture(k); return o; },
      image: (x, y, k) => { const o = objBase(x, y, 'image'); o.setTexture(k); return o; },
      ellipse: (x, y, w, h) => { const o = objBase(x, y, 'ellipse'); o.width = w; o.height = h; return o; },
      rectangle: (x, y, w, h) => { const o = objBase(x, y, 'rect'); o.width = w; o.height = h; return o; }
    },
    events: {
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      once(ev, fn) { this.on(ev, fn); },
      off(ev, fn) {
        if (!listeners[ev]) return;
        const i = listeners[ev].indexOf(fn);
        if (i >= 0) listeners[ev].splice(i, 1);
      },
      emit(ev, ...a) { (listeners[ev] || []).slice().forEach((f) => f(...a)); }
    },
    _chocaConEscenario(x, y, w, h) {
      // Un par de "casas" macizas para que haya colisiones de verdad.
      for (const c of scene.__solidos) {
        if (x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y) return true;
      }
      return false;
    },
    __solidos: [{ x: 1000, y: 1000, w: 300, h: 300 },
                { x: 3200, y: 900, w: 260, h: 200 }],
    __listeners: listeners
  };

  // Arboles, postes y casas repartidos.
  let semilla = 12345;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 1; i <= 18; i++) {
    const o = objBase(200 + rnd() * 4600, 200 + rnd() * 4600, 'arbol');
    scene['sprite_arbolx' + i] = o; o.depth = o.y;
  }
  for (let i = 1; i <= 45; i++) {
    const o = objBase(200 + rnd() * 4600, 200 + rnd() * 4600, 'pino');
    scene['sprite_pinos' + i] = o; o.depth = o.y;
  }
  for (let i = 1; i <= 20; i++) {
    const o = objBase(200 + rnd() * 4600, 200 + rnd() * 4600, 'poste');
    scene['post_' + i] = o; o.depth = o.y;
  }
  for (const c of ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_molino']) {
    const o = objBase(200 + rnd() * 4600, 200 + rnd() * 4600, 'casa');
    scene[c] = o; o.depth = o.y;
  }
  // Flores, arbustos, piedras y troncos para las mariposas.
  const familias = [['sprite_flor_formado1_ect', 19], ['sprite_flor_formado2_ect', 20],
                    ['sprite_flor_formado3_ect', 19], ['sprite_flor_formado4_ect', 18],
                    ['sprite_arbustos_', 28], ['sprite_arbusto_ect', 18],
                    ['sprite_piedras_', 34]];
  for (const [pre, n] of familias) {
    for (let i = 1; i <= n; i++) {
      const o = objBase(200 + rnd() * 4600, 200 + rnd() * 4600, 'flor');
      scene[pre + i] = o; o.depth = o.y;
    }
  }
  for (let i = 1; i <= 17; i++) {
    const o = objBase(200 + rnd() * 4600, 200 + rnd() * 4600, 'tronco');
    scene['sprite_tronco_acostado_' + i + 'png'] = o; o.depth = o.y;
  }
  // La fuente
  const f = objBase(2400, 2400, 'fuente');
  scene.sprite_fuente1 = f; f.depth = f.y;

  if (op.sinArboles) {
    for (let i = 1; i <= 18; i++) delete scene['sprite_arbolx' + i];
    for (let i = 1; i <= 45; i++) delete scene['sprite_pinos' + i];
  }
  return scene;
}

// ───────────────────────────────────────────────── clima de mentira
const clima = {
  activo: false, cargado: true, estacion: 'verano',
  lluvia: 0, nieve: 0, sol: 0, viento: 0, truenos: false, tormenta: false
};
const oyentesTrueno = [];

// ───────────────────────────────────────────────── entorno global
const ctx = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean,
  isFinite, parseFloat, parseInt, Infinity, NaN, Error, RegExp,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) }
};
ctx.Phaser = { BlendModes: { ADD: 1, MULTIPLY: 2, NORMAL: 0, SCREEN: 3 } };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.GFClima = {
  ahora: () => clima,
  estado: () => ({ activo: clima.activo, lluvia: clima.lluvia > 0,
                   lluviaFuerza: clima.lluvia, nieve: clima.nieve > 0,
                   nieveFuerza: clima.nieve, soleado: clima.sol > 0,
                   soleadoFuerza: clima.sol, truenos: clima.truenos,
                   estacion: clima.estacion }),
  charcos: () => ctx.__charcos || [],
  alTronar: (fn) => { oyentesTrueno.push(fn); return () => {
    const i = oyentesTrueno.indexOf(fn); if (i >= 0) oyentesTrueno.splice(i, 1); }; },
  ultimoTrueno: () => 0
};
ctx.GFViento = { vector: (o) => { o.dir = 1; o.fuerza = clima.viento; return o; } };
ctx.__charcos = [];

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-animales.js'), 'utf8'),
                ctx, { filename: 'gf-animales.js' });

module.exports = { crearEscena, ctx, clima, oyentesTrueno,
                   cuentas: () => ({ vivos, creados, destruidos }),
                   reiniciarCuentas: () => { creados = 0; destruidos = 0; } };
