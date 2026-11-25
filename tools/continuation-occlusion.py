from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('Scenes/tiendajuego.js',"if(!r||index.geometry[o]!==r.x", "if(!r||index.refs[i]!==r||index.geometry[o]!==r.x")
u.change('Scenes/tiendajuego.js',"index={geometry:new Float64Array(lista.length*4),cells:", "index={geometry:new Float64Array(lista.length*4),refs:lista.slice(),cells:")
u.change('gf-animales.js',"    var lista = scene.children && scene.children.list || [];\n    for (var i = 0; i < lista.length; i++) {\n      var obj = lista[i];\n      if (!obj || obj === soporte", """    var cache=cacheDe(scene),source=scene.children && scene.children.list || [],frame=scene.time?.now ?? 0;
    if(cache.occludersFrame!==frame||cache.occludersSource!==source||cache.occludersLength!==source.length){
      cache.occluders=source.filter(function(o){return o&&o.texture&&o.getBounds;});cache.occludersFrame=frame;cache.occludersSource=source;cache.occludersLength=source.length;
    }
    var lista=cache.occluders;
    for (var i = 0; i < lista.length; i++) {
      var obj = lista[i];
      if (!obj || obj === soporte""")
u.change('gf-animales.js',"      var b = obj.getBounds();\n      if (x < b.x", """      if(!obj.parentContainer&&Number.isFinite(obj.displayWidth)&&Number.isFinite(obj.displayHeight)&&Number.isFinite(obj.x)&&Number.isFinite(obj.y)){
        var radius=Math.abs(obj.displayWidth)+Math.abs(obj.displayHeight),dx=x-obj.x,dy=y-obj.y;if(dx*dx+dy*dy>radius*radius)continue;
      }
      var b = obj.getBounds();
      if (x < b.x""")
print('Flower occlusion keeps the original rules, with one candidate snapshot per frame and bounds checks only nearby')
