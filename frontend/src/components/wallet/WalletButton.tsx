import { shortenAddress } from "@/lib/hash";
import { useWallet } from "@/hooks/useWallet";
import { Spinner } from "@/components/ui/Spinner";
import { getActiveConfig } from "@/config/contracts";
import { switchToChain } from "@/lib/wallet";
import toast from "react-hot-toast";

export function WalletButton() {
  const {
    address,
    connecting,
    connect,
    isCorrectNetwork,
    targetChainName,
    chainId,
    refresh,
  } = useWallet();

  if (connecting) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">
        <Spinner className="scale-75" />
      </div>
    );
  }

  if (!address) {
    return (
      <button
        type="button"
        onClick={() => connect()}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-indigo-500"
      >
        Cüzdan Bağla
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-right sm:flex-row sm:items-center sm:gap-2">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Cüzdan
        </p>
        <p className="font-mono text-xs font-bold text-white">
          {shortenAddress(address, 5)}
        </p>
      </div>
      <button
        type="button"
        title={
          isCorrectNetwork
            ? targetChainName
            : "Polygon Amoy'a geçmek için tıklayın"
        }
        onClick={() => {
          if (isCorrectNetwork) return;
          const cfg = getActiveConfig();
          void switchToChain(cfg.chainId, cfg.rpcUrl)
            .then(() => refresh())
            .then(() => toast.success("Polygon Amoy ağına geçildi"))
            .catch((e) => toast.error((e as Error).message));
        }}
        className={`rounded-lg px-2 py-0.5 text-[9px] font-black uppercase ${
          isCorrectNetwork
            ? "bg-emerald-500/20 text-emerald-400"
            : "cursor-pointer bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
        }`}
      >
        {isCorrectNetwork ? targetChainName : `Yanlış ağ · tıkla`}
      </button>
    </div>
  );
}
