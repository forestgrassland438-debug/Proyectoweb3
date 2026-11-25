'use strict';
/* (2026-11-19) "A veces estoy jugando, o salgo de batallas, de otros mapas o de las casas,
 * y regresan a ponerse los NPC anteriores" (Farmer Joe con su dibujo viejo).
 *
 * gf-npcs-pueblo.js pone el NPC nuevo ENCIMA del viejo y deja el viejo casi transparente.
 * Dos huecos lo dejaban a la vista para toda la sesión:
 *   · el arte nuevo tardaba más de 15 s (móvil lento, el mapa cargando mil cosas a la vez):
 *     el módulo se rendía y no volvía a intentarlo, aunque el atlas llegara al segundo 16;
 *   · un NPC original que se volviera a crear no se vestía nunca.
 * Ahora el viejo se oculta mientras llega el arte, se reintenta, se viste lo que se cree
 * después, y SOLO si el arte no llega nunca se enseña el original (para no perder a Joe).
 *
 * El gf-npcs-pueblo.js real contra una escena de mentira con cargador y relojes falsos. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FUENTE = fs.readFileSync(path.join(__dirname, '..', 'gf-npcs-pueblo.js'), 'utf8');

function objeto(x, y) {
  const o = { x, y, alpha: 1, visible: true, depth: 5, originX: 0.5, originY: 1, displayWidth: 40, displayHeight: 80, input: {},
    _oy: {}, scene: true, texture: { key: 'NPCgranjero' }, type: 'Image' };
  o.setAlpha = (a) => { o.alpha = a; return o; };
  o.setOrigin = () => o; o.setScale = () => o; o.setDepth = (d) => { o.depth = d; return o; };
  o.setFrame = () => o; o.setPosition = (a, b) => { o.x = a; o.y = b; return o; }; o.setVisible = (v) => { o.visible = v; return o; };
  o.setTint = () => o; o.clearTint = () => o;
  o.on = (e, f) => { (o._oy[e] = o._oy[e] || []).push(f); return o; }; o.off = () => o; o.once = (e, f) => o.on(e, f);
  o.destroy = () => { o.scene = null; (o._oy.destroy || []).forEach((f) => f()); };
  return o;
}

function montarModulo() {
  const relojes = [];
  let ahora = 0;
  const ctx = {
    console: { warn() {}, log() {} },
    setTimeout: (f, ms) => { const r = { f, en: ahora + ms, vivo: true }; relojes.push(r); return r; },
    clearTimeout: (r) => { if (r) r.vivo = false; },
    Math, Object, Array, JSON
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx);
  const avanzar = (ms) => {
    const hasta = ahora + ms;
    for (;;) {
      const r = relojes.filter((x) => x.vivo && x.en <= hasta).sort((a, b) => a.en - b.en)[0];
      if (!r) break;
      r.vivo = false; ahora = r.en; r.f();
    }
    ahora = hasta;
  };
  return { ctx, avanzar };
}

function escenaFalsa(textures, avanzar) {
  const ev = {}, oyentesCarga = {};
  const pendientes = [];
  const scene = {
    sys: { settings: { key: 'GameScene' } },
    player: { x: 0, y: 0 },
    textures: { exists: (k) => textures.has(k), createCanvas: () => ({ getContext: () => ({ save() {}, scale() {}, createRadialGradient: () => ({ addColorStop() {} }), beginPath() {}, arc() {}, fill() {}, restore() {} }), refresh() {} }) },
    load: {
      atlas: (k) => pendientes.push(k),
      once: (e, f) => { (oyentesCarga[e] = oyentesCarga[e] || []).push(f); },
      off: (e, f) => { oyentesCarga[e] = (oyentesCarga[e] || []).filter((x) => x !== f); },
      start() {},
      _terminar: (llegan) => { for (const k of pendientes.splice(0)) if (llegan) textures.add(k); const fs2 = oyentesCarga.complete || []; oyentesCarga.complete = []; fs2.forEach((f) => f()); }
    },
    add: {
      image: () => objeto(0, 0), text: () => objeto(0, 0), graphics: () => Object.assign(objeto(0, 0), { fillStyle() {}, lineStyle() {}, fillRoundedRect() {}, strokeRoundedRect() {}, fillTriangle() {} }),
      container: () => objeto(0, 0)
    },
    events: { on: (e, f) => { (ev[e] = ev[e] || []).push(f); }, off: (e, f) => { ev[e] = (ev[e] || []).filter((x) => x !== f); }, once: (e, f) => { (ev[e] = ev[e] || []).push(f); } },
    time: { delayedCall: (ms, f) => { let vivo = true; const r = { remove: () => { vivo = false; } }; setTimeout(() => {}, 0); scene._diferidos.push({ ms, f: () => vivo && f() }); return r; } },
    tweens: { add() {}, killTweensOf() {} },
    _diferidos: [],
    _tic: (t) => (ev.update || []).forEach((f) => f(t)),
    _emitir: (e) => (ev[e] || []).slice().forEach((f) => f())
  };
  for (const [k, x] of [['sprite_npc1', 1829], ['sprite_npc2', 3296], ['sprite_npc3', 2400], ['sprite_npc4', 900], ['sprite_npc5', 2290]]) scene[k] = objeto(x, 2283);
  return scene;
}

test('arte lento (más de 15 s): el NPC viejo no se ve mientras llega y se viste cuando llega', () => {
  const { ctx, avanzar } = montarModulo();
  const tex = new Set(['gfnp_sombra']);
  const scene = escenaFalsa(tex, avanzar);
  ctx.GFNpcsPueblo.montar(scene);
  assert.equal(scene.sprite_npc1.alpha, 0.01, 'mientras carga el arte nuevo, el viejo ya no se ve');
  avanzar(16000);                                   // el primer intento se agota…
  scene.load._terminar(true);                       // …y el atlas llega después
  avanzar(5000); scene._tic(1000); avanzar(2000); scene._tic(3000);
  for (const k of ['sprite_npc1', 'sprite_npc2', 'sprite_npc3', 'sprite_npc4', 'sprite_npc5']) {
    assert.equal(scene[k].__gfVestido, true, k + ' vestido aunque el arte llegara tarde');
    assert.equal(scene[k].alpha, 0.01);
  }
});

test('un NPC original que se vuelve a crear se viste también', () => {
  const { ctx, avanzar } = montarModulo();
  const tex = new Set(['gfnp_sombra', 'gfn_joe', 'gfn_jack', 'gfn_colin', 'gfn_rurik', 'gfn_digby']);
  const scene = escenaFalsa(tex, avanzar);
  ctx.GFNpcsPueblo.montar(scene);
  assert.equal(scene.sprite_npc1.__gfVestido, true);
  scene.sprite_npc1.destroy();
  scene.sprite_npc1 = objeto(1829, 2283);           // la escena lo vuelve a crear
  assert.equal(scene.sprite_npc1.alpha, 1);
  scene._tic(5000); avanzar(2000); scene._tic(7000);
  assert.equal(scene.sprite_npc1.__gfVestido, true, 'el recreado se viste');
  assert.equal(scene.sprite_npc1.alpha, 0.01);
});

test('si el arte no llega NUNCA, al final se enseña el original (Joe no desaparece)', () => {
  const { ctx, avanzar } = montarModulo();
  const tex = new Set(['gfnp_sombra']);
  const scene = escenaFalsa(tex, avanzar);
  ctx.GFNpcsPueblo.montar(scene);
  for (let i = 0; i < 20; i++) { avanzar(16000); scene.load._terminar(false); scene._tic(i * 1000); }
  assert.equal(scene.sprite_npc1.__gfVestido, undefined);
  assert.equal(scene.sprite_npc1.alpha, 1, 'tras los reintentos, el original vuelve a verse');
});
