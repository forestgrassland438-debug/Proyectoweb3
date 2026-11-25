from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
p='Scenes/tiendajuego.js';s=u.read(p);start=s.index('_chocaConLista(x, y, w, h, lista) {');end=s.index('\n}',start)+2;old=s[start:end]
new='''_chocaConLista(x, y, w, h, lista) {
  if(!Array.isArray(lista)||w<=0||h<=0)return false;
  const hit=o=>o&&o.width>0&&o.height>0&&!(x+w<o.x||y+h<o.y||x>o.x+o.width||y>o.y+o.height);
  if(lista.length<16)return lista.some(hit);
  const indexes=this._shopCollisionIndexes ||= new WeakMap(),frame=this.time?.now ?? Date.now();
  let index=indexes.get(lista),changed=!index||index.geometry.length!==lista.length*4;
  if(!changed&&index.frame!==frame){for(let i=0;i<lista.length;i++){const r=lista[i],o=i*4;if(!r||index.geometry[o]!==r.x||index.geometry[o+1]!==r.y||index.geometry[o+2]!==r.width||index.geometry[o+3]!==r.height){changed=true;break;}}}
  if(changed){
    index={geometry:new Float64Array(lista.length*4),cells:new Map(),large:[],seen:new WeakMap(),sequence:0,frame};
    for(let i=0;i<lista.length;i++){const r=lista[i],o=i*4;if(!r)continue;index.geometry.set([r.x,r.y,r.width,r.height],o);if(!(r.width>0&&r.height>0)||![r.x,r.y,r.width,r.height].every(Number.isFinite))continue;
      const a=Math.floor(r.x/128),b=Math.floor((r.x+r.width)/128),c=Math.floor(r.y/128),d=Math.floor((r.y+r.height)/128);
      if((b-a+1)*(d-c+1)>256){index.large.push(r);continue;}
      for(let cx=a;cx<=b;cx++)for(let cy=c;cy<=d;cy++){const key=cx+':'+cy;let bucket=index.cells.get(key);if(!bucket)index.cells.set(key,bucket=[]);bucket.push(r);}
    }indexes.set(lista,index);
  }
  index.frame=frame;const a=Math.floor(x/128),b=Math.floor((x+w)/128),c=Math.floor(y/128),d=Math.floor((y+h)/128);
  if(![a,b,c,d].every(Number.isFinite)||(b-a+1)*(d-c+1)>256)return lista.some(hit);
  const sequence=++index.sequence;
  for(const r of index.large)if(hit(r))return true;
  for(let cx=a;cx<=b;cx++)for(let cy=c;cy<=d;cy++)for(const r of index.cells.get(cx+':'+cy)||[]){if(index.seen.get(r)===sequence)continue;index.seen.set(r,sequence);if(hit(r))return true;}
  return false;
}'''
u.change(p,old,new)
print('Shop pet and movement collision queries use a geometry-checked spatial index, preserving the original collision lists and edge rules')
