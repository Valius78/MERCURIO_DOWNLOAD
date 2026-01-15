/**
 * NAVIGATION HANDLER - Gestione navigazione cartelle - UPDATED WITH UNIFIED DOWNLOAD
 * Stack di navigazione, breadcrumbs, folder browsing
 * NUOVO: Download ZIP tramite endpoint unificato streaming
 */

class NavigationHandler {
    constructor(dataManager, apiClient, fileRenderer) {
        this.dataManager = dataManager;
        this.apiClient = apiClient;
        this.fileRenderer = fileRenderer;
        
        // Stato navigazione
        this.currentFolderPath = null;
        this.currentFolderData = null;
        this.navigationStack = [];
        this.isNavigating = false;
        
        // NUOVO: Stato paginazione
        this.currentPage = 1;
        this.rowsPerPage = 50;
        this.totalRecords = 0;
        this.totalPages = 0;
    }
    
    /**
     * NUOVO: Renderizza cartelle principali con paginazione
     */
    async renderMainFolders(page = 1) {
        const container = document.getElementById('filesGrid');
        
        if (!this.dataManager.currentData || !this.dataManager.currentData.readings) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessuna cartella trovata</div></div>';
            return;
        }
        
        // CORREZIONE LOOP: Usa metodi appropriati senza loop
        if (this.dataManager.currentParameterId) {
            // Parametro singolo → usa API paginata
            await this.renderPaginatedFolders(page);
        } else if (this.dataManager.currentChannelId) {
            // Canale con file → usa renderer specifico per canali
            await this.renderChannelFileFolders(page);
        } else {
            // Fallback: mostra messaggio
            container.innerHTML = '<div class="col-12"><div class="alert alert-warning">Tipo dati non supportato per navigazione cartelle</div></div>';
        }
    }
    
    /**
     * NUOVO: Renderizza cartelle/file per canali (evita loop)
     */
    async renderChannelFileFolders(page = 1) {
        const container = document.getElementById('filesGrid');
        
        if (!this.dataManager.currentData || !this.dataManager.currentData.readings) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessun file/cartella nel canale</div></div>';
            return;
        }
        
        try {
            // Analizza i readings del canale per estrarre file/cartelle
            const fileItems = [];
            
            for (const [paramName, readings] of Object.entries(this.dataManager.currentData.readings)) {
                if (readings && readings.length > 0) {
                    const firstReading = readings[0];
                    if (FileUtils.isFilePath(firstReading.value)) {
                        const fileType = FileUtils.getFileTypeFromPath(firstReading.value);
                        fileItems.push({
                            name: paramName,
                            type: fileType,
                            count: readings.length,
                            lastUpdate: firstReading.timestamp_utc,
                            sample_path: firstReading.value
                        });
                    }
                }
            }
            
            if (fileItems.length === 0) {
                container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessun file/cartella trovato nel canale</div></div>';
                return;
            }
            
            // Render tabella file/cartelle del canale
            let html = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-header bg-primary text-white">
                            <h6 class="mb-0">
                                <i class="fas fa-layer-group me-2"></i> File/Cartelle Canale (${fileItems.length})
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
            
            fileItems.forEach((item, index) => {
                const typeConfig = FileUtils.getFileTypeConfig(item.type);
                const timeStr = DateUtils.formatTimestampLocal(item.lastUpdate);
                
                html += `
                    <tr class="${index % 2 === 0 ? 'table-light' : ''}">
                        <td class="px-3">
                            <div class="d-flex align-items-center">
                                <i class="fas ${typeConfig.icon} text-${typeConfig.color} me-2"></i>
                                <strong>${item.name}</strong>
                            </div>
                        </td>
                        <td class="px-3">
                            <span class="badge bg-${typeConfig.color}">${item.type.toUpperCase()}</span>
                        </td>
                        <td class="px-3">
                            <span class="badge bg-light text-dark">${item.count}</span>
                        </td>
                        <td class="px-3 font-monospace">${timeStr}</td>
                        <td class="px-3">
                            <button class="btn btn-primary btn-sm" 
                                    onclick="window.readingsVisualizer.openChannelParameter('${item.name}', '${item.type}')">
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
            
        } catch (error) {
            console.error('❌ Errore render channel file folders:', error);
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Errore: ${error.message}
                    </div>
                </div>
            `;
        }
    }
    
    /**
     * NUOVO: Renderizza cartelle con API paginata
     */
    async renderPaginatedFolders(page = 1) {
        const container = document.getElementById('filesGrid');
        this.currentPage = page;
        
        try {
            // Mostra loading
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="spinner-border text-primary mb-3"></div>
                    <h5>Caricamento cartelle...</h5>
                </div>
            `;
            
            // Ottieni range date dal form
            const dateRange = DateUtils.getDateRange(DateUtils.getSelectedPeriod());
            
            // Chiama API paginata
            const response = await fetch(`/api/readings/parameter/${this.dataManager.currentParameterId}/folders?` + 
                `page=${page}&per_page=${this.rowsPerPage}&` +
                `start_date=${encodeURIComponent(dateRange.start_date)}&` +
                `end_date=${encodeURIComponent(dateRange.end_date)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Aggiorna stato paginazione
            this.totalRecords = data.pagination.total;
            this.totalPages = data.pagination.pages;
            
            // Render cartelle
            this.renderFoldersTable(data.folders, data.pagination);
            
        } catch (error) {
            console.error('❌ Errore caricamento cartelle paginate:', error);
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Errore caricamento: ${error.message}
                    </div>
                </div>
            `;
        }
    }
    
    /**
     * Render tabella cartelle con paginazione
     */
    renderFoldersTable(folders, pagination) {
        const container = document.getElementById('filesGrid');
        
        let html = `
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="fas fa-folder me-2"></i> Cartelle Eventi (${pagination.total})
                            </h6>
                            ${this.dataManager.currentContext === 'channel_parameter' ? `
                                <button class="btn btn-light btn-sm" onclick="window.readingsVisualizer.backToFolderList()">
                                    <i class="fas fa-arrow-left me-1"></i> Indietro
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover mb-0">
                                <thead class="table-dark">
                                    <tr>
                                        <th class="px-3">
                                            <i class="fas fa-folder me-1"></i> Nome Cartella
                                        </th>
                                        <th class="px-3">
                                            <i class="fas fa-clock me-1"></i> Timestamp
                                        </th>
                                        <th class="px-3" style="width: 120px;">
                                            <i class="fas fa-tools me-1"></i> Azioni
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
        `;
        
        folders.forEach((folder, index) => {
            const timeStr = DateUtils.formatTimestampLocal(folder.timestamp);
            
            html += `
                <tr class="${index % 2 === 0 ? 'table-light' : ''}">
                    <td class="px-3">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-folder text-primary me-2"></i>
                            <div>
                                <strong>${folder.name}</strong>
                                <br><small class="text-muted font-monospace">${folder.path}</small>
                            </div>
                        </div>
                    </td>
                    <td class="px-3 font-monospace">${timeStr}</td>
                    <td class="px-3">
                        <button class="btn btn-primary btn-sm open-folder-btn" 
                                data-folder-path="${folder.path}">
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
                    
                    <!-- NUOVO: Controlli paginazione -->
                    ${this.renderFoldersPagination(pagination)}
                    
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        this.bindFolderEvents();
        
        // NUOVO: Aggiorna visibilità export (nascondere durante navigazione)
        if (window.readingsVisualizer && window.readingsVisualizer.core) {
            window.readingsVisualizer.core.updateExportVisibility('folder');
        }
    }
    
    /**
     * NUOVO: Render controlli paginazione cartelle
     */
    renderFoldersPagination(pagination) {
        const { page, pages, total, per_page } = pagination;
        
        if (pages <= 1) return ''; // Nessuna paginazione se solo 1 pagina
        
        // Calcola range pagine
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(pages, startPage + maxPagesToShow - 1);
        
        let paginationButtons = '';
        
        // Prima pagina
        if (page > 1) {
            paginationButtons += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.renderMainFolders(1)">
                        &laquo;&laquo;
                    </a>
                </li>
            `;
        }
        
        // Precedente
        paginationButtons += `
            <li class="page-item ${page <= 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.renderMainFolders(${page - 1})">
                    &laquo;
                </a>
            </li>
        `;
        
        // Pagine numerate
        for (let i = startPage; i <= endPage; i++) {
            paginationButtons += `
                <li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.renderMainFolders(${i})">
                        ${i}
                    </a>
                </li>
            `;
        }
        
        // Successivo
        paginationButtons += `
            <li class="page-item ${page >= pages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.renderMainFolders(${page + 1})">
                    &raquo;
                </a>
            </li>
        `;
        
        // Ultima
        if (page < pages) {
            paginationButtons += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.renderMainFolders(${pages})">
                        &raquo;&raquo;
                    </a>
                </li>
            `;
        }
        
        return `
            <div class="card-footer bg-light">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="small text-muted">
                        Cartelle: <strong>${total.toLocaleString()}</strong>
                        <span class="ms-2">Pagina ${page} di ${pages}</span>
                    </div>
                    
                    <nav aria-label="Paginazione cartelle">
                        <ul class="pagination pagination-sm mb-0">
                            ${paginationButtons}
                        </ul>
                    </nav>
                    
                    <div class="d-flex align-items-center">
                        <span class="small text-muted me-2">Per pagina:</span>
                        <select class="form-select form-select-sm" style="width: auto;" 
                                onchange="window.readingsVisualizer.changeRowsPerPageNavigation(this.value)">
                            <option value="25" ${per_page == 25 ? 'selected' : ''}>25</option>
                            <option value="50" ${per_page == 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${per_page == 100 ? 'selected' : ''}>100</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * NUOVO: Cambia righe per pagina
     */
    async changeRowsPerPage(newValue) {
        this.rowsPerPage = parseInt(newValue);
        await this.renderMainFolders(1); // Torna alla pagina 1
    }
    
    /**
     * FALLBACK: Render cartelle da readings (metodo vecchio) - ASYNC
     */
    async renderFoldersFromReadings() {
        const container = document.getElementById('filesGrid');
        
        if (!this.dataManager.currentData || !this.dataManager.currentData.readings) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessuna cartella trovata</div></div>';
            return;
        }
        
        // Se non abbiamo già caricato i contenuti, mostra le cartelle principali
        if (!this.currentFolderData) {
            await this.renderFoldersList();
        } else {
            // Mostra contenuti della cartella corrente
            this.renderFolderContents();
        }
    }
    
    /**
     * Render lista cartelle dai readings
     */
    /**
     * CORRETTO: Renderizza lista cartelle (delega alla versione paginata)
     */
    async renderFoldersList() {
        // Usa sempre la versione paginata per consistenza
        console.log('🔄 Renderizzando lista cartelle con paginazione');
        await this.renderMainFolders(this.currentPage || 1);
    }
    
    /**
     * Bind eventi per cartelle
     */
    bindFolderEvents() {
        document.querySelectorAll('.open-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const folderPath = e.target.getAttribute('data-folder-path') || 
                                  e.target.closest('.open-folder-btn')?.getAttribute('data-folder-path');
                
                if (!folderPath || folderPath === 'null') {
                    console.error('Folder path non valido:', folderPath);
                    alert('Errore: path cartella non valido');
                    return;
                }
                
                this.openFolder(folderPath);
            });
        });
    }
    
    /**
     * Apre una cartella e carica i suoi contenuti
     */
    async openFolder(folderPath) {
        try {
            console.log('📂 Aprendo cartella:', folderPath);
            
            // CORREZIONE LOGICA STACK: Salva sempre gli stati intermedi di navigazione
            const shouldSaveState = this.currentFolderPath || 
                                  (this.dataManager.currentContext === 'channel_parameter' && !this.currentFolderPath);
            
            if (shouldSaveState) {
                const stateToSave = {
                    type: this.currentFolderPath ? 'folder' : 'parameter_root',
                    folderPath: this.currentFolderPath,
                    folderData: this.currentFolderData,
                    context: this.dataManager.currentContext,
                    // NUOVO: Salva stato paginazione
                    currentPage: this.currentPage || 1,
                    rowsPerPage: this.rowsPerPage || 25
                };
                console.log('💾 Salvando stato nello stack:', stateToSave);
                this.navigationStack.push(stateToSave);
            } else {
                console.log('⏭️ Salvataggio stato saltato (non necessario)');
            }
            
            // Mostra loading
            const container = document.getElementById('filesGrid');
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;"></div>
                    <h5>Caricamento contenuti cartella...</h5>
                    <p class="text-muted">${folderPath}</p>
                </div>
            `;
            
            // Piccolo delay per evitare race conditions
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Chiama API
            const folderData = await this.apiClient.listFolderContents(folderPath);
            
            // Salva dati
            this.currentFolderPath = folderPath;
            this.currentFolderData = folderData;
            
            // Delay prima del render
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Render contenuti
            this.renderFolderContents();
            
        } catch (error) {
            console.error('❌ Errore apertura cartella:', error);
            const container = document.getElementById('filesGrid');
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Errore caricamento cartella: ${error.message}
                        <br><br>
                        <button class="btn btn-primary btn-sm" onclick="window.readingsVisualizer.backToFolderList()">
                            <i class="fas fa-arrow-left me-1"></i> Torna alla Lista
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    /**
     * Render contenuti di una cartella specifica
     */
    renderFolderContents() {
        const container = document.getElementById('filesGrid');
        
        if (!this.currentFolderData) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-warning">Nessun dato cartella</div></div>';
            return;
        }
        
        let html = `
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong><i class="fas fa-folder-open me-2"></i>${this.currentFolderPath}</strong>
                                <span class="ms-2 badge bg-light text-dark">
                                    ${this.currentFolderData.total_folders} cartelle, ${this.currentFolderData.total_files} file
                                </span>
                            </div>
                            <div class="btn-group">
                                <button class="btn btn-warning btn-sm" id="downloadSelectedFiles" 
                                        onclick="window.readingsVisualizer.downloadSelectedAsZip()">
                                    <i class="fas fa-file-archive me-1"></i> Download ZIP <span id="selectedFileCount">(0)</span>
                                </button>
                                <button class="btn btn-light btn-sm" onclick="window.readingsVisualizer.backToFolderList()">
                                    <i class="fas fa-arrow-left me-1"></i> Indietro
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body p-0">
        `;
        
        // Lista sottocartelle
        if (this.currentFolderData.folders && this.currentFolderData.folders.length > 0) {
            html += `
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-secondary">
                            <tr>
                                <th class="px-3">
                                    <i class="fas fa-folder me-1"></i> Sottocartelle
                                </th>
                                <th class="px-3" style="width: 120px;">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            this.currentFolderData.folders.forEach(folder => {
                const fullPath = this.currentFolderPath.replace(/\/$/, '') + '/' + folder;
                html += `
                    <tr class="table-light">
                        <td class="px-3">
                            <i class="fas fa-folder text-primary me-2"></i>
                            <strong>${folder}</strong>
                        </td>
                        <td class="px-3">
                            <button class="btn btn-sm btn-outline-primary open-subfolder-btn" 
                                    data-folder-path="${fullPath}">
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
            `;
        }
        
        // Lista file
        if (this.currentFolderData.files && this.currentFolderData.files.length > 0) {
            html += `
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-dark">
                            <tr>
                                <th class="px-3" style="width: 50px;">
                                    <input type="checkbox" class="form-check-input" id="selectAllFolderFiles" 
                                           onchange="window.readingsVisualizer.toggleAllFolderFiles()">
                                </th>
                                <th class="px-3"><i class="fas fa-file me-1"></i> File</th>
                                <th class="px-3">Tipo</th>
                                <th class="px-3">Dimensione</th>
                                <th class="px-3" style="width: 160px;">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            this.currentFolderData.files.forEach(file => {
                const typeConfig = FileUtils.getFileTypeConfig(file.type);
                const sizeStr = FileUtils.formatFileSize(file.size);
                
                html += `
                    <tr>
                        <td class="px-3">
                            <input type="checkbox" class="form-check-input folder-file-select" 
                                   data-file-path="${file.path}" data-file-name="${file.name}">
                        </td>
                        <td class="px-3">
                            <i class="fas ${typeConfig.icon} text-${typeConfig.color} me-2"></i>
                            ${file.name}
                        </td>
                        <td class="px-3">
                            <span class="badge bg-${typeConfig.color}">${file.type.toUpperCase()}</span>
                        </td>
                        <td class="px-3 font-monospace">${sizeStr}</td>
                        <td class="px-3">
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-primary view-file-btn" 
                                        data-file-path="${file.path}" 
                                        data-file-type="${file.type}" 
                                        data-file-name="${file.name}">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-success download-file-btn" 
                                        data-file-path="${file.path}" 
                                        data-file-name="${file.name}">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Bind eventi
        this.bindFolderContentsEvents();
        
        // NUOVO: Nascondi export quando siamo in sottocartelle
        if (window.readingsVisualizer && window.readingsVisualizer.core) {
            window.readingsVisualizer.core.updateExportVisibility('folder');
        }
    }
    
    /**
     * Bind eventi per contenuti cartella
     */
    bindFolderContentsEvents() {
        // Rimuovi listener esistenti (clona nodi per pulire)
        document.querySelectorAll('.open-subfolder-btn, .view-file-btn, .download-file-btn').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });
        
        // Eventi per aprire sottocartelle
        document.querySelectorAll('.open-subfolder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (this.isNavigating) return;
                
                const folderPath = e.target.getAttribute('data-folder-path') || 
                                  e.target.closest('button')?.getAttribute('data-folder-path');
                this.openFolder(folderPath);
            });
        });
        
        // Eventi per visualizzare file
        document.querySelectorAll('.view-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const target = e.target.closest('button') || e.target;
                const filePath = target.getAttribute('data-file-path');
                const fileType = target.getAttribute('data-file-type');
                const fileName = target.getAttribute('data-file-name');
                
                if (!filePath || filePath === 'null') {
                    alert('Path file non valido');
                    return;
                }
                
                this.fileRenderer.openFile(filePath, fileType, fileName);
            });
        });
        
        // Eventi per download file
        document.querySelectorAll('.download-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const target = e.target.closest('button') || e.target;
                const filePath = target.getAttribute('data-file-path');
                const fileName = target.getAttribute('data-file-name');
                
                if (!filePath || filePath === 'null') {
                    alert('Path file non valido');
                    return;
                }
                
                this.fileRenderer.downloadFile(filePath, fileName);
            });
        });
        
        // Eventi per checkbox selezione file
        document.querySelectorAll('.folder-file-select').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSelectedFileCount());
        });
        
        this.updateSelectedFileCount();
    }
    
    /**
     * Torna alla lista cartelle principali - ASYNC
     */
    async backToFolderList() {
        // Protezione contro click multipli
        if (this.isNavigating) {
            console.log('🚫 Navigazione in corso, click ignorato');
            return;
        }
        this.isNavigating = true;
        
        console.log('🔙 backToFolderList iniziato', {
            currentFolderPath: this.currentFolderPath,
            stackLength: this.navigationStack.length,
            currentPage: this.currentPage
        });
        
        // Nasconde TUTTI i contenitori dei visualizzatori
        document.getElementById('pdfViewerContainer').style.display = 'none';
        document.getElementById('jsonViewerContainer').style.display = 'none';
        document.getElementById('csvViewerContainer').style.display = 'none';
        
        // Mostra il contenitore della lista dei file/cartelle
        document.getElementById('filesContainer').style.display = 'block';
        
        // LOGICA: solo POP dallo stack
        if (this.navigationStack.length > 0) {
            const previousState = this.navigationStack.pop();
            console.log('🔄 POP dallo stack:', previousState);
            
            if (previousState.type === 'folder') {
                // Torna alla cartella precedente
                console.log('📁 Tornando alla cartella precedente');
                this.currentFolderPath = previousState.folderPath;
                this.currentFolderData = previousState.folderData;
                this.dataManager.currentContext = previousState.context;
                this.renderFolderContents();
                
                // CORREZIONE: RETURN per evitare esecuzione blocchi successivi
                this.isNavigating = false;
                return;
                
            } else if (previousState.type === 'parameter_root') {
                // Torna alle cartelle radici del parametro
                console.log('📋 Tornando alle cartelle root del parametro');
                this.currentFolderPath = null;
                this.currentFolderData = null;
                this.dataManager.currentContext = previousState.context;
                
                // NUOVO: Ripristina stato paginazione
                if (previousState.currentPage) {
                    this.currentPage = previousState.currentPage;
                }
                if (previousState.rowsPerPage) {
                    this.rowsPerPage = previousState.rowsPerPage;
                }
                
                console.log(`🔄 Tornando alle cartelle root (pagina ${this.currentPage})`);
                await this.renderFoldersList();
                
                // CORREZIONE: RETURN per evitare esecuzione blocchi successivi
                this.isNavigating = false;
                return;
            } else if (previousState.type === 'channel') {
                // Torna al canale (gestito dal core)
                console.log('📺 Tornando alla lista parametri canale');
                this.dataManager.currentData = previousState.data;
                this.dataManager.currentChannelId = previousState.channelId;
                this.dataManager.currentParameterId = null;
                this.dataManager.currentContext = null;
                this.currentFolderPath = null;
                this.currentFolderData = null;
                
                // CORREZIONE: Mostra il contenitore corretto e renderizza lista parametri canale
                document.getElementById('numericContainer').style.display = 'none';
                document.getElementById('filesContainer').style.display = 'block';
                
                // Renderizza la lista parametri canale usando il metodo locale
                await this.renderChannelFileFolders(1);
                
                // Rimostra controlli periodo
                const periodControls = document.querySelector('.col-lg-4.col-md-6');
                if (periodControls) periodControls.style.display = 'block';
                
                // CORREZIONE: RETURN per evitare esecuzione del blocco else!
                this.isNavigating = false;
                return;
            }
        } else {
            // Se non c'è stack, torna alle cartelle principali
            console.log('📝 Stack vuoto, torna alle cartelle principali');
            this.currentFolderPath = null;
            this.currentFolderData = null;
            await this.renderFoldersList();
            
            // Se siamo in un parametro singolo, rimostra sempre i controlli
            if (this.dataManager.currentParameterId && !this.dataManager.currentChannelId) {
                const periodControls = document.querySelector('.col-lg-4.col-md-6');
                if (periodControls) periodControls.style.display = 'block';
            }
        }
        
        // NUOVO: Aggiorna visibilità export in base al livello di navigazione
        if (window.readingsVisualizer && window.readingsVisualizer.core) {
            const isAtRoot = !this.currentFolderPath && !this.currentFolderData;
            const contentType = isAtRoot ? 'folder' : 'folder'; // Sempre folder per cartelle
            window.readingsVisualizer.core.updateExportVisibility(contentType);
        }
        
        // Rilascia il lock
        setTimeout(() => {
            this.isNavigating = false;
        }, 500);
    }
    
    /**
     * Download file selezionati come ZIP tramite endpoint unificato
     */
    async downloadSelectedAsZip() {
        const selectedFiles = Array.from(document.querySelectorAll('.folder-file-select:checked'))
            .map(cb => cb.getAttribute('data-file-path'));
        
        if (selectedFiles.length === 0) {
            alert('Seleziona almeno un file');
            return;
        }
        
        try {
            console.log(`📤 Download ZIP: ${selectedFiles.length} file selezionati`);
            
            // Nome ZIP basato sulla cartella evento
            const folderName = this.currentFolderPath.split('/').pop() || 'files';
            const zipName = `${folderName}.zip`;
            
            // NUOVO: Usa endpoint unificato per ZIP streaming
            const params = new URLSearchParams();
            selectedFiles.forEach(path => params.append('file_paths', path));
            params.append('zip_name', zipName);
            
            const downloadUrl = `/api/download/files/0?${params.toString()}`;
            
            console.log(`🔗 ZIP Download URL: ${downloadUrl}`);
            
            // Mostra indicatore di download
            const downloadBtn = document.getElementById('downloadSelectedFiles');
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Creazione ZIP...';
            }
            
            // Trigger download
            const response = await fetch(downloadUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            
            // Download diretto del browser
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log(`✅ ZIP download completato: ${zipName}`);
            
        } catch (error) {
            console.error('❌ Errore download ZIP:', error);
            alert('Errore nel download ZIP: ' + error.message);
        } finally {
            // Reset pulsante
            const downloadBtn = document.getElementById('downloadSelectedFiles');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<i class="fas fa-file-archive me-1"></i> Download ZIP <span id="selectedFileCount">(0)</span>';
            }
        }
    }
    
    /**
     * Toggle tutti i file della cartella
     */
    toggleAllFolderFiles() {
        const mainCheckbox = document.getElementById('selectAllFolderFiles');
        const checked = mainCheckbox?.checked || false;
        
        document.querySelectorAll('.folder-file-select').forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        this.updateSelectedFileCount();
    }
    
    /**
     * Aggiorna contatore file selezionati
     */
    updateSelectedFileCount() {
        const selected = document.querySelectorAll('.folder-file-select:checked').length;
        const counter = document.getElementById('selectedFileCount');
        if (counter) {
            counter.textContent = `(${selected})`;
        }
        
        // Abilita/disabilita pulsante download
        const downloadBtn = document.getElementById('downloadSelectedFiles');
        if (downloadBtn) {
            downloadBtn.disabled = selected === 0;
            downloadBtn.className = selected > 0 ? 'btn btn-warning btn-sm' : 'btn btn-secondary btn-sm';
        }
    }
    
    /**
     * Cleanup stato navigazione
     */
    cleanup() {
        this.currentFolderPath = null;
        this.currentFolderData = null;
        this.navigationStack = [];
        this.isNavigating = false;
    }
}

// Export globale
window.NavigationHandler = NavigationHandler;