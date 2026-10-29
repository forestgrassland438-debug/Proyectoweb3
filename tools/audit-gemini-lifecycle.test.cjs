'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn'),{EventEmitter}=require('node:events');
function method(file,cls,name){const source=fs.readFileSync(file,'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'});let target;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='ClassDeclaration'&&n.id.name===cls)target=n;for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(ast);const node=target?.body.body.find(x=>x.key.name===name);assert.ok(node,name);return source.slice(node.start,node.end);}
test('crop setup and teardown preserve another feature and the incoming scene subscriptions',()=>{
 const source=method('Scenes/GameScene.js','GameScene','setupCropSocketEvents'),socket=new EventEmitter(),foreign=()=>{},end=[];socket.on('cropGrowth',foreign);
 const fn=vm.runInNewContext('({'+source+'}).setupCropSocketEvents',{console:{log(){},warn(){}},window:{},document:{getElementById:()=>null}});
 const scene={socket,_sceneRunId:1,_onceSceneEnd(fn){end.push(fn);}};
 for(let i=0;i<20;i++){fn.call(scene);assert.equal(socket.listenerCount('cropGrowth'),2);}
 const newer={socket,_sceneRunId:2,_onceSceneEnd(fn){this.dispose=fn;}};fn.call(newer);assert.equal(socket.listenerCount('cropGrowth'),3);
 for(const dispose of end)dispose();assert.equal(socket.listenerCount('cropGrowth'),2);assert.ok(socket.listeners('cropGrowth').includes(foreign));newer.dispose();assert.equal(socket.listenerCount('cropGrowth'),1);
});
test('shop lifecycle removes every owned global handler across 20 disposable instances',()=>{
 const window=new EventEmitter(),document=new EventEmitter();for(const target of [window,document]){target.addEventListener=target.on.bind(target);target.removeEventListener=target.off.bind(target);}
 const methods=['_listenGlobal','destroy'].map(name=>method('tienda_sistema.js','TiendaSistema',name)).join(',');const proto=vm.runInNewContext('({'+methods+'})',{window,document,clearTimeout});
 for(let i=0;i<20;i++){const shop=Object.assign(Object.create(proto),{close(){},scene:{}});shop._listenGlobal(window,'resize',()=>{});shop._listenGlobal(window,'pointerup',()=>{});shop.destroy();shop.destroy();assert.equal(shop.scene,null);}
 assert.equal(window.eventNames().length,0);assert.equal(document.eventNames().length,0);
});
test('a transaction visibility countdown schedules one deadline and clears it on cancellation',()=>{
 const timers=new Map();let id=0,hidden=0;const methods=['_startVisibilityCountdown','_cancelVisibilityCountdown'].map(name=>method('TransactionHub.js','TransactionHub',name)).join(','),proto=vm.runInNewContext('({'+methods+'})',{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 const hub=Object.assign(Object.create(proto),{hideNotification(){hidden++;}});hub._startVisibilityCountdown(10000);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,10000);hub._cancelVisibilityCountdown();assert.equal(timers.size,0);hub._startVisibilityCountdown(300);[...timers.values()][0].fn();assert.equal(hidden,1);
});
test('DPR backing buffer matches the WebGL viewport after ScaleManager overwrites its size',()=>{
 let canvas={width:1,height:1},viewport;
 const fn=vm.runInNewContext('({'+method('phaser-canvas-scaler.js','PhaserCanvasScaler','_updatePhaserSize')+'})._updatePhaserSize',{console});
 const scaler={canvas,game:{scale:{resize(w,h){canvas.width=w;canvas.height=h;}},renderer:{resize(w,h){viewport=[w,h];}}}};
 fn.call(scaler,640,360,1280,720);assert.deepEqual([canvas.width,canvas.height],viewport);assert.deepEqual(viewport,[1280,720]);
 scaler.game.renderer.resize=(w,h)=>{if(w>640)throw Error('physical resize unavailable');viewport=[w,h];};fn.call(scaler,640,360,1280,720);assert.deepEqual([canvas.width,canvas.height],viewport);
});
test('the fallback canvas receives its own context-loss and restoration listeners',()=>{
 const canvas={listeners:[],addEventListener(event,fn){this.listeners.push([event,fn]);}},onLost=()=>{},onRestored=()=>{};let attempts=0;
 const global={Phaser:{Game:function(){if(attempts++===0)throw Error('primary unavailable');return {canvas};}}};
 const fn=vm.runInNewContext('({'+method('phaser-canvas-scaler.js','PhaserCanvasScaler','_createGameWithFallback')+'})._createGameWithFallback',{global,console:{warn(){},error(){}}});
 const scaler={canvas:{parentNode:{removeChild(){}}},opts:{preventDefaultEvents:false},_schedule:fn=>fn(),_applyCanvasStyles(){},_onContextLost:onLost,_onContextRestored:onRestored};fn.call(scaler,{});
 assert.deepEqual(canvas.listeners,[['webglcontextlost',onLost],['webglcontextrestored',onRestored]]);
});
test('ruler draws labels at their original positions with one RenderTexture batch',()=>{
 const fn=vm.runInNewContext('({'+method('Phaser-camera.js','RulerOverlay','_drawOverlayOptimized')+'})._drawOverlayOptimized');const calls=[],texts=[],g={clear(){},lineStyle(){},beginPath(){},moveTo(){},lineTo(){},strokePath(){}};
 const ruler={g,rt:{clear(){},draw(...args){calls.push(args);},setVisible(){}},visible:true,scene:{scale:{width:400,height:300},cameras:{main:{zoom:1}}},
 opt:{unitPx:10,showTicks:true,showNumbers:true,density:1,minPxPerUnitForNumbers:1,maxNumbers:2,radiusX:2,radiusY:2},_safeFormula:x=>String(x),_getText(label,x,y){const text={label,x,y};texts.push(text);return text;},_releaseTextPool(){},_handleError:e=>{throw e;}};
 fn.call(ruler,0,0);assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.equal(calls[0][0].length,11);assert.equal(calls[0][0].at(-1),g);assert.equal(texts[0].x,180);assert.equal(texts[5].y,130);
});
