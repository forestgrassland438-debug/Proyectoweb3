'use strict';
// Real Phaser/WebGL, local art, synthetic session/API. No real wallet or DB.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'audits/library-completion-20261021T054816Z');
const scripts=['vendor/phaser.min.js','gf-bronce.js','gf-vip.js','gf-sin-nombre.js','gf-soulbound-custom.js','gf-npcs.js','gf-npcs-pueblo.js','gf-camellos.js','gf-jefes.js','gf-zonas.js','gf-espada.js'];
async function main(){
 const server=http.createServer((req,res)=>{
  const rel=new URL(req.url,'http://local').pathname.slice(1);
  if(!rel){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="stage"></div><div id="quick-slots-bar"></div><script>window.GF_API_BASE=location.origin;window.GFMascota={api:async()=>({ok:true,datos:{ok:true,activo:false,facturas:[],planes:{}}})};window.GFSoulbound={actual:()=>"personaje1",ficha:()=>({nombre:"Oliver",genero:"male"}),elegir:async()=>true};</script>'+scripts.map(f=>'<script src="/'+f+'"></script>').join('')+'</body></html>');return;}
  if(!scripts.includes(rel)&&!/^Game\/Sprites\/(npcs|camello3d|Soulbound\/partes)\/[A-Za-z0-9_.-]+$/.test(rel)){res.writeHead(404).end();return;}
  const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage(),errors=[],origin='http://127.0.0.1:'+server.address().port;let atlasReads=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/Soulbound/partes/personaje1_orig.'))atlasReads++;});
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.addInitScript(()=>{
   const intervals=new Set(),add=setInterval,remove=clearInterval,keydown=new Set(),listen=document.addEventListener.bind(document),unlisten=document.removeEventListener.bind(document);
   window.__intervals=intervals;window.__keydown=keydown;
   window.setInterval=(...args)=>{const id=add(...args);intervals.add(id);return id;};window.clearInterval=id=>{intervals.delete(id);return remove(id);};
   document.addEventListener=(type,fn,...args)=>{if(type==='keydown')keydown.add(fn);return listen(type,fn,...args);};
   document.removeEventListener=(type,fn,...args)=>{if(type==='keydown')keydown.delete(fn);return unlisten(type,fn,...args);};
  });await page.goto(origin,{waitUntil:'load'});
  await page.evaluate(()=>new Promise(resolve=>{
   class ReviewScene extends Phaser.Scene{
    constructor(){super('ReviewScene');}
    preload(){GFCamellos.precargar(this);for(const a of ['joe','guardabosques'])this.load.atlas('gfn_'+a,'/Game/Sprites/npcs/'+a+'.png','/Game/Sprites/npcs/'+a+'.json');}
    create(){window.__reviewScene=this;this.playerName='Alice';this.Username='Alice';this.map={widthInPixels:5024,heightInPixels:5024,getObjectLayer:()=>null};this._chocaConEscenario=()=>false;this.player={x:2500,y:2500,active:true};this.sprite_npc1=this.add.image(100,150,'gfn_joe','abajo_1').setAlpha(.73).setInteractive();resolve();}
   }
   window.game=new Phaser.Game({type:Phaser.WEBGL,width:640,height:360,parent:'stage',banner:false,audio:{noAudio:true},scene:ReviewScene});
  }));
  const result=await page.evaluate(async()=>{
   const sc=window.__reviewScene,check=(ok,msg)=>{if(!ok)throw Error(msg);};sc.sys.settings.key='SalvajeScene';
   const baseChildren=sc.children.list.length,baseShutdown=sc.events.listenerCount('shutdown'),baseDestroy=sc.events.listenerCount('destroy');
   let nodes=new Set();const audio=new OfflineAudioContext(1,48000,48000);
   for(const method of ['createOscillator','createBufferSource','createGain','createBiquadFilter']){const original=audio[method].bind(audio);audio[method]=(...args)=>{const n=original(...args),disconnect=n.disconnect.bind(n);nodes.add(n);n.disconnect=(...a)=>{nodes.delete(n);return disconnect(...a);};return n;};}sc.sound.context=audio;
   const samples=[];
   for(let i=0;i<50;i++){
    GFNpcs.montar(sc);GFNpcsPueblo.montar(sc);GFCamellos.montar(sc);
    sc._vientoExtra=37;sc._tormentaArena=.31;delete sc._remolinoCerca;
    const zone=GFZonas.montar(sc,['tundra','desierto','cementerio'][i%3]);check(zone,'zone mount failed');zone.onUpdate(1000,16);
    if(i%3===1)sc._tormentaArena=.79;
    GFEspada.mostrarDano(sc,100,150,7);
    const effects=new Set(),A={animar(){},cercaDeMi:()=>false,libre:()=>true,orientar(){},golpearJugador(){},efimero(_st,o){effects.add(o);return o;},soltarEfimero(_st,o){sc.tweens.killTweensOf(o);o.destroy();effects.delete(o);}};
    const st={scene:sc,vivo:true},m={vivo:true,x:300,y:250,spr:{visible:true},def:{nombre:'Fixture boss'}};
    GFJefes.decorar(st,m,A);GFJefes.ejecutar(st,m,{p:'orbes',s:7},A);GFJefes.ejecutar(st,m,{p:'nova'},A);GFJefes._interno.sonido(sc,'rugido',.01);
    GFNpcs.desmontar(sc);GFNpcsPueblo.desmontar(sc);GFCamellos.desmontar(sc);GFZonas.desmontar(sc);sc.__gfEspadaFx.cerrar();st.vivo=false;GFJefes.desmontar(st);
    effects.forEach(o=>{sc.tweens.killTweensOf(o);o.destroy();});
    check(sc._vientoExtra===37,'zone removed a previous wind value');check(sc._tormentaArena===(i%3===1?.79:.31),'zone overwrote an external replacement');check(!Object.prototype.hasOwnProperty.call(sc,'_remolinoCerca'),'zone retained its private ambient field');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const sample={cycle:i,children:sc.children.list.length,shutdown:sc.events.listenerCount('shutdown'),destroy:sc.events.listenerCount('destroy'),textures:sc.textures.getTextureKeys().length,audioNodes:nodes.size};
    check(sample.children===baseChildren,'child growth '+JSON.stringify(sample));check(sample.shutdown===baseShutdown&&sample.destroy===baseDestroy,'lifecycle listener growth '+JSON.stringify(sample));check(nodes.size===0,'audio nodes retained');check(Math.abs(sc.sprite_npc1.alpha-.73)<.001,'original NPC alpha changed');
    if(i)check(sample.textures===samples[0].textures,'texture growth');samples.push(sample);
   }
   const before=window.__keydown.size;
   const apiOriginal=GFMascota.api,pending={weekly:[],claims:[],exchanges:[]};
   GFMascota.api=(url)=>new Promise(resolve=>{if(url==='/api/currency/weekly')pending.weekly.push(resolve);else if(url==='/api/currency/weekly/claim')pending.claims.push(resolve);else if(url==='/api/currency/exchange')pending.exchanges.push(resolve);else resolve({ok:true,datos:{}});});
   sc.moneda_plata=7;GFBronce.adoptarStats({bronce:2000});
   const currency=document.createElement('div');currency.id='gf-currency-modal';currency.innerHTML='<div><div><button id="gfc-gift-silver">Silver</button></div><p id="gfc-gift-msg"></p><div id="gfc-exc"></div></div>';document.body.append(currency);
   await new Promise(r=>setTimeout(r,0));const gift=currency.querySelector('#gfc-gift-bronze'),exchange=currency.querySelector('#gfb-go');check(gift.disabled,'gift enabled before availability check');
   pending.weekly[0]({ok:true,datos:{gifts:{bronze:{available:true,amount:1000}}}});await new Promise(r=>setTimeout(r,0));gift.click();gift.onclick();check(pending.claims.length===1&&gift.disabled,'gift submitted twice');
   exchange.click();currency.querySelector('#gfb-dir-b2s').click();check(exchange.disabled,'exchange direction reenabled a pending submission');exchange.onclick();check(pending.exchanges.length===1,'duplicate exchange submitted');
   pending.exchanges[0]({ok:true,datos:{ok:true,stats:{bronce:3000,moneda_plata:6}}});await new Promise(r=>setTimeout(r,0));check(currency.querySelector('#gfb-msg').textContent.includes('Bronze'),'exchange feedback used the wrong direction');
   pending.claims[0]({ok:true,datos:{ok:true,amount:1000,stats:{bronce:4000}}});await new Promise(r=>setTimeout(r,0));pending.weekly[1]({ok:true,datos:{gifts:{bronze:{available:false,msLeft:86400000}}}});await new Promise(r=>setTimeout(r,0));check(gift.disabled,'claimed gift enabled');currency.remove();GFMascota.api=apiOriginal;
   for(let i=0;i<30;i++)GFVip.abrirInfo();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));check(window.__keydown.size===before,'VIP modal keydown leak');
   let first,last;
   for(let i=0;i<48;i++){const id='personaje1--m0'+(i%12).toString(36)+Math.floor(i/12).toString(36)+'00000';check(await GFSoulboundCustom.preparar(id),'appearance failed '+id);const data=GFSoulboundCustom.perfil(id);if(!i)first=data;last=data;}
   check(first!==last,'different palettes produced the same portrait');check(GFSoulboundCustom.diagnostico().apariencias<=24,'unbounded appearances');
   for(let i=0;i<30;i++){GFSoulboundCustom.abrir(sc);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));}
   await new Promise(r=>setTimeout(r,400));check(window.__keydown.size===before,'customization modal keydown leak');
   const cache=GFSoulboundCustom.diagnostico();GFSoulboundCustom.destruir();GFBronce.destruir();GFVip.destruir();
   check(window.__intervals.size===0,'module intervals retained after teardown');
   return{cycles:50,samples,cache,modalReplacements:60,currencyChecks:2,remainingIntervals:window.__intervals.size};
  });assert.deepEqual(errors,[]);assert.equal(atlasReads,2);fs.writeFileSync(path.join(report,'browser-remaining.json'),JSON.stringify({...result,atlasReads,errors,fixtureOnly:true},null,2));console.log(JSON.stringify({cycles:result.cycles,modalReplacements:result.modalReplacements,cache:result.cache,atlasReads,errors}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
