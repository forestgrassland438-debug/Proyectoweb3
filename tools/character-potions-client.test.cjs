'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
function fixture() {
  let resolve, uses = 0, syncs = 0;
  const response = new Promise(r => { resolve = r; });
  const events = new EventEmitter(), timers = new Set();
  const scene = { events, playerName: 'Tester', notifications: {show(){}}, _sincronizarInventarioConLaCadena: async () => { syncs++; } };
  const context = { window: { GFMascota: { api: route => { if (route === '/api/alchemist/use') { uses++; return response; } return Promise.resolve({ok:false}); } } }, document: {visibilityState:'visible'}, setInterval: fn => {timers.add(fn);return fn;}, clearInterval: fn => timers.delete(fn), console };
  vm.runInNewContext(fs.readFileSync('gf-character-skills.js','utf8'),context);
  return { scene, context, response, resolve, timers, uses:()=>uses, syncs:()=>syncs };
}
test('double tapping a player potion confirms once and refreshes authoritative inventory and vitals', async () => {
  const f = fixture(), api = f.context.window.GFCharacterSkills;
  const a = api.usePotion(f.scene,'pocion_vida'), b = api.usePotion(f.scene,'pocion_vida');
  assert.equal(a,b); assert.equal(f.uses(),1);
  f.resolve({ok:true,datos:{ok:true,stats:{vida:100,agua:80,comida:90}}});
  assert.equal(await a,true); assert.equal(f.syncs(),1); assert.equal(f.scene.vidaPorcentaje,100);
  f.scene.events.emit('shutdown'); assert.equal(f.timers.size,0); assert.equal(f.scene.events.listenerCount('destroy'),0);
});
test('a potion reply after leaving the scene cannot overwrite the next scene HUD',async()=>{
  const f=fixture(), pending=f.context.window.GFCharacterSkills.usePotion(f.scene,'pocion_antidoto');
  f.scene.events.emit('shutdown'); f.context.window.playerStats={vida:30};
  f.resolve({ok:true,datos:{ok:true,stats:{vida:100,agua:100,comida:100}}});
  assert.equal(await pending,false); assert.equal(f.context.window.playerStats.vida,30); assert.equal(f.syncs(),0);
});
