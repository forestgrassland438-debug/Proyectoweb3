
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


/**
 * BlockchainManager - Librería universal simplificada para interactuar con contratos blockchain
 * @version 2.0.0
 * @description Maneja automáticamente redes, contratos, nonces y transacciones
 */

class BlockchainManager {
    constructor(scene) {
        this.scene = scene;
        this._destroyed = false;
        this._requests = new Set();
        this._authRevision = 0;
        this.currentNetwork = 'litvm';
        this.contracts = new Map();
        this.currentAccount = null;
        this.userNonce = null;
        this.isAuthenticated = false;
        this.playerName = null;
        const events = scene?.events;
        if (events?.once) {
            this._sceneExit = () => this.destroy();
            events.once('shutdown', this._sceneExit); events.once('destroy', this._sceneExit);
        }
        
        console.log('🔄 BlockchainManager inicializado');
    }

    async _request(url, options = {}, format = 'json', timeoutMs = 15000) {
        if (this._destroyed) throw new Error('BlockchainManager cerrado');
        const controller = new AbortController();
        this._requests.add(controller);
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            const data = await response[format]();
            if (this._destroyed || controller.signal.aborted) throw new Error('Solicitud cancelada');
            return { response, data };
        } finally {
            clearTimeout(timer); this._requests.delete(controller);
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._authRevision++;
        for (const request of this._requests) request.abort();
        this._requests.clear();
        this.scene?.events?.off('shutdown', this._sceneExit);
        this.scene?.events?.off('destroy', this._sceneExit);
        this._sceneExit = null;
        this.contracts.clear(); this.scene = null;
        this.currentAccount = this.userNonce = this.playerName = null;
        this.isAuthenticated = false;
    }

    // ==================== CONFIGURACIÓN AUTOMÁTICA ====================

    /**
     * Configuración automática desde el backend
     */
    async autoConfig() {
        try {
            const baseUrl = this._baseUrl();
            const { response, data: config } = await this._request(`${baseUrl}/api/config`);
            
            if (response.ok) {
                
                // Configurar contrato principal automáticamente
                this.registerContract('SimpleMessageLogger', {
                    address: config.onchainContractAddress,
                    name: 'SimpleMessageLogger',
                    functions: {
                        logMessage: {
                            parameters: {
                                message: { type: 'string', required: true, maxLength: 200, transform: 'slice' }
                            }
                        }
                    }
                });

                console.log('✅ Configuración automática cargada');
                return true;
            }
        } catch (error) {
            if (this._destroyed) return false;
            console.warn('⚠️ No se pudo cargar configuración automática:', error);
            
            // Configuración por defecto
            this.registerContract('SimpleMessageLogger', {
                address: '0x52f269B242121ED0B80aed7d7A35f1db5B111C73',
                name: 'SimpleMessageLogger',
                functions: {
                    logMessage: {
                        parameters: {
                            message: { type: 'string', required: true, maxLength: 200, transform: 'slice' }
                        }
                    }
                }
            });
        }
        return false;
    }

    /**
     * Origen del backend SIN el sufijo /api.
     *
     * FIX: antes era `serverclient.replace('/api', '')`, que quita la PRIMERA
     * aparición de "/api". En producción serverclient vale
     * 'https://api.grasslandforest.com/api' y la primera es la del dominio
     * ("//api.grass…"), así que salía 'https:/.grasslandforest.com/api'.
     */
    _baseUrl() {
        const s = String((this.scene && (this.scene.serverclient || this.scene.serverBase)) || '');
        return s.replace(/\/api\/?$/, '');
    }

    // ==================== GESTIÓN DE CONTRATOS ====================

    /**
     * Registrar contrato de forma simplificada
     */
    registerContract(contractId, contractConfig) {
        if (!contractConfig || typeof contractConfig.address !== 'string' || !/^0x[\da-f]{40}$/i.test(contractConfig.address)) {
            throw new Error(`registerContract: falta la dirección del contrato para "${contractId}"`);
        }

        // El spread va PRIMERO: si fuera al final, contractConfig.address
        // (con mayúsculas) pisaría la versión normalizada en minúsculas.
        const contract = {
            ...contractConfig,
            address: contractConfig.address.toLowerCase(),
            name: contractConfig.name || contractId,
            functions: contractConfig.functions || {}
        };

        this.contracts.set(contractId, contract);
        console.log(`📄 Contrato registrado: ${contractId}`);
        
        return this;
    }

    /**
     * Ejecutar función de contrato - MÉTODO PRINCIPAL
     */
    async execute(contractId, functionName, parameters = {}) {
        // Validaciones esenciales
        if (!this.isAuthenticated) {
            throw new Error('Usuario no autenticado. Inicia sesión primero.');
        }

        const contract = this.contracts.get(contractId);
        if (!contract) {
            throw new Error(`Contrato no registrado: ${contractId}`);
        }

        if (!Object.prototype.hasOwnProperty.call(contract.functions, functionName)) {
            throw new Error(`Función no disponible: ${functionName}`);
        }

        // Preparar y validar parámetros
        const preparedParams = this.prepareParameters(contract.functions[functionName], parameters);
        this.validateParameters(contract.functions[functionName], preparedParams);

        // Incrementar nonce localmente
        const userNonce = this.incrementLocalNonce();
        if (!userNonce) {
            throw new Error('Error con el nonce del usuario');
        }

        // Crear payload automáticamente
        const payload = {
            contractAddress: contract.address,
            action: functionName,
            parameters: preparedParams,
            playerName: this.playerName,
            userNonce: userNonce
        };

        console.log(`🔄 Ejecutando: ${contractId}.${functionName}`, payload);

        // Enviar transacción
        return await this.sendTransaction(payload, contract);
    }

    // ==================== MANEJO DE USUARIO ====================

    /**
     * Configurar usuario de forma simplificada
     */
    setUser(authData) {
        if (this._destroyed) return this;
        this._authRevision++;
        this.currentAccount = authData.address;
        this.userNonce = authData.nonce;
        this.playerName = authData.playerName;
        this.isAuthenticated = true;
        
        console.log(`🔐 Usuario configurado: ${this.playerName}`);
        return this;
    }

    /**
     * Actualizar nonce automáticamente
     */
    updateNonce(newNonce) {
        if (this._destroyed) return this;
        this.userNonce = newNonce;
        return this;
    }

    // ==================== VALIDACIÓN Y PREPARACIÓN ====================

    prepareParameters(functionDef, parameters) {
        const prepared = {};
        
        for (const [key, paramDef] of Object.entries(functionDef.parameters)) {
            const value = parameters[key];
            
            if (paramDef.required && value === undefined) {
                throw new Error(`Parámetro requerido: ${key}`);
            }

            if (value === undefined) {
                continue;
            }

            // Aplicar transformaciones
            prepared[key] = this.applyTransform(value, paramDef.transform);
        }

        return prepared;
    }

    validateParameters(functionDef, parameters) {
        for (const [key, paramDef] of Object.entries(functionDef.parameters)) {
            const value = parameters[key];
            
            if (value === undefined) {
                if (paramDef.required) {
                    throw new Error(`Parámetro requerido faltante: ${key}`);
                }
                continue;
            }

            // Validar longitud máxima
            if (paramDef.maxLength && String(value).length > paramDef.maxLength) {
                throw new Error(`${key} excede longitud máxima: ${paramDef.maxLength}`);
            }
        }
    }

    applyTransform(value, transform) {
        switch (transform) {
            case 'slice': return String(value).slice(0, 200);
            case 'toLowerCase': return String(value).toLowerCase();
            case 'trim': return String(value).trim();
            default: return value;
        }
    }

    // ==================== GESTIÓN DE TRANSACCIONES ====================

    async sendTransaction(payload, contract) {
        if (this._destroyed) throw new Error('BlockchainManager cerrado');
        const revision = this._authRevision;
        const tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
        const accessToken = tokens.accessToken;

        if (!accessToken) {
            throw new Error('Token de acceso no disponible');
        }

        // Mostrar en UI de transacciones
        if (typeof window.showTxHubItem === 'function') {
            window.showTxHubItem(null, 'sent', 
                `📤 ${contract.name}.${payload.action} (nonce: ${payload.userNonce})`);
        }

        try {
            const baseUrl = this._baseUrl();
            const { response, data: responseText } = await this._request(`${baseUrl}/api/transaction/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                },
                body: JSON.stringify(payload)
            }, 'text', 900000);
            let result;
            
            try {
                result = JSON.parse(responseText);
            } catch {
                throw new Error('Respuesta inválida del servidor');
            }

            if (!response.ok) {
                throw new Error(result.error || 'Error del servidor');
            }

            // Actualizar nonce desde backend
            if (revision === this._authRevision && JSON.parse(sessionStorage.getItem('authTokens') || '{}').accessToken === accessToken && result.newNonce !== undefined && result.newNonce !== null) {
                this.updateNonce(result.newNonce);
            }

            return result;

        } catch (error) {
            // Solo revertir la reserva de ESTA petición. No alterar un nonce
            // más reciente de una transacción concurrente ni revertir dos veces.
            if (!this._destroyed && revision === this._authRevision && this.userNonce === payload.userNonce) this.revertNonce();
            throw error;
        }
    }

    // ==================== MANEJO DE NONCE ====================

    incrementLocalNonce() {
        if (!this.userNonce) return null;
        
        try {
            const currentNonce = BigInt('0x' + this.userNonce);
            const newNonce = (currentNonce + 1n).toString(16);
            this.userNonce = newNonce.replace(/^0+/, '') || '0';
            return this.userNonce;
        } catch (error) {
            console.error('Error incrementando nonce:', error);
            return null;
        }
    }

    revertNonce() {
        if (!this.userNonce) return;

        try {
            const currentNonce = BigInt('0x' + this.userNonce);
            // Nunca bajar de 0: un nonce negativo ("-1" en hex) haría que el
            // siguiente BigInt('0x-1') lanzara y dejara el nonce corrupto.
            if (currentNonce <= 0n) {
                this.userNonce = '0';
                return;
            }
            const revertedNonce = (currentNonce - 1n).toString(16);
            this.userNonce = revertedNonce.replace(/^0+/, '') || '0';
        } catch (error) {
            console.error('Error revirtiendo nonce:', error);
        }
    }

    // ==================== MÉTODOS DE UTILIDAD ====================

    /**
     * Verificar estado del sistema
     */
    async checkStatus() {
        try {
            const baseUrl = this._baseUrl();
            const { response, data } = await this._request(`${baseUrl}/api/health`);
            
            if (response.ok) {
                return data;
            }
        } catch (error) {
            console.error('Error verificando estado:', error);
        }
        return { status: 'error' };
    }

    /**
     * Obtener información del usuario
     */
    async fetchUserData() {
        const revision = this._authRevision;
        try {
            const tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
            const accessToken = tokens.accessToken;
            
            if (!accessToken) return null;

            const baseUrl = this._baseUrl();
            const { response, data: userData } = await this._request(`${baseUrl}/api/user/data`, {
                headers: {
                    'Authorization': 'Bearer ' + accessToken
                }
            });

            if (response.ok) {
                if (revision !== this._authRevision || JSON.parse(sessionStorage.getItem('authTokens') || '{}').accessToken !== accessToken) return null;
                this.setUser(userData);
                return userData;
            }
        } catch (error) {
            console.error('Error obteniendo datos usuario:', error);
        }
        return null;
    }

    /**
     * Enviar mensaje rápido (método de conveniencia)
     */
    async sendMessage(message, contractId = 'SimpleMessageLogger') {
        return await this.execute(contractId, 'logMessage', { message });
    }

    /**
     * Información de debug
     */
    getDebugInfo() {
        return {
            authenticated: this.isAuthenticated,
            account: this.currentAccount,
            playerName: this.playerName,
            nonce: this.userNonce,
            contracts: Array.from(this.contracts.keys())
        };
    }
}

// Exportar para uso global
window.BlockchainManager = BlockchainManager;
