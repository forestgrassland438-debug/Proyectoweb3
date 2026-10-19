'use strict';
// Local HTTP only; never starts server2.js, Mongo, wallet or relayer.
const assert = require('node:assert/strict'), http = require('node:http'), path = require('node:path'), fs = require('node:fs'), zlib = require('node:zlib');
const backend = path.resolve(__dirname, '../GrasslandBuild/repositories/backend/node_modules');
const streams = new Set(); let created = 0;
const original = Object.getOwnPropertyDescriptor(zlib, 'createGzip');
Object.defineProperty(zlib, 'createGzip', { ...original, value: function (...args) { const s=original.value(...args);created++;streams.add(s);s.once('close',()=>streams.delete(s));return s; } });
const compression = require(path.join(backend,'compression')), proxyaddr = require(path.join(backend,'proxy-addr'));
async function main() {
  for (const subnet of ['::ffff:10.0.0.0/8','::/1']) assert.equal(proxyaddr.compile([subnet])('203.0.113.9'),false,'unrelated IPv4 must not match zero-prefixed IPv6');
  const mapped=proxyaddr.compile(['::ffff:10.0.0.0/104']);assert.equal(mapped('10.1.2.3'),true);assert.equal(mapped('203.0.113.9'),false);
  const middleware=compression({threshold:0});const payload=Buffer.from('grassland fixture '.repeat(2048));
  const server=http.createServer((req,res)=>middleware(req,res,()=>{
    res.setHeader('Content-Type','text/plain');
    if(req.url==='/complete'){res.end(payload);return;}
    const timer=setInterval(()=>{res.write(payload);res.flush();},2);
    res.once('close',()=>clearInterval(timer));
  }));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const request=aborted=>new Promise((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port:server.address().port,path:aborted?'/abort':'/complete',headers:{'Accept-Encoding':'gzip'}},res=>{
      assert.equal(res.headers['content-encoding'],'gzip');
      if(aborted){res.once('data',()=>{res.destroy();resolve();});}
      else {const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{assert.deepEqual(zlib.gunzipSync(Buffer.concat(chunks)),payload);resolve();});}
      res.on('error',aborted?()=>{}:reject);
    });req.on('error',reject);
  });
  try {
    for(let i=0;i<6;i++)await Promise.all(Array.from({length:10},()=>request(true)));
    await request(false);await new Promise(r=>setTimeout(r,60));
    assert.equal(created,61);assert.equal(streams.size,0,'all native zlib streams must be released after disconnected or complete responses');
    const report={compression:require(path.join(backend,'compression/package.json')).version,proxyAddr:require(path.join(backend,'proxy-addr/package.json')).version,interruptedResponses:60,completeResponses:1,compressionStreamsCreated:created,compressionStreamsRetained:streams.size,ipv4MappedSubnetRegression:true};
    fs.writeFileSync(path.resolve(__dirname,'../GrasslandBuild/dist/backend-http-regression.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));Object.defineProperty(zlib,'createGzip',original);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
