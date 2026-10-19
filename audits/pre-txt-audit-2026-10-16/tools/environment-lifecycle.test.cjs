'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const BIN = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const world = (extra={}) => ({ok:true,ahora:18000,epocaMs:0,cicloMs:24000,diaMs:12000,nocheMs:12000,...extra});
const response = data => ({ok:true,json:async()=>data});
function fixture(file) {
  let serial=0, now=0;
  const timers=new Map(), documentEvents=new EventEmitter(), windowEvents=new EventEmitter(), requests=[];
  const document={readyState:'loading',visibilityState:'visible',getElementById:()=>null,querySelector:()=>null,
    addEventListener:(...args)=>documentEvents.on(...args),removeEventListener:(...args)=>documentEvents.off(...args)};
  const ctx={console:{log(){},warn(){}},document,performance:{now:()=>now},AbortController,location:{hostname:'localhost'},
    setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms,interval:false});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms,interval:true});return id;},clearInterval:id=>timers.delete(id),
    addEventListener:(...args)=>windowEvents.on(...args),removeEventListener:(...args)=>windowEvents.off(...args),
    fetch:(url,options)=>{const request=deferred();requests.push({url,options,...request});return request.promise;},
    Phaser:{BlendModes:{MULTIPLY:2,ADD:1}}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(BIN,file),'utf8'),ctx,{filename:file});
  return {ctx,timers,requests,documentEvents,windowEvents,setNow:value=>{now=value;},fire(ms){
    for(const [id,t] of [...timers])if(t.ms===ms){if(!t.interval)timers.delete(id);t.fn();}
  }};
}
function sceneFixture() {
  const live=new Set(),events=new EventEmitter(),children={list:[]};let failRT=false,failBrush=false;
  function object(key) {
    const o={active:true,visible:true,x:0,y:0,width:100,height:100,texture:{key},depth:0,
      destroy(){if(!this.active)return;this.active=false;live.delete(this);const i=children.list.indexOf(this);if(i>=0)children.list.splice(i,1);},
      setVisible(v){this.visible=v;return this;},setPosition(x,y){this.x=x;this.y=y;return this;},
      setTexture(k){this.texture.key=k;return this;},getCenter(){return{x:this.x,y:this.y};}};
    for(const name of ['setOrigin','setScrollFactor','setDepth','setBlendMode','setAlpha','setScale','clear','fill','erase'])o[name]=function(){return this;};
    live.add(o);children.list.push(o);return o;
  }
  const cam={width:800,height:600,zoom:1,worldView:{x:0,y:0,width:800,height:600,right:800,bottom:600}};
  const scene={events,children,cameras:{main:cam},textures:{exists:()=>true},time:{now:0},scene:{key:'test'},
    add:{renderTexture:()=>{if(failRT)throw Error('GPU allocation failed');return object('rt');},image:(x,y,k)=>object(k)},
    make:{image:()=>{if(failBrush)throw Error('Brush allocation failed');return object('gf_luz_poste');}}};
  return {scene,live,cam,object,failRT:value=>{failRT=value;},failBrush:value=>{failBrush=value;}};
}
test('clock requests settle on timeout, abort and ignore late responses without clearing a newer request',async()=>{
  const f=fixture('gf-ciclo-dia.js'),api=f.ctx.GFCiclo;
  const old=api.sincronizar();await flush();f.fire(12000);assert.equal(await old,null);assert.equal(f.requests[0].options.signal.aborted,true);
  const next=api.sincronizar();await flush();f.requests[0].resolve(response(world()));await flush();
  assert.equal(api.hayHora(),false);assert.equal(api.sincronizar(),next);
  f.requests[1].resolve(response(world()));assert.ok(await next);api.detener();assert.equal(f.timers.size,0);
});
test('clock rejects invalid cycle durations and preserves the last valid anchor',async()=>{
  const f=fixture('gf-ciclo-dia.js'),api=f.ctx.GFCiclo;
  let p=api.sincronizar();await flush();f.requests.at(-1).resolve(response(world()));await p;
  for(const invalid of [{cicloMs:0},{diaMs:NaN},{nocheMs:Infinity},{epocaMs:undefined},{diaMs:1}]){
    p=api.sincronizar();await flush();f.requests.at(-1).resolve(response(world(invalid)));assert.equal(await p,null);assert.equal(api.estado().horaTexto,'00:00');
  }
  api.detener();
});
test('clock start/stop removes timers, retries, visibility hooks and pending fetches',async()=>{
  const f=fixture('gf-ciclo-dia.js'),api=f.ctx.GFCiclo;api.arrancar();api.arrancar();await flush();
  assert.equal(f.documentEvents.listenerCount('visibilitychange'),1);assert.equal(f.requests.length,1);
  const pending=api.sincronizar();api.detener();assert.equal(await pending,null);assert.equal(f.requests[0].options.signal.aborted,true);
  assert.equal(f.timers.size,0);assert.equal(f.documentEvents.eventNames().length,0);
  f.requests[0].reject(Error('late network failure'));await flush();assert.equal(f.timers.size,0);
  api.arrancar();await flush();assert.equal(f.requests.length,2);api.detener();
});
test('phase listeners can unsubscribe during dispatch without skipping other listeners',async()=>{
  const f=fixture('gf-ciclo-dia.js'),api=f.ctx.GFCiclo;let a=0,b=0;let off=api.alCambiarFase(()=>{a++;off();off();});api.alCambiarFase(()=>b++);
  let p=api.sincronizar();await flush();f.requests[0].resolve(response(world()));await p;
  assert.equal(a,1);assert.equal(b,1);p=api.sincronizar();await flush();f.requests[1].resolve(response(world({ahora:0})));await p;
  assert.equal(a,1);assert.equal(b,2);api.detener();
});
test('night layer partial construction releases its texture and scene references',()=>{
  const f=fixture('gf-ciclo-dia.js'),s=sceneFixture();s.failBrush(true);
  assert.equal(f.ctx.GFCiclo.montarEscena(s.scene),null);assert.equal(s.live.size,0);assert.equal(s.scene.__gfCiclo,null);
  assert.equal(s.scene.events.eventNames().length,0);f.ctx.GFCiclo.detener();
});
test('night resize rolls back failed allocations and repeated teardown releases all owned objects',async()=>{
  const f=fixture('gf-ciclo-dia.js'),s=sceneFixture(),api=f.ctx.GFCiclo;
  const p=api.sincronizar();await flush();f.requests[0].resolve(response(world()));await p;
  const st=api.montarEscena(s.scene),first=st.rt;s.cam.width=900;s.failRT(true);s.scene.events.emit('update');assert.equal(st.rt,first);assert.equal(first.active,true);
  s.failRT(false);s.scene.events.emit('update');assert.notEqual(st.rt,first);assert.equal(first.active,false);
  api.desmontarEscena(s.scene);api.desmontarEscena(s.scene);assert.equal(s.live.size,0);assert.equal(st.scene,null);assert.equal(s.scene.events.eventNames().length,0);api.detener();
});
test('weather timeout cannot apply obsolete data or release a replacement request',async()=>{
  const f=fixture('gf-clima.js'),api=f.ctx.GFClima;
  const old=api.sincronizar();await flush();f.fire(12000);await old;
  const next=api.sincronizar();await flush();f.requests[0].resolve(response({ok:true,ahora:1000,lluvia:true,activo:true}));await flush();
  assert.equal(api.estado().cargado,false);assert.equal(api.sincronizar(),next);
  f.requests[1].resolve(response({ok:true,ahora:2000,activo:true,nieve:true}));await next;assert.equal(api.estado().nieve,true);
  api.detener();assert.equal(f.timers.size,0);
});
test('weather validates HTTP status, clamps strength, preserves zero and rejects inherited seasons',async()=>{
  const f=fixture('gf-clima.js'),api=f.ctx.GFClima;
  const p=api.sincronizar();await flush();f.requests[0].resolve({ok:false,status:500,json:async()=>({ok:true,activo:true})});await p;assert.equal(api.estado().cargado,false);
  api._interno.aplicar({ok:true,activo:true,lluvia:true,lluviaFuerza:0,nieveFuerza:Infinity,vientoFuerza:-1,soleadoFuerza:9,estacion:'__proto__'});
  assert.equal(api.estado().lluviaFuerza,0);assert.equal(api.ahora().lluvia,0);assert.equal(api.estado().nieveFuerza,1);assert.equal(api.estado().soleadoFuerza,2);
  assert.equal(api.estado().vientoFuerza,0);assert.equal(api.estado().estacion,'verano');api.probarEstacion('constructor');assert.equal(api.estado().estacion,'verano');api.detener();
});
test('weather switches sockets, releases absent sockets and stops retry timers and pending work',async()=>{
  const f=fixture('gf-clima.js'),api=f.ctx.GFClima,socket=new EventEmitter();f.ctx.globalSocket=socket;
  api.arrancar();await flush();assert.equal(socket.listenerCount('worldWeather'),1);assert.equal(socket.listenerCount('connect'),1);
  delete f.ctx.globalSocket;api.engancharSocket();assert.equal(socket.eventNames().length,0);
  f.ctx.globalSocket=socket;api.engancharSocket();const pending=api.sincronizar();api.detener();await pending;
  assert.equal(socket.eventNames().length,0);assert.equal(f.timers.size,0);assert.equal(f.requests[0].options.signal.aborted,true);
  f.requests[0].resolve(response({ok:true,activo:true,lluvia:true}));await flush();assert.equal(api.estado().cargado,false);
});
test('thunder unsubscribe is idempotent and dispatch tolerates listeners leaving',()=>{
  const f=fixture('gf-clima.js'),api=f.ctx.GFClima;let count=0;const fn=()=>count++,a=api.alTronar(fn),b=api.alTronar(fn);
  a();a();api._interno.avisarDelTrueno(true,1);assert.equal(count,1);b();
  let second=0;let off=api.alTronar(()=>off());api.alTronar(()=>second++);api._interno.avisarDelTrueno(true,1);assert.equal(second,1);api.detener();
});
test('weather teardown continues after one object destructor throws',()=>{
  const f=fixture('gf-clima.js'),api=f.ctx.GFClima,s=sceneFixture();const good=s.object('drop');
  const st={scene:s.scene,gotas:[{spr:{destroy(){throw Error('already invalid');}}},{spr:good}],incendio:null};s.scene.__gfClima=st;
  api.desmontar(s.scene);assert.equal(good.active,false);assert.equal(s.scene.__gfClima,null);assert.equal(st.scene,null);api.detener();
});
test('a partially constructed lightning fire releases its own images and preserves the tree',()=>{
  const f=fixture('gf-clima.js'),s=sceneFixture(),api=f.ctx.GFClima,tree=s.object('tree');let calls=0;
  const make=s.scene.add.image;s.scene.add.image=(...args)=>{if(++calls===3)throw Error('fire allocation failure');return make(...args);};
  const st={scene:s.scene,incendio:null};api._interno.prenderArbol(st,{spr:tree,clave:'tree'});
  assert.equal(st.incendio,null);assert.equal(s.live.size,1);assert.equal(tree.active,true);api.detener();
});

process.argv[2]=BIN;
const bank=require('./fauna-banco.js');
test('animal partial construction rolls back already allocated sprites and thunder subscriptions',()=>{
  const scene=bank.crearEscena(),base=bank.cuentas().vivos;scene.add.ellipse=()=>{throw Error('shadow allocation failed');};
  assert.equal(bank.ctx.GFAnimales.montar(scene,{elenco:[['vaca',1]]}),null);assert.equal(bank.cuentas().vivos,base);assert.equal(scene.__gfFauna,null);assert.equal(bank.oyentesTrueno.length,0);
});
test('animal teardown clears references and remaining objects even after one destructor fails',()=>{
  const scene=bank.crearEscena(),api=bank.ctx.GFAnimales,base=bank.cuentas().vivos,st=api.montar(scene,{elenco:[['vaca',2]]});
  const first=st.animales[0],spr=first.spr,original=spr.destroy;spr.destroy=function(){original.call(this);throw Error('destroy callback');};
  api.desmontar(scene);api.desmontar(scene);assert.equal(bank.cuentas().vivos,base);assert.equal(bank.oyentesTrueno.length,0);assert.equal(st.scene,null);assert.equal(first.spr,null);
  for(const listeners of Object.values(scene.__listeners))assert.equal(listeners.length,0);
});
test('animal counts, frame delta and damage reject values that freeze or corrupt the simulation',()=>{
  const scene=bank.crearEscena(),api=bank.ctx.GFAnimales,st=api.montar(scene,{elenco:[['vaca',Infinity],['__proto__',2],['vaca',1]]});
  assert.equal(st.animales.length,1);const a=st.animales[0],before={x:a.spr.x,y:a.spr.y,life:a.vida};
  for(const delta of [NaN,Infinity,-100])scene.events.emit('update',100,delta);
  for(const damage of [NaN,Infinity,-10])api._interno.danarAnimal(st,a,damage);
  assert.equal(a.spr.x,before.x);assert.equal(a.spr.y,before.y);assert.equal(a.vida,before.life);api.desmontar(scene);
});
