# ===================================================================
# TRAFFIC CONTROL UTILITIES - VERSIONE AGGIORNATA CON DEDUPLICAZIONE
# ===================================================================
# Sistema di controllo traffico per download utenti con prevenzione conteggi duplicati

from datetime import datetime, date, timedelta, timezone
from functools import wraps
from flask import session, request, jsonify
from utils.db import execute_query
import logging
import hashlib
import threading
from collections import defaultdict
import time

# ===================================================================
# CACHE GLOBALE PER DEDUPLICAZIONE
# ===================================================================

class DownloadDeduplicator:
    """Gestisce deduplicazione download per evitare conteggi multipli"""
    
    def __init__(self):
        self.active_downloads = {}  # request_hash -> timestamp
        self.lock = threading.RLock()
        self.cleanup_interval = 300  # 5 minuti
        self.max_age = 30  # 30 secondi per considerare un download "duplicato"
        self.last_cleanup = time.time()
    
    def generate_request_hash(self, user_id, func_name, args, kwargs):
        """Genera hash univoco per la richiesta corrente"""
        try:
            # Include parametri significativi per identificare il download
            key_components = [
                str(user_id),
                func_name,
                request.method,
                request.path,
                request.query_string.decode('utf-8', errors='ignore'),
                str(sorted(request.form.items()) if request.form else ''),
            ]
            
            # Aggiungi parametri specifici se presenti
            if hasattr(request, 'view_args') and request.view_args:
                key_components.append(str(sorted(request.view_args.items())))
            
            combined = '|'.join(key_components)
            return hashlib.sha256(combined.encode()).hexdigest()[:16]
            
        except Exception as e:
            logging.error(f"Errore generazione hash richiesta: {e}")
            # Fallback: usa timestamp
            return f"fallback_{int(time.time() * 1000)}"
    
    def is_duplicate_download(self, request_hash):
        """Verifica se è un download duplicato recente"""
        with self.lock:
            now = time.time()
            
            # Cleanup periodico
            if now - self.last_cleanup > self.cleanup_interval:
                self._cleanup_old_entries(now)
            
            # Controlla se esiste un download recente con lo stesso hash
            if request_hash in self.active_downloads:
                age = now - self.active_downloads[request_hash]
                if age < self.max_age:
                    logging.warning(f"🚫 Download duplicato rilevato: {request_hash} (età: {age:.1f}s)")
                    return True
                else:
                    # Troppo vecchio, rimuovi e permetti
                    del self.active_downloads[request_hash]
            
            # Registra nuovo download
            self.active_downloads[request_hash] = now
            logging.debug(f"✅ Download registrato: {request_hash}")
            return False
    
    def complete_download(self, request_hash):
        """Marca download come completato"""
        with self.lock:
            if request_hash in self.active_downloads:
                del self.active_downloads[request_hash]
                logging.debug(f"🏁 Download completato: {request_hash}")
    
    def _cleanup_old_entries(self, now):
        """Rimuove entry vecchie dalla cache"""
        old_count = len(self.active_downloads)
        
        # Rimuovi entry più vecchie di 10 minuti
        max_age_cleanup = 600
        to_remove = [
            hash_key for hash_key, timestamp in self.active_downloads.items()
            if now - timestamp > max_age_cleanup
        ]
        
        for hash_key in to_remove:
            del self.active_downloads[hash_key]
        
        self.last_cleanup = now
        
        if to_remove:
            logging.info(f"🧹 Cleanup deduplicator: {len(to_remove)} entry rimosse (erano {old_count}, ora {len(self.active_downloads)})")
    
    def get_stats(self):
        """Statistiche deduplicator per debug"""
        with self.lock:
            return {
                'active_downloads': len(self.active_downloads),
                'last_cleanup': self.last_cleanup,
                'oldest_entry': min(self.active_downloads.values()) if self.active_downloads else None
            }

# Istanza globale deduplicator
download_deduplicator = DownloadDeduplicator()

# ===================================================================
# FUNZIONI CORE (IMMUTATE)
# ===================================================================

def get_current_user_id():
    """Recupera user_id dalla sessione corrente"""
    return session.get('user_id')

def get_user_traffic_limit(user_id):
    """Recupera limite traffico giornaliero utente (0 = illimitato)"""
    if not user_id:
        return 50
    
    try:
        query = "SELECT daily_traffic_limit_mb FROM users WHERE user_id = %s"
        result = execute_query(query, (user_id,), fetch=True)
        
        if result and len(result) > 0:
            limit = result[0]['daily_traffic_limit_mb']
            return limit if limit is not None else 50
        else:
            return 50
            
    except Exception as e:
        logging.error(f"Errore recupero limite traffico user {user_id}: {e}")
        return 50

def get_user_daily_usage(user_id, target_date=None):
    """Recupera utilizzo traffico giornaliero utente"""
    if not user_id:
        return {'bytes_downloaded': 0, 'download_count': 0}
    
    if target_date is None:
        target_date = date.today()
    
    try:
        query = """
        SELECT 
            COALESCE(SUM(bytes_downloaded), 0) as total_bytes,
            COUNT(*) as download_count
        FROM user_traffic_log 
        WHERE user_id = %s AND download_date = %s
        """
        result = execute_query(query, (user_id, target_date), fetch=True)
        
        if result and len(result) > 0:
            return {
                'bytes_downloaded': int(result[0]['total_bytes']),
                'download_count': int(result[0]['download_count'])
            }
        else:
            return {'bytes_downloaded': 0, 'download_count': 0}
            
    except Exception as e:
        logging.error(f"Errore recupero utilizzo utente {user_id}: {e}")
        return {'bytes_downloaded': 0, 'download_count': 0}

def update_user_traffic_usage(user_id, bytes_downloaded, download_info=None):
    """Aggiorna utilizzo traffico utente nel database"""
    if not user_id or bytes_downloaded <= 0:
        return True
    
    try:
        # Inserisci record traffico
        query = """
        INSERT INTO user_traffic_log 
        (user_id, download_date, bytes_downloaded, download_timestamp, download_info)
        VALUES (%s, %s, %s, %s, %s)
        """
        
        now = datetime.now(timezone.utc)
        download_info_json = str(download_info) if download_info else None
        
        result = execute_query(query, (
            user_id, 
            now.date(), 
            bytes_downloaded, 
            now,
            download_info_json
        ))
        
        if result:
            mb_added = bytes_downloaded / (1024 * 1024)
            logging.info(f"📊 Traffico aggiornato user {user_id}: +{mb_added:.2f} MB")
            return True
        else:
            logging.error(f"Errore aggiornamento traffico user {user_id}")
            return False
            
    except Exception as e:
        logging.error(f"Errore update traffico user {user_id}: {e}")
        return False

def is_admin_user(user_id):
    """Verifica se l'utente è amministratore"""
    if not user_id:
        return False
        
    try:
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

def check_traffic_limit(user_id, additional_bytes):
    """Verifica limiti traffico"""
    if not user_id:
        return True, None, {'bytes_downloaded': 0, 'download_count': 0}
    
    try:
        limit_mb = get_user_traffic_limit(user_id)
        
        if limit_mb == 0:
            current_usage = get_user_daily_usage(user_id)
            return True, None, current_usage
        
        current_usage = get_user_daily_usage(user_id)
        current_bytes = current_usage['bytes_downloaded']
        limit_bytes = limit_mb * 1024 * 1024
        
        if (current_bytes + additional_bytes) > limit_bytes:
            remaining_mb = max(0, (limit_bytes - current_bytes) / (1024 * 1024))
            request_mb = additional_bytes / (1024 * 1024)
            
            error_msg = f"Limite traffico superato. Disponibili: {remaining_mb:.1f} MB, Richiesti: {request_mb:.1f} MB"
            return False, error_msg, current_usage
        
        return True, None, current_usage
        
    except Exception as e:
        logging.error(f"Errore check traffic limit user {user_id}: {e}")
        return True, None, {'bytes_downloaded': 0, 'download_count': 0}

# ===================================================================
# DECORATORE AGGIORNATO CON DEDUPLICAZIONE
# ===================================================================

def traffic_control(calculate_size_func=None):
    """
    Decoratore per controllare traffico - VERSIONE CON DEDUPLICAZIONE
    
    Args:
        calculate_size_func: Funzione per calcolare dimensione download
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_id = get_current_user_id()
            is_admin = is_admin_user(user_id)
            
            # Genera hash per deduplicazione
            request_hash = download_deduplicator.generate_request_hash(
                user_id, func.__name__, args, kwargs
            )
            
            try:
                # ✅ STEP 1: Controllo deduplicazione
                if download_deduplicator.is_duplicate_download(request_hash):
                    logging.warning(f"🚫 Download duplicato bloccato: user={user_id}, func={func.__name__}, hash={request_hash}")
                    
                    # Restituisci errore 429 per download duplicato
                    return jsonify({
                        'error': 'duplicate_download',
                        'message': 'Download duplicato rilevato. Riprova tra qualche secondo.',
                        'retry_after': download_deduplicator.max_age
                    }), 429
                
                # ✅ STEP 2: Calcola dimensione prevista
                if calculate_size_func:
                    estimated_bytes = calculate_size_func(*args, **kwargs)
                else:
                    estimated_bytes = estimate_download_size(*args, **kwargs)
                
                # ✅ STEP 3: Controllo limiti (solo per utenti non admin)
                if not is_admin:
                    can_download, error_msg, current_usage = check_traffic_limit(user_id, estimated_bytes)
                    
                    if not can_download:
                        # Rimuovi dalla cache deduplicazione (non era un download reale)
                        download_deduplicator.complete_download(request_hash)
                        
                        usage_mb = current_usage['bytes_downloaded'] / (1024 * 1024)
                        limit_mb = get_user_traffic_limit(user_id)
                        
                        return jsonify({
                            'error': 'traffic_limit_exceeded',
                            'message': error_msg,
                            'usage_mb': round(usage_mb, 2),
                            'limit_mb': limit_mb,
                            'download_count': current_usage['download_count'],
                            'reset_time': 'mezzanotte UTC'
                        }), 429
                else:
                    logging.info(f"🔓 Admin user {user_id} bypass traffic limit - tracking attivo")
                
                # ✅ STEP 4: Esegui download
                logging.info(f"📤 DOWNLOAD START: user={user_id}, func={func.__name__}, hash={request_hash}, estimated_bytes={estimated_bytes}")
                
                response = func(*args, **kwargs)
                
                # ✅ STEP 5: Tracking post-download per tutti
                try:
                    download_info = {
                        'function': func.__name__,
                        'request_hash': request_hash,
                        'estimated_bytes': estimated_bytes,
                        'is_admin': is_admin
                    }
                    
                    update_user_traffic_usage(user_id, estimated_bytes, download_info)
                    
                    logging.info(f"✅ DOWNLOAD COMPLETE: user={user_id}, func={func.__name__}, hash={request_hash}, bytes={estimated_bytes}")
                    
                except Exception as e:
                    logging.error(f"Errore aggiornamento traffico post-download: {e}")
                
                # ✅ STEP 6: Cleanup deduplicazione
                download_deduplicator.complete_download(request_hash)
                
                return response
                
            except Exception as e:
                logging.error(f"Errore traffic control: {e}")
                # Cleanup in caso di errore
                download_deduplicator.complete_download(request_hash)
                # Fail-safe: permetti download se il controllo fallisce
                return func(*args, **kwargs)
                
        return wrapper
    return decorator

# ===================================================================
# STIMA DIMENSIONI (IMMUTATA)
# ===================================================================

def estimate_download_size(*args, **kwargs):
    """Stima dimensione download basata sui parametri della request"""
    try:
        item_type = request.view_args.get('item_type', 'unknown')
        
        if item_type == 'parameter' or item_type == 'channel':
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            
            if start_date and end_date:
                try:
                    start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                    end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    
                    delta_hours = int((end - start).total_seconds() / 3600)
                    estimated_records = max(delta_hours, 24)  # Min 24 record
                    
                    # Stima conservativa: 100 byte per record + header
                    return estimated_records * 100 + 1024
                    
                except Exception:
                    return 50 * 1024  # 50KB default
            else:
                return 100 * 1024  # 100KB default
                
        elif item_type == 'files':
            # File multipli - stima conservativa
            file_count = len(request.get_json().get('file_paths', [])) if request.is_json else 1
            return file_count * 1024 * 1024  # 1MB per file
            
        else:
            return 1024 * 1024  # 1MB default
            
    except Exception as e:
        logging.error(f"Errore stima dimensione download: {e}")
        return 1024 * 1024  # 1MB fallback

# ===================================================================
# API FRONTEND (IMMUTATE)
# ===================================================================

def get_user_traffic_status(user_id):
    """Status traffico per frontend"""
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
        
        if limit_mb == 0:
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

# ===================================================================
# FUNZIONI UTILITY DEBUG
# ===================================================================

def get_deduplicator_stats():
    """Ottieni statistiche deduplicator per debug/admin"""
    return download_deduplicator.get_stats()

def force_cleanup_deduplicator():
    """Forza cleanup deduplicator (per admin)"""
    with download_deduplicator.lock:
        old_count = len(download_deduplicator.active_downloads)
        download_deduplicator.active_downloads.clear()
        download_deduplicator.last_cleanup = time.time()
        
        logging.info(f"🧹 Deduplicator forzato cleanup: {old_count} entry rimosse")
        return old_count

# ===================================================================
# FUNZIONI SPECIFICHE PER STIMA DIMENSIONI (COMPATIBILITÀ API)
# ===================================================================

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
        logging.error(f"Errore stima postgres CSV: {e}")
        return 1024  # Fallback sicuro

def estimate_minio_file_size(file_path):
    """
    Stima dimensione file da Minio senza scaricarlo
    """
    try:
        from utils.minio_client import get_minio_client, get_minio_bucket_name
        
        minio_client = get_minio_client()
        bucket_name = get_minio_bucket_name()
        
        # Ottieni metadati file
        file_info = minio_client.stat_object(bucket_name, file_path)
        return file_info.size
        
    except Exception as e:
        logging.error(f"Errore stima minio file {file_path}: {e}")
        return 1 * 1024 * 1024  # 1MB fallback

def estimate_postgres_stream_size(query, params, filename_prefix, custom_header=''):
    """
    Stima dimensione stream PostgreSQL CSV
    """
    try:
        # Conta record dalla query
        count_query = f"SELECT COUNT(*) as record_count FROM ({query}) as subq"
        result = execute_query(count_query, params, fetch=True)
        
        if result and len(result) > 0:
            record_count = result[0]['record_count']
            header_size = len(custom_header.encode('utf-8'))
            data_size = record_count * 150  # 150 byte per record
            return header_size + data_size
        else:
            return 1024  # Fallback minimo
            
    except Exception as e:
        logging.error(f"Errore stima postgres stream: {e}")
        return 1024

def estimate_minio_stream_size(file_path):
    """
    Stima dimensione stream Minio file
    """
    return estimate_minio_file_size(file_path)

def estimate_zip_stream_size(file_paths, zip_name='files.zip'):
    """
    Stima dimensione ZIP stream
    """
    try:
        total_size = 0
        for file_path in file_paths:
            total_size += estimate_minio_file_size(file_path)
        
        # Considera compressione ZIP (~20% riduzione per file misti)
        compressed_size = int(total_size * 0.8)
        return max(compressed_size, 1024)
        
    except Exception as e:
        logging.error(f"Errore stima ZIP stream: {e}")
        return len(file_paths) * 1024 * 1024  # 1MB per file fallback

def estimate_unified_download_size(*args, **kwargs):
    """
    Stima dimensione per download unificato in base ai parametri request
    """
    try:
        # Recupera parametri dalla request
        item_type = request.view_args.get('item_type', 'unknown')
        item_id = request.view_args.get('item_id', 0)
        file_paths = request.args.getlist('file_paths')
        
        # Date per calcoli temporali
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if item_type == 'parameter' or item_type == 'channel':
            # Download dati numerici CSV
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
            # File singolo
            file_path = request.args.get('file_path')
            if file_path:
                return estimate_minio_file_size(file_path)
            else:
                return 5 * 1024 * 1024  # 5MB default
        
        elif item_type == 'files':
            # File multipli ZIP
            if file_paths:
                return estimate_zip_stream_size(file_paths)
            else:
                return 10 * 1024 * 1024  # 10MB default
        
        else:
            return 2 * 1024 * 1024  # 2MB fallback
            
    except Exception as e:
        logging.error(f"Errore stima unified download: {e}")
        return 5 * 1024 * 1024  # 5MB fallback sicuro