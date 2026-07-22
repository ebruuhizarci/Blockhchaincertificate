"""Veritabanındaki kullanıcı ve belge kayıtlarını listeler."""
from database import get_db_connection, get_db_error

conn = get_db_connection()
if not conn:
    print("BAGLANTI YOK:", get_db_error())
    raise SystemExit(1)

is_sqlite = conn.__class__.__module__.startswith("sqlite3")
db_type = "SQLite (local.db)" if is_sqlite else "PostgreSQL (Supabase)"
print(f"=== Veritabani: {db_type} ===")
print(f"Durum: {get_db_error()}\n")

cur = conn.cursor()

cur.execute("SELECT id, email, full_name, created_at FROM users ORDER BY id")
users = cur.fetchall()
print(f"--- KULLANICILAR ({len(users)}) ---")
if not users:
    print("(kayit yok)")
else:
    for u in users:
        print(f"  id={u[0]}  email={u[1]}  ad={u[2]}  tarih={u[3]}")

cur.execute(
    """
    SELECT id, filename, uploader_name, user_email, status, target_institution, created_at
    FROM documents ORDER BY id DESC LIMIT 20
    """
)
docs = cur.fetchall()
print(f"\n--- BELGELER (son {len(docs)}) ---")
if not docs:
    print("(kayit yok)")
else:
    for d in docs:
        print(
            f"  id={d[0]}  dosya={d[1]}  yukleyen={d[2]}  email={d[3]}  "
            f"durum={d[4]}  kurum={d[5]}  tarih={d[6]}"
        )

cur.close()
conn.close()
