import os
from pathlib import Path
import re
import secrets
import string

from io import BytesIO

from flask import Flask, request, jsonify, send_file, redirect
from flask_cors import CORS
import hashlib

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.is_file():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
from werkzeug.security import generate_password_hash, check_password_hash
from database import (
    get_db_connection,
    get_db_error,
    ensure_documents_schema,
    ensure_institutions_schema,
    ensure_users_schema,
    ensure_registration_verification_schema,
    ensure_profiles_schema,
    insert_document,
    fetch_documents_for_user,
    fetch_pending_documents_for_institution,
    get_or_create_student_uuid,
    institution_code_variants,
    insert_registry_document,
    list_registry_documents,
    delete_registry_document,
    normalize_academic_year,
    update_document_academic_year,
    registry_hash_matches,
    ensure_institution_registry_schema,
)
from verification_service import (
    VERIFICATION_MOCK,
    generate_code,
    hash_code,
    is_expired,
    normalize_phone,
    send_email,
    send_sms,
    verification_expires_at,
    verify_code,
)
from institution_session import (
    check_login_allowed,
    get_session,
    issue_token,
    record_login_failure,
    record_login_success,
    revoke_institution_sessions,
    revoke_token,
    validate_session,
)
from crypto_service import generate_rsa_keypair
from errors import friendly_db_error as _friendly_db_error
from file_storage import save_document_file, find_stored_file, has_stored_file, save_registry_file
from payment_config import (
    FRONTEND_URL,
    IYZICO_MOCK,
    PAYMENT_AMOUNT_TRY,
    iyzico_configured,
    relayer_configured,
)
from payment_service import complete_payment, get_session_status, start_card_payment
from document_encryption import decrypt_document_bytes, seal_document_on_approval
from database import update_payment_session

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False,
)


def _is_sqlite(conn):
    return conn.__class__.__module__.startswith("sqlite3")


def _sql(conn, query):
    # SQLite'da placeholder `%s` yerine `?` kullanılmalı.
    if _is_sqlite(conn):
        return query.replace("%s", "?")
    return query


def _attach_file_flags(doc: dict) -> dict:
    doc["has_file"] = has_stored_file(
        doc["id"],
        doc.get("file_hash"),
        doc.get("filename"),
    )
    return doc


def _user_can_view_document(conn, doc_id: int, user_email: str, uploader_name: str = "") -> bool:
    if not user_email:
        return False
    docs = fetch_documents_for_user(conn, uploader_name or "", user_email)
    return any(d["id"] == doc_id for d in docs)


def _institution_can_view_document(conn, doc_id: int, institution_code: str) -> bool:
    if not institution_code:
        return False
    cur = conn.cursor()
    cur.execute(
        _sql(conn, "SELECT target_institution FROM documents WHERE id = %s"),
        (doc_id,),
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return False
    return row[0] in institution_code_variants(institution_code)


def _mimetype_for_filename(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"


def _normalize_file_hash_param(raw: str) -> str | None:
    value = (raw or "").strip().lower().replace("0x", "")
    if re.fullmatch(r"[0-9a-f]{64}", value):
        return value
    return None


def _send_document_file_response(
    conn,
    doc_id: int,
    filename: str,
    file_hash: str,
    *,
    as_download: bool = False,
):
    from document_encryption import document_encryption_meta

    enc_meta = document_encryption_meta(conn, doc_id)
    if enc_meta and enc_meta.get("is_encrypted"):
        try:
            content = decrypt_document_bytes(conn, doc_id)
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        resp = send_file(
            BytesIO(content),
            mimetype=_mimetype_for_filename(filename),
            as_attachment=as_download,
            download_name=filename,
        )
    else:
        stored = find_stored_file(doc_id, file_hash, filename)
        if not stored:
            return jsonify({
                "error": "Dosya arşivde yok. Yalnızca hash kaydı mevcut.",
            }), 404
        resp = send_file(
            stored,
            mimetype=_mimetype_for_filename(filename),
            as_attachment=as_download,
            download_name=filename,
        )
    disposition = "attachment" if as_download else "inline"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Content-Disposition"] = f'{disposition}; filename="{filename}"'
    return resp


@app.route("/")
def home():
    return "Belge Doğrulama Backend Sistemi Aktif 🚀"


@app.route("/health", methods=["GET"])
def health():
    conn = get_db_connection()
    if conn:
        conn.close()
        return jsonify({"ok": True, "message": "Backend çalışıyor", "db": get_db_error()})
    return jsonify({"ok": False, "error": get_db_error()}), 503


@app.route("/debug/db-overview", methods=["GET"])
def debug_db_overview():
    """Yerel geliştirme: kayıtlı kullanıcı ve belgeleri listeler (şifre göstermez)."""
    email_filter = (request.args.get("email") or "").strip().lower()

    conn = get_db_connection()
    if not conn:
        return jsonify({"ok": False, "error": get_db_error()}), 503

    cur = None
    try:
        ensure_users_schema(conn)
        ensure_documents_schema(conn)
        cur = conn.cursor()
        db_type = "sqlite" if _is_sqlite(conn) else "postgresql"

        if email_filter:
            cur.execute(
                _sql(
                    conn,
                    "SELECT id, email, full_name, created_at FROM users WHERE LOWER(email) = %s",
                ),
                (email_filter,),
            )
        else:
            cur.execute(
                _sql(
                    conn,
                    "SELECT id, email, full_name, created_at FROM users ORDER BY id",
                )
            )
        users = [
            {
                "id": row[0],
                "email": row[1],
                "full_name": row[2],
                "created_at": str(row[3]) if row[3] else None,
            }
            for row in cur.fetchall()
        ]

        cur.execute(
            _sql(
                conn,
                """
                SELECT id, filename, student_id, status, target_institution, created_at
                FROM documents ORDER BY id DESC LIMIT 30
                """,
            )
        )
        documents = [
            {
                "id": row[0],
                "filename": row[1],
                "student_id": str(row[2]) if row[2] is not None else None,
                "status": row[3],
                "institution": row[4],
                "created_at": str(row[5]) if row[5] else None,
            }
            for row in cur.fetchall()
        ]

        return jsonify({
            "ok": True,
            "db_type": db_type,
            "db_status": get_db_error(),
            "user_count": len(users),
            "users": users,
            "document_count": len(documents),
            "documents": documents,
            "email_filter": email_filter or None,
            "registered": bool(users) if email_filter else None,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


def _user_row_to_dict(row):
    return {
        "id": row[0],
        "email": row[1],
        "full_name": row[2],
    }


_ADMIN_TOKENS: set[str] = set()


def _admin_env() -> tuple[str, str]:
    email = os.getenv("ADMIN_EMAIL", "admin@etherescan.local").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "admin123").strip()
    return email, password


def _require_admin_token() -> tuple[bool, tuple]:
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth.startswith("Bearer "):
        return False, (jsonify({"error": "Admin yetkisi gerekli"}), 401)
    token = auth.replace("Bearer ", "", 1).strip()
    if not token or token not in _ADMIN_TOKENS:
        return False, (jsonify({"error": "Admin oturumu geçersiz"}), 401)
    return True, ()


def _generate_institution_password() -> str:
    """Kurum girişi için okunabilir otomatik şifre (4x4 küçük harf)."""
    alphabet = string.ascii_lowercase
    parts = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4)]
    return " ".join(parts)


def _normalize_institution_code(raw: str) -> str:
    tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    code = (raw or "").translate(tr).strip().upper()
    code = re.sub(r"[^A-Z0-9_]+", "_", code)
    code = re.sub(r"_+", "_", code).strip("_")
    return code


def _list_institutions(conn) -> list[dict]:
    cur = conn.cursor()
    try:
        cur.execute(
            _sql(
                conn,
                """
                SELECT id, code, name, created_at, is_suspended, password_version
                FROM institutions ORDER BY name ASC
                """,
            )
        )
        return [
            {
                "id": row[0],
                "code": row[1],
                "name": row[2],
                "created_at": str(row[3]) if row[3] else None,
                "is_suspended": bool(row[4]),
                "password_version": int(row[5] or 1),
            }
            for row in cur.fetchall()
        ]
    finally:
        cur.close()


def _institution_bearer_token() -> str | None:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.startswith("Bearer "):
        return auth.replace("Bearer ", "", 1).strip() or None
    return None


def _get_institution_row(conn, institution_id: int):
    cur = conn.cursor()
    try:
        cur.execute(
            _sql(
                conn,
                """
                SELECT id, code, name, is_suspended, password_version
                FROM institutions WHERE id = %s
                """,
            ),
            (institution_id,),
        )
        return cur.fetchone()
    finally:
        cur.close()


def _require_institution_session(
    *,
    expected_code: str | None = None,
) -> tuple[bool, tuple, dict | None]:
    token = _institution_bearer_token()
    session = get_session(token)
    if not session:
        return False, (jsonify({"error": "Kurum oturumu gerekli. Tekrar giriş yapın."}), 401), None

    conn = get_db_connection()
    if not conn:
        return False, (jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500), None
    try:
        ensure_institutions_schema(conn)
        row = _get_institution_row(conn, session["institution_id"])
        if not row:
            revoke_institution_sessions(session["institution_id"])
            return False, (jsonify({"error": "Kurum bulunamadı"}), 401), None
        inst_id, code, name, is_suspended, password_version = row
        if not validate_session(session, int(password_version or 1)):
            revoke_token(token)
            return False, (
                jsonify({"error": "Oturum geçersiz. Şifre sıfırlandı veya süresi doldu."}),
                401,
            ), None
        if bool(is_suspended):
            return False, (jsonify({"error": "Kurum hesabı askıya alınmış"}), 403), None
        if expected_code and code.upper() != expected_code.upper():
            return False, (jsonify({"error": "Bu kuruma erişim yetkiniz yok"}), 403), None
        session = {
            **session,
            "institution_id": inst_id,
            "code": code,
            "name": name,
        }
        return True, (), session
    finally:
        conn.close()


def _create_user_account(conn, email: str, password_hash: str, full_name: str, phone: str):
    cur = conn.cursor()
    try:
        if _is_sqlite(conn):
            cur.execute(
                _sql(
                    conn,
                    "INSERT INTO users (email, password_hash, full_name, phone) VALUES (%s, %s, %s, %s)",
                ),
                (email, password_hash, full_name, phone),
            )
            conn.commit()
            user_id = cur.lastrowid
        else:
            cur.execute(
                _sql(
                    conn,
                    "INSERT INTO users (email, password_hash, full_name, phone) VALUES (%s, %s, %s, %s) RETURNING id",
                ),
                (email, password_hash, full_name, phone),
            )
            user_id = cur.fetchone()[0]
            conn.commit()
        try:
            get_or_create_student_uuid(conn, email, full_name)
        except Exception:
            pass
        return user_id
    finally:
        cur.close()


def _email_already_registered(conn, email: str) -> bool:
    cur = conn.cursor()
    try:
        cur.execute(_sql(conn, "SELECT 1 FROM users WHERE email = %s LIMIT 1"), (email,))
        return cur.fetchone() is not None
    finally:
        cur.close()


@app.route("/auth/register/start", methods=["POST"])
def auth_register_start():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()
    phone_raw = (data.get("phone") or "").strip()
    phone = normalize_phone(phone_raw)

    if not email or not full_name or len(password) < 6:
        return jsonify({"error": "E-posta, ad soyad ve en az 6 karakterli şifre gerekli"}), 400
    if not phone:
        return jsonify({"error": "Geçerli bir telefon numarası girin (örn. 05XX XXX XX XX)"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı", "details": get_db_error()}), 500

    cur = None
    try:
        ensure_users_schema(conn)
        ensure_registration_verification_schema(conn)
        if _email_already_registered(conn, email):
            return jsonify({"error": "Bu e-posta zaten kayıtlı"}), 409

        sms_code = generate_code()
        email_code = generate_code()
        session_id = secrets.token_urlsafe(32)
        expires_at = verification_expires_at()

        sms_ok, sms_err = send_sms(phone, sms_code)
        if not sms_ok:
            return jsonify({"error": f"SMS gönderilemedi: {sms_err}"}), 502

        mail_ok, mail_err = send_email(email, email_code)
        if not mail_ok:
            return jsonify({"error": f"E-posta gönderilemedi: {mail_err}"}), 502

        cur = conn.cursor()
        cur.execute(
            _sql(conn, "DELETE FROM registration_verifications WHERE email = %s"),
            (email,),
        )
        cur.execute(
            _sql(
                conn,
                """
                INSERT INTO registration_verifications (
                    id, email, password_hash, full_name, phone,
                    sms_code_hash, email_code_hash, expires_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
            ),
            (
                session_id,
                email,
                generate_password_hash(password),
                full_name,
                phone,
                hash_code(sms_code),
                hash_code(email_code),
                expires_at.isoformat() if _is_sqlite(conn) else expires_at,
            ),
        )
        conn.commit()

        payload = {
            "message": "Doğrulama kodları gönderildi",
            "session_id": session_id,
            "expires_in_minutes": int(os.getenv("VERIFICATION_CODE_TTL_MINUTES", "10")),
            "mock_mode": VERIFICATION_MOCK,
        }
        if VERIFICATION_MOCK:
            payload["dev_sms_code"] = sms_code
            payload["dev_email_code"] = email_code
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/auth/register/verify", methods=["POST"])
def auth_register_verify():
    data = request.json or {}
    session_id = (data.get("session_id") or "").strip()
    sms_code = (data.get("sms_code") or "").strip()
    email_code = (data.get("email_code") or "").strip()

    if not session_id or not sms_code or not email_code:
        return jsonify({"error": "Oturum kimliği ve her iki doğrulama kodu gerekli"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500

    cur = None
    try:
        ensure_users_schema(conn)
        ensure_registration_verification_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(
                conn,
                """
                SELECT email, password_hash, full_name, phone,
                       sms_code_hash, email_code_hash, expires_at
                FROM registration_verifications WHERE id = %s
                """,
            ),
            (session_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Doğrulama oturumu bulunamadı veya süresi dolmuş"}), 404

        email, password_hash, full_name, phone, sms_hash, email_hash, expires_at = row
        if is_expired(expires_at):
            cur.execute(
                _sql(conn, "DELETE FROM registration_verifications WHERE id = %s"),
                (session_id,),
            )
            conn.commit()
            return jsonify({"error": "Doğrulama kodlarının süresi doldu. Lütfen yeniden kayıt olun."}), 410

        if not verify_code(sms_code, sms_hash):
            return jsonify({"error": "SMS doğrulama kodu hatalı"}), 400
        if not verify_code(email_code, email_hash):
            return jsonify({"error": "E-posta doğrulama kodu hatalı"}), 400

        if _email_already_registered(conn, email):
            cur.execute(
                _sql(conn, "DELETE FROM registration_verifications WHERE id = %s"),
                (session_id,),
            )
            conn.commit()
            return jsonify({"error": "Bu e-posta zaten kayıtlı"}), 409

        user_id = _create_user_account(conn, email, password_hash, full_name, phone)
        cur.execute(
            _sql(conn, "DELETE FROM registration_verifications WHERE id = %s"),
            (session_id,),
        )
        conn.commit()
        return jsonify({
            "message": "Kayıt başarılı",
            "user": {"id": user_id, "email": email, "full_name": full_name},
        })
    except Exception as e:
        err = str(e).lower()
        if "unique" in err or "duplicate" in err:
            return jsonify({"error": "Bu e-posta zaten kayıtlı"}), 409
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/auth/register", methods=["POST"])
def auth_register():
    return jsonify({
        "error": "Kayıt için önce /auth/register/start ile doğrulama kodu alın, ardından /auth/register/verify kullanın.",
    }), 400


@app.route("/auth/login", methods=["POST"])
def auth_login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "E-posta ve şifre gerekli"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500

    cur = None
    try:
        ensure_users_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(conn, "SELECT id, email, full_name, password_hash, is_banned FROM users WHERE email = %s"),
            (email,),
        )
        row = cur.fetchone()
        if not row or not check_password_hash(row[3], password):
            return jsonify({"error": "E-posta veya şifre hatalı"}), 401
        if bool(row[4]):
            return jsonify({"error": "Hesabınız askıya alınmış. Yöneticiyle iletişime geçin."}), 403
        get_or_create_student_uuid(conn, email, row[2])
        return jsonify({
            "message": "Giriş başarılı",
            "user": _user_row_to_dict(row),
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/auth/institution/login", methods=["POST"])
def auth_institution_login():
    data = request.json or {}
    code = (data.get("code") or "").strip().upper()
    password = (data.get("password") or "").replace(" ", "").strip()

    if not code or not password:
        return jsonify({"error": "Kurum kodu ve şifre gerekli"}), 400

    allowed, lock_msg = check_login_allowed(code)
    if not allowed:
        return jsonify({"error": lock_msg}), 429

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı", "details": get_db_error()}), 500

    cur = None
    try:
        ensure_institutions_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(
                conn,
                """
                SELECT id, code, name, password_hash, is_suspended, password_version
                FROM institutions WHERE code = %s
                """,
            ),
            (code,),
        )
        row = cur.fetchone()
        if not row or not check_password_hash(row[3], password):
            record_login_failure(code)
            return jsonify({"error": "Kurum kodu veya şifre hatalı"}), 401
        if bool(row[4]):
            return jsonify({"error": "Kurum hesabı askıya alınmış. Yöneticiyle iletişime geçin."}), 403

        record_login_success(code)
        token = issue_token(row[0], row[1], row[2], int(row[5] or 1))
        return jsonify({
            "message": "Kurum girişi başarılı",
            "token": token,
            "institution": {"id": row[0], "code": row[1], "name": row[2]},
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/auth/institution/logout", methods=["POST"])
def auth_institution_logout():
    token = _institution_bearer_token()
    revoke_token(token)
    return jsonify({"message": "Kurum çıkışı yapıldı"})


@app.route("/institution/registry", methods=["GET"])
def institution_registry_list():
    ok, response, session = _require_institution_session()
    if not ok:
        return response
    academic_year = request.args.get("academic_year")
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    try:
        items = list_registry_documents(conn, session["code"], academic_year)
        return jsonify({"items": items, "institution_code": session["code"]})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        conn.close()


@app.route("/institution/registry", methods=["POST"])
def institution_registry_upload():
    ok, response, session = _require_institution_session()
    if not ok:
        return response
    if "file" not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400
    file = request.files["file"]
    academic_year = normalize_academic_year(request.form.get("academic_year"))
    if not academic_year:
        return jsonify({"error": "Akademik yıl gerekli (örn. 2025-2026)"}), 400
    if not file.filename:
        return jsonify({"error": "Dosya adı boş"}), 400

    content = file.read()
    if not content:
        return jsonify({"error": "Dosya içeriği boş"}), 400
    file_hash = hashlib.sha256(content).hexdigest()

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    try:
        reg_id = insert_registry_document(
            conn,
            session["code"],
            academic_year,
            file_hash,
            file.filename,
        )
        save_registry_file(session["code"], academic_year, file_hash, content)
        return jsonify({
            "message": "Resmi belge kayıt defterine eklendi",
            "item": {
                "id": reg_id,
                "academic_year": academic_year,
                "filename": file.filename,
                "file_hash": file_hash,
            },
        })
    except Exception as e:
        err = str(e).lower()
        if "unique" in err or "duplicate" in err:
            return jsonify({"error": "Bu belge hash'i bu akademik yılda zaten kayıtlı"}), 409
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        conn.close()


@app.route("/institution/registry/<int:entry_id>", methods=["DELETE"])
def institution_registry_delete(entry_id: int):
    ok, response, session = _require_institution_session()
    if not ok:
        return response
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    try:
        deleted = delete_registry_document(conn, entry_id, session["code"])
        if not deleted:
            return jsonify({"error": "Kayıt bulunamadı"}), 404
        return jsonify({"message": "Kayıt silindi"})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        conn.close()


@app.route("/auth/admin/login", methods=["POST"])
def auth_admin_login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    admin_email, admin_password = _admin_env()
    if email != admin_email or password != admin_password:
        return jsonify({"error": "Admin e-posta veya şifre hatalı"}), 401
    token = secrets.token_urlsafe(32)
    _ADMIN_TOKENS.add(token)
    return jsonify({"message": "Admin giriş başarılı", "token": token})


@app.route("/admin/users", methods=["GET"])
def admin_list_users():
    ok, response = _require_admin_token()
    if not ok:
        return response
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_users_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(
                conn,
                "SELECT id, email, full_name, is_banned, created_at FROM users ORDER BY id DESC",
            )
        )
        out = []
        for row in cur.fetchall():
            out.append(
                {
                    "id": row[0],
                    "email": row[1],
                    "full_name": row[2],
                    "is_banned": bool(row[3]),
                    "created_at": str(row[4]) if row[4] else None,
                }
            )
        return jsonify({"users": out})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/admin/users/<int:user_id>/ban", methods=["POST"])
def admin_ban_user(user_id: int):
    ok, response = _require_admin_token()
    if not ok:
        return response
    data = request.json or {}
    banned = bool(data.get("banned"))
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_users_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(conn, "UPDATE users SET is_banned = %s WHERE id = %s"),
            (1 if _is_sqlite(conn) and banned else 0 if _is_sqlite(conn) else banned, user_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Kullanıcı bulunamadı"}), 404
        return jsonify({"message": "Kullanıcı durumu güncellendi", "is_banned": banned})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/admin/users/<int:user_id>", methods=["DELETE"])
def admin_delete_user(user_id: int):
    ok, response = _require_admin_token()
    if not ok:
        return response
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_users_schema(conn)
        cur = conn.cursor()
        cur.execute(_sql(conn, "DELETE FROM users WHERE id = %s"), (user_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Kullanıcı bulunamadı"}), 404
        return jsonify({"message": "Kullanıcı silindi"})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/institutions", methods=["GET"])
def list_public_institutions():
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    try:
        ensure_institutions_schema(conn)
        return jsonify({"institutions": _list_institutions(conn)})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        conn.close()


@app.route("/admin/institutions", methods=["GET"])
def admin_list_institutions():
    ok, response = _require_admin_token()
    if not ok:
        return response
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    try:
        ensure_institutions_schema(conn)
        return jsonify({"institutions": _list_institutions(conn)})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        conn.close()


@app.route("/admin/institutions", methods=["POST"])
def admin_create_institution():
    ok, response = _require_admin_token()
    if not ok:
        return response
    data = request.json or {}
    name = (data.get("name") or "").strip()
    code = _normalize_institution_code(data.get("code") or name)

    if not name or len(name) < 2:
        return jsonify({"error": "Kurum adı en az 2 karakter olmalı"}), 400
    if not code or len(code) < 2:
        return jsonify({"error": "Geçerli bir kurum kodu girin (örn. BEUN)"}), 400

    generated_password = _generate_institution_password()
    password_plain = generated_password.replace(" ", "")
    pub, priv = generate_rsa_keypair()

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_institutions_schema(conn)
        cur = conn.cursor()
        if _is_sqlite(conn):
            cur.execute(
                _sql(
                    conn,
                    """
                    INSERT INTO institutions (
                        code, name, password_hash, rsa_public_key_pem, rsa_private_key_pem
                    ) VALUES (%s, %s, %s, %s, %s)
                    """,
                ),
                (code, name, generate_password_hash(password_plain), pub, priv),
            )
            conn.commit()
            inst_id = cur.lastrowid
        else:
            cur.execute(
                _sql(
                    conn,
                    """
                    INSERT INTO institutions (
                        code, name, password_hash, rsa_public_key_pem, rsa_private_key_pem
                    ) VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """,
                ),
                (code, name, generate_password_hash(password_plain), pub, priv),
            )
            inst_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({
            "message": "Kurum oluşturuldu",
            "institution": {
                "id": inst_id,
                "code": code,
                "name": name,
            },
            "generated_password": generated_password,
        })
    except Exception as e:
        err = str(e).lower()
        if "unique" in err or "duplicate" in err:
            return jsonify({"error": "Bu kurum kodu zaten kayıtlı"}), 409
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/admin/institutions/<int:institution_id>", methods=["DELETE"])
def admin_delete_institution(institution_id: int):
    ok, response = _require_admin_token()
    if not ok:
        return response
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_institutions_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(conn, "SELECT code, name FROM institutions WHERE id = %s"),
            (institution_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Kurum bulunamadı"}), 404
        cur.execute(
            _sql(conn, "DELETE FROM institutions WHERE id = %s"),
            (institution_id,),
        )
        conn.commit()
        return jsonify({
            "message": "Kurum silindi",
            "institution": {"id": institution_id, "code": row[0], "name": row[1]},
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/admin/institutions/<int:institution_id>/reset-password", methods=["POST"])
def admin_reset_institution_password(institution_id: int):
    ok, response = _require_admin_token()
    if not ok:
        return response

    generated_password = _generate_institution_password()
    password_plain = generated_password.replace(" ", "")

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_institutions_schema(conn)
        cur = conn.cursor()
        if _is_sqlite(conn):
            cur.execute(
                _sql(
                    conn,
                    """
                    UPDATE institutions
                    SET password_hash = %s, password_version = password_version + 1
                    WHERE id = %s
                    """,
                ),
                (generate_password_hash(password_plain), institution_id),
            )
        else:
            cur.execute(
                _sql(
                    conn,
                    """
                    UPDATE institutions
                    SET password_hash = %s, password_version = password_version + 1
                    WHERE id = %s
                    RETURNING code, name
                    """,
                ),
                (generate_password_hash(password_plain), institution_id),
            )
        if cur.rowcount == 0:
            return jsonify({"error": "Kurum bulunamadı"}), 404
        row = cur.fetchone() if not _is_sqlite(conn) else None
        if _is_sqlite(conn):
            cur.execute(
                _sql(conn, "SELECT code, name FROM institutions WHERE id = %s"),
                (institution_id,),
            )
            row = cur.fetchone()
        conn.commit()
        revoke_institution_sessions(institution_id)
        return jsonify({
            "message": "Kurum şifresi sıfırlandı. Eski oturumlar kapatıldı.",
            "institution": {"id": institution_id, "code": row[0], "name": row[1]},
            "generated_password": generated_password,
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/admin/institutions/<int:institution_id>/suspend", methods=["POST"])
def admin_suspend_institution(institution_id: int):
    ok, response = _require_admin_token()
    if not ok:
        return response
    data = request.json or {}
    suspended = bool(data.get("suspended"))

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500
    cur = None
    try:
        ensure_institutions_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(conn, "UPDATE institutions SET is_suspended = %s WHERE id = %s"),
            (1 if _is_sqlite(conn) and suspended else 0 if _is_sqlite(conn) else suspended, institution_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Kurum bulunamadı"}), 404
        if suspended:
            revoke_institution_sessions(institution_id)
        return jsonify({"message": "Kurum durumu güncellendi", "is_suspended": suspended})
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


# --- 1. KULLANICI TARAFI: BELGE YÜKLEME ---
@app.route("/upload", methods=["POST"])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400
    
    file = request.files['file']
    # Kullanıcı ve kurum bilgilerini frontend'den alıyoruz
    uploader_name = request.form.get('uploader_name', 'Bilinmiyor')
    user_email = (request.form.get('user_email') or '').strip().lower() or None
    target_institution = request.form.get('target_institution', 'Genel')
    academic_year = normalize_academic_year(request.form.get('academic_year'))

    if file.filename == '':
        return jsonify({"error": "Dosya adı boş"}), 400

    if not user_email:
        return jsonify({
            "error": "Belge kaydı için giriş yapmanız ve e-posta bilginizin gönderilmesi gerekir.",
        }), 400

    file_content = file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    conn = get_db_connection()
    if conn:
        cur = None
        try:
            ensure_documents_schema(conn)
            cur = conn.cursor()

            cur.execute(
                _sql(
                    conn,
                    "SELECT id, filename, status, target_institution FROM documents WHERE file_hash = %s",
                ),
                (file_hash,),
            )
            existing = cur.fetchone()
            if existing:
                doc_id = existing[0]
                archived = False
                if not has_stored_file(doc_id, file_hash, file.filename):
                    save_document_file(doc_id, file.filename, file_content)
                    archived = True
                if academic_year:
                    update_document_academic_year(conn, doc_id, academic_year)
                registry_match = registry_hash_matches(
                    conn, target_institution, academic_year, file_hash
                )
                return jsonify({
                    "error": "Bu dosya zaten sisteme yüklenmiş (aynı içerik).",
                    "message": (
                        f"Kayıt: {existing[1]} | Durum: {existing[2]} | "
                        f"Kurum: {existing[3]}."
                        + (" Dosya arşive eklendi." if archived else "")
                    ),
                    "hash": file_hash,
                    "doc_id": doc_id,
                    "status": existing[2],
                    "file_archived": archived,
                    "has_file": has_stored_file(doc_id, file_hash, file.filename),
                    "academic_year": academic_year,
                    "registry_match": registry_match,
                }), 409

            cur.close()
            cur = None
            doc_id = insert_document(
                conn,
                file.filename,
                file_hash,
                uploader_name.strip() or "Bilinmiyor",
                target_institution,
                user_email,
                academic_year,
            )
            save_document_file(doc_id, file.filename, file_content)
            registry_match = registry_hash_matches(
                conn, target_institution, academic_year, file_hash
            )
            return jsonify({
                "message": "Belge başarıyla yüklendi, kurum onayı bekleniyor.",
                "hash": file_hash,
                "status": "pending",
                "doc_id": doc_id,
                "has_file": True,
                "academic_year": academic_year,
                "registry_match": registry_match,
            })
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            err = str(e).lower()
            if "unique" in err or "duplicate" in err:
                return jsonify({
                    "error": "Bu dosya zaten kayıtlı (aynı hash).",
                    "hash": file_hash,
                }), 409
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı. Backend çalışıyor mu kontrol edin."}), 500

# --- 2. KURUM TARAFI: BEKLEYEN BELGELERİ LİSTELE ---
@app.route("/pending-docs/<institution_name>", methods=["GET"])
def get_pending_docs(institution_name):
    ok, response, _session = _require_institution_session(
        expected_code=institution_name.strip().upper()
    )
    if not ok:
        return response

    conn = get_db_connection()
    if conn:
        try:
            docs = fetch_pending_documents_for_institution(conn, institution_name)
            output = [_attach_file_flags(doc) for doc in docs]
            return jsonify(output)
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı."}), 500


@app.route("/documents/<int:doc_id>/auto-approve-registry", methods=["POST"])
def auto_approve_from_registry(doc_id: int):
    data = request.json or {}
    user_email = (data.get("user_email") or "").strip().lower()
    uploader_name = (data.get("uploader_name") or "").strip()
    if not user_email and not uploader_name:
        return jsonify({"error": "Kullanıcı oturumu gerekli"}), 401

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 500

    cur = None
    try:
        ensure_documents_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(
                conn,
                """
                SELECT filename, file_hash, target_institution, status,
                       user_email, uploader_name, academic_year
                FROM documents WHERE id = %s
                """,
            ),
            (doc_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Belge bulunamadı"}), 404

        filename, file_hash, target_institution, status, _doc_email, _doc_name, academic_year = row
        if status != "pending":
            return jsonify({"error": "Belge zaten işlenmiş"}), 400
        if not _user_can_view_document(conn, doc_id, user_email, uploader_name):
            return jsonify({"error": "Bu belge size ait değil"}), 403
        if not registry_hash_matches(conn, target_institution, academic_year, file_hash):
            return jsonify({
                "error": "Kurum resmi kayıt defterinde eşleşen hash bulunamadı",
            }), 400

        cur.execute(
            _sql(conn, "UPDATE documents SET status = %s WHERE id = %s"),
            ("approved", doc_id),
        )
        conn.commit()
        try:
            seal_document_on_approval(conn, doc_id)
        except Exception as enc_err:
            return jsonify({
                "error": f"Onay kaydedildi ancak şifreleme başarısız: {enc_err}",
            }), 500

        return jsonify({
            "message": (
                "Belge kurum resmi kaydı ile eşleştiği için otomatik onaylandı. "
                "AES/RSA ile şifrelendi."
            ),
            "encrypted": True,
            "filename": filename,
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


# --- KULLANICI: KENDİ BELGELERİ ---
@app.route("/documents/mine", methods=["GET"])
def my_documents():
    uploader_name = (request.args.get("uploader_name") or "").strip()
    user_email = (request.args.get("user_email") or "").strip().lower()
    if not uploader_name and not user_email:
        return jsonify({"error": "uploader_name veya user_email gerekli"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı", "details": get_db_error()}), 500

    try:
        documents = [_attach_file_flags(d) for d in fetch_documents_for_user(conn, uploader_name, user_email or None)]
        pending = [d for d in documents if d["status"] == "pending"]
        return jsonify({
            "uploader": uploader_name or user_email,
            "total": len(documents),
            "pending_count": len(pending),
            "documents": documents,
            "pending": pending,
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        conn.close()


@app.route("/documents/<int:doc_id>/archive", methods=["POST"])
def archive_document_file(doc_id):
    """Mevcut kayıt için PDF dosyasını yerel arşive ekler (hash eşleşmeli)."""
    if "file" not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Dosya adı boş"}), 400

    user_email = (request.form.get("user_email") or "").strip().lower()
    uploader_name = (request.form.get("uploader_name") or "").strip()
    institution_code = (request.form.get("institution_code") or "").strip().upper()

    if not user_email and not institution_code:
        return jsonify({"error": "Oturum bilgisi gerekli"}), 401

    if institution_code:
        ok, resp, _session = _require_institution_session(expected_code=institution_code)
        if not ok:
            return resp

    file_content = file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 503

    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            _sql(conn, "SELECT id, filename, file_hash FROM documents WHERE id = %s"),
            (doc_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Belge bulunamadı"}), 404

        allowed = _user_can_view_document(conn, doc_id, user_email, uploader_name)
        if not allowed and institution_code:
            allowed = _institution_can_view_document(conn, doc_id, institution_code)
        if not allowed:
            return jsonify({"error": "Bu belge için arşivleme yetkiniz yok"}), 403

        if file_hash != row[2]:
            return jsonify({
                "error": "Seçilen dosyanın hash'i kayıtla uyuşmuyor. Orijinal PDF'i seçin.",
            }), 400

        save_document_file(doc_id, row[1] or file.filename, file_content)
        return jsonify({
            "message": "Dosya arşive eklendi. Artık görüntüleyebilirsiniz.",
            "has_file": has_stored_file(doc_id, file_hash, row[1]),
            "doc_id": doc_id,
        })
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/documents/<int:doc_id>/file", methods=["GET"])
def serve_document_file(doc_id):
    """Belge dosyasını salt okunur sunar (kullanıcı veya kurum yetkisi gerekir)."""
    user_email = (request.args.get("user_email") or "").strip().lower()
    uploader_name = (request.args.get("uploader_name") or "").strip()
    institution_code = (request.args.get("institution_code") or "").strip().upper()

    if not user_email and not institution_code:
        return jsonify({"error": "Görüntüleme için oturum bilgisi gerekli"}), 401

    if institution_code:
        ok, resp, _session = _require_institution_session(expected_code=institution_code)
        if not ok:
            return resp

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı"}), 503

    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            _sql(
                conn,
                "SELECT id, filename, file_hash, target_institution FROM documents WHERE id = %s",
            ),
            (doc_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Belge bulunamadı"}), 404

        allowed = _user_can_view_document(conn, doc_id, user_email, uploader_name)
        if not allowed and institution_code:
            allowed = _institution_can_view_document(conn, doc_id, institution_code)
        if not allowed:
            return jsonify({"error": "Bu belgeyi görüntüleme yetkiniz yok"}), 403

        return _send_document_file_response(
            conn, doc_id, row[1], row[2], as_download=False
        )
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


# --- 3. KURUM TARAFI: ONAY VEYA RED İŞLEMİ ---
@app.route("/update-status", methods=["POST"])
def update_status():
    ok, response, session = _require_institution_session()
    if not ok:
        return response

    data = request.json
    doc_id = data.get('id')
    new_status = data.get('status') # 'approved' veya 'rejected'
    tx_hash = data.get('blockchain_tx', None) # Blockchain'e yazılırsa gelen işlem kodu

    if new_status not in ['approved', 'rejected']:
        return jsonify({"error": "Geçersiz durum"}), 400

    conn = get_db_connection()
    if conn:
        cur = None
        try:
            cur = conn.cursor()
            cur.execute(
                _sql(conn, "SELECT target_institution FROM documents WHERE id = %s"),
                (doc_id,),
            )
            doc_row = cur.fetchone()
            if not doc_row:
                return jsonify({"error": "Belge bulunamadı"}), 404
            if doc_row[0] not in institution_code_variants(session["code"]):
                return jsonify({"error": "Bu belgeyi onaylama yetkiniz yok"}), 403

            cur.execute(
                _sql(
                    conn,
                    "UPDATE documents SET status = %s, blockchain_tx_hash = %s WHERE id = %s",
                ),
                (new_status, tx_hash, doc_id),
            )
            conn.commit()

            encryption_note = ""
            if new_status == "approved":
                try:
                    seal_document_on_approval(conn, doc_id)
                    encryption_note = " Belge AES ile şifrelendi; anahtar kurum RSA anahtarı ile korundu."
                except Exception as enc_err:
                    return jsonify({
                        "error": f"Onay kaydedildi ancak şifreleme başarısız: {enc_err}",
                    }), 500

            return jsonify({
                "message": f"Belge durumu {new_status} olarak güncellendi.{encryption_note}",
                "encrypted": new_status == "approved",
            })
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı."}), 500

# --- 4. HERKESE AÇIK: BELGE DOĞRULAMA (SORGULAMA) ---
@app.route("/verify/<hash_val>/file", methods=["GET"])
def verify_doc_file(hash_val):
    """Onaylı belgeyi hash ile herkese açık görüntüleme (3. kurum doğrulama)."""
    file_hash = _normalize_file_hash_param(hash_val)
    if not file_hash:
        return jsonify({"error": "Geçersiz dosya hash"}), 400

    as_download = request.args.get("download", "").lower() in ("1", "true", "yes")

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Sunucuya bağlanılamadı."}), 503

    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            _sql(
                conn,
                "SELECT id, filename, file_hash, status FROM documents WHERE file_hash = %s",
            ),
            (file_hash,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Belge bulunamadı"}), 404

        doc_id, filename, stored_hash, status = row
        if (status or "").strip().lower() != "approved":
            return jsonify({
                "error": "Belge henüz kurum tarafından onaylanmadı; görüntülenemez.",
            }), 403

        if not has_stored_file(doc_id, stored_hash, filename):
            from document_encryption import document_encryption_meta

            enc_meta = document_encryption_meta(conn, doc_id)
            if not (enc_meta and enc_meta.get("is_encrypted")):
                return jsonify({
                    "error": "Onaylı belge dosyası arşivde bulunamadı.",
                }), 404

        return _send_document_file_response(
            conn, doc_id, filename, stored_hash, as_download=as_download
        )
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


@app.route("/verify/<hash_val>", methods=["GET"])
def verify_doc(hash_val):
    file_hash = _normalize_file_hash_param(hash_val)
    if not file_hash:
        return jsonify({"exists": False, "message": "Geçersiz hash formatı"})

    conn = get_db_connection()
    if conn:
        cur = None
        try:
            cur = conn.cursor()
            cur.execute(
                _sql(
                    conn,
                    """
                    SELECT id, filename, target_institution, status, blockchain_tx_hash
                    FROM documents WHERE file_hash = %s
                    """,
                ),
                (file_hash,),
            )
            result = cur.fetchone()
            if result:
                doc_id = result[0]
                filename = result[1]
                doc_status = (result[3] or "").strip().lower()
                has_file = has_stored_file(doc_id, file_hash, filename)
                if not has_file:
                    from document_encryption import document_encryption_meta

                    enc_meta = document_encryption_meta(conn, doc_id)
                    has_file = bool(enc_meta and enc_meta.get("is_encrypted"))
                can_view = doc_status == "approved" and has_file
                return jsonify({
                    "exists": True,
                    "doc_id": doc_id,
                    "filename": filename,
                    "institution": result[2],
                    "status": result[3],
                    "blockchain_info": result[4],
                    "has_file": has_file,
                    "can_view": can_view,
                })
            return jsonify({"exists": False, "message": "Belge bulunamadı veya sahte!"})
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı."}), 500


# --- ÖDEME: iyzico + relayer ---
@app.route("/payments/config", methods=["GET"])
def payments_config():
    return jsonify({
        "amount_try": float(PAYMENT_AMOUNT_TRY),
        "currency": "TRY",
        "iyzico_configured": iyzico_configured(),
        "relayer_configured": relayer_configured(),
        "mock_mode": IYZICO_MOCK,
    })


@app.route("/payments/iyzico/init", methods=["POST"])
def payments_iyzico_init():
    if "file" not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400

    file = request.files["file"]
    uploader_name = (request.form.get("uploader_name") or "").strip()
    user_email = (request.form.get("user_email") or "").strip().lower()
    target_institution = request.form.get("target_institution", "BEUN")
    academic_year = normalize_academic_year(request.form.get("academic_year"))

    if not user_email:
        return jsonify({"error": "Giriş yapmanız ve e-posta gönderilmesi gerekir"}), 400
    if not uploader_name:
        return jsonify({"error": "Ad soyad gerekli"}), 400
    if not file.filename:
        return jsonify({"error": "Dosya adı boş"}), 400

    content = file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    buyer_ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "127.0.0.1").split(",")[0].strip()

    result = start_card_payment(
        file_content=content,
        filename=file.filename,
        file_hash=file_hash,
        uploader_name=uploader_name,
        target_institution=target_institution,
        user_email=user_email,
        buyer_ip=buyer_ip,
        academic_year=academic_year,
    )

    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result)


@app.route("/payments/iyzico/callback", methods=["POST"])
def payments_iyzico_callback():
    token = (request.form.get("token") or "").strip()
    if not token:
        return redirect(f"{FRONTEND_URL}/odeme/sonuc?status=error&reason=token_missing")

    conn = get_db_connection()
    session_id = None
    if conn:
        try:
            cur = conn.cursor()
            is_sqlite = conn.__class__.__module__.startswith("sqlite3")
            ph = "?" if is_sqlite else "%s"
            cur.execute(
                f"SELECT id FROM payment_sessions WHERE iyzico_token = {ph}",
                (token,),
            )
            row = cur.fetchone()
            cur.close()
            if row:
                session_id = row[0]
        finally:
            conn.close()

    if not session_id:
        return redirect(f"{FRONTEND_URL}/odeme/sonuc?status=error&reason=session_not_found")

    result = complete_payment(session_id, token)
    if result.get("ok"):
        return redirect(f"{FRONTEND_URL}/odeme/sonuc?session={session_id}&status=success")
    return redirect(
        f"{FRONTEND_URL}/odeme/sonuc?session={session_id}&status=error"
        f"&reason={result.get('error', 'payment_failed')}"
    )


@app.route("/payments/iyzico/mock-complete", methods=["GET"])
def payments_iyzico_mock_complete():
    session_id = (request.args.get("session") or "").strip()
    token = (request.args.get("token") or "").strip()
    if not session_id or not IYZICO_MOCK:
        return jsonify({"error": "Geçersiz mock ödeme"}), 400

    conn = get_db_connection()
    if conn:
        try:
            update_payment_session(conn, session_id, iyzico_token=token)
        finally:
            conn.close()

    result = complete_payment(session_id, token, mock=True)
    if result.get("ok"):
        return redirect(f"{FRONTEND_URL}/odeme/sonuc?session={session_id}&status=success")
    return redirect(
        f"{FRONTEND_URL}/odeme/sonuc?session={session_id}&status=error"
        f"&reason={result.get('error', '')}"
    )


@app.route("/payments/session/<session_id>", methods=["GET"])
def payments_session_status(session_id):
    session = get_session_status(session_id)
    if not session:
        return jsonify({"error": "Oturum bulunamadı"}), 404
    return jsonify({
        "session_id": session["id"],
        "status": session["status"],
        "doc_id": session.get("doc_id"),
        "blockchain_tx": session.get("blockchain_tx_hash"),
        "file_hash": session.get("file_hash"),
        "error": session.get("error_message"),
        "amount_try": session.get("amount_try"),
    })


if __name__ == "__main__":
    app.run(debug=True)