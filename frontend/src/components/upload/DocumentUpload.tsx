import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { sha256HexFromFile, toBytes32Hex } from "@/lib/hash";
import { addCertificateOnChain, verifyOnChain } from "@/lib/contract";
import { parseBlockchainError } from "@/lib/errors";
import { useAuth } from "@/context/SessionContext";
import {
  fetchPaymentConfig,
  getApiErrorMessage,
  initIyzicoPayment,
  uploadDocumentMeta,
  type PaymentConfig,
} from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { useInstitutionOptions } from "@/hooks/useInstitutionOptions";
import { getAcademicYearOptions } from "@/lib/academicYear";

type PaymentMethod = "card" | "wallet";

type Props = {
  onSuccess?: () => void;
};

export function DocumentUpload({ onSuccess }: Props) {
  const { user } = useAuth();
  const { options: institutionOptions } = useInstitutionOptions();
  const { provider, connect } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [uploader, setUploader] = useState(user?.full_name ?? "");
  const [institution, setInstitution] = useState("BEUN");
  const [academicYear, setAcademicYear] = useState(getAcademicYearOptions()[0]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [payConfig, setPayConfig] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    if (user?.full_name) setUploader(user.full_name);
  }, [user]);

  useEffect(() => {
    void fetchPaymentConfig()
      .then(setPayConfig)
      .catch(() => setPayConfig(null));
  }, []);

  const amountLabel =
    payConfig?.amount_try != null
      ? `${payConfig.amount_try.toFixed(0)} ₺`
      : "50 ₺";

  const cardAvailable =
    payConfig?.relayer_configured &&
    (payConfig?.iyzico_configured || payConfig?.mock_mode);

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

  const payWithCard = async () => {
    if (!user || !file || !hash) return;
    if (!uploader.trim()) {
      toast.error("Ad soyad girin.");
      return;
    }
    if (!cardAvailable) {
      toast.error(
        "Kredi kartı ödemesi yapılandırılmamış. Backend .env dosyasını kontrol edin."
      );
      return;
    }

    setBusy(true);
    try {
      const already = await verifyOnChain(hash);
      if (already) {
        toast("Bu belge zaten blockchain'de kayıtlı.", { icon: "ℹ️" });
        try {
          const meta = await uploadDocumentMeta(
            file,
            uploader,
            institution,
            user.email,
            academicYear
          );
          if (meta.file_archived) toast.success(meta.message ?? "Dosya arşive eklendi");
        } catch (metaErr) {
          toast.error(getApiErrorMessage(metaErr));
        }
        onSuccess?.();
        return;
      }

      toast.loading("Ödeme sayfasına yönlendiriliyorsunuz...", { id: "pay" });
      const init = await initIyzicoPayment(
        file,
        uploader,
        institution,
        user.email,
        academicYear
      );
      toast.dismiss("pay");
      if (payConfig?.mock_mode) {
        toast("Test modu: mock ödeme sayfası açılıyor", { icon: "ℹ️" });
      }
      window.location.href = init.payment_page_url;
    } catch (e) {
      toast.error(getApiErrorMessage(e), { id: "pay" });
    } finally {
      setBusy(false);
    }
  };

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
          const meta = await uploadDocumentMeta(
            file,
            uploader,
            institution,
            user.email,
            academicYear
          );
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
        const meta = await uploadDocumentMeta(
          file,
          uploader,
          institution,
          user.email,
          academicYear
        );
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

  const onSubmit = () => {
    if (paymentMethod === "card") {
      void payWithCard();
    } else {
      void registerOnChain();
    }
  };

  return (
    <div className="glass-panel relative min-h-[520px] p-8 md:p-10">
      {!user && (
        <div className="kilit-ekrani">
          <span className="text-4xl text-indigo-500">🔒</span>
          <h3 className="mt-4 text-xl font-black uppercase">Admin Girişi</h3>
          <p className="mt-2 max-w-xs text-xs text-slate-400">
            Kullanıcıları yönetmek için admin paneline gidin.
          </p>
          <div className="mt-6 flex gap-3">
            <Link to="/admin/giris" className="ether-btn-primary">
              Giriş Yap
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
          {institutionOptions.map((i) => (
            <option key={i.code} value={i.code}>
              {i.label}
            </option>
          ))}
        </select>
        <select
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          disabled={!user}
          className="ether-input"
        >
          {getAcademicYearOptions().map((y) => (
            <option key={y} value={y}>
              Akademik yıl: {y}
            </option>
          ))}
        </select>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Ödeme yöntemi
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!user || !cardAvailable}
              onClick={() => setPaymentMethod("card")}
              className={`rounded-xl border px-4 py-3 text-left text-xs transition ${
                paymentMethod === "card"
                  ? "border-indigo-500/50 bg-indigo-500/15 text-white"
                  : "border-slate-700 text-slate-400 hover:border-slate-600"
              } disabled:opacity-40`}
            >
              <span className="font-black uppercase">Kredi kartı</span>
              <span className="mt-1 block text-slate-400">
                {amountLabel} — iyzico ile güvenli ödeme
                {payConfig?.mock_mode ? " (test)" : ""}
              </span>
            </button>
            <button
              type="button"
              disabled={!user}
              onClick={() => setPaymentMethod("wallet")}
              className={`rounded-xl border px-4 py-3 text-left text-xs transition ${
                paymentMethod === "wallet"
                  ? "border-indigo-500/50 bg-indigo-500/15 text-white"
                  : "border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              <span className="font-black uppercase">Cüzdan (Web3)</span>
              <span className="mt-1 block text-slate-400">
                MetaMask — gas ücreti sizde
              </span>
            </button>
          </div>
          {user && !cardAvailable && (
            <p className="mt-2 text-[11px] text-amber-400/90">
              Kart ödemesi için backend&apos;de RELAYER_PRIVATE_KEY ve iyzico anahtarları
              (veya IYZICO_MOCK=true) gerekir.
            </p>
          )}
        </div>

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
          <Spinner
            label={
              paymentMethod === "card"
                ? "Ödeme hazırlanıyor..."
                : "Blockchain'e yazılıyor..."
            }
          />
        ) : (
          <button
            type="button"
            disabled={!user || !hash || (paymentMethod === "card" && !cardAvailable)}
            onClick={onSubmit}
            className="w-full ether-btn-primary py-5"
          >
            {paymentMethod === "card"
              ? `Kredi kartı ile öde (${amountLabel})`
              : "Cüzdan ile blockchain'e kaydet"}
          </button>
        )}
      </div>
    </div>
  );
}
