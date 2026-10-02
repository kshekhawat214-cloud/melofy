"""
Persistent job store using a JSON file on disk.
Replaces the in-memory dict that gets wiped on hot-reload.
"""
import json
import threading
from pathlib import Path

JOBS_FILE = Path(__file__).parent.parent / "local_storage" / "jobs.json"
JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()


def _read() -> dict:
    if not JOBS_FILE.exists():
        return {}
    try:
        return json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write(data: dict):
    JOBS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def set_job(job_id: str, payload: dict):
    with _lock:
        data = _read()
        data[job_id] = payload
        _write(data)


def get_job(job_id: str) -> dict | None:
    with _lock:
        return _read().get(job_id)


def update_job(job_id: str, **kwargs):
    with _lock:
        data = _read()
        if job_id in data:
            data[job_id].update(kwargs)
            _write(data)
