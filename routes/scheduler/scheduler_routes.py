# scheduler_routes_viewer.py

from flask import Blueprint, render_template, jsonify
from datetime import datetime
from utils.db import execute_query
from datetime import datetime, timezone

scheduler_viewer_bp = Blueprint(
    "scheduler_viewer",
    __name__,
    template_folder="templates"
)

@scheduler_viewer_bp.route("/scheduler", methods=["GET"])
def scheduler_dashboard():
    """
    Dashboard READ-ONLY dello scheduler.
    Recupera il riferimento temporale e la coda delle acquisizioni.
    """
    try:
        # 1. Recupero il riferimento temporale dal controllo
        ref = execute_query(
            "SELECT reference_ts FROM test_control WHERE id = true",
            fetch=True
        )
        current_reference = datetime.now(timezone.utc)

        # 2. Recupero la coda dalla vista (include min_last_timestamp)
        queue = execute_query(
            "SELECT * FROM acquisition_schedule_test",
            fetch=True
        ) or []

        return render_template(
            'scheduler/scheduler_dashboard.html',
            queue=queue,
            current_reference=current_reference
        )

    except Exception as e:
        print(f"[SCHEDULER VIEWER] Errore dashboard: {e}")
        return render_template(
            'scheduler/scheduler_dashboard.html',
            queue=[],
            current_reference=datetime.utcnow()
        )

@scheduler_viewer_bp.route("/scheduler/api/queue", methods=["GET"])
def get_queue():
    """
    API per aggiornamento automatico dei dati
    """
    try:
        queue = execute_query(
            "SELECT * FROM acquisition_schedule_test",
            fetch=True
        ) or []

        # Serializzazione date per JSON
        for row in queue:
            for k, v in row.items():
                if isinstance(v, datetime):
                    row[k] = v.isoformat()

        return jsonify({
            "success": True,
            "queue": queue
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})