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
 * VERSIÓN: v13.0.1-pixel
 * GENERADO: 19/20/2025
 * ============================================================================
 */


// NotificationHub.js - Librería de notificaciones con diseño pixel art RPG y sistema anti-duplicados
class NotificationHub {
    /**
     * options:
     *  - width: number (px)
     *  - animationDuration: number (ms)
     *  - visibleDuration: number (ms)
     *  - maxNotifications: number
     *  - spacing: number
     *  - debug: boolean
     *  - autoCleanup: boolean
     *  - preventDuplicates: boolean (si true, evita notificaciones duplicadas)
     *  - duplicateCheckFields: array (campos para verificar duplicados)
     *  - pixelArtMode: boolean (activa diseño pixel art RPG)
     *  - position: string (top-left, top-right, bottom-left, bottom-right)
     */
    constructor(options = {}) {
        try {
            const defaults = {
                width: 320,
                animationDuration: 400,
                visibleDuration: 5000,
                maxNotifications: 5,
                spacing: 8,
                debug: false,
                autoCleanup: true,
                preventDuplicates: true,
                duplicateCheckFields: ['message', 'type', 'pool'],
                pixelArtMode: true,
                position: 'top-left',
                pixelSize: 3,
                font: "'Press Start 2P', 'Courier New', monospace",
                backgroundColor: '#0f172a',
                borderColor: '#475569'
            };
            this.config = Object.assign({}, defaults, options);

            this.isInitialized = false;
            this.notifications = new Map();
            this.notificationCounter = 0;
            this.pools = new Map();
            this.duplicateTracker = new Map();

            this._styleId = 'notification-hub-styles';
            this._debug = !!this.config.debug;
            this._cleanupInterval = null;
            
            if (this.config.autoCleanup) {
                this._startAutoCleanup();
            }
        } catch (e) {
            console.error('NotificationHub.constructor error:', e);
            throw e;
        }
    }

    /**
     * Genera una clave única para verificar duplicados
     * @private
     */
    _generateDuplicateKey(message, type, pool, options = {}) {
        try {
            if (this.config.duplicateCheckFields && this.config.duplicateCheckFields.length > 0) {
                const parts = [];
                
                if (this.config.duplicateCheckFields.includes('message')) {
                    parts.push(`msg:${message}`);
                }
                
                if (this.config.duplicateCheckFields.includes('type')) {
                    parts.push(`type:${type}`);
                }
                
                if (this.config.duplicateCheckFields.includes('pool')) {
                    parts.push(`pool:${pool}`);
                }
                
                for (const field of this.config.duplicateCheckFields) {
                    if (field !== 'message' && field !== 'type' && field !== 'pool' && options[field]) {
                        parts.push(`${field}:${options[field]}`);
                    }
                }
                
                return parts.join('|');
            }
            
            return `${message}|${type}|${pool}`;
        } catch (e) {
            return `${message}|${type}|${pool}`;
        }
    }

    /**
     * Verifica si ya existe una notificación duplicada
     * @private
     */
    _checkForDuplicate(message, type, pool, options = {}) {
        if (!this.config.preventDuplicates) return null;
        
        try {
            const duplicateKey = this._generateDuplicateKey(message, type, pool, options);
            
            if (this.duplicateTracker.has(duplicateKey)) {
                const notificationId = this.duplicateTracker.get(duplicateKey);
                const notification = this.notifications.get(notificationId);
                
                if (notification && notification.isActive) {
                    return notificationId;
                } else {
                    this.duplicateTracker.delete(duplicateKey);
                }
            }
            
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Actualiza una notificación existente en lugar de crear una nueva
     * @private
     */
    _updateExistingNotification(notificationId, message, type, options = {}) {
        try {
            const notification = this.notifications.get(notificationId);
            if (!notification) return null;
            
            // Actualizar contenido
            if (notification.message !== message && notification.element) {
                notification.message = message;
                const messageEl = notification.element.querySelector('.notification-message');
                if (messageEl) {
                    messageEl.textContent = message;
                    
                    // Efecto de actualización
                    messageEl.style.animation = 'none';
                    setTimeout(() => {
                        messageEl.style.animation = 'textUpdate 0.3s ease';
                    }, 10);
                }
            }
            
            // Actualizar tipo si es diferente
            if (notification.type !== type && notification.element) {
                notification.type = type;
                const oldClass = notification.element.className.replace(/notification-item\s+/, '').split(' ')[0];
                notification.element.className = notification.element.className.replace(oldClass, type);
                
                const iconEl = notification.element.querySelector('.notification-icon');
                if (iconEl) {
                    iconEl.className = `notification-icon ${type}`;
                }
                
                // Efecto visual de cambio
                notification.element.style.borderColor = this._getBorderColor(type);
                notification.element.style.animation = 'pixelFlash 0.5s';
            }
            
            // Reiniciar temporizador
            if (notification.timer) {
                clearTimeout(notification.timer);
            }
            
            const displayDuration = options.duration !== null ? options.duration : this.config.visibleDuration;
            notification.expiresAt = displayDuration > 0 ? Date.now() + displayDuration : null;
            
            if (displayDuration > 0) {
                notification.timer = setTimeout(() => {
                    this._expireNotification(notificationId);
                }, displayDuration);
            }
            
            // Actualizar datos
            if (options.data) {
                notification.data = { ...notification.data, ...options.data };
            }
            
            if (options.onExpire) {
                notification.onExpire = options.onExpire;
            }
            
            // Actualizar tiempo de creación para mantenerla "fresca"
            notification.createdAt = Date.now();
            
            if (this._debug) {
                console.log(`NotificationHub: Actualizada notificación duplicada [${notificationId}]`, {
                    message,
                    type
                });
            }
            
            return notificationId;
        } catch (e) {
            this._handleError('_updateExistingNotification', e);
            return null;
        }
    }

    /**
     * Obtiene el color del borde según el tipo
     * @private
     */
    _getBorderColor(type) {
        const colors = {
            'info': '#3b82f6',
            'success': '#10b981',
            'warning': '#f59e0b',
            'error': '#ef4444'
        };
        return colors[type] || colors.info;
    }

    /**
     * Inicia el intervalo de limpieza automática
     * @private
     */
    _startAutoCleanup() {
        if (this._cleanupInterval) return;
        
        this._cleanupInterval = setInterval(() => {
            this._cleanupExpiredNotifications();
        }, 1000);
    }

    /**
     * Detiene la limpieza automática
     * @private
     */
    _stopAutoCleanup() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }

    /**
     * Limpia notificaciones expiradas
     * @private
     */
    _cleanupExpiredNotifications() {
        const now = Date.now();
        
        for (const [notificationId, notification] of this.notifications.entries()) {
            if (!notification.timer && notification.expiresAt && notification.expiresAt <= now) {
                this._removeNotification(notificationId);
            }
        }
    }

    _handleError(context, err) {
        try {
            const hub = document.getElementById('notification-hub');
            if (hub) hub.setAttribute('data-last-error', `${context}: ${String(err && err.message ? err.message : err)}`);
            
            if (this._debug) {
                console.error(`NotificationHub error [${context}]:`, err);
                if (err && err.stack) console.error(err.stack);
            }
        } catch (e) {
            console.error('NotificationHub._handleError fallback error:', e);
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
            hub.id = 'notification-hub';
            hub.style.display = 'block';
            hub.setAttribute('aria-live', 'polite');
            hub.setAttribute('role', 'status');
            document.body.appendChild(hub);

            this.isInitialized = true;
            this._hubElement = hub;
            
            if (this._debug) {
                console.log('NotificationHub: Inicializado');
            }
        } catch (e) {
            this._handleError('initialize', e);
        }
    }

    injectStyles() {
        try {
            // Determinar posición según configuración
            let positionCSS = '';
            switch (this.config.position) {
                case 'top-right':
                    positionCSS = 'right: 1%; top: 28%; left: auto;';
                    break;
                case 'bottom-right':
                    positionCSS = 'right: 1%; bottom: 1%; top: auto; left: auto;';
                    break;
                case 'bottom-left':
                    positionCSS = 'left: 1%; bottom: 1%; top: auto; right: auto;';
                    break;
                case 'top-left':
                default:
                    positionCSS = 'left: 1%; top: 28%; right: auto;';
                    break;
            }

            let css = '';
            
            if (this.config.pixelArtMode) {
                // Diseño PIXEL ART RPG MEJORADO
                css = `
                    /* Importar fuente pixel art RPG */
                    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
                    
                    #notification-hub { 
                        position: fixed; 
                        ${positionCSS}
                        z-index: 10000; 
                        font-family: ${this.config.font}; 
                        pointer-events: none; 
                    }
                    
                    /* Estilo base de notificación - Pixel RPG */
                    .notification-item { 
                        width: ${this.config.width}px; 
                        padding: ${this.config.pixelSize * 4}px; 
                        background: rgba(15, 23, 42, 0.95); 
                        border: ${this.config.pixelSize}px solid ${this.config.borderColor}; 
                        border-radius: 4px; 
                        box-shadow: 0 ${this.config.pixelSize * 2}px ${this.config.pixelSize * 4}px rgba(0, 0, 0, 0.5),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(255, 255, 255, 0.1); 
                        transform: translateX(-400px); 
                        opacity: 0; 
                        transition: all ${this.config.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1); 
                        pointer-events: auto; 
                        margin-bottom: ${this.config.spacing}px;
                        position: relative;
                        overflow: hidden;
                        backdrop-filter: blur(2px);
                    }
                    
                    /* Efecto de borde de píxeles */
                    .notification-item::before {
                        content: '';
                        position: absolute;
                        top: -${this.config.pixelSize}px;
                        left: -${this.config.pixelSize}px;
                        right: -${this.config.pixelSize}px;
                        bottom: -${this.config.pixelSize}px;
                        background: repeating-linear-gradient(
                            0deg,
                            transparent,
                            transparent ${this.config.pixelSize}px,
                            rgba(255, 255, 255, 0.05) ${this.config.pixelSize}px,
                            rgba(255, 255, 255, 0.05) ${this.config.pixelSize * 2}px
                        );
                        z-index: -1;
                        opacity: 0.3;
                    }
                    
                    /* Efecto de brillo interior */
                    .notification-item::after {
                        content: '';
                        position: absolute;
                        top: ${this.config.pixelSize}px;
                        left: ${this.config.pixelSize}px;
                        right: ${this.config.pixelSize}px;
                        bottom: ${this.config.pixelSize}px;
                        background: linear-gradient(
                            135deg,
                            rgba(255, 255, 255, 0.03) 0%,
                            rgba(255, 255, 255, 0) 50%,
                            rgba(255, 255, 255, 0.03) 100%
                        );
                        pointer-events: none;
                    }
                    
                    /* Animación de entrada */
                    .notification-item.show { 
                        transform: translateX(0); 
                        opacity: 1; 
                    }
                    
                    /* Animación de salida */
                    .notification-item.hide { 
                        transform: translateX(-400px); 
                        opacity: 0; 
                        margin-bottom: 0;
                    }
                    
                    /* Efecto de parpadeo para notificaciones nuevas */
                    @keyframes pixelAppear {
                        0% { 
                            transform: translateX(-400px) scale(0.8); 
                            opacity: 0; 
                        }
                        70% { 
                            transform: translateX(20px) scale(1.05); 
                            opacity: 1; 
                        }
                        100% { 
                            transform: translateX(0) scale(1); 
                            opacity: 1; 
                        }
                    }
                    
                    .notification-item.show {
                        animation: pixelAppear ${this.config.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
                    }
                    
                    /* Estilos por tipo con temática RPG */
                    .notification-item.info { 
                        border-color: #3b82f6;
                        background: linear-gradient(
                            135deg,
                            rgba(15, 23, 42, 0.95) 0%,
                            rgba(30, 58, 138, 0.8) 100%
                        );
                        box-shadow: 0 ${this.config.pixelSize * 2}px ${this.config.pixelSize * 4}px rgba(59, 130, 246, 0.3),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(59, 130, 246, 0.2);
                    }
                    
                    .notification-item.success { 
                        border-color: #10b981;
                        background: linear-gradient(
                            135deg,
                            rgba(15, 23, 42, 0.95) 0%,
                            rgba(6, 95, 70, 0.8) 100%
                        );
                        box-shadow: 0 ${this.config.pixelSize * 2}px ${this.config.pixelSize * 4}px rgba(16, 185, 129, 0.3),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(16, 185, 129, 0.2);
                    }
                    
                    .notification-item.warning { 
                        border-color: #f59e0b;
                        background: linear-gradient(
                            135deg,
                            rgba(15, 23, 42, 0.95) 0%,
                            rgba(146, 64, 14, 0.8) 100%
                        );
                        box-shadow: 0 ${this.config.pixelSize * 2}px ${this.config.pixelSize * 4}px rgba(245, 158, 11, 0.3),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(245, 158, 11, 0.2);
                    }
                    
                    .notification-item.error { 
                        border-color: #ef4444;
                        background: linear-gradient(
                            135deg,
                            rgba(15, 23, 42, 0.95) 0%,
                            rgba(127, 29, 29, 0.8) 100%
                        );
                        box-shadow: 0 ${this.config.pixelSize * 2}px ${this.config.pixelSize * 4}px rgba(239, 68, 68, 0.3),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(239, 68, 68, 0.2);
                    }
                    
                    /* Cabecera de notificación */
                    .notification-header { 
                        display: flex; 
                        align-items: center; 
                        margin-bottom: ${this.config.pixelSize * 3}px;
                        position: relative;
                    }
                    
                    /* Icono pixel art */
                    .notification-icon { 
                        width: ${this.config.pixelSize * 5}px; 
                        height: ${this.config.pixelSize * 5}px; 
                        margin-right: ${this.config.pixelSize * 3}px; 
                        flex-shrink: 0; 
                        position: relative;
                        background-size: ${this.config.pixelSize}px ${this.config.pixelSize}px;
                        image-rendering: pixelated;
                    }
                    
                    /* Pixel art para iconos */
                    .notification-icon.info { 
                        background-color: #3b82f6; 
                        box-shadow: 0 0 ${this.config.pixelSize * 3}px rgba(59, 130, 246, 0.5),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(255, 255, 255, 0.3); 
                        border: ${this.config.pixelSize}px solid #1d4ed8;
                    }
                    
                    .notification-icon.success { 
                        background-color: #10b981; 
                        box-shadow: 0 0 ${this.config.pixelSize * 3}px rgba(16, 185, 129, 0.5),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(255, 255, 255, 0.3); 
                        border: ${this.config.pixelSize}px solid #047857;
                        animation: pixelPulse 2s infinite;
                    }
                    
                    .notification-icon.warning { 
                        background-color: #f59e0b; 
                        box-shadow: 0 0 ${this.config.pixelSize * 3}px rgba(245, 158, 11, 0.5),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(255, 255, 255, 0.3); 
                        border: ${this.config.pixelSize}px solid #b45309;
                        animation: pixelFlash 1s infinite;
                    }
                    
                    .notification-icon.error { 
                        background-color: #ef4444; 
                        box-shadow: 0 0 ${this.config.pixelSize * 3}px rgba(239, 68, 68, 0.5),
                                    inset 0 0 0 ${this.config.pixelSize}px rgba(255, 255, 255, 0.3); 
                        border: ${this.config.pixelSize}px solid #b91c1c;
                        animation: pixelGlitch 0.5s infinite;
                    }
                    
                    /* Mensaje con estilo pixel art */
                    .notification-message { 
                        font-size: ${this.config.pixelSize * 3.5}px; 
                        color: #f1f5f9; 
                        flex: 1; 
                        line-height: 1.4;
                        text-shadow: ${this.config.pixelSize}px ${this.config.pixelSize}px 0 rgba(0, 0, 0, 0.5);
                        letter-spacing: 0.5px;
                    }
                    
                    /* Temporizador debug */
                    .notification-timer { 
                        position: absolute;
                        top: ${this.config.pixelSize}px;
                        right: ${this.config.pixelSize}px;
                        font-size: ${this.config.pixelSize * 2.5}px;
                        color: rgba(255, 255, 255, 0.6);
                        font-family: ${this.config.font};
                        text-shadow: 1px 1px 0 #000;
                    }
                    
                    /* Animaciones pixel art */
                    @keyframes pixelPulse { 
                        0%, 100% { 
                            transform: scale(1); 
                            box-shadow: 0 0 ${this.config.pixelSize * 3}px rgba(16, 185, 129, 0.5);
                        } 
                        50% { 
                            transform: scale(1.1); 
                            box-shadow: 0 0 ${this.config.pixelSize * 5}px rgba(16, 185, 129, 0.8);
                        } 
                    }
                    
                    @keyframes pixelFlash {
                        0%, 100% { 
                            opacity: 1; 
                            background-color: #f59e0b;
                        }
                        50% { 
                            opacity: 0.7; 
                            background-color: #fbbf24;
                        }
                    }
                    
                    @keyframes pixelGlitch {
                        0%, 100% { 
                            transform: translateX(0); 
                            background-color: #ef4444;
                        }
                        10% { 
                            transform: translateX(${this.config.pixelSize}px); 
                            background-color: #dc2626;
                        }
                        20% { 
                            transform: translateX(-${this.config.pixelSize}px); 
                            background-color: #ef4444;
                        }
                        30% { 
                            transform: translateX(0); 
                            background-color: #dc2626;
                        }
                    }
                    
                    @keyframes pixelFlash {
                        0%, 100% { 
                            border-color: ${this.config.borderColor};
                        }
                        50% { 
                            border-color: rgba(255, 255, 255, 0.8);
                        }
                    }
                    
                    @keyframes textUpdate {
                        0% { 
                            transform: translateY(0); 
                            opacity: 1;
                        }
                        50% { 
                            transform: translateY(-${this.config.pixelSize * 2}px); 
                            opacity: 0.5;
                        }
                        100% { 
                            transform: translateY(0); 
                            opacity: 1;
                        }
                    }
                    
                    /* Efecto de partículas para notificaciones importantes */
                    .notification-item.error .notification-icon::after {
                        content: '';
                        position: absolute;
                        top: -${this.config.pixelSize * 2}px;
                        left: -${this.config.pixelSize * 2}px;
                        right: -${this.config.pixelSize * 2}px;
                        bottom: -${this.config.pixelSize * 2}px;
                        background: radial-gradient(circle, transparent 30%, rgba(239, 68, 68, 0.2) 70%);
                        animation: particlePulse 1s infinite;
                    }
                    
                    @keyframes particlePulse {
                        0% { transform: scale(0.8); opacity: 0.5; }
                        100% { transform: scale(1.2); opacity: 0; }
                    }
                    
                    /* Efecto de desvanecimiento suave para salida */
                    @keyframes pixelDisappear {
                        0% { 
                            transform: translateX(0) scale(1); 
                            opacity: 1;
                        }
                        100% { 
                            transform: translateX(-400px) scale(0.8); 
                            opacity: 0;
                        }
                    }
                    
                    .notification-item.hide {
                        animation: pixelDisappear ${this.config.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
                    }
                `;
            } else {
                // Estilo original (modo no pixel art)
                css = `
                    #notification-hub { 
                        position: fixed; 
                        ${positionCSS}
                        z-index: 10000; 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        pointer-events: none; 
                    }
                    .notification-item { 
                        width: ${this.config.width}px; 
                        padding: 16px; 
                        background: rgba(15, 23, 42, 0.95); 
                        backdrop-filter: blur(10px); 
                        border: 1px solid rgba(71, 85, 105, 0.4); 
                        border-radius: 8px; 
                        box-shadow: 0 8px 20px rgba(0,0,0,0.5); 
                        transform: translateX(-400px); 
                        opacity: 0; 
                        transition: all ${this.config.animationDuration}ms cubic-bezier(0.4,0,0.2,1); 
                        pointer-events: auto; 
                        margin-bottom: ${this.config.spacing}px;
                    }
                    .notification-item.show { 
                        transform: translateX(0); 
                        opacity: 1; 
                    }
                    .notification-item.hide { 
                        transform: translateX(-400px); 
                        opacity: 0; 
                        margin-bottom: 0;
                    }
                    .notification-item.info { 
                        border-left: 4px solid #3b82f6; 
                    }
                    .notification-item.success { 
                        border-left: 4px solid #10b981; 
                    }
                    .notification-item.warning { 
                        border-left: 4px solid #f59e0b; 
                    }
                    .notification-item.error { 
                        border-left: 4px solid #ef4444; 
                    }
                    .notification-header { 
                        display:flex; 
                        align-items:center; 
                    }
                    .notification-icon { 
                        width:12px; 
                        height:12px; 
                        border-radius:50%; 
                        margin-right:12px; 
                        flex-shrink:0; 
                    }
                    .notification-icon.info { 
                        background:#3b82f6; 
                        box-shadow:0 0 8px rgba(59,130,246,0.5); 
                    }
                    .notification-icon.success { 
                        background:#10b981; 
                        box-shadow:0 0 8px rgba(16,185,129,0.5); 
                    }
                    .notification-icon.warning { 
                        background:#f59e0b; 
                        box-shadow:0 0 8px rgba(245,158,11,0.5); 
                    }
                    .notification-icon.error { 
                        background:#ef4444; 
                        box-shadow:0 0 8px rgba(239,68,68,0.45); 
                    }
                    .notification-message { 
                        font-size:14px; 
                        font-weight:600; 
                        color:#f1f5f9; 
                        flex:1; 
                        line-height:1.4;
                    }
                    .notification-timer { 
                        position: absolute;
                        top: 5px;
                        right: 5px;
                        font-size: 10px;
                        color: rgba(255, 255, 255, 0.6);
                        font-family: monospace;
                    }
                    @keyframes notification-pulse { 
                        0%,100% { opacity:1; } 
                        50% { opacity:0.5; } 
                    }
                    .notification-item.warning .notification-icon { 
                        animation: notification-pulse 2s infinite; 
                    }
                `;
            }
            
            const styleTag = document.createElement('style');
            styleTag.id = this._styleId;
            styleTag.appendChild(document.createTextNode(css));
            document.head.appendChild(styleTag);
        } catch (e) {
            this._handleError('injectStyles', e);
        }
    }

    /**
     * Muestra una notificación
     */
    show(message = 'Notificación', type = 'info', options = {}) {
        try {
            this.initialize();

            // Validar y mezclar opciones
            const defaultOptions = {
                duration: null,
                pool: 'default',
                onExpire: null,
                data: {}
            };
            const opts = Object.assign({}, defaultOptions, typeof options === 'number' ? { duration: options } : options);

            // Verificar si es duplicado
            if (this.config.preventDuplicates) {
                const duplicateId = this._checkForDuplicate(message, type, opts.pool, opts);
                if (duplicateId) {
                    return this._updateExistingNotification(duplicateId, message, type, opts);
                }
            }

            // Limitar el número total de notificaciones
            if (this.notifications.size >= this.config.maxNotifications) {
                let oldestId = null;
                let oldestTime = Infinity;
                
                for (const [id, notification] of this.notifications.entries()) {
                    if (notification.createdAt < oldestTime) {
                        oldestTime = notification.createdAt;
                        oldestId = id;
                    }
                }
                
                if (oldestId) {
                    this._removeNotification(oldestId);
                }
            }

            const notificationId = `notification-${++this.notificationCounter}`;
            const displayDuration = opts.duration !== null ? opts.duration : this.config.visibleDuration;

            // Crear elemento
            const notificationElement = document.createElement('div');
            notificationElement.id = notificationId;
            notificationElement.className = `notification-item ${type}`;
            notificationElement.setAttribute('role', 'region');
            notificationElement.setAttribute('aria-label', 'Notification');
            notificationElement.innerHTML = `
                <div class="notification-header">
                    <div class="notification-icon ${type}" aria-hidden="true"></div>
                    <div class="notification-message">${message}</div>
                </div>
                ${this._debug ? `<div class="notification-timer">${notificationId.split('-')[1]}</div>` : ''}
            `;

            this._hubElement.appendChild(notificationElement);

            // Aplicar animación de entrada después de un frame
            requestAnimationFrame(() => {
                setTimeout(() => {
                    notificationElement.classList.add('show');
                }, 10);
            });

            // Crear objeto de notificación
            const notification = {
                id: notificationId,
                element: notificationElement,
                message: message,
                type: type,
                pool: opts.pool,
                data: opts.data,
                onExpire: opts.onExpire,
                createdAt: Date.now(),
                expiresAt: displayDuration > 0 ? Date.now() + displayDuration : null,
                timer: null,
                isActive: true
            };

            // Guardar en Map
            this.notifications.set(notificationId, notification);

            // Registrar para detección de duplicados
            if (this.config.preventDuplicates) {
                const duplicateKey = this._generateDuplicateKey(message, type, opts.pool, opts);
                this.duplicateTracker.set(duplicateKey, notificationId);
            }

            // Añadir al pool
            if (!this.pools.has(opts.pool)) {
                this.pools.set(opts.pool, new Set());
            }
            this.pools.get(opts.pool).add(notificationId);

            // Configurar temporizador si hay duración
            if (displayDuration > 0) {
                notification.timer = setTimeout(() => {
                    this._expireNotification(notificationId);
                }, displayDuration);
            }

            if (this._debug) {
                console.log(`NotificationHub: Mostrada [${notificationId}] en pool "${opts.pool}"`, {
                    message,
                    type,
                    duration: displayDuration,
                    total: this.notifications.size
                });
            }

            return notificationId;

        } catch (e) {
            this._handleError('show', e);
            return null;
        }
    }

    /**
     * Maneja la expiración de una notificación
     * @private
     */
    _expireNotification(notificationId) {
        try {
            const notification = this.notifications.get(notificationId);
            if (!notification) return;

            // Eliminar del tracker de duplicados
            if (this.config.preventDuplicates) {
                const duplicateKey = this._generateDuplicateKey(
                    notification.message, 
                    notification.type, 
                    notification.pool, 
                    notification.data
                );
                this.duplicateTracker.delete(duplicateKey);
            }

            // Llamar callback si existe
            if (notification.onExpire && typeof notification.onExpire === 'function') {
                try {
                    notification.onExpire(notification);
                } catch (e) {
                    this._handleError('onExpire callback', e);
                }
            }

            // Eliminar la notificación
            this._removeNotification(notificationId);
            
        } catch (e) {
            this._handleError('_expireNotification', e);
        }
    }

    /**
     * Elimina una notificación específica
     * @private
     */
    _removeNotification(notificationId) {
        try {
            const notification = this.notifications.get(notificationId);
            if (!notification) return;

            // Eliminar del tracker de duplicados
            if (this.config.preventDuplicates) {
                const duplicateKey = this._generateDuplicateKey(
                    notification.message, 
                    notification.type, 
                    notification.pool, 
                    notification.data
                );
                this.duplicateTracker.delete(duplicateKey);
            }

            // Limpiar timer
            if (notification.timer) {
                clearTimeout(notification.timer);
            }

            // Marcar como inactiva
            notification.isActive = false;

            // Animación de salida
            notification.element.classList.remove('show');
            notification.element.classList.add('hide');

            // Eliminar del DOM después de animación
            setTimeout(() => {
                if (notification.element && notification.element.parentNode) {
                    notification.element.parentNode.removeChild(notification.element);
                }
            }, this.config.animationDuration);

            // Eliminar del pool
            if (this.pools.has(notification.pool)) {
                const poolSet = this.pools.get(notification.pool);
                poolSet.delete(notificationId);
                
                if (poolSet.size === 0) {
                    this.pools.delete(notification.pool);
                }
            }

            // Eliminar del Map principal
            this.notifications.delete(notificationId);

            if (this._debug) {
                console.log(`NotificationHub: Eliminada [${notificationId}]`, {
                    remaining: this.notifications.size
                });
            }

        } catch (e) {
            this._handleError('_removeNotification', e);
        }
    }

    /**
     * Métodos de conveniencia con soporte para pools
     */
    showInfo(message, duration = null, pool = 'default') {
        return this.show(message, 'info', { duration, pool });
    }

    showSuccess(message, duration = null, pool = 'default') {
        return this.show(message, 'success', { duration, pool });
    }

    showWarning(message, duration = null, pool = 'default') {
        return this.show(message, 'warning', { duration, pool });
    }

    showError(message, duration = null, pool = 'default') {
        return this.show(message, 'error', { duration, pool });
    }

    /**
     * Muestra notificación con opciones completas
     */
    showAdvanced(message, type = 'info', options = {}) {
        return this.show(message, type, options);
    }

    /**
     * Oculta una notificación específica
     */
    hideNotification(notificationId) {
        this._removeNotification(notificationId);
    }

    /**
     * Oculta todas las notificaciones de un pool específico
     */
    hidePool(poolName) {
        try {
            if (!this.pools.has(poolName)) return;

            const poolNotifications = Array.from(this.pools.get(poolName));
            poolNotifications.forEach(notificationId => {
                this._removeNotification(notificationId);
            });

            if (this._debug) {
                console.log(`NotificationHub: Pool "${poolName}" ocultado`, {
                    eliminadas: poolNotifications.length
                });
            }
        } catch (e) {
            this._handleError('hidePool', e);
        }
    }

    /**
     * Oculta todas las notificaciones
     */
    hideAllNotifications() {
        try {
            // Limpiar tracker de duplicados
            this.duplicateTracker.clear();
            
            const allIds = Array.from(this.notifications.keys());
            allIds.forEach(id => {
                this._removeNotification(id);
            });
        } catch (e) {
            this._handleError('hideAllNotifications', e);
        }
    }

    /**
     * Obtiene todas las notificaciones activas
     */
    getActiveNotifications() {
        return Array.from(this.notifications.values());
    }

    /**
     * Obtiene notificaciones de un pool específico
     */
    getNotificationsByPool(poolName) {
        if (!this.pools.has(poolName)) return [];
        
        const poolSet = this.pools.get(poolName);
        const notifications = [];
        
        for (const notificationId of poolSet) {
            const notification = this.notifications.get(notificationId);
            if (notification) {
                notifications.push(notification);
            }
        }
        
        return notifications;
    }

    /**
     * Obtiene información de una notificación específica
     */
    getNotification(notificationId) {
        return this.notifications.get(notificationId) || null;
    }

    /**
     * Verifica si una notificación existe y está activa
     */
    hasNotification(notificationId) {
        const notification = this.notifications.get(notificationId);
        return notification && notification.isActive;
    }

    /**
     * Verifica si existe una notificación duplicada
     */
    hasDuplicate(message, type = 'info', pool = 'default', options = {}) {
        if (!this.config.preventDuplicates) return false;
        return this._checkForDuplicate(message, type, pool, options) !== null;
    }

    /**
     * Actualiza la configuración
     */
    updateConfig(newConfig = {}) {
        try {
            this.config = Object.assign({}, this.config, newConfig);
            
            // Actualizar autoCleanup si cambió
            if (newConfig.autoCleanup !== undefined) {
                if (newConfig.autoCleanup) {
                    this._startAutoCleanup();
                } else {
                    this._stopAutoCleanup();
                }
            }
            
            // Si se cambia preventDuplicates, limpiar tracker si se desactiva
            if (newConfig.preventDuplicates === false) {
                this.duplicateTracker.clear();
            }
            
            const styleTag = document.getElementById(this._styleId);
            if (styleTag) {
                styleTag.parentNode.removeChild(styleTag);
                this.injectStyles();
            }
        } catch (e) {
            this._handleError('updateConfig', e);
        }
    }

    /**
     * Destruye la instancia
     */
    destroy() {
        try {
            this._stopAutoCleanup();
            this.hideAllNotifications();

            const hub = document.getElementById('notification-hub');
            if (hub) hub.remove();
            
            const styleTag = document.getElementById(this._styleId);
            if (styleTag) styleTag.remove();

            this.notifications.clear();
            this.pools.clear();
            this.duplicateTracker.clear();
            this._hubElement = null;
            this.isInitialized = false;
        } catch (e) {
            this._handleError('destroy', e);
        }
    }

    /**
     * Métodos estáticos para gestión global
     */
    static instances = new Map();

    /**
     * Obtiene o crea una instancia con nombre
     */
    static getInstance(name = 'default', options = {}) {
        if (!NotificationHub.instances.has(name)) {
            NotificationHub.instances.set(name, new NotificationHub(options));
        }
        return NotificationHub.instances.get(name);
    }

    /**
     * Destruye una instancia específica
     */
    static destroyInstance(name = 'default') {
        const instance = NotificationHub.instances.get(name);
        if (instance) {
            instance.destroy();
            NotificationHub.instances.delete(name);
        }
    }

    /**
     * Obtiene todas las instancias
     */
    static getAllInstances() {
        return Array.from(NotificationHub.instances.values());
    }

    /**
     * Método especial para juegos RPG pixel art
     */
    static createRPGNotification(message, type = 'info', options = {}) {
        const rpgOptions = {
            pixelArtMode: true,
            width: 300,
            pixelSize: 3,
            position: 'top-left',
            preventDuplicates: true,
            backgroundColor: '#0a0a1a',
            borderColor: '#4a5568',
            font: "'Press Start 2P', monospace",
            ...options
        };
        
        const instance = NotificationHub.getInstance('rpg', rpgOptions);
        return instance.show(message, type, { duration: 4000, ...options });
    }
}

// Exportación y métodos globales
if (typeof window !== 'undefined') {
    window.NotificationHub = NotificationHub;
    
    // Métodos rápidos para juegos RPG
    window.showGameAlert = (message, type = 'info', duration = 4000) => {
        return NotificationHub.createRPGNotification(message, type, { duration });
    };
    
    window.showQuestUpdate = (message) => {
        return NotificationHub.createRPGNotification(`🎮 ${message}`, 'success', { duration: 5000 });
    };
    
    window.showDamageAlert = (message) => {
        return NotificationHub.createRPGNotification(`⚔️ ${message}`, 'error', { duration: 3000 });
    };
    
    window.showItemFound = (message) => {
        return NotificationHub.createRPGNotification(`📦 ${message}`, 'info', { duration: 4000 });
    };
    
    window.showXPUpdate = (message) => {
        return NotificationHub.createRPGNotification(`⭐ ${message}`, 'success', { duration: 3500 });
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationHub;
}