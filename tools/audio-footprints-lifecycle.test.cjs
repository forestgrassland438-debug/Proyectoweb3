'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function fixture(file) {
  const timers=new Map(), requests=[];let now=0, serial=0;
  const ctx={console:{log(){},warn(){}},AbortController,Math:Object.create(Math),Date:{now:()=>now},
    setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    fetch(url,options){const d=deferred();requests.push({url,options,...d});return d.promise;}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
  return {ctx,timers,requests,setNow:n=>{now=n;}};
}
function audioScene(shared) {
  const cache=shared?.data || new Map(),sounds=shared?.sounds || [];
  const audio=shared?.cache.audio || {exists:k=>cache.has(k),get:k=>cache.get(k),add:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k),entries:{each(fn){for(const entry of cache)fn(...entry);}}};
  const decodes=[];
  const sound=shared?.sound || Object.assign(new EventEmitter(),{locked:false,sounds,
    context:{sampleRate:48000,decodeAudioData(bytes,resolve,reject){decodes.push({bytes,resolve,reject});}},
    add(key){const s={key,manager:this,isPlaying:false,volume:0,audioBuffer:cache.get(key),pendingRemove:false,
      play(){this.isPlaying=true;return this;},stop(){this.isPlaying=false;return this;},
      setVolume(v){this.volume=v;return this;},setRate(){return this;},setPan(){return this;},
      destroy(){this.pendingRemove=true;this.audioBuffer=null;this.manager=null;this.isPlaying=false;const i=sounds.indexOf(this);if(i>=0)sounds.splice(i,1);}};sounds.push(s);return s;}});
  const scene={sound,cache:{audio},data:cache,sounds,decodes,events:new EventEmitter(),sys:{isActive:()=>true},
    time:{now:0},scene:{key:'test'},player:{x:0,y:0},audioState:{sfxVolumeApplied:1,musicVolumeApplied:1}};
  scene.frame=delta=>{scene.time.now+=delta;scene.events.emit('update',scene.time.now,delta);};
  return scene;
}
function buffer() { return {length:480000,numberOfChannels:1,duration:10}; }
function preload(api,scene,tipo='campo') { for(const name of api._interno.listaDe(tipo))scene.data.set('gfa_'+name,buffer()); }
function footprintScene() {
  const live=new Set();let allocations=0,failAt=Infinity;
  const scene={events:new EventEmitter(),time:{now:0},textures:{exists:()=>true},add:{image(x,y,key){
    if(++allocations===failAt)throw Error('allocation failed');
    const s={x,y,key,active:true,visible:true,alpha:1,scene,
      setVisible(v){this.visible=v;return this;},setAlpha(v){this.alpha=v;return this;},
      setPosition(x,y){this.x=x;this.y=y;return this;},setTexture(k){this.key=k;return this;},
      setDepth(){return this;},setScale(){return this;},setRotation(){return this;},setTint(){return this;},
      destroy(){live.delete(this);this.active=false;this.scene=null;}};live.add(s);return s;}}};
  return {scene,live,failAt:n=>{failAt=n;}};
}

test('footprints expire in creation order even with different random values and terrain changes',()=>{
  const f=fixture('gf-pisadas.js'),s=footprintScene(),api=f.ctx.GFPisadas,st=api.montar(s.scene);
  const prints=[];
  for(let i=0;i<10;i++){
    f.ctx.Math.random=()=>i%2?0:0.999;s.scene.time.now=i*100;st.terreno=i<3?'nieve':'seco';
    api.pisar(s.scene,i*30,50);prints.push(st.huellas.find(h=>h.nace===s.scene.time.now&&h.spr.visible));
  }
  for(let i=1;i<prints.length;i++)assert.ok(prints[i].hasta>=prints[i-1].hasta);
  for(let now=0;now<=10000;now+=100){api._interno.mover(st,now,100);let seenLive=false;for(const h of prints){if(h.spr.visible)seenLive=true;else assert.equal(seenLive,false,'a newer footprint disappeared before an older one');}}
  api.desmontar(s.scene);
});

test('a full footprint pool recycles the oldest marks, including several born in the same frame',()=>{
  const f=fixture('gf-pisadas.js'),s=footprintScene(),api=f.ctx.GFPisadas,st=api.montar(s.scene);f.ctx.Math.random=()=>0.5;
  for(let i=0;i<24;i++)api.pisar(s.scene,i*30,100);
  const positions=st.huellas.map(h=>h.spr.x).sort((a,b)=>a-b);
  assert.deepEqual(Array.from(positions),Array.from({length:22},(_,i)=>(i+2)*30));api.desmontar(s.scene);
});

test('footprints use the scene clock after returning from another scene and water rings start at the feet',()=>{
  const f=fixture('gf-pisadas.js'),s=footprintScene(),api=f.ctx.GFPisadas,st=api.montar(s.scene);f.ctx.Math.random=()=>0.5;
  s.scene.time.now=1000;st.terreno='agua';api.pisar(s.scene,140,250);
  assert.equal(st.motas[0].spr.x,140);assert.equal(st.motas[0].spr.y,250);assert.ok(st.huellas[0].spr.alpha>0);
  s.scene.events.emit('update',100000,16);assert.equal(st.huellas[0].spr.visible,true);
  s.scene.time.now=4000;s.scene.events.emit('update',103000,16);assert.equal(st.huellas[0].spr.visible,false);api.desmontar(s.scene);
});

test('footprints release departed actors, partial allocations and every object when a destructor fails',()=>{
  const f=fixture('gf-pisadas.js'),s=footprintScene(),api=f.ctx.GFPisadas,st=api.montar(s.scene);
  const remote={x:0,y:0,active:true,visible:true,scene:s.scene};s.scene.otherPlayers={one:{sprite:remote}};
  s.scene.events.emit('update',0,16);assert.equal(Object.keys(st.vigilados).length,1);
  s.scene.otherPlayers={};s.scene.events.emit('update',0,16);assert.equal(Object.keys(st.vigilados).length,0);
  const first=st.huellas[0].spr,original=first.destroy;first.destroy=function(){original.call(this);throw Error('destroy callback');};
  api.desmontar(s.scene);api.desmontar(s.scene);assert.equal(s.live.size,0);assert.equal(st.scene,null);assert.equal(s.scene.events.eventNames().length,0);
  const broken=footprintScene();broken.failAt(4);assert.equal(api.montar(broken.scene),null);assert.equal(broken.live.size,0);assert.equal(broken.scene.__gfPisadas,null);
});

test('audio teardown aborts fetches and late decodes cannot restore buffers or retain a departed scene',async()=>{
  const f=fixture('gf-audio.js'),api=f.ctx.GFAudio,s=audioScene(),st=api.montar(s);await flush();assert.equal(f.requests.length,4);
  f.requests[0].resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await flush();assert.equal(s.decodes.length,1);
  api.desmontar(s);assert.equal(st.scene,null);assert.equal(f.timers.size,0);
  for(const r of f.requests)assert.equal(r.options.signal.aborted,true);
  s.decodes[0].resolve(buffer());for(const r of f.requests.slice(1))r.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await flush();
  assert.equal(s.data.size,0);assert.equal(s.decodes.length,1);assert.equal(f.requests.length,4);assert.equal(s.events.eventNames().length,0);
});

test('rain audio loads only when needed, fades out, releases its buffer and reloads on the next rain',async()=>{
  const f=fixture('gf-audio.js'),api=f.ctx.GFAudio,s=audioScene();let rain=false;
  f.ctx.GFClima={estado:()=>({activo:true,lluvia:rain})};s.data.set('gfa_gf_tienda',buffer());const st=api.montar(s,{tipo:'tienda'});
  s.frame(100);await flush();assert.equal(f.requests.length,0);
  rain=true;f.setNow(1000);s.frame(100);await flush();assert.equal(f.requests.length,1);assert.match(f.requests[0].url,/amb_lluvia.wav$/);
  f.requests[0].resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await flush();s.decodes[0].resolve(buffer());await flush();
  for(let i=0;i<25;i++)s.frame(250);const loop=st.bucles.lluvia.son;assert.equal(loop.isPlaying,true);
  rain=false;f.setNow(2000);for(let i=0;i<60;i++)s.frame(250);
  assert.equal(st.bucles.lluvia,undefined);assert.equal(loop.pendingRemove,true);assert.equal(s.data.has('gfa_amb_lluvia'),false);
  rain=true;f.setNow(3000);s.frame(100);await flush();assert.equal(f.requests.length,2);api.desmontar(s);
  assert.equal(s.data.size,0);assert.equal(s.sounds.length,0);assert.equal(f.timers.size,0);
});

test('audio cancellation during rain loading does not mark it missing or repopulate the cache',async()=>{
  const f=fixture('gf-audio.js'),api=f.ctx.GFAudio,s=audioScene();let rain=true;f.ctx.GFClima={estado:()=>({activo:true,lluvia:rain})};
  const st=api.montar(s,{tipo:'tienda'});s.frame(100);await flush();const old=f.requests[0];
  rain=false;f.setNow(1000);s.frame(100);assert.equal(old.options.signal.aborted,true);
  old.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await flush();assert.equal(s.decodes.length,0);assert.equal(st.faltan.gfa_amb_lluvia,undefined);
  rain=true;f.setNow(2000);s.frame(100);await flush();assert.equal(f.requests.length,2);api.desmontar(s);
});

test('twenty audio scene transitions return sounds, buffers, timers and listeners to baseline',()=>{
  const f=fixture('gf-audio.js'),api=f.ctx.GFAudio,s=audioScene();s.sound.locked=true;
  for(let i=0;i<20;i++){
    const tipo=i%2?'tienda':'campo';preload(api,s,tipo);const st=api.montar(s,{tipo});s.frame(100);
    if(i===0){st.tema.stop=()=>{throw Error('broken stop');};}
    s.events.emit('shutdown');assert.equal(s.sounds.length,0);assert.equal(s.data.size,0);assert.equal(f.timers.size,0);
    assert.equal(st.scene,null);assert.equal(s.events.eventNames().length,0);assert.equal(s.sound.listenerCount('unlocked'),0);
  }
});

test('unmounting one scene preserves shared audio still owned by another mounted scene',()=>{
  const f=fixture('gf-audio.js'),api=f.ctx.GFAudio,first=audioScene(),second=audioScene(first);preload(api,first,'tienda');
  api.montar(first,{tipo:'tienda'});api.montar(second,{tipo:'tienda'});second.frame(100);const music=second.__gfAudio.tema;
  api.desmontar(first);assert.equal(first.data.has('gfa_gf_tienda'),true);assert.equal(music.pendingRemove,false);
  api.desmontar(second);assert.equal(first.data.size,0);assert.equal(first.sounds.length,0);
});

test('sound pools discard externally destroyed sounds instead of returning dead voices',()=>{
  const f=fixture('gf-audio.js'),api=f.ctx.GFAudio,s=audioScene();preload(api,s);const st=api.montar(s);
  const old=api._interno.sonar(st,'gfa_rayo_1',{sinSitio:true});old.destroy();
  const next=api._interno.sonar(st,'gfa_rayo_1',{sinSitio:true});assert.notEqual(next,old);assert.equal(next.isPlaying,true);api.desmontar(s);
});
