from flask import Flask, request, jsonify
from flask_cors import CORS
import hashlib
from database import get_db_connection, get_db_error

app = Flask(__name__)
CORS(app)


def _is_sqlite(conn):
    return conn.__class__.__module__.startswith("sqlite3")


def _sql(conn, query):
    # SQLite'da placeholder `%s` yerine `?` kullanılmalı.
    if _is_sqlite(conn):
        return query.replace("%s", "?")
    return query

@app.route("/")
def home():
    return "Belge Doğrulama Backend Sistemi Aktif 🚀"

# --- 1. KULLANICI TARAFI: BELGE YÜKLEME ---
@app.route("/upload", methods=["POST"])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400
    
    file = request.files['file']
    # Kullanıcı ve kurum bilgilerini frontend'den alıyoruz
    uploader_name = request.form.get('uploader_name', 'Bilinmiyor')
    target_institution = request.form.get('target_institution', 'Genel')

    if file.filename == '':
        return jsonify({"error": "Dosya adı boş"}), 400

    file_content = file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    conn = get_db_connection()
    if conn:
        cur = None
        try:
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
                return jsonify({
                    "error": "Bu dosya zaten sisteme yüklenmiş (aynı içerik).",
                    "message": (
                        f"Kayıt: {existing[1]} | Durum: {existing[2]} | "
                        f"Kurum: {existing[3]}. Bekleyen listeden onaylayabilir veya farklı bir dosya deneyebilirsiniz."
                    ),
                    "hash": file_hash,
                    "doc_id": existing[0],
                    "status": existing[2],
                }), 409

            cur.execute(
                _sql(
                    conn,
                    "INSERT INTO documents (filename, file_hash, uploader_name, target_institution, status) VALUES (%s, %s, %s, %s, 'pending')",
                ),
                (file.filename, file_hash, uploader_name, target_institution)
            )
            conn.commit()
            return jsonify({
                "message": "Belge başarıyla yüklendi, kurum onayı bekleniyor.",
                "hash": file_hash,
                "status": "pending"
            })
        except Exception as e:
            err = str(e).lower()
            if "unique" in err or "duplicate" in err:
                return jsonify({
                    "error": "Bu dosya zaten kayıtlı (aynı hash).",
                    "hash": file_hash,
                }), 409
            return jsonify({"error": f"Veritabanı hatası: {str(e)}"}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Veritabanı bağlantısı kurulamadı!", "details": get_db_error()}), 500

# --- 2. KURUM TARAFI: BEKLEYEN BELGELERİ LİSTELE ---
@app.route("/pending-docs/<institution_name>", methods=["GET"])
def get_pending_docs(institution_name):
    conn = get_db_connection()
    if conn:
        cur = None
        try:
            cur = conn.cursor()
            # Sadece o kuruma ait ve beklemede olanları çekiyoruz
            cur.execute(
                _sql(
                    conn,
                    "SELECT id, filename, uploader_name, created_at, file_hash FROM documents WHERE target_institution = %s AND status = 'pending'",
                ),
                (institution_name,)
            )
            docs = cur.fetchall()
            output = []
            for doc in docs:
                output.append({
                    "id": doc[0],
                    "filename": doc[1],
                    "uploader": doc[2],
                    "date": doc[3],
                    "file_hash": doc[4]
                })
            return jsonify(output)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Bağlantı hatası", "details": get_db_error()}), 500

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
            return jsonify({"error": str(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Bağlantı hatası", "details": get_db_error()}), 500

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
            return jsonify({"error": str(e)}), 500
        finally:
            if cur:
                cur.close()
            conn.close()
    return jsonify({"error": "Bağlantı hatası", "details": get_db_error()}), 500

if __name__ == "__main__":
    app.run(debug=True)