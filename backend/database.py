import os
import sqlite3
from pathlib import Path

try:
    import psycopg2
except ImportError:
    psycopg2 = None

_LAST_DB_ERROR = ""


def _set_last_error(message):
    global _LAST_DB_ERROR
    _LAST_DB_ERROR = message


def get_db_error():
    return _LAST_DB_ERROR


def _init_sqlite(conn):
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL;")
    cur.execute("PRAGMA busy_timeout=30000;")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_hash TEXT NOT NULL UNIQUE,
            uploader_name TEXT,
            target_institution TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            blockchain_tx_hash TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    cur.close()


def _get_sqlite_connection():
    db_path = Path(__file__).resolve().parent / "local.db"
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    _init_sqlite(conn)
    _set_last_error("SQLite fallback aktif")
    return conn


def get_db_connection():
    """
    Önce PostgreSQL'e bağlanır.
    Bağlantı başarısız olursa otomatik olarak yerel SQLite'a düşer.
    """
    if psycopg2 is None:
        _set_last_error("psycopg2 yok, SQLite fallback aktif")
        return _get_sqlite_connection()

    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "aws-1-ap-south-1.pooler.supabase.com"),
            database=os.getenv("DB_NAME", "postgres"),
            user=os.getenv("DB_USER", "postgres.fjlrvesxyfcftrovtnig"),
            password=os.getenv("DB_PASSWORD", "aykutkarakaya"),
            port=os.getenv("DB_PORT", "6543"),
            sslmode=os.getenv("DB_SSLMODE", "require"),
            connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT", "10")),
        )
        _set_last_error("PostgreSQL bağlantısı aktif")
        return conn
    except Exception as e:
        _set_last_error(f"PostgreSQL bağlantı hatası: {e}. SQLite fallback aktif.")
        print(_LAST_DB_ERROR)
        return _get_sqlite_connection()