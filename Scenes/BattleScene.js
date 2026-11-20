/*!
 * BattleScene — La ARENA de mascotas, en tiempo real (Grassland Forest)
 * ===========================================================================
 *
 * Tú ERES tu perro: lo mueves por la arena, apuntas, ladras, te escondes en la
 * hierba alta, rompes cajas para coger huesos de poder y aguantas mientras el
 * GAS entra desde los bordes. Gana el último en pie.
 *
 *   · 5 batallas diarias contra animales salvajes (cada 24 h desde la primera).
 *   · Arena PvP: de 2 a 6 jugadores, todos contra todos (bots en lo que falte).
 *   · Práctica: tú contra 3 bots, sin puntos.
 *
 * REHECHA EL 2026-11-15 — "las animaciones están descoordinadas, el HUD no
 * tiene el estilo del juego, no se adapta a todas las resoluciones, los
 * enemigos van muy rápidos, hay colisiones mal puestas, la zona se marca, se
 * mueven muy lagueados, los pisos no tienen los efectos de los gráficos y los
 * mapas no están recortados como los demás". Lo que cambia, y por qué:
 *
 *   EL SUELO ES EL DEL JUEGO. Trozos pintados (recortadas_arena_<id>, como el
 *   resto de mapas, con GFSuelo y lib/tileManager.js) hechos con el tileset
 *   del pueblo; el agua se mueve (GFAgua), se dejan huellas (GFPisadas) y la
 *   cámara lleva el post-procesado del juego (GFPost). Lo genera
 *   tools/generar-arenas.py.
 *
 *   LO QUE SE VE ES LO QUE CHOCA. Muros, hierba alta y cajas se dibujan a
 *   partir de la rejilla que manda el SERVIDOR (brawl:inicio), no de un mapa
 *   aparte: antes las cajas que el servidor reparte al azar no se dibujaban
 *   (eran muros invisibles). Las balas salen del cuerpo y dan en el cuerpo
 *   (REGLAS.ALTO_CUERPO, y cada especie con su tamaño: `golpe`).
 *
 *   TODO LO DE LOS DEMÁS VA EN UNA SOLA LÍNEA DE TIEMPO. A los demás se les
 *   pinta RETRASO_INTERP ms "en el pasado", interpolando entre instantáneas
 *   por la HORA DEL SERVIDOR (no por cuándo llegan: llegaban a trompicones y
 *   así se movían). Y lo que les pasa —sus disparos, los golpes, las caídas—
 *   se aplica con ese mismo retraso (_diferir): la bala sale de la boca del
 *   perro que se ve y el golpe llega cuando la bala llega. Lo TUYO (tu perro,
 *   tus disparos) va al momento, sin esperar a la red.
 *
 *   LAS ANIMACIONES VAN CON EL PASO. Los fotogramas de andar avanzan con la
 *   DISTANCIA recorrida (no con un reloj): a más velocidad, más deprisa, y
 *   quieto no "corre en el sitio". Los animales usan sus dibujos de frente,
 *   de espaldas y de ataque, según hacia dónde miran (el servidor lo manda).
 *
 *   SIN SALTOS DE PÍXEL. Antes las posiciones se redondeaban a píxeles del
 *   MUNDO: a zoom 3, cada paso eran 3 píxeles de pantalla y el movimiento
 *   temblaba. Ahora se redondea en pantalla (roundPixels de la cámara) y el
 *   zoom es entero siempre que se pueda (ver _ajustarZoom).
 *
 *   EL GAS no se marca: se ve entrar (ver _pintarGas).
 *
 *   EL HUD es HTML con el tema del juego (gf-arena.css, las variables --gfh-*
 *   de gf-hud.css) e iconos propios (Game/Source/arena, hechos con
 *   tools/generar-iconos-arena.py, la misma mano que los del HUD).
 *
 * QUIÉN HACE QUÉ
 * ---------------------------------------------------------------------------
 * El SERVIDOR manda (server2.js, con el motor gf-brawl-motor.js incrustado):
 * mueve las balas, reparte el daño, decide quién cae y lleva a los bots. Esta
 * escena dibuja lo que le cuentan, mueve TU perro con las mismas colisiones
 * (GFBrawlMotor.moverCirculo) y dibuja tus disparos en el acto.
 *
 * MEMORIA (la escena se REUTILIZA entre batallas)
 * ---------------------------------------------------------------------------
 *   · Oyentes del socket: solo con `this.on()`; limpiar() los quita.
 *   · Oyentes del DOM: solo con `_escucharDOM()`; init() y limpiar() los sueltan.
 *   · Relojes del navegador: solo con `_reloj()`; limpiar() los cancela.
 *   · Texturas propias: se sueltan al APAGARSE la escena (_liberarRecursos).
 *   · Todo lo que se crea por mensajes tiene tope (balas, efectos, números).
 */
class BattleScene extends Phaser.Scene {
  static ATLAS = 'bz_obj';
  static VERSION_ARTE = '20261115a';
  static ARENAS = ['pradera', 'ruinas', 'rio', 'nieve', 'canon'];
  static RETRATO_MASCOTA = './Game/Sprites/mascota/derecha/run_1.png';
  static ICONOS = './Game/Source/arena/';

  /* LO QUE SE VE, IGUAL PARA TODOS: como mucho `ancho` casillas en el lado
     LARGO de la pantalla y `alto` en el corto. Quien viera más sabría dónde
     está el otro antes de que el otro le viera a él. */
  static VISTA = { ancho: 19, alto: 11 };
  static RETRASO_INTERP = 100;     // ms "en el pasado" a los que se pinta a los demás
  static ENVIO_MS = 50;            // 20 posiciones por segundo al servidor
  static LATIDO_MS = 250;          // aunque estés quieto, para confirmar correcciones
  static MAX_BALAS = 160;
  static MAX_EFECTOS = 160;
  static ESPERA_RED_MS = 62000;    // lo que el servidor guarda tu perro sin conexión (60 s) y un poco más

  static SONIDOS = ['ladrido_1', 'ladrido_2', 'aullido', 'golpe', 'caja', 'hueso', 'ko', 'cuenta', 'ya', 'victoria', 'derrota',
                    'boom', 'cura', 'alarma'];

  static COLOR = {
    yo: 0x6fe37b, rival: 0xff6b5e, oro: 0xffd24a, municion: 0xffa94a, escudo: 0x8fd0ff,
    vidaMedia: 0xe8bf3a, vidaBaja: 0xe2554a, fondoBarra: 0x14111f
  };

  /* Cada arena, con qué se levanta y qué suelo pisa. `fondo` es el color de
     fondo de la cámara: el borde del suelo pintado se funde hacia él
     (tools/generar-arenas.py, FONDO). `tileset` es el que lee el agua. */
  static TEMAS = {
    pradera: { borde: 'seto', muro: 'seto', hierba: 'hierba', suelo: 'hierba', fondo: '#0e2214', tileset: 'bz_ts_pueblo', ruta: './Game/MAPAS/tiles.png' },
    ruinas:  { borde: 'seto', muro: 'roca', hierba: 'hierba', suelo: 'hierba', fondo: '#0e2214', tileset: 'bz_ts_pueblo', ruta: './Game/MAPAS/tiles.png' },
    rio:     { borde: 'seto', muro: 'roca', hierba: 'hierba', suelo: 'hierba', fondo: '#0e2214', tileset: 'bz_ts_pueblo', ruta: './Game/MAPAS/tiles.png' },
    nieve:   { borde: 'roca_nieve', muro: 'roca_nieve', hierba: 'hierba_nieve', suelo: 'nieve', fondo: '#2e3440', tileset: 'bz_ts_tundra', ruta: './Game/MAPAS/tundra/tiles_tundra.png' },
    canon:   { borde: 'roca_arena', muro: 'roca_arena', hierba: 'hierba_seca', suelo: 'arena', fondo: '#342a1c', tileset: 'bz_ts_desierto', ruta: './Game/MAPAS/desierto/tiles_desierto.png' }
  };

  /* Los luchadores que no son perros: sus sprites YA están en el juego (los
     animales del mapa, en 2.5D). Cada especie dice cuántos fotogramas tiene
     de cada pose; `dirs` = también de frente (_abajo) y de espaldas
     (_arriba). Todos miran a la DERECHA. */
  static ESPECIES = {
    perro:     { via: 'mascota',  quieto: 4, camina: 4 },
    conejo:    { via: 'animales', pre: 'conejo_',  quieto: 2, camina: 4, dirs: 1 },
    cerdo:     { via: 'animales', pre: 'cerdo_',   quieto: 2, camina: 4, dirs: 1 },
    cuervo:    { via: 'cuervo',   pre: 'cuervo_',  quieto: 2, camina: 4 },
    zorro:     { via: 'animales', pre: 'zorro_',   quieto: 2, camina: 4, ataque: 3, dirs: 1 },
    zorra:     { via: 'animales', pre: 'zorra_',   quieto: 2, camina: 4, ataque: 3, dirs: 1 },
    cocodrilo: { via: 'animales', pre: 'cocodrilo_', quieto: 2, camina: 4, ataque: 3, dirs: 1 },
    vibora:    { via: 'animales', pre: 'serpiente_vibora_', quieto: 2, camina: 0, repta: 4, ataque: 3, dirs: 1 },
    coral:     { via: 'animales', pre: 'serpiente_coral_',  quieto: 2, camina: 0, repta: 4, ataque: 3, dirs: 1 },
    topo:      { via: 'animales', pre: 'topo_',    quieto: 2, camina: 4, dirs: 1 },
    vaca:      { via: 'animales', pre: 'vaca_',    quieto: 2, camina: 4, dirs: 1 }
  };

  /* Lo que se recoge del suelo: su dibujo en el atlas y el color de su brillo. */
  static OBJETOS = {
    hueso:    { foto: 'hueso',    brillo: 0xffe6a0 },
    carne:    { foto: 'carne',    brillo: 0xff8a6a },
    escudo:   { foto: 'escudo',   brillo: 0x66baff },
    rapidez:  { foto: 'rapidez',  brillo: 0x7bf0d4 },
    municion: { foto: 'municion', brillo: 0xffc777 },
    super:    { foto: 'super',    brillo: 0xcd8cff }
  };

  /* Cómo se dibuja cada tipo de bala: pieza de pixel art de gf-batalla-arte
     (`x_…`) o fotograma del atlas de la arena. `giro` = cuánto hay que girar
     el dibujo para que mire hacia donde vuela. */
  static BALAS = {
    onda:      { pieza: 'x_onda' },
    aullido:   { pieza: 'x_aullido', luz: true },
    embestida: { pieza: 'x_embestida' },
    zarpa:     { pieza: 'x_zarpa' },
    mordisco:  { pieza: 'x_mordisco' },
    diente:    { pieza: 'x_diente' },
    veneno:    { pieza: 'x_veneno' },
    colmillo:  { foto: 'espina', escala: 0.75 },
    pluma:     { foto: 'pluma', giro: Math.PI / 2 },
    fuego:     { foto: 'bola_fuego', luz: true, gira: true }
  };

  /** Un número fijo por casilla (el mismo que azar_celda en tools/generar-arenas.py). */
  static _azarCelda(x, y, n) {
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) % n;
  }

  /** La huella de lo PINTADO en el suelo (agua, puentes, comederos): la misma
      cuenta que tools/generar-arenas.py, que la deja en el mapa.json. */
  static huellaSuelo(filas) {
    let h = 0x811c9dc5;
    const txt = filas.map((f) => String(f).replace(/[^~=+]/g, '.')).join('\n');
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  constructor() {
    super({ key: 'BattleScene' });
  }

  // =========================================================================
  // CICLO DE VIDA
  // =========================================================================
  init(data) {
    this._battleRun = (this._battleRun || 0) + 1;
    this._cleaned = false;
    // La escena se REUTILIZA: lo que enganchó la batalla anterior se suelta
    // aquí también, por si su limpiar() no llegó a correr.
    this._soltarDOM();
    this._soltarSocket();
    this._pararRelojes();

    if (this.events) {
      if (this._alCerrarBatalla) {
        this.events.off('shutdown', this._alCerrarBatalla);
        this.events.off('destroy', this._alCerrarBatalla);
      }
      this._alCerrarBatalla = () => { this.limpiar(); this._liberarRecursos(); };
      this.events.once('shutdown', this._alCerrarBatalla);
      this.events.once('destroy', this._alCerrarBatalla);
    }

    data = data || {};
    this.datosInicio = Object.assign({}, data);
    this.datosJugador = {
      playerName: data.playerName || '---',
      petName: data.petName || '---',
      address: data.address || '',
      nivel: data.nivel || 1
    };
    this.serverBase = data.serverBase || '';
    this.volverA = data.volverA || 'LoadingScenegame';
    this.modo = data.modo === 'bot' ? 'bot' : (data.modo === 'practica' ? 'practica' : 'pvp');
    this._aceptaPractica = this.modo === 'practica';

    this.estado = 'buscando';          // buscando | cuenta | combate | caido | fin
    this.matchId = null;
    this.yoId = null;
    this.partida = null;
    this.armas = null;
    this.R = null;
    this.arena = null;
    this.fondoEspera = null;
    this.vistas = new Map();
    this.balasVista = [];
    this.efectosVivos = [];
    this.objetosVista = new Map();
    this.numerosLibres = [];
    this.pred = null;
    this.desvio = { x: 0, y: 0 };      // lo que queda de una recolocación suave
    this.teclas = {};
    this.movTactil = { x: 0, y: 0 };
    this.apunte = { ang: 0, mostrar: false, sup: false, ratonX: 0, ratonY: 0, raton: false, ratonEn: 0, tactil: false };
    this.disparoMantenido = false;
    this.seq = 0;
    this.seqDisparo = 0;
    this.cAplicada = 0;
    this.ultimoEnvio = 0;
    this.ultimoLatido = 0;
    this.envioX = NaN;
    this.envioY = NaN;
    this.municion = 3;
    this.superCarga = 0;
    this.ultimoDisparoLocal = 0;
    this.ultimoSuperLocal = 0;
    this.misBajas = 0;
    this.quedan = 0;
    this.gas = null;
    this._gasPintado = -1;
    this._gasAlfa = 0;
    this._camaraGolpeEn = -Infinity;
    this._camaraRetroceso = { x: 0, y: 0 };
    this._camaraAnticipo = { x: 0, y: 0 };
    this._camaraCentro = null;
    this._sinRedDesde = 0;
    this._pidioVolverEn = 0;
    this._ultimoSnap = 0;
    this._busquedaDesde = 0;
    this._pvpDeadlineScheduled = false;
    this._colaAgotada = false;
    this.tCombateLocal = 0;
    this.seguidoId = null;
    this.arbustosApagados = new Set();
    this._arbustosMovidos = new Map();
    this._rotasRecientes = new Map();
    this._avisosGas = { previo: false, empieza: false, final: false };
    this._hud = {};
    this._tactil = false;
    this._zoom = 1;
    this._especiesPendientes = new Map();
    this._listeners = [];
    this._buscandoIniciado = false;
    this._respuestaCola = false;
    this._reintentado = false;
    this._intentoPeticion = 0;
    this._confirmandoRendicion = false;
    this._resultado = null;
    this._volviendo = false;
    this._volviendoDesde = 0;
    this._faltan = new Set();
    this._ultimoSonido = {};
    this._diferidos = [];              // lo de los demás, que se aplica RETRASO_INTERP después
    this._offsets = [];                // (llegada local − hora del servidor) de las últimas instantáneas
    this._offset = null;
    this._botonesRendirse = [];
    this._sueloDe = null;              // la arena cuyo suelo está puesto
    this._agua = null;
    this.map = null;                   // el mapa de casillas del suelo (lo lee GFAgua)
    this._capaSuelo = null;
    this._sueloRespaldo = null;
    this._teclasHasta = 0;
    this._volumenSFX = (() => {
      // El mismo ajuste que el mapa (GameScene.loadAudioSettings).
      try {
        if (localStorage.getItem('grassland_sfx_muted') === 'true') return 0;
        const v = parseFloat(localStorage.getItem('grassland_sfx_volume'));
        return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
      } catch (e) { return 0.7; }
    })();
    this._reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  preload() {
    const v = '?v=' + BattleScene.VERSION_ARTE;
    if (!this.textures.exists(BattleScene.ATLAS)) {
      this.load.atlas(BattleScene.ATLAS, './Game/MAPAS/arena/objetos.png' + v, './Game/MAPAS/arena/objetos.json' + v);
    }
    // El perro, siempre: es tu luchador y el de cualquier otro jugador.
    for (let i = 1; i <= 4; i++) {
      if (!this.textures.exists('bz_esp_perro_d_' + i)) this.load.image('bz_esp_perro_d_' + i, './Game/Sprites/mascota/derecha/run_' + i + '.png');
      if (!this.textures.exists('bz_esp_perro_i_' + i)) this.load.image('bz_esp_perro_i_' + i, './Game/Sprites/mascota/izquierda/run_' + i + '.png');
    }
    if (this._volumenSFX > 0) {
      BattleScene.SONIDOS.forEach((n) => {
        const k = 'bz_snd_' + n;
        if (!this.cache.audio.exists(k)) this.load.audio(k, './Game/MUSIC/bz_' + n + '.wav');
      });
    }
    // Lo que falla al cargar se apunta (cada archivo que falla dispara uno).
    // Se queda puesto mientras viva la escena: también carga al pelear.
    if (this._errorCarga) this.load.off('loaderror', this._errorCarga);
    this._errorCarga = (file) => {
      if (!file || !file.key) return;
      this._faltan.add(file.key);
      console.warn('⚠️ Arena: no se pudo cargar ' + file.key + ' (' + (file.src || file.url || '') + ')');
    };
    this.load.on('loaderror', this._errorCarga);
  }

  create() {
    this.scale.on('resize', this.onResize, this);
    document.body.classList.add('in-battle');

    const A = window.GFBatallaArte;
    if (A) {
      try { if (A.arenaPixel) A.arenaPixel(this); } catch (e) { console.warn('⚠️ Arena: piezas de pixel art', e); }
      try { if (A.proyectiles) A.proyectiles(this); } catch (e) { /* el brillo es opcional */ }
    }
    this._atlasOk = this.textures.exists(BattleScene.ATLAS) && !this._faltan.has(BattleScene.ATLAS);
    if (this._atlasOk) { try { this.textures.get(BattleScene.ATLAS).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {} }
    const cam = this.cameras.main;
    cam.setBackgroundColor(BattleScene.TEMAS.pradera.fondo);
    // Se redondea EN PANTALLA (no en el mundo): nítido y sin saltos.
    cam.setRoundPixels(true);
    this.gApunte = this.add.graphics().setDepth(39000);
    this.gGas = this.add.graphics().setDepth(44100);

    this.montarUI();
    this.montarControles();
    this.avisoHorizontal();
    this._ajustarZoom();
    this.montarFondoDeEspera();
    // El aspecto del juego: el post-procesado (de día y sin el tiempo del
    // pueblo: la arena se juega con luz) y casi sin desenfoque de bordes ni
    // separación de colores: en combate emborronaban a quien viene por el lado
    // (los cofres y los barriles del borde salían con filo rojo y azul).
    try {
      if (window.GFPost && window.GFPost.montar(this, { interior: true }) && window.GFPost.ajustar) {
        window.GFPost.ajustar({ focoDe: 0.95, focoA: 1.7, radio: 0.4, aberracion: 0.06 });
      }
    } catch (e) { console.warn('⚠️ Arena: post-procesado', e); }

    this.socket = window.globalSocket;
    if (!this.socket) {
      this.estadoBusqueda('No connection', 'Could not reach the server. Back to the map…');
      this.estado = 'fin';
      this.volverEnBreve(2500);
      return;
    }
    if (this.socket.connected) {
      this.arrancarBusqueda();
    } else {
      this.estadoBusqueda('Connecting…', 'Connecting to the server.');
      const alConectar = () => {
        this.socket.off('connect', alConectar);
        this._alConectar = null;
        if (this._cleaned) return;
        this.arrancarBusqueda();
      };
      this._alConectar = alConectar;
      this.socket.once('connect', alConectar);
      this._reloj(30000, () => {
        if (this.matchId || this._buscandoIniciado) return;
        this.estadoBusqueda('No connection', 'Could not reach the server. Back to the map…');
        this.estado = 'fin';
        this.volverEnBreve(2000);
      });
      try { this.socket.connect(); } catch (e) {}
    }
  }

  // =========================================================================
  // LA ARENA
  // =========================================================================
  _temaDe(id, tema) {
    const M = window.GFBrawlMotor;
    const t = tema || (M && M.ARENAS[id] && M.ARENAS[id].tema) || id;
    return BattleScene.TEMAS[t] ? t : 'pradera';
  }

  _foto(nombre) {
    if (!this._atlasOk) return null;
    try { return this.textures.get(BattleScene.ATLAS).has(nombre) ? nombre : null; } catch (e) { return null; }
  }

  /**
   * Monta la arena `id` con la rejilla `R` (la del servidor en una partida).
   * El suelo (trozos pintados, agua) solo se cambia si es otra arena: el de
   * la espera se aprovecha si toca la misma.
   */
  construirArena(id, R, tema) {
    tema = this._temaDe(id, tema);
    const res = { id, tema, R, objetos: [], arbustos: new Map(), cajas: new Map(), restos: [] };
    if (!R) return res;
    if (this._sueloDe !== id) this._montarSuelo(id, tema, R);
    this._sueloDeRespaldo(R, tema);
    this._dibujarMuros(res);
    this._dibujarArbustos(res);
    this._dibujarCajas(res);
    return res;
  }

  /** El suelo pintado, el agua que se mueve y el color de fondo. */
  _montarSuelo(id, tema, R) {
    const T = BattleScene.TEMAS[tema];
    this._sueloDe = id;
    this.cameras.main.setBackgroundColor(T.fondo);
    if (window.GFSuelo) {
      const carpeta = 'recortadas_arena_' + id;
      const huella = BattleScene.huellaSuelo(window.GFBrawlMotor ? window.GFBrawlMotor.filasDe(R) : []);
      try {
        window.GFSuelo.montar(this, {
          carpeta, prefijo: 'arena_' + id, capas: [], profundidad: -1000, margenPx: 600,
          alListo: () => {
            /* EL SUELO TIENE QUE SER EL DE ESTA REJILLA. Si alguien cambia una
               arena y no regenera su suelo (o el navegador sirve uno viejo),
               el agua pintada no sería la que choca: se quita el pintado y
               se queda el de respaldo, que sale de la rejilla. */
            try {
              const meta = this.cache.json.get('gfsuelo_' + carpeta);
              if (meta && meta.huella && meta.huella !== huella) {
                console.warn('⚠️ Arena: el suelo pintado de ' + id + ' no es el de esta rejilla (' + meta.huella + ' ≠ ' + huella + '); se usa el de respaldo');
                window.GFSuelo.desmontar(this);
              } else if (this._sueloRespaldo) {
                this._sueloRespaldo.setVisible(false);
              }
            } catch (e) {}
          }
        });
      } catch (e) { console.warn('⚠️ Arena: suelo pintado', e); }
    }
    this._montarAgua(id, tema, R);
    this._montarPisadas(T.suelo);
  }

  /* EL SUELO DE RESPALDO: lo mínimo para jugar si los trozos no llegan (sin
     red, una arena sin generar): el campo de un color, el agua y los
     puentes, sacados de la rejilla. Se esconde en cuanto se ve el pintado. */
  _sueloDeRespaldo(R, tema) {
    if (this._sueloRespaldo) { try { this._sueloRespaldo.destroy(); } catch (e) {} this._sueloRespaldo = null; }
    const C = R.celda, m = R.marco;
    const colores = { pradera: 0x4f8f3c, ruinas: 0x4f8f3c, rio: 0x4f8f3c, nieve: 0xdfe6ee, canon: 0xd8b77a };
    const g = this.add.graphics().setDepth(-1100);
    g.fillStyle(colores[tema] || 0x4f8f3c, 1).fillRect(m * C, m * C, (R.ancho - 2 * m) * C, (R.alto - 2 * m) * C);
    for (let y = 0; y < R.alto; y++) {
      for (let x = 0; x < R.ancho; x++) {
        const ch = R.celdas[y * R.ancho + x];
        if (ch === '~') g.fillStyle(0x3f86c7, 1).fillRect(x * C, y * C, C, C);
        else if (ch === '=') g.fillStyle(0x9a6b3d, 1).fillRect(x * C, y * C, C, C);
      }
    }
    const visible = !(window.GFSuelo && window.GFSuelo.estado && (window.GFSuelo.estado(this) || {}).capaEscondida);
    g.setVisible(visible);
    this._sueloRespaldo = g;
  }

  /** El agua que se mueve (GFAgua), como en el mapa salvaje. */
  _montarAgua(id, tema, R) {
    const G = window.GFAgua;
    try { if (G) G.desmontar(this); } catch (e) {}
    this._quitarMapaAgua();
    this._agua = { id };
    if (!G || !R || R.celdas.indexOf('~') < 0) return;
    const T = BattleScene.TEMAS[tema];
    const claveMapa = 'bz_suelo_' + id;
    const run = this._battleRun;
    const v = '?v=' + BattleScene.VERSION_ARTE;
    this._cargarRecursos([
      { tipo: 'tilemap', clave: claveMapa, ruta: './Maps/arena_' + id + '.json' + v },
      { tipo: 'image', clave: T.tileset, ruta: T.ruta + v }
    ]).then((ok) => {
      if (!ok || this._cleaned || this._battleRun !== run || !this._agua || this._agua.id !== id) return;
      try {
        this.textures.get(T.tileset).setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.map = this.make.tilemap({ key: claveMapa });
        const ts = this.map.addTilesetImage('Tileset_mapa', T.tileset, 16, 16);
        this._capaSuelo = ts ? this.map.createLayer('suelo', ts, 0, 0) : null;
        if (this._capaSuelo) this._capaSuelo.setVisible(false).setDepth(-1050);
        G.montar(this, { capa: 'suelo', textura: T.tileset, vida: null, excluir: this._puentesPx(R) });
      } catch (e) { console.warn('⚠️ Arena: agua animada', e); }
    });
  }

  _quitarMapaAgua() {
    try { if (this._capaSuelo) this._capaSuelo.destroy(); } catch (e) {}
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this._capaSuelo = null;
    this.map = null;
  }

  /** Los puentes, en px: el agua de debajo no se anima (se taparía el tablero). */
  _puentesPx(R) {
    const C = R.celda, zonas = [];
    for (let y = 0; y < R.alto; y++) {
      for (let x = 0; x < R.ancho; x++) {
        if (R.celdas[y * R.ancho + x] === '=') zonas.push({ x: x * C - 6, y: y * C - 6, width: C + 12, height: C + 12 });
      }
    }
    return zonas;
  }

  _montarPisadas(suelo) {
    const P = window.GFPisadas;
    if (!P) return;
    try {
      if (this.__gfPisadas && this.__gfPisadas.suelo === suelo) return;
      if (this.__gfPisadas) P.desmontar(this);
      P.montar(this, { suelo });
    } catch (e) {}
  }

  /** Carga lo que falte de `lista` y avisa cuando esté (o no) — sin colgarse. */
  _cargarRecursos(lista) {
    const run = this._battleRun;
    const existe = (r) => (r.tipo === 'tilemap' ? this.cache.tilemap.exists(r.clave) : this.textures.exists(r.clave));
    let pedidos = 0;
    lista.forEach((r) => {
      if (existe(r) || this._faltan.has(r.clave)) return;
      if (r.tipo === 'tilemap') this.load.tilemapTiledJSON(r.clave, r.ruta);
      else this.load.image(r.clave, r.ruta);
      pedidos++;
    });
    if (!pedidos) return Promise.resolve(lista.every(existe));
    return new Promise((resolve) => {
      const t0 = Date.now();
      const revisar = () => {
        if (this._cleaned || this._battleRun !== run) { resolve(false); return; }
        if (lista.every((r) => existe(r) || this._faltan.has(r.clave))) { resolve(lista.every(existe)); return; }
        if (Date.now() - t0 > 9000) { resolve(false); return; }
        if (!this.load.isLoading()) { try { this.load.start(); } catch (e) {} }
        this._reloj(80, revisar);
      };
      this._reloj(0, revisar);
    });
  }

  /* LOS MUROS, de la rejilla. Dentro del campo, el muro del tema (seto o
     rocas); en el primer anillo de fuera, el borde. Lo de más afuera es
     bosque pintado en el suelo. El seto va en piezas que casan con sus
     vecinos (seto_<N|E|S|O>, tools/generar-arenas.py). */
  _dibujarMuros(res) {
    const R = res.R, C = R.celda, m = R.marco, W = R.ancho, H = R.alto;
    const T = BattleScene.TEMAS[res.tema];
    const dentro = (x, y) => x >= m && x < W - m && y >= m && y < H - m;
    const anillo = (x, y) => !dentro(x, y) && x >= m - 1 && x <= W - m && y >= m - 1 && y <= H - m;
    const muro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (dentro(x, y) || anillo(x, y)) && R.celdas[y * W + x] === '#';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!muro(x, y)) continue;
        const tipo = anillo(x, y) ? T.borde : T.muro;
        let img = null;
        if (tipo === 'seto') {
          const mask = (muro(x, y - 1) ? 1 : 0) | (muro(x + 1, y) ? 2 : 0) | (muro(x, y + 1) ? 4 : 0) | (muro(x - 1, y) ? 8 : 0);
          const f = this._foto('seto_' + mask);
          if (f) img = this.add.image(x * C + 16, (y + 1) * C + 3, BattleScene.ATLAS, f).setOrigin(0.5, 1);
        } else {
          const f = this._foto(tipo + '_' + (1 + BattleScene._azarCelda(x, y, 4)));
          if (f) img = this.add.image(x * C + 16, (y + 1) * C + 2, BattleScene.ATLAS, f).setOrigin(0.5, 1).setFlipX(BattleScene._azarCelda(y, x, 2) === 1);
        }
        if (!img) img = this.add.rectangle(x * C + 16, y * C + 16, C, C, 0x5b6a52).setStrokeStyle(2, 0x2a3326);
        img.setDepth((y + 1) * C);
        res.objetos.push(img);
      }
    }
  }

  /* LA HIERBA ALTA: cinco matas por casilla (la del trigo del juego, sin su
     tierra), cada una en su profundidad: el perro que entra queda tapado por
     las de delante. */
  _dibujarArbustos(res) {
    const R = res.R, C = R.celda, W = R.ancho;
    const T = BattleScene.TEMAS[res.tema];
    const sitios = [[7, 13], [24, 11], [15, 22], [3, 28], [28, 27]];
    for (let y = 0; y < R.alto; y++) {
      for (let x = 0; x < W; x++) {
        if (R.celdas[y * W + x] !== '*') continue;
        const lista = [];
        sitios.forEach(([px, py], i) => {
          const jx = BattleScene._azarCelda(x * 7 + i, y, 5) - 2, jy = BattleScene._azarCelda(x, y * 7 + i, 5) - 2;
          const f = this._foto(T.hierba + '_' + (1 + BattleScene._azarCelda(x + i, y + i, 2)));
          const yy = y * C + py + jy + 7;
          const img = f
            ? this.add.image(x * C + px + jx, yy, BattleScene.ATLAS, f).setOrigin(0.5, 1)
            : this.add.rectangle(x * C + px + jx, yy, 10, 18, 0x5aa04a).setOrigin(0.5, 1);
          img.setDepth(yy);
          res.objetos.push(img);
          lista.push(img);
        });
        res.arbustos.set(y * W + x, lista);
      }
    }
  }

  /* LAS CAJAS: todas las de la rejilla (las del mapa y las que el servidor
     reparte al azar). Antes solo se dibujaban las del mapa: las otras eran
     muros invisibles. */
  _dibujarCajas(res) {
    const R = res.R, C = R.celda, W = R.ancho;
    const A = window.GFBatallaArte;
    Object.keys(R.cajas).forEach((k) => {
      const idx = Number(k), c = R.cajas[k];
      const x = idx % W, y = Math.floor(idx / W);
      const ch = R.celdas[idx];
      const tipo = ch === 'o' ? 'cofre' : (ch === 'x' ? 'barril' : 'caja');
      const f = this._foto(tipo === 'barril' ? 'barril_explosivo' : tipo);
      const px = x * C + 16, py = (y + 1) * C - 2;
      const img = f
        ? this.add.image(px, py, BattleScene.ATLAS, f).setOrigin(0.5, 1)
        : this.add.rectangle(px, py, 26, 24, tipo === 'cofre' ? 0xd9b02a : (tipo === 'barril' ? 0xb8392e : 0xb07f45)).setOrigin(0.5, 1).setStrokeStyle(2, 0x3a2516);
      img.setDepth((y + 1) * C - 1);
      const sombra = (A && this.textures.exists(A.pieza('x_sombra')))
        ? this.add.image(px, py - 1, A.pieza('x_sombra')).setScale(0.85, 0.75).setAlpha(0.32).setDepth(-800)
        : null;
      res.objetos.push(img);
      if (sombra) res.objetos.push(sombra);
      const caja = { img, sombra, tipo, rota: false, x0: img.x };
      res.cajas.set(idx, caja);
      if (c.vida < c.max) this._cajaTocada(caja, c.vida, c.max);
    });
  }

  destruirArena(res) {
    if (!res) return;
    res.objetos.forEach((o) => { try { if (this.tweens) this.tweens.killTweensOf(o); o.destroy(); } catch (e) {} });
    res.restos.forEach((o) => { try { o.destroy(); } catch (e) {} });
    res.objetos.length = 0;
    res.restos.length = 0;
    res.arbustos.clear();
    res.cajas.clear();
  }

  /** Mientras se busca partida, se ve una arena de fondo y la cámara pasea. */
  montarFondoDeEspera() {
    const M = window.GFBrawlMotor;
    if (!M) return;
    const ids = BattleScene.ARENAS;
    const id = ids[(this._battleRun || 0) % ids.length];
    let R = null;
    try { R = M.crearRejilla(M.ARENAS[id]); } catch (e) { return; }
    this.fondoEspera = this.construirArena(id, R);
    const cam = this.cameras.main;
    const W = R.anchoPx, H = R.altoPx;
    const z = this._zoom || 1;
    const vw = cam.width / z, vh = cam.height / z;
    // El centro de la vista va de un lado al otro del campo, sin salirse del dibujo.
    const x0 = Math.min(W / 2, Math.max(vw / 2, W * 0.3)), x1 = Math.max(W / 2, Math.min(W - vw / 2, W * 0.7));
    cam.centerOn(x0, Math.max(vh / 2, Math.min(H - vh / 2, H * 0.42)));
    if (!this._reducedMotion) {
      this._paseo = this.tweens.add({
        targets: cam, scrollX: { from: x0 - cam.width / 2, to: x1 - cam.width / 2 },
        duration: 18000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  }

  quitarFondoDeEspera() {
    if (this._paseo) { this._paseo.remove(); this._paseo = null; }
    if (this.fondoEspera) { this.destruirArena(this.fondoEspera); this.fondoEspera = null; }
  }

  // =========================================================================
  // ZOOM Y CÁMARA
  // =========================================================================
  /* El zoom sale de lo que se ve (VISTA). Y si un zoom ENTERO queda cerca
     (un 13 % arriba o abajo), se usa ése: a zoom entero cada píxel del dibujo
     son los mismos píxeles de pantalla y nada "tiembla" al moverse. Si no,
     cuartos (nunca más que eso de diferencia con lo justo). */
  _ajustarZoom() {
    const cam = this.cameras.main;
    const w = this.scale.width, h = this.scale.height;
    const largo = Math.max(w, h), corto = Math.min(w, h);
    const justo = Math.max(largo / (BattleScene.VISTA.ancho * 32), corto / (BattleScene.VISTA.alto * 32));
    const entero = Math.round(justo);
    let z = (entero >= 1 && Math.abs(entero - justo) / justo <= 0.13) ? entero : Math.round(justo * 4) / 4;
    z = Math.max(0.75, Math.min(8, z));
    this._zoom = z;
    cam.setZoom(z);
    // Escala de los carteles: se diseñan en píxeles de CSS, y un píxel de CSS
    // son dpr/zoom píxeles del mundo.
    this._dpr = Math.max(1, Math.round(w / Math.max(1, window.innerWidth || w)));
    this._escalaCartel = this._dpr / z;
    this.vistas.forEach((v) => this._escalarCartel(v));
  }

  onResize() {
    this._ajustarZoom();
    if (this._revisarOrientacion) this._revisarOrientacion();
  }

  /** La cámara sigue a tu perro (o, caído, a quien sigue en pie), sin salirse del dibujo. */
  _camara(dt) {
    const yo = this.vistas.get(this.yoId);
    let foco = null;
    if (yo && yo.vivo) foco = yo;
    else if (this.matchId) {
      let s = this.seguidoId ? this.vistas.get(this.seguidoId) : null;
      if (!s || !s.vivo || s.oculto) {
        s = null;
        this.vistas.forEach((v) => { if (!s && v.vivo && !v.oculto && !v.yo) s = v; });
        this.seguidoId = s ? s.id : null;
      }
      foco = s || yo;
    }
    if (!foco || !this.R) return;
    const cam = this.cameras.main;
    const anticipo = this._camaraAnticipo, retro = this._camaraRetroceso;
    const apuntando = foco.yo && (this.apunte.mostrar || (this.apunte.raton && !this._tactil)) && !this._reducedMotion;
    const distancia = apuntando ? 22 : 0;
    anticipo.x += (Math.cos(this.apunte.ang || 0) * distancia - anticipo.x) * Math.min(1, dt * 4);
    anticipo.y += (Math.sin(this.apunte.ang || 0) * distancia - anticipo.y) * Math.min(1, dt * 4);
    retro.x *= Math.max(0, 1 - dt * 14); retro.y *= Math.max(0, 1 - dt * 14);
    let tx = foco.x + anticipo.x + retro.x, ty = foco.y - 8 + anticipo.y + retro.y;
    const vw = cam.width / this._zoom, vh = cam.height / this._zoom;
    const W = this.R.anchoPx, H = this.R.altoPx;
    tx = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, tx));
    ty = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, ty));
    if (!this._camaraCentro) this._camaraCentro = { x: tx, y: ty };
    const c = this._camaraCentro;
    const k = Math.min(1, dt * 12);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    cam.centerOn(c.x, c.y);
  }

  _centrarCamara(x, y) {
    this._camaraCentro = null;
    this.cameras.main.centerOn(x, y);
  }

  _impulsoCamara(tipo, ang, fuerza = 1) {
    if (this._reducedMotion || document.hidden || this._cleaned) return;
    const ahora = performance.now();
    if (tipo === 'tiro' || tipo === 'super') {
      const r = this._camaraRetroceso;
      const n = tipo === 'super' ? 7 : 3;
      r.x = -Math.cos(ang) * n; r.y = -Math.sin(ang) * n;
    }
    if (tipo === 'tiro' || ahora - this._camaraGolpeEn < 180) return;
    this._camaraGolpeEn = ahora;
    const duracion = tipo === 'explosion' ? 150 : 85;
    this.cameras.main.shake(duracion, Math.min(0.0025, Math.max(0, fuerza) * 0.0025), false);
  }

  // =========================================================================
  // LUCHADORES
  // =========================================================================
  _rutasEspecie(id, pose, n, dir) {
    const E = BattleScene.ESPECIES[id];
    if (!E || E.via === 'mascota') return [];
    const suf = dir ? '_' + dir : '';
    const out = [];
    for (let i = 1; i <= n; i++) {
      // (2026-10-12) Los animales, los de 2.5D (tools/generar-animales3d.py).
      const base = E.via === 'cuervo' ? './Game/Sprites/cuervo3d/' : './Game/Sprites/animales3d/';
      out.push(['bz_esp_' + id + '_' + pose + suf + '_' + i, base + E.pre + pose + suf + '_' + i + '.png?v=20261012']);
    }
    return out;
  }

  /**
   * Descarga los fotogramas de una especie (de lado y, si los tiene, de frente
   * y de espaldas). Se espera MIRANDO LAS TEXTURAS, no un evento del cargador:
   * `load.start()` se ignora si ya está cargando y el 'complete' de una tanda
   * resolvía también la de otra especie que aún no había llegado (el fallo
   * del "peleo contra alguien invisible").
   */
  cargarEspecie(id) {
    const E = BattleScene.ESPECIES[id];
    if (!E || E.via === 'mascota' || this._cleaned) return Promise.resolve(true);
    if (this._especiesPendientes.has(id)) return this._especiesPendientes.get(id);
    const claves = [];
    let pedidos = 0;
    const dirs = E.dirs ? ['', 'abajo', 'arriba'] : [''];
    [['quieto', E.quieto], [E.repta ? 'repta' : 'camina', E.repta || E.camina], ['ataque', E.ataque || 0]].forEach(([pose, n]) => {
      dirs.forEach((dir) => {
        this._rutasEspecie(id, pose, n || 0, dir).forEach(([k, ruta]) => {
          claves.push(k);
          if (this.textures.exists(k)) return;
          this.load.image(k, ruta);
          pedidos++;
        });
      });
    });
    if (!pedidos) return Promise.resolve(true);
    const run = this._battleRun;
    const p = new Promise((resolve) => {
      const t0 = Date.now();
      const revisar = () => {
        if (this._cleaned || this._battleRun !== run) { resolve(false); return; }
        if (claves.every((k) => this.textures.exists(k) || this._faltan.has(k))) { resolve(claves.every((k) => this.textures.exists(k))); return; }
        if (Date.now() - t0 > 6000) { resolve(false); return; }
        if (!this.load.isLoading()) { try { this.load.start(); } catch (e) {} }
        this._reloj(80, revisar);
      };
      this._reloj(0, revisar);
    });
    this._especiesPendientes.set(id, p);
    return p;
  }

  /** Las claves de los fotogramas de una pose (las que existen). `dir`: '', 'abajo' o 'arriba'. */
  _fotogramas(id, pose, lado, dir) {
    const E = BattleScene.ESPECIES[id] || BattleScene.ESPECIES.perro;
    if (E.via === 'mascota') {
      const out = [];
      for (let i = 1; i <= 4; i++) {
        const k = 'bz_esp_perro_' + (lado < 0 ? 'i' : 'd') + '_' + i;
        if (this.textures.exists(k)) out.push(k);
      }
      return out;
    }
    let real = pose;
    if (pose === 'camina') real = E.repta ? 'repta' : (E.camina ? 'camina' : 'quieto');
    if (pose === 'ataque' && !E.ataque) real = 'quieto';
    const n = real === 'quieto' ? E.quieto : real === 'ataque' ? (E.ataque || 0) : (E.repta || E.camina || 0);
    const suf = dir && E.dirs ? '_' + dir : '';
    const out = [];
    for (let i = 1; i <= n; i++) {
      const k = 'bz_esp_' + id + '_' + real + suf + '_' + i;
      if (this.textures.exists(k)) out.push(k);
    }
    if (!out.length && suf) return this._fotogramas(id, pose, lado, '');
    return out;
  }

  crearVista(l) {
    const C = BattleScene.COLOR;
    const A = window.GFBatallaArte;
    const esYo = l.id === this.yoId;
    const conPos = Number.isFinite(l.x) && Number.isFinite(l.y);
    const x = conPos ? l.x : -1000, y = conPos ? l.y : -1000;
    const v = {
      id: l.id, datos: l, especie: l.especie || 'perro', yo: esYo,
      x, y, hp: l.hp, maxHp: l.maxHp, potencia: l.potencia || 0, golpe: Number(l.golpe) || 12,
      vivo: l.vivo !== false, oculto: !conPos, enArbusto: false, mira: 1, cara: 0, dir: '',
      buffer: [], paso: 0, avance: 0, proximoQuieto: 0, ultX: x, ultY: y, huellaX: x, huellaY: y,
      golpeHasta: 0, retroceso: 0, ataqueHasta: 0, koPendiente: false, ultTexto: {}
    };
    const pieza = (k) => (A && this.textures.exists(A.pieza(k)) ? A.pieza(k) : null);
    v.sombra = pieza('x_sombra')
      ? this.add.image(x, y + 8, pieza('x_sombra')).setAlpha(0.34).setDepth(-800)
      : this.add.ellipse(x, y + 8, 30, 10, 0x000000, 0.3).setDepth(-800);
    v.aro = pieza('x_aro')
      ? this.add.image(x, y + 8, pieza('x_aro')).setTint(esYo ? C.yo : C.rival).setAlpha(esYo ? 0.85 : 0.6).setDepth(-799)
      : this.add.ellipse(x, y + 8, 32, 12).setStrokeStyle(2, esYo ? C.yo : C.rival, 0.8).setDepth(-799);
    v.spr = this.add.sprite(x, y + 9, '__DEFAULT').setOrigin(0.5, 1);
    if (esYo) {
      v.superListo = pieza('brillo')
        ? this.add.image(x, y, pieza('brillo')).setTint(C.oro).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDisplaySize(64, 34)
        : null;
    }
    if (v.oculto) { v.spr.setAlpha(0); v.sombra.setVisible(false); v.aro.setVisible(false); }
    this._crearCartel(v);
    this._vestir(v);
    this.vistas.set(l.id, v);
    return v;
  }

  _vestir(v) {
    const id = BattleScene.ESPECIES[v.especie] ? v.especie : 'perro';
    let quietos = this._fotogramas(id, 'quieto', v.mira);
    if (!quietos.length) quietos = this._fotogramas('perro', 'quieto', v.mira);
    const k = quietos[0];
    if (!k) {
      // Ni el perro: un bloque de color, que al menos se ve y se puede apuntar.
      if (!this.textures.exists('bz_bloque')) {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff, 1).fillRect(0, 0, 22, 22);
        g.generateTexture('bz_bloque', 22, 22);
        g.destroy();
      }
      v.spr.setTexture('bz_bloque').setTint(v.yo ? BattleScene.COLOR.yo : BattleScene.COLOR.rival);
      v.marcos = null;
      v.altoSprite = 22;
      v.anchoSprite = 22;
      return;
    }
    v.spr.clearTint();
    v.spr.setTexture(k).setScale(1);
    v.altoSprite = v.spr.height || 30;
    v.anchoSprite = v.spr.width || 30;
    v.marcos = { id };
    // La sombra, del ancho del bicho (un cocodrilo no es un conejo).
    if (v.sombra && v.sombra.setScale) v.sombra.setScale(Math.max(0.55, Math.min(1.9, v.anchoSprite * 0.85 / 36)), 1);
    if (v.aro && v.aro.setScale) v.aro.setScale(Math.max(0.8, Math.min(1.7, v.anchoSprite * 0.95 / 38)), 1);
    if (v.cartel) this._escalarCartel(v);
  }

  /* EL CARTEL de encima de cada uno: nombre y nivel, la barra de vida con su
     número y, en el tuyo, las tres cargas de munición. Medidas en píxeles de
     CSS (el contenedor se escala a dpr/zoom): la misma letra del juego que
     el cartel de la mascota en el mapa (PressStart2P de 8 px). */
  _crearCartel(v) {
    const C = BattleScene.COLOR;
    const res = Math.max(2, this._dpr || 1);
    const est = (tam, color) => ({
      fontFamily: '"PressStart2P", monospace', fontSize: tam + 'px', color,
      stroke: '#0a0710', strokeThickness: 3, resolution: res
    });
    const d = v.datos;
    const c = this.add.container(v.x, v.y).setDepth(43000);
    v.nombre = this.add.text(0, -12, String(d.petName || 'Pet').slice(0, 16), est(8, v.yo ? '#c8ffcf' : '#ffe9a8')).setOrigin(0.5, 1);
    v.nivel = this.add.text(0, -12, '', est(7, '#ffd24a')).setOrigin(0, 1);
    v.barraFondo = this.add.rectangle(0, -5, 50, 9, C.fondoBarra).setOrigin(0.5, 0.5).setStrokeStyle(1, 0x000000, 1);
    v.barra = this.add.rectangle(-24, -5, 48, 7, v.yo ? C.yo : C.rival).setOrigin(0, 0.5);
    v.barraLuz = this.add.rectangle(-24, -7, 48, 2, 0xffffff, 0.28).setOrigin(0, 0.5);
    v.escudoBarra = this.add.rectangle(-24, -5, 0, 7, C.escudo, 0.85).setOrigin(0, 0.5);
    v.vidaTxt = this.add.text(0, -5, '', est(6, '#ffffff')).setOrigin(0.5, 0.5);
    c.add([v.barraFondo, v.barra, v.barraLuz, v.escudoBarra, v.nombre, v.nivel, v.vidaTxt]);
    if (v.yo) {
      v.municion = [];
      for (let i = 0; i < 3; i++) {
        const fondo = this.add.rectangle(-24 + i * 16.5, 4, 15, 4, C.fondoBarra).setOrigin(0, 0.5).setStrokeStyle(1, 0x000000, 0.9);
        const lleno = this.add.rectangle(-24 + i * 16.5, 4, 15, 4, C.municion).setOrigin(0, 0.5);
        c.add([fondo, lleno]);
        v.municion.push(lleno);
      }
    }
    v.cartel = c;
    this._ponerTextoNivel(v);
    this._escalarCartel(v);
  }

  _ponerTextoNivel(v) {
    const d = v.datos;
    v.nivel.setText('Lv' + (d.nivel || 1));
    const total = v.nombre.width + 4 + v.nivel.width;
    v.nombre.setOrigin(0, 1).setX(-total / 2);
    v.nivel.setX(-total / 2 + v.nombre.width + 4);
  }

  _escalarCartel(v) {
    if (!v.cartel) return;
    v.cartel.setScale(this._escalaCartel || 1);
  }

  _pintarCartel(v) {
    const C = BattleScene.COLOR;
    const p = Math.max(0, Math.min(1, v.hp / Math.max(1, v.maxHp)));
    const ancho = Math.round(48 * p * 2) / 2;
    if (v.ultTexto.barra !== ancho) { v.barra.width = ancho; v.barraLuz.width = ancho; v.ultTexto.barra = ancho; }
    const color = v.yo ? (p > 0.5 ? C.yo : (p > 0.25 ? C.vidaMedia : C.vidaBaja)) : C.rival;
    if (v.barra.fillColor !== color) v.barra.fillColor = color;
    const esc = v.yo && this._escudoYo > 0 ? Math.min(48, 48 * this._escudoYo / Math.max(1, v.maxHp)) : 0;
    if (v.escudoBarra.width !== esc) v.escudoBarra.width = esc;
    const txt = String(Math.max(0, Math.round(v.hp)));
    if (v.ultTexto.vida !== txt) { v.vidaTxt.setText(txt); v.ultTexto.vida = txt; }
  }

  destruirVista(v) {
    ['sombra', 'spr', 'aro', 'superListo', 'cartel'].forEach((k) => {
      if (v[k]) { try { if (this.tweens) this.tweens.killTweensOf(v[k]); v[k].destroy(); } catch (e) {} v[k] = null; }
    });
  }

  // =========================================================================
  // INTERFAZ HTML (index.html: #battleUI; estilos en gf-arena.css)
  // =========================================================================
  montarUI() {
    this.ui = document.getElementById('battleUI');
    if (!this.ui) { console.error('❌ Falta #battleUI en el HTML'); return; }
    this.ui.classList.remove('hidden', 'en-gas', 'caido', 'fin', 'sin-teclas');
    this.ui.classList.add('buscando');
    const $ = (id) => document.getElementById(id);
    this.el = {
      yo: $('bzYo'), retrato: $('bzRetrato'), nombre: $('bzYoNombre'), nivel: $('bzYoNivel'),
      vidaBarra: $('bzYoVidaBarra'), vida: $('bzYoVida'), vidaTxt: $('bzYoVidaTxt'),
      huesos: $('bzYoHuesos'), bajas: $('bzYoBajas'), escudo: $('bzYoEscudo'), rapidez: $('bzYoRapidez'),
      modo: $('bzModo'), relojTxt: $('bzReloj'), quedan: $('bzQuedan'), gas: $('bzGasEstado'), gasTxt: $('bzGasTxt'),
      salir: $('bzSalir'), feed: $('bzFeed'), aviso: $('bzAviso'), dolor: $('bzDolor'),
      busqueda: $('bzBusqueda'), busqTitulo: $('bzBusquedaTitulo'), busqTexto: $('bzBusquedaTexto'),
      sala: $('bzSala'), busqTiempo: $('bzBusquedaTiempo'), practicar: $('bzPracticar'), cancelar: $('bzCancelar'),
      lobby: $('bzLobby'), listo: $('bzListo'),
      tactil: $('bzTactil'), zonaMover: $('bzZonaMover'), stickMover: $('bzStickMover'),
      zonaDisparo: $('bzZonaDisparo'), stickDisparo: $('bzStickDisparo'), superBtn: $('bzSuper'), superAnillo: $('bzSuperAnillo'),
      pie: $('bzPie'), municionHud: $('bzMunicion'), superBarra: $('bzSuperBarra'), superRelleno: $('bzSuperRelleno'), superTexto: $('bzSuperTexto'),
      caido: $('bzCaido'), caidoTitulo: $('bzCaidoTitulo'), caidoTexto: $('bzCaidoTexto'), mirar: $('bzMirar'), volverCaido: $('bzVolverCaido'),
      resultado: $('bzResultado'), resPuesto: $('bzResPuesto'), resTitulo: $('bzResTitulo'), resSub: $('bzResSub'),
      resPremios: $('bzResPremios'), resTabla: $('bzResTabla'), otraVez: $('bzOtraVez'), volver: $('bzVolver'),
      fuera: $('bzFuera'), fueraTxt: $('bzFueraTxt'), flecha: $('bzFlecha'), red: $('bzRed')
    };
    const e = this.el;
    this._botonesRendirse = [e.salir].filter(Boolean);
    // Estado de partida: todo a cero (la UI es la misma de la batalla anterior).
    [e.caido, e.resultado, e.aviso, e.gas, e.fuera, e.red, e.escudo, e.rapidez].forEach((n) => n && n.classList.add('hidden'));
    if (e.busqueda) e.busqueda.classList.remove('hidden');
    if (e.feed) e.feed.textContent = '';
    if (e.dolor) e.dolor.classList.remove('activo');
    if (e.relojTxt) e.relojTxt.textContent = '--:--';
    if (e.quedan) e.quedan.textContent = '-';
    if (e.modo) e.modo.textContent = this.modo === 'bot' ? 'Daily battle' : (this.modo === 'practica' ? 'Practice' : 'Arena PvP');
    if (e.nombre) e.nombre.textContent = this.datosJugador.petName && this.datosJugador.petName !== '---' ? this.datosJugador.petName : 'Your pet';
    if (e.nivel) e.nivel.textContent = '';
    if (e.retrato) e.retrato.style.backgroundImage = "url('" + BattleScene.RETRATO_MASCOTA + "')";
    if (e.huesos) e.huesos.textContent = '0';
    if (e.bajas) e.bajas.textContent = '0';
    this._pintarVidaHUD(1, 1);
    this._pintarSuperHUD(0);
    this._pintarMunicionHUD(3);
    if (e.practicar) e.practicar.classList.toggle('hidden', this.modo !== 'pvp');
    if (e.sala) e.sala.textContent = '';
    if (e.busqTiempo) e.busqTiempo.textContent = '0:00';
    this._listo = false;
    if (e.lobby) { e.lobby.textContent = ''; e.lobby.classList.add('hidden'); }
    this._pintarBotonListo(false);
    this.estadoBusqueda(
      this.modo === 'bot' ? 'Preparing your daily battle…' : (this.modo === 'practica' ? 'Preparing practice…' : 'Searching for players…'),
      this.modo === 'pvp' ? 'Be the last pet standing. 2 to 6 players; empty places are filled with bots.' : 'Get ready!'
    );

    this._escucharDOM(e.salir, 'click', () => this.pedirRendicion(e.salir));
    this._escucharDOM(e.cancelar, 'click', () => this.rendirse());
    this._escucharDOM(e.practicar, 'click', () => this.pasarAPractica());
    this._escucharDOM(e.listo, 'click', () => this._alternarListo());
    this._escucharDOM(e.mirar, 'click', () => { if (e.caido) e.caido.classList.add('hidden'); });
    this._escucharDOM(e.volverCaido, 'click', () => this.rendirse());
    this._escucharDOM(e.volver, 'click', () => this.volverAlMapa());
    this._escucharDOM(e.otraVez, 'click', () => this.jugarOtraVez());
    this._cancelarConfirmacion();
  }

  /* LA SALA DE ESPERA: quién ha entrado y quién está listo. Los nombres van
     con textContent: los escribe cada jugador. */
  _pintarSala(d) {
    const e = this.el;
    if (!e) return;
    const lista = Array.isArray(d && d.lista) ? d.lista : [];
    if (e.lobby) {
      e.lobby.textContent = '';
      e.lobby.classList.toggle('hidden', !lista.length);
      lista.forEach((x) => {
        const li = document.createElement('li');
        li.className = 'ga-lobby-fila' + (x.listo ? ' listo' : '') + (x.yo ? ' yo' : '');
        const img = document.createElement('img');
        img.src = BattleScene.RETRATO_MASCOTA; img.alt = ''; img.className = 'ga-lobby-retrato';
        const nom = document.createElement('span');
        nom.className = 'ga-lobby-nombre';
        nom.textContent = String(x.nombre || 'Player').slice(0, 24) + (x.yo ? ' (you)' : '');
        const pet = document.createElement('small');
        pet.textContent = String(x.mascota || 'Pet').slice(0, 20) + ' · Lv' + (Number(x.nivel) || 1);
        nom.appendChild(pet);
        const est = document.createElement('span');
        est.className = 'ga-lobby-estado';
        est.textContent = x.listo ? 'Ready' : 'Waiting';
        li.appendChild(img); li.appendChild(nom); li.appendChild(est);
        e.lobby.appendChild(li);
      });
      const libres = Math.max(0, (Number(d && d.max) || 6) - lista.length);
      if (libres && lista.length) {
        const li = document.createElement('li');
        li.className = 'ga-lobby-fila bots';
        const img = document.createElement('img');
        img.src = BattleScene.ICONOS + 'bot.png'; img.alt = ''; img.className = 'ga-lobby-retrato';
        const t = document.createElement('span');
        t.className = 'ga-lobby-nombre';
        t.textContent = libres + (libres === 1 ? ' place' : ' places') + ' for bots';
        li.appendChild(img); li.appendChild(t);
        e.lobby.appendChild(li);
      }
    }
    const yo = lista.find((x) => x.yo);
    this._listo = !!(yo && yo.listo);
    this._pintarBotonListo(lista.length > 0);
  }

  _pintarBotonListo(ver) {
    const b = this.el && this.el.listo;
    if (!b) return;
    b.classList.toggle('hidden', !ver);
    const t = b.querySelector ? b.querySelector('span') : null;
    (t || b).textContent = this._listo ? 'Ready! (tap to cancel)' : 'Ready';
    b.classList.toggle('activo', !!this._listo);
    if (b.setAttribute) b.setAttribute('aria-pressed', this._listo ? 'true' : 'false');
  }

  _alternarListo() {
    if (this.estado !== 'buscando' || this.modo !== 'pvp') return;
    this._listo = !this._listo;
    this._pintarBotonListo(true);
    this._emitir('brawl:listo', { listo: this._listo });
  }

  estadoBusqueda(titulo, texto) {
    if (!this.el) return;
    if (titulo != null && this.el.busqTitulo) this.el.busqTitulo.textContent = titulo;
    if (texto != null && this.el.busqTexto) this.el.busqTexto.textContent = texto;
  }

  _pintarVidaHUD(hp, maxHp) {
    const e = this.el;
    if (!e || !e.vida) return;
    const p = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    const ancho = Math.round(p * 1000) / 10 + '%';
    if (this._hud.vida !== ancho) { e.vida.style.width = ancho; this._hud.vida = ancho; }
    const clase = p > 0.5 ? '' : (p > 0.25 ? 'media' : 'baja');
    if (this._hud.vidaClase !== clase && e.vidaBarra) {
      e.vidaBarra.classList.remove('media', 'baja');
      if (clase) e.vidaBarra.classList.add(clase);
      this._hud.vidaClase = clase;
    }
    const txt = Math.max(0, Math.round(hp)) + ' / ' + Math.round(maxHp);
    if (this._hud.vidaTxt !== txt && e.vidaTxt) { e.vidaTxt.textContent = txt; this._hud.vidaTxt = txt; }
  }

  _pintarSuperHUD(carga) {
    const e = this.el;
    if (!e) return;
    const c = Math.max(0, Math.min(1, carga));
    const k = Math.round(c * 50);
    if (this._hud.super === k) return;
    this._hud.super = k;
    const lista = c >= 1;
    if (e.superRelleno) e.superRelleno.style.width = (c * 100) + '%';
    if (e.superBarra) e.superBarra.classList.toggle('lista', lista);
    if (e.superTexto) e.superTexto.textContent = lista ? 'SUPER READY' : 'SUPER';
    if (e.superAnillo) e.superAnillo.style.strokeDashoffset = String(176 * (1 - c));
    if (e.superBtn) { e.superBtn.classList.toggle('listo', lista); e.superBtn.disabled = !lista; }
  }

  _pintarMunicionHUD(m) {
    const cont = this.el && this.el.municionHud;
    if (!cont || !cont.children) return;
    const clave = Math.round(m * 20);
    if (this._hud.municion === clave) return;
    this._hud.municion = clave;
    for (let i = 0; i < cont.children.length; i++) {
      const c = Math.max(0, Math.min(1, m - i));
      const n = cont.children[i];
      n.style.setProperty('--carga', String(c));
      n.classList.toggle('llena', c >= 1);
    }
  }

  aviso(texto, op) {
    const el = this.el && this.el.aviso;
    if (!el) return;
    op = op || {};
    el.textContent = texto;
    el.classList.remove('hidden', 'pop', 'oro', 'peque', 'malo');
    if (op.oro) el.classList.add('oro');
    if (op.peque) el.classList.add('peque');
    if (op.malo) el.classList.add('malo');
    void el.offsetWidth;                       // reinicia la animación
    if (!this._reducedMotion) el.classList.add('pop');
    if (this._plazoAviso) window.clearTimeout(this._plazoAviso);
    this._plazoAviso = this._reloj(op.ms || 1100, () => { el.classList.add('hidden'); });
  }

  /** Quién ha tumbado a quién: nombres con textContent, el icono del KO en medio. */
  alFeed(asesino, victima) {
    const f = this.el && this.el.feed;
    if (!f) return;
    const li = document.createElement('li');
    const nombre = (v) => {
      const s = document.createElement('span');
      s.className = v && v.yo ? 'yo' : 'rival';
      s.textContent = v ? String(v.datos.petName || 'Pet').slice(0, 16) : '?';
      return s;
    };
    if (asesino) {
      li.appendChild(nombre(asesino));
      const img = document.createElement('img');
      img.src = BattleScene.ICONOS + 'ko.png'; img.alt = 'knocked out';
      li.appendChild(img);
      li.appendChild(nombre(victima));
    } else {
      const img = document.createElement('img');
      img.src = BattleScene.ICONOS + 'gas.png'; img.alt = '';
      li.appendChild(nombre(victima));
      li.appendChild(img);
      const t = document.createElement('span');
      t.textContent = 'is out';
      li.appendChild(t);
    }
    f.appendChild(li);
    while (f.children.length > 4) f.removeChild(f.firstChild);
    this._reloj(5200, () => { li.classList.add('sale'); this._reloj(420, () => li.remove()); });
  }

  /**
   * RENDIRSE, EN DOS PULSACIONES. En combate gasta una de las batallas del
   * día, así que no puede irse en un roce; pero tampoco puede esconderse
   * detrás de una ventana modal (si algo falla mientras se pinta, el jugador
   * se queda encerrado). El propio botón pide la confirmación.
   */
  pedirRendicion(boton) {
    if (this.estado !== 'combate' && this.estado !== 'cuenta') { this._cancelarConfirmacion(); this.rendirse(); return; }
    if (this._confirmandoRendicion) { this._cancelarConfirmacion(); this.rendirse(); return; }
    this._confirmandoRendicion = true;
    if (boton) {
      boton.classList.add('confirmar');
      const t = boton.querySelector ? boton.querySelector('.ga-redondo-txt') : null;
      (t || boton).textContent = 'Confirm?';
    }
    if (this._plazoConfirmar) window.clearTimeout(this._plazoConfirmar);
    this._plazoConfirmar = this._reloj(3500, () => this._cancelarConfirmacion());
  }

  _cancelarConfirmacion() {
    if (this._plazoConfirmar) { window.clearTimeout(this._plazoConfirmar); this._plazoConfirmar = null; }
    this._confirmandoRendicion = false;
    const botones = (this._botonesRendirse || []).slice();
    if (this.el && this.el.salir && botones.indexOf(this.el.salir) < 0) botones.push(this.el.salir);
    const texto = (this.estado === 'fin' || this.estado === 'caido') ? 'Back to map' : 'Surrender';
    botones.forEach((b) => {
      if (!b || !b.classList) return;
      b.classList.remove('confirmar');
      const t = b.querySelector ? b.querySelector('.ga-redondo-txt') : null;
      (t || b).textContent = texto;
    });
  }

  _escucharDOM(target, event, callback, opciones) {
    if (!target) return;
    target.addEventListener(event, callback, opciones);
    (this._domBindings = this._domBindings || []).push([target, event, callback, opciones]);
  }

  _soltarDOM() {
    (this._domBindings || []).forEach(([t, ev, cb, op]) => {
      try { t.removeEventListener(ev, cb, op); } catch (e) { /* ya no existe */ }
    });
    this._domBindings = [];
  }

  /** setTimeout que se cancela solo al limpiar la escena. */
  _reloj(ms, fn) {
    const run = this._battleRun;
    const id = window.setTimeout(() => {
      if (this._relojes) this._relojes.delete(id);
      if (this._battleRun !== run) return;
      try { fn(); } catch (e) { console.error('BattleScene reloj:', e); }
    }, Math.max(0, ms || 0));
    (this._relojes = this._relojes || new Set()).add(id);
    return id;
  }

  _pararRelojes() {
    if (this._relojes) this._relojes.forEach((id) => window.clearTimeout(id));
    this._relojes = new Set();
  }

  // =========================================================================
  // CONTROLES
  // =========================================================================
  montarControles() {
    const e = this.el || {};
    const fino = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    const grueso = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this._ponerTactil(!!(grueso || (!fino && (navigator.maxTouchPoints || 0) > 0)));

    // ── Teclado (en window: Phaser comparte el teclado con el resto del juego) ──
    const esCampo = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    this._escucharDOM(window, 'keydown', (ev) => {
      if (this._cleaned || esCampo(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.code || ev.key;
      if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(k)) {
        this.teclas[k] = true;
        if (this.estado === 'combate' || this.estado === 'cuenta') ev.preventDefault();
      } else if (k === 'Space') {
        ev.preventDefault();
        if (!ev.repeat) this.dispararAuto(false);
      } else if (k === 'KeyE' || k === 'KeyQ') {
        if (!ev.repeat) {
          if (this.apunte.raton) this.disparar(true, this.apunte.ang);
          else this.dispararAuto(true);
        }
      } else if (k === 'Escape') {
        this._cancelarConfirmacion();
      }
    });
    this._escucharDOM(window, 'keyup', (ev) => {
      const k = ev.code || ev.key;
      if (this.teclas[k]) this.teclas[k] = false;
    });
    // Al perder el foco (alt-tab) se sueltan todas: si no, el perro seguiría
    // andando solo hacia donde iba al cambiar de ventana.
    this._escucharDOM(window, 'blur', () => { this.teclas = {}; this.disparoMantenido = false; });

    // ── Ratón (sobre el lienzo, con Phaser) ──
    this._alMoverRaton = (p) => {
      if (p.wasTouch || p.pointerType === 'touch') return;
      this.apunte.raton = true;
      this.apunte.ratonEn = performance.now();
      this.apunte.ratonX = p.worldX; this.apunte.ratonY = p.worldY;
    };
    this._alPulsarRaton = (p) => {
      if (p.wasTouch || p.pointerType === 'touch') { this._ponerTactil(true); return; }
      this._alMoverRaton(p);
      if (p.rightButtonDown && p.rightButtonDown()) { this.disparar(true, this.apunte.ang); return; }
      this.disparoMantenido = true;
      this.disparar(false, this.apunte.ang);
    };
    this._alSoltarRaton = (p) => {
      if (p.wasTouch || p.pointerType === 'touch') return;
      if (!(p.leftButtonDown && p.leftButtonDown())) this.disparoMantenido = false;
    };
    this.input.on('pointermove', this._alMoverRaton);
    this.input.on('pointerdown', this._alPulsarRaton);
    this.input.on('pointerup', this._alSoltarRaton);
    const lienzo = this.game.canvas;
    this._escucharDOM(lienzo, 'contextmenu', (ev) => { if (!this._cleaned) ev.preventDefault(); });
    this._escucharDOM(lienzo, 'pointerleave', () => { this.apunte.raton = false; this.disparoMantenido = false; });

    // ── Mandos táctiles (DOM) ──
    this._montarStick(e.zonaMover, e.stickMover, {
      mover: (dx, dy) => { this.movTactil.x = dx; this.movTactil.y = dy; },
      soltar: () => { this.movTactil.x = 0; this.movTactil.y = 0; }
    });
    const disparoTactil = (sup) => ({
      empezar: () => { this.apunte.sup = sup; this.apunte.mostrar = false; },
      mover: (dx, dy, largo) => {
        if (largo > 0.22) { this.apunte.ang = Math.atan2(dy, dx); this.apunte.mostrar = true; this.apunte.tactil = true; }
        else this.apunte.mostrar = false;
      },
      soltar: (dx, dy, largo) => {
        const manual = largo > 0.22;
        this.apunte.mostrar = false; this.apunte.tactil = false;
        if (manual) this.disparar(sup, Math.atan2(dy, dx));
        else this.dispararAuto(sup);
      }
    });
    this._montarStick(e.zonaDisparo, e.stickDisparo, disparoTactil(false));
    this._montarStick(e.superBtn, e.stickDisparo, Object.assign(disparoTactil(true), { fijo: true }));
  }

  _ponerTactil(si) {
    this._tactil = !!si;
    if (this.ui) this.ui.classList.toggle('tactil', this._tactil);
  }

  /**
   * Un joystick que aparece donde pones el dedo. `zona` recibe el toque y
   * `stick` es el dibujo. Con `fijo` (el botón del súper) el centro es el
   * propio botón. Captura el puntero: si el dedo sale de la zona, sigue.
   */
  _montarStick(zona, stick, fns) {
    if (!zona || !stick) return;
    const RADIO = 52;
    let id = null, cx = 0, cy = 0, dx = 0, dy = 0;
    const pomo = stick.querySelector('i');
    const colocar = () => {
      const r = zona.getBoundingClientRect();
      if (!fns.fijo) { stick.style.left = (cx - r.left) + 'px'; stick.style.top = (cy - r.top) + 'px'; }
      if (pomo) pomo.style.transform = 'translate(' + (dx * RADIO) + 'px,' + (dy * RADIO) + 'px)';
    };
    this._escucharDOM(zona, 'pointerdown', (ev) => {
      if (id !== null || this._cleaned) return;
      if (ev.pointerType === 'touch') this._ponerTactil(true);
      if (fns.fijo && zona.disabled) return;
      ev.preventDefault();
      id = ev.pointerId;
      try { zona.setPointerCapture(id); } catch (e) {}
      if (fns.fijo) {
        const r = zona.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        const zr = this.el.zonaDisparo && this.el.zonaDisparo.getBoundingClientRect();
        if (zr) { stick.style.left = (cx - zr.left) + 'px'; stick.style.top = (cy - zr.top) + 'px'; }
        stick.classList.add('super');
      } else { cx = ev.clientX; cy = ev.clientY; }
      dx = 0; dy = 0;
      stick.classList.add('activo');
      colocar();
      if (fns.empezar) fns.empezar();
    });
    this._escucharDOM(zona, 'pointermove', (ev) => {
      if (ev.pointerId !== id) return;
      ev.preventDefault();
      let x = (ev.clientX - cx) / RADIO, y = (ev.clientY - cy) / RADIO;
      const l = Math.sqrt(x * x + y * y);
      if (l > 1) { x /= l; y /= l; }
      dx = x; dy = y;
      colocar();
      if (fns.mover) fns.mover(dx, dy, Math.min(1, l));
    });
    const acabar = (ev) => {
      if (ev.pointerId !== id) return;
      const largo = Math.sqrt(dx * dx + dy * dy);
      const fx = dx, fy = dy;
      id = null; dx = 0; dy = 0;
      stick.classList.remove('activo', 'super');
      stick.style.left = ''; stick.style.top = '';      // vuelve a su sitio de reposo
      if (pomo) pomo.style.transform = '';
      if (fns.soltar) fns.soltar(fx, fy, largo);
    };
    this._escucharDOM(zona, 'pointerup', acabar);
    this._escucharDOM(zona, 'pointercancel', acabar);
  }

  /** El vector de movimiento que se pide ahora mismo (teclado o joystick). */
  _movimiento() {
    const t = this.teclas;
    let x = (t.KeyD || t.ArrowRight ? 1 : 0) - (t.KeyA || t.ArrowLeft ? 1 : 0);
    let y = (t.KeyS || t.ArrowDown ? 1 : 0) - (t.KeyW || t.ArrowUp ? 1 : 0);
    if (!x && !y) { x = this.movTactil.x; y = this.movTactil.y; }
    const l = Math.sqrt(x * x + y * y);
    if (l < 0.2) return { x: 0, y: 0 };
    return { x: x / l, y: y / l };          // a toda velocidad en cuanto se inclina
  }

  // =========================================================================
  // SOCKET
  // =========================================================================
  on(evento, manejador) {
    const run = this._battleRun;
    const guardado = (data) => {
      if (this._cleaned || this._battleRun !== run) return;
      if (data && data.matchId && this.matchId && data.matchId !== this.matchId) return;
      try { manejador(data || {}); } catch (e) { console.error('BattleScene ' + evento + ':', e); }
    };
    this.socket.on(evento, guardado);
    this._listeners.push([evento, guardado]);
  }

  _soltarSocket() {
    if (this.socket && this._listeners) {
      this._listeners.forEach(([ev, fn]) => { try { this.socket.off(ev, fn); } catch (e) {} });
    }
    this._listeners = [];
    if (this.socket && this._alConectar) { try { this.socket.off('connect', this._alConectar); } catch (e) {} this._alConectar = null; }
  }

  _emitir(ev, datos) {
    try { if (this.socket && this.socket.connected) this.socket.emit(ev, datos); } catch (e) {}
  }

  arrancarBusqueda() {
    if (this._buscandoIniciado || this._cleaned) return;
    this._buscandoIniciado = true;
    this.registrarSocket();
    this._pedirPartida();
    // Cronómetro de la búsqueda, con el reloj del navegador.
    const t0 = Date.now();
    const tic = () => {
      if (this.estado !== 'buscando' || !this.el || !this.el.busqTiempo) return;
      const s = Math.floor((Date.now() - t0) / 1000);
      this.el.busqTiempo.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      this._reloj(500, tic);
    };
    tic();
  }

  _pedirPartida() {
    if (this._cleaned || this.estado !== 'buscando') return;
    if (this.modo === 'pvp' && this._colaAgotada) return;
    if (!this._busquedaDesde) this._busquedaDesde = Date.now();
    const ev = this.modo === 'bot' ? 'brawl:bot' : (this.modo === 'practica' ? 'brawl:practica' : 'brawl:cola');
    this._emitir(ev);
    /* VIGILANTE. Si la petición se pierde (el socket se reconecta justo en
       medio), se repite una vez; si aun así no llega nada, se avisa y se
       vuelve al mapa en vez de dejar al jugador mirando un "buscando…" eterno. */
    const run = this._battleRun;
    this._intentoPeticion = (this._intentoPeticion || 0) + 1;
    const intentoDe = this._intentoPeticion;
    this._reloj(10000, () => {
      if (this._battleRun !== run || this.estado !== 'buscando' || this._respuestaCola || this.matchId) return;
      if (intentoDe !== this._intentoPeticion) return;
      console.warn('⏳ La arena no contestó; se repite la petición');
      this._reintentado = true;
      this._emitir(ev);
      this._reloj(20000, () => {
        if (this._battleRun !== run || this.estado !== 'buscando' || this._respuestaCola || this.matchId) return;
        if (intentoDe !== this._intentoPeticion) return;
        // Cancela también una admisión que todavía esté esperando a Mongo.
        this._emitir('brawl:salirCola');
        this._emitir('brawl:salir');
        this.estadoBusqueda('Could not start the battle', 'The server did not answer. Back to the map…');
        this.estado = 'fin';
        this.volverEnBreve(2600);
      });
    });
    // Red de seguridad del PvP: el servidor lanza la sala mucho antes (45 s
    // como mucho); si a los 170 s seguimos buscando, se le vuelve a pedir.
    if (this.modo === 'pvp' && !this._pvpDeadlineScheduled) {
      this._pvpDeadlineScheduled = true;
      this._reloj(170000, () => {
        if (this._battleRun !== run || this.estado !== 'buscando' || this.matchId || this.modo !== 'pvp') return;
        this.estadoBusqueda('Preparing the arena…', 'Waiting for the server to fill the empty places with bots.');
        this._emitir('brawl:cola');
      });
    }
  }

  pasarAPractica() {
    if (this.estado !== 'buscando') return;
    this._aceptaPractica = true;
    this.modo = 'practica';
    this._respuestaCola = false;
    this._busquedaDesde = Date.now();
    if (this.el && this.el.practicar) this.el.practicar.classList.add('hidden');
    if (this.el && this.el.modo) this.el.modo.textContent = 'Practice';
    if (this.el && this.el.sala) this.el.sala.textContent = '';
    if (this.el && this.el.lobby) { this.el.lobby.textContent = ''; this.el.lobby.classList.add('hidden'); }
    this._listo = false;
    this._pintarBotonListo(false);
    this.estadoBusqueda('Preparing practice…', 'You against 3 bots. No points, just training.');
    this._pedirPartida();
  }

  registrarSocket() {
    this.on('brawl:enCola', (d) => {
      this._respuestaCola = true;
      if (this.estado !== 'buscando' || this.modo !== 'pvp') return;
      this.estadoBusqueda('Searching for players…', 'Be the last pet standing. 2 to 6 players; empty places are filled with bots.');
      if (Number.isFinite(d.empiezaEnMs)) this._busquedaTerminaEn = Date.now() + d.empiezaEnMs;
      this._jugadoresBuscando = Number(d.enCola) || 1;
    });
    this.on('brawl:sala', (d) => {
      this._respuestaCola = true;
      if (this.estado !== 'buscando' || this.modo !== 'pvp') return;
      const n = Number(d.jugadores) || 1;
      this._busquedaTerminaEn = Date.now() + (Number(d.empiezaEnMs) || 0);
      this._jugadoresBuscando = n;
      this.estadoBusqueda(n > 1 ? 'Players found!' : 'Waiting for players…',
        n > 1 ? 'Press Ready when you are set. When everyone here is ready the battle starts at once; empty places are filled with bots.'
              : 'Players who search now join you here. Press Ready and the battle starts in a few seconds, with bots in the empty places.');
      this._pintarSala(d);
    });
    this.on('brawl:fueraCola', () => {});
    this.on('brawl:inicio', (d) => this.montarPartida(d));
    this.on('brawl:ya', () => this.empezarCombate());
    this.on('brawl:snap', (d) => this.alSnap(d));
    this.on('brawl:balas', (d) => this.alBalas(d));
    this.on('brawl:golpe', (d) => this.alGolpe(d));
    this.on('brawl:caja', (d) => this.alCaja(d));
    this.on('brawl:objeto', (d) => this.alObjeto(d));
    this.on('brawl:recoger', (d) => this.alRecoger(d));
    this.on('brawl:boom', (d) => this.alBoom(d));
    this.on('brawl:ko', (d) => this.alKO(d));
    this.on('brawl:fin', (d) => this.mostrarResultado(d));
    this.on('brawl:error', (d) => {
      /* Tras repetir la petición, "ya estás en una batalla" casi siempre es la
         PRIMERA petición, que sigue en marcha (el servidor tardó). Irse ahora
         dejaría esa partida empezando sin nadie (y gastaría una diaria). */
      if (d.error === 'already_in_battle' && this._reintentado && this.estado === 'buscando') {
        this._reintentado = false;
        return;
      }
      this._respuestaCola = true;
      let msg = 'Could not start the battle.';
      if (d.error === 'not_authenticated') msg = 'You must be logged in to battle.';
      if (d.error === 'name_required') msg = 'Choose your character name first to battle.';
      else if (d.error === 'already_in_battle') msg = 'You are already in a battle (maybe in another tab).';
      else if (d.error === 'daily_limit') {
        const ms = Number(d.daily && d.daily.resetsInMs) || 0;
        msg = 'You already played your ' + ((d.daily && d.daily.max) || 5) + ' daily battles.' + (ms > 0 ? ' Back in ' + BattleScene.duracion(ms) + '.' : '');
      }
      if (this.estado === 'buscando') this.estadoBusqueda('Oops', msg + ' Back to the map…');
      else this.aviso(msg, { peque: true, ms: 3000 });
      this.estado = 'fin';
      this._cancelarConfirmacion();
      this.volverEnBreve(3200);
    });
    /* SI SE CAE LA CONEXIÓN A MITAD, NO SE PIERDE LA PARTIDA. El servidor
       guarda tu perro un minuto con un piloto automático (BRAWL_GRACIA_MS).
       Socket.IO reconecta solo; en cuanto vuelve, se pide la partida
       ('brawl:volver') y llega un brawl:inicio con `reanudar`. */
    this.on('disconnect', () => {
      if (this.estado === 'buscando') {
        this._respuestaCola = false;
        ++this._intentoPeticion;
        this.estadoBusqueda('Reconnecting…', 'Your search will resume when the connection returns.');
        const intento = this._intentoPeticion;
        this._reloj(30000, () => {
          if (this.estado !== 'buscando' || this.matchId || this.socket.connected || intento !== this._intentoPeticion) return;
          this.estado = 'fin';
          this.estadoBusqueda('No connection', 'Could not reach the server. Back to the map…');
          this.volverEnBreve(2000);
        });
      }
      if (!this.matchId || this.estado === 'fin') return;
      if (!this._sinRedDesde) this._sinRedDesde = performance.now();
      this._pintarRed(true);
    });
    this.on('connect', () => {
      if (this.estado === 'buscando' && !this.matchId) {
        this._respuestaCola = false;
        this._pedirPartida();
      } else this._pedirVolver();
    });
    this.on('brawl:volverError', (d) => {
      if (!this.matchId || this.estado === 'fin') return;
      this._pintarRed(false);
      this.estado = 'fin';
      this._cancelarConfirmacion();
      this.aviso(d && d.error === 'ended' ? 'The battle ended while you were away' : 'Could not rejoin the battle, back to the map',
                 { peque: true, ms: 2600 });
      this.volverEnBreve(2600);
    });
  }

  /** "2h 05m", "12m", "45s": lo que falta, para las diarias. */
  static duracion(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm';
    return s + 's';
  }

  /** Recién (re)conectado en plena partida: pedirla otra vez. */
  _pedirVolver() {
    if (!this.matchId || this.estado === 'fin' || this.estado === 'buscando') return;
    if (!this.socket || !this.socket.connected) return;
    if (this._pidioVolverEn && performance.now() - this._pidioVolverEn < 2000) return;
    this._pidioVolverEn = performance.now();
    this._emitir('brawl:volver', { matchId: this.matchId });
  }

  /** El cartel de "se ha ido la conexión" (no tapa la partida). */
  _pintarRed(sinRed) {
    const n = this.el && this.el.red;
    if (!n) return;
    if (this._hud.red === sinRed) return;
    this._hud.red = sinRed;
    n.classList.toggle('hidden', !sinRed);
  }

  // =========================================================================
  // LA PARTIDA
  // =========================================================================
  montarPartida(d) {
    if (!d || !d.matchId || !d.arena || !Array.isArray(d.luchadores)) return;
    if (this.matchId) {
      // Ya estamos en una: si es la MISMA y viene con `reanudar`, es que se
      // cortó la red (o se pidió el estado) y el servidor la manda tal y como va.
      if (d.reanudar && d.matchId === this.matchId) this.reanudarPartida(d);
      return;
    }
    const modoRecibido = d.modo === 'bot' ? 'bot' : (d.modo === 'practica' ? 'practica' : 'pvp');
    if (modoRecibido !== this.modo && !(modoRecibido === 'practica' && this._aceptaPractica)) {
      console.warn('⚠️ Se ignora una partida "' + modoRecibido + '": se pidió "' + this.modo + '"');
      return;
    }
    const M = window.GFBrawlMotor;
    if (!M) { console.error('❌ Falta gf-brawl-motor.js'); this.rendirse(); return; }

    this.modo = modoRecibido;
    this.matchId = d.matchId;
    this.partida = d;
    this.yoId = d.yo;
    this.armas = d.armas || {};
    this.R = M.crearRejilla(d.arena);
    // Las cajas, como las cuenta el servidor (por si alguna llega ya tocada).
    const vivas = new Set();
    (d.arena.cajas || []).forEach(([i, vida, max]) => {
      vivas.add(i);
      if (this.R.cajas[i]) { this.R.cajas[i].vida = vida; this.R.cajas[i].max = max; }
    });
    Object.keys(this.R.cajas).forEach((k) => { if (!vivas.has(Number(k))) M.romperCaja(this.R, Number(k)); });

    // La arena de la partida (el suelo de la espera se aprovecha si es la misma).
    this.quitarFondoDeEspera();
    this.arena = this.construirArena(d.arena.id, this.R, d.arena.tema);

    this._ajustarZoom();
    d.luchadores.forEach((l) => this.crearVista(l));
    const yo = this.vistas.get(this.yoId);
    if (yo) {
      this.pred = { x: yo.x, y: yo.y };
      this._centrarCamara(yo.x, yo.y - 8);
      this._pintarVidaHUD(yo.hp, yo.maxHp);
      if (this.el && this.el.nivel) this.el.nivel.textContent = 'Lv ' + (yo.datos.nivel || 1);
      if (this.el && this.el.nombre) this.el.nombre.textContent = yo.datos.petName || 'Your pet';
    }
    // Los animales, a por sus sprites (mientras, se ven como perro).
    const run = this._battleRun;
    new Set(d.luchadores.map((l) => l.especie)).forEach((esp) => {
      this.cargarEspecie(esp).then(() => {
        if (this._cleaned || this._battleRun !== run) return;
        this.vistas.forEach((v) => { if (v.especie === esp && v.vivo) this._vestir(v); });
      });
    });

    this._ponerGas(d.gas);
    this._ponerObjetos(d.objetos);
    // Los que ya habían caído (si se entra a mitad: reconexión).
    d.luchadores.forEach((l) => {
      const v = this.vistas.get(l.id);
      if (v && l.vivo === false && v.vivo) { v.vivo = false; v.hp = 0; this._caer(v, false); }
    });
    this.quedan = d.luchadores.filter((l) => l.vivo !== false).length;
    if (this.el && this.el.quedan) this.el.quedan.textContent = String(this.quedan);
    if (this.el && this.el.busqueda) this.el.busqueda.classList.add('hidden');
    const rival = d.luchadores.find((l) => l.id !== this.yoId);
    if (this.el && this.el.modo) {
      const nombreArena = d.arena.nombre ? ' · ' + d.arena.nombre : '';
      this.el.modo.textContent = this.modo === 'bot'
        ? 'Daily ' + (d.ronda || '') + '/5' + (rival ? ' · vs ' + (rival.etiqueta || rival.petName) : '')
        : (this.modo === 'practica' ? 'Practice' : 'Arena PvP') + nombreArena;
    }
    if (this.ui) this.ui.classList.remove('buscando');

    // Entrando a mitad (la página se recargó con la partida en marcha): sin
    // cuenta atrás, directo al combate.
    if (d.reanudar && d.fase === 'combate') {
      this._cancelarConfirmacion();
      this._empezarYa(Number(d.enCombateMs) || 0);
      return;
    }

    // La cuenta atrás, con el reloj del navegador.
    this.estado = 'cuenta';
    this._cancelarConfirmacion();
    const cuenta = Math.max(0, Number(d.cuentaMs) || 0);
    const pasos = Math.floor(cuenta / 1000);
    for (let i = 0; i < pasos; i++) {
      const n = pasos - i;
      this._reloj(cuenta - n * 1000, () => {
        if (this.estado === 'cuenta') { this.aviso(String(n), { ms: 900 }); this._sonar('cuenta'); }
      });
    }
    // Por si 'brawl:ya' se pierde o llega tarde: el combate empieza igual.
    this._reloj(cuenta + 1500, () => { if (this.estado === 'cuenta') this.empezarCombate(); });
  }

  empezarCombate() {
    if (this.estado !== 'cuenta') return;
    this.estado = 'combate';
    this.tCombateLocal = performance.now();
    this._ultimoSnap = this.tCombateLocal;
    this._teclasHasta = this.tCombateLocal + 14000;
    this.aviso('FIGHT!', { oro: true, ms: 900 });
    this._sonar('ya');
    this._cancelarConfirmacion();
  }

  /** Al combate sin cuenta atrás, `enCombateMs` después de que empezara. */
  _empezarYa(enCombateMs) {
    const yo = this.vistas.get(this.yoId);
    this.estado = yo && yo.vivo ? 'combate' : 'caido';
    this.tCombateLocal = performance.now() - Math.max(0, enCombateMs || 0);
    this._ultimoSnap = performance.now();
    this._teclasHasta = 0;
    const g = this.gas;
    if (g && enCombateMs >= g.inicioMs - 5000) this._avisosGas.previo = true;
    if (g && enCombateMs >= g.inicioMs) this._avisosGas.empieza = true;
  }

  /** Lo que se sabe del gas al empezar (o al volver). */
  _ponerGas(g) {
    if (!g || !this.R) { this.gas = null; return; }
    const R = this.R;
    const nuevo = !this.gas;
    this.gas = {
      d: Number(g.d) || 0, dObj: Number(g.d) || 0, estado: Number(g.estado) || 0, vel: Number(g.vel) || 3.6,
      max: Number(g.max) || 0, inicioMs: Number(g.inicioMs) || 30000, maxMs: Number(g.maxMs) || 210000,
      x0: Number.isFinite(g.x0) ? g.x0 : R.juego.x0, y0: Number.isFinite(g.y0) ? g.y0 : R.juego.y0,
      x1: Number.isFinite(g.x1) ? g.x1 : R.juego.x1, y1: Number.isFinite(g.y1) ? g.y1 : R.juego.y1
    };
    this._gasPintado = -1;
    if (nuevo || !this.gasBandas) this._crearGas();
  }

  /* EL GAS SE VE ENTRAR. Cuatro bandas de una loseta de nubes verdes (pocas
     y grandes: nada de burbujas) que crecen desde los bordes, por ENCIMA de
     todo (a quien está dentro se le ve a través) y un filo claro donde
     acaban. Nada se marca antes de que empiece. */
  _crearGas() {
    const A = window.GFBatallaArte;
    const clave = A && this.textures.exists(A.pieza('x_gas')) ? A.pieza('x_gas') : null;
    if (this.gasBandas) this.gasBandas.forEach((b) => { try { b.destroy(); } catch (e) {} });
    this.gasBandas = [0, 1, 2, 3].map(() => {
      const b = clave ? this.add.tileSprite(0, 0, 2, 2, clave) : this.add.rectangle(0, 0, 2, 2, 0x5aa84a);
      return b.setOrigin(0, 0).setDepth(44000).setAlpha(0).setVisible(false);
    });
  }

  /** Lo que hay en el suelo al entrar (huesos, carne, suministros). */
  _ponerObjetos(lista) {
    this.objetosVista.forEach((h) => this._quitarObjeto(h));
    this.objetosVista.clear();
    (lista || []).forEach((o) => this._crearObjeto({ id: o[0], x: o[1], y: o[2], tipo: o[3] }, false));
  }

  /**
   * VUELVE LA CONEXIÓN a mitad de partida (o se ha pedido el estado). Se pone
   * al día lo que haya cambiado —cajas rotas, quién ha caído, dónde está cada
   * uno, lo del suelo, el gas— y se sigue jugando.
   */
  reanudarPartida(d) {
    const M = window.GFBrawlMotor;
    if (!M || !this.R || !this.arena) return;
    this._sacarDiferidos(Infinity);
    const vivas = new Set((d.arena.cajas || []).map((c) => c[0]));
    Object.keys(this.R.cajas).forEach((k) => {
      const i = Number(k);
      if (vivas.has(i)) return;
      M.romperCaja(this.R, i);
      const c = this.arena.cajas.get(i);
      if (c && !c.rota) this._cajaRota(i, c, false);
    });
    d.luchadores.forEach((l) => {
      const v = this.vistas.get(l.id);
      if (!v) return;
      v.hp = l.hp; v.maxHp = l.maxHp; v.potencia = l.potencia || 0;
      if (l.vivo === false) { v.hp = 0; if (v.vivo) { v.vivo = false; this._caer(v, false); } return; }
      v.buffer.length = 0;
      if (Number.isFinite(l.x) && Number.isFinite(l.y)) {
        v.x = l.x; v.y = l.y; v.oculto = false;
        if (v.yo) {
          this.pred = { x: l.x, y: l.y };
          this.desvio.x = 0; this.desvio.y = 0;
          this._pintarVidaHUD(v.hp, v.maxHp);
        }
      } else if (!v.yo) v.oculto = true;
    });
    this.quedan = d.luchadores.filter((l) => l.vivo !== false).length;
    if (this.el && this.el.quedan) this.el.quedan.textContent = String(this.quedan);
    this._ponerGas(d.gas);
    this._ponerObjetos(d.objetos);
    this.balasVista.forEach((b) => this._quitarBala(b, false));
    this.balasVista = [];
    if (d.fase === 'combate') this._empezarYa(Number(d.enCombateMs) || 0);
    const yaHabiaRed = !!this._sinRedDesde;
    this._sinRedDesde = 0;
    this._pidioVolverEn = 0;
    this._ultimoSnap = performance.now();
    this._pintarRed(false);
    if (yaHabiaRed) this.aviso('Reconnected!', { peque: true, ms: 1400 });
  }

  /* LA HORA DEL SERVIDOR. Cada instantánea trae la suya (`t`). La diferencia
     entre cuándo llega y esa hora es el desfase de relojes MÁS lo que tardó
     la red; la más pequeña de las últimas es la mejor estimación del desfase
     (la que menos esperó). Con eso cada muestra se coloca en su momento, por
     muy a trompicones que lleguen. */
  _medirReloj(ahora, ts) {
    const o = ahora - ts;
    this._offsets.push(o);
    if (this._offsets.length > 60) this._offsets.shift();
    let min = Infinity;
    for (let i = 0; i < this._offsets.length; i++) if (this._offsets[i] < min) min = this._offsets[i];
    this._offset = min;
  }

  alSnap(d) {
    if (!this.matchId || !Array.isArray(d.f)) return;
    const ahora = performance.now();
    this._ultimoSnap = ahora;
    const ts = Number(d.t);
    if (!Number.isFinite(ts)) return;
    this._medirReloj(ahora, ts);
    // El gas: [px que ha entrado, estado].
    if (Array.isArray(d.z) && this.gas) {
      const dz = Number(d.z[0]);
      if (Number.isFinite(dz)) this.gas.dObj = dz;
      const est = Number(d.z[1]);
      if (est !== this.gas.estado) {
        if (est === 1) this._alEntrarGas();
        if (est === 2 && this.estado === 'combate') this.aviso('Final zone!', { peque: true, ms: 2000 });
        this.gas.estado = est;
      }
    }
    const vistos = new Set();
    for (let i = 0; i < d.f.length; i++) {
      const f = d.f[i];
      const v = this.vistas.get(f[0]);
      if (!v) continue;
      vistos.add(f[0]);
      v.buffer.push({ ts, x: f[1], y: f[2], hp: f[3], band: f[4], pot: f[5] || 0, maxHp: f[6] || v.maxHp, cara: Number.isFinite(f[7]) ? f[7] : null });
      if (v.buffer.length > 40) v.buffer.splice(0, v.buffer.length - 40);
    }
    // Los que no vienen están escondidos (en la hierba, lejos de ti) o caídos.
    this.vistas.forEach((v, id) => {
      if (!v.vivo || vistos.has(id)) return;
      const u = v.buffer[v.buffer.length - 1];
      if (!u || !u.oculto) v.buffer.push({ ts, oculto: true });
    });

    const y = d.y;
    if (y) {
      // Lo que se gastó aquí hace nada todavía no lo sabe el servidor.
      const m = (Number(y.m) || 0) / 100, s = (Number(y.s) || 0) / 100;
      this.municion = ahora - this.ultimoDisparoLocal < 350 ? Math.min(this.municion, m) : m;
      this.superCarga = ahora - this.ultimoSuperLocal < 350 ? Math.min(this.superCarga, s) : s;
      const yo = this.vistas.get(this.yoId);
      if (yo && Number(y.v) > 0) yo.datos.vel = Number(y.v);
      this._escudoYo = Number(y.e) || 0;
      this._poderesHUD(Number(y.ed) || 0, Number(y.r) || 0);
      if (Number(y.c) > this.cAplicada) {
        if (y.x != null && y.y != null) this._recolocar(Number(y.x), Number(y.y));
        this.cAplicada = Number(y.c);
      }
    }
    this._pintarSuperHUD(this.superCarga);
  }

  /** El escudo y la carrera que llevas, con lo que les queda. */
  _poderesHUD(escudoMs, rapidezMs) {
    const e = this.el;
    if (!e) return;
    const pon = (n, ms) => {
      if (!n) return;
      const vis = ms > 0;
      n.classList.toggle('hidden', !vis);
      const b = n.querySelector ? n.querySelector('b') : null;
      if (vis && b) { const t = Math.ceil(ms / 1000) + 's'; if (b.textContent !== t) b.textContent = t; }
    };
    pon(e.escudo, escudoMs);
    pon(e.rapidez, rapidezMs);
  }

  /** El servidor dice que tu perro está en otro sitio: se recoloca, suave. */
  _recolocar(x, y) {
    if (!this.pred) return;
    const dx = this.pred.x - x, dy = this.pred.y - y;
    if (Math.abs(dx) > 64 || Math.abs(dy) > 64) { this.desvio.x = 0; this.desvio.y = 0; }
    else { this.desvio.x += dx; this.desvio.y += dy; }
    this.pred.x = x; this.pred.y = y;
    this.envioX = NaN;          // que la próxima entrada salga ya, con la c nueva
  }

  // ── Lo de los demás, en su momento ───────────────────────────────────────
  /** Se aplica dentro de RETRASO_INTERP ms: cuando se ve pasar (ver la cabecera). */
  _diferir(fn) {
    if (document.hidden) { try { fn(); } catch (e) { console.error('BattleScene diferido:', e); } return; }
    this._diferidos.push({ t: performance.now() + BattleScene.RETRASO_INTERP, fn });
    if (this._diferidos.length > 300) this._sacarDiferidos(Infinity);
  }

  _sacarDiferidos(hasta) {
    const q = this._diferidos;
    while (q.length && q[0].t <= hasta) {
      const e = q.shift();
      try { e.fn(); } catch (err) { console.error('BattleScene diferido:', err); }
    }
  }

  // ── Disparos ──────────────────────────────────────────────────────────────
  _armaMia(sup) {
    const yo = this.vistas.get(this.yoId);
    if (!yo || !this.armas) return null;
    return this.armas[sup ? yo.datos.super : yo.datos.arma] || null;
  }

  disparar(sup, ang) {
    if (this.estado !== 'combate' || !Number.isFinite(ang)) return false;
    const yo = this.vistas.get(this.yoId);
    if (!yo || !yo.vivo || !this.pred) return false;
    const arma = this._armaMia(sup);
    if (!arma) return false;
    const ahora = performance.now();
    if (ahora - this.ultimoDisparoLocal < arma.cadencia) return false;
    if (sup) {
      if (this.superCarga < 1) return false;
      this.superCarga = 0;
      this.ultimoSuperLocal = ahora;
      this._pintarSuperHUD(0);
    } else {
      if (this.municion < 1) { this._sinMunicion(yo); return false; }
      this.municion -= 1;
    }
    this.ultimoDisparoLocal = ahora;
    const s = ++this.seqDisparo;
    this._emitir('brawl:disparo', { a: Math.round(ang * 1000) / 1000, sup: sup ? 1 : 0, s });
    // Se dibuja YA, sin esperar al servidor; luego se casa con la de verdad.
    const alto = (window.GFBrawlMotor && window.GFBrawlMotor.REGLAS.ALTO_CUERPO) || 7;
    const balas = arma.balas || 1;
    for (let i = 0; i < balas; i++) {
      const off = balas > 1 ? (i / (balas - 1) - 0.5) * arma.abanico * Math.PI / 180 : 0;
      this._nuevaBala({
        id: null, duenio: this.yoId, x: this.pred.x, y: this.pred.y - alto, ang: ang + off,
        vel: arma.vel, alcance: arma.alcance, radio: arma.radio, tipo: arma.tipo,
        atraviesa: !!arma.atraviesa, prevista: true, s, orden: i
      });
    }
    if (Math.abs(Math.cos(ang)) > 0.2) yo.mira = Math.cos(ang) > 0 ? 1 : -1;
    yo.cara = ang;
    yo.ataqueHasta = ahora + 260;
    this._fogonazo(yo, ang, sup);
    this._impulsoCamara(sup ? 'super' : 'tiro', ang);
    if (sup) this._sonar(yo.especie === 'perro' ? 'aullido' : 'golpe');
    else this._sonar(this.seqDisparo % 2 ? 'ladrido_1' : 'ladrido_2', { detune: (Math.random() - 0.5) * 120 });
    return true;
  }

  /** Disparo con apuntado automático al rival visible más cercano. */
  dispararAuto(sup) {
    return this.disparar(sup, this._anguloAuto(sup));
  }

  _anguloAuto(sup) {
    const yo = this.vistas.get(this.yoId);
    if (!yo || !this.pred) return 0;
    const arma = this._armaMia(sup) || { alcance: 230, vel: 360 };
    let mejor = null, md = Infinity;
    this.vistas.forEach((v) => {
      if (v.yo || !v.vivo || v.oculto) return;
      const d = Math.hypot(v.x - this.pred.x, v.y - this.pred.y);
      const peso = d <= arma.alcance * 1.1 ? d : d + 1000;
      if (peso < md) { md = peso; mejor = v; }
    });
    if (!mejor) return this.apunte.ang || (yo.mira < 0 ? Math.PI : 0);
    // Adelantar el tiro con la velocidad que lleva (la que se le ve).
    const vx = mejor.velX || 0, vy = mejor.velY || 0;
    const d = Math.hypot(mejor.x - this.pred.x, mejor.y - this.pred.y);
    const t = d / Math.max(60, arma.vel || 360);
    return Math.atan2(mejor.y + vy * t * 0.7 - this.pred.y, mejor.x + vx * t * 0.7 - this.pred.x);
  }

  _sinMunicion(yo) {
    if (!yo || this._parpadeoMunicion) return;
    this._parpadeoMunicion = true;
    if (yo.municion) yo.municion.forEach((m) => { m.fillColor = 0xe2554a; });
    if (this.el && this.el.municionHud) this.el.municionHud.classList.add('vacia');
    this._reloj(180, () => {
      this._parpadeoMunicion = false;
      const v = this.vistas.get(this.yoId);
      if (v && v.municion) v.municion.forEach((m) => { m.fillColor = BattleScene.COLOR.municion; });
      if (this.el && this.el.municionHud) this.el.municionHud.classList.remove('vacia');
    });
  }

  _nuevaBala(o) {
    const A = window.GFBatallaArte;
    if (this.balasVista.length >= BattleScene.MAX_BALAS) {
      const vieja = this.balasVista.shift();
      if (vieja && vieja.spr) vieja.spr.destroy();
    }
    const T = BattleScene.BALAS[o.tipo] || BattleScene.BALAS.onda;
    let spr = null;
    if (T.pieza && A && this.textures.exists(A.pieza(T.pieza))) {
      spr = this.add.image(o.x, o.y, A.pieza(T.pieza)).setOrigin(0.25, 0.5).setRotation(o.ang);
    } else if (T.foto && this._foto(T.foto)) {
      spr = this.add.image(o.x, o.y, BattleScene.ATLAS, T.foto).setRotation(o.ang + (T.giro || 0)).setScale(T.escala || 1);
    } else {
      spr = this.add.circle(o.x, o.y, Math.max(3, o.radio || 6), 0xffffff);
    }
    spr.setDepth(40000);
    if (T.luz) spr.setBlendMode(Phaser.BlendModes.ADD);
    const b = Object.assign({ dx: Math.cos(o.ang), dy: Math.sin(o.ang), resto: o.alcance, nace: performance.now(), spr, gira: !!T.gira }, o);
    this.balasVista.push(b);
    return b;
  }

  alBalas(d) {
    if (!Array.isArray(d.b) || !d.b.length) return;
    if (d.o === this.yoId) {
      // Las mías: casar las dibujadas con su id de verdad.
      const mias = this.balasVista.filter((b) => b.prevista && b.s === d.s && b.id == null);
      if (mias.length) {
        mias.sort((a, b) => a.orden - b.orden);
        d.b.forEach((datos, i) => { if (mias[i]) { mias[i].id = datos[0]; mias[i].prevista = false; } });
        return;
      }
      // Sin dibujar (el piloto automático, mientras volvía la red): al momento.
      this._balasDe(d);
      return;
    }
    this._diferir(() => this._balasDe(d));
  }

  _balasDe(d) {
    if (this._cleaned || !this.R) return;
    const quien = this.vistas.get(d.o);
    if (!document.hidden) {
      d.b.forEach((x) => {
        this._nuevaBala({ id: x[0], duenio: d.o, x: x[1], y: x[2], ang: x[3], vel: x[4], alcance: x[5], radio: x[6], tipo: x[7], atraviesa: !!d.sup && (x[7] === 'aullido' || x[7] === 'embestida') });
      });
    }
    if (quien && !quien.yo) {
      const a = d.b[0][3];
      if (Math.abs(Math.cos(a)) > 0.2) quien.mira = Math.cos(a) > 0 ? 1 : -1;
      quien.ataqueHasta = performance.now() + 260;
      quien.caraFija = { ang: a, hasta: performance.now() + 320 };
      this._fogonazo(quien, a, !!d.sup);
      if (quien.especie === 'perro') {
        this._sonar(d.sup ? 'aullido' : 'ladrido_2', { x: quien.x, y: quien.y, vol: 0.7, detune: 150 + Math.random() * 150 });
      } else if (d.sup) this._sonar('golpe', { x: quien.x, y: quien.y, vol: 0.8, detune: -300 });
    }
  }

  _moverBalas(dt) {
    const M = window.GFBrawlMotor;
    if (!M || !this.R) return;
    const ahora = performance.now();
    const alto = M.REGLAS.ALTO_CUERPO || 7;
    const quedan = [];
    for (let i = 0; i < this.balasVista.length; i++) {
      const b = this.balasVista[i];
      // Una bala dibujada que el servidor no confirma en medio segundo es que
      // no salió (te quedaste sin munición en el servidor): se apaga.
      if (b.prevista && b.id == null && ahora - b.nace > 600) { this._quitarBala(b, false); continue; }
      const mia = b.duenio === this.yoId;
      const choque = M.avanzarBala(this.R, b, Math.min(b.resto, b.vel * dt), (bb) => {
        // Una caja que se acaba de romper aún paraba la bala en el servidor
        // (las de los demás se ven con retraso): aquí también.
        const idx = Math.floor(bb.y / this.R.celda) * this.R.ancho + Math.floor(bb.x / this.R.celda);
        const rota = this._rotasRecientes.get(idx);
        if (!mia && rota && rota > ahora) return true;
        if (bb.atraviesa || !mia) return false;
        // Las mías se paran al tocar a quien se ve (el servidor dirá si dio).
        let tocado = false;
        this.vistas.forEach((v) => {
          if (tocado || !v.vivo || v.oculto || v.yo) return;
          const rr = v.golpe + (bb.radio || 6);
          const gx = v.x - bb.x, gy = v.y - alto - bb.y;
          if (gx * gx + gy * gy <= rr * rr) tocado = true;
        });
        return tocado;
      });
      if (b.spr) {
        b.spr.setPosition(b.x, b.y);
        if (b.gira) b.spr.rotation += dt * 9;
      }
      if (choque) { this._quitarBala(b, !!(choque.muro || choque.caja != null)); continue; }
      if (b.resto <= 0) { this._quitarBala(b, false, true); continue; }
      quedan.push(b);
    }
    this.balasVista = quedan;
  }

  _quitarBala(b, contraMuro, alFinal) {
    if (b.spr) {
      if (contraMuro && !document.hidden) this._chispas(b.x, b.y, 4, 0xe8dcbc, 16);
      else if (alFinal && !document.hidden) this._pieza('x_humo', b.x, b.y, { color: 0xffffff, escala: 0.3, alfa: 0.35, dura: 260, mezcla: false, tween: { scale: 0.5, alpha: 0 } });
      b.spr.destroy();
      b.spr = null;
    }
  }

  alGolpe(d) {
    if (d.o === this.yoId && !d.boom) this._golpe(d);
    else this._diferir(() => this._golpe(d));
  }

  _golpe(d) {
    if (this._cleaned) return;
    // La bala que dio desaparece (si no atraviesa).
    for (let i = 0; i < this.balasVista.length; i++) {
      const b = this.balasVista[i];
      if (b.id === d.b && !b.atraviesa) { this._quitarBala(b, false); this.balasVista.splice(i, 1); break; }
    }
    const v = this.vistas.get(d.t);
    if (!v) return;
    v.golpeHasta = performance.now() + 80;
    v.retroceso = Math.max(v.retroceso, 0.7);
    if (!document.hidden) {
      const col = d.boom ? 0xff9a3c : (d.sup ? BattleScene.COLOR.oro : (v.yo ? 0xff7a6a : 0xfff0c0));
      this._impacto(d.x, d.y, col, !!d.sup || !!d.boom);
      this._numero(v.x, v.y - (v.altoSprite || 28) - 4, '-' + d.d, v.yo ? '#ff8f83' : (d.sup ? '#ffd24a' : '#ffffff'), !!d.sup);
    }
    if (v.yo || d.o === this.yoId) this._sonar('golpe', { detune: v.yo ? -200 : 0 });
    if (v.yo) {
      if (this.el && this.el.dolor) {
        this.el.dolor.classList.add('activo');
        this._reloj(140, () => this.el && this.el.dolor && this.el.dolor.classList.remove('activo'));
      }
      this._impulsoCamara('dano', 0, d.sup ? 1 : 0.6);
    }
  }

  alCaja(d) {
    const M = window.GFBrawlMotor;
    if (this.R) {
      if (d.rota) { M.romperCaja(this.R, d.i); this._rotasRecientes.set(d.i, performance.now() + 400); }
      else if (this.R.cajas[d.i]) this.R.cajas[d.i].vida = d.vida;
    }
    const c = this.arena && this.arena.cajas.get(d.i);
    if (!c || c.rota) return;
    if (d.rota) { this._cajaRota(d.i, c, true); return; }
    this._cajaTocada(c, d.vida, d.max);
    if (!this._reducedMotion && !document.hidden && c.img) {
      const x0 = c.x0;
      if (this.tweens) this.tweens.killTweensOf(c.img);
      this.tweens.add({ targets: c.img, x: { from: x0 - 2, to: x0 }, duration: 70, ease: 'Sine.easeOut', repeat: 1, onComplete: () => { if (c.img) c.img.x = x0; } });
      this._chispas(c.img.x, c.img.y - 12, 5, c.tipo === 'barril' ? 0xff8a3a : 0xc9975a, 18);
    }
  }

  /** Una caja tocada se oscurece un poco (cuanto más tocada, más). */
  _cajaTocada(c, vida, max) {
    if (!c || !c.img || !c.img.setTint) return;
    const p = Math.max(0, Math.min(1, vida / Math.max(1, max)));
    const k = Math.round(150 + 105 * p);
    c.img.setTint((k << 16) | (Math.round(k * 0.94) << 8) | Math.round(k * 0.86));
  }

  /* UNA CAJA ROTA salta en cuatro trozos (sus propios pedazos del atlas) que
     se quedan en el suelo, y una polvareda. El barril deja su mancha de
     quemado: el estallido lo pinta alBoom. */
  _cajaRota(i, c, conEfecto) {
    c.rota = true;
    const x = c.img ? c.img.x : 0, y = c.img ? c.img.y : 0;
    try { if (this.tweens) this.tweens.killTweensOf(c.img); c.img.destroy(); } catch (e) {}
    try { if (c.sombra) c.sombra.destroy(); } catch (e) {}
    c.img = null; c.sombra = null;
    const res = this.arena;
    if (c.tipo === 'barril') {
      const A = window.GFBatallaArte;
      if (A && this.textures.exists(A.pieza('x_sombra'))) {
        const mancha = this.add.image(x, y - 6, A.pieza('x_sombra')).setScale(1.2, 1.1).setAlpha(0.45).setTint(0x1a120c).setDepth(-850);
        if (res) res.restos.push(mancha);
      }
      return;
    }
    const pre = c.tipo === 'cofre' ? 'cofre_trozo_' : 'caja_trozo_';
    for (let k = 1; k <= 4; k++) {
      const f = this._foto(pre + k);
      if (!f) continue;
      const ang = (k / 4) * Math.PI * 2 + 0.6, dist = 10 + (k % 2) * 6;
      const tx = x + Math.cos(ang) * dist, ty = y - 4 + Math.sin(ang) * dist * 0.6;
      const t = this.add.image(x, y - 10, BattleScene.ATLAS, f).setDepth(-840).setRotation((k - 2) * 0.35);
      if (res) res.restos.push(t);
      if (conEfecto && !this._reducedMotion && !document.hidden) {
        this.tweens.add({ targets: t, x: tx, y: ty, rotation: t.rotation + (k % 2 ? 1.2 : -1.2), alpha: 0.85, duration: 420, ease: 'Quad.easeOut' });
      } else { t.setPosition(tx, ty); t.setAlpha(0.85); }
    }
    if (conEfecto && !document.hidden) {
      this._sonar('caja', { x, y });
      this._chispas(x, y - 10, 10, c.tipo === 'cofre' ? BattleScene.COLOR.oro : 0xc9975a, 30);
      this._pieza('x_humo', x, y - 10, { color: 0xe8dcbc, escala: 0.6, alfa: 0.7, dura: 520, mezcla: false, tween: { scale: 1.2, alpha: 0, y: y - 22 } });
    }
  }

  alObjeto(d) {
    this._diferir(() => this._crearObjeto(d, true));
  }

  _crearObjeto(d, animado) {
    if (this._cleaned || this.objetosVista.has(d.id)) return;
    const T = BattleScene.OBJETOS[d.tipo] || BattleScene.OBJETOS.hueso;
    const A = window.GFBatallaArte;
    const x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const sombra = A && this.textures.exists(A.pieza('x_sombra'))
      ? this.add.image(x, y + 6, A.pieza('x_sombra')).setScale(0.5, 0.5).setAlpha(0.3).setDepth(-800) : null;
    const brillo = (A && this.textures.exists(A.pieza('brillo')))
      ? this.add.image(x, y, A.pieza('brillo')).setTint(T.brillo).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(36, 24).setAlpha(0.65).setDepth(y - 1)
      : null;
    const f = this._foto(T.foto);
    const img = f ? this.add.image(x, y + 4, BattleScene.ATLAS, f).setOrigin(0.5, 1) : this.add.rectangle(x, y, 12, 10, T.brillo);
    img.setDepth(y + 4);
    const h = { img, brillo, sombra, flota: null, late: null, tipo: d.tipo };
    if (animado && !this._reducedMotion && !document.hidden) {
      img.setScale(0.2);
      this.tweens.add({ targets: img, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    if (!this._reducedMotion) {
      h.flota = this.tweens.add({ targets: img, y: y, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 260 });
      if (brillo) h.late = this.tweens.add({ targets: brillo, alpha: 0.3, duration: 720, yoyo: true, repeat: -1 });
    }
    this.objetosVista.set(d.id, h);
  }

  _quitarObjeto(h) {
    try { if (h.flota) h.flota.remove(); if (h.late) h.late.remove(); } catch (e) {}
    ['img', 'brillo', 'sombra'].forEach((k) => { try { if (h[k]) { if (this.tweens) this.tweens.killTweensOf(h[k]); h[k].destroy(); } } catch (e) {} h[k] = null; });
  }

  alRecoger(d) {
    if (d.por === this.yoId) this._recoger(d);
    else this._diferir(() => this._recoger(d));
  }

  _recoger(d) {
    if (this._cleaned) return;
    const h = this.objetosVista.get(d.id);
    const v = this.vistas.get(d.por);
    if (h) {
      this.objetosVista.delete(d.id);
      try { if (h.flota) h.flota.remove(); if (h.late) h.late.remove(); } catch (e) {}
      try { if (h.brillo) h.brillo.destroy(); if (h.sombra) h.sombra.destroy(); } catch (e) {}
      if (v && h.img && !this._reducedMotion && !document.hidden) {
        this.tweens.add({ targets: h.img, x: v.x, y: v.y - 16, scale: 0.4, alpha: 0, duration: 220, onComplete: () => { try { h.img.destroy(); } catch (e) {} } });
      } else { try { h.img.destroy(); } catch (e) {} }
    }
    if (!v) return;
    v.potencia = d.potencia;
    if (Number.isFinite(d.maxHp)) v.maxHp = d.maxHp;
    if (Number.isFinite(d.hp)) v.hp = d.hp;
    if (['escudo', 'rapidez', 'municion', 'super'].includes(d.tipo)) {
      if (v.yo) {
        if (d.vel) v.datos.vel = d.vel;
        if (Number.isFinite(d.m)) this.municion = d.m;
        if (Number.isFinite(d.s)) this.superCarga = d.s;
        const nombres = { escudo: 'SHIELD · 8s', rapidez: 'SPEED +20% · 8s', municion: '+AMMO', super: '+35% SUPER' };
        this.aviso(nombres[d.tipo], { peque: true, ms: 1500 });
        this._pintarSuperHUD(this.superCarga);
        this._sonar('hueso');
      }
      return;
    }
    if (d.tipo === 'carne') {
      if (!document.hidden) {
        this._numero(v.x, v.y - (v.altoSprite || 28) - 4, '+' + (d.cura || ''), '#7dff8a', true);
        this._pieza('x_anillo', v.x, v.y - 6, { color: 0x7dff8a, escala: 0.3, alfa: 0.8, dura: 420, tween: { scale: 0.9, alpha: 0 } });
      }
      if (v.yo) { this.aviso('+HEALTH', { peque: true, ms: 1000 }); this._sonar('cura'); }
      return;
    }
    if (v.yo) {
      if (this.el && this.el.huesos) this.el.huesos.textContent = String(d.potencia);
      this.aviso('+1 POWER BONE', { peque: true, ms: 1200 });
      this._sonar('hueso');
    }
  }

  /** Un barril explota: fogonazo, onda, humo, chispas y temblor si te pilla cerca. */
  alBoom(d) {
    this._diferir(() => this._boom(d));
  }

  _boom(d) {
    const x = Number(d.x), y = Number(d.y), r = Number(d.r) || 76;
    if (!Number.isFinite(x) || !Number.isFinite(y) || this._cleaned) return;
    this._sonar('boom', { x, y });
    if (document.hidden) return;
    this._pieza('x_golpe', x, y - 8, { color: 0xffb347, escala: 0.6, dura: 360, prof: 42000, tween: { scale: r / 26, alpha: 0, angle: 30 } });
    this._pieza('x_anillo', x, y - 4, { color: 0xffe08a, escala: 0.3, alfa: 0.9, dura: 420, prof: 42000, tween: { scale: r / 22, alpha: 0 } });
    this._pieza('brillo', x, y - 8, { color: 0xff7a2a, escala: 1.2, alfa: 0.9, dura: 300, prof: 42000, tween: { scale: 3, alpha: 0 } });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this._pieza('x_humo', x + Math.cos(a) * 10, y - 6 + Math.sin(a) * 8, {
        color: 0x5a4c44, escala: 0.7, alfa: 0.75, dura: 900, mezcla: false, prof: 41500,
        tween: { scale: 1.6, alpha: 0, x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 26 - 22 }
      });
    }
    this._chispas(x, y - 8, 14, 0xff9a3c, 56);
    const yo = this.vistas.get(this.yoId);
    if (yo && !this._reducedMotion) {
      const dist = Math.hypot(yo.x - x, yo.y - y);
      if (dist < r * 4) this._impulsoCamara('explosion', 0, Math.max(0.15, 1 - dist / (r * 4)));
    }
    if (window.GFPost && window.GFPost.pulso) { try { window.GFPost.pulso(0.35); } catch (e) {} }
  }

  alKO(d) {
    const v = this.vistas.get(d.t);
    if (v) v.koPendiente = true;          // que la interpolación no lo esconda antes de caer
    if (d.k === this.yoId) this._ko(d);
    else this._diferir(() => this._ko(d));
  }

  _ko(d) {
    if (this._cleaned) return;
    const v = this.vistas.get(d.t);
    const k = d.k ? this.vistas.get(d.k) : null;
    this.quedan = Number(d.quedan) || Math.max(0, this.quedan - 1);
    if (this.el && this.el.quedan) this.el.quedan.textContent = String(this.quedan);
    if (v && v.vivo) {
      if (Number.isFinite(d.x) && Number.isFinite(d.y) && !v.yo) { v.x = d.x; v.y = d.y; }
      v.vivo = false;
      v.koPendiente = false;
      // El último golpe no llega en ninguna instantánea (ya no está vivo): sin
      // esto la barra se quedaba con la vida de antes del golpe.
      v.hp = 0;
      if (v.yo) this._pintarVidaHUD(0, v.maxHp);
      this._caer(v, true);
      this._sonar('ko', { x: v.x, y: v.y, vol: v.yo ? 1 : 0.8 });
    }
    this.alFeed(k && k !== v ? k : null, v);
    if (k && k.yo && v && !v.yo) {
      this.misBajas++;
      if (this.el && this.el.bajas) this.el.bajas.textContent = String(this.misBajas);
      this.aviso('KNOCKOUT!', { oro: true, ms: 1000 });
    }
    if (v && v.yo) {
      this.estado = 'caido';
      if (this.ui) this.ui.classList.add('caido');
      this.apunte.mostrar = false;
      this._cancelarConfirmacion();
      // En la diaria y la práctica el final llega al momento: no hace falta
      // ofrecer "mirar". En PvP sí: la partida sigue sin ti.
      if (this.modo === 'pvp' && this.quedan > 1 && this.el && this.el.caido) {
        this.el.caidoTitulo.textContent = 'Knocked out!';
        this.el.caidoTexto.textContent = 'You finished #' + d.puesto + '.' + (k && !k.yo ? ' Knocked out by ' + (k.datos.petName || 'a rival') + '.' : '');
        this.el.caido.classList.remove('hidden');
        this.seguidoId = k && k.vivo ? k.id : null;
      } else {
        this.aviso('KNOCKED OUT', { ms: 1400, malo: true });
      }
    }
    if (this.seguidoId === d.t) this.seguidoId = null;
  }

  _caer(v, conEfecto) {
    if (v.cartel) v.cartel.setVisible(false);
    if (v.aro) v.aro.setVisible(false);
    if (v.superListo) v.superListo.setVisible(false);
    if (!v.spr) return;
    v.spr.setAlpha(1).setVisible(true);
    if (conEfecto && !document.hidden) {
      this._pieza('x_humo', v.x, v.y - 6, { color: 0xe8dcbc, escala: 0.7, alfa: 0.85, dura: 600, mezcla: false, tween: { scale: 1.4, alpha: 0, y: v.y - 24 } });
      this._chispas(v.x, v.y - 12, 10, 0xffffff, 28);
    }
    if (this._reducedMotion || document.hidden || !conEfecto) { v.spr.setAlpha(0.3); v.spr.setAngle(v.mira < 0 ? -90 : 90); return; }
    this.tweens.add({ targets: v.spr, angle: v.mira < 0 ? -90 : 90, alpha: 0.3, y: v.spr.y + 2, duration: 420, ease: 'Bounce.easeOut' });
    if (v.sombra) this.tweens.add({ targets: v.sombra, alpha: 0.12, duration: 420 });
  }

  // =========================================================================
  // RESULTADOS
  // =========================================================================
  mostrarResultado(d) {
    if (this.estado === 'fin' && this._resultado) return;
    this._sacarDiferidos(Infinity);
    this.estado = 'fin';
    this._resultado = d;
    this.apunte.mostrar = false;
    this.teclas = {};
    this.movTactil = { x: 0, y: 0 };
    this._cancelarConfirmacion();
    const e = this.el;
    if (this.ui) { this.ui.classList.add('fin'); this.ui.classList.remove('en-gas'); }
    if (!e || !e.resultado) { this.volverEnBreve(4000); return; }
    if (e.caido) e.caido.classList.add('hidden');
    if (e.aviso) e.aviso.classList.add('hidden');
    if (e.fuera) e.fuera.classList.add('hidden');
    if (e.gas) e.gas.classList.add('hidden');
    if (this._plazoAviso) { window.clearTimeout(this._plazoAviso); this._plazoAviso = null; }

    const gano = d.resultado === 'win';
    const puesto = Number(d.puesto) || 1, de = Number(d.de) || 1;
    this._sonar(gano ? 'victoria' : 'derrota');
    const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
    e.resPuesto.textContent = '#' + puesto;
    // Plata y bronce solo tienen sentido con más de dos.
    const medalla = puesto === 1 ? 'oro' : (de > 2 && puesto === 2 ? 'plata' : (de > 3 && puesto === 3 ? 'bronce' : 'nada'));
    e.resPuesto.className = 'ga-medalla ' + medalla;
    e.resTitulo.textContent = gano ? 'Victory!' : (this.modo === 'pvp' ? ordinal(puesto) + ' place' : 'Defeated');
    e.resTitulo.classList.toggle('gana', gano);
    const rival = (d.tabla || []).find((f) => f.id !== d.yo);
    if (this.modo === 'bot') {
      const esp = rival && window.GFBrawlMotor && window.GFBrawlMotor.ESPECIES[rival.especie];
      e.resSub.textContent = 'Daily battle ' + (d.ronda || '') + '/5' + (rival ? ' · vs ' + rival.petName + (esp ? ' the ' + esp.etiqueta : '') : '');
    } else if (this.modo === 'practica') {
      e.resSub.textContent = 'Practice: no points, just training.';
    } else {
      e.resSub.textContent = de + ' fighters · ' + ((this.partida && this.partida.arena && this.partida.arena.nombre) || 'Arena');
    }

    // Lo ganado, con sus iconos (los textos van con textContent).
    const premios = [];
    const yoFila = (d.tabla || []).find((f) => f.id === d.yo);
    if (this.modo !== 'practica') premios.push(['puntos', '+' + (Number(d.puntos) || 0) + ' pts', (Number(d.puntos) || 0) > 0 ? 'oro' : '']);
    if (Number(d.exp) > 0) premios.push(['exp', '+' + Number(d.exp) + ' EXP', 'verde']);
    if (Number(d.petExpGanada) > 0) premios.push(['vivos', '+' + Number(d.petExpGanada) + ' pet EXP', 'verde']);
    if (d.petLevel) {
      // El servidor manda el nivel de ANTES de la partida.
      const yo = this.vistas.get(this.yoId);
      const nivelAntes = Number.isFinite(Number(d.petLevelAntes)) && d.petLevelAntes !== null
        ? Number(d.petLevelAntes)
        : (yo ? Number(yo.datos.nivel) || 0 : Number(this.datosJugador.nivel) || 0);
      if (d.petLevel > nivelAntes) premios.push(['exp', 'Pet level up! Lv ' + d.petLevel, 'oro']);
      window.globalPetLevel = d.petLevel;
      if (d.petExp !== null && d.petExp !== undefined) {
        window.globalPetExp = { petExp: d.petExp, petExpBase: d.petExpBase, petExpSiguiente: d.petExpSiguiente };
      }
    }
    if (d.daily && Number.isFinite(Number(d.daily.done))) premios.push(['diarias', 'Daily ' + d.daily.done + '/' + d.daily.max, '']);
    if (yoFila) {
      premios.push(['ko', yoFila.bajas + ' KO' + (yoFila.bajas === 1 ? '' : 's'), '']);
      premios.push(['ladrido', yoFila.dano + ' dmg', '']);
      if (yoFila.potencia) premios.push(['hueso', String(yoFila.potencia), 'oro']);
    }
    e.resPremios.textContent = '';
    premios.forEach(([icono, texto, clase]) => {
      const li = document.createElement('li');
      if (clase) li.className = clase;
      const img = document.createElement('img');
      img.src = BattleScene.ICONOS + icono + '.png'; img.alt = '';
      const t = document.createElement('span');
      t.textContent = texto;
      li.appendChild(img); li.appendChild(t);
      e.resPremios.appendChild(li);
    });
    e.resTabla.textContent = '';
    (d.tabla || []).slice().sort((a, b) => a.puesto - b.puesto).forEach((f) => {
      const esp = window.GFBrawlMotor && window.GFBrawlMotor.ESPECIES[f.especie];
      const li = document.createElement('li');
      if (f.id === d.yo) li.className = 'yo';
      const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = '#' + f.puesto;
      const img = document.createElement('img'); img.className = 'avatar'; img.alt = ''; img.src = this._retratoDe(f.especie);
      const quien = document.createElement('span'); quien.className = 'quien';
      quien.textContent = String(f.petName || 'Pet').slice(0, 18);
      const sub = document.createElement('small');
      sub.textContent = f.humano ? String(f.playerName || '').slice(0, 20) : (esp ? esp.etiqueta + ' · bot' : 'Bot');
      quien.appendChild(sub);
      const ko = document.createElement('span'); ko.className = 'num'; ko.title = 'Knockouts';
      const iko = document.createElement('img'); iko.src = BattleScene.ICONOS + 'ko.png'; iko.alt = '';
      ko.appendChild(iko); ko.appendChild(document.createTextNode(String(Number(f.bajas) || 0)));
      const dn = document.createElement('span'); dn.className = 'num'; dn.title = 'Damage';
      const idn = document.createElement('img'); idn.src = BattleScene.ICONOS + 'ladrido.png'; idn.alt = '';
      dn.appendChild(idn); dn.appendChild(document.createTextNode(String(Number(f.dano) || 0)));
      li.appendChild(pos); li.appendChild(img); li.appendChild(quien); li.appendChild(ko); li.appendChild(dn);
      e.resTabla.appendChild(li);
    });

    // "Otra vez": la siguiente diaria si quedan, otra cola, otra práctica.
    let otra = 'Play again';
    let puedeOtra = true;
    if (this.modo === 'bot') {
      puedeOtra = !!(d.daily && d.daily.remaining > 0);
      otra = puedeOtra ? 'Next battle (' + (d.daily.done + 1) + '/' + d.daily.max + ')' : 'Play again';
    } else if (this.modo === 'practica') otra = 'Practice again';
    e.otraVez.textContent = otra;
    e.otraVez.classList.toggle('hidden', !puedeOtra);
    e.resultado.classList.remove('hidden');

    // Se vuelve solo al mapa al cabo de un rato (con el reloj del navegador).
    let quedan = 25;
    const pintar = () => { if (e.volver) e.volver.textContent = 'Back to map (' + quedan + ')'; };
    pintar();
    const tic = () => {
      if (this.estado !== 'fin' || this._cleaned) return;
      quedan--;
      if (quedan <= 0) { this.volverAlMapa(); return; }
      pintar();
      this._reloj(1000, tic);
    };
    this._reloj(1000, tic);
    if (gano && !this._reducedMotion) {
      const yo = this.vistas.get(this.yoId);
      if (yo && yo.spr) this.tweens.add({ targets: yo.spr, y: yo.spr.y - 10, duration: 220, yoyo: true, repeat: 3, ease: 'Quad.easeOut' });
    }
  }

  _retratoDe(especie) {
    const E = BattleScene.ESPECIES[especie];
    if (!E || E.via === 'mascota') return BattleScene.RETRATO_MASCOTA;
    return (E.via === 'cuervo' ? './Game/Sprites/cuervo3d/' : './Game/Sprites/animales3d/') + E.pre + 'quieto_1.png?v=20261012';
  }

  jugarOtraVez() {
    // Con la escena ya limpia (se volvió al mapa) no se arranca nada: si no,
    // la arena se pondría a correr ENCIMA del mapa (las dos escenas a la vez).
    if (this.estado !== 'fin' || this._cleaned || this._volviendo) return;
    const datos = Object.assign({}, this.datosInicio, { modo: this.modo });
    // Que el servidor sepa que ya no estamos (por si el final llegó antes).
    this._emitir('brawl:salir');
    this.scene.restart(datos);
  }

  // =========================================================================
  // SONIDO
  // =========================================================================
  /**
   * Suena un efecto. `op.x/y`: la posición de quien lo hace, para bajarle el
   * volumen con la distancia. Con tope: un mismo sonido no se repite en menos
   * de 60 ms (cinco balas de un abanico que dan a la vez son UN golpe).
   */
  _sonar(nombre, op) {
    if (!this._volumenSFX || document.hidden || !this.sound) return;
    const k = 'bz_snd_' + nombre;
    if (!this.cache.audio.exists(k)) return;
    const ahora = performance.now();
    if (ahora - (this._ultimoSonido[nombre] || 0) < 60) return;
    this._ultimoSonido[nombre] = ahora;
    op = op || {};
    let vol = this._volumenSFX * (op.vol == null ? 1 : op.vol);
    if (op.x != null && this.pred) {
      const d = Math.hypot(op.x - this.pred.x, op.y - this.pred.y);
      vol *= Math.max(0.12, 1 - d / 640);
    }
    try { this.sound.play(k, { volume: vol, detune: op.detune || 0 }); } catch (e) { /* sin audio: se juega igual */ }
  }

  // =========================================================================
  // EFECTOS
  // =========================================================================
  _pieza(clave, x, y, op) {
    const A = window.GFBatallaArte;
    if (!A || !this.textures.exists(A.pieza(clave))) return null;
    if (this.efectosVivos.length >= BattleScene.MAX_EFECTOS) {
      const v = this.efectosVivos.shift();
      if (v) { try { v.destroy(); } catch (e) {} }
    }
    op = op || {};
    const s = this.add.image(x, y, A.pieza(clave)).setDepth(op.prof || 41000);
    s.setTint(op.color == null ? 0xffffff : op.color);
    s.setAlpha(op.alfa == null ? 1 : op.alfa);
    s.setScale(op.escala == null ? 1 : op.escala);
    if (op.rot) s.setRotation(op.rot);
    if (op.mezcla) s.setBlendMode(Phaser.BlendModes.ADD);
    this.efectosVivos.push(s);
    this.tweens.add(Object.assign({
      targets: s, duration: op.dura || 380, ease: 'Quad.easeOut',
      onComplete: () => {
        const i = this.efectosVivos.indexOf(s);
        if (i >= 0) this.efectosVivos.splice(i, 1);
        s.destroy();
      }
    }, op.tween || {}));
    return s;
  }

  _chispas(x, y, n, color, fuerza) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = (fuerza || 24) * (0.4 + Math.random() * 0.8);
      this._pieza('x_chispa', x, y, {
        color, escala: 1, dura: 240 + Math.random() * 220, mezcla: true,
        tween: { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, alpha: 0, ease: 'Cubic.easeOut' }
      });
    }
  }

  _impacto(x, y, color, gordo) {
    this._pieza('x_golpe', x, y, { color, escala: 0.35, dura: 240, tween: { scale: gordo ? 1.1 : 0.75, alpha: 0, angle: 30 } });
    this._pieza('x_anillo', x, y, { color, escala: 0.15, alfa: 0.85, dura: 300, tween: { scale: gordo ? 0.75 : 0.5, alpha: 0 } });
    this._chispas(x, y, gordo ? 8 : 4, color, gordo ? 30 : 20);
  }

  _fogonazo(v, ang, sup) {
    if (document.hidden || !v) return;
    const alto = (window.GFBrawlMotor && window.GFBrawlMotor.REGLAS.ALTO_CUERPO) || 7;
    const x = v.x + Math.cos(ang) * 14, y = v.y - alto + Math.sin(ang) * 14;
    this._pieza('x_anillo', x, y, { color: sup ? BattleScene.COLOR.oro : 0xdff4ff, escala: 0.1, alfa: 0.75, dura: 170, tween: { scale: sup ? 0.6 : 0.32, alpha: 0 } });
    if (v.spr && !this._reducedMotion) v.retroceso = 1;   // un culatazo: se encoge y vuelve
  }

  /** Números de daño: reutilizados (Text cuesta un lienzo cada uno). */
  _numero(x, y, texto, color, gordo) {
    if (document.hidden) return;
    let t = this.numerosLibres.pop();
    const tam = gordo ? 11 : 9;
    if (!t) {
      t = this.add.text(0, 0, '', {
        fontFamily: '"PressStart2P", monospace', fontSize: tam + 'px', color: '#ffffff',
        stroke: '#0a0710', strokeThickness: 4, resolution: Math.max(2, this._dpr || 1)
      }).setOrigin(0.5, 1).setDepth(42000);
    }
    t.setActive(true).setVisible(true);
    t.setFontSize(tam).setColor(color).setText(texto);
    const s = this._escalaCartel || 1;
    t.setScale(s * 0.6).setAlpha(1).setPosition(x + (Math.random() - 0.5) * 8, y);
    this.tweens.add({
      targets: t, y: y - 16, scale: s, duration: 200, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: t, y: y - 28, alpha: 0, duration: 420, delay: 160,
          onComplete: () => { t.setVisible(false).setActive(false); if (this.numerosLibres.length < 24) this.numerosLibres.push(t); else t.destroy(); }
        });
      }
    });
  }

  // =========================================================================
  // EL GAS
  // =========================================================================
  _alEntrarGas() {
    if (this.estado !== 'combate') return;
    this._avisosGas.empieza = true;
    this._sonar('alarma');
    this.aviso('The gas is closing in! Stay in the middle.', { peque: true, ms: 2600 });
  }

  _pintarGas(time, dt) {
    const g = this.gas;
    if (!g || !this.gasBandas || !this.R) return;
    g.d += (g.dObj - g.d) * Math.min(1, dt * 6);
    const activo = g.d > 0.5;
    this._gasAlfa += ((activo ? 1 : 0) - this._gasAlfa) * Math.min(1, dt * 1.5);
    const alfa = this._gasAlfa * 0.58;
    const W = this.R.anchoPx, H = this.R.altoPx;
    const d = g.d;
    const animar = !this._reducedMotion && !document.hidden;
    this.gasBandas.forEach((b, i) => {
      b.setVisible(alfa > 0.01);
      if (alfa <= 0.01) return;
      b.setAlpha(alfa);
      if (animar && b.tilePositionX !== undefined) {
        b.tilePositionX = time * (i % 2 ? 0.006 : -0.005);
        b.tilePositionY = time * (i < 2 ? 0.004 : -0.003);
      }
    });
    if (alfa <= 0.01) { if (this._gasPintado !== -2) { this.gGas.clear(); this._gasPintado = -2; } return; }
    if (Math.abs(d - this._gasPintado) < 0.25 && !animar) return;
    if (Math.abs(d - this._gasPintado) >= 0.25) {
      this._gasPintado = d;
      const x0 = g.x0 + d, y0 = g.y0 + d, x1 = g.x1 - d, y1 = g.y1 - d;
      const [b0, b1, b2, b3] = this.gasBandas;
      b0.setPosition(0, 0).setSize(W, Math.max(1, y0));
      b1.setPosition(0, y1).setSize(W, Math.max(1, H - y1));
      b2.setPosition(0, y0).setSize(Math.max(1, x0), Math.max(1, y1 - y0));
      b3.setPosition(x1, y0).setSize(Math.max(1, W - x1), Math.max(1, y1 - y0));
      // EL FRENTE DEL GAS: una franja más densa que se difumina hacia dentro
      // de la nube, para que se lea dónde empieza a quemar. Sin raya: el gas
      // no se marca, se ve (capas translúcidas apiladas, de fina a ancha).
      const gg = this.gGas;
      gg.clear();
      [[3, 0.30], [7, 0.20], [12, 0.12], [18, 0.06]].forEach(([w, a]) => {
        gg.fillStyle(0x9ee07a, a * this._gasAlfa);
        gg.fillRect(x0 - w, y0 - w, x1 - x0 + 2 * w, w);
        gg.fillRect(x0 - w, y1, x1 - x0 + 2 * w, w);
        gg.fillRect(x0 - w, y0, w, y1 - y0);
        gg.fillRect(x1, y0, w, y1 - y0);
      });
    }
  }

  /**
   * ¿Estás en el gas? Borde de pantalla teñido, un texto y una flecha que
   * señala el sitio seguro más cercano. Y si va a llegarte pronto, un aviso.
   */
  _avisoGas(yo, ahora) {
    const e = this.el;
    const M = window.GFBrawlMotor;
    if (!e || !e.fuera || !M || !this.gas) return;
    let modo = '';
    let destino = null;
    const g = this.gas;
    if (yo && yo.vivo && this.estado === 'combate' && this.R) {
      const dentro = (d) => yo.x < g.x0 + d || yo.x > g.x1 - d || yo.y < g.y0 + d || yo.y > g.y1 - d;
      const seguro = (d) => ({ x: Math.max(g.x0 + d + 24, Math.min(g.x1 - d - 24, yo.x)), y: Math.max(g.y0 + d + 24, Math.min(g.y1 - d - 24, yo.y)) });
      if (g.d > 0.5 && dentro(g.d)) { modo = 'dentro'; destino = seguro(g.d); }
      else {
        const pasado = (ahora - this.tCombateLocal);
        const dentroDe = (ms) => Math.min(g.max, Math.max(0, (pasado + ms - g.inicioMs) / 1000 * g.vel));
        const pronto = dentroDe(6000);
        if (pronto > 0.5 && dentro(pronto)) { modo = 'pronto'; destino = seguro(pronto); }
      }
    }
    if (this._hud.fuera !== modo) {
      this._hud.fuera = modo;
      e.fuera.classList.toggle('hidden', !modo);
      e.fuera.classList.toggle('pronto', modo === 'pronto');
      if (this.ui) this.ui.classList.toggle('en-gas', modo === 'dentro');
      if (e.fueraTxt) e.fueraTxt.textContent = modo === 'dentro' ? "You're in the gas! Get to the middle" : 'The gas is coming, move to the middle';
    }
    if (modo && destino && e.flecha && yo) {
      const ang = Math.atan2(destino.y - yo.y, destino.x - yo.x) * 180 / Math.PI;
      const a = Math.round(ang / 3) * 3;
      if (this._hud.flecha !== a) { this._hud.flecha = a; e.flecha.style.transform = 'rotate(' + a + 'deg)'; }
    }
  }

  // =========================================================================
  // CADA FOTOGRAMA
  // =========================================================================
  update(time, delta) {
    if (this._cleaned) return;
    if (this.estado === 'buscando' && this.modo === 'pvp' && this._busquedaTerminaEn && this.el && this.el.sala) {
      const seconds = Math.max(0, Math.ceil((this._busquedaTerminaEn - Date.now()) / 1000));
      const text = (this._jugadoresBuscando || 1) + ' / 6 · starts in ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      if (this.el.sala.textContent !== text) this.el.sala.textContent = text;
    }
    const dt = Math.min(50, Math.max(0, delta || 16)) / 1000;
    const ahora = performance.now();
    this._sacarDiferidos(ahora);
    const M = window.GFBrawlMotor;
    const enJuego = this.matchId && this.R && M;

    // ── tu perro: se mueve ya, con las mismas paredes que el servidor ──
    const yo = this.vistas.get(this.yoId);
    if (enJuego && yo && yo.vivo && this.pred) {
      let andado = 0;
      if (this.estado === 'combate') {
        const mv = this._movimiento();
        if (mv.x || mv.y) {
          const vel = yo.datos.vel || 100;
          const p = M.moverCirculo(this.R, this.pred.x, this.pred.y, mv.x * vel * dt, mv.y * vel * dt, M.REGLAS.RADIO || 11);
          andado = Math.hypot(p[0] - this.pred.x, p[1] - this.pred.y);
          if (Math.abs(p[0] - this.pred.x) > 0.05) yo.mira = p[0] > this.pred.x ? 1 : -1;
          if (andado > 0.05 && ahora > yo.ataqueHasta) yo.cara = Math.atan2(p[1] - this.pred.y, p[0] - this.pred.x);
          this.pred.x = p[0]; this.pred.y = p[1];
        }
        this._enviarPosicion(ahora);
        if (this.disparoMantenido && !this._tactil) this.disparar(false, this.apunte.ang);
      }
      // La recolocación suave: el desvío se apaga en ~120 ms.
      const k = Math.min(1, dt * 9);
      this.desvio.x -= this.desvio.x * k; this.desvio.y -= this.desvio.y * k;
      yo.x = this.pred.x + this.desvio.x;
      yo.y = this.pred.y + this.desvio.y;
      // Munición que se recarga sola, entre instantánea e instantánea.
      const arma = this._armaMia(false);
      if (arma && arma.recarga && this.municion < 3) this.municion = Math.min(3, this.municion + delta / arma.recarga);
      this._pintarMunicionHUD(this.municion);
    }

    this._interpolar(ahora);

    // ── apuntar con el ratón ──
    if (yo && this.pred && this.apunte.raton && !this._tactil) {
      const cam = this.cameras.main;
      const p = cam.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
      this.apunte.ratonX = p.x; this.apunte.ratonY = p.y;
      this.apunte.ang = Math.atan2(p.y - (yo.y - 7), p.x - yo.x);
    }

    this._moverBalas(dt);
    this._pintarVistas(ahora, dt);
    this._pintarApunte(yo);
    this._arbustosCerca(yo, ahora);
    this._pintarGas(time, dt);
    this._avisoGas(yo, ahora);
    this._pintarReloj(ahora);
    this._vigilarConexion(ahora);
    this._camara(dt);
    if (this._teclasHasta && ahora > this._teclasHasta && this.ui) { this._teclasHasta = 0; this.ui.classList.add('sin-teclas'); }
  }

  /* LOS DEMÁS, EN SU MOMENTO: se pintan a la hora del servidor de hace
     RETRASO_INTERP ms, interpolando entre las dos muestras que la rodean.
     Su vida, sus huesos y si está en la hierba, de la misma muestra (así la
     barra baja cuando llega la bala que se ve, no antes). */
  _interpolar(ahora) {
    if (this._offset == null) return;
    const tr = ahora - this._offset - BattleScene.RETRASO_INTERP;
    this.vistas.forEach((v) => {
      const b = v.buffer;
      if (!b.length || !v.vivo) return;
      while (b.length >= 2 && b[1].ts <= tr) b.shift();
      const a = b[0], c = b[1];
      let m = a;
      if (a.oculto) {
        if (v.koPendiente || v.yo) return;
        v.oculto = true;
        return;
      }
      if (!v.yo) {
        let x, y;
        if (a.ts > tr || !c) {
          // Sin muestra más nueva: se sigue un poco con la que lleva (60 ms
          // como mucho) y luego se espera. Mejor quieto que un salto atrás.
          const ex = !c && a.ts <= tr ? Math.min(60, tr - a.ts) / 1000 : 0;
          x = a.x + (v.velX || 0) * ex; y = a.y + (v.velY || 0) * ex;
        } else if (c.oculto) {
          x = a.x; y = a.y;
        } else {
          const f = Math.max(0, Math.min(1, (tr - a.ts) / Math.max(1, c.ts - a.ts)));
          x = a.x + (c.x - a.x) * f; y = a.y + (c.y - a.y) * f;
          const span = Math.max(1, c.ts - a.ts) / 1000;
          v.velX = (c.x - a.x) / span; v.velY = (c.y - a.y) / span;
          if (f > 0.5) m = c;
        }
        if (v.oculto) { v.x = x; v.y = y; v.huellaX = x; v.huellaY = y; v.ultX = x; v.ultY = y; }
        v.x = x; v.y = y;
        v.oculto = false;
        if (m.cara != null && !(v.caraFija && v.caraFija.hasta > ahora)) v.caraServidor = m.cara * Math.PI / 8;
        v.mira = (m.band & 8) ? -1 : 1;
      }
      v.hp = m.hp; v.maxHp = m.maxHp; v.potencia = m.pot;
      v.enArbusto = !!(m.band & 4);
    });
  }

  /**
   * SIN NOTICIAS DEL SERVIDOR. En combate llegan 20 instantáneas por segundo.
   * Sin conexión, se espera a que Socket.IO reconecte (el servidor guarda tu
   * perro un minuto). Conectado pero sin instantáneas, el servidor no nos
   * tiene enlazados: se le pide la partida cada 3 s; a los 14 s, se acabó.
   * Con la pestaña oculta update() no corre, así que esto no salta por estar
   * en segundo plano.
   */
  _vigilarConexion(ahora) {
    if (this.estado !== 'combate' && this.estado !== 'caido' && this.estado !== 'cuenta') return;
    const rendirse = (txt) => {
      this._pintarRed(false);
      this.estado = 'fin';
      this._cancelarConfirmacion();
      this.aviso(txt, { peque: true, ms: 2600 });
      this.volverEnBreve(2600);
    };
    if (!this.socket || !this.socket.connected) {
      if (!this._sinRedDesde) this._sinRedDesde = ahora;
      this._pintarRed(true);
      if (ahora - this._sinRedDesde > BattleScene.ESPERA_RED_MS) rendirse('Connection lost, back to the map');
      return;
    }
    this._sinRedDesde = 0;
    if (!this._ultimoSnap || ahora - this._ultimoSnap < 3000) { this._pintarRed(false); return; }
    this._pintarRed(true);
    if (!this._pidioVolverEn || ahora - this._pidioVolverEn > 3000) this._pedirVolver();
    if (ahora - this._ultimoSnap > 14000) rendirse('Connection lost, back to the map');
  }

  _enviarPosicion(ahora) {
    if (ahora - this.ultimoEnvio < BattleScene.ENVIO_MS || !this.pred) return;
    const movido = !(Math.abs(this.pred.x - this.envioX) < 0.05 && Math.abs(this.pred.y - this.envioY) < 0.05);
    if (!movido && ahora - this.ultimoLatido < BattleScene.LATIDO_MS) return;
    this.ultimoEnvio = ahora;
    this.ultimoLatido = ahora;
    this.envioX = this.pred.x; this.envioY = this.pred.y;
    // Las posiciones viejas no deben encolarse en una red lenta.
    const canal = this.socket && (this.socket.volatile || this.socket);
    if (!canal || !this.socket.connected) return;
    canal.emit('brawl:mover', {
      s: ++this.seq,
      x: Math.round(this.pred.x * 100) / 100,
      y: Math.round(this.pred.y * 100) / 100,
      c: this.cAplicada,
      a: Math.round((this.apunte.ang || 0) * 1000) / 1000
    });
  }

  /** La dirección del dibujo: de lado, de frente (abajo) o de espaldas (arriba). */
  _dirDe(ang) {
    const s = Math.sin(ang), c = Math.cos(ang);
    if (Math.abs(s) > 0.78 && Math.abs(c) < 0.62) return s > 0 ? 'abajo' : 'arriba';
    return '';
  }

  _pintarVistas(ahora, dt) {
    const pisadas = window.GFPisadas && this.__gfPisadas ? window.GFPisadas : null;
    this.vistas.forEach((v) => {
      if (!v.spr) return;
      const visible = v.vivo ? !v.oculto : true;
      // Escondido: se desvanece rápido (y no se dibuja nada encima).
      const alfaObjetivo = !visible ? 0 : (v.enArbusto ? (v.yo ? 0.62 : 0.55) : 1);
      if (v.vivo) v.spr.alpha += (alfaObjetivo - v.spr.alpha) * Math.min(1, dt * 14);
      const vis = v.spr.alpha > 0.02 || !v.vivo;
      v.spr.setVisible(vis);
      if (v.sombra) v.sombra.setVisible(vis).setPosition(v.x, v.y + 8);
      if (v.aro) v.aro.setVisible(vis && v.vivo).setPosition(v.x, v.y + 8);
      if (!v.vivo) return;

      // ── el paso: la animación avanza con lo andado, no con el reloj ──
      const andado = Math.hypot(v.x - v.ultX, v.y - v.ultY);
      v.ultX = v.x; v.ultY = v.y;
      if (andado < 40) v.avance += andado;               // un salto grande (recolocación) no cuenta
      const anda = andado > 0.25 * dt * 60;
      v.quietoDesde = anda ? 0 : (v.quietoDesde || ahora);
      const andando = anda || (v.quietoDesde && ahora - v.quietoDesde < 90);
      if (andando) v.proximoQuieto = ahora;
      // Hacia dónde mira: el servidor (los demás) o su andar / su disparo (tú).
      let ang = v.cara;
      if (!v.yo) {
        if (v.caraFija && v.caraFija.hasta > ahora) ang = v.caraFija.ang;
        else if (anda) ang = Math.atan2(v.velY || 0, v.velX || 0);
        else if (v.caraServidor != null) ang = v.caraServidor;
        v.cara = ang;
      }
      const dir = this._dirDe(ang || 0);
      let pose = andando ? 'camina' : 'quieto';
      if (ahora < v.ataqueHasta) pose = 'ataque';
      const id = v.marcos ? v.marcos.id : 'perro';
      let marcos = this._fotogramas(id, pose, v.mira, dir);
      if (!marcos.length && pose === 'ataque') { pose = andando ? 'camina' : 'quieto'; marcos = this._fotogramas(id, pose, v.mira, dir); }
      if (marcos.length) {
        let i;
        if (pose === 'camina') {
          // Un fotograma cada 7 px andados: la pata se apoya donde avanza.
          i = Math.floor(v.avance / 7) % marcos.length;
        } else if (pose === 'ataque') {
          i = Math.min(marcos.length - 1, Math.floor((1 - (v.ataqueHasta - ahora) / 260) * marcos.length));
        } else if (id === 'perro') {
          i = 0;                                          // el perro quieto: su primer dibujo, respirando
        } else {
          if (ahora >= v.proximoQuieto) { v.proximoQuieto = ahora + 480; v.paso = (v.paso + 1) % marcos.length; }
          i = v.paso % marcos.length;
        }
        const k = marcos[i] || marcos[0];
        if (v.spr.texture.key !== k) v.spr.setTexture(k);
        // Los animales de lado miran a la derecha: se les da la vuelta. El
        // perro tiene sus propios dibujos de cada lado.
        v.spr.setFlipX(id !== 'perro' && dir === '' && v.mira < 0);
      }
      const resp = andando ? 0 : Math.sin(ahora * 0.004 + v.id) * 0.012;
      if (v.retroceso > 0) v.retroceso = Math.max(0, v.retroceso - dt * 7);
      v.spr.setScale(1 + v.retroceso * 0.06, 1 - v.retroceso * 0.08 + resp);
      v.spr.setPosition(v.x, v.y + 9);
      v.spr.setDepth(v.y + 9);
      // Destello blanco al recibir.
      if (ahora < v.golpeHasta) v.spr.setTintFill(0xffffff);
      else if (v.spr.isTintFill || v.spr.tintFill) v.spr.clearTint();

      // ── las huellas, cada zancada ──
      if (pisadas && anda && vis) {
        const dh = Math.hypot(v.x - v.huellaX, v.y - v.huellaY);
        if (dh > 40) { v.huellaX = v.x; v.huellaY = v.y; }
        else if (dh >= 18) {
          try { pisadas.pisar(this, v.x, v.y + 7, { rumbo: Math.atan2(v.y - v.huellaY, v.x - v.huellaX), fuerza: 0.55 }); } catch (e) {}
          v.huellaX = v.x; v.huellaY = v.y;
        }
      }
      // ── la hierba se mueve al pasar (solo con quien se ve) ──
      if (anda && vis && this.R && this.arena) {
        const C = this.R.celda;
        const idx = Math.floor(v.y / C) * this.R.ancho + Math.floor(v.x / C);
        if (this.arena.arbustos.has(idx)) this._arbustosMovidos.set(idx, ahora + 320);
      }

      // ── el cartel ──
      if (v.cartel) {
        v.cartel.setVisible(vis && v.spr.alpha > 0.3);
        v.cartel.setPosition(v.x, v.y + 9 - (v.altoSprite || 30) - 4 * (this._escalaCartel || 1));
        this._pintarCartel(v);
        if (v.yo && v.municion) {
          for (let i = 0; i < 3; i++) {
            const c = Math.max(0, Math.min(1, this.municion - i));
            v.municion[i].width = 15 * c;
            v.municion[i].setAlpha(c >= 1 ? 1 : 0.55);
          }
        }
      }
      if (v.superListo) {
        const listo = this.superCarga >= 1 && this.estado === 'combate';
        v.superListo.setVisible(listo);
        if (listo) v.superListo.setPosition(v.x, v.y + 6).setDepth(v.y - 1).setAlpha(0.45 + Math.sin(ahora * 0.008) * 0.25);
      }
      if (v.yo) this._pintarVidaHUD(v.hp, v.maxHp);
    });
  }

  /** La guía de apuntado: una banda (o un abanico) hasta donde llega el tiro. */
  _pintarApunte(yo) {
    const g = this.gApunte;
    if (!g) return;
    g.clear();
    if (!yo || !yo.vivo || this.estado !== 'combate') return;
    const raton = this.apunte.raton && !this._tactil && performance.now() - this.apunte.ratonEn < 4000;
    if (!raton && !this.apunte.mostrar) return;
    const sup = this.apunte.mostrar ? this.apunte.sup : false;
    const arma = this._armaMia(sup);
    if (!arma) return;
    const ang = this.apunte.ang;
    const x = yo.x, y = yo.y - 7;
    const color = sup ? BattleScene.COLOR.oro : 0xffffff;
    const hay = sup || this.municion >= 1;
    const alfa = sup ? 0.28 : (hay ? 0.2 : 0.07);
    g.fillStyle(color, alfa);
    if (arma.balas > 1 && arma.abanico) {
      const medio = arma.abanico * Math.PI / 360;
      g.slice(x, y, arma.alcance, ang - medio, ang + medio, false);
      g.fillPath();
      g.lineStyle(1, color, alfa * 2.2);
      g.beginPath(); g.arc(x, y, arma.alcance, ang - medio, ang + medio, false); g.strokePath();
    } else {
      const w = Math.max(5, arma.radio);
      const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
      const fx = x + Math.cos(ang) * arma.alcance, fy = y + Math.sin(ang) * arma.alcance;
      g.fillPoints([{ x: x + nx, y: y + ny }, { x: fx + nx, y: fy + ny }, { x: fx - nx, y: fy - ny }, { x: x - nx, y: y - ny }], true);
      g.lineStyle(1, color, alfa * 2.2);
      g.lineBetween(x + nx, y + ny, fx + nx, fy + ny);
      g.lineBetween(x - nx, y - ny, fx - nx, fy - ny);
    }
    g.lineStyle(2, color, Math.min(0.9, alfa * 3));
    g.strokeCircle(x + Math.cos(ang) * arma.alcance, y + Math.sin(ang) * arma.alcance, 4);
  }

  /** Las matas de alrededor se vuelven transparentes cuando estás dentro, y se mueven al pasar. */
  _arbustosCerca(yo, ahora) {
    if (!this.arena || !this.R) return;
    const nuevas = new Set();
    const C = this.R.celda;
    if (yo && yo.vivo) {
      const cx = Math.floor(yo.x / C), cy = Math.floor(yo.y / C);
      if (this.R.celdas[cy * this.R.ancho + cx] === '*') {
        for (let y = cy - 2; y <= cy + 2; y++) {
          for (let x = cx - 2; x <= cx + 2; x++) {
            const lista = this.arena.arbustos.get(y * this.R.ancho + x);
            if (lista) lista.forEach((im) => nuevas.add(im));
          }
        }
      }
    }
    this.arbustosApagados.forEach((im) => { if (!nuevas.has(im) && im.active) im.setAlpha(1); });
    nuevas.forEach((im) => { if (im.active) im.setAlpha(0.42); });
    this.arbustosApagados = nuevas;
    if (!this._arbustosMovidos.size) return;
    this._arbustosMovidos.forEach((hasta, idx) => {
      const lista = this.arena.arbustos.get(idx);
      const fin = hasta <= ahora || this._reducedMotion;
      if (lista) lista.forEach((im, i) => { if (im.active && im.setRotation) im.setRotation(fin ? 0 : Math.sin(ahora * 0.03 + i) * 0.09); });
      if (fin) this._arbustosMovidos.delete(idx);
    });
  }

  _pintarReloj(ahora) {
    if (!this.el || !this.gas) return;
    if (this.estado !== 'combate' && this.estado !== 'caido') return;
    const g = this.gas;
    const pasado = ahora - this.tCombateLocal;
    const queda = Math.max(0, g.maxMs - pasado);
    const s = Math.ceil(queda / 1000);
    const txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (this._hud.reloj !== txt && this.el.relojTxt) { this.el.relojTxt.textContent = txt; this._hud.reloj = txt; }
    if (this.el.relojTxt) this.el.relojTxt.classList.toggle('poco', s <= 20);
    // La pastilla del gas: cuánto falta / que ya entra / que ya no entra más.
    if (this.el.gas) {
      const hasta = Math.max(0, Math.ceil((g.inicioMs - pasado) / 1000));
      const t = g.estado === 2 ? 'Final zone' : (g.estado === 1 || pasado >= g.inicioMs ? 'Gas closing' : 'Gas in ' + hasta + 's');
      if (this._hud.gas !== t) {
        this._hud.gas = t;
        if (this.el.gasTxt) this.el.gasTxt.textContent = t;
        this.el.gas.classList.toggle('cerrando', g.estado >= 1);
        this.el.gas.classList.remove('hidden');
      }
    }
    const av = this._avisosGas;
    if (!av.previo && pasado >= g.inicioMs - 5000 && this.estado === 'combate') {
      av.previo = true;
      this.aviso('The gas comes in 5 seconds!', { peque: true, ms: 2600 });
    }
  }

  // =========================================================================
  // ORIENTACIÓN (móvil)
  // =========================================================================
  avisoHorizontal() {
    const aviso = document.getElementById('battleRotateNotice');
    if (!aviso) return;
    const esMovil = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent) || (navigator.maxTouchPoints || 0) > 1;
    const revisar = () => {
      const vertical = window.innerHeight > window.innerWidth;
      const viva = this._escenaViva !== false;
      const aceptado = window.__gfBatallaEnVertical === true;
      aviso.classList.toggle('hidden', !(esMovil && vertical && viva && !aceptado));
      if (this.ui) this.ui.classList.toggle('vertical', vertical);
    };
    this._escucharDOM(document.getElementById('battleRotateSeguir'), 'click', () => {
      window.__gfBatallaEnVertical = true;
      revisar();
    });
    this._escenaViva = true;
    this._revisarOrientacion = revisar;
    this._escucharDOM(window, 'resize', revisar);
    this._escucharDOM(window, 'orientationchange', revisar);
    if (window.visualViewport) this._escucharDOM(window.visualViewport, 'resize', revisar);
    revisar();
    this._reloj(60, revisar);
    this._reloj(400, revisar);
  }

  // =========================================================================
  // SALIDA
  // =========================================================================
  /** Vuelve al mapa dentro de un rato, con los DOS relojes (ver volverAlMapa). */
  volverEnBreve(ms) {
    const espera = Math.max(0, ms || 0);
    try { this.time.delayedCall(espera, () => this.volverAlMapa()); } catch (e) {}
    if (this._plazoVolver) window.clearTimeout(this._plazoVolver);
    this._plazoVolver = window.setTimeout(() => { this._plazoVolver = null; this.volverAlMapa(); }, espera + 900);
  }

  /**
   * RENDIRSE / SALIR. Vale en cualquier momento. En combate cuenta como caer
   * (el servidor lo apunta como derrota); fuera de combate solo sale.
   */
  rendirse() {
    if (this.estado === 'buscando') this._emitir('brawl:salirCola');
    this._emitir('brawl:salir');
    this.volverAlMapa();
  }

  _destinoDeVuelta() {
    const candidatos = [this.volverA, 'LoadingScenegame', 'GameScene'];
    for (const clave of candidatos) {
      if (clave && this.scene.manager && this.scene.manager.getScene(clave)) return clave;
    }
    return null;
  }

  /**
   * SALIR DE LA BATALLA, CON RED DEBAJO (ver la memoria
   * "batallas-entrar-y-salir"): el cerrojo caduca a los 4 s, limpiar() va en
   * try/catch, se comprueba que la escena de destino exista (scene.start con
   * una clave desconocida no hace nada) y hay un reintento por el gestor con
   * el reloj del NAVEGADOR, que pregunta por el destino y no por esta escena.
   */
  volverAlMapa() {
    const ahora = Date.now();
    if (this._volviendo && (ahora - (this._volviendoDesde || 0)) < 4000) return;
    this._volviendo = true;
    this._volviendoDesde = ahora;

    try { this.limpiar(); } catch (e) { console.warn('⚠️ limpiar() falló al salir de la batalla:', e); }

    const destino = this._destinoDeVuelta();
    if (!destino) {
      console.error('❌ No hay ninguna escena de vuelta registrada:', this.volverA);
      if (this.ui) this.ui.classList.remove('hidden');
      this.estadoBusqueda('Could not return to the map', 'Reload the page (Ctrl+F5).');
      if (this.el && this.el.busqueda) this.el.busqueda.classList.remove('hidden');
      this._volviendo = false;
      return;
    }
    try { this.scene.start(destino, { desdeBatalla: true }); }
    catch (e) { console.warn('⚠️ scene.start(' + destino + ') falló:', e); }

    const yaEstamosEnElMapa = () => {
      try { return this.scene.manager.isActive(destino) || this.scene.manager.isVisible(destino); }
      catch (e) { return false; }
    };
    if (this._reintentoVuelta) window.clearTimeout(this._reintentoVuelta);
    this._reintentoVuelta = window.setTimeout(() => {
      this._reintentoVuelta = null;
      if (yaEstamosEnElMapa()) return;
      console.warn('⚠️ La batalla no se cerró al primer intento; reintentando.');
      try {
        this.scene.manager.stop('BattleScene');
        this.scene.manager.start(destino, { desdeBatalla: true });
      } catch (e) {
        console.error('❌ Tampoco se pudo volver por el gestor:', e);
        if (this.ui) this.ui.classList.remove('hidden');
      }
      this._volviendo = false;
    }, 1500);
  }

  /**
   * Limpieza de LÓGICA: oyentes, relojes, avisos al servidor, el DOM. Se puede
   * llamar varias veces. Las texturas no se tocan aquí (los sprites aún se
   * pintan hasta que la escena se apague): eso va en _liberarRecursos().
   */
  limpiar() {
    const yaLimpia = this._cleaned;
    this._cleaned = true;
    this._soltarDOM();
    this._pararRelojes();
    if (this._plazoConfirmar) { window.clearTimeout(this._plazoConfirmar); this._plazoConfirmar = null; }
    if (this._plazoVolver) { window.clearTimeout(this._plazoVolver); this._plazoVolver = null; }
    if (this._reintentoVuelta && yaLimpia) { window.clearTimeout(this._reintentoVuelta); this._reintentoVuelta = null; }
    if (this._paseo) { this._paseo.remove(); this._paseo = null; }
    this._diferidos = [];

    if (this.input) {
      if (this._alMoverRaton) this.input.off('pointermove', this._alMoverRaton);
      if (this._alPulsarRaton) this.input.off('pointerdown', this._alPulsarRaton);
      if (this._alSoltarRaton) this.input.off('pointerup', this._alSoltarRaton);
    }
    if (this.load && this._errorCarga) { try { this.load.off('loaderror', this._errorCarga); } catch (e) {} this._errorCarga = null; }
    this.teclas = {};
    this.disparoMantenido = false;

    try {
      if (this.socket && !yaLimpia) {
        // Avisar SIEMPRE de que nos vamos: el servidor suelta el candado. Si
        // la partida ya acabó, no hace nada.
        if (this.estado === 'buscando') this._emitir('brawl:salirCola');
        if (this.estado !== 'fin') this._emitir('brawl:salir');
      }
      this._soltarSocket();
      // EL SOCKET NO SE TOCA MÁS: es uno por pestaña y lo comparten el mapa,
      // la tienda y la batalla (ver la memoria "reconexion-y-sala").
    } catch (e) { /* sin ruido al salir */ }

    document.body.classList.remove('in-battle');
    if (this.ui) {
      this.ui.classList.add('hidden');
      this.ui.classList.remove('tactil', 'buscando', 'en-gas', 'caido', 'fin', 'vertical', 'sin-teclas');
    }
    if (this.el) {
      if (this.el.feed) this.el.feed.textContent = '';
      [this.el.caido, this.el.resultado, this.el.aviso, this.el.fuera, this.el.red].forEach((n) => n && n.classList.add('hidden'));
      if (this.el.dolor) this.el.dolor.classList.remove('activo');
    }
    this._escenaViva = false;
    const aviso = document.getElementById('battleRotateNotice');
    if (aviso) aviso.classList.add('hidden');
    this._revisarOrientacion = null;
    if (this.scale) this.scale.off('resize', this.onResize, this);
  }

  /**
   * Se llama SOLO al apagarse la escena, cuando Phaser ya ha destruido los
   * sprites: ahora sí se pueden soltar las texturas sin que nadie las pinte.
   */
  _liberarRecursos() {
    // Lo de los módulos del juego primero (usan texturas de aquí).
    try { if (window.GFAgua) window.GFAgua.desmontar(this); } catch (e) {}
    try { if (window.GFSuelo) window.GFSuelo.desmontar(this); } catch (e) {}
    this._quitarMapaAgua();
    this._sueloDe = null;
    this._agua = null;
    try { this.destruirArena(this.arena); } catch (e) {}
    try { this.destruirArena(this.fondoEspera); } catch (e) {}
    this.arena = null;
    this.fondoEspera = null;
    if (this._sueloRespaldo) { try { this._sueloRespaldo.destroy(); } catch (e) {} this._sueloRespaldo = null; }
    this.vistas.forEach((v) => this.destruirVista(v));
    this.vistas.clear();
    this.balasVista.forEach((b) => { if (b.spr) { try { b.spr.destroy(); } catch (e) {} } });
    this.balasVista = [];
    this.efectosVivos.forEach((s) => { try { s.destroy(); } catch (e) {} });
    this.efectosVivos = [];
    this.objetosVista.forEach((h) => this._quitarObjeto(h));
    this.objetosVista.clear();
    this.numerosLibres.forEach((t) => { try { t.destroy(); } catch (e) {} });
    this.numerosLibres = [];
    if (this.gasBandas) { this.gasBandas.forEach((b) => { try { b.destroy(); } catch (e) {} }); this.gasBandas = null; }
    if (this.cameras && this.cameras.main) this.cameras.main.resetFX();
    ['gApunte', 'gGas'].forEach((k) => {
      if (this[k]) { try { this[k].destroy(); } catch (e) {} this[k] = null; }
    });
    this.arbustosApagados = new Set();
    this._arbustosMovidos.clear();
    this._rotasRecientes.clear();
    this.R = null;
    this.pred = null;
    this.gas = null;

    // Las texturas propias: los animales, los tilesets del agua, el atlas y
    // el bloque de respaldo. Las piezas de efecto las lleva su propio
    // contador (GFBatallaArte), que las suelta con la última escena.
    const T = this.textures;
    try {
      T.getTextureKeys().forEach((k) => {
        if (k.indexOf('bz_esp_') === 0 || k.indexOf('bz_ts_') === 0 || k === 'bz_bloque' || k === BattleScene.ATLAS) T.remove(k);
      });
    } catch (e) {}
    try {
      BattleScene.ARENAS.forEach((id) => { if (this.cache.tilemap.exists('bz_suelo_' + id)) this.cache.tilemap.remove('bz_suelo_' + id); });
    } catch (e) {}
    if (window.GFBatallaArte && window.GFBatallaArte.olvidarEfectos) {
      try { window.GFBatallaArte.olvidarEfectos(this); } catch (e) {}
    }
    // Los sonidos de la arena, descodificados (Web Audio los guarda en crudo).
    BattleScene.SONIDOS.forEach((n) => {
      const k = 'bz_snd_' + n;
      try { if (this.sound) this.sound.removeByKey(k); } catch (e) {}
      try { if (this.cache.audio.exists(k)) this.cache.audio.remove(k); } catch (e) {}
    });
    this._especiesPendientes.clear();
  }
}

// Registro para app.js (mismo mecanismo que el resto de escenas)
if (typeof window !== 'undefined') {
  window.BattleScene = BattleScene;
  try {
    if (window.__secureSceneRegistry instanceof Map) {
      window.__secureSceneRegistry.set('BattleScene', BattleScene);
    }
  } catch (e) { /* registro opcional */ }
}
