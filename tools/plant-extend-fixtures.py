from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
u.change('tools/inventory-transitions.test.cjs',"const types = vm.runInNewContext(server.slice(mapStart, mapEnd) + '\\nITEM_TIPO_MAP');","const catalog = require('../gf-crop-catalog');\nconst types = vm.runInNewContext(server.slice(mapStart, mapEnd) + '\\nITEM_TIPO_MAP', { GF_CROP_CATALOG: catalog });")
u.change('tools/inventory-transitions.test.cjs',"window: { location: { hostname: 'localhost' } }","window: { GFPlantCatalog: catalog, location: { hostname: 'localhost' } }")
p=Path('tools/inventory-transitions.test.cjs');u.save(p,u.read(p)+'''

test('all 240 expanded crop invoices survive every map and chest layout round trip', async () => {
  const f=fixture(), ids=Object.keys(catalog.items);
  for(let start=0;start<ids.length;start+=12){
    const batch=ids.slice(start,start+12), inv=batch.slice(0,8), chest=batch.slice(8);
    f.state.inventory=inv.map((id,i)=>saved(start+i+100,id,i,2));
    f.state.chest=chest.map((id,i)=>saved(start+i+108,id,i,1));
    f.setSnapshot(batch.map((id,i)=>invoice(start+i+100,id,i<8?2:1)));
    await f.loader.loadPlayerData();await f.loader.syncInventoryWithBlockchain();
    for(const name of ['GameScene','tiendajuego','MinaScene','LandsScene','InteriorScene']){
      const scene=f.scene(name);if(typeof scene._definirObjetos==='function')scene._definirObjetos();else scene.ItemDefinitions=f.loader.ItemDefinitions;
      await scene.loadPlayerData();if(['MinaScene','LandsScene','InteriorScene'].includes(name))await scene._sincronizarInventarioConLaCadena();
      for(let i=0;i<inv.length;i++){assert.equal(scene.STATE.slots[i]?.id,inv[i],name+': '+inv[i]);assert.equal(scene.STATE.slots[i]?.idx,start+i+100);assert.equal(scene.STATE.slots[i]?.count,2);}
      for(let i=0;i<chest.length;i++){assert.equal(scene.STATE.quickSlots[i]?.id,chest[i],name+': chest '+chest[i]);assert.equal(scene.STATE.quickSlots[i]?.idx,start+i+108);assert.equal(scene.STATE.quickSlots[i]?.count,1);}
      await scene.savegg();
    }
  }
});
''')
# The old VIP adapter fixture isolates its original VIP recipes; its new farm dependency is explicit.
p=Path('tools/audit-gemini-craft-integration.cjs');s=u.read(p)
if 'authoritativeFarm:{recipes:[]}' not in s:
 anchor='const vipContext='
 idx=s.find(anchor)
 print('VIP fixture initializer:',s[idx:idx+340])
print('Expanded actual cross-map inventory regression')
