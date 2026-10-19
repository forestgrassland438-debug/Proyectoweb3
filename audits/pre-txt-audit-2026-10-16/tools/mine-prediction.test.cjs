'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('mine attacks anticipate coordinate based walking without anticipating teleports or motion into a wall',()=>{
  const window={};vm.runInNewContext(fs.readFileSync('gf-mina-serpiente.js','utf8'),{window,console});
  const velocity=window.GFMinaSerpiente._interno.velocidadJugador;
  const scene={player:{x:4,y:2,body:{velocity:{x:0,y:0}}},previousPosition:{x:0,y:0},speed:240,game:{loop:{delta:20}}};
  assert.deepEqual({...velocity(scene)},{x:200,y:100});
  scene.previousPosition={x:4,y:2};scene._rawMoveDx=1;
  assert.deepEqual({...velocity(scene)},{x:0,y:0});
  scene.player.x=1000;assert.deepEqual({...velocity(scene)},{x:0,y:0});
});
