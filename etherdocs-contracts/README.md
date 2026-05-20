# Etherdocs Contracts (Hardhat + Ignition)

## Hızlı kurulum (yeni bilgisayar)

```bash
cd etherdocs-contracts
npm install
```

Terminal 1 — yerel blockchain:

```bash
npm run node
```

Terminal 2 — deploy + frontend senkronu:

```bash
npm run setup:local
```

Bu komut sırasıyla derler, `EthdocsRegistry` kontratını localhost'a deploy eder ve adres/ABI'yı `frontend/js/constants.js` ile `frontend/config/contracts.json` dosyalarına yazar.

## Manuel adımlar

```bash
npm run compile
npm run deploy:ignition      # Ignition ile deploy
npm run sync:frontend        # Adres + ABI → frontend

# Alternatif (klasik script):
npm run deploy:script
npm run sync:frontend
```

## Klasör yapısı

```
etherdocs-contracts/
├── contracts/
│   └── EthdocsRegistry.sol
├── ignition/
│   └── modules/
│       └── Sertifika.ts      # Ignition deploy modülü
├── scripts/
│   ├── deploy.js
│   └── sync-frontend-config.js
└── hardhat.config.ts
```

## Amoy testnet

`.env` dosyasına `PRIVATE_KEY` ve `AMOY_RPC_URL` ekleyin, ardından:

```bash
npx hardhat ignition deploy ignition/modules/Sertifika.ts --network amoy
npx hardhat run scripts/sync-frontend-config.js
```
