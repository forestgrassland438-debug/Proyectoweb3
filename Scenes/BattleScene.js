/*!
 * BattleScene — La ARENA de mascotas, en tiempo real (Grassland Forest)
 * ===========================================================================
 *
 * Tú ERES tu perro: lo mueves por una arena de casillas, apuntas, ladras,
 * te escondes en la hierba alta, rompes cajas doradas para coger huesos de
 * poder y aguantas mientras la niebla cierra el campo. Gana el último en pie.
 *
 *   · 5 batallas diarias contra animales salvajes (la escalera de siempre:
 *     conejo, jabalí, cuervo, zorro y el cocodrilo de jefe).
 *   · Arena PvP: de 2 a 6 jugadores, todos contra todos.
 *   · Práctica: tú contra 3 bots, sin puntos.
 *
 * QUIÉN HACE QUÉ
 * ---------------------------------------------------------------------------
 * El SERVIDOR manda (server2.js, con el motor gf-brawl-motor.js incrustado):
 * mueve las balas, reparte el daño, decide quién cae y lleva a los bots. Esta
 * escena dibuja lo que le cuentan y hace tres cosas por su cuenta, para que
 * jugar se sienta inmediato aunque haya 150 ms de red:
 *
 *   1. Mueve a TU perro en cuanto pulsas, con las MISMAS colisiones que el
 *      servidor (GFBrawlMotor.moverCirculo). Si el servidor no está de
 *      acuerdo, manda la posición buena y el perro se recoloca suave.
 *   2. Dibuja tu ladrido en el momento de disparar, y lo casa después con la
 *      bala de verdad cuando llega.
 *   3. Pinta a los demás 110 ms "en el pasado", interpolando entre dos
 *      instantáneas: así se mueven suaves aunque lleguen a saltos.
 *
 * LA ARENA ES UN MAPA DE TILED
 * ---------------------------------------------------------------------------
 * Maps/arena_<id>.json + Game/MAPAS/arena_32.png o arena_32_b.png (la de nieve
 * y cañón; 32 px, 16x16 casillas cada una), que escribe
 * tools/generar-arenas.py. Cada mapa dice su hoja (su tileset). Suelo, decoración y puentes van como capas
 * de tilemap; muros, tapas, matas y cajas como imágenes sueltas, porque
 * tienen que ordenarse en profundidad con los perros (un perro que pasa por
 * detrás de un muro queda tapado por él). La rejilla de CHOQUES no sale del
 * mapa sino del servidor (viene en brawl:inicio): así la física del cliente es
 * siempre la del servidor, aunque alguien edite un mapa y no lo suba.
 *
 * MEMORIA (la escena se REUTILIZA entre batallas)
 * ---------------------------------------------------------------------------
 *   · Oyentes del socket: solo con `this.on()`, que los apunta; limpiar() los
 *     quita uno a uno. El socket es UNO por pestaña y no se toca más.
 *   · Oyentes del DOM: solo con `_escucharDOM()`; init() y limpiar() los
 *     sueltan (si no, desde el segundo combate cada botón contaba doble).
 *   · Relojes del navegador: solo con `_reloj()`; limpiar() los cancela.
 *   · Texturas propias (tileset, perros, animales, piezas): se sueltan al
 *     APAGARSE la escena, cuando Phaser ya ha destruido los sprites que las
 *     usan — al revés, pintaría un fotograma con la textura borrada.
 *   · Todo lo que se crea por mensajes (balas, números, chispas) tiene tope:
 *     con la pestaña oculta Phaser no avanza, pero los mensajes siguen
 *     llegando, y sin tope se apilarían hasta volver.
 */
class BattleScene extends Phaser.Scene {
  static TILESET = 'bz_arena_32';
  static RUTA_TILESET = './Game/MAPAS/arena_32.png';
  /* Las hojas de las arenas, por el NOMBRE de tileset que lleva cada mapa.
     Las cajas, el hueso, los barriles, el comedero y la carne están en las
     mismas casillas en las dos (ver _catalogo). */
  static HOJAS = {
    arena_32:   { clave: 'bz_arena_32',   ruta: './Game/MAPAS/arena_32.png' },
    arena_32_b: { clave: 'bz_arena_32_b', ruta: './Game/MAPAS/arena_32_b.png' }
  };
  static ARENAS = ['pradera', 'ruinas', 'rio', 'nieve', 'canon'];
  static RETRATO_MASCOTA = './Game/Sprites/mascota/derecha/run_1.png';

  /* Cuántas casillas se ven como mínimo. El zoom es ENTERO (en pixel art un
     zoom de 2,5 deja medio píxel en cada borde de casilla y salen costuras):
     se elige el mayor que todavía deje ver esto. */
  static VISTA = { ancho: 19, alto: 11 };
  static RETRASO_INTERP = 110;     // ms "en el pasado" a los que se pinta a los demás
  static ENVIO_MS = 50;            // 20 posiciones por segundo al servidor
  static LATIDO_MS = 250;          // aunque estés quieto, para confirmar correcciones
  static MAX_BALAS = 160;
  static MAX_EFECTOS = 140;
  /* Casillas de MARCO alrededor de la arena (un seto, solo se ve). Sin él la
     cámara choca contra el borde del mapa y, en una esquina, tu perro queda
     debajo de la tarjeta del HUD; con él siempre puede ir centrado. */
  static MARCO = 4;

  /* Los efectos de sonido de la arena: WAV de 8 bits que escribe
     tools/generar-sonidos.js (Game/MUSIC/bz_*.wav). */
  static SONIDOS = ['ladrido_1', 'ladrido_2', 'aullido', 'golpe', 'caja', 'hueso', 'ko', 'cuenta', 'ya', 'victoria', 'derrota',
                    'boom', 'cura', 'alarma'];

  static COLOR = {
    yo: 0x6fe37b, rival: 0xff6b5e, oro: 0xffd24a, municion: 0xff9c3a,
    vidaMedia: 0xe8bf3a, vidaBaja: 0xe2554a, fondoBarra: 0x0d1320, niebla: 0x3e7d2c
  };

  /* Los rivales que no son perros: sus sprites YA están en el juego (son los
     animales del mapa). Cada especie dice cuántos fotogramas tiene de cada
     pose; las que valen 0 se caen a 'quieto'. Todos miran a la DERECHA. */
  static ESPECIES = {
    perro:     { via: 'mascota',  quieto: 4, camina: 4 },
    conejo:    { via: 'animales', pre: 'conejo_',  quieto: 2, camina: 4 },
    cerdo:     { via: 'animales', pre: 'cerdo_',   quieto: 2, camina: 4 },
    cuervo:    { via: 'cuervo',   pre: 'cuervo_',  quieto: 2, camina: 4 },
    zorro:     { via: 'animales', pre: 'zorro_',   quieto: 2, camina: 4, ataque: 3 },
    zorra:     { via: 'animales', pre: 'zorra_',   quieto: 2, camina: 4, ataque: 3 },
    cocodrilo: { via: 'animales', pre: 'cocodrilo_', quieto: 2, camina: 4, ataque: 3 },
    vibora:    { via: 'animales', pre: 'serpiente_vibora_', quieto: 2, camina: 0, repta: 4, ataque: 3 },
    coral:     { via: 'animales', pre: 'serpiente_coral_',  quieto: 2, camina: 0, repta: 4, ataque: 3 },
    topo:      { via: 'animales', pre: 'topo_',    quieto: 2, camina: 4 },
    vaca:      { via: 'animales', pre: 'vaca_',    quieto: 2, camina: 4 }
  };

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
    this.huesosVista = new Map();
    this.numerosLibres = [];
    this.pred = null;
    this.desvio = { x: 0, y: 0 };      // lo que queda de una recolocación suave
    this.teclas = {};
    this.movTactil = { x: 0, y: 0 };
    this.apunte = { ang: 0, mostrar: false, sup: false, ratonX: 0, ratonY: 0, raton: false, ratonEn: 0 };
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
    this.misBajas = 0;
    this.quedan = 0;
    this.zona = null;
    this.zonaR = null;
    this.zonaRObjetivo = null;
    this.zonaC = null;                 // centro de la niebla AHORA (se desliza)
    this.zonaCObjetivo = null;
    this.zonaSig = null;               // el anillo de la siguiente zona segura
    this.zonaEstado = 0;               // 0 esperando · 1 cerrando · 2 cerrada
    this.zonaCambioEn = 0;             // performance.now() del próximo cambio
    this._zonaPintada = -1;
    this._zonaPintadaC = null;
    this._sigPintado = '';
    this._sinRedDesde = 0;             // desde cuándo no hay conexión (reconexión)
    this._pidioVolverEn = 0;
    this._texArena = BattleScene.TILESET;
    this._marcoNombre = 'muro_seto_15';
    this.tCombateLocal = 0;
    this.seguidoId = null;
    this.arbustosApagados = new Set();
    this._avisosNiebla = { previo: false, empieza: false, final: false, fase: -1 };
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
    Object.values(BattleScene.HOJAS).forEach((h) => {
      if (!this.textures.exists(h.clave)) this.load.spritesheet(h.clave, h.ruta, { frameWidth: 32, frameHeight: 32 });
    });
    BattleScene.ARENAS.forEach((id) => {
      const k = 'bz_mapa_' + id;
      if (!this.cache.tilemap.exists(k)) this.load.tilemapTiledJSON(k, './Maps/arena_' + id + '.json');
    });
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
    // `once` no basta (cada archivo que falla dispara uno); se apunta y se
    // quita en create(): el cargador es de la escena y la escena se reutiliza.
    this._errorCarga = (file) => {
      if (!file || !file.key) return;
      this._faltan.add(file.key);
      console.warn('⚠️ Arena: no se pudo cargar ' + file.key + ' (' + (file.src || file.url || '') + ')');
    };
    this.load.on('loaderror', this._errorCarga);
  }

  create() {
    if (this._errorCarga) { this.load.off('loaderror', this._errorCarga); this._errorCarga = null; }
    this.scale.on('resize', this.onResize, this);
    document.body.classList.add('in-battle');

    const A = window.GFBatallaArte;
    if (A) {
      A.efectos(this);
      if (A.proyectiles) A.proyectiles(this);
    }
    this.cameras.main.setBackgroundColor('#132a1b');
    this.gApunte = this.add.graphics().setDepth(39000);

    this.montarUI();
    this.montarControles();
    this.avisoHorizontal();
    this._ajustarZoom();
    this.montarFondoDeEspera();

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
      this._reloj(10000, () => {
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
  /** Nombre → fotograma del tileset, leído de las propiedades del propio mapa. */
  _catalogo(clave) {
    if (this._cat) return this._cat;
    const cat = {};
    try {
      const json = this.cache.tilemap.get(clave);
      const ts = json && json.data && json.data.tilesets && json.data.tilesets[0];
      (ts && ts.tiles || []).forEach((t) => {
        const p = (t.properties || []).find((q) => q.name === 'nombre');
        if (p) cat[p.value] = t.id;
      });
    } catch (e) { /* sin catálogo: se usan los de respaldo */ }
    // Los de respaldo son los del generador (tools/generar-arenas.py): la
    // fila 12 es igual en las dos hojas.
    const def = { caja_1: 192, caja_2: 193, caja_3: 194, caja_oro_1: 195, caja_oro_2: 196, hueso: 197,
                  barril_1: 202, barril_2: 203, barril_3: 204, cuenco: 205, carne: 206 };
    Object.keys(def).forEach((k) => { if (cat[k] == null) cat[k] = def[k]; });
    this._cat = cat;
    return cat;
  }

  /** La hoja (textura + nombre de tileset) y el marco que dice el mapa `clave`. */
  _hojaDe(clave) {
    let nombre = 'arena_32', marco = 'muro_seto_15';
    try {
      const json = this.cache.tilemap.get(clave);
      const datos = json && json.data;
      const ts = datos && datos.tilesets && datos.tilesets[0];
      if (ts && BattleScene.HOJAS[ts.name]) nombre = ts.name;
      const p = (datos && datos.properties || []).find((q) => q.name === 'marco');
      if (p && p.value) marco = p.value;
    } catch (e) { /* la A, por defecto */ }
    return { nombre, clave: BattleScene.HOJAS[nombre].clave, marco };
  }

  /**
   * Monta la arena `id`. Devuelve un objeto con todo lo creado, para poder
   * deshacerlo de golpe. `filas` (la rejilla del servidor) solo se usa si el
   * mapa no ha cargado: entonces se dibuja una arena de bloques de color, que
   * se juega igual.
   */
  construirArena(id, filas) {
    const clave = 'bz_mapa_' + id;
    const hoja = this._hojaDe(clave);
    const T = hoja.clave;
    this._texArena = T;
    this._marcoNombre = hoja.marco;
    const C = 32;
    const res = { id, mapa: null, capas: [], objetos: [], arbustos: new Map(), cajas: new Map(), ancho: 30, alto: 22 };
    this._cat = null;
    this._catalogo(clave);
    if (!this.cache.tilemap.exists(clave) || !this.textures.exists(T) || this._faltan.has(T)) {
      return this.construirArenaDeRespaldo(res, filas);
    }
    let mapa;
    try {
      mapa = this.make.tilemap({ key: clave });
    } catch (e) {
      console.warn('⚠️ Arena: el mapa ' + clave + ' no se pudo leer:', e);
      return this.construirArenaDeRespaldo(res, filas);
    }
    const ts = mapa.addTilesetImage(hoja.nombre, T);
    res.mapa = mapa;
    res.ancho = mapa.width;
    res.alto = mapa.height;
    const W = mapa.width;
    ['suelo', 'deco', 'puente'].forEach((n, i) => {
      const capa = mapa.createLayer(n, ts, 0, 0);
      if (capa) { capa.setDepth(-1000 + i); res.capas.push(capa); }
    });
    const esDe = (capa, x, y) => {
      const t = mapa.getTileAt(x, y, true, capa);
      return !!(t && t.index > 0);
    };
    const recorrer = (nombre, fn) => {
      const capa = mapa.getLayer(nombre);
      if (!capa) return;
      for (let y = 0; y < capa.data.length; y++) {
        const fila = capa.data[y];
        for (let x = 0; x < fila.length; x++) {
          const t = fila[x];
          if (t && t.index > 0) fn(t.index - 1, x, y);
        }
      }
    };
    /* La sombra al pie de cada muro: lo que hace que un bloque parezca alto
       y no pintado en el suelo. Un solo Graphics para todas. */
    const sombras = this.add.graphics().setDepth(-990);
    res.objetos.push(sombras);
    recorrer('muros', (f, x, y) => {
      const im = this.add.image(x * C + 16, y * C + 16, T, f).setDepth((y + 1) * C);
      res.objetos.push(im);
      if (!esDe('muros', x, y + 1)) {
        sombras.fillStyle(0x000000, 0.24);
        sombras.fillRect(x * C + 1, (y + 1) * C, C - 2, 5);
        sombras.fillStyle(0x000000, 0.11);
        sombras.fillRect(x * C + 2, (y + 1) * C + 5, C - 4, 4);
      }
    });
    // La tapa va en la casilla de ENCIMA pero es del muro de abajo: misma profundidad.
    recorrer('muros_tapa', (f, x, y) => {
      res.objetos.push(this.add.image(x * C + 16, y * C + 16, T, f).setDepth((y + 2) * C));
    });
    const apuntarArbusto = (celda, im) => {
      if (!res.arbustos.has(celda)) res.arbustos.set(celda, []);
      res.arbustos.get(celda).push(im);
    };
    recorrer('arbustos', (f, x, y) => {
      const im = this.add.image(x * C + 16, y * C + 16, T, f).setDepth((y + 1) * C - 2);
      res.objetos.push(im);
      apuntarArbusto(y * W + x, im);
    });
    recorrer('arbustos_tapa', (f, x, y) => {
      const im = this.add.image(x * C + 16, y * C + 16, T, f).setDepth((y + 2) * C - 2);
      res.objetos.push(im);
      apuntarArbusto((y + 1) * W + x, im);
    });
    this._marco(res, mapa.width, mapa.height);
    const cat = this._cat;
    recorrer('cajas', (f, x, y) => {
      const im = this.add.image(x * C + 16, y * C + 16, T, f).setDepth((y + 1) * C - 1);
      res.objetos.push(im);
      res.cajas.set(y * W + x, { img: im, oro: f === cat.caja_oro_1, barril: f === cat.barril_1, rota: false });
    });
    return res;
  }

  /** El seto que rodea la arena (decorado: los choques ya los pone el motor). */
  _marco(res, ancho, alto) {
    const T = this._texArena || BattleScene.TILESET, C = 32, M = BattleScene.MARCO;
    const W = ancho * C, H = alto * C, m = M * C;
    const cat = this._cat || {};
    const f = cat[this._marcoNombre] != null ? cat[this._marcoNombre] : cat.muro_seto_15;
    const trozos = [[-m, -m, W + 2 * m, m], [-m, H, W + 2 * m, m], [-m, 0, m, H], [W, 0, m, H]];
    trozos.forEach(([x, y, w, h]) => {
      let o;
      if (f != null && this.textures.exists(T)) o = this.add.tileSprite(x, y, w, h, T, f).setOrigin(0, 0);
      else o = this.add.rectangle(x, y, w, h, 0x2d5b30).setOrigin(0, 0);
      o.setDepth(-995);
      res.objetos.push(o);
    });
    // Sombra hacia dentro y un velo oscuro encima del seto: "esto es fuera".
    const g = this.add.graphics().setDepth(-994);
    g.fillStyle(0x07140c, 0.42);
    trozos.forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
    g.fillStyle(0x000000, 0.22);
    g.fillRect(0, 0, W, 6); g.fillRect(0, 0, 6, H);
    g.fillStyle(0x000000, 0.12);
    g.fillRect(0, H - 4, W, 4); g.fillRect(W - 4, 0, 4, H);
    res.objetos.push(g);
  }

  /** Arena de bloques de color: por si el PNG o el JSON no han llegado. */
  construirArenaDeRespaldo(res, filas) {
    const C = 32;
    const rej = filas || (window.GFBrawlMotor && window.GFBrawlMotor.ARENAS[res.id] && window.GFBrawlMotor.ARENAS[res.id].filas) || [];
    res.alto = rej.length || 22;
    res.ancho = (rej[0] || '').length || 30;
    const g = this.add.graphics().setDepth(-1000);
    res.objetos.push(g);
    g.fillStyle(0x418546, 1).fillRect(0, 0, res.ancho * C, res.alto * C);
    this._marco(res, res.ancho, res.alto);
    for (let y = 0; y < res.alto; y++) {
      for (let x = 0; x < res.ancho; x++) {
        const ch = (rej[y] || '').charAt(x);
        if (ch === '~') g.fillStyle(0x4aa8cf, 1).fillRect(x * C, y * C, C, C);
        if (ch === '=') g.fillStyle(0xb07f45, 1).fillRect(x * C, y * C, C, C);
        if (ch === '#') {
          const r = this.add.rectangle(x * C + 16, y * C + 16, C, C, 0x8b8376).setStrokeStyle(2, 0x3c3730).setDepth((y + 1) * C);
          res.objetos.push(r);
        }
        if (ch === '*') {
          const r = this.add.rectangle(x * C + 16, y * C + 16, C, C, 0x4c9a46, 0.9).setDepth((y + 1) * C - 2);
          res.objetos.push(r);
          res.arbustos.set(y * res.ancho + x, [r]);
        }
        if (ch === 'c' || ch === 'o' || ch === 'x') {
          const color = ch === 'o' ? 0xd9b02a : (ch === 'x' ? 0xb8392e : 0xb07f45);
          const r = this.add.rectangle(x * C + 16, y * C + 16, C - 6, C - 6, color)
            .setStrokeStyle(2, 0x3a2516).setDepth((y + 1) * C - 1);
          res.objetos.push(r);
          res.cajas.set(y * res.ancho + x, { img: r, oro: ch === 'o', barril: ch === 'x', rota: false, respaldo: true });
        }
        if (ch === '+') {
          const r = this.add.ellipse(x * C + 16, y * C + 18, 22, 12, 0xa6582f).setStrokeStyle(2, 0x2a140a).setDepth(-990);
          res.objetos.push(r);
        }
      }
    }
    return res;
  }

  destruirArena(res) {
    if (!res) return;
    res.objetos.forEach((o) => { try { o.destroy(); } catch (e) {} });
    res.capas.forEach((c) => { try { c.destroy(); } catch (e) {} });
    if (res.mapa) { try { res.mapa.destroy(); } catch (e) {} }
    res.objetos.length = 0;
    res.capas.length = 0;
    res.arbustos.clear();
    res.cajas.clear();
  }

  /** Mientras se busca partida, se ve una arena de fondo y la cámara pasea. */
  montarFondoDeEspera() {
    const ids = BattleScene.ARENAS;
    const id = ids[(this._battleRun || 0) % ids.length];
    this.fondoEspera = this.construirArena(id);
    const cam = this.cameras.main;
    const W = this.fondoEspera.ancho * 32, H = this.fondoEspera.alto * 32;
    const m = BattleScene.MARCO * 32;
    cam.setBounds(-m, -m, W + 2 * m, H + 2 * m);
    cam.centerOn(W * 0.3, H * 0.4);
    if (!this._reducedMotion) {
      this._paseo = this.tweens.add({
        targets: cam, scrollX: { from: cam.scrollX, to: cam.scrollX + W * 0.35 },
        duration: 16000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
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
  _ajustarZoom() {
    const cam = this.cameras.main;
    const w = this.scale.width, h = this.scale.height;
    const m2 = BattleScene.MARCO * 64;
    const anchoArena = (this.R ? this.R.anchoPx : 960) + m2, altoArena = (this.R ? this.R.altoPx : 704) + m2;
    let z = Math.floor(Math.min(w / (BattleScene.VISTA.ancho * 32), h / (BattleScene.VISTA.alto * 32)));
    // Nunca tan lejos que se vea fuera de la arena.
    z = Math.max(z, Math.ceil(w / anchoArena), Math.ceil(h / altoArena));
    z = Math.max(1, Math.min(8, z));
    this._zoom = z;
    cam.setZoom(z);
    cam.setRoundPixels(true);
    // Escala de los carteles: se diseñan en píxeles de CSS (texto de 12 px),
    // y un píxel de CSS son dpr/zoom píxeles del mundo.
    this._dpr = Math.max(1, Math.round(w / Math.max(1, window.innerWidth || w)));
    this._escalaCartel = this._dpr / z;
    this.vistas.forEach((v) => this._escalarCartel(v));
  }

  onResize() {
    this._ajustarZoom();
    if (this._revisarOrientacion) this._revisarOrientacion();
  }

  // =========================================================================
  // LUCHADORES
  // =========================================================================
  _rutasEspecie(id, pose, n) {
    const E = BattleScene.ESPECIES[id];
    if (!E || E.via === 'mascota') return [];
    const out = [];
    for (let i = 1; i <= n; i++) {
      const base = E.via === 'cuervo' ? './Game/Sprites/cuervo/' : './Game/Sprites/animales/';
      out.push(['bz_esp_' + id + '_' + pose + '_' + i, base + E.pre + pose + '_' + i + '.png']);
    }
    return out;
  }

  /**
   * Descarga los fotogramas de una especie. Se espera MIRANDO LAS TEXTURAS,
   * no un evento del cargador: `load.start()` se ignora si ya está cargando y
   * el 'complete' de una tanda resolvía también la de otra especie que aún no
   * había llegado (el fallo del "peleo contra alguien invisible").
   */
  cargarEspecie(id) {
    const E = BattleScene.ESPECIES[id];
    if (!E || E.via === 'mascota' || this._cleaned) return Promise.resolve(true);
    if (this._especiesPendientes.has(id)) return this._especiesPendientes.get(id);
    const claves = [];
    let pedidos = 0;
    [['quieto', E.quieto], [E.repta ? 'repta' : 'camina', E.repta || E.camina], ['ataque', E.ataque || 0]].forEach(([pose, n]) => {
      this._rutasEspecie(id, pose, n || 0).forEach(([k, ruta]) => {
        claves.push(k);
        if (this.textures.exists(k)) return;
        this.load.image(k, ruta);
        pedidos++;
      });
    });
    if (!pedidos) return Promise.resolve(true);
    const run = this._battleRun;
    const p = new Promise((resolve) => {
      const t0 = Date.now();
      const revisar = () => {
        if (this._cleaned || this._battleRun !== run) { resolve(false); return; }
        if (claves.every((k) => this.textures.exists(k) || this._faltan.has(k))) { resolve(true); return; }
        if (Date.now() - t0 > 6000) { resolve(false); return; }
        if (!this.load.isLoading()) { try { this.load.start(); } catch (e) {} }
        this._reloj(80, revisar);
      };
      this._reloj(0, revisar);
    });
    this._especiesPendientes.set(id, p);
    return p;
  }

  _fotogramas(id, pose, lado) {
    const E = BattleScene.ESPECIES[id] || BattleScene.ESPECIES.perro;
    if (E.via === 'mascota') {
      const out = [];
      for (let i = 1; i <= 4; i++) {
        const k = 'bz_esp_perro_' + (lado < 0 ? 'i' : 'd') + '_' + i;
        if (this.textures.exists(k)) out.push(k);
      }
      return out;
    }
    const real = pose === 'camina' ? (E.repta ? 'repta' : (E.camina ? 'camina' : 'quieto')) : pose;
    const n = real === 'quieto' ? E.quieto : real === 'ataque' ? (E.ataque || 0) : (E.repta || E.camina || 0);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const k = 'bz_esp_' + id + '_' + real + '_' + i;
      if (this.textures.exists(k)) out.push(k);
    }
    return out;
  }

  crearVista(l) {
    const C = BattleScene.COLOR;
    const esYo = l.id === this.yoId;
    const v = {
      id: l.id, datos: l, especie: l.especie || 'perro', yo: esYo,
      x: l.x, y: l.y, hp: l.hp, maxHp: l.maxHp, potencia: 0,
      vivo: true, oculto: false, enArbusto: false, mira: 1, andando: false,
      buffer: [{ t: performance.now(), x: l.x, y: l.y }],
      paso: 0, proximoPaso: 0, golpeHasta: 0, retroceso: 0,
      ultTexto: {}
    };
    const A = window.GFBatallaArte;
    v.sombra = (A && this.textures.exists(A.pieza('sombra')))
      ? this.add.image(l.x, l.y + 8, A.pieza('sombra')).setDisplaySize(30, 12).setAlpha(0.55)
      : this.add.ellipse(l.x, l.y + 8, 26, 9, 0x000000, 0.3);
    v.spr = this.add.sprite(l.x, l.y + 9, '__DEFAULT').setOrigin(0.5, 1);
    if (esYo) {
      // Un aro a los pies: dónde estás, de un vistazo, en mitad del lío.
      v.aro = this.add.ellipse(l.x, l.y + 8, 30, 12).setStrokeStyle(2, C.yo, 0.9).setFillStyle(C.yo, 0.12);
      v.superListo = (A && this.textures.exists(A.pieza('brillo')))
        ? this.add.image(l.x, l.y, A.pieza('brillo')).setTint(C.oro).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDisplaySize(64, 40)
        : null;
    } else {
      // Los rivales, con un aro rojo fino: en PvP todos son perros iguales y
      // esto (con la barra roja) es lo que dice de un vistazo quién no eres tú.
      v.aro = this.add.ellipse(l.x, l.y + 8, 28, 11).setStrokeStyle(1.5, C.rival, 0.8).setFillStyle(C.rival, 0.07);
    }
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
      v.escala = 1;
      v.marcos = null;
      return;
    }
    v.spr.setTexture(k);
    const w = v.spr.width || 32, h = v.spr.height || 32;
    let esc = id === 'perro' ? 1 : Math.min(52 / w, 34 / h);
    esc = Math.max(0.6, Math.min(1.3, esc));
    v.escala = esc;
    v.spr.setScale(esc);
    v.altoSprite = h * esc;
    v.marcos = { id };
  }

  _crearCartel(v) {
    const C = BattleScene.COLOR;
    const res = this._dpr || 1;
    const est = (tam, color) => ({
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontStyle: 'bold',
      fontSize: tam + 'px', color, stroke: '#0a0f1a', strokeThickness: 3, resolution: res
    });
    const d = v.datos;
    const c = this.add.container(v.x, v.y).setDepth(43000);
    /* Medidas en píxeles de CSS (el contenedor se escala a dpr/zoom):
         nombre y nivel  ── encima
         [■■■■■■■ 1520]  ── la barra de vida, con el número dentro
         ▮▮▮             ── tu munición (solo la tuya), debajo */
    v.nombre = this.add.text(0, -13, d.petName || 'Pet', est(12, v.yo ? '#c8ffcf' : '#ffffff')).setOrigin(0.5, 1);
    v.nivel = this.add.text(0, -13, '', est(10, '#ffdc7a')).setOrigin(0, 1);
    v.barraFondo = this.add.rectangle(0, -6, 54, 11, C.fondoBarra).setOrigin(0.5, 0.5).setStrokeStyle(1, 0x000000, 0.95);
    v.barra = this.add.rectangle(-26, -6, 52, 9, v.yo ? C.yo : C.rival).setOrigin(0, 0.5);
    v.vidaTxt = this.add.text(0, -6, '', est(9, '#ffffff')).setOrigin(0.5, 0.5);
    v.huesos = this.add.text(30, -6, '', est(10, '#ffdc7a')).setOrigin(0, 0.5);
    c.add([v.barraFondo, v.barra, v.nombre, v.nivel, v.vidaTxt, v.huesos]);
    if (v.yo) {
      v.municion = [];
      for (let i = 0; i < 3; i++) {
        const fondo = this.add.rectangle(-26 + i * 18, 3, 16, 5, C.fondoBarra).setOrigin(0, 0.5).setStrokeStyle(1, 0x000000, 0.85);
        const lleno = this.add.rectangle(-26 + i * 18, 3, 16, 5, C.municion).setOrigin(0, 0.5);
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
    v.nivel.setText('Lv.' + (d.nivel || 1));
    // Nombre y nivel centrados JUNTOS sobre la cabeza.
    const total = v.nombre.width + 5 + v.nivel.width;
    v.nombre.setOrigin(0, 1).setX(-total / 2);
    v.nivel.setX(-total / 2 + v.nombre.width + 5);
  }

  _escalarCartel(v) {
    if (!v.cartel) return;
    const s = this._escalaCartel || 1;
    v.cartel.setScale(s);
    v.cartelAlto = (v.altoSprite || 30) + 4;
  }

  _pintarCartel(v) {
    const C = BattleScene.COLOR;
    const p = Math.max(0, Math.min(1, v.hp / Math.max(1, v.maxHp)));
    v.barra.width = 52 * p;
    if (!v.yo) v.barra.fillColor = C.rival;
    else v.barra.fillColor = p > 0.5 ? C.yo : (p > 0.25 ? C.vidaMedia : C.vidaBaja);
    const txt = String(Math.max(0, Math.round(v.hp)));
    if (v.ultTexto.vida !== txt) { v.vidaTxt.setText(txt); v.ultTexto.vida = txt; }
    const hu = v.potencia > 0 ? '🦴' + v.potencia : '';
    if (v.ultTexto.huesos !== hu) { v.huesos.setText(hu); v.ultTexto.huesos = hu; }
  }

  destruirVista(v) {
    ['sombra', 'spr', 'aro', 'superListo', 'cartel'].forEach((k) => {
      if (v[k]) { try { v[k].destroy(); } catch (e) {} v[k] = null; }
    });
  }

  // =========================================================================
  // INTERFAZ HTML
  // =========================================================================
  montarUI() {
    this.ui = document.getElementById('battleUI');
    if (!this.ui) { console.error('❌ Falta #battleUI en el HTML'); return; }
    this.ui.classList.remove('hidden');
    this.ui.classList.add('buscando');
    const $ = (id) => document.getElementById(id);
    this.el = {
      yo: $('bzYo'), retrato: $('bzRetrato'), nombre: $('bzYoNombre'), nivel: $('bzYoNivel'),
      vidaBarra: $('bzYoVidaBarra'), vida: $('bzYoVida'), vidaTxt: $('bzYoVidaTxt'),
      huesos: $('bzYoHuesos'), bajas: $('bzYoBajas'),
      modo: $('bzModo'), relojTxt: $('bzReloj'), quedan: $('bzQuedan'), salir: $('bzSalir'),
      feed: $('bzFeed'), aviso: $('bzAviso'), dolor: $('bzDolor'),
      busqueda: $('bzBusqueda'), busqTitulo: $('bzBusquedaTitulo'), busqTexto: $('bzBusquedaTexto'),
      sala: $('bzSala'), busqTiempo: $('bzBusquedaTiempo'), practicar: $('bzPracticar'), cancelar: $('bzCancelar'),
      tactil: $('bzTactil'), zonaMover: $('bzZonaMover'), stickMover: $('bzStickMover'),
      zonaDisparo: $('bzZonaDisparo'), stickDisparo: $('bzStickDisparo'), superBtn: $('bzSuper'), superAnillo: $('bzSuperAnillo'),
      pie: $('bzPie'), superBarra: $('bzSuperBarra'), superRelleno: $('bzSuperRelleno'), superTexto: $('bzSuperTexto'),
      caido: $('bzCaido'), caidoTitulo: $('bzCaidoTitulo'), caidoTexto: $('bzCaidoTexto'), mirar: $('bzMirar'), volverCaido: $('bzVolverCaido'),
      resultado: $('bzResultado'), resPuesto: $('bzResPuesto'), resTitulo: $('bzResTitulo'), resSub: $('bzResSub'),
      resPremios: $('bzResPremios'), resTabla: $('bzResTabla'), otraVez: $('bzOtraVez'), volver: $('bzVolver'),
      nieblaEstado: $('bzNieblaEstado'), fuera: $('bzFuera'), fueraTxt: $('bzFueraTxt'), flecha: $('bzFlecha'),
      red: $('bzRed')
    };
    const e = this.el;
    // Estado de partida: todo a cero (la UI es la misma de la batalla anterior).
    [e.caido, e.resultado, e.aviso, e.nieblaEstado, e.fuera, e.red].forEach((n) => n && n.classList.add('hidden'));
    if (this.ui) this.ui.classList.remove('en-niebla');
    if (e.busqueda) e.busqueda.classList.remove('hidden');
    if (e.feed) e.feed.textContent = '';
    if (e.dolor) e.dolor.classList.remove('activo');
    if (e.relojTxt) { e.relojTxt.textContent = '--:--'; e.relojTxt.classList.remove('niebla', 'poco'); }
    if (e.quedan) e.quedan.textContent = '-';
    if (e.modo) e.modo.textContent = this.modo === 'bot' ? 'Daily battle' : (this.modo === 'practica' ? 'Practice' : 'Arena PvP');
    if (e.nombre) e.nombre.textContent = this.datosJugador.petName && this.datosJugador.petName !== '---' ? this.datosJugador.petName : 'Your dog';
    if (e.nivel) e.nivel.textContent = '';
    if (e.retrato) e.retrato.style.backgroundImage = "url('" + BattleScene.RETRATO_MASCOTA + "')";
    if (e.huesos) e.huesos.textContent = '🦴 0';
    if (e.bajas) e.bajas.textContent = '💥 0';
    this._pintarVidaHUD(1, 1);
    this._pintarSuperHUD(0);
    if (e.practicar) e.practicar.classList.toggle('hidden', this.modo !== 'pvp');
    if (e.sala) e.sala.textContent = '';
    if (e.busqTiempo) e.busqTiempo.textContent = '';
    this.estadoBusqueda(
      this.modo === 'bot' ? 'Preparing your daily battle…' : (this.modo === 'practica' ? 'Preparing practice…' : 'Searching for players…'),
      this.modo === 'pvp' ? 'Be the last dog standing. Up to 6 players.' : 'Get ready!'
    );

    this._escucharDOM(e.salir, 'click', () => this.pedirRendicion(e.salir));
    this._escucharDOM(e.cancelar, 'click', () => this.rendirse());
    this._escucharDOM(e.practicar, 'click', () => this.pasarAPractica());
    this._escucharDOM(e.mirar, 'click', () => { if (e.caido) e.caido.classList.add('hidden'); });
    this._escucharDOM(e.volverCaido, 'click', () => this.rendirse());
    this._escucharDOM(e.volver, 'click', () => this.volverAlMapa());
    this._escucharDOM(e.otraVez, 'click', () => this.jugarOtraVez());
    this._cancelarConfirmacion();
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
    if (this._hud.vidaClase !== clase) {
      e.vidaBarra.classList.remove('media', 'baja');
      if (clase) e.vidaBarra.classList.add(clase);
      this._hud.vidaClase = clase;
    }
    const txt = Math.max(0, Math.round(hp)) + ' / ' + Math.round(maxHp);
    if (this._hud.vidaTxt !== txt) { e.vidaTxt.textContent = txt; this._hud.vidaTxt = txt; }
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
    if (e.superTexto) e.superTexto.textContent = lista ? 'SUPER READY · E' : 'SUPER';
    if (e.superAnillo) e.superAnillo.style.strokeDashoffset = String(176 * (1 - c));
    if (e.superBtn) { e.superBtn.classList.toggle('listo', lista); e.superBtn.disabled = !lista; }
  }

  aviso(texto, op) {
    const el = this.el && this.el.aviso;
    if (!el) return;
    op = op || {};
    el.textContent = texto;
    el.classList.remove('hidden', 'pop', 'oro', 'peque');
    if (op.oro) el.classList.add('oro');
    if (op.peque) el.classList.add('peque');
    void el.offsetWidth;                       // reinicia la animación
    if (!this._reducedMotion) el.classList.add('pop');
    if (this._plazoAviso) window.clearTimeout(this._plazoAviso);
    this._plazoAviso = this._reloj(op.ms || 1100, () => { el.classList.add('hidden'); });
  }

  alFeed(html) {
    const f = this.el && this.el.feed;
    if (!f) return;
    const li = document.createElement('li');
    li.innerHTML = html;
    f.appendChild(li);
    while (f.children.length > 5) f.removeChild(f.firstChild);
    this._reloj(5200, () => { li.classList.add('sale'); this._reloj(420, () => li.remove()); });
  }

  _esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    if (boton) { boton.classList.add('confirmar'); boton.textContent = 'Confirm?'; }
    if (this._plazoConfirmar) window.clearTimeout(this._plazoConfirmar);
    this._plazoConfirmar = this._reloj(3500, () => this._cancelarConfirmacion());
  }

  _cancelarConfirmacion() {
    if (this._plazoConfirmar) { window.clearTimeout(this._plazoConfirmar); this._plazoConfirmar = null; }
    this._confirmandoRendicion = false;
    const b = this.el && this.el.salir;
    if (!b) return;
    b.classList.remove('confirmar');
    b.textContent = (this.estado === 'fin' || this.estado === 'caido') ? 'Back to map' : 'Surrender';
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
    // Cronómetro de la búsqueda, con el reloj del navegador (corre aunque
    // Phaser esté parado con la pestaña oculta). Con _reloj y no con un
    // setInterval: se apaga solo al limpiar la escena y al dejar de buscar.
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
    const ev = this.modo === 'bot' ? 'brawl:bot' : (this.modo === 'practica' ? 'brawl:practica' : 'brawl:cola');
    this._emitir(ev);
    /* VIGILANTE. Si la petición se pierde (el socket se reconecta justo en
       medio), se repite una vez; si aun así no llega nada, se avisa y se
       vuelve al mapa en vez de dejar al jugador mirando un "buscando…" eterno.
       En PvP solo se vigila que la cola conteste: esperar a otros jugadores
       puede tardar de verdad, y para eso está el botón de cancelar. */
    const run = this._battleRun;
    this._intentoPeticion = (this._intentoPeticion || 0) + 1;
    const intentoDe = this._intentoPeticion;
    this._reloj(6000, () => {
      if (this._battleRun !== run || this.estado !== 'buscando' || this._respuestaCola || this.matchId) return;
      if (intentoDe !== this._intentoPeticion) return;
      console.warn('⏳ La arena no contestó; se repite la petición');
      this._reintentado = true;
      this._emitir(ev);
      this._reloj(8000, () => {
        if (this._battleRun !== run || this.estado !== 'buscando' || this._respuestaCola || this.matchId) return;
        this.estadoBusqueda('Could not start the battle', 'The server did not answer. Back to the map…');
        this.estado = 'fin';
        this.volverEnBreve(2600);
      });
    });
    // En PvP, a los 4 minutos sin rival se para (y se ofrece practicar).
    if (this.modo === 'pvp') {
      this._reloj(240000, () => {
        if (this._battleRun !== run || this.estado !== 'buscando' || this.matchId) return;
        this.estadoBusqueda('No players right now', 'Try again later — or practice against bots meanwhile.');
        this._emitir('brawl:salirCola');
      });
    }
  }

  pasarAPractica() {
    if (this.estado !== 'buscando') return;
    this._aceptaPractica = true;
    this.modo = 'practica';
    this._respuestaCola = false;
    if (this.el && this.el.practicar) this.el.practicar.classList.add('hidden');
    if (this.el && this.el.modo) this.el.modo.textContent = 'Practice';
    if (this.el && this.el.sala) this.el.sala.textContent = '';
    this.estadoBusqueda('Preparing practice…', 'You against 3 bots. No points — just training.');
    this._pedirPartida();
  }

  registrarSocket() {
    this.on('brawl:enCola', (d) => {
      this._respuestaCola = true;
      if (this.estado !== 'buscando' || this.modo !== 'pvp') return;
      this.estadoBusqueda('Searching for players…', 'Be the last dog standing. Up to 6 players.');
      if (this.el.sala) this.el.sala.textContent = d.enCola > 1 ? (d.enCola + ' players searching') : '';
    });
    this.on('brawl:sala', (d) => {
      this._respuestaCola = true;
      if (this.estado !== 'buscando' || this.modo !== 'pvp') return;
      const n = Number(d.jugadores) || 2, max = Number(d.max) || 6;
      const seg = Math.ceil((Number(d.empiezaEnMs) || 0) / 1000);
      this.estadoBusqueda('Players found!', 'Waiting a few seconds for more to join…');
      if (this.el.sala) {
        let puntos = '';
        for (let i = 0; i < max; i++) puntos += '<i class="' + (i < n ? 'lleno' : '') + '"></i>';
        this.el.sala.innerHTML = n + ' / ' + max + ' · starting in ' + seg + 's <span class="puntos">' + puntos + '</span>';
      }
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
         dejaría esa partida empezando sin nadie (y gastaría una diaria): se
         sigue esperando a su brawl:inicio. */
      if (d.error === 'already_in_battle' && this._reintentado && this.estado === 'buscando') {
        this._reintentado = false;
        return;
      }
      this._respuestaCola = true;
      let msg = 'Could not start the battle.';
      if (d.error === 'not_authenticated') msg = 'You must be logged in to battle.';
      else if (d.error === 'already_in_battle') msg = 'You are already in a battle (maybe in another tab).';
      else if (d.error === 'daily_limit') msg = 'You already played your ' + ((d.daily && d.daily.max) || 5) + ' daily battles. Come back tomorrow!';
      if (this.estado === 'buscando') this.estadoBusqueda('Oops', msg + ' Back to the map…');
      else this.aviso(msg, { peque: true, ms: 3000 });
      this.estado = 'fin';
      this._cancelarConfirmacion();
      this.volverEnBreve(3200);
    });
    /* SI SE CAE LA CONEXIÓN A MITAD, NO SE PIERDE LA PARTIDA (2026-10-02).
       El servidor guarda tu perro unos segundos con un piloto automático (ver
       brawlEsperarVuelta en server2.js). Socket.IO reconecta solo; en cuanto
       vuelve, se pide la partida ('brawl:volver') y llega un brawl:inicio con
       `reanudar` (ver reanudarPartida). Mientras, un cartel "Reconnecting…". */
    this.on('disconnect', () => {
      if (!this.matchId || this.estado === 'fin') return;
      if (!this._sinRedDesde) this._sinRedDesde = performance.now();
      this._pintarRed(true);
    });
    this.on('connect', () => this._pedirVolver());
    this.on('brawl:volverError', (d) => {
      if (!this.matchId || this.estado === 'fin') return;
      this._pintarRed(false);
      this.estado = 'fin';
      this._cancelarConfirmacion();
      this.aviso(d && d.error === 'ended' ? 'The battle ended while you were away' : 'Could not rejoin the battle — back to the map',
                 { peque: true, ms: 2600 });
      this.volverEnBreve(2600);
    });
  }

  /** Recién (re)conectado en plena partida: pedirla otra vez. */
  _pedirVolver() {
    if (!this.matchId || this.estado === 'fin' || this.estado === 'buscando') return;
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
      // cortó la red y el servidor nos devuelve la partida tal y como va.
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

    this.quitarFondoDeEspera();
    this.arena = this.construirArena(d.arena.id, d.arena.filas);
    this.arena.cajas.forEach((c, i) => { if (!vivas.has(i)) this._cajaRota(i, c, false); });

    this._ajustarZoom();
    const cam = this.cameras.main;
    const m = BattleScene.MARCO * 32;
    cam.setBounds(-m, -m, this.R.anchoPx + 2 * m, this.R.altoPx + 2 * m);

    d.luchadores.forEach((l) => this.crearVista(l));
    const yo = this.vistas.get(this.yoId);
    if (yo) {
      this.pred = { x: yo.x, y: yo.y };
      cam.centerOn(yo.x, yo.y);
      this._pintarVidaHUD(yo.hp, yo.maxHp);
      if (this.el && this.el.nivel) this.el.nivel.textContent = 'Lv.' + (yo.datos.nivel || 1);
      if (this.el && this.el.nombre) this.el.nombre.textContent = yo.datos.petName || 'Your dog';
    }
    // Los animales, a por sus sprites (mientras, se ven como perro).
    const run = this._battleRun;
    new Set(d.luchadores.map((l) => l.especie)).forEach((esp) => {
      this.cargarEspecie(esp).then(() => {
        if (this._cleaned || this._battleRun !== run) return;
        this.vistas.forEach((v) => { if (v.especie === esp && v.vivo) this._vestir(v); });
      });
    });

    this._ponerZona(d.zona);
    this._ponerObjetos(d.objetos);
    // Los que ya habían caído (si se entra a mitad: reconexión).
    d.luchadores.forEach((l) => {
      const v = this.vistas.get(l.id);
      if (v && l.vivo === false && v.vivo) { v.vivo = false; this._caer(v); }
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
    // Los avisos de la niebla que ya pasaron, no se repiten.
    const z = this.zona;
    if (z && enCombateMs >= z.inicioMs - 5000) this._avisosNiebla.previo = true;
    if (z && enCombateMs >= z.inicioMs) this._avisosNiebla.empieza = true;
  }

  /** La niebla del inicio: el plan de fases y dónde está ahora. */
  _ponerZona(z) {
    this.zona = z || null;
    if (!z) return;
    const r = Number.isFinite(z.r) ? z.r : z.r0;
    this.zonaR = r;
    this.zonaRObjetivo = r;
    this.zonaC = { x: z.cx, y: z.cy };
    this.zonaCObjetivo = { x: z.cx, y: z.cy };
    // Hasta la primera instantánea, el anillo siguiente sale del plan.
    const f = Array.isArray(z.fases) && z.fases[0];
    this.zonaSig = f ? { x: f[2], y: f[3], r: f[4] } : null;
    this._zonaPintada = -1;
    this._sigPintado = '';
  }

  /** Lo que hay en el suelo al entrar (huesos y carne). */
  _ponerObjetos(lista) {
    this.huesosVista.forEach((h) => { try { if (h.flota) h.flota.remove(); if (h.late) h.late.remove(); h.img.destroy(); if (h.brillo) h.brillo.destroy(); } catch (e) {} });
    this.huesosVista.clear();
    (lista || []).forEach((o) => this.alObjeto({ id: o[0], x: o[1], y: o[2], tipo: o[3] }));
  }

  /**
   * VUELVE LA CONEXIÓN a mitad de partida (ver brawlVolver en server2.js).
   * La arena ya está montada: se pone al día lo que haya cambiado mientras
   * tanto —cajas rotas, quién ha caído, dónde está cada uno, lo del suelo, la
   * niebla— y se sigue jugando. Tu perro lo ha llevado un piloto automático:
   * se recoloca donde lo dejó.
   */
  reanudarPartida(d) {
    const M = window.GFBrawlMotor;
    if (!M || !this.R || !this.arena) return;
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
      if (l.vivo === false) { if (v.vivo) { v.vivo = false; this._caer(v); } return; }
      v.x = l.x; v.y = l.y;
      if (v.buffer) v.buffer.length = 0;
      v.oculto = false;
      if (v.yo) {
        this.pred = { x: l.x, y: l.y };
        this.desvio.x = 0; this.desvio.y = 0;
        this._pintarVidaHUD(v.hp, v.maxHp);
      }
    });
    this.quedan = d.luchadores.filter((l) => l.vivo !== false).length;
    if (this.el && this.el.quedan) this.el.quedan.textContent = String(this.quedan);
    this._ponerZona(d.zona);
    this._ponerObjetos(d.objetos);
    this.balasVista.forEach((b) => this._quitarBala(b, false));
    this.balasVista = [];
    if (d.fase === 'combate') this._empezarYa(Number(d.enCombateMs) || 0);
    this._sinRedDesde = 0;
    this._pidioVolverEn = 0;
    this._pintarRed(false);
    this.aviso('Reconnected!', { peque: true, ms: 1400 });
  }

  alSnap(d) {
    if (!this.matchId || !Array.isArray(d.f)) return;
    const ahora = performance.now();
    this._ultimoSnap = ahora;
    const z = d.z;
    if (Array.isArray(z)) {
      // [radio, x, y, radio sig., x sig., y sig., estado, ms hasta el cambio]
      this.zonaRObjetivo = z[0];
      this.zonaCObjetivo = { x: z[1], y: z[2] };
      if (!this.zonaC) this.zonaC = { x: z[1], y: z[2] };
      this.zonaSig = z[3] > 0 ? { r: z[3], x: z[4], y: z[5] } : null;
      if (z[6] !== this.zonaEstado && z[6] === 1) this._alCerrarNiebla();
      this.zonaEstado = z[6];
      this.zonaCambioEn = ahora + (Number(z[7]) || 0);
    } else if (Number.isFinite(z)) this.zonaRObjetivo = z;     // servidor de antes
    const vistos = new Set();
    for (let i = 0; i < d.f.length; i++) {
      const f = d.f[i];
      const v = this.vistas.get(f[0]);
      if (!v || !v.vivo) continue;
      vistos.add(f[0]);
      v.hp = f[3];
      v.andando = !!(f[4] & 2);
      v.enArbusto = !!(f[4] & 4);
      v.potencia = f[5] || 0;
      if (f[6]) v.maxHp = f[6];
      if (v.yo) continue;
      v.mira = (f[4] & 8) ? -1 : 1;
      if (v.oculto) {
        // Reaparece: sin interpolar desde donde se escondió (sería un fogonazo
        // cruzando media arena), se planta donde está.
        v.buffer.length = 0;
        v.x = f[1]; v.y = f[2];
      }
      v.oculto = false;
      v.buffer.push({ t: ahora, x: f[1], y: f[2] });
      if (v.buffer.length > 24) v.buffer.splice(0, v.buffer.length - 24);
    }
    // Los que no vienen están escondidos (en la hierba, lejos de ti).
    this.vistas.forEach((v, id) => { if (!v.yo && v.vivo && !vistos.has(id)) v.oculto = true; });

    const y = d.y;
    if (y) {
      this.municion = (Number(y.m) || 0) / 100;
      this.superCarga = (Number(y.s) || 0) / 100;
      const yo = this.vistas.get(this.yoId);
      if (yo) { yo.hp = y.hp; this._pintarVidaHUD(yo.hp, yo.maxHp); }
      if (Number(y.c) > this.cAplicada) {
        if (y.x != null && y.y != null) this._recolocar(Number(y.x), Number(y.y));
        this.cAplicada = Number(y.c);
      }
    }
    this._pintarSuperHUD(this.superCarga);
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
      this._pintarSuperHUD(0);
    } else {
      if (this.municion < 1) { this._sinMunicion(yo); return false; }
      this.municion -= 1;
    }
    this.ultimoDisparoLocal = ahora;
    const s = ++this.seqDisparo;
    this._emitir('brawl:disparo', { a: Math.round(ang * 1000) / 1000, sup: sup ? 1 : 0, s });
    // Se dibuja YA, sin esperar al servidor; luego se casa con la de verdad.
    const balas = arma.balas || 1;
    for (let i = 0; i < balas; i++) {
      const off = balas > 1 ? (i / (balas - 1) - 0.5) * arma.abanico * Math.PI / 180 : 0;
      this._nuevaBala({
        id: null, duenio: this.yoId, x: this.pred.x, y: this.pred.y, ang: ang + off,
        vel: arma.vel, alcance: arma.alcance, radio: arma.radio, tipo: arma.tipo,
        atraviesa: !!arma.atraviesa, prevista: true, s, orden: i
      });
    }
    if (Math.abs(Math.cos(ang)) > 0.2) yo.mira = Math.cos(ang) > 0 ? 1 : -1;
    this._fogonazo(yo, ang, sup);
    if (sup) this._sonar(yo.especie === 'perro' ? 'aullido' : 'golpe');
    else this._sonar(this.seqDisparo % 2 ? 'ladrido_1' : 'ladrido_2', { detune: (Math.random() - 0.5) * 120 });
    return true;
  }

  /** Disparo con apuntado automático al rival visible más cercano. */
  dispararAuto(sup) {
    const ang = this._anguloAuto(sup);
    return this.disparar(sup, ang);
  }

  _anguloAuto(sup) {
    const yo = this.vistas.get(this.yoId);
    if (!yo || !this.pred) return 0;
    const arma = this._armaMia(sup) || { alcance: 230, vel: 360 };
    let mejor = null, md = Infinity;
    this.vistas.forEach((v) => {
      if (v.yo || !v.vivo || v.oculto) return;
      const d = Math.hypot(v.x - this.pred.x, v.y - this.pred.y);
      // Un poco de preferencia por lo que está a tiro.
      const peso = d <= arma.alcance * 1.1 ? d : d + 1000;
      if (peso < md) { md = peso; mejor = v; }
    });
    if (!mejor) return this.apunte.ang || (yo.mira < 0 ? Math.PI : 0);
    // Adelantar el tiro con la velocidad que lleva (de sus dos últimas posiciones).
    let vx = 0, vy = 0;
    const b = mejor.buffer;
    if (b.length >= 2) {
      const a1 = b[b.length - 1], a0 = b[b.length - 2];
      const dt = Math.max(16, a1.t - a0.t) / 1000;
      vx = (a1.x - a0.x) / dt; vy = (a1.y - a0.y) / dt;
    }
    const d = Math.hypot(mejor.x - this.pred.x, mejor.y - this.pred.y);
    const t = d / Math.max(60, arma.vel || 360);
    return Math.atan2(mejor.y + vy * t * 0.7 - this.pred.y, mejor.x + vx * t * 0.7 - this.pred.x);
  }

  _sinMunicion(yo) {
    if (!yo || !yo.municion || this._parpadeoMunicion) return;
    this._parpadeoMunicion = true;
    yo.municion.forEach((m) => { m.fillColor = 0xe2554a; });
    this._reloj(160, () => {
      this._parpadeoMunicion = false;
      const v = this.vistas.get(this.yoId);
      if (v && v.municion) v.municion.forEach((m) => { m.fillColor = BattleScene.COLOR.municion; });
    });
  }

  _nuevaBala(o) {
    const A = window.GFBatallaArte;
    const clave = A ? A.pieza('p_' + (o.tipo || 'onda')) : null;
    if (this.balasVista.length >= BattleScene.MAX_BALAS) {
      const vieja = this.balasVista.shift();
      if (vieja && vieja.spr) vieja.spr.destroy();
    }
    let spr = null;
    if (clave && this.textures.exists(clave)) {
      spr = this.add.image(o.x, o.y, clave).setRotation(o.ang).setDepth(40000);
      if (o.tipo === 'aullido' || o.tipo === 'fuego') spr.setBlendMode(Phaser.BlendModes.ADD);
    } else {
      spr = this.add.circle(o.x, o.y, Math.max(3, o.radio || 6), 0xffffff).setDepth(40000);
    }
    const b = Object.assign({ dx: Math.cos(o.ang), dy: Math.sin(o.ang), resto: o.alcance, nace: performance.now(), spr, golpeados: new Set() }, o);
    this.balasVista.push(b);
    return b;
  }

  alBalas(d) {
    if (!Array.isArray(d.b)) return;
    if (d.o === this.yoId && d.s != null) {
      // Las mías: casar las dibujadas con su id de verdad.
      const mias = this.balasVista.filter((b) => b.prevista && b.s === d.s && b.id == null);
      if (mias.length) {
        mias.sort((a, b) => a.orden - b.orden);
        d.b.forEach((datos, i) => { if (mias[i]) { mias[i].id = datos[0]; mias[i].prevista = false; } });
        return;
      }
    }
    if (document.hidden) return;              // nada que dibujar ahora
    d.b.forEach((x) => {
      this._nuevaBala({ id: x[0], duenio: d.o, x: x[1], y: x[2], ang: x[3], vel: x[4], alcance: x[5], radio: x[6], tipo: x[7], atraviesa: !!d.sup && (x[7] === 'aullido' || x[7] === 'embestida') });
    });
    const quien = this.vistas.get(d.o);
    if (quien && !quien.yo) {
      if (Math.abs(Math.cos(d.b[0][3])) > 0.2) quien.mira = Math.cos(d.b[0][3]) > 0 ? 1 : -1;
      this._fogonazo(quien, d.b[0][3], !!d.sup);
      if (quien.especie === 'perro') {
        this._sonar(d.sup ? 'aullido' : 'ladrido_2', { x: quien.x, y: quien.y, vol: 0.7, detune: 150 + Math.random() * 150 });
      } else if (d.sup) this._sonar('golpe', { x: quien.x, y: quien.y, vol: 0.8, detune: -300 });
    }
  }

  _moverBalas(dt) {
    const M = window.GFBrawlMotor;
    if (!M || !this.R) return;
    const ahora = performance.now();
    const quedan = [];
    for (let i = 0; i < this.balasVista.length; i++) {
      const b = this.balasVista[i];
      // Una bala dibujada que el servidor no confirma en medio segundo es que
      // no salió (te quedaste sin munición en el servidor): se apaga.
      if (b.prevista && b.id == null && ahora - b.nace > 600) { this._quitarBala(b, false); continue; }
      const choque = M.avanzarBala(this.R, b, Math.min(b.resto, b.vel * dt), (bb) => {
        if (bb.atraviesa) return false;
        let tocado = false;
        this.vistas.forEach((v) => {
          if (tocado || !v.vivo || v.oculto || v.id === bb.duenio) return;
          const rr = 11 + (bb.radio || 6);
          if ((v.x - bb.x) * (v.x - bb.x) + (v.y - bb.y) * (v.y - bb.y) <= rr * rr) tocado = true;
        });
        return tocado;
      });
      if (b.spr) b.spr.setPosition(b.x, b.y);
      if (choque) { this._quitarBala(b, !!(choque.muro || choque.caja != null)); continue; }
      if (b.resto <= 0) { this._quitarBala(b, false); continue; }
      quedan.push(b);
    }
    this.balasVista = quedan;
  }

  _quitarBala(b, contraMuro) {
    if (b.spr) {
      if (contraMuro && !document.hidden) this._chispas(b.x, b.y, 4, 0xe8dcbc, 18);
      b.spr.destroy();
      b.spr = null;
    }
  }

  alGolpe(d) {
    // La bala que dio desaparece (si no atraviesa).
    for (let i = 0; i < this.balasVista.length; i++) {
      const b = this.balasVista[i];
      if (b.id === d.b && !b.atraviesa) { this._quitarBala(b, false); this.balasVista.splice(i, 1); break; }
    }
    const v = this.vistas.get(d.t);
    if (!v) return;
    v.hp = d.hp;
    v.golpeHasta = performance.now() + 90;
    if (!document.hidden) {
      const col = d.boom ? 0xff9a3c : (d.sup ? BattleScene.COLOR.oro : (v.yo ? 0xff7a6a : 0xfff0c0));
      this._impacto(d.x, d.y, col, !!d.sup);
      this._numero(v.x, v.y - (v.altoSprite || 28), '-' + d.d, v.yo ? '#ff8f83' : (d.sup ? '#ffd24a' : '#ffffff'), !!d.sup);
    }
    if (v.yo || d.o === this.yoId) this._sonar('golpe', { detune: v.yo ? -200 : 0 });
    if (v.yo) {
      this._pintarVidaHUD(v.hp, v.maxHp);
      if (this.el && this.el.dolor) {
        this.el.dolor.classList.add('activo');
        this._reloj(120, () => this.el && this.el.dolor && this.el.dolor.classList.remove('activo'));
      }
      if (!this._reducedMotion) this.cameras.main.shake(110, d.sup ? 0.008 : 0.004);
    }
  }

  alCaja(d) {
    const M = window.GFBrawlMotor;
    if (this.R) {
      if (d.rota) M.romperCaja(this.R, d.i);
      else if (this.R.cajas[d.i]) this.R.cajas[d.i].vida = d.vida;
    }
    const c = this.arena && this.arena.cajas.get(d.i);
    if (!c || c.rota) return;
    if (d.rota) { this._cajaRota(d.i, c, true); return; }
    const cat = this._cat || {};
    if (!c.respaldo && d.vida <= d.max / 2) c.img.setFrame(c.barril ? cat.barril_2 : (c.oro ? cat.caja_oro_2 : cat.caja_2));
    if (!this._reducedMotion && !document.hidden) {
      const x0 = c.img.x;
      this.tweens.add({ targets: c.img, x: { from: x0 - 2, to: x0 }, duration: 70, ease: 'Sine.easeOut', repeat: 1, onComplete: () => { if (c.img) c.img.x = x0; } });
      this._chispas(c.img.x, c.img.y, 5, c.barril ? 0xff8a3a : 0xc9975a, 20);
    }
  }

  _cajaRota(i, c, conEfecto) {
    c.rota = true;
    const cat = this._cat || {};
    if (c.respaldo) { c.img.setAlpha(0.25); c.img.setDepth(-980); return; }
    // El barril deja su marca quemada; el estallido lo pinta alBoom.
    c.img.setFrame(c.barril ? cat.barril_3 : cat.caja_3).setDepth(-980);
    if (c.barril) return;
    if (conEfecto && !document.hidden) {
      const A = window.GFBatallaArte;
      this._sonar('caja', { x: c.img.x, y: c.img.y });
      this._chispas(c.img.x, c.img.y, 12, c.oro ? BattleScene.COLOR.oro : 0xc9975a, 34);
      if (A) this._pieza('humo', c.img.x, c.img.y, { color: 0xe8dcbc, escala: 0.3, alfa: 0.7, dura: 520, mezcla: false, tween: { scale: 0.7, alpha: 0, y: c.img.y - 12 } });
    }
  }

  alObjeto(d) {
    if (this.huesosVista.has(d.id)) return;
    const cat = this._cat || {};
    const A = window.GFBatallaArte;
    const T = this._texArena || BattleScene.TILESET;
    const carne = d.tipo === 'carne';
    const brillo = (A && this.textures.exists(A.pieza('brillo')))
      ? this.add.image(d.x, d.y, A.pieza('brillo')).setTint(carne ? 0xff8a6a : BattleScene.COLOR.oro).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(34, 22).setAlpha(0.7).setDepth(d.y - 21)
      : null;
    const img = this.textures.exists(T)
      ? this.add.image(d.x, d.y, T, carne ? cat.carne : cat.hueso).setDepth(d.y - 20)
      : this.add.rectangle(d.x, d.y, 16, carne ? 12 : 6, carne ? 0xc4552f : 0xf3ecd8).setDepth(d.y - 20);
    img.setScale(0.1);
    this.tweens.add({ targets: img, scale: 0.8, duration: 260, ease: 'Back.easeOut' });
    const flota = this._reducedMotion ? null : this.tweens.add({ targets: img, y: d.y - 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 260 });
    const late = (brillo && !this._reducedMotion) ? this.tweens.add({ targets: brillo, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 }) : null;
    this.huesosVista.set(d.id, { img, brillo, flota, late });
  }

  alRecoger(d) {
    const h = this.huesosVista.get(d.id);
    const v = this.vistas.get(d.por);
    if (h) {
      this.huesosVista.delete(d.id);
      if (h.flota) h.flota.remove();
      if (h.late) h.late.remove();
      if (h.brillo) h.brillo.destroy();
      if (v && !this._reducedMotion && !document.hidden) {
        this.tweens.add({ targets: h.img, x: v.x, y: v.y - 16, scale: 0.3, alpha: 0, duration: 220, onComplete: () => h.img.destroy() });
      } else h.img.destroy();
    }
    if (v) {
      v.potencia = d.potencia;
      v.maxHp = d.maxHp;
      v.hp = d.hp;
      if (d.tipo === 'carne') {
        if (!document.hidden) this._numero(v.x, v.y - (v.altoSprite || 28), '+' + (d.cura || ''), '#7dff8a', true);
        if (v.yo) {
          this._pintarVidaHUD(v.hp, v.maxHp);
          this.aviso('+HEALTH', { peque: true, ms: 1000 });
          this._sonar('cura');
        }
        return;
      }
      if (v.yo) {
        this._pintarVidaHUD(v.hp, v.maxHp);
        if (this.el && this.el.huesos) this.el.huesos.textContent = '🦴 ' + d.potencia;
        this.aviso('+1 POWER BONE', { peque: true, ms: 1200 });
        this._sonar('hueso');
      }
    }
  }

  /** Un barril explota: fogonazo, onda, humo, chispas y temblor si te pilla cerca. */
  alBoom(d) {
    const x = Number(d.x), y = Number(d.y), r = Number(d.r) || 76;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._sonar('boom', { x, y });
    if (document.hidden) return;
    this._pieza('estallido', x, y, { color: 0xffb347, escala: 0.12, dura: 380, prof: 42000, tween: { scale: r / 70, alpha: 0, angle: 30 } });
    this._pieza('anillo', x, y, { color: 0xffe08a, escala: 0.1, alfa: 0.9, dura: 420, prof: 42000, tween: { scale: r / 55, alpha: 0 } });
    this._pieza('brillo', x, y, { color: 0xff7a2a, escala: 1.2, alfa: 0.9, dura: 300, prof: 42000, tween: { scale: 3, alpha: 0 } });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this._pieza('humo', x + Math.cos(a) * 10, y + Math.sin(a) * 8, {
        color: 0x5a4c44, escala: 0.3, alfa: 0.75, dura: 900, mezcla: false, prof: 41500,
        tween: { scale: 0.85, alpha: 0, x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 26 - 16 }
      });
    }
    this._chispas(x, y, 16, 0xff9a3c, 60);
    const yo = this.vistas.get(this.yoId);
    if (yo && !this._reducedMotion) {
      const dist = Math.hypot(yo.x - x, yo.y - y);
      if (dist < r * 4) this.cameras.main.shake(260, 0.012 * Math.max(0.25, 1 - dist / (r * 4)));
    }
  }

  alKO(d) {
    const v = this.vistas.get(d.t);
    const k = d.k ? this.vistas.get(d.k) : null;
    this.quedan = Number(d.quedan) || Math.max(0, this.quedan - 1);
    if (this.el && this.el.quedan) this.el.quedan.textContent = String(this.quedan);
    if (v && v.vivo) {
      v.vivo = false;
      this._caer(v);
      this._sonar('ko', { x: v.x, y: v.y, vol: v.yo ? 1 : 0.8 });
    }
    const nombre = (x) => x ? this._esc(x.datos.petName || 'Pet') : '?';
    const clase = (x) => (x && x.yo) ? 'yo' : 'rival';
    if (k && v) this.alFeed('<span class="' + clase(k) + '">' + nombre(k) + '</span> 💥 <span class="' + clase(v) + '">' + nombre(v) + '</span>');
    else if (v) this.alFeed('<span class="' + clase(v) + '">' + nombre(v) + '</span> is out');
    if (k && k.yo) {
      this.misBajas++;
      if (this.el && this.el.bajas) this.el.bajas.textContent = '💥 ' + this.misBajas;
      this.aviso('KNOCKOUT!', { oro: true, ms: 1000 });
    }
    if (v && v.yo) {
      this.estado = 'caido';
      this.apunte.mostrar = false;
      this._cancelarConfirmacion();
      // En la diaria y la práctica el final llega al momento: no hace falta
      // ofrecer "mirar". En PvP sí: la partida sigue sin ti.
      if (this.modo === 'pvp' && this.quedan > 1 && this.el && this.el.caido) {
        this.el.caidoTitulo.textContent = 'Knocked out!';
        this.el.caidoTexto.textContent = 'You finished #' + d.puesto + '. ' + (k ? 'Knocked out by ' + (k.datos.petName || 'a rival') + '.' : '');
        this.el.caido.classList.remove('hidden');
        this.seguidoId = k && k.vivo ? k.id : null;
      } else {
        this.aviso('KNOCKED OUT', { ms: 1400 });
      }
    }
    if (this.seguidoId === d.t) this.seguidoId = null;
  }

  _caer(v) {
    if (v.cartel) v.cartel.setVisible(false);
    if (v.aro) v.aro.setVisible(false);
    if (v.superListo) v.superListo.setVisible(false);
    if (!v.spr) return;
    const A = window.GFBatallaArte;
    if (!document.hidden && A) {
      this._pieza('humo', v.x, v.y, { color: 0xe8dcbc, escala: 0.35, alfa: 0.8, dura: 600, mezcla: false, tween: { scale: 0.8, alpha: 0, y: v.y - 18 } });
      this._chispas(v.x, v.y - 10, 10, 0xffffff, 30);
    }
    if (this._reducedMotion || document.hidden) { v.spr.setAlpha(0.25); v.spr.setAngle(90); return; }
    this.tweens.add({ targets: v.spr, angle: v.mira < 0 ? -90 : 90, alpha: 0.25, y: v.spr.y + 2, duration: 420, ease: 'Bounce.easeOut' });
    if (v.sombra) this.tweens.add({ targets: v.sombra, alpha: 0.15, duration: 420 });
  }

  // =========================================================================
  // RESULTADOS
  // =========================================================================
  mostrarResultado(d) {
    if (this.estado === 'fin' && this._resultado) return;
    this.estado = 'fin';
    this._resultado = d;
    this.apunte.mostrar = false;
    this.teclas = {};
    this.movTactil = { x: 0, y: 0 };
    this._cancelarConfirmacion();
    const e = this.el;
    if (!e || !e.resultado) { this.volverEnBreve(4000); return; }
    if (e.caido) e.caido.classList.add('hidden');
    if (e.aviso) e.aviso.classList.add('hidden');
    if (this._plazoAviso) { window.clearTimeout(this._plazoAviso); this._plazoAviso = null; }

    const gano = d.resultado === 'win';
    const puesto = Number(d.puesto) || 1, de = Number(d.de) || 1;
    this._sonar(gano ? 'victoria' : 'derrota');
    const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
    e.resPuesto.textContent = '#' + puesto;
    // Plata y bronce solo tienen sentido con más de dos: perder un 1 contra 1
    // no es "quedar segundo".
    const medalla = puesto === 1 ? '' : (de > 2 && puesto === 2 ? 'plata' : (de > 3 && puesto === 3 ? 'bronce' : 'nada'));
    e.resPuesto.className = 'bz-medalla ' + medalla;
    e.resTitulo.textContent = gano ? 'Victory!' : (this.modo === 'pvp' ? ordinal(puesto) + ' place' : 'Defeated');
    e.resTitulo.classList.toggle('gana', gano);
    const rival = (d.tabla || []).find((f) => f.id !== d.yo);
    if (this.modo === 'bot') {
      const esp = rival && window.GFBrawlMotor && window.GFBrawlMotor.ESPECIES[rival.especie];
      e.resSub.textContent = 'Daily battle ' + (d.ronda || '') + '/5' + (rival ? ' · vs ' + rival.petName + (esp ? ' the ' + esp.etiqueta : '') : '');
    } else if (this.modo === 'practica') {
      e.resSub.textContent = 'Practice — no points, just training.';
    } else {
      e.resSub.textContent = de + ' players · ' + ((this.partida && this.partida.arena && this.partida.arena.nombre) || 'Arena');
    }

    const premios = [];
    const yoFila = (d.tabla || []).find((f) => f.id === d.yo);
    if (this.modo !== 'practica') premios.push(['+' + (d.puntos || 0) + ' pts', (d.puntos || 0) > 0 ? 'oro' : '']);
    // La arena da EXP al personaje, y el perro tiene su nivel (uno solo en
    // todo el juego: ver nivelMascotaEfectivo en server2.js).
    if (d.exp > 0) premios.push(['+' + d.exp + ' EXP', 'verde']);
    if (d.petLevel) {
      const antes = Number(this.datosJugador.nivel) || 0;
      const yo = this.vistas.get(this.yoId);
      const nivelAntes = yo ? Number(yo.datos.nivel) || antes : antes;
      if (d.petLevel > nivelAntes) premios.push(['⭐ Level up! Lv.' + d.petLevel, 'verde']);
      // El mapa se pone al día ya (también llega por 'petLevelUpdate').
      window.globalPetLevel = d.petLevel;
    }
    if (d.daily) premios.push(['Daily ' + d.daily.done + '/' + d.daily.max, '']);
    if (yoFila) {
      premios.push(['💥 ' + yoFila.bajas + ' KO' + (yoFila.bajas === 1 ? '' : 's'), '']);
      premios.push(['⚔ ' + yoFila.dano + ' dmg', '']);
      if (yoFila.potencia) premios.push(['🦴 ' + yoFila.potencia, 'oro']);
    }
    e.resPremios.innerHTML = premios.map(([t, c]) => '<li class="' + c + '">' + this._esc(t) + '</li>').join('');
    e.resTabla.innerHTML = (d.tabla || []).slice().sort((a, b) => a.puesto - b.puesto).map((f) => {
      const esp = window.GFBrawlMotor && window.GFBrawlMotor.ESPECIES[f.especie];
      const quien = f.humano ? this._esc(f.playerName) : (esp ? esp.etiqueta : 'Bot');
      return '<li class="' + (f.id === d.yo ? 'yo' : '') + '"><span class="pos">#' + f.puesto + '</span>' +
        '<span class="quien">' + this._esc(f.petName) + '<small>' + quien + '</small></span>' +
        '<span class="num">💥' + f.bajas + '</span><span class="num">⚔' + f.dano + '</span></li>';
    }).join('');

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

  jugarOtraVez() {
    if (this.estado !== 'fin') return;
    const datos = Object.assign({}, this.datosInicio, { modo: this.modo });
    // Que el servidor sepa que ya no estamos (por si el final llegó antes).
    this._emitir('brawl:salir');
    this.scene.restart(datos);
  }

  // =========================================================================
  // SONIDO
  // =========================================================================
  /**
   * Suena un efecto. `cerca`: la posición de quien lo hace, para bajarle el
   * volumen con la distancia (lo tuyo suena entero, lo del otro lado de la
   * arena casi no). Con tope: un mismo sonido no se repite en menos de 60 ms
   * (cinco balas de un abanico que dan a la vez son UN golpe, no cinco).
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
    if (op.mezcla !== false) s.setBlendMode(Phaser.BlendModes.ADD);
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
      this._pieza('chispa', x, y, {
        color, escala: 0.12 + Math.random() * 0.14, dura: 260 + Math.random() * 240,
        tween: { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, alpha: 0, scale: 0.02, ease: 'Cubic.easeOut' }
      });
    }
  }

  _impacto(x, y, color, gordo) {
    this._pieza('estallido', x, y, { color, escala: 0.08, dura: 260, tween: { scale: gordo ? 0.45 : 0.3, alpha: 0, angle: 40 } });
    this._pieza('anillo', x, y, { color, escala: 0.05, alfa: 0.8, dura: 320, tween: { scale: gordo ? 0.5 : 0.32, alpha: 0 } });
    this._chispas(x, y, gordo ? 9 : 5, color, gordo ? 34 : 22);
  }

  _fogonazo(v, ang, sup) {
    if (document.hidden || !v) return;
    const x = v.x + Math.cos(ang) * 14, y = v.y - 8 + Math.sin(ang) * 14;
    this._pieza('anillo', x, y, { color: sup ? BattleScene.COLOR.oro : 0xdff4ff, escala: 0.04, alfa: 0.7, dura: 180, tween: { scale: sup ? 0.3 : 0.16, alpha: 0 } });
    if (v.spr && !this._reducedMotion) {
      // Un culatazo: se encoge y vuelve, como quien ladra con ganas.
      v.retroceso = 1;
    }
  }

  /** Números de daño: reutilizados (Text cuesta un lienzo cada uno). */
  _numero(x, y, texto, color, gordo) {
    if (document.hidden) return;
    let t = this.numerosLibres.pop();
    const tam = (gordo ? 16 : 13);
    if (!t) {
      t = this.add.text(0, 0, '', {
        fontFamily: '"PressStart2P", monospace', fontSize: tam + 'px', color: '#ffffff',
        stroke: '#0a0f1a', strokeThickness: 4, resolution: this._dpr || 1
      }).setOrigin(0.5, 1).setDepth(42000);
    }
    t.setActive(true).setVisible(true);
    t.setFontSize(tam).setColor(color).setText(texto);
    const s = this._escalaCartel || 1;
    t.setScale(s * 0.6).setAlpha(1).setPosition(x + (Math.random() - 0.5) * 8, y);
    this.tweens.add({
      targets: t, y: y - 22, scale: s, duration: 220, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: t, y: y - 34, alpha: 0, duration: 420, delay: 180,
          onComplete: () => { t.setVisible(false).setActive(false); if (this.numerosLibres.length < 24) this.numerosLibres.push(t); else t.destroy(); }
        });
      }
    });
  }

  // =========================================================================
  // LA NIEBLA
  // =========================================================================
  /*
   * LA NIEBLA, BIEN A LA VISTA.
   *
   * FALLO QUE ESTO ARREGLA (2026-10-02) — "la zona que se cierra no está": la
   * niebla solo se pintaba cuando ya había empezado a encoger, y empezaba
   * cubriendo hasta las esquinas: con la cámara encima del perro no se veía
   * nunca. Ahora:
   *   · el ANILLO DE LA SIGUIENTE ZONA SEGURA (blanco, a trazos) se ve desde
   *     el primer segundo, y una pastilla bajo el reloj dice cuánto falta;
   *   · la niebla es más densa y su borde late mientras cierra;
   *   · si estás FUERA, se tiñe el borde de la pantalla y una flecha señala
   *     hacia dónde correr (ver _avisoFuera).
   * Se repinta solo cuando cambia algo (el radio, el centro o el anillo).
   */
  _pintarNiebla(time) {
    if (!this.zona || !this.R || this.zonaR == null) return;
    const A = window.GFBatallaArte;
    if (!this.nieblaRT) {
      this.nieblaRT = this.add.renderTexture(0, 0, this.R.anchoPx, this.R.altoPx).setOrigin(0, 0).setDepth(45000);
      this.nieblaAnillo = this.add.graphics().setDepth(45001);
      this.nieblaSig = this.add.graphics().setDepth(45002);
      if (A && this.textures.exists(A.pieza('circulo'))) this.nieblaGoma = this.make.image({ key: A.pieza('circulo'), add: false });
    }
    const r = this.zonaR;
    const c = this.zonaC || { x: this.zona.cx, y: this.zona.cy };

    // El anillo de la siguiente zona segura (a trazos), si se sabe.
    const s = this.zonaSig;
    const claveSig = s ? Math.round(s.x) + ',' + Math.round(s.y) + ',' + Math.round(s.r) : '';
    if (claveSig !== this._sigPintado && this.nieblaSig) {
      this._sigPintado = claveSig;
      const g = this.nieblaSig;
      g.clear();
      if (s && s.r > 0) {
        const n = Math.max(24, Math.round(s.r / 9));
        g.lineStyle(3, 0x0b1a10, 0.35);
        for (let i = 0; i < n; i += 2) g.beginPath(), g.arc(s.x, s.y, s.r + 1, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2), g.strokePath();
        g.lineStyle(2, 0xffffff, 0.85);
        for (let i = 0; i < n; i += 2) g.beginPath(), g.arc(s.x, s.y, s.r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2), g.strokePath();
      }
    }
    // El borde late mientras cierra.
    if (this.nieblaAnillo) this.nieblaAnillo.setAlpha(this.zonaEstado === 1 ? 0.65 + 0.35 * Math.sin((time || 0) / 140) : 1);

    // La niebla: mientras no ha entrado, no hay nada que pintar.
    if (r >= this.zona.r0 - 1) {
      if (this.nieblaRT.visible) this.nieblaRT.setVisible(false);
      this.nieblaAnillo.clear();
      this._zonaPintada = -1;
      return;
    }
    const pc = this._zonaPintadaC;
    if (Math.abs(r - this._zonaPintada) < 0.75 && pc && Math.abs(pc.x - c.x) < 0.75 && Math.abs(pc.y - c.y) < 0.75) return;
    this._zonaPintada = r;
    this._zonaPintadaC = { x: c.x, y: c.y };
    const rt = this.nieblaRT;
    rt.setVisible(true);
    rt.clear();
    rt.fill(BattleScene.COLOR.niebla, 0.58);
    if (this.nieblaGoma && r > 0) {
      this.nieblaGoma.setDisplaySize(r * 2, r * 2).setPosition(c.x, c.y);
      rt.erase(this.nieblaGoma);
    }
    const g = this.nieblaAnillo;
    g.clear();
    if (r > 0) {
      g.lineStyle(10, 0x2f6b22, 0.30).strokeCircle(c.x, c.y, r + 5);
      g.lineStyle(6, 0x9cff6e, 0.22).strokeCircle(c.x, c.y, r + 2);
      g.lineStyle(3, 0xc4ff8f, 0.95).strokeCircle(c.x, c.y, r);
    }
  }

  /** La niebla acaba de empezar a cerrar (una fase más). */
  _alCerrarNiebla() {
    if (this.estado !== 'combate') return;
    const av = this._avisosNiebla;
    av.fase += 1;
    this._sonar('alarma');
    if (av.fase > 0) this.aviso('The fog moves in again! Get to the new circle.', { peque: true, ms: 2600 });
  }

  /**
   * ¿Estás en la niebla? Borde de pantalla teñido, texto y una flecha que
   * señala la zona buena. Y si la niebla va a cerrar pronto y estás fuera del
   * próximo anillo, un aviso amarillo con la misma flecha.
   */
  _avisoFuera(yo, ahora) {
    const e = this.el;
    if (!e || !e.fuera) return;
    let modo = '';
    let destino = null;
    if (yo && yo.vivo && (this.estado === 'combate') && this.zonaC) {
      const r = this.zonaR, c = this.zonaC;
      const activa = this.zona && r < this.zona.r0 - 1;
      if (activa && Math.hypot(yo.x - c.x, yo.y - c.y) > r) { modo = 'dentro'; destino = c; }
      else if (this.zonaSig && this.zonaEstado !== 2) {
        const s = this.zonaSig;
        const queda = this.zonaCambioEn - ahora;
        if (Math.hypot(yo.x - s.x, yo.y - s.y) > s.r && queda < 9000) { modo = 'pronto'; destino = s; }
      }
    }
    if (this._hud.fuera !== modo) {
      this._hud.fuera = modo;
      e.fuera.classList.toggle('hidden', !modo);
      e.fuera.classList.toggle('pronto', modo === 'pronto');
      if (this.ui) this.ui.classList.toggle('en-niebla', modo === 'dentro');
      if (e.fueraTxt) {
        e.fueraTxt.textContent = modo === 'dentro' ? "You're in the fog! Get to the safe zone" : 'The fog is coming — move to the white circle';
      }
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
    const dt = Math.min(50, Math.max(0, delta || 16)) / 1000;
    const ahora = performance.now();
    const M = window.GFBrawlMotor;
    const enJuego = this.matchId && this.R && M;

    // ── tu perro ──
    const yo = this.vistas.get(this.yoId);
    if (enJuego && yo && yo.vivo && this.pred) {
      let andando = false;
      if (this.estado === 'combate') {
        const mv = this._movimiento();
        if (mv.x || mv.y) {
          const vel = yo.datos.vel || 104;
          const p = M.moverCirculo(this.R, this.pred.x, this.pred.y, mv.x * vel * dt, mv.y * vel * dt, 11);
          andando = Math.abs(p[0] - this.pred.x) + Math.abs(p[1] - this.pred.y) > 0.05;
          if (Math.abs(p[0] - this.pred.x) > 0.05) yo.mira = p[0] > this.pred.x ? 1 : -1;
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
      yo.andando = andando;
      // Munición que se recarga sola, entre instantánea e instantánea.
      const arma = this._armaMia(false);
      if (arma && arma.recarga && this.municion < 3) this.municion = Math.min(3, this.municion + delta / arma.recarga);
    }

    // ── los demás: 110 ms en el pasado, entre dos instantáneas ──
    const tPintar = ahora - BattleScene.RETRASO_INTERP;
    this.vistas.forEach((v) => {
      if (v.yo || !v.vivo) return;
      const b = v.buffer;
      if (!b.length) return;
      while (b.length >= 2 && b[1].t <= tPintar) b.shift();
      if (b.length >= 2 && b[0].t <= tPintar) {
        const f = (tPintar - b[0].t) / Math.max(1, b[1].t - b[0].t);
        v.x = b[0].x + (b[1].x - b[0].x) * f;
        v.y = b[0].y + (b[1].y - b[0].y) * f;
      } else {
        v.x = b[0].x; v.y = b[0].y;
      }
    });

    // ── apuntar con el ratón ──
    if (yo && this.pred && this.apunte.raton && !this._tactil) {
      const cam = this.cameras.main;
      const p = cam.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
      this.apunte.ratonX = p.x; this.apunte.ratonY = p.y;
      this.apunte.ang = Math.atan2(p.y - (yo.y - 6), p.x - yo.x);
    }

    this._moverBalas(dt);
    this._pintarVistas(ahora, dt);
    this._pintarApunte(yo);
    this._arbustosCerca(yo);

    // ── la niebla ──
    if (this.zonaRObjetivo != null) {
      if (this.zonaR == null) this.zonaR = this.zonaRObjetivo;
      const k = Math.min(1, dt * 6);
      this.zonaR += (this.zonaRObjetivo - this.zonaR) * k;
      if (this.zonaC && this.zonaCObjetivo) {
        this.zonaC.x += (this.zonaCObjetivo.x - this.zonaC.x) * k;
        this.zonaC.y += (this.zonaCObjetivo.y - this.zonaC.y) * k;
      }
      this._pintarNiebla(time);
      this._avisoFuera(yo, ahora);
    }
    this._pintarReloj(ahora);
    this._vigilarConexion(ahora);

    // ── la cámara ──
    const cam = this.cameras.main;
    let foco = null;
    if (yo && yo.vivo) foco = yo;
    else if (this.matchId) {
      // Caído: se mira al que te tumbó o a cualquiera que siga en pie.
      let s = this.seguidoId ? this.vistas.get(this.seguidoId) : null;
      if (!s || !s.vivo) {
        s = null;
        this.vistas.forEach((v) => { if (!s && v.vivo && !v.oculto) s = v; });
        this.seguidoId = s ? s.id : null;
      }
      foco = s || yo;
    }
    if (foco) {
      const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
      const k = Math.min(1, dt * 10);
      cam.centerOn(cx + (foco.x - cx) * k, cy + (foco.y - 8 - cy) * k);
    }
  }

  /**
   * SIN NOTICIAS DEL SERVIDOR. En combate llegan 20 instantáneas por segundo;
   * si en 6 s no llega ninguna, la conexión se ha perdido (o se reconectó con
   * otro socket, y para el servidor ya eres otro jugador: te dio por caído).
   * El final no va a llegar nunca, así que se avisa y se vuelve al mapa en vez
   * de dejar al jugador mirando una arena congelada. Con la pestaña oculta
   * update() no corre, así que esto no salta por estar en segundo plano.
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
    // 1) Sin conexión: se espera a que Socket.IO reconecte (el servidor guarda
    //    tu perro 20 s); pasado ese rato ya no hay partida a la que volver.
    if (!this.socket || !this.socket.connected) {
      if (!this._sinRedDesde) this._sinRedDesde = ahora;
      this._pintarRed(true);
      if (ahora - this._sinRedDesde > 22000) rendirse('Connection lost — back to the map');
      return;
    }
    this._sinRedDesde = 0;
    if (this.estado === 'cuenta') { this._pintarRed(false); return; }
    // 2) Conectado pero sin instantáneas: el servidor no nos tiene enlazados
    //    (reconectó con otro socket antes de que llegara el 'connect'). Se pide
    //    la partida otra vez cada 3 s; si en 14 s no hay nada, se acabó.
    if (!this._ultimoSnap || ahora - this._ultimoSnap < 3000) { this._pintarRed(false); return; }
    this._pintarRed(true);
    if (!this._pidioVolverEn || ahora - this._pidioVolverEn > 3000) this._pedirVolver();
    if (ahora - this._ultimoSnap > 14000) rendirse('Connection lost — back to the map');
  }

  _enviarPosicion(ahora) {
    if (ahora - this.ultimoEnvio < BattleScene.ENVIO_MS || !this.pred) return;
    const movido = !(Math.abs(this.pred.x - this.envioX) < 0.05 && Math.abs(this.pred.y - this.envioY) < 0.05);
    if (!movido && ahora - this.ultimoLatido < BattleScene.LATIDO_MS) return;
    this.ultimoEnvio = ahora;
    this.ultimoLatido = ahora;
    this.envioX = this.pred.x; this.envioY = this.pred.y;
    this._emitir('brawl:mover', {
      s: ++this.seq,
      x: Math.round(this.pred.x * 100) / 100,
      y: Math.round(this.pred.y * 100) / 100,
      c: this.cAplicada,
      a: Math.round((this.apunte.ang || 0) * 1000) / 1000
    });
  }

  _pintarVistas(ahora, dt) {
    this.vistas.forEach((v) => {
      if (!v.spr) return;
      const visible = v.vivo ? !v.oculto : true;
      // Escondido: se desvanece rápido (y no se dibuja nada encima).
      const alfaObjetivo = !visible ? 0 : (v.enArbusto ? (v.yo ? 0.6 : 0.55) : 1);
      if (v.vivo) v.spr.alpha += (alfaObjetivo - v.spr.alpha) * Math.min(1, dt * 14);
      const vis = v.spr.alpha > 0.02 || !v.vivo;
      v.spr.setVisible(vis);
      if (v.sombra) v.sombra.setVisible(vis).setPosition(v.x, v.y + 8);
      if (v.aro) v.aro.setVisible(vis && v.vivo).setPosition(v.x, v.y + 8);
      if (!v.vivo) return;

      // Andar: fotogramas a su ritmo; quieto: el primero, respirando.
      const pose = v.andando ? 'camina' : 'quieto';
      const marcos = this._fotogramas(v.especie, pose, v.mira);
      if (marcos.length) {
        if (ahora >= v.proximoPaso) {
          v.proximoPaso = ahora + (v.andando ? 110 : 380);
          v.paso = (v.paso + 1) % marcos.length;
        }
        const k = marcos[Math.min(v.paso, marcos.length - 1)] || marcos[0];
        if (v.spr.texture.key !== k) v.spr.setTexture(k);
        // Los animales solo miran a la derecha: se les da la vuelta. El perro
        // tiene sus propios fotogramas de cada lado.
        v.spr.setFlipX(v.especie !== 'perro' && v.mira < 0);
      }
      const resp = v.andando ? Math.abs(Math.sin(ahora * 0.018)) * 1.5 : Math.sin(ahora * 0.004 + v.id) * 0.6;
      if (v.retroceso > 0) v.retroceso = Math.max(0, v.retroceso - dt * 7);
      const e = v.escala || 1;
      v.spr.setScale(e * (1 + v.retroceso * 0.08), e * (1 - v.retroceso * 0.1));
      v.spr.setPosition(Math.round(v.x), Math.round(v.y + 9 - resp));
      v.spr.setDepth(v.y + 9);
      if (v.sombra) v.sombra.setDepth(v.y - 30);
      if (v.aro) v.aro.setDepth(v.y - 29);
      // Destello blanco al recibir.
      if (ahora < v.golpeHasta) v.spr.setTintFill(0xffffff);
      else if (v.spr.tintFill) v.spr.clearTint();

      // El cartel.
      if (v.cartel) {
        v.cartel.setVisible(vis && v.spr.alpha > 0.3);
        v.cartel.setPosition(Math.round(v.x), Math.round(v.y + 9 - (v.altoSprite || 30) - 6 * (this._escalaCartel || 1)));
        this._pintarCartel(v);
        if (v.yo && v.municion) {
          for (let i = 0; i < 3; i++) {
            const c = Math.max(0, Math.min(1, this.municion - i));
            v.municion[i].width = 16 * c;
            v.municion[i].setAlpha(c >= 1 ? 1 : 0.55);
          }
        }
      }
      if (v.superListo) {
        const listo = this.superCarga >= 1 && this.estado === 'combate';
        v.superListo.setVisible(listo);
        if (listo) v.superListo.setPosition(v.x, v.y + 4).setDepth(v.y - 28).setAlpha(0.45 + Math.sin(ahora * 0.008) * 0.25);
      }
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
    const x = yo.x, y = yo.y - 6;
    const color = sup ? BattleScene.COLOR.oro : 0xffffff;
    const alfa = sup ? 0.3 : (this.municion >= 1 ? 0.2 : 0.08);
    g.fillStyle(color, alfa);
    if (arma.balas > 1 && arma.abanico) {
      const medio = arma.abanico * Math.PI / 360;
      g.slice(x, y, arma.alcance, ang - medio, ang + medio, false);
      g.fillPath();
    } else {
      const w = Math.max(5, arma.radio);
      const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
      const fx = x + Math.cos(ang) * arma.alcance, fy = y + Math.sin(ang) * arma.alcance;
      g.fillPoints([{ x: x + nx, y: y + ny }, { x: fx + nx, y: fy + ny }, { x: fx - nx, y: fy - ny }, { x: x - nx, y: y - ny }], true);
    }
    g.lineStyle(1, color, alfa * 2);
    g.strokeCircle(x + Math.cos(ang) * arma.alcance, y + Math.sin(ang) * arma.alcance, 4);
  }

  /** Las matas de alrededor se vuelven transparentes cuando estás dentro. */
  _arbustosCerca(yo) {
    if (!this.arena || !this.R) return;
    const nuevas = new Set();
    if (yo && yo.vivo && this.R) {
      const cx = Math.floor(yo.x / 32), cy = Math.floor(yo.y / 32);
      if (window.GFBrawlMotor.celdaEn(this.R, cx, cy) === '*') {
        for (let y = cy - 2; y <= cy + 2; y++) {
          for (let x = cx - 2; x <= cx + 2; x++) {
            const lista = this.arena.arbustos.get(y * this.R.ancho + x);
            if (lista) lista.forEach((im) => nuevas.add(im));
          }
        }
      }
    }
    this.arbustosApagados.forEach((im) => { if (!nuevas.has(im) && im.active) im.setAlpha(1); });
    nuevas.forEach((im) => { if (im.active) im.setAlpha(0.45); });
    this.arbustosApagados = nuevas;
  }

  _pintarReloj(ahora) {
    if (!this.el || !this.el.relojTxt || !this.zona) return;
    if (this.estado !== 'combate' && this.estado !== 'caido') return;
    const pasado = ahora - this.tCombateLocal;
    const queda = Math.max(0, this.zona.maxMs - pasado);
    const s = Math.ceil(queda / 1000);
    const txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (this._hud.reloj !== txt) { this.el.relojTxt.textContent = txt; this._hud.reloj = txt; }
    const niebla = pasado >= this.zona.inicioMs;
    this.el.relojTxt.classList.toggle('niebla', niebla && s > 20);
    this.el.relojTxt.classList.toggle('poco', s <= 20);
    // La pastilla de la niebla: cuánto falta para que se mueva / que ya cierra.
    if (this.el.nieblaEstado) {
      const q = Math.max(0, Math.ceil((this.zonaCambioEn - ahora) / 1000));
      const t = this.zonaEstado === 2 ? '☁ Final circle'
        : (this.zonaEstado === 1 ? '☁ Closing… ' + q + 's' : '☁ Fog in ' + q + 's');
      if (this._hud.niebla !== t) {
        this._hud.niebla = t;
        this.el.nieblaEstado.textContent = t;
        this.el.nieblaEstado.classList.toggle('cerrando', this.zonaEstado === 1);
        this.el.nieblaEstado.classList.remove('hidden');
      }
    }
    const av = this._avisosNiebla;
    if (!av.previo && pasado >= this.zona.inicioMs - 5000 && this.estado === 'combate') {
      av.previo = true;
      this.aviso('The fog is coming in 5 seconds!', { peque: true, ms: 2600 });
    }
    if (!av.empieza && niebla && this.estado === 'combate') {
      av.empieza = true;
      this.aviso('The fog is closing in! Stay inside the circle.', { peque: true, ms: 3000 });
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
    this.time.delayedCall(espera, () => this.volverAlMapa());
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
   * SALIR DE LA BATALLA, CON RED DEBAJO (ver la historia en la memoria
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

    if (this.input) {
      if (this._alMoverRaton) this.input.off('pointermove', this._alMoverRaton);
      if (this._alPulsarRaton) this.input.off('pointerdown', this._alPulsarRaton);
      if (this._alSoltarRaton) this.input.off('pointerup', this._alSoltarRaton);
    }
    this.teclas = {};
    this.disparoMantenido = false;

    try {
      if (this.socket && !yaLimpia) {
        // Avisar SIEMPRE de que nos vamos: el servidor suelta el candado (si
        // no, el siguiente intento respondía 'already_in_battle'). Si la
        // partida ya acabó, no hace nada.
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
      this.ui.classList.remove('tactil', 'buscando');
    }
    if (this.el) {
      if (this.el.feed) this.el.feed.textContent = '';
      [this.el.caido, this.el.resultado, this.el.aviso].forEach((n) => n && n.classList.add('hidden'));
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
    try { this.destruirArena(this.arena); } catch (e) {}
    try { this.destruirArena(this.fondoEspera); } catch (e) {}
    this.arena = null;
    this.fondoEspera = null;
    this.vistas.forEach((v) => this.destruirVista(v));
    this.vistas.clear();
    this.balasVista.forEach((b) => { if (b.spr) { try { b.spr.destroy(); } catch (e) {} } });
    this.balasVista = [];
    this.efectosVivos.forEach((s) => { try { s.destroy(); } catch (e) {} });
    this.efectosVivos = [];
    this.huesosVista.forEach((h) => { try { h.img.destroy(); if (h.brillo) h.brillo.destroy(); } catch (e) {} });
    this.huesosVista.clear();
    this.numerosLibres.forEach((t) => { try { t.destroy(); } catch (e) {} });
    this.numerosLibres = [];
    ['nieblaRT', 'nieblaAnillo', 'nieblaSig', 'nieblaGoma', 'gApunte'].forEach((k) => {
      if (this[k]) { try { this[k].destroy(); } catch (e) {} this[k] = null; }
    });
    this.arbustosApagados = new Set();
    this.R = null;
    this.pred = null;
    this._cat = null;

    // Las texturas propias: el tileset (1 MB de vídeo), los perros, los
    // animales y el bloque de respaldo. Las piezas de efecto las lleva su
    // propio contador (GFBatallaArte), que las suelta con la última escena.
    const T = this.textures;
    try {
      T.getTextureKeys().forEach((k) => {
        if (k.indexOf('bz_arena_32') === 0 || k.indexOf('bz_esp_') === 0 || k === 'bz_bloque') T.remove(k);
      });
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
