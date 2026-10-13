const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const calls=[],listeners=new Map();let expired=true,pending,refreshes=0;
  const document={visibilityState:'visible',addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);}};
  const original=async(url,init={})=>{calls.push({url:String(url.url||url),init});return new Response(JSON.stringify({ok:true}),{status:expired&&String(url.url||url).includes('/api/data')?401:200});};
  const window={fetch:original,game:{scene:{getScenes:()=>[{player:{},address:'0x1'}]}},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);},PhaserRelay:{_sessionRefreshes:new Map(),refreshSession:()=>{
    if(pending)return pending;refreshes++;pending=Promise.resolve().then(()=>{expired=false;return {ok:true,json:async()=>({csrfToken:'new'})};}).finally(()=>pending=null);return pending;
  }}};
  const context={window,document,location:{hostname:'game.grasslandforest.com',href:'https://game.grasslandforest.com'},URL,Headers,Request,setInterval,clearInterval};vm.createContext(context);vm.runInContext(fs.readFileSync('gf-session-api.js','utf8'),context);
  return{window,calls,listeners,refreshes:()=>refreshes,destroy:()=>window.GFSessionAPI.destroy()};
}
test('concurrent 401 retries share renewal and retain POST bodies with rotated CSRF',async()=>{
  const f=fixture();try{const [a,b]=await Promise.all([f.window.fetch('https://api.grasslandforest.com/api/data',{method:'POST',body:'{"seed":1}'}),f.window.fetch(new Request('https://api.grasslandforest.com/api/data',{method:'POST',body:'{"seed":2}'}))]);
    assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(f.refreshes(),1);assert.equal(f.calls.length,4);assert.equal(f.calls[2].init.headers.get('X-CSRF-Token'),'new');assert.equal(f.calls[2].init.body,'{"seed":1}');
  }finally{f.destroy();}
});
test('third party requests and explicit logout never renew; URL objects work and cleanup removes all listeners',async()=>{
  const f=fixture();await f.window.fetch(new URL('https://third.example/api/data'));assert.equal(f.refreshes(),0);await f.window.fetch('https://api.grasslandforest.com/api/auth/logout');await f.window.GFSessionAPI.tick();assert.equal(f.refreshes(),0);f.destroy();assert.equal(f.listeners.size,0);
});
test('active battles renew cookies and vital mutation revisions change through response completion',async()=>{
  const f=fixture();try{f.window.game.scene.getScenes=()=>[{datosJugador:{address:'0x1'}}];await f.window.GFSessionAPI.tick();assert.equal(f.refreshes(),1);
    const before=f.window.GFSessionAPI.vitalRevision();await f.window.fetch('https://api.grasslandforest.com/api/stats/Tester/consume',{method:'POST'});assert.equal(f.window.GFSessionAPI.vitalRevision(),before+2);
  }finally{f.destroy();}
});
