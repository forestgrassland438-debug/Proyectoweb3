/* app.js — versión ULTRA OPTIMIZADA con Phaser RPG Perf
   Integración completa de todas las optimizaciones: Pooling, Culling, Chunking, Caching
   Rendimiento máximo garantizado para RPGs y cualquier juego Phaser
   MODIFICADO: Registro automático de sceneClasses habilitado
*/

(function () {
  'use strict';

  // ==================== CONFIGURACIÓN AVANZADA ====================
  const ADVANCED_CONFIG = {
    parent: 'container',
    width: Math.max(320, window.innerWidth),
    height: Math.max(240, window.innerHeight),
    type: Phaser.WEBGL,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#000000',
    powerPreference: 'high-performance',
    antialias: false,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
    antialiasGL: false,
    autoFocus: true,
    physics: { 
      default: 'arcade', 
      arcade: { 
        gravity: { y: 0 }, 
        debug: false,
        fps: 60,
        timeScale: 1,
        fixedStep: true
      } 
    },
    scene: [],
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      powerPreference: 'high-performance',
      antialiasGL: false,
      preserveDrawingBuffer: false,
      mipmapFilter: 'NEAREST_MIPMAP_NEAREST'
    }
  };

  // ==================== OPCIONES DE PERFORMANCE AVANZADAS ====================
  const PERF_OPTIONS = {
    debug: false,
    logPerformance: true,
    performanceSampleRate: 2000,
    
    // Rendimiento
    chunkSizeTiles: 16,
    chunkRadius: 2,
    cullPadding: 48,
    defaultPoolSize: 100,
    maxRenderTextureSize: 4096,
    
    // Gráficos
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    preserveResolution: true,
    highPerformance: true,
    antiFlicker: true,
    
    // Adaptive Performance
    adaptiveEnabled: true,
    maxFrameTime: 33, // 30 FPS threshold
    minFrameTime: 16, // 60 FPS threshold
    
    // Caché
    textureCacheSizeMB: 100,
    enableSmartCaching: true,
    
    // Registro
    registrarRetryMs: 100,
    registrarRetryCount: 20
  };

  const BOOT_FIRST_SCENE = 'LoadingScenegame';

  // ==================== SISTEMA DE LOGGING OPTIMIZADO ====================
  const Logger = {
    enabled: true,
    prefix: '[APP]',
    
    log(...args) {
      if (this.enabled) try { console.log(this.prefix, ...args); } catch(e) {}
    },
    
    warn(...args) {
      if (this.enabled) try { console.warn(this.prefix, ...args); } catch(e) {}
    },
    
    error(...args) {
      try { console.error(this.prefix, ...args); } catch(e) {}
    },
    
    perf(...args) {
      if (this.enabled && PERF_OPTIONS.debug) try { console.log('[PERF]', ...args); } catch(e) {}
    }
  };

  // ==================== UTILIDADES DE ALTO RENDIMIENTO ====================
  const Utils = {
    isFunction(v) { return typeof v === 'function'; },
    
    isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); },
    
    throttle(fn, limit) {
      let inThrottle;
      return function executedFunction(...args) {
        if (!inThrottle) {
          fn.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },

    debounce(fn, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          fn.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    // Carga asíncrona de assets con retry
    async loadWithRetry(loader, key, url, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          loader.add(key, url);
          return true;
        } catch (error) {
          if (attempt === maxRetries) {
            Logger.error(`Failed to load ${key} after ${maxRetries} attempts:`, error);
            return false;
          }
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      }
    }
  };


  // ==================== SISTEMA DE ESTILOS DE ALTO RENDIMIENTO ====================
  function injectPerformanceCSS() {
    const css = `
      html, body, #container {
        width: 100vw;
        height: 100vh;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #000;
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
        image-rendering: -moz-crisp-edges;
        image-rendering: -webkit-crisp-edges;
        image-rendering: pixelated;
        -webkit-font-smoothing: none;
        -moz-osx-font-smoothing: grayscale;
        transform: translateZ(0);
        backface-visibility: hidden;
      }
      
      body {
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        overscroll-behavior: none;
      }
      
      canvas {
        display: block;
        width: 100vw !important;
        height: 100vh !important;
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
        image-rendering: pixelated;
        outline: none;
      }
      
      /* Prevenir zoom en dispositivos móviles */
      * {
        -webkit-text-size-adjust: none;
        text-size-adjust: none;
      }
    `;
    
    try {
      const style = document.createElement('style');
      style.id = 'app-performance-styles';
      style.appendChild(document.createTextNode(css));
      
      // Inyectar al inicio del head para máxima prioridad
      document.head.insertBefore(style, document.head.firstChild);
      Logger.log('Performance CSS injected');
    } catch (e) {
      Logger.error('Failed to inject CSS:', e);
    }
  }

  // ==================== GESTIÓN DE CONTENEDOR OPTIMIZADA ====================
  function setupPerformanceContainer() {
    let container = document.getElementById('container');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'container';
      container.style.width = '100vw';
      container.style.height = '100vh';
      container.style.overflow = 'hidden';
      container.style.position = 'relative';
      document.body.appendChild(container);
    }
    
    // Limpiar hijos existentes que puedan interferir
    while (container.children.length > 0) {
      container.removeChild(container.firstChild);
    }
    
    // Prevenir acciones por defecto que afecten rendimiento
    container.addEventListener('contextmenu', e => e.preventDefault());
    container.addEventListener('dragstart', e => e.preventDefault());
    
    return container;
  }

  // ==================== SISTEMA DE JUEGO DE ALTO RENDIMIENTO ====================
  function createHighPerformanceGame() {
    // Verificar capacidades del dispositivo
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowEnd = navigator.hardwareConcurrency <= 4 || (navigator.deviceMemory || 4) <= 4;
    
    // Ajustar configuración basada en capacidades
    if (isMobile || isLowEnd) {
      ADVANCED_CONFIG.render.powerPreference = 'low-power';
      PERF_OPTIONS.chunkRadius = 1;
      PERF_OPTIONS.defaultPoolSize = 50;
      PERF_OPTIONS.textureCacheSizeMB = 50;
      Logger.log('Optimizing for mobile/low-end device');
    }
    
    if (window.phaserScaler && window.phaserScaler.game) {
      Logger.log('Using existing phaserScaler.game with performance enhancements');
      try { 
        if (window.phaserScaler.container) {
          const container = setupPerformanceContainer();
          window.phaserScaler.container = container;
        }
      } catch (e) {}
      return window.phaserScaler.game;
    }
    
    if (window.game && window.game instanceof Phaser.Game) {
      Logger.log('Using existing window.game with performance enhancements');
      return window.game;
    }
    
    try {
      const game = new Phaser.Game(ADVANCED_CONFIG);
      window.game = game;
      
      // Eventos de rendimiento del juego
      game.events.on('ready', () => {
        Logger.log('Game ready - applying performance optimizations');
        setTimeout(() => {
          if (window.perf) {
            window.perf.applyPixelPerfect({
              pixelArt: true,
              roundPixels: true,
              crispScaling: true,
              integerScaling: true
            });
          }
        }, 100);
      });
      
      game.events.on('blur', () => {
        Logger.perf('Game blurred - reducing performance load');
        // Reducir carga cuando el juego no está en foco
        if (window.perf) {
          window.perf.setQualityTier('low');
          window.perf.stopAllEmitters();
        }
      });
      
      game.events.on('focus', () => {
        Logger.perf('Game focused - restoring performance');
        // Restaurar configuración cuando el juego está en foco
        if (window.perf) {
          window.perf.enableAdaptivePerformance(true);
        }
      });
      
      Logger.log('Created new high-performance Phaser.Game instance');
      return game;
    } catch (e) {
      Logger.error('Failed to create Phaser.Game', e);
      throw e;
    }
  }

  // ==================== REGISTRO AUTOMÁTICO DE SCENECLASSES ====================
  function registerSceneClasses(game) {
    if (!game || !game.scene) {
      Logger.warn('Cannot register sceneClasses - game or scene plugin not available');
      return false;
    }

    let registeredCount = 0;
    
    // Registrar desde window.sceneClasses
    if (Array.isArray(window.sceneClasses)) {
      for (const entry of window.sceneClasses) {
        if (!entry || !entry.key || !Utils.isFunction(entry.cls)) {
          continue;
        }
        
        try {
          // Verificar si la escena ya existe
          const sceneExists = game.scene.keys && game.scene.keys[entry.key];
          if (!sceneExists) {
            game.scene.add(entry.key, entry.cls, false);
            registeredCount++;
            Logger.log('Registered scene from sceneClasses:', entry.key);
          } else {
            Logger.log('Scene already registered from sceneClasses:', entry.key);
          }
        } catch (e) {
          // Ignorar error de duplicado silenciosamente
          if (e.message && e.message.includes('duplicate key')) {
            Logger.log('Scene already registered (ignoring duplicate):', entry.key);
          } else {
            Logger.warn('Failed to register scene from sceneClasses:', entry.key, e.message);
          }
        }
      }
    }
    
    // Registrar desde window.GameScenes
    if (window.GameScenes && Utils.isObject(window.GameScenes)) {
      for (const key of Object.keys(window.GameScenes)) {
        const cls = window.GameScenes[key];
        if (!Utils.isFunction(cls)) continue;
        
        try {
          const sceneExists = game.scene.keys && game.scene.keys[key];
          if (!sceneExists) {
            game.scene.add(key, cls, false);
            registeredCount++;
            Logger.log('Registered scene from GameScenes:', key);
          } else {
            Logger.log('Scene already registered from GameScenes:', key);
          }
        } catch (e) {
          if (e.message && e.message.includes('duplicate key')) {
            Logger.log('Scene already registered (ignoring duplicate):', key);
          } else {
            Logger.warn('Failed to register scene from GameScenes:', key, e.message);
          }
        }
      }
    }
    
    Logger.log(`Total scenes registered: ${registeredCount}`);
    return registeredCount > 0;
  }

  // ==================== INICIO SEGURO DE ESCENAS CON PERFORMANCE ====================
  function safeStartScene(game, sceneKey, data = {}) {
    try {
      const scenes = game.scene;
      if (!scenes) {
        Logger.warn('No scene plugin available');
        return false;
      }

      // Verificar si la escena ya está activa
      try {
        const running = scenes.getScenes(true) || [];
        const isActive = running.some(s => 
          s && s.sys && s.sys.settings && s.sys.settings.key === sceneKey
        );
        
        if (isActive) {
          Logger.log('Scene already active:', sceneKey);
          return true;
        }
      } catch (e) {}

      // Intentar iniciar escena si ya está registrada
      if (scenes.keys && scenes.keys[sceneKey]) {
        try {
          scenes.start(sceneKey, data);
          Logger.log('Started registered scene:', sceneKey);
          return true;
        } catch (e) {
          Logger.warn('Failed to start registered scene:', sceneKey, e.message);
        }
      }

      Logger.warn('Scene not registered, cannot start:', sceneKey);
      return false;
    } catch (e) {
      Logger.error('safeStartScene fatal error', e);
      return false;
    }
  }

  // ==================== INTEGRACIÓN AVANZADA CON PhaserRPGPerf ====================
  async function integratePerfAndStartFirst(game, firstFriendly = BOOT_FIRST_SCENE) {
    function waitForPerf(timeout = 5000) {
      return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          if (window.PhaserRPGPerf) {
            Logger.log('PhaserRPGPerf loaded successfully');
            resolve(true);
          } else if (Date.now() - start > timeout) {
            Logger.warn('PhaserRPGPerf loading timeout');
            resolve(false);
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    const perfAvailable = await waitForPerf(5000);
    
    if (!perfAvailable) {
      Logger.warn('PhaserRPGPerf not available - registering scenes and starting directly');
      // Registrar sceneClasses antes de iniciar
      registerSceneClasses(game);
      safeStartScene(game, firstFriendly);
      return null;
    }

    try {
      const perf = window.PhaserRPGPerf.create(game, PERF_OPTIONS);
      window.perf = perf;
      
      // Configurar event listeners de performance
      setupPerformanceEvents(perf, game);
      
      // Registrar sceneClasses antes de intentar iniciar cualquier escena
      registerSceneClasses(game);
      
      // Intentar iniciar la escena después de un breve delay
      setTimeout(() => {
        try {
          const started = safeStartScene(game, firstFriendly);
          if (!started) {
            Logger.warn(`Scene ${firstFriendly} not registered - will retry`);
            // Reintentar después de más tiempo
            setTimeout(() => {
              registerSceneClasses(game);
              safeStartScene(game, firstFriendly);
            }, 500);
          }
        } catch (e) {
          Logger.warn('Scene start attempt failed:', e);
        }
      }, 100);
      
      // Aplicar optimizaciones gráficas
      setTimeout(() => {
        try {
          if (perf.applyPixelPerfect) {
            perf.applyPixelPerfect({
              pixelArt: true,
              roundPixels: true,
              crispScaling: true,
              integerScaling: true
            });
          }
          if (perf.enableHighPerformance) {
            perf.enableHighPerformance();
          }
          Logger.log('Advanced graphics optimizations applied');
        } catch (e) {
          Logger.warn('Graphics optimization error:', e);
        }
      }, 200);
      
      return perf;
    } catch (e) {
      Logger.error('Failed to create PhaserRPGPerf instance:', e);
      // Fallback: registrar e iniciar directamente
      registerSceneClasses(game);
      safeStartScene(game, firstFriendly);
      return null;
    }
  }

  // ==================== CONFIGURACIÓN DE EVENTOS DE PERFORMANCE ====================
  function setupPerformanceEvents(perf, game) {
    if (!perf || !game) return;
    
    // Monitorear cambios de calidad adaptativa
    game.events.on('qualitychanged', (data) => {
      Logger.perf(`Quality changed: ${data.from} -> ${data.to}`);
    });
    
    // Manejar advertencias de performance
    if (typeof window !== 'undefined') {
      window.addEventListener('phaserPerformanceWarning', (event) => {
        Logger.warn('Performance warning:', event.detail);
        
        // Tomar acciones automáticas basadas en advertencias
        if (event.detail.type === 'low_fps' && perf.adaptivePerformance) {
          perf.adaptivePerformance.forceQualityTier('medium');
        }
      });
    }
  }

  // ==================== REGISTRO MANUAL SEGURO DE ESCENAS ====================
  window.registerSceneLater = function registerSceneLater(game, friendlyName, cls, startNow = false, data = {}) {
    try {
      if (!game || !friendlyName || !Utils.isFunction(cls)) {
        Logger.warn('registerSceneLater: invalid parameters');
        return false;
      }

      const plugin = game.scene;
      if (!plugin || !plugin.add) {
        Logger.warn('registerSceneLater: scene plugin not available');
        return false;
      }

      // VERIFICACIÓN CRÍTICA: Evitar duplicados
      const sceneExists = plugin.keys && plugin.keys[friendlyName];
      if (sceneExists) {
        Logger.log('Scene already exists, skipping registration:', friendlyName);
        if (startNow) {
          try {
            plugin.start(friendlyName, data);
            Logger.log('Started existing scene:', friendlyName);
          } catch (startErr) {
            Logger.warn('Failed to start existing scene:', friendlyName, startErr);
          }
        }
        return true;
      }

      // Registrar escena solo si no existe
      try {
        plugin.add(friendlyName, cls, startNow, data);
        Logger.log('Scene registered manually:', friendlyName, 'startNow:', startNow);
        return true;
      } catch (e) {
        // Si falla por duplicado, ignorar el error
        if (e.message && e.message.includes('duplicate key')) {
          Logger.log('Scene already registered (ignoring duplicate error):', friendlyName);
          if (startNow) {
            try {
              plugin.start(friendlyName, data);
            } catch (startErr) {}
          }
          return true;
        }
        Logger.error('Scene registration failed:', friendlyName, e);
        return false;
      }
    } catch (e) {
      Logger.error('registerSceneLater unexpected error:', e);
      return false;
    }
  };

  // ==================== INICIO FORZADO OPTIMIZADO ====================
  window.forceStartFriendly = function(friendlyName, data = {}) {
    try {
      const game = window.game || (window.phaserScaler && window.phaserScaler.game);
      if (!game) {
        Logger.warn('forceStartFriendly: game not found');
        return false;
      }
      
      // Primero asegurarse de que las sceneClasses estén registradas
      registerSceneClasses(game);
      
      try {
        game.scene.start(friendlyName, data);
        Logger.log('Scene started directly:', friendlyName);
        return true;
      } catch (e) {
        // Si falla porque la escena no está registrada, intentar registrar desde sceneClasses
        if (e.message && (e.message.includes('No active Scene') || e.message.includes('invalid scene key'))) {
          Logger.warn('Scene not registered, checking sceneClasses:', friendlyName);
          
          // Buscar en sceneClasses y registrar si existe
          if (Array.isArray(window.sceneClasses)) {
            const sceneEntry = window.sceneClasses.find(entry => entry && entry.key === friendlyName);
            if (sceneEntry && Utils.isFunction(sceneEntry.cls)) {
              Logger.log('Found scene in sceneClasses, registering now:', friendlyName);
              return window.registerSceneLater(game, friendlyName, sceneEntry.cls, true, data);
            }
          }
          
          // Buscar en GameScenes
          if (window.GameScenes && window.GameScenes[friendlyName] && Utils.isFunction(window.GameScenes[friendlyName])) {
            Logger.log('Found scene in GameScenes, registering now:', friendlyName);
            return window.registerSceneLater(game, friendlyName, window.GameScenes[friendlyName], true, data);
          }
        }
        
        Logger.warn('forceStartFriendly failed:', e);
        return false;
      }
    } catch (e) {
      Logger.error('forceStartFriendly unexpected error:', e);
      return false;
    }
  };

  // ==================== HELPERS DE PERFORMANCE ====================
  window.RPGPerfHelpers = window.RPGPerfHelpers || {};
  
  // Sistema de pooling optimizado
  window.RPGPerfHelpers.createAdvancedPool = function(scene, key, factoryFn, size = 50, resetFn = null) {
    if (window.perf && Utils.isFunction(window.perf.createPool)) {
      window.perf.createPool(key, factoryFn, size, resetFn);
      Logger.perf('Advanced pool created:', key, 'size:', size);
    } else {
      // Fallback básico
      scene[key + 'Pool'] = [];
      for (let i = 0; i < size; i++) {
        scene[key + 'Pool'].push(factoryFn());
      }
    }
  };
  
  // Culling avanzado
  window.RPGPerfHelpers.addToAdvancedCull = function(obj, options = {}) {
    if (window.perf && Utils.isFunction(window.perf.addToCull)) {
      window.perf.addToCull(obj, options);
    }
  };
  
  // Clamp de cámara optimizado
  window.RPGPerfHelpers.attachClamp = function(scene, bounds, opts = {}) {
    try {
      if (window.perf && Utils.isFunction(window.perf.attachCameraClamp)) {
        return window.perf.attachCameraClamp(scene, bounds, opts);
      }
      
      // Implementación fallback
      const cam = scene.cameras && scene.cameras.main;
      if (!cam) return () => {};
      
      cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
      
      if (scene.physics && scene.physics.world) {
        scene.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height, true, true, true, true);
      }
      
      const minZoom = opts.minZoom || 0.5;
      const maxZoom = opts.maxZoom || 2;
      const smooth = opts.smooth !== false;
      
      const updateFn = Utils.throttle(() => {
        try {
          const maxX = bounds.x + Math.max(0, bounds.width - cam.width);
          const maxY = bounds.y + Math.max(0, bounds.height - cam.height);
          
          let sx = cam.scrollX, sy = cam.scrollY;
          let changed = false;
          
          if (sx < bounds.x) { sx = bounds.x; changed = true; }
          if (sy < bounds.y) { sy = bounds.y; changed = true; }
          if (sx > maxX) { sx = maxX; changed = true; }
          if (sy > maxY) { sy = maxY; changed = true; }
          
          if (changed) {
            if (smooth) {
              cam.scrollX = Phaser.Math.Linear(cam.scrollX, sx, 0.1);
              cam.scrollY = Phaser.Math.Linear(cam.scrollY, sy, 0.1);
            } else {
              cam.setScroll(Math.round(sx), Math.round(sy));
            }
            
            if (cam.zoom < minZoom) cam.setZoom(minZoom);
            if (cam.zoom > maxZoom) cam.setZoom(maxZoom);
          }
        } catch (e) {}
      }, 16); // 60fps throttling
      
      if (scene.sys && scene.sys.events) {
        scene.sys.events.on('update', updateFn);
      }
      
      return () => {
        try {
          if (scene.sys && scene.sys.events) {
            scene.sys.events.off('update', updateFn);
          }
        } catch (e) {}
      };
    } catch (e) {
      Logger.warn('attachClamp error:', e);
      return () => {};
    }
  };

  // ==================== SISTEMA DE RESIZE OPTIMIZADO ====================
  const resizeManager = {
    lastResize: 0,
    resizeThrottle: 100, // ms
    pendingResize: false,
    
    handleResize() {
      const now = Date.now();
      if (now - this.lastResize < this.resizeThrottle) {
        this.pendingResize = true;
        return;
      }
      
      this.lastResize = now;
      this.performResize();
    },
    
    performResize() {
      try {
        const game = window.game || (window.phaserScaler && window.phaserScaler.game);
        const container = document.getElementById('container');
        
        if (container) {
          const canvas = container.querySelector('canvas');
          if (canvas) {
            // Aplicar estilos de performance
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.imageRendering = 'pixelated';
            
            // Solo actualizar dimensions si es necesario
            const dpr = window.devicePixelRatio || 1;
            const newWidth = Math.floor(window.innerWidth * dpr);
            const newHeight = Math.floor(window.innerHeight * dpr);
            
            if (canvas.width !== newWidth || canvas.height !== newHeight) {
              canvas.width = newWidth;
              canvas.height = newHeight;
            }
          }
        }
        
        if (game && game.scale && Utils.isFunction(game.scale.resize)) {
          try {
            game.scale.resize(window.innerWidth, window.innerHeight);
            
            // Re-aplicar optimizaciones después del resize
            if (window.perf && Utils.isFunction(window.perf.applyPixelPerfect)) {
              setTimeout(() => {
                window.perf.applyPixelPerfect({
                  pixelArt: true,
                  roundPixels: true,
                  crispScaling: true
                });
              }, 50);
            }
          } catch (e) {
            Logger.warn('Game scale resize error:', e);
          }
        }
        
        // Manejar resize pendiente
        if (this.pendingResize) {
          this.pendingResize = false;
          setTimeout(() => this.handleResize(), this.resizeThrottle);
        }
      } catch (e) {
        Logger.error('Resize error:', e);
      }
    }
  };

  // ==================== BOOTSTRAP DE ALTO RENDIMIENTO ====================
  async function bootstrap() {
    try {
      // Inyectar CSS de performance primero
      injectPerformanceCSS();
      
      // Configurar contenedor optimizado
      setupPerformanceContainer();
      
      // Crear juego de alto rendimiento
      const game = createHighPerformanceGame();
      
      // Integrar PhaserRPGPerf y registrar sceneClasses automáticamente
      const perf = await integratePerfAndStartFirst(game, BOOT_FIRST_SCENE);
      
      Logger.log('High-performance bootstrap complete - Perf integrated:', !!perf);
      
      // Verificación post-inicialización con múltiples intentos
      const maxAttempts = 5;
      let attempts = 0;
      
      const checkAndStartScene = () => {
        attempts++;
        try {
          const scenes = game.scene;
          if (!scenes) return;
          
          const activeScenes = scenes.getScenes(true) || [];
          const targetSceneActive = activeScenes.some(scene => {
            const key = scene && scene.sys && scene.sys.settings && scene.sys.settings.key;
            return key && key === BOOT_FIRST_SCENE;
          });
          
          if (!targetSceneActive) {
            if (attempts < maxAttempts) {
              Logger.log(`Target scene not active (attempt ${attempts}/${maxAttempts}) - retrying...`);
              // Re-registrar sceneClasses y reintentar
              registerSceneClasses(game);
              window.forceStartFriendly(BOOT_FIRST_SCENE);
              setTimeout(checkAndStartScene, 500);
            } else {
              Logger.warn(`Failed to start scene after ${maxAttempts} attempts:`, BOOT_FIRST_SCENE);
            }
          } else {
            Logger.log('Target scene active:', BOOT_FIRST_SCENE);
          }
        } catch (e) {
          Logger.warn('Post-boot verification error:', e);
        }
      };
      
      // Iniciar verificación después de un breve delay
      setTimeout(checkAndStartScene, 1000);
      
      // Resize inicial optimizado
      setTimeout(() => resizeManager.handleResize(), 200);
      setTimeout(() => resizeManager.handleResize(), 1000);
      
      return { game, perf };
    } catch (e) {
      Logger.error('Bootstrap fatal error:', e);
      throw e;
    }
  }

  // ==================== INICIALIZACIÓN Y EVENT LISTENERS ====================
  
  // Configurar resize optimizado
  window.addEventListener('resize', () => resizeManager.handleResize());
  window.addEventListener('orientationchange', Utils.debounce(() => {
    setTimeout(() => resizeManager.handleResize(), 100);
  }, 250));
  
  // Prevenir comportamientos por defecto que afecten rendimiento
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  
  // Inicialización
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(bootstrap, 10);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(bootstrap, 10));
  }
  
  // API pública
  window.startGame = function() {
    try {
      return bootstrap();
    } catch (e) {
      Logger.error('startGame error:', e);
      return null;
    }
  };
  
  // API de diagnóstico de performance
  window.getPerformanceStats = function() {
    if (window.perf && Utils.isFunction(window.perf.getStats)) {
      return window.perf.getStats();
    }
    return { error: 'Performance stats not available' };
  };
  
  // Force cleanup
  window.forceCleanup = function() {
    if (window.perf && Utils.isFunction(window.perf.cleanup)) {
      const cleaned = window.perf.cleanup();
      Logger.log('Performance cleanup completed, removed:', cleaned, 'objects');
    }
    
    if (window.perf && Utils.isFunction(window.perf.destroy)) {
      window.perf.destroy();
      Logger.log('Performance system destroyed');
    }
  };

})();