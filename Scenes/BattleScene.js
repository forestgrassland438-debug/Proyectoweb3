/*!
 * BattleScene — Batallas de mascotas por CARTAS y turnos (Grassland Forest)
 * ---------------------------------------------------------------------------
 * Phaser dibuja SOLO el escenario (fondo + las dos mascotas). Toda la interfaz
 * (marcadores, vida, mano de cartas, energía, botones) es HTML/CSS —
 * #battleUI en game.html / index.html, estilos en styless.css— para que se
 * adapte igual a PC y a teléfonos.
 *
 * El servidor es la autoridad: reparte la mano, valida la energía y calcula el
 * daño. El cliente solo manda los índices de las cartas que juega.
 *
 * Eventos (ver server2.js, "SISTEMA DE BATALLAS P2P"):
 *   → battle:queue | battle:bot | battle:action {cards:[índices]} | battle:forfeit
 *   ← battle:queued, battle:matched, battle:turnStart {hand,energy},
 *     battle:rivalReady, battle:turn, battle:end, battle:error
 *
 * El fondo se busca en varias rutas (ver preload): en cuanto exista el archivo
 * se usa; mientras tanto se dibuja un degradado de respaldo.
 */
class BattleScene extends Phaser.Scene {
  // Imagen de la mascota para los retratos del HUD. Es el mismo PNG que el
  // juego usa para el perro en el mapa (ver GameScene: load.image
  // 'perro_derecha_1'), así que no añade ninguna descarga nueva: el navegador
  // ya lo tiene en caché cuando se entra en batalla desde el mapa.
  static RETRATO_MASCOTA = './Game/Sprites/mascota/derecha/run_1.png';

  /* ═════════════════════════════════════════════════════════════════════
     LOS RIVALES: NO TODO SON PERROS
     ─────────────────────────────────────────────────────────────────────
     Antes las dos mascotas del combate eran el MISMO perro, uno mirando a
     cada lado. Se veía justo lo que dijo el jugador: dos perros iguales, sin
     saber cuál era el tuyo, y sin ninguna sensación de estar peleando contra
     algo. Además hacía inútil el nombre del bot: daba igual que se llamara
     "Thorn" o "Boulder", era el mismo bicho.

     Ahora el servidor manda `species` con cada rival y aquí se busca en esta
     tabla qué dibujar. Todos los sprites YA ESTÁN en el juego (son los
     animales del mapa), así que esto no añade ni un archivo nuevo: solo los
     usa donde no se usaban.

     Cada especie dice cuántos fotogramas tiene de cada pose. Las poses que
     valen 0 no existen para ese bicho y se caen a `quieto`.
     ═════════════════════════════════════════════════════════════════════ */
  static ESPECIES = {
    perro:     { via: 'mascota',  etiqueta: 'Dog',       quieto: 4, camina: 4, ataque: 0 },
    conejo:    { via: 'animales', pre: 'conejo_',        etiqueta: 'Rabbit',    quieto: 2, camina: 4, ataque: 0 },
    cerdo:     { via: 'animales', pre: 'cerdo_',         etiqueta: 'Boar',      quieto: 2, camina: 4, ataque: 0 },
    cuervo:    { via: 'cuervo',   pre: 'cuervo_',        etiqueta: 'Crow',      quieto: 2, camina: 4, ataque: 0 },
    zorro:     { via: 'animales', pre: 'zorro_',         etiqueta: 'Fox',       quieto: 2, camina: 4, ataque: 3 },
    zorra:     { via: 'animales', pre: 'zorra_',         etiqueta: 'Vixen',     quieto: 2, camina: 4, ataque: 3 },
    cocodrilo: { via: 'animales', pre: 'cocodrilo_',     etiqueta: 'Croc',      quieto: 2, camina: 4, ataque: 3 },
    vibora:    { via: 'animales', pre: 'serpiente_vibora_', etiqueta: 'Viper',  quieto: 2, camina: 0, repta: 4, ataque: 3 },
    coral:     { via: 'animales', pre: 'serpiente_coral_',  etiqueta: 'Coral',  quieto: 2, camina: 0, repta: 4, ataque: 3 },
    topo:      { via: 'animales', pre: 'topo_',          etiqueta: 'Mole',      quieto: 2, camina: 4, ataque: 0 },
    vaca:      { via: 'animales', pre: 'vaca_',          etiqueta: 'Bull',      quieto: 2, camina: 4, ataque: 0 }
  };

  /* Cuánto ocupa un luchador en pantalla. Se normaliza por las DOS medidas
     porque los sprites no tienen nada que ver entre sí: el cocodrilo mide
     70×24 y el conejo 26×20. Escalando solo por la altura, el cocodrilo
     ocupaba media pantalla de ancho. */
  static LUCHADOR_ANCHO = 168;
  static LUCHADOR_ALTO  = 118;
  static LUCHADOR_ESCALA_MIN = 2.0;
  static LUCHADOR_ESCALA_MAX = 4.6;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data) {
    this.datosJugador = {
      playerName: (data && data.playerName) || '---',
      petName: (data && data.petName) || '---',
      address: (data && data.address) || '',
      nivel: (data && data.nivel) || 1
    };
    this.serverBase = (data && data.serverBase) || '';
    this.volverA = (data && data.volverA) || 'LoadingScenegame';
    this.modo = (data && data.modo) === 'bot' ? 'bot' : 'pvp';

    this.estado = 'buscando';   // buscando | combate | fin
    this.matchId = null;
    this.yo = null;
    this.rival = null;
    this.mano = [];
    this.energiaMax = 3;
    this.seleccion = [];        // índices de cartas elegidas
    this.puedeJugar = false;
    this._listeners = [];
    this._buscandoIniciado = false;

    // FIX (la 2ª batalla se quedaba pegada en "Back to the map…"):
    // Phaser REUTILIZA la instancia de la escena, así que `_volviendo` seguía
    // en true desde la batalla anterior y `volverAlMapa()` hacía `return` sin
    // volver nunca al mapa. Hay que resetearlo en cada init().
    this._volviendo = false;
  }

  preload() {
    // Se prueban varias rutas: así vale tanto si guardas la imagen en
    // Game/Objetos como en assets o en Game/FONDO.
    // FIX "NO SE VE EL FONDO DE BATALLA":
    // La primera ruta que se probaba era './Game/Objetos/fondo_batalla.png',
    // que NO existe. La imagen está en './assets/fondo_batalla.png'.
    //
    // Había un reintento por `loaderror` que cargaba la siguiente ruta y
    // llamaba a `this.load.start()`, pero eso no funciona: el cargador ya está
    // corriendo durante el preload y una llamada a start() mientras
    // `isLoading` es true se ignora. Además create() se ejecuta en cuanto
    // termina el preload original, así que aunque el reintento hubiera
    // arrancado, `textures.exists('fondo_batalla')` seguiría siendo false al
    // construir el escenario y siempre caía en el fondo de respaldo pintado
    // con graphics. Resultado: el PNG no se veía nunca.
    //
    // Ahora se pide directamente la ruta buena. Las otras se quedan
    // documentadas por si la imagen se mueve, pero ya no hacen falta.
    this._rutasFondo = [
      './assets/fondo_batalla.png',       // ← la que existe de verdad
      './Game/Objetos/fondo_batalla.png',
      './Game/FONDO/fondo_batalla.png'
    ];
    this.load.image('fondo_batalla', this._rutasFondo[0]);

    // Si aun así fallara (fichero borrado, 404 del servidor), se marca para
    // usar el fondo de respaldo en vez de dejar la pantalla vacía.
    // `once` y no `on`: el LoaderPlugin es de la escena y la escena se
    // reutiliza, así que con `on` se acumulaba un listener por batalla.
    this._sinFondo = false;
    this.load.once('loaderror', (file) => {
      if (!file || file.key !== 'fondo_batalla') return;
      console.warn('⚠️ No se pudo cargar assets/fondo_batalla.png; se usa el fondo de respaldo');
      this._sinFondo = true;
    });

    /* EL PERRO, SIEMPRE.

       La mascota del jugador es un perro, y en PvP el rival también. Sus
       cuatro fotogramas se piden aquí, con el resto del preload, para que la
       batalla arranque ya con los dos luchadores puestos.

       Antes esto se daba por hecho: se usaba la textura 'perro_derecha_1' que
       carga GameScene. Funciona si entras a la batalla DESDE el mapa, y solo
       entonces — con la escena arrancada de otra forma (o tras una limpieza de
       memoria que tirara esa textura) los dos luchadores se quedaban sin
       dibujo. Cargarlos aquí cuesta cuatro PNG de menos de un kilobyte y
       quita esa dependencia. */
    this._rutasEspecie('perro', 'quieto', 4).forEach(([clave, ruta]) => {
      if (!this.textures.exists(clave)) this.load.image(clave, ruta);
    });
  }

  create() {
    const { width, height } = this.scale;

    document.body.classList.add('in-battle');   // oculta el HUD del mapa
    /* Las piezas de los efectos se dibujan ANTES del escenario: crearEscenario
       ya las usa (la sombra y la plataforma de cada luchador salen de ahí). */
    if (window.GFBatallaArte) window.GFBatallaArte.efectos(this);
    this.crearEscenario(width, height);
    this.montarUI();
    this.avisoHorizontal();

    this.socket = window.globalSocket;
    if (!this.socket) {
      this.estadoTexto('No connection to the server.');
      this.time.delayedCall(2500, () => this.volverAlMapa());
      return;
    }

    // GameScene desconecta este mismo socket global al salir del mapa
    // (cleanupScene → socket.disconnect), así que aquí suele llegar caído.
    if (this.socket.connected) {
      this.arrancarBusqueda();
    } else {
      this.estadoTexto('Connecting to the server…');
      this.socket.connect();

      const alConectar = () => {
        if (this._conexionTimeout) { this._conexionTimeout.remove(); this._conexionTimeout = null; }
        this.arrancarBusqueda();
      };
      this.socket.once('connect', alConectar);

      this._conexionTimeout = this.time.delayedCall(10000, () => {
        if (this.matchId) return;
        this.socket.off('connect', alConectar);
        this.estadoTexto('Could not reach the server.\nBack to the map…');
        this.time.delayedCall(2000, () => this.volverAlMapa());
      });
    }

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.limpiar());
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO (lo único que dibuja Phaser)
  // ---------------------------------------------------------------------------
  crearEscenario(width, height) {
    const A = window.GFBatallaArte;

    /* ── EL ESCENARIO ──
       Cinco escenarios distintos, dibujados con canvas (gf-batalla-arte.js), y
       el cuadro pintado a mano de siempre como sexto. Cuál toca lo decide el
       identificador de la partida, así que las dos personas de un PvP ven el
       mismo sitio y, al girar el teléfono, sigue siendo el mismo.

       Antes había UN fondo para todas las batallas del juego. */
    this.arena = null;
    const semilla = this.matchId || this.datosJugador.playerName || 'gf';
    if (A) {
      const id = A.elegirArena(semilla);
      let sem = 0;
      const txt = String(semilla);
      for (let i = 0; i < txt.length; i++) sem = (sem * 131 + txt.charCodeAt(i)) >>> 0;
      this.arena = A.arena(this, id, sem || 7);
    }

    if (this.arena) {
      this.fondo = this.add.image(width / 2, height / 2, this.arena.clave).setDepth(0);
      this.sueloFrac = this.arena.suelo;
    } else if (!this._sinFondo && this.textures.exists('fondo_batalla')) {
      this.fondo = this.add.image(width / 2, height / 2, 'fondo_batalla').setDepth(0);
      this.sueloFrac = 0.70;
    } else {
      const g = this.add.graphics().setDepth(0);
      g.fillGradientStyle(0x7ec8f2, 0x7ec8f2, 0xcfe9f7, 0xcfe9f7, 1);
      g.fillRect(0, 0, width, height);
      g.fillStyle(0xe4d3a8, 1);
      g.fillRect(0, height * 0.62, width, height * 0.38);
      this.fondoRespaldo = g;
      this.sueloFrac = 0.70;
    }

    /* ── LA CAPA DE EFECTOS ──
       Todo lo que estalla vive en su propio contenedor, por encima de los
       luchadores. Así se puede vaciar de golpe al acabar la batalla sin ir
       persiguiendo sprites sueltos. */
    this.capaEfectos = this.add.container(0, 0).setDepth(30);
    this._efectos = [];

    this.crearLuchadores(width, height);
    this.ajustarFondo(width, height);
  }

  /**
   * Cambia el escenario por el que le toca a esta partida.
   * Se llama al emparejar, cuando ya se conoce el matchId.
   */
  cambiarArena(semilla) {
    const A = window.GFBatallaArte;
    if (!A || !semilla) return;
    const { width, height } = this.scale;
    const id = A.elegirArena(semilla);
    let sem = 0;
    const txt = String(semilla);
    for (let i = 0; i < txt.length; i++) sem = (sem * 131 + txt.charCodeAt(i)) >>> 0;
    const nueva = A.arena(this, id, sem || 7);
    if (!nueva || (this.arena && this.arena.clave === nueva.clave)) return;

    this.arena = nueva;
    this.sueloFrac = nueva.suelo;
    if (this.fondoRespaldo) { this.fondoRespaldo.destroy(); this.fondoRespaldo = null; }
    if (this.fondo) this.fondo.destroy();
    this.fondo = this.add.image(width / 2, height / 2, nueva.clave).setDepth(0).setAlpha(0);
    this.tweens.add({ targets: this.fondo, alpha: 1, duration: 380 });
    this.ajustarFondo(width, height);
  }

  /** La Y del suelo donde se plantan los luchadores. */
  sueloY(height) {
    /* Sobre la línea del suelo del escenario, con un dedo de margen para que
       los pies se hundan un poco en vez de quedarse encima de la raya — es lo
       que hace que un personaje parezca plantado y no pegado con celo.

       Y NO más abajo: la mano de cartas ocupa la franja de abajo de la
       pantalla, así que un luchador puesto al 75 % de la altura queda medio
       tapado por sus propias cartas. Ése era el aspecto raro de la captura. */
    return height * (this.sueloFrac || 0.68) + height * 0.02;
  }

  /**
   * Monta un luchador entero: sombra, plataforma, sprite y cartel.
   *
   * Se hace con un CONTENEDOR por luchador. Antes eran sprites sueltos y cada
   * animación tenía que mover a mano cada pieza; con el contenedor, el brinco
   * de ataque o el retroceso al recibir mueven al bicho con su sombra y su
   * nombre, todo junto, y no hay forma de que se descoloque.
   */
  crearLuchador(x, y, lado) {
    const A = window.GFBatallaArte;
    const cont = this.add.container(x, y).setDepth(lado === 'yo' ? 10 : 9);

    // Marca de suelo: dice DÓNDE está plantado, aunque el bicho salte.
    let plataforma = null;
    if (A && this.textures.exists(A.pieza('plataforma'))) {
      plataforma = this.add.image(0, 4, A.pieza('plataforma')).setAlpha(0.5);
      plataforma.setDisplaySize(150, 44);
      cont.add(plataforma);
    }

    /* LA SOMBRA.

       Va DENTRO del contenedor pero un poco por debajo de los pies, no
       centrada en ellos: si la elipse se centra justo en la línea del suelo,
       el propio sprite le tapa la mitad de arriba y en pantalla no queda casi
       nada — se probó y no se veía. Bajándola un tercio de su alto, la parte
       que asoma por delante de las patas es la que hace todo el trabajo.

       El luchador salta con `spr.y`, no con el contenedor, así que la sombra
       se queda en el suelo cuando el bicho despega. Eso es lo que da altura al
       salto: si la sombra subiera con él, el brinco no se notaría. */
    let sombra = null;
    if (A && this.textures.exists(A.pieza('sombra'))) {
      sombra = this.add.image(0, 12, A.pieza('sombra'));
      sombra.setDisplaySize(126, 46).setAlpha(0.78);
      cont.add(sombra);
    }

    const spr = this.add.sprite(0, 0, '__DEFAULT');
    spr.setOrigin(0.5, 1);
    cont.add(spr);

    /* El cartel: nombre y nivel encima de la cabeza, más una barra de vida
       pequeña. Lo pidió el jugador y además hace falta: con rivales de
       especies distintas, saber a quién estás pegando deja de ser evidente. */
    const nombre = this.add.text(0, 0, '', {
      fontFamily: '"PressStart2P", monospace', fontSize: '11px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 5, resolution: 2
    }).setOrigin(0.5, 1);
    const nivel = this.add.text(0, 0, '', {
      fontFamily: '"PressStart2P", monospace', fontSize: '9px',
      color: '#ffe08a', stroke: '#000000', strokeThickness: 5, resolution: 2
    }).setOrigin(0.5, 1);
    const barraFondo = this.add.rectangle(0, 0, 92, 9, 0x14161f).setOrigin(0.5, 1);
    barraFondo.setStrokeStyle(2, 0x000000, 0.75);
    const barra = this.add.rectangle(0, 0, 88, 5, 0x5ec26a).setOrigin(0, 1);
    cont.add([barraFondo, barra, nombre, nivel]);

    return {
      cont, spr, sombra, plataforma, nombre, nivel, barra, barraFondo,
      lado, baseY: y, escala: 3, fase: 0, vivo: true
    };
  }

  crearLuchadores(width, height) {
    const y = this.sueloY(height);
    this.luchadorYo = this.crearLuchador(width * 0.24, y, 'yo');
    this.luchadorRival = this.crearLuchador(width * 0.76, y, 'rival');

    // Compatibilidad: el resto del archivo llamaba a estos dos por su nombre.
    this.petYo = this.luchadorYo.spr;
    this.petRival = this.luchadorRival.spr;

    // Hasta que llegue el emparejamiento, los dos son perros.
    this.vestirLuchador(this.luchadorYo, 'perro', false);
    this.vestirLuchador(this.luchadorRival, 'perro', true);
  }

  // ---------------------------------------------------------------------------
  // ESPECIES: CARGA Y VESTIDO
  // ---------------------------------------------------------------------------
  /** Las rutas de los fotogramas de una pose. */
  _rutasEspecie(id, pose, n) {
    const E = BattleScene.ESPECIES[id];
    if (!E) return [];
    const out = [];
    for (let i = 1; i <= n; i++) {
      if (E.via === 'mascota') {
        out.push([`bfp_${id}_${pose}_${i}`, `./Game/Sprites/mascota/derecha/run_${i}.png`]);
      } else if (E.via === 'cuervo') {
        out.push([`bfp_${id}_${pose}_${i}`, `./Game/Sprites/cuervo/${E.pre}${pose}_${i}.png`]);
      } else {
        out.push([`bfp_${id}_${pose}_${i}`, `./Game/Sprites/animales/${E.pre}${pose}_${i}.png`]);
      }
    }
    return out;
  }

  /**
   * Descarga los fotogramas de una especie y avisa cuando estén.
   *
   * Se hace AQUÍ y no en el preload porque la especie del rival no se sabe
   * hasta que el servidor empareja, que es después. Phaser deja arrancar el
   * cargador en marcha sin problema; lo que no se puede es dar por hecho que
   * la textura existe justo después de pedirla, de ahí la promesa.
   */
  cargarEspecie(id) {
    const E = BattleScene.ESPECIES[id];
    if (!E) return Promise.resolve(false);
    if (this._especiesListas && this._especiesListas[id]) return Promise.resolve(true);

    const poses = [
      ['quieto', E.quieto || 0],
      [E.repta ? 'repta' : 'camina', E.repta || E.camina || 0],
      ['ataque', E.ataque || 0]
    ];
    let pedidos = 0;
    poses.forEach(([pose, n]) => {
      // La mascota no tiene poses: sus cuatro run_ valen de todo.
      const realPose = (E.via === 'mascota') ? 'quieto' : pose;
      if (!n) return;
      this._rutasEspecie(id, realPose, n).forEach(([clave, ruta]) => {
        if (this.textures.exists(clave)) return;
        this.load.image(clave, ruta);
        pedidos++;
      });
    });

    if (!pedidos) {
      (this._especiesListas || (this._especiesListas = {}))[id] = true;
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      /* Un tope de tiempo, siempre. Si un PNG falta —una especie nueva en el
         servidor y el archivo sin subir— la promesa no puede quedarse colgada
         para siempre: la batalla se quedaría sin luchadores. Al cabo de tres
         segundos se sigue con lo que haya cargado. */
      const corte = this.time.delayedCall(3000, () => {
        this.load.off('complete', fin);
        resolve(false);
      });
      const fin = () => {
        corte.remove();
        (this._especiesListas || (this._especiesListas = {}))[id] = true;
        resolve(true);
      };
      this.load.once('complete', fin);
      this.load.start();
    });
  }

  /** Qué fotogramas tiene de verdad una especie, ya cargados. */
  _framesDe(id, pose) {
    const E = BattleScene.ESPECIES[id];
    if (!E) return [];
    const realPose = (E.via === 'mascota') ? 'quieto' : pose;
    const n = realPose === 'quieto' ? (E.quieto || 0)
            : realPose === 'ataque' ? (E.ataque || 0)
            : (E.repta || E.camina || 0);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const clave = `bfp_${id}_${realPose}_${i}`;
      if (this.textures.exists(clave)) out.push(clave);
    }
    return out;
  }

  /**
   * Pone a un luchador la pinta de su especie: textura, tamaño, hacia dónde
   * mira y dónde le caen la sombra y el cartel.
   */
  vestirLuchador(L, especie, miraIzquierda) {
    if (!L) return;
    const id = BattleScene.ESPECIES[especie] ? especie : 'perro';
    L.especie = id;

    const quietos = this._framesDe(id, 'quieto');
    const clave = quietos[0] || 'perro_derecha_1';
    if (!this.textures.exists(clave)) {
      // Ni la especie ni el perro del mapa: se deja un bloque de color, que es
      // lo que hacía antes, en vez de romper la escena.
      L.spr.setVisible(false);
      return;
    }
    L.spr.setVisible(true);
    L.spr.setTexture(clave);

    // Tamaño normalizado: ver LUCHADOR_ANCHO / LUCHADOR_ALTO.
    const w = L.spr.width || 32, h = L.spr.height || 32;
    let esc = Math.min(BattleScene.LUCHADOR_ANCHO / w, BattleScene.LUCHADOR_ALTO / h);
    esc = Math.max(BattleScene.LUCHADOR_ESCALA_MIN,
                   Math.min(BattleScene.LUCHADOR_ESCALA_MAX, esc));
    L.escala = esc;
    L.spr.setScale(esc);
    /* Los PNG de los animales miran a la DERECHA. El de la derecha de la
       pantalla tiene que mirar hacia dentro, o sea a la izquierda. */
    L.spr.setFlipX(!!miraIzquierda);
    L.mira = miraIzquierda ? -1 : 1;

    const alto = h * esc;
    const ancho = w * esc;
    if (L.sombra) {
      L.sombra.setDisplaySize(Math.max(80, ancho * 0.92), Math.max(30, ancho * 0.34));
      L.sombra.y = Math.max(8, ancho * 0.09);
    }
    if (L.plataforma) L.plataforma.setDisplaySize(Math.max(110, ancho * 1.25), Math.max(34, ancho * 0.4));

    // El cartel, encima de la cabeza y con aire.
    const cima = -alto - 14;
    L.barraFondo.setPosition(0, cima);
    L.barra.setPosition(-44, cima - 2);
    L.nivel.setPosition(0, cima - 12);
    L.nombre.setPosition(0, cima - 26);

    L.marcos = {
      quieto: quietos,
      anda: this._framesDe(id, 'camina'),
      ataque: this._framesDe(id, 'ataque')
    };
    L.paso = 0;
    L.proximoPaso = 0;
  }

  /* ═════════════════════════════════════════════════════════════════════
     LOS ESTADOS, QUE NADIE PINTABA
     ─────────────────────────────────────────────────────────────────────
     El servidor lleva veneno, aturdimiento, debilidad, regeneración,
     espinas, concentración, armadura y exposición; los calcula, los aplica y
     los MANDA en cada paquete (`status`). El cliente no los enseñaba en
     ningún sitio.

     Eso no es un detalle estético, es media partida: sin ver que el rival
     lleva armadura no sabes que hay que romperla con `expose`, y sin ver que
     vas envenenado no sabes que tienes tres turnos para acabar. Toda la
     profundidad que ya tenía el combate estaba escondida.

     Se pintan como una tira de iconos bajo la barra de vida, con los turnos
     que le quedan a cada uno. */
  static ESTADOS = {
    poison: { icono: '☠', color: '#9ff05a' },
    stun:   { icono: '💫', color: '#ffe066' },
    weak:   { icono: '▼', color: '#ff9aa0' },
    regen:  { icono: '✚', color: '#7ef09a' },
    thorns: { icono: '✷', color: '#ffb060' },
    focus:  { icono: '◎', color: '#ffd24a' },
    armor:  { icono: '▣', color: '#76c8ff' },
    expose: { icono: '✖', color: '#ff7ad0' }
  };

  /** Nombre, nivel, vida y estados del cartel de un luchador. */
  pintarCartel(L, datos) {
    if (!L || !datos) return;
    L.nombre.setText(datos.petName || '—');
    const especie = BattleScene.ESPECIES[L.especie];
    const mote = datos.isBot && especie && especie.etiqueta ? ` · ${especie.etiqueta}` : '';
    L.nivel.setText(`Lv.${datos.level || 1}${mote}`);
    const p = Math.max(0, Math.min(1, datos.hp / Math.max(1, datos.maxHp)));
    L.barra.width = 88 * p;
    L.barra.fillColor = p > 0.55 ? 0x5ec26a : p > 0.25 ? 0xe0b64a : 0xc7503f;
    L.vivo = datos.hp > 0;

    // ── la tira de estados ──
    if (!L.estados) L.estados = [];
    L.estados.forEach((t) => t.destroy());
    L.estados.length = 0;
    const lista = Array.isArray(datos.status) ? datos.status : [];
    if (!lista.length) return;

    const anchoIcono = 26;
    const total = lista.length * anchoIcono;
    const y0 = L.barraFondo.y + 15;
    lista.forEach((e, i) => {
      const cfg = BattleScene.ESTADOS[e.id];
      if (!cfg) return;
      const t = this.add.text(-total / 2 + i * anchoIcono + anchoIcono / 2, y0,
        `${cfg.icono}${e.turnos > 1 ? e.turnos : ''}`, {
          fontFamily: 'system-ui, sans-serif', fontSize: '13px',
          color: cfg.color, stroke: '#000000', strokeThickness: 4, resolution: 2
        }).setOrigin(0.5, 0);
      L.cont.add(t);
      L.estados.push(t);
    });
  }

  ajustarFondo(width, height) {
    if (this.fondo) {
      const escala = Math.max(width / this.fondo.width, height / this.fondo.height);
      this.fondo.setScale(escala).setPosition(width / 2, height / 2);
    }
    const y = this.sueloY(height);
    if (this.luchadorYo) {
      this.luchadorYo.baseY = y;
      this.luchadorYo.cont.setPosition(width * 0.24, y);
    }
    if (this.luchadorRival) {
      this.luchadorRival.baseY = y;
      this.luchadorRival.cont.setPosition(width * 0.76, y);
    }
  }

  // ---------------------------------------------------------------------------
  // VIDA PROPIA DE LOS LUCHADORES
  // ---------------------------------------------------------------------------
  /**
   * El respiro.
   *
   * Dos sprites clavados en su sitio son dos pegatinas — es exactamente lo que
   * se veía en la captura del jugador. Con un balanceo lento y desfasado entre
   * los dos, y el paso de la animación de andar de fondo, la escena pasa a
   * estar VIVA sin gastar nada: son dos senos y un cambio de textura cada
   * doscientos milisegundos.
   */
  respirar(ahora) {
    const uno = (L, desfase) => {
      if (!L || !L.spr.visible) return;
      /* MIENTRAS HAY UNA ANIMACIÓN, EL RESPIRO SE CALLA.

         El respiro escribe `spr.y` y `spr.scale` en CADA fotograma. Si a la
         vez hay un tween moviendo esas mismas propiedades —la embestida, el
         salto de celebración, la caída del KO— el respiro le pisa el valor
         justo después y la animación no se ve: el bicho se queda temblando en
         el sitio. Dos cosas escribiendo lo mismo nunca acaba bien; manda la
         animación, que es la que cuenta algo. */
      if (L.ko || L.animando) return;
      L.fase = ahora * 0.0032 + desfase;
      // Se estira y se encoge un pelín: es como respira un dibujo animado.
      const r = Math.sin(L.fase);
      L.spr.setScale(L.escala * (1 - r * 0.016), L.escala * (1 + r * 0.022));
      L.spr.y = -Math.abs(r) * 2;

      // Y mueve las patas, si su especie tiene con qué.
      const marcos = L.marcos && L.marcos.quieto;
      if (marcos && marcos.length > 1 && ahora >= L.proximoPaso) {
        L.proximoPaso = ahora + 420;
        L.paso = (L.paso + 1) % marcos.length;
        L.spr.setTexture(marcos[L.paso]);
      }
    };
    uno(this.luchadorYo, 0);
    uno(this.luchadorRival, 2.1);
  }

  /** Un brinco hacia el rival, con su golpe y su vuelta. */
  embestir(L, alFinal) {
    if (!L || !L.spr.visible) return;
    const dir = L.lado === 'yo' ? 1 : -1;
    const marcos = (L.marcos && L.marcos.ataque && L.marcos.ataque.length)
      ? L.marcos.ataque
      : (L.marcos && L.marcos.anda && L.marcos.anda.length ? L.marcos.anda : null);

    L.animando = true;
    if (marcos) {
      let i = 0;
      L.spr.setTexture(marcos[0]);
      L._tickAtaque = this.time.addEvent({
        delay: 90, repeat: marcos.length * 2,
        callback: () => { i = (i + 1) % marcos.length; L.spr.setTexture(marcos[i]); }
      });
    }

    /* Adelante deprisa y atrás despacio: así es como se lee un golpe. Si la
       ida y la vuelta duran lo mismo, parece que el bicho se columpia. */
    this.tweens.add({
      targets: L.cont, x: L.cont.x + dir * 78,
      duration: 130, ease: 'Quad.easeIn',
      yoyo: true, hold: 60, easeParams: null,
      onYoyo: () => { if (alFinal) alFinal(); },
      onComplete: () => {
        L.animando = false;
        if (L._tickAtaque) { L._tickAtaque.remove(); L._tickAtaque = null; }
        if (L.marcos && L.marcos.quieto && L.marcos.quieto[0]) L.spr.setTexture(L.marcos.quieto[0]);
      }
    });
    // Un saltito, para que la embestida despegue del suelo.
    this.tweens.add({
      targets: L.spr, y: -22, duration: 130, yoyo: true, ease: 'Quad.easeOut'
    });
  }

  /** Recibe: retrocede, parpadea en rojo y suelta polvo. */
  encajar(L) {
    if (!L || !L.spr.visible) return;
    const dir = L.lado === 'yo' ? -1 : 1;
    this.tweens.add({
      targets: L.cont, x: L.cont.x + dir * 26,
      duration: 70, yoyo: true, repeat: 1, ease: 'Sine.easeOut'
    });
    if (L.spr.setTint) {
      L.spr.setTint(0xff7a6a);
      this.time.delayedCall(260, () => { if (L.spr && L.spr.clearTint) L.spr.clearTint(); });
    }
  }

  /** Se cae. Queda tumbado hasta el final del combate. */
  tumbar(L) {
    if (!L || L.ko) return;
    L.ko = true;
    this.tweens.add({
      targets: L.spr, angle: L.lado === 'yo' ? -78 : 78,
      y: 6, alpha: 0.55, duration: 520, ease: 'Bounce.easeOut'
    });
    if (L.plataforma) this.tweens.add({ targets: L.plataforma, alpha: 0.18, duration: 520 });
  }

  /** Salta de alegría. */
  celebrar(L) {
    if (!L || L.ko) return;
    L.animando = true;      // que el respiro no le pise el salto
    this.tweens.add({
      targets: L.spr, y: -34, duration: 260, yoyo: true, repeat: 3, ease: 'Quad.easeOut',
      onComplete: () => { L.animando = false; }
    });
  }

  // ---------------------------------------------------------------------------
  // INTERFAZ HTML
  // ---------------------------------------------------------------------------
  montarUI() {
    this.ui = document.getElementById('battleUI');
    if (!this.ui) {
      console.error('❌ Falta #battleUI en el HTML');
      return;
    }
    this.ui.classList.remove('hidden');

    this.el = {
      status: document.getElementById('bfStatus'),
      turno: document.getElementById('bfTurnLabel'),
      timer: document.getElementById('bfTimer'),
      timerFill: document.getElementById('bfTimerFill'),
      timerText: document.getElementById('bfTimerText'),
      hand: document.getElementById('bfHand'),
      energy: document.getElementById('bfEnergy'),
      energyCount: document.getElementById('bfEnergyCount'),
      endTurn: document.getElementById('bfEndTurn'),
      leave: document.getElementById('bfLeave'),
      reveal: document.getElementById('bfReveal'),
      revealYou: document.getElementById('bfRevealYou'),
      revealRival: document.getElementById('bfRevealRival'),
      floaters: document.getElementById('bfFloaters'),
      you: {
        name: document.getElementById('bfYouName'),
        lvl: document.getElementById('bfYouLvl'),
        player: document.getElementById('bfYouPlayer'),
        addr: document.getElementById('bfYouAddr'),
        portrait: document.getElementById('bfYouPortrait'),
        hp: document.getElementById('bfYouHp'),
        hpTxt: document.getElementById('bfYouHpTxt'),
        shield: document.getElementById('bfYouShield'),
        shieldBar: document.getElementById('bfYouShieldBar')
      },
      rival: {
        name: document.getElementById('bfRivalName'),
        lvl: document.getElementById('bfRivalLvl'),
        player: document.getElementById('bfRivalPlayer'),
        addr: document.getElementById('bfRivalAddr'),
        portrait: document.getElementById('bfRivalPortrait'),
        hp: document.getElementById('bfRivalHp'),
        hpTxt: document.getElementById('bfRivalHpTxt'),
        shield: document.getElementById('bfRivalShield'),
        shieldBar: document.getElementById('bfRivalShieldBar')
      }
    };

    // Los botones se recablean en cada entrada a la escena, así que se
    // reemplazan por clones para no acumular listeners de partidas anteriores.
    const recablear = (el, fn) => {
      if (!el) return null;
      const nuevo = el.cloneNode(true);
      el.parentNode.replaceChild(nuevo, el);
      nuevo.addEventListener('click', fn);
      return nuevo;
    };

    this.el.endTurn = recablear(this.el.endTurn, () => this.jugarTurno());
    this.el.leave = recablear(this.el.leave, () => this.rendirse());

    if (this.el.reveal) this.el.reveal.classList.add('hidden');
    this.limpiarMano();
    this.pintarEnergia(0);
  }

  estadoTexto(txt) {
    if (this.el && this.el.status) this.el.status.textContent = txt;
  }

  limpiarMano() {
    if (this.el && this.el.hand) this.el.hand.textContent = '';
    this.seleccion = [];
    if (this.el && this.el.endTurn) this.el.endTurn.disabled = true;
  }

  // ---- Temporizador de turno (barra + segundos, debajo del número de turno) ----
  iniciarTemporizador(ms) {
    this.detenerTemporizador();
    if (!this.el || !this.el.timer) return;
    const total = Math.max(1000, ms || 20000);
    this._turnDeadline = Date.now() + total;

    const tick = () => {
      const restante = Math.max(0, this._turnDeadline - Date.now());
      const frac = restante / total;
      if (this.el.timerFill) this.el.timerFill.style.width = (frac * 100) + '%';
      if (this.el.timerText) this.el.timerText.textContent = Math.ceil(restante / 1000) + 's';
      if (this.el.timer) this.el.timer.classList.toggle('low', frac < 0.25);
      if (restante <= 0) this.detenerTemporizador();
    };
    tick();
    this._timerTurno = this.time.addEvent({ delay: 200, loop: true, callback: tick });
  }

  detenerTemporizador() {
    if (this._timerTurno) { this._timerTurno.remove(); this._timerTurno = null; }
    if (this.el && this.el.timerText) this.el.timerText.textContent = '';
    if (this.el && this.el.timerFill) this.el.timerFill.style.width = '0%';
    if (this.el && this.el.timer) this.el.timer.classList.remove('low');
  }

  pintarEnergia(gastada) {
    if (!this.el || !this.el.energy) return;
    this.el.energy.textContent = '';
    for (let i = 0; i < this.energiaMax; i++) {
      const pip = document.createElement('i');
      if (i < this.energiaMax - gastada) pip.className = 'on';
      this.el.energy.appendChild(pip);
    }
    if (this.el.energyCount) this.el.energyCount.textContent = `${this.energiaMax - gastada} / ${this.energiaMax}`;
  }

  energiaGastada() {
    return this.seleccion.reduce((t, i) => t + (this.mano[i] ? this.mano[i].cost : 0), 0);
  }

  // Construye una carta del DOM a partir de los datos del servidor
  _crearCartaDOM(carta) {
    const btn = document.createElement('button');
    btn.className = 'bf-cardbtn';
    btn.type = 'button';
    btn.dataset.type = carta.type || 'attack';

    const coste = document.createElement('span');
    coste.className = 'c-cost';
    coste.textContent = carta.cost;

    const emoji = document.createElement('span');
    emoji.className = 'c-emoji';
    emoji.textContent = carta.emoji || '⚔';

    const nombre = document.createElement('span');
    nombre.className = 'c-name';
    nombre.textContent = carta.name;

    // Valores reales calculados por el servidor (según el ataque de la mascota)
    const stats = document.createElement('span');
    stats.className = 'c-stats';
    if (carta.dmg) { const s = document.createElement('span'); s.className = 's-dmg'; s.textContent = `⚔ ${carta.dmg}`; stats.appendChild(s); }
    if (carta.shield) { const s = document.createElement('span'); s.className = 's-shield'; s.textContent = `🛡 ${carta.shield}`; stats.appendChild(s); }
    if (carta.heal) { const s = document.createElement('span'); s.className = 's-heal'; s.textContent = `💚 ${carta.heal}`; stats.appendChild(s); }

    const desc = document.createElement('span');
    desc.className = 'c-desc';
    desc.textContent = carta.desc || '';

    btn.append(coste, emoji, nombre, stats, desc);
    return btn;
  }

  pintarMano() {
    if (!this.el || !this.el.hand) return;
    this.el.hand.textContent = '';

    this.mano.forEach((carta, i) => {
      const btn = this._crearCartaDOM(carta);
      btn.style.animationDelay = (i * 60) + 'ms';
      btn.addEventListener('click', () => this.alternarCarta(i, btn));
      this.el.hand.appendChild(btn);
    });

    this.refrescarMano();
  }

  alternarCarta(indice, btn) {
    if (!this.puedeJugar) return;

    const pos = this.seleccion.indexOf(indice);
    if (pos >= 0) {
      this.seleccion.splice(pos, 1);
    } else {
      const coste = this.mano[indice].cost;
      if (this.energiaGastada() + coste > this.energiaMax) return; // no hay energía
      this.seleccion.push(indice);
    }
    this.refrescarMano();
  }

  // Marca las elegidas y desactiva las que ya no caben en la energía restante
  refrescarMano() {
    if (!this.el || !this.el.hand) return;
    const gastada = this.energiaGastada();
    const restante = this.energiaMax - gastada;

    Array.from(this.el.hand.children).forEach((btn, i) => {
      const elegida = this.seleccion.includes(i);
      btn.classList.toggle('sel', elegida);
      btn.disabled = !this.puedeJugar || (!elegida && this.mano[i].cost > restante);
    });

    this.pintarEnergia(gastada);
    if (this.el.endTurn) this.el.endTurn.disabled = !this.puedeJugar;
  }

  pintarLuchadores() {
    if (!this.el) return;

    const pinta = (destino, datos) => {
      if (!datos) return;
      destino.name.textContent = datos.petName || '—';
      destino.lvl.textContent = `(Lv.${datos.level})`;
      destino.player.textContent = datos.playerName || '';
      destino.addr.textContent = datos.addressShort || (datos.isBot ? 'BOT' : '');

      // RETRATO: el sprite REAL de la mascota, no un emoji.
      // Antes esto ponía '🐾' (o '🤖' para el bot), así que el jugador no veía
      // a su perro por ningún lado. Se usa la misma imagen que el juego ya
      // carga para la mascota en el mapa, puesta como fondo del círculo para
      // que se recorte solo y no deforme.
      if (destino.portrait) {
        destino.portrait.textContent = '';
        destino.portrait.style.backgroundImage = `url('${BattleScene.RETRATO_MASCOTA}')`;
        destino.portrait.style.backgroundSize = 'contain';
        destino.portrait.style.backgroundRepeat = 'no-repeat';
        destino.portrait.style.backgroundPosition = 'center';
        // El bot se distingue con un borde distinto en vez de otro dibujo:
        // sigue siendo un perro, solo que no es de nadie.
        destino.portrait.classList.toggle('bf-portrait-bot', !!datos.isBot);
      }
      const p = Math.max(0, Math.min(1, datos.hp / datos.maxHp));
      destino.hp.style.width = (p * 100) + '%';
      destino.hpTxt.textContent = `${datos.hp}/${datos.maxHp} HP`;
    };

    pinta(this.el.you, this.yo);
    pinta(this.el.rival, this.rival);
  }

  mostrarEscudos(tuyo, rival) {
    if (!this.el) return;
    const pinta = (destino, datos, escudo) => {
      destino.shield.textContent = escudo > 0 ? `🛡️ ${escudo}` : '';
      if (destino.shieldBar && datos) {
        const frac = Math.max(0, Math.min(1, escudo / datos.maxHp));
        destino.shieldBar.style.width = (frac * 100) + '%';
      }
    };
    pinta(this.el.you, this.yo, tuyo);
    pinta(this.el.rival, this.rival, rival);
  }

  // Muestra las cartas jugadas por ambos, en el centro, y se va sola en ~2.2s
  mostrarReveal(tusCartas, cartasRival) {
    if (!this.el || !this.el.reveal) return;
    const llenar = (cont, cartas) => {
      if (!cont) return;
      cont.textContent = '';
      if (!cartas || !cartas.length) {
        const mini = document.createElement('div');
        mini.className = 'bf-mini';
        mini.innerHTML = '<div class="m-emoji">💤</div><div class="m-name">Pass</div>';
        cont.appendChild(mini);
        return;
      }
      cartas.forEach((c, i) => {
        const mini = document.createElement('div');
        mini.className = 'bf-mini';
        mini.style.animationDelay = (i * 90) + 'ms';
        const e = document.createElement('div'); e.className = 'm-emoji'; e.textContent = c.emoji || '⚔';
        const n = document.createElement('div'); n.className = 'm-name'; n.textContent = c.name || '';
        mini.append(e, n);
        cont.appendChild(mini);
      });
    };
    llenar(this.el.revealYou, tusCartas);
    llenar(this.el.revealRival, cartasRival);

    this.el.reveal.classList.remove('hidden', 'out');
    // forzar reinicio de la animación de entrada
    void this.el.reveal.offsetWidth;

    if (this._revealTimer) this._revealTimer.remove();
    this._revealTimer = this.time.delayedCall(2200, () => {
      if (!this.el || !this.el.reveal) return;
      this.el.reveal.classList.add('out');
      this.time.delayedCall(350, () => { if (this.el && this.el.reveal) this.el.reveal.classList.add('hidden'); });
    });
  }

  // Número flotante (daño/cura/escudo) sobre la mascota indicada
  flotarNumero(texto, clase, lado) {
    if (!this.el || !this.el.floaters) return;
    const f = document.createElement('div');
    f.className = 'bf-float ' + (clase || 'dmg');
    f.textContent = texto;
    // 'you' a la izquierda-abajo, 'rival' a la derecha-abajo (donde están las mascotas)
    f.style.left = (lado === 'rival' ? 72 : 24) + '%';
    f.style.top = '58%';
    this.el.floaters.appendChild(f);
    this.time.delayedCall(1150, () => f.remove());
  }

  // Aviso para móviles en vertical: se pide girar el teléfono
  avisoHorizontal() {
    const aviso = document.getElementById('battleRotateNotice');
    if (!aviso) return;

    const esMovil = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints || 0) > 1;

    const revisar = () => {
      // FIX: se usaba `this.scene.isActive('BattleScene')`, pero esta función se
      // llama desde create() y en ese momento la escena todavía está en estado
      // CREATING, no RUNNING — así que isActive() devolvía FALSE y el aviso se
      // ocultaba nada más entrar. Como después solo se revisaba en 'resize' y
      // 'orientationchange', un jugador que YA entraba en vertical no disparaba
      // ningún evento y el aviso no aparecía nunca. De ahí que "no salga el hub
      // de rotar el teléfono".
      //
      // Ahora basta con que la escena no esté apagada: se comprueba contra la
      // bandera propia, que se pone a true al terminar create() y a false en el
      // shutdown.
      const vertical = window.innerHeight > window.innerWidth;
      const viva     = this._escenaViva !== false;
      aviso.classList.toggle('hidden', !(esMovil && vertical && viva));
    };

    this._escenaViva = true;
    this._revisarOrientacion = revisar;
    window.addEventListener('resize', revisar);
    window.addEventListener('orientationchange', revisar);

    // En el móvil la medida buena es visualViewport: al esconderse la barra del
    // navegador cambia la altura sin que llegue un 'resize' de window.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', revisar);
    }

    revisar();
    // Segunda pasada cuando la escena ya está en marcha de verdad, y una
    // tercera por si el navegador tarda en dar las medidas definitivas al
    // entrar en la batalla desde el mapa.
    this.time.delayedCall(60,  revisar);
    this.time.delayedCall(400, revisar);
  }

  // ---------------------------------------------------------------------------
  // SOCKET
  // ---------------------------------------------------------------------------
  on(evento, manejador) {
    this.socket.on(evento, manejador);
    this._listeners.push([evento, manejador]);
  }

  /**
   * Vigila que la batalla llegue a empezar.
   *
   * Contra bot el plazo es corto (el servidor solo tiene que leer el contador
   * diario y fabricar el rival). En P2P es largo porque hay que esperar a que
   * aparezca otra persona en la cola, que puede tardar de verdad.
   */
  _armarVigilanteDeBusqueda() {
    this._cancelarVigilanteDeBusqueda();

    const esBot   = this.modo === 'bot';
    const limite  = esBot ? 12000 : 90000;   // ms hasta rendirse
    const reintento = Math.floor(limite / 2);

    // Reintento a mitad de camino: si la petición se perdió (típico cuando el
    // socket se reconecta justo después de emitir), esto la recupera sin que
    // el jugador tenga que hacer nada.
    this._reintentoBusqueda = this.time.delayedCall(reintento, () => {
      if (this.matchId || this.estado !== 'buscando') return;
      if (!this.socket || !this.socket.connected) return;
      console.warn('⏳ La batalla no arrancó; se reintenta la petición');
      this.socket.emit(esBot ? 'battle:bot' : 'battle:queue');
    });

    this._vigilanteBusqueda = this.time.delayedCall(limite, () => {
      if (this.matchId || this.estado !== 'buscando') return;
      this.estadoTexto(esBot
        ? 'The battle could not be started.\nPlease try again in a moment.'
        : 'No opponent found right now.\nTry again later or play a daily battle.');
      this.time.delayedCall(2600, () => this.volverAlMapa());
    });
  }

  _cancelarVigilanteDeBusqueda() {
    if (this._reintentoBusqueda) { this._reintentoBusqueda.remove(); this._reintentoBusqueda = null; }
    if (this._vigilanteBusqueda) { this._vigilanteBusqueda.remove(); this._vigilanteBusqueda = null; }
  }

  arrancarBusqueda() {
    if (this._buscandoIniciado) return;
    this._buscandoIniciado = true;

    this.registrarSocket();

    // ── VIGILANTE ANTI-CUELGUE ──────────────────────────────────────────────
    // FIX "SE QUEDA ESPERANDO Y NUNCA PASA NADA": no había NINGÚN límite de
    // tiempo. Se emitía la petición y, si la respuesta del servidor no llegaba
    // —porque el socket se reconectó justo en medio, porque el servidor tardó
    // más de la cuenta, o porque el emparejamiento se descartó— el jugador se
    // quedaba mirando "Preparing your daily battle…" para siempre, sin batalla
    // y sin forma de salir salvo recargar.
    //
    // Ahora se reintenta UNA vez a la mitad del plazo (cubre el caso más común,
    // que la petición se pierda en una reconexión) y, si sigue sin haber
    // batalla, se avisa y se vuelve al mapa en vez de dejarlo colgado.
    this._armarVigilanteDeBusqueda();

    if (this.modo === 'bot') {
      this.estadoTexto('Preparing your daily battle…');
      this.socket.emit('battle:bot');
      return;
    }

    this.socket.emit('battle:queue');
    this._segundosBuscando = 0;
    this._timerBusqueda = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (this.estado !== 'buscando') return;
        this._segundosBuscando++;
        this.estadoTexto(`Searching for an opponent…  ${this._segundosBuscando}s`);
      }
    });
  }

  registrarSocket() {
    this.on('battle:queued', (d) => {
      this.estadoTexto(`Searching for an opponent…\n(position ${d.position} in queue)`);
    });

    this.on('battle:matched', (d) => {
      // El modo tiene que coincidir con el que se pidió. Si se entró por
      // "Battle in P2P" y llega una partida contra bot (o al revés), se ignora
      // y se sigue esperando rival: antes se aceptaba cualquier emparejamiento
      // y el jugador acababa peleando contra la máquina sin haberlo pedido.
      const modoRecibido = d.mode === 'bot' ? 'bot' : 'pvp';
      if (modoRecibido !== this.modo) {
        console.warn(`⚠️ Se ignora un emparejamiento '${modoRecibido}' porque se pidió '${this.modo}'`);
        return;
      }

      this.matchId = d.matchId;
      this.estado = 'combate';
      this.yo = d.you;
      this.rival = d.rival;
      if (this._timerBusqueda) { this._timerBusqueda.remove(); this._timerBusqueda = null; }

      /* EL ESCENARIO SE ELIGE CON EL ID DE LA PARTIDA, no antes.
         En create() todavía no hay partida, así que el fondo que se montó era
         provisional. Con el matchId ya en la mano se cambia por el que toca, y
         eso garantiza que las DOS personas de un PvP están en el mismo sitio. */
      this.cambiarArena(this.matchId);

      /* Y cada uno se viste de lo suyo. El rival puede ser un zorro, un
         cocodrilo o una víbora, y sus sprites no están cargados todavía: se
         piden ahora y se le ponen cuando lleguen. Mientras, sigue siendo un
         perro, que es mejor que un hueco. */
      this.vestirLuchador(this.luchadorYo, 'perro', false);
      this.pintarCartel(this.luchadorYo, this.yo);
      const esp = (d.rival && d.rival.species) || 'perro';
      this.cargarEspecie(esp).then(() => {
        if (!this.luchadorRival || this.estado === 'fin') return;
        this.vestirLuchador(this.luchadorRival, esp, true);
        this.pintarCartel(this.luchadorRival, this.rival);
        // Entra en escena: aparece deslizándose desde fuera del cuadro.
        const x = this.luchadorRival.cont.x;
        this.luchadorRival.cont.x = x + 140;
        this.luchadorRival.cont.alpha = 0;
        this.tweens.add({ targets: this.luchadorRival.cont, x, alpha: 1,
                          duration: 420, ease: 'Quad.easeOut' });
      });

      this.pintarLuchadores();
      this.estadoTexto(d.mode === 'bot'
        ? `DAILY BATTLE ${d.round}/5\n${d.you.petName} vs ${d.rival.petName}`
        : `${d.you.petName} vs ${d.rival.petName}`);
      if (this.el && this.el.turno) this.el.turno.textContent = 'VS';
    });

    this.on('battle:turnStart', (d) => {
      this.yo = d.you;
      this.rival = d.rival;
      this.mano = d.hand || [];
      this.energiaMax = d.energy || 3;
      this.seleccion = [];
      this.puedeJugar = true;

      this.pintarLuchadores();
      this.mostrarEscudos(0, 0);
      this.pintarMano();
      this.estadoTexto('Choose your cards');
      if (this.el && this.el.turno) this.el.turno.textContent = `TURN ${d.turn}`;
      this.iniciarTemporizador(d.msToChoose);
    });

    this.on('battle:rivalReady', () => {
      if (this.puedeJugar) this.estadoTexto('The rival already played. Your turn!');
    });

    this.on('battle:turn', (d) => {
      this.yo = d.you;
      this.rival = d.rival;
      this.puedeJugar = false;
      this.detenerTemporizador();
      this.limpiarMano();

      // Reveal de lo que jugó cada uno (aparece en el centro y se va solo)
      this.mostrarReveal(d.yourCards, d.rivalCards);

      // Actualizar barras y escudos
      this.pintarLuchadores();
      this.mostrarEscudos(d.shieldYou || 0, d.shieldRival || 0);
      this.estadoTexto(d.log || '');

      // Números flotantes + sacudón de la mascota golpeada
      if (d.damageToRival > 0) this.flotarNumero(`-${d.damageToRival}`, 'dmg', 'rival');
      if (d.damageToYou > 0) this.flotarNumero(`-${d.damageToYou}`, 'dmg', 'you');
      if (d.healYou > 0) this.flotarNumero(`+${d.healYou}`, 'heal', 'you');
      if (d.shieldYou > 0) this.flotarNumero(`🛡 ${d.shieldYou}`, 'shield', 'you');

      /* ¿Fue un golpetazo? Un daño muy por encima de lo normal se marca como
         CRÍTICO: pantalla más blanca, sacudida más fuerte y el doble de
         chispas. No lo decide el servidor —no manda esa marca— sino la
         proporción de vida que se llevó por delante, que es justo lo que hace
         que un golpe se sienta grande. */
      const gordo = (dano, quien) => quien && dano > quien.maxHp * 0.16;
      this.animarGolpe(d.damageToRival > 0, d.damageToYou > 0, {
        criticoRival: gordo(d.damageToRival, this.rival),
        criticoYo: gordo(d.damageToYou, this.yo)
      });

      // Y los efectos propios de cada carta jugada, encima del intercambio.
      this.efectosDeCartas(d.yourCards, this.luchadorYo, this.luchadorRival);
      this.time.delayedCall(200, () => {
        this.efectosDeCartas(d.rivalCards, this.luchadorRival, this.luchadorYo);
      });

      // Los carteles de la escena, al día con la vida que queda.
      this.pintarCartel(this.luchadorYo, this.yo);
      this.pintarCartel(this.luchadorRival, this.rival);
    });

    this.on('battle:end', (d) => {
      this.estado = 'fin';
      this.puedeJugar = false;
      this.detenerTemporizador();
      this.limpiarMano();
      this.yo = d.you;
      this.rival = d.rival;
      this.pintarLuchadores();
      this.pintarCartel(this.luchadorYo, this.yo);
      this.pintarCartel(this.luchadorRival, this.rival);

      /* El desenlace se VE. Antes la batalla se acababa con un cartel de texto
         y los dos bichos igual de tiesos que al principio; ahora el que cae se
         cae y el que gana lo celebra, que es lo mínimo para que un combate
         tenga final. */
      if (d.result === 'win') {
        this.tumbar(this.luchadorRival);
        this.time.delayedCall(280, () => this.celebrar(this.luchadorYo));
        this.destello(0.3, 260);
      } else if (d.result === 'lose') {
        this.tumbar(this.luchadorYo);
        this.time.delayedCall(280, () => this.celebrar(this.luchadorRival));
      }

      const titulo = d.result === 'win' ? '🏆 YOU WIN!'
        : d.result === 'lose' ? '💀 YOU LOSE'
        : '🤝 DRAW';
      const motivo = d.reason === 'forfeit' ? '\n(the rival left the battle)' : '';
      const diarias = d.daily ? `\nDaily battles: ${d.daily.done}/${d.daily.max}` : '';
      this.estadoTexto(`${titulo}\n+${d.pointsEarned} points${motivo}${diarias}\n\nBack to the map…`);

      this.time.delayedCall(3500, () => this.volverAlMapa());
    });

    this.on('battle:error', (d) => {
      let msg = 'Could not start the battle.';
      if (d && d.error === 'not_authenticated') msg = 'You must be logged in to battle.';
      else if (d && d.error === 'already_in_battle') msg = 'You are already in a battle.';
      else if (d && d.error === 'daily_limit') {
        msg = `You already played your ${d.daily ? d.daily.max : 5} daily battles.\nCome back tomorrow!`;
      }
      this.estadoTexto(msg);
      this.time.delayedCall(3000, () => this.volverAlMapa());
    });
  }

  jugarTurno() {
    if (!this.puedeJugar || this.estado !== 'combate') return;
    this.puedeJugar = false;
    this.detenerTemporizador();
    this.socket.emit('battle:action', { cards: this.seleccion.slice() });
    this.refrescarMano();
    this.estadoTexto('Waiting for the rival…');
  }

  rendirse() {
    if (this.estado === 'combate' && this.socket && this.socket.connected) {
      this.socket.emit('battle:forfeit');
    } else {
      if (this.socket && this.socket.connected) this.socket.emit('battle:leaveQueue');
      this.volverAlMapa();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EFECTOS
  // ═══════════════════════════════════════════════════════════════════════
  /* Todas las piezas son BLANCAS (ver gf-batalla-arte.js) y el color se lo
     pone aquí cada efecto con setTint. Así el mismo estallido sirve de golpe
     naranja, de veneno verde y de hielo celeste, y no hay que dibujar tres. */
  static COLORES = {
    golpe:   0xfff0c0, critico: 0xffd24a, escudo: 0x76c8ff, cura: 0x7ef09a,
    veneno:  0x9ff05a, aturde:  0xffe066, fuego:  0xff9040, hielo:  0x9fe8ff,
    rayo:    0xfff27a, oscuro:  0xc07aff, polvo:  0xe8dcbc
  };

  /** Una pieza suelta que se mueve y se borra sola. Devuelve el sprite. */
  _pieza(clave, x, y, op) {
    const A = window.GFBatallaArte;
    if (!A || !this.textures.exists(A.pieza(clave))) return null;
    op = op || {};
    const s = this.add.image(x, y, A.pieza(clave));
    s.setTint(op.color == null ? 0xffffff : op.color);
    s.setAlpha(op.alfa == null ? 1 : op.alfa);
    s.setScale(op.escala == null ? 1 : op.escala);
    if (op.rot) s.setRotation(op.rot);
    if (op.mezcla !== false && Phaser.BlendModes) s.setBlendMode(Phaser.BlendModes.ADD);
    if (this.capaEfectos) this.capaEfectos.add(s);
    this._efectos.push(s);

    const conf = Object.assign({
      targets: s, duration: op.dura || 380, ease: 'Quad.easeOut',
      onComplete: () => { this._soltar(s); }
    }, op.tween || {});
    this.tweens.add(conf);
    return s;
  }

  _soltar(s) {
    const i = this._efectos.indexOf(s);
    if (i >= 0) this._efectos.splice(i, 1);
    if (s && s.destroy) s.destroy();
  }

  /** El punto donde se dibujan los golpes de un luchador: su pecho. */
  _centroDe(L) {
    if (!L) return { x: 0, y: 0 };
    const alto = (L.spr.height || 32) * (L.escala || 3);
    return { x: L.cont.x, y: L.cont.y - alto * 0.55 };
  }

  /** Chispas que salen disparadas desde un punto. */
  chispas(x, y, n, color, fuerza) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = (fuerza || 70) * (0.4 + Math.random() * 0.9);
      this._pieza('chispa', x, y, {
        color, escala: 0.2 + Math.random() * 0.35, dura: 320 + Math.random() * 320,
        tween: {
          x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8,
          alpha: 0, scale: 0.05, ease: 'Cubic.easeOut'
        }
      });
    }
  }

  /**
   * EL GOLPE. Es el efecto que más se ve, así que lleva las cinco capas de un
   * impacto de verdad: el corte que llega, el fogonazo, la onda que se abre,
   * las chispas y el polvo del suelo. Con una sola de las cinco se ve pobre;
   * con las cinco, se siente.
   */
  efectoGolpe(L, critico) {
    const c = this._centroDe(L);
    const col = critico ? BattleScene.COLORES.critico : BattleScene.COLORES.golpe;

    this._pieza('zarpazo', c.x, c.y, {
      color: col, escala: 0.35, alfa: 0.95, dura: 260,
      rot: (L.lado === 'yo' ? Math.PI : 0) + (Math.random() - 0.5) * 0.5,
      tween: { scale: 1.05, alpha: 0 }
    });
    this._pieza('estallido', c.x, c.y, {
      color: col, escala: 0.2, dura: 300,
      tween: { scale: critico ? 1.5 : 1.05, alpha: 0, angle: 40 }
    });
    this._pieza('anillo', c.x, c.y, {
      color: col, escala: 0.15, alfa: 0.8, dura: 380,
      tween: { scale: critico ? 1.5 : 1.1, alpha: 0 }
    });
    this.chispas(c.x, c.y, critico ? 16 : 9, col, critico ? 130 : 85);
    // El polvo del suelo, a los pies: el golpe llega hasta abajo.
    this._pieza('humo', L.cont.x, L.cont.y - 6, {
      color: BattleScene.COLORES.polvo, escala: 0.5, alfa: 0.5, dura: 520, mezcla: false,
      tween: { scaleX: 1.5, scaleY: 0.9, y: L.cont.y - 26, alpha: 0 }
    });
    this._pieza('onda', L.cont.x, L.cont.y, {
      color: BattleScene.COLORES.polvo, escala: 0.25, alfa: 0.55, dura: 420, mezcla: false,
      tween: { scaleX: 1.3, scaleY: 0.9, alpha: 0 }
    });
  }

  /** El escudo: un hexágono que aparece de golpe y se queda respirando. */
  efectoEscudo(L) {
    const c = this._centroDe(L);
    this._pieza('escudo', c.x, c.y, {
      color: BattleScene.COLORES.escudo, escala: 0.35, alfa: 0, dura: 220,
      tween: {
        scale: 1.0, alpha: 0.9, ease: 'Back.easeOut',
        onComplete: null,
        yoyo: true, hold: 420
      }
    });
    this.chispas(c.x, c.y, 6, BattleScene.COLORES.escudo, 55);
  }

  /** La cura: una cruz que sube y motas verdes que la acompañan. */
  efectoCura(L) {
    const c = this._centroDe(L);
    this._pieza('cruz', c.x, c.y, {
      color: BattleScene.COLORES.cura, escala: 0.5, dura: 700,
      tween: { y: c.y - 70, alpha: 0, scale: 0.85 }
    });
    for (let i = 0; i < 8; i++) {
      const dx = (Math.random() - 0.5) * 80;
      this._pieza('chispa', c.x + dx, c.y + 30, {
        color: BattleScene.COLORES.cura, escala: 0.25, dura: 600 + Math.random() * 400,
        tween: { y: c.y - 60 - Math.random() * 40, alpha: 0 }
      });
    }
  }

  /** Veneno: burbujas que suben de los pies. */
  efectoVeneno(L) {
    for (let i = 0; i < 7; i++) {
      const dx = (Math.random() - 0.5) * 70;
      this._pieza('burbuja', L.cont.x + dx, L.cont.y - 10, {
        color: BattleScene.COLORES.veneno, escala: 0.25 + Math.random() * 0.35,
        dura: 700 + Math.random() * 500, mezcla: false, alfa: 0.85,
        tween: { y: L.cont.y - 90 - Math.random() * 40, alpha: 0 }
      });
    }
  }

  /** Aturdimiento: estrellitas girando sobre la cabeza. */
  efectoAturde(L) {
    const alto = (L.spr.height || 32) * (L.escala || 3);
    const cy = L.cont.y - alto - 6;
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2;
      const s = this._pieza('estrella', L.cont.x, cy, {
        color: BattleScene.COLORES.aturde, escala: 0.4, dura: 1100,
        tween: { alpha: 0, ease: 'Linear' }
      });
      if (!s) continue;
      // La órbita se hace a mano: un tween por ángulo, no por posición.
      const giro = { a: a0 };
      this.tweens.add({
        targets: giro, a: a0 + Math.PI * 4, duration: 1100, ease: 'Linear',
        onUpdate: () => {
          if (!s.scene) return;
          s.x = L.cont.x + Math.cos(giro.a) * 42;
          s.y = cy + Math.sin(giro.a) * 13;
        }
      });
    }
  }

  /** Elemental: fuego, hielo o rayo cayendo sobre el objetivo. */
  efectoElemento(L, cual) {
    const c = this._centroDe(L);
    if (cual === 'rayo') {
      this._pieza('rayo', c.x, c.y - 90, {
        color: BattleScene.COLORES.rayo, escala: 1.1, dura: 260,
        tween: { alpha: 0, scaleY: 1.4 }
      });
      this.destello(0.55, 120);
      this.chispas(c.x, c.y, 12, BattleScene.COLORES.rayo, 110);
      return;
    }
    const clave = cual === 'hielo' ? 'hielo' : 'llama';
    const color = cual === 'hielo' ? BattleScene.COLORES.hielo : BattleScene.COLORES.fuego;
    for (let i = 0; i < 6; i++) {
      const dx = (Math.random() - 0.5) * 90;
      this._pieza(clave, c.x + dx, c.y + 30 + Math.random() * 30, {
        color, escala: 0.5 + Math.random() * 0.5, dura: 480 + Math.random() * 300,
        rot: cual === 'hielo' ? (Math.random() - 0.5) * 1.2 : 0,
        tween: cual === 'hielo'
          ? { y: c.y + 60, alpha: 0, angle: 120 }
          : { y: c.y - 60 - Math.random() * 40, alpha: 0, scaleX: 0.2 }
      });
    }
  }

  /** Un fogonazo blanco a pantalla completa. */
  destello(fuerza, ms) {
    const { width, height } = this.scale;
    if (!this._flash) {
      this._flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff)
        .setDepth(60).setAlpha(0);
    }
    this._flash.setPosition(width / 2, height / 2).setSize(width, height);
    this._flash.setAlpha(fuerza || 0.4);
    this.tweens.add({ targets: this._flash, alpha: 0, duration: ms || 180 });
  }

  /**
   * QUÉ EFECTO TOCA PARA CADA CARTA.
   *
   * El servidor manda el tipo y el nombre de cada carta jugada; aquí se
   * traduce a lo que se ve. Se mira el NOMBRE en inglés porque es lo que
   * distingue una carta de fuego de una de hielo dentro del mismo tipo
   * 'attack'; si no encaja con nada, se cae al golpe normal, que siempre vale.
   */
  efectosDeCartas(cartas, quienPega, quienRecibe) {
    if (!cartas || !cartas.length) return;
    cartas.forEach((c, i) => {
      const nombre = String((c && c.name) || '').toLowerCase();
      const tipo = (c && c.type) || 'attack';
      this.time.delayedCall(i * 140, () => {
        if (!this.scene || !this.scene.isActive || !this.scene.isActive()) return;
        if (/burn|fire|flame|ember|blaze/.test(nombre)) this.efectoElemento(quienRecibe, 'fuego');
        else if (/ice|frost|chill|freeze/.test(nombre)) this.efectoElemento(quienRecibe, 'hielo');
        else if (/spark|bolt|thunder|shock|storm/.test(nombre)) this.efectoElemento(quienRecibe, 'rayo');
        else if (/poison|venom|toxic|rot/.test(nombre)) this.efectoVeneno(quienRecibe);
        else if (/stun|daze|dizzy|crush/.test(nombre)) this.efectoAturde(quienRecibe);
        else if (tipo === 'defense' || /guard|shield|block|armor/.test(nombre)) this.efectoEscudo(quienPega);
        else if (tipo === 'heal' || /heal|mend|regen|lick|rest/.test(nombre)) this.efectoCura(quienPega);
        else if (tipo === 'buff') this.efectoEscudo(quienPega);
      });
    });
  }

  /**
   * El intercambio del turno, coreografiado.
   *
   * Antes esto era: sacudir el sprite catorce píxeles y teñirlo de rosa. Ahora
   * hay embestida, impacto, retroceso, sacudida de cámara y una PAUSA de dos
   * fotogramas justo en el golpe — el "hit stop" de los juegos de pelea, que
   * es lo que hace que un porrazo se sienta en las manos y no solo se vea.
   */
  animarGolpe(peguéYo, pegóRival, extra) {
    extra = extra || {};
    const Y = this.luchadorYo, R = this.luchadorRival;
    if (!Y || !R) return;

    const golpe = (atacante, victima, critico) => {
      this.embestir(atacante, () => {
        this.efectoGolpe(victima, critico);
        this.encajar(victima);
        this.cameras.main.shake(critico ? 220 : 130, critico ? 0.011 : 0.006);
        if (critico) this.destello(0.30, 140);
      });
    };

    // Los dos resuelven a la vez, pero se escalonan 180 ms para que se
    // distingan los dos golpes en vez de verse un amasijo.
    if (peguéYo) golpe(Y, R, !!extra.criticoRival);
    if (pegóRival) this.time.delayedCall(peguéYo ? 180 : 0, () => golpe(R, Y, !!extra.criticoYo));
  }

  onResize(gameSize) {
    const { width, height } = gameSize;
    this.ajustarFondo(width, height);
    if (this._flash) this._flash.setPosition(width / 2, height / 2).setSize(width, height);
    if (this._revisarOrientacion) this._revisarOrientacion();
  }

  update(ahora) {
    this.respirar(ahora);
  }

  // ---------------------------------------------------------------------------
  // SALIDA
  // ---------------------------------------------------------------------------
  volverAlMapa() {
    if (this._volviendo) return;
    this._volviendo = true;
    this.limpiar();
    this.scene.start(this.volverA, { desdeBatalla: true });
  }

  limpiar() {
    if (this._timerBusqueda) { this._timerBusqueda.remove(); this._timerBusqueda = null; }
    if (this._conexionTimeout) { this._conexionTimeout.remove(); this._conexionTimeout = null; }
    if (this._revealTimer) { this._revealTimer.remove(); this._revealTimer = null; }
    this.detenerTemporizador();
    if (this.el && this.el.floaters) this.el.floaters.textContent = '';
    if (this.el && this.el.reveal) this.el.reveal.classList.add('hidden');

    /* Los efectos que quedaran a medio volar se tiran a mano. Sus tweens
       tienen un onComplete que los destruye, pero al apagar la escena esos
       tweens no llegan a terminar y los sprites se quedarían colgados. */
    if (this._efectos) {
      this._efectos.slice().forEach((s) => { try { s.destroy(); } catch (e) {} });
      this._efectos.length = 0;
    }

    try {
      if (this.socket) {
        this._listeners.forEach(([ev, fn]) => this.socket.off(ev, fn));
        this._listeners = [];
        if (this.estado === 'buscando' && this.socket.connected) this.socket.emit('battle:leaveQueue');

        // Avisar SIEMPRE que se abandona la batalla, no solo si se estaba
        // buscando rival. El servidor guarda un candado por socket mientras
        // dura el combate; si se sale sin avisar, ese candado se quedaba puesto
        // y el siguiente intento respondía 'already_in_battle' — el jugador no
        // podía volver a entrar. (El servidor también lo suelta al
        // desconectar, esto es el aviso limpio y llega antes.)
        if (this.socket.connected) this.socket.emit('battle:leave');

        // Se deja el socket como lo deja la tienda al salir del mapa:
        // desconectado. Así GameScene.initSocket() crea uno nuevo con todos sus
        // manejadores globales (cleanupScene ya le hizo removeAllListeners).
        this.socket.removeAllListeners();
        this.socket.disconnect();
      }
    } catch (e) { /* sin ruido al salir */ }

    document.body.classList.remove('in-battle');
    if (this.ui) this.ui.classList.add('hidden');

    // La escena se apaga: el aviso de rotar no debe seguir vivo sobre el mapa.
    this._escenaViva = false;
    const aviso = document.getElementById('battleRotateNotice');
    if (aviso) aviso.classList.add('hidden');
    if (this._revisarOrientacion) {
      window.removeEventListener('resize', this._revisarOrientacion);
      window.removeEventListener('orientationchange', this._revisarOrientacion);
      // FIX FUGA: este también se registraba y no se quitaba.
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._revisarOrientacion);
      }
      this._revisarOrientacion = null;
    }
    this.scale.off('resize', this.onResize, this);
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
