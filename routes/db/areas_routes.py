# ================================================
# AREAS_ROUTES.PY CORRETTO - Rimozione colonna description
# ================================================
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
import psycopg2  # <-- AGGIUNTO: per gestire IntegrityError
import json
from datetime import datetime
import logging
from utils.db import execute_query

areas_bp = Blueprint('areas', __name__, template_folder='templates')

# ================================================
# ROUTES
# ================================================
@areas_bp.route('/areas')
def areas():
    """Lista delle aree - CON CONTEGGIO REALE ITEMS"""
    areas_list = execute_query("""
        SELECT
            a.area_id, a.name, a.description, a.code, a.area_type, a.metadata, a.created_at,
            s.name AS scenario_name,
            ST_Y(a.center_coordinates) AS latitude,
            ST_X(a.center_coordinates) AS longitude,
            ST_AsText(a.geometry) AS area_geometry,
            COUNT(i.item_id) as total_items  -- <-- CONTEGGIO REALE ITEMS
        FROM areas a
        JOIN scenarios s ON a.scenario_id = s.scenario_id
        LEFT JOIN items i ON a.area_id = i.area_id  -- <-- JOIN con items
        GROUP BY a.area_id, a.name, a.description, a.code, a.area_type, 
                 a.metadata, a.created_at, s.name, a.center_coordinates, a.geometry
        ORDER BY a.code, a.name
    """, fetch=True)
    
    if not areas_list:
        areas_list = []
    
    return render_template('db/areas.html', areas=areas_list)

@areas_bp.route('/areas/new')
def new_area():
    """Form per nuova area"""
    scenarios = execute_query("SELECT scenario_id, name, description FROM scenarios ORDER BY name", fetch=True)
    if not scenarios:
        scenarios = []
    
    # Recupera i tipi di area esistenti
    existing_types = execute_query("""
        SELECT DISTINCT area_type 
        FROM areas 
        WHERE area_type IS NOT NULL AND area_type != ''
        ORDER BY area_type
    """, fetch=True)
    
    # Converti in lista semplice
    area_types = [t['area_type'] for t in existing_types] if existing_types else []
    
    return render_template('db/area_form.html', 
                         area=None, 
                         scenarios=scenarios, 
                         area_types=area_types,
                         action='create')

@areas_bp.route('/areas/edit/<area_id>')
def edit_area(area_id):
    """Form per modificare un'area"""
    area = execute_query("""
        SELECT
            area_id, name, description, code, scenario_id, area_type, metadata,
            ST_AsText(geometry) AS area_geometry,
            ST_Y(center_coordinates) AS latitude,
            ST_X(center_coordinates) AS longitude
        FROM areas WHERE area_id = %s
    """, (area_id,), fetch=True)

    if area:
        scenarios = execute_query("SELECT scenario_id, name FROM scenarios ORDER BY name", fetch=True)
        
        # Recupera i tipi di area esistenti
        existing_types = execute_query("""
            SELECT DISTINCT area_type 
            FROM areas 
            WHERE area_type IS NOT NULL AND area_type != ''
            ORDER BY area_type
        """, fetch=True)
        
        # Converti in lista semplice
        area_types = [t['area_type'] for t in existing_types] if existing_types else []
        
        return render_template('db/area_form.html', 
                             area=area[0], 
                             scenarios=scenarios, 
                             area_types=area_types,
                             action='edit')
    else:
        flash('Area non trovata', 'error')
        return redirect(url_for('areas.areas'))

@areas_bp.route('/save_area', methods=['POST'])
def save_area():
    """Salva un'area (crea o aggiorna)"""
    data = request.form
    
    # Debug: stampa tutti i dati ricevuti
    print("=== DEBUG SAVE_AREA ===")
    for key, value in data.items():
        print(f"{key}: {value}")
    print("========================")
    
    # Validazione base
    if not data.get('name') or not data.get('scenario_id'):
        flash('Nome area e scenario sono obbligatori', 'error')
        return redirect(request.referrer)

    # Validazione geometria
    area_geometry_wkt = data.get('area_geometry')
    center_latitude = data.get('center_latitude')
    center_longitude = data.get('center_longitude')
    
    if not area_geometry_wkt:
        flash('Geometria dell\'area non definita. Disegna un poligono sulla mappa.', 'error')
        return redirect(request.referrer)
    
    # Validazione codice area (per nuove aree)
    area_code = data.get('area_code', '').strip()
    if not data.get('area_id') and not area_code:  # Nuova area senza codice
        flash('Codice area mancante. Seleziona prima uno scenario.', 'error')
        return redirect(request.referrer)

    # PRE-VALIDAZIONE: Controlla se nome già esiste nello stesso scenario
    if not data.get('area_id'):  # Solo per nuove aree
        existing_check = execute_query("""
            SELECT area_id FROM areas 
            WHERE scenario_id = %s AND LOWER(name) = LOWER(%s)
        """, (data['scenario_id'], data['name'].strip()), fetch=True)
        
        if existing_check:
            flash('Esiste già un\'area con questo nome in questo scenario. Scegli un nome diverso.', 'error')
            return redirect(request.referrer)

    try:
        # Estrazione metadata
        metadata = {}
        if data.get('reference_doc'):
            metadata['reference_doc'] = data.get('reference_doc')
        
        print(f"WKT ricevuto: {area_geometry_wkt}")
        print(f"Centro: lat={center_latitude}, lng={center_longitude}")
        print(f"Codice area: {area_code}")
        
        if data.get('area_id'): # UPDATE
            query = """
                UPDATE areas
                SET name = %s, description = %s, scenario_id = %s, area_type = %s, 
                    metadata = %s, center_coordinates = ST_Point(%s, %s, 4326), 
                    geometry = ST_GeomFromText(%s, 4326)
                WHERE area_id = %s
            """
            params = (
                data['name'],
                data.get('description', ''),
                data['scenario_id'],
                data['area_type'] if data.get('area_type') else None,
                json.dumps(metadata),
                float(center_longitude),
                float(center_latitude),
                area_geometry_wkt,
                data['area_id']
            )
        else: # INSERT  
            query = """
                INSERT INTO areas (name, description, code, scenario_id, area_type, metadata, 
                                 center_coordinates, geometry)
                VALUES (%s, %s, %s, %s, %s, %s, ST_Point(%s, %s, 4326), ST_GeomFromText(%s, 4326))
            """
            params = (
                data['name'],
                data.get('description', ''),
                area_code,
                data['scenario_id'],
                data['area_type'] if data.get('area_type') else None,
                json.dumps(metadata),
                float(center_longitude),
                float(center_latitude),
                area_geometry_wkt
            )
        
        print(f"Query: {query}")
        print(f"Params: {params}")
        
        result = execute_query(query, params)
        if result:
            flash('Area salvata con successo!', 'success')
        else:
            # Se execute_query ritorna None, significa che c'è stato un errore
            # L'errore specifico è già stato stampato nel console da utils/db.py
            flash('Errore durante il salvataggio. Controlla che il nome non sia duplicato nello stesso scenario.', 'error')

    except Exception as e:
        print(f"Errore save_area: {e}")
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        return redirect(request.referrer)

    return redirect(url_for('areas.areas'))

@areas_bp.route('/areas/delete/<area_id>')
def delete_area(area_id):
    """Elimina un'area"""
    if execute_query("DELETE FROM areas WHERE area_id = %s", (area_id,)):
        flash('Area eliminata con successo!', 'success')
    else:
        flash('Errore durante l\'eliminazione dell\'area', 'error')
    return redirect(url_for('areas.areas'))
    

@areas_bp.route('/api/check_area_name')
def check_area_name():
    """API: Controlla se nome area già exists nello scenario"""
    scenario_id = request.args.get('scenario_id')
    name = request.args.get('name')
    exclude_area_id = request.args.get('exclude_area_id')
    
    if not scenario_id or not name:
        return jsonify({'error': 'Parametri mancanti'}), 400
    
    try:
        # Query per controllare duplicati
        if exclude_area_id:
            # Per edit - escludi l'area corrente
            query = """
                SELECT COUNT(*) as count FROM areas 
                WHERE scenario_id = %s AND LOWER(name) = LOWER(%s) AND area_id != %s
            """
            params = (scenario_id, name.strip(), exclude_area_id)
        else:
            # Per nuovo - controlla tutti
            query = """
                SELECT COUNT(*) as count FROM areas 
                WHERE scenario_id = %s AND LOWER(name) = LOWER(%s)
            """
            params = (scenario_id, name.strip())
        
        result = execute_query(query, params, fetch=True)
        exists = result[0]['count'] > 0 if result else False
        
        return jsonify({'exists': exists})
        
    except Exception as e:
        print(f"Errore check_area_name: {e}")
        return jsonify({'error': 'Errore server'}), 500

@areas_bp.route('/api/generate_area_code/<scenario_id>')
def generate_area_code(scenario_id):
    """API: Genera codice area per scenario"""
    try:
        # 1. Ottieni codice scenario
        scenario = execute_query("""
            SELECT code FROM scenarios WHERE scenario_id = %s
        """, (scenario_id,), fetch=True)
        
        if not scenario or not scenario[0]['code']:
            return jsonify({'error': 'Scenario non trovato o senza codice'}), 404
        
        scenario_code = scenario[0]['code']
        
        # 2. Conta aree esistenti per questo scenario
        count_result = execute_query("""
            SELECT COUNT(*) as total FROM areas WHERE scenario_id = %s
        """, (scenario_id,), fetch=True)
        
        total_areas = count_result[0]['total'] if count_result else 0
        next_number = total_areas + 1
        
        # 3. Genera codice completo
        area_code = f"{scenario_code}-{next_number:03d}"
        
        return jsonify({'code': area_code})
        
    except Exception as e:
        print(f"Errore generazione codice area: {e}")
        return jsonify({'error': 'Errore server'}), 500