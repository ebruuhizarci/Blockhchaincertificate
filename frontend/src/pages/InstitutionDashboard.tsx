import { Navigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { PendingApprovalsPanel } from "@/components/institution/PendingApprovalsPanel";
import { useInstitution } from "@/context/SessionContext";

export function InstitutionDashboard() {
  const { institution } = useInstitution();

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
        <PendingApprovalsPanel
          institutionCode={institution.code}
          institutionName={institution.name}
        />
      </main>
    </PageShell>
  );
}
