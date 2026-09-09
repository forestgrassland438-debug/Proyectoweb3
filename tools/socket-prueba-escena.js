/* El socket compartido visto desde las escenas: GameScene y tiendajuego.
 *
 * EL FALLO QUE VIGILA — "se cae el chat y no vuelve; mis amigos se ven moverse
 * y yo no los veo". `window.globalSocket` es UNO por pestaña y lo comparten el
 * mapa, la tienda y el combate. Tres formas de romperlo, todas vividas:
 *
 *   · el cierre de escena hacia `socket.off()` + `socket.disconnect()` sobre el
 *     socket de todos. Con los oyentes globales borrados y la bandera
 *     `_globalEventsSet` en true, nadie los reponia: el socket se reconectaba y
 *     ya nadie se enteraba, asi que nadie rehacia el joinRoom;
 *   · initSocket() creaba otro socket si el actual estaba `!connected` — y un
 *     socket RECONECTANDO lo esta. Cada cambio de escena durante un corte
 *     dejaba un zombi conectado que ocupaba plaza en el canal;
 *   · joinRoom() se rendia con un console.warn si aun no habia conexion, que es
 *     justo lo que pasa en el arranque.
 *
 * Esta prueba saca los metodos REALES de los dos ficheros de escena y los
 * ejecuta contra un Phaser y un Socket.IO de mentira.
 *
 *   node tools/socket-prueba-escena.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const ESCENAS = [
  { fichero: path.join(BIN, 'Scenes', 'GameScene.js'),   sala: 'game'   },
  { fichero: path.join(BIN, 'Scenes', 'tiendajuego.js'), sala: 'tienda' }
];

const METODOS = ['initSocket', 'setupGlobalSocketEvents', '_enterrarSocket',
                 'joinRoom', 'rehacerJoin', '_prepararRejoinAlDespertar',
                 'onSocketReconnect', 'onSocketDisconnect', '_onShutdown',
                 'setupSceneSocketListeners', 'removeSocketListeners',
                 '_socketVivo', '_vaciarColaChat', '_sendChatFromInput',
                 /* El envio se parti en dos: `_sendChatFromInput` prepara y
                    `_enviarTextoAlChat` manda, que es tambien lo que usa la cola
                    de mensajes que llegan demasiado pronto (`_encolarChat`). Sin
                    los tres, esta prueba carga media clase y revienta. */
                 '_enviarTextoAlChat', '_encolarChat'];

/** Extrae `nombre(...) { … }` contando llaves, sin tropezar con cadenas ni comentarios. */
function metodo(txt, nombre) {
  const m = new RegExp('\\n( +' + nombre + '\\([^)]*\\)\\s*\\{)').exec(txt);
  if (!m) return '  ' + nombre + '() { /* no existe en este fichero */ }';
  const ini = m.index + 1;
  let i = m.index + m[0].length - 1;      // sobre la '{'
  let prof = 0, cadena = null, bloque = false, linea = false;
  while (i < txt.length) {
    const c = txt[i], dos = txt.substr(i, 2);
    if (linea)       { if (c === '\n') linea = false; }
    else if (bloque) { if (dos === '*/') { bloque = false; i += 2; continue; } }
    else if (cadena) { if (c === '\\') { i += 2; continue; } if (c === cadena) cadena = null; }
    else {
      if (dos === '//') { linea = true; i += 2; continue; }
      if (dos === '/*') { bloque = true; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') cadena = c;
      else if (c === '{') prof++;
      else if (c === '}') { if (--prof === 0) return txt.slice(ini, i + 1); }
    }
    i++;
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// ── Socket.IO de mentira, con lo que de verdad importa ──────────────────────
class SocketFalso {
  constructor(url, opciones) {
    this.url = url;
    this.opciones = opciones || {};
    this.id = 'sock_' + (SocketFalso.contador = (SocketFalso.contador || 0) + 1);
    this.connected = false; this.disconnected = true;
    this.active = true;                 // el motor de reintentos esta en marcha
    this.enterrado = false;
    this._oyentes = {}; this.enviados = [];
    SocketFalso.creados.push(this);
  }
  on(ev, fn) { (this._oyentes[ev] = this._oyentes[ev] || []).push(fn); return this; }
  once(ev, fn) { return this.on(ev, fn); }
  off(ev, fn) {
    if (ev === undefined) { this._oyentes = {}; return this; }
    if (!fn) { delete this._oyentes[ev]; return this; }
    const l = this._oyentes[ev] || [], i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
    return this;
  }
  removeAllListeners() { this._oyentes = {}; return this; }
  listeners(ev) { return (this._oyentes[ev] || []).slice(); }
  emit(ev, datos) { this.enviados.push([ev, datos]); return this; }
  recibir(ev, datos) { (this._oyentes[ev] || []).slice().forEach(f => f(datos)); }
  conectar() { this.connected = true; this.disconnected = false; this.active = true; this.recibir('connect'); }
  caer(motivo) { this.connected = false; this.disconnected = true; this.active = true; this.recibir('disconnect', motivo || 'transport close'); }
  morir() { this.connected = false; this.disconnected = true; this.active = false; }
  connect() { this.active = true; this.conectar(); }
  close() { this.enterrado = true; this.connected = false; this.disconnected = true; this.active = false; }
  disconnect() { return this.close(); }
}
SocketFalso.creados = [];

// ── Navegador de mentira ────────────────────────────────────────────────────
global.window = global;
global.document = {
  hidden: false,
  addEventListener() {}, getElementById() { return null; },
  createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }
};
global.addEventListener = function () {};
global.io = function (url, opciones) {
  const s = new SocketFalso(url, opciones);
  global.globalSocket = s;
  return s;
};

const BASE_ESCENA = `
class EscenaDePrueba {
  constructor() {
    this.serverclient1 = 'http://prueba.local';
    this.Username = 'Ana';
    this.currentRoom = null; this.lastJoinTime = 0; this.joinCooldown = 1000;
    this.socket = null; this.socketListeners = []; this.socketInitialized = false;
    this.myId = null;
    this.nivel = 3; this.petLevel = 2; this.petName = 'Rex';
    this._activa = true; this.jugadoresBorrados = 0; this.mensajesSistema = [];
    this._eventosUnaVez = {};
    this.chatInput = { value: '' };
    this._lastChatSent = 0; this._chatRateLimitMs = 0;
    this.scene = { isActive: () => this._activa, key: 'EscenaDePrueba' };
    this.time = { delayedCall: (ms, fn) => { this._ultimoRetardo = fn; return { remove() {} }; } };
    this.events = { once: (ev, fn) => { this._eventosUnaVez[ev] = fn; } };
  }
  clearOtherPlayers() { this.jugadoresBorrados++; }
  appendSystemMessage(t) { this.mensajesSistema.push(t); }
  _isNameSet(n) { return !!n; }
  createOtherPlayer() {} updateOtherPlayer() {} removeOtherPlayer() {}
  appendMessage() {} _showRemoteChatBubble() {} _showRemoteTypingBubble() {}
  _desescaparChat(t) { return t; }
  _showLocalChatBubble() {} _cerrarSelectorEmojis() {} _refrescarBotonEnviarChat() {}
  escribir(texto) { this.chatInput.value = texto; this._sendChatFromInput(); }
  /* La cola de envio usa setTimeout; en esta prueba el freno es 0, asi que
     nunca se encola. Se deja el metodo por si algun dia se prueba. */
`;

function claseDe(fichero) {
  const txt = fs.readFileSync(fichero, 'utf8').replace(/\r\n/g, '\n');
  const cuerpo = METODOS.map(n => metodo(txt, n)).join('\n\n');
  return new Function('SocketFalso', BASE_ESCENA + cuerpo + '\n}\nreturn EscenaDePrueba;')(SocketFalso);
}

// ── Comprobaciones ──────────────────────────────────────────────────────────
let fallos = 0, pasadas = 0;
const ok = (c, m, x) => {
  if (c) { pasadas++; console.log('  OK    ' + m); }
  else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); }
};
const enviados = (s, ev) => s.enviados.filter(x => x[0] === ev);

// El juego habla mucho por consola; aqui estorba.
const hablar = console.log;
const callar = () => { console.log = () => {}; };
const volver = () => { console.log = hablar; };

function limpiar() {
  SocketFalso.creados.length = 0;
  global.globalSocket = null; global.activeScene = null;
  global.__gfVigilanciaSocket = false;
  if (global.__gfVigilanteTimer) { clearInterval(global.__gfVigilanteTimer); global.__gfVigilanteTimer = null; }
}

function probar(Escena, sala, nombre) {
  console.log('\n### ' + nombre + ' (sala "' + sala + '")');
  const crear = () => { const e = new Escena(); global.activeScene = e; return e; };

  // 1) Arranque: el join no se pierde por no haber conexion aun
  limpiar(); callar();
  let esc = crear(); esc.initSocket();
  const s1 = global.globalSocket;
  volver();
  console.log('  1) Arranque antes de que haya conexion');
  ok(!!s1, 'se creo el socket');
  ok(s1._salaPendiente === sala, 'el join no se tira: queda apuntado', 'salaPendiente=' + s1._salaPendiente);
  ok(enviados(s1, 'joinRoom').length === 0, 'no se manda joinRoom sin conexion');
  callar(); s1.conectar(); volver();
  ok(enviados(s1, 'joinRoom').length === 1, 'al conectar se manda el joinRoom',
     enviados(s1, 'joinRoom').length + ' joins');
  ok(((enviados(s1, 'joinRoom')[0] || [])[1] || {}).room === sala, 'con la sala correcta');
  ok(esc.myId === s1.id, 'myId queda con el id del socket', String(esc.myId));

  // 2) El cierre de escena no mata el socket compartido
  console.log('  2) Cierre de escena');
  const oyentesAntes = s1.listeners('connect').length;
  callar(); esc._onShutdown(); volver();
  ok(s1.connected === true, 'el socket sigue conectado');
  ok(s1.enterrado === false, 'no se le enterro');
  ok(s1.listeners('connect').length === oyentesAntes, 'los oyentes globales siguen puestos',
     s1.listeners('connect').length + ' de ' + oyentesAntes);
  ok(s1.listeners('currentPlayers').length === 0, 'los de ESTA escena si se quitaron');

  // 3) La escena siguiente reutiliza la conexion
  console.log('  3) La escena siguiente reutiliza la conexion');
  callar(); const esc2 = crear(); esc2.initSocket(); volver();
  ok(SocketFalso.creados.length === 1, 'no se creo un socket nuevo', SocketFalso.creados.length + ' sockets');
  ok(esc2.socket === s1, 'usa el mismo');

  // 4) Cambio de escena MIENTRAS reconecta: el caso que dejaba zombis
  console.log('  4) Cambio de escena durante un corte de red');
  callar(); s1.caer(); const esc3 = crear(); esc3.initSocket(); volver();
  ok(SocketFalso.creados.length === 1, 'NO se crea un socket zombi', SocketFalso.creados.length + ' sockets');
  ok(esc3.socket === s1, 'sigue siendo el mismo socket');
  callar(); s1.conectar(); volver();
  ok(enviados(s1, 'joinRoom').length >= 2, 'al volver la red se rehace el join',
     enviados(s1, 'joinRoom').length + ' joins');

  // 5) Un socket rendido del todo si se sustituye, y se entierra
  console.log('  5) Socket rendido del todo');
  callar(); s1.morir(); const esc4 = crear(); esc4.initSocket(); volver();
  ok(SocketFalso.creados.length === 2, 'ahora si se crea uno nuevo', SocketFalso.creados.length + ' sockets');
  ok(s1.enterrado === true, 'al viejo se le enterro');
  ok(s1.listeners('connect').length === 0, 'y se le quitaron los oyentes');

  // 6) Oyentes globales borrados a mano: se reponen, sin duplicar y sin
  //    llevarse por delante los de otros modulos (gf-canales tambien escucha
  //    'connect' para pedir su canal).
  console.log('  6) Reposicion de los oyentes globales');
  const s2 = global.globalSocket;
  callar(); s2.conectar(); s2.removeAllListeners(); esc4.setupGlobalSocketEvents(s2); volver();
  ok(s2.listeners('connect').length === 1, 'setupGlobalSocketEvents los repone',
     String(s2.listeners('connect').length));

  const ajeno = function () {};              // el 'connect' de otro modulo
  s2.on('connect', ajeno);
  callar(); esc4.setupGlobalSocketEvents(s2); volver();
  ok(s2.listeners('connect').length === 2, 'llamarlo otra vez no duplica los nuestros',
     String(s2.listeners('connect').length));
  ok(s2.listeners('connect').indexOf(ajeno) >= 0, 'y respeta el oyente de otro modulo');

  callar(); s2.removeAllListeners(); s2.on('connect', ajeno);
  esc4.setupGlobalSocketEvents(s2); volver();
  ok(s2.listeners('connect').length === 2, 'tras un borrado, repone sin duplicar',
     String(s2.listeners('connect').length));

  // 7) rejoinRequired del servidor
  console.log('  7) El servidor pide rehacer el join');
  limpiar(); callar();
  const esc5 = crear(); esc5.initSocket();
  const s3 = global.globalSocket; s3.conectar();
  const antes7 = enviados(s3, 'joinRoom').length;
  s3.recibir('rejoinRequired', { motivo: 'sin_sala' });
  volver();
  ok(enviados(s3, 'joinRoom').length === antes7 + 1, 'se rehace el join');
  ok(esc5.jugadoresBorrados > 0, 'y se limpian los jugadores para repintarlos');

  // 8) Escena dormida (combate): la deuda se salda al despertar
  console.log('  8) Reconexion con la escena pausada');
  callar(); esc5._activa = false; s3.caer(); s3.conectar(); volver();
  ok(esc5._rejoinPendiente === true, 'queda apuntado el rejoin pendiente');
  const antes8 = enviados(s3, 'joinRoom').length;
  callar(); esc5._activa = true;
  if (esc5._eventosUnaVez.resume) esc5._eventosUnaVez.resume();
  volver();
  ok(enviados(s3, 'joinRoom').length > antes8, 'al despertar se rehace el join');

  // 9) El canal viaja en el saludo
  console.log('  9) El canal viaja en el handshake');
  limpiar(); global.__gfCanalActual = 4;
  callar(); const esc6 = crear(); esc6.initSocket(); volver();
  const s4 = global.globalSocket;
  ok(typeof s4.opciones.auth === 'function', 'el socket lleva una funcion auth');
  let saludo = null;
  if (typeof s4.opciones.auth === 'function') s4.opciones.auth(d => { saludo = d; });
  ok(saludo && saludo.canal === 4, 'manda el canal actual', JSON.stringify(saludo));
  global.__gfCanalActual = 9;
  if (typeof s4.opciones.auth === 'function') s4.opciones.auth(d => { saludo = d; });
  ok(saludo && saludo.canal === 9, 'y se lee en el momento, no congelado', JSON.stringify(saludo));

  // 10) Un unico vigilante por pestana
  console.log('  10) Un unico vigilante por pestana');
  const eraTimer = global.__gfVigilanteTimer;
  callar(); const e7 = crear(); e7.initSocket(); const e8 = crear(); e8.initSocket(); volver();
  ok(global.__gfVigilanteTimer === eraTimer, 'el vigilante no se duplica');
  ok(SocketFalso.creados.every(s => !s._vigilante), 'los sockets no llevan vigilante propio');

  // 11) EL CASO DE LA CAPTURA: el amigo se mueve y el chat contesta
  //     "Reconnecting…" en cada intento, para siempre.
  console.log('  11) Chat con la escena viva pero sin referencia al socket');
  limpiar(); callar();
  const esc9 = crear(); esc9.initSocket();
  const s5 = global.globalSocket; s5.conectar();
  // La escena pierde la referencia —performCleanup la pone a null, y create()
  // la deja a null durante medio segundo— pero sigue viva y sus oyentes siguen
  // pegados al socket: por eso se seguia viendo al amigo moverse.
  esc9.socket = null;
  esc9.escribir('hola');
  volver();
  const dichos = esc9.mensajesSistema.join(' | ');
  ok(enviados(s5, 'chatMessage').length === 1, 'el mensaje SE ENVIA igual',
     enviados(s5, 'chatMessage').length + ' enviados | avisos: ' + dichos);
  ok(!/Reconnecting/.test(dichos), 'y NO se contesta "Reconnecting"', dichos);
  ok(esc9.socket === s5, 'la escena readopta el socket vivo');
  ok(esc9.chatInput.value === '', 'y el campo se vacia');

  // 12) Sin linea de verdad: el mensaje se guarda y sale al volver
  console.log('  12) Sin conexion, el mensaje no se pierde');
  callar(); s5.caer(); esc9.escribir('mensaje en el corte'); volver();
  ok((esc9._colaChat || []).length === 1, 'el mensaje queda en cola',
     JSON.stringify(esc9._colaChat));
  ok(/will be sent/.test(esc9.mensajesSistema.join(' ')), 'y se le dice que saldra solo');
  callar(); s5.conectar();
  // currentPlayers es la señal de "ya estas en la sala": ahi se vacia la cola.
  s5.recibir('currentPlayers', []);
  volver();
  ok((esc9._colaChat || []).length === 0, 'la cola se vacia al volver a la sala');

  // 13) La lista de oyentes se vacia aunque no haya socket
  console.log('  13) removeSocketListeners sin socket');
  const esc10 = crear();
  esc10.socketListeners = [{ event: 'x', handler: function () {}, socket: null }];
  esc10.socket = null;
  callar(); esc10.removeSocketListeners(); volver();
  ok(esc10.socketListeners.length === 0, 'la lista queda vacia igualmente',
     esc10.socketListeners.length + ' apuntes');

  limpiar();
}

console.log('=== EL SOCKET COMPARTIDO, DESDE LAS ESCENAS ===');
for (const e of ESCENAS) {
  if (!fs.existsSync(e.fichero)) { console.error('No encuentro ' + e.fichero); process.exit(2); }
  probar(claseDe(e.fichero), e.sala, path.basename(e.fichero));
}

console.log('\n' + '='.repeat(60));
console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
if (fallos) { console.log('\nHay fallos en la gestion del socket.'); process.exit(1); }
console.log('Sin fallos.');
process.exit(0);
