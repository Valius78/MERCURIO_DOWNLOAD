# ================================================
# PARAMETERS_ROUTES.PY - VERSIONE AGGIORNATA CON GENERATE_ENTITY_CODE
# ================================================
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
import json
from datetime import datetime
import logging

from utils.db import execute_query


parameters_bp = Blueprint('parameters', __name__, template_folder='templates')

@parameters_bp.route('/parameters')
def parameters():
    """Lista tutti i parameters con dati per filtri"""
    
    parameters_list = execute_query("""
        SELECT p.parameter_id, p.channel_id, p.name, p.description, p.code,
               p.data_type, p.unit, p.metadata, p.created_at,
               ST_X(p.coordinates) as longitude,
               ST_Y(p.coordinates) as latitude,
               c.name as channel_name, c.code as channel_code,
               i.item_id, i.name as item_name,i.acquisition_type,
               a.name as area_name,
               s.name as scenario_name,
               m.name as measurement_name
        FROM parameters p
        LEFT JOIN channels c ON p.channel_id = c.channel_id
        LEFT JOIN items i ON c.item_id = i.item_id
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        LEFT JOIN measurements m ON i.measurement_id = m.measurement_id
        ORDER BY p.created_at DESC
    """, fetch=True)

    # Conta totale parameters
    total_parameters = len(parameters_list) if parameters_list else 0

    filter_relations = execute_query("""
        SELECT DISTINCT 
               s.name as scenario_name,
               a.name as area_name,
               i.item_id, i.name as item_name, i.code as item_code,
               c.channel_id, c.name as channel_name, c.code as channel_code
        FROM parameters p
        JOIN channels c ON p.channel_id = c.channel_id
        JOIN items i ON c.item_id = i.item_id
        JOIN areas a ON i.area_id = a.area_id
        JOIN scenarios s ON a.scenario_id = s.scenario_id
        ORDER BY s.name, a.name, i.name, c.name
    """, fetch=True)
    
    filter_options = {
        'scenarios': execute_query("""
            SELECT DISTINCT s.name FROM scenarios s
            JOIN areas a ON s.scenario_id = a.scenario_id
            JOIN items i ON a.area_id = i.area_id
            JOIN channels c ON i.item_id = c.item_id
            JOIN parameters p ON c.channel_id = p.channel_id
            WHERE s.name IS NOT NULL
            ORDER BY s.name
        """, fetch=True),
        'areas': execute_query("""
            SELECT DISTINCT a.name FROM areas a
            JOIN items i ON a.area_id = i.item_id
            JOIN channels c ON i.item_id = c.item_id
            JOIN parameters p ON c.channel_id = p.channel_id
            WHERE a.name IS NOT NULL
            ORDER BY a.name
        """, fetch=True),
        'item_list': execute_query("""
            SELECT DISTINCT i.item_id, i.name, i.code FROM items i
            JOIN channels c ON i.item_id = c.item_id
            JOIN parameters p ON c.channel_id = p.channel_id
            WHERE i.name IS NOT NULL
            ORDER BY i.name
        """, fetch=True),
        'channel_list': execute_query("""
            SELECT DISTINCT c.channel_id, c.name, c.code FROM channels c
            JOIN parameters p ON c.channel_id = p.channel_id
            WHERE c.name IS NOT NULL
            ORDER BY c.name
        """, fetch=True)
    }
    
    return render_template('db/parameters.html', 
                         parameters=parameters_list or [], 
                         filter_options=filter_options,
                         filter_relations=filter_relations or [],
                         total_parameters=total_parameters)


@parameters_bp.route('/parameters/edit/<parameter_id>')
def edit_parameter(parameter_id):
    """Form per modificare parameter esistente"""
    parameter = execute_query("""
        SELECT p.parameter_id, p.channel_id, p.name, p.description, p.code,
               p.data_type, p.unit, p.metadata,
               ST_X(p.coordinates) as longitude,
               ST_Y(p.coordinates) as latitude,
               c.name as channel_name, c.code as channel_code,
               i.item_id, i.name as item_name,i.acquisition_type,
               a.name as area_name,
               a.area_id,           
               s.name as scenario_name,
               s.scenario_id 
        FROM parameters p
        LEFT JOIN channels c ON p.channel_id = c.channel_id
        LEFT JOIN items i ON c.item_id = i.item_id
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        WHERE p.parameter_id = %s
    """, (parameter_id,), fetch=True)
    
    if not parameter:
        flash('Parameter non trovato', 'error')
        return redirect(url_for('parameters.parameters'))
    
    channels = execute_query("""
        SELECT c.channel_id, c.name, c.code,
               ST_X(c.coordinates) as longitude,
               ST_Y(c.coordinates) as latitude,
               i.item_id, i.name as item_name,i.acquisition_type,
               a.name as area_name,
               s.name as scenario_name
        FROM channels c
        LEFT JOIN items i ON c.item_id = i.item_id
        LEFT JOIN areas a ON i.area_id = a.area_id  
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        ORDER BY s.name, a.name, c.name
    """, fetch=True)
    
    scenarios = execute_query("""
        SELECT scenario_id, name, code 
        FROM scenarios 
        ORDER BY name
    """, fetch=True)
    
    areas = execute_query("""
        SELECT a.area_id, a.name, a.code, a.scenario_id,
               s.name as scenario_name
        FROM areas a
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        ORDER BY s.name, a.name
    """, fetch=True)
    
    items = execute_query("""
        SELECT i.item_id, i.name, i.code, i.area_id,
               a.name as area_name,
               s.name as scenario_name
        FROM items i
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        ORDER BY s.name, a.name, i.name
    """, fetch=True)
    
    return render_template('db/parameter_form.html',
                         parameter=parameter[0],
                         scenarios=scenarios or [],  # AGGIUNTO
                         areas=areas or [],          # AGGIUNTO
                         items=items or [],          # AGGIUNTO
                         channels=channels or [],
                         action='edit')
   



# =============================================
# API ESISTENTE: MANTENIAMO PER COMPATIBILITÀ
# =============================================        
@parameters_bp.route('/api/parameters/<int:parameter_id>/metadata')
def api_parameter_metadata(parameter_id):
    """API per ottenere metadata di un parameter specifico"""
    try:
        parameter = execute_query("""
            SELECT metadata 
            FROM parameters 
            WHERE parameter_id = %s
        """, (parameter_id,), fetch=True)
        
        if not parameter:
            return jsonify({'error': 'Parameter non trovato'}), 404
        
        metadata = parameter[0]['metadata'] or '{}'
        
        if isinstance(metadata, str):
            return jsonify({'metadata': metadata})
        else:
            return jsonify({'metadata': json.dumps(metadata)})
            
    except Exception as e:
        print(f"Errore API parameter metadata: {e}")
        return jsonify({'error': 'Errore server'}), 500
        


# =============================================
# NUOVA API: CONTEGGIO READINGS PER PARAMETER
# =============================================
@parameters_bp.route('/api/parameter/<int:parameter_id>/readings_count')
def get_parameter_readings_count(parameter_id):
    """API: Ottiene il conteggio dei readings per un parameter_id specifico"""
    try:
        count_result = execute_query(
            "SELECT COUNT(*) FROM readings WHERE parameter_id = %s",
            (parameter_id,),
            fetch=True
        )
        count = count_result[0]['count'] if count_result and count_result[0]['count'] is not None else 0
        return jsonify({'count': count})

    except Exception as e:
        logging.error(f"Errore get_parameter_readings_count: {e}")
        return jsonify({'count': -1, 'error': 'Errore server'}), 500

