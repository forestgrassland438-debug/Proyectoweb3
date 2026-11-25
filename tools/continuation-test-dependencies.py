from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('tools/auth-concurrency-review.test.cjs',"assert.equal(results.filter(r => r.statusCode === 200).length, 1); assert.equal(f.tokens.length, 1);", "assert.equal(results.filter(r => r.statusCode === 200).length, 1, JSON.stringify(results.map(r=>({status:r.statusCode,error:r.body?.error,message:r.body?.message})))); assert.equal(f.tokens.length, 1);",count=2)
# Supply the actual new dependency to isolated VM fixtures, preserving assertions.
for p,old,new in [
 ('tools/economia2.test.cjs','const ctx = vm.createContext({','const ctx = vm.createContext({ GF_CROP_CATALOG: require(\'../gf-crop-catalog\'),'),
 ('tools/tesoro.test.cjs','  const c = {\n','  const c = {\n    GF_CROP_CATALOG: require(\'../gf-crop-catalog\'),\n'),
 ('tools/auditoria.test.cjs','const ctx = vm.createContext({','const ctx = vm.createContext({ GF_CROP_CATALOG: require(\'../gf-crop-catalog\'),'),
 ('tools/auditoria.test.cjs','const srv = vm.createContext({ Object });','const srv = vm.createContext({ Object, GF_CROP_CATALOG: require(\'../gf-crop-catalog\') });'),
 ('tools/auditoria.test.cjs','window: {}, Object, Number, String','window: {GFPlantCatalog:require(\'../gf-crop-catalog\')}, Object, Number, String'),
 ('tools/auditoria.test.cjs','const precios = vm.createContext({});','const precios = vm.createContext({GF_CROP_CATALOG: require(\'../gf-crop-catalog\')});'),
 ('tools/auditoria.test.cjs','const srv = vm.createContext({ Set });','const srv = vm.createContext({ Set, GF_CROP_CATALOG: require(\'../gf-crop-catalog\') });'),
 ('tools/resource-economy.test.cjs','{ console, crypto, ...globals }',"{ console, crypto, GF_CROP_CATALOG: require('../gf-crop-catalog'), ...globals }"),
 ('tools/txt-marketplace-atomic.test.cjs','module: { exports: {} }, require,',"module: { exports: {} }, require: require('node:module').createRequire(require('node:path').resolve(__dirname,'../marketplace-routes.js')),")]:u.change(p,old,new)
print('Isolated legacy tests now load the same frozen plant catalog as production')
