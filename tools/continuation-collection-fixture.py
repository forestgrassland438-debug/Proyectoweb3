from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('tools/collections-backend.test.cjs','return {docs,find:select,','return {docs,bulkWrite:async ops=>{for(const op of ops)change(op.updateOne.filter,op.updateOne.update);return {ok:1}},find:select,')
p=Path('tools/collections-backend.test.cjs');u.save(p,u.read(p)+'''

test('bounded collection refresh reads at most eight invoices concurrently and batches its Mongo updates',async()=>{
 const Token=memory(Array.from({length:200},(_,i)=>({id:'token-'+i,invoiceId:String(i+1),updatedAt:'2026-10-31'}))),Scan=memory([{id:'main',cursor:99,startBlock:99,lockedUntil:new Date(0)}]);let live=0,max=0,writes=0;
 const bulk=Token.bulkWrite;Token.bulkWrite=async ops=>{writes++;assert.equal(ops.length,200);return bulk(ops)};
 const m=mounting({models:{GFNftToken:Token,GFNftScan:Scan},contractOverrides:{getInvoice:async id=>{live++;max=Math.max(max,live);await new Promise(r=>setTimeout(r,1));live--;return {owner:OTHER,active:true,cantidad:1n};}},providerOverrides:{getBlockNumber:async()=>103,getLogs:async()=>[],getBlock:async()=>({hash:BLOCK,timestamp:100})}});
 const res=response();await m.routes.get('POST /api/admin/collections/sync')({body:{}},res);assert.equal(res.body.ok,true);assert.equal(max,8);assert.equal(writes,1);assert.equal(Token.docs.filter(t=>t.owner===OTHER).length,200);
});
''')
print('Collection tests retain invoice identity and exercise actual bounded batch writes')
