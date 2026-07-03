"""SQLite-backed TTL cache with serve-stale-on-error support.

Entries never get deleted on expiry — get() reports them as stale instead,
so the market service can fall back to last-good data when Finnhub is
rate-limited or down (design decision: serve-stale-on-error).
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path


class TTLCache:
    def __init__(self, db_path: str | Path = "cache.db"):
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at REAL NOT NULL)"
        )
        self._conn.commit()

    def get(self, key: str) -> tuple[dict | list | None, bool]:
        """Returns (value, is_fresh). value is None on a total miss."""
        with self._lock:
            row = self._conn.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
            ).fetchone()
        if row is None:
            return None, False
        value, expires_at = json.loads(row[0]), row[1]
        return value, time.time() < expires_at

    def set(self, key: str, value: dict | list, ttl_seconds: float) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), time.time() + ttl_seconds),
            )
            self._conn.commit()
