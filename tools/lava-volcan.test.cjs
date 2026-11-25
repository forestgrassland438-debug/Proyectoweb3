'use strict';
/* LA LAVA DEL VOLCÁN ES LA DE LA MINA (2026-11-24).
 * "La lava no es igual a la de la mina de lv2." La de la mina es un tileset
 * ANIMADO (seis fotogramas a seis por segundo: se cambia la imagen del
 * tileset) con sus piezas de borde a medida, burbujas que revientan y luz; la
 * del volcán era un degradado pintado QUIETO en el suelo. Ahora el mapa lleva
 * una capa 'lava' con la misma lava (tools/gf_lava_mina.py, que llama
 * tools/generar-reinos.py) y gf-reinos.js la monta y la mueve como la mina.
 *
 * Lo que se fija aquí:
 *   · los datos: la capa cubre TODA la lava que choca (también la del río que
 *     sale por el borde sur), cada casilla de 32 va donde Phaser 3.90 la
 *     dibuja (y eso se fija también en vendor/phaser.min.js), las piezas de
 *     dentro son las rodeadas de lava y van en el orden del parche, el ritmo
 *     es el de LIQUIDOS_MINA, las hojas están extruidas, el labio no tiembla,
 *     lo de dentro corre, los colores son los de la mina y, debajo, el suelo
 *     pintado lleva el primer fotograma en el MISMO sitio;
 *   · el juego (gf-reinos.js de verdad, la escena de mentira): qué pide, cómo
 *     monta la capa, que la mueve a 6 por segundo, burbujas solo en la lava de
 *     dentro que se ve, la luz de noche sobre toda la lava, y que al salir (o
 *     si no llegan las hojas) no queda nada ni se rompe nada.
 *
 *   node --test tools/lava-volcan.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { leerPNG } = require('./leer-png.cjs');

const BIN = path.resolve(__dirname, '..');
const T = 16;                    // la casilla de los mapas de los reinos
const A = 32;                    // la del arte de la mina
const PARCHE = 16;               // el parche de la lava: 16 x 16 piezas (512 px)
const REINOS = ['puerto', 'pantano', 'aldor', 'colinas', 'selva', 'volcan', 'hongos'];

const _mapas = new Map();
/** El mapa de un reino, con su capa de lava, su tileset, sus propiedades y las casillas de lava que chocan. */
function mapa(zona) {
  if (_mapas.has(zona)) return _mapas.get(zona);
  const m = JSON.parse(fs.readFileSync(path.join(BIN, 'Maps', zona + '.json'), 'utf8'));
  const n = m.width;
  const capa = m.layers.find((l) => l.name === 'lava') || null;
  const ts = m.tilesets.find((t) => t.name === 'lava_' + zona) || null;
  const props = Object.fromEntries((m.properties || []).map((p) => [p.name, p.value]));
  const choque = new Set();
  for (const l of m.layers) {
    if (l.name !== 'colisiones') continue;
    for (const o of l.objects) {
      if (o.name !== 'lava') continue;
      const x0 = Math.round(o.x / T), y0 = Math.round(o.y / T), w = Math.round(o.width / T), h = Math.round(o.height / T);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) choque.add(x + ',' + y);
    }
  }
  const tiles = [];
  if (capa && ts) capa.data.forEach((gid, k) => { if (gid) tiles.push({ gid, i: gid - ts.firstgid, cx: k % n, cy: Math.floor(k / n) }); });
  const r = { m, n, capa, ts, props, choque, tiles };
  _mapas.set(zona, r);
  return r;
}

/** Dónde DIBUJA Phaser 3.90 una casilla de 32 de una capa de rejilla 16: desde la
 *  esquina de arriba a la izquierda de su casilla (Tile.updatePixelXY: pixelY =
 *  y * 16, sin el ajuste "abajo a la izquierda" de Tiled; el render la pinta en
 *  pixelY - tileOffset.y, y este tileset no lleva desplazamiento). */
function dibujada(t) {
  const x = t.cx * T, y = t.cy * T;
  return { x, y, r: x + A, b: y + A };
}

/** El tile `i` de una hoja extruida (margen 1, separación 2, 16 columnas): su esquina. */
function enHoja(i) { return { x: 1 + (i % 16) * (A + 2), y: 1 + Math.floor(i / 16) * (A + 2) }; }

const _hojas = new Map();
function hoja(ruta) {
  if (!_hojas.has(ruta)) _hojas.set(ruta, leerPNG(path.join(BIN, ruta)));
  return _hojas.get(ruta);
}

// ════════════════════════════════════════════════════════════════════ LOS DATOS

test('Phaser 3.90 dibuja una casilla más grande que la rejilla desde la esquina de arriba a la izquierda de la suya', () => {
  // Si se cambia de Phaser y esto deja de ser así, la lava (y la mina) se dibujan
  // en otro sitio: hay que volver a mirar tools/gf_lava_mina.py (poner, pintar_en).
  const src = fs.readFileSync(path.join(BIN, 'vendor', 'phaser.min.js'), 'utf8');
  assert.ok(src.includes('this.pixelX=this.x*this.baseWidth,this.pixelY=this.y*this.baseHeight'),
    'Tile.updatePixelXY (ortogonal): pixelY = y * alto de la rejilla, sin ajuste por el alto del tile');
  assert.ok(src.includes('var b=.5*T,S=.5*w') && src.includes('L=y.tileOffset.y') &&
            src.includes('f+m.pixelY*v+(S*v-L),T,w,p,v,m.rotation,m.flipX,m.flipY,u,c,b,S,'),
    'WebGL: centro en pixelY + alto/2 - tileOffset.y con el origen en el centro (arriba = pixelY)');
  assert.ok(src.includes('f.translate(g.pixelX+b,g.pixelY+S)') && src.includes('f.drawImage(y,x.x,x.y,T,w,-b,-S,T,w)'),
    'Canvas: lo mismo (arriba a la izquierda en pixelX, pixelY)');
});

test('la capa cubre toda la lava que choca (también la que sale por el borde del mapa) y cada casilla de 32 va en la rejilla de 32', () => {
  const L = mapa('volcan');
  assert.ok(L.capa && L.ts, 'el volcán lleva su capa "lava" y su tileset "lava_volcan"');
  assert.equal(L.capa.type, 'tilelayer');
  assert.deepEqual([L.capa.width, L.capa.height, L.capa.data.length], [L.n, L.n, L.n * L.n], 'del tamaño del mapa');
  assert.deepEqual([L.ts.tilewidth, L.ts.tileheight, L.ts.margin, L.ts.spacing, L.ts.columns], [A, A, 1, 2, 16]);
  assert.equal(L.ts.tileoffset, undefined, 'sin desplazamiento');
  assert.ok(L.choque.size > 1000, 'hay lava que choca (' + L.choque.size + ' casillas)');
  const malas = L.tiles.filter((t) => t.cx % 2 || t.cy % 2);
  assert.deepEqual(malas.slice(0, 5).map((t) => [t.cx, t.cy]), [],
    malas.length + ' casillas fuera de la rejilla de 32: Phaser las dibujaría 16 px corridas de su lava');
  for (const t of L.tiles) assert.ok(t.i >= 0 && t.i < L.ts.tilecount, 'gid ' + t.gid + ' dentro del tileset');
  const cubiertas = new Set();
  for (const t of L.tiles) {
    const d = dibujada(t);
    for (let y = d.y; y < d.b; y += T) for (let x = d.x; x < d.r; x += T) cubiertas.add(x / T + ',' + y / T);
  }
  const sin = [...L.choque].filter((c) => !cubiertas.has(c));
  assert.deepEqual(sin.slice(0, 8), [], sin.length + ' casillas de lava que choca sin lava dibujada encima');
  // Y ninguna sale de la nada: cada casilla de 32 tiene debajo lava que choca.
  const sueltas = L.tiles.filter((t) => {
    const d = dibujada(t);
    for (let y = d.y; y < d.b; y += T) for (let x = d.x; x < d.r; x += T) if (L.choque.has(x / T + ',' + y / T)) return false;
    return true;
  });
  assert.deepEqual(sueltas.map((t) => [t.cx, t.cy]), [], 'casillas de lava donde no hay lava');
});

test('las piezas de dentro son las rodeadas de lava y van en el orden del parche (el dibujo sigue sin costuras)', () => {
  const L = mapa('volcan');
  const g = new Set(L.tiles.map((t) => t.cx / 2 + ',' + t.cy / 2));
  let dentro = 0;
  for (const t of L.tiles) {
    const ax = t.cx / 2, ay = t.cy / 2;
    let rodeada = true;
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
      if (!g.has((ax + dx) + ',' + (ay + dy))) rodeada = false;
    }
    assert.equal(t.i < L.props.lava_interior, rodeada, 'casilla (' + ax + ', ' + ay + '): ' + (rodeada ? 'rodeada y con pieza de borde' : 'en la orilla y con pieza de dentro'));
    if (rodeada) {
      dentro++;
      assert.equal(t.i, (ay % PARCHE) * PARCHE + (ax % PARCHE), 'la pieza del parche que le toca a (' + ax + ', ' + ay + ')');
    }
  }
  assert.ok(dentro > 200, 'hay lava de dentro (' + dentro + ')');
});

test('se mueve como la de la mina: seis fotogramas a seis por segundo (LIQUIDOS_MINA), con el parche de 16x16', () => {
  const L = mapa('volcan');
  const mina = fs.readFileSync(path.join(BIN, 'Scenes', 'MinaScene.js'), 'utf8');
  const q = mina.match(/LIQUIDOS_MINA\s*=\s*\{\s*lava:\s*\{\s*fotogramas:\s*(\d+),\s*fps:\s*(\d+)/);
  assert.ok(q, 'MinaScene.js define LIQUIDOS_MINA.lava');
  assert.equal(L.props.lava_fotogramas, Number(q[1]));
  assert.equal(L.props.lava_fps, Number(q[2]));
  assert.equal(L.props.lava_interior, PARCHE * PARCHE);
});

test('las seis hojas: del tamaño que dice el mapa, extruidas, el labio quieto y lo de dentro que corre', () => {
  const L = mapa('volcan');
  const F = L.props.lava_fotogramas;
  const hs = [];
  for (let f = 0; f < F; f++) hs.push(hoja('Game/MAPAS/volcan/lava_' + f + '.png'));
  assert.ok(!fs.existsSync(path.join(BIN, 'Game/MAPAS/volcan/lava_' + F + '.png')), 'ni una hoja de más');
  const filas = Math.ceil(L.ts.tilecount / 16);
  for (const h of hs) {
    assert.deepEqual([h.ancho, h.alto, h.canales], [L.ts.imagewidth, L.ts.imageheight, 4]);
    assert.deepEqual([h.ancho, h.alto], [2 + 16 * (A + 2) - 2, 2 + filas * (A + 2) - 2], 'margen 1 y separación 2');
  }
  const usados = [...new Set(L.tiles.map((t) => t.i))].sort((a, b) => a - b);
  // Extruidas: el borde de cada tile, repetido un píxel por fuera (lo de MinaScene._extruirTileset).
  for (const i of usados.filter((_, k) => k % 29 === 0)) {
    const o = enHoja(i), h = hs[i % F];
    for (let k = 0; k < A; k++) {
      assert.deepEqual(h.rgba(o.x + k, o.y - 1), h.rgba(o.x + k, o.y), 'tile ' + i + ': arriba');
      assert.deepEqual(h.rgba(o.x + k, o.y + A), h.rgba(o.x + k, o.y + A - 1), 'tile ' + i + ': abajo');
      assert.deepEqual(h.rgba(o.x - 1, o.y + k), h.rgba(o.x, o.y + k), 'tile ' + i + ': izquierda');
      assert.deepEqual(h.rgba(o.x + A, o.y + k), h.rgba(o.x + A - 1, o.y + k), 'tile ' + i + ': derecha');
    }
  }
  const pix = (h, i, x, y) => { const o = enHoja(i); return h.rgba(o.x + x, o.y + y); };
  // El labio de basalto (el alfa de las piezas de borde) es el mismo en todos: la orilla no tiembla.
  for (const i of usados.filter((v) => v >= L.props.lava_interior)) {
    for (let y = 0; y < A; y += 2) for (let x = 0; x < A; x += 2) {
      const a0 = pix(hs[0], i, x, y)[3];
      for (let f = 1; f < F; f++) assert.equal(pix(hs[f], i, x, y)[3], a0, 'pieza de borde ' + i + ': el labio cambia en el fotograma ' + f);
    }
  }
  // Lo de dentro es opaco y corre: cada fotograma cambia respecto del anterior (y el último, respecto del primero).
  const dentro = usados.filter((v) => v < L.props.lava_interior);
  for (let f = 0; f < F; f++) {
    const sig = (f + 1) % F;
    let cambian = 0, total = 0;
    for (const i of dentro) {
      for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
        const p = pix(hs[f], i, x, y), q2 = pix(hs[sig], i, x, y);
        assert.equal(p[3], 255);
        total++;
        if (p[0] !== q2[0] || p[1] !== q2[1] || p[2] !== q2[2]) cambian++;
      }
    }
    assert.ok(cambian / total > 0.04, 'del fotograma ' + f + ' al ' + sig + ' corre la lava (' + (100 * cambian / total).toFixed(1) + ' % de píxeles)');
  }
});

test('con los colores de la mina: la lava de dentro sale de su misma paleta', () => {
  const L = mapa('volcan');
  const F = L.props.lava_fotogramas;
  const clave = (p) => p[0] + ',' + p[1] + ',' + p[2];
  const deMina = new Set();
  for (let f = 0; f < F; f++) {
    const h = hoja('Game/MAPAS/Mina/tileset_lava_' + f + '.png');
    // El parche de la mina (8x8) son sus 64 primeros tiles, sin extruir: 16 columnas de 32.
    for (let i = 0; i < 64; i++) {
      for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
        const p = h.rgba((i % 16) * A + x, Math.floor(i / 16) * A + y);
        if (p[3] === 255) deMina.add(clave(p));
      }
    }
  }
  const delVolcan = new Set();
  const dentro = [...new Set(L.tiles.map((t) => t.i))].filter((v) => v < L.props.lava_interior);
  for (let f = 0; f < F; f++) {
    const h = hoja('Game/MAPAS/volcan/lava_' + f + '.png');
    for (const i of dentro) {
      const o = enHoja(i);
      for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) delVolcan.add(clave(h.rgba(o.x + x, o.y + y)));
    }
  }
  const ajenos = [...delVolcan].filter((c) => !deMina.has(c));
  assert.deepEqual(ajenos, [], 'colores que la lava de la mina no tiene');
  assert.ok(delVolcan.size >= 6, 'y usa la paleta (' + delVolcan.size + ' de ' + deMina.size + ')');
});

test('debajo, en el suelo pintado, el primer fotograma en el MISMO sitio: sin la capa se ve la misma lava, quieta', () => {
  const L = mapa('volcan');
  const meta = JSON.parse(fs.readFileSync(path.join(BIN, 'recortadas_volcan', 'mapa.json'), 'utf8'));
  assert.equal(meta.version, L.props.version, 'el suelo es el de este mapa');
  const W = meta.width;
  const trozos = new Map();
  const enSuelo = (x, y) => {
    const t = meta.tiles.find((q) => x >= q.x && x < q.x + q.width && y >= q.y && y < q.y + q.height);
    if (!trozos.has(t.id)) trozos.set(t.id, leerPNG(path.join(BIN, 'recortadas_volcan', 'hd', t.lods.hd.fallback)));
    return trozos.get(t.id).rgba(x - t.x, y - t.y);
  };
  const h0 = hoja('Game/MAPAS/volcan/lava_0.png');
  let mirados = 0;
  const distintos = [];
  for (const t of L.tiles.filter((_, k) => k % 17 === 0)) {
    const d = dibujada(t), o = enHoja(t.i);
    for (let y = 0; y < A; y += 3) {
      for (let x = 0; x < A; x += 3) {
        if (d.x + x >= W || d.y + y >= W) continue;
        const p = h0.rgba(o.x + x, o.y + y);
        if (p[3] !== 255) continue;
        mirados++;
        const s = enSuelo(d.x + x, d.y + y);
        if (s[0] !== p[0] || s[1] !== p[1] || s[2] !== p[2]) distintos.push([d.x + x, d.y + y, p.slice(0, 3).join(','), s.slice(0, 3).join(',')]);
      }
    }
  }
  assert.ok(mirados > 3000, 'se miran bastantes píxeles (' + mirados + ')');
  assert.deepEqual(distintos.slice(0, 6), [], distintos.length + ' píxeles del suelo distintos del fotograma 0 en su sitio');
});

test('la escena pide los mapas nuevos: REINOS_V no es más viejo que ninguno de los siete', () => {
  const src = fs.readFileSync(path.join(BIN, 'Scenes', 'ReinosScenes.js'), 'utf8');
  const v = (src.match(/const REINOS_V = '(\w+)'/) || [])[1];
  assert.ok(v, 'Scenes/ReinosScenes.js define REINOS_V');
  for (const z of REINOS) {
    const version = mapa(z).props.version;
    assert.ok(v >= version, z + ': el mapa es ' + version + ' y la escena lo pide con ?v=' + v + ' (se quedaría el de la caché)');
  }
});

// ════════════════════════════════════════════════════════════════════ EL JUEGO

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
/** Un azar con semilla (las pruebas salen siempre igual). */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** El volcán montado con gf-reinos.js de verdad; el mapa, el de verdad; Phaser, de mentira. */
function escenaVolcan(op = {}) {
  const L = mapa('volcan');
  const creados = [], cargas = [], cambios = [];
  const texturas = new Map(), anims = new Map();
  const reloj = { ms: 0 };
  const llamadas = { tileset: null, ts: null, capa: null, capaObj: null, arranques: 0 };
  const vista = { x: 2000, y: 2000, width: 640, height: 360 };
  const avisar = op.warn || (() => {});
  let alCompletar = [], alActualizar = null;
  const sprite = (x, y, key) => {
    const s = encadenable({
      x, y, key, alpha: 1, visible: true, scene: true, depth: 0, anim: null, desde: 0,
      setDepth(d) { this.depth = d; return this; },
      setVisible(v) { this.visible = v; return this; },
      setAlpha(a) { this.alpha = a; return this; },
      setPosition(px, py) { this.x = px; this.y = py === undefined ? this.y : py; return this; },
      play(k) { this.anim = k; this.desde = reloj.ms; return this; },
      get anims() { const yo = this; return { get isPlaying() { return !!yo.anim && reloj.ms - yo.desde < 6 / 9 * 1000; } }; },
      destroy() { this.scene = null; }
    });
    creados.push(s);
    return s;
  };
  const escena = {
    add: new Proxy({}, { get: () => (x, y, a, b, key) => sprite(x || 0, y || 0, typeof a === 'string' ? a : key) }),
    textures: {
      exists: (k) => texturas.has(k),
      get: (k) => texturas.get(k) || { key: '__MISSING', setFilter() {} },
      remove: (k) => texturas.delete(k),
      createCanvas(k, w, h) { const c = { key: k, width: w, height: h, getContext: () => ctx2d(), refresh() {}, setFilter() {} }; texturas.set(k, c); return c; }
    },
    load: {
      image(k, url) { cargas.push({ tipo: 'image', k, url }); },
      spritesheet(k, url, cfg) { cargas.push({ tipo: 'spritesheet', k, url, cfg }); },
      once(ev, fn) { if (ev === 'complete') alCompletar.push(fn); },
      off(ev, fn) { if (ev === 'complete') alCompletar = alCompletar.filter((f) => f !== fn); },
      start() { llamadas.arranques++; }
    },
    anims: {
      exists: (k) => anims.has(k), remove: (k) => anims.delete(k), create(c) { anims.set(c.key, c); return c; },
      generateFrameNumbers(k, o) { const r = []; for (let f = o.start; f <= o.end; f++) r.push({ key: k, frame: f }); return r; }
    },
    events: { once() {}, on(ev, fn) { if (ev === 'update') alActualizar = fn; }, off(ev, fn) { if (ev === 'update' && alActualizar === fn) alActualizar = null; } },
    cameras: { main: { get worldView() { return { x: vista.x, y: vista.y, width: vista.width, height: vista.height, right: vista.x + vista.width, bottom: vista.y + vista.height }; }, shake() {}, width: 1280, height: 720 } },
    cfg: { version: '20261124a', zona: 'volcan' },
    tweens: { killTweensOf() {} },
    time: { delayedCall: () => ({ remove() {} }) },
    map: {
      properties: L.m.properties,
      getLayer: (nombre) => (nombre === 'lava' && !op.sinCapa ? { name: 'lava' } : null),
      getObjectLayer(nombre) { const l = L.m.layers.find((x) => x.name === nombre && x.type === 'objectgroup'); return l ? { objects: l.objects } : null; },
      addTilesetImage(nombre, clave, tw, th, mg, sp) {
        llamadas.tileset = { nombre, clave, tw, th, mg, sp };
        // Como Phaser 3.90: sin la textura avisa y devuelve null.
        if (!texturas.has(clave)) { avisar('Texture key "' + clave + '" not found'); return null; }
        llamadas.ts = { name: nombre, firstgid: L.ts.firstgid, tileWidth: tw, tileHeight: th, tileOffset: { x: 0, y: 0 }, image: texturas.get(clave),
                        setImage(tex) { this.image = tex; cambios.push(tex.key); return this; } };
        return llamadas.ts;
      },
      createLayer(nombre, ts, x, y) {
        llamadas.capa = { nombre, ts, x, y };
        if (nombre !== 'lava' || !ts) return null;
        llamadas.capaObj = encadenable({
          scene: true, depth: 0,
          setDepth(d) { this.depth = d; return this; },
          destroy() { this.scene = null; },
          // Como Phaser: también las vacías (índice -1), con pixelX/pixelY de la rejilla de 16.
          forEachTile(cb) {
            const n = L.n, d = L.capa.data;
            for (let k = 0; k < d.length; k++) {
              const cx = k % n, cy = Math.floor(k / n);
              cb({ index: d[k] || -1, x: cx, y: cy, pixelX: cx * T, pixelY: cy * T });
            }
          }
        });
        return llamadas.capaObj;
      }
    }
  };
  const mates = Object.create(Math);
  mates.random = azar(op.semilla || 7);
  const ctx = {
    console: { log() {}, warn: avisar, error: console.error }, Math: mates, Date, JSON, Object, Array, Number, String,
    Phaser: { BlendModes: { ADD: 1, NORMAL: 0, MULTIPLY: 2 }, Textures: { FilterMode: { NEAREST: 1, LINEAR: 0 } } },
    GFCiclo: { oscuridad: () => 0 },
    GFZonas: { _interno: { ahoraServidor: () => 1000 * 1000 } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-reinos.js'), 'utf8'), ctx);
  const montar = () => { const st = ctx.GFReinos.montar(escena, 'volcan'); assert.ok(st, 'el volcán se monta'); return st; };
  const st = montar();
  return {
    L, st, ctx, escena, vista, cargas, cambios, texturas, anims, llamadas, montar,
    /** El cargador termina: llegan todas las texturas pedidas menos `faltan`. */
    completar(faltan = []) {
      for (const c of cargas) if (!faltan.includes(c.k)) texturas.set(c.k, { key: c.k, filtro: null, setFilter(m) { this.filtro = m; } });
      const fns = alCompletar; alCompletar = [];
      fns.forEach((f) => f());
    },
    esperando: () => alCompletar.length,
    tic(ms = 1000 / 60) { reloj.ms += ms; if (alActualizar) alActualizar(reloj.ms, ms); },
    burbujas: (todas) => creados.filter((s) => s.key === 'rn_lava_burbuja' && (todas || s.scene)),
    desmontar: () => ctx.GFReinos.desmontar(escena),
    montado: () => !!ctx.GFReinos._interno.estado(escena)
  };
}

test('al entrar en el volcán pide sus seis hojas de lava y la de burbujas de la mina, con la versión del mapa', () => {
  const E = escenaVolcan();
  const lavas = E.cargas.filter((c) => c.k.startsWith('rn_lava_volcan_'));
  assert.deepEqual(lavas.map((c) => [c.tipo, c.k, c.url]),
    [0, 1, 2, 3, 4, 5].map((f) => ['image', 'rn_lava_volcan_' + f, './Game/MAPAS/volcan/lava_' + f + '.png?v=20261124a']));
  const b = E.cargas.find((c) => c.k === 'rn_lava_burbuja');
  assert.ok(b, 'pide la hoja de burbujas');
  assert.deepEqual([b.tipo, b.url, b.cfg.frameWidth, b.cfg.frameHeight], ['spritesheet', './Game/MAPAS/Mina/lava_burbuja.png?v=20261124a', 32, 32]);
  assert.ok(E.llamadas.arranques >= 1, 'arranca la carga (la escena ya está en marcha)');
  for (const c of [...lavas, b]) assert.ok(fs.existsSync(path.join(BIN, c.url.replace(/^\.\//, '').replace(/\?.*$/, ''))), 'existe ' + c.url);
  assert.equal(E.llamadas.tileset, null, 'hasta que lleguen no se monta nada');
});

test('cuando llegan, la capa va con el tileset extruido, por encima del suelo y por debajo de las sombras', () => {
  const E = escenaVolcan();
  E.completar();
  assert.deepEqual(E.llamadas.tileset, { nombre: 'lava_volcan', clave: 'rn_lava_volcan_0', tw: 32, th: 32, mg: 1, sp: 2 });
  assert.deepEqual([E.llamadas.capa.nombre, E.llamadas.capa.x, E.llamadas.capa.y], ['lava', 0, 0]);
  const d = E.llamadas.capaObj.depth;
  assert.ok(d > 0 && d < 2, 'encima del suelo pintado (-1) y de la capa de casillas (0), debajo de las sombras (2) y de lo que está de pie (' + d + ')');
  for (let f = 0; f < 6; f++) assert.equal(E.texturas.get('rn_lava_volcan_' + f).filtro, 1, 'sin suavizar (NEAREST), como la mina');
});

test('la lava corre a seis fotogramas por segundo cambiando la imagen del tileset, y da la vuelta', () => {
  const E = escenaVolcan();
  E.completar();
  for (let i = 0; i < 60; i++) E.tic(1000 / 60);
  assert.ok(E.cambios.length >= 5 && E.cambios.length <= 7, 'en un segundo, ' + E.cambios.length + ' cambios de imagen');
  assert.deepEqual(E.cambios.slice(0, 6), [1, 2, 3, 4, 5, 0].map((f) => 'rn_lava_volcan_' + f));
  const antes = E.cambios.length;
  E.tic(5000);                    // la pestaña vuelve de estar oculta: el delta llega enorme
  assert.ok(E.cambios.length - antes <= 1, 'un salto de 5 s no recorre los fotogramas de golpe');
});

test('las burbujas (ocho, como en la mina) revientan en la lava de dentro que se ve, nunca en el labio ni fuera de la vista', () => {
  const E = escenaVolcan();
  E.completar();
  assert.equal(E.burbujas().length, 8);
  const anim = E.anims.get('rn_lava_burbuja_anim');
  assert.ok(anim, 'su animación');
  assert.deepEqual([anim.frames.length, anim.frameRate, anim.repeat], [6, 9, 0], 'la de la mina: seis a 9 por segundo, una vez');
  const dentro = E.L.tiles.filter((t) => t.i < E.L.props.lava_interior).map(dibujada);
  const labio = E.L.tiles.filter((t) => t.i >= E.L.props.lava_interior).map(dibujada);
  // La vista, en la orilla de un lago: que se vean a la vez lava de dentro y labio
  // (la casilla de labio con más lava de dentro alrededor).
  const enVista = (lista, x, y) => lista.filter((r) => r.x > x && r.r < x + 640 && r.y > y && r.b < y + 360).length;
  let mejor = null, cuenta = -1;
  for (const r of labio.filter((_, k) => k % 7 === 0)) {
    const n = Math.min(enVista(dentro, r.x - 320, r.y - 180), enVista(labio, r.x - 320, r.y - 180) * 4);
    if (n > cuenta) { cuenta = n; mejor = r; }
  }
  E.vista.x = mejor.x - 320; E.vista.y = mejor.y - 180;
  const v = { x: E.vista.x, y: E.vista.y, r: E.vista.x + E.vista.width, b: E.vista.y + E.vista.height };
  assert.ok(enVista(dentro, v.x, v.y) >= 20 && enVista(labio, v.x, v.y) >= 10,
    'la vista tiene lava de dentro (' + enVista(dentro, v.x, v.y) + ') y labio (' + enVista(labio, v.x, v.y) + ')');
  const sitios = new Set();
  let vistas = 0;
  for (let i = 0; i < 600; i++) {
    E.tic(1000 / 60);
    for (const b of E.burbujas()) {
      if (!b.visible) continue;
      vistas++;
      sitios.add(Math.round(b.x) + ',' + Math.round(b.y));
      assert.ok(dentro.some((r) => b.x >= r.x + 8 && b.x <= r.r - 8 && b.y >= r.y + 8 && b.y <= r.b - 8),
        'burbuja en (' + b.x.toFixed(1) + ', ' + b.y.toFixed(1) + '): fuera de la lava de dentro');
      assert.ok(b.x > v.x - 32 && b.x < v.r + 32 && b.y > v.y - 32 && b.y < v.b + 32, 'burbuja fuera de la vista');
      assert.equal(b.anim, 'rn_lava_burbuja_anim');
      assert.ok(b.depth > E.llamadas.capaObj.depth && b.depth < 2, 'encima de la lava, debajo de las sombras');
    }
  }
  assert.ok(sitios.size >= 8, 'salen en sitios distintos (' + sitios.size + ')');
  assert.ok(vistas > 300, 'y se ven (' + vistas + ' fotogramas-burbuja en 10 s)');
  // Lejos de la lava no sale ninguna.
  E.vista.x = 4300; E.vista.y = 300;
  const lejos = { x: 4300, y: 300, r: 4940, b: 660 };
  assert.ok(!dentro.some((r) => r.r > lejos.x - 40 && r.x < lejos.r + 40 && r.b > lejos.y - 40 && r.y < lejos.b + 40), 'la vista de control no tiene lava');
  for (let i = 0; i < 180; i++) E.tic(1000 / 60);
  for (let i = 0; i < 240; i++) {
    E.tic(1000 / 60);
    assert.equal(E.burbujas().filter((b) => b.visible).length, 0, 'sin lava a la vista, ninguna burbuja');
  }
});

test('de noche la lava alumbra: luces sobre la lava que la cubren entera', () => {
  const E = escenaVolcan();
  E.completar();
  assert.ok(Array.isArray(E.escena._lucesNoche) && E.escena._lucesNoche.length === 1, 'deja su función de luces para gf-ciclo-dia');
  const luces = [];
  E.escena._lucesNoche[0]((x, y, r, a) => luces.push({ x, y, r, a }));
  const rects = E.L.tiles.map(dibujada);
  assert.ok(luces.length > 20 && luces.length < E.L.tiles.length / 4, luces.length + ' luces para ' + E.L.tiles.length + ' casillas');
  for (const l of luces) {
    assert.ok(rects.some((r) => l.x >= r.x && l.x < r.r && l.y >= r.y && l.y < r.b), 'luz en (' + l.x + ', ' + l.y + ') fuera de la lava');
    assert.ok(l.r >= 120 && l.a > 0.3 && l.a <= 1, 'una luz que se nota (r ' + l.r + ', a ' + l.a + ')');
  }
  const aOscuras = rects.filter((r) => !luces.some((l) => Math.hypot(l.x - (r.x + 16), l.y - (r.y + 16)) <= 0.65 * l.r));
  assert.deepEqual(aOscuras.slice(0, 5).map((r) => [r.x, r.y]), [], aOscuras.length + ' casillas de lava sin una luz cerca');
});

test('al salir no queda nada de la lava: ni la capa, ni las burbujas, ni su luz, ni sus hojas, ni su animación', () => {
  const E = escenaVolcan();
  E.completar();
  for (let i = 0; i < 30; i++) E.tic();
  const luz = E.escena._lucesNoche[0];
  E.desmontar();
  assert.equal(E.llamadas.capaObj.scene, null, 'la capa, destruida');
  assert.ok(E.burbujas(true).length === 8 && E.burbujas(true).every((b) => b.scene === null), 'las burbujas, destruidas');
  assert.ok(!E.escena._lucesNoche.includes(luz), 'su luz, fuera');
  for (let f = 0; f < 6; f++) assert.ok(!E.texturas.has('rn_lava_volcan_' + f), 'la hoja ' + f + ', soltada');
  assert.ok(!E.texturas.has('rn_lava_burbuja'), 'la de burbujas, soltada');
  assert.ok(!E.anims.has('rn_lava_burbuja_anim'), 'su animación, quitada (las animaciones son del juego)');
  const n = E.cambios.length;
  E.tic();
  assert.equal(E.cambios.length, n, 'el bucle ya no la mueve');
});

test('si se sale antes de que lleguen las hojas, al llegar no se monta nada', () => {
  const E = escenaVolcan();
  assert.equal(E.esperando(), 1);
  E.desmontar();
  assert.equal(E.esperando(), 0, 'se suelta la espera de la carga');
  E.completar();
  assert.equal(E.llamadas.tileset, null);
});

test('en la segunda visita (Phaser reusa la escena) vuelve a cargar, con una animación nueva y una sola luz', () => {
  const E = escenaVolcan();
  E.completar();
  const anim1 = E.anims.get('rn_lava_burbuja_anim');
  E.desmontar();
  E.cargas.length = 0;
  E.montar();
  assert.equal(E.cargas.filter((c) => c.k.startsWith('rn_lava')).length, 7, 'vuelve a pedir las siete hojas (se soltaron al salir)');
  E.completar();
  const anim2 = E.anims.get('rn_lava_burbuja_anim');
  assert.ok(anim2 && anim2 !== anim1, 'la animación se rehace con la textura nueva');
  assert.equal(E.escena._lucesNoche.length, 1, 'una sola función de luz');
  const n = E.cambios.length;
  for (let i = 0; i < 60; i++) E.tic();
  assert.ok(E.cambios.length - n >= 5, 'y corre');
});

test('un mapa sin capa de lava (uno viejo en la caché) no pide nada ni falla', () => {
  const E = escenaVolcan({ sinCapa: true });
  assert.equal(E.cargas.filter((c) => c.k.startsWith('rn_lava')).length, 0);
  for (let i = 0; i < 60; i++) E.tic();
  assert.ok(E.montado(), 'el volcán sigue montado (ceniza, brasas, vapor)');
});

test('si las hojas no llegan (un 404), queda la lava pintada: ni capa, ni aviso, ni se apaga el volcán', () => {
  const avisos = [];
  const E = escenaVolcan({ warn: (...a) => avisos.push(a.map(String).join(' ')) });
  E.completar([0, 1, 2, 3, 4, 5].map((f) => 'rn_lava_volcan_' + f).concat('rn_lava_burbuja'));
  assert.equal(E.llamadas.capa, null, 'sin hojas no hay capa');
  for (let i = 0; i < 60; i++) E.tic();
  assert.ok(E.montado(), 'el volcán sigue montado');
  assert.deepEqual(avisos, []);
});
