/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * LA MINA — Scenes/MinaScene.js
 *
 * ============================================================================
 *
 * QUE ES ESTO
 * ---------------------------------------------------------------------------
 * La escena subterranea. Se entra por `puerta_mina` desde GameScene y se sale
 * por la boca de la galeria de la sala de entrada.
 *
 * POR QUE HEREDA DE GameScene Y NO ES UNA COPIA
 * ---------------------------------------------------------------------------
 * El encargo decia "copia GameScene, cambiale el nombre y borra lo que no
 * haga falta". Eso es lo que se hizo en su dia con `tiendajuego.js`, y el
 * resultado esta a la vista: 13.600 lineas que repiten el chat, el correo, el
 * inventario y las barras de GameScene, cada copia con sus propios arreglos.
 * Un fallo del chat hay que arreglarlo hoy en dos sitios; con la mina serian
 * tres.
 *
 * Aqui se hace al reves: **MinaScene ES una GameScene**. Hereda de ella, asi
 * que sin escribir una linea ya tiene, apuntando a esta escena:
 *
 *    · el inventario entero y las casillas rapidas
 *    · las barras de vida, agua y comida, y las monedas
 *    · el chat (panel, burbujas, emojis) y el correo
 *    · los paneles de habilidades, NFT, notificaciones, horno y ajustes
 *    · la mascota, con su panel y su barra de vida
 *    · las amistades, los privados y el color del nombre
 *    · el consumo de items al clicar el personaje
 *
 * Lo unico que se escribe aqui es lo que DE VERDAD cambia: que mapa se carga,
 * como se construye, y que NO debe existir bajo tierra.
 *
 * LO QUE SE HIZO EN GameScene PARA QUE ESTO FUERA POSIBLE
 * ---------------------------------------------------------------------------
 * Tres trozos que estaban sueltos dentro de su `create()`/`update()` se
 * sacaron a metodos, sin cambiarles ni una linea de logica:
 *
 *    _cablearHUD()          el cableado de los botones redondos y los paneles
 *    _crearMascota()        el sprite del perro, su sombra y su etiqueta
 *    _actualizarMascota()   las 473 lineas de seguimiento y esquiva del perro
 *
 * Los llama tanto GameScene como esta escena. Si manana se arregla la esquiva
 * del perro, se arregla en los dos sitios a la vez.
 *
 * LO QUE NO HAY EN LA MINA, A PROPOSITO
 * ---------------------------------------------------------------------------
 *    · CLIMA. No se monta GFClima ni GFViento ni GFNieve. Bajo tierra no
 *      llueve. Es ademas lo que pedia el encargo: el clima solo en GameScene.
 *    · Los CUERVOS, la FAUNA y el BUHO (GFCuervo, GFAnimales, GFBuho): son
 *      bichos de campo abierto.
 *    · Los NPC, las CASAS, los ARBOLES y las PUERTAS del mapa de fuera. No se
 *      carga ni uno de sus PNG, asi que no gastan ni memoria de video.
 *    · El CICLO DIA/NOCHE. En una cueva no amanece.
 *
 * EL COSTE DE DIBUJO, QUE AQUI SI IMPORTA
 * ---------------------------------------------------------------------------
 * El mapa son 313x313 casillas. Las TRES capas de tiles (`mina`,
 * `mina_sombras` y `mina_objetos`) son tres llamadas de dibujo en total,
 * porque Phaser recorta las capas de tilemap a lo que ve la camara. Por eso
 * las antorchas, las sombras y los cacharros planos van en capas de tiles y no
 * como sprites: 900 sprites sueltos serian 900 llamadas por fotograma, las
 * mirase la camara o no.
 *
 * La excepcion son las 32 piezas ALTAS (racimos de cristal, pedruscos grandes,
 * vagonetas y arcos de apuntalar). Esas SI son sprites, porque tienen que
 * ordenarse con el jugador para que pueda pasar por detras — el 2.5D del
 * juego. Treinta y dos objetos es un precio que se paga con gusto; novecientos
 * no. Ver `_montarPiezas()`.
 *
 * La lava y el agua siguen la misma regla, y desde 2026-10-04 sin un solo
 * objeto: van en la capa de tiles `mina_bordes` con su propio tileset, y se
 * ANIMAN cambiando la imagen de ese tileset cada pocos fotogramas
 * (`tileset.setImage`). Antes un tileSprite se deslizaba encima del interior
 * del lago y la orilla se quedaba quieta: se veia la costura en todo el
 * perimetro. Ver `_animarLiquidos()`.
 */

/* global GameScene, Phaser */

/* Los liquidos animados: cuantos fotogramas tiene cada uno y a que ritmo.
   TIENEN QUE COINCIDIR con FOTOS_LAVA/FPS_LAVA y FOTOS_AGUA/FPS_AGUA de
   tools/generar-mina.py (lo comprueba tools/mina-prueba.js): si aqui hubiera
   mas fotogramas que PNG, la carga pediria ficheros que no existen. */
const ARTE_MINA_V = '20261004';

const LIQUIDOS_MINA = {
  lava: { fotogramas: 6, fps: 6 },
  agua: { fotogramas: 4, fps: 4 }
};

/* Las luces de la capa `luces` del mapa, por tipo. `vibra` es cuanto
   parpadea (0..1) y `vel` lo rapido. */
const LUCES_MINA = {
  // `alumbra`: el color con el que esa luz ABRE la oscuridad (casi blanco:
  // deja ver los colores de verdad, con un tinte) y `radio`, cuánto llega
  // respecto a su rectángulo del mapa. Ver _montarOscuridad.
  lava:           { color: 0xff6418, alfa: 0.42, vibra: 0.10, vel: 1.1, alumbra: 0xffb27a, radio: 0.75 },
  lava_foco:      { color: 0xff9632, alfa: 0.26, vibra: 0.30, vel: 2.3, alumbra: 0xffc48c, radio: 0.95 },
  antorcha:       { color: 0xffa040, alfa: 0.46, vibra: 0.16, vel: 7.0, alumbra: 0xffdca6, radio: 1.15 },
  cristal_azul:   { color: 0x3c9cff, alfa: 0.34, vibra: 0.12, vel: 1.6, alumbra: 0xa8ccff, radio: 0.9 },
  cristal_morado: { color: 0xb058ff, alfa: 0.32, vibra: 0.12, vel: 1.4, alumbra: 0xd6b4ff, radio: 0.9 },
  cristal_verde:  { color: 0x38e08a, alfa: 0.32, vibra: 0.12, vel: 1.5, alumbra: 0xaef0c8, radio: 0.9 }
};

/* LA OSCURIDAD DE LA CUEVA (2026-10-10). "La mina debe estar oscura pero
   respetando la luz de las antorchas y la lava, con la del personaje."
   `ambiente` es lo que se ve donde no llega ninguna luz (multiplica: 0x26
   es un 15 % de brillo) y `jugador`, la luz que lleva encima el minero. */
const OSCURIDAD_MINA = {
  escala: 8,                       // un píxel del mapa de luz = 8x8 del mundo
  ambiente: 0x1e2538,
  jugador: { radio: 230, color: 0xfff1da },
  otros: { radio: 150, color: 0xffe8c4 }
};

/* EL TAMAÑO DE LAS PIEZAS ALTAS (2026-10-05). "En la mina hay objetos más
   pequeños que el personaje." Las piezas del atlas están dibujadas a 1 píxel
   por píxel, y el personaje va a 2: un arco de apuntalar medía 64 px de alto
   y el minero que pasaba por debajo, 100; la vagoneta era de juguete. Se
   escalan desde su pie (el origen es abajo al centro, así que siguen en su
   sitio) y su colisión, que sale de `displayWidth`, crece con ellas.
     · el arco, para que se pase POR DEBAJO (112 px de alto);
     · vagonetas, pedruscos, cristales y estalagmitas, a escala de mina;
     · la antorcha no: va colgada del muro y ya mide lo que una antorcha. */
const ESCALA_PIEZAS_MINA = [
  [/^puntal$/, 1.75],
  [/^vagoneta$/, 1.5],
  [/^pena_/, 1.5],
  [/^racimo_/, 1.5],
  [/^estalagmita_/, 1.5]
];
function escalaPiezaMina(nombre) {
  for (const [re, k] of ESCALA_PIEZAS_MINA) if (re.test(nombre)) return k;
  return 1;
}

// eslint-disable-next-line no-unused-vars
class MinaScene extends GameScene {

  constructor() {
    /* La clave HAY QUE pasarla por el constructor.
     *
     * Phaser guarda la clave de la escena dentro de `sys.settings` en el
     * constructor de `Phaser.Scene`, y el gestor de escenas respeta esa clave e
     * ignora la que se le pase a `scene.add(...)` si ya viene rellena. Un
     * `super()` a secas heredaria la de GameScene y esta escena se registraria
     * como 'GameScene', pisando al mapa de fuera. Por eso el constructor de
     * GameScene acepta ahora un `config`. */
    super({ key: 'MinaScene' });

    /* Bandera para que cualquier codigo heredado pueda preguntar donde esta.
     * Se usa, por ejemplo, para no emitir la posicion del jugador a la sala
     * del mapa de fuera. */
    this.esMina = true;

    this.mina = null;

    /* SIN 0.5x. El mundo de esta escena es una capa de TILEMAP, y a medio
       zoom el borde de cada casilla cae a medio pixel: el rasterizador
       redondea distinto en casillas contiguas y salen rayas por todo el mapa,
       como si estuviera partido en cuadros. Con 1x y 2x cada pixel de textura
       cae en un numero entero de pixeles de pantalla y no hay costuras.
       tiendajuego usa estos dos niveles desde hace tiempo, por lo mismo. */
    this._nivelesDeZoom = [1.0, 2.0];          // datos del mapa (capas, rectangulos)
    this._liquidosAnim = [];   // los tilesets de la lava y el agua que se animan
    this._luces = [];          // las luces ADD (lava, antorchas, cristales)
    this._burbujas = [];       // burbujas que revientan en la lava
    this._salidaArmada = false;
  }


  /**
   * Recoge la sesion que nos pasa la escena anterior.
   *
   * `init` corre ANTES que preload y create, que es justo lo que hace falta:
   * asi `create` ya la tiene y no necesita ir a la red.
   */
  init(datos) {
    this.__sesionRecibida = (datos && datos.sesion) || null;
  }

  // =========================================================================
  // PRELOAD
  // =========================================================================
  //
  // Se carga POCO a proposito. GameScene.preload trae los arboles, las casas,
  // los NPC, las rocas y los seis climas: nada de eso se ve bajo tierra, y cada
  // PNG que no se carga es memoria de video que no se ocupa.

  preload() {
    // ── El personaje ───────────────────────────────────────────────────────
    // Mismas claves de textura de siempre ('player_right_1'...), pero salen de
    // la carpeta del personaje que el jugador lleve equipado.
    if (window.GFSoulbound) {
      window.GFSoulbound.precargar(this);
    } else {
      const base = './Game/Sprites/Soulbound/personaje1';
      this.load.image('imagen_Perfil', base + '/Perfil/Perfil.png');
      this.load.image('player', base + '/derecha/run_1.png');
      [['derecha', 'player_right'], ['izquierda', 'player_left'],
       ['arriba', 'player_up'], ['abajo', 'player_down']].forEach(([carpeta, pref]) => {
        for (let i = 1; i <= 7; i++) {
          this.load.image(pref + '_' + i, base + '/' + carpeta + '/run_' + i + '.png');
        }
      });
    }

    // ── La mascota ─────────────────────────────────────────────────────────
    for (let i = 1; i <= 4; i++) {
      this.load.image('perro_derecha_' + i, './Game/Sprites/mascota/derecha/run_' + i + '.png');
      this.load.image('perro_izquierda_' + i, './Game/Sprites/mascota/izquierda/run_' + i + '.png');
    }

    // ── El mapa y su tileset ───────────────────────────────────────────────
    //
    // La clave del tilemap es 'tilemap_mina' y NO 'tilemap'. GameScene y
    // tiendajuego usan 'tilemap' y 'tilemapx': si la mina reutilizara 'tilemap'
    // pisaria el del mapa de fuera en la cache, que es compartida, y al volver
    // arriba se cargaria la mina otra vez.
    /* `?v=` EN TODO LO DE LA MINA. El mapa, el tileset y sus fotogramas van
       JUNTOS: un mina.json nuevo con un tileset viejo de la cache del
       navegador pinta casillas equivocadas por todo el mapa. Al regenerar el
       arte se sube ARTE_MINA_V y se piden todos de nuevo. */
    const v = '?v=' + ARTE_MINA_V;
    this.load.image('tiles_mina', './Game/MAPAS/Mina/tileset_mina.png' + v);
    this.load.tilemapTiledJSON('tilemap_mina', './Maps/mina.json' + v);

    // ── Las texturas de la lava ────────────────────────────────────────────
    // El atlas de piezas grandes: pedruscos, racimos de cristal, vagonetas y
    // arcos de apuntalar. Una textura y una peticion para las dieciseis.
    this.load.atlas('piezas_mina', './Game/MAPAS/Mina/piezas.png' + v,
                    './Game/MAPAS/Mina/piezas.json' + v);

    /* LA LAVA Y EL AGUA, UN PNG POR FOTOGRAMA. Todos con el mismo orden de
       tiles: la escena los va poniendo como imagen del tileset y el lago
       entero —orilla incluida— cambia de fotograma a la vez. */
    Object.keys(LIQUIDOS_MINA).forEach(m => {
      for (let f = 0; f < LIQUIDOS_MINA[m].fotogramas; f++) {
        this.load.image('mina_' + m + '_' + f, './Game/MAPAS/Mina/tileset_' + m + '_' + f + '.png' + v);
      }
    });
    /* 32x32, no 16. La hoja son 6 burbujas de 32 px; cortada a 16 salian
       cuartos de burbuja (las tres primeras, troceadas). */
    this.load.spritesheet('lava_burbuja', './Game/MAPAS/Mina/lava_burbuja.png' + v,
                          { frameWidth: 32, frameHeight: 32 });

    // ── Sonido ─────────────────────────────────────────────────────────────
    // `tipo: 'tienda'` es el modo "bajo techo" de gf-audio: no carga pajaros,
    // ni grillos, ni truenos, ni los suelos de campo. Es exactamente lo que
    // hace falta en una cueva, y es lo que ya usa la tienda.
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
    if (window.GFAudio) window.GFAudio.precargar(this, { tipo: 'tienda' });
  }

  // =========================================================================
  // CREATE
  // =========================================================================

  /**
   * El create() DE VERDAD es `_construirMina()`. Este es solo el envoltorio
   * que impide que la mina se quede en negro sin decir nada.
   *
   * POR QUE HACE FALTA: `create()` es `async`. Si algo revienta dentro de una
   * funcion async, la excepcion NO sube al bucle de Phaser: se convierte en
   * una promesa rechazada que nadie mira. La escena se queda a medio montar
   * -sin mapa, sin jugador- y `update()` se va por su primer `return`. El
   * resultado es exactamente lo que se vio: pantalla negra, "no corre nada", y
   * ni una linea roja en la consola que diga donde se rompio.
   *
   * Asi que aqui se hacen tres cosas que antes no se hacian:
   *
   *   1. Se atrapa el fallo y se dice EN QUE FASE ocurrio (`this._faseMina`),
   *      que es lo unico que hacia falta para no tener que adivinar.
   *   2. Se comprueba al final que lo esencial este montado. Asi tambien queda
   *      cazado el fallo MUDO: una capa que vuelve null y no lanza nada.
   *   3. Pase lo que pase, el jugador acaba en el mapa y no encerrado en una
   *      pantalla negra de la que solo se sale recargando.
   */
  async create() {
    const sceneRunId = this._sceneRunId = (this._sceneRunId || 0) + 1;
    this._sceneStopped = false;
    this._cleanupSceneDone = false;
    this._shutdownDone = false;
    this._minaCleanupDone = false;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    this.events.once('shutdown', this._alApagar, this);
    this.events.once('destroy', this._alApagar, this);
    this._faseMina = 'arranque';
    this._rescatando = false;

    try {
      await this._construirMina(sceneRunId);
    } catch (e) {
      if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
      console.error('⛏️ la mina se rompio en la fase "' + this._faseMina + '":', e);
      this._rescatar('la mina no se pudo montar (' + this._faseMina + ')');
      return;
    }

    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!this.map || !this.player || !this.keys) {
      console.error('⛏️ la mina quedo a medias en la fase "' + this._faseMina +
                    '" -> mapa:' + !!this.map +
                    ' jugador:' + !!this.player +
                    ' controles:' + !!this.keys);
      this._rescatar('la mina quedo a medias (' + this._faseMina + ')');
    }
  }

  /**
   * Devuelve al jugador al mapa cuando la mina no se puede montar.
   *
   * Se sale por LoadingScenegame y no por `scene.start('GameScene')` a pelo:
   * la pantalla de carga es la que vuelve a pedir la partida al servidor y,
   * si el problema era la sesion, es ella la que sabe ensenar el aviso. Se
   * manda `mundo: 1` a proposito para que la partida no se quede guardada
   * como "esta en la mina" y el siguiente arranque no repita el viaje.
   */
  _rescatar(motivo) {
    if (this._rescatando || this._cambiandoEscena) return;
    this._rescatando = true;
    this._cambiandoEscena = true;
    console.warn('⛏️ saliendo de la mina por las malas:', motivo);

    /* EL CORTACIRCUITOS, y no es paranoia: sin el, esto es un BUCLE.
       La partida se guarda con `mundo: 3` al entrar en la mina, y la pantalla
       de carga ahora sabe que el mundo 3 es la mina. Asi que si la mina no
       monta, el camino seria: carga -> mina -> revienta -> carga -> mina...
       sin fin y sin que el jugador pueda hacer nada.

       Se corta por dos sitios a la vez:

         . `_dejarPartidaEnElMapa` deja GUARDADO mundo 1, que arregla tambien
           los arranques siguientes y hasta otra pestana.
         . la bandera global, para cuando ese guardado no llega a salir -que
           es justo el caso si lo que fallo fue la sesion-. La pantalla de
           carga la mira antes de mandar a nadie a la mina. */
    window.__gfMinaRota = motivo || true;
    try { this._dejarPartidaEnElMapa(3334, 760); } catch (e) {}

    try { this._ocultarHUD(); } catch (e) {}
    try { this.removeListener(); } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
    try { this.stopMusicSafely(); } catch (e) {}
    try { this.cleanupScene(); } catch (e) {}

    // Delante de la puerta de la mina, en el mapa de fuera.
    this.scene.start('LoadingScenegame', {
      targetScene: 'GameScene',
      playerData: { x: 3334, y: 760, mundo: 1 }
    });
  }

  async _construirMina(sceneRunId = this._sceneRunId) {
    console.log('⛏️ MinaScene.create()');

    /* ── LA SESION, LO PRIMERO DE TODO ───────────────────────────────────
     *
     * Phaser crea una instancia NUEVA al cambiar de escena: el `playerName`,
     * el `address` y el token CSRF que tenia la escena anterior no viajan
     * solos. Sin ellos `loadPlayerData()` se planta en su primera linea y se
     * va sin cargar nada — ni monedas, ni inventario, ni cofre— sin dar un
     * error rojo, solo un HUD en blanco.
     *
     * PERO NO SE VUELVE A AUTENTICAR. La version anterior llamaba aqui a
     * `loadx()`, que pide el CSRF y llama a /api/auth/me. Eso dio el cartel de
     * SESSION EXPIRED al entrar, y por un motivo tonto: `serverBase` se
     * rellenaba en el preload() de GameScene, por el que esta escena no pasa,
     * asi que la peticion salia a `undefined/api/auth/me` y fallaba con la
     * sesion perfectamente viva.
     *
     * Ahora la escena que nos lanza nos PASA su sesion, que ya esta
     * comprobada. `loadx()` se queda solo de red de seguridad para cuando se
     * entra sin venir de ningun sitio. */
    this._faseMina = 'sesion';
    let sesion = this._aplicarSesion(this.__sesionRecibida);
    if (!sesion) {
      console.log('⛏️ sin sesion heredada: se pide al servidor');
      sesion = await this.loadx();
    }
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!sesion || !this.playerName) {
      /* Sin sesion NO se monta la mina, pero tampoco se deja al jugador
         mirando una escena vacia: el envoltorio lo devuelve a la pantalla de
         carga, que es la que sabe volver a pedir la partida y, si de verdad
         la sesion caduco, ensenar el aviso una sola vez y en su sitio. */
      throw new Error('sin sesion: la mina no arranca');
    }
    this.currentAccount = this.currentAccount || this.playerName;

    this.currentWidth = parseInt(localStorage.getItem('screenWidth'));
    this.currentHeight = parseInt(localStorage.getItem('screenHeight'));
    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;

    // ── Estado basico de la escena ─────────────────────────────────────────
    //
    // Phaser REUTILIZA la instancia de la escena, asi que toda bandera de "ya
    // lo hice" hay que rearmarla aqui o sobrevive al cambio de escena y se
    // comporta como si la entrada anterior no hubiera terminado.
    this._faseMina = 'estado de la escena';
    this.mundo = 3;
    this._cambiandoEscena = false;
    // La sala a la que se va al salir: la apunta cada salida. Sin rearmarla,
    // la de la visita anterior (p. ej. 'isla') se quedaba puesta.
    this._salaDestino = null;
    this._salidaArmada = false;
    this._graphicsOcultado = false;
    this._liquidosAnim = [];
    this._luces = [];
    this._burbujas = [];
    this.speed = 240;
    this.socket = window.globalSocket || null;

    // El mapa de fuera se para y se vuelve a dar de alta, igual que hace la
    // tienda: asi al volver se construye de cero en vez de reaparecer a medio
    // apagar.
    //
    // OJO AL ORDEN, QUE AQUI SE PUEDE DEJAR AL JUGADOR SIN MAPA. `remove`
    // borra la escena del gestor; si el `add` de despues fallara, GameScene ya
    // no existiria y volver arriba seria imposible. Por eso la clase se coge
    // ANTES, y si no se encuentra no se quita nada: mejor una GameScene
    // parada que ninguna.
    //
    // Y no basta con mirar `window.GameScene`: register-scenes.js lo borra de
    // window a proposito (superficie minima). Lo que sobrevive es el binding
    // lexico que crea `class GameScene` en el script, mas la copia del
    // registro seguro. Se prueban los dos.
    this._faseMina = 'reciclar GameScene';
    const ClaseMapa =
      (window.__secureSceneRegistry && window.__secureSceneRegistry.get('GameScene')) ||
      (typeof GameScene === 'function' ? GameScene : null);

    try {
      if (ClaseMapa) {
        this.scene.stop('GameScene');
        this.scene.remove('GameScene');
        this.scene.add('GameScene', ClaseMapa, false);
      } else {
        console.warn('⛏️ sin la clase GameScene a mano: se para, pero NO se quita');
        this.scene.stop('GameScene');
      }
    } catch (e) {
      console.warn('No se pudo reciclar GameScene:', e);
      // Red de seguridad: si algo reventó a mitad, devolver la escena.
      try {
        if (ClaseMapa && !this.scene.get('GameScene')) {
          this.scene.add('GameScene', ClaseMapa, false);
        }
      } catch (e2) { console.error('⛏️ GameScene se quedó fuera del gestor:', e2); }
    }

    // ── El mapa ────────────────────────────────────────────────────────────
    this._faseMina = 'mapa';
    this.map = this.make.tilemap({ key: 'tilemap_mina' });
    // 32, no 16: el tileset de la mina se redibujo a 32 px. Si aqui se
    // quedara el 16 viejo, Phaser leeria el atlas del tileset con la rejilla
    // equivocada y saldrian cuartos de tile mezclados — un revoltijo que
    // parece corrupcion del PNG y no lo es.
    const tileset = this.map.addTilesetImage('tileset_mina', 'tiles_mina', 32, 32);

    /* SI EL MAPA NO CARGO, AQUI SE PARA.
       `addTilesetImage` devuelve null cuando la imagen no esta en la cache, y
       `createLayer` devuelve null cuando el tileset es null o la capa no
       existe. Sin esta comprobacion, la linea de abajo
       (`this.backgroundLayer.setDepth(0)`) lanza un TypeError dentro de una
       funcion async: se pierde en una promesa rechazada y la mina se queda en
       negro sin decir por que. Mejor un error legible y volver al mapa. */
    if (!tileset) {
      throw new Error("el tileset 'tiles_mina' no esta cargado " +
                      '(Game/MAPAS/Mina/tileset_mina.png)');
    }
    if (!this.map.width || !this.map.height) {
      throw new Error("el mapa 'tilemap_mina' vino vacio (Maps/mina.json)");
    }

    // NEAREST o el pixel art sale borroso y con costuras entre tiles.
    this.textures.get('tiles_mina').setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.backgroundLayer = this.map.createLayer('mina', tileset, 0, 0);
    if (!this.backgroundLayer) {
      throw new Error("Maps/mina.json no trae la capa de tiles 'mina'");
    }
    this.backgroundLayer.setDepth(0);

    /* LA CAPA DE BORDES: la grava, la lava y el agua con sus orillas, ENCIMA
       del suelo (que sigue entero debajo). Mezcla tres tilesets: el fijo, y
       los de la lava y el agua, que se animan. Si faltara la imagen de un
       liquido, `addTilesetImage` da null y esos tiles simplemente no se
       dibujan: la mina sigue montando. */
    const tilesetsBordes = [tileset];
    this._liquidosAnim = [];
    Object.keys(LIQUIDOS_MINA).forEach(m => {
      const cfg = LIQUIDOS_MINA[m];
      const clave0 = 'mina_' + m + '_0';
      if (!this.textures.exists(clave0)) {
        console.warn('⛏️ sin la imagen del ' + m + ': va sin animar');
        return;
      }
      /* EXTRUIDOS (2026-10-05): cada fotograma se copia con el borde de cada
         tile repetido un píxel (margen 1, separación 2). Con el suelo en
         trozos la mina baja a 0.5x, y una capa de casillas sin extruir
         enseña ahí rayas entre tile y tile; el líquido es lo único que
         sigue siendo capa de casillas. */
      const ex = this._extruirTileset(clave0, 32);
      const ts = ex ? this.map.addTilesetImage('tileset_' + m, ex, 32, 32, 1, 2)
                    : this.map.addTilesetImage('tileset_' + m, clave0, 32, 32);
      if (!ts) return;
      tilesetsBordes.push(ts);
      const claves = [];
      for (let f = 0; f < cfg.fotogramas; f++) {
        const k = 'mina_' + m + '_' + f;
        if (this.textures.exists(k)) {
          this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
          const kx = ex ? this._extruirTileset(k, 32) : null;
          claves.push(kx || k);
        }
      }
      this._liquidosAnim.push({ ts, claves, paso: 1000 / cfg.fps, acc: 0, i: 0 });
    });
    this.capaBordes = this.map.createLayer('mina_bordes', tilesetsBordes, 0, 0);
    if (this.capaBordes) this.capaBordes.setDepth(0.5);

    /* La capa de SOMBRAS: la mancha oscura que el muro echa sobre el suelo que
       tiene delante. Va entre el suelo y los cacharros.

       Es la otra mitad del arreglo de "las paredes se ven pegadas al suelo".
       La altura la da el muro (cuatro tiles, 64 px); lo que separa la pared
       del suelo a la vista es esta sombra a sus pies. Son tiles
       semitransparentes, asi que TIENE que ir en su propia capa: metidos en la
       capa del suelo taparian el suelo en vez de oscurecerlo. */
    this.capaSombras = this.map.createLayer('mina_sombras', tileset, 0, 0);
    if (this.capaSombras) this.capaSombras.setDepth(1);

    // La capa de objetos (antorchas, puntales, cristales, pedruscos, vagonetas
    // y racimos). Va por encima del suelo pero por DEBAJO del jugador, que se
    // ordena por su Y.
    this.capaObjetos = this.map.createLayer('mina_objetos', tileset, 0, 0);
    if (this.capaObjetos) this.capaObjetos.setDepth(2);

    /* EL SUELO PINTADO (gf-suelo.js): el suelo, los bordes fijos, las sombras
       y los objetos de la mina, en trozos (tools/captura-escena.html?escena=mina).
       Cuando llegan se esconden esas capas, y de la de bordes solo quedan los
       líquidos, que son los que se animan. */
    const firstLiquido = Math.min.apply(null, (this.map.tilesets || [])
      .filter(t => /^tileset_(lava|agua)$/.test(t.name)).map(t => t.firstgid).concat([Infinity]));
    this._montarSueloPintado('recortadas_mina', 'mina',
      [this.backgroundLayer, this.capaSombras, this.capaObjetos],
      () => {
        if (!this.capaBordes) return;
        this.capaBordes.forEachTile(t => { if (t && t.index > 0 && t.index < firstLiquido) t.setVisible(false); });
      });

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // ── Colisiones ─────────────────────────────────────────────────────────
    //
    // Se reutilizan los MISMOS nombres de propiedad que GameScene
    // (collisionRectangles / 1 / 2) porque el indice espacial heredado
    // (_reconstruirIndiceColisiones) lee justo esos. Cambiarles el nombre aqui
    // dejaria a la mina sin colisiones y sin ningun error en consola.
    this._faseMina = 'colisiones';
    this.collisionRectangles = this._rectsDeCapa('area_colision_general');

    /* EL AGUA TAMBIEN FRENA (2026-10-03) — "las colisiones ... no sirven".
       El generador del mapa mete la LAVA en la capa de colision, pero las
       charcas de la sala de cristales no: se caminaba por encima del agua
       como si fuera suelo. Sus rectangulos (`area_agua`, la forma entera de
       cada charca) se suman aqui. Comprobado con un relleno por inundacion
       sobre el mapa: los 58 puntos de mineral y la salida siguen al alcance
       desde la aparicion; solo se pierden las casillas de agua. */
    this.collisionRectangles = this.collisionRectangles.concat(this._rectsDeCapa('area_agua'));

    /* LA SALIDA VA APARTE, Y NO EN `collisionRectangles1`.
       ESTO ERA LO QUE IMPEDIA SALIR DE LA MINA. El indice espacial heredado
       (`_reconstruirIndiceColisiones`) mete en las colisiones
       `collisionRectangles` Y `collisionRectangles1`: poner ahi la boca de la
       galeria la convertia en un MURO. El jugador chocaba con ella, nunca
       llegaba a solaparla, y `_comprobarSalida()` -que dispara justo al
       solaparla- no saltaba jamas. Se veia la luz, se llegaba hasta ella y no
       se podia salir. */
    this._salida = (this._rectsDeCapa('area_salida_mina') || [])[0] || null;
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();

    console.log('⛏️ colisiones de la mina:', this.collisionRectangles.length,
                'rectangulos; salida:', this._salida ? 'si' : 'NO');

    // ── El jugador ─────────────────────────────────────────────────────────
    this._faseMina = 'jugador';
    let inicio = this._puntoDeAparicion();
    /* EL TELETRANSPORTE DEL PANEL DE AMIGOS (GFViaje, en gf-lands.js): se
       aparece junto a quien se ha venido a buscar, si ese punto no es roca. */
    {
      const v = window.GFViaje ? window.GFViaje.tomar(3) : null;
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y) &&
          v.x > 0 && v.y > 0 && v.x < this.map.widthInPixels && v.y < this.map.heightInPixels &&
          !this._chocaConEscenario(v.x - 15, v.y + 25, 30, 26)) {
        inicio = { x: v.x, y: v.y };
      }
    }
    this.posicionplayerx = inicio.x;
    this.posicionplayery = inicio.y;

    /* EL ANCLA. `loadPlayerData()` (heredado) llega despues y recoloca al
       jugador en la posicion guardada, que es una coordenada del mapa de
       fuera. Con esto puesto, respeta la de aqui. Ver el comentario en
       GameScene, junto a `this._anclaPropia`. */
    this._anclaPropia = { x: inicio.x, y: inicio.y };

    this.player = this.physics.add.sprite(inicio.x, inicio.y, 'player_right_1');
    this.player.setScale(2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(3);
    this.lastDirection = 'down';

    // Sombra del personaje, igual que en el mapa y en la tienda.
    this.shadow = this.add.graphics();
    this.shadow.fillStyle(0x000000, 0.28);
    this.shadow.fillEllipse(0, 0, 42, 20);
    this.shadow.setDepth(2);
    this.shadowContainer = this.add.container(this.player.x, this.player.y + 45, [this.shadow]);

    // Consumir el item seleccionado al clicar el personaje. El metodo es
    // heredado y ya decide si el item es comida o bebida.
    this.player.setInteractive({ useHandCursor: true });
    this.player.on('pointerdown', (pointer) => {
      const canvas = this.sys.canvas;
      const enCanvas = pointer.event.target === canvas ||
                       canvas.contains(pointer.event.target);
      if (!enCanvas) return;
      if (this.STATE && this.STATE.selectedItem) {
        this._consumeItemOnPlayer(String(this.STATE.selectedItem.id || '').toLowerCase());
      }
    });

    // Nombre sobre la cabeza (el update heredado de la mascota lo reposiciona).
    this.usuariox = this.add.text(this.player.x, this.player.y - 60, this.Username || '', {
      fontFamily: '"PressStart2P"',
      fontSize: '8px',
      color: '#ffffff',
      resolution: 4,
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(4);

    // `graphics` existe solo porque el update heredado lo oculta una vez. Sin
    // el, ese bloque daria un fallo silencioso en el primer fotograma.
    this.graphics = this.add.graphics();
    this.graphics.setVisible(false);

    this._crearAnimaciones();
    this._crearMascota();          // heredado de GameScene

    // ── Las piezas altas, en 2.5D ──────────────────────────────────────────
    this._faseMina = 'piezas';
    this._montarPiezas();

    // ── Lava, agua y burbujas ──────────────────────────────────────────────
    this._faseMina = 'liquidos';
    this._montarLiquidos();

    // ── Los zombis y su guardián (gf-mina-zombis.js, 2026-10-10) ───────────
    this._faseMina = 'zombis';
    try { if (window.GFMinaZombis) window.GFMinaZombis.montar(this); }
    catch (e) { console.warn('⛏️ zombis:', e); }

    // ── Que se VEA por donde se sale ─────────────────────────────
    this._faseMina = 'salida visible';
    try { this._montarSalidaVisible(); } catch (e) { console.warn('salida:', e); }

    // ── Entrada ────────────────────────────────────────────────────────────
    this._faseMina = 'controles';
    this._montarControles();

    this._faseMina = 'camara';
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    /* EL ZOOM. Vivia suelto dentro del create() de GameScene, por el que esta
       escena no pasa: sin esto la camara se quedaba clavada en 1.0x y no habia
       ni rueda, ni pellizco, ni botones de mas y menos. Ver `_montarZoom()`. */
    this._montarZoom();

    /* LA ENTRADA DE CAMARA (2026-10-04), la misma del mapa de fuera y de la
       tienda: negro, la camara se aleja en dos segundos y al terminar sale el
       HUD. Despues de `_montarZoom()` a proposito: ver `_entradaDeCamara()`. */
    const entrada = this._entradaDeCamara(sceneRunId);

    // Oscuridad de cueva: un rectangulo azulado en MULTIPLY sobre todo el mapa.
    //
    // Es UNA llamada de dibujo y no toca ningun shader. La alternativa —luces
    // de verdad, una por antorcha— serian 38 objetos mas y un lienzo del
    // tamano del mapa (5008x5008 a 4 bytes son 100 MB de memoria de video), que
    // es exactamente el problema de VRAM que ya costo caro en este proyecto.
    /* UNA IMAGEN, NO UN `add.rectangle`.
     *
     * ESTO ERA LO QUE DEJABA LA MINA LAVADA Y PLANA. Las FIGURAS de Phaser
     * (Rectangle, Graphics y companyia) IGNORAN el modo de mezcla: el
     * `setBlendMode(MULTIPLY)` de la version anterior no hacia absolutamente
     * nada, y lo que quedaba era un rectangulo azul grisaceo al 30 % pintado
     * en NORMAL sobre todo el mapa. En vez de oscurecer la cueva, le echaba
     * niebla encima: por eso el suelo y el pie de las paredes "no cuadraban"
     * -perdian el contraste entre si- y la luz de la salida se veia rara,
     * porque competia contra una capa plana que no deberia estar ahi.
     *
     * Una IMAGEN si respeta la mezcla. Se usa una textura minima de 4x4 del
     * color y se estira al tamano del mapa: sigue siendo una sola llamada de
     * dibujo y cuatro pixeles de memoria de video. */
    /* 2026-10-10: LA PENUMBRA YA NO ES PLANA. Era un velo azul al 42 % que
       apagaba todo por igual: ni oscuro de verdad ni respetaba las luces (una
       antorcha solo sumaba un brillo naranja encima). Ahora es un MAPA DE
       LUZ: ver _montarOscuridad. Sigue en `this.penumbra` y en depth 9000,
       así que todo lo que ya se colocaba por encima (la luz de la salida) o
       por debajo sigue igual. */
    this._montarOscuridad();

    // ── LOS SISTEMAS DE JUEGO ──────────────────────────────────────────────
    // Inventario, cofre, monedas, cadena, socket, misiones. Va ANTES del HUD
    // para que cuando se pinten las barras y las monedas ya haya datos.
    this._faseMina = 'sistemas de juego';
    /* EL CHAT, ANTES DE CABLEAR EL HUD.
       `_cablearHUD()` engancha el boton del chat solo `if (this._toggleChat)`,
       y ese metodo lo crea `_setupChatDom()`. Llamandolo despues, el boton se
       quedaba sin enganchar por esa via. Ahora va primero. */
    try { this._setupChatDom(); } catch (e) { console.warn('chat:', e); }

    /* EL HUD SALE AL TERMINAR LA ENTRADA DE CAMARA, SIN ESPERAR A LA RED.
       `_arrancarSistemas()` hace media docena de peticiones y puede tardar
       mas que la animacion: el HUD no la espera (eso eran dos o tres segundos
       mirando el mapa sin barras). Se vuelve a llamar cuando acaban la red Y
       la entrada, porque `_cablearHUD()` necesita cosas que solo existen
       despues (el catalogo de objetos, el hub de avisos): es idempotente. */
    entrada.then((ok) => { if (ok) this._mostrarHUD(); });
    await this._arrancarSistemas();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;

    // ── El HUD ─────────────────────────────────────────────────────────────
    this._faseMina = 'HUD';
    await entrada;
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    this._mostrarHUD();

    // ── Los modulos que SI van bajo tierra ─────────────────────────────────
    //
    // La lista es la misma que monta la tienda, que es la otra escena "bajo
    // techo". Lo que no esta aqui es deliberado: ver la cabecera del archivo.
    this._faseMina = 'modulos';
    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFAlquimista)  window.GFAlquimista.montar(this);
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo: 'tierra' });
    /* `interior: true` = ni ambiente, ni clima, ni truenos. Bajo tierra no
       hay tejado en el que oir la lluvia: hay cien metros de roca. */
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'tienda', suelo: 'tierra', interior: true });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);
    if (window.GFEspada)      window.GFEspada.montar(this);   // botón de la espada y ESPACIO
    /* `interior: true` tambien aqui, y por un motivo que costo encontrar:
       `GFPost` pregunta la oscuridad a `GFCiclo.oscuridad()`, que es el
       reloj GLOBAL de la partida. No le importa que nadie haya montado el
       ciclo en esta escena: si fuera es de noche, tine la mina de noche. */
    if (window.GFPost)        window.GFPost.montar(this, { interior: true });

    // El chat: el panel es DOM de la pagina y el metodo es heredado.

    // Que la tienda apunte a esta escena para que el STATE del inventario sea
    // el de aqui. Es lo mismo que hacen GameScene y tiendajuego.
    if (window.tiendaSistema) window.tiendaSistema.scene = this;

    // ── Limpieza al salir ──────────────────────────────────────────────────

    this._faseMina = 'lista';
    console.log('⛏️ mina lista');
  }

  // =========================================================================
  // CONSTRUCCION
  // =========================================================================

  /** Convierte una capa de objetos del mapa en rectangulos de Phaser. */
  _rectsDeCapa(nombre) {
    const capa = this.map.getObjectLayer(nombre);
    if (!capa || !Array.isArray(capa.objects)) {
      console.warn('⛏️ la capa "' + nombre + '" no existe en mina.json');
      return [];
    }
    return capa.objects.map(o =>
      new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height));
  }

  /**
   * Donde aparece el jugador al entrar.
   *
   * Sale del punto `aparicion_mina` del mapa. Si faltara, se cae al centro de
   * la sala de entrada en vez de dejar al jugador en (0,0), que es dentro de la
   * roca y sin salida.
   */
  _puntoDeAparicion() {
    const capa = this.map.getObjectLayer('aparicion');
    const p = capa && capa.objects && capa.objects[0];
    if (p) return { x: p.x, y: p.y };
    console.warn('⛏️ sin punto de aparicion en el mapa; se usa el de reserva');
    return { x: 156 * 16, y: 21 * 16 };
  }


  /**
   * Las piezas altas: pedruscos, racimos de cristal, vagonetas y arcos.
   *
   * POR QUE SON SPRITES Y NO TILES — EL 2.5D.
   * ------------------------------------------------------------------------
   * Una capa de tiles se dibuja de una pieza: o va entera por encima del
   * jugador o entera por debajo. Con las piezas dentro de la capa de objetos,
   * el personaje pasaba POR DELANTE de un racimo de cristal de 48 px aunque
   * estuviera detras de el — y por delante del arco de apuntalar aunque
   * estuviera cruzandolo. El mapa se veia plano, recortado, sin profundidad.
   *
   * Este juego resuelve eso como cualquier vista cenital con perspectiva: el
   * `depth` de cada cosa es la Y de sus PIES. Lo que tiene los pies mas abajo
   * en la pantalla esta mas cerca de la camara y se dibuja encima. El jugador
   * hace lo mismo (`this.player.setDepth(this.player.y)` en update), asi que
   * Phaser los intercala solo, sin que nadie tenga que comparar nada.
   *
   * Por eso el origen del sprite es (0.5, 1): abajo al centro, o sea los pies.
   *
   * Solo se hacen sprites las piezas ALTAS. Lo que se pisa —los montones de
   * mineral, los pedruscos bajos— sigue en la capa de tiles, que no cuesta
   * llamadas de dibujo: si algo no puede tapar al jugador, no necesita
   * ordenarse con el.
   */
  _montarPiezas() {
    this._piezas = [];
    const capa = this.map.getObjectLayer('piezas') || { objects: [] };

    // Las que se atraviesan a proposito: ver el porque mas abajo.
    const SIN_COLISION = new Set(['antorcha', 'puntal']);
    const solidas = [];

    const textura = this.textures.get('piezas_mina');
    capa.objects.forEach(o => {
      if (!o.name) return;
      if (!textura || !textura.has(o.name)) {
        console.warn('⛏️ la pieza "' + o.name + '" no esta en el atlas');
        return;
      }
      const spr = this.add.image(o.x, o.y, 'piezas_mina', o.name)
        .setOrigin(0.5, 1)
        .setScale(escalaPiezaMina(o.name))
        .setDepth(o.y);

      /* LA MARCA QUE LOS SISTEMAS DEL JUEGO BUSCAN.
       *
       * `optimized` es lo que miran `gf-profundidad.js` y el recorte por
       * distancia para saber que esto es un objeto DEL MAPA y no parte del
       * HUD. Sin ella, los dos pasan de largo y la pieza se queda con el
       * `depth` provisional que se le pone arriba.
       *
       * Ese depth provisional es la Y del objeto, que NO es su linea de
       * suelo: el PNG de un arco de apuntalar trae transparencia por debajo
       * del dintel, asi que su "pie" cae mas abajo que los postes por los que
       * de verdad se pasa. Eso es justo lo que gf-profundidad mide bien. */
      spr.setData('optimized', true);
      this._piezas.push(spr);

      /* Y SU COLISION, que antes no tenian ninguna: se atravesaban los
         pedruscos, los racimos de cristal y las vagonetas como si fueran
         humo.

         Dos piezas NO frenan, y es a proposito:
           · `antorcha`, que va colgada del muro y ya esta dentro de la roca;
           · `puntal`, que es un arco de apuntalar, o sea un hueco de paso:
             frenarlo taponaria la galeria por la que pasa.

         El rectangulo es el PIE, no la silueta: 70 % del ancho y 16 px de
         alto pegados a la base. Las piezas altas (un racimo de 96) hay que
         poder rodearlas pasando por detras de su punta, que es justo lo que
         hace el 2.5D de gf-profundidad. Frenar la silueta entera volveria
         solido el aire que hay sobre la base. */
      if (!SIN_COLISION.has(o.name)) {
        const ancho = spr.displayWidth * 0.7;
        solidas.push(new Phaser.Geom.Rectangle(
          spr.x - ancho / 2, spr.y - 16, ancho, 16));
      }
    });

    /* LOS CACHARROS QUE ERAN PLANOS, EN 2.5D (2026-10-10). "Hay objetos 2D
       en las minas y el juego es 2.5D." Los montones de mineral y las peñas
       pequeñas iban PINTADOS en la capa de tiles `mina_objetos`: el minero
       les pasaba por encima como si fueran una alfombra, sin sombra y sin
       poder ponerse detrás. Son pocos (unos veinte), así que se pasan a
       sprite como las piezas altas: se quitan sus cuatro casillas de la capa
       y en su sitio va la pieza del atlas, con su pie sólido, ordenada por Y
       y con su sombra (gf-sombras / gf-profundidad, abajo). Las motas del
       suelo (suelo_deco, grava_deco) se quedan en la capa: son suelo. */
    try {
      const PLANAS = ['pena_pequena', 'monton_piedra', 'monton_cobre', 'monton_hierro', 'monton_carbon', 'monton_oro'];
      const BASE = 416 + 1;                       // indice del tileset + firstgid de Tiled
      const capaT = this.capaObjetos;
      let planas = 0;
      if (capaT && textura) {
        const T = this.map.tileWidth || 32;
        const esquinas = [];
        capaT.forEachTile((t) => {
          const k = t.index - BASE;
          if (k >= 0 && k < PLANAS.length * 4 && k % 4 === 0) esquinas.push({ x: t.x, y: t.y, nombre: PLANAS[k / 4], k });
        });
        esquinas.forEach((e) => {
          if (!textura.has(e.nombre)) return;
          // Sus cuatro casillas fuera (solo las que son de ESTA pieza).
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], j) => {
            const t = capaT.getTileAt(e.x + dx, e.y + dy);
            if (t && t.index === BASE + e.k + j) capaT.removeTileAt(e.x + dx, e.y + dy);
          });
          const px = (e.x + 1) * T, py = (e.y + 2) * T;
          const spr = this.add.image(px, py, 'piezas_mina', e.nombre)
            .setOrigin(0.5, 1)
            .setScale(e.nombre === 'pena_pequena' ? 1.35 : 1.15)
            .setDepth(py);
          spr.setData('optimized', true);
          this._piezas.push(spr);
          const ancho = spr.displayWidth * 0.62;
          solidas.push(new Phaser.Geom.Rectangle(px - ancho / 2, py - 14, ancho, 14));
          planas++;
        });
      }
      if (planas) console.log('⛏️ cacharros planos pasados a 2.5D:', planas);
    } catch (e) { console.warn('⛏️ cacharros planos:', e); }

    /* VAN EN `collisionRectangles`, la lista buena.
       El primer intento las puso en `collisionRectangles2` pensando que era
       "la tercera lista" del indice espacial. No lo es:
       `_reconstruirIndiceColisiones()` solo mete `collisionRectangles` y
       `collisionRectangles1`. En `...2` no frenaban nada y se seguian
       atravesando los pedruscos exactamente igual que antes. */
    this.collisionRectangles = this.collisionRectangles.concat(solidas);
    this._reconstruirIndiceColisiones();
    console.log('⛏️ piezas solidas:', solidas.length, 'de', this._piezas.length);

    /* PROFUNDIDAD Y SOMBRA: LOS SISTEMAS DEL JUEGO, NO UNOS MIOS.
     *
     * La primera version le ponia a cada pieza `setDepth(o.y)` y se dibujaba
     * una sombra pintada dentro del propio tile. Las dos cosas estaban mal:
     *
     *   · `o.y` es el pie del SPRITE, no la linea de suelo. GameScene no
     *     ordena asi desde que existe gf-profundidad.js, que saca la linea del
     *     rectangulo de colision (la mejor fuente: marca por donde se anda) y,
     *     si no lo hay, midiendo los pixeles opacos.
     *
     *   · una sombra pintada en el tile no se puede orientar. En este juego el
     *     sol esta arriba a la izquierda y la sombra cae abajo y a la derecha
     *     con CIZALLA, no con un giro: gf-sombras.js la hornea por textura con
     *     `ctx.setTransform`, que es lo unico que deja la base clavada al
     *     objeto por ancho que sea.
     *
     * Usar los mismos dos modulos que el mapa de fuera es ademas lo que hace
     * que la mina se vea del mismo juego y no de otro. */
    if (window.GFSombras) {
      /* `extra` porque gf-sombras busca sus candidatos POR NOMBRE
         (scene.arbol1, scene.pino4, la lista de edificios). Eso vale para el
         mapa de fuera, donde cada objeto vive en una propiedad con nombre
         fijo; aqui las piezas salen de un bucle sobre una capa del mapa y no
         tienen nombre propio, asi que se le pasan a mano. */
      try {
        window.GFSombras.montar(this, { extra: this._piezas });
      } catch (e) { console.warn('⛏️ sombras:', e); }
    }
    if (window.GFProfundidad) {
      try { window.GFProfundidad.montar(this); }
      catch (e) { console.warn('⛏️ profundidad:', e); }
    }

    console.log('⛏️ piezas en 2.5D:', this._piezas.length);
  }

  /**
   * La lava y el agua: las burbujas y las luces. El liquido en si ya esta en
   * la capa `mina_bordes`; lo que lo mueve es `_animarLiquidos()`.
   */
  _montarLiquidos() {
    this._montarBurbujas();
    try { this._montarLuces(); } catch (e) { console.warn('⛏️ luces:', e); }
  }

  /**
   * ANIMA LA LAVA Y EL AGUA cambiando la imagen de su tileset.
   *
   * POR QUE ASI. Phaser 3 no reproduce solo las animaciones de tile de Tiled,
   * y cambiar el indice de cada casilla de lava cada fotograma es tirar el
   * fotograma. Lo que hace esto es cambiar UNA referencia: `setImage` apunta
   * el tileset a otra textura del mismo tamano y todas las casillas que lo
   * usan se dibujan con el fotograma nuevo. Cero objetos, cero pixeles
   * redibujados, y el borde del lago va con el interior.
   */
  /**
   * Copia de un tileset con cada tile EXTRUIDO un píxel (margen 1, separación
   * 2): el borde de cada tile repetido por fuera. Es el arreglo de siempre
   * para las rayas entre casillas cuando el zoom no es entero. Se hace una
   * vez por textura y se guarda (`<clave>_x`).
   */
  _extruirTileset(clave, T) {
    const kx = clave + '_x';
    if (this.textures.exists(kx)) return kx;
    try {
      const img = this.textures.get(clave).getSourceImage();
      if (!img || !img.width) return null;
      const cols = Math.floor(img.width / T), filas = Math.floor(img.height / T);
      const ct = this.textures.createCanvas(kx, cols * (T + 2), filas * (T + 2));
      const ctx = ct.getContext();
      for (let j = 0; j < filas; j++) {
        for (let i = 0; i < cols; i++) {
          const sx = i * T, sy = j * T, dx = i * (T + 2) + 1, dy = j * (T + 2) + 1;
          ctx.drawImage(img, sx, sy, T, T, dx, dy, T, T);
          ctx.drawImage(img, sx, sy, T, 1, dx, dy - 1, T, 1);
          ctx.drawImage(img, sx, sy + T - 1, T, 1, dx, dy + T, T, 1);
          ctx.drawImage(img, sx, sy, 1, T, dx - 1, dy, 1, T);
          ctx.drawImage(img, sx + T - 1, sy, 1, T, dx + T, dy, 1, T);
        }
      }
      ct.refresh();
      ct.setFilter(Phaser.Textures.FilterMode.NEAREST);
      return kx;
    } catch (e) {
      console.warn('⛏️ no se pudo extruir ' + clave + ':', e);
      return null;
    }
  }

  _animarLiquidos(delta) {
    for (let i = 0; i < this._liquidosAnim.length; i++) {
      const a = this._liquidosAnim[i];
      if (a.claves.length < 2) continue;
      a.acc += delta;
      if (a.acc < a.paso) continue;
      a.acc %= a.paso;
      a.i = (a.i + 1) % a.claves.length;
      const tex = this.textures.get(a.claves[a.i]);
      if (tex && tex.key !== '__MISSING') a.ts.setImage(tex);
    }
  }

  /**
   * LAS LUCES: lagos de lava, antorchas y racimos de cristal.
   *
   * La cueva va oscurecida con una penumbra en MULTIPLY (depth 9000), que
   * apaga TODO por igual: la lava quedaba tan mate como la roca. Encima va
   * una imagen por luz, en modo ADD, con un degradado radial de lienzo: se
   * suma a lo que hay debajo, incluido el jugador cuando pasa al lado.
   *
   * Una sola textura de 128x128 compartida y el mismo modo de mezcla: Phaser
   * las dibuja todas en la misma tanda. El parpadeo lo hace `update` con un
   * seno por luz (sin un tween por cada una).
   */
  _montarLuces() {
    this._luces = [];
    const capa = this.map.getObjectLayer('luces');
    if (!capa || !capa.objects.length) return;
    const CLAVE = 'mina_luz';
    if (!this.textures.exists(CLAVE)) {
      const lz = this.textures.createCanvas(CLAVE, 128, 128);
      const cx = lz.getContext();
      const g = cx.createRadialGradient(64, 64, 2, 64, 64, 64);
      g.addColorStop(0.00, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, 128, 128);
      lz.refresh();
    }
    capa.objects.forEach((o, k) => {
      const tipo = LUCES_MINA[o.name];
      if (!tipo || !(o.width > 0) || !(o.height > 0)) return;
      const img = this.add.image(o.x + o.width / 2, o.y + o.height / 2, CLAVE)
        .setDisplaySize(o.width, o.height)
        .setTint(tipo.color)
        .setAlpha(tipo.alfa)
        .setDepth(9100)
        .setBlendMode(Phaser.BlendModes.ADD);
      this._luces.push({ img, base: tipo.alfa, vibra: tipo.vibra, vel: tipo.vel, fase: k * 1.7,
                         x: o.x + o.width / 2, y: o.y + o.height / 2,
                         r: Math.max(o.width, o.height) * 0.5 * (tipo.radio || 1),
                         alumbra: tipo.alumbra || 0xffffff });
      // El brillo de color, más suave: ahora la luz de verdad la pone el
      // mapa de luz y esto queda como el resplandor de encima.
      img.setAlpha(tipo.alfa * 0.6);
      this._luces[this._luces.length - 1].base = tipo.alfa * 0.6;
    });
    console.log('⛏️ luces:', this._luces.length);
  }

  /**
   * EL MAPA DE LUZ DE LA CUEVA (2026-10-10).
   *
   * Una RenderTexture del tamaño del mapa partido por 8 (626x626: 1,5 MB de
   * memoria de vídeo, no los 100 MB de una del tamaño del mapa) estirada x8
   * con filtro LINEAL, en MULTIPLY por encima de todo. Cada fotograma:
   *   1. se llena del color de AMBIENTE (casi negro azulado): la cueva a
   *      oscuras;
   *   2. se pinta encima, en blanco con un tinte, la luz de cada antorcha,
   *      lago de lava y racimo de cristal QUE SE VE, la del jugador y la de
   *      los demás mineros.
   * Multiplicar por blanco deja el color de verdad; por el ambiente, lo
   * oscurece. O sea: oscuro, y cada luz abre su círculo y deja ver lo que
   * alumbra. El filtro lineal hace el degradado del borde gratis.
   *
   * Las luces son unos sellos ya horneados de varios tamaños (se pinta el
   * más cercano al radio): batchDrawFrame no escala, y así son todos de UNA
   * tanda. Solo se pintan las que caen cerca de la cámara.
   */
  _montarOscuridad() {
    const O = OSCURIDAD_MINA;
    const E = O.escala;
    const w = Math.ceil(this.map.widthInPixels / E);
    const h = Math.ceil(this.map.heightInPixels / E);
    // Los sellos: diámetros (en píxeles del mapa de luz) de 6 a 96.
    this._sellosLuz = [];
    [6, 10, 16, 24, 34, 48, 64, 80, 96].forEach((d) => {
      const k = 'mina_lz_' + d;
      if (!this.textures.exists(k)) {
        const t = this.textures.createCanvas(k, d, d);
        const cx = t.getContext();
        const g = cx.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
        g.addColorStop(0.00, 'rgba(255,255,255,1)');
        g.addColorStop(0.40, 'rgba(255,255,255,0.88)');
        g.addColorStop(0.75, 'rgba(255,255,255,0.38)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, d, d);
        t.refresh();
        t.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      this._sellosLuz.push({ d, k });
    });
    const rt = this.add.renderTexture(0, 0, w, h)
      .setOrigin(0, 0)
      .setScale(E)
      .setDepth(9000);
    rt.setBlendMode(Phaser.BlendModes.MULTIPLY);
    try { rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR); } catch (e) {}
    this.penumbra = rt;
    this._oscuridad = { rt, E };
  }

  /** El sello cuyo diámetro se acerca más a `diam` (en píxeles del mapa de luz). */
  _selloLuz(diam) {
    const s = this._sellosLuz;
    let mejor = s[0];
    for (let i = 1; i < s.length; i++) {
      if (Math.abs(s[i].d - diam) < Math.abs(mejor.d - diam)) mejor = s[i];
    }
    return mejor;
  }

  _pintarOscuridad() {
    const o = this._oscuridad;
    if (!o || !o.rt || !o.rt.scene || !this.cameras || !this.cameras.main) return;
    const rt = o.rt, E = o.E, O = OSCURIDAD_MINA;
    const v = this.cameras.main.worldView;
    const M = 140;
    rt.clear();
    rt.fill(O.ambiente, 1);
    rt.beginDraw();
    const luz = (x, y, r, color, alfa) => {
      if (!(r > 0)) return;
      if (x + r < v.x - M || x - r > v.right + M || y + r < v.y - M || y - r > v.bottom + M) return;
      const s = this._selloLuz((r * 2) / E);
      rt.batchDrawFrame(s.k, undefined, x / E - s.d / 2, y / E - s.d / 2, alfa, color);
    };
    for (let i = 0; i < this._luces.length; i++) {
      const l = this._luces[i];
      luz(l.x, l.y, l.r, l.alumbra, Math.max(0.55, Math.min(1, 0.92 + (l.vibra || 0) * (l.parpadeo || 0) * 0.5)));
    }
    // La del minero, a la altura del pecho, con un temblor de farol.
    const p = this.player;
    if (p && p.active) {
      const tiembla = 1 + Math.sin(this.time.now / 140) * 0.015;
      luz(p.x, p.y + 6, O.jugador.radio * tiembla, O.jugador.color, 1);
    }
    // Los demás mineros llevan la suya.
    const otros = this.otherPlayers;
    if (otros) {
      for (const id in otros) {
        const s = otros[id] && otros[id].sprite;
        if (s && s.active && s.visible) luz(s.x, s.y + 6, O.otros.radio, O.otros.color, 0.9);
      }
    }
    // Y lo que traigan los zombis y su jefe (gf-mina-zombis.js): ojos, antorchas.
    if (typeof this._lucesExtra === 'function') {
      try { this._lucesExtra(luz); } catch (e) {}
    }
    rt.endDraw();
  }

  /**
   * Las burbujas que revientan en la lava.
   *
   * Son OCHO sprites reciclados, no uno por burbuja. Cada vez que uno termina
   * su animacion se coloca en otro punto de lava al azar y vuelve a empezar
   * tras una espera. Ocho objetos fijos, cero basura para el recolector.
   */
  /**
   * SEÑALA LA SALIDA con un degradado de luz de dia y tres flechas.
   *
   * EL PROBLEMA QUE RESUELVE: se aparece a 64 px por debajo de la boca de la
   * galeria, mirando una pared de roca igual que las otras mil. Nada decia que
   * por ahi se vuelve al mapa, asi que la primera impresion de la mina era la
   * de estar encerrado.
   *
   * COMO ESTA HECHO, Y POR QUE ASI:
   *
   *   · El degradado es una TEXTURA DE LIENZO, no un Graphics. Las figuras de
   *     Phaser (`add.rectangle`, `Graphics`) IGNORAN los modos de mezcla, asi
   *     que un rectangulo no puede "sumar luz": se quedaria como una mancha
   *     plana encima de la roca. Una imagen si acepta ADD, que es lo que hace
   *     que parezca luz y no pintura.
   *
   *   · Se difumina tambien por los LADOS (`destination-in` con un degradado
   *     horizontal). Sin eso se ve el borde recto del rectangulo y delata que
   *     es un cartel pegado encima en vez de luz entrando por un hueco.
   *
   *   · Las flechas suben y se desvanecen en bucle, desfasadas. El movimiento
   *     es lo que lee el ojo como "por aqui": un simbolo quieto sobre una
   *     pared oscura se confunde con parte del decorado.
   *
   * La luz viene de ARRIBA porque la boca esta al norte del punto de
   * aparicion (el rectangulo de salida esta en y=224 y se aparece en y=352).
   * Si algun dia se mueve la salida, el degradado la sigue: todo sale de
   * `collisionRectangles1`, no de numeros escritos aqui.
   */
  _montarSalidaVisible() {
    const r = this._salida;
    if (!r) return;

    /* UN CHARCO DE LUZ, NO UN RECTANGULO.
     *
     * La primera version era un degradado LINEAL de arriba abajo recortado en
     * los lados. Se veia raro por dos motivos y los dos eran de dibujo: el
     * borde de arriba salia a plena intensidad, o sea un CANTO RECTO de luz
     * sobre la roca; y al ser lineal, la luz tenia la misma fuerza a lo ancho
     * de toda la boca en vez de concentrarse en ella.
     *
     * Ahora es un degradado RADIAL centrado en la boca. Se apaga solo en
     * todas las direcciones, asi que no hay ningun canto: es luz entrando por
     * un hueco, que es lo que se queria contar. El lienzo se hace mas grande
     * que la boca (el doble de alto) justo para que el radial tenga sitio
     * donde apagarse dentro de la textura y no lo corte el borde. */
    const W = Math.round(r.width) + 160;
    const H = Math.round(r.height) + 224;

    const CLAVE = 'mina_salida_luz';
    if (this.textures.exists(CLAVE)) this.textures.remove(CLAVE);
    const lienzo = this.textures.createCanvas(CLAVE, W, H);
    const ctx = lienzo.getContext();

    const cx = W / 2;
    const cy = Math.round(r.height) * 0.6 + 24;   // la boca, dentro del lienzo
    const radio = Math.max(W, H) * 0.60;

    const luz = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.06, cx, cy, radio);
    luz.addColorStop(0.00, 'rgba(255,244,214,0.92)');
    luz.addColorStop(0.18, 'rgba(255,234,176,0.52)');
    luz.addColorStop(0.45, 'rgba(255,222,146,0.20)');
    luz.addColorStop(0.75, 'rgba(255,212,126,0.05)');
    luz.addColorStop(1.00, 'rgba(255,208,120,0)');
    ctx.fillStyle = luz;
    ctx.fillRect(0, 0, W, H);

    /* Y un haz suave que baja hacia el suelo: es lo que hace que se lea como
       "entra luz por ahi arriba" y no como una mancha flotando. Va en
       `lighter` para que se sume al radial en vez de taparlo. */
    ctx.globalCompositeOperation = 'lighter';
    const haz = ctx.createLinearGradient(0, cy, 0, H);
    haz.addColorStop(0.00, 'rgba(255,238,190,0.30)');
    haz.addColorStop(0.55, 'rgba(255,226,160,0.10)');
    haz.addColorStop(1.00, 'rgba(255,220,150,0)');
    ctx.fillStyle = haz;
    const anchoHaz = Math.round(r.width) * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - anchoHaz / 2, cy);
    ctx.lineTo(cx + anchoHaz / 2, cy);
    ctx.lineTo(cx + anchoHaz, H);
    ctx.lineTo(cx - anchoHaz, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    lienzo.refresh();

    /* DEPTH 9500: POR ENCIMA DE LA PENUMBRA, que esta en 9000.
       Estaba en 5, o sea debajo, y la penumbra -que ahora SI multiplica- le
       quitaba justo lo que la hace luz. Una luz que entra por un hueco tiene
       que caer sobre todo lo que hay debajo, incluido el jugador: por eso va
       arriba del todo y en ADD, sumando en vez de tapando. */
    this._salidaLuz = this.add.image(r.centerX, r.y - 24, CLAVE)
      .setOrigin(0.5, 0)
      .setDepth(9500)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: this._salidaLuz,
      alpha: { from: 0.72, to: 1 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // ── Las flechas ────────────────────────────────────────────────────────
    const CLAVE_F = 'mina_salida_flecha';
    if (this.textures.exists(CLAVE_F)) this.textures.remove(CLAVE_F);
    const lf = this.textures.createCanvas(CLAVE_F, 28, 16);
    const cf = lf.getContext();
    cf.strokeStyle = 'rgba(255,240,200,0.95)';
    cf.lineWidth = 5;
    cf.lineCap = 'round';
    cf.lineJoin = 'round';
    cf.beginPath();
    cf.moveTo(4, 12);
    cf.lineTo(14, 4);
    cf.lineTo(24, 12);
    cf.stroke();
    lf.refresh();

    this._salidaFlechas = [];
    for (let i = 0; i < 3; i++) {
      const f = this.add.image(r.centerX, r.bottom + 46, CLAVE_F)
        .setDepth(9501)
        .setBlendMode(Phaser.BlendModes.ADD);
      this._salidaFlechas.push(f);
      this.tweens.add({
        targets: f,
        y: { from: r.bottom + 46, to: r.bottom - 14 },
        alpha: { from: 0, to: 1 },
        duration: 1500,
        delay: i * 500,
        repeat: -1,
        ease: 'Sine.easeOut',
        yoyo: false,
        onRepeat: () => { f.setAlpha(0); }
      });
    }
  }

  _montarBurbujas() {
    // `area_lava_interior`: una burbuja en la orilla reventaria encima del
    // labio de basalto, que es piedra.
    const capa = this.map.getObjectLayer('area_lava_interior') || this.map.getObjectLayer('area_lava');
    if (!capa || !capa.objects.length) return;
    const trozos = capa.objects;

    /* LA ANIMACION SE REHACE AQUI EN CADA ENTRADA, Y NO ES POR GUSTO.
     *
     * Antes se creaba en `GameScene._crearAnimaciones()` con un
     * `if (!anims.exists(...))`. Dos formas de romperse, y las dos acabaron en
     * pantalla negra:
     *
     *   1. La isla tambien hereda ese metodo y NO carga `lava_burbuja`. Alli
     *      la animacion se creaba con CERO fotogramas —las animaciones son
     *      globales del juego— y la mina se la encontraba ya hecha y vacia.
     *   2. `_alApagar()` suelta la textura al salir. En la segunda visita la
     *      textura es OTRA, pero las tramas de la animacion vieja seguian
     *      apuntando a la destruida.
     *
     * En los dos casos, el primer `play()` moria en `frames[0].duration`. Y la
     * llamada sale de un TimerEvent: una excepcion ahi corta el paso del bucle
     * de Phaser ANTES de dibujar, asi que no se pierde una burbuja, se pierde
     * el juego entero.
     *
     * Rehacerla cuesta nada y no deja ninguna de las dos puertas abiertas. */
    if (!this.textures.exists('lava_burbuja')) {
      console.warn('⛏️ sin la textura lava_burbuja: la mina va sin burbujas');
      return;
    }
    if (this.anims.exists('lava_burbuja_anim')) {
      this.anims.remove('lava_burbuja_anim');
    }
    this.anims.create({
      key: 'lava_burbuja_anim',
      frames: this.anims.generateFrameNumbers('lava_burbuja', { start: 0, end: 5 }),
      frameRate: 9,
      repeat: 0
    });

    const recolocar = (spr) => {
      /* Y aun asi, con red. Esto corre desde un temporizador, y un temporizador
         que lanza se lleva por delante el fotograma entero. Ninguna burbuja
         merece eso. */
      try {
        const t = trozos[Phaser.Math.Between(0, trozos.length - 1)];
        spr.setPosition(
          t.x + Phaser.Math.Between(0, Math.max(0, t.width - 32)) + 16,
          t.y + Phaser.Math.Between(0, Math.max(0, t.height - 32)) + 16
        );
        spr.setVisible(true);
        spr.play('lava_burbuja_anim');
      } catch (e) {
        console.warn('⛏️ burbuja:', e && e.message);
        try { spr.setVisible(false); } catch (e2) {}
      }
    };

    for (let i = 0; i < 8; i++) {
      const spr = this.add.sprite(0, 0, 'lava_burbuja', 0)
        .setDepth(6).setVisible(false);
      spr.on('animationcomplete', () => {
        spr.setVisible(false);
        this.time.delayedCall(Phaser.Math.Between(400, 2200), () => {
          if (spr.active) recolocar(spr);
        });
      });
      this._burbujas.push(spr);
      this.time.delayedCall(i * 260 + 200, () => { if (spr.active) recolocar(spr); });
    }
  }




  // =========================================================================
  // UPDATE
  // =========================================================================
  //
  // NO llama a super.update(). El update de GameScene recorre los arboles, las
  // rocas, los NPC y el gestor de trozos del mapa de fuera: nada de eso existe
  // aqui, y ademas es justo lo que el encargo pedia que NO hubiera en la mina.
  //
  // Lo que si se reutiliza son los metodos: la consulta de colisiones, el
  // movimiento por raton y el seguimiento de la mascota son los heredados.

  update(time, delta) {
    /* Ya nos vamos: ni un fotograma mas. Sin esto, el update seguiria
       escribiendo `posicionplayerx` con las coordenadas de la cueva encima de
       las que `_dejarPartidaEnElMapa()` acaba de guardar. */
    if (this._cambiandoEscena) return;

    // La burbuja de chat local se recoloca aunque este oculta: es lo que
    // permite reafirmarla si algo apago el HUD con un mensaje en pantalla.
    {
      let b = this._elBurbujaLocal;
      if (!b || !b.isConnected) {
        b = this._elBurbujaLocal = document.getElementById('local-chat-bubble');
      }
      const plazoVivo = this._burbujaHasta && Date.now() < this._burbujaHasta;
      if (b && (plazoVivo || b.style.display !== 'none')) this._positionLocalBubble(b);
    }

    if (!this.keys) return;

    // GUARD DE RECONSTRUCCION. create() es async y Phaser reutiliza la
    // instancia: update() puede empezar a correr con los sprites de la sesion
    // anterior ya destruidos. Phaser no los pone a null al destruirlos, solo
    // les quita `scene`, de ahi la segunda comprobacion.
    if (!this.player || !this.player.scene) return;

    this._asegurarIndiceColisiones();

    this.previousPosition = { x: this.player.x, y: this.player.y };
    this.posicionplayerx = this.player.x;
    this.posicionplayery = this.player.y;

    // ── Movimiento ─────────────────────────────────────────────────────────
    if (this.mouseMovement.followCursorActive && !this.input.activePointer.isDown) {
      this.stopMouseMovement();
    }
    this.handleMouseMovement(delta);

    if (!this.mouseMovement.followCursorActive) {
      // Con el foco en el chat, las teclas escriben: no mueven.
      const bloqueado = this._chatInputFocused === true;
      let dx = 0, dy = 0;
      if (!bloqueado) {
        if (this.keys.leftArrow.isDown || this.keys.left.isDown) dx -= 1;
        if (this.keys.rightArrow.isDown || this.keys.right.isDown) dx += 1;
        if (this.keys.upArrow.isDown || this.keys.up.isDown) dy -= 1;
        if (this.keys.downArrow.isDown || this.keys.down.isDown) dy += 1;
      }
      // Joystick, si lo hay.
      if (this._joy && this._joy.force > 0) {
        const r = Phaser.Math.DegToRad(this._joy.angle);
        dx += Math.cos(r);
        dy += Math.sin(r);
      }
      // En diagonal, sin normalizar se iria un 41 % mas rapido.
      const largo = Math.hypot(dx, dy);
      if (largo > 1) { dx /= largo; dy /= largo; }

      const seg = delta / 1000;
      this.player.x += dx * this.speed * seg;
      this.player.y += dy * this.speed * seg;
      this._rawMoveDx = dx;
      this._rawMoveDy = dy;
    }

    // ── Colisiones, eje a eje ──────────────────────────────────────────────
    //
    // Eje a eje y no de una vez: resolviendo los dos juntos, rozar una pared
    // en diagonal deja al jugador clavado en vez de dejarle deslizarse.
    // El rectangulo (30x15 a los pies) es el mismo que usa el mapa de fuera.
    const prevX = this.previousPosition.x;
    const prevY = this.previousPosition.y;
    /* 26 de alto, no 15. El sprite es de 23x51 a escala 2, o sea 102 px con el
       origen en el centro: los pies caen en `y + 51`. Con 15 de alto la caja
       acababa en `y + 40` y los ultimos once pixeles del personaje se metian
       DENTRO de la pared. Se alarga por abajo y no se mueve: el borde de
       arriba sigue igual, asi que no se empieza a chocar antes de costado. */
    // Eje a eje, y si estaba atrapado, fuera (GameScene._resolverChoqueJugador).
    this._resolverChoqueJugador(prevX, prevY, 26);

    // ── Animacion: UNA sola decision por fotograma ─────────────────────────
    //
    // Se decide DESPUES de resolver las colisiones y con el desplazamiento
    // real. Decidirla antes, con el input crudo, es lo que congelaba la
    // animacion al chocar en diagonal en el mapa de fuera: dos bloques
    // distintos llamaban a anims.play() con direcciones distintas en el mismo
    // fotograma y la animacion se reiniciaba en el cuadro 0 una y otra vez.
    this._animarJugador(prevX, prevY);

    // ── Rectangulo del jugador (lo usa la salida) ──────────────────────────
    if (!this.playerRect) this.playerRect = new Phaser.Geom.Rectangle(0, 0, 30, 26);
    this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 26);

    // ── Profundidad y adornos que siguen al jugador ────────────────────────
    this.player.setDepth(this.player.y);
    if (this.shadowContainer) {
      this.shadowContainer.setPosition(this.player.x, this.player.y + 45);
      this.shadowContainer.setDepth(this.player.y - 1);
    }
    if (this.usuariox) {
      this.usuariox.setText(this.Username || '');
      this.usuariox.setPosition(this.player.x, this.player.y - 60);
      this.usuariox.setDepth(this.player.y + 1);
    }

    // ── La mascota (metodo heredado) ───────────────────────────────────────
    try { this._actualizarMascota(); } catch (e) { /* sin perro, sin drama */ }

    /* Que los demas mineros le vean moverse. La mina no mandaba nada: su
       socket estaba en la sala del mapa de fuera (ver `_salaDeEscena`). */
    if (this.dog) { try { this.sendPlayerMovement(); } catch (e) {} }
    // Los demás que lleven 5 minutos quietos se ocultan (gf-reposo.js).
    try { this.cleanInactivePlayers(); } catch (e) {}

    // ── La lava, el agua y las luces ───────────────────────────────────────
    this._animarLiquidos(delta);
    if (this._luces.length) {
      const t = time / 1000;
      for (let i = 0; i < this._luces.length; i++) {
        const l = this._luces[i];
        const v = Math.sin(t * l.vel + l.fase) * 0.6 + Math.sin(t * l.vel * 2.7 + l.fase * 1.3) * 0.4;
        l.img.setAlpha(l.base * (1 + l.vibra * v));
        l.parpadeo = v;
      }
    }
    this._pintarOscuridad();

    // ── La salida ──────────────────────────────────────────────────────────
    this._comprobarSalida();
  }

  /**
   * La sala del servidor de la mina. `initSocket()` (heredado) entraba en
   * 'game': bajo tierra el servidor te tenia en el mapa de fuera, los del
   * pueblo te veian en las coordenadas de la cueva y el panel de amigos no
   * sabia que estabas aqui. Ver `_salaDeEscena` en GameScene.
   */
  _salaDeEscena() {
    return 'mina';
  }


  // =========================================================================
  // SALIR DE LA MINA
  // =========================================================================

  /**
   * La boca de la galeria devuelve al mapa.
   *
   * Dos candados, los mismos que la puerta de la tienda y por el mismo motivo:
   *
   *   · `_salidaArmada`: la salida no dispara hasta que el jugador haya SALIDO
   *     de su rectangulo al menos una vez. Se aparece justo al lado, asi que
   *     sin esto el primer fotograma de la mina te devolveria arriba.
   *   · `_cambiandoEscena`: scene.start() no surte efecto hasta el final del
   *     paso actual, asi que sin esto el mismo fotograma podria lanzar la
   *     transicion dos veces.
   */
  _comprobarSalida() {
    if (!this._salida || !this.playerRect) return;

    const tocando = Phaser.Geom.Intersects.RectangleToRectangle(
      this.playerRect, this._salida);

    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;

    this._salidaArmada = false;
    this._cambiandoEscena = true;
    this._volverAlMapa();
  }

  _volverAlMapa() {
    console.log('⛏️ saliendo de la mina');

    // Soltar el item que se llevara en la mano: el div del arrastre es DOM
    // compartido y se quedaria pegado al cursor en la escena siguiente.
    try { this._cancelarArrastre(); } catch (e) {}
    try { this.player.anims.stop(); } catch (e) {}

    // Donde se reaparece arriba: justo DEBAJO del hueco de la puerta de la
    // mina, en el pasillo que dejan los dos muros de la entrada (x 3305..3363,
    // y ~730). Si se pusiera dentro del rectangulo de la puerta, el candado
    // `_puertaArmada` de GameScene lo resolveria, pero el jugador apareceria
    // encima del batiente.
    const destino = { x: 3334, y: 760, mundo: 1 };

    /* GUARDAR CON EL MUNDO YA CORREGIDO, y no `savegg()` a secas.
       `savegg()` guarda `mundo: this.mundo`, que aqui vale 3. Guardando tal
       cual, la partida quedaba como "esta en la mina" y la pantalla de carga
       -que ignora el `playerData` de abajo y lee siempre de /api/load- te
       devolvia a la mina. El `playerData` del scene.start se deja porque es
       lo que hacen las otras transiciones del juego, pero quien manda de
       verdad es esta linea. */
    this._dejarPartidaEnElMapa(destino.x, destino.y);

    this._ocultarHUD();
    try { this.removeListener(); } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
    try { this.stopMusicSafely(); } catch (e) {}

    // El apagado heredado de GameScene entra en `_salaAlSalir()`: que sea la
    // del mapa, la misma que se pide aquí, y no 'fuera'.
    this._salaDestino = 'game';
    if (this.socket && this.socket.connected) {
      this.socket.emit('joinRoom', {
        room: 'game',
        username: this.Username || '---',
        lastScene: 'MinaScene',
        x: destino.x,
        y: destino.y
      });
    }

    try { this.cleanupScene(); } catch (e) { console.warn('limpieza:', e); }

    this.scene.start('LoadingScenegame', {
      targetScene: 'GameScene',
      playerData: destino
    });
  }


  // =========================================================================
  // APAGADO
  // =========================================================================
  //
  // Se sueltan a mano las cosas que la escena NO limpia sola:
  //
  //   · el Graphics de cada mascara, que nunca estuvo en la lista de dibujo;
  //   · las texturas del mapa y de la lava, que son de la mina y no pintan
  //     nada en memoria de video mientras se esta arriba.
  //
  // Este proyecto ya pago caro no soltar texturas al cambiar de escena: la
  // memoria de video crecia en cada viaje hasta que el juego se arrastraba.

  _alApagar() {
    if (this._minaCleanupDone) return;
    this._minaCleanupDone = true;
    this._sceneStopped = true;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza de mina:', e); }
    console.log('⛏️ apagando la mina');

    /* El cartel de la salida. Sus dos texturas son de lienzo y las crea
       esta escena, asi que se sueltan aqui o se quedan en memoria de video
       -el problema que ya costo caro en este proyecto-. */
    try { if (this._salidaLuz) this._salidaLuz.destroy(); } catch (e) {}
    (this._salidaFlechas || []).forEach(f => { try { f.destroy(); } catch (e) {} });
    this._salidaLuz = null;
    this._salidaFlechas = [];
    ['mina_salida_luz', 'mina_salida_flecha'].forEach(k => {
      try { if (this.textures.exists(k)) this.textures.remove(k); } catch (e) {}
    });

    (this._mascaras || []).forEach(g => { try { g.destroy(); } catch (e) {} });
    this._mascaras = [];

    this._liquidosAnim = [];
    this._luces.forEach(l => { try { l.img.destroy(); } catch (e) {} });
    this._luces = [];

    this._burbujas.forEach(s => { try { s.destroy(); } catch (e) {} });
    this._burbujas = [];

    (this._piezas || []).forEach(s => { try { s.destroy(); } catch (e) {} });
    this._piezas = [];

    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.capaBordes) this.capaBordes.destroy(); } catch (e) {}
    try { if (this.capaSombras) this.capaSombras.destroy(); } catch (e) {}
    try { if (this.capaObjetos) this.capaObjetos.destroy(); } catch (e) {}
    try { if (this.penumbra) this.penumbra.destroy(); } catch (e) {}
    this._oscuridad = null;
    // Los sellos del mapa de luz son pocos KB, pero son de lienzo: fuera.
    (this._sellosLuz || []).forEach(s => {
      try { if (this.textures.exists(s.k)) this.textures.remove(s.k); } catch (e) {}
    });
    this._sellosLuz = [];
    try {
      if (this.textures.exists('mina_penumbra')) this.textures.remove('mina_penumbra');
    } catch (e) {}
    this.backgroundLayer = null;
    this.capaBordes = null;
    this.capaSombras = null;
    this.capaObjetos = null;
    this.penumbra = null;

    // El tilemap tambien: sin esto su copia de los 97.969 tiles se queda en la
    // cache de tilemaps de la escena.
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];

    const texturasMina = ['tiles_mina', 'piezas_mina', 'lava_burbuja', 'mina_luz'];
    Object.keys(LIQUIDOS_MINA).forEach(m => {
      for (let f = 0; f < LIQUIDOS_MINA[m].fotogramas; f++) texturasMina.push('mina_' + m + '_' + f);
    });
    texturasMina
      .forEach(clave => {
        try { if (this.textures.exists(clave)) this.textures.remove(clave); } catch (e) {}
      });

    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

window.MinaScene = MinaScene;
