import { useState } from "react";
import { Navigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { InstitutionRegistryPanel } from "@/components/institution/InstitutionRegistryPanel";
import { PendingApprovalsPanel } from "@/components/institution/PendingApprovalsPanel";
import { useInstitution } from "@/context/SessionContext";

type Tab = "approvals" | "registry";

export function InstitutionDashboard() {
  const { institution } = useInstitution();
  const [tab, setTab] = useState<Tab>("approvals");

  if (!institution) {
    return <Navigate to="/kurum/giris" replace />;
  }

  return (
    <PageShell subtitle={`${institution.code} YETKİLİSİ`}>
      <main className="mx-auto max-w-4xl px-6 pb-24">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black uppercase text-white">
            Kurum Onay Paneli
          </h1>
          <p className="mt-2 text-sm italic text-slate-400">{institution.name}</p>
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={
              tab === "approvals"
                ? "ether-btn-primary !py-2 !px-4"
                : "ether-btn-secondary !py-2 !px-4"
            }
            onClick={() => setTab("approvals")}
          >
            Onay Bekleyenler
          </button>
          <button
            type="button"
            className={
              tab === "registry"
                ? "ether-btn-primary !py-2 !px-4"
                : "ether-btn-secondary !py-2 !px-4"
            }
            onClick={() => setTab("registry")}
          >
            Resmi Kayıt Defteri
          </button>
        </div>

        {tab === "approvals" ? (
          <PendingApprovalsPanel
            institutionCode={institution.code}
            institutionName={institution.name}
          />
        ) : (
          <InstitutionRegistryPanel
            institutionCode={institution.code}
            institutionName={institution.name}
          />
        )}
      </main>
    </PageShell>
  );
}
