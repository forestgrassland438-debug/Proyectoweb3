'use strict';
// Offline tests of production libraries. No real wallet, API, DB or chain.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
class Element extends EventEmitter {
  constructor(tag='div') { super(); this.tagName=tag.toUpperCase(); this.style={}; this.children=[]; this.dataset={}; this.id=''; this.classList={add(){},remove(){},contains(){return false;},toggle(){}}; }
  addEventListener(name,fn) { this.on(name,fn); } removeEventListener(name,fn) { this.off(name,fn); }
  appendChild(el) { this.children.push(el); el.parentNode=this; return el; }
  append(...els) { els.forEach(el=>this.appendChild(el)); }
  remove() { if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(el=>el!==this);this.parentNode=null; }
  get isConnected() { return !!this.root || !!this.parentNode?.isConnected; }
  contains(el) { return this===el || this.children.some(child=>child.contains?.(el)); }
  setAttribute() {} querySelector() { return null; } querySelectorAll() { return []; }
}
function fixture(file,extra={}) {
  let now=100000,next=0; const timers=new Map(),requests=[],observers=[];
  const document=new Element(),window=new Element();document.body=new Element();document.body.root=true;document.readyState='complete';document.visibilityState='visible';
  document.createElement=tag=>new Element(tag);document.getElementById=()=>null;
  const sc={playerName:'Alice',Username:'Alice',events:new EventEmitter(),sys:{isActive:()=>true,settings:{key:'GameScene'}}};let active=sc;
  window.location={href:'https://game.test/index.html',hostname:'game.test'};window.GF_API_BASE='https://api.test';
  window.game={scene:{getScenes:()=>active?[active]:[]}};
  window.GFMascota={api(route,body){const d=deferred();requests.push({...d,route,body});return d.promise;}};
  window.fetch=async()=>({ok:true,clone:()=>({json:async()=>({stats:{bronce:99}})})});
  class Observer { constructor(fn){this.fn=fn;this.connected=false;observers.push(this);} observe(){this.connected=true;} disconnect(){this.connected=false;} }
  const clock={setTimeout(fn,ms=0){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms,repeat:ms});return id;},clearInterval:id=>timers.delete(id)};
  const c=vm.createContext({window,document,URL,Headers,AbortController,Promise,console:{log(){},warn(){},error(){}},MutationObserver:Observer,
    Date:class extends Date {static now(){return now;}},...clock,...extra});
  const load=()=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});load();
  return{window,document,c,sc,requests,timers,observers,load,activate(value){active=value;},
    tick(ms){const end=now+ms;for(let i=0;i<10000;i++){const ready=[...timers].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!ready)break;const[id,j]=ready;now=j.at;if(j.repeat)j.at+=j.repeat;else timers.delete(id);j.fn();}now=end;}};
}
const result=data=>({ok:true,datos:{ok:true,...data}});
test('bronze ignores third-party API-shaped responses and late responses from a different account',async()=>{
  const f=fixture('gf-bronce.js');f.window.GFBronce.pintar(7);
  await f.window.fetch('https://third.test/api/stats/Alice');await flush();assert.equal(f.window.GFBronce.valor(),7);
  f.activate({...f.sc,playerName:'Bob'});assert.equal(f.window.GFBronce.valor(),null);
});
test('bronze coalesces refreshes and cannot apply an older account response',async()=>{
  const f=fixture('gf-bronce.js'),a=f.window.GFBronce.refrescar(),b=f.window.GFBronce.refrescar();assert.equal(f.requests.length,1);
  f.activate({...f.sc,playerName:'Bob'});const current=f.window.GFBronce.refrescar();assert.equal(f.requests.length,2);
  f.requests[1].resolve(result({stats:{bronce:15}}));await current;f.requests[0].resolve(result({stats:{bronce:800}}));await Promise.all([a,b]);assert.equal(f.window.GFBronce.valor(),15);
});
test('bronze teardown releases observers and clocks, and retained fetch wrappers keep delegating',async()=>{
  const f=fixture('gf-bronce.js'),api=f.window.GFBronce;f.load();assert.equal(f.window.GFBronce,api);const retained=f.window.fetch;
  f.window.emit('pagehide',{persisted:true});assert.ok(f.timers.size);
  f.window.emit('pagehide',{persisted:false});assert.equal(f.timers.size,0);assert.ok(f.observers.every(o=>!o.connected));await retained('https://api.test/api/stats/Alice');
});
test('VIP refreshes belong to one account and a stale finally cannot release a newer request',async()=>{
  const f=fixture('gf-vip.js'),api=f.window.GFVip,a=api.refrescar();f.activate({...f.sc,playerName:'Bob'});const b=api.refrescar();assert.equal(f.requests.length,2);
  f.requests[0].resolve(result({activo:true,fin:200000,facturas:[{id:'old'}]}));await a;
  const c=api.refrescar();assert.equal(f.requests.length,2);f.requests[1].resolve(result({activo:false,fin:null,facturas:[]}));await Promise.all([b,c]);assert.equal(api.tiene(),false);assert.equal(api.estado().facturas.length,0);
  f.window.emit('pagehide',{persisted:false});assert.equal(f.timers.size,0);
});
test('VIP status never carries from one account to another',async()=>{
  const f=fixture('gf-vip.js'),p=f.window.GFVip.refrescar();f.requests[0].resolve(result({activo:true,fin:200000}));await p;assert.equal(f.window.GFVip.tiene(),true);
  f.activate({...f.sc,playerName:'Bob'});assert.equal(f.window.GFVip.tiene(),false);
});
test('name gate does not inherit a previous player permanent-name flag',()=>{
  const f=fixture('gf-sin-nombre.js');assert.equal(f.window.GFSinNombre.tiene(),true);f.window._acttov=1;
  f.activate({...f.sc,playerName:'Bob',Username:'---'});assert.equal(f.window.GFSinNombre.tiene(),false);
  f.sc.Username='---';f.activate(f.sc);assert.equal(f.window.GFSinNombre.tiene(),false);
});
function phaserScene(key='SalvajeScene') {
  const events=new EventEmitter(),load=new EventEmitter(),pending=new Set(),objects=[];
  const methods=['setOrigin','setScale','setDepth','setAlpha','setFlipX','setVisible','setPosition','setFrame','setInteractive','play','setTint','clearTint','setBlendMode','setRotation','setStrokeStyle','setTintFill'];
  const sc={events,load,sys:{settings:{key},isActive:()=>true},map:{widthInPixels:5024,heightInPixels:5024,getObjectLayer:()=>null},children:{list:[]},_chocaConEscenario:()=>false};
  function object(x=0,y=0) {const obj=new EventEmitter();Object.assign(obj,{x,y,scene:sc,alpha:1,depth:3,visible:true,originX:.5,originY:1,displayWidth:32,displayHeight:64,texture:{key:'old'},anims:{isPlaying:false,stop(){}},destroy(){this.emit('destroy');this.scene=null;this.removeAllListeners();}});for(const name of methods)obj[name]=function(...args){if(name==='setAlpha')this.alpha=args[0];return this;};objects.push(obj);return obj;}
  sc.add={image:object,sprite:object,text:object,container:object,graphics:()=>{const o=object();for(const n of ['fillStyle','lineStyle','fillEllipse','generateTexture','fillRoundedRect','strokeRoundedRect','fillTriangle'])o[n]=()=>o;return o;}};
  sc.make={graphics:sc.add.graphics};sc.anims={exists:()=>true};sc.textures={exists:k=>!k.startsWith('gfn_')||k.endsWith('sombra'),get:()=>({has:()=>true}),createCanvas:()=>({getContext:()=>new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{})}),refresh(){}})};
  sc.time={now:0,delayedCall(ms,fn){const event={fn,remove(){pending.delete(event);}};pending.add(event);return event;}};sc.tweens={killTweensOf(){},add:()=>({stop(){},remove(){}})};
  load.atlas=()=>{};load.start=()=>{};return{sc,pending,objects,object};
}
for(const file of ['gf-npcs.js','gf-npcs-pueblo.js'])test(file+': abandoned loads release both lifecycle hooks and pending loader callbacks',()=>{
  const f=fixture(file),p=phaserScene(file.includes('pueblo')?'GameScene':'SalvajeScene');
  if(file.includes('pueblo'))p.sc.sprite_npc1=p.object();const api=file.includes('pueblo')?f.window.GFNpcsPueblo:f.window.GFNpcs;
  for(let i=0;i<30;i++){api.montar(p.sc);p.sc.events.emit(i%2?'shutdown':'destroy');assert.equal(p.sc.events.eventNames().length,0);assert.equal(p.sc.load.listenerCount('complete'),0);assert.equal(f.timers.size,0);assert.equal(p.pending.size,0);}
});
test('NPC decoration rollback preserves original alpha and frees partially allocated sprites',()=>{
  const f=fixture('gf-npcs-pueblo.js'),p=phaserScene('GameScene');p.sc.textures.exists=()=>true;p.sc.sprite_npc1=p.object();p.sc.sprite_npc1.alpha=.7;
  const original=p.sc.add.image;let calls=0;p.sc.add.image=(...args)=>{if(++calls===2)throw Error('allocation failure');return original(...args);};
  f.window.GFNpcsPueblo.montar(p.sc);p.sc.events.emit('shutdown');assert.equal(p.sc.sprite_npc1.alpha,.7);assert.equal(p.objects.filter(o=>o!==p.sc.sprite_npc1&&o.scene).length,0);
});
test('camel partial construction rolls back every object and its scene state',()=>{
  const f=fixture('gf-camellos.js'),p=phaserScene('DesiertoScene');p.sc.textures.exists=()=>true;p.sc.add.image=()=>{throw Error('shadow allocation failed');};
  assert.doesNotThrow(()=>f.window.GFCamellos.montar(p.sc));assert.equal(p.sc.__gfCamellos,null);assert.equal(p.objects.filter(o=>o.scene).length,0);assert.equal(p.sc.events.eventNames().length,0);
});
test('an interrupted zone journey cannot launch a scene or overwrite a newer journey note',async()=>{
  const f=fixture('gf-zonas.js'),save=deferred();let started=0;
  const sc={...f.sc,mundo:6,posicionplayerx:1,posicionplayery:2,scene:{get:()=>true,start(){started++;}},savegg:()=>save.promise};
  const pending=f.window.GFZonas.viajar(sc,'desierto');sc.events.emit('shutdown');const next={mundo:1,t:77};f.window.__gfViaje=next;save.resolve(true);assert.equal(await pending,false);assert.equal(started,0);assert.equal(f.window.__gfViaje,next);assert.equal(sc.events.eventNames().length,0);
});
test('boss teardown cancels delayed powers and immediately removes orb update callbacks',()=>{
  const f=fixture('gf-jefes.js',{Phaser:{BlendModes:{ADD:1}}}),p=phaserScene('SalvajeScene'),st={scene:p.sc,vivo:true},m={vivo:true,x:100,y:100,spr:{visible:true},def:{nombre:'Boss'}};
  const A={animar(){},cercaDeMi:()=>false,efimero:(_s,o)=>o,soltarEfimero(_s,o){o.destroy();},golpearJugador(){},libre:()=>true,orientar(){}};
  p.sc.player={x:200,y:200};f.window.GFJefes.decorar(st,m,A);f.window.GFJefes.ejecutar(st,m,{p:'orbes',s:1},A);f.window.GFJefes.ejecutar(st,m,{p:'nova'},A);
  assert.equal(p.sc.events.listenerCount('update'),1);f.window.GFJefes.desmontar(st);assert.equal(p.sc.events.listenerCount('update'),0);assert.equal(p.pending.size,0);
});
function customFixture({hang=false}={}) {
  const images=[],canvases=[],fetches=[];
  class Image {constructor(){this.width=245;this.height=288;images.push(this);}set src(value){this._src=value;if(value&&!hang)queueMicrotask(()=>this.onload?.());}}
  const f=fixture('gf-soulbound-custom.js',{Image,fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'Game/Sprites/Soulbound/partes/personaje1_orig.json'),'utf8'))};}});
  const create=f.document.createElement.bind(f.document);f.document.createElement=tag=>{if(tag!=='canvas')return create(tag);const cv={width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData(){}}),toDataURL:()=> 'data:image/png;base64,AA=='};canvases.push(cv);return cv;};
  return{...f,images,canvases,fetches};
}
test('customization bounds appearance caches, reuses atlas downloads and frees intermediate canvases',async()=>{
  const f=customFixture(),api=f.window.GFSoulboundCustom;for(let i=0;i<48;i++){const id='personaje1--m0'+(i%12).toString(36)+Math.floor(i/12).toString(36)+'00000';assert.equal(await api.preparar(id),true,id);}
  assert.equal(f.fetches.length,1);assert.equal(f.images.length,1);assert.ok(api.diagnostico().apariencias<=24);assert.ok(f.canvases.every(cv=>cv.width===0&&cv.height===0));
  api.destruir();assert.equal(f.timers.size,0);assert.ok(f.observers.every(o=>!o.connected));
});
test('customization rejects path traversal and terminates hung images and queued work on teardown',async()=>{
  const f=customFixture({hang:true}),api=f.window.GFSoulboundCustom;
  assert.equal(await api.preparar('../../../private--m00000000'),false);assert.equal(f.fetches.length,0);
  const work=Array.from({length:30},(_,i)=>api.preparar('personaje1--m0'+(i%12).toString(36)+Math.floor(i/12).toString(36)+'00000'));
  await flush();assert.ok(api.diagnostico().activos<=2);api.destruir();assert.ok((await Promise.all(work)).every(ok=>ok===false));await flush();assert.equal(api.diagnostico().activos,0);assert.equal(f.timers.size,0);
});
test('pathfinding reuses its typed buffers without sharing an in-progress reentrant search',()=>{
  let allocations=0;
  class Counted extends Int32Array {constructor(...args){super(...args);allocations++;}}
  const f=fixture('gf-rutas.js',{Int32Array:Counted}),sc={events:new EventEmitter()},api=f.window.GFRutas;
  const from={x:20,y:20},to={x:140,y:140};
  for(let i=0;i<100;i++)assert.ok(api.siguiente(sc,from,to,{libre:()=>true}));assert.equal(allocations,2);
  const nested=api.siguiente(sc,from,{x:180,y:180},{libre(x,y){if(x===60&&y===60)api.siguiente(sc,from,to,{libre:()=>true});return true;}});assert.ok(nested);
  assert.equal(api.siguiente(sc,{x:NaN,y:20},to,{libre(){throw Error('must not inspect invalid positions');}}),null);
  sc.events.emit('shutdown');assert.equal(sc.__gfRutas,null);assert.equal(sc.events.eventNames().length,0);
});
test('AFK visibility cache forgets destroyed remote actor parts while remaining asleep',()=>{
  const f=fixture('gf-reposo.js'),old={scene:{},visible:true,setVisible(value){this.visible=value;}},p={sprite:old};
  f.window.GFReposo.dormir(p);old.scene=null;const current={scene:{},visible:true,setVisible(value){this.visible=value;}};p.sprite=current;f.window.GFReposo.dormir(p);
  assert.equal(p._afkVisibles.length,1);assert.equal(p._afkVisibles[0],current);f.window.GFReposo.despertar(p);assert.equal(current.visible,true);
});
test('sword damage effects are disposed at shutdown without cancelling foreign scene updates',()=>{
  const f=fixture('gf-espada.js'),p=phaserScene();let foreign=0;p.sc.events.on('update',()=>foreign++);
  f.window.GFEspada.mostrarDano(p.sc,20,30,7);assert.ok(p.objects.some(o=>o.scene));p.sc.events.emit('shutdown');assert.ok(p.objects.every(o=>!o.scene));
  p.sc.events.emit('update');assert.equal(foreign,1);assert.equal(f.window.GFEspada.equipar('__proto__'),null);
});
test('a slow skills snapshot cannot undo points that were just allocated',async()=>{
  const f=fixture('gf-character-skills.js'),st=f.window.GFCharacterSkills.montar(f.sc);f.sc.skillAllocations={strength:3};st.spending=true;st.revision=1;
  f.requests[0].resolve(result({allocations:{strength:1},available:7}));await flush();assert.equal(f.sc.skillAllocations.strength,3);f.sc.events.emit('shutdown');assert.equal(f.timers.size,0);
});
test('character point caches are bounded across many account changes',async()=>{
  const f=fixture('gf-character-skills.js'),scenes=[];for(let i=0;i<70;i++){const sc={...f.sc,events:new EventEmitter(),playerName:'Player-'+i};scenes.push(sc);f.window.GFCharacterSkills.montar(sc);f.requests.at(-1).resolve(result({allocations:{strength:i},available:3}));await flush();sc.events.emit('shutdown');}
  const oldest=f.window.GFCharacterSkills.montar(scenes[0]);assert.equal(oldest.data,undefined);scenes[0].events.emit('shutdown');
  const newest=f.window.GFCharacterSkills.montar(scenes.at(-1));assert.equal(newest.data.allocations.strength,69);scenes.at(-1).events.emit('shutdown');assert.equal(f.timers.size,0);
});
