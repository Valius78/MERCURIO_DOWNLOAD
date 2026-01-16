/**
 * TRAFFIC INDICATOR COMPONENT - VERSIONE CORRETTA
 * Corregge il problema di caching che impediva l'aggiornamento dopo download
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
        this.forceNextUpdate = false; // 🔧 NUOVO: Flag per forzare aggiornamento
    }
    
    /**
     * Inizializza indicatore traffico
     */
    async initialize() {
        try {
            // Crea container indicatore
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
     * Crea container HTML per indicatore
     */
    createContainer() {
        // Rimuovi container esistente
        const existing = document.getElementById('traffic-indicator');
        if (existing) existing.remove();
        
        const html = `
            <div id="traffic-indicator" class="d-none d-lg-flex align-items-center me-3" style="display: none !important;">
                <div class="d-flex align-items-center p-2 rounded" style="background: rgba(0,0,0,0.1); min-width: 200px;">
                    <i class="fas fa-tachometer-alt me-2 text-primary"></i>
                    <div class="flex-grow-1">
                        <div class="progress" style="height: 4px;">
                            <div class="progress-bar bg-success" style="width: 0%"></div>
                        </div>
                        <small class="traffic-text text-muted">Caricamento...</small>
                    </div>
                </div>
                <div id="traffic-debug" class="ms-2 small text-muted" style="display: none;"></div>
            </div>
        `;
        
        // Cerca navbar per inserimento
        const navbar = document.querySelector('.navbar-nav');
        if (navbar) {
            navbar.insertAdjacentHTML('beforeend', `<li class="nav-item">${html}</li>`);
        } else {
            // Fallback: inserisci nel body
            document.body.insertAdjacentHTML('afterbegin', html);
        }
        
        this.container = document.getElementById('traffic-indicator');
        
        // Aggiungi click handler per toggle debug (admin feature)
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                if (e.altKey && e.shiftKey) { // Alt+Shift+Click per debug
                    this.toggleDebugInfo();
                }
            });
        }
    }
    
    /**
     * Aggiorna status traffico - METODO PRINCIPALE CORRETTO
     */
    async updateStatus() {
        try {
            const statusResponse = await this.apiClient.getTrafficStatus();
            
            if (statusResponse.status === 'success') {
                const status = statusResponse.traffic_status;
                
                // Calcola hash dello stato per rilevare cambiamenti
                const statusHash = this.calculateStatusHash(status);
                
                // 🔧 CORREZIONE: Aggiorna se è cambiato qualcosa O se forzato
                if (statusHash !== this.lastStatusHash || this.forceNextUpdate) {
                    this.renderStatus(status);
                    this.lastStatusHash = statusHash;
                    this.forceNextUpdate = false; // Reset flag
                    
                    // Aggiorna debug info se visibile
                    this.updateDebugInfo();
                    
                    console.log(`📊 Traffic UI aggiornata: ${status.used_mb.toFixed(1)}MB, ${status.download_count} download`);
                } else {
                    console.log('📊 Status traffico invariato, skip render UI');
                }
                
                this.show();
            } else {
                this.hide();
            }
            
        } catch (error) {
            console.error('Errore aggiornamento traffic status:', error);
            this.hide();
            this.showError('Errore traffico');
        }
    }

    /**
     * Aggiornamento immediato - ORA COORDINATO CON FORZA
     */
    async updateStatusNow() {
        console.log('🔄 Aggiornamento traffic status richiesto manualmente...');
        
        // 🔧 FORZA il prossimo aggiornamento
        this.forceNextUpdate = true;
        
        if (this.trafficControlManager) {
            // Usa il traffic control manager per coordinare l'aggiornamento
            this.trafficControlManager.scheduleTrafficUpdate('manual_request');
        } else {
            // Fallback: aggiornamento diretto
            console.log('🔄 Aggiornamento diretto traffic status (no manager)...');
            await this.updateStatus();
        }
    }
    
    /**
     * Calcola hash dello status per rilevare cambiamenti
     */
    calculateStatusHash(status) {
        const key = `${status.used_mb}_${status.remaining_mb}_${status.download_count}_${status.is_unlimited}`;
        return btoa(key); // Base64 semplice per hash
    }
    
    /**
     * Renderizza status nella UI - OTTIMIZZATO
     */
    renderStatus(status) {
        if (!this.container) return;
        
        const { user_id, limit_mb, used_mb, remaining_mb, download_count, is_unlimited } = status;
        
        const textEl = this.container.querySelector('.traffic-text');
        const progressBar = this.container.querySelector('.progress-bar');
        
        if (is_unlimited) {
            // Utente illimitato
            const displayText = `<strong>Illimitato</strong> (${used_mb.toFixed(1)} MB • ${download_count} DL)`;
            textEl.innerHTML = displayText;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-primary';
            
        } else if (limit_mb > 0) {
            // Utente con limite
            const percentage = Math.min((used_mb / limit_mb) * 100, 100);
            const remainingFormatted = remaining_mb ? remaining_mb.toFixed(1) : '0.0';
            
            textEl.innerHTML = `<strong>${remainingFormatted} MB</strong> (${download_count} DL)`;
            progressBar.style.width = `${percentage}%`;
            
            // Colore progress bar basato su utilizzo
            if (percentage >= 90) {
                progressBar.className = 'progress-bar bg-danger';
            } else if (percentage >= 70) {
                progressBar.className = 'progress-bar bg-warning';
            } else {
                progressBar.className = 'progress-bar bg-success';
            }
        } else {
            // Fallback
            textEl.innerHTML = `${used_mb.toFixed(1)} MB (${download_count} DL)`;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-secondary';
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
            TCM: ${tcmStatus.isUpdating ? 'Updating' : 'Idle'} | 
            Queue: ${tcmStatus.queueLength || 0} | 
            Active: ${tcmStatus.activeDownloads || 0} | 
            Last: ${this.lastStatusHash?.substring(0, 8) || 'None'} |
            Force: ${this.forceNextUpdate}
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
     * Mostra errore temporaneo
     */
    showError(message) {
        if (!this.container) return;
        
        const textEl = this.container.querySelector('.traffic-text');
        const progressBar = this.container.querySelector('.progress-bar');
        
        textEl.innerHTML = `<span style="color: #ff6b6b;">${message}</span>`;
        progressBar.style.width = '0%';
        progressBar.className = 'progress-bar bg-danger';
        
        this.show();
        
        // Ripristina dopo 3 secondi
        setTimeout(() => {
            this.forceUpdate(); // 🔧 Usa forceUpdate invece di updateStatus
        }, 3000);
    }
    
    /**
     * Avvia auto-refresh (SOLO se non c'è TrafficControlManager)
     */
    startAutoRefresh() {
        this.stopAutoRefresh(); // Clear esistente
        
        this.refreshInterval = setInterval(() => {
            if (!this.trafficControlManager) {
                this.updateStatus();
            }
        }, 30000); // 30 secondi
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
     * Cleanup
     */
    destroy() {
        this.stopAutoRefresh();
        
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        
        this.isVisible = false;
        this.lastStatusHash = null;
        this.forceNextUpdate = false;
        
        console.log('🧹 TrafficIndicator distrutto');
    }
}

// Export per uso globale
window.TrafficIndicator = TrafficIndicator;