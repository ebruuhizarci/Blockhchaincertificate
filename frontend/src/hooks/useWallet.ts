import { useCallback, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import toast from "react-hot-toast";
import { getActiveConfig } from "@/config/contracts";
import { getTargetChain } from "@/config/chains";
import {
  connectMetaMask,
  getMetaMaskProvider,
  switchToChain,
} from "@/lib/wallet";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [connecting, setConnecting] = useState(false);

  const target = getTargetChain();
  const config = getActiveConfig();

  const refresh = useCallback(async () => {
    try {
      const eip = getMetaMaskProvider();
      if (!eip) return;
      const p = new BrowserProvider(eip);
      const accounts = await p.send("eth_accounts", []);
      if (!accounts?.length) {
        setAddress(null);
        setProvider(null);
        setChainId(null);
        return;
      }
      const network = await p.getNetwork();
      setProvider(p);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
    } catch {
      setAddress(null);
      setProvider(null);
      setChainId(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const eip = getMetaMaskProvider();
    eip?.on?.("accountsChanged", refresh);
    eip?.on?.("chainChanged", refresh);
    return () => {
      eip?.removeListener?.("accountsChanged", refresh);
      eip?.removeListener?.("chainChanged", refresh);
    };
  }, [refresh]);

  const connect = useCallback(async (): Promise<BrowserProvider> => {
    setConnecting(true);
    try {
      let { provider: p, address: addr, chainId: cid } =
        await connectMetaMask();

      if (cid !== config.chainId) {
        await switchToChain(config.chainId, config.rpcUrl);
        cid = config.chainId;
        p = new BrowserProvider(getMetaMaskProvider()!);
      }

      setProvider(p);
      setAddress(addr);
      setChainId(cid);
      toast.success("MetaMask bağlandı");
      return p;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [config.chainId, config.rpcUrl]);

  const isCorrectNetwork = chainId === config.chainId;

  return {
    address,
    chainId,
    provider,
    connecting,
    connect,
    refresh,
    isCorrectNetwork,
    targetChainName: target.name,
    configChainId: config.chainId,
  };
}
