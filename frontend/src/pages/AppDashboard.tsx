import { Link, useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { DocumentVerifier } from "@/components/verify/DocumentVerifier";
import { DocumentUpload } from "@/components/upload/DocumentUpload";
import { useAuth } from "@/context/SessionContext";

export function AppDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <PageShell subtitle="Belge Mühürleme">
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            Belge Mühürleme
          </h1>
          <p className="mt-3 text-sm italic text-slate-400">
            PDF yükleyin ve blockchain&apos;e kaydedin.
          </p>
          {user && (
            <Link
              to="/belgelerim"
              className="mt-4 inline-block text-sm font-bold text-indigo-400 hover:underline"
            >
              Belgelerime git →
            </Link>
          )}
        </div>

        {!user && (
          <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center text-sm text-amber-200">
            Belge mühürlemek için{" "}
            <Link to="/giris" className="font-bold underline">
              giriş yapın
            </Link>{" "}
            veya{" "}
            <Link to="/uye-ol" className="font-bold underline">
              üye olun
            </Link>
            .
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-2">
          <DocumentUpload onSuccess={() => navigate("/belgelerim")} />
          <DocumentVerifier />
        </div>
      </main>
    </PageShell>
  );
}
