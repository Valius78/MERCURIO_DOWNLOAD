/**
 * API CLIENT - Gestione centralizzata chiamate API
 * Tutte le chiamate server passano da qui
 */

class ApiClient {
    constructor() {
        this.baseUrl = '';
        this.defaultTimeout = 30000;
    }
    
    /**
     * Chiamata generica con gestione errori
     */
    async request(url, options = {}) {
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };
        
        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API Error [${url}]:`, error);
            throw error;
        }
    }
    
    /**
     * Carica dati parametro con supporto multi-formato
     */
    async loadParameterData(parameterId, period = '7d') {
        const dateRange = DateUtils.getDateRange(period);
        const params = new URLSearchParams(dateRange);
        
        return await this.request(`/api/readings/parameter/${parameterId}?${params}`);
    }
    
    /**
     * Carica dati canale con supporto multi-formato
     */
    async loadChannelData(channelId, period = '7d') {
        const dateRange = DateUtils.getDateRange(period);
        const params = new URLSearchParams(dateRange);
        
        return await this.request(`/api/readings/channel/${channelId}?${params}`);
    }
    
    /**
     * Carica dati tabella paginata
     */
    async loadTableData(parameterId, options = {}) {
        const {
            page = 1,
            perPage = 50,
            startDate,
            endDate
        } = options;
        
        const params = new URLSearchParams({
            start_date: startDate || '',
            end_date: endDate || '',
            page: page,
            per_page: perPage
        });
        
        return await this.request(`/api/readings/parameter/${parameterId}/table?${params}`);
    }
    
    /**
     * Ottiene parameter_id da channel_id e nome parametro
     */
    async getParameterIdFromChannel(channelId, paramName) {
        const params = new URLSearchParams({ param_name: paramName });
        return await this.request(`/api/readings/channel/${channelId}/parameter-id?${params}`);
    }
    
    /**
     * Lista contenuti cartella
     */
    async listFolderContents(folderPath) {
        return await this.request(`/api/files/list-folder/${encodeURIComponent(folderPath)}`);
    }
    
    /**
     * Dati CSV parsati
     */
    async getCsvData(filePath) {
        return await this.request(`/api/files/csv-data/${encodeURIComponent(filePath)}`);
    }
    
    /**
     * Dati JSON parsati
     */
    async getJsonData(filePath) {
        return await this.request(`/api/files/json-data/${encodeURIComponent(filePath)}`);
    }
    
    /**
     * Download file singolo
     */
    async downloadFile(filePath, fileName) {
        try {
            const response = await fetch(`/api/files/download/${encodeURIComponent(filePath)}`);
            if (!response.ok) throw new Error('Download fallito');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Errore download:', error);
            throw error;
        }
    }
    
    /**
     * Download file multipli come ZIP
     */
    async downloadFilesAsZip(filePaths, zipName = 'files.zip') {
        try {
            const response = await fetch('/api/files/download-zip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_paths: filePaths,
                    zip_name: zipName
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
        } catch (error) {
            console.error('Errore download ZIP:', error);
            throw error;
        }
    }
    
    /**
     * URL per visualizzazione file
     */
    getFileViewUrl(filePath) {
        return `/api/files/view/${encodeURIComponent(filePath)}`;
    }
    
    /**
     * URL per preview file
     */
    getFilePreviewUrl(filePath) {
        return `/api/files/preview/${encodeURIComponent(filePath)}`;
    }

    /**
 * Ottiene status traffico utente corrente
 */
    async getTrafficStatus() {
        try {
            const response = await fetch('/api/user/traffic-status');
            if (!response.ok) {
                throw new Error(`Status traffico non disponibile: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('❌ Errore recupero status traffico:', error);
            return {
                status: 'error',
                traffic_status: {
                    user_id: null,
                    limit_mb: 50,
                    used_mb: 0,
                    remaining_mb: 50,
                    download_count: 0,
                    is_unlimited: false
                }
            };
        }
    }

    /**
     * Gestisce errore traffico limite superato
     */
    handleTrafficLimitError(errorData) {
        console.warn('⚠️ Traffico limite superato:', errorData);
        
        // Aggiorna indicatore traffico se presente
        this.updateTrafficIndicator(errorData);
        
        // Mostra modal di errore user-friendly
        this.showTrafficLimitModal(errorData);
    }

    /**
     * Aggiorna indicatore traffico nella UI
     */
    updateTrafficIndicator(errorData) {
        const indicator = document.getElementById('traffic-indicator');
        if (!indicator) return;
        
        const { usage_mb, limit_mb, remaining_mb } = errorData;
        const percentage = limit_mb > 0 ? (usage_mb / limit_mb) * 100 : 0;
        
        indicator.innerHTML = `
            <div class="d-flex align-items-center text-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <small>
                    <strong>Limite Superato:</strong> 
                    ${usage_mb.toFixed(1)}/${limit_mb} MB (${percentage.toFixed(0)}%)
                </small>
            </div>
        `;
    }

    /**
     * Mostra modal errore traffico limite
     */
    showTrafficLimitModal(errorData) {
        const { message, usage_mb, limit_mb, download_count, reset_time } = errorData;
        
        const modalHTML = `
            <div class="modal fade" id="trafficLimitModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                Limite Traffico Raggiunto
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <strong>Download Bloccato:</strong> ${message}
                            </div>
                            
                            <div class="row g-3">
                                <div class="col-6">
                                    <div class="card bg-light">
                                        <div class="card-body text-center p-2">
                                            <h6 class="card-title mb-1">Utilizzato</h6>
                                            <span class="badge bg-danger fs-6">${usage_mb.toFixed(1)} MB</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-light">
                                        <div class="card-body text-center p-2">
                                            <h6 class="card-title mb-1">Limite</h6>
                                            <span class="badge bg-secondary fs-6">${limit_mb} MB</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mt-3">
                                <h6>📊 Statistiche Giornaliere:</h6>
                                <ul class="mb-0">
                                    <li><strong>Download effettuati:</strong> ${download_count}</li>
                                    <li><strong>Reset contatori:</strong> ${reset_time}</li>
                                </ul>
                            </div>
                            
                            <div class="alert alert-info mt-3">
                                <i class="fas fa-info-circle"></i>
                                <strong>Cosa puoi fare:</strong>
                                <ul class="mb-0 mt-2">
                                    <li>Attendere il reset automatico a mezzanotte UTC</li>
                                    <li>Scaricare file più piccoli se disponibili</li>
                                    <li>Contattare l'amministratore per aumentare il limite</li>
                                </ul>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i> Chiudi
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.location.reload()">
                                <i class="fas fa-sync me-1"></i> Aggiorna Pagina
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Rimuovi modal esistente
        document.getElementById('trafficLimitModal')?.remove();
        
        // Aggiungi nuovo modal
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Mostra modal
        const modal = new bootstrap.Modal(document.getElementById('trafficLimitModal'));
        modal.show();
        
        // Auto-cleanup
        document.getElementById('trafficLimitModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }
}

// Export globale
window.ApiClient = ApiClient;