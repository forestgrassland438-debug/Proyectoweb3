
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


class TransactionSystem {
    constructor(scene) {
        this.scene = scene;
        this.serverclient = scene.serverclient;
        
        this.currentAccount = null;
        this.playerName = null;
        this.userNonce = null;
        this.accessToken = null;
        
        this.config = {
            rpcUrl: null,
            chainId: null,
            explorerUrl: null,
            networkName: null,
            relayerAddress: null
        };
        
        this.allowedContracts = {};
        this.contracts = {};
        
        this.isAuthenticated = false;
        this.blockchainStatus = 'unknown';
        this.socket = null;
        this.txHub = null;
        
        this.userData = null;
    }

    async initialize() {
        try {
            console.log('🔗 Inicializando TransactionSystem...');
            
            await this.loadServerConfig();
            await this.setupAuthentication();
            this.initializeTransactionHub();
            this.connectSocket();
            
            console.log('✅ TransactionSystem inicializado correctamente');
            return true;
            
        } catch (error) {
            console.error('❌ Error inicializando TransactionSystem:', error);
            return false;
        }
    }

    async loadServerConfig() {
        try {
            const baseUrl = this.serverclient.replace('/api', '');
            const resp = await fetch(`${baseUrl}/api/config`);
            
            if (!resp.ok) throw new Error('No se pudo cargar la configuración');
            
            const cfg = await resp.json();
            
            this.config = {
                rpcUrl: cfg.rpcUrl,
                chainId: cfg.chainId,
                explorerUrl: cfg.explorer,
                networkName: cfg.network,
                relayerAddress: cfg.relayer
            };
            
            this.allowedContracts = cfg.allowedContracts || {};
            this.blockchainStatus = cfg.relayer ? 'connected' : 'simulated';
            
            console.log('✅ Configuración cargada:', this.config);
            return cfg;
            
        } catch (error) {
            console.warn('⚠️ No se pudo cargar configuración del servidor:', error.message);
            this.config = {
                rpcUrl: "https://dream-rpc.somnia.network",
                chainId: 50312,
                explorerUrl: "https://shannon-explorer.somnia.network",
                networkName: "Somnia Testnet",
                relayerAddress: null
            };
            return this.config;
        }
    }

    async setupAuthentication() {
        const tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
        this.accessToken = tokens.accessToken || null;
        
        if (!this.accessToken) {
            console.log('🔐 Usuario no autenticado - Modo lectura');
            this.isAuthenticated = false;
            return;
        }

        try {
            await this.fetchUserData();
            this.isAuthenticated = true;
            console.log('✅ Usuario autenticado:', this.currentAccount);
        } catch (error) {
            console.error('❌ Error en autenticación:', error);
            this.isAuthenticated = false;
            sessionStorage.removeItem('authTokens');
        }
    }

    async fetchUserData() {
        if (!this.accessToken) {
            throw new Error('No hay token de acceso');
        }

        const baseUrl = this.serverclient.replace('/api', '');
        const resp = await fetch(`${baseUrl}/api/user/data`, {
            method: 'GET',
            headers: { 
                'Authorization': 'Bearer ' + this.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (!resp.ok) {
            if (resp.status === 401) {
                sessionStorage.removeItem('authTokens');
                throw new Error('Token inválido o expirado');
            }
            throw new Error('Error del servidor: ' + resp.status);
        }

        const userData = await resp.json();
        
        this.currentAccount = userData.address;
        this.playerName = userData.playerName;
        this.userNonce = userData.nonce ? userData.nonce.replace(/^0+/, '') || '0' : '0';
        this.userData = userData;

        console.log('📊 Datos de usuario cargados:', {
            address: this.currentAccount,
            playerName: this.playerName,
            nonce: this.userNonce
        });

        return userData;
    }

    getCurrentNonce() {
        return this.userNonce;
    }

    // CORRECCIÓN: Ahora el frontend NO incrementa el nonce antes de enviar
    // Envía el nonce actual y el backend lo incrementa después de la transacción
    updateNonceFromResponse(newNonce) {
        if (newNonce) {
            this.userNonce = newNonce.replace(/^0+/, '') || '0';
            console.log('🔄 Nonce actualizado desde servidor:', this.userNonce);
        }
    }

    async send(payload) {
        if (!this.isAuthenticated) {
            throw new Error('Usuario no autenticado');
        }

        if (!this.accessToken) {
            throw new Error('Token de acceso no disponible');
        }

        const validation = this.validatePayload(payload);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const transactionData = this.prepareTransaction(payload);
        
        if (this.txHub) {
            this.txHub.showPending('Enviando transacción...');
        }

        try {
            const result = await this.executeTransaction(transactionData);
            
            if (result.success && result.newNonce) {
                this.updateNonceFromResponse(result.newNonce);
            }

            this.handleTransactionResult(result, payload);
            
            return result;
            
        } catch (error) {
            this.handleTransactionError(error, payload);
            throw error;
        }
    }

    validatePayload(payload) {
        const { contract, function: functionName, _autoNonce = true, _userNonce } = payload;

        if (!contract || !this.allowedContracts[contract]) {
            return { valid: false, error: `Contrato no permitido: ${contract}` };
        }

        const contractInfo = this.allowedContracts[contract];
        // FIX: si el backend devuelve un contrato sin lista de funciones,
        // .includes sobre undefined lanzaba TypeError en vez de un error claro.
        if (!Array.isArray(contractInfo.functions) || !contractInfo.functions.includes(functionName)) {
            return { valid: false, error: `Función no permitida: ${functionName}` };
        }

        if (!_autoNonce && !_userNonce) {
            return { valid: false, error: 'Nonce requerido cuando _autoNonce es false' };
        }

        return { valid: true };
    }

    // CORRECCIÓN CRÍTICA: El frontend envía el nonce actual, no el incrementado
    prepareTransaction(payload) {
        const { contract, function: functionName, _autoNonce = true, _userNonce, ...parameters } = payload;

        let nonceToUse;
        if (_autoNonce) {
            // CORRECCIÓN: Usar el nonce actual, no calcular el siguiente
            nonceToUse = this.getCurrentNonce();
        } else {
            nonceToUse = _userNonce;
        }

        if (!nonceToUse) {
            throw new Error('No se pudo determinar el nonce para la transacción');
        }

        console.log(`🔢 Usando nonce: ${nonceToUse} (modo ${_autoNonce ? 'automático' : 'manual'})`);

        // CORRECCIÓN CRÍTICA: Estructurar correctamente los parámetros según lo que espera el backend
        const processedParameters = {};
        
        // Para logMessage, extraer el mensaje correctamente
        if (functionName === 'logMessage') {
            // Buscar el mensaje en diferentes posibles nombres de parámetro
            processedParameters.message = parameters._message || parameters.message || '';
            
            if (!processedParameters.message) {
                throw new Error('Parámetro "message" requerido para logMessage');
            }
        } else {
            // Para otras funciones, pasar todos los parámetros
            Object.assign(processedParameters, parameters);
        }

        return {
            contractAddress: contract,
            action: functionName,
            parameters: processedParameters, // CORRECCIÓN: Enviar parámetros estructurados correctamente
            playerName: this.playerName,
            userNonce: nonceToUse // CORRECCIÓN: Enviar nonce actual
        };
    }

    async executeTransaction(transactionData) {
        const baseUrl = this.serverclient.replace('/api', '');
        
        console.log('📤 Enviando transacción:', transactionData);
        
        const resp = await fetch(`${baseUrl}/api/transaction/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.accessToken
            },
            body: JSON.stringify(transactionData)
        });

        const responseText = await resp.text();
        console.log('📡 Respuesta del servidor:', responseText);

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            throw new Error('Respuesta inválida del servidor: ' + responseText);
        }

        if (!resp.ok) {
            throw new Error(result.error || result.message || `Error del servidor: ${resp.status}`);
        }

        return result;
    }

    handleTransactionResult(result, originalPayload) {
        if (result.success) {
            if (this.txHub) {
                if (result.simulated) {
                    this.txHub.showCompleted(null, 'Transacción simulada');
                } else {
                    this.txHub.showCompleted(result.txHash, 'Transacción confirmada');
                }
            }
            
            console.log('✅ Transacción exitosa:', {
                txHash: result.txHash,
                simulated: result.simulated,
                contract: originalPayload.contract,
                function: originalPayload.function
            });
            
        } else {
            throw new Error(result.error || 'Transacción falló en el servidor');
        }
    }

    handleTransactionError(error, originalPayload) {
        console.error('❌ Error en transacción:', error);
        
        if (this.txHub) {
            this.txHub.showError(error.message || 'Error desconocido');
        }
        
        this.fetchUserData().catch(e => 
            console.error('Error recargando datos de usuario:', e)
        );
    }

    // CORRECCIÓN: Función logMessage corregida - usar parámetros correctos
    async logMessage(message, options = {}) {
        // CORRECCIÓN: Usar el nonce actual directamente
        const currentNonce = this.getCurrentNonce();
        
        if (!currentNonce) {
            throw new Error('No se pudo obtener el nonce actual');
        }

        const payload = {
            contract: '0x52f269b242121ed0b80aed7d7a35f1db5b111c73',
            function: 'logMessage',
            message: message, // CORRECCIÓN: Usar "message" en lugar de "_message"
            _userNonce: currentNonce, // CORRECCIÓN: Enviar nonce actual
            _autoNonce: false // CORRECCIÓN: Desactivar auto nonce
        };

        return await this.send(payload);
    }

    async getMessage(messageId) {
        console.log('📖 Función de lectura getMessage:', messageId);
        return { messageId, content: "Función de lectura no implementada" };
    }

    initializeTransactionHub() {
        try {
            if (window.TransactionHub) {
                this.txHub = new TransactionHub({
                    debug: true,
                    visibleDuration: 10000
                });
                this.txHub.initialize();
                console.log('✅ TransactionHub inicializado');
            } else {
                console.warn('⚠️ TransactionHub no disponible, usando fallback');
                this.createFallbackNotificationSystem();
            }
        } catch (error) {
            console.error('❌ Error inicializando TransactionHub:', error);
            this.createFallbackNotificationSystem();
        }
    }

    createFallbackNotificationSystem() {
        this.txHub = {
            showPending: (msg) => {
                console.log('📝 Pending:', msg);
                this.scene.showToast('⏳ ' + msg);
            },
            showCompleted: (txHash, msg) => {
                console.log('✅ Completed:', txHash, msg);
                this.scene.showToast('✅ ' + (msg || 'Transacción completada'));
            },
            showError: (msg) => {
                console.log('❌ Error:', msg);
                this.scene.showToast('❌ ' + msg);
            },
            hideNotification: () => {
                console.log('🗑️ Notification hidden');
            }
        };
    }

    connectSocket() {
        try {
            // FIX: si el CDN de socket.io no cargó, window.io no existe.
            // Antes lanzaba TypeError genérico; ahora avisa y sigue sin socket
            // (el juego funciona igual, solo sin notificaciones en tiempo real).
            if (typeof window.io !== 'function') {
                console.warn('⚠️ socket.io no está disponible (CDN no cargó) — se continúa sin socket');
                return;
            }

            if (this.socket && this.socket.connected) {
                this.socket.disconnect();
            }

            const socketUrl = this.serverclient.replace('/api', '');
            this.socket = window.io(socketUrl, {
                transports: ['websocket', 'polling']
            });

            this.setupSocketListeners();
            
        } catch (error) {
            console.error('💥 Error conectando socket:', error);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Socket conectado:', this.socket.id);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('📡 Socket desconectado:', reason);
        });

        this.socket.on('tx_pending', (data) => {
            console.log('📡 Socket: tx_pending', data);
            if (this.txHub) {
                this.txHub.showPending('Transacción pendiente...');
            }
        });

        this.socket.on('tx_confirmed', (data) => {
            console.log('📡 Socket: tx_confirmed', data);
            if (this.txHub) {
                this.txHub.showCompleted(data.txHash, 'Transacción confirmada en blockchain');
            }
        });

        this.socket.on('tx_simulated', (data) => {
            console.log('📡 Socket: tx_simulated', data);
            if (this.txHub) {
                this.txHub.showCompleted(null, 'Transacción simulada');
            }
        });

        this.socket.on('tx_failed', (data) => {
            console.error('📡 Socket: tx_failed', data);
            if (this.txHub) {
                this.txHub.showError(data.error || 'La transacción falló');
            }
        });
    }

    getExplorerUrl(txHash) {
        return `${this.config.explorerUrl}/tx/${txHash}`;
    }

    getContractUrl(contractAddress) {
        return `${this.config.explorerUrl}/address/${contractAddress}`;
    }

    getStatus() {
        return {
            authenticated: this.isAuthenticated,
            blockchainStatus: this.blockchainStatus,
            network: this.config.networkName,
            currentAccount: this.currentAccount,
            playerName: this.playerName,
            currentNonce: this.userNonce,
            relayer: this.config.relayerAddress
        };
    }

    destroy() {
        try {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            
            if (this.txHub && this.txHub.destroy) {
                this.txHub.destroy();
                this.txHub = null;
            }
            
            console.log('♻️ TransactionSystem destruido');
        } catch (error) {
            console.error('❌ Error destruyendo TransactionSystem:', error);
        }
    }
}
