/**
 * CHART RENDERER - Gestione grafici Chart.js
 * VERSIONE CORRETTA: senza animazioni slide
 */

class ChartRenderer {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.chartInstance = null;
        this.csvViewerChartInstance = null;
    }
    
    /**
     * Colori coordinati per parametri
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
     * Ottieni colore per indice parametro
     */
    getParameterColor(paramIndex, type = 'hex') {
        const colors = this.getParameterColors();
        return colors[type][paramIndex % colors[type].length];
    }
    
    /**
     * Renderizza grafico parametro singolo - SENZA ANIMAZIONI
     */
    renderChart(readings, parameterInfo) {
        const canvas = document.getElementById('readingsChart');
        if (!canvas) return;
        
        this.destroyCurrentChart();
        
        if (!readings || readings.length === 0) {
            this.showNoDataMessage(canvas);
            return;
        }
        
        const dataPoints = readings.map(r => ({
            x: new Date(r.timestamp_utc),
            y: parseFloat(r.value) || 0
        }));
        
        const data = {
            datasets: [{
                label: `${parameterInfo.name}${parameterInfo.unit ? ` (${parameterInfo.unit})` : ''}`,
                data: dataPoints,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                fill: 'origin',
                tension: 0.1,
                pointRadius: 4,
                pointHoverRadius: 6,
            }]
        };
        
        const config = {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                hover: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Grafico Dati',
                        font: {
                            size: 18,
                            weight: 'bold'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        displayColors: true,
                        callbacks: {
                            title: function(context) {
                                return new Date(context[0].parsed.x).toLocaleString('it-IT');
                            }
                        }
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'DD/MM/YYYY HH:mm',
                            displayFormats: {
                                day: 'DD/MM'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Data e Ora'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Valore'
                        },
                        beginAtZero: false
                    }
                },
                animation: {
                    duration: 0 // CORRETTO: Nessuna animazione per evitare slide effect
                }
            }
        };
        
        this.chartInstance = new Chart(canvas, config);
        this.addVerticalLinePlugin(canvas);
    }
    
    /**
     * Renderizza grafico multi-parametro canali - SENZA ANIMAZIONI
     */
    renderMultiChart(readingsByParameter, channelInfo) {
        const canvas = document.getElementById('readingsChart');
        if (!canvas) return;
        
        this.destroyCurrentChart();
        
        if (!readingsByParameter || Object.keys(readingsByParameter).length === 0) {
            this.showNoDataMessage(canvas);
            return;
        }
        
        const datasets = [];
        let colorIndex = 0;
        
        for (const [paramName, readings] of Object.entries(readingsByParameter)) {
            const dataPoints = readings.map(r => ({
                x: new Date(r.timestamp_utc),
                y: parseFloat(r.value) || 0
            }));
            
            datasets.push({
                label: paramName,
                data: dataPoints,
                borderColor: this.getParameterColor(colorIndex, 'hex'),
                backgroundColor: this.getParameterColor(colorIndex, 'hex') + '20',
                fill: false,
                tension: 0.1,
                pointRadius: 3,
                pointHoverRadius: 5
            });
            colorIndex++;
        }
        
        const data = { datasets: datasets };
        
        const config = {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                hover: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: `Dati Canale: ${channelInfo.name}`,
                        font: {
                            size: 18,
                            weight: 'bold'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        displayColors: true,
                        callbacks: {
                            title: function(context) {
                                return new Date(context[0].parsed.x).toLocaleString('it-IT');
                            }
                        }
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'DD/MM/YYYY HH:mm',
                            displayFormats: {
                                day: 'DD/MM'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Data e Ora'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Valore'
                        },
                        beginAtZero: false
                    }
                },
                animation: {
                    duration: 0 // CORRETTO: Nessuna animazione per multi-chart
                }
            }
        };
        
        this.chartInstance = new Chart(canvas, config);
        this.addVerticalLinePlugin(canvas);
    }
    
    /**
     * Renderizza grafico CSV
     */
    renderCSVChart(csvData, canvasId = 'csvViewerChartCanvas') {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !csvData.rows || !csvData.columns || csvData.columns.length < 2) return;
        
        // MIGLIORATO: Cleanup più robusto
        this.cleanupCSVChart(canvas);
        
        // Usa automaticamente prima e seconda colonna
        const xCol = csvData.columns[0];
        const yCol = csvData.columns[1];
        
        // Prepara dati
        const dataPoints = csvData.rows
            .filter(row => row[xCol] != null && row[yCol] != null)
            .map(row => ({
                x: parseFloat(row[xCol]) || 0,
                y: parseFloat(row[yCol]) || 0
            }))
            .sort((a, b) => a.x - b.x);
        
        const config = {
            type: 'line',
            data: {
                datasets: [{
                    label: `${yCol} vs ${xCol}`,
                    data: dataPoints,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.2)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Grafico CSV: ${yCol} vs ${xCol}`
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: xCol
                        }
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: yCol
                        }
                    }
                },
                animation: {
                    duration: 0 // CORRETTO: Nessuna animazione anche per CSV
                }
            }
        };
        
        this.csvViewerChartInstance = new Chart(canvas, config);
    }
    
    /**
     * Plugin linea verticale hover
     */
    addVerticalLinePlugin(canvas) {
        let isMouseOnCanvas = false;
        let lastMouseX = 0;
        
        const verticalLinePlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                if (isMouseOnCanvas) {
                    const ctx = chart.ctx;
                    const chartArea = chart.chartArea;
                    
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(lastMouseX, chartArea.top);
                    ctx.lineTo(lastMouseX, chartArea.bottom);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(255, 102, 102, 0.8)';
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };
        
        Chart.register(verticalLinePlugin);
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            isMouseOnCanvas = true;
            lastMouseX = x;
            if (this.chartInstance) {
                this.chartInstance.update('none');
            }
        });
        
        canvas.addEventListener('mouseleave', () => {
            isMouseOnCanvas = false;
            if (this.chartInstance) {
                this.chartInstance.update('none');
            }
        });
    }
    
    /**
     * NUOVO: Cleanup robusto per CSV chart
     */
    cleanupCSVChart(canvas) {
        try {
            // Distruggi istanza se esiste
            if (this.csvViewerChartInstance) {
                this.csvViewerChartInstance.destroy();
                this.csvViewerChartInstance = null;
            }
            
            // Verifica se il canvas ha un chart Chart.js associato
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                console.log('🧹 Distruggendo chart esistente sul canvas:', canvas.id);
                existingChart.destroy();
            }
            
            // Pulisci il canvas context (estrema sicurezza)
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            
        } catch (error) {
            console.warn('⚠️ Errore cleanup CSV chart:', error);
            // Continua comunque l'esecuzione
        }
    }
    
    /**
     * Mostra messaggio nessun dato
     */
    showNoDataMessage(canvas) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#adb5bd';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📊', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.fillStyle = '#6c757d';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('Nessun dato disponibile', canvas.width / 2, canvas.height / 2 + 30);
        
        ctx.fillStyle = '#adb5bd';
        ctx.font = '16px Arial';
        ctx.fillText('Seleziona un periodo diverso', canvas.width / 2, canvas.height / 2 + 60);
    }
    
    /**
     * Distrugge istanza grafico corrente
     */
    destroyCurrentChart() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }
    
    /**
     * Cleanup completo
     */
    cleanup() {
        this.destroyCurrentChart();
        
        // Cleanup CSV chart con metodo robusto
        if (this.csvViewerChartInstance) {
            try {
                this.csvViewerChartInstance.destroy();
                this.csvViewerChartInstance = null;
            } catch (error) {
                console.warn('⚠️ Errore cleanup CSV instance:', error);
            }
        }
        
        // Cleanup canvas CSV se presente
        const csvCanvas = document.getElementById('csvViewerChartCanvas');
        if (csvCanvas) {
            this.cleanupCSVChart(csvCanvas);
        }
        
        console.log('🧹 ChartRenderer cleanup completato');
    }
}

// Export globale
window.ChartRenderer = ChartRenderer;