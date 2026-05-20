import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * EthdocsRegistry kontratını deploy eder.
 * Kullanım: npx hardhat ignition deploy ignition/modules/Sertifika.ts --network localhost
 */
const SertifikaModule = buildModule("SertifikaModule", (m) => {
  const registry = m.contract("EthdocsRegistry");

  return { registry };
});

export default SertifikaModule;
