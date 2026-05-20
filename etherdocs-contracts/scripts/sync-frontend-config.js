/**
 * Deploy sonrası kontrat adresi ve ABI'yı frontend'e yazar.
 * Ignition (öncelikli) veya artifacts/deployed-address.json kaynaklarını kullanır.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT, "..", "frontend");
const CONTRACT_NAME = "EthdocsRegistry";
const IGNITION_KEY = "SertifikaModule#EthdocsRegistry";

const RPC_BY_CHAIN = {
  31337: "http://127.0.0.1:8545",
  80002: "https://rpc-amoy.polygon.technology",
  137: "https://polygon-rpc.com",
};

/** Önce Amoy (prod test), sonra localhost */
const CHAIN_PRIORITY = [80002, 137, 31337];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findIgnitionDeployment() {
  const deploymentsDir = path.join(ROOT, "ignition", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    return null;
  }

  const found = [];

  for (const dirent of fs.readdirSync(deploymentsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const chain = dirent.name;
    const addressesPath = path.join(
      deploymentsDir,
      chain,
      "deployed_addresses.json"
    );
    if (!fs.existsSync(addressesPath)) continue;

    const addresses = readJson(addressesPath);
    const address = addresses[IGNITION_KEY];
    if (!address) continue;

    const chainId = chain.startsWith("chain-")
      ? Number(chain.replace("chain-", ""))
      : 31337;
    found.push({ address, chainId, source: `ignition/${chain}` });
  }

  if (found.length === 0) return null;

  for (const preferred of CHAIN_PRIORITY) {
    const match = found.find((d) => d.chainId === preferred);
    if (match) return match;
  }

  return found[0];
}

function findManualDeployment() {
  const manualPath = path.join(ROOT, "deployed-address.json");
  if (!fs.existsSync(manualPath)) {
    return null;
  }

  const data = readJson(manualPath);
  if (!data.address) {
    return null;
  }

  return {
    address: data.address,
    chainId: data.chainId ?? 31337,
    source: "deployed-address.json",
  };
}

function loadAbi() {
  const artifactPath = path.join(
    ROOT,
    "artifacts",
    "contracts",
    `${CONTRACT_NAME}.sol`,
    `${CONTRACT_NAME}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Artifact bulunamadı: ${artifactPath}\nÖnce "npm run compile" çalıştırın.`
    );
  }

  const artifact = readJson(artifactPath);
  return artifact.abi;
}

function main() {
  const deployment = findIgnitionDeployment() ?? findManualDeployment();

  if (!deployment) {
    console.error(
      "Deploy kaydı bulunamadı. Önce şunlardan birini çalıştırın:\n" +
        "  npm run deploy:ignition\n" +
        "  npm run deploy:script"
    );
    process.exit(1);
  }

  const abi = loadAbi();
  const config = {
    contractName: CONTRACT_NAME,
    address: deployment.address,
    chainId: deployment.chainId,
    rpcUrl: RPC_BY_CHAIN[deployment.chainId] ?? "http://127.0.0.1:8545",
    abi,
    updatedAt: new Date().toISOString(),
    source: deployment.source,
  };

  fs.mkdirSync(path.join(FRONTEND_DIR, "config"), { recursive: true });
  fs.mkdirSync(path.join(FRONTEND_DIR, "js"), { recursive: true });

  const jsonPath = path.join(FRONTEND_DIR, "config", "contracts.json");
  fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2));

  const constantsJs = `// Otomatik üretildi — elle düzenlemeyin. Güncellemek için: npm run sync:frontend
window.ETHERDOCS_CONFIG = ${JSON.stringify(
    {
      CONTRACT_NAME: config.contractName,
      CONTRACT_ADDRESS: config.address,
      CHAIN_ID: config.chainId,
      RPC_URL: config.rpcUrl,
      CONTRACT_ABI: config.abi,
    },
    null,
    2
  )};
`;

  const constantsPath = path.join(FRONTEND_DIR, "js", "constants.js");
  fs.writeFileSync(constantsPath, constantsJs);

  console.log("Frontend konfigürasyonu güncellendi:");
  console.log(`  Adres : ${config.address}`);
  console.log(`  Chain : ${config.chainId}`);
  console.log(`  JSON  : ${jsonPath}`);
  console.log(`  JS    : ${constantsPath}`);
}

main();
