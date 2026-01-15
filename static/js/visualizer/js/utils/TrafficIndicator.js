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
        const navbarNav = document.querySelector('.navbar-nav');
        const sidebar = document.querySelector('.sidebar');
        const insertTarget = navbarNav || sidebar || document.body;
        
        // HTML indicatore
        const indicatorHTML = `
            <div id="traffic-indicator" class="traffic-indicator d-none">
                <div class="card border-0 shadow-sm mb-2" style="font-size: 0.875rem;">
                    <div class="card-body p-2">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-download text-primary me-2"></i>
                            <div class="flex-grow-1">
                                <div class="traffic-info">
                                    <span class="traffic-text">Caricamento...</span>
                                </div>
                                <div class="progress mt-1" style="height: 4px;">
                                    <div class="progress-bar bg-primary" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Inserisci nell'DOM
        if (navbarNav) {
            navbarNav.insertAdjacentHTML('afterend', indicatorHTML);
        } else if (sidebar) {
            sidebar.insertAdjacentHTML('afterbegin', indicatorHTML);
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
     * Renderizza status nella UI
     */
    renderStatus(status) {
        if (!this.container) return;
        
        const { user_id, limit_mb, used_mb, remaining_mb, download_count, is_unlimited } = status;
        
        const textEl = this.container.querySelector('.traffic-text');
        const progressBar = this.container.querySelector('.progress-bar');
        const cardBody = this.container.querySelector('.card-body');
        
        if (is_unlimited) {
            // Utente illimitato
            textEl.innerHTML = `<strong>Illimitato</strong> (${used_mb.toFixed(1)} MB oggi)`;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-primary';
            cardBody.className = 'card-body p-2 border-start border-primary border-3';
            
        } else if (limit_mb > 0) {
            // Utente con limite
            const percentage = (used_mb / limit_mb) * 100;
            const remainingFormatted = remaining_mb ? remaining_mb.toFixed(1) : '0.0';
            
            textEl.innerHTML = `<strong>${remainingFormatted} MB</strong> rimanenti (${download_count} download)`;
            progressBar.style.width = `${Math.min(percentage, 100)}%`;
            
            // Colore progress bar basato su utilizzo
            if (percentage >= 90) {
                progressBar.className = 'progress-bar bg-danger';
                cardBody.className = 'card-body p-2 border-start border-danger border-3';
            } else if (percentage >= 70) {
                progressBar.className = 'progress-bar bg-warning';
                cardBody.className = 'card-body p-2 border-start border-warning border-3';
            } else {
                progressBar.className = 'progress-bar bg-success';
                cardBody.className = 'card-body p-2 border-start border-success border-3';
            }
        } else {
            // Fallback
            textEl.innerHTML = `${used_mb.toFixed(1)} MB utilizzati`;
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar bg-secondary';
            cardBody.className = 'card-body p-2';
        }
    }
    
    /**
     * Mostra indicatore
     */
    show() {
        if (this.container && !this.isVisible) {
            this.container.classList.remove('d-none');
            this.isVisible = true;
        }
    }
    
    /**
     * Nascondi indicatore
     */
    hide() {
        if (this.container && this.isVisible) {
            this.container.classList.add('d-none');
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