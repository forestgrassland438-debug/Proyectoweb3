from pathlib import Path
import shutil,json
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
p=Path('backend-gameplay/crafting-authority.cjs');u.backup(p)
u.change(p,"fingerprint=JSON.stringify([r.id,q,option]);","fingerprint=JSON.stringify([r.id,q,option,...(r.farm?[d.serviceFingerprint(r,body)]:[])]);")
u.change(p,'d.prepareService(gp,r,key)','d.prepareService(gp,r,key,body)')
u.change(p,"const fee=charge?charge.bronze:r.consume?0:d.price('craftear',r.itemId,prepared.resultQuantity);if(!Number.isSafeInteger(fee)||fee<(r.consume?0:1))", "const fee=charge?charge.bronze:r.consume||r.free?0:d.price('craftear',r.itemId,prepared.resultQuantity);if(!Number.isSafeInteger(fee)||fee<(r.consume||r.free?0:1))")
u.change(p,"status:'prepared',active:true}],{session});return job.toObject();", "status:'prepared',active:true}],{session});\n   if(r.farm && d.reserveService){const metadata=await d.reserveService(job.toObject(),gp,r,session);await Job.updateOne({_id:id},{$set:{metadata}},{session});job.metadata=metadata;}\n   return job.toObject();")
u.change(p,"if(job.kind==='vip'){if(!d.completeService)","if(job.kind==='vip'||job.kind==='farm'){if(!d.completeService)")
u.change(p,'  return result;\n }\n app.post',"  if(job.kind==='farm' && d.describeService)Object.assign(result,await d.describeService(job));\n  return result;\n }\n app.post")
u.change(p,"if(changed.modifiedCount!==1)throw fail('craft_lease_changed');\n    const service=", "if(changed.modifiedCount!==1)throw fail('craft_lease_changed');\n    if(job.kind==='farm' && d.cancelService)await d.cancelService(job,session);\n    const service=")
dest=Path('C:/Users/pc/Desktop/crafting-authority.js');u.backup(dest);shutil.copyfile(p,dest)
p=Path('C:/Users/pc/Desktop/native-farm.js');assert not p.exists();shutil.copy2('backend-gameplay/native-farm.cjs',p)
plots=json.loads((u.A/'town-plots.json').read_text(encoding='utf8'));q=Path('backend-gameplay/town-plots.json');assert not q.exists();q.write_text(json.dumps(plots,indent=2),encoding='utf8');dest=Path('C:/Users/pc/Desktop/town-plots.json');assert not dest.exists();shutil.copy2(q,dest)
print('Crafting coordinator supports authoritative farm hooks; native farm module and real town plots copied to backend')
