/**
 * FILE RENDERER - Gestione visualizzazione file - UPDATED WITH UNIFIED DOWNLOAD
 * PDF, CSV, JSON, immagini, video, gallery, download
 * NUOVO: Download tramite endpoint unificato streaming
 */

class FileRenderer {
    constructor(dataManager, apiClient, tableRenderer) {
        this.dataManager = dataManager;
        this.apiClient = apiClient;
        this.tableRenderer = tableRenderer;
    }
    
    /**
     * Renderizza gallery per files
     */
    renderFileGallery(files = null) {
        const container = document.getElementById('filesGrid');
        
        // Usa files passati o estrai dai dati correnti
        let filesToRender = files;
        if (!filesToRender) {
            filesToRender = this.extractFilesFromCurrentData();
        }
        
        if (!filesToRender || filesToRender.length === 0) {
            container.innerHTML = '<div class="col-12"><div class="alert alert-info">Nessun file trovato</div></div>';
            return;
        }
        
        // Ordina per timestamp
        filesToRender.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Render gallery
        let galleryHTML = '';
        filesToRender.forEach((file, index) => {
            galleryHTML += this.createFileCard(file, index);
        });
        
        container.innerHTML = galleryHTML;
        this.bindFileCardEvents();
    }
    
    /**
     * Estrai files dai dati correnti
     */
    extractFilesFromCurrentData() {
        if (!this.dataManager.currentData || !this.dataManager.currentData.readings) {
            return [];
        }
        
        let files = [];
        
        if (Array.isArray(this.dataManager.currentData.readings)) {
            // Parametro singolo
            files = this.dataManager.currentData.readings
                .filter(r => FileUtils.isFilePath(r.value))
                .map(r => ({
                    path: r.value,
                    timestamp: r.timestamp_utc,
                    type: FileUtils.getFileTypeFromPath(r.value),
                    name: FileUtils.getFileNameFromPath(r.value)
                }));
        } else {
            // Multi-parametro
            for (const [paramName, readings] of Object.entries(this.dataManager.currentData.readings)) {
                const paramFiles = readings
                    .filter(r => FileUtils.isFilePath(r.value))
                    .map(r => ({
                        path: r.value,
                        timestamp: r.timestamp_utc,
                        type: FileUtils.getFileTypeFromPath(r.value),
                        name: FileUtils.getFileNameFromPath(r.value),
                        parameter: paramName
                    }));
                files = files.concat(paramFiles);
            }
        }
        
        return files;
    }
    
    /**
     * Crea card per file
     */
    createFileCard(file, index) {
        const typeConfig = FileUtils.getFileTypeConfig(file.type);
        const timestamp = DateUtils.formatTimestampLocal(file.timestamp);
        
        return `
            <div class="col-lg-3 col-md-4 col-sm-6">
                <div class="card border-0 shadow-sm file-card" data-index="${index}" data-type="${file.type}">
                    <div class="card-header bg-${typeConfig.color} text-white p-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="fw-bold">
                                <i class="fas ${typeConfig.icon} me-1"></i> ${file.type.toUpperCase()}
                            </small>
                            <div class="form-check form-check-white">
                                <input class="form-check-input file-select" type="checkbox" 
                                       data-file-path="${file.path}" data-index="${index}">
                            </div>
                        </div>
                    </div>
                    <div class="card-body p-2">
                        <div class="file-preview mb-2" style="height: 120px; background: #f8f9fa; display: flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer;"
                             onclick="window.readingsVisualizer.openFile('${file.path}', '${file.type}', '${file.name}')">
                            ${FileUtils.getFilePreviewContent(file)}
                        </div>
                        <h6 class="card-title mb-1 text-truncate" title="${file.name}">${file.name}</h6>
                        <small class="text-muted">${timestamp}</small>
                        ${file.parameter ? `<br><small class="badge bg-light text-dark">${file.parameter}</small>` : ''}
                    </div>
                    <div class="card-footer p-2 bg-light">
                        <div class="btn-group w-100">
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="window.readingsVisualizer.openFile('${file.path}', '${file.type}', '${file.name}')">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-success" 
                                    onclick="window.readingsVisualizer.downloadFile('${file.path}', '${file.name}')">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * NUOVO: Salva stato navigazione prima di aprire un file
     */
    saveNavigationStateBeforeFile() {
        if (window.readingsVisualizer && window.readingsVisualizer.core && 
            window.readingsVisualizer.core.navigationHandler) {
            
            const navHandler = window.readingsVisualizer.core.navigationHandler;
            
            // Salva solo se siamo in navigazione cartelle
            if (navHandler.currentFolderPath && navHandler.currentFolderData) {
                const stateToSave = {
                    type: 'folder',
                    folderPath: navHandler.currentFolderPath,
                    folderData: navHandler.currentFolderData,
                    context: navHandler.dataManager.currentContext
                };
                
                console.log('💾 Salvando stato cartella prima di aprire file:', stateToSave);
                navHandler.navigationStack.push(stateToSave);
            }
        }
    }
    
    /**
     * Apre file nel visualizzatore appropriato
     */
    async openFile(filePath, fileType, fileName) {
        if (!filePath || filePath === 'null' || filePath === 'undefined') {
            alert('Errore: percorso file non valido');
            return;
        }
        
        // NUOVO: Salva stato navigazione prima di aprire il file
        this.saveNavigationStateBeforeFile();
        
        try {
            switch (fileType) {
                case 'pdf':
                    this.showPDFViewer(filePath, fileName);
                    break;
                
                case 'image':
                    this.openImageModal(filePath, fileName);
                    break;
                
                case 'video':
                    this.openVideoModal(filePath, fileName);
                    break;
                
                case 'json':
                    await this.showJSONViewer(filePath, fileName);
                    break;
                
                case 'csv':
                    await this.showCSVViewer(filePath, fileName);
                    break;
                
                default:
                    // Per altri tipi, scarica o apri in nuova finestra
                    window.open(this.apiClient.getFileViewUrl(filePath), '_blank');
            }
        } catch (error) {
            console.error('Errore apertura file:', error);
            alert(`Errore apertura file ${fileName}: ${error.message}`);
        }
    }
    
    /**
     * Mostra PDF viewer
     */
    showPDFViewer(filePath, fileName) {
        // Nascondi altri contenitori
        document.getElementById('numericContainer').style.display = 'none';
        document.getElementById('filesContainer').style.display = 'none';
        document.getElementById('jsonViewerContainer').style.display = 'none';
        document.getElementById('csvViewerContainer').style.display = 'none';
        
        // Mostra PDF viewer
        document.getElementById('pdfViewerContainer').style.display = 'block';
        document.getElementById('pdfFileName').textContent = fileName;
        
        // NUOVO: Nascondi export quando visualizzo file
        const exportBtn = document.getElementById('exportData');
        if (exportBtn) exportBtn.style.display = 'none';
        
        const pdfViewer = document.getElementById('pdfViewer');
        const viewUrl = this.apiClient.getFileViewUrl(filePath);
        
        // Aggiungi pulsante "Torna alla lista"
        this.addBackButton('pdfViewerContainer');
        
        pdfViewer.innerHTML = `
            <embed src="${viewUrl}" 
                   type="application/pdf" 
                   style="width: 100%; height: 100%;"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
            <div style="display: none; padding: 20px; text-align: center;">
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Impossibile visualizzare il PDF nel browser.
                    <br><br>
                    <button class="btn btn-primary" 
                            onclick="window.readingsVisualizer.downloadFile('${filePath}', '${fileName}')">
                        <i class="fas fa-download me-1"></i> Download PDF
                    </button>
                    <button class="btn btn-secondary ms-2" 
                            onclick="window.open('${viewUrl}', '_blank')">
                        <i class="fas fa-external-link-alt me-1"></i> Apri in nuova finestra
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Mostra JSON viewer
     */
    async showJSONViewer(filePath, fileName) {
        try {
            // Nascondi altri contenitori
            document.getElementById('numericContainer').style.display = 'none';
            document.getElementById('filesContainer').style.display = 'none';
            document.getElementById('pdfViewerContainer').style.display = 'none';
            document.getElementById('csvViewerContainer').style.display = 'none';
            
            // Mostra JSON viewer
            document.getElementById('jsonViewerContainer').style.display = 'block';
            document.getElementById('jsonFileName').textContent = fileName;
            
            // NUOVO: Nascondi export quando visualizzo file
            const exportBtn = document.getElementById('exportData');
            if (exportBtn) exportBtn.style.display = 'none';
            
            // Aggiungi pulsante "Torna alla lista"
            this.addBackButton('jsonViewerContainer');
            
            // Carica e mostra JSON
            const jsonResponse = await this.apiClient.getJsonData(filePath);
            const jsonContentDiv = document.getElementById('jsonContent');
            
            jsonContentDiv.innerHTML = `
                <div class="table-responsive" style="max-height: 600px; overflow: auto;">
                    <table class="table table-striped table-hover table-sm" id="jsonTable">
                    </table>
                </div>
            `;
            
            // Popola la tabella
            this.tableRenderer.populateJSONTable(jsonResponse.data, 'jsonTable');
            
        } catch (error) {
            const jsonContent = document.getElementById('jsonContent');
            if (jsonContent) {
                jsonContent.textContent = `Errore nel caricamento: ${error.message}`;
            }
        }
    }
    
    /**
     * Mostra CSV viewer
     */
    async showCSVViewer(filePath, fileName) {
        try {
            // Nascondi altri contenitori
            document.getElementById('numericContainer').style.display = 'none';
            document.getElementById('filesContainer').style.display = 'none';
            document.getElementById('pdfViewerContainer').style.display = 'none';
            document.getElementById('jsonViewerContainer').style.display = 'none';
            
            // Mostra CSV viewer
            document.getElementById('csvViewerContainer').style.display = 'block';
            document.getElementById('csvFileName').textContent = fileName;
            
            // NUOVO: Nascondi export quando visualizzo file
            const exportBtn = document.getElementById('exportData');
            if (exportBtn) exportBtn.style.display = 'none';
            
            // Reset dei radio button
            const tableRadio = document.getElementById('csvTableView');
            const chartRadio = document.getElementById('csvChartView');
            
            if (tableRadio && chartRadio) {
                tableRadio.checked = false;
                chartRadio.checked = true; // Default grafico
                
                const tableContainer = document.getElementById('csvViewerTableContainer');
                const chartContainer = document.getElementById('csvViewerChartContainer');
                
                if (tableContainer) tableContainer.style.display = 'none';
                if (chartContainer) chartContainer.style.display = 'block';
            }
            
            // Aggiungi pulsante "Torna alla lista"
            this.addBackButton('csvViewerContainer');
            
            // Carica dati CSV
            const csvData = await this.apiClient.getCsvData(filePath);
            
            // Popola tabella
            this.tableRenderer.populateCSVTable(csvData, 'csvViewerTable');
            
            // Bind eventi per cambio vista
            this.bindCSVViewerEvents(csvData);
            
            // Renderizza grafico di default
            setTimeout(() => {
                if (window.ChartRenderer) {
                    const chartRenderer = new ChartRenderer(this.dataManager);
                    chartRenderer.renderCSVChart(csvData);
                }
            }, 100);
            
        } catch (error) {
            const csvTable = document.getElementById('csvViewerTable');
            if (csvTable) {
                csvTable.innerHTML = `<tr><td class="text-center text-danger">Errore nel caricamento: ${error.message}</td></tr>`;
            }
        }
    }
    
    /**
     * Bind eventi per CSV viewer
     */
    bindCSVViewerEvents(csvData) {
        document.querySelectorAll('input[name="csvViewMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const isChart = document.getElementById('csvChartView')?.checked || false;
                const tableContainer = document.getElementById('csvViewerTableContainer');
                const chartContainer = document.getElementById('csvViewerChartContainer');
                
                if (tableContainer) {
                    tableContainer.style.display = isChart ? 'none' : 'block';
                }
                
                if (chartContainer) {
                    chartContainer.style.display = isChart ? 'block' : 'none';
                }
                
                if (isChart && window.ChartRenderer) {
                    setTimeout(() => {
                        const chartRenderer = new ChartRenderer(this.dataManager);
                        chartRenderer.renderCSVChart(csvData);
                    }, 100);
                }
            });
        });
    }
    
    /**
     * Apre modal per immagini
     */
    openImageModal(filePath, fileName) {
        const viewUrl = this.apiClient.getFileViewUrl(filePath);
        const modalHTML = `
            <div class="modal fade" id="imageModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-image me-2"></i> ${fileName}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body text-center">
                            <img src="${viewUrl}" 
                                 class="img-fluid" style="max-height: 70vh;"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                            <div style="display: none;" class="alert alert-warning">
                                Impossibile caricare l'immagine
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-success" onclick="window.readingsVisualizer.downloadFile('${filePath}', '${fileName}')">
                                <i class="fas fa-download me-1"></i> Download
                            </button>
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Rimuovi modal esistente se presente
        document.getElementById('imageModal')?.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const modal = new bootstrap.Modal(document.getElementById('imageModal'));
        modal.show();
        
        // Cleanup alla chiusura
        document.getElementById('imageModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }
    
    /**
     * Apre modal per video
     */
    openVideoModal(filePath, fileName) {
        const viewUrl = this.apiClient.getFileViewUrl(filePath);
        const modalHTML = `
            <div class="modal fade" id="videoModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-video me-2"></i> ${fileName}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body text-center">
                            <video controls style="width: 100%; max-height: 70vh;">
                                <source src="${viewUrl}" type="video/mp4">
                                <div class="alert alert-warning">
                                    Il tuo browser non supporta il tag video.
                                </div>
                            </video>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-success" onclick="window.readingsVisualizer.downloadFile('${filePath}', '${fileName}')">
                                <i class="fas fa-download me-1"></i> Download
                            </button>
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('videoModal')?.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const modal = new bootstrap.Modal(document.getElementById('videoModal'));
        modal.show();
        
        document.getElementById('videoModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }
    
    /**
     * Download file singolo tramite endpoint unificato con tracking
     */
    async downloadFile(filePath, fileName) {
        if (this.downloading) {
            console.warn('⚠️ Download già in corso, ignoro richiesta duplicata');
            return;
        }
        this.downloading = true;
        
        try {
            console.log(`📥 Download file: ${fileName}`);
            
            // Genera ID download univoco
            const downloadId = window.generateDownloadId ? 
                window.generateDownloadId('file', fileName) : 
                `file_${fileName}_${Date.now()}`;
            
            // Info download
            const downloadInfo = {
                type: this.getFileType(fileName),
                name: fileName,
                filename: fileName,
                filePath: filePath
            };
            
            // Funzione download originale
            const downloadFunction = async () => {
                // NUOVO: Usa endpoint unificato per download streaming
                const downloadUrl = `/api/download/file/0?file_path=${encodeURIComponent(filePath)}`;
                
                console.log(`🔗 File Download URL: ${downloadUrl}`);
                
                // Trigger download diretto del browser
                const response = await fetch(downloadUrl);
                
                // NUOVO: Gestione errori traffico
                if (response.status === 429) {
                    const errorData = await response.json();
                    console.warn('⚠️ File download - traffico limite superato:', errorData);
                    
                    // Delega gestione errore ad ApiClient
                    if (window.readingsVisualizer && window.readingsVisualizer.apiClient) {
                        window.readingsVisualizer.apiClient.handleTrafficLimitError(errorData);
                    }
                    
                    throw new Error(`Traffico limite superato: ${errorData.message}`);
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                
                // Estrai filename dal header se disponibile
                let downloadFileName = fileName;
                const contentDisposition = response.headers.get('Content-Disposition');
                if (contentDisposition) {
                    const matches = contentDisposition.match(/filename="([^"]+)"/);
                    if (matches && matches[1]) {
                        downloadFileName = matches[1];
                    }
                }
                
                // Download via browser
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = downloadFileName;
                document.body.appendChild(a);
                a.click();
                
                // Cleanup
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                console.log(`✅ Download completato: ${downloadFileName}`);
                
                return { success: true, size: blob.size, filename: downloadFileName };
            };
            
            // Usa sistema tracking se disponibile, altrimenti fallback + aggiornamento traffico
            if (window.startTrackedDownload) {
                return await window.startTrackedDownload(downloadId, downloadInfo, downloadFunction);
            } else {
                console.warn('⚠️ Sistema tracking non disponibile, fallback');
                const result = await downloadFunction();
                
                // Fallback: Aggiorna manualmente status traffico
                this.updateTrafficStatusAfterDownload();
                if (typeof window.refreshAllTrafficIndicators === 'function') {
                    setTimeout(() => window.refreshAllTrafficIndicators(), 1000);
                }
                
                return result;
            }
            
        } catch (error) {
            console.error('❌ Errore download file:', error);
            alert('Errore nel download: ' + error.message);
            throw error;
        } finally {
            // Reset flag dopo 2 secondi
            setTimeout(() => {
                this.downloading = false;
            }, 2000);
        }
    }

    /**
     * Helper: Determina tipo file dall'estensione
     */
    getFileType(fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        switch (ext) {
            case 'pdf': return 'PDF';
            case 'csv': return 'CSV';
            case 'json': return 'JSON';
            case 'txt': return 'TXT';
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif': return 'IMG';
            case 'mp4':
            case 'avi':
            case 'mov': return 'VID';
            case 'zip':
            case 'rar': return 'ZIP';
            default: return 'FILE';
        }
    }
    
    async updateTrafficStatusAfterDownload() {
        try {
            // Usa TrafficControlManager se disponibile, altrimenti fallback
            if (window.readingsVisualizerTrafficControlManager) {
                window.readingsVisualizerTrafficControlManager.scheduleTrafficUpdate('file_download_complete');
            } else if (window.readingsVisualizerTrafficIndicator) {
                await window.readingsVisualizerTrafficIndicator.updateStatusNow();
            } else {
                console.warn('Traffic Indicator non disponibile per aggiornamento');
            }
        } catch (error) {
            console.error('Errore aggiornamento status traffico:', error);
        }
    }
    
    /**
     * Seleziona tutti i files
     */
    selectAllFiles() {
        document.querySelectorAll('.file-select').forEach(checkbox => {
            checkbox.checked = true;
        });
        this.updateSelectedCount();
    }
    
    /**
     * Deseleziona tutti i files
     */
    selectNoneFiles() {
        document.querySelectorAll('.file-select').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateSelectedCount();
    }
    
    /**
     * Download files selezionati tramite endpoint unificato
     */
    async downloadSelectedFiles() {
        // Prevenzione doppi click/chiamate multiple
        if (this.downloadingMultiple) {
            console.warn('⚠️ Download multiplo già in corso');
            return;
        }
        this.downloadingMultiple = true;
        const selectedFiles = Array.from(document.querySelectorAll('.file-select:checked'))
            .map(cb => cb.getAttribute('data-file-path'));

        if (this.downloadingMultiple) {
            console.warn('⚠️ Download multiplo già in corso');
            return;
        }
        this.downloadingMultiple = true;
    
        if (selectedFiles.length === 0) {
            alert('Seleziona almeno un file');
            return;
        }
        
        try {
            console.log(`📤 Download selezionati: ${selectedFiles.length} file`);
            
            // Download come ZIP se più di un file
            if (selectedFiles.length > 1) {
                // NUOVO: Usa endpoint unificato per ZIP
                const params = new URLSearchParams();
                selectedFiles.forEach(path => params.append('file_paths', path));
                params.append('zip_name', 'selected_files.zip');
                
                const downloadUrl = `/api/download/files/0?${params.toString()}`;
                
                const response = await fetch(downloadUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'selected_files.zip';
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
            } else {
                // Single file download
                const fileName = FileUtils.getFileNameFromPath(selectedFiles[0]);
                await this.downloadFile(selectedFiles[0], fileName);
            }
            
            console.log('✅ Download selezionati completato');

            // Aggiorna traffic indicator immediatamente  
            if (window.readingsVisualizerTrafficIndicator) {
                await window.readingsVisualizerTrafficIndicator.updateStatusNow();
            }
            
        } catch (error) {
            console.error('❌ Errore download selezionati:', error);
            alert('Errore nel download: ' + error.message);
        } finally {
            // Reset flag dopo 2 secondi
            setTimeout(() => {
                this.downloadingMultiple = false;
            }, 2000);
        }
    }
    
    /**
     * Aggiorna contatore files selezionati
     */
    updateSelectedCount() {
        const selected = document.querySelectorAll('.file-select:checked').length;
        const counter = document.getElementById('selectedCount');
        if (counter) {
            counter.textContent = `(${selected})`;
        }
    }
    
    /**
     * Bind eventi per file cards
     */
    bindFileCardEvents() {
        // Rimuovi event listener esistenti per prevenire duplicati
        document.querySelectorAll('.file-select').forEach(checkbox => {
            checkbox.removeEventListener('change', this.updateSelectedCountBound);
        });

        // Bind per updateSelectedCount con riferimento per rimozione
        if (!this.updateSelectedCountBound) {
            this.updateSelectedCountBound = () => this.updateSelectedCount();
        }
    }
    
    /**
     * Torna alla lista files
     */
    backToFilesList() {
        // Nascondi tutti i visualizzatori
        document.getElementById('pdfViewerContainer').style.display = 'none';
        document.getElementById('jsonViewerContainer').style.display = 'none';
        document.getElementById('csvViewerContainer').style.display = 'none';
        
        // Mostra contenitore files
        document.getElementById('filesContainer').style.display = 'block';
        document.getElementById('numericContainer').style.display = 'none';
        
        // Rimuovi pulsanti back
        this.removeBackButtons();
        
        // CORREZIONE: Usa sempre il sistema di navigazione normale
        if (window.readingsVisualizer && window.readingsVisualizer.core && 
            window.readingsVisualizer.core.navigationHandler) {
            
            const navHandler = window.readingsVisualizer.core.navigationHandler;
            
            // Se siamo in navigazione cartelle, usa il sistema stack normale
            if (navHandler.currentFolderPath || navHandler.navigationStack.length > 0) {
                console.log('🔄 Usando navigazione stack normale');
                navHandler.backToFolderList();
                return;
            }
        }
        
        // Fallback: Re-render gallery o table standard (solo se non siamo in navigazione cartelle)
        this.renderFileGallery();
    }
    
    /**
     * Aggiungi pulsante "Torna alla lista"
     */
    addBackButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const existingBackBtn = container.querySelector('.back-to-list-btn');
        if (!existingBackBtn) {
            const backButton = `
                <div class="p-2 bg-light border-bottom">
                    <button class="btn btn-primary btn-sm back-to-list-btn" 
                            onclick="window.readingsVisualizer.backToFilesList()">
                        <i class="fas fa-arrow-left me-1"></i> Torna alla lista
                    </button>
                </div>
            `;
            
            const cardHeader = container.querySelector('.card-header');
            if (cardHeader) {
                cardHeader.insertAdjacentHTML('afterend', backButton);
            }
        }
    }
    
    /**
     * Rimuovi tutti i pulsanti back
     */
    removeBackButtons() {
        document.querySelectorAll('.back-to-list-btn').forEach(btn => {
            if (btn.parentElement) {
                btn.parentElement.remove();
            }
        });
    }
    
    /**
     * NUOVO: Cleanup FileRenderer
     */
    cleanup() {
        // Rimuovi tutti i pulsanti back
        this.removeBackButtons();
        
        // Reset contenitori file
        const filesGrid = document.getElementById('filesGrid');
        if (filesGrid) {
            filesGrid.innerHTML = '';
        }
        
        console.log('🧹 FileRenderer cleanup completato');
    }
}

// Export globale
window.FileRenderer = FileRenderer;