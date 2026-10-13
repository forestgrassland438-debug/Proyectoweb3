'use strict';
// Regresiones locales: DOM, red y reloj simulados; sin wallets ni transacciones reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const response = (data, status = 200) => ({ ok: status < 400, status, headers: { get() {return null;} }, json: async () => data, text: async () => JSON.stringify(data) });

class Element extends EventEmitter {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.style = {}; this.dataset = {}; this.children = []; this.id = ''; this.className = ''; this.value = '';
    this.classes = new Set(); this.attributes = new Map();
    this.classList = {add: k => this.classes.add(k),remove:k=>this.classes.delete(k),contains:k=>this.classes.has(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};
  }
  addEventListener(type, fn, options) { options?.once ? this.once(type,fn) : this.on(type,fn); }
  removeEventListener(type,fn) {this.off(type,fn);}
  appendChild(el) { if(el.parentNode)el.remove(); this.children.push(el); el.parentNode=this; return el; }
  insertBefore(el, next) { if(el.parentNode)el.remove(); const i=this.children.indexOf(next); this.children.splice(i<0?this.children.length:i,0,el); el.parentNode=this; return el; }
  removeChild(el) {this.children=this.children.filter(x=>x!==el);el.parentNode=null;return el;}
  remove() {this.parentNode?.removeChild(this);}
  contains(el) {return this===el||this.children.some(x=>x.contains(el));}
  get isConnected() {return !!this.root || !!this.parentNode?.isConnected;}
  set textContent(value) {this._text=String(value);for(const el of this.children)el.parentNode=null;this.children=[];}
  get textContent() {return this._text||'';}
  set innerHTML(value) {this.textContent=value;}
  get innerHTML() {return this.textContent;}
  setAttribute(k,v) {this.attributes.set(k,v);}
  getAttribute(k) {return this.attributes.get(k);}
  querySelector(selector) {return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector) {
    const match = el => selector.startsWith('#') ? el.id===selector.slice(1) : selector.startsWith('.') ? el.className.split(' ').includes(selector.slice(1)) : false;
    return this.children.flatMap(el=>[...(match(el)?[el]:[]),...el.querySelectorAll(selector)]);
  }
  focus() {this.focused=true;this.emit('focus',{});}
  blur() {this.focused=false;this.emit('blur',{});}
  select() {}
}
function fixture(files, extra = {}) {
  let now=0,id=0; const timers=new Map(),requests=[];
  const document=new Element(); document.readyState='complete'; document.body=new Element('body');document.body.root=true;document.head=new Element('head');document.head.root=true;document.cookie='';
  document.getElementById=k=>document.body.querySelector('#'+k)||document.head.querySelector('#'+k);
  document.createElement=tag=>new Element(tag);document.querySelector=s=>document.body.querySelector(s);document.querySelectorAll=s=>document.body.querySelectorAll(s);
  const storage = new Map([['authTokens', JSON.stringify({accessToken:'token-A'})]]);
  const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const clock = {setTimeout(fn,ms=0) {const key=++id;timers.set(key,{fn,at:now+ms,ms});return key;},clearTimeout:k=>timers.delete(k),
    setInterval(fn,ms) {const key=++id;timers.set(key,{fn,at:now+ms,ms,repeat:true});return key;},clearInterval:k=>timers.delete(k),
    requestAnimationFrame(fn) {return clock.setTimeout(fn,16);}, cancelAnimationFrame:k=>timers.delete(k)};
  const window=new Element();Object.assign(window,clock,{document,navigator:{maxTouchPoints:0},atob:x=>Buffer.from(x,'base64').toString('binary')});
  const context=vm.createContext({window,document,navigator:window.navigator,console:{log(){},warn(){},error(){}},
    Date:class extends Date {static now(){return now;}},AbortController,TextDecoder,Uint8Array,sessionStorage,localStorage:sessionStorage,
    fetch(url,options={}) {const d=deferred();requests.push({...d,url,options});return d.promise;},...clock,...extra});
  window.fetch=(...args)=>context.fetch(...args);
  for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  const add=(key)=>{const el=new Element();el.id=key;document.body.appendChild(el);return el;};
  return {window,document,context,requests,storage,timers,add,
    tick(ms) {const end=now+ms;for(let count=0;count<10000;count++){const ready=[...timers].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!ready)break;const[k,j]=ready;now=j.at;j.repeat?j.at+=j.ms:timers.delete(k);j.fn();}now=end;},
    cls:name=>vm.runInContext(name,context)};
}
const scene=()=>({events:new EventEmitter(),serverclient:'https://backend.test/api',serverBase:'https://backend.test',playerName:'Alice',isAuthenticated:true,input:{keyboard:{enabled:true}},STATE:{slots:[],quickSlots:[],chestSlots:[]}});

for (const file of ['BlockchainManager.js','SystemaTransaccion.js']) {
  const name=file==='BlockchainManager.js'?'BlockchainManager':'TransactionSystem';
  test(`${name}: el cierre aborta incluso un cuerpo HTTP pendiente y no recupera datos tardíos`,async()=>{
    const f=fixture([file]),sc=scene(),manager=new(f.cls(name))(sc),body=deferred();
    manager.accessToken='token-A'; const p=manager.fetchUserData().catch(()=>null);
    f.requests[0].resolve({ok:true,json:()=>body.promise});await flush();
    sc.events.emit('shutdown');assert.equal(f.requests[0].options.signal.aborted,true);
    assert.equal(sc.events.listenerCount('destroy'),0);assert.equal(manager.scene,null);
    body.resolve({address:'old',nonce:'7',playerName:'Old'});await p;
    assert.equal(manager.currentAccount,null);assert.equal(manager._requests.size,0);assert.equal(f.timers.size,0);
  });
  test(`${name}: una respuesta de otro token no cambia el usuario`,async()=>{
    const f=fixture([file]),manager=new(f.cls(name))(scene());manager.accessToken='token-A';
    const p=manager.fetchUserData();f.storage.set('authTokens',JSON.stringify({accessToken:'token-B'}));manager.accessToken='token-B';
    f.requests[0].resolve(response({address:'old',nonce:'7',playerName:'Old'}));assert.equal(await p,null);assert.equal(manager.currentAccount,null);manager.destroy();
  });
  test(`${name}: la configuración tardía no resucita el sistema destruido`,async()=>{
    const f=fixture([file]),manager=new(f.cls(name))(scene());const p=manager[name==='BlockchainManager'?'autoConfig':'loadServerConfig']();manager.destroy();
    f.requests[0].resolve(response({onchainContractAddress:'0x1',allowedContracts:{bad:{}},rpcUrl:'late'}));await p;
    assert.equal(manager.scene,null);assert.equal(manager.contracts instanceof Map?manager.contracts.size:Object.keys(manager.contracts).length,0);
  });
}

test('TransactionSystem: un 401 de una sesión anterior y los fallos de red conservan el token actual',async()=>{
  for(const stale of [true,false]){
    const f=fixture(['SystemaTransaccion.js']),m=new(f.cls('TransactionSystem'))(scene());const p=m.setupAuthentication();
    if(stale){m.accessToken='token-B';m.isAuthenticated=true;f.storage.set('authTokens',JSON.stringify({accessToken:'token-B'}));f.requests[0].resolve(response({error:'expired'},401));}
    else f.requests[0].reject(new Error('offline'));
    await p;assert.ok(f.storage.has('authTokens'));if(stale)assert.equal(m.isAuthenticated,true);m.destroy();
  }
});
test('TransactionSystem: un fallo al desconectar no impide liberar panel, escena y solicitudes',()=>{
  const f=fixture(['SystemaTransaccion.js']),m=new(f.cls('TransactionSystem'))(scene());let closed=0;
  m.socket={removeAllListeners(){throw new Error('socket');},disconnect(){throw new Error('socket');}};m.txHub={destroy(){closed++;}};
  m.destroy();m.destroy();assert.equal(closed,1);assert.equal(m.scene,null);assert.equal(m.txHub,null);
});

function craftingFixture() {
  const f=fixture(['CraftingHub.js']);const C=f.cls('CraftingSystem');C.prototype.initialize=function(){};
  const sc=scene(),m=new C(sc);f.add('crafting-hub').classList.add('crafting-hub-hidden');
  for(const key of ['crafting-close','overlay-back','crafting-search-input','crafting-feedback'])f.add(key);
  return {...f,sc,m};
}
test('Crafting: 30 cambios de escena liberan referencias y los listeners de ciclo de vida',()=>{
  const f=craftingFixture();let old=f.sc;
  for(let i=0;i<30;i++){const next=scene();f.m.scene=next;assert.equal(old.events.listenerCount('shutdown'),0);old=next;next.events.emit(i%2?'shutdown':'destroy');assert.equal(f.m.scene,null);assert.equal(next.events.listenerCount('shutdown')+next.events.listenerCount('destroy'),0);}
  f.m.destroy();assert.equal(f.timers.size,0);
});
test('Crafting: al destruir el panel se eliminan sus escuchas globales y DOM',()=>{
  const f=craftingFixture();f.m.setupEventListeners();f.m.setupEventListeners();assert.equal(f.document.listenerCount('keydown'),1);
  f.m.showFeedback('pending','info');f.m._startLevelWatch();f.m.destroy();
  assert.equal(f.document.listenerCount('keydown'),0);assert.equal(f.document.getElementById('crafting-close').listenerCount('click'),0);assert.equal(f.timers.size,0);assert.equal(f.m.scene,null);
});
test('Crafting: cerrar sin DOM detiene vigilancia y reactivación del teclado',()=>{
  const f=craftingFixture();f.m.disablePhaserInput();f.m.disablePhaserInput();f.m._startLevelWatch();f.document.getElementById('crafting-hub').remove();
  f.m.hide();assert.equal(f.sc.input.keyboard.enabled,true);assert.equal(f.timers.size,0);f.m.destroy();
});
test('Crafting: una operación pendiente termina sobre su escena antes del relevo',async()=>{
  const f=craftingFixture(),d=deferred(),next=scene();f.m.selectedRecipe={name:'Bucket',resources:[]};let origin;
  f.m._craftItemInterno=async function(){origin=this.scene;await d.promise;assert.equal(this.scene,origin);};
  const p=f.m.craftItem();await flush();f.m.scene=next;f.sc.events.emit('shutdown');assert.equal(f.m.scene,f.sc);
  d.resolve();await p;assert.equal(f.m.scene,next);assert.equal(f.sc.events.listenerCount('destroy'),0);f.m.destroy();
});
test('Crafting: una escena de relevo que ya cerró no se vuelve a retener',async()=>{
  const f=craftingFixture(),d=deferred(),next=scene();f.m.selectedRecipe={name:'Bucket',resources:[]};f.m._craftItemInterno=()=>d.promise;
  const p=f.m.craftItem();await flush();f.m.scene=next;next.events.emit('destroy');d.resolve();await p;assert.equal(f.m.scene,null);assert.equal(next.events.listenerCount('shutdown'),0);f.m.destroy();
});

test('LoadingSystem: cancelar o destruir una animación resuelve la espera y libera RAF',async()=>{
  const f=fixture(['LoadingSystem.js']),m=new f.window.LoadingSystem();const p=m.showTimed(90000);m.destroy();await p;
  assert.equal(f.timers.size,0);await m.showTimed();assert.equal(f.timers.size,0);
});
test('LoadingSystem: destruir una instancia anterior respeta el overlay de la nueva',async()=>{
  const f=fixture(['LoadingSystem.js']),a=new f.window.LoadingSystem(),b=new f.window.LoadingSystem();a.show();const p=a.hide();b.show({message:'New'});await p;a.destroy();
  assert.equal(b.overlay.isConnected,true);assert.equal(b.overlay.style.display,'flex');assert.equal(b.textElement.textContent,'New');b.destroy();assert.equal(f.timers.size,0);
});
test('LoadingSystem: una animación antigua tampoco puede actualizar ni ocultar la carga nueva',async()=>{
  const f=fixture(['LoadingSystem.js']),a=new f.window.LoadingSystem(),b=new f.window.LoadingSystem();const p=a.showTimed(50);b.show({message:'New',initialProgress:0.2});await p;
  assert.equal(a.update(0.9),false);f.tick(2000);assert.equal(b.currentProgress,0.2);assert.equal(b.overlay.style.display,'flex');assert.equal(f.timers.size,0);a.destroy();b.destroy();
});
test('LoadingSystem y NotificationHub: el cierre antes de DOMContentLoaded impide reinicializar',()=>{
  const f=fixture([],{});f.document.readyState='loading';f.document.body=null;
  for(const file of ['LoadingSystem.js','NotificationHub.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context);
  const a=new f.window.LoadingSystem(),b=new(f.cls('NotificationHub'))();b.initialize();const before=f.document.listenerCount('DOMContentLoaded');a.destroy();b.destroy();
  assert.equal(f.document.listenerCount('DOMContentLoaded'),before-2);assert.equal(a._destroyed,true);assert.equal(b.show('late'),null);assert.equal(f.timers.size,0);
});
test('NotificationHub: destruir elimina todas las animaciones pendientes',()=>{
  const f=fixture(['NotificationHub.js']),m=new(f.cls('NotificationHub'))();m.initialize=()=>{m.isInitialized=true;};m._hubElement=new Element();f.document.body.appendChild(m._hubElement);
  const key=m.show('hello');assert.ok(key);m._removeNotification(key);m.destroy();assert.equal(f.timers.size,0);assert.equal(m.show('late'),null);
});
test('NotificationHub: los campos de duplicados personalizados se liberan al quitar la notificación',()=>{
  const f=fixture(['NotificationHub.js']),m=new(f.cls('NotificationHub'))({duplicateCheckFields:['message','custom']});m.initialize=()=>{m.isInitialized=true;};m._hubElement=new Element();f.document.body.appendChild(m._hubElement);
  for(let i=0;i<100;i++){const key=m.show('same','info',{custom:i});m._removeNotification(key);assert.equal(m.duplicateTracker.size,0);}
  assert.notEqual(m._generateDuplicateKey('same','info','default',{custom:0}),m._generateDuplicateKey('same','info','default',{}));m.destroy();assert.equal(f.timers.size,0);
});

function nftFixture() {
  const f=fixture(['gf-nft.js']);for(const id of ['nft-list','nft-wallet','nft-collection-name','nft-count'])f.add(id);return f;
}
const listing = (tokens=[],name='Collection')=>({configurada:true,coleccion:{contrato:'0xc',nombre:name},tokens});
test('NFT: refrescar cancela lecturas anteriores e ignora respuestas viejas',async()=>{
  const f=nftFixture(),a=f.window.GFNft.montarPanel(scene());const b=f.window.GFNft.montarPanel(scene(),true);
  assert.equal(f.requests[0].options.signal.aborted,true);f.requests[1].resolve(response(listing([],'New')));await b;f.requests[0].resolve(response(listing([],'Old')));await a;
  assert.equal(f.document.getElementById('nft-collection-name').textContent,'New');assert.equal(f.timers.size,0);assert.equal(f.window.GFNft._interno.descargas.size,0);
});
test('NFT: cambiar de cuenta inicia una lectura nueva aunque la anterior siga pendiente',async()=>{
  const f=nftFixture(),sc=scene(),a=f.window.GFNft.montarPanel(sc);sc.playerName='Bob';const b=f.window.GFNft.montarPanel(sc);assert.equal(f.requests.length,2);
  f.requests[0].resolve(response(listing()));f.requests[1].resolve(response(listing()));await Promise.all([a,b]);assert.equal(f.timers.size,0);
});
test('NFT: los metadatos sin Content-Length se interrumpen al superar 200 KiB',async()=>{
  const f=nftFixture(),p=f.window.GFNft.montarPanel(scene());f.requests[0].resolve(response(listing([{id:1,uri:'https://nft.test/1'}])));await flush();let reads=0,canceled=0,released=0;
  f.requests[1].resolve({ok:true,headers:{get(){return null;}},body:{getReader(){return {async read(){reads++;return {done:false,value:new Uint8Array(120*1024)};},async cancel(){canceled++;},releaseLock(){released++;}};}}});await p;
  assert.equal(reads,2);assert.equal(canceled,1);assert.equal(released,1);assert.equal(f.window.GFNft._interno.cache.size,0);assert.equal(f.timers.size,0);
});
test('NFT: una URI nueva del mismo token actualiza la caché y esta conserva como máximo 500 entradas',async()=>{
  const f=nftFixture();let serial=0;
  f.context.fetch=async()=>response(listing(Array.from({length:500},(_,id)=>({id,uri:'data:application/json,'+encodeURIComponent(JSON.stringify({name:'N'+serial+'-'+id}))}))));
  await f.window.GFNft.montarPanel(scene());serial++;await f.window.GFNft.montarPanel(scene(),true);
  assert.equal(f.window.GFNft._interno.cache.size,500);assert.equal(f.document.getElementById('nft-list').children[0].__partes.nombre.textContent,'N1-0');assert.equal(f.timers.size,0);
});

test('Traductor: cien mensajes y lotes nuevos comparten un máximo de tres descargas',async()=>{
  const f=fixture(['gf-traductor.js']),t=f.window.GFTraductor;t.ponerModo('en');
  const nodes=Array.from({length:100},(_,i)=>{const el=new Element();f.document.body.appendChild(el);t.traducirEn(el,'Mensaje '+i);return el;});f.tick(80);await flush();assert.equal(f.requests.length,3);
  t.traducirEn(nodes[0],'Mensaje 0');f.tick(80);await flush();assert.equal(f.requests.length,3);
  let resolved=0;for(let n=0;n<60&&t._interno.enCurso.size;n++){const end=f.requests.length;while(resolved<end){const req=f.requests[resolved++];req.resolve(response([[['Message '+resolved]],null,'es']));}await flush();assert.ok(f.requests.length-resolved<=3);}
  assert.equal(f.requests.length,100);assert.equal(t._interno.enCurso.size,0);assert.equal(t._interno.lotes.length,0);assert.equal(f.timers.size,0);
});
test('Traductor: registros y colas tienen límite incluso con mil nodos vivos',()=>{
  const f=fixture(['gf-traductor.js']),t=f.window.GFTraductor;t.ponerModo('en');
  for(let i=0;i<1100;i++){const el=new Element();f.document.body.appendChild(el);t.traducirEn(el,'Mensaje '+i);}
  assert.equal(t._interno.vigilados.size,500);assert.ok(t._interno.cola.size<=500);
});

function graphicsFixture() {const sc=scene(),f=fixture(['gf-graphics-settings.js'],{});f.window.game={scene:{getScenes:()=>[sc]}};return {...f,sc};}
test('Gráficos: un deslizador rápido conserva un único guardado y envía el último valor después',async()=>{
  const f=graphicsFixture(),g=f.window.GFGraphics;g.setChunks(3);g.setChunks(6);g.setChunks(10);assert.equal(f.requests.length,1);
  f.requests[0].resolve(response({ok:true}));await flush();assert.equal(f.requests.length,2);assert.equal(JSON.parse(f.requests[1].options.body).chunks,10);
  f.requests[1].resolve(response({ok:true}));await flush();f.tick(220);await flush();assert.equal(f.requests.filter(x=>x.options.method==='POST').length,2);
});
test('Gráficos: una carga lenta no pisa el ajuste que el jugador acaba de cambiar',async()=>{
  const f=graphicsFixture(),g=f.window.GFGraphics;f.tick(1100);await flush();assert.equal(f.requests.filter(x=>!x.options.method).length,1);g.setChunks(5);
  f.requests[0].resolve(response({ok:true,chunks:14,calidad:'alta'}));f.requests[1].resolve(response({ok:true}));await flush();assert.equal(g.get().chunks,5);
});
test('Gráficos: los fallos de red usan espera progresiva y no reintentan cada 220 ms',async()=>{
  const f=graphicsFixture();f.window.GFGraphics.setChunks(5);f.requests[0].reject(new Error('offline'));await flush();f.tick(1900);await flush();assert.equal(f.requests.filter(x=>x.options.method==='POST').length,1);
  f.tick(300);await flush();assert.equal(f.requests.filter(x=>x.options.method==='POST').length,2);
});
test('Gráficos: cambiar de cuenta descarta la lectura anterior',async()=>{
  const f=graphicsFixture();f.tick(1100);await flush();f.sc.playerName='Bob';f.requests[0].resolve(response({ok:true,chunks:2,calidad:'baja'}));await flush();assert.equal(f.window.GFGraphics.get().chunks,12);
});
test('Gráficos: un guardado fallido del usuario anterior permite cargar los ajustes del nuevo',async()=>{
  const f=graphicsFixture();f.window.GFGraphics.setChunks(5);f.requests[0].reject(new Error('offline'));await flush();f.sc.playerName='Bob';f.tick(220);await flush();
  const req=f.requests.find(x=>!x.options.method);req.resolve(response({ok:true,chunks:8,calidad:'media'}));await flush();assert.equal(f.window.GFGraphics.get().chunks,8);
});
test('Cookies: un CSRF mal codificado no rompe los paneles ni deja temporizadores',async()=>{
  const f=graphicsFixture();f.document.cookie='csrf-token=%zz';assert.doesNotThrow(()=>f.window.GFGraphics.setChunks(5));f.requests[0].resolve(response({ok:true}));await flush();
  const m=fixture(['gf-mascota.js']);m.window.location={hostname:'localhost'};m.document.cookie='csrf-token=%zz';const p=m.window.GFMascota.api('/api/pet',{});m.requests[0].resolve(response({ok:true}));await p;assert.equal(m.timers.size,0);
});

function assetScene() {
  const sc=scene(),files=[],textures=new Map();sc.children={list:[]};
  sc.textures={exists:k=>textures.has(k),remove:k=>textures.delete(k),get:k=>textures.get(k),addImage:(k,img)=>textures.set(k,{getSourceImage:()=>img})};
  sc.anims={exists:()=>false,create(){}};sc.load=new EventEmitter();sc.load.list={each:fn=>files.forEach(fn)};
  sc.load.image=(key,url,options)=>files.push({key,url,options,addToCache(){textures.set(key,{getSourceImage:()=>({width:32,height:32})});}});sc.load.start=()=>{};
  return {sc,files,textures};
}
function soulFixture() {
  const f=fixture([]);f.window.requestIdleCallback=()=>{};
  vm.runInContext(fs.readFileSync(path.join(root,'gf-soulbound.js'),'utf8'),f.context);return f;
}
test('Soulbound: cancelar 20 cargas suelta los listeners, las esperas y las texturas tardías',async()=>{
  const f=soulFixture();for(let i=0;i<20;i++){
    const {sc,files,textures}=assetScene();const p=f.window.GFSoulbound.aplicarEnEscena(sc,'personaje1');assert.ok(files.length>20);
    sc.events.emit(i%2?'destroy':'shutdown');assert.equal(await p,false);for(const file of files)file.addToCache();
    assert.equal(textures.size,0);assert.equal(sc.load.listenerCount('complete'),0);assert.equal(sc.events.listenerCount('shutdown')+sc.events.listenerCount('destroy'),0);assert.equal(f.timers.size,0);
  }
});
test('Soulbound: el plazo de carga libera una operación aunque el loader nunca termine',async()=>{
  const f=soulFixture(),{sc,files,textures}=assetScene(),p=f.window.GFSoulbound.aplicarEnEscena(sc,'personaje1');f.tick(20000);assert.equal(await p,false);
  files.forEach(file=>file.addToCache());assert.equal(textures.size,0);assert.equal(f.timers.size,0);
});
test('Soulbound: el cambio completo retira las texturas temporales y sus listeners',async()=>{
  const f=soulFixture(),{sc,files,textures}=assetScene(),p=f.window.GFSoulbound.aplicarEnEscena(sc,'personaje1');files.forEach(file=>file.addToCache());sc.load.emit('complete');assert.equal(await p,true);
  assert.equal([...textures.keys()].filter(k=>k.startsWith('__sb_tmp')).length,0);assert.equal(textures.size,files.length);assert.equal(f.timers.size,0);assert.equal(sc.events.listenerCount('shutdown'),0);
});
test('Soulbound: una sincronización antigua no deshace una elección nueva',async()=>{
  const f=soulFixture(),{sc,files}=assetScene(),p=f.window.GFSoulbound.sincronizar(sc);f.window.GFSoulbound.fijar('personaje3');
  f.requests[0].resolve(response({character:'personaje2'}));assert.equal(await p,false);assert.equal(f.window.GFSoulbound.actual(),'personaje3');assert.equal(files.length,0);assert.equal(f.timers.size,0);
});
test('Mascota: el límite de petición cubre el cuerpo y no aplica respuestas de otra cuenta',async()=>{
  const f=fixture(['gf-mascota.js']);f.window.location={hostname:'localhost'};const sc=scene();f.window.game={scene:{getScenes:()=>[sc]}};
  const a=f.window.GFMascota.api('/api/pet');const body=deferred();f.requests[0].resolve({ok:true,status:200,json:()=>body.promise});await flush();f.tick(15000);assert.equal(f.requests[0].options.signal.aborted,true);body.resolve({pet:{health:99}});await assert.rejects(a);assert.equal(f.timers.size,0);
  const b=f.window.GFMascota.api('/api/pet');sc.playerName='Bob';f.requests[1].resolve(response({pet:{health:99}}));const r=await b;assert.equal(r.ok,false);assert.equal(r.datos,null);assert.equal(f.timers.size,0);
});
test('Pesca: la carga abortada libera sus eventos sin dejar loaderror acumulados',async()=>{
  const f=fixture(['gf-pesca.js']),{sc}=assetScene();const baseline=f.timers.size;
  for(let i=0;i<20;i++){const p=f.window.GFPesca._interno.cargarFotogramas(sc);sc.events.emit('shutdown');assert.equal(await p,false);assert.equal(sc.load.listenerCount('complete'),0);assert.equal(sc.load.listenerCount('loaderror'),0);assert.equal(f.timers.size,baseline);}
});
test('Dependencia i18next: mantiene traducciones válidas y rechaza rutas con esquema inyectado',async()=>{
  const Backend=require('i18next-http-backend'),calls=[];
  const backend=new Backend(null,{loadPath:'{{lng}}/{{ns}}.json',reloadInterval:false,request(options,url,payload,cb){calls.push(url);cb(null,{status:200,data:'{"hello":"Hello"}'});}});
  const read=(lang)=>new Promise(resolve=>backend.read(lang,'common',(error,data)=>resolve({error,data})));
  const valid=await read('en');assert.equal(valid.data.hello,'Hello');assert.equal(calls.length,1);
  const malicious=await read('http:127.0.0.1:9999');assert.ok(malicious.error);assert.equal(calls.length,1);
});
