
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
 * GENERADO: 19/20/2025
 * ============================================================================
 */


// TransactionHub.js - Versión con try/catch exhaustivos y debug opcional
class TransactionHub {
    /**
     * options:
     *  - width: number (px)
     *  - animationDuration: number (ms)
     *  - visibleDuration: number (ms) // tiempo que permanece visible EN COMPLETED o ERROR
     *  - explorerBase: string
     *  - debug: boolean (si true imprime más datos en consola)
     */
    constructor(options = {}) {
        try {
            const defaults = {
                width: 320,
                animationDuration: 500,
                visibleDuration: 10000,
                explorerBase: 'https://shannon-explorer.somnia.network/tx/',
                debug: false
            };
            this.config = Object.assign({}, defaults, options);

            this.isInitialized = false;
            this.currentNotification = null;

            // Control de visibilidad: usamos token + interval para medir tiempo con performance.now()
            this._visibilityIntervalId = null;
            this._visibilityToken = 0; // cambia cada vez que se inicia un nuevo conteo

            this._styleId = 'transaction-hub-styles';
            this._debug = !!this.config.debug;
        } catch (e) {
            // Si algo falla en el constructor, lanzamos y registramos
            console.error('TransactionHub.constructor error:', e);
            throw e;
        }
    }

    _handleError(context, err) {
        try {
            // Guardamos el error en un atributo data en el hub para depuración discreta
            try {
                const hub = document.getElementById('transaction-hub');
                if (hub) hub.setAttribute('data-last-error', `${context}: ${String(err && err.message ? err.message : err)}`);
            } catch (e) {
                // no hacemos nada si falló el setAttribute
            }

            // Mensaje de consola: siempre lo registramos
            console.error(`TransactionHub error [${context}]:`, err);

            // Si el modo debug está activado, mostrar stack (si existe)
            if (this._debug) {
                if (err && err.stack) console.error(err.stack);
            }
        } catch (e) {
            // fallback silencioso: no propagar
            console.error('TransactionHub._handleError fallback error:', e);
        }
    }

    initialize() {
        try {
            if (this.isInitialized) return;
            if (typeof document === 'undefined' || !document.body) {
                document.addEventListener('DOMContentLoaded', () => this.initialize(), { once: true });
                return;
            }

            if (!document.getElementById(this._styleId)) this.injectStyles();

            const hub = document.createElement('div');
            hub.id = 'transaction-hub';
            hub.style.display = 'none';
            hub.setAttribute('aria-live', 'polite');
            hub.setAttribute('role', 'status');
            hub.innerHTML = `
                <div class="tx-notification" id="tx-current-notification" role="region" aria-label="Transaction notification">
                    <div class="tx-notification-header">
                        <div class="tx-status-dot pending" aria-hidden="true"></div>
                        <div class="tx-message">Pending transaction</div>
                    </div>
                    <div class="tx-hash" style="display: none;"></div>
                    <a class="tx-explorer-link" style="display: none;" target="_blank" rel="noopener noreferrer">View in explorer</a>
                </div>
            `;
            document.body.appendChild(hub);

            this.isInitialized = true;
            this.currentNotification = document.getElementById('tx-current-notification');

            // referencias rápidas
            this._hubElement = hub;
            this._messageElement = this.currentNotification.querySelector('.tx-message');
            this._hashElement = this.currentNotification.querySelector('.tx-hash');
            this._explorerElement = this.currentNotification.querySelector('.tx-explorer-link');
            this._statusDot = this.currentNotification.querySelector('.tx-status-dot');

            // limpiar clases y fijar estado inicial
            try {
                this.currentNotification.classList.remove('show', 'hide', 'completed', 'error', 'pending');
                this.currentNotification.classList.add('pending');
            } catch (e) {
                // no es crítico, pero lo registramos
                this._handleError('initialize.classList', e);
            }
        } catch (e) {
            this._handleError('initialize', e);
        }
    }

    injectStyles() {
        try {
            const css = `
                #transaction-hub { position: fixed; left: 20px; top: 120px; z-index: 10000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; pointer-events: none; }
                #transaction-hub .tx-notification { width: ${this.config.width}px; padding: 16px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(71, 85, 105, 0.4); border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.5); transform: translateX(-400px); opacity: 0; transition: transform ${this.config.animationDuration}ms cubic-bezier(0.4,0,0.2,1), opacity ${this.config.animationDuration}ms ease; pointer-events: auto; }
                #transaction-hub .tx-notification.show { transform: translateX(0); opacity: 1; }
                #transaction-hub .tx-notification.hide { transform: translateX(-400px); opacity: 0; }
                #transaction-hub .tx-notification.pending { border-left: 4px solid #f59e0b; }
                #transaction-hub .tx-notification.completed { border-left: 4px solid #10b981; }
                #transaction-hub .tx-notification.error { border-left: 4px solid #ef4444; }
                #transaction-hub .tx-notification-header { display:flex; align-items:center; margin-bottom:8px; }
                #transaction-hub .tx-status-dot { width:8px; height:8px; border-radius:50%; margin-right:12px; flex-shrink:0; }
                #transaction-hub .tx-status-dot.pending { background:#f59e0b; box-shadow:0 0 8px rgba(245,158,11,0.5); }
                #transaction-hub .tx-status-dot.completed { background:#10b981; box-shadow:0 0 8px rgba(16,185,129,0.5); }
                #transaction-hub .tx-status-dot.error { background:#ef4444; box-shadow:0 0 8px rgba(239,68,68,0.45); }
                #transaction-hub .tx-message { font-size:14px; font-weight:600; color:#f1f5f9; flex:1; }
                #transaction-hub .tx-hash { font-family: 'Monaco','Menlo','Ubuntu Mono', monospace; font-size:11px; color:#94a3b8; margin:6px 0 8px 20px; word-break:break-all; line-height:1.3; }
                #transaction-hub .tx-explorer-link { display:inline-block; background: rgba(56,189,248,0.1); color:#38bdf8; text-decoration:none; padding:6px 12px; border-radius:4px; font-size:12px; font-weight:500; transition:all 0.2s ease; border:1px solid rgba(56,189,248,0.2); cursor:pointer; margin-left:20px; }
                #transaction-hub .tx-explorer-link:hover { background: rgba(56,189,248,0.2); border-color: rgba(56,189,248,0.4); }
                @keyframes txhub-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
                #transaction-hub .tx-notification.pending .tx-status-dot { animation: txhub-pulse 2s infinite; }
            `;
            const styleTag = document.createElement('style');
            styleTag.id = this._styleId;
            styleTag.appendChild(document.createTextNode(css));
            document.head.appendChild(styleTag);
        } catch (e) {
            this._handleError('injectStyles', e);
        }
    }

    showPending(message = 'Enviando transacción...') {
        try {
            this.initialize();

            // cancelar cualquier conteo previo
            this._cancelVisibilityCountdown();

            if (this._hubElement) this._hubElement.style.display = 'block';
            if (!this.currentNotification) {
                this._handleError('showPending', new Error('currentNotification no definida'));
                return;
            }

            this.currentNotification.classList.remove('hide', 'completed', 'error');
            this.currentNotification.classList.add('pending');

            if (this._statusDot) {
                this._statusDot.classList.remove('completed', 'error');
                this._statusDot.classList.add('pending');
            }

            if (this._messageElement) this._messageElement.textContent = message;
            if (this._hashElement) this._hashElement.style.display = 'none';
            if (this._explorerElement) this._explorerElement.style.display = 'none';

            requestAnimationFrame(() => setTimeout(() => {
                try {
                    this.currentNotification.classList.remove('hide');
                    this.currentNotification.classList.add('show');
                } catch (e) {
                    this._handleError('showPending.animation', e);
                }
            }, 10));
        } catch (e) {
            this._handleError('showPending', e);
        }
    }

    showCompleted(txHash = '', message = 'Transacción confirmada', explorerBase = '') {
        try {
            this.initialize();

            // cancelar conteo previo (si lo hay) y empezar nuevo
            this._cancelVisibilityCountdown();

            if (this._hubElement) this._hubElement.style.display = 'block';
            if (!this.currentNotification) {
                this._handleError('showCompleted', new Error('currentNotification no definida'));
                return;
            }

            this.currentNotification.classList.remove('hide', 'pending', 'error');
            this.currentNotification.classList.add('completed');

            if (this._statusDot) {
                this._statusDot.classList.remove('pending', 'error');
                this._statusDot.classList.add('completed');
            }

            if (this._messageElement) this._messageElement.textContent = message;

            if (txHash) {
                const shortHash = (typeof txHash === 'string' && txHash.length >= 18)
                    ? txHash.substring(0, 10) + '...' + txHash.substring(txHash.length - 8)
                    : String(txHash);
                if (this._hashElement) {
                    this._hashElement.textContent = shortHash;
                    this._hashElement.style.display = 'block';
                }
                const base = explorerBase || this.config.explorerBase || '';
                if (this._explorerElement) {
                    this._explorerElement.style.display = 'inline-block';
                    this._explorerElement.setAttribute('href', base + encodeURIComponent(txHash));
                    this._explorerElement.textContent = 'Ver en explorer';
                }
            } else {
                if (this._hashElement) this._hashElement.style.display = 'none';
                if (this._explorerElement) this._explorerElement.style.display = 'none';
            }

            requestAnimationFrame(() => setTimeout(() => {
                try {
                    this.currentNotification.classList.remove('hide');
                    this.currentNotification.classList.add('show');
                } catch (e) {
                    this._handleError('showCompleted.animation', e);
                }
            }, 10));

            // iniciar conteo seguro: usamos interval que compara performance.now()
            this._startVisibilityCountdown(this.config.visibleDuration);
        } catch (e) {
            this._handleError('showCompleted', e);
        }
    }

    showError(message = 'La transacción falló') {
        try {
            this.initialize();

            this._cancelVisibilityCountdown();

            if (this._hubElement) this._hubElement.style.display = 'block';
            if (!this.currentNotification) {
                this._handleError('showError', new Error('currentNotification no definida'));
                return;
            }

            this.currentNotification.classList.remove('hide', 'pending', 'completed');
            this.currentNotification.classList.add('error');

            if (this._statusDot) {
                this._statusDot.classList.remove('pending', 'completed');
                this._statusDot.classList.add('error');
            }

            const safeMessage = message && String(message).trim() ? message : 'La transacción falló';
            if (this._messageElement) this._messageElement.textContent = safeMessage;

            if (this._hashElement) this._hashElement.style.display = 'none';
            if (this._explorerElement) this._explorerElement.style.display = 'none';

            requestAnimationFrame(() => setTimeout(() => {
                try {
                    this.currentNotification.classList.remove('hide');
                    this.currentNotification.classList.add('show');
                } catch (e) {
                    this._handleError('showError.animation', e);
                }
            }, 10));

            this._startVisibilityCountdown(this.config.visibleDuration);
        } catch (e) {
            this._handleError('showError', e);
        }
    }

    _startVisibilityCountdown(durationMs) {
        try {
            // invalidar contador anterior
            this._visibilityToken = (this._visibilityToken || 0) + 1;
            const token = this._visibilityToken;

            // limpiar cualquier intervalo anterior
            if (this._visibilityIntervalId) {
                clearInterval(this._visibilityIntervalId);
                this._visibilityIntervalId = null;
            }

            const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const checkInterval = 150; // ms - frecuencia de comprobación razonable

            this._visibilityIntervalId = setInterval(() => {
                try {
                    // si el token cambió, cancelamos este interval
                    if (token !== this._visibilityToken) {
                        clearInterval(this._visibilityIntervalId);
                        this._visibilityIntervalId = null;
                        return;
                    }

                    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    if (now - start >= durationMs) {
                        // cancelar y ocultar (NO modificar mensajes ni mostrar texto por defecto)
                        clearInterval(this._visibilityIntervalId);
                        this._visibilityIntervalId = null;
                        // reiniciar token para evitar ejecuciones duplicadas
                        this._visibilityToken = 0;
                        this.hideNotification();
                    }
                } catch (e) {
                    this._handleError('_startVisibilityCountdown.interval', e);
                }
            }, checkInterval);
        } catch (e) {
            this._handleError('_startVisibilityCountdown', e);
        }
    }

    _cancelVisibilityCountdown() {
        try {
            if (this._visibilityIntervalId) {
                clearInterval(this._visibilityIntervalId);
                this._visibilityIntervalId = null;
            }
            // invalidar token para que interval anteriores no actúen si están aún en vuelo
            this._visibilityToken = 0;
        } catch (e) {
            this._handleError('_cancelVisibilityCountdown', e);
        }
    }

    hideNotification() {
        try {
            if (!this.currentNotification) return;

            // cancelar conteo visible
            this._cancelVisibilityCountdown();

            // animar salida (no tocar texto)
            this.currentNotification.classList.remove('show');
            this.currentNotification.classList.add('hide');

            setTimeout(() => {
                try {
                    if (this._hubElement) this._hubElement.style.display = 'none';
                    // dejamos el contenido tal cual (útil para debugging si se necesita)
                } catch (e) {
                    this._handleError('hideNotification.timeout', e);
                }
            }, this.config.animationDuration);
        } catch (e) {
            this._handleError('hideNotification', e);
        }
    }

    updateConfig(newConfig = {}) {
        try {
            this.config = Object.assign({}, this.config, newConfig);
            const styleTag = document.getElementById(this._styleId);
            if (styleTag) {
                styleTag.parentNode.removeChild(styleTag);
                this.injectStyles();
            }
        } catch (e) {
            this._handleError('updateConfig', e);
        }
    }

    destroy() {
        try {
            this._cancelVisibilityCountdown();

            const hub = document.getElementById('transaction-hub');
            if (hub) hub.remove();
            const styleTag = document.getElementById(this._styleId);
            if (styleTag) styleTag.remove();

            this.currentNotification = null;
            this._hubElement = null;
            this._messageElement = null;
            this._hashElement = null;
            this._explorerElement = null;
            this._statusDot = null;
            this.isInitialized = false;
        } catch (e) {
            this._handleError('destroy', e);
        }
    }
}

// export
if (typeof window !== 'undefined') window.TransactionHub = TransactionHub;
if (typeof module !== 'undefined' && module.exports) module.exports = TransactionHub;
