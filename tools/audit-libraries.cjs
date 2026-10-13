'use strict';
// Auditoría del código propio; las dependencias empaquetadas se revisan con npm audit.
const fs = require('node:fs'), path = require('node:path');
const { Linter } = require('eslint');
const espree = require('espree'), globals = require('globals');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter(n => n.endsWith('.js') && !n.startsWith('_prueba'))
  .concat(['lib/tileManager.js', 'lib/tileMonitor.js', 'gf-wallet-sdk/gf-wallet.js']);
const parsed = new Map(), names = { ...globals.browser, ...globals.es2021, ...globals.node,
  module: 'readonly', exports: 'readonly', require: 'readonly', global: 'readonly', Phaser: 'readonly', ethers: 'readonly', io: 'readonly',
  define: 'readonly', __RELAY_API_BASE__: 'readonly', PhaserRelay: 'readonly' };
const results = [];
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'range', 'tokens', 'comments', 'parent'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(n => walk(n, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  let ast, sourceType = 'script';
  try { ast = espree.parse(source, { ecmaVersion: 'latest', sourceType, loc: true }); }
  catch (e) {
    if (!/sourceType: module/.test(e.message)) throw new Error(`${file}: ${e.message}`);
    sourceType = 'module'; ast = espree.parse(source, { ecmaVersion: 'latest', sourceType, loc: true });
  }
  parsed.set(file, { source, ast, sourceType });
  for (const n of ast.body) {
    if (n.id?.name) names[n.id.name] = 'readonly';
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.name) names[d.id.name] = 'writable';
  }
  walk(ast, n => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' &&
        ['window', 'global', 'globalThis'].includes(n.left.object.name) && n.left.property.name) names[n.left.property.name] = 'writable';
  });
}
const linter = new Linter();
for (const [file, { source, ast, sourceType }] of parsed) {
  const resources = {}, cleanup = [];
  walk(ast, n => {
    const name = n.callee?.name || n.callee?.property?.name;
    if (n.type === 'CallExpression' && ['setTimeout', 'setInterval', 'requestAnimationFrame', 'addEventListener', 'on', 'once', 'fetch', 'addCanvas', 'createCanvas', 'createObjectURL'].includes(name)) resources[name] = (resources[name] || 0) + 1;
    if (n.type === 'MethodDefinition' && /destroy|cleanup|dispose|stop|desmontar|detener/i.test(n.key.name)) cleanup.push(n.key.name);
    if (n.type === 'FunctionDeclaration' && /desmontar|detener|cleanup|destroy/i.test(n.id.name)) cleanup.push(n.id.name);
  });
  const messages = linter.verify(source, { languageOptions: { ecmaVersion: 'latest', sourceType, globals: names },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-args': 'error', 'no-dupe-class-members': 'error',
      'constructor-super': 'error', 'no-unsafe-finally': 'error', 'no-async-promise-executor': 'error', 'use-isnan': 'error' } }, file);
  results.push({ file, bytes: Buffer.byteLength(source), resources, cleanup: [...new Set(cleanup)],
    errors: messages.map(m => ({ line: m.line, rule: m.ruleId, message: m.message })) });
}
fs.mkdirSync(path.join(root, 'GrasslandBuild/dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'GrasslandBuild/dist/libraries-source-audit.json'), JSON.stringify({ libraries: results.length, results }, null, 2));
console.log(`Bibliotecas propias analizadas: ${results.length}`);
for (const r of results) for (const e of r.errors) console.log(`${r.file}:${e.line} ${e.rule}: ${e.message}`);
console.log(`Errores estáticos: ${results.reduce((n, r) => n + r.errors.length, 0)}`);
process.exitCode = results.some(r => r.errors.length) ? 1 : 0;
