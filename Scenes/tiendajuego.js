/*!
 * ============================================================================
 * Crassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 * 
 * GRASSLAND FOREST v13
 * Desarrollado y Publicado por: Jean Larreal
 * CONTACTO PARA PERMISOS:
 * Jean Larreal
 * Email: [killerhackcodeup@gmail.com]
 * Sitio Web: [grasslandforest.xyz]
 * 
 * VERSIÓN: v13.0.0-release
 * GENERADO: 22/03/2026
 * ============================================================================
 */


class tiendajuego extends Phaser.Scene {
    constructor() {
      super({ key: "tiendajuego" });


      this.playerName = null;
      this.currentAccount = null;
      this.statsSync = null; // StatsSync para sincronización con el contrato
      this._statsReady = false;

        this.address = null;
        this.csrfToken = null;
        this.isAuthenticated = false;

      this.perf = null; // Instancia de PhaserRPGPerf
      this.chunkObjectsMap = new Map();

      
      this._queue = [];
      this._processing = false;
      this._windowMs = 1000; // 1 segundo entre tandas
      this.lenguaje = 0;

      if (!this.notifications) {
        this.notifications = new NotificationHub({
          width: 350,
          animationDuration: 400,
          visibleDuration: 2000,
          maxNotifications: 10,
          spacing: 15,
          debug: true,
          autoCleanup: true
        });
      }

          // ====== EN EL CONSTRUCTOR ======
    this.dog = {
      sprite: null,
      shadowContainer: null,
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      prevX: 0,
      prevY: 0,
      prevTargetX: 0,
      prevTargetY: 0,
      smoothOffsetX: 0,
      smoothOffsetY: 20,
      lastFacing: 'right',
      desiredFacing: 'right',
      facingLockUntil: 0,
      isMoving: false
    };

              
    }






// Función para cargar SOLO los datos de misiones
async loadMissionsData() {
  try {
    console.log('📥 Cargando datos específicos de misiones...');
    
    // Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ No se pueden cargar datos de misiones: falta autenticación');
      return null;
    }
    
    // Asegurarnos de tener token CSRF
    if (!this.csrfToken) {
      await this.getCSRFToken();
      if (!this.csrfToken) {
        console.error('❌ No se pudo obtener token CSRF para cargar misiones');
        return null;
      }
    }
    
    // RUTA REAL: GET /api/missions/:playerName
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Añadir token CSRF si está disponible (aunque GET normalmente no lo requiere)
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    
    const res = await fetch(`${this.serverBase}/api/missions/${encodeURIComponent(this.playerName)}`, {
      method: 'GET',
      credentials: 'include',
      headers: headers
    });

    console.log('📊 Status de carga de datos de misiones:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No se pudo leer el error');
      console.error('❌ Error al cargar datos de misiones:', {
        status: res.status,
        error: errorText
      });
      
      // Si es error de autenticación, mostrar error hub
      if (res.status === 401 || res.status === 403) {
        console.warn('⚠️ Token expirado al cargar datos de misiones');
        this.showTokenErrorHub();
        return null;
      }
      
      throw new Error(`Error al cargar datos de misiones: ${res.status}`);
    }

    const missionsData = await res.json();
    console.log('✅ Datos de misiones cargados exitosamente');
    
    // Cargar todas las variables de misiones con valores por defecto si no existen
    this.misionesCompletadas = missionsData.misionesCompletadas || 0;
    this.misionesEnProgreso = missionsData.misionesEnProgreso || 0;
    this.misionesFallidas = missionsData.misionesFallidas || 0;
    this.misiones_granjero = missionsData.misiones_granjero || 0;
    this.estadomision = missionsData.estadomision || 0;
    this.misiones_guardian = missionsData.misiones_guardian || 0;
    this.estadomision1 = missionsData.estadomision1 || 0;
    
    // Actualizar la variable global misiones con la suma de completadas
    this.misiones = this.misionesCompletadas;

    // Mostrar todas las variables en console.log
    console.log('🎯 DATOS DE MISIONES CARGADOS (RUTA ESPECÍFICA):');
    console.log('📊 misionesCompletadas:', this.misionesCompletadas);
    console.log('⏳ misionesEnProgreso:', this.misionesEnProgreso);
    console.log('❌ misionesFallidas:', this.misionesFallidas);
    console.log('🎁 misiones_granjero:', this.misiones_granjero);
    console.log('⏰ misiones_guardian:', this.misiones_guardian);
    console.log('-----------------------------------');
    console.log('🎮 Variable global misiones actualizada:', this.misiones);

    return missionsData;
  } catch (error) {
    console.error('Error cargando datos de misiones:', error);
    return null;
  }
}


// Función para actualizar SOLO las misiones
async updateMissionsData(updateData) {
  try {
    console.log('🎯 Actualizando datos de misiones...');
    
    // Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ No se puede actualizar misiones: falta autenticación');
      return { success: false, error: 'No autenticado' };
    }
    
    // Asegurarnos de tener token CSRF
    if (!this.csrfToken) {
      await this.getCSRFToken();
      if (!this.csrfToken) {
        console.error('❌ No se pudo obtener token CSRF para actualizar misiones');
        return { success: false, error: 'Error CSRF' };
      }
    }
    
    // RUTA REAL: POST /api/missions/:playerName/update
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Añadir token CSRF si está disponible
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    
    const res = await fetch(`${this.serverBase}/api/missions/${encodeURIComponent(this.playerName)}/update`, {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify(updateData)
    });

    console.log('📊 Status de actualización de misiones:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No se pudo leer el error');
      console.error('❌ Error al actualizar misiones:', {
        status: res.status,
        error: errorText
      });
      
      // Si es error CSRF, intentar obtener nuevo token y reintentar
      if (res.status === 403 && errorText.includes('csrf')) {
        console.log('🔄 Error CSRF, obteniendo nuevo token...');
        await this.getCSRFToken();
        if (this.csrfToken) {
          headers['X-CSRF-Token'] = this.csrfToken;
          
          // Reintentar
          const retryRes = await fetch(`${this.serverBase}/api/missions/${encodeURIComponent(this.playerName)}/update`, {
            method: 'POST',
            credentials: 'include',
            headers: headers,
            body: JSON.stringify(updateData)
          });
          
          if (retryRes.ok) {
            const result = await retryRes.json();
            console.log('✅ Misiones actualizadas exitosamente después de reintento CSRF:', result.missionsData);
            return result;
          }
        }
      }
      
      // Verificar si es error de token expirado
      if (res.status === 401 || res.status === 403) {
        console.warn('⚠️ Token expirado o inválido para misiones');
        return { 
          success: false, 
          error: 'token_expired',
          message: 'Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.'
        };
      }
      
      throw new Error(`Error al actualizar misiones: ${errorText}`);
    }

    const result = await res.json();
    console.log('✅ Misiones actualizadas exitosamente:', result.missionsData);
    return result;
  } catch (error) {
    console.error('Error actualizando misiones:', error);
    return { 
      success: false, 
      error: error.message || 'Error desconocido al actualizar misiones' 
    };
  }
}







// Método para mostrar notificaciones
showNotification(message, type = 'info') {
  // Puedes usar tu sistema de notificaciones existente
  if (this.notifications) {
    this.notifications.show(message, type);
  } else {
    console.log(`📢 ${type}: ${message}`);
    
    // Crear notificación temporal si no hay sistema
    const notification = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 100,
      message,
      {
        fontFamily: '"PressStart2P"',
        fontSize: '14px',
        fill: type === 'error' ? '#ff5555' : type === 'success' ? '#55ff55' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center'
      }
    ).setOrigin(0.5).setDepth(1000);
    
    this.tweens.add({
      targets: notification,
      y: notification.y - 50,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => notification.destroy()
    });
  }
}

    

    async loadx() {
        console.log('🔍 Iniciando verificación de autenticación...');
        
        try {
            // Primero obtener token CSRF
            await this.getCSRFToken();
            
            // Luego verificar autenticación
            const response = await fetch(`${this.serverBase}/api/auth/me`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': this.csrfToken || ''
                }
            });

            console.log('📊 Response status de /api/auth/me:', response.status);
            
            if (!response.ok) {
                console.error('❌ Error de autenticación:', response.status);
                this.showTokenErrorHub();
                return false;
            }

            const data = await response.json();
            console.log('📥 Datos de autenticación:', data);

            if (data.authenticated && data.address) {
                this.isAuthenticated = true;
                this.address = data.address;
                this.playerName = data.playerName || data.address;
                
                console.log('✅ Usuario autenticado:', {
                    address: this.address.substring(0, 10) + '...',
                    playerName: this.playerName,
                    hasPlayerName: !!data.playerName
                });
                
                return true;
            } else {
                console.error('❌ Usuario no autenticado o sin address');
                this.showTokenErrorHub();
                return false;
            }
        } catch (error) {
            console.error('❌ Error en loadx:', error);
            this.showTokenErrorHub();
            return false;
        }
    }

  
    preload() {

    this.game.renderer.autoPipeline = true;
    this.game.renderer.config.pipeline = 'Mobile';
    
      
    this.perf = window.PhaserRPGPerf.create(this.game, {
      pixelArt: true,
      roundPixels: true,
      highPerformance: true,
      chunkSizeTiles: 16,
      chunkRadius: 1,
      debug: false // Solo en desarrollo
    });

    this.perf.init(this);

    this.perf.applyPixelPerfect({
        pixelArt: true,
        roundPixels: true,
        crispScaling: true,
        integerScaling: true
    });
    
    this.perf.enableHighPerformance();
    


        
      this.otherPlayers = {};
      this.load.image("player", "./Game/Sprites/derecha/run_1.png");
      this.myId = null;  // o ""

      // FIX: mismo bug que en LoadingScenegame.js/GameScene.js — "elipeticiones"
      // se fijaba a 0 y se comprobaba "=== 0" en el mismo bloque, así que esta
      // rama SIEMPRE se ejecutaba, también en producción.
      const _host = window.location.hostname;
      const _isLocal = _host === 'localhost' || _host === '127.0.0.1';

      if (_isLocal) {
        this.serverclient  = 'http://127.0.0.1:8080/api'; // ajusta el puerto si tu server2.js local usa otro
        this.serverclient1 = 'http://127.0.0.1:8080';
        this.serverBase    = 'http://127.0.0.1:8080';
      } else {
        this.serverclient  = 'https://api.grasslandforest.com/api';
        this.serverclient1 = 'https://api.grasslandforest.com';
        this.serverBase    = 'https://api.grasslandforest.com';
      }

      this.zoom = false;
      this.definirhorax = 0;


      // Cargar recursos
      this.textures.remove('tiles');

      if (this.textures.exists('tiles')) {
        this.textures.remove('tiles');
      }

      this.load.image('tiles', './Game/MAPAS/tiles2.png');
      this.load.image('tiles1', './Game/MAPAS/Tileset_Road.png');
      this.load.tilemapTiledJSON('tilemapx', './Maps/tienda_nueva.json');
  
      // Cargar Perfil
  
      this.load.image('imagen_Perfil', './Game/Sprites/Perfil/Perfil.png');
  
      // Cargar imágenes de cada dirección
  
      this.load.image('player_right_1', './Game/Sprites/derecha/run_1.png');
      this.load.image('player_right_2', './Game/Sprites/derecha/run_2.png');
      this.load.image('player_right_3', './Game/Sprites/derecha/run_3.png');
      this.load.image('player_right_4', './Game/Sprites/derecha/run_4.png');
      this.load.image('player_right_5', './Game/Sprites/derecha/run_5.png');
      this.load.image('player_right_6', './Game/Sprites/derecha/run_6.png');
      this.load.image('player_right_7', './Game/Sprites/derecha/run_7.png');
  
      this.load.image('player_left_1', './Game/Sprites/izquierda/run_1.png');
      this.load.image('player_left_2', './Game/Sprites/izquierda/run_2.png');
      this.load.image('player_left_3', './Game/Sprites/izquierda/run_3.png');
      this.load.image('player_left_4', './Game/Sprites/izquierda/run_4.png');
      this.load.image('player_left_5', './Game/Sprites/izquierda/run_5.png');
      this.load.image('player_left_6', './Game/Sprites/izquierda/run_6.png');
      this.load.image('player_left_7', './Game/Sprites/izquierda/run_7.png');

      
    this.load.image('player_up_1', './Game/Sprites/arriba/run_1.png');
    this.load.image('player_up_2', './Game/Sprites/arriba/run_2.png');
    this.load.image('player_up_3', './Game/Sprites/arriba/run_3.png');
    this.load.image('player_up_4', './Game/Sprites/arriba/run_4.png');
    this.load.image('player_up_5', './Game/Sprites/arriba/run_5.png');
    this.load.image('player_up_6', './Game/Sprites/arriba/run_6.png');
    this.load.image('player_up_7', './Game/Sprites/arriba/run_7.png');

    
    this.load.image('player_down_1', './Game/Sprites/abajo/run_1.png');
    this.load.image('player_down_2', './Game/Sprites/abajo/run_2.png');
    this.load.image('player_down_3', './Game/Sprites/abajo/run_3.png');
    this.load.image('player_down_4', './Game/Sprites/abajo/run_4.png');
    this.load.image('player_down_5', './Game/Sprites/abajo/run_5.png');
    this.load.image('player_down_6', './Game/Sprites/abajo/run_6.png');
    this.load.image('player_down_7', './Game/Sprites/abajo/run_7.png');
      
  
      // Recurso
  
      this.load.image('regadoraImagen', './Game/Source/recurso2.png');
      this.load.image('tijerasImagen', './Game/Source/tijeras.png');
      
      this.load.image('instrumento-pesca', './Game/Source/pesca-instrumento.png');

  
      // moneda

      this.load.image('monedaimg', './Game/Source/moneda.png');

      // chat
      
      this.load.image('chat', './Game/Source/chat.png');
  
      // mochila con letra I y con triangulo
      
      this.load.image('mochila', './Game/Source/Mochila.png');
      this.load.image('letrai', './Game/Source/tecla_i.png');


      // NPC

      this.load.image('NPCtiendas', './Game/Objetos/NPC/NPCtienda.png');

    
      
    //perro

    
    this.load.image('perro_derecha_1', './Game/Sprites/mascota/derecha/run_1.png');
    this.load.image('perro_derecha_2', './Game/Sprites/mascota/derecha/run_2.png');
    this.load.image('perro_derecha_3', './Game/Sprites/mascota/derecha/run_3.png');
    this.load.image('perro_derecha_4', './Game/Sprites/mascota/derecha/run_4.png');

    this.load.image('perro_izquierda_1', './Game/Sprites/mascota/izquierda/run_1.png');
    this.load.image('perro_izquierda_2', './Game/Sprites/mascota/izquierda/run_2.png');
    this.load.image('perro_izquierda_3', './Game/Sprites/mascota/izquierda/run_3.png');
    this.load.image('perro_izquierda_4', './Game/Sprites/mascota/izquierda/run_4.png');






      // nuevas texturas de mapa nuevo de la tienda


      
      this.load.image('planta_1', './Game/Objetos/planta_1.png');
      this.load.image('planta_2', './Game/Objetos/planta_2.png');
      this.load.image('planta_3', './Game/Objetos/planta_3.png');

      this.load.image('silla_1', './Game/Objetos/silla2.png');
      this.load.image('silla_2', './Game/Objetos/silla3.png');

      this.load.image('horno', './Game/Objetos/horno.png');
      this.load.image('bandera', './Game/Objetos/bandera1.png');
      this.load.image('cofre', './Game/Objetos/cofre.png');
      this.load.image('escoba', './Game/Objetos/escoba1.png');

      this.load.image('alfombra1', './Game/Objetos/alfombra1.png');
      this.load.image('alfombra2', './Game/Objetos/alfombra2.png');
      this.load.image('alfombra3', './Game/Objetos/alfombra3.png');
      this.load.image('alfombra4', './Game/Objetos/alfombra4.png');
      this.load.image('alfombra5', './Game/Objetos/alfombra5.png');
      this.load.image('alfombra6', './Game/Objetos/alfombra6.png');
      

      
      this.load.image('mesatienda1', './Game/Objetos/mesatienda1.png');
      this.load.image('mesatienda2', './Game/Objetos/mesatienda2.png');
      this.load.image('mesatienda3', './Game/Objetos/mesatienda3.png');
      this.load.image('mesatienda4', './Game/Objetos/mesatienda4.png');
      this.load.image('mesatienda5', './Game/Objetos/mesatienda5.png');
      this.load.image('mesatienda6', './Game/Objetos/mesatienda6.png');
      this.load.image('mesatienda7', './Game/Objetos/mesatienda7.png');
      this.load.image('mesatienda8', './Game/Objetos/mesatienda8.png');
      this.load.image('mesatienda9', './Game/Objetos/mesatienda9.png');
      this.load.image('mesatienda10', './Game/Objetos/mesatienda10.png');
      this.load.image('mesatienda11', './Game/Objetos/sillla1.png');


      this.load.image('estante1', './Game/Objetos/estante1bajo.png');
      this.load.image('estante2', './Game/Objetos/estante2bajo.png');
      this.load.image('estante3', './Game/Objetos/estante3bajo.png');
      this.load.image('estante4', './Game/Objetos/estante4bajo.png');
      this.load.image('estante5', './Game/Objetos/estantelado.png');


      
      this.load.image('barandilla1', './Game/Objetos/barandilla.png');
      this.load.image('barandilla2', './Game/Objetos/barandilla2.png');
      this.load.image('barandilla3', './Game/Objetos/barra1derecha.png');
      this.load.image('barandilla4', './Game/Objetos/barra1izq.png');
      this.load.image('barandilla5', './Game/Objetos/barra2derecha.png');
      this.load.image('barandilla6', './Game/Objetos/barra2izq.png');

      
    // musica 

    this.load.audio('main-theme1', './Game/MUSIC/tienda.ogg');
    
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');





  
      // si no existen los valores o argumentos del jugador se crean en la bd y si ya existen se leen automaticamente.
  
      this.player = this.physics.add.sprite(430, 432, 'playerTexture');
      this.player.setVisible(false);
      this.usuarioxx = "----";
      // Inicialización de objetos de texto
      this.textovida = this.add.text(20, 20, 'Vida 100%', {
        fontSize: '16px',
        fill: '#fff'
      }).setVisible(false);  // Hace el texto invisible;
  
      this.textoagua = this.add.text(20, 40, 'Agua 100%', {
        fontSize: '16px',
        fill: '#fff'
      }).setVisible(false);  // Hace el texto invisible;
  
      this.textocomida = this.add.text(20, 60, 'Comida 100%', {
        fontSize: '16px',
        fill: '#fff'
      }).setVisible(false);  // Hace el texto invisible;
  
      this.cofreAbierto = false;
      this.inventarioAbierto = false;


    }
  
    async create() {

    // ── Aplicar stats del contrato INMEDIATAMENTE al inicio ──────────────────
    if (window.playerStats) {
      if (typeof window.playerStats.oro    === 'number') this.moneda           = window.playerStats.oro;
      if (typeof window.playerStats.plata  === 'number') this.moneda_plata     = window.playerStats.plata;
      if (typeof window.playerStats.vida   === 'number') this.vidaPorcentaje   = window.playerStats.vida;
      if (typeof window.playerStats.agua   === 'number') this.aguaPorcentaje   = window.playerStats.agua;
      if (typeof window.playerStats.comida === 'number') this.comidaPorcentaje = window.playerStats.comida;
      console.log('💎 Stats aplicados al inicio de tiendajuego create():', {
        moneda: this.moneda, plata: this.moneda_plata,
        vida: this.vidaPorcentaje, agua: this.aguaPorcentaje, comida: this.comidaPorcentaje
      });
    }

    const isAuthenticated = await this.loadx();
        
    

    this.events.on('shutdown', this.shutdown, this);
    this.events.on('destroy', this.shutdown, this);


        if (!isAuthenticated) {
            console.error('❌ No se pudo autenticar al usuario');
            return;
        }

        // Verificar que tenemos playerName
        if (!this.playerName) {
            console.error('❌ No player name available');
            this.showTokenErrorHub();
            return;
        }

        this.currentAccount = this.playerName;
    

    /*
this.errorReporter = new PhaserErrorReporter(
    this, 
    `${this.serverclient1}/api/report-error`,
    [
        "External tilesets unsupported. Use Embed Tileset and re-export",
        "Image tile area not tile size multiple in: L:/descargas/arbusto.png",
        "No texture found matching key: tiles2",
        "Script error.",
        "safe(): TypeError: Cannot read properties of null (reading 'disconnect')",
    ]
);
    
*/
    
    if (this.loadMissionsData) await this.loadMissionsData();

    // ── Inicializar sincronización de stats con el contrato ──
    this._initStatsSync();

        
      this.phaser_ancho = this.scale.width;
      this.phaser_largo = this.scale.height;

      this.map = null;
      this.backgroundLayer = null;
        
      this.scene.stop('GameScene');
      this.scene.remove('GameScene');
      this.scene.add('GameScene', GameScene, false);
        


      // Cargar el tilemap y el conjunto de tiles
      this.map = this.make.tilemap({ key: 'tilemapx' });
      const tileset = this.map.addTilesetImage('Patron_tienda', 'tiles', 16, 16);
      this.backgroundLayer = this.map.createLayer('mapa_tiendax', tileset, 0, 0);
      this.textures.get('tiles').setFilter(Phaser.Textures.FilterMode.NEAREST);


      // En el método create, inicializa this.graphics
      this.graphics = this.add.graphics({ lineStyle: { width: 2, color: 0xff0000 }});


      // Configurar los límites del mundo
      this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  
      // Crear el personaje (Inicialmente con la imagen de correr hacia abajo)
      this.player = this.physics.add.sprite(this.posicionplayerx, this.posicionplayery, 'player_right_1');
      this.player.setScale(2);
      this.player.setCollideWorldBounds(true); // Evita que el jugador salga del mundo
  
      // dando z-index personaje
      this.player.setDepth(1);






// En la función create(), después de crear el jugador (línea ~750)
this.player.setInteractive({ useHandCursor: true });

// Evento para clickear al jugador con ítem seleccionado
this.player.on('pointerdown', (pointer) => {
    // Verificar si el clic fue en el canvas (área del juego)
    const canvas = this.sys.canvas;
    const isCanvasClick = pointer.event.target === canvas || 
                         pointer.event.target.tagName === 'container' ||
                         canvas.contains(pointer.event.target);
    
    if (!isCanvasClick) {
        console.log('Clic en DOM detectado - acción bloqueada');
        return;
    }

    // Verificar si hay un ítem seleccionado en el inventario
    if (this.STATE && this.STATE.selectedItem) {
        const selectedId = String(this.STATE.selectedItem.id || '').toLowerCase();
        
        // Si el ítem seleccionado es una zanahoria_buena o tomate_buena
        if (selectedId === 'zanahoria_buena' || selectedId === 'tomate_buena' || selectedId === 'balde_con_agua') {
            console.log('Comiste ' + selectedId);
            
            // Opcional: aquí podrías agregar lógica adicional
            // como eliminar el ítem del inventario, recuperar vida, etc.
            
            // Por ejemplo, si quieres eliminar el ítem después de comerlo:
            // this.removeSelectedItemFromInventory();
            
            // O recuperar un poco de comida:
            // this.actualizarBarraComida(this.comidaPorcentaje + 10);
            if (selectedId == "balde_con_agua") {

              const datar = this.aguaPorcentaje + 20;
                
              this.actualizarBarraAgua(datar);
              this.removeItemSmart('balde_con_agua', 1);
               this.queuedAction({ type: 'forSpam2'}); 
              
            }

            if (selectedId == "zanahoria_buena") {

              const datar = this.comidaPorcentaje + 2;
                
              
              this.actualizarBarraComida(datar);
              this.removeItemSmart('zanahoria_buena', 1);
               this.queuedAction({ type: 'forSpam2'}); 
              
            }

            
            if (selectedId == "tomate_buena") {

              const datar = this.comidaPorcentaje + 5;
                
              
              this.actualizarBarraComida(datar);
              this.removeItemSmart('tomate_buena', 1);
               this.queuedAction({ type: 'forSpam2'}); 
              
            }



        }
    }
});









      
      // Pone la pantalla negra desde el principio
      this.cameras.main.fadeOut(0, 0, 0, 0);

      // Configurar cámara
      
      // Configurar cámara
      this.cameras.main.setZoom(2);
      this.cameras.main.zoomTo(1, 2000);
      this.cameras.main.once('camerazoomcomplete', () => {

        // mostrando botones de reputacion y estadisticas y mas
        
        console.log('Zoom terminado después de 3 segundos');

        document.getElementById('game-hud').classList.remove('hud-hidden');
        document.getElementById('game-hud').classList.add('hud-visible');

        document.getElementById('info-text-left').textContent = `${this.moneda}`;
        document.getElementById('info-text-right').textContent = `${this.moneda_plata}`;


        document.getElementById('hub').classList.remove('hidden');
        document.getElementById('quick-slots-bar').classList.remove('hidden');
        document.getElementById('open-chat-btn').classList.remove('hidden');


        // mostrando casillas

        const slots = document.querySelectorAll('.quick-slot');
        slots.forEach(slot => {
          slot.style.display = 'block'; // o 'flex' si antes usabas flex
        });

        // mostrando bota y su contador
        //document.getElementById('quest-button').style.display = 'block';


        // mostrando hub de vida,agua y comida

        
        // mostrando hora y fecha



        this.actualizarImagenJugador('./Game/Sprites/Perfil/Perfil.png');

        this.actualizarNombreUsuario(`${this.currentAccount.slice(0, 6)}...${this.currentAccount.slice(-4)}`);
        this.actualizarBarraVida(this.vidaPorcentaje);
        this.actualizarBarraAgua(this.aguaPorcentaje);
        this.actualizarBarraComida(this.comidaPorcentaje);

        // mochila y letra i

        

        
        

        console.log('tienda create ejecutándose');



        // FIX: usar onclick en lugar de addEventListener para que no se acumulen
        // listeners al cambiar entre escenas (GameScene <-> tiendajuego)
        document.getElementById('inv-shortcut-btn').onclick = () => {
          const panel = document.getElementById('inventory-panel');
          panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        };
        // Actualizar la escena activa en tiendaSistema para que STATE apunte aquí
        if (window.tiendaSistema) {
          window.tiendaSistema.scene = this;
        }






        // coordenadas

        document.getElementById('game-ui-text').style.display = 'block';



      });
      this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
      this.cameras.main.setRoundPixels(true);

      // Coloca al jugador en su posición deseada antes de seguirlo
      this.player.setPosition(200, 300); // Cambiá por la posición inicial que quieras

      // Inicia el follow, pero la cámara está aún en negro
      this.cameras.main.startFollow(this.player, true, 0.05, 0.05);

      // Esperar a que la cámara termine de posicionarse (ajustá el delay si es muy rápido o lento)
      this.time.delayedCall(800, () => {
        // Ahora sí, mostrar el fade in
        this.cameras.main.fadeIn(2000, 0, 0, 0);
                
      });
      // Guarda referencias si las usás más tarde
      this.cam = this.cameras.main;
      this.cam_ancho = this.cam.width;
      this.cam_alto = this.cam.height;

      

        // 🔧 TU CONFIGURACIÓN ESPECÍFICA
        this.zoomConfig = {
            level: 2,      // Zoom inicial: 2x
            min: 1,      // Zoom mínimo: 0.5x
            max: 2,        // Zoom máximo: 2x  
            step: 1     // Paso de zoom: 0.25
        };

        // 🎯 VALORES EXACTOS PRE-DEFINIDOS (evita cálculos con decimales)
        this.zoomValues = [1.0, 2.0];
        this.currentZoomIndex = 2.0; // Empieza en 2.0 (índice 6)

        


        /*
        // 🔧 TU CONFIGURACIÓN ESPECÍFICA
        this.zoomConfig = {
            level: 2,      // Zoom inicial: 2x
            min: 0.5,      // Zoom mínimo: 0.5x
            max: 2,        // Zoom máximo: 2x  
            step: 0.5     // Paso de zoom: 0.25
        };

        // 🎯 VALORES EXACTOS PRE-DEFINIDOS (evita cálculos con decimales)
        this.zoomValues = [0.5, 1.0, 1.5 , 2.0];
        this.currentZoomIndex = 2.0; // Empieza en 2.0 (índice 6)
        */




        // Aplicar zoom inicial EXACTO
        this.cameras.main.zoom = this.zoomValues[this.currentZoomIndex];
        console.log(`🎮 Zoom forzado a: ${this.cameras.main.zoom}x`);

        // 🎯 VERIFICACIÓN INICIAL
        console.log("=== CONFIGURACIÓN DE ZOOM PRECISO ===");
        console.log(`📊 Zoom configurado: ${this.zoomValues[this.currentZoomIndex]}x`);
        console.log(`📊 Zoom real de cámara: ${this.cameras.main.zoom}x`);
        console.log(`🎯 Valores disponibles: [${this.zoomValues.join(', ')}]`);

        // 🖱️ CONTROL CON RUEDA DEL MOUSE - USANDO VALORES EXACTOS
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            console.log("✅ Rueda - DeltaY:", deltaY);
            
            if (deltaY > 0) {
                // Scroll HACIA ABAJO - Alejar (zoom out)
                this.preciseZoomOut();
            } else {
                // Scroll HACIA ARRIBA - Acercar (zoom in)
                this.preciseZoomIn();
            }
        });



    // boton personaje
    const boton3 = this.add.image(685, 1435, 'NPCtiendas')
        .setInteractive()
        .setDepth(0)
        .setDisplaySize(38, 90);

        // boton personaje
    const boton4 = this.add.image(775, 650, 'NPCtiendas')
        .setInteractive()
        .setDepth(0)
        .setDisplaySize(38, 90);
    // Crear el panel, pero oculto al inicio





















      
    const imageMapping = {
      planta_1: {
        spriteKey: 'planta_2',
        targetProp: 'planta_1x'          
      },      
      planta_2: {
        spriteKey: 'planta_2',
        targetProp: 'planta_2x'          
      },
      planta_3: {
        spriteKey: 'planta_2',
        targetProp: 'planta_3x'          
      },
        planta_flor1: {
        spriteKey: 'planta_3',
        targetProp: 'planta_4x'          
      },
        planta_flor2: {
        spriteKey: 'planta_3',
        targetProp: 'planta_5x'          
      },
        planta_cactus: {
        spriteKey: 'planta_1',
        targetProp: 'planta_6x'          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'plantas', imageMapping);



      
    const imageMapping1 = {
      silla1: {
        spriteKey: 'silla_1',
        targetProp: 'silla1x'          
      },      
      silla2: {
        spriteKey: 'silla_1',
        targetProp: 'silla2x'          
      },
      silla3: {
        spriteKey: 'silla_1',
        targetProp: 'silla3x'          
      },
      silla4: {
        spriteKey: 'silla_1',
        targetProp: 'silla4x'          
      },
        sillax1: {
        spriteKey: 'silla_2',
        targetProp: 'sillaxx1'          
      },
        sillax2: {
        spriteKey: 'silla_2',
        targetProp: 'sillexx2'          
      },
        sillax3: {
        spriteKey: 'silla_2',
        targetProp: 'sillaxx3'          
      },
        sillax4: {
        spriteKey: 'silla_2',
        targetProp: 'sillaxx4'          
      },
        horno: {
        spriteKey: 'horno',
        targetProp: 'hornox'          
      },
        horno2: {
        spriteKey: 'horno',
        targetProp: 'horno2x'          
      },
        bandera1: {
        spriteKey: 'bandera',
        targetProp: 'bandera1x'          
      },
        bandera2: {
        spriteKey: 'bandera',
        targetProp: 'bandera2x'          
      },
        bandera3: {
        spriteKey: 'bandera',
        targetProp: 'bandera3x'          
      },
        cofre: {
        spriteKey: 'cofre',
        targetProp: 'cofrex'          
      },
        escoba: {
        spriteKey: 'escoba',
        targetProp: 'escobax'          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'objetos_ect', imageMapping1);


      
    const imageMapping2 = {
      alfombraxroja1: {
        spriteKey: 'alfombra6',
        targetProp: 'alfombraxroja1x'          
      },      
      alfombraxxroja1: {
        spriteKey: 'alfombra5',
        targetProp: 'alfombraxxroja1x'          
      },
      alfombramorada1: {
        spriteKey: 'alfombra4',
        targetProp: 'alfombramorada1x'          
      },
      alfombravip1: {
        spriteKey: 'alfombra3',
        targetProp: 'alfombravip1x'          
      },
        alfombraentrada1: {
        spriteKey: 'alfombra2',
        targetProp: 'alfombraentrada1x'          
      },
        alfombraverde1: {
        spriteKey: 'alfombra1',
        targetProp: 'alfombraverde1x'          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'alfombras', imageMapping2, 'floor');


    
    const imageMapping3 = {
      mesapocion1: {
        spriteKey: 'mesatienda2',
        targetProp: 'mesaposion1x'          
      },      
      mesapocionx1: {
        spriteKey: 'mesatienda3',
        targetProp: 'mesaposionx1x'          
      },
      mesapocionx2: {
        spriteKey: 'mesatienda3',
        targetProp: 'mesaposionx2x'          
      },
      mesacomidax1: {
        spriteKey: 'mesatienda6',
        targetProp: 'mesacomidax1x'          
      },
        mesacomida1: {
        spriteKey: 'mesatienda7',
        targetProp: 'mesacomida1x'          
      },
        mesacomedor1: {
        spriteKey: 'mesatienda8',
        targetProp: 'mesacomedor1x'          
      },
        mesacomedor2: {
        spriteKey: 'mesatienda8',
        targetProp: 'mesacomedor2x'          
      },
        gabetaespada1: {
        spriteKey: 'mesatienda10',
        targetProp: 'gabetaespada1x'          
      },
        gabetalibro1: {
        spriteKey: 'mesatienda9',
        targetProp: 'gabetalibro1x'          
      },
        tiendamodara1: {
        spriteKey: 'mesatienda5',
        targetProp: 'tiendamorada1x'          
      },
        tiendavip1: {
        spriteKey: 'mesatienda4',
        targetProp: 'tiendavip1x'          
      },
        tiendaverde1: {
        spriteKey: 'mesatienda1',
        targetProp: 'tiendaverde1x'          
      },
        sillla1: {
        spriteKey: 'mesatienda11',
        targetProp: 'sillla1x'          
      },
        sillla2: {
        spriteKey: 'mesatienda11',
        targetProp: 'sillla2x'          
      },
        sillla3: {
        spriteKey: 'mesatienda11',
        targetProp: 'sillla3x'          
      },
        sillla4: {
        spriteKey: 'mesatienda11',
        targetProp: 'sillla4x'          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'mesas', imageMapping3);


    
    const imageMapping4 = {
      estantelado1: {
        spriteKey: 'estante5',
        targetProp: 'estantelado1x'          
      },      
      estantelado2: {
        spriteKey: 'estante5',
        targetProp: 'estantelado2x'          
      },
      estantelado3: {
        spriteKey: 'estante5',
        targetProp: 'estantelado3x'          
      },
      estante_espada1: {
        spriteKey: 'estante4',
        targetProp: 'estante_espada1x'          
      },
        estante_planta1: {
        spriteKey: 'estante3',
        targetProp: 'estante_planta1x'          
      },
        estantebajo1: {
        spriteKey: 'estante2',
        targetProp: 'estantebajo1x'          
      },
        estantebajox1: {
        spriteKey: 'estante1',
        targetProp: 'estantebajox1x'          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'estante', imageMapping4);


    
    
    const imageMapping5 = {
      barraizqx1: {
        spriteKey: 'barandilla6',
        targetProp: 'barraizqx1x'          
      },      
      barraizq1: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq1x'          
      },
      barraizq2: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq2x'          
      },
      barraizq3: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq3x'          
      },
        barraizq4: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq4x'          
      },
        barraizq5: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq5x'          
      },
        barraizq6: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq6x'          
      },
        barraizq7: {
        spriteKey: 'barandilla4',
        targetProp: 'barraizq7x'          
      },
        barandillax1: {
        spriteKey: 'barandilla1',
        targetProp: 'barandillax1x'          
      },
        barandillax2: {
        spriteKey: 'barandilla1',
        targetProp: 'barandillax2x'          
      },
        barandilla1: {
        spriteKey: 'barandilla2',
        targetProp: 'barandilla1x'          
      },
        barraderecha1: {
        spriteKey: 'barandilla3',
        targetProp: 'barraderecha1x'          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'barandilla', imageMapping5);


      // rectangulo de puerta de salida

      const objectLayerf1 = this.map.getObjectLayer('puerta');
      this.collisionRectangles1 = [];
  
      // Recorre cada objeto de la capa y lo convierte en un rectángulo para colisión.
      objectLayerf1.objects.forEach(obj => {
        let rect1 = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
        this.collisionRectangles1.push(rect1);
  
        // Opcional: dibuja los rectángulos de colisión (en verde semitransparente) para depuración.
        /*
        let debugGraphics = this.add.graphics();
        debugGraphics.fillStyle(0x00ff00, 0.3);
        debugGraphics.fillRectShape(rect);
        */
      });

            // rectangulo de puerta de salida 

      const objectLayerf2 = this.map.getObjectLayer('colisiones');
      this.collisionRectangles2 = [];
  
      // Recorre cada objeto de la capa y lo convierte en un rectángulo para colisión.
      objectLayerf2.objects.forEach(obj => {
        let rect2 = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
        this.collisionRectangles2.push(rect2);
  
        // Opcional: dibuja los rectángulos de colisión (en verde semitransparente) para depuración.
        /*
        let debugGraphics = this.add.graphics();
        debugGraphics.fillStyle(0x00ff00, 0.3);
        debugGraphics.fillRectShape(rect);
        */
      });

      



    // nombre de usuario

      // Crear texto en el centro de la pantalla
      this.usuariox = this.add.text(400, 300, '---', {
        fontFamily: '"PressStart2P"',
        fontSize: '12px',
        color: '#ffffff',
        resolution: 4,
        stroke: "#000",
        strokeThickness: 3,
      });
      this.usuariox.setOrigin(0.5);          // Centrar el texto
      //this.usuariox.setScrollFactor(0);      // Fijar a la cámara
      this.usuariox.setDepth(1);

      // creando nombre para npc 

      const textStyle = {
        fontFamily: '"PressStart2P"',
        fontSize: '14px', // Ligeramente más grande para mejor legibilidad
        color: '#ffffff',
        resolution: 2, // Reducido para mejor rendimiento
        stroke: "#000000ff",
        strokeThickness: 4, // Borde más definido
        shadow: {
            offsetX: 2,
            offsetY: 2,
            color: '#000000ff',
            blur: 2,
            stroke: true,
            fill: true
        },
        padding: {
            x: 8,
            y: 4
        },
        backgroundColor: '#130781a2', // Fondo semitransparente
        align: 'center'
    };

        
    this.npcx = this.add.text(685, 1370, 'Johnny Johnson', textStyle);
    this.npcx.setOrigin(0.5);
    this.npcx.setDepth(9);

    this.npcx1 = this.add.text(770, 580, 'Franklin Vesh', textStyle);
    this.npcx1.setOrigin(0.5);
    this.npcx1.setDepth(9);




      // barra de energia

      this.progress = 1;           // Valor actual de la barra (1 = 100%)
      this.maxWidth = 300;       // Ancho total de la barra
      this.barHeight = 10;       // Altura de la barra
      this.barX = this.phaser_ancho / 2 - 145;           // Posición X de la barra
      this.barY = this.phaser_largo - 75;            // Posición Y de la barra


      //this.keyZ;                   // Referencia a la tecla "Z"


      // Crear la referencia para la tecla "Z"
      //this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);

      this.keys = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
        rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
        downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN
      });

  
  this.anims.create({
    key: 'perro_left',
    frames: [
        { key: 'perro_izquierda_1' },
        { key: 'perro_izquierda_2' },
        { key: 'perro_izquierda_3' },
        { key: 'perro_izquierda_4' }
    ],
    frameRate: 6,
    repeat: -1
});

this.anims.create({
    key: 'perro_right',
    frames: [
        { key: 'perro_derecha_1' },
        { key: 'perro_derecha_2' },
        { key: 'perro_derecha_3' },
        { key: 'perro_derecha_4' }
    ],
    frameRate: 6,
    repeat: -1
});

  
  
      // Configurar animaciones

      if (!this.anims.exists('right')) {
        this.anims.create({
          key: 'right',
          frames: [
            { key: 'player_right_1' },
            { key: 'player_right_2' },
            { key: 'player_right_3' },
            { key: 'player_right_4' },
            { key: 'player_right_5' },
            { key: 'player_right_6' },
            { key: 'player_right_7' }
          ],
          frameRate: 11,
          repeat: -1
        });
      }
      
      if (!this.anims.exists('left')) {
        this.anims.create({
          key: 'left',
          frames: [
            { key: 'player_left_1' },
            { key: 'player_left_2' },
            { key: 'player_left_3' },
            { key: 'player_left_4' },
            { key: 'player_left_5' },
            { key: 'player_left_6' },
            { key: 'player_left_7' }
          ],
          frameRate: 11,
          repeat: -1
        });
      }

            
      if (!this.anims.exists('up')) {
        this.anims.create({
          key: 'up',
          frames: [
            { key: 'player_up_1' },
            { key: 'player_up_2' },
            { key: 'player_up_3' },
            { key: 'player_up_4' },
            { key: 'player_up_5' },
            { key: 'player_up_6' },
            { key: 'player_up_7' },
          ],
          frameRate: 9,
          repeat: -1
        });
      }

            
      if (!this.anims.exists('down')) {
        this.anims.create({
          key: 'down',
          frames: [
            { key: 'player_down_1' },
            { key: 'player_down_2' },
            { key: 'player_down_3' },
            { key: 'player_down_4' },
            { key: 'player_down_5' },
            { key: 'player_down_6' },
            { key: 'player_down_7' },
          ],
          frameRate: 9,
          repeat: -1
        });
      }


      

(function initHubPanel(){
  const panel = document.getElementById('hub-panel_101');
  const applyBtn = document.getElementById('apply-name');
  const closePanelBtn = document.getElementById('close-panel');
  const logoutBtn = document.getElementById('logout-btn');
  const nameInput = document.getElementById('character-name');
  const langSelect = document.getElementById('language-select');

  // Si el DOM del dashboard todavía no está montado, ANTES esto reventaba en la
  // línea siguiente (nameInput.setAttribute sobre null): el panel se quedaba
  // sin cablear y el jugador nunca podía fijar su nombre. Ahora se reintenta.
  if (!panel || !applyBtn || !closePanelBtn || !logoutBtn || !nameInput || !langSelect) {
    window.__hubPanelTries = (window.__hubPanelTries || 0) + 1;
    console.warn(`⚠️ Dashboard aún no disponible para hubPanel (intento ${window.__hubPanelTries})`);
    if (window.__hubPanelTries <= 20) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHubPanel, { once: true });
      } else {
        setTimeout(initHubPanel, 500);
      }
    }
    return;
  }
  window.__hubPanelTries = 0;

  // Limitar por HTML (UX)
  nameInput.setAttribute('maxlength', '10');

  let phaserScene = null;
  let options = {
    pauseSceneOnOpen: false,
    onApplyName: null,
    onLogout: null,
    onLanguageChange: null
  };

  function applyActtov(){
    // Comprueba window._acttov; si no existe, lo inicializa a 0
    if(typeof window._acttov === 'undefined') window._acttov = 0;
    const v = Number(window._acttov) || 0;
    if(v === 1){
      nameInput.setAttribute('disabled','disabled');
      applyBtn.setAttribute('disabled','disabled');
      nameInput.classList.add('muted');
    } else {
      nameInput.removeAttribute('disabled');
      applyBtn.removeAttribute('disabled');
      nameInput.classList.remove('muted');
    }
  }

  function showPanel(){
    panel.classList.add('visible');
    panel.setAttribute('aria-hidden','false');
    if(phaserScene && options.pauseSceneOnOpen){
      try{ phaserScene.scene.pause(phaserScene.scene.key); }catch(e){ /* no crítico si falla */ }
    }
  }
  function hidePanel(){
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden','true');
    if(phaserScene && options.pauseSceneOnOpen){
      try{ phaserScene.scene.resume(phaserScene.scene.key); }catch(e){ /* no crítico si falla */ }
    }
  }
  function togglePanel(){
    if(panel.classList.contains('visible')) hidePanel();
    else showPanel();
  }

  // Exponer API en window.hubPanel para que Phaser pueda interactuar
  window.hubPanel = {
    init(scene, opts){
      phaserScene = scene || null;
      options = Object.assign(options, opts || {});

      // Aplicar estado inicial según window._acttov
      applyActtov();

      return window.hubPanel;
    },
    show: showPanel,
    hide: hidePanel,
    toggle: togglePanel,
    setOption(k,v){ options[k]=v; },
    getOptions(){ return Object.assign({}, options); },
    setActtov(val){
      // Guarda también en window._acttov para que otras partes del código puedan leerlo
      window._acttov = Number(val) || 0;
      applyActtov();
    },
    isVisible: ()=> panel.classList.contains('visible')
  };

  // Exponer referencias DOM por si el código externo (ej. tu escena Phaser) las necesita
  // Recomendado: usa window.hubPanel.show()/hide() en vez de manipular botones directamente.
  window.hubPanel.dom = {
    closePanelBtn: null,
    applyBtn: null,
    logoutBtn: null,
    nameInput: null,
    langSelect: null
  };

  /* -----------------------
     Sanitización y límites
     ----------------------- */

  // Función de sanitización: permite solo letras (unicode), elimina tags y recorta a 10 chars.
  function sanitizeName(raw) {
    if (!raw) return '';
    // normalizar compuestos (ñ, acentos)
    let s = String(raw).normalize('NFC').trim();

    // eliminar etiquetas HTML (por si alguien intenta inyectar "<script>...")
    s = s.replace(/<[^>]*>/g, '');

    // intentar usar Unicode property \p{L} (letras)
    try {
      // mantiene SOLO letras unicode (incluye acentos, ñ, caracteres no latinos)
      s = s.replace(/[^\p{L}]/gu, '');
    } catch (e) {
      // fallback: permitir letras latinas y acentos comunes y ñ (no cubre TODO unicode)
      s = s.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]/g, '');
    }

    // recortar a 10 caracteres
    return s.slice(0, 10);
  }

  // Evitar que al escribir se inserten caracteres no permitidos y forzar maxlength
  nameInput.addEventListener('input', (e) => {
    const clean = sanitizeName(e.target.value);
    if (e.target.value !== clean) {
      // reemplaza el valor (esto evita caracteres inválidos en tiempo real)
      e.target.value = clean;
    }
    // (maxlength ya impide >10, pero nos aseguramos)
    if (e.target.value.length > 10) e.target.value = e.target.value.slice(0, 10);
  });

  // Sanitizar pegado (paste) para prevenir inyección por paste
  nameInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const clean = sanitizeName(text);
    // insertar manualmente en la posición del cursor
    const start = nameInput.selectionStart || 0;
    const end = nameInput.selectionEnd || 0;
    const newVal = (nameInput.value.slice(0, start) + clean + nameInput.value.slice(end)).slice(0, 10);
    nameInput.value = newVal;
    // colocar cursor justo después del texto pegado
    const newPos = Math.min(10, start + clean.length);
    nameInput.setSelectionRange(newPos, newPos);
  });

  /* -----------------------
     Helpers Phaser
     ----------------------- */

  // Helper: intenta resolver la escena Phaser de forma segura
  function resolvePhaserScene() {
    // 1) usa phaserScene si ya fue inicializada
    if (phaserScene) return phaserScene;

    // 2) intentar resolver desde window.game (Phaser 3)
    try {
      const g = window.game || (window.Phaser && window.Phaser.GAMES ? window.Phaser.GAMES[0] : null);
      if (g && g.scene) {
        // getScenes(true) devuelve escenas activas; preferimos la primera activa
        if (typeof g.scene.getScenes === 'function') {
          const activeScenes = g.scene.getScenes(true);
          if (activeScenes && activeScenes.length) {
            phaserScene = activeScenes[0];
            return phaserScene;
          }
        }
        // fallback: si conoces la key, podrías usar g.scene.get('MySceneKey')
      }
    } catch (err) {
      // no crítico
    }

    // 3) como último recurso, intenta buscar en window.game.scene.keys (objeto de escenas por key)
    try {
      const g2 = window.game;
      if (g2 && g2.scene && g2.scene.keys) {
        const keys = Object.keys(g2.scene.keys);
        if (keys.length) {
          phaserScene = g2.scene.keys[keys[0]]; // primera escena registrada
          return phaserScene;
        }
      }
    } catch (err) {}

    // 4) no se encontró
    return null;
  }

  
  function clearNameInput() {
    nameInput.value = '';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput.blur();
  }

  /* -----------------------
     Event handlers (botones)
     ----------------------- */

  // Botones
  //
  // FIX (en la tienda no se podía fijar el nombre): la condición estaba al
  // revés. El código solo aplicaba el nombre si `name === "---"`, cosa
  // IMPOSIBLE porque sanitizeName() borra todo lo que no sea letra (el '-' se
  // va), así que SIEMPRE caía en el else: "usted no puede cambiar el nombre",
  // bloqueaba el input con setActtov(1) y lo vaciaba. Además, cuando el nombre
  // salía vacío del saneado, el único aviso era un console.log, así que el
  // botón parecía roto. Ahora aplica de verdad, con la misma regla de "una
  // sola vez" y con avisos visibles.
  applyBtn.addEventListener('click', ()=>{
    if(nameInput.hasAttribute('disabled') || nameInput.disabled) return;

    const scene = phaserScene || resolvePhaserScene();
    const notify = (msg, tipo) => {
      try { scene && scene.notifications && scene.notifications.show(msg, tipo); } catch(e) {}
      const hint = document.getElementById('character-name-hint');
      if (hint && tipo === 'error') hint.textContent = `⚠️ ${msg}`;
    };

    // Regla de nombre único: si ya está fijado, no se admiten cambios
    const actual = scene && typeof scene.Username === 'string' ? scene.Username : '';
    if (actual.trim() !== '' && actual !== '---') {
      window.hubPanel.setActtov(1);
      notify('Your character name is already set and cannot be changed.', 'error');
      return;
    }

    const rawName = nameInput.value;             // valor tal cual del input
    const name = sanitizeName(rawName);         // valor limpio y seguro

    if (name === "" || name === "---") {
      notify(
        String(rawName || '').trim() === ''
          ? 'Write a name first.'
          : 'Only letters are allowed in the name (no numbers, spaces or symbols).',
        'error'
      );
      console.log("No has puesto un nombre válido:", rawName);
      return;
    }

    // Confirmación: el cambio es definitivo (si el navegador tiene los
    // diálogos bloqueados, confirm() devuelve false sin preguntar; en ese caso
    // se continúa en vez de abandonar en silencio).
    let ok = true;
    if (typeof window.confirm === 'function') {
      try {
        ok = window.confirm(`¿Fijar el nombre de personaje como "${name}"?\n\nEsta decisión es DEFINITIVA: no podrás cambiarlo después.`);
      } catch (e) { ok = true; }
    }
    if (!ok) return;

    // Avisar al handler compartido del dashboard (el que cableó GameScene sobre
    // el mismo botón) de que este clic ya está atendido, para no pedir DOS
    // confirmaciones seguidas.
    window.__nameApplyHandledAt = Date.now();

    console.log('Nombre aplicado (definitivo):', name);

    if (scene) {
      try {
        scene.Username = name;
        if (typeof scene.actualizarNombreUsuario1 === 'function') scene.actualizarNombreUsuario1(name);
        else if (typeof scene.queuedAction === 'function') scene.queuedAction({ type: 'forSpam2' });
      } catch (err) {
        console.warn('No se pudo asignar/guardar Username en la escena:', err);
      }
    } else {
      console.warn('phaserScene no está inicializada; se usará onApplyName si existe.');
    }

    window.hubPanel.setActtov(1); // queda bloqueado: ya está fijado
    notify(`✅ Name set: ${name}`, 'success');

    // también notificar callback (si aplica)
    if(typeof options.onApplyName === 'function'){
      try{ options.onApplyName(name); }catch(e){ console.warn('onApplyName callback error',e); }
    }
  });


  closePanelBtn.addEventListener('click', ()=>{
    hidePanel();
  });

  // Logout
  logoutBtn.addEventListener('click', ()=>{
    console.log('cerrando session');
    if(typeof options.onLogout === 'function'){
      try{ options.onLogout(); }catch(e){ console.warn('onLogout callback error',e); }
    }
  });

  // Lenguaje: 1 => inglés, 2 => español
  langSelect.addEventListener('change', ()=>{
    const v = langSelect.value;
    if(v === 'en'){
      console.log(1);
      if(typeof options.onLanguageChange === 'function') options.onLanguageChange(1);
    }
    else if(v === 'es'){
      console.log(2);
      if(typeof options.onLanguageChange === 'function') options.onLanguageChange(2);
    }
  });

  // Evitar conflictos con la entrada de teclado de la escena Phaser cuando el input está enfocado
  nameInput.addEventListener('focus', ()=>{
    // Deshabilitar captura global del teclado en la escena (si existe)
    if(phaserScene && phaserScene.input && phaserScene.input.keyboard){
      try{ phaserScene.input.keyboard.enabled = false; }catch(e){ /* no crítico */ }
    }
  });
  nameInput.addEventListener('blur', ()=>{
    if(phaserScene && phaserScene.input && phaserScene.input.keyboard){
      try{ phaserScene.input.keyboard.enabled = true; }catch(e){ /* no crítico */ }
    }
  });

  // También detener propagación de eventos de teclado cuando se escribe dentro del input
  ['keydown','keyup','keypress'].forEach(evtName=>{
    nameInput.addEventListener(evtName, e=>{
      e.stopPropagation();
    });
  });

  // Para integración sencilla con Phaser: desde tu escena puedes llamar, por ejemplo:
  // window.hubPanel.init(this, { pauseSceneOnOpen: false });
  // window.hubPanel.setActtov(1); // desactiva input

  // Si existe ya window._acttov cuando se carga este script, aplicarlo de inmediato
  // Asignar referencias DOM externamente accesibles (para compatibilidad con código que esperaba variables globales)
  try{
    window.hubPanel.dom.closePanelBtn = closePanelBtn;
    window.hubPanel.dom.applyBtn = applyBtn;
    window.hubPanel.dom.logoutBtn = logoutBtn;
    window.hubPanel.dom.nameInput = nameInput;
    window.hubPanel.dom.langSelect = langSelect;
  }catch(e){/* no crítico */}

  if(typeof window._acttov !== 'undefined') applyActtov();

  // Tecla Esc para cerrar (útil cuando el panel está sobre el juego)
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') hidePanel();
  });

})(); // end IIFE

// Nota: llama window.hubPanel.init(this) desde create() de tu escena Phaser:
// ejemplo:
// create(){
//   window.hubPanel.init(this, { onApplyName: (name) => { this.Username = name; } });
// }


      window.hubPanel.init(this)

      

  if (this.Username !== "---") {
    window.hubPanel.setActtov(1);
    
  }


      
  
  
      // Configurar controles de movimiento
      //this.cursors = this.input.keyboard.createCursorKeys();
  
      // Crear colisiones en las esquinas del mapa
      this.corners = this.physics.add.staticGroup();
  
      const cornerSize = 64; // Tamaño del área de colisión (ajustar según sea necesario)
  
      // Esquina superior izquierda
      this.corners.create(cornerSize / 2, cornerSize / 2, null).setSize(cornerSize, cornerSize).setVisible(false);
  
      // Esquina superior derecha
      this.corners.create(this.map.widthInPixels - cornerSize / 2, cornerSize / 2, null)
        .setSize(cornerSize, cornerSize).setVisible(false);
  
      // Esquina inferior izquierda
      this.corners.create(cornerSize / 2, this.map.heightInPixels - cornerSize / 2, null)
        .setSize(cornerSize, cornerSize).setVisible(false);
  
      // Esquina inferior derecha
      this.corners.create(this.map.widthInPixels - cornerSize / 2, this.map.heightInPixels - cornerSize / 2, null)
        .setSize(cornerSize, cornerSize).setVisible(false);
  
      // Habilitar colisión entre el jugador y las esquinas
      this.physics.add.collider(this.player, this.corners);
  
      this.izquierdaani = false;
      this.derechaani = false;
      this.abajoani = false;
      this.arribaani = false;
  


  


    this.onInnerBtnClick = (e) => {
        console.log("clicked");

        const roundButtons = document.querySelector('.round-buttons');
        const hideBadge = document.querySelector('.inner-btn .quests-label');

        if (roundButtons && hideBadge) {

            const isHidden = roundButtons.classList.toggle('hidden');
            hideBadge.textContent = isHidden ? 'Show' : 'Hide';

            const innerBtn = document.querySelector('.inner-btn');
            innerBtn.style.transform = 'scale(0.95)';

            setTimeout(() => {
                innerBtn.style.transform = '';
            }, 150);

            console.log("Round buttons are now:", isHidden ? "hidden" : "visible");

            e.stopPropagation();
        }
    };

    this.innerBtn = document.querySelector('.inner-btn');

    if (this.innerBtn) {
        this.innerBtn.addEventListener('click', this.onInnerBtnClick);
    }


  // ===============================
    // BOTONES REDONDOS (DOM)
    // ===============================

    this.roundButtons = document.querySelectorAll('.round-btn');

    // ── NOTIFICATION SYSTEM ──────────────────────────────────────────────
    this._notifBadge = document.getElementById('mail-notif-badge');
    this._notifList  = [];
    this._notifPanel = document.getElementById('notif-panel');
    this._loadNotifications();

    // Wire notif panel buttons (shared DOM with GameScene)
    const _notifCloseBtn = document.getElementById('notif-close');
    if (_notifCloseBtn && !_notifCloseBtn._tiendaWired) {
      _notifCloseBtn._tiendaWired = true;
      _notifCloseBtn.addEventListener('click', () => this._closeNotifPanel());
    }
    const _notifMarkAll = document.getElementById('notif-mark-all-read');
    if (_notifMarkAll && !_notifMarkAll._tiendaWired) {
      _notifMarkAll._tiendaWired = true;
      _notifMarkAll.addEventListener('click', () => this._markAllNotifRead());
    }
    const _notifClearAll = document.getElementById('notif-clear-all');
    if (_notifClearAll && !_notifClearAll._tiendaWired) {
      _notifClearAll._tiendaWired = true;
      _notifClearAll.addEventListener('click', () => this._clearAllNotif());
    }

    // ---------- BOTÓN 0 (Dashboard)
    this.onRoundBtnDashboard = () => {
        console.log("dashboard clicked");

        // Refrescar el estado de bloqueo de los nombres (regla "una sola vez")
        // antes de abrir. El nombre de personaje lo bloquea el hubPanel vía
        // window._acttov; aquí se refleja además el de la mascota.
        const petVal = this.petName || window.globalPetName || '---';
        const petLocked = typeof petVal === 'string' && petVal.trim() !== '' && petVal !== '---';
        const petInput = document.getElementById('pet-name');
        const petBtn = document.getElementById('apply-pet-name');
        const petHint = document.getElementById('pet-name-hint');
        if (petInput) { petInput.disabled = petLocked; petInput.value = petLocked ? petVal : ''; }
        if (petBtn) petBtn.disabled = petLocked;
        if (petHint) {
            petHint.textContent = petLocked
                ? `🔒 Nombre de mascota fijado: "${petVal}" — definitivo`
                : '⚠️ Solo puedes elegirlo UNA vez — piénsalo bien.';
            petHint.classList.toggle('dash-hint-locked_101', petLocked);
        }
        const nameInput = document.getElementById('character-name');
        if (nameInput && window._acttov === 1) nameInput.value = this.Username || '';

        window.hubPanel.show();
    };

    // ---------- BOTÓN 1 (Mail)
    this.onRoundBtnMail = () => {
        console.log("Mail clicked");
        this._openNotifPanel();
    };

    // ---------- BOTÓN 2 (musica)
    if (this.sound && typeof this.sound.add === 'function') {
      this.initAudioSystem();
      this.playMusic('main-theme1');
    } else {
      console.warn('⚠️ Sistema de sonido no disponible, omitiendo inicialización');
    }

    this.onRoundBtnStats = () => {
      console.log("control clicked");

        this.showSoundHub();

    };

    /*
    // ---------- BOTÓN 3 (Reputación)
    this.onRoundBtnReputation = () => {
      console.log("reputacion clicked");
    };

    // ---------- BOTÓN 4 (HUD Estadísticas)
    this.onRoundBtnHudStats = () => {
      console.log("libro de estadisticas");
    };

    */

    // ASIGNAR LISTENERS
    this.roundButtons[0]?.addEventListener('click', this.onRoundBtnDashboard);
    this.roundButtons[1]?.addEventListener('click', this.onRoundBtnMail);
    
    this.roundButtons[2]?.addEventListener('click', this.onRoundBtnStats);

    // ---------- BOTÓN 3 (Transactions)
    this.onRoundBtnTransactions = () => {
      console.log('transactions clicked');
      const panel = document.getElementById('tx-hub');
      if (!panel) return;
      const isHidden = panel.classList.contains('tx-hub-hidden');
      if (isHidden) {
        panel.classList.remove('tx-hub-hidden');
        panel.classList.add('tx-hub-visible');
        panel.style.display = 'flex';
      } else {
        panel.classList.remove('tx-hub-visible');
        panel.classList.add('tx-hub-hidden');
        panel.style.display = 'none';
      }
    };
    this.roundButtons[3]?.addEventListener('click', this.onRoundBtnTransactions);

    // ---------- BOTÓN 4 (NFT)
    this.onRoundBtnNFT = () => {
      console.log('nft clicked');
      const panel = document.getElementById('nft-panel');
      if (!panel) return;
      const isHidden = panel.classList.contains('nft-panel-hidden');
      if (isHidden) {
        panel.classList.remove('nft-panel-hidden');
        panel.classList.add('nft-panel-visible');
        panel.style.display = 'flex';
        // Setup close button
        const closeBtn = document.getElementById('nft-close');
        if (closeBtn && !closeBtn._wired) {
          closeBtn._wired = true;
          closeBtn.onclick = () => {
            panel.classList.remove('nft-panel-visible');
            panel.classList.add('nft-panel-hidden');
            panel.style.display = 'none';
          };
        }
      } else {
        panel.classList.remove('nft-panel-visible');
        panel.classList.add('nft-panel-hidden');
        panel.style.display = 'none';
      }
    };
    this.roundButtons[4]?.addEventListener('click', this.onRoundBtnNFT);

    // ---------- BOTÓN 5 (Skills)
    this.onRoundBtnSkills = () => {
      console.log('skills clicked');
      const panel = document.getElementById('skills-panel');
      if (!panel) return;
      const isHidden = panel.classList.contains('skills-panel-hidden');
      if (isHidden) {
        panel.classList.remove('skills-panel-hidden');
        panel.classList.add('skills-panel-visible');
        panel.style.display = 'flex';
        // Wire close button
        const closeBtn = document.getElementById('skills-close');
        if (closeBtn && !closeBtn._wired) {
          closeBtn._wired = true;
          closeBtn.onclick = () => {
            panel.classList.remove('skills-panel-visible');
            panel.classList.add('skills-panel-hidden');
            panel.style.display = 'none';
          };
        }
        // No save button — badges are read-only from DB
      } else {
        panel.classList.remove('skills-panel-visible');
        panel.classList.add('skills-panel-hidden');
        panel.style.display = 'none';
      }
    };
    this.roundButtons[5]?.addEventListener('click', this.onRoundBtnSkills);

    // ---------- BOTÓN 6 (Store) — same as GameScene
    // FIX: antes abría https://store.grasslandforest.com (dominio que no sirve
    // el market). El Market vive junto a game.html en el dominio del juego, así
    // que se resuelve relativo a la página actual: en producción →
    // https://game.grasslandforest.com/market.html y en local el mismo host.
    this.onRoundBtnStore = () => {
      const marketUrl = new URL('market.html', window.location.href).href;
      window.open(marketUrl, '_blank');
    };
    this.roundButtons[6]?.addEventListener('click', this.onRoundBtnStore);

    // Apply custom cursor image for tiendajuego + re-apply after scene settles
    this.input.setDefaultCursor('url("./Game/Source/cursor.png") 8 8, pointer');
    this.time.delayedCall(400, () => {
      if (this.input && this.input.setDefaultCursor)
        this.input.setDefaultCursor('url("./Game/Source/cursor.png") 8 8, pointer');
    });
    this.time.delayedCall(1200, () => {
      if (this.input && this.input.setDefaultCursor)
        this.input.setDefaultCursor('url("./Game/Source/cursor.png") 8 8, pointer');
    });

    // Llamar a la función de carga de datos del jugador al iniciar el juego

    


    this.saveTimer = 0;
    this.sceneActive = true; // Asegúrate de que la escena esté activa


    /*
        // Ejemplo 1: Agregar 1 semilla (item_1)
        const exito1 = this.addItemWithCheck("item_1", 1);
        if (!exito1) {
          console.warn("❗ No pude agregar item_1 porque no hay espacio.");
        }

        // Ejemplo 2: Agregar 12 unidades de tijeras (item_3)
        const exito2 = this.addItemWithCheck("item_3", 12);
        if (exito2) {
          console.log("✔ 12 tijeras agregadas correctamente.");
        } else {
          console.warn("❗ No hay espacio suficiente para agregar 12 tijeras.");
        }

      */


                // Carácter global de las definiciones de ítems
        this.ItemDefinitions = {
          Semillax: { src: "./Game/Objetos/Plantas/planta_zanahorias/item_saco.png", maxStack: 50, tipo: "bolsa zanahorias", usos: null },
          Semillax1: { src: "./Game/Objetos/Plantas/planta_tomates/semillas_tomate.png", maxStack: 50 , tipo: "bolsa de tomates", usos: null},
          
          Semillax2: { src: "./Game/Objetos/Plantas/planta_trigo/item_semilla_trigo.png", maxStack: 50 , tipo: "bolsa de trigo", usos: null},
          Semillax3: { src: "./Game/Objetos/Plantas/planta_calabaza/item_semilla_calabaza.png", maxStack: 50, tipo: "bolsa de calabazas", usos: null },

          Regaderax: { src: "./Game/Source/recurso2.png", maxStack: 1 , tipo: "Regaderax", usos: 20 },
          Tijerasx: { src: "./Game/Source/tijeras.png", maxStack: 1 , tipo: "Tijerasx", usos: 20 },

          mineral_piedra: { src: "./Game/Source/piedra.png", maxStack: 20 , tipo: "mineral_piedra", usos: null },
          mineral_cobre: { src: "./Game/Source/cobre.png", maxStack: 20 , tipo: "mineral_cobre", usos: null },
          mineral_hierro: { src: "./Game/Source/hierro.png", maxStack: 20 , tipo: "mineral_hierro", usos: null },

          palo: { src: "./Game/Source/palo.png", maxStack: 20 , tipo: "palo", usos: null},
          tablon_de_madera: { src: "./Game/Source/madera.png", maxStack: 20 , tipo: "tablon_de_madera", usos: null},
          madera_pinos: { src: "./Game/Source/madera_oscura.png", maxStack: 50 , tipo: "madera pinos", usos: null},
          madera_con_hojas: { src: "./Game/Source/madera de hoja.png", maxStack: 50 , tipo: "madera con hojas", usos: null},
          madera_seca: { src: "./Game/Source/madera seca.png", maxStack: 50 , tipo: "madera seca", usos: null},

          balde_vacio: { src: "./Game/Source/item_pozo1.png", maxStack: 5 , tipo: "balde_vacio", usos: null },
          balde_con_agua: { src: "./Game/Source/item_pozo2.png", maxStack: 5 , tipo: "balde_con_agua", usos: 1 },

          
          hacha_de_madera: { src: "./Game/Source/pico_y_hacha/hacha_de_madera.png", maxStack: 5, tipo: "hacha de madera", usos: 5  },
          hacha_de_piedra: { src: "./Game/Source/pico_y_hacha/hacha_de_piedra.png", maxStack: 5, tipo: "hacha de piedra", usos: 10 },
          hacha_de_cobre:  { src: "./Game/Source/pico_y_hacha/hacha_de_cobre.png",  maxStack: 5, tipo: "hacha de cobre", usos: 15 },
          hacha_de_hierro: { src: "./Game/Source/pico_y_hacha/hacha_de_hierro.png", maxStack: 5, tipo: "hacha de hierro", usos: 20 },

          pico_de_madera: { src: "./Game/Source/pico_y_hacha/pico_de_madera.png", maxStack: 5, tipo: "pico de madera", usos: 5  },
          pico_de_piedra: { src: "./Game/Source/pico_y_hacha/pico_de_piedra.png", maxStack: 5, tipo: "pico de piedra", usos: 10 },
          pico_de_cobre:  { src: "./Game/Source/pico_y_hacha/pico_de_cobre.png",  maxStack: 5, tipo: "pico de cobre", usos: 15 },
          pico_de_hierro: { src: "./Game/Source/pico_y_hacha/pico_de_hierro.png", maxStack: 5, tipo: "pico de hierro", usos: 20 },
          
          zanahoria_buena: { src: "./Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_buena.png", maxStack: 20 , tipo: "zanahoria_buena", usos: null },
          zanahoria_corta: { src: "./Game/Objetos/Plantas/planta_zanahorias/planta_crecimiento_zanahoria.png", maxStack: 20 , tipo: "zanahoria_corta", usos: null},
          zanahoria_mala: { src: "./Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_podrida.png", maxStack: 20 , tipo: "zanahoria_mala", usos: null},

          tomate_buena: { src: "./Game/Objetos/Plantas/planta_tomates/item_tomate_bueno.png", maxStack: 20, tipo: "tomate_buena", usos: null },
          tomate_corta: { src: "./Game/Objetos/Plantas/planta_tomates/item_planta.png", maxStack: 20 , tipo: "tomate_corta", usos: null},
          tomate_mala: { src: "./Game/Objetos/Plantas/planta_tomates/item_tomate_malo.png", maxStack: 20 , tipo: "tomate_mala", usos: null},

          

          trigo_buena: { src: "./Game/Objetos/Plantas/planta_trigo/item_trigo_bueno.png", maxStack: 20 , tipo: "trigo_buena", usos: null},
          trigo_corta: { src: "./Game/Objetos/Plantas/planta_trigo/item_planta_trigo.png", maxStack: 20 , tipo: "trigo_corta", usos: null},
          trigo_mala: { src: "./Game/Objetos/Plantas/planta_trigo/item_trigo_podrido.png", maxStack: 20 , tipo: "trigo_mala", usos: null},

          calabaza_buena: { src: "./Game/Objetos/Plantas/planta_calabaza/item_calabaza_buena.png", maxStack: 20 , tipo: "calabaza_buena", usos: null},
          calabaza_corta: { src: "./Game/Objetos/Plantas/planta_calabaza/item_planta_calabaza.png", maxStack: 20, tipo: "calabaza_corta", usos: null},
          calabaza_mala: { src: "./Game/Objetos/Plantas/planta_calabaza/item_calabaza_podrida.png", maxStack: 20, tipo: "calabaza_mala", usos: null },


        
          // Agrega más definiciones según sea necesario
        };
        





        
        // ─────────────────────────────────────────────────────────

        // this.authenticate(); pedimos otro token

        
        this.initialize();


        this.STATE = {
          slots: Array(40).fill(null),
          quickSlots: Array(7).fill(null),
          selectedItem: null,
          ghostSlots: {
            inv: Array(40).fill(null),
            quick: Array(7).fill(null)
          }
        };

        // 1) Inicializar inventario y quick-slots
        this.initInventory();

        this.rebuildPlayerInventoryFromState();

        // 2) Escuchar tecla “I” para abrir/cerrar inventario
        this.input.keyboard.on('keydown-I', () => {
          this.toggleInventory();
        });

        /*

        // 3) Ejemplo: agregar ítems al inventario (por ID solamente)
        this.addItem("item_1");
        this.addItem("item_1");
        this.addItem("item_2");
        this.addItem("item_3");

        */

        // 4) Botón de cerrar inventario (HTML Overlay)
        document.querySelector('#inventory-panel .cerrar-hud')
          .addEventListener('click', () => {
            this.hideInventory();
          });



















          /*
 // 1) Crear un contenedor (“Container”) para el botón, con fondo y texto.
    //    Así podemos ajustar posicionamiento y usar setInteractive().
    const btnWidth = 40;
    const btnHeight = 40;
    const margin = 20;

    // Crear un Graphics para el rectángulo de fondo:
    const graphics = this.add
      .graphics()
      .fillStyle(0x2c3e50, 1)           // color #2c3e50
      .fillRoundedRect(0, 0, btnWidth, btnHeight, 4);

    // Crear texto “🛒” en el centro del rectángulo:
    const iconText = this.add
      .text(btnWidth / 2, btnHeight / 2, "🛒", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Meter ambos en un Container:
    this.shopToggleBtn = this.add
      .container(
        this.scale.width - btnWidth / 2 - margin, // X:  (anchoPantalla - anchoBotón/2 - margen)
        btnHeight / 2 + margin                      // Y:  (altoBotón/2 + margen)
      )
      .setDepth(2) // para que quede por encima de todo

    this.shopToggleBtn.add([graphics, iconText]);

    // Hacer interactivo el fondo del botón:
    graphics.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, btnWidth, btnHeight),
      Phaser.Geom.Rectangle.Contains
    );
    */
// 2) Listener para el clic/tap en Phaser
boton3.on("pointerdown", () => {
    console.log("Abriendo tienda de Johnny Johnson...");
    
    // FIX: llamar siempre a initTienda (ahora actualiza la escena si ya existe)
    initTienda(this);
    
    // Abrir tienda
    if (window.tiendaSistema) {
        window.tiendaSistema.open();
    }
});




    boton4.on("pointerdown", () => {

    });


  /*

    // 3) (Opcional) Si quieres que el botón cambie de color al pasar el mouse:
    graphics.on("pointerover", () => {
      graphics.clear();
      graphics.fillStyle(0x34495e, 1); // color un poco más claro
      graphics.fillRoundedRect(0, 0, btnWidth, btnHeight, 4);
    });
    graphics.on("pointerout", () => {
      graphics.clear();
      graphics.fillStyle(0x2c3e50, 1);
      graphics.fillRoundedRect(0, 0, btnWidth, btnHeight, 4);
    });

    

    // 4) Si tu canvas de Phaser cambia de tamaño (responsive), 
    //    puedes volver a posicionar el botón en `resize`:
    this.scale.on("resize", (gameSize) => {
      const { width, height } = gameSize;
      this.shopToggleBtn.setPosition(
        width - btnWidth / 2 - margin,
        btnHeight / 2 + margin
      );
    });

    */



    // Por simplicidad, definimos un arreglo local. En tu juego, podrías traerlos desde
    // un JSON, base de datos o lo que tengas.




  this.rebuildPlayerInventoryFromState();





  this.makeElementDraggable("inventory-panel");


  




    this.profileImage = document.getElementById("player-image");
    this.hubInfo = document.getElementById("hub-info");

    // Atamos el método para que funcione bien con add/removeEventListener
    this.toggleHubInfo = this.toggleHubInfo.bind(this);

    // Cargar estado guardado
    this.loadState();

    // Añadir listener
    this.profileImage.addEventListener("click", this.toggleHubInfo);









    // tiempos de siembra
this.actualizarTemporizadoresDesdeStorage = () => {
  for (let key in localStorage) {
    if (key.startsWith('temporizador_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const tiempoTranscurrido = Math.floor((Date.now() - data.inicio) / 1000);
        const tiempoRestante = data.duracion - tiempoTranscurrido;

        if (tiempoRestante <= 0) {
          console.log(`✅ Temporizador finalizado automáticamente: ${key}`);
          localStorage.removeItem(key);
        }
      } catch (e) {
        console.error('❌ Error leyendo temporizador:', key, e);
        localStorage.removeItem(key);
      }
    }
  }
};

this.actualizarTemporizadoresDesdeStorage();























      // control simple anti-spam cliente (ms)
    this._chatRateLimitMs = 800;
    this._lastChatSent = 0;
    

    // Si obtienes account/playerName en otra parte, asignalo a this.currentAccount
    // Ejemplo: this.currentAccount = data.playerName;
    // Para compatibilidad con tu chat HTML:
    window.playerName = window.playerName || this.currentAccount || '---';

    // Inicializar UI del chat (elementos del DOM)
    this._setupChatDom();

    // Escuchadores de escena para limpiar socket al cerrar escena
    this.events.on('shutdown', this._onShutdown, this);
    this.events.on('destroy', this._onShutdown, this);















// ─────────────────────────────────────────────────────────────────
// SOCKET.IO CON SALA ESPECÍFICA PARA TIENDA
// ─────────────────────────────────────────────────────────────────

      // Propiedades del socket
      this.socket = null;
      this.socketInitialized = false;
      this.socketListeners = [];
      
      // Para evitar múltiples joinRoom
      this.currentRoom = null;
      this.lastJoinTime = 0;
      this.joinCooldown = 1000; // 1 segundo entre joins
      
      // Otros jugadores
      this.otherPlayers = {};
      this.myId = null;

      console.log("🎮 Escena tienda creada");
      
      // Registrar esta escena como activa
      window.activeScene = this;
      
      // Inicializar socket DESPUÉS de cargar todo lo básico
      this.time.delayedCall(500, () => {
        this.initSocket();
      });
      
      // ... resto del código create() sin cambios
      
      // Configurar eventos de la escena
      this.setupSceneEvents();



    // Controles básicos
    this.cursors = this.input.keyboard.createCursorKeys();
    this.speed = 240;




      /*
    // --- Mapeo de teclas 1..7 y escucha de keydown ---
    this.input.keyboard.on('keydown', (event) => {
      // event.key viene como '1','2',... en la mayoría de navegadores
      const n = parseInt(event.key, 10);
      if (!isNaN(n) && n >= 1 && n <= 7) {
        const idx = n - 1;
        this.selectQuickSlot(idx);
      }
    });

    */

        // --- Mapeo de teclas 1..7 y escucha de keydown ---
    this.input.keyboard.on('keydown', (event) => {
      // Si el elemento activo es un input, textarea o select, ignorar.
      const activeElement = document.activeElement;
      const tagName = activeElement.tagName.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tagName)) {
        return;
      }
      // event.key viene como '1','2',... en la mayoría de navegadores
      const n = parseInt(event.key, 10);
      if (!isNaN(n) && n >= 1 && n <= 7) {
        const idx = n - 1;
        this.selectQuickSlot(idx);
      }
    });



    window.addEventListener('beforeunload', () => {
        this.handlePageUnload();
    });






    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (!this._elInfoLeft) this._elInfoLeft = document.getElementById('info-text-left');
        if (!this._elInfoRight) this._elInfoRight = document.getElementById('info-text-right');
        if (this._elInfoLeft) this._elInfoLeft.textContent = `${this.moneda}`;
        if (this._elInfoRight) this._elInfoRight.textContent = `${this.moneda_plata}`;
      }
    });




this.time.addEvent({
  delay: 400,
  loop: true,
  callback: () => {

    const uiText = document.getElementById('game-ui-text');
    if (uiText) {
      uiText.textContent =
        `Zoom: ${this.cameras.main.zoom.toFixed(2)} Coordinates: ${this.player.x.toFixed(2)} Y: ${this.player.y.toFixed(2)} Soport: ${this.maxTextureSize}`;
    }

    // ======================
    // SISTEMA DE NIVELES
    // ======================

    const EXP_BASE = 200;
    const MAX_LEVEL = 150;

    while (this.nivel < MAX_LEVEL) {
      const expNecesaria = EXP_BASE * (2 ** this.nivel);

      if (this.nivel_exp >= expNecesaria) {
        this.nivel++;
        this.playSFX('level_up_sound');
        this.actualizarBarraVida(this.vidaPorcentaje);
      } else {
        break;
      }
    }

  }
});












// En create(), modifica el objeto mouseMovement:
this.mouseMovement = {
    isHolding: false,           // Click físicamente presionado
    holdStartTime: 0,
    holdDuration: 300,
    minHoldDistance: 15,
    followCursorActive: false,  // Solo true mientras click esté presionado DESPUÉS de 1.5s
    speed: 350,
    directionX: 0,
    directionY: 0,
    
    // NUEVO: Para detectar cuando el cursor está sobre UI/interactivos
    cursorOverUI: false
};

// Configurar eventos del ratón - VERSIÓN CORREGIDA CON DETECCIÓN DE UI
this.input.on('pointerdown', (pointer) => {
    if (pointer.button === 0) {
        const canvas = this.sys.canvas;
        const isCanvasClick = pointer.event.target === canvas || 
                             pointer.event.target.tagName === 'container' ||
                             canvas.contains(pointer.event.target);
        
        if (isCanvasClick && !this.mouseMovement.cursorOverUI) {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const distance = Phaser.Math.Distance.Between(
                this.player.x, this.player.y,
                worldPoint.x, worldPoint.y
            );
            
            if (distance > this.mouseMovement.minHoldDistance) {
                this.mouseMovement.isHolding = true;
                this.mouseMovement.holdStartTime = this.time.now;
                this.mouseMovement.followCursorActive = false; // Resetear
                
                console.log(`📌 Click iniciado - Esperando 1.5s...`);
            }
        }
    }
});

// Evento para detectar cuando el cursor está sobre elementos UI/interactivos
// Esto previene que se active el movimiento cuando estás sobre el herrero, crafting, etc.
this.input.on('gameobjectover', (pointer, gameObject) => {
    // Si el cursor está sobre cualquier objeto interactivo del juego
    this.mouseMovement.cursorOverUI = true;
});

this.input.on('gameobjectout', (pointer, gameObject) => {
    // Cuando el cursor sale del objeto interactivo
    this.mouseMovement.cursorOverUI = false;
});

// También verificar si el cursor está sobre elementos DOM (como el panel de crafting)
document.addEventListener('mouseover', (e) => {
    const uiElements = ['mission-hub', 'crafting-hub', 'dialogHub', 'hub-panel_101'];
    if (uiElements.some(id => e.target.closest(`#${id}`))) {
        this.mouseMovement.cursorOverUI = true;
    }
});

document.addEventListener('mouseout', (e) => {
    const uiElements = ['mission-hub', 'crafting-hub', 'dialogHub', 'hub-panel_101'];
    if (uiElements.some(id => e.target.closest(`#${id}`))) {
        // Solo resetear si el cursor no está sobre otro elemento UI
        if (!uiElements.some(id => document.elementFromPoint(e.clientX, e.clientY)?.closest(`#${id}`))) {
            this.mouseMovement.cursorOverUI = false;
        }
    }
});

// EL EVENTO pointerup MÁS ROBUSTO
this.input.on('pointerup', (pointer) => {
    if (pointer.button === 0) {
        this.stopMouseMovement();
    }
});

// Evento pointerup global (por si se suelta fuera del canvas)
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        this.stopMouseMovement();
    }
});















// ============ MASCOTA (PERRO) ============
// Posición inicial: unos 40px a la derecha y debajo del jugador
this.dog.x = this.player.x + 40;
this.dog.y = this.player.y + 20;
this.dog.targetX = this.dog.x;
this.dog.targetY = this.dog.y;

// Sprite del perro
this.dog.sprite = this.add.sprite(this.dog.x, this.dog.y, 'perro_derecha_1')
    .setScale(2)
    .setDepth(this.player.y + 8); // Empieza con un depth similar

// Sombra del perro (igual que la del jugador pero más pequeña)
this.dog.shadow = this.add.graphics();
this.dog.shadow.fillStyle(0x000000, 0.25);
this.dog.shadow.fillEllipse(0, 0, 35, 18);
this.dog.shadowContainer = this.add.container(this.dog.x, this.dog.y + 22, [this.dog.shadow]);

// Reproducir animación inicial
this.dog.sprite.play('perro_right');

// ── Etiqueta con el NOMBRE de la mascota (regla de nombre único) ─────────
if (!this.petName) this.petName = window.globalPetName || '---';
this.dogNameText = this.add.text(this.dog.x, this.dog.y - 30, '', {
  fontFamily: '"PressStart2P"',
  fontSize: '8px',
  color: '#ffe9a8',
  resolution: 4,
  stroke: '#000000',
  strokeThickness: 4
}).setOrigin(0.5, 1).setDepth(this.player.y + 9).setVisible(false);
if (typeof this._updateDogNameLabel === 'function') this._updateDogNameLabel();

// ── Restore pet removal state that was set before this scene loaded ──
if (window.globalPetData && window.globalPetData.equipped === false) {
  this.petData = window.globalPetData;
  this.dog.sprite.setVisible(false);
  this.dog.shadowContainer.setVisible(false);
  if (this.dogNameText) this.dogNameText.setVisible(false);
} else {
  // Sync globalPetData from current state for future scene switches
  if (!this.petData) this.petData = { type: 'perro', visible: true, equipped: true };
  window.globalPetData = this.petData;
}












}





// Función para detener movimiento - LLAMARLA SIEMPRE QUE SE SUELTE EL CLICK
stopMouseMovement() {
    if (this.mouseMovement.isHolding || this.mouseMovement.followCursorActive) {
        console.log('🔼 Click soltado - Movimiento detenido');
        
        this.mouseMovement.isHolding = false;
        this.mouseMovement.followCursorActive = false;
        this.mouseMovement.directionX = 0;
        this.mouseMovement.directionY = 0;
        
        // También detener cualquier movimiento del teclado si el mouse tenía prioridad
        
        if (this.player && this.player.anims) {
            this.player.anims.stop();
        }
        if (this.lastDirection === "left") {
            this.player.setTexture('player_left_1');
        } else if (this.lastDirection === "right") {
            this.player.setTexture('player_right_1');
        }
        
        // Opcional: resetear velocidad si usas física
        if (this.player.body) {
            this.player.setVelocity(0, 0);
        }
    }
}


// Función handleMouseMovement - REVISADA CON CHECKS CONSTANTES
handleMouseMovement(delta) {
    // ⚠️ Verificar si el click sigue presionado
    if (!this.input.activePointer.isDown && this.mouseMovement.isHolding) {
        console.log('⚠️ Click perdido - Forzando parada');
        this.stopMouseMovement();
        return;
    }

    if (!this.mouseMovement.isHolding) {
        if (this.mouseMovement.followCursorActive) {
            this.mouseMovement.followCursorActive = false;
        }
        return;
    }

    const currentTime = this.time.now;
    const holdTime = currentTime - this.mouseMovement.holdStartTime;

    if (holdTime < this.mouseMovement.holdDuration) {
        return;
    }

    if (!this.mouseMovement.followCursorActive) {
        console.log(`✅ Click sostenido 1.5s - Modo seguimiento activado`);
        this.mouseMovement.followCursorActive = true;
    }

    if (this.mouseMovement.followCursorActive && this.mouseMovement.isHolding) {
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        let dx = worldPoint.x - this.player.x;
        let dy = worldPoint.y - this.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Cerca del cursor → no hay desplazamiento este frame. La animación
        // NO se toca aquí: la "Decisión ÚNICA de animación" (más abajo en
        // update, tras resolver colisiones) pondrá el idle que corresponda.
        if (distance < 2) {
            return;
        }

        // Normalizar
        if (distance > 0) {
            dx /= distance;
            dy /= distance;
        }

        this.mouseMovement.directionX = dx;
        this.mouseMovement.directionY = dy;

        // Normalizar diagonal
        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        const deltaInSeconds = delta / 1000;
        this.player.x += dx * this.mouseMovement.speed * deltaInSeconds;
        this.player.y += dy * this.mouseMovement.speed * deltaInSeconds;

        // NOTA (paridad con GameScene): aquí ya NO se llama a anims.play().
        // La dirección hacia el cursor queda en mouseMovement.directionX/Y y
        // la "Decisión ÚNICA de animación" (tras resolver colisiones) aplica
        // la regla de modo mouse: solo 'left'/'right' — 'right' cubre derecha,
        // derecha+arriba y derecha+abajo; 'left' sus equivalentes. Así también
        // se evita el congelamiento al colisionar en diagonal.

        this.posicionplayerx = this.player.x;
        this.posicionplayery = this.player.y;
    }
}




    queuedAction(payload = undefined) {
      let entry;
      if (payload === undefined || payload === null) entry = true;
      else if (typeof payload === 'object') {
        try { entry = JSON.parse(JSON.stringify(payload)); }
        catch(e) { entry = { ...payload }; }
      } else entry = payload;

      this._queue.push(entry);

      if (!this._processing) {
        this._processBatches().catch(err => console.error(err));
      }
    }

    async _processBatches() {
      this._processing = true;
      const wait = this._windowMs;

      while (true) {
        if (this._queue.length === 0) {
          this._processing = false;
          return;
        }

        // Tomar toda la cola actual y limpiarla
        const batch = this._queue.slice();
        this._queue.length = 0;

        // Esperar 1 segundo usando el reloj de Phaser
        await new Promise(resolve => this.time.delayedCall(wait, resolve, [], this));

        // Mensaje exactamente como pediste:
        console.log(`en cola hubieron ${batch.length} llamadas y fueron eliminadas y procesado este console log.`, batch);
        this.savegg();
      }
    }






    // ================================
    // SOCKET MANAGEMENT
    // ================================

    initSocket() {
      console.log("🔄 Inicializando socket para tienda...");
      
      // Usar socket global si existe, sino crear uno
      if (!window.globalSocket || !window.globalSocket.connected) {
        console.log("🌐 Creando nueva conexión socket global");
        
        const SERVER = this.serverclient1;
        window.globalSocket = io(SERVER, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 20000,
          autoConnect: true,
          forceNew: false
        });
        
        // Configurar eventos globales del socket
        this.setupGlobalSocketEvents(window.globalSocket);
      } else {
        console.log("🌐 Usando socket global existente");
      }
      
      this.socket = window.globalSocket;
      this.setupSceneSocketListeners();
      
      // Unirse a la sala de la tienda solo si no estamos ya en ella
      if (this.currentRoom !== 'tienda') {
        this.joinRoom('tienda');
      }
    }

    setupGlobalSocketEvents(socket) {
      // Solo configurar una vez
      if (socket._globalEventsSet) return;
      
      socket.on('connect', () => {
        console.log('✅ Socket global conectado:', socket.id);
        // Notificar a todas las escenas que el socket está conectado
        if (window.activeScene && window.activeScene.onSocketReconnect) {
          window.activeScene.onSocketReconnect();
        }
      });
      
      socket.on('disconnect', (reason) => {
        console.log('❌ Socket global desconectado:', reason);
      });
      
      socket.on('connect_error', (error) => {
        console.error('🔌 Error de conexión socket:', error.message);
      });
      
      socket._globalEventsSet = true;
    }

    setupSceneSocketListeners() {
      // Limpiar listeners anteriores
      this.removeSocketListeners();
      
      const listeners = [
        // currentPlayers - Recibir todos los jugadores en la sala
        {
          event: 'currentPlayers',
          handler: (players) => {
            console.log(`🎮 Recibidos ${players.length} jugadores en tienda`);
            
            // Limpiar jugadores anteriores
            this.clearOtherPlayers();
            
            // Crear nuevos jugadores
            players.forEach(player => {
              if (player.id !== this.myId) {
                this.createOtherPlayer(player);
              }
            });
          }
        },
        
        // newPlayer - Nuevo jugador se unió
        {
          event: 'newPlayer',
          handler: (playerInfo) => {
            if (playerInfo.id === this.myId) return;
            console.log(`👤 Nuevo jugador en tienda: ${playerInfo.username || playerInfo.id}`);
            this.createOtherPlayer(playerInfo);
          }
        },
        
        // playerMoved - Movimiento de otro jugador
        {
          event: 'playerMoved',
          handler: (playerInfo) => {
            if (playerInfo.id === this.myId) return;
            this.updateOtherPlayer(playerInfo);
          }
        },
        
        // playerLeft - Jugador abandonó la sala
        {
          event: 'playerLeft',
          handler: (data) => {
            this.removeOtherPlayer(data.id);
          }
        },

        // playerDisconnected - Safety net for abrupt disconnections
        {
          event: 'playerDisconnected',
          handler: (data) => {
            const id = (typeof data === 'object') ? data.id : data;
            if (id) this.removeOtherPlayer(id);
          }
        },
        
        // playerCount - Contador de jugadores
        {
          event: 'playerCount',
          handler: (count) => {
            if (this.playerCountText) {
              this.playerCountText.setText(`Jugadores: ${count}`);
            }
          }
        },
        
        // chatMessage - Mensaje de chat
        {
          event: 'chatMessage',
          handler: (message) => {
            this.appendMessage(message);
            if (message && message.id && message.id !== (this.socket && this.socket.id)) {
              this._showRemoteChatBubble(message.id, message.text || '');
            }
          }
        },
        { event: 'chatTyping', handler: (data) => {
            if (data && data.id && data.id !== (this.socket && this.socket.id))
              this._showRemoteTypingBubble(data.id, !!data.typing);
        }},
        
        // chatError - Error en chat
        {
          event: 'chatError',
          handler: (error) => {
            this.appendSystemMessage(error.msg || 'Error en chat');
          }
        }
      ];
      
      // Agregar todos los listeners
      listeners.forEach(listener => {
        this.socket.on(listener.event, listener.handler);
        this.socketListeners.push({
          event: listener.event,
          handler: listener.handler
        });
      });
      
      this.socketInitialized = true;
    }

    removeSocketListeners() {
      if (!this.socket || !this.socketListeners.length) return;
      
      this.socketListeners.forEach(listener => {
        this.socket.off(listener.event, listener.handler);
      });
      
      this.socketListeners = [];
    }

    joinRoom(roomName) {
      if (!this.socket || !this.socket.connected) {
        console.warn('⚠️ Socket no conectado, no se puede unir a sala');
        return;
      }
      
      const now = Date.now();
      if (now - this.lastJoinTime < this.joinCooldown && this.currentRoom === roomName) {
        console.log('⏳ En cooldown de join, ignorando');
        return;
      }
      
      this.lastJoinTime = now;
      this.currentRoom = roomName;
      
      console.log(`🚪 Uniéndose a sala: ${roomName}`);
      
      this.socket.emit("joinRoom", {
        room: roomName,
        username: this.Username || '---',
        lastScene: 'tiendajuego', // IMPORTANTE: Identificar la escena actual
        x: this.player ? this.player.x : 200,
        y: this.player ? this.player.y : 300
      });
    }

// En la clase tiendajuego, reemplaza el método sendPlayerMovement:
sendPlayerMovement() {
  if (!this.socket || !this.socket.connected || !this.player) return;
  
  // Calcular si se está moviendo realmente (teclado O ratón)
  const keyboardMoving = this.keys.left.isDown || this.keys.right.isDown || 
                         this.keys.up.isDown || this.keys.down.isDown ||
                         this.keys.leftArrow.isDown || this.keys.rightArrow.isDown ||
                         this.keys.upArrow.isDown || this.keys.downArrow.isDown;

  // Also consider mouse-driven movement (followCursor / isHolding)
  const mouseMoving = !!(this.mouseMovement && (this.mouseMovement.followCursorActive || this.mouseMovement.isHolding));

  const isMoving = keyboardMoving || mouseMoving;
  
  // Solo enviar si hay cambios significativos
  if (this.lastSentPosition && 
      Math.abs(this.player.x - this.lastSentPosition.x) < 0.5 &&
      Math.abs(this.player.y - this.lastSentPosition.y) < 0.5 &&
      this.lastMovingState === isMoving) {
    return;
  }
  
  this.lastSentPosition = { x: this.player.x, y: this.player.y };
  this.lastMovingState = isMoving;
  
  // Determinar dirección basada en movimiento real
  let currentDirection = this.lastDirection;
  let directionState = 'stop_right';
  
  if (isMoving) {
    if (this.keys.left.isDown || this.keys.leftArrow.isDown) {
      currentDirection = 'left';
      directionState = 'left';
    } else if (this.keys.right.isDown || this.keys.rightArrow.isDown) {
      currentDirection = 'right';
      directionState = 'right';
    } else if (mouseMoving && this.mouseMovement) {
      // Derive direction from mouse movement vector
      const mdx = this.mouseMovement.directionX || 0;
      if (mdx < -0.1) { currentDirection = 'left'; directionState = 'left'; }
      else if (mdx > 0.1) { currentDirection = 'right'; directionState = 'right'; }
      else { directionState = currentDirection || 'right'; }
    } else {
      // Movimiento vertical - mantener dirección anterior
      directionState = currentDirection || 'right';
    }
    
    // Actualizar lastDirection solo si hay movimiento horizontal
    if (directionState === 'left' || directionState === 'right') {
      this.lastDirection = directionState;
    }
  } else {
    // No se está moviendo - determinar estado de detención
    directionState = this.lastDirection === 'left' ? 'stop_left' : 'stop_right';
  }
  
  this.socket.emit("playerMove", {
    x: this.player.x,
    y: this.player.y,
    direction: isMoving ? directionState : 'stop',
    directionx: directionState,
    isMoving: isMoving,
    usernamex: this.Username || '---',

    // ========= DATOS DE LA MASCOTA =========
    dogX: this.dog.x,
    dogY: this.dog.y,
    dogDirection: this.dog.direction,  // 'left' o 'right'
    dogEquipped: !(this.petData && this.petData.equipped === false), // false = dog removed
    // El nombre de la mascota no se enviaba nunca, por eso los demás jugadores
    // veían tu perro sin etiqueta. El servidor reenvía el payload tal cual.
    dogName: this._isNameSet && this._isNameSet(this.petName) ? this.petName : ''
  });
}

    getDirectionState() {
      if (!this.keys) return 'stop_right';
      
      const moving = this.keys.left.isDown || this.keys.right.isDown || 
                     this.keys.up.isDown || this.keys.down.isDown;
      
      if (!moving) {
        return this.lastDirection === 'left' ? 'stop_left' : 'stop_right';
      }
      return this.lastDirection || 'right';
    }

    // ================================
    // GESTIÓN DE OTROS JUGADORES
    // ================================

clearOtherPlayers() {
  Object.values(this.otherPlayers).forEach(player => {
    if (player.sprite) player.sprite.destroy();
    if (player.nameText) player.nameText.destroy();

    if (player.dog) {
      if (player.dog.sprite) player.dog.sprite.destroy();
      if (player.dog.shadowContainer) player.dog.shadowContainer.destroy();
      if (player.dog.nameText) player.dog.nameText.destroy();
    }
  });

  this.otherPlayers = {};
}


createOtherPlayer(playerInfo) {
  if (this.otherPlayers[playerInfo.id]) return;

  const initialTexture =
    (playerInfo.directionx === 'stop_left' ||
      (playerInfo.direction === 'stop' &&
        (playerInfo.lastDirection === 'left' || playerInfo.direction === 'left')))
      ? 'player_left_1'
      : 'player_right_1';

  const sprite = this.add.sprite(playerInfo.x, playerInfo.y, initialTexture);
  sprite.setScale(2);
  sprite.setDepth(playerInfo.y + sprite.displayHeight * 0.5);

  const nameText = this.add.text(
    playerInfo.x,
    playerInfo.y - sprite.height / 2 - 30,
    playerInfo.username || 'Jugador',
    {
      fontFamily: '"PressStart2P"',
      fontSize: '12px',
      color: '#ffffff',
      resolution: 4,
      stroke: "#000",
      strokeThickness: 3,
    }
  );
  nameText.setOrigin(0.5, 1);
  nameText.setDepth(playerInfo.y + sprite.displayHeight * 0.5 + 1);

  this.otherPlayers[playerInfo.id] = {
    sprite,
    nameText,
    lastUpdate: Date.now(),
    lastDirection: playerInfo.direction || 'right',
    dog: null
  };

  const remotePlayer = this.otherPlayers[playerInfo.id];

  remotePlayer.dog = {
    sprite: this.add.sprite(
      playerInfo.dogX ?? playerInfo.x + 40,
      playerInfo.dogY ?? playerInfo.y + 20,
      'perro_derecha_1'
    )
      .setScale(2)
      .setDepth(playerInfo.y + 10),
    shadowContainer: null,
    direction: playerInfo.dogDirection || 'right'
  };

  const dogShadowG = this.add.graphics();
  dogShadowG.fillStyle(0x000000, 0.25);
  dogShadowG.fillEllipse(0, 0, 35, 18);
  remotePlayer.dog.shadowContainer = this.add.container(
    playerInfo.dogX ?? playerInfo.x,
    (playerInfo.dogY ?? playerInfo.y + 20) + 22,
    [dogShadowG]
  );

  // Etiqueta con el nombre de la mascota remota (antes no existía: el perro
  // propio sí tenía nombre, los de los demás salían sin nada).
  remotePlayer.dog.nameText = this.add.text(
    playerInfo.dogX ?? playerInfo.x + 40,
    (playerInfo.dogY ?? playerInfo.y + 20) - 30,
    playerInfo.dogName || '',
    {
      fontFamily: '"PressStart2P"',
      fontSize: '8px',
      color: '#ffffff',
      resolution: 4,
      stroke: '#000000',
      strokeThickness: 5,
    }
  ).setOrigin(0.5, 1);
  remotePlayer.dog.nameText.setVisible(!!playerInfo.dogName);
}


// Reemplaza completamente el método updateOtherPlayer con este:
// Reemplaza completamente el método updateOtherPlayer con este:
updateOtherPlayer(playerInfo) {
  const player = this.otherPlayers[playerInfo.id];

  if (!player) {
    console.log(`⚠️ Jugador ${playerInfo.id} no encontrado, creando...`);
    this.createOtherPlayer(playerInfo);
    return;
  }
  if (player._chatContainer) {
    const sprH = player.sprite.displayHeight || 64;
    player._chatContainer.setPosition(playerInfo.x, playerInfo.y - sprH*0.5 - 50);
    player._chatContainer.setDepth(99998);
  }
  if (player._typingContainer) {
    const sprH = player.sprite.displayHeight || 64;
    // Dots between name and message: just below name line
    player._typingContainer.setPosition(playerInfo.x, playerInfo.y - sprH*0.5 - 26);
    player._typingContainer.setDepth(99998);
  }

  const x = Number(playerInfo.x) || 0;
  const y = Number(playerInfo.y) || 0;
  const dogX = Number(playerInfo.dogX ?? (x + 40)) || (x + 40);
  const dogY = Number(playerInfo.dogY ?? (y + 20)) || (y + 20);

  const direction = playerInfo.direction || 'stop';
  const directionx = playerInfo.directionx || '';

  const isMoving = !!playerInfo.isMoving && direction !== 'stop';

  const dogDirection =
    playerInfo.dogDirection ||
    (direction === 'left' || directionx === 'stop_left' ? 'left' :
     direction === 'right' || directionx === 'stop_right' ? 'right' :
     player.dog?.direction || 'right');

  if (player.sprite) {
    player.sprite.setPosition(x, y);

    const remoteFeetY = y + player.sprite.displayHeight * 0.5;
    player.sprite.setDepth(remoteFeetY);

    if (isMoving) {
      if (this.anims.exists(direction)) {
        player.sprite.anims.play(direction, true);
      } else {
        player.sprite.setTexture(direction === 'left' ? 'player_left_1' : 'player_right_1');
      }
    } else {
      if (player.sprite.anims) player.sprite.anims.stop();

      if (directionx === 'stop_left' || (direction === 'stop' && player.lastDirection === 'left')) {
        player.sprite.setTexture('player_left_1');
      } else {
        player.sprite.setTexture('player_right_1');
      }
    }

    if (direction === 'left' || direction === 'right') {
      player.lastDirection = direction;
    }

    if (player.nameText) {
      player.nameText.setPosition(x, y - 60);
      player.nameText.setDepth(remoteFeetY + 1);
      player.nameText.setText(playerInfo.usernamex || playerInfo.username || 'Jugador');
    }

    if (!player.dog) {
      player.dog = {
        sprite: null,
        shadowContainer: null,
        direction: 'right',
        lastAnimState: 'idle'
      };
    }

    const dogShouldWalk = isMoving;

    if (!player.dog.sprite) {
      const dogTexture = dogDirection === 'left' ? 'perro_izquierda_1' : 'perro_derecha_1';
      player.dog.sprite = this.add.sprite(dogX, dogY, dogTexture).setScale(2);
    } else {
      player.dog.sprite.setPosition(dogX, dogY);
    }

    player.dog.direction = dogDirection;

    if (dogShouldWalk) {
      const animKey = dogDirection === 'left' ? 'perro_left' : 'perro_right';

      // Solo reiniciar si cambió la dirección o venía detenido
      if (player.dog.lastAnimState !== animKey) {
        if (this.anims.exists(animKey)) {
          player.dog.sprite.play(animKey, true);
        } else {
          player.dog.sprite.setTexture(dogDirection === 'left' ? 'perro_izquierda_1' : 'perro_derecha_1');
        }
        player.dog.lastAnimState = animKey;
      }
    } else {
      // Si el personaje se detiene, el perro también queda quieto
      if (player.dog.sprite.anims) {
        player.dog.sprite.anims.stop();
      }

      player.dog.sprite.setTexture(dogDirection === 'left' ? 'perro_izquierda_1' : 'perro_derecha_1');
      player.dog.lastAnimState = 'idle';
    }

    const remoteDogFeetY = dogY + player.dog.sprite.displayHeight * 0.5;
    player.dog.sprite.setDepth(remoteDogFeetY);

    if (!player.dog.shadowContainer) {
      const dogShadowG = this.add.graphics();
      dogShadowG.fillStyle(0x000000, 0.25);
      dogShadowG.fillEllipse(0, 0, 35, 18);
      player.dog.shadowContainer = this.add.container(dogX, dogY + 22, [dogShadowG]);
    } else {
      player.dog.shadowContainer.setPosition(dogX, dogY + 22);
    }

    if (player.dog.shadowContainer) {
      player.dog.shadowContainer.setDepth(remoteDogFeetY - 1);
    }

    // Nombre de la mascota remota: se crea también aquí por si el jugador ya
    // existía antes de este cambio, y se mantiene pegado sobre el perro.
    const dogName = playerInfo.dogName || '';
    if (!player.dog.nameText) {
      player.dog.nameText = this.add.text(dogX, dogY - 30, dogName, {
        fontFamily: '"PressStart2P"',
        fontSize: '8px',
        color: '#ffffff',
        resolution: 4,
        stroke: '#000000',
        strokeThickness: 5,
      }).setOrigin(0.5, 1);
    }
    player.dog.nameText.setText(dogName);
    player.dog.nameText.setPosition(dogX, dogY - player.dog.sprite.displayHeight * 0.5 - 4);
    player.dog.nameText.setDepth(remoteDogFeetY + 1);
    player.dog.nameText.setVisible(!!dogName);
  }

  player.lastUpdate = Date.now();
}

removeOtherPlayer(playerId) {
  const player = this.otherPlayers[playerId];
  if (!player) return;

  if (player.sprite) player.sprite.destroy();
  if (player.nameText) player.nameText.destroy();

  if (player.dog) {
    if (player.dog.sprite) player.dog.sprite.destroy();
    if (player.dog.shadowContainer) player.dog.shadowContainer.destroy();
    if (player.dog.nameText) player.dog.nameText.destroy();
  }

  delete this.otherPlayers[playerId];
  console.log(`🗑️ Jugador ${playerId} removido de game`);
}

    setupSceneEvents() {
      // Evento cuando la escena entra en pausa (al cambiar a otra escena)
      this.events.on('pause', () => {
        console.log('⏸️ Escena tienda pausada');
        this.leaveRoom();
      });
      
      // Evento cuando la escena se reanuda
      this.events.on('resume', () => {
        console.log('▶️ Escena tienda reanudada');
        this.time.delayedCall(300, () => {
          this.initSocket();
        });
      });
      
      // Evento cuando la escena se duerme (Scene Manager)
      this.events.on('sleep', () => {
        console.log('💤 Escena tienda dormida');
        this.cleanupBeforeTransition();
      });
      
      // Evento cuando la escena se despierta
      this.events.on('wake', () => {
        console.log('🌅 Escena tienda despierta');
        this.time.delayedCall(300, () => {
          this.initSocket();
        });
      });
      
      // Evento shutdown - se llama cuando la escena es detenida
      this.events.on('shutdown', () => {
        console.log('🔌 Escena tienda shutdown');
        this.performCleanup();
      });
      
      // Evento destroy - se llama cuando la escena es destruida
      this.events.on('destroy', () => {
        console.log('💥 Escena tienda destroy');
        this.performCleanup();
      });
    }

    leaveRoom() {
      console.log('🚪 Saliendo de sala tienda...');
      
      if (this.socket && this.socket.connected) {
        // Emitir que estamos cambiando a game
        this.socket.emit("joinRoom", {
          room: "game",
          username: this.Username || '---',
          lastScene: 'tiendajuego',
          x: 0,
          y: 0
        });
      }
      
      this.currentRoom = null;
      this.clearOtherPlayers();
    }

    cleanupBeforeTransition() {
      console.log('🧹 Limpiando antes de transición...');
      
      // Limpiar jugadores locales
      this.clearOtherPlayers();
      
      // Remover listeners del socket específicos de esta escena
      this.removeSocketListeners();
      
      // Resetear variables
      this.socketInitialized = false;
      this.myId = null;
    }

    performCleanup() {
      console.log('🧼 Limpieza completa de escena tienda');
      
      // Tell the server we are leaving this room BEFORE clearing socket
      if (this.socket && this.socket.connected) {
        this.socket.emit("joinRoom", {
          room: "game",
          username: this.Username || '---',
          lastScene: 'tiendajuego',
          x: this.player ? this.player.x : 0,
          y: this.player ? this.player.y : 0
        });
      }
      
      // Limpiar jugadores
      this.clearOtherPlayers();
      
      // Remover listeners del socket
      this.removeSocketListeners();
      
      // NO desconectar el socket global
      // Solo dejar de hacer referencia a él
      this.socket = null;
      
      // Remover referencia de escena activa
      if (window.activeScene === this) {
        window.activeScene = null;
      }
    }

    // Método para manejar reconexión del socket
    onSocketReconnect() {
      console.log('🔁 Reconexión detectada, reuniéndose a sala...');
      
      if (this.scene.isActive()) {
        this.time.delayedCall(1000, () => {
          this.initSocket();
        });
      }
    }

    cleanInactivePlayers() {
      const now = Date.now();
      const inactiveTimeout = 30000; // 30 segundos
      
      Object.keys(this.otherPlayers).forEach(playerId => {
        const player = this.otherPlayers[playerId];
        if (now - player.lastUpdate > inactiveTimeout) {
          console.log(`🕐 Jugador ${playerId} inactivo, removiendo...`);
          this.removeOtherPlayer(playerId);
        }
      });
    }

    // ================================
    // TRANSICIÓN A OTRA ESCENA
    // ================================

    // Modifica la sección donde detectas colisión con la puerta:
    // Reemplaza la parte que hace this.scene.start("LoadingScenegame") con:

    transitionToGameScene() {
      console.log('🚪 Transicionando a GameScene desde tienda...');
      
      this.queuedAction({ type: 'forSpam2'});
      
      // 2. Limpiar socket y jugadores
      this.cleanupBeforeTransition();
      
      // 3. Ocultar elementos del DOM
      this.hideHudElements();
      
      // 4. Cambiar a LoadingScene con delay para asegurar limpieza
      this.time.delayedCall(100, () => {
        // Emitir joinRoom a game antes de cambiar (FIXED: was emitting "tienda" by mistake)
        if (this.socket && this.socket.connected) {
          this.socket.emit("joinRoom", {
            room: "game",
            username: this.Username || '---',
            lastScene: 'tiendajuego',
            x: 1552,
            y: 1531
          });
        }
        
        // Cambiar escena (FIXED: targetScene was "tiendajuego" by mistake)
        this.scene.start("LoadingScenegame", {
          targetScene: "GameScene",
          playerData: {
            x: 1552,
            y: 1531,
            mundo: 1
          }
        });
      });
    }

    hideHudElements() {
      // Ocultar HUD
      const gameHud = document.getElementById('game-hud');
      if (gameHud) {
        gameHud.classList.remove('hud-visible');
        gameHud.classList.add('hud-hidden');
      }
      
      // Limpiar texto de moneda
      const infoText = document.getElementById('info-text-left');
      if (infoText) infoText.textContent = '';
      
      // Ocultar slots rápidos
      document.querySelectorAll('.quick-slot').forEach(slot => {
        slot.style.display = 'none';
      });
      
      // Ocultar hub de vida
      const cajahub = document.getElementById('cajahub');
      if (cajahub) cajahub.style.display = 'none';
      
      // Ocultar imagen del jugador
      this.actualizarImagenJugador('');
      this.actualizarNombreUsuario('');
      
      // Resetear barras visualmente (sin sync al contrato)
      const _savedReady = this._statsReady;
      this._statsReady = false;
      this.actualizarBarraVida(0);
      this.actualizarBarraAgua(0);
      this.actualizarBarraComida(0);
      this._statsReady = _savedReady;
      
      // Ocultar HUD extendido
      const hudContainer = document.getElementById('hud-containerx2');
      if (hudContainer) hudContainer.style.display = 'none';
      
      // Ocultar chat
      const chatBtn = document.getElementById('open-chat-btn');
      const chatPanel = document.getElementById('chat-panel');
      if (chatBtn) chatBtn.style.display = 'none';
      if (chatPanel) chatPanel.style.display = 'none';
      
      // Ocultar coordenadas
      const uiText = document.getElementById('game-ui-text');
      if (uiText) uiText.style.display = 'none';
      
      // Remover listeners del DOM
      this.removeListener();
    }









  // -----------------------------
  // DOM / Chat UI helpers
  // -----------------------------
  _setupChatDom() {
    this.openBtn = document.getElementById('open-chat-btn');
    this.chatPanel = document.getElementById('chat-panel');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');

    // Validar que existan
    if (!this.openBtn || !this.chatPanel || !this.chatMessages || !this.chatInput) {
      console.warn('Elementos de chat no encontrados en el DOM. Asegúrate de que el HTML esté presente.');
      return;
    }

    // Asegurar botón visible (puede ser controlado por CSS)
    this.openBtn.style.display = this.openBtn.style.display || 'flex';

    // Toggle panel
    this._chatOpen = false;
    const toggleChat = (force) => {
      this._chatOpen = (typeof force === 'boolean') ? force : !this._chatOpen;
      this.chatPanel.classList.toggle('chat-hidden', !this._chatOpen);
      if (this._chatOpen) this.chatInput.focus();
    };

    this.openBtn.addEventListener('click', () => toggleChat());
    this.openBtn.addEventListener('keyup', (e) => { if (e.key === 'Enter') toggleChat(); });
    

    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this._sendChatFromInput();
      } else if (e.key === 'Escape') {
        toggleChat(false);
      }
    });

    this._typingTimer = null;
    this._isTyping = false;
    this.chatInput.addEventListener('input', () => {
      if (this.chatInput.value.length > 0) {
        if (!this._isTyping) {
          this._isTyping = true;
          if (this.socket && this.socket.connected)
            this.socket.emit('chatTyping', { typing: true, usernamex: this.Username || '---' });
        }
        clearTimeout(this._typingTimer);
        this._typingTimer = setTimeout(() => {
          this._isTyping = false;
          if (this.socket && this.socket.connected)
            this.socket.emit('chatTyping', { typing: false, usernamex: this.Username || '---' });
        }, 1500);
      } else {
        clearTimeout(this._typingTimer);
        this._isTyping = false;
        if (this.socket && this.socket.connected)
          this.socket.emit('chatTyping', { typing: false, usernamex: this.Username || '---' });
      }
    });

  }

  // -----------------------------
  // Envío de mensajes
  // -----------------------------
  _sendChatFromInput() {
    if (!this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    // rate limit cliente
    const now = Date.now();
    if (now - this._lastChatSent < this._chatRateLimitMs) {
      this.appendSystemMessage('Por favor espera un momento antes de enviar otro mensaje.');
      return;
    }
    this._lastChatSent = now;

    // preparar payload
    const payload = {
      usernamex: this.Username || '---',
      text
    };

    if (!this.socket || !this.socket.connected) {
      this.appendSystemMessage('No conectado al servidor de chat.');
      return;
    }

    // emitir y limpiar input
    this.socket.emit('chatMessage', payload);
    this._isTyping = false;
    clearTimeout(this._typingTimer);
    if (this.socket && this.socket.connected)
      this.socket.emit('chatTyping', { typing: false, usernamex: this.Username || '---' });
    this._showLocalChatBubble(text);
    this.chatInput.value = '';
  }

  // -----------------------------
  // Append messages (DOM safe)
  // -----------------------------
  // ─── Chat Bubble methods (same as GameScene) ────────────────────────────
  _showLocalTyping(show) {
    const bubble = document.getElementById('local-chat-bubble');
    if (!bubble) return;
    if (show) {
      bubble.innerHTML = '<div class="chat-typing-dots"><span></span><span></span><span></span></div>';
      bubble.style.display = 'flex';
      this._positionLocalBubble(bubble);
    } else { bubble.style.display = 'none'; bubble.innerHTML = ''; }
  }
  _positionLocalBubble(bubble) {
    if (!this.player || !this.cameras || !this.cameras.main) return;
    const cam = this.cameras.main;
    const sx = (this.player.x - cam.scrollX) * cam.zoom + (this.scale.width  * 0.5 * (1 - cam.zoom));
    const sy = (this.player.y - cam.scrollY) * cam.zoom + (this.scale.height * 0.5 * (1 - cam.zoom));
    const sprH = (this.player.displayHeight || 64) * cam.zoom;
    bubble.style.left = sx + 'px';
    bubble.style.top  = (sy - sprH * 0.5 - 54) + 'px';
    bubble.style.transform = 'translateX(-50%)';
  }
  _showLocalChatBubble(text) {
    const bubble = document.getElementById('local-chat-bubble');
    if (!bubble) return;
    const lines = text.split('\n').slice(-3).join('\n');
    bubble.innerHTML = `<div class="chat-bubble-msg own">${this._escHtml(lines)}</div>`;
    bubble.style.display = 'flex';
    this._positionLocalBubble(bubble);
    clearTimeout(this._localBubbleTimer);
    this._localBubbleTimer = setTimeout(() => { bubble.style.display='none'; bubble.innerHTML=''; }, 4000);
  }
  _escHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  _showRemoteChatBubble(playerId, text) {
    const op = this.otherPlayers && this.otherPlayers[playerId];
    if (!op || !op.sprite) return;
    op._lastChatMsg = text;
    if (op._chatContainer) { op._chatContainer.destroy(); op._chatContainer = null; }
    if (op._typingContainer) { op._typingContainer.destroy(); op._typingContainer = null; }
    clearTimeout(op._chatTimer);
    clearTimeout(op._typingHideTimer);
    const sprH = op.sprite.displayHeight || 64;
    const clipped = text.length > 70 ? text.slice(0, 70) + '…' : text;
    op._chatContainer = this.add.text(
      op.sprite.x, op.sprite.y - sprH*0.5 - 50, clipped,
      { fontFamily:'"PressStart2P"', fontSize:'7px', color:'#d0eaff',
        backgroundColor:'rgba(8,18,45,0.90)', padding:{x:7,y:5},
        wordWrap:{width:170}, stroke:'#001030', strokeThickness:2,
        resolution:4, lineSpacing:4 }
    ).setOrigin(0.5,1).setDepth(99998);
    op._chatTimer = setTimeout(() => { if(op._chatContainer){op._chatContainer.destroy();op._chatContainer=null;} }, 5000);
  }
  _showRemoteTypingBubble(playerId, show) {
    const op = this.otherPlayers && this.otherPlayers[playerId];
    if (!op || !op.sprite) return;
    if (op._typingContainer) { op._typingContainer.destroy(); op._typingContainer = null; }
    clearTimeout(op._typingHideTimer);
    if (!show) return;
    const sprH = op.sprite.displayHeight || 64;
    // Dots appear between name and message: just below name line (-14)
    const dotsY = op.sprite.y - sprH*0.5 - 26;
    op._typingContainer = this.add.text(
      op.sprite.x, dotsY, '...',
      { fontFamily:'"PressStart2P"', fontSize:'7px', color:'#80c8ff',
        backgroundColor:'rgba(8,18,45,0.85)', padding:{x:7,y:4},
        stroke:'#001030', strokeThickness:2, resolution:4 }
    ).setOrigin(0.5,1).setDepth(99998);
    op._typingHideTimer = setTimeout(() => { if(op._typingContainer){op._typingContainer.destroy();op._typingContainer=null;} }, 3500);
  }


  // =========================================================================
  // MAIL PANEL — identical implementation used by both scenes
  // =========================================================================
  _openMailPanel() {
    let panel = document.getElementById('_mail-panel-root');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = '_mail-panel-root';
      panel.style.cssText = [
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)',
        'width:400px;max-width:96vw;max-height:80vh',
        'background:#0d1b2a;border:2px solid #1e3a5f;border-radius:10px',
        'padding:18px;z-index:99999;color:#c8e8ff',
        'font-family:"PressStart2P",cursive;display:flex;flex-direction:column;gap:10px',
        'box-shadow:0 0 30px rgba(0,80,180,0.6)'
      ].join(';');
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:#40a0ff;">📬 MAILBOX</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="_mail-read-all" style="font-size:7px;padding:4px 8px;background:#1e3a5f;border:1px solid #40a0ff;border-radius:4px;color:#c8e8ff;cursor:pointer;font-family:inherit;">✔ Read All</button>
            <button id="_mail-clear-all" style="font-size:7px;padding:4px 8px;background:#3a1e1e;border:1px solid #ff6060;border-radius:4px;color:#ffc8c8;cursor:pointer;font-family:inherit;">🗑 Clear All</button>
            <button id="_mail-close" style="background:none;border:none;color:#c8e8ff;font-size:16px;cursor:pointer;line-height:1;">✕</button>
          </div>
        </div>
        <div id="_mail-list" style="overflow-y:auto;max-height:55vh;display:flex;flex-direction:column;gap:8px;"></div>
        <div id="_mail-empty" style="font-size:8px;text-align:center;color:#6080a0;padding:20px;display:none;">No messages</div>
      `;
      document.body.appendChild(panel);
    }
    panel.style.display = 'flex';
    const closeBtn = document.getElementById('_mail-close');
    if (closeBtn && !closeBtn._wired) {
      closeBtn._wired = true;
      closeBtn.onclick = () => { panel.style.display = 'none'; };
    }
    const readAllBtn = document.getElementById('_mail-read-all');
    if (readAllBtn && !readAllBtn._wired) {
      readAllBtn._wired = true;
      readAllBtn.onclick = () => this._markAllMailRead();
    }
    const clearAllBtn = document.getElementById('_mail-clear-all');
    if (clearAllBtn && !clearAllBtn._wired) {
      clearAllBtn._wired = true;
      clearAllBtn.onclick = () => this._clearAllMail();
    }
    this._fetchMails();
  }

  async _fetchMails() {
    if (!this.Username) return;
    const list = document.getElementById('_mail-list');
    const empty = document.getElementById('_mail-empty');
    if (!list) return;
    list.innerHTML = '<div style="font-size:7px;color:#6080a0;text-align:center;padding:12px;">Loading...</div>';
    try {
      const base = this.serverBase || this.serverclient1 || '';
      const res = await fetch(`${base}/api/mail/${encodeURIComponent(this.Username)}`, { credentials:'include' });
      const data = res.ok ? await res.json() : { mails: [] };
      const mails = Array.isArray(data.mails) ? data.mails : [];
      list.innerHTML = '';
      if (mails.length === 0) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      mails.forEach(mail => {
        const item = document.createElement('div');
        item.dataset.mailId = mail.id;
        item.style.cssText = [
          'display:flex;flex-direction:column;gap:4px',
          `background:${mail.read ? '#0a1422' : '#112240'}`,
          `border:1px solid ${mail.read ? '#1e3a5f' : '#2060a0'}`,
          'border-radius:6px;padding:10px;position:relative'
        ].join(';');
        item.innerHTML = `
          <button class="_mail-x" data-id="${mail.id}" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#ff6060;font-size:13px;cursor:pointer;line-height:1;" title="Delete">✕</button>
          <div style="font-size:8px;color:${mail.read ? '#6080a0' : '#40a0ff'};padding-right:20px;">${this._escHtml(mail.subject || '(no subject)')}</div>
          <div style="font-size:7px;color:#c8e8ff;line-height:1.5;">${this._escHtml(mail.body || '')}</div>
          <div style="font-size:6px;color:#405070;margin-top:2px;">${mail.from ? 'From: '+this._escHtml(mail.from) : ''} ${mail.date ? '· '+new Date(mail.date).toLocaleDateString() : ''}</div>
        `;
        list.appendChild(item);
      });
      list.querySelectorAll('._mail-x').forEach(btn => {
        btn.onclick = () => this._deleteMail(btn.dataset.id);
      });
    } catch(e) {
      if (list) list.innerHTML = '<div style="font-size:7px;color:#ff6060;text-align:center;padding:12px;">Error loading mail</div>';
    }
  }

  async _markAllMailRead() {
    const base = this.serverBase || this.serverclient1 || '';
    try {
      await fetch(`${base}/api/mail/${encodeURIComponent(this.Username)}/read-all`, {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':window.csrfToken||''}
      });
      this._fetchMails();
    } catch(_) {}
  }

  async _clearAllMail() {
    const base = this.serverBase || this.serverclient1 || '';
    try {
      await fetch(`${base}/api/mail/${encodeURIComponent(this.Username)}/clear`, {
        method:'DELETE', credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':window.csrfToken||''}
      });
      this._fetchMails();
    } catch(_) {}
  }

  async _deleteMail(mailId) {
    if (!mailId) return;
    const base = this.serverBase || this.serverclient1 || '';
    try {
      await fetch(`${base}/api/mail/${encodeURIComponent(this.Username)}/${encodeURIComponent(mailId)}`, {
        method:'DELETE', credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':window.csrfToken||''}
      });
      this._fetchMails();
    } catch(_) {}
  }

  _escHtml(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /** Show a centered screen banner for 2.5 s (green by default, red if isError, blue if isInfo) */
  _showCenterBanner(message, isError = false, isInfo = false) {
    const old = document.getElementById('_save-success-banner');
    if (old) old.remove();
    const banner = document.createElement('div');
    banner.id = '_save-success-banner';
    banner.textContent = message;
    Object.assign(banner.style, {
      position:'fixed', top:'50%', left:'50%',
      transform:'translate(-50%,-50%)',
      background: isError ? 'rgba(180,30,30,0.93)' : isInfo ? 'rgba(20,40,80,0.93)' : 'rgba(20,80,40,0.93)',
      color:'#ffffff',
      border: isError ? '2px solid #ff6666' : isInfo ? '2px solid #4080ff' : '2px solid #66ff99',
      borderRadius:'10px', padding:'18px 36px', fontSize:'14px',
      fontFamily:'"PressStart2P",cursive,sans-serif', fontWeight:'bold',
      zIndex:'99999', textAlign:'center',
      boxShadow:'0 4px 32px rgba(0,0,0,0.7)', letterSpacing:'1px',
      pointerEvents:'none', transition:'opacity 0.4s ease'
    });
    document.body.appendChild(banner);
    setTimeout(() => { banner.style.opacity = '0'; }, 2100);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 2600);
  }

  appendMessage(m , playerInfo) {
    // Acepta undefined y lo maneja defensivamente
    const msg = m || {};
    // Si el servidor no escapó, aquí usamos textContent para evitar HTML inyectado.
    const name = msg.playerName || '---';
    const text = msg.text || '';
    const ts = msg.ts ? new Date(msg.ts) : new Date();

    // Crear elementos sin usar innerHTML
    const line = document.createElement('div');
    line.className = 'chat-line';

    const strong = document.createElement('strong');
    strong.textContent = name + ((this.socket && msg.id === this.socket.id) ? ' (tú):' : ':');
    strong.style.color = '#b3ffb3';

    const textNode = document.createTextNode(' ' + text);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = ts.toLocaleTimeString();

    line.appendChild(strong);
    line.appendChild(textNode);
    line.appendChild(timeSpan);

    if (!this.chatMessages) {
      // Si no hay DOM (p. ej. game ejecutándose sin UI), imprimir por consola
      console.log(`[CHAT] ${name}: ${text} (${timeSpan.textContent})`);
      return;
    }

    this.chatMessages.appendChild(line);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  appendSystemMessage(text) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.style.color = '#ffb3b3';
    line.textContent = text;
    if (this.chatMessages) {
      this.chatMessages.appendChild(line);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    } else {
      console.warn('System message:', text);
    }
  }

  // -----------------------------
  // Cleanup
  // -----------------------------
  _onShutdown() {
    if (this.socket) {
      try {
        this.socket.off(); // remover listeners
        this.socket.disconnect();
      } catch (e) { /* ignore */ }
      this.socket = null;
    }
  }

















  
// ================================
// SISTEMA DE SONIDO Y PANEL DE AUDIO - VERSIÓN CORREGIDA
// ================================

// Versión más segura con verificación
stopMusicSafely() {
  try {
    if (!this.audioState) {
      console.warn('⚠️ Sistema de audio no inicializado');
      return false;
    }
    
    if (!this.audioState.currentMusic) {
      console.log('ℹ️ No hay música activa');
      return false;
    }
    
    // Verificar si la música está realmente reproduciéndose
    if (this.audioState.currentMusic.isPlaying) {
      this.audioState.currentMusic.stop();
    }
    
    // Limpiar
    this.audioState.currentMusic.destroy();
    this.audioState.currentMusic = null;
    this.audioState.currentMusicKey = null;
    
    console.log('⏹️ Música detenida correctamente');
    return true;
    
  } catch (error) {
    console.error('❌ Error al detener música:', error);
    return false;
  }
}

// Inicializar el sistema de audio
initAudioSystem() {
  console.log('🎵 Inicializando sistema de audio...');
  
  // Estado del audio — volúmenes REALES (lo que se guarda) separados de los APLICADOS (consideran mute)
  this.audioState = {
    _musicVolumeReal: 0.7,
    _sfxVolumeReal: 0.7,
    musicVolumeApplied: 0.7,
    sfxVolumeApplied: 0.7,
    musicMuted: false,
    sfxMuted: false,
    currentMusic: null,
    currentMusicKey: null,
    activeSFX: new Set()
  };
  
  // Cargar configuración guardada
  this.loadAudioSettings();
  
  // Recalcular aplicados tras cargar
  this.audioState.musicVolumeApplied = this.audioState.musicMuted ? 0 : this.audioState._musicVolumeReal;
  this.audioState.sfxVolumeApplied   = this.audioState.sfxMuted   ? 0 : this.audioState._sfxVolumeReal;
  // NO usar this.sound.volume aquí porque afectaría también a la música
  
  // Inicializar panel de sonido
  this.initSoundHub();
  
  this.sfxGroup = this.sound;
  
  console.log('✅ Sistema de audio inicializado');
}

// Cargar configuración de audio desde localStorage
loadAudioSettings() {
  try {
    // Usar las mismas claves que GameScene para compartir configuración entre escenas
    const musicVol  = localStorage.getItem('grassland_music_volume');
    const sfxVol    = localStorage.getItem('grassland_sfx_volume');
    const musicMute = localStorage.getItem('grassland_music_muted');
    const sfxMute   = localStorage.getItem('grassland_sfx_muted');

    if (musicVol  !== null) this.audioState._musicVolumeReal = Phaser.Math.Clamp(parseFloat(musicVol), 0, 1);
    if (sfxVol    !== null) this.audioState._sfxVolumeReal   = Phaser.Math.Clamp(parseFloat(sfxVol),   0, 1);
    if (musicMute !== null) this.audioState.musicMuted = musicMute === 'true';
    if (sfxMute   !== null) this.audioState.sfxMuted   = sfxMute   === 'true';

    console.log('🔊 Configuración de audio cargada');
  } catch (error) {
    console.warn('⚠️ Error cargando configuración de audio:', error);
  }
}

// Guardar configuración de audio
saveAudioSettings() {
  try {
    // Mismas claves que GameScene para compartir configuración entre escenas
    localStorage.setItem('grassland_music_volume', this.audioState._musicVolumeReal.toString());
    localStorage.setItem('grassland_sfx_volume',   this.audioState._sfxVolumeReal.toString());
    localStorage.setItem('grassland_music_muted',  this.audioState.musicMuted.toString());
    localStorage.setItem('grassland_sfx_muted',    this.audioState.sfxMuted.toString());
    
    console.log('💾 Configuración de audio guardada');
    
  } catch (error) {
    console.error('❌ Error guardando configuración de audio:', error);
    this.showNotification('Error guardando configuración', 'error');
  }
}

// Inicializar el panel de sonido
initSoundHub() {
  const panel = document.getElementById('sound-hub-panel');
  if (!panel) {
    console.error('❌ No se encontró el panel de sonido en el DOM');
    return;
  }
  
  // Referencias a elementos DOM
  this.soundHubElements = {
    panel: panel,
    closeBtn: document.getElementById('sound-hub-close'),
    musicSlider: document.getElementById('music-slider'),
    musicPercent: document.getElementById('music-percent'),
    musicSliderFill: document.getElementById('music-slider-fill'),
    musicTestBtn: document.getElementById('music-test-btn'),
    musicMuteBtn: document.getElementById('music-mute-btn'),
    sfxSlider: document.getElementById('sfx-slider'),
    sfxPercent: document.getElementById('sfx-percent'),
    sfxSliderFill: document.getElementById('sfx-slider-fill'),
    sfxTestBtn: document.getElementById('sfx-test-btn'),
    sfxMuteBtn: document.getElementById('sfx-mute-btn'),
    musicSelect: document.getElementById('music-select'),
    musicChangeBtn: document.getElementById('music-change-btn'),
    saveBtn: document.getElementById('sound-save-btn')
  };
  
  // Inicializar valores de los controles
  this.updateSoundHubControls();
  
  // Configurar event listeners
  this.setupSoundHubEvents();
  
  console.log('✅ Panel de sonido inicializado');
}

// Actualizar controles del panel con los valores actuales
updateSoundHubControls() {
  const el = this.soundHubElements;
  
  if (!el.musicSlider || !el.sfxSlider) return;
  
  // Valores de música
  const musicValue = Math.round(this.audioState._musicVolumeReal * 100);
  el.musicSlider.value = musicValue;
  el.musicPercent.textContent = `${musicValue}%`;
  el.musicSliderFill.style.width = `${musicValue}%`;
  el.musicMuteBtn.textContent = this.audioState.musicMuted ? 'Activar' : 'Silenciar';
  el.musicMuteBtn.classList.toggle('muted', this.audioState.musicMuted);
  
  // Valores de efectos
  const sfxValue = Math.round(this.audioState._sfxVolumeReal * 100);
  el.sfxSlider.value = sfxValue;
  el.sfxPercent.textContent = `${sfxValue}%`;
  el.sfxSliderFill.style.width = `${sfxValue}%`;
  el.sfxMuteBtn.textContent = this.audioState.sfxMuted ? 'Activar' : 'Silenciar';
  el.sfxMuteBtn.classList.toggle('muted', this.audioState.sfxMuted);
  
  // Actualizar música actual en el selector
  if (this.audioState.currentMusicKey && el.musicSelect) {
    el.musicSelect.value = this.audioState.currentMusicKey;
  }
}

// Configurar eventos del panel de sonido
setupSoundHubEvents() {
  const el = this.soundHubElements;
  
  // Cerrar panel
  if (el.closeBtn) {
    el.closeBtn.addEventListener('click', () => {
      this.hideSoundHub();
    });
  }
  
  // Control deslizante de música
  if (el.musicSlider) {
    el.musicSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      el.musicPercent.textContent = `${value}%`;
      el.musicSliderFill.style.width = `${value}%`;
      
      // Actualizar volumen real y aplicar a la música actual
      this.audioState._musicVolumeReal = value / 100;
      if (!this.audioState.musicMuted) {
        this.audioState.musicVolumeApplied = value / 100;
        if (this.audioState.currentMusic) {
          this.audioState.currentMusic.setVolume(value / 100);
        }
      }
      // Guardar automáticamente sin notificación
      try {
        localStorage.setItem('grassland_music_volume', this.audioState._musicVolumeReal.toString());
        localStorage.setItem('grassland_music_muted',  this.audioState.musicMuted.toString());
      } catch(err) { /* ignorar */ }
    });
  }
  
  // Botón de prueba de música
  if (el.musicTestBtn) {
    el.musicTestBtn.addEventListener('click', () => {
      this.playTestMusic();
    });
  }
  
  // Botón de silenciar música
  if (el.musicMuteBtn) {
    el.musicMuteBtn.addEventListener('click', () => {
      this.toggleMusicMute();
      try {
        localStorage.setItem('grassland_music_muted', this.audioState.musicMuted.toString());
      } catch(err) { /* ignorar */ }
    });
  }
  
  // Control deslizante de efectos
  if (el.sfxSlider) {
    el.sfxSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      el.sfxPercent.textContent = `${value}%`;
      el.sfxSliderFill.style.width = `${value}%`;
      
      // Actualizar volumen real — NO usar this.sound.volume porque afecta también la música
      this.audioState._sfxVolumeReal = value / 100;
      if (!this.audioState.sfxMuted) {
        this.audioState.sfxVolumeApplied = value / 100;
        if (this.audioState.activeSFX) {
          this.audioState.activeSFX.forEach(s => { if (s.isPlaying) s.setVolume(value / 100); });
        }
      }
      // Guardar automáticamente sin notificación
      try {
        localStorage.setItem('grassland_sfx_volume', this.audioState._sfxVolumeReal.toString());
        localStorage.setItem('grassland_sfx_muted',  this.audioState.sfxMuted.toString());
      } catch(err) { /* ignorar */ }
    });
  }
  
  // Botón de prueba de efectos
  if (el.sfxTestBtn) {
    el.sfxTestBtn.addEventListener('click', () => {
      this.playTestSFX();
    });
  }
  
  // Botón de silenciar efectos
  if (el.sfxMuteBtn) {
    el.sfxMuteBtn.addEventListener('click', () => {
      this.toggleSFXMute();
      try {
        localStorage.setItem('grassland_sfx_muted', this.audioState.sfxMuted.toString());
      } catch(err) { /* ignorar */ }
    });
  }
  
  // Botón para cambiar música
  if (el.musicChangeBtn) {
    el.musicChangeBtn.addEventListener('click', () => {
      const selectedMusic = el.musicSelect ? el.musicSelect.value : 'default';
      this.changeMusic(selectedMusic);
    });
  }
  
  // Botón de guardar
  if (el.saveBtn) {
    el.saveBtn.addEventListener('click', () => {
      this.saveAudioSettings();
      this._showCenterBanner('Configuration Saved');
      this.hideSoundHub();
    });
  }
  
  // Cerrar al presionar Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && this.isSoundHubVisible()) {
      this.hideSoundHub();
    }
  });
  
  // Cerrar al hacer clic fuera del panel
  if (el.panel) {
    el.panel.addEventListener('click', (e) => {
      if (e.target === el.panel) {
        this.hideSoundHub();
      }
    });
  }
}

// Mostrar panel de sonido
showSoundHub() {
  const panel = this.soundHubElements.panel;
  if (!panel) return;
  
  // Actualizar controles antes de mostrar
  this.updateSoundHubControls();
  
  // Mostrar panel
  panel.classList.remove('sound-hub-hidden');
  panel.classList.add('sound-hub-visible');
  panel.setAttribute('aria-hidden', 'false');
  
  // NOTE: Do NOT pause the scene — pausing causes the GameScene background
  // to render visibly and then disappear when resumed, which is confusing.
  
  console.log('🔊 Panel de sonido mostrado');
}

// Ocultar panel de sonido
hideSoundHub() {
  const panel = this.soundHubElements.panel;
  if (!panel) return;
  
  // Ocultar panel
  panel.classList.remove('sound-hub-visible');
  panel.classList.add('sound-hub-hidden');
  panel.setAttribute('aria-hidden', 'true');
  
  // NOTE: scene was not paused, so no need to resume
  
  console.log('🔊 Panel de sonido ocultado');
}

// Verificar si el panel está visible
isSoundHubVisible() {
  const panel = this.soundHubElements.panel;
  return panel && panel.classList.contains('sound-hub-visible');
}

// Cambiar texto del botón de guardar
setSaveButtonText(text) {
  const saveBtn = this.soundHubElements.saveBtn;
  if (saveBtn) {
    saveBtn.textContent = text;
    console.log(`🔧 Texto del botón de guardar cambiado a: "${text}"`);
  }
}

// ================================
// FUNCIONES DE CONTROL DE AUDIO
// ================================

// Establecer volumen de música (0-1)
setMusicVolume(volume) {
  const clamped = Phaser.Math.Clamp(volume, 0, 1);
  this.audioState._musicVolumeReal = clamped;
  if (!this.audioState.musicMuted) {
    this.audioState.musicVolumeApplied = clamped;
    if (this.audioState.currentMusic) {
      this.audioState.currentMusic.setVolume(clamped);
    }
  }
  console.log(`🎵 Volumen de música: ${clamped}`);
}

// Establecer volumen de efectos (0-1) — NO usar this.sound.volume porque afecta la música
setSFXVolume(volume) {
  const clamped = Phaser.Math.Clamp(volume, 0, 1);
  this.audioState._sfxVolumeReal = clamped;
  if (!this.audioState.sfxMuted) {
    this.audioState.sfxVolumeApplied = clamped;
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.forEach(s => { if (s.isPlaying) s.setVolume(clamped); });
    }
  }
  console.log(`🔊 Volumen de efectos: ${clamped}`);
}

// Alternar silencio de música
toggleMusicMute() {
  this.audioState.musicMuted = !this.audioState.musicMuted;
  
  if (this.audioState.musicMuted) {
    this.audioState.musicVolumeApplied = 0;
    if (this.audioState.currentMusic) this.audioState.currentMusic.setVolume(0);
  } else {
    this.audioState.musicVolumeApplied = this.audioState._musicVolumeReal;
    if (this.audioState.currentMusic) this.audioState.currentMusic.setVolume(this.audioState._musicVolumeReal);
  }
  
  this.updateSoundHubControls();
  console.log(`🎵 Música ${this.audioState.musicMuted ? 'silenciada' : 'activada'}`);
}

// Alternar silencio de efectos — NO usar this.sound.volume porque afecta la música
toggleSFXMute() {
  this.audioState.sfxMuted = !this.audioState.sfxMuted;
  
  if (this.audioState.sfxMuted) {
    this.audioState.sfxVolumeApplied = 0;
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.forEach(s => { if (s.isPlaying) s.setVolume(0); });
    }
  } else {
    this.audioState.sfxVolumeApplied = this.audioState._sfxVolumeReal;
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.forEach(s => { if (s.isPlaying) s.setVolume(this.audioState._sfxVolumeReal); });
    }
  }
  
  this.updateSoundHubControls();
  console.log(`🔊 Efectos ${this.audioState.sfxMuted ? 'silenciados' : 'activados'}`);
}

// Reproducir música
playMusic(key, config = {}) {
  if (this.audioState.currentMusic) {
    this.audioState.currentMusic.stop();
  }
  
  const defaultConfig = {
    volume: this.audioState.musicVolumeApplied, // usa el volumen aplicado (considera mute)
    loop: true,
    delay: 0
  };
  
  const finalConfig = { ...defaultConfig, ...config };
  
  try {
    this.audioState.currentMusic = this.sound.add(key, finalConfig);
    this.audioState.currentMusicKey = key;
    this.audioState.currentMusic.play();
    
    console.log(`🎵 Reproduciendo música: ${key} (volumen: ${finalConfig.volume})`);
    
    if (this.soundHubElements.musicSelect && this.isSoundHubVisible()) {
      this.soundHubElements.musicSelect.value = key;
    }
    
    return this.audioState.currentMusic;
  } catch (error) {
    console.error(`❌ Error reproduciendo música ${key}:`, error);
    return null;
  }
}

// Cambiar música
changeMusic(key) {
  if (key === 'none') {
    // Detener música
    if (this.audioState.currentMusic) {
      this.audioState.currentMusic.stop();
      this.audioState.currentMusic = null;
      this.audioState.currentMusicKey = null;
    }
    console.log('🎵 Música detenida');
  } else {
    // Cambiar a nueva música
    this.playMusic(key);
  }
}

// Reproducir efecto de sonido
playSFX(key, config = {}) {
  // Configuración por defecto
  const defaultConfig = {
    volume: this.audioState.sfxMuted ? 0 : this.audioState.sfxVolume
  };
  
  const finalConfig = { ...defaultConfig, ...config };
  
  try {
    // Verificar si el sonido existe en caché
    if (!this.cache.audio.exists(key)) {
      console.warn(`⚠️ Sonido no encontrado: ${key}`);
      return null;
    }
    
    const sound = this.sound.add(key, finalConfig);
    sound.play();
    
    console.log(`🔊 Reproduciendo efecto: ${key}`, finalConfig);
    return sound;
  } catch (error) {
    console.error(`❌ Error reproduciendo efecto ${key}:`, error);
    return null;
  }
}

// Reproducir música de prueba
playTestMusic() {
  // Intentar reproducir una música de prueba
  // Si no existe, usar la música actual o un tono de prueba
  if (this.audioState.currentMusic) {
    // Reiniciar música actual
    this.audioState.currentMusic.stop();
    this.audioState.currentMusic.play();
    console.log('🎵 Reproduciendo música actual de prueba');
  } else {
    // Crear un sonido de prueba simple
    const testSound = this.sound.add('test-beep', {
      volume: this.audioState.musicMuted ? 0 : this.audioState.musicVolume,
      loop: false
    });
    
    if (testSound) {
      testSound.play();
      console.log('🎵 Reproduciendo tono de prueba');
    } else {
      console.log('⚠️ No hay música disponible para prueba');
    }
  }
}

// Reproducir efecto de prueba
playTestSFX() {
  try {
    // Verificar si existe un sonido de prueba
    const testSounds = ['click-sound', 'test-beep', 'test-sfx'];
    
    for (const soundKey of testSounds) {
      if (this.cache.audio.exists(soundKey)) {
        this.playSFX(soundKey, {
          volume: this.audioState.sfxMuted ? 0 : this.audioState.sfxVolume
        });
        console.log(`🔊 Reproduciendo efecto de prueba: ${soundKey}`);
        return;
      }
    }
    
    // Si no hay sonidos cargados, crear un tono simple
    console.log('🔊 Sin efectos cargados, creando tono de prueba...');
    this.createTestBeep();
    
  } catch (error) {
    console.warn('⚠️ Error en prueba de efectos:', error);
  }
}

// Crear un beep de prueba simple
createTestBeep() {
  try {
    // Crear un contexto de audio web simple
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440; // 440 Hz (La)
    oscillator.type = 'sine';
    
    gainNode.gain.value = this.audioState.sfxMuted ? 0 : this.audioState.sfxVolume * 0.1;
    
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 200);
    
    console.log('🔊 Tono de prueba generado');
  } catch (error) {
    console.warn('⚠️ No se pudo crear tono de prueba:', error);
  }
}








  resize(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;

    console.log(width, height);

    if (width <= 500) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(0.01);
    } else if (width <= 727) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(0.2);
    } else if (width <= 849) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(0.5);
    } else if (width <= 1272 && height <= 640) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(1);
    } else if (width >= 1590 && height >= 800) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(1.5);
    } else if (width >= 1920 && height >= 1080) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(2);
    } else if (width >= 2706 && height >= 1920) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(3);
    } else if (width >= 3608 && height >= 2560) {
      this.cameras.resize(width, height);
      this.cameras.main.setZoom(4);
    }
  }


// Selecciona/activa la casilla rápida índice (0..6) — ahora con toggle
selectQuickSlot(index) {
  if (!this.STATE || !Array.isArray(this.STATE.quickSlots)) return;
  const quickDiv = document.querySelector(`.quick-slot[data-slot-index="${index}"]`);
  const rect = quickDiv ? quickDiv.getBoundingClientRect() : { left: 0, top: 0, width: 32, height: 32 };
  const clickX = rect.left + rect.width / 2;
  const clickY = rect.top  + rect.height / 2;

  // Si ya estaba seleccionada, la volvemos a "clickear" para soltarla y deseleccionarla
  if (this.selectedQuickIndex === index) {
    try {
      // Simula el segundo click (esto normalmente coloca el item de vuelta / suelta)
      this.handleSlotClick('quick', index, clickX, clickY);
    } catch (e) {
      console.warn('selectQuickSlot toggle: handleSlotClick falló al intentar soltar.', e);
    }
    // Quitamos el resaltado y el índice seleccionado
    this.highlightQuickSlot(null);
    this.selectedQuickIndex = null;
    return;
  }

  // Si se selecciona una casilla distinta: ejecutar click normal y resaltar
  try {
    this.handleSlotClick('quick', index, clickX, clickY);
  } catch (e) {
    console.warn('selectQuickSlot: handleSlotClick falló al intentar seleccionar.', e);
  }
  this.highlightQuickSlot(index);
  this.selectedQuickIndex = index;
}

// Añade/remueve una clase CSS para mostrar qué quick slot está seleccionado
// Acepta index o null (null = quitar todos)
highlightQuickSlot(index) {
  document.querySelectorAll('.quick-slot').forEach((el, i) => {
    if (index !== null && i === index) {
      el.classList.add('quick-selected');
    } else {
      el.classList.remove('quick-selected');
    }
  });
}



// En la clase tiendajuego:
shutdown() {
  console.log("🔄 Cerrando conexión de socket para tienda");
  
  // Salir de la sala de la tienda
  if (this.socket && this.socket.connected) {
    this.socket.emit("joinRoom", {
      room: "game", // Cambiar a la sala del juego principal
      username: this.Username || '---',
      x: 0,
      y: 0
    });
  }
  
  // Limpiar jugadores locales
  Object.values(this.otherPlayers).forEach(p => {
    if (p.sprite) p.sprite.destroy();
    if (p.nameText) p.nameText.destroy();
  });
  this.otherPlayers = {};
  
  // No desconectar el socket global, solo salir de la sala
}


destroy() {
  this.shutdown();
  super.destroy();
}



  toggleHubInfo() {
    this.hubInfo.classList.toggle("collapsed");
    const estado = this.hubInfo.classList.contains("collapsed");
    localStorage.setItem("hubInfoCollapsed", estado.toString());
    console.log("Estado guardado:", estado);
  }

  loadState() {
    const estadoGuardado = localStorage.getItem("hubInfoCollapsed");
    if (estadoGuardado === "true") {
      this.hubInfo.classList.add("collapsed");
    } else {
      this.hubInfo.classList.remove("collapsed");
    }
  }

  removeListener() {
    this.profileImage.removeEventListener("click", this.toggleHubInfo);
  }



 makeElementDraggable(elementId) {
    const panel = document.getElementById(elementId);

    if (!panel) {
        console.warn(`Elemento con id ${elementId} no encontrado`);
        return;
    }

    if (!window.activeDraggablePanel) window.activeDraggablePanel = null;

    const originalDisplay = panel.style.display;
    const originalVisibility = panel.style.visibility;

    panel.style.position = "fixed";
    panel.style.zIndex = "1000";

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;

    const bringToFront = () => {
        if (window.activeDraggablePanel && window.activeDraggablePanel !== panel) {
            window.activeDraggablePanel.style.zIndex = "1000";
        }
        panel.style.zIndex = "1001";
        window.activeDraggablePanel = panel;
    };

    const centerPanel = () => {
        const hasPosition = panel.style.left && panel.style.top;
        if (!hasPosition) {
            const currentDisplay = panel.style.display;
            const currentVisibility = panel.style.visibility;

            panel.style.display = 'block';
            panel.style.visibility = 'hidden';
            panel.style.opacity = '0';

            const rect = panel.getBoundingClientRect();
            const panelWidth = rect.width;
            const panelHeight = rect.height;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            panel.style.left = `${Math.max(0, (viewportWidth - panelWidth) / 2)}px`;
            panel.style.top = `${Math.max(0, (viewportHeight - panelHeight) / 3)}px`;
            panel.style.transform = "none";

            panel.style.display = currentDisplay;
            panel.style.visibility = currentVisibility;
            panel.style.opacity = '';

            console.log(`Panel ${elementId} posicionado centrado (pero no visible):`, {
                left: panel.style.left,
                top: panel.style.top
            });
        }
    };

    const startDrag = (clientX, clientY) => {
        bringToFront();
        isDragging = true;
        startX = clientX;
        startY = clientY;

        const rect = panel.getBoundingClientRect();
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;

        document.body.style.userSelect = "none";
        panel.style.boxShadow = "0 0 15px rgba(0, 0, 0, 0.6)";
        panel.style.opacity = "0.95";
    };

    const drag = (clientX, clientY) => {
        if (!isDragging) return;

        let newLeft = clientX - offsetX;
        let newTop = clientY - offsetY;

        const rect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
        newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
        panel.style.transform = "none";
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;

        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        // Restore custom game cursor after drag
        if (this.input && this.input.setDefaultCursor) {
          this.input.setDefaultCursor('url("./Game/Source/cursor.png") 8 8, pointer');
        }

        panel.style.boxShadow = "";
        panel.style.opacity = "1";

        console.log(`Panel ${elementId} liberado en posición:`, {
            left: panel.style.left,
            top: panel.style.top
        });
    };

    // Guardar referencias de funciones para remover listeners luego
    panel._dragHandlers = {
        mousedown: (e) => { if (e.button === 0) { startDrag(e.clientX, e.clientY); e.stopPropagation(); } },
        touchstart: (e) => { if (e.touches.length === 1) { const t = e.touches[0]; startDrag(t.clientX, t.clientY); e.stopPropagation(); } },
        dragstart: (e) => { e.preventDefault(); }
    };

    document._dragHandlers = {
        mousemove: (e) => drag(e.clientX, e.clientY),
        mouseup: (e) => { if (e.button === 0) endDrag(); },
        touchmove: (e) => { if (isDragging && e.touches.length === 1) { const t = e.touches[0]; drag(t.clientX, t.clientY); e.preventDefault(); } },
        touchend: endDrag,
        touchcancel: endDrag,
        keydown: (e) => { if (e.key === "Escape" && isDragging) endDrag(); }
    };

    // Asignar listeners
    panel.addEventListener("mousedown", panel._dragHandlers.mousedown);
    panel.addEventListener("touchstart", panel._dragHandlers.touchstart, { passive: false });
    panel.addEventListener("dragstart", panel._dragHandlers.dragstart);

    document.addEventListener("mousemove", document._dragHandlers.mousemove);
    document.addEventListener("mouseup", document._dragHandlers.mouseup);
    document.addEventListener("touchmove", document._dragHandlers.touchmove, { passive: false });
    document.addEventListener("touchend", document._dragHandlers.touchend);
    document.addEventListener("touchcancel", document._dragHandlers.touchcancel);
    document.addEventListener("keydown", document._dragHandlers.keydown);

    panel.setAttribute('data-draggable', 'true');
    panel.centerPanel = centerPanel;
    panel.style.pointerEvents = "auto";

    if (!(panel.style.left && panel.style.top)) centerPanel();

    console.log(`Elemento ${elementId} hecho arrastrable correctamente.`);
}



makeDraggable(element) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  element.style.position = 'absolute';  // Necesario para mover
  element.style.cursor = 'default';     // Mantener siempre flecha normal

  const startDrag = (clientX, clientY) => {
    isDragging = true;
    offsetX = clientX - element.offsetLeft;
    offsetY = clientY - element.offsetTop;
    document.body.style.userSelect = 'none'; // Previene seleccionar texto
  };

  const drag = (clientX, clientY) => {
    if (isDragging) {
      element.style.left = (clientX - offsetX) + 'px';
      element.style.top = (clientY - offsetY) + 'px';
    }
  };

  const endDrag = () => {
    isDragging = false;
    document.body.style.userSelect = '';
  };

  // Eventos mouse
  element.addEventListener('mousedown', (e) => {
    startDrag(e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', (e) => {
    drag(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', endDrag);

  // Eventos touch
  element.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { // Solo un dedo
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
      e.preventDefault(); // Evitar scroll mientras arrastra
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      drag(touch.clientX, touch.clientY);
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);
}






  // ─────────────────────────────────────────────────────────
  // BLOQUE B: Reconstruir window.playerInventory con inventario + cofre
  rebuildPlayerInventoryFromState() {
    const inventoryArray = [];

    // 1) Recorrer INVENTARIO normal (this.STATE.slots)
    this.STATE.slots.forEach((slotObj, idx) => {
      // Verificar que no sea null ni undefined
      if (slotObj !== null && slotObj !== undefined) {
        const itemId    = slotObj.id;            
        const cantidad  = slotObj.count;         
        const tipo      = slotObj.tipo || "unknown";
        const unitPrice = slotObj.unitPrice || 0;
        const defs      = this.ItemDefinitions[itemId];
        const imageUrl  = defs && defs.src ? defs.src : "";
        const idx  = slotObj.idx;
        const idm = slotObj.idm;


        /*

        console.log(
          `[INV] Slot #${idx} → id="${itemId}", tipo="${tipo}", qty=${cantidad}, image="${imageUrl}"`
        );

        */

        inventoryArray.push({
          id:        idx.toString(),  // “0”, “1”, “2” … “39”
          name:      itemId,
          type:      tipo,
          qty:       cantidad,
          unitPrice: unitPrice,
          imageUrl:  imageUrl,
          origin:    "inventory",
          idx: slotObj.idx ?? idx,
          idm: slotObj.idm ?? idm
        });
      }
    });

    // 2) Recorrer COFRE (this.STATE.quickSlots)
    this.STATE.quickSlots.forEach((slotObj, idx) => {
      if (slotObj !== null && slotObj !== undefined) {
        const itemId    = slotObj.id;            
        const cantidad  = slotObj.count;         
        const tipo      = slotObj.tipo || "unknown";
        const unitPrice = slotObj.unitPrice || 0;
        const defs      = this.ItemDefinitions[itemId];
        const imageUrl  = defs && defs.src ? defs.src : "";
        const idx  = slotObj.idx;
        const idm = slotObj.idm;

        /*

        console.log(
          `[CHEST] Slot #${idx} → id="${itemId}", tipo="${tipo}", qty=${cantidad}, image="${imageUrl}"`
        );

        */

        inventoryArray.push({
          id:        "chest-" + idx.toString(), // “chest-0”, “chest-1”, … “chest-6”
          name:      itemId,
          type:      tipo,
          qty:       cantidad,
          unitPrice: unitPrice,
          imageUrl:  imageUrl,
          origin:    "chest",
          idx: slotObj.idx ?? idx,
          idm: slotObj.idm ?? idm
        });
      }
    });

    // 3) Exponer al nivel global para que AuctionMarket lo use
    window.playerInventory = inventoryArray;
    /*
    console.log("→ window.playerInventory reconstruido:", window.playerInventory);
    */

  }




      // ─────────────────────────────────────────────────────────
      //   BLOQUE A: TODA LA LÓGICA DE INVENTARIO / DRAG & DROP
      // ─────────────────────────────────────────────────────────

initInventory() {
  // 1) Limpiar el HTML de los contenedores antes de recrear:
  const containerQ = document.getElementById('quick-slots');
  if (containerQ) containerQ.innerHTML = '';   // <— aquí borras todo <div class="quick-slot">...
  this.STATE.quickSlots = [];                   // <— reinicias el array para que no acumule
  this.STATE.ghostSlots = { inv: [], quick: [] }; // <— Inicializar arrays de fantasmas

  for (let i = 0; i < 7; i++) {
    const slotDiv = document.createElement('div');
    slotDiv.classList.add('quick-slot');
    slotDiv.dataset.slotIndex = i;
    slotDiv.addEventListener('click', (e) => {
      this.handleSlotClick('quick', i, e.clientX, e.clientY);
    });
    containerQ.appendChild(slotDiv);
    this.STATE.quickSlots.push(null);
  }

  // 2) Lo mismo para la grilla de inventario:
  const grid = document.getElementById('inventory-grid');
  if (grid) grid.innerHTML = '';               // <— borras todos los <div class="inv-slot"> previos
  this.STATE.slots = [];                        // <— reinicias el array

  for (let i = 0; i < 40; i++) {
    const slotDiv = document.createElement('div');
    slotDiv.classList.add('inv-slot');
    slotDiv.dataset.slotIndex = i;
    slotDiv.addEventListener('click', (e) => {
      this.handleSlotClick('inv', i, e.clientX, e.clientY);
    });
    grid.appendChild(slotDiv);
    this.STATE.slots.push(null);
  }

  // Inicializar arrays de fantasmas
  this.STATE.ghostSlots.inv = new Array(40).fill(null);
  this.STATE.ghostSlots.quick = new Array(7).fill(null);
}

initQuickSlots() {
  const container = document.getElementById('quick-slots');
  for (let i = 0; i < 7; i++) {
    const slotDiv = document.createElement('div');
    slotDiv.classList.add('quick-slot');
    slotDiv.dataset.slotIndex = i;
    // Arrow function para capturar e.clientX / e.clientY:
    slotDiv.addEventListener('click', (e) => {
      const qsIdx = Number(slotDiv.dataset.slotIndex);
      this.handleSlotClick('quick', qsIdx, e.clientX, e.clientY);
    });
    container.appendChild(slotDiv);
    this.STATE.quickSlots.push(null);
  }
}

initInventoryGrid() {
  const grid = document.getElementById('inventory-grid');
  for (let i = 0; i < 40; i++) {
    const slotDiv = document.createElement('div');
    slotDiv.classList.add('inv-slot');
    slotDiv.dataset.slotIndex = i;
    // Arrow function para capturar e.clientX / e.clientY:
    slotDiv.addEventListener('click', (e) => {
      const idx = Number(slotDiv.dataset.slotIndex);
      this.handleSlotClick('inv', idx, e.clientX, e.clientY);
    });
    grid.appendChild(slotDiv);
    this.STATE.slots.push(null);
  }
}

showInventory() {
  document.getElementById('inventory-panel').style.display = 'block';
}

hideInventory() {
  document.getElementById('inventory-panel').style.display = 'none';
  this.clearSelectedItem();
}

toggleInventory() {
  const panel = document.getElementById('inventory-panel');
  if (panel.style.display === 'block') {
    this.hideInventory();
  } else {
    this.showInventory();
  }
}








// ------------------------------------------------------------------
// FUNCIÓN EJECUTAR DIVISIÓN CORREGIDA
// ------------------------------------------------------------------
async ejecutarDivision(ruta_tabla, producto, limitacion, cantidad) {
  // Validaciones rápidas
  if (limitacion <= 0 || cantidad <= 0) return;

  // FIX (varias compras seguidas y solo se hacía UNA transacción): antes, si
  // ya había una transacción en curso, la petición se DESCARTABA. Ahora se
  // ENCOLA, igual que en GameScene y en tienda_sistema: cada una espera a la
  // anterior y se ejecuta en orden, sin perder ninguna.
  this._addItemQueue = (this._addItemQueue || Promise.resolve())
    .then(() => this.Additemblockchains(ruta_tabla, producto, cantidad))
    .catch(err => console.error('❌ Error procesando ejecutarDivision en cola:', err));

  return this._addItemQueue;
}

// ------------------------------------------------------------------
// GENERADOR DE manualId (se mantiene igual)
// ------------------------------------------------------------------
generarCodigo(longitud = 19) {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let resultado = '';
  for (let i = 0; i < longitud; i++) {
    resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return resultado;
}

// ------------------------------------------------------------------
// BLOQUEO VISUAL DE SLOTS (se mantiene igual)
// ------------------------------------------------------------------
lockSlot(type, index) {
  const selector = type === 'inv'
    ? `.inv-slot[data-slot-index="${index}"]`
    : `.quick-slot[data-slot-index="${index}"]`;
  const slot = document.querySelector(selector);
  if (slot) slot.classList.add('slot-locked');
}

unlockAllSlots() {
  document.querySelectorAll('.inv-slot, .quick-slot').forEach(slot => {
    slot.classList.remove('slot-locked');
  });
}

// ------------------------------------------------------------------
// FUNCIÓN PRINCIPAL ADDITEMBLOCKCHAINS (sin cambios, pero se incluye completa)
// ------------------------------------------------------------------
async Additemblockchains(ruta_tabla, producto, cantidad) {
  // Bandera EXCLUSIVA de "agregar item por blockchain": _transactionInProgress
  // también lo tocan el drag&drop del inventario y las ventas, y si alguno lo
  // dejaba en true, TODAS las adiciones siguientes se descartaban en silencio.
  if (this._addItemBlockchainBusy) {
    console.warn('Transacción de agregar item ya en progreso. Ignorando nueva petición.');
    return;
  }
  this._addItemBlockchainBusy = true;
  this._transactionInProgress = true;

  // Helpers locales (autocontenidos para no depender de funciones externas)
  const self = this;

  function generarCodigoLocal(longitud = 19) {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
      resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
  }

  function lockSlotLocal(type, index) {
    try {
      const selector = type === 'inv'
        ? `.inv-slot[data-slot-index="${index}"]`
        : `.quick-slot[data-slot-index="${index}"]`;
      const slot = document.querySelector(selector);
      if (slot) slot.classList.add('slot-locked');
    } catch (e) {
      console.warn('lockSlotLocal fallo:', e);
    }
  }

  function unlockAllSlotsLocal() {
    try {
      document.querySelectorAll('.inv-slot, .quick-slot').forEach(slot => {
        slot.classList.remove('slot-locked');
      });
    } catch (e) {
      console.warn('unlockAllSlotsLocal fallo:', e);
    }
  }

  async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Reintentos: enviar acción y esperar confirmación
  // FIX "reintentar pero la transacción SÍ fue exitosa": si el envío ya fue
  // aceptado NUNCA se reenvía (antes se duplicaba la operación on-chain); solo
  // se re-espera la MISMA transactionId con timeout de 120 s por intento.
  async function _sendAndWaitWithRetries(relayClient, contractAddress, accionObj, maxAttempts = 3) {
    let pendingTransactionId = null; // guardamos el id si ya se envió

    const isTimeoutError = (val) => {
      const msg = (typeof val === 'string' ? val : val?.error || val?.message || '').toLowerCase();
      return msg.includes('timeout');
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let transactionId = pendingTransactionId;

        // Solo enviamos la tx si aún no tenemos un transactionId pendiente
        if (!transactionId) {
          const sendResult = await relayClient.accion(contractAddress, accionObj);
          if (!sendResult || !sendResult.success) {
            console.warn(`Attempt ${attempt}: sendResult no exitoso`, sendResult);
            if (attempt === maxAttempts) return { success: false, error: sendResult?.error || 'sendFailed' };
            await sleep(800 * attempt);
            continue;
          }
          transactionId = sendResult.transactionId;
          pendingTransactionId = transactionId; // guardar por si hay timeout
        } else {
          console.warn(`Attempt ${attempt}: re-esperando tx existente ${transactionId} (no se reenvía)`);
        }

        // Esperar confirmación con timeout explícito de 2 minutos
        const final = await relayClient.waitForTransaction(transactionId, {
          interval: 3000,
          timeout: 120000
        });

        if (final && final.success) {
          pendingTransactionId = null;
          return { success: true, txHash: final.txHash, transactionId };
        } else {
          const timedOut = isTimeoutError(final);
          console.warn(`Attempt ${attempt}: confirmación fallida (${timedOut ? 'timeout — reintentando misma tx' : 'error'})`, final);
          if (attempt === maxAttempts) return { success: false, error: final?.error || 'confirmFailed' };
          if (!timedOut) pendingTransactionId = null;
          await sleep(timedOut ? 2000 : 800 * attempt);
          continue;
        }
      } catch (err) {
        const timedOut = isTimeoutError(err);
        console.error(`Attempt ${attempt} error:`, err);
        if (attempt === maxAttempts) return { success: false, error: err.message || String(err) };
        if (!timedOut) pendingTransactionId = null;
        await sleep(timedOut ? 2000 : 800 * attempt);
      }
    }
    return { success: false, error: 'unknown' };
  }

  // Parser robusto para getInvoiceByManualId
  function _getInvoiceFieldsFromResponse(lastMessage) {
    try {
      // Si es array -> mapeo por posiciones esperadas del struct de tu contrato
      if (Array.isArray(lastMessage)) {
        const invoiceId = Number(lastMessage[0]) || 0;
        const manualId = lastMessage[1] || '';
        const cantidadx = Number(lastMessage[4] ?? lastMessage[3] ?? 0) || 0;
        return { invoiceId, manualId, cantidadx, raw: lastMessage };
      }

      // Si es objeto: intentar formar un array a partir de keys '0','1' o 'out0','out1'
      if (lastMessage && typeof lastMessage === 'object') {
        const indexed = [];
        for (const k of Object.keys(lastMessage)) {
          let m = null;
          if (/^\d+$/.test(k)) {
            m = Number(k);
          } else {
            const mo = k.match(/^out(\d+)$/i);
            if (mo) m = Number(mo[1]);
          }
          if (m !== null) indexed[m] = lastMessage[k];
        }
        if (indexed.length > 0) {
          const invoiceId = Number(indexed[0]) || 0;
          const manualId = indexed[1] || '';
          const cantidadx = Number(indexed[4] ?? indexed[3] ?? 0) || 0;
          return { invoiceId, manualId, cantidadx, raw: indexed };
        }

        // Fallback: buscar por nombres de campo conocidos
        const pick = (names) => {
          for (const n of names) {
            if (lastMessage[n] !== undefined) return lastMessage[n];
            const lower = n.toLowerCase();
            if (lastMessage[lower] !== undefined) return lastMessage[lower];
          }
          return undefined;
        };

        const invoiceIdRaw = pick(['invoiceId', 'id', 'InvoiceId', '_id']);
        const manualIdRaw = pick(['manualId', '_manualId', 'manualID']);
        const cantidadRaw = pick(['cantidad', 'quantity', '_cantidad', 'amount']);

        const invoiceId = invoiceIdRaw !== undefined ? Number(invoiceIdRaw) : 0;
        const manualId = manualIdRaw !== undefined ? String(manualIdRaw) : '';
        const cantidadx = cantidadRaw !== undefined ? Number(cantidadRaw) : 0;

        return { invoiceId: invoiceId || 0, manualId, cantidadx, raw: lastMessage };
      }
    } catch (err) {
      console.error('_getInvoiceFieldsFromResponse error:', err, 'lastMessage:', lastMessage);
    }
    return { invoiceId: 0, manualId: '', cantidadx: 0, raw: lastMessage };
  }

  try {
    // Inicializar relayClient si hace falta
    if (!this.relayClient) {
      this.relayClient = new PhaserRelay({
        apiBase: this.serverBase,
        debug: true,
        forceLocalhostTo127: true
      });
      await this.relayClient.initialize();
    }

    // debugBackendConnection puede intentar /ping; capturamos errores pero seguimos
    try {
      const debugInfo = await this.relayClient.debugBackendConnection();
      console.log('🔍 Debug info:', debugInfo);
    } catch (dbgErr) {
      // ignora 404 /ping u otros inconvenientes de debug, solo registra
      console.warn('debugBackendConnection fallo (ignorable):', dbgErr && dbgErr.message ? dbgErr.message : dbgErr);
    }

    // Auth
    const auth = await this.relayClient.checkAuth();
    if (!auth || !auth.success) {
      this.relayClient.showError('❌ Debes estar autenticado. Por favor, inicia sesión de nuevo.', 5000);
      return;
    }
    console.log('🔑 Usuario autenticado:', auth.address);

    // Establecer usuario en el hub (si no se ha hecho antes)
    if (window.hub && this.playerName) {
      window.hub.setUser(this.playerName, auth.address);
    }

    // Encontrar contrato
    let contract;
    try {
      contract = await this.relayClient.findContract('ItemContract');
    } catch (error) {
      this.relayClient.showError('❌ Error conectando al backend: ' + (error.message || error), 5000);
      return;
    }
    if (!contract) {
      this.relayClient.showError('❌ Contrato ItemContract no encontrado', 3000);
      return;
    }
    console.log('📄 Contrato encontrado:', contract.address);

    // ===== SIMULADOR =====
    const reporte = this.simulateAddItem(producto, cantidad);
    console.error('Reporte completo:', reporte);

    // Bloquear slots implicados (si vienen)
    if (Array.isArray(reporte.operations)) {
      reporte.operations.forEach(op => {
        try {
          if (op && op.location && op.location.type && op.location.index !== undefined && op.location.index !== null) {
            lockSlotLocal(op.location.type, op.location.index);
          }
        } catch (e) {
          console.warn('Error lockSlotLocal por operación:', op, e);
        }
      });
    }

    // ===== MERGES: aumentar cantidad en facturas existentes =====
    const merges = (reporte.operations || []).filter(op => op.type === 'merge');
    for (const op of merges) {
      const cantidadOp = Number(op.amountAdded) || 0;
      const idx = Number(op.idx) || 0;
      const manual = op.manualid || '';

      // Seguridad: idx === 0 no es válido (contrato usa 0 como 'no existe')
      if (idx === 0) {
        console.error('Se detectó idx = 0 en merge; se ignora para evitar borrado/colisión:', op);
        continue;
      }

      console.error(`Procesando MERGE para idx ${idx} con cantidad a añadir ${cantidadOp}`);

      // Datos para posible reintento (categoría 'items', nombre = ruta_tabla)
      const hiddenData = {
        type: 'merge',
        producto: producto,
        cantidad: cantidadOp,
        idx: idx,
        manualid: manual,
        ruta_tabla: ruta_tabla
      };

      // Hash temporal para la transacción pendiente
      const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Añadir transacción pendiente al hub (categoría 'items')
      if (window.hub) {
        window.hub.addTransaction('items', {
          name: ruta_tabla,               // nombre = ruta_tabla
          quantity: cantidadOp,
          hash: tempHash,
          status: 'pending',
          hiddenData: hiddenData
        });
      }

      const accionObj = {
        funcion: 'increaseInvoiceQuantity',
        _id: idx,
        _increaseAmount: cantidadOp,
        accion: 'enviar'
      };

      const res = await _sendAndWaitWithRetries(this.relayClient, contract.address, accionObj, 3);

      if (!res.success) {
        // Eliminar pendiente y añadir revertida
        if (window.hub) {
          window.hub.removeTransaction(tempHash);
          window.hub.addTransaction('items', {
            name: ruta_tabla,
            quantity: cantidadOp,
            hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            status: 'reverted',
            hiddenData: hiddenData
          });
        }
        console.error('No se pudo confirmar increaseInvoiceQuantity para idx', idx, 'error:', res.error);
        this.relayClient.showError && this.relayClient.showError(`❌ increaseInvoiceQuantity falló para id ${idx}`, 4000);
        continue;
      }

      // Éxito: eliminar pendiente y añadir confirmada con el hash real
      if (window.hub) {
        window.hub.removeTransaction(tempHash);
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: cantidadOp,
          hash: res.txHash,
          status: 'confirmed',
          hiddenData: hiddenData
        });
      }

      // Actualizar frontend: addItemWithCheck(producto, cantidad, invoiceId, manualId)
      try {
        if (typeof this.addItemWithCheck === 'function') {
          await this.addItemWithCheck(producto, cantidadOp, idx, manual);
          console.error(`addItemWithCheck OK (merge) para invoice ${idx} cantidad ${cantidadOp}`);
        } else {
          console.error('addItemWithCheck no encontrada; omitiendo actualización local para merge idx', idx);
        }
      } catch (err) {
        console.error('Error ejecutando addItemWithCheck tras increaseInvoiceQuantity:', err, 'idx:', idx);
      }
    }

    // ===== NUEVOS STACKS: crear facturas y añadir items localmente =====
    const nuevosStacks = (reporte.operations || []).filter(op => op.type === 'new');
    for (const op of nuevosStacks) {
      const amountAdded = Number(op.amountAdded) || 0;
      const manualGenerado = generarCodigoLocal();

      // Datos para posible reintento
      const hiddenData = {
        type: 'new',
        producto: producto,
        cantidad: amountAdded,
        ruta_tabla: ruta_tabla
        // idx y manualid se conocerán después de crear
      };

      const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Añadir transacción pendiente (categoría 'items')
      if (window.hub) {
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: amountAdded,
          hash: tempHash,
          status: 'pending',
          hiddenData: hiddenData
        });
      }

      const accionCrear = {
        funcion: 'createInvoice',
        _owner: this.playerName,
        _tipo: ruta_tabla,
        _cantidad: amountAdded,
        _manualId: manualGenerado,
        accion: 'enviar'
      };

      const resCrear = await _sendAndWaitWithRetries(this.relayClient, contract.address, accionCrear, 3);

      if (!resCrear.success) {
        if (window.hub) {
          window.hub.removeTransaction(tempHash);
          window.hub.addTransaction('items', {
            name: ruta_tabla,
            quantity: amountAdded,
            hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            status: 'reverted',
            hiddenData: hiddenData
          });
        }
        console.error('createInvoice falló para nuevo stack (cantidad):', amountAdded, 'error:', resCrear.error);
        this.relayClient.showError && this.relayClient.showError(`❌ createInvoice falló para ${amountAdded}`, 4000);
        continue;
      }

      // Éxito en createInvoice: actualizamos la transacción pendiente a confirmada con el hash real
      if (window.hub) {
        window.hub.removeTransaction(tempHash);
        // Aún no tenemos idx/manualid, los añadiremos después de obtenerlos
        // Por ahora guardamos la confirmada sin esos datos, pero luego la actualizaremos o añadiremos otra
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: amountAdded,
          hash: resCrear.txHash,
          status: 'confirmed',
          hiddenData: hiddenData   // se completará más abajo con idx/manualid
        });
      }

      // Obtener la factura por manualId (view)
      let lastMessage;
      try {
        lastMessage = await this.relayClient.accion(contract.address, {
          funcion: 'getInvoiceByManualId',
          _manualId: manualGenerado,
          accion: 'obtener'
        });
      } catch (err) {
        console.error('Error llamando getInvoiceByManualId:', err);
        continue;
      }

      if (!lastMessage) {
        console.warn('getInvoiceByManualId devolvió vacío para manualId:', manualGenerado);
        continue;
      }

      // Parsear robustamente
      const parsed = _getInvoiceFieldsFromResponse(lastMessage);
      console.log('Parsed invoice response:', parsed);

      let { invoiceId, manualId, cantidadx } = parsed;

      // Si invoiceId sigue 0, intentar extraer keys directas como out0 o '0'
      if ((!invoiceId || Number(invoiceId) === 0) && lastMessage && typeof lastMessage === 'object') {
        for (const k of Object.keys(lastMessage)) {
          if (/^out?0$/i.test(k) || /^0$/.test(k)) {
            invoiceId = Number(lastMessage[k]) || invoiceId;
            break;
          }
        }
      }

      // Validar invoiceId
      if (!invoiceId || Number(invoiceId) === 0) {
        console.error('InvoiceId inválido o 0 tras todos los intentos — ignorando. lastMessage:', lastMessage, 'parsed:', parsed);
        continue;
      }

      // Normalizar cantidad y manualId
      invoiceId = Number(invoiceId);
      cantidadx = Number(cantidadx) || amountAdded || 0;
      manualId = manualId || manualGenerado;

      // Ahora que tenemos idx y manualid, actualizamos hiddenData de la transacción confirmada
      // Como no podemos modificar la transacción ya añadida, podríamos eliminarla y volver a añadir con los datos completos,
      // o simplemente dejar la que ya está (la información principal ya está). Para mantener consistencia, la reemplazamos.
      if (window.hub) {
        // Buscar la transacción con ese hash y actualizar hiddenData (si el hub lo permitiera)
        // Pero como no tenemos método de actualización, eliminamos y volvemos a añadir.
        window.hub.removeTransaction(resCrear.txHash);
        hiddenData.idx = invoiceId;
        hiddenData.manualid = manualId;
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: cantidadx,
          hash: resCrear.txHash,
          status: 'confirmed',
          hiddenData: hiddenData
        });
      }

      // Finalmente actualizar frontend
      try {
        if (typeof this.addItemWithCheck === 'function') {
          await this.addItemWithCheck(producto, cantidadx, invoiceId, manualId);
          console.error(`addItemWithCheck OK (new) para invoice ${invoiceId} cantidad ${cantidadx}`);
        } else {
          console.error('addItemWithCheck no encontrada; omitiendo actualización local para invoiceId', invoiceId);
        }
      } catch (err) {
        console.error('Error ejecutando addItemWithCheck tras createInvoice:', err, 'invoiceId:', invoiceId, 'manualId:', manualId);
      }
    }

    console.log('Additemblockchains: procesamiento finalizado.');
  } catch (error) {
    console.error('❌ Error crítico en Additemblockchains:', error);
    if (this.relayClient && typeof this.relayClient.showError === 'function') {
      this.relayClient.showError(`❌ Error crítico: ${error.message}`, 5000);
    }
  } finally {
    // Liberar bloqueo visual y bandera de transacción
    try {
      unlockAllSlotsLocal();
    } catch (e) {
      console.warn('unlockAllSlotsLocal fallo en finally:', e);
    }
    this._transactionInProgress = false;
    this._addItemBlockchainBusy = false;
  }
}








// ---------------------------
// VERIFICAR ROMPIMIENTO DE HERRAMIENTA
// ---------------------------
/**
 * Descuenta 1 uso a la herramienta con el invoiceId dado.
 * Si los usos llegan a 0: notifica, console.log, y ejecuta ejecutarDivisionRemove para quitar 1 del stack.
 * No toca el cursor ni bloquea nada.
 *
 * @param {Object} itemRef  — objeto de slot o selectedItem con .id e .idx
 */
async verificarRompimiento(itemRef) {
  try {
    if (!itemRef || !itemRef.idx) return;
    const toolDef = this.ItemDefinitions[itemRef.id];
    if (!toolDef || toolDef.usos == null) return;

    // 1) Consultar usos actuales en backend
    const usosRes = await this.fetchWithTokenRetry(
      `${this.serverBase}/api/tool/uses/${itemRef.idx}`, { method: 'GET' }
    );
    const usosData = await usosRes.json();
    const usosActuales = typeof usosData.usos === 'number' ? usosData.usos : toolDef.usos;
    const usosNuevos = usosActuales - 1;

    // 2) Registrar el descuento en backend
    await this.fetchWithTokenRetry(`${this.serverBase}/api/tool/uses/decrease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken || '' },
      body: JSON.stringify({ invoiceId: itemRef.idx, maxUsos: toolDef.usos })
    });

    if (usosNuevos <= 0) {
      // ── Buscar casilla del item (solo para el log) ──
      let slotRoto = null;
      let slotTipo = null;
      for (let i = 0; i < this.STATE.slots.length; i++) {
        if (this.STATE.slots[i]?.idx === itemRef.idx) { slotRoto = i; slotTipo = 'inventario'; break; }
      }
      if (slotRoto === null) {
        for (let i = 0; i < this.STATE.quickSlots.length; i++) {
          if (this.STATE.quickSlots[i]?.idx === itemRef.idx) { slotRoto = i; slotTipo = 'quickslot'; break; }
        }
      }

      console.log(`💀 Objeto "${itemRef.id}" en casilla ${slotTipo}[${slotRoto}] se rompió (idx=${itemRef.idx})`);
      this.notifications.show(`Tu ${itemRef.id} se rompió!`, 'error');

      // ── Quitar 1 del stack en blockchain + local ──
      await this.ejecutarDivisionRemove.call(this, 'slots', itemRef.id, toolDef.maxStack || 5, 1);

      // ── Borrar registro de usos para que las unidades restantes empiecen frescos ──
      try {
        await this.fetchWithTokenRetry(`${this.serverBase}/api/tool/uses/${itemRef.idx}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': this.csrfToken || '' }
        });
      } catch (delErr) {
        console.warn('⚠️ No se pudo borrar registro de usos tras rompimiento:', delErr);
      }

    } else {
      // Actualizar usos restantes en el estado local (para la barra visual)
      for (const s of [...this.STATE.slots, ...this.STATE.quickSlots]) {
        if (s?.idx === itemRef.idx) { s.usosRestantes = usosNuevos; break; }
      }
      console.log(`🪓 ${itemRef.id} usó 1 uso. Restantes: ${usosNuevos}/${toolDef.usos}`);
    }

    this.renderAllSlots();
  } catch (err) {
    console.warn('⚠️ Error en verificarRompimiento:', err);
  }
}

// ---------------------------
// EJECUTAR DIVISIÓN (ELIMINAR) - CORREGIDA
// ---------------------------
async ejecutarDivisionRemove(ruta_tabla, producto, limitacion, cantidad) {
    if (limitacion <= 0 || cantidad <= 0) return;

    // Mismo criterio que ejecutarDivision: se ENCOLA en vez de descartar, para
    // no perder ninguna venta/consumo cuando se hacen varios seguidos.
    this._removeItemQueue = (this._removeItemQueue || Promise.resolve())
        .then(() => this._ejecutarDivisionRemoveInterno(ruta_tabla, producto, limitacion, cantidad))
        .catch(err => console.error('❌ Error procesando ejecutarDivisionRemove en cola:', err));

    return this._removeItemQueue;
}

async _ejecutarDivisionRemoveInterno(ruta_tabla, producto, limitacion, cantidad) {
    if (limitacion <= 0 || cantidad <= 0) return;

    if (this._removeItemBlockchainBusy) {
        console.warn('Transacción de eliminar item ya en progreso. Ignorando nueva petición.');
        return;
    }
    this._removeItemBlockchainBusy = true;

    try {
        // ── Si hay un item en el cursor, devolverlo a su casilla de origen antes de proceder ──
        if (this.STATE?.selectedItem?.isGhost) {
            const cursorItem = this.STATE.selectedItem;
            const slotArr  = cursorItem.originType === 'inv' ? this.STATE.slots          : this.STATE.quickSlots;
            const ghostArr = cursorItem.originType === 'inv' ? this.STATE.ghostSlots.inv : this.STATE.ghostSlots.quick;

            slotArr[cursorItem.originIndex] = {
                id:    cursorItem.id,
                count: cursorItem.count,
                idx:   cursorItem.idx  ?? null,
                idm:   cursorItem.idm  ?? null
            };
            ghostArr[cursorItem.originIndex] = null;
            this.STATE.selectedItem = null;
            this.stopDrag && this.stopDrag();
            this.renderSlot(cursorItem.originIndex);
            console.log(`↩️ Item "${cursorItem.id}" devuelto a ${cursorItem.originType}[${cursorItem.originIndex}] antes de eliminar`);
        }

        await this.RemoveItemBlockchains(ruta_tabla, producto, cantidad);
    } finally {
        this._removeItemBlockchainBusy = false;
    }
}


// ---------------------------------
// SIMULADOR: eliminar items (mirror) - SIN CAMBIOS
// ---------------------------------
/**
 * Simula la eliminación de 'quantity' unidades del ítem 'itemId' del inventario,
 * sin modificar el estado real. Retorna un reporte con operaciones 'remove'.
 *
 * Cada operación incluye:
 * - type: 'remove'
 * - location: { type: 'inv'|'quick', index }
 * - amountRemoved
 * - previousCount
 * - finalCount
 * - idx (id de la factura / invoice id)  <-- importante para llamadas al contrato
 * - manualid (manualId)                  <-- para mostrar / debug
 */
simulateRemoveItem(itemId, quantity = 1) {
  const def = this.ItemDefinitions?.[itemId];
  if (!def) {
    console.warn(`Item "${itemId}" no definido en ItemDefinitions`);
    return {
      success: false,
      remaining: quantity,
      operations: [],
      summary: { totalRemoved: 0, stacksAffected: 0, slotsFreed: 0 }
    };
  }

  let remaining = quantity;

  // Clonar slots para simular sin modificar el original
  const simQuick = this.STATE.quickSlots.map(s => s ? { ...s } : null);
  const simInv = this.STATE.slots.map(s => s ? { ...s } : null);

  // Slots ocupados por el ítem seleccionado (fantasma)
  const occupied = new Set();
  if (this.STATE.selectedItem) {
    const sel = this.STATE.selectedItem;
    if (sel.originType === 'inv') occupied.add(`inv-${sel.originIndex}`);
    else if (sel.originType === 'quick') occupied.add(`quick-${sel.originIndex}`);
  }
  const isOccupied = (type, idx) => occupied.has(`${type}-${idx}`);

  const operations = [];

  // 1) Quitar de quickSlots (cofre/inmediato) primero - preferencia puede cambiar
  for (let i = 0; i < simQuick.length && remaining > 0; i++) {
    if (isOccupied('quick', i)) continue;
    const slot = simQuick[i];
    if (slot && slot.id === itemId && slot.count > 0) {
      const remove = Math.min(slot.count, remaining);
      const prev = slot.count;
      slot.count -= remove;
      remaining -= remove;

      const slotReal = this.STATE.quickSlots[i];

      operations.push({
        type: 'remove',
        location: { type: 'quick', index: i },
        amountRemoved: remove,
        previousCount: prev,
        finalCount: slot.count,
        idx: slotReal ? slotReal.idx : null,
        manualid: slotReal ? slotReal.idm : null
      });
    }
  }

  // 2) Quitar de inventario normal
  for (let i = 0; i < simInv.length && remaining > 0; i++) {
    if (isOccupied('inv', i)) continue;
    const slot = simInv[i];
    if (slot && slot.id === itemId && slot.count > 0) {
      const remove = Math.min(slot.count, remaining);
      const prev = slot.count;
      slot.count -= remove;
      remaining -= remove;

      const slotReal = this.STATE.slots[i];

      operations.push({
        type: 'remove',
        location: { type: 'inv', index: i },
        amountRemoved: remove,
        previousCount: prev,
        finalCount: slot.count,
        idx: slotReal ? slotReal.idx : null,
        manualid: slotReal ? slotReal.idm : null
      });
    }
  }

  const success = remaining === 0;

  // Resumen
  let totalRemoved = 0;
  let stacksAffected = operations.length;
  let slotsFreed = operations.filter(op => op.finalCount === 0).length;
  operations.forEach(op => totalRemoved += op.amountRemoved);

  return {
    success,
    remaining,
    operations,
    summary: {
      totalRemoved,
      stacksAffected,
      slotsFreed
    }
  };
}

// ---------------------------------
// RemoveItemBlockchains - SIN CAMBIOS (se incluye completo)
// ---------------------------------
async RemoveItemBlockchains(ruta_tabla, producto, cantidad) {
  // small helper sleep to avoid race conditions
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Funciones auxiliares para bloquear slots
  const lockSlotLocal = (type, index) => {
    try {
      const selector = type === 'inv'
        ? `.inv-slot[data-slot-index="${index}"]`
        : `.quick-slot[data-slot-index="${index}"]`;
      const slot = document.querySelector(selector);
      if (slot) slot.classList.add('slot-locked');
    } catch (e) {
      console.warn('lockSlotLocal fallo:', e);
    }
  };

  const unlockAllSlotsLocal = () => {
    try {
      document.querySelectorAll('.inv-slot, .quick-slot').forEach(slot => {
        slot.classList.remove('slot-locked');
      });
    } catch (e) {
      console.warn('unlockAllSlotsLocal fallo:', e);
    }
  };

  // Helper para eliminar transacciones de items asociadas a una factura
  const removeAssociatedAddTransactions = (idx, manualid) => {
    if (!window.hub || !window.hub.transactions) return;
    const items = window.hub.transactions.items || [];
    items.forEach(tx => {
      if (tx.hiddenData && tx.hiddenData.idx === idx && 
          (tx.hiddenData.manualid === manualid || (!manualid && !tx.hiddenData.manualid))) {
        window.hub.removeTransaction(tx.hash);
      }
    });
  };

  try {
    // Inicializar relayClient si hace falta
    if (!this.relayClient) {
      this.relayClient = new PhaserRelay({
        apiBase: this.serverBase,
        debug: true,
        forceLocalhostTo127: true
      });
      await this.relayClient.initialize();
    }

    // Debug backend
    const debugInfo = await this.relayClient.debugBackendConnection();
    console.log('🔍 Debug info:', debugInfo);

    // Auth
    const auth = await this.relayClient.checkAuth();
    if (!auth || !auth.success) {
      this.relayClient.showError('❌ Debes estar autenticado. Por favor, inicia sesión de nuevo.', 5000);
      return false;
    }
    console.log('🔑 Usuario autenticado:', auth.address);

    // Establecer usuario en el hub
    if (window.hub && this.playerName) {
      window.hub.setUser(this.playerName, auth.address);
    }

    // Encontrar contrato
    let contract;
    try {
      contract = await this.relayClient.findContract('ItemContract');
    } catch (error) {
      this.relayClient.showError('❌ Error conectando al backend: ' + (error.message || error), 5000);
      return false;
    }
    if (!contract) {
      this.relayClient.showError('❌ Contrato ItemContract no encontrado', 3000);
      return false;
    }
    console.log('📄 Contrato encontrado:', contract.address);

    // --- SIMULACIÓN: qué removemos ---
    const reporte = this.simulateRemoveItem(producto, cantidad);
    console.log('Reporte (simulateRemoveItem):', reporte);

    if (!reporte || !Array.isArray(reporte.operations) || reporte.operations.length === 0) {
      if (reporte && reporte.remaining > 0) {
        this.relayClient.showWarning(`⚠️ No hay suficiente cantidad para eliminar. Falta: ${reporte.remaining}`, 4000);
      } else {
        this.relayClient.showInfo('ℹ️ No hay operaciones a ejecutar (nada que remover).', 3000);
      }
      return false;
    }

    // ===== BLOQUEAR SLOTS IMPLICADOS =====
    reporte.operations.forEach(op => {
      try {
        if (op && op.location && op.location.type && op.location.index !== undefined && op.location.index !== null) {
          lockSlotLocal(op.location.type, op.location.index);
        }
      } catch (e) {
        console.warn('Error lockSlotLocal por operación:', op, e);
      }
    });

    let anyProcessed = false;

    // Procesar cada operación de forma secuencial
    for (const originalOp of reporte.operations) {
      // Clone safe copy of op to avoid accidental mutation
      const op = { ...originalOp };
      // Normalize numeric idx if it's a string
      if (op.idx !== undefined && op.idx !== null && typeof op.idx === 'string' && op.idx.trim() !== '') {
        const n = Number(op.idx);
        if (!Number.isNaN(n)) op.idx = n;
      }

      // If no idx but manualid is present, try to resolve it via contract view
      if ((op.idx === undefined || op.idx === null) && op.manualid) {
        try {
          const lookup = await this.relayClient.accion(contract.address, {
            funcion: 'getInvoiceByManualId',
            _manualId: op.manualid,
            accion: 'obtener'
          });
          if (lookup) {
            if (typeof lookup === 'object' && lookup.id !== undefined) {
              op.idx = Number(lookup.id);
            } else if (Array.isArray(lookup) && lookup.length > 0) {
              op.idx = Number(lookup[0]);
            } else {
              const keys = Object.keys(lookup || {});
              for (const k of keys) {
                if (k.toLowerCase().includes('id')) {
                  const candidate = Number(lookup[k]);
                  if (!Number.isNaN(candidate)) {
                    op.idx = candidate;
                    break;
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn(`⚠️ No se pudo resolver manualId ${op.manualid} a idx:`, err);
        }
      }

      if (!op.idx) {
        console.warn('Operación sin idx (invoice id) y no resolvible por manualid - ignorando operación:', op);
        continue;
      }

      // normalize amountRemoved
      const amount = Number(op.amountRemoved || op.amountRemoved === 0 ? op.amountRemoved : op.remove || 0);
      if (!amount || amount <= 0) {
        console.warn('Operación con amountRemoved inválido - ignorando:', op);
        continue;
      }

      anyProcessed = true;

      // Datos comunes para hiddenData
      const hiddenDataBase = {
        producto: producto,
        cantidad: amount,
        idx: op.idx,
        manualid: op.manualid || '',
        ruta_tabla: ruta_tabla
      };

      // Si finalCount === 0 => eliminar factura (deleteInvoice)
      if (op.finalCount === 0) {
        console.log(`🔻 Eliminando invoice id=${op.idx} manualId=${op.manualid} cantidad=${amount}`);

        const hiddenData = { ...hiddenDataBase, type: 'delete' };
        const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Añadir transacción pendiente en categoría 'interaction' con nombre 'Remove Items'
        if (window.hub) {
          window.hub.addTransaction('interaction', {
            name: 'Remove Items',
            quantity: amount,
            hash: tempHash,
            status: 'pending',
            hiddenData: hiddenData
          });
        }

        let sendResult;
        try {
          sendResult = await this.relayClient.accion(contract.address, {
            funcion: 'deleteInvoice',
            _id: op.idx,
            accion: 'enviar'
          });
        } catch (err) {
          console.error('❌ Excepción en deleteInvoice (accion):', err);
          this.relayClient.showError(`❌ Error borrando invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        if (!sendResult || !sendResult.success) {
          console.error('❌ Error en deleteInvoice:', sendResult);
          this.relayClient.showError(`❌ Error borrando invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        this.relayClient.showSuccess('Transacción deleteInvoice enviada, esperando confirmación...');

        try {
          const final = await this.relayClient.waitForTransaction(sendResult.transactionId, { interval: 3000 });
          if (final && final.success) {
            this.relayClient.showSuccess(`✅ Delete confirmada! TX: ${final.txHash?.substring(0,10) || '...'} `);

            // Actualizar hub: eliminar pendiente y añadir confirmada
            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: final.txHash,
                status: 'confirmed',
                hiddenData: hiddenData
              });
            }

            // Eliminar las transacciones de items asociadas a esta factura
            removeAssociatedAddTransactions(op.idx, op.manualid);

            // Actualiza estado local con la eliminación
            if (typeof this.EliitemWithCheck === 'function') {
              try {
                const ok = await this.EliitemWithCheck(producto, amount, op.idx, op.manualid);
                if (!ok) {
                  console.warn('EliitemWithCheck no pudo completar la eliminación local para', op);
                }
              } catch (ex) {
                console.error('Error ejecutando EliitemWithCheck tras delete:', ex);
              }
            } else {
              console.warn('EliitemWithCheck no definida, por favor implementa el handler local de eliminación.');
            }
          } else {
            this.relayClient.showError(`❌ Delete falló: ${final?.error || 'unknown'}`);
            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                status: 'reverted',
                hiddenData: hiddenData
              });
            }
          }
        } catch (err) {
          this.relayClient.showError(`⏰ Error esperando confirmación deleteInvoice: ${err.message || err}`);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
        }

      } else {
        // finalCount > 0 => decrease parcial
        console.log(`🔻 Decreasing invoice id=${op.idx} manualId=${op.manualid} by ${amount}`);

        const hiddenData = { ...hiddenDataBase, type: 'decrease' };
        const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        if (window.hub) {
          window.hub.addTransaction('interaction', {
            name: 'Remove Items',
            quantity: amount,
            hash: tempHash,
            status: 'pending',
            hiddenData: hiddenData
          });
        }

        let sendResult;
        try {
          sendResult = await this.relayClient.accion(contract.address, {
            funcion: 'decreaseInvoiceQuantity',
            _id: op.idx,
            _decreaseAmount: amount,
            accion: 'enviar'
          });
        } catch (err) {
          console.error('❌ Excepción en decreaseInvoiceQuantity (accion):', err);
          this.relayClient.showError(`❌ Error disminuyendo invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        if (!sendResult || !sendResult.success) {
          console.error('❌ Error en decreaseInvoiceQuantity:', sendResult);
          this.relayClient.showError(`❌ Error disminuyendo invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        this.relayClient.showSuccess('Transacción decreaseInvoiceQuantity enviada, esperando confirmación...');

        try {
          const final = await this.relayClient.waitForTransaction(sendResult.transactionId, { interval: 3000 });
          if (final && final.success) {
            this.relayClient.showSuccess(`✅ Decrease confirmada! TX: ${final.txHash?.substring(0,10) || '...'} `);

            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: final.txHash,
                status: 'confirmed',
                hiddenData: hiddenData
              });
            }

            // Eliminar las transacciones de items asociadas a esta factura
            removeAssociatedAddTransactions(op.idx, op.manualid);

            // Actualiza estado local con la disminución
            if (typeof this.EliitemWithCheck === 'function') {
              try {
                const ok = await this.EliitemWithCheck(producto, amount, op.idx, op.manualid);
                if (!ok) {
                  console.warn('EliitemWithCheck no pudo completar la actualización local para', op);
                }
              } catch (ex) {
                console.error('Error ejecutando EliitemWithCheck tras decrease:', ex);
              }
            } else {
              console.warn('EliitemWithCheck no definida, por favor implementa el handler local de eliminación.');
            }
          } else {
            this.relayClient.showError(`❌ Decrease falló: ${final?.error || 'unknown'}`);
            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                status: 'reverted',
                hiddenData: hiddenData
              });
            }
          }
        } catch (err) {
          this.relayClient.showError(`⏰ Error esperando confirmación decreaseInvoiceQuantity: ${err.message || err}`);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
        }
      }

      // short delay to reduce chance of race conditions / nonce issues
      await sleep(400);
    } // end for

    // Si quedó restante en el reporte, notificar
    if (!reporte.success && reporte.remaining > 0) {
      this.relayClient.showWarning(`⚠️ No se pudo remover toda la cantidad. Falta: ${reporte.remaining}`, 5000);
    }

    return anyProcessed;

  } catch (error) {
    console.error('❌ Error crítico en RemoveItemBlockchains:', error);
    if (this.relayClient) {
      this.relayClient.showError(`❌ Error crítico: ${error.message || error}`, 5000);
    }
    return false;
  } finally {
    // Liberar bloqueo visual de todos los slots
    unlockAllSlotsLocal();
  }
}

// ---------------------------------
// EliitemWithCheck - SIN CAMBIOS
// ---------------------------------
/**
 * EliitemWithCheck
 * Elimina una cantidad del item identificado por invoiceId/manualId (si están),
 * actualiza slots (quick/inv/chest), limpia idx/idm y persiste estado.
 *
 * @param {string} itemId
 * @param {number} amountToRemove
 * @param {number|null} invoiceIdx
 * @param {string|null} manualId
 * @returns {Promise<boolean>}
 */
async EliitemWithCheck(itemId, amountToRemove = 1, invoiceIdx = null, manualId = null) {
  if (!itemId || !amountToRemove || amountToRemove <= 0) return false;

  let remaining = Number(amountToRemove);

  // Helper: procesar array de slots (mutación IN-PLACE)
  const processSlotsArray = (slotsArray, slotType) => {
    for (let i = 0; i < slotsArray.length && remaining > 0; i++) {
      const slot = slotsArray[i];
      if (!slot) continue;

      // Priorizar coincidencia por invoiceIdx/manualId si fueron provistos
      const matchesIdx = invoiceIdx !== null && (slot.idx === invoiceIdx || slot.idx === Number(invoiceIdx));
      const matchesManual = manualId !== null && (slot.idm === manualId || slot.idm === String(manualId));

      // Si tenemos idx/manual y NO coincide, saltamos
      if ((invoiceIdx !== null || manualId !== null) && !(matchesIdx || matchesManual)) {
        continue;
      }

      // Si no hay idx/manual dado, aceptamos por itemId
      if ((invoiceIdx === null && manualId === null) && slot.id !== itemId) {
        continue;
      }

      // Encontrado un slot válido para reducir
      const slotCount = Number(slot.count || slot.quantity || 0);
      if (slotCount <= 0) {
        // slot vacío por seguridad
        slotsArray[i] = null;
        this.renderSlot(i);
        continue;
      }

      if (slotCount > remaining) {
        // Reducir parcialmente
        const newCount = slotCount - remaining;
        // Mantener formato consistente (algunos slots usan 'count' o 'quantity')
        if ('count' in slot) slot.count = newCount;
        else slot.quantity = newCount;

        // Si el slot tenía idx/idm y ahora sigue >0, mantenemos idx/idm
        remaining = 0;
        this.renderSlot(i);
      } else {
        // Consumir todo el slot
        remaining -= slotCount;
        // limpiar completamente el slot y sus metadatos
        slotsArray[i] = null;
        this.renderSlot(i);
      }
    }
  };

  // 1) Prioridad: quickSlots (hotbar / cofre rápido)
  if (this.STATE && Array.isArray(this.STATE.quickSlots)) {
    processSlotsArray(this.STATE.quickSlots, 'quick');
  }

  // 2) Inventario principal
  if (remaining > 0 && this.STATE && Array.isArray(this.STATE.slots)) {
    processSlotsArray(this.STATE.slots, 'inv');
  }

  // 3) Chest / cofre extra (si existe)
  if (remaining > 0 && this.STATE && Array.isArray(this.STATE.chestSlots)) {
    processSlotsArray(this.STATE.chestSlots, 'chest');
  }

  // 4) Como respaldo, si aún queda y existen otros arrays (casillas, casillasExtra)
  if (remaining > 0 && Array.isArray(this.casillas)) {
    processSlotsArray(this.casillas, 'casillas');
  }
  if (remaining > 0 && Array.isArray(this.casillasExtra)) {
    processSlotsArray(this.casillasExtra, 'casillasExtra');
  }

  // Persistir / UI
  try {
    this.queuedAction && this.queuedAction({ type: 'forSpam2' });
    this.rebuildPlayerInventoryFromState && this.rebuildPlayerInventoryFromState();

    // Guardar en backend si tienes función savegg (opcional pero recomendado)
    if (typeof this.savegg === 'function') {
      try {
        await this.savegg();
      } catch (e) {
        console.warn('⚠️ savegg falló (no crítico):', e);
      }
    }
  } catch (e) {
    console.error('⚠️ Error actualizando UI/state tras EliitemWithCheck:', e);
  }

  if (remaining > 0) {
    console.warn(`⚠️ No se pudo remover toda la cantidad. Falta: ${remaining}`);
    return false;
  }

  return true;
}







/**
 * Agrega 'quantity' unidades del ítem 'itemId' al inventario.
 * Primero completa stacks parciales; luego abre nuevos stacks en slots vacíos.
 * Si no hay espacio, retorna false.
 *
 * @param {string} itemId           - Clave del ítem en ItemDefinitions.
 * @param {number} quantity        - Cantidad a agregar (por defecto 1).
 * @param {number|null} [customIdx] - Índice fijo para TODOS los stacks creados (opcional).
 * @param {string|null} [customIdm] - ID manual para TODOS los stacks creados (opcional).
 * @returns {boolean}              - true si se agregó todo, false si faltó espacio.
 */
addItem(itemId, quantity = 1, customIdx = null, customIdm = null) {
  const defs = this.ItemDefinitions[itemId];
  if (!defs) {
    console.warn(`Item "${itemId}" no definido en ItemDefinitions`);
    return false;
  }

  const maxStack = defs.maxStack;
  let remaining = quantity;

  // 1) Completar stacks parciales existentes (sin modificar idx/idm)
  for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
    if (this.STATE.ghostSlots.inv[i]) continue;
    const slot = this.STATE.slots[i];
    if (slot && slot.id === itemId && slot.count < maxStack) {
      const espacio = maxStack - slot.count;
      const suma = Math.min(espacio, remaining);
      slot.count += suma;
      remaining -= suma;
      this.renderSlot(i);
    }
  }
  if (remaining === 0) return true;

  // 2) Crear nuevos stacks en slots vacíos
  for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
    if (this.STATE.ghostSlots.inv[i]) continue;
    if (this.STATE.slots[i] === null) {
      const paraEste = Math.min(maxStack, remaining);
      
      // ✅ idx: si se pasó customIdx, se usa SIEMPRE; si no, el índice real del slot
      const idx = (customIdx !== null) ? customIdx : i;
      // ✅ idm: si se pasó customIdm, se usa SIEMPRE; si no, el itemId
      const idm = (customIdm !== null) ? customIdm : itemId;

      this.STATE.slots[i] = {
        id: itemId,
        count: paraEste,
        idx: idx,
        idm: idm
      };
      remaining -= paraEste;
      this.renderSlot(i);
    }
  }

  if (remaining > 0) {
    console.warn(`No hubo espacio para ${remaining} unidades de "${itemId}".`);
    return false;
  }

  return true;
}

renderSlot(index) {
  // Helper: añade indicador de usos si el item es una herramienta con usos definidos
  const _addUsosIndicator = (container, itemObj) => {
    const def = this.ItemDefinitions[itemObj?.id];
    if (!def || def.usos == null) return;
    const maxU = def.usos;
    const restantes = typeof itemObj.usosRestantes === 'number' ? itemObj.usosRestantes : maxU;
    const rota = restantes <= 0;
    const pct  = rota ? 0 : Math.round((restantes / maxU) * 100);
    // barra de durabilidad
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:2px; left:2px; right:2px; height:3px;
      background:#333; border-radius:2px; overflow:hidden; pointer-events:none;
    `;
    const fill = document.createElement('div');
    fill.style.cssText = `
      height:100%; width:${pct}%;
      background:${pct > 50 ? '#4caf50' : pct > 20 ? '#ff9800' : '#f44336'};
      border-radius:2px; transition:width .2s;
    `;
    bar.appendChild(fill);
    container.style.position = 'relative';
    container.appendChild(bar);
    // badge "ROTA" si está rota
    if (rota) {
      const badge = document.createElement('span');
      badge.textContent = '✗';
      badge.style.cssText = `
        position:absolute; top:1px; right:2px;
        font-size:9px; color:#f44336; font-weight:bold;
        text-shadow:0 0 2px #000; pointer-events:none;
      `;
      container.appendChild(badge);
    }
  };

  // Render inventario
  const invDiv = document.querySelector(`.inv-slot[data-slot-index="${index}"]`);
  if (invDiv) {
    invDiv.innerHTML = "";
    if (this.STATE.ghostSlots.inv[index]) {
      invDiv.classList.add("empty");
      invDiv.classList.remove("highlight");
    } else {
      const itemObj = this.STATE.slots[index];
      if (itemObj) {
        const img = document.createElement("img");
        img.src = this.ItemDefinitions[itemObj.id].src;
        img.alt = itemObj.id;
        invDiv.appendChild(img);
        if (itemObj.count > 1) {
          const span = document.createElement("span");
          span.classList.add("item-count");
          span.textContent = "x" + itemObj.count;
          invDiv.appendChild(span);
        }
        _addUsosIndicator(invDiv, itemObj);
        invDiv.classList.remove("empty");
      } else {
        invDiv.classList.add("empty");
      }
      invDiv.classList.remove("highlight");
    }
  }

  // Render quick-slot
  const quickDiv = document.querySelector(`.quick-slot[data-slot-index="${index}"]`);
  if (quickDiv) {
    quickDiv.innerHTML = "";
    if (this.STATE.ghostSlots.quick[index]) {
      quickDiv.classList.add("empty");
      quickDiv.classList.remove("highlight");
    } else {
      const itemObj = this.STATE.quickSlots[index];
      if (itemObj) {
        const img = document.createElement("img");
        img.src = this.ItemDefinitions[itemObj.id].src;
        img.alt = itemObj.id;
        quickDiv.appendChild(img);
        if (itemObj.count > 1) {
          const span = document.createElement("span");
          span.classList.add("item-count");
          span.textContent = "x" + itemObj.count;
          quickDiv.appendChild(span);
        }
        _addUsosIndicator(quickDiv, itemObj);
        quickDiv.classList.remove("empty");
      } else {
        quickDiv.classList.add("empty");
      }
      quickDiv.classList.remove("highlight");
    }
  }
}


// ============================================================================
// handleSlotClick (versión completa y corregida)
// ============================================================================
async handleSlotClick(type, index, clickX, clickY) {
  // Si hay una transacción en curso, ignorar clics
  if (this._transactionInProgress) {
    console.log('⏳ Transacción en curso, espera...');
    return;
  }

  if (!this.STATE.selectedItem) {
    // SIN ÍTEM EN MANO → Crear fantasma sin eliminar del backend
    if (type === 'inv') {
      const slotItem = this.STATE.slots[index];
      if (!slotItem) return;
      
      this.STATE.selectedItem = {
        id: slotItem.id,
        count: slotItem.count,
        originType: 'inv',
        originIndex: index,
        isGhost: true,
        idx: slotItem.idx,        // ← AÑADIDO
        idm: slotItem.idm         // ← AÑADIDO
      };
      
      this.STATE.ghostSlots.inv[index] = {
        id: slotItem.id,
        count: slotItem.count,
        idx: slotItem.idx,        // ← AÑADIDO
        idm: slotItem.idm         // ← AÑADIDO
      };
      
      const div = document.querySelector(`.inv-slot[data-slot-index="${index}"]`);
      div.innerHTML = '';
      div.classList.add('highlight');
      
      this.startDrag(
        this.ItemDefinitions[this.STATE.selectedItem.id].src,
        clickX,
        clickY,
        this.STATE.selectedItem.count
      );
        
    } else {
      const qSlot = this.STATE.quickSlots[index];
      if (!qSlot) return;
      
      this.STATE.selectedItem = {
        id: qSlot.id,
        count: qSlot.count,
        originType: 'quick',
        originIndex: index,
        invIndex: qSlot.invIndex,
        isGhost: true,
        idx: qSlot.idx,           // ← AÑADIDO
        idm: qSlot.idm            // ← AÑADIDO
      };
      
      this.STATE.ghostSlots.quick[index] = {
        id: qSlot.id,
        count: qSlot.count,
        invIndex: qSlot.invIndex,
        idx: qSlot.idx,           // ← AÑADIDO
        idm: qSlot.idm            // ← AÑADIDO
      };
      
      const div = document.querySelector(`.quick-slot[data-slot-index="${index}"]`);
      div.innerHTML = '';
      div.classList.add('highlight');
      
      this.startDrag(
        this.ItemDefinitions[this.STATE.selectedItem.id].src,
        clickX,
        clickY,
        this.STATE.selectedItem.count
      );
    }
  } else {
    // YA HAY UN ÍTEM EN MANO
    const origin = { ...this.STATE.selectedItem };
    
    // Si se hace clic en el MISMO slot de origen, cancelar
    if (origin.originType === type && origin.originIndex === index && origin.isGhost) {
      if (type === 'inv') {
        this.STATE.ghostSlots.inv[index] = null;
      } else {
        this.STATE.ghostSlots.quick[index] = null;
      }
      this.STATE.selectedItem = null;
      this.stopDrag();
      this.renderSlot(index);
      return;
    }
    
    // Bloquear nuevos clics durante la transacción
    this._transactionInProgress = true;
    
    try {
      if (type === 'inv') {
        await this.handleInventoryPlacement(origin, index, type);
      } else {
        await this.handleQuickSlotPlacement(origin, index, type);
      }
    } finally {
      // Liberar bloqueo
      this._transactionInProgress = false;
    }
  }
}



// ============================================================================
// 2. FUNCIÓN AUXILIAR getItemTipo
// ============================================================================
getItemTipo(itemId) {
  const def = this.ItemDefinitions[itemId];
  return def?.tipo || "default";
}

// ============================================================================
// mergeItemsBlockchain (versión robusta final)
// ============================================================================
async mergeItemsBlockchain(origin, destType, destIndex) {
  console.log('========== MERGE BLOCKCHAIN ==========');
  console.log('Origen:', origin);

  // Obtener item destino actual (referencia)
  let destItem;
  if (destType === 'inv') {
    destItem = this.STATE.slots[destIndex];
  } else {
    destItem = this.STATE.quickSlots[destIndex];
  }
  if (!destItem) {
    console.error('❌ Destino no tiene item (merge llamado incorrectamente)');
    return false;
  }
  console.log('Destino (antes de transacción):', destItem);

  // Verificaciones
  if (origin.id !== destItem.id) {
    console.error('❌ Los items no son del mismo tipo');
    return false;
  }
  if (!origin.idx || !destItem.idx) {
    console.error('❌ Faltan idx en origen o destino. No se puede realizar merge blockchain.');
    this.showNotification('Error: falta invoiceId en algún item', 'error');
    return false;
  }

  const maxStack = this.ItemDefinitions[origin.id]?.maxStack;
  if (!maxStack) {
    console.error('❌ No se encontró maxStack para', origin.id);
    return false;
  }

  const espacioDestino = maxStack - destItem.count;
  if (espacioDestino <= 0) {
    console.log('ℹ️ Destino ya está lleno, no se puede transferir');
    this.showNotification('El destino ya está lleno', 'warning');
    return false;
  }

  const transferAmount = Math.min(origin.count, espacioDestino);
  console.log(`📦 Transferir ${transferAmount} unidades de factura ${origin.idx} a factura ${destItem.idx}`);

  if (transferAmount <= 0) {
    console.log('ℹ️ No hay nada que transferir');
    return false;
  }

  // ── COOLDOWN DE 7 MINUTOS POR BACKEND ──────────────────────────────────────
  try {
    const pairKey = [origin.idx, destItem.idx].sort().join('_');
    const cdRes = await this.fetchWithTokenRetry(
      `${this.serverBase}/api/merge/cooldown/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken || '' },
        body: JSON.stringify({ pairKey })
      }
    );
    const cdData = await cdRes.json();
    if (cdData.onCooldown) {
      const segsRestantes = Math.ceil((new Date(cdData.cooldownUntil) - Date.now()) / 1000);
      const mins = Math.floor(segsRestantes / 60);
      const segs = segsRestantes % 60;
      this.notifications?.show(
        `Debes esperar ${mins}m ${segs}s antes de volver a unir estos ítems`,
        'warning'
      );
      console.log(`⏳ Merge bloqueado por cooldown. Faltan ${mins}m ${segs}s`);
      return false;
    }
  } catch (cdErr) {
    console.warn('⚠️ No se pudo verificar cooldown de merge, continuando:', cdErr);
  }
  // ───────────────────────────────────────────────────────────────────────────

  // Inicializar relayClient si es necesario
  if (!this.relayClient) {
    this.relayClient = new PhaserRelay({
      apiBase: this.serverBase,
      debug: true,
      forceLocalhostTo127: true
    });
    await this.relayClient.initialize();
  }

  const auth = await this.relayClient.checkAuth();
  if (!auth.success) {
    console.error('❌ No autenticado');
    this.relayClient.showError('No autenticado', 5000);
    return false;
  }

  const contract = await this.relayClient.findContract('ItemContract');
  if (!contract) {
    console.error('❌ Contrato ItemContract no encontrado');
    this.relayClient.showError('Contrato no encontrado', 3000);
    return false;
  }

  // Enviar transacción
  console.log('⏳ Enviando transacción transferQuantityBetweenInvoices...');
  const sendResult = await this.relayClient.accion(contract.address, {
    funcion: 'transferQuantityBetweenInvoices',
    fromId: origin.idx,
    toId: destItem.idx,
    amount: transferAmount,
    accion: 'enviar'
  });

  if (!sendResult.success) {
    console.error('❌ Error en transferQuantityBetweenInvoices:', sendResult);
    this.relayClient.showError(`Error: ${sendResult.error || 'Desconocido'}`, 5000);
    return false;
  }

  this.relayClient.showSuccess('Transacción enviada, esperando confirmación...');

  try {
    const final = await this.relayClient.waitForTransaction(sendResult.transactionId, { interval: 3000 });
    if (final.success) {
      console.log('✅ Transferencia confirmada:', final);
      this.relayClient.showSuccess('Transferencia confirmada');
      this.queuedAction({ type: 'forSpam2'}); 

      // --- ACTUALIZACIÓN LOCAL ROBUSTA ---
      const findSlotByIdx = (idx) => {
        for (let i = 0; i < this.STATE.slots.length; i++) {
          const slot = this.STATE.slots[i];
          if (slot && slot.idx === idx) return { type: 'inv', index: i, slot };
        }
        for (let i = 0; i < this.STATE.quickSlots.length; i++) {
          const slot = this.STATE.quickSlots[i];
          if (slot && slot.idx === idx) return { type: 'quick', index: i, slot };
        }
        return null;
      };

      const originSlotInfo = findSlotByIdx(origin.idx);
      const destSlotInfo   = findSlotByIdx(destItem.idx);

      if (!originSlotInfo) {
        console.warn('⚠️ No se encontró el slot origen con idx', origin.idx, 'en el inventario. Puede que ya haya sido eliminado.');
      }
      if (!destSlotInfo) {
        console.error('❌ No se encontró el slot destino con idx', destItem.idx, 'en el inventario. ¡Inconsistencia!');
        this.showNotification('Error: destino desaparecido, recarga la página', 'error');
        return true;
      }

      // Actualizar origen
      if (originSlotInfo) {
        const newOriginCount = origin.count - transferAmount;
        if (newOriginCount <= 0) {
          if (originSlotInfo.type === 'inv') {
            this.STATE.slots[originSlotInfo.index] = null;
          } else {
            this.STATE.quickSlots[originSlotInfo.index] = null;
          }
          console.log(`🗑️ Slot origen ${originSlotInfo.type}[${originSlotInfo.index}] eliminado`);
        } else {
          originSlotInfo.slot.count = newOriginCount;
          console.log(`📉 Origen ahora tiene ${newOriginCount} unidades en ${originSlotInfo.type}[${originSlotInfo.index}]`);
        }
        this.renderSlot(originSlotInfo.index);
      }

      // Actualizar destino
      if (destSlotInfo) {
        destSlotInfo.slot.count += transferAmount;
        console.log(`📈 Destino ahora tiene ${destSlotInfo.slot.count} unidades en ${destSlotInfo.type}[${destSlotInfo.index}]`);
        this.renderSlot(destSlotInfo.index);
      }

      // Limpiar cursor si el origen era el que estaba en el cursor
      if (this.STATE.selectedItem && this.STATE.selectedItem.isGhost && this.STATE.selectedItem.idx === origin.idx) {
        this.cleanupGhosts(this.STATE.selectedItem);
        this.STATE.selectedItem = null;
        this.stopDrag();
      }

      // Registrar cooldown de 7 minutos en backend para este par de facturas
      try {
        const pairKey = [origin.idx, destItem.idx].sort().join('_');
        await this.fetchWithTokenRetry(`${this.serverBase}/api/merge/cooldown/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken || '' },
          body: JSON.stringify({ pairKey, cooldownMinutes: 7 })
        });
        console.log(`⏱️ Cooldown de merge registrado para par ${pairKey} (7 min)`);
      } catch (cdSetErr) {
        console.warn('⚠️ No se pudo registrar cooldown de merge:', cdSetErr);
      }

      console.log('========== MERGE COMPLETADO ==========');
      this.renderAllSlots();
      return true;
    } else {
      console.error('❌ Transacción falló:', final);
      this.relayClient.showError(`Falló: ${final.error}`, 5000);
      return false;
    }
  } catch (error) {
    console.error('❌ Error esperando transacción:', error);
    this.relayClient.showError(`Error: ${error.message}`, 5000);
    return false;
  }
}

/**
 * Renderiza todos los slots del inventario y del cofre (quick slots)
 * para reflejar el estado actual en la interfaz.
 */
renderAllSlots() {
  // Actualizar slots del inventario (40)
  for (let i = 0; i < this.STATE.slots.length; i++) {
    this.renderSlot(i);
  }
  // Actualizar quick slots (7)
  for (let i = 0; i < this.STATE.quickSlots.length; i++) {
    this.renderSlot(i);
  }
  // Si tienes chestSlots adicionales (por ejemplo, un cofre extendido), también puedes iterar sobre ellos
  // if (this.STATE.chestSlots) {
  //   for (let i = 0; i < this.STATE.chestSlots.length; i++) {
  //     // Necesitarías un método específico o un contenedor diferente
  //   }
  // }
}



// ============================================================================
// handleInventoryPlacement (versión completa)
// ============================================================================
async handleInventoryPlacement(origin, destIndex, destType) {
  console.log('=== handleInventoryPlacement ===');
  console.log('Origen:', {
    id: origin.id,
    count: origin.count,
    idx: origin.idx,
    idm: origin.idm,
    originType: origin.originType,
    originIndex: origin.originIndex
  });
  const destItem = this.STATE.slots[destIndex];
  console.log('Destino:', destItem ? {
    id: destItem.id,
    count: destItem.count,
    idx: destItem.idx,
    idm: destItem.idm
  } : 'vacío');

  // ─────────────────────────────────────────────────────────
  // 1) Merge: mismo itemId
  // ─────────────────────────────────────────────────────────
  if (destItem && destItem.id === origin.id) {
    console.log('🔁 Merge: mismo itemId, intentando blockchain...');
    const success = await this.mergeItemsBlockchain(origin, destType, destIndex);
    if (!success) {
      console.warn('⚠️ Merge blockchain falló, no se modifica inventario');
    }
    return; // Salir, no seguir con lógica local
  }
  // ─────────────────────────────────────────────────────────
  // 2) Swap: objetos diferentes (solo local)
  // ─────────────────────────────────────────────────────────
  else if (destItem) {
    console.log('🔄 Swap: objetos diferentes (solo local)');
    // Origen recibe el objeto de destino
    if (origin.originType === 'inv') {
      this.STATE.slots[origin.originIndex] = {
        ...destItem,
        idx: origin.idx ?? null,          // ← null si no tiene invoiceId
        idm: destItem.idm ?? null         // ← null si no tiene manualId
      };
    } else {
      this.STATE.quickSlots[origin.originIndex] = {
        id: destItem.id,
        count: destItem.count,
        invIndex: destIndex,
        idx: origin.idx ?? null,          // ← null si no tiene invoiceId
        idm: destItem.idm ?? null         // ← null si no tiene manualId
      };
    }

    // Destino recibe el objeto de origen
    this.STATE.slots[destIndex] = {
      id: origin.id,
      count: origin.count,
      idx: origin.idx ?? null,            // ← null si no tiene invoiceId
      idm: origin.idm ?? null             // ← null si no tiene manualId
    };
  }
  // ─────────────────────────────────────────────────────────
  // 3) Destino vacío → mover (solo local)
  // ─────────────────────────────────────────────────────────
  else {
    console.log('➡️ Mover a slot vacío (solo local)');
    this.STATE.slots[destIndex] = {
      id: origin.id,
      count: origin.count,
      idx: origin.idx ?? null,            // ← null si no tiene invoiceId
      idm: origin.idm ?? null             // ← null si no tiene manualId
    };

    if (origin.originType === 'inv') {
      this.STATE.slots[origin.originIndex] = null;
    } else {
      this.STATE.quickSlots[origin.originIndex] = null;
    }
  }

  // Limpiar fantasmas y cursor (solo para casos que no son merge blockchain)
  this.cleanupGhosts(origin);
  this.STATE.selectedItem = null;
  this.stopDrag();
  this.renderSlot(destIndex);
  this.renderSlot(origin.originIndex);
}


// ============================================================================
// handleQuickSlotPlacement (versión completa)
// ============================================================================
async handleQuickSlotPlacement(origin, destIndex, destType) {
  console.log('=== handleQuickSlotPlacement ===');
  console.log('Origen:', {
    id: origin.id,
    count: origin.count,
    idx: origin.idx,
    idm: origin.idm,
    originType: origin.originType,
    originIndex: origin.originIndex
  });
  const destQuick = this.STATE.quickSlots[destIndex];
  console.log('Destino:', destQuick ? {
    id: destQuick.id,
    count: destQuick.count,
    idx: destQuick.idx,
    idm: destQuick.idm
  } : 'vacío');

  // ─────────────────────────────────────────────────────────
  // 1) Merge: mismo itemId
  // ─────────────────────────────────────────────────────────
  if (destQuick && destQuick.id === origin.id) {
    console.log('🔁 Merge: mismo itemId en quickSlot, intentando blockchain...');
    const success = await this.mergeItemsBlockchain(origin, destType, destIndex);
    if (!success) {
      console.warn('⚠️ Merge blockchain falló, no se modifica inventario');
    }
    return;
  }
  // ─────────────────────────────────────────────────────────
  // 2) Swap: objetos diferentes (solo local)
  // ─────────────────────────────────────────────────────────
  else if (destQuick) {
    console.log('🔄 Swap: objetos diferentes en quickSlot (solo local)');
    if (origin.originType === 'inv') {
      this.STATE.slots[origin.originIndex] = {
        id: destQuick.id,
        count: destQuick.count,
        idx: origin.idx ?? null,          // ← null si no tiene invoiceId
        idm: destQuick.idm ?? null        // ← null si no tiene manualId
      };
    } else {
      this.STATE.quickSlots[origin.originIndex] = {
        id: destQuick.id,
        count: destQuick.count,
        invIndex: destQuick.invIndex,
        idx: origin.idx ?? null,          // ← null si no tiene invoiceId
        idm: destQuick.idm ?? null        // ← null si no tiene manualId
      };
    }

    this.STATE.quickSlots[destIndex] = {
      id: origin.id,
      count: origin.count,
      invIndex: origin.originType === 'inv' ? origin.originIndex : origin.invIndex,
      idx: origin.idx ?? null,            // ← null si no tiene invoiceId
      idm: origin.idm ?? null             // ← null si no tiene manualId
    };
  }
  // ─────────────────────────────────────────────────────────
  // 3) Destino vacío → mover (solo local)
  // ─────────────────────────────────────────────────────────
  else {
    console.log('➡️ Mover a quickSlot vacío (solo local)');
    this.STATE.quickSlots[destIndex] = {
      id: origin.id,
      count: origin.count,
      invIndex: origin.originType === 'inv' ? origin.originIndex : origin.invIndex,
      idx: origin.idx ?? null,            // ← null si no tiene invoiceId
      idm: origin.idm ?? null             // ← null si no tiene manualId
    };

    if (origin.originType === 'inv') {
      this.STATE.slots[origin.originIndex] = null;
    } else {
      this.STATE.quickSlots[origin.originIndex] = null;
    }
  }

  // Limpiar fantasmas y cursor (solo para casos que no son merge blockchain)
  this.cleanupGhosts(origin);
  this.STATE.selectedItem = null;
  this.stopDrag();
  this.renderSlot(destIndex);
  this.renderSlot(origin.originIndex);
}



cleanupGhosts(origin) {
  // Limpiar todos los fantasmas
  if (origin.originType === 'inv') {
    this.STATE.ghostSlots.inv[origin.originIndex] = null;
  } else {
    this.STATE.ghostSlots.quick[origin.originIndex] = null;
  }
}

startDrag(src, x, y, count = 1) {
  const dragDiv = document.getElementById('drag-item');
  const dragImg = dragDiv.querySelector('img');
  const dragCount = document.getElementById('drag-count');
  
  dragImg.src = src;
  
  if (count > 0) {
    dragCount.textContent = count;
    dragCount.style.display = 'block';
  } else {
    dragCount.style.display = 'none';
  }
  
  dragDiv.style.display = 'block';

  const halfW = dragDiv.offsetWidth / 2;
  const halfH = dragDiv.offsetHeight / 2;
  dragDiv.style.left = (x - halfW) + 'px';
  dragDiv.style.top  = (y - halfH) + 'px';

  // SOLO mover, NO agregar el evento de click
  document.addEventListener('mousemove', this.onMouseMove.bind(this));
}

updateDragCount(count) {
  const dragCount = document.getElementById('drag-count');
  if (dragCount) {
    if (count > 0) {
      dragCount.textContent = count;
      dragCount.style.display = 'block';
    } else {
      dragCount.textContent = '';
      dragCount.style.display = 'none';
    }
  }
}


onMouseClick(e) {
  const t = e.target;
  if (t.closest('.inv-slot') || t.closest('.quick-slot')) {
    return;
  }
  
  if (this.STATE.selectedItem && this.STATE.selectedItem.isGhost) {
    // Solo limpiar el fantasma sin tocar el backend
    const origin = this.STATE.selectedItem;
    
    if (origin.originType === 'inv') {
      this.STATE.ghostSlots.inv[origin.originIndex] = null;
    } else {
      this.STATE.ghostSlots.quick[origin.originIndex] = null;
    }
    
    this.stopDrag();
    this.STATE.selectedItem = null;
    this.renderSlot(origin.originIndex);
  }
}

stopDrag() {
  const dragDiv = document.getElementById('drag-item');
  const dragCount = document.getElementById('drag-count');
  
  if (dragDiv) {
    dragDiv.style.display = 'none';
    dragDiv.style.left = '-100px';
    dragDiv.style.top = '-100px';
  }
  
  if (dragCount) {
    dragCount.textContent = '';
    dragCount.style.display = 'none';
  }
  
  // Solo remover el evento de mousemove
  document.removeEventListener('mousemove', this.onMouseMove.bind(this));
  
  document.querySelectorAll('.inv-slot, .quick-slot').forEach(d => {
    d.classList.remove('highlight');
  });
}

onMouseMove(e) {
  const dragDiv = document.getElementById('drag-item');
  dragDiv.style.left = (e.clientX - dragDiv.offsetWidth / 2) + 'px';
  dragDiv.style.top  = (e.clientY - dragDiv.offsetHeight / 2) + 'px';
}

clearSelectedItem() {
  if (this.STATE.selectedItem && this.STATE.selectedItem.isGhost) {
    const origin = this.STATE.selectedItem;
    if (origin.originType === 'inv') {
      this.STATE.ghostSlots.inv[origin.originIndex] = null;
    } else {
      this.STATE.ghostSlots.quick[origin.originIndex] = null;
    }
    this.stopDrag();
    this.STATE.selectedItem = null;
    this.renderSlot(origin.originIndex);
  }
}











  /**
   * 1) Cuenta cuántos del ítem `itemId` hay en quickSlots y en slots.
   *    Si no hay ninguno, deja un console.log.
   * @param {string} itemId
   * @returns {{ quick: number, slots: number, total: number }}
   */
  countItem(itemId) {
    const countIn = (arr, prop = 'count') =>
      arr.reduce((sum, slot) => {
        if (slot && slot.id === itemId) return sum + slot[prop];
        return sum;
      }, 0);

    const quickCount = countIn(this.STATE.quickSlots);
    const slotCount  = countIn(this.STATE.slots);
    const total      = quickCount + slotCount;

    if (total === 0) {
      console.log(`No existe ningún "${itemId}" ni en quickSlots ni en slots.`);
    }

    return { quick: quickCount, slots: slotCount, total };
  }



/**
 * Agrega 'quantity' unidades del ítem 'itemId' al inventario, priorizando el cofre.
 * Primero completa stacks parciales; luego abre nuevos stacks en slots vacíos.
 *
 * @param {string} itemId           - Clave del ítem en ItemDefinitions.
 * @param {number} quantity        - Cantidad a agregar (por defecto 1).
 * @param {number|null} [customIdx] - Índice fijo para TODOS los stacks creados (opcional).
 * @param {string|null} [customIdm] - ID manual para TODOS los stacks creados (opcional).
 * @returns {boolean}              - true si se agregó todo, false si faltó espacio.
 */
addItemWithCheck(itemId, quantity = 1, customIdx = null, customIdm = null) {
  const defs = this.ItemDefinitions[itemId];
  if (!defs) {
    console.warn(`Item "${itemId}" no definido en ItemDefinitions`);
    return false;
  }

  const maxStack = defs.maxStack;
  let remaining = quantity;

  // Slots ocupados por fantasmas
  const occupiedSlots = new Set();
  if (this.STATE.selectedItem) {
    if (this.STATE.selectedItem.originType === 'inv') {
      occupiedSlots.add(`inv-${this.STATE.selectedItem.originIndex}`);
    } else if (this.STATE.selectedItem.originType === 'quick') {
      occupiedSlots.add(`quick-${this.STATE.selectedItem.originIndex}`);
    }
  }
  const isOccupied = (type, index) => occupiedSlots.has(`${type}-${index}`);

  // 1) COFRE – completar stacks parciales (sin modificar idx/idm)
  for (let i = 0; i < this.STATE.quickSlots.length && remaining > 0; i++) {
    if (isOccupied('quick', i)) continue;
    const slot = this.STATE.quickSlots[i];
    if (slot && slot.id === itemId && slot.count < maxStack) {
      const espacio = maxStack - slot.count;
      const suma = Math.min(espacio, remaining);
      slot.count += suma;
      remaining -= suma;
      this.renderSlot(i);
    }
  }

  // 2) INVENTARIO – completar stacks parciales
  if (remaining > 0) {
    for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
      if (isOccupied('inv', i)) continue;
      const slot = this.STATE.slots[i];
      if (slot && slot.id === itemId && slot.count < maxStack) {
        const espacio = maxStack - slot.count;
        const suma = Math.min(espacio, remaining);
        slot.count += suma;
        remaining -= suma;
        this.renderSlot(i);
      }
    }
  }

  // 3) COFRE VACÍO – crear nuevos stacks
  if (remaining > 0) {
    for (let i = 0; i < this.STATE.quickSlots.length && remaining > 0; i++) {
      if (isOccupied('quick', i)) continue;
      if (this.STATE.quickSlots[i] === null) {
        const paraEste = Math.min(maxStack, remaining);
        
        const idx = (customIdx !== null) ? customIdx : i;
        const idm = (customIdm !== null) ? customIdm : itemId;

        this.STATE.quickSlots[i] = {
          id: itemId,
          count: paraEste,
          invIndex: null,
          idx: idx,
          idm: idm
        };
        remaining -= paraEste;
        this.renderSlot(i);
      }
    }
  }

  // 4) INVENTARIO VACÍO – crear nuevos stacks
  if (remaining > 0) {
    for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
      if (isOccupied('inv', i)) continue;
      if (this.STATE.slots[i] === null) {
        const paraEste = Math.min(maxStack, remaining);
        
        const idx = (customIdx !== null) ? customIdx : i;
        const idm = (customIdm !== null) ? customIdm : itemId;

        this.STATE.slots[i] = {
          id: itemId,
          count: paraEste,
          idx: idx,
          idm: idm
        };
        remaining -= paraEste;
        this.renderSlot(i);
      }
    }
  }

  if (remaining > 0) {
    console.warn(`No hubo espacio para ${remaining} unidades de "${itemId}".`);
    return false;
  }

  this.queuedAction({ type: 'forSpam2' });
  this.rebuildPlayerInventoryFromState();
  return true;
}



/**
 * Obtiene los índices de todos los slots ocupados (con fantasmas)
 * @returns {Set<number>} - Conjunto de índices de slots ocupados
 */
getOccupiedSlots() {
  const occupiedSlots = new Set();
  
  // Slots de inventario con fantasmas
  this.STATE.ghostSlots.inv.forEach((ghost, index) => {
    if (ghost) occupiedSlots.add(index);
  });
  
  // Slots de quick-slot con fantasmas
  this.STATE.ghostSlots.quick.forEach((ghost, index) => {
    if (ghost) occupiedSlots.add(index);
  });
  
  // También considerar slots que tienen items seleccionados actualmente
  if (this.STATE.selectedItem) {
    if (this.STATE.selectedItem.originType === 'inv' && 
        this.STATE.selectedItem.originIndex !== undefined) {
      occupiedSlots.add(this.STATE.selectedItem.originIndex);
    }
    if (this.STATE.selectedItem.originType === 'quick' && 
        this.STATE.selectedItem.originIndex !== undefined) {
      occupiedSlots.add(this.STATE.selectedItem.originIndex);
    }
  }
  
  return occupiedSlots;
}





/**
 * removeFromCursor: Elimina una cantidad específica del ítem que está en el cursor
 * @param {string} itemId - ID del item a eliminar
 * @param {number} quantity - Cantidad a eliminar (si es 0, elimina todo)
 * @returns {boolean} - true si se eliminó correctamente, false si no
 */
removeFromCursor(itemId, quantity = 0) {
  // Verificar si hay un item en el cursor
  if (!this.STATE.selectedItem || !this.STATE.selectedItem.isGhost) {
    console.warn('No hay ningún ítem en el cursor');
    return false;
  }
  
  const cursorItem = this.STATE.selectedItem;
  
  // Verificar si el item coincide
  if (cursorItem.id !== itemId) {
    console.warn(`El ítem en el cursor no es "${itemId}"`);
    return false;
  }
  
  // Si quantity es 0, eliminar todo
  const quantityToRemove = quantity === 0 ? cursorItem.count : quantity;
  
  // Verificar si hay suficiente cantidad
  if (cursorItem.count < quantityToRemove) {
    console.warn(`No hay suficiente cantidad en el cursor. Tienes ${cursorItem.count}, necesitas eliminar ${quantityToRemove}`);
    return false;
  }
  
  // Reducir la cantidad
  cursorItem.count -= quantityToRemove;
  
  // Actualizar visualización del cursor
  this.updateDragCount(cursorItem.count);
  
  // Si se eliminó todo, limpiar el cursor
  if (cursorItem.count === 0) {
    // Limpiar el fantasma del slot de origen
    if (cursorItem.originType === 'inv') {
      this.STATE.ghostSlots.inv[cursorItem.originIndex] = null;
      this.STATE.slots[cursorItem.originIndex] = null;
    } else {
      this.STATE.ghostSlots.quick[cursorItem.originIndex] = null;
      this.STATE.quickSlots[cursorItem.originIndex] = null;
    }
    
    // Limpiar el cursor
    this.STATE.selectedItem = null;
    this.stopDrag();
    
    // Renderizar el slot de origen
    this.renderSlot(cursorItem.originIndex);
  }
  
  console.log(`Se eliminaron ${quantityToRemove} de "${itemId}" del cursor`);
  return true;
}

/**
 * Función específica para eliminar TODO del cursor
 * @param {string} itemId - ID del item a eliminar
 * @returns {boolean} - true si se eliminó
 */
removeAllFromCursor(itemId) {
  return this.removeFromCursor(itemId, 0);
}

/**
 * reduceCursorQuantity: Reduce una cantidad específica del ítem en el cursor
 * @param {number} amount - Cantidad a reducir
 * @returns {number} - Cantidad restante en el cursor (o -1 si no hay ítem)
 */
reduceCursorQuantity(amount) {
  if (!this.STATE.selectedItem || !this.STATE.selectedItem.isGhost) {
    return -1;
  }
  
  const cursorItem = this.STATE.selectedItem;
  
  if (cursorItem.count < amount) {
    console.warn(`No hay suficiente cantidad para reducir. Tienes: ${cursorItem.count}, intentas reducir: ${amount}`);
    return cursorItem.count;
  }
  
  cursorItem.count -= amount;
  
  // Actualizar visualización
  this.updateDragCount(cursorItem.count);
  
  // Si se eliminó todo, limpiar cursor
  if (cursorItem.count === 0) {
    // Limpiar el fantasma del slot de origen
    if (cursorItem.originType === 'inv') {
      this.STATE.ghostSlots.inv[cursorItem.originIndex] = null;
      this.STATE.slots[cursorItem.originIndex] = null;
    } else {
      this.STATE.ghostSlots.quick[cursorItem.originIndex] = null;
      this.STATE.quickSlots[cursorItem.originIndex] = null;
    }
    
    // Limpiar cursor
    this.STATE.selectedItem = null;
    this.stopDrag();
    
    // Renderizar slot de origen
    this.renderSlot(cursorItem.originIndex);
  }
  
  return cursorItem.count;
}



















/**
 * Remueve items de manera inteligente manteniendo sincronización cursor/backend
 * @param {string} itemId - ID del item a remover
 * @param {number} count - Cantidad a remover
 * @returns {boolean} - True si se pudo remover todo, false si no
 */
removeItemWithCheck(itemId, count) {
  console.log(`🗑️ Removiendo ${count} ${itemId} (con sincronización)...`);
  
  const targetCount = parseInt(count) || 0;
  if (targetCount <= 0) {
    console.error('❌ Cantidad inválida para remover:', count);
    return false;
  }
  
  let remaining = targetCount;
  
  // 1. PRIMERO: Remover del cursor (sincronizando con backend)
  if (remaining > 0 && this.STATE.selectedItem && 
      this.STATE.selectedItem.id === itemId && 
      this.STATE.selectedItem.isGhost) {
    
    const cursorItem = this.STATE.selectedItem;
    const cursorCount = cursorItem.count;
    
    if (cursorCount <= remaining) {
      // Remover todo el cursor
      console.log(`🖱️ Cursor: removido completamente (${cursorCount})`);
      remaining -= cursorCount;
      
      // Limpiar cursor y backend
      this.STATE.selectedItem = null;
      this.stopDrag();
      
      if (cursorItem.originType === 'inv') {
        this.STATE.ghostSlots.inv[cursorItem.originIndex] = null;
        this.STATE.slots[cursorItem.originIndex] = null;
        this.renderSlot(cursorItem.originIndex);
      } else {
        this.STATE.ghostSlots.quick[cursorItem.originIndex] = null;
        this.STATE.quickSlots[cursorItem.originIndex] = null;
        this.renderSlot(cursorItem.originIndex);
      }
    } else {
      // Reducir parcialmente - ACTUALIZAR BACKEND también
      const newCount = cursorCount - remaining;
      cursorItem.count = newCount;
      console.log(`🖱️ Cursor: reducido de ${cursorCount} a ${newCount}`);
      
      // Sincronizar con backend
      if (cursorItem.originType === 'inv') {
        this.STATE.slots[cursorItem.originIndex] = {
          id: itemId,
          count: newCount
        };
        this.STATE.ghostSlots.inv[cursorItem.originIndex] = {
          id: itemId,
          count: newCount
        };
        this.renderSlot(cursorItem.originIndex);
      } else {
        this.STATE.quickSlots[cursorItem.originIndex] = {
          id: itemId,
          count: newCount,
          invIndex: cursorItem.invIndex
        };
        this.STATE.ghostSlots.quick[cursorItem.originIndex] = {
          id: itemId,
          count: newCount,
          invIndex: cursorItem.invIndex
        };
        this.renderSlot(cursorItem.originIndex);
      }
      
      this.updateDragCount(newCount);
      remaining = 0;
    }
  }
  
  // Función para procesar un array de slots (sin fantasmas)
  const processSlots = (slots, ghostSlots, slotType = 'unknown') => {
    if (!Array.isArray(slots)) return remaining;
    
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      // Saltar slots que tienen fantasmas (items siendo arrastrados)
      // Excepto si es el mismo slot que el cursor que ya procesamos
      const isCurrentCursorSlot = this.STATE.selectedItem && 
        this.STATE.selectedItem.isGhost && 
        ((slotType === 'inv' && this.STATE.selectedItem.originType === 'inv' && this.STATE.selectedItem.originIndex === i) ||
         (slotType === 'quick' && this.STATE.selectedItem.originType === 'quick' && this.STATE.selectedItem.originIndex === i));
      
      if (ghostSlots && ghostSlots[i] && !isCurrentCursorSlot) {
        continue;
      }
      
      const slot = slots[i];
      
      // Verificar que el slot tenga el item correcto
      if (slot && slot.id === itemId) {
        // Obtener cantidad del slot
        const slotCount = slot.count;
        
        if (slotCount <= remaining) {
          // Remover todo el slot
          console.log(`📦 ${slotType}[${i}]: removido completamente (${slotCount})`);
          remaining -= slotCount;
          slots[i] = null; // Vaciar el slot
          this.renderSlot(i);
        } else {
          // Reducir la cantidad en el slot
          const newCount = slotCount - remaining;
          slot.count = newCount;
          console.log(`📦 ${slotType}[${i}]: reducido de ${slotCount} a ${newCount}`);
          remaining = 0;
          this.renderSlot(i);
        }
      }
    }
    
    return remaining;
  };
  
  // 2. SEGUNDO: Quick slots
  if (remaining > 0) {
    remaining = processSlots(this.STATE.quickSlots, this.STATE.ghostSlots.quick, 'quick');
  }
  
  // 3. TERCERO: Slots normales
  if (remaining > 0) {
    remaining = processSlots(this.STATE.slots, this.STATE.ghostSlots.inv, 'inv');
  }
  
  // 4. CUARTO: Chest slots (si existen)
  if (remaining > 0 && this.STATE.chestSlots && Array.isArray(this.STATE.chestSlots)) {
    // Si tienes un array de fantasmas para chest, pásalo aquí
    remaining = processSlots(this.STATE.chestSlots, this.STATE.ghostSlots.chest || null, 'chest');
  }
  
  // Verificar resultado
  const removed = targetCount - remaining;
  
  if (remaining > 0) {
    console.error(`❌ Solo se pudieron remover ${removed} de ${targetCount} ${itemId}`);
    return false;
  }

  this.queuedAction({ type: 'forSpam2'});

  console.log(`✅ Se removieron ${removed} ${itemId} correctamente`);
  
  return true;
}



    // Técnica 1: Detecta cambios en las dimensiones de la ventana
    checkConsoleDimensions() {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      if (widthDiff > 100 || heightDiff > 100) {
          if (!this.isConsoleOpen) {
              this.isConsoleOpen = true;
              console.log('¡La consola está abierta! (detectado por dimensiones)');
              // Aquí puedes agregar lógica adicional (pausar el juego, mostrar una alerta, etc.)
          }
      } else {
          if (this.isConsoleOpen) {
              this.isConsoleOpen = false;
              console.log('--------La consola ha sido cerrada.--------------');
          }
      }
  }

  // Técnica 2: Usando un getter en un objeto
  setupConsoleDetection() {
      const element = new Image();
      Object.defineProperty(element, 'id', {
          get: () => {
              if (!this.isConsoleOpen) {
                  this.isConsoleOpen = true;
                  console.log('¡La consola está abierta! (detectado por getter)');
                  // Aquí también puedes agregar lógica adicional
              }
          }
      });

  }


  
    showTokenErrorHub() {
        console.log('🔒 Mostrando hub de error de token...');
        
        // Detener el intervalo de transición
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Pausar la escena
        this.scene.pause();

        // Eliminar hub existente si hay
        const existingHub = document.getElementById('token-error-hub');
        if (existingHub) {
            existingHub.remove();
        }

        // Crear contenedor principal
        const errorHub = document.createElement('div');
        errorHub.id = 'token-error-hub';
        errorHub.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;

        // Crear caja de contenido
        const contentBox = document.createElement('div');
        contentBox.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 3px solid #ff4d4d;
            border-radius: 20px;
            padding: 50px 40px;
            max-width: 550px;
            width: 90%;
            text-align: center;
            box-shadow: 0 15px 40px rgba(255, 77, 77, 0.4);
            animation: errorPulse 2s infinite;
        `;

        // Añadir animación
        const style = document.createElement('style');
        style.textContent = `
            @keyframes errorPulse {
                0% { box-shadow: 0 15px 40px rgba(255, 77, 77, 0.4); }
                50% { box-shadow: 0 20px 50px rgba(255, 77, 77, 0.7); }
                100% { box-shadow: 0 15px 40px rgba(255, 77, 77, 0.4); }
            }
        `;
        document.head.appendChild(style);

        // Título
        const title = document.createElement('h2');
        title.textContent = '⚠️ SESSION EXPIRED';
        title.style.cssText = `
            color: #ff4d4d;
            margin-bottom: 25px;
            font-size: 32px;
            text-shadow: 0 3px 8px rgba(255, 77, 77, 0.6);
            font-weight: bold;
            letter-spacing: 1px;
        `;

        // Icono
        const icon = document.createElement('div');
        icon.innerHTML = '🔒';
        icon.style.cssText = `
            font-size: 60px;
            margin-bottom: 20px;
        `;

        // Mensaje
        const message = document.createElement('p');
        message.textContent = 'Your access token has expired or is invalid. For security reasons, you need to log in again to continue playing.';
        message.style.cssText = `
            color: #ffffff;
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 35px;
            padding: 0 10px;
        `;

        // Sub-mensaje
        const subMessage = document.createElement('p');
        subMessage.textContent = 'All your game progress is saved and will be available after you log back in.';
        subMessage.style.cssText = `
            color: #cccccc;
            font-size: 16px;
            line-height: 1.4;
            margin-bottom: 40px;
            font-style: italic;
        `;

        // Botón
        const button = document.createElement('button');
        button.textContent = 'RETURN TO LOGIN';
        button.style.cssText = `
            background: linear-gradient(to right, #ff416c, #ff4b2b);
            color: white;
            border: none;
            padding: 18px 50px;
            font-size: 20px;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: bold;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            box-shadow: 0 5px 20px rgba(255, 65, 108, 0.5);
        `;

        // Efectos hover
        button.onmouseover = () => {
            button.style.background = 'linear-gradient(to right, #ff4b2b, #ff416c)';
            button.style.transform = 'scale(1.08)';
            button.style.boxShadow = '0 8px 25px rgba(255, 65, 108, 0.7)';
        };

        button.onmouseout = () => {
            button.style.background = 'linear-gradient(to right, #ff416c, #ff4b2b)';
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 5px 20px rgba(255, 65, 108, 0.5)';
        };

        // Acción del botón
        button.onclick = async () => {
            try {
                // Hacer logout en el backend
                await fetch(`${this.serverBase}/api/auth/logout`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                console.error('Error durante logout:', e);
            }
            
            // Redirigir al login
            window.location.href = '../Grassland_Forest_Game/index.html';
        };

        // Ensamblar todo
        contentBox.appendChild(icon);
        contentBox.appendChild(title);
        contentBox.appendChild(message);
        contentBox.appendChild(subMessage);
        contentBox.appendChild(button);
        errorHub.appendChild(contentBox);
        document.body.appendChild(errorHub);

        console.log('✅ Hub de error de token mostrado');
    }

  


/**
 * Crea imágenes a partir de los objetos definidos en una capa de Tiled y
 * las asigna a propiedades de la escena según el mapeo indicado.
 *
 * @param {Phaser.Scene} scene - La escena de Phaser en la que se crearán las imágenes.
 * @param {Phaser.Tilemaps.Tilemap} map - El mapa Tiled que contiene la capa de objetos.
 * @param {string} objectLayerName - El nombre de la capa de objetos en Tiled.
 * @param {Object} nameMapping - Un objeto de mapeo donde la clave es el nombre del objeto en Tiled.
 * @param {number|'floor'} depthOffset - 0 = Y-sorting normal (plantas, objetos pequeños),
 *   número positivo = offset extra para objetos altos como mesas/estantes (se suma a obj.y),
 *   'floor' = depth fijo en 0 para objetos de suelo (alfombras) que el jugador pisa por encima.
 */
createImagesFromObjectLayer(scene, map, objectLayerName, nameMapping, depthOffset = 0) {
  // Obtener la capa de objetos del mapa
  const objectLayer = map.getObjectLayer(objectLayerName);
  if (!objectLayer) {
    console.warn(`⚠️ La capa de objetos '${objectLayerName}' no se encontró en el mapa.`);
    return;
  }

  const isFloor = depthOffset === 'floor';

  objectLayer.objects.forEach(obj => {
    if (!obj.name) {
      console.warn(`⚠️ Objeto en (${obj.x}, ${obj.y}) no tiene nombre en Tiled.`);
      return;
    }

    const mapping = nameMapping[obj.name];
    if (!mapping) {
      console.warn(`⚠️ No hay mapeo para '${obj.name}' en nameMapping.`);
      return;
    }
    const { spriteKey, targetProp } = mapping;
    if (!spriteKey || !targetProp) {
      console.warn(`⚠️ El mapping para '${obj.name}' debe definir 'spriteKey' y 'targetProp'.`);
      return;
    }

    // Calcular depth según el tipo de objeto:
    // - 'floor': depth=0 fijo para objetos de suelo (alfombras) que el jugador pisa encima
    // - número: obj.y + depthOffset para Y-sorting (0 = normal, >0 = objetos altos)
    const depth = isFloor ? 0 : (obj.y + (typeof depthOffset === 'number' ? depthOffset : 0));

    // Crear la imagen; se ancla en (0,1) para que coincida con el eje Y de Tiled
    const image = scene.add.image(obj.x, obj.y, spriteKey)
                         .setOrigin(0, 1)
                         .setDepth(depth);

    // Escalar si Tiled definió width/height
    if (obj.width && obj.height) {
      image.setScale(obj.width / image.width, obj.height / image.height);
    }

    // ——— Aquí aplicamos la rotación de Tiled ———
    // Tiled nos dá obj.rotation en grados, Phaser usa radianes:
    if (obj.rotation) {
      image.setRotation(Phaser.Math.DegToRad(obj.rotation));
    }

    // Si quieres también respetar flips (Mirror X/Y) definidos en Tiled:
    if (obj.flippedHorizontal) {
      image.flipX = true;
    }
    if (obj.flippedVertical) {
      image.flipY = true;
    }

    // Y-SORT PROFESIONAL: los objetos con offset manual ≠ 0 (mesas, estantes,
    // estructuras altas) se marcan para que calibrateBuildingDepths() ajuste
    // su profundidad con la línea real de su colisión (ver ese método).
    image.setData('isBuilding', typeof depthOffset === 'number' && depthOffset !== 0);

    // Asignar la imagen a la propiedad de la escena
    scene[targetProp] = image;
  });
}

// ── Y-SORT PROFESIONAL (paridad con GameScene) ───────────────────────────
// Reemplaza los offsets manuales de profundidad por la línea de oclusión
// REAL de cada estructura: el borde inferior del rectángulo de colisión que
// la representa. Pies del jugador por debajo de esa línea → jugador delante;
// por encima → jugador detrás. Sin números mágicos por objeto.
calibrateBuildingDepths() {
  const arrays = [this.collisionRectangles, this.collisionRectangles1, this.collisionRectangles2]
    .filter(a => Array.isArray(a) && a.length);
  if (!arrays.length || !this.children) return 0;

  let calibrated = 0;
  this.children.each(child => {
    try {
      if (!child || typeof child.getData !== 'function' || !child.getData('isBuilding')) return;
      if (!child.getBounds) return;
      const b = child.getBounds();

      let frontLine = null;
      for (const arr of arrays) {
        for (const r of arr) {
          if (!r || typeof r.width !== 'number') continue;
          const overlapW = Math.min(b.right, r.right) - Math.max(b.x, r.x);
          if (overlapW < Math.min(r.width, b.width) * 0.5) continue;
          const rBottom = r.y + r.height;
          if (rBottom < b.y + b.height * 0.15) continue;
          if (rBottom > b.y + b.height + 4) continue;
          if (frontLine === null || rBottom > frontLine) frontLine = rBottom;
        }
      }

      if (frontLine !== null) {
        child.setDepth(frontLine - 1);
        calibrated++;
      }
    } catch (e) { /* sin bounds válidos: conservar depth manual */ }
  });

  if (calibrated > 0) {
    console.log(`🏠 Y-sort profesional (tienda): ${calibrated} estructuras calibradas`);
  }
  return calibrated;
}




  // Basic JWT format check
  tokenValido(token) {
    return typeof token === 'string' && token.split('.').length === 3;
  }

  // 1) Authenticate and load
  async initialize() {
      // Load data
      await this.loadPlayerData();

      const levelElement = document.getElementById('player-level');
        
      levelElement.textContent = `Lv. ${this.nivel}`;
  }




async loadAdminTimeOnly() {
  const tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
  const accessToken = tokens.accessToken || null;

  try {
    const res = await fetch(`${this.serverclient}/api/load/${encodeURIComponent(this.playerName)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Error al cargar hora/dia_noche:', errBody);
      return;
    }

    const data = await res.json();

    // Solo asignar hora y dia_noche
    if (data.dia_noche !== undefined) this.dia_noche = data.dia_noche;
    if (data.hora !== undefined) this.hora = data.hora;

    //console.log('Hora y día/noche actualizados:', { hora: this.hora, dia_noche: this.dia_noche });
  } catch (e) {
    console.error('Error de red al cargar hora/dia_noche:', e);
  }
}


// 2) Load player data (renamed to avoid conflict)
// 2) Load player data (renamed to avoid conflict) - FUNCIÓN CORREGIDA
async loadPlayerData() {
  console.log('📥 Cargando datos del jugador...');
  
  try {
    // Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ No se puede cargar datos: jugador no autenticado');
      return;
    }
    
    // Usar fetchWithTokenRetry que ya maneja tokens CSRF
    const response = await this.fetchWithTokenRetry(
      `${this.serverBase}/api/load/${encodeURIComponent(this.playerName)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error al cargar datos del jugador:', {
        status: response.status,
        error: errorText
      });
      return;
    }
    
    const data = await response.json();
    console.log('✅ Datos del jugador recibidos');
    
    // INICIALIZAR STATE solo si no existe - ¡ESTO ES CLAVE!
    if (!this.STATE) {
      this.STATE = { 
        slots: new Array(40).fill(null), 
        quickSlots: new Array(7).fill(null), 
        selectedItem: null 
      };
      console.log('🆕 STATE inicializado desde cero');
    }
    
    // LIMPIAR arrays existentes antes de cargar nuevos datos
    this.STATE.slots.fill(null);
    this.STATE.quickSlots.fill(null);
    
    // Cargar inventario
    if (data.inventory && Array.isArray(data.inventory)) {
      console.log(`📦 Cargando ${data.inventory.length} items del inventario`);
      
      data.inventory.forEach(s => {
        if (typeof s.id === 'number' && s.objeto && s.id < 40) {
          this.STATE.slots[s.id] = { 
            id: s.objeto, 
            idx: s.IDX ?? s.id,           // FIX: el servidor envía IDX (mayúscula), igual que GameScene
            idm: s.Manualid ?? s.objeto,  // FIX: el servidor envía Manualid (mayúscula), igual que GameScene
            count: s.cantidad || 1,
          };
        }
      });
    }
    
    // Cargar cofre
    if (data.chest && Array.isArray(data.chest)) {
      console.log(`🎁 Cargando ${data.chest.length} items del cofre`);
      
      data.chest.forEach(s => {
        if (typeof s.id === 'number' && s.objeto && s.id < 7) {
          this.STATE.quickSlots[s.id] = { 
            id: s.objeto, 
            idx: s.IDX ?? s.id,           // FIX: el servidor envía IDX (mayúscula), igual que GameScene
            idm: s.Manualid ?? s.objeto,  // FIX: el servidor envía Manualid (mayúscula), igual que GameScene
            count: s.cantidad || 1 
          };
        }
      });
    }
    
    // Asignar propiedades del jugador - SIN SOBREESCRIBIR variables críticas
    const playerProps = [
      'posicionplayerx', 'posicionplayery',
      'speed', 'mundo', 'nivel', 'nivel_exp',
      'misiones', 'Username', 'lenguaje', 'petName'
    ];

    playerProps.forEach(prop => {
      if (data[prop] !== undefined && data[prop] !== null) {
        this[prop] = data[prop];
      }
    });

    // Nombre de mascota compartido entre escenas ('---' = aún sin fijar)
    if (!this.petName) this.petName = window.globalPetName || '---';
    window.globalPetName = this.petName;
    // Lock del panel de nombre (window._acttov) según la regla de nombre único
    window._acttov = (typeof this.Username === 'string' && this.Username.trim() !== '' && this.Username !== '---') ? 1 : 0;

    // Stats del contrato tienen prioridad sobre DB
    if (window.playerStats) {
      if (typeof window.playerStats.vida   === 'number') this.vidaPorcentaje   = window.playerStats.vida;
      if (typeof window.playerStats.agua   === 'number') this.aguaPorcentaje   = window.playerStats.agua;
      if (typeof window.playerStats.comida === 'number') this.comidaPorcentaje = window.playerStats.comida;
      if (typeof window.playerStats.oro    === 'number') this.moneda           = window.playerStats.oro;
      if (typeof window.playerStats.plata  === 'number') this.moneda_plata     = window.playerStats.plata;
    } else {
      if (data.moneda       != null) this.moneda           = data.moneda;
      if (data.moneda_plata != null) this.moneda_plata     = data.moneda_plata;
      if (data.vidaPorcentaje   > 0) this.vidaPorcentaje   = data.vidaPorcentaje;
      if (data.aguaPorcentaje   > 0) this.aguaPorcentaje   = data.aguaPorcentaje;
      if (data.comidaPorcentaje > 0) this.comidaPorcentaje = data.comidaPorcentaje;
    }

    // Posicionar al jugador si existe
    if (this.player) {
      this.player.setVisible(true);
      this.player.setPosition(this.posicionplayerx, this.posicionplayery);
    }
    
    // Re-aplicar window.playerStats — tiene prioridad sobre BD
    if (window.playerStats) {
        if (typeof window.playerStats.vida   === 'number') this.vidaPorcentaje   = window.playerStats.vida;
        if (typeof window.playerStats.agua   === 'number') this.aguaPorcentaje   = window.playerStats.agua;
        if (typeof window.playerStats.comida === 'number') this.comidaPorcentaje = window.playerStats.comida;
        if (typeof window.playerStats.oro    === 'number') this.moneda           = window.playerStats.oro;
        if (typeof window.playerStats.plata  === 'number') this.moneda_plata     = window.playerStats.plata;
    }

    console.log('✅ Datos del jugador cargados exitosamente');
    
    // Renderizar slots inmediatamente
    this.renderInventoryAfterLoad();

    
    return data;
    
  } catch (error) {
    console.error('❌ Error de red al cargar datos del jugador:', error);
    return null;
  }
}


// Método auxiliar para renderizar inventario después de cargar
async renderInventoryAfterLoad() {
  if (typeof this.renderSlot !== 'function') return;

  // Recolectar todos los invoiceIds de herramientas presentes en el inventario
  const toolIds = [];
  [...this.STATE.slots, ...this.STATE.quickSlots].forEach(s => {
    if (s?.idx && this.ItemDefinitions?.[s.id]?.usos != null)
      toolIds.push(Number(s.idx));
  });

  // Pedir al backend los usos de todas las herramientas en una sola llamada
  if (toolIds.length > 0) {
    try {
      const r = await this.fetchWithTokenRetry(`${this.serverBase}/api/tool/uses/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: toolIds })
      });
      const data = await r.json();
      const uses = data.uses || {};
      [...this.STATE.slots, ...this.STATE.quickSlots].forEach(s => {
        if (s?.idx && uses[s.idx] != null) {
          s.usosRestantes = uses[s.idx].usos;
          console.log(`🔧 Usos restaurados: ${s.id} (idx ${s.idx}) → ${s.usosRestantes} usos`);
        }
      });
    } catch (e) {
      console.warn('⚠️ No se pudo cargar usos de herramientas al iniciar:', e);
    }
  }

  console.log('🖼️ Renderizando slots del inventario...');
  for (let i = 0; i < 40; i++) this.renderSlot(i);
  for (let i = 0; i < 7; i++) this.renderSlot(i);
}

// 4) Save game state
    async savegg() {
        console.log('💾 Iniciando guardado del juego...');
        
        // Verificar que tenemos los datos necesarios
        if (!this.playerName || !this.isAuthenticated) {
            console.error('❌ No se puede guardar: falta playerName o autenticación');
            return;
        }

        // Asegurarnos de tener token CSRF
        if (!this.csrfToken) {
            await this.getCSRFToken();
            if (!this.csrfToken) {
                console.error('❌ No se pudo obtener token CSRF para guardar');
                return;
            }
        }

        // Guardar solo los arrays principales (ignorar fantasmas)
        const inventoryData = this.STATE.slots.map((s, i) => ({ 
            id: i, 
            IDX: s?.idx ?? null,
            Manualid: s?.idm ?? null,
            objeto: s?.id ?? null, 
            cantidad: s?.count ?? 0, 
            tipo: 'inventario' 
        }));
        
        const chestData = this.STATE.quickSlots.map((s, i) => ({ 
            id: i, 
            IDX: s?.idx ?? null,
            Manualid: s?.idm ?? null,
            objeto: s?.id ?? null, 
            cantidad: s?.count ?? 0, 
            tipo: 'cofre' 
        }));
        
        // Usar window.playerStats.oro si está disponible; solo usar monto_moneda si moneda es null/undefined (no si es 0)
        const _canonicalMoneda = (window.playerStats && typeof window.playerStats.oro === 'number') ? window.playerStats.oro : this.moneda;
        this.moneda = Math.floor(_canonicalMoneda != null ? _canonicalMoneda : this.monto_moneda);
        
        const payload = {
            posicionplayerx: this.posicionplayerx, 
            posicionplayery: this.posicionplayery,
            vidaPorcentaje:   (window.playerStats && typeof window.playerStats.vida   === 'number') ? window.playerStats.vida   : this.vidaPorcentaje,
            aguaPorcentaje:   (window.playerStats && typeof window.playerStats.agua   === 'number') ? window.playerStats.agua   : this.aguaPorcentaje,
            comidaPorcentaje: (window.playerStats && typeof window.playerStats.comida === 'number') ? window.playerStats.comida : this.comidaPorcentaje,
            lenguaje: this.lenguaje, 
            nivel: this.nivel, 
            nivel_exp: this.nivel_exp, 
            mineria: this.mineria, 
            mineria_exp: this.mineria_exp,
            pesca: this.pesca, 
            pesca_exp: this.pesca_exp, 
            cocina: this.cocina, 
            cocina_exp: this.cocina_exp, 
            deforestacion: this.deforestacion, 
            deforestacion_exp: this.deforestacion_exp,
            fuerza: this.fuerza, 
            fuerza_exp: this.fuerza_exp, 
            agricultura: this.agricultura, 
            agricultura_exp: this.agricultura_exp,
            speed: this.speed, 
            mundo: this.mundo, 
            moneda: (window.playerStats && typeof window.playerStats.oro === 'number') ? window.playerStats.oro : this.moneda,
            moneda_plata: (window.playerStats && typeof window.playerStats.plata === 'number') ? window.playerStats.plata : this.moneda_plata,
            Username: this.Username,
            petName: this.petName || window.globalPetName || '---',
            misiones: this.misiones,
            inventory: inventoryData,
            chest: chestData
        };
        
        console.log('📤 Payload para guardar:', {
            playerName: this.playerName,
            moneda: this.moneda,
            inventoryItems: inventoryData.filter(item => item.objeto).length,
            chestItems: chestData.filter(item => item.objeto).length
        });
        
        try {
            // Usar fetchWithTokenRetry para manejar errores de token automáticamente
            const resp = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/save/${encodeURIComponent(this.playerName)}`,
                {
                    method: 'POST',
                    body: JSON.stringify(payload)
                },
                2 // maxRetries
            );
            
            console.log('📊 Status de guardado:', resp.status);
            
            if (!resp.ok) {
                const errorText = await resp.text().catch(() => 'No se pudo leer el error');
                console.error('❌ Error al guardar:', {
                    status: resp.status,
                    error: errorText
                });
                
                // Si es error 401 o 403 después de todos los reintentos
                if (resp.status === 401 || resp.status === 403) {
                    console.warn('⚠️ Token expirado o inválido después de reintentos');
                    this.showTokenErrorHub();
                }
                return;
            }
            
            const resData = await resp.json().catch(() => ({}));
            console.log('✅ Datos guardados correctamente:', resData);
        } catch (e) {
            console.error('❌ Error de red al guardar:', e);
        }
    }





        async fetchWithTokenRetry(url, options = {}, maxRetries = 2) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        
        // Combinar opciones
        const fetchOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };
        
        // Añadir token CSRF si está disponible
        if (this.csrfToken && !fetchOptions.headers['X-CSRF-Token']) {
            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
        }
        
        let retries = 0;
        let lastResponse = null;
        
        while (retries <= maxRetries) {
            try {
                console.log(`📤 Fetch ${url} (intento ${retries + 1}/${maxRetries + 1})`);
                
                const response = await fetch(url, fetchOptions);
                lastResponse = response;
                
                // Si es éxito, retornar la respuesta
                if (response.ok) {
                    return response;
                }
                
                // Si es error 401 (no autorizado), intentar refresh
                if (response.status === 401) {
                    console.log(`🔐 Error 401 detectado, intentando refresh...`);
                    
                    // Intentar obtener el cuerpo del error para mejor diagnóstico
                    let errorBody = {};
                    try {
                        errorBody = await response.json();
                    } catch (e) {
                        // No se pudo parsear el error como JSON
                    }
                    
                    // Verificar si es un error de token expirado
                    const isTokenError = errorBody.error && (
                        errorBody.error.includes('token_expired') ||
                        errorBody.error.includes('invalid_session') ||
                        errorBody.error.includes('authentication_required') ||
                        errorBody.canRefresh === true
                    );
                    
                    if (isTokenError && retries < maxRetries) {
                        console.log(`🔄 Token expirado, refrescando...`);
                        
                        // Intentar refresh
                        const refreshSuccess = await this.refreshAuthToken();
                        
                        if (refreshSuccess) {
                            // Actualizar headers con nuevo token CSRF
                            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
                            retries++;
                            
                            // Esperar antes de reintentar
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                            continue; // Reintentar la petición
                        } else {
                            console.error('❌ No se pudo refrescar el token');
                            break; // Salir del loop
                        }
                    } else {
                        // No es error de token o ya se intentó demasiadas veces
                        console.error(`❌ Error ${response.status} no manejable por refresh`);
                        break;
                    }
                }
                // Si es error 403 (prohibido), puede ser CSRF
                else if (response.status === 403) {
                    console.log(`🔐 Error 403 (CSRF posible), obteniendo nuevo token CSRF...`);
                    
                    if (retries < maxRetries) {
                        // Obtener nuevo token CSRF
                        await this.getCSRFToken();
                        
                        if (this.csrfToken) {
                            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
                            retries++;
                            
                            // Esperar antes de reintentar
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                            continue;
                        } else {
                            console.error('❌ No se pudo obtener nuevo token CSRF');
                            break;
                        }
                    }
                }
                // Para otros errores, no reintentar
                else {
                    console.error(`❌ Error HTTP ${response.status}`);
                    break;
                }
                
            } catch (error) {
                console.error(`❌ Error de red (intento ${retries + 1}):`, error);
                retries++;
                
                if (retries > maxRetries) {
                    throw error;
                }
                
                // Esperar antes de reintentar
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
        
        // Si llegamos aquí, todos los intentos fallaron
        return lastResponse;
    }


    
    async getCSRFToken() {
        try {
            console.log('🛡️ Obteniendo token CSRF...');
            const response = await fetch(`${this.serverBase}/api/auth/csrf-token`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.csrfToken = data.csrfToken;
                    window.csrfToken = data.csrfToken; // Compartir con StatsSync
                console.log('✅ Token CSRF obtenido');
                return true;
            } else {
                console.warn('⚠️ No se pudo obtener token CSRF');
                return false;
            }
        } catch (error) {
            console.error('❌ Error obteniendo CSRF token:', error);
            return false;
        }
    }
  
  

    // 🔍 ZOOM IN PRECISO - Usando valores predefinidos
preciseZoomIn(duration = 300) {
        if (this.currentZoomIndex < this.zoomValues.length - 1) {
            this.currentZoomIndex++;
            const newZoom = this.zoomValues[this.currentZoomIndex];
            this.tweens.add({
                targets: this.cameras.main,
                zoom: newZoom,
                duration,
                ease: 'Cubic.easeOut',
                onUpdate: () => this.clampCameraToMap(),
                onComplete: () => this.clampCameraToMap()
            });
        }
    }

    preciseZoomOut(duration = 300) {
        if (this.currentZoomIndex > 0) {
            this.currentZoomIndex--;
            const newZoom = this.zoomValues[this.currentZoomIndex];
            this.tweens.add({
                targets: this.cameras.main,
                zoom: newZoom,
                duration,
                ease: 'Cubic.easeOut',
                onUpdate: () => this.clampCameraToMap(),
                onComplete: () => this.clampCameraToMap()
            });
        }
   }

preciseZoomTo(targetZoom, duration = 400) {
    const targetIndex = this.zoomValues.findIndex(z => z === targetZoom);
    if (targetIndex === -1 || targetIndex === this.currentZoomIndex) return;
    const oldZoom = this.zoomValues[this.currentZoomIndex];
    this.currentZoomIndex = targetIndex;
    const newZoom = this.zoomValues[this.currentZoomIndex];
    console.log(`🎯 Zoom To: ${oldZoom} → ${newZoom}`);
    this.tweens.add({
        targets: this.cameras.main,
        zoom: newZoom,
        duration,
        ease: 'Cubic.easeOut',
        onUpdate: () => this.clampCameraToMap(),
        onComplete: () => {
            this.clampCameraToMap();
            console.log(`✅ Zoom To: ${this.cameras.main.zoom}x`);
        }
    });
}


    // 🎮 MÉTODO PARA AGREGAR MÁS VALORES DE ZOOM (si los necesitas)
    addZoomValue(newValue) {
        if (!this.zoomValues.includes(newValue)) {
            this.zoomValues.push(newValue);
            this.zoomValues.sort((a, b) => a - b); // Ordenar
            console.log(`🆕 Nuevo valor de zoom agregado: ${newValue}x`);
            console.log(`🎯 Valores actualizados: [${this.zoomValues.join(', ')}]`);
        }
    }

    // 🔧 MÉTODO PARA CAMBIAR EL ZOOM ACTUAL (útil para sincronizar)
    setCurrentZoomIndex(index) {
        if (index >= 0 && index < this.zoomValues.length) {
            this.currentZoomIndex = index;
            this.cameras.main.zoom = this.zoomValues[this.currentZoomIndex];
            console.log(`🔧 Zoom actual establecido a: ${this.zoomValues[this.currentZoomIndex]}x`);
        }
    }


    clampCameraToMap() {
        const cam = this.cameras && this.cameras.main;
        if (!cam || !this.map) return;

        // Asegurar bounds del propio camera
        cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

       // Tamaño visible en coordenadas del mundo teniendo en cuenta el zoom
        const visibleWidth = cam.width / Math.max(0.0001, cam.zoom);
        const visibleHeight = cam.height / Math.max(0.0001, cam.zoom);

        const maxScrollX = Math.max(0, this.map.widthInPixels - visibleWidth);
        const maxScrollY = Math.max(0, this.map.heightInPixels - visibleHeight);

        cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxScrollX);
        cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, maxScrollY);
    }





// Métodos para pegar dentro de tu clase Phaser.Scene


/* Métodos para pegar dentro de tu clase Phaser.Scene (ES6)
   Ej: class GameScene extends Phaser.Scene { ... estos métodos ... }
*/




// Asegurar dimensiones del panel para centrado correcto
_ensurePanelDimensions() {
  if (!this.hudEl_1) return;
  
  // Estilos CSS esenciales para el centrado
  const essentialStyles = {
    position: 'fixed',
    width: '600px', // Ancho fijo para centrado preciso
    minHeight: '400px', // Altura mínima
    maxWidth: '90vw', // Máximo ancho relativo a la ventana
    maxHeight: '80vh', // Máximo alto relativo a la ventana
    overflow: 'auto',
    boxSizing: 'border-box'
  };

  // Aplicar estilos esenciales
  Object.keys(essentialStyles).forEach(style => {
    this.hudEl_1.style[style] = essentialStyles[style];
  });
}

// Renderiza la lista a #listaEstadisticas_1 filtrando por texto
_hud_renderListHudEstadisticas_1(filter = '') {
  if (!this.listaEl_1) return;
  const q = (filter || '').toString().trim().toLowerCase();
  this.listaEl_1.innerHTML = '';
  const filtered = this._hud_apartados_1.filter(a => a.nombre.toLowerCase().includes(q));
  if (filtered.length === 0) {
    const no = document.createElement('div'); 
    no.style.padding = '10px'; 
    no.style.color = '#aaa'; 
    no.textContent = 'No se encontraron apartados';
    this.listaEl_1.appendChild(no); 
    return;
  }
  for (const item of filtered) {
    const el = document.createElement('div');
    el.className = 'est-item_1';
    el.tabIndex = 0;
    el.setAttribute('role','listitem');
    // markup: imagen + nombre
    const img = document.createElement('img'); 
    img.src = item.img; 
    img.alt = item.nombre;
    img.style.width = '32px';
    img.style.height = '32px';
    img.style.objectFit = 'contain';
    const span = document.createElement('span'); 
    span.textContent = item.nombre;
    span.style.marginLeft = '10px';
    el.appendChild(img); 
    el.appendChild(span);
    // click/enter -> mostrar detalle
    const onShow = (ev) => { 
      ev.stopPropagation(); 
      ev.preventDefault(); 
      this._hud_showDetalleHudEstadisticas_1(item); 
    };
    el.addEventListener('click', onShow);
    el.addEventListener('keydown', (ev) => { 
      if (ev.key === 'Enter') onShow(ev); 
    });
    this.listaEl_1.appendChild(el);
  }
}

// Mostrar detalle del item (muestra img, nombre y requisitos 2-3)
_hud_showDetalleHudEstadisticas_1(item) {
  if (!this.detalleEl_1) return;
  if (this.detalleImgEl_1) { 
    this.detalleImgEl_1.src = item.img || ''; 
    this.detalleImgEl_1.alt = item.nombre || '';
    this.detalleImgEl_1.style.width = '64px';
    this.detalleImgEl_1.style.height = '64px';
    this.detalleImgEl_1.style.objectFit = 'contain';
  }
  if (this.detalleNombreEl_1) this.detalleNombreEl_1.textContent = item.nombre || '';
  if (this.detalleReqEl_1) {
    this.detalleReqEl_1.innerHTML = '';
    const reqs = Array.isArray(item.requisitos) ? item.requisitos.slice(0,3) : [];
    if (reqs.length === 0) {
      const li = document.createElement('li'); 
      li.textContent = 'Sin requisitos.'; 
      this.detalleReqEl_1.appendChild(li);
    } else {
      for (const r of reqs) { 
        const li = document.createElement('li'); 
        li.textContent = r; 
        this.detalleReqEl_1.appendChild(li); 
      }
    }
  }
  this.detalleEl_1.classList.remove('hidden_1');
  // focus al boton volver si existe
  if (this.volverBtnEl_1) try { this.volverBtnEl_1.focus(); } catch(e) {}
}

_hud_hideDetalleHudEstadisticas_1() {
  if (!this.detalleEl_1) return;
  this.detalleEl_1.classList.add('hidden_1');
}


// Método de respaldo para centrado manual
_manualCenterPanel() {
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Obtener dimensiones reales del panel
  const panelRect = this.hudEl_1.getBoundingClientRect();
  const panelWidth = panelRect.width;
  const panelHeight = panelRect.height;
  
  // Calcular posición centrada
  const centerX = (viewportWidth - panelWidth) / 2;
  const centerY = (viewportHeight - panelHeight) / 2;
  
  // Aplicar posición centrada
  this.hudEl_1.style.left = `${Math.max(0, centerX)}px`;
  this.hudEl_1.style.top = `${Math.max(0, centerY)}px`;
  this.hudEl_1.style.transform = 'none';
  
  console.log('Panel centrado manualmente:', {
    left: this.hudEl_1.style.left,
    top: this.hudEl_1.style.top,
    width: panelWidth,
    height: panelHeight
  });
}









/*

actualizarBarra(valorActual, valorMaximo) {
  const barra = document.getElementById("yellow-bar-fill");
  if (barra) {
    const porcentaje = (valorActual / valorMaximo) * 100;
    barra.style.width = porcentaje + "%";
  }
}

*/















handlePageUnload() {
    // 1. Si hay objeto en cursor, soltarlo automáticamente
    if (this.STATE.selectedItem) {
        this.returnCursorItemToInventory();
    }
    
    // 2. Guardar inventario (sin objeto en cursor) en servidor
    this.savegg();
}

returnCursorItemToInventory() {
    if (!this.STATE.selectedItem) return;

    const item = this.STATE.selectedItem;
    console.log(`Soltando objeto automáticamente: ${item.id} x${item.count}`);
    
    // Intentar agregar el objeto de vuelta al inventario
    const success = this.addItemToAnyEmptySlot(item.id, item.count, item.tipo, item.unitPrice);
    
    if (success) {
        console.log('✅ Objeto devuelto al inventario');
    } else {
        console.warn('⚠️ No había espacio, objeto perdido');
        // Aquí podrías dropear el objeto en el mundo si quieres
    }
    
    // Limpiar el cursor
    this.STATE.selectedItem = null;
    this.hideCursor();
}

addItemToAnyEmptySlot(itemId, count, tipo = "unknown", unitPrice = 0) {
    // Primero intentar en inventario normal
    for (let i = 0; i < this.STATE.slots.length; i++) {
        if (!this.STATE.slots[i]) {
            this.STATE.slots[i] = { id: itemId, count, tipo, unitPrice };
            return true;
        }
    }
    
    // Si no hay espacio, intentar en cofre
    for (let i = 0; i < this.STATE.quickSlots.length; i++) {
        if (!this.STATE.quickSlots[i]) {
            this.STATE.quickSlots[i] = { id: itemId, count, tipo, unitPrice };
            return true;
        }
    }
    
    return false; // No hay espacio en ningún lado
}

hideCursor() {
    // Ocultar visualmente el cursor del inventario
    const cursor = document.getElementById('inventory-cursor');
    if (cursor) cursor.style.display = 'none';
}











actualizarImagenJugador(imgSrc) {
  document.getElementById('player-image').src = imgSrc;
}
actualizarNombreUsuario(nombre) {
  document.getElementById('username').textContent = nombre;
}


actualizarBarraVida(porcentaje) {
  porcentaje = Math.round(porcentaje);
  this.vidaPorcentaje = porcentaje;

  // ── Sincronizar con contrato solo si listo Y valor es coherente ──
  // No sincronizar 0 si window.playerStats.vida > 0 (reset visual sin datos reales)
  const _shouldSyncVida = this._statsReady && 
    !(porcentaje === 0 && window.playerStats && (window.playerStats.vida || 0) > 0);
  if (_shouldSyncVida && this.statsSync) this.statsSync.set('vida', porcentaje);
  if (_shouldSyncVida && window.playerStats) window.playerStats.vida = porcentaje;

  const healthBar = document.getElementById('health-bar');
  const fill = healthBar.querySelector('.status-fill');
  const text = healthBar.querySelector('.status-text');
  
  fill.style.width = porcentaje + '%';
  
  if (this.lenguaje === 1) {
    text.textContent = `Life ${porcentaje}%`;
  } else if (this.lenguaje === 2) {
    text.textContent = `Vida ${porcentaje}%`;
  } else if (this.lenguaje === 3) {
    text.textContent = `Vida ${porcentaje}%`;
  } else if (this.lenguaje === 4) {
    text.textContent = `Vida ${porcentaje}%`;
  } else if (this.lenguaje === 5) {
    text.textContent = `生命 ${porcentaje}%`;
  } else if (this.lenguaje === 6) {
    text.textContent = `생명 ${porcentaje}%`;
  }
  
  this.queuedAction({ type: 'forSpam2'});
}

actualizarBarraAgua(porcentaje) {
  porcentaje = Math.round(porcentaje);
  this.aguaPorcentaje = porcentaje;

  const _shouldSyncAgua = this._statsReady && 
    !(porcentaje === 0 && window.playerStats && (window.playerStats.agua || 0) > 0);
  if (_shouldSyncAgua && this.statsSync) this.statsSync.set('agua', porcentaje);
  if (_shouldSyncAgua && window.playerStats) window.playerStats.agua = porcentaje;

  const waterBar = document.getElementById('water-bar');
  const fill = waterBar.querySelector('.status-fill');
  const text = waterBar.querySelector('.status-text');
  
  fill.style.width = porcentaje + '%';
  
  if (this.lenguaje === 1) {
    text.textContent = `Water ${porcentaje}%`;
  } else if (this.lenguaje === 2) {
    text.textContent = `Agua ${porcentaje}%`;
  } else if (this.lenguaje === 3) {
    text.textContent = `Agua ${porcentaje}%`;
  } else if (this.lenguaje === 4) {
    text.textContent = `Água ${porcentaje}%`;
  } else if (this.lenguaje === 5) {
    text.textContent = `水 ${porcentaje}%`;
  } else if (this.lenguaje === 6) {
    text.textContent = `물 ${porcentaje}%`;
  }
  
  this.queuedAction({ type: 'forSpam2'});
}

actualizarBarraComida(porcentaje) {
  porcentaje = Math.round(porcentaje);
  this.comidaPorcentaje = porcentaje;

  const _shouldSyncComida = this._statsReady && 
    !(porcentaje === 0 && window.playerStats && (window.playerStats.comida || 0) > 0);
  if (_shouldSyncComida && this.statsSync) this.statsSync.set('comida', porcentaje);
  if (_shouldSyncComida && window.playerStats) window.playerStats.comida = porcentaje;

  const foodBar = document.getElementById('food-bar');
  const fill = foodBar.querySelector('.status-fill');
  const text = foodBar.querySelector('.status-text');
  
  fill.style.width = porcentaje + '%';
  
  if (this.lenguaje === 1) {
    text.textContent = `Food ${porcentaje}%`;
  } else if (this.lenguaje === 2) {
    text.textContent = `Comida ${porcentaje}%`;
  } else if (this.lenguaje === 3) {
    text.textContent = `Comida ${porcentaje}%`;
  } else if (this.lenguaje === 4) {
    text.textContent = `Comida ${porcentaje}%`;
  } else if (this.lenguaje === 5) {
    text.textContent = `食物 ${porcentaje}%`;
  } else if (this.lenguaje === 6) {
    text.textContent = `음식 ${porcentaje}%`;
  }
  
  this.queuedAction({ type: 'forSpam2'});
}





  
  
    update(time, delta) {
      if (!this.keys) return;

      // Reposicionar burbuja local sobre el sprite del jugador cada frame
      {
        const b = document.getElementById('local-chat-bubble');
        if (b && b.style.display !== 'none') this._positionLocalBubble(b);
      }



        // corriendo guardado

        /*

        if (this.elipeticiones === 0) {
            
          if (this.sceneActive) {
            // Acumula el tiempo transcurrido
            this.saveTimer += delta;
        
            // Si han pasado 1000 ms (1 segundos)
            if (this.saveTimer >= 1000) {
                this.savegg();
                this.loadMissionsData();
                this.saveTimer = 0;
              }


            }
          }
            */


          /*
          

      // acumulación de tiempo , y actualizacion de hora diaria
      this._adminAccum += delta;

      if (this._adminAccum >= this.adminReloadInterval) {
        if (!this._loadingAdmin) {
          this._loadingAdmin = true;
          try {
            this.loadAdminTimeOnly();
            if (this.hora && typeof this.hora === 'string') {
              const soloHoraYMinutos = this.hora.slice(0, 5);
              document.getElementById('hubdia-text').textContent = `hour: ${soloHoraYMinutos} ${this.dia_noche}`;
            }
          } finally {
            this._loadingAdmin = false;
          }
        }
        // restar el intervalo (soporta que delta sea mayor que el intervalo)
        this._adminAccum = this._adminAccum % this.adminReloadInterval;
      }

        
      if (this.definirhorax === 0) {
          
        if (this.hora && typeof this.hora === 'string') {
            const soloHoraYMinutos = this.hora.slice(0, 5);
            document.getElementById('hubdia-text').textContent = `hour: ${soloHoraYMinutos} ${this.dia_noche}`;

            this.definirhorax = 1;

        }

      }

      */



        


        // cargando datos — only update DOM when value actually changed (prevents every-frame layout thrash)
        if (this._cachedMoneda !== this.moneda) {
          this._cachedMoneda = this.moneda;
          if (!this._elInfoLeft) this._elInfoLeft = document.getElementById('info-text-left');
          if (this._elInfoLeft) this._elInfoLeft.textContent = `${this.moneda}`;
        }


    
  
  
        // guardando posicion
        this.previousPosition = { x: this.player.x, y: this.player.y };



    this.posicionplayerx = this.player.x;
    this.posicionplayery = this.player.y;

        // ⭐ PRIMERO: Verificar constantemente si el click sigue presionado
    // Esto previene que el movimiento continue si el click se soltó en UI
    if (this.mouseMovement.followCursorActive && !this.input.activePointer.isDown) {
        console.log('🔄 Detectado: followCursorActive pero click no presionado - Limpiando');
        this.stopMouseMovement();
    }
    
    
    // 1. PRIMERO manejar movimiento por mouse
    this.handleMouseMovement(delta);
    

    // 2. Solo permitir teclado si NO estamos usando mouse
    if (!this.mouseMovement.followCursorActive) {
        // Tu código de teclado original aquí...
        if (!this.keys) return;
        
        let dx = 0, dy = 0;
        
        if (this.keys.leftArrow.isDown || this.keys.left.isDown)  dx -= 1;
        if (this.keys.rightArrow.isDown || this.keys.right.isDown) dx += 1;
        if (this.keys.upArrow.isDown || this.keys.up.isDown)    dy -= 1;
        if (this.keys.downArrow.isDown || this.keys.down.isDown)  dy += 1;
        
        // ... resto de tu código de teclado
    
        
        // Normalizar velocidad diagonal
        if (dx !== 0 && dy !== 0) {
            dx /= Math.sqrt(2);
            dy /= Math.sqrt(2);
        }
        
        // Aplicar movimiento CON deltaTime
        const deltaInSeconds = delta / 1000;
        this.player.x += dx * this.speed * deltaInSeconds;
        this.player.y += dy * this.speed * deltaInSeconds;

        // NOTA (paridad con GameScene): la animación YA NO se decide aquí con
        // el input crudo. Antes este bloque llamaba a anims.play() y, más
        // abajo, la restauración por colisión volvía a tocar la animación en
        // el mismo frame → conflictos y congelamientos. Ahora la animación se
        // decide UNA sola vez, después de resolver colisiones por eje (ver
        // "Decisión ÚNICA de animación" más abajo).
    }
    
    // Enviar movimiento del jugador (si es que tienes multiplayer)
    if (typeof this.sendPlayerMovement === 'function') {
        this.sendPlayerMovement();
    }

    // Y-sorting: depth = pies del jugador local cada frame
    // El jugador usa origin (0.5,0.5) → pies = y + displayHeight/2
    // Así se compara correctamente contra objetos con origin (0,1) donde depth = obj.y
    const playerFeetY = this.player.y + this.player.displayHeight * 0.5;
    this.player.setDepth(playerFeetY);
    if (this.usuariox) this.usuariox.setDepth(playerFeetY + 1);

    // Y-SORT PROFESIONAL (one-shot): calibrar estructuras cuando las
    // colisiones del mapa de la tienda ya estén cargadas.
    if (!this._buildingDepthsCalibrated &&
        Array.isArray(this.collisionRectangles2) && this.collisionRectangles2.length) {
      this._buildingDepthsCalibrated = true;
      this.calibrateBuildingDepths();
    }
    
    // Limpiar jugadores inactivos
    if (typeof this.cleanInactivePlayers === 'function') {
        this.cleanInactivePlayers();
    }

    // Obtener las coordenadas en el mapa
    const mapX = Math.floor(this.player.x / this.map.tileWidth); // Coordenada X en tiles
    const mapY = Math.floor(this.player.y / this.map.tileHeight); // Coordenada Y en tiles

    // ============ MASCOTA (PERRO) – UPDATE COMPLETO, MIRADA CORREGIDA, ANIMACIÓN ESTABLE Y EVASIÓN DE COLISIONES ============
const dog = this.dog;
const player = this.player;

if (!dog || !dog.sprite || !player) return;

// If pet was removed, keep it hidden and skip dog logic entirely
if (this.petData && this.petData.equipped === false) {
  if (dog.sprite && dog.sprite.visible) dog.sprite.setVisible(false);
  if (dog.shadowContainer && dog.shadowContainer.visible) dog.shadowContainer.setVisible(false);
  if (this.dogNameText && this.dogNameText.visible) this.dogNameText.setVisible(false);
} else {

if (this.prevPlayerX === undefined) this.prevPlayerX = player.x;
if (this.prevPlayerY === undefined) this.prevPlayerY = player.y;

if (dog.prevX === undefined) dog.prevX = dog.x;
if (dog.prevY === undefined) dog.prevY = dog.y;
if (dog.prevTargetX === undefined) dog.prevTargetX = dog.targetX;
if (dog.prevTargetY === undefined) dog.prevTargetY = dog.targetY;
if (dog.lastFacing === undefined) dog.lastFacing = 'right';
if (dog.desiredFacing === undefined) dog.desiredFacing = 'right';
if (dog.smoothOffsetX === undefined) dog.smoothOffsetX = 0;
if (dog.smoothOffsetY === undefined) dog.smoothOffsetY = 20;
if (dog.lastAnimState === undefined) dog.lastAnimState = 'idle';
if (dog.isMoving === undefined) dog.isMoving = false;
// FIX: facingLockUntil nunca se inicializaba; "now >= undefined" siempre es
// false, así que la mirada del perro jamás se actualizaba con las teclas
// izquierda/derecha. Con 0 el primer cambio de mirada funciona de inmediato.
if (dog.facingLockUntil === undefined) dog.facingLockUntil = 0;
// Lado de esquive preferido por la evasión anticipada (+1 / -1 / 0 = ninguno)
if (dog.avoidSide === undefined) dog.avoidSide = 0;

const now = this.time.now;
const FOLLOW_OFFSET = 70;

// Teclas opcionales
const leftPressed  = this.cursors?.left?.isDown  || this.keys?.A?.isDown || false;
const rightPressed = this.cursors?.right?.isDown || this.keys?.D?.isDown || false;
const upPressed    = this.cursors?.up?.isDown    || this.keys?.W?.isDown || false;
const downPressed  = this.cursors?.down?.isDown  || this.keys?.S?.isDown || false;

// Movimiento real del jugador
const playerDx = player.x - this.prevPlayerX;
const playerDy = player.y - this.prevPlayerY;
const playerMoved = Math.hypot(playerDx, playerDy) > 0.06;

this.prevPlayerX = player.x;
this.prevPlayerY = player.y;

// Dirección de intención del jugador
let intentDir = null;
if (downPressed && !upPressed) intentDir = 'down';
else if (upPressed && !downPressed) intentDir = 'up';
else if (rightPressed && !leftPressed) intentDir = 'right';
else if (leftPressed && !rightPressed) intentDir = 'left';

// Mirada del perro
if (intentDir === 'left' || intentDir === 'right') {
  if (now >= dog.facingLockUntil && dog.desiredFacing !== intentDir) {
    dog.desiredFacing = intentDir;
    dog.facingLockUntil = now + 90;
  }
} else if (playerMoved && Math.abs(playerDx) > 0.06) {
  dog.desiredFacing = playerDx > 0 ? 'right' : 'left';
}

// Dirección de seguimiento
let desiredDir = this.lastDirection || 'right';

if (intentDir === 'down') {
  desiredDir = 'down';
  this.lastDirection = 'down';
} else if (intentDir === 'up') {
  desiredDir = 'up';
  this.lastDirection = 'up';
} else if (intentDir === 'left' || intentDir === 'right') {
  desiredDir = intentDir;
  this.lastDirection = intentDir;
} else if (playerMoved) {
  if (Math.abs(playerDx) > Math.abs(playerDy) && Math.abs(playerDx) > 0.06) {
    desiredDir = playerDx > 0 ? 'right' : 'left';
    this.lastDirection = desiredDir;
  } else if (Math.abs(playerDy) > 0.06) {
    desiredDir = playerDy > 0 ? 'down' : 'up';
    this.lastDirection = desiredDir;
  }
}

// Offset objetivo según dirección
let targetOffsetX = 0;
let targetOffsetY = 20;

switch (desiredDir) {
  case 'left':
    targetOffsetX = FOLLOW_OFFSET;
    targetOffsetY = 20;
    break;
  case 'right':
    targetOffsetX = -FOLLOW_OFFSET;
    targetOffsetY = 20;
    break;
  case 'up':
    targetOffsetX = 0;
    targetOffsetY = FOLLOW_OFFSET;
    break;
  case 'down':
    targetOffsetX = 0;
    targetOffsetY = -FOLLOW_OFFSET;
    break;
}

// Suavizado del offset
const OFFSET_LERP = 0.10;
dog.smoothOffsetX += (targetOffsetX - dog.smoothOffsetX) * OFFSET_LERP;
dog.smoothOffsetY += (targetOffsetY - dog.smoothOffsetY) * OFFSET_LERP;

// Target final
dog.targetX = player.x + dog.smoothOffsetX;
dog.targetY = player.y + dog.smoothOffsetY;

// Helper de colisiones del perro
const collidesAt = (x, y) => {
  const w = Math.max(18, (dog.sprite.displayWidth || 32) * 0.55);
  const h = Math.max(14, (dog.sprite.displayHeight || 32) * 0.50);
  const rect = new Phaser.Geom.Rectangle(x - w * 0.5, y - h * 0.5, w, h);

  const arrays = [this.collisionRectangles, this.collisionRectangles1];

  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const obstacle of arr) {
      if (!obstacle) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, obstacle)) {
        return true;
      }
    }
  }

  return false;
};

// Busca un punto alternativo para rodear la colisión
const findEscapePoint = (fromX, fromY, toX, toY) => {
  const dx = toX - fromX;
  const dy = toY - fromY;

  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;

  const tests = [
    [toX + signX * 18, toY],
    [toX, toY + signY * 18],
    [toX - signX * 18, toY],
    [toX, toY - signY * 18],

    [fromX + signX * 18, fromY],
    [fromX, fromY + signY * 18],

    [toX + signX * 12, toY + signY * 12],
    [toX - signX * 12, toY + signY * 12],
    [toX + signX * 12, toY - signY * 12],
    [toX - signX * 12, toY - signY * 12],

    [fromX + signX * 24, fromY + signY * 10],
    [fromX + signX * 24, fromY - signY * 10],
    [fromX - signX * 24, fromY + signY * 10],
    [fromX - signX * 24, fromY - signY * 10]
  ];

  for (const [tx, ty] of tests) {
    if (!collidesAt(tx, ty)) {
      return { x: tx, y: ty };
    }
  }

  return null;
};

// Resolver movimiento sin atravesar obstáculos
const resolveDogMove = (fromX, fromY, toX, toY) => {
  // 1) intento directo
  if (!collidesAt(toX, toY)) {
    return { x: toX, y: toY };
  }

  // 2) deslizamiento por ejes
  if (!collidesAt(toX, fromY)) {
    return { x: toX, y: fromY };
  }

  if (!collidesAt(fromX, toY)) {
    return { x: fromX, y: toY };
  }

  // 3) rodeo inteligente
  const escapePoint = findEscapePoint(fromX, fromY, toX, toY);
  if (escapePoint) return escapePoint;

  // 4) intento de empuje corto en varias direcciones
  const steps = [6, 10, 14, 18, 24, 30, 36];
  for (const s of steps) {
    const tries = [
      [toX + s, fromY],
      [toX - s, fromY],
      [fromX, toY + s],
      [fromX, toY - s],
      [toX + s, toY],
      [toX - s, toY],
      [toX, toY + s],
      [toX, toY - s]
    ];

    for (const [cx, cy] of tries) {
      if (!collidesAt(cx, cy)) {
        return { x: cx, y: cy };
      }
    }
  }

  // 5) si todo falla, no avanza
  return { x: fromX, y: fromY };
};

// ── EVASIÓN ANTICIPADA (perro "inteligente") ──────────────────────────────
// Igual que en GameScene: el perro sondea el camino directo hacia su objetivo
// y, si va a chocar en los próximos pasos, desvía el rumbo hacia un costado
// ANTES de tocar el obstáculo (recordando el lado con dog.avoidSide para no
// zigzaguear). resolveDogMove queda como red de seguridad final.
const computeSteeredTarget = () => {
  const dx = dog.targetX - dog.x;
  const dy = dog.targetY - dog.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 6) {
    dog.avoidSide = 0;
    return { x: dog.targetX, y: dog.targetY };
  }

  const nx = dx / dist;
  const ny = dy / dist;

  const LOOKAHEAD_STEPS = [14, 28, 42];
  let blockedAt = -1;
  for (const d of LOOKAHEAD_STEPS) {
    if (d > dist + 8) break;
    if (collidesAt(dog.x + nx * d, dog.y + ny * d)) { blockedAt = d; break; }
  }

  if (blockedAt < 0) {
    dog.avoidSide = 0;
    return { x: dog.targetX, y: dog.targetY };
  }

  const px = -ny;
  const py = nx;
  const sides = dog.avoidSide !== 0 ? [dog.avoidSide, -dog.avoidSide] : [1, -1];

  for (const side of sides) {
    for (const lateral of [26, 40, 54]) {
      const cx = dog.x + nx * Math.min(blockedAt, 24) + px * lateral * side;
      const cy = dog.y + ny * Math.min(blockedAt, 24) + py * lateral * side;

      if (!collidesAt(cx, cy) &&
          !collidesAt(dog.x + (cx - dog.x) * 0.5, dog.y + (cy - dog.y) * 0.5)) {
        dog.avoidSide = side;
        return { x: cx, y: cy };
      }
    }
  }

  dog.avoidSide = 0;
  return { x: dog.targetX, y: dog.targetY };
};

const steerTarget = computeSteeredTarget();

// Movimiento suave
const DOG_LERP = 0.08;
const isDetouring = (steerTarget.x !== dog.targetX || steerTarget.y !== dog.targetY);
const effLerp = isDetouring ? Math.min(0.14, DOG_LERP * 1.75) : DOG_LERP;
const proposedX = dog.x + (steerTarget.x - dog.x) * effLerp;
const proposedY = dog.y + (steerTarget.y - dog.y) * effLerp;

const moved = resolveDogMove(dog.x, dog.y, proposedX, proposedY);
const prevDogX = dog.x;
const prevDogY = dog.y;

dog.x = moved.x;
dog.y = moved.y;

const dogDx = dog.x - prevDogX;
const dogDy = dog.y - prevDogY;
const dogMoved = Math.hypot(dogDx, dogDy) > 0.02;

// Mirada final del perro
if (dog.desiredFacing === 'left' || dog.desiredFacing === 'right') {
  dog.lastFacing = dog.desiredFacing;
} else if (Math.abs(dogDx) > 0.01) {
  dog.lastFacing = dogDx > 0 ? 'right' : 'left';
}
// FIX MULTIJUGADOR: sendPlayerMovement emite this.dog.direction, pero nunca
// se actualizaba — los demás jugadores no veían hacia dónde mira tu perro.
dog.direction = dog.lastFacing;

// Animación estable: solo se reproduce si realmente está caminando
const shouldAnimate = playerMoved || dogMoved || intentDir !== null;

if (shouldAnimate && (dogMoved || playerMoved || intentDir)) {
  const animKey = (dog.lastFacing === 'left') ? 'perro_left' : 'perro_right';

  // Solo reinicia si cambió la animación
  if (!dog.sprite.anims.isPlaying || dog.sprite.anims.currentAnim?.key !== animKey) {
    if (this.anims.exists(animKey)) {
      dog.sprite.play(animKey, true);
    } else {
      dog.sprite.setTexture(
        dog.lastFacing === 'left' ? 'perro_izquierda_1' : 'perro_derecha_1'
      );
    }
  }

  dog.isMoving = true;
  dog.lastAnimState = animKey;
} else {
  if (dog.isMoving || dog.sprite.anims.isPlaying) {
    dog.sprite.anims.stop();
  }

  dog.sprite.setTexture(
    dog.lastFacing === 'left' ? 'perro_izquierda_1' : 'perro_derecha_1'
  );

  dog.isMoving = false;
  dog.lastAnimState = 'idle';
}

// Posición y profundidad
dog.sprite.setPosition(dog.x, dog.y);

const dogFeetY = dog.y + dog.sprite.displayHeight * 0.5;
dog.sprite.setDepth(dogFeetY);

if (dog.shadowContainer) {
  dog.shadowContainer.setPosition(dog.x, dog.y + 22);
  dog.shadowContainer.setDepth(dogFeetY - 1);
}

// Etiqueta del nombre de la mascota: sigue al perro, arriba de su cabeza
if (this.dogNameText) {
  const named = this._isNameSet && this._isNameSet(this.petName);
  if (named && dog.sprite.visible) {
    this.dogNameText.setVisible(true);
    this.dogNameText.setPosition(dog.x, dog.y - dog.sprite.displayHeight * 0.5 - 4);
    this.dogNameText.setDepth(dogFeetY + 1);
  } else {
    this.dogNameText.setVisible(false);
  }
}

} // end petData.equipped else block



      // rectangulo de player
  
      
      // En el método create, crea el rectángulo del jugador:
      this.playerRect = new Phaser.Geom.Rectangle(this.player.x - 15, this.player.y + 25, 30, 15);
  
      // Actualiza la posición del rectángulo del jugador con base en la posición actual de this.player
      this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 15);
  
      // Limpia el graphics y redibuja el rectángulo del jugador
      this.graphics.clear();
      this.graphics.strokeRectShape(this.playerRect);
      this.graphics.setVisible(false);
  
      // Comprueba la colisión entre el rectángulo del jugador y cada rectángulo de la capa de colisión.
      // Asegúrate de que 'this.collisionRectangles' contiene cada rectángulo de la capa (por ejemplo, extraídos de Tiled)

      /*
      this.collisionRectangles.forEach(rect => {
        if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, rect)) {
          console.log("¡Colisión detectada!");
          this.player.x = this.previousPosition.x;
          this.player.y = this.previousPosition.y;
          this.player.anims.stop();
        }
      });
  
      this.collisionRectangles1.forEach(rect1 => {
        if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, rect1)) {
          console.log("¡Colisión detectada!");
          this.player.anims.stop();
        }
      });

      */

      // ── COLISIÓN POR EJE + DECISIÓN ÚNICA DE ANIMACIÓN (paridad GameScene) ──
      // Antes: si el hitbox tocaba una pared se restauraba la posición COMPLETA
      // (X e Y) y se hacía anims.stop() — el jugador quedaba clavado sin
      // deslizarse y sin animación. Ahora se prueba cada eje por separado: si
      // solo la X está bloqueada, la Y sigue avanzando (deslizamiento a lo
      // largo de la pared) y viceversa — el mismo mecanismo que GameScene,
      // válido para teclado y mouse.
      {
        const playerHitbox = (x, y) => new Phaser.Geom.Rectangle(x - 15, y + 25, 30, 15);

        const collidesWithAny = (rect, rectArray) => {
          if (!Array.isArray(rectArray)) return false;
          return rectArray.some(obstacle =>
            obstacle && Phaser.Geom.Intersects.RectangleToRectangle(rect, obstacle)
          );
        };

        const prevX = this.previousPosition?.x ?? this.player.x;
        const prevY = this.previousPosition?.y ?? this.player.y;

        const nextX = this.player.x;
        const nextY = this.player.y;

        // Probar colisión solo en X
        const rectX = playerHitbox(nextX, prevY);
        if (collidesWithAny(rectX, this.collisionRectangles2)) {
          this.player.x = prevX;
        }

        // Probar colisión solo en Y
        const rectY = playerHitbox(this.player.x, nextY);
        if (collidesWithAny(rectY, this.collisionRectangles2)) {
          this.player.y = prevY;
        }

        // Sincronizar hitbox visual y posición persistida con la posición corregida
        this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 15);
        this.posicionplayerx = this.player.x;
        this.posicionplayery = this.player.y;

        // ===== Decisión ÚNICA de animación del jugador para este frame =====
        // Igual que GameScene: se usa el desplazamiento REAL ya corregido.
        const finalDx = this.player.x - prevX;
        const finalDy = this.player.y - prevY;
        const EPS = 0.05;
        const movingX = Math.abs(finalDx) > EPS;
        const movingY = Math.abs(finalDy) > EPS;

        const mouseActive = !!(this.mouseMovement && this.mouseMovement.followCursorActive);

        if (mouseActive) {
          // MODO MOUSE: solo 'left'/'right'. 'right' cubre derecha,
          // derecha+arriba y derecha+abajo; 'left' sus equivalentes. La mirada
          // sale de la INTENCIÓN hacia el cursor, así la animación sigue viva
          // aunque una colisión bloquee la horizontal (ej. derecha+arriba
          // contra una pared a la derecha).
          const mdx = this.mouseMovement.directionX || 0;
          let facing;
          if (mdx < -0.001) facing = 'left';
          else if (mdx > 0.001) facing = 'right';
          else facing = (this.lastDirection === 'left') ? 'left' : 'right';

          if (movingX || movingY) {
            this.lastDirection = facing;
            const currentKey = this.player.anims.currentAnim?.key;
            if (!this.player.anims.isPlaying || currentKey !== facing) {
              this.player.anims.play(facing, true);
            }
          } else {
            this.player.anims.stop();
            this.lastDirection = facing;
            this.player.setTexture(facing === 'left' ? 'player_left_1' : 'player_right_1');
          }
        } else if (!movingX && !movingY) {
          // Sin movimiento real: idle según última dirección
          this.player.anims.stop();
          if (this.lastDirection === "left") {
            this.player.setTexture('player_left_1');
          } else if (this.lastDirection === "right") {
            this.player.setTexture('player_right_1');
          } else if (this.lastDirection === "up") {
            this.player.setTexture('player_up_1');
          } else if (this.lastDirection === "down") {
            this.player.setTexture('player_down_1');
          }
        } else {
          // TECLADO: prioridad horizontal usando el eje que REALMENTE se movió
          const animKey = movingX ? (finalDx < 0 ? 'left' : 'right')
                                   : (finalDy < 0 ? 'up' : 'down');
          this.lastDirection = animKey;
          const currentKey = this.player.anims.currentAnim?.key;
          if (!this.player.anims.isPlaying || currentKey !== animKey) {
            this.player.anims.play(animKey, true);
          }
        }
      }

        
      this.collisionRectangles1.forEach(rect1 => {
        if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, rect1)) {
          console.log("¡Colisión detectada!");
          this.player.anims.stop();
          
          

          this.inicio = 1;

          // aparicion del personaje
          if (this.inicio === 1) {
            this.scene.stop();
            //this.player.setPosition(708, 514);  // Usar setPosition en lugar de asignación directa
            this.posicionplayerx = 1552;
            this.posicionplayery = 1531;
            this.inicio = 0;
            this.mundo = 1;


                // ✅ Token aún válido, usarlo directamente
                this.savegg();
                this.saveTimer = 0;


            
          // Ocultar el HUD principal
          document.getElementById('game-hud').classList.remove('hud-visible');
          document.getElementById('game-hud').classList.add('hud-hidden');

          // Limpiar el texto de la moneda
          document.getElementById('info-text-left').textContent = '';

          // Ocultar casillas rápidas
          const slots = document.querySelectorAll('.quick-slot');
          slots.forEach(slot => {
            slot.style.display = 'none';
          });

          // Ocultar el botón de misión
          //document.getElementById('quest-button').style.display = 'none';

          // Ocultar hub de vida, agua y comida
          this.removeListener();

          // Opcional: ocultar la imagen del jugador si quieres
          this.actualizarImagenJugador(''); // o puedes ocultar el elemento directamente con `display: 'none'`

          // Opcional: limpiar el nombre de usuario
          this.actualizarNombreUsuario('');

          // Opcional: resetear barras a 0 o algún estado oculto
          const _sr2 = this._statsReady;
          this._statsReady = false;
          this.actualizarBarraVida(0);
          this.actualizarBarraAgua(0);
          this.actualizarBarraComida(0);
          this._statsReady = _sr2;

          // Ocultar chat y contenedor del HUD extendido
          document.getElementById('hub').classList.add('hidden');
          document.getElementById('quick-slots-bar').classList.add('hidden');
          document.getElementById('open-chat-btn').classList.add('hidden');

                    
          document.getElementById('open-chat-btn').classList.add('hidden');

          // ocultar coodenadas

          document.getElementById('game-ui-text').style.display = 'none';

          
            // ocultando barra de correr
            
            //document.getElementById("yellow-bar-container").style.display = "none";



            // cerrando listener de ocultar bontones

            
            if (this.innerBtn && this.onInnerBtnClick) {
                this.innerBtn.removeEventListener('click', this.onInnerBtnClick);
            }

            // cerrando listener de mochila


            if (!this.hudImages) {

              console.log("mochila no interactuado modo normal")

            } else {
                
              this.hudImages.forEach(img => {
                  img.removeEventListener('click', this.onHudImageClick);
                  img.removeEventListener('mouseenter', this.onHudImageEnter);
                  img.removeEventListener('mouseleave', this.onHudImageLeave);
              });

              this.hudImages = null;

            }


            // cerrando listener de movimiento de menus de estadisticas, inventari , reputacion y otros .

               // Recorremos todos los panels arrastrables
                const panels = document.querySelectorAll('[data-draggable="true"]');

                panels.forEach(panel => {
                    if (!panel._dragHandlers) return;

                    // Quitar listeners del panel
                    panel.removeEventListener("mousedown", panel._dragHandlers.mousedown);
                    panel.removeEventListener("touchstart", panel._dragHandlers.touchstart);
                    panel.removeEventListener("dragstart", panel._dragHandlers.dragstart);

                    // Limpiar referencia
                    panel._dragHandlers = null;
                });

                // Quitar listeners globales de documento
                if (document._dragHandlers) {
                    document.removeEventListener("mousemove", document._dragHandlers.mousemove);
                    document.removeEventListener("mouseup", document._dragHandlers.mouseup);
                    document.removeEventListener("touchmove", document._dragHandlers.touchmove);
                    document.removeEventListener("touchend", document._dragHandlers.touchend);
                    document.removeEventListener("touchcancel", document._dragHandlers.touchcancel);
                    document.removeEventListener("keydown", document._dragHandlers.keydown);

                    document._dragHandlers = null;
                }

                // Resetear panel activo
                window.activeDraggablePanel = null;

                console.log("Todos los panels arrastrables han sido limpiados correctamente.");


            



                // Botones Redondos Cierres 
              if (this.roundButtons) {
                  this.roundButtons[0]?.removeEventListener('click', this.onRoundBtnDashboard);
                  this.roundButtons[1]?.removeEventListener('click', this.onRoundBtnMail);
                  this.roundButtons[2]?.removeEventListener('click', this.onRoundBtnStats);
                  this.roundButtons[3]?.removeEventListener('click', this.onRoundBtnTransactions);
                  this.roundButtons[4]?.removeEventListener('click', this.onRoundBtnNFT);
                  this.roundButtons[5]?.removeEventListener('click', this.onRoundBtnSkills);
                  this.roundButtons[6]?.removeEventListener('click', this.onRoundBtnStore);
              }

              document.getElementById('cerrarReputacion')
                  ?.removeEventListener('click', this.onCloseReputation);

              document.getElementById('cerrarEstadisticas')
                  ?.removeEventListener('click', this.onCloseStats);

              this.input.keyboard.off('keydown-R', this.onKeyR);
              this.input.keyboard.off('keydown-E', this.onKeyE);

              console.log("UI + listeners limpiados correctamente");

              this.stopMusicSafely();




















          }


          delete this.mostrarObjetoEnCursor;

          


          this.scene.start("LoadingScenegame");

        }
      });



  // Verificando Intrusos

  /*

      

      // Bandera para saber si se detectó la consola abierta
      this.isConsoleOpen = false;
      // Técnica 1: Verificación por cambio de dimensiones de la ventana
      this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: this.checkConsoleDimensions,
          callbackScope: this
      });
      // Técnica 2: Usando un getter en un objeto que se imprime en la consola
      this.setupConsoleDetection();

      */






      this.usuariox.setText(this.Username);
      this.usuariox.setPosition(this.player.x, this.player.y - 60);
  

      
    // barra de energia

    /*

    
    this.deltaSeconds = delta / 1000; // Convertir delta a segundos

    // Si se presiona la tecla "Z", la barra se gasta a razón de 5% por segundo
    if (this.keys.run.isDown) {
      this.progress -= 0.05 * this.deltaSeconds;
    } else {
        // De lo contrario, se recarga a 5% por segundo
        this.progress += 0.05 * this.deltaSeconds;
    }
    // Asegurarse de que progress se mantenga entre 0 y 1
    this.progress = Phaser.Math.Clamp(this.progress, 0, 1);

    this.actualizarBarra(this.progress * 100, 100); // Actualiza al 30%

    // Mostrar la barra solo cuando se presiona la tecla "Z"
    if (this.keys.run.isDown) {
      document.getElementById("yellow-bar-container").style.display = "block";


      if (this.progress <= 0.0) {
        this.speed = 2.7;
        this.player.anims.msPerFrame = 111;
      } else {
        
        this.speed = 4.5;
        this.player.anims.msPerFrame = 65;

      }

    } else {
      document.getElementById("yellow-bar-container").style.display = "none";
      this.speed = 2.7;
      this.player.anims.msPerFrame = 111;
    }

    document.querySelector('#quest-button .quest-text').textContent = Math.round(this.progress * 100) + '%';


*/
      this.speed = 240;
      this.player.anims.msPerFrame = 100;
      



    //document.getElementById('game-ui-text').textContent = `Zoom : ${this.cameras.main.zoom.toFixed(2)}`;

    }
  
  
  // =========================================================================
  // SISTEMA DE SINCRONIZACIÓN DE STATS CON EL SMART CONTRACT
  // =========================================================================

  _initStatsSync() {
    if (typeof window.StatsSync !== 'undefined') {
      this.statsSync = new window.StatsSync(this);
      console.log('✅ StatsSync inicializado en tiendajuego');
    } else {
      console.warn('⚠️  StatsSync no disponible en tiendajuego');
    }
    if (window.playerStats) {
      const ps = window.playerStats;
      if (typeof ps.vida   === 'number') this.vidaPorcentaje   = ps.vida;
      if (typeof ps.agua   === 'number') this.aguaPorcentaje   = ps.agua;
      if (typeof ps.comida === 'number') this.comidaPorcentaje = ps.comida;
      if (typeof ps.oro    === 'number') this.moneda           = ps.oro;
      if (typeof ps.plata  === 'number') this.moneda_plata     = ps.plata;
      console.log('📊 Stats cargados en tiendajuego:', {
        vida: this.vidaPorcentaje, agua: this.aguaPorcentaje,
        comida: this.comidaPorcentaje, oro: this.moneda, plata: this.moneda_plata,
      });
    }
    this._statsReady = true;

    // Actualizar visualmente las barras con los valores cargados del contrato
    this._refreshBarrasUI();
  }

  _refreshBarrasUI() {
    const savedReady = this._statsReady;
    this._statsReady = false;
    try {
      if (typeof this.actualizarBarraVida   === 'function') this.actualizarBarraVida(this.vidaPorcentaje);
      if (typeof this.actualizarBarraAgua   === 'function') this.actualizarBarraAgua(this.aguaPorcentaje);
      if (typeof this.actualizarBarraComida === 'function') this.actualizarBarraComida(this.comidaPorcentaje);
    } finally {
      this._statsReady = savedReady;
    }
  }

  // ── Nombre único de la mascota (compartido con GameScene) ────────────────
  _isNameSet(v) {
    return typeof v === 'string' && v.trim() !== '' && v.trim() !== '---';
  }

  _updateDogNameLabel() {
    if (!this.dogNameText) return;
    const named = this._isNameSet(this.petName);
    this.dogNameText.setText(named ? this.petName : '');
    const dogVisible = !!(this.dog && this.dog.sprite && this.dog.sprite.visible);
    this.dogNameText.setVisible(named && dogVisible);
  }

  _syncMonedas() {
    if (!this.statsSync) return;
    if (window.playerStats) {
      window.playerStats.oro   = this.moneda;
      window.playerStats.plata = this.moneda_plata;
    }
    this.statsSync.set('oro',   this.moneda   || 0);
    this.statsSync.set('plata', this.moneda_plata || 0);
  }

  async _flushStatsBeforeExit() {
    if (this.statsSync) {
      await this.statsSync._flushUpdates();
      console.log('✅ Stats flushed antes de salir de tiendajuego');
    }
  }

  // =========================================================================
  // NOTIFICATION SYSTEM (mirrors GameScene)
  // =========================================================================
  _openNotifPanel() {
    // Hide the old mailbox panel if it leaked into view
    const oldMailbox = document.getElementById('_mail-panel-root');
    if (oldMailbox) oldMailbox.style.display = 'none';
    if (this._notifPanel) {
      this._notifPanel.classList.add('notif-panel-visible');
      this._notifPanel.style.display = 'flex';
      this._markAllNotifRead();
    }
  }

  _closeNotifPanel() {
    if (this._notifPanel) {
      this._notifPanel.classList.remove('notif-panel-visible');
      this._notifPanel.style.display = 'none';
    }
  }

  _addNotification(msg, icon = '🔔', save = true) {
    if (!this._notifList) this._notifList = [];
    const notif = { id: Date.now(), msg, icon, time: new Date().toISOString(), read: false };
    this._notifList.unshift(notif);
    if (this._notifList.length > 50) this._notifList.pop();
    this._renderNotifList();
    this._updateNotifBadge();
    if (save) this._saveNotifications();
  }

  _markAllNotifRead() {
    if (!this._notifList) return;
    this._notifList.forEach(n => n.read = true);
    this._renderNotifList();
    this._updateNotifBadge();
    this._saveNotifications();
  }

  _updateNotifBadge() {
    if (!this._notifList) return;
    const unread = this._notifList.filter(n => !n.read).length;
    if (this._notifBadge) {
      this._notifBadge.textContent = unread;
      this._notifBadge.style.display = unread > 0 ? 'flex' : 'none';
    }
  }

  _renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list || !this._notifList) return;
    if (!this._notifList.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = this._notifList.map(n => {
      const t = new Date(n.time);
      const timeStr = t.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
      return `<div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-body">
          <div class="notif-msg">${n.msg}</div>
          <div class="notif-time">${timeStr}</div>
        </div>
        <button class="notif-item-x" data-notif-id="${n.id}" title="Dismiss" style="background:none;border:none;color:#ff8080;font-size:13px;cursor:pointer;line-height:1;padding:2px 4px;flex-shrink:0;align-self:flex-start;">✕</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.notif-item-x').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); this._deleteNotif(Number(btn.dataset.notifId)); };
    });
  }

  _deleteNotif(id) {
    this._notifList = this._notifList.filter(n => n.id !== id);
    this._renderNotifList();
    this._updateNotifBadge();
    this._saveNotifications();
  }

  _clearAllNotif() {
    this._notifList = [];
    this._renderNotifList();
    this._updateNotifBadge();
    this._saveNotifications();
  }

  async _loadNotifications() {
    if (!this.Username) return;
    try {
      const base = this.serverclient1 || '';
      const res = await fetch(`${base}/api/notifications/${encodeURIComponent(this.Username)}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        this._notifList = data.notifications || [];
        this._renderNotifList();
        this._updateNotifBadge();
      }
    } catch (_) {}
  }

  async _saveNotifications() {
    if (!this.Username) return;
    try {
      const base = this.serverclient1 || '';
      await fetch(`${base}/api/notifications/${encodeURIComponent(this.Username)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken || '' },
        body: JSON.stringify({ notifications: this._notifList.slice(0, 50) })
      });
    } catch (_) {}
  }

} // fin clase tiendajuego

window.tiendajuego = tiendajuego;