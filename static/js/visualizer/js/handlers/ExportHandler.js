/**
 * EXPORT HANDLER - Gestione export e download - UPDATED WITH UNIFIED STREAMING
 * CSV export, statistiche, download multipli
 * NUOVO: Endpoint unificato streaming per tutti i download
 */

class ExportHandler {
    constructor(dataManager, apiClient) {
        this.dataManager = dataManager;
        this.apiClient = apiClient;
    }
    
    /**
     * Esporta dati correnti tramite endpoint unificato (VERSIONE STREAMING)
     */
    async exportCurrentData() {
        if (!this.dataManager.currentData) {
            alert('Nessun dato da esportare');
            return;
        }
        
        try {
            if (this.dataManager.currentParameterId) {
                // Export parametro singolo via endpoint unificato
                await this.exportViaUnifiedEndpoint('parameter', this.dataManager.currentParameterId);
            } else if (this.dataManager.currentChannelId) {
                // Export canale via endpoint unificato
                await this.exportViaUnifiedEndpoint('channel', this.dataManager.currentChannelId);
            } else {
                alert('Tipo di dati non supportato per export');
            }
        } catch (error) {
            console.error('❌ Errore export:', error);
            alert('Errore durante l\'export: ' + error.message);
        }
    }
    
    /**
     * NUOVO: Export tramite endpoint unificato streaming
     */
    async exportViaUnifiedEndpoint(itemType, itemId) {
        try {
            console.log(`📤 Export streaming: ${itemType}/${itemId}`);
            
            // Ottieni range date dal form
            const selectedPeriod = DateUtils.getSelectedPeriod();
            const dateRange = DateUtils.getDateRange(selectedPeriod);
            
            // Costruisci URL endpoint unificato
            const params = new URLSearchParams({
                start_date: dateRange.start_date || '',
                end_date: dateRange.end_date || ''
            });
            
            const downloadUrl = `/api/download/${itemType}/${itemId}?${params.toString()}`;
            
            console.log(`🔗 Download URL: ${downloadUrl}`);
            
            // Mostra indicatore di download
            this.showDownloadIndicator(true);
            
            try {
                // Trigger download diretto del browser
                const response = await fetch(downloadUrl);
                
                // *** NUOVA GESTIONE ERRORE TRAFFICO ***
                if (response.status === 429) {
                    const errorData = await response.json();
                    console.warn('⚠️ Traffico limite superato:', errorData);
                    
                    // Delega gestione errore ad ApiClient se disponibile
                    if (window.readingsVisualizer && window.readingsVisualizer.apiClient && 
                        typeof window.readingsVisualizer.apiClient.handleTrafficLimitError === 'function') {
                        window.readingsVisualizer.apiClient.handleTrafficLimitError(errorData);
                    } else {
                        // Fallback: mostra alert semplice
                        alert(`Limite traffico superato: ${errorData.message}\n\nDisponibile: ${errorData.usage_mb}/${errorData.limit_mb} MB\nReset: ${errorData.reset_time}`);
                    }
                    
                    return; // Stop qui, non procedere con download
                }
                // *** FINE NUOVA GESTIONE ***
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Leggi response come blob per download
                const blob = await response.blob();
                
                // Estrai filename dal header Content-Disposition
                let filename = `${itemType}_${itemId}_export.csv`;
                const contentDisposition = response.headers.get('Content-Disposition');
                if (contentDisposition) {
                    const matches = contentDisposition.match(/filename="([^"]+)"/);
                    if (matches && matches[1]) {
                        filename = matches[1];
                    }
                }
                
                // Trigger download
                this.triggerBrowserDownload(blob, filename);
                
                console.log(`✅ Export completato: ${filename}`);
                
                // *** NUOVA: Aggiorna status traffico dopo download riuscito ***
                this.updateTrafficStatusAfterDownload();
                
            } catch (fetchError) {
                console.error('❌ Errore fetch download:', fetchError);
                
                // Fallback: apri in nuova finestra
                console.log('⚠️ Fallback: apertura in nuova finestra');
                window.open(downloadUrl, '_blank');
            }
            
        } catch (error) {
            console.error('❌ Errore export unificato:', error);
            throw error;
        } finally {
            this.showDownloadIndicator(false);
            
            // *** NUOVA: Aggiorna status dopo tentativo ***
            setTimeout(() => {
                this.updateTrafficStatusAfterDownload();
            }, 1000);
        }
    }
    
    /**
     * NUOVO: Mostra indicatore di download
     */
    showDownloadIndicator(show) {
        const exportBtn = document.getElementById('exportData');
        
        if (show) {
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Download...';
            }
            
            // Mostra toast/notification se disponibile
            this.showToast('📥 Download avviato...', 'info');
            
        } else {
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-download me-1"></i> Esporta CSV';
            }
        }
    }
    
    /**
     * NUOVO: Trigger download via browser
     */
    triggerBrowserDownload(blob, filename) {
        try {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            link.style.display = 'none';
            link.href = url;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            document.body.removeChild(link);
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            
            this.showToast('✅ File scaricato con successo', 'success');
            
        } catch (error) {
            console.error('❌ Errore trigger download:', error);
            throw error;
        }
    }
    
    /**
     * NUOVO: Mostra toast notification
     */
    showToast(message, type = 'info') {
        // Implementazione semplice - puoi migliorare con libreria toast
        const toastId = 'export-toast-' + Date.now();
        const toastHTML = `
            <div id="${toastId}" class="position-fixed top-0 end-0 p-3" style="z-index: 9999;">
                <div class="toast show" role="alert">
                    <div class="toast-header">
                        <i class="fas fa-download text-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'} me-2"></i>
                        <strong class="me-auto">Export</strong>
                        <button type="button" class="btn-close" onclick="document.getElementById('${toastId}').remove()"></button>
                    </div>
                    <div class="toast-body">${message}</div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', toastHTML);
        
        // Auto-remove dopo 3 secondi
        setTimeout(() => {
            const toast = document.getElementById(toastId);
            if (toast) toast.remove();
        }, 3000);
    }
    
    /**
     * NUOVO: Export file multipli tramite endpoint unificato
     */
    async exportMultipleFiles(filePaths, zipName = 'files.zip') {
        try {
            console.log(`📤 Export ZIP: ${filePaths.length} file`);
            
            // Costruisci parametri per file multipli
            const params = new URLSearchParams();
            filePaths.forEach(path => params.append('file_paths', path));
            params.append('zip_name', zipName);
            
            const downloadUrl = `/api/download/files/0?${params.toString()}`;
            
            this.showDownloadIndicator(true);
            
            // Trigger download
            const response = await fetch(downloadUrl);
            
            // *** GESTIONE ERRORE TRAFFICO per ZIP ***
            if (response.status === 429) {
                const errorData = await response.json();
                console.warn('⚠️ ZIP download - traffico limite superato:', errorData);
                
                // Delega gestione errore ad ApiClient
                if (window.readingsVisualizer && window.readingsVisualizer.apiClient && 
                    typeof window.readingsVisualizer.apiClient.handleTrafficLimitError === 'function') {
                    window.readingsVisualizer.apiClient.handleTrafficLimitError(errorData);
                } else {
                    alert(`Limite traffico superato per ZIP: ${errorData.message}`);
                }
                
                return; // Stop qui
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            this.triggerBrowserDownload(blob, zipName);
            
            console.log(`✅ Export ZIP completato: ${zipName}`);
            
            // *** Aggiorna status traffico ***
            this.updateTrafficStatusAfterDownload();
            
        } catch (error) {
            console.error('❌ Errore export ZIP:', error);
            throw error;
        } finally {
            this.showDownloadIndicator(false);
            
            // Aggiorna status dopo tentativo
            setTimeout(() => {
                this.updateTrafficStatusAfterDownload();
            }, 1000);
        }
    }


    /**
     * NUOVO: Aggiorna status traffico dopo download
     */
    async updateTrafficStatusAfterDownload() {
        try {
            if (window.readingsVisualizerTrafficIndicator) {
                await window.readingsVisualizerTrafficIndicator.updateStatusNow();
            } else {
                console.warn('Traffic Indicator non disponibile per aggiornamento');
            }
        } catch (error) {
            console.error('Errore aggiornamento status traffico:', error);
        }
    }
    
    // =================================================================
    // METODI LEGACY - MANTENUTI PER BACKWARD COMPATIBILITY
    // =================================================================
    
    /**
     * Export parametro singolo con dati completi dal DB (LEGACY - deprecato)
     */
    async exportParameterDataFull() {
        console.warn('⚠️ Usando metodo legacy exportParameterDataFull - considera migrazione a exportViaUnifiedEndpoint');
        
        try {
            // Usa lo stesso range date del visualizzatore
            const selectedPeriod = DateUtils.getSelectedPeriod();
            const dateRange = DateUtils.getDateRange(selectedPeriod);
            
            console.log('📤 Exportando dati completi parametro:', this.dataManager.currentParameterId);
            
            // Chiama endpoint dedicato per export completo
            const exportUrl = `/api/readings/parameter/${this.dataManager.currentParameterId}/export?` + 
                            `start_date=${encodeURIComponent(dateRange.start_date)}&` +
                            `end_date=${encodeURIComponent(dateRange.end_date)}`;
            
            const response = await fetch(exportUrl);
            
            // *** AGGIUNGI GESTIONE ERRORE TRAFFICO ***
            if (response.status === 429) {
                const errorData = await response.json();
                console.warn('⚠️ Parameter export - traffico limite superato:', errorData);
                
                if (window.readingsVisualizer && window.readingsVisualizer.apiClient && 
                    typeof window.readingsVisualizer.apiClient.handleTrafficLimitError === 'function') {
                    window.readingsVisualizer.apiClient.handleTrafficLimitError(errorData);
                } else {
                    alert(`Limite traffico superato: ${errorData.message}`);
                }
                
                return; // Stop export
            }
            // *** FINE GESTIONE TRAFFICO ***
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const exportData = await response.json();
            
            // Genera CSV con TUTTI i dati
            const csv = this.generateParameterCSV(exportData);
            const filename = `parameter_${this.dataManager.currentParameterId}_full_export.csv`;
            
            this.downloadCSV(csv, filename);
            
            console.log(`✅ Export completato: ${exportData.readings.length} record esportati`);
            
            // *** AGGIORNA STATUS TRAFFICO ***
            this.updateTrafficStatusAfterDownload();
            
        } catch (error) {
            console.error('❌ Errore export parametro completo:', error);
            throw error;
        }
    }
    
    /**
     * Export canale multi-parametro con dati completi - CORRETTO + FALLBACK (LEGACY - deprecato)
     */
    async exportChannelDataFull() {
        console.warn('⚠️ Usando metodo legacy exportChannelDataFull - considera migrazione a exportViaUnifiedEndpoint');
        
        if (!this.dataManager.currentChannelId) {
            alert('Nessun canale selezionato per export');
            return;
        }
        
        try {
            console.log(`📤 Export completo canale ${this.dataManager.currentChannelId}...`);
            
            // Ottieni range date dal form
            const dateRange = DateUtils.getDateRange(DateUtils.getSelectedPeriod());
            
            // Prova prima il nuovo endpoint export dedicato
            const exportUrl = `/api/readings/channel/${this.dataManager.currentChannelId}/export?` +
                `start_date=${encodeURIComponent(dateRange.start_date)}&` +
                `end_date=${encodeURIComponent(dateRange.end_date)}`;
            
            console.log(`🔗 Tentativo API export: ${exportUrl}`);
            
            const response = await fetch(exportUrl);
            
            // *** AGGIUNGI GESTIONE ERRORE TRAFFICO ***
            if (response.status === 429) {
                const errorData = await response.json();
                console.warn('⚠️ Channel export - traffico limite superato:', errorData);
                
                if (window.readingsVisualizer && window.readingsVisualizer.apiClient && 
                    typeof window.readingsVisualizer.apiClient.handleTrafficLimitError === 'function') {
                    window.readingsVisualizer.apiClient.handleTrafficLimitError(errorData);
                } else {
                    alert(`Limite traffico superato: ${errorData.message}`);
                }
                
                return; // Stop export
            }
            // *** FINE GESTIONE TRAFFICO ***
            
            if (response.ok) {
                // Nuovo endpoint funziona - download diretto CSV
                console.log('✅ Usando nuovo endpoint export');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                
                let filename = `channel_${this.dataManager.currentChannelId}_export.csv`;
                const contentDisposition = response.headers.get('Content-Disposition');
                if (contentDisposition) {
                    const matches = contentDisposition.match(/filename="([^"]+)"/);
                    if (matches) {
                        filename = matches[1];
                    }
                }
                
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                console.log(`✅ Export canale completato: ${filename}`);
                
                // *** AGGIORNA STATUS TRAFFICO ***
                this.updateTrafficStatusAfterDownload();
                
            } else {
                // Fallback al metodo esistente
                console.log('⚠️ Endpoint export non disponibile, usando fallback');
                const csv = this.exportChannelDataLegacy();
                const filename = `channel_${this.dataManager.currentChannelId}_readings.csv`;
                this.downloadCSV(csv, filename);
            }
            
        } catch (error) {
            console.error('❌ Errore export canale:', error);
            // Fallback in caso di errore
            console.log('⚠️ Errore API, usando fallback');
            try {
                const csv = this.exportChannelDataLegacy();
                const filename = `channel_${this.dataManager.currentChannelId}_readings.csv`;
                this.downloadCSV(csv, filename);
            } catch (fallbackError) {
                alert('Errore durante l\'export: ' + error.message);
            }
        }
    }
    
    /**
     * Genera CSV da dati completi parametro (LEGACY)
     */
    generateParameterCSV(exportData) {
        console.warn('⚠️ Generazione CSV lato client - considera migrazione a streaming');
        
        const info = exportData.parameter_info;
        const readings = exportData.readings;
        
        let csv = '';
        
        // Header informativo
        csv += `Scenario Name,"${info.scenario_name || ''}"\n`;
        csv += `Area Name,"${info.area_name || ''}"\n`;
        csv += `Item Name,"${info.item_name || ''}"\n`;
        csv += `Channel Name,"${info.channel_name || ''}"\n`;
        csv += `Parameter Name,"${info.name || ''}"\n`;
        csv += `Parameter Code,"${info.parameter_code || ''}"\n`;
        csv += `Unit,"${info.unit || ''}"\n`;
        csv += `Total Records,${exportData.export_info.total_records}\n`;
        csv += `Export Date,"${new Date().toISOString()}"\n`;
        csv += `Period Start,"${exportData.export_info.period_start}"\n`;
        csv += `Period End,"${exportData.export_info.period_end}"\n\n`;
        
        // Header dati
        csv += 'Timestamp,Value\n';
        
        // Tutti i dati (non sottocampionati)
        readings.forEach(reading => {
            const timestamp = reading.timestamp_utc;
            const value = reading.value;
            csv += `"${timestamp}","${value}"\n`;
        });
        
        return csv;
    }
    
    /**
     * FALLBACK: Export canale legacy
     */
    exportChannelDataLegacy() {
        console.warn('⚠️ Export canale legacy - potrebbe essere sottocampionato');
        
        const data = this.dataManager.currentData;
        const info = data.channel_info || {};
        
        let csv = '';
        
        // Header informativo
        csv += `# Canale: ${info.name || ''} (${info.code || ''})\n`;
        csv += `# Scenario: ${info.scenario_name || ''}\n`;
        csv += `# Area: ${info.area_name || ''}\n`;
        csv += `# Item: ${info.item_name || ''}\n`;
        csv += `# Export Date: ${new Date().toISOString()}\n`;
        csv += `# NOTA: Dati visualizzati correnti (potrebbero essere sottocampionati)\n\n`;
        
        // Organizza per timestamp (formato colonne)
        const dataByTimestamp = {};
        const paramNames = Object.keys(data.readings || {});
        
        for (const [paramName, readings] of Object.entries(data.readings || {})) {
            readings.forEach(reading => {
                const ts = reading.timestamp_utc;
                if (!dataByTimestamp[ts]) {
                    dataByTimestamp[ts] = {};
                }
                dataByTimestamp[ts][paramName] = reading.value;
            });
        }
        
        // Header CSV
        csv += ['Timestamp', ...paramNames].join(',') + '\n';
        
        // Righe dati
        const sortedTimestamps = Object.keys(dataByTimestamp).sort().reverse();
        sortedTimestamps.forEach(timestamp => {
            const row = [timestamp];
            paramNames.forEach(paramName => {
                const value = dataByTimestamp[timestamp][paramName] || '';
                row.push(value);
            });
            csv += row.join(',') + '\n';
        });
        
        return csv;
    }
    
    /**
     * Download CSV (LEGACY)
     */
    downloadCSV(csvContent, filename) {
        console.warn('⚠️ Download CSV legacy - considera migrazione a streaming');
        
        try {
            // Aggiungi BOM per compatibilità Excel
            const bom = '\uFEFF';
            const csvWithBom = bom + csvContent;
            
            const blob = new Blob([csvWithBom], { 
                type: 'text/csv;charset=utf-8;' 
            });
            
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup URL
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                
                console.log(`✅ Export completato: ${filename}`);
            } else {
                throw new Error('Download non supportato dal browser');
            }
        } catch (error) {
            console.error('❌ Errore export CSV:', error);
            alert('Errore durante l\'export: ' + error.message);
        }
    }
    
    // =================================================================
    // ALTRI METODI UTILI
    // =================================================================
    
    /**
     * Esporta statistiche come JSON
     */
    exportStatistics() {
        const stats = this.dataManager.getStats();
        
        if (!stats) {
            alert('Nessuna statistica disponibile');
            return;
        }
        
        const exportData = {
            export_info: {
                export_date: new Date().toISOString(),
                data_type: this.dataManager.currentContext,
                parameter_id: this.dataManager.currentParameterId,
                channel_id: this.dataManager.currentChannelId
            },
            statistics: stats,
            data_info: {
                parameter_info: this.dataManager.currentData.parameter_info,
                channel_info: this.dataManager.currentData.channel_info
            }
        };
        
        const jsonContent = JSON.stringify(exportData, null, 2);
        this.downloadJSON(jsonContent, 'statistics_export.json');
    }
    
    /**
     * Download JSON
     */
    downloadJSON(jsonContent, filename) {
        try {
            const blob = new Blob([jsonContent], { 
                type: 'application/json;charset=utf-8;' 
            });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            console.log(`✅ Export JSON completato: ${filename}`);
        } catch (error) {
            console.error('❌ Errore export JSON:', error);
            alert('Errore durante l\'export JSON: ' + error.message);
        }
    }
    
    /**
     * Genera report completo
     */
    generateReport() {
        if (!this.dataManager.currentData) {
            alert('Nessun dato per generare il report');
            return;
        }
        
        const reportData = this.createReportData();
        const htmlReport = this.createHTMLReport(reportData);
        
        // Apri in nuova finestra per stampa/salvataggio
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlReport);
        printWindow.document.close();
    }
    
    /**
     * Crea dati per report
     */
    createReportData() {
        const data = this.dataManager.currentData;
        const contentType = this.dataManager.determineContentType();
        const stats = this.dataManager.getStats();
        
        return {
            header: {
                title: this.dataManager.currentContext === 'parameter' ? 
                       `Report Parametro: ${data.parameter_info?.name}` :
                       `Report Canale: ${data.channel_info?.name}`,
                generated_date: new Date().toLocaleString('it-IT'),
                content_type: contentType
            },
            info: data.parameter_info || data.channel_info,
            statistics: stats,
            data_summary: {
                total_records: this.getTotalRecords(data),
                date_range: this.getDateRange(data),
                parameters_count: this.getParametersCount(data)
            }
        };
    }
    
    /**
     * Crea report HTML
     */
    createHTMLReport(reportData) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${reportData.header.title}</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                    .section { margin-bottom: 30px; }
                    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    .info-table th, .info-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
                    .info-table th { background-color: #f5f5f5; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
                    .stat-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${reportData.header.title}</h1>
                    <p>Generato il: ${reportData.header.generated_date}</p>
                    <p>Tipo contenuto: ${reportData.header.content_type}</p>
                </div>
                
                <div class="section">
                    <h2>Informazioni</h2>
                    <table class="info-table">
                        ${Object.entries(reportData.info || {}).map(([key, value]) => 
                            `<tr><th>${key}</th><td>${value || 'N/A'}</td></tr>`
                        ).join('')}
                    </table>
                </div>
                
                <div class="section">
                    <h2>Riepilogo Dati</h2>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <strong>Totale Record</strong><br>
                            ${reportData.data_summary.total_records}
                        </div>
                        <div class="stat-card">
                            <strong>Parametri</strong><br>
                            ${reportData.data_summary.parameters_count}
                        </div>
                        <div class="stat-card">
                            <strong>Periodo</strong><br>
                            ${reportData.data_summary.date_range}
                        </div>
                    </div>
                </div>
                
                ${reportData.statistics ? `
                <div class="section">
                    <h2>Statistiche</h2>
                    <pre>${JSON.stringify(reportData.statistics, null, 2)}</pre>
                </div>
                ` : ''}
                
                <div class="no-print">
                    <button onclick="window.print()">📄 Stampa Report</button>
                    <button onclick="window.close()">❌ Chiudi</button>
                </div>
            </body>
            </html>
        `;
    }
    
    /**
     * Helper functions per report
     */
    getTotalRecords(data) {
        if (Array.isArray(data.readings)) {
            return data.readings.length;
        }
        if (typeof data.readings === 'object') {
            return Object.values(data.readings).reduce((total, readings) => total + readings.length, 0);
        }
        return 0;
    }
    
    getDateRange(data) {
        let allTimestamps = [];
        
        if (Array.isArray(data.readings)) {
            allTimestamps = data.readings.map(r => new Date(r.timestamp_utc));
        } else if (typeof data.readings === 'object') {
            for (const readings of Object.values(data.readings)) {
                allTimestamps = allTimestamps.concat(readings.map(r => new Date(r.timestamp_utc)));
            }
        }
        
        if (allTimestamps.length === 0) return 'N/A';
        
        const minDate = new Date(Math.min(...allTimestamps));
        const maxDate = new Date(Math.max(...allTimestamps));
        
        return `${minDate.toLocaleDateString('it-IT')} - ${maxDate.toLocaleDateString('it-IT')}`;
    }
    
    getParametersCount(data) {
        if (Array.isArray(data.readings)) {
            return 1;
        }
        if (typeof data.readings === 'object') {
            return Object.keys(data.readings).length;
        }
        return 0;
    }
    
    /**
     * Cleanup
     */
    cleanup() {
        // Cleanup eventuali URL creati per download
        console.log('🧹 ExportHandler cleanup completato');
    }
}

// Export globale
window.ExportHandler = ExportHandler;