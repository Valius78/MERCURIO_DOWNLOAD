# ================================================
# ITEMS_ROUTES.PY - VERSIONE SENZA PAGINAZIONE
# ================================================
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from utils.db import execute_query

import json
from datetime import datetime
import logging


items_bp = Blueprint('items', __name__, template_folder='templates')

@items_bp.route('/items')
def items():
    """Lista di tutti gli items"""
    
    items_list = execute_query("""
        SELECT DISTINCT
            i.item_id,
            i.name,
            i.description,
            i.code,
            i.coordinates,
            i.elevation_m,
            i.metadata,
            i.created_at,
            i.acquisition_type,
            i.acquisition_date,
            a.name as area_name,
            a.code as area_code,
            s.name as scenario_name,
            s.code as scenario_code,
            m.name as measurement_name,
            m.code as measurement_code,
            sys.name as system_name,
            ST_X(i.coordinates) as longitude,
            ST_Y(i.coordinates) as latitude,
            COUNT(DISTINCT c.channel_id) as total_channels
        FROM items i
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        LEFT JOIN measurements m ON i.measurement_id = m.measurement_id
        LEFT JOIN systems sys ON m.system_id = sys.system_id
        LEFT JOIN channels c ON i.item_id = c.item_id
        GROUP BY i.item_id, i.name, i.description, i.code, i.coordinates, 
                 i.elevation_m, i.metadata, i.created_at, i.acquisition_type, i.acquisition_date,
                 a.name, a.code, s.name, s.code, m.name, m.code, sys.name
        ORDER BY i.created_at DESC
    """, fetch=True)
    
    # Conta totale items
    total_items = len(items_list) if items_list else 0
    
    return render_template('db/items.html', 
                          items=items_list or [],
                          total_items=total_items)


                         



@items_bp.route('/items/edit/<item_id>')
def edit_item(item_id):
    """Form per modificare item"""
    item = execute_query("""
        SELECT i.item_id, i.area_id, i.measurement_id, i.name, i.description, i.code,
               i.acquisition_type, i.acquisition_date,
               ST_X(i.coordinates) as longitude,
               ST_Y(i.coordinates) as latitude,
               i.elevation_m, i.metadata,
               a.name as area_name,
               a.code as area_code,        
               s.name as scenario_name,
               s.code as scenario_code,    
               s.scenario_id,
               m.name as measurement_name,
               sys.name as system_name
        FROM items i
        LEFT JOIN areas a ON i.area_id = a.area_id
        LEFT JOIN scenarios s ON a.scenario_id = s.scenario_id
        LEFT JOIN measurements m ON i.measurement_id = m.measurement_id
        LEFT JOIN systems sys ON m.system_id = sys.system_id
        WHERE i.item_id = %s
    """, (item_id,), fetch=True)
    
    if not item:
        flash('Item non trovato', 'error')
        return redirect(url_for('items.items'))
    
    areas = execute_query("""
        SELECT a.area_id, a.name, a.code,
               s.name as scenario_name,
               s.code as scenario_code,
               ST_Y(a.center_coordinates) as latitude,    
               ST_X(a.center_coordinates) as longitude
        FROM areas a
        JOIN scenarios s ON a.scenario_id = s.scenario_id
        ORDER BY s.name, a.name
    """, fetch=True)
    
    measurements = execute_query("""
        SELECT m.measurement_id, m.name, m.code, m.description,
               sys.name as system_name
        FROM measurements m
        JOIN systems sys ON m.system_id = sys.system_id
        ORDER BY sys.name, m.name
    """, fetch=True)
    
    scenarios = execute_query("""
        SELECT scenario_id, name, code 
        FROM scenarios 
        ORDER BY name
    """, fetch=True)
    
    return render_template('db/item_form.html',
                         item=item[0],
                         scenarios=scenarios or [],  # AGGIUNTO
                         areas=areas or [],
                         measurements=measurements or [],
                         action='edit')




    
    
@items_bp.route('/api/items/<int:item_id>/metadata')
def api_item_metadata(item_id):
    """API per ottenere metadata di un item specifico"""
    try:
        item = execute_query("""
            SELECT metadata 
            FROM items 
            WHERE item_id = %s
        """, (item_id,), fetch=True)
        
        if not item:
            return jsonify({'error': 'Item non trovato'}), 404
        
        metadata = item[0]['metadata'] or '{}'
        
        # Se è già una stringa JSON, restituiscila direttamente
        if isinstance(metadata, str):
            return jsonify({'metadata': metadata})
        # Se è un dict, convertilo in stringa JSON
        else:
            return jsonify({'metadata': json.dumps(metadata)})
            
    except Exception as e:
        print(f"Errore API item metadata: {e}")
        return jsonify({'error': 'Errore server'}), 500
        
# Aggiungere questi endpoint alla fine di items_routes.py




