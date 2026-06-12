import os
import sqlite3
from pathlib import Path
from werkzeug.security import generate_password_hash

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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_email TEXT
        )
        """
    )
    try:
        cur.execute("ALTER TABLE documents ADD COLUMN user_email TEXT")
    except Exception:
        pass
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_sessions (
            id TEXT PRIMARY KEY,
            user_email TEXT NOT NULL,
            uploader_name TEXT NOT NULL,
            target_institution TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            amount_try REAL NOT NULL DEFAULT 50,
            status TEXT NOT NULL DEFAULT 'pending',
            iyzico_token TEXT,
            payment_status TEXT,
            doc_id INTEGER,
            blockchain_tx_hash TEXT,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            is_banned INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    try:
        cur.execute("ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    _ensure_institutions_sqlite(cur)
    conn.commit()
    cur.close()


def _seed_institutions(cur, placeholder):
    from crypto_service import generate_rsa_keypair

    defaults = [
        ("BEUN", "Zonguldak Bülent Ecevit Üniversitesi", "beun123"),
        ("SAGLIK_BAKANLIGI", "Sağlık Bakanlığı", "saglik123"),
        ("OZEL_SIRKET", "Özel Kurum", "ozel123"),
    ]
    for code, name, password in defaults:
        pub, priv = generate_rsa_keypair()
        cur.execute(
            f"""
            INSERT INTO institutions (
                code, name, password_hash, rsa_public_key_pem, rsa_private_key_pem
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (code, name, generate_password_hash(password), pub, priv),
        )


def _ensure_institutions_sqlite(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS institutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            rsa_public_key_pem TEXT,
            rsa_private_key_pem TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    for col in ("rsa_public_key_pem", "rsa_private_key_pem"):
        try:
            cur.execute(f"ALTER TABLE institutions ADD COLUMN {col} TEXT")
        except Exception:
            pass
    cur.execute("SELECT COUNT(*) FROM institutions")
    if cur.fetchone()[0] == 0:
        _seed_institutions(cur, "?")


def ensure_users_schema(conn):
    """PostgreSQL'de users tablosunu oluşturur."""
    if conn.__class__.__module__.startswith("sqlite3"):
        cur = conn.cursor()
        try:
            cur.execute("ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        conn.commit()
        cur.close()
        return

    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            is_banned BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE")
    conn.commit()
    cur.close()


def ensure_documents_schema(conn):
    """PostgreSQL veya SQLite'da documents tablosunu güncel şemaya getirir."""
    if conn.__class__.__module__.startswith("sqlite3"):
        cur = conn.cursor()
        try:
            cur.execute("ALTER TABLE documents ADD COLUMN user_email TEXT")
        except Exception:
            pass
        conn.commit()
        cur.close()
        return

    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
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
    for col, col_type in (
        ("uploader_name", "TEXT"),
        ("target_institution", "TEXT"),
        ("status", "TEXT DEFAULT 'pending'"),
        ("blockchain_tx_hash", "TEXT"),
        ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("user_email", "TEXT"),
    ):
        cur.execute(
            f"ALTER TABLE documents ADD COLUMN IF NOT EXISTS {col} {col_type}"
        )

    # Eski şemada owner_name varsa uploader_name'e taşı
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'documents'
          AND column_name = 'owner_name'
        """
    )
    if cur.fetchone():
        cur.execute(
            """
            UPDATE documents
            SET uploader_name = owner_name
            WHERE uploader_name IS NULL AND owner_name IS NOT NULL
            """
        )

    # Eski Supabase şeması: student_id zorunlu olabilir — boş bırakılabilir yap
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'documents'
          AND column_name = 'student_id'
        """
    )
    has_student_id = cur.fetchone()
    if has_student_id:
        try:
            cur.execute(
                "ALTER TABLE documents ALTER COLUMN student_id DROP NOT NULL"
            )
        except Exception:
            pass
        try:
            cur.execute(
                """
                UPDATE documents
                SET uploader_name = student_id::text
                WHERE (uploader_name IS NULL OR TRIM(uploader_name) = '')
                  AND student_id IS NOT NULL
                  AND student_id::text !~ '^[0-9]+$'
                """
            )
        except Exception:
            pass

    # Eski kayıtlara kullanıcı e-postası eşle (users tablosundan)
    cur.execute(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'users'
        """
    )
    if cur.fetchone():
        try:
            cur.execute(
                """
                UPDATE documents d
                SET user_email = LOWER(TRIM(u.email))
                FROM users u
                WHERE (d.user_email IS NULL OR TRIM(d.user_email) = '')
                  AND d.uploader_name IS NOT NULL
                  AND LOWER(TRIM(d.uploader_name)) = LOWER(TRIM(u.full_name))
                """
            )
        except Exception:
            pass

    for col, col_type in (
        ("is_encrypted", "INTEGER NOT NULL DEFAULT 0"),
        ("encrypted_aes_key", "TEXT"),
        ("aes_nonce", "TEXT"),
    ):
        cur.execute(
            f"ALTER TABLE documents ADD COLUMN IF NOT EXISTS {col} {col_type}"
        )

    conn.commit()
    cur.close()


def ensure_documents_encryption_schema(conn):
    """Belge şifreleme sütunları."""
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    if is_sqlite:
        for col, typedef in (
            ("is_encrypted", "INTEGER NOT NULL DEFAULT 0"),
            ("encrypted_aes_key", "TEXT"),
            ("aes_nonce", "TEXT"),
        ):
            try:
                cur.execute(f"ALTER TABLE documents ADD COLUMN {col} {typedef}")
            except Exception:
                pass
    else:
        for col, col_type in (
            ("is_encrypted", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("encrypted_aes_key", "TEXT"),
            ("aes_nonce", "TEXT"),
        ):
            cur.execute(
                f"ALTER TABLE documents ADD COLUMN IF NOT EXISTS {col} {col_type}"
            )
    conn.commit()
    cur.close()


def ensure_institution_rsa_keys(conn):
    """Mevcut kurumlara RSA anahtar çifti üretir."""
    from crypto_service import generate_rsa_keypair

    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    ph = "?" if is_sqlite else "%s"
    try:
        cur.execute(
            """
            SELECT id FROM institutions
            WHERE rsa_public_key_pem IS NULL OR TRIM(rsa_public_key_pem) = ''
            """
        )
        rows = cur.fetchall()
        for (inst_id,) in rows:
            pub, priv = generate_rsa_keypair()
            cur.execute(
                f"""
                UPDATE institutions
                SET rsa_public_key_pem = {ph}, rsa_private_key_pem = {ph}
                WHERE id = {ph}
                """,
                (pub, priv, inst_id),
            )
        conn.commit()
    except Exception:
        pass
    finally:
        cur.close()


def _pg_table_exists(cur, table: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = %s
        """,
        (table,),
    )
    return cur.fetchone() is not None


def institution_code_variants(code: str) -> list[str]:
    """Frontend kodu ile Supabase'deki farklı yazımları eşleştirir (BEUN ↔ BEÜN)."""
    key = (code or "").strip().upper()
    aliases = {
        "BEUN": ["BEUN", "BEÜN", "Beun", "BEÜN"],
        "SAGLIK_BAKANLIGI": ["SAGLIK_BAKANLIGI", "SAĞLIK_BAKANLIĞI"],
        "OZEL_SIRKET": ["OZEL_SIRKET", "ÖZEL_ŞİRKET", "Özel Kurum"],
    }
    variants = aliases.get(key, [code.strip()] if code.strip() else [])
    seen: set[str] = set()
    out: list[str] = []
    for v in variants:
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out or [code]


def ensure_profiles_schema(conn):
    """Flask kullanıcıları için profiles / student_uuid eşlemesi."""
    if conn.__class__.__module__.startswith("sqlite3"):
        return

    cur = conn.cursor()
    if not _pg_table_exists(cur, "profiles"):
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE,
                full_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    else:
        cur.execute(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT"
        )
        cur.execute(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT"
        )

    cur.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS student_uuid UUID"
    )
    conn.commit()
    cur.close()


def resolve_student_uuid(
    conn,
    email: str | None,
    full_name: str | None = None,
    *,
    create: bool = False,
) -> str | None:
    """
    Supabase documents.student_id (UUID) için profil kimliği üretir veya bulur.
    """
    if conn.__class__.__module__.startswith("sqlite3"):
        return None

    email = (email or "").strip().lower()
    full_name = (full_name or "").strip()
    if not email and not full_name:
        return None

    ensure_profiles_schema(conn)
    cur = conn.cursor()

    if email and _pg_table_exists(cur, "users") and _has_column_pg(cur, "users", "email"):
        id_type = _pg_column_type(cur, "users", "id")
        if id_type == "uuid":
            cur.execute(
                "SELECT id FROM users WHERE LOWER(TRIM(email)) = %s LIMIT 1",
                (email,),
            )
            row = cur.fetchone()
            if row and row[0]:
                uuid_val = str(row[0])
                _link_user_student_uuid(cur, email, uuid_val)
                conn.commit()
                cur.close()
                return uuid_val

    if email and _pg_table_exists(cur, "users") and _has_column_pg(cur, "users", "student_uuid"):
        cur.execute(
            "SELECT student_uuid FROM users WHERE LOWER(email) = %s AND student_uuid IS NOT NULL",
            (email,),
        )
        row = cur.fetchone()
        if row and row[0]:
            cur.close()
            return str(row[0])

    if _pg_table_exists(cur, "profiles"):
        if email and _has_column_pg(cur, "profiles", "email"):
            cur.execute(
                "SELECT id FROM profiles WHERE LOWER(TRIM(email)) = %s LIMIT 1",
                (email,),
            )
            row = cur.fetchone()
            if row:
                uuid_val = str(row[0])
                _link_user_student_uuid(cur, email, uuid_val)
                conn.commit()
                cur.close()
                return uuid_val

        if full_name and _has_column_pg(cur, "profiles", "full_name"):
            cur.execute(
                "SELECT id FROM profiles WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(%s)) LIMIT 1",
                (full_name,),
            )
            row = cur.fetchone()
            if row:
                uuid_val = str(row[0])
                _link_user_student_uuid(cur, email, uuid_val)
                conn.commit()
                cur.close()
                return uuid_val

        if create:
            try:
                if email and _has_column_pg(cur, "profiles", "email"):
                    cur.execute(
                        """
                        INSERT INTO profiles (email, full_name)
                        VALUES (%s, %s)
                        RETURNING id
                        """,
                        (email, full_name or email),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO profiles (full_name)
                        VALUES (%s)
                        RETURNING id
                        """,
                        (full_name or email or "Kullanıcı",),
                    )
                uuid_val = str(cur.fetchone()[0])
                _link_user_student_uuid(cur, email, uuid_val)
                conn.commit()
                cur.close()
                return uuid_val
            except Exception:
                conn.rollback()

    cur.close()
    return None


def get_or_create_student_uuid(
    conn,
    email: str | None,
    full_name: str | None = None,
) -> str | None:
    return resolve_student_uuid(conn, email, full_name, create=True)


def _link_user_student_uuid(cur, email: str, student_uuid: str) -> None:
    if not email:
        return
    if not _has_column_pg(cur, "users", "student_uuid"):
        return
    try:
        cur.execute(
            """
            UPDATE users SET student_uuid = %s::uuid
            WHERE LOWER(email) = %s AND student_uuid IS NULL
            """,
            (student_uuid, email.lower()),
        )
    except Exception:
        pass


def _has_column_pg(cur, table: str, column: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = %s AND column_name = %s
        """,
        (table, column),
    )
    return cur.fetchone() is not None


def fetch_documents_for_user(
    conn,
    uploader_name: str,
    user_email: str | None = None,
) -> list[dict]:
    """Kullanıcının belgelerini student_id (UUID), ad ve e-postadan bulur."""
    ensure_documents_schema(conn)
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    name = (uploader_name or "").strip()
    email = (user_email or "").strip().lower()
    student_uuid = None if is_sqlite else resolve_student_uuid(conn, email, name, create=False)

    if is_sqlite:
        clauses: list[str] = []
        params: list = []
        if name:
            clauses.append(
                "LOWER(TRIM(COALESCE(uploader_name, ''))) = LOWER(TRIM(?))"
            )
            params.append(name)
        if email:
            clauses.append(
                "LOWER(TRIM(COALESCE(user_email, ''))) = LOWER(TRIM(?))"
            )
            params.append(email)
        if not clauses:
            cur.close()
            return []
        where = " OR ".join(clauses)
        cur.execute(
            f"""
            SELECT id, filename, file_hash, target_institution, status,
                   blockchain_tx_hash, created_at
            FROM documents
            WHERE {where}
            ORDER BY id DESC
            """,
            tuple(params),
        )
    else:
        parts: list[str] = []
        params: list = []
        if student_uuid:
            parts.append("student_id = %s::uuid")
            params.append(student_uuid)
        if name and _has_column_pg(cur, "documents", "uploader_name"):
            parts.append(
                "LOWER(TRIM(COALESCE(uploader_name, ''))) = LOWER(TRIM(%s))"
            )
            params.append(name)
        if email and _has_column_pg(cur, "documents", "user_email"):
            parts.append("LOWER(TRIM(COALESCE(user_email, ''))) = %s")
            params.append(email)
        if not parts:
            cur.close()
            return []
        where = " OR ".join(f"({p})" for p in parts)
        cur.execute(
            f"""
            SELECT id, filename, file_hash, target_institution, status,
                   blockchain_tx_hash, created_at
            FROM documents
            WHERE {where}
            ORDER BY id DESC
            """,
            tuple(params),
        )

    rows = cur.fetchall()
    cur.close()
    out = []
    for row in rows:
        out.append({
            "id": row[0],
            "filename": row[1],
            "file_hash": row[2],
            "institution": row[3],
            "status": row[4],
            "blockchain_tx": row[5],
            "date": str(row[6]) if row[6] else None,
        })
    return out


def _normalize_institution_key(code: str) -> str:
    s = (code or "").strip().upper()
    for src, dst in (
        ("Ü", "U"),
        ("Ö", "O"),
        ("Ş", "S"),
        ("Ğ", "G"),
        ("İ", "I"),
        ("Ç", "C"),
    ):
        s = s.replace(src, dst)
    return s


def _lookup_profile_label(conn, student_id) -> str:
    if conn.__class__.__module__.startswith("sqlite3"):
        return str(student_id)
    cur = conn.cursor()
    try:
        if not _pg_table_exists(cur, "profiles"):
            return str(student_id)
        if _has_column_pg(cur, "profiles", "full_name"):
            cur.execute(
                "SELECT full_name FROM profiles WHERE id = %s LIMIT 1",
                (student_id,),
            )
        elif _has_column_pg(cur, "profiles", "email"):
            cur.execute(
                "SELECT email FROM profiles WHERE id = %s LIMIT 1",
                (student_id,),
            )
        else:
            return str(student_id)
        row = cur.fetchone()
        if row and row[0]:
            return str(row[0]).strip()
        return str(student_id)
    except Exception:
        return str(student_id)
    finally:
        cur.close()


def _resolve_document_uploader(
    conn,
    doc: dict,
    profile_cache: dict[str, str],
) -> str:
    name = (doc.get("uploader_name") or "").strip()
    if name:
        return name
    email = (doc.get("user_email") or "").strip()
    if email:
        return email
    sid = doc.get("student_id")
    if sid is None:
        return "Bilinmiyor"
    key = str(sid)
    if key not in profile_cache:
        profile_cache[key] = _lookup_profile_label(conn, sid)
    return profile_cache[key] or "Bilinmiyor"


def fetch_pending_documents_for_institution(
    conn,
    institution_name: str,
) -> list[dict]:
    """Kurum onay paneli: bekleyen belgeler (şemaya uyumlu, güvenli sorgu)."""
    ensure_documents_schema(conn)
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    variants = institution_code_variants(institution_name)
    if not variants:
        cur.close()
        return []

    if is_sqlite:
        doc_cols = _sqlite_column_names(cur, "documents")
    else:
        doc_cols = _pg_column_names(cur, "documents")

    select_cols = ["id", "filename", "file_hash"]
    for optional in ("uploader_name", "user_email", "student_id", "created_at", "target_institution"):
        if optional in doc_cols:
            select_cols.append(optional)

    col_list = ", ".join(select_cols)

    def _run_listing(inst_filter_sql: str, params: tuple) -> list[tuple]:
        cur.execute(
            f"""
            SELECT {col_list}
            FROM documents
            WHERE LOWER(TRIM(status)) = 'pending'
              AND {inst_filter_sql}
            ORDER BY id DESC
            """,
            params,
        )
        return cur.fetchall()

    if is_sqlite:
        placeholders = ", ".join(["?"] * len(variants))
        rows = _run_listing(
            f"TRIM(target_institution) IN ({placeholders})",
            tuple(variants),
        )
    else:
        rows = _run_listing("TRIM(target_institution) = ANY(%s)", (variants,))
        if not rows:
            norm = _normalize_institution_key(institution_name)
            rows = _run_listing(
                """
                UPPER(
                  REPLACE(
                    REPLACE(TRIM(target_institution), 'Ü', 'U'),
                    'İ', 'I'
                  )
                ) = %s
                """,
                (norm,),
            )

    profile_cache: dict[str, str] = {}
    out: list[dict] = []
    for row in rows:
        doc = {select_cols[i]: row[i] for i in range(len(select_cols))}
        out.append({
            "id": doc["id"],
            "filename": doc["filename"],
            "uploader": _resolve_document_uploader(conn, doc, profile_cache),
            "date": str(doc["created_at"]) if doc.get("created_at") else None,
            "file_hash": doc["file_hash"],
        })

    cur.close()
    return out


def _sqlite_column_names(cur, table: str) -> list[str]:
    cur.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def _pg_column_names(cur, table: str) -> list[str]:
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = %s
        """,
        (table,),
    )
    return [row[0] for row in cur.fetchall()]


def _pg_column_type(cur, table: str, column: str) -> str | None:
    cur.execute(
        """
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = %s AND column_name = %s
        """,
        (table, column),
    )
    row = cur.fetchone()
    return row[0] if row else None


def insert_document(
    conn,
    filename: str,
    file_hash: str,
    uploader_name: str,
    target_institution: str,
    user_email: str | None = None,
) -> int:
    """documents tablosuna satır ekler; yeni kaydın id değerini döner."""
    ensure_documents_schema(conn)
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    inst_variants = institution_code_variants(target_institution)
    db_institution = inst_variants[0] if inst_variants else target_institution
    # Supabase'de BEÜN gibi kayıtlı kod varsa onu kullan
    if not is_sqlite and len(inst_variants) > 1:
        for variant in inst_variants:
            if "Ü" in variant or "Ö" in variant or "Ş" in variant or "İ" in variant:
                db_institution = variant
                break

    if is_sqlite:
        cur.execute(
            """
            INSERT INTO documents (filename, file_hash, uploader_name, target_institution, status, user_email)
            VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (filename, file_hash, uploader_name, target_institution, user_email),
        )
        doc_id = int(cur.lastrowid)
    else:
        student_uuid = get_or_create_student_uuid(conn, user_email, uploader_name)
        cols = _pg_column_names(cur, "documents")
        row: dict = {
            "filename": filename,
            "file_hash": file_hash,
            "target_institution": db_institution,
            "status": "pending",
        }
        if "uploader_name" in cols:
            row["uploader_name"] = uploader_name
        if "user_email" in cols and user_email:
            row["user_email"] = user_email.strip().lower()
        if "student_id" in cols and student_uuid:
            row["student_id"] = student_uuid
        elif "student_id" in cols:
            raise ValueError(
                "student_id (profil UUID) oluşturulamadı. Giriş yapıp e-postanızın dolu olduğundan emin olun."
            )

        keys = [k for k in row if k in cols]
        placeholders = ", ".join(["%s"] * len(keys))
        colnames = ", ".join(keys)
        values = [row[k] for k in keys]
        cur.execute(
            f"INSERT INTO documents ({colnames}) VALUES ({placeholders}) RETURNING id",
            values,
        )
        doc_id = int(cur.fetchone()[0])

    conn.commit()
    cur.close()
    return doc_id


def ensure_payments_schema(conn):
    """Ödeme oturumları tablosu."""
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    if is_sqlite:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_sessions (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                uploader_name TEXT NOT NULL,
                target_institution TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                amount_try REAL NOT NULL DEFAULT 50,
                status TEXT NOT NULL DEFAULT 'pending',
                iyzico_token TEXT,
                payment_status TEXT,
                doc_id INTEGER,
                blockchain_tx_hash TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paid_at TIMESTAMP
            )
            """
        )
    else:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_sessions (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                uploader_name TEXT NOT NULL,
                target_institution TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                amount_try NUMERIC(10, 2) NOT NULL DEFAULT 50,
                status TEXT NOT NULL DEFAULT 'pending',
                iyzico_token TEXT,
                payment_status TEXT,
                doc_id INTEGER,
                blockchain_tx_hash TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paid_at TIMESTAMP
            )
            """
        )
    conn.commit()
    cur.close()


def create_payment_session(
    conn,
    session_id: str,
    *,
    user_email: str,
    uploader_name: str,
    target_institution: str,
    filename: str,
    file_hash: str,
    amount_try: float = 50.0,
) -> None:
    ensure_payments_schema(conn)
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    if is_sqlite:
        cur.execute(
            """
            INSERT INTO payment_sessions (
                id, user_email, uploader_name, target_institution,
                filename, file_hash, amount_try, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            (
                session_id,
                user_email.lower(),
                uploader_name,
                target_institution,
                filename,
                file_hash,
                amount_try,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO payment_sessions (
                id, user_email, uploader_name, target_institution,
                filename, file_hash, amount_try, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
            """,
            (
                session_id,
                user_email.lower(),
                uploader_name,
                target_institution,
                filename,
                file_hash,
                amount_try,
            ),
        )
    conn.commit()
    cur.close()


def get_payment_session(conn, session_id: str) -> dict | None:
    ensure_payments_schema(conn)
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    ph = "?" if is_sqlite else "%s"
    cur.execute(
        f"""
        SELECT id, user_email, uploader_name, target_institution, filename,
               file_hash, amount_try, status, iyzico_token, payment_status,
               doc_id, blockchain_tx_hash, error_message, created_at, paid_at
        FROM payment_sessions WHERE id = {ph}
        """,
        (session_id,),
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return None
    return {
        "id": row[0],
        "user_email": row[1],
        "uploader_name": row[2],
        "target_institution": row[3],
        "filename": row[4],
        "file_hash": row[5],
        "amount_try": float(row[6]) if row[6] is not None else 50.0,
        "status": row[7],
        "iyzico_token": row[8],
        "payment_status": row[9],
        "doc_id": row[10],
        "blockchain_tx_hash": row[11],
        "error_message": row[12],
        "created_at": row[13],
        "paid_at": row[14],
    }


def update_payment_session(conn, session_id: str, **fields) -> None:
    if not fields:
        return
    ensure_payments_schema(conn)
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    allowed = {
        "status",
        "iyzico_token",
        "payment_status",
        "doc_id",
        "blockchain_tx_hash",
        "error_message",
        "paid_at",
    }
    parts = []
    values = []
    for key, val in fields.items():
        if key not in allowed:
            continue
        parts.append(f"{key} = {'?' if is_sqlite else '%s'}")
        values.append(val)
    if not parts:
        cur.close()
        return
    values.append(session_id)
    ph = "?" if is_sqlite else "%s"
    cur.execute(
        f"UPDATE payment_sessions SET {', '.join(parts)} WHERE id = {ph}",
        tuple(values),
    )
    conn.commit()
    cur.close()


def set_document_blockchain_tx(conn, doc_id: int, tx_hash: str) -> None:
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    if is_sqlite:
        cur.execute(
            "UPDATE documents SET blockchain_tx_hash = ? WHERE id = ?",
            (tx_hash, doc_id),
        )
    else:
        cur.execute(
            "UPDATE documents SET blockchain_tx_hash = %s WHERE id = %s",
            (tx_hash, doc_id),
        )
    conn.commit()
    cur.close()


def get_document_by_file_hash(conn, file_hash: str) -> dict | None:
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    ph = "?" if is_sqlite else "%s"
    cur.execute(
        f"""
        SELECT id, filename, status, target_institution, blockchain_tx_hash
        FROM documents WHERE file_hash = {ph}
        """,
        (file_hash,),
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return None
    return {
        "id": row[0],
        "filename": row[1],
        "status": row[2],
        "target_institution": row[3],
        "blockchain_tx_hash": row[4],
    }


def ensure_institutions_schema(conn):
    """PostgreSQL veya mevcut bağlantıda kurum tablosunu hazırlar."""
    cur = conn.cursor()
    is_sqlite = conn.__class__.__module__.startswith("sqlite3")
    if is_sqlite:
        _ensure_institutions_sqlite(cur)
        conn.commit()
        cur.close()
        ensure_institution_rsa_keys(conn)
        return
    else:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS institutions (
                id SERIAL PRIMARY KEY,
                code VARCHAR(64) NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                rsa_public_key_pem TEXT,
                rsa_private_key_pem TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            "ALTER TABLE institutions ADD COLUMN IF NOT EXISTS rsa_public_key_pem TEXT"
        )
        cur.execute(
            "ALTER TABLE institutions ADD COLUMN IF NOT EXISTS rsa_private_key_pem TEXT"
        )
        cur.execute("SELECT COUNT(*) FROM institutions")
        if cur.fetchone()[0] == 0:
            _seed_institutions(cur, "%s")
    ensure_institution_rsa_keys(conn)
    conn.commit()
    cur.close()


def _get_sqlite_connection():
    db_path = Path(__file__).resolve().parent / "local.db"
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    _init_sqlite(conn)
    ensure_payments_schema(conn)
    ensure_documents_encryption_schema(conn)
    ensure_institutions_schema(conn)
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

    db_password = os.getenv("DB_PASSWORD")
    if not db_password:
        _set_last_error("DB_PASSWORD tanımlı değil; SQLite fallback aktif.")
        print(_LAST_DB_ERROR)
        return _get_sqlite_connection()

    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "aws-1-ap-south-1.pooler.supabase.com"),
            database=os.getenv("DB_NAME", "postgres"),
            user=os.getenv("DB_USER", "postgres.fjlrvesxyfcftrovtnig"),
            password=db_password,
            port=os.getenv("DB_PORT", "6543"),
            sslmode=os.getenv("DB_SSLMODE", "require"),
            connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT", "10")),
        )
        _set_last_error("PostgreSQL bağlantısı aktif")
        ensure_users_schema(conn)
        ensure_documents_schema(conn)
        ensure_institutions_schema(conn)
        ensure_profiles_schema(conn)
        ensure_payments_schema(conn)
        ensure_documents_encryption_schema(conn)
        return conn
    except Exception as e:
        _set_last_error(f"PostgreSQL bağlantı hatası: {e}. SQLite fallback aktif.")
        print(_LAST_DB_ERROR)
        return _get_sqlite_connection()