'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../Scenes/MenuScene.js'), 'utf8') + '\nMenuScene;';
function scene(storage) {
  const Menu = vm.runInNewContext(source, { Phaser: { Scene: class {} }, localStorage: storage });
  return Object.create(Menu.prototype);
}
test('missing menu music and unavailable storage still produce usable volume values', () => {
  const sc = scene({ getItem() { throw new Error('storage disabled'); } });
  assert.doesNotThrow(() => sc.loadVolumeSettings());
  assert.equal(sc.musicVolume, 1); assert.equal(sc.sfxVolume, 1);
});
test('invalid saved volumes cannot send NaN, Infinity or out-of-range values to audio', () => {
  for (const [saved, expected] of [['NaN',0.5],['Infinity',0.5],['2',1],['-1',0],['',0.5],['0',0]]) {
    const sc = scene({ getItem: () => saved }); let applied;
    sc.musica = { volume: 0.5, setVolume: value => { applied = value; } };
    sc.loadVolumeSettings(); assert.equal(applied, expected); assert.ok(Number.isFinite(sc.sfxVolume));
  }
});
