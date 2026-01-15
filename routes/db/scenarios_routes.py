from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
import psycopg2  # <-- AGGIUNTO: per gestire IntegrityError
import json
from datetime import datetime
import logging
from utils.db import execute_query

scenarios_bp = Blueprint('scenarios', __name__, template_folder='templates')
# ================================================
# SCENARIOS MANAGEMENT
# ================================================
@scenarios_bp.route('/scenarios')
def scenarios():
    """Lista scenarios"""
    scenarios_list = execute_query("""
        SELECT
            scenario_id, name, description, code,
            ST_Y(center_coordinates) as latitude, ST_X(center_coordinates) as longitude,
            metadata, created_at
        FROM scenarios
        ORDER BY name
    """, fetch=True)
    
    return render_template('db/scenarios.html', scenarios=scenarios_list)

@scenarios_bp.route('/scenarios/new')
def new_scenario():
    """Form nuovo scenario"""
    return render_template('db/scenario_form.html', scenario=None, action='create')

@scenarios_bp.route('/scenarios/edit/<scenario_id>')
def edit_scenario(scenario_id):
    """Form modifica scenario"""
    scenario = execute_query("""
        SELECT
            scenario_id, name, description, code,
            ST_Y(center_coordinates) as latitude, ST_X(center_coordinates) as longitude,
            metadata
        FROM scenarios WHERE scenario_id = %s
    """, (scenario_id,), fetch=True)
    
    if scenario:
        return render_template('db/scenario_form.html', scenario=scenario[0], action='edit')
    else:
        flash('Scenario non trovato', 'error')
        return redirect(url_for('scenarios.scenarios'))

@scenarios_bp.route('/scenarios/save', methods=['POST'])
def save_scenario():
    """Salva scenario (create/update) - VERSIONE AGGIORNATA"""
    data = request.form
    
    # Validazione dati AGGIORNATA
    if not data.get('name') or not data.get('latitude') or not data.get('longitude') or not data.get('code'):
        flash('Campi obbligatori mancanti (nome, coordinate, codice)', 'error')
        return redirect(request.referrer)
    
    try:
        lat = float(data['latitude'])
        lng = float(data['longitude'])
        code = data['code'].strip().upper()
        
        # VALIDAZIONE: Code univoco (solo per nuovi o se code è cambiato)
        if data.get('scenario_id'):
            # UPDATE: verifica se code è cambiato
            existing = execute_query("SELECT code FROM scenarios WHERE scenario_id = %s", (data['scenario_id'],), fetch=True)
            if existing and existing[0]['code'] != code:
                # Code è cambiato, verifica unicità
                duplicate = execute_query("SELECT scenario_id FROM scenarios WHERE code = %s AND scenario_id != %s", 
                                        (code, data['scenario_id']), fetch=True)
                if duplicate:
                    flash(f'Codice "{code}" già esistente in altro scenario', 'error')
                    return redirect(request.referrer)
        else:
            # INSERT: verifica unicità
            duplicate = execute_query("SELECT scenario_id FROM scenarios WHERE code = %s", (code,), fetch=True)
            if duplicate:
                flash(f'Codice "{code}" già esistente', 'error')
                return redirect(request.referrer)
        
        # Metadata SENZA project_code (ora è campo separato)
        metadata = {}
        if data.get('client'):
            metadata['client'] = data['client']
        if data.get('start_date'):
            metadata['start_date'] = data['start_date']
        
        if data.get('scenario_id'):  # UPDATE
            query = """
                UPDATE scenarios
                SET name = %s, description = %s, code = %s, 
                    center_coordinates = ST_Point(%s, %s, 4326), metadata = %s
                WHERE scenario_id = %s
            """
            params = (data['name'], data['description'], code, lng, lat,
                     json.dumps(metadata), data['scenario_id'])
        else:  # INSERT
            query = """
                INSERT INTO scenarios (name, description, code, center_coordinates, metadata)
                VALUES (%s, %s, %s, ST_Point(%s, %s, 4326), %s)
            """
            params = (data['name'], data['description'], code, lng, lat, json.dumps(metadata))
        
        if execute_query(query, params):
            flash('Scenario salvato con successo!', 'success')
        else:
            flash('Errore durante il salvataggio', 'error')
            
    except ValueError:
        flash('Coordinate non valide', 'error')
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('scenarios.scenarios'))

@scenarios_bp.route('/scenarios/delete/<scenario_id>')
def delete_scenario(scenario_id):
    """Elimina scenario"""
    if execute_query("DELETE FROM scenarios WHERE scenario_id = %s", (scenario_id,)):
        flash('Scenario eliminato', 'success')
    else:
        flash('Errore durante eliminazione', 'error')
    
    return redirect(url_for('scenarios.scenarios'))

# ================================================
# API ENDPOINTS
# ================================================
@scenarios_bp.route('/api/scenarios')
def api_scenarios():
    """API: Lista scenarios"""
    scenarios_list = execute_query("""
        SELECT
            scenario_id, name, description, code,
            ST_Y(center_coordinates) as latitude, ST_X(center_coordinates) as longitude,
            metadata, created_at
        FROM scenarios
        ORDER BY name
    """, fetch=True)
    
    return jsonify(scenarios_list if scenarios_list else [])

@scenarios_bp.route('/api/scenario_coordinates/<scenario_id>')
def api_scenario_coordinates(scenario_id):
    """API: Restituisce le coordinate di un scenario"""
    try:
        scenario = execute_query("""
            SELECT
                ST_Y(center_coordinates) as latitude, 
                ST_X(center_coordinates) as longitude
            FROM scenarios 
            WHERE scenario_id = %s
        """, (scenario_id,), fetch=True)
        
        if scenario and len(scenario) > 0:
            return jsonify({
                'latitude': scenario[0]['latitude'],
                'longitude': scenario[0]['longitude']
            })
        else:
            return jsonify({'error': 'Scenario non trovato'}), 404
            
    except Exception as e:
        print(f"Errore API scenario coordinates: {e}")
        return jsonify({'error': 'Errore server'}), 500