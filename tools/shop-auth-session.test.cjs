'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const account={authenticated:true,address:'0x'+'a'.repeat(40),playerName:'Ana'};
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(){
  const calls=[];let expired=false,mode='normal',gate;
  const response=(status,data)=>({ok:status===200,status,statusText:'fixture',text:async()=>JSON.stringify(data)});
  const context={window:{},document:{cookie:''},location:{hostname:'game.grasslandforest.com',href:'https://game.grasslandforest.com/'},
    console:{log(){},warn(){},error(){}},URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,
    Phaser:{Scene:class{}},fetch:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/ping'))return response(200,{});
      if(url.endsWith('/auth/refresh')){if(gate)await gate.promise;expired=false;return response(200,{csrfToken:'rotated'});}
      if(mode==='network')throw Error('offline');
      if(mode==='busy')return response(503,{error:'unavailable'});
      if(mode==='denied')return response(401,{authenticated:false,error:'authentication_required'});
      return expired?response(401,{error:'token_expired'}):response(200,account);
    }};
  vm.createContext(context);vm.runInContext(fs.readFileSync('phaser-relay-library.js','utf8'),context);
  const Relay=context.window.PhaserRelay;
  const relays=[];
  return {context,Relay,calls,newRelay(){const relay=new Relay({useNotificationHub:false,retryDelay:0,maxRetries:1});relays.push(relay);return relay;},
    expire(){expired=true;gate=deferred();return gate;},mode(v){mode=v;},destroy(){relays.forEach(r=>r.cleanup());}};
}
test('la tienda usa la API de producción y espera la inicialización compartida',async()=>{
  const f=fixture();try{const r=f.newRelay();assert.equal(r.config.apiBase,'https://api.grasslandforest.com');
    assert.equal(r.initialize(),r.initialize());await r.initialize();
    assert.equal(f.calls.filter(c=>c.url.endsWith('/auth/me')).length,1);
    assert.equal((await r.checkAuth()).address,account.address);
    assert.ok(f.calls.every(c=>c.options.credentials==='include'));assert.equal(r.authToken,null);
  }finally{f.destroy();}
});
test('renovar desde dos relays y la escena de tienda a la vez rota la cookie una sola vez',async()=>{
  const f=fixture();try{
    const a=f.newRelay(),b=f.newRelay();await Promise.all([a.initialize(),b.initialize()]);
    vm.runInContext(fs.readFileSync('Scenes/GameScene.js','utf8'),f.context);
    vm.runInContext(fs.readFileSync('Scenes/tiendajuego.js','utf8'),f.context);
    const scene=Object.create(f.context.window.tiendajuego.prototype);scene.serverBase=a.config.apiBase;
    const gate=f.expire();const results=[a.checkAuth(),a.checkAuth(),b.checkAuth(),scene.refreshAuthToken(),scene.refreshAuthToken()];
    await new Promise(setImmediate);
    assert.equal(f.calls.filter(c=>c.url.endsWith('/auth/refresh')).length,1);gate.resolve();
    const values=await Promise.all(results);assert.ok(values.slice(0,3).every(v=>v.success));assert.deepEqual(values.slice(3),[true,true]);
    assert.equal(scene.csrfToken,'rotated');assert.equal(f.Relay._sessionRefreshes.size,0);
  }finally{f.destroy();}
});
test('un corte de red o servidor ocupado no pide volver a iniciar sesión',async()=>{
  const f=fixture();try{const r=f.newRelay();await r.initialize();
    for(const mode of ['network','busy']){f.mode(mode);const result=await r.checkAuth();assert.equal(result.success,false);assert.equal(result.requiresReauth,false);assert.match(r.authErrorMessage(result),/conexión/);}
    f.mode('denied');const result=await r.checkAuth();assert.equal(result.requiresReauth,true);assert.match(r.authErrorMessage(result),/Inicia sesión/);
  }finally{f.destroy();}
});
test('liberar un relay mientras otro renueva no restaura sus credenciales ni cancela al otro',async()=>{
  const f=fixture();try{const a=f.newRelay(),b=f.newRelay();await Promise.all([a.initialize(),b.initialize()]);
    const gate=f.expire(),one=a._refreshToken(),two=b._refreshToken();a.cleanup();gate.resolve();
    assert.deepEqual(await Promise.all([one,two]),[false,true]);assert.equal(a.csrfToken,null);assert.equal(a._autoRefreshInterval,null);assert.equal(f.Relay._sessionRefreshes.size,0);
  }finally{f.destroy();}
});
