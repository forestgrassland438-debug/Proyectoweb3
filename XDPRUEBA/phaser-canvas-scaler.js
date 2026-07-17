/*
Phaser Canvas Scaler - phaser-canvas-scaler.js
Version: 1.0.0
Author: ChatGPT (generado bajo petición)

Descripción:
Esta librería crea y gestiona un canvas para Phaser 3 que siempre pinta a resolución completa
(con soporte HiDPI / devicePixelRatio), escala de forma proporcional para móviles y navegadores,
soporta varios modos de ajuste (contain/cover/stretch), maneja cambio de tamaño y orientación,
y expone utilidades para fullscreen y control de z-index.

Requisitos:
- Phaser 3 debe estar cargado previamente (por ejemplo <script src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"></script>).
- Incluir este archivo después de Phaser o importarlo como módulo.

Uso rápido (ejemplo en alto nivel):
- Incluir phaser y este script en tu HTML.
- Crear la instancia:
    new PhaserCanvasScaler({
      parent: '#game-root',           // contenedor css selector o elemento DOM
      designWidth: 1280,             // resolución "diseño" base
      designHeight: 720,
      scaleMode: 'contain',          // 'contain' | 'cover' | 'stretch'
      phaserConfig: {                // configuración adicional para Phaser
        scene: [MyScene],
        // cualquier otra propiedad de configuración de Phaser
      }
    });

Notas:
- La librería intenta usar Phaser.Scale.NONE y controlar directamente el tamaño físico del canvas
  para forzar una renderización con el devicePixelRatio correcto y evitar imágenes borrosas en HiDPI.
- Si usas módulos ES y bundles, puedes importar como módulo; si no, se expone como window.PhaserCanvasScaler.

*/

(function (global) {
  'use strict';

  const DEFAULTS = {
    parent: document.body,
    designWidth: 1280,
    designHeight: 720,
    scaleMode: 'contain', // 'contain' | 'cover' | 'stretch'
    backgroundColor: '#000000',
    zIndex: 1,
    pixelArt: false,
    roundPixels: false,
    autoCenter: true,
    preferWebGL: true,
    resizeDebounce: 80,
    allowFullScreen: true,
    phaserConfig: {},
  };

  function merge(a, b) {
    const out = {};
    for (const k in a) out[k] = a[k];
    for (const k in b) out[k] = b[k];
    return out;
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  class PhaserCanvasScaler {
    constructor(options = {}) {
      this.opts = merge(DEFAULTS, options || {});
      if (typeof this.opts.parent === 'string') {
        const el = document.querySelector(this.opts.parent);
        if (el) this.opts.parent = el; else this.opts.parent = document.body;
      }

      this.game = null;
      this._onWindowResize = debounce(this._onWindowResize.bind(this), this.opts.resizeDebounce);
      this._onOrientationChange = this._onOrientationChange.bind(this);

      this._ensurePhaserExists();
      this._createContainer();
      this._createGame();
      this._attachListeners();
      // initial resize
      this._onWindowResize();
    }

    _ensurePhaserExists() {
      if (!global.Phaser) {
        throw new Error('Phaser not found. Carga Phaser 3 antes de usar PhaserCanvasScaler.');
      }
    }

    _createContainer() {
      // contenedor que aloja el canvas (por si el usuario pasa document.body)
      this.container = document.createElement('div');
      this.container.className = 'phaser-canvas-scaled-root';
      const st = this.container.style;
      st.position = 'relative';
      st.width = '100%';
      st.height = '100%';
      st.margin = '0';
      st.padding = '0';
      st.overflow = 'hidden';
      st.zIndex = this.opts.zIndex;

      // Si parent es body, ajustamos para pantalla completa
      if (this.opts.parent === document.body) {
        const body = document.body;
        const html = document.documentElement;
        body.style.height = '100%';
        body.style.width = '100%';
        html.style.height = '100%';
        html.style.width = '100%';
        this.opts.parent.appendChild(this.container);
        // Aseguramos que el contenedor ocupe toda la ventana
        st.position = 'fixed';
        st.left = '0'; st.top = '0'; st.right = '0'; st.bottom = '0';
      } else {
        this.opts.parent.appendChild(this.container);
      }
    }

    _createGame() {
      const Phaser = global.Phaser;
      const type = (this.opts.preferWebGL && Phaser.WEBGL) ? Phaser.WEBGL : Phaser.CANVAS;

      // Default scale config: NONE. Nosotros manejamos pixel ratio y CSS sizing.
      const scaleCfg = {
        mode: Phaser.Scale.NONE,
        autoCenter: this.opts.autoCenter ? Phaser.Scale.CENTER_BOTH : Phaser.Scale.NO_CENTER,
      };

      const baseConfig = merge({
        type: type,
        parent: this.container,
        width: this.opts.designWidth,
        height: this.opts.designHeight,
        backgroundColor: this.opts.backgroundColor,
        pixelArt: this.opts.pixelArt,
        roundPixels: this.opts.roundPixels,
        scale: scaleCfg,
      }, this.opts.phaserConfig);

      // Creamos el juego
      this.game = new Phaser.Game(baseConfig);

      // seguridad: el canvas puede tardar en existir según la versión; lo buscamos
      this._ensureCanvasReady();
    }

    _ensureCanvasReady() {
      // si el canvas ya existe, guardamos referencia
      this.canvas = this.container.querySelector('canvas');
      if (!this.canvas) {
        // observar cambios en el contenedor para detectar creación del canvas
        const obs = new MutationObserver(() => {
          this.canvas = this.container.querySelector('canvas');
          if (this.canvas) {
            obs.disconnect();
            this._applyCanvasStyles();
          }
        });
        obs.observe(this.container, { childList: true, subtree: true });
      } else {
        this._applyCanvasStyles();
      }
    }

    _applyCanvasStyles() {
      if (!this.canvas) return;
      const st = this.canvas.style;
      st.display = 'block';
      st.position = 'absolute';
      st.left = '50%';
      st.top = '50%';
      st.transform = 'translate(-50%, -50%)';
      st.imageRendering = this.opts.pixelArt ? 'pixelated' : 'auto';
      st.maxWidth = '100%';
      st.maxHeight = '100%';
      st.width = '100%';
      st.height = '100%';
      st.zIndex = this.opts.zIndex;
      // avoid pointer events issues on some mobiles
      this.canvas.setAttribute('touch-action', 'none');
    }

    _attachListeners() {
      window.addEventListener('resize', this._onWindowResize, { passive: true });
      window.addEventListener('orientationchange', this._onOrientationChange, { passive: true });
    }

    _onOrientationChange() {
      // algunos navegadores tardan en estabilizar las dimensiones
      setTimeout(() => this._onWindowResize(), 120);
    }

    _onWindowResize() {
      if (!this.game) return;
      // dimensiones del contenedor visible
      const cw = this.container.clientWidth || window.innerWidth;
      const ch = this.container.clientHeight || window.innerHeight;
      const dw = this.opts.designWidth;
      const dh = this.opts.designHeight;

      let cssW = cw;
      let cssH = ch;

      if (this.opts.scaleMode === 'contain') {
        const s = Math.min(cw / dw, ch / dh);
        cssW = Math.round(dw * s);
        cssH = Math.round(dh * s);
      } else if (this.opts.scaleMode === 'cover') {
        const s = Math.max(cw / dw, ch / dh);
        cssW = Math.round(dw * s);
        cssH = Math.round(dh * s);
      } else if (this.opts.scaleMode === 'stretch') {
        cssW = cw;
        cssH = ch;
      }

      // Mantener el canvas centrado
      if (this.canvas) {
        this.canvas.style.width = cssW + 'px';
        this.canvas.style.height = cssH + 'px';
      }

      const dpr = Math.max(1, (window.devicePixelRatio || 1));

      // tamaño físico para renderizado (pixeles reales)
      const physicalW = Math.max(1, Math.floor(cssW * dpr));
      const physicalH = Math.max(1, Math.floor(cssH * dpr));

      // redimensionar el renderer y el scale manager de Phaser
      try {
        // algunos renderers esperan integers
        if (this.game.scale && typeof this.game.scale.resize === 'function') {
          this.game.scale.resize(physicalW, physicalH);
        }
        if (this.game.renderer && typeof this.game.renderer.resize === 'function') {
          this.game.renderer.resize(physicalW, physicalH);
        }
        if (this.canvas) {
          this.canvas.width = physicalW;
          this.canvas.height = physicalH;
        }

        // actualizar displaySize para que escenas y cámaras se ajusten correctamente
        if (this.game.scale && this.game.scale.displaySize) {
          // displaySize usa el tamaño CSS lógico, así que lo seteamos a cssW/cssH
          this.game.scale.displaySize.setSize(cssW, cssH);
        }

      } catch (e) {
        // fail silently pero registramos
        // console.warn('PhaserCanvasScaler: error al redimensionar renderer:', e);
      }

      // emitir evento personalizado por si el dev quiere reaccionar
      const ev = new CustomEvent('phaser-canvas-scaled', {
        detail: { cssWidth: cssW, cssHeight: cssH, physicalWidth: physicalW, physicalHeight: physicalH, dpr }
      });
      this.container.dispatchEvent(ev);
    }

    setBackground(color) {
      this.opts.backgroundColor = color;
      if (this.game && this.game.canvas) {
        this.game.canvas.style.background = color;
      }
      if (this.game && this.game.config) {
        this.game.config.backgroundColor = color;
      }
    }

    toggleFullScreen() {
      if (!this.opts.allowFullScreen) return;
      if (!document.fullscreenElement) {
        if (this.container.requestFullscreen) this.container.requestFullscreen();
        else if (this.container.webkitRequestFullscreen) this.container.webkitRequestFullscreen();
        else if (this.container.msRequestFullscreen) this.container.msRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
      // small delay to allow resize event
      setTimeout(() => this._onWindowResize(), 120);
    }

    setZIndex(z) {
      this.opts.zIndex = z;
      if (this.container) this.container.style.zIndex = z;
      if (this.canvas) this.canvas.style.zIndex = z;
    }

    destroy() {
      window.removeEventListener('resize', this._onWindowResize);
      window.removeEventListener('orientationchange', this._onOrientationChange);
      if (this.game) {
        try { this.game.destroy(true, false); } catch (e) { /* ignore */ }
        this.game = null;
      }
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
    }
  }

  // Export: soporta ES modules o global
  try {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
      module.exports = PhaserCanvasScaler;
    } else {
      // si está en un entorno con window
      global.PhaserCanvasScaler = PhaserCanvasScaler;
      if (typeof define === 'function' && define.amd) define(() => PhaserCanvasScaler);
    }
  } catch (e) {
    // noop
  }

})(typeof window !== 'undefined' ? window : this);
