'use strict';
const fs = require('node:fs'), path = require('node:path');
const target = 'C:/Users/pc/Desktop/server2.js';
let bytes = fs.readFileSync(target);
const original = bytes;
function replace(a, b) {
  const needle = Buffer.from(a), at = bytes.indexOf(needle);
  if (at < 0 || bytes.indexOf(needle, at + 1) >= 0) throw Error('Anchor not unique: ' + a.slice(0, 90));
  bytes = Buffer.concat([bytes.subarray(0, at), Buffer.from(b), bytes.subarray(at + needle.length)]);
}
replace('const TABLAS_SOLO_SERVIDOR = new Set([TABLA_NIVEL, TABLA_NOMBRE, TABLA_CONS_PARCELAS]);',
  "const GF_ALLOC_KEYS = ['strength','defense','wisdom','patience','farming','woodcutting','fishing','combat'];\r\nconst TABLAS_SOLO_SERVIDOR = new Set([TABLA_NIVEL, TABLA_NOMBRE, TABLA_CONS_PARCELAS, ...GF_ALLOC_KEYS.map(k => 'player_' + k)]);");
replace('const TABLAS_RECOMENDADAS = [', "const TABLAS_RECOMENDADAS = [\r\n  ...GF_ALLOC_KEYS.map(k => ({ tipo: 'player_' + k, limit: 1_000_000_000, perInvoiceLimit: 150, para: 'Character allocation: ' + k })),\r\n  ...['pocion_vida','pocion_antidoto'].map(tipo => ({ tipo, limit: 1_000_000_000, perInvoiceLimit: 20, para: 'Player potion' })),");
replace('  elixir_revivir:        { plata: 260, revive: true, nombre:', "  pocion_vida: { plata: 65, cura: 50, target: 'player', nombre: 'Health Potion' },\r\n  pocion_antidoto: { plata: 45, target: 'player', antidote: true, nombre: 'Antidote' },\r\n  elixir_revivir:        { plata: 260, revive: true, nombre:");
replace('        heals: c.cura || 0, revives: !!c.revive,', "        heals: c.cura || 0, revives: !!c.revive, target: c.target || 'pet', curesPoison: !!c.antidote,");
replace('      pet: estadoVivo(gp).pet\r\n    });', "      pet: estadoVivo(gp).pet, player: { health: stats ? stats.vida : 100, poisoned: _venenos.has(gp.playerName), alive: !gp.isGhost }\r\n    });");
replace('  pocion_mascota:        \'pocion_mascota\',', "  pocion_vida: 'pocion_vida', pocion_antidoto: 'pocion_antidoto',\r\n  pocion_mascota:        'pocion_mascota',");
replace('  pocion_mascota: 20, pocion_mascota_grande: 10, elixir_revivir: 5,', '  pocion_vida: 20, pocion_antidoto: 20,\r\n  pocion_mascota: 20, pocion_mascota_grande: 10, elixir_revivir: 5,');
replace("  skills:      { type: Object, default: {} },", "  allocations: { type: Object, default: {} },\r\n  allocationSyncAt: { type: Date, default: null },\r\n  skills:      { type: Object, default: {} },");
replace('  lastVitalRegen: { type: Date, default: null },', '  lastFullVitalHeal: { type: Date, default: null },\r\n  lastDamageAt: { type: Date, default: null },\r\n  swordGuardReady: { type: Date, default: null },\r\n  swordGuardUntil: { type: Date, default: null },\r\n  lastVitalRegen: { type: Date, default: null },');
replace("console.log('✅ Skills routes loaded');", "console.log('✅ Skills routes loaded');\r\n// CHARACTER-WORLD BEGIN\r\n" + fs.readFileSync(path.join(__dirname, 'character-world-server.js'), 'utf8').replace(/\r?\n/g, '\r\n') + '\r\n// CHARACTER-WORLD END');
// Only modify the regeneration function, preserving all its previous comments and semantics.
let start = bytes.indexOf(Buffer.from('function applyGhostVitalRegen('));
let end = bytes.indexOf(Buffer.from('async function regenerarVitalesEnBD('), start);
let section = bytes.subarray(start, end).toString('latin1');
const oldSection = section;
section = section.replace('  const ahora = now.getTime();', '  const healed = gfFullVitalHealing(doc, now);\r\n  const ahora = now.getTime();');
section = section.replace('return { changed: false, minutes: 0, gain: 0 };\r\n  }', 'return { changed: healed, minutes: healed ? 1 : 0, gain: healed ? 1 : 0 };\r\n  }');
section = section.replace('if (tics <= 0) return { changed: false, minutes: 0, gain: 0 };', 'if (tics <= 0) return { changed: healed, minutes: healed ? 1 : 0, gain: healed ? 1 : 0 };');
section = section.replace('  let changed = false;', '  let changed = healed;');
if (section === oldSection) throw Error('regen unchanged');
bytes = Buffer.concat([bytes.subarray(0, start), Buffer.from(section, 'latin1'), bytes.subarray(end)]);
replace('    const costesPedidos = costesDeAccion(reason, seedType, units);', '    let costesPedidos = costesDeAccion(reason, seedType, units);');
replace('    if (!doc.vitalFractions) doc.vitalFractions = { vida: 0, agua: 0, comida: 0 };', '    costesPedidos = await gfCharacterCosts(playerName, reason, costesPedidos, doc);\r\n    if (!doc.vitalFractions) doc.vitalFractions = { vida: 0, agua: 0, comida: 0 };');
replace('  serpiente_fuego: 9,', '  fantasma_mina: 6, mago_mina: 10,\r\n  serpiente_fuego: 9,');
replace('const MONSTRUOS_BOTIN = {', "const MONSTRUOS_BOTIN = {\r\n  fantasma_mina: { nombre: 'Mine Wraith', salas: ['mina'], enfriaMs: 5*60*1000, exp: 80, montones: [1,2], instancias: 2, botin: [['carbon',1,2],['Semillax',1,2]] },\r\n  mago_mina: { nombre: 'Ash Sorcerer', salas: ['mina'], enfriaMs: 8*60*1000, exp: 140, montones: [2,2], instancias: 2, botin: [['mineral_piedra_cobre',1,2],['Semillax2',1,2]] },");
// Use the exact Lands Terrain used by the client, with its 64px tile size.
const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../Maps/mapa_lands_x2.json'), 'utf8'));
const terrain = map.layers.find(l => l.name === 'Terrain');
if (!terrain || !terrain.data) throw Error('missing Lands terrain');
const rle = [];
for (let y=0;y<map.height;y++) { const runs=[]; for(let x=0;x<map.width;x++) if ((terrain.data[y*map.width+x]&0x1fffffff)===43) { const a=x; while(x+1<map.width && (terrain.data[y*map.width+x+1]&0x1fffffff)===43)x++; runs.push(a+'-'+x); } rle.push(runs.join(',')); }
replace('function pescaCercaDelAgua(px, py, radio = 3) {', 'const GF_LANDS_WATER = ' + JSON.stringify({ width: map.width, height: map.height, tile: map.tilewidth, rle: rle.join(';') }) + ';\r\nfunction gfLandsNearWater(x,y) {\r\n const cx=Math.floor(x/GF_LANDS_WATER.tile), cy=Math.floor(y/GF_LANDS_WATER.tile);\r\n for(let row=Math.max(0,cy-2);row<=Math.min(GF_LANDS_WATER.height-1,cy+2);row++) for(const run of GF_LANDS_WATER.rle.split(\';\')[row].split(\',\')) { if(!run)continue; const [a,b]=run.split(\'-\').map(Number); if(cx+2>=a && cx-2<=b)return true; } return false;\r\n}\r\nfunction pescaCercaDelAgua(px, py, radio = 3) {');
replace("if (!sala || salaBase(sala) !== 'game' || !rooms[sala] || !rooms[sala][s.id]) continue;", "if (!sala || !['game','isla'].includes(salaBase(sala)) || !rooms[sala] || !rooms[sala][s.id]) continue;");
replace('return { x: p.x, y: p.y };\r\n  }\r\n  return null;\r\n}\r\n\r\nconst _pescaSesiones', 'return { x: p.x, y: p.y, sala: salaBase(sala) };\r\n  }\r\n  return null;\r\n}\r\n\r\nconst _pescaSesiones');
replace("    if (!pescaCercaDelAgua(x, y)) return res.status(400).json({ error: 'lejos_del_agua' });\r\n    const vista = pescaPosicionVista(gp.playerName);", "    const vista = pescaPosicionVista(gp.playerName);\r\n    if (!vista || !(vista.sala === 'isla' ? gfLandsNearWater(x,y) : pescaCercaDelAgua(x,y))) return res.status(400).json({ error: 'lejos_del_agua' });");
fs.writeFileSync(target + '.bak-character-world-20261011', original, { flag: 'wx' });
fs.writeFileSync(target, bytes);
console.log('Patched exact anchors; preserved original bytes elsewhere:', bytes.length);
