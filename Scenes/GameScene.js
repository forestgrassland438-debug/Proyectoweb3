// eslint-disable-next-line no-unused-

/*!
 * ============================================================================
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
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
 * GENERADO: 21/02/2025
 * ============================================================================
 */


class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

      this.currentAccount = null;
      this.panelactualizacion = 1;
      this.statsSync = null; // StatsSync para sincronización con el contrato
      this._statsReady = false; // true solo después de cargar stats del contrato

      // Anti-trampa de recolección: si es true, talar/minar pide la recompensa
      // al SERVIDOR (/api/gather/claim) en vez de acuñarla el cliente. Déjalo en
      // false hasta desplegar el backend con GATHER_ENFORCE y probar en staging.
      this.GATHER_SERVER = false;

        this.playerName = null;
        this.address = null;
        this.csrfToken = null;
        this.isAuthenticated = false;

        this.posicionplayerx = 2097;
        this.posicionplayery = 2359;
        this.vidaPorcentaje = 100000;
        this.aguaPorcentaje = 100000;
        this.comidaPorcentaje = 10000;
        this.monto_moneda = 10000;

      this.perf = null; // Instancia de PhaserRPGPerf
      this.chunkObjectsMap = new Map();

        this.waterCollectionStatus = null;
        this.waterCollectCooldown = null;
        this.waterCollectAttemptsToday = 0;
        this.waterCollectionCycle = 0;
        this.isWaterCollectionAvailable = false;
        this.waterCollectionTimer = null;

      this._queue = [];
      this._processing = false;
      this._windowMs = 1000; // 1 segundo entre tandas

                            
      this.trashHubOpen = false;
      this.trashItems = new Map(); // slotIndex -> {id, name, quantity, image}
      this.currentTrashSelection = null; // {itemId, maxQuantity, slotIndex}
      this.trashSystemInitialized = false;

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

this.prevPlayerX = undefined;
this.prevPlayerY = undefined;


          // Variables para misiones diarias
          this.currentNpcMission = null; // 'granjero' o 'guardian'
          this.dailyMissionsData = null;
          this.missionsPanel = null;
          this.missionItems = new Map(); // Cache de imágenes de items
          this.languageMap = {
            1: 'en-US',
            2: 'en-PH', 
            3: 'es-419',
            4: 'pt-BR',
            5: 'zh-CN',
            6: 'ko-KR'
          };
          
        














    // Configuración del sistema de reporte de errores
    this.errorReporter = {
      enabled: true,
      serverUrl: '', // Se establecerá en create()
      pendingReports: [],
      isReporting: false,
      reportCache: new Set(), // Cache simple para evitar duplicados
      lastReportTime: 0,
      minReportInterval: 10000, // 10 segundos entre reportes
      maxPendingReports: 20, // Máximo de reportes pendientes
      version: '1.0.0',
      accessToken: null,
      
      // Inicializar sistema
      init: function(scene) {
        if (!this.enabled) {
          console.warn('⚠️ Sistema de reporte de errores deshabilitado');
          return;
        }
        
        this.scene = scene;
        this.serverUrl = scene.serverclient || 'http://localhost:3000';
        
        // Obtener token de autenticación
        this.loadAuthToken();
        
        // Guardar referencias originales de console
        this.originalConsoleError = console.error;
        this.originalConsoleWarn = console.warn;
        this.originalConsoleLog = console.log;
        this.originalConsoleInfo = console.info;
        
        // Sobrescribir console.error
        console.error = (...args) => {
          this.originalConsoleError.apply(console, args);
          this.captureError('console.error', args, scene);
        };
        
        // Sobrescribir console.warn
        console.warn = (...args) => {
          this.originalConsoleWarn.apply(console, args);
          this.captureError('console.warn', args, scene);
        };
        
        // Capturar logs importantes
        console.log = (...args) => {
          this.originalConsoleLog.apply(console, args);
          
          // Capturar solo logs que parezcan errores
          const message = args.join(' ').toLowerCase();
          if (message.includes('error') || 
              message.includes('failed') ||
              message.includes('exception') ||
              message.includes('uncaught') ||
              message.includes('typeerror') ||
              message.includes('referenceerror')) {
            this.captureError('console.log', args, scene);
          }
        };
        
        // Capturar errores globales no capturados
        window.addEventListener('error', (event) => {
          this.captureError('window.error', [
            `Error: ${event.message}`,
            `File: ${event.filename}`,
            `Line: ${event.lineno}`,
            `Column: ${event.colno}`
          ], scene);
        }, true);
        
        // Capturar promesas rechazadas no manejadas
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason || 'Unknown rejection';
          this.captureError('unhandledrejection', [
            `Promise rejection: ${reason}`,
            reason instanceof Error ? reason.stack : String(reason)
          ], scene);
        });
        
        // Capturar errores de recursos
        window.addEventListener('loaderror', (event) => {
          this.captureError('resource.error', [
            `Resource failed to load: ${event.target.src || event.target.href}`
          ], scene);
        }, true);
        
        // Capturar errores de Phaser específicos
        if (scene.game) {
          scene.game.events.on('error', (error) => {
            this.captureError('phaser.game.error', [error], scene);
          });
          
          scene.game.events.on('loaderror', (key, file) => {
            this.captureError('phaser.load.error', [
              `Failed to load: ${key}`,
              `File: ${file.src}`,
              `Type: ${file.type}`
            ], scene);
          });
        }
        
        // Capturar errores en la escena actual
        scene.events.on('error', (error) => {
          this.captureError('phaser.scene.error', [error], scene);
        });
        
        // Iniciar procesador de reportes pendientes
        this.startPendingProcessor();
        
        console.log('✅ Sistema de reporte de errores inicializado con autenticación');
      },
      
      // Cargar token de autenticación desde sessionStorage
      loadAuthToken: function() {
        try {
          const tokensStr = sessionStorage.getItem('authTokens');
          if (tokensStr) {
            const tokens = JSON.parse(tokensStr);
            this.accessToken = tokens.accessToken || null;
            console.log('🔑 Token de autenticación cargado para reporte de errores');
          }
        } catch (error) {
          console.warn('⚠️ No se pudo cargar token de autenticación:', error);
          this.accessToken = null;
        }
      },
      
      // Actualizar token de autenticación
      updateAuthToken: function(newToken) {
        this.accessToken = newToken;
        console.log('🔄 Token de autenticación actualizado para reporte de errores');
      },
      
      // Capturar error
      captureError: function(type, args, scene) {
        if (!this.enabled) return;
        
        try {
          // Prevenir spam temporal
          const now = Date.now();
          if (now - this.lastReportTime < this.minReportInterval) {
            return;
          }
          
          // Convertir argumentos a string
          const message = args.map(arg => {
            if (arg instanceof Error) {
              return `Error: ${arg.message}\nStack: ${arg.stack}`;
            } else if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          }).join(' ');
          
          // Crear hash simple para evitar duplicados en cache local
          const errorHash = this.simpleHash(type + message);
          
          // Verificar cache local
          if (this.reportCache.has(errorHash)) {
            return;
          }
          
          // Limitar cache a 100 elementos
          if (this.reportCache.size > 100) {
            const first = this.reportCache.values().next().value;
            this.reportCache.delete(first);
          }
          
          this.reportCache.add(errorHash);
          
          // Preparar datos del error
          const errorData = {
            type: type,
            message: message.substring(0, 1000), // Limitar tamaño
            stack: new Error().stack,
            timestamp: new Date().toISOString(),
            url: window.location.pathname, // Solo el path, sin query params que puedan contener tokens
            version: this.version,
            
            // Información del jugador
            playerName: scene.playerName || 'unknown',
            address: scene.currentAccount || 'unknown',
            
            // Información del juego
            gameState: this.getGameState(scene),
            
            // Información del sistema
            systemInfo: this.getSystemInfo(),
            
            // Información de Phaser
            phaserInfo: this.getPhaserInfo(scene)
          };
          
          // Intentar extraer más detalles del error
          args.forEach(arg => {
            if (arg instanceof Error && arg.stack) {
              errorData.stack = arg.stack.substring(0, 5000);
              errorData.errorType = arg.constructor.name;
              errorData.errorMessage = arg.message;
            }
          });
          
          // Encolar reporte para enviar
          this.queueReport(errorData);
          this.lastReportTime = now;
          
        } catch (error) {
          // Si falla el reporte, usar console original para evitar bucles
          this.originalConsoleError?.apply(console, ['Error en sistema de reporte:', error]);
        }
      },
      
      // Obtener estado del juego
      getGameState: function(scene) {
        try {
          return {
            scene: scene.scene?.key || 'unknown',
            position: {
              x: Math.round(scene.player?.x || 0),
              y: Math.round(scene.player?.y || 0)
            },
            fps: Math.round(scene.game?.loop?.actualFps || 0),
            memory: performance.memory ? {
              usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
              totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
              jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            } : null,
            zoom: scene.cameras?.main?.zoom || 1,
            worldBounds: scene.cameras?.main?.worldView || null,
            time: scene.time.now,
            active: scene.scene?.isActive() || false,
            visible: scene.scene?.isVisible() || false
          };
        } catch (error) {
          return { error: 'Failed to get game state' };
        }
      },
      
      // Obtener información del sistema
      getSystemInfo: function() {
        try {
          return {
            screen: {
              width: window.screen.width,
              height: window.screen.height
            },
            window: {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio
            },
            navigator: {
              language: navigator.language,
              online: navigator.onLine
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          };
        } catch (error) {
          return { error: 'Failed to get system info' };
        }
      },
      
      // Obtener información de WebGL
      getWebGLInfo: function() {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          
          if (!gl) {
            return { supported: false };
          }
          
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          
          return {
            supported: true,
            renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
            vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown',
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
          };
        } catch (error) {
          return { supported: false, error: error.message };
        }
      },
      
      // Obtener información de Phaser
      getPhaserInfo: function(scene) {
        try {
          return {
            version: Phaser.VERSION,
            renderer: scene.game.renderer.type,
            width: scene.game.config.width,
            height: scene.game.config.height,
            parent: scene.game.config.parent,
            scaleMode: scene.game.config.scale?.mode,
            autoRound: scene.game.config.scale?.autoRound,
            backgroundColor: scene.game.config.backgroundColor,
            physics: scene.game.config.physics ? Object.keys(scene.game.config.physics) : [],
            fps: {
              target: scene.game.config.fps?.target,
              forceSetTimeOut: scene.game.config.fps?.forceSetTimeOut,
              deltaHistory: scene.game.config.fps?.deltaHistory
            },
            pipeline: scene.game.config.pipeline,
            images: scene.textures ? Object.keys(scene.textures.list).length : 0,
            sounds: scene.sound ? scene.sound.sounds.length : 0,
            sprites: scene.children ? scene.children.list.filter(child => child.type === 'Sprite').length : 0
          };
        } catch (error) {
          return { error: 'Failed to get Phaser info' };
        }
      },
      
      // Hash simple para cache local
      simpleHash: function(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convertir a 32-bit
        }
        return hash.toString(16);
      },
      
      // Encolar reporte
      queueReport: function(errorData) {
        // Limitar cola de reportes pendientes
        if (this.pendingReports.length >= this.maxPendingReports) {
          this.pendingReports.shift(); // Eliminar el más antiguo
        }
        
        this.pendingReports.push(errorData);
      },
      
      // Iniciar procesador de reportes pendientes
      startPendingProcessor: function() {
        setInterval(() => {
          if (this.pendingReports.length > 0 && !this.isReporting) {
            const nextReport = this.pendingReports.shift();
            this.sendReport(nextReport);
          }
        }, 2000); // Procesar cada 2 segundos
      },
      
      // Enviar reporte al backend CON TOKEN DE AUTENTICACIÓN
      sendReport: async function(errorData) {
        if (!this.serverUrl || this.isReporting) {
          // Reencolar si no se puede enviar ahora
          this.queueReport(errorData);
          return;
        }
        
        this.isReporting = true;
        
        try {
          // Preparar headers con autenticación
          const headers = {
            'Content-Type': 'application/json',
            'X-Error-Report': '1.0',
            'X-Client-Version': this.version,
            'X-Game-Build': 'phaser-game'
          };
          
          // Agregar token de autorización si está disponible
          if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
          }
          
          // Usar fetch con timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const response = await fetch(`${this.serverUrl}/api/error/report`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(errorData),
            signal: controller.signal,
            mode: 'cors',
            credentials: 'omit'
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const result = await response.json();
            
            if (result.alreadyReported) {
              console.log('📊 Error ya reportado anteriormente');
            } else if (result.created) {
              console.log('🚨 Error reportado al servidor');
            } else if (result.updated) {
              console.log(`📊 Error actualizado (${result.occurrenceCount} ocurrencias)`);
            }
            
            // Éxito, limpiar cache si es necesario
            if (this.reportCache.size > 50) {
              const half = Math.floor(this.reportCache.size / 2);
              const entries = Array.from(this.reportCache).slice(0, half);
              entries.forEach(hash => this.reportCache.delete(hash));
            }
            
          } else {
            console.warn('⚠️ Error al reportar error:', response.status, response.statusText);
            // Reintentar más tarde
            this.queueReport(errorData);
          }
        } catch (error) {
          // Silenciar errores de red para no generar más errores
          if (error.name !== 'AbortError') {
            console.warn('⚠️ No se pudo reportar error (posible problema de red)');
          }
          
          // Reintentar más tarde
          this.queueReport(errorData);
        } finally {
          this.isReporting = false;
        }
      },
      
      // Reportar error manualmente desde cualquier parte del código CON TOKEN
      reportManual: function(message, details = {}, severity = 'error') {
        if (!this.enabled || !this.scene) return;
        
        const errorData = {
          type: 'manual',
          message: String(message),
          timestamp: new Date().toISOString(),
          url: window.location.pathname, // Solo el path, sin query params que puedan contener tokens
          playerName: this.scene.playerName || 'unknown',
          address: this.scene.currentAccount || 'unknown',
          details: details,
          severity: severity,
          gameState: this.getGameState(this.scene),
          systemInfo: this.getSystemInfo(),
          version: this.version
        };
        
        this.queueReport(errorData);
        
        // También loguear localmente
        switch(severity) {
          case 'critical':
            this.originalConsoleError?.apply(console, ['[CRITICAL]', message, details]);
            break;
          case 'error':
            this.originalConsoleError?.apply(console, ['[ERROR]', message, details]);
            break;
          case 'warning':
            this.originalConsoleWarn?.apply(console, ['[WARNING]', message, details]);
            break;
          default:
            this.originalConsoleLog?.apply(console, ['[INFO]', message, details]);
        }
      },
      
      // Método para obtener estadísticas de errores personales (requiere autenticación)
      getMyErrorStats: async function() {
        if (!this.accessToken) {
          console.warn('⚠️ Se requiere autenticación para obtener estadísticas de errores');
          return null;
        }
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(`${this.serverUrl}/api/error/my-stats`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            return data;
          } else {
            console.warn('Error obteniendo estadísticas:', response.status);
            return null;
          }
        } catch (error) {
          console.warn('Error de conexión al obtener estadísticas:', error);
          return null;
        }
      },
      
      // Método para obtener mis errores (requiere autenticación)
      getMyErrors: async function(limit = 20, page = 1) {
        if (!this.accessToken) {
          console.warn('⚠️ Se requiere autenticación para obtener mis errores');
          return null;
        }
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(
            `${this.serverUrl}/api/error/my-errors?limit=${limit}&page=${page}`, 
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
              },
              signal: controller.signal
            }
          );
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            return data;
          } else {
            console.warn('Error obteniendo mis errores:', response.status);
            return null;
          }
        } catch (error) {
          console.warn('Error de conexión al obtener mis errores:', error);
          return null;
        }
      },
      
      // Deshabilitar temporalmente
      disable: function(duration = 30000) {
        this.enabled = false;
        console.log(`⏸️ Reporte de errores deshabilitado por ${duration}ms`);
        
        setTimeout(() => {
          this.enabled = true;
          console.log('▶️ Reporte de errores habilitado');
        }, duration);
      },
      
      // Habilitar/Deshabilitar permanentemente
      setEnabled: function(enabled) {
        this.enabled = enabled;
        console.log(`Reporte de errores ${enabled ? 'habilitado' : 'deshabilitado'}`);
      },
      
      // Limpiar cache
      clearCache: function() {
        this.reportCache.clear();
        this.pendingReports = [];
        console.log('🗑️ Cache de errores limpiada');
      },
      
      // Obtener estado del sistema
      getStatus: function() {
        return {
          enabled: this.enabled,
          serverUrl: this.serverUrl,
          cacheSize: this.reportCache.size,
          pendingReports: this.pendingReports.length,
          isReporting: this.isReporting,
          version: this.version,
          hasAuthToken: !!this.accessToken
        };
      },
      
      // Testear conexión con el servidor
      testConnection: async function() {
        try {
          const headers = {};
          if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
          }
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(`${this.serverUrl}/api/error/health`, {
            method: 'GET',
            headers: headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          return {
            connected: response.ok,
            status: response.status,
            server: this.serverUrl,
            authenticated: !!this.accessToken
          };
        } catch (error) {
          return {
            connected: false,
            error: error.message,
            server: this.serverUrl,
            authenticated: !!this.accessToken
          };
        }
      },
      
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
      headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
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
      headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
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
          headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
          
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

// Modificar el método openMissionsPanel para usar el panel HTML:
async openMissionsPanel(npcId) {
  console.log(`🎯 Abriendo panel de misiones para NPC: ${npcId}`);
  this.currentNpcMission = npcId;
  
  // El panel se abre SIEMPRE y él mismo se encarga de cargar las misiones.
  // Antes se cargaban aquí y solo se abría si la respuesta traía success:true,
  // así que hablarle a un NPC sin misiones para hoy no hacía nada de nada.
  // Ahora, si no hay misiones, el panel abre igual con su mensaje.
  if (this.missionsPanel && typeof this.missionsPanel.show === 'function') {
    await this.missionsPanel.show(npcId);
    // Tutorial (paso 9, el último): ver el panel del granjero lo termina.
    this._onTutorialMissionsOpened && this._onTutorialMissionsOpened(npcId);
    return;
  }

  // Sin panel montado (el HTML de misiones no está en esta página): al menos
  // se avisa por notificación.
  console.warn('⚠️ No hay panel de misiones en el DOM');
  const missionsData = await this.loadDailyMissions(npcId);
  if (!missionsData || !missionsData.success) {
    this.showNotification(
      this.lenguaje === 3 ? 'No hay misiones disponibles ahora.' : 'No missions available right now.',
      'info'
    );
  }
}

// Método para cargar misiones diarias
async loadDailyMissions(npcId) {
  try {
    console.log(`📥 Cargando misiones diarias para ${npcId}...`);
    
    // Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ No se pueden cargar misiones: falta autenticación');
      return null;
    }
    
    this.currentNpcMission = npcId;
    const today = new Date().toISOString().split('T')[0];
    
    // Asegurarnos de tener token CSRF
    if (!this.csrfToken) {
      await this.getCSRFToken();
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Añadir token CSRF si está disponible (aunque GET no lo requiere normalmente)
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
    }
    
    const res = await fetch(`${this.serverBase}/api/missions/daily/${npcId}/${today}`, {
      method: 'GET',
      credentials: 'include',
      headers: headers
    });

    console.log(`📊 Status de carga de misiones para ${npcId}:`, res.status);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No se pudo leer el error');
      console.error(`❌ Error al cargar misiones para ${npcId}:`, {
        status: res.status,
        error: errorText
      });
      
      if (res.status === 401 || res.status === 403) {
        console.warn('⚠️ Token expirado al cargar misiones');
        this.showTokenErrorHub();
        return null;
      }
      
      throw new Error(`Error al cargar misiones: ${res.status}`);
    }

    const data = await res.json();
    this.dailyMissionsData = data;
    
    console.log(`✅ Misiones diarias cargadas para ${npcId}:`, {
      totalMissions: data.missions?.length || 0,
      userProgress: data.userProgress?.completedCount || 0
    });
    
    return data;
    
  } catch (error) {
    console.error('Error cargando misiones diarias:', error);
    
    // Mostrar error al usuario
    if (this.lenguaje === 3) { // español
      this.showNotification('Error loading missions. Try again later.', 'error');
    } else if (this.lenguaje === 1) { // inglés
      this.showNotification('Error loading missions. Try again later.', 'error');
    }
    
    return null;
  }
}

// ============================================================================
// APOYO AL PANEL DE MISIONES  (2026-08-03)
// ----------------------------------------------------------------------------
// El panel necesita dos cosas que antes no existían:
//   • el id REAL del inventario que corresponde al itemId de la misión
//     (las misiones se escriben con nombres sueltos como "zanahoria" o
//     "carrot", pero el inventario guarda "zanahoria_buena"),
//   • cuántas unidades lleva ya el jugador, para pintar la barra de progreso.
// Se usa el MISMO mapeo y el MISMO criterio flexible que
// checkMissionRequirements, para que lo que muestra el panel y lo que valida
// el botón "Complete" no puedan discrepar.
// ============================================================================

MISSION_ITEM_MAP = {
  'zanahoria': 'zanahoria_buena', 'carrot': 'zanahoria_buena',
  'tomate': 'tomate_buena',       'tomato': 'tomate_buena',
  'trigo': 'trigo_buena',         'wheat': 'trigo_buena',
  'calabaza': 'calabaza_buena',   'pumpkin': 'calabaza_buena',
  'piedra': 'mineral_piedra',     'stone': 'mineral_piedra',
  'cobre': 'mineral_cobre',       'copper': 'mineral_cobre',
  'hierro': 'mineral_hierro',     'iron': 'mineral_hierro',
  'carbon': 'carbon',             'coal': 'carbon',
  'madera': 'madera',             'wood': 'madera',
  'moneda': 'moneda',             'coin': 'moneda'
};

/** itemId de la misión → id que realmente existe en el inventario. */
resolveMissionItemId(missionItemId) {
  const raw = String(missionItemId || '');
  return this.MISSION_ITEM_MAP[raw] || this.MISSION_ITEM_MAP[raw.toLowerCase()] || raw;
}

/** Cuántas unidades del ítem pedido por una misión lleva ya el jugador. */
getMissionItemCount(missionItemId) {
  const objetivo = String(this.resolveMissionItemId(missionItemId)).toLowerCase().trim();
  if (!objetivo) return 0;

  let total = 0;
  const contar = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(slot => {
      if (!slot || !slot.id) return;
      const id = String(slot.id).toLowerCase().trim();
      // Mismo criterio flexible que checkMissionRequirements.
      const coincide = id === objetivo ||
                       id.includes(objetivo) ||
                       objetivo.includes(id) ||
                       id === `${objetivo}_buena`;
      if (coincide) total += parseInt(slot.count || slot.quantity || 0, 10) || 0;
    });
  };

  contar(this.STATE?.slots);
  contar(this.STATE?.quickSlots);
  contar(this.STATE?.chestSlots);
  contar(this.casillas);
  contar(this.casillasExtra);
  return total;
}

/**
 * Ruta de imagen EXACTA de un ítem, para que el panel de misiones no muestre
 * iconos rotos ni genéricos. Se prefiere siempre la ruta declarada en
 * ItemDefinitions (la misma que usa el inventario), y solo si el ítem no está
 * ahí se prueban las carpetas de misiones y de recursos.
 * @returns {string[]} rutas a probar en orden
 */
getMissionItemImageCandidates(itemId) {
  const rutas = [];
  const real = this.resolveMissionItemId(itemId);

  const deDefiniciones = (id) => {
    const def = this.ItemDefinitions ? this.ItemDefinitions[id] : null;
    if (def && def.src) rutas.push(def.src);
  };
  deDefiniciones(real);
  if (real !== itemId) deDefiniciones(itemId);

  rutas.push(`./Game/Objetos/Itemmision/${real}.png`);
  if (real !== itemId) rutas.push(`./Game/Objetos/Itemmision/${itemId}.png`);
  rutas.push(`./Game/Source/${real}.png`);
  if (real !== itemId) rutas.push(`./Game/Source/${itemId}.png`);
  rutas.push('./Game/Source/moneda.png');

  return [...new Set(rutas)];
}

// Modifica el método checkMissionRequirements para agregar más logs de depuración:
// Método para verificar si el jugador tiene los items para una misión - VERSIÓN COMPLETA Y DEPURADA
// Método para verificar si el jugador tiene los items para una misión - VERSIÓN USANDO STATE
// Método para verificar si el jugador tiene los items para una misión - VERSIÓN COMPLETA Y DEPURADA
async checkMissionRequirements(missionId) {
  try {
    console.log(`🔍 VERIFICANDO REQUISITOS PARA MISIÓN: ${missionId}`);
    console.log('==============================================');
    
    // DEBUG: Mostrar estado actual
    console.log('📊 ESTADO ACTUAL:');
    console.log('- playerName:', this.playerName);
    console.log('- isAuthenticated:', this.isAuthenticated);
    console.log('- dailyMissionsData:', this.dailyMissionsData ? '✅ Cargado' : '❌ No cargado');
    
    // Buscar la misión en los datos cargados
    if (!this.dailyMissionsData || !this.dailyMissionsData.missions) {
      console.error('❌ No hay datos de misiones cargados');
      return false;
    }
    
    const mission = this.dailyMissionsData.missions.find(m => m.missionId === missionId);
    if (!mission) {
      console.error(`❌ Misión ${missionId} no encontrada en datos locales`);
      return false;
    }
    
    console.log(`📝 Misión encontrada: ${mission.itemId}, cantidad requerida: ${mission.requiredAmount}`);
    
    // Mapear nombres de items de misión a nombres de inventario
    const itemNameMap = {
      'zanahoria': 'zanahoria_buena',
      'tomate': 'tomate_buena', 
      'trigo': 'trigo_buena',
      'calabaza': 'calabaza_buena',
      'piedra': 'mineral_piedra',
      'cobre': 'mineral_cobre',
      'hierro': 'mineral_hierro',
      'carbon': 'carbon',
      'madera': 'madera',
      'moneda': 'moneda',
      'carrot': 'zanahoria_buena',  // ¡IMPORTANTE! Si la misión usa "carrot" en inglés
      'tomato': 'tomate_buena',
      'wheat': 'trigo_buena',
      'pumpkin': 'calabaza_buena',
      'stone': 'mineral_piedra',
      'copper': 'mineral_cobre',
      'iron': 'mineral_hierro',
      'coal': 'carbon',
      'wood': 'madera',
      'coin': 'moneda'
    };
    
    const inventoryItemName = itemNameMap[mission.itemId] || mission.itemId;
    console.log(`🔄 Mapeo de item: ${mission.itemId} -> ${inventoryItemName}`);
    
    // Variable para almacenar la cantidad total encontrada
    let totalQuantity = 0;
    
    // ===============================
    // BUSCAR EN TODOS LOS ALMACENAMIENTOS
    // ===============================
    
    // 1. Buscar en INVENTARIO PRINCIPAL (this.STATE.slots)
    console.log(`🔍 Buscando en inventario principal (slots)...`);
    if (this.STATE && this.STATE.slots && Array.isArray(this.STATE.slots)) {
      for (let i = 0; i < this.STATE.slots.length; i++) {
        const slot = this.STATE.slots[i];
        if (!slot || !slot.id) continue;
        
        const slotItemId = String(slot.id).toLowerCase().trim();
        const targetItemId = inventoryItemName.toLowerCase().trim();
        
        // Comparación flexible (incluye, comienza con, etc.)
        if (slotItemId === targetItemId || 
            slotItemId.includes(targetItemId) || 
            targetItemId.includes(slotItemId) ||
            slotItemId === `${targetItemId}_buena`) {
          
          const quantity = parseInt(slot.count || slot.quantity || 0);
          totalQuantity += quantity;
          console.log(`  ✅ Slot ${i}: "${slotItemId}" x${quantity} -> Total: ${totalQuantity}`);
        }
      }
    } else {
      console.warn('⚠️ this.STATE.slots no disponible');
    }
    
    // 2. Buscar en COFRE (this.STATE.quickSlots)
    console.log(`🔍 Buscando en cofre (quickSlots)...`);
    if (this.STATE && this.STATE.quickSlots && Array.isArray(this.STATE.quickSlots)) {
      for (let i = 0; i < this.STATE.quickSlots.length; i++) {
        const slot = this.STATE.quickSlots[i];
        if (!slot || !slot.id) continue;
        
        const slotItemId = String(slot.id).toLowerCase().trim();
        const targetItemId = inventoryItemName.toLowerCase().trim();
        
        // Comparación flexible
        if (slotItemId === targetItemId || 
            slotItemId.includes(targetItemId) || 
            targetItemId.includes(slotItemId) ||
            slotItemId === `${targetItemId}_buena`) {
          
          const quantity = parseInt(slot.count || slot.quantity || slot.amount || 0);
          totalQuantity += quantity;
          console.log(`  ✅ Cofre slot ${i}: "${slotItemId}" x${quantity} -> Total: ${totalQuantity}`);
        }
      }
    } else {
      console.warn('⚠️ this.STATE.quickSlots no disponible');
    }
    
    // 3. Buscar en OTROS ALMACENAMIENTOS (si existen)
    if (this.STATE && this.STATE.chestSlots && Array.isArray(this.STATE.chestSlots)) {
      console.log(`🔍 Buscando en chestSlots...`);
      for (let i = 0; i < this.STATE.chestSlots.length; i++) {
        const slot = this.STATE.chestSlots[i];
        if (!slot || !slot.id) continue;
        
        const slotItemId = String(slot.id).toLowerCase().trim();
        const targetItemId = inventoryItemName.toLowerCase().trim();
        
        if (slotItemId === targetItemId || 
            slotItemId.includes(targetItemId) || 
            targetItemId.includes(slotItemId)) {
          
          const quantity = parseInt(slot.count || slot.quantity || 0);
          totalQuantity += quantity;
          console.log(`  ✅ Chest slot ${i}: "${slotItemId}" x${quantity} -> Total: ${totalQuantity}`);
        }
      }
    }
    
    // 4. Buscar en INVENTARIO DEL PERSONAJE (si existe)
    if (this.player && this.player.inventory && Array.isArray(this.player.inventory)) {
      console.log(`🔍 Buscando en inventario del personaje...`);
      for (const item of this.player.inventory) {
        if (!item || !item.id) continue;
        
        const slotItemId = String(item.id).toLowerCase().trim();
        const targetItemId = inventoryItemName.toLowerCase().trim();
        
        if (slotItemId === targetItemId || 
            slotItemId.includes(targetItemId) || 
            targetItemId.includes(slotItemId)) {
          
          const quantity = parseInt(item.quantity || item.count || 0);
          totalQuantity += quantity;
          console.log(`  ✅ Inventario item: "${slotItemId}" x${quantity} -> Total: ${totalQuantity}`);
        }
      }
    }
    
    const hasRequiredAmount = totalQuantity >= mission.requiredAmount;
    
    console.log(`📊 Verificación final: ${totalQuantity} / ${mission.requiredAmount} ${inventoryItemName} -> ${hasRequiredAmount ? '✅ CUMPLE' : '❌ NO CUMPLE'}`);
    
    return hasRequiredAmount;
    
  } catch (error) {
    console.error('❌ Error verificando requisitos:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Método auxiliar para normalizar datos del inventario
// Método auxiliar para normalizar datos del inventario - VERSIÓN CORREGIDA
normalizeInventoryData(items) {
  if (!Array.isArray(items)) {
    console.warn('⚠️ normalizeInventoryData: items no es un array', items);
    return [];
  }
  
  console.log('📦 Procesando items:', {
    total: items.length,
    primeros3: items.slice(0, 3)
  });
  
  const normalized = [];
  
  items.forEach((item, index) => {
    try {
      if (!item) {
        console.warn(`⚠️ Item ${index} es null/undefined`);
        return;
      }
      
      // DEBUG: Mostrar estructura completa del item
      console.log(`📝 Item ${index}:`, JSON.stringify(item));
      
      // CORRECCIÓN: Buscar el ID del item en múltiples posibles propiedades
      let itemId = null;
      let cantidad = 0;
      
      // 1. Intentar obtener de la propiedad 'objeto'
      if (item.objeto) {
        itemId = item.objeto;
      }
      // 2. Intentar obtener de la propiedad 'id' (formato alternativo)
      else if (item.id) {
        itemId = item.id;
      }
      // 3. Intentar obtener de la propiedad 'name' o 'itemName'
      else if (item.name) {
        itemId = item.name;
      }
      else if (item.itemName) {
        itemId = item.itemName;
      }
      // 4. Si es una cadena directa
      else if (typeof item === 'string') {
        itemId = item;
      }
      
      // CORRECCIÓN: Buscar cantidad en múltiples propiedades
      if (item.cantidad !== undefined && item.cantidad !== null) {
        cantidad = parseInt(item.cantidad) || 0;
      }
      else if (item.quantity !== undefined && item.quantity !== null) {
        cantidad = parseInt(item.quantity) || 0;
      }
      else if (item.count !== undefined && item.count !== null) {
        cantidad = parseInt(item.count) || 0;
      }
      else if (item.amount !== undefined && item.amount !== null) {
        cantidad = parseInt(item.amount) || 0;
      }
      
      // Solo agregar si tenemos un ID válido
      if (itemId && itemId !== '' && itemId !== 'null' && itemId !== 'undefined') {
        normalized.push({
          id: String(itemId).trim().toLowerCase(),
          cantidad: cantidad,
          objeto: itemId, // Mantener original para debug
          tipo: item.tipo || 'unknown',
          raw: item // Guardar datos crudos para debug
        });
        
        console.log(`✅ Item normalizado: ${itemId} x${cantidad}`);
      } else {
        console.warn(`❌ Item ${index} sin ID válido:`, item);
      }
      
    } catch (error) {
      console.error(`❌ Error procesando item ${index}:`, error, item);
    }
  });
  
  console.log(`📊 Resultado normalización: ${normalized.length} items válidos de ${items.length} total`);
  
  // Mostrar items normalizados para debug
  if (normalized.length > 0) {
    console.log('📋 Items normalizados:');
    normalized.forEach((item, idx) => {
      console.log(`  ${idx}: ${item.id} x${item.cantidad} (tipo: ${item.tipo})`);
    });
  }
  
  return normalized;
}

// Método para completar una misión - VERSIÓN CORREGIDA CON INVENTARIO LOCAL
// Método para completar una misión - VERSIÓN FINAL
// Método para completar una misión - VERSIÓN FINAL CORREGIDA
async completeMission(missionId) {
  try {
    console.log(`🎉 INICIANDO COMPLETADO DE MISIÓN: ${missionId}`);
    console.log('==============================================');
    
    // 1. Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ ERROR: No autenticado');
      this.showNotification('You are not signed in. Please sign in again.', 'error');
      return null;
    }
    
    // 2. Verificar datos de misiones
    if (!this.dailyMissionsData || !this.dailyMissionsData.missions) {
      console.error('❌ ERROR: No hay datos de misiones cargados');
      this.showNotification('Error loading mission data', 'error');
      return null;
    }
    
    // 3. Buscar la misión
    const mission = this.dailyMissionsData.missions.find(m => m.missionId === missionId);
    if (!mission) {
      console.error(`❌ ERROR: Misión ${missionId} no encontrada`);
      this.showNotification('Mission not found', 'error');
      return null;
    }
    
    console.log(`📝 PROCESANDO MISIÓN: ${mission.missionId}`);
    console.log(`- Item: ${mission.itemId}`);
    console.log(`- Cantidad requerida: ${mission.requiredAmount}`);
    console.log(`- NPC: ${this.currentNpcMission}`);
    
    // 4. Verificar requisitos del inventario
    console.log('\n🔍 VERIFICANDO REQUISITOS...');
    const hasRequirements = await this.checkMissionRequirements(missionId);
    
    if (!hasRequirements) {
      console.error('❌ ERROR: No cumple con los requisitos');
      
      // Mostrar mensaje amigable según idioma
      const itemDisplayNames = {
        'zanahoria': 'zanahorias', 'carrot': 'zanahorias',
        'tomate': 'tomates', 'tomato': 'tomates',
        'trigo': 'trigo', 'wheat': 'trigo',
        'calabaza': 'calabazas', 'pumpkin': 'calabazas',
        'piedra': 'piedras', 'stone': 'piedras',
        'cobre': 'cobre', 'copper': 'cobre',
        'hierro': 'hierro', 'iron': 'hierro',
        'carbon': 'carbón', 'coal': 'carbón',
        'madera': 'madera', 'wood': 'madera',
        'moneda': 'monedas', 'coin': 'monedas'
      };
      
      const displayName = itemDisplayNames[mission.itemId] || mission.itemId;
      const message = this.lenguaje === 3 ? 
        `Necesitas ${mission.requiredAmount} ${displayName} para completar esta misión` :
        `You need ${mission.requiredAmount} ${displayName} to complete this mission`;
      
      this.showNotification(message, 'error');
      return null;
    }
    
    console.log('✅ REQUISITOS CUMPLIDOS');
    
    // 5. Mapear nombre del item para eliminar (USANDO EL MISMO MAPEO QUE checkMissionRequirements)
    const itemMapForRemoval = {
      'zanahoria': 'zanahoria_buena', 'carrot': 'zanahoria_buena',
      'tomate': 'tomate_buena', 'tomato': 'tomate_buena',
      'trigo': 'trigo_buena', 'wheat': 'trigo_buena',
      'calabaza': 'calabaza_buena', 'pumpkin': 'calabaza_buena',
      'piedra': 'mineral_piedra', 'stone': 'mineral_piedra',
      'cobre': 'mineral_cobre', 'copper': 'mineral_cobre',
      'hierro': 'mineral_hierro', 'iron': 'mineral_hierro',
      'carbon': 'carbon', 'coal': 'carbon',
      'madera': 'madera', 'wood': 'madera',
      'moneda': 'moneda', 'coin': 'moneda'
    };
    
    const inventoryItemName = itemMapForRemoval[mission.itemId] || mission.itemId;
    
    // 6. Eliminar items del inventario LOCAL usando removeItemSmart
    console.log(`\n🗑️ ELIMINANDO ITEMS LOCALMENTE CON removeItemSmart...`);
    console.log(`- Item: ${inventoryItemName}`);
    console.log(`- Cantidad: ${mission.requiredAmount}`);
    
    // Asegurarse de que removeItemSmart existe y funciona
    if (typeof this.removeItemSmart !== 'function') {
      console.error('❌ ERROR: removeItemSmart no es una función');
      this.showNotification('Internal game error', 'error');
      return null;
    }
    
    const removed = this.removeItemSmart(inventoryItemName, mission.requiredAmount);
    
    if (!removed) {
      console.error(`❌ ERROR: removeItemSmart devolvió false`);
      this.showNotification(`Error removing items from your inventory`, 'error');
      return null;
    }
    
    console.log('✅ ITEMS ELIMINADOS LOCALMENTE CON ÉXITO');
    
    // 7. GUARDAR ESTADO ACTUALIZADO EN EL SERVIDOR (IMPORTANTE)
    console.log('\n💾 GUARDANDO ESTADO ACTUALIZADO EN SERVIDOR...');
    try {
      await this.savegg(); // Esto debería sincronizar el inventario con el servidor
      console.log('✅ Estado guardado en servidor');
    } catch (saveError) {
      console.error('❌ Error al guardar estado:', saveError);
      // Continuar de todos modos, pero mostrar advertencia
      this.showNotification('Advertencia: Estado no guardado completamente', 'warning');
    }
    
    // 8. Enviar petición al servidor para completar misión
    console.log('\n📤 ENVIANDO PETICIÓN PARA COMPLETAR MISIÓN...');
    
    if (!this.csrfToken) {
      await this.getCSRFToken();
      if (!this.csrfToken) {
        console.error('❌ ERROR: No se pudo obtener token CSRF');
        this.showNotification('Security error. Please try again.', 'error');
        return null;
      }
    }
    
    const today = new Date().toISOString().split('T')[0];
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': window.getCsrfToken(this.csrfToken)
    };
    
    const requestBody = {
      npcId: this.currentNpcMission,
      missionId: missionId,
      day: today,
      playerName: this.playerName
    };
    
    console.log('📄 Datos enviados al servidor:', requestBody);
    
    // Usar fetchWithTokenRetry para manejar errores de token
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/missions/daily/complete`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });

    console.log('📊 Respuesta del servidor:', res ? res.status : 'Sin respuesta');
    
    if (!res || !res.ok) {
      const errorText = await res?.text().catch(() => 'No se pudo leer el error') || 'Sin respuesta del servidor';
      console.error('❌ ERROR del servidor:', {
        status: res?.status,
        error: errorText
      });
      
      // Parsear error si es JSON
      let errorMessage = 'Error desconocido del servidor';
      try {
        const errorObj = JSON.parse(errorText);
        errorMessage = errorObj.error || errorObj.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      // Si es error de autenticación
      if (res?.status === 401 || res?.status === 403) {
        this.showTokenErrorHub();
        return null;
      }
      
      // Si es error 400 de "no tienes items", significa que el servidor no vio los items eliminados
      if (res?.status === 400 && errorMessage.includes('No tienes los items')) {
        console.error('⚠️ El servidor no detectó los items eliminados');
        console.error('⚠️ Posible problema de sincronización');
        
        // Mostrar error específico
        this.showNotification(errorMessage, 'error');
        
        // Intentar recargar datos del jugador para sincronizar
        await this.loadPlayerData();
        return null;
      }
      
      throw new Error(`Error completando misión: ${res?.status || 'No status'} - ${errorMessage}`);
    }

    const result = await res.json();
    console.log('✅ RESPUESTA DEL SERVIDOR:', result);
    
    // 9. Procesar respuesta exitosa
    this.handleMissionCompletionSuccess(result, missionId);
    
    return result;
    
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en completeMission:', error);
    console.error('Stack trace:', error.stack);
    
    const errorMessage = this.lenguaje === 3 ? 
      'Error al completar la misión. Intenta nuevamente.' :
      'Error completing mission. Please try again.';
    
    this.showNotification(errorMessage, 'error');
    return null;
  }
}

// Método auxiliar para actualizar datos del jugador después de misión
async updatePlayerDataAfterMission(missionId) {
  try {
    console.log('🔄 Actualizando datos del jugador después de misión...');
    
    // Obtener datos actualizados del jugador
    const playerData = await this.getPlayerDataForMissions();
    
    if (playerData) {
      // Actualizar monedas locales
      if (playerData.moneda !== undefined) {
        this.moneda = playerData.moneda;
        console.log(`💰 Monedas actualizadas: ${this.moneda}`);
      }
      
      // Actualizar experiencia
      if (playerData.nivel_exp !== undefined) {
        this.nivel_exp = playerData.nivel_exp;
        console.log(`📈 Experiencia actualizada: ${this.nivel_exp}`);
      }
      
      // Actualizar nivel
      if (playerData.nivel !== undefined) {
        this.nivel = playerData.nivel;
        console.log(`⬆️ Nivel actualizado: ${this.nivel}`);
      }
      
      // Guardar estado actualizado
      this.savegg().then(() => {
        console.log('💾 Estado guardado después de misión');
      }).catch(err => {
        console.error('❌ Error guardando después de misión:', err);
      });
    }
  } catch (error) {
    console.error('❌ Error actualizando datos después de misión:', error);
  }
}


// Método auxiliar para manejar el éxito de completar misión
handleMissionCompletionSuccess(result, missionId) {
  console.log(`✅ Misión ${missionId} completada exitosamente`);
  
  // Actualizar estadísticas locales
  if (result.rewards && result.rewards.exp) {
    this.nivel_exp += result.rewards.exp;
    console.log(`📈 Experiencia ganada: +${result.rewards.exp} EXP`);
  }
  
  // Actualizar monedas si hay recompensa de monedas
  if (result.rewards && result.rewards.item && result.rewards.item.id === 'moneda') {
    this.moneda += result.rewards.item.amount || 0;
    console.log(`💰 Monedas ganadas: +${result.rewards.item.amount}`);
  }
  
  // Mostrar notificación de éxito
  let notificationText = '';
  
  if (this.lenguaje === 3) { // español
    notificationText = `¡Misión completada! +${result.rewards.exp} EXP`;
    if (result.rewards.item) {
      notificationText += ` y ${result.rewards.item.amount} ${this.getItemName(result.rewards.item.id, 'es-419')}`;
    }
  } else { // inglés por defecto
    notificationText = `Mission completed! +${result.rewards.exp} EXP`;
    if (result.rewards.item) {
      notificationText += ` and ${result.rewards.item.amount} ${this.getItemName(result.rewards.item.id, 'en-US')}`;
    }
  }
  
  this.showNotification(notificationText, 'success');
  
  // Actualizar datos de misiones locales
  if (this.dailyMissionsData && this.dailyMissionsData.userProgress) {
    this.dailyMissionsData.userProgress.completedCount = result.completedCount || 0;
    
    // Añadir esta misión a las completadas
    if (!this.dailyMissionsData.userProgress.completedMissions) {
      this.dailyMissionsData.userProgress.completedMissions = [];
    }
    
    this.dailyMissionsData.userProgress.completedMissions.push({
      missionId: missionId,
      completedAt: new Date().toISOString(),
      claimedReward: true
    });
  }
  
  console.log(`📊 Total de misiones completadas hoy: ${result.completedCount || 0}`);
  
  // Actualizar panel de misiones si existe
  if (this.missionsPanel && !this.missionsPanel.destroyed) {
    // Aquí podrías actualizar el panel visualmente
    // Por ejemplo: this.missionsPanel.updateMissionStatus(missionId, true);
    console.log('🔄 Actualizando panel de misiones...');
  }
  
  // Guardar el estado actualizado del jugador
  this.savegg().then(() => {
    console.log('💾 Estado guardado después de completar misión');
  }).catch(err => {
    console.error('❌ Error guardando después de misión:', err);
  });
}

// Método auxiliar para obtener nombre de item según idioma
getItemName(itemId, language) {
  // Este es un mapeo básico, deberías tener tu propio sistema de traducción
  const itemNames = {
    'moneda': {
      'en-US': 'coins',
      'es-419': 'monedas'
    },
    'regadera': {
      'en-US': 'watering can',
      'es-419': 'regadera'
    },
    'hacha': {
      'en-US': 'axe',
      'es-419': 'hacha'
    },
    'semilla_especial': {
      'en-US': 'special seeds',
      'es-419': 'semillas especiales'
    }
  };
  
  const item = itemNames[itemId];
  if (item && item[language]) {
    return item[language];
  }
  
  return itemId; // Devolver el ID si no hay traducción
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





    // NUEVO: Sistema de auto-refresh CORREGIDO
    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        
        // Verificar si está habilitado el auto-refresh
        if (!this.autoRefreshEnabled || !this.isAuthenticated) {
            console.log('🔄 Auto-refresh deshabilitado o usuario no autenticado');
            return;
        }
        
        console.log('🔄 Iniciando sistema de auto-refresh corregido...');
        
        // Refrescar cada 4.5 minutos (270,000 ms) para prevenir expiración
        this.autoRefreshInterval = setInterval(async () => {
            try {
                // Verificar que el usuario aún esté autenticado
                if (!this.isAuthenticated || !this.playerName) {
                    console.log('🔄 Usuario no autenticado, deteniendo auto-refresh');
                    this.stopAutoRefresh();
                    return;
                }
                
                // Verificar tiempo desde el último refresco
                const now = Date.now();
                const timeSinceLastRefresh = now - this.lastRefreshTime;
                
                // Solo refrescar si ha pasado más de 1 minuto desde el último refresh
                if (timeSinceLastRefresh < 60000) {
                    console.log(`🔄 Esperando, refrescado hace ${Math.floor(timeSinceLastRefresh/1000)} segundos`);
                    return;
                }
                
                console.log('🔄 Ejecutando auto-refresh programado...');
                
                // Verificar actividad del usuario antes de refrescar
                const inactiveTime = now - this.lastActivityTime;
                if (inactiveTime < 30 * 60 * 1000) { // Solo si el usuario estuvo activo en los últimos 30 minutos
                    const success = await this.refreshAuthToken();
                    
                    if (success) {
                        console.log('✅ Auto-refresh exitoso');
                        this.lastRefreshTime = now;
                        this.currentRefreshAttempts = 0;
                    } else {
                        console.warn('⚠️ Auto-refresh falló');
                        this.currentRefreshAttempts++;
                        
                        // Si hay demasiados intentos fallidos, verificar autenticación
                        if (this.currentRefreshAttempts >= this.maxRefreshAttempts) {
                            console.error('❌ Demasiados intentos fallidos de auto-refresh');
                            
                            // Verificar si aún estamos autenticados
                            const authStatus = await this.checkAuthStatus();
                            if (!authStatus) {
                                console.log('🔐 Autenticación perdida, mostrando error');
                                this.showTokenErrorHub();
                            }
                            this.currentRefreshAttempts = 0; // Resetear después de verificar
                        }
                    }
                } else {
                    console.log('⏰ Usuario inactivo, omitiendo auto-refresh');
                }
            } catch (error) {
                console.error('❌ Error en auto-refresh:', error);
            }
        }, 270000); // 4.5 minutos (antes de que expire el token de 5 minutos)
        
        console.log('✅ Sistema de auto-refresh iniciado (cada 4.5 minutos)');
    }
    
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('🛑 Auto-refresh detenido');
        }
    }
    
    // NUEVO: Método para refrescar token de autenticación CORREGIDO
    async refreshAuthToken() {
        // Evitar múltiples refrescos simultáneos
        if (this.refreshInProgress) {
            console.log('🔄 Refresh ya en progreso, omitiendo...');
            return false;
        }
        
        this.refreshInProgress = true;
        this.currentRefreshAttempts++;
        
        try {
            console.log('🔄 Refrescando token de autenticación...');
            
            const response = await fetch(`${this.serverBase}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log(`📊 Respuesta de refresh: ${response.status}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Refresh exitoso');
                
                // Actualizar token CSRF si viene en la respuesta
                if (data.csrfToken) {
                    this.csrfToken = data.csrfToken;
            window.csrfToken = data.csrfToken; // Compartir con StatsSync
                    console.log('✅ Token CSRF actualizado');
                }
                
                // Actualizar tiempo de última actividad
                this.lastActivityTime = Date.now();
                
                this.refreshInProgress = false;
                this.currentRefreshAttempts = 0;
                return true;
            } else {
                const errorText = await response.text();
                console.warn('⚠️ Falló el refresh del token:', response.status);
                
                // Intentar obtener nuevo token CSRF si es error 403
                if (response.status === 403) {
                    await this.getCSRFToken();
                }
                
                this.refreshInProgress = false;
                return false;
            }
        } catch (error) {
            console.error('❌ Error al refrescar token:', error);
            this.refreshInProgress = false;
            return false;
        }
    }
    
    // NUEVO: Wrapper para fetch con manejo de errores de token CORREGIDO
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
        
        // Añadir token CSRF. La condición miraba this.csrfToken, así que si la
        // copia guardada estaba vacía no se mandaba cabecera aunque la cookie
        // sí existiera. Ahora decide el valor VIVO.
        {
            const _csrf = window.getCsrfToken(this.csrfToken);
            if (_csrf && !fetchOptions.headers['X-CSRF-Token']) {
                fetchOptions.headers['X-CSRF-Token'] = _csrf;
            }
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

                // 403 de CONTROL DE ACCESO (baneado / fuera de whitelist): el
                // backend ahora lo aplica en cada petición, así que si a alguien
                // lo banean mientras juega —o entra directo con la sesión
                // guardada— hay que sacarlo del juego aquí.
                if (response.status === 403) {
                    let body = {};
                    try { body = await response.clone().json(); } catch (e) {}
                    if (body.error === 'banned' || body.error === 'not_whitelisted') {
                        this._handleAccessDenied(body);
                        return response;
                    }
                }

                // Si es error 401 (no autorizado), intentar refresh
                if (response.status === 401) {
                    console.log(`🔐 Error 401 detectado, intentando refresh...`);
                    
                    // Intentar obtener el cuerpo del error para mejor diagnóstico
                    let errorBody = {};
                    try {
                        errorBody = await response.json();
                        console.log('📄 Error body:', errorBody);
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
                            fetchOptions.headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
                            retries++;
                            
                            // Esperar antes de reintentar
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                            continue; // Reintentar la petición
                        } else {
                            console.error('❌ No se pudo refrescar el token');
                            
                            // Si el refresh falló, verificar si debemos mostrar error
                            if (this.currentRefreshAttempts >= this.maxRefreshAttempts) {
                                this.showTokenErrorHub();
                            }
                            break; // Salir del loop
                        }
                    } else {
                        // No es error de token o ya se intentó demasiadas veces
                        console.error(`❌ Error ${response.status} no manejable por refresh`);
                        
                        // Si es error 401 pero no es de token, mostrar error
                        if (response.status === 401) {
                            this.showTokenErrorHub();
                        }
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
                            fetchOptions.headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
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

    async loadx() {
        console.log('🔍 Iniciando verificación de autenticación...');
        
        try {
            // Primero obtener token CSRF
            await this.getCSRFToken();
            
            // Usar fetchWithTokenRetry para manejar errores de token
            const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/auth/me`, {
                method: 'GET'
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
                
                // Actualizar tiempo de última actividad
                this.lastActivityTime = Date.now();
                
                // Iniciar auto-refresh ahora que estamos autenticados
                this.startAutoRefresh();
                
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
  

  preload() {



      this.game.renderer.autoPipeline = true;
      this.game.renderer.config.pipeline = 'Mobile';
    
      this.scene.stop('tiendajuego');
      this.scene.remove('tiendajuego');
      this.scene.add('tiendajuego', tiendajuego, false);

        this.maxTextureSize = 0;

        if (this.sys.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
          const gl = this.sys.game.renderer.gl;
          this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        } else {
          // Si es Canvas, usa un valor seguro
          this.maxTextureSize = 2048;
        }

        console.log('📱🖥️ Tamaño máximo de textura soportado:', this.maxTextureSize);

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


    
    this.ii = 0;

    // FIX: mismo bug que en LoadingScenegame.js — "elipeticiones" se fijaba
    // a 0 y se comprobaba "=== 0" en el mismo bloque, así que esta rama
    // SIEMPRE era la que se ejecutaba, también en producción. Esto no solo
    // rompía auth/me: serverclient1 también alimenta el socket multijugador
    // (io(SERVER,...)) y los enlaces de market/hub, así que todo eso también
    // intentaba conectar a 127.0.0.1:3001 en el juego real.
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
    this.definirhorax = 0 ;

    // limpiando tiles

    
    if (this.textures.exists('tiles')) {
      this.textures.remove('tiles');
      this.textures.remove('tiles2');
    }



    // Cargar recursos
    const img = new Image();
    img.src = "./Game/Source/cursor.png";
    img.onload = () => {
      console.log(`Cursor loaded: ${img.width}x${img.height}`);
      // Apply cursor once image is confirmed loaded
      if (this.input && this.input.setDefaultCursor) {
        this.input.setDefaultCursor(`url("./Game/Source/cursor.png") 8 8, pointer`);
      }
      document.body.style.cursor = `url("./Game/Source/cursor.png") 8 8, pointer`;
    };
    img.onerror = () => console.warn('cursor.png failed to load');
    
    this.load.image('tiles', './Game/MAPAS/tiles.png');
    
    //this.load.image('mapa_img', './Game/MAPAS/mapa_principal.png');

    this.load.tilemapTiledJSON('tilemap', './Maps/mapa_principal.json');

    // casa


    
    if (this.textures.exists('casa_tienda_png')) {
      this.textures.remove('casa_tienda_png');
      console.log('Teeeeeeeeeeextura casa_tienda_png eliminada antes de recargarla.');
    }

      this.load.image('casa_tienda_png', './Game/Objetos/casa de tienda mejorada.png');
    
    
    this.load.image('casa_herreria_png', './Game/Objetos/casa de herreria arreglada.png');
    this.load.image('casa_posiones_png', './Game/Objetos/casa dos pisos.png');
    this.load.image('casa_npc2_png', './Game/Objetos/casa de npc arreglado.png');
    this.load.image('casa_npc1_png', './Game/Objetos/casa de npc arreglado.png');
    this.load.image('casa_npc3_png', './Game/Objetos/casa L arreglado.png');

    this.load.image('casa_comida_png', './Game/Objetos/casa de 2 pisos arreglado.png');
    this.load.image('casa_comida2_png', './Game/Objetos/casa de 2 pisos arreglado.png');

    this.load.image('postas_png', './Game/Objetos/poste.png');
    this.load.image('postas_encendido_png', './Game/Objetos/poste.png');
  

    

    // base del portal

    
    this.load.image('estatua_gato_png', './Game/Objetos/estatua de gato.png');
    
    this.load.image('pilar_portal1_png', './Game/Objetos/pilar 1.png');
    this.load.image('pilar_portal2_png', './Game/Objetos/pilar 2.png');
    this.load.image('pilar_portal3_png', './Game/Objetos/pilar 3.png');




    // arbol

    this.load.image('arbol_png', './Game/Objetos/arbol seco terminado.png');

    // pinos

    this.load.image('pinos_png', './Game/Objetos/pinos.png');

    // arbusto
    

    this.load.image('arbusto_png', './Game/Objetos/arbusto.png');

    
    this.load.image('arbusto_formado_png', './Game/Objetos/arbusto formado.png');
    this.load.image('arbusto_formado2_png', './Game/Objetos/arbusto formado 2.png');
    
    this.load.image('arbusto_formado3_png', './Game/Objetos/arbol pequeño.png');
    this.load.image('arbusto_formado4_png', './Game/Objetos/arbol pequeño flor amarilla.png');
    
    this.load.image('arbusto_formado5_png', './Game/Objetos/arbusto de flores.png');
    this.load.image('arbusto_formado6_png', './Game/Objetos/arbusto de flores blancas.png');
    
    this.load.image('flor_formado1_png', './Game/Objetos/flor amarillo y blanco.png');
    this.load.image('flor_formado2_png', './Game/Objetos/flor azul.png');
    this.load.image('flor_formado3_png', './Game/Objetos/flor blanca.png');
    this.load.image('flor_formado4_png', './Game/Objetos/flor naranja.png');




    //cristal
    
    this.load.image('cristal_png', './Game/Objetos/crystlas.png');
    this.load.image('cristal2_png', './Game/Objetos/crystlas.png');
    this.load.image('cristal3_png', './Game/Objetos/crystlas.png');
    this.load.image('cristal4_png', './Game/Objetos/crystlas.png');
    this.load.image('cbarril_png', './Game/Objetos/barril.png');
    this.load.image('carteleraxd', './Game/Objetos/Cartel_notificacion.png');

    // escaleras

    this.load.image('escalera_png', './Game/Objetos/escalera.png');

    // mass
    this.load.image('molino_png', './Game/Objetos/molino.png');
    this.load.image('casa_molino_png', './Game/Objetos/casa de granja cabaña.png');
    this.load.image('piedras_1png', './Game/Objetos/piedra_1.png');
    this.load.image('piedras_2png', './Game/Objetos/piedra_2.png');
    this.load.image('piedras_3png', './Game/Objetos/piedra_3.png');
    this.load.image('piedras_4png', './Game/Objetos/piedra_4.png');
    this.load.image('piedras_5png', './Game/Objetos/piedra_5.png');
    this.load.image('piedras_6png', './Game/Objetos/piedra_6.png');
    this.load.image('arbustos_png', './Game/Objetos/arbusto solo.png');
    this.load.image('tronco_acostado_png', './Game/Objetos/tronco acostado.png');
    this.load.image('tronco_acostado_1png', './Game/Objetos/tronco_1.png');
    this.load.image('tronco_acostado_2png', './Game/Objetos/tronco_2.png');
    // troncos que aparecen mientras el árbol está en respawn
    this.load.image('tronco_arbusto_png', './Game/Objetos/tronco arbusto solo.png');
    this.load.image('tronco_pinos_png', './Game/Objetos/tronco pinos.png');
    this.load.image('tronco_arbol_seco_png', './Game/Objetos/tronco arbol seco terminado.png');
    this.load.image('pozo_png', './Game/Objetos/pozo.png');

    this.load.image('carbon_png', './Game/Objetos/carbon.png');
    this.load.image('horno_apagado_png', './Game/Objetos/horno apagado.png');
    this.load.image('bote_de_basura_png', './Game/Objetos/bote_de_basura.png');










    
    

    /*
    this.load.image('tiles', './Game/MAPAS/tileset_maprind.png');
    this.load.image('tiles1', './Game/MAPAS/Tileset_Road.png');
    this.load.image('tiles2', './Game/Objetos/arbolx1.png');
    this.load.image('tiles3', './Game/Objetos/casa222.png');
    this.load.image('tilep6', './Game/Objetos/casa1.png');
    this.load.image('tilep7', './Game/Objetos/casa2.png');
    this.load.tilemapTiledJSON('tilemap', './Maps/mapaxd.json');
    */

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

    


    // gallo 

    
    this.load.image('gallo_1', './Game/Sprites/Chiken/1.png');
    this.load.image('gallo_2', './Game/Sprites/Chiken/2.png');
    this.load.image('gallo_3', './Game/Sprites/Chiken/3.png');
    this.load.image('gallo_4', './Game/Sprites/Chiken/4.png');
    this.load.image('gallo_5', './Game/Sprites/Chiken/5.png');

    //perro

    
    this.load.image('perro_derecha_1', './Game/Sprites/mascota/derecha/run_1.png');
    this.load.image('perro_derecha_2', './Game/Sprites/mascota/derecha/run_2.png');
    this.load.image('perro_derecha_3', './Game/Sprites/mascota/derecha/run_3.png');
    this.load.image('perro_derecha_4', './Game/Sprites/mascota/derecha/run_4.png');

    this.load.image('perro_izquierda_1', './Game/Sprites/mascota/izquierda/run_1.png');
    this.load.image('perro_izquierda_2', './Game/Sprites/mascota/izquierda/run_2.png');
    this.load.image('perro_izquierda_3', './Game/Sprites/mascota/izquierda/run_3.png');
    this.load.image('perro_izquierda_4', './Game/Sprites/mascota/izquierda/run_4.png');


    // puerta de mina

    this.load.image('puerta_mina_png', './Game/Objetos/puerta_mina.png');


    // Recurso

    this.load.image('cosecha_1', './Game/Source/futro1.png');
    this.load.image('regadoraImagen', './Game/Source/recurso2.png');
    this.load.image('tijerasImagen', './Game/Source/tijeras.png');
    this.load.image('instrumento-pesca', './Game/Source/pesca-instrumento.png');


    // cofre de inventario extra

    this.load.image('cofreImagen', './Game/Source/cofre.png');

    //this.load.image('arbol', './Game/Objetos/arbolx.png');
    //this.load.image('arbol1', './Game/Objetos/arbolx1.png');

    // moneda

    this.load.image('monedaimg', './Game/Source/moneda.png');


    // mochila con letra I y con triangulo


    // siembra tierra seca

    this.load.image('tierra_seca', './Game/Objetos/tierra_seca.png');
    this.load.image('tierra_mojada', './Game/Objetos/tierra_mojada.png');

    // interacciones de siembra con planta 1

    
    this.load.image('tierra_seca_plant', './Game/Objetos/Plantas/planta_zanahorias/1.png');
    this.load.image('tierra_mojada_plant', './Game/Objetos/Plantas/planta_zanahorias/2.png');
    this.load.image('tierra_mojada_plant2', './Game/Objetos/Plantas/planta_zanahorias/3.png');
    this.load.image('tierra_mojada_plant3', './Game/Objetos/Plantas/planta_zanahorias/4.png');
    this.load.image('tierra_muerta_plant4', './Game/Objetos/Plantas/planta_zanahorias/5.png');

        
    this.load.image('tierra_seca_plant_tomate', './Game/Objetos/Plantas/planta_tomates/1.png');
    this.load.image('tierra_mojada_plant_tomate', './Game/Objetos/Plantas/planta_tomates/2.png');
    this.load.image('tierra_mojada_plant2_tomate', './Game/Objetos/Plantas/planta_tomates/3.png');
    this.load.image('tierra_mojada_plant3_tomate', './Game/Objetos/Plantas/planta_tomates/4.png');
    this.load.image('tierra_muerta_plant4_tomate', './Game/Objetos/Plantas/planta_tomates/5.png');

    this.load.image('tierra_seca_plant_trigo', './Game/Objetos/Plantas/planta_trigo/1.png');
    this.load.image('tierra_mojada_plant_trigo', './Game/Objetos/Plantas/planta_trigo/2.png');
    this.load.image('tierra_mojada_plant2_trigo', './Game/Objetos/Plantas/planta_trigo/3.png');
    this.load.image('tierra_mojada_plant3_trigo', './Game/Objetos/Plantas/planta_trigo/4.png');
    this.load.image('tierra_muerta_plant4_trigo', './Game/Objetos/Plantas/planta_trigo/5.png');


    this.load.image('tierra_seca_plant_calabaza', './Game/Objetos/Plantas/planta_calabaza/1.png');
    this.load.image('tierra_mojada_plant_calabaza', './Game/Objetos/Plantas/planta_calabaza/2.png');
    this.load.image('tierra_mojada_plant2_calabaza', './Game/Objetos/Plantas/planta_calabaza/3.png');
    this.load.image('tierra_mojada_plant3_calabaza', './Game/Objetos/Plantas/planta_calabaza/4.png');
    this.load.image('tierra_muerta_plant4_calabaza', './Game/Objetos/Plantas/planta_calabaza/5.png');



    // npc

    this.load.image('NPCgranjero', './Game/Objetos/NPC/NPCgranjero.png');
    this.load.image('NPCherrero', './Game/Objetos/NPC/NPCherrero.png');
    
    this.load.image('NPCmago', './Game/Objetos/NPC/NPCmago.png');
    this.load.image('NPCjoyero', './Game/Objetos/NPC/NPCjoyero.png');
    this.load.image('NPCguardian', './Game/Objetos/NPC/NPCguardian.png');


    
    this.load.image('minar_piedra', './Game/Objetos/roca_piedra.png');
    this.load.image('minar_cobre', './Game/Objetos/roca_cobre.png');
    this.load.image('minar_hierro', './Game/Objetos/roca_hierro.png');






    

    

    this.load.image('water_drop', './Game/Source/item_pozo2.png');




    // musica 

    this.load.audio('main-theme', './Game/MUSIC/Principal.ogg');
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
    this.load.audio('cortando_sound', './Game/MUSIC/arbol_golpe.wav');
    this.load.audio('cortado_sound', './Game/MUSIC/arbol_cortado.wav');
      







    this.player = this.physics.add.sprite(100, 100, 'playerTexture');
    this.player.setVisible(false);
    this.casillas = [];       // Inventario
    this.casillasExtra = [];  // Cofre
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




    // registro de mirada 

    this.registro_mirada_personaje = "derecha";


  }






  cleanupTileManagers() {
  console.log('🧹 INICIANDO LIMPIEZA DE TILEMANAGERS...');
  
  if (!this._tileManagers || !Array.isArray(this._tileManagers)) {
    console.log('ℹ️ No hay TileManagers para limpiar');
    return { total: 0, cleaned: 0 };
  }

  let totalCleaned = 0;
  let texturesRemoved = 0;
  let spritesDestroyed = 0;

  this._tileManagers.forEach((tileManager, index) => {
    try {
      console.log(`🔄 Limpiando TileManager ${index + 1}/${this._tileManagers.length}`);
      
      const result = tileManager.destroy();
      if (result) {
        texturesRemoved += result.texturesRemoved || 0;
        spritesDestroyed += result.spritesDestroyed || 0;
      }
      
      totalCleaned++;
    } catch (error) {
      console.error(`❌ Error limpiando TileManager ${index}:`, error);
    }
  });

  this._tileManagers = [];

  console.log(`✅ Limpieza completada: ${totalCleaned} TileManagers, ${texturesRemoved} texturas, ${spritesDestroyed} sprites`);
  
  return { total: totalCleaned, texturesRemoved, spritesDestroyed };
}

/**
 * SHUTDOWN MEJORADO PARA GAMESCENE
 */
shutdown() {
  console.log('🔄 APAGANDO GAMESCENE - LIMPIEZA COMPLETA');
  
  // 1. LIMPIAR TILEMANAGERS PRIMERO (esto libera ~144MB)
  const tileCleanup = this.cleanupTileManagers();
  
  // 2. Limpiar texturas pesadas específicas
  const heavyTextures = [
    'tile_r0_c0', 'tile_r0_c1', 'tile_r0_c2',
    'tile_r1_c0', 'tile_r1_c1', 'tile_r1_c2', 
    'tile_r2_c0', 'tile_r2_c1', 'tile_r2_c2'
  ];
  
  heavyTextures.forEach(textureKey => {
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
      console.log(`🗑️ Textura pesada eliminada: ${textureKey}`);
    }
  });

  // 3. Limpiar socket
  if (this.socket) {
    this.socket.disconnect();
    this.socket = null;
    console.log('🔌 Socket desconectado');
  }

  // 4. Limpiar objetos del juego
  this.objetos?.forEach(obj => {
    if (obj.imagen && typeof obj.imagen.destroy === 'function') {
      obj.imagen.destroy();
    }
  });
  this.objetos = [];
  
  // 5. Limpiar temporizadores y listeners
  this.time.removeAllEvents();
  this.scale.off('resize', this._onResize);
  this.input.keyboard?.removeAllListeners();
  
  console.log(`✅ GameScene completamente limpiada - Memoria liberada: ${tileCleanup.texturesRemoved} texturas pesadas`);

}


  async create() {
    // ── Candados de la puerta de la tienda ───────────────────────────────────
    // Phaser REUTILIZA la instancia de la escena, así que estos dos hay que
    // reiniciarlos a mano en cada entrada:
    //   _cambiandoEscena queda en true tras la transición anterior; si no se
    //   limpia, la puerta no volvería a funcionar nunca.
    //   _puertaArmada arranca en false a propósito: apareces encima de la
    //   puerta al volver de la tienda y no debe dispararse hasta que te apartes.
    this._cambiandoEscena = false;
    this._puertaArmada    = false;

    // Re-apply custom cursor once the scene is fully created (some browsers reset it)
    this.time.delayedCall(400, () => {
      if (this.input && this.input.setDefaultCursor) {
        this.input.setDefaultCursor('url("./Game/Source/cursor.png") 8 8, pointer');
      }
    });
    this.time.delayedCall(1200, () => {
      if (this.input && this.input.setDefaultCursor) {
        this.input.setDefaultCursor('url("./Game/Source/cursor.png") 8 8, pointer');
      }
    });

    // ── Aplicar stats del contrato INMEDIATAMENTE al inicio ──────────────────
    // window.playerStats fue sincronizado por LoadingScenegame antes de llegar aquí.
    // Lo aplicamos antes de todo para que cualquier cola de guardado use valores correctos.
    if (window.playerStats) {
      if (typeof window.playerStats.oro    === 'number') this.moneda           = window.playerStats.oro;
      if (typeof window.playerStats.plata  === 'number') this.moneda_plata     = window.playerStats.plata;
      if (typeof window.playerStats.vida   === 'number') this.vidaPorcentaje   = window.playerStats.vida;
      if (typeof window.playerStats.agua   === 'number') this.aguaPorcentaje   = window.playerStats.agua;
      if (typeof window.playerStats.comida === 'number') this.comidaPorcentaje = window.playerStats.comida;
      console.log('💎 Stats aplicados al inicio de create():', {
        moneda: this.moneda, moneda_plata: this.moneda_plata,
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
    
    // Variables para almacenar el tamaño previo
        
    this.currentWidth = parseInt(localStorage.getItem('screenWidth'));
    this.currentHeight = parseInt(localStorage.getItem('screenHeight'));

    
    if (this.loadMissionsData) await this.loadMissionsData();


    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;
    
    this.textures.get('tiles').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Cargar el tilemap y el conjunto de tiles
    this.map = this.make.tilemap({ key: 'tilemap' });
    //const tileset = this.map.addTilesetImage('Tileset_mapa', 'tiles', 16, 16);
    //this.backgroundLayer = this.map.createLayer('mapa_principal', tileset, 0, 0);


    
    /*
    // 1. Crear el render texture y dibujar sobre él
    const rt = this.add.renderTexture(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    rt.draw(this.backgroundLayer);

    // 2. Esperar a que todo se dibuje antes de exportar
    this.time.delayedCall(100, () => {
      // 3. Usar snapshot directamente del renderTexture
      rt.snapshot((image) => {
        // 4. Crear un enlace para descargar
        const a = document.createElement('a');
        a.href = image.src; // image es un HTMLImageElement
        a.download = 'mapa_exportado.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });

    */
    
    

    


    // Después de crear el mapa y capas
    /*
    this.nightOverlay = this.add.rectangle(0, 0, this.game.config.width, this.game.config.height, 0x000033, 0.5);
    this.nightOverlay.setOrigin(0);
    this.nightOverlay.setScrollFactor(0);
    this.nightOverlay.setDepth(11);

    */
    // 1) Enciende el sistema de luces con tu color ambiental
    // 0) Activa luces antes de todo

        // 1) Crea tu overlay oscuro (depth 11)
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    /*

    this.tempo = 0.0;
    this.tempoTimer = 0;

    if (this.nightOverlay) {
      this.nightOverlay.clearMask();   // Elimina la máscara
      this.nightOverlay.destroy();     // Destruye el overlay oscuro
      this.nightOverlay = null;
    }

    if (this.lightImage) {
      this.lightImage.destroy();       // Destruye la imagen usada como máscara
      this.lightImage = null;
    }

    if (this.textures.exists('lights-canvas')) {
      this.textures.remove('lights-canvas');  // Elimina la textura canvas de Phaser
    }


    // 1) Overlay oscuro fijo en pantalla (depth 11)
    this.nightOverlay = this.add.rectangle(0, 0, 5008, 5008, 0x000033, this.tempo)
      .setOrigin(0)
      .setDepth(11);

    // 2) Creamos el canvas-textura que guardará TODOS los degradados
    const canvasTex = this.textures.createCanvas('lights-canvas', this.map.widthInPixels, this.map.heightInPixels);
    const ctx       = canvasTex.context;

    // 3) Imagen (invisible) que usaremos para la máscara
    this.lightImage = this.add.image(0, 0, 'lights-canvas')
      .setOrigin(0)
      .setDepth(12)
      .setVisible(false);    // no la vemos, sólo sirve como fuente de máscara

    // 4) Creamos y aplicamos la máscara invertida
    const mask = this.lightImage.createBitmapMask();
    mask.invertAlpha = true;
    this.nightOverlay.setMask(mask);

    */

    /*

    // 5) Dibujamos varios focos suaves
    this.addSoftLight(1350, 913, 250, 1.0);
    this.addSoftLight(1470, 913, 250, 1.0);

    this.addSoftLight(2639, 661, 250, 1.0);
    this.addSoftLight(2747, 661, 250, 1.0);
    
    this.addSoftLight(2917, 661, 250, 1.0);
    this.addSoftLight(3028, 661, 250, 1.0);
    
    this.addSoftLight(1904, 1458, 250, 1.0);
    this.addSoftLight(2023, 1458, 250, 1.0);
    
    this.addSoftLight(2166, 1458, 250, 1.0);
    this.addSoftLight(2282, 1458, 250, 1.0);

    this.addSoftLight(1158, 1938, 250, 1.0);
    this.addSoftLight(1282, 1938, 250, 1.0);

    this.addSoftLight(1158, 2172, 250, 1.0);
    this.addSoftLight(1282, 2172, 250, 1.0);
    
    this.addSoftLight(1914, 2678, 250, 1.0);
    this.addSoftLight(2032, 2678, 250, 1.0);
    
    this.addSoftLight(2161, 2678, 250, 1.0);
    this.addSoftLight(2283, 2678, 250, 1.0);

    this.addSoftLight(1907, 3233, 250, 1.0);
    this.addSoftLight(2025, 3233, 250, 1.0);

    this.addSoftLight(2163, 3233, 250, 1.0);
    this.addSoftLight(2282, 3233, 250, 1.0);

    this.addSoftLight(2780, 3477, 250, 1.0);
    this.addSoftLight(2899, 3477, 250, 1.0);
    
    this.addSoftLight(1358, 3475, 250, 1.0);
    this.addSoftLight(1477, 3475, 250, 1.0);
    
    this.addSoftLight(2918, 2093, 250, 1.0);
    this.addSoftLight(3039, 2093, 250, 1.0);

    // ------------------------------------

    this.addSoftLight(1961, 1725, 500, 1.0);
    this.addSoftLight(2226, 1725, 500, 1.0);

    this.addSoftLight(1970, 2895, 500, 1.0);
    this.addSoftLight(2218, 2895, 500, 1.0);

    this.addSoftLight(1966, 3435, 500, 1.0);
    this.addSoftLight(2222, 3435, 500, 1.0);
    
    this.addSoftLight(1417, 3673, 500, 1.0);
    this.addSoftLight(2835, 3673, 500, 1.0);

    */

    /*

    
    this.addSoftLight(2835, 3673, 1000, 1.0);
    this.addSoftLight(2223, 3374, 1000, 1.0);
    this.addSoftLight(1967, 3376, 1000, 1.0);
    this.addSoftLight(1416, 3620, 1000, 1.0);
    this.addSoftLight(1970, 2833, 1000, 1.0);
    this.addSoftLight(2218, 2833, 1000, 1.0);
    this.addSoftLight(2974, 2236, 1000, 1.0);
    this.addSoftLight(1223, 2324, 1000, 1.0);
    this.addSoftLight(1220, 2092, 1000, 1.0);
    this.addSoftLight(1965, 1621, 1000, 1.0);
    this.addSoftLight(2229, 1618, 1000, 1.0);
    this.addSoftLight(1415, 1064, 1000, 1.0);
    this.addSoftLight(2688, 815, 1000, 1.0);
    this.addSoftLight(2972, 815, 1000, 1.0);

    */




    // Configurar los límites del mundo
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    











    // METER DENTRO DE LAS FUNCIONES IMPORTANTE
          // Opcional: dibuja los rectángulos de colisión (en verde semitransparente) para depuración.
      /*
      let debugGraphics = this.add.graphics();
      debugGraphics.fillStyle(0x00ff00, 0.3);
      debugGraphics.fillRectShape(rect);
      */

    

    // Obtén la capa de objetos llamada "colisioncasa1"
    const objectLayerf = this.map.getObjectLayer('area_colision_general');
    this.collisionRectangles = [];

    // Recorre cada objeto de la capa y lo convierte en un rectángulo para colisión.
    objectLayerf.objects.forEach(obj => {
      let rect = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
      this.collisionRectangles.push(rect);


    });

    

    const objectLayerf1 = this.map.getObjectLayer('area_entrada_tienda');
    this.collisionRectangles1 = [];

    // Recorre cada objeto de la capa y lo convierte en un rectángulo para colisión.
    objectLayerf1.objects.forEach(obj => {
      let rect1 = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
      this.collisionRectangles1.push(rect1);

    });






    const objectLayerf2 = this.map.getObjectLayer('area_entrada_batalla');
    this.collisionRectangles2 = [];

    // Recorre cada objeto de la capa y lo convierte en un rectángulo para colisión.
    objectLayerf2.objects.forEach(obj => {
      let rect2 = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
      this.collisionRectangles2.push(rect2);

    });



    

    this.graphics = this.add.graphics();
    // Dibujar un rectángulo solo con borde, sin fondo
    this.graphics.lineStyle(1, 0xff0000);


    
      

    // Crear el personaje (Inicialmente con la imagen de correr hacia abajo)
    this.player = this.physics.add.sprite(this.posicionplayerx, this.posicionplayery, 'player_right_1');
    this.player.setScale(2);
    this.player.setCollideWorldBounds(true); // Evita que el jugador salga del mundo

    // dando z-index personaje
    this.player.setDepth(3);



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
        // Consumir el ítem seleccionado al hacer clic en el personaje. El propio
        // método decide si es consumible (comida/agua); si no lo es, no hace nada.
        // Descuenta el ítem con TRANSACCIÓN on-chain y persiste el buff vía statsSync.
        this._consumeItemOnPlayer(selectedId);
    }
});





  /////////////////////////// PINTANDO CASA, OBJETOS Y ARBOLES ////////////////////////



    //mapa img





/*
    
    const imageMappingxxx = {
      mapa_principalx: {
        spriteKey: 'mapa_img',
        targetProp: 'sprite_mapa_img'          
      }
      
    };

    this.createImagesFromObjectLayer(this, this.map, 'mapa_principal_img', imageMappingxxx);

    this.sprite_mapa_img.setDepth(0);

*/




  // Configuración para el TileManager
  const imageMappingxxx1 = {
    mapa_principalx: {
      carpeta: 'recortadas',
      json: 'recortadas/mapa.json',
      targetProp: 'tileManagerMapa'
    }
  };

  // Crear el TileManager usando la función mejorada
  this.createImagesFromObjectLayer1(this, this.map, 'mapa_principal_img', imageMappingxxx1);

  // Configurar después de carga
  this.time.delayedCall(500, () => {
    if (this.tileManagerMapa) {
      console.log(`TileManager listo: ${this.tileManagerMapa.visibleCount()} tiles visibles`);
      
      // Actualizar tiles visibles con la cámara
      this.tileManagerMapa.updateVisible(this.cameras.main);
      
      // Actualizar cuando la cámara se mueva
      this.cameras.main.on('cameramove', (camera) => {
        this.tileManagerMapa.updateVisible(camera);
      });
    }
  });

    
    


    // tienda

    const imageMapping = {
      casa_tienda1: {
        spriteKey: 'casa_tienda_png',
        targetProp: 'sprite_jj'          
      }
    };

    this.createImagesFromObjectLayer(this, this.map, 'casa_tienda', imageMapping, -48);

    
    // herreria

    const imageMapping1 = {
      casa_de_herreria: {
        spriteKey: 'casa_herreria_png', 
        targetProp: 'sprite_h'          
      }
    };

    this.createImagesFromObjectLayer(this, this.map, 'casa_herreria', imageMapping1, -148);

    // posiones

    
    const imageMapping2 = {
      casa_dos_pisos1: {
        spriteKey: 'casa_posiones_png', 
        targetProp: 'sprite_p'          
      }
    };

    this.createImagesFromObjectLayer(this, this.map, 'casa_posiones', imageMapping2, -40);

    // portal
    
    const imageMappingportal = {
      fuente_estatua: {
        spriteKey: 'estatua_gato_png', 
        targetProp: 'sprite_base_portal'          
      },
    };


    this.createImagesFromObjectLayer(this, this.map, 'Portal', imageMappingportal);
    


    // casa Npc

    
const imageMapping3 = {
  casa_npc1: {
    spriteKey: 'casa_npc1_png',
    targetProp: 'sprite_casa_npc1xc',
  },
  casa_npc2: {
    spriteKey: 'casa_npc2_png',
    targetProp: 'sprite_casa_npc2xc',
  },
  casa_L: {
    spriteKey: 'casa_npc3_png',
    targetProp: 'sprite_casa_npc3xc',
  }
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'casa_npc', imageMapping3, -40);



    // casa Npc

    
const imagexMapping1 = {
  molino_1: {
    spriteKey: 'molino_png',
    targetProp: 'sprite_molino',
  }
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'molino', imagexMapping1, -48);

    
const imagexMapping2 = {
  casa_de_granja_cabaña_1: {
    spriteKey: 'casa_molino_png',
    targetProp: 'sprite_cabaña',
  }
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'cabaña', imagexMapping2, -48);


// formado 1  =    arbusto_formado_png
// formado 2 =     arbusto_formado2_png


const imagexMappingx = {
  arbusto_formadox1: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect1',
  },
  arbusto_formadox2: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect2',
  },
  arbusto_formadox3: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect3',
  },
  arbusto_formadox4: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect4',
  },
    arbusto_formadox5: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect5',
  },
    arbusto_formadox6: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect6',
  },
    arbusto_formadox7: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect7',
  },
    arbusto_formadox8: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect8',
  },
    arbusto_formadox9: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect9',
  },
    arbusto_formadox10: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect10',
  },
    arbusto_formadox11: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect11',
  },
    arbusto_formadox12: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect12',
  },
    arbusto_formadox13: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect13',
  },
    arbusto_formadox14: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect14',
  },
    arbusto_formadox15: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect15',
  },
    arbusto_formadox16: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect16',
  },
  arbusto_formadox17: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect17',
  },
  arbusto_formadox18: {
    spriteKey: 'arbusto_formado2_png',
    targetProp: 'sprite_arbusto_ect18',
  },
  arbusto_formado1: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect1x',
  },
    arbusto_formado2: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect2x',
  },
    arbusto_formado3: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect3x',
  },
    arbusto_formado4: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect4x',
  },
    arbusto_formado5: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect5x',
  },
    arbusto_formado6: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect6x',
  },
    arbusto_formado7: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect7x',
  },
    arbusto_formado8: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect8x',
  },
    arbusto_formado9: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect9x',
  },
    arbusto_formado10: {
    spriteKey: 'arbusto_formado_png',
    targetProp: 'sprite_arbusto_ect10x',
  },
    arbol_pequeño1: {
    spriteKey: 'arbusto_formado3_png',
    targetProp: 'sprite_arbolformado_ect1',
  },
    arbol_pequeño2: {
    spriteKey: 'arbusto_formado3_png',
    targetProp: 'sprite_arbolformado_ect2',
  },
    arbol_pequeño3: {
    spriteKey: 'arbusto_formado3_png',
    targetProp: 'sprite_arbolformado_ect3',
  },
    arbol_pequeño4: {
    spriteKey: 'arbusto_formado3_png',
    targetProp: 'sprite_arbolformado_ect4',
  },
    arbol_pequeño_flor1: {
    spriteKey: 'arbusto_formado4_png',
    targetProp: 'sprite_arbolformado_ectx1',
  },
    arbol_pequeño_flor2: {
    spriteKey: 'arbusto_formado4_png',
    targetProp: 'sprite_arbolformado_ectx2',
  },
    arbol_pequeño_flor3: {
    spriteKey: 'arbusto_formado4_png',
    targetProp: 'sprite_arbolformado_ectx3',
  },
    arbol_pequeño_flor4: {
    spriteKey: 'arbusto_formado4_png',
    targetProp: 'sprite_arbolformado_ectx4',
  },
    arbusto_flores_rosa_1: {
    spriteKey: 'arbusto_formado5_png',
    targetProp: 'sprite_arbolformado5_ect1',
  },
    arbusto_flores_rosa_2: {
    spriteKey: 'arbusto_formado5_png',
    targetProp: 'sprite_arbolformado5_ect2',
  },
    arbusto_flores_rosa_3: {
    spriteKey: 'arbusto_formado5_png',
    targetProp: 'sprite_arbolformado5_ect3',
  },
    arbusto_flores_rosa_4: {
    spriteKey: 'arbusto_formado5_png',
    targetProp: 'sprite_arbolformado5_ect4',
  },
    arbusto_flores_rosa_5: {
    spriteKey: 'arbusto_formado5_png',
    targetProp: 'sprite_arbolformado5_ect5',
  },
    arbusto_flores_rosa_6: {
    spriteKey: 'arbusto_formado5_png',
    targetProp: 'sprite_arbolformado5_ect6',
  },
    arbusto_flores_blanca1: {
    spriteKey: 'arbusto_formado6_png',
    targetProp: 'sprite_arbolformado6_ect1',
  },
    arbusto_flores_blanca2: {
    spriteKey: 'arbusto_formado6_png',
    targetProp: 'sprite_arbolformado6_ect2',
  },
    arbusto_flores_blanca3: {
    spriteKey: 'arbusto_formado6_png',
    targetProp: 'sprite_arbolformado6_ect3',
  },
    arbusto_flores_blanca4: {
    spriteKey: 'arbusto_formado6_png',
    targetProp: 'sprite_arbolformado6_ect4',
  },
    arbusto_flores_blanca5: {
    spriteKey: 'arbusto_formado6_png',
    targetProp: 'sprite_arbolformado6_ect5',
  },
    flor_amarillo_blanco1: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect1',
  },
    flor_amarillo_blanco2: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect2',
  },
    flor_amarillo_blanco3: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect3',
  },
    flor_amarillo_blanco4: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect4',
  },
    flor_amarillo_blanco5: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect5',
  },
    flor_amarillo_blanco6: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect6',
  },
    flor_amarillo_blanco7: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect7',
  },
    flor_amarillo_blanco8: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect8',
  },
    flor_amarillo_blanco9: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect9',
  },
    flor_amarillo_blanco10: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect10',
  },
    flor_amarillo_blanco11: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect11',
  },
    flor_amarillo_blanco12: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect12',
  },
    flor_amarillo_blanco13: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect13',
  },
    flor_amarillo_blanco14: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect14',
  },
    flor_amarillo_blanco15: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect15',
  },
    flor_amarillo_blanco16: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect16',
  },
    flor_amarillo_blanco17: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect17',
  },
    flor_amarillo_blanco18: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect18',
  },
    flor_amarillo_blanco19: {
    spriteKey: 'flor_formado1_png',
    targetProp: 'sprite_flor_formado1_ect19',
  },
    flor_azul1: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect1',
  },
    flor_azul2: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect2',
  },
    flor_azul3: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect3',
  },
    flor_azul4: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect4',
  },
    flor_azul5: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect5',
  },
    flor_azul6: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect6',
  },
    flor_azul7: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect7',
  },
    flor_azul8: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect8',
  },
    flor_azul9: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect9',
  },
    flor_azul10: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect10',
  },
    flor_azul11: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect11',
  },
    flor_azul12: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect12',
  },
    flor_azul13: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect13',
  },
    flor_azul14: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect14',
  },
    flor_azul15: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect15',
  },
    flor_azul16: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect16',
  },
    flor_azul17: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect17',
  },
    flor_azul18: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect18',
  },
    flor_azul19: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect19',
  },
    flor_azul20: {
    spriteKey: 'flor_formado2_png',
    targetProp: 'sprite_flor_formado2_ect20',
  },
    flor_blanca1: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect1',
  },
    flor_blanca2: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect2',
  },
    flor_blanca3: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect3',
  },
    flor_blanca4: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect4',
  },
    flor_blanca5: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect5',
  },
    flor_blanca6: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect6',
  },
    flor_blanca7: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect7',
  },
    flor_blanca8: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect8',
  },
    flor_blanca9: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect9',
  },
    flor_blanca10: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect10',
  },
    flor_blanca11: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect11',
  },
    flor_blanca12: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect12',
  },
    flor_blanca13: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect13',
  },
    flor_blanca14: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect14',
  },
    flor_blanca15: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect15',
  },
    flor_blanca16: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect16',
  },
    flor_blanca17: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect17',
  },
    flor_blanca18: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect18',
  },
    flor_blanca19: {
    spriteKey: 'flor_formado3_png',
    targetProp: 'sprite_flor_formado3_ect19',
  },
    flor_naranja1: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect1',
  },
    flor_naranja2: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect2',
  },
    flor_naranja3: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect3',
  },
    flor_naranja4: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect4',
  },
    flor_naranja5: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect5',
  },
    flor_naranja6: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect6',
  },
    flor_naranja7: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect7',
  },
    flor_naranja8: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect8',
  },
    flor_naranja9: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect9',
  },
    flor_naranja10: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect10',
  },
    flor_naranja11: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect11',
  },
    flor_naranja12: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect12',
  },
    flor_naranja13: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect13',
  },
    flor_naranja14: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect14',
  },
    flor_naranja15: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect15',
  },
    flor_naranja16: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect16',
  },
    flor_naranja17: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect17',
  },
    flor_naranja18: {
    spriteKey: 'flor_formado4_png',
    targetProp: 'sprite_flor_formado4_ect18',
  },
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'centro_ect', imagexMappingx);

    /*
    this.load.image('flor_formado4_png', './Game/Objetos/flor naranja.png');

    */



const imagexMapping3 = {
  arbusto1: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_1',
  },
    arbusto2: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_2',
  },
    arbusto3: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_3',
  },
    arbusto4: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_4',
  },
    arbusto5: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_5',
  },
    arbusto6: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_6',
  },
    arbusto7: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_7',
  },
    arbusto8: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_8',
  },
    arbusto9: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_9',
  },
    arbusto10: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_10',
  },
    arbusto11: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_11',
  },
    arbusto12: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_12',
  },
    arbusto13: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_13',
  },
    arbusto14: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_14',
  },
    arbusto15: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_15',
  },
    arbusto16: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_16',
  },
    arbusto17: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_17',
  },
    arbusto18: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_18',
  },
    arbusto19: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_19',
  },
    arbusto20: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_20',
  },
    arbusto21: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_21',
  },
    arbusto22: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_22',
  },
    arbusto23: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_23',
  },
    arbusto24: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_24',
  },
    arbusto25: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_25',
  },
    arbusto26: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_26',
  },
    arbusto27: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_27',
  },
  arbusto28: {
    spriteKey: 'arbustos_png',
    targetProp: 'sprite_arbustos_28',
  },
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'arbusto', imagexMapping3);


const imagexMapping4 = {
  tronco_a1: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_1png',
  },
  tronco_a2: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_2png',
  },
  tronco_a3: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_3png',
  },
  tronco_a4: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_4png',
  },
  tronco_a5: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_5png',
  },
  tronco_a6: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_6png',
  },
  tronco_a7: {
    spriteKey: 'tronco_acostado_1png',
    targetProp: 'sprite_tronco_acostado_7png',
  },
  tronco_b1: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_1png',
  },
  tronco_b2: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_2png',
  },
  tronco_b3: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_3png',
  },
  tronco_b4: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_4png',
  },
  tronco_b5: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_5png',
  },
  tronco_b6: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_6png',
  },
  tronco_b7: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_7png',
  },
  tronco_b8: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_8png',
  },
  tronco_b9: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_9png',
  },
  tronco_b10: {
    spriteKey: 'tronco_acostado_2png',
    targetProp: 'sprite_tronco_acostado_10png',
  },
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'tronco', imagexMapping4);



const imagexMapping5 = {
  piedra_a1: {
    spriteKey: 'piedras_1png',
    targetProp: 'sprite_piedras_1',
  },
  piedra_a2: {
    spriteKey: 'piedras_1png',
    targetProp: 'sprite_piedras_2',
  },
  piedra_a3: {
    spriteKey: 'piedras_1png',
    targetProp: 'sprite_piedras_3',
  },
  piedra_a4: {
    spriteKey: 'piedras_1png',
    targetProp: 'sprite_piedras_4',
  },
  piedra_a5: {
    spriteKey: 'piedras_1png',
    targetProp: 'sprite_piedras_5',
  },
  piedra_a6: {
    spriteKey: 'piedras_1png',
    targetProp: 'sprite_piedras_6',
  },
  piedra_b1: {
    spriteKey: 'piedras_2png',
    targetProp: 'sprite_piedras_7',
  },
  piedra_b2: {
    spriteKey: 'piedras_2png',
    targetProp: 'sprite_piedras_8',
  },
  piedra_b3: {
    spriteKey: 'piedras_2png',
    targetProp: 'sprite_piedras_9',
  },
  piedra_b4: {
    spriteKey: 'piedras_2png',
    targetProp: 'sprite_piedras_10',
  },
  piedra_b5: {
    spriteKey: 'piedras_2png',
    targetProp: 'sprite_piedras_11',
  },
  piedra_b6: {
    spriteKey: 'piedras_2png',
    targetProp: 'sprite_piedras_12',
  },
  piedra_c1: {
    spriteKey: 'piedras_3png',
    targetProp: 'sprite_piedras_13',
  },
  piedra_c2: {
    spriteKey: 'piedras_3png',
    targetProp: 'sprite_piedras_14',
  },
  piedra_c3: {
    spriteKey: 'piedras_3png',
    targetProp: 'sprite_piedras_15',
  },
  piedra_c4: {
    spriteKey: 'piedras_3png',
    targetProp: 'sprite_piedras_16',
  },
  piedra_c5: {
    spriteKey: 'piedras_3png',
    targetProp: 'sprite_piedras_17',
  },
  piedra_c6: {
    spriteKey: 'piedras_3png',
    targetProp: 'sprite_piedras_18',
  },
  piedra_d1: {
    spriteKey: 'piedras_4png',
    targetProp: 'sprite_piedras_19',
  },
  piedra_e1: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_20',
  },
  piedra_e2: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_21',
  },
  piedra_e3: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_22',
  },
  piedra_e4: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_23',
  },
  piedra_e5: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_24',
  },
  piedra_e6: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_25',
  },
  piedra_e7: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_26',
  },
  piedra_e8: {
    spriteKey: 'piedras_5png',
    targetProp: 'sprite_piedras_27',
  },
  piedra_f1: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_28',
  },
  piedra_f2: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_29',
  },
  piedra_f3: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_30',
  },
  piedra_f4: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_31',
  },
  piedra_f5: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_32',
  },
  piedra_f6: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_33',
  },
  piedra_f7: {
    spriteKey: 'piedras_6png',
    targetProp: 'sprite_piedras_34',
  },
};

// En tu escena:
this.createImagesFromObjectLayer(this, this.map, 'piedras', imagexMapping5);



/*
    this.load.image('piedras_1png', './Game/Objetos/piedra_1.png');
    this.load.image('piedras_2png', './Game/Objetos/piedra_2.png');
    this.load.image('piedras_3png', './Game/Objetos/piedra_3.png');
    this.load.image('piedras_4png', './Game/Objetos/piedra_4.png');
    this.load.image('piedras_5png', './Game/Objetos/piedra_5.png');
    this.load.image('piedras_6png', './Game/Objetos/piedra_6.png');

*/


    // casa de comida

    
    const imageMapping4 = {
      casa_dos_pisos3: {
        spriteKey: 'casa_comida_png', 
        targetProp: 'sprite_casa_comida'          
      }
    };

    this.createImagesFromObjectLayer(this, this.map, 'casa_comida', imageMapping4, -40);

    const imageMapping4p = {
      casa_dos_pisos2: {
        spriteKey: 'casa_comida2_png', 
        targetProp: 'sprite_casa_comida2'          
      }
    };

    this.createImagesFromObjectLayer(this, this.map, 'casa_comida2', imageMapping4p, -40);


    // postes

        // casa de comida
// Configuración de los postes con sombra activada
const imageMappingpostes = {
  poste1:  { spriteKey: 'postas_png', targetProp: 'post_1'},
  poste2:  { spriteKey: 'postas_png', targetProp: 'post_2'},
  poste3:  { spriteKey: 'postas_png', targetProp: 'post_3'},
  poste4:  { spriteKey: 'postas_png', targetProp: 'post_4'},
  poste5:  { spriteKey: 'postas_png', targetProp: 'post_5'},
  poste6:  { spriteKey: 'postas_png', targetProp: 'post_6'},
  poste7:  { spriteKey: 'postas_png', targetProp: 'post_7'},
  poste8:  { spriteKey: 'postas_png', targetProp: 'post_8'},
  poste9:  { spriteKey: 'postas_png', targetProp: 'post_9'},
  poste10: { spriteKey: 'postas_png', targetProp: 'post_10'},
  poste11: { spriteKey: 'postas_png', targetProp: 'post_11'},
  poste12: { spriteKey: 'postas_png', targetProp: 'post_12'},
  poste13: { spriteKey: 'postas_png', targetProp: 'post_13'},
  poste14: { spriteKey: 'postas_png', targetProp: 'post_14'},
  poste15: { spriteKey: 'postas_png', targetProp: 'post_15'},
  poste16: { spriteKey: 'postas_png', targetProp: 'post_16'},
  poste17: { spriteKey: 'postas_png', targetProp: 'post_17'},
  poste18: { spriteKey: 'postas_png', targetProp: 'post_18'},
  poste19: { spriteKey: 'postas_png', targetProp: 'post_19'},
  poste20: { spriteKey: 'postas_png', targetProp: 'post_20'},
};

// Llamada para crear los postes con sombra desde la capa 'Lamparas'
this.createImagesFromObjectLayer(this, this.map, 'Lamparas', imageMappingpostes, 10);


    // arboles

    
    
    const imageMapping5 = {
      arbol_seco1: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx1',
      },
      arbol_seco2: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx2',          
      },
      arbol_seco3: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx3',          
      },
      arbol_seco4: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx4',          
      },
      arbol_seco5: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx5',          
      },
      arbol_seco6: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx6',          
      },
      arbol_seco7: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx7',          
      },
      arbol_seco8: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx8',          
      },
      arbol_seco9: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx9',          
      },
      arbol_seco10: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx10',          
      },
      arbol_seco11: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx11',          
      },
      arbol_seco12: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx12',          
      },
      arbol_seco13: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx13',          
      },
      arbol_seco14: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx14',          
      },
      arbol_seco15: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx15',          
      },
      arbol_seco16: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx16',          
      },
      arbol_seco17: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx17',          
      },
      arbol_seco18: {
        spriteKey: 'arbol_png', 
        targetProp: 'sprite_arbolx18',          
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'arboles', imageMapping5);

    // pinos

    
    const imageMapping1pinos = {
      pino1: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos1',  
      },
        pino2: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos2',  
      },
        pino3: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos3',  
      },
        pino4: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos4',  
      },
        pino5: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos5',  
      },
        pino6: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos6',  
      },
        pino7: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos7',  
      },
        pino8: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos8',  
      },
        pino9: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos9',  
      },
        pino10: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos10',  
      },
        pino11: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos11',  
      },
        pino12: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos12',  
      },
        pino13: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos13',  
      },
        pino14: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos14',  
      },
        pino15: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos15',  
      },
        pino16: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos16',  
      },
        pino17: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos17',  
      },
        pino18: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos18',  
      },
        pino19: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos19',  
      },
        pino20: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos20',  
      },
        pino21: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos21',  
      },
        pino22: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos22',  
      },
        pino23: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos23',  
      },
        pino24: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos24',  
      },
        pino25: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos25',  
      },
        pino26: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos26',  
      },
        pino27: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos27',  
      },
        pino28: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos28',  
      },
        pino29: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos29',  
      },
        pino30: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos30',  
      },
        pino31: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos31',  
      },
        pino32: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos32',  
      },
        pino33: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos33',  
      },
        pino34: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos34',  
      },
        pino35: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos35',  
      },
        pino36: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos36',  
      },
        pino37: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos37',  
      },
        pino38: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos38',  
      },
        pino39: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos39',  
      },
        pino40: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos40',  
      },
        pino41: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos41',  
      },
        pino42: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos42',  
      },
        pino43: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos43',  
      },
        pino44: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos44',  
      },
        pino45: {
        spriteKey: 'pinos_png', 
        targetProp: 'sprite_pinos45',  
      },
    };

    this.createImagesFromObjectLayer(this, this.map, 'Pinos', imageMapping1pinos);


    // objetos

    /*

    
    this.load.image('minar_piedra', './Game/Objetos/roca_piedra.png');
    this.load.image('minar_cobre', './Game/Objetos/roca_cobre.png');
    this.load.image('minar_hierro', './Game/Objetos/roca_hierro.png');

    */

    
    const imageMapping7 = {
      roca_piedra1: {
        spriteKey: 'minar_piedra', 
        targetProp: 'sprite_minar_piedra1',  
      },
      roca_piedra2: {
        spriteKey: 'minar_piedra', 
        targetProp: 'sprite_minar_piedra2',  
      },
      roca_piedra3: {
        spriteKey: 'minar_piedra', 
        targetProp: 'sprite_minar_piedra3',  
      },
      roca_piedra4: {
        spriteKey: 'minar_piedra', 
        targetProp: 'sprite_minar_piedra4',  
      },
      roca_piedra5: {
        spriteKey: 'minar_piedra', 
        targetProp: 'sprite_minar_piedra5',  
      },
      roca_cobre1: {
        spriteKey: 'minar_cobre', 
        targetProp: 'sprite_minar_cobre1',  
      },
      roca_cobre2: {
        spriteKey: 'minar_cobre', 
        targetProp: 'sprite_minar_cobre2',  
      },
      roca_cobre3: {
        spriteKey: 'minar_cobre', 
        targetProp: 'sprite_minar_cobre3',  
      },
      roca_cobre4: {
        spriteKey: 'minar_cobre', 
        targetProp: 'sprite_minar_cobre4',  
      },
      roca_hierro1: {
        spriteKey: 'minar_hierro', 
        targetProp: 'sprite_minar_hierro1',  
      },
      roca_hierro2: {
        spriteKey: 'minar_hierro', 
        targetProp: 'sprite_minar_hierro2',  
      },
      roca_hierro3: {
        spriteKey: 'minar_hierro', 
        targetProp: 'sprite_minar_hierro3',  
      },
      barril1: {
        spriteKey: 'cbarril_png', 
        targetProp: 'sprite_cbarril_png1',  
      },
      barril2: {
        spriteKey: 'cbarril_png', 
        targetProp: 'sprite_cbarril_png2',  
      },
      
      Cartel_notificacion1: {
        spriteKey: 'carteleraxd',
        targetProp: 'sprite_carteleraxd2',
        // El cartel abre la tabla de clasificación de las batallas P2P
        onClick: () => { this.openBattleLeaderboard(); },
      },
      escalera1: {
        spriteKey: 'escalera_png', 
        targetProp: 'sprite_escaleraxd1',  
      },
      escalera2: {
        spriteKey: 'escalera_png', 
        targetProp: 'sprite_escaleraxd2',  
      },      
        pozo1: {
        spriteKey: 'pozo_png', 
        targetProp: 'sprite_pozoxd2',  
      },  
        bote_de_basura1: {
        spriteKey: 'bote_de_basura_png', 
        targetProp: 'bote_de_basura_pngx1',  
      }, 
        bote_de_basura2: {
        spriteKey: 'bote_de_basura_png', 
        targetProp: 'bote_de_basura_pngx2',  
      },
        roca_carbon1: {
        spriteKey: 'carbon_png', 
        targetProp: 'carbon_pngx1',  
      },
        roca_carbon2: {
        spriteKey: 'carbon_png', 
        targetProp: 'carbon_pngx2',  
      },
        horno_mineral1: {
        spriteKey: 'horno_apagado_png',
        targetProp: 'horno_apagado_pngx1',
        onClick: () => { this.openFurnacePanel(); },
      },
        puerta_mina: {
        spriteKey: 'puerta_mina_png',
        targetProp: 'puerta_mina_pngx1',
        onClick: () => { this.openFurnacePanel(); },
      },
    };



    

    this.createImagesFromObjectLayer(this, this.map, 'Objetosxd', imageMapping7);


    

    // personajes npc

    const imageMapppc = {
      NPCgranjerox: {
        spriteKey: 'NPCgranjero',
        targetProp: 'sprite_npc1'          
      },
      NPCherrerox: {
          spriteKey: 'NPCherrero',
          targetProp: 'sprite_npc2'          
      },
      NPCjoyerox: {
          spriteKey: 'NPCjoyero',
          targetProp: 'sprite_npc3'          
      },
      NPCguardianx: {
          spriteKey: 'NPCguardian',
          targetProp: 'sprite_npc4'          
      },
      NPCmagox: {
          spriteKey: 'NPCmago',
          targetProp: 'sprite_npc5'          
      },

    };

    /*
    
    this.load.image('NPCgranjero', './Game/Objetos/NPC/NPCgranjero.png');
    this.load.image('NPCherrero', './Game/Objetos/NPC/NPCherrero.png');
    
    this.load.image('NPCmago', './Game/Objetos/NPC/NPCmago.png');
    this.load.image('NPCjoyero', './Game/Objetos/NPC/NPCjoyero.png');
    this.load.image('NPCguardian', './Game/Objetos/NPC/NPCguardian.png');
    */

    // NPC sprites created with Y-based depth so player Y-sorting works correctly
    this.createImagesFromObjectLayer(this, this.map, 'NPC', imageMapppc, 0);



this.enableAutoCullingForLayer(this, 'piedras');
this.enableAutoCullingForLayer(this, 'Objetosxd');
this.enableAutoCullingForLayer(this, 'Pinos');
this.enableAutoCullingForLayer(this, 'arboles');
this.enableAutoCullingForLayer(this, 'tronco');
this.enableAutoCullingForLayer(this, 'centro_ect');

    ////////////////////////////////////////////////////////////////////////////////////


    // ------------------------------------------------------------------------------


    // nombre de usuario


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
      this.usuariox.setDepth(11);



      // barra de energia

      this.progress = 1;           // Valor actual de la barra (1 = 100%)

      // Define aquí todas las teclas de una vez
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
      
      /*
          
      this.teclasPresionadas = {};

      this.input.keyboard.on('keydown', (event) => {
        this.teclasPresionadas[event.code] = true;
      });

      this.input.keyboard.on('keyup', (event) => {
        this.teclasPresionadas[event.code] = false;
      });
      */


      
    /*
    // Player Idle Left - 8 frames
    this.load.image('player_idle_left_1', './Game/Sprites/personaje/+_izquierda/1.png');
    this.load.image('player_idle_left_2', './Game/Sprites/personaje/+_izquierda/2.png');
    this.load.image('player_idle_left_3', './Game/Sprites/personaje/+_izquierda/3.png');
    this.load.image('player_idle_left_4', './Game/Sprites/personaje/+_izquierda/4.png');
    this.load.image('player_idle_left_5', './Game/Sprites/personaje/+_izquierda/5.png');
    this.load.image('player_idle_left_6', './Game/Sprites/personaje/+_izquierda/6.png');

    // Player Idle Right - 8 frames
    this.load.image('player_idle_right_1', './Game/Sprites/personaje/+_derecha/1.png');
    this.load.image('player_idle_right_2', './Game/Sprites/personaje/+_derecha/2.png');
    this.load.image('player_idle_right_3', './Game/Sprites/personaje/+_derecha/3.png');
    this.load.image('player_idle_right_4', './Game/Sprites/personaje/+_derecha/4.png');
    this.load.image('player_idle_right_5', './Game/Sprites/personaje/+_derecha/5.png');
    this.load.image('player_idle_right_6', './Game/Sprites/personaje/+_derecha/6.png');

    // Player Idle Up - 8 frames
    this.load.image('player_idle_up_1', './Game/Sprites/personaje/+_arriba/1.png');
    this.load.image('player_idle_up_2', './Game/Sprites/personaje/+_arriba/2.png');
    this.load.image('player_idle_up_3', './Game/Sprites/personaje/+_arriba/3.png');
    this.load.image('player_idle_up_4', './Game/Sprites/personaje/+_arriba/4.png');
    this.load.image('player_idle_up_5', './Game/Sprites/personaje/+_arriba/5.png');
    this.load.image('player_idle_up_6', './Game/Sprites/personaje/+_arriba/6.png');

    // Player Idle Down - 8 frames
    this.load.image('player_idle_down_1', './Game/Sprites/personaje/+_abajo/1.png');
    this.load.image('player_idle_down_2', './Game/Sprites/personaje/+_abajo/2.png');
    this.load.image('player_idle_down_3', './Game/Sprites/personaje/+_abajo/3.png');
    this.load.image('player_idle_down_4', './Game/Sprites/personaje/+_abajo/4.png');
    this.load.image('player_idle_down_5', './Game/Sprites/personaje/+_abajo/5.png');
    this.load.image('player_idle_down_6', './Game/Sprites/personaje/+_abajo/6.png');

    // Player Idle Up-Left - 8 frames
    this.load.image('player_idle_up_left_1', './Game/Sprites/personaje/X_superior_izquierda/1.png');
    this.load.image('player_idle_up_left_2', './Game/Sprites/personaje/X_superior_izquierda/2.png');
    this.load.image('player_idle_up_left_3', './Game/Sprites/personaje/X_superior_izquierda/3.png');
    this.load.image('player_idle_up_left_4', './Game/Sprites/personaje/X_superior_izquierda/4.png');
    this.load.image('player_idle_up_left_5', './Game/Sprites/personaje/X_superior_izquierda/5.png');
    this.load.image('player_idle_up_left_6', './Game/Sprites/personaje/X_superior_izquierda/6.png');

    // Player Idle Up-Right - 8 frames
    this.load.image('player_idle_up_right_1', './Game/Sprites/personaje/X_superior_derecha/1.png');
    this.load.image('player_idle_up_right_2', './Game/Sprites/personaje/X_superior_derecha/2.png');
    this.load.image('player_idle_up_right_3', './Game/Sprites/personaje/X_superior_derecha/3.png');
    this.load.image('player_idle_up_right_4', './Game/Sprites/personaje/X_superior_derecha/4.png');
    this.load.image('player_idle_up_right_5', './Game/Sprites/personaje/X_superior_derecha/5.png');
    this.load.image('player_idle_up_right_6', './Game/Sprites/personaje/X_superior_derecha/6.png');

    // Player Idle Down-Left - 8 frames
    this.load.image('player_idle_down_left_1', './Game/Sprites/personaje/X_inferior_izquierda/1.png');
    this.load.image('player_idle_down_left_2', './Game/Sprites/personaje/X_inferior_izquierda/2.png');
    this.load.image('player_idle_down_left_3', './Game/Sprites/personaje/X_inferior_izquierda/3.png');
    this.load.image('player_idle_down_left_4', './Game/Sprites/personaje/X_inferior_izquierda/4.png');
    this.load.image('player_idle_down_left_5', './Game/Sprites/personaje/X_inferior_izquierda/5.png');
    this.load.image('player_idle_down_left_6', './Game/Sprites/personaje/X_inferior_izquierda/6.png');

    // Player Idle Down-Right - 8 frames
    this.load.image('player_idle_down_right_1', './Game/Sprites/personaje/X_inferior_derecha/1.png');
    this.load.image('player_idle_down_right_2', './Game/Sprites/personaje/X_inferior_derecha/2.png');
    this.load.image('player_idle_down_right_3', './Game/Sprites/personaje/X_inferior_derecha/3.png');
    this.load.image('player_idle_down_right_4', './Game/Sprites/personaje/X_inferior_derecha/4.png');
    this.load.image('player_idle_down_right_5', './Game/Sprites/personaje/X_inferior_derecha/5.png');
    this.load.image('player_idle_down_right_6', './Game/Sprites/personaje/X_inferior_derecha/6.png');




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

    




    */


      // Configurar animaciones



      /*
      

      if (!this.anims.exists('right')) {
        this.anims.create({
          key: 'right',
          frames: [
            { key: 'player_idle_right_1' },
            { key: 'player_idle_right_2' },
            { key: 'player_idle_right_3' },
            { key: 'player_idle_right_4' },
            { key: 'player_idle_right_5' },
            { key: 'player_idle_right_6' },
          ],
          frameRate: 9,
          repeat: -1
        });
      }
      
      if (!this.anims.exists('left')) {
        this.anims.create({
          key: 'left',
          frames: [
            { key: 'player_idle_left_1' },
            { key: 'player_idle_left_2' },
            { key: 'player_idle_left_3' },
            { key: 'player_idle_left_4' },
            { key: 'player_idle_left_5' },
            { key: 'player_idle_left_6' },
          ],
          frameRate: 9,
          repeat: -1
        });
      }

      */


      // Después de cargar perro izquierda/derecha

// --- Animaciones del perro ---
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
            { key: 'player_right_7' },
          ],
          frameRate: 9,
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
            { key: 'player_left_7' },
          ],
          frameRate: 9,
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




      if (!this.anims.exists('gallo_run')) {
        this.anims.create({
          key: 'gallo_run',
          frames: [
            { key: 'gallo_1' },
            { key: 'gallo_2' },
            { key: 'gallo_3' },
            { key: 'gallo_4' },
            { key: 'gallo_5' },
            { key: 'gallo_4' },
            { key: 'gallo_5' },
            { key: 'gallo_4' },
            { key: 'gallo_5' },
            { key: 'gallo_3' },
            { key: 'gallo_2' },
            { key: 'gallo_1' },
          ],
          frameRate: 5, // velocidad
          repeat: -1    // -1 para bucle infinito
        });
      }

      /*

      this.sombraGallo = this.add.sprite(1898 + 5, 3371, 'gallo_1')
        .setTint(0x000000)
        .setAlpha(0.5)
        .setScale(1.5, 1.4)       // ← ancho normal (1.1), alto aplastado (0.5) para efecto diagonal
        .setAngle(+17)            // ← inclinación diagonal (rotación en grados)
        .setDepth(0);

      this.sombraGallo.play('gallo_run');

      */


      

    // Crear el sprite en pantalla con posición x, y y tamaño
      this.gallo = this.add.sprite(1930, 3371, 'gallo_1')  // ← posición x=100, y=150
        .setDisplaySize(45, 45).setDepth(0);                        // ← ancho=64, alto=64


      // Iniciar la animación
      this.gallo.play('gallo_run');


      // Pone la pantalla negra desde el principio
      this.cameras.main.fadeOut(0, 0, 0, 0);

      // Configurar cámara
      this.cameras.main.setZoom(2);
      this.cameras.main.zoomTo(1, 2000);
      this.cameras.main.once('camerazoomcomplete', () => {

        // mostrando botones de reputacion y estadisticas y mas
        
        console.log('Zoom terminado después de 3 segundos');

        document.getElementById('game-hud').classList.remove('hud-hidden');
        document.getElementById('game-hud').classList.add('hud-visible');

        // Las monedas se actualizan después de _initStatsSync (más abajo)

        // mostrando casillas

        const slots = document.querySelectorAll('.quick-slot');
        slots.forEach(slot => {
          slot.style.display = 'block'; // o 'flex' si antes usabas flex
        });


        document.getElementById('hub').classList.remove('hidden');
        document.getElementById('quick-slots-bar').classList.remove('hidden');
        document.getElementById('open-chat-btn').classList.remove('hidden');

        // mostrando bota y su contador
        //document.getElementById('quest-button').style.display = 'block';

        // mostrando hora y fecha


        // mostrando hub de vida,agua y comida



        //document.getElementById('hub').classList.remove('hidden');

        this.actualizarImagenJugador('./Game/Sprites/Perfil/Perfil.png');

        console.log("xd",this.currentAccount);


        this.actualizarNombreUsuario(`${this.currentAccount.slice(0, 6)}...${this.currentAccount.slice(-4)}`);

        // ── Cargar stats del contrato justo antes de pintar las barras ──────
        // Se llama aquí (al final del create) para que ningún loadPlayerData
        // anterior pueda sobreescribir los valores ya sincronizados.
        this._initStatsSync();

        // Actualizar monedas con valores del contrato (ya aplicados por _initStatsSync)
        document.getElementById('info-text-left').textContent  = `${this.moneda}`;
        document.getElementById('info-text-right').textContent = `${this.moneda_plata}`;

        this.actualizarBarraVida(this.vidaPorcentaje);
        this.actualizarBarraAgua(this.aguaPorcentaje);
        this.actualizarBarraComida(this.comidaPorcentaje);


        // mochila y letra i




        console.log('game create ejecutándose');


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



















      });
      this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
      this.cameras.main.setRoundPixels(true);
      this.cameras.main.roundPixels = true;

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
            min: 0.5,      // Zoom mínimo: 0.5x
            max: 2,        // Zoom máximo: 2x  
            step: 0.5     // Paso de zoom: 0.25
        };

        // 🎯 VALORES EXACTOS PRE-DEFINIDOS (evita cálculos con decimales)
        // FIX COSTURAS/LÍNEAS ENTRE TILES: solo zooms ENTEROS. Con pixel art, un
        // zoom fraccionario (0.5 / 1.5) hace que el borde de cada tile caiga a
        // medio píxel: el rasterizador redondea distinto en tiles contiguos y
        // aparecen líneas/costuras (y "hormigueo" al moverse). Con 1x y 2x cada
        // píxel de textura mapea a un número entero de píxeles de pantalla.
        // (tiendajuego ya usaba [1.0, 2.0] por lo mismo.)
        // 0.5 y 2.0 son múltiplos/divisores EXACTOS de 1 (cada píxel de textura
        // cae en un número entero de píxeles de pantalla) → no generan costuras.
        // 1.5x SÍ las generaba (borde de tile a medio píxel), por eso no vuelve.
        this.zoomValues = [0.5, 1.0, 2.0];
        this.currentZoomIndex = 2; // 2.0x

        // Aplicar zoom inicial EXACTO
        this.cameras.main.zoom = this.zoomValues[this.currentZoomIndex];
        console.log(`🎮 Zoom forzado a: ${this.cameras.main.zoom}x`);

        // 🎯 VERIFICACIÓN INICIAL
        console.log("=== CONFIGURACIÓN DE ZOOM PRECISO ===");
        console.log(`📊 Zoom configurado: ${this.zoomValues[this.currentZoomIndex]}x`);
        console.log(`📊 Zoom real de cámara: ${this.cameras.main.zoom}x`);
        console.log(`🎯 Valores disponibles: [${this.zoomValues.join(', ')}]`);

        // Zoom con DOS DEDOS (móvil) sobre el mapa.
        this._setupPinchZoom();

        // Guardián del zoom: lo restaura tras cada resize del viewport (teclado
        // del móvil al abrir el chat, giro de pantalla).
        this._setupZoomKeeper();

        // Clic en las monedas del HUD → hub de compra/cambio de moneda.
        this._setupCurrencyHub();

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


      // estado circular de sombra del personaje 

      this.shadow = this.add.graphics();
      this.shadow.fillStyle(0x000000, 0.2); // negro semitransparente
      this.shadow.fillEllipse(0, 0, 45, 22.5); // ancho y alto del óvalo
      this.shadow.setDepth(0); // debajo del jugador

      // Creamos un contenedor para moverlo fácilmente
      this.shadowContainer = this.add.container(this.player.x, this.player.y + 16, [this.shadow]);

      // sombra para npc

      this.shadow1 = this.add.graphics();
      this.shadow1.fillStyle(0x000000, 0.2); // negro semitransparente
      this.shadow1.fillEllipse(0, 0, 45, 22.5); // ancho y alto del óvalo
      this.shadow1.setDepth(0); // debajo del jugador

      
      this.shadow2 = this.add.graphics();
      this.shadow2.fillStyle(0x000000, 0.2); // negro semitransparente
      this.shadow2.fillEllipse(0, 0, 45, 22.5); // ancho y alto del óvalo
      this.shadow2.setDepth(0); // debajo del jugador

      
      this.shadow3 = this.add.graphics();
      this.shadow3.fillStyle(0x000000, 0.2); // negro semitransparente
      this.shadow3.fillEllipse(0, 0, 45, 22.5); // ancho y alto del óvalo
      this.shadow3.setDepth(0); // debajo del jugador

      
      this.shadow4 = this.add.graphics();
      this.shadow4.fillStyle(0x000000, 0.2); // negro semitransparente
      this.shadow4.fillEllipse(0, 0, 45, 22.5); // ancho y alto del óvalo
      this.shadow4.setDepth(0); // debajo del jugador
      
      this.shadow5 = this.add.graphics();
      this.shadow5.fillStyle(0x000000, 0.3); // negro semitransparente
      this.shadow5.fillEllipse(0, 0, 45, 22.5); // ancho y alto del óvalo
      this.shadow5.setDepth(0); // debajo del jugador


      // alquimizta
      //this.shadowContainer1 = this.add.container(2374, 1600 + 16, [this.shadow1]);

      // granjero
      //this.shadowContainer2 = this.add.container(1829, 3375 + 16, [this.shadow2]);

      // herrero
      //this.shadowContainer3 = this.add.container(3293, 2030 + 16, [this.shadow3]);

      // Guardian
      //this.shadowContainer4 = this.add.container(2998, 942 + 16, [this.shadow4]);

      // mago
      //this.shadowContainer5 = this.add.container(2290, 2368 + 16, [this.shadow5]);





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




this.sprite_npc1.setInteractive({ useHandCursor: true });

// Crear el graphics que dibujará el borde (vacío al principio)
const borde = this.add.graphics();
borde.setDepth(1000); // para asegurarlo por encima de todo

// Flag para saber si estamos sobre la sprite
let hovering = false;

// Cuando el puntero entra: dibujar borde usando getBounds() (coordenadas del mundo)
this.sprite_npc1.on('pointerover', () => {
  hovering = true;
  const b = this.sprite_npc1.getBounds();
  const margin = 3; // margen en píxeles alrededor de la sprite
  borde.clear();
  borde.lineStyle(3, 0xFFFF00, 1); // grosor, color, alpha
  // dibujamos un rectángulo con margen
  borde.strokeRect(b.x - margin, b.y - margin, b.width + margin * 2, b.height + margin * 2);
});


// Cuando el puntero sale: limpiar el borde
this.sprite_npc1.on('pointerout', () => {
  hovering = false;
  borde.clear();
});



// En el método create(), después de inicializar otros elementos:
    if (document.getElementById('missions-panel')) {
        this.missionsPanel = new missionspanel(this);
    } else {
        console.error('El elemento missions-panel no se encuentra en el DOM');
    }


// Eliminar los event listeners de los NPCs que creaban el panel gráfico
// y reemplazarlos por:
this.sprite_npc1.on('pointerdown', async () => {
  await this.openMissionsPanel('granjero');
});



this.sprite_npc4.setInteractive({ useHandCursor: true });

// Crear el graphics que dibujará el borde (vacío al principio)
const borde4 = this.add.graphics();
borde4.setDepth(1000); // para asegurarlo por encima de todo

// Flag para saber si estamos sobre la sprite
let hovering4 = false;

// Cuando el puntero entra: dibujar borde usando getBounds() (coordenadas del mundo)
this.sprite_npc4.on('pointerover', () => {
  hovering4 = true;
  const b = this.sprite_npc4.getBounds();
  const margin = 3; // margen en píxeles alrededor de la sprite
  borde4.clear();
  borde4.lineStyle(3, 0xFFFF00, 1); // grosor, color, alpha
  // dibujamos un rectángulo con margen
  borde4.strokeRect(b.x - margin, b.y - margin, b.width + margin * 2, b.height + margin * 2);
});

// Cuando el puntero sale: limpiar el borde
this.sprite_npc4.on('pointerout', () => {
  hovering4 = false;
  borde4.clear();
});


this.sprite_npc4.on('pointerdown', async () => {
  await this.openMissionsPanel('guardian');
});



/*

  this.loadMissionsData();

await this.updateMissionsData({
  misiones_granjero: 5
});

*/







// ── SISTEMA DE NOTIFICACIONES ────────────────────────────────────────────
// Badge del botón mail
this._notifBadge = document.getElementById('mail-notif-badge');
this._notifList  = [];  // Array of {id, msg, icon, time, read}
this._notifPanel = document.getElementById('notif-panel');

// Hide old mailbox panel if it was left open from a previous session
const _staleMailbox = document.getElementById('_mail-panel-root');
if (_staleMailbox) _staleMailbox.style.display = 'none';

// Cargar notificaciones desde el servidor
this._loadNotifications();

// La campana se engancha más abajo, junto al resto de botones redondos, con
// _bindDomClick. Antes se hacía aquí con `mailBtn.onclick = ...` Y otra vez
// abajo con addEventListener sobre roundButtons[1]: eran dos enganches al mismo
// botón, así que un clic abría el panel dos veces y marcaba las notificaciones
// como leídas dos veces.

// Cerrar panel
const notifClose = document.getElementById('notif-close');
if (notifClose) notifClose.onclick = () => this._closeNotifPanel();

const markAllBtn = document.getElementById('notif-mark-all-read');
if (markAllBtn) markAllBtn.onclick = () => this._markAllNotifRead();

const clearAllNotifBtn = document.getElementById('notif-clear-all');
if (clearAllNotifBtn) clearAllNotifBtn.onclick = () => this._clearAllNotif();

/*
// API de badge (accesible desde cualquier parte de la escena):
// this._addNotification('🎯 Mission completed!', '🎯');
// this._updateNotifBadge();
*/


// -------------------- crafteooo -----------------------------














    
      // dibujando rectangulo de npc

        const width = 151;
        const height = 20;
        const x = 1752;
        const y = 3278;
        const borderRadius = 10;
        const fillColor = 0x000000; // negro
        const fillAlpha = 0.32;      // Transparencia (0.0 - 1.0)
        const graphics = this.add.graphics();
        // Solo fondo con esquinas redondeadas y transparencia, sin bordes
        graphics.fillStyle(fillColor, fillAlpha);
        graphics.fillRoundedRect(x, y, width, height, borderRadius);



        // Configuración profesional para textos de NPCs
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

// Creación de textos con estilo profesional

// PROFUNDIDAD DE LOS CARTELES DE LOS NPC (2026-08-04)
// ---------------------------------------------------------------------------
// Estaban en depth 9. La profundidad del jugador y de su perro se calcula con
// la línea de sus pies (`y + alto/2`), que en este mapa vale miles, así que el
// personaje SIEMPRE pasaba por delante del cartel morado y lo tapaba.
// Con este valor los carteles quedan por encima del jugador y de la mascota
// (que nunca superan unos pocos miles) pero por debajo de las etiquetas de los
// jugadores remotos (99999) y de la interfaz, así que nada más cambia de orden.
const NPC_LABEL_DEPTH = 90000;

this.npcx1 = this.add.text(1829, 3288, 'Granjero Joe', textStyle);
this.npcx1.setOrigin(0.5);
this.npcx1.setDepth(NPC_LABEL_DEPTH);

this.npcx2 = this.add.text(3296, 1950, 'Crafteador Jack', textStyle);
this.npcx2.setOrigin(0.5);
this.npcx2.setDepth(NPC_LABEL_DEPTH);

this.npcx3 = this.add.text(2374, 1515, 'Alquimista Colin', textStyle);
this.npcx3.setOrigin(0.5);
this.npcx3.setDepth(NPC_LABEL_DEPTH);

this.npcx4 = this.add.text(3002, 855, 'Guardian Rurik', textStyle);
this.npcx4.setOrigin(0.5);
this.npcx4.setDepth(NPC_LABEL_DEPTH);

this.npcx5 = this.add.text(2290, 2283, 'Lord Digby', textStyle);
this.npcx5.setOrigin(0.5);
this.npcx5.setDepth(NPC_LABEL_DEPTH);


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


    // Configurar panel de configuraciones (HTML)
    this.setupSettingsPanel();




      // ===============================
    // BOTONES REDONDOS (DOM)
    // ===============================

    this.roundButtons = document.querySelectorAll('.round-btn');

    // ---------- BOTÓN 0 (Dashboard)
    this.onRoundBtnDashboard = () => {
        console.log("dashboard clicked");
        this.showSettingsPanel(); // Usa el método de la clase
    };

    // ---------- BOTÓN 1 (Mail / campana de notificaciones)
    this.onRoundBtnMail = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        console.log("Mail clicked");
        this._openNotifPanel();
    };

    // ---------- BOTÓN 2 (musica)
    if (this.sound && typeof this.sound.add === 'function') {
      this.initAudioSystem();
      this.playMusic('main-theme');
    } else {
      console.warn('⚠️ Sistema de sonido no disponible, omitiendo inicialización');
    }

    this.onRoundBtnStats = () => {
      console.log("control clicked");

        this.showSoundHub();

    };




// Open the transaction hub (e.g., from a button)
this.onRoundBtnReputation = () => {
    // Try hub system first, fall back to direct DOM toggle
    try {
      if (window.hub) {
        if (!window.hub.baseUrl) {
          window.hub.baseUrl = this.serverclient1 || '';
        }
        window.hub.setUser(this.playerName, this.playerName);
        window.hub.toggle();
        return;
      }
    } catch (_) {}
    // Direct DOM fallback
    const panel = document.getElementById('tx-hub');
    if (!panel) return;
    const hidden = panel.classList.contains('tx-hub-hidden');
    if (hidden) {
      panel.classList.remove('tx-hub-hidden');
      panel.classList.add('tx-hub-visible');
      panel.style.display = 'flex';
    } else {
      panel.classList.remove('tx-hub-visible');
      panel.classList.add('tx-hub-hidden');
      panel.style.display = 'none';
    }
};


/*

// Add a transaction from game logic
window.hub.addTransaction('interaction', {
  name: 'Harvest Wheat',
  quantity: 5,
  hash: '0xabc123...def',
  status: 'pending', // or 'confirmed', 'reverted'
  hiddenData: { plotId: 'field1', seedType: 'Semillax' }
});

// Remove a transaction by hash (e.g., after manual cleanup)
window.hub.removeTransaction('0xabc123...def');

// Custom retry handler – set in TransactionHub options or override
window.hub.onRetry = (hiddenData) => {
  console.log('Retry with data:', hiddenData);
  // Add your game logic to reattempt the action
  this.retryAction(hiddenData);
};

*/

    /*

    // ---------- BOTÓN 2 (Estadísticas)
    this.onRoundBtnStats = () => {
      console.log("estadisticas clicked");
    };

    // ---------- BOTÓN 3 (Reputación)
    this.onRoundBtnReputation = () => {
      console.log("reputation clicked");
    };

    // ---------- BOTÓN 4 (HUD Estadísticas)
    this.onRoundBtnHudStats = () => {
      console.log("libro de estadisticas clicked");
    };

    */

    // ASIGNAR LISTENERS
    // Todos van por _bindDomClick: el HUD es DOM persistente y un
    // addEventListener suelto se acumularía en cada entrada a la escena.
    this._bindDomClick(this.roundButtons[0], 'dashboard', this.onRoundBtnDashboard);

    // NFT Button
    this._bindDomClick(document.getElementById('nft-btn'), 'nft', (e) => {
      e.stopPropagation();
      this.openNFTPanel();
    });

    // Skills Button
    this._bindDomClick(document.getElementById('skills-btn'), 'skills', (e) => {
      e.stopPropagation();
      this.openSkillsPanel();
    });

    // Store Button — abre el Market en una pestaña nueva.
    // FIX: antes se usaba this.serverclient1 (dominio de la API,
    // api.grasslandforest.com) y el Market debe abrirse en el dominio del
    // JUEGO (game.grasslandforest.com), donde vive market.html junto a
    // index.html. Resolvemos la URL relativa a la página actual: en
    // producción → https://game.grasslandforest.com/market.html y en
    // desarrollo local → el mismo host/puerto que sirve el juego.
    // (La cookie de sesión funciona entre subdominios vía COOKIE_DOMAIN
    // =.grasslandforest.com en el backend.)
    this._bindDomClick(document.getElementById('store-btn'), 'store', (e) => {
      e.stopPropagation();
      const marketUrl = new URL('market.html', window.location.href).href;
      window.open(marketUrl, '_blank');
    });

    // La CAMPANA se engancha por su id (#mail-btn) y no por el índice 1 de
    // this.roundButtons: ese índice depende del orden del HTML y de que la
    // NodeList siga apuntando a los nodos vivos. Por id es siempre el botón
    // correcto, exista o no el resto del HUD.
    this._bindDomClick(document.getElementById('mail-btn'), 'mail', this.onRoundBtnMail);

    this._bindDomClick(this.roundButtons[2], 'stats', this.onRoundBtnStats);
    this._bindDomClick(this.roundButtons[3], 'reputation', this.onRoundBtnReputation);
    /*
    this.roundButtons[4]?.addEventListener('click', this.onRoundBtnHudStats);

    */


    window.addEventListener('beforeunload', () => {
        this.handlePageUnload();
      this.children.each(child => child.destroy());

      // 2. Limpiar texturas no usadas
      this.textures.remove('texture-key');

      // 3. Limpiar caché
      this.cache.html.remove('key');

    });







    /*
// Sistema de movimiento por clic sostenido
this.clickMovement = {
    enabled: true,
    target: null,
    isMoving: false,
    isClicking: false,
    clickStartTime: 0,
    cooldownTime: 220, // 1.5 segundos de cooldown
    minDistance: 15,
    speed: 300
};

console.log('Configurando sistema de movimiento por clic...');

// Configurar eventos de puntero
this.input.on('pointerdown', (pointer) => {
    console.log('📌 POINTERDOWN detectado - X:', pointer.x, 'Y:', pointer.y, 'Target:', pointer.event.target);
    
    // Verificar si el clic fue en el canvas de Phaser
    const canvas = this.game.canvas;
    const isCanvasClick = pointer.event.target === canvas || 
                         pointer.event.target.tagName === 'container' ||
                         canvas.contains(pointer.event.target);
                        
    console.log('¿Es clic en canvas?', isCanvasClick);
    
    if (isCanvasClick) {
        console.log('✅ Iniciando movimiento por clic...');
        pointer.event.preventDefault();
        pointer.event.stopPropagation();
        this.handleClickMovementStart(pointer);
    } else {
        console.log('❌ Clic fuera del canvas, ignorando...');
    }
});

this.input.on('pointermove', (pointer) => {
    // Solo procesar si estamos en modo clic sostenido
    if (this.clickMovement.isClicking) {
        console.log('🔄 POINTERMOVE mientras se mantiene clic');
        const canvas = this.game.canvas;
    const isCanvasClick = pointer.event.target === canvas || 
                         pointer.event.target.tagName === 'container' ||
                         canvas.contains(pointer.event.target);
        if (isCanvasClick) {
            pointer.event.preventDefault();
            pointer.event.stopPropagation();
            this.handleClickMovementUpdate(pointer);
        }
    }
});

this.input.on('pointerup', (pointer) => {
    console.log('🔼 POINTERUP detectado');
    
    // Solo procesar si estábamos en modo clic sostenido
    if (this.clickMovement.isClicking) {
        console.log('✅ Terminando movimiento por clic...');
        const canvas = this.game.canvas;
    const isCanvasClick = pointer.event.target === canvas || 
                         pointer.event.target.tagName === 'container' ||
                         canvas.contains(pointer.event.target);
        if (isCanvasClick) {
            pointer.event.preventDefault();
            pointer.event.stopPropagation();
            this.handleClickMovementEnd();
        }
    }
});

// Configurar el input para que capture todos los eventos
this.input.mouse.disableContextMenu();


      if (this.lenguaje === 1) {
        
      this.notifications.show("⛏️ You need a pickaxe to mine", "error");

      } else if (this.lenguaje === 2) {
      this.notifications.show("⛏️ You need a pickaxe to mine", "error");
        
      }
*/




// ------------------ funcion minar cristales ----------------------




// ----------------------------
// Minado de cristales con pico (1..5 clicks aleatorios)
// ----------------------------
// ------------------ funcion minar cristales ----------------------

 
// =============================================================================
// 1. CONFIGURACIÓN DE TIPOS DE MINERAL (debe coincidir con el backend)
// =============================================================================
// RESPAWN (2026-08-03): bajado de 300 s a 60 s. Debe coincidir con
// MINERAL_TYPE_CONFIG del backend (server2.js), que es quien manda de verdad.
const MINE_TYPE_CONFIG = {
  piedra: { requiredPick: 'pico_de_madera', baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 },
  cobre:  { requiredPick: 'pico_de_piedra', baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 },
  hierro: { requiredPick: 'pico_de_cobre',  baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 },
  carbon: { requiredPick: 'pico_de_hierro', baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 }
};
 
// =============================================================================
// 2. MAPEO DE SPRITE → TIPO DE MINERAL
// =============================================================================
function getMineralTypeFromKey(key) {
  if (key.includes('piedra')) return 'piedra';
  if (key.includes('cobre'))  return 'cobre';
  if (key.includes('hierro')) return 'hierro';
  if (key.includes('carbon')) return 'carbon';
  return null;
}
 
// =============================================================================
// 3. COOLDOWN HUMANO (igual que en tala)
// =============================================================================
const MINE_HUMAN_COOLDOWN = {
  min: 600,
  max: 900,
  getRandom() {
    return Phaser.Math.Between(this.min, this.max);
  }
};
 
// =============================================================================
// 4. FUNCIONES DE COMUNICACIÓN CON EL BACKEND
// =============================================================================
 
/**
 * Carga los porcentajes de agotamiento desde el backend.
 */
const loadDepletionPercentages = async () => {
  if (!this.relayClient) return;
  const baseUrl = this.relayClient.config.apiBase;
  try {
    const [piedra, cobre, hierro, carbon] = await Promise.all([
      fetch(`${baseUrl}/api/mine/depletion/piedra`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${baseUrl}/api/mine/depletion/cobre`,  { credentials: 'include' }).then(r => r.json()),
      fetch(`${baseUrl}/api/mine/depletion/hierro`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${baseUrl}/api/mine/depletion/carbon`, { credentials: 'include' }).then(r => r.json())
    ]);
    this.globalMineState.depletionPercent.piedra = piedra.percent;
    this.globalMineState.depletionPercent.cobre   = cobre.percent;
    this.globalMineState.depletionPercent.hierro  = hierro.percent;
    this.globalMineState.depletionPercent.carbon  = carbon.percent;
  } catch (e) {
    console.warn('Could not load depletion percentages:', e);
  }
};
 
/**
 * Incrementa el porcentaje de agotamiento global de un tipo de mineral.
 */
const updateDepletionPercent = async (mineralType, increment) => {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/mine/depletion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mineralType, increment })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      this.globalMineState.depletionPercent[mineralType] = data.newPercent;
      return true;
    } else {
      throw new Error('Respuesta inválida del servidor');
    }
  } catch (e) {
    console.error('Error actualizando agotamiento:', e);
    this.notifications?.show('Could not update depletion', 'error');
    return false;
  }
};
 
/**
 * Consulta el estado de bloqueo de una mina específica.
 * Retorna { lockedUntil (Date|null), isLocked (boolean) }
 */
const getMineLockState = async (mineKey) => {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/mine/state/${mineKey}`, {
      method: 'GET'
    });
    if (!response.ok) return { lockedUntil: null, isLocked: false };
    const data = await response.json();
    const lockedUntil = data.lockedUntil ? new Date(data.lockedUntil) : null;
    const now = new Date();
    const isLocked = lockedUntil ? lockedUntil > now : false;
    return { lockedUntil, isLocked };
  } catch (e) {
    console.warn(`Could not get lock state for ${mineKey}:`, e);
    return { lockedUntil: null, isLocked: false };
  }
};
 
/**
 * Bloquea una mina en el backend. El servidor calcula lockedUntil.
 * Devuelve la fecha de desbloqueo (Date) o null si falló.
 */
const lockMine = async (mineKey, mineralType) => {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/mine/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mineKey, mineralType }) // sin lockedUntil — el server lo calcula
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.success === true ? new Date(data.lockedUntil) : null;
  } catch (e) {
    console.error(`Error locking mine ${mineKey}:`, e);
    this.notifications?.show('Could not lock the ore on the server', 'error');
    return null;
  }
};
 
// =============================================================================
// 5. ESTADO GLOBAL (CACHE LOCAL)
// =============================================================================
if (!this.globalMineState) {
  this.globalMineState = {
    depletionPercent: { piedra: 0, cobre: 0, hierro: 0, carbon: 0 }
  };
  loadDepletionPercentages();
}
this.lastMineClick = this.lastMineClick || {};
 
// =============================================================================
// 6. VALIDACIÓN DE PICO POR TIPO DE MINERAL
// =============================================================================
function isValidPickForMineral(pickName, mineKey) {
  // TODOS los picos pueden minar CUALQUIER mineral. Los picos bajos rinden peor:
  // más golpes (getPickClickRange_Mine) y menos probabilidad de obtener el
  // mineral (getMultipleRewards_Mine). Solo se exige que sea un PICO.
  return /^pico_de_/.test(String(pickName || ''));
}
 
// =============================================================================
// 7. LISTA DE SPRITES DE MINERALES
// =============================================================================
this.mineState = this.mineState || {};
this.mineTexts = this.mineTexts || {};
 
const mineProps = [
  // Piedras
  'sprite_minar_piedra1', 'sprite_minar_piedra2', 'sprite_minar_piedra3',
  'sprite_minar_piedra4', 'sprite_minar_piedra5',
  // Cobres
  'sprite_minar_cobre1', 'sprite_minar_cobre2', 'sprite_minar_cobre3', 'sprite_minar_cobre4',
  // Hierros
  'sprite_minar_hierro1', 'sprite_minar_hierro2', 'sprite_minar_hierro3',
  // Carbones
  'carbon_pngx1', 'carbon_pngx2'
];
 
// =============================================================================
// 8. RECOMPENSAS POR SPRITE
// =============================================================================
const mineRewards = {
  // ── Piedras ──────────────────────────────────────────────────────────────
  'sprite_minar_piedra1': {
    items: [{ id: 'mineral_piedra', cantidad: 1, probabilidad: 100 }],
    nombre: "Piedra", colorNotificacion: "#95a5a6", dificultadBase: 1.0
  },
  'sprite_minar_piedra2': {
    items: [{ id: 'mineral_piedra', cantidad: 1, probabilidad: 100 }],
    nombre: "Piedra", colorNotificacion: "#95a5a6", dificultadBase: 1.0
  },
  'sprite_minar_piedra3': {
    items: [{ id: 'mineral_piedra', cantidad: 1, probabilidad: 100 }],
    nombre: "Piedra", colorNotificacion: "#95a5a6", dificultadBase: 1.0
  },
  'sprite_minar_piedra4': {
    items: [{ id: 'mineral_piedra', cantidad: 1, probabilidad: 100 }],
    nombre: "Piedra", colorNotificacion: "#95a5a6", dificultadBase: 1.0
  },
  'sprite_minar_piedra5': {
    items: [{ id: 'mineral_piedra', cantidad: 1, probabilidad: 100 }],
    nombre: "Piedra", colorNotificacion: "#95a5a6", dificultadBase: 1.0
  },
  // ── Cobres ───────────────────────────────────────────────────────────────
  'sprite_minar_cobre1': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 40 },
      { id: 'mineral_cobre',  cantidad: 1, probabilidad: 60 }
    ],
    nombre: "Cobre", colorNotificacion: "#e67e22", dificultadBase: 1.25
  },
  'sprite_minar_cobre2': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 40 },
      { id: 'mineral_cobre',  cantidad: 1, probabilidad: 60 }
    ],
    nombre: "Cobre", colorNotificacion: "#e67e22", dificultadBase: 1.2
  },
  'sprite_minar_cobre3': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 40 },
      { id: 'mineral_cobre',  cantidad: 1, probabilidad: 60 }
    ],
    nombre: "Cobre", colorNotificacion: "#e67e22", dificultadBase: 1.2
  },
  'sprite_minar_cobre4': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 40 },
      { id: 'mineral_cobre',  cantidad: 1, probabilidad: 60 }
    ],
    nombre: "Cobre", colorNotificacion: "#e67e22", dificultadBase: 1.25
  },
  // ── Hierros ──────────────────────────────────────────────────────────────
  'sprite_minar_hierro1': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 60 },
      { id: 'mineral_hierro', cantidad: 1, probabilidad: 40 }
    ],
    nombre: "Hierro", colorNotificacion: "#bdc3c7", dificultadBase: 1.0
  },
  'sprite_minar_hierro2': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 60 },
      { id: 'mineral_hierro', cantidad: 1, probabilidad: 40 }
    ],
    nombre: "Hierro", colorNotificacion: "#bdc3c7", dificultadBase: 1.0
  },
  'sprite_minar_hierro3': {
    items: [
      { id: 'mineral_piedra', cantidad: 1, probabilidad: 60 },
      { id: 'mineral_hierro', cantidad: 1, probabilidad: 40 }
    ],
    nombre: "Hierro", colorNotificacion: "#bdc3c7", dificultadBase: 1.0
  },
  // ── Carbones ─────────────────────────────────────────────────────────────
  'carbon_pngx1': {
    items: [{ id: 'carbon', cantidad: 1, probabilidad: 100 }],
    nombre: "Carbón", colorNotificacion: "#2c3e50", dificultadBase: 1.0
  },
  'carbon_pngx2': {
    items: [{ id: 'carbon', cantidad: 1, probabilidad: 100 }],
    nombre: "Carbón", colorNotificacion: "#2c3e50", dificultadBase: 1.0
  }
};
 
// =============================================================================
// 9. FUNCIONES DE HERRAMIENTA
// =============================================================================
 
const getSelectedPickName_Mine = () => {
  if (!this.STATE || !this.STATE.selectedItem) return null;
  const id = String(this.STATE.selectedItem.id || '').toLowerCase();
  if (id === 'pico_de_madera' || id.includes('pico_de_madera')) return 'pico_de_madera';
  if (id === 'pico_de_piedra' || id.includes('pico_de_piedra')) return 'pico_de_piedra';
  if (id === 'pico_de_cobre'  || id.includes('pico_de_cobre'))  return 'pico_de_cobre';
  if (id === 'pico_de_hierro' || id.includes('pico_de_hierro')) return 'pico_de_hierro';
  return null;
};
 
const isPickSelected_Mine = () => getSelectedPickName_Mine() !== null;
 
const getPickClickRange_Mine = (pickName, mineKey) => {
  const baseDifficulty = mineRewards[mineKey]?.dificultadBase || 1.0;
  let baseRange;
  switch (pickName) {
    case 'pico_de_madera': baseRange = { min: 6, max: 10 }; break;
    case 'pico_de_piedra': baseRange = { min: 5, max: 8  }; break;
    case 'pico_de_cobre':  baseRange = { min: 4, max: 7  }; break;
    case 'pico_de_hierro': baseRange = { min: 3, max: 6  }; break;
    default:               baseRange = { min: 7, max: 12 };
  }
  return {
    min: Math.max(1, Math.round(baseRange.min * baseDifficulty)),
    max: Math.max(3, Math.round(baseRange.max * baseDifficulty))
  };
};
 
const getMultipleRewards_Mine = (mineKey, pickName) => {
  const rewards = mineRewards[mineKey]?.items || [];
  const obtained = [];
  let bonusMultiplier = 1.0;
  switch (pickName) {
    case 'pico_de_madera': bonusMultiplier = 0.6;  break; // pico bajo: menos probabilidad
    case 'pico_de_piedra': bonusMultiplier = 1.1;  break;
    case 'pico_de_cobre':  bonusMultiplier = 1.25; break;
    case 'pico_de_hierro': bonusMultiplier = 1.5;  break;
  }
  for (const reward of rewards) {
    const adjustedProb = Math.min(100, reward.probabilidad * bonusMultiplier);
    if (Phaser.Math.Between(1, 100) <= adjustedProb) {
      // BOTÍN 1-3 POR SUERTE (igual que la tala): cada mineral picado da
      // entre 1 y 3 unidades, y el pico inclina la suerte hacia 2 o 3.
      obtained.push({ id: reward.id, cantidad: this.rollGatherAmount(pickName) });
    }
  }
  // Drop garantizado SOLO con picos NO penalizados. Con pico de madera
  // (multiplier < 1) la mina PUEDE quedar sin recompensa (menos probabilidad).
  if (obtained.length === 0 && rewards.length > 0 && bonusMultiplier >= 1.0) {
    obtained.push({ id: rewards[0].id, cantidad: this.rollGatherAmount(pickName) });
  }
  return obtained;
};
 
// =============================================================================
// 10. ESTILOS DE TEXTO
// =============================================================================
const createTextStyle_Mine = (mineKey) => ({
  fontFamily: 'Arial, sans-serif',
  fontSize: '18px',
  fontWeight: 'bold',
  fill: '#ffffff',
  stroke: '#000000',
  strokeThickness: 4,
  shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 4, stroke: true, fill: true }
});
 
// =============================================================================
// 11. REGISTRO DE INTERACCIONES EN CADA SPRITE DE MINERAL
// =============================================================================
mineProps.forEach(prop => {
  const spr = this[prop];
  if (!spr) return;
  this.enablePixelPerfectInput(spr);
 
  spr.on('pointerdown', async (pointer) => {
 
    // ── Verificar clic en canvas ───────────────────────────────────────────
    const canvas = this.sys.canvas;
    const isCanvasClick = pointer.event.target === canvas ||
                          pointer.event.target.tagName === 'container' ||
                          canvas.contains(pointer.event.target);
    if (!isCanvasClick) {
      console.log('DOM click ignorado en mina');
      return;
    }
 
    // ── 1. Validar pico ───────────────────────────────────────────────────
    if (!isPickSelected_Mine()) {
      this.notifications.show("You need a pickaxe to mine", "error");
      return;
    }
    const pickName  = getSelectedPickName_Mine();
    const mineKey   = prop;
    const mineralType = getMineralTypeFromKey(mineKey);

    if (!isValidPickForMineral(pickName, mineKey)) {
      const required = MINE_TYPE_CONFIG[mineralType]?.requiredPick || 'mejor pico';
      this.notifications.show(`This ore requires ${required}`, "error");
      return;
    }

    // RECURSOS, ANTES DEL await (mismo arreglo que en la tala, ver la nota
    // larga allí): sin esto, un clic podía colarse con el último punto de
    // comida mientras el siguiente ya avisaba de que no quedaba, y el jugador
    // veía el contador subir Y el aviso a la vez.
    if (!this._hayRecursosParaTrabajar('mine')) return;

    // ── 2. Verificar bloqueo global (backend) ─────────────────────────────
    const { isLocked, lockedUntil } = await getMineLockState(mineKey);
    if (isLocked) {
      const unlockTime = lockedUntil ? lockedUntil.toLocaleTimeString() : 'indefinidamente';
      this.notifications.show(`This ore is depleted until ${unlockTime}`, "warning");
      return;
    }
 
    // ── 3. Cooldown humano ────────────────────────────────────────────────
    const now  = Date.now();
    const last = this.lastMineClick[mineKey] || 0;
    const cooldown = MINE_HUMAN_COOLDOWN.getRandom();
    if (now - last < cooldown) {
      console.log(`Mine cooldown: wait ${cooldown - (now - last)}ms`);
      return;
    }
    this.lastMineClick[mineKey] = now;
 
    // ── 4. Recursos (segunda comprobación, tras el await) ─────────────────
    if (!this._hayRecursosParaTrabajar('mine')) return;
 
    // ── 5. Inicializar / actualizar progreso local ─────────────────────────
    const mineInfo = mineRewards[mineKey] || { nombre: "Mineral", colorNotificacion: "#ffffff" };
    if (!this.mineState[mineKey]) {
      const range    = getPickClickRange_Mine(pickName, mineKey);
      const required = Phaser.Math.Between(range.min, range.max);
      this.mineState[mineKey] = {
        required,
        progress: 0,
        pickUsed:    pickName,
        mineralType: mineKey,
        mineralName: mineInfo.nombre
      };
      console.log(`⛏️ ${mineInfo.nombre}: necesitas ${required} clicks (usando ${pickName})`);
    } else {
      // Ajuste si el jugador cambió de pico a mitad de minado
      const currentPick  = getSelectedPickName_Mine();
      const originalPick = this.mineState[mineKey].pickUsed;
      if (currentPick !== originalPick) {
        console.log(`Pico cambiado: ${originalPick} -> ${currentPick}`);
        const newRange        = getPickClickRange_Mine(currentPick, mineKey);
        const originalRequired = this.mineState[mineKey].required;
        const originalProgress = this.mineState[mineKey].progress;
        const progressRatio    = originalProgress / originalRequired;
        const newRequired = Math.max(
          newRange.min,
          Math.min(newRange.max, Math.round(originalRequired * (currentPick === 'pico_de_madera' ? 1.2 : 0.8)))
        );
        const newProgress = Math.min(newRequired - 1, Math.round(newRequired * progressRatio));
        this.mineState[mineKey] = {
          required: newRequired,
          progress: Math.max(0, newProgress),
          pickUsed:    currentPick,
          mineralType: mineKey,
          mineralName: mineInfo.nombre
        };
        console.log(`Progreso ajustado: ${this.mineState[mineKey].progress}/${this.mineState[mineKey].required} (con ${currentPick})`);
      }
    }
 
    // ── 6. Consumir recursos y avanzar progreso ───────────────────────────
    this.actualizarBarraAgua(this.aguaPorcentaje - 1);
    this.actualizarBarraComida(this.comidaPorcentaje - 1);
    this.mineState[mineKey].progress++;
    const s = this.mineState[mineKey];
    console.log(`⛏️ ${mineInfo.nombre}: click ${s.progress}/${s.required} (con ${s.pickUsed})`);
    this.queuedAction && this.queuedAction({ type: 'forSpam2' });
    this.playSFX('cortando_sound');
 
    // Mostrar / actualizar texto de progreso
    if (!this.mineTexts[mineKey]) {
      this.mineTexts[mineKey] = this.add.text(spr.x + 45, spr.y - 110, `${s.progress}/${s.required}`, createTextStyle_Mine(mineKey));
      this.mineTexts[mineKey].setOrigin(0.5).setDepth(9);
      const indicator = this.add.rectangle(
        spr.x + 45, spr.y - 130, 30, 5,
        parseInt(mineInfo.colorNotificacion.replace('#', '0x'))
      ).setOrigin(0.5).setDepth(8);
      this.mineTexts[mineKey].indicator = indicator;
    } else {
      this.mineTexts[mineKey].setText(`${s.progress}/${s.required}`);
      this.mineTexts[mineKey].setPosition(spr.x + 45, spr.y - 100);
      if (this.mineTexts[mineKey].indicator) {
        this.mineTexts[mineKey].indicator.setPosition(spr.x + 45, spr.y - 120);
      }
    }
 
    // ── 7. Minado completado ──────────────────────────────────────────────
    if (s.progress >= s.required) {
      console.log(`✅ Minaste ${mineInfo.nombre}`);

      // FIX (transacciones duplicadas al picar rápido, ej. "11/8"):
      // Deshabilitar el sprite y limpiar el progreso AQUÍ MISMO, de forma
      // SÍNCRONA, antes de cualquier "await". Antes esto se hacía después de
      // esperar la transacción on-chain (_agregarFrutoOnChain), y mientras esa
      // espera corría el mineral seguía interactivo: cada click de más volvía a
      // entrar aquí (el contador seguía subiendo: 9/8, 10/8, 11/8) y encolaba
      // otra transacción. Al terminar, se disparaban todas esas transacciones
      // duplicadas una tras otra. Es el mismo arreglo que ya tenía la tala.
      this.disableSpriteInput(spr);
      // El mineral picado desaparece y se le quita SU colisión (solo los
      // rectángulos que caen dentro de él), hasta que termine el respawn.
      this.hideMinedMineral(mineKey);
      if (this.mineTexts[mineKey]) {
        this.mineTexts[mineKey].destroy();
        if (this.mineTexts[mineKey].indicator) this.mineTexts[mineKey].indicator.destroy();
        delete this.mineTexts[mineKey];
      }
      delete this.mineState[mineKey];

      this.playSFX('cortado_sound');

      // GATHER_SERVER (anti-trampa): si está activo, el SERVIDOR valida el nodo,
      // lo bloquea, decide y ACUÑA la recompensa. Apagado (default): flujo cliente.
      let rewards;
      if (this.GATHER_SERVER) {
        rewards = await this._gatherClaim(mineKey, pickName);
        this.nivel_exp = (this.nivel_exp || 0) + (rewards.length ? 50 : 0);
      } else {
        rewards = getMultipleRewards_Mine(mineKey, pickName);
        // "lo que se mina es transacción": _agregarFrutoOnChain manda la tx real
        // si el item tiene tipo; si no (ej. carbon), lo agrega off-chain.
        for (const reward of rewards) {
          await this._agregarFrutoOnChain(reward.id, reward.cantidad);
          this.nivel_exp = (this.nivel_exp || 0) + 50;
        }
      }

      // (los textos de progreso y el estado ya se limpiaron arriba, ver FIX)
      if (rewards.length === 0) {
        // Con pico de madera (o bajo) a veces no cae mineral.
        this.notifications.show(`Mined ${mineInfo.nombre}! But you got no ore this time.`, "warning", { icon: '⛏️' });
      } else {
        const rewardNames = rewards.map(r => `${r.cantidad}x ${this._getFruitDisplayNameEN(r.id)}`).join(', ');
        this.notifications.show(`Mined ${mineInfo.nombre}!\nObtained: ${rewardNames}`, "success", {
          customColor: mineInfo.colorNotificacion,
          icon: '⛏️'
        });
      }
 
      // ── 8. Desgastar el pico ──────────────────────────────────────────
      if (this.STATE.selectedItem && this.STATE.selectedItem.idx) {
        await this.verificarRompimiento(this.STATE.selectedItem);
      }
 
      // ── 9. Actualizar agotamiento global y bloquear mina ─────────────
      if (mineralType) {
        const increment = MINE_TYPE_CONFIG[mineralType]?.percentIncrement || 1;
        const depletionSuccess = await updateDepletionPercent(mineralType, increment);
        if (!depletionSuccess) {
          this.notifications.show('Could not update depletion. The ore was not locked.', 'error');
          // Si no se bloqueó en el servidor, devolver el mineral al jugador:
          // si no, quedaría deshabilitado para siempre (ya no hay respawn que
          // lo reactive, porque nunca se programó).
          this.showMinedMineral(mineKey);
          this.enablePixelPerfectInput(spr);
          return;
        }

        const serverLockedUntil = await lockMine(mineKey, mineralType);
        if (!serverLockedUntil) {
          this.notifications.show('Could not lock the ore on the server.', 'error');
          this.showMinedMineral(mineKey);
          this.enablePixelPerfectInput(spr);
          return;
        }

        // (el sprite ya fue deshabilitado al inicio del bloque, ver FIX arriba)

        // Programar reactivación usando la fecha del servidor
        const remainingMs = serverLockedUntil.getTime() - Date.now();
        const unlockMineSprite = async (sprRef, key) => {
          try {
            const state = await getMineLockState(key);
            if (!state.isLocked) {
              const liveSpr = this[key];
              if (liveSpr && liveSpr.active) {
                this.enablePixelPerfectInput(liveSpr);
                console.log(`⛏️ Mina ${key} desbloqueada automáticamente`);
              }
              // Vuelve el mineral y su colisión
              this.showMinedMineral(key);
            }
          } catch (e) {
            // Si falla la consulta, desbloquear de todas formas
            const liveSpr = this[key];
            if (liveSpr && liveSpr.active) this.enablePixelPerfectInput(liveSpr);
            this.showMinedMineral(key);
          }
        };
        if (remainingMs > 0) {
          setTimeout(() => unlockMineSprite(spr, mineKey), remainingMs);
        } else {
          unlockMineSprite(spr, mineKey);
        }
      } else {
        // Mineral no clasificado: bloqueo local temporal sin transparencia
        // (el sprite ya fue deshabilitado al inicio del bloque, ver FIX arriba)
        setTimeout(() => {
          if (spr && spr.active) this.enablePixelPerfectInput(spr);
          this.showMinedMineral(mineKey);
        }, 60000);
      }
    }
  }); // fin pointerdown
}); // fin forEach
 
// =============================================================================
// 12. FUNCIONES DE RESET Y DEBUG
// =============================================================================
const resetMineSingle = (mineKey) => {
  if (this.mineState[mineKey]) delete this.mineState[mineKey];
  if (this.mineTexts[mineKey]) {
    this.mineTexts[mineKey].destroy();
    if (this.mineTexts[mineKey].indicator) this.mineTexts[mineKey].indicator.destroy();
    delete this.mineTexts[mineKey];
  }
  console.log(`🔄 Mina ${mineKey} reiniciada localmente`);
};
 
const getMineMiningStats = () => {
  const stats = {};
  mineProps.forEach(prop => {
    if (this.mineState[prop]) {
      const info = mineRewards[prop] || { nombre: 'Desconocido' };
      stats[prop] = {
        ...this.mineState[prop],
        progressPercentage: Math.round((this.mineState[prop].progress / this.mineState[prop].required) * 100),
        mineralName: info.nombre,
        rewards: info.items
      };
    }
  });
  return stats;
};
 
const debugForceReward_Mine = (mineKey, itemId, cantidad = 1) => {
  if (!mineRewards[mineKey]) {
    console.error(`Mina ${mineKey} no encontrada`);
    return false;
  }
  const exito = this.addItemWithCheck(itemId, cantidad);
  if (exito) {
    console.log(`[DEBUG] Forzado: ${cantidad}x ${itemId} de ${mineKey}`);
    return true;
  }
  return false;
};
 
window.debugMining = {
  resetMineSingle,
  getMineMiningStats,
  debugForceReward_Mine,
  mineRewards,
  getPickClickRange_Mine
};
 
console.log('✅ Sistema de minería cargado con cooldown humano y respawn global');
console.log('📊 Tipos de mineral:', Object.keys(MINE_TYPE_CONFIG));



// =============================================================================
// SISTEMA DE TALA MEJORADO (COOLDOWN HUMANO + RESPAWN GLOBAL + CLASIFICACIÓN)
// =============================================================================

// -----------------------------------------------------------------------------
// CONFIGURACIÓN DE TIPOS DE ÁRBOL Y HACHAS REQUERIDAS
// -----------------------------------------------------------------------------
// Reglas de hacha por tipo de árbol (pedido del usuario 2026-07-28):
//  - pinos     → CUALQUIER hacha sirve.
//  - arbustos  → todas las hachas MENOS la de madera.
//  - arbolx (árbol seco) → todas MENOS la de madera y la de piedra.
// Se expresa como lista de hachas EXCLUIDAS (ver isValidAxeForTree).
// RESPAWN (2026-08-03): bajado de 300 s a 60 s, igual que TREE_TYPE_CONFIG del
// backend (server2.js). El servidor es el que decide la fecha real; esto es
// solo la copia local de la configuración.
const TREE_TYPE_CONFIG = {
  pinos:     { excludedAxes: [],                                  baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 },
  arbustos:  { excludedAxes: ['hacha_de_madera'],                 baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 },
  arbolx:    { excludedAxes: ['hacha_de_madera', 'hacha_de_piedra'], baseRespawn: 60, percentIncrement: 1, respawnMultiplier: 0 }
};

// Mapeo de sprites a tipos
function getTreeTypeFromKey(key) {
  if (key.startsWith('sprite_pinos')) return 'pinos';
  if (key.startsWith('sprite_arbustos')) return 'arbustos';
  if (key.startsWith('sprite_arbolx')) return 'arbolx';
  return null;
}

// Los troncos viven en métodos de la escena (showTreeStump / hideTreeStump)
// para que loadTreeLockStates() también pueda ponerlos al recargar la página.
const showTreeStump = (sprRef, treeKey) => this.showTreeStump(treeKey);
const hideTreeStump = (treeKey) => this.hideTreeStump(treeKey);

// -----------------------------------------------------------------------------
// COOLDOWN HUMANO (600-900 ms + aleatoriedad ±150 ms)
// -----------------------------------------------------------------------------
// Cooldown humano de TALA a la mitad (antes 600-900 ms) → tala más ágil.
const HUMAN_COOLDOWN = {
  min: 300,
  max: 450,
  getRandom() {
    return Phaser.Math.Between(this.min, this.max);
  }
};

// -----------------------------------------------------------------------------
// FUNCIÓN AUXILIAR PARA OBTENER EL TOKEN CSRF DESDE LA COOKIE
// -----------------------------------------------------------------------------
function getCSRFToken() {
  const name = 'csrf-token=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1);
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// FUNCIONES DE COMUNICACIÓN CON EL BACKEND (AHORA CON CSRF Y MANEJO DE ERRORES)
// -----------------------------------------------------------------------------

/**
 * Carga los porcentajes de deforestación desde el backend.
 */
const loadDeforestationPercentages = async () => {
  if (!this.relayClient) return;
  const baseUrl = this.relayClient.config.apiBase;
  try {
    const [pinos, arbustos, arbolx] = await Promise.all([
      fetch(`${baseUrl}/api/tree/deforestation/pinos`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${baseUrl}/api/tree/deforestation/arbustos`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${baseUrl}/api/tree/deforestation/arbolx`, { credentials: 'include' }).then(r => r.json())
    ]);
    this.globalTreeState.deforestationPercent.pinos = pinos.percent;
    this.globalTreeState.deforestationPercent.arbustos = arbustos.percent;
    this.globalTreeState.deforestationPercent.arbolx = arbolx.percent;
  } catch (e) {
    console.warn('Could not load deforestation percentages:', e);
  }
};

/**
 * Actualiza el porcentaje de deforestación de un tipo en el backend.
 */
const updateDeforestationPercent = async (treeType, increment) => {
  try {
    // Usa fetchWithTokenRetry que ya maneja autenticación y CSRF
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/tree/deforestation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ treeType, increment })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      this.globalTreeState.deforestationPercent[treeType] = data.newPercent;
      return true;
    } else {
      throw new Error('Respuesta inválida del servidor');
    }
  } catch (e) {
    console.error('Error updating deforestation:', e);
    this.notifications?.show('Could not update deforestation', 'error');
    return false;
  }
};

/**
 * Consulta el estado de bloqueo de un árbol específico.
 * Retorna { lockedUntil (Date object or null), isLocked (boolean) }.
 */
const getTreeLockState = async (treeKey) => {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/tree/state/${treeKey}`, {
      method: 'GET'
    });
    if (!response.ok) return { lockedUntil: null, isLocked: false };
    const data = await response.json();
    const lockedUntil = data.lockedUntil ? new Date(data.lockedUntil) : null;
    const now = new Date();
    const isLocked = lockedUntil ? lockedUntil > now : false;
    return { lockedUntil, isLocked };
  } catch (e) {
    console.warn(`Could not get lock state for ${treeKey}:`, e);
    return { lockedUntil: null, isLocked: false };
  }
};

// 🔧 CORREGIDO: lockTree ya NO recibe lockedUntil, y devuelve la fecha del servidor
const lockTree = async (treeKey, treeType) => {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/tree/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ treeKey, treeType }) // sin lockedUntil
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.success === true ? new Date(data.lockedUntil) : null;
  } catch (e) {
    console.error(`Error locking tree ${treeKey}:`, e);
    this.notifications?.show('Could not lock the tree on the server', 'error');
    return null;
  }
};

// -----------------------------------------------------------------------------
// ESTADO GLOBAL (CACHE LOCAL)
// -----------------------------------------------------------------------------
if (!this.globalTreeState) {
  this.globalTreeState = {
    deforestationPercent: { pinos: 0, arbustos: 0, arbolx: 0 }
  };
  loadDeforestationPercentages(); // AHORA SÍ, la función ya está definida arriba
}
this.lastTreeClick = this.lastTreeClick || {};

// -----------------------------------------------------------------------------
// VALIDACIÓN DE HACHA POR TIPO DE ÁRBOL
// -----------------------------------------------------------------------------
function isValidAxeForTree(pickName, treeKey) {
  // TODAS las hachas pueden talar CUALQUIER árbol. Las hachas bajas (madera)
  // rinden peor: más golpes (getPickClickRange_Ore) y menos probabilidad de
  // obtener madera (getMultipleRewards_Ore). Solo se exige que sea un HACHA.
  return /^hacha_de_/.test(String(pickName || ''));
}

// -----------------------------------------------------------------------------
// PROPIEDADES Y RECOMPENSAS ORIGINALES (COMPLETAS)
// -----------------------------------------------------------------------------
this.oreMineState = this.oreMineState || {};
this.oreTexts = this.oreTexts || {};

const oreProps = [
  'sprite_pinos1', 'sprite_pinos2', 'sprite_pinos3', 'sprite_pinos4',
  'sprite_pinos5', 'sprite_pinos6', 'sprite_pinos7', 'sprite_pinos8',
  'sprite_pinos9', 'sprite_pinos10', 'sprite_pinos11', 'sprite_pinos12',
  'sprite_pinos13', 'sprite_pinos14', 'sprite_pinos15', 'sprite_pinos16',
  'sprite_pinos17', 'sprite_pinos18', 'sprite_pinos19', 'sprite_pinos20',
  'sprite_pinos21', 'sprite_pinos22', 'sprite_pinos23', 'sprite_pinos24',
  'sprite_pinos25', 'sprite_pinos26', 'sprite_pinos27', 'sprite_pinos28',
  'sprite_pinos29', 'sprite_pinos30', 'sprite_pinos31', 'sprite_pinos32',
  'sprite_pinos33', 'sprite_pinos34', 'sprite_pinos35', 'sprite_pinos36',
  'sprite_pinos37', 'sprite_pinos38', 'sprite_pinos39', 'sprite_pinos40',
  'sprite_pinos41', 'sprite_pinos42', 'sprite_pinos43', 'sprite_pinos44',
  'sprite_pinos45',
  'sprite_arbustos_1', 'sprite_arbustos_2', 'sprite_arbustos_3', 'sprite_arbustos_4',
  'sprite_arbustos_5', 'sprite_arbustos_6', 'sprite_arbustos_7', 'sprite_arbustos_8',
  'sprite_arbustos_9', 'sprite_arbustos_10', 'sprite_arbustos_11', 'sprite_arbustos_12',
  'sprite_arbustos_13', 'sprite_arbustos_14', 'sprite_arbustos_15', 'sprite_arbustos_16',
  'sprite_arbustos_17', 'sprite_arbustos_18', 'sprite_arbustos_19', 'sprite_arbustos_20',
  'sprite_arbustos_21', 'sprite_arbustos_22', 'sprite_arbustos_23', 'sprite_arbustos_24',
  'sprite_arbustos_25', 'sprite_arbustos_26', 'sprite_arbustos_27', 'sprite_arbustos_28',
  'sprite_arbolx1', 'sprite_arbolx2', 'sprite_arbolx3', 'sprite_arbolx4',
  'sprite_arbolx5', 'sprite_arbolx6', 'sprite_arbolx7', 'sprite_arbolx8',
  'sprite_arbolx9', 'sprite_arbolx10', 'sprite_arbolx11', 'sprite_arbolx12',
  'sprite_arbolx13', 'sprite_arbolx14', 'sprite_arbolx15', 'sprite_arbolx16',
  'sprite_arbolx17', 'sprite_arbolx18',
];

const oreRewards = {
  'sprite_pinos1': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos2': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos3': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos4': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos5': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos6': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos7': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos8': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos9': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos10': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos11': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos12': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos13': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos14': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos15': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos16': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos17': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos18': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos19': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos20': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos21': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos22': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos23': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos24': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos25': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos26': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos27': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos28': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos29': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos30': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos31': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos32': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos33': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos34': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos35': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos36': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos37': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos38': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos39': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos40': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos41': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos42': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos43': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos44': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_pinos45': {
    items: [{ id: 'madera_pinos', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_1': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_2': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_3': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_4': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_5': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_6': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_7': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_8': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_9': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_10': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_11': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_12': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_13': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_14': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_15': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_16': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_17': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_18': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_19': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_20': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_21': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_22': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_23': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_24': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_25': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_26': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_27': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbustos_28': {
    items: [{ id: 'madera_con_hojas', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx1': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx2': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx3': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx4': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx5': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx6': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx7': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx8': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx9': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx10': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx11': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx12': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx13': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx14': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx15': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx16': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx17': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
  'sprite_arbolx18': {
    items: [{ id: 'madera_seca', cantidad: 1, probabilidad: 100 }],
    nombre: "madera",
    colorNotificacion: "#3498db",
    dificultadBase: 1.0
  },
};

// Funciones originales
const getSelectedPickName_Ore = () => {
  if (!this.STATE || !this.STATE.selectedItem) return null;
  const id = String(this.STATE.selectedItem.id || '').toLowerCase();
  if (id === 'hacha_de_madera' || id.includes('hacha_de_madera')) return 'hacha_de_madera';
  if (id === 'hacha_de_piedra' || id.includes('hacha_de_piedra')) return 'hacha_de_piedra';
  if (id === 'hacha_de_cobre' || id.includes('hacha_de_cobre')) return 'hacha_de_cobre';
  if (id === 'hacha_de_hierro' || id.includes('hacha_de_hierro')) return 'hacha_de_hierro';
  return null;
};

const isPickSelected_Ore = () => getSelectedPickName_Ore() !== null;

const getPickClickRange_Ore = (pickName, oreKey) => {
  const baseDifficulty = oreRewards[oreKey]?.dificultadBase || 1.0;
  let baseRange;
  // Rangos reducidos (antes 6-10 / 5-8 / 4-7 / 3-6 / 7-12): talar árboles
  // era muy tardado para el jugador, así que se bajó aprox. un 35%.
  switch (pickName) {
    case 'hacha_de_madera': baseRange = { min: 4, max: 7 }; break;
    case 'hacha_de_piedra': baseRange = { min: 3, max: 5 }; break;
    case 'hacha_de_cobre': baseRange = { min: 3, max: 4 }; break;
    case 'hacha_de_hierro': baseRange = { min: 2, max: 3 }; break;
    default: baseRange = { min: 4, max: 8 };
  }
  return {
    min: Math.max(1, Math.round(baseRange.min * baseDifficulty)),
    max: Math.max(2, Math.round(baseRange.max * baseDifficulty))
  };
};

const getRandomReward_Ore = (oreKey) => {
  const rewards = oreRewards[oreKey]?.items;
  if (!rewards || rewards.length === 0) return { id: 'mineral_piedra', cantidad: 1 };
  const totalProb = rewards.reduce((s, it) => s + it.probabilidad, 0);
  if (rewards.length === 1) return { id: rewards[0].id, cantidad: rewards[0].cantidad };
  const random = Phaser.Math.Between(0, totalProb - 1);
  let acumulado = 0;
  for (const item of rewards) {
    acumulado += item.probabilidad;
    if (random < acumulado) return { id: item.id, cantidad: item.cantidad };
  }
  return { id: rewards[0].id, cantidad: rewards[0].cantidad };
};

const getMultipleRewards_Ore = (oreKey, pickName) => {
  const rewards = oreRewards[oreKey]?.items || [];
  const obtainedRewards = [];
  let bonusMultiplier = 1.0;
  switch (pickName) {
    case 'hacha_de_madera': bonusMultiplier = 0.6; break; // hacha baja: menos probabilidad de obtener madera
    case 'hacha_de_piedra': bonusMultiplier = 1.1; break;
    case 'hacha_de_cobre':  bonusMultiplier = 1.25; break;
    case 'hacha_de_hierro':  bonusMultiplier = 1.5; break;
  }
  for (const reward of rewards) {
    const adjustedProb = Math.min(100, reward.probabilidad * bonusMultiplier);
    if (Phaser.Math.Between(1, 100) <= adjustedProb) {
      // BOTÍN 1-3 POR SUERTE: cada árbol talado da entre 1 y 3 troncos. El
      // hacha inclina la suerte (mejor hacha = más probabilidad de 2 o 3),
      // pero el rango sigue siendo 1..3 con cualquiera de ellas.
      obtainedRewards.push({ id: reward.id, cantidad: this.rollGatherAmount(pickName) });
    }
  }
  // Drop garantizado SOLO con hachas NO penalizadas. Con el hacha de madera
  // (multiplier < 1) la tala PUEDE quedar sin madera (menos probabilidad).
  if (obtainedRewards.length === 0 && rewards.length > 0 && bonusMultiplier >= 1.0) {
    obtainedRewards.push({ id: rewards[0].id, cantidad: this.rollGatherAmount(pickName) });
  }
  return obtainedRewards;
};

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

const createTextStyle_Ore = (oreKey) => {
  const color = oreRewards[oreKey]?.colorNotificacion || '#ffffff';
  return {
    fontFamily: 'Arial, sans-serif',
    fontSize: '18px',
    fontWeight: 'bold',
    fill: '#ffffff',
    stroke: '#000000',
    strokeThickness: 4,
    shadow: {
      offsetX: 2,
      offsetY: 2,
      color: '#000000',
      blur: 4,
      stroke: true,
      fill: true
    }
  };
};

// -----------------------------------------------------------------------------
// REGISTRO DE INTERACCIONES EN CADA SPRITE (MEJORADO CON CSRF Y ERROR HANDLING)
// -----------------------------------------------------------------------------
oreProps.forEach(prop => {
  const spr = this[prop];
  if (!spr) return;
  this.enablePixelPerfectInput(spr);

  spr.on('pointerdown', async (pointer) => {
    const canvas = this.sys.canvas;
    const isCanvasClick = pointer.event.target === canvas ||
                         pointer.event.target.tagName === 'container' ||
                         canvas.contains(pointer.event.target);
    if (!isCanvasClick) {
      console.log('DOM click ignored');
      return;
    }

    const treeKey = prop;
    const treeType = getTreeTypeFromKey(treeKey);

    // ---------- 0-bis. RECURSOS, ANTES DE NADA ----------
    // BUG (2026-08-05): con 0 de comida el contador seguía subiendo (1/7, 2/7…)
    // Y a la vez salía el aviso de que faltaba comida. Motivo: la comprobación
    // estaba DESPUÉS del `await getTreeLockState()`. Entre el clic y la
    // respuesta del servidor pasan cientos de milisegundos, y la comida se
    // regenera sola; así que un clic entraba con 1 de comida (avanzaba el
    // contador y la dejaba en 0) y el siguiente, ya en cola, se encontraba con
    // 0 y avisaba. Los dos efectos se veían casi a la vez.
    //
    // Comprobándolo aquí, de forma SÍNCRONA y antes de cualquier espera, el
    // clic sin recursos no llega ni a consultar al servidor: o avanza, o
    // avisa, nunca las dos cosas.
    //
    // Excepción: si lo que se está tocando es un TRONCO (árbol ya talado y en
    // respawn), interesa más el aviso de "vuelve a crecer en X" que el de los
    // recursos, así que se deja pasar para que el paso 1 dé ese mensaje.
    const _esTronco = !!(this.treeStumps && this.treeStumps[treeKey]);
    if (!_esTronco && !this._hayRecursosParaTrabajar('chop')) return;

    // ---------- 0. Guard SÍNCRONO anti-doble-disparo ----------
    // Los clicks rapidísimos disparaban varios handlers que se solapaban en sus
    // `await` (getTreeLockState) y hacían "buguear" el contador (p. ej. 1/6 → 1/8).
    // Este candado rechaza, de forma síncrona y ANTES de cualquier await, los
    // clicks al mismo árbol demasiado seguidos (120ms). No cambia el cooldown de
    // juego (300-450ms), solo impide el solapamiento.
    const _nowGuard = Date.now();
    this._treeClickGuard = this._treeClickGuard || {};
    if (_nowGuard - (this._treeClickGuard[treeKey] || 0) < 120) return;
    this._treeClickGuard[treeKey] = _nowGuard;

    // ---------- 1. Verificar bloqueo global ----------
    // Va ANTES de validar el hacha: si lo que se está picando es un tronco, lo
    // útil es saber cuánto falta para el respawn, no que "necesitas un hacha".
    const { isLocked, lockedUntil } = await getTreeLockState(treeKey);
    if (isLocked) {
      // Red de seguridad por si el aviso 'treeLocked' no llegó (desconexión
      // momentánea, o el árbol lo taló alguien mientras cargábamos): al
      // descubrir aquí que está bloqueado se pone el tronco y se limpia el
      // progreso local, en vez de dejar el árbol entero con un contador colgado.
      this._abortLocalProgress(treeKey, { tipo: 'tree' });
      this.showTreeStump(treeKey);
      if (lockedUntil) {
        const restante = this.formatRespawnRemaining(lockedUntil.getTime() - Date.now());
        this.notifications.show(
          `This tree was chopped down. It will grow back in ${restante}`,
          "warning",
          { icon: '🌱' }
        );
      } else {
        this.notifications.show('This tree was chopped down and has not grown back yet', "warning");
      }
      return;
    }

    // ---------- 2. Validar hacha ----------
    if (!isPickSelected_Ore()) {
      this.notifications.show("You need an axe to chop", "error");
      return;
    }
    const pickName = getSelectedPickName_Ore();
    if (!isValidAxeForTree(pickName, treeKey)) {
      // Todas las hachas sirven; el único caso inválido es no tener un hacha.
      this.notifications.show('You need an axe to chop this tree', "error");
      return;
    }

    // ---------- 3. Cooldown humano ----------
    const now = Date.now();
    const last = this.lastTreeClick[treeKey] || 0;
    const cooldown = HUMAN_COOLDOWN.getRandom();
    if (now - last < cooldown) {
      console.log(`Human cooldown: wait ${cooldown - (now - last)}ms`);
      return;
    }
    this.lastTreeClick[treeKey] = now;

    // ---------- 4. Recursos (segunda comprobación) ----------
    // Se repite tras el await por si el agua o la comida bajaron mientras el
    // servidor respondía (otra acción en curso, el desgaste por caminar…).
    if (!this._hayRecursosParaTrabajar('chop')) return;

    // ---------- 5. Inicializar/actualizar progreso ----------
    const oreInfo = oreRewards[treeKey] || { nombre: "Tree", colorNotificacion: "#ffffff" };
    if (!this.oreMineState[treeKey]) {
      const range = getPickClickRange_Ore(pickName, treeKey);
      const required = Phaser.Math.Between(range.min, range.max);
      this.oreMineState[treeKey] = {
        required,
        progress: 0,
        pickUsed: pickName,
        oreType: treeKey,
        oreName: oreInfo.nombre
      };
      console.log(`🪨 ${oreInfo.nombre}: need ${required} clicks (using ${pickName})`);
    } else {
      // Ajuste por cambio de pico
      const currentPick = getSelectedPickName_Ore();
      const originalPick = this.oreMineState[treeKey].pickUsed;
      if (currentPick !== originalPick) {
        console.log(`Pick changed: ${originalPick} -> ${currentPick}`);
        const newRange = getPickClickRange_Ore(currentPick, treeKey);
        const originalRequired = this.oreMineState[treeKey].required;
        const originalProgress = this.oreMineState[treeKey].progress;
        const progressRatio = originalProgress / originalRequired;
        const newRequired = Math.max(
          newRange.min,
          Math.min(newRange.max, Math.round(originalRequired * (currentPick === 'hacha_de_madera' ? 1.2 : 0.8)))
        );
        const newProgress = Math.min(newRequired - 1, Math.round(newRequired * progressRatio));
        this.oreMineState[treeKey] = {
          required: newRequired,
          progress: Math.max(0, newProgress),
          pickUsed: currentPick,
          oreType: treeKey,
          oreName: oreInfo.nombre
        };
        console.log(`Progress adjusted: ${this.oreMineState[treeKey].progress}/${this.oreMineState[treeKey].required} (with ${currentPick})`);
      }
    }

    // ---------- 6. Consumir recursos y avanzar progreso ----------
    this.actualizarBarraAgua(this.aguaPorcentaje - 1);
    this.actualizarBarraComida(this.comidaPorcentaje - 1);
    this.oreMineState[treeKey].progress++;
    const s = this.oreMineState[treeKey];
    console.log(`Chop ${oreInfo.nombre}: click ${s.progress}/${s.required} (using ${s.pickUsed})`);
    this.queuedAction && this.queuedAction({ type: 'forSpam2' });
    this.playSFX('cortando_sound');

    // Mostrar texto de progreso
    const txtDepth = spr.depth + 51;
    const indDepth = spr.depth + 50;

    if (!this.oreTexts[treeKey]) {
      this.oreTexts[treeKey] = this.add.text(
        spr.x + 80, spr.y - 155,
        `${s.progress}/${s.required}`,
        createTextStyle_Ore(treeKey)
      );
      this.oreTexts[treeKey].setOrigin(0.5).setDepth(txtDepth);

      const indicator = this.add.rectangle(
        spr.x + 80, spr.y - 140,
        30, 5,
        parseInt(oreInfo.colorNotificacion.replace('#', '0x'))
      );
      indicator.setOrigin(0.5).setDepth(indDepth);
      this.oreTexts[treeKey].indicator = indicator;
    } else {
      this.oreTexts[treeKey].setText(`${s.progress}/${s.required}`);
      this.oreTexts[treeKey].setPosition(spr.x + 80, spr.y - 155);
      if (this.oreTexts[treeKey].indicator) {
        this.oreTexts[treeKey].indicator.setPosition(spr.x + 80, spr.y - 140);
      }
    }

    // ---------- 7. Si se completa la tala ----------
    if (s.progress >= s.required) {
      console.log(`✅ Chopped ${oreInfo.nombre}`);

      // FIX (transacciones duplicadas al cortar rápido):
      // Deshabilitar el sprite y borrar el progreso AQUÍ MISMO, de forma
      // SÍNCRONA, antes de tocar ejecutarDivision o cualquier otro "await".
      // Antes esto pasaba al final del bloque, después de varias esperas
      // (la cola de blockchain, verificarRompimiento, updateDeforestationPercent,
      // lockTree...). Mientras esas esperas corrían, el árbol seguía
      // interactivo, así que cada click extra volvía a entrar aquí
      // (progress seguía subiendo, ej. 14/8) y encolaba una llamada a
      // ejecutarDivision por cada click de más. Al terminar la transacción
      // que ya estaba en curso, todas esas llamadas duplicadas se
      // disparaban una tras otra. Al deshabilitar el sprite de inmediato,
      // ningún click posterior puede volver a entrar a este bloque.
      this.disableSpriteInput(spr);
      // El árbol desaparece y se muestra su tronco hasta que termine el respawn
      showTreeStump(spr, treeKey);
      if (this.oreTexts[treeKey]) {
        this.oreTexts[treeKey].destroy();
        if (this.oreTexts[treeKey].indicator) this.oreTexts[treeKey].indicator.destroy();
        delete this.oreTexts[treeKey];
      }
      delete this.oreMineState[treeKey];

      this.playSFX('cortado_sound');

      // Tutorial (paso 4): contar pinos cortados (ya con el sprite deshabilitado,
      // para que al reapuntar el camino se elija el SIGUIENTE pino, no éste).
      this._onTutorialPineCut && this._onTutorialPineCut(treeType);

      // Otorgar experiencia por talar (mismo criterio que ya usa la minería)
      this.nivel_exp = (this.nivel_exp || 0) + 50;

      // GATHER_SERVER (anti-trampa): si está activo, el SERVIDOR valida el nodo,
      // lo bloquea, decide y ACUÑA la recompensa (el cliente no acuña). Si está
      // apagado (default), se mantiene el flujo cliente de siempre.
      let rewards;
      if (this.GATHER_SERVER) {
        rewards = await this._gatherClaim(treeKey, pickName);
      } else {
        // oreRewards ya tiene el item correcto por sprite (madera_pinos/seca/con_hojas).
        // Se manda una transacción por recompensa (tipo + maxStack de ItemDefinitions).
        rewards = getMultipleRewards_Ore(treeKey, pickName);
        for (const reward of rewards) {
          const defMadera = this.ItemDefinitions ? this.ItemDefinitions[reward.id] : null;
          if (defMadera && defMadera.tipo) {
            await this.ejecutarDivision(defMadera.tipo, reward.id, defMadera.maxStack || 50, reward.cantidad);
          } else {
            console.warn(`Sin ItemDefinitions.tipo para '${reward.id}', se agrega off-chain`);
            this.addItemWithCheck(reward.id, reward.cantidad);
          }
        }
      }

      if (rewards.length === 0) {
        // Con hacha de madera (o baja) a veces no cae madera.
        this.notifications.show(`Chopped ${oreInfo.nombre}! But you got no wood this time.`, "warning", { icon: '🪓' });
      } else {
        const rewardNames = rewards.map(r => `${r.cantidad}x ${this._getFruitDisplayNameEN(r.id)}`).join(', ');
        this.notifications.show(`Chopped ${oreInfo.nombre}!\nObtained: ${rewardNames}`, "success", {
          customColor: oreInfo.colorNotificacion,
          icon: '🪓'
        });
      }

      // ---------- 8. Desgastar la herramienta usada ----------
      // ---------- 8. Desgastar herramienta seleccionada ----------
      if (this.STATE.selectedItem && this.STATE.selectedItem.idx) {
        await this.verificarRompimiento(this.STATE.selectedItem);
      }

      // ---------- 9. Actualizar porcentaje global y bloquear árbol ----------
      if (treeType) {
        const increment = TREE_TYPE_CONFIG[treeType]?.percentIncrement || 1;
        const deforestSuccess = await updateDeforestationPercent(treeType, increment);
        if (!deforestSuccess) {
          this.notifications.show('Could not update deforestation. The tree was not locked.', 'error');
          hideTreeStump(treeKey);
          return;
        }

        const serverLockedUntil = await lockTree(treeKey, treeType);
        if (!serverLockedUntil) {
          this.notifications.show('Could not lock the tree on the server.', 'error');
          hideTreeStump(treeKey);
          return;
        }

        // El árbol ya está bloqueado en el SERVIDOR, así que se vuelve a hacer
        // clickeable: a partir de aquí el paso 2 corta cualquier intento y
        // avisa cuánto falta para el respawn. (Durante los awaits anteriores
        // seguía deshabilitado, que es lo que evita las transacciones dobles.)
        this.enablePixelPerfectInput(spr);

        // Programar la reactivación usando la fecha del servidor
        const remainingMs = serverLockedUntil.getTime() - Date.now();
        const unlockTreeSprite = async (sprRef, key) => {
          try {
            const state = await getTreeLockState(key);
            if (!state.isLocked) {
              const liveSpr = this[key];
              if (liveSpr && liveSpr.active) {
                this.enablePixelPerfectInput(liveSpr);
                console.log(`🌲 Árbol ${key} desbloqueado automáticamente`);
              }
              // Termina el respawn: quitar el tronco y volver a mostrar el árbol
              hideTreeStump(key);
            }
          } catch (e) {
            // Si falla la consulta, desbloquear de todas formas
            const liveSpr = this[key];
            if (liveSpr && liveSpr.active) this.enablePixelPerfectInput(liveSpr);
            hideTreeStump(key);
          }
        };
        if (remainingMs > 0) {
          setTimeout(() => unlockTreeSprite(spr, treeKey), remainingMs);
        } else {
          unlockTreeSprite(spr, treeKey);
        }
      } else {
        // Árbol no clasificado: bloqueo temporal local sin transparencia
        // (el sprite ya fue deshabilitado al inicio del bloque, ver FIX arriba)
        setTimeout(() => {
          if (spr && spr.active) this.enablePixelPerfectInput(spr);
          hideTreeStump(treeKey);
        }, 60000);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// FUNCIONES DE RESET Y DEBUG (originales)
// -----------------------------------------------------------------------------
const resetOreMine = (oreKey) => {
  if (this.oreMineState[oreKey]) delete this.oreMineState[oreKey];
  if (this.oreTexts[oreKey]) {
    this.oreTexts[oreKey].destroy();
    if (this.oreTexts[oreKey].indicator) this.oreTexts[oreKey].indicator.destroy();
    delete this.oreTexts[oreKey];
  }
  console.log(`🔄 Tree ${oreKey} reset locally`);
};

const getOreMiningStats = () => {
  const stats = {};
  oreProps.forEach(prop => {
    if (this.oreMineState[prop]) {
      const oreInfo = oreRewards[prop] || { nombre: 'Unknown' };
      stats[prop] = {
        ...this.oreMineState[prop],
        progressPercentage: Math.round((this.oreMineState[prop].progress / this.oreMineState[prop].required) * 100),
        oreName: oreInfo.nombre,
        rewards: oreInfo.items
      };
    }
  });
  return stats;
};

const debugForceReward_Ore = (oreKey, itemId, cantidad = 1) => {
  if (!oreRewards[oreKey]) {
    console.error(`Tree ${oreKey} not found`);
    return false;
  }
  this.ejecutarDivision(itemId, "madera", 5, cantidad);
  console.log(`[DEBUG] Forced: ${cantidad}x ${itemId} from ${oreKey}`);
  return true;
};

window.debugOreMining = {
  resetOreMine,
  getOreMiningStats,
  debugForceReward_Ore,
  oreRewards,
  getPickClickRange_Ore
};

console.log('✅ Chopping system loaded with human cooldown and global respawn');
console.log('📊 Tree types:', Object.keys(TREE_TYPE_CONFIG));








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

                      // Event listener simple
















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
    






  //this.makeDraggable('hudReputacion');


  this.makeElementDraggable('hudReputacion');
  this.makeElementDraggable('hudEstadisticas');
  this.makeElementDraggable("inventory-panel");








    this.profileImage = document.getElementById("player-image");
    this.hubInfo = document.getElementById("hub-info");

    // Atamos el método para que funcione bien con add/removeEventListener
    this.toggleHubInfo = this.toggleHubInfo.bind(this);

    // Cargar estado guardado
    
    this.loadState();

    // Añadir listener
    this.profileImage.addEventListener("click", this.toggleHubInfo);



    //this._onResize = this.resize.bind(this);
    //this.scale.on('resize', this._onResize);
    //this.resize({ width: this.scale.width, height: this.scale.height });










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
// SOCKET.IO CON SALA ESPECÍFICA PARA game
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
      console.log("🎮 Escena game creada");
      
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



    // --- Mapeo de teclas 1..7 y escucha de keydown ---
    this.input.keyboard.on('keydown', (event) => {
      // event.key viene como '1','2',... en la mayoría de navegadores
      const n = parseInt(event.key, 10);
      if (!isNaN(n) && n >= 1 && n <= 7) {
        const idx = n - 1;
        this.selectQuickSlot(idx);
      }
    });





/*
    this.cropTypes = {
  Semillax: {
    id: 'Semillax',
    name: 'Semilla Básica',
    type: 'semilla',
    growthStages: 4,
    growthTime: 180,
    waterRequired: true,
    images: {
      stage1: 'tierra_seca_plant',
      stage2: 'tierra_mojada_plant', 
      stage3: 'tierra_mojada_plant2',
      stage4: 'tierra_mojada_plant3'
    },
    rewards: {
      item: 'mineral_piedra',
      quantity: 2
    }
  },
  SemillaRapida: {
    id: 'SemillaRapida',
    name: 'Semilla Rápida',
    type: 'semilla',
    growthStages: 3,
    growthTime: 90,
    waterRequired: true,
    images: {
      stage1: 'tierra_seca_plant',
      stage2: 'tierra_mojada_plant',
      stage3: 'tierra_mojada_plant2'
    },
    rewards: {
      item: 'mineral_piedra',
      quantity: 1
    }
  },
  ArbolGrande: {
    id: 'ArbolGrande',
    name: 'Árbol Grande',
    type: 'semilla',
    growthStages: 5,
    growthTime: 300,
    waterRequired: true,
    images: {
      stage1: 'tierra_seca_plant',
      stage2: 'tierra_mojada_plant',
      stage3: 'tierra_mojada_plant2',
      stage4: 'tierra_mojada_plant3',
      stage5: 'arbol_grande'
    },
    rewards: {
      item: 'Madera_pinos',
      quantity: 5
    }
  }
};
*/

  this.waitForSocket(() => {
    this.initCropSystem();
  }, 10);



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

    // La exp tiene su propia factura en el contrato (tabla `exp`), igual que
    // oro y plata. La exp se gana en muchos sitios distintos, así que en vez de
    // avisar en cada uno se comprueba aquí y solo se manda cuando cambió — si
    // se llamara a set() en cada tick de 400 ms el debounce nunca dispararía.
    this._syncExp();

  }
});



    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        document.getElementById('info-text-left').textContent = `${this.moneda}`;
        document.getElementById('info-text-right').textContent = `${this.moneda_plata}`;
      }
    });









    
// -------------------- SISTEMA DE CRAFTEO REAL -----------------------------

this.sprite_npc2.setInteractive({ useHandCursor: true });

// Crear el graphics que dibujará el borde (vacío al principio)
const borde1 = this.add.graphics();
borde1.setDepth(1000); // para asegurarlo por encima de todo

// Flag para saber si estamos sobre la sprite
let hovering1 = false;

// Cuando el puntero entra: dibujar borde usando getBounds() (coordenadas del mundo)
this.sprite_npc2.on('pointerover', () => {
  hovering1 = true;
  const b = this.sprite_npc2.getBounds();
  const margin = 3; // margen en píxeles alrededor de la sprite
  borde1.clear();
  borde1.lineStyle(3, 0xFFFF00, 1); // grosor, color, alpha
  // dibujamos un rectángulo con margen
  borde1.strokeRect(b.x - margin, b.y - margin, b.width + margin * 2, b.height + margin * 2);
});

// Cuando el puntero sale: limpiar el borde
this.sprite_npc2.on('pointerout', () => {
  hovering1 = false;
  borde1.clear();
});

// Inicializar el sistema de crafteo REAL
this.craftingSystem = new CraftingSystem(this);

// Evento al hacer clic en el NPC herrero
this.sprite_npc2.on('pointerdown', (pointer) => {
  this.craftingSystem.show();
});

// Opcional: Asignar tecla C para abrir/cerrar
this.input.keyboard.on('keydown-C', () => {
  this.craftingSystem.toggle();
});






  this.initWaterCollectionSystem();



this.debugInventory();




// EN EL MÉTODO create(), DESPUÉS de crear los sprites de basura:
if (this.bote_de_basura_pngx1) {
  console.log('🗑️ Configurando bote de basura 1');
  
  this.bote_de_basura_pngx1.setInteractive({ 
    useHandCursor: true,
    pixelPerfect: true,
    cursor: 'pointer'
  });
  
  // Efecto hover
  this.bote_de_basura_pngx1.on('pointerover', () => {
    this.bote_de_basura_pngx1.setTint(0x888888);
  });
  
  this.bote_de_basura_pngx1.on('pointerout', () => {
    this.bote_de_basura_pngx1.clearTint();
  });
  
  // Al hacer clic
  this.bote_de_basura_pngx1.on('pointerdown', (pointer) => {
    // Verificar que sea un clic del juego, no del DOM
    if (pointer.event.target.tagName === 'CANVAS') {
      this.openTrashHub();
    }
  });
}

if (this.bote_de_basura_pngx2) {
  console.log('🗑️ Configurando bote de basura 2');
  
  this.bote_de_basura_pngx2.setInteractive({ 
    useHandCursor: true,
    pixelPerfect: true,
    cursor: 'pointer'
  });
  
  // Efecto hover
  this.bote_de_basura_pngx2.on('pointerover', () => {
    this.bote_de_basura_pngx2.setTint(0x888888);
  });
  
  this.bote_de_basura_pngx2.on('pointerout', () => {
    this.bote_de_basura_pngx2.clearTint();
  });
  
  // Al hacer clic
  this.bote_de_basura_pngx2.on('pointerdown', (pointer) => {
    // Verificar que sea un clic del juego, no del DOM
    if (pointer.event.target.tagName === 'CANVAS') {
      this.openTrashHub();
    }
  });
}

// Inicializar el sistema de basura
this.initTrashSystem();



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
        
        // Red de seguridad: en vez de fiarse solo de la bandera cursorOverUI
        // (que depende de que Phaser emita 'gameobjectout', cosa que NO pasa si
        // el objeto bajo el cursor deja de ser interactivo o se oculta), se
        // recalcula en el momento del clic con un hit-test real. Es un solo
        // test por clic, no por frame.
        try {
            const bajoElCursor = this.input.hitTestPointer(pointer) || [];
            this.mouseMovement.cursorOverUI = bajoElCursor.length > 0;
        } catch (e) { /* si el hit-test falla, se conserva la bandera anterior */ }

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

// ── Etiqueta con el NOMBRE de la mascota (dashboard → nombre único) ──────
// Solo se muestra cuando el jugador ya fijó un nombre (≠ '---'). Se
// reposiciona cada frame en el update del perro, igual que el nombre del
// jugador (usuariox).
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

// ── Synchronously apply saved pet state BEFORE the async _loadPetData call ──
// This prevents a 1-frame flash of the dog when returning from tiendajuego
if (window.globalPetData) {
  this.petData = window.globalPetData;
  if (this.petData.equipped === false || this.petData.visible === false) {
    this.dog.sprite.setVisible(false);
    this.dog.shadowContainer.setVisible(false);
    if (this.dogNameText) this.dogNameText.setVisible(false);
  }
}












// Al final del create(), después de configurar los eventos de los árboles
this.loadTreeLockStates();
this.loadMineLockStates();
// …y quedar a la escucha de lo que talen o piquen los DEMÁS jugadores.
// Se espera al socket igual que initCropSystem: al final de create() todavía
// puede no estar conectado, y sin esta espera los listeners no se enlazaban.
this.waitForSocket(() => this.setupResourceLockSocket(), 20);

// Repintar los nombres (jugador, NPCs, mascota) cuando la fuente pixel esté
// realmente cargada — ver refrescarTextosConFuente()
this.refrescarTextosConFuente();


}




// =============================================================================
// ÁRBOLES Y MINERALES DE LOS DEMÁS JUGADORES (tiempo real)
// =============================================================================
// El estado del mapa (qué árbol está talado, qué mineral picado) se leía UNA
// sola vez, al entrar a la escena, con loadTreeLockStates/loadMineLockStates.
// Por eso, si otro jugador talaba un árbol mientras vos ya estabas dentro, vos
// seguías viendo el árbol entero durante todo el respawn y solo aparecía el
// tronco si recargabas la página.
//
// El servidor ahora emite 'treeLocked' / 'mineLocked' a todos al bloquear el
// recurso (ver /api/tree/lock y /api/mine/lock en server2.js). Aquí se aplica
// el mismo efecto visual que ya se usaba al cargar, y se programa la vuelta del
// recurso con el lockedUntil que manda el servidor.
/**
 * Cancela el progreso LOCAL sobre un recurso que ya tumbó otro jugador.
 *
 * El caso: vas 3/6 golpes en un árbol y otro jugador lo termina. El recurso ya
 * está bloqueado en el servidor, pero en tu pantalla se quedaba el contador
 * "3/6" flotando para siempre y `oreMineState` conservaba los 3 golpes, así que
 * cuando el árbol reaparecía seguías desde 3 en vez de empezar de cero. Esto
 * limpia las tres cosas: el texto de progreso, su indicador y el estado.
 */
_abortLocalProgress(key, { tipo = 'tree' } = {}) {
  const textos = tipo === 'mine' ? this.mineTexts : this.oreTexts;
  const estado = tipo === 'mine' ? this.mineState : this.oreMineState;

  if (textos && textos[key]) {
    if (textos[key].indicator) textos[key].indicator.destroy();
    textos[key].destroy();
    delete textos[key];
  }
  if (estado && estado[key]) delete estado[key];
}

setupResourceLockSocket() {
  if (!this.socket || this._resourceLockSocketBound) return;
  this._resourceLockSocketBound = true;

  // Los bloqueos permanentes (deforestación al 100%: lockedUntil año 3000) no
  // se reprograman. Un delayedCall con esa distancia desborda y se dispararía
  // de inmediato, devolviendo el árbol que debía quedarse talado.
  const MAX_ESPERA = 24 * 60 * 60 * 1000;
  const restaurarEn = (ms, fn) => {
    if (!(ms > 0) || ms > MAX_ESPERA) return;
    this.time.delayedCall(ms, fn);
  };

  this.socket.on('treeLocked', ({ treeKey, lockedUntil }) => {
    try {
      const spr = this[treeKey];
      if (!spr) return;
      const hasta = new Date(lockedUntil).getTime();
      if (!(hasta > Date.now())) return;
      console.log(`🌲 Otro jugador taló ${treeKey}`);
      // Si yo estaba a medio talar ese árbol, mi progreso ya no vale: se borra
      // el contador de la pantalla y el estado, para no quedarme con un "3/6"
      // colgado ni reanudar desde ahí cuando el árbol vuelva.
      this._abortLocalProgress(treeKey, { tipo: 'tree' });
      this.showTreeStump(treeKey);
      // Si el tutorial estaba señalando JUSTO ese árbol, se reapunta al
      // siguiente pino disponible. Antes el marcador se quedaba clavado en un
      // tocón que ya no se podía talar, porque solo se reapuntaba cuando lo
      // cortabas TÚ, no cuando se lo llevaba otro jugador.
      if (this.tutorial === 4) this._aimAtNearestPine && this._aimAtNearestPine();
      restaurarEn(hasta - Date.now(), () => {
        this.hideTreeStump(treeKey);
        const live = this[treeKey];
        if (live && live.active) this.enablePixelPerfectInput(live);
      });
    } catch (e) { console.warn('treeLocked:', e.message || e); }
  });

  // El backend recalcula el nivel de la mascota al terminar cada batalla.
  // Antes solo se leía en /api/load, así que tu propio perro seguía mostrando
  // el nivel viejo hasta que recargabas la página.
  this.socket.on('petLevelUpdate', ({ petLevel }) => {
    const n = Math.max(1, Number(petLevel) || 1);
    // Compartido con la tienda: sin esto, al cambiar de escena el perro volvía
    // a mostrarse en Lv.1 hasta que /api/load respondiera (o nunca).
    window.globalPetLevel = n;
    if (this.petLevel === n) return;
    this.petLevel = n;
    console.log(`🐶 Nivel de la mascota actualizado: ${n}`);
    if (typeof this._updateDogNameLabel === 'function') this._updateDogNameLabel();
  });

  this.socket.on('mineLocked', ({ mineKey, lockedUntil }) => {
    try {
      const spr = this[mineKey];
      if (!spr) return;
      const hasta = new Date(lockedUntil).getTime();
      if (!(hasta > Date.now())) return;
      console.log(`⛏️ Otro jugador picó ${mineKey}`);
      this._abortLocalProgress(mineKey, { tipo: 'mine' });
      // Mismo criterio que loadMineLockStates: el mineral picado no se puede
      // volver a picar hasta que reaparezca (los árboles sí siguen clickeables
      // a propósito, para poder avisar cuánto falta para el respawn).
      this.disableSpriteInput(spr);
      this.hideMinedMineral(mineKey);
      restaurarEn(hasta - Date.now(), () => {
        this.showMinedMineral(mineKey);
        const live = this[mineKey];
        if (live && live.active) this.enablePixelPerfectInput(live);
      });
    } catch (e) { console.warn('mineLocked:', e.message || e); }
  });

  // Verificadores, advertencias y baneos (submenú de clic derecho sobre otro
  // jugador). Se engancha aquí porque es donde el socket ya está listo.
  this._registrarEventosModeracion();
  // Detector de respaldo del doble toque sobre otros jugadores.
  this._activarDeteccionToqueJugadores();

  // Al salir de la escena hay que soltar los listeners: si no, al volver se
  // acumulan y cada tala se aplicaría varias veces.
  const soltar = () => {
    try {
      this.socket.off('treeLocked');
      this.socket.off('mineLocked');
      this.socket.off('petLevelUpdate');
      this.socket.off('verifierChallenge');
      this.socket.off('verifierResult');
      this.socket.off('verifierTimeout');
      this.socket.off('moderationWarning');
      this.socket.off('accountBanned');
      this.socket.off('accountSuspended');
    } catch (_) {}
    this._eventosModeracionListos = false;
    this._resourceLockSocketBound = false;
    this._cerrarMenuJugador();
  };
  this.events.once('shutdown', soltar);
  this.events.once('destroy',  soltar);
}

async loadMineLockStates() {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/mine/locks/active`, {
      method: 'GET'
    });
    if (!response.ok) return;
    const locks = await response.json();
    locks.forEach(lock => {
      const spr = this[lock.mineKey];
      if (!spr) return;
      const lockedUntil = new Date(lock.lockedUntil);
      if (lockedUntil > new Date()) {
        this.disableSpriteInput(spr);
        // Al recargar, un mineral todavía en respawn sigue oculto y sin su
        // colisión (igual que los troncos de los árboles).
        this.hideMinedMineral(lock.mineKey);
        const remaining = lockedUntil.getTime() - Date.now();
        const scheduleUnlock = (sprRef, key, ms) => {
          setTimeout(async () => {
            try {
              const chk = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/mine/state/${key}`, { method: 'GET' }
              );
              const data = await chk.json();
              const stillLocked = data.lockedUntil && new Date(data.lockedUntil) > new Date();
              if (!stillLocked) {
                const liveSpr = this[key];
                if (liveSpr && liveSpr.active) {
                  this.enablePixelPerfectInput(liveSpr);
                  console.log(`⛏️ Mina ${key} desbloqueada automáticamente (al cargar)`);
                }
                this.showMinedMineral(key);
              } else {
                const newRemaining = new Date(data.lockedUntil).getTime() - Date.now();
                if (newRemaining > 0) scheduleUnlock(sprRef, key, newRemaining);
              }
            } catch (e) {
              const liveSpr = this[key];
              if (liveSpr && liveSpr.active) this.enablePixelPerfectInput(liveSpr);
              this.showMinedMineral(key);
            }
          }, ms);
        };
        scheduleUnlock(spr, lock.mineKey, remaining);
      }
    });
  } catch (error) {
    console.error('Error cargando bloqueos activos de minas:', error);
  }
}


async loadTreeLockStates() {
  try {
    const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/tree/locks/active`, {
      method: 'GET'
    });
    if (!response.ok) return;
    const locks = await response.json();
    locks.forEach(lock => {
      const spr = this[lock.treeKey];
      if (!spr) return;
      const lockedUntil = new Date(lock.lockedUntil);
      if (lockedUntil > new Date()) {
        // Al recargar la página, un árbol todavía en respawn debe verse como
        // TRONCO, no como árbol entero: el estado visual se reconstruye desde
        // los bloqueos que devuelve el servidor.
        this.showTreeStump(lock.treeKey);

        // Se deja clickeable a propósito: al picarlo, el handler de tala
        // consulta el bloqueo y avisa cuánto falta para el respawn.
        this.enablePixelPerfectInput(spr);
        const remaining = lockedUntil.getTime() - Date.now();
        // Programar desbloqueo automático sin necesidad de recargar
        const scheduleUnlock = (sprRef, key, ms) => {
          setTimeout(async () => {
            try {
              const chk = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/tree/state/${key}`, { method: 'GET' }
              );
              const data = await chk.json();
              const stillLocked = data.lockedUntil && new Date(data.lockedUntil) > new Date();
              if (!stillLocked) {
                const liveSpr = this[key];
                if (liveSpr && liveSpr.active) {
                  this.enablePixelPerfectInput(liveSpr);
                  console.log(`🌲 Árbol ${key} desbloqueado automáticamente (al cargar)`);
                }
                this.hideTreeStump(key); // termina el respawn: vuelve el árbol
              } else {
                // Todavía bloqueado, reprogramar con el tiempo restante real
                const newRemaining = new Date(data.lockedUntil).getTime() - Date.now();
                if (newRemaining > 0) scheduleUnlock(sprRef, key, newRemaining);
              }
            } catch (e) {
              // Si falla la consulta, desbloquear de todas formas para no dejar árbol bloqueado para siempre
              const liveSpr = this[key];
              if (liveSpr && liveSpr.active) this.enablePixelPerfectInput(liveSpr);
            }
          }, ms);
        };
        scheduleUnlock(spr, lock.treeKey, remaining);
      }
    });
  } catch (error) {
    console.error('Error cargando bloqueos activos:', error);
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
        this.player.anims.stop();
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

        // NOTA: aquí ya NO se llama a anims.play(). Antes este bloque
        // reproducía una animación y el bloque de "Decisión ÚNICA" (que corre
        // después de resolver colisiones) reproducía OTRA en el mismo frame;
        // con play(key, true) dos claves distintas por frame reinician la
        // animación en el frame 0 una y otra vez → se veía congelada al
        // colisionar en diagonal con el mouse. La dirección hacia el cursor
        // queda guardada en mouseMovement.directionX/Y y la decisión final
        // (solo 'left'/'right' en modo mouse) se toma una única vez abajo.

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


















waitForSocket(callback, maxAttempts = 10, attempt = 0) {
  if (this.socket && this.socket.connected) {
    console.log('✅ Socket disponible, ejecutando callback');
    callback();
  } else if (attempt < maxAttempts) {
    const delay = attempt === 0 ? 100 : 500; // Primer intento más rápido
    console.log(`⏳ Esperando socket (${attempt + 1}/${maxAttempts})...`);
    this.time.delayedCall(delay, () => {
      this.waitForSocket(callback, maxAttempts, attempt + 1);
    });
  } else {
    console.error('❌ No se pudo establecer conexión con el socket después de múltiples intentos');
    // Intentar de todos modos, pero con manejo de errores
    this.initCropSystem();
  }
}







// Añade en GameScene (en el create() o como método)
debugInventory() {
  console.log('=== INVENTARIO COMPLETO ===');
  
  // Slots principales
  console.log('📦 Slots principales (40):');
  this.STATE.slots.forEach((slot, i) => {
    if (slot) {
      console.log(`  [${i}] ID: ${slot.id}, Quantity: ${slot.quantity || 1}, Tipo: ${typeof slot}`);
    }
  });
  
  // Quick slots
  console.log('⚡ Quick slots (7):');
  this.STATE.quickSlots.forEach((slot, i) => {
    if (slot) {
      console.log(`  [${i}] ID: ${slot.id}, Quantity: ${slot.quantity || 1}, Tipo: ${typeof slot}`);
    }
  });
  
  // Chest slots
  console.log('🏺 Chest slots (40):');
  if (this.STATE.chestSlots) {
    this.STATE.chestSlots.forEach((slot, i) => {
      if (slot) {
        console.log(`  [${i}] ID: ${slot.id}, Quantity: ${slot.quantity || 1}, Tipo: ${typeof slot}`);
      }
    });
  }
}



// ============================================================
// FUNCIONES PARA CRAFTEO REAL
// ============================================================

/**
 * Remover una cantidad específica de un ítem del inventario
 */
removeItemFromInventory(itemId, quantity) {
  let remaining = quantity;
  
  console.log(`🗑️ Removiendo ${quantity} de ${itemId} del inventario`);
  
  // Orden de prioridad para remover:
  // 1. Slots normales
  // 2. Quick slots
  // 3. Slots del cofre (si quieres permitirlo)
  
  // Primero remover de los slots normales
  for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
    if (this.STATE.slots[i] && this.STATE.slots[i].id === itemId) {
      const slot = this.STATE.slots[i];
      
      if (slot.quantity > remaining) {
        slot.quantity -= remaining;
        remaining = 0;
        console.log(`   - Slot ${i}: reducido a ${slot.quantity}`);
      } else {
        remaining -= slot.quantity;
        this.STATE.slots[i] = null;
        console.log(`   - Slot ${i}: eliminado completamente`);
      }
    }
  }
  
  // Si aún falta, remover de los quick slots
  for (let i = 0; i < this.STATE.quickSlots.length && remaining > 0; i++) {
    if (this.STATE.quickSlots[i] && this.STATE.quickSlots[i].id === itemId) {
      const slot = this.STATE.quickSlots[i];
      
      if (slot.quantity > remaining) {
        slot.quantity -= remaining;
        remaining = 0;
        console.log(`   - Quick Slot ${i}: reducido a ${slot.quantity}`);
      } else {
        remaining -= slot.quantity;
        this.STATE.quickSlots[i] = null;
        console.log(`   - Quick Slot ${i}: eliminado completamente`);
      }
    }
  }
  
  // Si aún falta y quieres permitir usar el cofre, remover de los slots del cofre
  if (this.STATE.chestSlots && remaining > 0) {
    for (let i = 0; i < this.STATE.chestSlots.length && remaining > 0; i++) {
      if (this.STATE.chestSlots[i] && this.STATE.chestSlots[i].id === itemId) {
        const slot = this.STATE.chestSlots[i];
        
        if (slot.quantity > remaining) {
          slot.quantity -= remaining;
          remaining = 0;
          console.log(`   - Chest Slot ${i}: reducido a ${slot.quantity}`);
        } else {
          remaining -= slot.quantity;
          this.STATE.chestSlots[i] = null;
          console.log(`   - Chest Slot ${i}: eliminado completamente`);
        }
      }
    }
  }
  
  // Reconstruir la UI del inventario
  this.rebuildPlayerInventoryFromState();
}

/**
 * Devolver materiales al inventario (si el crafteo falla)
 */
returnCraftingMaterials(ingredients) {
  console.log('🔄 Devolviendo materiales al inventario');
  
  for (const ingredient of ingredients) {
    this.addItemWithCheck(ingredient.id, ingredient.quantity);
  }
  
  // Reconstruir la UI del inventario
  this.rebuildPlayerInventoryFromState();
}

// === EN LA PARTE SUPERIOR DEL ARCHIVO, DESPUÉS DEL CONSTRUCTOR ===
// Agrega estas funciones:

// 1. FUNCIÓN PARA CONTAR RECURSOS EN TODOS LOS ALMACENES
countItemInAllStorage(itemId) {
  let total = 0;
  const searchItemId = itemId.toLowerCase().trim();
  
  // Función para contar en un array de slots
  const countInSlots = (slots) => {
    if (!Array.isArray(slots)) return 0;
    
    return slots.reduce((sum, slot) => {
      if (!slot || !slot.id) return sum;
      
      const slotItemId = String(slot.id).toLowerCase().trim();
      
      // Comparación flexible
      if (slotItemId === searchItemId || 
          slotItemId.includes(searchItemId) || 
          searchItemId.includes(slotItemId)) {
        
        const quantity = parseInt(slot.count || slot.quantity || slot.amount || 0);
        return sum + (isNaN(quantity) ? 0 : quantity);
      }
      return sum;
    }, 0);
  };
  
  // Contar en todos los almacenamientos disponibles
  if (this.STATE) {
    if (this.STATE.slots) total += countInSlots(this.STATE.slots);
    if (this.STATE.quickSlots) total += countInSlots(this.STATE.quickSlots);
    if (this.STATE.chestSlots) total += countInSlots(this.STATE.chestSlots);
    if (this.STATE.storageSlots) total += countInSlots(this.STATE.storageSlots);
  }
  
  // También buscar en inventario del personaje si existe
  if (this.player && this.player.inventory) {
    total += countInSlots(this.player.inventory);
  }
  
  return total;
}



// ── Helpers del sistema de nombre único (personaje y mascota) ────────────
// Un nombre está "fijado" cuando ya no es el placeholder '---'. Fijado una
// vez, no admite más cambios (el backend aplica la misma regla en /api/save).
_isNameSet(v) {
    return typeof v === 'string' && v.trim() !== '' && v.trim() !== '---';
}

// Refresca el estado visual (bloqueado/editable) de las dos filas de nombre
// del dashboard según los valores actuales.
_refreshNameLockUI() {
    // Se busca el elemento VIVO por id en vez de usar la referencia guardada:
    // this.settingsNameInput puede apuntar a un nodo que ya fue sustituido, y
    // entonces se bloqueaba/desbloqueaba un input que no está en la pantalla
    // mientras el visible se quedaba como estuviera (normalmente, deshabilitado).
    const lockRow = (inputId, btnId, hintId, value, etiqueta) => {
        const input = document.getElementById(inputId);
        const btn   = document.getElementById(btnId);
        const hint  = document.getElementById(hintId);
        const locked = this._isNameSet(value);
        if (input) {
            input.disabled = locked;
            // removeAttribute además de la propiedad: si el nodo venía de un
            // cloneNode con el atributo puesto, hay que quitarlo de verdad.
            if (locked) input.setAttribute('disabled', 'disabled');
            else        input.removeAttribute('disabled');
            input.value = locked ? value : '';
        }
        if (btn) {
            btn.disabled = locked;
            if (locked) btn.setAttribute('disabled', 'disabled');
            else        btn.removeAttribute('disabled');
        }
        if (hint) {
            hint.textContent = locked
                ? `🔒 ${etiqueta} fijado: "${value}" — definitivo`
                : '⚠️ Solo puedes elegirlo UNA vez — piénsalo bien.';
            hint.classList.toggle('dash-hint-locked_101', locked);
        }
    };

    lockRow('character-name', 'apply-name', 'character-name-hint', this.Username, 'Nombre de personaje');
    lockRow('pet-name', 'apply-pet-name', 'pet-name-hint', this.petName, 'Nombre de mascota');

    // Compatibilidad con el panel de tiendajuego (usa window._acttov como lock)
    window._acttov = this._isNameSet(this.Username) ? 1 : 0;
}

// Etiqueta que se muestra sobre el perro: nombre + NIVEL de la mascota.
// El nivel sube con las batallas (lo calcula el backend en cada combate y viaja
// en /api/load como `petLevel`).
//
// IMPORTANTE: el nivel se muestra AUNQUE la mascota todavía no tenga nombre.
// Antes la etiqueta entera se ocultaba mientras petName siguiera en '---', y
// como casi nadie le pone nombre al perro nada más entrar, el nivel no se veía
// nunca: ni el propio ni el de los demás jugadores. Sin nombre se muestra solo
// "Lv.N".
_dogLabelText(petName, petLevel) {
  const lvl = Math.max(1, Number(petLevel) || 1);
  return this._isNameSet(petName) ? `${petName} (Lv.${lvl})` : `Lv.${lvl}`;
}

// Etiqueta del jugador (propio o remoto): nombre + nivel del PERSONAJE.
// El nivel viaja en playerMove; si aún no llegó, se muestra solo el nombre en
// vez de inventar un "Lv.0" que no significa nada.
_playerLabelText(nombre, nivel) {
  const n = Number(nivel);
  const etiqueta = nombre || 'Jugador';
  return Number.isFinite(n) ? `${etiqueta} (Lv.${Math.max(0, Math.floor(n))})` : etiqueta;
}

// Sincroniza la etiqueta que flota sobre el perro (nombre y/o nivel).
_updateDogNameLabel() {
    if (!this.dogNameText) return;
    this.dogNameText.setText(this._dogLabelText(this.petName, this.petLevel));
    const dogVisible = !!(this.dog && this.dog.sprite && this.dog.sprite.visible);
    this.dogNameText.setVisible(dogVisible);
}

setupSettingsPanel() {
    // Referencias a elementos del panel
    this.settingsPanel = document.getElementById('hub-panel_101');
    this.settingsApplyBtn = document.getElementById('apply-name');
    this.settingsCloseBtn = document.getElementById('close-panel');
    this.settingsLogoutBtn = document.getElementById('logout-btn');
    this.settingsNameInput = document.getElementById('character-name');
    this.settingsLangSelect = document.getElementById('language-select');
    // Fila nueva del dashboard: nombre de la mascota
    this.settingsPetInput = document.getElementById('pet-name');
    this.settingsApplyPetBtn = document.getElementById('apply-pet-name');

    if (!this.settingsPanel || !this.settingsApplyBtn || !this.settingsNameInput) {
        // Si el DOM del dashboard todavía no está montado, ANTES se abandonaba
        // para siempre: el botón "Aplicar" se quedaba sin handler y el jugador
        // nunca podía fijar su nombre (uno de los motivos por los que a algunos
        // les fallaba al entrar por primera vez). Ahora se reintenta.
        this._settingsSetupTries = (this._settingsSetupTries || 0) + 1;
        console.warn(`⚠️ Panel de configuraciones aún no disponible (intento ${this._settingsSetupTries})`);
        if (this._settingsSetupTries <= 20) {
            setTimeout(() => this.setupSettingsPanel(), 500);
        }
        return;
    }
    this._settingsSetupTries = 0;

    // Los campos del dashboard son DOM persistente de game.html y ya no se
    // clonan al salir de la escena, así que hay que asegurarse de enganchar sus
    // listeners UNA sola vez: si no, cada entrada a GameScene añadiría otro
    // handler de 'input'/'keydown' sobre el mismo campo.
    // El estado visual (bloqueado/editable) SÍ se refresca siempre, más abajo.
    if (this.settingsNameInput._gfDashBound) {
        console.log('✅ Panel de configuraciones ya enganchado — solo se refresca');
        this._refreshNameLockUI();
        return;
    }
    this.settingsNameInput._gfDashBound = true;

    console.log('✅ Panel de configuraciones configurado');

    // NOMBRES: LETRAS + NÚMEROS, HASTA 15 CARACTERES (2026-08-04)
    // ------------------------------------------------------------------
    // Antes eran 10 caracteres y SOLO letras, así que al escribir "Ana99"
    // el campo se comía los dígitos y luego el botón "Aplicar" avisaba de
    // que el nombre no era válido. Ahora se admiten letras y dígitos, y el
    // límite sube a 15. Siguen fuera espacios, símbolos y etiquetas HTML
    // (que es lo que evita nombres raros e inyección). El mismo criterio
    // está en tiendajuego.js y en el servidor: si divergen, el servidor
    // recortaría el nombre y el jugador vería otro distinto al que puso.
    const NAME_MAX = 15;
    this.settingsNameInput.setAttribute('maxlength', String(NAME_MAX));
    if (this.settingsPetInput) this.settingsPetInput.setAttribute('maxlength', String(NAME_MAX));

    // Función para sanitizar nombre
    const sanitizeName = (raw) => {
        if (!raw) return '';
        let s = String(raw).normalize('NFC').trim();
        s = s.replace(/<[^>]*>/g, '');

        try {
            s = s.replace(/[^\p{L}\p{Nd}]/gu, '');   // letras + dígitos
        } catch (e) {
            s = s.replace(/[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñÜü]/g, '');
        }

        return s.slice(0, NAME_MAX);
    };
    
    // Evento para input de nombre
    this.settingsNameInput.addEventListener('input', (e) => {
        const clean = sanitizeName(e.target.value);
        if (e.target.value !== clean) {
            e.target.value = clean;
        }
    });
    
    // Eventos para manejar el foco del input y desactivar WASD
    this.settingsNameInput.addEventListener('focus', () => {
        console.log('📝 Input enfocado - controles WASD desactivados');
        // Asegurarse de que los controles están desactivados
        if (this.keys) {
            this.keys.left.enabled = false;
            this.keys.right.enabled = false;
            this.keys.up.enabled = false;
            this.keys.down.enabled = false;
            this.keys.leftArrow.enabled = false;
            this.keys.rightArrow.enabled = false;
            this.keys.upArrow.enabled = false;
            this.keys.downArrow.enabled = false;
        }
        this.input.keyboard.enabled = false;
    });
    
    this.settingsNameInput.addEventListener('blur', () => {
        console.log('📝 Input sin foco');
        // Nota: Los controles se reactivarán en hideSettingsPanel()
    });
    
    // Prevenir que eventos de teclado se propaguen a Phaser
    this.settingsNameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        // Permitir ESC para cerrar el panel
        if (e.key === 'Escape') {
            this.hideSettingsPanel();
        }
    });
    
    this.settingsNameInput.addEventListener('keyup', (e) => {
        e.stopPropagation();
    });
    
    // Eventos para el selector de idioma
    this.settingsLangSelect.addEventListener('focus', () => {
        console.log('🌍 Selector de idioma enfocado');
        this.input.keyboard.enabled = false;
    });
    
    this.settingsLangSelect.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            this.hideSettingsPanel();
        }
    });
    
    // Botón aplicar nombre de PERSONAJE — se puede fijar UNA sola vez.
    // Se usa .onclick (no addEventListener) para que las recreaciones de la
    // escena no acumulen handlers duplicados sobre el mismo botón del DOM.
    this.settingsApplyBtn.onclick = () => {
        // El mismo botón del dashboard también lo escucha el hubPanel de
        // tiendajuego. Si aquel ya atendió este clic (fija el nombre y guarda),
        // aquí no hay que hacer nada: si no, saldrían DOS confirmaciones.
        if (window.__nameApplyHandledAt && (Date.now() - window.__nameApplyHandledAt) < 2000) return;

        // Regla de nombre único: si ya está fijado, no se admiten cambios
        if (this._isNameSet(this.Username)) {
            this._refreshNameLockUI();
            if (this.notifications) this.notifications.show('The character name is already set and cannot be changed.', 'error');
            return;
        }

        const rawName = this.settingsNameInput.value;
        const name = sanitizeName(rawName);

        if (name === "" || name === "---") {
            // Antes esto solo hacía console.log: el jugador pulsaba "Aplicar" y
            // no pasaba absolutamente nada, así que parecía que el botón estaba
            // roto. Pasa mucho con nombres escritos con números o símbolos,
            // porque el saneado (igual en cliente y servidor) solo admite
            // letras.
            const msg = String(rawName || '').trim() === ''
                ? 'Write a name first.'
                : 'Only letters and numbers are allowed (no spaces or symbols).';
            if (this.notifications) this.notifications.show(msg, 'error');
            const hint = document.getElementById('character-name-hint');
            if (hint) hint.textContent = `⚠️ ${msg}`;
            console.log("No has puesto un nombre válido:", rawName);
            return;
        }

        // Confirmación: el cambio es definitivo. Si el navegador tiene los
        // diálogos bloqueados, confirm() devuelve false sin preguntar nada y el
        // jugador se quedaba sin poder fijar el nombre; en ese caso se sigue
        // adelante en vez de abandonar en silencio.
        let ok = true;
        if (typeof window.confirm === 'function') {
            try {
                ok = window.confirm(`¿Fijar el nombre de personaje como "${name}"?\n\nEsta decisión es DEFINITIVA: no podrás cambiarlo después.`);
            } catch (e) {
                console.warn('confirm() no disponible, continuando:', e);
                ok = true;
            }
        }
        if (!ok) return;

        console.log('Nombre aplicado (definitivo):', name);

        // El DOM del dashboard persiste entre escenas: aplicar sobre la
        // escena ACTIVA (GameScene o tiendajuego), no sobre una destruida.
        let sc = this;
        try {
            const keys = window.game && window.game.scene && window.game.scene.keys;
            if (keys) {
                if (keys['GameScene'] && keys['GameScene'].scene.isActive()) sc = keys['GameScene'];
                else if (keys['tiendajuego'] && keys['tiendajuego'].scene.isActive()) sc = keys['tiendajuego'];
            }
        } catch (e) { /* usar this como fallback */ }

        // Actualizar en el juego
        sc.Username = name;
        this.Username = name;

        // Actualizar en la interfaz + guardar en servidor (queuedAction → savegg)
        try {
            if (typeof sc.actualizarNombreUsuario1 === 'function') sc.actualizarNombreUsuario1(name);
            else if (typeof sc.queuedAction === 'function') sc.queuedAction({ type: 'forSpam2' });
        } catch (e) { console.warn('No se pudo actualizar/guardar el nombre:', e); }

        this._refreshNameLockUI();
        if (this.notifications) this.notifications.show(`✅ Name set: ${name}`, 'success');

        // Cerrar panel
        this.hideSettingsPanel();
    };

    // Botón aplicar nombre de MASCOTA — también se fija UNA sola vez.
    if (this.settingsApplyPetBtn && this.settingsPetInput) {
        // Mismos guards de teclado que el input de personaje
        this.settingsPetInput.addEventListener('input', (e) => {
            const clean = sanitizeName(e.target.value);
            if (e.target.value !== clean) e.target.value = clean;
        });
        this.settingsPetInput.addEventListener('focus', () => {
            if (this.keys) {
                ['left','right','up','down','leftArrow','rightArrow','upArrow','downArrow']
                  .forEach(k => { if (this.keys[k]) this.keys[k].enabled = false; });
            }
            this.input.keyboard.enabled = false;
        });
        this.settingsPetInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') this.hideSettingsPanel();
        });
        this.settingsPetInput.addEventListener('keyup', (e) => e.stopPropagation());

        this.settingsApplyPetBtn.onclick = () => {
            if (this._isNameSet(this.petName)) {
                this._refreshNameLockUI();
                if (this.notifications) this.notifications.show('El nombre de la mascota ya fue fijado y no puede cambiarse.', 'error');
                return;
            }

            const rawPet = this.settingsPetInput.value;
            const name = sanitizeName(rawPet);
            if (name === "" || name === "---") {
                // Mismo motivo que en el nombre de personaje: antes fallaba en silencio.
                const msg = String(rawPet || '').trim() === ''
                    ? 'Write a pet name first.'
                    : 'Only letters and numbers are allowed in the pet name (no spaces or symbols).';
                if (this.notifications) this.notifications.show(msg, 'error');
                const hintPet = document.getElementById('pet-name-hint');
                if (hintPet) hintPet.textContent = `⚠️ ${msg}`;
                console.log("No has puesto un nombre de mascota válido:", rawPet);
                return;
            }

            let ok = true;
            if (typeof window.confirm === 'function') {
                try {
                    ok = window.confirm(`¿Fijar el nombre de tu mascota como "${name}"?\n\nEsta decisión es DEFINITIVA: no podrás cambiarlo después.`);
                } catch (e) {
                    console.warn('confirm() no disponible, continuando:', e);
                    ok = true;
                }
            }
            if (!ok) return;

            console.log('Nombre de mascota aplicado (definitivo):', name);

            // El DOM del dashboard persiste entre escenas, pero la escena que
            // cableó este botón puede estar destruida (GameScene ↔ tienda).
            // Resolver la escena ACTIVA para aplicar y guardar el nombre.
            let sc = this;
            try {
                const keys = window.game && window.game.scene && window.game.scene.keys;
                if (keys) {
                    if (keys['GameScene'] && keys['GameScene'].scene.isActive()) sc = keys['GameScene'];
                    else if (keys['tiendajuego'] && keys['tiendajuego'].scene.isActive()) sc = keys['tiendajuego'];
                }
            } catch (e) { /* usar this como fallback */ }

            sc.petName = name;
            this.petName = name;
            window.globalPetName = name; // compartido entre escenas

            // Actualizar la etiqueta sobre el perro y guardar en servidor
            if (typeof sc._updateDogNameLabel === 'function') sc._updateDogNameLabel();
            try {
                if (typeof sc.queuedAction === 'function') sc.queuedAction({ type: 'forSpam2' });
            } catch (e) { console.warn('No se pudo encolar el guardado del nombre de mascota:', e); }

            this._refreshNameLockUI();
            if (this.notifications) this.notifications.show(`✅ Tu mascota ahora se llama ${name}`, 'success');
        };
    }
    
    // Botón cerrar panel
    this.settingsCloseBtn.addEventListener('click', () => {
        this.hideSettingsPanel();
    });
    
    // Selector de idioma
    this.settingsLangSelect.addEventListener('change', (event) => {
        const v = event.target.value;
        
        if (v === 'en-US') {
            this.lenguaje = 1;
            this.panelactualizacion = 1;
            console.log('Idioma cambiado a inglés:', this.lenguaje);
        } else if (v === 'en-PH') {
            this.lenguaje = 2;
            this.panelactualizacion = 1;
            console.log('Idioma cambiado a inglés filipino:', this.lenguaje);
        } else if (v === 'es-419') {
            this.lenguaje = 3;
            this.panelactualizacion = 1;
            console.log('Idioma cambiado a español:', this.lenguaje);
        } else if (v === 'pt-BR') {
            this.lenguaje = 4;
            this.panelactualizacion = 1;
            console.log('Idioma cambiado a portugués:', this.lenguaje);
        } else if (v === 'zh-CN') {
            this.lenguaje = 5;
            this.panelactualizacion = 1;
            console.log('Idioma cambiado a chino:', this.lenguaje);
        } else if (v === 'ko-KR') {
            this.lenguaje = 6;
            this.panelactualizacion = 1;
            console.log('Idioma cambiado a coreano:', this.lenguaje);
        }
        
        this.queuedAction({ type: 'forSpam2' });
        
    });
    
    // Botón cerrar sesión — antes solo recargaba la página: la sesión del
    // backend y la wallet seguían conectadas. Ahora cierra TODO y va al login.
    this.settingsLogoutBtn.addEventListener('click', () => {
        if (this.stopAutoRefresh) this.stopAutoRefresh();
        this.Username = null;
        this._doFullLogout();
    });
    
    // Tecla Esc para cerrar (usando capture para atrapar primero)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.settingsPanel && this.settingsPanel.classList.contains('visible')) {
            e.stopPropagation();
            e.preventDefault();
            this.hideSettingsPanel();
        }
    }, true);
}

// Método para mostrar panel
showSettingsPanel() {
    // Si el panel no estaba cacheado (setupSettingsPanel corrió antes de que el
    // HUD existiera y aún no había reintentado), se busca ahora en vez de no
    // hacer nada: sin esto el botón del dashboard simplemente no respondía.
    if (!this.settingsPanel) {
        this.settingsPanel = document.getElementById('hub-panel_101');
        if (this.settingsPanel) this.setupSettingsPanel();
    }
    if (this.settingsPanel) {
        this.settingsPanel.classList.add('visible');
        this.settingsPanel.setAttribute('aria-hidden', 'false');
        
        // Guardar estado del teclado
        this.wasKeyboardEnabled = this.input.keyboard.enabled;
        
        // Desactivar controles del teclado
        if (this.keys) {
            this.keys.left.enabled = false;
            this.keys.right.enabled = false;
            this.keys.up.enabled = false;
            this.keys.down.enabled = false;
            this.keys.leftArrow.enabled = false;
            this.keys.rightArrow.enabled = false;
            this.keys.upArrow.enabled = false;
            this.keys.downArrow.enabled = false;
        }
        this.input.keyboard.enabled = false;
        
        
        // Actualizar campos de nombre (personaje y mascota) con su estado de
        // bloqueo: si un nombre ya fue fijado (≠ '---'), el input queda
        // deshabilitado y el aviso pasa a "definitivo".
        this._refreshNameLockUI();

        // Enfocar el primer input editable
        setTimeout(() => {
            if (this.settingsNameInput && !this.settingsNameInput.disabled) {
                this.settingsNameInput.focus();
            } else if (this.settingsPetInput && !this.settingsPetInput.disabled) {
                this.settingsPetInput.focus();
            }
        }, 100);

        console.log('⚙️ Panel de configuraciones abierto');
        console.log('⌨️ Controles de teclado desactivados para escritura');
    }
}

// Método para ocultar panel
hideSettingsPanel() {
    if (this.settingsPanel) {
        this.settingsPanel.classList.remove('visible');
        this.settingsPanel.setAttribute('aria-hidden', 'true');
        
        // Quitar el foco del input
        if (this.settingsNameInput) {
            this.settingsNameInput.blur();
        }
        
        // Reactivar los controles del teclado
        if (this.keys) {
            this.keys.left.enabled = true;
            this.keys.right.enabled = true;
            this.keys.up.enabled = true;
            this.keys.down.enabled = true;
            this.keys.leftArrow.enabled = true;
            this.keys.rightArrow.enabled = true;
            this.keys.upArrow.enabled = true;
            this.keys.downArrow.enabled = true;
        }
        
        // Reactivar el teclado
        this.input.keyboard.enabled = this.wasKeyboardEnabled !== false;
        
        // Reanudar juego
        // this.scene.resume(); // removed: we don't pause anymore
        console.log('⚙️ Panel de configuraciones cerrado');
        console.log('⌨️ Controles de teclado reactivados');
    }
}

// Método para actualizar nombre de usuario en el juego
actualizarNombreUsuario1(nombre) {
    // Actualizar el texto en el juego
    if (this.usuariox) {
        this.usuariox.setText(nombre.substring(0, 10));
    }
    
    console.log('✅ Nombre actualizado:', nombre);
    this.queuedAction({ type: 'forSpam2' });
}

// Método para desactivar controles del teclado
disableKeyboardControls() {
    // Guardar el estado actual de las teclas
    this.wasKeyboardEnabled = this.input.keyboard.enabled;
    
    // Desactivar temporalmente las teclas de movimiento
    if (this.keys) {
        // Desactivar todas las teclas de movimiento
        this.keys.left.enabled = false;
        this.keys.right.enabled = false;
        this.keys.up.enabled = false;
        this.keys.down.enabled = false;
        this.keys.leftArrow.enabled = false;
        this.keys.rightArrow.enabled = false;
        this.keys.upArrow.enabled = false;
        this.keys.downArrow.enabled = false;
    }
    
    // Desactivar el manejo de eventos de teclado global
    this.input.keyboard.enabled = false;
    
    console.log('⌨️ Controles de teclado desactivados para escritura');
}

// Método para reactivar controles del teclado
enableKeyboardControls() {
    // Reactivar las teclas de movimiento
    if (this.keys) {
        this.keys.left.enabled = true;
        this.keys.right.enabled = true;
        this.keys.up.enabled = true;
        this.keys.down.enabled = true;
        this.keys.leftArrow.enabled = true;
        this.keys.rightArrow.enabled = true;
        this.keys.upArrow.enabled = true;
        this.keys.downArrow.enabled = true;
    }
    
    // Reactivar el teclado
    this.input.keyboard.enabled = this.wasKeyboardEnabled !== false;
    
    console.log('⌨️ Controles de teclado reactivados');
}


/**
 * Elimina o descuenta cantidad del cursor SIN soltar el ítem
 * @param {string} itemId - ID del item a eliminar/descontar
 * @param {number} amount - Cantidad a eliminar (0 = eliminar todo)
 * @returns {number} - Cantidad restante en el cursor (0 si se eliminó todo, -1 si no hay ítem o no coincide)
 */
removeFromCursorKeepHolding(itemId, amount = 0) {
  // Verificar si hay un ítem en el cursor
  if (!this.STATE.selectedItem || !this.STATE.selectedItem.isGhost) {
    console.warn('No hay ningún ítem en el cursor');
    return -1;
  }
  
  const cursorItem = this.STATE.selectedItem;
  
  // Verificar si el item coincide
  if (cursorItem.id !== itemId) {
    console.warn(`El ítem en el cursor no es "${itemId}"`);
    return -1;
  }
  
  const currentCount = cursorItem.count;
  
  // Si amount es 0, eliminar todo
  const quantityToRemove = amount === 0 ? currentCount : amount;
  
  // Verificar si hay suficiente cantidad
  if (currentCount < quantityToRemove) {
    console.warn(`No hay suficiente cantidad en el cursor. Tienes ${currentCount}, necesitas eliminar ${quantityToRemove}`);
    return currentCount;
  }
  
  // Calcular nueva cantidad
  const newCount = currentCount - quantityToRemove;
  
  if (newCount === 0) {
    // Eliminar todo - aquí SIEMPRE se limpia el cursor
    console.log(`🖱️ Cursor: eliminado completamente (${currentCount} ${itemId})`);
    
    // Limpiar el cursor
    this.STATE.selectedItem = null;
    this.stopDrag();
    
    // Limpiar el fantasma del slot de origen
    if (cursorItem.originType === 'inv') {
      this.STATE.ghostSlots.inv[cursorItem.originIndex] = null;
      this.STATE.slots[cursorItem.originIndex] = null;
      this.renderSlot(cursorItem.originIndex);
    } else {
      this.STATE.ghostSlots.quick[cursorItem.originIndex] = null;
      this.STATE.quickSlots[cursorItem.originIndex] = null;
      this.renderSlot(cursorItem.originIndex);
    }
    
    return 0;
  } else {
    // Reducir parcialmente - el cursor MANTIENE el ítem
    cursorItem.count = newCount;
    console.log(`🖱️ Cursor: reducido de ${currentCount} a ${newCount} ${itemId}`);
    
    // Actualizar visualización del cursor
    this.updateDragCount(newCount);
    
    return newCount;
  }
}







// INICIALIZAR SISTEMA DE BASURA (llamar en create)
initTrashSystem() {
  if (this.trashSystemInitialized) return;
  
  console.log('🗑️ Inicializando sistema de basura...');
  
  // Configurar eventos del hub
  this.setupTrashHubEvents();
  
  // Configurar eventos del selector de cantidad
  this.setupQuantitySelectorEvents();
  
  this.trashSystemInitialized = true;
}

// MÉTODO PARA ABRIR LA BASURA
openTrashHub() {
  console.log('🗑️ Abriendo hub de basura...');
  
  if (this.trashHubOpen) return;
  
  this.trashHubOpen = true;
  
  // Inicializar sistema si no está inicializado
  if (!this.trashSystemInitialized) {
    this.initTrashSystem();
  }
  
  // Mostrar el hub
  const trashHub = document.getElementById('trash-hub');
  if (trashHub) {
    trashHub.classList.remove('trash-hub-hidden');
    trashHub.classList.add('trash-hub-visible');
    
    // Actualizar instrucciones según el idioma
    this.updateTrashInstructions();
    
    // Limpiar slots previos
    this.clearTrashSlots();
    
    // Inicializar sistema de clics
    this.initTrashSlots();
    
    
    // Deshabilitar controles del juego
    // BUGFIX: antes solo se hacía "this.input.keyboard.enabled = false",
    // lo cual deja de procesar eventos de teclado pero NO resetea el
    // estado ya guardado de las teclas de movimiento (isDown). Si el
    // jugador abría este panel con la tecla derecha (u otra de movimiento)
    // todavía sujeta, el personaje se quedaba caminando en esa dirección
    // para siempre, incluso después de soltar la tecla.
    //
    // this.cursors (flechas) y this.keys (WASD + flechas) son objetos de
    // tecla INDEPENDIENTES en Phaser aunque compartan la misma tecla física,
    // así que hay que resetear ambos explícitamente con .reset(), que sí
    // fuerza isDown a false de inmediato (a diferencia de solo .enabled).
    [
      this.cursors?.left, this.cursors?.right, this.cursors?.up, this.cursors?.down,
      this.keys?.left, this.keys?.right, this.keys?.up, this.keys?.down,
      this.keys?.leftArrow, this.keys?.rightArrow, this.keys?.upArrow, this.keys?.downArrow
    ].forEach(tecla => { if (tecla && typeof tecla.reset === 'function') tecla.reset(); });

    this.disableKeyboardControls();
    
    console.log('✅ Hub de basura abierto');
  }
}

// MÉTODO PARA CERRAR LA BASURA
closeTrashHub() {
  console.log('🗑️ Cerrando hub de basura...');
  
  if (!this.trashHubOpen) return;
  
  this.trashHubOpen = false;
  
  const trashHub = document.getElementById('trash-hub');
  if (trashHub) {
    trashHub.classList.remove('trash-hub-visible');
    trashHub.classList.add('trash-hub-hidden');
  }
  
  // Ocultar selector de cantidad si está abierto
  this.hideQuantitySelector();
  
  // (No pause used — nothing to resume)
  // Reactivar controles
  this.enableKeyboardControls();
  
  console.log('✅ Hub de basura cerrado');
}

// CONFIGURAR EVENTOS DEL HUB
setupTrashHubEvents() {
  // Botón de cerrar
  const closeBtn = document.getElementById('trash-hub-close');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.closeTrashHub();
    };
  }
  
  // Botón de confirmar
  const confirmBtn = document.getElementById('trash-confirm-btn');
  if (confirmBtn) {
    confirmBtn.onclick = (e) => {
      e.stopPropagation();
      this.confirmTrashItems();
    };
  }
  
  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && this.trashHubOpen) {
      this.closeTrashHub();
    }
  });
}

// CONFIGURAR EVENTOS DEL SELECTOR DE CANTIDAD
setupQuantitySelectorEvents() {
  // Botones de cantidad
  const minusBtn = document.getElementById('trash-quantity-minus');
  const plusBtn = document.getElementById('trash-quantity-plus');
  const slider = document.getElementById('trash-quantity-slider');
  const display = document.getElementById('trash-quantity-display');
  
  // Botón menos
  if (minusBtn) {
    minusBtn.onclick = () => {
      let current = parseInt(display.textContent) || 1;
      if (current > 1) {
        current--;
        display.textContent = current;
        if (slider) slider.value = current;
      }
    };
  }

  if (plusBtn) {
    plusBtn.onclick = () => {
      let current = parseInt(display.textContent) || 1;
      const max = parseInt(slider ? slider.max : 99999);
      if (current < max) {
        current++;
        display.textContent = current;
        if (slider) slider.value = current;
      }
    };
  }

  // Make display editable directly
  if (display) {
    display.contentEditable = 'true';
    display.style.cursor = 'text';
    display.oninput = () => {
      let v = parseInt(display.textContent) || 1;
      const max = parseInt(slider ? slider.max : 99999);
      if (v < 1) v = 1;
      if (v > max) v = max;
      if (slider) slider.value = v;
    };
  }

  if (slider) {
    slider.oninput = () => {
      display.textContent = slider.value;
    };
  }

  // Select All button
  const allBtn = document.getElementById('trash-quantity-all');
  if (allBtn) {
    allBtn.onclick = () => {
      const max = parseInt(slider ? slider.max : 1);
      display.textContent = max;
      if (slider) slider.value = max;
    };
  }
  
  // Botón cancelar
  const cancelBtn = document.getElementById('trash-quantity-cancel');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      this.hideQuantitySelector();
    };
  }
  
  // Botón confirmar
  const confirmBtn = document.getElementById('trash-quantity-confirm');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      this.confirmQuantitySelection();
    };
  }
}

// INICIALIZAR SLOTS DE BASURA
initTrashSlots() {
  const slots = document.querySelectorAll('.trash-slot');
  
  slots.forEach(slot => {
    const slotIndex = parseInt(slot.getAttribute('data-slot'));
    
    // Limpiar slot
    slot.innerHTML = '';
    slot.classList.remove('has-item');
    
    // Agregar listener de clic
    // EN LA FUNCIÓN initTrashSlots(), REEMPLAZA el event listener del slot:
slot.addEventListener('click', (e) => {
  // Si se hace clic en el botón de remover, no hacer nada
  if (e.target.classList.contains('trash-slot-remove')) {
    return;
  }
  
  // Verificar si el slot ya tiene un item
  if (slot.classList.contains('has-item')) {
    this.showNotification('That slot already has an item', 'warning');
    return;
  }
  
  // Verificar si hay un item seleccionado en el inventario
  if (this.STATE && this.STATE.selectedItem) {
    console.log('🎯 Item seleccionado encontrado:', this.STATE.selectedItem);
    
    // Obtener el ID del item seleccionado de diferentes maneras
    let itemId;
    
    // Si selectedItem es un objeto con id
    if (typeof this.STATE.selectedItem === 'object' && this.STATE.selectedItem.id) {
      itemId = this.STATE.selectedItem.id;
    }
    // Si selectedItem es un string (el id directamente)
    else if (typeof this.STATE.selectedItem === 'string') {
      itemId = this.STATE.selectedItem;
    }
    // Si es otra cosa, intentar obtener de otra forma
    else {
      console.log('⚠️ Formato desconocido de selectedItem:', this.STATE.selectedItem);
      itemId = this.STATE.selectedItem;
    }
    
    console.log(`🔍 Buscando item con ID: ${itemId}`);
    
    if (!itemId) {
      this.showNotification('Error: invalid item id', 'error');
      return;
    }
    
    // Buscar el item en el inventario
    const itemInInventory = this.findItemInInventory(itemId);
    
    if (itemInInventory) {
      console.log('✅ Item encontrado en inventario:', itemInInventory);
      
      // Mostrar selector de cantidad
      this.showQuantitySelector(slotIndex, itemId, itemInInventory.quantity);
    } else {
      console.log('❌ Item NO encontrado en inventario');
      
      // Mostrar más información para debug
      let debugMessage = `Item no encontrado.`;
      debugMessage += ` ID buscado: ${itemId}`;
      debugMessage += ` | Tipo: ${typeof this.STATE.selectedItem}`;
      console.log(debugMessage);
      
      // Intentar encontrar el item de otra manera
      this.tryAlternativeItemSearch(slotIndex, itemId);
    }
  } else {
    console.log('⚠️ No hay item seleccionado en el inventario');
    
    // Mostrar mensaje según idioma
    if (this.lenguaje === 3) {
      this.showNotification('Select an item from your inventory first', 'warning');
    } else {
      this.showNotification('Select an item from inventory first', 'warning');
    }
  }
});

  });
}

// AGREGAR ESTA FUNCIÓN NUEVA:
tryAlternativeItemSearch(slotIndex, itemId) {
  console.log('🔄 Intentando búsqueda alternativa para:', itemId);
  
  // Si ItemDefinitions existe, verificar si el item está definido
  if (this.ItemDefinitions && this.ItemDefinitions[itemId]) {
    console.log('✅ Item encontrado en ItemDefinitions');
    
    // Verificar manualmente en casillas
    let foundQuantity = 0;
    
    // Buscar en casillas principales
    if (this.casillas && Array.isArray(this.casillas)) {
      for (const slot of this.casillas) {
        if (slot) {
          // Intentar diferentes nombres de propiedad
          if (slot.id === itemId || slot.itemId === itemId || slot.name === itemId) {
            foundQuantity = slot.quantity || 1;
            break;
          }
        }
      }
    }
    
    // Buscar en cofre
    if (foundQuantity === 0 && this.casillasExtra && Array.isArray(this.casillasExtra)) {
      for (const slot of this.casillasExtra) {
        if (slot) {
          if (slot.id === itemId || slot.itemId === itemId || slot.name === itemId) {
            foundQuantity = slot.quantity || 1;
            break;
          }
        }
      }
    }
    
    // Si se encontró alguna cantidad
    if (foundQuantity > 0) {
      console.log(`✅ Cantidad encontrada: ${foundQuantity}`);
      
      // Mostrar selector de cantidad
      this.showQuantitySelector(slotIndex, itemId, foundQuantity);
      return;
    }
  }
  
  // Si llegamos aquí, no se encontró
  if (this.lenguaje === 3) {
    this.showNotification(`"${itemId}" is not in your inventory`, 'error');
  } else {
    this.showNotification(`Item "${itemId}" is not in your inventory`, 'error');
  }
}

// BUSCAR ITEM EN INVENTARIO
// REEMPLAZA ESTA FUNCIÓN:
findItemInInventory(itemId) {
  // Buscar en casillas principales
  if (this.casillas && Array.isArray(this.casillas)) {
    for (const slot of this.casillas) {
      if (slot && slot.id === itemId) {
        return { quantity: slot.count || slot.quantity || 1, source: 'inventory' };
      }
    }
  }
  
  // Buscar en casillas extra (cofre)
  if (this.casillasExtra && Array.isArray(this.casillasExtra)) {
    for (const slot of this.casillasExtra) {
      if (slot && slot.id === itemId) {
        return { quantity: slot.count || slot.quantity || 1, source: 'cofre' };
      }
    }
  }
  
  // Buscar en STATE.inventory si existe
  if (this.STATE && this.STATE.inventory) {
    if (Array.isArray(this.STATE.inventory)) {
      for (const item of this.STATE.inventory) {
        if (item && item.id === itemId) {
          return { quantity: item.count || item.quantity || 1, source: 'state' };
        }
      }
    }
  }
  
  return null;
}

// CON ESTA VERSIÓN MEJORADA:
findItemInInventory(itemId) {
  console.log(`🔍 Buscando item: ${itemId}`);
  
  if (!itemId) {
    console.log('❌ No hay itemId para buscar');
    return null;
  }
  
  // Debug: mostrar estructura de casillas
  console.log('📦 this.casillas:', this.casillas);
  console.log('📦 this.casillasExtra:', this.casillasExtra);
  console.log('📦 this.STATE.selectedItem:', this.STATE?.selectedItem);
  
  let foundItem = null;
  
  // BUSCAR EN CASILLAS PRINCIPALES
  if (this.casillas && Array.isArray(this.casillas)) {
    for (let i = 0; i < this.casillas.length; i++) {
      const slot = this.casillas[i];
      console.log(`📦 Slot ${i}:`, slot);
      
      if (slot) {
        // Intentar diferentes formas de comparar el ID
        const slotId = slot.id || slot.itemId || slot.name || slot.key;
        console.log(`🔍 Comparando: "${slotId}" con "${itemId}"`);
        
        if (slotId === itemId) {
          const qty = slot.count || slot.quantity || 1;
          console.log(`✅ Encontrado en casilla principal ${i}: cantidad ${qty}`);
          return { 
            quantity: qty, 
            source: 'inventory',
            slotIndex: i,
            slotData: slot
          };
        }
      }
    }
  }
  
  // BUSCAR EN CASILLAS EXTRA (COFRE)
  if (this.casillasExtra && Array.isArray(this.casillasExtra)) {
    for (let i = 0; i < this.casillasExtra.length; i++) {
      const slot = this.casillasExtra[i];
      console.log(`📦 Cofre Slot ${i}:`, slot);
      
      if (slot) {
        const slotId = slot.id || slot.itemId || slot.name || slot.key;
        console.log(`🔍 Comparando cofre: "${slotId}" con "${itemId}"`);
        
        if (slotId === itemId) {
          const qty = slot.count || slot.quantity || 1;
          console.log(`✅ Encontrado en cofre ${i}: cantidad ${qty}`);
          return { 
            quantity: qty, 
            source: 'cofre',
            slotIndex: i,
            slotData: slot
          };
        }
      }
    }
  }
  
  // Si no se encontró, buscar en otros lugares posibles
  if (this.STATE) {
    console.log('🔍 Buscando en this.STATE...');
    
    // Si hay un array inventory en STATE
    if (this.STATE.inventory && Array.isArray(this.STATE.inventory)) {
      for (let i = 0; i < this.STATE.inventory.length; i++) {
        const item = this.STATE.inventory[i];
        if (item && item.id === itemId) {
          console.log(`✅ Encontrado en STATE.inventory[${i}]`);
          return { 
            quantity: item.quantity || 1, 
            source: 'state',
            slotIndex: i,
            slotData: item
          };
        }
      }
    }
    
    // Si el item seleccionado tiene sus propios datos
    if (this.STATE.selectedItem) {
      console.log('🔍 Verificando this.STATE.selectedItem:', this.STATE.selectedItem);
      
      // Si selectedItem es un objeto con id
      if (this.STATE.selectedItem.id) {
        if (this.STATE.selectedItem.id === itemId) {
          console.log(`✅ Coincide con selectedItem.id`);
          // selectedItem stores amount as 'count', fall back to 'quantity' for safety
          const qty = this.STATE.selectedItem.count || this.STATE.selectedItem.quantity || 1;
          return { 
            quantity: qty, 
            source: 'selected',
            slotData: this.STATE.selectedItem
          };
        }
      }
      // Si selectedItem es directamente el ID
      else if (this.STATE.selectedItem === itemId) {
        console.log(`✅ Coincide directamente con selectedItem`);
        // Try to pull count from STATE.slots for accurate quantity
        let directQty = 1;
        if (this.STATE.slots) {
          const found = this.STATE.slots.find(s => s && s.id === itemId);
          if (found) directQty = found.count || found.quantity || 1;
        }
        return { 
          quantity: directQty, 
          source: 'selected',
          slotData: { id: itemId, quantity: directQty }
        };
      }
    }
  }
  
  console.log(`❌ Item ${itemId} no encontrado en ningún inventario`);
  return null;
}

// MOSTRAR SELECTOR DE CANTIDAD
showQuantitySelector(slotIndex, itemId, maxQuantity) {
  console.log(`📦 Mostrando selector para ${itemId}, máximo: ${maxQuantity}`);
  
  // Verificar que maxQuantity sea válido
  if (!maxQuantity || maxQuantity < 1) {
    console.warn('⚠️ Cantidad máxima inválida, usando 1');
    maxQuantity = 1;
  }
  
  // Guardar selección actual
  this.currentTrashSelection = {
    slotIndex: slotIndex,
    itemId: itemId,
    maxQuantity: maxQuantity
  };
  
  // Obtener elementos del DOM
  const selector = document.getElementById('trash-quantity-selector');
  const title = document.getElementById('trash-quantity-title');
  const display = document.getElementById('trash-quantity-display');
  const slider = document.getElementById('trash-quantity-slider');
  const maxSpan = document.getElementById('trash-quantity-max');
  
  if (selector && title && display && slider && maxSpan) {
    // Configurar valores
    const itemName = this.getItemDisplayName(itemId);
    
    // Actualizar texto según idioma
    if (this.lenguaje === 3) {
      title.textContent = `How many ${itemName} to trash?`;
      maxSpan.textContent = `Max: ${maxQuantity}`;
    } else {
      title.textContent = `How many ${itemName} to trash?`;
      maxSpan.textContent = `Max: ${maxQuantity}`;
    }
    
    // Configurar controles - usar el maxQuantity real del slot
    const realMax = parseInt(maxQuantity) || 1;
    display.textContent = '1';
    slider.min = 1;
    slider.max = realMax;
    slider.value = 1;
    if (maxSpan) maxSpan.textContent = `Max: ${realMax}`;
    
    // Mostrar selector
    selector.classList.remove('trash-quantity-hidden');
    selector.classList.add('trash-quantity-visible');
  }
}

// OCULTAR SELECTOR DE CANTIDAD
hideQuantitySelector() {
  const selector = document.getElementById('trash-quantity-selector');
  if (selector) {
    selector.classList.remove('trash-quantity-visible');
    selector.classList.add('trash-quantity-hidden');
  }
  
  this.currentTrashSelection = null;
}

// CONFIRMAR SELECCIÓN DE CANTIDAD
confirmQuantitySelection() {
  if (!this.currentTrashSelection) return;
  
  const display = document.getElementById('trash-quantity-display');
  // Read quantity - support contentEditable direct input or slider
  const slider = document.getElementById('trash-quantity-slider');
  const rawVal = display ? display.textContent.trim() : '1';
  const quantity = Math.max(1, parseInt(rawVal) || parseInt(slider?.value) || 1);
  const maxAllowed = this.currentTrashSelection ? this.currentTrashSelection.maxQuantity : 999999;

  // Verify valid quantity
  if (quantity < 1 || quantity > maxAllowed) {
    this.showNotification(`Invalid quantity (1-${maxAllowed})`, 'error');
    return;
  }
  
  // Obtener información del item
  const itemId = this.currentTrashSelection.itemId;
  const itemName = this.getItemDisplayName(itemId);
  const itemImage = this.getItemImage(itemId);
  
  // Crear datos del item
  const itemData = {
    id: itemId,
    name: itemName,
    quantity: quantity,
    image: itemImage,
    slotIndex: this.currentTrashSelection.slotIndex
  };
  
  // Agregar a la basura
  this.addItemToTrashSlot(this.currentTrashSelection.slotIndex, itemData);
  
  // Ocultar selector
  this.hideQuantitySelector();
}

// AGREGAR ITEM A UN SLOT DE BASURA
addItemToTrashSlot(slotIndex, itemData) {
  console.log('➕ Agregando item a basura:', itemData);
  
  const slot = document.querySelector(`.trash-slot[data-slot="${slotIndex}"]`);
  if (!slot || !itemData) {
    console.error('❌ No se encontró el slot o itemData');
    return;
  }
  
  // Verificar si ya existe en este slot
  if (this.trashItems.has(slotIndex)) {
    this.showNotification('That slot already has an item', 'warning');
    return;
  }
  
  // Limpiar slot
  slot.innerHTML = '';
  
  // Crear contenido del slot
  const itemContent = document.createElement('div');
  itemContent.className = 'trash-slot-content';
  itemContent.style.cssText = `
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  `;
  
  // Imagen del item (usando ItemDefinitions)
  const img = document.createElement('img');
  img.src = itemData.image;
  img.className = 'trash-slot-item';
  img.alt = itemData.name;
  img.onerror = function() {
    this.style.display = 'none';
    const textPlaceholder = document.createElement('div');
    textPlaceholder.textContent = itemData.name.substring(0, 2);
    textPlaceholder.style.color = '#ecf0f1';
    textPlaceholder.style.fontFamily = '"PressStart2P", cursive';
    textPlaceholder.style.fontSize = '1rem';
    this.parentNode.appendChild(textPlaceholder);
  };
  itemContent.appendChild(img);
  
  // Cantidad (si es mayor a 1)
  if (itemData.quantity > 1) {
    const quantitySpan = document.createElement('div');
    quantitySpan.className = 'trash-slot-quantity';
    quantitySpan.textContent = itemData.quantity;
    itemContent.appendChild(quantitySpan);
  }
  
  // Nombre (tooltip)
  const nameSpan = document.createElement('div');
  nameSpan.className = 'trash-slot-item-name';
  nameSpan.textContent = itemData.name;
  itemContent.appendChild(nameSpan);
  
  // Botón para remover
  const removeBtn = document.createElement('button');
  removeBtn.className = 'trash-slot-remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remover de la basura';
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    this.removeItemFromTrashSlot(slotIndex);
  };
  itemContent.appendChild(removeBtn);
  
  slot.appendChild(itemContent);
  slot.classList.add('has-item');
  
  // Guardar en el Map
  this.trashItems.set(slotIndex, itemData);

  // BUGFIX: mientras un item está puesto en la basura, no debía poder
  // volver a tomarse desde el inventario o el hotbar (podías meterlo a la
  // basura y seguir usándolo/moviéndolo como si nada). Se reutiliza el
  // mismo bloqueo visual+funcional (borde rojo, pointer-events:none) que ya
  // se usa al confirmar una siembra, guardando qué casillas se bloquearon
  // para poder desbloquear exactamente esas después.
  itemData.slotsBloqueados = this._bloquearCasillasDeSemilla(itemData.id);

  // Y se suelta del cursor (si es justo el item que tenías en la mano),
  // en vez de quedar seleccionado/arrastrándose después de meterlo a la basura.
  this._soltarGhostDeSemilla(itemData.id);
  
  // Mostrar notificación
  let message;
  if (this.lenguaje === 3) {
    message = `${itemData.quantity} ${itemData.name} agregado(s) a la basura`;
  } else {
    message = `${itemData.quantity} ${itemData.name} added to trash`;
  }
  this.showNotification(message, 'info');
  
  // Actualizar botón de confirmar
  this.updateConfirmButton();
}

// REMOVER ITEM DE UN SLOT
removeItemFromTrashSlot(slotIndex) {
  console.log('➖ Removiendo item de basura en slot:', slotIndex);
  
  const slot = document.querySelector(`.trash-slot[data-slot="${slotIndex}"]`);
  if (!slot) return;
  
  // Obtener item antes de remover
  const item = this.trashItems.get(slotIndex);

  // Desbloquear la(s) casilla(s) que se habían bloqueado para este item
  if (item && item.slotsBloqueados) {
    this._desbloquearCasillas(item.slotsBloqueados);
  }
  
  // Limpiar slot
  slot.innerHTML = '';
  slot.classList.remove('has-item');
  
  // Remover del Map
  this.trashItems.delete(slotIndex);
  
  if (item) {
    console.log(`✅ Item removido de basura: ${item.name}`);
  }
  
  // Actualizar botón de confirmar
  this.updateConfirmButton();
}

// ACTUALIZAR BOTÓN DE CONFIRMAR
updateConfirmButton() {
  const confirmBtn = document.getElementById('trash-confirm-btn');
  if (confirmBtn) {
    const hasItems = this.trashItems.size > 0;
    confirmBtn.disabled = !hasItems;
    
    if (hasItems) {
      const totalItems = Array.from(this.trashItems.values()).reduce((sum, item) => sum + item.quantity, 0);
      
      if (this.lenguaje === 3) {
        confirmBtn.innerHTML = `🗑️ Eliminar ${totalItems} Item(s)`;
      } else {
        confirmBtn.innerHTML = `🗑️ Delete ${totalItems} Item(s)`;
      }
    } else {
      if (this.lenguaje === 3) {
        confirmBtn.innerHTML = '🗑️ Eliminar Items';
      } else {
        confirmBtn.innerHTML = '🗑️ Delete Items';
      }
    }
  }
}

// ACTUALIZAR INSTRUCCIONES
updateTrashInstructions() {
  const instructions = document.getElementById('trash-instructions');
  if (instructions) {
    if (this.lenguaje === 3) {
      instructions.textContent = 'Selecciona un item del inventario y luego haz clic en una casilla';
    } else {
      instructions.textContent = 'Select an item from inventory and then click on a slot';
    }
  }
}

// CONFIRMAR ELIMINACIÓN DE ITEMS
async confirmTrashItems() {
  const itemsToDelete = Array.from(this.trashItems.values());
  
  if (itemsToDelete.length === 0) {
    this.showNotification('There are no items to delete', 'warning');
    return;
  }
  
  console.log('🗑️ Confirmando eliminación de items:', itemsToDelete);
  
  // Calcular total
  const totalItems = itemsToDelete.reduce((sum, item) => sum + item.quantity, 0);
  
  // Mostrar confirmación según idioma
  let confirmMessage;
  if (this.lenguaje === 3) {
    confirmMessage = `¿Estás seguro de eliminar ${totalItems} item(s)?\nEsta acción no se puede deshacer.`;
  } else {
    confirmMessage = `Are you sure you want to delete ${totalItems} item(s)?\nThis action cannot be undone.`;
  }
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  let successCount = 0;
  let failCount = 0;

  // BUGFIX: antes, TODOS los items pasaban por removeItemSmart(), que solo
  // borra localmente (inventario/servidor) y NUNCA manda la transacción que
  // realmente los descuenta en el contrato. Ahora se agrupa por itemId (por
  // si el mismo item estaba repartido en varias casillas de basura) y, si
  // ese item tiene seguimiento on-chain (ItemDefinitions[...].tipo), se
  // envía UNA sola transacción real por tipo de item con la cantidad total,
  // en vez de solo borrarlo del lado del cliente/servidor.
  const totalesPorItem = new Map(); // itemId -> cantidad total a eliminar
  for (const item of itemsToDelete) {
    totalesPorItem.set(item.id, (totalesPorItem.get(item.id) || 0) + item.quantity);
  }

  for (const [itemId, cantidad] of totalesPorItem.entries()) {
    const def = this.ItemDefinitions ? this.ItemDefinitions[itemId] : null;
    const nombre = this.getItemDisplayName ? this.getItemDisplayName(itemId) : itemId;

    if (def && def.tipo) {
      // Item con seguimiento on-chain: manda la transacción real que lo
      // descuenta del contrato (igual que con las semillas: se verifica el
      // éxito comparando el inventario antes/después, porque
      // ejecutarDivisionRemove no siempre propaga un booleano confiable).
      try {
        console.log(`🗑️ Eliminando on-chain: ${itemId} x${cantidad}`);
        const cantidadAntes = this.contarItemEnInventario(itemId);
        await this.ejecutarDivisionRemove(def.tipo, itemId, def.maxStack || 50, cantidad);
        const cantidadDespues = this.contarItemEnInventario(itemId);
        const eliminadas = Math.max(0, cantidadAntes - cantidadDespues);

        if (eliminadas >= cantidad) {
          successCount += cantidad;
          console.log(`✅ Eliminado on-chain: ${nombre} x${cantidad}`);
        } else if (eliminadas > 0) {
          successCount += eliminadas;
          failCount += (cantidad - eliminadas);
          console.warn(`⚠️ Solo se confirmaron ${eliminadas} de ${cantidad} ${nombre} on-chain`);
        } else {
          failCount += cantidad;
          console.warn(`❌ No se pudo confirmar la eliminación on-chain de ${nombre}`);
        }
      } catch (error) {
        failCount += cantidad;
        console.error(`❌ Error eliminando on-chain ${nombre}:`, error);
      }
    } else {
      // Sin seguimiento on-chain: se mantiene el comportamiento de siempre
      try {
        console.log(`🗑️ Eliminando: ${itemId} x${cantidad}`);
        const success = await this.removeItemSmart(itemId, cantidad);

        if (success) {
          successCount += cantidad;
          console.log(`✅ Eliminado: ${nombre} x${cantidad}`);
        } else {
          failCount += cantidad;
          console.warn(`❌ No se pudo eliminar: ${nombre}`);
        }
      } catch (error) {
        failCount += cantidad;
        console.error(`❌ Error eliminando ${nombre}:`, error);
      }
    }
  }
  
  // Mostrar resultado
  let message;
  if (this.lenguaje === 3) {
    message = `Eliminados: ${successCount} item(s)`;
    if (failCount > 0) {
      message += ` | Fallaron: ${failCount}`;
    }
  } else {
    message = `Deleted: ${successCount} item(s)`;
    if (failCount > 0) {
      message += ` | Failed: ${failCount}`;
    }
  }
  
  this.showNotification(message, successCount > 0 ? 'success' : 'error');
  
  // Limpiar slots
  this.clearTrashSlots();
  
  // Cerrar el hub después de un momento
  setTimeout(() => {
    this.closeTrashHub();
  }, 1500);
}

// LIMPIAR TODOS LOS SLOTS
clearTrashSlots() {
  console.log('🧹 Limpiando todos los slots de basura');

  // Desbloquear todas las casillas que quedaron bloqueadas por items que
  // estaban puestos en la basura (ya sea porque se confirmó la eliminación
  // o porque se está reiniciando la vista de la basura).
  for (const item of this.trashItems.values()) {
    if (item && item.slotsBloqueados) {
      this._desbloquearCasillas(item.slotsBloqueados);
    }
  }
  
  const slots = document.querySelectorAll('.trash-slot');
  slots.forEach(slot => {
    slot.innerHTML = '';
    slot.classList.remove('has-item');
  });
  
  this.trashItems.clear();
  this.updateConfirmButton();
}

// OBTENER NOMBRE PARA MOSTRAR (usando ItemDefinitions)
getItemDisplayName(itemId) {
  if (!itemId) return 'Item desconocido';
  
  // Mapeo de nombres amigables
  const displayNames = {
    'Semillax': 'Semilla de Zanahoria',
    'Semillax1': 'Semilla de Tomate',
    'Semillax2': 'Semilla de Trigo',
    'Semillax3': 'Semilla de Calabaza',
    'Regaderax': 'Regadera',
    'Tijerasx': 'Tijeras',
    'mineral_piedra': 'Piedra',
    'mineral_cobre': 'Mineral de Cobre',
    'mineral_hierro': 'Mineral de Hierro',
    'palo': 'Palo',
    'tablon_de_madera': 'Tabla de Madera',
    'madera_pinos': 'Madera de Pino',
    'madera_con_hojas': 'Madera con Hojas',
    'madera_seca': 'Madera Seca',
    'balde_vacio': 'Balde Vacío',
    'balde_con_agua': 'Balde con Agua',
    'hacha_de_madera': 'Hacha de Madera',
    'hacha_de_piedra': 'Hacha de Piedra',
    'hacha_de_cobre': 'Hacha de Cobre',
    'hacha_de_hierro': 'Hacha de Hierro',
    'pico_de_madera': 'Pico de Madera',
    'pico_de_piedra': 'Pico de Piedra',
    'pico_de_cobre': 'Pico de Cobre',
    'pico_de_hierro': 'Pico de Hierro',
    'zanahoria_buena': 'Zanahoria',
    'zanahoria_corta': 'Zanahoria Corta',
    'zanahoria_mala': 'Zanahoria Podrida',
    'tomate_buena': 'Tomate',
    'tomate_corta': 'Tomate Corto',
    'tomate_mala': 'Tomate Podrido',
    'trigo_buena': 'Trigo',
    'trigo_corta': 'Trigo Corto',
    'trigo_mala': 'Trigo Podrido',
    'calabaza_buena': 'Calabaza',
    'calabaza_corta': 'Calabaza Corta',
    'calabaza_mala': 'Calabaza Podrida'
  };
  
  return displayNames[itemId] || itemId;
}

// OBTENER IMAGEN DEL ITEM (usando ItemDefinitions)
getItemImage(itemId) {
  if (!itemId) return './Game/Source/items/default.png';
  
  // Buscar en ItemDefinitions
  if (this.ItemDefinitions && this.ItemDefinitions[itemId]) {
    return this.ItemDefinitions[itemId].src;
  }
  
  return './Game/Source/items/default.png';
}

/*
// FUNCIÓN removeItemSmart MEJORADA
async removeItemSmart(itemId, quantity = 1) {
  console.log(`🔍 Ejecutando removeItemSmart para: ${itemId} x${quantity}`);
  
  try {
    // BUSCAR EN INVENTARIO PRINCIPAL (this.casillas)
    if (this.casillas && Array.isArray(this.casillas)) {
      for (let i = 0; i < this.casillas.length; i++) {
        const slot = this.casillas[i];
        if (slot && slot.id === itemId) {
          console.log(`📦 Encontrado en inventario principal slot ${i}: cantidad ${slot.quantity}`);
          
          // Verificar cantidad suficiente
          if (!slot.quantity || slot.quantity < quantity) {
            console.warn(`⚠️ Cantidad insuficiente: ${slot.quantity || 0} < ${quantity}`);
            return false;
          }
          
          // Reducir o eliminar
          if (slot.quantity > quantity) {
            slot.quantity -= quantity;
            console.log(`➖ Reduciendo cantidad a ${slot.quantity}`);
          } else {
            this.casillas[i] = null;
            console.log(`❌ Eliminando completamente del slot ${i}`);
          }
          
          // Actualizar UI del inventario si existe la función
          if (typeof this.updateInventoryUI === 'function') {
            this.updateInventoryUI();
          }
          
          // Guardar cambios en servidor
          await this.savegg();
          
          // Actualizar quick slots si existe
          if (typeof this.updateQuickSlots === 'function') {
            this.updateQuickSlots();
          }
          
          return true;
        }
      }
    }
    
    // BUSCAR EN COFRE (this.casillasExtra)
    if (this.casillasExtra && Array.isArray(this.casillasExtra)) {
      for (let i = 0; i < this.casillasExtra.length; i++) {
        const slot = this.casillasExtra[i];
        if (slot && slot.id === itemId) {
          console.log(`📦 Encontrado en cofre slot ${i}: cantidad ${slot.quantity}`);
          
          // Verificar cantidad suficiente
          if (!slot.quantity || slot.quantity < quantity) {
            console.warn(`⚠️ Cantidad insuficiente en cofre: ${slot.quantity || 0} < ${quantity}`);
            return false;
          }
          
          // Reducir o eliminar
          if (slot.quantity > quantity) {
            slot.quantity -= quantity;
            console.log(`➖ Reduciendo cantidad a ${slot.quantity}`);
          } else {
            this.casillasExtra[i] = null;
            console.log(`❌ Eliminando completamente del cofre slot ${i}`);
          }
          
          // Actualizar UI del cofre si existe la función
          if (typeof this.updateCofreUI === 'function') {
            this.updateCofreUI();
          }
          
          // Guardar cambios
          await this.savegg();
          
          return true;
        }
      }
    }
    
    // BUSCAR EN STATE.INVENTORY (si existe)
    if (this.STATE && this.STATE.inventory) {
      console.log('🔍 Buscando en STATE.inventory...');
      
      // Si es array
      if (Array.isArray(this.STATE.inventory)) {
        for (let i = 0; i < this.STATE.inventory.length; i++) {
          const item = this.STATE.inventory[i];
          if (item && item.id === itemId) {
            console.log(`✅ Encontrado en STATE.inventory[${i}]: cantidad ${item.quantity}`);
            
            // Verificar cantidad suficiente
            if (!item.quantity || item.quantity < quantity) {
              console.warn(`⚠️ Cantidad insuficiente en STATE.inventory: ${item.quantity || 0} < ${quantity}`);
              return false;
            }
            
            // Reducir o eliminar
            if (item.quantity > quantity) {
              item.quantity -= quantity;
            } else {
              this.STATE.inventory.splice(i, 1);
            }
            
            // Actualizar UI
            if (typeof this.updateInventoryUI === 'function') {
              this.updateInventoryUI();
            }
            
            await this.savegg();
            return true;
          }
        }
      }
    }
    
    console.warn(`⚠️ Item ${itemId} no encontrado en ningún inventario`);
    return false;
    
  } catch (error) {
    console.error('❌ Error grave en removeItemSmart:', error);
    return false;
  }
}
*/










/**
 * Remueve items de manera inteligente manteniendo sincronización cursor/backend
 * @param {string} itemId - ID del item a remover
 * @param {number} count - Cantidad a remover
 * @returns {boolean} - True si se pudo remover todo, false si no
 */
removeItemSmart(itemId, count) {
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


/**
 * Función específica para eliminar una cantidad del cursor y mantenerlo activo
 * @param {number} amount - Cantidad a eliminar del cursor
 * @returns {number} - Cantidad restante en el cursor, o -1 si error
 */
reduceCursorAndKeep(amount) {
  if (!this.STATE.selectedItem || !this.STATE.selectedItem.isGhost) {
    return -1;
  }
  
  const itemId = this.STATE.selectedItem.id;
  return this.removeFromCursorKeepHolding(itemId, amount);
}



















initWaterCollectionSystem() {
  console.log('💧 Inicializando sistema de recolección de agua');
  
  // Verificar que el pozo existe
  if (!this.sprite_pozoxd2) {
    console.error('❌ No se encontró el sprite del pozo');
    return;
  }
  
  // Hacer el pozo interactivo
  this.sprite_pozoxd2.setInteractive({ useHandCursor: true });
  
  // Estado inicial
  this.waterCollectionState = {
    canCollect: false,
    remainingMinutes: 0,
    collectionCycle: 0,
    collectionsToday: 0,
    isDailyLimitReached: false,
    nextAvailableTime: null
  };
  
  // Crear texto para mostrar información.
  // FIX: antes el cartel seguía al puntero (scrollFactor 0 + posición del
  // mouse). Ahora vive en coordenadas de MUNDO, anclado ARRIBA del pozo
  // (origin 0.5,1 = la base del texto apoya sobre el borde superior del pozo).
  this.waterCollectionInfo = this.add.text(0, 0, '', {
    fontFamily: '"PressStart2P"',
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: '#000000aa',
    padding: { x: 10, y: 5 },
    align: 'center',
    lineSpacing: 5
  })
  .setOrigin(0.5, 1)
  .setDepth(99999)
  .setVisible(false);
  
  // Crear borde amarillo cuando el mouse está sobre el pozo
  this.waterWellBorder = this.add.graphics();
  this.waterWellBorder.setDepth(999);
  
  // Evento: mouse sobre el pozo
  this.sprite_pozoxd2.on('pointerover', (pointer) => {
    this.showWaterCollectionInfo(pointer);
    
    // Dibujar borde amarillo
    const bounds = this.sprite_pozoxd2.getBounds();
    this.waterWellBorder.clear();
    this.waterWellBorder.lineStyle(3, 0xFFFF00, 1);
    this.waterWellBorder.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
  });
  
  // Evento: mouse fuera del pozo
  this.sprite_pozoxd2.on('pointerout', () => {
    this.waterCollectionInfo.setVisible(false);
    this.waterWellBorder.clear();
  });
  
  // Evento: clic en el pozo
  this.sprite_pozoxd2.on('pointerdown', async (pointer) => {
    await this.handleWaterCollectionClick(pointer);
  });
  
  // Actualizar estado periódicamente (cada 30 segundos)
  this.time.addEvent({
    delay: 30000,
    callback: this.updateWaterCollectionStatus.bind(this),
    callbackScope: this,
    loop: true
  });
  
  // Actualizar estado inicial
  this.updateWaterCollectionStatus();

  // NOTA: ya no hay listener de pointermove — el cartel queda FIJO arriba
  // del pozo (no sigue al mouse).

  console.log('✅ Sistema de recolección de agua inicializado');
}

/**
 * Muestra la información de recolección (anclada arriba del pozo)
 */
showWaterCollectionInfo(pointer) {
  this.updateWaterCollectionStatus().then(() => {
    this.updateWaterCollectionInfoText();
    this.updateWaterCollectionInfoPosition();
    this.waterCollectionInfo.setVisible(true);
  });
}

/**
 * Actualiza el texto de información
 */
updateWaterCollectionInfoText() {
  const state = this.waterCollectionState;
  let infoText = '💧 POZO DE AGUA\n';
  infoText += `----------------\n`;
  
  if (state.isDailyLimitReached) {
    infoText += `🚫 LÍMITE DIARIO\n`;
    infoText += `5/5 recolecciones\n`;
    if (state.nextAvailableTime) {
      const now = new Date();
      const nextTime = new Date(state.nextAvailableTime);
      const hoursDiff = Math.ceil((nextTime - now) / (1000 * 60 * 60));
      infoText += `⏳ Disponible en:\n${hoursDiff} horas`;
    }
  } else if (state.remainingMinutes > 0) {
    infoText += `📊 Hoy: ${state.collectionsToday}/5\n`;
    infoText += `⏳ Espera: ${state.remainingMinutes}min\n`;
    infoText += `🔁 Ciclo: ${state.collectionCycle + 1}/5`;
  } else if (state.canCollect) {
    infoText += `📊 Hoy: ${state.collectionsToday}/5\n`;
    infoText += `✅ ¡LISTO!\n`;
    infoText += `🔁 Ciclo: ${state.collectionCycle + 1}/5\n`;
    infoText += `🎯 Necesitas:\n• Balde vacío (seleccionado)`;
  } else {
    infoText += '⏳ Cargando estado...';
  }
  
  this.waterCollectionInfo.setText(infoText);
}

/**
 * Actualiza la posición del texto: SIEMPRE centrado arriba del pozo
 * (coordenadas de mundo — ya no depende del puntero).
 */
updateWaterCollectionInfoPosition() {
  if (!this.sprite_pozoxd2 || !this.waterCollectionInfo) return;
  const bounds = this.sprite_pozoxd2.getBounds();
  this.waterCollectionInfo.setPosition(
    bounds.centerX,
    bounds.top - 8
  );
}

/**
 * Actualiza el estado desde el backend
 */
// Función para actualizar el estado de recolección de agua
async updateWaterCollectionStatus() {
  try {
    console.log('💧 Actualizando estado de recolección de agua...');
    
    // Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ No se puede actualizar estado de agua: falta autenticación');
      return;
    }
    
    // Asegurarnos de tener token CSRF
    if (!this.csrfToken) {
      await this.getCSRFToken();
      if (!this.csrfToken) {
        console.error('❌ No se pudo obtener token CSRF para actualizar estado de agua');
        return;
      }
    }
    
    // Preparar headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Añadir token CSRF si está disponible
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
    }
    
    const res = await fetch(`${this.serverBase}/api/water/status/${encodeURIComponent(this.playerName)}`, {
      method: 'GET',
      credentials: 'include',
      headers: headers
    });

    console.log('📊 Status de actualización de agua:', res.status);
    
    if (res.ok) {
      const data = await res.json();
      this.waterCollectionState = {
        canCollect: data.canCollect,
        remainingMinutes: data.remainingMinutes || 0,
        collectionCycle: data.collectionCycle || 0,
        collectionsToday: data.collectionsToday || 0,
        isDailyLimitReached: data.isDailyLimitReached || false,
        nextAvailableTime: data.nextAvailableTime ? new Date(data.nextAvailableTime) : null
      };
      console.log('✅ Estado actualizado:', this.waterCollectionState);
    } else {
      const errorText = await res.text().catch(() => 'No se pudo leer el error');
      console.error('❌ Error al obtener estado del agua:', {
        status: res.status,
        error: errorText
      });
      
      if (res.status === 401 || res.status === 403) {
        console.warn('⚠️ Token expirado al obtener estado de agua');
        this.showTokenErrorHub();
      } else {
        console.warn('No se pudo obtener estado del agua');
      }
    }
  } catch (error) {
    console.error('Error actualizando estado de agua:', error);
  }
}
/**
 * Maneja el clic en el pozo - VERSIÓN CORREGIDA CON AUTENTICACIÓN
 */
async handleWaterCollectionClick(pointer) {
  // Verificar que es clic en el canvas
  const canvas = this.sys.canvas;
  const isCanvasClick = pointer.event.target === canvas || 
                       pointer.event.target.tagName === 'container' ||
                       canvas.contains(pointer.event.target);
  
  if (!isCanvasClick) {
    console.log('Clic en DOM detectado - recolección bloqueada');
    return;
  }
  
  // Verificar balde vacío seleccionado
  if (!this.STATE || !this.STATE.selectedItem || this.STATE.selectedItem.id !== 'balde_vacio') {
    this.notifications.show("Select an empty bucket first", "error");
    return;
  }
  
  // Verificar cantidad
  if (!this.STATE.selectedItem.count || this.STATE.selectedItem.count < 1) {
    this.notifications.show("You have no empty buckets", "error");
    return;
  }
  
  // Verificar estado (si tienes un sistema de cooldown)
  if (this.waterCollectionState && !this.waterCollectionState.canCollect) {
    if (this.waterCollectionState.remainingMinutes > 0) {
      this.notifications.show(
        `Espera ${this.waterCollectionState.remainingMinutes} minutos`, 
        "error"
      );
    } else if (this.waterCollectionState.isDailyLimitReached) {
      this.notifications.show("Daily limit reached. Come back tomorrow.", "error");
    } else {
      this.notifications.show("You cannot collect water right now", "error");
    }
    return;
  }
  
  try {
    // 1. Verificar autenticación
    if (!this.playerName || !this.isAuthenticated) {
      console.error('❌ No autenticado para recolectar agua');
      this.notifications.show('You are not signed in. Please sign in again.', 'error');
      return;
    }
    
    // 2. Asegurarse de tener token CSRF
    if (!this.csrfToken) {
      await this.getCSRFToken();
      if (!this.csrfToken) {
        console.error('❌ No se pudo obtener token CSRF para recolectar agua');
        this.notifications.show('Security error. Please try again.', 'error');
        return;
      }
    }
    
    // 3. Preparar la petición al servidor
    const requestBody = {
      playerName: this.playerName,
      timestamp: new Date().toISOString()
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': window.getCsrfToken(this.csrfToken)
    };
    
    console.log('📤 Enviando petición para recolectar agua...');
    
    // 4. Usar fetchWithTokenRetry (que ya maneja la autenticación y reintentos)
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/water/collect`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    }, 2); // 2 reintentos
    
    console.log('📊 Respuesta del servidor para recolectar agua:', res ? res.status : 'Sin respuesta');
    
    if (!res || !res.ok) {
      const errorText = await res?.text().catch(() => 'No se pudo leer el error') || 'Sin respuesta del servidor';
      console.error('❌ ERROR del servidor al recolectar agua:', {
        status: res?.status,
        error: errorText
      });
      
      // Si es error de autenticación
      if (res?.status === 401 || res?.status === 403) {
        this.showTokenErrorHub();
        return;
      }
      
      // Mostrar error específico
      let errorMessage = 'Error desconocido al recolectar agua';
      try {
        const errorObj = JSON.parse(errorText);
        errorMessage = errorObj.error || errorObj.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      this.notifications.show(errorMessage, 'error');
      return;
    }
    
    const result = await res.json();
    console.log('✅ Resultado de recolección de agua:', result);
    
    if (result.success) {
      // ── RECOLECCIÓN ON-CHAIN ────────────────────────────────────────────
      // El backend ya validó el cooldown/límite diario. Ahora el intercambio
      // de baldes se hace con transacciones blockchain REALES (igual que las
      // semillas y la basura):
      //   TX 1: quitar 1 balde vacío   (ejecutarDivisionRemove → decrease/delete invoice)
      //   TX 2: agregar 1 balde con agua (ejecutarDivision → merge/createInvoice)
      // El éxito de cada una se verifica comparando el inventario antes y
      // después (el patrón usado en el resto del juego, porque esas rutinas
      // no siempre propagan un booleano confiable).
      const defVacio = this.ItemDefinitions ? this.ItemDefinitions['balde_vacio'] : null;
      const defAgua  = this.ItemDefinitions ? this.ItemDefinitions['balde_con_agua'] : null;

      // FIX (el pozo no mandaba ninguna transacción): antes esta condición
      // exigía además `this.relayClient`, pero el relay se crea de forma
      // PEREZOSA dentro de Additemblockchains/RemoveItemBlockchains. Si el
      // jugador usaba el pozo antes de hacer cualquier otra transacción,
      // this.relayClient todavía era undefined y el pozo se iba en silencio al
      // fallback local: el balde cambiaba en el inventario pero no había ni
      // transacción de quitar el balde vacío ni de dar el balde con agua.
      if (defVacio && defVacio.tipo && defAgua && defAgua.tipo) {
        this.notifications.show("💧 Sending the empty bucket transaction…", "info");

        // TX 1: quitar el balde vacío
        const vaciosAntes = this.contarItemEnInventario('balde_vacio');
        try {
          await this.ejecutarDivisionRemove(defVacio.tipo, 'balde_vacio', defVacio.maxStack || 5, 1);
        } catch (err) {
          console.error('❌ Error en transacción de quitar balde vacío:', err);
        }
        const vaciosDespues = this.contarItemEnInventario('balde_vacio');

        if (vaciosAntes - vaciosDespues < 1) {
          this.notifications.show("❌ The empty bucket transaction was not confirmed. Try again.", "error");
          return;
        }

        // TX 2: agregar el balde con agua
        this.notifications.show("💧 Sending the full bucket transaction…", "info");
        const aguaAntes = this.contarItemEnInventario('balde_con_agua');
        try {
          await this.ejecutarDivision(defAgua.tipo, 'balde_con_agua', defAgua.maxStack || 5, 1);
        } catch (err) {
          console.error('❌ Error en transacción de agregar balde con agua:', err);
        }
        const aguaDespues = this.contarItemEnInventario('balde_con_agua');

        if (aguaDespues - aguaAntes < 1) {
          // Compensar: devolver el balde vacío (también on-chain) para no
          // dejar al jugador sin nada.
          this.notifications.show("⚠️ The full bucket was not confirmed — returning the empty bucket…", "error");
          try {
            await this.ejecutarDivision(defVacio.tipo, 'balde_vacio', defVacio.maxStack || 5, 1);
          } catch (err) {
            console.error('❌ Error devolviendo balde vacío:', err);
          }
          return;
        }
      } else {
        // Fallback sin seguimiento on-chain (definiciones o relay no disponibles):
        // comportamiento local anterior.
        const removed = this.removeItemSmart('balde_vacio', 1);

        if (!removed) {
          this.notifications.show("Could not remove the empty bucket", "error");
          return;
        }

        const added = this.addItemWithCheck('balde_con_agua', 1);

        if (!added) {
          // Si no hay espacio, devolver el balde
          this.addItemWithCheck('balde_vacio', 1);
          this.notifications.show("No space left in your inventory", "error");
          return;
        }
      }
      
      // Actualizar estado local
      this.waterCollectionState = {
        canCollect: false,
        remainingMinutes: 20, // 20 minutos para la próxima
        collectionCycle: result.collectionCycle || 0,
        collectionsToday: result.collectionsToday || 0,
        isDailyLimitReached: result.isDailyLimitReached || (result.collectionsToday || 0) >= 5,
        nextAvailableTime: new Date(result.nextAvailableTime || Date.now() + 20 * 60000)
      };
      
      // Mostrar notificación
      let message = `💧 Agua recolectada!\nCiclo ${(result.collectionCycle || 0) + 1}/5`;
      if (result.collectionsToday >= 5) {
        message += '\n¡Límite diario alcanzado!';
      } else {
        message += '\nPróxima en 20 minutos';
      }
      
      this.notifications.show(message, "success");

      // Tutorial (paso 7): obtener agua con el balde termina el tutorial.
      this._onTutorialWaterCollected && this._onTutorialWaterCollected();

      // Actualizar información mostrada (si tienes esta función)
      if (typeof this.updateWaterCollectionInfoText === 'function') {
        this.updateWaterCollectionInfoText();
      }
      
      // Guardar cambios en el servidor
      await this.savegg();
      
    } else {
      throw new Error(result.error || 'Error en el servidor');
    }
    
  } catch (error) {
    console.error('❌ Error recolectando agua:', error);
    this.notifications.show(error.message, "error");
  }
}





















initCropSystem() {

  this.socket.off('cropConfig');
  this.socket.off('plantSuccess');
  this.socket.off('plantError');

  this.cropData = new Map();
  this.plotImages = new Map();
  this.plotTexts = new Map();
  this.cropTypes = {};

  // === NUEVO: cola de siembra pendiente de confirmación on-chain ===
  // Map<plotId, seedType> con los cuadros que el jugador marcó para
  // sembrar pero que todavía no ha presionado ✔. Solo admite UN tipo de
  // semilla a la vez (la que se está armando ahora mismo).
  this.pendingPlantings = new Map();
  this.pendingLabels = new Map();

  // Lotes YA despachados (el jugador ya presionó ✔) cuya transacción
  // on-chain todavía no se resuelve. Cada uno corre de forma independiente
  // en segundo plano, para que el jugador pueda cambiar de tipo de semilla
  // y seguir sembrando de inmediato sin esperar a que termine.
  this._batchesEnVuelo = [];
  // Cuadros que pertenecen a algún lote en vuelo (para no dejar que se
  // vuelvan a encolar/tocar hasta que su transacción se resuelva).
  this._plotsEnVuelo = new Set();

  // BUGFIX: al entrar/salir de la tienda, GameScene se destruye por completo
  // (this.scene.stop()) y al volver se crea una instancia NUEVA. El hub de
  // siembra (✔/✖) es HTML plano inyectado en document.body, así que NO se
  // destruye junto con la escena vieja: si lo dejáramos vivo, sus botones
  // seguirían apuntando a los métodos de la instancia anterior (ya muerta),
  // y al presionar ✖/✔ no pasaría nada visible en la partida actual.
  // Por eso, cada vez que el sistema de cultivos se inicializa, se elimina
  // cualquier hub viejo para que se regenere limpio y enlazado a "this" actual.
  const hubSiembraViejo = document.getElementById('siembra-hub');
  // === NUEVO: cola de corte/cosecha pendiente de confirmación ===
  // Map<plotId, true> con los cuadros (con cultivo) que el jugador marcó
  // para cortar/cosechar pero que todavía no ha confirmado con ✔.
  this.pendingCuts = new Map();
  this.pendingCutLabels = new Map();
  // Cuadros cuya solicitud de corte ya se envió al servidor y sigue en
  // curso (no se pueden volver a tocar hasta que se resuelva).
  this._cutsEnVuelo = new Set();
  // plotId -> {resolve, reject} de la promesa que espera la respuesta del
  // servidor para ESE cuadro específico (ver _solicitarCorte).
  this._corteResolvers = new Map();

  const hubCorteViejo = document.getElementById('corte-hub');
  if (hubCorteViejo) hubCorteViejo.remove();

  // === Cola de RIEGO pendiente (regadera y balde comparten hub) ===
  // Mismo motivo que los otros dos: el hub es HTML plano en document.body, así
  // que sobrevive a que GameScene se destruya al ir a la tienda y hay que
  // borrarlo para que se regenere enlazado a la instancia actual.
  this.pendingWaters = new Map();
  this.pendingWaterLabels = new Map();
  this._watersEnVuelo = new Set();
  const hubRiegoViejo = document.getElementById('riego-hub');
  if (hubRiegoViejo) hubRiegoViejo.remove();

  this.initPlots();
  this.setupCropSocketEvents();
  
  this.socket.emit('getCropConfig');
}

initPlots() {
  const objetosRaw = this.map.getObjectLayer('funcion_siembra_1').objects;
  
  objetosRaw.forEach(obj => {
    if (obj.name && obj.name.startsWith('cuadro')) {
      const x = obj.x + obj.width / 2;
      const y = obj.y + obj.height / 2;
      
      const imagen = this.add.image(x, y, 'tierra_seca');
      
      // GUARDAR TAMAÑO ORIGINAL PARA USARLO SIEMPRE
      imagen.originalWidth = obj.width;
      imagen.originalHeight = obj.height;
      
      imagen.setDisplaySize(obj.width, obj.height);
      imagen.setDepth(0);
      imagen.setInteractive({ useHandCursor: true });
      
      this.plotImages.set(obj.name, imagen);
      
      const progressText = this.add.text(x, y - 40, '', {
        fontFamily: '"PressStart2P"',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#000000AA',
        padding: { x: 6, y: 4 },
        align: 'center'
      }).setOrigin(0.5).setDepth(10).setVisible(false);
      
      this.plotTexts.set(obj.name, progressText);
      
      imagen.on('pointerover', () => {
        const cropData = this.cropData.get(obj.name);
        if (cropData) {
          progressText.setVisible(true);
        }
      });
      
      imagen.on('pointerout', () => {
        progressText.setVisible(false);
      });
      
      imagen.on('pointerdown', (pointer) => {
        this.handlePlotClick(obj.name, pointer);
      });
    }
  });
}

setupCropSocketEvents() {
  this.socket.on('cropConfig', (config) => {
    this.cropTypes = config;
    console.log('✅ Configuración de cultivos recibida:', this.cropTypes);
    this.loadUserCrops();
  });

  this.socket.on('cropPlanted', (data) => {
    //console.log('✅ Semilla plantada en:', data.plotId, 'Posibilidad:', data.successChance + '%');
    if (data.userId === this.currentAccount) {
      this.updatePlotVisual(data.plotId, data.crop);

      // Otorgar experiencia por sembrar (mismo criterio que minería/tala)
      this.nivel_exp = (this.nivel_exp || 0) + 20;
    if (this.lenguaje === 1) {
      console.log('✅ Seed planted - Chance:', data.successChance + '%');
      this.notifications.show(
        `✅ Seed planted - Chance: ${data.successChance}%`, 
        "success"
      );
    } else if (this.lenguaje === 2) {
      console.log('✅ Seed planted - Chance:', data.successChance + '%');
      this.notifications.show(
        `✅ Seed planted - Chance: ${data.successChance}%`, 
        "success"
      );
    } else if (this.lenguaje === 3) {
      console.log('✅ Semilla plantada - Posibilidad:', data.successChance + '%');
      this.notifications.show(
        `✅ Semilla plantada - Posibilidad: ${data.successChance}%`, 
        "success"
      );
    } else if (this.lenguaje === 4) {
      console.log('✅ Semente plantada - Chance:', data.successChance + '%');
      this.notifications.show(
        `✅ Semente plantada - Chance: ${data.successChance}%`, 
        "success"
      );
    } else if (this.lenguaje === 5) {
      console.log('✅ 种子已种植 - 概率:', data.successChance + '%');
      this.notifications.show(
        `✅ 种子已种植 - 概率: ${data.successChance}%`, 
        "success"
      );
    } else if (this.lenguaje === 6) {
      console.log('✅ 씨앗 심기 완료 - 확률:', data.successChance + '%');
      this.notifications.show(
        `✅ 씨앗 심기 완료 - 확률: ${data.successChance}%`, 
        "success"
      );
    }

    }
  });
  
  this.socket.on('plantSuccess', (data) => {
    console.log('✅ Plantación exitosa en:', data.plotId);
    this.updatePlotVisual(data.plotId, data.crop);
  });
  
  this.socket.on('plantError', (data) => {
    console.error('❌ Error al plantar:', data.error);
    this.notifications.show(data.error, "error");
  });
  
  this.socket.on('cropWatered', (data) => {
    console.log('💧 Cultivo regado en:', data.plotId);
    this.queuedAction({ type: 'forSpam2'});
    if (data.userId === this.currentAccount) {
      this.updatePlotVisual(data.plotId, data.crop);
    if (this.lenguaje === 1) {
      console.log('✅ Seed planted - Chance:', data.successChance + '%');
      this.notifications.show(
        `💧 Crop watered`, 
        "success"
      );
    } else if (this.lenguaje === 2) {
       console.log('✅ Seed planted - Chance:', data.successChance + '%');
      this.notifications.show(
        `💧 Crop watered`, 
        "success"
      );
    } else if (this.lenguaje === 3) {
      console.log('✅ Semilla plantada - Posibilidad:', data.successChance + '%');
      this.notifications.show(
        `💧 Cultivo regado`, 
        "success"
      );
    } else if (this.lenguaje === 4) {
      console.log('✅ Semente plantada - Chance:', data.successChance + '%');
      this.notifications.show(
        `💧 Plantação regada`, 
        "success"
      );
    } else if (this.lenguaje === 5) {
      console.log('✅ 种子已种植 - 概率:', data.successChance + '%');
      this.notifications.show(
        `💧 作物已浇水`, 
        "success"
      );
    } else if (this.lenguaje === 6) {
      console.log('✅ 씨앗 심기 완료 - 확률:', data.successChance + '%');
      this.notifications.show(
        `💧 작물에 물 주기 완료`, 
        "success"
      );
    }

      //this.notifications.show(`Cultivo regado en ${data.plotId}`, "info");
    }
  });
  
  this.socket.on('waterSuccess', (data) => {
    console.log('💧 Riego exitoso en:', data.plotId);
    this.updatePlotVisual(data.plotId, data.crop);
  });
  
  this.socket.on('waterError', (data) => {
    this.notifications.show(data.error, "error");
  });
  
  this.socket.on('cropGrowth', (data) => {
    if (data.userId === this.currentAccount) {
      this.updatePlotGrowth(
        data.plotId, 
        data.growthStage, 
        data.isHalfway, 
        data.isCompleted, 
        data.timeRemaining,
        data.cropConfig,
        data.isDead
      );
    }
  });
  
  this.socket.on('harvestSuccess', (data) => {
    console.log('🎉 Cosechado en:', data.plotId, 'Recompensa:', data.rewards);
    this.resetPlot(data.plotId);
    this._onTutorialCut(); // tutorial: cuenta cortes/cosechas (paso 1)

    // Si este resultado pertenece a un lote de corte en curso, resolver esa
    // promesa específica (el fruto se agrega después, agrupado on-chain,
    // en _procesarLoteCorte / _agregarFrutoOnChain) en vez de agregarlo aquí.
    const resolver = this._corteResolvers?.get(data.plotId);
    if (resolver) {
      this._corteResolvers.delete(data.plotId);
      if (data.rewards && data.rewards.item && data.rewards.quantity) {
        resolver.resolve({ item: data.rewards.item, quantity: data.rewards.quantity });
      } else {
        resolver.reject(new Error('Missing rewards'));
      }
      return;
    }

    // Respaldo (no debería ocurrir, ya que ahora toda cosecha pasa por el
    // flujo de lotes, pero se deja por seguridad).
    if (data.rewards && data.rewards.item && data.rewards.quantity) {
      this.addItemWithCheck(data.rewards.item, data.rewards.quantity);
      this.notifications.show(`Harvested! You got ${data.rewards.quantity}x ${this._getFruitDisplayNameEN(data.rewards.item)}`, "success");
    } else {
      console.error('❌ ERROR: Recompensas undefined en harvestSuccess');
      this.notifications.show('Harvested! But there was a problem with the rewards', "warning");
    }
  });
  
  this.socket.on('harvestError', (data) => {
    const resolver = data.plotId ? this._corteResolvers?.get(data.plotId) : null;
    if (resolver) {
      this._corteResolvers.delete(data.plotId);
      resolver.reject(new Error(data.error));
      return;
    }
    this.notifications.show(data.error, "error");
  });
  
  this.socket.on('cutSuccess', (data) => {
    console.log('✂️ Cortado en:', data.plotId, 'Recompensa:', data.rewards, 'Es muerto:', data.isDead, 'En progreso:', data.wasInProgress);
    this.resetPlot(data.plotId);
    this._onTutorialCut(); // tutorial: cuenta cortes/cosechas (paso 1)

    const resolver = this._corteResolvers?.get(data.plotId);
    if (resolver) {
      this._corteResolvers.delete(data.plotId);
      if (data.rewards && data.rewards.item && data.rewards.quantity) {
        resolver.resolve({ item: data.rewards.item, quantity: data.rewards.quantity });
      } else {
        resolver.reject(new Error('Missing rewards'));
      }
      return;
    }

    // Respaldo (no debería ocurrir, ver nota arriba en harvestSuccess).
    if (data.rewards && data.rewards.item && data.rewards.quantity) {
      this.addItemWithCheck(data.rewards.item, data.rewards.quantity);
      
      if (data.isDead) {
        this.notifications.show(`Dead crop cleared! You got ${data.rewards.quantity}x ${this._getFruitDisplayNameEN(data.rewards.item)}`, "warning");
      } else if (data.wasInProgress) {
        this.notifications.show(`Cut early! You got ${data.rewards.quantity}x ${this._getFruitDisplayNameEN(data.rewards.item)}`, "info");
      } else {
        this.notifications.show(`Cut! You got ${data.rewards.quantity}x ${this._getFruitDisplayNameEN(data.rewards.item)}`, "info");
      }
    } else {
      console.error('❌ ERROR: Recompensas undefined en cutSuccess:', data);
      this.notifications.show('Cut! But there was a problem with the rewards', "warning");
    }
  });
  
  this.socket.on('cutError', (data) => {
    const resolver = data.plotId ? this._corteResolvers?.get(data.plotId) : null;
    if (resolver) {
      this._corteResolvers.delete(data.plotId);
      resolver.reject(new Error(data.error));
      return;
    }
    this.notifications.show(data.error, "error");
  });
  
  this.socket.on('userCropsData', (data) => {
    data.crops.forEach(crop => {
      this.updatePlotVisual(crop.plotId, crop);
    });
  });
}

handlePlotClick(plotId, pointer) {
  const cropData = this.cropData.get(plotId);

  if (!this.STATE.selectedItem) {
    // Sin nada en la mano NO significa "hay que sembrar": la parcela puede
    // estar ya sembrada, regada y creciendo. Antes este aviso era
    // incondicional, así que tocando repetidamente una parcela en crecimiento
    // salía "You need to plant a seed" una y otra vez aunque estuviera
    // sembrada. Ahora se informa del estado REAL.
    this._avisarEstadoParcela(plotId, cropData);
    return;
  }

  const selectedItem = this.STATE.selectedItem;
  
  if (this.cropTypes[selectedItem.id]) {
    if (!cropData) {
      if (this._plotsEnVuelo.has(plotId)) {
        // Este cuadro ya forma parte de un lote cuya transacción se envió
        // a blockchain y todavía no se resuelve: no se toca hasta entonces.
        this.notifications.show("This plot is already being processed, please wait", "warning");
        return;
      }
      if (this.pendingPlantings.has(plotId)) {
        // Ya estaba en la cola SIN confirmar todavía: un segundo clic lo saca
        this.unstageSeed(plotId);
      } else {
        this.stageSeed(plotId, selectedItem.id);
      }
    } else {
      this.notifications.show("This plot already has a crop", "error");
    }
  }
  // RIEGO (2026-08-04): la regadera y el balde con agua funcionan EXACTAMENTE
  // igual, y como la siembra: se van marcando las parcelas que se quieren
  // regar y aparece el hub con ✔ / ✖ para confirmar o cancelar todo el lote.
  // Antes la regadera regaba de golpe con cada clic y el balde iba por su
  // cuenta; ahora los dos comparten la misma cola.
  else if (selectedItem.id === 'Regaderax' || selectedItem.id === 'balde_con_agua') {
    const herramienta = selectedItem.id === 'Regaderax' ? 'can' : 'bucket';
    if (!cropData) {
      this.notifications.show("There's no crop to water here", "error");
    } else if (cropData.isWatered) {
      this.notifications.show("This crop is already watered", "error");
    } else if (this._watersEnVuelo && this._watersEnVuelo.has(plotId)) {
      this.notifications.show("This plot is already being processed, please wait", "warning");
    } else if (this.pendingWaters && this.pendingWaters.has(plotId)) {
      // Segundo clic sobre una parcela ya marcada = quitarla de la cola
      this.unstageWater(plotId);
    } else {
      this.stageWater(plotId, herramienta);
    }
  }
  else if (selectedItem.id === 'Tijerasx') {
    if (!cropData) {
      this.notifications.show("There is no crop to cut here", "error");
      return;
    }
    if (this._cutsEnVuelo.has(plotId)) {
      this.notifications.show("This plot is already being processed, please wait", "warning");
      return;
    }
    if (this.pendingCuts.has(plotId)) {
      // Ya estaba en la cola SIN confirmar todavía: un segundo clic lo saca
      this.unstageCut(plotId);
    } else {
      this.stageCut(plotId);
    }
  }
}

/**
 * Avisa del estado real de una parcela cuando se toca SIN nada en la mano.
 * Lleva un antirrebote por parcela: el jugador toca repetidamente (sobre todo
 * con el dedo en el móvil) y si no, se llenaría la pantalla del mismo aviso.
 */
_avisarEstadoParcela(plotId, cropData) {
  const ahora = Date.now();
  this._avisoParcelaEn = this._avisoParcelaEn || {};
  if (ahora - (this._avisoParcelaEn[plotId] || 0) < 1500) return;
  this._avisoParcelaEn[plotId] = ahora;

  // Parcela realmente vacía: el aviso de siempre sí tiene sentido.
  if (!cropData) {
    this._showSaveSuccessBanner('You need to plant a seed', false, true);
    return;
  }

  if (cropData.isDead) {
    this.notifications.show('This crop died — hold the scissors to clear it', 'warning');
    return;
  }

  if (!cropData.isWatered) {
    this.notifications.show('This crop needs water — hold the watering can', 'warning');
    return;
  }

  const restante = Math.max(
    0,
    (Number(cropData.growthDuration) || 0) - (Number(cropData.currentGrowthTime) || 0)
  );
  if (restante > 0) {
    const min = Math.floor(restante / 60);
    const seg = Math.floor(restante % 60);
    this.notifications.show(
      `Growing — ready in ${min}:${String(seg).padStart(2, '0')}`,
      'info'
    );
  } else {
    this.notifications.show('Ready! Hold the scissors to harvest', 'success');
  }
}

calcularPosibilidad(requisitos, jugador) {
  // DISEÑO (pedido del usuario 2026-07-28): en las parcelas se puede sembrar
  // CUALQUIER semilla sin necesidad de niveles ni experiencia en habilidades.
  // Por eso la posibilidad de éxito al sembrar es siempre 100%, sin importar
  // agricultura/fuerza/nivel del jugador ni los requisitos del cultivo.
  return "100.00";

  // eslint-disable-next-line no-unreachable
  let sumaRequisitos = 0;
  let sumaCumplimiento = 0;

  console.log("📊 Evaluando requisitos...");

  for (const [atributo, requerido] of Object.entries(requisitos)) {
    // Si no hay requisito (0), se ignora en el cálculo
    if (requerido === 0) {
      console.log(`🔹 Atributo: ${atributo} - Sin requisito (0), se omite.`);
      continue;
    }

    const valorJugador = Number(jugador[atributo]) || 0;
    const cumplimiento = Math.min(valorJugador / requerido, 1);
    const porcentaje = (cumplimiento * 100).toFixed(2);
    const faltante = Math.max(0, requerido - valorJugador);

    console.log(`🔹 Atributo: ${atributo}`);
    console.log(`   ➝ Necesitas: ${requerido}`);
    console.log(`   ➝ Tienes: ${valorJugador}`);
    console.log(`   ➝ Cumplimiento: ${porcentaje}%`);
    console.log(`   ➝ Te faltan: ${faltante} puntos`);

    sumaRequisitos += requerido;
    sumaCumplimiento += requerido * cumplimiento;
  }

  // Si no hay requisitos (todos son 0), entonces la posibilidad es 100%
  if (sumaRequisitos === 0) {
    console.log("================================");
    console.log("✅ No hay requisitos, posibilidad 100%");
    console.log("================================");
    return "100.00";
  }

  const posibilidadFinal = (sumaCumplimiento / sumaRequisitos) * 100;
  
  // Asegurarse de que no sea NaN
  const posibilidadAjustada = isNaN(posibilidadFinal) 
    ? 100 
    : Math.max(1, Math.min(100, posibilidadFinal));

  console.log("================================");
  console.log(`✅ Posibilidad final: ${posibilidadAjustada.toFixed(2)}%`);
  console.log("================================");

  return posibilidadAjustada.toFixed(2);
}

// ============================================================================
// NUEVO SISTEMA DE SIEMBRA CON CONFIRMACIÓN ON-CHAIN
// ----------------------------------------------------------------------------
// Antes: cada clic en un cuadro sembraba inmediatamente (todo off-chain, sin
// descontar la semilla de ningún lado).
//
// Ahora: cada clic en un cuadro solo "marca" ese cuadro como pendiente
// (se pone en gris) y agrega esa semilla a una cola local. Aparece un hub
// con ✔ (confirmar) y ✖ (cancelar):
//   - ✔ envía UNA sola transacción on-chain que descuenta del inventario
//     (vía ejecutarDivisionRemove, usando la tabla del smart contract que
//     corresponde a esa semilla) la cantidad total de cuadros en cola.
//     Solo si esa transacción se confirma, se procede a sembrar cada cuadro
//     de forma off-chain (igual que antes, vía socket 'plantSeed').
//   - ✖ cancela todo lo pendiente sin tocar el inventario ni enviar nada
//     a blockchain.
// El "recoger" (cosecha) no se toca: sigue funcionando igual que antes.
// ============================================================================

// Cuenta cuántas unidades de un item hay realmente en el inventario
// (independiente de si el item está "en mano" como fantasma, ya que el
// slot de origen conserva su cantidad real hasta que se suelta).
contarItemEnInventario(itemId) {
  let total = 0;
  const sumar = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(slot => {
      if (slot && slot.id === itemId) {
        total += Number(slot.count || slot.quantity || 0);
      }
    });
  };
  sumar(this.STATE?.slots);
  sumar(this.STATE?.quickSlots);
  sumar(this.STATE?.chestSlots);
  sumar(this.casillas);
  sumar(this.casillasExtra);
  return total;
}

// Marca (o desmarca) visualmente un cuadro como "pendiente de siembra"
marcarCuadroPendiente(plotId, activo) {
  const imagen = this.plotImages.get(plotId);
  if (!imagen) return;

  if (activo) {
    imagen.setTint(0x808080); // gris

    if (!this.pendingLabels) this.pendingLabels = new Map();
    if (!this.pendingLabels.has(plotId)) {
      const label = this.add.text(imagen.x, imagen.y - 40, '⏳', {
        fontFamily: '"PressStart2P"',
        fontSize: '14px',
        color: '#ffe600',
        backgroundColor: '#000000AA',
        padding: { x: 6, y: 4 },
        align: 'center'
      }).setOrigin(0.5).setDepth(11);
      this.pendingLabels.set(plotId, label);
    }
  } else {
    imagen.clearTint();
    if (this.pendingLabels && this.pendingLabels.has(plotId)) {
      this.pendingLabels.get(plotId).destroy();
      this.pendingLabels.delete(plotId);
    }
  }
}

// English display names used only inside the plant confirmation hub
_getSeedDisplayNameEN(seedType) {
  const nombres = {
    Semillax: 'Carrot Seeds',
    Semillax1: 'Tomato Seeds',
    Semillax2: 'Wheat Seeds',
    Semillax3: 'Pumpkin Seeds'
  };
  return nombres[seedType] || seedType;
}

// Cuenta cuántas unidades de un tipo de semilla están comprometidas en
// lotes que ya se enviaron a blockchain pero cuya transacción no se ha
// resuelto todavía.
contarReservadasEnVuelo(seedType) {
  let total = 0;
  for (const lote of this._batchesEnVuelo) {
    if (lote.seedType === seedType) total += lote.plotIds.length;
  }
  return total;
}

// Agrega un cuadro a la cola de siembra pendiente
stageSeed(plotId, seedType) {
  const cropConfig = this.cropTypes[seedType];
  if (!cropConfig) {
    this.notifications.show("Invalid seed type", "error");
    return;
  }

  // Solo se permite un tipo de semilla activo en la cola SIN confirmar.
  // Una vez que se presiona ✔, ese lote se despacha y sale de esta cola
  // de inmediato, así que esto no bloquea cambiar de semilla mientras un
  // lote anterior sigue confirmándose en segundo plano.
  if (this.pendingPlantings.size > 0) {
    const tipoActivo = this.pendingPlantings.values().next().value;
    if (tipoActivo !== seedType) {
      this.notifications.show(
        "Finish or cancel the current planting before switching seeds",
        "error"
      );
      return;
    }
  }

  // No dejar encolar más de lo que realmente hay disponible, restando lo
  // que ya está comprometido en la cola actual y en lotes en vuelo de ese
  // mismo tipo (para no ofrecer más semillas de las que realmente quedan).
  const disponibles = this.contarItemEnInventario(seedType);
  const reservadas = this.pendingPlantings.size + this.contarReservadasEnVuelo(seedType);
  if (reservadas >= disponibles) {
    this.notifications.show("You don't have any more seeds available", "error");
    return;
  }

  // Verificar que alcance el agua/comida para todos los cuadros en cola
  // (se descuentan realmente al confirmar, aquí solo se valida).
  //
  // FIX (2026-08-03): antes salía un escueto "Not enough resources to plant N
  // seed(s)" que no decía QUÉ faltaba ni CUÁNTAS semillas sí se podían poner,
  // así que parecía un fallo del juego al intentar sembrar la segunda o la
  // tercera. Ahora se calcula el máximo real y se explica exactamente lo que
  // falta. Además, los costes se leen con valores por defecto: si la config
  // del cultivo llega incompleta del servidor, `undefined * n` daba NaN y la
  // comprobación se saltaba sin avisar.
  const costoAgua   = Number(cropConfig.waterCost);
  const costoComida = Number(cropConfig.foodCost);
  const cAgua   = Number.isFinite(costoAgua)   && costoAgua   > 0 ? costoAgua   : 0;
  const cComida = Number.isFinite(costoComida) && costoComida > 0 ? costoComida : 0;

  const agua   = Number(this.aguaPorcentaje)   || 0;
  const comida = Number(this.comidaPorcentaje) || 0;

  const cantidadFutura = this.pendingPlantings.size + 1;
  const maxPorAgua   = cAgua   > 0 ? Math.floor(agua   / cAgua)   : Infinity;
  const maxPorComida = cComida > 0 ? Math.floor(comida / cComida) : Infinity;
  const maxPosible   = Math.min(maxPorAgua, maxPorComida);

  if (cantidadFutura > maxPosible) {
    const faltas = [];
    if (cAgua   > 0 && agua   < cAgua   * cantidadFutura) {
      faltas.push(`${Math.ceil(cAgua * cantidadFutura - agua)} more water`);
    }
    if (cComida > 0 && comida < cComida * cantidadFutura) {
      faltas.push(`${Math.ceil(cComida * cantidadFutura - comida)} more food`);
    }
    const detalle = faltas.length ? ` — you need ${faltas.join(' and ')}` : '';
    this.notifications.show(
      maxPosible > 0
        ? `You can only plant ${maxPosible} seed(s) right now${detalle}. Eat or drink to plant more.`
        : `You don't have enough water/food to plant${detalle}. Eat or drink first.`,
      "error"
    );
    return;
  }

  this.pendingPlantings.set(plotId, seedType);
  this.marcarCuadroPendiente(plotId, true);
  this.showSiembraHub();
}

// Saca un cuadro de la cola de siembra pendiente
unstageSeed(plotId) {
  this.pendingPlantings.delete(plotId);
  this.marcarCuadroPendiente(plotId, false);

  if (this.pendingPlantings.size === 0) {
    this.hideSiembraHub();
  } else {
    this.updateSiembraHub();
  }
}

// Crea el HUD flotante con los botones ✔ / ✖. Si ya existe (o hay
// duplicados por algún motivo), limpia todo antes de crear uno solo.
ensureSiembraHubDOM() {
  const existentes = document.querySelectorAll('#siembra-hub');
  if (existentes.length > 1) {
    existentes.forEach(el => el.remove()); // limpiar duplicados, se crea uno nuevo abajo
  }

  let hub = document.getElementById('siembra-hub');

  if (!hub) {
    hub = document.createElement('div');
    hub.id = 'siembra-hub';
    hub.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20,20,20,0.92);
      border: 2px solid #4caf50;
      border-radius: 12px;
      padding: 12px 18px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 9999;
      font-family: "PressStart2P", monospace;
      color: #fff;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      pointer-events: auto;
    `;
    // Forzar con !important por si el CSS del juego tiene reglas globales
    // (ej. algún selector con !important) que pisen el display inline.
    hub.style.setProperty('display', 'none', 'important');

    const label = document.createElement('div');
    label.id = 'siembra-hub-label';
    label.style.cssText = 'font-size: 10px; text-align:center;';
    label.textContent = 'Seeds ready to plant: 0';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:14px;';

    const btnCheck = document.createElement('button');
    btnCheck.id = 'siembra-hub-confirm';
    btnCheck.textContent = '✔';
    btnCheck.title = 'Confirm planting (sends the transaction)';
    btnCheck.style.cssText = `
      width: 46px; height: 46px; border-radius: 50%; border: none;
      background: #2e7d32; color: #fff; font-size: 20px; cursor: pointer;
    `;

    const btnX = document.createElement('button');
    btnX.id = 'siembra-hub-cancel';
    btnX.textContent = '✖';
    btnX.title = 'Cancel planting';
    btnX.style.cssText = `
      width: 46px; height: 46px; border-radius: 50%; border: none;
      background: #c62828; color: #fff; font-size: 20px; cursor: pointer;
    `;

    row.appendChild(btnCheck);
    row.appendChild(btnX);
    hub.appendChild(label);
    hub.appendChild(row);
    document.body.appendChild(hub);
  }

  // BUGFIX CLAVE: sin importar si el hub ya existía de antes (ej. si por
  // algún motivo sobrevivió entre instancias de GameScene al volver de la
  // tienda), los botones se RECONECTAN a la instancia ACTUAL cada vez que
  // se llama a esta función (que pasa cada vez que se muestra el hub). Así
  // es imposible que queden apuntando a una instancia vieja y "no
  // respondan" (que se veía como el check trancado y la X sin limpiar).
  const btnCheckActual = document.getElementById('siembra-hub-confirm');
  const btnXActual = document.getElementById('siembra-hub-cancel');
  if (btnCheckActual) btnCheckActual.onclick = () => this.confirmSiembraPendiente();
  if (btnXActual) btnXActual.onclick = () => this.cancelSiembraPendiente();
}

showSiembraHub() {
  this.ensureSiembraHubDOM();
  // setProperty(..., 'important') para que no lo pise ningún !important
  // del CSS global del juego (ya pasó antes con el panel de skills).
  document.querySelectorAll('#siembra-hub').forEach(hub => {
    hub.style.setProperty('display', 'flex', 'important');
  });
  this.updateSiembraHub();
}

hideSiembraHub() {
  // querySelectorAll (no solo getElementById) por si en algún momento
  // quedó más de un nodo con este id en el DOM.
  document.querySelectorAll('#siembra-hub').forEach(hub => {
    hub.style.setProperty('display', 'none', 'important');
  });
}

updateSiembraHub() {
  const label = document.getElementById('siembra-hub-label');
  if (!label) return;

  let nombreSemilla = '';
  if (this.pendingPlantings.size > 0) {
    const seedType = this.pendingPlantings.values().next().value;
    nombreSemilla = this._getSeedDisplayNameEN(seedType);
  }

  label.textContent = nombreSemilla
    ? `${nombreSemilla}: ${this.pendingPlantings.size} ready to plant`
    : `Seeds ready to plant: ${this.pendingPlantings.size}`;
}

// ✔ Confirmar: UNA sola transacción on-chain que descuenta todas las
// semillas en cola y, si se confirma, siembra cada cuadro off-chain.
// Bloquea (visualmente, en rojo, igual que .slot-locked) las casillas del
// INVENTARIO y del HOTBAR que contienen esta semilla, de forma INDEPENDIENTE
// del candado nativo (.slot-locked / lockSlotLocal / unlockAllSlotsLocal).
//
// ¿Por qué no reutilizar .slot-locked directamente? Porque ese candado es
// GLOBAL: cuando CUALQUIER transacción termina, llama a unlockAllSlotsLocal()
// y quita el candado de TODAS las casillas, incluidas las de otro lote de
// siembra que todavía sigue en blockchain. Además, ejecutarDivisionRemove
// encola las llamadas una tras otra (this._removeItemQueue), así que la
// casilla de un segundo lote ni siquiera se bloqueaba hasta que el primero
// terminaba. Por eso esta casilla se bloquea manualmente aquí mismo, apenas
// se presiona ✔, sin depender de cuándo le toque su turno en esa cola.
_bloquearCasillasDeSemilla(seedType) {
  const elementosBloqueados = [];

  const marcar = (arr, selectorTipo) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((slot, index) => {
      if (slot && slot.id === seedType) {
        const el = document.querySelector(`${selectorTipo}[data-slot-index="${index}"]`);
        if (el && !elementosBloqueados.includes(el)) {
          el.style.setProperty('filter', 'brightness(0.7) sepia(1) hue-rotate(-50deg) saturate(5)');
          el.style.setProperty('border', '2px solid #ff0000', 'important');
          el.style.setProperty('box-shadow', '0 0 10px #ff0000');
          el.style.setProperty('opacity', '0.8');
          el.style.setProperty('pointer-events', 'none', 'important');
          elementosBloqueados.push(el);
        }
      }
    });
  };

  // Cubre los dos lados: el inventario completo Y las casillas de selección (hotbar)
  marcar(this.STATE?.slots, '.inv-slot');
  marcar(this.STATE?.quickSlots, '.quick-slot');

  return elementosBloqueados;
}

// Quita el bloqueo visual puesto por _bloquearCasillasDeSemilla, solo de
// los elementos que ese lote específico bloqueó (no toca los de otros lotes).
_desbloquearCasillas(elementos) {
  if (!Array.isArray(elementos)) return;
  elementos.forEach(el => {
    if (!el) return;
    el.style.removeProperty('filter');
    el.style.removeProperty('border');
    el.style.removeProperty('box-shadow');
    el.style.removeProperty('opacity');
    el.style.removeProperty('pointer-events');
  });
}

// ✔ Confirmar: despacha el lote actual EN SEGUNDO PLANO y libera la cola
// de inmediato, para que el jugador pueda elegir otra semilla y seguir
// sembrando sin tener que esperar a que esta transacción se resuelva.
// Suelta el ítem que el jugador tiene "en mano" (el cursor fantasma) y lo
// devuelve a su casilla de origen, EXACTAMENTE igual que lo hace
// _ejecutarDivisionRemoveInterno internamente... pero de inmediato, sin
// esperar a que a esta transacción le toque su turno en this._removeItemQueue
// (esa cola interna es la razón por la que, al sembrar una segunda bolsa
// mientras la primera todavía sigue en blockchain, el ítem se quedaba
// "pegado" en el cursor hasta que la primera terminara).
_soltarGhostDeSemilla(seedType) {
  const cursorItem = this.STATE?.selectedItem;
  if (!cursorItem || !cursorItem.isGhost || cursorItem.id !== seedType) return;

  const slotArr = cursorItem.originType === 'inv' ? this.STATE.slots : this.STATE.quickSlots;
  const ghostArr = cursorItem.originType === 'inv'
    ? this.STATE.ghostSlots?.inv
    : this.STATE.ghostSlots?.quick;

  if (slotArr) {
    slotArr[cursorItem.originIndex] = {
      id: cursorItem.id,
      count: cursorItem.count,
      idx: cursorItem.idx ?? null,
      idm: cursorItem.idm ?? null
    };
  }
  if (ghostArr) {
    ghostArr[cursorItem.originIndex] = null;
  }

  this.STATE.selectedItem = null;
  this.stopDrag && this.stopDrag();
  this.renderSlot(cursorItem.originIndex);
}

// Consulta al servidor si hay una sanción activa por sembrar de a una,
// SIN registrar ningún intento nuevo (es una consulta de solo lectura).
// Si el servidor no responde en 3s (problema de red, etc.) se asume que
// no está bloqueado, para no dejar al jugador trabado por eso.
_consultarBloqueoSiembra() {
  return new Promise((resolve) => {
    let resuelto = false;
    const finalizar = (data) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeout);
      this.socket.off('plantLockStatus', finalizar);

      // A PRUEBA DE FALLOS: si la respuesta no trae un booleano "locked"
      // claro (ej. no llegó nada, o el servidor respondió un error de
      // autenticación justo después de reconectar al salir de la tienda),
      // se trata como BLOQUEADO temporalmente en vez de asumir que está
      // libre. Es preferible pedir que se reintente en unos segundos a
      // arriesgar una transacción real que termine desperdiciada porque no
      // se pudo confirmar con certeza que la siembra estaba permitida.
      if (!data || typeof data.locked !== 'boolean') {
        resolve({ locked: true, secondsRemaining: 5, _verificacionFallida: true });
      } else {
        resolve(data);
      }
    };

    const timeout = setTimeout(() => finalizar(null), 3000);
    this.socket.once('plantLockStatus', finalizar);
    this.socket.emit('checkPlantLock', { userId: this.currentAccount });
  });
}

async confirmSiembraPendiente() {
  if (this.pendingPlantings.size === 0) return;
  if (this._verificandoBloqueoSiembra) return;

  // BUGFIX: antes, la sanción por sembrar de a una solo bloqueaba la
  // creación del cultivo (off-chain), pero la transacción que descuenta
  // las semillas YA se había mandado antes de eso — es decir, si estabas
  // sancionado igual perdías las semillas sin sembrar nada. Ahora se
  // consulta el bloqueo PRIMERO, antes de tocar la cola, soltar el cursor,
  // bloquear casillas o mandar cualquier transacción. Si está bloqueado,
  // no se toca NADA: los cuadros siguen en cola tal cual (se puede seguir
  // esperando y presionar ✔ de nuevo más tarde, o cancelar con ✖).
  this._verificandoBloqueoSiembra = true;
  let candado;
  try {
    candado = await this._consultarBloqueoSiembra();
  } finally {
    this._verificandoBloqueoSiembra = false;
  }

  if (candado.locked) {
    if (candado._verificacionFallida) {
      this._showSaveSuccessBanner(
        "Couldn't confirm it's safe to plant right now. Please wait a moment and press the check mark again.",
        true
      );
    } else {
      const minutos = Math.max(1, Math.ceil(candado.secondsRemaining / 60));
      this._showSaveSuccessBanner(
        `Planting is temporarily locked for ${minutos} more minute(s) (you planted seeds one at a time too often). Your queued plots are still saved — press the check mark again once the lock ends, or cancel with X.`,
        true
      );
    }
    return;
  }

  const entradas = Array.from(this.pendingPlantings.entries()); // [[plotId, seedType], ...]
  const seedType = entradas[0][1];
  const plotIds = entradas.map(([plotId]) => plotId);

  // Se saca de la cola visible YA MISMO (no se espera la transacción), y
  // se marca como "en vuelo" para que no se pueda volver a tocar hasta que
  // se resuelva. El tinte gris / ⏳ se mantienen puestos en esos cuadros.
  this.pendingPlantings.clear();
  this.hideSiembraHub();
  plotIds.forEach(plotId => this._plotsEnVuelo.add(plotId));

  // Soltar el ítem del cursor YA, sin esperar a que le toque su turno en la
  // cola interna de ejecutarDivisionRemove (que puede seguir detrás de otro
  // lote todavía en curso).
  this._soltarGhostDeSemilla(seedType);

  // La casilla de esa semilla (inventario y/o hotbar) se bloquea en rojo
  // AHORA MISMO, sin esperar a que le toque su turno en la cola interna de
  // ejecutarDivisionRemove.
  const slotsBloqueados = this._bloquearCasillasDeSemilla(seedType);

  const lote = { seedType, plotIds, slotsBloqueados };
  this._batchesEnVuelo.push(lote);

  // Fire-and-forget: esto corre de forma independiente y no bloquea al
  // jugador para que siga sembrando otro tipo de semilla mientras tanto.
  this._procesarLoteSiembra(lote);
}

// Envía la transacción on-chain de UN lote y, según el resultado, siembra
// (off-chain) los cuadros que realmente se lograron descontar.
async _procesarLoteSiembra(lote) {
  const { seedType, plotIds, slotsBloqueados } = lote;
  const cantidadTotal = plotIds.length;
  const nombreSemilla = this._getSeedDisplayNameEN(seedType);

  const liberarLote = () => {
    const idx = this._batchesEnVuelo.indexOf(lote);
    if (idx !== -1) this._batchesEnVuelo.splice(idx, 1);
    this._desbloquearCasillas(slotsBloqueados);
  };

  const def = this.ItemDefinitions ? this.ItemDefinitions[seedType] : null;
  if (!def || !def.tipo) {
    this.notifications.show("Invalid seed configuration for blockchain", "error");
    plotIds.forEach(plotId => {
      this.marcarCuadroPendiente(plotId, false);
      this._plotsEnVuelo.delete(plotId);
    });
    liberarLote();
    return;
  }

  this.notifications.show(
    `Sending transaction to deduct ${cantidadTotal} ${nombreSemilla}...`,
    "info"
  );

  // BUGFIX: ejecutarDivisionRemove() en realidad no propaga el booleano de
  // éxito de RemoveItemBlockchains hacia arriba (_ejecutarDivisionRemoveInterno
  // no hace "return" de ese valor), así que SIEMPRE resolvía como undefined
  // aquí, aunque la transacción sí se hubiera confirmado en blockchain.
  // En vez de confiar en ese valor de retorno, se verifica el éxito real
  // comparando cuántas semillas había en el inventario antes y después de
  // la llamada (esa parte del inventario sí se actualiza de forma confiable
  // dentro de RemoveItemBlockchains cuando la transacción se confirma).
  const cantidadAntes = this.contarItemEnInventario(seedType);

  try {
    // Una sola llamada, con la cantidad TOTAL del lote: esto ya envía UNA
    // transacción agrupada (salvo que las semillas estén repartidas en más
    // de una "invoice"/stack en el contrato, en cuyo caso el propio sistema
    // de blockchain necesita una transacción por cada una de esas facturas;
    // eso no depende de este flujo de siembra). NOTA: internamente
    // ejecutarDivisionRemove encola esta llamada detrás de cualquier otra
    // que ya esté en curso (this._removeItemQueue), así que el envío real
    // a blockchain puede esperar su turno; por eso la casilla ya se bloqueó
    // manualmente arriba, en vez de depender del candado nativo del sistema.
    // ruta_tabla = def.tipo (ej. "bolsa de calabazas")
    // producto   = seedType (ej. "Semillax3")
    // limitacion = def.maxStack (ej. 50)
    // cantidad   = cantidadTotal (cuántos cuadros trae este lote)
    await this.ejecutarDivisionRemove(def.tipo, seedType, def.maxStack || 50, cantidadTotal);
  } catch (err) {
    console.error('❌ Error descontando semillas on-chain:', err);
  }

  const cantidadDespues = this.contarItemEnInventario(seedType);
  const descontadas = Math.max(0, cantidadAntes - cantidadDespues);

  if (descontadas <= 0) {
    this.notifications.show(
      `Could not confirm the planting transaction for ${nombreSemilla}. Select the seed and try planting those plots again.`,
      "error"
    );
    plotIds.forEach(plotId => {
      this.marcarCuadroPendiente(plotId, false);
      this._plotsEnVuelo.delete(plotId);
    });
    liberarLote();
    return;
  }

  // Se siembra (off-chain) exactamente la cantidad de cuadros cuya semilla
  // realmente se logró descontar. Si la transacción descontó menos de lo
  // pedido (éxito parcial), el resto simplemente se libera para que el
  // jugador lo intente de nuevo si quiere (no se pierde ni se cobra de más).
  const aSembrar = plotIds.slice(0, descontadas);
  const sobrantes = plotIds.slice(descontadas);

  // FIX (2026-08-03): el agua/comida se descuenta AQUÍ, de una vez y por todo
  // el lote confirmado, y luego se siembra sin volver a comprobar. Antes cada
  // plantSeed() revisaba las barras por su cuenta: si mientras la transacción
  // estaba en curso el jugador gastaba agua (talando, por ejemplo), esos
  // cuadros ya no se sembraban... pero la semilla YA se había descontado
  // on-chain. Es decir, se perdían semillas de verdad. Con el descuento hecho
  // aquí, lo que se pagó en blockchain siempre se siembra.
  const cfgLote = this.cropTypes[seedType] || {};
  const cAgua   = Number(cfgLote.waterCost) > 0 ? Number(cfgLote.waterCost) : 0;
  const cComida = Number(cfgLote.foodCost)  > 0 ? Number(cfgLote.foodCost)  : 0;
  if (aSembrar.length > 0 && (cAgua > 0 || cComida > 0)) {
    if (cAgua > 0) {
      this.actualizarBarraAgua(Math.max(0, (Number(this.aguaPorcentaje) || 0) - cAgua * aSembrar.length));
    }
    if (cComida > 0) {
      this.actualizarBarraComida(Math.max(0, (Number(this.comidaPorcentaje) || 0) - cComida * aSembrar.length));
    }
  }

  for (const plotId of aSembrar) {
    this.marcarCuadroPendiente(plotId, false);
    this._plotsEnVuelo.delete(plotId);
    this.plantSeed(plotId, seedType, { recursosYaDescontados: true });
  }

  if (sobrantes.length > 0) {
    this.notifications.show(
      `Only ${descontadas} of ${cantidadTotal} ${nombreSemilla} were confirmed. Select the seed and try planting the rest again.`,
      "warning"
    );
    sobrantes.forEach(plotId => {
      this.marcarCuadroPendiente(plotId, false);
      this._plotsEnVuelo.delete(plotId);
    });
  }

  liberarLote();
}

// ✖ Cancelar: limpia SOLO la cola sin confirmar todavía (no toca los
// lotes que ya se despacharon a blockchain; esos ya no se pueden cancelar).
// Desbloquea por la fuerza cualquier casilla (inventario/hotbar) de este
// item que haya quedado con el bloqueo visual puesto, sin depender de
// ninguna referencia guardada. Es una limpieza defensiva: si nunca hubo
// nada bloqueado, esto simplemente no hace nada.
_forzarDesbloqueoCasillasDeItem(itemId) {
  const limpiar = (arr, selectorTipo) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((slot, index) => {
      if (slot && slot.id === itemId) {
        const el = document.querySelector(`${selectorTipo}[data-slot-index="${index}"]`);
        if (el) {
          el.style.removeProperty('filter');
          el.style.removeProperty('border');
          el.style.removeProperty('box-shadow');
          el.style.removeProperty('opacity');
          el.style.removeProperty('pointer-events');
        }
      }
    });
  };
  limpiar(this.STATE?.slots, '.inv-slot');
  limpiar(this.STATE?.quickSlots, '.quick-slot');
}

cancelSiembraPendiente() {
  // Por seguridad: si por algún motivo la casilla de esta semilla quedó
  // bloqueada (ej. de un intento anterior que no se haya liberado bien),
  // se limpia aquí también al cancelar, aunque en el flujo normal esto no
  // debería hacer falta.
  const seedType = this.pendingPlantings.size > 0
    ? this.pendingPlantings.values().next().value
    : null;

  for (const plotId of this.pendingPlantings.keys()) {
    this.marcarCuadroPendiente(plotId, false);
  }
  this.pendingPlantings.clear();
  this.hideSiembraHub();

  if (seedType) {
    // No forzar el desbloqueo si hay un lote REALMENTE en vuelo de este
    // mismo tipo de semilla (esa casilla sigue legítimamente bloqueada
    // mientras esa transacción se resuelve).
    const hayLoteEnVueloDeEsteMismoTipo = this._batchesEnVuelo.some(l => l.seedType === seedType);
    if (!hayLoteEnVueloDeEsteMismoTipo) {
      this._forzarDesbloqueoCasillasDeItem(seedType);
    }
  }
}

/**
 * @param {object} [opciones]
 * @param {boolean} [opciones.recursosYaDescontados]  true cuando el lote ya
 *        pagó el agua/comida de todos sus cuadros en _procesarLoteSiembra.
 *        En ese caso NO se vuelve a cobrar ni a comprobar: la semilla ya se
 *        descontó en blockchain y tiene que sembrarse sí o sí.
 */
plantSeed(plotId, seedType, opciones = {}) {
  const cropConfig = this.cropTypes[seedType];
  if (!cropConfig) {
    this.notifications.show("Invalid seed type", "error");
    return;
  }

  const requisitos = { 
    agricultura: cropConfig.agricultureReq, 
    fuerza: cropConfig.strengthReq, 
    nivel: cropConfig.levelReq
  };
  
  const jugador = { 
    agricultura: this.agricultura, 
    fuerza: this.fuerza, 
    nivel: this.nivel 
  };

  const posibilidad = this.calcularPosibilidad(requisitos, jugador);
  const posibilidadNumero = parseFloat(posibilidad);

  console.log(`🎯 Posibilidad de éxito para ${cropConfig.name}: ${posibilidad}%`);
  console.log(`📦 Recompensa normal: ${cropConfig.rewards.quantity} ${cropConfig.rewards.item}`);
  console.log(`🌱 Recompensa progreso: ${cropConfig.rewards.progress_quantity} ${cropConfig.rewards.progress_reward}`);
  console.log(`💀 Recompensa muerta: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);

  const alcanzan =
    opciones.recursosYaDescontados === true ||
    (this.aguaPorcentaje >= cropConfig.waterCost && this.comidaPorcentaje >= cropConfig.foodCost);

  if (alcanzan) {
    if (opciones.recursosYaDescontados !== true) {
      this.actualizarBarraAgua(this.aguaPorcentaje - cropConfig.waterCost);
      this.actualizarBarraComida(this.comidaPorcentaje - cropConfig.foodCost);
    }

    this.socket.emit('plantSeed', {
      userId: this.currentAccount,
      plotId: plotId,
      seedType: seedType,
      userStats: {
        agricultura: this.agricultura,
        fuerza: this.fuerza,
        nivel: this.nivel
      },
      successChance: posibilidadNumero
    });

    /*

    this.notifications.show(
      `Plantando ${cropConfig.name} - Posibilidad: ${posibilidad}% | Recompensa: ${cropConfig.rewards.quantity} ${cropConfig.rewards.item} | Progreso: ${cropConfig.rewards.progress_quantity} ${cropConfig.rewards.progress_reward} | Muerto: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`, 
      "info"
    );
    */
    
  } else {
    this.notifications.show(
      `Not enough resources. You need ${cropConfig.waterCost} water and ${cropConfig.foodCost} food`, 
      "error"
    );
  }
}

/**
 * Riego de UNA sola parcela con la regadera.
 *
 * Desde 2026-08-04 el flujo normal ya no pasa por aquí: la regadera y el balde
 * usan la cola con ✔/✖ (stageWater → confirmRiegoPendiente). Este método se
 * conserva porque sigue siendo la forma más corta de regar una parcela suelta
 * desde código (tutorial, pruebas) sin montar un lote.
 */
async waterCrop(plotId) {
  const cropData = this.cropData.get(plotId);
  if (!cropData) return;

  const cropConfig = this.cropTypes[cropData.cropType] || cropData.cropConfig;
  if (!cropConfig) return;

  if (this.aguaPorcentaje >= cropConfig.wateringCost) {
    this.actualizarBarraAgua(this.aguaPorcentaje - cropConfig.wateringCost);

    this.socket.emit('waterCrop', {
      userId: this.currentAccount,
      plotId: plotId
    });

    // Desgastar la regadera (mismo mecanismo de "usos" -> rotura -> transacción
    // on-chain que ya se usa con hachas y picos).
    if (this.STATE.selectedItem && this.STATE.selectedItem.idx) {
      await this.verificarRompimiento(this.STATE.selectedItem);
    }
  } else {
    this.notifications.show(`You need ${cropConfig.wateringCost} water to water this crop`, "error");
  }
}

// ============================================================================
// BALDE DE AGUA  (2026-08-03, simplificado el 2026-08-05)
// ----------------------------------------------------------------------------
// Un balde con agua riega DOS parcelas. Se gasta ENTERO en el momento de
// confirmar: sale `balde_con_agua` y entra `balde_vacio`, las dos con
// transacciones reales. Cada confirmación paga sus propios baldes:
//   1 parcela → 1 balde · 2 → 1 · 3 → 2 · 4 → 2 …
//
// Antes se guardaba el medio balde sobrante para el siguiente riego. Sonaba
// bien, pero producía algo desconcertante: regabas UNA parcela y no se te
// descontaba nada (estabas gastando el resto de un balde de hace rato). Ahora
// el sobrante se pierde con el balde, que es lo que el jugador espera.
//
// El agua sale del balde, no del jugador: regar así NO baja la barra de agua.
// ============================================================================

_bucketWaterKey() {
  return `gf_bucket_water_${String(this.currentAccount || 'anon').toLowerCase()}`;
}

/**
 * Riegos sueltos que quedaran guardados de la versión anterior. Ya no se
 * generan nuevos, pero se sigue leyendo para poder LIMPIARLOS: si no, un
 * jugador con crédito viejo en su navegador seguiría regando gratis.
 */
_getBucketWaterCredit() {
  try {
    const v = parseInt(localStorage.getItem(this._bucketWaterKey()) || '0', 10);
    return Math.max(0, Number.isFinite(v) ? v : 0);
  } catch (_) {
    return Math.max(0, this._bucketWaterCreditMem || 0);
  }
}

_setBucketWaterCredit(n) {
  const v = Math.max(0, Number(n) || 0);
  this._bucketWaterCreditMem = v;
  try {
    if (v > 0) localStorage.setItem(this._bucketWaterKey(), String(v));
    else localStorage.removeItem(this._bucketWaterKey());
  } catch (_) {}
}

/** Cuántas parcelas riega un balde lleno. */
get BUCKET_PLOTS_PER_FILL() { return 2; }

// ── COLA DE RIEGO CON ✔ / ✖ ─────────────────────────────────────────────
// Igual que la siembra y el corte: se marcan las parcelas que se quieren
// regar y aparece un hub flotante para confirmarlas todas de una vez.
// Funciona con la REGADERA y con el BALDE CON AGUA exactamente igual; lo
// único que cambia es de dónde sale el agua:
//   • Regadera → gasta la barra de agua del jugador y desgasta la herramienta.
//   • Balde    → un balde riega DOS parcelas y se convierte en balde vacío,
//                sin tocar la barra de agua del jugador.

_asegurarEstructurasRiego() {
  if (!this.pendingWaters)      this.pendingWaters = new Map();      // plotId → 'can' | 'bucket'
  if (!this.pendingWaterLabels) this.pendingWaterLabels = new Map();
  if (!this._watersEnVuelo)     this._watersEnVuelo = new Set();
}

/** Marca (o desmarca) una parcela como "pendiente de riego": azul + 💧 */
marcarCuadroPendienteRiego(plotId, activo) {
  this._asegurarEstructurasRiego();
  const imagen = this.plotImages.get(plotId);
  if (!imagen) return;

  if (activo) {
    imagen.setTint(0x66b3ff);
    if (!this.pendingWaterLabels.has(plotId)) {
      const label = this.add.text(imagen.x, imagen.y - 40, '💧', {
        fontFamily: '"PressStart2P"',
        fontSize: '14px',
        color: '#bfe9ff',
        backgroundColor: '#000000AA',
        padding: { x: 6, y: 4 },
        align: 'center'
      }).setOrigin(0.5).setDepth(11);
      this.pendingWaterLabels.set(plotId, label);
    }
  } else {
    imagen.clearTint();
    if (this.pendingWaterLabels.has(plotId)) {
      this.pendingWaterLabels.get(plotId).destroy();
      this.pendingWaterLabels.delete(plotId);
    }
  }
}

stageWater(plotId, herramienta) {
  this._asegurarEstructurasRiego();

  // Una sola herramienta activa por lote: mezclar regadera y balde en la
  // misma cola haría imposible saber qué se cobra a cada parcela.
  if (this.pendingWaters.size > 0) {
    const activa = this.pendingWaters.values().next().value;
    if (activa !== herramienta) {
      this.notifications.show(
        'Finish or cancel the current watering before switching tools',
        'error'
      );
      return;
    }
  }

  // No dejar encolar más de lo que se puede pagar.
  const futuras = this.pendingWaters.size + 1;
  if (herramienta === 'bucket') {
    const disponibles = this._baldesDisponiblesParaRiego();
    if (futuras > disponibles) {
      this.notifications.show(
        disponibles > 0
          ? `Your buckets only cover ${disponibles} plot(s). Fill more at the well.`
          : "You don't have a full bucket. Fill it at the well.",
        'error'
      );
      return;
    }
  } else {
    const coste = this._costeRiegoParcela(plotId) * futuras;
    if ((Number(this.aguaPorcentaje) || 0) < coste) {
      const maximo = Math.floor((Number(this.aguaPorcentaje) || 0) / Math.max(0.01, this._costeRiegoParcela(plotId)));
      this.notifications.show(
        maximo > 0
          ? `You can only water ${maximo} plot(s) with the water you have. Drink to water more.`
          : "You don't have enough water. Drink or refill first.",
        'error'
      );
      return;
    }
  }

  this.pendingWaters.set(plotId, herramienta);
  this.marcarCuadroPendienteRiego(plotId, true);
  this.showRiegoHub();
}

unstageWater(plotId) {
  this._asegurarEstructurasRiego();
  this.pendingWaters.delete(plotId);
  this.marcarCuadroPendienteRiego(plotId, false);
  if (this.pendingWaters.size === 0) this.hideRiegoHub();
  else this.updateRiegoHub();
}

/** Coste de agua de una parcela (según su cultivo). */
_costeRiegoParcela(plotId) {
  const cropData = this.cropData.get(plotId);
  const cfg = cropData ? (this.cropTypes[cropData.cropType] || cropData.cropConfig) : null;
  const c = Number(cfg && cfg.wateringCost);
  return Number.isFinite(c) && c > 0 ? c : 0.5;
}

/** Cuántas parcelas puedo regar con los baldes llenos que tengo (2 por balde). */
_baldesDisponiblesParaRiego() {
  return this.contarItemEnInventario('balde_con_agua') * this.BUCKET_PLOTS_PER_FILL;
}

// ── Hub flotante del riego ─────────────────────────────────────────────
// MISMA POSICIÓN QUE EL DE SIEMBRA (2026-08-05): antes estaba a 196 px del
// borde para no encimarse con los otros dos, pero eso lo dejaba en mitad de
// la pantalla. Como sembrar y regar son acciones distintas (o tienes una
// semilla en la mano o tienes la regadera), sus colas nunca están activas a
// la vez, así que pueden compartir el mismo sitio: abajo del todo, 24 px.
ensureRiegoHubDOM() {
  const existentes = document.querySelectorAll('#riego-hub');
  if (existentes.length > 1) existentes.forEach(el => el.remove());

  let hub = document.getElementById('riego-hub');

  if (!hub) {
    hub = document.createElement('div');
    hub.id = 'riego-hub';
    hub.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20,20,20,0.92);
      border: 2px solid #4aa3ff;
      border-radius: 12px;
      padding: 12px 18px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 9999;
      font-family: "PressStart2P", monospace;
      color: #fff;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      pointer-events: auto;
    `;
    hub.style.setProperty('display', 'none', 'important');

    const label = document.createElement('div');
    label.id = 'riego-hub-label';
    label.style.cssText = 'font-size: 10px; text-align:center; line-height:1.6;';
    label.textContent = 'Plots ready to water: 0';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:14px;';

    const btnCheck = document.createElement('button');
    btnCheck.id = 'riego-hub-confirm';
    btnCheck.textContent = '✔';
    btnCheck.title = 'Confirm watering';
    btnCheck.style.cssText = `
      width: 46px; height: 46px; border-radius: 50%; border: none;
      background: #1565c0; color: #fff; font-size: 20px; cursor: pointer;
    `;

    const btnX = document.createElement('button');
    btnX.id = 'riego-hub-cancel';
    btnX.textContent = '✖';
    btnX.title = 'Cancel watering';
    btnX.style.cssText = `
      width: 46px; height: 46px; border-radius: 50%; border: none;
      background: #c62828; color: #fff; font-size: 20px; cursor: pointer;
    `;

    row.appendChild(btnCheck);
    row.appendChild(btnX);
    hub.appendChild(label);
    hub.appendChild(row);
    document.body.appendChild(hub);
  }

  // Mismo cuidado que en los otros hubs: los botones se reconectan a la
  // instancia ACTUAL de la escena cada vez, porque el hub es DOM plano y
  // sobrevive a que GameScene se destruya al ir a la tienda.
  const c = document.getElementById('riego-hub-confirm');
  const x = document.getElementById('riego-hub-cancel');
  if (c) c.onclick = () => this.confirmRiegoPendiente();
  if (x) x.onclick = () => this.cancelRiegoPendiente();
}

showRiegoHub() {
  this.ensureRiegoHubDOM();
  document.querySelectorAll('#riego-hub').forEach(h => h.style.setProperty('display', 'flex', 'important'));
  this.updateRiegoHub();
}

hideRiegoHub() {
  document.querySelectorAll('#riego-hub').forEach(h => h.style.setProperty('display', 'none', 'important'));
}

updateRiegoHub() {
  const label = document.getElementById('riego-hub-label');
  if (!label) return;
  this._asegurarEstructurasRiego();

  const n = this.pendingWaters.size;
  const herramienta = n > 0 ? this.pendingWaters.values().next().value : null;

  if (herramienta === 'bucket') {
    const baldes = Math.ceil(n / this.BUCKET_PLOTS_PER_FILL);
    label.textContent = `Bucket: ${n} plot(s) ready — uses ${baldes} bucket(s)`;
  } else if (herramienta === 'can') {
    let coste = 0;
    for (const plotId of this.pendingWaters.keys()) coste += this._costeRiegoParcela(plotId);
    label.textContent = `Watering can: ${n} plot(s) ready — costs ${coste.toFixed(1)} water`;
  } else {
    label.textContent = 'Plots ready to water: 0';
  }
}

cancelRiegoPendiente() {
  this._asegurarEstructurasRiego();
  for (const plotId of this.pendingWaters.keys()) this.marcarCuadroPendienteRiego(plotId, false);
  this.pendingWaters.clear();
  this.hideRiegoHub();
}

/** ✔ Confirmar: riega todas las parcelas marcadas. */
async confirmRiegoPendiente() {
  this._asegurarEstructurasRiego();
  if (this.pendingWaters.size === 0) return;
  if (this._riegoEnCurso) {
    this.notifications.show('The watering is already being processed, please wait', 'warning');
    return;
  }

  const entradas = Array.from(this.pendingWaters.entries());
  const herramienta = entradas[0][1];
  const plotIds = entradas.map(([id]) => id);

  // Se saca de la cola ya mismo y se marcan como "en vuelo" para que no se
  // puedan volver a tocar hasta que se resuelvan (el tinte azul se mantiene).
  this.pendingWaters.clear();
  this.hideRiegoHub();
  plotIds.forEach(id => this._watersEnVuelo.add(id));

  this._riegoEnCurso = true;
  try {
    const regadas = herramienta === 'bucket'
      ? await this._regarLoteConBaldes(plotIds)
      : await this._regarLoteConRegadera(plotIds);

    // Las que no se pudieron regar vuelven a quedar libres.
    plotIds.forEach(id => {
      this.marcarCuadroPendienteRiego(id, false);
      this._watersEnVuelo.delete(id);
    });

    if (regadas > 0) {
      this.nivel_exp = (this.nivel_exp || 0) + 5 * regadas;
      this.notifications.show(
        `Watered ${regadas} plot(s)`,
        'success',
        { icon: '💧' }
      );
    }
  } finally {
    this._riegoEnCurso = false;
  }
}

/** Riega con la regadera: gasta la barra de agua y desgasta la herramienta. */
async _regarLoteConRegadera(plotIds) {
  let regadas = 0;
  let agua = Number(this.aguaPorcentaje) || 0;

  for (const plotId of plotIds) {
    const coste = this._costeRiegoParcela(plotId);
    if (agua < coste) {
      this.notifications.show(
        `Ran out of water after ${regadas} plot(s). Drink and try the rest again.`,
        'warning'
      );
      break;
    }
    agua -= coste;
    this.actualizarBarraAgua(agua);
    this.socket.emit('waterCrop', { userId: this.currentAccount, plotId });
    regadas++;
  }

  // La regadera se desgasta UNA vez por lote confirmado (mismo mecanismo de
  // "usos" → rotura → transacción on-chain que usan hachas y picos).
  if (regadas > 0 && this.STATE.selectedItem && this.STATE.selectedItem.idx) {
    await this.verificarRompimiento(this.STATE.selectedItem);
  }
  return regadas;
}

/**
 * Riega con baldes: cada balde cubre DOS parcelas.
 *
 * El balde se gasta ENTERO (sale `balde_con_agua` y entra `balde_vacio` con
 * transacciones reales) y lo que sobra queda como crédito guardado por cuenta,
 * así que sobrevive a recargas y a los viajes a la tienda. Se hace así porque
 * el inventario on-chain no admite medias unidades: si se esperara al segundo
 * riego para descontar, cerrar sesión en medio dejaría un balde lleno ya usado.
 */
async _regarLoteConBaldes(plotIds) {
  const necesarias = plotIds.length;

  // CADA LOTE PAGA SUS PROPIOS BALDES (2026-08-05)
  // -------------------------------------------------------------------------
  // Antes se guardaba el "medio balde" sobrante de un riego para el siguiente.
  // Efecto raro: regabas UNA parcela y no se te descontaba nada, porque estabas
  // gastando el resto de un balde de hace rato. Ahora cada confirmación calcula
  // lo suyo y siempre cobra:  1 parcela → 1 balde ·  2 parcelas → 1 balde ·
  // 3 parcelas → 2 baldes ·  4 parcelas → 2 baldes.
  const baldesNecesarios = Math.ceil(necesarias / this.BUCKET_PLOTS_PER_FILL);

  const defAgua  = this.ItemDefinitions ? this.ItemDefinitions['balde_con_agua'] : null;
  const defVacio = this.ItemDefinitions ? this.ItemDefinitions['balde_vacio'] : null;

  let cargasDisponibles = 0;

  if (baldesNecesarios > 0) {
    if (this.contarItemEnInventario('balde_con_agua') < baldesNecesarios) {
      this.notifications.show("You don't have enough full buckets for those plots.", 'error');
      return 0;
    }

    if (defAgua && defAgua.tipo && defVacio && defVacio.tipo) {
      this.notifications.show(
        `💧 Sending the transaction for ${baldesNecesarios} bucket(s)…`, 'info'
      );

      // TX 1: quitar los baldes llenos. El éxito se comprueba comparando el
      // inventario antes y después: ejecutarDivisionRemove no devuelve un
      // booleano fiable (ver la nota de _procesarLoteSiembra).
      const antes = this.contarItemEnInventario('balde_con_agua');
      try {
        await this.ejecutarDivisionRemove(defAgua.tipo, 'balde_con_agua', defAgua.maxStack || 5, baldesNecesarios);
      } catch (err) {
        console.error('❌ Error quitando los baldes con agua:', err);
      }
      const despues = this.contarItemEnInventario('balde_con_agua');
      const gastados = Math.max(0, antes - despues);

      if (gastados <= 0) {
        this.notifications.show("The bucket transaction wasn't confirmed. Try again.", 'error');
        return 0;
      }

      // TX 2: devolver los baldes vacíos. Si falla, el jugador conserva sus
      // riegos igualmente; solo se avisa de que el envase no volvió.
      try {
        await this.ejecutarDivision(defVacio.tipo, 'balde_vacio', defVacio.maxStack || 5, gastados);
      } catch (err) {
        console.error('❌ Error devolviendo los baldes vacíos:', err);
        this.notifications.show(
          "The empty buckets couldn't be returned on-chain. Contact support if they don't show up.",
          'warning'
        );
      }

      cargasDisponibles += gastados * this.BUCKET_PLOTS_PER_FILL;
    } else {
      // Sin definición on-chain: intercambio local (caso de respaldo).
      if (!this.removeItemSmart('balde_con_agua', baldesNecesarios)) {
        this.notifications.show('Could not use the buckets', 'error');
        return 0;
      }
      this.addItemWithCheck('balde_vacio', baldesNecesarios);
      cargasDisponibles += baldesNecesarios * this.BUCKET_PLOTS_PER_FILL;
    }
  }

  // Regar tantas parcelas como cargas se hayan conseguido.
  let regadas = 0;
  for (const plotId of plotIds) {
    if (cargasDisponibles <= 0) break;
    cargasDisponibles--;
    // El agua sale del balde: la barra del jugador NO se toca.
    this.socket.emit('waterCrop', { userId: this.currentAccount, plotId });
    regadas++;
  }

  // El sobrante del último balde NO se guarda: el balde se gastó entero en
  // este riego. Guardarlo era lo que hacía que un riego suelto pareciera
  // gratis (ver la nota del cálculo de baldesNecesarios).
  this._setBucketWaterCredit(0);

  if (regadas < plotIds.length) {
    this.notifications.show(
      `Only ${regadas} of ${plotIds.length} plot(s) could be watered. Fill more buckets at the well.`,
      'warning'
    );
  }
  return regadas;
}

// ============================================================================
// NUEVO SISTEMA DE CORTE/COSECHA CON CONFIRMACIÓN (mismo mecanismo que la
// siembra): seleccionar Tijerasx y hacer clic en cuadros con cultivo los
// marca (en naranja) para cortar/cosechar. Aparece un hub con ✔/✖:
//   - ✔ le pide al servidor que procese cada cuadro marcado (cosecha buena,
//     corte en progreso, o corte de árbol muerto, según corresponda), agrupa
//     los resultados por tipo de fruto, verifica que haya espacio para TODO
//     antes de tocar nada, y envía UNA sola transacción on-chain por cada
//     tipo de fruto (ej. 2 calabaza_buena en una sola transacción) en vez de
//     una transacción por cuadro, para ahorrar fee.
//   - ✖ cancela los cuadros que todavía no se han confirmado.
// Si no hay espacio en el inventario para algún fruto, esos cuadros NO se
// cortan (se liberan tal cual estaban) y se muestra un aviso en inglés en
// el centro de la pantalla (funciona igual en PC y en teléfono).
// ============================================================================

_getFruitDisplayNameEN(itemId) {
  const nombres = {
    zanahoria_buena: 'Good Carrot', zanahoria_corta: 'Unripe Carrot', zanahoria_mala: 'Rotten Carrot',
    tomate_buena: 'Good Tomato', tomate_corta: 'Unripe Tomato', tomate_mala: 'Rotten Tomato',
    trigo_buena: 'Good Wheat', trigo_corta: 'Unripe Wheat', trigo_mala: 'Rotten Wheat',
    calabaza_buena: 'Good Pumpkin', calabaza_corta: 'Unripe Pumpkin', calabaza_mala: 'Rotten Pumpkin',
    // Minerales (reutilizado también por la minería on-chain, ver _agregarFrutoOnChain)
    mineral_piedra: 'Stone', mineral_cobre: 'Copper Ore', mineral_hierro: 'Iron Ore', carbon: 'Coal',
    // Maderas: se añadieron al pasar la tala a botín 1-3, para que el aviso
    // diga "3x Pine Log" en vez del identificador crudo "3x madera_pinos".
    madera_pinos: 'Pine Log', madera_seca: 'Dry Log', madera_con_hojas: 'Leafy Log'
  };
  if (nombres[itemId]) return nombres[itemId];
  // Cualquier otro id se muestra legible ("madera_tronco" → "Madera Tronco")
  // en vez de tal cual.
  return String(itemId || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toUpperCase());
}

// Marca (o desmarca) visualmente un cuadro como "pendiente de corte"
// (naranja + ✂️, para no confundirlo con el gris/⏳ de la siembra).
marcarCuadroPendienteCorte(plotId, activo) {
  const imagen = this.plotImages.get(plotId);
  if (!imagen) return;

  if (activo) {
    imagen.setTint(0xffa500);

    if (!this.pendingCutLabels.has(plotId)) {
      const label = this.add.text(imagen.x, imagen.y - 40, '✂️', {
        fontFamily: '"PressStart2P"',
        fontSize: '14px',
        color: '#ffe600',
        backgroundColor: '#000000AA',
        padding: { x: 6, y: 4 },
        align: 'center'
      }).setOrigin(0.5).setDepth(11);
      this.pendingCutLabels.set(plotId, label);
    }
  } else {
    imagen.clearTint();
    if (this.pendingCutLabels.has(plotId)) {
      this.pendingCutLabels.get(plotId).destroy();
      this.pendingCutLabels.delete(plotId);
    }
  }
}

stageCut(plotId) {
  this.pendingCuts.set(plotId, true);
  this.marcarCuadroPendienteCorte(plotId, true);
  this.showCorteHub();
}

unstageCut(plotId) {
  this.pendingCuts.delete(plotId);
  this.marcarCuadroPendienteCorte(plotId, false);

  if (this.pendingCuts.size === 0) {
    this.hideCorteHub();
  } else {
    this.updateCorteHub();
  }
}

// Hub flotante con ✔/✖ para el corte. Se coloca más arriba que el de
// siembra (bottom: 110px) para que no se encimen si ambos están visibles
// a la vez (ej. sembrando unos cuadros vacíos y cortando otros con cultivo).
ensureCorteHubDOM() {
  const existentes = document.querySelectorAll('#corte-hub');
  if (existentes.length > 1) {
    existentes.forEach(el => el.remove());
  }

  let hub = document.getElementById('corte-hub');

  if (!hub) {
    hub = document.createElement('div');
    hub.id = 'corte-hub';
    hub.style.cssText = `
      position: fixed;
      bottom: 110px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20,20,20,0.92);
      border: 2px solid #ff9800;
      border-radius: 12px;
      padding: 12px 18px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 9999;
      font-family: "PressStart2P", monospace;
      color: #fff;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      pointer-events: auto;
    `;
    hub.style.setProperty('display', 'none', 'important');

    const label = document.createElement('div');
    label.id = 'corte-hub-label';
    label.style.cssText = 'font-size: 10px; text-align:center;';
    label.textContent = 'Plots ready to harvest: 0';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:14px;';

    const btnCheck = document.createElement('button');
    btnCheck.id = 'corte-hub-confirm';
    btnCheck.textContent = '✔';
    btnCheck.title = 'Confirm harvest (sends the transaction)';
    btnCheck.style.cssText = `
      width: 46px; height: 46px; border-radius: 50%; border: none;
      background: #2e7d32; color: #fff; font-size: 20px; cursor: pointer;
    `;

    const btnX = document.createElement('button');
    btnX.id = 'corte-hub-cancel';
    btnX.textContent = '✖';
    btnX.title = 'Cancel harvest';
    btnX.style.cssText = `
      width: 46px; height: 46px; border-radius: 50%; border: none;
      background: #c62828; color: #fff; font-size: 20px; cursor: pointer;
    `;

    row.appendChild(btnCheck);
    row.appendChild(btnX);
    hub.appendChild(label);
    hub.appendChild(row);
    document.body.appendChild(hub);
  }

  // BUGFIX CLAVE (mismo que en siembra): reconectar los botones a la
  // instancia ACTUAL cada vez, sin importar si el hub ya existía.
  const btnCheckActual = document.getElementById('corte-hub-confirm');
  const btnXActual = document.getElementById('corte-hub-cancel');
  if (btnCheckActual) btnCheckActual.onclick = () => this.confirmCortePendiente();
  if (btnXActual) btnXActual.onclick = () => this.cancelCortePendiente();
}

showCorteHub() {
  this.ensureCorteHubDOM();
  document.querySelectorAll('#corte-hub').forEach(hub => {
    hub.style.setProperty('display', 'flex', 'important');
  });
  this.updateCorteHub();
}

hideCorteHub() {
  document.querySelectorAll('#corte-hub').forEach(hub => {
    hub.style.setProperty('display', 'none', 'important');
  });
}

updateCorteHub() {
  const label = document.getElementById('corte-hub-label');
  if (!label) return;
  label.textContent = `Plots ready to harvest: ${this.pendingCuts.size}`;
}

// ✖ Cancelar: libera SOLO los cuadros que todavía no se confirmaron
cancelCortePendiente() {
  for (const plotId of this.pendingCuts.keys()) {
    this.marcarCuadroPendienteCorte(plotId, false);
  }
  this.pendingCuts.clear();
  this.hideCorteHub();
}

// ✔ Confirmar: despacha el lote de corte/cosecha en segundo plano y libera
// la cola de inmediato (mismo criterio que la siembra: no dejar el hub
// pegado en pantalla esperando la respuesta del servidor/blockchain).
async confirmCortePendiente() {
  if (this.pendingCuts.size === 0) return;

  const plotIds = Array.from(this.pendingCuts.keys());
  this.pendingCuts.clear();
  this.hideCorteHub();
  plotIds.forEach(plotId => this._cutsEnVuelo.add(plotId));

  this._procesarLoteCorte(plotIds);
}

// Le pide al servidor procesar UN cuadro (cosecha buena o corte) y
// devuelve una Promise que resuelve con { item, quantity } cuando el
// servidor confirma, SIN agregar nada al inventario todavía (eso se hace
// después, agrupado por tipo de fruto, en _procesarLoteCorte).
_solicitarCorte(plotId, esCosechaBuena) {
  return new Promise((resolve, reject) => {
    this._corteResolvers.set(plotId, { resolve, reject });
    if (esCosechaBuena) {
      this.socket.emit('harvestCrop', { userId: this.currentAccount, plotId });
    } else {
      this.socket.emit('cutCrop', { userId: this.currentAccount, plotId });
    }
  });
}

// Verifica, SIN modificar nada, si hay espacio para agregar varios tipos de
// fruto a la vez, simulando todos contra UNA sola copia del inventario
// (para no contar el mismo hueco vacío dos veces si dos frutos distintos
// compiten por el mismo espacio). Devuelve el conjunto de itemIds que NO
// alcanzarían espacio.
_haySuficienteEspacioParaLote(itemsMap) {
  const simQuick = this.STATE.quickSlots.map(s => s ? { ...s } : null);
  const simInv = this.STATE.slots.map(s => s ? { ...s } : null);

  const occupied = new Set();
  if (this.STATE.selectedItem) {
    const sel = this.STATE.selectedItem;
    if (sel.originType === 'inv') occupied.add(`inv-${sel.originIndex}`);
    else if (sel.originType === 'quick') occupied.add(`quick-${sel.originIndex}`);
  }
  const isOccupied = (type, idx) => occupied.has(`${type}-${idx}`);

  const itemsSinEspacio = new Set();

  for (const [itemId, cantidadTotal] of itemsMap.entries()) {
    const def = this.ItemDefinitions ? this.ItemDefinitions[itemId] : null;
    if (!def) {
      itemsSinEspacio.add(itemId);
      continue;
    }
    const maxStack = def.maxStack;
    let remaining = cantidadTotal;

    const intentar = (slots, type) => {
      for (let i = 0; i < slots.length && remaining > 0; i++) {
        if (isOccupied(type, i)) continue;
        const slot = slots[i];
        if (slot && slot.id === itemId && slot.count < maxStack) {
          const espacio = maxStack - slot.count;
          const add = Math.min(espacio, remaining);
          slot.count += add;
          remaining -= add;
        }
      }
      for (let i = 0; i < slots.length && remaining > 0; i++) {
        if (isOccupied(type, i)) continue;
        if (!slots[i]) {
          const add = Math.min(maxStack, remaining);
          slots[i] = { id: itemId, count: add };
          remaining -= add;
        }
      }
    };

    intentar(simQuick, 'quick');
    intentar(simInv, 'inv');

    if (remaining > 0) {
      itemsSinEspacio.add(itemId);
    }
  }

  return itemsSinEspacio;
}

// Agrega UN tipo de fruto on-chain (una sola transacción para toda la
// cantidad indicada). Igual que con las semillas, ejecutarDivision() no
// siempre propaga el éxito hacia arriba, así que se verifica comparando el
// inventario antes/después. Como el cultivo YA se borró en el servidor al
// llegar hasta aquí, si la transacción on-chain no se puede confirmar, el
// fruto se agrega off-chain como respaldo para no perderlo.
async _agregarFrutoOnChain(itemId, cantidad) {
  const def = this.ItemDefinitions ? this.ItemDefinitions[itemId] : null;
  const nombre = this._getFruitDisplayNameEN(itemId);

  if (!def || !def.tipo) {
    this.addItemWithCheck(itemId, cantidad);
    this.notifications.show(`Harvested! You got ${cantidad} ${nombre}`, "success");
    return;
  }

  this.notifications.show(`Sending transaction to add ${cantidad} ${nombre}...`, "info");

  const cantidadAntes = this.contarItemEnInventario(itemId);
  try {
    // ruta_tabla = def.tipo (ej. "calabaza_buena"), producto = itemId,
    // limitacion = def.maxStack (20), cantidad = total confirmado de este
    // fruto en TODO el lote (una sola transacción, no una por cuadro).
    await this.ejecutarDivision(def.tipo, itemId, def.maxStack || 20, cantidad);
  } catch (err) {
    console.error('❌ Error agregando fruto on-chain:', err);
  }
  const cantidadDespues = this.contarItemEnInventario(itemId);
  const agregadas = Math.max(0, cantidadDespues - cantidadAntes);

  if (agregadas <= 0) {
    this.addItemWithCheck(itemId, cantidad);
    this.notifications.show(
      `Could not confirm the on-chain transaction, but you still got ${cantidad} ${nombre}.`,
      "warning"
    );
    return;
  }

  if (agregadas < cantidad) {
    const faltan = cantidad - agregadas;
    this.addItemWithCheck(itemId, faltan);
    this.notifications.show(
      `${agregadas} ${nombre} were confirmed on-chain, and ${faltan} more were added directly.`,
      "warning"
    );
  } else {
    this.notifications.show(`Harvested! You got ${agregadas} ${nombre}`, "success");
  }
}

// Procesa un lote de corte/cosecha completo: determina qué recompensa se
// espera de cada cuadro, agrupa por tipo de fruto, verifica espacio para
// TODO antes de tocar nada, le pide al servidor procesar solo los cuadros
// con espacio confirmado, y agrega on-chain (UNA transacción por tipo de
// fruto) lo que el servidor realmente confirmó.
async _procesarLoteCorte(plotIds) {
  const previstos = [];

  for (const plotId of plotIds) {
    const cropData = this.cropData.get(plotId);
    if (!cropData) {
      this.marcarCuadroPendienteCorte(plotId, false);
      this._cutsEnVuelo.delete(plotId);
      continue;
    }

    const cropConfig = cropData.cropConfig || this.cropTypes[cropData.cropType];
    if (!cropConfig || !cropConfig.rewards) {
      this.marcarCuadroPendienteCorte(plotId, false);
      this._cutsEnVuelo.delete(plotId);
      continue;
    }

    let item, quantity, esCosechaBuena;
    if (cropData.isCompleted && !cropData.isDead) {
      item = cropConfig.rewards.item;
      quantity = cropConfig.rewards.quantity;
      esCosechaBuena = true;
    } else if (cropData.isDead) {
      item = cropConfig.rewards.deadReward;
      quantity = cropConfig.rewards.deadQuantity;
      esCosechaBuena = false;
    } else {
      item = cropConfig.rewards.progress_reward;
      quantity = cropConfig.rewards.progress_quantity;
      esCosechaBuena = false;
    }

    if (!item || !quantity) {
      this.marcarCuadroPendienteCorte(plotId, false);
      this._cutsEnVuelo.delete(plotId);
      continue;
    }

    previstos.push({ plotId, item, quantity, esCosechaBuena });
  }

  if (previstos.length === 0) return;

  // Agrupar por fruto y sumar la cantidad TOTAL prevista de cada uno
  const totalesPorItem = new Map();
  for (const p of previstos) {
    totalesPorItem.set(p.item, (totalesPorItem.get(p.item) || 0) + p.quantity);
  }

  // Verificar espacio para TODO antes de tocar nada
  const itemsSinEspacio = this._haySuficienteEspacioParaLote(totalesPorItem);

  const aProcesar = [];
  for (const p of previstos) {
    if (itemsSinEspacio.has(p.item)) {
      // Sin espacio: ese cuadro NO se corta, se libera tal cual estaba
      this.marcarCuadroPendienteCorte(p.plotId, false);
      this._cutsEnVuelo.delete(p.plotId);
    } else {
      aProcesar.push(p);
    }
  }

  if (itemsSinEspacio.size > 0) {
    const nombres = [...itemsSinEspacio].map(i => this._getFruitDisplayNameEN(i)).join(', ');
    this._showSaveSuccessBanner(
      `Not enough inventory space for: ${nombres}. Those plots were not harvested.`,
      true
    );
  }

  if (aProcesar.length === 0) return;

  // Se captura una copia de las tijeras usadas AQUÍ, antes de esperar la
  // respuesta del servidor: como el lote se procesa en segundo plano, el
  // jugador podría cambiar de herramienta seleccionada mientras tanto, y
  // el desgaste debe aplicarse a la herramienta que realmente se usó para
  // cortar, no a lo que esté seleccionado cuando termine la respuesta.
  const tijerasUsadas =
    this.STATE.selectedItem &&
    this.STATE.selectedItem.id === 'Tijerasx' &&
    this.STATE.selectedItem.idx
      ? { ...this.STATE.selectedItem }
      : null;

  // Pedirle al servidor procesar cada cuadro aprobado (en paralelo)
  const resultados = await Promise.allSettled(
    aProcesar.map(p => this._solicitarCorte(p.plotId, p.esCosechaBuena))
  );

  // Sumar lo que el servidor realmente confirmó (por si difiere de lo
  // previsto) y liberar visualmente cada cuadro ya procesado
  const totalesReales = new Map();
  for (let i = 0; i < resultados.length; i++) {
    const res = resultados[i];
    const plotId = aProcesar[i].plotId;
    this.marcarCuadroPendienteCorte(plotId, false);
    this._cutsEnVuelo.delete(plotId);

    if (res.status === 'fulfilled' && res.value?.item && res.value?.quantity) {
      totalesReales.set(res.value.item, (totalesReales.get(res.value.item) || 0) + res.value.quantity);

      // Desgastar las tijeras UNA vez por cada cuadro realmente
      // cortado/cosechado (mismo mecanismo de "usos" -> rotura ->
      // transacción on-chain que ya se usa con hachas y picos). Se hace
      // secuencial (await dentro del for) para no leer/escribir el
      // contador de usos en paralelo y desincronizarlo.
      if (tijerasUsadas) {
        await this.verificarRompimiento(tijerasUsadas);
      }
    } else {
      console.error('❌ Error cosechando/cortando cuadro', plotId, res.reason);
    }
  }

  // UNA transacción on-chain por tipo de fruto (esto es lo que ahorra fee)
  for (const [item, cantidad] of totalesReales.entries()) {
    this._agregarFrutoOnChain(item, cantidad);
  }
}

harvestCrop(plotId) {
  this.socket.emit('harvestCrop', {
    userId: this.currentAccount,
    plotId: plotId
  });
}

cutCrop(plotId) {
  this.socket.emit('cutCrop', {
    userId: this.currentAccount,
    plotId: plotId
  });
}

updatePlotVisual(plotId, cropData) {
  const imagen = this.plotImages.get(plotId);
  const progressText = this.plotTexts.get(plotId);
  if (!imagen) return;
  
  const cropConfig = cropData.cropConfig || this.cropTypes[cropData.cropType];
  
  if (!cropConfig || !cropConfig.images) {
    console.warn(`❌ Configuración de cultivo no encontrada para: ${cropData.cropType}`);
    imagen.setTexture('tierra_seca');
    // USAR TAMAÑO ORIGINAL SIEMPRE
    if (imagen.originalWidth && imagen.originalHeight) {
      imagen.setDisplaySize(imagen.originalWidth, imagen.originalHeight);
    }
    if (progressText) progressText.setText('Error');
    return;
  }
  
  let textureKey = 'tierra_seca';
  
  if (cropData.isDead) {
    textureKey = cropConfig.images.stage5 || 'tierra_muerta_plant4';
    if (progressText) {
      if (this.lenguaje === 1) {
          
        progressText.setText('Dead Tree!');
        
      } else if (this.lenguaje === 2) {
          
        progressText.setText('Dead Tree!');
        
      } else if (this.lenguaje === 3) {
          
        progressText.setText('¡Árbol Muerto!');
        
      } else if (this.lenguaje === 4) {
          
        progressText.setText('Árvore Morta!');
        
      } else if (this.lenguaje === 5) {
          
        progressText.setText('死树!');
        
      } else if (this.lenguaje === 6) {
          
        progressText.setText('죽은 나무!');
        
      }
      progressText.setColor('#ff0000');
    }
  } 
  else if (cropData.isCompleted) {
    textureKey = cropConfig.images.stage4 || 'tierra_mojada_plant3';
    if (progressText) {
      if (this.lenguaje === 1) {
        progressText.setText('Harvest!');
        
      } else if (this.lenguaje === 2) {
        progressText.setText('Harvest!');
        
      } else if (this.lenguaje === 3) {
        progressText.setText('¡Cosecha!');
        
      } else if (this.lenguaje === 4) {
        progressText.setText('Colheita!');
        
      } else if (this.lenguaje === 5) {
        progressText.setText('收获!');
        
      } else if (this.lenguaje === 6) {
        progressText.setText('수확!');
        
      }
      progressText.setColor('#00ff00');
    }
  } 
  else if (cropData.isWatered) {
    if (cropData.growthStage >= 3) {
      textureKey = cropConfig.images.stage3 || 'tierra_mojada_plant2';
    } else {
      textureKey = cropConfig.images.stage2 || 'tierra_mojada_plant';
    }
    
    if (progressText) {
      const timeRemaining = Math.max(0, cropData.growthDuration - cropData.currentGrowthTime);
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      progressText.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      progressText.setColor('#ffffff');
      
      if (timeRemaining < 10) {
        progressText.setColor('#ff9900');
      }
    }
  } 
  else {
    textureKey = cropConfig.images.stage1 || 'tierra_seca_plant';
    if (progressText && cropData.cropType && !cropData.isWatered) {
      if (this.lenguaje === 1) {
          
        progressText.setText('Needs Water');
        
      } else if (this.lenguaje === 2) {
          
        progressText.setText('Needs Water');
        
      } else if (this.lenguaje === 3) {
          
        progressText.setText('Necesita agua');
        
      } else if (this.lenguaje === 4) {
          
        progressText.setText('Precisa de Água');
        
      } else if (this.lenguaje === 5) {
          
        progressText.setText('需要水');
        
      } else if (this.lenguaje === 6) {
          
        progressText.setText('물이 필요함');
        
      }
      progressText.setColor('#ff9900');
    } else if (progressText) {
      progressText.setText('');
    }
  }
    
  if (this.textures.exists(textureKey)) {
    imagen.setTexture(textureKey);
    // SIEMPRE USAR EL TAMAÑO ORIGINAL EN LUGAR DE 64x64
    if (imagen.originalWidth && imagen.originalHeight) {
      imagen.setDisplaySize(imagen.originalWidth, imagen.originalHeight);
    }
  } else {
    console.warn(`Textura no encontrada: ${textureKey}, usando tierra_seca`);
    imagen.setTexture('tierra_seca');
    // USAR TAMAÑO ORIGINAL SIEMPRE
    if (imagen.originalWidth && imagen.originalHeight) {
      imagen.setDisplaySize(imagen.originalWidth, imagen.originalHeight);
    }
  }

  
  this.cropData.set(plotId, cropData);
}

updatePlotGrowth(plotId, growthStage, isHalfway, isCompleted, timeRemaining, cropConfig, isDead = false) {
  let cropData = this.cropData.get(plotId);
  if (!cropData) return;
  
  cropData.growthStage = growthStage;
  cropData.isCompleted = isCompleted;
  cropData.isDead = isDead;
  
  if (cropConfig) {
    cropData.cropConfig = cropConfig;
    cropData.currentGrowthTime = cropConfig.growthTime - timeRemaining;
  }

  if (this.lenguaje === 1) {
    if (isHalfway) {
        console.log(`⏰ HALFWAY: ${plotId} has reached halfway growth`);
        this.notifications.show(`🌱 Your crop has reached halfway growth`, "info");
    }

    if (isCompleted && !isDead) {
        console.log(`✅ COMPLETED: ${plotId} is ready to harvest!`);
        this.notifications.show(`✅ Your crop is ready to harvest`, "success");
    }

    if (isDead) {
        console.log(`💀 DEAD CROP: ${plotId} did not survive`);
        console.log(`💀 Dead reward: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);
        this.notifications.show(`💀 Your crop has died`, "error");
    }
 
  } else if (this.lenguaje === 2) {

    if (isHalfway) {
        console.log(`⏰ HALFWAY: ${plotId} has reached halfway growth`);
        this.notifications.show(`🌱 Your crop has reached halfway growth`, "info");
    }

    if (isCompleted && !isDead) {
        console.log(`✅ COMPLETED: ${plotId} is ready to harvest!`);
        this.notifications.show(`✅ Your crop is ready to harvest`, "success");
    }

    if (isDead) {
        console.log(`💀 DEAD CROP: ${plotId} did not survive`);
        console.log(`💀 Dead reward: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);
        this.notifications.show(`💀 Your crop has died`, "error");
    }

  } else if (this.lenguaje === 3) {

    if (isHalfway) {
        console.log(`⏰ MITAD: ${plotId} llegó a la mitad del crecimiento`);
        this.notifications.show(`🌱 Tu cultivo ha llegado a mitad de su crecimiento`, "info");
    }

    if (isCompleted && !isDead) {
        console.log(`✅ COMPLETADO: ${plotId} está listo para cosechar!`);
        this.notifications.show(`✅ Tu cultivo está listo para cosechar`, "success");
    }

    if (isDead) {
        console.log(`💀 ÁRBOL MUERTO: ${plotId} no sobrevivió`);
        console.log(`💀 Recompensa muerta: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);
        this.notifications.show(`💀 Tu cultivo ha muerto`, "error");
    }

  } else if (this.lenguaje === 4) {

    if (isHalfway) {
        console.log(`⏰ META: ${plotId} atingiu metade do crescimento`);
        this.notifications.show(`🌱 Sua plantação atingiu metade do crescimento`, "info");
    }

    if (isCompleted && !isDead) {
        console.log(`✅ COMPLETO: ${plotId} está pronto para colher!`);
        this.notifications.show(`✅ Sua plantação está pronta para colher`, "success");
    }

    if (isDead) {
        console.log(`💀 PLANTA MORTA: ${plotId} não sobreviveu`);
        console.log(`💀 Recompensa morta: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);
        this.notifications.show(`💀 Sua plantação morreu`, "error");
    }

  } else if (this.lenguaje === 5) {

    if (isHalfway) {
        console.log(`⏰ 一半: ${plotId} 已达到生长一半`);
        this.notifications.show(`🌱 你的作物已达到生长一半`, "info");
    }

    if (isCompleted && !isDead) {
        console.log(`✅ 完成: ${plotId} 可以收获了!`);
        this.notifications.show(`✅ 你的作物可以收获了`, "success");
    }

    if (isDead) {
        console.log(`💀 死亡作物: ${plotId} 未能存活`);
        console.log(`💀 死亡奖励: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);
        this.notifications.show(`💀 你的作物已死亡`, "error");
    }

  } else if (this.lenguaje === 6) {

    if (isHalfway) {
        console.log(`⏰ 중간: ${plotId} 성장의 절반에 도달했습니다`);
        this.notifications.show(`🌱 작물이 성장의 절반에 도달했습니다`, "info");
    }

    if (isCompleted && !isDead) {
        console.log(`✅ 완료: ${plotId} 수확할 준비가 되었습니다!`);
        this.notifications.show(`✅ 작물이 수확할 준비가 되었습니다`, "success");
    }

    if (isDead) {
        console.log(`💀 죽은 작물: ${plotId} 생존하지 못했습니다`);
        console.log(`💀 죽은 보상: ${cropConfig.rewards.deadQuantity} ${cropConfig.rewards.deadReward}`);
        this.notifications.show(`💀 작물이 죽었습니다`, "error");
    }

  }
  
  console.log(`🌱 ${plotId}: Etapa ${growthStage}, Tiempo restante: ${timeRemaining}s, Muerto: ${isDead}`);
  
  this.updatePlotVisual(plotId, cropData);
}

resetPlot(plotId) {
  const imagen = this.plotImages.get(plotId);
  const progressText = this.plotTexts.get(plotId);
  
  if (imagen) {
    imagen.setTexture('tierra_seca');
    // RESTAURAR AL TAMAÑO ORIGINAL SIEMPRE
    if (imagen.originalWidth && imagen.originalHeight) {
      imagen.setDisplaySize(imagen.originalWidth, imagen.originalHeight);
    }
  }
  
  if (progressText) {
    progressText.setText('');
    progressText.setVisible(false);
    progressText.setColor('#ffffff');
  }
  
  this.cropData.delete(plotId);
}

loadUserCrops() {
  if (this.currentAccount) {
    this.socket.emit('getUserCrops', {
      userId: this.currentAccount
    });
  }
}









// ================================
// SISTEMA DE SONIDO Y PANEL DE AUDIO - VERSIÓN COMPLETA CORREGIDA
// ================================

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

// Inicializar el sistema de audio CORREGIDO
initAudioSystem() {
  console.log('🎵 Inicializando sistema de audio corregido...');
  
  // Estado del audio CORREGIDO - VOLÚMENES INDEPENDIENTES
  this.audioState = {
    // CORRECCIÓN: Variables REALES para guardar/leer de localStorage
    _musicVolumeReal: 0.7,      // Volumen REAL de música (70% por defecto)
    _sfxVolumeReal: 0.7,        // Volumen REAL de efectos (70% por defecto)
    
    // Variables APLICADAS (consideran mute)
    musicVolumeApplied: 0.7,
    sfxVolumeApplied: 0.7,
    
    musicMuted: false,
    sfxMuted: false,
    currentMusic: null,
    currentMusicKey: null,
    
    // CORRECCIÓN: Lista para rastrear efectos activos
    activeSFX: new Set()
  };
  
  // Cargar configuración guardada
  this.loadAudioSettings();
  
  // CORRECCIÓN: Inicializar volúmenes APLICADOS correctamente
  this.audioState.musicVolumeApplied = this.audioState.musicMuted ? 0 : this.audioState._musicVolumeReal;
  this.audioState.sfxVolumeApplied = this.audioState.sfxMuted ? 0 : this.audioState._sfxVolumeReal;
  
  // Los SFX toman su volumen individualmente al crearse con playSFX()
  // NO usar this.sound.volume aquí porque afectaría también a la música
  
  console.log('🔊 Volúmenes iniciales configurados por separado');
  console.log(`🎵 Música REAL: ${this.audioState._musicVolumeReal} (${Math.round(this.audioState._musicVolumeReal * 100)}%)`);
  console.log(`🔊 SFX REAL: ${this.audioState._sfxVolumeReal} (${Math.round(this.audioState._sfxVolumeReal * 100)}%)`);
  console.log(`🎵 Música APLICADO: ${this.audioState.musicVolumeApplied} (muted: ${this.audioState.musicMuted})`);
  console.log(`🔊 SFX APLICADO: ${this.audioState.sfxVolumeApplied} (muted: ${this.audioState.sfxMuted})`);
  
  // Inicializar panel de sonido
  this.initSoundHub();
  
  // CORRECCIÓN: Configurar limpieza periódica de efectos terminados
  this.setupAudioCleanup();
  
  console.log('✅ Sistema de audio corregido inicializado');
}

// Cargar configuración de audio desde localStorage - CORREGIDO
loadAudioSettings() {
  try {
    // CORRECCIÓN: Usar claves ESPECÍFICAS para evitar conflictos
    const musicVol = localStorage.getItem('grassland_music_volume');
    const sfxVol = localStorage.getItem('grassland_sfx_volume');
    const musicMute = localStorage.getItem('grassland_music_muted');
    const sfxMute = localStorage.getItem('grassland_sfx_muted');
    
    console.log('📥 Cargando configuración de audio:', { musicVol, sfxVol, musicMute, sfxMute });
    
    // Cargar volumen de música
    if (musicVol !== null) {
      this.audioState._musicVolumeReal = parseFloat(musicVol);
      this.audioState._musicVolumeReal = Phaser.Math.Clamp(this.audioState._musicVolumeReal, 0, 1);
    }
    
    // Cargar volumen de efectos
    if (sfxVol !== null) {
      this.audioState._sfxVolumeReal = parseFloat(sfxVol);
      this.audioState._sfxVolumeReal = Phaser.Math.Clamp(this.audioState._sfxVolumeReal, 0, 1);
    }
    
    // Cargar estados de mute
    if (musicMute !== null) {
      this.audioState.musicMuted = musicMute === 'true';
    }
    
    if (sfxMute !== null) {
      this.audioState.sfxMuted = sfxMute === 'true';
    }
    
    console.log('✅ Configuración de audio cargada:', {
      _musicVolumeReal: this.audioState._musicVolumeReal,
      _sfxVolumeReal: this.audioState._sfxVolumeReal,
      musicMuted: this.audioState.musicMuted,
      sfxMuted: this.audioState.sfxMuted
    });
    
  } catch (error) {
    console.warn('⚠️ Error cargando configuración de audio:', error);
    
    // Valores por defecto en caso de error
    this.audioState._musicVolumeReal = 0.7;
    this.audioState._sfxVolumeReal = 0.7;
    this.audioState.musicMuted = false;
    this.audioState.sfxMuted = false;
  }
}

// Guardar configuración de audio - CORREGIDO
saveAudioSettings() {
  try {
    // CORRECCIÓN: Guardar con claves ESPECÍFICAS
    localStorage.setItem('grassland_music_volume', this.audioState._musicVolumeReal.toString());
    localStorage.setItem('grassland_sfx_volume', this.audioState._sfxVolumeReal.toString());
    localStorage.setItem('grassland_music_muted', this.audioState.musicMuted.toString());
    localStorage.setItem('grassland_sfx_muted', this.audioState.sfxMuted.toString());
    
    console.log('💾 Configuración de audio guardada:', {
      _musicVolumeReal: this.audioState._musicVolumeReal,
      _sfxVolumeReal: this.audioState._sfxVolumeReal,
      musicMuted: this.audioState.musicMuted,
      sfxMuted: this.audioState.sfxMuted
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Error guardando configuración de audio:', error);
    this.showNotification('Error saving settings', 'error');
    return false;
  }
}

// CORRECCIÓN: Configurar limpieza de efectos terminados
setupAudioCleanup() {
  // Limpiar efectos terminados periódicamente
  setInterval(() => {
    if (this.audioState && this.audioState.activeSFX) {
      const toRemove = [];
      this.audioState.activeSFX.forEach(sound => {
        if (!sound.isPlaying) {
          toRemove.push(sound);
        }
      });
      
      toRemove.forEach(sound => {
        this.audioState.activeSFX.delete(sound);
      });
      
      if (toRemove.length > 0) {
        console.log(`🗑️ Limpiados ${toRemove.length} efectos terminados`);
      }
    }
  }, 5000); // Cada 5 segundos
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

// Actualizar controles del panel con los valores actuales CORREGIDOS
updateSoundHubControls() {
  const el = this.soundHubElements;
  
  if (!el.musicSlider || !el.sfxSlider) return;
  
  // Valores de música - usar _musicVolumeReal CORREGIDO
  const musicValue = Math.round(this.audioState._musicVolumeReal * 100);
  el.musicSlider.value = musicValue;
  el.musicPercent.textContent = `${musicValue}%`;
  el.musicSliderFill.style.width = `${musicValue}%`;
  el.musicMuteBtn.textContent = this.audioState.musicMuted ? 'Activar' : 'Silenciar';
  el.musicMuteBtn.classList.toggle('muted', this.audioState.musicMuted);
  
  // Valores de efectos - usar _sfxVolumeReal CORREGIDO
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
  
  console.log('🔧 Controles actualizados:', {
    music: `${musicValue}% (muted: ${this.audioState.musicMuted})`,
    sfx: `${sfxValue}% (muted: ${this.audioState.sfxMuted})`
  });
}

// Configurar eventos del panel de sonido CORREGIDOS
setupSoundHubEvents() {
  const el = this.soundHubElements;
  
  // Cerrar panel
  if (el.closeBtn) {
    el.closeBtn.addEventListener('click', () => {
      this.hideSoundHub();
    });
  }
  
  // Control deslizante de música - CORREGIDO
  if (el.musicSlider) {
    el.musicSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      el.musicPercent.textContent = `${value}%`;
      el.musicSliderFill.style.width = `${value}%`;
      
      // Actualizar volumen REAL de música
      this.setMusicVolumeReal(value / 100);
      
      // Si no está silenciado, aplicar inmediatamente
      if (!this.audioState.musicMuted) {
        this.setMusicVolume(value / 100);
      }
      
      // Guardar automáticamente sin notificación para que persista al recargar
      try {
        localStorage.setItem('grassland_music_volume', this.audioState._musicVolumeReal.toString());
        localStorage.setItem('grassland_music_muted', this.audioState.musicMuted.toString());
      } catch(err) { /* ignorar errores de localStorage */ }
    });
  }
  
  // Botón de prueba de música
  if (el.musicTestBtn) {
    el.musicTestBtn.addEventListener('click', () => {
      this.playTestMusic();
    });
  }
  
  // Botón de silenciar música - CORREGIDO
  if (el.musicMuteBtn) {
    el.musicMuteBtn.addEventListener('click', () => {
      this.toggleMusicMute();
      try {
        localStorage.setItem('grassland_music_muted', this.audioState.musicMuted.toString());
      } catch(err) { /* ignorar errores de localStorage */ }
    });
  }
  
  // Control deslizante de efectos - CORREGIDO
  if (el.sfxSlider) {
    el.sfxSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      el.sfxPercent.textContent = `${value}%`;
      el.sfxSliderFill.style.width = `${value}%`;
      
      // Actualizar volumen REAL de efectos
      this.setSFXVolumeReal(value / 100);
      
      // Si no está silenciado, aplicar inmediatamente
      if (!this.audioState.sfxMuted) {
        this.setSFXVolume(value / 100);
      }
      
      // Guardar automáticamente sin notificación para que persista al recargar
      try {
        localStorage.setItem('grassland_sfx_volume', this.audioState._sfxVolumeReal.toString());
        localStorage.setItem('grassland_sfx_muted', this.audioState.sfxMuted.toString());
      } catch(err) { /* ignorar errores de localStorage */ }
    });
  }
  
  // Botón de prueba de efectos
  if (el.sfxTestBtn) {
    el.sfxTestBtn.addEventListener('click', () => {
      this.playTestSFX();
    });
  }
  
  // Botón de silenciar efectos - CORREGIDO
  if (el.sfxMuteBtn) {
    el.sfxMuteBtn.addEventListener('click', () => {
      this.toggleSFXMute();
      try {
        localStorage.setItem('grassland_sfx_muted', this.audioState.sfxMuted.toString());
      } catch(err) { /* ignorar errores de localStorage */ }
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
      if (this.saveAudioSettings()) {
        this._showSaveSuccessBanner('Configuration Saved');
        this.hideSoundHub();
      }
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
  
  // (No pause used — nothing to resume)
  
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
// FUNCIONES DE CONTROL DE AUDIO CORREGIDAS
// ================================

// Establecer volumen REAL de música (se guarda) - CORREGIDO
setMusicVolumeReal(volume) {
  const clamped = Phaser.Math.Clamp(volume, 0, 1);
  this.audioState._musicVolumeReal = clamped;
  
  // Si la música no está silenciada, aplicar inmediatamente
  if (!this.audioState.musicMuted) {
    this.audioState.musicVolumeApplied = clamped;
    if (this.audioState.currentMusic) {
      this.audioState.currentMusic.setVolume(clamped);
    }
  }
  
  console.log(`💾 Volumen REAL de música guardado: ${clamped}`);
  console.log(`🎵 Volumen APLICADO de música: ${this.audioState.musicVolumeApplied}`);
}

// Establecer volumen REAL de efectos (se guarda)
setSFXVolumeReal(volume) {
  const clamped = Phaser.Math.Clamp(volume, 0, 1);
  this.audioState._sfxVolumeReal = clamped;
  
  // Si los efectos no están silenciados, aplicar a los efectos activos
  if (!this.audioState.sfxMuted) {
    this.audioState.sfxVolumeApplied = clamped;
    
    // Actualizar solo los efectos activos individualmente
    // NO usar this.sound.volume porque afectaría también a la música
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.forEach(sound => {
        if (sound.isPlaying) {
          sound.setVolume(clamped);
        }
      });
    }
  }
  
  console.log(`💾 Volumen REAL de efectos guardado: ${clamped}`);
  console.log(`🔊 Volumen APLICADO de efectos: ${this.audioState.sfxVolumeApplied}`);
}

// Establecer volumen APLICADO de música (0-1) - CORREGIDO
setMusicVolume(volume) {
  const clamped = Phaser.Math.Clamp(volume, 0, 1);
  this.audioState.musicVolumeApplied = clamped;
  
  // Aplicar SOLO a la música actual - CORREGIDO
  if (this.audioState.currentMusic) {
    this.audioState.currentMusic.setVolume(clamped);
  }
  
  console.log(`🎵 Volumen APLICADO de música: ${clamped}`);
}

// Establecer volumen APLICADO de efectos (0-1)
setSFXVolume(volume) {
  const clamped = Phaser.Math.Clamp(volume, 0, 1);
  this.audioState.sfxVolumeApplied = clamped;
  
  // Actualizar solo los efectos activos individualmente
  // NO usar this.sound.volume porque afectaría también a la música
  if (this.audioState.activeSFX) {
    this.audioState.activeSFX.forEach(sound => {
      if (sound.isPlaying) {
        sound.setVolume(clamped);
      }
    });
  }
  
  console.log(`🔊 Volumen APLICADO de efectos: ${clamped}`);
}

// Alternar silencio de música - CORREGIDO
toggleMusicMute() {
  this.audioState.musicMuted = !this.audioState.musicMuted;
  
  if (this.audioState.musicMuted) {
    // Silenciar: volumen 0
    this.audioState.musicVolumeApplied = 0;
    if (this.audioState.currentMusic) {
      this.audioState.currentMusic.setVolume(0);
    }
  } else {
    // Activar: usar volumen REAL guardado
    this.audioState.musicVolumeApplied = this.audioState._musicVolumeReal;
    if (this.audioState.currentMusic) {
      this.audioState.currentMusic.setVolume(this.audioState._musicVolumeReal);
    }
  }
  
  // Actualizar controles
  this.updateSoundHubControls();
  
  console.log(`🎵 Música ${this.audioState.musicMuted ? 'silenciada' : 'activada'} (volumen aplicado: ${this.audioState.musicVolumeApplied})`);
}

// Alternar silencio de efectos - CORREGIDO
toggleSFXMute() {
  this.audioState.sfxMuted = !this.audioState.sfxMuted;
  
  if (this.audioState.sfxMuted) {
    // Silenciar: volumen 0 solo en efectos activos
    this.audioState.sfxVolumeApplied = 0;
    
    // Silenciar efectos activos individualmente — NO tocar this.sound.volume
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.forEach(sound => {
        if (sound.isPlaying) {
          sound.setVolume(0);
        }
      });
    }
  } else {
    // Activar: usar volumen REAL guardado
    this.audioState.sfxVolumeApplied = this.audioState._sfxVolumeReal;
    
    // Activar efectos activos individualmente — NO tocar this.sound.volume
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.forEach(sound => {
        if (sound.isPlaying) {
          sound.setVolume(this.audioState._sfxVolumeReal);
        }
      });
    }
  }
  
  // Actualizar controles
  this.updateSoundHubControls();
  
  console.log(`🔊 Efectos ${this.audioState.sfxMuted ? 'silenciados' : 'activados'} (volumen aplicado: ${this.audioState.sfxVolumeApplied})`);
}

// Reproducir música - CORREGIDO
playMusic(key, config = {}) {
  // Detener música actual si existe
  if (this.audioState.currentMusic) {
    this.audioState.currentMusic.stop();
  }
  
  // Configuración por defecto - CORREGIDO
  // Usa el volumen APLICADO (que considera si está silenciado o no)
  const defaultConfig = {
    volume: this.audioState.musicVolumeApplied,
    loop: true,
    delay: 0
  };
  
  const finalConfig = { ...defaultConfig, ...config };
  
  // Reproducir nueva música
  try {
    this.audioState.currentMusic = this.sound.add(key, finalConfig);
    this.audioState.currentMusicKey = key;
    this.audioState.currentMusic.play();
    
    console.log(`🎵 Reproduciendo música: ${key} (volumen: ${finalConfig.volume})`);
    
    // Actualizar selector si el panel está abierto
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

// Reproducir efecto de sonido - CORREGIDO
playSFX(key, config = {}) {
  // Configuración por defecto - CORREGIDO
  // Usa el volumen APLICADO (que considera si está silenciado o no)
  const defaultConfig = {
    volume: this.audioState.sfxVolumeApplied
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
    
    // CORRECCIÓN: Registrar efecto activo
    if (this.audioState.activeSFX) {
      this.audioState.activeSFX.add(sound);
      
      // Remover cuando termine
      sound.once('complete', () => {
        if (this.audioState.activeSFX) {
          this.audioState.activeSFX.delete(sound);
        }
      });
    }
    
    console.log(`🔊 Reproduciendo efecto: ${key} (volumen: ${finalConfig.volume})`);
    return sound;
  } catch (error) {
    console.error(`❌ Error reproduciendo efecto ${key}:`, error);
    return null;
  }
}

// Reproducir música de prueba - CORREGIDO
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
      volume: this.audioState.musicVolumeApplied,
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

// Reproducir efecto de prueba - CORREGIDO
playTestSFX() {
  try {
    // Verificar si existe un sonido de prueba
    const testSounds = ['click-sound', 'test-beep', 'test-sfx'];
    
    for (const soundKey of testSounds) {
      if (this.cache.audio.exists(soundKey)) {
        this.playSFX(soundKey, {
          volume: this.audioState.sfxVolumeApplied
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

// Crear un beep de prueba simple - CORREGIDO
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
    
    // Usar el volumen APLICADO de efectos
    gainNode.gain.value = this.audioState.sfxVolumeApplied * 0.1;
    
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







    // ── ZOOM: un solo punto de aplicación ────────────────────────────────────
    //
    // Antes cada función de zoom lanzaba su propio tween sobre cam.zoom sin
    // cancelar el anterior. Dos tweens solapados se peleaban por la misma
    // propiedad y el valor final era el del que terminara último, así que
    // `currentZoomIndex` (lo que el jugador pidió) y `cam.zoom` (lo que se ve)
    // se separaban. En el móvil eso salta con el chat: abrir el teclado dispara
    // un resize del viewport, el juego reflota y el zoom se queda en el valor a
    // medias del tween en vuelo — de ahí el "quería volver a 0.5 y me lo dejó
    // en 1 o 2".
    //
    // Ahora: se guarda el índice deseado, se mata cualquier tween de zoom en
    // vuelo y al terminar se fija el valor EXACTO. Y `_reapplyZoom()` vuelve a
    // poner ese valor después de cada resize.
    _applyZoomIndex(index, duration = 300) {
        if (index < 0 || index >= this.zoomValues.length) return;
        this.currentZoomIndex = index;
        const newZoom = this.zoomValues[index];
        const cam = this.cameras && this.cameras.main;
        if (!cam) return;

        // Matar el tween anterior: sin esto los dos animan cam.zoom a la vez.
        if (this._zoomTween) { this._zoomTween.stop(); this._zoomTween = null; }

        if (!duration) { cam.setZoom(newZoom); return; }

        this._zoomTween = this.tweens.add({
            targets: cam,
            zoom: newZoom,
            duration: duration,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                this._zoomTween = null;
                // Valor exacto: el tween puede dejar 0.4999999 y con pixel art
                // eso reintroduce las costuras entre tiles.
                cam.setZoom(this.zoomValues[this.currentZoomIndex]);
            }
        });
    }

    /**
     * Vuelve a poner el zoom que el jugador tenía elegido, sin animación.
     * Se llama después de un resize del viewport (teclado del móvil al abrir el
     * chat, giro de pantalla, barra de direcciones que aparece y desaparece).
     */
    _reapplyZoom() {
        const cam = this.cameras && this.cameras.main;
        if (!cam || !this.zoomValues) return;
        const deseado = this.zoomValues[this.currentZoomIndex];
        if (typeof deseado !== 'number') return;
        if (this._zoomTween) { this._zoomTween.stop(); this._zoomTween = null; }
        if (cam.zoom !== deseado) {
            console.log(`🔁 Restaurando zoom a ${deseado}x (estaba en ${cam.zoom}x)`);
            cam.setZoom(deseado);
        }
    }

    /**
     * Escucha los cambios de tamaño del viewport para restaurar el zoom.
     * En móvil el evento que importa es visualViewport.resize: es el que dispara
     * el teclado al abrirse y cerrarse. window.resize no siempre llega.
     */
    _setupZoomKeeper() {
        if (this._zoomKeeperBound) return;
        this._zoomKeeperBound = true;

        let t = null;
        this._onViewportChange = () => {
            clearTimeout(t);
            // Se espera a que el navegador termine de reflotar: el resize del
            // teclado llega en varios pasos y restaurar antes de tiempo no sirve.
            t = setTimeout(() => this._reapplyZoom(), 250);
        };

        window.addEventListener('resize', this._onViewportChange);
        window.addEventListener('orientationchange', this._onViewportChange);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this._onViewportChange);
        }

        // Al cerrar el chat en el móvil el teclado se va: mismo tratamiento.
        this.events.once('shutdown', () => this._teardownZoomKeeper());
        this.events.once('destroy',  () => this._teardownZoomKeeper());
    }

    _teardownZoomKeeper() {
        if (!this._onViewportChange) return;
        window.removeEventListener('resize', this._onViewportChange);
        window.removeEventListener('orientationchange', this._onViewportChange);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this._onViewportChange);
        }
        this._onViewportChange = null;
        this._zoomKeeperBound  = false;
    }

    // 🔍 ZOOM IN PRECISO - Usando valores predefinidos
    preciseZoomIn(duration = 300) {
        if (this.currentZoomIndex < this.zoomValues.length - 1) {
            console.log(`🔍 Zoom In: ${this.zoomValues[this.currentZoomIndex]} → ${this.zoomValues[this.currentZoomIndex + 1]}`);
            this._applyZoomIndex(this.currentZoomIndex + 1, duration);
        } else {
            console.log("ℹ️ Límite máximo alcanzado (2.0x)");
        }
    }

    // 🔍 ZOOM OUT PRECISO - Usando valores predefinidos
    preciseZoomOut(duration = 300) {
        if (this.currentZoomIndex > 0) {
            console.log(`🔍 Zoom Out: ${this.zoomValues[this.currentZoomIndex]} → ${this.zoomValues[this.currentZoomIndex - 1]}`);
            this._applyZoomIndex(this.currentZoomIndex - 1, duration);
        } else {
            console.log("ℹ️ Límite mínimo alcanzado (0.5x)");
        }
    }

    // 🎯 ZOOM A VALOR ESPECÍFICO EXACTO
    preciseZoomTo(targetZoom, duration = 400) {
        const targetIndex = this.zoomValues.findIndex(z => z === targetZoom);
        if (targetIndex !== -1 && targetIndex !== this.currentZoomIndex) {
            console.log(`🎯 Zoom To: ${this.zoomValues[this.currentZoomIndex]} → ${targetZoom}`);
            this._applyZoomIndex(targetIndex, duration);
        }
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
            // Sin animación, pero por el mismo camino que el resto: así también
            // mata cualquier tween en vuelo y no se queda un valor a medias.
            this._applyZoomIndex(index, 0);
            console.log(`🔧 Zoom actual establecido a: ${this.zoomValues[this.currentZoomIndex]}x`);
        }
    }






















    // ================================
    // SOCKET MANAGEMENT
    // ================================

    initSocket() {
      console.log("🔄 Inicializando socket para game...");
      
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
      if (this.currentRoom !== 'game') {
        this.joinRoom('game');
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

    
    cleanInactivePlayers() {
      // Players removed only on real disconnect — NOT on idle timeout.
      // Ensures messages/sprites stay while player is connected but still.
    }


    setupSceneSocketListeners() {
      // Limpiar listeners anteriores
      this.removeSocketListeners();
      
      const listeners = [
        // currentPlayers - Recibir todos los jugadores en la sala
        {
          event: 'currentPlayers',
          handler: (players) => {
            console.log(`🎮 Recibidos ${players.length} jugadores en game`);
            
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
            console.log(`👤 Nuevo jugador en game: ${playerInfo.username || playerInfo.id}`);
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
            // Mostrar burbuja sobre el personaje remoto
            if (message && message.id && message.id !== (this.socket && this.socket.id)) {
              this._showRemoteChatBubble(message.id, this._desescaparChat(message.text || ''));
            }
          }
        },
        // chatTyping - Indicador de escritura
        {
          event: 'chatTyping',
          handler: (data) => {
            if (data && data.id && data.id !== (this.socket && this.socket.id)) {
              this._showRemoteTypingBubble(data.id, !!data.typing);
            }
          }
        },
        
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
        lastScene: 'GameScene', // IMPORTANTE: Identificar la escena actual
        x: this.player ? this.player.x : 200,
        y: this.player ? this.player.y : 300,
        // Niveles ya en el JOIN: si el jugador entra y no se mueve, playerMove
        // nunca se emite y los demás lo verían sin nivel indefinidamente.
        nivel:    Math.max(0, Number(this.nivel) || 0),
        petLevel: Math.max(1, Number(this.petLevel) || 1),
        dogName:  this._isNameSet && this._isNameSet(this.petName) ? this.petName : ''
      });
    }

// En la clase tiendajuego, reemplaza el método sendPlayerMovement:
sendPlayerMovement() {
  if (!this.socket || !this.socket.connected || !this.player) return;
  
  // Calcular si se está moviendo realmente (teclado O mouse)
  const keyboardMoving = this.keys.left.isDown || this.keys.right.isDown ||
                   this.keys.up.isDown || this.keys.down.isDown ||
                   this.keys.leftArrow.isDown || this.keys.rightArrow.isDown ||
                   this.keys.upArrow.isDown || this.keys.downArrow.isDown;

  // FIX MULTIJUGADOR-MOUSE: el movimiento con mouse no toca el teclado, así
  // que antes isMoving quedaba en false y se emitía direction:'stop' — los
  // demás jugadores te veían deslizarte por el mapa SIN animación. Se
  // considera "moviéndose con mouse" solo si el modo seguir-cursor está
  // activo Y hubo desplazamiento real desde el último envío (así, si te
  // quedas parado sobre el cursor con el click sostenido, se emite 'stop'
  // y no apareces caminando en el sitio en las pantallas ajenas).
  const mouseDisplaced = !this.lastSentPosition ||
      Math.abs(this.player.x - this.lastSentPosition.x) >= 0.5 ||
      Math.abs(this.player.y - this.lastSentPosition.y) >= 0.5;
  const mouseMoving = !!(this.mouseMovement && this.mouseMovement.followCursorActive) && mouseDisplaced;

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
      // FIX MULTIJUGADOR-MOUSE: derivar la dirección del vector hacia el
      // cursor. Con mouse solo existen 'left'/'right' (igual que la
      // animación local): la componente horizontal decide el lado.
      const mdx = this.mouseMovement.directionX || 0;
      if (mdx < -0.001) { currentDirection = 'left'; directionState = 'left'; }
      else if (mdx > 0.001) { currentDirection = 'right'; directionState = 'right'; }
      else { directionState = (currentDirection === 'left') ? 'left' : 'right'; }
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
    // veían tu perro sin etiqueta. El servidor reenvía el payload tal cual
    // (socket.on('playerMove') hace spread de data), así que no hay que tocar
    // el backend.
    dogName: this._isNameSet && this._isNameSet(this.petName) ? this.petName : '',
    // Nivel de la mascota: así los demás jugadores lo ven junto al nombre.
    petLevel: Math.max(1, Number(this.petLevel) || 1),
    // Nivel del PERSONAJE. No se enviaba nunca, y por eso la etiqueta de los
    // demás jugadores solo mostraba el nombre: su nivel no llegaba al cliente.
    nivel: Math.max(0, Number(this.nivel) || 0)
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
    this._playerLabelText(playerInfo.username, playerInfo.nivel),
    {
      fontFamily: '"PressStart2P"',
      fontSize: '9px',
      color: '#ffffff',
      resolution: 4,
      stroke: '#000000',
      strokeThickness: 5,
    }
  );
  nameText.setOrigin(0.5, 1);
  // Ordenada por la línea de los pies (como el sprite), NO en 99999: así queda
  // por debajo de los carteles de los NPC (NPC_LABEL_DEPTH = 90000) y el
  // jugador remoto pasa por detrás de ellos, igual que el jugador local.
  nameText.setDepth(playerInfo.y + sprite.displayHeight * 0.5 + 1);

  this.otherPlayers[playerInfo.id] = {
    sprite,
    nameText,
    _displayName: playerInfo.username || 'Player',
    _nivel: typeof playerInfo.nivel === 'number' ? playerInfo.nivel : undefined,
    // Identidad que manda el SERVIDOR (no el cliente): con ella el submenú
    // de clic derecho sabe a qué cuenta apuntan Profile / Verifier / Report.
    _address: playerInfo.address || null,
    _playerName: playerInfo.playerName || null,
    _lastChatMsg: null,
    _prevChatMsg: null,
    lastUpdate: Date.now(),
    lastDirection: playerInfo.direction || 'right',
    dog: null
  };

  const remotePlayer = this.otherPlayers[playerInfo.id];

  // SUBMENÚ DE JUGADOR (2026-08-03): clic derecho sobre otro personaje abre
  // Profile / Send verifier / Report para ESE jugador en concreto.
  this._habilitarMenuJugador(playerInfo.id, sprite);

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

  // Etiqueta con el nombre de la mascota (mismo estilo que la del jugador,
  // un punto más pequeña). Antes no existía: el perro propio sí tenía nombre
  // (this.dogNameText) pero los perros de los demás salían sin nada.
  remotePlayer.dog.nameText = this.add.text(
    playerInfo.dogX ?? playerInfo.x + 40,
    (playerInfo.dogY ?? playerInfo.y + 20) - 30,
    this._dogLabelText(playerInfo.dogName, playerInfo.petLevel),
    {
      fontFamily: '"PressStart2P"',
      fontSize: '8px',
      color: '#ffffff',
      resolution: 4,
      stroke: '#000000',
      strokeThickness: 5,
    }
  ).setOrigin(0.5, 1);
  remotePlayer.dog._petLevel = playerInfo.petLevel;
  remotePlayer.dog.nameText.setVisible(true);
}

updateOtherPlayer(playerInfo) {
  const player = this.otherPlayers[playerInfo.id];

  // FIX: este chequeo estaba DESPUÉS de usar player._chatText / player.sprite,
  // así que un playerMoved de un jugador aún no creado lanzaba TypeError sobre
  // undefined y el jugador jamás llegaba a crearse por esta vía.
  if (!player) {
    // Don't recreate a player that just left — stale playerMoved event
    if (this._recentlyRemoved && this._recentlyRemoved[playerInfo.id]) return;
    console.log(`⚠️ Jugador ${playerInfo.id} no encontrado, creando...`);
    this.createOtherPlayer(playerInfo);
    return;
  }

  // Mover burbujas de chat/typing junto con el sprite
  if (player._chatText) {
    const sprH5 = player.sprite.displayHeight || 64;
    player._chatText.setPosition(playerInfo.x, playerInfo.y - sprH5 * 0.5 - 28);
  }
  if (player._chatTypingText) {
    const sprH5 = player.sprite.displayHeight || 64;
    player._chatTypingText.setPosition(playerInfo.x, playerInfo.y - sprH5 * 0.5 - 22);
  }
  // Update display name if it changed
  if (playerInfo.username) player._displayName = playerInfo.username;
  // La identidad puede llegar más tarde que el primer paquete (por ejemplo si
  // el socket todavía no había resuelto su playerName al entrar a la sala).
  if (playerInfo.address)    player._address = playerInfo.address;
  if (playerInfo.playerName) player._playerName = playerInfo.playerName;
  // Keep name updated position.
  // PROFUNDIDAD (2026-08-05): antes esto ponía 99999, es decir por ENCIMA de
  // todo — incluidos los carteles de los NPC. Como este bloque corre en cada
  // paquete de movimiento, pisaba al reordenado por pies de
  // _refreshRemoteDepths() y la etiqueta de los demás jugadores tapaba los
  // carteles morados. Ahora se ordena por la línea de sus pies, igual que el
  // sprite, así que queda siempre por debajo de NPC_LABEL_DEPTH.
  if (player.nameText) {
    const sprH6 = player.sprite.displayHeight || 64;
    player.nameText.setPosition(playerInfo.x, playerInfo.y - sprH6 * 0.5 - 14);
    player.nameText.setDepth(playerInfo.y + sprH6 * 0.5 + 1);
  }
  // Move new chat/typing containers
  if (player._chatContainer) {
    const sprH7 = player.sprite.displayHeight || 64;
    player._chatContainer.setPosition(playerInfo.x, playerInfo.y - sprH7 * 0.5 - 50);
    player._chatContainer.setDepth(99998);
  }
  if (player._typingContainer) {
    const sprH7 = player.sprite.displayHeight || 64;
    // Dots between name (-14) and message top (-50): position just below name
    const dotsY = playerInfo.y - sprH7 * 0.5 - 26;
    player._typingContainer.setPosition(playerInfo.x, dotsY);
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
      // Nombre + NIVEL del jugador remoto. El nivel llega en playerMove; si el
      // jugador todavía no ha mandado ninguno (acaba de entrar), se guarda el
      // último conocido para no hacer parpadear la etiqueta.
      if (typeof playerInfo.nivel === 'number') player._nivel = playerInfo.nivel;
      player.nameText.setText(
        this._playerLabelText(playerInfo.usernamex || playerInfo.username || 'Jugador', player._nivel)
      );
    }

    if (!player.dog) {
      player.dog = {
        sprite: null,
        shadowContainer: null,
        direction: 'right',
        lastAnimState: 'idle'
      };
    }

    // If the remote player removed their dog, hide it on our end
    const dogEquipped = playerInfo.dogEquipped !== false; // default true if not sent
    if (!dogEquipped) {
      if (player.dog.sprite) player.dog.sprite.setVisible(false);
      if (player.dog.shadowContainer) player.dog.shadowContainer.setVisible(false);
      if (player.dog.nameText) player.dog.nameText.setVisible(false);
      // Skip dog update
    } else {
      // Make sure dog is visible again if it was hidden before
      if (player.dog.sprite) player.dog.sprite.setVisible(true);
      if (player.dog.shadowContainer) player.dog.shadowContainer.setVisible(true);

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

    // Nombre de la mascota remota: se crea si el jugador ya existía de antes
    // (sesiones anteriores a este cambio) y se mantiene pegado sobre el perro.
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
    // Nombre + NIVEL de la mascota remota. El nivel se muestra aunque el perro
    // no tenga nombre todavía (antes se ocultaba la etiqueta entera y por eso
    // no se veía ningún nivel de mascota).
    if (typeof playerInfo.petLevel === 'number') player.dog._petLevel = playerInfo.petLevel;
    player.dog.nameText.setText(this._dogLabelText(dogName, player.dog._petLevel));
    player.dog.nameText.setPosition(dogX, dogY - player.dog.sprite.displayHeight * 0.5 - 4);
    player.dog.nameText.setDepth(remoteDogFeetY + 1);
    player.dog.nameText.setVisible(true);
    } // end dogEquipped else block
  }

  player.lastUpdate = Date.now();
}

removeOtherPlayer(playerId) {
  const player = this.otherPlayers[playerId];
  if (!player) return;

  if (player.sprite) player.sprite.destroy();
  if (player.nameText) player.nameText.destroy();
  if (player._chatContainer) { try { player._chatContainer.destroy(); } catch(_){} }
  if (player._typingContainer) { try { player._typingContainer.destroy(); } catch(_){} }

  if (player.dog) {
    if (player.dog.sprite) player.dog.sprite.destroy();
    if (player.dog.shadowContainer) player.dog.shadowContainer.destroy();
    if (player.dog.nameText) player.dog.nameText.destroy();
  }

  delete this.otherPlayers[playerId];

  // Block ghost: ignore stale playerMoved events that arrive after removal
  if (!this._recentlyRemoved) this._recentlyRemoved = {};
  this._recentlyRemoved[playerId] = Date.now();
  setTimeout(() => { if (this._recentlyRemoved) delete this._recentlyRemoved[playerId]; }, 3000);

  console.log(`🗑️ Jugador ${playerId} removido de game`);
}

    setupSceneEvents() {
      // Los manejadores se guardan en this._sceneEventHandlers para poder
      // quitarlos UNO A UNO al limpiar la escena. Antes se hacía
      // events.removeAllListeners(), que también borraba los listeners
      // internos de Phaser (física, input, reloj, plugins…) y dejaba la
      // escena inservible al volver a entrar. Ver cleanupScene().
      this._sceneEventHandlers = this._sceneEventHandlers || [];

      const registrar = (evento, fn) => {
        this.events.on(evento, fn);
        this._sceneEventHandlers.push([evento, fn]);
      };

      // Evento cuando la escena entra en pausa (al cambiar a otra escena)
      registrar('pause', () => {
        console.log('⏸️ Escena game pausada');
        this.leaveRoom();
      });

      // Evento cuando la escena se reanuda
      registrar('resume', () => {
        console.log('▶️ Escena game reanudada');
        this.time.delayedCall(300, () => {
          this.initSocket();
        });
      });

      // Evento cuando la escena se duerme (Scene Manager)
      registrar('sleep', () => {
        console.log('💤 Escena game dormida');
        this.cleanupBeforeTransition();
      });

      // Evento cuando la escena se despierta
      registrar('wake', () => {
        console.log('🌅 Escena game despierta');
        this.time.delayedCall(300, () => {
          this.initSocket();
        });
        // Refrescar stats desde el backend al volver de otra escena
        this._refreshStatsFromChain().catch(e => console.warn('refreshStats error:', e));
      });

      // Evento shutdown - se llama cuando la escena es detenida
      registrar('shutdown', () => {
        console.log('🔌 Escena game shutdown');
        this.performCleanup();
      });

      // Evento destroy - se llama cuando la escena es destruida
      registrar('destroy', () => {
        console.log('💥 Escena game destroy');
        this.performCleanup();
      });
    }

    leaveRoom() {
      console.log('🚪 Saliendo de sala game...');
      
      if (this.socket && this.socket.connected) {
        // Emitir que estamos cambiando a game
        this.socket.emit("joinRoom", {
          room: "tienda",
          username: this.Username || '---',
          lastScene: 'GameScene',
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
      console.log('🧼 Limpieza completa de escena game');
      
      // Tell the server we are leaving this room BEFORE clearing socket
      if (this.socket && this.socket.connected) {
        this.socket.emit("joinRoom", {
          room: "tienda",
          username: this.Username || '---',
          lastScene: 'GameScene',
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


    // ================================
    // TRANSICIÓN A OTRA ESCENA
    // ================================

    // Modifica la sección donde detectas colisión con la puerta:
    // Reemplaza la parte que hace this.scene.start("LoadingScenegame") con:

    transitionToGameScene() {
      console.log('🚪 Transicionando a tienda desde GameScene...');
      
      this.queuedAction({ type: 'forSpam2'});

      // 2. Limpiar socket y jugadores
      this.cleanupBeforeTransition();
      
      // 3. Ocultar elementos del DOM
      this.hideHudElements();
      
      // 4. Cambiar a LoadingScene con delay para asegurar limpieza
      this.time.delayedCall(100, () => {
        // Emitir joinRoom a game antes de cambiar
        if (this.socket && this.socket.connected) {
          this.socket.emit("joinRoom", {
            room: "game",
            username: this.Username || '---',
            lastScene: 'GameScene',
            x: 1552, // Posición inicial en GameScene
            y: 1531
          });
        }
        
        // Cambiar escena
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
      
      // Resetear barras
      const _srGS = this._statsReady;
      this._statsReady = false;
      this.actualizarBarraVida(0);
      this.actualizarBarraAgua(0);
      this.actualizarBarraComida(0);
      this._statsReady = _srGS;
      
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

    // Selector de emojis (botón junto al campo de texto).
    this._montarSelectorEmojis();


    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this._sendChatFromInput();
      } else if (e.key === 'Escape') {
        toggleChat(false);
        // Return focus to game canvas so movement works
        const gameCanvas = document.querySelector('canvas');
        if (gameCanvas) gameCanvas.focus();
      }
    });

    // When chat input is focused: disable game movement
    this.chatInput.addEventListener('focus', () => {
      this._chatInputFocused = true;
      // Se apunta el zoom elegido ANTES de que el teclado del móvil reflote el
      // viewport, para poder devolverlo tal cual al cerrarse.
      if (this.cameras && this.cameras.main) this._zoomBeforeKeyboard = this.currentZoomIndex;
    });
    // When chat loses focus: re-enable game movement
    this.chatInput.addEventListener('blur', () => {
      this._chatInputFocused = false;
      // El teclado se va y el viewport vuelve a su tamaño: restaurar el zoom.
      // El visualViewport tarda un poco en estabilizarse, de ahí los dos pases.
      if (typeof this._zoomBeforeKeyboard === 'number' && this._applyZoomIndex) {
        const idx = this._zoomBeforeKeyboard;
        setTimeout(() => this._applyZoomIndex(idx, 0), 60);
        setTimeout(() => this._applyZoomIndex(idx, 0), 350);
      }
    });

    // Clicking the game canvas while chat is open should blur chat input
    const gameCanvas = document.querySelector('canvas');
    if (gameCanvas) {
      gameCanvas.addEventListener('pointerdown', () => {
        if (this._chatInputFocused) {
          this.chatInput.blur();
          this._chatInputFocused = false;
        }
      });
    }

    // ── Typing indicator: emitir al servidor y mostrar dots locales ──────────
    this._typingTimer = null;
    this._isTyping = false;
    this.chatInput.addEventListener('input', () => {
      if (this.chatInput.value.length > 0) {
        if (!this._isTyping) {
          this._isTyping = true;
          // Only emit to others — no dots for local player
          if (this.socket && this.socket.connected) {
            this.socket.emit('chatTyping', { typing: true, usernamex: this.Username || '---' });
          }
        }
        clearTimeout(this._typingTimer);
        this._typingTimer = setTimeout(() => {
          this._isTyping = false;
          if (this.socket && this.socket.connected) {
            this.socket.emit('chatTyping', { typing: false, usernamex: this.Username || '---' });
          }
        }, 1500);
      } else {
        clearTimeout(this._typingTimer);
        this._isTyping = false;
        if (this.socket && this.socket.connected) {
          this.socket.emit('chatTyping', { typing: false, usernamex: this.Username || '---' });
        }
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
      this.appendSystemMessage('Please wait a moment before sending another message.');
      return;
    }
    this._lastChatSent = now;

    // preparar payload
    const payload = {
      usernamex: this.Username || '---',
      text
    };

    if (!this.socket || !this.socket.connected) {
      this.appendSystemMessage('Not connected to the chat server.');
      return;
    }

    // emitir y limpiar input
    this.socket.emit('chatMessage', payload);
    // Al enviar se cierra el selector de emojis, si estaba abierto.
    if (typeof this._cerrarSelectorEmojis === 'function') this._cerrarSelectorEmojis();
    this._isTyping = false;
    clearTimeout(this._typingTimer);
    if (this.socket && this.socket.connected)
      this.socket.emit('chatTyping', { typing: false, usernamex: this.Username || '---' });
    this._showLocalChatBubble(text);  // Show sent message above own character
    this.chatInput.value = '';
  }



  // ─────────────────────────────────────────────────────────────────────────
  // CHAT BUBBLE SOBRE EL PERSONAJE (local y remoto)
  // ─────────────────────────────────────────────────────────────────────────

  /** Muestra/oculta los tres puntos de escritura sobre el jugador local */
  _showLocalTyping(show) {
    const bubble = document.getElementById('local-chat-bubble');
    if (!bubble) return;
    if (show) {
      bubble.innerHTML = '<div class="chat-typing-dots"><span></span><span></span><span></span></div>';
      bubble.style.display = 'flex';
      this._positionLocalBubble(bubble);
    } else {
      bubble.style.display = 'none';
      bubble.innerHTML = '';
    }
  }

  /** Posiciona la burbuja local sobre el sprite del jugador local */
  _positionLocalBubble(bubble) {
    if (!this.player || !this.cameras || !this.cameras.main) return;
    const cam = this.cameras.main;
    const sx = (this.player.x - cam.scrollX) * cam.zoom + (this.scale.width  * 0.5 * (1 - cam.zoom));
    const sy = (this.player.y - cam.scrollY) * cam.zoom + (this.scale.height * 0.5 * (1 - cam.zoom));
    const sprH = (this.player.displayHeight || 64) * cam.zoom;
    // Position above the player sprite + name (extra 44px for name)
    bubble.style.left = sx + 'px';
    bubble.style.top  = (sy - sprH * 0.5 - 54) + 'px';
    bubble.style.transform = 'translateX(-50%)';
  }

  /** Muestra un mensaje de chat sobre el jugador local durante 4s */
  _showLocalChatBubble(text) {
    const bubble = document.getElementById('local-chat-bubble');
    if (!bubble) return;
    // Limitar a últimas 3 líneas
    const lines = text.split('\n').slice(-3).join('\n');
    bubble.innerHTML = `<div class="chat-bubble-msg own">${this._escHtml(lines)}</div>`;
    bubble.style.display = 'flex';
    this._positionLocalBubble(bubble);
    clearTimeout(this._localBubbleTimer);
    this._localBubbleTimer = setTimeout(() => {
      bubble.style.display = 'none';
      bubble.innerHTML = '';
    }, 4000);
  }

  /** Escapa HTML para evitar inyección */
  _escHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /** Muestra un mensaje sobre un jugador remoto (otherPlayers) */
  /** Show message bubble above remote player - message only, name already visible above sprite */
  _showRemoteChatBubble(playerId, text) {
    const op = this.otherPlayers && this.otherPlayers[playerId];
    if (!op || !op.sprite) return;
    op._lastChatMsg = text;
    // Destroy any existing chat container and typing indicator
    if (op._chatContainer) { op._chatContainer.destroy(); op._chatContainer = null; }
    if (op._typingContainer) { op._typingContainer.destroy(); op._typingContainer = null; }
    clearTimeout(op._chatTimer);
    clearTimeout(op._typingHideTimer);
    const sprH = op.sprite.displayHeight || 64;
    // Show only the message — name is already floating above the sprite
    const clipped = text.length > 70 ? text.slice(0, 70) + '\u2026' : text;
    op._chatContainer = this.add.text(
      op.sprite.x, op.sprite.y - sprH * 0.5 - 50, clipped,
      { fontFamily:'"PressStart2P"', fontSize:'7px', color:'#d0eaff',
        backgroundColor:'rgba(8,18,45,0.90)', padding:{x:7,y:5},
        wordWrap:{width:170}, stroke:'#001030', strokeThickness:2,
        resolution:4, lineSpacing:4 }
    ).setOrigin(0.5,1).setDepth(99998);
    op._chatTimer = setTimeout(() => {
      if(op._chatContainer){op._chatContainer.destroy();op._chatContainer=null;}
    }, 5000);
  }

  /** Show typing indicator: ... appears between player name and message */
  _showRemoteTypingBubble(playerId, show) {
    const op = this.otherPlayers && this.otherPlayers[playerId];
    if (!op || !op.sprite) return;
    // Always destroy previous typing container
    if (op._typingContainer) { op._typingContainer.destroy(); op._typingContainer = null; }
    clearTimeout(op._typingHideTimer);
    if (!show) return;
    const sprH = op.sprite.displayHeight || 64;
    // Dots appear above the sprite, just below where a message would be (origin=1 top of msg zone)
    // Name is at -14, message at -50 (origin 1 = bottom of text), dots go just below name
    const dotsY = op.sprite.y - sprH * 0.5 - 26;
    op._typingContainer = this.add.text(
      op.sprite.x, dotsY, '...',
      { fontFamily:'"PressStart2P"', fontSize:'7px', color:'#80c8ff',
        backgroundColor:'rgba(8,18,45,0.85)', padding:{x:7,y:4},
        stroke:'#001030', strokeThickness:2,
        resolution:4 }
    ).setOrigin(0.5,1).setDepth(99998);
    op._typingHideTimer = setTimeout(() => {
      if(op._typingContainer){op._typingContainer.destroy();op._typingContainer=null;}
    }, 3500);
  }

  // -----------------------------
  // Append messages (DOM safe)
  // -----------------------------
  // ═════════════════════════════════════════════════════════════════════════
  // SELECTOR DE EMOJIS DEL CHAT                                  (2026-08-05)
  // -------------------------------------------------------------------------
  // En el teléfono el teclado del sistema ya trae emojis, pero en el PC no
  // había forma de meterlos. Este botón abre una rejilla por categorías e
  // inserta el emoji en la posición del cursor.
  //
  // Los emojis NO necesitan nada especial para viajar: el servidor solo escapa
  // & < > " ' (escapeHtml), así que pasan intactos por el socket y los ve tanto
  // quien escribe como el resto de jugadores de la sala.
  //
  // El DOM del chat sobrevive a los cambios de escena, así que el enganche se
  // hace UNA sola vez por elemento (bandera en el propio nodo): si no, al ir y
  // volver de la tienda se acumularían listeners y un clic abriría/cerraría el
  // panel varias veces.
  // ═════════════════════════════════════════════════════════════════════════
  _montarSelectorEmojis() {
    const boton = document.getElementById('chat-emoji-btn');
    const panel = document.getElementById('chat-emoji-picker');
    if (!boton || !panel || !this.chatInput) return;

    const CATEGORIAS = [
      { nombre: 'Faces', lista: ['😀','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😍','🥰','😘','😜','🤪','🤔','🤨','😐','😴','😎','🥳','😏','😢','😭','😤','😡','🥺','😱','🤯','🤗','🤝','🙏'] },
      { nombre: 'Gestures', lista: ['👍','👎','👌','✌️','🤞','🤙','👋','💪','🫶','👏','🙌','🤛','🤜','✊','☝️','🖐️'] },
      { nombre: 'Game', lista: ['⚔️','🛡️','🏹','🪓','⛏️','🎣','🧪','💎','🪵','🪨','🔥','💧','⚡','🌟','✨','🏆','🥇','🎁','💰','🪙','🗝️','🧭','🗺️','⏳'] },
      { nombre: 'Farm', lista: ['🌱','🌿','🍀','🌳','🌲','🌾','🥕','🍅','🎃','🌽','🍎','🍇','🐄','🐔','🐷','🐶','🐱','🐝','🦋','☀️','🌧️','❄️','🌈','🌙'] },
      { nombre: 'Chat', lista: ['❤️','💔','💯','✅','❌','❓','❗','💬','👀','🎉','🤝','🚀','⭐','🔔','📦','🛒'] }
    ];

    // Rejilla (se construye una sola vez)
    if (!panel.dataset.gfListo) {
      panel.dataset.gfListo = '1';
      CATEGORIAS.forEach(cat => {
        const titulo = document.createElement('div');
        titulo.className = 'chat-emoji-cat';
        titulo.textContent = cat.nombre;
        panel.appendChild(titulo);

        const rejilla = document.createElement('div');
        rejilla.className = 'chat-emoji-grid';
        cat.lista.forEach(emoji => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = emoji;
          b.title = emoji;
          // pointerdown + preventDefault: así el campo de texto NO pierde el
          // foco y el cursor se queda donde estaba.
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._insertarEmojiEnChat(emoji);
          });
          rejilla.appendChild(b);
        });
        panel.appendChild(rejilla);
      });
    }

    const abrirCerrar = (forzar) => {
      const abierto = (typeof forzar === 'boolean') ? forzar : panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !abierto);
      boton.classList.toggle('open', abierto);
      if (abierto) {
        // En el móvil, abrir la rejilla con el teclado subido deja el chat sin
        // sitio: se baja el teclado y se deja la rejilla a la vista.
        try { this.chatInput.blur(); } catch (_) {}
        panel.scrollTop = 0;
      }
    };

    if (!boton.dataset.gfListo) {
      boton.dataset.gfListo = '1';
      boton.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); abrirCerrar(); });
      // Cerrar al tocar fuera del chat.
      document.addEventListener('pointerdown', (e) => {
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(e.target) || boton.contains(e.target)) return;
        abrirCerrar(false);
      });
    }

    this._cerrarSelectorEmojis = () => abrirCerrar(false);
  }

  /** Mete el emoji donde esté el cursor del campo de chat. */
  _insertarEmojiEnChat(emoji) {
    const input = this.chatInput;
    if (!input) return;

    const max = parseInt(input.getAttribute('maxlength'), 10) || 140;
    const ini = (typeof input.selectionStart === 'number') ? input.selectionStart : input.value.length;
    const fin = (typeof input.selectionEnd === 'number') ? input.selectionEnd : input.value.length;

    const nuevo = (input.value.slice(0, ini) + emoji + input.value.slice(fin));
    if (nuevo.length > max) {
      this.notifications && this.notifications.show('Message is too long', 'warning');
      return;
    }
    input.value = nuevo;

    // Dejar el cursor detrás del emoji (los emojis ocupan 2 unidades o más).
    const pos = ini + emoji.length;
    try { input.focus(); input.setSelectionRange(pos, pos); } catch (_) {}
  }

  /**
   * Deshace el escapado HTML que aplica el servidor.
   *
   * El backend pasa cada mensaje por escapeHtml() antes de repartirlo, así que
   * llega con `&amp;`, `&#039;`… Aquí el texto se pinta con textContent (que ya
   * es seguro por sí mismo), y sin deshacer ese escapado el jugador veía
   * literalmente "&#039;" en vez de un apóstrofo. Los emojis nunca se tocan:
   * escapeHtml solo cambia & < > " ', así que viajan intactos.
   *
   * Se hace con un reemplazo explícito y NO con innerHTML: interpretar HTML
   * aquí reabriría justo el agujero que el escapado del servidor cierra.
   */
  _desescaparChat(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/g, '&');   // el último, si no se re-expandirían los demás
  }

  appendMessage(m , playerInfo) {
    // Acepta undefined y lo maneja defensivamente
    const msg = m || {};
    // Si el servidor no escapó, aquí usamos textContent para evitar HTML inyectado.
    const name = this._desescaparChat(msg.playerName || '---');
    const text = this._desescaparChat(msg.text || '');
    const ts = msg.ts ? new Date(msg.ts) : new Date();

    // Crear elementos sin usar innerHTML
    const line = document.createElement('div');
    line.className = 'chat-line';

    const strong = document.createElement('strong');
    strong.textContent = name + ((this.socket && msg.id === this.socket.id) ? ' (you):' : ':');
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

// Cerrar HUD: oculta, restaura teclado y limpia listeners del input
closeHudEstadisticas_1() {
  if (!this.hudEl_1) return;
  // ocultar detalle
  if (this.detalleEl_1) this.detalleEl_1.classList.add('hidden_1');
  // ocultar HUD
  this.hudEl_1.classList.add('hidden_1');
  this.hudEl_1.setAttribute('aria-hidden', 'true');
  // restaurar teclado de Phaser
  if (this.input && this.input.keyboard) {
    try { this.input.keyboard.enabled = true; } catch(e) {}
  }
  // quitar foco y quitar listeners stop si quedaran
  if (this.searchInputEl_1) {
    try { this.searchInputEl_1.blur(); } catch(e) {}
    this.searchInputEl_1.removeEventListener('keydown', this._hud_handlers_1.inputStop_1, true);
    this.searchInputEl_1.removeEventListener('keyup', this._hud_handlers_1.inputStop_1, true);
    this.searchInputEl_1.removeEventListener('keypress', this._hud_handlers_1.inputStop_1, true);
  }
}

toggleHudEstadisticas_1() {
  if (!this.hudEl_1) return;
  if (this.hudEl_1.classList.contains('hidden_1')) this.openHudEstadisticas_1();
  else this.closeHudEstadisticas_1();
}

// Reemplaza los datos del HUD (útil si quieres cargarlos desde backend)
setHudData_1(arrayOfItems) {
  if (!Array.isArray(arrayOfItems)) return;
  this._hud_apartados_1 = arrayOfItems.map(it => ({
    id: it.id || (it.nombre || '').toLowerCase().replace(/\s+/g,'_'),
    nombre: it.nombre || 'Sin nombre',
    img: it.img || '',
    requisitos: Array.isArray(it.requisitos) ? it.requisitos : []
  }));
  this._hud_renderListHudEstadisticas_1(this.searchInputEl_1 ? this.searchInputEl_1.value : '');
}

// Llamar en shutdown/destroy para limpiar listeners
destroyHudEstadisticas_1() {
  if (!this.hudEl_1 || !this._hud_handlers_1) return;
  // quitar listeners
  if (this.searchInputEl_1) {
    this.searchInputEl_1.removeEventListener('focus', this._hud_handlers_1.onInputFocus_1, true);
    this.searchInputEl_1.removeEventListener('blur', this._hud_handlers_1.onInputBlur_1, true);
    this.searchInputEl_1.removeEventListener('input', this._hud_handlers_1.onSearchInput_1, true);
    this.searchInputEl_1.removeEventListener('keydown', this._hud_handlers_1.inputStop_1, true);
    this.searchInputEl_1.removeEventListener('keyup', this._hud_handlers_1.inputStop_1, true);
    this.searchInputEl_1.removeEventListener('keypress', this._hud_handlers_1.inputStop_1, true);
  }
  if (this.cerrarBtnEl_1) this.cerrarBtnEl_1.removeEventListener('click', this._hud_handlers_1.onCloseClick_1);
  if (this.volverBtnEl_1) this.volverBtnEl_1.removeEventListener('click', this._hud_handlers_1.onVolverClick_1);

  document.removeEventListener('keydown', this._hud_handlers_1.onKeyDown_1);

  // limpiar refs
  this._hud_handlers_1 = null;
  this.hudEl_1 = null;
  this.listaEl_1 = null;
  this.searchInputEl_1 = null;
  this.cerrarBtnEl_1 = null;
  this.detalleEl_1 = null;
  this.detalleImgEl_1 = null;
  this.detalleNombreEl_1 = null;
  this.detalleReqEl_1 = null;
  this.volverBtnEl_1 = null;
}


  resize(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;

    console.log(width, height);

    if (width <= 500) {

      const cam = this.cameras.main;

      const visibleWidth = cam.width / cam.zoom;
      const visibleHeight = cam.height / cam.zoom;

      this.cameras.resize(visibleWidth, visibleHeight);
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




cleanupScene() {
    console.log('🧹 LIMPIANDO ESCENA COMPLETAMENTE');

    
    // 2. DETENER Y LIMPIAR SISTEMAS DE SONIDO
    if (this.sound) {
        this.sound.stopAll();
        this.sound.removeAll();
    }
    
    // 3. LIMPIAR OBJETOS DEL JUEGO PRIMERO (antes de texturas)
    if (this.objetos && Array.isArray(this.objetos)) {
        this.objetos.forEach((obj, index) => {
            try {
                if (obj && obj.imagen && typeof obj.imagen.destroy === 'function') {
                    obj.imagen.destroy();
                }
            } catch (error) {
                console.error(`❌ Error destruyendo objeto ${index}:`, error);
            }
        });
        this.objetos = [];
    }
    
    // 4. LIMPIAR TEXTS Y ELEMENTOS GRÁFICOS
    this.cleanupTextsAndGraphics();
    
    // 5. LIMPIAR SOCKET.IO
    if (this.socket) {
        console.log('🔌 Desconectando socket...');
        // Tell the server we left 'game' room so it emits playerLeft to remaining players
        if (this.socket.connected) {
          this.socket.emit("joinRoom", {
            room: "tienda",
            username: this.Username || '---',
            lastScene: 'GameScene',
            x: 0, y: 0
          });
        }
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
        this.socketInitialized = false;
        this.currentRoom = null;
        console.log('✅ Socket desconectado y limpiado');
    }

    // 6. LIMPIAR TIMERS/INTERVALOS
    if (this.time) {
        this.time.removeAllEvents();
    }
    
    // 7. LIMPIAR LISTENERS DE INPUT
    if (this.input) {
        this.input.keyboard?.removeAllListeners();
        this.input.off('pointerdown');
        this.input.off('pointermove');
        this.input.off('pointerup');
        this.input.off('wheel');
    }
    
    // 8. LIMPIAR EVENTOS DE ESCENA (SOLO LOS NUESTROS)
    //
    // FIX (al volver de la batalla, GameScene reventaba en preload con
    // "Cannot read properties of null (reading 'sprite')" en
    // this.physics.add.sprite): aquí se hacía this.events.removeAllListeners(),
    // que NO borra solo nuestros listeners — borra también los que Phaser
    // registra en el emisor de la escena para sus propios sistemas y plugins
    // (Arcade Physics, InputPlugin, Clock, UpdateList…). Sin ellos, al volver
    // a arrancar la escena los plugins nunca se re-inicializan: this.physics
    // se queda a medias (physics.add === null) y el preload muere.
    //
    // Ahora se quitan uno a uno los manejadores que registramos nosotros
    // (setupSceneEvents y el culling automático), dejando intacto lo de Phaser.
    if (this.events) {
        (this._sceneEventHandlers || []).forEach(([evento, fn]) => {
            try { this.events.off(evento, fn); } catch (e) { /* ya no existía */ }
        });
        this._sceneEventHandlers = [];

        (this._cullingHandlers || []).forEach(fn => {
            try { this.events.off('update', fn); } catch (e) { /* ya no existía */ }
        });
        this._cullingHandlers = [];
    }
    
    // 9. LIMPIAR LISTENERS DEL DOM
    this.cleanupDomListeners();
    
    // 10. LIMPIAR SISTEMAS DE MISIONES Y NOTIFICACIONES
    this.cleanupSystems();
    
    // 11. LIMPIAR VARIABLES GLOBALES
    globalThis.playerName = null;
    globalThis.currentAccount = null;
    
    // 12. LIMPIAR MAPAS Y TEXTURAS (¡AHORA AL FINAL!)
    this.cleanupTexturesAndMaps();
    
    // 13. FORZAR GARBAGE COLLECTION
    this.forceGarbageCollection();
    
    console.log('✅ ESCENA COMPLETAMENTE LIMPIADA - LISTA PARA CAMBIAR');
    
    return true;
}

// Métodos auxiliares para organizar mejor:

cleanupTextsAndGraphics() {
    // Limpiar textos de cristales
    if (this.crystalTexts) {
        Object.values(this.crystalTexts).forEach(text => {
            try {
                if (text && typeof text.destroy === 'function') {
                    text.destroy();
                }
            } catch (error) {
                // Ignorar errores de objetos ya destruidos
            }
        });
        this.crystalTexts = {};
    }
    
    // Limpiar textos de pinos
    if (this.pinoTexts) {
        Object.values(this.pinoTexts).forEach(text => {
            try {
                if (text && typeof text.destroy === 'function') {
                    text.destroy();
                }
            } catch (error) {
                // Ignorar errores
            }
        });
        this.pinoTexts = {};
    }
    
    // Limpiar sombra
    if (this.shadow && typeof this.shadow.destroy === 'function') {
        this.shadow.destroy();
        this.shadow = null;
    }
}

cleanupTexturesAndMaps() {
    // 1. Primero destruir TileManagers
    if (this._tileManagers && Array.isArray(this._tileManagers)) {
        this._tileManagers.forEach((manager, index) => {
            try {
                if (manager && typeof manager.destroy === 'function') {
                    manager.destroy();
                }
            } catch (error) {
                console.warn(`⚠️ Error limpiando TileManager ${index}:`, error);
            }
        });
        this._tileManagers = [];
    }
    
    // 2. Limpiar cultivos
    if (this.cropData && this.cropData.clear) {
        try {
            this.cropData.clear();
        } catch (error) {
            console.warn('⚠️ Error limpiando cropData:', error);
        }
    }
    
    if (this.plotImages && this.plotImages.forEach) {
        this.plotImages.forEach(img => {
            try {
                if (img && typeof img.destroy === 'function') {
                    img.destroy();
                }
            } catch (error) {
                // Ignorar errores
            }
        });
        this.plotImages.clear();
    }
    
    // 3. SOLO AL FINAL: Limpiar texturas si es realmente necesario
    // Comentar esto si el error persiste
    /*
    const heavyTextures = [
        'tile_r0_c0', 'tile_r0_c1', 'tile_r0_c2',
        'tile_r1_c0', 'tile_r1_c1', 'tile_r1_c2',
        'tile_r2_c0', 'tile_r2_c1', 'tile_r2_c2',
        'tiles', 'tiles2'
    ];
    
    heavyTextures.forEach(textureKey => {
        try {
            if (this.textures && this.textures.exists(textureKey)) {
                // En lugar de remove, usa destroy con cuidado
                const texture = this.textures.get(textureKey);
                if (texture && !texture.destroyed) {
                    texture.destroy();
                }
            }
        } catch (error) {
            console.warn(`⚠️ Error con textura ${textureKey}:`, error);
        }
    });
    */
}

cleanupDomListeners() {
    // Los campos del DASHBOARD ya NO se clonan.
    //
    // Antes esta lista incluía 'character-name', 'apply-name' y
    // 'language-select'. Clonar un input copia también sus ATRIBUTOS, y
    // `input.disabled = true` se refleja como atributo: si el nombre ya estaba
    // fijado cuando se clonó, la copia nacía deshabilitada. Encima
    // this.settingsNameInput seguía apuntando al nodo VIEJO, ya suelto del
    // documento, así que _refreshNameLockUI escribía sobre un elemento que ya
    // no se veía y nunca podía volver a habilitar el visible. De ahí el "a
    // veces no me deja escribir ni aplicar" tras haber pasado por la tienda.
    //
    // Ahora esos campos se enganchan una sola vez (ver setupSettingsPanel), así
    // que no hace falta destruir el nodo para evitar listeners repetidos.
    const domElements = [
        'close-panel', 'logout-btn', 'btn-close', 'inner-btn',
        'cerrarReputacion', 'cerrarEstadisticas'
    ];

    domElements.forEach(id => {
        const element = document.getElementById(id);
        if (element && element.parentNode) {
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
        }
    });

    // Los BOTONES REDONDOS ya NO se clonan.
    //
    // Antes esto hacía cloneNode + replaceChild sobre cada .round-btn para
    // "limpiar" sus listeners. Efectos que tenía:
    //   • el nodo del DOM quedaba reemplazado por una copia SIN listeners, y de
    //     paso se llevaba por delante los de #nft-btn, #skills-btn, #store-btn
    //     y #mail-btn (la campana), que se enganchan por id;
    //   • this.roundButtons seguía apuntando a los nodos VIEJOS, ya sueltos del
    //     documento, así que los removeEventListener del cleanup no quitaban
    //     nada y los re-enganches posteriores iban al elemento equivocado.
    // Resultado: la campana abría o no según por dónde hubieras pasado antes.
    //
    // Ahora los listeners se enganchan con _bindDomClick, que guarda el handler
    // en el propio elemento y quita el anterior antes de poner el nuevo. Nunca
    // se duplican, así que no hace falta destruir el nodo para limpiarlos.
    this._unbindAllDomClicks();
}

// ── Enganche de clicks del DOM, idempotente ─────────────────────────────────
// El HUD (botones redondos, campana, tienda…) es DOM de game.html y sobrevive
// al cambio de escena, así que un addEventListener suelto se acumula cada vez
// que se vuelve a entrar. Esto guarda el handler EN el elemento y quita el
// anterior antes de poner el nuevo: siempre queda exactamente uno.
_bindDomClick(el, key, handler) {
    if (!el) return;
    this._domClickBindings = this._domClickBindings || [];
    const prop = `_gfClick_${key}`;
    if (el[prop]) el.removeEventListener('click', el[prop]);
    el[prop] = handler;
    el.addEventListener('click', handler);
    this._domClickBindings.push({ el, prop });
}

_unbindAllDomClicks() {
    (this._domClickBindings || []).forEach(({ el, prop }) => {
        try {
            if (el && el[prop]) {
                el.removeEventListener('click', el[prop]);
                delete el[prop];
            }
        } catch (_) {}
    });
    this._domClickBindings = [];
}

cleanupSystems() {
    // Limpiar sistema de misiones
    if (window.missionHub) {
        const hub = document.getElementById('mission-hub');
        if (hub) hub.style.display = 'none';
        window.missionHub = null;
    }
    
    // Limpiar notificaciones
    if (this.notifications) {
        try {
            if (typeof this.notifications.destroy === 'function') {
                this.notifications.destroy();
            }
        } catch (error) {
            // Ignorar errores
        }
        this.notifications = null;
    }
    
    // Limpiar hub panel
    if (window.hubPanel) {
        try {
            if (typeof window.hubPanel.hide === 'function') {
                window.hubPanel.hide();
            }
        } catch (error) {
            // Ignorar errores
        }
        window.hubPanel = null;
    }
    
    // Limpiar diálogos
    if (this.typeTimer) {
        clearInterval(this.typeTimer);
        this.typeTimer = null;
    }
    
    if (this.dialogHub && this.dialogHub.style) {
        this.dialogHub.style.display = 'none';
    }
    if (this.dialogOverlay && this.dialogOverlay.style) {
        this.dialogOverlay.style.display = 'none';
    }
}

forceGarbageCollection() {
    // Limpiar estados
    this.crystalMineState = {};
    this.pinoMineState = {};
    this.pinoMineState_v2 = {};
    this.pinoMineState_v3 = {};
    
    // Forzar recolección de basura (solo en navegadores que lo permiten)
    if (window.gc) {
        try {
            window.gc();
        } catch (e) {
            // Ignorar si no está disponible
        }
    }
    
    // Limpiar cachés
    if (this.cache && typeof this.cache.removeAll === 'function') {
        try {
            this.cache.removeAll();
        } catch (e) {
            // Ignorar errores
        }
    }
}




// En la clase tiendajuego:
shutdown() {
  console.log("🔄 Cerrando conexión de socket para tienda");
  
  // Salir de la sala de la tienda
  if (this.socket && this.socket.connected) {
    this.socket.emit("joinRoom", {
      room: "tienda", // Cambiar a la sala del juego principal
      username: this.Username || '---',
      x: 0,
      y: 0
    });
  }
  
  // Limpiar jugadores locales
  Object.values(this.otherPlayers).forEach(p => {
    if (p.sprite) p.sprite.destroy();
    if (p.nameText) p.nameText.destroy();
    if (p.dog?.nameText) p.dog.nameText.destroy();
  });
  this.otherPlayers = {};
  
  // No desconectar el socket global, solo salir de la sala


    // FIX (el juego se quedaba congelado al cambiar de escena):
    // cleanupWaterSystem() NO existe en ninguna parte del proyecto — era una
    // llamada huérfana. Lanzaba "ReferenceError: cleanupWaterSystem is not
    // defined" justo aquí, en mitad del shutdown, así que TODO lo que venía
    // después (cleanupScene, parar cámara y física) no llegaba a ejecutarse y
    // la transición de escena moría a medias: pantalla congelada y sin hub.
    // Se llama solo si algún día llega a existir.
    if (typeof cleanupWaterSystem === 'function') cleanupWaterSystem();

    console.log('🔄 APAGANDO GAMESCENE');
    this.cleanupScene();
    
    // Asegurar que la cámara se detenga
    if (this.cameras && this.cameras.main) {
        this.cameras.main.stopFollow();
        this.cameras.main.fadeOut(0);
    }

    // Detener física.
    // FIX: cleanupScene() (justo arriba) ya desmonta sistemas de la escena, así
    // que al llegar aquí this.physics / this.physics.world pueden ser null y
    // esto lanzaba "Cannot read properties of null (reading 'pause')" — otra
    // vez en mitad del shutdown, dejando la transición de escena a medias y el
    // juego congelado. Se comprueba antes de tocarlo.
    if (this.physics && this.physics.world && typeof this.physics.world.pause === 'function') {
        this.physics.world.pause();
    }

    console.log('✅ GameScene apagada correctamente');




}

destroy() {
  this.shutdown();
  super.destroy();
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
        panel.style.boxShadow = "0 0 15px rgba(255, 255, 255, 0.6)";
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
  //element.style.cursor = 'default';     // Mantener siempre flecha normal

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
// FIX (items perdidos al cortar 2 árboles casi al mismo tiempo):
// Antes, si ya había una transacción en curso, la petición se
// DESCARTABA por completo (return sin hacer nada) => el segundo árbol
// no generaba transacción ni item. Ahora se ENCOLA: cada llamada espera
// a que termine la anterior y luego se ejecuta, en orden. Así ningún
// corte se pierde, solo se procesan uno tras otro.
async ejecutarDivision(ruta_tabla, producto, limitacion, cantidad) {
  // Validaciones rápidas
  if (limitacion <= 0 || cantidad <= 0) return;

  // TxGate (2026-08-04): se anota como trabajo pendiente en un contador que
  // vive en `window`, fuera de la escena. Así, si el jugador se va a la tienda
  // con esta transacción todavía en vuelo, la pantalla de carga la espera en
  // vez de destruir la escena y dejarla a medias. Ver tx-gate.js.
  const finTx = (window.GFTxGate && window.GFTxGate.begin)
    ? window.GFTxGate.begin(`Adding ${cantidad}x ${producto}`)
    : null;

  this._addItemQueue = (this._addItemQueue || Promise.resolve())
    .then(() => this.Additemblockchains(ruta_tabla, producto, cantidad))
    .catch(err => console.error('❌ Error procesando ejecutarDivision en cola:', err))
    .finally(() => { if (finTx) finTx(); });

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
  // FIX: flag EXCLUSIVO para "agregar item por blockchain", separado de
  // this._transactionInProgress (que usa handleSlotClick para el drag&drop
  // del inventario). Antes compartían el mismo nombre, así que mientras se
  // confirmaba la transacción de cortar un árbol, TODAS las casillas del
  // inventario dejaban de responder a clicks (incluida la que tenía el
  // hacha en el cursor, que no se podía ni soltar ni devolver).
  if (this._addItemBlockchainBusy) {
    console.warn('Transacción de agregar item ya en progreso. Ignorando nueva petición.');
    return;
  }
  this._addItemBlockchainBusy = true;

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

  // Reintentos: enviar acción y esperar confirmación.
  // FIX "reintentar pero la transacción SÍ fue exitosa": la versión anterior,
  // cuando la ESPERA de confirmación fallaba (típicamente un timeout del
  // poller a los 60 s), REENVIABA la transacción completa — duplicando la
  // operación on-chain — y si el último intento también expiraba devolvía
  // success:false, así que el registro la marcaba 'reverted' aunque la tx
  // original se confirmara segundos después. Ahora: si el envío ya fue
  // aceptado, NUNCA se reenvía; solo se re-espera la MISMA transactionId con
  // un timeout más generoso (120 s por intento).
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
    this._addItemBlockchainBusy = false;
  }
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
  // Helper: añade barra de durabilidad si el item es una herramienta con usos definidos
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
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken(this.csrfToken) },
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
      // Buscar el slot origen actual que tenga el idx = origin.idx (podría haberse movido)
      // Buscar el slot destino actual que tenga el idx = destItem.idx
      
      // Función auxiliar para encontrar un slot por idx
      const findSlotByIdx = (idx) => {
        // Buscar en inventario
        for (let i = 0; i < this.STATE.slots.length; i++) {
          const slot = this.STATE.slots[i];
          if (slot && slot.idx === idx) return { type: 'inv', index: i, slot };
        }
        // Buscar en quick slots
        for (let i = 0; i < this.STATE.quickSlots.length; i++) {
          const slot = this.STATE.quickSlots[i];
          if (slot && slot.idx === idx) return { type: 'quick', index: i, slot };
        }
        return null;
      };

      const originSlotInfo = findSlotByIdx(origin.idx);
      const destSlotInfo = findSlotByIdx(destItem.idx);

      if (!originSlotInfo) {
        console.warn('⚠️ No se encontró el slot origen con idx', origin.idx, 'en el inventario. Puede que ya haya sido eliminado.');
        // Podría haberse eliminado, entonces no hacemos nada con origen.
      }
      if (!destSlotInfo) {
        console.error('❌ No se encontró el slot destino con idx', destItem.idx, 'en el inventario. ¡Inconsistencia!');
        // No podemos actualizar destino, pero la transacción ya se hizo. Mostrar error.
        this.showNotification('Error: the target slot vanished, please reload the page', 'error');
        return true; // La transacción fue exitosa, pero la UI está desincronizada.
      }

      // Actualizar origen
      if (originSlotInfo) {
        const newOriginCount = origin.count - transferAmount;
        if (newOriginCount <= 0) {
          // Eliminar slot
          if (originSlotInfo.type === 'inv') {
            this.STATE.slots[originSlotInfo.index] = null;
          } else {
            this.STATE.quickSlots[originSlotInfo.index] = null;
          }
          console.log(`🗑️ Slot origen ${originSlotInfo.type}[${originSlotInfo.index}] eliminado`);
        } else {
          // Reducir cantidad
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
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken(this.csrfToken) },
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

  // SOLO mover, NO agregar el evento de click.
  // OJO: .bind() devuelve una función NUEVA cada vez, así que el
  // removeEventListener de stopDrag nunca encontraba la que se había puesto y
  // cada arrastre dejaba un listener de mousemove more en el documento para
  // siempre. Se guarda UNA sola referencia y se reutiliza.
  if (!this._onMouseMoveBound) this._onMouseMoveBound = this.onMouseMove.bind(this);
  document.removeEventListener('mousemove', this._onMouseMoveBound);
  document.addEventListener('mousemove', this._onMouseMoveBound);
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
  
  // Solo remover el evento de mousemove (la MISMA referencia que se registró)
  if (this._onMouseMoveBound) {
    document.removeEventListener('mousemove', this._onMouseMoveBound);
  }

  document.querySelectorAll('.inv-slot, .quick-slot').forEach(d => {
    d.classList.remove('highlight');
  });
}

// ── Soltar lo que el jugador lleve "en la mano" ──────────────────────────────
// Se llama ANTES de cambiar de escena. El div #drag-item vive en game.html y
// sobrevive al cambio, así que si te ibas a la tienda con un ítem agarrado, el
// ítem seguía pegado al cursor en la escena nueva —que ya no sabe nada de él— y
// su casilla de origen quedaba vacía. Esto devuelve el ítem a su sitio y limpia
// el rastro visual.
_cancelarArrastre() {
  try {
    // clearSelectedItem devuelve el fantasma a su casilla y llama a stopDrag.
    if (typeof this.clearSelectedItem === 'function') this.clearSelectedItem();
  } catch (e) { console.warn('cancelarArrastre:', e.message || e); }

  // Aunque no hubiera selectedItem (o clearSelectedItem fallara), el div del
  // arrastre tiene que quedar oculto sí o sí: es DOM compartido entre escenas.
  try {
    if (typeof this.stopDrag === 'function') this.stopDrag();
    const dragDiv = document.getElementById('drag-item');
    if (dragDiv) {
      dragDiv.style.display = 'none';
      dragDiv.style.left = '-100px';
      dragDiv.style.top  = '-100px';
    }
    const dragCount = document.getElementById('drag-count');
    if (dragCount) { dragCount.textContent = ''; dragCount.style.display = 'none'; }
    if (this.STATE) this.STATE.selectedItem = null;
  } catch (_) {}
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
 * Simula la adición de 'quantity' unidades del ítem 'itemId' al inventario,
 * completando stacks parciales y creando nuevos stacks hasta agotar la cantidad.
 *
 * @param {string} itemId      - Clave del ítem en ItemDefinitions.
 * @param {number} quantity    - Cantidad a agregar (por defecto 1).
 * @returns {Object}           - Reporte con operaciones y resumen.
 */
simulateAddItem(itemId, quantity = 1) {
  const def = this.ItemDefinitions?.[itemId];
  if (!def) {
    console.error(`Item "${itemId}" no definido en ItemDefinitions`);
    return {
      success: false,
      remaining: quantity,
      operations: [],
      summary: { totalMerged: 0, totalNewStacks: 0, newStacksCount: 0, slotsUsed: { quick: 0, inv: 0 } }
    };
  }

  const maxStack = def.maxStack;
  let remaining = quantity;

  // Clonar los slots para simular sin tocar los reales
  const simQuick = this.STATE.quickSlots.map(s => s ? { ...s } : null);
  const simInv = this.STATE.slots.map(s => s ? { ...s } : null);

  // Evitar tocar el ítem seleccionado (fantasma)
  const occupied = new Set();
  if (this.STATE.selectedItem) {
    const sel = this.STATE.selectedItem;
    if (sel.originType === 'inv') occupied.add(`inv-${sel.originIndex}`);
    else if (sel.originType === 'quick') occupied.add(`quick-${sel.originIndex}`);
  }
  const isOccupied = (type, idx) => occupied.has(`${type}-${idx}`);

  const operations = [];

  // --------------------------------------------------------
  // Función interna: completar stacks parciales existentes
  // --------------------------------------------------------
  const completePartialStacks = (slots, type) => {
    let mergedAny = false;
    for (let i = 0; i < slots.length; i++) {
      if (remaining <= 0) break;
      if (isOccupied(type, i)) continue;

      const slot = slots[i];
      if (slot && slot.id === itemId && slot.count < maxStack) {
        const espacio = maxStack - slot.count;
        const add = Math.min(espacio, remaining);
        const prev = slot.count;
        slot.count += add;
        remaining -= add;
        mergedAny = true;

        const slotReal = type === 'quick' ? this.STATE.quickSlots[i] : this.STATE.slots[i];
        console.error(`[SIMULATE] Merge en ${type} slot ${i}: prev=${prev}, add=${add}, final=${slot.count}, remaining=${remaining}`);

        operations.push({
          type: 'merge',
          location: { type, index: i },
          amountAdded: add,
          previousCount: prev,
          finalCount: slot.count,
          usedStackLimit: slot.count === maxStack,
          idx: slotReal ? slotReal.idx : null,
          manualid: slotReal ? slotReal.idm : null
        });
      }
    }
    return mergedAny;
  };

  // --------------------------------------------------------
  // Función interna: crear nuevos stacks en slots vacíos
  // --------------------------------------------------------
  const createNewStacks = (slots, type) => {
    let createdAny = false;
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (isOccupied(type, i)) continue;
      if (!slots[i]) {
        const add = Math.min(maxStack, remaining);
        slots[i] = { id: itemId, count: add, idx: i, idm: itemId };
        remaining -= add;
        createdAny = true;

        console.error(`[SIMULATE] Nuevo stack en ${type} slot ${i}: add=${add}, remaining=${remaining}`);

        operations.push({
          type: 'new',
          location: { type, index: i },
          amountAdded: add,
          finalCount: add
        });
      }
    }
    return createdAny;
  };

  // --------------------------------------------------------
  // Bucle principal: iterar hasta que no quede remaining
  // --------------------------------------------------------
  let iteration = 0;
  while (remaining > 0) {
    iteration++;
    console.error(`[SIMULATE] Iteración ${iteration}, remaining=${remaining}`);

    // 1️⃣ Completar stacks parciales
    const mergedQuick = completePartialStacks(simQuick, 'quick');
    const mergedInv = completePartialStacks(simInv, 'inv');

    // 2️⃣ Crear stacks nuevos si queda remaining
    const newQuick = createNewStacks(simQuick, 'quick');
    const newInv = createNewStacks(simInv, 'inv');

    // 3️⃣ Si no hubo merge ni nuevos stacks → no hay más espacio
    if (!mergedQuick && !mergedInv && !newQuick && !newInv) {
      console.error(`[SIMULATE] No hay más espacio para agregar los ${remaining} restantes`);
      break;
    }
  }

  const success = remaining === 0;

  // --------------------------------------------------------
  // Resumen
  // --------------------------------------------------------
  let totalMerged = 0, totalNew = 0;
  const newStacksCount = operations.filter(op => op.type === 'new').length;
  operations.forEach(op => {
    if (op.type === 'merge') totalMerged += op.amountAdded;
    else totalNew += op.amountAdded;
  });

  const slotsUsed = { quick: 0, inv: 0 };
  operations.filter(op => op.type === 'new').forEach(op => {
    slotsUsed[op.location.type]++;
  });

  console.error(`[SIMULATE] Resultado final: success=${success}, remaining=${remaining}, totalMerged=${totalMerged}, totalNewStacks=${totalNew}, newStacksCount=${newStacksCount}`);

  return {
    success,
    remaining,
    operations,
    summary: { totalMerged, totalNewStacks: totalNew, newStacksCount, slotsUsed }
  };
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
    if (!toolDef || toolDef.usos == null) return; // sin usos definidos → no es herramienta

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
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken(this.csrfToken) },
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
      this.notifications.show(`Your ${itemRef.id} broke!`, 'error');

      // ── Quitar 1 del stack en blockchain + local ──
      await this.ejecutarDivisionRemove.call(this, 'slots', itemRef.id, toolDef.maxStack || 5, 1);

      // ── Borrar el registro de usos para que las unidades restantes del stack empiecen frescos ──
      try {
        await this.fetchWithTokenRetry(`${this.serverBase}/api/tool/uses/${itemRef.idx}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': window.getCsrfToken(this.csrfToken) }
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
// FIX: mismo criterio que ejecutarDivision — se ENCOLA en vez de
// descartarse, y usa su propio flag (_removeItemBlockchainBusy)
// totalmente independiente de _transactionInProgress y de
// _addItemBlockchainBusy, para no bloquear el resto del inventario.
async ejecutarDivisionRemove(ruta_tabla, producto, limitacion, cantidad) {
    if (limitacion <= 0 || cantidad <= 0) return;

    // TxGate: igual que ejecutarDivision — el trabajo se anota fuera de la
    // escena para que un cambio de escena no lo deje huérfano (ver tx-gate.js).
    const finTx = (window.GFTxGate && window.GFTxGate.begin)
        ? window.GFTxGate.begin(`Removing ${cantidad}x ${producto}`)
        : null;

    this._removeItemQueue = (this._removeItemQueue || Promise.resolve())
        .then(() => this._ejecutarDivisionRemoveInterno(ruta_tabla, producto, limitacion, cantidad))
        .catch(err => console.error('❌ Error procesando ejecutarDivisionRemove en cola:', err))
        .finally(() => { if (finTx) finTx(); });

    return this._removeItemQueue;
}

async _ejecutarDivisionRemoveInterno(ruta_tabla, producto, limitacion, cantidad) {
    if (this._removeItemBlockchainBusy) {
        console.warn('Transacción de eliminar item ya en progreso. Ignorando nueva petición.');
        return;
    }
    this._removeItemBlockchainBusy = true;

    try {
        // ── Si hay un item en el cursor, devolverlo a su casilla de origen antes de proceder ──
        if (this.STATE?.selectedItem?.isGhost) {
            const cursorItem = this.STATE.selectedItem;
            const slotArr  = cursorItem.originType === 'inv' ? this.STATE.slots      : this.STATE.quickSlots;
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
   * Dibuja un foco suave (degradado radial) en el canvas-textura.
   * @param {number} x         posición X en pantalla
   * @param {number} y         posición Y en pantalla
   * @param {number} radius    radio del foco
   * @param {number} intensity centro α (0–1)
   */
  addSoftLight(x, y, radius, intensity = 1.0) {
    // 1) Recupera el canvas-textura y su contexto
    const canvasTex = this.textures.get('lights-canvas');
    const ctx       = canvasTex.context;

    // 2) Creamos el degradado radial
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(255,255,200,${intensity})`); // centro amarillo cálido
    grad.addColorStop(0.7, `rgba(255,255,200,0.2)`);         // penumbra suave
    grad.addColorStop(1, 'rgba(255,255,200,0)');             // borde transparente

    // 3) Dibujamos el círculo con degradado
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 4) Refrescamos la textura para que Phaser actualice la imagen
    canvasTex.refresh();
  }
// Dentro de tu clase GameScene...


  // Basic JWT format check
  tokenValido(token) {
    return typeof token === 'string' && token.split('.').length === 3;
  }

async initialize() {
  await this.loadPlayerData();
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
            idx: s.IDX ?? s.id,           // ← usa s.IDX (mayúscula)
            idm: s.Manualid ?? s.objeto,  // ← usa s.Manualid (mayúscula)
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
            idx: s.IDX ?? s.id,
            idm: s.Manualid ?? s.objeto,
            count: s.cantidad || 1 
          };
          
        }
      });
    }
    
    // Asignar propiedades del jugador - SIN SOBREESCRIBIR variables críticas
    // Asignar propiedades del jugador
    // vida/agua/comida/oro/plata son manejados por window.playerStats (contrato).
    // NO se cargan desde DB para evitar sobreescribir valores del contrato.
    const playerProps = [
      'posicionplayerx', 'posicionplayery',
      'speed', 'mundo', 'nivel', 'nivel_exp',
      'misiones', 'Username', 'lenguaje', 'petName', 'tutorial', 'petLevel'
    ];
    playerProps.forEach(prop => {
      if (data[prop] !== undefined && data[prop] !== null) this[prop] = data[prop];
    });
    if (!this.petLevel || this.petLevel < 1) {
      this.petLevel = Math.max(1, Number(window.globalPetLevel) || 1);
    }
    // El nivel del perro viaja a la tienda por aquí (ver tiendajuego.js).
    window.globalPetLevel = this.petLevel;

    // Nombre de mascota: '---' = aún sin fijar (regla de nombre único)
    if (!this.petName) this.petName = '---';
    window.globalPetName = this.petName;
    if (typeof this._updateDogNameLabel === 'function') this._updateDogNameLabel();

    // Stats del contrato tienen prioridad sobre DB
    if (window.playerStats) {
      if (typeof window.playerStats.vida   === 'number') this.vidaPorcentaje   = window.playerStats.vida;
      if (typeof window.playerStats.agua   === 'number') this.aguaPorcentaje   = window.playerStats.agua;
      if (typeof window.playerStats.comida === 'number') this.comidaPorcentaje = window.playerStats.comida;
      if (typeof window.playerStats.oro    === 'number') this.moneda           = window.playerStats.oro;
      if (typeof window.playerStats.plata  === 'number') this.moneda_plata     = window.playerStats.plata;
    } else {
      // Sin window.playerStats: usar BD como fallback
      // oro/plata solo si son > 0 y hay razón real (no corromper con datos viejos)
      if (data.moneda        != null) this.moneda           = data.moneda;
      if (data.moneda_plata  != null) this.moneda_plata     = data.moneda_plata;
      if (data.vidaPorcentaje   > 0)  this.vidaPorcentaje   = data.vidaPorcentaje;
      if (data.aguaPorcentaje   > 0)  this.aguaPorcentaje   = data.aguaPorcentaje;
      if (data.comidaPorcentaje > 0)  this.comidaPorcentaje = data.comidaPorcentaje;
    }
    // Si window.playerStats ya existe pero llegamos aquí sin sus valores aplicados,
    // aplicar de nuevo para garantizar coherencia
    if (window.playerStats && typeof window.playerStats.oro === 'number') {
      this.moneda       = window.playerStats.oro;
      this.moneda_plata = window.playerStats.plata || 0;
    }
    // Posicionar al jugador si existe
    if (this.player) {
      this.player.setVisible(true);
      this.player.setPosition(this.posicionplayerx, this.posicionplayery);

      // FIX: el perro se crea en create() usando la posición POR DEFECTO del
      // jugador (this.posicionplayerx/y iniciales, ej. 2097,2359), pero
      // loadPlayerData() es async y llega DESPUÉS, moviendo al jugador a su
      // posición real guardada. Como nunca se reposicionaba al perro, éste
      // se quedaba "atrás" en la ubicación vieja y tardaba en alcanzar al
      // jugador (o de plano no se veía cerca de él al entrar). Ahora se
      // sincroniza el estado interno del perro (x/y/target/prev) y sus
      // objetos visuales con la posición real del jugador.
      if (this.dog) {
        const dogStartX = this.player.x + 40;
        const dogStartY = this.player.y + 20;
        this.dog.x = dogStartX;
        this.dog.y = dogStartY;
        this.dog.targetX = dogStartX;
        this.dog.targetY = dogStartY;
        this.dog.prevX = dogStartX;
        this.dog.prevY = dogStartY;
        this.dog.prevTargetX = dogStartX;
        this.dog.prevTargetY = dogStartY;
        this.dog.smoothOffsetX = 0;
        this.dog.smoothOffsetY = 20;
        if (this.dog.sprite) this.dog.sprite.setPosition(dogStartX, dogStartY);
        if (this.dog.shadowContainer) this.dog.shadowContainer.setPosition(dogStartX, dogStartY + 22);
      }
      // Evita que el próximo frame interprete este "salto" de posición como
      // un movimiento real del jugador (lo que podría marear la mirada del perro).
      this.prevPlayerX = this.player.x;
      this.prevPlayerY = this.player.y;
      this.previousPosition = { x: this.player.x, y: this.player.y };
    }
    
    // Re-aplicar window.playerStats — siempre tiene prioridad sobre BD
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

    // Tutorial (jugadores nuevos). Se lanza aquí porque `this.tutorial` acaba
    // de llegar del backend; startWorldTutorial() decide la fase según el paso.
    this.startWorldTutorial();

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

// ============================================================================
// TUTORIAL (jugadores nuevos) — MÁQUINA DE ESTADOS multi-escena.
// El campo persistido GamePlayer.tutorial es el número de PASO:
//   0 = bienvenida + ir a la tienda (mundo)  → compra en la tienda (tiendajuego)
//   1 = ya compró+confirmó → salir de la tienda → guiar a las parcelas + sembrar
//   2 = ya cortó 4 cultivos → guiar a Lord Digby (fin del tutorial por ahora)
//   3 = tutorial terminado.   undefined/otro = jugador viejo → no se fuerza.
// TODOS los textos del tutorial van SIEMPRE en inglés (pedido del usuario).
// El pathfinding (A* sobre rectángulos de colisión) y los helpers de dibujo
// están duplicados en tiendajuego.js a propósito (cada escena es autónoma).
// ============================================================================
startWorldTutorial() {
  const step = this.tutorial;
  // Pasos del tutorial: 0..7 (los de siempre) y luego 20 y 21 (comer/beber y
  // el granjero Joe). Se saltan del 7 al 20 A PROPÓSITO: el 8 ya significaba
  // "terminado" para todos los jugadores que existen, y reutilizarlo los habría
  // devuelto al tutorial. Con estos números, quien ya lo acabó sigue fuera.
  const EN_TUTORIAL = (step >= 0 && step <= 7) || step === 20 || step === 21;
  if (!EN_TUTORIAL) return;
  if (this._worldTutorialStartedFor === step) return;    // esa fase ya arrancó

  // Esperar a que existan el jugador, las colisiones y la entrada de la tienda.
  if (!this.player ||
      !Array.isArray(this.collisionRectangles) ||
      !Array.isArray(this.collisionRectangles1) ||
      this.collisionRectangles1.length === 0) {
    this.time.delayedCall(600, () => this.startWorldTutorial());
    return;
  }

  this._worldTutorialStartedFor = step;
  // En el mundo, esquivar solo las colisiones generales (no las entradas).
  this._tutorialObstacles = this.collisionRectangles;

  const storeEntrance = () => {
    const r = this.collisionRectangles1[0];
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };

  if (step === 0) {
    this._showTutorialBanner('Welcome to Grassland Forest! We are delighted that you join this adventure. We will give you a tutorial so you learn how to take part. We will start by taking you to the shop…');
    const e = storeEntrance();
    this._setTutorialTarget(e.x, e.y);
    this._ensureTutorialPathTimer();
  } else if (step === 1) {
    this._startWorldPlantPhase();
  } else if (step === 2) {
    this._startWorldDigbyPhase();
  } else if (step === 3) {
    // Volver a la tienda a comprar un hacha de madera.
    this._showTutorialBanner('Now go and buy a wood axe.');
    const e = storeEntrance();
    this._setTutorialTarget(e.x, e.y);
    this._ensureTutorialPathTimer();
  } else if (step === 4) {
    this._startWorldPinePhase();
  } else if (step === 5) {
    // Entregar la madera a Lord Digby (sprite real, no el texto del nombre).
    this._showTutorialBanner('Now go and give the wood to Lord Digby.');
    this._aimAtSprite('sprite_npc5', 2290, 2283);
    this._ensureTutorialPathTimer();
  } else if (step === 6) {
    // Ir al Crafteador Jack (sprite_npc2) a craftear un empty bucket.
    this._showTutorialBanner('Now we must craft an empty bucket. To do that, click the crafter Jack.');
    this._aimAtSprite('sprite_npc2', 3296, 1950);
    this._ensureTutorialPathTimer();
  } else if (step === 7) {
    // Ir a la fuente y usar el empty bucket para obtener agua.
    this._showTutorialBanner('Take your empty bucket and use it against the water fountain to get water.');
    this._aimAtWell();
    this._ensureTutorialPathTimer();
  } else if (step === 20) {
    // Enseñar a comer y beber (el agua ya la tiene del paso anterior).
    this._startConsumePhase();
  } else if (step === 21) {
    // Último paso: el granjero Joe y el panel de misiones.
    this._startFarmerJoePhase();
  }
}

// ── Paso 20: comer y beber ────────────────────────────────────────────────────────────────────────────────────────────────────
// El jugador acaba de llenar el balde en la fuente, así que ya tiene con qué
// probar. Se explica y se pregunta si lo entendió: con ✗ se da la instrucción
// concreta y se queda esperando a que lo haga de verdad.
_startConsumePhase() {
  // Este paso no lleva a ningún sitio: se hace sobre el propio personaje, así
  // que se borra el camino que venía marcado hacia la fuente y se para el
  // temporizador que lo redibuja (si no, lo volvería a pintar al frame
  // siguiente hacia el último objetivo).
  if (this._tutorialPathTimer) { this._tutorialPathTimer.remove(false); this._tutorialPathTimer = null; }
  this._clearTutorialPath && this._clearTutorialPath();
  this._showTutorialConfirm(
    'Now we will teach you how to eat and drink. Take the water bucket and give it to your character — that will raise your water. If you do the same with a harvest, it will raise your food. Press ✓ if you did it, or ✗ if you did not understand how.',
    () => {
      // Dice que ya sabe: se pasa al granjero Joe.
      this._advanceTutorial(21);
    },
    () => {
      // No lo entendió: instrucción concreta y se espera a que consuma algo.
      this._showTutorialBanner('Pick up a water bucket or a food harvest with the cursor and click on your character.');
    }
  );
}

// Lo llama _doConsume cuando el jugador REALMENTE come o bebe algo.
// Sirve tanto si dijo que sí como si dijo que no: en cuanto lo hace, se avanza.
_onTutorialConsumed() {
  if (this.tutorial !== 20) return;
  this._hideTutorialBanner();
  this._advanceTutorial(21);
}

// ── Paso 21: el granjero Joe y las misiones ─────────────────────────────────────────────────────────────────
_startFarmerJoePhase() {
  this._showTutorialBanner('Well done! Last step: go to Farmer Joe. If you click on him you will see the missions panel.');
  // Mismo NPC que abre el panel de misiones del granjero.
  this._aimAtSprite('sprite_npc1', 2620, 2120);
  this._ensureTutorialPathTimer();
}

// Al abrir el panel de misiones del granjero durante el paso 21: fin.
_onTutorialMissionsOpened(npcId) {
  if (this.tutorial !== 21) return;
  if (npcId && npcId !== 'granjero') return;
  this._finishTutorial();
}

// Fija un nuevo objetivo del camino y fuerza el redibujo inmediato.
// `depth` (opcional) = depth del objeto objetivo; el marcador se dibuja en
// depth+1 para quedar JUSTO ENCIMA de ese objeto (p. ej. el árbol) sin usar
// valores enormes.
_setTutorialTarget(x, y, depth) {
  this._tutorialTargetX = x;
  this._tutorialTargetY = y;
  this._tutorialTargetDepth = (typeof depth === 'number') ? depth : null;
  this._tutorialPath = null;        // fuerza recomputo del A* en el próximo dibujo
  this._pathForTargetX = null;
  this._drawTutorialPathToTarget();
}

// Objetivo a partir de un sprite: base (centro-inferior) + su depth, para que el
// camino apunte al cuerpo del objeto y el marcador quede encima de él.
_spriteTarget(spr) {
  let x = spr.x, y = spr.y;
  try { const b = spr.getBounds(); x = b.centerX; y = b.bottom - 12; } catch (e) {}
  const depth = (typeof spr.depth === 'number') ? spr.depth : null;
  return { x, y, depth };
}

// Apunta el camino a un sprite de la escena (por su propiedad). Reintenta si el
// sprite aún no existe; usa fallback si se da (coords del texto del nombre).
_aimAtSprite(spriteKey, fallbackX, fallbackY) {
  const spr = this[spriteKey];
  if (spr && typeof spr.x === 'number') {
    const t = this._spriteTarget(spr);
    this._setTutorialTarget(t.x, t.y, t.depth);
    return;
  }
  if (fallbackX != null) { this._setTutorialTarget(fallbackX, fallbackY); return; }
  this.time.delayedCall(600, () => this._aimAtSprite(spriteKey, fallbackX, fallbackY));
}

// Crea (una vez) el timer que redibuja el camino y registra la limpieza.
// El redibujo es BARATO (solo recorta el camino cacheado); el A* se recomputa
// muy de vez en cuando (ver _drawTutorialPathToTarget), así que un intervalo
// corto no traba el juego.
_ensureTutorialPathTimer() {
  if (this._tutorialPathTimer) return;
  this._tutorialPathTimer = this.time.addEvent({
    delay: 250, loop: true, callback: () => this._drawTutorialPathToTarget()
  });
  this.events.once('shutdown', () => this._cleanupTutorial());
  this.events.once('destroy',  () => this._cleanupTutorial());
}

// Paso 1 (mundo): instrucciones de siembra + camino a la parcela más cercana.
_startWorldPlantPhase() {
  this._tutorialCutCount = 0;
  this._showTutorialBanner('Here you will learn to farm. First place the seeds in the plots, then water them with the watering can, and finally cut them with the pruning shears.');
  this._aimAtNearestPlot();
  this._ensureTutorialPathTimer();
}

// Apunta el camino a la parcela más cercana; reintenta si aún no hay parcelas.
_aimAtNearestPlot() {
  const plot = this._nearestPlotCenter();
  if (plot) { this._setTutorialTarget(plot.x, plot.y); return; }
  this.time.delayedCall(600, () => this._aimAtNearestPlot());
}

// Centro de la parcela de siembra más cercana al jugador (this.plotImages).
_nearestPlotCenter() {
  if (!this.plotImages || this.plotImages.size === 0) return null;
  const px = this.player ? this.player.x : 0;
  const py = this.player ? this.player.y : 0;
  let best = null, bestD = Infinity;
  this.plotImages.forEach(img => {
    const d = Math.hypot(img.x - px, img.y - py);
    if (d < bestD) { bestD = d; best = { x: img.x, y: img.y }; }
  });
  return best;
}

// Paso 2 (mundo): guiar a Lord Digby (sprite_npc5) para ENTREGAR semillas.
_startWorldDigbyPhase() {
  this._showTutorialBanner('Now go and give the seeds to Lord Digby.');
  this._aimAtSprite('sprite_npc5', 2290, 2283);
  this._ensureTutorialPathTimer();
}

// Avanza el tutorial al paso n: persiste y arranca esa fase.
_advanceTutorial(n) {
  this.tutorial = n;
  this._worldTutorialStartedFor = null;
  try { if (typeof this.savegg === 'function') this.savegg(); } catch (e) {}
  this.startWorldTutorial();
}

// Cuenta cada corte/cosecha durante la fase de siembra del tutorial (paso 1).
// A los 4 cortes, avanza al paso 2 (guiar a Lord Digby).
_onTutorialCut() {
  if (this.tutorial !== 1) return;
  this._tutorialCutCount = (this._tutorialCutCount || 0) + 1;
  if (this._tutorialCutCount >= 4) this._advanceTutorial(2);
}

// Paso 4 (mundo): cortar 4 pinos con el hacha.
_startWorldPinePhase() {
  this._tutorialPineCount = 0;
  this._showTutorialBanner('You must cut the pine. Cut 4 pines with your wood axe.');
  this._aimAtNearestPine();
  this._ensureTutorialPathTimer();
}

_aimAtNearestPine() {
  const pine = this._nearestPineCenter();
  if (pine) { this._setTutorialTarget(pine.x, pine.y, pine.depth); return; }
  this.time.delayedCall(600, () => this._aimAtNearestPine());
}

// Pino (sprite_pinos1..45) DISPONIBLE más cercano al jugador. Salta los que
// están TALADOS / en respawn (marcados en this.treeStumps o con input ya
// deshabilitado → spr.input === null tras disableInteractive). El objetivo va a
// la BASE del árbol y trae su depth (el marcador se dibuja en depth+1, encima).
_nearestPineCenter() {
  const px = this.player ? this.player.x : 0;
  const py = this.player ? this.player.y : 0;
  const stumps = this.treeStumps || {};
  let best = null, bestD = Infinity;
  for (let i = 1; i <= 45; i++) {
    const key = 'sprite_pinos' + i;
    const spr = this[key];
    if (!spr || typeof spr.x !== 'number') continue;
    if (stumps[key]) continue;   // árbol talado / en respawn
    if (!spr.input) continue;    // interactividad quitada (disableInteractive) = no disponible
    const d = Math.hypot(spr.x - px, spr.y - py);
    if (d < bestD) {
      bestD = d;
      const t = this._spriteTarget(spr);
      best = { x: t.x, y: t.y, depth: t.depth };
    }
  }
  return best;
}

// Apunta el camino a la fuente/pozo (this.sprite_pozoxd2), a su base + depth.
_aimAtWell() {
  const well = this.sprite_pozoxd2;
  if (well && typeof well.x === 'number') {
    const t = this._spriteTarget(well);
    this._setTutorialTarget(t.x, t.y, t.depth);
    return;
  }
  this.time.delayedCall(600, () => this._aimAtWell());
}

// Cuenta pinos cortados durante el paso 4; a los 4 → paso 5 (dar madera a Digby).
_onTutorialPineCut(treeType) {
  if (this.tutorial !== 4 || treeType !== 'pinos') return;
  this._tutorialPineCount = (this._tutorialPineCount || 0) + 1;
  if (this._tutorialPineCount < 4) this._aimAtNearestPine(); // reapuntar al siguiente
  else this._advanceTutorial(5);
}

// Al cerrar el crafting hub durante el paso 6: confirmar (✓/✗) el empty bucket.
_onCraftingClosed() {
  if (this.tutorial !== 6) return;
  this._showTutorialConfirm(
    'Did you craft the empty bucket? (x1)',
    () => { this._advanceTutorial(7); },                                        // ✓
    () => { this._showTutorialBanner('Craft the empty bucket. Click the crafter Jack.'); } // ✗
  );
}

// Al recolectar agua (obtener balde_con_agua) durante el paso 7: ya no termina
// el tutorial, ahora pasa a enseñar a comer y beber (paso 8).
_onTutorialWaterCollected() {
  if (this.tutorial !== 7) return;
  this._advanceTutorial(20);
}

// Fin del tutorial (paso 22 = terminado).
_finishTutorial() {
  if (this._tutorialFinished) return;
  this._tutorialFinished = true;
  this.tutorial = 22;
  this._worldTutorialStartedFor = 22;
  try { if (typeof this.savegg === 'function') this.savegg(); } catch (e) {}
  this._cleanupTutorial();
  this._showTutorialBanner('You have finished the tutorial!');
  this.time.delayedCall(7000, () => this._hideTutorialBanner());
}

// Diálogo de confirmación (✓/✗) reutilizando la posición del banner.
_showTutorialConfirm(text, onYes, onNo) {
  this._hideTutorialBanner();
  const el = document.createElement('div');
  el.id = 'gf-tutorial-banner';
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'width:min(92vw,760px)', 'box-sizing:border-box',
    'background:rgba(11,61,46,0.96)', 'border:3px solid #ffd23f', 'border-radius:14px',
    'padding:14px 18px', 'z-index:99999', 'color:#fff',
    'font-family:Arial,sans-serif', 'font-size:clamp(13px,3.6vw,18px)', 'line-height:1.35',
    'text-align:center', 'box-shadow:0 6px 24px rgba(0,0,0,0.45)',
    'max-height:46vh', 'overflow:auto', 'pointer-events:auto'
  ].join(';');
  const msg = document.createElement('div');
  msg.textContent = text;
  msg.style.marginBottom = '12px';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;';
  const yes = document.createElement('button');
  yes.textContent = '✓ Yes';
  yes.style.cssText = 'background:#2e7d32;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:clamp(13px,3.4vw,16px);font-weight:bold;cursor:pointer;';
  const no = document.createElement('button');
  no.textContent = '✗ No';
  no.style.cssText = 'background:#b23b3b;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:clamp(13px,3.4vw,16px);font-weight:bold;cursor:pointer;';
  yes.addEventListener('click', () => { this._hideTutorialBanner(); if (onYes) onYes(); });
  no.addEventListener('click',  () => { this._hideTutorialBanner(); if (onNo)  onNo();  });
  row.appendChild(yes); row.appendChild(no);
  el.appendChild(msg); el.appendChild(row);
  document.body.appendChild(el);
  this._tutorialBannerEl = el;
  this._tutorialBannerReposition = () => this._positionTutorialBanner();
  this._positionTutorialBanner();
  window.addEventListener('resize', this._tutorialBannerReposition);
  this._tutorialBannerRepoTimer = setInterval(this._tutorialBannerReposition, 700);
}

// Recalcula (si el jugador se movió lo suficiente) y redibuja el camino.
_drawTutorialPathToTarget() {
  if (!this.player) return;
  const px = this.player.x, py = this.player.y;
  const tx = this._tutorialTargetX, ty = this._tutorialTargetY;
  if (tx == null || ty == null) return;

  // Al llegar cerca del objetivo, dejar de dibujar. Llegar a Lord Digby avanza:
  // paso 2 (semillas entregadas → comprar hacha) y paso 5 (madera entregada → ir a Jack).
  if (Math.hypot(px - tx, py - ty) < 80) {
    this._clearTutorialPath();
    if (this.tutorial === 2) this._advanceTutorial(3);
    else if (this.tutorial === 5) this._advanceTutorial(6);
    return;
  }

  // CLAVE ANTI-STUTTER: el A* NO se recomputa cada frame. Solo se recalcula
  // cuando de verdad hace falta —cambió el objetivo, aún no hay camino, el
  // jugador se desvió, o el camino ya está viejo—. Caminar por el camino solo
  // REDIBUJA (barato), sin bloquear el hilo.
  const now = (this.time && this.time.now) ? this.time.now : Date.now();
  const targetMoved = this._pathForTargetX !== tx || this._pathForTargetY !== ty;
  const strayed = !this._tutorialPath || this._distPointToPath(px, py, this._tutorialPath) > 140;
  const stale = !this._lastPathComputeAt || (now - this._lastPathComputeAt) > 1500;

  if (targetMoved || strayed || stale) {
    const obstacles = this._tutorialObstacles || this.collisionRectangles;
    const path = this._computeTutorialPath(px, py, tx, ty, obstacles);
    this._tutorialPath = (path && path.length >= 2) ? path : [{ x: px, y: py }, { x: tx, y: ty }];
    this._pathForTargetX = tx; this._pathForTargetY = ty;
    this._lastPathComputeAt = now;
  }

  this._renderTrimmedPath(px, py, this._tutorialPath);
}

// Distancia (punto→segmentos) del jugador al camino cacheado. Detecta desvío.
_distPointToPath(px, py, path) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
  }
  return best;
}

// Redibuja el camino recortado desde el jugador, REUSANDO un solo graphics
// (sin crear/destruir objetos ni tweens en cada frame → sin tirones).
_renderTrimmedPath(px, py, path) {
  if (!path || path.length < 2) { this._clearTutorialPath(); return; }

  // Punto del camino más cercano al jugador (para arrancar la línea desde ahí).
  let bestI = 0, bestPt = path[0], bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) { bestD = d; bestI = i; bestPt = { x: cx, y: cy }; }
  }
  const pts = [{ x: px, y: py }, bestPt];
  for (let i = bestI + 1; i < path.length; i++) pts.push(path[i]);

  const g = this._ensureTutorialPathGfx();
  // Depth: JUSTO ENCIMA del objeto objetivo (árbol/NPC/pozo) → marcador visible
  // sobre él, sin usar valores enormes. Si no hay depth de objetivo, debajo del
  // jugador como antes.
  g.setDepth(this._tutorialTargetDepth != null
    ? this._tutorialTargetDepth + 1
    : ((this.player && this.player.depth ? this.player.depth : 3) - 1));
  g.clear();
  g.lineStyle(6, 0xffd23f, 0.95);
  for (let i = 0; i < pts.length - 1; i++) {
    this._dashTutorialLine(g, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 18, 12);
  }
  const end = pts[pts.length - 1];
  g.fillStyle(0xffd23f, 0.95);
  g.fillCircle(end.x, end.y, 11);
  g.lineStyle(3, 0x7a4b00, 1);
  g.strokeCircle(end.x, end.y, 11);
}

// Crea (una vez) el graphics del camino y su tween de pulso, y lo reutiliza.
_ensureTutorialPathGfx() {
  if (!this._tutorialPathGfx || !this._tutorialPathGfx.scene) {
    this._tutorialPathGfx = this.add.graphics();
    this._tutorialPathGfx.setDepth((this.player && this.player.depth ? this.player.depth : 3) - 1);
    this._tutorialPathTween = this.tweens.add({
      targets: this._tutorialPathGfx, alpha: { from: 0.5, to: 1 }, duration: 650, yoyo: true, repeat: -1
    });
  }
  return this._tutorialPathGfx;
}

// A* sobre una grilla derivada de los rectángulos de colisión. Usa un min-heap
// binario (O(log n) por extracción) para que el recálculo puntual sea rápido y
// no genere tirones.
_computeTutorialPath(sx, sy, gx, gy, obstacles) {
  const CELL = 32, PAD = 22;
  const worldW = this.map ? this.map.widthInPixels  : 100000;
  const worldH = this.map ? this.map.heightInPixels : 100000;

  // Ventana FIJA centrada en el JUGADOR → el A* trabaja siempre sobre una grilla
  // pequeña y CONSTANTE, sin importar lo lejos que esté el objetivo. Esto es lo
  // que elimina los tirones cuando el objetivo está muy lejos (antes la grilla
  // crecía con la distancia). Si el objetivo cae fuera de la ventana, se recorta
  // a su borde en la dirección correcta; al avanzar el jugador la ventana lo
  // sigue y el camino continúa.
  const WIN = 640; // medio-lado en px (grilla ~41x41 celdas ≈ 1700, constante)
  const minX = Math.max(0, sx - WIN);
  const minY = Math.max(0, sy - WIN);
  const maxX = Math.min(worldW, sx + WIN);
  const maxY = Math.min(worldH, sy + WIN);

  const cols = Math.ceil((maxX - minX) / CELL);
  const rows = Math.ceil((maxY - minY) / CELL);
  if (cols <= 1 || rows <= 1) return null;

  // Si el objetivo está FUERA de la ventana (lejos), NO hacer A*. Un A* hacia el
  // borde de la ventanita produce rutas locales que apuntan a lugares
  // equivocados ("marca a donde no hay que ir") y hace zigzag al recalcular.
  // Devolvemos null → el llamador dibuja una LÍNEA DIRECTA que apunta bien hacia
  // el objetivo. Cuando el jugador se acerca y el objetivo ENTRA en la ventana,
  // se activa el A* preciso que esquiva colisiones para el tramo final.
  if (gx < minX || gx > maxX || gy < minY || gy > maxY) return null;

  // Solo las colisiones que tocan la ventana (recorta cientos de rects a pocos).
  const allRects = Array.isArray(obstacles) ? obstacles : [];
  const rects = allRects.filter(r =>
    r.x <= maxX + PAD && r.x + r.width >= minX - PAD &&
    r.y <= maxY + PAD && r.y + r.height >= minY - PAD);
  const blocked = (cx, cy) => {
    const wx = minX + cx * CELL + CELL / 2;
    const wy = minY + cy * CELL + CELL / 2;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (wx >= r.x - PAD && wx <= r.x + r.width + PAD &&
          wy >= r.y - PAD && wy <= r.y + r.height + PAD) return true;
    }
    return false;
  };
  const toCell = (wx, wy) => ({
    cx: Math.max(0, Math.min(cols - 1, Math.floor((wx - minX) / CELL))),
    cy: Math.max(0, Math.min(rows - 1, Math.floor((wy - minY) / CELL)))
  });
  const nearestFree = (c) => {
    if (!blocked(c.cx, c.cy)) return c;
    for (let rad = 1; rad < 14; rad++) {
      for (let ox = -rad; ox <= rad; ox++) {
        for (let oy = -rad; oy <= rad; oy++) {
          const nx = c.cx + ox, ny = c.cy + oy;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !blocked(nx, ny)) return { cx: nx, cy: ny };
        }
      }
    }
    return c;
  };

  const start = nearestFree(toCell(sx, sy));
  const goal  = nearestFree(toCell(gx, gy));
  const idx = (cx, cy) => cy * cols + cx;
  const N = cols * rows;
  const gScore = new Float64Array(N).fill(Infinity);
  const came   = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (cx, cy) => Math.hypot(cx - goal.cx, cy - goal.cy);

  // Min-heap binario (pares f/cellIndex).
  const heapF = [], heapI = [];
  const hpush = (f, i) => {
    heapF.push(f); heapI.push(i);
    let c = heapF.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heapF[p] <= heapF[c]) break;
      const tf = heapF[p]; heapF[p] = heapF[c]; heapF[c] = tf;
      const ti = heapI[p]; heapI[p] = heapI[c]; heapI[c] = ti;
      c = p;
    }
  };
  const hpop = () => {
    const topI = heapI[0];
    const lastF = heapF.pop(), lastI = heapI.pop();
    if (heapF.length > 0) {
      heapF[0] = lastF; heapI[0] = lastI;
      let p = 0; const m = heapF.length;
      for (;;) {
        const l = 2 * p + 1, r = 2 * p + 2; let s = p;
        if (l < m && heapF[l] < heapF[s]) s = l;
        if (r < m && heapF[r] < heapF[s]) s = r;
        if (s === p) break;
        const tf = heapF[p]; heapF[p] = heapF[s]; heapF[s] = tf;
        const ti = heapI[p]; heapI[p] = heapI[s]; heapI[s] = ti;
        p = s;
      }
    }
    return topI;
  };

  const startIdx = idx(start.cx, start.cy);
  const goalIdx  = idx(goal.cx, goal.cy);
  gScore[startIdx] = 0;
  hpush(h(start.cx, start.cy), startIdx);

  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  let found = false, guard = 0;
  while (heapF.length && guard++ < 60000) {
    const cur = hpop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goalIdx) { found = true; break; }
    const ccx = cur % cols, ccy = (cur - ccx) / cols;
    for (let d = 0; d < dirs.length; d++) {
      const dx = dirs[d][0], dy = dirs[d][1];
      const nx = ccx + dx, ny = ccy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (blocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (blocked(ccx + dx, ccy) || blocked(ccx, ccy + dy))) continue;
      const ni = ny * cols + nx;
      if (closed[ni]) continue;
      const step = (dx !== 0 && dy !== 0) ? 1.4142 : 1;
      const tentative = gScore[cur] + step;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur;
        hpush(tentative + h(nx, ny), ni);
      }
    }
  }
  if (!found) return null;

  const cells = [];
  let ci = goalIdx;
  while (ci !== -1) { const cx = ci % cols, cy = (ci - cx) / cols; cells.push({ cx, cy }); ci = came[ci]; }
  cells.reverse();

  const pts = cells.map(c => ({ x: minX + c.cx * CELL + CELL / 2, y: minY + c.cy * CELL + CELL / 2 }));
  // Extremos exactos: inicio = jugador; fin = objetivo real (ya está dentro de la
  // ventana, porque si estaba fuera devolvimos null más arriba).
  if (pts.length) { pts[0] = { x: sx, y: sy }; pts[pts.length - 1] = { x: gx, y: gy }; }
  return this._simplifyTutorialPath(pts, rects, PAD);
}

// Suaviza la ruta uniendo puntos con línea de visión libre (string pulling).
_simplifyTutorialPath(pts, rects, pad) {
  if (!pts || pts.length <= 2) return pts;
  const clear = (a, b) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (const r of rects) {
        if (x >= r.x - pad && x <= r.x + r.width + pad &&
            y >= r.y - pad && y <= r.y + r.height + pad) return false;
      }
    }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

_dashTutorialLine(g, x1, y1, x2, y2, dash, gap) {
  const dxt = x2 - x1, dyt = y2 - y1;
  const len = Math.hypot(dxt, dyt);
  if (len === 0) return;
  const ux = dxt / len, uy = dyt / len;
  let d = 0;
  while (d < len) {
    const s = d, e = Math.min(d + dash, len);
    g.beginPath();
    g.moveTo(x1 + ux * s, y1 + uy * s);
    g.lineTo(x1 + ux * e, y1 + uy * e);
    g.strokePath();
    d += dash + gap;
  }
}

_clearTutorialPath() {
  if (this._tutorialPathTween) { this._tutorialPathTween.stop(); this._tutorialPathTween = null; }
  if (this._tutorialPathGfx) { this._tutorialPathGfx.destroy(); this._tutorialPathGfx = null; }
}

// Banner de tutorial como overlay DOM (responsive a cualquier móvil) colocado
// JUSTO ENCIMA de las 7 casillas rápidas (#quick-slots-bar). Usa unidades
// relativas (vw + clamp) para adaptarse a todo tamaño de pantalla.
_showTutorialBanner(text) {
  this._hideTutorialBanner();
  const el = document.createElement('div');
  el.id = 'gf-tutorial-banner';
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'width:min(92vw,760px)', 'box-sizing:border-box',
    'background:rgba(11,61,46,0.94)', 'border:3px solid #ffd23f', 'border-radius:14px',
    'padding:14px 46px 14px 18px', 'z-index:99999', 'color:#fff',
    'font-family:Arial,sans-serif', 'font-size:clamp(13px,3.6vw,18px)', 'line-height:1.35',
    'text-align:center', 'box-shadow:0 6px 24px rgba(0,0,0,0.45)',
    'max-height:40vh', 'overflow:auto', 'pointer-events:auto'
  ].join(';');
  const msg = document.createElement('span');
  msg.textContent = text;
  const close = document.createElement('button');
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Close');
  close.style.cssText = [
    'position:absolute', 'top:6px', 'right:10px', 'background:transparent',
    'border:none', 'color:#ffd23f', 'font-size:20px', 'line-height:1',
    'cursor:pointer', 'padding:4px'
  ].join(';');
  close.addEventListener('click', () => this._hideTutorialBanner());
  el.appendChild(msg);
  el.appendChild(close);
  document.body.appendChild(el);
  this._tutorialBannerEl = el;

  this._tutorialBannerReposition = () => this._positionTutorialBanner();
  this._positionTutorialBanner();
  window.addEventListener('resize', this._tutorialBannerReposition);
  // Reposicionar periódicamente por si la barra de casillas aparece/cambia.
  this._tutorialBannerRepoTimer = setInterval(this._tutorialBannerReposition, 700);
}

// Coloca el banner encima de #quick-slots-bar; si no está visible, cerca del pie.
_positionTutorialBanner() {
  const el = this._tutorialBannerEl;
  if (!el) return;
  const bar = document.getElementById('quick-slots-bar');
  let bottom = 96;
  if (bar && bar.offsetParent !== null && !bar.classList.contains('hidden')) {
    const rect = bar.getBoundingClientRect();
    if (rect.height > 0) bottom = Math.max(12, window.innerHeight - rect.top + 12);
  }
  el.style.bottom = bottom + 'px';
}

_hideTutorialBanner() {
  if (this._tutorialBannerReposition) {
    window.removeEventListener('resize', this._tutorialBannerReposition);
    this._tutorialBannerReposition = null;
  }
  if (this._tutorialBannerRepoTimer) { clearInterval(this._tutorialBannerRepoTimer); this._tutorialBannerRepoTimer = null; }
  if (this._tutorialBannerEl) { this._tutorialBannerEl.remove(); this._tutorialBannerEl = null; }
  // Limpieza defensiva por si quedara un banner de la versión Phaser anterior.
  if (this._tutorialBanner) { this._tutorialBanner.destroy(); this._tutorialBanner = null; }
}

_cleanupTutorial() {
  this._clearTutorialPath();
  if (this._tutorialPathTimer) { this._tutorialPathTimer.remove(false); this._tutorialPathTimer = null; }
  this._hideTutorialBanner();
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
            vidaPorcentaje: this.vidaPorcentaje, 
            aguaPorcentaje: this.aguaPorcentaje, 
            comidaPorcentaje: this.comidaPorcentaje,
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
            tutorial: this.tutorial,
            inventory: inventoryData,
            chest: chestData
        };

        console.log('📤 Payload para guardar:', {
            playerName: this.playerName,
            moneda: this.moneda,
            moneda_plata: this.moneda_plata,
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





    


    showTokenErrorHub() {
        console.log('🔒 Mostrando hub de error de token...');
        
        // Detener el intervalo de transición
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Pausar la escena
        // this.scene.pause(); // removed: caused game freeze

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
            
            // Redirigir al login REAL (app.grasslandforest.com). Antes apuntaba a
            // '../Grassland_Forest_Game/index.html', una ruta relativa que en
            // producción caía en game.grasslandforest.com/Grassland_Forest_Game/
            // index.html — una página que no es el login. Se usa la misma
            // constante que ya emplea el resto del código para salir.
            window.location.href = window.GF_LOGIN_URL || 'https://app.grasslandforest.com/';
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


createImagesFromObjectLayer1(scene, map, objectLayerName, nameMapping) {
  if (typeof TileManager === 'undefined') {
    console.error('❌ TileManager no está disponible.');
    return;
  }

  const objectLayer = map.getObjectLayer(objectLayerName);
  if (!objectLayer) {
    console.warn(`⚠️ Capa '${objectLayerName}' no encontrada.`);
    return;
  }

  // ⚡ MEJORA: Inicializar array para trackear TileManagers con limpieza automática
  if (!scene._tileManagers) {
    scene._tileManagers = [];
    
    // ⚡ LIMPIEZA AUTOMÁTICA CUANDO LA ESCENA SE DESTRUYE
    scene.events.on('destroy', () => {
      console.log('🧹 Destruyendo escena - limpiando todos los TileManagers');
      scene._tileManagers.forEach(tm => {
        try {
          if (tm.destroy && typeof tm.destroy === 'function') {
            tm.destroy();
          }
        } catch (e) {
          console.error('Error destruyendo TileManager:', e);
        }
      });
      scene._tileManagers = [];
    });

    // ⚡ LIMPIEZA CUANDO LA ESCENA SE DETIENE
    scene.events.on('shutdown', () => {
      console.log('🔌 Apagando escena - limpiando TileManagers');
      scene._tileManagers.forEach(tm => {
        try {
          if (tm.emergencyCleanup && typeof tm.emergencyCleanup === 'function') {
            tm.emergencyCleanup();
          }
        } catch (e) {
          console.error('Error en limpieza de emergencia:', e);
        }
      });
    });
  }

  // ⚡ MEJORA: Limpiar TileManagers existentes antes de crear nuevos
  const existingManagers = scene._tileManagers.length;
  if (existingManagers > 0) {
    console.log(`🧹 Limpiando ${existingManagers} TileManagers existentes`);
    scene._tileManagers.forEach(tm => {
      try {
        if (tm.destroy && typeof tm.destroy === 'function') {
          tm.destroy();
        }
      } catch (e) {
        console.error('Error limpiando TileManager existente:', e);
      }
    });
    scene._tileManagers = [];
  }

  objectLayer.objects.forEach(obj => {
    if (!obj.name) {
      console.warn(`⚠️ Objeto sin nombre en capa ${objectLayerName}`);
      return;
    }

    const mapping = nameMapping[obj.name];
    if (!mapping) {
      console.warn(`⚠️ No hay mapeo para '${obj.name}'`);
      return;
    }

    const { carpeta, json, targetProp } = mapping;
    if (!carpeta || !json || !targetProp) {
      console.warn(`⚠️ Mapping incompleto para '${obj.name}':`, mapping);
      return;
    }

    console.log(`🔄 Cargando TileManager para: ${obj.name}`);

    // ⚡ MEJORA: Verificar si ya existe la metadata antes de cargarla
    if (scene.cache.json.exists(obj.name + '_metadata')) {
      scene.cache.json.remove(obj.name + '_metadata');
    }

    // Cargar metadata
    scene.load.json(obj.name + '_metadata', json);
    
    scene.load.once('complete', () => {
      try {
        const meta = scene.cache.json.get(obj.name + '_metadata');
        
        if (!meta) {
          console.error(`❌ No se pudo cargar metadata desde ${json}`);
          return;
        }

        // ⚡ MEJORA: Configuración optimizada para memoria
        const tileManager = new TileManager(scene, meta, {
          basePath: carpeta,
          supportsWebP: scene.game.device.features.webP,
          preferredLOD: 'hd',
          // FIX PARPADEO/POP-IN DE TILES: con marginTiles 2 y solo 2 cargas
          // simultáneas, al moverte los chunks (imágenes de 1024px) llegaban
          // TARDE: se veía el hueco y luego aparecía el tile de golpe. Con un
          // anillo de precarga más ancho (3) y más descargas en paralelo (4),
          // el tile ya está listo antes de entrar en cuadro.
          marginTiles: 3,
          maxConcurrentLoads: 4,
          // NOTA: maxLoadedTiles NO lo usa tileManager.js (opción inerte); la
          // memoria se controla con el rango de descarga + histéresis.
          maxLoadedTiles: 20,
          depth: -1,
          debug: false // Mantener en false para producción
        });
        
        tileManager.init();
        scene[targetProp] = tileManager;
        
        // Registrar para limpieza automática
        scene._tileManagers.push(tileManager);
        
        console.log(`✅ TileManager creado para ${obj.name} (límite: ${tileManager.maxLoadedTiles} tiles)`);
        
        // ⚡ MEJORA: Carga inicial más inteligente
        scene.time.delayedCall(100, () => {
          if (scene.cameras && scene.cameras.main) {
            tileManager.updateVisible(scene.cameras.main);
          }
        });

        // ⚡ MEJORA: Actualización continua con throttling
        if (!scene._tileUpdateEvent) {
          scene._tileUpdateEvent = scene.time.addEvent({
            delay: 250, // Actualizar cada 250ms en lugar de cada frame
            callback: () => {
              if (scene.cameras && scene.cameras.main) {
                scene._tileManagers.forEach(tm => {
                  if (tm.updateVisible && typeof tm.updateVisible === 'function') {
                    tm.updateVisible(scene.cameras.main);
                  }
                });
              }
            },
            loop: true
          });
        }
        
      } catch (error) {
        console.error(`❌ Error creando TileManager para ${obj.name}:`, error);
      }
    });
    
    scene.load.start();
  });

  // ⚡ MEJORA: Limpieza global al cambiar de escena
  //
  // OJO: sceneManager es un objeto ÚNICO de todo el juego, compartido por todas
  // las escenas. Envolver sus métodos aquí sin ninguna protección significaba
  // envolverlos OTRA VEZ cada vez que se entraba a GameScene: los envoltorios se
  // apilaban unos sobre otros y cada uno se quedaba con una referencia viva a
  // aquella escena y a todos sus TileManagers, que ya no se podían liberar.
  // Ir y volver de la tienda unas cuantas veces dejaba media docena de escenas
  // enteras retenidas en memoria — en un teléfono eso son pausas del recolector
  // de basura y tirones de frames cada vez peores según avanza la partida.
  // Con la marca `_gfTileCleanupPatched` se envuelve UNA sola vez.
  if (scene.scene && scene.scene.manager && !scene.scene.manager._gfTileCleanupPatched) {
    const sceneManager = scene.scene.manager;
    sceneManager._gfTileCleanupPatched = true;

    // La escena a limpiar se lee en el momento desde el registro, en vez de
    // quedar capturada en el closure: así el envoltorio no retiene ninguna
    // escena concreta.
    sceneManager._gfTileCleanupScene = scene;

    // Interceptar el cambio de escena para limpiar
    const originalStart = sceneManager.start.bind(sceneManager);
    sceneManager.start = function(key, data) {
      const sc = sceneManager._gfTileCleanupScene;
      if (sc && sc._tileManagers) {
        console.log(`🔄 Cambiando de escena - limpiando TileManagers`);
        sc._tileManagers.forEach(tm => {
          try {
            if (tm.emergencyCleanup && typeof tm.emergencyCleanup === 'function') {
              tm.emergencyCleanup();
            }
          } catch (e) {
            console.error('Error limpiando al cambiar escena:', e);
          }
        });
      }
      return originalStart(key, data);
    };

    const originalStop = sceneManager.stop.bind(sceneManager);
    sceneManager.stop = function(key) {
      const sc = sceneManager._gfTileCleanupScene;
      if (sc && sc.scene && key === sc.scene.key && sc._tileManagers) {
        console.log(`🛑 Deteniendo escena - limpiando TileManagers`);
        sc._tileManagers.forEach(tm => {
          try {
            if (tm.destroy && typeof tm.destroy === 'function') {
              tm.destroy();
            }
          } catch (e) {
            console.error('Error destruyendo al detener escena:', e);
          }
        });
        // Soltar la referencia: si no, la última escena detenida se quedaría
        // retenida por el gestor para siempre.
        sceneManager._gfTileCleanupScene = null;
      }
      return originalStop(key);
    };
  } else if (scene.scene && scene.scene.manager) {
    // Ya estaba envuelto por una entrada anterior: solo se apunta la escena
    // actual como la que hay que limpiar.
    scene.scene.manager._gfTileCleanupScene = scene;
  }
}

// ⚡ MEJORA: Función auxiliar para limpiar todos los TileManagers manualmente
cleanupAllTileManagers(scene) {
  if (!scene || !scene._tileManagers) return 0;
  
  console.log('🧹 LIMPIEZA MANUAL DE TODOS LOS TILEMANAGERS');
  let cleaned = 0;
  
  scene._tileManagers.forEach(tm => {
    try {
      if (tm.destroy && typeof tm.destroy === 'function') {
        tm.destroy();
        cleaned++;
      }
    } catch (e) {
      console.error('Error en limpieza manual:', e);
    }
  });
  
  scene._tileManagers = [];
  
  // Limpiar evento de actualización
  if (scene._tileUpdateEvent) {
    scene._tileUpdateEvent.destroy();
    scene._tileUpdateEvent = null;
  }
  
  console.log(`✅ ${cleaned} TileManagers limpiados manualmente`);
  return cleaned;
}

// ⚡ MEJORA: Función para obtener estado de memoria
getTileManagersMemoryStatus(scene) {
  if (!scene || !scene._tileManagers) return null;
  
  return scene._tileManagers.map(tm => {
    if (tm.getMemoryStatus && typeof tm.getMemoryStatus === 'function') {
      return tm.getMemoryStatus();
    }
    return { instanceId: 'Unknown', status: 'No memory info available' };
  });
}

/**
 * VERSIÓN FINAL PERFECTA - Rápida, compatible, sin errores
 * Mantiene .setDepth(), .setAlpha(), y toda la funcionalidad original
 */
// ── Y-SORT PROFESIONAL DE EDIFICIOS ──────────────────────────────────────
// Antes cada capa de edificios usaba un offset de profundidad A MANO
// (-40, -48, -148...): si el número no coincidía con la altura visual de la
// puerta/pared de ESA casa, el jugador desaparecía detrás del techo al pasar
// por delante. Este método calcula la línea de oclusión REAL de cada
// edificio a partir de su rectángulo de colisión (la pared sólida que el
// jugador no puede atravesar): si los pies del jugador están por debajo del
// borde inferior de esa pared, está DELANTE (se dibuja encima); si están por
// encima, está DETRÁS (la casa lo tapa). Auto-calibrado, sin números mágicos.
// Se llama una sola vez desde update() cuando las colisiones ya existen.
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

      // Buscar la pared frontal: el rectángulo de colisión que se superpone
      // horizontalmente con el edificio y cuyo borde inferior cae dentro de
      // su cuerpo. Si hay varios, gana el más bajo (la pared más cercana al
      // frente).
      let frontLine = null;
      for (const arr of arrays) {
        for (const r of arr) {
          if (!r || typeof r.width !== 'number') continue;
          const overlapW = Math.min(b.right, r.right) - Math.max(b.x, r.x);
          if (overlapW < Math.min(r.width, b.width) * 0.5) continue;
          const rBottom = r.y + r.height;
          if (rBottom < b.y + b.height * 0.15) continue;   // muy arriba (techo/otra cosa)
          if (rBottom > b.y + b.height + 4) continue;      // por debajo del edificio
          if (frontLine === null || rBottom > frontLine) frontLine = rBottom;
        }
      }

      if (frontLine !== null) {
        child.setDepth(frontLine - 1);
        calibrated++;
      }
    } catch (e) { /* edificio sin bounds válidos: conservar su depth manual */ }
  });

  if (calibrated > 0) {
    console.log(`🏠 Y-sort profesional: ${calibrated} edificios calibrados con su línea de colisión real`);
  }
  return calibrated;
}

createImagesFromObjectLayer(scene, map, objectLayerName, nameMapping, depthOffset = 0) {
  // 1. Obtener capa de objetos
  const objectLayer = map.getObjectLayer(objectLayerName);
  if (!objectLayer) {
    console.warn(`⚠️ La capa '${objectLayerName}' no se encontró.`);
    return null;
  }

  // 2. Contador para estadísticas
  let totalCreated = 0;
  
  // 3. Procesar cada objeto
  objectLayer.objects.forEach(obj => {
    if (!obj.name) return;
    
    const mapping = nameMapping[obj.name];
    if (!mapping) return;
    
    const { spriteKey, targetProp, onClick, cursor } = mapping;
    if (!spriteKey || !targetProp) return;
    
    const sprite = this.createOptimizedSprite(scene, obj, spriteKey, depthOffset);
    
    // Handle onClick and hover for interactive objects (e.g. horno)
    if (onClick) {
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        if (typeof onClick === 'function') onClick();
      });
      sprite.on('pointerover', () => {
        sprite.setTint(0x88bbff); // Blue highlight on hover
        if (this.input && this.input.setDefaultCursor)
          this.input.setDefaultCursor('pointer');
      });
      sprite.on('pointerout', () => {
        sprite.clearTint();
        if (this.input && this.input.setDefaultCursor)
          this.input.setDefaultCursor('default');
      });
    }
    
    scene[targetProp] = sprite;
    totalCreated++;
  });
  
  // 6. Optimizar grupo si hay muchos sprites
  this.optimizeLayerIfNeeded(scene, objectLayerName, objectLayer.objects.length);
  
  console.log(`✅ ${objectLayerName}: ${totalCreated} sprites creados`);
  return totalCreated;
}

/**
 * Crea un sprite optimizado con todas las funcionalidades
 * @param {number} depthOffset - Añadir al depth para edificios y objetos altos.
 *   0 = árboles/plantas (comparar pies vs base funciona bien)
 *   48 = edificios (la base del sprite está más abajo que el umbral visual de la puerta)
 */
createOptimizedSprite(scene, obj, spriteKey, depthOffset = 0) {
  // 1. Crear sprite normal (para mantener compatibilidad)
  // setOrigin(0,1) → obj.y ya es la base del sprite, ideal para Y-sorting
  const sprite = scene.add.image(obj.x, obj.y, spriteKey)
    .setOrigin(0, 1)
    .setActive(true)
    .setVisible(true)
    .setDepth(obj.y + depthOffset);

  // 2. Aplicar configuraciones de Tiled
  this.applyTiledProperties(sprite, obj);

  // 3. Marcar como optimizable
  sprite.setData('optimized', true);
  sprite.setData('static', true); // Marcar como estático para Phaser

  // Y-SORT PROFESIONAL: las capas que pasan depthOffset ≠ 0 son edificios
  // (casas, molino, herrería...). Se marcan para que calibrateBuildingDepths()
  // reemplace el offset manual por la LÍNEA REAL de su pared frontal (el
  // borde inferior de su rectángulo de colisión) cuando las colisiones del
  // mapa ya estén cargadas. Ver calibrateBuildingDepths().
  sprite.setData('isBuilding', depthOffset !== 0);
  
  // 4. Desactivar actualizaciones innecesarias (CRÍTICO para rendimiento)
  this.disableUnnecessaryUpdates(sprite);
  
  return sprite;
}

/**
 * Activa el input de un árbol/mineral con hit-test PIXEL PERFECT.
 *
 * Antes se usaba setInteractive({ useHandCursor: false }), que crea un área de
 * click RECTANGULAR del tamaño completo del sprite. Como los árboles y las
 * piedras se solapan y Phaser sólo entrega el click al objeto interactivo que
 * está más arriba, el rectángulo (casi todo transparente) de un árbol vecino se
 * comía los clicks del centro del objeto de abajo: solo respondían las esquinas
 * que sobresalían de ese rectángulo. Con pixel perfect, un píxel transparente ya
 * no captura el click y éste llega al objeto que de verdad se ve bajo el cursor.
 */
enablePixelPerfectInput(sprite) {
  if (!sprite || !sprite.active) return;
  sprite.setInteractive(this.input.makePixelPerfect(1));
}

/**
 * Repinta todos los textos cuando la fuente pixel ya está cargada.
 *
 * Phaser dibuja cada Text UNA vez sobre un canvas y cachea esa imagen. Si el
 * objeto se crea antes de que el navegador termine de cargar 'PressStart2P'
 * (@font-face de styless.css), se rasteriza con la fuente de reemplazo y esa
 * imagen mal dibujada se queda ahí: es el nombre del NPC / del jugador / de la
 * mascota que a veces sale ilegible y que "se arregla solo" al recargar,
 * porque en la segunda carga la fuente ya está en la caché del navegador.
 *
 * Aquí se espera a document.fonts y se fuerza a redibujar (updateText) todos
 * los textos ya creados. Es barato y solo ocurre una vez por arranque.
 */
refrescarTextosConFuente() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return;

  const repintar = () => {
    if (!this.children) return;
    this.children.each(obj => {
      if (obj && obj.type === 'Text' && typeof obj.updateText === 'function') {
        try { obj.updateText(); } catch (e) { /* objeto ya destruido */ }
      }
    });
  };

  // Se piden los tamaños que realmente usa el juego: document.fonts.load()
  // resuelve cuando ESA combinación está disponible de verdad.
  Promise.all([
    document.fonts.load('8px "PressStart2P"'),
    document.fonts.load('9px "PressStart2P"'),
    document.fonts.load('12px "PressStart2P"'),
    document.fonts.load('14px "PressStart2P"')
  ])
    .then(() => document.fonts.ready)
    .then(() => {
      repintar();
      // Segunda pasada por si algún texto se creó justo en ese instante
      this.time && this.time.delayedCall(400, repintar);
      console.log('🔤 Textos repintados con la fuente pixel ya cargada');
    })
    .catch(err => console.warn('No se pudo esperar a la fuente pixel:', err));
}

/**
 * Quita el input de un árbol/mineral SIN dejar colgado el movimiento del ratón.
 *
 * mouseMovement.cursorOverUI se pone en true con 'gameobjectover' y solo se
 * limpia con 'gameobjectout'. Al talar/minar, el cursor está justo encima del
 * sprite y acto seguido se le quita el input: Phaser ya no emite 'gameobjectout'
 * para ese objeto, así que la bandera se quedaba pegada en true y el movimiento
 * por clic dejaba de responder — parecía que el juego se congelaba "hasta que
 * terminara la transacción" (en realidad se destrababa al pasar por encima de
 * otro objeto interactivo y salir). Aquí se limpia a mano.
 */
disableSpriteInput(sprite) {
  if (sprite && sprite.input) sprite.disableInteractive();
  if (this.mouseMovement) this.mouseMovement.cursorOverUI = false;
}

// Anti-trampa de recolección: pide al SERVIDOR que valide el nodo, lo bloquee,
// decida y ACUÑE la recompensa de talar/minar. Devuelve [{id,cantidad}] (el
// item ya está acuñado on-chain por el servidor; se refleja local para la UI) o
// [] si no cayó nada / falló.
async _gatherClaim(nodeKey, toolId) {
  try {
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/gather/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeKey, toolId })
    });
    if (!res || !res.ok) return [];
    const data = await res.json();
    if (data && data.reward && data.reward.tipo && data.reward.quantity > 0) {
      // Reflejar local el item que el servidor ya acuñó on-chain (no re-acuñar).
      this.addItemWithCheck(data.reward.tipo, data.reward.quantity);
      return [{ id: data.reward.tipo, cantidad: data.reward.quantity }];
    }
    return [];
  } catch (e) {
    console.error('❌ gather claim error:', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HUB DE MONEDA — se abre al hacer clic en la moneda de oro o de plata del HUD.
// Dos pestañas: comprar oro con USDT y cambiar 1000 plata ⇄ 1 oro.
// Responsive (PC y móvil). Todos los textos en inglés.
// ═══════════════════════════════════════════════════════════════════════════
SILVER_PER_GOLD = 1000;

// PAQUETES DE COMPRA DE DINERO (2026-08-04)
// ---------------------------------------------------------------------------
// Precio 1 a 1: 1 = 1 $, 10 = 10 $, 100 = 100 $ (antes había descuento por
// volumen: 10 costaba 9 y 100 costaba 90).
// Cada paquete tiene su PROPIO tope de 3 compras al día: gastadas las 3 de 1 $,
// todavía quedan las 3 de 10 $ y las 3 de 100 $ hasta mañana. El contador lo
// lleva el SERVIDOR (CurrencyPurchase en server2.js), nunca el navegador, así
// que no se puede reiniciar recargando la página ni cambiando la hora.
GOLD_PACKAGES = [
  { gold: 1,   usdt: 1,   pack: 1   },
  { gold: 10,  usdt: 10,  pack: 10  },
  { gold: 100, usdt: 100, pack: 100 }
];
CURRENCY_PACK_DAILY_LIMIT = 3;

// Enlaza el clic de las monedas del HUD con el hub.
//
// OJO: las monedas del HUD son elementos del DOM de game.html, NO de la escena.
// Sobreviven a los cambios de escena. Antes esto se protegía con un flag de
// instancia (`this._currencyHubBound`), pero GameScene y tiendajuego enganchan
// las MISMAS dos cajas, cada una con su propio flag: al ir y volver de la
// tienda los listeners se iban acumulando sobre el mismo elemento y un solo clic
// abría el panel varias veces.
//
// Ahora el candado vive en el propio elemento: se guarda el handler en él y se
// quita el anterior antes de poner el nuevo. Pase lo que pase con las escenas,
// cada caja tiene exactamente UN listener, y siempre el de la escena más
// reciente.
_setupCurrencyHub() {
  try {
    const bind = (el, tab) => {
      if (!el) return;
      el.style.cursor = 'pointer';
      if (el._gfCurrencyHandler) el.removeEventListener('click', el._gfCurrencyHandler);
      el._gfCurrencyHandler = () => this._openCurrencyHub(tab);
      el.addEventListener('click', el._gfCurrencyHandler);
    };
    bind(document.querySelector('.corner-box .left-stack'),  'buy');
    bind(document.querySelector('.corner-box .right-stack'), 'exchange');
  } catch (e) { /* no crítico */ }
}

// Red legible a partir del chainId de la wallet conectada.
async _walletInfo() {
  const out = { address: this.address || window.currentAddress || '—', network: 'Unknown network' };
  try {
    const p = window.ethereum;
    if (p && p.request) {
      const accs = await p.request({ method: 'eth_accounts' });
      if (accs && accs[0]) out.address = accs[0];
      const cid = await p.request({ method: 'eth_chainId' });
      const id  = parseInt(cid, 16);
      const NAMES = { 1: 'Ethereum Mainnet', 56: 'BNB Smart Chain', 137: 'Polygon', 4441: 'LitVM LiteForge' };
      out.network = `${NAMES[id] || 'Chain'} (id ${id})`;
    }
  } catch (e) { /* wallet no disponible */ }
  return out;
}

async _openCurrencyHub(tab) {
  // Candado de reentrada. Este método es async y espera a _walletInfo() ANTES
  // de crear el modal, así que dos llamadas seguidas (doble toque en el móvil,
  // o un listener duplicado) pasaban las dos por el `old.remove()` cuando
  // todavía no había nada que quitar y luego insertaban dos modales encima.
  if (this._currencyHubOpening) return;
  this._currencyHubOpening = true;
  try {
    await this._buildCurrencyHub(tab);
  } finally {
    this._currencyHubOpening = false;
  }
}

async _buildCurrencyHub(tab) {
  const old = document.getElementById('gf-currency-modal');
  if (old) old.remove();

  const w = await this._walletInfo();
  const oro   = Math.floor(Number(this.moneda) || 0);
  const plata = Math.floor(Number(this.moneda_plata) || 0);
  const maxExchange = Math.floor(plata / this.SILVER_PER_GOLD);

  const ov = document.createElement('div');
  ov.id = 'gf-currency-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;';

  // Cada paquete muestra su propio contador diario ("2/3 left today"), que se
  // rellena en cuanto responde el servidor (ver _refrescarLimitesDeCompra).
  const pkgs = this.GOLD_PACKAGES.map((p, i) =>
    `<div class="gfc-pkg" data-i="${i}" data-pack="${p.pack}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#0b2b22;border:2px solid #2b5c4a;border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">
       <div style="display:flex;align-items:center;gap:8px;">
         <img src="./Game/Source/moneda de oro.png" alt="" style="width:26px;height:26px;image-rendering:pixelated;">
         <div>
           <b style="font-size:clamp(14px,3.8vw,17px);">${p.gold} Gold</b>
           <div class="gfc-left" data-pack="${p.pack}" style="color:#8fb8ff;font-size:11px;">checking…</div>
         </div>
       </div>
       <div style="text-align:right;">
         <div style="color:#ffd23f;font-weight:bold;">$${p.usdt}</div>
         <div style="color:#7f96b5;font-size:11px;">${p.gold} = $${p.usdt}</div>
       </div>
     </div>`).join('');

  const card = document.createElement('div');
  card.style.cssText = 'width:min(94vw,420px);max-height:88vh;overflow:auto;box-sizing:border-box;background:rgba(11,61,46,.98);border:3px solid #ffd23f;border-radius:16px;color:#fff;font-family:Arial,sans-serif;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.6);';
  card.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
       <b style="font-size:clamp(15px,4vw,19px);">💰 Currency</b>
       <button id="gfc-x" style="background:transparent;border:none;color:#ffd23f;font-size:22px;cursor:pointer;">✕</button>
     </div>
     <div style="display:flex;gap:8px;margin-bottom:12px;">
       <button id="gfc-tab-buy" style="flex:1;min-height:42px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;">Buy Gold</button>
       <button id="gfc-tab-exc" style="flex:1;min-height:42px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;">Exchange</button>
     </div>

     <div id="gfc-buy">
       <div style="color:#bcd6c9;font-size:12px;margin-bottom:8px;line-height:1.5;">
         Choose a package — <b>1 Gold = $1</b>.<br>
         <span style="color:#8fb8ff;">Each package can be bought up to ${this.CURRENCY_PACK_DAILY_LIMIT} times per day, counted separately.</span>
       </div>
       ${pkgs}
       <div style="background:#08211a;border:1px solid #24503f;border-radius:10px;padding:10px;font-size:12px;line-height:1.5;">
         <div style="color:#8fb8ff;">Connected wallet</div>
         <div style="font-family:monospace;word-break:break-all;">${w.address}</div>
         <div style="color:#8fb8ff;margin-top:6px;">Network</div>
         <div>${w.network}</div>
       </div>
       <div id="gfc-buy-msg" style="margin-top:10px;font-size:12px;color:#ffd23f;"></div>
     </div>

     <div id="gfc-exc" style="display:none;">
       <div style="text-align:center;margin-bottom:10px;font-size:clamp(13px,3.6vw,16px);">
         <b>${this.SILVER_PER_GOLD} Silver = 1 Gold</b>
       </div>
       <div style="display:flex;justify-content:space-around;background:#08211a;border:1px solid #24503f;border-radius:10px;padding:10px;margin-bottom:12px;font-size:13px;">
         <div>🥇 Gold: <b>${oro}</b></div>
         <div>🥈 Silver: <b>${plata}</b></div>
       </div>
       <label style="font-size:12px;color:#bcd6c9;">How much Gold do you want? (max ${maxExchange})</label>
       <div style="display:flex;align-items:center;gap:10px;margin:8px 0 12px;">
         <button id="gfc-e-minus" style="width:44px;height:44px;font-size:22px;border:none;border-radius:10px;background:#1b3d31;color:#fff;cursor:pointer;">−</button>
         <input id="gfc-e-qty" type="number" inputmode="numeric" min="1" max="${Math.max(1, maxExchange)}" value="1"
                style="flex:1;height:44px;text-align:center;font-size:18px;font-weight:bold;border-radius:10px;border:2px solid #ffd23f;background:#0b2b22;color:#fff;">
         <button id="gfc-e-plus" style="width:44px;height:44px;font-size:22px;border:none;border-radius:10px;background:#1b3d31;color:#fff;cursor:pointer;">+</button>
       </div>
       <div id="gfc-e-cost" style="text-align:center;color:#ffd23f;margin-bottom:12px;font-size:13px;"></div>
       <button id="gfc-e-go" style="width:100%;min-height:48px;border:none;border-radius:12px;background:#2e7d32;color:#fff;font-weight:bold;font-size:16px;cursor:pointer;">✓ Exchange</button>
       <div id="gfc-e-msg" style="margin-top:10px;font-size:12px;text-align:center;"></div>
     </div>`;

  ov.appendChild(card);
  document.body.appendChild(ov);

  const $ = (id) => card.querySelector('#' + id);
  const close = () => ov.remove();
  $('gfc-x').onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };

  // Pestañas
  const paint = (which) => {
    const on  = 'background:#ffd23f;color:#20160a;';
    const off = 'background:#1b3d31;color:#fff;';
    $('gfc-tab-buy').style.cssText = 'flex:1;min-height:42px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;' + (which === 'buy' ? on : off);
    $('gfc-tab-exc').style.cssText = 'flex:1;min-height:42px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;' + (which === 'exchange' ? on : off);
    $('gfc-buy').style.display = which === 'buy' ? 'block' : 'none';
    $('gfc-exc').style.display = which === 'exchange' ? 'block' : 'none';
  };
  $('gfc-tab-buy').onclick = () => paint('buy');
  $('gfc-tab-exc').onclick = () => paint('exchange');
  paint(tab === 'exchange' ? 'exchange' : 'buy');

  // ── Compra de dinero ─────────────────────────────────────────────────────
  // El tope de 3 compras al día POR PAQUETE lo lleva el servidor. Aquí solo se
  // enseña cuántas quedan y se manda la petición; si el servidor dice que no
  // quedan, se avisa con la hora a la que se reinicia el contador.
  card.querySelectorAll('.gfc-pkg').forEach(el => {
    el.onclick = () => this._comprarPaqueteDeDinero(Number(el.getAttribute('data-i')), card);
  });
  this._refrescarLimitesDeCompra(card);

  // ── Cambio de moneda ─────────────────────────────────────────────────────
  const qtyEl = $('gfc-e-qty'), costEl = $('gfc-e-cost'), msgEl = $('gfc-e-msg');
  const refresh = () => {
    let q = Math.max(1, Math.min(Math.max(1, maxExchange), parseInt(qtyEl.value, 10) || 1));
    qtyEl.value = q;
    costEl.textContent = `Cost: ${q * this.SILVER_PER_GOLD} Silver  →  you get ${q} Gold`;
  };
  $('gfc-e-minus').onclick = () => { qtyEl.value = (parseInt(qtyEl.value, 10) || 1) - 1; refresh(); };
  $('gfc-e-plus').onclick  = () => { qtyEl.value = (parseInt(qtyEl.value, 10) || 1) + 1; refresh(); };
  qtyEl.oninput = refresh;
  refresh();

  $('gfc-e-go').onclick = async () => {
    const q = parseInt(qtyEl.value, 10) || 1;
    if (maxExchange < 1) { msgEl.style.color = '#ff8a8a'; msgEl.textContent = 'Not enough Silver.'; return; }
    $('gfc-e-go').disabled = true;
    $('gfc-e-go').textContent = '⏳ Exchanging…';
    msgEl.style.color = '#ffd23f';
    msgEl.textContent = 'Sending transaction…';
    const ok = await this._exchangeCurrency('silverToGold', q);
    if (ok) { msgEl.style.color = '#6fcf97'; msgEl.textContent = `Done! +${q} Gold`; setTimeout(close, 1200); }
    else    { msgEl.style.color = '#ff8a8a'; msgEl.textContent = 'Exchange failed. Try again.'; }
    $('gfc-e-go').disabled = false;
    $('gfc-e-go').textContent = '✓ Exchange';
  };
}

// ============================================================================
// COMPRA DE DINERO CON TOPE DIARIO  (2026-08-04)
// ----------------------------------------------------------------------------
// 1 = 1 $, 10 = 10 $, 100 = 100 $. Cada paquete se puede comprar 3 veces al
// día, y los tres contadores son independientes: agotadas las 3 compras de 1 $,
// se pueden seguir comprando las de 10 $ y las de 100 $.
//
// El contador lo lleva el SERVIDOR (/api/currency/purchase). Aquí solo se
// muestra lo que queda y se pide la compra: recargar la página o cambiar la
// hora del teléfono no reinicia nada.
// ============================================================================

/** Pinta "N/3 left today" en cada paquete. */
async _refrescarLimitesDeCompra(card) {
  const pintar = (pack, texto, agotado) => {
    const el = card.querySelector(`.gfc-left[data-pack="${pack}"]`);
    if (!el) return;
    el.textContent = texto;
    el.style.color = agotado ? '#ff8a8a' : '#8fd9b6';
    const fila = card.querySelector(`.gfc-pkg[data-pack="${pack}"]`);
    if (fila) {
      fila.style.opacity = agotado ? '0.55' : '';
      fila.style.cursor = agotado ? 'not-allowed' : 'pointer';
    }
  };

  try {
    const res = await this.fetchWithTokenRetry(
      `${this.serverBase}/api/currency/purchase/limits`, { method: 'GET' }
    );
    if (!res || !res.ok) throw new Error('limits_failed');
    const data = await res.json();
    this._limitesCompra = data;

    (data.packs || []).forEach(p => {
      pintar(
        p.pack,
        p.remaining > 0
          ? `${p.remaining} of ${data.limit} left today`
          : 'Sold out today',
        p.remaining <= 0
      );
    });
  } catch (e) {
    console.warn('No se pudieron leer los topes de compra:', e);
    this.GOLD_PACKAGES.forEach(p => pintar(p.pack, `up to ${this.CURRENCY_PACK_DAILY_LIMIT} per day`, false));
  }
}

async _comprarPaqueteDeDinero(indice, card) {
  const p = this.GOLD_PACKAGES[indice];
  if (!p) return;

  const msg = document.getElementById('gfc-buy-msg');
  const fila = card.querySelector(`.gfc-pkg[data-pack="${p.pack}"]`);

  // Comprobación local rápida para no mandar una petición condenada al fallo.
  const estado = (this._limitesCompra && this._limitesCompra.packs || [])
    .find(x => Number(x.pack) === Number(p.pack));
  if (estado && estado.remaining <= 0) {
    if (msg) {
      msg.style.color = '#ff8a8a';
      msg.textContent = `You already bought the $${p.usdt} pack ${this.CURRENCY_PACK_DAILY_LIMIT} times today. It resets at midnight UTC.`;
    }
    return;
  }

  if (this._comprandoDinero) return;
  this._comprandoDinero = true;
  if (fila) fila.style.pointerEvents = 'none';
  if (msg) { msg.style.color = '#ffd23f'; msg.textContent = `Buying ${p.gold} Gold for $${p.usdt}…`; }

  try {
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/currency/purchase`, {
      method: 'POST',
      body: JSON.stringify({ pack: p.pack })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const cuando = data.resetsAt ? new Date(data.resetsAt).toLocaleString() : 'midnight UTC';
      const mensajes = {
        daily_pack_limit_reached: `You already bought the $${p.usdt} pack ${this.CURRENCY_PACK_DAILY_LIMIT} times today. It resets at ${cuando}.`,
        credit_failed: 'The payment could not be credited. Nothing was charged — try again in a moment.',
        invalid_pack: 'That package is not available.'
      };
      if (msg) { msg.style.color = '#ff8a8a'; msg.textContent = mensajes[data.error] || 'The purchase could not be completed.'; }
      this._limitesCompra = data && data.packs ? data : this._limitesCompra;
      await this._refrescarLimitesDeCompra(card);
      return;
    }

    // Saldo nuevo (el servidor ya movió la factura on-chain).
    this.moneda = (Number(this.moneda) || 0) + p.gold;
    if (window.playerStats) window.playerStats.oro = this.moneda;
    const izq = document.getElementById('info-text-left');
    if (izq) izq.textContent = `${this.moneda}`;

    this._limitesCompra = data;
    await this._refrescarLimitesDeCompra(card);

    const restantes = (data.packs || []).find(x => Number(x.pack) === Number(p.pack));
    if (msg) {
      msg.style.color = '#6fcf97';
      msg.textContent = `Done! +${p.gold} Gold` +
        (restantes ? ` — ${restantes.remaining} purchase(s) of this pack left today` : '');
    }
    this.notifications && this.notifications.show(`Purchased ${p.gold} Gold for $${p.usdt}`, 'success', { icon: '💰' });
  } catch (e) {
    console.error('❌ Error comprando dinero:', e);
    if (msg) { msg.style.color = '#ff8a8a'; msg.textContent = 'Connection error. Nothing was charged.'; }
  } finally {
    this._comprandoDinero = false;
    if (fila) fila.style.pointerEvents = '';
  }
}

// Pide al SERVIDOR el cambio de moneda (él valida el saldo y mueve las facturas).
async _exchangeCurrency(direction, amount) {
  try {
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/currency/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, amount })
    });
    if (!res || !res.ok) {
      const e = res ? await res.json().catch(() => ({})) : {};
      console.warn('❌ exchange falló:', e);
      this.notifications && this.notifications.show(`Exchange failed: ${e.error || 'error'}`, 'error');
      return false;
    }
    const data = await res.json();
    if (data.stats) {
      this.moneda       = data.stats.oro;
      this.moneda_plata = data.stats.plata;
      if (window.playerStats) { window.playerStats.oro = data.stats.oro; window.playerStats.plata = data.stats.plata; }
      const l = document.getElementById('info-text-left');
      const r = document.getElementById('info-text-right');
      if (l) l.textContent = `${this.moneda}`;
      if (r) r.textContent = `${this.moneda_plata}`;
    }
    this.notifications && this.notifications.show(`Exchanged ${amount * this.SILVER_PER_GOLD} Silver → ${amount} Gold`, 'success');
    return true;
  } catch (e) {
    console.error('❌ exchange error:', e);
    return false;
  }
}

// Acceso denegado por el control de whitelist/baneos (puerta_login.html).
// Muestra el motivo EN INGLÉS y saca al jugador al login. Se dispara aunque la
// sesión ya estuviera iniciada, porque el backend valida el acceso en cada
// petición (antes solo se comprobaba al hacer login y bastaba con entrar
// directo al juego con la cookie guardada para saltarse el baneo).
_handleAccessDenied(body) {
  if (this._accessDeniedShown) return;
  this._accessDeniedShown = true;

  let msg;
  if (body && body.error === 'banned') {
    const when = body.date ? new Date(body.date).toLocaleString('en-US') : 'unknown date';
    const why  = body.reason && String(body.reason).trim() ? body.reason : 'No reason provided';
    msg = `You are banned since ${when}.\nReason: ${why}`;
  } else if (body && body.error === 'suspended') {
    // Suspensión temporal (3 verificadores fallidos = 3 días, o puesta por un
    // administrador). A diferencia del baneo, ésta caduca sola, así que lo
    // importante es decir CUÁNDO se puede volver a entrar.
    const hasta = body.until || body.date;
    const cuando = hasta ? new Date(hasta).toLocaleString('en-US') : 'an unknown date';
    const why = body.reason && String(body.reason).trim() ? body.reason : 'failed verifiers';
    msg = `Your account is temporarily suspended.\nReason: ${why}\nYou can play again on ${cuando}.`;
  } else {
    msg = 'You are not on the whitelist.\nAccess is currently restricted.';
  }

  try { this.notifications && this.notifications.show(msg, 'error', { duration: 6000 }); } catch (e) {}
  console.warn('⛔ Acceso denegado:', msg);

  // Cerrar sesión completa y volver al login (con el motivo a la vista).
  setTimeout(() => {
    try { this._doFullLogout(); }
    catch (e) { window.location.href = window.GF_LOGIN_URL || 'https://app.grasslandforest.com/?logout=1'; }
  }, 4000);
}

// Y-SORT DE JUGADORES REMOTOS Y SUS PERROS
// -----------------------------------------------------------------------------
// FIX ("paso por encima del perro de otros jugadores"): la profundidad de los
// remotos SOLO se recalculaba dentro de updateOtherPlayer(), es decir cuando
// llegaba un paquete de movimiento. Si el otro jugador estaba QUIETO no llegaban
// paquetes, su perro conservaba un depth viejo (o el de creación) y tu personaje
// —que sí se reordena cada frame— quedaba siempre delante. Ahora los remotos se
// reordenan por la línea de sus pies en cada frame, igual que el jugador local.
_refreshRemoteDepths() {
  const players = this.otherPlayers;
  if (!players) return;
  for (const id in players) {
    const p = players[id];
    if (!p) continue;

    if (p.sprite && p.sprite.active) {
      const feet = p.sprite.y + p.sprite.displayHeight * 0.5;
      p.sprite.setDepth(feet);
      if (p.nameText) p.nameText.setDepth(feet + 1);
    }

    if (p.dog && p.dog.sprite && p.dog.sprite.active) {
      const dogFeet = p.dog.sprite.y + p.dog.sprite.displayHeight * 0.5;
      p.dog.sprite.setDepth(dogFeet);
      if (p.dog.shadowContainer) p.dog.shadowContainer.setDepth(dogFeet - 1);
      if (p.dog.nameText) p.dog.nameText.setDepth(dogFeet + 1);
    }
  }
}

// Zoom con DOS DEDOS sobre el MAPA (móvil). Los listeners van en el canvas del
// juego, así que un gesto que empieza sobre el HUD/paneles (que son DOM encima
// del canvas) NO hace zoom. Se mueve entre los niveles permitidos (0.5/1/2) en
// vez de un zoom continuo, para no reintroducir zooms fraccionarios (causaban
// las costuras entre tiles). preventDefault en touchmove evita además que el
// navegador haga SU propio zoom de página.
_setupPinchZoom() {
  const canvas = this.sys && this.sys.game && this.sys.game.canvas;
  if (!canvas || this._pinchBound) return;
  this._pinchBound = true;

  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let startDist = 0;

  const onStart = (e) => { if (e.touches && e.touches.length === 2) startDist = dist(e.touches); };
  const onMove = (e) => {
    if (!e.touches || e.touches.length !== 2 || !startDist) return;
    e.preventDefault();
    const ratio = dist(e.touches) / startDist;
    if (ratio > 1.25)      { this.preciseZoomIn && this.preciseZoomIn();  startDist = dist(e.touches); }
    else if (ratio < 0.80) { this.preciseZoomOut && this.preciseZoomOut(); startDist = dist(e.touches); }
  };
  const onEnd = (e) => { if (!e.touches || e.touches.length < 2) startDist = 0; };

  canvas.addEventListener('touchstart', onStart, { passive: true });
  canvas.addEventListener('touchmove',  onMove,  { passive: false });
  canvas.addEventListener('touchend',   onEnd,   { passive: true });
  canvas.addEventListener('touchcancel', onEnd,  { passive: true });

  this.events.once('shutdown', () => {
    try {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
    } catch (e) { /* no crítico */ }
    this._pinchBound = false;
  });
}

// Cierre de sesión COMPLETO: cierra la sesión en el backend, DESCONECTA la
// wallet, corta el socket, limpia rastros locales y manda al login.
async _doFullLogout() {
  console.log('🔐 Cerrando sesión completa…');

  // 1) Sesión del backend (logout exige CSRF: se toma de la cookie viva).
  try {
    const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
    const csrf = m ? decodeURIComponent(m[1]) : null;
    await fetch(`${this.serverBase}/api/auth/logout`, {
      method: 'POST', credentials: 'include', mode: 'cors',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {}
    });
  } catch (e) { console.warn('⚠️ logout backend falló:', e); }

  // 2) Desconectar la WALLET (revocar el permiso de cuentas del sitio).
  try {
    const p = window.ethereum;
    if (p && p.request) await p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
  } catch (e) { /* proveedor sin soporte: no es crítico */ }

  // 3) Cortar socket y limpiar cualquier rastro local.
  try { if (this.socket) this.socket.disconnect(); } catch (e) {}
  try { sessionStorage.clear(); localStorage.removeItem('game_session_data'); } catch (e) {}

  // 4) Al login. Se va con ?logout=1 porque el permiso de MetaMask es POR
  //    ORIGEN: revocarlo aquí (game.grasslandforest.com) NO lo revoca en el
  //    login (app.grasslandforest.com). El login ve ese parámetro y revoca
  //    también en su propio origen, así la wallet queda desconectada de verdad.
  const _login = window.GF_LOGIN_URL || 'https://app.grasslandforest.com/';
  window.location.href = _login + (_login.indexOf('?') >= 0 ? '&' : '?') + 'logout=1';
}

// ─── CONSUMIBLES (comer/beber haciendo clic en el personaje) ─────────────────
// Tope de las barras vitales. Vida, agua y comida son porcentajes ENTEROS de
// 0 a 100 — el mismo tope que aplica el backend (VITAL_MAX en server2.js).
VITAL_MAX_CLIENT = 100;

// Cosechas buenas y podridas (dan menos) + el balde con agua.
CONSUMABLES_FOOD = {
  zanahoria_buena: 2, tomate_buena: 5, trigo_buena: 5, calabaza_buena: 5,
  zanahoria_mala: 1, tomate_mala: 2, trigo_mala: 2, calabaza_mala: 2
};
CONSUMABLES_WATER = { balde_con_agua: 20 };

// Devuelve { isWater, gain } si el ítem es consumible, o null.
_consumableInfo(itemId) {
  const isWater = this.CONSUMABLES_WATER[itemId] != null;
  const gain = isWater ? this.CONSUMABLES_WATER[itemId] : (this.CONSUMABLES_FOOD[itemId] || 0);
  return gain ? { isWater, gain } : null;
}

// Clic en el personaje con un consumible: abre el panel de cantidad.
_consumeItemOnPlayer(itemId) {
  const info = this._consumableInfo(itemId);
  if (!info) return;
  if (this._consumingItem) return;
  const available = this.contarItemEnInventario(itemId);
  if (available <= 0) return;
  this._openConsumePanel(itemId, info, available);
}

// Panel (DOM, responsive PC + móvil) para elegir CUÁNTAS unidades consumir.
// Todo se consume en UNA sola transacción (no una por unidad).
_openConsumePanel(itemId, info, available) {
  const old = document.getElementById('gf-consume-modal');
  if (old) old.remove();

  const def = this.ItemDefinitions ? this.ItemDefinitions[itemId] : null;
  const name = (typeof this.getItemDisplayName === 'function' ? this.getItemDisplayName(itemId) : itemId) || itemId;
  const img = def && def.src ? def.src : '';
  const unit = info.isWater ? 'Water' : 'Food';

  // TOPE REAL: agua, comida y vida son porcentajes ENTEROS de 0 a 100. El
  // máximo no puede ser "todo lo que tengas en el inventario": antes, con el
  // agua en 33 y 10 baldes (20 cada uno), el panel dejaba consumir los 10 — la
  // barra se quedaba en 100 igual y los 7 baldes sobrantes se perdían.
  // Ahora el tope son las unidades que de verdad caben.
  const actual = Math.round(Number(info.isWater ? this.aguaPorcentaje : this.comidaPorcentaje) || 0);
  const falta  = Math.max(0, this.VITAL_MAX_CLIENT - actual);
  if (falta <= 0) {
    this.notifications.show(
      (info.isWater ? 'Water' : 'Food') + ' is already full (' + this.VITAL_MAX_CLIENT + '%)',
      'warning'
    );
    return;
  }
  const maxUtiles = Math.ceil(falta / info.gain);          // unidades para llenar
  const max = Math.max(1, Math.min(available, maxUtiles));
  let qty = 1;

  const ov = document.createElement('div');
  ov.id = 'gf-consume-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';

  const card = document.createElement('div');
  card.style.cssText = 'width:min(92vw,380px);box-sizing:border-box;background:rgba(11,61,46,.98);border:3px solid #ffd23f;border-radius:16px;color:#fff;font-family:Arial,sans-serif;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:center;';
  card.innerHTML =
    '<div style="font-size:clamp(15px,4vw,19px);font-weight:bold;margin-bottom:10px;">How many do you want to consume?</div>' +
    (img ? '<img src="' + img + '" alt="" style="width:64px;height:64px;object-fit:contain;image-rendering:pixelated;margin-bottom:6px;">' : '') +
    '<div style="font-size:clamp(13px,3.6vw,16px);margin-bottom:2px;">' + name + '</div>' +
    '<div style="color:#bcd6c9;font-size:clamp(11px,3vw,13px);margin-bottom:12px;">+' + info.gain + ' ' + unit + ' each  ·  Available: ' + available +
      '<br>' + unit + ': ' + actual + '/' + this.VITAL_MAX_CLIENT + '%  ·  max useful: ' + max + '</div>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">' +
      '<button id="gfc-minus" style="width:48px;height:48px;font-size:24px;border-radius:12px;border:none;background:#1b3d31;color:#fff;cursor:pointer;">−</button>' +
      '<input id="gfc-qty" type="number" inputmode="numeric" min="1" max="' + max + '" value="1" style="width:84px;height:48px;text-align:center;font-size:20px;font-weight:bold;border-radius:12px;border:2px solid #ffd23f;background:#0b2b22;color:#fff;">' +
      '<button id="gfc-plus" style="width:48px;height:48px;font-size:24px;border-radius:12px;border:none;background:#1b3d31;color:#fff;cursor:pointer;">+</button>' +
      '<button id="gfc-max" style="height:48px;padding:0 14px;font-size:14px;border-radius:12px;border:none;background:#2b5c4a;color:#fff;cursor:pointer;">Max</button>' +
    '</div>' +
    '<div id="gfc-total" style="color:#ffd23f;font-size:clamp(12px,3.2vw,15px);margin-bottom:14px;"></div>' +
    '<div style="display:flex;gap:12px;justify-content:center;">' +
      '<button id="gfc-ok" style="flex:1;min-height:48px;font-size:16px;font-weight:bold;border:none;border-radius:12px;background:#2e7d32;color:#fff;cursor:pointer;">✓ Consume</button>' +
      '<button id="gfc-no" style="flex:1;min-height:48px;font-size:16px;font-weight:bold;border:none;border-radius:12px;background:#b23b3b;color:#fff;cursor:pointer;">✗ Cancel</button>' +
    '</div>';

  ov.appendChild(card);
  document.body.appendChild(ov);

  const $ = (id) => card.querySelector('#' + id);
  const input = $('gfc-qty');
  const totalEl = $('gfc-total');
  const refresh = () => {
    // Entero siempre: se quita cualquier cosa que no sea dígito (el input
    // type=number deja escribir '1e5', ',' o '.' según el teclado del móvil, y
    // parseInt sobre eso daba cantidades absurdas).
    const limpio = String(input.value).replace(/[^0-9]/g, '');
    qty = Math.max(1, Math.min(max, parseInt(limpio, 10) || 1));
    input.value = qty;
    // El total que se muestra es el que REALMENTE se va a ganar, ya recortado
    // al tope de 100. Así el jugador ve que pasarse no sirve de nada.
    const ganado = Math.min(this.VITAL_MAX_CLIENT - actual, info.gain * qty);
    totalEl.textContent = 'Total: +' + ganado + ' ' + unit +
      '  →  ' + (actual + ganado) + '/' + this.VITAL_MAX_CLIENT + '%  (uses ' + qty + ')';
  };
  const close = () => { ov.remove(); };

  $('gfc-minus').onclick = () => { input.value = qty - 1; refresh(); };
  $('gfc-plus').onclick  = () => { input.value = qty + 1; refresh(); };
  $('gfc-max').onclick   = () => { input.value = max; refresh(); };
  input.oninput = refresh;
  $('gfc-no').onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  $('gfc-ok').onclick = () => { close(); this._doConsume(itemId, qty, info); };
  refresh();
}

// Consume `qty` unidades en UNA sola transacción on-chain y suma el buff total.
async _doConsume(itemId, qty, info) {
  if (this._consumingItem) return;
  this._consumingItem = true;
  try {
    const def = this.ItemDefinitions ? this.ItemDefinitions[itemId] : null;
    let consumed = qty;

    if (def && def.tipo) {
      const antes = this.contarItemEnInventario(itemId);
      try {
        // UNA sola transacción con la cantidad completa.
        await this.ejecutarDivisionRemove(def.tipo, itemId, def.maxStack || 50, qty);
      } catch (e) {
        console.error('❌ Error consumiendo on-chain:', e);
        this.notifications.show('Error consuming the item', 'error');
        return;
      }
      const despues = this.contarItemEnInventario(itemId);
      consumed = Math.max(0, antes - despues);
      if (consumed < 1) {
        this.notifications.show('Item consumption was not confirmed', 'error');
        return;
      }
    } else {
      const ok = await this.removeItemSmart(itemId, qty);
      if (!ok) return;
    }

    // Buff por lo REALMENTE consumido (tope 100). Persiste vía statsSync.
    const total = info.gain * consumed;
    if (info.isWater) {
      this.actualizarBarraAgua(Math.min(100, (this.aguaPorcentaje || 0) + total));
    } else {
      this.actualizarBarraComida(Math.min(100, (this.comidaPorcentaje || 0) + total));
    }
    this.notifications.show('Consumed ' + consumed + ' · +' + total + ' ' + (info.isWater ? 'Water' : 'Food'), 'success');
    this.queuedAction && this.queuedAction({ type: 'forSpam2' });
    // Tutorial (paso 8): en cuanto come o bebe de verdad, se pasa al granjero.
    this._onTutorialConsumed && this._onTutorialConsumed();
  } finally {
    this._consumingItem = false;
  }
}

// =============================================================================
// TRONCOS DE LOS ÁRBOLES TALADOS
// =============================================================================
// Mientras el árbol está en respawn se muestra su tronco EN EL MISMO SPRITE:
// se intercambia la textura en vez de ocultar el árbol y añadir otra imagen
// encima. Motivos:
//   - enableAutoCullingForLayer() recorre estos sprites cada frame y les hace
//     setVisible(), así que ocultar el árbol no funciona (se re-muestra solo).
//   - reutilizar el sprite conserva la posición de Tiled, el depth del Y-sort
//     y la escala de applyTiledProperties, así que el tronco sale del tamaño
//     proporcional al árbol y no del tamaño crudo del png.
// Son métodos de la escena (y no closures dentro de create()) porque
// loadTreeLockStates() también los necesita al recargar la página.
TREE_STUMP_TEXTURES = {
  pinos:    'tronco_pinos_png',
  arbustos: 'tronco_arbusto_png',
  arbolx:   'tronco_arbol_seco_png'
};

getTreeTypeFromSpriteKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('sprite_pinos')) return 'pinos';
  if (key.startsWith('sprite_arbustos')) return 'arbustos';
  if (key.startsWith('sprite_arbolx')) return 'arbolx';
  return null;
}

showTreeStump(treeKey) {
  this.treeStumps = this.treeStumps || {};
  const spr = this[treeKey];
  const type = this.getTreeTypeFromSpriteKey(treeKey);
  const stumpTexture = this.TREE_STUMP_TEXTURES[type];
  if (!spr || !stumpTexture || this.treeStumps[treeKey]) return;
  if (!this.textures.exists(stumpTexture)) {
    console.warn(`No existe la textura del tronco '${stumpTexture}'`);
    return;
  }

  // Guardar textura y posición originales para restaurar el árbol tras el respawn
  this.treeStumps[treeKey] = { texture: spr.texture.key, x: spr.x };

  const treeWidth = spr.displayWidth;
  spr.setTexture(stumpTexture); // setTexture conserva scaleX/scaleY

  // El origin es (0,1): el sprite se ancla por su borde IZQUIERDO. Como el
  // tronco es más angosto que el árbol, sin esta corrección quedaría pegado a
  // la izquierda del hueco. Se centra en el mismo sitio del tilemap.
  spr.x += (treeWidth - spr.displayWidth) / 2;
}

hideTreeStump(treeKey) {
  this.treeStumps = this.treeStumps || {};
  const original = this.treeStumps[treeKey];
  if (!original) return;
  delete this.treeStumps[treeKey];

  const spr = this[treeKey];
  if (spr && spr.active) {
    spr.setTexture(original.texture);
    spr.x = original.x;
  }
}

// =============================================================================
// MINERALES PICADOS: desaparecen y se les quita SU colisión
// =============================================================================
// Se usa alpha 0 en vez de setVisible(false) porque el culling automático
// (enableAutoCullingForLayer) reescribe .visible en cada frame, pero no toca
// el alpha.
//
// La colisión: el mapa no tiene una colisión "por mineral" identificable por
// nombre, solo la lista de rectángulos de la capa 'area_colision_general'
// (this.collisionRectangles). Para no borrar la colisión equivocada, SOLO se
// quitan los rectángulos que quedan COMPLETAMENTE DENTRO del recuadro del
// mineral picado; un muro o una casa que apenas se cruce con él no cumple esa
// condición y no se toca. Si ninguno cumple, no se quita nada (fallo seguro).
// Nunca se tocan collisionRectangles1 / 2 (entradas de tienda y batalla).
hideMinedMineral(mineKey) {
  this.minedMinerals = this.minedMinerals || {};
  const spr = this[mineKey];
  if (!spr || this.minedMinerals[mineKey]) return;

  const b = spr.getBounds();
  const zona = new Phaser.Geom.Rectangle(b.x - 8, b.y - 8, b.width + 16, b.height + 16);

  const quitados = [];
  if (Array.isArray(this.collisionRectangles)) {
    // Recorrido hacia atrás + splice: se MUTA el array original en vez de
    // reasignarlo, porque otras partes (helpers del perro, update del jugador)
    // guardan una referencia directa a él.
    for (let i = this.collisionRectangles.length - 1; i >= 0; i--) {
      const rect = this.collisionRectangles[i];
      if (Phaser.Geom.Rectangle.ContainsRect(zona, rect)) {
        quitados.push(rect);
        this.collisionRectangles.splice(i, 1);
      }
    }
  }

  this.minedMinerals[mineKey] = quitados;
  spr.setAlpha(0);
  console.log(`⛏️ ${mineKey} oculto; colisiones retiradas: ${quitados.length}`);
}

showMinedMineral(mineKey) {
  this.minedMinerals = this.minedMinerals || {};
  const quitados = this.minedMinerals[mineKey];
  if (!quitados) return;
  delete this.minedMinerals[mineKey];

  if (Array.isArray(this.collisionRectangles)) {
    quitados.forEach(rect => this.collisionRectangles.push(rect));
  }
  const spr = this[mineKey];
  if (spr && spr.active) spr.setAlpha(1);
}

// =============================================================================
// BATALLAS P2P DE MASCOTAS: entrada, hub y tabla de clasificación
// =============================================================================

// Se llama desde update(): si el jugador pisa 'area_entrada_batalla'
// (this.collisionRectangles2) se abre el hub de batalla. Se usa un flag para
// abrirlo UNA vez por entrada, no en cada frame que esté encima.
checkBattleEntrance() {
  if (!Array.isArray(this.collisionRectangles2) || !this.player) return;

  const px = this.player.x;
  const py = this.player.y;
  const dentro = this.collisionRectangles2.some(rect =>
    Phaser.Geom.Rectangle.Contains(rect, px, py)
  );

  if (dentro && !this._enZonaBatalla) {
    this._enZonaBatalla = true;
    this.openBattleHub();
  } else if (!dentro && this._enZonaBatalla) {
    this._enZonaBatalla = false;
  }
}

openBattleHub() {
  const overlay = document.getElementById('battleHubOverlay');
  if (!overlay) {
    console.warn('⚠️ No se encontró #battleHubOverlay en el DOM');
    return;
  }

  // Cablear una sola vez (el DOM sobrevive a los cambios de escena)
  if (!overlay._wired) {
    overlay._wired = true;

    const cerrar = () => this.closeBattleHub();
    document.getElementById('battleHubCloseBtn')?.addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });

    document.getElementById('battleHubPvpBtn')?.addEventListener('click', () => {
      this.closeBattleHub();
      this.startPvpBattle();
    });

    document.getElementById('battleHubAdventureBtn')?.addEventListener('click', () => {
      this.closeBattleHub();
      this.startPvpBattle('bot');
    });

    document.getElementById('battleHubRankingBtn')?.addEventListener('click', () => {
      this.closeBattleHub();
      this.openBattleLeaderboard();
    });
  }

  overlay.classList.remove('hidden');
  if (this.input && this.input.keyboard) this.input.keyboard.enabled = false;

  // Cuántas batallas diarias le quedan hoy (lo dice el servidor, no el navegador)
  const sub = document.querySelector('#battleHubAdventureBtn .btn-text small');
  if (sub) sub.textContent = 'Checking your daily battles…';
  if (this.socket && this.socket.connected) {
    // El flag va en el SOCKET (que es global y sobrevive a los reinicios de la
    // escena), no en la escena: si no, cada recreación de GameScene añadiría
    // otro listener sobre el mismo socket y se acumularían.
    if (!this.socket._battleDailyWired) {
      this.socket._battleDailyWired = true;
      this.socket.on('battle:daily', (d) => {
        const s = document.querySelector('#battleHubAdventureBtn .btn-text small');
        if (!s) return;
        s.textContent = d.remaining > 0
          ? `${d.remaining} of ${d.max} left today · next: round ${d.nextRound}`
          : 'Done for today — come back tomorrow';
      });
    }
    this.socket.emit('battle:dailyStatus');
  } else if (sub) {
    sub.textContent = 'Complete the daily challenge';
  }
}

closeBattleHub() {
  document.getElementById('battleHubOverlay')?.classList.add('hidden');
  if (this.input && this.input.keyboard) this.input.keyboard.enabled = true;
}

// Arranca la escena de batalla llevándose lo que hace falta para volver.
// modo: 'pvp' (contra otro jugador) o 'bot' (una de las 5 batallas diarias)
startPvpBattle(modo = 'pvp') {
  try {
    this.savegg && this.savegg();
  } catch (e) { /* el guardado no debe impedir la batalla */ }

  // La escena de batalla la registra app.js/register-scenes.js al arrancar.
  // Si por lo que sea no llegó a registrarse (orden de carga, caché del
  // navegador con la lista de escenas vieja…), se registra aquí mismo a partir
  // de la clase global en vez de dejar al jugador con un "no disponible".
  if (!this.scene.manager.keys['BattleScene']) {
    if (typeof window.BattleScene === 'function') {
      try {
        this.scene.manager.add('BattleScene', window.BattleScene, false);
        console.log('🛠️ BattleScene registrada sobre la marcha');
      } catch (e) {
        console.error('No se pudo registrar BattleScene:', e);
      }
    }
  }

  if (!this.scene.manager.keys['BattleScene']) {
    this.notifications?.show(
      'Battle scene is not loaded. Reload the page (Ctrl+F5); if it persists, Scenes/BattleScene.js is missing on the server.',
      'error'
    );
    return;
  }

  this.scene.start('BattleScene', {
    modo,
    playerName: this.Username || '---',
    petName: this.petName || window.globalPetName || '---',
    address: this.currentAccount || '',
    nivel: this.nivel || 1,
    serverBase: this.serverBase,
    volverA: 'LoadingScenegame'
  });
}

// -----------------------------------------------------------------------------
// TABLA DE CLASIFICACIÓN (todo viene del backend; nada se guarda en el navegador)
// -----------------------------------------------------------------------------
async openBattleLeaderboard() {
  const overlay = document.getElementById('battleRankOverlay');
  if (!overlay) {
    console.warn('⚠️ No se encontró #battleRankOverlay en el DOM');
    return;
  }

  if (!overlay._wired) {
    overlay._wired = true;
    document.getElementById('battleRankCloseBtn')?.addEventListener('click', () => this.closeBattleLeaderboard());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeBattleLeaderboard(); });
    document.getElementById('battleRankRefreshBtn')?.addEventListener('click', () => this.openBattleLeaderboard());
  }

  overlay.classList.remove('hidden');
  if (this.input && this.input.keyboard) this.input.keyboard.enabled = false;

  const cuerpo = document.getElementById('battleRankBody');
  const meta = document.getElementById('battleRankSeason');
  const miFila = document.getElementById('battleRankMe');
  if (cuerpo) cuerpo.innerHTML = '<tr><td colspan="7" class="rank-loading">Loading…</td></tr>';

  try {
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/battle/leaderboard?limit=50`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (meta) {
      const dias = Math.floor(data.season.msRemaining / 86400000);
      const horas = Math.floor((data.season.msRemaining % 86400000) / 3600000);
      meta.textContent = `Season ${data.season.number} · resets in ${dias}d ${horas}h · min ${data.minBattlesForRanking} battles to rank`;
    }

    if (cuerpo) {
      if (!data.rows.length) {
        cuerpo.innerHTML = '<tr><td colspan="7" class="rank-loading">No ranked players yet this season.</td></tr>';
      } else {
        cuerpo.innerHTML = data.rows.map(r => `
          <tr${data.me && r.playerName === data.me.playerName ? ' class="rank-self"' : ''}>
            <td class="rank-pos">${r.rank}</td>
            <td class="rank-name">${this._escapeRankHtml(r.playerName)}</td>
            <td class="rank-pet">${this._escapeRankHtml(r.petName)}</td>
            <td class="rank-addr">${this._escapeRankHtml(this._shortAddr(r.address))}</td>
            <td class="rank-num">${r.points}</td>
            <td class="rank-num">${r.wins}/${r.losses}</td>
            <td class="rank-num">${r.bestStreak}</td>
          </tr>
        `).join('');
      }
    }

    if (miFila) {
      if (data.me) {
        miFila.textContent = data.me.rank
          ? `You: #${data.me.rank} · ${data.me.points} pts · ${data.me.wins}W ${data.me.losses}L`
          : `You: ${data.me.points} pts · ${data.me.missingBattles} more battle(s) to enter the ranking`;
      } else {
        miFila.textContent = '';
      }
    }
  } catch (e) {
    console.error('❌ Error cargando la clasificación:', e);
    if (cuerpo) cuerpo.innerHTML = '<tr><td colspan="7" class="rank-loading">Could not load the leaderboard.</td></tr>';
  }
}

closeBattleLeaderboard() {
  document.getElementById('battleRankOverlay')?.classList.add('hidden');
  if (this.input && this.input.keyboard) this.input.keyboard.enabled = true;
}

_shortAddr(addr) {
  if (!addr || typeof addr !== 'string' || addr.length < 10) return '—';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

_escapeRankHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * ¿Hay agua y comida suficientes para dar un golpe de hacha o de pico?
 *
 * Cada golpe cuesta 1 de agua y 1 de comida, así que hacen falta AMBOS. Se
 * comprueba en dos momentos: nada más tocar el nodo (antes de consultar al
 * servidor) y otra vez justo antes de consumir. Ese doble control es lo que
 * evita el fallo de que el contador subiera a la vez que salía el aviso de
 * "no tienes agua o comida": entre el clic y la respuesta del servidor pasan
 * cientos de milisegundos y la comida se regenera sola, así que sin la
 * comprobación previa un clic entraba con el último punto y el siguiente,
 * ya encolado, se encontraba sin nada.
 *
 * El aviso lleva antirrebote: al picar rápido salían diez avisos idénticos
 * apilados en pantalla.
 *
 * @param {'chop'|'mine'} tarea  solo cambia el texto del aviso
 * @returns {boolean} true si se puede trabajar
 */
_hayRecursosParaTrabajar(tarea) {
  const agua   = Number(this.aguaPorcentaje);
  const comida = Number(this.comidaPorcentaje);

  // Un valor no numérico (stats aún sin cargar) cuenta como "no hay": es
  // preferible bloquear un golpe que dejar pasar uno sin poder cobrarlo.
  const suficiente = Number.isFinite(agua) && Number.isFinite(comida) &&
                     agua >= 1 && comida >= 1;
  if (suficiente) return true;

  const ahora = Date.now();
  if (!this._avisoRecursosEn || (ahora - this._avisoRecursosEn) > 2500) {
    this._avisoRecursosEn = ahora;
    const falta = [];
    if (!Number.isFinite(agua)   || agua   < 1) falta.push('Water');
    if (!Number.isFinite(comida) || comida < 1) falta.push('Food');
    this.notifications.show(
      `Not enough ${falta.join(' and ')} to ${tarea === 'mine' ? 'mine' : 'chop'}`,
      'error'
    );
  }
  return false;
}

/**
 * PROFUNDIDAD DE LOS CARTELES DE LOS NPC
 * ---------------------------------------------------------------------------
 * El jugador, su mascota y los demás jugadores se ordenan por la línea de sus
 * pies (`y + alto/2`), que en este mapa vale unos pocos miles. Poniendo los
 * carteles muy por encima de eso, TODOS pasan por detrás de ellos.
 *
 * Se aplica en un método propio (y no solo al crearlos) porque los carteles se
 * reescriben con setText() cada vez que cambia el idioma, y así basta con
 * volver a llamar aquí para tener la certeza de que la profundidad sigue bien
 * puesta pase lo que pase.
 */
get NPC_LABEL_DEPTH() { return 90000; }

_fijarProfundidadNpcs() {
  ['npcx', 'npcx1', 'npcx2', 'npcx3', 'npcx4', 'npcx5'].forEach(clave => {
    const t = this[clave];
    if (t && typeof t.setDepth === 'function') t.setDepth(this.NPC_LABEL_DEPTH);
  });
}

// Tiempo restante de respawn en inglés: "4m 32s" / "45s"
formatRespawnRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
}

/**
 * BOTÍN 1-3 POR SUERTE (2026-08-03).
 * Cuánto se obtiene al terminar de talar un árbol o picar un mineral: siempre
 * entre 1 y 3 unidades. La herramienta NO cambia el rango, solo la suerte
 * (con hacha/pico de hierro es mucho más fácil que salgan 3).
 * Debe coincidir con rollGatherAmount() del backend (server2.js) para que el
 * modo servidor-autoritativo (GATHER_SERVER) dé exactamente lo mismo.
 *
 * @param {string} toolName  'hacha_de_hierro', 'pico_de_cobre', ...
 * @returns {number} 1, 2 o 3
 */
rollGatherAmount(toolName) {
  const t = String(toolName || '').toLowerCase();
  // [prob de 1, prob de 2, prob de 3]
  let pesos = [0.70, 0.25, 0.05];
  if (t.includes('_madera'))      pesos = [0.70, 0.25, 0.05];
  else if (t.includes('_piedra')) pesos = [0.55, 0.33, 0.12];
  else if (t.includes('_cobre'))  pesos = [0.42, 0.38, 0.20];
  else if (t.includes('_hierro')) pesos = [0.30, 0.40, 0.30];

  const r = Math.random();
  if (r < pesos[0]) return 1;
  if (r < pesos[0] + pesos[1]) return 2;
  return 3;
}

// ============================================================================
// SUBMENÚ DE JUGADOR — clic derecho sobre otro personaje       (2026-08-03)
// ----------------------------------------------------------------------------
// Abre un menú propio de ESE jugador con tres opciones, en inglés:
//   • Profile        → ficha con cartera, tiempo jugado, fecha de creación,
//                      nombre de usuario, skills y más.
//   • Send verifier  → le manda una comprobación rápida de que hay una persona
//                      al teclado; el resultado queda registrado para los
//                      administradores (consola-reportes.html).
//   • Report         → formulario de denuncia con motivo y detalles.
//
// En teléfono no hay clic derecho, así que la misma acción se abre con una
// pulsación larga (600 ms) sobre el personaje.
// Todo el menú es HTML plano encima del canvas: así se ve nítido y se puede
// usar con dedo o con ratón sin depender del zoom de la cámara.
// ============================================================================

_asegurarEstilosMenuJugador() {
  // El id lleva versión: la hoja se inyecta una sola vez y sobrevive a los
  // cambios de escena, así que sin versionarlo una hoja vieja (sin las reglas
  // de la cuenta atrás) bloqueaba para siempre la inyección de la nueva.
  const ID = 'gf-player-menu-styles-v2';
  if (document.getElementById(ID)) return;
  document.querySelectorAll('style[id^="gf-player-menu-styles"]').forEach(el => el.remove());
  const st = document.createElement('style');
  st.id = ID;
  st.textContent = `
    .gf-pm-menu{position:fixed;z-index:100000;min-width:196px;background:linear-gradient(160deg,#161a2e 0%,#101427 100%);
      border:2px solid #4a5aa8;border-radius:12px;padding:8px;box-shadow:0 12px 34px rgba(0,0,0,.6);
      font-family:'PressStart2P',monospace;color:#e8ecff;display:none;}
    .gf-pm-menu.show{display:block;animation:gfPmIn .12s ease-out;}
    @keyframes gfPmIn{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
    .gf-pm-head{font-size:9px;color:#9fb0ff;padding:6px 8px 9px;border-bottom:1px solid #2b3358;
      margin-bottom:6px;word-break:break-word;line-height:1.5;}
    .gf-pm-item{display:flex;align-items:center;gap:9px;width:100%;background:none;border:none;
      color:#e8ecff;font-family:inherit;font-size:10px;text-align:left;padding:10px 9px;border-radius:8px;
      cursor:pointer;transition:background .12s,transform .12s;}
    .gf-pm-item:hover{background:#28305a;transform:translateX(2px);}
    .gf-pm-item.danger{color:#ff9a9a;}
    .gf-pm-item.danger:hover{background:#4a1f27;}
    .gf-pm-ico{font-size:13px;line-height:1;}

    .gf-modal-back{position:fixed;inset:0;background:rgba(4,6,16,.78);z-index:100001;display:flex;
      align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px);}
    .gf-modal{width:min(560px,100%);max-height:88vh;overflow:auto;background:linear-gradient(160deg,#161a2e,#0e1223);
      border:2px solid #4a5aa8;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.7);
      font-family:'PressStart2P',monospace;color:#e8ecff;}
    .gf-modal-h{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:2px solid #2b3358;
      position:sticky;top:0;background:#161a2e;border-radius:14px 14px 0 0;}
    .gf-modal-h h3{margin:0;font-size:12px;flex:1;line-height:1.5;}
    .gf-modal-x{background:none;border:none;color:#ff6b6b;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}
    .gf-modal-b{padding:16px 18px;display:flex;flex-direction:column;gap:12px;}
    .gf-row{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;
      font-size:9px;line-height:1.7;border-bottom:1px dashed #262d4f;padding-bottom:8px;}
    .gf-row span:first-child{color:#8fa0e8;flex:0 0 42%;}
    .gf-row span:last-child{text-align:right;word-break:break-word;flex:1;}
    .gf-chips{display:flex;flex-wrap:wrap;gap:7px;}
    .gf-chip{background:#212949;border:1px solid #39447a;border-radius:20px;padding:6px 11px;font-size:8px;color:#cdd6ff;}
    .gf-modal-f{padding:14px 18px;border-top:2px solid #2b3358;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}
    .gf-btn{font-family:inherit;font-size:10px;padding:11px 18px;border-radius:10px;cursor:pointer;
      border:2px solid #5a6ac0;background:linear-gradient(140deg,#39448a,#2a3168);color:#fff;transition:filter .15s;}
    .gf-btn:hover{filter:brightness(1.25);}
    .gf-btn.ghost{background:none;border-color:#39447a;color:#a9b4e6;}
    .gf-btn.danger{border-color:#a04a55;background:linear-gradient(140deg,#7d2b36,#5a1e27);}
    .gf-btn:disabled{opacity:.5;cursor:not-allowed;filter:none;}
    .gf-field{display:flex;flex-direction:column;gap:7px;font-size:9px;color:#8fa0e8;}
    .gf-field select,.gf-field textarea,.gf-field input{font-family:inherit;font-size:10px;color:#e8ecff;
      background:#0d1122;border:2px solid #333c6c;border-radius:9px;padding:11px;outline:none;}
    .gf-field textarea{min-height:92px;resize:vertical;line-height:1.6;}
    .gf-note{font-size:8px;color:#8f9ac4;line-height:1.7;}

    /* Cuenta atrás del verificador (15 s) */
    .gf-countdown{display:flex;flex-direction:column;gap:8px;align-items:center;
      background:#0d1122;border:2px solid #333c6c;border-radius:12px;padding:14px;}
    .gf-countdown-num{font-size:26px;color:#8fd0ff;letter-spacing:1px;}
    .gf-countdown-bar{width:100%;height:9px;background:#070a16;border-radius:20px;overflow:hidden;}
    .gf-countdown-bar > span{display:block;height:100%;background:linear-gradient(90deg,#5a8bff,#8fd0ff);
      border-radius:20px;transition:width .1s linear;}
    .gf-countdown.urgent{border-color:#a04a55;}
    .gf-countdown.urgent .gf-countdown-num{color:#ff9a9a;}
    .gf-countdown.urgent .gf-countdown-bar > span{background:linear-gradient(90deg,#d1483f,#ff9a9a);}
    @media (max-width:600px){
      .gf-modal-h h3{font-size:10px;}
      .gf-row{font-size:8px;flex-direction:column;gap:2px;}
      .gf-row span:last-child{text-align:left;}
      .gf-btn{flex:1;min-width:120px;}
    }
  `;
  document.head.appendChild(st);
}

/** Clave con la que el backend puede identificar a ese jugador. */
_claveJugadorRemoto(playerId) {
  const p = this.otherPlayers && this.otherPlayers[playerId];
  if (!p) return null;
  return p._address || p._playerName || p._displayName || null;
}

_habilitarMenuJugador(playerId, sprite) {
  if (!sprite) return;
  try { sprite.setInteractive({ useHandCursor: true }); } catch (_) { return; }

  // Ventana del doble toque y cuánto se puede mover el dedo entre los dos.
  const DOBLE_TOQUE_MS = 420;
  const DOBLE_TOQUE_PX = 40;

  // Área de toque generosa: el sprite del personaje es estrecho y con el dedo
  // se falla mucho. Se amplía 18 px por lado sin mover el dibujo.
  try {
    const w = sprite.width || 32, h = sprite.height || 48;
    sprite.input.hitArea = new Phaser.Geom.Rectangle(-18, -18, w + 36, h + 36);
  } catch (_) { /* si no se puede ampliar, se queda el área normal */ }

  sprite.on('pointerdown', (pointer) => this._procesarToqueJugador(playerId, pointer));
}

/**
 * Decide qué hacer al tocar/pulsar sobre otro jugador.
 *
 *  • Ratón: el botón derecho abre el menú directamente.
 *  • Táctil (y clic izquierdo): DOS TOQUES seguidos sobre el mismo personaje.
 *    En el móvil no hay clic derecho, y la pulsación larga chocaba con el
 *    movimiento del personaje (mantener pulsado es caminar), así que casi
 *    nunca llegaba a abrirse. El doble toque es un gesto claro y no interfiere.
 *
 * Está en un método aparte —y no dentro del handler del sprite— porque lo
 * llaman DOS caminos: el input del propio sprite y el detector de respaldo de
 * la escena (_activarDeteccionToqueJugadores). Con uno solo de los dos el menú
 * no llegaba a abrirse si algo se colaba por encima del sprite.
 */
_procesarToqueJugador(playerId, pointer) {
  const DOBLE_TOQUE_MS = 600;   // margen amplio: con el dedo se tarda más
  const DOBLE_TOQUE_PX = 70;    // el personaje puede moverse entre los dos toques

  if (!this.otherPlayers || !this.otherPlayers[playerId]) return;

  // Anti-rebote: el sprite y el detector de la escena pueden avisar del MISMO
  // toque. Sin esto, un solo toque contaría como dos y el menú se abriría al
  // primer contacto.
  const ahora = Date.now();
  if (this._pmUltimoEvento && (ahora - this._pmUltimoEvento) < 60) return;
  this._pmUltimoEvento = ahora;

  // ── Ratón: el botón derecho abre el menú directamente ──────────────────
  if (pointer && typeof pointer.rightButtonDown === 'function' && pointer.rightButtonDown()) {
    this._abrirMenuJugador(playerId, pointer);
    return;
  }

  const esTactil = !!(pointer && (pointer.wasTouch || pointer.pointerType === 'touch'));
  const x = pointer ? pointer.x : 0;
  const y = pointer ? pointer.y : 0;

  this._pmUltimoToque = this._pmUltimoToque || {};
  const previo = this._pmUltimoToque[playerId];

  const esDoble = previo &&
    (ahora - previo.t) < DOBLE_TOQUE_MS &&
    (Math.abs(x - previo.x) + Math.abs(y - previo.y)) < DOBLE_TOQUE_PX;

  if (esDoble) {
    this._pmUltimoToque[playerId] = null;
    const ev = (pointer && pointer.event) ? pointer.event : { clientX: x, clientY: y };
    this._abrirMenuJugador(playerId, { event: ev });
    return;
  }

  this._pmUltimoToque[playerId] = { t: ahora, x, y };

  // Pista solo en táctil: en PC el clic derecho ya es evidente y un aviso en
  // cada clic sería ruido.
  if (esTactil) {
    const jugador = this.otherPlayers[playerId];
    const nombre = (jugador && jugador._displayName) || 'this player';
    if (!this._pmPistaMostradaEn || (ahora - this._pmPistaMostradaEn) > 5000) {
      this._pmPistaMostradaEn = ahora;
      this.notifications && this.notifications.show(
        `Tap ${nombre} again to open the player menu`, 'info', { icon: '👆' }
      );
    }
  }
}

/**
 * Detector de respaldo a nivel de ESCENA.
 *
 * El input del sprite puede no llegar a dispararse: basta con que otro objeto
 * interactivo quede por encima, con que el plugin del joystick se coma el
 * evento en el móvil, o con que el sprite se recree en un paquete de
 * movimiento. Este detector mira, en cada toque, si el punto cayó sobre algún
 * jugador remoto y llama al mismo método. Un solo cálculo por toque.
 */
_activarDeteccionToqueJugadores() {
  if (this._pmDeteccionEscenaLista) return;
  this._pmDeteccionEscenaLista = true;

  this.input.on('pointerdown', (pointer) => {
    if (!this.otherPlayers) return;
    // Si el menú ya está abierto, este toque es para el menú, no para abrirlo.
    if (document.getElementById('gf-player-menu')) return;

    let mundo;
    try { mundo = this.cameras.main.getWorldPoint(pointer.x, pointer.y); }
    catch (_) { return; }

    let elegido = null;
    let mejorDistancia = Infinity;

    for (const id in this.otherPlayers) {
      const p = this.otherPlayers[id];
      if (!p || !p.sprite || !p.sprite.active || !p.sprite.visible) continue;

      const anchoMitad = (p.sprite.displayWidth  || 32) * 0.5 + 18;
      const altoMitad   = (p.sprite.displayHeight || 64) * 0.5 + 18;
      const dx = Math.abs(mundo.x - p.sprite.x);
      const dy = Math.abs(mundo.y - p.sprite.y);
      if (dx > anchoMitad || dy > altoMitad) continue;

      const d = dx + dy;
      if (d < mejorDistancia) { mejorDistancia = d; elegido = id; }
    }

    if (elegido) this._procesarToqueJugador(elegido, pointer);
  });
}

_abrirMenuJugador(playerId, pointer) {
  const jugador = this.otherPlayers && this.otherPlayers[playerId];
  if (!jugador) return;

  this._asegurarEstilosMenuJugador();
  this._cerrarMenuJugador();

  const nombre = jugador._displayName || 'Player';
  const menu = document.createElement('div');
  menu.className = 'gf-pm-menu';
  menu.id = 'gf-player-menu';

  const head = document.createElement('div');
  head.className = 'gf-pm-head';
  head.textContent = nombre;
  menu.appendChild(head);

  const opciones = [
    { icono: '👤', texto: 'Profile',       accion: () => this._mostrarPerfilJugador(playerId) },
    { icono: '🛡️', texto: 'Send verifier', accion: () => this._enviarVerificador(playerId) },
    { icono: '🚩', texto: 'Report',        accion: () => this._abrirReporteJugador(playerId), peligro: true }
  ];

  opciones.forEach(op => {
    const b = document.createElement('button');
    b.className = 'gf-pm-item' + (op.peligro ? ' danger' : '');
    b.type = 'button';
    const i = document.createElement('span');
    i.className = 'gf-pm-ico';
    i.textContent = op.icono;
    const t = document.createElement('span');
    t.textContent = op.texto;
    b.appendChild(i); b.appendChild(t);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._cerrarMenuJugador();
      op.accion();
    });
    menu.appendChild(b);
  });

  document.body.appendChild(menu);
  menu.classList.add('show');

  // Colocarlo junto al puntero, sin salirse de la pantalla.
  const ev = pointer && pointer.event ? pointer.event : null;
  const px = ev && typeof ev.clientX === 'number' ? ev.clientX : window.innerWidth / 2;
  const py = ev && typeof ev.clientY === 'number' ? ev.clientY : window.innerHeight / 2;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(px, window.innerWidth  - r.width  - 8)) + 'px';
  menu.style.top  = Math.max(8, Math.min(py, window.innerHeight - r.height - 8)) + 'px';

  // Cerrar al tocar fuera o con ESC.
  this._pmCerrarFuera = (e) => { if (!menu.contains(e.target)) this._cerrarMenuJugador(); };
  this._pmCerrarEsc = (e) => { if (e.key === 'Escape') this._cerrarMenuJugador(); };
  setTimeout(() => {
    document.addEventListener('pointerdown', this._pmCerrarFuera, true);
    document.addEventListener('keydown', this._pmCerrarEsc);
  }, 0);
}

_cerrarMenuJugador() {
  const m = document.getElementById('gf-player-menu');
  if (m) m.remove();
  if (this._pmCerrarFuera) {
    document.removeEventListener('pointerdown', this._pmCerrarFuera, true);
    this._pmCerrarFuera = null;
  }
  if (this._pmCerrarEsc) {
    document.removeEventListener('keydown', this._pmCerrarEsc);
    this._pmCerrarEsc = null;
  }
}

/** Ventana genérica reutilizada por perfil, reporte y verificador. */
_crearModal(titulo, { cuerpo, botones } = {}) {
  this._asegurarEstilosMenuJugador();

  const back = document.createElement('div');
  back.className = 'gf-modal-back';

  const modal = document.createElement('div');
  modal.className = 'gf-modal';

  const head = document.createElement('div');
  head.className = 'gf-modal-h';
  const h = document.createElement('h3');
  h.textContent = titulo;
  const x = document.createElement('button');
  x.className = 'gf-modal-x';
  x.type = 'button';
  x.textContent = '×';
  x.addEventListener('click', () => back.remove());
  head.appendChild(h); head.appendChild(x);

  const body = document.createElement('div');
  body.className = 'gf-modal-b';
  if (cuerpo) body.appendChild(cuerpo);

  modal.appendChild(head);
  modal.appendChild(body);

  if (Array.isArray(botones) && botones.length) {
    const pie = document.createElement('div');
    pie.className = 'gf-modal-f';
    botones.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'gf-btn' + (b.clase ? ' ' + b.clase : '');
      btn.type = 'button';
      btn.textContent = b.texto;
      btn.addEventListener('click', () => b.accion(back, btn));
      pie.appendChild(btn);
    });
    modal.appendChild(pie);
  }

  back.appendChild(modal);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  return { back, body };
}

_filaPerfil(etiqueta, valor) {
  const fila = document.createElement('div');
  fila.className = 'gf-row';
  const a = document.createElement('span'); a.textContent = etiqueta;
  const b = document.createElement('span'); b.textContent = (valor === null || valor === undefined || valor === '') ? '—' : String(valor);
  fila.appendChild(a); fila.appendChild(b);
  return fila;
}

async _mostrarPerfilJugador(playerId) {
  const clave = this._claveJugadorRemoto(playerId);
  const jugador = this.otherPlayers && this.otherPlayers[playerId];
  const nombre = (jugador && jugador._displayName) || 'Player';

  const contenedor = document.createElement('div');
  const cargando = document.createElement('div');
  cargando.className = 'gf-note';
  cargando.textContent = 'Loading profile…';
  contenedor.appendChild(cargando);

  const { back } = this._crearModal(`Profile — ${nombre}`, {
    cuerpo: contenedor,
    botones: [{ texto: 'Close', clase: 'ghost', accion: (b) => b.remove() }]
  });

  if (!clave) {
    cargando.textContent = "This player's account could not be identified.";
    return;
  }

  try {
    const res = await this.fetchWithTokenRetry(
      `${this.serverBase}/api/player/profile/${encodeURIComponent(clave)}`,
      { method: 'GET' }
    );
    if (!res.ok) {
      cargando.textContent = res.status === 404
        ? 'That player has no public profile yet.'
        : 'Profile is not available right now.';
      return;
    }
    const data = await res.json();
    const p = data.profile || {};
    if (!back.isConnected) return;

    contenedor.textContent = '';
    contenedor.appendChild(this._filaPerfil('Username',      p.username && p.username !== '---' ? p.username : p.playerName));
    contenedor.appendChild(this._filaPerfil('Account',       p.playerName));
    contenedor.appendChild(this._filaPerfil('Wallet',        p.address || '—'));
    contenedor.appendChild(this._filaPerfil('Status',        p.online ? '🟢 Online' : '⚪ Offline'));
    contenedor.appendChild(this._filaPerfil('Level',         `Lv. ${p.nivel || 0} (${p.exp || 0} exp)`));
    contenedor.appendChild(this._filaPerfil('Pet',           `${p.petName || '---'} — Lv. ${p.petLevel || 1}`));
    contenedor.appendChild(this._filaPerfil('Play time',     p.jugado || '—'));
    contenedor.appendChild(this._filaPerfil('Sessions',      p.sesiones || 0));
    contenedor.appendChild(this._filaPerfil('Account created', p.creadoEn ? new Date(p.creadoEn).toLocaleString() : '—'));
    contenedor.appendChild(this._filaPerfil('Account age',   p.antiguedad || '—'));
    contenedor.appendChild(this._filaPerfil('Last seen',     p.ultimaVez ? new Date(p.ultimaVez).toLocaleString() : '—'));
    contenedor.appendChild(this._filaPerfil('Gold / Silver', `${p.oro || 0} GL · ${p.plata || 0} SL`));

    const skills = p.skills && typeof p.skills === 'object' ? p.skills : {};
    const clavesSkill = Object.keys(skills).filter(k => typeof skills[k] === 'number');
    const tituloSkills = document.createElement('div');
    tituloSkills.className = 'gf-note';
    tituloSkills.style.marginTop = '6px';
    tituloSkills.textContent = clavesSkill.length ? 'Skills' : 'Skills — none recorded yet';
    contenedor.appendChild(tituloSkills);

    if (clavesSkill.length) {
      const chips = document.createElement('div');
      chips.className = 'gf-chips';
      clavesSkill.forEach(k => {
        const c = document.createElement('span');
        c.className = 'gf-chip';
        const bonito = k.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
        c.textContent = `${bonito}: ${skills[k]}`;
        chips.appendChild(c);
      });
      contenedor.appendChild(chips);
    }
  } catch (e) {
    console.warn('No se pudo cargar el perfil:', e);
    cargando.textContent = 'Connection error while loading the profile.';
  }
}

async _enviarVerificador(playerId) {
  const clave = this._claveJugadorRemoto(playerId);
  const jugador = this.otherPlayers && this.otherPlayers[playerId];
  const nombre = (jugador && jugador._displayName) || 'that player';
  if (!clave) {
    this.notifications.show("That player's account could not be identified", 'error');
    return;
  }

  try {
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/verifier/send`, {
      method: 'POST',
      body: JSON.stringify({ target: clave })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const mensajes = {
        verifier_cooldown: `You can send another verifier in ${data.secondsRemaining || 60}s`,
        player_not_found: 'That player has no account on record',
        cannot_verify_yourself: "You can't send a verifier to yourself",
        verifier_already_pending: `${nombre} already has a verifier waiting to be answered`
      };
      this.notifications.show(mensajes[data.error] || 'The verifier could not be sent', 'error');
      return;
    }

    const segundos = Number(data.seconds) || 15;
    this.notifications.show(
      data.delivered
        ? `Verifier sent to ${nombre} — they have ${segundos}s to answer`
        : `Verifier registered — ${nombre} is offline right now`,
      'success',
      { icon: '🛡️' }
    );
  } catch (e) {
    console.warn('Error enviando verificador:', e);
    this.notifications.show('Connection error while sending the verifier', 'error');
  }
}

_abrirReporteJugador(playerId) {
  const clave = this._claveJugadorRemoto(playerId);
  const jugador = this.otherPlayers && this.otherPlayers[playerId];
  const nombre = (jugador && jugador._displayName) || 'Player';
  if (!clave) {
    this.notifications.show("That player's account could not be identified", 'error');
    return;
  }

  const cuerpo = document.createElement('div');
  cuerpo.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const campoMotivo = document.createElement('label');
  campoMotivo.className = 'gf-field';
  campoMotivo.appendChild(Object.assign(document.createElement('span'), { textContent: 'Reason' }));
  const select = document.createElement('select');
  [
    ['botting', 'Botting / automation'],
    ['cheating', 'Cheating / exploiting'],
    ['harassment', 'Harassment or abuse'],
    ['scam', 'Scam or fraud'],
    ['spam', 'Spam / chat flooding'],
    ['inappropriate_name', 'Inappropriate name'],
    ['exploit_abuse', 'Abusing a game bug'],
    ['other', 'Other']
  ].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    select.appendChild(o);
  });
  campoMotivo.appendChild(select);

  const campoDetalle = document.createElement('label');
  campoDetalle.className = 'gf-field';
  campoDetalle.appendChild(Object.assign(document.createElement('span'), { textContent: 'Details (optional)' }));
  const textarea = document.createElement('textarea');
  textarea.maxLength = 1000;
  textarea.placeholder = 'What happened? Where and when?';
  campoDetalle.appendChild(textarea);

  const nota = document.createElement('div');
  nota.className = 'gf-note';
  nota.textContent = 'Your report goes to the moderation team along with your name, the reported player and your position on the map. False reports may be penalised.';

  cuerpo.appendChild(campoMotivo);
  cuerpo.appendChild(campoDetalle);
  cuerpo.appendChild(nota);

  this._crearModal(`Report — ${nombre}`, {
    cuerpo,
    botones: [
      { texto: 'Cancel', clase: 'ghost', accion: (back) => back.remove() },
      {
        texto: 'Send report',
        clase: 'danger',
        accion: async (back, btn) => {
          btn.disabled = true;
          btn.textContent = 'Sending…';
          try {
            const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/reports`, {
              method: 'POST',
              body: JSON.stringify({
                target: clave,
                reason: select.value,
                details: textarea.value,
                scene: 'GameScene',
                x: Math.round(this.player ? this.player.x : 0),
                y: Math.round(this.player ? this.player.y : 0)
              })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              const mensajes = {
                report_cooldown: 'You already reported that player recently',
                cannot_report_yourself: "You can't report yourself",
                player_not_found: 'That player has no account on record'
              };
              this.notifications.show(mensajes[data.error] || 'The report could not be sent', 'error');
              btn.disabled = false;
              btn.textContent = 'Send report';
              return;
            }
            back.remove();
            this.notifications.show('Report sent to the moderation team', 'success', { icon: '🚩' });
          } catch (e) {
            console.warn('Error enviando reporte:', e);
            this.notifications.show('Connection error while sending the report', 'error');
            btn.disabled = false;
            btn.textContent = 'Send report';
          }
        }
      }
    ]
  });
}

/**
 * Escucha por socket lo que llega del sistema de verificadores y de la
 * moderación. Se llama una sola vez al preparar los eventos de la escena.
 */
_registrarEventosModeracion() {
  if (!this.socket || this._eventosModeracionListos) return;
  this._eventosModeracionListos = true;

  // Alguien me mandó un verificador: hay que contestarlo ANTES DE QUE ACABE
  // LA CUENTA ATRÁS (15 s por defecto, lo dice el servidor en `expiresIn`).
  // Dejarlo pasar cuenta como fallo, igual que contestar mal, y tres fallos
  // son 3 días de suspensión — por eso la ventana avisa de las dos cosas.
  this.socket.on('verifierChallenge', (data) => {
    if (!data || !data.id) return;

    const segundosTotales = Math.max(5, Number(data.expiresIn) || 15);
    const fallosParaSuspender = Number(data.failsToSuspend) || 3;
    const diasSuspension = Number(data.suspendDays) || 3;

    const cuerpo = document.createElement('div');
    cuerpo.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    const aviso = document.createElement('div');
    aviso.className = 'gf-note';
    aviso.textContent =
      `${data.from || 'A player'} sent you a verifier to confirm a real person is playing. ` +
      `Answer within ${segundosTotales} seconds. ` +
      `${fallosParaSuspender} failed or ignored verifiers = ${diasSuspension}-day account suspension.`;

    // ── Cuenta atrás: número grande + barra que se vacía ─────────────────
    // Los estilos van TAMBIÉN en línea, no solo por clase: la ventana es lo
    // único que le dice al jugador cuánto le queda, y si por lo que sea la
    // hoja inyectada no llegó a aplicarse, el reloj tiene que verse igual.
    const relojCaja = document.createElement('div');
    relojCaja.className = 'gf-countdown';
    relojCaja.style.cssText =
      'display:flex;flex-direction:column;gap:8px;align-items:center;' +
      'background:#0d1122;border:2px solid #333c6c;border-radius:12px;padding:14px;';

    const relojNum = document.createElement('div');
    relojNum.className = 'gf-countdown-num';
    relojNum.style.cssText = 'font-size:26px;color:#8fd0ff;letter-spacing:1px;font-family:inherit;';
    relojNum.textContent = `${segundosTotales}s`;

    const relojBarra = document.createElement('div');
    relojBarra.className = 'gf-countdown-bar';
    relojBarra.style.cssText =
      'width:100%;height:9px;background:#070a16;border-radius:20px;overflow:hidden;';

    const relojRelleno = document.createElement('span');
    relojRelleno.style.cssText =
      'display:block;height:100%;width:100%;border-radius:20px;' +
      'background:linear-gradient(90deg,#5a8bff,#8fd0ff);transition:width .1s linear;';

    relojBarra.appendChild(relojRelleno);
    relojCaja.appendChild(relojNum);
    relojCaja.appendChild(relojBarra);

    const campo = document.createElement('label');
    campo.className = 'gf-field';
    campo.appendChild(Object.assign(document.createElement('span'), { textContent: data.question || '?' }));
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';       // teclado numérico en el teléfono
    input.pattern = '[0-9]*';
    input.autocomplete = 'off';
    input.maxLength = 4;
    campo.appendChild(input);

    cuerpo.appendChild(aviso);
    cuerpo.appendChild(relojCaja);
    cuerpo.appendChild(campo);

    let enviado = false;
    let tickId = null;
    const finaliza = Date.now() + segundosTotales * 1000;

    const enviar = async (back, btn) => {
      if (enviado) return;
      enviado = true;
      if (tickId) { clearInterval(tickId); tickId = null; }
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/verifier/answer`, {
          method: 'POST',
          body: JSON.stringify({ id: data.id, answer: input.value })
        });
        const r = await res.json().catch(() => ({}));
        if (back && back.isConnected) back.remove();

        if (r.status === 'passed') {
          this.notifications.show('Verifier passed ✅', 'success');
        } else if (r.suspended) {
          this.notifications.show(
            `Verifier failed ❌ — your account has been suspended for ${diasSuspension} days`,
            'error'
          );
        } else {
          const restantes = Math.max(0, fallosParaSuspender - (Number(r.fails) || 0));
          this.notifications.show(
            `Verifier failed ❌ — ${restantes} more failure(s) will suspend your account`,
            'error'
          );
        }
      } catch (_) {
        enviado = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Answer'; }
        this.notifications.show('Could not send the answer', 'error');
      }
    };

    const { back } = this._crearModal('Verifier', {
      cuerpo,
      botones: [{
        texto: 'Answer',
        accion: (b, btn) => enviar(b, btn)
      }]
    });

    // La cuenta atrás refresca 10 veces por segundo para que la barra se vea
    // suave, pero el número solo cambia cuando cambia el segundo.
    // El título de la ventana también lleva los segundos: si el jugador tiene
    // la ventana medio tapada por el teclado del móvil, sigue viendo el tiempo.
    const tituloEl = back.querySelector('.gf-modal-h h3');

    tickId = setInterval(() => {
      const restanteMs = finaliza - Date.now();
      const restanteS = Math.max(0, Math.ceil(restanteMs / 1000));
      relojNum.textContent = `${restanteS}s`;
      relojRelleno.style.width = Math.max(0, (restanteMs / (segundosTotales * 1000)) * 100) + '%';
      if (tituloEl) tituloEl.textContent = `Verifier — ${restanteS}s left`;

      const urgente = restanteS <= 5;
      relojCaja.classList.toggle('urgent', urgente);
      // Los colores de urgencia también en línea, por si la hoja no aplicó.
      relojNum.style.color = urgente ? '#ff9a9a' : '#8fd0ff';
      relojCaja.style.borderColor = urgente ? '#a04a55' : '#333c6c';
      relojRelleno.style.background = urgente
        ? 'linear-gradient(90deg,#d1483f,#ff9a9a)'
        : 'linear-gradient(90deg,#5a8bff,#8fd0ff)';

      if (restanteMs <= 0) {
        clearInterval(tickId);
        tickId = null;
        if (enviado) return;
        // Se manda igualmente lo que haya escrito: el servidor lo marcará
        // como fuera de plazo y el jugador ve el resultado real, en vez de
        // quedarse con una ventana muerta en pantalla.
        enviar(back, null);
      }
    }, 100);

    // Si la ventana se cierra a mano, se para el reloj (el servidor lo dará
    // por vencido igualmente cuando acabe el plazo).
    const observador = setInterval(() => {
      if (!back.isConnected) {
        clearInterval(observador);
        if (tickId) { clearInterval(tickId); tickId = null; }
      }
    }, 500);

    // Enter envía, cómodo en PC.
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(back, null); });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 60);
  });

  // El plazo se acabó sin contestar: el servidor ya lo contó como fallo.
  this.socket.on('verifierTimeout', (data) => {
    if (!data) return;
    if (data.suspended) return; // ya llega 'accountSuspended' con el detalle
    const restantes = Math.max(0, (Number(data.failsToSuspend) || 3) - (Number(data.fails) || 0));
    this.notifications.show(
      `You ran out of time on a verifier ⌛ — ${restantes} more failure(s) will suspend your account`,
      'warning'
    );
  });

  // Suspensión temporal: el servidor ya cerró el socket.
  this.socket.on('accountSuspended', (data) => {
    const cuerpo = document.createElement('div');
    const p = document.createElement('div');
    p.className = 'gf-note';
    p.style.fontSize = '10px';
    const hasta = data && data.until ? new Date(data.until) : null;
    p.textContent =
      `Your account has been suspended for ${(data && data.days) || 3} day(s). ` +
      `Reason: ${(data && data.reason) || 'failed verifiers'}.` +
      (hasta && !isNaN(hasta) ? ` You can play again on ${hasta.toLocaleString()}.` : '');
    cuerpo.appendChild(p);
    this._crearModal('Account suspended', {
      cuerpo,
      botones: [{ texto: 'Close', clase: 'danger', accion: () => { window.location.reload(); } }]
    });
  });

  // Resultado del verificador que YO mandé.
  this.socket.on('verifierResult', (data) => {
    if (!data) return;
    const textos = {
      passed: `${data.player || 'The player'} passed the verifier ✅`,
      failed: `${data.player || 'The player'} failed the verifier ❌`,
      expired: `${data.player || 'The player'} let the verifier expire ⌛`
    };
    this.notifications.show(textos[data.status] || 'Verifier answered', data.status === 'passed' ? 'success' : 'warning');
  });

  // Advertencia de un administrador.
  this.socket.on('moderationWarning', (data) => {
    const cuerpo = document.createElement('div');
    const p = document.createElement('div');
    p.className = 'gf-note';
    p.style.fontSize = '10px';
    p.textContent = (data && data.body) || 'You received a warning from the moderation team.';
    cuerpo.appendChild(p);
    this._crearModal((data && data.subject) || 'Official warning', {
      cuerpo,
      botones: [{ texto: 'I understand', accion: (back) => back.remove() }]
    });
  });

  // Baneo: el servidor ya cierra el socket, aquí solo se explica por qué.
  this.socket.on('accountBanned', (data) => {
    const cuerpo = document.createElement('div');
    const p = document.createElement('div');
    p.className = 'gf-note';
    p.style.fontSize = '10px';
    p.textContent = `This account has been banned. Reason: ${(data && data.reason) || 'rule violation'}.`;
    cuerpo.appendChild(p);
    this._crearModal('Account banned', {
      cuerpo,
      botones: [{ texto: 'Close', clase: 'danger', accion: () => { window.location.reload(); } }]
    });
  });
}

/**
 * Aplica propiedades de Tiled al sprite
 */
applyTiledProperties(sprite, obj) {
  // ESCALADO (optimizado)
  if (obj.width && obj.height) {
    // Usar setDisplaySize (más eficiente que setScale para renderizado)
    sprite.setDisplaySize(obj.width, obj.height);
  }
  
  // ROTACIÓN
  if (obj.rotation !== undefined) {
    sprite.rotation = Phaser.Math.DegToRad(obj.rotation);
  }
  
  // FLIPS
  if (obj.flippedHorizontal !== undefined) {
    sprite.flipX = obj.flippedHorizontal;
  }
  
  if (obj.flippedVertical !== undefined) {
    sprite.flipY = obj.flippedVertical;
  }
  
  // Guardar datos originales
  sprite.setData('tiledX', obj.x);
  sprite.setData('tiledY', obj.y);
  sprite.setData('tiledWidth', obj.width);
  sprite.setData('tiledHeight', obj.height);
}

/**
 * Desactiva actualizaciones innecesarias del sprite
 */
disableUnnecessaryUpdates(sprite) {
  // Phaser 3.60+ - Marcar como estático para batch rendering
  if (sprite.preUpdate) {
    sprite.preUpdate = () => {}; // No hacer preUpdate
  }
  
  if (sprite.update) {
    sprite.update = () => {}; // No hacer update
  }
  
  if (sprite.postUpdate) {
    sprite.postUpdate = () => {}; // No hacer postUpdate
  }
}

/**
 * Optimiza capas con muchos objetos usando Static Group
 */
optimizeLayerIfNeeded(scene, layerName, objectCount) {
  // Solo optimizar si hay más de 10 objetos
  if (objectCount <= 10) return;
  
  // Buscar todos los sprites de esta capa
  const layerSprites = [];
  
  // Recorrer propiedades de la escena que coincidan con el patrón
  Object.keys(scene).forEach(key => {
    const value = scene[key];
    if (value && value.type === 'Image' && value.getData('optimized')) {
      layerSprites.push(value);
    }
  });
  
  // Si hay suficientes sprites, crear un Static Group
  if (layerSprites.length >= 5) {
    const groupKey = `${layerName}_STATIC_GROUP`;
    
    if (!scene[groupKey]) {
      scene[groupKey] = scene.add.group({
        classType: Phaser.GameObjects.Image,
        maxSize: layerSprites.length * 2,
        runChildUpdate: false // CRÍTICO: Desactiva updates individuales
      });
      
      // Añadir todos los sprites al grupo
      layerSprites.forEach(sprite => {
        if (!scene[groupKey].contains(sprite)) {
          scene[groupKey].add(sprite);
        }
      });
      
      console.log(`⚡ ${layerName}: Optimizado con Static Group (${layerSprites.length} sprites)`);
    }
  }
}

/**
 * Sistema de culling automático (OPCIONAL - activar solo si hay lag)
 */
enableAutoCullingForLayer(scene, layerName) {
  // Crear grupo si no existe
  const groupKey = `${layerName}_STATIC_GROUP`;
  let group = scene[groupKey];
  
  if (!group) {
    // Buscar sprites manualmente
    const layerSprites = [];
    Object.keys(scene).forEach(key => {
      const value = scene[key];
      if (value && value.type === 'Image' && 
          key.includes(layerName.replace('_', '').toLowerCase())) {
        layerSprites.push(value);
      }
    });
    
    if (layerSprites.length === 0) return;
    
    group = scene.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: layerSprites.length,
      runChildUpdate: false
    });
    
    layerSprites.forEach(sprite => group.add(sprite));
    scene[groupKey] = group;
  }
  
  // ── Culling automático (reescrito: causaba stutter y repintado) ───────────
  // Antes: (1) comparaba contra camera.getBounds(), que son los límites del
  // MAPA (setBounds(0,0,mapW,mapH)) y no lo que se ve → el resultado era
  // SIEMPRE visible, o sea no culleaba nada; (2) recorría TODOS los sprites de
  // las 6 capas CADA frame llamando getBounds() en cada uno (matriz + objeto
  // nuevo por sprite y frame = basura de GC y tirones); y (3) llamaba
  // setVisible() en cada sprite cada frame aunque el valor no cambiara, lo que
  // marca el objeto como "sucio" y fuerza repintado constante.
  //
  // Ahora: se compara contra camera.worldView (lo realmente visible) con un
  // margen amplio (sin pop-in), se cachea el rectángulo de cada sprite (son
  // imágenes estáticas), se salta el barrido si la cámara casi no se movió y
  // solo se escribe setVisible() cuando el valor CAMBIA.
  let lastCheck = 0;
  const CHECK_INTERVAL = 100; // ms (antes 16.6 = cada frame)
  const CULL_PAD = 512;       // margen generoso: el objeto ya está dibujado antes de entrar en cuadro
  let lastCamX = null, lastCamY = null;

  // El manejador se guarda para poder quitarlo en cleanupScene sin recurrir a
  // removeAllListeners() (que rompía los listeners internos de Phaser).
  const alActualizar = () => {
    // FIX (pantalla negra al volver de la batalla): si el grupo, la cámara o
    // el reloj ya no existen (escena a medio recrear o apagándose), NO se debe
    // lanzar una excepción aquí: al ser un listener de 'update', un throw corta
    // TODO el update() de ese frame —incluido el streaming de tiles del
    // TileManager— y el mapa se queda en negro. Se sale en silencio.
    if (!scene || !scene.time || !scene.cameras || !scene.cameras.main) return;
    if (!group || !group.children || typeof group.children.iterate !== 'function') return;

    const now = scene.time.now;
    if (now - lastCheck < CHECK_INTERVAL) return;
    lastCheck = now;

    const camera = scene.cameras.main;
    const view = camera.worldView;
    if (!view || view.width === 0) return;

    // Si la cámara apenas se movió, no hay nada que recalcular.
    if (lastCamX !== null &&
        Math.abs(view.x - lastCamX) < 16 && Math.abs(view.y - lastCamY) < 16) return;
    lastCamX = view.x; lastCamY = view.y;

    const left   = view.x - CULL_PAD;
    const right  = view.x + view.width  + CULL_PAD;
    const top    = view.y - CULL_PAD;
    const bottom = view.y + view.height + CULL_PAD;

    group.children.iterate(sprite => {
      if (!sprite || !sprite.active) return;

      // Rect cacheado (las imágenes de estas capas son estáticas). Se recalcula
      // solo si el sprite se movió (p. ej. showTreeStump recoloca el tronco).
      let r = sprite._cullRect;
      if (!r || r.sx !== sprite.x || r.sy !== sprite.y) {
        const b = sprite.getBounds();
        r = sprite._cullRect = {
          sx: sprite.x, sy: sprite.y,
          x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height
        };
      }

      const isVisible = (r.x < right && r.r > left && r.y < bottom && r.b > top);
      // Solo escribir cuando cambia: evita marcar el objeto sucio cada frame.
      if (sprite.visible !== isVisible) sprite.setVisible(isVisible);
    });
  };

  scene.events.on('update', alActualizar);
  scene._cullingHandlers = scene._cullingHandlers || [];
  scene._cullingHandlers.push(alActualizar);
}


tokenValido(token) {
  if (!token) return false;
  try {
    const payloadBase64 = token.split('.')[1];
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);
    const exp = payload.exp;
    const ahora = Math.floor(Date.now() / 1000);
    return exp > ahora;
  } catch (err) {
    console.error("Token inválido:", err);
    return false;
  }
}



getPositionPercent(objectX, objectY) {
  
  const camWidth = this.cameras.main.width;
  const camHeight = this.cameras.main.height;
  const percentX = (objectX / camWidth) * 100;
  const percentY = (objectY / camHeight) * 100;

  return {
    percentX: percentX.toFixed(2), // por ejemplo: 42.68
    percentY: percentY.toFixed(2)
  };
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















actualizarImagenJugador(imgSrc) {
  document.getElementById('player-image').src = imgSrc;
}
actualizarNombreUsuario(nombre) {
  document.getElementById('username').textContent = nombre;
}
actualizarBarraVida(porcentaje) {
  porcentaje = Math.round(porcentaje);
  this.vidaPorcentaje = porcentaje;

  const _shouldSyncVidaGS = this._statsReady && 
    !(porcentaje === 0 && window.playerStats && (window.playerStats.vida || 0) > 0);
  if (_shouldSyncVidaGS && this.statsSync) this.statsSync.set('vida', porcentaje);
  if (_shouldSyncVidaGS && window.playerStats) window.playerStats.vida = porcentaje;

  const healthBar = document.getElementById('health-bar');
  const fill = healthBar.querySelector('.status-fill');
  const text = healthBar.querySelector('.status-text');
  const levelElement = document.getElementById('player-level');
  
  fill.style.width = porcentaje + '%';
  
  if (this.lenguaje === 1) {
    text.textContent = `Life ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 2) {
    text.textContent = `Life ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 3) {
    text.textContent = `Vida ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 4) {
    text.textContent = `Vida ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 5) {
    text.textContent = `生命 ${porcentaje}%`;
    levelElement.textContent = `等级 ${this.nivel}`;
  } else if (this.lenguaje === 6) {
    text.textContent = `생명 ${porcentaje}%`;
    levelElement.textContent = `레벨 ${this.nivel}`;
  }
  
  this.queuedAction({ type: 'forSpam2'});
}

actualizarBarraAgua(porcentaje) {
  porcentaje = Math.round(porcentaje);
  this.aguaPorcentaje = porcentaje;

  const _shouldSyncAguaGS = this._statsReady && 
    !(porcentaje === 0 && window.playerStats && (window.playerStats.agua || 0) > 0);
  if (_shouldSyncAguaGS && this.statsSync) this.statsSync.set('agua', porcentaje);
  if (_shouldSyncAguaGS && window.playerStats) window.playerStats.agua = porcentaje;

  const waterBar = document.getElementById('water-bar');
  const fill = waterBar.querySelector('.status-fill');
  const text = waterBar.querySelector('.status-text');
  const levelElement = document.getElementById('player-level');
  
  fill.style.width = porcentaje + '%';
  
  if (this.lenguaje === 1) {
    text.textContent = `Water ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 2) {
    text.textContent = `Water ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 3) {
    text.textContent = `Agua ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 4) {
    text.textContent = `Água ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 5) {
    text.textContent = `水 ${porcentaje}%`;
    levelElement.textContent = `等级 ${this.nivel}`;
  } else if (this.lenguaje === 6) {
    text.textContent = `물 ${porcentaje}%`;
    levelElement.textContent = `레벨 ${this.nivel}`;
  }
  
  this.queuedAction({ type: 'forSpam2'});
}

actualizarBarraComida(porcentaje) {
  porcentaje = Math.round(porcentaje);
  this.comidaPorcentaje = porcentaje;

  const _shouldSyncComidaGS = this._statsReady && 
    !(porcentaje === 0 && window.playerStats && (window.playerStats.comida || 0) > 0);
  if (_shouldSyncComidaGS && this.statsSync) this.statsSync.set('comida', porcentaje);
  if (_shouldSyncComidaGS && window.playerStats) window.playerStats.comida = porcentaje;

  const foodBar = document.getElementById('food-bar');
  const fill = foodBar.querySelector('.status-fill');
  const text = foodBar.querySelector('.status-text');
  const levelElement = document.getElementById('player-level');
  
  fill.style.width = porcentaje + '%';
  
  if (this.lenguaje === 1) {
    text.textContent = `Food ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 2) {
    text.textContent = `Food ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 3) {
    text.textContent = `Comida ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 4) {
    text.textContent = `Comida ${porcentaje}%`;
    levelElement.textContent = `Lv. ${this.nivel}`;
  } else if (this.lenguaje === 5) {
    text.textContent = `食物 ${porcentaje}%`;
    levelElement.textContent = `等级 ${this.nivel}`;
  } else if (this.lenguaje === 6) {
    text.textContent = `음식 ${porcentaje}%`;
    levelElement.textContent = `레벨 ${this.nivel}`;
  }
  
  this.queuedAction({ type: 'forSpam2'});
}














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



















getPlayerIntentDirection() {
  const left  = this.cursors?.left?.isDown || this.keys?.A?.isDown || false;
  const right = this.cursors?.right?.isDown || this.keys?.D?.isDown || false;
  const up    = this.cursors?.up?.isDown || this.keys?.W?.isDown || false;
  const down  = this.cursors?.down?.isDown || this.keys?.S?.isDown || false;

  // Prioridad horizontal para la mirada
  if (left && !right) return 'left';
  if (right && !left) return 'right';

  // Vertical si no hay horizontal
  if (up && !down) return 'up';
  if (down && !up) return 'down';

  return null;
}




  update(time, delta) {
    // Reposicionar burbuja local sobre el sprite del jugador
    if (this._isTyping || (document.getElementById('local-chat-bubble') && document.getElementById('local-chat-bubble').style.display !== 'none')) {
      const b = document.getElementById('local-chat-bubble');
      if (b && b.style.display !== 'none') this._positionLocalBubble(b);
    }
    if (!this.keys) return;

    // GUARD DE RECONSTRUCCIÓN DE ESCENA.
    // create() es async y Phaser REUTILIZA la instancia de la escena: al volver
    // de una batalla, update() empieza a correr mientras create() todavía está
    // esperando, con los sprites de la sesión anterior YA destruidos. Como
    // Phaser no pone a null las referencias al destruir (solo les quita
    // `scene`), this.player seguía siendo un objeto y todo el update reventaba
    // frame tras frame — la pantalla se quedaba en negro.
    // Mientras el jugador no esté vivo, no hay nada que actualizar.
    if (!this.player || !this.player.scene) return;

    // Actualizar tiles visibles cada frame
    if (this.tileManagerMapa) {
      this.tileManagerMapa.updateVisible(this.cameras.main);
    }

    // Zona 'area_entrada_batalla': abre el hub de batallas P2P al pisarla
    this.checkBattleEntrance();


    if (this.ii === 1) {

      const result = this.getPositionPercent(this.cameras.main.width * 96.70 / 100, this.cameras.main.height * 28.13 / 100);
      console.log(`%X: ${result.percentX}% , %Y: ${result.percentY}%`);
      this.ii = 2;
      
    }



    // ver cambios de resolucion de pantalla
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;


    


/*
    if (newWidth !== this.currentWidth || newHeight !== this.currentHeight) {
      this.currentWidth = newWidth;
      this.currentHeight = newHeight;
      console.log(`Ventana cambió a: ${newWidth}x${newHeight}`);


        }

        */

  
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

        // NOTA: La animación YA NO se decide aquí. Antes este bloque llamaba a
        // this.player.anims.play(...) usando el input crudo (dx/dy), y MÁS ABAJO
        // el bloque de resolución de colisiones (blockedX/blockedY) volvía a
        // llamar a anims.play(...) con una dirección distinta cuando el jugador
        // quedaba bloqueado en un eje. Como ambos bloques se ejecutan en el mismo
        // frame y usan Phaser.Animation.play(key, true) [ignoreIfPlaying], cuando
        // las dos direcciones no coincidían (ej: colisión a la derecha + tecla
        // arriba) la animación se reiniciaba en el frame 0 en cada update() y
        // nunca avanzaba -> parecía que "no había animación". Cuando coincidían
        // (ej: colisión arriba + tecla derecha) no había conflicto y se veía bien.
        // Ahora solo guardamos la intención cruda; la animación final se decide
        // UNA sola vez, después de resolver colisiones, más abajo.
        this._rawMoveDx = dx;
        this._rawMoveDy = dy;
    }
    
    // Enviar movimiento del jugador (si es que tienes multiplayer)
    if (typeof this.sendPlayerMovement === 'function') {
        this.sendPlayerMovement();
    }

    // Y-sorting: depth = posición de los PIES del jugador para comparar correctamente
    // con los árboles que usan setOrigin(0,1) y tienen su depth en la base del tronco.
    // El jugador usa origin (0.5, 0.5), por lo que player.y es el CENTRO.
    // Los pies están en player.y + displayHeight/2.
    const playerFeetY = this.player.y + this.player.displayHeight * 0.5;
    this.player.setDepth(playerFeetY);
    if (this.usuariox) this.usuariox.setDepth(playerFeetY + 1);

    // Y-sort de los jugadores REMOTOS y sus perros (cada frame).
    this._refreshRemoteDepths();
    
    // Limpiar jugadores inactivos
    if (typeof this.cleanInactivePlayers === 'function') {
        this.cleanInactivePlayers();
    }

    // Y-SORT PROFESIONAL (one-shot): cuando las colisiones del mapa ya están
    // cargadas, calibrar la profundidad de los edificios con su línea real de
    // pared. Se ejecuta una única vez por vida de la escena.
    if (!this._buildingDepthsCalibrated &&
        ((Array.isArray(this.collisionRectangles) && this.collisionRectangles.length) ||
         (Array.isArray(this.collisionRectangles1) && this.collisionRectangles1.length))) {
      this._buildingDepthsCalibrated = true;
      this.calibrateBuildingDepths();
    }

    // Obtener las coordenadas en el mapa
    const mapX = Math.floor(this.player.x / this.map.tileWidth); // Coordenada X en tiles
    const mapY = Math.floor(this.player.y / this.map.tileHeight); // Coordenada Y en tiles

// ============ MASCOTA (PERRO) – UPDATE COMPLETO, MIRADA CORREGIDA, ANIMACIÓN ESTABLE Y EVASIÓN DE COLISIONES ============
const dog = this.dog;
const player = this.player;

// If pet was removed by player, keep it hidden and skip all dog update logic
if (this.petData && this.petData.equipped === false) {
  if (dog && dog.sprite && dog.sprite.visible) dog.sprite.setVisible(false);
  if (dog && dog.shadowContainer && dog.shadowContainer.visible) dog.shadowContainer.setVisible(false);
  if (this.dogNameText && this.dogNameText.visible) this.dogNameText.setVisible(false);
  // Skip rest of update for this frame
} else {

if (!dog || !dog.sprite || !player) return;

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
// Lado de esquive preferido por la evasión anticipada (+1 / -1 / 0 = ninguno).
// Se recuerda entre frames para rodear el obstáculo por un solo lado en vez
// de zigzaguear.
if (dog.avoidSide === undefined) dog.avoidSide = 0;

const now = this.time.now;
const FOLLOW_OFFSET = 70;

// Teclas opcionales
const _chatBlk = this._chatInputFocused === true;
const leftPressed  = !_chatBlk && (this.cursors?.left?.isDown  || this.keys?.A?.isDown || false);
const rightPressed = !_chatBlk && (this.cursors?.right?.isDown || this.keys?.D?.isDown || false);
const upPressed    = !_chatBlk && (this.cursors?.up?.isDown    || this.keys?.W?.isDown || false);
const downPressed  = !_chatBlk && (this.cursors?.down?.isDown  || this.keys?.S?.isDown || false);
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
// Antes el perro solo REACCIONABA al chocar: proponía el paso, colisionaba y
// resolveDogMove buscaba por dónde salir — se veía cómo se pegaba al
// obstáculo y luego se deslizaba. Ahora MIRA HACIA ADELANTE en la línea hacia
// su objetivo: si detecta que el camino directo va a chocar en los próximos
// pasos, desvía el objetivo hacia un costado (perpendicular al rumbo) ANTES
// de tocar el obstáculo, y recuerda el lado elegido (dog.avoidSide) para
// rodearlo por un solo lado sin zigzaguear. resolveDogMove queda como red de
// seguridad final.
const computeSteeredTarget = () => {
  const dx = dog.targetX - dog.x;
  const dy = dog.targetY - dog.y;
  const dist = Math.hypot(dx, dy);

  // Muy cerca del objetivo: no hay nada que anticipar
  if (dist < 6) {
    dog.avoidSide = 0;
    return { x: dog.targetX, y: dog.targetY };
  }

  const nx = dx / dist;
  const ny = dy / dist;

  // Sondear el camino directo por delante del perro (sin pasarse del objetivo)
  const LOOKAHEAD_STEPS = [14, 28, 42];
  let blockedAt = -1;
  for (const d of LOOKAHEAD_STEPS) {
    if (d > dist + 8) break;
    if (collidesAt(dog.x + nx * d, dog.y + ny * d)) { blockedAt = d; break; }
  }

  // Camino libre: seguir directo y olvidar el lado de esquive
  if (blockedAt < 0) {
    dog.avoidSide = 0;
    return { x: dog.targetX, y: dog.targetY };
  }

  // Camino bloqueado más adelante: buscar un punto de desvío lateral.
  // Perpendicular al rumbo (px,py); se prueba primero el lado ya elegido en
  // frames anteriores para mantener un rodeo coherente.
  const px = -ny;
  const py = nx;
  const sides = dog.avoidSide !== 0 ? [dog.avoidSide, -dog.avoidSide] : [1, -1];

  for (const side of sides) {
    for (const lateral of [26, 40, 54]) {
      const cx = dog.x + nx * Math.min(blockedAt, 24) + px * lateral * side;
      const cy = dog.y + ny * Math.min(blockedAt, 24) + py * lateral * side;

      // El punto de desvío y el tramo intermedio hacia él deben estar libres
      if (!collidesAt(cx, cy) &&
          !collidesAt(dog.x + (cx - dog.x) * 0.5, dog.y + (cy - dog.y) * 0.5)) {
        dog.avoidSide = side;
        return { x: cx, y: cy };
      }
    }
  }

  // Ningún desvío lateral libre: dejar que resolveDogMove haga lo que pueda
  dog.avoidSide = 0;
  return { x: dog.targetX, y: dog.targetY };
};

const steerTarget = computeSteeredTarget();

// Movimiento suave
const DOG_LERP = 0.08;
// Al esquivar (steerTarget ≠ target), un lerp sobre una distancia más corta
// haría al perro más lento justo cuando necesita rodear; se compensa un poco.
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

// GUARD: si dog.sprite se destruyó/no existe, saltar TODO el render del perro.
//
// OJO con la condición: `if (dog.sprite)` NO basta. Phaser, al destruir un
// objeto, NO pone la referencia a null: solo le quita `scene` y `sys`. Así que
// el sprite muerto sigue siendo un objeto (truthy), pasaba el guard y reventaba
// dentro de setTexture con "Cannot read properties of undefined (reading 'sys')"
// en CADA frame — la escena se quedaba en negro al volver de una batalla.
// `sprite.scene` es lo que de verdad distingue un sprite vivo de uno destruido.
if (dog.sprite && dog.sprite.scene) {

if (shouldAnimate && (dogMoved || playerMoved || intentDir)) {
  const animKey = (dog.lastFacing === 'left') ? 'perro_left' : 'perro_right';

  // Solo reinicia si cambió la animación.
  // FIX (pantalla negra al volver de la batalla): al reiniciar la escena el
  // perro puede estar a medio recrear y dog.sprite.anims llegar undefined. El
  // acceso a .isPlaying lanzaba un TypeError EN CADA FRAME dentro de update(),
  // y como update() se cortaba ahí, todo lo que venía después (incluido el
  // seguimiento de cámara) dejaba de ejecutarse y el mapa se veía en negro.
  if (dog.sprite.anims && (!dog.sprite.anims.isPlaying || dog.sprite.anims.currentAnim?.key !== animKey)) {
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
  if (dog.isMoving || (dog.sprite.anims && dog.sprite.anims.isPlaying)) {
    if (dog.sprite.anims) dog.sprite.anims.stop();
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

// Etiqueta de la mascota (nombre y/o nivel): sigue al perro, sobre su cabeza.
// Este bloque corre en cada frame, así que la condición de aquí manda sobre lo
// que ponga _updateDogNameLabel: si exigiera nombre, el nivel de una mascota
// sin nombrar volvería a ocultarse en el frame siguiente.
if (this.dogNameText) {
  if (dog.sprite.visible) {
    this.dogNameText.setVisible(true);
    this.dogNameText.setPosition(dog.x, dog.y - dog.sprite.displayHeight * 0.5 - 4);
    this.dogNameText.setDepth(dogFeetY + 1);
  } else {
    this.dogNameText.setVisible(false);
  }
}

} // cierre del GUARD if (dog.sprite)

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

    // poniendo nombre de usuario

    
    this.usuariox.setText(this.Username);
    this.usuariox.setPosition(this.player.x, this.player.y - 60);
    this.shadowContainer.setPosition(this.player.x, this.player.y + 45); // ajustar a los pies
    

    


    // Comprueba la colisión entre el rectángulo del jugador y cada rectángulo de la capa de colisión.
    // Asegúrate de que 'this.collisionRectangles' contiene cada rectángulo de la capa (por ejemplo, extraídos de Tiled)

    // Reglas para colisión: se prueba por eje para que el jugador no quede trabado
    // al moverse lateralmente junto a árboles u otros obstáculos.
    const playerHitbox = (x, y) => {
      return new Phaser.Geom.Rectangle(x - 15, y + 25, 30, 15);
    };

    const collidesWithAny = (rect, rectArray) => {
      if (!Array.isArray(rectArray)) return false;

      return rectArray.some(obstacle => {
        return obstacle && Phaser.Geom.Intersects.RectangleToRectangle(rect, obstacle);
      });
    };

    const prevX = this.previousPosition?.x ?? this.player.x;
    const prevY = this.previousPosition?.y ?? this.player.y;

    const nextX = this.player.x;
    const nextY = this.player.y;

    // Probar colisión solo en X
    const rectX = playerHitbox(nextX, prevY);
    const blockedX =
      collidesWithAny(rectX, this.collisionRectangles) ||
      collidesWithAny(rectX, this.collisionRectangles1);

    if (blockedX) {
      this.player.x = prevX;
    }

    // Probar colisión solo en Y
    const rectY = playerHitbox(this.player.x, nextY);
    const blockedY =
      collidesWithAny(rectY, this.collisionRectangles) ||
      collidesWithAny(rectY, this.collisionRectangles1);

    if (blockedY) {
      this.player.y = prevY;
    }

    // ===== Decisión ÚNICA de animación del jugador para este frame =====
    // Se calcula acá, después de resolver colisiones por eje (blockedX/blockedY),
    // usando el desplazamiento REAL ya corregido (this.player.x/y vs prevX/prevY).
    // Esto reemplaza tanto la animación "cruda" del bloque de teclado (arriba)
    // como la vieja lógica de "slide animation", evitando que dos bloques
    // distintos llamen a anims.play() con direcciones distintas en el mismo
    // frame (eso era lo que congelaba la animación al colisionar en diagonal).
    {
      const finalDx = this.player.x - prevX;
      const finalDy = this.player.y - prevY;
      const EPS = 0.05;
      const movingX = Math.abs(finalDx) > EPS;
      const movingY = Math.abs(finalDy) > EPS;

      const mouseActive = !!(this.mouseMovement && this.mouseMovement.followCursorActive);

      if (mouseActive) {
        // ── MODO MOUSE: solo existen 2 animaciones ──
        //   · 'right' cubre: derecha, derecha+arriba y derecha+abajo
        //   · 'left'  cubre: izquierda, izquierda+arriba e izquierda+abajo
        // Las animaciones 'up'/'down' NUNCA se usan en este modo.
        // La mirada sale de la INTENCIÓN hacia el cursor (directionX), no del
        // desplazamiento real: así, si una colisión bloquea la horizontal
        // pero se sigue avanzando en vertical (ej. choco a la derecha yendo
        // derecha+arriba con el mouse), la animación 'right' sigue
        // reproduciéndose en vez de quedarse detenida.
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
          // Sin desplazamiento real (llegó al cursor o bloqueado en ambos
          // ejes): idle mirando hacia el lado del cursor.
          this.player.anims.stop();
          this.lastDirection = facing;
          this.player.setTexture(facing === 'left' ? 'player_left_1' : 'player_right_1');
        }
      } else if (!movingX && !movingY) {
        // Ni X ni Y se movieron realmente (input suelto, o bloqueado en ambos
        // ejes -ej. atascado contra una esquina/otro personaje-): mostrar idle.
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
        // Prioridad horizontal (igual que el comportamiento original al
        // caminar libremente), pero usando el eje que REALMENTE se movió.
        // Así, si la colisión bloqueó la horizontal pero la vertical sigue
        // libre (ej: choco a la derecha y presiono derecha+arriba), movingX
        // será false y se animará 'up' correctamente; y viceversa.
        const animKey = movingX ? (finalDx < 0 ? 'left' : 'right')
                                 : (finalDy < 0 ? 'up' : 'down');
        this.lastDirection = animKey;
        const currentKey = this.player.anims.currentAnim?.key;
        if (!this.player.anims.isPlaying || currentKey !== animKey) {
          this.player.anims.play(animKey, true);
        }
      }
    }


    // ── PUERTA DE LA TIENDA ──────────────────────────────────────────────────
    // Esto se evalúa en CADA frame, así que necesita dos candados:
    //
    //  • _puertaArmada: la puerta no dispara hasta que el jugador haya SALIDO
    //    de su rectángulo al menos una vez. Al volver de la tienda apareces en
    //    (1552,1531), que cae sobre la zona de la puerta, así que el primer
    //    frame de GameScene te mandaba de vuelta a la tienda al instante — el
    //    "salgo de tiendajuego y me regresa a tiendajuego". Empieza desarmada.
    //
    //  • _cambiandoEscena: scene.stop() y scene.start() no surten efecto hasta
    //    el final del paso actual, así que sin esto el mismo forEach (o el
    //    frame siguiente) podía lanzar la transición dos veces.
    const _tocandoPuerta = this.collisionRectangles1.some(r =>
      r && Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, r));
    if (!_tocandoPuerta) this._puertaArmada = true;

    this.collisionRectangles1.forEach(rect1 => {
      if (_tocandoPuerta && this._puertaArmada && !this._cambiandoEscena &&
          Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, rect1)) {
        console.log("¡Colisión detectada!");
        this._puertaArmada   = false;
        this._cambiandoEscena = true;
        // Soltar el ítem que se llevara en la mano ANTES de irse: el div del
        // arrastre es DOM compartido y se quedaría pegado al cursor en la
        // escena nueva, con su casilla de origen vacía.
        this._cancelarArrastre();
        this.player.anims.stop();

        this.inicio = 1;

        // aparicion del personaje
        if (this.inicio == 1) {
          this.scene.stop();
          //this.player.setPosition(430, 432);  // Usar setPosition en lugar de asignación directa
          this.posicionplayerx = 1041;
          this.posicionplayery = 1778;
          this.inicio = 0;
          this.mundo = 2;
          
              this.savegg();
              this.saveTimer = 0;

            // ocultando todo
            
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
            const _srGL = this._statsReady; this._statsReady = false;
            this.actualizarBarraVida(0);
            this.actualizarBarraAgua(0);
            this.actualizarBarraComida(0);
            this._statsReady = _srGL;

            // Ocultar chat y contenedor del HUD extendido

            document.getElementById('hub').classList.add('hidden');
            document.getElementById('quick-slots-bar').classList.add('hidden');
            document.getElementById('open-chat-btn').classList.add('hidden');


            // ocultar coodenadas

            document.getElementById('game-ui-text').style.display = 'none';

            // ocultando barra de correr
            
            //document.getElementById("yellow-bar-container").style.display = "none";

            // ocultando hora y fecha

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
              // Los quita _unbindAllDomClicks, que sabe exactamente qué handler
              // se puso en cada elemento. Los removeEventListener por índice que
              // había aquí no quitaban nada: para cuando corrían, este método
              // ya había clonado los botones y this.roundButtons apuntaba a los
              // nodos viejos, sueltos del documento.
              this._unbindAllDomClicks();

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


        this.cleanupScene();
        this.scene.start("LoadingSceneshop");

      }
    });



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
        this.speed = 4;
        this.player.anims.msPerFrame = 111;
      } else {
        
        this.speed = 4.5;
        this.player.anims.msPerFrame = 65;

      }

    } else {
      document.getElementById("yellow-bar-container").style.display = "none";
      this.speed = 3.6;
      this.player.anims.msPerFrame = 100;
    }
      */
      //document.getElementById("yellow-bar-container").style.display = "none";
      this.speed = 240;
      this.player.anims.msPerFrame = 100;

    //document.querySelector('#quest-button .quest-text').textContent = Math.round(this.progress * 100) + '%';



    //document.getElementById('game-ui-text').textContent = `Coordinates : ${this.player.x.toFixed(2)} Y: ${this.player.y.toFixed(2)} | Mapa: X: ${mapX} Y: ${mapY}`;

    /*
      if (!this.lastFpsTime) this.lastFpsTime = 0;
    this.lastFpsTime += delta;
    
    if (this.lastFpsTime >= 1000) { // Cada 1000ms (1 segundo)
        const fps = Math.round(1000 / delta);
        console.log(`🎮 FPS: ${fps} | Delta: ${delta.toFixed(2)}ms`);
        this.lastFpsTime = 0;
    }

    */
   this.npcx1.setPosition(this.sprite_npc1.x + 20, this.sprite_npc1.y - 120);
   this.npcx2.setPosition(this.sprite_npc2.x + 20, this.sprite_npc2.y - 120);
   this.npcx3.setPosition(this.sprite_npc3.x + 20, this.sprite_npc3.y - 120);
   this.npcx4.setPosition(this.sprite_npc4.x + 20, this.sprite_npc4.y - 120);
   this.npcx5.setPosition(this.sprite_npc5.x + 25, this.sprite_npc5.y - 120);
  
  




   // actualizacion de lenguaje

   if (this.panelactualizacion === 1) {
    
    this.updateLanguage();

    this.panelactualizacion = 0;
    
   }

  
  
  }

  updateLanguage() {

  // 1. FUNCIÓN PARA CAMBIAR TÍTULO DE INVENTARIO
  function cambiarTituloInventario(nuevoTitulo) {
      const tituloInventario = document.querySelector('#inventory-panel .letrainv');
      if (tituloInventario) {
          tituloInventario.textContent = nuevoTitulo;
          console.log(`Título de inventario cambiado a: ${nuevoTitulo}`);
      } else {
          console.warn('No se encontró el elemento de título del inventario');
      }
  }

  // 2. FUNCIÓN PARA CAMBIAR TÍTULO DE REPUTACIÓN
  function cambiarTituloReputacion(nuevoTitulo) {
      const tituloReputacion = document.querySelector('#hudReputacion h2');
      if (tituloReputacion) {
          tituloReputacion.textContent = nuevoTitulo;
          console.log(`Título de reputación cambiado a: ${nuevoTitulo}`);
      } else {
          console.warn('No se encontró el elemento de título de reputación');
      }
  }

  // 3. FUNCIÓN PARA CAMBIAR TÍTULO DE ESTADÍSTICAS
  function cambiarTituloEstadisticas(nuevoTitulo) {
      const tituloEstadisticas = document.querySelector('#hudEstadisticas h2');
      if (tituloEstadisticas) {
          tituloEstadisticas.textContent = nuevoTitulo;
          console.log(`Título de estadísticas cambiado a: ${nuevoTitulo}`);
      } else {
          console.warn('No se encontró el elemento de título de estadísticas');
      }
  }

  // 4. FUNCIÓN PARA CAMBIAR TÍTULO DE LIBRO DE REQUERIMIENTOS
  function cambiarTituloRequerimientos(nuevoTitulo) {
      const tituloRequerimientos = document.querySelector('#hudEstadisticas_1 .hud-title_1');
      if (tituloRequerimientos) {
          tituloRequerimientos.textContent = nuevoTitulo;
          console.log(`Título de requerimientos cambiado a: ${nuevoTitulo}`);
      } else {
          console.warn('No se encontró el elemento de título de requerimientos');
      }
  }

  // 5. FUNCIÓN PARA CAMBIAR TÍTULO DE CONFIGURACIONES
  function cambiarTituloConfiguraciones(nuevoTitulo) {
      const tituloConfiguraciones = document.querySelector('#hub-panel_101 .title_101');
      if (tituloConfiguraciones) {
          tituloConfiguraciones.textContent = nuevoTitulo;
          console.log(`Título de configuraciones cambiado a: ${nuevoTitulo}`);
      } else {
          console.warn('No se encontró el elemento de título de configuraciones');
      }
  }

  // 6. FUNCIÓN PARA CAMBIAR TODOS LOS TÍTULOS A LA VEZ
  function cambiarTodosLosTitulos(config) {
      if (config.inventario) cambiarTituloInventario(config.inventario);
      if (config.reputacion) cambiarTituloReputacion(config.reputacion);
      if (config.estadisticas) cambiarTituloEstadisticas(config.estadisticas);
      if (config.requerimientos) cambiarTituloRequerimientos(config.requerimientos);
      if (config.configuraciones) cambiarTituloConfiguraciones(config.configuraciones);
  }
    // actualizando barras

    this.actualizarBarraVida(this.vidaPorcentaje);
    this.actualizarBarraAgua(this.aguaPorcentaje);
    this.actualizarBarraComida(this.comidaPorcentaje);

    // actualizando nombres de npc


    console.log("lenguaje es ",this.lenguaje)


    if (this.lenguaje === 1) {
      // ==========================
      // Idioma: English (United States)
      // ==========================
      this.npcx1.setText('Farmer Joe');
      this.npcx2.setText('Crafter Jack');
      this.npcx3.setText('Alchemist Colin');
      this.npcx4.setText('Guardian Rurik');
      this.npcx5.setText('Lord Digby');
      this._fijarProfundidadNpcs();

      cambiarTodosLosTitulos({
          inventario: 'Inventory',
          reputacion: 'Reputation',
          estadisticas: 'Statistics',
          requerimientos: 'Statistics Book',
          configuraciones: 'Settings'
      });

      // Set up and show the initial dialogue
      this.missionDialogs = [
          "Hey, kid, come over here for a moment! I'm Farmer Joe. Today I was planning to make my famous vegetable soup, the one everyone in town comes asking for when the weather gets cold. But it turns out I ran out of dry firewood to light the stove…",
          "And you know how these old bones are: my knees can't handle another long walk to the forest. I can't go myself, so I need you to lend me a hand.",
          "Could you bring me 20 logs of dry firewood? They can't be just any branch, okay? I need wood that lights quickly and burns evenly. If you help me, I’ll reward you properly, like someone who helps an old farmer deserves.",
      ];
      this.missionDialogs1 = [
          "Hey, kid, I'm still waiting for the dry firewood for my vegetable soup! Did you manage to get the 20 logs I asked for? No!!… then go fetch them in the forest, please.",
      ];


    }

    if (this.lenguaje === 2) {
        
      // ==========================
      // Idioma: English (Philippine / Tagalog)
      // ==========================

      this.npcx1.setText('Farmer Joe');
      this.npcx2.setText('Crafter Jack');
      this.npcx3.setText('Alchemist Colin');
      this.npcx4.setText('Guardian Rurik');
      this.npcx5.setText('Lord Digby');
      this._fijarProfundidadNpcs();

      cambiarTodosLosTitulos({
          inventario: 'Inventory',
          reputacion: 'Reputation',
          estadisticas: 'Statistics',
          requerimientos: 'Statistics Book',
          configuraciones: 'Settings'
      });

      this.missionDialogs = [
          "Hey, kid, come here for a moment! I'm Farmer Joe. Today I planned to make my famous vegetable soup that everyone in town asks for when it’s cold. But I ran out of dry firewood for the stove…",
          "And you know these old bones: my knees can't handle another long walk to the forest. I can't go myself, so I need your help.",
          "Can you bring me 20 logs of dry firewood? Not just any branch, okay? I need wood that lights quickly and burns evenly. If you help me, I’ll reward you properly, as someone helping an old farmer should.",
      ];
      this.missionDialogs1 = [
          "Hey, kid! I'm still waiting for the dry firewood for my vegetable soup! Did you get the 20 logs I asked? No!!… then please go fetch them in the forest.",
      ];
        
    }

    
    if (this.lenguaje === 3) {
            
      // ==========================
      // Idioma: Español (Latinoamérica)
      // ==========================

      this.npcx1.setText('Granjero Joe');
      this.npcx2.setText('Artesano Jack');
      this.npcx3.setText('Alquimista Colin');
      this.npcx4.setText('Guardián Rurik');
      this.npcx5.setText('Señor Digby');
      this._fijarProfundidadNpcs();

      cambiarTodosLosTitulos({
          inventario: 'Inventario',
          reputacion: 'Reputación',
          estadisticas: 'Estadísticas',
          requerimientos: 'Libro de estadísticas',
          configuraciones: 'Configuraciones'
      });

      this.missionDialogs = [
          "¡Oye, chico! Acércate un momento. Soy el Granjero Joe. Hoy planeaba hacer mi famosa sopa de verduras, la que todos en el pueblo piden cuando hace frío. Pero resulta que me quedé sin leña seca para encender la estufa…",
          "Y ya sabes cómo están estos viejos huesos: mis rodillas no aguantan otra caminata larga al bosque. No puedo ir yo, así que necesito que me eches una mano.",
          "¿Podrías traerme 20 leños de leña seca? No pueden ser cualquier rama, ¿ok? Necesito madera que prenda rápido y arda de manera uniforme. Si me ayudas, te recompensaré como alguien que ayuda a un viejo granjero merece."
      ];
      this.missionDialogs1 = [
          "¡Oye, chico! Todavía estoy esperando la leña seca para mi sopa de verduras. ¿Conseguiste los 20 leños que te pedí? ¡No!… entonces ve a buscarlos en el bosque, por favor.",
      ];
      
    }

    
    if (this.lenguaje === 4) {


      // ==========================
      // Idioma: Portugués (Brasil)
      // ==========================

      this.npcx1.setText('Fazendeiro Joe');
      this.npcx2.setText('Artesão Jack');
      this.npcx3.setText('Alquimista Colin');
      this.npcx4.setText('Guardião Rurik');
      this.npcx5.setText('Lorde Digby');
      this._fijarProfundidadNpcs();

      cambiarTodosLosTitulos({
          inventario: 'Inventário',
          reputacion: 'Reputação',
          estadisticas: 'Estatísticas',
          requerimientos: 'Livro de Estatísticas',
          configuraciones: 'Configurações'
      });

      this.missionDialogs = [
          "Ei, garoto, venha aqui um momento! Eu sou o Fazendeiro Joe. Hoje eu planejava fazer minha famosa sopa de legumes, aquela que todo mundo na cidade pede quando o tempo esfria. Mas acabou que fiquei sem lenha seca para acender o fogão…",
          "E você sabe como são esses ossos velhos: meus joelhos não aguentam outra longa caminhada até a floresta. Eu não posso ir, então preciso que me dê uma mão.",
          "Você poderia trazer 20 toras de lenha seca? Não podem ser qualquer galho, ok? Preciso de madeira que acenda rápido e queime de forma uniforme. Se você me ajudar, vou recompensá-lo adequadamente, como alguém que ajuda um velho fazendeiro merece."
      ];
      this.missionDialogs1 = [
          "Ei, garoto, ainda estou esperando a lenha seca para minha sopa de legumes! Conseguiu as 20 toras que pedi? Não!!… então vá buscá-las na floresta, por favor.",
      ];
      
    }

    
    if (this.lenguaje === 5) {
      

      // ==========================
      // Idioma: Chino Simplificado (简体中文)
      // ==========================

      this.npcx1.setText('农夫乔');
      this.npcx2.setText('工匠杰克');
      this.npcx3.setText('炼金师科林');
      this.npcx4.setText('守护者鲁里克');
      this.npcx5.setText('迪比勋爵');
      this._fijarProfundidadNpcs();

      cambiarTodosLosTitulos({
          inventario: '库存',
          reputacion: '声望',
          estadisticas: '统计',
          requerimientos: '统计书',
          configuraciones: '设置'
      });

      this.missionDialogs = [
          "嘿，孩子，过来一下！我是农夫乔。今天我打算做我著名的蔬菜汤，每到天气冷，镇上的人都会来要这汤。但我发现我干柴用完了，炉子点不着…",
          "你也知道这些老骨头：我的膝盖走不了长路去森林。我自己不能去，所以需要你帮忙。",
          "你能帮我带来20根干柴吗？不能随便拿枝条，好吗？我需要容易点燃并均匀燃烧的木材。如果你帮我，我会好好奖励你，就像帮助老农夫的人应该得到的。"
      ];
      this.missionDialogs1 = [
          "嘿，孩子，我还在等我的蔬菜汤用的干柴！你拿到我要的20根木柴了吗？没有！！…那就去森林里取吧，请。"
      ];
      
    }

    
    if (this.lenguaje === 6) {
            
      // ==========================
      // Idioma: Coreano (한국어 Hangul)
      // ==========================

      this.npcx1.setText('농부 조');
      this.npcx2.setText('장인 잭');
      this.npcx3.setText('연금술사 코린');
      this.npcx4.setText('수호자 루릭');
      this.npcx5.setText('로드 디그비');
      this._fijarProfundidadNpcs();

      cambiarTodosLosTitulos({
          inventario: '인벤토리',
          reputacion: '평판',
          estadisticas: '통계',
          requerimientos: '통계 책',
          configuraciones: '설정'
      });

      this.missionDialogs = [
          "이봐, 얘야, 잠깐 와봐! 나는 농부 조야. 오늘은 내가 유명한 야채 수프를 만들 계획이었어, 날씨가 추워지면 마을 사람들이 다 찾는 수프지. 그런데 건조한 장작이 다 떨어져서 난로를 켤 수가 없어…",
          "이 오래된 뼈들을 알잖아: 무릎이 또 다시 숲까지 긴 걸음을 견딜 수 없어. 내가 갈 수 없으니 네 도움이 필요해.",
          "건조한 장작 20개 가져다 줄 수 있겠니? 아무 가지나 아니야, 알겠지? 빨리 붙고 고르게 타는 나무가 필요해. 네가 도와준다면, 늙은 농부를 돕는 사람답게 제대로 보상할게."
      ];
      this.missionDialogs1 = [
          "이봐, 얘야! 아직도 내 야채 수프용 건조 장작을 기다리고 있어! 내가 부탁한 20개 장작 가져왔니? 아니!!… 그럼 숲에서 가져와 줘, 부탁이야."
      ];

      
    }


    
    const maderaTotal = this.countItemInAllStorage('madera_pinos');
    console.log(`🌲 Madera de pinos total: ${maderaTotal}`);

  
  }


  



  // =========================================================================
  // SISTEMA DE SINCRONIZACIÓN DE STATS CON EL SMART CONTRACT
  // =========================================================================

  _initStatsSync() {
    if (typeof window.StatsSync !== 'undefined') {
      this.statsSync = new window.StatsSync(this);
      console.log('✅ StatsSync inicializado en GameScene');
    } else {
      console.warn('⚠️  StatsSync no disponible — revisa que LoadingScenegame.js esté cargado');
    }
    if (window.playerStats) {
      const ps = window.playerStats;
      if (typeof ps.vida   === 'number') this.vidaPorcentaje   = ps.vida;
      if (typeof ps.agua   === 'number') this.aguaPorcentaje   = ps.agua;
      if (typeof ps.comida === 'number') this.comidaPorcentaje = ps.comida;
      if (typeof ps.oro    === 'number') this.moneda           = ps.oro;
      if (typeof ps.plata  === 'number') this.moneda_plata     = ps.plata;
      // Solo se adopta la exp del contrato si su factura ya existe; si no,
      // manda el valor local y el backend lo usará como semilla.
      if (typeof ps.exp === 'number' && ps.invoiceIds && ps.invoiceIds.exp) {
        this.nivel_exp = ps.exp;
      }
      console.log('📊 Stats cargados desde window.playerStats:', {
        vida: this.vidaPorcentaje, agua: this.aguaPorcentaje,
        comida: this.comidaPorcentaje, oro: this.moneda, plata: this.moneda_plata,
        exp: this.nivel_exp,
      });
    }
    // Punto de partida de la exp: sin esto el primer tick mandaría un update
    // aunque nada hubiera cambiado.
    this._lastExpSynced = Math.max(0, Math.round(Number(this.nivel_exp) || 0));
    this._statsReady = true; // Ahora sí se permite sincronizar al contrato

    // Actualizar visualmente las barras con los valores cargados del contrato
    this._refreshBarrasUI();
  }

  /**
   * Actualiza la UI de las barras sin disparar sync al contrato.
   * Usar solo para refrescar la vista con valores ya cargados.
   */
  _refreshBarrasUI() {
    const savedReady = this._statsReady;
    this._statsReady = false; // bloquear sync temporalmente
    try {
      if (typeof this.actualizarBarraVida   === 'function') this.actualizarBarraVida(this.vidaPorcentaje);
      if (typeof this.actualizarBarraAgua   === 'function') this.actualizarBarraAgua(this.aguaPorcentaje);
      if (typeof this.actualizarBarraComida === 'function') this.actualizarBarraComida(this.comidaPorcentaje);
    } finally {
      this._statsReady = savedReady;
    }
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

  /**
   * Manda la experiencia a su factura del contrato, pero solo cuando cambió.
   * Se llama desde el tick de 400 ms del sistema de niveles, así que cubre
   * todos los sitios donde se suma exp sin tener que tocarlos uno a uno.
   */
  _syncExp() {
    if (!this.statsSync || !this._statsReady) return;
    const exp = Math.max(0, Math.round(Number(this.nivel_exp) || 0));
    if (this._lastExpSynced === exp) return;
    this._lastExpSynced = exp;
    if (window.playerStats) window.playerStats.exp = exp;
    this.statsSync.set('exp', exp);
  }

  async _refreshStatsFromChain() {
    if (!this.statsSync) return;
    await this.statsSync.forceRefresh();
    if (window.playerStats) {
      this.vidaPorcentaje   = window.playerStats.vida;
      this.aguaPorcentaje   = window.playerStats.agua;
      this.comidaPorcentaje = window.playerStats.comida;
      this.moneda           = window.playerStats.oro;
      this.moneda_plata     = window.playerStats.plata;
      if (typeof window.playerStats.exp === 'number') {
        this.nivel_exp       = window.playerStats.exp;
        this._lastExpSynced  = this.nivel_exp;
      }
      this.actualizarBarraVida(this.vidaPorcentaje);
      this.actualizarBarraAgua(this.aguaPorcentaje);
      this.actualizarBarraComida(this.comidaPorcentaje);
    }
  }

  // =========================================================================
  // SKILLS PANEL
  // =========================================================================

  openSkillsPanel() {
    let panel = document.getElementById('skills-panel');
    if (!panel) {
      // Build the panel HTML the first time it's needed
      panel = document.createElement('div');
      panel.id = 'skills-panel';
      panel.style.cssText = `
        display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        width:360px; max-width:95vw; background:#0d1b2a; border:2px solid #1e3a5f;
        border-radius:10px; padding:20px; z-index:99999; color:#c8e8ff;
        font-family:"PressStart2P",cursive; flex-direction:column; gap:12px;
        box-shadow:0 0 30px rgba(0,80,180,0.5);
      `;
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:11px;color:#40a0ff;">⚔️ SKILLS</span>
          <button id="skills-close" style="background:none;border:none;color:#c8e8ff;font-size:16px;cursor:pointer;line-height:1;">✕</button>
        </div>
        <div style="border-bottom:1px solid #1e3a5f;padding-bottom:8px;margin-bottom:8px;font-size:9px;">
          ⭐ Level: <b id="sk-level" style="color:#ffd23f;">1</b>
          <span id="sk-level-exp" style="color:#7f96b5;margin-left:6px;">0 EXP</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:9px;">
          <div>🌿 Farming: <b id="sk-farming" style="color:#40a0ff;">1</b><br><span id="sk-farming-exp" style="color:#7f96b5;font-size:8px;">0 EXP</span></div>
          <div>⛏️ Mining: <b id="sk-mining" style="color:#40a0ff;">1</b><br><span id="sk-mining-exp" style="color:#7f96b5;font-size:8px;">0 EXP</span></div>
          <div>🌲 Woodcutting: <b id="sk-woodcutting" style="color:#40a0ff;">1</b><br><span id="sk-woodcutting-exp" style="color:#7f96b5;font-size:8px;">0 EXP</span></div>
          <div>🌊 Fishing: <b id="sk-fishing" style="color:#40a0ff;">1</b><br><span id="sk-fishing-exp" style="color:#7f96b5;font-size:8px;">0 EXP</span></div>
          <div>🍳 Cooking: <b id="sk-cooking" style="color:#40a0ff;">1</b><br><span id="sk-cooking-exp" style="color:#7f96b5;font-size:8px;">0 EXP</span></div>
          <div>💪 Strength: <b id="sk-strength" style="color:#40a0ff;">1</b><br><span id="sk-strength-exp" style="color:#7f96b5;font-size:8px;">0 EXP</span></div>
        </div>
      `;
      document.body.appendChild(panel);
    }
    // IMPORTANT: remove the hidden class FIRST (it uses display:none !important)
    // then add visible class and set inline display so it always wins
    panel.classList.remove('skills-panel-hidden');
    panel.classList.add('skills-panel-visible');
    panel.style.display = 'flex';
    this._loadSkillsData();
    document.getElementById('skills-close').onclick = () => this.closeSkillsPanel();
  }


  // =========================================================================
  // MAIL PANEL — shared singleton used by GameScene and tiendajuego
  // =========================================================================
  _openMailPanel() {
    // Build once, reuse
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

    // Wire controls every open (safe with _wired guard)
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
    if (!this.playerName) return;
    const list = document.getElementById('_mail-list');
    const empty = document.getElementById('_mail-empty');
    if (!list) return;
    list.innerHTML = '<div style="font-size:7px;color:#6080a0;text-align:center;padding:12px;">Loading...</div>';
    try {
      const res = await fetch(`${this.serverBase}/api/mail/${encodeURIComponent(this.playerName)}`, { credentials:'include' });
      const data = res.ok ? await res.json() : { mails: [] };
      const mails = Array.isArray(data.mails) ? data.mails : [];
      list.innerHTML = '';
      if (mails.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      mails.forEach(mail => {
        const item = document.createElement('div');
        item.dataset.mailId = mail.id;
        item.style.cssText = [
          'display:flex;flex-direction:column;gap:4px',
          'background:' + (mail.read ? '#0a1422' : '#112240'),
          'border:1px solid ' + (mail.read ? '#1e3a5f' : '#2060a0'),
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
      // Wire per-mail X buttons
      list.querySelectorAll('._mail-x').forEach(btn => {
        btn.onclick = () => this._deleteMail(btn.dataset.id);
      });
    } catch(e) {
      if (list) list.innerHTML = '<div style="font-size:7px;color:#ff6060;text-align:center;padding:12px;">Error loading mail</div>';
    }
  }

  async _markAllMailRead() {
    if (!this.playerName) return;
    try {
      await fetch(`${this.serverBase}/api/mail/${encodeURIComponent(this.playerName)}/read-all`, {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':window.getCsrfToken()}
      });
      this._fetchMails();
    } catch(_) {}
  }

  async _clearAllMail() {
    if (!this.playerName) return;
    try {
      await fetch(`${this.serverBase}/api/mail/${encodeURIComponent(this.playerName)}/clear`, {
        method:'DELETE', credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':window.getCsrfToken()}
      });
      this._fetchMails();
    } catch(_) {}
  }

  async _deleteMail(mailId) {
    if (!this.playerName || !mailId) return;
    try {
      await fetch(`${this.serverBase}/api/mail/${encodeURIComponent(this.playerName)}/${encodeURIComponent(mailId)}`, {
        method:'DELETE', credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':window.getCsrfToken()}
      });
      this._fetchMails();
    } catch(_) {}
  }

  closeSkillsPanel() {
    const panel = document.getElementById('skills-panel');
    if (!panel) return;
    panel.classList.remove('skills-panel-visible');
    panel.classList.add('skills-panel-hidden');
    panel.style.display = 'none';
  }

  // SKILLS REALES del juego (las que existen en GamePlayer y suben con su exp).
  // Se quitaron "vitality" y "agility": no eran habilidades reales — vitality
  // repetía el nivel y agility se inventaba a partir de la velocidad.
  _getSkillsFromScene() {
    return {
      level:       this.nivel          || 1,
      farming:     this.agricultura    || 1,
      mining:      this.mineria        || 1,
      fishing:     this.pesca          || 1,
      cooking:     this.cocina         || 1,
      woodcutting: this.deforestacion  || 1,
      strength:    this.fuerza         || 1,
      // Experiencia de cada una (se muestra integrada junto al nivel).
      exp: {
        level:       this.nivel_exp          || 0,
        farming:     this.agricultura_exp    || 0,
        mining:      this.mineria_exp        || 0,
        fishing:     this.pesca_exp          || 0,
        cooking:     this.cocina_exp         || 0,
        woodcutting: this.deforestacion_exp  || 0,
        strength:    this.fuerza_exp         || 0
      }
    };
  }

  async _loadSkillsData() {
    if (!this.playerName) return;
    // Ya NO se piden insignias: la sección se eliminó del panel.
    try {
      const skillsRes = await fetch(
        `${this.serverBase}/api/skills/${encodeURIComponent(this.playerName)}`,
        { credentials: 'include' }
      );
      let skills = this._getSkillsFromScene();
      if (skillsRes && skillsRes.ok) {
        const data = await skillsRes.json();
        // La exp local manda salvo que el backend mande la suya.
        const remote = data.skills || {};
        skills = { ...skills, ...remote, exp: { ...(skills.exp || {}), ...(remote.exp || {}) } };
      }
      this._renderSkillsPanel(skills);
    } catch (_) {
      this._renderSkillsPanel(this._getSkillsFromScene());
    }
  }

  _renderSkillsPanel(skills) {
    // Nivel + skills REALES, cada una con su experiencia integrada.
    const statMap = {
      level: 'sk-level', farming: 'sk-farming', mining: 'sk-mining',
      fishing: 'sk-fishing', cooking: 'sk-cooking',
      woodcutting: 'sk-woodcutting', strength: 'sk-strength'
    };
    const exp = (skills && skills.exp) || {};

    Object.entries(statMap).forEach(([key, elId]) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = skills[key] || 1;

      const expEl = document.getElementById(elId + '-exp');
      if (expEl) expEl.textContent = `${Math.floor(Number(exp[key]) || 0)} EXP`;
    });

    // FIX: aquí había `this._pendingSkillPoints = points;` con `points` sin
    // declarar en este ámbito → ReferenceError que abortaba TODO el render del
    // panel (por eso los valores no se actualizaban).
    this._pendingSkills = skills;
    this._pendingSkillPoints = 0;
  }

  async _saveSkillsData() {
    if (!this.playerName || !this._pendingSkills) return;
    try {
      await fetch(`${this.serverBase}/api/skills/${encodeURIComponent(this.playerName)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken() },
        body: JSON.stringify({ skills: this._pendingSkills, skillPoints: this._pendingSkillPoints || 0 })
      });
      // Show prominent center-screen success banner
      this._showSaveSuccessBanner('Skills saved successfully!');
      console.log('✅ Skills saved:', this._pendingSkills);
    } catch (e) {
      console.warn('Skills save error:', e);
      this._showSaveSuccessBanner('Error saving skills. Try again.', true);
    }
  }

  /** Show a centered screen-space banner for 2.5 s */
  _showSaveSuccessBanner(message, isError = false, isInfo = false) {
    const old = document.getElementById('_save-success-banner');
    if (old) old.remove();
    const banner = document.createElement('div');
    banner.id = '_save-success-banner';
    banner.textContent = message;
    Object.assign(banner.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      background: isError ? 'rgba(180,30,30,0.93)' : isInfo ? 'rgba(20,40,80,0.93)' : 'rgba(20,80,40,0.93)',
      color: '#ffffff',
      border: isError ? '2px solid #ff6666' : isInfo ? '2px solid #4080ff' : '2px solid #66ff99',
      borderRadius: '10px', padding: '18px 36px', fontSize: '14px',
      fontFamily: '"PressStart2P", cursive, sans-serif', fontWeight: 'bold',
      zIndex: '99999', textAlign: 'center',
      boxShadow: '0 4px 32px rgba(0,0,0,0.7)', letterSpacing: '1px',
      pointerEvents: 'none', transition: 'opacity 0.4s ease'
    });
    document.body.appendChild(banner);
    setTimeout(() => { banner.style.opacity = '0'; }, 2100);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 2600);
  }

  // =========================================================================
  // NFT + PET PANEL
  // =========================================================================

  openNFTPanel() {
    const panel = document.getElementById('nft-panel');
    if (!panel) return;
    panel.classList.add('nft-panel-visible');
    panel.style.display = 'flex';
    this._setupNFTPanel();
    this._loadPetData();
  }

  closeNFTPanel() {
    const panel = document.getElementById('nft-panel');
    if (!panel) return;
    panel.classList.remove('nft-panel-visible');
    panel.style.display = 'none';
  }

  _setupNFTPanel() {
    const closeBtn = document.getElementById('nft-close');
    if (closeBtn) closeBtn.onclick = () => this.closeNFTPanel();

    const toggleBtn = document.getElementById('nft-pet-toggle');
    if (toggleBtn) toggleBtn.onclick = () => this._togglePetVisibility();

    const removeBtn = document.getElementById('nft-pet-remove');
    if (removeBtn) removeBtn.onclick = () => this._removePet();
  }

  _togglePetVisibility() {
    if (!this.petData) this.petData = { type: 'perro', visible: true, equipped: true };
    // Only allow toggling if pet is equipped
    if (this.petData.equipped === false) return;
    this.petData.visible = !this.petData.visible;
    const vis = this.petData.visible;
    window.globalPetData = this.petData;
    // The dog object is {sprite, shadowContainer} — handle it specifically
    if (this.dog) {
      if (this.dog.sprite) this.dog.sprite.setVisible(vis);
      if (this.dog.shadowContainer) this.dog.shadowContainer.setVisible(vis);
    }
    // Also check legacy references
    if (this.dogSprite) this.dogSprite.setVisible(vis);
    const btn = document.getElementById('nft-pet-toggle');
    if (btn) btn.textContent = vis ? 'Hide Pet' : 'Show Pet';
    this._savePetData();
    console.log('🐾 Pet visibility toggled to:', vis);
  }

  _removePet() {
    this.petData = { type: null, visible: false, equipped: false };
    window.globalPetData = this.petData; // persist across scene switches
    // Hide actual dog sprite in game
    if (this.dogSprite) { this.dogSprite.setVisible(false); this.dogSprite.setActive(false); }
    if (this.dog) { this.dog.sprite && this.dog.sprite.setVisible(false); }
    // Hide dog shadow container so it doesn't keep following the player
    if (this.dog && this.dog.shadowContainer && this.dog.shadowContainer.setVisible) {
      this.dog.shadowContainer.setVisible(false);
    }
    if (this.dogSprite && this.dogSprite.shadowContainer && this.dogSprite.shadowContainer.setVisible) {
      this.dogSprite.shadowContainer.setVisible(false);
    }
    // Search all possible dog references
    ['dog', 'dogSprite', 'perro', 'pet', 'mascota'].forEach(k => {
      if (this[k] && this[k].setVisible) this[k].setVisible(false);
      if (this[k] && this[k].sprite && this[k].sprite.setVisible) this[k].sprite.setVisible(false);
      if (this[k] && this[k].shadowContainer && this[k].shadowContainer.setVisible) this[k].shadowContainer.setVisible(false);
    });
    const nameEl = document.getElementById('nft-pet-name');
    const emptyEl = document.getElementById('nft-pet-empty');
    const canvas = document.getElementById('nft-pet-canvas');
    if (nameEl) nameEl.textContent = '—';
    if (emptyEl) emptyEl.style.display = 'block';
    if (canvas) canvas.style.display = 'none';
    this._savePetData();
    console.log('🐾 Pet removed and hidden in game');
  }

  async _loadPetData() {
    if (!this.playerName) return;
    // If petData was saved cross-scene use that state — don't overwrite with server data
    if (window.globalPetData !== undefined) {
      this.petData = window.globalPetData;
      // Enforce visibility synchronously on the already-created sprite
      const equip = this.petData.equipped !== false;
      const vis   = equip && (this.petData.visible !== false);
      if (this.dog) {
        if (this.dog.sprite)          this.dog.sprite.setVisible(vis);
        if (this.dog.shadowContainer) this.dog.shadowContainer.setVisible(vis);
      }
      this._renderPetPreview();
      return;
    }
    try {
      const res = await fetch(`${this.serverBase}/api/pet/${encodeURIComponent(this.playerName)}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        this.petData = data.pet || { type: 'perro', visible: true, equipped: true };
        window.globalPetData = this.petData; // persist for next scene
        this._renderPetPreview();
      }
    } catch (_) {
      this.petData = this.petData || { type: 'perro', visible: true, equipped: true };
      window.globalPetData = this.petData;
      this._renderPetPreview();
    }
  }

  _renderPetPreview() {
    const nameEl = document.getElementById('nft-pet-name');
    const emptyEl = document.getElementById('nft-pet-empty');
    const canvas  = document.getElementById('nft-pet-canvas');
    if (!this.petData || !this.petData.equipped) {
      if (nameEl) nameEl.textContent = '—';
      if (emptyEl) emptyEl.style.display = 'block';
      if (canvas) canvas.style.display = 'none';
      return;
    }
    if (nameEl) nameEl.textContent = this.petData.type === 'perro' ? '🐕 Dog' : this.petData.type;
    if (emptyEl) emptyEl.style.display = 'none';
    if (canvas) {
      canvas.style.display = 'block';
      // Draw pet sprite on canvas using Phaser texture
      try {
        const tex = this.textures.get('perro_derecha_1');
        if (tex && tex.source && tex.source[0]) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, 128, 128);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tex.source[0].image, 0, 0, 128, 128);
        }
      } catch (_) {}
    }
  }

  async _savePetData() {
    if (!this.playerName || !this.petData) return;
    try {
      await fetch(`${this.serverBase}/api/pet/${encodeURIComponent(this.playerName)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken() },
        body: JSON.stringify({ pet: this.petData })
      });
    } catch (_) {}
  }

  // =========================================================================
  // FURNACE PANEL
  // =========================================================================

  openFurnacePanel() {
    const panel = document.getElementById('furnace-panel');
    if (!panel) return;
    panel.classList.remove('furnace-hidden');
    panel.classList.add('furnace-visible');
    panel.style.display = 'flex';
    this._setupFurnacePanel();
    console.log('🔥 Furnace panel opened');
  }

  closeFurnacePanel() {
    const panel = document.getElementById('furnace-panel');
    if (!panel) return;
    panel.classList.remove('furnace-visible');
    panel.classList.add('furnace-hidden');
    panel.style.display = 'none';
  }

  _setupFurnacePanel() {
    const closeBtn = document.getElementById('furnace-close');
    if (closeBtn) closeBtn.onclick = () => this.closeFurnacePanel();

    // Smelt button
    const smeltBtn = document.getElementById('furnace-smelt-btn');
    if (smeltBtn) {
      smeltBtn.onclick = () => {
        const oreSlot  = document.getElementById('furnace-slot-ore');
        const coalSlot = document.getElementById('furnace-slot-coal');
        const oreItem  = oreSlot  && oreSlot._item;
        const coalItem = coalSlot && coalSlot._item;
        if (!oreItem || !coalItem) {
          document.getElementById('furnace-status').textContent = '⚠️ Add ore and coal first';
          return;
        }
        // Log all info for developer to implement contract interaction
        console.log('🔥 [FURNACE] Smelting request:', {
          ore:  { id: oreItem.id, name: oreItem.name, quantity: oreItem.qty, idx: oreItem.idx, manualId: oreItem.manualId },
          coal: { id: coalItem.id, name: coalItem.name, quantity: coalItem.qty, idx: coalItem.idx, manualId: coalItem.manualId },
          playerName: this.playerName, address: this.currentAccount,
          timestamp: Date.now(),
          note: 'Use decreaseInvoiceQuantity for ore and coal, then createInvoice for result'
        });
        document.getElementById('furnace-status').textContent = '✅ Smelt request logged — check console';
        this._saveFurnaceState(oreItem, coalItem);
      };
    }

    // Drop items into slots via inventory click
    this._furnaceDropMode = null;
    ['furnace-slot-ore', 'furnace-slot-coal'].forEach(slotId => {
      const slot = document.getElementById(slotId);
      if (!slot) return;
      slot.onclick = () => {
        const sel = this.STATE && this.STATE.selectedItem;
        if (!sel) { document.getElementById('furnace-status').textContent = 'Select an item from inventory first'; return; }
        const itemId = sel.id;
        const isCoal = itemId && itemId.toLowerCase().includes('carbon');
        if (slotId === 'furnace-slot-coal' && !isCoal) {
          document.getElementById('furnace-status').textContent = '⚠️ Only carbon/coal goes here';
          return;
        }
        if (slotId === 'furnace-slot-ore' && isCoal) {
          document.getElementById('furnace-status').textContent = '⚠️ This slot is for ore only';
          return;
        }
        slot._item = { id: sel.id, name: sel.name || sel.id, qty: sel.count || 1, idx: sel.idx, manualId: sel.idm };
        slot.innerHTML = `<img src="${sel.image || ''}" style="width:40px;height:40px;object-fit:contain" onerror="this.style.display='none'"><span class="furnace-slot-label" style="font-size:9px;color:#7ec8ff">${slot._item.name} x${slot._item.qty}</span>`;
        slot.classList.add('has-item');
        document.getElementById('furnace-status').textContent = `${slot._item.name} added`;
        this._checkFurnaceReady();
      };
    });

    // Load saved state
    this._loadFurnaceState();
  }

  _checkFurnaceReady() {
    const oreSlot  = document.getElementById('furnace-slot-ore');
    const coalSlot = document.getElementById('furnace-slot-coal');
    const smeltBtn = document.getElementById('furnace-smelt-btn');
    const ready = !!(oreSlot && oreSlot._item && coalSlot && coalSlot._item);
    if (smeltBtn) smeltBtn.disabled = !ready;
  }

  _saveFurnaceState(oreItem, coalItem) {
    const payload = { oreItem, coalItem, playerName: this.playerName, timestamp: Date.now() };
    fetch(`${this.serverBase}/api/furnace/${encodeURIComponent(this.playerName)}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken() },
      body: JSON.stringify(payload)
    }).then(r => r.ok && console.log('✅ Furnace state saved'))
      .catch(e => console.warn('Furnace save error:', e));
  }

  _loadFurnaceState() {
    if (!this.playerName) return;
    fetch(`${this.serverBase}/api/furnace/${encodeURIComponent(this.playerName)}`, {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        console.log('🔥 Furnace state loaded:', data);
        const status = document.getElementById('furnace-status');
        if (status && data.timestamp) {
          const mins = Math.floor((Date.now() - data.timestamp) / 60000);
          status.textContent = `Last smelted ${mins}m ago`;
        }
      }).catch(() => {});
  }

  // =========================================================================
  // NOTIFICATIONS PANEL
  // =========================================================================

  _openNotifPanel() {
    // Hide the old mailbox panel if it leaked into view
    const oldMailbox = document.getElementById('_mail-panel-root');
    if (oldMailbox) oldMailbox.style.display = 'none';

    // Se busca el panel EN EL MOMENTO en vez de usar this._notifPanel, que se
    // capturaba una sola vez en create(). Si el DOM del HUD todavía no estaba
    // montado en ese instante, aquella referencia quedaba en null para siempre
    // y la campana no hacía absolutamente nada.
    const panel = document.getElementById('notif-panel') || this._notifPanel;
    if (!panel) { console.warn('⚠️ No se encontró #notif-panel'); return; }
    this._notifPanel = panel;

    // Hay que QUITAR la clase de ocultar, no solo añadir la de mostrar:
    // .notif-panel-hidden y .notif-panel-visible llevan las dos `!important`,
    // así que con ambas puestas sólo gana la que esté más abajo en el css. Eso
    // funcionaba de casualidad y se rompía en cuanto cambiaba el orden de las
    // reglas. Además hay que limpiar el display:none en línea que deja
    // _closeNotifPanel.
    panel.classList.remove('notif-panel-hidden');
    panel.classList.add('notif-panel-visible');
    panel.style.display = 'flex';
    this._markAllNotifRead();
  }

  _closeNotifPanel() {
    const panel = document.getElementById('notif-panel') || this._notifPanel;
    if (!panel) return;
    panel.classList.remove('notif-panel-visible');
    panel.classList.add('notif-panel-hidden');
    panel.style.display = 'none';
  }

  _addNotification(msg, icon = '🔔', save = true) {
    const notif = { id: Date.now(), msg, icon, time: new Date().toISOString(), read: false };
    this._notifList.unshift(notif);
    if (this._notifList.length > 50) this._notifList.pop();
    this._renderNotifList();
    this._updateNotifBadge();
    if (save) this._saveNotifications();
  }

  _markAllNotifRead() {
    this._notifList.forEach(n => n.read = true);
    this._renderNotifList();
    this._updateNotifBadge();
    this._saveNotifications();
  }

  _updateNotifBadge() {
    const unread = this._notifList.filter(n => !n.read).length;
    if (this._notifBadge) {
      this._notifBadge.textContent = unread;
      this._notifBadge.style.display = unread > 0 ? 'flex' : 'none';
    }
  }

  _renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
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
    // Wire individual dismiss buttons
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
    if (!this.playerName) return;
    try {
      const res = await fetch(`${this.serverBase}/api/notifications/${encodeURIComponent(this.playerName)}`, {
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
    if (!this.playerName) return;
    try {
      await fetch(`${this.serverBase}/api/notifications/${encodeURIComponent(this.playerName)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken() },
        body: JSON.stringify({ notifications: this._notifList.slice(0, 50) })
      });
    } catch (_) {}
  }

} // fin clase GameScene

window.GameScene = GameScene;