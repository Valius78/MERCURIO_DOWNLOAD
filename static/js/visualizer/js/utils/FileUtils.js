/**
 * FILE UTILS - Gestione file types, path e dimensioni
 * Funzioni pure per riconoscimento e formattazione file
 */

class FileUtils {
    
    /**
     * Verifica se un valore è un path file
     */
    static isFilePath(value) {
        if (!value || typeof value !== 'string') {
            return false;
        }
        
        // Controlla se è una cartella (non ha estensione)
        if (this.isFolderPath(value)) {
            return true;
        }
        
        // Controlla se ha estensioni file
        const hasExtension = /\.(pdf|csv|json|jpg|jpeg|png|gif|mp4|avi|mkv|mov)$/i.test(value);
        const hasPrefix = /^(\/|\.\/|https?:\/\/|minio:\/\/)/i.test(value);
        
        return hasExtension || hasPrefix;
    }
    
    /**
     * Verifica se un valore è un path di cartella
     */
    static isFolderPath(value) {
        if (!value || typeof value !== 'string') {
            return false;
        }
        
        const lastSegment = value.split('/').pop();
        
        // Se termina con /, è una cartella
        if (value.endsWith('/')) {
            return true;
        }
        
        // Se contiene almeno uno slash E l'ultimo segmento non ha punti, è probabilmente una cartella
        if (value.includes('/') && lastSegment && !lastSegment.includes('.')) {
            return true;
        }
        
        // Pattern specifici cartelle eventi: SCR-002-VIBR-001-EVNT-03-FILE-01/20250912T133656
        const folderPattern = /^[A-Z0-9\-]+\/\d{8}T\d{6}$/;
        if (folderPattern.test(value)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Determina il tipo di file/cartella dal path
     */
    static getFileTypeFromPath(path) {
        if (!path || typeof path !== 'string') return 'file';
        
        // Controlla prima se è una cartella
        if (this.isFolderPath(path)) return 'folder';
        
        const ext = path.split('.').pop().toLowerCase();
        
        switch (ext) {
            case 'pdf': return 'pdf';
            case 'csv': return 'csv';
            case 'json': return 'json';
            case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': return 'image';
            case 'mp4': case 'avi': case 'mkv': case 'mov': case 'wmv': return 'video';
            default: return 'file';
        }
    }
    
    /**
     * Ottiene nome file dal path
     */
    static getFileNameFromPath(path) {
        return path.split('/').pop() || path;
    }
    
    /**
     * Formatta dimensione file in formato leggibile
     */
    static formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    /**
     * Ottiene configurazione per tipo file/cartella (icone e colori)
     */
    static getFileTypeConfig(type) {
        const configs = {
            'folder': { icon: 'fa-folder', color: 'primary' },
            'pdf': { icon: 'fa-file-pdf', color: 'danger' },
            'csv': { icon: 'fa-file-csv', color: 'success' },
            'json': { icon: 'fa-file-code', color: 'warning' },
            'image': { icon: 'fa-image', color: 'info' },
            'video': { icon: 'fa-video', color: 'dark' },
            'file': { icon: 'fa-file', color: 'secondary' }
        };
        return configs[type] || configs['file'];
    }
    
    /**
     * Analizza il tipo di contenuto dei readings
     */
    static analyzeReadingsContentType(readings) {
        if (!readings) {
            return 'numeric';
        }
        
        // Se abbiamo readings array (parametro singolo)
        if (Array.isArray(readings)) {
            if (readings.length > 0) {
                const firstReading = readings[0];
                
                if (firstReading && this.isFilePath(firstReading.value)) {
                    const fileType = this.getFileTypeFromPath(firstReading.value);
                    return fileType;
                } else {
                    return 'numeric';
                }
            }
        }
        
        // Se abbiamo readings object (canale multi-parametro)
        if (typeof readings === 'object') {
            let hasFiles = false;
            let hasNumeric = false;
            
            for (const readingsList of Object.values(readings)) {
                if (readingsList.length > 0) {
                    const value = readingsList[0].value;
                    if (this.isFilePath(value)) {
                        hasFiles = true;
                    } else {
                        hasNumeric = true;
                    }
                }
            }
            
            return hasFiles ? 'mixed' : 'numeric';
        }
        
        return 'numeric';
    }
    
    /**
     * Crea contenuto preview per file
     */
    static getFilePreviewContent(file) {
        const typeConfig = this.getFileTypeConfig(file.type);
        
        switch (file.type) {
            case 'image':
                return `<img src="/api/files/preview/${encodeURIComponent(file.path)}" 
                            style="max-width: 100%; max-height: 100%; object-fit: contain;" 
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; flex-direction: column;">
                            <i class="fas ${typeConfig.icon} fa-3x text-muted"></i>
                            <small class="text-muted mt-2">Preview non disponibile</small>
                        </div>`;
            
            case 'video':
                return `<video style="max-width: 100%; max-height: 100%; object-fit: contain;" controls>
                            <source src="/api/files/preview/${encodeURIComponent(file.path)}" type="video/mp4">
                            <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; flex-direction: column;">
                                <i class="fas ${typeConfig.icon} fa-3x text-muted"></i>
                                <small class="text-muted mt-2">Video non supportato</small>
                            </div>
                        </video>`;
            
            default:
                return `<div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; flex-direction: column;">
                            <i class="fas ${typeConfig.icon} fa-3x text-${typeConfig.color}"></i>
                            <small class="text-muted mt-2">${file.type.toUpperCase()}</small>
                        </div>`;
        }
    }
}

// Export globale
window.FileUtils = FileUtils;