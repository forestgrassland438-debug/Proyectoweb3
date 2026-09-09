#!/usr/bin/env node
/* =============================================================================
 * LO SOCIAL: QUE EL CLIENTE Y EL SERVIDOR SE HABLEN DE VERDAD
 * =============================================================================
 *
 * QUÉ VIGILA
 * ---------------------------------------------------------------------------
 * Las amistades, los privados, las reacciones del chat y el color del nombre
 * viajan por socket, y un socket es lo más silencioso que hay: si el cliente
 * emite `friends:remove` y el servidor escucha `friends:delete`, NO pasa nada.
 * Ni un error, ni un aviso. El botón simplemente no hace nada, para siempre.
 *
 * Es el mismo fallo que ya se cazó con `contratos-entre-modulos.js` para los
 * gf-* (los cuervos que no sonaban), pero cruzando la raya del navegador.
 *
 * QUÉ COMPRUEBA
 *   1. Todo evento que el cliente EMITE tiene un `socket.on` en el servidor.
 *   2. Todo evento que el cliente ESCUCHA lo emite el servidor en algún sitio.
 *   3. La lista de emojis de reacción es LA MISMA en los dos lados (si no, el
 *      jugador pulsa uno y el servidor lo descarta sin decir nada).
 *   4. El comando /add_friend se entiende igual en el cliente y en el servidor.
 *   5. El color del nombre se valida igual en los dos y NUNCA se pinta a ciegas.
 *   6. Las sombras de las nubes van en el MUNDO, no pegadas a la cámara, y su
 *      profundidad cae donde tiene que caer.
 *   7. Las dos escenas (mapa y tienda) montan los tres módulos: si a una se le
 *      olvida, el botón deja de responder al entrar en ella.
 *
 *   node tools/social-prueba.js  [carpeta bin]  [ruta de server2.js]
 *
 * El backend vive fuera del repositorio (Escritorio), así que si no se
 * encuentra se dice y se saltan las comprobaciones que lo necesitan, en vez de
 * fallar por algo que no es un fallo.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const BIN = process.argv[2] || path.join(__dirname, '..');
const SERVIDOR = process.argv[3] || path.join(os.homedir(), 'Desktop', 'server2.js');

let fallos = 0, pasadas = 0, saltadas = 0;

const ok = (cond, msg, extra) => {
  if (cond) { pasadas++; console.log('  OK    ' + msg); }
  else { fallos++; console.log('  FALLO ' + msg + (extra ? '\n          -> ' + extra : '')); }
};
const saltar = (msg) => { saltadas++; console.log('  --    ' + msg); };

const leer = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const hay = (f) => fs.existsSync(f);

// ── Ficheros ─────────────────────────────────────────────────────────────────
const F = {
  amigos:  path.join(BIN, 'gf-amigos.js'),
  chat:    path.join(BIN, 'gf-chat-social.js'),
  color:   path.join(BIN, 'gf-nombre-color.js'),
  clima:   path.join(BIN, 'gf-clima.js'),
  mapa:    path.join(BIN, 'Scenes', 'GameScene.js'),
  tienda:  path.join(BIN, 'Scenes', 'tiendajuego.js'),
  html:    path.join(BIN, 'index.html'),
  css:     path.join(BIN, 'styless.css')
};

for (const [k, v] of Object.entries(F)) {
  if (!hay(v)) { console.error('No encuentro ' + v); process.exit(2); }
}

const SRC = {};
for (const [k, v] of Object.entries(F)) SRC[k] = leer(v);

const servidor = hay(SERVIDOR) ? leer(SERVIDOR) : null;

console.log('=== LO SOCIAL: AMISTADES, CHAT Y COLOR DEL NOMBRE ===\n');
if (!servidor) {
  console.log('(no encuentro ' + SERVIDOR + ' — se saltan las comprobaciones del backend)\n');
}

// ── Utilidades de extracción ─────────────────────────────────────────────────

/**
 * Todos los nombres de evento que un texto EMITE.
 *
 * Dos formas, y las dos hacen falta:
 *
 *   socket.emit('friends:state', ...)          la de siempre
 *   avisarAJugador(nombre, 'friends:dm', ...)  la del backend
 *
 * La segunda es un ayudante del servidor que manda el evento a TODAS las
 * pestañas de una cuenta (ver server2.js). Como dentro hace `s.emit(evento)`
 * con una variable, buscar solo `.emit('...')` no lo ve: los siete eventos que
 * salen por ahí —los privados, las solicitudes, la presencia— parecerían no
 * emitirse nunca y esta prueba daría siete fallos falsos. Que es peor que no
 * tener prueba: una que miente se acaba ignorando.
 */
function emitidos(texto) {
  const fuera = new Set();
  const re = /\.emit\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(texto))) fuera.add(m[1]);
  const reAyudante = /avisarAJugador\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;
  while ((m = reAyudante.exec(texto))) fuera.add(m[1]);
  return fuera;
}

/** Todos los nombres de evento de `algo.on('nombre'` en un texto. */
function escuchados(texto) {
  const fuera = new Set();
  const re = /\.on\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(texto))) fuera.add(m[1]);
  return fuera;
}

/** Solo los eventos de lo social: el resto del juego no es asunto de esta prueba. */
const MIOS = /^(friends:|chat(React|Command|Reaction)|player:(pet)?[Nn]ameColor|player(Pet)?NameColor)/;
const soloMios = (conjunto) => [...conjunto].filter(e => MIOS.test(e)).sort();

const clienteEmite   = new Set();
const clienteEscucha = new Set();
[SRC.amigos, SRC.chat, SRC.color].forEach(t => {
  emitidos(t).forEach(e => clienteEmite.add(e));
  escuchados(t).forEach(e => clienteEscucha.add(e));
});
// Las escenas también escuchan (playerNameColor va en su tabla de listeners).
[SRC.mapa, SRC.tienda].forEach(t => {
  const re = /event:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(t))) clienteEscucha.add(m[1]);
});

// ── 1 y 2. El contrato de eventos ────────────────────────────────────────────
console.log('1) Todo lo que el cliente MANDA lo escucha el servidor');
if (!servidor) {
  saltar('sin server2.js no se puede comprobar');
} else {
  const servidorEscucha = escuchados(servidor);
  const servidorEmite   = emitidos(servidor);

  const huerfanos = soloMios(clienteEmite).filter(e => !servidorEscucha.has(e));
  ok(huerfanos.length === 0,
     soloMios(clienteEmite).length + ' eventos emitidos por el cliente tienen oyente',
     huerfanos.join(', '));

  console.log('\n2) Todo lo que el cliente ESPERA lo manda el servidor');
  const nadieLosManda = soloMios(clienteEscucha).filter(e => !servidorEmite.has(e));
  ok(nadieLosManda.length === 0,
     soloMios(clienteEscucha).length + ' eventos escuchados por el cliente los emite alguien',
     nadieLosManda.join(', '));

  // Al revés también interesa, pero como AVISO: un evento que el servidor manda
  // y nadie escucha no rompe nada, solo es trabajo tirado.
  const sinPublico = soloMios(servidorEmite).filter(e => !clienteEscucha.has(e));
  if (sinPublico.length) {
    console.log('        (aviso: el servidor emite y nadie escucha: ' + sinPublico.join(', ') + ')');
  }
}

// ── 3. Los emojis de reacción ────────────────────────────────────────────────
console.log('\n3) Los emojis de reacción son los mismos en los dos lados');
{
  const mCliente = /var\s+EMOJIS\s*=\s*\[([^\]]+)\]/.exec(SRC.chat);
  ok(!!mCliente, 'el cliente declara su lista de emojis');
  if (mCliente && servidor) {
    const listaCliente = mCliente[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
    const mServidor = /REACCIONES_VALIDAS\s*=\s*\[([^\]]+)\]/.exec(servidor);
    ok(!!mServidor, 'el servidor declara su lista de emojis');
    if (mServidor) {
      // El servidor los escribe con escapes \u{...}: se resuelven para comparar.
      const listaServidor = mServidor[1].match(/'([^']*)'/g)
        .map(s => s.slice(1, -1))
        .map(s => s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
                   .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
      ok(listaCliente.length === listaServidor.length &&
         listaCliente.every((e, i) => e === listaServidor[i]),
         'las dos listas coinciden (' + listaCliente.length + ' emojis)',
         'cliente: ' + listaCliente.join(' ') + '\n             servidor: ' + listaServidor.join(' '));
    }
  } else if (!servidor) {
    saltar('sin server2.js no se puede comparar');
  }
}

// ── 4. El comando /add_friend ────────────────────────────────────────────────
console.log('\n4) /add_friend se entiende igual en el cliente y en el servidor');
{
  // Las dos expresiones, sacadas de su fichero: si alguien toca una y no la
  // otra, esto lo canta.
  const reCliente = /\/\^\\\/add_\?friend\\s\+\(\.\+\)\$\/i/.test(SRC.chat);
  ok(reCliente, 'el cliente usa /^\\/add_?friend\\s+(.+)$/i');

  if (servidor) {
    const reServidor = /\/\^\\\/add_\?friend\\s\+\(\.\+\)\$\/i/.test(servidor);
    ok(reServidor, 'el servidor usa la misma expresión');
  } else saltar('sin server2.js no se puede comparar');

  // Y el comportamiento, con casos de verdad.
  const patron = /^\/add_?friend\s+(.+)$/i;
  const quitarComillas = (s) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '');
  const casos = [
    ['/add_friend "Ana"',   'Ana'],
    ['/add_friend Ana',     'Ana'],
    ['/addfriend Ana',      'Ana'],
    ['/ADD_FRIEND  Beto ',  'Beto'],
    ['/add_friend “Lia”', 'Lia'],   // comillas del teclado del móvil
    ['hola 1/2 taza',       null],            // NO es un comando
    ['/add_friend',         null]             // sin nombre: no casa
  ];
  let malos = [];
  casos.forEach(([entrada, esperado]) => {
    const m = patron.exec(entrada);
    const salida = m ? quitarComillas(m[1]) : null;
    if (salida !== esperado) malos.push(entrada + ' -> ' + salida + ' (tocaba ' + esperado + ')');
  });
  ok(malos.length === 0, 'los ' + casos.length + ' casos se interpretan bien', malos.join('; '));

  // Y que el cliente NO se trague todo lo que empiece por barra: una fracción
  // escrita en el chat tiene que seguir saliendo.
  ok(/Cualquier otra cosa que empiece por "\/" se manda tal cual/.test(SRC.chat),
     'un texto con barra que no sea comando se sigue enviando');
}

// ── 5. El color del nombre ───────────────────────────────────────────────────
console.log('\n5) El color del nombre se valida SIEMPRE antes de pintarlo');
{
  const patron = /^#[0-9a-fA-F]{6}$/;
  const buenos = ['#ffffff', '#FF6B6B', '#000000'];
  const malos  = ['red', '#fff', '#12345', 'javascript:alert(1)', '#ffffff;color:red',
                  '', null, undefined, '#gggggg'];
  ok(buenos.every(c => patron.test(c)), 'acepta los colores válidos');
  ok(malos.every(c => !patron.test(String(c))), 'rechaza todo lo demás',
     malos.filter(c => patron.test(String(c))).join(', '));

  // Y que nadie pinte sin comprobar. Se busca `setColor(` con algo que venga de
  // fuera y sin `valido(` cerca.
  [['GameScene', SRC.mapa], ['tiendajuego', SRC.tienda]].forEach(([nombre, txt]) => {
    const lineas = txt.split('\n');
    const sospechosas = [];
    lineas.forEach((l, i) => {
      if (!/setColor\(/.test(l)) return;
      if (!/nameColor/.test(l) && !/nameColor/.test(lineas[i - 1] || '') &&
          !/nameColor/.test(lineas[i - 2] || '')) return;
      const ventana = lineas.slice(Math.max(0, i - 4), i + 2).join('\n');
      if (!/valido\(|POR_DEFECTO|GFNombreColor/.test(ventana)) sospechosas.push(i + 1);
    });
    ok(sospechosas.length === 0,
       nombre + ': ningún color de otro jugador se pinta sin validar',
       'líneas ' + sospechosas.join(', '));
  });

  if (servidor) {
    /* Los DOS colores (personaje y mascota) se validan en el mismo bucle: son
       el mismo tipo de dato y el mismo riesgo, así que un solo sitio. */
    ok(/for \(const campoColor of \['nameColor', 'petNameColor'\]\)/.test(servidor),
       '/api/save valida los dos colores antes de guardarlos');
    ok(/socket\.on\('player:nameColor'/.test(servidor),
       'existe el evento player:nameColor para cambiarlo en caliente');
    ok(/socket\.on\('player:petNameColor'/.test(servidor),
       'y player:petNameColor para el de la mascota');
  } else saltar('sin server2.js no se puede comprobar el guardado');
}

// ── 6. Las sombras de las nubes ──────────────────────────────────────────────
console.log('\n6) Las sombras de las nubes van en el MUNDO, no en la cámara');
{
  const corte = SRC.clima.indexOf('function texturaNube');
  const fin = SRC.clima.indexOf('function texturaResplandor');
  ok(corte > 0 && fin > corte, 'el bloque del nublado está en gf-clima.js');
  const bloque = SRC.clima.slice(corte, fin);

  /* LA COMPROBACIÓN QUE IMPORTA. Lo que se pidió fue exactamente "que se vean
     las sombras moverse en el mundo y NO ancladas a la cámara". Un
     setScrollFactor(0) aquí lo rompería y no daría ningún error: la mancha se
     quedaría quieta sobre la pantalla y parecería suciedad en el monitor. */
  ok(!/setScrollFactor/.test(bloque),
     'ninguna nube lleva setScrollFactor (eso la pegaría a la pantalla)');
  ok(!/st\.capa\.add\(\s*nube/.test(SRC.clima) && !/capa\.add\(n\.spr/.test(SRC.clima),
     'las nubes NO entran en el contenedor de pantalla (st.capa)');
  ok(/n\.spr\.setPosition\(n\.x, n\.y\)/.test(bloque),
     'la nube se coloca en coordenadas de mundo');

  const prof = /var PROF_NUBE\s*=\s*(\d+)/.exec(SRC.clima);
  ok(!!prof, 'la profundidad de las nubes está declarada');
  if (prof) {
    const n = Number(prof[1]);
    // Por encima de las sombras del escenario (gf-sombras: 6000) y de los
    // sprites del mundo (el mapa más alto son 5008 px de y-sort), y por debajo
    // del filtro de la estación (8030) y de la lluvia (8100).
    ok(n > 6000 && n < 8030,
       'PROF_NUBE=' + n + ' cae entre las sombras del escenario y el filtro del clima');
  }

  ok(/MULTIPLICAR/.test(bloque),
     'la sombra MULTIPLICA en vez de superponer negro');
  ok(/scene\.textures\.createCanvas/.test(bloque),
     'la mancha es una textura de lienzo (las figuras de Phaser ignoran la mezcla)');

  if (servidor) {
    ok(/nublado:\s*\{ type: Boolean/.test(servidor), 'el backend guarda `nublado`');
    ok(/nublado: encendido && !!d\.nublado/.test(servidor), 'y se lo manda al juego');
    ok(/'nublado'/.test(servidor) && /CLIMA_QUE = \[[^\]]*'nublado'/.test(servidor),
       'y se puede programar desde el panel de climas');
  } else saltar('sin server2.js no se puede comprobar el clima del backend');

  const climas = path.join(BIN, 'climas.html');
  if (hay(climas)) {
    const c = leer(climas);
    ok(/id="nublado"/.test(c) && /data-que="nublado"/.test(c),
       'climas.html tiene el interruptor y el botón de nublado');
  }
}

// ── 7. Las dos escenas montan lo mismo ───────────────────────────────────────
console.log('\n7) El mapa y la tienda montan los TRES módulos');
{
  [['GameScene', SRC.mapa], ['tiendajuego', SRC.tienda]].forEach(([nombre, txt]) => {
    ['GFAmigos', 'GFChatSocial', 'GFNombreColor'].forEach(mod => {
      ok(new RegExp('window\\.' + mod + '\\.montar\\(this\\)').test(txt),
         nombre + ' monta ' + mod);
    });
    ok(/GFChatSocial\.decorar\(this, msg, line, strong, textSpan\)/.test(txt),
       nombre + ': el chat pinta reacciones y el botón de editar');
    ok(/GFChatSocial\.comando\(this, text\)/.test(txt),
       nombre + ': el chat interpreta /add_friend antes de enviarlo');
    ok(/shadowContainer\.setDepth\(playerInfo\.y \+ sprite\.displayHeight \* 0\.5 - 1\)/.test(txt),
       nombre + ': los jugadores remotos llevan sombra bajo los pies');
  });
}

// ── 7b. El aviso del botón del chat ─────────────────────────────────────────
console.log('\n7b) El botón del chat titila con un mensaje nuevo');
{
  /* Se busca el enganche, sea con `s.on` o con el ayudante `poner` que apunta
     lo enganchado para poder soltarlo cuando el socket se sustituye. */
  ok(/(poner|s\.on)\('chatMessage',\s*function \(m\) \{\s*avisarDeMensaje\(s, m\);/.test(SRC.chat),
     'el aviso escucha `chatMessage` (el mensaje en vivo)');
  ok(/oyentesPuestos/.test(SRC.chat) && /oyentesPuestos/.test(SRC.amigos),
     'y los oyentes del socket viejo se sueltan al cambiar de socket');

  /* Y NO `chatHistory`. Entrar en una escena trae las últimas 50 líneas de
     golpe: si el aviso las contara, el botón titilaría siempre al entrar, por
     conversaciones de hace media hora. */
  // Se busca el OYENTE, no la palabra: `chatHistory` sale en el comentario que
  // explica precisamente por qué no se escucha, y una prueba que se dispara con
  // su propia explicación no vale para nada.
  ok(!/\.on\(\s*['"]chatHistory['"]/.test(SRC.chat),
     'y NO el historial, que se recibe entero al entrar en cada escena');

  ok(/if \(m\.id && s && s\.id && m\.id === s\.id\) return;/.test(SRC.chat),
     'el mensaje propio no lo enciende');
  ok(/if \(chatAbierto\(\)\) return;/.test(SRC.chat),
     'con el chat abierto tampoco');
  ok(/MutationObserver/.test(SRC.chat) &&
     /attributeFilter: \['class', 'style'\]/.test(SRC.chat),
     'se apaga vigilando la clase del panel, no el clic del botón');

  /* EL ORDEN EN EL CSS IMPORTA. `.chat-open-btn` está redefinido tres veces en
     styless.css y la última gana con `animation: … !important`. La regla del
     aviso tiene que llegar DESPUÉS o el botón seguiría respirando tranquilo. */
  const iAviso  = SRC.css.indexOf('.chat-open-btn.gfcs-titila');
  const iUltima = SRC.css.lastIndexOf('animation: chat-breath-blue');
  ok(iAviso > 0, 'la regla del aviso está en styless.css');
  ok(iAviso > iUltima,
     'y va DESPUÉS de la última que fija `chat-breath-blue !important`');
  ok(/animation: gfcs-chat-titila [\d.]+s ease-in-out infinite !important/.test(SRC.css),
     'con !important, que es lo único que gana a la de abajo');
  ok(/@keyframes gfcs-chat-titila/.test(SRC.css), 'y los fotogramas existen');

  /* NO se puede animar `transform`: el botón lleva
     `transform: translateY(--gf-teclado) !important` para apartarse del teclado
     del móvil, y una declaración !important gana a una animación. */
  const bloque = SRC.css.slice(SRC.css.indexOf('@keyframes gfcs-chat-titila'),
                               SRC.css.indexOf('@keyframes gfcs-chat-titila') + 700);
  ok(!/transform:/.test(bloque),
     'los fotogramas no tocan `transform` (lo manda un !important del teclado)');

  ok(/prefers-reduced-motion: reduce/.test(SRC.css.slice(iAviso)),
     'y quien pide menos movimiento ve el botón encendido en vez de parpadeando');
}

// ── 7c. Fugas: lo que crece sin fin ─────────────────────────────────────────
console.log('\n7c) Nada crece sin techo');
{
  /* EL CHAT NO SE PODABA. `chatMessages.appendChild` no quitaba nunca nada: una
     partida larga deja miles de renglones en el DOM, y ahora cada uno lleva
     además dos botones con manejadores. Un DOM de miles de nodos es justo lo
     que produce los tirones al pintar y al desplazar. */
  ok(/var TOPE_RENGLONES = \d+;/.test(SRC.chat), 'el chat tiene tope de renglones');
  ok(/function podarChat\(/.test(SRC.chat) && /caja\.removeChild\(viejo\)/.test(SRC.chat),
     'y una poda que los quita de verdad del DOM');
  ok(/pintados\.delete\(mid\)/.test(SRC.chat),
     'y suelta también su entrada del registro de mensajes');
  ok(/var TOPE_REGISTRO = \d+;/.test(SRC.chat), 'el registro de mensajes tiene tope');

  /* Los oyentes del socket viejo. Una reconexión sustituye
     `window.globalSocket`; sin soltarlos, el socket muerto no se puede recoger
     y se acumula uno por reconexión. */
  ['chat', 'amigos'].forEach(function (cual) {
    ok(/oyentesPuestos/.test(SRC[cual]) && /\.off\(par\[0\], par\[1\]\)/.test(SRC[cual]),
       'gf-' + (cual === 'chat' ? 'chat-social' : 'amigos') + ': suelta los oyentes del socket anterior');
  });

  ok(/__gfncMirando/.test(SRC.color),
     'el vigilante del color no se multiplica por escena');

  /* Y la limpieza de jugadores remotos, en UN solo sitio. Tenerla escrita dos
     veces fue lo que dejó los nombres de mascota flotando por el mapa. */
  [['GameScene', SRC.mapa], ['tiendajuego', SRC.tienda]].forEach(function (par) {
    const txt = par[1];
    ok(/_soltarJugadorRemoto\(p\) \{/.test(txt),
       par[0] + ': existe _soltarJugadorRemoto, la única lista de cosas que soltar');
    const usos = (txt.match(/_soltarJugadorRemoto\(/g) || []).length;
    ok(usos >= 4, par[0] + ': la usan todos los caminos de limpieza (' + usos + ' usos)');
    ok(/fuera\(p\.dog\.nameText\)/.test(txt),
       par[0] + ': suelta el nombre de la mascota (era el que se quedaba clavado)');
  });
}

// ── 7d. Seguridad de los privados ───────────────────────────────────────────
console.log('\n7d) El chat privado no se puede usar para colarse');
{
  if (!servidor) {
    saltar('sin server2.js no se pueden comprobar las reglas del backend');
  } else {
    /* 1. QUIÉN ERES LO DICE EL JWT, NUNCA EL MENSAJE. Si un solo manejador
          sacara el nombre del cuerpo, cualquiera podría leer, editar o vaciar
          la conversación de otro sin más que escribir su nombre. */
    const manejadores = ['friends:dm', 'friends:dm:history', 'friends:dm:react',
                         'friends:dm:edit', 'friends:dm:clear', 'friends:dm:limpieza',
                         'friends:inbox'];
    const sinIdentidad = manejadores.filter(ev => {
      const i = servidor.indexOf("socket.on('" + ev + "'");
      if (i < 0) return true;
      const cuerpo = servidor.slice(i, i + 900);
      return !/const yo = await cuentaDelSocket\(socket\)/.test(cuerpo);
    });
    ok(sinIdentidad.length === 0,
       'los ' + manejadores.length + ' manejadores sacan la identidad del socket, no del mensaje',
       sinIdentidad.join(', '));

    /* 2. NO SE PUEDE TOCAR UN MENSAJE AJENO. */
    ok(/if \(!m \|\| !mioOSuyo\(m, yo\)\) return;/.test(servidor),
       'reaccionar exige que el privado sea de tu conversación');
    ok(/if \(m\.de !== yo\)\s+return socket\.emit\('friends:dm:editError'/.test(servidor),
       'editar exige ser el autor');
    ok(/const filtro = \{ \$or: \[\{ de: yo, para: otro \}, \{ de: otro, para: yo \}\] \};/.test(servidor),
       'vaciar solo alcanza a TU conversación con esa persona');

    /* 3. UN ID QUE NO ES UN ID NO LLEGA A LA BASE DE DATOS. `findById` con
          basura lanza CastError; con el id viniendo del cliente, eso es un
          grifo de errores abierto. */
    ok(/function privadoPorId/.test(servidor) &&
       /\^\[0-9a-fA-F\]\{24\}\$/.test(servidor),
       'el id de un privado se valida antes de consultar');

    /* 4. EL TEXTO SE ESCAPA AL GUARDARLO, las dos veces que se guarda. */
    const escapes = (servidor.match(/const texto = escapeHtml\(recortado\);/g) || []).length;
    ok(escapes >= 2, 'el texto se escapa al enviarlo Y al editarlo (' + escapes + ' sitios)');
    ok(/\[\.\.\.crudo\]\.slice\(0, DM_LARGO_MAX\)/.test(servidor),
       'y se recorta por puntos de código, sin partir un emoji por la mitad');

    /* 5. LAS REACCIONES SON UNA LISTA CERRADA. Con emoji libre, el campo se
          convierte en un segundo chat sin freno pegado a cada mensaje. */
    ok(/function reaccionValida\(e\) \{ return REACCIONES_VALIDAS/.test(servidor),
       'las reacciones se validan contra la lista cerrada');

    /* 6. HACE FALTA UNA RELACIÓN PARA ESCRIBIR. Sin esto, la bandeja de
          cualquiera queda abierta a todo el mundo — y lo que entra se guarda. */
    ok(/const hayRelacion = enLista\(mio\.amigos, otro\) \|\|/.test(servidor),
       'solo se escribe a amigos o a quien tenga una solicitud contigo');

    /* 7. FRENOS. */
    ['dm', 'dmreact', 'dmedit', 'dmclear'].forEach(f => {
      ok(new RegExp("frenado\\(socket, '" + f + "'").test(servidor),
         'freno antispam en ' + f);
    });

    /* 8. LA DIRECCIÓN DE LA CARTERA NO SALE. Entró en la ficha para poder
          buscar la presencia por varias llaves; que se cuele al cliente sería
          repartir la cartera de todos los jugadores. */
    const fugas = [];
    ['friends:online', 'friends:search'].forEach(ev => {
      const i = servidor.indexOf("socket.on('" + ev + "'");
      const cuerpo = servidor.slice(i, i + 2200);
      if (!/const \{ address, \.\.\.publica \} = f;/.test(cuerpo) &&
          !/NO se copia/.test(cuerpo)) fugas.push(ev);
    });
    ok(fugas.length === 0, 'la dirección de la cartera no viaja al cliente', fugas.join(', '));

    /* 8b. LO QUE SE ESCRIBE EN LA BUSCA ACABA EN UNA EXPRESIÓN REGULAR DE
           MONGO. Sin limpiar, `.*.*.*.*x` es una consulta que se come el
           servidor, y un `$` bien puesto cambia lo que se busca. Se recorta a
           letras y dígitos, se limita a 15 y además se escapan los comodines. */
    ok(servidor.includes("{Nd}]/gu, '')") &&
       servidor.includes(".slice(0, 15)"),
       'la búsqueda solo deja pasar letras y dígitos');
    ok(servidor.includes("const esc = limpio.replace(") &&
       servidor.includes("$regex: '^' + esc"),
       'y lo que quede se escapa antes de ir a la expresión regular');
    ok(/const \{ address, \.\.\.publica \} = f;/.test(servidor),
       'y la lista de amigos tampoco la lleva');
  }

  /* 9. EN EL CLIENTE, NADA DE HTML. Todo lo que escribe otro jugador se pinta
        con textContent; un innerHTML aquí reabriría el agujero que cierra el
        escapado del servidor. */
  ['amigos', 'chat'].forEach(cual => {
    const txt = SRC[cual].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(!/\.innerHTML\s*=/.test(txt) && !/insertAdjacentHTML/.test(txt),
       'gf-' + (cual === 'chat' ? 'chat-social' : 'amigos') + ': no usa innerHTML con datos de nadie');
  });
  ok(/function colorSeguro/.test(SRC.amigos) && /function colorSeguro/.test(SRC.chat),
     'el color que manda otro jugador se valida antes de pintarlo');
}

// ── 7e. El privado que entra no repinta la conversación entera ───────────
console.log('\n7e) Un mensaje nuevo cuesta un mensaje, no la conversación entera');
{
  /* POR QUÉ SE VIGILA. `pintarConversacion` vacía la lista y la reconstruye
     entera, con sus dos botones y sus manejadores por burbuja. Medido en el
     banco: 3.8 ms por mensaje con 22 burbujas y 28.3 ms con 122 — el coste
     sube con lo que llevas hablado, y al tope de 200 son unos 46 ms, tres
     cuadros perdidos por cada mensaje. Es exactamente la clase de tirón que
     nadie asocia con el chat.

     Volver a poner `pintarConversacion()` en cualquiera de estos cuatro sitios
     lo trae de vuelta sin dar ningún error, así que se comprueba aquí. */
  const A = SRC.amigos;

  ok(/function burbujaDe\(m\)/.test(A) && /function anadirBurbuja\(m\)/.test(A),
     'la burbuja de un mensaje se construye suelta (burbujaDe + anadirBurbuja)');

  const trozo = (marca, largo) => {
    const i = A.indexOf(marca);
    return i < 0 ? '' : A.slice(i, i + largo);
  };

  const entrante = trozo("poner('friends:dm', function (m)", 700);
  ok(/anadirBurbuja\(m\);/.test(entrante) && !/pintarConversacion\(\)/.test(entrante),
     'un privado que entra añade UNA burbuja');

  const reaccion = trozo("poner('friends:dm:reaccion'", 700);
  ok(/pintarReaccionesDM\(mr, mr\._nodo\)/.test(reaccion) && !/pintarConversacion\(\)/.test(reaccion),
     'una reacción repinta solo su burbuja');

  const editado = trozo("poner('friends:dm:editado'", 900);
  ok(/me2\._txt\.textContent = desescapar\(d\.texto\)/.test(editado),
     'una edición cambia solo el texto de su burbuja');

  /* EL TOPE. Sin él, dejar la conversación abierta la deja crecer sin fin: ni
     el array ni el DOM sueltan nunca nada. 200 es lo que guarda el servidor
     (DM_GUARDADOS_MAX), o sea lo más que se puede llegar a ver. */
  ok(/var TOPE_CONVERSACION = 200;/.test(A), 'la conversación abierta tiene tope');
  ok(/\.forEach\(soltarBurbuja\);/.test(A),
     'y lo que sale de la lista sale también del DOM');
  ok(/function soltarBurbuja\(m\)/.test(A) && /m\._reacs = null;/.test(A),
     'soltando además su fila de reacciones');

  /* MARCAR LEÍDO REAPROVECHA `friends:dm:history`, que es una consulta de hasta
     200 documentos. Pedirla por cada mensaje que entra son cientos de consultas
     idénticas en una conversación viva. */
  ok(/var LEIDO_FRENO_MS = 3000;/.test(A) && /function marcarLeido/.test(A),
     'marcar leído lleva freno (no una consulta por mensaje)');
}

// ── 8. El botón redondo ──────────────────────────────────────────────────────
console.log('\n8) El botón de Friends está puesto sin descolocar a los demás');
{
  const c = SRC.html;
  ok(/id="friends-btn"/.test(c), 'el botón existe en index.html');
  ok(/amistades\.png/.test(c), 'y usa su icono');
  ok(hay(path.join(BIN, 'Game', 'Source', 'amistades.png')),
     'el icono existe en el disco');

  /* EL ORDEN IMPORTA MÁS DE LO QUE PARECE. tiendajuego.js engancha varios de
     estos botones por su POSICIÓN en la NodeList (roundButtons[3] son las
     transacciones, el [6] es la tienda). Si el botón nuevo se metiera en medio
     del HTML, todos esos índices se correrían y los botones de la tienda
     pasarían a hacer lo del de al lado — sin ningún error por medio. */
  const cont = /<div class="round-buttons"[\s\S]*?<\/div>/.exec(c);
  ok(!!cont, 'se encuentra el contenedor de botones redondos');
  if (cont) {
    const botones = cont[0].match(/<button[^>]*class="round-btn/g) || [];
    const posFriends = cont[0].indexOf('id="friends-btn"');
    const posStore   = cont[0].indexOf('id="store-btn"');
    ok(posFriends > posStore,
       'en el HTML va el ÚLTIMO (no corre los índices que usa la tienda)');
  }
  ok(/#game-hud \.round-buttons #friends-btn\s*\{\s*order:\s*3/.test(SRC.css),
     'y el CSS lo coloca el TERCERO, debajo de Mail');

  // Y que la tienda siga apuntando a los mismos índices de siempre.
  ok(/roundButtons\[6\]\?\.addEventListener\('click', this\.onRoundBtnStore\)/.test(SRC.tienda),
     'tiendajuego sigue usando roundButtons[6] para la tienda');
}

// ── 9. La venta en la tienda ─────────────────────────────────────────────────
console.log('\n9) La venta en la tienda llega al servidor');
{
  ok(/inventoryLoadedAt: this\._inventoryLoadedAt \|\| null/.test(SRC.tienda),
     'tiendajuego manda inventoryLoadedAt (sin eso el servidor descarta el inventario)');
  ok(/this\._inventoryLoadedAt = new Date\(\)\.toISOString\(\)/.test(SRC.tienda),
     'y lo apunta al cargar');
  ok(/if \(resData && resData\.inventoryStale\)/.test(SRC.tienda),
     'y hace caso cuando el servidor dice que su copia manda');
  ok(/if \(this\._inventarioCargado !== true\)/.test(SRC.tienda),
     'no guarda antes de haber cargado (evita escribir un inventario vacío)');

  [['GameScene', SRC.mapa], ['tiendajuego', SRC.tienda]].forEach(([nombre, txt]) => {
    ok(/this\._inventarioCargado = false;/.test(txt),
       nombre + ': el cerrojo se REARMA al volver a entrar (la escena se reutiliza)');
  });

  const ts = path.join(BIN, 'tienda_sistema.js');
  if (hay(ts)) {
    const t = leer(ts);
    ok(/const guardado = await this\.savegg\(\);/.test(t) && /if \(guardado === false\)/.test(t),
       'la tienda mira lo que devuelve savegg, no solo si explota');
  }
}

// ── 10. Los minerales en piedra ──────────────────────────────────────────────
console.log('\n10) Los minerales en piedra');
{
  const dir = path.join(BIN, 'Game', 'newpro', 'recursos');
  ['piedra_hierro.png', 'piedra_cobre.png', 'piedra_carbon.png'].forEach(f => {
    ok(hay(path.join(dir, f)), f + ' existe');
  });
  ok(hay(path.join(BIN, 'tools', 'generar-minerales.py')),
     'el generador está guardado (se pueden volver a hacer igual)');
}

console.log('\n' + '='.repeat(62));
console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos +
            (saltadas ? '   Saltadas: ' + saltadas : ''));
if (fallos) { console.log('\nHay fallos en lo social.'); process.exit(1); }
console.log('Sin fallos.');
