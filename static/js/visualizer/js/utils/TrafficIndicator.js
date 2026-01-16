/**
 * TRAFFIC INDICATOR COMPONENT - Indicatore traffico utente
 */

class TrafficIndicator {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.container = null;
        this.refreshInterval = null;
        this.isVisible = false;
    }
    
    /**
     * Inizializza indicatore traffico
     */
    async initialize() {
        try {
            // Crea container indicatore
            this.createContainer();
            
            // Carica status iniziale
            await this.updateStatus();
            
            // Auto-refresh ogni 30 secondi
            this.startAutoRefresh();
            
            console.log('🚦 Traffic Indicator inizializzato');
            
        } catch (error) {
            console.error('Errore inizializzazione Traffic Indicator:', error);
        }
    }
    
    /**
     * Crea container HTML per indicatore
     */
    createContainer() {
        // Cerca dove inserire l'indicatore (es. nella navbar o sidebar)
        const userBox = document.querySelector('div[style*="background: rgba(0,0,0,0.3)"]');
        const insertTarget = userBox || document.querySelector('.sidebar') || document.body;
    
        // HTML indicatore semplificato per riquadro utente
        const indicatorHTML = `
            <div id="traffic-indicator" class="mt-2" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; display: block;">
                <small class="text-white d-block" style="font-size: 0.7rem; opacity: 0.9;">
                    <i class="fas fa-download me-1"></i>
                    <span class="traffic-text">Caricamento...</span>
                </small>
                <div class="progress mt-1" style="height: 3px; background: rgba(255,255,255,0.2);">
                    <div class="progress-bar" style="width: 0%; background: #ffc107;"></div>
                </div>
            </div>
        `;
        
        // Inserisci nell'DOM

        if (insertTarget === userBox) {
            // Trova il link logout e inserisci dopo
            const logoutLink = userBox.querySelector('a[href="/auth/logout"]');
            if (logoutLink) {
                logoutLink.insertAdjacentHTML('afterend', indicatorHTML);
            } else {
                insertTarget.insertAdjacentHTML('beforeend', indicatorHTML);
            }
        } else if (insertTarget.classList?.contains('sidebar')) {
            insertTarget.insertAdjacentHTML('afterbegin', indicatorHTML);
        } else {
            document.body.insertAdjacentHTML('afterbegin', indicatorHTML);
        }
        
        this.container = document.getElementById('traffic-indicator');
    }
    
    /**
     * Aggiorna status traffico
     */
    async updateStatus() {
        try {
            const statusResponse = await this.apiClient.getTrafficStatus();
            
            if (statusResponse.status === 'success') {
                this.renderStatus(statusResponse.traffic_status);
                this.show();
            } else {
                this.hide();
            }
            
        } catch (error) {
            console.error('Errore aggiornamento traffic status:', error);
            this.hide();
        }
    }

    /**
     * Aggiornamento immediato dopo download (pubblico)
     */
    async updateStatusNow() {
        console.log('🔄 Aggiornamento immediato traffic status...');
        await this.updateStatus();
    }
    
    /**
     * Renderizza status nella UI
     */
    renderStatus(status) {
        if (!this.container) return;
        
        const { user_id, limit_mb, used_mb, remaining_mb, download_count, is_unlimited } = status;
        
        const textEl = this.container.querySelector('.traffic-text');
        const progressBar = this.container.querySelector('.progress-bar');
        
        if (is_unlimited) {
            // Utente illimitato
            textEl.innerHTML = `<strong>Illimitato</strong> (${used_mb.toFixed(1)} MB oggi)`;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-primary';
            
            
        } else if (limit_mb > 0) {
            // Utente con limite
            const percentage = (used_mb / limit_mb) * 100;
            const remainingFormatted = remaining_mb ? remaining_mb.toFixed(1) : '0.0';
            
            textEl.innerHTML = `<strong>${remainingFormatted} MB</strong> rimanenti (${download_count} download)`;
            progressBar.style.width = `${Math.min(percentage, 100)}%`;
            
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
            textEl.innerHTML = `${used_mb.toFixed(1)} MB utilizzati`;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-secondary';
            
        }
    }
    
    /**
     * Mostra indicatore
     */
    show() {
        if (this.container) {
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
     * Avvia auto-refresh
     */
    startAutoRefresh() {
        this.stopAutoRefresh(); // Clear esistente
        
        this.refreshInterval = setInterval(() => {
            this.updateStatus();
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
    }
}

// Export per uso in ReadingsVisualizer
window.TrafficIndicator = TrafficIndicator;