import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { InstitutionIcon } from "@/components/icons/InstitutionIcon";
import { INSTITUTION_OPTIONS } from "@/config/institutions";
import { useInstitution, useSession } from "@/context/SessionContext";
import { Spinner } from "@/components/ui/Spinner";

export function InstitutionLoginPage() {
  const { mode, user } = useSession();
  const { institution, login } = useInstitution();
  const navigate = useNavigate();
  const [code, setCode] = useState("BEUN");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (institution) {
    return <Navigate to="/kurum/panel" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(code, password);
      toast.success("Kurum girişi başarılı");
      navigate("/kurum/panel");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="glass-panel p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400">
            <InstitutionIcon className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-center text-2xl font-black uppercase text-white">
            Kurumsal Giriş
          </h1>
          <p className="mt-2 text-center text-sm italic text-slate-400">
            Onay bekleyen belgeleri yönetin
          </p>
          {mode === "user" && user && (
            <p className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <strong>{user.full_name}</strong> oturumu kapanacak.
            </p>
          )}
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="ether-input"
            >
              {INSTITUTION_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="password"
              required
              minLength={6}
              placeholder="Kurum şifresi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ether-input"
            />
            {busy ? (
              <Spinner label="Giriş yapılıyor..." />
            ) : (
              <button type="submit" className="w-full ether-btn-primary">
                Kurumsal Giriş
              </button>
            )}
          </form>
          <p className="mt-4 rounded-2xl bg-slate-900/80 px-3 py-2 text-xs text-slate-500">
            Demo: BEUN <strong className="text-slate-300">beun123</strong> · Sağlık{" "}
            <strong className="text-slate-300">saglik123</strong> · Özel{" "}
            <strong className="text-slate-300">ozel123</strong>
          </p>
          <p className="mt-4 text-center text-sm text-slate-400">
            <Link to="/giris" className="font-bold text-indigo-400 hover:underline">
              Bireysel giriş
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
