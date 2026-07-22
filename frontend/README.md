# Etherdocs Frontend (React + TypeScript)

Modern Web3 arayüzü: MetaMask, client-side hash, blockchain doğrulama.

## Kurulum

```bash
cd frontend
npm install
```

## Çalıştırma

**Terminal 1 — Backend:**
```bash
cd ../backend
python app.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Tarayıcı: http://localhost:5173

| Sayfa | URL |
|-------|-----|
| Tanıtım | `/` |
| Giriş | `/giris` |
| Üye ol | `/uye-ol` |
| Uygulama | `/uygulama` |

## Kontrat adresi / ABI güncelleme

Deploy sonrası (`etherdocs-contracts` klasöründe):

```bash
npm run sync:frontend
```

Bu komut `frontend/config/contracts.json` dosyasını günceller. Uygulama otomatik okur.

Manuel override için `.env` dosyasına `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, `VITE_RPC_URL` ekleyin.

## Klasör yapısı

```
frontend/
├── config/
│   └── contracts.json      # ABI + adres (sync ile güncellenir)
├── src/
│   ├── config/             # contracts.ts, chains.ts
│   ├── lib/                # wallet, contract, hash, api
│   ├── hooks/              # useWallet
│   └── components/
│       ├── wallet/         # MetaMask bağlantısı
│       ├── upload/         # PDF drag-drop + hash
│       ├── verify/         # Google tarzı arama
│       └── ui/             # Spinner
├── legacy/                 # Eski HTML arayüz
└── package.json
```

## Ağlar

| Chain ID | Ağ |
|----------|-----|
| 31337 | Hardhat Local |
| 80002 | Polygon Amoy |
| 137 | Polygon Mainnet |
