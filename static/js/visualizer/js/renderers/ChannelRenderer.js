/**
 * CHANNEL RENDERER - Gestione tab canali e switching
 * Il cuore della funzionalità canali: tab colorati + tabella paginata
 */

class ChannelRenderer {
    constructor(dataManager, apiClient, tableRenderer) {
        this.dataManager = dataManager;
        this.apiClient = apiClient;
        this.tableRenderer = tableRenderer;
        this.colors = this.getParameterColors();
    }
    
    /**
     * Ottiene colori per parametri
     */
    getParameterColors() {
        return {
            hex: [
                '#e74c3c', '#3498db', '#f39c12', '#2ecc71', 
                '#9b59b6', '#1abc9c', '#34495e', '#e67e22'
            ],
            bootstrap: [
                'danger', 'primary', 'warning', 'success', 
                'secondary', 'info', 'dark', 'orange'
            ]
        };
    }
    
    /**
     * Renderizza tabella canale classica (tab con mini-tabelle)
     */
    renderChannelTable(readingsByParameter, channelInfo) {
        const container = document.getElementById('dataContainer');
        
        if (!readingsByParameter || Object.keys(readingsByParameter).length === 0) {
            container.innerHTML = `
                <div class="alert alert-info border-0 shadow-sm">
                    <i class="fas fa-info-circle me-2"></i> 
                    Nessun dato trovato per questo canale nel periodo selezionato.
                </div>
            `;
            return;
        }
        
        let tabsHTML = this.createChannelTabsHTML(readingsByParameter, channelInfo, 'classic');
        container.innerHTML = tabsHTML;
        
        // Aggiungi event listener per gestire cambio colori sui tab
        setTimeout(() => {
            this.bindTabColorEvents();
        }, 100);
    }
    
    /**
     * Renderizza tab canali + tabella paginata (NUOVA FUNZIONALITÀ)
     */
    renderChannelTabsWithPagination(readingsByParameter, channelInfo) {
        const container = document.getElementById('dataContainer');
        
        if (!readingsByParameter || Object.keys(readingsByParameter).length === 0) {
            container.innerHTML = `
                <div class="alert alert-info border-0 shadow-sm">
                    <i class="fas fa-info-circle me-2"></i> 
                    Nessun dato trovato per questo canale nel periodo selezionato.
                </div>
            `;
            return;
        }
        
        let html = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-light">
                    <h6 class="mb-0 fw-bold">
                        <i class="fas fa-layer-group me-2"></i> Canale: ${channelInfo.name}
                    </h6>
                </div>
                <div class="card-body p-0">
                    <ul class="nav nav-pills nav-fill m-3 mb-0" id="parameterTabs" role="tablist">
        `;
        
        let tabIndex = 0;
        for (const [paramName, readings] of Object.entries(readingsByParameter)) {
            const isActive = tabIndex === 0 ? 'active' : '';
            const color = this.colors.bootstrap[tabIndex % this.colors.bootstrap.length];
            
            html += `
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isActive} ${isActive ? 'text-white' : 'text-' + color}" 
                            id="param-tab-${tabIndex}" 
                            data-param-name="${paramName}"
                            data-tab-index="${tabIndex}"
                            type="button" role="tab" style="border-radius: 8px;"
                            onclick="window.readingsVisualizer.switchChannelTab('${paramName}', ${tabIndex})">
                        <i class="fas fa-chart-line me-1"></i>
                        ${paramName}
                    </button>
                </li>
            `;
            tabIndex++;
        }
        
        html += `
                    </ul>
                    <div class="p-3">
                        <div class="card border-0 shadow-sm">
                            <div class="card-header bg-light">
                                <h6 class="mb-0 fw-bold">
                                    <i class="fas fa-table me-2"></i> Dati Tabella
                                    <span id="activeParameterName" class="badge bg-primary ms-2"></span>
                                </h6>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive" style="max-height: 400px;">
                                    <table class="table table-hover mb-0">
                                        <thead class="table-dark sticky-top">
                                            <tr>
                                                <th class="px-3"><i class="fas fa-clock me-1"></i> Timestamp</th>
                                                <th class="px-3"><i class="fas fa-hashtag me-1"></i> Valore <span id="table-unit-header">()</span></th>
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
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Imposta il nome del primo parametro come attivo
        const firstParamName = Object.keys(readingsByParameter)[0];
        const activeNameElement = document.getElementById('activeParameterName');
        if (activeNameElement) {
            activeNameElement.textContent = firstParamName;
        }
        
        // Carica i dati del primo parametro
        this.switchChannelTab(firstParamName, 0);
    }
    
    /**
     * Cambia tab del canale e aggiorna tabella (FUNZIONALITÀ CHIAVE)
     */
    async switchChannelTab(paramName, tabIndex) {
        try {
            console.log(`🔄 Switching to tab: ${paramName} (index: ${tabIndex})`);
            
            // Aggiorna colori tab
            this.updateChannelTabColors(tabIndex);
            
            // Aggiorna nome parametro attivo
            const activeNameElement = document.getElementById('activeParameterName');
            if (activeNameElement) {
                activeNameElement.textContent = paramName;
            }
            
            // Chiama API per ottenere parameter_id
            const paramData = await this.apiClient.getParameterIdFromChannel(
                this.dataManager.currentChannelId, 
                paramName
            );
            
            if (paramData && paramData.parameter_id) {
                // Temporaneamente imposta currentParameterId per fetchTableData
                const originalParameterId = this.dataManager.currentParameterId;
                this.dataManager.currentParameterId = paramData.parameter_id;
                this.dataManager.currentUnit = paramData.unit;
                
                // Carica dati tabella tramite TableRenderer
                await this.tableRenderer.fetchTableData(1);
                
                // Ripristina originalParameterId
                this.dataManager.currentParameterId = originalParameterId;
                
                console.log(`✅ Tab ${paramName} caricato con successo`);
            } else {
                throw new Error(`Impossibile trovare ID del parametro ${paramName}`);
            }
            
        } catch (error) {
            console.error('❌ Errore switch channel tab:', error);
            
            // Mostra errore in tabella
            const tableBody = document.getElementById('readingsTableBody');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="2" class="text-center text-danger p-4">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            Errore caricamento dati: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }
    }
    
    /**
     * Aggiorna colori tab canale
     */
    updateChannelTabColors(activeTabIndex) {
        const tabs = document.querySelectorAll('#parameterTabs .nav-link');
        
        tabs.forEach((tab, index) => {
            const color = this.colors.bootstrap[index % this.colors.bootstrap.length];
            const badge = tab.querySelector('.badge');
            
            // Reset classi
            tab.classList.remove('active', 'text-white', `text-${color}`);
            
            if (index === activeTabIndex) {
                // Tab attivo
                tab.classList.add('active', 'text-white');
                if (badge) badge.className = 'badge bg-light text-dark ms-1';
            } else {
                // Tab inattivo
                tab.classList.add(`text-${color}`);
                if (badge) badge.className = `badge bg-${color} ms-1`;
            }
        });
    }
    
    /**
     * Crea HTML per tab canali
     */
    createChannelTabsHTML(readingsByParameter, channelInfo, mode = 'classic') {
        let html = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-light">
                    <h6 class="mb-0 fw-bold">
                        <i class="fas fa-layer-group me-2"></i> Dati Canale: ${channelInfo.name}
                    </h6>
                </div>
                <div class="card-body p-0">
                    <ul class="nav nav-pills nav-fill m-3 mb-0" id="parameterTabs" role="tablist">
        `;
        
        let tabIndex = 0;
        for (const [paramName, readings] of Object.entries(readingsByParameter)) {
            const isActive = tabIndex === 0 ? 'active' : '';
            const color = this.colors.bootstrap[tabIndex % this.colors.bootstrap.length];
            
            html += `
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isActive} ${isActive ? 'text-white' : 'text-' + color}" 
                            id="param-tab-${tabIndex}" 
                            data-bs-toggle="tab" data-bs-target="#param-content-${tabIndex}" 
                            data-param-name="${paramName}"
                            type="button" role="tab" style="border-radius: 8px;">
                        <i class="fas fa-chart-line me-1"></i>
                        ${paramName}
                    </button>
                </li>
            `;
            tabIndex++;
        }
        
        html += `</ul>`;
        
        // Se è modalità classica, aggiungi contenuto tab
        if (mode === 'classic') {
            html += `<div class="tab-content p-3" id="parameterTabContent">`;
            
            tabIndex = 0;
            for (const [paramName, readings] of Object.entries(readingsByParameter)) {
                const isActive = tabIndex === 0 ? 'show active' : '';
                
                html += `
                    <div class="tab-pane fade ${isActive}" id="param-content-${tabIndex}" role="tabpanel">
                        <div class="table-responsive" style="max-height: 400px;">
                            <table class="table table-hover mb-0">
                                <thead class="table-dark sticky-top">
                                    <tr>
                                        <th class="px-3"><i class="fas fa-clock me-1"></i> Timestamp</th>
                                        <th class="px-3"><i class="fas fa-hashtag me-1"></i> Valore</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                readings.forEach((reading, index) => {
                    const timeStr = DateUtils.formatTimestampLocal(reading.timestamp_utc);
                    
                    html += `
                        <tr class="${index % 2 === 0 ? 'table-light' : ''}">
                            <td class="px-3 font-monospace">${timeStr}</td>
                            <td class="px-3">
                                <span class="badge bg-light text-dark fs-6">${reading.value}</span>
                            </td>
                        </tr>
                    `;
                });
                
                html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                tabIndex++;
            }
            
            html += `</div>`;
        }
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }
    
    /**
     * Bind eventi per cambio colori tab
     */
    bindTabColorEvents() {
        const tabButtons = document.querySelectorAll('#parameterTabs button[data-bs-toggle="tab"]');
        
        tabButtons.forEach((button, index) => {
            button.addEventListener('shown.bs.tab', () => {
                // Reset tutti i tab ai colori inattivi
                tabButtons.forEach((btn, btnIndex) => {
                    const color = this.colors.bootstrap[btnIndex % this.colors.bootstrap.length];
                    
                    // Rimuovi classi text
                    btn.classList.remove('text-white', `text-${color}`);
                    
                    // Badge - trova e aggiorna
                    const badge = btn.querySelector('.badge');
                    if (badge) {
                        badge.className = `badge bg-${color} ms-1`;
                    }
                    
                    // Aggiungi classe text appropriata
                    btn.classList.add(`text-${color}`);
                });
                
                // Imposta il tab attivo con colori corretti
                button.classList.remove(`text-${this.colors.bootstrap[index % this.colors.bootstrap.length]}`);
                button.classList.add('text-white');
                
                const activeBadge = button.querySelector('.badge');
                if (activeBadge) {
                    activeBadge.className = 'badge bg-light text-dark ms-1';
                }
            });
        });
    }
}

// Export globale
window.ChannelRenderer = ChannelRenderer;