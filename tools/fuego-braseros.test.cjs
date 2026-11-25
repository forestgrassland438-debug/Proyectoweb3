'use strict';
/* EL FUEGO DE LOS BRASEROS Y LAS HOGUERAS (2026-11-23).
 * "Repara de todos los mapas el fuego ese y donde va": la llama viva de
 * gf-zonas.js se ponía a una altura fija y en el volcán (y en Aldor y la
 * caverna) quedaba FLOTANDO por encima de la llama que ya trae el dibujo.
 * Aquí se mira con el arte de verdad (los atlas de Game/MAPAS/<zona>): la
 * llama pintada se busca en el PNG (rojo a tope) y la viva tiene que nacer
 * donde nace esa, taparla entera aunque tiemble, y su luz de noche caer en
 * ella. En todos los mapas que tienen fuego. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { leerPNG } = require('./leer-png.cjs');

const BIN = path.resolve(__dirname, '..');
const FUEGO = ['hoguera', 'brasero', 'brasero_dorado', 'brasero_volcan'];
const ESCALA = 2;                      // ZonasScenes._montarObjetos dibuja los objetos a escala 2

function mapa(zona) { return JSON.parse(fs.readFileSync(path.join(BIN, 'Maps', zona + '.json'), 'utf8')); }
function atlas(zona) {
  const dir = path.join(BIN, 'Game', 'MAPAS', zona);
  return { json: JSON.parse(fs.readFileSync(path.join(dir, 'objetos.json'), 'utf8')), png: leerPNG(path.join(dir, 'objetos.png')) };
}
/** Los mapas que tienen algo que arde, leídos de su capa de objetos. */
function zonasConFuego() {
  return fs.readdirSync(path.join(BIN, 'Maps')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((z) => {
    let m; try { m = mapa(z); } catch (e) { return false; }
    const capa = (m.layers || []).find((l) => l.name === 'objetos');
    return !!capa && capa.objects.some((o) => FUEGO.includes(o.name)) && fs.existsSync(path.join(BIN, 'Game', 'MAPAS', z, 'objetos.json'));
  });
}

/** La llama PINTADA del fotograma, medida aquí sin el código del juego: los
    píxeles con el rojo a tope (las llamas del arte son ff9a3a, ff7a2a, ffb04a,
    ffe28a; el oro y la brasa no llegan a 255). En px de pantalla desde el pie. */
function llamaPintada(at, nombre) {
  const f = at.json.frames[nombre], fr = f.frame;
  const pie = f.pivot.y * fr.h, cx = f.pivot.x * fr.w;
  const es = (x, y) => { const p = at.png.rgba(fr.x + x, fr.y + y); return p[3] > 40 && p[0] === 255 && p[2] < 200; };
  const porColumna = new Array(fr.w).fill(0);
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) if (es(x, y)) porColumna[x]++;
  const cols = porColumna.map((n, x) => (n >= 2 ? x : -1)).filter((x) => x >= 0);   // una brasa suelta no es la llama
  let arriba = Infinity, abajo = -Infinity;
  for (let y = 0; y < fr.h; y++) for (const x of cols) if (es(x, y)) { arriba = Math.min(arriba, y); abajo = Math.max(abajo, y + 1); }
  const px = (v) => Math.round(v * ESCALA * 10) / 10;      // el pivote del JSON va redondeado (0.8261 × 23 = 19.0003)
  return { arriba: px(arriba - pie), abajo: px(abajo - pie), izq: px(cols[0] - cx), der: px(cols[cols.length - 1] + 1 - cx) };
}

// ─── Un navegador y una escena de mentira con el atlas de verdad ───
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
function montarZona(zona, opciones) {
  const op = opciones || {};
  const at = op.atlas || atlas(zona);
  const clave = 'zona_' + zona + '_objetos';
  const imagen = { png: at.png, width: at.png.ancho, height: at.png.alto };
  const fotogramas = {};
  for (const [n, f] of Object.entries(at.json.frames)) {
    fotogramas[n] = { name: n, source: { image: imagen }, cutX: f.frame.x, cutY: f.frame.y, cutWidth: f.frame.w, cutHeight: f.frame.h,
                      realWidth: f.sourceSize.w, realHeight: f.sourceSize.h, x: f.spriteSourceSize.x, y: f.spriteSourceSize.y,
                      customPivot: true, pivotX: f.pivot.x, pivotY: f.pivot.y };
  }
  const texturas = new Map([[clave, { frames: fotogramas, has: (n) => n in fotogramas, get: (n) => fotogramas[n] }]]);
  const creados = [];
  const sprite = (x, y, key, frame) => {
    const s = encadenable({
      x, y, key, frame: frame === undefined ? undefined : { name: frame }, ox: 0.5, oy: 0.5, sx: 1, sy: 1, depth: 0, visible: true, alpha: 1, scene: true,
      get scaleX() { return this.sx; }, get scaleY() { return this.sy; },
      setOrigin(a, b) { this.ox = a; this.oy = b === undefined ? a : b; return this; },
      setScale(a, b) { this.sx = a; this.sy = b === undefined ? a : b; return this; },
      setDepth(d) { this.depth = d; return this; }, setAlpha(a) { this.alpha = a; return this; },
      setVisible(v) { this.visible = v; return this; }, setPosition(px, py) { this.x = px; this.y = py; return this; },
      setTexture(k) { this.key = k; return this; }, destroy() { this.scene = null; }
    });
    creados.push(s);
    return s;
  };
  const capaObj = (mapa(zona).layers || []).find((l) => l.name === 'objetos');
  // Lo que la escena DIBUJÓ (ZonasScenes._montarObjetos): a escala 2 con el pie del fotograma.
  // `op.sinDibujar`: los que la escena despeja y no pinta.
  const dibujados = capaObj.objects.filter((o) => fotogramas[o.name] && !(op.sinDibujar || []).includes(o.id)).map((o) => {
    const f = fotogramas[o.name];
    const spr = sprite(o.x, o.y, clave, o.name).setOrigin(f.pivotX, f.pivotY).setScale(ESCALA).setDepth(o.y);
    return { spr, sombra: null, x: o.x, y: o.y, visible: true };
  });
  let alActualizar = null;
  const escena = {
    cfg: { zona, objetos: clave },
    map: { getObjectLayer: (n) => (n === 'objetos' ? capaObj : null) },
    add: new Proxy({}, { get: () => (x, y, key, frame) => sprite(x || 0, y || 0, key, frame) }),
    textures: {
      exists: (k) => texturas.has(k), get: (k) => texturas.get(k), remove: (k) => texturas.delete(k),
      getFrame: (k, n) => (texturas.has(k) && texturas.get(k).frames ? texturas.get(k).frames[n] || null : null),
      createCanvas(k, w, h) { const c = { key: k, width: w, height: h, getContext: () => ctx2d(), refresh() {} }; texturas.set(k, c); return c; }
    },
    events: { once() {}, on(ev, fn) { if (ev === 'update') alActualizar = fn; }, off() {} },
    cameras: { main: { worldView: { x: -1e6, y: -1e6, right: 1e6, bottom: 1e6, width: 2e6, height: 2e6 } } },
    tweens: { killTweensOf() {} },
    time: { delayedCall: () => ({ remove() {} }) },
    sys: { isActive: () => true, settings: {} },
    anims: { exists: () => false },
    _objetosZona: dibujados
  };
  const documento = {
    createElement() {
      let origen = null;
      const canvas = { width: 0, height: 0,
        getContext: () => ({
          drawImage(img, sx, sy, sw, sh) { origen = { img, sx, sy, sw, sh }; },
          getImageData(x0, y0, w, h) {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              const p = origen.img.png.rgba(origen.sx + x0 + x, origen.sy + y0 + y);
              data.set(p, (y * w + x) * 4);
            }
            return { data, width: w, height: h };
          }
        }) };
      return canvas;
    }
  };
  const ctx = { console: { log() {}, warn: console.warn, error: console.error }, Math, Date, JSON, Promise, setTimeout, clearTimeout,
                Object, Array, Number, String, Uint8ClampedArray, document: documento,
                Phaser: { BlendModes: { ADD: 1, MULTIPLY: 2, NORMAL: 0 } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-zonas.js'), 'utf8'), ctx);
  const st = ctx.GFZonas.montar(escena, zona);
  assert.ok(st, zona + ': GFZonas.montar devolvió null');
  return { at, escena, creados, capaObj, actualizar: (t) => alActualizar && alActualizar(t, 16) };
}

/** Las llamas vivas que se pusieron junto al objeto `o`. */
function llamasDe(creados, o) {
  return creados.filter((s) => /^zn_llama_/.test(String(s.key)) && Math.abs(s.x - o.x) < 24 && s.y > o.y - 90 && s.y < o.y + 30);
}

test('el arte: la llama pintada del brasero del volcán está donde se midió (si cambia el dibujo, se vuelve a medir)', () => {
  const m = llamaPintada(atlas('volcan'), 'brasero_volcan');
  // (2026-11-24) Vuelto a medir: los objetos del volcán se dibujan ahora a la escala de GameScene
  // (el brasero, de 14×23 a 18×29). Antes { arriba: -34, abajo: -16, izq: -8, der: 8 }.
  assert.deepEqual(m, { arriba: -45.2, abajo: -21.2, izq: -12, der: 12 });
  assert.deepEqual(llamaPintada(atlas('aldor'), 'brasero_dorado'), { arriba: -45.2, abajo: -21.2, izq: -7, der: 7 });   // (2026-11-24) antes -34/-16/±6
  assert.deepEqual(llamaPintada(atlas('caverna'), 'brasero'), { arriba: -42, abajo: -22, izq: -10, der: 10 });
});

test('en todos los mapas con fuego, la llama viva nace en la pintada y la tapa entera aunque tiemble', () => {
  const zonas = zonasConFuego();
  for (const z of ['aldor', 'caverna', 'glaciar', 'tundra', 'volcan']) assert.ok(zonas.includes(z), 'falta ' + z + ' entre los mapas con fuego');
  for (const zona of zonas) {
    const { at, creados, capaObj, actualizar } = montarZona(zona);
    const fuegos = capaObj.objects.filter((o) => FUEGO.includes(o.name) && at.json.frames[o.name]);
    assert.ok(fuegos.length > 0, zona);
    const peor = {};
    for (let t = 0; t <= 4000; t += 23) {
      actualizar(t);
      for (const o of fuegos) {
        const pintada = llamaPintada(at, o.name);
        const vivas = llamasDe(creados, o);
        assert.equal(vivas.length, 3, zona + ' ' + o.name + ' #' + o.id + ': tres llamas');
        // la del medio, la más alta (la textura zn_llama_* mide 22×30 y su punta queda a 28 px del pie)
        const medio = vivas.reduce((a, b) => (b.sy > a.sy ? b : a));
        const base = medio.y - 1 * medio.sy - o.y;
        const punta = medio.y - 28 * medio.sy - o.y;
        const izq = Math.min(...vivas.map((s) => s.x - 9 * s.sx)) - o.x;
        const der = Math.max(...vivas.map((s) => s.x + 9 * s.sx)) - o.x;
        const id = zona + ' ' + o.name + ' #' + o.id;
        assert.ok(base >= pintada.abajo - 1 && base <= pintada.abajo + 4,
          id + ': la llama viva nace a ' + base.toFixed(1) + ' px del pie y la pintada a ' + pintada.abajo + ' (flota o se hunde)');
        assert.ok(punta <= pintada.arriba - 1, id + ' t=' + t + ': la punta viva (' + punta.toFixed(1) + ') no tapa la pintada (' + pintada.arriba + ')');
        assert.ok(izq <= pintada.izq && der >= pintada.der,
          id + ' t=' + t + ': de ancho no la tapa (' + izq.toFixed(1) + '..' + der.toFixed(1) + ' frente a ' + pintada.izq + '..' + pintada.der + ')');
        peor[id] = true;
      }
    }
    assert.equal(Object.keys(peor).length, fuegos.length, zona);
  }
});

/** El atlas del volcán con el brasero dibujado al DOBLE (como si el arte se
    rehiciera más grande): el mismo pie, cada píxel repetido 2×2. */
function volcanAlDoble() {
  const real = atlas('volcan');
  const f = real.json.frames.brasero_volcan, fr = f.frame, w = fr.w * 2, h = fr.h * 2;
  const png = { ancho: w, alto: h, rgba: (x, y) => (x < w && y < h ? real.png.rgba(fr.x + (x >> 1), fr.y + (y >> 1)) : [0, 0, 0, 0]) };
  const marco = { x: 0, y: 0, w, h };
  const json = { frames: { brasero_volcan: { frame: marco, pivot: f.pivot, rotated: false, trimmed: false,
                                              sourceSize: { w, h }, spriteSourceSize: marco } }, meta: real.json.meta };
  return { json, png };
}

test('si el dibujo del brasero cambia de tamaño, el fuego vivo lo sigue (se mide, no se adivina)', () => {
  const doble = volcanAlDoble();
  const pintada = llamaPintada(doble, 'brasero_volcan');
  assert.deepEqual(pintada, { arriba: -90.4, abajo: -42.4, izq: -24, der: 24 });   // (2026-11-24) el doble de la de arriba
  const { creados, capaObj, actualizar } = montarZona('volcan', { atlas: doble });
  actualizar(500);
  const o = capaObj.objects.find((q) => q.name === 'brasero_volcan');
  const vivas = llamasDe(creados, o);
  assert.equal(vivas.length, 3);
  const medio = vivas.reduce((a, b) => (b.sy > a.sy ? b : a));
  const base = medio.y - medio.sy - o.y;
  assert.ok(base >= pintada.abajo - 1 && base <= pintada.abajo + 4, 'nace a ' + base.toFixed(1) + ' y la pintada a ' + pintada.abajo);
  assert.ok(medio.y - 28 * medio.sy - o.y <= pintada.arriba - 1, 'tapa la punta');
});

test('un brasero que la escena no dibuja (zona despejada) no tiene fuego flotando en el aire', () => {
  const capa = (mapa('volcan').layers || []).find((l) => l.name === 'objetos');
  const braseros = capa.objects.filter((o) => o.name === 'brasero_volcan');
  const quitado = braseros[0];
  const { creados, actualizar, escena } = montarZona('volcan', { sinDibujar: [quitado.id] });
  actualizar(100);
  assert.equal(llamasDe(creados, quitado).length, 0, 'sin brasero no hay llama');
  assert.equal(llamasDe(creados, braseros[1]).length, 3, 'el resto sigue ardiendo');
  const luces = [];
  (escena._lucesNoche || []).forEach((f) => f((x, y) => luces.push({ x, y })));
  assert.equal(luces.filter((l) => l.x === quitado.x && Math.abs(l.y - quitado.y) < 120).length, 0, 'ni luz');
  assert.ok(luces.some((l) => l.x === braseros[1].x), 'el resto sí alumbra');
});

test('la luz de noche de cada fuego cae dentro de su llama', () => {
  for (const zona of zonasConFuego()) {
    const { at, escena, capaObj } = montarZona(zona);
    const luces = [];
    (escena._lucesNoche || []).forEach((f) => f((x, y, r, a) => luces.push({ x, y, r, a })));
    for (const o of capaObj.objects.filter((q) => FUEGO.includes(q.name) && at.json.frames[q.name])) {
      const p = llamaPintada(at, o.name);
      const luz = luces.find((l) => l.x === o.x && l.y >= o.y - 120 && l.y <= o.y + 20);
      assert.ok(luz, zona + ' ' + o.name + ' #' + o.id + ': sin luz');
      assert.ok(luz.y - o.y >= p.arriba && luz.y - o.y <= p.abajo,
        zona + ' ' + o.name + ': la luz a ' + (luz.y - o.y) + ' px y la llama de ' + p.arriba + ' a ' + p.abajo);
    }
  }
});
