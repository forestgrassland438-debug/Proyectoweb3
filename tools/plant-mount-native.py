from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module();p='C:/Users/pc/Desktop/server2.js'
u.change(p,'const UserCropSchema = new mongoose.Schema({','const UserCropSchema = new mongoose.Schema({\n  nativeFarm:{type:Boolean,default:false},nativeLocked:{type:Boolean,default:false},nativeWateredAt:Date,nativeReadyAt:Date,')
u.change(p,'const UserCrop = mongoose.model(',"UserCropSchema.index({nativeFarm:1,isWatered:1,isCompleted:1,isDead:1,nativeReadyAt:1});\nconst UserCrop = mongoose.model(")
# Legacy endpoints cannot bypass authoritative seed consumption or minting for
# the new species. Existing manual crops retain their original route.
u.change(p,"      const cropConfig = this.cropTypes[seedType];\n      if (!cropConfig)", "      if(GF_CROP_CATALOG.crops[seedType])throw new Error('Use the authoritative planting operation.');\n      if(await authoritativeFarm.isReserved(userId,plotId))throw new Error('This plot has a pending operation.');\n      const cropConfig = this.cropTypes[seedType];\n      if (!cropConfig)")
s=u.read(p);a=s.index('  async waterCrop(userId, plotId)');b=s.index('  async getUserCrops(',a);part=s[a:b]
anchor="      if (!crop) {";assert part.count(anchor)==3;part=part.replace(anchor,"      if(crop?.nativeFarm || crop?.nativeLocked)throw new Error('Use the authoritative crop operation.');\n"+anchor)
s=s[:a]+part+s[b:];u.save(p,s)
# Growth of expanded crops is based on elapsed time and an indexed due date;
# it does not write every plant once per second.
u.change(p,'        const activeCrops = await UserCrop.find({ \n          isWatered:', '        const activeCrops = await UserCrop.find({ \n          nativeFarm:{$ne:true},nativeLocked:{$ne:true},\n          isWatered:')
u.change(p,'        const caducadas = await UserCrop.find({\n          isCompleted:', '        const caducadas = await UserCrop.find({\n          nativeLocked:{$ne:true},\n          isCompleted:')
u.change(p,'        const secas = await UserCrop.find({\n          isWatered:', '        const secas = await UserCrop.find({\n          nativeLocked:{$ne:true},\n          isWatered:')
u.change(p,'        ...crop.toObject(),\n        cropConfig: cropConfig','        ...(crop.nativeFarm?authoritativeFarm.dto(crop):crop.toObject()),\n        cropConfig: cropConfig',count=2)
# Automatic table initialization applies only to newly registered crop types.
# Existing owner-set limits are never enlarged to fit a harvest.
u.change(p,'  const stats = await contract.getTipoStats(tipo);\n  const exists = Boolean(stats.exists',"  let stats = await contract.getTipoStats(tipo);\n  if(!(stats.exists ?? stats[5]) && GF_CROP_CATALOG.items[tipo]){if(!await crearTablaSiFalta(tipo))throw new Error('crop_table_unavailable');stats=await contract.getTipoStats(tipo);}\n  const exists = Boolean(stats.exists")
factory="""const authoritativeFarm=require('./native-farm')({
  mongoose,catalog:GF_CROP_CATALOG,Crop:UserCrop,History:CropHistory,Stats:PlayerStats,
  itemType:itemTipoOnChain,freeInvoices:facturasLibresDeCadena,table:crearTablaSiFalta,
  townPlots:new Set(require('./town-plots.json')),settings:getFarmingConfig,chance:successChanceParaSemilla,
  island:async(gp,plot)=>await gfTieneVipPorDireccion(gp.address) && await parcelaIslaDeJugador(gp.address,plot),
  thirstMs:()=>MINUTOS_PARA_REGAR[Math.floor(Math.random()*MINUTOS_PARA_REGAR.length)]*60000,
  expiry:nuevaFechaDeCaducidad,award:awardVerifiedProgress,
  room:async(gp,itemId,count)=>{
    const who=await GamePlayer.findOne({playerName:gp.playerName}).select('inventory chest').lean();if(!who)return false;
    const used=(rows,max)=>new Set((rows || []).filter(s=>s && Number(s.cantidad)>0 && Number.isInteger(s.id) && s.id>=0 && s.id<max).map(s=>s.id)).size;
    // A native mint makes a new invoice. Reserve enough canonical slots even
    // when existing stacks could theoretically accept additional quantities.
    return INV_SLOTS-used(who.inventory,INV_SLOTS)+CHEST_SLOTS-used(who.chest,CHEST_SLOTS)>=Math.ceil(count/ITEM_MAX_STACK[itemId]);
  },
  notify:(wallet,event,data)=>io.to('wallet:'+String(wallet).toLowerCase()).emit(event,data)
});
"""
u.change(p,"const authoritativeCrafts = require('./crafting-authority')({",factory+"const authoritativeCrafts = require('./crafting-authority')({")
u.change(p,"  services:Object.entries(VIP_PLANES).flatMap", "  services:[...authoritativeFarm.recipes,...Object.entries(VIP_PLANES).flatMap")
u.change(p,"  }))),\n  prepareService:async(gp,recipe,key)=>{", "  })))],\n  serviceFingerprint:authoritativeFarm.fingerprint,\n  reserveService:authoritativeFarm.reserve,\n  cancelService:authoritativeFarm.cancel,\n  prepareService:async(gp,recipe,key,body)=>{\n    if(recipe.farm)return authoritativeFarm.prepare(gp,recipe,key,body);")
u.change(p,"  completeService:async(job,session)=>{\n    if(job.kind!=='vip'", "  completeService:async(job,session)=>{\n    if(job.kind==='farm')return authoritativeFarm.complete(job,session);\n    if(job.kind!=='vip'")
u.change(p,"  describeService:async(job)=>{\n    const f=", "  describeService:async(job)=>{\n    if(job.kind==='farm')return authoritativeFarm.describe(job);\n    const f=")
anchor='// CRAFT_AUTHORITY_END'
routes="""
app.post('/api/farm/execute',strictLimiter,authMiddleware,csrfProtection,async(req,res)=>{
 try{
  const gp=await jugadorDeLaSesion(req);if(!gp)return res.status(403).json({error:'not_authorized'});
  const body=req.body || {},action=String(body.action || '');let recipeId,quantity;
  const plots=authoritativeFarm.fingerprint(null,body);
  if(action==='plant'){const seed=String(body.seedType || ''),cfg=GF_CROP_CATALOG.crops[seed];if(!cfg)return res.status(400).json({error:'unknown_seed'});recipeId='farm_plant_'+GF_CROP_CATALOG.items[seed].plantKey;quantity=plots.length;}
  else if(action==='water'){const mode=body.mode==='bucket'?'bucket':body.mode==='can'?'can':null;if(!mode)return res.status(400).json({error:'invalid_watering_mode'});recipeId='farm_water_'+mode;quantity=mode==='bucket'?Math.ceil(plots.length/2):plots.length;}
  else if(action==='harvest'){
   // The recipe and result are selected from the current server crop, never
   // from a client item id, quantity or claimed growth stage.
   const crop=await UserCrop.findOne({userId:{$in:[String(gp.address).toLowerCase(),gp.playerName]},plotId:plots[0],isHarvested:false}).lean();
   const cfg=crop && GF_CROP_CATALOG.crops[crop.cropType];if(!cfg)return res.status(409).json({error:'crop_missing'});
   recipeId='farm_harvest_'+GF_CROP_CATALOG.items[cfg.id].plantKey+'_'+(crop.isDead?'rotten':crop.isCompleted?'fresh':'unripe');quantity=plots.length;
  }else return res.status(400).json({error:'invalid_farm_action'});
  const prepared=await enColaDelJugador('inventory:'+String(gp.address).toLowerCase(),()=>authoritativeCrafts.create(gp,{recipeId,quantity,plotIds:plots,ref:body.ref}));
  const done=prepared.status==='completed'?prepared:await authoritativeCrafts.execute(prepared._id);res.set('Cache-Control','no-store');return res.status(done.status==='completed'?200:202).json(await authoritativeCrafts.describe(done));
 }catch(e){return res.status(e.status||503).json({error:e.code || 'farm_unavailable',message:'The farm operation could not be confirmed. Check pending operations before retrying.'});}
});
setInterval(()=>authoritativeFarm.sweep().catch(e=>console.warn('native farm sweep:',e.code || e.message)),15000).unref();
"""
u.change(p,anchor,routes+anchor)
print('Native farm mounted with owned plots, server level checks, capacity guards and bulk-time growth')
