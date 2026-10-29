'use strict';
const fs=require('node:fs'),acorn=require('acorn');const file='C:/Users/pc/Desktop/server2.js',source=fs.readFileSync(file,'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'}),edits=[];let count=0;
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}
walk(ast,node=>{
 if(node.type!=='CallExpression'||node.callee.name!=='txRelayer')return;
 if(node.arguments.length!==2)throw Error('Unexpected native transaction signature');
 const fn=node.arguments[1];if(fn.type!=='ArrowFunctionExpression')throw Error('Inspect non-arrow native writer before modification');
 let text=source.slice(fn.start,fn.end),local=[];
 walk(fn.body,n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='c')local.push({at:n.callee.end-fn.start,text:'.estimateGas'});});
 if(!local.length)throw Error('No contract write in '+source.slice(node.start,node.end));
 for(const e of local.sort((a,b)=>b.at-a.at))text=text.slice(0,e.at)+e.text+text.slice(e.at);
 edits.push({at:node.end-1,text:', '+text});count++;
});
let result=source;for(const e of edits.sort((a,b)=>b.at-a.at))result=result.slice(0,e.at)+e.text+result.slice(e.at);
const start=result.indexOf('async function txRelayer(nombre, fn) {'),end=result.indexOf('\nfunction idDeFacturaCreada',start);if(start<0||end<0)throw Error('Missing native relay helper');
result=result.slice(0,start)+`async function txRelayer(nombre, fn, preflight) {
  if(typeof preflight!=='function')throw new Error('native_preflight_required');
  const gasPrice=gatherGasPrice();
  // An invalid action must fail before reserving a nonce. Passing gasLimit
  // also prevents ethers from estimating again after the reservation.
  const estimate=await preflight({gasPrice});
  const gasLimit=BigInt(estimate)*120n/100n;
  if(gasLimit<1n)throw new Error('invalid_native_gas_estimate');
  const nonce=await relayerNonceManager.getNextNonce();
  try {const tx=await fn({gasPrice,gasLimit,nonce});return await tx.wait(1,120000);}
  catch(e){console.error('Native transaction '+nombre+':',e.shortMessage||e.message);throw e;}
}
`+result.slice(end);fs.writeFileSync(file,result);console.log('Added preflight before reservation to',count,'native call sites.');
