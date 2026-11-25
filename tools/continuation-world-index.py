from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
p='gf-graphics-settings.js';start=u.read(p).index('  function objetosDelMapa(escena) {');end=u.read(p).index('  function aplicarAObjetos(escena) {',start);old=u.read(p)[start:end]
new='''  function registrar(escena,obj){
    if(!escena||!obj)return obj;
    var r=escena._gfOptimizedRegistry;
    if(!r){r=escena._gfOptimizedRegistry={objects:new Set(),revision:0,censado:false};
      if(escena.events?.once){var limpiar=function(){r.objects.clear();r.revision++;escena.events.off('shutdown',limpiar);escena.events.off('destroy',limpiar);escena._gfObjetosMapa=null;escena._gfOptimizedRegistry=null;};escena.events.once('shutdown',limpiar);escena.events.once('destroy',limpiar);}}
    if(r.objects.has(obj))return obj;r.objects.add(obj);r.revision++;
    obj.once?.('destroy',function(){if(r.objects.delete(obj))r.revision++;});return obj;
  }
  function objetosDelMapa(escena) {
    var r=escena._gfOptimizedRegistry;
    if(!r?.censado){
      var lista=escena.children?.list || [];
      for(var i=0;i<lista.length;i++){var o=lista[i];try{if(o?.getData?.('optimized'))registrar(escena,o);}catch(e){}}
      r=escena._gfOptimizedRegistry;if(r)r.censado=true;
    }
    return r?Array.from(r.objects):[];
  }

'''
u.change(p,old,new)
u.change(p,"    if (!objs || escena._gfObjetosCaducan < Date.now()) {", "    if (!objs || escena._gfObjetosVersion !== (escena._gfOptimizedRegistry?.revision || 0)) {")
u.change(p,"      escena._gfObjetosCaducan = Date.now() + 4000;", "      escena._gfObjetosVersion = escena._gfOptimizedRegistry?.revision || 0;")
u.change(p,'    aplicar:  aplicarTodo,','    aplicar:  aplicarTodo,\n    registrar: registrar,\n    _objetosDelMapa: objetosDelMapa,')
import re
paths=['Scenes/GameScene.js','Scenes/ZonasScenes.js','Scenes/SalvajeScene.js','Scenes/MinaScene.js','gf-mina-zombis.js','gf-mina-serpiente.js','gf-salvaje.js']
for path in paths:
 s=u.read(path);matches=list(re.finditer(r"\b(\w+)\.setData\('optimized', true\);",s));assert matches,path
 u.backup(path);s=re.sub(r"\b(\w+)\.setData\('optimized', true\);",lambda m:m.group(0)+' window.GFGraphics?.registrar?.('+m[1]+'.scene,'+m[1]+');',s);u.save(path,s)
print('Optimized map objects now register on creation and unregister on destruction; no repeated full display-list scan')
