/**
 * EVENT HANDLERS - Gestione eventi DOM centralizzata
 * Bind e gestione di tutti gli eventi del visualizer
 */

class EventHandlers {
    constructor(core) {
        this.core = core;
        this.eventsAlreadyBound = false;
        this.refreshTimeout = null;
    }
    
    /**
     * Inizializza tutti gli event handlers
     */
    bindAllEvents() {
        if (this.eventsAlreadyBound) return;
        
        this.bindPeriodEvents();
        this.bindViewModeEvents();
        this.bindModalEvents();
        this.bindExportEvents();
        this.bindDateEvents();
        
        this.eventsAlreadyBound = true;
        console.log('📋 Event handlers inizializzati');
    }
    
    /**
     * Bind eventi per cambio periodo
     */
    bindPeriodEvents() {
        document.addEventListener('change', (e) => {
            if (e.target.name === 'period') {
                const period = e.target.getAttribute('data-period');
                this.handlePeriodChange(period);
            }
        });
    }
    
    /**
     * Gestisce cambio periodo
     */
    handlePeriodChange(period) {
        const customRange = document.getElementById('customDateRange');
        
        if (period === 'custom') {
            if (customRange) {
                customRange.style.display = 'block';
                DateUtils.setDefaultCustomDates();
            }
        } else {
            if (customRange) {
                customRange.style.display = 'none';
            }
            this.refreshData(period);
        }
    }
    
    /**
     * Bind eventi per cambio modalità vista
     */
    bindViewModeEvents() {
        document.addEventListener('change', (e) => {
            if (e.target.name === 'viewMode') {
                this.handleViewModeChange();
            }
        });
    }
    
    /**
     * Gestisce cambio modalità vista
     */
    handleViewModeChange() {
        const contentType = this.core.dataManager.determineContentType();
        
        if (contentType === 'numeric') {
            const isChartView = document.getElementById('viewChart')?.checked || false;
            this.toggleView(isChartView);
        } else {
            // Per file, re-render con nuova modalità
            this.core.renderCurrentData();
        }
    }
    
    /**
     * Toggle tra vista grafico e tabella
     */
    toggleView(showChart) {
        const chartContainer = document.getElementById('chartContainer');
        const dataContainer = document.getElementById('dataContainer');
        
        if (showChart) {
            if (chartContainer) chartContainer.style.display = 'block';
            if (dataContainer) dataContainer.style.display = 'none';
            
            // Re-render dati per grafico
            if (this.core.dataManager.currentData) {
                this.core.renderCurrentData();
            }
        } else {
            if (chartContainer) chartContainer.style.display = 'none';
            if (dataContainer) dataContainer.style.display = 'block';
            
            // Distingui tra parametri singoli e canali
            if (this.core.dataManager.currentParameterId) {
                // Parametro singolo: usa tabella paginata semplice
                this.core.tableRenderer.renderSimpleTable([], { unit: this.core.dataManager.currentUnit || '' });
                this.core.tableRenderer.fetchTableData(1);
            } else if (this.core.dataManager.currentChannelId) {
                // Canale: usa tab + tabella paginata
                const currentData = this.core.dataManager.currentData;
                if (currentData && currentData.readings && currentData.channel_info) {
                    this.core.channelRenderer.renderChannelTabsWithPagination(
                        currentData.readings, 
                        currentData.channel_info
                    );
                }
            }
        }
    }
    
    /**
     * Bind eventi modal
     */
    bindModalEvents() {
        // Modal shown event
        document.addEventListener('shown.bs.modal', (e) => {
            if (e.target.id === 'readingsModal') {
                if (this.core.dataManager.currentData) {
                    this.core.renderCurrentData();
                }
            }
        });
        
        // Modal hidden event
        document.addEventListener('hidden.bs.modal', (e) => {
            if (e.target.id === 'readingsModal') {
                this.core.modalManager.cleanup();
                this.core.chartRenderer.cleanup();
            }
        });
    }
    
    /**
     * Bind eventi per export
     */
    bindExportEvents() {
        // Usa event delegation per gestire elementi creati dinamicamente
        document.addEventListener('click', (e) => {
            if (e.target.id === 'exportData' || e.target.closest('#exportData')) {
                e.preventDefault();
                this.core.exportHandler.exportCurrentData();
            }
        });
    }
    
    /**
     * Bind eventi per date personalizzate
     */
    bindDateEvents() {
        document.addEventListener('change', (e) => {
            if (e.target.id === 'startDate' || e.target.id === 'endDate') {
                // Throttle per evitare troppe chiamate
                if (this.refreshTimeout) {
                    clearTimeout(this.refreshTimeout);
                }
                this.refreshTimeout = setTimeout(() => {
                    this.refreshData();
                }, 300);
            }
        });
    }
    
    /**
     * Refresh dati con debouncing
     */
    refreshData(period = null) {
        // Non refreshare se siamo in navigazione cartelle
        if (this.core.navigationHandler && this.core.navigationHandler.currentFolderPath) {
            return;
        }
        
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        
        // Aspetta 300ms prima di fare la chiamata
        this.refreshTimeout = setTimeout(() => {
            const targetPeriod = period || DateUtils.getSelectedPeriod();
            
            // CORRETTO: Invalida cache per date custom
            const isCustomPeriod = targetPeriod === 'custom';
            if (isCustomPeriod) {
                console.log('🔄 Date custom rilevate - invalidazione cache');
                this.core.dataManager.clearCache();
            }
            
            if (this.core.dataManager.currentParameterId) {
                this.core.loadParameterData(this.core.dataManager.currentParameterId, targetPeriod, false); // Force no cache
            } else if (this.core.dataManager.currentChannelId) {
                this.core.loadChannelData(this.core.dataManager.currentChannelId, targetPeriod, false); // Force no cache
            }
        }, 300);
    }
    
    /**
     * Bind eventi globali per file e navigazione (da chiamare quando necessario)
     */
    bindFileEvents() {
        // File selection events
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('file-select')) {
                this.core.fileRenderer.updateSelectedCount();
            }
        });
        
        // File type filters
        ['All', 'PDF', 'CSV', 'JSON', 'Image', 'Video'].forEach(type => {
            document.addEventListener('change', (e) => {
                if (e.target.id === `filter${type}`) {
                    this.applyFileFilters();
                }
            });
        });
    }
    
    /**
     * Applica filtri ai file visualizzati
     */
    applyFileFilters() {
        const filters = {
            all: document.getElementById('filterAll')?.checked,
            pdf: document.getElementById('filterPDF')?.checked,
            csv: document.getElementById('filterCSV')?.checked,
            json: document.getElementById('filterJSON')?.checked,
            image: document.getElementById('filterImage')?.checked,
            video: document.getElementById('filterVideo')?.checked
        };
        
        // Se "Tutti" è selezionato, mostra tutto
        if (filters.all) {
            document.querySelectorAll('.file-card').forEach(card => {
                card.style.display = 'block';
            });
            return;
        }
        
        // Applica filtri specifici
        document.querySelectorAll('.file-card').forEach(card => {
            const fileType = card.getAttribute('data-type');
            let showCard = false;
            
            switch (fileType) {
                case 'pdf': showCard = filters.pdf; break;
                case 'csv': showCard = filters.csv; break;
                case 'json': showCard = filters.json; break;
                case 'image': showCard = filters.image; break;
                case 'video': showCard = filters.video; break;
                default: showCard = true;
            }
            
            card.style.display = showCard ? 'block' : 'none';
        });
        
        // Aggiorna contatore se visibile
        this.core.fileRenderer.updateSelectedCount();
    }
    
    /**
     * Bind eventi specifici per tabelle canali
     */
    bindChannelTabEvents() {
        // Gestito direttamente da ChannelRenderer
        console.log('📋 Eventi tab canali gestiti da ChannelRenderer');
    }
    
    /**
     * Gestisce keyboard shortcuts
     */
    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // ESC per chiudere modal
            if (e.key === 'Escape') {
                const modal = document.getElementById('readingsModal');
                if (modal && modal.style.display !== 'none') {
                    const modalInstance = bootstrap.Modal.getInstance(modal);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                }
            }
            
            // Ctrl+E per export
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault();
                this.core.exportHandler.exportCurrentData();
            }
            
            // F5 per refresh dati
            if (e.key === 'F5') {
                e.preventDefault();
                this.refreshData();
            }
        });
    }
    
    /**
     * Cleanup eventi (se necessario)
     */
    cleanup() {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
        
        this.eventsAlreadyBound = false;
    }
    
    /**
     * Rebind eventi dopo aggiornamento DOM
     */
    rebindEvents() {
        this.cleanup();
        this.bindAllEvents();
        this.bindFileEvents();
        this.bindKeyboardEvents();
    }
}

// Export globale
window.EventHandlers = EventHandlers;