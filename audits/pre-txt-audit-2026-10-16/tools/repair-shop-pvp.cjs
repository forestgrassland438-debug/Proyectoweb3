'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const target = process.argv[2] || path.join(require('node:os').homedir(), 'Desktop', 'server2.js');
let bytes = fs.readFileSync(target);
function replace(before, after) {
  const a = Buffer.from(before), b = Buffer.from(after);
  const i = bytes.indexOf(a);
  if (i < 0 || bytes.indexOf(a, i + a.length) >= 0) throw new Error('Sección ausente o ambigua: ' + before.slice(0, 75));
  bytes = Buffer.concat([bytes.subarray(0, i), b, bytes.subarray(i + a.length)]);
}
const sourceEol = bytes.includes(Buffer.from('function ponerFacturaEnSlots(inventory, chest, itemId, factura) {\r\n')) ? '\r\n' : '\n';
const syncSource = fs.readFileSync(path.join(__dirname, 'backend-inventory-sync.js'), 'utf8').replace(/\r?\n/g, sourceEol);
if (bytes.includes(Buffer.from('// <<SHOP-PVP-SYNC>>'))) {
  const start = bytes.indexOf(Buffer.from('// <<SHOP-PVP-SYNC>>'));
  const endMarker = Buffer.from('// <<SHOP-PVP-SYNC-FIN>>');
  const end = bytes.indexOf(endMarker, start);
  if (end < 0) throw new Error('Falta marcador final de inventario');
  bytes = Buffer.concat([bytes.subarray(0, start), Buffer.from('// <<SHOP-PVP-SYNC>>' + sourceEol + syncSource + sourceEol), bytes.subarray(end)]);
}
if (!bytes.includes(Buffer.from('// <<SHOP-PVP-SYNC>>'))) {
  const eol = bytes.includes(Buffer.from('function ponerFacturaEnSlots(inventory, chest, itemId, factura) {\r\n')) ? '\r\n' : '\n';
  const source = fs.readFileSync(path.join(__dirname, 'backend-inventory-sync.js'), 'utf8').replace(/\r?\n/g, eol);
  const anchor = 'function ponerFacturaEnSlots(inventory, chest, itemId, factura) {';
  replace(anchor, '// <<SHOP-PVP-SYNC>>' + eol + source + eol + '// <<SHOP-PVP-SYNC-FIN>>' + eol + anchor);
  replace('      await saveGamePlayerWithTutorial(playerName, update);',
    '      inventarioObsoleto = (await guardarInventarioProtegido(playerName, address, update, req.body.inventoryLoadedAt)) || inventarioObsoleto;');
}
if (!bytes.includes(Buffer.from('_battleQueueDeadline'))) {
  replace('  if (!socket || !ticket) return;',
    '  if (!socket || !ticket) return;\n  if (ticket._battleQueueDeadline) { clearTimeout(ticket._battleQueueDeadline); ticket._battleQueueDeadline = null; }');
  replace('      battleQueue.push(socket);',
    '      battleQueue.push(socket);\n' +
    '      ticket._battleQueueDeadline = setTimeout(() => {\n' +
    '        ticket._battleQueueDeadline = null;\n' +
    '        if (isBattleAdmissionCurrent(socket, ticket)) brawlEmparejar();\n' +
    '      }, Math.max(0, ticket.createdAt + BRAWL_BUSQUEDA_MS - Date.now()));');
  replace('    match.humanos.push(reg);',
    '    match.humanos.push(reg);\n    if (h.ticket._battleQueueDeadline) { clearTimeout(h.ticket._battleQueueDeadline); h.ticket._battleQueueDeadline = null; }');
}
if (!bytes.includes(Buffer.from('inventoryLoadedAt: p.marketWriteAt'))) {
  replace('      const response = Object.assign({}, p, { ',
    '      const response = Object.assign({}, p, { \n        inventoryLoadedAt: p.marketWriteAt || new Date(0).toISOString(),');
}
if (!bytes.includes(Buffer.from("enCola: battleQueue.length, empiezaEnMs: Math.max(0, socket._battleTicket.createdAt"))) {
  replace("emitBattle(socket, 'brawl:enCola', { enCola: battleQueue.length });",
    "emitBattle(socket, 'brawl:enCola', { enCola: battleQueue.length, empiezaEnMs: Math.max(0, socket._battleTicket.createdAt + BRAWL_BUSQUEDA_MS - Date.now()) });");
}
if (!bytes.includes(Buffer.from('const BRAWL_BUSQUEDA_MS = 150000;'))) {
  replace('const BRAWL_SALA_MS = 8000;', 'const BRAWL_BUSQUEDA_MS = 150000;\nconst BRAWL_SALA_MS = BRAWL_BUSQUEDA_MS;');
  replace('if (battleQueue.length >= 2 || brawlSala)', 'if (battleQueue.length >= 1 || brawlSala)');
  replace("emitBattle(s, 'brawl:enCola', { posicion: i + 1, enCola: battleQueue.length })",
    "emitBattle(s, 'brawl:enCola', { posicion: i + 1, enCola: battleQueue.length, empiezaEnMs: Math.max(0, s._battleTicket.createdAt + BRAWL_BUSQUEDA_MS - Date.now()) })");
  replace('    if (grupo.length < 2) continue;', '    if (grupo.length < 2 && ahora < a.ticket.createdAt + BRAWL_BUSQUEDA_MS) continue;');
  replace('    brawlSala = { regs: grupo, empiezaEn: ahora + BRAWL_SALA_MS, reloj: setTimeout(brawlLanzarSala, BRAWL_SALA_MS) };',
    '    const empiezaEn = Math.min(...grupo.map(r => r.ticket.createdAt)) + BRAWL_BUSQUEDA_MS;\n' +
    '    brawlSala = { regs: grupo, empiezaEn, reloj: setTimeout(brawlLanzarSala, Math.max(0, empiezaEn - ahora)) };');
  replace('  if (validos.length < 2) {', '  if (validos.length < 1) {');
  replace("  const match = brawlNuevaPartida('pvp', validos, [], {});",
    "  const bots = brawlBotsDeRelleno(validos, BRAWL_MAX_JUGADORES - validos.length);\n" +
    "  const match = brawlNuevaPartida('pvp', validos, bots, { extraInicio: { botsRelleno: bots.length } });");
  replace('function brawlLanzarSala() {', `function brawlBotsDeRelleno(humanos, cuantos) {
  const levels = humanos.map(h => h.player.level).sort((a, b) => a - b);
  const level = levels[Math.floor(levels.length / 2)] || 1;
  const stats = battleStatsForLevel(level);
  const fichas = BATTLE_BOTS.concat(BATTLE_BOTS_EXTRA).slice().sort(() => Math.random() - 0.5);
  return Array.from({ length: Math.max(0, cuantos) }, (_, i) => {
    const f = fichas[i % fichas.length];
    return { species: f.species, petName: f.petName, playerName: f.playerName + ' · Bot',
      level, maxHp: stats.maxHp, attack: stats.attack, astucia: 0.62 + (i % 3) * 0.08, salud: 1 };
  });
}

function brawlLanzarSala() {`);
}
new vm.Script(bytes.toString('utf8'), { filename: target });
const old = fs.readFileSync(target);
if (old.equals(bytes)) { console.log('Backend ya actualizado.'); process.exit(0); }
if (bytes.length < old.length) throw new Error('El backend encogió inesperadamente');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(target, target + '.bak-shop-pvp-' + stamp);
fs.writeFileSync(target + '.tmp-shop-pvp', bytes);
fs.renameSync(target + '.tmp-shop-pvp', target);
console.log('Backend actualizado; copia de seguridad .bak-shop-pvp-' + stamp);
