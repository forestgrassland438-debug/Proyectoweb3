'use strict';
// Read-only inventory. No backend execution, wallet, database or network access.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
const pages = ['admin','colecciones','climas','consola-reportes','contrato-stats','misiones','puerta_login','reporter'];
const result = {};
for (const name of pages) {
  const html = fs.readFileSync(path.join(root,name+'.html'),'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const sources = scripts.map(m=>m[1].match(/src=["']([^"'?]+)/i)?.[1]).filter(Boolean);
  const texts = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').split(/<[^>]+>/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s&&/[a-záéíóúñ]/i.test(s));
  const code = scripts.map(m=>m[2]).join('\n')+'\n'+sources.filter(s=>!s.includes('vendor/')).map(s=>fs.readFileSync(path.join(root,s),'utf8')).join('\n');
  acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});
  result[name] = {bytes:Buffer.byteLength(html),scripts:sources,texts:[...new Set(texts)],endpoints:[...new Set([...code.matchAll(/['"](\/api\/[^'"\s]*)/g)].map(m=>m[1]))]};
}
if (process.argv.includes('--texts')) for(const [page,value] of Object.entries(result)) { console.log('\n'+page); console.log(value.texts.join('\n')); }
else console.log(JSON.stringify(result,null,2));
