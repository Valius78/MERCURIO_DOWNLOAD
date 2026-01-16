/**
 * DOWNLOAD PROGRESS MODAL - VERSIONE ULTRA-ROBUSTA CORRETTA
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
            
            // ✅ CORRETTO: Crea tutto insieme atomicamente
            this.createModalHTML();
            
            // Aspetta che il DOM sia completamente aggiornato
            setTimeout(() => {
                this.initializeBootstrapModal();
                this.bindEvents();
            }, 100); // Timeout ridotto ma sicuro
            
            console.log('📋 DownloadProgressModal inizializzato');
            
        } catch (error) {
            console.error('❌ Errore inizializzazione DownloadProgressModal:', error);
            this.fallbackMode = true;
            console.log('📋 DownloadProgressModal inizializzato (fallback mode dopo errore)');
        }
    }
    
    /**
     * 🔧 CORRETTO: Crea tutto l'HTML necessario in una volta
     */
    createModalHTML() {
        // Rimuovi elementi esistenti se presenti
        const existingModal = document.getElementById('downloadProgressModal');
        if (existingModal) existingModal.remove();
        
        const existingTemplate = document.getElementById('downloadItemTemplate');
        if (existingTemplate) existingTemplate.remove();
        
        // ✅ Crea PRIMA il template, poi il modal
        const templateHTML = `
            <div id="downloadItemTemplate" style="position: fixed; top: -9999px; left: -9999px; visibility: hidden; pointer-events: none;">
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
        
        // ✅ Inserisci PRIMA il template, POI il modal
        document.body.insertAdjacentHTML('beforeend', templateHTML);
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        console.log('✅ HTML modal e template creati insieme');
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
            
            // ✅ Verifica che il template sia davvero presente
            const template = document.getElementById('downloadItemTemplate');
            if (!template) {
                console.error('❌ Template download non trovato, ricreo...');
                this.createModalHTML(); // Ricrea tutto
                return;
            }
            
            // Verifica che Bootstrap sia ancora disponibile
            if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
                console.error('❌ Bootstrap Modal non disponibile');
                this.fallbackMode = true;
                return;
            }
            
            // Inizializza Bootstrap Modal
            this.modal = new bootstrap.Modal(modalElement, {
                backdrop: 'static',
                keyboard: false
            });
            
            this.modalInitialized = true;
            console.log('✅ Modal Bootstrap inizializzato');
            
        } catch (error) {
            console.error('❌ Errore inizializzazione Bootstrap Modal:', error);
            this.fallbackMode = true;
        }
    }
    
    /**
     * Bind eventi modal
     */
    bindEvents() {
        if (this.fallbackMode) return;
        
        try {
            const modalElement = document.getElementById('downloadProgressModal');
            if (!modalElement) return;
            
            modalElement.addEventListener('shown.bs.modal', () => {
                this.isVisible = true;
                console.log('📋 Download modal aperto');
            });
            
            modalElement.addEventListener('hidden.bs.modal', () => {
                this.isVisible = false;
                console.log('📋 Download modal nascosto');
            });
            
            console.log('✅ Eventi modal collegati');
            
        } catch (error) {
            console.error('❌ Errore bind eventi modal:', error);
        }
    }
    
    /**
     * ✅ CORRETTO: Avvia download con fallback robusto
     */
    startDownload(downloadId, downloadInfo) {
        try {
            // Verifica duplicati
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
            
            // ✅ Crea elemento UI solo se non in fallback mode E il template esiste
            if (!this.fallbackMode && this.verifyTemplate()) {
                this.createDownloadItem(downloadId, download);
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
     * 🔧 NUOVO: Verifica che il template sia ancora presente
     */
    verifyTemplate() {
        const template = document.getElementById('downloadItemTemplate');
        return template !== null;
    }
    
    /**
     * 🔧 CORRETTO: Crea elemento download in modo più sicuro
     */
    createDownloadItem(downloadId, download) {
        try {
            const template = document.getElementById('downloadItemTemplate');
            if (!template) {
                console.error('❌ Template download non disponibile');
                return null;
            }
            
            const listContainer = document.getElementById('downloadProgressList');
            if (!listContainer) {
                console.error('❌ Container lista download non trovato');
                return null;
            }
            
            // ✅ Clona correttamente dal template
            const downloadDiv = template.querySelector('.download-item');
            if (!downloadDiv) {
                console.error('❌ Download item non trovato nel template');
                return null;
            }
            
            const item = downloadDiv.cloneNode(true);
            item.id = `download-item-${downloadId}`;
            item.setAttribute('data-download-id', downloadId);
            
            listContainer.appendChild(item);
            console.log(`✅ Elemento download creato: ${downloadId}`);
            
            return item;
            
        } catch (error) {
            console.error('❌ Errore createDownloadItem:', error);
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
            if (!this.fallbackMode && this.verifyTemplate()) {
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
     * ✅ CORRETTO: Aggiorna UI download con controlli robusti
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
            
            // Aggiorna status
            const statusEl = item.querySelector('.download-status-badge');
            if (statusEl) {
                statusEl.textContent = this.getStatusText(download.status);
                statusEl.className = `badge ${this.getStatusClass(download.status)}`;
            }
            
            // Aggiorna progress bar
            const progressBar = item.querySelector('.download-progress-bar');
            if (progressBar) {
                progressBar.style.width = `${download.progress}%`;
                progressBar.className = `progress-bar ${this.getProgressClass(download.status)}`;
            }
            
            // Aggiorna size
            const sizeEl = item.querySelector('.download-size');
            if (sizeEl && download.size) {
                sizeEl.textContent = `Dimensione: ${this.formatFileSize(download.size)}`;
            }
            
            // Aggiorna tempo
            const timeEl = item.querySelector('.download-time');
            if (timeEl) {
                const elapsed = Date.now() - download.startTime;
                timeEl.textContent = `Tempo: ${this.formatTime(elapsed)}`;
            }
            
        } catch (error) {
            console.error('❌ Errore updateDownloadUI:', error);
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
            if (!this.fallbackMode && this.verifyTemplate()) {
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
                if (window.readingsVisualizer && window.readingsVisualizer.core && window.readingsVisualizer.core.trafficIndicator) {
                    setTimeout(() => {
                        window.readingsVisualizer.core.trafficIndicator.forceUpdate();
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
     * Mostra modal
     */
    showModal() {
        if (this.fallbackMode) {
            console.log('📋 Modal in fallback mode, skip show');
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
            console.error('❌ Errore showModal:', error);
        }
    }
    
    /**
     * Rimuovi download dalla lista
     */
    removeDownload(downloadId) {
        try {
            // Rimuovi dai dati
            this.currentDownloads.delete(downloadId);
            
            // Rimuovi dall'UI se presente
            if (!this.fallbackMode) {
                const item = document.getElementById(`download-item-${downloadId}`);
                if (item) {
                    item.remove();
                }
            }
            
            // Nascondi modal se non ci sono più download
            if (this.currentDownloads.size === 0 && this.isVisible && !this.fallbackMode) {
                setTimeout(() => {
                    if (this.modal && this.currentDownloads.size === 0) {
                        this.modal.hide();
                    }
                }, 1000);
            }
            
        } catch (error) {
            console.error('❌ Errore removeDownload:', error);
        }
    }
    
    /**
     * Utility functions
     */
    getDownloadType(downloadInfo) {
        const type = downloadInfo.type || '';
        switch (type.toLowerCase()) {
            case 'csv': return 'CSV';
            case 'zip': return 'ZIP';
            case 'file': return 'FILE';
            default: return 'DATA';
        }
    }
    
    getStatusText(status) {
        switch (status) {
            case 'starting': return 'Avvio...';
            case 'downloading': return 'Download...';
            case 'completed': return 'Completato';
            case 'error': return 'Errore';
            default: return 'In corso...';
        }
    }
    
    getStatusClass(status) {
        switch (status) {
            case 'completed': return 'bg-success';
            case 'error': return 'bg-danger';
            default: return 'bg-primary';
        }
    }
    
    getProgressClass(status) {
        switch (status) {
            case 'completed': return 'bg-success';
            case 'error': return 'bg-danger';
            default: return 'bg-primary';
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    /**
     * Cleanup
     */
    destroy() {
        try {
            // Chiudi modal se aperto
            if (this.modal && this.isVisible && !this.fallbackMode) {
                this.modal.hide();
            }
            
            // Rimuovi elementi dal DOM
            const modal = document.getElementById('downloadProgressModal');
            if (modal) modal.remove();
            
            const template = document.getElementById('downloadItemTemplate');
            if (template) template.remove();
            
            // Reset stato
            this.modal = null;
            this.currentDownloads.clear();
            this.modalInitialized = false;
            this.isVisible = false;
            
            console.log('🧹 DownloadProgressModal distrutto');
            
        } catch (error) {
            console.error('❌ Errore cleanup DownloadProgressModal:', error);
        }
    }
}

// Export globale
window.DownloadProgressModal = DownloadProgressModal;