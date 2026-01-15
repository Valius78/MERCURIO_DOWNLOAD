# ================================================
# SYSTEMS_ROUTES.PY - VERSIONE CORRETTA
# ================================================
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from utils.db import execute_query
import json
from datetime import datetime
import logging

systems_bp = Blueprint('systems', __name__, template_folder='templates')
from utils.db import execute_query
# ================================================
# ROUTES
# ================================================
@systems_bp.route('/systems')
def systems():

    # TEST PERMESSI - logga ma non blocca
    from routes.core.auth_routes import check_permission_debug
    check_permission_debug("database.read", "Visualizzazione lista systems")
    
    """Lista dei systems con conteggi corretti"""
    systems_list = execute_query("""
        SELECT
            s.system_id, 
            s.name, 
            s.description,
            -- Conta measurements collegati a questo system
            COUNT(DISTINCT m.measurement_id) as total_measurements,
            -- Conta items attraverso measurements
            COUNT(DISTINCT i.item_id) as total_items,
            -- Conta channels invece di parameters
            COUNT(DISTINCT c.channel_id) as total_channels
        FROM systems s
        LEFT JOIN measurements m ON s.system_id = m.system_id
        LEFT JOIN items i ON m.measurement_id = i.measurement_id
        LEFT JOIN channels c ON i.item_id = c.item_id
        GROUP BY s.system_id, s.name, s.description
        ORDER BY s.name
    """, fetch=True)
    
    if not systems_list:
        systems_list = []
    
    return render_template('db/systems.html', systems=systems_list)

@systems_bp.route('/systems/new')
def new_system():
    """Form per nuovo system"""
    return render_template('db/system_form.html', system=None, action='create')

@systems_bp.route('/systems/edit/<system_id>')
def edit_system(system_id):
    """Form per modificare un system"""
    system = execute_query("""
        SELECT system_id, name, description
        FROM systems WHERE system_id = %s
    """, (system_id,), fetch=True)
    
    if system:  # ← CORRETTO: usa "system" invece di "mt"
        return render_template('db/system_form.html', system=system[0], action='edit')
    else:
        flash('System non trovato', 'error')
        return redirect(url_for('systems.systems'))

@systems_bp.route('/save_system', methods=['POST'])
def save_system():
    """Salva un system (crea o aggiorna)"""
    
    from routes.core.auth_routes import check_permission_debug
    check_permission_debug("database.write", "Salvataggio/modifica system")
    
    data = request.form
    
    # Debug: stampa tutti i dati ricevuti
    print("=== DEBUG SAVE_SYSTEM ===")
    for key, value in data.items():
        print(f"{key}: {value}")
    print("==========================")
    
    # Validazione base
    if not data.get('name'):
        flash('Nome system obbligatorio', 'error')
        return redirect(request.referrer)
    
    system_id = data.get('system_id')
    name = data.get('name').strip()
    description = data.get('description', '').strip()
    
    try:
        if system_id:  # Modifica esistente
            result = execute_query("""
                UPDATE systems SET
                    name = %s,
                    description = %s
                WHERE system_id = %s
            """, (name, description if description else None, system_id))
            
            if result:
                flash(f'System "{name}" aggiornato con successo', 'success')
            else:
                flash('Errore durante l\'aggiornamento', 'error')
        else:  # Nuovo system
            result = execute_query("""
                INSERT INTO systems (name, description)
                VALUES (%s, %s)
            """, (name, description if description else None))
            
            if result:
                flash(f'System "{name}" creato con successo', 'success')
            else:
                flash('Errore durante la creazione (Sistema già esistente)', 'error')
    
    except Exception as e:
        print(f"Errore SQL: {e}")
        flash('Errore durante il salvataggio', 'error')
    
    return redirect(url_for('systems.systems'))

@systems_bp.route('/delete_system/<system_id>', methods=['POST'])
def delete_system(system_id):
    """Elimina un system"""
    # Verifica se ci sono riferimenti attraverso measurements
    references = execute_query("""
        SELECT 
            COUNT(DISTINCT m.measurement_id) as measurements_count,
            COUNT(DISTINCT i.item_id) as items_count
        FROM measurements m
        LEFT JOIN items i ON m.measurement_id = i.measurement_id
        WHERE m.system_id = %s
    """, (system_id,), fetch=True)
    
    if references and (references[0]['measurements_count'] > 0 or references[0]['items_count'] > 0):
        flash('Impossibile eliminare: System utilizzato da measurements o items', 'error')
        return redirect(url_for('systems.systems'))
    
    # Elimina system
    result = execute_query("""
        DELETE FROM systems WHERE system_id = %s
    """, (system_id,))
    
    if result:
        flash('System eliminato con successo', 'success')
    else:
        flash('Errore durante l\'eliminazione', 'error')
    
    return redirect(url_for('systems.systems'))

# ================================================
# API ENDPOINTS
# ================================================
@systems_bp.route('/api/systems')
def api_systems():
    """API per ottenere lista systems"""
    systems_list = execute_query("""
        SELECT system_id, name, description
        FROM systems
        ORDER BY name
    """, fetch=True)
    
    return jsonify(systems_list if systems_list else [])