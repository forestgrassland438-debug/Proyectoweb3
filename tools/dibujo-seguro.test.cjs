'use strict';
/* (2026-11-19) gf-dibujo-seguro.js: un objeto cuyo Frame perdió su fuente (textures.remove)
 * se salta al dibujar; el resto del fotograma se dibuja. Con un Phaser de mentira que hace
 * lo mismo que Phaser (frame.glTexture = frame.source.glTexture). La prueba con el Phaser
 * real va en el navegador (ver la verificación de la sesión). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FUENTE = fs.readFileSync(path.join(__dirname, '..', 'gf-dibujo-seguro.js'), 'utf8');

function phaserFalso(dibujados) {
  const render = function (renderer, src) { dibujados.push(src.nombre + ':' + src.frame.source.glTexture); };
  const clase = () => { const C = function () {}; C.prototype.renderWebGL = render; C.prototype.renderCanvas = render; return C; };
  return { GameObjects: { Image: clase(), Sprite: clase(), Text: clase() } };
}

test('el sprite con la textura borrada se salta y los demás se siguen dibujando', () => {
  const dibujados = [], avisos = [];
  const ctx = { console: { warn: (m) => avisos.push(m) } };
  ctx.window = ctx;
  ctx.Phaser = phaserFalso(dibujados);
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx);
  const { Image, Sprite } = ctx.Phaser.GameObjects;
  const mapa = Object.assign(new Image(), { nombre: 'mapa', frame: { source: { glTexture: 't1' } } });
  const roto = Object.assign(new Sprite(), { nombre: 'roto', type: 'Sprite', texture: { key: 'sv_arbol_3' }, frame: { source: null } });
  const lobo = Object.assign(new Sprite(), { nombre: 'lobo', frame: { source: { glTexture: 't2' } } });
  for (let f = 0; f < 3; f++) for (const o of [mapa, roto, lobo]) o.renderWebGL({}, o, {}, null);
  assert.deepEqual(dibujados, ['mapa:t1', 'lobo:t2', 'mapa:t1', 'lobo:t2', 'mapa:t1', 'lobo:t2'], 'el lobo (detrás del roto) se dibuja siempre');
  assert.equal(avisos.length, 1, 'un aviso por textura, no uno por fotograma');
  assert.ok(avisos[0].includes('sv_arbol_3'));
  assert.equal(ctx.GFDibujoSeguro.saltados(), 3);
  // También en Canvas 2D.
  roto.renderCanvas({}, roto, {}, null);
  assert.equal(ctx.GFDibujoSeguro.saltados(), 4);
});

test('los tilesets externos se quitan de la copia en memoria (el mapa del disco no se toca)', () => {
  const ctx = { console: { warn() {} } };
  ctx.window = ctx;
  ctx.Phaser = phaserFalso([]);
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx);
  const mapa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Maps', 'mapa_principal.json'), 'utf8'));
  const embebidos = mapa.tilesets.filter((t) => !t.source).map((t) => t.firstgid);
  const scene = { cache: { tilemap: { get: (k) => (k === 'tilemap' ? { data: mapa } : null) } } };
  assert.equal(ctx.GFDibujoSeguro.sinTilesetsExternos(scene, 'tilemap'), 19);
  assert.deepEqual(mapa.tilesets.map((t) => t.firstgid), embebidos, 'los embebidos siguen igual y en su orden');
  assert.equal(ctx.GFDibujoSeguro.sinTilesetsExternos(scene, 'tilemap'), 0, 'volver a entrar no hace nada');
  assert.equal(ctx.GFDibujoSeguro.sinTilesetsExternos(scene, 'no_existe'), 0);
});

test('un Frame destruido no revienta a quien mire su tamaño (gf-animales, y-sort, límites)', () => {
  const ctx = { console: { warn() {} } };
  ctx.window = ctx;
  ctx.Phaser = phaserFalso([]);
  // Como Phaser 3.90: getters que leen this.data / this.source sin mirar si existen.
  const Frame = function () {};
  Object.defineProperty(Frame.prototype, 'realWidth', { get() { return this.data.sourceSize.w; }, configurable: true });
  Object.defineProperty(Frame.prototype, 'glTexture', { get() { return this.source.glTexture; }, configurable: true });
  Object.defineProperty(Frame.prototype, 'canvasData', { get() { return this.data.drawImage; }, configurable: true });
  ctx.Phaser.Textures = { Frame };
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx);
  const vivo = Object.assign(new Frame(), { data: { sourceSize: { w: 48 }, drawImage: { width: 48 } }, source: { glTexture: 'gl' } });
  const muerto = Object.assign(new Frame(), { data: null, source: null });
  assert.equal(vivo.realWidth, 48); assert.equal(vivo.glTexture, 'gl');
  assert.equal(muerto.realWidth, 0); assert.equal(muerto.glTexture, null); assert.equal(muerto.canvasData.width, 0);
  assert.deepEqual([...ctx.GFDibujoSeguro.framesSeguros], ['glTexture', 'realWidth', 'canvasData']);
});
