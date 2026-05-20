const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("EthdocsRegistry deploy ediliyor...");

  const registry = await hre.ethers.deployContract("EthdocsRegistry");
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  const outPath = path.join(__dirname, "..", "deployed-address.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        contractName: "EthdocsRegistry",
        address,
        chainId: Number(network.chainId),
        network: hre.network.name,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`Deploy tamamlandı: ${address}`);
  console.log(`Kayıt: ${outPath}`);
  console.log("Frontend senkronu için: npm run sync:frontend");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
