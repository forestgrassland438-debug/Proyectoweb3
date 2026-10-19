'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const modulePromise=import(pathToFileURL(path.resolve('../../login-sonmia/src/components/native-login.mjs')).href);
test('solo reconoce enlaces nativos válidos; enlaces desktop dañados nunca redirigen como web',async()=>{
  const {nativeContext}=await modulePromise;
  assert.deepEqual(nativeContext({hash:'#native_pair='+'a'.repeat(32)}),{kind:'desktop',chooseAccount:false,id:'a'.repeat(32)});
  assert.deepEqual(nativeContext({hash:'#native_pair=https://evil.test'}),{kind:'desktop',chooseAccount:false,id:null});
  assert.equal(nativeContext({search:'?native_client=android'}).kind,'android');assert.equal(nativeContext({search:'?native_client=other'}).kind,'web');
});
test('la autorización exige consentimiento y CSRF y nunca manda la cuenta elegida en el cliente',async()=>{
  const {approvePairing}=await modulePromise;let called=0;
  const fetch=async(url,opts)=>{called++;assert.equal(opts.credentials,'include');assert.equal(opts.headers['X-CSRF-Token'],'csrf-fixture');assert.deepEqual(JSON.parse(opts.body),{id:'a'.repeat(32),walletKind:'social'});return{ok:true,json:async()=>({approved:true})};};
  const args={id:'a'.repeat(32),walletKind:'social',csrf:'csrf-fixture',confirmed:false};
  await assert.rejects(approvePairing(fetch,'https://api.grasslandforest.com',args));assert.equal(called,0);
  await approvePairing(fetch,'https://api.grasslandforest.com',{...args,confirmed:true});assert.equal(called,1);
});
test('la vinculación Android conserva el código aunque exista una sesión guardada',async()=>{
  const {nativeContext,pairingInfo}=await modulePromise;
  const link=nativeContext({search:'?native_client=android',hash:'#native_pair='+'b'.repeat(32)});
  assert.equal(link.kind,'android-pair');assert.equal(link.id,'b'.repeat(32));
  const info=await pairingInfo(async()=>({ok:true,json:async()=>({code:'123456',platform:'android'})}),'https://api.grasslandforest.com',link.id);
  assert.equal(info.code,'123456');
});
