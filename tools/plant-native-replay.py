from pathlib import Path
import shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module();p='C:/Users/pc/Desktop/server2.js'
u.change(p,"  const plots=authoritativeFarm.fingerprint(null,body);\n  if(action==='plant')", """  const plots=authoritativeFarm.fingerprint(null,body),wallet=String(gp.address).toLowerCase(),ref=String(body.ref || '');
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(ref))return res.status(400).json({error:'invalid_reference'});
  const previous=await authoritativeCrafts.Job.findById('craft_'+crypto.createHash('sha256').update(wallet+':'+ref).digest('hex')).lean();
  if(previous){
    const m=previous.metadata;
    if(previous.kind!=='farm'||m.action!==action||JSON.stringify(m.plots)!==JSON.stringify(plots)||(action==='plant'&&m.seedType!==body.seedType)||(action==='water'&&m.mode!==body.mode))return res.status(409).json({error:'farm_reference_conflict'});
    const done=previous.status==='completed'?previous:await authoritativeCrafts.execute(previous._id);res.set('Cache-Control','no-store');return res.status(done.status==='completed'?200:202).json(await authoritativeCrafts.describe(done));
  }
  await authoritativeFarm.refresh(gp,plots);
  if(action==='plant')""")
shutil.copyfile('backend-gameplay/native-farm.cjs','C:/Users/pc/Desktop/native-farm.js')
print('Farm API recovers its original reference even after the harvested crop has disappeared')
