# ================================================
# MERCURIO DATABASE MANAGER - WEB INTERFACE
# ================================================
# Interfaccia web locale per gestione database mercurio_test
#
# INSTALLAZIONE DIPENDENZE:
# pip install flask psycopg2-binary
#
# ESECUZIONE:
# python mercurio_app.py
# Apri browser: http://localhost:5000

from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from utils.flask_logger import setup_flask_logger
import os
import sys
import json
import time
from datetime import datetime
from routes import all_blueprints
from utils.db import execute_query
from dotenv import load_dotenv


START_TIME = time.time()


dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)



def create_app():
    app = Flask(__name__)

    # Registra tutti i blueprint trovati
    for bp in all_blueprints:
        app.register_blueprint(bp)
        #print(f"[DEBUG] Blueprint registrato: {bp.name}")

    # Stampa tutti gli endpoint registrati
    #print("\n[DEBUG] Tutti gli endpoint registrati nell'app:")
    # for rule in app.url_map.iter_rules():
    #     print(f"{rule.endpoint} -> {rule}")

    return app

app=create_app()

# ================================================
# SECRET KEY (da .env) AGGRIONARE
# ================================================
secret_key = os.getenv("SECRET_KEY")

if not secret_key:
    raise RuntimeError("❌ SECRET_KEY non definita nel file .env")

app.secret_key = secret_key
# ========================

# ================================================
# FLASK LOGGER AGGIRONARE
# ================================================
flask_logger = setup_flask_logger("mercurio-flask")

# collega il logger all'app Flask
app.logger.handlers = flask_logger.handlers
app.logger.setLevel(flask_logger.level)

app.logger.info("Applicazione Flask inizializzata")

# ========================

# Crea cartella uploads se non esistente
os.makedirs('uploads/json_configs', exist_ok=True)  

# Registra blueprints
#app.register_blueprint(auth_bp)
#app.register_blueprint(admin_bp)

# app.register_blueprint(areas_bp, url_prefix='/')
# app.register_blueprint(systems_bp, url_prefix='/')
# app.register_blueprint(measurements_bp, url_prefix='/')  # ← NUOVO BLUEPRINT
# app.register_blueprint(items_bp, url_prefix='/')
# app.register_blueprint(channels_bp, url_prefix='/')
# app.register_blueprint(parameters_bp, url_prefix='/')
# app.register_blueprint(wizard_v33_bp, url_prefix='/')
# app.register_blueprint(mappings_bp, url_prefix='/')
# app.register_blueprint(mapping_wizard_bp, url_prefix='/')
# app.register_blueprint(acquisition_bp, url_prefix='/')
# register_readings_api(app)

# 
# app.register_blueprint(api_bp)
# register_multi_format_api(app)

@app.route("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.utcnow().isoformat(),
        "uptime_sec": int(time.time() - START_TIME)
    }


@app.before_request
def require_login():
    """Richiede login per le pagine web, ma lascia libere le API protette da token"""
    from flask import session, request, redirect, url_for

    # Percorsi pubblici che non richiedono login (pagina di login, logout, static files)
    public_paths = [
        '/auth/login',
        '/auth/logout',
        '/static',
        '/api/token',   # opzionale, se hai un endpoint per generare token
    ]

    # ✅ Se la richiesta è per un endpoint API (/api/...), non forziamo il login con sessione
    # (verrà gestito da @token_required nelle API route)
    if request.path.startswith('/api/'):
        return

    # ✅ Se il percorso è tra quelli pubblici, lasciamo passare
    if any(request.path.startswith(path) for path in public_paths):
        return

    # ❌ Se l'utente non è loggato e la pagina non è pubblica → redirect al login
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))


# Context processor per permessi utente nei template
@app.context_processor
def inject_user_permissions():
    """Inietta permessi utente in tutti i template"""
    from routes.core.auth_routes import get_ui_permissions, get_current_user
    
    return {
        'user_permissions': get_ui_permissions(),
        'current_user': get_current_user()
    }
    
# ================================================
# ROUTES PRINCIPALI
# ================================================
@app.route('/')
def index():
    """Dashboard principale con statistiche aggiornate"""
    # Statistiche database
    stats = {}
    stats['scenarios'] = execute_query("SELECT COUNT(*) as count FROM scenarios", fetch=True)
    stats['areas'] = execute_query("SELECT COUNT(*) as count FROM areas", fetch=True)
    stats['systems'] = execute_query("SELECT COUNT(*) as count FROM systems", fetch=True)
    stats['measurements'] = execute_query("SELECT COUNT(*) as count FROM measurements", fetch=True)  # ← NUOVO
    stats['items'] = execute_query("SELECT COUNT(*) as count FROM items", fetch=True)
    stats['channels'] = execute_query("SELECT COUNT(*) as count FROM channels", fetch=True)
    stats['parameters'] = execute_query("SELECT COUNT(*) as count FROM parameters", fetch=True)
    
    # Attività recente aggiornata
    recent_items = execute_query("""
        SELECT i.name, i.code, i.created_at, 'item' as type
        FROM items i
        ORDER BY i.created_at DESC
        LIMIT 3
    """, fetch=True)
    
    recent_areas = execute_query("""
        SELECT a.name, a.code, a.created_at, 'area' as type
        FROM areas a
        ORDER BY a.created_at DESC
        LIMIT 3
    """, fetch=True)
    
    recent_measurements = execute_query("""
        SELECT m.name, m.code, m.created_at, 'measurement' as type,
               s.name as system_name
        FROM measurements m
        LEFT JOIN systems s ON m.system_id = s.system_id
        ORDER BY m.created_at DESC
        LIMIT 3
    """, fetch=True)  # ← NUOVO
    
    recent_scenarios = execute_query("""
        SELECT s.name, s.code, s.created_at, 'scenario' as type
        FROM scenarios s
        ORDER BY s.created_at DESC
        LIMIT 3
    """, fetch=True)

    recent_channels = execute_query("""
        SELECT c.name, c.code, c.created_at, 'channel' as type
        FROM channels c
        ORDER BY c.created_at DESC
        LIMIT 3
    """, fetch=True)

    recent_parameters = execute_query("""
        SELECT p.name, p.code, p.created_at, 'parameter' as type
        FROM parameters p
        ORDER BY p.created_at DESC
        LIMIT 3
    """, fetch=True)
    
    # Combina e ordina attività recenti
    recent_activity = []
    if recent_items:
        recent_activity.extend(recent_items)
    if recent_areas:
        recent_activity.extend(recent_areas)
    if recent_measurements:
        recent_activity.extend(recent_measurements)
    if recent_scenarios:
        recent_activity.extend(recent_scenarios)
    if recent_channels:
        recent_activity.extend(recent_channels)
    if recent_parameters:
        recent_activity.extend(recent_parameters)
    
    recent_activity.sort(key=lambda x: x['created_at'] if x['created_at'] else datetime.min, reverse=True)
    recent_activity = recent_activity[:10]  # Top 10
    
    return render_template('index.html', stats=stats, recent_activity=recent_activity)

@app.route('/test_connection')
def test_connection():
    """Test connessione database"""
    conn = get_db_connection()
    if conn:
        conn.close()
        return jsonify({"status": "success", "message": "Connessione database OK!"})
    else:
        return jsonify({"status": "error", "message": "Errore connessione database"})


# ================================================
# DIAGNOSTICA DATABASE
# ================================================
@app.route('/database/diagnostic')
def database_diagnostic():
    """Diagnostica struttura database per capire cosa c'è e cosa manca"""
    diagnostic_results = {}
    
    try:
        # 1. Lista tutte le tabelle nel database
        tables_query = """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """
        tables = execute_query(tables_query, fetch=True)
        diagnostic_results['tables'] = [t['table_name'] for t in tables] if tables else []
        
        # 2. Struttura tabella scenarios
        scenarios_columns_query = """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'scenarios' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """
        scenarios_columns = execute_query(scenarios_columns_query, fetch=True)
        diagnostic_results['scenarios_columns'] = scenarios_columns or []
        
        # 3. Struttura tabella areas
        areas_columns_query = """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'areas' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """
        areas_columns = execute_query(areas_columns_query, fetch=True)
        diagnostic_results['areas_columns'] = areas_columns or []
        
        # 4. Struttura tabella systems
        systems_columns_query = """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'systems' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """
        systems_columns = execute_query(systems_columns_query, fetch=True)
        diagnostic_results['systems_columns'] = systems_columns or []
        
        # 5. Struttura tabella measurements  ← NUOVO
        measurements_columns_query = """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'measurements' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """
        measurements_columns = execute_query(measurements_columns_query, fetch=True)
        diagnostic_results['measurements_columns'] = measurements_columns or []
        
        # 6. Struttura tabella items
        items_columns_query = """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'items' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """
        items_columns = execute_query(items_columns_query, fetch=True)
        diagnostic_results['items_columns'] = items_columns or []
        
        # 7. Controlla foreign keys
        constraints_query = """
            SELECT 
                tc.constraint_name, 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_schema = 'public';
        """
        constraints = execute_query(constraints_query, fetch=True)
        diagnostic_results['foreign_keys'] = constraints or []
        
        # 8. Count records nelle tabelle principali
        for table in ['scenarios', 'areas', 'systems', 'measurements', 'items', 'channels']:
            if table in diagnostic_results['tables']:
                count_query = f"SELECT COUNT(*) as count FROM {table}"
                count_result = execute_query(count_query, fetch=True)
                diagnostic_results[f'{table}_count'] = count_result[0]['count'] if count_result else 0
        
        # 9. Verifica estensioni PostGIS
        postgis_query = """
            SELECT extname, extversion 
            FROM pg_extension 
            WHERE extname = 'postgis';
        """
        postgis = execute_query(postgis_query, fetch=True)
        diagnostic_results['postgis'] = postgis[0] if postgis else None
        
    except Exception as e:
        diagnostic_results['error'] = str(e)
    
    # Genera report HTML aggiornato
    html_report = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Database Diagnostic - Mercurio</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.2/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container mt-4">
            <div class="row">
                <div class="col">
                    <h1><i class="fas fa-database"></i> Database Diagnostic Report</h1>
                    <p class="text-muted">Analisi struttura database mercurio_test</p>
                </div>
                <div class="col-auto">
                    <a href="/" class="btn btn-primary">← Torna alla Dashboard</a>
                </div>
            </div>
            
            <!-- TABELLE PRESENTI -->
            <div class="row mt-4">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-primary text-white">
                            <h5>📋 Tabelle nel Database</h5>
                        </div>
                        <div class="card-body">
                            {'<ul>' + ''.join([f'<li><strong>{table}</strong> ({diagnostic_results.get(f"{table}_count", "?")} records)</li>' for table in diagnostic_results.get("tables", [])]) + '</ul>' if diagnostic_results.get("tables") else '<p class="text-muted">Nessuna tabella trovata</p>'}
                        </div>
                    </div>
                </div>
                
                <!-- POSTGIS -->
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-info text-white">
                            <h5>🗺️ PostGIS Status</h5>
                        </div>
                        <div class="card-body">
                            {f'<p class="text-success">✅ PostGIS {diagnostic_results["postgis"]["extversion"]} attivo</p>' if diagnostic_results.get("postgis") else '<p class="text-danger">❌ PostGIS non installato</p>'}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- STRUTTURA MEASUREMENTS ← NUOVO -->
            <div class="row mt-4">
                <div class="col">
                    <div class="card">
                        <div class="card-header bg-warning text-dark">
                            <h5>📏 Tabella MEASUREMENTS</h5>
                        </div>
                        <div class="card-body">
                            {'<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Colonna</th><th>Tipo</th><th>Nullable</th></tr></thead><tbody>' + ''.join([f'<tr><td>{col["column_name"]}</td><td>{col["data_type"]}</td><td>{"Sì" if col["is_nullable"] == "YES" else "No"}</td></tr>' for col in diagnostic_results.get("measurements_columns", [])]) + '</tbody></table></div>' if diagnostic_results.get("measurements_columns") else '<p class="text-muted">Tabella measurements non trovata</p>'}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- DEBUG RAW -->
            <details class="mt-4">
                <summary>🐛 Raw Debug Data</summary>
                <pre class="bg-dark text-white p-3 mt-2" style="font-size: 12px; overflow-x: auto;">{diagnostic_results}</pre>
            </details>
        </div>
    </body>
    </html>
    """
    
    return html_report

# ================================================
# MAIN
# ================================================
if __name__ == '__main__':
    print("=" * 50)
    print("MERCURIO DATABASE MANAGER")
    print("=" * 50)
    print("Funzionalità disponibili:")
    print("   • Gestione Scenarios")
    print("   • Gestione Areas")
    print("   • Gestione Systems")
    print("   • Gestione Measurements")  # ← NUOVO
    print("   • Gestione Items (Upload SQL + Manuale)")
    print("   • Diagnostica Database")
    print("")
    print("Accedi a: http://localhost:5001")
    print("Dashboard: http://localhost:5001")
    print("Test DB: http://localhost:5001/test_connection")
    print("Diagnostica: http://localhost:5001/database/diagnostic")
    print("=" * 50)
    
    app.run(debug=True, host='0.0.0.0', port=5001)