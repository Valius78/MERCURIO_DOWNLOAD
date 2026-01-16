# ===================================================================
# TRAFFIC CONTROL UTILITIES - STEP 2
# ===================================================================
# Sistema di controllo traffico per download utenti
# Intercetta tutti i download, verifica limiti e traccia utilizzo

from datetime import datetime, date, timedelta, timezone
from functools import wraps
from flask import session, request, jsonify
from utils.db import execute_query
import logging
from utils.minio_client import get_minio_bucket_name

# ===================================================================
# FUNZIONI CORE CONTROLLO TRAFFICO
# ===================================================================

def get_current_user_id():
    """Recupera user_id dalla sessione corrente"""
    return session.get('user_id')

def get_user_traffic_limit(user_id):
    """Recupera limite traffico giornaliero utente (0 = illimitato)"""
    if not user_id:
        return 50  # Default per non autenticati
    
    try:
        query = "SELECT daily_traffic_limit_mb FROM users WHERE user_id = %s"
        result = execute_query(query, (user_id,), fetch=True)
        
        if result and len(result) > 0:
            limit = result[0]['daily_traffic_limit_mb']
            return limit if limit is not None else 50
        else:
            return 50  # Default se utente non trovato
            
    except Exception as e:
        logging.error(f"Errore recupero limite traffico user {user_id}: {e}")
        return 50  # Fallback sicuro

def get_user_daily_usage(user_id, target_date=None):
    """Recupera utilizzo traffico giornaliero utente"""
    if not user_id:
        return 0
        
    if target_date is None:
        target_date = date.today()
    
    try:
        query = """
        SELECT bytes_downloaded, download_count 
        FROM user_daily_traffic 
        WHERE user_id = %s AND traffic_date = %s
        """
        result = execute_query(query, (user_id, target_date), fetch=True)
        
        if result and len(result) > 0:
            return {
                'bytes_downloaded': result[0]['bytes_downloaded'] or 0,
                'download_count': result[0]['download_count'] or 0
            }
        else:
            return {'bytes_downloaded': 0, 'download_count': 0}
            
    except Exception as e:
        logging.error(f"Errore recupero usage traffico user {user_id}: {e}")
        return {'bytes_downloaded': 0, 'download_count': 0}

def update_user_traffic_usage(user_id, bytes_added):
    """Aggiorna contatori traffico utente"""

    
    if not user_id or bytes_added <= 0:

        return True  # Skip per utenti non autenticati o download 0-byte
    
    today = date.today()

    
    
    try:
        # Upsert: inserisci o aggiorna record giornaliero
        upsert_query = """
        INSERT INTO user_daily_traffic (user_id, traffic_date, bytes_downloaded, download_count, last_updated)
        VALUES (%s, %s, %s, 1, NOW())
        ON CONFLICT (user_id, traffic_date)
        DO UPDATE SET 
            bytes_downloaded = user_daily_traffic.bytes_downloaded + EXCLUDED.bytes_downloaded,
            download_count = user_daily_traffic.download_count + 1,
            last_updated = NOW()
        """
        
        result = execute_query(upsert_query, (user_id, today, bytes_added))

        
        if result:
            mb_added = bytes_added / (1024 * 1024)
            logging.info(f"📊 Traffico aggiornato user {user_id}: +{mb_added:.2f} MB")
            return True
        else:
            logging.error(f"Errore aggiornamento traffico user {user_id}")
            return False
            
    except Exception as e:
        logging.error(f"Errore update traffico user {user_id}: {e}")
        return False

def check_traffic_limit(user_id, additional_bytes):
    """
    Verifica se l'utente può scaricare additional_bytes senza superare il limite
    Restituisce: (can_download: bool, error_message: str, current_usage: dict)
    """
    if not user_id:
        # Utente non autenticato - permetti ma con limite basso
        return True, None, {'bytes_downloaded': 0, 'download_count': 0}
    
    try:
        # Recupera limite utente
        limit_mb = get_user_traffic_limit(user_id)
        
        # 0 = nessun limite (illimitato)
        if limit_mb == 0:
            current_usage = get_user_daily_usage(user_id)
            return True, None, current_usage
        
        # Recupera utilizzo corrente
        current_usage = get_user_daily_usage(user_id)
        current_bytes = current_usage['bytes_downloaded']
        
        # Converti limite in bytes
        limit_bytes = limit_mb * 1024 * 1024
        
        # Controlla se il download supererebbe il limite
        if (current_bytes + additional_bytes) > limit_bytes:
            remaining_mb = max(0, (limit_bytes - current_bytes) / (1024 * 1024))
            request_mb = additional_bytes / (1024 * 1024)
            
            error_msg = f"Limite traffico superato. Disponibili: {remaining_mb:.1f} MB, Richiesti: {request_mb:.1f} MB"
            return False, error_msg, current_usage
        
        # OK - può scaricare
        return True, None, current_usage
        
    except Exception as e:
        logging.error(f"Errore check traffic limit user {user_id}: {e}")
        # In caso di errore, permetti il download (fail-safe)
        return True, None, {'bytes_downloaded': 0, 'download_count': 0}

def is_admin_user(user_id):
    """Verifica se l'utente è amministratore (bypass limiti)"""
    if not user_id:
        return False
        
    try:
        # Controlla se l'utente ha ruolo administrator
        query = """
        SELECT r.name 
        FROM users u
        JOIN user_roles ur ON u.user_id = ur.user_id
        JOIN roles r ON ur.role_id = r.role_id
        WHERE u.user_id = %s AND r.name = 'administrator'
        """
        result = execute_query(query, (user_id,), fetch=True)
        
        return bool(result and len(result) > 0)
        
    except Exception as e:
        logging.error(f"Errore check admin user {user_id}: {e}")
        return False

# ===================================================================
# DECORATORE MIDDLEWARE TRAFFICO
# ===================================================================

def traffic_control(calculate_size_func=None):
    """
    Decoratore per controllare traffico prima di download
    
    Args:
        calculate_size_func: Funzione che calcola la dimensione prima del download
                            Se None, si stima dalla response
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_id = get_current_user_id()
            is_admin = is_admin_user(user_id)
            
            try:
                # Calcola dimensione prevista (per tutti)
                if calculate_size_func:
                    estimated_bytes = calculate_size_func(*args, **kwargs)
                else:
                    # Stima default basata sui parametri
                    estimated_bytes = estimate_download_size(*args, **kwargs)
                
                # ✅ CORREZIONE: Solo utenti NON admin controllano i limiti
                if not is_admin:
                    # Controlla limite solo per utenti normali
                    can_download, error_msg, current_usage = check_traffic_limit(user_id, estimated_bytes)
                    
                    if not can_download:
                        # Limite superato - restituisci errore HTTP 429
                        usage_mb = current_usage['bytes_downloaded'] / (1024 * 1024)
                        limit_mb = get_user_traffic_limit(user_id)
                        
                        return jsonify({
                            'error': 'traffic_limit_exceeded',
                            'message': error_msg,
                            'usage_mb': round(usage_mb, 2),
                            'limit_mb': limit_mb,
                            'download_count': current_usage['download_count'],
                            'reset_time': 'mezzanotte UTC'
                        }), 429  # HTTP 429 Too Many Requests
                else:
                    # Log bypass admin
                    logging.info(f"Admin user {user_id} bypass traffic limit - tracking attivo")
                
                # ✅ Download per tutti (admin e utenti normali)
                response = func(*args, **kwargs)
                
                # ✅ Tracking post-download per tutti (admin inclusi)
                try:
                    update_user_traffic_usage(user_id, estimated_bytes)
                    logging.debug(f"Traffic updated: user_id={user_id}, bytes={estimated_bytes}")
                    logging.info(f"🔍 TRAFFIC DEBUG: user={user_id}, bytes={estimated_bytes}, func={func.__name__}")
                except Exception as e:
                    logging.error(f"Errore aggiornamento traffico: {e}")
                    # Non bloccare il download se il tracking fallisce
                
                return response
                
            except Exception as e:
                logging.error(f"Errore traffic control: {e}")
                # Fail-safe: permetti download se il controllo fallisce
                return func(*args, **kwargs)
                
        return wrapper
    return decorator

# ===================================================================
# FUNZIONI STIMA DIMENSIONI 
# ===================================================================

def estimate_download_size(*args, **kwargs):
    """
    Stima dimensione download basata sui parametri della request
    Questa è una stima conservativa per prevenire abusi
    """
    try:
        # Stima basata sul tipo di contenuto e parametri request
        item_type = request.view_args.get('item_type', 'unknown')
        
        if item_type == 'parameter' or item_type == 'channel':
            # Stima per dati numerici CSV
            # Base: 100 byte per record x numero giorni x 24 ore x 1 record/ora
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            
            if start_date and end_date:
                try:
                    start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                    end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    days = (end - start).days + 1
                    estimated_records = days * 24  # 1 record/ora come stima
                    return estimated_records * 100  # 100 byte per record
                except:
                    return 1 * 1024 * 1024  # 1MB default
            else:
                return 5 * 1024 * 1024  # 5MB default per week
        
        elif item_type == 'file':
            # File singolo - stima 10MB medio
            return 10 * 1024 * 1024
        
        elif item_type == 'files':
            # File multipli - conta file_paths
            file_paths = request.args.getlist('file_paths')
            num_files = len(file_paths)
            return num_files * 5 * 1024 * 1024  # 5MB per file medio
        
        else:
            # Default conservativo
            return 2 * 1024 * 1024  # 2MB
            
    except Exception as e:
        logging.error(f"Errore stima dimensione download: {e}")
        return 5 * 1024 * 1024  # 5MB fallback sicuro

def estimate_postgres_csv_size(query, params):
    """
    Stima dimensione CSV da query PostgreSQL senza eseguirla completamente
    """
    try:
        # Query di conteggio
        count_query = f"SELECT COUNT(*) FROM ({query}) as subq"
        result = execute_query(count_query, params, fetch=True)
        
        if result and len(result) > 0:
            record_count = result[0]['count']
            # Stima 150 byte per record CSV (timestamp + valore + separatori)
            estimated_bytes = record_count * 150
            return max(estimated_bytes, 1024)  # Minimo 1KB
        else:
            return 1024  # Fallback
            
    except Exception as e:
        logging.error(f"Errore stima PostgreSQL CSV: {e}")
        return 1024 * 1024  # 1MB fallback

def estimate_minio_file_size(file_path):
    try:
        from utils.minio_client import get_minio_client, get_minio_bucket_name
        
        client = get_minio_client()
        bucket_name = get_minio_bucket_name()  # ← USA QUESTO
        
        if client:
            stat = client.stat_object(bucket_name, file_path)  # ← NON SPLIT PATH
            return stat.size
        
        # Fallback: stima da estensione
        if any(file_path.lower().endswith(ext) for ext in ['.jpg', '.png', '.jpeg']):
            return 2 * 1024 * 1024  # 2MB per immagini
        elif any(file_path.lower().endswith(ext) for ext in ['.pdf']):
            return 5 * 1024 * 1024  # 5MB per PDF
        elif any(file_path.lower().endswith(ext) for ext in ['.mp4', '.avi', '.mkv']):
            return 50 * 1024 * 1024  # 50MB per video
        else:
            return 1 * 1024 * 1024  # 1MB generico
            
    except Exception as e:
        logging.error(f"Errore stima Minio file {file_path}: {e}")
        return 1 * 1024 * 1024  # 1MB fallback

# ===================================================================
# RESET GIORNALIERO (per cron job)
# ===================================================================

def reset_daily_traffic():
    """
    Reset contatori traffico giornaliero (da chiamare via cron a mezzanotte UTC)
    """
    try:
        # Pulisci record vecchi di più di 30 giorni
        cleanup_query = """
        DELETE FROM user_daily_traffic 
        WHERE traffic_date < %s
        """
        cutoff_date = date.today() - timedelta(days=30)
        execute_query(cleanup_query, (cutoff_date,))
        
        logging.info(f"✅ Pulizia traffico completata. Record più vecchi di {cutoff_date} rimossi.")
        return True
        
    except Exception as e:
        logging.error(f"Errore reset traffico giornaliero: {e}")
        return False

# ===================================================================
# API UTILITÀ PER FRONTEND
# ===================================================================

def get_user_traffic_status(user_id):
    """
    Restituisce status traffico completo per l'utente (per API frontend)
    """
    try:
        if not user_id:
            return {
                'user_id': None,
                'limit_mb': 50,
                'used_mb': 0,
                'remaining_mb': 50,
                'download_count': 0,
                'is_unlimited': False
            }
        
        limit_mb = get_user_traffic_limit(user_id)
        usage = get_user_daily_usage(user_id)
        used_bytes = usage['bytes_downloaded']
        used_mb = used_bytes / (1024 * 1024)
        
        if limit_mb == 0:  # Illimitato
            return {
                'user_id': user_id,
                'limit_mb': 0,
                'used_mb': round(used_mb, 2),
                'remaining_mb': None,
                'download_count': usage['download_count'],
                'is_unlimited': True
            }
        else:
            remaining_mb = max(0, limit_mb - used_mb)
            return {
                'user_id': user_id,
                'limit_mb': limit_mb,
                'used_mb': round(used_mb, 2),
                'remaining_mb': round(remaining_mb, 2),
                'download_count': usage['download_count'],
                'is_unlimited': False
            }
            
    except Exception as e:
        logging.error(f"Errore get traffic status user {user_id}: {e}")
        return {
            'user_id': user_id,
            'limit_mb': 50,
            'used_mb': 0,
            'remaining_mb': 50,
            'download_count': 0,
            'is_unlimited': False,
            'error': str(e)
        }
    
