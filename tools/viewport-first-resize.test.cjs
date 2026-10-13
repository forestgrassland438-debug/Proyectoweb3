const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('first landscape resize releases the startup height without shrinking for a keyboard',()=>{
  const events=new Map(),styles=new Map(),timers=[];
  const document={readyState:'complete',activeElement:null,documentElement:{style:{setProperty:(k,v)=>styles.set(k,v)}},getElementById:()=>null,addEventListener(){}};
  const window={document,innerWidth:1280,innerHeight:800,visualViewport:{width:1280,height:800,addEventListener(){}},addEventListener:(n,f)=>{const a=events.get(n)||[];a.push(f);events.set(n,a);},dispatchEvent:e=>(events.get(e.type)||[]).forEach(f=>f()),scrollTo(){}};
  vm.runInNewContext(fs.readFileSync('viewport-fix.js','utf8'),{window,document,Date,Event,setTimeout:f=>timers.push(f),setInterval:f=>timers.push(f),clearTimeout(){},clearInterval(){}});
  assert.equal(styles.get('--app-height'),'800px');window.innerWidth=window.visualViewport.width=844;window.innerHeight=window.visualViewport.height=390;
  window.dispatchEvent(new Event('resize'));assert.equal(styles.get('--app-height'),'390px');
  window.innerHeight=window.visualViewport.height=250;document.activeElement={tagName:'INPUT'};window.dispatchEvent(new Event('resize'));assert.equal(styles.get('--app-height'),'390px');
});
