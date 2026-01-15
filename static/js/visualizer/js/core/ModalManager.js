/**
 * MODAL MANAGER - Gestione modal e template HTML
 * Centralizza creazione e gestione del modal principale
 */

class ModalManager {
    constructor() {
        this.currentModal = null;
        this.eventsAlreadyBound = false;
        this.templateCache = new Map();
    }
    
    /**
     * Inizializza il modal principale
     */
    async initializeModal() {
        if (document.getElementById('readingsModal')) {
            return; // Modal già esistente
        }
        
        try {
            // Carica template HTML
            const modalHTML = await this.loadTemplate('main-modal.html');
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            console.log('📋 Modal principale inizializzato');
            
        } catch (error) {
            console.warn('⚠️ Errore caricamento template modal, uso fallback:', error);
            this.createFallbackModal();
        }
    }
    
    /**
     * Carica template HTML da file
     */
    async loadTemplate(templateName) {
        // Controlla cache
        if (this.templateCache.has(templateName)) {
            return this.templateCache.get(templateName);
        }
        
        try {
            const response = await fetch(`./static/js/visualizer/html/modals/${templateName}`);
            if (!response.ok) {
                throw new Error(`Template ${templateName} non trovato`);
            }
            
            const html = await response.text();
            this.templateCache.set(templateName, html);
            return html;
            
        } catch (error) {
            console.error(`Errore caricamento template ${templateName}:`, error);
            throw error;
        }
    }
    
    /**
     * Crea modal di fallback se template non disponibile
     */
    createFallbackModal() {
        const modalHTML = `
            <div class="modal fade" id="readingsModal" tabindex="-1" aria-labelledby="readingsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen-lg-down modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="readingsModalLabel">
                                <i class="fas fa-chart-line me-2"></i> Visualizzazione Dati
                            </h5>
                            <div class="btn-group ms-auto me-3" id="contentTypeIndicator" style="display: none;">
                                <span class="badge bg-light text-dark fs-6" id="contentTypeBadge">
                                    <i class="fas fa-file me-1"></i> <span id="contentTypeText">Numerico</span>
                                </span>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="bg-light border-bottom p-3">
                                <div class="row g-3 align-items-center">
                                    <div class="col-lg-4 col-md-6">
                                        <label class="form-label fw-bold mb-2">
                                            <i class="fas fa-calendar-alt me-1"></i> Periodo
                                        </label>
                                        <div class="btn-group w-100" role="group">
                                            <input type="radio" class="btn-check" name="period" id="period1d" data-period="1d">
                                            <label class="btn btn-outline-primary" for="period1d">1 Giorno</label>
                                            
                                            <input type="radio" class="btn-check" name="period" id="period7d" data-period="7d" checked>
                                            <label class="btn btn-outline-primary" for="period7d">7 Giorni</label>
                                            
                                            <input type="radio" class="btn-check" name="period" id="period30d" data-period="30d">
                                            <label class="btn btn-outline-primary" for="period30d">30 Giorni</label>
                                            
                                            <input type="radio" class="btn-check" name="period" id="periodCustom" data-period="custom">
                                            <label class="btn btn-outline-primary" for="periodCustom">Custom</label>
                                        </div>
                                    </div>
                                    
                                    <div class="col-lg-5 col-md-6" id="customDateRange" style="display: none;">
                                        <label class="form-label fw-bold mb-2">Range Personalizzato</label>
                                        <div class="row g-2">
                                            <div class="col-6">
                                                <input type="datetime-local" class="form-control" id="startDate">
                                            </div>
                                            <div class="col-6">
                                                <input type="datetime-local" class="form-control" id="endDate">
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="col-lg-3 col-md-12 ms-auto" id="viewModeContainer">
                                        <label class="form-label fw-bold mb-2">Vista</label>
                                        <div class="btn-group w-100" role="group" id="viewModeGroup">
                                            <input type="radio" class="btn-check" name="viewMode" id="viewChart" checked>
                                            <label class="btn btn-outline-secondary" for="viewChart">
                                                <i class="fas fa-chart-line me-1"></i> Grafico
                                            </label>
                                            <input type="radio" class="btn-check" name="viewMode" id="viewTable">
                                            <label class="btn btn-outline-secondary" for="viewTable">
                                                <i class="fas fa-table me-1"></i> Tabella
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="p-3">
                                <div id="loadingSpinner" class="text-center py-5" style="display: none;">
                                    <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;"></div>
                                    <h5 class="text-muted">Caricamento dati...</h5>
                                </div>
                                <!-- Container per dati numerici -->
                                <div id="numericContainer" style="display: block;">
                                    <div id="chartContainer" style="display: block;">
                                        <div class="card border-0 shadow-sm">
                                            <div class="card-body">
                                                <div id="canvasContainer" style="width: 100%; height: 500px; position: relative;">
                                                    <canvas id="readingsChart" style="width: 100%; height: 100%;"></canvas>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div id="dataContainer" style="display: none;"></div>
                                </div>
                                <!-- Container per files -->
                                <div id="filesContainer" style="display: none;">
                                    <div id="filesGrid" class="row g-3"></div>
                                </div>
                                <!-- Container per visualizzatore PDF -->
                                <div id="pdfViewerContainer" style="display: none;">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-header bg-danger text-white">
                                            <h6 class="mb-0">
                                                <i class="fas fa-file-pdf me-2"></i> Visualizzatore PDF
                                                <span class="ms-2" id="pdfFileName">filename.pdf</span>
                                            </h6>
                                        </div>
                                        <div class="card-body p-1">
                                            <div id="pdfViewer" style="width: 100%; height: 600px;"></div>
                                        </div>
                                    </div>
                                </div>
                                <!-- Container per visualizzatore JSON -->
                                <div id="jsonViewerContainer" style="display: none;">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-header bg-warning text-dark">
                                            <h6 class="mb-0">
                                                <i class="fas fa-file-code me-2"></i> Visualizzatore JSON
                                                <span class="ms-2" id="jsonFileName">filename.json</span>
                                            </h6>
                                        </div>
                                        <div class="card-body p-1">
                                            <pre id="jsonContent" style="width: 100%; height: 600px; overflow: auto;"></pre>
                                        </div>
                                    </div>
                                </div>
                                <!-- Container per visualizzatore CSV -->
                                <div id="csvViewerContainer" style="display: none;">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-header bg-success text-white">
                                            <h6 class="mb-0">
                                                <i class="fas fa-file-csv me-2"></i> Visualizzatore CSV
                                                <span class="ms-2" id="csvFileName">filename.csv</span>
                                            </h6>
                                        </div>
                                        <div class="card-body p-1">
                                            <div class="bg-light border-bottom p-3">
                                                <div class="row g-3 align-items-center">
                                                    <div class="col-md-6">
                                                        <label class="form-label fw-bold">Visualizzazione</label>
                                                        <div class="btn-group w-100" role="group">
                                                            <input type="radio" class="btn-check" name="csvViewMode" id="csvTableView">
                                                            <label class="btn btn-outline-success" for="csvTableView">
                                                                <i class="fas fa-table me-1"></i> Tabella
                                                            </label>
                                                            <input type="radio" class="btn-check" name="csvViewMode" id="csvChartView" checked>
                                                            <label class="btn btn-outline-success" for="csvChartView">
                                                                <i class="fas fa-chart-line me-1"></i> Grafico
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="p-3">
                                                <div id="csvViewerTableContainer" style="display: none;">
                                                    <div class="table-responsive" style="max-height: 60vh;">
                                                        <table class="table table-striped table-hover table-sm" id="csvViewerTable"></table>
                                                    </div>
                                                </div>
                                                <div id="csvViewerChartContainer" style="display: block;">
                                                    <div class="card border-0 shadow-sm">
                                                        <div class="card-body">
                                                            <div style="width: 100%; height: 500px; position: relative;">
                                                                <canvas id="csvViewerChartCanvas"></canvas>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <!-- Statistiche -->
                                <div class="mt-4" id="statisticsSection">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0 fw-bold">
                                                <i class="fas fa-chart-bar me-2"></i> Statistiche
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div id="dataStats" class="row g-3"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer bg-light">
                            <button type="button" class="btn btn-outline-primary" id="exportData">
                                <i class="fas fa-download me-1"></i> Esporta CSV
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i> Chiudi
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    /**
     * Mostra il modal
     */
    show() {
        const modal = document.getElementById('readingsModal');
        if (modal) {
            this.currentModal = new bootstrap.Modal(modal, { keyboard: false });
            this.currentModal.show();
            return this.currentModal;
        }
        return null;
    }
    
    /**
     * Nasconde il modal
     */
    hide() {
        if (this.currentModal) {
            this.currentModal.hide();
            this.currentModal = null;
        }
    }
    
    /**
     * Aggiorna titolo modal
     */
    updateTitle(title) {
        const titleElement = document.getElementById('readingsModalLabel');
        if (titleElement) {
            titleElement.innerHTML = title;
        }
    }
    
    /**
     * Mostra indicatore di caricamento
     */
    showLoading(show = true) {
        const spinner = document.getElementById('loadingSpinner');
        const chartContainer = document.getElementById('chartContainer');
        const dataContainer = document.getElementById('dataContainer');
        
        if (spinner) {
            spinner.style.display = show ? 'block' : 'none';
        }
        
        if (!show) {
            // Ripristina visibilità container basata sulla vista attuale
            if (chartContainer) chartContainer.style.display = 'block';
            if (dataContainer) dataContainer.style.display = 'none';
        } else {
            // Nasconde tutto durante il caricamento
            if (chartContainer) chartContainer.style.display = 'none';
            if (dataContainer) dataContainer.style.display = 'none';
        }
    }
    
    /**
     * Mostra messaggio di errore
     */
    showError(message) {
        const container = document.getElementById('dataContainer');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger border-0 shadow-sm">
                    <i class="fas fa-exclamation-triangle me-2"></i> ${message}
                </div>
            `;
            container.style.display = 'block';
        }
    }
    
    /**
     * Cleanup al chiusura modal - MIGLIORATO
     */
    cleanup() {
        console.log('🧹 Modal cleanup iniziato');
        
        // Reset tutti i contenitori
        this.resetAllContainers();
        
        // Reset controlli UI
        this.resetUIControls();
        
        // Pulisci canvas Chart.js
        this.cleanupChartCanvases();
        
        console.log('🧹 Modal cleanup completato');
    }
    
    /**
     * NUOVO: Reset tutti i contenitori
     */
    resetAllContainers() {
        const containers = [
            'numericContainer',
            'filesContainer', 
            'pdfViewerContainer',
            'jsonViewerContainer',
            'csvViewerContainer'
        ];
        
        containers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                container.style.display = 'none';
                
                // Reset contenuto per viewer specifici
                if (containerId === 'pdfViewerContainer') {
                    const pdfViewer = document.getElementById('pdfViewer');
                    if (pdfViewer) pdfViewer.innerHTML = '';
                }
                if (containerId === 'jsonViewerContainer') {
                    const jsonContent = document.getElementById('jsonContent');
                    if (jsonContent) jsonContent.innerHTML = '';
                }
            }
        });
    }
    
    /**
     * NUOVO: Reset controlli UI
     */
    resetUIControls() {
        // Reset radio period a default
        document.querySelectorAll('input[name="period"]').forEach(radio => {
            radio.checked = false;
        });
        const defaultPeriod = document.getElementById('period7d');
        if (defaultPeriod) defaultPeriod.checked = true;
        
        // Reset radio view mode 
        document.querySelectorAll('input[name="viewMode"]').forEach(radio => {
            radio.checked = false;
        });
        const defaultView = document.getElementById('viewChart');
        if (defaultView) defaultView.checked = true;
        
        // Nascondi range custom
        const customRange = document.getElementById('customDateRange');
        if (customRange) customRange.style.display = 'none';
        
        // Reset export visibility
        const exportBtn = document.getElementById('exportData');
        if (exportBtn) exportBtn.style.display = 'none';
    }
    
    /**
     * NUOVO: Pulisci canvas Chart.js residui
     */
    cleanupChartCanvases() {
        const canvasIds = ['readingsChart', 'csvViewerChartCanvas'];
        
        canvasIds.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                try {
                    const existingChart = Chart.getChart(canvas);
                    if (existingChart) {
                        console.log(`🧹 Cleanup canvas: ${canvasId}`);
                        existingChart.destroy();
                    }
                    
                    // Pulisci il context
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                } catch (error) {
                    console.warn(`⚠️ Errore cleanup canvas ${canvasId}:`, error);
                }
            }
        });
    }
    
    /**
     * Ottiene template componente
     */
    async getComponentTemplate(componentName) {
        return await this.loadTemplate(`../components/${componentName}`);
    }
}

// Export globale
window.ModalManager = ModalManager;