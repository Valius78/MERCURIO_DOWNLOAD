# utils/flask_logger.py
# -*- coding: utf-8 -*-

import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path

def setup_flask_logger(app_name: str = "flask-app"):
    """
    Configura logging per Flask:
    - file log con rotazione
    - output anche su console (utile in dev)
    """

    # ====== ROOT PROJECT ======
    MERCURIO_ROOT = os.getenv("MERCURIO_ROOT")
    if not MERCURIO_ROOT:
        raise RuntimeError("Variabile d'ambiente MERCURIO_ROOT non impostata")

    log_dir = Path(MERCURIO_ROOT) / "log" / "flask_log"
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file = log_dir / "flask_app.log"

    # ====== LOGGER BASE ======
    logger = logging.getLogger(app_name)
    logger.setLevel(logging.INFO)

    # Evita duplicazioni
    if logger.handlers:
        return logger

    # ====== FILE HANDLER (ROTATION) ======
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,   # 10 MB
        backupCount=5,
        encoding="utf-8"
    )

    formatter = logging.Formatter(
        "%(asctime)s - %(levelname)s - %(name)s - %(message)s"
    )

    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    # ====== CONSOLE HANDLER (DEV) ======
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)

    # ====== ATTACH ======
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    # ====== WERKZEUG (HTTP REQUESTS) ======
    werkzeug_logger = logging.getLogger("werkzeug")
    werkzeug_logger.setLevel(logging.INFO)
    werkzeug_logger.handlers.clear()
    werkzeug_logger.addHandler(file_handler)

    logger.info("Flask logger inizializzato correttamente")

    return logger
