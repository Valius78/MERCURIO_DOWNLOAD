/**
 * DATA MANAGER - Gestione dati e cache
 * Centralizza il loading e caching dei dati
 */

class DataManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.currentData = null;
        this.currentParameterId = null;
        this.currentChannelId = null;
        this.currentContext = null;
        this.currentUnit = null;
        
        // Cache per evitare chiamate duplicate
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minuti
    }
    
    /**
     * Ottiene chiave cache per i parametri
     */
    getCacheKey(type, id, period) {
        return `${type}_${id}_${period}`;
    }
    
    /**
     * Verifica se dati in cache sono ancora validi
     */
    isCacheValid(cacheEntry) {
        return cacheEntry && (Date.now() - cacheEntry.timestamp) < this.cacheTimeout;
    }
    
    /**
     * Carica dati parametro con cache
     */
    async loadParameterData(parameterId, period = '7d', useCache = true) {
        const cacheKey = this.getCacheKey('parameter', parameterId, period);
        
        // Controlla cache
        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (this.isCacheValid(cached)) {
                console.log(`📋 Dati parametro ${parameterId} caricati da cache`);
                this.setCurrentData(cached.data, parameterId, null);
                return cached.data;
            }
        }
        
        try {
            console.log(`🌐 Caricamento dati parametro ${parameterId} dal server...`);
            const data = await this.apiClient.loadParameterData(parameterId, period);
            
            // Salva in cache
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            this.setCurrentData(data, parameterId, null);
            
            // Salva unità di misura
            if (data.parameter_info && data.parameter_info.unit) {
                this.currentUnit = data.parameter_info.unit;
            }
            
            return data;
            
        } catch (error) {
            console.error(`❌ Errore caricamento parametro ${parameterId}:`, error);
            throw error;
        }
    }
    
    /**
     * Carica dati canale con cache
     */
    async loadChannelData(channelId, period = '7d', useCache = true) {
        const cacheKey = this.getCacheKey('channel', channelId, period);
        
        // Controlla cache
        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (this.isCacheValid(cached)) {
                console.log(`📋 Dati canale ${channelId} caricati da cache`);
                this.setCurrentData(cached.data, null, channelId);
                return cached.data;
            }
        }
        
        try {
            console.log(`🌐 Caricamento dati canale ${channelId} dal server...`);
            const data = await this.apiClient.loadChannelData(channelId, period);
            
            // Salva in cache
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            this.setCurrentData(data, null, channelId);
            return data;
            
        } catch (error) {
            console.error(`❌ Errore caricamento canale ${channelId}:`, error);
            throw error;
        }
    }
    
    /**
     * Imposta dati correnti
     */
    setCurrentData(data, parameterId, channelId) {
        this.currentData = data;
        this.currentParameterId = parameterId;
        this.currentChannelId = channelId;
        
        if (parameterId) {
            this.currentContext = 'parameter';
        } else if (channelId) {
            this.currentContext = 'channel';
        }
    }
    
    /**
     * Pulisce dati correnti
     */
    clearCurrentData() {
        this.currentData = null;
        this.currentParameterId = null;
        this.currentChannelId = null;
        this.currentContext = null;
        this.currentUnit = null;
    }
    
    /**
     * Determina tipo contenuto dei dati
     */
    determineContentType(data = null) {
        const dataToAnalyze = data || this.currentData;
        
        if (!dataToAnalyze || !dataToAnalyze.readings) {
            return 'numeric';
        }
        
        return FileUtils.analyzeReadingsContentType(dataToAnalyze.readings);
    }
    
    /**
     * Ottiene statistiche dai dati
     */
    getStats(data = null) {
        const dataToAnalyze = data || this.currentData;
        return dataToAnalyze ? dataToAnalyze.stats : null;
    }
    
    /**
     * Invalida cache per un tipo specifico
     */
    invalidateCache(type, id = null) {
        if (id) {
            // Invalida cache specifica
            for (const key of this.cache.keys()) {
                if (key.startsWith(`${type}_${id}`)) {
                    this.cache.delete(key);
                }
            }
        } else {
            // Invalida tutto il cache del tipo
            for (const key of this.cache.keys()) {
                if (key.startsWith(`${type}_`)) {
                    this.cache.delete(key);
                }
            }
        }
    }
    
    /**
     * Pulisce cache scaduta
     */
    cleanExpiredCache() {
        for (const [key, entry] of this.cache.entries()) {
            if (!this.isCacheValid(entry)) {
                this.cache.delete(key);
            }
        }
    }
    
    /**
     * NUOVO: Cancella tutta la cache (per invalidazione forzata)
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 Cache completamente svuotata');
    }
    
    /**
     * Ottiene info debug cache
     */
    getCacheInfo() {
        this.cleanExpiredCache();
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Export globale
window.DataManager = DataManager;