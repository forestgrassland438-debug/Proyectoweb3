'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const norm=s=>s.replaceAll('\\','/');
const scopes={
 'gf-bronce.js':'Saldo por cuenta, interceptación fetch, respuestas tardías, regalos/cambio de moneda y destrucción.',
 'gf-camellos.js':'Carga, creación parcial, movimiento, listeners y desmontaje de la manada.',
 'gf-character-skills.js':'Carga/asignación/reset de puntos, revisiones de peticiones y caché por cuenta.',
 'gf-espada.js':'Armas, daño, habilidades, efectos/counter tweens, menú y ciclo de escenas.',
 'gf-jefes.js':'Decoración, patrones de ataques, orbes, llamadas diferidas, audio y desmontaje.',
 'gf-npcs-pueblo.js':'Carga, reintentos, decoración, alpha original, diálogo y desmontaje.',
 'gf-npcs.js':'Datos de NPC, carga, construcción parcial, diálogos y ciclo de escenas.',
 'gf-reposo.js':'Detección AFK, ocultación/restauración y referencias de piezas destruidas.',
 'gf-rutas.js':'BFS íntegro, colisiones, reconstrucción, entradas inválidas y reentrada.',
 'gf-sin-nombre.js':'Identidad/nombre, flags heredados, guardas y fetch interceptor.',
 'gf-soulbound-custom.js':'Codificación, atlas, composición/canvas, cola/caché, previsualización y guardado.',
 'gf-vip.js':'Estado por cuenta, API, facturas/compra, modales, marca HUD e islas.',
 'gf-zonas.js':'Viaje/guardado/reintento, decoración, clima, remolinos, luces y desmontaje.'
};
const otherScopes={
 'gf-hud-ajuste.js':'Relectura de ajustes y enlace del HUD; sin cambio nuevo.',
 'gf-redirect.js':'Relectura del helper completo; sin cambio nuevo.',
 'ui-image-fallbacks.js':'Relectura del helper completo; sin cambio nuevo.',
 'gf-wallet-boot.js':'Relectura del arranque de la cartera; sin cambio nuevo.',
 'gf-wallet-dashboard.js':'Relectura de flujos de sesión, refresco y panel; sin cambio nuevo.',
 'viewport-fix.js':'Relectura focal de medición, temporizadores y ciclo de vida; sin cambio nuevo.',
 'gf-soulbound.js':'Consumidores del ID personalizado, elección y descriptor, como integración del compositor.',
 'gf-mascota.js':'Contrato de API, timeout y filtrado de identidad para los consumidores reparados.',
 'gf-salvaje.js':'Contrato de efectos efímeros, jefes y desmontaje, como integración del módulo reparado.'
};
const base=read('baseline.json'),expected=new Set([...Object.keys(scopes),'index.html','GrasslandBuild/repositories/backend/package.json','GrasslandBuild/repositories/backend/package-lock.json']);
const files=base.files.map(f=>{
 assert.equal(sha(f.backup),f.sha256,'Backup original altered '+f.relative);
 const after=sha(f.source),relative=norm(f.relative),changed=after!==f.sha256;
 assert.equal(changed,expected.has(relative),'Unexpected source modification '+relative);
 return{file:relative,source:f.source,backup:f.backup,before:f.sha256,after,changed};
});
const beforeIndex=fs.readFileSync(base.files.find(f=>f.relative==='index.html').backup,'utf8');let expectedIndex=beforeIndex;
for(const name of Object.keys(scopes)){
 const re=new RegExp('('+name.replace('.','\\.')+'\\?v=)([0-9]+\\.[0-9]+)(?:\\.[a-f0-9]{12})?(?=["\\\'])','g');let matches=0;
 expectedIndex=expectedIndex.replace(re,(_m,p,v)=>{matches++;return p+v+'.'+sha(path.join(root,name)).slice(0,12);});assert.equal(matches,1,name);
}
assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),expectedIndex,'HTML changed beyond the thirteen cache keys');
const libs=read('libraries-source-audit.json');assert.equal(libs.libraries,96);assert.ok(libs.results.every(r=>r.errors.length===0));
const previous=JSON.parse(fs.readFileSync(path.join(root,'audits/library-review-20261021T051408Z/deep-source-inventory.json'),'utf8'));
const tests=fs.readdirSync(path.join(root,'tools')).filter(n=>/\.test\.(cjs|mjs)$/.test(n)).map(name=>({name,source:fs.readFileSync(path.join(root,'tools',name),'utf8')}));
const coverage=libs.results.map(r=>{
 const file=r.file,prior=previous.results.find(p=>norm(p.file)===file),currentSha=sha(path.join(root,file));
 return{file,bytes:r.bytes,sha256:currentSha,fullStaticAnalysis:true,staticErrors:r.errors,
  changedThisPass:!!scopes[file],manualScopeThisPass:scopes[file]||otherScopes[file]||'Sin nueva relectura manual en esta ampliación; AST íntegro y regresiones actualizados.',
  previousReviewSha256:prior?.sha256||null,identicalToPreviousReview:prior?prior.sha256===currentSha:null,
  testsMentioningFile:tests.filter(t=>t.source.includes(file)||t.source.includes(path.basename(file,'.js'))).map(t=>'tools/'+t.name)};
});
fs.writeFileSync(path.join(__dirname,'coverage.json'),JSON.stringify({libraries:96,meaning:'La mención de un archivo en una prueba no acredita todas sus ramas. La lectura manual focal y el análisis estático completo son coberturas distintas.',coverage},null,2));
fs.writeFileSync(path.join(__dirname,'COBERTURA.md'),'# Cobertura de las 96 bibliotecas propias\n\nTodas recibieron análisis estático íntegro actualizado. Esta ampliación releyó y reparó los trece módulos de la tabla; el resto distingue relectura focal y cobertura automatizada. No se declara lectura manual nueva de cada línea de las 96 bibliotecas. Los hashes permiten comparar con la revisión anterior. `coverage.json` añade pruebas que mencionan cada archivo, sin equiparar esa mención con cobertura de todas sus ramas.\n\n| Archivo | Modificado | Alcance manual de esta ampliación |\n|---|---|---|\n'+coverage.map(c=>'| `'+c.file+'` | '+(c.changedThisPass?'Sí':'No')+' | '+c.manualScopeThisPass+' |').join('\n')+'\n');
const audits={};for(const name of ['client','desktop','backend-production','backend-all'])audits[name]=read('npm-'+name+'.txt').metadata.vulnerabilities;
const stats={...base,files:undefined,compared:files.length,modified:files.filter(f=>f.changed).length,unchanged:files.filter(f=>!f.changed).length,
 newVerificationTools:['tools/remaining-libraries.test.cjs','tools/remaining-dependencies.test.cjs','tools/remaining-libraries-browser.cjs'],
 indexOnlyThirteenCacheTokens:true,desktopServerUnchanged:files.filter(f=>f.source==='C:\\Users\\pc\\Desktop\\server2.js').every(f=>!f.changed),audits,files};
assert.equal(files.filter(f=>f.source==='C:\\Users\\pc\\Desktop\\server2.js').length,1);
fs.writeFileSync(path.join(__dirname,'changes.json'),JSON.stringify(stats,null,2));
console.log(JSON.stringify({compared:stats.compared,modified:stats.modified,unchanged:stats.unchanged,libraries:coverage.length,audits},null,2));
