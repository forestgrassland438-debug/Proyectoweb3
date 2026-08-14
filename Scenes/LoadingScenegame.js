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
 * VERSIÓN: v13.1.0-release  (blockchain inventory sync)
 * GENERADO: 30/03/2026
 * ============================================================================
 *
 * CAMBIOS v13.1.0
 * ──────────────────────────────────────────────────────────────────────────
 *  • syncInventoryWithBlockchain():
 *      Sincronización slot-por-slot al cargar. Llama a getUserInventorySnapshot()
 *      (1 sola llamada RPC) o batchVerifySlots() para verificar los 47 slots
 *      (40 inventario + 7 cofre). Cualquier slot cuyo idx o manualId no exista
 *      en blockchain, o cuya cantidad difiera, es corregido antes de que la
 *      escena transite a GameScene.
 *  • _buildSyncMaps(): parseo robusto del snapshot RPC.
 *  • _applySyncToSlots(): lógica de corrección y log detallado.
 *  • _syncFallback(): usa batchVerifySlots() como alternativa si el contrato
 *      aún no tiene getUserInventorySnapshot().
 *  • Toda la sincronización es no-bloqueante: si falla, registra el error y
 *      continúa hacia GameScene sin romper el flujo de carga.
 * ============================================================================
 */

// ─── BootScene ─────────────────────────────────────────────────────────────
class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        window.showLoadingOverlay({
            message: 'Cargando Phaser...',
            initialProgress: 0.1
        });

        this.load.on('progress', (value) => {
            window.updateLoadingProgress(value);
        });

        this.load.on('complete', () => {
            window.hideLoadingOverlay();
        });
    }

    create() {
        this.scene.start('LoadingScenegame');
    }
}

// ─── LoadingScenegame ───────────────────────────────────────────────────────
class LoadingScenegame extends Phaser.Scene {
    constructor() {
        super({ key: 'LoadingScenegame' });

        // FIX: "elipeticiones" se fijaba a 0 y se comprobaba "=== 0" en el
        // mismo bloque, y nunca se incrementaba en ningún otro punto del
        // archivo → la condición siempre era true y serverBase terminaba
        // SIEMPRE en 127.0.0.1:3001, incluso en producción (de ahí el
        // ERR_CONNECTION_REFUSED al pedir csrf-token y auth/me).
        // Ahora se decide según el host real donde corre el juego.
        const _host = window.location.hostname;
        const _isLocal = _host === 'localhost' || _host === '127.0.0.1';
        this.serverBase = _isLocal
            ? 'http://127.0.0.1:8080'   // ajusta el puerto si tu server2.js local usa otro (ver PORT en tu .env)
            : 'https://api.grasslandforest.com';

        this.playerName = null;
        this.address    = null;
        this.csrfToken  = null;
        this.isAuthenticated = false;

        // Relay client para sincronización blockchain
        this.relayClient = null;
        // Nombre del contrato registrado en el backend
        this._ITEM_CONTRACT_NAME = 'ItemContract';

        this.transactionSystem = null;

        this.stars         = [];
        this.starFieldDepth = 3;
        this.graphics      = null;

        this.STATE = {
            slots:      new Array(40).fill(null),
            quickSlots: new Array(7).fill(null),
            selectedItem: null
        };

        // Propiedades del jugador
        this.posicionplayerx  = 2097;
        this.posicionplayery  = 2359;
        this.vidaPorcentaje   = 10000;
        this.aguaPorcentaje   = 10000;
        this.comidaPorcentaje = 10000;
        this.speed    = 2.7;
        this.mundo    = 1;
        this.moneda   = 10000;
        this.nivel    = 0;
        this.nivel_exp = 0;
        this.sabiduria    = 0;
        this.sabiduria_exp = 0;
        this.fuerza       = 0;
        this.fuerza_exp   = 0;
        this.agricultura  = 0;
        this.agricultura_exp = 0;
        this.misiones = 0;
        this.Username = '---';
        this.moneda_plata = 0;  // moneda de plata sincronizada con contrato

        this.mineria      = 0;
        this.mineria_exp  = 0;
        this.pesca        = 0;
        this.pesca_exp    = 0;
        this.cocina       = 0;
        this.cocina_exp   = 0;
        this.deforestacion     = 0;
        this.deforestacion_exp = 0;

        // ── ItemDefinitions: todos los ítems del juego ──────────────────────
        this.ItemDefinitions = {
            item_1: { src: './Game/Source/recurso.png',  maxStack: 10 },
            item_2: { src: './Game/Source/recurso2.png', maxStack: 5  },
            item_3: { src: './Game/Source/tijeras.png',  maxStack: 20 },

            hacha_de_madera: { src: './Game/Source/pico_y_hacha/hacha_de_madera.png', maxStack: 5,  usos: 5  },
            hacha_de_piedra: { src: './Game/Source/pico_y_hacha/hacha_de_piedra.png', maxStack: 5,  usos: 10 },
            hacha_de_cobre:  { src: './Game/Source/pico_y_hacha/hacha_de_cobre.png',  maxStack: 5,  usos: 20 },
            hacha_de_hierro: { src: './Game/Source/pico_y_hacha/hacha_de_hierro.png', maxStack: 5,  usos: 40 },
            pico_de_madera:  { src: './Game/Source/pico_y_hacha/pico_de_madera.png',  maxStack: 5,  usos: 5  },
            pico_de_piedra:  { src: './Game/Source/pico_y_hacha/pico_de_piedra.png',  maxStack: 5,  usos: 10 },
            pico_de_cobre:   { src: './Game/Source/pico_y_hacha/pico_de_cobre.png',   maxStack: 5,  usos: 20 },
            pico_de_hierro:  { src: './Game/Source/pico_y_hacha/pico_de_hierro.png',  maxStack: 5,  usos: 40 },

            mineral_piedra:   { src: './Game/Source/piedra.png',         maxStack: 20 },
            mineral_cobre:    { src: './Game/Source/cobre.png',          maxStack: 20 },
            mineral_hierro:   { src: './Game/Source/hierro.png',         maxStack: 20 },
            palo:             { src: './Game/Source/palo.png',           maxStack: 20 },
            tablon_de_madera: { src: './Game/Source/madera.png',         maxStack: 20 },
            madera_pinos:     { src: './Game/Source/madera_oscura.png',  maxStack: 50 },
            madera_con_hojas: { src: './Game/Source/madera de hoja.png', maxStack: 50 },
            madera_seca:      { src: './Game/Source/madera seca.png',    maxStack: 50 },

            balde_vacio:    { src: './Game/Source/item_pozo1.png', maxStack: 5 },
            balde_con_agua: { src: './Game/Source/item_pozo2.png', maxStack: 5 },
            Regaderax:      { src: './Game/Source/recurso2.png',   maxStack: 1 },
            Tijerasx:       { src: './Game/Source/tijeras.png',    maxStack: 1 },

            Semillax:  { src: './Game/Objetos/Plantas/planta_zanahorias/item_saco.png',           maxStack: 50 },
            Semillax1: { src: './Game/Objetos/Plantas/planta_tomates/semillas_tomate.png',        maxStack: 50 },
            Semillax2: { src: './Game/Objetos/Plantas/planta_trigo/item_semilla_trigo.png',       maxStack: 50 },
            Semillax3: { src: './Game/Objetos/Plantas/planta_calabaza/item_semilla_calabaza.png', maxStack: 50 },

            zanahoria_buena: { src: './Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_buena.png',          maxStack: 20 },
            zanahoria_corta: { src: './Game/Objetos/Plantas/planta_zanahorias/planta_crecimiento_zanahoria.png',  maxStack: 20 },
            zanahoria_mala:  { src: './Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_podrida.png',        maxStack: 20 },
            tomate_buena:    { src: './Game/Objetos/Plantas/planta_tomates/item_tomate_bueno.png',                maxStack: 20 },
            tomate_corta:    { src: './Game/Objetos/Plantas/planta_tomates/item_planta.png',                      maxStack: 20 },
            tomate_mala:     { src: './Game/Objetos/Plantas/planta_tomates/item_tomate_malo.png',                 maxStack: 20 },
            trigo_buena:     { src: './Game/Objetos/Plantas/planta_trigo/item_trigo_bueno.png',                   maxStack: 20 },
            trigo_corta:     { src: './Game/Objetos/Plantas/planta_trigo/item_planta_trigo.png',                  maxStack: 20 },
            trigo_mala:      { src: './Game/Objetos/Plantas/planta_trigo/item_trigo_podrido.png',                 maxStack: 20 },
            calabaza_buena:  { src: './Game/Objetos/Plantas/planta_calabaza/item_calabaza_buena.png',             maxStack: 20 },
            calabaza_corta:  { src: './Game/Objetos/Plantas/planta_calabaza/item_planta_calabaza.png',            maxStack: 20 },
            calabaza_mala:   { src: './Game/Objetos/Plantas/planta_calabaza/item_calabaza_podrida.png',           maxStack: 20 },
        };

        // Mapa tipo blockchain → key de ItemDefinitions
        // El tipo en el contrato es como "hacha de madera"; el key del juego es "hacha_de_madera".
        this.TIPO_TO_ITEM_ID = {
            'hacha de madera':  'hacha_de_madera',
            'hacha de piedra':  'hacha_de_piedra',
            'hacha de cobre':   'hacha_de_cobre',
            'hacha de hierro':  'hacha_de_hierro',
            'pico de madera':   'pico_de_madera',
            'pico de piedra':   'pico_de_piedra',
            'pico de cobre':    'pico_de_cobre',
            'pico de hierro':   'pico_de_hierro',
            'mineral piedra':   'mineral_piedra',
            'mineral cobre':    'mineral_cobre',
            'mineral hierro':   'mineral_hierro',
            'tablon de madera': 'tablon_de_madera',
            'madera pinos':     'madera_pinos',
            'madera con hojas': 'madera_con_hojas',
            'madera seca':      'madera_seca',
            'balde vacio':      'balde_vacio',
            'balde con agua':   'balde_con_agua',
            'zanahoria buena':  'zanahoria_buena',
            'zanahoria corta':  'zanahoria_corta',
            'zanahoria mala':   'zanahoria_mala',
            'tomate buena':     'tomate_buena',
            'tomate corta':     'tomate_corta',
            'tomate mala':      'tomate_mala',
            'trigo buena':      'trigo_buena',
            'trigo corta':      'trigo_corta',
            'trigo mala':       'trigo_mala',
            'calabaza buena':   'calabaza_buena',
            'calabaza corta':   'calabaza_corta',
            'calabaza mala':    'calabaza_mala',
        };

        console.log('LoadingScenegame initialized');

        this.loadingSystem = new LoadingSystem();

        // Auto-refresh de token
        this.autoRefreshInterval   = null;
        this.autoRefreshEnabled    = true;
        this.lastActivityTime      = Date.now();
        this.refreshInProgress     = false;
        this.maxRefreshAttempts    = 3;
        this.currentRefreshAttempts = 0;
        this.lastRefreshTime       = 0;
        this.minRefreshInterval    = 30000;
    }

    // =========================================================================
    //  AUTENTICACIÓN
    // =========================================================================

    async loadx() {
        console.log('🔍 Iniciando verificación de autenticación...');

        try {
            await this.getCSRFToken();

            const response = await this.fetchWithTokenRetry(`${this.serverBase}/api/auth/me`, {
                method: 'GET'
            });

            console.log('📊 Response status de /api/auth/me:', response.status);

            if (!response.ok) {
                console.error('❌ Error de autenticación:', response.status);

                if (response.status === 401) {
                    const refreshSuccess = await this.refreshAuthToken();
                    if (refreshSuccess) {
                        const retryResponse = await this.fetchWithTokenRetry(
                            `${this.serverBase}/api/auth/me`, { method: 'GET' }
                        );
                        if (retryResponse.ok) {
                            const data = await retryResponse.json();
                            return this.handleAuthSuccess(data);
                        }
                    }
                }

                this.showTokenErrorHub();
                return false;
            }

            const data = await response.json();
            return this.handleAuthSuccess(data);

        } catch (error) {
            console.error('❌ Error en loadx:', error);
            this.showTokenErrorHub();
            return false;
        }
    }

    handleAuthSuccess(data) {
        if (data.authenticated && data.address) {
            this.isAuthenticated = true;
            this.address    = data.address;
            this.playerName = data.playerName || data.address;

            console.log('✅ Usuario autenticado:', {
                address:    this.address.substring(0, 10) + '...',
                playerName: this.playerName,
                hasPlayerName: !!data.playerName
            });

            this.lastActivityTime = Date.now();
            this.startAutoRefresh();
            return true;
        } else {
            console.error('❌ Usuario no autenticado o sin address');
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
                window.csrfToken = data.csrfToken; // Compartir con StatsSync
                console.log('✅ Token CSRF obtenido:', this.csrfToken ? 'Sí' : 'No');
                return true;
            } else {
                console.warn('⚠️ No se pudo obtener token CSRF, status:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ Error obteniendo CSRF token:', error);
            return false;
        }
    }

    async checkAuthStatus() {
        try {
            const response = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/auth/me`, { method: 'GET' }
            );
            if (response.ok) {
                const data = await response.json();
                return data.authenticated === true;
            }
            return false;
        } catch (error) {
            console.error('❌ Error verificando estado de autenticación:', error);
            return false;
        }
    }

    // =========================================================================
    //  AUTO-REFRESH DE TOKEN
    // =========================================================================

    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }

        if (!this.autoRefreshEnabled || !this.isAuthenticated) {
            console.log('🔄 Auto-refresh deshabilitado o usuario no autenticado');
            return;
        }

        console.log('🔄 Iniciando sistema de auto-refresh mejorado...');

        this.autoRefreshInterval = setInterval(async () => {
            try {
                if (!this.isAuthenticated || !this.playerName) {
                    console.log('🔄 Usuario no autenticado, deteniendo auto-refresh');
                    this.stopAutoRefresh();
                    return;
                }

                const now = Date.now();
                const timeSinceLastRefresh = now - this.lastRefreshTime;

                if (timeSinceLastRefresh < 120000) {
                    console.log(`🔄 Esperando, refrescado hace ${Math.floor(timeSinceLastRefresh / 1000)} segundos`);
                    return;
                }

                const inactiveTime = now - this.lastActivityTime;
                if (inactiveTime < 30 * 60 * 1000) {
                    const success = await this.refreshAuthToken();

                    if (success) {
                        console.log('✅ Auto-refresh exitoso');
                        this.lastRefreshTime = now;
                        this.currentRefreshAttempts = 0;
                    } else {
                        console.warn('⚠️ Auto-refresh falló');
                        this.currentRefreshAttempts++;

                        if (this.currentRefreshAttempts >= this.maxRefreshAttempts) {
                            console.error('❌ Demasiados intentos fallidos de auto-refresh');
                            const authStatus = await this.checkAuthStatus();
                            if (!authStatus) {
                                console.log('🔐 Autenticación perdida, mostrando error');
                                this.showTokenErrorHub();
                            }
                            this.currentRefreshAttempts = 0;
                        }
                    }
                } else {
                    console.log('⏰ Usuario inactivo, omitiendo auto-refresh');
                }
            } catch (error) {
                console.error('❌ Error en auto-refresh:', error);
            }
        }, 240000);

        console.log('✅ Sistema de auto-refresh iniciado (cada 4 minutos)');
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('🛑 Auto-refresh detenido');
        }
    }

    async refreshAuthToken() {
        if (this.refreshInProgress) {
            console.log('🔄 Refresh ya en progreso, omitiendo...');
            return false;
        }

        this.refreshInProgress = true;

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
                if (data.csrfToken) {
                    this.csrfToken = data.csrfToken;
                    window.csrfToken = data.csrfToken;
                    console.log('✅ Token CSRF actualizado');
                }
                this.lastActivityTime = Date.now();
                this.refreshInProgress = false;
                this.currentRefreshAttempts = 0;
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn('⚠️ Falló el refresh del token:', response.status, errorData);
                this.refreshInProgress = false;
                return false;
            }
        } catch (error) {
            console.error('❌ Error al refrescar token:', error);
            this.refreshInProgress = false;
            return false;
        }
    }

    // =========================================================================
    //  FETCH WRAPPER CON REINTENTOS
    // =========================================================================

    async fetchWithTokenRetry(url, options = {}, maxRetries = 2) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-Token': window.getCsrfToken(this.csrfToken)
            }
        };

        const fetchOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };

        let retries = 0;
        let lastResponse = null;

        while (retries <= maxRetries) {
            try {
                console.log(`📤 Fetch ${url} (intento ${retries + 1}/${maxRetries + 1})`);

                const response = await fetch(url, fetchOptions);
                lastResponse = response;

                if (response.ok) return response;

                if (response.status === 401) {
                    console.log('🔐 Error 401 detectado, intentando refresh...');

                    let errorBody = {};
                    try { errorBody = await response.json(); } catch (e) { /* noop */ }

                    const isTokenError = errorBody.error && (
                        errorBody.error.includes('token_expired') ||
                        errorBody.error.includes('invalid_session') ||
                        errorBody.error.includes('authentication_required') ||
                        errorBody.canRefresh === true
                    );

                    if (isTokenError && retries < maxRetries) {
                        const refreshSuccess = await this.refreshAuthToken();
                        if (refreshSuccess) {
                            fetchOptions.headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
                            retries++;
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                            continue;
                        } else {
                            console.error('❌ No se pudo refrescar el token');
                            break;
                        }
                    } else {
                        console.error(`❌ Error ${response.status} no manejable por refresh`);
                        break;
                    }
                } else if (response.status === 403) {
                    console.log('🔐 Error 403, verificando CSRF...');
                    if (retries < maxRetries) {
                        await this.getCSRFToken();
                        if (this.csrfToken) {
                            fetchOptions.headers['X-CSRF-Token'] = window.getCsrfToken(this.csrfToken);
                            retries++;
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                            continue;
                        } else {
                            console.error('❌ No se pudo obtener nuevo token CSRF');
                            break;
                        }
                    }
                } else {
                    console.error(`❌ Error HTTP ${response.status}`);
                    break;
                }

            } catch (error) {
                console.error(`❌ Error de red (intento ${retries + 1}):`, error);
                retries++;
                if (retries > maxRetries) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }

        return lastResponse;
    }

    // =========================================================================
    //  CARGA DE DATOS DEL JUGADOR
    // =========================================================================

    async loadPlayerData() {
        console.log('📥 Cargando datos del jugador...');

        try {
            if (!this.playerName || !this.isAuthenticated) {
                console.error('❌ No se puede cargar datos: jugador no autenticado');
                return null;
            }

            const response = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/load/${encodeURIComponent(this.playerName)}`,
                { method: 'GET', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Error al cargar datos del jugador:', {
                    status: response.status,
                    error: errorText
                });
                return null;
            }

            const data = await response.json();
            console.log('✅ Datos del jugador recibidos');

            // Inicializar STATE limpio
            if (!this.STATE) {
                this.STATE = {
                    slots:      new Array(40).fill(null),
                    quickSlots: new Array(7).fill(null),
                    selectedItem: null
                };
                console.log('🆕 STATE inicializado desde cero');
            }

            this.STATE.slots.fill(null);
            this.STATE.quickSlots.fill(null);

            // Cargar inventario desde BD
            if (data.inventory && Array.isArray(data.inventory)) {
                console.log(`📦 Cargando ${data.inventory.length} items del inventario`);
                data.inventory.forEach(s => {
                    if (typeof s.id === 'number' && s.objeto && s.id < 40) {
                        this.STATE.slots[s.id] = {
                            id:    s.objeto,
                            idx:   s.IDX  ?? s.id,
                            idm:   s.Manualid ?? s.objeto,
                            count: s.cantidad || 1
                        };
                    }
                });
            }

            // Cargar cofre (quickSlots) desde BD
            if (data.chest && Array.isArray(data.chest)) {
                console.log(`🎁 Cargando ${data.chest.length} items del cofre`);
                data.chest.forEach(s => {
                    if (typeof s.id === 'number' && s.objeto && s.id < 7) {
                        this.STATE.quickSlots[s.id] = {
                            id:    s.objeto,
                            idx:   s.IDX  ?? s.id,
                            idm:   s.Manualid ?? s.objeto,
                            count: s.cantidad || 1
                        };
                    }
                });
            }

            // Propiedades del jugador
            // ── HABILIDADES: LEERLAS AQUÍ NO ES OPCIONAL ────────────────────
            // BUG GRAVE QUE ESTO ARREGLA — "las skills nunca suben" / "vuelven
            // a cero solas":
            //
            // Esta escena nace con `mineria = pesca = cocina = deforestacion =
            // fuerza = agricultura = 0` (ver el constructor) y su savegg() manda
            // ESOS CEROS en el cuerpo de /api/save. Como esta lista —la única
            // que copia la respuesta de /api/load a la escena— no incluía las
            // habilidades, los ceros nunca se sustituían por los valores reales.
            //
            // Y savegg() aquí no es un caso raro: se llama en cada arranque en
            // el que la sincronización con la blockchain corrige o añade algún
            // ítem (lo normal), y esta escena es además la que se atraviesa al
            // VOLVER DE UNA BATALLA. Resultado: farming, mining y woodcutting se
            // borraban solas cada dos por tres, por mucho que el jugador
            // trabajara. Leyéndolas, el guardado devuelve lo que ya había.
            const playerProps = [
                'posicionplayerx', 'posicionplayery',
                'vidaPorcentaje', 'aguaPorcentaje', 'comidaPorcentaje',
                'speed', 'mundo', 'moneda', 'moneda_plata',
                'nivel', 'nivel_exp', 'misiones', 'Username', 'lenguaje',
                'agricultura', 'agricultura_exp', 'mineria', 'mineria_exp',
                'deforestacion', 'deforestacion_exp',
                'pesca', 'pesca_exp', 'cocina', 'cocina_exp', 'fuerza', 'fuerza_exp'
            ];

            playerProps.forEach(prop => {
                if (data[prop] !== undefined && data[prop] !== null) {
                    this[prop] = data[prop];
                }
            });

            // Marca de que las habilidades YA vienen de la base de datos. savegg()
            // solo las manda si esto es true: si por lo que sea se guardara antes
            // de cargar, se dejan fuera del cuerpo en vez de escribir los ceros
            // del constructor encima del progreso real.
            this._skillsCargadas = true;

            if (this.player) {
                this.player.setVisible(true);
                this.player.setPosition(this.posicionplayerx, this.posicionplayery);
            }

            // Publicar address y playerName globalmente para que las escenas los usen
            // NOTA: window.playerStats se setea en syncStatsWithBlockchain con los
            // valores canónicos del contrato — no lo sobreescribir aquí con valores de BD.
            window.currentPlayer  = this.playerName;
            window.currentAddress = this.address;
            // Solo inicializar si aún no existe (no sobreescribir valores del contrato)
            if (!window.playerStats) {
                window.playerStats = {
                    vida:   this.vidaPorcentaje || 0,
                    agua:   this.aguaPorcentaje || 0,
                    comida: this.comidaPorcentaje || 0,
                    oro:    this.moneda         || 0,
                    plata:  this.moneda_plata   || 0,
                    exp:    this.nivel_exp      || 0,
                    invoiceIds: {}
                };
                console.log('📊 window.playerStats inicializado (primera vez, desde BD):', window.playerStats);
            }

            console.log('✅ Datos del jugador cargados exitosamente');
            return data;

        } catch (error) {
            console.error('❌ Error de red al cargar datos del jugador:', error);
            return null;
        }
    }


    // =========================================================================
    //  SINCRONIZACIÓN DE STATS VITALES (vida/agua/comida/oro/plata)
    // =========================================================================

    /**
     * Sincroniza las 5 tablas de stats (vida, agua, comida, oro, plata) con el
     * smart contract InvoiceSystem. Si no existen facturas únicas para el jugador,
     * las crea con valores por defecto (100000/100000/100000/0/0).
     * Actualiza window.playerStats con los valores canónicos del contrato.
     * No-bloqueante: si falla, continúa con los valores cargados desde BD.
     */
    async syncStatsWithBlockchain() {
        if (!this.address || !this.isAuthenticated || !this.playerName) {
            console.warn('⚠️ [stats-sync] Saltando: usuario no autenticado');
            return;
        }

        console.log('🔗 [stats-sync] Iniciando sincronización de stats...');

        try {
            const resp = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/stats/${encodeURIComponent(this.playerName)}/sync`,
                {
                    method: 'POST',
                    body: JSON.stringify({ address: this.address })
                }
            );

            if (!resp || !resp.ok) {
                const errText = resp ? await resp.text().catch(() => '') : 'sin respuesta';
                console.warn('⚠️ [stats-sync] Sync falló, usando valores de BD:', errText);
                return;
            }

            const data = await resp.json();
            const stats = data.stats;

            if (!stats) {
                console.warn('⚠️ [stats-sync] Respuesta sin stats');
                return;
            }

            // Aplicar los valores del contrato a las propiedades locales
            this.vidaPorcentaje   = typeof stats.vida   === 'number' ? stats.vida   : this.vidaPorcentaje;
            this.aguaPorcentaje   = typeof stats.agua   === 'number' ? stats.agua   : this.aguaPorcentaje;
            this.comidaPorcentaje = typeof stats.comida === 'number' ? stats.comida : this.comidaPorcentaje;
            // oro/plata: usar el valor del contrato siempre (0 si no hay factura)
            this.moneda       = typeof stats.oro   === 'number' ? stats.oro   : 0;
            this.moneda_plata = typeof stats.plata === 'number' ? stats.plata : 0;
            // exp: tiene su propia tabla en el contrato, igual que oro y plata.
            // Solo se pisa el valor local cuando la factura de exp ya existe;
            // si todavía no se creó, el backend la sembrará con este valor.
            if (typeof stats.exp === 'number' && stats.invoiceIds && stats.invoiceIds.exp) {
                this.nivel_exp = stats.exp;
            }

            // Actualizar window.playerStats con valores canónicos del contrato
            window.playerStats = {
                vida:       this.vidaPorcentaje,
                agua:       this.aguaPorcentaje,
                comida:     this.comidaPorcentaje,
                oro:        this.moneda,       // ya es 0 si no hay factura
                plata:      this.moneda_plata, // ya es 0 si no hay factura
                exp:        this.nivel_exp || 0,
                invoiceIds: stats.invoiceIds || {}
            };
            if (data.pending && data.pending.length) {
                console.warn('⏳ [stats-sync] Sin factura todavía:', data.pending.join(', '));
            }
            // Actualizar display de monedas inmediatamente
            const elLeft  = document.getElementById('info-text-left');
            const elRight = document.getElementById('info-text-right');
            if (elLeft)  elLeft.textContent  = `${this.moneda}`;
            if (elRight) elRight.textContent = `${this.moneda_plata}`;

            console.log('✅ [stats-sync] Stats sincronizados desde contrato:', window.playerStats,
                '| fuente:', data.source || 'chain');

        } catch (err) {
            console.warn('⚠️ [stats-sync] Error al sincronizar stats:', err.message || err);
            // Continuar con los valores actuales de BD — no romper el flujo
        }
    }

    // =========================================================================
    //  SINCRONIZACIÓN CON BLOCKCHAIN
    // =========================================================================

    /**
     * Inicializa un PhaserRelay instance reutilizable en LoadingScenegame.
     * Si ya existe y está autenticado, lo reutiliza.
     */
    async _ensureRelayClient() {
        if (this.relayClient) return this.relayClient;

        if (typeof PhaserRelay === 'undefined') {
            console.warn('⚠️ PhaserRelay no disponible. ¿Cargaste phaser-relay-library.js?');
            return null;
        }

        try {
            this.relayClient = new PhaserRelay({
                apiBase: this.serverBase,
                debug:   false
            });
            await this.relayClient.initialize();
        } catch (err) {
            console.warn('⚠️ Error inicializando PhaserRelay:', err.message || err);
            this.relayClient = null;
        }

        return this.relayClient;
    }

    /**
     * Parsea el snapshot de getUserInventorySnapshot() o getInvoicesSafe()
     * y construye:
     *   - invoiceById:       Map<number, {id, manualId, cantidad, tipo, active}>
     *   - invoiceByManualId: Map<string, misma estructura>
     */
    _buildSyncMaps(rawData) {
        const invoiceById       = new Map();
        const invoiceByManualId = new Map();

        if (!rawData) return { invoiceById, invoiceByManualId };

        // ── Normalizar a array de invoices ─────────────────────────────────
        // Formatos posibles según backend/relay:
        //  A) [{id:"1", manualId:"...", tipo:"hacha de madera", cantidad:"5", active:true}, ...]
        //  B) [["1","g33...","0x85...","hacha de madera","5",true,"..."], ...]
        //  C) { result: <A|B> }  (wrapper del relay)
        //  D) { id:"1", ... }    (bug: relay solo captura primer invoice del tuple[])

        const looksLikeInvoice = (x) =>
            x && typeof x === 'object' && !Array.isArray(x) &&
            (x.id !== undefined || x['0'] !== undefined);

        let arr = [];

        if (Array.isArray(rawData)) {
            if (rawData.length === 0) {
                arr = [];
            } else if (Array.isArray(rawData[0]) || looksLikeInvoice(rawData[0])) {
                arr = rawData; // ya es array de invoices (A o B)
            } else {
                // Array de primitivos = campos de UN invoice (bug relay)
                arr = [rawData];
            }
        } else if (rawData && typeof rawData === 'object') {
            const vals = Object.values(rawData);
            if (vals.length === 0) {
                arr = [];
            } else if (Array.isArray(vals[0])) {
                const inner = vals[0];
                if (inner.length === 0) {
                    arr = [];
                } else if (Array.isArray(inner[0]) || looksLikeInvoice(inner[0])) {
                    arr = inner; // array de invoices dentro del wrapper
                } else {
                    arr = [inner]; // inner = campos de un solo invoice
                }
            } else if (looksLikeInvoice(rawData)) {
                arr = [rawData]; // el rawData mismo es un solo invoice
            } else {
                arr = vals.filter(v => v && typeof v === 'object');
            }
        }

        for (const raw of arr) {
            if (!raw) continue;

            let id, manualId, tipo, cantidad, active;

            if (Array.isArray(raw)) {
                // Formato B: [id, manualId, owner, tipo, cantidad, active, createdAt]
                id       = Number(raw[0]);
                manualId = String(raw[1] !== undefined ? raw[1] : '');
                tipo     = String(raw[3] !== undefined ? raw[3] : '');
                cantidad = Number(raw[4]);
                active   = raw[5] !== false && raw[5] !== 'false' && raw[5] !== 0;
            } else if (typeof raw === 'object') {
                // Formato A: objeto nombrado
                id       = Number(raw.id      !== undefined ? raw.id      : (raw['0'] || 0));
                manualId = String(raw.manualId !== undefined ? raw.manualId: (raw['1'] || ''));
                tipo     = String(raw.tipo     !== undefined ? raw.tipo    : (raw['3'] || ''));
                cantidad = Number(raw.cantidad !== undefined ? raw.cantidad : (raw['4'] || 0));
                active   = raw.active !== undefined
                    ? (raw.active !== false && raw.active !== 'false' && raw.active !== 0)
                    : (raw['5'] !== false);
            } else {
                continue;
            }

            if (!id || isNaN(id) || id === 0 || !active) continue;

            const entry = { id, manualId, cantidad, tipo, active: true };
            invoiceById.set(id, entry);
            if (manualId) invoiceByManualId.set(manualId, entry);
        }

        console.log(`[sync] _buildSyncMaps: ${invoiceById.size} facturas activas parseadas`);
        return { invoiceById, invoiceByManualId };
    }

    /**
     * Aplica las correcciones del sync a un array de slots.
     * @param {Array}  slots       - this.STATE.slots o this.STATE.quickSlots
     * @param {string} label       - 'inv' | 'quick' para logs
     * @param {Map}    invoiceById - mapa construido por _buildSyncMaps
     * @returns {number} Número de correcciones aplicadas
     */
    _applySyncToSlots(slots, label, invoiceById) {
        let fixed = 0;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (!slot) continue;

            const idx = (slot.idx !== null && slot.idx !== undefined) ? Number(slot.idx) : null;
            const idm = slot.idm  || null;

            // ── Caso 1: sin idx o sin idm → el servidor ya debería haberlo filtrado,
            //            pero si llegó hasta aquí significa que es un ítem sin
            //            registro blockchain → limpiar.
            if (idx === null || !idm) {
                console.warn(`🗑️ [sync] ${label}[${i}] sin idx/idm → limpiando (sin registro blockchain)`);
                slots[i] = null;
                fixed++;
                continue;
            }

            const onChain = invoiceById.get(idx);

            // ── Caso 2: el idx no existe en blockchain → factura eliminada o IDX cambiado.
            if (!onChain) {
                console.warn(`🗑️ [sync] ${label}[${i}] idx=${idx} NO existe en blockchain → limpiando`);
                slots[i] = null;
                fixed++;
                continue;
            }

            // ── Caso 3: el manualId no coincide → IDX fue reutilizado por otra factura
            //            o el dato local está corrompido.
            if (onChain.manualId !== idm) {
                console.warn(
                    `🗑️ [sync] ${label}[${i}] idx=${idx} manualId NO coincide`,
                    `local="${idm}" blockchain="${onChain.manualId}" → limpiando`
                );
                slots[i] = null;
                fixed++;
                continue;
            }

            // ── Caso 4: todo coincide pero la cantidad difiere → blockchain es la fuente de verdad.
            if (slot.count !== onChain.cantidad) {
                console.warn(
                    `🔧 [sync] ${label}[${i}] idx=${idx} cantidad corregida:`,
                    `local=${slot.count} → blockchain=${onChain.cantidad}`
                );
                slot.count = onChain.cantidad;
                fixed++;
            }
            // Caso 5: todo correcto → no tocar.
        }

        return fixed;
    }

    /**
     * Fallback de sincronización usando batchVerifySlots() cuando
     * getUserInventorySnapshot() no está disponible en el contrato.
     *
     * batchVerifySlots(uint256[] slotIds, string[] slotManualIds)
     *   → (bool[] valid, uint256[] canonicalQty)
     */
    async _syncFallback(contract) {
        console.log('🔗 [sync-fallback] Usando batchVerifySlots...');

        // Recopilar todos los slots no nulos
        const allSlots = [];

        const collectSlots = (arr, prefix) => {
            for (let i = 0; i < arr.length; i++) {
                if (!arr[i]) continue;
                const idx = Number(arr[i].idx);
                const idm = arr[i].idm || '';
                if (!idx || !idm) continue;
                allSlots.push({ slotArr: arr, slotIndex: i, prefix, idx, idm });
            }
        };

        collectSlots(this.STATE.slots,      'inv');
        collectSlots(this.STATE.quickSlots, 'quick');

        if (allSlots.length === 0) {
            console.log('🔗 [sync-fallback] No hay slots para verificar.');
            return;
        }

        const slotIds       = allSlots.map(s => String(s.idx));
        const slotManualIds = allSlots.map(s => s.idm);

        let result;
        try {
            result = await this.relayClient.accion(contract.address, {
                funcion:        'batchVerifySlots',
                slotIds:        slotIds,
                slotManualIds:  slotManualIds,
                accion:         'obtener'
            });
        } catch (err) {
            console.error('❌ [sync-fallback] batchVerifySlots falló:', err.message || err);
            return;
        }

        if (!result) {
            console.warn('⚠️ [sync-fallback] batchVerifySlots devolvió vacío');
            return;
        }

        // Normalizar resultado → arrays valid[] y canonicalQty[]
        let validArr       = [];
        let canonicalQtArr = [];

        if (Array.isArray(result)) {
            // Resultado como tuple: [valid[], canonicalQty[]]
            validArr        = Array.isArray(result[0]) ? result[0] : [];
            canonicalQtArr  = Array.isArray(result[1]) ? result[1] : [];
        } else if (result && typeof result === 'object') {
            // Resultado como objeto nombrado: { valid: [...], canonicalQty: [...] }
            validArr       = result.valid       || result['0'] || [];
            canonicalQtArr = result.canonicalQty || result['1'] || [];
        }

        let fixed = 0;
        for (let i = 0; i < allSlots.length; i++) {
            const { slotArr, slotIndex, prefix, idx } = allSlots[i];
            const isValid     = !!validArr[i];
            const canonical   = Number(canonicalQtArr[i] || 0);

            if (!isValid) {
                console.warn(`🗑️ [sync-fallback] ${prefix}[${slotIndex}] idx=${idx} inválido en blockchain → limpiando`);
                slotArr[slotIndex] = null;
                fixed++;
            } else if (slotArr[slotIndex] && slotArr[slotIndex].count !== canonical) {
                console.warn(
                    `🔧 [sync-fallback] ${prefix}[${slotIndex}] idx=${idx} cantidad:`,
                    `local=${slotArr[slotIndex].count} → blockchain=${canonical}`
                );
                slotArr[slotIndex].count = canonical;
                fixed++;
            }
        }

        console.log(`✅ [sync-fallback] Finalizado. ${fixed} correcciones aplicadas.`);
    }

    // =========================================================================
    //  HELPERS DE SINCRONIZACIÓN BLOCKCHAIN
    // =========================================================================

    /**
     * Convierte el campo `tipo` del contrato al key de ItemDefinitions.
     * Ej: "hacha de madera" → "hacha_de_madera"
     */
    _tipoToItemId(tipo) {
        if (!tipo) return null;
        const tipoNorm = tipo.trim().toLowerCase();

        // 1. Mapa explícito TIPO_TO_ITEM_ID
        if (this.TIPO_TO_ITEM_ID && this.TIPO_TO_ITEM_ID[tipoNorm]) {
            return this.TIPO_TO_ITEM_ID[tipoNorm];
        }

        // 2. Conversión automática: "hacha de madera" → "hacha_de_madera"
        const autoKey = tipoNorm.replace(/\s+/g, '_');
        if (this.ItemDefinitions[autoKey]) return autoKey;

        // 3. Buscar por campo tipo dentro de ItemDefinitions
        for (const [key, def] of Object.entries(this.ItemDefinitions)) {
            if (def.tipo && def.tipo.toLowerCase() === tipoNorm) return key;
        }

        // 4. Intentar el tipo tal cual como clave directa
        if (this.ItemDefinitions[tipo]) return tipo;

        console.warn(`[sync] No se encontró itemId para tipo="${tipo}"`);
        return null;
    }

    /**
     * Agrega al inventario local los ítems que existen en blockchain
     * pero NO están en ningún slot local (ni por IDX ni por manualId).
     * Primero rellena slots de inventario (40), luego cofre (7).
     * @param {Map} invoiceById - mapa id→{id,manualId,cantidad,tipo,active}
     * @returns {number} cantidad de ítems nuevos agregados
     */
    _addMissingBlockchainItems(invoiceById) {
        if (!invoiceById || invoiceById.size === 0) return 0;

        // Colectar todos los idx y manualIds ya presentes localmente
        const usedIdx    = new Set();
        const usedManual = new Set();

        const scanSlots = (arr) => {
            for (const s of arr) {
                if (!s) continue;
                if (s.idx != null) usedIdx.add(Number(s.idx));
                if (s.idm)         usedManual.add(s.idm);
            }
        };
        scanSlots(this.STATE.slots);
        scanSlots(this.STATE.quickSlots);

        let added = 0;

        for (const [invoiceId, invoice] of invoiceById) {
            // Ya está cubierto en algún slot
            if (usedIdx.has(invoiceId) || usedManual.has(invoice.manualId)) continue;

            const itemId = this._tipoToItemId(invoice.tipo);
            if (!itemId) {
                console.warn(`🚫 [sync] invoice id=${invoiceId} tipo="${invoice.tipo}" sin itemId → omitiendo`);
                continue;
            }

            const def      = this.ItemDefinitions[itemId];
            const maxStack = def ? def.maxStack : 99;
            const cantidad = Math.min(Number(invoice.cantidad), maxStack);

            // Intentar inventario principal primero, luego cofre
            let placed = false;

            for (let i = 0; i < this.STATE.slots.length && !placed; i++) {
                if (this.STATE.slots[i] === null) {
                    this.STATE.slots[i] = { id: itemId, idx: invoiceId, idm: invoice.manualId, count: cantidad };
                    usedIdx.add(invoiceId);
                    usedManual.add(invoice.manualId);
                    placed = true;
                    added++;
                    console.log(`➕ [sync] Invoice id=${invoiceId} tipo="${invoice.tipo}" → slots[${i}] "${itemId}" x${cantidad}`);
                }
            }

            if (!placed) {
                for (let i = 0; i < this.STATE.quickSlots.length && !placed; i++) {
                    if (this.STATE.quickSlots[i] === null) {
                        this.STATE.quickSlots[i] = { id: itemId, idx: invoiceId, idm: invoice.manualId, count: cantidad };
                        usedIdx.add(invoiceId);
                        usedManual.add(invoice.manualId);
                        placed = true;
                        added++;
                        console.log(`➕ [sync] Invoice id=${invoiceId} tipo="${invoice.tipo}" → quickSlots[${i}] "${itemId}" x${cantidad}`);
                    }
                }
            }

            if (!placed) {
                console.warn(`⚠️ [sync] Invoice id=${invoiceId}: inventario y cofre llenos, no se pudo agregar`);
            }
        }

        return added;
    }

    /**
     * MÉTODO PRINCIPAL DE SINCRONIZACIÓN
     *
     * Verifica TODOS los slots del inventario y del cofre contra la blockchain
     * antes de transicionar a GameScene. Usa getUserInventorySnapshot() si
     * está disponible en el contrato (1 llamada RPC), o batchVerifySlots()
     * como fallback.
     *
     * No lanza excepciones hacia afuera — si falla, registra el error y continúa.
     */
    async syncInventoryWithBlockchain() {
        if (!this.address || !this.isAuthenticated) {
            console.warn('⚠️ [sync] Saltando sync: usuario no autenticado');
            return;
        }

        // Siempre sincronizamos: blockchain puede tener ítems que aún no están en BD
        console.log('🔗 [sync] Iniciando sincronización blockchain del inventario...');

        // ── 1. Inicializar relay client ─────────────────────────────────────
        const relay = await this._ensureRelayClient();
        if (!relay) {
            console.warn('⚠️ [sync] Relay client no disponible, saltando sync');
            return;
        }

        // ── 2. Verificar auth del relay ─────────────────────────────────────
        let auth;
        try {
            auth = await relay.checkAuth();
        } catch (e) {
            console.warn('⚠️ [sync] Error al verificar auth del relay:', e.message || e);
            return;
        }

        if (!auth || !auth.success) {
            console.warn('⚠️ [sync] Relay no autenticado. Saltando sync blockchain.');
            return;
        }

        // ── 3. Localizar contrato ───────────────────────────────────────────
        let contract;
        try {
            contract = await relay.findContract(this._ITEM_CONTRACT_NAME);
        } catch (e) {
            console.warn(`⚠️ [sync] No se encontró el contrato "${this._ITEM_CONTRACT_NAME}":`, e.message || e);
            return;
        }

        if (!contract || !contract.address) {
            console.warn(`⚠️ [sync] Contrato "${this._ITEM_CONTRACT_NAME}" no disponible`);
            return;
        }

        console.log(`🔗 [sync] Contrato encontrado: ${contract.address}`);

        // ── 4. Llamar getUserInventorySnapshot directamente al backend ──────
        //    NOTA: relay.accion() usa _normalizeResult() internamente, que para
        //    funciones que retornan tuple[] solo captura raw[0] (primer invoice).
        //    Llamamos /api/relay/call-view directamente para obtener el array
        //    completo y parsearlo nosotros con _buildSyncMaps.
        let syncOk = false;

        try {
            const snapResp = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/relay/call-view`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        contractAddress: contract.address,
                        functionName:    'getUserInventorySnapshot',
                        parameters:      { '0': this.address }
                    })
                }
            );

            if (!snapResp || !snapResp.ok) {
                throw new Error(`call-view HTTP ${snapResp ? snapResp.status : 'sin respuesta'}`);
            }

            const snapData = await snapResp.json();
            if (!snapData.success) {
                throw new Error(snapData.error || 'getUserInventorySnapshot devolvió error');
            }

            // snapData.result = [{id, manualId, tipo, cantidad, active, ...}, ...]
            // (array de objetos nombrados gracias al fix en convertBigIntToString)
            const { invoiceById } = this._buildSyncMaps(snapData.result);

            console.log(`🔗 [sync] Snapshot recibido: ${invoiceById.size} facturas activas`);

            const fixedInv   = this._applySyncToSlots(this.STATE.slots,      'inv',   invoiceById);
            const fixedQuick = this._applySyncToSlots(this.STATE.quickSlots,  'quick', invoiceById);
            const addedNew   = this._addMissingBlockchainItems(invoiceById);

            const totalFixed = fixedInv + fixedQuick + addedNew;
            console.log(
                `✅ [sync] Sincronización completada.`,
                `Inventario: ${fixedInv} correcciones, Cofre: ${fixedQuick} correcciones,`,
                `Nuevos de blockchain: ${addedNew}. Total: ${totalFixed}`
            );

            // Guardar estado corregido/aumentado en BD para que GameScene lo cargue limpio
            if (totalFixed > 0) {
                console.log(`💾 [sync] ${totalFixed} cambio(s) → guardando en BD...`);
                try {
                    await this.savegg();
                    console.log('✅ [sync] Estado guardado en BD.');
                } catch (saveErr) {
                    console.error('❌ [sync] Error al guardar en BD:', saveErr.message || saveErr);
                }
            }

            syncOk = true;

        } catch (snapshotErr) {
            console.warn(
                '⚠️ [sync] getUserInventorySnapshot falló (¿contrato viejo?), usando batchVerifySlots...',
                snapshotErr.message || snapshotErr
            );
        }

        // ── 5. Fallback: batchVerifySlots ───────────────────────────────────
        if (!syncOk) {
            try {
                await this._syncFallback(contract);
            } catch (fbErr) {
                console.error('❌ [sync] Fallback sync también falló:', fbErr.message || fbErr);
                // No bloqueamos: el juego sigue con los datos de BD
            }
        }
    }

    // =========================================================================
    //  RENDER
    // =========================================================================

    renderInventoryAfterLoad() {
        // En LoadingScenegame no existen aún los DOM slots del juego,
        // pero renderSlot maneja gracefully el caso en que no exista el elemento.
        if (typeof this.renderSlot === 'function') {
            console.log('🖼️ Renderizando slots del inventario...');
            for (let i = 0; i < 40; i++) this.renderSlot(i);
            for (let i = 0; i < 7; i++)  this.renderSlot(i);
        }
    }

    renderSlot(index) {
        const ghostInv   = this.STATE.ghostSlots ? this.STATE.ghostSlots.inv   : {};
        const ghostQuick = this.STATE.ghostSlots ? this.STATE.ghostSlots.quick : {};

        // Render inventario
        const invDiv = document.querySelector(`.inv-slot[data-slot-index="${index}"]`);
        if (invDiv) {
            invDiv.innerHTML = '';
            if (ghostInv[index]) {
                invDiv.classList.add('empty');
                invDiv.classList.remove('highlight');
            } else {
                const itemObj = this.STATE.slots[index];
                if (itemObj) {
                    const img = document.createElement('img');
                    img.src = this.ItemDefinitions[itemObj.id].src;
                    img.alt = itemObj.id;
                    invDiv.appendChild(img);
                    if (itemObj.count > 1) {
                        const span = document.createElement('span');
                        span.classList.add('item-count');
                        span.textContent = 'x' + itemObj.count;
                        invDiv.appendChild(span);
                    }
                    invDiv.classList.remove('empty');
                } else {
                    invDiv.classList.add('empty');
                }
                invDiv.classList.remove('highlight');
            }
        }

        // Render quick-slot (cofre)
        const quickDiv = document.querySelector(`.quick-slot[data-slot-index="${index}"]`);
        if (quickDiv) {
            quickDiv.innerHTML = '';
            if (ghostQuick[index]) {
                quickDiv.classList.add('empty');
                quickDiv.classList.remove('highlight');
            } else {
                const itemObj = this.STATE.quickSlots[index];
                if (itemObj) {
                    const img = document.createElement('img');
                    img.src = this.ItemDefinitions[itemObj.id].src;
                    img.alt = itemObj.id;
                    quickDiv.appendChild(img);
                    if (itemObj.count > 1) {
                        const span = document.createElement('span');
                        span.classList.add('item-count');
                        span.textContent = 'x' + itemObj.count;
                        quickDiv.appendChild(span);
                    }
                    quickDiv.classList.remove('empty');
                } else {
                    quickDiv.classList.add('empty');
                }
                quickDiv.classList.remove('highlight');
            }
        }
    }

    // =========================================================================
    //  GUARDADO
    // =========================================================================

    async savegg() {
        console.log('💾 Iniciando guardado del juego...');

        if (!this.playerName || !this.isAuthenticated) {
            console.error('❌ No se puede guardar: falta playerName o autenticación');
            return;
        }

        if (!this.csrfToken) {
            await this.getCSRFToken();
            if (!this.csrfToken) {
                console.error('❌ No se pudo obtener token CSRF para guardar');
                return;
            }
        }

        const inventoryData = this.STATE.slots.map((s, i) => ({
            id:       i,
            IDX:      s?.idx   ?? null,
            Manualid: s?.idm   ?? null,
            objeto:   s?.id    ?? null,
            cantidad: s?.count ?? 0,
            tipo:     'inventario'
        }));

        const chestData = this.STATE.quickSlots.map((s, i) => ({
            id:       i,
            IDX:      s?.idx   ?? null,
            Manualid: s?.idm   ?? null,
            objeto:   s?.id    ?? null,
            cantidad: s?.count ?? 0,
            tipo:     'cofre'
        }));

        this.moneda = Math.floor(this.moneda || this.monto_moneda);

        const payload = {
            posicionplayerx: this.posicionplayerx,
            posicionplayery: this.posicionplayery,
            vidaPorcentaje:  this.vidaPorcentaje,
            aguaPorcentaje:  this.aguaPorcentaje,
            comidaPorcentaje: this.comidaPorcentaje,
            lenguaje:        this.lenguaje,
            nivel:           this.nivel,
            nivel_exp:       this.nivel_exp,
            speed:           this.speed,
            mundo:           this.mundo,
            moneda:          this.moneda,
            moneda_plata:    this.moneda_plata,
            Username:        this.Username,
            misiones:        this.misiones,
            inventory:       inventoryData,
            chest:           chestData
        };

        // HABILIDADES: solo se mandan si de verdad se cargaron de /api/load.
        // Esta escena existe sobre todo para sincronizar el inventario con la
        // blockchain; no toca ni una sola habilidad, así que mandarlas sin
        // haberlas leído solo puede hacer daño (era exactamente lo que borraba
        // farming/mining/woodcutting en cada arranque y al volver de batalla).
        if (this._skillsCargadas) {
            payload.mineria           = this.mineria;
            payload.mineria_exp       = this.mineria_exp;
            payload.pesca             = this.pesca;
            payload.pesca_exp         = this.pesca_exp;
            payload.cocina            = this.cocina;
            payload.cocina_exp        = this.cocina_exp;
            payload.deforestacion     = this.deforestacion;
            payload.deforestacion_exp = this.deforestacion_exp;
            payload.fuerza            = this.fuerza;
            payload.fuerza_exp        = this.fuerza_exp;
            payload.agricultura       = this.agricultura;
            payload.agricultura_exp   = this.agricultura_exp;
        }

        console.log('📤 Payload para guardar:', {
            playerName:     this.playerName,
            moneda:         this.moneda,
            inventoryItems: inventoryData.filter(item => item.objeto).length,
            chestItems:     chestData.filter(item => item.objeto).length
        });

        try {
            const resp = await this.fetchWithTokenRetry(
                `${this.serverBase}/api/save/${encodeURIComponent(this.playerName)}`,
                { method: 'POST', body: JSON.stringify(payload) },
                2
            );

            console.log('📊 Status de guardado:', resp.status);

            if (!resp.ok) {
                const errorText = await resp.text().catch(() => 'No se pudo leer el error');
                console.error('❌ Error al guardar:', { status: resp.status, error: errorText });
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

    // =========================================================================
    //  MISIONES
    // =========================================================================

    async createDailyMission() {
        try {
            const response = await fetch(`${this.serverBase}/api/missions/daily/admin/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    npcId: 'granjero',
                    day:   '2025-12-22',
                    dailyResetHour: 0,
                    adminKey: '12345678',
                    missions: [
                        {
                            missionId:      'carrot_collector_001',
                            itemId:         'zanahoria_buena',
                            requiredAmount: 5,
                            expReward:      25,
                            rewardItemId:   'moneda',
                            rewardAmount:   15,
                            texts: {
                                'en-US':  { title: 'Carrot Collector',         description: 'Collect 5 good quality carrots from the farm', itemName: 'Carrot',    rewardName: 'Coins'   },
                                'es-419': { title: 'Recolector de Zanahorias', description: 'Recoge 5 zanahorias de buena calidad de la granja',  itemName: 'Zanahoria', rewardName: 'Monedas' }
                            }
                        }
                    ]
                })
            });

            const result = await response.json();
            console.log('Misiones creadas:', result);

            if (result.success) {
                alert(`¡Éxito! ${result.createdCount} misiones creadas para hoy.`);
            } else {
                alert('Error: ' + result.error);
            }
        } catch (err) {
            console.error('Error creando misiones:', err);
            alert('Error al crear misiones: ' + err.message);
        }
    }

    // =========================================================================
    //  CICLO DE VIDA PHASER
    // =========================================================================

    preload() {
        // Assets de precarga si son necesarios
    }

    async create() {
        console.log('🚀 Iniciando LoadingScenegame...');

        const isAuthenticated = await this.loadx();

        if (!isAuthenticated) {
            console.error('❌ No se pudo autenticar al usuario');
            return;
        }

        if (!this.playerName) {
            console.error('❌ No player name available');
            this.showTokenErrorHub();
            return;
        }

        console.log('🎮 Player name disponible:', this.playerName);

        // ── 0. ESPERAR A LAS TRANSACCIONES EN VUELO ─────────────────────────
        // Si el jugador acaba de comprar algo en la tienda y salió corriendo,
        // esa transacción sigue viva en el contador global (tx-gate.js) aunque
        // la escena de la tienda ya se haya destruido. Cargar los datos del
        // jugador AHORA leería un inventario que todavía no incluye la compra,
        // y todo lo que viene después (sync con blockchain, guardado) partiría
        // de datos viejos. Así que primero se espera a que no quede nada.
        this.loadingSystem.show({ message: 'Loading player data...', initialProgress: 0 });
        await this._esperarTransaccionesPendientes();

        // ── 1. Cargar datos del jugador desde la BD ─────────────────────────
        this.loadingSystem.update(0.2);
        this.loadingSystem.textElement.textContent = 'Loading player data...';

        await this.loadPlayerData();

        // ── 2. Sincronizar inventario contra blockchain ──────────────────────
        //      RECONCILIACIÓN (no destructiva): la sync deja intactos los ítems
        //      cuyo (idx, manualId, cantidad) coincide con la blockchain, corrige
        //      las cantidades que difieran y ELIMINA de la BD lo que no exista
        //      on-chain. No se borra la siembra ni se vacía el cache.
        this.loadingSystem.update(0.45);
        this.loadingSystem.textElement.textContent = 'Syncing with blockchain...';

        // ── 3. Sincronizar stats vitales PRIMERO (antes del inventario)
        // Así oro/plata quedan en 0 antes de que el save del inventario los guarde.
        this.loadingSystem.update(0.65);
        this.loadingSystem.textElement.textContent = 'Syncing player stats...';
        await this.syncStatsWithBlockchain();

        // ── Luego sincronizar inventario con blockchain ──
        await this.syncInventoryWithBlockchain();

        // ── 4. Barra de progreso final ───────────────────────────────────────
        await this.loadResources();

        // ── 4. Fondo animado ─────────────────────────────────────────────────
        this.stars    = [];
        this.graphics = this.add.graphics();

        this.createStarLayer(15, 1, 50,  80);
        this.createStarLayer(20, 2, 100, 150);
        this.createStarLayer(15, 3, 150, 250);

        // ── 5. Iniciar ciclo de transición ───────────────────────────────────
        this.intervalId = setInterval(() => this.checkTransition(), 2000);

        this.setupActivityTracking();
    }

    /**
     * Espera a que terminen las transacciones on-chain que quedaron en vuelo
     * al cambiar de escena (compras de la tienda, tala, crafteo, siembra…).
     *
     * El contador vive en `window.GFTxGate` (tx-gate.js), fuera de las escenas,
     * precisamente porque la escena que lanzó la transacción ya no existe.
     *
     * NUNCA deja al jugador atrapado: si pasan 90 segundos se sigue igualmente
     * y se avisa por consola. Es preferible entrar al juego con una
     * transacción rezagada que quedarse en una pantalla de carga eterna.
     */
    async _esperarTransaccionesPendientes() {
        const gate = window.GFTxGate;
        if (!gate || typeof gate.whenIdle !== 'function') return;
        if (gate.pending() === 0) return;

        console.log(`⏳ ${gate.pending()} transacción(es) en vuelo — esperando antes de cargar`);

        const texto = this.loadingSystem && this.loadingSystem.textElement;
        const resultado = await gate.whenIdle({
            timeout: 90000,
            onTick: (n, etiquetas) => {
                if (!texto) return;
                texto.textContent = n === 1
                    ? `Finishing 1 pending transaction… (${etiquetas[0] || ''})`
                    : `Finishing ${n} pending transactions…`;
            }
        });

        if (texto) texto.textContent = 'Loading player data...';
        if (!resultado.idle) {
            console.warn('⚠️ Se entró al juego con transacciones aún pendientes:', gate.labels());
        } else {
            console.log(`✅ Transacciones terminadas en ${resultado.waitedMs} ms`);
        }
    }

    async loadResources() {
        const steps     = 10;
        const stepDelay = 200;

        for (let i = 0; i <= steps; i++) {
            await new Promise(resolve => setTimeout(resolve, stepDelay));

            const progress     = i / steps;
            const easedProgress = this.loadingSystem.easeOutCubic(progress);

            this.loadingSystem.update(0.5 + easedProgress * 0.5);

            if (progress < 0.4) {
                this.loadingSystem.textElement.textContent = 'Loading resources...';
            } else if (progress < 0.8) {
                this.loadingSystem.textElement.textContent = 'Processing data...';
            } else {
                this.loadingSystem.textElement.textContent = 'Finalizing...';
            }
        }

        this.loadingSystem.update(1);
        this.loadingSystem.textElement.textContent = 'Loaded successfully!';

        await new Promise(resolve => setTimeout(resolve, 700));
        this.loadingSystem.hide(600);
    }

    setupActivityTracking() {
        const updateActivityTime = () => { this.lastActivityTime = Date.now(); };

        window.addEventListener('mousemove',  updateActivityTime);
        window.addEventListener('keydown',    updateActivityTime);
        window.addEventListener('click',      updateActivityTime);
        window.addEventListener('touchstart', updateActivityTime);

        setInterval(() => {
            const inactiveTime = Date.now() - this.lastActivityTime;
            if (inactiveTime > 30 * 60 * 1000) {
                console.log('⏰ Usuario inactivo por más de 30 minutos');
            }
        }, 5 * 60 * 1000);
    }

    // =========================================================================
    //  FONDO ANIMADO (ESTRELLAS)
    // =========================================================================

    createStarLayer(count, size, minSpeed, maxSpeed) {
        for (let i = 0; i < count; i++) {
            const star = {
                x:             Phaser.Math.Between(0, this.game.config.width),
                y:             Phaser.Math.Between(0, this.game.config.height),
                speed:         Phaser.Math.Between(minSpeed, maxSpeed),
                size,
                brightness:    Phaser.Math.Between(180, 255),
                rotation:      Phaser.Math.Between(0, 360) * (Math.PI / 180),
                rotationSpeed: Phaser.Math.FloatBetween(-2, 2),
                alpha:         Phaser.Math.FloatBetween(0.7, 1.0),
                trailLength:   size * 0.5,
                originalY:     0
            };
            star.originalY = star.y;
            this.stars.push(star);
        }
    }

    update(time, delta) {
        if (!this.graphics) return;

        const deltaTime = delta / 1000;
        this.graphics.clear();

        this.stars.forEach(star => {
            const previousY = star.y;

            star.y        += star.speed * deltaTime;
            star.rotation += star.rotationSpeed * deltaTime;

            if (star.size >= 2 && star.trailLength > 0) {
                this.graphics.fillStyle(0xffffff, star.alpha * 0.3);
                this.graphics.fillRect(
                    star.x - star.size / 2,
                    previousY - star.size / 2,
                    star.size,
                    (star.y - previousY) + star.size
                );
            }

            if (star.y > this.game.config.height + 10) {
                star.y        = -10;
                star.x        = Phaser.Math.Between(0, this.game.config.width);
                star.originalY = star.y;
                star.alpha    = Phaser.Math.FloatBetween(0.7, 1.0);
                star.brightness = Phaser.Math.Between(180, 255);
            }

            this.drawStar(star.x, star.y, star.size, star.brightness, star.rotation, star.alpha);
        });
    }

    drawStar(x, y, size, brightness, rotation, alpha) {
        const points      = 5;
        const outerRadius = size * 2;
        const innerRadius = size * 0.6;

        const color = Phaser.Display.Color.GetColor(brightness, brightness, brightness);
        this.graphics.fillStyle(color, alpha);
        this.graphics.beginPath();

        for (let i = 0; i < points * 2; i++) {
            const angle  = rotation + (i * Math.PI) / points;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const px     = x + Math.cos(angle) * radius;
            const py     = y + Math.sin(angle) * radius;

            if (i === 0) {
                this.graphics.moveTo(px, py);
            } else {
                this.graphics.lineTo(px, py);
            }
        }

        this.graphics.closePath();
        this.graphics.fillPath();

        if (size >= 2) {
            this.graphics.fillStyle(0xffffff, alpha * 0.8);
            this.graphics.fillCircle(x, y, size * 0.3);
        }
    }

    // =========================================================================
    //  TRANSICIÓN Y DESTRUCCIÓN
    // =========================================================================

    checkTransition() {
        console.log('🌍 Mundo actual:', this.mundo);

        const errorHub = document.getElementById('token-error-hub');
        if (errorHub) {
            console.log('🔒 Hub de error activo - bloqueando transición');
            clearInterval(this.intervalId);
            return;
        }

        if (!this.isAuthenticated || !this.playerName) {
            console.log('🔒 No autenticado - bloqueando transición');
            clearInterval(this.intervalId);
            return;
        }

        if (this.mundo === 1 || this.mundo === 2) {
            const nextScene = this.mundo === 1 ? 'GameScene' : 'tiendajuego';
            console.log(`🚀 Transicionando a: ${nextScene}`);

            if (window.perf && typeof window.perf.init === 'function' && !this.sys.settings.__perfInitialized) {
                window.perf.init(this, { debug: false });
                this.sys.settings.__perfInitialized = true;
            }

            this.scene.start(nextScene);
            clearInterval(this.intervalId);
        }
    }

    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.stopAutoRefresh();

        // Limpiar relay client
        if (this.relayClient && typeof this.relayClient.cleanup === 'function') {
            this.relayClient.cleanup();
            this.relayClient = null;
        }

        if (this.graphics) {
            this.graphics.destroy();
            this.graphics = null;
        }

        this.stars = [];

        console.log('🧹 LoadingScenegame limpiado');
        super.destroy();
    }

    // =========================================================================
    //  ERROR HUB (SESIÓN EXPIRADA)
    // =========================================================================

    showTokenErrorHub() {
        console.log('🔒 Mostrando hub de error de token...');

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.stopAutoRefresh();
        this.scene.pause();

        const existingHub = document.getElementById('token-error-hub');
        if (existingHub) existingHub.remove();

        const errorHub = document.createElement('div');
        errorHub.id = 'token-error-hub';
        errorHub.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.95); display: flex; justify-content: center;
            align-items: center; z-index: 10000; font-family: Arial, sans-serif;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes errorPulse {
                0%   { box-shadow: 0 15px 40px rgba(255,77,77,0.4); }
                50%  { box-shadow: 0 20px 50px rgba(255,77,77,0.7); }
                100% { box-shadow: 0 15px 40px rgba(255,77,77,0.4); }
            }
        `;
        document.head.appendChild(style);

        const contentBox = document.createElement('div');
        contentBox.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 3px solid #ff4d4d; border-radius: 20px; padding: 50px 40px;
            max-width: 550px; width: 90%; text-align: center;
            box-shadow: 0 15px 40px rgba(255,77,77,0.4); animation: errorPulse 2s infinite;
        `;

        const icon    = document.createElement('div');
        icon.innerHTML = '🔒';
        icon.style.cssText = 'font-size: 60px; margin-bottom: 20px;';

        const title   = document.createElement('h2');
        title.textContent = '⚠️ SESSION EXPIRED';
        title.style.cssText = `
            color: #ff4d4d; margin-bottom: 25px; font-size: 32px;
            text-shadow: 0 3px 8px rgba(255,77,77,0.6);
            font-weight: bold; letter-spacing: 1px;
        `;

        const message = document.createElement('p');
        message.textContent = 'Your access token has expired or is invalid. For security reasons, you need to log in again to continue playing.';
        message.style.cssText = 'color: #ffffff; font-size: 18px; line-height: 1.6; margin-bottom: 35px; padding: 0 10px;';

        const subMessage = document.createElement('p');
        subMessage.textContent = 'All your game progress is saved and will be available after you log back in.';
        subMessage.style.cssText = 'color: #cccccc; font-size: 16px; line-height: 1.4; margin-bottom: 40px; font-style: italic;';

        const button  = document.createElement('button');
        button.textContent = 'RETURN TO LOGIN';
        button.style.cssText = `
            background: linear-gradient(to right, #ff416c, #ff4b2b);
            color: white; border: none; padding: 18px 50px; font-size: 20px;
            border-radius: 50px; cursor: pointer; transition: all 0.3s ease;
            font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase;
            box-shadow: 0 5px 20px rgba(255,65,108,0.5);
        `;

        button.onmouseover = () => {
            button.style.background  = 'linear-gradient(to right, #ff4b2b, #ff416c)';
            button.style.transform   = 'scale(1.08)';
            button.style.boxShadow   = '0 8px 25px rgba(255,65,108,0.7)';
        };
        button.onmouseout = () => {
            button.style.background  = 'linear-gradient(to right, #ff416c, #ff4b2b)';
            button.style.transform   = 'scale(1)';
            button.style.boxShadow   = '0 5px 20px rgba(255,65,108,0.5)';
        };

        button.onclick = async () => {
            try {
                await fetch(`${this.serverBase}/api/auth/logout`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                console.error('Error durante logout:', e);
            }
            // Login REAL. La ruta relativa anterior acababa en
            // game.grasslandforest.com/Grassland_Forest_Game/index.html, que no
            // es el login. Misma constante que usa el resto del código.
            window.location.href = window.GF_LOGIN_URL || 'https://app.grasslandforest.com/';
        };

        contentBox.appendChild(icon);
        contentBox.appendChild(title);
        contentBox.appendChild(message);
        contentBox.appendChild(subMessage);
        contentBox.appendChild(button);
        errorHub.appendChild(contentBox);
        document.body.appendChild(errorHub);

        console.log('✅ Hub de error de token mostrado');
    }
}


// =============================================================================
// TOKEN CSRF — la COOKIE es la fuente de verdad
// =============================================================================
// El backend usa double-submit: compara la cabecera X-CSRF-Token con la cookie
// `csrf-token`, y esa cookie se emite con httpOnly:false justamente para que
// el navegador la pueda leer.
//
// El problema que resuelve esto: el servidor REGENERA la cookie csrf en cada
// /api/auth/refresh (ver server2.js). Y hay tres sitios que refrescan por su
// cuenta — GameScene, tiendajuego y phaser-relay-library —, cada uno con su
// propia copia guardada del token. En cuanto uno refrescaba (por ejemplo la
// librería del relay al enviar una transacción de comer o beber), la cookie
// cambiaba y las copias de los otros dos quedaban obsoletas: a partir de ahí
// todos sus POST se iban en 403 `csrf_token_invalid`, en silencio.
//
// Eso es exactamente lo que se veía en el log del servidor justo después de una
// transacción del relay:
//     ❌ CSRF attempt ... Path: /api/stats/<addr>/update Method: POST
// y por eso el agua y la comida dejaban de guardarse.
//
// Leyendo SIEMPRE la cookie en el momento del envío, da igual cuántas veces
// rote el token ni quién lo rote.
window.getCsrfToken = function getCsrfToken(fallback) {
    try {
        const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
        if (m && m[1]) {
            const t = decodeURIComponent(m[1]);
            window.csrfToken = t;   // se mantiene al día para el resto del código
            return t;
        }
    } catch (_) {}
    return fallback || window.csrfToken || '';
};

// =============================================================================
// StatsSync — utilitaria para GameScene y tiendajuego
// Permite actualizar stats en el contrato con bajo costo (debounced 1.5s).
// Usa increase/decreaseInvoiceQuantity según la diferencia.
// =============================================================================
class StatsSync {
    /**
     * @param {Phaser.Scene} scene - Escena Phaser activa (GameScene o tiendajuego)
     */
    constructor(scene) {
        this.scene       = scene;
        this.serverBase  = window.serverBase || scene.serverBase || 'http://127.0.0.1:3001';
        this._pending    = {};   // stat → nuevo valor pendiente de enviar
        this._updating   = false;
        this._timer      = null;
    }

    /** Lee el valor actual de un stat desde window.playerStats */
    get(stat) {
        // La escala de las vitales es 0..100 (las barras pintan `${valor}%` sin
        // dividir). El 100000 de antes era el default viejo y, si se usaba,
        // mandaba al backend un valor imposible.
        const DEFAULTS = { vida: 100, agua: 100, comida: 100, oro: 0, plata: 0, exp: 0 };
        return (window.playerStats && window.playerStats[stat] !== undefined)
            ? window.playerStats[stat]
            : (DEFAULTS[stat] ?? 0);
    }

    /**
     * Establece el valor de un stat localmente y encola actualización al backend.
     * @param {string}  stat      - 'vida'|'agua'|'comida'|'oro'|'plata'|'exp'
     * @param {number}  value     - nuevo valor
     * @param {boolean} immediate - si true, envía sin esperar debounce
     */
    set(stat, value, immediate = false) {
        const VALID = ['vida', 'agua', 'comida', 'oro', 'plata', 'exp'];
        if (!VALID.includes(stat)) return;

        const VITALES = ['vida', 'agua', 'comida'];
        let rounded = Math.round(Math.max(0, value));
        // Las vitales son un porcentaje: nunca más de 100.
        if (VITALES.includes(stat)) rounded = Math.min(100, rounded);

        if (!window.playerStats) window.playerStats = { vida: 100, agua: 100, comida: 100, oro: 0, plata: 0, exp: 0, invoiceIds: {} };
        window.playerStats[stat] = rounded;
        this._pending[stat] = rounded;

        if (immediate) {
            this._flush();
        } else {
            clearTimeout(this._timer);
            this._timer = setTimeout(() => this._flush(), 1500);
        }
    }

    /** Envía todos los cambios pendientes al backend */
    async _flush() {
        if (this._updating) return;
        const toSend = { ...this._pending };
        if (!Object.keys(toSend).length) return;

        // Lock global por jugador para evitar doble-TX desde múltiples instancias
        const playerName = window.currentPlayer;
        if (!playerName) return;
        const lockKey = `statsFlush_${playerName}`;
        if (window[lockKey]) {
            // Ya hay un flush en curso — re-encolar y esperar
            Object.assign(this._pending, toSend);
            return;
        }
        window[lockKey] = true;
        this._updating = true;
        this._pending  = {};

        try {
            // La cookie csrf NO es httpOnly: se lee en el momento del envío.
            // El valor guardado en window.csrfToken queda obsoleto en cuanto
            // cualquier otra parte del cliente refresca la sesión.
            const csrfToken = window.getCsrfToken(
                (this.scene && this.scene.csrfToken) || ''
            );

            if (!csrfToken) {
                console.warn('⚠️ StatsSync: sin CSRF token, reintentando más tarde');
                Object.assign(this._pending, toSend);
                window[lockKey] = false;
                this._updating = false;
                return;
            }

            const res = await fetch(
                `${this.serverBase}/api/stats/${encodeURIComponent(playerName)}/update`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({ stats: toSend })
                }
            );

            if (res.ok) {
                const data = await res.json();
                if (data.stats && data.stats.invoiceIds && window.playerStats) {
                    window.playerStats.invoiceIds = { ...window.playerStats.invoiceIds, ...data.stats.invoiceIds };
                }
                // El backend responde con lo que quedó REALMENTE en la factura.
                // Si una TX falló, ese valor no es el que pedimos, y hay que
                // hacerle caso ya: antes la barra seguía mostrando el valor
                // pedido y el jugador solo descubría el verdadero al recargar
                // la página ("recargué 30 de agua y volvió a 12").
                if (data.errors && data.errors.length) {
                    console.warn('⚠️ El contrato rechazó parte del update:', data.errors);
                }
                this._adoptServerStats(data.stats);
                console.log('✅ Stats actualizados en contrato:', toSend);
                this._reintentos = 0;
            } else {
                // Re-encolar para reintentar
                Object.assign(this._pending, toSend);
                console.warn(`⚠️ Stats update falló (${res.status}), se reintentará`);
                this._programarReintento();
            }
        } catch (e) {
            Object.assign(this._pending, toSend);
            console.warn('⚠️ StatsSync error:', e.message || e);
            this._programarReintento();
        } finally {
            this._updating = false;
            if (window[lockKey]) window[lockKey] = false;
        }
    }

    /**
     * Reintenta un envío fallido por su cuenta, con espera creciente.
     *
     * Antes lo pendiente se re-encolaba y ahí se quedaba: no se volvía a
     * intentar hasta que el jugador hiciera OTRO cambio de stats. Si el nodo
     * estaba caído (o saltaba un 403), el agua, la comida, el oro o la exp de
     * ese momento no llegaban nunca a la cadena y se perdían al recargar.
     */
    _programarReintento() {
        if (!Object.keys(this._pending).length) return;
        this._reintentos = (this._reintentos || 0) + 1;
        if (this._reintentos > 6) {
            console.warn('⚠️ StatsSync: demasiados reintentos, se deja para el próximo cambio');
            this._reintentos = 0;
            return;
        }
        const espera = Math.min(2000 * Math.pow(2, this._reintentos - 1), 30000);
        console.log(`🔁 StatsSync: reintento ${this._reintentos} en ${espera}ms`);
        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => this._flush(), espera);
    }

    /**
     * Copia a la escena los valores canónicos que devolvió el backend.
     * Un stat con un cambio local más nuevo todavía en cola NO se pisa.
     */
    _adoptServerStats(serverStats) {
        if (!serverStats || !window.playerStats) return;
        const CAMPOS = {
            vida:   'vidaPorcentaje',
            agua:   'aguaPorcentaje',
            comida: 'comidaPorcentaje',
            oro:    'moneda',
            plata:  'moneda_plata',
            exp:    'nivel_exp',
        };
        let corregido = false;
        for (const [stat, prop] of Object.entries(CAMPOS)) {
            const valor = serverStats[stat];
            if (typeof valor !== 'number') continue;
            if (this._pending[stat] !== undefined) continue; // hay algo más nuevo en cola
            if (window.playerStats[stat] !== valor) corregido = true;
            window.playerStats[stat] = valor;
            if (this.scene) this.scene[prop] = valor;
            // Realinear el testigo de exp de la escena, si no volvería a
            // mandar el valor viejo en el siguiente tick.
            if (stat === 'exp' && this.scene && this.scene._lastExpSynced !== undefined) {
                this.scene._lastExpSynced = valor;
            }
        }
        if (corregido && this.scene && typeof this.scene._refreshBarrasUI === 'function') {
            this.scene._refreshBarrasUI();
        }
    }

    /** Fuerza la lectura de stats desde el backend (llama /api/stats/:playerName) */
    async forceRefresh() {
        const playerName = window.currentPlayer;
        if (!playerName) return;
        try {
            const res = await fetch(
                `${this.serverBase}/api/stats/${encodeURIComponent(playerName)}`,
                { method: 'GET', credentials: 'include' }
            );
            if (res.ok) {
                const data = await res.json();
                if (data.stats && window.playerStats) {
                    ['vida','agua','comida','oro','plata','exp'].forEach(s => {
                        if (data.stats[s] !== undefined) window.playerStats[s] = Number(data.stats[s]);
                    });
                    if (data.stats.invoiceIds) window.playerStats.invoiceIds = data.stats.invoiceIds;
                }
                console.log('🔄 Stats refrescados desde backend:', window.playerStats);
            }
        } catch (e) {
            console.warn('StatsSync.forceRefresh error:', e.message || e);
        }
    }

    /** Vacía inmediatamente el buffer pendiente — llamar antes de salir de escena */
    async _flushUpdates() {
        clearTimeout(this._timer);
        await this._flush();
    }
}

window.LoadingScenegame = LoadingScenegame;
window.StatsSync        = StatsSync;

