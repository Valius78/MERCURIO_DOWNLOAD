# -*- coding: utf-8 -*-

import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv

# Carica variabili ambiente dal file .env
load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': int(os.getenv('DB_PORT', 5432))
}

def get_db_connection():
    try:
        # Forza encoding UTF-8 nella stringa di connessione
        DB_CONFIG_UTF8 = DB_CONFIG.copy()
        DB_CONFIG_UTF8['options'] = '-c client_encoding=utf8'
        
        conn = psycopg2.connect(**DB_CONFIG_UTF8)
        
        # Forza encoding multiplo
        conn.set_client_encoding('UTF8')
        
        with conn.cursor() as cur:
            cur.execute("SET client_encoding TO 'UTF8'")
            cur.execute("SET lc_messages TO 'C'")
            # Forza anche il server ad accettare solo UTF-8
            cur.execute("SET bytea_output TO 'hex'")  
        conn.commit()
        
        return conn
    except psycopg2.Error as e:
        print(f"Errore connessione database: {e}")
        return None

def execute_query(query, params=None, fetch=False):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            if fetch:
                result = [dict(row) for row in cur.fetchall()]
                conn.close()
                return result
            else:
                conn.commit()
                conn.close()
                return True
    except psycopg2.Error as e:
        print(f"Errore query: {e}")
        conn.rollback()
        conn.close()
        return None
        
def execute_insert_returning(query, params=None):
    """Esegue INSERT con RETURNING e fa il commit"""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            result = [dict(row) for row in cur.fetchall()]
            conn.commit()  # ← COMMIT ESPLICITO!
            conn.close()
            return result
    except psycopg2.Error as e:
        print(f"Errore query: {e}")
        conn.rollback()
        conn.close()
        return None