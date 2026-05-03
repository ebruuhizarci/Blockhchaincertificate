const hre = require("hardhat");

async function main() {
  console.log("🚀 EthdocsRegistry yükleniyor...");

  const ethdocs = await hre.ethers.deployContract("EthdocsRegistry");
  await ethdocs.waitForDeployment();

  console.log(`🎉 Başarıyla yüklendi! Adres: ${await ethdocs.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});