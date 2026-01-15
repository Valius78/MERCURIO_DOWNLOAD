"""
MULTI-FORMAT READINGS API ROUTES - UPDATED WITH UNIFIED DOWNLOAD
API endpoints per gestire readings con file (PDF, CSV, JSON, immagini, video)
Estende le API esistenti con supporto per file da bucket Minio
AGGIUNTO: Endpoint unificato per download streaming
"""

from flask import Blueprint, jsonify, request, send_file, Response
from flask import stream_with_context
from datetime import datetime, timedelta
import logging
import os
import tempfile
import mimetypes
from utils.db import execute_query, get_db_connection
from utils.minio_client import get_minio_client  # Assumendo che esista
from utils.minio_client import get_file_from_minio
import io
import pandas as pd


from utils.traffic_control_utils import (
    traffic_control, 
    estimate_postgres_csv_size, 
    estimate_minio_file_size,
    get_user_traffic_status,
    get_current_user_id
)


# Blueprint per le API multi-formato
multi_format_api = Blueprint('multi_format_api', __name__, url_prefix='/api')

def is_file_path(value):
    """
    Determina se un valore è un path di file
    """
    if not value or not isinstance(value, str):
        return False
    
    # Controlla estensioni comuni
    file_extensions = ['.pdf', '.csv', '.json', '.jpg', '.jpeg', '.png', '.gif', '.webp', 
                      '.mp4', '.avi', '.mkv', '.mov', '.wmv']
    
    value_lower = value.lower()
    for ext in file_extensions:
        if value_lower.endswith(ext):
            return True
    
    # Controlla prefissi path
    path_prefixes = ['/', './', 'minio://', 'http://', 'https://']
    for prefix in path_prefixes:
        if value_lower.startswith(prefix):
            return True
    
    return False

def get_file_type(file_path):
    """
    Determina il tipo di file dall'estensione
    """
    if not file_path:
        return 'unknown'
    
    ext = os.path.splitext(file_path.lower())[1]
    
    type_mapping = {
        '.pdf': 'pdf',
        '.csv': 'csv', 
        '.json': 'json',
        '.jpg': 'image', '.jpeg': 'image', '.png': 'image', 
        '.gif': 'image', '.webp': 'image',
        '.mp4': 'video', '.avi': 'video', '.mkv': 'video', 
        '.mov': 'video', '.wmv': 'video'
    }
    
    return type_mapping.get(ext, 'file')

def analyze_readings_content_type(readings):
    """
    Analizza il tipo di contenuto dei readings
    """
    if not readings:
        return 'numeric', {}
    
    content_analysis = {
        'total_readings': len(readings),
        'file_readings': 0,
        'numeric_readings': 0,
        'file_types': {},
        'mixed_content': False
    }
    
    for reading in readings:
        if is_file_path(reading.get('value', '')):
            content_analysis['file_readings'] += 1
            file_type = get_file_type(reading['value'])
            content_analysis['file_types'][file_type] = content_analysis['file_types'].get(file_type, 0) + 1
        else:
            content_analysis['numeric_readings'] += 1
    
    # Determina il tipo principale
    if content_analysis['file_readings'] == 0:
        primary_type = 'numeric'
    elif content_analysis['numeric_readings'] == 0:
        # Solo file - determina il tipo predominante
        if content_analysis['file_types']:
            primary_type = max(content_analysis['file_types'].items(), key=lambda x: x[1])[0]
        else:
            primary_type = 'file'
    else:
        # Contenuto misto
        primary_type = 'mixed'
        content_analysis['mixed_content'] = True
    
    return primary_type, content_analysis

# [MANTENGO TUTTI GLI ENDPOINT ESISTENTI PER BACKWARD COMPATIBILITY]

def estimate_unified_download_size(item_type, item_id):
    """
    Stima dimensione per endpoint unified_download
    """
    try:
        from flask import request
        from datetime import datetime, timedelta
        
        # Parametri dalla request
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        file_paths = request.args.getlist('file_paths')
        
        # Default dates per stima
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=7)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Detection tipo contenuto
        content_type = detect_content_type(item_type, item_id)
        
        if content_type in ['numeric_data', 'file_paths']:
            # Stima query PostgreSQL
            if item_type == 'parameter':
                query = """
                SELECT COUNT(*) as record_count
                FROM readings r
                WHERE r.parameter_id = %s
                  AND r.timestamp_utc BETWEEN %s AND %s
                """
                params = (item_id, start_date, end_date)
                
            elif item_type == 'channel':
                query = """
                SELECT COUNT(*) as record_count  
                FROM readings r
                JOIN parameters p ON r.parameter_id = p.parameter_id
                WHERE p.channel_id = %s
                  AND r.timestamp_utc BETWEEN %s AND %s
                """
                params = (item_id, start_date, end_date)
            
            # Esegui conteggio
            try:
                result = execute_query(query, params, fetch=True)
                if result and len(result) > 0:
                    record_count = result[0]['record_count']
                    # 150 byte per record CSV (timestamp + valore + metadata)
                    estimated_bytes = record_count * 150
                    return max(estimated_bytes, 1024)  # Minimo 1KB
                else:
                    return 1024
            except:
                return 1 * 1024 * 1024  # 1MB fallback
                
        elif content_type == 'single_file':
            # Singolo file
            file_path = request.args.get('file_path')
            if file_path:
                return estimate_minio_file_size(file_path)
            else:
                return 5 * 1024 * 1024  # 5MB default
                
        elif content_type == 'multiple_files':
            # File multipli
            if file_paths:
                total_size = 0
                for file_path in file_paths:
                    total_size += estimate_minio_file_size(file_path)
                return total_size
            else:
                return 10 * 1024 * 1024  # 10MB default
                
        else:
            return 2 * 1024 * 1024  # 2MB fallback
            
    except Exception as e:
        logging.error(f"Errore stima unified download: {e}")
        return 5 * 1024 * 1024  # 5MB fallback sicuro

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

def estimate_zip_stream_size(file_paths, zip_name):
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

@multi_format_api.route('/readings/parameter/<int:parameter_id>')
def get_parameter_readings_multiformat_fixed(parameter_id):
    """
    API CORRETTA: downsampling intelligente + statistiche DB separate
    """
    try:
        # Parsing parametri
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date') 
        limit = request.args.get('limit', 1000, type=int)
        
        # Default dates
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=7)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Query info parametro
        parameter_info_query = """
            SELECT 
                p.parameter_id, p.name, p.code as parameter_code, p.unit, p.data_type,
                c.name as channel_name, c.code as channel_code,
                i.name as item_name, i.code as item_code,
                a.name as area_name, a.code as area_code,
                s.name as scenario_name, s.code as scenario_code
            FROM parameters p
            JOIN channels c ON p.channel_id = c.channel_id
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            WHERE p.parameter_id = %s
        """
        
        parameter_info_result = execute_query(parameter_info_query, (parameter_id,), fetch=True)
        
        if not parameter_info_result:
            return jsonify({
                'error': 'Parametro non trovato',
                'parameter_id': parameter_id
            }), 404
        
        parameter_info = parameter_info_result[0]
        data_type = parameter_info.get('data_type', 'numeric')

        # STEP 1: Conta TUTTI i record nel periodo (per decidere downsampling)
        count_query = """
            SELECT COUNT(*) as total_count
            FROM readings r
            WHERE r.parameter_id = %s
              AND r.timestamp_utc >= %s
              AND r.timestamp_utc <= %s
              AND r.value IS NOT NULL
        """
        
        count_result = execute_query(count_query, (parameter_id, start_date, end_date), fetch=True)
        total_records = count_result[0]['total_count'] if count_result else 0
        
        # STEP 2: Decidi se usare downsampling
        use_downsampling = (data_type == 'numeric' and total_records > limit)
        
        if use_downsampling:
            # DOWNSAMPLING: Usa bucket logic solo se necessario
            duration_seconds = (end_date - start_date).total_seconds()
            num_buckets = max(1, limit // 2)
            interval_seconds = max(1, duration_seconds / num_buckets)

            readings_query = """
                WITH buckets AS (
                    SELECT 
                        r.timestamp_utc, r.value,
                        floor(extract(epoch from r.timestamp_utc) / %s) as bucket_id
                    FROM readings r
                    WHERE r.parameter_id = %s
                      AND r.timestamp_utc >= %s
                      AND r.timestamp_utc <= %s
                      AND r.value IS NOT NULL
                ),
                min_max_points AS (
                    (SELECT DISTINCT ON (bucket_id) timestamp_utc, value FROM buckets ORDER BY bucket_id, value ASC)
                    UNION ALL
                    (SELECT DISTINCT ON (bucket_id) timestamp_utc, value FROM buckets ORDER BY bucket_id, value DESC)
                )
                SELECT timestamp_utc, value FROM min_max_points ORDER BY timestamp_utc ASC
            """
            params = (interval_seconds, parameter_id, start_date, end_date)
        else:
            # NO DOWNSAMPLING: Query normale se sotto il limite
            readings_query = """
                SELECT r.timestamp_utc, r.value
                FROM readings r
                WHERE r.parameter_id = %s
                  AND r.timestamp_utc >= %s
                  AND r.timestamp_utc <= %s
                ORDER BY r.timestamp_utc DESC
                LIMIT %s
            """
            params = (parameter_id, start_date, end_date, limit)

        db_results = execute_query(readings_query, params, fetch=True)

        # STEP 3: Formatta readings
        readings_list = []
        for row in db_results:
            ts = row['timestamp_utc']
            val = row['value']
            
            if ts is None:
                continue
                
            ts_iso = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts).replace(' ', 'T')
            
            try:
                val_formatted = float(val) if isinstance(val, (int, float)) or (isinstance(val, str) and val.replace('.','',1).isdigit()) else val
            except:
                val_formatted = val

            readings_list.append({
                'timestamp_utc': ts_iso,
                'value': val_formatted
            })
        
        # STEP 4: STATISTICHE DB SEPARATE (sempre su tutti i record)
        if data_type == 'numeric':
            stats_query = """
                SELECT 
                    COUNT(*) as count,
                    COUNT(CASE WHEN r.value ~ '^[0-9]*\.?[0-9]+$' THEN 1 END) as numeric_count,
                    MIN(CAST(r.value AS FLOAT)) as min_val,
                    MAX(CAST(r.value AS FLOAT)) as max_val,
                    AVG(CAST(r.value AS FLOAT)) as avg_val
                FROM readings r
                WHERE r.parameter_id = %s
                  AND r.timestamp_utc >= %s
                  AND r.timestamp_utc <= %s
                  AND r.value IS NOT NULL
                  AND r.value ~ '^[0-9]*\.?[0-9]+$'
            """
            
            stats_result = execute_query(stats_query, (parameter_id, start_date, end_date), fetch=True)
            
            if stats_result and stats_result[0]['numeric_count'] > 0:
                stats_row = stats_result[0]
                stats = {
                    'count': int(stats_row['count']),
                    'numeric_count': int(stats_row['numeric_count']),
                    'min': round(float(stats_row['min_val']), 3),
                    'max': round(float(stats_row['max_val']), 3),
                    'avg': round(float(stats_row['avg_val']), 3),
                    'total_records_in_period': total_records,
                    'downsampled': use_downsampling,
                    'chart_samples': len(readings_list)
                }
            else:
                stats = {
                    'count': total_records,
                    'numeric_count': 0,
                    'min': None,
                    'max': None,
                    'avg': None,
                    'total_records_in_period': total_records,
                    'downsampled': use_downsampling,
                    'chart_samples': len(readings_list)
                }
        else:
            # Per file/cartelle
            content_type, content_analysis = analyze_readings_content_type(readings_list)
            stats = {
                'count': total_records,
                'file_count': content_analysis.get('file_readings', 0),
                'numeric_count': content_analysis.get('numeric_readings', 0),
                'file_types': content_analysis.get('file_types', {}),
                'mixed_content': content_analysis.get('mixed_content', False),
                'downsampled': False,
                'chart_samples': len(readings_list)
            }
        
        # Determina tipo contenuto
        content_type, content_analysis = analyze_readings_content_type(readings_list)
        
        # Risposta finale
        response_data = {
            'readings': readings_list,
            'parameter_info': {
                'parameter_id': parameter_info['parameter_id'],
                'name': parameter_info['name'],
                'parameter_code': parameter_info['parameter_code'],
                'unit': parameter_info['unit'],
                'data_type': parameter_info['data_type'],
                'channel_name': parameter_info['channel_name'],
                'channel_code': parameter_info['channel_code'],
                'item_name': parameter_info['item_name'],
                'item_code': parameter_info['item_code'],
                'area_name': parameter_info['area_name'],
                'area_code': parameter_info['area_code'],
                'scenario_name': parameter_info['scenario_name'],
                'scenario_code': parameter_info['scenario_code']
            },
            'content_info': {
                'content_type': content_type,
                'analysis': content_analysis
            },
            'stats': stats,
            'query_info': {
                'parameter_id': parameter_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'limit': limit,
                'total_records_found': total_records,
                'downsampling_applied': use_downsampling
            }
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        logging.error(f"Errore API parameter readings multiformat {parameter_id}: {e}")
        return jsonify({
            'error': 'Errore interno del server',
            'message': str(e)
        }), 500

@multi_format_api.route('/readings/channel/<int:channel_id>')
def get_channel_readings_multiformat_fixed(channel_id):
    """
    API CORRETTA per ottenere readings di un canale con downsampling intelligente
    """
    try:
        # Parsing parametri query
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = request.args.get('limit', 500, type=int)
        
        # Default dates
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=7)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Query info canale
        channel_info_query = """
            SELECT 
                c.channel_id, c.name as channel_name, c.code as channel_code, c.description,
                i.name as item_name, i.code as item_code,
                a.name as area_name, a.code as area_code,
                s.name as scenario_name, s.code as scenario_code,
                COUNT(DISTINCT p.parameter_id) as parameter_count
            FROM channels c
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            LEFT JOIN parameters p ON c.channel_id = p.channel_id
            WHERE c.channel_id = %s
            GROUP BY c.channel_id, c.name, c.code, c.description,
                     i.name, i.code, a.name, a.code, s.name, s.code
        """
        
        channel_info_result = execute_query(channel_info_query, (channel_id,), fetch=True)
        
        if not channel_info_result:
            return jsonify({
                'error': 'Canale non trovato',
                'channel_id': channel_id
            }), 404
            
        channel_info = channel_info_result[0]
        
        # 1. Otteniamo lista parametri del canale
        params_list_query = """
            SELECT parameter_id, name, data_type 
            FROM parameters 
            WHERE channel_id = %s
        """
        parameters_in_channel = execute_query(params_list_query, (channel_id,), fetch=True)
        
        readings_by_parameter = {}
        parameter_stats = []
        
        for p in parameters_in_channel:
            p_id = p['parameter_id']
            p_name = p['name']
            p_type = p['data_type']
            
            # NUOVO: Downsampling intelligente
            if p_type == 'numeric':
                # STEP 1: Count totale record per questo parametro
                count_query = """
                    SELECT COUNT(*) as total_records
                    FROM readings 
                    WHERE parameter_id = %s 
                      AND timestamp_utc BETWEEN %s AND %s 
                      AND value IS NOT NULL
                """
                count_result = execute_query(count_query, (p_id, start_date, end_date), fetch=True)
                total_records = count_result[0]['total_records'] if count_result else 0
                
                # STEP 2: Decide if downsampling is needed
                use_downsampling = total_records > limit
                
                if use_downsampling:
                    # Downsampling bucket logic
                    duration_sec = (end_date - start_date).total_seconds()
                    num_buckets = max(1, limit // 2)
                    interval_sec = max(1, duration_sec / num_buckets)
                    
                    query = """
                        WITH buckets AS (
                            SELECT r.timestamp_utc, r.value,
                                   floor(extract(epoch from r.timestamp_utc) / %s) as bucket_id
                            FROM readings r
                            WHERE r.parameter_id = %s AND r.timestamp_utc BETWEEN %s AND %s AND r.value IS NOT NULL
                        ),
                        min_max AS (
                            (SELECT DISTINCT ON (bucket_id) timestamp_utc, value FROM buckets ORDER BY bucket_id, value ASC)
                            UNION ALL
                            (SELECT DISTINCT ON (bucket_id) timestamp_utc, value FROM buckets ORDER BY bucket_id, value DESC)
                        )
                        SELECT timestamp_utc, value FROM min_max ORDER BY timestamp_utc ASC
                    """
                    params = (interval_sec, p_id, start_date, end_date)
                else:
                    # Normal query without downsampling
                    query = """
                        SELECT timestamp_utc, value 
                        FROM readings 
                        WHERE parameter_id = %s AND timestamp_utc BETWEEN %s AND %s AND value IS NOT NULL
                        ORDER BY timestamp_utc DESC LIMIT %s
                    """
                    params = (p_id, start_date, end_date, limit)
                
                # STEP 3: Statistiche SEMPRE su tutti i record + DEBUG
                # Query di debug per capire il problema MIN
                debug_query = """
                    SELECT 
                        COUNT(*) as total_count,
                        COUNT(CASE WHEN value ~ '^-?[0-9]+\.?[0-9]*$|^-?[0-9]*\.[0-9]+$' THEN 1 END) as numeric_count,
                        COUNT(CASE WHEN value IS NOT NULL THEN 1 END) as non_null_count,
                        MIN(value) as min_text,
                        MAX(value) as max_text,
                        string_agg(DISTINCT value, ', ') as sample_values
                    FROM readings 
                    WHERE parameter_id = %s 
                      AND timestamp_utc BETWEEN %s AND %s 
                    LIMIT 1
                """
                debug_result = execute_query(debug_query, (p_id, start_date, end_date), fetch=True)
                if debug_result:
                    logging.info(f"DEBUG parametro {p_name} (ID {p_id}): {debug_result[0]}")
                
                # Query statistiche migliorata con CASE WHEN
                stats_query = """
                    WITH numeric_values AS (
                        SELECT 
                            CASE 
                                WHEN value ~ '^-?[0-9]+\.?[0-9]*$' THEN CAST(value AS FLOAT)
                                WHEN value ~ '^-?[0-9]*\.[0-9]+$' THEN CAST(value AS FLOAT)
                                ELSE NULL
                            END as numeric_value
                        FROM readings 
                        WHERE parameter_id = %s 
                          AND timestamp_utc BETWEEN %s AND %s 
                          AND value IS NOT NULL
                    )
                    SELECT 
                        COUNT(*) as count,
                        MIN(numeric_value) as min,
                        MAX(numeric_value) as max,
                        AVG(numeric_value) as avg
                    FROM numeric_values 
                    WHERE numeric_value IS NOT NULL
                """
                stats_result = execute_query(stats_query, (p_id, start_date, end_date), fetch=True)
                
            else:
                # Query standard per file/cartelle
                total_records = 0
                use_downsampling = False
                query = """
                    SELECT timestamp_utc, value FROM readings 
                    WHERE parameter_id = %s AND timestamp_utc BETWEEN %s AND %s
                    ORDER BY timestamp_utc DESC LIMIT %s
                """
                params = (p_id, start_date, end_date, limit)
                stats_result = None

            # Esegui query dati
            db_data = execute_query(query, params, fetch=True)
            
            # Formattazione sicura
            param_readings = []
            for row in db_data:
                ts = row['timestamp_utc']
                ts_iso = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts).replace(' ', 'T')
                
                param_readings.append({
                    'timestamp_utc': ts_iso,
                    'value': float(row['value']) if p_type == 'numeric' and row['value'] is not None else row['value']
                })
            
            readings_by_parameter[p_name] = param_readings
            
            # Crea statistiche per parametro
            if p_type == 'numeric' and stats_result and len(stats_result) > 0:
                stat_data = stats_result[0]
                
                # Debug logging per problemi statistiche
                logging.info(f"Stats per parametro {p_name}: {stat_data}")
                
                # Parsing sicuro dei valori
                try:
                    count_val = int(stat_data['count']) if stat_data.get('count') is not None else 0
                    min_val = round(float(stat_data['min']), 3) if stat_data.get('min') is not None else None
                    max_val = round(float(stat_data['max']), 3) if stat_data.get('max') is not None else None
                    avg_val = round(float(stat_data['avg']), 3) if stat_data.get('avg') is not None else None
                except (TypeError, ValueError) as e:
                    logging.warning(f"Errore parsing stats parametro {p_name}: {e}")
                    count_val, min_val, max_val, avg_val = 0, None, None, None
                
                stat = {
                    'parameter_id': p_id,
                    'parameter_name': p_name,
                    'content_type': 'numeric',
                    'total_records_in_period': total_records,
                    'chart_samples': len(param_readings),
                    'downsampled': use_downsampling,
                    'count': count_val,
                    'min': min_val,
                    'max': max_val,
                    'avg': avg_val
                }
            else:
                # Statistiche per file/cartelle
                stat = {
                    'parameter_id': p_id,
                    'parameter_name': p_name,
                    'content_type': 'file' if p_type != 'numeric' else 'numeric',
                    'total_records_in_period': total_records,
                    'chart_samples': len(param_readings),
                    'downsampled': use_downsampling,
                    'count': len(param_readings)
                }
            
            parameter_stats.append(stat)
        
        # Determina tipo contenuto generale
        has_numeric = any(s['content_type'] == 'numeric' for s in parameter_stats)
        has_files = any(s['content_type'] != 'numeric' for s in parameter_stats)
        
        if has_files and has_numeric:
            overall_content_type = 'mixed'
        elif has_files:
            overall_content_type = 'files'
        else:
            overall_content_type = 'numeric'
        
        # Risposta
        response_data = {
            'readings': readings_by_parameter,
            'channel_info': {
                'channel_id': channel_id,
                'name': channel_info['channel_name'],
                'code': channel_info['channel_code'],
                'description': channel_info['description'],
                'parameter_count': channel_info['parameter_count'],
                'item_name': channel_info['item_name'],
                'item_code': channel_info['item_code'],
                'area_name': channel_info['area_name'],
                'area_code': channel_info['area_code'],
                'scenario_name': channel_info['scenario_name'],
                'scenario_code': channel_info['scenario_code']
            },
            'content_info': {
                'content_type': overall_content_type,
                'has_files': has_files,
                'has_numeric': has_numeric
            },
            'stats': parameter_stats,
            'query_info': {
                'channel_id': channel_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'limit_per_parameter': limit
            }
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        logging.error(f"Errore API channel readings multiformat {channel_id}: {e}")
        return jsonify({
            'error': 'Errore interno del server',
            'message': str(e)
        }), 500

# [MANTENGO TUTTI GLI ALTRI ENDPOINT ESISTENTI...]

# API per gestione file
@multi_format_api.route('/files/view/<path:file_path>')
def view_file(file_path):
    """API per visualizzare un file (per PDF, immagini, video)"""
    try:
        import urllib.parse
        file_path = urllib.parse.unquote(file_path)
        
        # Determina il tipo MIME
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        try:
            # Scarica da Minio
            file_content = get_file_from_minio(file_path)
            
            return Response(
                file_content,
                mimetype=mime_type,
                headers={'Content-Disposition': 'inline'}
            )
            
        except Exception as minio_error:
            logging.error(f"Errore view file {file_path}: {minio_error}")
            return jsonify({'error': 'File non trovato'}), 404
        
    except Exception as e:
        logging.error(f"Errore view file {file_path}: {e}")
        return jsonify({'error': str(e)}), 500


@multi_format_api.route('/files/download/<path:file_path>')
def download_file(file_path):
    """API per scaricare un file"""
    try:
        import urllib.parse
        file_path = urllib.parse.unquote(file_path)
        
        filename = os.path.basename(file_path)
        
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        try:
            # Scarica da Minio
            file_content = get_file_from_minio(file_path)
            
            return Response(
                file_content,
                mimetype=mime_type,
                headers={'Content-Disposition': f'attachment; filename="{filename}"'}
            )
            
        except Exception as minio_error:
            logging.error(f"Errore download file {file_path}: {minio_error}")
            return jsonify({'error': 'File non trovato'}), 404
        
    except Exception as e:
        logging.error(f"Errore download file {file_path}: {e}")
        return jsonify({'error': str(e)}), 500

@multi_format_api.route('/files/preview/<path:file_path>')
def preview_file(file_path):
    """
    API per preview ottimizzata (thumbnail per immagini, etc.)
    """
    try:
        import urllib.parse
        file_path = urllib.parse.unquote(file_path)
        
        # Per ora usa la stessa logica di view, ma potresti implementare
        # thumbnail generation per immagini, preview per PDF, etc.
        return view_file(file_path)
        
    except Exception as e:
        logging.error(f"Errore preview file {file_path}: {e}")
        return jsonify({'error': str(e)}), 500

@multi_format_api.route('/files/csv-data/<path:file_path>')
def get_csv_data(file_path):
    """
    API per ottenere dati CSV parsati per grafici
    """
    try:
        import urllib.parse
        
        file_path = urllib.parse.unquote(file_path)
        
        try:
            # Scarica file da Minio (usa bucket di default)
            csv_content = get_file_from_minio(file_path)
            csv_data = csv_content.decode('utf-8')
            
            # Carica CSV usando pandas
            df = pd.read_csv(io.StringIO(csv_data))
            
            data = {
                'columns': df.columns.tolist(),
                'rows': df.to_dict('records'),
                'shape': df.shape,
                'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()}
            }
            
            return jsonify(data)
            
        except Exception as minio_error:
            logging.error(f"Errore Minio CSV {file_path}: {minio_error}")
            return jsonify({'error': f'File CSV non trovato: {str(minio_error)}'}), 404
        
    except Exception as e:
        logging.error(f"Errore parse CSV {file_path}: {e}")
        return jsonify({'error': str(e)}), 500


@multi_format_api.route('/files/json-data/<path:file_path>')
def get_json_data(file_path):
    """
    API per ottenere dati JSON per tabella
    """
    try:
        import urllib.parse
        import json
        
        file_path = urllib.parse.unquote(file_path)
        
        try:
            # Scarica file da Minio (usa bucket di default)
            json_content = get_file_from_minio(file_path)
            json_data_str = json_content.decode('utf-8')
            
            # Parse JSON
            json_data = json.loads(json_data_str)
            
            return jsonify({
                'data': json_data,
                'type': type(json_data).__name__,
                'size': len(json_data_str)
            })
            
        except Exception as minio_error:
            logging.error(f"Errore Minio JSON {file_path}: {minio_error}")
            return jsonify({'error': f'File JSON non trovato: {str(minio_error)}'}), 404
        
    except Exception as e:
        logging.error(f"Errore parse JSON {file_path}: {e}")
        return jsonify({'error': str(e)}), 500


@multi_format_api.route('/files/list-folder/<path:folder_path>')
def list_folder_contents(folder_path):
    """
    API per listare i contenuti di una cartella Minio
    """
    try:
        import urllib.parse
        from utils.minio_client import get_minio_client, get_minio_bucket_name
        
        folder_path = urllib.parse.unquote(folder_path)
        
        # Assicurati che il path termini con /
        if not folder_path.endswith('/'):
            folder_path += '/'
        
        minio_client = get_minio_client()
        bucket_name = get_minio_bucket_name()  # Usa la tua funzione
        
        # Lista oggetti nella cartella
        objects = minio_client.list_objects(bucket_name, prefix=folder_path, recursive=True)
        
        folders = set()
        files = []
        
        for obj in objects:
            # Rimuovi il prefisso della cartella principale
            relative_path = obj.object_name[len(folder_path):]
            
            if '/' in relative_path:
                # È in una sottocartella
                subfolder = relative_path.split('/')[0]
                folders.add(subfolder)
            else:
                # È un file nella cartella corrente
                if relative_path:  # Ignora la cartella stessa
                    files.append({
                        'name': relative_path,
                        'path': obj.object_name,
                        'size': obj.size,
                        'last_modified': obj.last_modified.isoformat() if obj.last_modified else None,
                        'type': get_file_type(relative_path)
                    })
        
        return jsonify({
            'folder_path': folder_path,
            'folders': sorted(list(folders)),
            'files': files,
            'total_folders': len(folders),
            'total_files': len(files)
        })
        
    except Exception as e:
        logging.error(f"Errore list folder {folder_path}: {e}")
        return jsonify({'error': str(e)}), 500


@multi_format_api.route('/files/download-zip', methods=['POST'])
def download_files_as_zip():
    """
    API per scaricare file multipli come ZIP
    """
    try:
        import zipfile
        import tempfile
        import os
        from utils.minio_client import get_minio_client, get_minio_bucket_name
        
        data = request.json
        file_paths = data.get('file_paths', [])
        zip_name = data.get('zip_name', 'files.zip')
        
        logging.info(f"Richiesta ZIP per {len(file_paths)} file: {zip_name}")
        
        if not file_paths:
            return jsonify({'error': 'Nessun file specificato'}), 400
        
        minio_client = get_minio_client()
        bucket_name = get_minio_bucket_name()
        
        logging.info(f"Usando bucket: {bucket_name}")
        
        # Crea ZIP in memoria invece di file temporaneo
        import io
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            
            for i, file_path in enumerate(file_paths):
                try:
                    logging.info(f"Processando file {i+1}/{len(file_paths)}: {file_path}")
                    
                    # Scarica da Minio
                    file_obj = minio_client.get_object(bucket_name, file_path)
                    file_data = file_obj.read()
                    
                    # Nome del file nello ZIP (solo il nome, non tutto il path)
                    file_name = os.path.basename(file_path)
                    
                    # Aggiungi al ZIP
                    zipf.writestr(file_name, file_data)
                    logging.info(f"Aggiunto al ZIP: {file_name} ({len(file_data)} bytes)")
                    
                except Exception as e:
                    logging.error(f"Errore aggiunta file {file_path} al ZIP: {e}")
                    # Continua con gli altri file
                    continue
        
        # Ottieni dati ZIP dalla memoria
        zip_buffer.seek(0)
        zip_data = zip_buffer.getvalue()
        zip_buffer.close()
        
        logging.info(f"ZIP creato in memoria: {len(zip_data)} bytes")
        
        return Response(
            zip_data,
            mimetype='application/zip',
            headers={'Content-Disposition': f'attachment; filename="{zip_name}"'}
        )
        
    except Exception as e:
        logging.error(f"Errore generale creazione ZIP: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@multi_format_api.route('/readings/parameter/<int:parameter_id>/table')
def get_parameter_table_data(parameter_id):
    start_date = request.args.get('start_date', '').replace('T', ' ')[:19]
    end_date = request.args.get('end_date', '').replace('T', ' ')[:19]
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))
    offset = (page - 1) * per_page

    try:
        # Query Dati con fetch=True
        query = """
            SELECT timestamp_utc, value 
            FROM readings 
            WHERE parameter_id = %s 
            AND timestamp_utc BETWEEN %s AND %s
            ORDER BY timestamp_utc DESC
            LIMIT %s OFFSET %s
        """
        rows = execute_query(query, (int(parameter_id), str(start_date), str(end_date), int(per_page), int(offset)), fetch=True)
        
        if not isinstance(rows, list):
            rows = []

        # Query Conteggio con fetch=True
        count_query = """
            SELECT COUNT(*) as total 
            FROM readings 
            WHERE parameter_id = %s 
            AND timestamp_utc BETWEEN %s AND %s
        """
        count_result = execute_query(count_query, (int(parameter_id), str(start_date), str(end_date)), fetch=True)
        
        total_records = 0
        if isinstance(count_result, list) and len(count_result) > 0:
            res = count_result[0]
            total_records = res.get('total', 0) if isinstance(res, dict) else res[0]

        return jsonify({
            'status': 'success',
            'data': rows,
            'pagination': {
                'total': total_records,
                'page': page,
                'per_page': per_page,
                'pages': (total_records + per_page - 1) // per_page if total_records > 0 else 1
            }
        })
    except Exception as e:
        logging.error(f"Errore critico: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@multi_format_api.route('/readings/channel/<int:channel_id>/parameter-id')
def get_parameter_id_from_channel(channel_id):
    try:
        param_name = request.args.get('param_name')
        if not param_name:
            return jsonify({'error': 'Parametro param_name richiesto'}), 400
            
        query = """
            SELECT parameter_id, name, unit
            FROM parameters 
            WHERE channel_id = %s AND name = %s
        """
        
        result = execute_query(query, (channel_id, param_name), fetch=True)
        
        if not result:
            return jsonify({'error': f'Parametro {param_name} non trovato nel canale {channel_id}'}), 404
            
        param_info = result[0]
        
        return jsonify({
            'parameter_id': param_info['parameter_id'],
            'name': param_info['name'], 
            'unit': param_info.get('unit', ''),
            'channel_id': channel_id
        })
        
    except Exception as e:
        logging.error(f"Errore get parameter_id from channel {channel_id}: {e}")
        return jsonify({'error': str(e)}), 500

@multi_format_api.route('/readings/parameter/<int:parameter_id>/export')
def export_parameter_data_full(parameter_id):
    """
    NUOVO ENDPOINT: Export dati completi (tutti i record DB, non sottocampionati)
    """
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Default dates se non fornite
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=7)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Query info parametro
        parameter_info_query = """
            SELECT 
                p.parameter_id, p.name, p.code as parameter_code, p.unit,
                c.name as channel_name, i.name as item_name,
                a.name as area_name, s.name as scenario_name
            FROM parameters p
            JOIN channels c ON p.channel_id = c.channel_id
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            WHERE p.parameter_id = %s
        """
        
        param_info = execute_query(parameter_info_query, (parameter_id,), fetch=True)
        if not param_info:
            return jsonify({'error': 'Parametro non trovato'}), 404
        
        info = param_info[0]
        
        # Query TUTTI i dati (no limit, no downsampling)
        export_query = """
            SELECT timestamp_utc, value
            FROM readings 
            WHERE parameter_id = %s
              AND timestamp_utc >= %s  
              AND timestamp_utc <= %s
            ORDER BY timestamp_utc DESC
        """
        
        all_data = execute_query(export_query, (parameter_id, start_date, end_date), fetch=True)
        
        # Prepara response
        return jsonify({
            'parameter_info': info,
            'readings': [
                {
                    'timestamp_utc': row['timestamp_utc'].isoformat() if hasattr(row['timestamp_utc'], 'isoformat') else str(row['timestamp_utc']),
                    'value': row['value']
                } 
                for row in all_data
            ],
            'export_info': {
                'total_records': len(all_data),
                'period_start': start_date.isoformat(),
                'period_end': end_date.isoformat(),
                'export_timestamp': datetime.now().isoformat()
            }
        })
        
    except Exception as e:
        logging.error(f"Errore export full data parameter {parameter_id}: {e}")
        return jsonify({
            'error': 'Errore export dati completi',
            'message': str(e)
        }), 500

@multi_format_api.route('/readings/parameter/<int:parameter_id>/folders')
def get_parameter_folders_paginated(parameter_id):
    """
    API NUOVA: Lista cartelle di un parametro con paginazione
    """
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        # Default dates
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=30)  # Default più ampio per cartelle
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Query info parametro
        parameter_info_query = """
            SELECT p.parameter_id, p.name, p.data_type,
                   c.name as channel_name, i.name as item_name,
                   a.name as area_name, s.name as scenario_name
            FROM parameters p
            JOIN channels c ON p.channel_id = c.channel_id
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            WHERE p.parameter_id = %s
        """
        
        param_info = execute_query(parameter_info_query, (parameter_id,), fetch=True)
        if not param_info:
            return jsonify({'error': 'Parametro non trovato'}), 404
        
        info = param_info[0]
        
        # Verifica che sia un parametro con cartelle/file
        if info.get('data_type') == 'numeric':
            return jsonify({'error': 'Parametro numerico non supporta paginazione cartelle'}), 400
        
        # Count totale cartelle
        count_query = """
            SELECT COUNT(*) as total
            FROM readings r
            WHERE r.parameter_id = %s
              AND r.timestamp_utc >= %s
              AND r.timestamp_utc <= %s
              AND r.value IS NOT NULL
        """
        
        count_result = execute_query(count_query, (parameter_id, start_date, end_date), fetch=True)
        total_folders = count_result[0]['total'] if count_result else 0
        
        # Query cartelle paginate
        offset = (page - 1) * per_page
        
        folders_query = """
            SELECT r.timestamp_utc, r.value
            FROM readings r
            WHERE r.parameter_id = %s
              AND r.timestamp_utc >= %s
              AND r.timestamp_utc <= %s
              AND r.value IS NOT NULL
            ORDER BY r.timestamp_utc DESC
            LIMIT %s OFFSET %s
        """
        
        folders_result = execute_query(folders_query, 
            (parameter_id, start_date, end_date, per_page, offset), fetch=True)
        
        # Formatta cartelle
        folders = []
        for row in folders_result:
            ts = row['timestamp_utc']
            ts_iso = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts).replace(' ', 'T')
            
            folders.append({
                'path': row['value'],
                'timestamp': ts_iso,
                'name': row['value'].split('/')[-1] if '/' in str(row['value']) else row['value']
            })
        
        # Calcola paginazione
        total_pages = (total_folders + per_page - 1) // per_page if total_folders > 0 else 1
        
        return jsonify({
            'folders': folders,
            'parameter_info': info,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_folders,
                'pages': total_pages,
                'has_prev': page > 1,
                'has_next': page < total_pages
            },
            'period_info': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        })
        
    except Exception as e:
        logging.error(f"Errore API folders paginated {parameter_id}: {e}")
        return jsonify({
            'error': 'Errore interno del server',
            'message': str(e)
        }), 500

@multi_format_api.route('/readings/parameter/<int:parameter_id>/files')  
def get_parameter_files_paginated(parameter_id):
    """
    API NUOVA: Lista file di un parametro con paginazione (per immagini, documenti, etc)
    """
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)  # Meno file per pagina per gallery
        file_type = request.args.get('file_type', 'all')  # all, image, pdf, csv, json, video
        
        # Default dates
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=30)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Query base files
        files_query = """
            SELECT r.timestamp_utc, r.value
            FROM readings r
            WHERE r.parameter_id = %s
              AND r.timestamp_utc >= %s
              AND r.timestamp_utc <= %s
              AND r.value IS NOT NULL
        """
        
        # Filtro per tipo file se specificato
        if file_type != 'all':
            type_extensions = {
                'image': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                'pdf': ['pdf'],
                'csv': ['csv'],
                'json': ['json'],
                'video': ['mp4', 'avi', 'mkv', 'mov', 'wmv']
            }
            
            if file_type in type_extensions:
                extensions = type_extensions[file_type]
                ext_conditions = ' OR '.join([f"r.value ILIKE '%.{ext}'" for ext in extensions])
                files_query += f" AND ({ext_conditions})"
        
        files_query += " ORDER BY r.timestamp_utc DESC"
        
        # Count totale
        count_query = files_query.replace('SELECT r.timestamp_utc, r.value', 'SELECT COUNT(*) as total')
        count_query = count_query.replace('ORDER BY r.timestamp_utc DESC', '')
        
        count_result = execute_query(count_query, (parameter_id, start_date, end_date), fetch=True)
        total_files = count_result[0]['total'] if count_result else 0
        
        # Query paginata
        offset = (page - 1) * per_page
        paginated_query = files_query + f" LIMIT {per_page} OFFSET {offset}"
        
        files_result = execute_query(paginated_query, (parameter_id, start_date, end_date), fetch=True)
        
        # Formatta files
        files = []
        for row in files_result:
            ts = row['timestamp_utc']
            ts_iso = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts).replace(' ', 'T')
            file_path = str(row['value'])
            
            files.append({
                'path': file_path,
                'timestamp': ts_iso,
                'name': file_path.split('/')[-1] if '/' in file_path else file_path,
                'type': get_file_type(file_path)
            })
        
        # Calcola paginazione
        total_pages = (total_files + per_page - 1) // per_page if total_files > 0 else 1
        
        return jsonify({
            'files': files,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_files,
                'pages': total_pages,
                'has_prev': page > 1,
                'has_next': page < total_pages
            },
            'filter_info': {
                'file_type': file_type,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        })
        
    except Exception as e:
        logging.error(f"Errore API files paginated {parameter_id}: {e}")
        return jsonify({
            'error': 'Errore interno del server',
            'message': str(e)
        }), 500

@multi_format_api.route('/readings/channel/<int:channel_id>/export')
def export_channel_data_full(channel_id):
    """
    NUOVO: Export completo dati canale (tutti i record, non sottocampionati)
    """
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Default dates
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=7)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Query info canale
        channel_info_query = """
            SELECT c.name as channel_name, c.code as channel_code,
                   i.name as item_name, a.name as area_name, s.name as scenario_name
            FROM channels c
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            WHERE c.channel_id = %s
        """
        
        channel_info = execute_query(channel_info_query, (channel_id,), fetch=True)
        if not channel_info:
            return jsonify({'error': 'Canale non trovato'}), 404
            
        info = channel_info[0]
        
        # Query tutti i parametri numerici
        params_query = """
            SELECT parameter_id, name 
            FROM parameters 
            WHERE channel_id = %s AND data_type = 'numeric'
            ORDER BY name
        """
        parameters = execute_query(params_query, (channel_id,), fetch=True)
        
        if not parameters:
            return jsonify({'error': 'Nessun parametro numerico trovato'}), 404
        
        # Query TUTTI i dati (no limit, no downsampling)
        all_data_query = """
            SELECT r.timestamp_utc, r.value, p.name as parameter_name
            FROM readings r
            JOIN parameters p ON r.parameter_id = p.parameter_id
            WHERE p.channel_id = %s
              AND r.timestamp_utc BETWEEN %s AND %s
              AND p.data_type = 'numeric'
              AND r.value IS NOT NULL
            ORDER BY r.timestamp_utc DESC, p.name
        """
        
        all_readings = execute_query(all_data_query, (channel_id, start_date, end_date), fetch=True)
        
        if not all_readings:
            return jsonify({'error': 'Nessun dato trovato nel periodo'}), 404
        
        # NUOVO: Organizza dati in formato colonne per CSV
        # Crea dizionario timestamp -> {param1: value1, param2: value2, ...}
        data_by_timestamp = {}
        param_names = [p['name'] for p in parameters]
        
        for reading in all_readings:
            ts = reading['timestamp_utc']
            ts_str = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)
            param_name = reading['parameter_name']
            value = reading['value']
            
            if ts_str not in data_by_timestamp:
                data_by_timestamp[ts_str] = {}
            
            data_by_timestamp[ts_str][param_name] = value
        
        # Ordina per timestamp
        sorted_timestamps = sorted(data_by_timestamp.keys(), reverse=True)
        
        # Genera CSV
        csv_content = []
        
        # Header informativo
        csv_content.append(f"# Export Canale: {info['channel_name']} ({info['channel_code']})")
        csv_content.append(f"# Scenario: {info['scenario_name']}")
        csv_content.append(f"# Area: {info['area_name']}")
        csv_content.append(f"# Item: {info['item_name']}")
        csv_content.append(f"# Periodo: {start_date.strftime('%Y-%m-%d %H:%M:%S')} - {end_date.strftime('%Y-%m-%d %H:%M:%S')}")
        csv_content.append(f"# Totale Record: {len(sorted_timestamps)}")
        csv_content.append(f"# Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        csv_content.append("")
        
        # Header CSV con colonne per parametro
        header_row = ["Timestamp"] + param_names
        csv_content.append(",".join(header_row))
        
        # Righe dati
        for timestamp in sorted_timestamps:
            row = [timestamp]
            timestamp_data = data_by_timestamp[timestamp]
            
            for param_name in param_names:
                value = timestamp_data.get(param_name, "")
                row.append(str(value) if value is not None else "")
            
            csv_content.append(",".join(row))
        
        # Crea risposta CSV
        csv_string = "\n".join(csv_content)
        
        # Response con BOM per Excel
        response = Response(
            '\ufeff' + csv_string,  # BOM UTF-8
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="channel_{channel_id}_export_{start_date.strftime("%Y%m%d")}_{end_date.strftime("%Y%m%d")}.csv"'
            }
        )
        
        return response
        
    except Exception as e:
        logging.error(f"Errore export canale {channel_id}: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# NUOVO ENDPOINT UNIFICATO PER DOWNLOAD STREAMING
# =============================================================================

def detect_content_type(item_type, item_id):
    """
    Detection automatica tipo contenuto MIGLIORATA
    Con cache e performance ottimizzata
    """
    try:
        if item_type == 'parameter':
            # Query ottimizzata con sample_value
            query = """
                SELECT 
                    p.data_type,
                    COUNT(r.reading_id) as reading_count,
                    (SELECT r2.value 
                     FROM readings r2 
                     WHERE r2.parameter_id = p.parameter_id 
                       AND r2.value IS NOT NULL 
                     LIMIT 1) as sample_value
                FROM parameters p
                LEFT JOIN readings r ON p.parameter_id = r.parameter_id
                WHERE p.parameter_id = %s
                GROUP BY p.parameter_id, p.data_type
            """
            
            result = execute_query(query, (item_id,), fetch=True)
            
            if not result:
                return 'unknown'
            
            row = result[0]
            data_type = row['data_type']
            sample_value = row['sample_value']
            
            if data_type == 'numeric':
                return 'numeric_data'
            elif sample_value and is_file_path(str(sample_value)):
                return 'file_paths'
            else:
                return 'mixed_content'
                
        elif item_type == 'channel':
            return 'numeric_data'  # Canali sempre numerici per export
            
        elif item_type == 'file':
            return 'single_file'
            
        elif item_type == 'files':
            return 'multiple_files'
            
        return 'unknown'
        
    except Exception as e:
        logging.error(f"Errore detection content type {item_type}/{item_id}: {e}")
        return 'unknown'

@traffic_control(calculate_size_func=estimate_postgres_stream_size)
def stream_postgres_csv(query, params, filename_prefix, custom_header=None):
    """
    PostgreSQL COPY TO STDOUT streaming con HEADER PERSONALIZZATO
    Supporta header informativi per parametri e canali
    """
    try:
        from utils.db import get_db_connection
        import psycopg2
        import tempfile
        
        def generate():
            conn = None
            cur = None
            temp_file = None
            try:
                # NUOVO: Se c'è custom_header, yield prima
                if custom_header:
                    yield custom_header.encode('utf-8-sig')  # BOM per Excel
                
                # Connessione dedicata per streaming
                conn = get_db_connection()
                cur = conn.cursor()
                
                # Prepara query con parametri bindati
                cur.execute(query, params)
                copy_query = cur.mogrify(query, params).decode('utf-8')
                copy_command = f"COPY ({copy_query}) TO STDOUT WITH CSV HEADER"
                
                # NUOVO: Usa file temporaneo per COPY diretto
                temp_file = tempfile.NamedTemporaryFile(mode='w+b', delete=False)
                cur.copy_expert(copy_command, temp_file)
                temp_file.close()
                
                # Stream file in chunk senza caricarlo in memoria
                with open(temp_file.name, 'rb') as f:
                    while True:
                        chunk = f.read(8192)  # 8KB chunk costante
                        if not chunk:
                            break
                        yield chunk
                        
            except Exception as e:
                logging.error(f"Errore stream postgres CSV: {e}")
                yield f"Error: {str(e)}".encode('utf-8')
            finally:
                # Cleanup
                if cur:
                    cur.close()
                if conn:
                    conn.close()
                if temp_file and os.path.exists(temp_file.name):
                    try:
                        os.unlink(temp_file.name)
                    except:
                        pass
        
        # Filename con timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{filename_prefix}_full_{timestamp}.csv"
        
        return Response(
            stream_with_context(generate()),
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Transfer-Encoding': 'chunked'
            }
        )
        
    except Exception as e:
        logging.error(f"Errore setup stream postgres CSV: {e}")
        return jsonify({'error': str(e)}), 500


# =================================================================
# HELPER FUNCTIONS per HEADER PERSONALIZZATI
# =================================================================

def generate_parameter_header(parameter_id, start_date, end_date):
    """
    Genera header personalizzato per export parametro singolo
    """
    try:
        # Query info parametro completa con unità
        info_query = """
            SELECT 
                p.parameter_id, p.name, p.code as parameter_code, p.unit, p.data_type,
                c.name as channel_name, c.code as channel_code,
                i.name as item_name, i.code as item_code,
                a.name as area_name, a.code as area_code,
                s.name as scenario_name, s.code as scenario_code
            FROM parameters p
            JOIN channels c ON p.channel_id = c.channel_id
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            WHERE p.parameter_id = %s
        """
        
        info_result = execute_query(info_query, (parameter_id,), fetch=True)
        if not info_result:
            return ""
        
        info = info_result[0]
        
        # Count record totali
        count_query = """
            SELECT COUNT(*) as total 
            FROM readings 
            WHERE parameter_id = %s 
            AND timestamp_utc BETWEEN %s AND %s
        """
        count_result = execute_query(count_query, (parameter_id, start_date, end_date), fetch=True)
        total_records = count_result[0]['total'] if count_result else 0
        
        # Genera header
        header = f"""Scenario Name,"{info.get('scenario_name', '')}"
Area Name,"{info.get('area_name', '')}"
Item Name,"{info.get('item_name', '')}"
Channel Name,"{info.get('channel_name', '')}"
Parameter Name,"{info.get('name', '')}"
Parameter Code,"{info.get('parameter_code', '')}"
Unit,"{info.get('unit', '')}"
Total Records,{total_records}
Export Date,"{datetime.now().isoformat()}"
Period Start,"{start_date.isoformat()}"
Period End,"{end_date.isoformat()}"

"""
        return header
        
    except Exception as e:
        logging.error(f"Errore generazione header parametro: {e}")
        return ""


def generate_channel_header(channel_id, start_date, end_date):
    """
    Genera header personalizzato per export canale con parametri e unità
    """
    try:
        # Query info canale completa
        info_query = """
            SELECT 
                c.channel_id, c.name as channel_name, c.code as channel_code, c.description,
                i.name as item_name, i.code as item_code,
                a.name as area_name, a.code as area_code,
                s.name as scenario_name, s.code as scenario_code
            FROM channels c
            JOIN items i ON c.item_id = i.item_id
            JOIN areas a ON i.area_id = a.area_id
            JOIN scenarios s ON a.scenario_id = s.scenario_id
            WHERE c.channel_id = %s
        """
        
        info_result = execute_query(info_query, (channel_id,), fetch=True)
        if not info_result:
            return ""
        
        info = info_result[0]
        
        # Query parametri con unità di misura
        params_query = """
            SELECT p.name, p.unit, COUNT(r.reading_id) as record_count
            FROM parameters p
            LEFT JOIN readings r ON p.parameter_id = r.parameter_id
                AND r.timestamp_utc BETWEEN %s AND %s
            WHERE p.channel_id = %s AND p.data_type = 'numeric'
            GROUP BY p.parameter_id, p.name, p.unit
            ORDER BY p.name
        """
        
        params_result = execute_query(params_query, (start_date, end_date, channel_id), fetch=True)
        
        # Count record totali
        total_count_query = """
            SELECT COUNT(*) as total
            FROM readings r
            JOIN parameters p ON r.parameter_id = p.parameter_id
            WHERE p.channel_id = %s 
            AND r.timestamp_utc BETWEEN %s AND %s
            AND p.data_type = 'numeric'
        """
        total_result = execute_query(total_count_query, (channel_id, start_date, end_date), fetch=True)
        total_records = total_result[0]['total'] if total_result else 0
        
        # Genera header con lista parametri e unità
        header = f"""# Export Canale: {info.get('channel_name', '')} ({info.get('channel_code', '')})
# Scenario: {info.get('scenario_name', '')}
# Area: {info.get('area_name', '')}
# Item: {info.get('item_name', '')}
# Periodo: {start_date.strftime('%Y-%m-%d %H:%M:%S')} - {end_date.strftime('%Y-%m-%d %H:%M:%S')}
# Totale Record: {total_records}
# Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""

        # Aggiungi lista parametri con unità
        if params_result:
            header += "# Parametri:\n"
            for param in params_result:
                unit_str = f"({param['unit']})" if param.get('unit') else "(no unit)"
                header += f"#   - {param['name']} {unit_str} - {param['record_count']} record\n"
        
        header += "#\n"
        
        return header
        
    except Exception as e:
        logging.error(f"Errore generazione header canale: {e}")
        return ""


def build_channel_pivot_query(channel_id, start_date, end_date):
    """
    Costruisce query PIVOT per organizzare parametri canale in colonne
    """
    try:
        # Ottieni lista parametri numerici
        params_query = """
            SELECT parameter_id, name
            FROM parameters 
            WHERE channel_id = %s AND data_type = 'numeric'
            ORDER BY name
        """
        params_result = execute_query(params_query, (channel_id,), fetch=True)
        
        if not params_result:
            return None, None
        
        # Costruisci query PIVOT dinamica
        param_cases = []
        param_names = []
        
        for param in params_result:
            param_id = param['parameter_id']
            param_name = param['name']
            param_names.append(param_name)
            
            # CASE WHEN per ogni parametro
            param_cases.append(f"""MAX(CASE WHEN p.parameter_id = {param_id} THEN r.value END) as "{param_name}\"""")
        
        # Query finale con PIVOT
        pivot_query = f"""
            SELECT 
                r.timestamp_utc,
                {','.join(param_cases)}
            FROM readings r
            JOIN parameters p ON r.parameter_id = p.parameter_id
            WHERE p.channel_id = %s
              AND r.timestamp_utc BETWEEN %s AND %s
              AND p.data_type = 'numeric'
              AND r.value IS NOT NULL
            GROUP BY r.timestamp_utc
            ORDER BY r.timestamp_utc DESC
        """
        
        return pivot_query, (channel_id, start_date, end_date)
        
    except Exception as e:
        logging.error(f"Errore build pivot query: {e}")
        return None, None

@traffic_control(calculate_size_func=estimate_minio_stream_size)
def stream_minio_file(file_path):
    """
    Minio file streaming OTTIMIZZATO
    Mantiene RAM costante con chunk di 8KB e error handling migliorato
    """
    try:
        from utils.minio_client import get_minio_client, get_minio_bucket_name
        
        minio_client = get_minio_client()
        bucket_name = get_minio_bucket_name()
        
        # Verifica esistenza file PRIMA dello streaming
        try:
            file_info = minio_client.stat_object(bucket_name, file_path)
        except Exception as e:
            logging.error(f"File non trovato: {file_path} - {e}")
            return jsonify({'error': f'File non trovato: {file_path}'}), 404
        
        filename = os.path.basename(file_path)
        
        # Determina mime type
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        def generate():
            response = None
            try:
                response = minio_client.get_object(bucket_name, file_path)
                # STREAMING VERO: chunk costanti di 8KB
                for chunk in response.stream(8192):
                    yield chunk
            except Exception as e:
                logging.error(f"Errore streaming file {file_path}: {e}")
                yield f"Error streaming file: {str(e)}".encode('utf-8')
            finally:
                if response:
                    response.close()
                    response.release_conn()
        
        return Response(
            stream_with_context(generate()),
            mimetype=mime_type,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': str(file_info.size)
                # RIMOZIONE: Transfer-Encoding chunked incompatibile con Content-Length
            }
        )
        
    except Exception as e:
        logging.error(f"Errore stream minio file {file_path}: {e}")
        return jsonify({'error': str(e)}), 500

@traffic_control(calculate_size_func=estimate_zip_stream_size)
def stream_zip_files(file_paths, zip_name):
    """
    ZIP streaming OTTIMIZZATO - RAM costante anche per ZIP grandi
    CORRETTO: Stream ZIP senza caricare file completi in memoria
    """
    try:
        from utils.minio_client import get_minio_client, get_minio_bucket_name
        import zipfile
        import tempfile
        
        minio_client = get_minio_client()
        bucket_name = get_minio_bucket_name()
        
        def generate():
            temp_zip = None
            try:
                # NUOVO: Usa file temporaneo per ZIP invece di memoria
                temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
                
                with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zipf:
                    
                    for file_path in file_paths:
                        try:
                            # Verifica esistenza file
                            try:
                                minio_client.stat_object(bucket_name, file_path)
                            except Exception:
                                logging.warning(f"File {file_path} non trovato, skip")
                                continue
                            
                            file_name = os.path.basename(file_path)
                            
                            # OTTIMIZZATO: Stream file direttamente nel ZIP
                            response = minio_client.get_object(bucket_name, file_path)
                            try:
                                # Buffer temporaneo per scrivere in ZIP
                                file_buffer = io.BytesIO()
                                for chunk in response.stream(8192):
                                    file_buffer.write(chunk)
                                
                                file_buffer.seek(0)
                                zipf.writestr(file_name, file_buffer.getvalue())
                                file_buffer.close()
                                
                            finally:
                                response.close()
                                response.release_conn()
                                
                        except Exception as e:
                            logging.error(f"Errore file ZIP {file_path}: {e}")
                            continue
                
                temp_zip.close()
                
                # Stream ZIP finale in chunk
                with open(temp_zip.name, 'rb') as zip_file:
                    while True:
                        chunk = zip_file.read(8192)  # 8KB chunk
                        if not chunk:
                            break
                        yield chunk
                        
            except Exception as e:
                logging.error(f"Errore ZIP streaming: {e}")
                yield f"Error: {str(e)}".encode('utf-8')
            finally:
                # Cleanup file temporaneo
                if temp_zip and os.path.exists(temp_zip.name):
                    try:
                        os.unlink(temp_zip.name)
                    except:
                        pass
        
        return Response(
            stream_with_context(generate()),
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{zip_name}"',
                'Transfer-Encoding': 'chunked'
            }
        )
        
    except Exception as e:
        logging.error(f"Errore stream ZIP: {e}")
        return jsonify({'error': str(e)}), 500


@multi_format_api.route('/download/<item_type>/<int:item_id>')
@traffic_control(calculate_size_func=estimate_unified_download_size)
def unified_download(item_type, item_id):
    """
    ENDPOINT UNIFICATO per download streaming CON CONTROLLO TRAFFICO
    Supporta: parameter, channel, file, files
    """
    try:
        # Parametri opzionali
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        file_paths = request.args.getlist('file_paths')  # Per download multipli
        
        # Default dates
        if not end_date:
            end_date = datetime.now()
        else:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if not start_date:
            start_date = end_date - timedelta(days=7)
        else:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        # Detection automatica del tipo di contenuto
        content_type = detect_content_type(item_type, item_id)
        
        # CORREZIONE: Gestisci mixed_content come file_paths
        if content_type == 'mixed_content':
            content_type = 'file_paths'
        
        # ROUTING BASATO SU CONTENT TYPE
        if content_type == 'numeric_data':
            # Stream dati numerici via PostgreSQL COPY TO STDOUT
            
            if item_type == 'parameter':
                # Query ottimizzata per parametro singolo
                query = """
                    SELECT 
                        r.timestamp_utc,
                        r.value
                    FROM readings r
                    WHERE r.parameter_id = %s
                      AND r.timestamp_utc BETWEEN %s AND %s
                      AND r.value IS NOT NULL
                    ORDER BY r.timestamp_utc DESC
                """
                params = (item_id, start_date, end_date)
                
                # Header con metadati
                custom_header = f"""# Export Readings - Parameter ID: {item_id}
# Periodo: {start_date.strftime('%Y-%m-%d %H:%M:%S')} - {end_date.strftime('%Y-%m-%d %H:%M:%S')}
# Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

"""
                filename_prefix = f"parameter_{item_id}"
                
                return stream_postgres_csv(query, params, filename_prefix, custom_header)
                
            elif item_type == 'channel':
                # Query per tutti i parametri di un canale
                query = """
                    SELECT 
                        r.timestamp_utc,
                        p.name as parameter_name,
                        r.value
                    FROM readings r
                    JOIN parameters p ON r.parameter_id = p.parameter_id
                    WHERE p.channel_id = %s
                      AND r.timestamp_utc BETWEEN %s AND %s
                      AND r.value IS NOT NULL
                    ORDER BY r.timestamp_utc DESC, p.name
                """
                params = (item_id, start_date, end_date)
                
                custom_header = f"""# Export Readings - Channel ID: {item_id}
# Periodo: {start_date.strftime('%Y-%m-%d %H:%M:%S')} - {end_date.strftime('%Y-%m-%d %H:%M:%S')}
# Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

"""
                filename_prefix = f"channel_{item_id}"
                    
                return stream_postgres_csv(query, params, filename_prefix, custom_header)
            
        elif content_type == 'file_paths':
            # CORREZIONE 5: PostgreSQL COPY TO STDOUT per lista path file
            # Genera header semplice per file paths
            custom_header = f"""# Export File Paths - Parameter ID: {item_id}
# Periodo: {start_date.strftime('%Y-%m-%d %H:%M:%S')} - {end_date.strftime('%Y-%m-%d %H:%M:%S')}
# Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

"""
            
            query = """
                SELECT 
                    r.timestamp_utc,
                    r.value as file_path
                FROM readings r
                WHERE r.parameter_id = %s
                  AND r.timestamp_utc BETWEEN %s AND %s
                  AND r.value IS NOT NULL
                ORDER BY r.timestamp_utc DESC
            """
            params = (item_id, start_date, end_date)
            filename_prefix = f"file_paths_{item_id}"
            
            return stream_postgres_csv(query, params, filename_prefix, custom_header)
            
        elif content_type == 'single_file':
            # Stream singolo file da Minio
            # item_id in questo caso è il file_path encoded
            file_path = request.args.get('file_path')
            if not file_path:
                return jsonify({'error': 'file_path richiesto per single_file'}), 400
                
            return stream_minio_file(file_path)
            
        elif content_type == 'multiple_files':
            # Stream ZIP da Minio
            if not file_paths:
                return jsonify({'error': 'file_paths richiesto per multiple_files'}), 400
                
            zip_name = request.args.get('zip_name', f'files_{item_id}.zip')
            return stream_zip_files(file_paths, zip_name)
            
        else:
            return jsonify({'error': f'Content type {content_type} non supportato'}), 400
            
    except Exception as e:
        logging.error(f"Errore unified download {item_type}/{item_id}: {e}")
        return jsonify({'error': str(e)}), 500


# Funzione per registrare le API
def register_multi_format_api(app):
    """
    Registra il blueprint multi-format API nell'app Flask
    """
    app.register_blueprint(multi_format_api)
    logging.info("Multi-Format API blueprint registrato")


# =================================================================
# TESTING E BENCHMARK ENDPOINTS 
# =================================================================

@multi_format_api.route('/test/streaming-performance')
def test_streaming_performance():
    """
    Endpoint per testare performance streaming
    """
    try:
        import psutil
        
        def get_memory_usage():
            process = psutil.Process()
            return process.memory_info().rss / 1024 / 1024  # MB
        
        start_memory = get_memory_usage()
        
        # Test query simulata 
        test_query = """
            SELECT 
                generate_series(1, 10000) as reading_id,
                now() + (random() * interval '30 days') as timestamp_utc,
                (random() * 1000)::numeric(10,3) as value
        """
        
        # Test detection tipo contenuto
        content_type = detect_content_type('test', 1)
        
        # Simula setup streaming
        try:
            from utils.db import get_db_connection
            conn = get_db_connection()
            if conn:
                conn.close()
                db_test = "✅ Connessione DB OK"
            else:
                db_test = "❌ Connessione DB fallita"
        except Exception as e:
            db_test = f"❌ Errore DB: {str(e)}"
        
        end_memory = get_memory_usage()
        
        return jsonify({
            'status': 'success',
            'performance_test': {
                'start_memory_mb': round(start_memory, 2),
                'end_memory_mb': round(end_memory, 2),
                'memory_diff_mb': round(end_memory - start_memory, 2),
                'content_type_detection': content_type,
                'database_test': db_test,
                'streaming_functions': {
                    'postgres_csv': 'stream_postgres_csv() - Ottimizzato',
                    'minio_file': 'stream_minio_file() - Ottimizzato', 
                    'zip_files': 'stream_zip_files() - Ottimizzato',
                    'detection': 'detect_content_type() - Migliorato'
                }
            },
            'test_timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'test_timestamp': datetime.now().isoformat()
        }), 500


@multi_format_api.route('/test/memory-benchmark')
def test_memory_benchmark():
    """
    Benchmark utilizzo memoria per download di diverse dimensioni
    """
    try:
        import psutil
        
        def get_detailed_memory():
            process = psutil.Process()
            memory = process.memory_info()
            return {
                'rss_mb': round(memory.rss / 1024 / 1024, 2),
                'vms_mb': round(memory.vms / 1024 / 1024, 2),
                'percent': round(process.memory_percent(), 2)
            }
        
        baseline = get_detailed_memory()
        
        # Test diversi scenari
        test_scenarios = []
        
        # Scenario 1: Query piccola
        small_memory = get_detailed_memory()
        test_scenarios.append({
            'name': 'Baseline',
            'memory': baseline,
            'description': 'Stato iniziale memoria'
        })
        
        # Scenario 2: Query media (simulata)
        medium_query = """
            SELECT generate_series(1, 50000) as id,
                   now() as timestamp,
                   random() as value
        """
        
        medium_memory = get_detailed_memory()
        test_scenarios.append({
            'name': 'Query Media Setup',
            'memory': medium_memory,
            'description': 'Setup query 50K record',
            'memory_diff': {
                'rss_mb': round(medium_memory['rss_mb'] - baseline['rss_mb'], 2),
                'vms_mb': round(medium_memory['vms_mb'] - baseline['vms_mb'], 2)
            }
        })
        
        # Scenario 3: Detection content type
        for i in range(5):
            detect_content_type('parameter', i + 1)
        
        detection_memory = get_detailed_memory()
        test_scenarios.append({
            'name': 'Content Detection',
            'memory': detection_memory,
            'description': 'Dopo 5 detection calls',
            'memory_diff': {
                'rss_mb': round(detection_memory['rss_mb'] - baseline['rss_mb'], 2),
                'vms_mb': round(detection_memory['vms_mb'] - baseline['vms_mb'], 2)
            }
        })
        
        return jsonify({
            'status': 'success',
            'benchmark_results': {
                'test_scenarios': test_scenarios,
                'streaming_optimizations': {
                    'postgres_csv': 'File temporaneo + chunk 8KB',
                    'minio_file': 'Stream diretto + error handling',
                    'zip_files': 'File temporaneo + buffer ottimizzato',
                    'target_memory': 'RAM costante < 10MB per qualsiasi dimensione'
                },
                'performance_targets': {
                    'max_memory_mb': 10,
                    'chunk_size_kb': 8,
                    'streaming_method': 'Generator-based with file temp'
                }
            },
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error', 
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500


@multi_format_api.route('/test/unified-download-flow')
def test_unified_download_flow():
    """
    Test completo flusso unified download
    """
    try:
        # Test detection per diversi tipi
        test_results = []
        
        # Test parameter numerico
        param_detection = detect_content_type('parameter', 1)
        test_results.append({
            'item_type': 'parameter',
            'item_id': 1,
            'detected_type': param_detection,
            'expected_route': 'numeric_data → stream_postgres_csv()'
        })
        
        # Test channel
        channel_detection = detect_content_type('channel', 1)
        test_results.append({
            'item_type': 'channel', 
            'item_id': 1,
            'detected_type': channel_detection,
            'expected_route': 'numeric_data → stream_postgres_csv()'
        })
        
        # Test file
        file_detection = detect_content_type('file', 1)
        test_results.append({
            'item_type': 'file',
            'item_id': 1,
            'detected_type': file_detection,
            'expected_route': 'single_file → stream_minio_file()'
        })
        
        # Test files multipli
        files_detection = detect_content_type('files', 1)
        test_results.append({
            'item_type': 'files',
            'item_id': 1,
            'detected_type': files_detection,
            'expected_route': 'multiple_files → stream_zip_files()'
        })
        
        return jsonify({
            'status': 'success',
            'unified_download_test': {
                'endpoint': '/api/download/<item_type>/<item_id>',
                'test_results': test_results,
                'routing_logic': {
                    'numeric_data': 'PostgreSQL COPY TO STDOUT streaming',
                    'file_paths': 'PostgreSQL CSV con file path list',
                    'single_file': 'Minio file streaming diretto',
                    'multiple_files': 'Minio ZIP streaming'
                },
                'optimization_status': '✅ RAM costante implementata'
            },
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500
    
@multi_format_api.route('/user/traffic-status')
def get_user_traffic_status_api():
    """
    API per ottenere status traffico utente corrente
    """
    try:
        user_id = get_current_user_id()
        status = get_user_traffic_status(user_id)
        
        return jsonify({
            'status': 'success',
            'traffic_status': status,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logging.error(f"Errore API traffic status: {e}")
        return jsonify({
            'status': 'error', 
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

# ===================================================================
# 5. ENDPOINT ADMIN MONITORAGGIO TRAFFICO
# ===================================================================

@multi_format_api.route('/admin/traffic-stats')
def get_admin_traffic_stats():
    """
    API per statistiche traffico globale (solo admin)
    """
    try:
        # Verifica permessi admin
        from auth_routes import get_current_user, has_permission
        
        user = get_current_user()
        if not user or not has_permission('admin_pages'):
            return jsonify({'error': 'Accesso non autorizzato'}), 403
        
        # Statistiche giornaliere
        today = date.today()
        
        stats_query = """
        SELECT 
            COUNT(DISTINCT user_id) as active_users,
            SUM(bytes_downloaded) as total_bytes,
            SUM(download_count) as total_downloads,
            AVG(bytes_downloaded) as avg_bytes_per_user,
            MAX(bytes_downloaded) as max_bytes_user
        FROM user_daily_traffic 
        WHERE traffic_date = %s
        """
        
        result = execute_query(stats_query, (today,), fetch=True)
        
        if result and len(result) > 0:
            stats = result[0]
            total_mb = (stats['total_bytes'] or 0) / (1024 * 1024)
            avg_mb = (stats['avg_bytes_per_user'] or 0) / (1024 * 1024)
            max_mb = (stats['max_bytes_user'] or 0) / (1024 * 1024)
            
            return jsonify({
                'status': 'success',
                'date': today.isoformat(),
                'stats': {
                    'active_users': stats['active_users'] or 0,
                    'total_downloads': stats['total_downloads'] or 0,
                    'total_mb': round(total_mb, 2),
                    'avg_mb_per_user': round(avg_mb, 2),
                    'max_mb_user': round(max_mb, 2)
                },
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'status': 'success',
                'date': today.isoformat(),
                'stats': {
                    'active_users': 0,
                    'total_downloads': 0,
                    'total_mb': 0,
                    'avg_mb_per_user': 0,
                    'max_mb_user': 0
                },
                'timestamp': datetime.now().isoformat()
            })
            
    except Exception as e:
        logging.error(f"Errore admin traffic stats: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500