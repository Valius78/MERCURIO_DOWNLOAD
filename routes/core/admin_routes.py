# admin_routes.py
"""
ADMIN ROUTES - GESTIONE UTENTI E AMMINISTRAZIONE
===============================================
Routes per pannello amministrativo utenti
"""

from flask import Blueprint, render_template, request, jsonify, redirect, url_for, flash
import bcrypt
from datetime import datetime
from utils.db import execute_query
from .auth_routes import admin_required, get_current_user, login_required, verify_password
import secrets
import hashlib

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

# ================================================
# FUNZIONI DI SUPPORTO
# ================================================

def hash_password(password):
    """Genera hash bcrypt per password"""
    if isinstance(password, str):
        password = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password, salt).decode('utf-8')

def generate_api_token():
    """Genera token API sicuro"""
    return secrets.token_urlsafe(32)

def get_all_users():
    """Recupera tutti gli utenti con ruoli E limite traffico"""
    query = """
    SELECT u.user_id, u.email, u.nome, u.cognome, u.ente_azienda,
           u.is_active, u.last_login, u.created_at, u.daily_traffic_limit_mb,
           r.name as role_name, r.description as role_description,
           COUNT(ut.token_id) as active_tokens
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.role_id  
    LEFT JOIN user_tokens ut ON u.user_id = ut.user_id AND ut.is_active = true
    GROUP BY u.user_id, u.email, u.nome, u.cognome, u.ente_azienda,
             u.is_active, u.last_login, u.created_at, u.daily_traffic_limit_mb,
             r.name, r.description
    ORDER BY u.created_at DESC
    """
    return execute_query(query, fetch=True)

def get_all_roles():
    """Recupera tutti i ruoli disponibili"""
    query = "SELECT role_id, name, description FROM roles ORDER BY name"
    return execute_query(query, fetch=True)


# ================================================
# FUNZIONI GESTIONE TOKEN API
# ================================================

def generate_secure_token():
    """Genera token API sicuro e anonimo"""
    # 32 byte = 64 caratteri esadecimali
    random_bytes = secrets.token_bytes(32)
    token_hex = random_bytes.hex()
    return f"mkr_{token_hex}"

def hash_token(token):
    """Crea hash del token per storage sicuro nel DB"""
    return hashlib.sha256(token.encode()).hexdigest()

def verify_token(token, token_hash):
    """Verifica token contro hash memorizzato"""
    return hashlib.sha256(token.encode()).hexdigest() == token_hash

def get_user_tokens(user_id):
    """Recupera tutti i token di un utente (adattato alla struttura esistente)"""
    query = """
    SELECT token_id, token_name, description, created_at, last_used, is_active, 
           request_count, last_ip
    FROM user_tokens 
    WHERE user_id = %s 
    ORDER BY created_at DESC
    """
    return execute_query(query, (user_id,), fetch=True)

def create_user_token(user_id, description):
    """Crea nuovo token per utente (VERSIONE CORRETTA)"""
    # Genera token sicuro
    token_plain = generate_secure_token()
    token_hash = hash_token(token_plain)
    
    query = """
    INSERT INTO user_tokens (user_id, token, token_name, token_hash, description, is_active, created_at, request_count)
    VALUES (%s, %s, %s, %s, %s, true, NOW(), 0)
    RETURNING token_id
    """
    
    try:
        from utils.db import execute_insert_returning  # Importa la nuova funzione
        
        short_token = token_plain[:20] + "..."
        result = execute_insert_returning(query, (user_id, short_token, description, token_hash, description))
        
        if result and len(result) > 0:
            return {
                'success': True,
                'token_plain': token_plain,
                'token_id': result[0]['token_id']
            }
        else:
            return {'success': False, 'error': 'Errore creazione token'}
            
    except Exception as e:
        return {'success': False, 'error': f'Errore: {str(e)}'}

def revoke_user_token(token_id, user_id):
    """Revoca (disattiva) token utente"""
    query = "UPDATE user_tokens SET is_active = false WHERE token_id = %s AND user_id = %s"
    result = execute_query(query, (token_id, user_id))
    return bool(result)

def delete_user_token(token_id, user_id):
    """Elimina definitivamente token"""
    query = "DELETE FROM user_tokens WHERE token_id = %s AND user_id = %s"
    result = execute_query(query, (token_id, user_id))
    return bool(result)

# ================================================
# GESTIONE LIMITI UTENTI
# ================================================


def get_traffic_limit_options():
    """Recupera opzioni dropdown per limiti traffico"""
    try:
        # Recupera configurazione da database
        query = "SELECT config_value FROM system_config WHERE config_key = 'traffic_limit_options_mb'"
        result = execute_query(query, fetch=True)
        
        if result and len(result) > 0:
            import json
            options = json.loads(result[0]['config_value'])
            return options
        else:
            # Fallback se configurazione non trovata
            return [25, 50, 100, 250, 500, 1000]
            
    except Exception as e:
        print(f"⚠️ Errore recupero traffic_limit_options: {e}")
        # Fallback hardcoded
        return [25, 50, 100, 250, 500, 1000]

def get_max_custom_traffic_limit():
    """Recupera limite massimo per campo custom"""
    try:
        query = "SELECT config_value FROM system_config WHERE config_key = 'max_custom_traffic_limit_mb'"
        result = execute_query(query, fetch=True)
        
        if result and len(result) > 0:
            return int(result[0]['config_value'])
        else:
            return 2000  # Fallback
            
    except Exception as e:
        print(f"⚠️ Errore recupero max_custom_traffic_limit: {e}")
        return 2000  # Fallback

def validate_traffic_limit(limit_mb):
    """Valida il limite traffico inserito"""
    try:
        limit_mb = int(limit_mb)
        max_limit = get_max_custom_traffic_limit()
        
        if limit_mb < 0:
            return False, "Il limite non può essere negativo"
        if limit_mb > max_limit:
            return False, f"Il limite non può essere superiore a {max_limit} MB"
            
        # 0 = nessun limite (valido)
        # >0 = limite in MB (valido)
        return True, None
        
    except (ValueError, TypeError):
        return False, "Il limite deve essere un numero valido"
    
def get_users_with_traffic_data():
    """Recupera utenti con dati traffico giornaliero integrati"""
    try:
        from datetime import date
        
        # Query principale: utenti + limite + consumo oggi
        query = """
        SELECT 
            u.user_id, u.email, u.nome, u.cognome, u.ente_azienda,
            u.is_active, u.last_login, u.created_at, u.daily_traffic_limit_mb,
            r.name as role_name, r.description as role_description,
            COUNT(ut.token_id) as active_tokens,
            
            -- TRAFFICO OGGI
            COALESCE(td.bytes_downloaded, 0) as bytes_downloaded_today,
            COALESCE(td.download_count, 0) as download_count_today,
            td.last_updated as last_traffic_update
            
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id  
        LEFT JOIN user_tokens ut ON u.user_id = ut.user_id AND ut.is_active = true
        LEFT JOIN user_daily_traffic td ON u.user_id = td.user_id AND td.traffic_date = %s
        
        GROUP BY u.user_id, u.email, u.nome, u.cognome, u.ente_azienda,
                 u.is_active, u.last_login, u.created_at, u.daily_traffic_limit_mb,
                 r.name, r.description, td.bytes_downloaded, td.download_count, td.last_updated
        ORDER BY u.created_at DESC
        """
        
        today = date.today()
        users = execute_query(query, (today,), fetch=True)
        
        # Calcola percentuali e badge
        for user in users:
            limit_mb = user['daily_traffic_limit_mb'] or 0
            used_bytes = user['bytes_downloaded_today'] or 0
            used_mb = used_bytes / (1024 * 1024)
            
            user['used_mb_today'] = round(used_mb, 2)
            
            if limit_mb == 0:  # Nessun limite
                user['usage_percentage'] = 0
                user['badge_color'] = 'primary'
                user['badge_icon'] = '♾️'
                user['status_text'] = 'Illimitato'
            else:
                percentage = (used_mb / limit_mb) * 100
                user['usage_percentage'] = round(percentage, 1)
                
                if percentage >= 95:
                    user['badge_color'] = 'danger'
                    user['badge_icon'] = '🚨'
                    user['status_text'] = f'{percentage:.0f}% - LIMITE'
                elif percentage >= 80:
                    user['badge_color'] = 'warning' 
                    user['badge_icon'] = '⚠️'
                    user['status_text'] = f'{percentage:.0f}% - Alto'
                elif percentage >= 50:
                    user['badge_color'] = 'info'
                    user['badge_icon'] = '📊'
                    user['status_text'] = f'{percentage:.0f}%'
                else:
                    user['badge_color'] = 'success'
                    user['badge_icon'] = '✅'
                    user['status_text'] = f'{percentage:.0f}%'
        
        return users
        
    except Exception as e:
        print(f"❌ Errore get_users_with_traffic_data: {e}")
        return get_all_users()  # Fallback
    
@admin_bp.route('/users/<int:user_id>/traffic-stats')
@admin_required
def user_traffic_stats(user_id):
    """API statistiche traffico dettagliate per utente specifico (solo admin)"""
    try:
        from datetime import date, timedelta
        
        # Verifica che l'utente esista
        user_check = execute_query("SELECT email, nome, cognome FROM users WHERE user_id = %s", (user_id,), fetch=True)
        if not user_check:
            return jsonify({'error': 'Utente non trovato'}), 404
        
        user_info = user_check[0]
        today = date.today()
        
        # Statistiche ultimi 7 giorni
        week_query = """
        SELECT 
            traffic_date,
            bytes_downloaded / (1024.0 * 1024) as mb_downloaded,
            download_count,
            last_updated
        FROM user_daily_traffic 
        WHERE user_id = %s 
          AND traffic_date >= %s 
          AND traffic_date <= %s
        ORDER BY traffic_date DESC
        """
        
        week_start = today - timedelta(days=6)  # 7 giorni incluso oggi
        week_data = execute_query(week_query, (user_id, week_start, today), fetch=True) or []
        
        # Statistiche riepilogative
        summary_query = """
        SELECT 
            SUM(CASE WHEN traffic_date = %s THEN bytes_downloaded ELSE 0 END) / (1024.0 * 1024) as today_mb,
            SUM(CASE WHEN traffic_date = %s THEN bytes_downloaded ELSE 0 END) / (1024.0 * 1024) as yesterday_mb,
            SUM(CASE WHEN traffic_date >= %s THEN bytes_downloaded ELSE 0 END) / (1024.0 * 1024) as week_mb,
            SUM(CASE WHEN traffic_date >= %s THEN bytes_downloaded ELSE 0 END) / (1024.0 * 1024) as month_mb,
            
            SUM(CASE WHEN traffic_date = %s THEN download_count ELSE 0 END) as today_downloads,
            SUM(CASE WHEN traffic_date = %s THEN download_count ELSE 0 END) as yesterday_downloads,
            SUM(CASE WHEN traffic_date >= %s THEN download_count ELSE 0 END) as week_downloads,
            SUM(CASE WHEN traffic_date >= %s THEN download_count ELSE 0 END) as month_downloads
        FROM user_daily_traffic 
        WHERE user_id = %s
        """
        
        yesterday = today - timedelta(days=1)
        month_start = today - timedelta(days=29)  # 30 giorni
        
        summary_data = execute_query(summary_query, (
            today, yesterday, week_start, month_start,
            today, yesterday, week_start, month_start,
            user_id
        ), fetch=True)
        
        # Limite utente attuale
        limit_query = "SELECT daily_traffic_limit_mb FROM users WHERE user_id = %s"
        limit_result = execute_query(limit_query, (user_id,), fetch=True)
        current_limit = limit_result[0]['daily_traffic_limit_mb'] if limit_result else 50
        
        # Formatta risposta
        response_data = {
            'user_info': {
                'user_id': user_id,
                'email': user_info['email'],
                'nome': user_info['nome'],
                'cognome': user_info['cognome'],
                'current_limit_mb': current_limit
            },
            'summary': {
                'today': {
                    'mb': round(summary_data[0]['today_mb'] or 0, 2),
                    'downloads': summary_data[0]['today_downloads'] or 0
                },
                'yesterday': {
                    'mb': round(summary_data[0]['yesterday_mb'] or 0, 2),
                    'downloads': summary_data[0]['yesterday_downloads'] or 0
                },
                'week': {
                    'mb': round(summary_data[0]['week_mb'] or 0, 2),
                    'downloads': summary_data[0]['week_downloads'] or 0
                },
                'month': {
                    'mb': round(summary_data[0]['month_mb'] or 0, 2),
                    'downloads': summary_data[0]['month_downloads'] or 0
                }
            },
            'week_history': []
        }
        
        # Prepara dati per grafico (ultimi 7 giorni completi)
        week_data_dict = {row['traffic_date'].isoformat(): row for row in week_data}
        
        for i in range(7):
            date_check = week_start + timedelta(days=i)
            date_str = date_check.isoformat()
            
            if date_str in week_data_dict:
                row = week_data_dict[date_str]
                response_data['week_history'].append({
                    'date': date_str,
                    'date_display': date_check.strftime('%d/%m'),
                    'mb': round(row['mb_downloaded'] or 0, 2),
                    'downloads': row['download_count'] or 0
                })
            else:
                response_data['week_history'].append({
                    'date': date_str,
                    'date_display': date_check.strftime('%d/%m'),
                    'mb': 0,
                    'downloads': 0
                })
        
        return jsonify({
            'status': 'success',
            'data': response_data,
            'timestamp': today.isoformat()
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Errore user_traffic_stats: {e}")
        print(traceback.format_exc())
        return jsonify({
            'status': 'error', 
            'message': str(e)
        }), 500

# ================================================
# ROUTES GESTIONE UTENTI
# ================================================

@admin_bp.route('/users')
@admin_required
def users():
    """Pagina lista utenti con traffico - solo admin"""
    users_list = get_users_with_traffic_data() or []
    
    return render_template('admin/users.html', 
                         users=users_list,
                         total_users=len(users_list))

@admin_bp.route('/users/new')
@admin_required  
def new_user():
    """Form nuovo utente con opzioni traffico"""
    roles = get_all_roles() or []
    traffic_options = get_traffic_limit_options()
    max_custom_limit = get_max_custom_traffic_limit()
    
    return render_template('admin/user_form.html', 
                         user=None, 
                         action='create',
                         roles=roles,
                         traffic_options=traffic_options,
                         max_custom_limit=max_custom_limit)


@admin_bp.route('/users/edit/<int:user_id>')
@admin_required
def edit_user(user_id):
    """Form modifica utente con limite traffico"""
    # AGGIORNA la query per includere daily_traffic_limit_mb
    query = """
    SELECT u.user_id, u.email, u.nome, u.cognome, u.ente_azienda,
           u.is_active, u.last_login, u.created_at, u.daily_traffic_limit_mb,
           ur.role_id, r.name as role_name
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.role_id
    WHERE u.user_id = %s
    """
    user = execute_query(query, (user_id,), fetch=True)
    
    if not user or len(user) == 0:
        flash('Utente non trovato', 'error')
        return redirect(url_for('admin.users'))
    
    user = user[0]
    roles = get_all_roles() or []
    traffic_options = get_traffic_limit_options()
    max_custom_limit = get_max_custom_traffic_limit()
    
    return render_template('admin/user_form.html',
                         user=user,
                         action='edit', 
                         roles=roles,
                         traffic_options=traffic_options,
                         max_custom_limit=max_custom_limit)

@admin_bp.route('/users/save', methods=['POST'])
@admin_required
def save_user():
    """Salva utente (nuovo o modificato)"""
    user_id = request.form.get('user_id')
    email = request.form.get('email', '').strip().lower()
    nome = request.form.get('nome', '').strip()
    cognome = request.form.get('cognome', '').strip()
    ente_azienda = request.form.get('ente_azienda', '').strip()
    role_id = request.form.get('role_id')
    password = request.form.get('password', '').strip()
    is_active = 'is_active' in request.form
    
    # NUOVO: Gestione limite traffico
    traffic_limit_mb = request.form.get('traffic_limit_mb', '50').strip()
    
    # Validazione limite traffico
    is_valid, error_msg = validate_traffic_limit(traffic_limit_mb)
    if not is_valid:
        flash(f'Errore limite traffico: {error_msg}', 'error')
        return redirect(request.referrer)
    
    traffic_limit_mb = int(traffic_limit_mb)



    # Validazioni
    if not email or not nome or not cognome:
        flash('Email, nome e cognome sono obbligatori', 'error')
        return redirect(request.referrer)
    
    # Controllo email esistente (escludendo l'utente corrente in caso di modifica)
    check_email_query = "SELECT user_id FROM users WHERE email = %s"
    params = [email]
    
    if user_id:  # Modifica
        check_email_query += " AND user_id != %s"
        params.append(user_id)
    
    existing_user = execute_query(check_email_query, params, fetch=True)
    
    if existing_user:
        flash('Email già esistente', 'error')
        return redirect(request.referrer)
    
    try:
        if user_id:  # MODIFICA UTENTE
            # Aggiorna dati utente
            update_query = """
            UPDATE users SET email = %s, nome = %s, cognome = %s, 
                           ente_azienda = %s, is_active = %s
            WHERE user_id = %s
            """
            execute_query(update_query, (email, nome, cognome, ente_azienda, is_active, user_id))
            
            # Aggiorna password se fornita
            if password:
                password_hash = hash_password(password)
                update_query = """
                UPDATE users 
                SET email = %s, nome = %s, cognome = %s, ente_azienda = %s, 
                    password_hash = %s, is_active = %s, daily_traffic_limit_mb = %s
                WHERE user_id = %s
                """
                execute_query(update_query, (email, nome, cognome, ente_azienda, 
                                           password_hash, is_active, traffic_limit_mb, user_id))
            else:
                update_query = """
                UPDATE users 
                SET email = %s, nome = %s, cognome = %s, ente_azienda = %s, 
                    is_active = %s, daily_traffic_limit_mb = %s
                WHERE user_id = %s
                """
                execute_query(update_query, (email, nome, cognome, ente_azienda, 
                                           is_active, traffic_limit_mb, user_id))
            
            # Aggiorna ruolo
            if role_id:
                execute_query("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
                execute_query("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", 
                            (user_id, role_id))
            
            flash(f'Utente {nome} {cognome} aggiornato con successo', 'success')
            
        else:  # NUOVO UTENTE
            if not password:
                flash('Password obbligatoria per nuovo utente', 'error')
                return redirect(request.referrer)
            
            password_hash = hash_password(password)
            
            # CORREZIONE: Inserisci nuovo utente e recupera ID
            insert_query = """
            INSERT INTO users (email, nome, cognome, ente_azienda, password_hash, is_active, daily_traffic_limit_mb)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            result = execute_query(insert_query, 
                                 (email, nome, cognome, ente_azienda, password_hash, is_active, traffic_limit_mb))
            
            if result:
                # Recupera l'user_id appena creato
                new_user_query = "SELECT user_id FROM users WHERE email = %s ORDER BY user_id DESC LIMIT 1"
                user_result = execute_query(new_user_query, (email,), fetch=True)
                
                if user_result and len(user_result) > 0:
                    new_user_id = user_result[0]['user_id']
                    
                    # Assegna ruolo
                    if role_id:
                        role_result = execute_query(
                            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)",
                            (new_user_id, role_id)
                        )
                        
                        if not role_result:
                            flash('Utente creato ma errore nell\'assegnazione ruolo', 'warning')
                        else:
                            flash(f'Nuovo utente {nome} {cognome} creato con successo', 'success')
                    else:
                        flash(f'Nuovo utente {nome} {cognome} creato senza ruolo', 'warning')
                else:
                    flash('Errore nel recupero ID utente creato', 'error')
                    return redirect(request.referrer)
            else:
                flash('Errore durante la creazione utente', 'error')
                return redirect(request.referrer)
        
        return redirect(url_for('admin.users'))
        
    except Exception as e:
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        return redirect(request.referrer)

@admin_bp.route('/users/toggle/<int:user_id>', methods=['POST'])
@admin_required
def toggle_user_status(user_id):
    """Attiva/disattiva utente"""
    current_user = get_current_user()
    
    # Non permettere di disattivare se stesso
    if current_user and current_user['user_id'] == user_id:
        flash('Non puoi disattivare il tuo stesso account', 'error')
        return redirect(url_for('admin.users'))
    
    # Toggle stato
    query = "UPDATE users SET is_active = NOT is_active WHERE user_id = %s"
    result = execute_query(query, (user_id,))
    
    if result:
        flash('Stato utente aggiornato', 'success')
    else:
        flash('Errore durante l\'aggiornamento', 'error')
    
    return redirect(url_for('admin.users'))

@admin_bp.route('/users/delete/<int:user_id>', methods=['POST'])
@admin_required
def delete_user(user_id):
    """Elimina utente definitivamente (hard delete)"""
    current_user = get_current_user()
    
    # Non permettere di eliminare se stesso
    if current_user and current_user['user_id'] == user_id:
        flash('Non puoi eliminare il tuo stesso account', 'error')
        return redirect(url_for('admin.users'))
    
    try:
        # Recupera informazioni utente per il messaggio
        user_info = execute_query(
            "SELECT nome, cognome FROM users WHERE user_id = %s", 
            (user_id,), 
            fetch=True
        )
        
        if not user_info:
            flash('Utente non trovato', 'error')
            return redirect(url_for('admin.users'))
        
        user_name = f"{user_info[0]['nome']} {user_info[0]['cognome']}"
        
        # HARD DELETE: Elimina definitivamente in ordine corretto
        # 1. Elimina prima i token (se esistono)
        execute_query("DELETE FROM user_tokens WHERE user_id = %s", (user_id,))
        
        # 2. Elimina i ruoli utente
        execute_query("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        
        # 3. Elimina l'utente
        result = execute_query("DELETE FROM users WHERE user_id = %s", (user_id,))
        
        if result:
            flash(f'Utente {user_name} eliminato definitivamente', 'success')
        else:
            flash('Errore durante l\'eliminazione', 'error')
        
    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
    
    return redirect(url_for('admin.users'))
    
from .auth_routes import login_required  # Importa anche questo decoratore

@admin_bp.route('/profile')
@login_required  # Solo login richiesto, non admin
def my_profile():
    """Pagina profilo personale dell'utente"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    # Recupera dati completi utente
    query = """
    SELECT u.user_id, u.email, u.nome, u.cognome, u.ente_azienda,
        u.is_active, u.last_login, u.created_at, u.daily_traffic_limit_mb,
        r.name as role_name, r.description as role_description
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.role_id
    WHERE u.user_id = %s
    """
    user = execute_query(query, (current_user['user_id'],), fetch=True)
    
    if not user:
        flash('Profilo non trovato', 'error')
        return redirect(url_for('index'))
    
    return render_template('admin/my_profile.html', user=user[0])

@admin_bp.route('/profile/update', methods=['POST'])
@login_required
def update_my_profile():
    """Aggiorna il proprio profilo (NO ruolo, NO stato)"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    nome = request.form.get('nome', '').strip()
    cognome = request.form.get('cognome', '').strip()
    ente_azienda = request.form.get('ente_azienda', '').strip()
    
    # Validazioni
    if not nome or not cognome:
        flash('Nome e cognome sono obbligatori', 'error')
        return redirect(request.referrer)
    
    try:
        # Aggiorna solo dati personali (NO email, NO ruolo, NO stato)
        result = execute_query("""
            UPDATE users SET nome = %s, cognome = %s, ente_azienda = %s
            WHERE user_id = %s
        """, (nome, cognome, ente_azienda, current_user['user_id']))
        
        if result:
            # Aggiorna la sessione con il nuovo nome
            from flask import session
            session['user_name'] = f"{nome} {cognome}"
            
            flash('Profilo aggiornato con successo', 'success')
        else:
            flash('Errore durante l\'aggiornamento', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('admin.my_profile'))

@admin_bp.route('/profile/change-password', methods=['POST'])
@login_required
def change_my_password():
    """Cambia la propria password"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    current_password = request.form.get('current_password', '').strip()
    new_password = request.form.get('new_password', '').strip()
    confirm_password = request.form.get('confirm_password', '').strip()
    
    # Validazioni
    if not all([current_password, new_password, confirm_password]):
        flash('Tutti i campi password sono obbligatori', 'error')
        return redirect(request.referrer)
    
    if new_password != confirm_password:
        flash('Le nuove password non coincidono', 'error')
        return redirect(request.referrer)
    
    if len(new_password) < 6:
        flash('La nuova password deve essere almeno 6 caratteri', 'error')
        return redirect(request.referrer)
    
    try:
        # Verifica password corrente
        user_data = execute_query(
            "SELECT password_hash FROM users WHERE user_id = %s", 
            (current_user['user_id'],), fetch=True
        )
        
        if not user_data or not verify_password(current_password, user_data[0]['password_hash']):
            flash('Password corrente non corretta', 'error')
            return redirect(request.referrer)
        
        # Aggiorna password
        password_hash = hash_password(new_password)
        result = execute_query(
            "UPDATE users SET password_hash = %s WHERE user_id = %s", 
            (password_hash, current_user['user_id'])
        )
        
        if result:
            flash('Password cambiata con successo', 'success')
        else:
            flash('Errore durante il cambio password', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('admin.my_profile'))
    
    
# ================================================
# ROUTES GESTIONE TOKEN API
# ================================================

@admin_bp.route('/profile/tokens')
@login_required
def my_tokens():
    """Gestione token personali"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    tokens = get_user_tokens(current_user['user_id']) or []
    
    return render_template('admin/my_tokens.html', 
                         tokens=tokens,
                         user=current_user)

@admin_bp.route('/profile/tokens/create', methods=['POST'])
@login_required
def create_my_token():
    """Crea nuovo token personale"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    description = request.form.get('description', '').strip()
    
    if not description:
        flash('Descrizione token obbligatoria', 'error')
        return redirect(url_for('admin.my_tokens'))
    
    if len(description) > 100:
        flash('Descrizione troppo lunga (max 100 caratteri)', 'error')
        return redirect(url_for('admin.my_tokens'))
    
    # Controlla limite token per utente (max 10)
    existing_tokens = get_user_tokens(current_user['user_id']) or []
    active_tokens = [t for t in existing_tokens if t['is_active']]
    
    if len(active_tokens) >= 10:
        flash('Limite massimo token raggiunto (10). Revoca alcuni token prima di crearne di nuovi.', 'error')
        return redirect(url_for('admin.my_tokens'))
    
    try:
        result = create_user_token(current_user['user_id'], description)
        
        if result['success']:
            # Mostra il token UNA SOLA VOLTA
            flash('Token creato con successo!', 'success')
            return render_template('admin/token_created.html', 
                                 token=result['token_plain'],
                                 description=description)
        else:
            flash(f'Errore nella creazione: {result.get("error", "Sconosciuto")}', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('admin.my_tokens'))

@admin_bp.route('/profile/tokens/revoke/<int:token_id>', methods=['POST'])
@login_required
def revoke_my_token(token_id):
    """Revoca proprio token"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    try:
        success = revoke_user_token(token_id, current_user['user_id'])
        
        if success:
            flash('Token revocato con successo', 'success')
        else:
            flash('Errore nella revoca del token', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('admin.my_tokens'))

@admin_bp.route('/profile/tokens/delete/<int:token_id>', methods=['POST'])
@login_required
def delete_my_token(token_id):
    """Elimina definitivamente proprio token"""
    current_user = get_current_user()
    if not current_user:
        return redirect(url_for('auth.login'))
    
    try:
        success = delete_user_token(token_id, current_user['user_id'])
        
        if success:
            flash('Token eliminato definitivamente', 'success')
        else:
            flash('Errore nell\'eliminazione del token', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('admin.my_tokens'))
    
# ================================================
# GESTIONE TOKEN ADMIN - CONTROLLO GLOBALE
# ================================================

@admin_bp.route('/users/<int:user_id>/tokens')
@admin_required
def admin_user_tokens(user_id):
    """Gestione token di un utente specifico (solo admin)"""
    # Recupera info utente
    user_info = execute_query(
        "SELECT nome, cognome, email, is_active FROM users WHERE user_id = %s", 
        (user_id,), fetch=True
    )
    
    if not user_info:
        flash('Utente non trovato', 'error')
        return redirect(url_for('admin.users'))
    
    user = user_info[0]
    
    # Recupera token utente con statistiche dettagliate
    tokens = execute_query("""
        SELECT token_id, token_name, description, is_active, created_at, 
               last_used, request_count, last_ip, rate_limit_per_hour
        FROM user_tokens 
        WHERE user_id = %s 
        ORDER BY created_at DESC
    """, (user_id,), fetch=True) or []
    
    return render_template('admin/admin_user_tokens.html', 
                         user=user, 
                         user_id=user_id, 
                         tokens=tokens)

@admin_bp.route('/admin/tokens/all')
@admin_required
def admin_all_tokens():
    """Vista globale di tutti i token (solo admin)"""
    all_tokens = execute_query("""
        SELECT ut.token_id, ut.token_name, ut.description, ut.is_active, 
               ut.created_at, ut.last_used, ut.request_count, ut.last_ip,
               ut.rate_limit_per_hour, ut.user_id,
               u.nome, u.cognome, u.email
        FROM user_tokens ut
        JOIN users u ON ut.user_id = u.user_id
        ORDER BY ut.last_used DESC NULLS LAST, ut.created_at DESC
    """, fetch=True) or []
    
    return render_template('admin/admin_all_tokens.html', tokens=all_tokens)

@admin_bp.route('/admin/tokens/<int:token_id>/toggle', methods=['POST'])
@admin_required
def admin_toggle_token(token_id):
    """Attiva/disattiva token (solo admin)"""
    user_id = request.form.get('user_id')
    
    try:
        # Toggle stato token
        result = execute_query(
            "UPDATE user_tokens SET is_active = NOT is_active WHERE token_id = %s", 
            (token_id,)
        )
        
        if result:
            flash('Stato token aggiornato', 'success')
        else:
            flash('Errore nell\'aggiornamento', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    # Redirect appropriato
    if user_id:
        return redirect(url_for('admin.admin_user_tokens', user_id=user_id))
    else:
        return redirect(url_for('admin.admin_all_tokens'))

@admin_bp.route('/admin/tokens/<int:token_id>/delete', methods=['POST'])
@admin_required
def admin_delete_token(token_id):
    """Elimina token (solo admin)"""
    user_id = request.form.get('user_id')
    
    try:
        # Recupera info token prima di eliminarlo
        token_info = execute_query(
            "SELECT token_name, description FROM user_tokens WHERE token_id = %s", 
            (token_id,), fetch=True
        )
        
        if not token_info:
            flash('Token non trovato', 'error')
        else:
            execute_query("DELETE FROM user_tokens WHERE token_id = %s", (token_id,))
            token_name = token_info[0]['token_name'] or token_info[0]['description'] or 'Token'
            flash(f'Token "{token_name}" eliminato', 'success')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    # Redirect appropriato
    if user_id:
        return redirect(url_for('admin.admin_user_tokens', user_id=user_id))
    else:
        return redirect(url_for('admin.admin_all_tokens'))

@admin_bp.route('/admin/tokens/<int:token_id>/set-rate-limit', methods=['POST'])
@admin_required
def admin_set_rate_limit(token_id):
    """Imposta rate limit per token (solo admin)"""
    user_id = request.form.get('user_id')
    rate_limit = request.form.get('rate_limit', '').strip()
    
    # Validazione
    if not rate_limit or not rate_limit.isdigit():
        flash('Rate limit deve essere un numero valido', 'error')
        return redirect(request.referrer)
    
    rate_limit = int(rate_limit)
    
    if rate_limit < 0 or rate_limit > 10000:
        flash('Rate limit deve essere tra 0 e 10000 richieste/ora', 'error')
        return redirect(request.referrer)
    
    try:
        # Aggiorna rate limit (0 = illimitato)
        result = execute_query(
            "UPDATE user_tokens SET rate_limit_per_hour = %s WHERE token_id = %s", 
            (rate_limit if rate_limit > 0 else None, token_id)
        )
        
        if result:
            if rate_limit == 0:
                flash('Rate limit rimosso (illimitato)', 'success')
            else:
                flash(f'Rate limit impostato a {rate_limit} richieste/ora', 'success')
        else:
            flash('Errore nell\'aggiornamento rate limit', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    # Redirect appropriato
    if user_id:
        return redirect(url_for('admin.admin_user_tokens', user_id=user_id))
    else:
        return redirect(url_for('admin.admin_all_tokens'))

@admin_bp.route('/admin/tokens/bulk-action', methods=['POST'])
@admin_required
def admin_bulk_token_action():
    """Azioni in massa sui token (solo admin)"""
    action = request.form.get('action')
    token_ids = request.form.getlist('token_ids')
    
    if not token_ids:
        flash('Nessun token selezionato', 'error')
        return redirect(request.referrer)
    
    try:
        token_ids = [int(tid) for tid in token_ids]
        
        if action == 'disable':
            execute_query(
                f"UPDATE user_tokens SET is_active = false WHERE token_id IN ({','.join(['%s'] * len(token_ids))})", 
                token_ids
            )
            flash(f'{len(token_ids)} token disabilitati', 'success')
            
        elif action == 'enable':
            execute_query(
                f"UPDATE user_tokens SET is_active = true WHERE token_id IN ({','.join(['%s'] * len(token_ids))})", 
                token_ids
            )
            flash(f'{len(token_ids)} token abilitati', 'success')
            
        elif action == 'delete':
            execute_query(
                f"DELETE FROM user_tokens WHERE token_id IN ({','.join(['%s'] * len(token_ids))})", 
                token_ids
            )
            flash(f'{len(token_ids)} token eliminati', 'success')
            
        else:
            flash('Azione non riconosciuta', 'error')
            
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
    
    return redirect(url_for('admin.admin_all_tokens'))