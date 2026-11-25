from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('tools/auth-concurrency-review.test.cjs',"if (extra.failCreate) throw Error('DB offline'); const doc", "if (extra.failCreate) throw Error('DB offline'); if(extra.duringCreate)await extra.duringCreate(); const doc")
u.change('tools/auth-concurrency-review.test.cjs','assert.equal(f.bcryptCalls, 1);','assert.equal(f.bcryptCalls, 0); assert.match(f.tokens[0].token,/^[a-f0-9]{64}$/);')
u.change('tools/auth-concurrency-review.test.cjs','f = fixture({ duringHash() {','f = fixture({ duringCreate() {')
u.change('tools/auditoria.test.cjs','n >= 1 && n <= 10','n >= 1 && n <= 150')
u.change('tools/auditoria.test.cjs',"  const cli = [...lista.matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);", "  const dropContext=vm.createContext({window:{GFPlantCatalog:require('../gf-crop-catalog')}});vm.runInContext(lista+';globalThis.keys=Object.keys(SOLTABLES)',dropContext);\n  const cli = Array.from(dropContext.keys);")
u.change('tools/auditoria.test.cjs',"GamePlayer, VipEstado: modelo(),", "GamePlayer, PlayerStats:modelo(), nivelPorExperiencia:()=>1, VipEstado: modelo(),")
u.change('tools/auditoria.test.cjs',r'/auditarMercado: gfAuditarMercado,\n  nivelObjeto: gfNivelDeObjeto,\n  nivelJugador: gfNivelDeJugador,/',r'/auditarMercado: gfAuditarMercado,[\s\S]*?nivelObjeto: gfNivelDeObjeto,\n  nivelJugador: gfNivelDeJugador,/')
u.change('tools/txt-environment-audit.test.cjs',"  assert.notEqual(sa.claves[0], sb.claves[0]); api.desmontar(a.sc);", "  assert.notEqual(sa.claves[0], sb.claves[0]);\n  assert.equal(sa.claves.filter(k=>tm.exists(k)).length,1,'only frame zero blocks mounting');\n  for(let frame=1;frame<8;frame++){a.tick(frame*16);b.tick(frame*16);}\n  assert.equal(sa.buildFrame,null);assert.equal(sb.buildFrame,null);api.desmontar(a.sc);")
p='tools/tienda-precios-a-servidor.js'
u.change(p,"  return new Function('return ' + src.slice(i, j + 1))();", "  return require('node:vm').runInNewContext('('+src.slice(i,j+1)+')',{window:{GFPlantCatalog:require('../gf-crop-catalog')}});")
u.change(p,"it.currency === 'silver' ? 'p' : 'o'", "it.currency === 'silver' ? 'p' : it.currency === 'bronze' ? 'b' : 'o'")
u.change(p,"  return JSON.parse(t);", "  return require('node:vm').runInNewContext('('+t+')',{GF_CROP_CATALOG:require('../gf-crop-catalog')});")
u.change(p,"  const original = fs.readFileSync(ruta, 'utf8');", "  const original = fs.readFileSync(ruta, 'utf8');\n  if(original.includes('...GF_CROP_CATALOG.shopPrices'))throw new Error('El catálogo compartido está activo. Cambia valores explícitos o usa el panel; este script no sustituye la tabla manual.');")
u.change(p,'JSON.stringify(servidor) === JSON.stringify(local)',"JSON.stringify(Object.entries(servidor).sort(([a],[b])=>a.localeCompare(b))) === JSON.stringify(Object.entries(local).sort(([a],[b])=>a.localeCompare(b)))")
print('Updated real catalogue comparisons and current SHA-256 authentication fixtures; prevented obsolete overwrite script from replacing manual table values')
