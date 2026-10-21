'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../admin-session.js'),'utf8');
const address='0x'+'1'.repeat(40);
function fixture(fetcher,{parent,cookie='csrf-token=cookie-token'}={}){
  const events=new Map(),root={addEventListener(name,fn){events.set(name,fn);}};root.parent=parent||root;
  const context={window:root,location:{hostname:'127.0.0.1',origin:'http://127.0.0.1:8137'},document:{cookie},fetch:fetcher,Headers,AbortController,DOMException,setTimeout,clearTimeout,URL,Date,btoa};
  vm.createContext(context);vm.runInContext(source,context);return {api:root.GFAdminSession,root,context,events};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('many simultaneous expired admin requests renew one session and retry with the new CSRF token',async()=>{
  let active=false,refreshes=0;const received=[];
  const f=fixture(async(url,options)=>{
    const p=new URL(url).pathname;
    if(p==='/api/auth/refresh'){refreshes++;await new Promise(r=>setTimeout(r,25));active=true;return json({csrfToken:'new-token'});}
    received.push(options.headers.get('X-CSRF-Token'));
    return active?json({ok:true}):json({error:'admin_auth_required'},401);
  });
  const results=await Promise.all(Array.from({length:20},()=>f.api.request('/api/admin/example')));
  assert.ok(results.every(r=>r.ok));assert.equal(refreshes,1);assert.equal(received.at(-1),'new-token');assert.equal(f.api.diagnostics().pending,0);f.api.dispose();
});
test('a stale cross-subdomain cookie cannot override the repaired JSON CSRF token',async()=>{
  const headers=[];let csrfReads=0;
  const f=fixture(async(url,options)=>{
    if(new URL(url).pathname==='/api/auth/csrf-token'){csrfReads++;return json({csrfToken:'repaired-token'});}
    headers.push(options.headers.get('X-CSRF-Token'));
    return headers.length===1?json({error:'csrf_token_invalid'},403):json({saved:true});
  });
  const result=await f.api.request('/api/admin/example',{method:'PUT',body:'{}',headers:{'X-CSRF-Token':'page-stale-token'}});
  assert.equal(result.saved,true);assert.equal(csrfReads,1);assert.deepEqual(headers,['cookie-token','repaired-token']);f.api.dispose();
});
test('failed refresh locks a previously verified workspace; unavailable RPC never initiates wallet signing',async()=>{
  let reason='';let signatures=0;
  const f=fixture(async url=>json({error:'unauthorized'},401));f.api.subscribe(value=>{reason=value;});
  await assert.rejects(f.api.request('/api/admin/example'),e=>e.status===401);assert.equal(reason,'session_expired');f.api.dispose();
  const offline=fixture(async()=>json({error:'admin_verification_unavailable'},503));
  offline.root.ethereum={request:async({method})=>{if(method==='personal_sign')signatures++;return[address];}};
  await assert.rejects(offline.api.signIn(),e=>e.status===503);assert.equal(signatures,0);offline.api.dispose();
});
test('removing a child tool aborts its requests while preserving the parent session',async()=>{
  let parentCalls=0;
  const parent=fixture(async(url,options)=>{
    parentCalls++;
    if(new URL(url).pathname==='/api/admin/slow')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
    return json({ok:true});
  });
  parent.root.location={origin:'http://127.0.0.1:8137'};
  const child=fixture(()=>{throw Error('Child must reuse parent transport');},{parent:parent.root});
  const slow=child.api.request('/api/admin/slow');child.api.dispose();await assert.rejects(slow,e=>e.name==='AbortError');
  assert.equal((await parent.api.request('/api/admin/alive')).ok,true);assert.equal(parentCalls,2);assert.equal(parent.api.diagnostics().pending,0);parent.api.dispose();
});
test('logout waits for a pending renewal and cannot be followed by stale session cookies',async()=>{
  const calls=[];let finish;
  const f=fixture(async url=>{
    const p=new URL(url).pathname;calls.push(p);
    if(p==='/api/auth/refresh')return new Promise(resolve=>{finish=()=>resolve(json({csrfToken:'rotated'}));});
    if(p==='/api/auth/csrf-token')return json({csrfToken:'rotated'});
    return json({ok:true});
  });
  const renewing=f.api.refresh(),logout=f.api.logout();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['/api/auth/refresh']);finish();await renewing;await logout;
  assert.deepEqual(calls,['/api/auth/refresh','/api/auth/csrf-token','/api/auth/logout']);assert.equal(f.api.diagnostics().pending,0);f.api.dispose();
});
