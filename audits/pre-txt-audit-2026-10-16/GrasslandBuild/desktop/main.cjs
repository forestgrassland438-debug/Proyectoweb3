'use strict';
const { app,BrowserWindow,WebContentsView,ipcMain,shell,session }=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const {installedBrowsers}=require('./browser-host.cjs');
const {createNativeSession,trustedGameURL,safeExternalURL}=require('./native-session.cjs');
app.enableSandbox();
let launcher,gameView,client;
const configuredSessions=new WeakSet();
let currentState={kind:'checking',message:'Checking your saved session…'};
const page=path.join(__dirname,'launcher.html'),pageUrl=pathToFileURL(page).href;
function trusted(event) { return !!launcher && event.sender===launcher.webContents && event.senderFrame===launcher.webContents.mainFrame && event.senderFrame.url===pageUrl; }
function browsers(){return installedBrowsers(process.platform,process.env,fs.existsSync);}
function preference(){try{const id=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'browser.json'),'utf8')).browser;return id==='system'||browsers().some(b=>b.id===id)?id:'system';}catch{return 'system';}}
function publish(state){currentState=state;if(launcher&&!launcher.isDestroyed())launcher.webContents.send('gf:state',state);}
function closeGame(){if(!gameView)return;launcher?.contentView.removeChildView(gameView);gameView.webContents.close();gameView=null;}
function layout(){if(gameView&&launcher){const [width,height]=launcher.getContentSize();gameView.setBounds({x:0,y:68,width,height:Math.max(1,height-68)});}}
async function openBrowser(id,url){
  const selected=id==='system'?null:browsers().find(b=>b.id===id);
  if(id!=='system'&&!selected)throw Error('Browser unavailable');
  if(new URL(url).origin!=='https://app.grasslandforest.com')throw Error('Invalid login URL');
  if(!selected)await shell.openExternal(url);
  else await new Promise((resolve,reject)=>{const child=spawn(selected.path,[selected.id==='firefox'?'-new-window':'--new-window',url],{detached:true,stdio:'ignore',shell:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
  fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(path.join(app.getPath('userData'),'browser.json'),JSON.stringify({browser:id}));
}
async function play(url){
  if(!launcher||!trustedGameURL(url))throw Error('Invalid game URL');
  closeGame();
  const view=new WebContentsView({webPreferences:{partition:'persist:grassland-game-v1',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:false,backgroundThrottling:true}});
  gameView=view;launcher.contentView.addChildView(view);layout();
  view.webContents.setWindowOpenHandler(({url})=>{if(safeExternalURL(url))shell.openExternal(url).catch(()=>{});return {action:'deny'};});
  view.webContents.on('will-attach-webview',event=>event.preventDefault());
  const navigate=(event,url)=>{
    if(trustedGameURL(url))return;
    event.preventDefault();
    // Al cerrar sesión o caducar la cookie, volver al controlador local.
    try{if(new URL(url).origin==='https://app.grasslandforest.com'){closeGame();client.cancel();publish({kind:"signed-out",message:"Your game session ended. Sign in or check the saved session to continue."});}}catch{}
  };
  view.webContents.on('will-navigate',navigate);
  view.webContents.on('will-redirect',navigate);
  view.webContents.on('render-process-gone',()=>{if(gameView===view){closeGame();publish({kind:'error',message:'The game stopped unexpectedly. Reconnect to reopen it.'});}});
  view.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3&&gameView===view){closeGame();publish({kind:'error',message:'The game could not load. Check your connection and reconnect.'});}});
  await view.webContents.loadURL(url);
}
function createLauncher(){
  launcher=new BrowserWindow({width:1280,height:800,minWidth:900,minHeight:650,title:'Grassland Forest',autoHideMenuBar:true,backgroundColor:'#10251e',icon:path.join(__dirname,'icon.png'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:false}});
  launcher.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  launcher.webContents.on('will-navigate',event=>event.preventDefault());
  launcher.webContents.on('will-attach-webview',event=>event.preventDefault());
  launcher.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  launcher.webContents.session.setPermissionCheckHandler(()=>false);
  const gameSession=session.fromPartition('persist:grassland-game-v1');
  gameSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  gameSession.setPermissionCheckHandler(()=>false);
  gameSession.setDevicePermissionHandler(()=>false);
  if(!configuredSessions.has(gameSession)){gameSession.on('will-download',event=>event.preventDefault());configuredSessions.add(gameSession);}
  client=createNativeSession({fetch:gameSession.fetch.bind(gameSession),platform:process.platform,openBrowser,state:publish,play,
    clearSession:()=>gameSession.clearStorageData({storages:['cookies']}),
    getWalletKind:()=>{try{return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'wallet.json'),'utf8')).kind;}catch{return 'session';}},
    saveWalletKind:kind=>{fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(path.join(app.getPath('userData'),'wallet.json'),JSON.stringify({kind}));}});
  launcher.on('resize',layout);
  launcher.on('closed',()=>{client.dispose();gameView?.webContents.close();gameView=null;launcher=null;});
  launcher.loadFile(page).then(()=>client.resume());
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(launcher){if(launcher.isMinimized())launcher.restore();launcher.focus();}});
  app.whenReady().then(()=>{
    ipcMain.handle('gf:config',event=>{if(!trusted(event))throw Error('Unauthorized frame');return {version:app.getVersion(),selected:preference(),browsers:browsers().map(b=>({id:b.id,name:b.name})),state:currentState};});
    ipcMain.handle('gf:open',(event,id)=>{if(!trusted(event)||typeof id!=='string'||id.length>30)throw Error('Unauthorized request');if(id!=='system'&&!browsers().some(b=>b.id===id))return {ok:false,message:'Choose an installed browser.'};return client.start(id);});
    ipcMain.handle('gf:resume',(event,id)=>{if(!trusted(event)||typeof id!=='string'||(id!=='system'&&!browsers().some(b=>b.id===id)))throw Error('Unauthorized request');closeGame();return client.resume(id);});
    ipcMain.handle('gf:signout',event=>{if(!trusted(event))throw Error('Unauthorized frame');closeGame();return client.signOut();});
    ipcMain.handle('gf:switch',(event,id)=>{if(!trusted(event)||typeof id!=='string'||(id!=='system'&&!browsers().some(b=>b.id===id)))throw Error('Unauthorized request');closeGame();return client.signOut().then(result=>result.ok?client.start(id,true):result);});
    ipcMain.handle('gf:cancel',event=>{if(!trusted(event))throw Error('Unauthorized frame');client.cancel();publish({kind:'signed-out',message:'Sign-in cancelled. You can start again.'});});
    createLauncher();app.on('activate',()=>{if(!launcher)createLauncher();});
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
