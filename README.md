# Etherescan — Blockchain Belge Noter Sistemi

PDF belgelerini SHA-256 ile hashleyip Polygon Amoy üzerinde kaydeden; kurum onayı ve kullanıcı belge listesi sunan tam yığın uygulama.

## Yapı

| Klasör | Açıklama |
|--------|----------|
| `frontend/` | React + Vite arayüz |
| `backend/` | Flask API |
| `etherdocs-contracts/` | Hardhat akıllı kontrat |

## Hızlı başlangıç

### 1. Backend

```powershell
cd backend
copy .env.example .env
# .env içine Supabase bilgilerinizi yazın
pip install -r ..\requirements.txt
python app.py
```

### 2. Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Tarayıcı: http://localhost:5173

### 3. Kontrat (isteğe bağlı)

```powershell
cd etherdocs-contracts
npm install
copy .env.example .env
npm run setup:local
```

## Önemli notlar

- **Gizli bilgiler:** `.env` dosyalarını GitHub'a yüklemeyin. Örnekler: `backend/.env.example`, `frontend/.env.example`.
- **Yüklenen PDF'ler:** `backend/uploads/` yerel arşivdir; repoya eklenmez.
- **Demo kurum şifreleri:** BEUN `beun123`, Sağlık `saglik123`, Özel `ozel123` (sadece geliştirme).

## GitHub'a yükleme

Proje kökünde:

```powershell
git init
git add .
git status
git commit -m "Initial commit: Etherescan belge noter sistemi"
git branch -M main
git remote add origin https://github.com/KULLANICI/REPO.git
git push -u origin main
```

`git status` çıktısında `.env`, `node_modules`, `backend/uploads/*.pdf` görünmemeli.
