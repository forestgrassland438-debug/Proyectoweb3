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
 * La lava sigue la misma regla. Son 136 rectangulos en el mapa, pero no se
 * crean 136 objetos: se crean DOS tileSprite (el flujo y el brillo) sobre el
 * rectangulo que los engloba a todos, recortados con una mascara de geometria
 * construida con esos 136 rectangulos. Dos llamadas de dibujo para toda la
 * lava del mapa, en vez de 272.
 */

/* global GameScene, Phaser */

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
    this._lavaCapas = [];      // los tileSprite del flujo y del brillo
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
    this.load.image('tiles_mina', './Game/MAPAS/Mina/tileset_mina.png');
    this.load.tilemapTiledJSON('tilemap_mina', './Maps/mina.json');

    // ── Las texturas de la lava ────────────────────────────────────────────
    // El atlas de piezas grandes: pedruscos, racimos de cristal, vagonetas y
    // arcos de apuntalar. Una textura y una peticion para las dieciseis.
    this.load.atlas('piezas_mina', './Game/MAPAS/Mina/piezas.png',
                    './Game/MAPAS/Mina/piezas.json');

    this.load.image('lava_flujo', './Game/MAPAS/Mina/lava_flujo.png');
    this.load.image('lava_brillo', './Game/MAPAS/Mina/lava_brillo.png');
    this.load.image('agua_flujo', './Game/MAPAS/Mina/agua_flujo.png');
    this.load.spritesheet('lava_burbuja', './Game/MAPAS/Mina/lava_burbuja.png',
                          { frameWidth: 16, frameHeight: 16 });

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
    this._salidaArmada = false;
    this._graphicsOcultado = false;
    this._lavaCapas = [];
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

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // ── Colisiones ─────────────────────────────────────────────────────────
    //
    // Se reutilizan los MISMOS nombres de propiedad que GameScene
    // (collisionRectangles / 1 / 2) porque el indice espacial heredado
    // (_reconstruirIndiceColisiones) lee justo esos. Cambiarles el nombre aqui
    // dejaria a la mina sin colisiones y sin ningun error en consola.
    this._faseMina = 'colisiones';
    this.collisionRectangles = this._rectsDeCapa('area_colision_general');

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
    const inicio = this._puntoDeAparicion();
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
    const CLAVE_PEN = 'mina_penumbra';
    if (!this.textures.exists(CLAVE_PEN)) {
      const lz = this.textures.createCanvas(CLAVE_PEN, 4, 4);
      const cx = lz.getContext();
      cx.fillStyle = '#4a5a78';
      cx.fillRect(0, 0, 4, 4);
      lz.refresh();
    }
    this.penumbra = this.add.image(0, 0, CLAVE_PEN)
      .setOrigin(0, 0)
      .setDisplaySize(this.map.widthInPixels, this.map.heightInPixels)
      .setDepth(9000)
      .setAlpha(0.42);
    this.penumbra.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // ── LOS SISTEMAS DE JUEGO ──────────────────────────────────────────────
    // Inventario, cofre, monedas, cadena, socket, misiones. Va ANTES del HUD
    // para que cuando se pinten las barras y las monedas ya haya datos.
    this._faseMina = 'sistemas de juego';
    /* EL CHAT, ANTES DE CABLEAR EL HUD.
       `_cablearHUD()` engancha el boton del chat solo `if (this._toggleChat)`,
       y ese metodo lo crea `_setupChatDom()`. Llamandolo despues, el boton se
       quedaba sin enganchar por esa via. Ahora va primero. */
    try { this._setupChatDom(); } catch (e) { console.warn('chat:', e); }

    /* EL HUD SE ENSENA ANTES DE IR A LA RED.
       Estaba DESPUES de `_arrancarSistemas()`, que hace media docena de
       peticiones: dos o tres segundos mirando el mapa sin barras, sin monedas
       y sin botones. Ahora se pinta en cuanto el mundo esta montado y los
       datos van llegando encima. Se vuelve a llamar al terminar porque
       `_cablearHUD()` necesita cosas que solo existen despues (el catalogo de
       objetos, el hub de avisos): la segunda llamada es idempotente. */
    this._mostrarHUD();

    await this._arrancarSistemas();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;

    // ── El HUD ─────────────────────────────────────────────────────────────
    this._faseMina = 'HUD';
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
    const capa = this.map.getObjectLayer('piezas');
    if (!capa || !capa.objects.length) return;

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
   * La lava y el agua.
   *
   * COMO SE ANIMA LA LAVA, Y POR QUE ASI
   * ------------------------------------------------------------------------
   * Phaser 3 NO reproduce solo las animaciones de tile de Tiled (hace falta un
   * plugin), y cambiar el indice de cada tile de lava en cada fotograma sobre
   * un mapa de 313x313 es tirar el fotograma a la basura.
   *
   * Lo que se hace es poner por encima del lago dos tileSprite con texturas que
   * TEJEN y moverles `tilePosition`. Un tileSprite repite su textura en el
   * shader, asi que moverla no cuesta nada: no se redibuja ni un pixel, solo
   * cambia una coordenada.
   *
   * Y se mueven a VELOCIDADES DISTINTAS a proposito. Con las dos capas a la
   * misma velocidad la lava parece una alfombra que se desliza; con el brillo
   * yendo mas despacio que la costra, la vista lee las dos capas como
   * profundidad y parece que la lava CORRE.
   *
   * La mascara es lo que evita crear 136 objetos: los dos tileSprite cubren el
   * rectangulo que engloba toda la lava y una mascara de geometria construida
   * con los 136 rectangulos del mapa recorta lo que sobra.
   */
  _montarLiquidos() {
    // OJO CON LA CAPA: se usa `area_lava_interior`, no `area_lava`.
    //
    // FALLO QUE ESTO ARREGLA, y que solo se vio con el mapa montado en Phaser:
    // los rectangulos de `area_lava` cubren TODAS las casillas de lava,
    // incluidas las del borde, que llevan las piezas de transicion con su
    // contorno ondulado. El tileSprite del brillo es un rectangulo, asi que
    // remataba el lago con un filo RECTO por encima de esa onda: se veia el
    // escalon del tile en todo el perimetro.
    //
    // `area_lava_interior` solo trae las casillas rodeadas de lava. El brillo
    // se queda una casilla adentro y el borde del lago lo dibuja unicamente la
    // pieza de transicion, que para eso esta.
    this._montarLiquido('area_lava_interior', 'lava_flujo', 'lava_brillo', 4, 10);
    this._montarLiquido('area_agua_interior', 'agua_flujo', null, 5, 0);
    this._montarBurbujas();
  }

  _montarLiquido(capaNombre, texturaFlujo, texturaBrillo, profundidad, velocidad) {
    const capa = this.map.getObjectLayer(capaNombre);
    if (!capa || !capa.objects.length) return;

    // Rectangulo que engloba todos los trozos.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    capa.objects.forEach(o => {
      x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
      x1 = Math.max(x1, o.x + o.width); y1 = Math.max(y1, o.y + o.height);
    });
    const ancho = x1 - x0;
    const alto = y1 - y0;

    // La mascara: un Graphics con los trozos de verdad. `make.graphics` lo crea
    // FUERA de la lista de dibujo, asi que la mascara no se ve por si misma.
    const forma = this.make.graphics({ x: 0, y: 0, add: false });
    forma.fillStyle(0xffffff);
    capa.objects.forEach(o => forma.fillRect(o.x, o.y, o.width, o.height));
    const mascara = forma.createGeometryMask();

    const flujo = this.add.tileSprite(x0, y0, ancho, alto, texturaFlujo)
      .setOrigin(0, 0)
      .setDepth(profundidad)
      .setMask(mascara);
    // Que la textura arranque alineada con el tile de debajo: los dos se
    // dibujaron con el mismo campo de grietas y el mismo periodo, asi que
    // cuadran si el desfase inicial es el del rectangulo.
    flujo.tilePositionX = x0;
    flujo.tilePositionY = y0;
    this._lavaCapas.push({ obj: flujo, vx: velocidad * 0.35, vy: velocidad });

    if (texturaBrillo) {
      const brillo = this.add.tileSprite(x0, y0, ancho, alto, texturaBrillo)
        .setOrigin(0, 0)
        .setDepth(profundidad + 1)
        .setAlpha(0.75)
        .setMask(mascara);
      brillo.setBlendMode(Phaser.BlendModes.ADD);
      brillo.tilePositionX = x0;
      brillo.tilePositionY = y0;
      // Mas despacio y en diagonal contraria: es lo que da la sensacion de
      // que la costra flota sobre algo que se mueve por debajo.
      this._lavaCapas.push({ obj: brillo, vx: -velocidad * 0.18, vy: velocidad * 0.42 });
    }

    // El Graphics de la mascara hay que guardarlo para destruirlo al apagar:
    // no esta en la lista de dibujo, asi que la escena no lo limpia sola.
    this._mascaras = this._mascaras || [];
    this._mascaras.push(forma);
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
    const capa = this.map.getObjectLayer('area_lava');
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
          t.x + Phaser.Math.Between(0, Math.max(0, t.width - 16)) + 8,
          t.y + Phaser.Math.Between(0, Math.max(0, t.height - 16)) + 8
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
        .setDepth(6).setScale(1.5).setVisible(false);
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
    if (this._chocaConEscenario(this.player.x - 15, prevY + 25, 30, 26)) {
      this.player.x = prevX;
    }
    if (this._chocaConEscenario(this.player.x - 15, this.player.y + 25, 30, 26)) {
      this.player.y = prevY;
    }

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

    // ── La lava ────────────────────────────────────────────────────────────
    const seg = delta / 1000;
    for (let i = 0; i < this._lavaCapas.length; i++) {
      const c = this._lavaCapas[i];
      c.obj.tilePositionX += c.vx * seg;
      c.obj.tilePositionY += c.vy * seg;
    }

    // ── La salida ──────────────────────────────────────────────────────────
    this._comprobarSalida();
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

    this._lavaCapas.forEach(c => { try { c.obj.destroy(); } catch (e) {} });
    this._lavaCapas = [];

    this._burbujas.forEach(s => { try { s.destroy(); } catch (e) {} });
    this._burbujas = [];

    (this._piezas || []).forEach(s => { try { s.destroy(); } catch (e) {} });
    this._piezas = [];

    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.capaObjetos) this.capaObjetos.destroy(); } catch (e) {}
    try { if (this.penumbra) this.penumbra.destroy(); } catch (e) {}
    try {
      if (this.textures.exists('mina_penumbra')) this.textures.remove('mina_penumbra');
    } catch (e) {}
    this.backgroundLayer = null;
    this.capaObjetos = null;
    this.penumbra = null;

    // El tilemap tambien: sin esto su copia de los 97.969 tiles se queda en la
    // cache de tilemaps de la escena.
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];

    ['tiles_mina', 'piezas_mina', 'lava_flujo', 'lava_brillo', 'agua_flujo',
     'lava_burbuja']
      .forEach(clave => {
        try { if (this.textures.exists(clave)) this.textures.remove(clave); } catch (e) {}
      });

    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

window.MinaScene = MinaScene;
