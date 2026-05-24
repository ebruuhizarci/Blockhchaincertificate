import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { sha256HexFromFile, toBytes32Hex } from "@/lib/hash";
import { addCertificateOnChain, verifyOnChain } from "@/lib/contract";
import { parseBlockchainError } from "@/lib/errors";
import { useAuth } from "@/context/SessionContext";
import { uploadDocumentMeta, getApiErrorMessage } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { INSTITUTION_OPTIONS } from "@/config/institutions";

type Props = {
  onSuccess?: () => void;
};

export function DocumentUpload({ onSuccess }: Props) {
  const { user } = useAuth();
  const { provider, connect } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [uploader, setUploader] = useState(user?.full_name ?? "");
  const [institution, setInstitution] = useState("BEUN");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.full_name) setUploader(user.full_name);
  }, [user]);

  const processFile = useCallback(async (f: File) => {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Lütfen PDF dosyası yükleyin.");
      return;
    }
    setFile(f);
    const h = await sha256HexFromFile(f);
    setHash(h);
    toast.success("Hash tarayıcıda hesaplandı");
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) void processFile(f);
    },
    [processFile]
  );

  const registerOnChain = async () => {
    if (!user) {
      toast.error("Belge kaydetmek için giriş yapın veya üye olun.");
      return;
    }
    if (!file || !hash) {
      toast.error("Önce PDF yükleyin.");
      return;
    }
    if (!uploader.trim()) {
      toast.error("Ad soyad girin.");
      return;
    }

    setBusy(true);
    try {
      const already = await verifyOnChain(hash);
      if (already) {
        toast("Bu belge zaten blockchain'de kayıtlı.", { icon: "ℹ️", id: "tx" });
        try {
          const meta = await uploadDocumentMeta(file, uploader, institution, user.email);
          if (meta.file_archived) {
            toast.success(meta.message ?? "Dosya arşive eklendi");
          } else {
            toast(meta.message ?? meta.error ?? "Kayıt zaten mevcut", { icon: "ℹ️" });
          }
        } catch (metaErr) {
          toast.error(getApiErrorMessage(metaErr));
        }
        onSuccess?.();
        return;
      }

      if (!provider) {
        await connect();
      }

      const { ensureWalletOnTargetChain } = await import("@/lib/wallet");
      const walletProvider = await ensureWalletOnTargetChain();

      toBytes32Hex(hash);

      toast.loading("MetaMask onayı bekleniyor...", { id: "tx" });
      const txHash = await addCertificateOnChain(walletProvider, hash);
      toast.success(`Blockchain kaydı tamam! TX: ${txHash.slice(0, 14)}...`, {
        id: "tx",
      });

      try {
        const meta = await uploadDocumentMeta(file, uploader, institution, user.email);
        if (meta.error) {
          toast(meta.message ?? meta.error, { icon: "ℹ️" });
        } else {
          toast.success(meta.message ?? "Sunucu kaydı alındı");
        }
      } catch (metaErr) {
        toast.error(getApiErrorMessage(metaErr));
      }

      onSuccess?.();
    } catch (e) {
      toast.error(parseBlockchainError(e), { id: "tx" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-panel relative min-h-[520px] p-8 md:p-10">
      {!user && (
        <div className="kilit-ekrani">
          <span className="text-4xl text-indigo-500">🔒</span>
          <h3 className="mt-4 text-xl font-black uppercase">Yönetici Girişi</h3>
          <p className="mt-2 max-w-xs text-xs text-slate-400">
            Belge mühürlemek için bireysel hesap gerekir
          </p>
          <div className="mt-6 flex gap-3">
            <Link to="/giris" className="ether-btn-primary">
              Giriş Yap
            </Link>
            <Link to="/uye-ol" className="ether-btn-secondary">
              Üye Ol
            </Link>
          </div>
        </div>
      )}

      <h4 className="panel-title-indigo">● Belge Mühürleme Servisi</h4>

      <div className="mt-8 space-y-6">
        <input
          type="text"
          placeholder="Belge Sahibi Adı"
          value={uploader}
          onChange={(e) => setUploader(e.target.value)}
          disabled={!user}
          className="ether-input"
        />
        <select
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          disabled={!user}
          className="ether-input"
        >
          {INSTITUTION_OPTIONS.map((i) => (
            <option key={i.code} value={i.code}>
              {i.label}
            </option>
          ))}
        </select>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => user && document.getElementById("pdf-input")?.click()}
          className={`ether-dropzone ${dragOver ? "border-indigo-500/50 bg-indigo-500/10" : ""} ${!user ? "pointer-events-none opacity-40" : ""}`}
        >
          <input
            id="pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void processFile(f);
            }}
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 italic">
            {file ? `SEÇİLDİ: ${file.name}` : "Dosya Seçin — PDF"}
          </p>
        </div>

        {hash && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              SHA-256
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-indigo-300">
              {hash}
            </p>
          </div>
        )}

        {busy ? (
          <Spinner label="Blockchain'e yazılıyor..." />
        ) : (
          <button
            type="button"
            disabled={!user || !hash}
            onClick={() => void registerOnChain()}
            className="w-full ether-btn-primary py-5"
          >
            Blockchain'e Kaydet
          </button>
        )}
      </div>
    </div>
  );
}
