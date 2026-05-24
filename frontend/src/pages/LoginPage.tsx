import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth, useSession } from "@/context/SessionContext";
import { Spinner } from "@/components/ui/Spinner";

export function LoginPage() {
  const { mode } = useSession();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (mode === "institution") {
    return <Navigate to="/kurum/panel" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Giriş başarılı");
      navigate("/belgelerim");
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
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            Giriş Yap
          </h1>
          <p className="mt-2 text-sm italic text-slate-400">
            Bireysel hesabınızla belgelerinizi yönetin.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              required
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ether-input"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ether-input"
            />
            {busy ? (
              <Spinner label="Giriş yapılıyor..." />
            ) : (
              <button type="submit" className="w-full ether-btn-primary">
                Giriş Yap
              </button>
            )}
          </form>
          <p className="mt-4 text-center text-sm text-slate-400">
            Hesabınız yok mu?{" "}
            <Link to="/uye-ol" className="font-bold text-indigo-400 hover:underline">
              Üye olun
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
