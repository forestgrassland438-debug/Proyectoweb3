'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {createRequire}=require('node:module'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../GrasslandBuild/repositories/backend');
const backend=createRequire(path.join(root,'package.json')),hardhat=createRequire(backend.resolve('hardhat/package.json'));
test('Hardhat keeps UUID v4 CommonJS support with bounded v3 output buffers',()=>{
 const uuid=hardhat('uuid');assert.equal(hardhat('uuid/package.json').version,'11.1.1');assert.equal(uuid.validate(uuid.v4()),true);
 assert.throws(()=>uuid.v3('fixture',uuid.v3.DNS,Buffer.alloc(1)),/bounds|length|offset|buffer/i);
});
test('Sentry cookie replacement retains parsing and rejects unsafe serialized names',()=>{
 const sentry=createRequire(hardhat.resolve('@sentry/node/package.json')),cookie=sentry('cookie');assert.equal(sentry('cookie/package.json').version,'0.7.2');
 assert.equal(cookie.parse('session=fixture; text=hello%20world').text,'hello world');assert.throws(()=>cookie.serialize('bad;name','fixture'));
});
test('Hardhat Mocha reporter keeps its diff API and TypeScript runtime still transpiles',()=>{
 const mocha=createRequire(hardhat.resolve('mocha/package.json')),diff=mocha('diff');assert.equal(mocha('diff/package.json').version,'8.0.3');
 const patch=diff.createPatch('fixture','before\n','after\n');assert.equal(diff.applyPatch('before\n',patch),'after\n');assert.ok(diff.diffLines('old\n','new\n').some(part=>part.added));
 const output=backend('typescript').transpileModule('const amount: number = 7; export default amount;',{});assert.match(output.outputText,/amount = 7/);
 const service=backend('ts-node').create({skipProject:true,transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
 assert.match(service.compile('export const amount: number = 7;',path.join(root,'offline-fixture.ts')),/amount = 7/);
 assert.doesNotThrow(()=>require(mocha.resolve('./lib/reporters/base.js')));
});
test('patched compiler ZIP dependency preserves a valid offline compiler archive',()=>{
 const Zip=hardhat('adm-zip');assert.equal(hardhat('adm-zip/package.json').version,'0.6.1');
 const archive=new Zip();archive.addFile('solc.exe',Buffer.from('offline compiler fixture'));const restored=new Zip(archive.toBuffer());
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grassland-zip-compat-'));
 try{restored.extractAllTo(temp,true);assert.equal(fs.readFileSync(path.join(temp,'solc.exe'),'utf8'),'offline compiler fixture');}
 finally{const resolved=fs.realpathSync(temp),parent=fs.realpathSync(os.tmpdir());assert.ok(resolved.startsWith(parent+path.sep)&&path.basename(resolved).startsWith('grassland-zip-compat-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
test('Undici multipart consumer parses text and files and safely handles prototype-named headers',{timeout:8000},async()=>{
 const undici=createRequire(hardhat.resolve('undici/package.json'));
 const {Response}=undici('./index.js'),headers={'content-type':'multipart/form-data; boundary=fixture'};
 const body='--fixture\r\nContent-Disposition: form-data; name="text"\r\n\r\nhello\r\n--fixture\r\nContent-Disposition: form-data; name="file"; filename="ok.txt"\r\nContent-Type: text/plain\r\n\r\ncontents\r\n--fixture--\r\nepilogue';
 const form=await new Response(body,{headers}).formData();
 assert.equal(form.get('text'),'hello');assert.equal(form.get('file').name,'ok.txt');assert.equal(await form.get('file').text(),'contents');
 const encoded=await new Response('first=hello+world&second=7',{headers:{'content-type':'application/x-www-form-urlencoded'}}).formData();assert.equal(encoded.get('first'),'hello world');
 for(const key of ['__proto__','constructor']){
  const payload='--fixture\r\n'+key+': one\r\n'+key+': two\r\nContent-Disposition: form-data; name="safe"\r\n\r\nvalue\r\n--fixture--\r\n';
  const decoded=await new Response(payload,{headers}).formData();assert.equal(decoded.get('safe'),'value');
 }
 const injected='--fixture\r\nContent-Disposition: form-data; name="field"; filename="bad\nname.txt"\r\n\r\ncontents\r\n--fixture--\r\n';
 try{const safe=await new Response(injected,{headers}).formData();for(const [key,value] of safe){assert.doesNotMatch(key,/[\r\n]/);if(value.name)assert.doesNotMatch(value.name,/[\r\n]/);}}catch(e){assert.match(e.message,/header|malformed|invalid|parse|control/i);}
 assert.equal(undici('@fastify/busboy/package.json').version,'3.2.3');
});
