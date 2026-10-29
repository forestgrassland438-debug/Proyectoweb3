'use strict';
const fs = require('node:fs'), path = require('node:path'), acorn = require('acorn');
const root = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(root, 'tienda_sistema.js'), 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
let catalogue;
function visit(n) {
  if (!n || typeof n !== 'object') return;
  if (n.type === 'AssignmentExpression' && n.left?.object?.type === 'ThisExpression' && n.left.property?.name === 'itemsTienda') catalogue = n.right;
  for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
}
visit(ast); if (catalogue?.type !== 'ObjectExpression') throw Error('Catalogue is not a static object');
const limits = {};
for (const category of catalogue.properties) for (const item of category.value.elements || []) {
  const values = Object.fromEntries((item.properties || []).map(p => [p.key.name || p.key.value, p.value.value]));
  if (values.id && Number.isSafeInteger(values.limiteDiario) && values.limiteDiario > 0) limits[values.id] = values.limiteDiario;
}
fs.writeFileSync(path.join(root, 'audits/economia-20261028/catalogue-limits.json'), JSON.stringify(limits, null, 2));
const p = 'C:/Users/pc/Desktop/server2.js'; let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const anchor = '// NPC money is authoritative.';
if (!s.includes(anchor)) throw Error('Missing authority block');
s = s.replace(anchor, 'const ECO_TIENDA_LIMITES = Object.freeze(' + JSON.stringify(limits) + ');\n' + anchor);
const point = "        if (op === 'compra') {\n          const plan = eco2PlanPago(reserve, st);";
if (!s.includes(point)) throw Error('Missing purchase transaction');
s = s.replace(point, `        if (op === 'compra') {
          const limit = ECO_TIENDA_LIMITES[b.itemId] || 0;
          if (limit) {
            const rows = await ServicioCobro.find({ playerName: gp.playerName, tipo: 'tienda_compra', itemId: b.itemId,
              estado: { $in: ['cobrado', 'revision', 'completado'] }, t: { $gte: new Date(_diaUTC() + 'T00:00:00Z') } }).session(session).lean();
            const used = rows.reduce((sum, row) => sum + (row.estado === 'completado' ? row.confirmadas || 0 : row.cantidad || 0), 0);
            if (used + q > limit) throw ecoError('tope_diario_tienda', 409);
          }
          const plan = eco2PlanPago(reserve, st);`);
fs.writeFileSync(p, s.replace(/\n/g, '\r\n'));
console.log('Manual catalogue daily limits preserved and enforced by the server: ' + Object.keys(limits).length + ' items.');
