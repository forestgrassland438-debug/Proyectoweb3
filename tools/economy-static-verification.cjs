'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), acorn = require('acorn');
const root = path.resolve(__dirname, '..'), audit = path.join(root, 'audits/economia-20261028');
const serverPath = 'C:/Users/pc/Desktop/server2.js';
const before = fs.readFileSync(path.join(audit, 'server2.before.js'), 'utf8'), after = fs.readFileSync(serverPath, 'utf8');
const parse = s => acorn.parse(s, { ecmaVersion: 2022 });
const oldAst = parse(before), newAst = parse(after);
function routes(ast) {
  const counts = new Map();
  for (const n of ast.body) {
    const e = n.expression;
    if (e?.callee?.object?.name !== 'app' || typeof e.arguments?.[0]?.value !== 'string') continue;
    const name = e.callee.property.name + ' ' + e.arguments[0].value;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}
const previous = routes(oldAst), current = routes(newAst);
for (const [route, count] of current) assert.ok(count <= Math.max(1, previous.get(route) || 0), 'Duplicate route: ' + route);
function schemaDuplicates(ast) {
  const result = new Set();
  const inspect = (node, name) => {
    if (!node || node.type !== 'ObjectExpression') return;
    const seen = new Set();
    for (const p of node.properties) {
      if (p.type !== 'Property' || p.computed) continue;
      const key = p.key.name || p.key.value;
      if (seen.has(key)) result.add(name + '.' + key);
      seen.add(key); inspect(p.value, name + '.' + key);
    }
  };
  for (const node of ast.body) for (const d of node.declarations || []) {
    if (d.init?.type === 'NewExpression' && d.init.callee?.property?.name === 'Schema') inspect(d.init.arguments[0], d.id.name);
  }
  return result;
}
const previousDuplicates = schemaDuplicates(oldAst);
for (const name of schemaDuplicates(newAst)) assert.ok(previousDuplicates.has(name), 'New duplicate schema property: ' + name);
const files = ['CraftingHub.js', 'Scenes/GameScene.js', 'gf-servicios.js', 'gf-economia.js', 'gf-graficos.js', 'gf-precio-panel.js', 'gf-mascota.js', 'gf-salvaje.js', 'tienda_sistema.js', 'economia.js', 'economia2.js', 'economia-supervisor.js', 'control-center.js'];
for (const file of files) { try { parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch (e) { e.message = file + ': ' + e.message; throw e; } }
for (const file of ['index.html', 'market.html', 'economia.html', 'control-center.html']) {
  const content = fs.readFileSync(path.join(root, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const match of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) {
      try { parse(match[2]); } catch (e) { e.message = file + ' inline at ' + match.index + ': ' + e.message; throw e; }
    }
  }
}
const report = { parsedFiles: files.length + 5, newDuplicateRoutes: 0, newDuplicateSchemaProperties: 0, nodeTarget: 'ES2022', backendPath: serverPath };
fs.writeFileSync(path.join(audit, 'static-results.json'), JSON.stringify(report, null, 2));
console.log('ES2022 syntax verified; no new duplicate routes or schema properties.');
