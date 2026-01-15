/**
 * DATE UTILS - Gestione date e timestamp
 * Funzioni pure per formattazione e parsing date
 */

class DateUtils {
    
    /**
     * Formatta timestamp UTC in formato locale italiano 
     */
    static formatTimestampLocal(utcTimestamp) {
        if (!utcTimestamp) return 'N/A';
        const date = new Date(utcTimestamp);
        return date.toLocaleString('it-IT', {
            timeZone: 'Europe/Rome',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    /**
     * Converte data in formato datetime-local per input HTML
     */
    static formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    /**
     * Ottiene range di date basato su periodo selezionato
     */
    static getDateRange(period) {
        if (period === 'custom' || !period) {
            const start = document.getElementById('startDate')?.value;
            const end = document.getElementById('endDate')?.value;
            return {
                start_date: start ? new Date(start).toISOString() : null,
                end_date: end ? new Date(end).toISOString() : null
            };
        }
        
        const end = new Date();
        let start = new Date();
        
        switch (period) {
            case '1d':
                start.setDate(end.getDate() - 1);
                break;
            case '7d':
                start.setDate(end.getDate() - 7);
                break;
            case '30d':
                start.setDate(end.getDate() - 30);
                break;
        }
        
        return {
            start_date: start.toISOString(),
            end_date: end.toISOString()
        };
    }
    
    /**
     * Imposta date di default per range personalizzato
     */
    static setDefaultCustomDates() {
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // Ultimo giorno
        
        const startInput = document.getElementById('startDate');
        const endInput = document.getElementById('endDate');
        
        if (startInput) startInput.value = this.formatDateTimeLocal(start);
        if (endInput) endInput.value = this.formatDateTimeLocal(end);
    }
    
    /**
     * Ottiene periodo selezionato dai controlli radio
     */
    static getSelectedPeriod() {
        const selectedRadio = document.querySelector('input[name="period"]:checked');
        return selectedRadio ? selectedRadio.getAttribute('data-period') : '7d';
    }
}

// Export globale
window.DateUtils = DateUtils;