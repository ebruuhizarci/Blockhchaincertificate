from flask import Flask, request, jsonify
from flask_cors import CORS
import hashlib

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return "Backend Çalışıyor 🚀"

@app.route("/upload", methods=["POST"])
def upload_file():
    # Frontend'den 'file' adıyla bir dosya gelip gelmediğini kontrol et
    if 'file' not in request.files:
        return jsonify({"error": "Dosya seçilmedi"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "Dosya adı boş"}), 400

    # Dosyanın içeriğini oku ve SHA-256 hash'ini hesapla
    file_content = file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    # Şimdilik sadece hash değerini döndürüyoruz
    # İleride bu hash değerini Blockchain'e ve PostgreSQL'e kaydedeceğiz
    return jsonify({
        "message": "Dosya başarıyla işlendi",
        "filename": file.filename,
        "hash": file_hash
    })

if __name__ == "__main__":
    app.run(debug=True)