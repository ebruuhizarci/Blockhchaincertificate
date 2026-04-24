from flask import Flask, request, jsonify
from flask_cors import CORS
import hashlib
# Kendi oluşturduğun database.py dosyasından bağlantı fonksiyonunu çağırıyoruz
from database import get_db_connection 

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return "Backend Çalışıyor 🚀"

@app.route("/upload", methods=["POST"])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Dosya adı boş"}), 400

    # 1. Dosyayı oku ve hash hesapla
    file_content = file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    # 2. Veritabanına bağlan ve kaydet
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor()
            # SQL sorgusu: documents tablosuna dosya adı ve hash'i ekle
            cur.execute(
                "INSERT INTO documents (filename, file_hash) VALUES (%s, %s)",
                (file.filename, file_hash)
            )
            conn.commit() # Değişiklikleri onayla
            cur.close()
            conn.close()
            status_message = "Dosya başarıyla veritabanına kaydedildi!"
        except Exception as e:
            status_message = f"Veritabanı hatası: {str(e)}"
    else:
        status_message = "Veritabanına bağlanılamadı!"

    return jsonify({
        "message": status_message,
        "filename": file.filename,
        "hash": file_hash
    })

if __name__ == "__main__":
    app.run(debug=True)