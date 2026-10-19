'use strict';
// Inventario completo de fuentes activas; los contadores orientan la revisión,
// no demuestran por sí mismos la existencia o ausencia de fugas de memoria.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const espree = require('espree'), { Linter } = require('eslint');
const root = path.resolve(__dirname, '..'), linter = new Linter();
const rules = Object.fromEntries(['no-unreachable', 'no-dupe-args', 'no-dupe-class-members', 'constructor-super',
  'no-unsafe-finally', 'no-async-promise-executor', 'use-isnan', 'no-constant-binary-expression', 'no-dupe-keys',
  'no-unsafe-optional-chaining', 'no-dupe-else-if', 'valid-typeof', 'no-self-assign', 'no-unreachable-loop',
  'no-sparse-arrays', 'no-loss-of-precision'].map(rule => [rule, 'error']));
rules['no-unreachable-loop'] = 'warn'; // Una selección deliberada del primer candidato también activa esta regla.
const files = fs.readdirSync(root).filter(name => /\.(js|html)$/.test(name) && !name.startsWith('_prueba'));
for (const dir of ['Scenes', 'lib', 'gf-wallet-sdk', 'backend-impact', 'GrasslandBuild/desktop']) {
  for (const name of fs.readdirSync(path.join(root, dir)))
    if (/\.(js|cjs|mjs|html)$/.test(name) && !/\.test\./.test(name)) files.push(dir + '/' + name);
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'range', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const results = [];
for (const file of files) {
  const bytes = fs.readFileSync(path.join(root, file)), source = bytes.toString('utf8');
  const units = /\.html$/.test(file) ? [...source.matchAll(/(<!--[\s\S]*?-->)|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => !match[1] && !/\bsrc\s*=/.test(match[2]) && !/\btype\s*=\s*["'](?:application\/(?:ld\+)?json|x-shader)/i.test(match[2]))
    .map((match, n) => ({ source: match[3], offset: source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1, unit: n }))
    : [{ source, offset: 0, unit: 0 }];
  const diagnostics = [], resources = {}, functions = [];
  for (const unit of units) {
    let ast, sourceType = 'script';
    try { ast = espree.parse(unit.source, { ecmaVersion: 'latest', sourceType, loc: true }); }
    catch (_) {
      sourceType = 'module';
      try { ast = espree.parse(unit.source, { ecmaVersion: 'latest', sourceType, loc: true }); }
      catch (error) { diagnostics.push({ line: unit.offset + error.lineNumber, rule: 'parse', severity: 2, message: error.message }); continue; }
    }
    walk(ast, node => {
      const name = node.callee?.name || node.callee?.property?.name;
      if (node.type === 'CallExpression' && ['setTimeout','setInterval','requestAnimationFrame','addEventListener','on','once','fetch','createObjectURL','createCanvas','addCanvas'].includes(name))
        (resources[name] ||= []).push(unit.offset + node.loc.start.line);
      if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|MethodDefinition)$/.test(node.type))
        functions.push({ line: unit.offset + node.loc.start.line, end: unit.offset + node.loc.end.line, name: node.id?.name || node.key?.name || '(callback)' });
    });
    const messages = linter.verify(unit.source, { linterOptions: { reportUnusedDisableDirectives: 'off' },
      languageOptions: { ecmaVersion: 'latest', sourceType }, rules }, { filename: 'source.js' });
    diagnostics.push(...messages.map(message => ({ line: unit.offset + message.line, rule: message.ruleId, severity: message.severity, message: message.message })));
  }
  results.push({ file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    lines: source.split('\n').length, units: units.length, diagnostics, resources, functions });
}
const report = { generatedAt: new Date().toISOString(), files: results.length, lines: results.reduce((n, file) => n + file.lines, 0),
  diagnostics: results.reduce((n, file) => n + file.diagnostics.length, 0),
  errors: results.reduce((n, file) => n + file.diagnostics.filter(diagnostic => diagnostic.severity === 2).length, 0), results };
fs.writeFileSync(path.join(root, 'audits/txt-source-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ files: report.files, lines: report.lines, errors: report.errors, warnings: report.diagnostics - report.errors }));
for (const result of results) for (const diagnostic of result.diagnostics) console.log(`${result.file}:${diagnostic.line} ${diagnostic.rule}: ${diagnostic.message}`);
process.exitCode = report.errors ? 1 : 0;
