/**
 * TABLE RENDERER - Gestione tabelle e paginazione
 * Responsabile di tutte le tabelle: parametri singoli, canali, file
 */

class TableRenderer {
    constructor(dataManager, apiClient) {
        this.dataManager = dataManager;
        this.apiClient = apiClient;
        this.tablePage = 1;
        this.tableRowsPerPage = 50;
        this.tableLoading = false;
    }
    
    /**
     * Renderizza tabella semplice parametro singolo
     */
    renderSimpleTable(readings, parameterInfo) {
        const container = document.getElementById('dataContainer');
        
        let tableHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-light">
                    <h6 class="mb-0 fw-bold">
                        <i class="fas fa-table me-2"></i> Dati Tabella
                    </h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive" style="max-height: 400px;">
                        <table class="table table-hover mb-0">
                            <thead class="table-dark sticky-top">
                                <tr>
                                    <th class="px-3"><i class="fas fa-clock me-1"></i> Timestamp</th>
                                    <th class="px-3"><i class="fas fa-hashtag me-1"></i> Valore <span id="table-unit-header">(${parameterInfo.unit || ''})</span></th>
                                </tr>
                            </thead>
                            <tbody id="readingsTableBody">
                                <tr><td colspan="2" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Caricamento dati...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div id="tablePaginationContainer" class="card-footer bg-white border-top"></div>
            </div>
        `;
        
        container.innerHTML = tableHTML;
        
        // Se abbiamo dati iniziali, renderizzali
        if (readings && readings.length > 0) {
            this.renderTableRows(readings);
        }
    }
    
    /**
     * Carica dati tabella paginata (FUNZIONALITÀ CHIAVE)
     */
    async fetchTableData(page = 1) {
        this.tablePage = page;
        
        // Anti-spam: evita chiamate sovrapposte
        if (this.tableLoading) {
            return;
        }
        this.tableLoading = true;
        
        try {
            // USA LO STESSO METODO DEL GRAFICO per consistenza
            const selectedPeriod = DateUtils.getSelectedPeriod();
            const dateRange = DateUtils.getDateRange(selectedPeriod);
            
            // Fallback se getDateRange restituisce null
            if (!dateRange.start_date || !dateRange.end_date) {
                const now = new Date();
                const lastWeek = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                dateRange.start_date = lastWeek.toISOString();
                dateRange.end_date = now.toISOString();
            }
            
            // GESTIONE CANALI: recupera parameter_id dal tab attivo
            let parameterId = this.dataManager.currentParameterId;
            
            if (this.dataManager.currentChannelId && !this.dataManager.currentParameterId) {
                const activeTab = document.querySelector('#parameterTabs .nav-link.active');
                let paramName = null;
                
                if (activeTab) {
                    paramName = activeTab.getAttribute('data-param-name');
                }
                
                // FALLBACK: usa primo parametro se tab non trovato
                if (!paramName && this.dataManager.currentData && this.dataManager.currentData.readings) {
                    const paramNames = Object.keys(this.dataManager.currentData.readings);
                    if (paramNames.length > 0) {
                        paramName = paramNames[0];
                    }
                }
                
                if (paramName) {
                    const paramData = await this.apiClient.getParameterIdFromChannel(
                        this.dataManager.currentChannelId, 
                        paramName
                    );
                    parameterId = paramData.parameter_id;
                } else {
                    throw new Error('Nessun parametro disponibile per la visualizzazione tabella');
                }
            }
            
            // Carica dati tabella
            const result = await this.apiClient.loadTableData(parameterId, {
                page: page,
                perPage: this.tableRowsPerPage,
                startDate: dateRange.start_date,
                endDate: dateRange.end_date
            });
            
            if (result.status === 'success') {
                this.renderTableRows(result.data);
                this.renderPaginationControls(result.pagination);
                
                // Aggiorna header con unità di misura
                const unitSpan = document.getElementById('table-unit-header');
                if (unitSpan) {
                    unitSpan.textContent = `(${this.dataManager.currentUnit || ''})`;
                }
            }
            
        } catch (error) {
            console.error('❌ Errore recupero dati tabella:', error);
            
            const tableBody = document.getElementById('readingsTableBody');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="2" class="text-center text-danger p-4">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            Errore: ${error.message}
                        </td>
                    </tr>
                `;
            }
        } finally {
            this.tableLoading = false;
        }
    }
    
    /**
     * Renderizza righe tabella
     */
    renderTableRows(data) {
        const tableBody = document.getElementById('readingsTableBody');
        if (!tableBody) return;
        
        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" class="text-center p-4">Nessun dato trovato per questo periodo.</td></tr>';
            return;
        }
        
        const rows = data.map((reading, index) => {
            const timeStr = DateUtils.formatTimestampLocal(reading.timestamp_utc);
            const value = reading.value !== null ? 
                Number(reading.value).toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 4}) : 'N/A';
            
            return `
                <tr class="${index % 2 === 0 ? 'table-light' : ''}">
                    <td class="px-3 font-monospace">${timeStr}</td>
                    <td class="px-3">
                        <span class="badge bg-light text-dark fs-6">${value}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        tableBody.innerHTML = rows;
    }
    
    /**
     * Renderizza controlli paginazione
     */
    renderPaginationControls(pagination) {
        const container = document.getElementById('tablePaginationContainer');
        if (!container) return;
        
        const { page, pages, total, per_page } = pagination;
        
        // Calcola range pagine da mostrare
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(pages, startPage + maxPagesToShow - 1);
        
        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        let paginationButtons = '';
        
        // Pulsante Prima Pagina
        if (page > 1) {
            paginationButtons += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.fetchTableData(1)">
                        &laquo;&laquo; Prima
                    </a>
                </li>
            `;
        }
        
        // Pulsante Precedente
        paginationButtons += `
            <li class="page-item ${page <= 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.fetchTableData(${page - 1})">
                    &laquo; Prec
                </a>
            </li>
        `;
        
        // Pagine numerate
        for (let i = startPage; i <= endPage; i++) {
            paginationButtons += `
                <li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.fetchTableData(${i})">
                        ${i}
                    </a>
                </li>
            `;
        }
        
        // Pulsante Successivo
        paginationButtons += `
            <li class="page-item ${page >= pages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.fetchTableData(${page + 1})">
                    Succ &raquo;
                </a>
            </li>
        `;
        
        // Pulsante Ultima Pagina
        if (page < pages) {
            paginationButtons += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.readingsVisualizer.fetchTableData(${pages})">
                        Ultima &raquo;&raquo;
                    </a>
                </li>
            `;
        }
        
        const html = `
            <div class="d-flex justify-content-between align-items-center mt-3 p-2 bg-light border-top">
                <div class="small text-muted">
                    Totale record: <strong>${total.toLocaleString()}</strong>
                    <span class="ms-2">Pagina ${page} di ${pages}</span>
                </div>
                
                <nav aria-label="Page navigation">
                    <ul class="pagination pagination-sm mb-0">
                        ${paginationButtons}
                    </ul>
                </nav>
                
                <div class="d-flex align-items-center">
                    <span class="small text-muted me-2">Vai a:</span>
                    <input type="number" class="form-control form-control-sm me-2" 
                           style="width: 70px;" min="1" max="${pages}" value="${page}"
                           onchange="if(this.value >= 1 && this.value <= ${pages}) window.readingsVisualizer.fetchTableData(parseInt(this.value))">
                    <span class="small text-muted me-3">/${pages}</span>
                    
                    <span class="small text-muted me-2">Righe:</span>
                    <select class="form-select form-select-sm" style="width: auto;" onchange="window.readingsVisualizer.changeRowsPerPage(this.value)">
                        <option value="50" ${per_page == 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${per_page == 100 ? 'selected' : ''}>100</option>
                        <option value="200" ${per_page == 200 ? 'selected' : ''}>200</option>
                        <option value="500" ${per_page == 500 ? 'selected' : ''}>500</option>
                    </select>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    /**
     * Cambia numero righe per pagina
     */
    changeRowsPerPage(value) {
        this.tableRowsPerPage = parseInt(value);
        this.fetchTableData(1); // Torna alla pagina 1 con il nuovo limite
    }
    
    /**
     * Renderizza tabella per files
     */
    renderFileTable(files, showParameterColumn = false) {
        const container = document.getElementById('dataContainer');
        
        if (!files || files.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nessun file trovato</div>';
            return;
        }
        
        let tableHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-light">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 fw-bold">
                            <i class="fas fa-table me-2"></i> Files (${files.length})
                        </h6>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.readingsVisualizer.selectAllFiles()">
                                <i class="fas fa-check-double"></i> Tutti
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.readingsVisualizer.selectNoneFiles()">
                                <i class="fas fa-times"></i> Nessuno
                            </button>
                        </div>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive" style="max-height: 400px;">
                        <table class="table table-hover mb-0">
                            <thead class="table-dark sticky-top">
                                <tr>
                                    <th class="px-3" style="width: 50px;">
                                        <input type="checkbox" class="form-check-input" id="selectAllFilesCheckbox" 
                                               onchange="window.readingsVisualizer.toggleAllFiles()">
                                    </th>
                                    <th class="px-3">
                                        <i class="fas fa-file me-1"></i> Nome File
                                    </th>
                                    <th class="px-3">
                                        <i class="fas fa-tag me-1"></i> Tipo
                                    </th>
                                    <th class="px-3">
                                        <i class="fas fa-clock me-1"></i> Timestamp
                                    </th>
                                    ${showParameterColumn ? '<th class="px-3"><i class="fas fa-layer-group me-1"></i> Parametro</th>' : ''}
                                    <th class="px-3" style="width: 120px;">
                                        <i class="fas fa-tools me-1"></i> Azioni
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
        `;
        
        files.forEach((file, index) => {
            const timeStr = DateUtils.formatTimestampLocal(file.timestamp);
            const typeConfig = FileUtils.getFileTypeConfig(file.type);
            
            tableHTML += `
                <tr class="${index % 2 === 0 ? 'table-light' : ''}">
                    <td class="px-3">
                        <input type="checkbox" class="form-check-input file-select" 
                               data-file-path="${file.path}" data-index="${index}">
                    </td>
                    <td class="px-3">
                        <div class="d-flex align-items-center">
                            <i class="fas ${typeConfig.icon} text-${typeConfig.color} me-2"></i>
                            <span class="text-truncate" title="${file.name}">${file.name}</span>
                        </div>
                    </td>
                    <td class="px-3">
                        <span class="badge bg-${typeConfig.color}">${file.type.toUpperCase()}</span>
                    </td>
                    <td class="px-3 font-monospace">${timeStr}</td>
                    ${showParameterColumn ? `<td class="px-3"><span class="badge bg-light text-dark">${file.parameter}</span></td>` : ''}
                    <td class="px-3">
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="window.readingsVisualizer.openFile('${file.path}', '${file.type}', '${file.name}')"
                                    title="Visualizza">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-success" 
                                    onclick="window.readingsVisualizer.downloadFile('${file.path}', '${file.name}')"
                                    title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tableHTML += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = tableHTML;
    }
    
    /**
     * Popola tabella CSV
     */
    populateCSVTable(csvData, tableId = 'csvViewerTable') {
        const table = document.getElementById(tableId);
        if (!table || !csvData.rows || !csvData.columns) return;
        
        let html = '<thead class="table-dark"><tr>';
        
        // Header
        csvData.columns.forEach(col => {
            html += `<th class="px-3">${col}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        // Righe (limita a prime 1000 per performance)
        const maxRows = Math.min(csvData.rows.length, 1000);
        for (let i = 0; i < maxRows; i++) {
            const row = csvData.rows[i];
            html += `<tr class="${i % 2 === 0 ? 'table-light' : ''}">`;
            
            csvData.columns.forEach(col => {
                const value = row[col] || '';
                html += `<td class="px-3">${String(value).substring(0, 100)}</td>`;
            });
            html += '</tr>';
        }
        
        html += '</tbody>';
        
        if (csvData.rows.length > 1000) {
            html += `<tfoot><tr><td colspan="${csvData.columns.length}" class="text-center text-muted">
                        Mostrate prime 1000 righe di ${csvData.rows.length} totali
                    </td></tr></tfoot>`;
        }
        
        table.innerHTML = html;
    }
    
    /**
     * Popola tabella JSON (key-value)
     */
    populateJSONTable(data, tableId = 'jsonTable') {
        const table = document.getElementById(tableId);
        if (!table) return;
        
        // Se è un oggetto semplice, crea tabella key-value
        if (typeof data === 'object' && !Array.isArray(data)) {
            let html = '<thead class="table-dark"><tr><th class="px-3">Campo</th><th class="px-3">Valore</th></tr></thead><tbody>';
            
            const addObjectRows = (obj, prefix = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    
                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        html += `<tr class="table-info"><td colspan="2" class="px-3 fw-bold">${fullKey}</td></tr>`;
                        addObjectRows(value, fullKey);
                    } else {
                        const displayValue = typeof value === 'string' ? value : JSON.stringify(value);
                        html += `<tr><td class="px-3 fw-bold">${key}</td><td class="px-3">${displayValue}</td></tr>`;
                    }
                }
            };
            
            addObjectRows(data);
            html += '</tbody>';
            table.innerHTML = html;
            return;
        }
        
        if (!Array.isArray(data) || data.length === 0) {
            table.innerHTML = '<tr><td class="text-center text-muted">Dati non in formato tabellare</td></tr>';
            return;
        }
        
        // Array di oggetti
        const firstItem = data[0];
        if (typeof firstItem !== 'object') {
            table.innerHTML = '<tr><td class="text-center text-muted">Array di valori semplici</td></tr>';
            return;
        }
        
        const columns = Object.keys(firstItem);
        let html = '<thead class="table-dark"><tr>';
        columns.forEach(col => {
            html += `<th class="px-3">${col}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        // Righe (max 100)
        data.slice(0, 100).forEach((item, index) => {
            html += `<tr class="${index % 2 === 0 ? 'table-light' : ''}">`;
            columns.forEach(col => {
                const value = item[col];
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value || '');
                html += `<td class="px-3">${displayValue.substring(0, 100)}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</tbody>';
        table.innerHTML = html;
    }
}

// Export globale
window.TableRenderer = TableRenderer;