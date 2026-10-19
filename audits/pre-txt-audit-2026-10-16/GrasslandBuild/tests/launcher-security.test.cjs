'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
async function fixture(){
  const handlers=new Map(),calls=[],views=[],windows=[];
  const app=new EventEmitter();Object.assign(app,{enableSandbox(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getVersion:()=> '1.1.0',getPath:()=>'/qa',quit(){}});
  const gameSession=new EventEmitter();Object.assign(gameSession,{fetch(){},setPermissionRequestHandler(fn){this.permission=fn;},setPermissionCheckHandler(fn){this.check=fn;},setDevicePermissionHandler(fn){this.device=fn;}});
  function contents(){const wc=new EventEmitter();Object.assign(wc,{mainFrame:{url:''},send(){},setWindowOpenHandler(fn){this.popup=fn;},close(){this.closed=true;},loadURL:async url=>{wc.mainFrame.url=url;},session:gameSession});return wc;}
  class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=contents();this.children=[];this.contentView={addChildView:v=>this.children.push(v),removeChildView:v=>this.children.splice(this.children.indexOf(v),1)};windows.push(this);}isDestroyed(){return false;}getContentSize(){return[1280,800];}loadFile(file){this.webContents.mainFrame.url=require('node:url').pathToFileURL(file).href;return Promise.resolve();}}
  class View{constructor(options){this.options=options;this.webContents=contents();views.push(this);}setBounds(bounds){this.bounds=bounds;}}
  let controller;
  const native=require('../desktop/native-session.cjs');
  const file=path.resolve(__dirname,'../desktop/main.cjs');
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{__dirname:path.dirname(file),process:{platform:'win32',env:{}},URL,require:id=>{
    if(id==='electron')return{app,BrowserWindow:Window,WebContentsView:View,session:{fromPartition:()=>gameSession},ipcMain:{handle:(id,fn)=>handlers.set(id,fn)},shell:{openExternal:async url=>calls.push(url)}};
    if(id==='node:fs')return{existsSync:()=>true,readFileSync(){throw Error('empty');},mkdirSync(){},writeFileSync(){}};
    if(id==='./native-session.cjs')return{...native,createNativeSession:options=>controller={resume:async()=>{},cancel(){},dispose(){},start:id=>options.openBrowser(id,'https://app.grasslandforest.com/#native_pair='+'a'.repeat(32)),play:options.play}};
    return id.startsWith('./')?require(path.resolve(path.dirname(file),id)):require(id);
  }});
  await new Promise(resolve=>setImmediate(resolve));
  return{handlers,calls,views,windows,gameSession,controller,event:()=>({sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame})};
}
test('ningún frame remoto o secundario puede utilizar el puente local',async()=>{
  const f=await fixture();for(const id of ['gf:config','gf:open','gf:resume','gf:cancel','gf:signout','gf:switch']){
    assert.throws(()=>f.handlers.get(id)({sender:{},senderFrame:f.event().senderFrame},'system'),/Unauthorized/);
    assert.throws(()=>f.handlers.get(id)({sender:f.event().sender,senderFrame:{url:f.event().senderFrame.url}},'system'),/Unauthorized/);
  }
  assert.equal(f.handlers.get('gf:config')(f.event()).selected,'system');
  assert.equal((await f.handlers.get('gf:open')(f.event(),'--no-sandbox')).ok,false);assert.equal(f.calls.length,0);
});
test('el juego usa una vista aislada sin preload y solo permite su origen HTTPS',async()=>{
  const f=await fixture();await f.controller.play('https://game.grasslandforest.com/');
  const view=f.views[0],prefs=view.options.webPreferences;
  assert.equal(prefs.partition,'persist:grassland-game-v1');assert.equal(prefs.nodeIntegration,false);
  assert.equal(prefs.contextIsolation,true);assert.equal(prefs.sandbox,true);assert.equal(prefs.webSecurity,true);assert.equal(prefs.preload,undefined);
  let blocked=0;view.webContents.emit('will-navigate',{preventDefault(){blocked++;}},'file:///C:/Windows');assert.equal(blocked,1);
  assert.equal(view.webContents.popup({url:'javascript:alert(1)'}).action,'deny');assert.equal(f.calls.length,0);
  assert.equal(view.webContents.popup({url:'https://metamask.app.link/'}).action,'deny');assert.equal(f.calls.length,1);
  f.gameSession.permission(null,'camera',result=>assert.equal(result,false));assert.equal(f.gameSession.check(),false);assert.equal(f.gameSession.device(),false);
  f.gameSession.emit('will-download',{preventDefault(){blocked++;}});assert.equal(blocked,2);
  await assert.rejects(f.controller.play('https://game.grasslandforest.com.evil.test/'));
});
test('reabrir o reconectar no acumula vistas ni listeners de descarga',async()=>{
  const f=await fixture();await f.controller.play('https://game.grasslandforest.com/');await f.controller.play('https://game.grasslandforest.com/');
  assert.equal(f.views[0].webContents.closed,true);assert.equal(f.windows[0].children.length,1);
  f.windows[0].emit('closed');assert.equal(f.views[1].webContents.closed,true);
  assert.equal(f.gameSession.listenerCount('will-download'),1);
});
