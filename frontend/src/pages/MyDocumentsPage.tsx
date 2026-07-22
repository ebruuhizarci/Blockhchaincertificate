import { useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { MyDocumentsPanel } from "@/components/documents/MyDocumentsPanel";
import { useAuth } from "@/context/SessionContext";

export function MyDocumentsPage() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!user) {
    return null;
  }

  return (
    <PageShell subtitle="Belgelerim">
      <main className="mx-auto max-w-4xl px-6 pb-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">
              Belgelerim
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Yüklediğiniz tüm belgeler ve onay durumları.
            </p>
          </div>
          <Link to="/uygulama" className="ether-btn-secondary !py-2">
            Yeni belge mühürle
          </Link>
        </div>

        <MyDocumentsPanel
          uploaderName={user.full_name}
          userEmail={user.email}
          refreshKey={refreshKey}
          fullPage
          onDocumentsChange={() => setRefreshKey((k) => k + 1)}
        />
      </main>
    </PageShell>
  );
}
