/**
 * TRAFFIC INDICATOR COMPONENT - VERSIONE CORRETTA PER SIDEBAR
 * Corregge il problema di posizionamento e di caching che impediva l'aggiornamento dopo download
 */

class TrafficIndicator {
    constructor(apiClient, trafficControlManager = null) {
        this.apiClient = apiClient;
        this.trafficControlManager = trafficControlManager;
        this.container = null;
        this.refreshInterval = null;
        this.isVisible = false;
        
        // Stato cache per evitare aggiornamenti UI inutili
        this.lastStatusHash = null;
        this.forceNextUpdate = false; // 🔧 Flag per forzare aggiornamento
    }
    
    /**
     * Inizializza indicatore traffico
     */
    async initialize() {
        try {
            // Crea container indicatore nella sidebar
            this.createContainer();
            
            // Carica status iniziale (SENZA usare traffic control manager per init)
            await this.updateStatus();
            
            // Auto-refresh ogni 30 secondi (solo se non abbiamo traffic control manager)
            if (!this.trafficControlManager) {
                this.startAutoRefresh();
            }
            
            console.log('🚦 Traffic Indicator inizializzato');
            
        } catch (error) {
            console.error('Errore inizializzazione Traffic Indicator:', error);
        }
    }
    
    /**
     * Collega al TrafficControlManager (se disponibile)
     */
    setTrafficControlManager(trafficControlManager) {
        this.trafficControlManager = trafficControlManager;
        
        // Stop auto-refresh se ora abbiamo il manager
        if (this.refreshInterval) {
            this.stopAutoRefresh();
            console.log('⏹️ Auto-refresh fermato: TrafficControlManager attivo');
        }
    }
    
    /**
     * 🔧 NUOVO: Forza prossimo aggiornamento (chiamato dopo download)
     */
    forceUpdate() {
        this.forceNextUpdate = true;
        this.updateStatus();
    }
    
    /**
     * 🔧 CORRETTO: Crea container HTML nella sidebar vicino profilo/logout
     */
    createContainer() {
        // Rimuovi container esistente
        const existing = document.getElementById('traffic-indicator');
        if (existing) existing.remove();
        
        const html = `
            <div id="traffic-indicator" class="traffic-indicator mt-2 p-2" style="background: rgba(255,255,255,0.1); border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);">
                <div class="d-flex align-items-center">
                    <i class="fas fa-tachometer-alt me-2 text-white" style="font-size: 0.9rem;"></i>
                    <div class="flex-grow-1">
                        <div class="progress mb-1" style="height: 4px; background: rgba(255,255,255,0.2);">
                            <div class="progress-bar bg-light" style="width: 0%"></div>
                        </div>
                        <small class="traffic-text text-white" style="font-size: 0.7rem; opacity: 0.9;">Caricamento...</small>
                    </div>
                </div>
                <div id="traffic-debug" class="mt-1 small text-white" style="display: none; font-size: 0.6rem; opacity: 0.7;"></div>
            </div>
        `;
        
        // 🔧 CORREZIONE: Cerca il contenitore utente nella sidebar
        const userContainer = document.querySelector('.sidebar div.mt-2.p-2');
        if (userContainer && userContainer.innerHTML.includes('fas fa-user-circle')) {
            // Inserisci DOPO il container utente
            userContainer.insertAdjacentHTML('afterend', html);
        } else {
            // Fallback: cerca la sidebar e inserisci prima del nav
            const sidebar = document.querySelector('.sidebar');
            const nav = sidebar ? sidebar.querySelector('nav') : null;
            if (nav) {
                nav.insertAdjacentHTML('beforebegin', html);
            } else {
                // Ultimo fallback: inserisci nel body
                console.warn('⚠️ Sidebar non trovata, inserisco nel body');
                document.body.insertAdjacentHTML('afterbegin', html);
            }
        }
        
        this.container = document.getElementById('traffic-indicator');
        
        // Aggiungi click handler per toggle debug (admin feature)
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                if (e.ctrlKey) { // Solo con Ctrl+click per evitare click accidentali
                    this.toggleDebugInfo();
                }
            });
        }
        
        console.log('🚦 Container traffic indicator creato');
    }
    
    /**
     * Avvia auto-refresh
     */
    startAutoRefresh() {
        if (this.refreshInterval) return;
        
        this.refreshInterval = setInterval(() => {
            this.updateStatus();
        }, 30000); // 30 secondi
        
        console.log('🔄 Auto-refresh traffic indicator attivato');
    }
    
    /**
     * Ferma auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
    
    /**
     * Aggiorna status traffico con cache intelligente
     */
    async updateStatus() {
        try {
            const status = await this.apiClient.getTrafficStatus();
            
            // ✅ Controlla se dobbiamo forzare update o se è cambiato
            const statusHash = JSON.stringify(status);
            if (!this.forceNextUpdate && statusHash === this.lastStatusHash) {
                console.log('📊 Status traffico invariato, skip render UI');
                return;
            }
            
            this.lastStatusHash = statusHash;
            this.forceNextUpdate = false; // Reset flag
            
            this.renderStatus(status);
            this.show();
            
            console.log('📊 Traffic UI aggiornata:', `${status.used_mb?.toFixed(1) || 0}MB`, `${status.download_count || 0} download`);
            
        } catch (error) {
            console.warn('⚠️ Errore aggiornamento traffic status:', error);
            this.hide();
        }
    }
    
    /**
     * Render status con UI adatta alla sidebar
     */
    renderStatus(status) {
        if (!this.container) return;
        
        const textEl = this.container.querySelector('.traffic-text');
        const progressBar = this.container.querySelector('.progress-bar');
        
        if (!textEl || !progressBar) {
            console.warn('⚠️ Elementi UI traffic indicator non trovati');
            return;
        }
        
        const { used_mb = 0, limit_mb = null, is_unlimited = false, download_count = 0 } = status;
        
        if (!is_unlimited && limit_mb > 0) {
            const percentage = Math.min((used_mb / limit_mb) * 100, 100);
            const remaining_mb = Math.max(limit_mb - used_mb, 0);
            const remainingFormatted = remaining_mb > 0 ? remaining_mb.toFixed(1) : '0.0';
            
            textEl.innerHTML = `<strong>${remainingFormatted} MB</strong> (${download_count} DL)`;
            progressBar.style.width = `${percentage}%`;
            
            // Colore progress bar basato su utilizzo
            if (percentage >= 90) {
                progressBar.className = 'progress-bar bg-danger';
            } else if (percentage >= 70) {
                progressBar.className = 'progress-bar bg-warning';
            } else {
                progressBar.className = 'progress-bar bg-light';
            }
        } else {
            // Fallback per utenti illimitati
            textEl.innerHTML = `${used_mb.toFixed(1)} MB (${download_count} DL)`;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-light';
        }
    }
    
    /**
     * Toggle info debug (per admin)
     */
    toggleDebugInfo() {
        const debugEl = document.getElementById('traffic-debug');
        if (debugEl) {
            const isVisible = debugEl.style.display !== 'none';
            debugEl.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                this.updateDebugInfo();
            }
        }
    }
    
    /**
     * Aggiorna info debug
     */
    updateDebugInfo() {
        const debugEl = document.getElementById('traffic-debug');
        if (!debugEl || debugEl.style.display === 'none') return;
        
        const tcmStatus = this.trafficControlManager ? 
            this.trafficControlManager.getStatus() : { message: 'Non disponibile' };
        
        debugEl.innerHTML = `
            TCM: ${tcmStatus.isUpdating ? 'Aggiornando...' : 'Idle'}<br>
            Cache: ${this.lastStatusHash ? 'OK' : 'Vuota'}<br>
            Force: ${this.forceNextUpdate ? 'SI' : 'NO'}
        `;
    }
    
    /**
     * Mostra indicatore
     */
    show() {
        if (this.container && !this.isVisible) {
            this.container.style.display = 'block';
            this.isVisible = true;
        }
    }
    
    /**
     * Nascondi indicatore
     */
    hide() {
        if (this.container && this.isVisible) {
            this.container.style.display = 'none';
            this.isVisible = false;
        }
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.stopAutoRefresh();
        
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        
        this.isVisible = false;
        console.log('🧹 TrafficIndicator distrutto');
    }
}

// Export globale
window.TrafficIndicator = TrafficIndicator;