import os
from minio import Minio
from dotenv import load_dotenv

# Carica le variabili dal file .env
load_dotenv()

def get_minio_client():
    """Configura il client MinIO usando le variabili d'ambiente"""
    return Minio(
        endpoint=os.getenv('MINIO_ENDPOINT', 'localhost:9000'),
        access_key=os.getenv('MINIO_ACCESS_KEY'),
        # La chiave segreta nel .env 
        secret_key=os.getenv('MINIO_SECRET_KEY'),
        secure=False
    )

def get_minio_bucket_name():
    """
    Restituisce il nome del bucket principale.
    Nota: nel tuo .env la chiave è MINIO_BUCKET (non MINIO_BUCKET_NAME)
    """
    return os.getenv('MINIO_BUCKET')

def get_file_from_minio(file_path, bucket_name=None):
    """Helper per scaricare un file da Minio"""
    if bucket_name is None:
        bucket_name = get_minio_bucket_name()
    
    client = get_minio_client()
    try:
        response = client.get_object(bucket_name, file_path)
        return response.read()
    except Exception as e:
        print(f"Errore durante il recupero del file {file_path}: {e}")
        return None