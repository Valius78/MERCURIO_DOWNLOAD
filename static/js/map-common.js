// ================================================
// MAP COMMON FUNCTIONS - VERSIONE CORRETTA FILTRI
// ================================================

/* === CONFIGURAZIONE BASE === */
window.MapCommon = {
    // Configurazioni di default
    defaultConfig: {
        initialView: [41.8719, 12.5674],
        initialZoom: 6,
        maxZoom: 19,
        clusterRadius: 80
    },

    // === INIZIALIZZAZIONE MAPPA GENERICA ===
    initializeEntityMap: function(config) {
        return new Promise(async (resolve, reject) => {
            const loadingOverlay = document.getElementById(config.loadingOverlayId);
            
            try {
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
                
                // Crea mappa
                const map = L.map(config.mapContainerId).setView(
                    config.initialView || this.defaultConfig.initialView, 
                    config.initialZoom || this.defaultConfig.initialZoom
                );
                
                // Layer base
                const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: config.maxZoom || this.defaultConfig.maxZoom
                });
                
                const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles © Esri',
                    maxZoom: config.maxZoom || this.defaultConfig.maxZoom
                });
                
                satelliteLayer.addTo(map);
                
                // Controllo layer
                L.control.layers({
                    "OpenStreetMap": osmLayer,
                    "Satellite": satelliteLayer
                }).addTo(map);
                
                // Cluster group
                const markersCluster = this.createClusterGroup(config);
                map.addLayer(markersCluster);
                
                console.log(`Mappa ${config.entityType} inizializzata con successo`);
                
                resolve({ map, markersCluster, osmLayer, satelliteLayer });
                
            } catch (error) {
                console.error(`Errore inizializzazione mappa ${config.entityType}:`, error);
                if (loadingOverlay) {
                    loadingOverlay.innerHTML = `
                        <div class="text-center text-danger">
                            <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                            <p>Errore caricamento mappa</p>
                        </div>
                    `;
                }
                reject(error);
            }
        });
    },

    // === CREAZIONE CLUSTER GROUP ===
    createClusterGroup: function(config) {
        return L.markerClusterGroup({
            maxClusterRadius: config.clusterRadius || this.defaultConfig.clusterRadius,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            
            iconCreateFunction: function(cluster) {
                const markers = cluster.getAllChildMarkers();
                let count = 0;

                // Conta entità considerando marker multipli
                markers.forEach(m => {
                    if (m.options.isMulti && Array.isArray(m.options[config.entitiesProperty])) {
                        count += m.options[config.entitiesProperty].length;
                    } else {
                        count += 1;
                    }
                });
                
                // Calcola dimensioni e colori
                let size, className, bgColor, textColor;
                
                if (count < 3) {
                    size = 35;
                    className = 'cluster-small';
                    bgColor = '#28a745';
                    textColor = '#ffffff';
                } else if (count < 10) {
                    size = 45;
                    className = 'cluster-medium';
                    bgColor = '#17a2b8';
                    textColor = '#ffffff';
                } else if (count < 25) {
                    size = 55;
                    className = 'cluster-large';
                    bgColor = '#ffc107';
                    textColor = '#000000';
                } else {
                    size = 65;
                    className = 'cluster-xlarge';
                    bgColor = '#fd7e14';
                    textColor = '#ffffff';
                }
                
                // Funzione helper per aggiustare luminosità
                function adjustBrightness(color, percent) {
                    const num = parseInt(color.replace("#", ""), 16);
                    const amt = Math.round(2.55 * percent);
                    const R = (num >> 16) + amt;
                    const G = (num >> 8 & 0x00FF) + amt;
                    const B = (num & 0x0000FF) + amt;
                    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
                        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
                        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
                }
                
                const html = `
                    <div class="cluster-marker ${className}" style="
                        width: ${size}px;
                        height: ${size}px;
                        background: radial-gradient(circle, ${bgColor}, ${adjustBrightness(bgColor, -20)});
                        border: 3px solid #ffffff;
                        border-radius: 50%;
                        box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        font-size: ${Math.max(12, size * 0.25)}px;
                        color: ${textColor};
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">
                        <div style="text-align: center; line-height: 1.2;">
                            <div style="font-size: ${Math.max(14, size * 0.28)}px;">${count}</div>
                        </div>
                    </div>
                `;
                
                return new L.DivIcon({
                    html: html,
                    className: 'custom-cluster-icon',
                    iconSize: new L.Point(size, size),
                    iconAnchor: [size / 2, size / 2]
                });
            }
        });
    },

    // === CARICAMENTO ENTITÀ SULLA MAPPA ===
    loadEntitiesOnMap: function(entities, config, markersCluster, entityMarkers) {
        return new Promise((resolve, reject) => {
            try {
                if (!entities || entities.length === 0) {
                    console.log(`Nessun ${config.entityType} da visualizzare sulla mappa`);
                    return resolve(0);
                }

                markersCluster.clearLayers();
                entityMarkers.length = 0;
                let totalEntitiesOnMap = 0;

                // ✅ SALVA LE ENTITÀ ORIGINALI NELLA CONFIGURAZIONE
                config.originalEntities = entities.filter(e => e.latitude && e.longitude);

                const groupedEntities = this.groupEntitiesByCoordinates(config.originalEntities, config);

                Object.values(groupedEntities).forEach(group => {
                    if (group[config.entitiesProperty].length === 1) {
                        this.addSingleEntityMarker(group[config.entitiesProperty][0], config, markersCluster, entityMarkers);
                    } else {
                        this.addMultiEntityMarker(group, config, markersCluster, entityMarkers);
                    }
                    totalEntitiesOnMap += group[config.entitiesProperty].length;
                });

                if (config.counterElementId) {
                    const counter = document.getElementById(config.counterElementId);
                    if (counter) {
                        counter.textContent = totalEntitiesOnMap;
                    }
                }

                console.log(`Caricati ${totalEntitiesOnMap} ${config.entityType} in ${entityMarkers.length} posizioni sulla mappa`);
                resolve(totalEntitiesOnMap);

            } catch (error) {
                console.error(`Errore caricamento ${config.entityType}:`, error);
                reject(error);
            }
        });
    },

    // === RAGGRUPPA ENTITÀ PER COORDINATE ===
    groupEntitiesByCoordinates: function(entities, config) {
        const groups = {};
        entities.forEach(entity => {
            if (!entity.latitude || !entity.longitude) return;
            const key = `${entity.latitude.toFixed(6)}_${entity.longitude.toFixed(6)}`;
            if (!groups[key]) {
                groups[key] = {
                    latitude: entity.latitude,
                    longitude: entity.longitude,
                    [config.entitiesProperty]: []
                };
            }
            groups[key][config.entitiesProperty].push(entity);
        });
        return groups;
    },

    // === MARKER SINGOLO ===
    addSingleEntityMarker: function(entity, config, markersCluster, entityMarkers) {
        const marker = this.createEntityMarker(entity, config);
        
        marker.options.isMulti = false;
        marker.options[config.entitiesProperty] = [entity];
        
        const popupContent = config.popupBuilder.single(entity);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });

        markersCluster.addLayer(marker);

        entityMarkers.push({
            marker: marker,
            [config.entityType]: entity
        });
    },

    // === MARKER MULTIPLO ===
    addMultiEntityMarker: function(group, config, markersCluster, entityMarkers) {
        const firstEntity = group[config.entitiesProperty][0];

        const marker = L.circleMarker([group.latitude, group.longitude], {
            radius: 12,
            fillColor: '#6f42c1',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9
        });

        marker.options.isMulti = true;
        marker.options[config.entitiesProperty] = group[config.entitiesProperty];

        const popupContent = config.popupBuilder.multi(group[config.entitiesProperty]);
        marker.bindPopup(popupContent, {
            maxWidth: 400,
            className: `custom-popup multi-${config.entityType}-popup`
        });

        markersCluster.addLayer(marker);

        entityMarkers.push({
            marker: marker,
            [config.entityType]: firstEntity,
            isMulti: true,
            [config.entitiesProperty]: group[config.entitiesProperty]
        });
    },

    // === CREA MARKER BASE ===
    createEntityMarker: function(entity, config) {
        let markerColor = config.defaultColor || '#0dcaf0';
        
        // Fallback colori
        switch(entity.acquisition_type) {
            case 'continuous': markerColor = '#198754'; break;
            case 'discrete': markerColor = '#ffc107'; break;
            case 'periodic': markerColor = '#0dcaf0'; break;
            default: markerColor = '#6c757d';
        }
        
        return L.circleMarker([entity.latitude, entity.longitude], {
            radius: 8,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            className: `${config.markerPrefix}-${entity.acquisition_type || 'undefined'}`
        });
    },

    // === CONTROLLI MAPPA ===
    fitAllEntities: function(map, markersCluster) {
        if (map && markersCluster && markersCluster.getLayers().length > 0) {
            map.fitBounds(markersCluster.getBounds(), { 
                padding: [20, 20],
                maxZoom: 15
            });
        }
    },

    centerOnItaly: function(map) {
        if (map) {
            map.setView([41.8719, 12.5674], 6);
        }
    },

    toggleMapStyle: function(map) {
        if (map) {
            map.eachLayer(layer => {
                if (layer._url && layer._url.includes('openstreetmap')) {
                    map.removeLayer(layer);
                    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                        attribution: 'Tiles © Esri',
                        maxZoom: 13
                    }).addTo(map);
                } else if (layer._url && layer._url.includes('arcgisonline')) {
                    map.removeLayer(layer);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors',
                        maxZoom: 13
                    }).addTo(map);
                }
            });
        }
    },

    // === AGGIORNAMENTO FILTRI (CORRETTO) ===
    updateEntityMapView: function(config, entityMarkers, markersCluster) {
        if (!config.mapInstance || !markersCluster) return;
        
        // Legge filtri dalla configurazione
        const searchTerm = config.getSearchTerm ? config.getSearchTerm() : '';
        const filters = config.getFilters ? config.getFilters() : {};
        
        markersCluster.clearLayers();
        
        // ✅ CORREZIONE: Filtra sempre dalle entità originali, non dai marker esistenti!
        const originalEntities = config.originalEntities || [];
        
        // 1. Filtra dalle entità originali
        const filteredEntities = originalEntities.filter(entity => {
            return config.filterFunction ? config.filterFunction(entity, searchTerm, filters) : true;
        });
        
        // 2. Ri-clusterizza solo le entità filtrate
        const newGroupedEntities = this.groupEntitiesByCoordinates(filteredEntities, config);
        
        // 3. Crea nuovi marker per i cluster filtrati
        Object.values(newGroupedEntities).forEach(group => {
            if (group[config.entitiesProperty].length === 1) {
                this.addSingleEntityMarker(group[config.entitiesProperty][0], config, markersCluster, []);
            } else {
                this.addMultiEntityMarker(group, config, markersCluster, []);
            }
        });
        
        // 4. Aggiorna contatore
        if (config.counterElementId) {
            const counter = document.getElementById(config.counterElementId);
            if (counter) {
                counter.textContent = filteredEntities.length;
            }
        }
        
        console.log(`Mappa aggiornata: ${filteredEntities.length} ${config.entityType} visibili su ${originalEntities.length} totali`);
    }
};