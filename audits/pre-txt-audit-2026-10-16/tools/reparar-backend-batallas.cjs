'use strict';
// Parche por bytes: conserva las codificaciones y finales de línea del backend.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const target = process.argv[2] || path.join(require('node:os').homedir(), 'Desktop', 'server2.js');
let bytes = fs.readFileSync(target);
function replace(before, after) {
  const needle = Buffer.from(before);
  const offset = bytes.indexOf(needle);
  if (offset < 0) throw new Error('No se encontró la sección esperada: ' + before.slice(0, 70));
  if (bytes.indexOf(needle, offset + needle.length) >= 0) throw new Error('Sección ambigua');
  bytes = Buffer.concat([bytes.subarray(0, offset), Buffer.from(after), bytes.subarray(offset + needle.length)]);
}
if (bytes.includes(Buffer.from('function brawlRecuperarSolicitud(socket, modo)'))) {
  console.log('El backend ya tiene el parche de reconexión.');
  process.exit(0);
}
const newline = bytes.includes(Buffer.from('function brawlVolver(socket, datos) {\r\n')) ? '\r\n' : '\n';
const lines = s => s.replace(/\n/g, newline);
replace('function brawlVolver(socket, datos) {', lines(`function brawlVolver(socket, datos) {
  // Un socket aún enlazado también puede perder instantáneas o brawl:inicio.
  const actualId = socketMatch.get(socket.id);
  const actual = actualId && battleMatches.get(actualId);
  const actualReg = actual && brawlRegDe(actual, socket);
  if (actualReg && !actualReg.salio && !actual.ended && actual.P &&
      brawlCuenta(socket) === String(actualReg.ticket.account).toLowerCase() &&
      (!datos || !datos.matchId || datos.matchId === actualId)) {
    GFBrawlMotor.resincronizar(actual.P, actualReg.luchadorId);
    return;
  }`));
replace('// SOCKETS\r\n// ---------------------------------------------------------------------------\r\nio.on(\'connection\', (socket) => {', lines(`// SOCKETS
// ---------------------------------------------------------------------------
// Un reintento legítimo contesta con su estado actual; jamás crea otra partida.
function brawlRecuperarSolicitud(socket, modo) {
  const id = socketMatch.get(socket.id);
  const match = id && battleMatches.get(id);
  const reg = match && brawlRegDe(match, socket);
  if (reg && !reg.salio && !match.ended && match.P && match.modo === modo &&
      brawlCuenta(socket) === String(reg.ticket.account).toLowerCase()) {
    GFBrawlMotor.resincronizar(match.P, reg.luchadorId);
    return true;
  }
  const caido = brawlCaidos.get(brawlCuenta(socket));
  if (caido) { brawlVolver(socket, { matchId: caido.matchId }); return true; }
  if (socket._battleTicket && socket._battleTicket.mode === modo && !id) {
    if (modo === 'pvp' && socket._battleTicket.player) {
      emitBattle(socket, 'brawl:enCola', { enCola: battleQueue.length });
      if (brawlSala && brawlSala.regs.some(r => r.socket === socket)) brawlAvisarSala();
    }
    return true;
  }
  return false;
}
io.on('connection', (socket) => {`));
for (const mode of ['bot', 'practica', 'pvp']) {
  const anchor = `ticket = reserveBattleAdmission(socket, '${mode}');`;
  replace(anchor, `if (brawlRecuperarSolicitud(socket, '${mode}')) return;${newline}      ${anchor}`);
}
replace("      if (socket._battleTicket && socket._battleTicket.mode === 'pvp' && !socketMatch.has(socket.id)) return;", "      // brawlRecuperarSolicitud también vuelve a confirmar la cola.");
new vm.Script(bytes.toString('utf8'), { filename: target });
fs.copyFileSync(target, target + '.bak-conexion');
fs.writeFileSync(target + '.tmp-conexion', bytes);
fs.renameSync(target + '.tmp-conexion', target);
console.log('Backend reparado y copia .bak-conexion guardada.');
