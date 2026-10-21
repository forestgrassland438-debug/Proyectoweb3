'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
async function main(){
 const results=[];
 for(const [name,from,to] of [
  ['libraries-browser-stability',"'GrasslandBuild/dist'","'audits/library-completion-20261021T054816Z/libraries-browser'"],
  ['admin-suite-browser','../audits/admin-suite-20261020-225316/verification','../audits/library-completion-20261021T054816Z/admin-browser'],
  ['admin-impact-browser.test',"'audits', 'impact-frontend-2026-10-14'","'audits/library-completion-20261021T054816Z', 'impact-browser'"]
 ]){
  const original=path.join(root,'tools',name+'.cjs'),source=fs.readFileSync(original,'utf8');
  if(!source.includes(from))throw Error('Missing report path '+name);
  const runner=path.join(__dirname,'run-browser-'+name+'.cjs');
  fs.writeFileSync(runner,"const M=require('node:module');const m=new M("+JSON.stringify(original)+",module);m.filename="+JSON.stringify(original)+";m.paths=M._nodeModulePaths(require('node:path').dirname(m.filename));m._compile("+JSON.stringify(source.replace(from,to))+",m.filename);\n");
  const fd=fs.openSync(path.join(__dirname,name+'.txt'),'w');
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[runner],{cwd:root,stdio:['ignore',fd,fd],windowsHide:true});child.on('error',reject);child.on('exit',resolve);});fs.closeSync(fd);
  results.push({name,exitCode:code});console.log(name+': '+code);
 }
 fs.writeFileSync(path.join(__dirname,'browser-check-results.json'),JSON.stringify(results,null,2));
 process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
