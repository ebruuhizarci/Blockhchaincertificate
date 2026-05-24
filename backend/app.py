from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import hashlib
from werkzeug.security import generate_password_hash, check_password_hash
from database import (
    get_db_connection,
    get_db_error,
    ensure_documents_schema,
    ensure_institutions_schema,
    ensure_users_schema,
    ensure_profiles_schema,
    insert_document,
    fetch_documents_for_user,
    get_or_create_student_uuid,
    institution_code_variants,
)
from errors import friendly_db_error as _friendly_db_error
from file_storage import save_document_file, find_stored_file, has_stored_file

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


@app.route("/auth/register", methods=["POST"])
def auth_register():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()

    if not email or not full_name or len(password) < 6:
        return jsonify({"error": "E-posta, ad soyad ve en az 6 karakterli şifre gerekli"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı", "details": get_db_error()}), 500

    cur = None
    try:
        ensure_users_schema(conn)
        cur = conn.cursor()
        if _is_sqlite(conn):
            cur.execute(
                _sql(
                    conn,
                    "INSERT INTO users (email, password_hash, full_name) VALUES (%s, %s, %s)",
                ),
                (email, generate_password_hash(password), full_name),
            )
            conn.commit()
            user_id = cur.lastrowid
        else:
            cur.execute(
                _sql(
                    conn,
                    "INSERT INTO users (email, password_hash, full_name) VALUES (%s, %s, %s) RETURNING id",
                ),
                (email, generate_password_hash(password), full_name),
            )
            user_id = cur.fetchone()[0]
            conn.commit()
        get_or_create_student_uuid(conn, email, full_name)
        return jsonify({"message": "Kayıt başarılı", "user": {"id": user_id, "email": email, "full_name": full_name}})
    except Exception as e:
        err = str(e).lower()
        if "unique" in err or "duplicate" in err:
            return jsonify({"error": "Bu e-posta zaten kayıtlı"}), 409
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


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
            _sql(conn, "SELECT id, email, full_name, password_hash FROM users WHERE email = %s"),
            (email,),
        )
        row = cur.fetchone()
        if not row or not check_password_hash(row[3], password):
            return jsonify({"error": "E-posta veya şifre hatalı"}), 401
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
    password = data.get("password") or ""

    if not code or not password:
        return jsonify({"error": "Kurum kodu ve şifre gerekli"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Veritabanı bağlantısı kurulamadı", "details": get_db_error()}), 500

    cur = None
    try:
        ensure_institutions_schema(conn)
        cur = conn.cursor()
        cur.execute(
            _sql(conn, "SELECT id, code, name, password_hash FROM institutions WHERE code = %s"),
            (code,),
        )
        row = cur.fetchone()
        if not row or not check_password_hash(row[3], password):
            return jsonify({"error": "Kurum kodu veya şifre hatalı"}), 401
        return jsonify({
            "message": "Kurum girişi başarılı",
            "institution": {"id": row[0], "code": row[1], "name": row[2]},
        })
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
            )
            save_document_file(doc_id, file.filename, file_content)
            return jsonify({
                "message": "Belge başarıyla yüklendi, kurum onayı bekleniyor.",
                "hash": file_hash,
                "status": "pending",
                "doc_id": doc_id,
                "has_file": True,
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
    conn = get_db_connection()
    if conn:
        cur = None
        try:
            ensure_documents_schema(conn)
            cur = conn.cursor()
            variants = institution_code_variants(institution_name)

            if _is_sqlite(conn):
                placeholders = ", ".join(["?"] * len(variants))
                cur.execute(
                    f"""
                    SELECT id, filename,
                           COALESCE(NULLIF(TRIM(uploader_name), ''), CAST(student_id AS TEXT)) AS uploader,
                           created_at, file_hash
                    FROM documents
                    WHERE target_institution IN ({placeholders}) AND status = 'pending'
                    """,
                    tuple(variants),
                )
            else:
                cur.execute(
                    """
                    SELECT id, filename,
                           COALESCE(
                             NULLIF(TRIM(uploader_name), ''),
                             (SELECT full_name FROM profiles p WHERE p.id = documents.student_id LIMIT 1),
                             student_id::text
                           ) AS uploader,
                           created_at, file_hash
                    FROM documents
                    WHERE target_institution = ANY(%s) AND status = 'pending'
                    """,
                    (variants,),
                )

            docs = cur.fetchall()
            output = []
            for doc in docs:
                output.append(_attach_file_flags({
                    "id": doc[0],
                    "filename": doc[1],
                    "uploader": doc[2] or "Bilinmiyor",
                    "date": str(doc[3]) if doc[3] else None,
                    "file_hash": doc[4],
                }))
            return jsonify(output)
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı."}), 500


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

        stored = find_stored_file(doc_id, row[2], row[1])
        if not stored:
            return jsonify({
                "error": "Dosya arşivde yok. Yalnızca hash kaydı mevcut; belgeyi tekrar yükleyin.",
            }), 404

        resp = send_file(
            stored,
            mimetype=_mimetype_for_filename(row[1]),
            as_attachment=True,
            download_name=row[1],
        )
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Content-Disposition"] = f'inline; filename="{row[1]}"'
        return resp
    except Exception as e:
        return jsonify({"error": _friendly_db_error(e)}), 500
    finally:
        if cur:
            cur.close()
        conn.close()


# --- 3. KURUM TARAFI: ONAY VEYA RED İŞLEMİ ---
@app.route("/update-status", methods=["POST"])
def update_status():
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
                _sql(
                    conn,
                    "UPDATE documents SET status = %s, blockchain_tx_hash = %s WHERE id = %s",
                ),
                (new_status, tx_hash, doc_id)
            )
            conn.commit()
            return jsonify({"message": f"Belge durumu {new_status} olarak güncellendi."})
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı."}), 500

# --- 4. HERKESE AÇIK: BELGE DOĞRULAMA (SORGULAMA) ---
@app.route("/verify/<hash_val>", methods=["GET"])
def verify_doc(hash_val):
    conn = get_db_connection()
    if conn:
        cur = None
        try:
            cur = conn.cursor()
            cur.execute(
                _sql(
                    conn,
                    "SELECT filename, target_institution, status, blockchain_tx_hash FROM documents WHERE file_hash = %s",
                ),
                (hash_val,)
            )
            result = cur.fetchone()
            if result:
                return jsonify({
                    "exists": True,
                    "filename": result[0],
                    "institution": result[1],
                    "status": result[2],
                    "blockchain_info": result[3]
                })
            return jsonify({"exists": False, "message": "Belge bulunamadı veya sahte!"})
        except Exception as e:
            return jsonify({"error": _friendly_db_error(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Sunucuya bağlanılamadı."}), 500

if __name__ == "__main__":
    app.run(debug=True)