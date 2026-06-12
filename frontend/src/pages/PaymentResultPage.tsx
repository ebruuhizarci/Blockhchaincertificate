import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { fetchPaymentSession, type PaymentSessionStatus } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/http";

export function PaymentResultPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session") ?? "";
  const statusParam = params.get("status") ?? "";
  const [session, setSession] = useState<PaymentSessionStatus | null>(null);
  const [loading, setLoading] = useState(!!sessionId);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      try {
        const data = await fetchPaymentSession(sessionId);
        if (cancelled) return;
        setSession(data);
        if (data.status === "completed" || data.status === "failed") {
          setLoading(false);
          if (data.status === "completed") {
            toast.success("Ödeme alındı, belge mühürlendi.");
          } else if (data.error) {
            toast.error(data.error);
          }
          return;
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(e));
          setLoading(false);
        }
        return;
      }

      attempts += 1;
      if (attempts < 20 && !cancelled) {
        window.setTimeout(() => void poll(), 1500);
      } else if (!cancelled) {
        setLoading(false);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const success =
    statusParam === "success" ||
    session?.status === "completed";
  const failed =
    statusParam === "error" ||
    session?.status === "failed";

  return (
    <PageShell>
      <div className="mx-auto max-w-lg glass-panel p-10 text-center">
        {loading ? (
          <Spinner label="Ödeme ve blockchain kaydı tamamlanıyor..." />
        ) : success ? (
          <>
            <p className="text-4xl text-emerald-400">✓</p>
            <h1 className="mt-4 text-xl font-black uppercase text-white">
              Ödeme başarılı
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Belgeniz blockchain&apos;e yazıldı ve kurum onayına gönderildi.
            </p>
            {session?.blockchain_tx && (
              <p className="mt-4 break-all font-mono text-[11px] text-indigo-300">
                TX: {session.blockchain_tx}
              </p>
            )}
            <Link to="/belgelerim" className="ether-btn-primary mt-8 inline-block">
              Belgelerime git
            </Link>
          </>
        ) : failed ? (
          <>
            <p className="text-4xl text-red-400">✕</p>
            <h1 className="mt-4 text-xl font-black uppercase text-white">
              İşlem tamamlanamadı
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              {session?.error ??
                params.get("reason") ??
                "Ödeme veya mühürleme başarısız oldu."}
            </p>
            <Link to="/uygulama" className="ether-btn-secondary mt-8 inline-block">
              Tekrar dene
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-black uppercase text-white">
              Ödeme sonucu
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Oturum bilgisi bulunamadı.
            </p>
            <Link to="/uygulama" className="ether-btn-primary mt-8 inline-block">
              Uygulamaya dön
            </Link>
          </>
        )}
      </div>
    </PageShell>
  );
}
