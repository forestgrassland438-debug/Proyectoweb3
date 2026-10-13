'use strict';
// DOM del juego y Phaser reales; sesión y peticiones solo del fixture local.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'GrasslandBuild/dist');
const libs=['LoadingSystem.js','NotificationHub.js','CraftingHub.js','gf-mascota.js','gf-traductor.js','gf-amigos.js','gf-chat-social.js','gf-lands.js','gf-nft.js','gf-graphics-settings.js'];
const body=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture=`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styless.css"><link rel="stylesheet" href="gf-hud.css"></head><body>${body}
<script>
const watched=new Map(),nativeAdd=document.addEventListener.bind(document),nativeRemove=document.removeEventListener.bind(document);
document.addEventListener=(type,fn,options)=>{if(!options?.once){const key=type+':'+Boolean(typeof options==='boolean'?options:options?.capture);if(!watched.has(key))watched.set(key,new Set());watched.get(key).add(fn);}return nativeAdd(type,fn,options);};
document.removeEventListener=(type,fn,options)=>{const key=type+':'+Boolean(typeof options==='boolean'?options:options?.capture);watched.get(key)?.delete(fn);return nativeRemove(type,fn,options);};
window.__docListeners=()=>[...watched.values()].reduce((n,set)=>n+set.size,0);
window.fetch=async()=>new Response(JSON.stringify({ok:true,configurada:false,calidad:'alta',chunks:12,pet:{health:100,maxHealth:100,alive:true,mode:'passive'}}),{headers:{'Content-Type':'application/json'}});
</script><script src="vendor/phaser.min.js"></script>${libs.map(f=>`<script src="${f}"></script>`).join('')}</body></html>`;
async function main(){
  fs.mkdirSync(dist,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');if(url.pathname==='/__libraries'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.wav':'audio/wav'};
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,chromiumSandbox:true});
  const errors=[],samples=[];const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const mobile of [false,true]){
      const page=await browser.newPage({viewport:mobile?{width:915,height:412}:{width:1280,height:720},hasTouch:mobile});page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.fulfill({status:200,contentType:'application/json',body:'{}'}));
      await page.goto(origin+'/__libraries',{waitUntil:'networkidle'});
      const result=await page.evaluate(async()=>{
        const check=(ok,msg)=>{if(!ok)throw new Error(msg);},samples=[];let active=null,shared;
        const socket=new Phaser.Events.EventEmitter();socket.connected=true;window.globalSocket=socket;
        window.game={scene:{getScenes:()=>active?[active]:[],getScene:()=>active}};
        const makeScene=()=>({events:new Phaser.Events.EventEmitter(),sys:{settings:{key:'GameScene'}},scene:{key:'GameScene'},
          game:window.game,serverBase:location.origin,serverclient:location.origin+'/api',playerName:'Tester',isAuthenticated:true,socket,
          input:{keyboard:{enabled:true,keys:{},resetKeys(){}}},STATE:{slots:Array(24).fill(null),quickSlots:Array(6).fill(null),chestSlots:[],nivel:100},nivel:100,
          _tecladoLibre:()=>!document.getElementById('crafting-hub').classList.contains('crafting-hub-visible')});
        let baseline;
        for(let cycle=0;cycle<30;cycle++){
          active=makeScene();const sc=active;
          const craft=cycle<10?(shared||(shared=new CraftingSystem(sc))):new CraftingSystem(sc);craft.scene=sc;
          for(let n=0;n<3;n++){GFAmigos.montar(sc);GFChatSocial.montar(sc);GFLands.montar(sc);}
          check(sc.events.listenerCount('shutdown')===4,'Listeners duplicados de escena: '+sc.events.listenerCount('shutdown'));
          craft.show();craft.hide();craft.disablePhaserInput();craft.disablePhaserInput();craft.enablePhaserInput();check(sc.input.keyboard.enabled,'Teclado retenido');
          GFAmigos.menuJugador(sc,{_displayName:'Friend',_playerName:'friend'},{clientX:200,clientY:200});GFAmigos.cerrarMenuJugador();
          const a=new LoadingSystem(),b=new LoadingSystem();const p=a.showTimed(2000);b.show({message:'Next load'});await p;a.destroy();check(b.overlay.isConnected,'Overlay eliminado por instancia anterior');b.destroy();
          const hub=new NotificationHub();hub.show('Cycle '+cycle);hub.destroy();check(hub.notifications.size===0,'Notificaciones retenidas');
          sc.events.emit(cycle%2?'shutdown':'destroy');check(craft.scene===null,'Crafting retuvo una escena');check(sc.events.eventNames().length===0,'Persisten listeners de escena');
          if(cycle>=10)craft.destroy();if(cycle===9){shared.destroy();shared=null;}
          active=null;await new Promise(r=>setTimeout(r,25));
          const sample={cycle,docListeners:window.__docListeners(),menus:document.querySelectorAll('#gfa-menu-jugador,#gfa-menu-conv,#gfa-paleta-reac').length,
            notificationHubs:document.querySelectorAll('#notification-hub').length,loadingOverlays:document.querySelectorAll('#loading-overlay').length};
          check(sample.menus===0&&sample.notificationHubs===0&&sample.loadingOverlays===0,'DOM pendiente: '+JSON.stringify(sample));
          if(cycle===10)baseline=sample.docListeners;if(cycle>10)check(sample.docListeners===baseline,'Crecimiento de escuchas DOM: '+JSON.stringify(sample));samples.push(sample);
        }
        window.loadingSystem.show({message:'Singleton after recreation'});check(window.loadingSystem.overlay.isConnected,'Singleton usa un overlay desconectado');window.loadingSystem.destroy();
        return samples;
      });samples.push({mobile,cycles:result});await page.close();
    }
    const environment=await browser.newPage();environment.on('pageerror',e=>errors.push(e.message));
    await environment.goto(origin+'/_prueba_memoria_ciclos.html',{waitUntil:'networkidle'});await environment.locator('#run').click();
    await environment.waitForFunction(()=>/CORRECTO|FALLO/.test(document.getElementById('out').textContent),{},{timeout:60000});
    const environmentResult=await environment.locator('#out').textContent();assert.ok(environmentResult.includes('CORRECTO'),environmentResult);assert.equal(errors.length,0,JSON.stringify(errors));
    fs.writeFileSync(path.join(dist,'libraries-browser-verification.json'),JSON.stringify({panelCycles:60,environmentCycles:20,errors,samples,environmentResult},null,2));
    console.log('60 ciclos de paneles (escritorio/móvil), 20 ciclos WebGL y cero errores de JavaScript.');await environment.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
