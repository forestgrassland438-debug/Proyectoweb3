'use strict';
// Full-file AST inventory. Resource counts are review aids, not leak diagnoses.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const espree = require('espree');
const { Linter } = require('eslint');
const globals = require('globals');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter(n => n.endsWith('.js') && !n.startsWith('_prueba'));
for (const directory of ['Scenes', 'lib', 'gf-wallet-sdk', 'GrasslandBuild/desktop'])
  for (const name of fs.readdirSync(path.join(root, directory)))
    if (/\.(?:js|cjs|mjs)$/.test(name)) files.push(directory + '/' + name);
const backend = process.env.GRASSLAND_BACKEND_SOURCE || path.join(os.homedir(), 'Desktop', 'server2.js');
files.push(backend);
const resources = new Set(['setTimeout','setInterval','requestAnimationFrame','requestIdleCallback','addEventListener','on','once','fetch','createObjectURL','createCanvas','addCanvas']);
const linter = new Linter();
const rules = { 'no-unreachable':'error','no-dupe-args':'error','no-dupe-class-members':'error',
  'constructor-super':'error','no-unsafe-finally':'error','no-async-promise-executor':'error','use-isnan':'error',
  'no-constant-binary-expression':'error','no-dupe-keys':'error','no-unsafe-optional-chaining':'error' };
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc','range','tokens','comments','parent'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const results = files.map(file => {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  let sourceType = 'script', ast;
  try { ast = espree.parse(source, { ecmaVersion:'latest',sourceType,loc:true }); }
  catch (_) { sourceType = 'module'; ast = espree.parse(source, { ecmaVersion:'latest',sourceType,loc:true }); }
  const calls = {}, functions = [];
  walk(ast, node => {
    const name = node.callee?.name || node.callee?.property?.name;
    if (node.type === 'CallExpression' && resources.has(name)) {
      (calls[name] ||= []).push(node.loc.start.line);
    }
    if (node.type === 'MethodDefinition' || node.type === 'FunctionDeclaration') {
      functions.push({ name:node.key?.name || node.id?.name || '(anonymous)',start:node.loc.start.line,end:node.loc.end.line,
        async:Boolean(node.value?.async || node.async) });
    }
  });
  const messages = linter.verify(source, { linterOptions:{reportUnusedDisableDirectives:'off'},languageOptions:{ ecmaVersion:'latest',sourceType,
    globals:{...globals.browser,...globals.node,Phaser:'readonly',ethers:'readonly',io:'readonly'} },rules }, {filename:path.basename(file)});
  return {file,bytes:Buffer.byteLength(source),lines:source.split('\n').length,
    sha256:crypto.createHash('sha256').update(source).digest('hex'),resources:calls,functions,
    diagnostics:messages.map(m=>({line:m.line,rule:m.ruleId,severity:m.severity,message:m.message}))};
});
const manifest = JSON.parse(fs.readFileSync(path.join(root,'vendor/manifest.json'),'utf8'));
const vendor = Object.entries(manifest.files).map(([file,expected])=>{
  const data=fs.readFileSync(path.join(root,'vendor',file));
  return {file,integrityMatches:expected.integrity==='sha384-'+crypto.createHash('sha384').update(data).digest('base64'),bytesMatch:expected.bytes===data.length};
});
const diagnostics = results.reduce((n,r)=>n+r.diagnostics.length,0);
fs.mkdirSync(path.join(root,'audits'),{recursive:true});
fs.writeFileSync(path.join(root,'audits/deep-source-inventory.json'),JSON.stringify({generatedAt:new Date().toISOString(),
  files:results.length,bytes:results.reduce((n,r)=>n+r.bytes,0),lines:results.reduce((n,r)=>n+r.lines,0),diagnostics,vendor,results},null,2)+'\n');
console.log(JSON.stringify({files:results.length,lines:results.reduce((n,r)=>n+r.lines,0),diagnostics,vendor}));
for(const r of results) for(const d of r.diagnostics) console.log(`${r.file}:${d.line} ${d.rule}: ${d.message}`);
process.exitCode=diagnostics || vendor.some(v=>!v.integrityMatches||!v.bytesMatch)?1:0;
