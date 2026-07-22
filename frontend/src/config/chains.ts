import { getActiveConfig } from "./contracts";

export type ChainMeta = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

export const SUPPORTED_CHAINS: Record<number, ChainMeta> = {
  31337: {
    chainId: 31337,
    name: "Hardhat Local",
    rpcUrl: "http://127.0.0.1:8545",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    rpcUrl: "https://rpc-amoy.polygon.technology",
    explorerUrl: "https://amoy.polygonscan.com",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  },
};

export function getTargetChain(): ChainMeta {
  const cfg = getActiveConfig();
  return (
    SUPPORTED_CHAINS[cfg.chainId] ?? {
      chainId: cfg.chainId,
      name: `Chain ${cfg.chainId}`,
      rpcUrl: cfg.rpcUrl,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    }
  );
}
