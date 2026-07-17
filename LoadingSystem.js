/*!
 * ============================================================================
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 * GRASSLAND FOREST v13
 * VERSIÓN: v13.2.0-fixed
 * GENERADO: 12/19/2025
 * ============================================================================
 */

/* =============================================================================
   LoadingSystem — Sistema de carga con overlay para Phaser
   ============================================================================= */

class LoadingSystem {
  constructor() {
    this.overlay          = null;
    this.progressBar      = null;
    this.textElement      = null;
    this.hideTimeout      = null;
    this._hidePauseTimeout = null; // FIX #4: referencia al outer timeout de hide()
    this.animationId      = null;
    this.currentProgress  = 0;

    // FIX #3: no instanciar en carga si el DOM aún no existe
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  // ─── Inicialización ───────────────────────────────────────────────────────

  init() {
    if (!document.getElementById('loading-overlay')) {
      this.createOverlay();
    }

    this.overlay     = document.getElementById('loading-overlay');
    this.progressBar = this.overlay ? this.overlay.querySelector('.loading-bar-fill')      : null;
    this.textElement = this.overlay ? this.overlay.querySelector('.loading-text')           : null;
  }

  // FIX #1: createOverlay implementado completamente
  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id    = 'loading-overlay';

    Object.assign(overlay.style, {
      display:         'none',
      position:        'fixed',
      top:             '0',
      left:            '0',
      width:           '100vw',
      height:          '100vh',
      background:      'rgba(0, 0, 0, 0.85)',
      zIndex:          '99999',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             '16px',
      opacity:         '1',
      transition:      ''
    });

    // Texto
    const text = document.createElement('div');
    text.className   = 'loading-text';
    Object.assign(text.style, {
      color:      '#ffffff',
      fontSize:   '14px',
      fontFamily: 'Arial, sans-serif',
      fontWeight: '500',
      textAlign:  'center',
      userSelect: 'none'
    });

    // Contenedor de la barra
    const barContainer = document.createElement('div');
    barContainer.className = 'loading-bar-container';
    barContainer.setAttribute('role',           'progressbar');
    barContainer.setAttribute('aria-valuemin',  '0');
    barContainer.setAttribute('aria-valuemax',  '100');
    barContainer.setAttribute('aria-valuenow',  '0');
    Object.assign(barContainer.style, {
      width:        '280px',
      height:       '6px',
      background:   'rgba(255,255,255,0.15)',
      borderRadius: '3px',
      overflow:     'hidden'
    });

    // Relleno de la barra
    const barFill = document.createElement('div');
    barFill.className = 'loading-bar-fill';
    Object.assign(barFill.style, {
      width:      '0%',
      height:     '100%',
      background: 'linear-gradient(90deg, #4a9eff, #7ec8ff)',
      borderRadius: '3px',
      transition: 'width 0.1s ease'
    });

    barContainer.appendChild(barFill);
    overlay.appendChild(text);
    overlay.appendChild(barContainer);
    document.body.appendChild(overlay);
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  show(options = {}) {
    const opts = Object.assign({
      message:         'Cargando...',
      initialProgress: 0,
      allowCancel:     false
    }, options);

    if (!this.overlay) this.init();

    // FIX WARN#3: lanzar error claro si el overlay sigue siendo null
    if (!this.overlay) {
      throw new Error('LoadingSystem: no se pudo crear o encontrar #loading-overlay. Verifica que el DOM esté listo.');
    }

    this.currentProgress = opts.initialProgress;

    this.overlay.style.display    = 'flex';
    this.overlay.style.opacity    = '1';
    this.overlay.style.transition = '';

    // SEGURIDAD: usar siempre textContent, nunca innerHTML con opts.message
    if (this.textElement) {
      this.textElement.textContent = opts.message;
    }

    this._updateProgressBar(opts.initialProgress);

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.overlay.style.padding = '28px';
      if (this.textElement) this.textElement.style.fontSize = '13px';
    }

    // MEJ#1: devolver objeto con hide que retorna Promise
    return {
      update: this.update.bind(this),
      hide:   (fadeOutMs) => this.hide(fadeOutMs)
    };
  }

  update(progress = 0) {
    progress = Math.max(0, Math.min(1, progress));

    if (progress < this.currentProgress) {
      console.warn(`[LoadingSystem] Ignorando retroceso: ${this.currentProgress.toFixed(2)} -> ${progress.toFixed(2)}`);
      return false; // FIX WARN#1: devolver false para que el llamante lo sepa
    }

    this.currentProgress = progress;
    this._updateProgressBar(progress);
    return true;
  }

  _updateProgressBar(progress) {
    if (!this.progressBar) return;

    const clamped = Math.max(0, Math.min(1, progress));
    this.progressBar.style.width = `${clamped * 100}%`;

    const barContainer = this.overlay && this.overlay.querySelector('.loading-bar-container');
    if (barContainer) {
      barContainer.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
    }
  }

  // MEJ#1: hide() devuelve Promise que resuelve cuando el fade termina
  hide(fadeOutMs = 500) {
    return new Promise(resolve => {
      if (!this.overlay) { resolve(); return; }

      this.update(1);

      // FIX #4: cancelar AMBOS timeouts pendientes
      if (this._hidePauseTimeout) { clearTimeout(this._hidePauseTimeout); this._hidePauseTimeout = null; }
      if (this.hideTimeout)       { clearTimeout(this.hideTimeout);       this.hideTimeout       = null; }

      // FIX #4: guardar referencia al outer timeout
      this._hidePauseTimeout = setTimeout(() => {
        this._hidePauseTimeout = null;
        this.overlay.style.transition = `opacity ${fadeOutMs}ms ease`;
        this.overlay.style.opacity    = '0';

        this.hideTimeout = setTimeout(() => {
          this.hideTimeout                = null;
          this.overlay.style.display      = 'none';
          this.overlay.style.opacity      = '1';
          this.overlay.style.transition   = '';
          this.currentProgress            = 0;
          this._updateProgressBar(0);
          resolve(); // MEJ#1: resolver la Promise cuando el fade termina
        }, fadeOutMs);
      }, 300);
    });
  }

  // FIX #5: cancelar animación previa antes de iniciar una nueva
  // FIX #2: actualizar animationId dentro del loop
  showTimed(durationMs = 3000, message = 'Cargando...', incremental = true) {
    return new Promise(resolve => {
      // FIX #5: limpiar animaciones y timeouts previos antes de empezar
      this.cancelAnimation();
      if (this._hidePauseTimeout) { clearTimeout(this._hidePauseTimeout); this._hidePauseTimeout = null; }
      if (this.hideTimeout)       { clearTimeout(this.hideTimeout);       this.hideTimeout       = null; }

      this.show({ message, initialProgress: 0 });

      const start = Date.now();

      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / durationMs);

        if (incremental) {
          this.update(this.easeInOutQuad(t));
        } else {
          this.update(t);
        }

        if (t < 1) {
          // FIX #2: actualizar this.animationId en cada frame del loop
          this.animationId = requestAnimationFrame(tick);
        } else {
          this.animationId = null;
          this.update(1);
          this.hide(500).then(resolve);
        }
      };

      // FIX #2: asignar antes de llamar tick()
      this.animationId = requestAnimationFrame(tick);
    });
  }

  cancelAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // Funciones de easing — disponibles para uso externo (LoadingScenegame.js las usa)
  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  destroy() {
    this.cancelAnimation();

    if (this._hidePauseTimeout) { clearTimeout(this._hidePauseTimeout); this._hidePauseTimeout = null; }
    if (this.hideTimeout)       { clearTimeout(this.hideTimeout);       this.hideTimeout       = null; }

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    this.overlay     = null;
    this.progressBar = null;
    this.textElement = null;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

window.LoadingSystem = LoadingSystem;

// FIX #3: instanciar solo cuando el DOM esté listo
// MEJ#2: el singleton sigue disponible pero el usuario puede crear sus propias instancias
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.loadingSystem = new LoadingSystem();
    _attachGlobalHelpers();
  }, { once: true });
} else {
  window.loadingSystem = new LoadingSystem();
  _attachGlobalHelpers();
}

function _attachGlobalHelpers() {
  window.showLoadingOverlay = function (options) {
    return window.loadingSystem.show(options);
  };
  window.updateLoadingProgress = function (progress) {
    return window.loadingSystem.update(progress);
  };
  // MEJ#1: hideLoadingOverlay ahora devuelve Promise
  window.hideLoadingOverlay = function (fadeOutMs = 500) {
    return window.loadingSystem.hide(fadeOutMs);
  };
  window.showTimedLoading = function (durationMs = 3000, message = 'Cargando...', incremental = true) {
    return window.loadingSystem.showTimed(durationMs, message, incremental);
  };
}
