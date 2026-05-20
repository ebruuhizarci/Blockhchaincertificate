import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

function getDeployerAccounts(): string[] {
  const raw = process.env.PRIVATE_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!raw) return [];

  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
      throw new Error(
        "PRIVATE_KEY alanına cüzdan adresi yazılmış. MetaMask'tan Private Key export edip .env dosyasına yapıştırın (0x + 64 hex)."
      );
    }
    throw new Error(
      "PRIVATE_KEY geçersiz. 0x ile başlayan 64 hex karakter olmalı (toplam 66 karakter)."
    );
  }

  return [raw];
}

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: getDeployerAccounts(),
      chainId: 80002,
    },
  },
};

export default config;
