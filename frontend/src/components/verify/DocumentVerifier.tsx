import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  isFileHashLike,
  isTxHashLike,
  sha256HexFromFile,
} from "@/lib/hash";
import { verifyOnChain } from "@/lib/contract";
import { parseBlockchainError } from "@/lib/errors";
import { verifyDocumentOffChain, ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { getTargetChain } from "@/config/chains";
import { INSTITUTION_LABELS } from "@/config/institutions";

type VerifyResult = {
  onChain: boolean;
  offChain: boolean;
  institution?: string;
  filename?: string;
  status?: string;
  tx?: string | null;
  backendOffline?: boolean;
};

type Props = {
  initialHash?: string;
  verifyTick?: number;
};

export function DocumentVerifier({ initialHash = "", verifyTick = 0 }: Props) {
  const [query, setQuery] = useState(initialHash);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const chain = getTargetChain();

  const runVerify = async (fileHash: string) => {
    if (isTxHashLike(fileHash)) {
      toast.error("İşlem (TX) hash değil, dosya SHA-256 hash girin.");
      return;
    }
    if (!isFileHashLike(fileHash)) {
      toast.error("64 karakterlik geçerli bir dosya hash girin.");
      return;
    }

    const clean = fileHash.replace(/^0x/i, "");
    setLoading(true);
    setResult(null);

    try {
      const onChain = await verifyOnChain(clean);
      let offChain = false;
      let institution: string | undefined;
      let filename: string | undefined;
      let status: string | undefined;
      let tx: string | null | undefined;

      let backendOffline = false;
      try {
        const db = await verifyDocumentOffChain(clean);
        offChain = !!db.exists;
        institution = db.institution;
        filename = db.filename;
        status = db.status;
        tx = db.blockchain_info ?? null;
      } catch (err) {
        backendOffline = err instanceof ApiError && err.code === "BACKEND_OFFLINE";
        if (!backendOffline) {
          toast.error((err as Error).message);
        }
      }

      setResult({
        onChain,
        offChain,
        institution,
        filename,
        status,
        tx,
        backendOffline,
      });

      if (!onChain) {
        toast.error("Bu hash blockchain'de kayıtlı değil.");
      } else if (status === "pending") {
        toast.success("Zincirde kayıtlı — kurum onayı bekleniyor", {
          icon: "⏳",
        });
      } else if (status === "approved") {
        toast.success("Geçerli ve kurum tarafından onaylı");
      } else {
        toast.success("Zincirde kayıt bulundu");
      }
    } catch (e) {
      toast.error(parseBlockchainError(e));
    } finally {
      setLoading(false);
    }
  };

  const onFileScan = async (file: File) => {
    const h = await sha256HexFromFile(file);
    setQuery(h);
    await runVerify(h);
  };

  useEffect(() => {
    if (initialHash) {
      setQuery(initialHash);
      void runVerify(initialHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHash, verifyTick]);

  const display = result ? getVerificationDisplay(result) : null;

  return (
    <div className="glass-panel min-h-[520px] p-8 md:p-10">
      <h4 className="panel-title-emerald">🔍 Belge Doğrulama Servisi</h4>
      <p className="mt-2 text-center text-[10px] italic text-slate-500">
        Hash veya PDF · {chain.name}
      </p>

      <div className="mt-8 space-y-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void runVerify(query)}
          placeholder="Dosya SHA-256 hash (64 karakter)..."
          className="ether-input font-mono text-xs"
        />

        <div
          onClick={() => document.getElementById("verify-file")?.click()}
          className="ether-dropzone"
        >
          <input
            id="verify-file"
            type="file"
            accept="application/pdf,.pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileScan(f);
            }}
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 italic">
            Belgeyi Yükle — hash otomatik
          </p>
        </div>

        {loading ? (
          <Spinner label="Sorgulanıyor..." />
        ) : (
          <button
            type="button"
            onClick={() => void runVerify(query)}
            disabled={!query.trim()}
            className="w-full ether-btn-emerald"
          >
            Sorgula
          </button>
        )}

        {display && !loading && (
          <div
            className={`rounded-3xl border-2 p-6 text-center text-[11px] font-bold break-all ${display.boxClass}`}
          >
            <p className="text-2xl">{display.icon}</p>
            <p className={`mt-2 text-sm font-black uppercase ${display.titleClass}`}>
              {display.title}
            </p>
            {display.subtitle && (
              <p className="mt-2 text-xs font-normal opacity-80">{display.subtitle}</p>
            )}
            <ul className="mt-4 space-y-1 text-left text-xs font-normal">
              <li>
                <strong>Zincir:</strong> {result!.onChain ? "Kayıtlı" : "Yok"}
              </li>
              {result!.institution && (
                <li>
                  <strong>Kurum:</strong>{" "}
                  {INSTITUTION_LABELS[result!.institution] ?? result!.institution}
                </li>
              )}
              {result!.filename && (
                <li>
                  <strong>Dosya:</strong> {result!.filename}
                </li>
              )}
              {result!.status && (
                <li>
                  <strong>Durum:</strong> {formatStatus(result!.status)}
                </li>
              )}
            </ul>
            {result!.backendOffline && (
              <p className="mt-3 text-left text-[10px] text-amber-300">
                Backend kapalı — sadece zincir sonucu gösterildi.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "Kurum onayı bekleniyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
  };
  return map[status] ?? status;
}

function getVerificationDisplay(result: VerifyResult) {
  if (!result.onChain) {
    return {
      icon: "✕",
      title: "Geçersiz: Veri Kaydı Bulunamadı",
      subtitle: "Bu belge blockchain kayıtlarında yok.",
      boxClass: "border-red-500/30 bg-red-500/10 text-red-400",
      titleClass: "text-red-400",
    };
  }

  if (result.status === "rejected") {
    return {
      icon: "✕",
      title: "Kurum Tarafından Reddedildi",
      subtitle: "Zincirde kayıt var ancak onaylanmamış.",
      boxClass: "border-red-500/30 bg-red-500/10 text-red-400",
      titleClass: "text-red-400",
    };
  }

  if (result.status === "pending") {
    return {
      icon: "⏳",
      title: "Zincirde Kayıtlı — Onay Bekliyor",
      subtitle: "Kurum onayı henüz tamamlanmadı.",
      boxClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      titleClass: "text-amber-300",
    };
  }

  if (result.status === "approved") {
    return {
      icon: "✓",
      title: "Veri Doğrulandı: Orijinal Belge",
      subtitle: "Blockchain ve kurum kayıtları uyumlu.",
      boxClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
      titleClass: "text-emerald-400",
    };
  }

  return {
    icon: "✓",
    title: "Blockchain'de Kayıtlı",
    subtitle: "Belge hash'i zincirde doğrulandı.",
    boxClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    titleClass: "text-emerald-400",
  };
}
