'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),report=__dirname;
function run(name,args,cwd=root){return new Promise(resolve=>{
 const fd=fs.openSync(path.join(report,name+'.txt'),'w');
 const child=spawn(process.execPath,args,{cwd,stdio:['ignore',fd,fd],windowsHide:true});
 child.on('error',e=>{fs.closeSync(fd);resolve({name,error:e.message,exitCode:-1});});
 child.on('exit',code=>{fs.closeSync(fd);console.log(name+': '+code);resolve({name,exitCode:code});});
});}
function wrapper(name,from,to){
 const original=path.join(root,'tools',name+'.cjs'),code=fs.readFileSync(original,'utf8');
 if(!code.includes(from))throw Error('Missing output path '+name);
 const compiled=code.replace(from,to),runner=path.join(report,'run-'+name+'.cjs');
 fs.writeFileSync(runner,"const M=require('node:module');const m=new M("+JSON.stringify(original)+",module);m.filename="+JSON.stringify(original)+";m.paths=M._nodeModulePaths(require('node:path').dirname(m.filename));m._compile("+JSON.stringify(compiled)+",m.filename);\n");
 return runner;
}
async function main(){
 const names=['gf-bronce','gf-vip','gf-sin-nombre','gf-npcs-pueblo','gf-npcs','gf-camellos','gf-jefes','gf-zonas','gf-soulbound-custom','gf-character-skills','gf-espada','gf-rutas','gf-reposo'];
 const index=path.join(root,'index.html');let html=fs.readFileSync(index,'utf8');
 for(const n of names){
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n+'.js'))).digest('hex').slice(0,12);
  const re=new RegExp('('+n.replaceAll('-','\\-')+'\\.js\\?v=)([0-9]+\\.[0-9]+)(?:\\.[a-f0-9]{12})?(?=["\\\'])','g');
  let matches=0;html=html.replace(re,(_m,p,v)=>{matches++;return p+v+'.'+hash;});
  if(matches!==1)throw Error('Unexpected script count '+n+': '+matches);
 }
 fs.writeFileSync(index,html);
 const tests=fs.readdirSync(path.join(root,'tools')).filter(n=>n.endsWith('.test.cjs')&&n!=='admin-impact-browser.test.cjs').map(n=>'tools/'+n);
 tests.push('tools/web3-seguridad-prueba.cjs','tools/metamask-adapter.test.mjs');
 const tasks=[run('regression-final',['--test','--test-concurrency=3',...tests]),
  run('desktop-regression',['--test',...fs.readdirSync(path.join(root,'GrasslandBuild/tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>'GrasslandBuild/tests/'+n)])];
 const npm=process.env.ProgramFiles+'\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
 if(!fs.existsSync(npm))throw Error('npm CLI not found '+npm);
 for(const [name,cwd,extra] of [['client',root,[]],['desktop',path.join(root,'GrasslandBuild/desktop'),[]],['backend-production',path.join(root,'GrasslandBuild/repositories/backend'),['--omit=dev']],['backend-all',path.join(root,'GrasslandBuild/repositories/backend'),[]]]){
  tasks.push(run('npm-'+name,[npm,'audit','--json',...extra],cwd));
 }
 tasks.push((async()=>{
  const results=[];
  for(const [name,from,to] of [['audit-libraries','GrasslandBuild/dist/libraries-source-audit.json','audits/library-completion-20261021T054816Z/libraries-source-audit.json'],['audit-project-deep','audits/deep-source-inventory.json','audits/library-completion-20261021T054816Z/deep-source-inventory.json'],['txt-project-audit','audits/txt-source-inventory.json','audits/library-completion-20261021T054816Z/txt-source-inventory.json']])results.push(await run(name,[wrapper(name,from,to)]));
  return results;
 })());
 const results=(await Promise.all(tasks)).flat();
 fs.writeFileSync(path.join(report,'final-check-results.json'),JSON.stringify({at:new Date().toISOString(),testFiles:tests.length,results},null,2));
 process.exitCode=results.some(r=>r.exitCode!==0&&r.name!=='npm-backend-all')?1:0;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
