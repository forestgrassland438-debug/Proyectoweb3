'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNativeSession,trustedGameURL,safeExternalURL,gameURL}=require('../desktop/native-session.cjs');
const account={authenticated:true,address:'0x'+'a'.repeat(40),playerName:'Player'};
function fixture(responses) {
  const states=[],games=[],browser=[],requests=[],timers=new Map(); let id=0,cleared=0;
  const client=createNativeSession({platform:'win32',state:s=>states.push(s),play:async url=>games.push(url),
    clearSession:async()=>{cleared++;},
    openBrowser:async (...args)=>browser.push(args),setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),
    fetch:async(url,opts)=>{requests.push({url,opts});const item=responses.shift();if(!item)throw Error('missing fixture');return {status:item.status,json:async()=>item.data||{}};} });
  return {client,states,games,browser,requests,timers,get cleared(){return cleared;},tick:async()=>{const entry=[...timers].find(([,t])=>t.ms<12000);assert.ok(entry);timers.delete(entry[0]);await entry[1].fn();}};
}
test('una sesión nativa guardada abre el juego directamente dentro de la app',async()=>{
  const f=fixture([{status:200,data:account}]);await f.client.resume();
  assert.equal(f.games.length,1);assert.equal(f.browser.length,0);assert.equal(f.states.at(-1).kind,'playing');
});
test('el acceso caducado se renueva antes de pedir otra autenticación',async()=>{
  const f=fixture([{status:401},{status:200},{status:200,data:account}]);await f.client.resume();
  assert.equal(f.games.length,1);assert.ok(f.requests[1].url.endsWith('/api/auth/refresh'));assert.equal(f.timers.size,0);
});
test('Check saved session sin cookie inicia vinculación con el navegador elegido en los tres SO',async()=>{
  for(const browser of ['system','edge','firefox']){
    const f=fixture([{status:401},{status:401},{status:200,data:{id:'a'.repeat(32),code:'123456',expiresIn:600}}]);
    await f.client.resume(browser);assert.equal(f.browser.length,1);assert.equal(f.browser[0][0],browser);
    assert.equal(f.states.at(-1).code,'123456');assert.equal(f.games.length,0);f.client.dispose();assert.equal(f.timers.size,0);
  }
});
test('una caída de red al verificar no abre un navegador ni crea otra vinculación',async()=>{
  const f=fixture([{status:503}]);await f.client.resume('system');assert.equal(f.browser.length,0);assert.equal(f.states.at(-1).kind,'error');
});
test('login externo se sigue, valida la cookie recibida y abre el juego nativo una vez',async()=>{
  const f=fixture([{status:200,data:{id:'a'.repeat(32),code:'123456',expiresIn:600}},{status:202},
    {status:200,data:{...account,walletKind:'metamask'}},{status:200,data:account}]);
  assert.equal((await f.client.start('firefox')).ok,true);
  assert.equal(new URL(f.browser[0][1]).origin,'https://app.grasslandforest.com');
  const proof=JSON.parse(f.requests[0].opts.body);assert.equal(proof.verifier,undefined);
  await f.tick();assert.equal(f.games.length,0);await f.tick();
  assert.equal(f.games.length,1);assert.ok(f.games[0].includes('wallet=metamask'));assert.equal(f.states.at(-1).kind,'playing');
  assert.equal(f.timers.size,0);
});
test('cancelar libera el temporizador y una aprobación antigua no abre una partida',async()=>{
  const f=fixture([{status:200,data:{id:'a'.repeat(32),code:'123456',expiresIn:600}}]);
  await f.client.start('system');assert.equal(f.timers.size,1);f.client.cancel();assert.equal(f.timers.size,0);assert.equal(f.games.length,0);
});
test('los destinos rechazan hosts parecidos, credenciales y esquemas nativos',()=>{
  assert.equal(trustedGameURL('https://game.grasslandforest.com/?address=x'),true);
  for(const url of ['https://game.grasslandforest.com.attacker.test','https://user@game.grasslandforest.com','http://game.grasslandforest.com','file:///C:/Windows','javascript:alert(1)'])assert.equal(trustedGameURL(url),false);
  assert.equal(safeExternalURL('https://metamask.app.link/'),true);assert.equal(safeExternalURL('metamask://foo'),false);
  assert.throws(()=>gameURL({authenticated:false,address:account.address}));
});
test('cerrar sesión cancela la espera, revoca con CSRF y elimina las cookies del cliente',async()=>{
  const f=fixture([{status:200,data:{id:'a'.repeat(32),code:'123456',expiresIn:600}},
    {status:200,data:{csrfToken:'fixture-csrf'}},{status:200,data:{ok:true}}]);
  await f.client.start('system');assert.equal(f.timers.size,1);
  assert.equal((await f.client.signOut()).ok,true);assert.equal(f.timers.size,0);assert.equal(f.cleared,1);
  assert.ok(f.requests.at(-1).url.endsWith('/api/auth/logout'));assert.equal(f.requests.at(-1).opts.headers['X-CSRF-Token'],'fixture-csrf');
  assert.equal(f.states.at(-1).kind,'signed-out');assert.equal(f.games.length,0);
});
test('cerrar sesión sin red elimina la sesión local y cambiar de cuenta exige elegirla en el login',async()=>{
  const f=fixture([]);assert.equal((await f.client.signOut()).ok,true);assert.equal(f.cleared,1);
  f.client.cancel();
  const g=fixture([{status:200,data:{id:'b'.repeat(32),code:'654321',expiresIn:600}}]);
  await g.client.start('system',true);assert.equal(new URL(g.browser[0][1]).searchParams.get('native_action'),'choose_account');g.client.dispose();
});
