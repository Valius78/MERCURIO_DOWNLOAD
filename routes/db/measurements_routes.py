# ================================================
# MEASUREMENTS_ROUTES.PY - VERSIONE PERSONALIZZATA
# ================================================
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from utils.db import execute_query
import json
from datetime import datetime
import logging

measurements_bp = Blueprint('measurements', __name__, template_folder='templates')

# ================================================
# ROUTES
# ================================================
@measurements_bp.route('/measurements')
def measurements():
    """Lista dei measurements con informazioni system e conteggi"""
    measurements_list = execute_query("""
        SELECT
            m.measurement_id,
            m.name,
            m.description,
            m.code,
            m.system_id,
            m.metadata,
            m.created_at,
            s.name as system_name,
            s.description as system_description,
            COUNT(DISTINCT i.item_id) as total_items,
            COUNT(DISTINCT c.channel_id) as total_channels,
            COUNT(DISTINCT c.channel_id) as total_parameters
        FROM measurements m
        LEFT JOIN systems s ON m.system_id = s.system_id
        LEFT JOIN items i ON m.measurement_id = i.measurement_id
        LEFT JOIN channels c ON i.item_id = c.item_id
        GROUP BY m.measurement_id, m.name, m.description, m.code, m.system_id, 
                 m.metadata, m.created_at, s.name, s.description
        ORDER BY s.name, m.name
    """, fetch=True)
    
    if not measurements_list:
        measurements_list = []
    
    return render_template('db/measurements.html', measurements=measurements_list)

@measurements_bp.route('/measurements/new')
def new_measurement():
    """Form per nuovo measurement"""
    # Carica lista systems disponibili
    systems = execute_query("""
        SELECT system_id, name, description 
        FROM systems 
        ORDER BY name
    """, fetch=True)
    
    if not systems:
        flash('Nessun system disponibile. Crea prima almeno un system.', 'error')
        return redirect(url_for('systems.systems'))
    
    return render_template('db/measurement_form.html', measurement=None, systems=systems, action='create')

@measurements_bp.route('/measurements/edit/<measurement_id>')
def edit_measurement(measurement_id):
    """Form per modificare un measurement"""
    measurement = execute_query("""
        SELECT
            m.measurement_id,
            m.name,
            m.description,
            m.code,
            m.system_id,
            m.created_at,
            m.metadata,
            s.name as system_name
        FROM measurements m
        LEFT JOIN systems s ON m.system_id = s.system_id
        WHERE m.measurement_id = %s
    """, (measurement_id,), fetch=True)
    
    if not measurement:
        flash('Measurement non trovato', 'error')
        return redirect(url_for('measurements.measurements'))
    
    # Carica lista systems
    systems = execute_query("""
        SELECT system_id, name, description 
        FROM systems 
        ORDER BY name
    """, fetch=True)
    
    return render_template('db/measurement_form.html', 
                         measurement=measurement[0], 
                         systems=systems, 
                         action='edit')

@measurements_bp.route('/save_measurement', methods=['POST'])
def save_measurement():
    """Salva un measurement (crea o aggiorna)"""
    data = request.form
    
    # Debug
    print("=== DEBUG SAVE_MEASUREMENT ===")
    for key, value in data.items():
        print(f"{key}: {value}")
    print("===============================")
    
    # Validazione base
    if not data.get('name') or not data.get('system_id'):
        flash('Nome measurement e system sono obbligatori', 'error')
        return redirect(request.referrer)
    
    measurement_id = data.get('measurement_id')
    name = data.get('name').strip()
    description = data.get('description', '').strip()
    system_id = data.get('system_id')
    code = data.get('code', '').strip().upper()  # Forza uppercase per consistency
    
    # Gestione metadata - può essere JSON o stringa vuota
    metadata_str = data.get('metadata', '').strip()
    if metadata_str:
        try:
            metadata = json.loads(metadata_str)
        except json.JSONDecodeError:
            flash('Formato JSON metadata non valido', 'error')
            return redirect(request.referrer)
    else:
        metadata = {}
    
    try:
        if measurement_id:  # UPDATE
            result = execute_query("""
                UPDATE measurements SET
                    name = %s,
                    description = %s,
                    system_id = %s,
                    code = %s,
                    metadata = %s
                WHERE measurement_id = %s
            """, (name, 
                  description if description else None, 
                  system_id, 
                  code if code else None,
                  json.dumps(metadata),
                  measurement_id))
            
            if result:
                flash(f'Measurement "{name}" aggiornato con successo', 'success')
            else:
                flash('Errore durante l\'aggiornamento', 'error')
        else:  # INSERT
            # Verifica unicità codice se fornito
            if code:
                existing = execute_query("""
                    SELECT measurement_id FROM measurements WHERE code = %s
                """, (code,), fetch=True)
                if existing:
                    flash(f'Codice "{code}" già esistente', 'error')
                    return redirect(request.referrer)
            
            result = execute_query("""
                INSERT INTO measurements (name, description, system_id, code, metadata)
                VALUES (%s, %s, %s, %s, %s)
            """, (name, 
                  description if description else None, 
                  system_id, 
                  code if code else None,
                  json.dumps(metadata)))
            
            if result:
                flash(f'Measurement "{name}" creato con successo', 'success')
            else:
                flash('Errore durante la creazione', 'error')
    
    except Exception as e:
        print(f"Errore SQL: {e}")
        flash('Errore durante il salvataggio', 'error')
    
    return redirect(url_for('measurements.measurements'))

@measurements_bp.route('/delete_measurement/<measurement_id>', methods=['POST'])
def delete_measurement(measurement_id):
    """Elimina un measurement"""
    # Verifica se ci sono items che usano questo measurement
    references = execute_query("""
        SELECT COUNT(*) as items_count
        FROM items
        WHERE measurement_id = %s
    """, (measurement_id,), fetch=True)
    
    if references and references[0]['items_count'] > 0:
        flash('Impossibile eliminare: Measurement utilizzato da uno o più items', 'error')
        return redirect(url_for('measurements.measurements'))
    
    # Elimina measurement
    result = execute_query("""
        DELETE FROM measurements WHERE measurement_id = %s
    """, (measurement_id,))
    
    if result:
        flash('Measurement eliminato con successo', 'success')
    else:
        flash('Errore durante l\'eliminazione', 'error')
    
    return redirect(url_for('measurements.measurements'))

# ================================================
# API ENDPOINTS
# ================================================
@measurements_bp.route('/api/measurements')
def api_measurements():
    """API per ottenere lista measurements"""
    measurements_list = execute_query("""
        SELECT
            m.measurement_id,
            m.name,
            m.description,
            m.code,
            m.system_id,
            m.metadata,
            s.name as system_name
        FROM measurements m
        LEFT JOIN systems s ON m.system_id = s.system_id
        ORDER BY s.name, m.name
    """, fetch=True)
    
    return jsonify(measurements_list if measurements_list else [])

@measurements_bp.route('/api/measurements/by_system/<system_id>')
def api_measurements_by_system(system_id):
    """API per ottenere measurements di un system specifico"""
    measurements_list = execute_query("""
        SELECT measurement_id, name, description, code, metadata
        FROM measurements
        WHERE system_id = %s
        ORDER BY name
    """, (system_id,), fetch=True)
    
    return jsonify(measurements_list if measurements_list else [])

@measurements_bp.route('/api/measurements/<measurement_id>/stats')
def api_measurement_stats(measurement_id):
    """API: Statistiche per un measurement specifico"""
    try:
        stats = execute_query("""
            SELECT
                COUNT(DISTINCT i.item_id) as items_count,
                COUNT(DISTINCT c.channel_id) as channels_count,
                COUNT(DISTINCT p.parameter_id) as parameters_count
            FROM measurements m
            LEFT JOIN items i ON m.measurement_id = i.measurement_id
            LEFT JOIN channels c ON i.item_id = c.item_id
            LEFT JOIN parameters p ON c.channel_id = p.channel_id
            WHERE m.measurement_id = %s
        """, (measurement_id,), fetch=True)
        
        return jsonify(stats[0] if stats else {
            'items_count': 0,
            'channels_count': 0,
            'parameters_count': 0
        })
        
    except Exception as e:
        print(f"Errore API measurement stats: {e}")
        return jsonify({'error': 'Errore server'}), 500

@measurements_bp.route('/api/items/by_measurement/<measurement_id>')
def api_items_by_measurement(measurement_id):
    """API: Items che usano un measurement specifico"""
    try:
        items = execute_query("""
            SELECT
                i.item_id,
                i.name,
                i.code,
                i.description,
                a.name as area_name
            FROM items i
            LEFT JOIN areas a ON i.area_id = a.area_id
            WHERE i.measurement_id = %s
            ORDER BY i.name
        """, (measurement_id,), fetch=True)
        
        return jsonify(items if items else [])
        
    except Exception as e:
        print(f"Errore API items by measurement: {e}")
        return jsonify({'error': 'Errore server'}), 500