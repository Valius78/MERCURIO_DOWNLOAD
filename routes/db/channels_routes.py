# ================================================
# CHANNELS_ROUTES.PY - VERSIONE AGGIORNATA CON GENERATE_ENTITY_CODE
# ================================================
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
import json
from datetime import datetime
import logging

from utils.db import execute_query


channels_bp = Blueprint('channels', __name__, template_folder='templates')

@channels_bp.route('/channels')
def channels():
    """Lista tutti i channels con dati per filtri"""
    
    channels_list = execute_query("""
        SELECT c.channel_id, c.item_id, c.name, c.description, c.code, c.status,
               c.is_continuous, c.acq_frequency, c.metadata, 
               ST_X(c.coordinates) as longitude,
               ST_Y(c.coordinates) as latitude,
               c.elevation_m, c.metadata, c.created_at,
               i.name as item_name, i.code as item_code, i.acquisition_type,
               a.name as area_name,
               s.name as scenario_name,
               m.name as measurement_name
        FROM channels c
        LEFT JOIN items i ON c.item_id = i.item_id
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        LEFT JOIN measurements m ON i.measurement_id = m.measurement_id
        ORDER BY c.created_at DESC
    """, fetch=True)

    # Conta totale channels
    total_channels = len(channels_list) if channels_list else 0

    filter_relations = execute_query("""
        SELECT DISTINCT 
               s.name as scenario_name,
               a.name as area_name,
               i.item_id, i.name as item_name, i.code as item_code,
               m.name as measurement_name
        FROM channels c
        JOIN items i ON c.item_id = i.item_id
        JOIN areas a ON i.area_id = a.area_id
        JOIN scenarios s ON a.scenario_id = s.scenario_id
        LEFT JOIN measurements m ON i.measurement_id = m.measurement_id
        ORDER BY s.name, a.name, i.name, m.name
    """, fetch=True)
    
    filter_options = {
        'scenarios': execute_query("""
            SELECT DISTINCT s.name FROM scenarios s
            JOIN areas a ON s.scenario_id = a.scenario_id
            JOIN items i ON a.area_id = i.area_id
            JOIN channels c ON i.item_id = c.item_id
            WHERE s.name IS NOT NULL
            ORDER BY s.name
        """, fetch=True),
        'areas': execute_query("""
            SELECT DISTINCT a.name FROM areas a
            JOIN items i ON a.area_id = i.item_id
            JOIN channels c ON i.item_id = c.item_id
            WHERE a.name IS NOT NULL
            ORDER BY a.name
        """, fetch=True),
        'item_list': execute_query("""
            SELECT DISTINCT i.item_id, i.name, i.code FROM items i
            JOIN channels c ON i.item_id = c.item_id
            WHERE i.name IS NOT NULL
            ORDER BY i.name
        """, fetch=True),
        'measurements': execute_query("""
            SELECT DISTINCT m.name FROM measurements m
            JOIN items i ON m.measurement_id = i.measurement_id
            JOIN channels c ON i.item_id = c.item_id
            WHERE m.name IS NOT NULL
            ORDER BY m.name
        """, fetch=True)
    }
    
    return render_template('db/channels.html', 
                         channels=channels_list or [], 
                         filter_options=filter_options,
                         filter_relations=filter_relations or [],
                         total_channels=total_channels)

@channels_bp.route('/channels/edit/<channel_id>')
def edit_channel(channel_id):
    """Form per modificare channel esistente"""
    channel = execute_query("""
        SELECT c.channel_id, c.item_id, c.name, c.description, c.code,
               c.acq_frequency, c.acquisition_date,
               ST_X(c.coordinates) as longitude,
               ST_Y(c.coordinates) as latitude,
               c.elevation_m, c.status, c.metadata,
               i.name as item_name,
               i.code as item_code,
               i.acquisition_type,
               i.acquisition_date,
               a.name as area_name,
               a.area_id,           
               a.code as area_code, 
               s.name as scenario_name,
               s.scenario_id,       
               s.code as scenario_code  
        FROM channels c
        LEFT JOIN items i ON c.item_id = i.item_id
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        WHERE c.channel_id = %s
    """, (channel_id,), fetch=True) 
    if not channel:
        flash('Channel non trovato', 'error')
        return redirect(url_for('channels.channels'))
    items = execute_query("""
        SELECT i.item_id, i.name, i.code,
               ST_X(i.coordinates) as longitude,
               ST_Y(i.coordinates) as latitude,
               i.acquisition_type, i.acquisition_date,
               i.area_id,
               a.name as area_name,
               s.name as scenario_name
        FROM items i
        LEFT JOIN areas a ON i.area_id = a.area_id  
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        ORDER BY s.name, a.name, i.name
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
    
    return render_template('db/channel_form.html',
                         channel=channel[0],
                         scenarios=scenarios or [],  # AGGIUNTO
                         areas=areas or [],          # AGGIUNTO
                         items=items or [],
                         action='edit')

        
@channels_bp.route('/api/channels/<int:channel_id>/metadata')
def api_channel_metadata(channel_id):
    """API per ottenere metadata di un channel specifico"""
    try:
        channel = execute_query("""
            SELECT metadata 
            FROM channels 
            WHERE channel_id = %s
        """, (channel_id,), fetch=True)
        
        if not channel:
            return jsonify({'error': 'Channel non trovato'}), 404
        
        metadata = channel[0]['metadata'] or '{}'
        
        if isinstance(metadata, str):
            return jsonify({'metadata': metadata})
        else:
            return jsonify({'metadata': json.dumps(metadata)})
            
    except Exception as e:
        print(f"Errore API channel metadata: {e}")
        return jsonify({'error': 'Errore server'}), 500
        
        


