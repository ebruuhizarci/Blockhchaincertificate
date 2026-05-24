import { BrowserProvider, Eip1193Provider } from "ethers";
import { getActiveConfig } from "@/config/contracts";
import { getTargetChain } from "@/config/chains";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean;
      providers?: Eip1193Provider[];
    };
  }
}

/** Birden fazla cüzdan varsa MetaMask'ı tercih et */
export function getMetaMaskProvider(): Eip1193Provider | null {
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    const mm = eth.providers.find(
      (p) => (p as { isMetaMask?: boolean }).isMetaMask
    );
    if (mm) return mm;
  }
  if (eth.isMetaMask) return eth;
  return eth;
}

export async function getWalletChainId(): Promise<number | null> {
  const eip = getMetaMaskProvider();
  if (!eip) return null;
  try {
    const provider = new BrowserProvider(eip);
    const network = await provider.getNetwork();
    return Number(network.chainId);
  } catch {
    return null;
  }
}

export async function connectMetaMask(): Promise<{
  provider: BrowserProvider;
  address: string;
  chainId: number;
}> {
  const eip = getMetaMaskProvider();
  if (!eip) {
    throw new Error("MetaMask bulunamadı. Lütfen MetaMask yükleyin.");
  }

  const provider = new BrowserProvider(eip);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return {
    provider,
    address,
    chainId: Number(network.chainId),
  };
}

export async function switchToChain(chainId: number, rpcUrl: string): Promise<void> {
  const eip = getMetaMaskProvider();
  if (!eip) throw new Error("MetaMask bulunamadı.");

  const hexId = "0x" + chainId.toString(16);

  try {
    await eip.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await eip.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: chainId === 80002 ? "Polygon Amoy" : "Hardhat Local",
            rpcUrls: [rpcUrl],
            nativeCurrency: {
              name: chainId === 80002 ? "POL" : "ETH",
              symbol: chainId === 80002 ? "POL" : "ETH",
              decimals: 18,
            },
            blockExplorerUrls:
              chainId === 80002
                ? ["https://amoy.polygonscan.com"]
                : undefined,
          },
        ],
      });
      await eip.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
      return;
    }
    throw err;
  }
}

/** İşlem öncesi MetaMask'ı kontratın ağına alır; güncel provider döner */
export async function ensureWalletOnTargetChain(): Promise<BrowserProvider> {
  const cfg = getActiveConfig();
  const target = getTargetChain();
  const eip = getMetaMaskProvider();
  if (!eip) {
    throw new Error("MetaMask bulunamadı.");
  }

  let chainId = await getWalletChainId();
  if (chainId !== cfg.chainId) {
    await switchToChain(cfg.chainId, cfg.rpcUrl);
    await new Promise((r) => setTimeout(r, 600));
    chainId = await getWalletChainId();
  }

  if (chainId !== cfg.chainId) {
    throw new Error(
      `MetaMask'ta "${target.name}" (chain ${cfg.chainId}) seçin. Şu an yanlış ağdasınız (${chainId ?? "?"}).`
    );
  }

  return new BrowserProvider(eip);
}
