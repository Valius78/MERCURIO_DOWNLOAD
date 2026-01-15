/**
 * READINGS VISUALIZER CORE - Classe principale
 * Orchestra tutti i moduli per creare l'esperienza completa
 */

class ReadingsVisualizerCore {
    constructor() {
        console.log('🚀 Inizializzazione ReadingsVisualizerCore...');
        
        // Inizializza componenti core
        this.apiClient = new ApiClient();
        this.dataManager = new DataManager(this.apiClient);
        this.modalManager = new ModalManager();
        
        // Inizializza renderer
        this.chartRenderer = new ChartRenderer(this.dataManager);
        this.tableRenderer = new TableRenderer(this.dataManager, this.apiClient);
        this.channelRenderer = new ChannelRenderer(this.dataManager, this.apiClient, this.tableRenderer);
        this.fileRenderer = new FileRenderer(this.dataManager, this.apiClient, this.tableRenderer);
        
        // Inizializza handlers
        this.eventHandlers = new EventHandlers(this);
        this.navigationHandler = new NavigationHandler(this.dataManager, this.apiClient, this.fileRenderer);
        this.exportHandler = new ExportHandler(this.dataManager, this.apiClient);
        
        // Stato interno
        this.initialized = false;
        
        // Inizializzazione automatica
        this.init();

        
    }
    
    /**
     * Inizializzazione principale
     */
    async init() {
        try {
            console.log('📋 Inizializzazione componenti...');
            
            // Inizializza modal
            await this.modalManager.initializeModal();
            
            // Bind eventi
            this.eventHandlers.bindAllEvents();
            this.eventHandlers.bindFileEvents();
            this.eventHandlers.bindKeyboardEvents();
            
            this.initialized = true;
            console.log('✅ ReadingsVisualizerCore inizializzato con successo');

            // Inizializza Traffic Indicator
            if (typeof TrafficIndicator !== 'undefined') {
                this.trafficIndicator = new TrafficIndicator(this.apiClient);
                await this.trafficIndicator.initialize();
            } else {
                console.warn('TrafficIndicator non disponibile');
            }
            
        } catch (error) {
            console.error('❌ Errore inizializzazione core:', error);
            this.initialized = false;
        }
    }
    
    /**
     * ===============================
     * METODI PRINCIPALI - API PUBBLICHE
     * ===============================
     */
    
    /**
     * Mostra dati parametro (METODO CHIAVE)
     */
    async showParameterData(parameterId, parameterName) {
        try {
            console.log(`📊 Apertura parametro: ${parameterName} (ID: ${parameterId})`);
            
            // Reset stato precedente
            this.cleanup();
            
            // Imposta titolo modal
            this.modalManager.updateTitle(`<i class="fas fa-chart-line me-2"></i> Parametro: ${parameterName}`);
            
            // Mostra modal
            this.modalManager.show();
            
            // CORRETTO: Sincronizza UI con periodo default 30 giorni
            this.setPeriodUI('30d');
            
            // Carica dati con periodo default 30 giorni
            await this.loadParameterData(parameterId, '30d');
            
        } catch (error) {
            console.error(`❌ Errore apertura parametro ${parameterId}:`, error);
            this.modalManager.showError('Errore caricamento dati parametro: ' + error.message);
        }
    }
    
    /**
     * Mostra dati canale (METODO CHIAVE)
     */
    async showChannelData(channelId, channelName) {
        try {
            console.log(`📊 Apertura canale: ${channelName} (ID: ${channelId})`);
            
            // Reset stato precedente
            this.cleanup();
            
            // Imposta titolo modal
            this.modalManager.updateTitle(`<i class="fas fa-layer-group me-2"></i> Canale: ${channelName}`);
            
            // Mostra modal
            this.modalManager.show();
            
            // CORRETTO: Sincronizza UI con periodo default 7 giorni per canali
            this.setPeriodUI('7d');
            
            // Carica dati con periodo default 7 giorni
            await this.loadChannelData(channelId, '7d');
            
        } catch (error) {
            console.error(`❌ Errore apertura canale ${channelId}:`, error);
            this.modalManager.showError('Errore caricamento dati canale: ' + error.message);
        }
    }
    
    /**
     * ===============================
     * CARICAMENTO DATI
     * ===============================
     */
    
    /**
     * Carica dati parametro
     */
    async loadParameterData(parameterId, period = '7d', useCache = true) {
        this.modalManager.showLoading(true);
        
        try {
            const data = await this.dataManager.loadParameterData(parameterId, period, useCache);
            
            // Determina tipo contenuto e configura UI
            const contentType = this.dataManager.determineContentType(data);
            this.updateUIForContentType(contentType);
            
            // Render dati
            this.renderCurrentData();
            
            // Render statistiche
            this.renderStatistics(data.stats);
            
            console.log(`✅ Dati parametro ${parameterId} caricati: ${contentType}`);
            
        } catch (error) {
            console.error(`❌ Errore caricamento parametro ${parameterId}:`, error);
            this.modalManager.showError('Errore nel caricamento dei dati del parametro: ' + error.message);
        } finally {
            this.modalManager.showLoading(false);
        }
    }
    
    /**
     * Carica dati canale
     */
    async loadChannelData(channelId, period = '7d', useCache = true) {
        this.modalManager.showLoading(true);
        
        try {
            const data = await this.dataManager.loadChannelData(channelId, period, useCache);
            
            // Determina tipo contenuto e configura UI
            const contentType = this.dataManager.determineContentType(data);
            this.updateUIForContentType(contentType);
            
            // Render dati
            this.renderCurrentData();
            
            // Render statistiche
            this.renderStatistics(data.stats);
            
            console.log(`✅ Dati canale ${channelId} caricati: ${contentType}`);
            
        } catch (error) {
            console.error(`❌ Errore caricamento canale ${channelId}:`, error);
            this.modalManager.showError('Errore nel caricamento dei dati del canale: ' + error.message);
        } finally {
            this.modalManager.showLoading(false);
        }
    }
    
    /**
     * ===============================
     * RENDERING E UI
     * ===============================
     */
    
    /**
     * Aggiorna UI in base al tipo di contenuto
     */
    updateUIForContentType(contentType) {
        const indicator = document.getElementById('contentTypeIndicator');
        const typeBadge = document.getElementById('contentTypeBadge');
        const viewModeContainer = document.getElementById('viewModeContainer');
        
        if (indicator) indicator.style.display = 'block';
        
        // Configurazione per tipo
        const typeConfig = {
            'numeric': { icon: 'fa-chart-line', text: 'Numerico', class: 'bg-primary' },
            'folder': { icon: 'fa-folder', text: 'Cartelle', class: 'bg-primary' },
            'pdf': { icon: 'fa-file-pdf', text: 'PDF', class: 'bg-danger' },
            'csv': { icon: 'fa-file-csv', text: 'CSV', class: 'bg-success' },
            'json': { icon: 'fa-file-code', text: 'JSON', class: 'bg-warning' },
            'image': { icon: 'fa-image', text: 'Immagini', class: 'bg-info' },
            'video': { icon: 'fa-video', text: 'Video', class: 'bg-dark' },
            'mixed': { icon: 'fa-layer-group', text: 'Misto', class: 'bg-secondary' }
        };
        
        const config = typeConfig[contentType] || typeConfig['mixed'];
        
        if (typeBadge) {
            typeBadge.className = `badge ${config.class} text-white fs-6`;
            typeBadge.innerHTML = `<i class="fas ${config.icon} me-1"></i> <span id="contentTypeText">${config.text}</span>`;
        }
        
        // Gestione visibilità controlli vista
        const shouldHideViewMode = contentType === 'folder';
        if (viewModeContainer) {
            viewModeContainer.style.display = shouldHideViewMode ? 'none' : 'block';
        }
        
        // NUOVO: Gestione visibilità export CSV
        this.updateExportVisibility(contentType);
        
        // Aggiorna modalità vista per file
        if (contentType !== 'numeric') {
            this.updateViewModeForFiles(contentType);
        } else {
            this.resetViewModeForNumeric();
        }
    }
    
    /**
     * NUOVO: Aggiorna visibilità export in base al contesto
     */
    updateExportVisibility(contentType) {
        const exportBtn = document.getElementById('exportData');
        if (!exportBtn) return;
        
        // Determina se siamo in navigazione cartelle/sottocartelle
        const isInFolderNavigation = this.navigationHandler && 
            (this.navigationHandler.currentFolderPath || this.navigationHandler.currentFolderData);
        
        // Determina se siamo in una sottocartella specifica (non root)
        const isInSubfolder = this.navigationHandler && this.navigationHandler.currentFolderPath;
        
        // LOGICA EXPORT:
        // ✅ Dati numerici → sempre visibile (tranne se in sottocartelle file)
        // ✅ Root cartelle → visibile (per export paths eventi)  
        // ❌ Sottocartelle → nascosto
        // ❌ File viewer → nascosto
        
        let shouldShowExport = false;
        
        if (contentType === 'numeric') {
            shouldShowExport = !isInSubfolder; // Numerico visibile tranne in sottocartelle
        } else if (contentType === 'folder') {
            shouldShowExport = !isInSubfolder; // Cartelle solo al root level
        } else {
            shouldShowExport = false; // File/PDF/JSON/CSV sempre nascosto
        }
        
        exportBtn.style.display = shouldShowExport ? 'inline-block' : 'none';
        
        console.log(`📤 Export: ${shouldShowExport ? 'visibile' : 'nascosto'} (type: ${contentType}, inFolder: ${isInFolderNavigation}, inSub: ${isInSubfolder})`);
    }
    
    /**
     * Aggiorna modalità vista per files
     */
    updateViewModeForFiles(contentType) {
        const viewChart = document.getElementById('viewChart');
        const viewTable = document.getElementById('viewTable');
        const viewGallery = document.getElementById('viewGallery');
        
        // Nascondi vista grafico per file
        if (viewChart && viewChart.parentElement) {
            viewChart.style.display = 'none';
            viewChart.parentElement.style.display = 'none';
        }
        
        // Mostra sempre tabella per file
        if (viewTable && viewTable.parentElement) {
            viewTable.style.display = 'block';
            viewTable.parentElement.style.display = 'inline-block';
        }
        
        // Gallery solo per immagini e video
        if (viewGallery && viewGallery.parentElement) {
            if (contentType === 'image' || contentType === 'video') {
                viewGallery.style.display = 'block';
                viewGallery.parentElement.style.display = 'inline-block';
                viewGallery.checked = true; // Default per immagini/video
            } else {
                viewGallery.style.display = 'none';
                viewGallery.parentElement.style.display = 'none';
                viewTable.checked = true; // Default per altri file
            }
        }
    }
    
    /**
     * Reset view mode per dati numerici
     */
    resetViewModeForNumeric() {
        const viewChart = document.getElementById('viewChart');
        const viewTable = document.getElementById('viewTable');
        const viewModeContainer = document.getElementById('viewModeContainer');
        
        if (viewModeContainer) {
            viewModeContainer.style.display = 'block';
        }
        
        if (viewChart && viewChart.parentElement) {
            viewChart.style.display = 'block';
            viewChart.parentElement.style.display = 'inline-block';
            viewChart.checked = true;
        }
        
        if (viewTable && viewTable.parentElement) {
            viewTable.style.display = 'block';
            viewTable.parentElement.style.display = 'inline-block';
        }
    }
    
    /**
     * Render dati correnti (METODO CENTRALE)
     */
    renderCurrentData() {
        if (!this.dataManager.currentData) return;
        
        const contentType = this.dataManager.determineContentType();
        console.log(`🎨 Rendering dati tipo: ${contentType}`);
        
        if (contentType === 'numeric') {
            this.renderNumericData();
        } else {
            this.renderFileData(contentType);
        }
    }
    
    /**
     * Render dati numerici
     */
    renderNumericData() {
        document.getElementById('numericContainer').style.display = 'block';
        document.getElementById('filesContainer').style.display = 'none';
        
        const isChartView = document.getElementById('viewChart')?.checked || true;
        
        if (isChartView) {
            // Vista grafico
            if (this.dataManager.currentParameterId) {
                this.chartRenderer.renderChart(
                    this.dataManager.currentData.readings, 
                    this.dataManager.currentData.parameter_info
                );
            } else if (this.dataManager.currentChannelId) {
                this.chartRenderer.renderMultiChart(
                    this.dataManager.currentData.readings, 
                    this.dataManager.currentData.channel_info
                );
            }
        } else {
            // Vista tabella
            if (this.dataManager.currentParameterId) {
                this.tableRenderer.renderSimpleTable([], { unit: this.dataManager.currentUnit || '' });
                this.tableRenderer.fetchTableData(1);
            } else if (this.dataManager.currentChannelId) {
                // Sempre renderizza i tab per i canali
                this.channelRenderer.renderChannelTable(
                    this.dataManager.currentData.readings, 
                    this.dataManager.currentData.channel_info
                );
            }
        }
    }
    
    /**
     * Render dati file
     */
    renderFileData(contentType) {
        document.getElementById('numericContainer').style.display = 'none';
        
        const viewMode = this.getSelectedViewMode();
        
        if (contentType === 'folder') {
            document.getElementById('filesContainer').style.display = 'block';
            this.navigationHandler.renderMainFolders();
        } else if (this.dataManager.currentChannelId && contentType === 'mixed') {
            // Canale con contenuto misto - usa renderer specializzato
            this.renderChannelFileData();
        } else if (viewMode === 'gallery') {
            document.getElementById('filesContainer').style.display = 'block';
            this.fileRenderer.renderFileGallery();
        } else if (viewMode === 'table') {
            document.getElementById('numericContainer').style.display = 'block';
            document.getElementById('chartContainer').style.display = 'none';
            document.getElementById('dataContainer').style.display = 'block';
            
            const files = this.fileRenderer.extractFilesFromCurrentData();
            this.tableRenderer.renderFileTable(files, this.dataManager.currentChannelId ? true : false);
        } else if (contentType === 'pdf') {
            this.handleSingleFileType('pdf');
        } else if (contentType === 'json') {
            this.handleSingleFileType('json');
        } else if (contentType === 'csv') {
            this.handleSingleFileType('csv');
        }
    }
    
    /**
     * Render dati file per canali
     */
    renderChannelFileData() {
        document.getElementById('filesContainer').style.display = 'block';
        document.getElementById('numericContainer').style.display = 'none';
        
        // Usa ChannelRenderer per lista parametri come file/cartelle
        this.renderChannelParametersList();
    }
    
    /**
     * Render lista parametri canale come file/cartelle
     */
    renderChannelParametersList() {
        const container = document.getElementById('filesGrid');
        
        if (!this.dataManager.currentData || !this.dataManager.currentData.readings) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessun parametro trovato</div></div>';
            return;
        }
        
        let parameters = [];
        
        // Estrai parametri dai readings del canale
        for (const [paramName, readings] of Object.entries(this.dataManager.currentData.readings)) {
            if (readings.length > 0) {
                const firstReading = readings[0];
                if (FileUtils.isFilePath(firstReading.value)) {
                    const type = FileUtils.getFileTypeFromPath(firstReading.value);
                    parameters.push({
                        name: paramName,
                        type: type,
                        count: readings.length,
                        readings: readings,
                        lastUpdate: readings[0].timestamp_utc
                    });
                }
            }
        }
        
        if (parameters.length === 0) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessun file/cartella trovato nei parametri</div></div>';
            return;
        }
        
        // Render tabella parametri
        let html = `
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white">
                        <h6 class="mb-0">
                            <i class="fas fa-layer-group me-2"></i> Parametri Canale (${parameters.length})
                        </h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover mb-0">
                                <thead class="table-dark">
                                    <tr>
                                        <th class="px-3"><i class="fas fa-tag me-1"></i> Parametro</th>
                                        <th class="px-3"><i class="fas fa-file me-1"></i> Tipo</th>
                                        <th class="px-3"><i class="fas fa-list-ol me-1"></i> Elementi</th>
                                        <th class="px-3"><i class="fas fa-clock me-1"></i> Ultimo Aggiornamento</th>
                                        <th class="px-3" style="width: 120px;"><i class="fas fa-tools me-1"></i> Azioni</th>
                                    </tr>
                                </thead>
                                <tbody>
        `;
        
        parameters.forEach((param, index) => {
            const typeConfig = FileUtils.getFileTypeConfig(param.type);
            const timeStr = DateUtils.formatTimestampLocal(param.lastUpdate);
            
            html += `
                <tr class="${index % 2 === 0 ? 'table-light' : ''}">
                    <td class="px-3">
                        <div class="d-flex align-items-center">
                            <i class="fas ${typeConfig.icon} text-${typeConfig.color} me-2"></i>
                            <strong>${param.name}</strong>
                        </div>
                    </td>
                    <td class="px-3">
                        <span class="badge bg-${typeConfig.color}">${param.type.toUpperCase()}</span>
                    </td>
                    <td class="px-3">
                        <span class="badge bg-light text-dark">${param.count}</span>
                    </td>
                    <td class="px-3 font-monospace">${timeStr}</td>
                    <td class="px-3">
                        <button class="btn btn-primary btn-sm" 
                                onclick="window.readingsVisualizer.openChannelParameter('${param.name}', '${param.type}')">
                            <i class="fas fa-folder-open me-1"></i> Apri
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    /**
     * Apre parametro canale come file/cartella
     */
    async openChannelParameter(paramName, paramType) {
        const readings = this.dataManager.currentData.readings[paramName];
        
        if (!readings || readings.length === 0) {
            alert('Nessun dato trovato per questo parametro');
            return;
        }
        
        try {
            console.log(`🔄 Apertura parametro canale: ${paramName} (tipo: ${paramType})`);
            
            // CORRETTO: Ottieni il vero parameter_id dal database
            const paramResponse = await this.apiClient.getParameterIdFromChannel(
                this.dataManager.currentChannelId, 
                paramName
            );
            
            if (!paramResponse || !paramResponse.parameter_id) {
                throw new Error(`Impossibile trovare ID per parametro ${paramName}`);
            }
            
            const realParameterId = paramResponse.parameter_id;
            console.log(`✅ Parameter ID trovato: ${realParameterId} per ${paramName}`);
            
            // Salva stato nello stack di navigazione
            this.navigationHandler.navigationStack.push({
                type: 'channel',
                data: this.dataManager.currentData,
                channelId: this.dataManager.currentChannelId,
                parameterId: null
            });
            
            // Simula struttura parametro singolo con vero parameter_id
            const parameterData = {
                readings: readings,
                parameter_info: {
                    parameter_id: realParameterId,
                    name: paramName,
                    parameter_code: paramName,
                    unit: paramResponse.unit || ''
                }
            };
            
            // CORRETTO: Imposta il vero parameter_id numerico
            this.dataManager.setCurrentData(parameterData, realParameterId, null);
            this.dataManager.currentContext = 'channel_parameter';
            
            // Aggiorna titolo modal
            this.modalManager.updateTitle(`<i class="fas fa-layer-group me-2"></i> Parametro: ${paramName}`);
            
            // Render in base al tipo
            if (paramType === 'folder') {
                console.log(`📂 Rendering cartelle per parametro ${realParameterId}`);
                this.navigationHandler.renderMainFolders();
            } else {
                console.log(`🎨 Rendering gallery file per parametro ${realParameterId}`);
                this.fileRenderer.renderFileGallery();
            }
            
        } catch (error) {
            console.error(`❌ Errore apertura parametro ${paramName}:`, error);
            alert(`Errore apertura parametro ${paramName}: ${error.message}`);
        }
    }

    backToChannelParametersList() {
        console.log('🔙 Tornando alla lista parametri canale');
        
        // Pop dallo stack di navigazione
        if (this.navigationHandler.navigationStack.length > 0) {
            const previousState = this.navigationHandler.navigationStack.pop();
            
            if (previousState.type === 'channel') {
                // Ripristina dati canale
                this.dataManager.currentData = previousState.data;
                this.dataManager.currentChannelId = previousState.channelId;
                this.dataManager.currentParameterId = null;
                this.dataManager.currentContext = null;
                
                // Reset navigazione
                this.navigationHandler.currentFolderPath = null;
                this.navigationHandler.currentFolderData = null;
                
                // Ripristina titolo modal
                const channelName = previousState.data.channel_info?.name || 'Canale';
                this.modalManager.updateTitle(`<i class="fas fa-layer-group me-2"></i> Canale: ${channelName}`);
                
                // Mostra contenitori appropriati
                document.getElementById('numericContainer').style.display = 'none';
                document.getElementById('filesContainer').style.display = 'block';
                
                // Re-render lista parametri canale
                this.renderChannelParametersList();
                
                // Aggiorna visibilità export
                this.updateExportVisibility('mixed');
                
                console.log('✅ Ritorno alla lista parametri canale completato');
                return;
            }
        }
        
        // Fallback se non c'è stack
        console.log('⚠️ Stack vuoto, fallback a lista parametri');
        this.renderChannelParametersList();
    }

    
    /**
     * Gestisce file tipo singolo (PDF, JSON, CSV)
     */
    handleSingleFileType(fileType) {
        if (this.dataManager.currentParameterId && Array.isArray(this.dataManager.currentData.readings)) {
            const fileReadings = this.dataManager.currentData.readings.filter(r => 
                FileUtils.isFilePath(r.value) && FileUtils.getFileTypeFromPath(r.value) === fileType
            );
            
            if (fileReadings.length === 1) {
                const filePath = fileReadings[0].value;
                const fileName = FileUtils.getFileNameFromPath(filePath);
                this.fileRenderer.openFile(filePath, fileType, fileName);
                return;
            }
        }
        
        // Fallback: mostra gallery
        this.fileRenderer.renderFileGallery();
    }
    
    /**
     * Render statistiche
     */
    renderStatistics(stats) {
        const statsContainer = document.getElementById('dataStats');
        if (!stats || !statsContainer) return;
        
        let statsHTML = '';
        
        if (Array.isArray(stats)) {
            // Stats multi-parametro - NUOVO LAYOUT TABELLA PROFESSIONALE
            statsHTML = `
                <div class="col-12">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped mb-0">
                            <thead class="table-dark">
                                <tr>
                                    <th class="px-3">Parametro</th>
                                    <th class="text-end px-2">Record DB</th>
                                    <th class="text-end px-2">Visualizzati</th>
                                    <th class="text-end px-2">Min</th>
                                    <th class="text-end px-2">Max</th>
                                    <th class="text-end px-2">Media</th>
                                    <th class="text-center px-2">Info</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            stats.forEach((stat, index) => {
                const isEven = index % 2 === 0;
                const rowClass = isEven ? 'table-light' : '';
                
                statsHTML += `
                    <tr class="${rowClass}">
                        <td class="px-3">
                            <strong>${stat.parameter_name}</strong>
                        </td>
                        <td class="text-end px-2">
                            <span class="badge bg-primary">${(stat.total_records_in_period || stat.count).toLocaleString()}</span>
                        </td>
                        <td class="text-end px-2">
                            <span class="badge ${stat.downsampled ? 'bg-warning text-dark' : 'bg-secondary'}">${(stat.chart_samples || stat.count).toLocaleString()}</span>
                        </td>
                        <td class="text-end px-2">
                            <span class="badge bg-success">${stat.min !== null ? parseFloat(stat.min).toFixed(2) : 'N/A'}</span>
                        </td>
                        <td class="text-end px-2">
                            <span class="badge bg-danger">${stat.max !== null ? parseFloat(stat.max).toFixed(2) : 'N/A'}</span>
                        </td>
                        <td class="text-end px-2">
                            <span class="badge bg-info">${stat.avg !== null ? parseFloat(stat.avg).toFixed(2) : 'N/A'}</span>
                        </td>
                        <td class="text-center px-2">
                            ${stat.downsampled ? '<span class="badge bg-warning text-dark small">Downsampled</span>' : '<span class="badge bg-light text-dark small">Complete</span>'}
                        </td>
                    </tr>
                `;
            });
            
            statsHTML += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            // Stats singolo parametro - NUOVO LAYOUT ORIZZONTALE COMPATTO
            const showDownsampleInfo = stats.total_records_in_period && stats.chart_samples;
            
            statsHTML = `
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body p-3">
                            <div class="row g-3 align-items-center">
                                <div class="col-lg-2 col-md-3">
                                    <div class="text-center">
                                        <div class="text-primary mb-1">
                                            <i class="fas fa-database fa-2x"></i>
                                        </div>
                                        <h6 class="mb-0">${(stats.total_records_in_period || stats.count || 0).toLocaleString()}</h6>
                                        <small class="text-muted">Record DB</small>
                                    </div>
                                </div>
                                ${showDownsampleInfo ? `
                                <div class="col-lg-2 col-md-3">
                                    <div class="text-center">
                                        <div class="${stats.downsampled ? 'text-warning' : 'text-secondary'} mb-1">
                                            <i class="fas ${stats.downsampled ? 'fa-compress-alt' : 'fa-chart-line'} fa-2x"></i>
                                        </div>
                                        <h6 class="mb-0">${stats.chart_samples.toLocaleString()}</h6>
                                        <small class="text-muted">Visualizzati</small>
                                        ${stats.downsampled ? '<div><span class="badge bg-warning text-dark small">Downsampled</span></div>' : ''}
                                    </div>
                                </div>
                                ` : ''}
                                <div class="col-lg-2 col-md-3">
                                    <div class="text-center">
                                        <div class="text-success mb-1">
                                            <i class="fas fa-arrow-down fa-2x"></i>
                                        </div>
                                        <h6 class="mb-0">${stats.min !== null ? parseFloat(stats.min).toFixed(2) : 'N/A'}</h6>
                                        <small class="text-muted">Minimo</small>
                                    </div>
                                </div>
                                <div class="col-lg-2 col-md-3">
                                    <div class="text-center">
                                        <div class="text-danger mb-1">
                                            <i class="fas fa-arrow-up fa-2x"></i>
                                        </div>
                                        <h6 class="mb-0">${stats.max !== null ? parseFloat(stats.max).toFixed(2) : 'N/A'}</h6>
                                        <small class="text-muted">Massimo</small>
                                    </div>
                                </div>
                                <div class="col-lg-2 col-md-3">
                                    <div class="text-center">
                                        <div class="text-info mb-1">
                                            <i class="fas fa-calculator fa-2x"></i>
                                        </div>
                                        <h6 class="mb-0">${stats.avg !== null ? parseFloat(stats.avg).toFixed(2) : 'N/A'}</h6>
                                        <small class="text-muted">Media</small>
                                    </div>
                                </div>
                                <div class="col-lg-2 col-md-12">
                                    <div class="text-center">
                                        <div class="text-secondary mb-1">
                                            <i class="fas fa-info-circle fa-2x"></i>
                                        </div>
                                        <h6 class="mb-0">
                                            <span class="badge ${stats.downsampled ? 'bg-warning text-dark' : 'bg-success'} px-3 py-2">
                                                ${stats.downsampled ? 'Downsampled' : 'Complete'}
                                            </span>
                                        </h6>
                                        <small class="text-muted">Stato Dati</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        statsContainer.innerHTML = statsHTML;
    }
    
    /**
     * ===============================
     * UTILITIES
     * ===============================
     */
    
    /**
     * Ottiene modalità vista selezionata
     */
    getSelectedViewMode() {
        if (document.getElementById('viewChart')?.checked) return 'chart';
        if (document.getElementById('viewTable')?.checked) return 'table';
        if (document.getElementById('viewGallery')?.checked) return 'gallery';
        return 'table';
    }
    
    /**
     * NUOVO: Sincronizza UI periodo con periodo effettivamente caricato
     */
    setPeriodUI(period) {
        // Reset tutti i radio button
        document.querySelectorAll('input[name="period"]').forEach(radio => {
            radio.checked = false;
        });
        
        // Seleziona il radio button corretto
        const targetRadio = document.getElementById(`period${period}`);
        if (targetRadio) {
            targetRadio.checked = true;
            console.log(`🎛️ UI aggiornata: periodo impostato su ${period}`);
        } else {
            console.warn(`⚠️ Radio button per periodo ${period} non trovato`);
        }
        
        // Nascondi range personalizzato se non custom
        const customRange = document.getElementById('customDateRange');
        if (customRange) {
            customRange.style.display = period === 'custom' ? 'block' : 'none';
        }
    }
    
    /**
     * Cleanup stato - MIGLIORATO
     */
    cleanup() {
        console.log('🧹 Core cleanup iniziato');
        
        // Cleanup dataManager
        this.dataManager.clearCurrentData();
        
        // Cleanup renderer con controllo errori
        try {
            this.chartRenderer.cleanup();
        } catch (error) {
            console.warn('⚠️ Errore cleanup chartRenderer:', error);
        }
        
        // Cleanup navigazione
        try {
            this.navigationHandler.cleanup();
        } catch (error) {
            console.warn('⚠️ Errore cleanup navigationHandler:', error);
        }
        
        // NUOVO: Cleanup file renderer
        try {
            this.fileRenderer.cleanup();
        } catch (error) {
            console.warn('⚠️ Errore cleanup fileRenderer:', error);
        }
        
        // Reset UI state completo
        this.resetUIState();
        
        // NUOVO: Cleanup pulsanti dinamici
        this.removeDynamicButtons();
        
        console.log('🧹 Core cleanup completato');
    }
    
    /**
     * NUOVO: Reset completo UI state
     */
    resetUIState() {
        // Reset contenitori
        const containers = [
            { id: 'numericContainer', display: 'block' },
            { id: 'filesContainer', display: 'none' },
            { id: 'chartContainer', display: 'block' },
            { id: 'dataContainer', display: 'none' },
            { id: 'pdfViewerContainer', display: 'none' },
            { id: 'jsonViewerContainer', display: 'none' },
            { id: 'csvViewerContainer', display: 'none' }
        ];
        
        containers.forEach(({ id, display }) => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = display;
            }
        });
        
        // Reset controlli vista
        const viewChart = document.getElementById('viewChart');
        if (viewChart) viewChart.checked = true;
        
        // Reset content type indicator
        const indicator = document.getElementById('contentTypeIndicator');
        if (indicator) indicator.style.display = 'none';
    }
    
    /**
     * NUOVO: Rimuovi pulsanti dinamici 
     */
    removeDynamicButtons() {
        // Rimuovi tutti i pulsanti "Torna alla lista"
        document.querySelectorAll('.back-to-list-btn').forEach(btn => {
            if (btn.parentElement) {
                btn.parentElement.remove();
            }
        });
    }

     /**
     * NUOVO: Indicatore traffico 
     */

    updateTrafficIndicator(status) {
        if (this.trafficIndicator) {
            this.trafficIndicator.renderStatus(status);
            this.trafficIndicator.show();
        }
    }
}


// Export globale
window.ReadingsVisualizerCore = ReadingsVisualizerCore;