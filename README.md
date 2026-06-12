# Etherescan — Blockchain Belge Noter Sistemi

PDF belgelerini SHA-256 ile hashleyip Polygon Amoy üzerinde kaydeden; kurum onayında **AES-256-GCM** ile şifreleyen ve AES anahtarını kurum **RSA** anahtarıyla koruyan; kurum onayı ve kullanıcı belge listesi sunan tam yığın uygulama.

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

## Kredi kartı ile mühürleme (iyzico)

Belge başına **50 ₺** sabit ücret. Ödeme onaylandıktan hemen sonra sunucu cüzdanı (relayer) belgeyi Polygon Amoy’a yazar.

1. [iyzico sandbox](https://sandbox-merchant.iyzipay.com) hesabından API anahtarlarını alın.
2. `backend/.env` içine ekleyin (`backend/.env.example` satırlarına bakın):
   - `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`
   - `RELAYER_PRIVATE_KEY` — Amoy’da MATIC bulunan deploy cüzdanının private key’i
   - `BACKEND_PUBLIC_URL` — iyzico callback için **dışarıdan erişilebilir** URL (yerelde [ngrok](https://ngrok.com) gerekir)
3. Yerel test için gerçek iyzico olmadan: `IYZICO_MOCK=true` (otomatik mock ödeme + zincir yazımı).

```powershell
cd backend
pip install -r ..\requirements.txt
python app.py
```

Arayüzde **Kredi kartı** veya **Cüzdan (Web3)** seçilebilir.

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
