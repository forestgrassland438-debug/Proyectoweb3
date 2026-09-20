'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../phaser-rpg-perf.js'), 'utf8');
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
function deferred() { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}; }
function fixture(extra={}) {
 let id=1, now=0; const timers=new Map(), storage=new Map(); const context=new EventEmitter();
 context.addEventListener=context.on.bind(context);context.removeEventListener=context.off.bind(context);
 Object.assign(context,{ console:{log(){},warn(){},error(){}}, Map,Set,WeakMap,WeakSet,Promise,AbortController,Uint8Array,TextEncoder,TextDecoder,
 navigator:{userAgent:'test',deviceMemory:8,hardwareConcurrency:8}, performance:{now:()=>now}, Phaser:{VERSION:'3.90.0'},
 setTimeout(fn){const n=id++;timers.set(n,fn);return n},clearTimeout(n){timers.delete(n)},setInterval(fn){const n=id++;timers.set(n,fn);return n},clearInterval(n){timers.delete(n)},
 btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
 localStorage:{setItem(k,v){storage.set(k,v)},getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)}, ...extra });
 context.window=context;vm.createContext(context);vm.runInContext(source,context);
 return {context,api:context.PhaserRPGPerf,timers,storage,setTime:n=>{now=n}};
}
function object() {
 const obj=new EventEmitter();Object.assign(obj,{active:true,visible:true,scene:{},body:{enable:true},destroyCount:0,
 setActive(v){this.active=v;return this},setVisible(v){this.visible=v;return this},setPosition(x,y){this.x=x;this.y=y;return this},setOrigin(){return this},setDepth(){return this},setAlpha(){return this},setScale(){return this},setScrollFactor(){return this},setRotation(){return this},
 destroy(){this.destroyCount++;this.emit('destroy');this.scene=null;this.active=false;this.removeAllListeners()}});return obj;
}
function chunkScene() { const containers=[];return {events:new EventEmitter(),containers,add:{container(){const o=object();containers.push(o);return o}}}; }
function layerScene() {
 const textures=new Map(), targets=[], images=[];let fail=false;
 const scene={events:new EventEmitter(),textures:{get:k=>textures.get(k),remove(k){textures.delete(k)}},make:{renderTexture(){const rt=object();Object.assign(rt,{draw(){if(fail)throw new Error('drawing failed')},saveTexture(k){this.saved=true;this.key=k;textures.set(k,{source:[{width:32,height:32}]})}});targets.push(rt);return rt}},add:{image(){const image=object();images.push(image);return image}}};
 const layer=object();Object.assign(layer,{tilemap:{tileWidth:16,tileHeight:16},layer:{width:2,height:2},x:0,y:0});
 return {scene,layer,textures,targets,images,setFail:v=>{fail=v}};
}

test('vault shares exactly one key initialization across concurrent callers and destroys late keys', async()=>{
 const key=deferred();let calls=0;const f=fixture({crypto:{subtle:{generateKey(){calls++;return key.promise}},getRandomValues:a=>a}});
 const vault=new f.api.SecureVault();const a=vault._init(), b=vault._init();assert.equal(a,b);assert.equal(calls,1);
 vault.destroy();key.resolve({});await a;assert.equal(vault.sessionKey,null);assert.equal(vault.encryptionEnabled,false);
});
test('encrypted writes fail closed without crypto while explicit preferences survive new instances', async()=>{
 const f=fixture();const v=new f.api.SecureVault();assert.equal(await v.set('secret',{secret:'test'},{persist:true}),false);assert.equal(f.storage.size,0);
 assert.equal(await v.set('prefs',{quality:'low'},{persist:true,allowPlaintext:true}),true);
 const next=new f.api.SecureVault();assert.equal((await next.get('prefs',{persist:true,allowPlaintext:true})).quality,'low');
 assert.equal(await new f.api.SecureVault().get('prefs',{persist:true}),undefined);v.destroy();next.destroy();
});
test('late encrypted writes cannot resurrect removed settings or overwrite a newer write',async()=>{
 const encryptions=[];const f=fixture({crypto:{subtle:{generateKey:async()=>({}),encrypt(){const d=deferred();encryptions.push(d);return d.promise}},getRandomValues:a=>a}});
 const v=new f.api.SecureVault();await v._init();const old=v.set('k',{v:1},{persist:true});await flush();const newer=v.set('k',{v:2},{persist:true});await flush();
 encryptions[1].resolve(new Uint8Array([2]).buffer);assert.equal(await newer,true);const kept=f.storage.get('__perf_vault_k');
 encryptions[0].resolve(new Uint8Array([1]).buffer);assert.equal(await old,false);assert.equal(f.storage.get('__perf_vault_k'),kept);
 const late=v.set('removed',{v:3},{persist:true});await flush();v.removePersisted('removed');encryptions[2].resolve(new Uint8Array([3]).buffer);assert.equal(await late,false);assert.equal(f.storage.has('__perf_vault_removed'),false);
});
test('texture cache borrows shared textures, preserves same-key reinsertion and rejects oversized entries',()=>{
 const f=fixture();const data=new Map();let removed=0;const scene={textures:{get:k=>data.get(k),remove(k){removed++;data.delete(k)}}};
 const cache=new f.api.SmartTextureCache(scene,1), tex={source:[{width:256,height:256}]};data.set('shared',tex);
 assert.equal(cache.addTexture('shared',tex),true);cache.addTexture('shared',tex);assert.equal(cache.currentSize,262144);assert.equal(removed,0);
 assert.equal(cache.addTexture('too-big',{source:[{width:1024,height:1024}]}),false);cache.destroy();assert.equal(removed,0);assert.equal(data.get('shared'),tex);
});
test('owned texture eviction never removes a replacement texture installed by another owner',()=>{
 const f=fixture();let destroyed=0,removed=0;const original={source:[{width:8,height:8}],destroy(){destroyed++}},replacement={};
 const cache=new f.api.SmartTextureCache({textures:{get:()=>replacement,remove(){removed++}}},1);
 cache.addTexture('a',original,{owned:true});cache.destroy();assert.equal(removed,0);assert.equal(destroyed,1);
});
test('shrinking a pool retains every active object and disables dormant physics bodies',async()=>{
 const f=fixture(), pool=new f.api.PoolManager({});const entry=await pool.createPool('actors',object,4);
 assert.equal(entry.arr.every(o=>o.body.enable===false),true);const a=pool.spawn('actors',0,0),b=pool.spawn('actors',1,1);
 pool.resizePool('actors',1);assert.equal(entry.arr.includes(a),true);assert.equal(entry.arr.includes(b),true);assert.equal(entry.arr.length,2);
 pool.despawn(a);pool.resizePool('actors',1);assert.equal(a.destroyCount,1);assert.equal(b.destroyCount,0);pool.destroy();assert.equal(b.destroyCount,1);
 assert.equal(await pool.createPool('new',object,1),null);
});
test('pools reject unbounded sizes and do not mutate foreign objects',async()=>{
 const f=fixture(),pool=new f.api.PoolManager({});assert.equal(await pool.createPool('bad',object,Infinity),null);
 const foreign=object();pool.despawn(foreign);assert.equal(foreign.active,true);assert.equal(pool.resizePool('bad',NaN),false);pool.destroy();
});
test('culling restores original physics/visibility on remove, disable and destroy',()=>{
 const f=fixture(),scene={events:new EventEmitter()},cull=new f.api.AdvancedCullManager(scene);
 for(const mode of ['remove','disable','destroy']){
  const target=object();target.body.enable=false;cull.add(target);const data=cull.targets.get(target);cull._updateVisibility(data,false);assert.equal(target.active,false);
  if(mode==='remove')cull.remove(target);else if(mode==='disable')cull.setEnabled(false);else cull.destroy();
  assert.equal(target.visible,true);assert.equal(target.active,true);assert.equal(target.body.enable,false);
  if(mode==='disable'){cull.remove(target);cull.setEnabled(true)}
 }
 assert.equal(scene.events.listenerCount('update'),0);
});
test('culling releases a destroyed target and does not enable initially hidden objects',()=>{
 const f=fixture(),cull=new f.api.AdvancedCullManager({events:new EventEmitter()}),target=object();target.visible=false;target.active=false;
 cull.add(target);const data=cull.targets.get(target);cull._updateVisibility(data,false);cull._updateVisibility(data,true);assert.equal(target.visible,false);assert.equal(target.active,false);
 target.destroy();assert.equal(cull.targets.size,0);cull.destroy();
});
test('layer refresh releases old GPU owners, preserves original hidden state and rolls back failed redraws',()=>{
 const f=fixture(),l=layerScene(),cache=new f.api.SmartLayerCache(l.scene);l.layer.visible=false;
 const first=cache.cacheTilemapLayer(l.layer);assert.ok(first);const next=cache.refresh(l.layer);assert.ok(next);assert.notEqual(first.rt,next.rt);assert.equal(first.rt.destroyCount,1);assert.equal(l.textures.size,1);
 l.setFail(true);assert.equal(cache.refresh(l.layer),null);assert.equal(cache.cache.get(l.layer),next);assert.equal(l.targets.at(-1).destroyCount,1);assert.equal(l.textures.size,1);
 cache.uncache(l.layer);assert.equal(l.layer.visible,false);assert.equal(l.textures.size,0);assert.equal(next.rt.destroyCount,1);cache.destroy();
});
test('layer size validation prevents unbounded allocations and target destruction releases the cache',()=>{
 const f=fixture(),l=layerScene(),cache=new f.api.SmartLayerCache(l.scene);l.layer.layer.width=Infinity;assert.equal(cache.cacheTilemapLayer(l.layer),null);assert.equal(l.targets.length,0);
 l.layer.layer.width=2;cache.cacheTilemapLayer(l.layer);l.layer.destroy();assert.equal(cache.cache.size,0);assert.equal(l.textures.size,0);cache.destroy();
});
test('late chunk failure after unload cannot remove a fresh chunk with the same coordinates',async()=>{
 const f=fixture(),scene=chunkScene(),manager=new f.api.DynamicChunkManager(scene,null),requests=[];
 manager.setProvider((x,y,container,map,signal)=>{const d=deferred();requests.push({...d,signal});return d.promise});
 const first=manager.loadChunk(0,0);assert.equal(manager.loadChunk(0,0),first);manager.unloadChunk(0,0);const next=manager.loadChunk(0,0);
 assert.equal(requests[0].signal.aborted,true);requests[0].reject(new Error('late failure'));await flush();assert.equal(await first,null);assert.equal(manager.loaded.size,1);
 requests[1].resolve();assert.equal(await next,scene.containers[1]);assert.equal(manager.stats.totalLoaded,1);manager.destroy();assert.equal(scene.containers.every(c=>c.destroyCount===1),true);
});
test('chunk destroy cancels retry delays and pending throttle work without creating another container',async()=>{
 const f=fixture(),scene=chunkScene(),manager=new f.api.DynamicChunkManager(scene,null);manager.setProvider(()=>{throw new Error('failure')});manager._updateBound();
 const pending=manager.loadChunk(0,0);await flush();assert.ok(f.timers.size>0);manager.destroy();await flush();assert.equal(await pending,null);assert.equal(f.timers.size,0);assert.equal(scene.containers.length,1);assert.equal(manager.scene,null);
});
test('chunk radius and dimensions remain finite when configuration is invalid',()=>{
 const f=fixture(),manager=new f.api.DynamicChunkManager(chunkScene(),{tileWidth:NaN,tileHeight:Infinity},{chunkRadius:Infinity,chunkSizeTiles:-1});
 assert.equal(Number.isFinite(manager.chunkW),true);assert.equal(manager.opt.chunkRadius,2);manager.destroy();
});
test('external emitter destruction releases maps and cleanup lets stopped particles drain',()=>{
 const f=fixture(),emitter=object();emitter.emitting=true;let alive=2;emitter.getAliveParticleCount=()=>alive;emitter.stop=()=>{emitter.emitting=false};
 const pool=new f.api.EnhancedParticlePool({add:{particles:()=>emitter}});pool.createEmitter('fire',{});pool.stopEmitter(emitter);assert.equal(pool.cleanupInactiveEmitters(),0);
 alive=0;assert.equal(pool.cleanupInactiveEmitters(),1);assert.equal(pool.emitters.size,0);assert.equal(pool.configs.size,0);
 const e2=object();e2.emitting=true;pool.scene.add.particles=()=>e2;pool.createEmitter('rain',{});e2.destroy();assert.equal(pool.configs.size,0);assert.equal(pool.activeEmitters.size,0);pool.destroy();assert.equal(e2.destroyCount,1);
});
test('retry disposal settles waits, circuit breaker stops retrying and metrics maps are bounded',async()=>{
 const f=fixture(),recovery=new f.api.ErrorRecoverySystem();let calls=0;
 const outcome=recovery.executeWithRetry(()=>{calls++;throw new Error('bad')}).catch(e=>e);await flush();recovery.destroy();assert.equal((await outcome).name,'AbortError');assert.equal(calls,1);assert.equal(f.timers.size,0);
 const other=new f.api.ErrorRecoverySystem();other.circuitBreakers.set('blocked',{triggeredAt:Date.now()});await assert.rejects(other.executeWithRetry(()=>{calls++},'blocked'));assert.equal(calls,1);
 const monitor=new f.api.PerformanceMonitor();for(let i=0;i<1000;i++)monitor.start('item-'+i);assert.equal(monitor.metrics.size,256);
});
test('measurement averages use completed durations and prototype-like names are plain data',()=>{
 const f=fixture(),m=new f.api.PerformanceMonitor();m.start('__proto__');f.setTime(10);m.end('__proto__');m.start('__proto__');f.setTime(30);m.end('__proto__');m.end('__proto__');
 const stats=m.getStats();assert.equal(Object.getPrototypeOf(stats),null);assert.equal(stats.__proto__.average,15);assert.equal(stats.__proto__.calls,2);
});
test('scene registrar preserves shared classes, rejects prototype keys and cancels pending retries',async()=>{
 class Scene{};const globals={GameScenes:{Safe:Scene}};const f=fixture(globals),registrar=new f.api.SecureSceneRegistrar();let starts=0;
 const game={scene:{keys:{},getScenes:()=>[],add(key,cls){this.keys[key]=new cls()},start(){starts++}}};assert.equal(f.context.GameScenes.Safe,Scene);
 await registrar.registerFromGlobals(game);assert.equal(registrar.registerSceneLater(game,'__proto__',Scene),false);assert.equal(registrar.startFriendlyScene(game,'constructor'),false);
 const pending=registrar.initRegistrarWithRetry(game,'Missing');await flush();registrar.destroy();assert.equal(await pending,false);assert.equal(f.timers.size,0);assert.equal(starts,0);assert.equal(f.context.GameScenes.Safe,Scene);
});
test('camera clamp is unique per scene, clamps zoom even without scrolling and detaches on shutdown',()=>{
 const f=fixture(),game={events:new EventEmitter(),renderer:{}},perf=f.api.create(game),events=new EventEmitter();
 const camera={zoom:100,scrollX:0,scrollY:0,setBounds(){},setZoom(v){this.zoom=v},clampX:x=>x,clampY:y=>y,setScroll(){}};
 const scene={cameras:{main:camera},sys:{events}};const bounds={x:0,y:0,width:100,height:100};perf.attachCameraClamp(scene,bounds);perf.attachCameraClamp(scene,bounds);
 assert.equal(events.listenerCount('update'),1);events.emit('update');assert.equal(camera.zoom,2);events.emit('shutdown');assert.equal(events.listenerCount('update'),0);assert.equal(events.listenerCount('destroy'),0);assert.equal(perf._cameraClamps.size,0);perf.destroy();
});
test('options cannot replace prototypes or select inherited adaptive quality tiers',()=>{
 const f=fixture(),game={events:new EventEmitter(),renderer:{}},perf=f.api.create(game,JSON.parse('{"__proto__":{"polluted":true}}'));
 assert.equal(perf.opt.polluted,undefined);const before=perf.adaptivePerformance.currentTier;perf.setQualityTier('__proto__');assert.equal(perf.adaptivePerformance.currentTier,before);perf.destroy();
});
