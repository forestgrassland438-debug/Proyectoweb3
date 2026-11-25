from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
p=Path('backend-collections/collections.cjs');s=u.read(p);start=s.index('      for(const t of activeTokens){');end=s.index("      const finished=await Scan.updateOne",start);old=s[start:end]
new='''      const updates=[];
      for(let offset=0;offset<activeTokens.length;offset+=8){
        const batch=await Promise.allSettled(activeTokens.slice(offset,offset+8).map(async t=>{
          let fields;
          try{const inv=await contract.getInvoice(t.invoiceId);fields={owner:address(inv.owner),chainActive:inv.active===true,chainQuantity:String(inv.cantidad),chainWarning:t.chainAmbiguous?t.chainWarning:inv.active!==true?'La factura fue consumida o eliminada en la cadena. La política del panel no puede restaurarla.':String(inv.cantidad)!=='1'?'La factura actual tiene una cantidad distinta de 1.':'',updatedAt:new Date().toISOString()};}
          catch(error){if(error.code!=='CALL_EXCEPTION')throw error;warnings.push({tokenId:t.id,error:'invoice_missing_possible_reorg'});fields={chainActive:false,chainWarning:'La factura no existe en el bloque actual; podría haber una reorganización de cadena. Revisa su transacción.'};}
          return {updateOne:{filter:query({id:t.id,invoiceId:t.invoiceId}),update:{$set:fields}}};
        }));
        const failed=batch.find(r=>r.status==='rejected');if(failed)throw failed.reason;
        updates.push(...batch.map(r=>r.value));
      }
      if(updates.length)await Token.bulkWrite(updates,{ordered:false});
'''
for target in [p,Path('C:/Users/pc/Desktop/server2.js')]:u.change(target,old,new)
# Generate only frame zero synchronously; the original formulas yield the
# remaining patterns and atlas images one per scene update.
p='gf-agua.js';u.change(p,'  function patrones(pal, semilla) {','  function* iterarPatrones(pal, semilla) {')
u.change(p,'    var out = [];\n    for (var f = 0; f < FOTOS; f++) {','    for (var f = 0; f < FOTOS; f++) {')
u.change(p,'      out.push(px);\n    }\n    return out;\n  }','      yield px;\n    }\n  }\n  function patrones(pal,semilla){return Array.from(iterarPatrones(pal,semilla));}')
u.change(p,'      var pats = patrones(pal, 7);\n      for (f = 0; f < FOTOS; f++) {','      var iterator = iterarPatrones(pal,7);\n      var drawFrame=function(f){\n        var pat=iterator.next().value;')
u.change(p,'e[0]), e[1], e[2], pats[f], f, pal);','e[0]), e[1], e[2], pat, f, pal);')
u.change(p,'        ct.refresh();\n      }\n    }\n\n    var tm = scene.make.tilemap','        ct.refresh();\n      };\n      drawFrame(0);var nextFrame=1;\n      st.buildFrame=function(){drawFrame(nextFrame++);if(nextFrame>=FOTOS)st.buildFrame=null;};\n    }\n\n    var tm = scene.make.tilemap')
u.change(p,'    st.onUpdate = function (t, delta) {\n      if (!Number.isFinite(delta)', '    st.onUpdate = function (t, delta) {\n      if(scene.__gfAgua!==st)return;\n      if(st.buildFrame){try{st.buildFrame();}catch(e){st.buildFrame=null;console.warn(\'[agua] atlas frame unavailable\');}}\n      if (!Number.isFinite(delta)')
u.change(p,'    st.scene = null;\n    var matar', '    st.scene = null;st.buildFrame=null;\n    var matar')
print('Collection refresh: bounded eight RPC reads and one bulk write. Water: original pixels, one deferred atlas frame per update.')
