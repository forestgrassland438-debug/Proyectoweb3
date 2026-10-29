from pathlib import Path
import shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
p=Path('backend-gameplay/crafting-authority.cjs')
u.change(p,"  const need=new Map();const add=x=>need.set(x.itemId,(need.get(x.itemId)||0)+x.quantity*quantity);", """  const need=new Map();const add=x=>{
   const amount=x.quantity*(x.absolute?1:quantity);if(!Number.isSafeInteger(amount)||amount<1)throw fail('craft_invalid_material_quantity');
   const key=x.itemId+':'+(x.invoiceId || ''),entry=need.get(key)||{itemId:x.itemId,amount:0,...(x.invoiceId?{invoiceId:x.invoiceId}:{})};entry.amount+=amount;need.set(key,entry);
  };""")
u.change(p,"  return [...need].map(([itemId,amount])=>({itemId,amount}));","  return [...need.values()];")
u.change(p,"if(String(invoice.owner).toLowerCase()!==wallet || invoice.tipo!==tipo || invoice.active===false", "if(need.invoiceId && Number(invoice.id)!==need.invoiceId)continue;\n    if(String(invoice.owner).toLowerCase()!==wallet || invoice.tipo!==tipo || invoice.active===false")
u.change(p,'const prepared=await plan(wallet,r,q,option,key,metadata);','const prepared=await plan(wallet,r.farm&&d.planService?d.planService(r,metadata):r,q,option,key,metadata);')
shutil.copyfile(p,'C:/Users/pc/Desktop/crafting-authority.js');shutil.copyfile('backend-gameplay/native-farm.cjs','C:/Users/pc/Desktop/native-farm.js')
p='C:/Users/pc/Desktop/server2.js'
u.change(p,'  issuedQuantity: { type: Number, default: null }','  nativeOperation:{type:String,default:null},\n  issuedQuantity: { type: Number, default: null }')
u.change(p,"const doc=await ToolUses.findOneAndUpdate({invoiceId:id},[{$set:","const doc=await ToolUses.findOneAndUpdate({invoiceId:id,nativeOperation:null},[{$set:")
u.change(p,"  res.json({invoiceId:id,usos:doc.usos,maxUsos:doc.maxUsos,rota:doc.rota});", "  if(!doc)return res.status(409).json({error:'tool_reserved_for_pending_operation'});\n  res.json({invoiceId:id,usos:doc.usos,maxUsos:doc.maxUsos,rota:doc.rota});")
u.change(p,"  if(!doc)return res.json({success:true,invoiceId:id});", "  if(!doc)return res.json({success:true,invoiceId:id});\n  if(doc.nativeOperation)return res.status(409).json({error:'tool_reserved_for_pending_operation'});")
u.change(p,"  if(!invoice.active)await ToolUses.deleteOne({_id:doc._id,rota:true,usos:doc.usos});\n  else await ToolUses.updateOne({_id:doc._id,rota:true,usos:doc.usos},{$set:{usos:max,maxUsos:max,rota:false,issuedQuantity:Number(invoice.cantidad)}});", "  const changed=!invoice.active?await ToolUses.deleteOne({_id:doc._id,nativeOperation:null,rota:true,usos:doc.usos}):await ToolUses.updateOne({_id:doc._id,nativeOperation:null,rota:true,usos:doc.usos},{$set:{usos:max,maxUsos:max,rota:false,issuedQuantity:Number(invoice.cantidad)}});\n  if(!(changed.deletedCount || changed.matchedCount))return res.status(409).json({error:'tool_state_changed'});")
u.change(p,'mongoose,catalog:GF_CROP_CATALOG,Crop:UserCrop,History:CropHistory,Stats:PlayerStats,','mongoose,catalog:GF_CROP_CATALOG,Crop:UserCrop,History:CropHistory,Stats:PlayerStats,Tools:ToolUses,')
u.change(p,'  serviceFingerprint:authoritativeFarm.fingerprint,','  planService:authoritativeFarm.plan,\n  serviceFingerprint:authoritativeFarm.fingerprint,')
print('Native farm tool wear is reserved atomically and broken units are burned through the same durable job')
