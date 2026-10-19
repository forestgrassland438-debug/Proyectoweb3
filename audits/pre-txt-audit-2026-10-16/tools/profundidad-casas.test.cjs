'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(document = {}) {
  const context = { window: {}, console, document };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../gf-profundidad.js'), 'utf8'), context);
  return context.window.GFProfundidad;
}
test('un hueco entre dos alas usa la columna sólida más cercana', () => {
  const p = load();
  const scene = { _idxColision: {}, _chocaConEscenario: (x, y) =>
    (x < 30 && y > 50 && y < 151) || (x >= 62 && y > 50 && y < 91) };
  const cols = p._interno.sondearColumnas(scene, { x: 0, y: 0, alto: 180, abajo: 180, ancho: 100, der: 100 });
  assert.ok(cols.find(c => c.x === 51).y < 100, 'la mitad derecha del hueco debe pertenecer al ala alta');
  assert.ok(cols.find(c => c.x === 35).y > 140, 'la mitad izquierda conserva el ala baja');
});
test('casa L real: la fachada derecha se ordena por encima de la izquierda', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, 'casa-l-perfil.json'), 'utf8').replace(/^\uFEFF/, ''));
  const data = new Uint8Array(profile.width * profile.height * 4);
  profile.profile.forEach((y, x) => { if (y >= 0) data[(y * profile.width + x) * 4 + 3] = 255; });
  const p = load({ createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) }) }) });
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../Maps/mapa_principal.json')));
  const house = map.layers.find(l => l.name === 'casa_npc').objects.find(o => o.name === 'casa_L');
  const rects = map.layers.filter(l => l.objects && /area_colision_general|area_entrada/.test(l.name)).flatMap(l => l.objects);
  const s = { x: house.x, y: house.y, width: profile.width, height: profile.height,
    displayWidth: house.width, displayHeight: house.height, originX: 0, originY: 1, texture: { key: 'casa_L' }, getData: k => k === 'isBuilding' };
  const scene = { _idxColision: {}, textures: { get: () => ({ getSourceImage: () => profile }) },
    _chocaConEscenario: (x, y, w, h) => rects.some(r => x < r.x+r.width && x+w > r.x && y < r.y+r.height && y+h > r.y) };
  const cols = p._interno.sondearColumnas(scene, { x: house.x, y: house.y-house.height,
    ancho: house.width, alto: house.height, der: house.x+house.width, abajo: house.y }, s);
  const strips = p._interno.franjasDe(cols);
  assert.ok(strips && strips.length >= 3);
  const right = strips.find(f => f.desde <= 1800 && f.hasta >= 1800);
  const left = strips.find(f => f.desde <= 1450 && f.hasta >= 1450);
  assert.ok(left.y - right.y > 80);
  assert.ok(right.y < 3180, 'un jugador con pies en 3180 delante del ala derecha debe ser visible');
});
