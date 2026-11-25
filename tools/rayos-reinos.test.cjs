'use strict';
/* LOS RAYOS DE SOL DE ALDOR Y LA SELVA (2026-11-23).
 * "Las luces del clima en algunos mapas nuevos no se adaptan bien" (captura de
 * Aldor: franjas claras pegadas a la pantalla, iguales con sol, con nubes o al
 * atardecer). Ahora cada rayo cae en un sitio FIJO del mundo (se queda en el
 * suelo al andar, como las sombras), es blando, deja un charco de luz donde
 * toca y su fuerza sigue al tiempo de verdad: con nubes casi se apaga, con
 * lluvia y de noche no hay, y con el día soleado brilla más.
 *
 *   node --test tools/rayos-reinos.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');

function encadenable(base) {
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^(set|play|add|stop)/.test(k)) return function () { return this; };
      return undefined;
    }
  });
}
function ctx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, { get(t, k) { return k in t ? t[k] : () => grad; }, set(t, k, v) { t[k] = v; return true; } });
}

/** Un reino montado con gf-reinos.js de verdad; el tiempo, la hora y la cámara, de mentira. */
function reino(zona) {
  const tiempo = { activo: true, lluvia: 0, nieve: 0, sol: 0, nublado: 0, viento: 0, tormenta: false };
  const reloj = { oscuro: 0, t: 1000 };
  const creados = [];
  const sprite = (x, y, key) => {
    const s = encadenable({
      x, y, key, sx: 1, sy: 1, alpha: 1, visible: true, scrollX: 1, scrollY: 1, scene: true, width: 64, height: 64, rotation: 0,
      get scaleX() { return this.sx; }, get scaleY() { return this.sy; },
      setScale(a, b) { this.sx = a; this.sy = b === undefined ? a : b; return this; },
      setAlpha(a) { this.alpha = a; return this; }, setVisible(v) { this.visible = v; return this; },
      setPosition(px, py) { this.x = px; this.y = py === undefined ? this.y : py; return this; },
      setScrollFactor(a, b) { this.scrollX = a; this.scrollY = b === undefined ? a : b; return this; },
      setRotation(r) { this.rotation = r; return this; },
      setSize(w, h) { this.width = w; this.height = h; return this; }, destroy() { this.scene = null; }
    });
    creados.push(s);
    return s;
  };
  const texturas = new Map();
  const vista = { x: 2000, y: 2000, width: 1280, height: 720 };
  const cam = {
    get worldView() { return { x: vista.x, y: vista.y, width: vista.width, height: vista.height, right: vista.x + vista.width, bottom: vista.y + vista.height }; },
    width: 1280, height: 720
  };
  let alActualizar = null;
  const escena = {
    add: new Proxy({}, { get: () => (x, y, a, b, key) => sprite(x || 0, y || 0, typeof a === 'string' ? a : key) }),
    textures: {
      exists: (k) => texturas.has(k), get: (k) => texturas.get(k), remove: (k) => texturas.delete(k),
      createCanvas(k, w, h) { const c = { key: k, width: w, height: h, getContext: () => ctx2d(), refresh() {} }; texturas.set(k, c); return c; }
    },
    events: { once() {}, on(ev, fn) { if (ev === 'update') alActualizar = fn; }, off() {} },
    cameras: { main: cam },
    map: { getObjectLayer: () => ({ objects: [] }) },
    tweens: { killTweensOf() {} },
    time: { delayedCall: () => ({ remove() {} }) }
  };
  const ctx = { console: { log() {}, warn: console.warn, error: console.error }, Math, Date, JSON, Object, Array, Number, String,
                Phaser: { BlendModes: { ADD: 1, NORMAL: 0, MULTIPLY: 2 } },
                GFClima: { ahora: () => tiempo },
                GFCiclo: { oscuridad: () => reloj.oscuro },
                GFZonas: { _interno: { ahoraServidor: () => reloj.t * 1000 } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-reinos.js'), 'utf8'), ctx);
  const st = ctx.GFReinos.montar(escena, zona);
  assert.ok(st, zona + ': no se montó');
  const tic = (seg) => { if (seg !== undefined) reloj.t = seg; alActualizar(reloj.t * 1000, 16); };
  const rayos = () => creados.filter((s) => s.key === 'rn_rayo_' + zona && s.scene);
  const charcos = () => creados.filter((s) => s.key === 'rn_charco_' + zona && s.scene);
  const vistos = () => rayos().filter((s) => s.visible && s.alpha > 0.004);
  const maxAlfa = () => Math.max(0, ...rayos().map((s) => (s.visible ? s.alpha : 0)));
  return { tiempo, reloj, vista, tic, rayos, charcos, vistos, maxAlfa };
}

/** El rayo más brillante a lo largo de 40 s (respiran): lo que llega a verse. */
function picoEn(r, desde) {
  let pico = 0;
  for (let s = 0; s < 40; s += 0.5) { r.tic(desde + s); pico = Math.max(pico, r.maxAlfa()); }
  return pico;
}

for (const zona of ['aldor', 'selva']) {
  test(zona + ': cada rayo cae en un sitio fijo del mundo y se queda ahí al andar', () => {
    const r = reino(zona);
    r.tic(5000);
    const antes = r.vistos();
    assert.ok(antes.length >= 3, 'se ven rayos (' + antes.length + ')');
    for (const s of antes) assert.notEqual(s.scrollX, 0, 'un rayo no va pegado a la pantalla');
    const pies = (lista) => new Set(lista.map((s) => Math.round(s.x) + ',' + Math.round(s.y)));
    const p0 = pies(antes);
    r.vista.x += 260; r.vista.y += 140;               // se anda un poco
    r.tic(5000);
    const p1 = pies(r.vistos());
    const comunes = [...p0].filter((k) => p1.has(k));
    assert.ok(comunes.length >= 2, 'los rayos que siguen a la vista no se han movido con ella (' + comunes.length + ' iguales)');
    // y si se vuelve, están donde estaban
    r.vista.x -= 260; r.vista.y -= 140;
    r.tic(5000);
    assert.deepEqual([...pies(r.vistos())].sort(), [...p0].sort());
  });

  test(zona + ': cada rayo deja su charco de luz en el suelo, donde toca', () => {
    const r = reino(zona);
    r.tic(5000);
    const vistos = r.vistos();
    const charcos = r.charcos().filter((c) => c.visible && c.alpha > 0.002);
    assert.equal(charcos.length, vistos.length);
    for (const s of vistos) assert.ok(charcos.some((c) => Math.abs(c.x - s.x) < 2 && Math.abs(c.y - s.y) < 2), 'charco al pie del rayo');
  });

  test(zona + ': blandos de día; con nubes casi se apagan, con lluvia o de noche no hay y con sol brillan más', () => {
    const r = reino(zona);
    const claro = picoEn(r, 1000);
    assert.ok(claro > 0.08 && claro <= 0.3, 'de día y despejado, se ven pero blandos (' + claro.toFixed(3) + ')');
    r.tiempo.nublado = 1;
    const nubes = picoEn(r, 1000);
    assert.ok(nubes <= claro * 0.3, 'con nubes (' + nubes.toFixed(3) + ' frente a ' + claro.toFixed(3) + ')');
    r.tiempo.nublado = 0; r.tiempo.sol = 1;
    const sol = picoEn(r, 1000);
    assert.ok(sol > claro * 1.15, 'con sol brillan más (' + sol.toFixed(3) + ')');
    r.tiempo.sol = 0; r.tiempo.lluvia = 1;
    assert.equal(picoEn(r, 1000), 0, 'con lluvia no hay rayos');
    r.tiempo.lluvia = 0; r.reloj.oscuro = 1;
    assert.equal(picoEn(r, 1000), 0, 'de noche no hay rayos');
    r.reloj.oscuro = 0.5;
    assert.ok(picoEn(r, 1000) < claro, 'al atardecer, menos');
  });
}
