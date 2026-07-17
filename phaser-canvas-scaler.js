
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
 * VERSIÓN: v13.2.0-fixed
 * GENERADO: 12/19/2025
 * ============================================================================
 */

/*
  Phaser Canvas Scaler - phaser-canvas-scaler.js
  Version: 2.1.0 (Fixed + Improved)
*/

(function (global) {
  'use strict';

  // FIX #1: parent NO se evalúa aquí — document.body puede ser null si el script
  // está en <head>. Se resuelve en el constructor cuando el DOM ya existe.
  const DEFAULTS = {
    parent:                null,          // resuelto en constructor
    designWidth:           1280,
    designHeight:          720,
    scaleMode:             'contain',     // 'contain' | 'cover' | 'stretch'
    backgroundColor:       '#000000',
    zIndex:                1,
    pixelArt:              true,
    roundPixels:           true,
    autoCenter:            true,
    preferWebGL:           true,
    preferWebGL2:          true,
    resizeDebounce:        100,
    allowFullScreen:       true,
    phaserConfig:          {},
    canvasId:              null,          // FIX SEC#2: null = auto-generado
    maxDPI:                2,
    touchAction:           'none',
    preventDefaultEvents:  true,
    highPerformanceMode:   'auto'
  };

  // FIX #6: usar Object.assign en lugar de for..in para evitar iterar
  // propiedades heredadas del prototipo (prototype pollution vector)
  function merge(a, b) {
    return Object.assign({}, a, b);
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const ctx  = this;
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  // Detección de dispositivo — complementada con tamaño de pantalla
  // FIX WARN#5: tablets Android con "Mobile" en UA ya no quedan mal clasificados
  function getDeviceInfo() {
    const ua       = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isIOS    = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid= /Android/i.test(ua);
    const isChrome = /Chrome/i.test(ua);
    const isFirefox= /Firefox/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);

    // Usar tamaño de pantalla como criterio adicional para tablet
    const screenMin = Math.min(window.screen.width, window.screen.height);
    const isTablet  = isMobile && screenMin >= 768;

    const cores    = navigator.hardwareConcurrency || 4;
    const memory   = navigator.deviceMemory       || 4;
    const isLowEnd = cores <= 2 || memory <= 2;

    return { isMobile, isTablet, isIOS, isAndroid, isChrome, isFirefox, isSafari, isLowEnd, cores, memory };
  }

  // Detección de Brave (asíncrona)
  function detectBrave() {
    try {
      if (navigator && typeof navigator.brave === 'object' &&
          typeof navigator.brave.isBrave === 'function') {
        return navigator.brave.isBrave().then(r => !!r).catch(() => false);
      }
    } catch (e) {}
    return Promise.resolve(false);
  }

  // ─── Sistema de eventos ───────────────────────────────────────────────────

  class EventSystem {
    constructor() {
      this.listeners = new Map();
    }

    on(event, callback) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(callback);
      return this; // chainable
    }

    off(event, callback) {
      if (this.listeners.has(event)) this.listeners.get(event).delete(callback);
      return this;
    }

    emit(event, data) {
      if (!this.listeners.has(event)) return;
      this.listeners.get(event).forEach(cb => {
        try { cb(data); } catch (e) { console.warn('Event callback error:', e); }
      });
    }

    destroy() { this.listeners.clear(); }
  }

  // ─── Clase principal ──────────────────────────────────────────────────────

  class PhaserCanvasScaler {
    constructor(options = {}) {
      this.opts   = merge(DEFAULTS, options || {});
      this.device = getDeviceInfo();
      this.events = new EventSystem();

      // FIX #4 / MEJ#3: Promise pública — el usuario puede hacer:
      //   new PhaserCanvasScaler(opts).ready.then(({ game }) => ...)
      this.ready = new Promise(resolve => { this._resolveReady = resolve; });

      // Estado interno
      this.game       = null;
      this.canvas     = null;
      this.isWebGL2   = false;
      this._isBrave   = false;
      this._destroyed = false;

      // FIX #1: resolver parent ahora que el DOM existe
      if (this.opts.parent === null || this.opts.parent === undefined) {
        this.opts.parent = document.body;
      } else if (typeof this.opts.parent === 'string') {
        this.opts.parent = document.querySelector(this.opts.parent) || document.body;
      }

      // FIX SEC#2: generar canvasId único si no se especificó
      if (!this.opts.canvasId) {
        this.opts.canvasId = 'phaser-canvas-' + Math.random().toString(36).slice(2, 9);
      }

      // FIX #7: guardar opciones de performance ANTES de optimizaciones de dispositivo
      // para saber cuáles especificó el usuario y no sobreescribirlas
      this._userOpts = {
        highPerformanceMode: options.highPerformanceMode,
        maxDPI:              options.maxDPI
      };

      this._applyDeviceOptimizations();

      // Handlers enlazados una sola vez
      this._onWindowResize      = debounce(this._onWindowResize.bind(this),      this.opts.resizeDebounce);
      this._onOrientationChange = this._onOrientationChange.bind(this);
      this._onVisibilityChange  = this._onVisibilityChange.bind(this);

      // MEJ#5: guardar estilos originales de body/html para restaurar en destroy()
      this._savedBodyStyles = this._captureStyles(document.body,             ['margin','padding','overflow','width','height']);
      this._savedHtmlStyles = this._captureStyles(document.documentElement,  ['margin','padding','overflow','width','height']);

      this._ensurePhaserExists();
      this._createContainer();

      // Inicialización asíncrona (detectBrave)
      detectBrave()
        .then(isBrave  => { this._isBrave = !!isBrave; })
        .catch(()      => { this._isBrave = false;      })
        .finally(()    => {
          if (this._destroyed) return;
          this._createCanvasAndGame();
          this._attachListeners();
          this._onWindowResize();

          // MEJ#3: emitir 'ready' + resolver Promise pública
          const readyData = { device: this.device, isWebGL2: this.isWebGL2, isBrave: this._isBrave };
          this.events.emit('ready', readyData);
          this._resolveReady(readyData);
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _captureStyles(el, props) {
      if (!el) return {};
      const saved = {};
      props.forEach(p => { saved[p] = el.style[p] || ''; });
      return saved;
    }

    _restoreStyles(el, saved) {
      if (!el || !saved) return;
      Object.keys(saved).forEach(p => { el.style[p] = saved[p]; });
    }

    // FIX #7: solo aplicar optimizaciones automáticas si el usuario
    // no especificó explícitamente esas opciones
    _applyDeviceOptimizations() {
      if (this.device.isMobile || this.device.isLowEnd) {
        if (this._userOpts.maxDPI === undefined) {
          this.opts.maxDPI = Math.min(this.opts.maxDPI, 1.5);
        }
        if (this._userOpts.highPerformanceMode === undefined) {
          this.opts.highPerformanceMode = 'low';
        }
        this.opts.resizeDebounce = 150;
      } else {
        if (this._userOpts.highPerformanceMode === undefined) {
          this.opts.highPerformanceMode = 'high';
        }
      }

      // Safari/iOS tienen mejor soporte con WebGL1
      if (this.device.isIOS || this.device.isSafari) {
        this.opts.preferWebGL2 = false;
      }
    }

    _ensurePhaserExists() {
      if (!global.Phaser) {
        throw new Error('Phaser not found. Carga Phaser 3 antes de usar PhaserCanvasScaler.');
      }
    }

    // ─── Contenedor ───────────────────────────────────────────────────────────

    _createContainer() {
      this.container = document.createElement('div');
      this.container.className = 'phaser-canvas-scaled-root';
      const st = this.container.style;

      st.position = 'relative';
      st.width    = '100%';
      st.height   = '100%';
      st.margin   = '0';
      st.padding  = '0';
      st.overflow = 'hidden';
      st.zIndex   = String(parseInt(this.opts.zIndex, 10) || 1); // FIX SEC#1: entero seguro
      st.background = this._sanitizeColor(this.opts.backgroundColor);

      st.webkitUserSelect      = 'none';
      st.userSelect            = 'none';
      st.webkitTouchCallout    = 'none';
      st.webkitTapHighlightColor = 'transparent';

      if (this.opts.parent === document.body) {
        const body = document.body;
        const html = document.documentElement;

        body.style.margin   = '0';
        body.style.padding  = '0';
        body.style.overflow = 'hidden';
        body.style.width    = '100vw';
        body.style.height   = '100vh';
        html.style.margin   = '0';
        html.style.padding  = '0';
        html.style.overflow = 'hidden';
        html.style.width    = '100vw';
        html.style.height   = '100vh';

        st.position = 'fixed';
        st.left     = '0';
        st.top      = '0';
        st.width    = '100vw';
        st.height   = '100vh';
      }

      this.opts.parent.appendChild(this.container);
    }

    // ─── Canvas y juego ───────────────────────────────────────────────────────

    _createCanvasAndGame() {
      const Phaser = global.Phaser;

      this.canvas    = document.createElement('canvas');
      this.canvas.id = this.opts.canvasId;
      this._applyCanvasStyles();

      // FIX #5: handlers separados por tipo para que funcionen correctamente
      if (this.opts.preventDefaultEvents) {
        this._preventDefaultEvents();
      }

      this.container.appendChild(this.canvas);

      // MEJ#1: registrar handler de pérdida de contexto WebGL
      this.canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        console.warn('[PhaserCanvasScaler] Contexto WebGL perdido');
        this.events.emit('contextlost');
      });

      this.canvas.addEventListener('webglcontextrestored', () => {
        console.warn('[PhaserCanvasScaler] Contexto WebGL restaurado');
        this.events.emit('contextrestored');
      });

      // FIX #3: NO llamar getContext() aquí — dejamos que Phaser
      // gestione su propio contexto. isWebGL2 se detecta DESPUÉS de la init.
      // FIX #2: eliminado completamente el shim de HTMLCanvasElement.prototype

      const type     = this._getRendererType();
      const scaleCfg = this._getScaleConfig();

      const baseConfig = merge({
        type,
        parent:          this.container,
        canvas:          this.canvas,
        width:           this.opts.designWidth,
        height:          this.opts.designHeight,
        backgroundColor: this.opts.backgroundColor,
        pixelArt:        this.opts.pixelArt,
        roundPixels:     this.opts.roundPixels,
        scale:           scaleCfg,
        render:          this._getRenderConfig()
        // MEJ#4: physics eliminada — el usuario la configura vía phaserConfig
      }, this.opts.phaserConfig);

      this._createGameWithFallback(baseConfig);

      // Detectar WebGL2 DESPUÉS de que Phaser creó su renderer
      if (this.game && this.game.renderer && this.game.renderer.gl) {
        this.isWebGL2 = this.game.renderer.gl instanceof WebGL2RenderingContext;
      }
    }

    _applyCanvasStyles() {
      if (!this.canvas) return;
      const st = this.canvas.style;

      st.display     = 'block';
      st.position    = 'absolute';
      st.left        = '50%';
      st.top         = '50%';
      st.transform   = 'translate(-50%, -50%)';
      st.imageRendering = this.opts.pixelArt ? 'pixelated' : 'auto';
      st.maxWidth    = '100%';
      st.maxHeight   = '100%';
      st.width       = 'auto';
      st.height      = 'auto';
      st.zIndex      = String(parseInt(this.opts.zIndex, 10) || 1);
      st.touchAction = this.opts.touchAction;

      st.webkitTouchCallout = 'none';
      st.webkitUserSelect   = 'none';
      st.userSelect         = 'none';

      if (this.device.isIOS) {
        // Prevenir zoom en iOS sin GPU layer trick que aumenta memoria
        st.webkitTransform = 'translateZ(0)';
      }

      this.canvas.setAttribute('touch-action', this.opts.touchAction);
    }

    // FIX #5: handlers separados — touch multi-toque, pointer/mouse directo
    _preventDefaultEvents() {
      const touchPreventer = (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      };
      const directPreventer = (e) => { e.preventDefault(); };

      // Multi-touch en el canvas
      ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(ev => {
        this.canvas.addEventListener(ev, touchPreventer, { passive: false });
      });

      // Estos siempre se previenen directamente
      ['contextmenu', 'dragstart', 'selectstart'].forEach(ev => {
        this.canvas.addEventListener(ev, directPreventer, { passive: false });
      });

      // Guardar referencias para cleanup
      this._touchPreventer  = touchPreventer;
      this._directPreventer = directPreventer;
    }

    _getRendererType() {
      const Phaser = global.Phaser;
      if (!this.opts.preferWebGL) return Phaser.CANVAS;
      // FIX #3: no tenemos glContext propio — usar AUTO para que Phaser decida
      return Phaser.AUTO;
    }

    _getScaleConfig() {
      const Phaser = global.Phaser;
      return {
        mode:       Phaser.Scale.NONE,
        autoCenter: this.opts.autoCenter ? Phaser.Scale.CENTER_BOTH : Phaser.Scale.NO_CENTER,
        width:      this.opts.designWidth,
        height:     this.opts.designHeight
      };
    }

    _getRenderConfig() {
      return {
        pixelArt:              this.opts.pixelArt,
        roundPixels:           this.opts.roundPixels,
        powerPreference:       this.opts.highPerformanceMode === 'high' ? 'high-performance' : 'default',
        antialias:             !this.opts.pixelArt,
        antialiasGL:           false,
        preserveDrawingBuffer: false,
        // FIX SEC#4: xrCompatible false — reservar recursos XR solo si se necesita
        xrCompatible:          false,
        mipmapFilter:          this.opts.pixelArt ? 'NEAREST_MIPMAP_NEAREST' : 'LINEAR_MIPMAP_LINEAR'
      };
    }

    _createGameWithFallback(baseConfig) {
      const Phaser = global.Phaser;
      this._lastBaseConfig = baseConfig; // guardado para posible restauración tras contextrestored

      try {
        this.game = new Phaser.Game(baseConfig);
      } catch (primaryError) {
        console.warn('[PhaserCanvasScaler] Fallo creación primaria, intentando fallback:', primaryError);

        try {
          if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
          }

          const fallbackConfig = Object.assign({}, baseConfig, { canvas: undefined });
          this.canvas   = null;
          this.isWebGL2 = false;

          this.game = new Phaser.Game(fallbackConfig);

          // Esperar a que Phaser cree el canvas y aplicar estilos
          setTimeout(() => {
            if (this.game && this.game.canvas) {
              this.canvas = this.game.canvas;
              this._applyCanvasStyles();
            }
          }, 100);

        } catch (fallbackError) {
          console.error('[PhaserCanvasScaler] Todos los intentos fallaron:', fallbackError);
          throw fallbackError;
        }
      }
    }

    // ─── Listeners ────────────────────────────────────────────────────────────

    _attachListeners() {
      // MEJ#2: ResizeObserver para detectar cambios en el contenedor padre
      // (no solo en el viewport del navegador)
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => this._onWindowResize());
        this._resizeObserver.observe(this.opts.parent);
      }

      // window.resize como fallback / complemento
      window.addEventListener('resize',            this._onWindowResize,      { passive: true });
      window.addEventListener('orientationchange', this._onOrientationChange, { passive: true });
      document.addEventListener('visibilitychange', this._onVisibilityChange);

      if (this.opts.preventDefaultEvents) {
        document.addEventListener('touchmove',     this._preventScroll,   { passive: false });
        document.addEventListener('gesturestart',  this._preventGesture);
        document.addEventListener('gesturechange', this._preventGesture);
        document.addEventListener('gestureend',    this._preventGesture);
      }
    }

    _preventScroll = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };

    _preventGesture = (e) => { e.preventDefault(); };

    _onVisibilityChange = () => {
      if (!this.game) return;
      if (document.hidden) {
        this.events.emit('hidden');
        if (this.game.loop) this.game.loop.pause();
      } else {
        this.events.emit('visible');
        if (this.game.loop) this.game.loop.resume();
        setTimeout(() => this._onWindowResize(), 100);
      }
    };

    // FIX WARN#4: un solo resize con delay suficiente, sin doble disparo
    _onOrientationChange() {
      setTimeout(() => this._onWindowResize(), 300);
    }

    // ─── Resize ───────────────────────────────────────────────────────────────

    _onWindowResize() {
      if (!this.game || !this.container || this._destroyed) return;

      try {
        const cw = this.container.clientWidth  || window.innerWidth;
        const ch = this.container.clientHeight || window.innerHeight;
        const dw = this.opts.designWidth;
        const dh = this.opts.designHeight;

        let cssW = cw;
        let cssH = ch;

        // FIX WARN#1: 'fit' eliminado (era idéntico a 'contain').
        // Modos: 'contain', 'cover', 'stretch'
        switch (this.opts.scaleMode) {
          case 'contain': {
            const s = Math.min(cw / dw, ch / dh);
            cssW = Math.round(dw * s);
            cssH = Math.round(dh * s);
            break;
          }
          case 'cover': {
            const s = Math.max(cw / dw, ch / dh);
            cssW = Math.round(dw * s);
            cssH = Math.round(dh * s);
            break;
          }
          case 'stretch':
          default:
            cssW = cw;
            cssH = ch;
            break;
        }

        if (this.canvas) {
          this.canvas.style.width  = cssW + 'px';
          this.canvas.style.height = cssH + 'px';
        }

        const dpr      = Math.min(window.devicePixelRatio || 1, this.opts.maxDPI);
        const physicalW = Math.max(1, Math.floor(cssW * dpr));
        const physicalH = Math.max(1, Math.floor(cssH * dpr));

        this._updatePhaserSize(cssW, cssH, physicalW, physicalH);

        this.events.emit('resize', {
          cssWidth:      cssW,
          cssHeight:     cssH,
          physicalWidth: physicalW,
          physicalHeight:physicalH,
          dpr,
          scaleMode:     this.opts.scaleMode,
          isWebGL2:      this.isWebGL2
        });

      } catch (error) {
        console.warn('[PhaserCanvasScaler] Resize error:', error);
      }
    }

    _updatePhaserSize(cssW, cssH, physicalW, physicalH) {
      if (!this.game) return;

      try {
        if (this.canvas) {
          this.canvas.width  = physicalW;
          this.canvas.height = physicalH;
        }

        if (this.game.scale && typeof this.game.scale.resize === 'function') {
          this.game.scale.resize(cssW, cssH);
          // FIX WARN#3: eliminada la segunda llamada a displaySize.setSize —
          // game.scale.resize() ya lo gestiona internamente
        }

        if (this.game.renderer && typeof this.game.renderer.resize === 'function') {
          try {
            this.game.renderer.resize(physicalW, physicalH);
          } catch (_) {
            this.game.renderer.resize(cssW, cssH);
          }
        }

      } catch (error) {
        console.warn('[PhaserCanvasScaler] Phaser resize error:', error);
      }
    }

    // ─── Sanitización ─────────────────────────────────────────────────────────

    // FIX SEC#1: validar colores CSS para evitar CSS injection
    _sanitizeColor(color) {
      if (typeof color !== 'string') return '#000000';
      const trimmed = color.trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed))          return trimmed;
      if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(trimmed)) return trimmed;
      if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/.test(trimmed)) return trimmed;
      if (/^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/.test(trimmed)) return trimmed;
      console.warn('[PhaserCanvasScaler] Color inválido ignorado:', color);
      return '#000000';
    }

    // ─── API pública ──────────────────────────────────────────────────────────

    // FIX WARN#2: setBackground ahora actualiza el renderer en runtime
    setBackground(color) {
      const safe = this._sanitizeColor(color);
      this.opts.backgroundColor = safe;
      if (this.container) this.container.style.background = safe;

      if (this.game) {
        // Actualizar renderer directamente
        if (this.game.renderer && typeof this.game.renderer.setBackgroundColor === 'function') {
          this.game.renderer.setBackgroundColor(safe);
        }
        // Actualizar todas las cámaras activas
        if (this.game.scene) {
          this.game.scene.getScenes(true).forEach(scene => {
            if (scene.cameras && scene.cameras.main) {
              scene.cameras.main.setBackgroundColor(safe);
            }
          });
        }
      }
    }

    toggleFullScreen() {
      if (!this.opts.allowFullScreen) return;

      if (!document.fullscreenElement) {
        const el = this.container;
        if      (el.requestFullscreen)       el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen)     el.msRequestFullscreen();
      } else {
        if      (document.exitFullscreen)       document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen)     document.msExitFullscreen();
      }

      setTimeout(() => this._onWindowResize(), 300);
    }

    setZIndex(z) {
      const safe = String(parseInt(z, 10) || 0); // FIX SEC#1: entero seguro
      this.opts.zIndex = safe;
      if (this.container) this.container.style.zIndex = safe;
      if (this.canvas)    this.canvas.style.zIndex    = safe;
    }

    setPerformanceMode(mode) {
      this.opts.highPerformanceMode = mode;
      this._onWindowResize();
    }

    // ─── Destrucción ──────────────────────────────────────────────────────────

    destroy() {
      this._destroyed = true;

      // Desconectar ResizeObserver (MEJ#2)
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }

      // Remover event listeners globales
      window.removeEventListener('resize',            this._onWindowResize);
      window.removeEventListener('orientationchange', this._onOrientationChange);
      document.removeEventListener('visibilitychange', this._onVisibilityChange);

      if (this.opts.preventDefaultEvents) {
        document.removeEventListener('touchmove',     this._preventScroll);
        document.removeEventListener('gesturestart',  this._preventGesture);
        document.removeEventListener('gesturechange', this._preventGesture);
        document.removeEventListener('gestureend',    this._preventGesture);
      }

      // Remover listeners del canvas
      if (this.canvas) {
        if (this._touchPreventer) {
          ['touchstart','touchmove','touchend','touchcancel'].forEach(ev => {
            this.canvas.removeEventListener(ev, this._touchPreventer);
          });
        }
        if (this._directPreventer) {
          ['contextmenu','dragstart','selectstart'].forEach(ev => {
            this.canvas.removeEventListener(ev, this._directPreventer);
          });
        }
      }

      // Destruir juego Phaser
      if (this.game) {
        try { this.game.destroy(true, false); } catch (e) { /* ignorar */ }
        this.game = null;
      }

      // Remover contenedor del DOM
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }

      // MEJ#5: restaurar estilos originales de body/html
      this._restoreStyles(document.body,            this._savedBodyStyles);
      this._restoreStyles(document.documentElement, this._savedHtmlStyles);

      // Destruir sistema de eventos
      if (this.events) this.events.destroy();

      this.canvas   = null;
      this.isWebGL2 = false;
    }
  }

  // ─── Exportación ──────────────────────────────────────────────────────────

  try {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
      module.exports = PhaserCanvasScaler;
    } else if (typeof define === 'function' && define.amd) {
      define(() => PhaserCanvasScaler);
    } else {
      global.PhaserCanvasScaler = PhaserCanvasScaler;
    }
  } catch (e) {
    if (typeof window !== 'undefined') {
      window.PhaserCanvasScaler = PhaserCanvasScaler;
    }
  }

})(typeof window !== 'undefined' ? window : this);
