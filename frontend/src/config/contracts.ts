/**
 * Merkezi kontrat yapılandırması.
 * Deploy sonrası: etherdocs-contracts içinde `npm run sync:frontend`
 * Bu dosya otomatik güncellenir: frontend/config/contracts.json
 */
import contractsJson from "../../config/contracts.json";

export type ContractsConfig = {
  contractName: string;
  address: string;
  chainId: number;
  rpcUrl: string;
  abi: readonly object[];
  updatedAt?: string;
  source?: string;
};

export const CONTRACTS: ContractsConfig = contractsJson as ContractsConfig;

/** Vite ortam değişkenleri ile override (isteğe bağlı) */
export function getActiveConfig(): ContractsConfig {
  const address = import.meta.env.VITE_CONTRACT_ADDRESS;
  const chainId = import.meta.env.VITE_CHAIN_ID;
  const rpcUrl = import.meta.env.VITE_RPC_URL;

  if (address && chainId && rpcUrl) {
    return {
      ...CONTRACTS,
      address,
      chainId: Number(chainId),
      rpcUrl,
    };
  }
  return CONTRACTS;
}
