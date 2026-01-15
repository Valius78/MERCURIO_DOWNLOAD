# auth_routes.py
"""
AUTHENTICATION ROUTES - GESTIONE AUTENTICAZIONE UTENTI
=====================================================
Blueprint separato per login/logout/sessioni senza impattare layout esistente
"""

from flask import Blueprint, render_template, request, jsonify, redirect, url_for, flash, session
import bcrypt
from datetime import datetime, timezone
from utils.db import execute_query

# Crea blueprint separato
auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

# ================================================
# FUNZIONI DI SUPPORTO
# ================================================

def verify_password(password, hashed):
    """Verifica password con bcrypt"""
    if isinstance(password, str):
        password = password.encode('utf-8')
    if isinstance(hashed, str):
        hashed = hashed.encode('utf-8')
    return bcrypt.checkpw(password, hashed)

def get_user_by_email(email):
    """Recupera utente completo con ruolo"""
    query = """
    SELECT u.user_id, u.email, u.nome, u.cognome, u.ente_azienda, 
           u.password_hash, u.is_active, u.last_login,
           r.name as role_name, r.permissions_json
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id  
    LEFT JOIN roles r ON ur.role_id = r.role_id
    WHERE u.email = %s AND u.is_active = true
    """
    # Usa fetch=True invece di fetch_one=True
    results = execute_query(query, (email,), fetch=True)
    
    # Restituisci il primo risultato se esiste
    if results and len(results) > 0:
        return results[0]
    return None

def update_last_login(user_id):
    """Aggiorna ultimo login"""
    query = "UPDATE users SET last_login = %s WHERE user_id = %s"
    execute_query(query, (datetime.now(timezone.utc), user_id))

# ================================================
# ROUTES DI AUTENTICAZIONE  
# ================================================

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Pagina e gestione login"""
    if request.method == 'GET':
        # Se già loggato, redirect alla dashboard
        if 'user_id' in session:
            return redirect(url_for('index'))
        return render_template('auth/login.html')
    
    # POST - Processo login
    email = request.form.get('email', '').strip().lower()
    password = request.form.get('password', '')
    
    if not email or not password:
        flash('Email e password sono obbligatori', 'error')
        return render_template('auth/login.html')
    
    # Recupera utente
    user = get_user_by_email(email)
    
    if not user:
        flash('Credenziali non valide', 'error')
        return render_template('auth/login.html')
    
    # Verifica password
    if not verify_password(password, user['password_hash']):
        flash('Credenziali non valide', 'error')
        return render_template('auth/login.html')
    
    # Login successful - crea sessione
    session['user_id'] = user['user_id']
    session['user_email'] = user['email'] 
    session['user_name'] = f"{user['nome']} {user['cognome']}"
    session['user_role'] = user['role_name'] or 'user'

    # CORREZIONE: Deserializza i permessi JSON
    permissions = user['permissions_json'] or '{}'
    if isinstance(permissions, str):
        try:
            import json
            permissions = json.loads(permissions)
        except (json.JSONDecodeError, TypeError):
            permissions = {}

    session['user_permissions'] = permissions
    
    # Aggiorna ultimo login
    update_last_login(user['user_id'])
    
    flash(f'Benvenuto, {session["user_name"]}!', 'success')
    return redirect(url_for('index'))

@auth_bp.route('/logout')
def logout():
    """Logout e pulizia sessione"""
    user_name = session.get('user_name', 'Utente')
    
    # Pulisci sessione
    session.clear()
    
    flash(f'Arrivederci, {user_name}!', 'info')
    return redirect(url_for('auth.login'))

# ================================================
# DECORATORS E UTILITIES
# ================================================

from functools import wraps

def login_required(f):
    """Decoratore per richiedere login (per uso futuro)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Accesso richiesto', 'warning')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decoratore per richiedere ruolo admin (per uso futuro)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('auth.login'))
        if session.get('user_role') != 'administrator':
            flash('Accesso non autorizzato', 'error')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

def get_current_user():
    """Utility per ottenere utente corrente"""
    if 'user_id' in session:
        # CORREZIONE: Deserializza i permessi JSON se sono una stringa
        permissions = session.get('user_permissions', {})
        if isinstance(permissions, str):
            try:
                import json
                permissions = json.loads(permissions)
            except (json.JSONDecodeError, TypeError):
                permissions = {}
        
        return {
            'user_id': session['user_id'],
            'email': session['user_email'],
            'name': session['user_name'], 
            'role': session['user_role'],
            'permissions': permissions
        }
    return None

def has_permission(permission_path):
    """Verifica se l'utente ha un permesso specifico"""
    user = get_current_user()
    if not user:
        return False
    
    permissions = user.get('permissions', {})
    
    # Naviga nel JSON dei permessi usando il path (es. "database.write")
    keys = permission_path.split('.')
    current = permissions
    
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return False
    
    return bool(current)
    
# ================================================
# CONTROLLI PERMESSI (FASE DI TEST - NON BLOCCANTI)
# ================================================

def check_permission_debug(permission_path, action_description=""):
    """
    Controllo permessi in modalità DEBUG - logga ma non blocca
    """
    user = get_current_user()
    
    # Nessun utente loggato
    if not user:
        result = {
            'allowed': False,
            'user': None,
            'reason': 'Utente non autenticato'
        }
        print(f"🔒 PERM CHECK [{permission_path}] {action_description} -> DENIED: {result['reason']}")
        return result
    
    # Controlla il permesso
    has_perm = has_permission(permission_path)
    
    result = {
        'allowed': has_perm,
        'user': user,
        'reason': f"Permesso {permission_path} {'CONCESSO' if has_perm else 'NEGATO'} per ruolo {user['role']}"
    }
    
    emoji = "✅" if has_perm else "❌"
    print(f"{emoji} PERM CHECK [{permission_path}] {action_description} -> {result['reason']}")
    
    return result

def get_ui_permissions():
    """
    Restituisce oggetto con tutti i permessi UI per l'utente corrente
    Da usare nei template per mostrare/nascondere elementi
    """
    user = get_current_user()
    
    if not user:
        return {
            'can_write': False,
            'can_admin': False,
            'can_manage_users': False,
            'show_edit_buttons': False,
            'show_delete_buttons': False,
            'show_admin_pages': False
        }
    
    permissions = user.get('permissions', {})
    
    # CORREZIONE: Gestisci il caso in cui permissions sia ancora una stringa
    if isinstance(permissions, str):
        try:
            import json
            permissions = json.loads(permissions)
        except (json.JSONDecodeError, TypeError):
            permissions = {}
    
    return {
        'can_write': permissions.get('database', {}).get('write', False),
        'can_admin': permissions.get('admin_pages', False),
        'can_manage_users': permissions.get('users', {}).get('manage', False),
        'show_edit_buttons': permissions.get('database', {}).get('write', False),
        'show_delete_buttons': permissions.get('database', {}).get('write', False),
        'show_admin_pages': permissions.get('admin_pages', False),
        'user_role': user.get('role', 'guest'),
        'user_name': user.get('name', 'Sconosciuto')
    }
