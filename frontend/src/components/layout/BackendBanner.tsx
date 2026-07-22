import { useEffect, useState } from "react";
import { checkBackendHealth } from "@/lib/http";

export function BackendBanner() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    void checkBackendHealth().then(setOk);
    const id = setInterval(() => void checkBackendHealth().then(setOk), 15000);
    return () => clearInterval(id);
  }, []);

  if (ok === null || ok) return null;

  return (
    <div className="fixed left-0 right-0 top-[72px] z-[150] border-b border-amber-500/30 bg-amber-950/90 px-4 py-2 text-center text-xs text-amber-200 backdrop-blur">
      <strong>Sunucu bağlantısı yok.</strong>{" "}
      <code className="text-amber-100">cd backend && python app.py</code>
    </div>
  );
}
