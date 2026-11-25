from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('gf-jefes.js','  function puesto(scene) {','  var cachePuestos=new Map();\n  function puesto(scene) {')
u.change('gf-jefes.js',"    var r = azar(semillaDe(key + '|jefe')), caja = cfg.caja, mejor = null, holgura = -1;", """    var cacheKey=key+'|'+JSON.stringify([cfg.caja,lejosDe]),cached=cachePuestos.get(cacheKey);
    if(cached){var valid=true;for(var check=60;check<=cached.clearance*60;check+=60)if(!lib(cached.point.x,cached.point.y,check)){valid=false;break;}if(valid)return Object.assign({},cached.point);cachePuestos.delete(cacheKey);}
    var r = azar(semillaDe(key + '|jefe')), caja = cfg.caja, mejor = null, holgura = -1;""")
u.change('gf-jefes.js','    return mejor;\n  }','    if(mejor){if(cachePuestos.size>=16)cachePuestos.delete(cachePuestos.keys().next().value);cachePuestos.set(cacheKey,{point:Object.assign({},mejor),clearance:holgura});}\n    return mejor;\n  }')
print('Boss den cache bounded to sixteen map contexts; cached clearance rechecked after map changes')
