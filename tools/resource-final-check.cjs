'use strict';
const fs=require('node:fs'),acorn=require('acorn'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const files=['C:/Users/pc/Desktop/server2.js','C:/Users/pc/Desktop/marketplace-routes.js','C:/Users/pc/Desktop/gf-wallet-sdk/server/gf-wallet-routes.js','marketplace-routes.js','Scenes/GameScene.js','control-center.js','reporter.js','recursos.js','cuentas.js','operations-panels.js','admin-suite-i18n.js'];
for(const file of files)acorn.parse(fs.readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'script',allowHashBang:true});
const inline=fs.readFileSync('market.html','utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
let scripts=0;for(const [_,attrs,code] of inline){if(!code.trim() || /application\/ld\+json/.test(attrs))continue;acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});scripts++;}
for(const page of ['market.html','recursos.html','cuentas.html','control-center.html','reporter.html']){
 const content=fs.readFileSync(page,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),ids=[...content.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'Duplicate ids in '+page);
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash('marketplace-routes.js'),hash('C:/Users/pc/Desktop/marketplace-routes.js'));
const manifest=JSON.parse(fs.readFileSync('audits/recursos-20261028/before-manifest.json','utf8'));
const contract=manifest.find(x=>x.path.endsWith('rr.txt.txt'));assert.equal(hash(contract.path),contract.sha256);
fs.writeFileSync('audits/recursos-20261028/final-check.json',JSON.stringify({ok:true,parsedFiles:files.length,inlineMarketScripts:scripts,duplicateIds:false,desktopMarketMatches:true,contractUnchanged:true,checkedAt:new Date().toISOString()},null,2));console.log('Syntax, DOM ids, backend module copies and original contract hash verified.');
