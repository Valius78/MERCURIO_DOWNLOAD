/**
 * DOWNLOAD PROGRESS MODAL - VERSIONE ULTRA-ROBUSTA
 * Risolve completamente il problema del template con approccio fail-safe
 */

class DownloadProgressModal {
    constructor(trafficControlManager) {
        this.trafficControlManager = trafficControlManager;
        this.modal = null;
        this.currentDownloads = new Map();
        this.isVisible = false;
        this.modalInitialized = false;
        this.initializationAttempted = false;
        this.fallbackMode = false;
    }
    
    /**
     * Inizializza il modal con controlli ultra-robusti
     */
    initialize() {
        if (this.initializationAttempted) {
            console.log('📋 DownloadProgressModal già inizializzato');
            return;
        }
        
        this.initializationAttempted = true;
        
        try {
            // Verifica disponibilità Bootstrap
            if (typeof bootstrap === 'undefined') {
                console.warn('⚠️ Bootstrap non disponibile, attivando modalità fallback');
                this.fallbackMode = true;
                console.log('📋 DownloadProgressModal inizializzato (fallback mode)');
                return;
            }
            
            this.createModalAndTemplate();
            
            // Aspetta che il DOM sia completamente aggiornato
            setTimeout(() => {
                this.initializeBootstrapModal();
                this.bindEvents();
            }, 500); // Timeout più lungo
            
            console.log('📋 DownloadProgressModal inizializzato');
            
        } catch (error) {
            console.error('❌ Errore inizializzazione DownloadProgressModal:', error);
            this.fallbackMode = true;
            console.log('📋 DownloadProgressModal inizializzato (fallback mode dopo errore)');
        }
    }
    
    /**
     * 🔧 NUOVO: Crea modal e template insieme in modo atomico
     */
    createModalAndTemplate() {
        // Rimuovi elementi esistenti se presenti
        const existingModal = document.getElementById('downloadProgressModal');
        if (existingModal) existingModal.remove();
        
        const existingTemplate = document.getElementById('downloadItemTemplate');
        if (existingTemplate) existingTemplate.remove();
        
        const modalHTML = `
            <div class="modal fade" id="downloadProgressModal" tabindex="-1" aria-labelledby="downloadProgressModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="downloadProgressModalLabel">
                                <i class="fas fa-download me-2"></i>Download in corso
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div id="downloadProgressList">
                                <!-- Lista download popolata dinamicamente -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <div class="me-auto">
                                <small class="text-muted">
                                    <i class="fas fa-info-circle me-1"></i>
                                    I download continueranno anche se chiudi questa finestra
                                </small>
                            </div>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Nascondi</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Inserisci modal nel DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 🔧 Crea template SEPARATO e INVISIBILE
        this.createDownloadTemplate();
        
        console.log('✅ HTML modal e template creati');
    }
    
    /**
     * 🔧 NUOVO: Crea template download in modo separato e sicuro
     */
    createDownloadTemplate() {
        const templateHTML = `
            <div id="downloadItemTemplate" style="position: fixed; top: -9999px; left: -9999px; visibility: hidden;">
                <div class="download-item mb-3 p-3 border rounded">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="download-info">
                            <h6 class="download-name mb-1">Nome File</h6>
                            <small class="text-muted download-type">Tipo: ZIP</small>
                        </div>
                        <div class="download-status">
                            <span class="badge bg-primary download-status-badge">In corso...</span>
                        </div>
                    </div>
                    
                    <div class="progress mb-2" style="height: 8px;">
                        <div class="progress-bar download-progress-bar" style="width: 0%"></div>
                    </div>
                    
                    <div class="d-flex justify-content-between">
                        <small class="text-muted download-size">Dimensione: Calcolando...</small>
                        <small class="text-muted download-time">Tempo: --:--</small>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', templateHTML);
    }
    
    /**
     * 🔧 NUOVO: Verifica e ricrea template se necessario
     */
    ensureTemplateExists() {
        let template = document.getElementById('downloadItemTemplate');
        
        if (!template) {
            console.warn('⚠️ Template download mancante, lo ricreo...');
            this.createDownloadTemplate();
            template = document.getElementById('downloadItemTemplate');
        }
        
        return template;
    }
    
    /**
     * Inizializza modal Bootstrap con controlli ultra-robusti
     */
    initializeBootstrapModal() {
        try {
            const modalElement = document.getElementById('downloadProgressModal');
            
            if (!modalElement) {
                console.error('❌ Elemento modal non trovato nel DOM');
                this.fallbackMode = true;
                return;
            }
            
            // Verifica template
            if (!this.ensureTemplateExists()) {
                console.error('❌ Template download non recuperabile');
                this.fallbackMode = true;
                return;
            }
            
            // Verifica che Bootstrap sia ancora disponibile
            if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
                console.error('❌ Bootstrap Modal non disponibile');
                this.fallbackMode = true;
                return;
            }
            
            try {
                // Rimuovi istanza precedente se esiste
                const existingModal = bootstrap.Modal.getInstance(modalElement);
                if (existingModal) {
                    existingModal.dispose();
                }
                
                // Crea nuova istanza
                this.modal = new bootstrap.Modal(modalElement, {
                    backdrop: 'static',
                    keyboard: false
                });
                
                this.modalInitialized = true;
                console.log('✅ Modal Bootstrap inizializzato');
                
            } catch (modalError) {
                console.error('❌ Errore creazione istanza Bootstrap modal:', modalError);
                this.modal = null;
                this.modalInitialized = false;
                this.fallbackMode = true;
            }
            
        } catch (error) {
            console.error('❌ Errore setup modal Bootstrap:', error);
            this.modalInitialized = false;
            this.fallbackMode = true;
        }
    }
    
    /**
     * Bind eventi modal
     */
    bindEvents() {
        if (this.fallbackMode) return;
        
        setTimeout(() => {
            const modalElement = document.getElementById('downloadProgressModal');
            
            if (modalElement && !this.fallbackMode) {
                modalElement.addEventListener('hidden.bs.modal', () => {
                    this.isVisible = false;
                    if (this.currentDownloads.size === 0) {
                        this.clearCompletedDownloads();
                    }
                });
                
                modalElement.addEventListener('shown.bs.modal', () => {
                    this.isVisible = true;
                });
                
                console.log('✅ Eventi modal collegati');
            }
        }, 100);
    }
    
    /**
     * Avvia tracking di un download con controlli ultra-robusti
     */
    startDownload(downloadId, downloadInfo) {
        try {
            // Controllo duplicati
            if (this.currentDownloads.has(downloadId)) {
                console.warn(`⚠️ Download ${downloadId} già in corso`);
                return false;
            }
            
            // Registra nel TrafficControlManager usando il metodo corretto
            if (this.trafficControlManager) {
                const canStart = this.trafficControlManager.registerDownload(downloadId, downloadInfo);
                if (!canStart) {
                    console.warn(`⚠️ Download bloccato da TrafficControlManager: ${downloadId}`);
                    return false;
                }
            }
            
            // Aggiungi download alla lista
            const download = {
                id: downloadId,
                name: downloadInfo.name || 'Download',
                type: this.getDownloadType(downloadInfo),
                filename: downloadInfo.filename || 'file',
                status: 'starting',
                progress: 0,
                startTime: Date.now(),
                size: null,
                endTime: null
            };
            
            this.currentDownloads.set(downloadId, download);
            
            // Crea elemento UI solo se non in fallback mode
            if (!this.fallbackMode) {
                this.createDownloadItemSafe(downloadId, download);
                this.updateDownloadUI(downloadId, download);
                
                // Mostra modal se possibile
                this.showModal();
            } else {
                // In fallback mode, log del progresso
                console.log(`📥 Download iniziato (fallback): ${download.name}`);
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Errore startDownload:', error);
            return false;
        }
    }
    
    /**
     * 🔧 NUOVO: Crea elemento download in modo ultra-sicuro
     */
    createDownloadItemSafe(downloadId, download) {
        try {
            // Assicura che il template esista
            const template = this.ensureTemplateExists();
            if (!template) {
                console.error('❌ Template download non disponibile');
                return null;
            }
            
            const item = template.cloneNode(true);
            item.id = `download-item-${downloadId}`;
            item.setAttribute('data-download-id', downloadId);
            
            // Ripristina visibilità e posizione
            item.style.position = 'relative';
            item.style.top = 'auto';
            item.style.left = 'auto';
            item.style.visibility = 'visible';
            
            const listContainer = document.getElementById('downloadProgressList');
            if (listContainer) {
                listContainer.appendChild(item);
                console.log(`✅ Elemento download creato: ${downloadId}`);
            } else {
                console.error('❌ Container lista download non trovato');
                return null;
            }
            
            return item;
            
        } catch (error) {
            console.error('❌ Errore createDownloadItemSafe:', error);
            return null;
        }
    }
    
    /**
     * Aggiorna progresso download
     */
    updateDownload(downloadId, updates) {
        try {
            const download = this.currentDownloads.get(downloadId);
            if (!download) {
                console.warn(`⚠️ Download ${downloadId} non trovato per update`);
                return;
            }
            
            // Aggiorna dati
            Object.assign(download, updates);
            
            // Aggiorna UI solo se non in fallback mode
            if (!this.fallbackMode) {
                this.updateDownloadUI(downloadId, download);
            } else {
                // In fallback mode, log del progresso
                if (updates.progress !== undefined) {
                    console.log(`📥 Download progresso (fallback): ${download.name} - ${updates.progress}%`);
                }
            }
            
        } catch (error) {
            console.error('❌ Errore updateDownload:', error);
        }
    }
    
    /**
     * Completa download - USA IL METODO CORRETTO E FORZA AGGIORNAMENTO TRAFFICO
     */
    completeDownload(downloadId, result) {
        try {
            const download = this.currentDownloads.get(downloadId);
            if (!download) {
                console.warn(`⚠️ Download ${downloadId} non trovato per completion`);
                return;
            }
            
            // Aggiorna status
            download.status = result.success ? 'completed' : 'error';
            download.progress = result.success ? 100 : download.progress;
            download.endTime = Date.now();
            download.error = result.error || null;
            download.size = result.size || download.size;
            
            // Aggiorna UI
            if (!this.fallbackMode) {
                this.updateDownloadUI(downloadId, download);
            } else {
                // In fallback mode, log del risultato
                if (result.success) {
                    console.log(`✅ Download completato (fallback): ${download.name}`);
                } else {
                    console.error(`❌ Download fallito (fallback): ${download.name} - ${result.error}`);
                }
            }
            
            // ✅ USA IL METODO CORRETTO: completeDownload invece di updateDownloadProgress
            if (this.trafficControlManager && typeof this.trafficControlManager.completeDownload === 'function') {
                this.trafficControlManager.completeDownload(downloadId, result);
                
                // 🔧 FORZA AGGIORNAMENTO TRAFFICO dopo download
                if (window.readingsVisualizerTrafficIndicator && typeof window.readingsVisualizerTrafficIndicator.forceUpdate === 'function') {
                    setTimeout(() => {
                        window.readingsVisualizerTrafficIndicator.forceUpdate();
                    }, 100);
                }
            }
            
            // Auto-rimozione dopo 5 secondi se completato con successo
            if (result.success) {
                setTimeout(() => {
                    this.removeDownload(downloadId);
                }, 5000);
            }
            
        } catch (error) {
            console.error('❌ Errore completeDownload:', error);
        }
    }
    
    /**
     * Rimuove download dalla lista
     */
    removeDownload(downloadId) {
        try {
            this.currentDownloads.delete(downloadId);
            
            if (!this.fallbackMode) {
                const item = document.getElementById(`download-item-${downloadId}`);
                if (item) {
                    item.remove();
                }
            }
            
            // Nascondi modal se non ci sono più download
            if (this.currentDownloads.size === 0) {
                setTimeout(() => {
                    this.hideModal();
                }, 1000);
            }
            
        } catch (error) {
            console.error('❌ Errore removeDownload:', error);
        }
    }
    
    /**
     * Mostra modal con controlli ultra-robusti
     */
    showModal() {
        if (this.fallbackMode) {
            return;
        }
        
        try {
            if (!this.modalInitialized || !this.modal) {
                console.warn('⚠️ Modal non inizializzato, skip show');
                return;
            }
            
            if (!this.isVisible) {
                this.modal.show();
            }
            
        } catch (error) {
            console.error('❌ Errore show modal:', error);
            this.fallbackMode = true;
            console.warn('⚠️ Attivata modalità fallback dopo errore show modal');
        }
    }
    
    /**
     * Nascondi modal
     */
    hideModal() {
        if (this.fallbackMode) return;
        
        try {
            if (this.modal && this.isVisible && this.modalInitialized) {
                this.modal.hide();
            }
        } catch (error) {
            console.error('❌ Errore hide modal:', error);
        }
    }
    
    /**
     * Aggiorna UI download
     */
    updateDownloadUI(downloadId, download) {
        if (this.fallbackMode) return;
        
        try {
            const item = document.getElementById(`download-item-${downloadId}`);
            if (!item) {
                console.warn(`⚠️ Elemento UI download ${downloadId} non trovato`);
                return;
            }
            
            // Aggiorna nome
            const nameEl = item.querySelector('.download-name');
            if (nameEl) nameEl.textContent = download.name;
            
            // Aggiorna tipo
            const typeEl = item.querySelector('.download-type');
            if (typeEl) typeEl.textContent = `Tipo: ${download.type}`;
            
            // Aggiorna status badge
            const badgeEl = item.querySelector('.download-status-badge');
            if (badgeEl) {
                badgeEl.className = `badge ${this.getStatusBadgeClass(download.status)}`;
                badgeEl.textContent = this.getStatusText(download.status);
            }
            
            // Aggiorna progress bar
            const progressEl = item.querySelector('.download-progress-bar');
            if (progressEl) {
                progressEl.style.width = `${download.progress}%`;
                progressEl.className = `progress-bar ${this.getProgressBarClass(download.status)}`;
            }
            
            // Aggiorna dimensione
            const sizeEl = item.querySelector('.download-size');
            if (sizeEl) {
                const sizeText = download.size ? 
                    this.formatFileSize(download.size) : 'Sconosciuta';
                sizeEl.textContent = `Dimensione: ${sizeText}`;
            }
            
            // Aggiorna tempo
            const timeEl = item.querySelector('.download-time');
            if (timeEl) {
                const duration = download.endTime ? 
                    (download.endTime - download.startTime) : 
                    (Date.now() - download.startTime);
                timeEl.textContent = `Tempo: ${this.formatDuration(duration)}`;
            }
            
        } catch (error) {
            console.error('❌ Errore updateDownloadUI:', error);
        }
    }
    
    /**
     * Pulisci download completati
     */
    clearCompletedDownloads() {
        for (const [downloadId, download] of this.currentDownloads.entries()) {
            if (download.status === 'completed' || download.status === 'error') {
                this.removeDownload(downloadId);
            }
        }
    }
    
    /**
     * Helper functions
     */
    getDownloadType(downloadInfo) {
        if (downloadInfo.type) return downloadInfo.type;
        
        const name = downloadInfo.filename || downloadInfo.name || '';
        if (name.endsWith('.zip')) return 'ZIP';
        if (name.endsWith('.csv')) return 'CSV';
        if (name.endsWith('.pdf')) return 'PDF';
        if (name.endsWith('.json')) return 'JSON';
        
        return 'File';
    }
    
    getStatusBadgeClass(status) {
        switch (status) {
            case 'starting': return 'bg-info';
            case 'downloading': return 'bg-primary';
            case 'completed': return 'bg-success';
            case 'error': return 'bg-danger';
            default: return 'bg-secondary';
        }
    }
    
    getStatusText(status) {
        switch (status) {
            case 'starting': return 'Inizializzazione...';
            case 'downloading': return 'Download...';
            case 'completed': return 'Completato';
            case 'error': return 'Errore';
            default: return 'Sconosciuto';
        }
    }
    
    getProgressBarClass(status) {
        switch (status) {
            case 'completed': return 'progress-bar bg-success';
            case 'error': return 'progress-bar bg-danger';
            default: return 'progress-bar';
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    /**
     * Cleanup ultra-robusto
     */
    destroy() {
        try {
            this.currentDownloads.clear();
            
            if (this.modal && this.modalInitialized && !this.fallbackMode) {
                try {
                    this.modal.dispose();
                } catch (error) {
                    console.warn('⚠️ Errore dispose modal:', error);
                }
            }
            
            const modalElement = document.getElementById('downloadProgressModal');
            if (modalElement) {
                modalElement.remove();
            }
            
            const templateElement = document.getElementById('downloadItemTemplate');
            if (templateElement) {
                templateElement.remove();
            }
            
            this.modalInitialized = false;
            this.initializationAttempted = false;
            this.fallbackMode = false;
            
            console.log('🧹 DownloadProgressModal distrutto');
            
        } catch (error) {
            console.error('❌ Errore destroy DownloadProgressModal:', error);
        }
    }
}

// Export per uso globale
window.DownloadProgressModal = DownloadProgressModal;