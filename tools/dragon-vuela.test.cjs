'use strict';
/* EL DRAGÓN DEL VOLCÁN VUELA (2026-11-23).
 * "El dragón en el mundo de lava debería volar." Cindermaw, el jefe del volcán
 * (gf-salvaje.js, ESPECIES.jefe_dragon), andaba por el suelo como un lagarto.
 * Ahora va por el aire batiendo las alas (los fotogramas 'vuela' de su atlas:
 * tools/gf_reinos_bestias.py, dragon_rey.ACCIONES_EXTRA), con la sombra en el
 * suelo, más pequeña y más clara cuanto más alto va; baja en picado para cada
 * acción (su mordisco, sus poderes y los del jefe: sus efectos salen de su
 * cuerpo en el suelo) y vuelve a subir; al morir cae, y al volver vuela otra
 * vez. Lo que recibe los tajos y choca sigue abajo, bajo la sombra.
 *
 *   node --test tools/dragon-vuela.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { leerPNG } = require('./leer-png.cjs');

const BIN = path.resolve(__dirname, '..');
const MONSTRUOS = path.join(BIN, 'Game', 'Sprites', 'monstruos');

function cargar(archivo, extra) {
  const ctx = Object.assign({ console: { log() {}, warn() {}, error: console.error }, Math, Date, JSON, Promise, setTimeout, clearTimeout }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, archivo), 'utf8'), ctx);
  return ctx;
}
const A = cargar('gf-monstruos-arte.js', { Phaser: { Textures: { FilterMode: { NEAREST: 0 } } } }).GFMonstruosArte;
const SV = cargar('gf-salvaje.js', { GFMonstruosArte: A, Phaser: { BlendModes: { ADD: 1, NORMAL: 0 } } });
const I = SV.GFSalvaje._interno;
const DRAGON = I.ESPECIES.jefe_dragon;
const ATLAS = JSON.parse(fs.readFileSync(path.join(MONSTRUOS, 'jefe_dragon.json'), 'utf8'));
const FOTOS = Object.keys(ATLAS.frames);
const VISTAS = ['vuela', 'vuela_abajo', 'vuela_arriba'];

/** Las animaciones que el juego (GFMonstruosArte) hace con estos fotogramas. */
function animaciones(tipo, fotos) {
  const hechas = new Map();
  A._interno.crearAnims({
    textures: { exists: () => true, get: () => ({ has: (f) => fotos.includes(f) }) },
    anims: { exists: (k) => hechas.has(k), create: (c) => { hechas.set(c.key, c); return c; } }
  }, tipo);
  return hechas;
}

/* Un mundo de mentira: los tweens terminan al instante (se aplica su valor
   final), como si hubiera pasado su tiempo. */
const META = new Set(['targets', 'duration', 'ease', 'delay', 'onComplete', 'onUpdate', 'yoyo', 'repeat', 'hold']);
function mundo(def, fotos) {
  const anims = animaciones(def.arte, fotos || FOTOS);
  const escena = { anims: { exists: (k) => anims.has(k) } };
  const nuevo = (x, y, key) => ({
    x, y, key, sx: 1, sy: 1, alpha: 1, depth: 0, visible: true, flipX: false, scene: escena, tocando: null,
    anims: { isPlaying: false, stop() { this.isPlaying = false; } },
    setScale(a, b) { this.sx = a; this.sy = b === undefined ? a : b; return this; },
    setPosition(px, py) { this.x = px; this.y = py; return this; }, setDepth(d) { this.depth = d; return this; },
    setAlpha(a) { this.alpha = a; return this; }, setVisible(v) { this.visible = v; return this; },
    setFlipX(f) { this.flipX = f; return this; }, setOrigin() { return this; }, setOriginFromFrame() { return this; },
    setTint() { return this; }, clearTint() { return this; }, setRotation() { return this; }, setBlendMode() { return this; },
    setColor(c) { this.style.color = c; return this; }, style: { color: '' },
    play(k) { this.tocando = k; this.anims.isPlaying = true; return this; },
    clear() { return this; }, fillStyle() { return this; }, fillRect() { return this; },
    destroy() { this.scene = null; }
  });
  const scene = {
    time: { now: 10000, delayedCall() { return { remove() {} }; } },
    add: { image: nuevo, graphics: () => nuevo(0, 0, 'g'), text: (x, y) => nuevo(x, y, 'txt'), ellipse: (x, y) => nuevo(x, y, 'e') },
    tweens: {
      add(c) {
        const quienes = [].concat(c.targets);
        for (const o of quienes) for (const k of Object.keys(c)) {
          if (META.has(k) || typeof c[k] !== 'number') continue;
          if (k === 'scale') { o.sx = o.sy = c[k]; } else o[k] = c[k];
        }
        if (c.onComplete) c.onComplete({}, quienes);
        return { stop() {}, remove() {} };
      },
      addCounter() {}, killTweensOf() {}
    },
    player: { x: 99999, y: 99999 },                       // lejos: ni le pegan ni pega
    map: { widthInPixels: 1e6, heightInPixels: 1e6 }
  };
  const st = { scene, vivo: true, proyectiles: [], efimeros: [], charcos: [], bichos: [], ultimoGolpe: 0 };
  const m = {
    id: 'x', tipo: 'x', n: 0, def, x: 2000, y: 2000, casa: { x: 2000, y: 2000 }, vida: def.vida, max: def.vida, vivo: true,
    estado: 'paseo', dir: 'right', anim: null, accionNombre: 'quieto', accion: null, fase: 0.7, heridoEn: 0, muertoHasta: 0,
    spr: nuevo(2000, 2000, def.arte), sombra: nuevo(2000, 2000, 'gfsv_sombra').setScale(def.sombra).setAlpha(0.85)
  };
  st.bichos.push(m);
  let t = scene.time.now;
  /** Pasa `ms` de juego a 60 fps (colocar, como el bucle) y da lo alto que fue. */
  const pasar = (ms) => {
    const altos = [];
    for (let fin = t + ms; t < fin;) { t += 16; scene.time.now = t; I.colocar(st, m, t); altos.push(m.y - m.spr.y); }
    return altos;
  };
  const alto = () => m.y - m.spr.y;
  return { st, m, scene, anims, pasar, alto, ahora: () => t };
}

test('el arte: su atlas trae el vuelo en sus tres vistas, y el juego hace con él sus animaciones', () => {
  for (const v of VISTAS) for (let n = 1; n <= 4; n++) assert.ok(FOTOS.includes(v + '_' + n), 'jefe_dragon.json: ' + v + '_' + n);
  const png = leerPNG(path.join(MONSTRUOS, 'jefe_dragon.png'));
  assert.deepEqual([png.ancho, png.alto], [ATLAS.meta.size.w, ATLAS.meta.size.h], 'el PNG y su JSON son de la misma tirada');
  const hechas = animaciones('jefe_dragon', FOTOS);
  for (const v of VISTAS) {
    const a = hechas.get(A.anim('jefe_dragon', v));
    assert.ok(a, 'la animación ' + v);
    assert.equal(a.frames.length, 4, v + ': sus cuatro aletazos');
    assert.equal(a.repeat, -1, v + ': sin parar');
  }
  // Con un atlas viejo (sin el vuelo) no nace una animación vacía: tumbaría el bucle.
  const viejas = animaciones('jefe_dragon', FOTOS.filter((f) => !f.startsWith('vuela')));
  assert.ok(!viejas.has(A.anim('jefe_dragon', 'vuela')));
  assert.ok(viejas.has(A.anim('jefe_dragon', 'camina')), 'y lo de siempre sigue');
});

test('vuela alto, con su sombra en el suelo más pequeña y más clara; ya en el aire desde que aparece', () => {
  assert.ok(DRAGON.vuela >= 48, 'una altura de vuelo de verdad (' + DRAGON.vuela + '); los murciélagos flotan a 8 px');
  const w = mundo(DRAGON);
  const primero = w.pasar(16)[0];
  assert.ok(primero >= DRAGON.vuela - 10, 'nace en el aire, no despega delante de nadie (' + primero + ')');
  w.pasar(1000);
  const altos = w.pasar(2500);
  const bajo = Math.min(...altos), alto = Math.max(...altos);
  assert.ok(bajo >= DRAGON.vuela - 10 && alto <= DRAGON.vuela + 10, 'a su altura (' + bajo.toFixed(1) + '..' + alto.toFixed(1) + ')');
  assert.ok(alto - bajo >= 4, 'y se mece al batir las alas, no va clavado');
  const { m } = w;
  assert.equal(m.spr.depth, m.y, 'se ordena por donde está en el suelo, como todo');
  assert.ok(Math.abs(m.sombra.y - m.y) <= 4 && m.sombra.x === m.x, 'la sombra, en el suelo bajo él');
  assert.ok(m.sombra.sx < DRAGON.sombra * 0.8, 'más pequeña que en el suelo (' + m.sombra.sx.toFixed(2) + ' de ' + DRAGON.sombra + ')');
  assert.ok(m.sombra.alpha < 0.7, 'y más clara (' + m.sombra.alpha.toFixed(2) + ')');
});

test('baja en picado para cada acción (su mordisco o un poder del jefe) y luego vuelve a subir', () => {
  const w = mundo(DRAGON), { m } = w;
  w.pasar(1500);
  // Su mordisco (cuerpoACuerpo: la animación de ataque y su acción).
  I.animar(m, 'ataque');
  m.accion = { hasta: w.ahora() + 520, cada() {} };
  const picado = w.pasar(400);
  const tBajar = picado.findIndex((h) => h <= 6) * 16;
  assert.ok(w.alto() <= 6, 'muerde en el suelo (' + w.alto().toFixed(1) + ')');
  assert.equal(m.spr.tocando, A.anim('jefe_dragon', 'ataque'), 'con su mordisco');
  m.accion = null;
  const subida = w.pasar(1500);
  const tSubir = subida.findIndex((h) => h >= DRAGON.vuela - 10) * 16;
  assert.ok(w.alto() >= DRAGON.vuela - 10, 'y vuelve al aire (' + w.alto().toFixed(1) + ')');
  assert.ok(tBajar >= 0 && tSubir >= tBajar * 1.5, 'baja en picado (' + tBajar + ' ms) y sube despacio (' + tSubir + ' ms)');
  // Un poder del jefe (gf-jefes.js): solo pone su acción. También en el suelo,
  // que sus orbes y su onda salen de su cuerpo.
  m.accion = { hasta: w.ahora() + 900, cada() {} };
  w.pasar(500);
  assert.ok(w.alto() <= 6, 'para sus poderes, también abajo (' + w.alto().toFixed(1) + ')');
  // Y si una acción lo deja quieto en el suelo, está de pie: no aletea en tierra.
  m.anim = null; I.animar(m, 'quieto');
  assert.equal(m.spr.tocando, A.anim('jefe_dragon', 'quieto'), 'de pie en el suelo');
});

test('en el aire bate las alas (en sus tres vistas); lo que viaja por la red no cambia', () => {
  const w = mundo(DRAGON), { m } = w;
  w.pasar(1200);
  I.animar(m, 'camina');
  assert.equal(m.spr.tocando, A.anim('jefe_dragon', 'vuela'), 'volando de lado');
  assert.equal(m.accionNombre, 'camina', 'la foto del anfitrión solo sabe quieto/camina/ataque (ACCIONES)');
  m.dir = 'down'; m.anim = null; I.animar(m, 'camina');
  assert.equal(m.spr.tocando, A.anim('jefe_dragon', 'vuela_abajo'), 'de frente');
  m.dir = 'up'; m.anim = null; I.animar(m, 'quieto');
  assert.equal(m.spr.tocando, A.anim('jefe_dragon', 'vuela_arriba'), 'de espaldas, y quieto en el aire también aletea');
  // Con un atlas viejo en la caché (sin el vuelo), anda como antes: no se congela.
  const v = mundo(DRAGON, FOTOS.filter((f) => !f.startsWith('vuela')));
  v.pasar(1200);
  I.animar(v.m, 'camina');
  assert.equal(v.m.spr.tocando, A.anim('jefe_dragon', 'camina'));
});

test('su barra de vida y su nombre suben con él', () => {
  const w = mundo(DRAGON), { m } = w;
  w.pasar(1500);
  m.estado = 'caza';
  I.pintarBarra(w.st, m);
  assert.ok(m.nombre && m.nombre.visible, 'se ve su nombre');
  const sobreLaCabeza = m.y - w.alto() - DRAGON.cabeza;
  assert.ok(m.nombre.y <= sobreLaCabeza, 'encima de su cabeza en el aire (' + (m.nombre.y - m.y) + ' frente a ' + (sobreLaCabeza - m.y).toFixed(1) + ')');
});

test('al morir cae al suelo; al volver, vuela otra vez', () => {
  const w = mundo(DRAGON), { m } = w;
  w.pasar(1500);
  I.morir(w.st, m, null);
  assert.equal(m.vivo, false);
  assert.ok(Math.abs(m.spr.y - m.y) < 0.5, 'cae: no se queda colgado en el aire (' + (m.y - m.spr.y) + ')');
  assert.equal(m.spr.alpha, 0, 'y se desvanece como los demás');
  assert.equal(m.sombra.sx, DRAGON.sombra, 'su sombra, ya en el suelo, a su tamaño');
  I.revivir(w.st, m);
  const vuelta = w.pasar(16)[0];
  assert.ok(vuelta >= DRAGON.vuela - 10, 'vuelve ya en el aire, como cuando aparece (' + vuelta.toFixed(1) + ')');
  w.pasar(1000);
  assert.ok(w.alto() >= DRAGON.vuela - 10, 'y sigue volando (' + w.alto().toFixed(1) + ')');
});

test('los que no vuelan siguen igual: el gorila en el suelo, el murciélago a ras', () => {
  const g = mundo(I.ESPECIES.jefe_gorila);
  g.pasar(800);
  assert.equal(g.alto(), 0, 'el gorila, en el suelo');
  assert.equal(g.m.sombra.sx, I.ESPECIES.jefe_gorila.sombra);
  assert.equal(g.m.sombra.alpha, 0.85, 'su sombra, como siempre');
  const b = mundo(I.ESPECIES.murcielago_gigante);
  const altos = b.pasar(3000);
  assert.ok(Math.min(...altos) >= 3 && Math.max(...altos) <= 13, 'el murciélago flota a 8±5 px, como antes');
  assert.ok(!I.ESPECIES.murcielago_gigante.vuela && !I.ESPECIES.jefe_gorila.vuela);
});
