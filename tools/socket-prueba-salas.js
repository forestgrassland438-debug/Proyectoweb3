/* Salas, canales y reconexión: el mecanismo multijugador del servidor.
 *
 * EL FALLO QUE VIGILA — "mis amigos me ven moverme, yo a ellos no; el chat se
 * cae y no vuelve". El servidor conoce al jugador por el id del socket, y tras
 * una reconexión ese id es otro: hasta que el cliente rehace `joinRoom`, el
 * socket está conectado pero no pertenece a ninguna sala. Todo el mecanismo de
 * volver a entrar depende de que `joinRoom` CONTESTE siempre — antes había un
 * `return` seco que dejaba al cliente con el mapa vacío para siempre, porque
 * borra sus jugadores justo antes de pedir la lista otra vez.
 *
 * Esta prueba saca del server2.js de verdad los manejadores de joinRoom,
 * playerMove y disconnect, y el bloque de canales, y los ejecuta contra un
 * Socket.IO de mentira. Si alguien los cambia, la prueba cambia con ellos y no
 * se queda comprobando una copia vieja.
 *
 *   node tools/socket-prueba-salas.js  [ruta a server2.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SERVIDOR = process.argv[2] ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');

if (!fs.existsSync(SERVIDOR)) {
  console.error('No encuentro el servidor en: ' + SERVIDOR);
  console.error('Pasalo como argumento:  node tools/socket-prueba-salas.js <ruta>');
  process.exit(2);
}
// Los ficheros del proyecto están en CRLF. Se normaliza para que los trozos
// que se buscan más abajo no dependan del final de línea.
const TXT = fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n');

/** Saca un trozo literal del servidor, de `desde` hasta `hasta` incluido. */
function sacar(desde, hasta, nombre) {
  const i = TXT.indexOf(desde);
  if (i < 0) throw new Error('no encuentro en el servidor: ' + (nombre || desde));
  const j = TXT.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error('no encuentro el final de: ' + (nombre || desde));
  return TXT.slice(i, j + hasta.length);
}

// ── Socket.IO de mentira ────────────────────────────────────────────────────
const sockets = new Map();

class SocketFalso {
  constructor(id, canalPedido) {
    this.id = id;
    this.handshake = { auth: canalPedido ? { canal: canalPedido } : {}, address: '1.2.3.4' };
    this.salas = new Set();
    this.recibidos = [];          // [evento, datos] que le llegan A EL
    this._manejadores = {};
    sockets.set(id, this);
  }
  on(ev, fn) { this._manejadores[ev] = fn; }
  emit(ev, datos) { this.recibidos.push([ev, datos]); }
  join(sala) { this.salas.add(sala); }
  leave(sala) { this.salas.delete(sala); }
  to(sala) { return canalDeSalida(sala, this.id); }   // a los demás de la sala
  disparar(ev, datos) {
    if (!this._manejadores[ev]) throw new Error('el servidor no escucha "' + ev + '"');
    return this._manejadores[ev](datos);
  }
  ultimo(ev) {
    for (let i = this.recibidos.length - 1; i >= 0; i--) {
      if (this.recibidos[i][0] === ev) return this.recibidos[i][1];
    }
    return undefined;
  }
  cuantos(ev) { return this.recibidos.filter(r => r[0] === ev).length; }
}

function canalDeSalida(sala, excluir) {
  return {
    emit(ev, datos) {
      for (const [id, s] of sockets) {
        if (id === excluir) continue;
        if (s.salas.has(sala)) s.emit(ev, datos);
      }
    }
  };
}

const io = {
  of() { return { sockets }; },
  to(sala) { return canalDeSalida(sala, null); },
  sockets: { sockets }
};

// ── El código real del servidor, montado sobre lo de mentira ────────────────
const rooms = { 'game': {}, 'tienda': {} };
const NOMBRE_SOULBOUND_VALIDO = /^[A-Za-z0-9_-]{1,40}$/;
const console_ = { log() {}, warn() {}, error() {} };   // el servidor habla mucho

// Un solo trozo: canales, salaConCanal/salaBase, purgarFantasmas y barrerSalas
// van seguidos en el servidor. Partirlo por la mitad dejaba una funcion abierta.
const bloqueCanales = sacar('const CANALES_TOTAL = 10;',
                            'if (typeof _barridoSalas.unref === \'function\') _barridoSalas.unref();',
                            'canales + barrido');
const asignaCanal   = sacar('  const canalPedido = Number(socket.handshake',
                            'primerCanalLibre() || CANALES_TOTAL;', 'asignacion de canal');
const elJoin0       = sacar('  socket.on("joinRoom", async (data) => {',
                            '\n  });\n\n  socket.on("playerMove"', 'joinRoom');
// El marcador de final arrastra el principio del manejador siguiente (hace
// falta para no cortar antes de tiempo dentro del cuerpo): aqui se recorta.
const elJoin = elJoin0.slice(0, elJoin0.lastIndexOf('\n  });') + 6);
const elMove        = sacar('  socket.on("playerMove", (data) => {',
                            '\n  });\n', 'playerMove');
const elAdios       = sacar('  socket.on("disconnect", () => {', '\n  });\n', 'disconnect');

const montar = new Function('io', 'rooms', 'sockets', 'NOMBRE_SOULBOUND_VALIDO', 'console', `
${bloqueCanales}
function conectar(socket) {
  socket.playerData = { id: socket.id, room: null, username: '---', lastScene: null, canal: null };
${asignaCanal}
  socket.emit('canalAsignado', { canal: socket.playerData.canal, total: CANALES_TOTAL, cupo: CANAL_CUPO });
${elJoin}
${elMove}
${elAdios}
}
return { conectar, barrerSalas, purgarFantasmas, ocupacionCanales };
`);

const api = montar(io, rooms, sockets, NOMBRE_SOULBOUND_VALIDO, console_);

// ── Comprobaciones ──────────────────────────────────────────────────────────
let fallos = 0, pasadas = 0;
const ok = (c, m, x) => {
  if (c) { pasadas++; console.log('  OK    ' + m); }
  else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); }
};

function nuevo(id, canal) {
  const s = new SocketFalso(id, canal);
  api.conectar(s);
  return s;
}
const join = (s, sala, nombre, escena) =>
  s.disparar('joinRoom', { room: sala, username: nombre, lastScene: escena || 'GameScene' });

console.log('=== SALAS, CANALES Y RECONEXION ===\n');

// 1) Entrada normal
console.log('1) Dos jugadores en la misma sala');
const a = nuevo('A');
const b = nuevo('B');
join(a, 'game', 'Ana');
join(b, 'game', 'Beto');
const listaB = b.ultimo('currentPlayers');
ok(Array.isArray(listaB) && listaB.length === 1 && listaB[0].username === 'Ana',
   'B recibe a A en currentPlayers', JSON.stringify(listaB && listaB.map(p => p.username)));
ok(a.ultimo('newPlayer') && a.ultimo('newPlayer').username === 'Beto', 'A recibe newPlayer de B');

// 2) EL FALLO GORDO: re-join en el mismo socket
console.log('\n2) Re-join en el mismo socket (sala y escena identicas)');
const antes = a.cuantos('currentPlayers');
join(a, 'game', 'Ana');
ok(a.cuantos('currentPlayers') === antes + 1,
   'el re-join responde con currentPlayers',
   'sin respuesta: el cliente se queda con el mapa vacio');
const listaA = a.ultimo('currentPlayers');
ok(Array.isArray(listaA) && listaA.length === 1 && listaA[0].username === 'Beto',
   'y en la lista sigue estando B', JSON.stringify(listaA));
const nuevosB = b.cuantos('newPlayer');
join(a, 'game', 'Ana');
ok(b.cuantos('newPlayer') === nuevosB, 'el re-join no anuncia a A como jugador nuevo');

// 3) La posicion sobrevive al re-join
console.log('\n3) La posicion sobrevive al re-join');
a.disparar('playerMove', { x: 640, y: 480, direction: 'left' });
join(a, 'game', 'Ana');
const c = nuevo('C');
join(c, 'game', 'Ce');
const ana = (c.ultimo('currentPlayers') || []).find(p => p.username === 'Ana');
ok(ana && ana.x === 640 && ana.y === 480, 'A sigue en 640,480 y no en 0,0',
   ana ? ana.x + ',' + ana.y : 'no aparece');

// 4) Aviso al socket sin sala
console.log('\n4) Socket que no esta en ninguna sala');
const d = nuevo('D');
d.disparar('playerMove', { x: 1, y: 1 });
ok(!!d.ultimo('rejoinRequired'), 'playerMove sin sala responde rejoinRequired');

// 5) El canal se conserva
console.log('\n5) El canal viaja en el saludo');
const e = nuevo('E', 7);
ok(e.ultimo('canalAsignado') && e.ultimo('canalAsignado').canal === 7,
   'el que pide el canal 7 recibe el 7',
   JSON.stringify(e.ultimo('canalAsignado')));
const f = nuevo('F', 99);
const cf = f.ultimo('canalAsignado');
ok(cf && cf.canal >= 1 && cf.canal <= 10, 'un canal fuera de rango se ignora',
   JSON.stringify(cf));
join(e, 'game', 'Eva');
ok((e.ultimo('currentPlayers') || []).length === 0,
   'en el canal 7 no ve a los del canal 1', JSON.stringify(e.ultimo('currentPlayers')));

// 6) Barrido de fantasmas
console.log('\n6) Fantasmas: socket muerto que quedo en la sala');
const salaA = 'game#c' + a.ultimo('canalAsignado').canal;
rooms[salaA]['fantasma'] = { id: 'fantasma', x: 0, y: 0, username: 'Zombi' };
const idosAntes = b.cuantos('playerLeft');
api.barrerSalas();
ok(!rooms[salaA]['fantasma'], 'el barrido lo quita de la sala');
ok(b.cuantos('playerLeft') === idosAntes + 1 && b.ultimo('playerLeft').reason === 'ghost',
   'y avisa a los demas con playerLeft', JSON.stringify(b.ultimo('playerLeft')));

// 7) Desconexion
console.log('\n7) Desconexion limpia');
const idos = b.cuantos('playerLeft');
c.disparar('disconnect');
sockets.delete('C');
ok(b.cuantos('playerLeft') === idos + 1 && b.ultimo('playerLeft').reason === 'disconnected',
   'playerLeft al desconectarse', JSON.stringify(b.ultimo('playerLeft')));
ok(!rooms[salaA]['C'], 'y sale del registro de la sala');

// ── final ───────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
if (fallos) { console.log('\nHay fallos en el mecanismo de salas.'); process.exit(1); }
console.log('Sin fallos.');
process.exit(0);
