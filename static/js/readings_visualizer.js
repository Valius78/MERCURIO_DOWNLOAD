/**
 * READINGS VISUALIZER - MAIN ENTRY POINT
 * Mantiene compatibilità totale con route esistenti tramite proxy pattern
 * 
 * NESSUNA MODIFICA RICHIESTA ALLE ROUTE O ALLE PAGINE ESISTENTI!
 */

class ReadingsVisualizerProxy {
    constructor() {
        this.core = null;
        this.initialized = false;
        this.loadingPromise = this.loadModules();
    }
    
    async loadModules() {
        try {
            const VISUALIZER_BASE = '/static/js/visualizer/';
            
            console.log('🚀 Caricamento moduli visualizer...');
            
            // 1. Utils (no dipendenze)
            await this.loadScript(`${VISUALIZER_BASE}js/utils/DateUtils.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/utils/FileUtils.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/utils/ApiClient.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/utils/TrafficIndicator.js`);
            
            // 2. Core (dipende da utils)
            await this.loadScript(`${VISUALIZER_BASE}js/core/DataManager.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/core/ModalManager.js`);
            
            // 3. Renderers (dipende da core)
            await this.loadScript(`${VISUALIZER_BASE}js/renderers/ChartRenderer.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/renderers/TableRenderer.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/renderers/ChannelRenderer.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/renderers/FileRenderer.js`);
            
            // 4. Handlers (dipende da renderers)
            await this.loadScript(`${VISUALIZER_BASE}js/handlers/EventHandlers.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/handlers/NavigationHandler.js`);
            await this.loadScript(`${VISUALIZER_BASE}js/handlers/ExportHandler.js`);
            
            // 5. Classe principale (dipende da tutto)
            await this.loadScript(`${VISUALIZER_BASE}js/core/ReadingsVisualizerCore.js`);
            
            // Inizializza core
            this.core = new ReadingsVisualizerCore();
            this.initialized = true;
            
            console.log('✅ Tutti i moduli caricati con successo!');
            
        } catch (error) {
            console.error('❌ Errore caricamento moduli:', error);
            // Fallback: mantieni funzionalità base anche se moduli falliscono
            this.initializeFallback();
        }
    }
    
    async loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }
    
    initializeFallback() {
        console.warn('⚠️ Modalità fallback attivata');
        this.initialized = false;
    }
    
    async waitForInitialization() {
        await this.loadingPromise;
        return this.initialized;
    }
    
    // ==========================================
    // METODI PROXY - COMPATIBILITÀ TOTALE
    // ==========================================
    
    async showParameterData(parameterId, parameterName) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.showParameterData(parameterId, parameterName);
        } else {
            alert('Visualizzatore non disponibile. Ricarica la pagina.');
        }
    }
    
    async showChannelData(channelId, channelName) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.showChannelData(channelId, channelName);
        } else {
            alert('Visualizzatore non disponibile. Ricarica la pagina.');
        }
    }
    
    // Proxy per eventuali altri metodi chiamati esternamente
    async exportCurrentData() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.exportHandler.exportCurrentData();
        }
    }
    
    async downloadFile(filePath, fileName) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.fileRenderer.downloadFile(filePath, fileName);
        }
    }
    
    async openFile(filePath, fileType, fileName) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.fileRenderer.openFile(filePath, fileType, fileName);
        }
    }
    
    async switchChannelTab(paramName, tabIndex) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.channelRenderer.switchChannelTab(paramName, tabIndex);
        }
    }
    
    async fetchTableData(page = 1) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.tableRenderer.fetchTableData(page);
        }
    }
    
    async backToFolderList() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.navigationHandler.backToFolderList();
        }
    }
    
    async selectAllFiles() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.fileRenderer.selectAllFiles();
        }
    }
    
    async selectNoneFiles() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.fileRenderer.selectNoneFiles();
        }
    }
    
    async toggleAllFiles() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            // Implementazione per toggle tutti i file nella tabella
            const mainCheckbox = document.getElementById('selectAllFilesCheckbox');
            const checked = mainCheckbox?.checked || false;
            
            document.querySelectorAll('.file-select').forEach(checkbox => {
                checkbox.checked = checked;
            });
            
            if (this.core.fileRenderer) {
                this.core.fileRenderer.updateSelectedCount();
            }
        }
    }
    
    async downloadSelectedFiles() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.fileRenderer.downloadSelectedFiles();
        }
    }
    
    async changeRowsPerPage(value) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.tableRenderer.changeRowsPerPage(value);
        }
    }
    
    async toggleAllFolderFiles() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.navigationHandler.toggleAllFolderFiles();
        }
    }
    
    async downloadSelectedAsZip() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.navigationHandler.downloadSelectedAsZip();
        }
    }
    
    async openChannelParameter(paramName, paramType) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.openChannelParameter(paramName, paramType);
        }
    }
    
    async backToFilesList() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.fileRenderer.backToFilesList();
        }
    }
    
    async changeRowsPerPageNavigation(value) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.navigationHandler.changeRowsPerPage(value);
        }
    }
    
    async renderMainFolders(page = 1) {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.navigationHandler.renderMainFolders(page);
        }
    }

    async backToChannelParametersList() {
        await this.waitForInitialization();
        if (this.initialized && this.core) {
            return this.core.backToChannelParametersList();
        }
    }
}

// ==========================================
// INIZIALIZZAZIONE COMPATIBILE
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    // Mantiene la stessa interfaccia per il codice esistente
    window.readingsVisualizer = new ReadingsVisualizerProxy();
    window.multiFormatVisualizer = window.readingsVisualizer; 
    
    console.log('📊 Readings Visualizer inizializzato in modalità modulare');
});

// ==========================================  
// FUNZIONI GLOBALI - COMPATIBILITÀ TOTALE
// ==========================================

window.showParameterData = function(parameterId, parameterName) {
    if (window.readingsVisualizer) {
        window.readingsVisualizer.showParameterData(parameterId, parameterName);
    } else {
        alert('Visualizzatore non pronto. Ricarica la pagina.');
    }
};

window.showChannelData = function(channelId, channelName) {
    if (window.readingsVisualizer) {
        window.readingsVisualizer.showChannelData(channelId, channelName);
    } else {
        alert('Visualizzatore non pronto. Ricarica la pagina.');
    }
};

// Export per eventuali test o debug
window.ReadingsVisualizerProxy = ReadingsVisualizerProxy;