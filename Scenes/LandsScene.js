/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * LA ISLA DE LAS PARCELAS — Scenes/LandsScene.js
 *
 * ============================================================================
 *
 * QUE ES ESTO
 * ---------------------------------------------------------------------------
 * La isla a la que lleva el boton redondo de Lands. Se entra desde el mapa, la
 * tienda o la mina, y se sale por el MISMO boton, que alli cambia de icono.
 * Quien decide todo eso es `gf-lands.js`; esta escena solo se monta.
 *
 * HEREDA DE GameScene, IGUAL QUE MinaScene
 * ---------------------------------------------------------------------------
 * Por el mismo motivo: asi tiene el HUD entero —inventario, casillas rapidas,
 * barras, monedas, chat, correo, habilidades, NFT, mascota y amistades— sin
 * copiar ni una linea. Lo unico propio de este archivo es el mapa, el agua que
 * frena y el sitio donde aparece el jugador.
 *
 * EL MAPA VIENE DADO, NO SE GENERA
 * ---------------------------------------------------------------------------
 * LAS PARCELAS (2026-10-03): ver la seccion CONSTRUCCION. Se compran en la
 * tienda, se colocan aqui, y se siembran con el sistema de cultivos heredado.
 * Son el MISMO cuadro de tierra del huerto del pueblo (2026-10-04), y se
 * recogen con la PALA de construccion, que tambien se compra en la tienda.
 *
 * `Maps/mapa_lands.json` y `Game/MAPAS/isla_32.png` ya existian en el
 * proyecto. Son 64x48 casillas de 32 px = 2048x1536 px, con una sola capa de
 * tiles llamada `Terrain`.
 *
 * OJO: las casillas son de 32 px, no de 16 como en el mapa de fuera y la mina.
 * Eso solo cambia el `addTilesetImage`; el jugador sigue midiendo 46x102 px, o
 * sea kilo y medio de casilla de ancho y tres de alto.
 *
 * LA ISLA AL DOBLE (2026-10-05): "la Land la quiero x2". Se carga
 * `Maps/mapa_lands_x2.json` con `Game/MAPAS/isla_64.png`: el mismo mapa con
 * casillas de 64 px (tools/lands-al-doble.py; los originales no se tocan).
 * El jugador no cambia: es la isla la que crece. Lo construido sigue en una
 * rejilla de 32 px (CASILLA_CONSTRUCCION): ver `_tamCasilla`.
 *
 * EL AGUA SE SACA DE LOS TILES, NO DE UNA CAPA DE COLISIONES
 * ---------------------------------------------------------------------------
 * El mapa no trae capa de objetos: es un tilelayer y nada mas. Asi que las
 * colisiones se calculan al arrancar recorriendo la capa y marcando las
 * casillas de agua, y despues se FUSIONAN en rectangulos maximos — el mismo
 * barrido que usa el generador de la mina. De 1.323 casillas de agua salen
 * unas pocas decenas de rectangulos, que es lo que el indice espacial heredado
 * espera encontrar.
 */

/* global GameScene, Phaser */

/* La pala de construccion (2026-10-04): la herramienta para RECOGER lo que se
   construyo en la isla. Se compra en la tienda (Construction), vive en la
   tabla `pala_contrucion` del contrato y no se gasta. Sin pala, lo construido
   no se puede quitar (el servidor lo comprueba en la cadena). */
const ID_PALA = 'pala_construccion';
const MSG_SIN_PALA = 'You need a Construction Shovel to dig it up. Buy one in the shop → Construction.';

/* LO QUE SE COLOCA EN LA ISLA (2026-10-05): la parcela, el bote de basura y
   los cuatro cofres, en el orden de la barra de construir. El tamaño y la
   capacidad de cada uno los manda el servidor (TIPOS_DE_CONSTRUCCION en
   server2.js); estos son los de reserva mientras no conteste.

   El bote y los cofres son OBJETOS: su dibujo al doble, como el bote del
   pueblo, ordenado por profundidad con el jugador y con la base que frena.
   La parcela es suelo (la tierra del huerto). */
const COLOCABLES = ['parcela', 'basura', 'cofre1', 'cofre2', 'cofre3', 'cofre4'];
const COLOCABLE = {
  parcela: { nombre: 'Land Plot',        icono: './Game/Objetos/construccion/parcela.png', ancho: 2, alto: 2 },
  basura:  { nombre: 'Trash Can',        icono: './Game/Objetos/cofres/basura.png', ancho: 2, alto: 2, objeto: true },
  cofre1:  { nombre: 'Wooden Chest',     icono: './Game/Objetos/cofres/cofre1.png', ancho: 2, alto: 2, objeto: true, capacidad: 5 },
  cofre2:  { nombre: 'Reinforced Chest', icono: './Game/Objetos/cofres/cofre2.png', ancho: 2, alto: 2, objeto: true, capacidad: 7 },
  cofre3:  { nombre: 'Magic Chest',      icono: './Game/Objetos/cofres/cofre3.png', ancho: 2, alto: 2, objeto: true, capacidad: 13 },
  cofre4:  { nombre: 'Legendary Chest',  icono: './Game/Objetos/cofres/cofre4.png', ancho: 2, alto: 2, objeto: true, capacidad: 20 }
};
/* De donde sale cada uno: va en el aviso de "no tienes". */
const COMO_CONSEGUIR = {
  parcela: 'Buy them in the shop → Construction.',
  basura: 'Buy one in the shop → Construction.',
  cofre1: 'Buy one in the shop → Construction.',
  cofre2: 'Craft it from a Wooden Chest (Crafting → Chests).',
  cofre3: 'Craft it from a Reinforced Chest (Crafting → Chests).',
  cofre4: 'Craft it from a Magic Chest (Crafting → Chests).'
};
/* A cuanto hay que estar para abrir un cofre o usar el bote (pixeles, de los
   pies del jugador a la base del objeto). Alejarse mas cierra el cofre. */
const ALCANCE_OBJETO = 170;
/* La rejilla de lo construido: 32 px, la del servidor (TIPOS_DE_CONSTRUCCION).
   NO es la casilla del mapa, que con la isla al doble mide 64. */
const CASILLA_CONSTRUCCION = 32;
/* Nombres en ingles de lo que no los tiene en _getFruitDisplayNameEN (que
   para lo que no conoce devuelve el id con mayusculas: "Hacha De Madera"). */
const NOMBRE_EN = {
  hacha_de_madera: 'Wooden Axe', hacha_de_piedra: 'Stone Axe', hacha_de_cobre: 'Copper Axe', hacha_de_hierro: 'Iron Axe',
  pico_de_madera: 'Wooden Pickaxe', pico_de_piedra: 'Stone Pickaxe', pico_de_cobre: 'Copper Pickaxe', pico_de_hierro: 'Iron Pickaxe',
  balde_vacio: 'Empty Bucket', balde_con_agua: 'Water Bucket', palo: 'Wood Stick', tablon_de_madera: 'Wood Plank',
  Semillax: 'Carrot Seed', Semillax1: 'Tomato Seed', Semillax2: 'Wheat Seed', Semillax3: 'Pumpkin Seed',
  Semillax4: 'Strawberry Seed', Regaderax: 'Watering Can', Tijerasx: 'Shears'
};

// eslint-disable-next-line no-unused-vars
class LandsScene extends GameScene {

  constructor() {
    // La clave por el constructor, igual que MinaScene: Phaser la guarda en
    // sys.settings y respeta la que ya venga puesta, asi que un `super()` a
    // secas registraria esta escena como 'GameScene'.
    super({ key: 'LandsScene' });

    this.esLands = true;

    /* LOS GID DEL AGUA.
     *
     * Se sacaron mirando el tileset: se cogio el color dominante de cada tile
     * de `isla_32.png` y se marco el que es azul. En este mapa solo se usa uno,
     * el 43 (1.323 casillas); el resto son arena #dcc188 y hierba #418546, que
     * son ademas los MISMOS colores que el mapa de fuera (ver tiles.png).
     *
     * Si algun dia el mapa usa mas tiles de agua —los de transicion de orilla,
     * por ejemplo— basta con anadir sus gid aqui. */
    this.gidsAgua = [43];

    this._piezas = [];

    /* SIN 0.5x. El mundo de esta escena es una capa de TILEMAP, y a medio
       zoom el borde de cada casilla cae a medio pixel: el rasterizador
       redondea distinto en casillas contiguas y salen rayas por todo el mapa,
       como si estuviera partido en cuadros. Con 1x y 2x cada pixel de textura
       cae en un numero entero de pixeles de pantalla y no hay costuras.
       tiendajuego usa estos dos niveles desde hace tiempo, por lo mismo. */
    this._nivelesDeZoom = [1.0, 2.0];
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

  preload() {
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

    for (let i = 1; i <= 4; i++) {
      this.load.image('perro_derecha_' + i, './Game/Sprites/mascota/derecha/run_' + i + '.png');
      this.load.image('perro_izquierda_' + i, './Game/Sprites/mascota/izquierda/run_' + i + '.png');
    }

    // Claves PROPIAS ('tilemap_lands', 'tiles_isla'). La cache de Phaser es
    // compartida entre escenas: reutilizar 'tilemap' pisaria el del mapa de
    // fuera y al volver arriba se cargaria la isla.
    // Con versión: el tileset se regenera (tools/mejorar-tiles-escenas.py).
    this.load.image('tiles_isla', './Game/MAPAS/isla_64.png?v=20261006a');
    this.load.tilemapTiledJSON('tilemap_lands', './Maps/mapa_lands_x2.json?v=20261006a');

    // El bote y los cofres que se colocan (2026-10-05): el mismo dibujo que su
    // icono del inventario (tools/generar-cofres.py).
    for (const t of COLOCABLES) {
      if (COLOCABLE[t].objeto && !this.textures.exists('cons_' + t)) {
        this.load.image('cons_' + t, COLOCABLE[t].icono);
      }
    }

    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');

    /* LOS CUERVOS (2026-10-05): también en la isla bajan a comerse la
       cosecha, y el espantapájaros los para igual que en el pueblo. */
    if (window.GFCuervo && window.GFCuervo.CLAVES) {
      const vistas = new Set();
      Object.values(window.GFCuervo.CLAVES).forEach((lista) => lista.forEach((k) => {
        if (vistas.has(k) || this.textures.exists(k)) return;
        vistas.add(k);
        this.load.image(k, window.GFCuervo.RUTA + k + '.png');
      }));
    }

    /* LAS PARCELAS. La tierra del huerto con todas sus plantas: la isla
       siembra con el mismo sistema que el pueblo, y aqui se puede entrar sin
       haber pasado por el preload de GameScene.

       SIN MARCO DE MADERA (2026-10-04). La primera version ponia un bancal de
       tablas alrededor de la tierra; las parcelas del juego eran ya los
       cuadros de tierra del huerto del pueblo, y son esas las que se colocan. */
    this._precargarTexturasCultivo();
    /* `tipo: 'tienda'`, aunque la isla sea al aire libre: es el modo que NO
       carga los veintiun animales, los siete truenos ni el viento. Se pidio
       expresamente que en la isla no se oyera el ambiente. */
    if (window.GFAudio) window.GFAudio.precargar(this, { tipo: 'tienda' });
  }

  // =========================================================================
  // CREATE
  // =========================================================================

  async create() {
    const sceneRunId = this._sceneRunId = (this._sceneRunId || 0) + 1;
    this._sceneStopped = false;
    this._cleanupSceneDone = false;
    this._shutdownDone = false;
    this._landsCleanupDone = false;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    this.events.once('shutdown', this._alApagar, this);
    this.events.once('destroy', this._alApagar, this);
    console.log('🏝️ LandsScene.create()');

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
    let sesion = this._aplicarSesion(this.__sesionRecibida);
    if (!sesion) {
      console.log('🏝️ sin sesion heredada: se pide al servidor');
      sesion = await this.loadx();
    }
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!sesion || !this.playerName) {
      console.error('🏝️ no se pudo autenticar: la isla no arranca');
      this.showTokenErrorHub();
      return;
    }
    this.currentAccount = this.currentAccount || this.playerName;
    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;

    this.mundo = 4;
    this._cambiandoEscena = false;
    // La sala a la que se va al salir: la apunta cada salida. Sin rearmarla,
    // la del viaje anterior (p. ej. 'mina') se quedaba puesta en la instancia
    // y al volver al mapa el servidor te metia en la mina.
    this._salaDestino = null;
    this._graphicsOcultado = false;

    /* ¿LA ISLA DE QUIEN? (2026-10-04) La mia, salvo que se venga del panel de
       amigos a ver la de otro (GFViaje, en gf-lands.js). De visita la isla es
       de SOLO MIRAR: se ve lo que su dueño ha construido y lo que crece en sus
       parcelas, y a el y a los demas visitantes, porque todos entran en la
       misma sala ('isla@<dueño>', ver `_salaDeEscena`). Pero no se construye,
       no se recoge y no se siembra. Se rearma en cada entrada: Phaser
       reutiliza la instancia. */
    {
      const viaje = window.GFViaje ? window.GFViaje.tomar(4) : null;
      this._islaDe = viaje && viaje.islaDe && viaje.islaDe !== this.playerName ? String(viaje.islaDe) : null;
      this._islaDeNombre = this._islaDe ? String(viaje.islaDeNombre || viaje.islaDe) : null;
      this._viajeLlegada = viaje && Number.isFinite(viaje.x) && Number.isFinite(viaje.y)
        ? { x: viaje.x, y: viaje.y } : null;
      this._visitaCargada = false;
      this._visitaPintada = false;
    }
    this.speed = 240;
    this.socket = window.globalSocket || null;

    // Reciclar el mapa de fuera, con la misma red de seguridad que la mina:
    // NUNCA quitarlo sin tener la clase para volver a ponerlo.
    const ClaseMapa =
      (window.__secureSceneRegistry && window.__secureSceneRegistry.get('GameScene')) ||
      (typeof GameScene === 'function' ? GameScene : null);
    try {
      if (ClaseMapa) {
        this.scene.stop('GameScene');
        this.scene.remove('GameScene');
        this.scene.add('GameScene', ClaseMapa, false);
      } else {
        this.scene.stop('GameScene');
      }
    } catch (e) {
      console.warn('🏝️ no se pudo reciclar GameScene:', e);
      try {
        if (ClaseMapa && !this.scene.get('GameScene')) {
          this.scene.add('GameScene', ClaseMapa, false);
        }
      } catch (e2) { console.error('🏝️ GameScene se quedo fuera:', e2); }
    }

    // ── El mapa ────────────────────────────────────────────────────────────
    this.map = this.make.tilemap({ key: 'tilemap_lands' });
    // El tileset por su nombre y su tamaño en el mapa (isla_64, 64 px).
    const datosTs = this.map.tilesets && this.map.tilesets[0];
    const tileset = datosTs
      ? this.map.addTilesetImage(datosTs.name, 'tiles_isla', datosTs.tileWidth, datosTs.tileHeight)
      : this.map.addTilesetImage('isla_32', 'tiles_isla', 32, 32);
    this.textures.get('tiles_isla').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.backgroundLayer = this.map.createLayer('Terrain', tileset, 0, 0);
    if (this.backgroundLayer) this.backgroundLayer.setDepth(0);
    /* EL MAR QUE SE MUEVE (gf-agua.js, 2026-10-05): una capa de casillas
       animada encima del azul plano, con espuma en la orilla, destellos,
       peces y los anillos de la lluvia. Solo lee los datos de `Terrain`. */
    if (window.GFAgua) window.GFAgua.montar(this, { capa: 'Terrain', textura: 'tiles_isla', vida: 'mar' });
    /* EL SUELO PINTADO (gf-suelo.js): trozos con la hierba redondeada, la
       arena mojada y su detalle (tools/detallar-escena.py lands). Al llegar,
       se esconde la capa de casillas y se abre el zoom a 0.5x. */
    this._montarSueloPintado('recortadas_lands', 'lands', [this.backgroundLayer]);

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // ── El agua, que frena ─────────────────────────────────────────────────
    this.collisionRectangles = this._rectangulosDeAgua();

    /* LA PUERTA, en `collisionRectangles1`.
       Se usa el MISMO nombre de propiedad que la mina y que el mapa de fuera
       porque el indice espacial heredado (`_reconstruirIndiceColisiones`) lee
       justo esas tres listas. Pero OJO: aqui la puerta NO frena. Es geometria
       para `_comprobarSalida()`, igual que la boca de la galeria en la mina:
       lo que hace el update es mirar si el jugador la toca, no rebotarlo. */
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    console.log('🏝️ agua:', this.collisionRectangles.length, 'rectangulos');

    this._puerta = this._rectDePuerta();
    this._salidaArmada = false;
    this._cambiandoEscena = false;

    // ── El jugador ─────────────────────────────────────────────────────────
    let inicio = this._puntoDeAparicion();
    // Si se viene a buscar a alguien que esta aqui, a su lado (si es tierra).
    if (this._viajeLlegada && this._esTierraEnPixeles(this._viajeLlegada.x, this._viajeLlegada.y + 32)) {
      inicio = this._viajeLlegada;
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

    this.shadow = this.add.graphics();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, 0, 42, 20);
    this.shadow.setDepth(2);
    this.shadowContainer = this.add.container(this.player.x, this.player.y + 45, [this.shadow]);

    this.player.setInteractive({ useHandCursor: true });
    this.player.on('pointerdown', (pointer) => {
      const canvas = this.sys.canvas;
      if (!(pointer.event.target === canvas || canvas.contains(pointer.event.target))) return;
      if (this.STATE && this.STATE.selectedItem) {
        this._consumeItemOnPlayer(String(this.STATE.selectedItem.id || '').toLowerCase());
      }
    });

    this.usuariox = this.add.text(this.player.x, this.player.y - 60, this.Username || '', {
      fontFamily: '"PressStart2P"', fontSize: '8px', color: '#ffffff',
      resolution: 4, stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(4);

    this.graphics = this.add.graphics();
    this.graphics.setVisible(false);

    this._crearAnimaciones();
    this._crearMascota();
    this._montarControles();

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

    // ── Sistemas y HUD ─────────────────────────────────────────────────────
    /* EL CHAT, ANTES DE CABLEAR EL HUD.
       `_cablearHUD()` engancha el boton del chat solo `if (this._toggleChat)`,
       y ese metodo lo crea `_setupChatDom()`. Llamandolo despues, el boton se
       quedaba sin enganchar por esa via. Ahora va primero. */
    try { this._setupChatDom(); } catch (e) { console.warn('chat:', e); }

    /* EL HUD SALE AL TERMINAR LA ENTRADA DE CAMARA, SIN ESPERAR A LA RED.
       `_arrancarSistemas()` hace media docena de peticiones y puede tardar
       mas que la animacion: el HUD no la espera. Se vuelve a llamar cuando
       acaban la red Y la entrada, porque `_cablearHUD()` necesita cosas que
       solo existen despues (el catalogo de objetos, el hub de avisos): es
       idempotente. La barra de construir va detras, con el HUD ya puesto. */
    entrada.then((ok) => { if (ok) this._mostrarHUD(); });
    await this._arrancarSistemas();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    await entrada;
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    this._mostrarHUD();

    // Las parcelas: lo construido, la barra de construir y el huerto.
    try { this._montarConstruccion(); } catch (e) { console.error('🏗️ construccion:', e); }
    // De visita no: `initCropSystem()` pediria MIS cultivos y los pintaria
    // sobre las parcelas del otro (los plotId son `isla_<x>_<y>` en todas).
    if (!this._islaDe) this._iniciarHuertoDeLaIsla();
    // En la isla propia: los espantapájaros puestos y los cuervos que vienen
    // a por la cosecha. De visita no: ni es tu huerto ni tus cuervos.
    if (!this._islaDe) {
      if (window.GFEspantapajaros) window.GFEspantapajaros.montar(this);
      if (window.GFCuervo) window.GFCuervo.montar(this, { cantidad: 2 });
    }

    // Al aire libre si van el viento y el ciclo de dia: es una isla, no una
    // cueva. Lo que NO va es el clima del mapa de fuera, que pregunta al
    // servidor por el tiempo de la partida y pintaria lluvia sobre el mar.
    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo: 'hierba' });
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'tienda', suelo: 'hierba', interior: true });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);
    if (window.GFEspada)      window.GFEspada.montar(this);   // botón de la espada y ESPACIO

    if (window.tiendaSistema) window.tiendaSistema.scene = this;

    console.log('🏝️ isla lista');
  }

  // =========================================================================
  // CONSTRUCCION
  // =========================================================================

  /**
   * Los rectangulos de colision del agua.
   *
   * Se recorre la capa de tiles marcando las casillas cuyo gid esta en
   * `this.gidsAgua`, y despues se fusionan en los rectangulos MAXIMOS que las
   * cubren. Es el mismo barrido que usa el generador de la mina, y por el
   * mismo motivo: un rectangulo por casilla serian 1.323 objetos que el indice
   * espacial tendria que recorrer, y salen unas decenas.
   */
  _rectangulosDeAgua() {
    const capa = this.map.getLayer('Terrain');
    if (!capa) {
      console.warn('🏝️ el mapa no tiene capa "Terrain"');
      return [];
    }
    const W = this.map.width;
    const H = this.map.height;
    const T = this.map.tileWidth;

    /* SUB = 4 -> la rejilla de colision va a 8 px, no a 32.
       Es lo que permite que media casilla frene y la otra media no. */
    const SUB = 4;
    const paso = T / SUB;
    const SW = W * SUB;
    const SH = H * SUB;

    const mascaras = this._mascarasDeAgua(SUB);
    if (!mascaras) return this._rectangulosDeAguaPorCasilla();

    const marca = new Uint8Array(SW * SH);
    let subAgua = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = capa.data[y][x];
        if (!t || t.index <= 0) continue;
        const m = mascaras[t.index];
        if (!m) continue;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            if (!m[sy * SUB + sx]) continue;
            marca[(y * SUB + sy) * SW + (x * SUB + sx)] = 1;
            subAgua++;
          }
        }
      }
    }

    // Fusion en rectangulos maximos, igual que antes pero sobre la rejilla fina.
    const usado = new Uint8Array(SW * SH);
    const rects = [];
    for (let y = 0; y < SH; y++) {
      let x = 0;
      while (x < SW) {
        const i = y * SW + x;
        if (!marca[i] || usado[i]) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < SW && marca[y * SW + x2 + 1] && !usado[y * SW + x2 + 1]) x2++;
        let y2 = y;
        for (;;) {
          if (y2 + 1 >= SH) break;
          let cabe = true;
          for (let k = x; k <= x2; k++) {
            const j = (y2 + 1) * SW + k;
            if (!marca[j] || usado[j]) { cabe = false; break; }
          }
          if (!cabe) break;
          y2++;
        }
        for (let yy = y; yy <= y2; yy++) {
          for (let xx = x; xx <= x2; xx++) usado[yy * SW + xx] = 1;
        }
        rects.push(new Phaser.Geom.Rectangle(
          x * paso, y * paso, (x2 - x + 1) * paso, (y2 - y + 1) * paso));
        x = x2 + 1;
      }
    }
    console.log('🏝️ agua: ' + rects.length + ' rectangulos de ' +
                subAgua + ' trozos de ' + paso + ' px');
    return rects;
  }

  /**
   * Que parte de cada tile del tileset es AGUA, mirando sus pixeles.
   *
   * Devuelve, por indice de tile, un array de SUB*SUB booleanos: uno por cada
   * trozo de 8x8 de la casilla. null si la textura no se puede leer.
   *
   * POR QUE SE MIRAN LOS PIXELES Y NO UNA LISTA DE GID
   * -------------------------------------------------------------------------
   * La version anterior tenia `gidsAgua = [43]` escrito a mano. El 43 es el
   * unico tile que es agua ENTERA; las orillas (76..86) son mitad arena y
   * mitad agua. Al no estar en la lista, no frenaban nada y se podia caminar
   * sobre el mar por el borde. Meterlas en la lista habria sido peor: habria
   * bloqueado tambien la mitad de arena, o sea la playa entera.
   *
   * Mirando los pixeles no hay lista que mantener: si el mapa cambia de
   * tileset, o se dibujan orillas nuevas, esto sigue funcionando solo. Y se
   * hace UNA vez al entrar, sobre 128 casillas, no por fotograma.
   *
   * Que cuenta como agua: azul claramente dominante sobre rojo y verde. Es el
   * mismo criterio con el que se comprobo el tileset a mano, y deja fuera el
   * verde de la hierba y el beige de la arena sin margen de duda.
   */
  _mascarasDeAgua(SUB) {
    if (this._cacheMascarasAgua) return this._cacheMascarasAgua;

    let datos, ancho, alto;
    try {
      const tex = this.textures.get('tiles_isla');
      const img = tex.getSourceImage();
      ancho = img.width;
      alto = img.height;
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      datos = ctx.getImageData(0, 0, ancho, alto).data;
    } catch (e) {
      console.warn('🏝️ no se pudo leer el tileset: el agua frena por casillas enteras', e);
      return null;
    }

    const T = this.map.tileWidth;
    const cols = Math.floor(ancho / T);
    const filas = Math.floor(alto / T);
    const paso = T / SUB;
    const minAgua = paso * paso * 0.5;   // medio trozo mojado ya frena

    const mascaras = {};
    for (let i = 0; i < cols * filas; i++) {
      const tx = (i % cols) * T;
      const ty = Math.floor(i / cols) * T;
      const m = new Uint8Array(SUB * SUB);
      let alguno = false;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          let azules = 0;
          for (let py = 0; py < paso; py++) {
            for (let px = 0; px < paso; px++) {
              const o = ((ty + sy * paso + py) * ancho + (tx + sx * paso + px)) * 4;
              const r = datos[o], g = datos[o + 1], b = datos[o + 2], a = datos[o + 3];
              if (a > 40 && b > 110 && b > r + 35 && b > g + 18) azules++;
            }
          }
          if (azules >= minAgua) { m[sy * SUB + sx] = 1; alguno = true; }
        }
      }
      // El indice del tile en Phaser es firstgid + i; con un solo tileset
      // desde 1, eso es i + 1.
      if (alguno) mascaras[i + 1] = m;
    }
    this._cacheMascarasAgua = mascaras;
    console.log('🏝️ tiles con agua: ' + Object.keys(mascaras).length +
                ' de ' + (cols * filas));
    return mascaras;
  }

  /** Vuelta atras: casillas enteras segun `gidsAgua`, si no se pueden leer los pixeles. */
  _rectangulosDeAguaPorCasilla() {
    const capa = this.map.getLayer('Terrain');
    const W = this.map.width, H = this.map.height, T = this.map.tileWidth;
    const agua = new Set(this.gidsAgua);
    const rects = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = capa.data[y][x];
        if (t && agua.has(t.index)) {
          rects.push(new Phaser.Geom.Rectangle(x * T, y * T, T, T));
        }
      }
    }
    return rects;
  }

  /**
   * El rectangulo de la capa de objetos `puerta`, si el mapa la trae.
   *
   * Es la capa que se dibuja en Tiled sobre `mapa_lands.json`: marca a la vez
   * DONDE SE LLEGA y POR DONDE SE VUELVE. Se lee de la capa y no se escribe a
   * mano en el codigo a proposito: mover la puerta en Tiled tiene que bastar,
   * sin volver a tocar este archivo.
   *
   * Los objetos SIN gid (un rectangulo dibujado a mano, que es lo que hay
   * aqui) tienen su origen ARRIBA a la izquierda. Los que si tienen gid -los
   * que se colocan arrastrando un tile- lo tienen ABAJO a la izquierda, y por
   * eso se resta la altura en ese caso. Confundirlos deja la puerta un alto
   * por debajo de donde se ve en Tiled.
   */
  _rectDePuerta() {
    const capa = this.map.getObjectLayer('puerta');
    if (!capa || !capa.objects || !capa.objects.length) {
      console.warn('🏝️ mapa_lands.json no trae la capa de objetos "puerta"');
      return null;
    }
    const o = capa.objects[0];
    const arriba = o.gid ? (o.y - o.height) : o.y;
    const r = new Phaser.Geom.Rectangle(o.x, arriba, o.width, o.height);
    console.log('🏝️ puerta:', Math.round(r.x), Math.round(r.y),
                Math.round(r.width) + 'x' + Math.round(r.height));
    return r;
  }

  /**
   * Donde aparece el jugador: DELANTE de la puerta, no encima.
   *
   * "Delante" son 60 px hacia fuera del borde de la puerta. Aparecer DENTRO
   * de su rectangulo es justo lo que impedia volver: el primer fotograma ya
   * estaba tocando la salida, y aunque el candado `_salidaArmada` evita el
   * viaje inmediato, el jugador tenia que salirse del rectangulo y volver a
   * entrar sin verlo. Puesto delante, la puerta se ve, se pisa y se vuelve.
   *
   * Se prueban los cuatro lados y se coge el primero que sea TIERRA. La isla
   * tiene la puerta cerca de la orilla sur, asi que el norte suele ganar, pero
   * si un dia se mueve la puerta a otra costa esto sigue funcionando.
   *
   * Y si no hay capa `puerta` -un mapa antiguo-, se cae al centro de la isla,
   * que es lo que se hacia antes. Nunca se devuelve una posicion en el agua:
   * ahi el jugador se queda atrapado contra las colisiones sin un solo error.
   */
  _puntoDeAparicion() {
    const puerta = this._puerta || this._rectDePuerta();
    if (puerta) {
      const M = 60;
      const candidatos = [
        { x: puerta.centerX,   y: puerta.y - M,        lado: 'norte' },
        { x: puerta.centerX,   y: puerta.bottom + M,   lado: 'sur'   },
        { x: puerta.x - M,     y: puerta.centerY,      lado: 'oeste' },
        { x: puerta.right + M, y: puerta.centerY,      lado: 'este'  }
      ];
      for (const c of candidatos) {
        if (this._esTierraEnPixeles(c.x, c.y + 32)) {
          console.log('🏝️ apareces al', c.lado, 'de la puerta');
          return { x: c.x, y: c.y };
        }
      }
      console.warn('🏝️ la puerta no tiene tierra alrededor: se usa el centro');
    }
    return this._centroDeLaIsla();
  }

  /**
   * Si ese punto (en pixeles) pisa tierra. `y` se pasa ya a la altura de los
   * PIES del jugador: la casilla que importa es la que pisa, no la que le
   * queda a la altura de la cabeza.
   */
  _esTierraEnPixeles(px, py) {
    const capa = this.map.getLayer('Terrain');
    const T = this.map.tileWidth;
    const x = Math.floor(px / T);
    const y = Math.floor(py / T);
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    const t = capa && capa.data[y][x];
    return !!(t && t.index > 0 && this.gidsAgua.indexOf(t.index) === -1);
  }

  _centroDeLaIsla() {
    const capa = this.map.getLayer('Terrain');
    const T = this.map.tileWidth;
    const cx = Math.floor(this.map.width / 2);
    const cy = Math.floor(this.map.height / 2);
    const agua = new Set(this.gidsAgua);

    const esTierra = (x, y) => {
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
      const t = capa && capa.data[y][x];
      return !!(t && t.index > 0 && !agua.has(t.index));
    };

    if (esTierra(cx, cy)) {
      return { x: cx * T + T / 2, y: cy * T + T / 2 };
    }
    for (let r = 1; r < Math.max(this.map.width, this.map.height); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (esTierra(cx + dx, cy + dy)) {
            return { x: (cx + dx) * T + T / 2, y: (cy + dy) * T + T / 2 };
          }
        }
      }
    }
    console.warn('🏝️ no encontre tierra: se usa el centro del mapa');
    return { x: this.map.widthInPixels / 2, y: this.map.heightInPixels / 2 };
  }

  // =========================================================================
  // CONSTRUCCION: PARCELAS EN LA ISLA                            (2026-10-03)
  // =========================================================================
  //
  // QUE ES
  // ---------------------------------------------------------------------------
  // La Parcela se compra en la tienda (apartado Construction) y se coloca aqui.
  // Colocada es un bancal de madera con la MISMA tierra que los cuadros del
  // huerto del pueblo: se siembra, se riega y se cosecha igual, con el sistema
  // de cultivos heredado de GameScene (su plotId es `isla_<x>_<y>`).
  //
  // QUIEN MANDA
  // ---------------------------------------------------------------------------
  // El SERVIDOR (POST /api/lands/colocar y /api/lands/quitar): quema la
  // parcela del inventario EN LA CADENA y crea la factura de lo construido
  // (tabla `cons_parcelas`) con la posicion en el manualId. Aqui solo se
  // comprueba antes para no gastar una peticion en un sitio imposible (agua,
  // la puerta, encima de otra cosa); el servidor lo vuelve a comprobar todo.
  //
  // UN OBJETO NO PUEDE IR ENCIMA DE OTRO
  // ---------------------------------------------------------------------------
  // Tres veces: aqui (el fantasma se pone rojo), en el servidor (rectangulos
  // contra todo lo construido) y en el contrato (el manualId de la posicion no
  // se puede repetir).
  //
  // LIMPIEZA
  // ---------------------------------------------------------------------------
  // Phaser reutiliza esta instancia: todo lo de aqui se monta en create() y se
  // desmonta en _desmontarConstruccion(), llamado desde _alApagar(). La barra
  // es DOM de la pagina y sobrevive: se oculta al salir, y sus botones se
  // enganchan con _bindDomClick (que sustituye, no suma).

  /** El lado de una casilla de CONSTRUCCION (no la del mapa: ver arriba). */
  _tamCasilla() {
    return CASILLA_CONSTRUCCION;
  }

  _defConstruccion(tipo) {
    const tipos = this._tiposConstruccion || {};
    return tipos[tipo] || null;
  }

  _montarConstruccion() {
    this._construcciones = new Map();      // 'gx,gy' -> registro
    this._colocandoEn = new Map();         // 'gx,gy' -> {gx, gy, ancho, alto}
    this._quitandoEn = new Set();          // 'gx,gy'
    this._modoConstruir = null;            // null | 'colocar' | 'quitar'
    this._origenModo = null;               // 'barra' | 'inventario'
    this._armadoToque = null;              // movil: primera pulsacion
    this._armadoQuitar = null;             // quitar: primera pulsacion
    this._construccionViva = true;
    this._construccionHabilitada = null;   // null = aun no se sabe
    this._maxConstrucciones = 200;
    this._tiposConstruccion = {};
    for (const t of COLOCABLES) {
      const c = COLOCABLE[t];
      this._tiposConstruccion[t] = { ancho: c.ancho, alto: c.alto, itemId: t, capacidad: c.capacidad || 0 };
    }
    this._tipoColocar = 'parcela';         // que se coloca en modo 'colocar'
    this._hayColisionEsperando = false;    // un objeto puesto bajo los pies
    this._cofreAbierto = null;             // { reg, datos, ocupado }
    this._ultimoRecuentoBarra = 0;

    if (this._islaDe) { this._montarVisita(); return; }

    this._crearFantasma();
    this._montarEntradaConstruccion();
    this._montarBarraConstruccion();
    this._cargarConstrucciones();
  }

  _desmontarConstruccion() {
    this._construccionViva = false;
    if (this._relojVisita) {
      try { this._relojVisita.remove(false); } catch (e) {}
      this._relojVisita = null;
    }
    this._mostrarCartelVisita(false);
    try {
      if (this.input) {
        if (this._alMoverConstruccion) this.input.off('pointermove', this._alMoverConstruccion);
        if (this._alSoltarConstruccion) this.input.off('pointerup', this._alSoltarConstruccion);
        if (this.input.keyboard && this._alEscConstruccion) {
          this.input.keyboard.off('keydown-ESC', this._alEscConstruccion);
        }
      }
    } catch (e) {}
    this._alMoverConstruccion = null;
    this._alSoltarConstruccion = null;
    this._alEscConstruccion = null;

    if (this._construcciones) {
      for (const reg of this._construcciones.values()) {
        try { this._destruirVisualConstruccion(reg); } catch (e) {}
      }
      this._construcciones.clear();
    }
    if (this._colocandoEn) this._colocandoEn.clear();
    if (this._quitandoEn) this._quitandoEn.clear();
    try { if (this._fantasma) this._fantasma.destroy(); } catch (e) {}
    this._fantasma = null;
    this._modoConstruir = null;
    this._origenModo = null;
    this._armadoToque = null;
    this._armadoQuitar = null;
    this._cerrarCofre();
    this._hayColisionEsperando = false;

    const barra = document.getElementById('lands-construir');
    if (barra) barra.classList.add('oculto');
    const panel = document.getElementById('lc-panel');
    if (panel) panel.hidden = true;
    const banner = document.getElementById('lc-banner');
    if (banner) banner.hidden = true;
    if (this._alRedimensionarBarra) {
      window.removeEventListener('resize', this._alRedimensionarBarra);
      this._alRedimensionarBarra = null;
    }
  }

  // ── Lo que hay construido ────────────────────────────────────────────────

  async _cargarConstrucciones() {
    const runId = this._sceneRunId;
    const r = await this._apiConstruccion('GET', '/api/lands/construcciones');
    if (!this._construccionViva || this._sceneRunId !== runId) return;
    if (!r.ok) {
      console.warn('🏗️ no se pudieron leer las construcciones:', r.error || r.status);
      this._pintarBarraConstruccion();
      return;
    }
    const d = r.datos || {};
    if (d.tipos && typeof d.tipos === 'object') {
      for (const k of Object.keys(d.tipos)) {
        const t = d.tipos[k];
        if (t && t.ancho > 0 && t.alto > 0) {
          this._tiposConstruccion[k] = { ancho: t.ancho, alto: t.alto, itemId: t.itemId || k, capacidad: Number(t.capacidad) || 0 };
        }
      }
    }
    if (Number(d.maximo) > 0) this._maxConstrucciones = Number(d.maximo);
    this._construccionHabilitada = !!(d.tablas && d.tablas.parcelas && d.tablas.cons_parcelas);
    for (const c of (d.construcciones || [])) this._agregarConstruccion(c, false);
    console.log('🏗️ construcciones en la isla:', this._construcciones.size);
    this._pintarBarraConstruccion();
    // Las parcelas recien creadas piden su estado al huerto (los datos que
    // llegaron antes de que existieran se descartaron por no tener imagen).
    if (this.plotImages && this._construcciones.size && typeof this.loadUserCrops === 'function') {
      try { this.loadUserCrops(); } catch (e) {}
    }
  }

  /**
   * GET/POST al servidor con la sesion de la escena. Nunca lanza: devuelve
   * { ok, status, datos, error }.
   */
  async _apiConstruccion(metodo, ruta, cuerpo) {
    if (!this.serverBase) return { ok: false, status: 0, error: 'sin_servidor' };
    try {
      const opciones = {
        method: metodo,
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      };
      if (metodo !== 'GET') {
        opciones.headers['Content-Type'] = 'application/json';
        opciones.headers['X-CSRF-Token'] = window.getCsrfToken ? window.getCsrfToken(this.csrfToken) : (this.csrfToken || '');
        opciones.body = JSON.stringify(cuerpo || {});
      }
      const resp = await fetch(this.serverBase + ruta, opciones);
      let datos = null;
      try { datos = await resp.json(); } catch (_) { datos = null; }
      return { ok: resp.ok, status: resp.status, datos };
    } catch (e) {
      return { ok: false, status: 0, error: (e && e.message) || 'red' };
    }
  }

  // ── Dibujar lo construido ────────────────────────────────────────────────

  _agregarConstruccion(c, animar) {
    if (!c || !this._construcciones) return null;
    const def = this._defConstruccion(c.tipo);
    if (!def) return null;
    const gx = Number(c.gx), gy = Number(c.gy);
    const clave = gx + ',' + gy;
    if (this._construcciones.has(clave)) return this._construcciones.get(clave);

    const T = this._tamCasilla();
    const ancho = Number(c.ancho) || def.ancho;
    const alto = Number(c.alto) || def.alto;
    const cx = (gx + ancho / 2) * T;
    const cy = (gy + alto / 2) * T;
    const w = ancho * T, h = alto * T;

    // La parcela ES el cuadro de tierra del huerto: no lleva nada alrededor.
    const reg = {
      tipo: c.tipo, gx, gy, ancho, alto, invoiceId: c.invoiceId || null,
      plotId: 'isla_' + gx + '_' + gy, cx, cy, w, h, tierra: null, texto: null
    };
    this._construcciones.set(clave, reg);
    if (c.tipo === 'parcela') this._crearTierraDeParcela(reg);
    else this._crearObjetoDeIsla(reg);

    const o = reg.tierra || reg.sprite;
    if (animar && o) {
      const sx = o.scaleX, sy = o.scaleY;
      o.setAlpha(0).setScale(sx * 0.85, sy * 0.85);
      this.tweens.add({ targets: o, alpha: 1, scaleX: sx, scaleY: sy, duration: 200, ease: 'Back.Out' });
    }
    return reg;
  }

  /**
   * La tierra de la parcela: el MISMO sprite que usa el sistema de cultivos
   * (la textura la cambia el al sembrar, regar y crecer). Se crea siempre,
   * aunque el huerto todavia no este listo, para que la parcela se vea; en
   * cuanto el huerto arranca, _registrarParcelaEnHuerto la da de alta alli.
   */
  _crearTierraDeParcela(reg) {
    const tierra = this.add.image(reg.cx, reg.cy, 'tierra_seca');
    tierra.originalWidth = reg.w;
    tierra.originalHeight = reg.h;
    tierra.setDisplaySize(reg.w, reg.h);
    tierra.setDepth(2);
    tierra.setData('gfSuelo', true);
    tierra.setInteractive({ useHandCursor: true });

    const texto = this.add.text(reg.cx, reg.cy - 40, '', {
      fontFamily: '"PressStart2P"', fontSize: '10px', color: '#ffffff',
      backgroundColor: '#000000AA', padding: { x: 6, y: 4 }, align: 'center'
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    tierra.on('pointerover', () => {
      if (this._modoConstruir) return;
      if (this.cropData && this.cropData.get(reg.plotId)) texto.setVisible(true);
    });
    tierra.on('pointerout', () => { texto.setVisible(false); });
    tierra.on('pointerdown', (pointer) => {
      // Construyendo, el clic lo lleva la escena (colocar / quitar).
      if (this._modoConstruir) return;
      // De visita, las parcelas son del dueño: se miran, no se tocan.
      if (this._islaDe) return;
      if (this.plotImages && this.plotImages.get(reg.plotId) === tierra &&
          typeof this.handlePlotClick === 'function') {
        this.handlePlotClick(reg.plotId, pointer);
      }
    });

    reg.tierra = tierra;
    reg.texto = texto;
    this._registrarParcelaEnHuerto(reg);
  }

  _registrarParcelaEnHuerto(reg) {
    if (!reg || !reg.tierra || !this.plotImages || !this.plotTexts) return;
    this.plotImages.set(reg.plotId, reg.tierra);
    this.plotTexts.set(reg.plotId, reg.texto);
    const datos = this.cropData && this.cropData.get(reg.plotId);
    if (datos && typeof this.updatePlotVisual === 'function') {
      try { this.updatePlotVisual(reg.plotId, datos); } catch (e) {}
    }
  }

  /**
   * El huerto de la isla. GameScene saca sus cuadros de la capa de objetos
   * `funcion_siembra_1` del mapa del pueblo; aqui los cuadros son las
   * parcelas COLOCADAS. Lo llama initCropSystem(), heredado, cada vez que el
   * huerto arranca (que vacia antes plotImages y plotTexts).
   */
  initPlots() {
    if (!this._construcciones) return;
    for (const reg of this._construcciones.values()) this._registrarParcelaEnHuerto(reg);
  }

  /** Arranca el huerto heredado cuando hay socket. Sin socket no rompe nada. */
  _iniciarHuertoDeLaIsla() {
    const runId = this._sceneRunId;
    const intentar = (n) => {
      if (this._sceneStopped || this._sceneRunId !== runId) return;
      if (this.socket && this.socket.connected) {
        try { this.initCropSystem(); }
        catch (e) { console.warn('🏝️ el huerto de la isla no arranco:', e); }
        return;
      }
      if (n >= 20) { console.warn('🏝️ sin socket: el huerto de la isla no arranca'); return; }
      this.time.delayedCall(n === 0 ? 100 : 500, () => intentar(n + 1));
    };
    intentar(0);
  }

  // ── El bote y los cofres ─────────────────────────────────────────────────

  /**
   * El objeto: su dibujo al doble (como el bote del pueblo), con la base en el
   * borde de abajo de su sitio. La profundidad es la de un jugador con los
   * pies a esa altura (el jugador mide 102 px con el origen en el centro: sus
   * pies caen en `y + 51`), asi se le pasa por delante y por detras bien.
   */
  _crearObjetoDeIsla(reg) {
    const clave = 'cons_' + reg.tipo;
    const T = this._tamCasilla();
    const pie = (reg.gy + reg.alto) * T - 6;
    const hay = this.textures.exists(clave);
    const s = this.add.image(reg.cx, pie, hay ? clave : 'tierra_seca').setOrigin(0.5, 1);
    if (hay) s.setScale(2); else s.setDisplaySize(reg.w, reg.h);
    s.setDepth(pie - 51);
    s.setInteractive({ useHandCursor: true });
    s.on('pointerover', () => { if (!this._modoConstruir) s.setTint(0xe6e6e6); });
    s.on('pointerout', () => {
      if (!(this._armadoQuitar && this._armadoQuitar.reg === reg)) s.clearTint();
    });
    s.on('pointerdown', (pointer) => {
      if (this._modoConstruir) return;           // construyendo: lo lleva la escena
      const canvas = this.sys && this.sys.canvas;
      const t = pointer && pointer.event && pointer.event.target;
      if (canvas && t && t !== canvas && !canvas.contains(t)) return;
      this._usarObjetoDeIsla(reg);
    });
    reg.sprite = s;
    reg.pie = pie;
    /* LA BASE FRENA, como el bote del pueblo: un cofre no se atraviesa. Si el
       jugador esta justo encima al ponerlo, se espera a que se aparte; si no,
       se quedaria encerrado dentro sin poder moverse. */
    const ancho = Math.max(16, Math.min(reg.w - 12, s.displayWidth - 10));
    reg.colision = new Phaser.Geom.Rectangle(reg.cx - ancho / 2, pie - 18, ancho, 16);
    this._activarColisionObjeto(reg);
  }

  _activarColisionObjeto(reg) {
    if (!reg || !reg.colision || reg.colisionPuesta) return;
    if (this.player) {
      const pies = new Phaser.Geom.Rectangle(this.player.x - 15, this.player.y + 25, 30, 26);
      if (Phaser.Geom.Intersects.RectangleToRectangle(pies, reg.colision)) {
        reg.colisionEsperando = true;
        this._hayColisionEsperando = true;
        return;
      }
    }
    reg.colisionEsperando = false;
    reg.colisionPuesta = true;
    if (!Array.isArray(this.collisionRectangles1)) this.collisionRectangles1 = [];
    this.collisionRectangles1.push(reg.colision);
    this._colisionesSucias = true;
  }

  _quitarColisionObjeto(reg) {
    if (!reg) return;
    reg.colisionEsperando = false;
    if (!reg.colisionPuesta) return;
    const lista = this.collisionRectangles1 || [];
    const i = lista.indexOf(reg.colision);
    if (i >= 0) lista.splice(i, 1);
    reg.colisionPuesta = false;
    this._colisionesSucias = true;
  }

  /** Lo llama update(): colisiones que esperaban y el cofre abierto. */
  _vigilarObjetosDeIsla() {
    if (this._hayColisionEsperando) {
      let quedan = false;
      for (const reg of this._construcciones.values()) {
        if (!reg.colisionEsperando) continue;
        this._activarColisionObjeto(reg);
        if (reg.colisionEsperando) quedan = true;
      }
      this._hayColisionEsperando = quedan;
    }
    const ab = this._cofreAbierto;
    if (ab && this.player) {
      if (this._distanciaAObjeto(ab.reg) > ALCANCE_OBJETO + 90) { this._cerrarCofre(); return; }
      // Si la mochila cambia con el cofre abierto (se recoge algo), se repinta.
      const ahora = this.time ? this.time.now : Date.now();
      if (!ab.ocupado && ahora - (ab.vistoEn || 0) > 700) {
        ab.vistoEn = ahora;
        if (this._firmaMochila() !== ab.firma) this._pintarCofre();
      }
    }
  }

  _distanciaAObjeto(reg) {
    if (!reg || !this.player) return Infinity;
    return Phaser.Math.Distance.Between(this.player.x, this.player.y + 45, reg.cx, (reg.pie || reg.cy) - 8);
  }

  _usarObjetoDeIsla(reg) {
    if (!reg || !this.player) return;
    const def = COLOCABLE[reg.tipo] || {};
    if (this._islaDe) {
      this._avisoConstruccion('This ' + (def.nombre || 'object') + ' belongs to the owner of the island.', 'info');
      return;
    }
    if (this._distanciaAObjeto(reg) > ALCANCE_OBJETO) {
      this._avisoConstruccion(reg.tipo === 'basura' ? 'Walk up to the trash can to use it.' : 'Walk up to the chest to open it.', 'info');
      return;
    }
    if (reg.tipo === 'basura') {
      this._cerrarCofre();
      if (typeof this.openTrashHub === 'function') this.openTrashHub();
      return;
    }
    if (def.capacidad) this._abrirCofre(reg);
  }

  // ── El cofre (panel DOM) ─────────────────────────────────────────────────
  //
  // Lo guardado NO sale de la cadena: la factura sigue siendo del jugador y el
  // servidor apunta que esta dentro (ver LOS COFRES DE LA ISLA en server2.js).
  // Se guarda y se saca por CASILLAS enteras: una casilla del cofre es una
  // factura, igual que una casilla de la mochila.

  _montarPanelCofre() {
    let p = document.getElementById('gf-cofre');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'gf-cofre';
    p.className = 'gf-cofre';
    p.hidden = true;
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-labelledby', 'gf-cofre-nombre');
    p.innerHTML =
      '<div class="gf-cofre-cab">' +
        '<img id="gf-cofre-ico" class="gf-cofre-ico" alt="" draggable="false">' +
        '<div class="gf-cofre-tit"><b id="gf-cofre-nombre">Chest</b><span id="gf-cofre-cupo"></span></div>' +
        '<button type="button" id="gf-cofre-x" class="gf-cofre-x" aria-label="Close the chest">✕</button>' +
      '</div>' +
      '<p class="gf-cofre-sub">In the chest <small>· tap one to take it out</small></p>' +
      '<div id="gf-cofre-dentro" class="gf-cofre-rejilla"></div>' +
      '<p class="gf-cofre-sub">Your bag <small>· tap one to store it</small></p>' +
      '<div id="gf-cofre-mochila" class="gf-cofre-rejilla gf-cofre-mochila"></div>' +
      '<p id="gf-cofre-estado" class="gf-cofre-estado" role="status" aria-live="polite"></p>';
    document.body.appendChild(p);
    return p;
  }

  async _abrirCofre(reg) {
    const p = this._montarPanelCofre();
    const def = COLOCABLE[reg.tipo] || COLOCABLE.cofre1;
    const ab = this._cofreAbierto = { reg, datos: null, ocupado: false, firma: null, vistoEn: 0 };
    document.getElementById('gf-cofre-ico').src = def.icono;
    document.getElementById('gf-cofre-nombre').textContent = def.nombre;
    this._bindDomClick(document.getElementById('gf-cofre-x'), 'cofreCerrar', (e) => {
      if (e) e.stopPropagation();
      this._cerrarCofre();
    });
    this._bindDomClick(p, 'cofrePanel', (e) => this._clicEnCofre(e));
    p.hidden = false;
    this._pintarCofre();
    this._estadoCofre('Opening…');
    const runId = this._sceneRunId;
    const r = await this._apiConstruccion('GET', '/api/lands/cofre?gx=' + reg.gx + '&gy=' + reg.gy);
    if (this._cofreAbierto !== ab || this._sceneRunId !== runId) return;
    if (!r.ok || !r.datos || !r.datos.ok) {
      this._estadoCofre(this._mensajeErrorConstruccion(r), true);
      return;
    }
    ab.datos = r.datos;
    this._estadoCofre('');
    this._pintarCofre();
  }

  _cerrarCofre() {
    this._cofreAbierto = null;
    const p = document.getElementById('gf-cofre');
    if (p) p.hidden = true;
  }

  _estadoCofre(texto, error) {
    const e = document.getElementById('gf-cofre-estado');
    if (!e) return;
    e.textContent = texto || '';
    e.classList.toggle('error', !!error);
  }

  /** Lo que hay en la mochila, resumido: para saber si hay que repintar. */
  _firmaMochila() {
    const st = this.STATE || {};
    let f = '';
    for (const lista of [st.slots || [], st.quickSlots || []]) {
      for (const s of lista) f += s ? (s.id + ':' + s.count + ':' + s.idx + '|') : '-|';
    }
    return f;
  }

  _pintarCofre() {
    const ab = this._cofreAbierto;
    const p = document.getElementById('gf-cofre');
    if (!ab || !p) return;
    const def = COLOCABLE[ab.reg.tipo] || COLOCABLE.cofre1;
    const cap = (ab.datos && ab.datos.capacidad) || def.capacidad || 5;
    const dentro = (ab.datos && ab.datos.contenido) || [];
    const cupo = document.getElementById('gf-cofre-cupo');
    if (cupo) cupo.textContent = ab.datos ? (dentro.length + ' / ' + cap + ' slots') : (cap + ' slots');
    const rejD = document.getElementById('gf-cofre-dentro');
    const rejM = document.getElementById('gf-cofre-mochila');
    if (!rejD || !rejM) return;

    rejD.textContent = '';
    for (let i = 0; i < cap; i++) {
      const e = dentro[i];
      if (e) {
        rejD.appendChild(this._casillaCofre(e.itemId, e.cantidad, 'sacar', e.invoiceId, null));
      } else {
        const v = document.createElement('div');
        v.className = 'gf-cofre-casilla vacia';
        rejD.appendChild(v);
      }
    }

    rejM.textContent = '';
    const st = this.STATE || {};
    let hay = 0;
    for (const [lista, nombre] of [[st.slots || [], 'inv'], [st.quickSlots || [], 'quick']]) {
      for (let i = 0; i < lista.length; i++) {
        const s = lista[i];
        if (!s || !s.id) continue;
        hay++;
        rejM.appendChild(this._casillaCofre(s.id, s.count, 'guardar', s.idx, nombre + ':' + i));
      }
    }
    if (!hay) {
      const v = document.createElement('p');
      v.className = 'gf-cofre-vacio';
      v.textContent = 'Your bag is empty.';
      rejM.appendChild(v);
    }
    ab.firma = this._firmaMochila();
    p.classList.toggle('ocupado', !!ab.ocupado);
  }

  _casillaCofre(itemId, cantidad, accion, invoiceId, sitio) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gf-cofre-casilla';
    b.dataset.accion = accion;
    b.dataset.factura = String(invoiceId == null ? '' : invoiceId);
    b.dataset.objeto = String(itemId);
    if (sitio) b.dataset.sitio = sitio;
    const nombre = this._nombreObjeto(itemId);
    b.title = nombre + ' ×' + cantidad + (accion === 'sacar' ? ' — take it out' : ' — store it');
    b.setAttribute('aria-label', b.title);
    const def = this.ItemDefinitions && this.ItemDefinitions[itemId];
    if (def && def.src) {
      const img = document.createElement('img');
      img.src = def.src;
      img.alt = '';
      img.draggable = false;
      b.appendChild(img);
    } else {
      const t = document.createElement('span');
      t.className = 'gf-cofre-sin';
      t.textContent = '?';
      b.appendChild(t);
    }
    if (Number(cantidad) > 1) {
      const n = document.createElement('span');
      n.className = 'gf-cofre-n';
      n.textContent = 'x' + cantidad;
      b.appendChild(n);
    }
    return b;
  }

  /** El nombre en ingles de un objeto, para el panel del cofre. */
  _nombreObjeto(itemId) {
    const id = String(itemId || '');
    if (NOMBRE_EN[id]) return NOMBRE_EN[id];
    try {
      const en = typeof this._getFruitDisplayNameEN === 'function' ? this._getFruitDisplayNameEN(id) : '';
      if (en && en.toLowerCase().replace(/\s+/g, '_') !== id.toLowerCase()) return en;
    } catch (e) {}
    try {
      const otro = typeof this.getItemDisplayName === 'function' ? this.getItemDisplayName(id) : '';
      if (otro) return otro;
    } catch (e) {}
    return id;
  }

  _clicEnCofre(e) {
    const b = e && e.target && e.target.closest ? e.target.closest('.gf-cofre-casilla[data-accion]') : null;
    if (!b) return;
    e.stopPropagation();
    const ab = this._cofreAbierto;
    if (!ab || ab.ocupado) return;
    if (!ab.datos) { this._estadoCofre('Wait, the chest is still opening…'); return; }
    const factura = Number(b.dataset.factura);
    if (b.dataset.accion === 'sacar') this._sacarDeCofre(factura);
    else this._guardarEnCofre(b.dataset.objeto, factura);
  }

  async _guardarEnCofre(itemId, invoiceId) {
    const ab = this._cofreAbierto;
    if (!ab || !ab.datos) return;
    if ((ab.datos.contenido || []).length >= (ab.datos.capacidad || 0)) {
      this._estadoCofre('This chest is full.', true);
      return;
    }
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      this._estadoCofre('That item is still being saved. Try again in a moment.', true);
      return;
    }
    // Con algo en la mano, se suelta antes: la casilla va a quedarse vacia.
    if (this.STATE && this.STATE.selectedItem && typeof this.clearSelectedItem === 'function') {
      try { this.clearSelectedItem(); } catch (e) {}
    }
    ab.ocupado = true;
    this._pintarCofre();
    this._estadoCofre('Storing…');
    const runId = this._sceneRunId;
    const r = await this._apiConstruccion('POST', '/api/lands/cofre/guardar',
      { gx: ab.reg.gx, gy: ab.reg.gy, invoiceId, itemId });
    if (this._sceneRunId !== runId) return;
    ab.ocupado = false;
    const d = r.datos || {};
    if (r.ok && d.ok) {
      const sitio = this._buscarCasilla((s) => Number(s.idx) === invoiceId);
      if (sitio) this._ponerCantidadEnCasilla(sitio, 0, null);
      try { this.queuedAction && this.queuedAction({ type: 'forSpam2' }); } catch (e) {}
      ab.datos = d;
      this._estadoCofre('');
    } else {
      if (d.contenido) ab.datos = Object.assign({}, ab.datos, { contenido: d.contenido });
      this._estadoCofre(this._mensajeErrorConstruccion(r), true);
    }
    if (this._cofreAbierto === ab) this._pintarCofre();
  }

  async _sacarDeCofre(invoiceId) {
    const ab = this._cofreAbierto;
    if (!ab || !ab.datos) return;
    const st = this.STATE || {};
    const hueco = (lista, fantasmas) => (lista || []).some((s, i) => s === null && !(fantasmas && fantasmas[i]));
    const yaEsta = !!this._buscarCasilla((s) => Number(s.idx) === invoiceId);
    if (!yaEsta && !hueco(st.slots, st.ghostSlots && st.ghostSlots.inv) &&
        !hueco(st.quickSlots, st.ghostSlots && st.ghostSlots.quick)) {
      this._estadoCofre('Your bag is full.', true);
      return;
    }
    ab.ocupado = true;
    this._pintarCofre();
    this._estadoCofre('Taking it out…');
    const runId = this._sceneRunId;
    const r = await this._apiConstruccion('POST', '/api/lands/cofre/sacar',
      { gx: ab.reg.gx, gy: ab.reg.gy, invoiceId });
    if (this._sceneRunId !== runId) return;
    ab.ocupado = false;
    const d = r.datos || {};
    if (r.ok && d.ok && d.sacado) {
      this._devolverParcelaLocal(d.sacado);
      ab.datos = d;
      this._estadoCofre('');
    } else {
      if (d.contenido) ab.datos = Object.assign({}, ab.datos, { contenido: d.contenido });
      this._estadoCofre(this._mensajeErrorConstruccion(r), true);
    }
    if (this._cofreAbierto === ab) this._pintarCofre();
  }

  _mensajeNoTienes(tipo) {
    if (tipo === 'parcela' || !COLOCABLE[tipo]) return 'You have no Land Plots. Buy them in the shop → Construction.';
    return 'You have no ' + COLOCABLE[tipo].nombre + '. ' + (COMO_CONSEGUIR[tipo] || '');
  }

  _destruirVisualConstruccion(reg) {
    if (!reg) return;
    this._quitarColisionObjeto(reg);
    if (this._cofreAbierto && this._cofreAbierto.reg === reg) this._cerrarCofre();
    try { if (reg.sprite) reg.sprite.destroy(); } catch (e) {}
    reg.sprite = null;
    if (this.plotImages && this.plotImages.get(reg.plotId) === reg.tierra) this.plotImages.delete(reg.plotId);
    if (this.plotTexts && this.plotTexts.get(reg.plotId) === reg.texto) this.plotTexts.delete(reg.plotId);
    if (this.cropData) this.cropData.delete(reg.plotId);
    try { if (reg.tierra) reg.tierra.destroy(); } catch (e) {}
    try { if (reg.texto) reg.texto.destroy(); } catch (e) {}
    try { if (reg.aviso) reg.aviso.destroy(); } catch (e) {}
    reg.tierra = reg.texto = reg.aviso = null;
  }

  // ── El fantasma (lo que se ve antes de colocar) ─────────────────────────

  _crearFantasma() {
    const tierra = this.add.image(0, 0, 'tierra_seca').setDisplaySize(64, 64);
    const borde = this.add.graphics();
    this._fantasma = this.add.container(0, 0, [tierra, borde])
      .setDepth(9000).setAlpha(0.78).setVisible(false);
    this._fantasma.__partes = { tierra, borde };
  }

  _pintarFantasma(gx, gy, valido) {
    const f = this._fantasma;
    if (!f) return;
    const tipo = this._tipoColocar || 'parcela';
    const def = this._defConstruccion(tipo);
    const T = this._tamCasilla();
    const w = def.ancho * T, h = def.alto * T;
    const p = f.__partes;
    const clave = 'cons_' + tipo;
    if (tipo !== 'parcela' && this.textures.exists(clave)) {
      // El objeto, de pie sobre el borde de abajo de su sitio.
      if (p.tierra.texture.key !== clave) p.tierra.setTexture(clave);
      p.tierra.setOrigin(0.5, 1).setScale(2).setPosition(0, h / 2 - 6);
    } else {
      if (p.tierra.texture.key !== 'tierra_seca') p.tierra.setTexture('tierra_seca');
      p.tierra.setOrigin(0.5).setPosition(0, 0);
      p.tierra.setDisplaySize(w, h);
    }
    const color = valido ? 0x8dff98 : 0xff7070;
    p.tierra.setTint(color);
    p.borde.clear();
    p.borde.lineStyle(2, valido ? 0x3fd65a : 0xe23b3b, 1);
    p.borde.strokeRect(-w / 2, -h / 2, w, h);
    f.setPosition((gx + def.ancho / 2) * T, (gy + def.alto / 2) * T);
    f.setVisible(true);
  }

  _ocultarFantasma() {
    if (this._fantasma) this._fantasma.setVisible(false);
  }

  // ── Donde se puede construir ─────────────────────────────────────────────

  /** Casilla (arriba a la izquierda) para que la parcela quede bajo el puntero. */
  _celdaBajo(mundoX, mundoY, def) {
    const T = this._tamCasilla();
    return {
      gx: Math.round(mundoX / T - def.ancho / 2),
      gy: Math.round(mundoY / T - def.alto / 2)
    };
  }

  /** null si se puede; si no, el motivo en ingles para el jugador. */
  _motivoNoSePuede(gx, gy, def) {
    if (!this.map) return 'The island is not ready yet.';
    const T = this._tamCasilla();
    const anchoIsla = Math.floor(this.map.widthInPixels / T), altoIsla = Math.floor(this.map.heightInPixels / T);
    if (gx < 0 || gy < 0 || gx + def.ancho > anchoIsla || gy + def.alto > altoIsla) {
      return 'That spot is outside the island.';
    }
    // Un pixel hacia dentro: tocar el borde del agua no es estar en el agua.
    const huella = new Phaser.Geom.Rectangle(gx * T + 1, gy * T + 1, def.ancho * T - 2, def.alto * T - 2);
    for (const r of (this.collisionRectangles || [])) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(huella, r)) return 'You can only build on land.';
    }
    if (this._puerta) {
      const puerta = new Phaser.Geom.Rectangle(this._puerta.x - 16, this._puerta.y - 16,
                                               this._puerta.width + 32, this._puerta.height + 32);
      if (Phaser.Geom.Intersects.RectangleToRectangle(huella, puerta)) return 'Keep the dock clear.';
    }
    const nueva = { gx, gy, ancho: def.ancho, alto: def.alto };
    const solapa = (o) => nueva.gx < o.gx + o.ancho && nueva.gx + nueva.ancho > o.gx &&
                          nueva.gy < o.gy + o.alto && nueva.gy + nueva.alto > o.gy;
    for (const reg of this._construcciones.values()) if (solapa(reg)) return 'Something is already built there.';
    for (const p of this._colocandoEn.values()) if (solapa(p)) return 'Something is already built there.';
    return null;
  }

  _contarParcelasEnInventario() {
    return this._contarEnBolsa('parcela');
  }

  /** La pala de construccion: hace falta UNA para recoger lo construido. */
  _contarPalasEnInventario() {
    return this._contarEnBolsa(ID_PALA);
  }

  _contarEnBolsa(itemId) {
    let n = 0;
    const st = this.STATE;
    if (!st) return 0;
    for (const lista of [st.slots || [], st.quickSlots || []]) {
      for (const s of lista) if (s && s.id === itemId) n += Math.max(0, Number(s.count) || 0);
    }
    return n;
  }

  _construccionEn(mundoX, mundoY) {
    const T = this._tamCasilla();
    for (const reg of this._construcciones.values()) {
      if (mundoX >= reg.gx * T && mundoX < (reg.gx + reg.ancho) * T &&
          mundoY >= reg.gy * T && mundoY < (reg.gy + reg.alto) * T) return reg;
    }
    return null;
  }

  // ── Modos ────────────────────────────────────────────────────────────────

  _entrarModoConstruir(modo, origen, tipo) {
    if (!this._construccionViva) return;
    if (modo === 'colocar' && tipo && COLOCABLE[tipo]) this._tipoColocar = tipo;
    const nombre = (COLOCABLE[this._tipoColocar] || COLOCABLE.parcela).nombre;
    this._cerrarCofre();
    this._modoConstruir = modo;
    this._origenModo = origen || 'barra';
    this._armadoToque = null;
    this._limpiarArmadoQuitar();
    if (this.mouseMovement && typeof this.stopMouseMovement === 'function') {
      try { this.stopMouseMovement(); } catch (e) {}
    }
    const tactil = !!(window.Utils && window.Utils.isMobile && window.Utils.isMobile());
    this._mostrarBannerConstruccion(modo === 'colocar'
      ? (tactil ? 'Tap a spot, then tap it again to place a ' + nombre
                : 'Click on the island to place a ' + nombre)
      : (tactil ? 'Shovel: tap something you built twice to dig it up'
                : 'Shovel: click something you built twice to dig it up'));
    this._pintarBarraConstruccion();
    // El fantasma, ya: sin esto no aparecía hasta mover el ratón.
    if (modo === 'colocar' && !tactil && this._alMoverConstruccion && this.input) {
      try { this._alMoverConstruccion(this.input.activePointer); } catch (e) {}
    }
  }

  _salirModoConstruir(desdeEsc) {
    if (!this._modoConstruir) return;
    const veniaDelInventario = this._origenModo === 'inventario';
    this._modoConstruir = null;
    this._origenModo = null;
    this._armadoToque = null;
    this._limpiarArmadoQuitar();
    this._ocultarFantasma();
    const banner = document.getElementById('lc-banner');
    if (banner) banner.hidden = true;
    // Con la parcela en la mano, Esc o la X la sueltan: si no, el modo se
    // volveria a activar en el siguiente fotograma.
    if (veniaDelInventario && desdeEsc && typeof this.clearSelectedItem === 'function') {
      try { this.clearSelectedItem(); } catch (e) {}
    }
    this._pintarBarraConstruccion();
  }

  /** Lo llama update(): coger la parcela o la pala en el inventario activa
   *  su modo (colocar o recoger); soltarla lo apaga. */
  _vigilarSeleccionConstruccion() {
    if (!this._construccionViva || !this.STATE) return;
    const sel = this.STATE.selectedItem;
    const id = sel && sel.id;
    const colocable = !!(id && COLOCABLE[id]);
    const quiere = colocable ? 'colocar' : (id === ID_PALA ? 'quitar' : null);
    if (quiere && (this._modoConstruir !== quiere || (colocable && this._tipoColocar !== id))) {
      this._entrarModoConstruir(quiere, 'inventario', colocable ? id : null);
    } else if (!quiere && this._modoConstruir && this._origenModo === 'inventario') {
      this._salirModoConstruir(false);
    }
    // El recuento de la barra, como mucho cada medio segundo.
    const ahora = this.time ? this.time.now : Date.now();
    if (ahora - this._ultimoRecuentoBarra > 500) {
      this._ultimoRecuentoBarra = ahora;
      this._pintarRecuentoBarra();
    }
  }

  _limpiarArmadoQuitar() {
    const a = this._armadoQuitar;
    this._armadoQuitar = null;
    if (a && a.reg) {
      try { const v = a.reg.tierra || a.reg.sprite; if (v) v.clearTint(); } catch (e) {}
      try { if (a.reg.aviso) { a.reg.aviso.destroy(); a.reg.aviso = null; } } catch (e) {}
    }
  }

  // ── Entrada ──────────────────────────────────────────────────────────────

  _montarEntradaConstruccion() {
    const enCanvas = (pointer) => {
      const canvas = this.sys && this.sys.canvas;
      const t = pointer && pointer.event && pointer.event.target;
      return !!(canvas && t && (t === canvas || canvas.contains(t)));
    };

    this._alMoverConstruccion = (pointer) => {
      if (this._modoConstruir !== 'colocar' || !this.cameras || !this.cameras.main) return;
      if (pointer.wasTouch) return;            // en movil no hay "pasar por encima"
      if (!enCanvas(pointer)) { this._ocultarFantasma(); return; }
      const def = this._defConstruccion(this._tipoColocar || 'parcela');
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const { gx, gy } = this._celdaBajo(p.x, p.y, def);
      this._pintarFantasma(gx, gy, !this._motivoNoSePuede(gx, gy, def));
    };

    this._alSoltarConstruccion = (pointer) => {
      if (!this._modoConstruir || !pointer || pointer.button !== 0) return;
      if (!enCanvas(pointer)) return;
      // Mantener pulsado es caminar (ver _montarControles): solo cuenta un
      // toque corto y quieto.
      const dur = (pointer.upTime || 0) - (pointer.downTime || 0);
      const mov = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
      if (dur > 350 || mov > 14) return;
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

      if (this._modoConstruir === 'colocar') {
        const def = this._defConstruccion(this._tipoColocar || 'parcela');
        const { gx, gy } = this._celdaBajo(p.x, p.y, def);
        const motivo = this._motivoNoSePuede(gx, gy, def);
        this._pintarFantasma(gx, gy, !motivo);
        if (pointer.wasTouch) {
          const a = this._armadoToque;
          if (!a || a.gx !== gx || a.gy !== gy) {
            this._armadoToque = { gx, gy };
            if (motivo) this._avisoConstruccion(motivo, 'warning');
            return;
          }
        }
        this._armadoToque = null;
        this._intentarColocar(gx, gy);
        return;
      }

      // Quitar: el primer toque marca la parcela, el segundo la recoge.
      const reg = this._construccionEn(p.x, p.y);
      if (!reg) { this._limpiarArmadoQuitar(); return; }
      const a = this._armadoQuitar;
      if (a && a.reg === reg && (Date.now() - a.cuando) < 6000) {
        this._limpiarArmadoQuitar();
        this._quitarConstruccion(reg);
        return;
      }
      this._limpiarArmadoQuitar();
      this._armadoQuitar = { reg, cuando: Date.now() };
      try { const v = reg.tierra || reg.sprite; if (v) v.setTint(0xff8a8a); } catch (e) {}
      const arriba = reg.sprite ? reg.sprite.getTopCenter().y - 4 : reg.cy - reg.h / 2 - 10;
      reg.aviso = this.add.text(reg.cx, arriba, 'Again to dig it up', {
        fontFamily: '"PressStart2P"', fontSize: '8px', color: '#ffffff',
        backgroundColor: '#7a1f1fdd', padding: { x: 5, y: 3 }
      }).setOrigin(0.5, 1).setDepth(9001);
    };

    this._alEscConstruccion = () => {
      if (this._cofreAbierto) { this._cerrarCofre(); return; }
      this._salirModoConstruir(true);
    };

    this.input.on('pointermove', this._alMoverConstruccion);
    this.input.on('pointerup', this._alSoltarConstruccion);
    if (this.input.keyboard) this.input.keyboard.on('keydown-ESC', this._alEscConstruccion);
  }

  // ── Colocar ──────────────────────────────────────────────────────────────

  async _intentarColocar(gx, gy) {
    const tipo = this._tipoColocar || 'parcela';
    const def = this._defConstruccion(tipo);
    const motivo = this._motivoNoSePuede(gx, gy, def);
    if (motivo) { this._avisoConstruccion(motivo, 'warning'); return; }
    // Las tablas de la parcela las crea el administrador; el bote y los
    // cofres no dependen de ellas.
    if (tipo === 'parcela' && this._construccionHabilitada === false) {
      this._avisoConstruccion('Construction is not enabled yet.', 'warning');
      return;
    }
    if (this._contarEnBolsa(tipo) <= 0) {
      this._avisoConstruccion(this._mensajeNoTienes(tipo), 'warning');
      return;
    }
    if (this._construcciones.size + this._colocandoEn.size >= this._maxConstrucciones) {
      this._avisoConstruccion('You reached the limit of ' + this._maxConstrucciones + ' things built.', 'warning');
      return;
    }
    if (window.GFMuerte && typeof window.GFMuerte.bloquear === 'function' &&
        window.GFMuerte.bloquear(this, 'build')) return;

    const clave = gx + ',' + gy;
    const runId = this._sceneRunId;
    this._colocandoEn.set(clave, { gx, gy, ancho: def.ancho, alto: def.alto });

    // Mientras viaja a la cadena: el bancal a medio poner, con un rotulo.
    const T = this._tamCasilla();
    const cx = (gx + def.ancho / 2) * T, cy = (gy + def.alto / 2) * T;
    const claveObjeto = 'cons_' + tipo;
    const sombra = (tipo !== 'parcela' && this.textures.exists(claveObjeto))
      ? this.add.image(cx, (gy + def.alto) * T - 6, claveObjeto).setOrigin(0.5, 1).setScale(2).setDepth(1).setAlpha(0.45)
      : this.add.image(cx, cy, 'tierra_seca').setDisplaySize(def.ancho * T, def.alto * T).setDepth(1).setAlpha(0.45);
    const rotulo = this.add.text(cx, cy, 'Building…', {
      fontFamily: '"PressStart2P"', fontSize: '8px', color: '#ffffff',
      backgroundColor: '#00000099', padding: { x: 5, y: 3 }
    }).setOrigin(0.5).setDepth(9001);

    let r;
    try {
      r = await this._apiConstruccion('POST', '/api/lands/colocar', { tipo, gx, gy });
    } finally {
      try { sombra.destroy(); } catch (e) {}
      try { rotulo.destroy(); } catch (e) {}
      if (this._colocandoEn) this._colocandoEn.delete(clave);
    }
    if (!this._construccionViva || this._sceneRunId !== runId) return;

    const d = r.datos || {};
    if (r.ok && d.ok && d.construccion) {
      this._agregarConstruccion(d.construccion, true);
      this._descontarParcelaLocal(d.gastado);
      try { this.playSFX && this.playSFX('level_up_sound'); } catch (e) {}
      this._pintarBarraConstruccion();
      return;
    }
    this._avisoConstruccion(this._mensajeErrorConstruccion(r), 'error');
    if (d.error === 'ocupado' || d.recargar) this._recargarConstrucciones();
    if (d.error === 'tablas_sin_crear') { this._construccionHabilitada = false; this._pintarBarraConstruccion(); }
  }

  _mensajeErrorConstruccion(r) {
    const d = (r && r.datos) || {};
    switch (d.error) {
      case 'ocupado':          return 'Something is already built there.';
      case 'no_tienes':        return d.message || this._mensajeNoTienes(d.itemId || 'parcela');
      case 'fuera_de_la_isla': return 'That spot is outside the island.';
      case 'tablas_sin_crear': return 'Construction is not enabled yet.';
      case 'maximo_alcanzado': return 'You reached the limit of ' + (d.maximo || this._maxConstrucciones) + ' plots.';
      case 'tiene_cultivo':    return 'Harvest or clear the crop before picking up this plot.';
      case 'fantasma':         return 'You are a ghost — revive first.';
      case 'no_existe':        return 'That plot is no longer there.';
      case 'sin_pala':         return MSG_SIN_PALA;
      default:
        if (d.message) return d.message;
        if (!r || r.status === 0) return 'Could not reach the server. Try again.';
        return 'Could not save it on-chain. Try again in a moment.';
    }
  }

  /** Vuelve a pedir lo construido (tras un "ocupado" que no se veia). */
  async _recargarConstrucciones() {
    const runId = this._sceneRunId;
    const r = await this._apiConstruccion('GET', '/api/lands/construcciones');
    if (!this._construccionViva || this._sceneRunId !== runId || !r.ok) return;
    const vistas = new Set();
    for (const c of ((r.datos && r.datos.construcciones) || [])) {
      vistas.add(c.gx + ',' + c.gy);
      this._agregarConstruccion(c, false);
    }
    for (const [clave, reg] of [...this._construcciones.entries()]) {
      if (!vistas.has(clave)) { this._destruirVisualConstruccion(reg); this._construcciones.delete(clave); }
    }
    if (this.plotImages && typeof this.loadUserCrops === 'function') { try { this.loadUserCrops(); } catch (e) {} }
  }

  /**
   * El servidor ya quemo la parcela en la cadena (y la quito de Mongo); aqui
   * se refleja en la casilla. Se busca por la FACTURA que se gasto: tras la
   * sincronizacion de la entrada, cada casilla lleva la suya.
   */
  _descontarParcelaLocal(gastado) {
    if (!gastado || !this.STATE) return;
    const idFactura = Number(gastado.invoiceId);
    const quedan = Math.max(0, Number(gastado.cantidadRestante) || 0);
    let sitio = this._buscarCasilla((s) => Number(s.idx) === idFactura);
    if (!sitio) {
      // La casilla llevaba otro id (se cuadrara en la siguiente carga): se
      // quita UNA de la primera casilla de parcelas, que es lo que el
      // servidor ha hecho con su copia.
      sitio = this._buscarCasilla((s) => s.id === (gastado.itemId || 'parcela'));
      if (sitio) this._ponerCantidadEnCasilla(sitio, Math.max(0, (Number(sitio.slot.count) || 0) - 1), null);
    } else {
      this._ponerCantidadEnCasilla(sitio, quedan, null);
    }
    try { this.queuedAction && this.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }

  _buscarCasilla(cond) {
    const st = this.STATE;
    for (const [tipo, lista] of [['inv', st.slots || []], ['quick', st.quickSlots || []]]) {
      for (let i = 0; i < lista.length; i++) {
        const s = lista[i];
        if (s && cond(s)) return { tipo, lista, i, slot: s };
      }
    }
    return null;
  }

  /** Cambia la cantidad de una casilla, con la mano (fantasma) al dia. */
  _ponerCantidadEnCasilla(sitio, cantidad, datosNuevos) {
    const { tipo, lista, i } = sitio;
    const sel = this.STATE.selectedItem;
    const enMano = !!(sel && sel.isGhost && sel.originType === tipo && sel.originIndex === i);
    if (cantidad > 0) {
      const s = lista[i];
      s.count = cantidad;
      if (datosNuevos) Object.assign(s, datosNuevos);
      if (enMano) {
        sel.count = cantidad;
        const g = this.STATE.ghostSlots && this.STATE.ghostSlots[tipo];
        if (g && g[i]) g[i].count = cantidad;
        try { this.updateDragCount && this.updateDragCount(cantidad); } catch (e) {}
      }
    } else {
      lista[i] = null;
      if (enMano && typeof this.clearSelectedItem === 'function') {
        try { this.clearSelectedItem(); } catch (e) {}
      }
    }
    try { this.renderSlot(i); } catch (e) {}
  }

  // ── Quitar ───────────────────────────────────────────────────────────────

  async _quitarConstruccion(reg) {
    const clave = reg.gx + ',' + reg.gy;
    if (this._quitandoEn.has(clave)) return;
    if (reg.tipo === 'parcela') {
      const ocupado = (m) => !!(m && typeof m.has === 'function' && m.has(reg.plotId));
      if (ocupado(this.pendingPlantings) || ocupado(this._plotsEnVuelo) || ocupado(this.pendingWaters) ||
          ocupado(this._watersEnVuelo) || ocupado(this.pendingCuts) || ocupado(this._cutsEnVuelo)) {
        this._avisoConstruccion('This plot has a pending action. Finish or cancel it first.', 'warning');
        return;
      }
      if (this.cropData && this.cropData.get(reg.plotId)) {
        this._avisoConstruccion('Harvest or clear the crop before picking up this plot.', 'warning');
        return;
      }
    }
    if (this._contarPalasEnInventario() <= 0) {
      this._avisoConstruccion(MSG_SIN_PALA, 'warning');
      return;
    }
    const runId = this._sceneRunId;
    this._quitandoEn.add(clave);
    try { const v = reg.tierra || reg.sprite; if (v) v.setAlpha(0.5); } catch (e) {}
    let r;
    try {
      r = await this._apiConstruccion('POST', '/api/lands/quitar', { gx: reg.gx, gy: reg.gy });
    } finally {
      if (this._quitandoEn) this._quitandoEn.delete(clave);
    }
    if (!this._construccionViva || this._sceneRunId !== runId) return;
    const d = r.datos || {};
    if (r.ok && d.ok) {
      this._destruirVisualConstruccion(reg);
      this._construcciones.delete(clave);
      if (d.devuelto) this._devolverParcelaLocal(d.devuelto);
      else if (d.pendiente) this._avisoConstruccion(d.message || 'Plot removed. It will return to your inventory shortly.', 'info');
      this._pintarBarraConstruccion();
      return;
    }
    try { const v = reg.tierra || reg.sprite; if (v) v.setAlpha(1); } catch (e) {}
    this._avisoConstruccion(this._mensajeErrorConstruccion(r), 'error');
    if (d.error === 'no_existe') this._recargarConstrucciones();
  }

  /** La parcela vuelve: a la casilla de su factura, o a la primera libre. */
  _devolverParcelaLocal(dev) {
    if (!dev || !this.STATE) return;
    const idFactura = Number(dev.invoiceId);
    const cantidad = Math.max(1, Number(dev.cantidad) || 1);
    const sitio = this._buscarCasilla((s) => Number(s.idx) === idFactura);
    if (sitio) {
      this._ponerCantidadEnCasilla(sitio, cantidad, { id: dev.itemId || 'parcela', idm: dev.manualId });
    } else {
      const st = this.STATE;
      const libre = (lista, fantasmas) => {
        for (let i = 0; i < lista.length; i++) if (lista[i] === null && !(fantasmas && fantasmas[i])) return i;
        return -1;
      };
      const nuevo = { id: dev.itemId || 'parcela', idx: idFactura, idm: dev.manualId, count: cantidad };
      let i = libre(st.slots, st.ghostSlots && st.ghostSlots.inv);
      if (i >= 0) { st.slots[i] = nuevo; try { this.renderSlot(i); } catch (e) {} }
      else if ((i = libre(st.quickSlots, st.ghostSlots && st.ghostSlots.quick)) >= 0) {
        st.quickSlots[i] = nuevo; try { this.renderSlot(i); } catch (e) {}
      } else {
        this._avisoConstruccion('Your bag is full: it will appear when you come back.', 'warning');
      }
    }
    try { this.queuedAction && this.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }

  // ── Avisos ───────────────────────────────────────────────────────────────

  _avisoConstruccion(texto, tipo) {
    const ahora = Date.now();
    if (this._ultimoAvisoConstruccion && this._ultimoAvisoConstruccion.t === texto &&
        ahora - this._ultimoAvisoConstruccion.en < 1200) return;
    this._ultimoAvisoConstruccion = { t: texto, en: ahora };
    try {
      if (this.notifications && typeof this.notifications.show === 'function') {
        this.notifications.show(texto, tipo || 'info');
        return;
      }
    } catch (e) {}
    console.log('🏗️', texto);
  }

  // ── La barra (DOM) ───────────────────────────────────────────────────────

  _montarBarraConstruccion() {
    let barra = document.getElementById('lands-construir');
    // Una barra de antes del bote y los cofres (otra version en la misma
    // pagina) se rehace entera.
    if (barra && !document.getElementById('lc-tipos')) {
      try { barra.remove(); } catch (e) {}
      try { const b = document.getElementById('lc-banner'); if (b) b.remove(); } catch (e) {}
      barra = null;
    }
    if (!barra) {
      barra = document.createElement('div');
      barra.id = 'lands-construir';
      barra.className = 'lands-construir oculto';
      barra.setAttribute('role', 'region');
      barra.setAttribute('aria-label', 'Build on your island');
      barra.innerHTML =
        '<button type="button" id="lc-toggle" class="lc-toggle" aria-expanded="false" aria-controls="lc-panel" title="Build on your island">' +
          '<img src="./Game/Objetos/construccion/parcela.png" alt="" draggable="false">' +
          '<span>Build</span>' +
        '</button>' +
        '<div id="lc-panel" class="lc-panel" hidden>' +
          '<div id="lc-tipos" class="lc-tipos" role="group" aria-label="What to place">' +
            COLOCABLES.map((t) =>
              '<button type="button" class="lc-tipo" data-tipo="' + t + '" aria-pressed="false" title="Place a ' + COLOCABLE[t].nombre + '">' +
                '<img src="' + COLOCABLE[t].icono + '" alt="" draggable="false">' +
                '<span class="lc-tipo-n" data-cuenta="' + t + '">0</span>' +
                '<span class="lc-tipo-nombre">' + COLOCABLE[t].nombre + '</span>' +
              '</button>').join('') +
          '</div>' +
          '<button type="button" id="lc-quitar" class="lc-accion lc-quitar" title="Dig up what you built (needs a Construction Shovel)">' +
            '<img src="./Game/Objetos/construccion/pala_construccion.png" alt="" draggable="false">' +
            '<span class="lc-nombre">Shovel</span>' +
            '<span id="lc-palas" class="lc-cuantas">×0</span>' +
          '</button>' +
          '<p id="lc-ayuda" class="lc-ayuda"></p>' +
        '</div>';
      document.body.appendChild(barra);

      const banner = document.createElement('div');
      banner.id = 'lc-banner';
      banner.className = 'lc-banner';
      banner.hidden = true;
      banner.innerHTML = '<span id="lc-banner-texto"></span>' +
        '<button type="button" id="lc-banner-cerrar" class="lc-banner-cerrar" aria-label="Stop building">✖</button>';
      document.body.appendChild(banner);
    }

    this._bindDomClick(document.getElementById('lc-toggle'), 'lcToggle', (e) => {
      if (e) e.stopPropagation();
      const panel = document.getElementById('lc-panel');
      const btn = document.getElementById('lc-toggle');
      const abrir = panel.hidden;
      panel.hidden = !abrir;
      btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (!abrir) this._salirModoConstruir(true);
      this._pintarBarraConstruccion();
    });
    this._bindDomClick(document.getElementById('lc-tipos'), 'lcTipos', (e) => {
      if (e) e.stopPropagation();
      const b = e && e.target && e.target.closest ? e.target.closest('.lc-tipo') : null;
      if (!b || b.disabled) return;
      const tipo = b.dataset.tipo;
      if (this._modoConstruir === 'colocar' && this._tipoColocar === tipo) { this._salirModoConstruir(true); return; }
      if (tipo === 'parcela' && this._construccionHabilitada === false) {
        this._avisoConstruccion('Construction is not enabled yet.', 'warning'); return;
      }
      if (this._contarEnBolsa(tipo) <= 0) {
        this._avisoConstruccion(this._mensajeNoTienes(tipo), 'warning'); return;
      }
      this._entrarModoConstruir('colocar', 'barra', tipo);
    });
    this._bindDomClick(document.getElementById('lc-quitar'), 'lcQuitar', (e) => {
      if (e) e.stopPropagation();
      if (this._modoConstruir === 'quitar') { this._salirModoConstruir(true); return; }
      if (this._contarPalasEnInventario() <= 0) { this._avisoConstruccion(MSG_SIN_PALA, 'warning'); return; }
      if (!this._construcciones.size) { this._avisoConstruccion('There is nothing built yet.', 'info'); return; }
      this._entrarModoConstruir('quitar', 'barra');
    });
    this._bindDomClick(document.getElementById('lc-banner-cerrar'), 'lcBanner', (e) => {
      if (e) e.stopPropagation();
      this._salirModoConstruir(true);
    });

    barra.classList.remove('oculto');
    this._colocarBarraConstruccion();
    if (!this._alRedimensionarBarra) {
      this._alRedimensionarBarra = () => this._colocarBarraConstruccion();
      window.addEventListener('resize', this._alRedimensionarBarra);
    }
    this._pintarBarraConstruccion();
  }

  /**
   * Debajo de la tarjeta del jugador, la mida lo que la mida. En pantallas
   * bajas (un movil apaisado: 375 px de alto) debajo no cabe el panel abierto
   * sin pisar la barra rapida, asi que se pone a la DERECHA de la tarjeta.
   */
  _colocarBarraConstruccion() {
    const barra = document.getElementById('lands-construir');
    if (!barra) return;
    const tarjeta = document.getElementById('hub');
    let arriba = 180, izquierda = 7;
    try {
      const r = tarjeta && tarjeta.getBoundingClientRect();
      const alto = window.innerHeight || 0;
      if (r && r.height > 0) {
        // 330 = panel abierto (~255, con la rejilla del bote y los cofres)
        // + la barra rapida de abajo (~75).
        if (!alto || alto - (r.bottom + 10) >= 330) {
          arriba = Math.round(r.bottom + 10);
        } else {
          arriba = Math.round(r.top);
          izquierda = Math.round(r.right + 10);
        }
      }
    } catch (e) {}
    barra.style.top = arriba + 'px';
    barra.style.left = izquierda + 'px';
  }

  _mostrarBannerConstruccion(texto) {
    const banner = document.getElementById('lc-banner');
    const t = document.getElementById('lc-banner-texto');
    if (!banner || !t) return;
    t.textContent = texto;
    banner.hidden = false;
  }

  _pintarRecuentoBarra() {
    for (const t of COLOCABLES) {
      const el = document.querySelector('#lc-tipos [data-cuenta="' + t + '"]');
      if (!el) continue;
      const n = this._contarEnBolsa(t);
      if (el.textContent !== String(n)) el.textContent = String(n);
      if (el.parentNode) el.parentNode.classList.toggle('sin', n <= 0);
    }
    const p = this._contarPalasEnInventario();
    const ep = document.getElementById('lc-palas');
    if (ep && ep.textContent !== '×' + p) ep.textContent = '×' + p;
  }

  _pintarBarraConstruccion() {
    const tipos = document.getElementById('lc-tipos');
    const quitar = document.getElementById('lc-quitar');
    const ayuda = document.getElementById('lc-ayuda');
    if (!tipos || !quitar || !ayuda) return;
    this._pintarRecuentoBarra();
    const deshabilitada = this._construccionHabilitada === false;
    tipos.querySelectorAll('.lc-tipo').forEach((b) => {
      const activo = this._modoConstruir === 'colocar' && this._tipoColocar === b.dataset.tipo;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', activo ? 'true' : 'false');
      // Solo la parcela depende de las tablas del administrador.
      b.disabled = b.dataset.tipo === 'parcela' && deshabilitada;
    });
    quitar.classList.toggle('activo', this._modoConstruir === 'quitar');
    quitar.setAttribute('aria-pressed', this._modoConstruir === 'quitar' ? 'true' : 'false');
    quitar.disabled = false;
    let texto;
    if (this._modoConstruir === 'colocar') texto = (COLOCABLE[this._tipoColocar] || COLOCABLE.parcela).nombre + ' · Esc or ✖ to stop.';
    else if (this._modoConstruir === 'quitar') texto = 'Plots with a crop and chests with things inside can’t be dug up.';
    else if (COLOCABLES.every((t) => this._contarEnBolsa(t) <= 0)) texto = 'Buy plots, chests and trash cans in the shop → Construction.';
    else if (this._contarPalasEnInventario() <= 0) texto = 'A Construction Shovel digs things up.';
    else texto = (this._construcciones ? this._construcciones.size : 0) + ' / ' + this._maxConstrucciones + ' built';
    if (ayuda.textContent !== texto) ayuda.textContent = texto;
  }

  // =========================================================================
  // UPDATE
  // =========================================================================
  //
  // No llama a super.update() por lo mismo que la mina: el update de GameScene
  // recorre arboles, rocas y NPC del mapa de fuera, que aqui no existen.

  update(time, delta) {
    /* Ya nos vamos: ni un fotograma mas. Sin esto, el update seguiria
       escribiendo `posicionplayerx` con las coordenadas de la isla encima de
       las que `_dejarPartidaEnElMapa()` acaba de guardar. */
    if (this._cambiandoEscena) return;

    {
      let b = this._elBurbujaLocal;
      if (!b || !b.isConnected) {
        b = this._elBurbujaLocal = document.getElementById('local-chat-bubble');
      }
      const plazoVivo = this._burbujaHasta && Date.now() < this._burbujaHasta;
      if (b && (plazoVivo || b.style.display !== 'none')) this._positionLocalBubble(b);
    }

    if (!this.keys) return;
    if (!this.player || !this.player.scene) return;

    if (this._construcciones && !this._islaDe) this._vigilarSeleccionConstruccion();
    if (this._construcciones) this._vigilarObjetosDeIsla();

    this._asegurarIndiceColisiones();

    this.previousPosition = { x: this.player.x, y: this.player.y };
    this.posicionplayerx = this.player.x;
    this.posicionplayery = this.player.y;

    if (this.mouseMovement.followCursorActive && !this.input.activePointer.isDown) {
      this.stopMouseMovement();
    }
    this.handleMouseMovement(delta);

    if (!this.mouseMovement.followCursorActive) {
      const bloqueado = this._chatInputFocused === true;
      let dx = 0, dy = 0;
      if (!bloqueado) {
        if (this.keys.leftArrow.isDown || this.keys.left.isDown) dx -= 1;
        if (this.keys.rightArrow.isDown || this.keys.right.isDown) dx += 1;
        if (this.keys.upArrow.isDown || this.keys.up.isDown) dy -= 1;
        if (this.keys.downArrow.isDown || this.keys.down.isDown) dy += 1;
      }
      if (this._joy && this._joy.force > 0) {
        const r = Phaser.Math.DegToRad(this._joy.angle);
        dx += Math.cos(r);
        dy += Math.sin(r);
      }
      const largo = Math.hypot(dx, dy);
      if (largo > 1) { dx /= largo; dy /= largo; }
      const seg = delta / 1000;
      this.player.x += dx * this.speed * seg;
      this.player.y += dy * this.speed * seg;
      this._rawMoveDx = dx;
      this._rawMoveDy = dy;
    }

    // Colisiones eje a eje, con el mismo rectangulo de pies que el resto del
    // juego (30x15): asi el jugador se desliza por la orilla en vez de
    // clavarse al tocarla en diagonal.
    const prevX = this.previousPosition.x;
    const prevY = this.previousPosition.y;
    /* 26 de alto, no 15. El sprite es de 23x51 a escala 2, o sea 102 px con el
       origen en el centro: los pies caen en `y + 51`. Con 15 de alto la caja
       acababa en `y + 40` y los ultimos once pixeles del personaje se metian
       DENTRO de la pared. Se alarga por abajo y no se mueve: el borde de
       arriba sigue igual, asi que no se empieza a chocar antes de costado. */
    // Eje a eje, y si estaba atrapado, fuera (GameScene._resolverChoqueJugador).
    this._resolverChoqueJugador(prevX, prevY, 26);

    this._animarJugador(prevX, prevY);

    if (!this.playerRect) this.playerRect = new Phaser.Geom.Rectangle(0, 0, 30, 26);
    this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 26);

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

    try { this._actualizarMascota(); } catch (e) {}

    /* Que los demas de la isla le vean moverse. La isla no lo mandaba: su
       socket estaba en la sala del mapa de fuera (ver `_salaDeEscena`). */
    if (this.dog) { try { this.sendPlayerMovement(); } catch (e) {} }

    this._comprobarSalida();
  }

  /**
   * La sala del servidor: UNA POR ISLA, 'isla@<dueño>'. El dueño y quien le
   * visite comparten sala y se ven; dos islas distintas no se mezclan. La
   * cuenta va con encodeURIComponent para que no lleve nunca un '#', que es
   * el separador del canal en el servidor.
   */
  _salaDeEscena() {
    return 'isla@' + encodeURIComponent(this._islaDe || this.playerName || '');
  }

  // =========================================================================
  // DE VISITA EN LA ISLA DE OTRO                                (2026-10-04)
  // =========================================================================

  /**
   * Lo construido y lo sembrado del dueño, de solo mirar. Se relee cada 30 s
   * para que lo que el dueño haga mientras se le visita aparezca solo.
   *
   * Los cultivos se pintan con `updatePlotVisual()`, el mismo del huerto,
   * sobre unos `plotImages`/`plotTexts`/`cropData` propios: sin
   * `initCropSystem()`, que pediria los MIOS y engancharia el riego.
   */
  _montarVisita() {
    this.plotImages = new Map();
    this.plotTexts = new Map();
    this.cropData = new Map();
    this._mostrarCartelVisita(true);
    this._cargarVisita();
    this._relojVisita = this.time.addEvent({
      delay: 30000, loop: true, callback: () => this._cargarVisita()
    });
  }

  async _cargarVisita() {
    const runId = this._sceneRunId;
    const de = this._islaDe;
    if (!de) return;
    const r = await this._apiConstruccion('GET', '/api/lands/visita?de=' + encodeURIComponent(de));
    if (!this._construccionViva || this._sceneRunId !== runId || this._islaDe !== de) return;
    if (!r.ok) {
      const motivo = r.datos && r.datos.error;
      console.warn('🏝️ visita: no se pudo leer la isla de', de, motivo || r.status);
      if (!this._visitaCargada) {
        this._avisoConstruccion(motivo === 'no_disponible'
          ? 'You can visit this island while its owner is online, or if you are friends.'
          : 'This island could not be loaded.', 'error');
      }
      return;
    }
    this._visitaCargada = true;
    const d = r.datos || {};
    if (d.dueno && d.dueno.username) {
      this._islaDeNombre = String(d.dueno.username);
      this._mostrarCartelVisita(true);
    }
    if (d.tipos && typeof d.tipos === 'object') {
      for (const k of Object.keys(d.tipos)) {
        const t = d.tipos[k];
        if (t && t.ancho > 0 && t.alto > 0) {
          this._tiposConstruccion[k] = { ancho: t.ancho, alto: t.alto, itemId: t.itemId || k, capacidad: Number(t.capacidad) || 0 };
        }
      }
    }

    // Lo nuevo, dentro (con su pequeña animacion despues de la primera vez);
    // lo que el dueño ya ha recogido, fuera.
    const siguen = new Set();
    for (const c of (d.construcciones || [])) {
      const reg = this._agregarConstruccion(c, this._visitaPintada);
      if (reg) siguen.add(reg.gx + ',' + reg.gy);
    }
    for (const [clave, reg] of this._construcciones) {
      if (siguen.has(clave)) continue;
      this._destruirVisualConstruccion(reg);
      this._construcciones.delete(clave);
    }

    this.cropData.clear();
    for (const c of (d.cultivos || [])) {
      if (c && typeof c.plotId === 'string') this.cropData.set(c.plotId, c);
    }
    for (const reg of this._construcciones.values()) {
      const cultivo = this.cropData.get(reg.plotId);
      if (cultivo && typeof this.updatePlotVisual === 'function') {
        try { this.updatePlotVisual(reg.plotId, cultivo); } catch (e) {}
      } else if (reg.tierra) {
        reg.tierra.setTexture('tierra_seca');
        reg.tierra.setDisplaySize(reg.w, reg.h);
        if (reg.texto) reg.texto.setText('');
      }
    }
    this._visitaPintada = true;
    console.log('🏝️ de visita en la isla de', de, '·', this._construcciones.size,
                'construcciones ·', this.cropData.size, 'cultivos');
  }

  /** El cartel de arriba: de quien es la isla, y un boton para ir a la mia. */
  _mostrarCartelVisita(ver) {
    let c = document.getElementById('gf-visita-isla');
    if (!ver || !this._islaDe) {
      if (c && c.parentNode) c.parentNode.removeChild(c);
      return;
    }
    if (!c) {
      c = document.createElement('div');
      c.id = 'gf-visita-isla';
      c.className = 'gf-visita-isla';
      c.setAttribute('role', 'status');
      const t = document.createElement('span');
      t.className = 'gf-visita-texto';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gf-visita-mia';
      b.textContent = 'My island';
      b.title = 'Go to your own island';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.GFViaje) window.GFViaje.viajar({ mundo: 4 });
      });
      c.appendChild(t);
      c.appendChild(b);
      document.body.appendChild(c);
    }
    // textContent: el nombre lo eligio otro jugador.
    c.querySelector('.gf-visita-texto').textContent =
      '🏝️ Visiting ' + (this._islaDeNombre || this._islaDe) + "'s island";
  }

  // =========================================================================
  // SALIR DE LA ISLA
  // =========================================================================

  /**
   * Pisar la puerta devuelve al mapa.
   *
   * Los mismos dos candados que la mina y que la puerta de la tienda:
   *
   *   . `_salidaArmada`: no dispara hasta que el jugador haya estado FUERA del
   *     rectangulo al menos un fotograma. Sin esto, aparecer cerca de la
   *     puerta te devolveria al mapa antes de ver la isla.
   *   . `_cambiandoEscena`: `scene.start()` no surte efecto hasta el final del
   *     paso actual, asi que sin el, el mismo fotograma podria lanzar la
   *     transicion dos veces.
   *
   * El viaje lo hace `GFLands.volver()`, el mismo que el boton redondo: asi
   * hay UN solo camino de vuelta, y el icono del boton y el apagado del HUD no
   * se pueden quedar a medias segun por donde se haya salido.
   */
  _comprobarSalida() {
    if (!this._puerta || !this.playerRect) return;

    const tocando = Phaser.Geom.Intersects.RectangleToRectangle(
      this.playerRect, this._puerta);

    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;

    this._salidaArmada = false;
    console.log('🏝️ has pisado la puerta: de vuelta al mapa');

    /* El guardado NO se hace aqui: lo hace `GFLands.volver()`, que es tambien
       el camino del boton redondo. Un solo sitio que corrige el mundo y la
       posicion antes de guardar, y no dos que se pueden desincronizar. */
    if (window.GFLands) {
      window.GFLands.volver(this);
    } else {
      // Sin gf-lands.js cargado: la vuelta a mano, a la plaza.
      this._dejarPartidaEnElMapa(2097, 2359);
      this.scene.start('LoadingScenegame', {
        targetScene: 'GameScene',
        playerData: { x: 2097, y: 2359, mundo: 1 }
      });
    }
  }

  // =========================================================================
  // APAGADO
  // =========================================================================

  _alApagar() {
    if (this._landsCleanupDone) return;
    this._landsCleanupDone = true;
    this._sceneStopped = true;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    // Lo primero: deja de escuchar el raton y suelta las parcelas y la barra.
    try { this._desmontarConstruccion(); } catch (e) { console.warn('desmontar construccion:', e); }
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza de isla:', e); }
    console.log('🏝️ apagando la isla');
    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.backgroundLayer = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    // La textura de la isla se suelta: mientras se juega fuera no pinta nada
    // ocupando memoria de video.
    try {
      if (this.textures.exists('tiles_isla')) this.textures.remove('tiles_isla');
    } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

window.LandsScene = LandsScene;
