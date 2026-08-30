/* ===========================================================================
 * MASCOTA: VIDA, MODO Y MENÚ
 *
 * QUÉ HACE
 *   · Pinta una barra de vida encima del perro.
 *   · Doble clic (o dos toques en el móvil) sobre el perro abre su menú, donde
 *     se elige entre modo PASSIVE y modo ATTACK.
 *   · Si la mascota muere, el menú ofrece revivirla con el elixir del
 *     alquimista.
 *
 * QUÉ DECIDE EL MODO
 *   passive → la mascota no pelea. Los animales agresivos (zorros, cocodrilos,
 *             serpientes) van a por el JUGADOR.
 *   attack  → la mascota pelea. Los animales van a por ELLA, y solo cuando la
 *             tumban se fijan en el jugador.
 *   De eso se encarga gf-combate.js; este módulo solo guarda el estado.
 *
 * NADA DE ESTO SE DECIDE EN EL NAVEGADOR
 *   La vida, el modo y si está viva viven en el SERVIDOR (/api/pet/*). Si el
 *   modo lo mandara el cliente, bastaría con dejarlo en 'attack' para que los
 *   animales no tocaran nunca al personaje; y si la vida fuera local, entrar
 *   siempre al 100% a las batallas PvP sería trivial.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFMascota && window.GFMascota.montar(this);
 *
 * API
 *   GFMascota.montar(scene) / desmontar(scene)
 *   GFMascota.estado()            { health, maxHealth, mode, alive, ghost… }
 *   GFMascota.modo()              'passive' | 'attack'
 *   GFMascota.viva()
 *   GFMascota.golpear(n)          apunta daño (se agrupa y se manda)
 *   GFMascota.sincronizar(motivo)
 *   GFMascota.alCambiar(fn)       aviso cuando cambia el estado
 *   GFMascota.abrirMenu(scene)
 * ======================================================================== */
(function () {
  'use strict';

  var SYNC_MS       = 60 * 1000;   // refresco periódico
  var ENVIO_DANO_MS = 750;         // cada cuánto se manda el daño acumulado
  var DOBLE_CLIC_MS = 420;         // ventana para el segundo clic/toque

  var estado = {
    health: 100, maxHealth: 100, mode: 'passive', alive: true,
    ghost: false, deaths: 0, reviveCost: 30, windowEndsAt: null,
    cargado: false
  };
  var oyentes = [];
  var danoPendiente = 0;
  var timerDano = null;
  var timerSync = null;
  var ultimaSync = 0;
  var pidiendo = null;

  function log() {
    if (!window.GF_MASCOTA_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[mascota]');
    console.log.apply(console, a);
  }

  // ------------------------------------------------------------------- red
  /**
   * Dónde está el backend.
   *
   * EL FALLO QUE ARREGLA: en local el juego usa `http://127.0.0.1:8080`
   * (GameScene se lo asigna a `this.serverBase`), pero aquí se caía al valor
   * por defecto 3001 porque `window.serverBase` no lo pone nadie. En producción
   * daba igual —las dos ramas acaban en api.grasslandforest.com— pero en
   * desarrollo las peticiones de la mascota iban a un puerto donde no hay nada.
   * Se salió a la luz al probarlo en el navegador.
   *
   * Ahora se mira primero la escena viva, que es quien lo sabe de verdad.
   */
  function base() {
    var esc = escenaDelJuego();
    if (esc && typeof esc.serverBase === 'string') return esc.serverBase;
    if (typeof window.serverBase === 'string')  return window.serverBase;
    if (typeof window.GF_API_BASE === 'string') return window.GF_API_BASE;
    var h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://127.0.0.1:8080';
    return 'https://api.grasslandforest.com';
  }

  /** Cualquier escena viva del juego que tenga serverBase. */
  function escenaDelJuego() {
    var g = window.game || (window.phaserScaler && window.phaserScaler.game);
    if (!g || !g.scene || !g.scene.getScenes) return null;
    try {
      var ss = g.scene.getScenes(true) || [];
      for (var i = 0; i < ss.length; i++) {
        if (ss[i] && typeof ss[i].serverBase === 'string') return ss[i];
      }
    } catch (e) {}
    return null;
  }

  function cookie(nombre) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function api(ruta, cuerpo) {
    var opts = { credentials: 'include', mode: 'cors' };
    if (cuerpo !== undefined) {
      var csrf = cookie('csrf-token');
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      if (csrf) opts.headers['X-CSRF-Token'] = csrf;
      opts.body = JSON.stringify(cuerpo || {});
    }
    return fetch(base().replace(/\/$/, '') + ruta, opts).then(function (r) {
      return r.json().then(function (d) {
        return { ok: r.ok, status: r.status, datos: d };
      }).catch(function () {
        return { ok: r.ok, status: r.status, datos: null };
      });
    });
  }

  function aplicar(d) {
    if (!d || !d.pet) return false;
    estado.health     = Math.max(0, Math.min(100, Number(d.pet.health) || 0));
    estado.maxHealth  = Number(d.pet.maxHealth) || 100;
    estado.mode       = d.pet.mode === 'attack' ? 'attack' : 'passive';
    estado.alive      = !!d.pet.alive;
    // Y se apunta ya, sin esperar a que cambie la visibilidad: si entras a la
    // tienda nada mas cargar, el dato tiene que estar puesto.
    try {
      if (!window.globalPetData) window.globalPetData = {};
      window.globalPetData.alive = estado.alive;
    } catch (e) {}
    if (d.player) {
      estado.ghost        = !!d.player.ghost;
      estado.deaths       = Number(d.player.deaths) || 0;
      estado.reviveCost   = Number(d.player.reviveCost) || 30;
      estado.windowEndsAt = d.player.windowEndsAt || null;
    }
    estado.cargado = true;
    avisar();
    return true;
  }

  function avisar() {
    for (var i = 0; i < oyentes.length; i++) {
      try { oyentes[i](estado); } catch (e) { /* un oyente roto no rompe el resto */ }
    }
  }

  function sincronizar(motivo) {
    if (pidiendo) return pidiendo;
    pidiendo = api('/api/pet/state').then(function (r) {
      pidiendo = null;
      if (r.ok && aplicar(r.datos)) {
        ultimaSync = Date.now();
        log('sincronizado (' + (motivo || 'periódico') + ')',
            estado.health + '%', estado.mode, estado.alive ? '' : 'MUERTA');
        return estado;
      }
      return null;
    }).catch(function (e) {
      pidiendo = null;
      log('no se pudo sincronizar:', e && e.message);
      return null;
    });
    return pidiendo;
  }

  function sincronizarSiHaceFalta(motivo) {
    if (!estado.cargado) return sincronizar(motivo);
    if (Date.now() - ultimaSync >= SYNC_MS) return sincronizar(motivo);
    return Promise.resolve(estado);
  }

  // --------------------------------------------------------------- el daño
  /* El daño se ACUMULA y se manda cada 750 ms en vez de una petición por
     mordisco: un cocodrilo muerde varias veces por segundo y no tiene sentido
     abrir una conexión por cada dentellada. El servidor además tiene su propio
     ritmo mínimo, así que mandar más no serviría de nada. */
  function golpear(n) {
    if (!estado.alive) return;
    danoPendiente += Math.max(1, Math.round(Number(n) || 1));
    // Se pinta ya el descuento para que la barra responda al instante; el
    // servidor manda la última palabra en la respuesta.
    estado.health = Math.max(0, estado.health - Math.max(1, Math.round(Number(n) || 1)));
    if (estado.health === 0) estado.alive = false;
    avisar();
    if (timerDano) return;
    timerDano = setTimeout(enviarDano, ENVIO_DANO_MS);
  }

  function enviarDano() {
    timerDano = null;
    var cant = danoPendiente;
    danoPendiente = 0;
    if (cant <= 0) return;
    api('/api/pet/damage', { amount: cant }).then(function (r) {
      if (r.ok) aplicar(r.datos);
    }).catch(function () { /* se reintentará con el siguiente golpe */ });
  }

  /**
   * Un animal ha mordido al JUGADOR.
   *
   * El daño NO viaja en la petición: el servidor lo decide (DANO_MORDISCO_ANIMAL
   * en costesDeAccion). El cliente solo dice "me ha mordido algo". Si el daño
   * lo pusiera el navegador, mandar 0 haría al personaje invulnerable.
   *
   * Va aquí y no en el módulo de la fauna para que TODO el HTTP autenticado de
   * esta funcionalidad viva en un solo sitio, con un único manejo del CSRF.
   */
  var ultimoMordiscoJugador = 0;
  function morderAlJugador(scene) {
    var ahora = Date.now();
    // Mismo ritmo que el del servidor: no tiene sentido disparar peticiones que
    // se van a descartar.
    if (ahora - ultimoMordiscoJugador < 900) return Promise.resolve(null);
    ultimoMordiscoJugador = ahora;

    var nombre = scene && scene.playerName;
    if (!nombre) return Promise.resolve(null);

    return api('/api/stats/' + encodeURIComponent(nombre) + '/consume',
               { reason: 'animal_bite' })
      .then(function (r) {
        if (!r.ok || !r.datos) return null;
        var st = r.datos.stats;
        if (st && typeof st.vida === 'number') {
          /* EL BUG QUE ARREGLA — "me atacan y no me hacen daño, y de repente
             paseando me lo hacen":

             El daño SÍ se aplicaba, en el servidor, en el momento del mordisco.
             Lo que no pasaba era repintar la barra: aquí solo se asignaba
             `scene.vidaPorcentaje`, que es un número, y el HUD no se entera de
             que cambió. La barra se quedaba igual hasta que cualquier otra cosa
             (talar, minar, un guardado) la repintaba… y entonces bajaba de
             golpe, como si el daño hubiera llegado tarde.

             `_adoptarVitalesDelServidor` es el camino que ya usa el juego para
             esto: copia las tres barras Y llama a _refreshBarrasUI(). */
          if (typeof scene._adoptarVitalesDelServidor === 'function') {
            scene._adoptarVitalesDelServidor(st);
          } else {
            if (typeof scene.vidaPorcentaje === 'number') scene.vidaPorcentaje = st.vida;
            if (window.playerStats) window.playerStats.vida = st.vida;
          }
          if (st.vida <= 0) declararMuerte();
        }
        return st;
      })
      .catch(function () { return null; });
  }

  /* Vida a 0: se le dice al servidor y él decide si de verdad estás muerto.

     CON FRENO, y no es un lujo: `aplicar()` avisa a los oyentes, y uno de esos
     oyentes (gf-muerte) vuelve a llamar aquí si sigue viendo la vida a 0. Si la
     respuesta no trae `ghost: true` —porque la petición falló, porque llegó una
     respuesta rara o porque el HUD local aún no se ha enterado— eso se convierte
     en un bucle infinito de peticiones al servidor. Se vio en las pruebas:
     el proceso se quedaba colgado disparando /api/player/death sin parar. */
  var ultimaMuerte = 0;
  function declararMuerte() {
    var ahora = Date.now();
    if (ahora - ultimaMuerte < 5000) return Promise.resolve(estado);
    ultimaMuerte = ahora;
    return api('/api/player/death', {}).then(function (r) {
      if (r.ok) aplicar(r.datos);
      return estado;
    }).catch(function () { return estado; });
  }

  /** Pagar el revivir. El precio lo pone el servidor, no este archivo. */
  function revivirJugador() {
    return api('/api/player/revive', {}).then(function (r) {
      if (r.ok) {
        // La vida nueva ANTES de avisar a los oyentes: si no, el vigilante de
        // gf-muerte ve la vida vieja (0) y vuelve a declarar la muerte justo
        // después de haber pagado por revivir.
        var st = r.datos && r.datos.stats;
        if (st && typeof st.vida === 'number' && window.playerStats) {
          window.playerStats.vida = st.vida;
        }
        ultimaMuerte = Date.now();      // freno: acaba de revivir
        aplicar(r.datos);
        return { ok: true, pagado: r.datos && r.datos.paid, stats: st };
      }
      if (r.datos && r.datos.pet) aplicar(r.datos);
      return { ok: false, error: (r.datos && r.datos.error) || 'error',
               precio: r.datos && r.datos.precio, plata: r.datos && r.datos.plata };
    }).catch(function () { return { ok: false, error: 'red' }; });
  }

  function ponerModo(modo) {
    return api('/api/pet/mode', { mode: modo }).then(function (r) {
      if (r.ok) { aplicar(r.datos); return true; }
      if (r.datos && r.datos.pet) aplicar(r.datos);
      return false;
    });
  }

  function revivirMascota() {
    return api('/api/pet/revive', {}).then(function (r) {
      if (r.ok) { aplicar(r.datos); return { ok: true }; }
      if (r.datos && r.datos.pet) aplicar(r.datos);
      return { ok: false, error: (r.datos && r.datos.error) || 'error' };
    });
  }

  function curar(itemId) {
    return api('/api/pet/heal', { itemId: itemId }).then(function (r) {
      if (r.ok) { aplicar(r.datos); return { ok: true }; }
      if (r.datos && r.datos.pet) aplicar(r.datos);
      return { ok: false, error: (r.datos && r.datos.error) || 'error' };
    });
  }

  // ------------------------------------------------------------ barra de vida
  function crearBarra(st) {
    var scene = st.scene;
    var perro = scene.dog && scene.dog.sprite;
    if (!perro || !scene.add.rectangle) return;
    // Rectángulos y no graphics: no hay que repintar nada cada frame, solo
    // mover y cambiar el ancho, que es mucho más barato.
    st.barraFondo = scene.add.rectangle(perro.x, perro.y - 40, 40, 6, 0x1a1620)
      .setOrigin(0.5, 1).setDepth(perro.depth + 2);
    st.barraVida = scene.add.rectangle(perro.x - 19, perro.y - 41, 38, 4, 0x5ec26a)
      .setOrigin(0, 1).setDepth(perro.depth + 3);
    st.barraFondo.setStrokeStyle(1, 0x000000, 0.6);
  }

  function colorVida(pct) {
    if (pct > 60) return 0x5ec26a;      // verde
    if (pct > 30) return 0xe0b64a;      // ámbar
    return 0xc7503f;                    // rojo
  }

  function actualizarBarra(st) {
    var scene = st.scene;
    var perro = scene.dog && scene.dog.sprite;
    if (!st.barraFondo || !perro) return;
    var visible = !!perro.visible && estado.cargado;
    st.barraFondo.setVisible(visible);
    st.barraVida.setVisible(visible && estado.health > 0);
    if (!visible) return;

    /* La barra va por encima del CARTEL del nombre, no pegada al lomo.
       Antes tapaba el nombre y el nivel de la mascota, que se dibujan justo
       ahí (dogNameText, a -displayHeight*0.5 - 4). */
    var alto = (perro.displayHeight || 64);
    var y = perro.y - alto * 0.5 - 22;
    if (scene.dogNameText && scene.dogNameText.visible) {
      y = Math.min(y, scene.dogNameText.y - 12);
    }
    st.barraFondo.setPosition(perro.x, y);
    st.barraFondo.setDepth(perro.depth + 2);
    st.barraVida.setPosition(perro.x - 19, y - 1);
    st.barraVida.setDepth(perro.depth + 3);
    st.barraVida.width = Math.max(0, 38 * (estado.health / 100));
    st.barraVida.fillColor = colorVida(estado.health);

  }

  /**
   * Muerta = NO SE VE.
   *
   * EL FALLO QUE ARREGLA: se quedaba tintada de gris siguiendo al jugador, y
   * eso es peor que no ver nada — parecía un bug del juego, no una mascota
   * caída. Además los demás jugadores tampoco deben ver perros muertos.
   *
   * Se le tocan sprite, sombra y cartel a la vez, y se le devuelve el color al
   * revivirla por si algo la dejó tintada.
   */
  function aplicarVisibilidad(st) {
    var scene = st.scene;
    var perro = scene.dog && scene.dog.sprite;
    if (!perro) return;
    var viva = estado.alive;
    if (st.vistaViva === viva) return;      // solo cuando cambia
    st.vistaViva = viva;

    /* SE APUNTA EN globalPetData, QUE ES LO QUE SOBREVIVE AL CAMBIO DE ESCENA.

       EL FALLO QUE ARREGLA: "si mi mascota esta muerta, en la tienda aparece
       cuando entro". Este modulo solo esta montado en GameScene; la tienda crea
       su propio perro y lo unico que mira antes de enseñarlo es
       window.globalPetData.equipped. Como ahi no habia nada sobre si la mascota
       esta viva, entraba y el perro muerto reaparecia tan campante.

       Es el mismo sitio que ya usa el juego para acordarse de si la mascota
       esta retirada, asi que no se inventa un canal nuevo. */
    try {
      if (!window.globalPetData) window.globalPetData = {};
      window.globalPetData.alive = viva;
    } catch (e) {}

    perro.setVisible(viva);
    if (viva && perro.clearTint) perro.clearTint();
    if (scene.dog.shadowContainer) scene.dog.shadowContainer.setVisible(viva);
    if (scene.dogNameText) scene.dogNameText.setVisible(viva);
    if (st.barraFondo) st.barraFondo.setVisible(viva);
    if (st.barraVida) st.barraVida.setVisible(viva);

    // Que los demás dejen de verlo: el servidor ya sabe que está muerta, pero
    // el socket manda la posición del perro en cada tic y hay que avisarle.
    try {
      if (scene.socket && scene.socket.connected) {
        scene.socket.emit('petAlive', { alive: viva });
      }
    } catch (e) { /* sin socket: se verá al reconectar */ }
    log('mascota', viva ? 'viva' : 'muerta', '→ visible:', viva);
  }

  // ------------------------------------------------------------------- menú
  function estilos() {
    if (document.getElementById('gf-mascota-css')) return;
    var css = document.createElement('style');
    css.id = 'gf-mascota-css';
    css.textContent = [
      '#gf-pet-panel{position:fixed;inset:0;display:none;align-items:center;',
      'justify-content:center;background:rgba(8,10,16,.62);z-index:99999;',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
      '#gf-pet-panel.abierto{display:flex}',
      '#gf-pet-card{background:#20222c;border:2px solid #3a3f52;border-radius:14px;',
      'padding:20px 22px;min-width:260px;max-width:90vw;color:#e8e8f0;',
      'box-shadow:0 12px 40px rgba(0,0,0,.55)}',
      '#gf-pet-card h3{margin:0 0 4px;font-size:18px;letter-spacing:.3px}',
      '#gf-pet-sub{margin:0 0 14px;font-size:12px;color:#9aa0b4}',
      '#gf-pet-bar{height:10px;background:#14161e;border-radius:6px;overflow:hidden;',
      'margin:0 0 6px;border:1px solid #3a3f52}',
      '#gf-pet-bar div{height:100%;width:100%;background:#5ec26a;transition:width .2s}',
      '#gf-pet-hp{font-size:12px;color:#9aa0b4;margin:0 0 16px}',
      '.gf-pet-btn{display:block;width:100%;margin:8px 0;padding:11px 14px;',
      'border-radius:10px;border:2px solid #3a3f52;background:#2a2e3c;color:#e8e8f0;',
      'font-size:15px;cursor:pointer;text-align:left}',
      '.gf-pet-btn:hover{background:#333849}',
      '.gf-pet-btn.activo{border-color:#5ec26a;background:#28402f}',
      '.gf-pet-btn.peligro{border-color:#c7503f}',
      '.gf-pet-btn small{display:block;font-size:11px;color:#9aa0b4;margin-top:2px}',
      '#gf-pet-cerrar{margin-top:12px;text-align:center;font-size:13px;color:#9aa0b4;',
      'cursor:pointer}',
      '#gf-pet-aviso{font-size:12px;margin:8px 0 0;min-height:16px;color:#e0b64a}'
    ].join('');
    document.head.appendChild(css);
  }

  function panel() {
    var p = document.getElementById('gf-pet-panel');
    if (p) return p;
    estilos();
    p = document.createElement('div');
    p.id = 'gf-pet-panel';
    // El texto va en INGLÉS, como el resto de lo que ve el jugador.
    p.innerHTML =
      '<div id="gf-pet-card">' +
        '<h3 id="gf-pet-nombre">Pet</h3>' +
        '<p id="gf-pet-sub">Choose how your pet behaves</p>' +
        '<div id="gf-pet-bar"><div></div></div>' +
        '<p id="gf-pet-hp">100 / 100</p>' +
        '<button class="gf-pet-btn" data-modo="passive">Passive' +
          '<small>Your pet stays out of fights. Wild animals will go for you.</small>' +
        '</button>' +
        '<button class="gf-pet-btn" data-modo="attack">Attack' +
          '<small>Your pet fights back. Wild animals will target the pet first.</small>' +
        '</button>' +
        '<button class="gf-pet-btn peligro" id="gf-pet-revive">Revive pet' +
          '<small>Uses one Revival Elixir from your bag.</small>' +
        '</button>' +
        '<p id="gf-pet-aviso"></p>' +
        '<div id="gf-pet-cerrar">Close</div>' +
      '</div>';
    document.body.appendChild(p);

    p.addEventListener('click', function (ev) {
      if (ev.target === p) cerrarMenu();
    });
    p.querySelector('#gf-pet-cerrar').addEventListener('click', cerrarMenu);
    var botones = p.querySelectorAll('.gf-pet-btn[data-modo]');
    for (var i = 0; i < botones.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          aviso('');
          ponerModo(b.getAttribute('data-modo')).then(function (bien) {
            if (!bien) aviso(estado.alive ? 'Could not change mode.'
                                          : 'Your pet is down. Revive it first.');
            pintarMenu();
          });
        });
      })(botones[i]);
    }
    p.querySelector('#gf-pet-revive').addEventListener('click', function () {
      aviso('');
      revivirMascota().then(function (r) {
        if (!r.ok) {
          aviso(r.error === 'falta_elixir'
            ? 'You need a Revival Elixir. Buy one from the Alchemist.'
            : 'Could not revive your pet.');
        }
        pintarMenu();
      });
    });
    return p;
  }

  function aviso(txt) {
    var e = document.getElementById('gf-pet-aviso');
    if (e) e.textContent = txt || '';
  }

  function pintarMenu() {
    var p = document.getElementById('gf-pet-panel');
    if (!p) return;
    var esc = escenaViva();
    var nombre = (esc && esc.petName && esc.petName !== '---') ? esc.petName : 'Pet';
    p.querySelector('#gf-pet-nombre').textContent = nombre;
    p.querySelector('#gf-pet-bar').firstChild.style.width = estado.health + '%';
    p.querySelector('#gf-pet-bar').firstChild.style.background =
      '#' + colorVida(estado.health).toString(16).padStart(6, '0');
    p.querySelector('#gf-pet-hp').textContent =
      estado.health + ' / ' + estado.maxHealth + (estado.alive ? '' : '  —  down');
    var botones = p.querySelectorAll('.gf-pet-btn[data-modo]');
    for (var i = 0; i < botones.length; i++) {
      var activo = botones[i].getAttribute('data-modo') === estado.mode;
      botones[i].classList.toggle('activo', activo);
      botones[i].disabled = !estado.alive;
      botones[i].style.opacity = estado.alive ? '1' : '.45';
    }
    p.querySelector('#gf-pet-revive').style.display = estado.alive ? 'none' : 'block';
  }

  function abrirMenu() {
    var p = panel();
    p.classList.add('abierto');
    aviso('');
    pintarMenu();
    sincronizar('menú').then(pintarMenu);
  }

  function cerrarMenu() {
    var p = document.getElementById('gf-pet-panel');
    if (p) p.classList.remove('abierto');
  }

  // ------------------------------------------------- doble clic / dos toques
  function engancharPerro(st) {
    var scene = st.scene;
    var perro = scene.dog && scene.dog.sprite;
    if (!perro || !perro.setInteractive || st.enganchado) return false;
    perro.setInteractive({ useHandCursor: true });
    st.ultimoToque = 0;
    st.onToque = function () {
      var ahora = Date.now();
      // Un solo manejador vale para ratón y para dedo: en el móvil, Phaser
      // manda igualmente 'pointerdown' al tocar, así que "dos toques" y "doble
      // clic" son exactamente lo mismo y no hay que duplicar código.
      if (ahora - st.ultimoToque < DOBLE_CLIC_MS) {
        st.ultimoToque = 0;
        abrirMenu();
      } else {
        st.ultimoToque = ahora;
      }
    };
    perro.on('pointerdown', st.onToque);
    st.enganchado = true;
    log('perro enganchado al doble clic');
    return true;
  }

  function escenaViva() {
    var g = window.game || (window.phaserScaler && window.phaserScaler.game);
    if (!g || !g.scene || !g.scene.getScenes) return null;
    try {
      var ss = g.scene.getScenes(true) || [];
      for (var i = 0; i < ss.length; i++) {
        if (ss[i].__gfMascota) return ss[i];
      }
    } catch (e) {}
    return null;
  }

  // ---------------------------------------------------------------- montaje
  function montar(scene) {
    if (!scene || !scene.add) return null;
    if (scene.__gfMascota) return scene.__gfMascota;

    var st = { scene: scene, enganchado: false, tintado: false };
    scene.__gfMascota = st;

    st.onUpdate = function () {
      // El perro no existe en el primer frame: se intenta enganchar hasta que
      // aparezca en vez de darlo por perdido.
      if (!st.enganchado) {
        if (engancharPerro(st)) crearBarra(st);
      }
      actualizarBarra(st);
      aplicarVisibilidad(st);
    };
    scene.events.on('update', st.onUpdate);

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    sincronizarSiHaceFalta('entrar en ' + (scene.scene && scene.scene.key));
    if (!timerSync) {
      timerSync = setInterval(function () { sincronizar('periódico'); }, SYNC_MS);
    }
    log('montado en', scene.scene && scene.scene.key);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfMascota;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    var perro = scene.dog && scene.dog.sprite;
    if (perro && st.onToque && perro.off) perro.off('pointerdown', st.onToque);
    if (st.barraFondo) st.barraFondo.destroy();
    if (st.barraVida) st.barraVida.destroy();
    // Se le devuelve la visibilidad al perro: quien la vuelva a ocultar será el
    // montaje siguiente si sigue muerta. Dejarla invisible aquí la perdía para
    // siempre al cambiar de escena.
    if (perro && perro.setVisible) perro.setVisible(true);
    scene.__gfMascota = null;
    cerrarMenu();
  }

  window.GFMascota = {
    // Se expone el helper de HTTP para que otros modulos (el cuervo, por
    // ejemplo) no tengan que repetir el manejo del CSRF y de las cookies.
    api: api,
    montar: montar,
    desmontar: desmontar,
    estado: function () { return estado; },
    modo: function () { return estado.mode; },
    viva: function () { return estado.alive; },
    vida: function () { return estado.health; },
    golpear: golpear,
    morderAlJugador: morderAlJugador,
    declararMuerte: declararMuerte,
    revivirJugador: revivirJugador,
    curar: curar,
    revivirMascota: revivirMascota,
    ponerModo: ponerModo,
    sincronizar: sincronizar,
    sincronizarSiHaceFalta: sincronizarSiHaceFalta,
    abrirMenu: abrirMenu,
    cerrarMenu: cerrarMenu,
    /* Devuelve la función para darse de BAJA.
       Sin esto, cada vez que GameScene se monta se apila un oyente más y no se
       suelta ninguno: al décimo viaje a la tienda había diez oyentes vivos
       apuntando a escenas ya destruidas. */
    alCambiar: function (fn) {
      if (typeof fn !== 'function') return function () {};
      oyentes.push(fn);
      return function () {
        var i = oyentes.indexOf(fn);
        if (i >= 0) oyentes.splice(i, 1);
      };
    },
    _interno: {
      aplicar: aplicar, colorVida: colorVida, enviarDano: enviarDano,
      pendiente: function () { return danoPendiente; }
    }
  };
})();
