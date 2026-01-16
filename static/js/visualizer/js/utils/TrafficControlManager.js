/**
 * TRAFFIC CONTROL MANAGER - Gestione Centralizzata Traffico
 * Coordina tutti gli aggiornamenti del traffico per evitare chiamate multiple
 * e conteggi duplicati
 */

class TrafficControlManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        
        // Stato interno
        this.trafficIndicator = null;
        this.isUpdating = false;
        this.updateQueue = [];
        this.lastUpdateTime = 0;
        
        // Configurazione debouncing
        this.DEBOUNCE_DELAY = 1500; // 1.5 secondi tra aggiornamenti
        this.UPDATE_TIMEOUT = 5000; // Timeout massimo per evitare blocchi
        
        // Tracking download in corso per deduplicazione
        this.activeDownloads = new Set();
        this.downloadHistory = new Map(); // download_id -> timestamp
        
        console.log('📊 TrafficControlManager inizializzato');
    }
    
    /**
     * Inizializza il manager e collega il traffic indicator
     */
    initialize(trafficIndicator) {
        this.trafficIndicator = trafficIndicator;
        
        // Cleanup download history ogni 30 secondi
        this.historyCleanupInterval = setInterval(() => {
            this.cleanupDownloadHistory();
        }, 30000);
        
        console.log('✅ TrafficControlManager collegato al TrafficIndicator');
    }
    
    /**
     * Registra un download in corso per evitare duplicati
     * @param {string} downloadId - ID univoco del download
     * @param {Object} downloadInfo - Informazioni sul download
     */
    registerDownload(downloadId, downloadInfo = {}) {
        const timestamp = Date.now();
        
        // Controlla se questo download è già in corso (deduplicazione)
        if (this.activeDownloads.has(downloadId)) {
            console.warn(`⚠️ Download duplicato rilevato: ${downloadId}`);
            return false; // Blocca il download duplicato
        }
        
        // Controlla se è stato fatto recentemente (deduplicazione temporale)
        if (this.downloadHistory.has(downloadId)) {
            const lastDownload = this.downloadHistory.get(downloadId);
            const timeDiff = timestamp - lastDownload;
            
            if (timeDiff < 5000) { // 5 secondi
                console.warn(`⚠️ Download troppo recente: ${downloadId} (${timeDiff}ms fa)`);
                return false;
            }
        }
        
        // Registra download
        this.activeDownloads.add(downloadId);
        this.downloadHistory.set(downloadId, timestamp);
        
        console.log(`📤 Download registrato: ${downloadId}`, downloadInfo);
        return true;
    }
    
    /**
     * Conclude un download e schedula aggiornamento traffico
     * @param {string} downloadId - ID del download completato
     * @param {Object} result - Risultato del download (successo, dimensione, etc.)
     */
    completeDownload(downloadId, result = {}) {
        // Rimuovi da downloads attivi
        this.activeDownloads.delete(downloadId);
        
        console.log(`✅ Download completato: ${downloadId}`, result);
        
        // Schedula aggiornamento traffico con debouncing
        this.scheduleTrafficUpdate('download_complete', {
            downloadId,
            ...result
        });
    }
    
    /**
     * Schedula aggiornamento del traffico con debouncing intelligente
     * @param {string} reason - Motivo dell'aggiornamento
     * @param {Object} context - Contesto aggiuntivo
     */
    scheduleTrafficUpdate(reason = 'manual', context = {}) {
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        
        // Aggiorna subito se è passato abbastanza tempo
        if (timeSinceLastUpdate >= this.DEBOUNCE_DELAY && !this.isUpdating) {
            this.executeTrafficUpdate(reason, context);
            return;
        }
        
        // Altrimenti, schedula per dopo
        const updateRequest = { reason, context, timestamp: now };
        this.updateQueue.push(updateRequest);
        
        console.log(`🕐 Aggiornamento traffico schedulato: ${reason} (ritardo: ${this.DEBOUNCE_DELAY - timeSinceLastUpdate}ms)`);
        
        // Schedula esecuzione
        setTimeout(() => {
            this.processUpdateQueue();
        }, this.DEBOUNCE_DELAY - timeSinceLastUpdate);
    }
    
    /**
     * Processa la coda di aggiornamenti
     */
    async processUpdateQueue() {
        if (this.updateQueue.length === 0 || this.isUpdating) {
            return;
        }
        
        // Prendi l'aggiornamento più recente (gli altri sono obsoleti)
        const latestUpdate = this.updateQueue[this.updateQueue.length - 1];
        this.updateQueue = [];
        
        await this.executeTrafficUpdate(latestUpdate.reason, latestUpdate.context);
    }
    
    /**
     * Esegue effettivamente l'aggiornamento del traffico
     */
    async executeTrafficUpdate(reason = 'unknown', context = {}) {
        if (this.isUpdating) {
            console.log('⏳ Aggiornamento traffico già in corso, skip');
            return;
        }
        
        if (!this.trafficIndicator) {
            console.warn('⚠️ TrafficIndicator non disponibile');
            return;
        }
        
        try {
            this.isUpdating = true;
            this.lastUpdateTime = Date.now();
            
            console.log(`🔄 Aggiornamento traffico: ${reason}`, context);
            
            // Timeout di sicurezza
            const updatePromise = this.trafficIndicator.updateStatus();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout aggiornamento traffico')), this.UPDATE_TIMEOUT);
            });
            
            await Promise.race([updatePromise, timeoutPromise]);
            
            console.log(`✅ Aggiornamento traffico completato: ${reason}`);
            
        } catch (error) {
            console.error('❌ Errore aggiornamento traffico:', error);
        } finally {
            this.isUpdating = false;
        }
    }
    
    /**
     * Cleanup history downloads vecchi
     */
    cleanupDownloadHistory() {
        const now = Date.now();
        const maxAge = 60000; // 1 minuto
        
        let cleaned = 0;
        for (const [downloadId, timestamp] of this.downloadHistory.entries()) {
            if (now - timestamp > maxAge) {
                this.downloadHistory.delete(downloadId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleanup download history: ${cleaned} entries rimossi`);
        }
    }
    
    /**
     * Forza aggiornamento immediato (per casi speciali)
     */
    async forceUpdate(reason = 'force') {
        console.log(`⚡ Aggiornamento traffico forzato: ${reason}`);
        
        // Reset stato per permettere aggiornamento
        this.isUpdating = false;
        this.lastUpdateTime = 0;
        
        await this.executeTrafficUpdate(reason);
    }
    
    /**
     * Stato corrente del manager
     */
    getStatus() {
        return {
            isUpdating: this.isUpdating,
            queueLength: this.updateQueue.length,
            activeDownloads: this.activeDownloads.size,
            historySize: this.downloadHistory.size,
            lastUpdateTime: this.lastUpdateTime
        };
    }
    
    /**
     * Cleanup quando l'applicazione viene chiusa
     */
    destroy() {
        if (this.historyCleanupInterval) {
            clearInterval(this.historyCleanupInterval);
        }
        
        this.activeDownloads.clear();
        this.downloadHistory.clear();
        this.updateQueue = [];
        
        console.log('🧹 TrafficControlManager distrutto');
    }
}

// Export per uso globale
window.TrafficControlManager = TrafficControlManager;