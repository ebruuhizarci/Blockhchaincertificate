import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { adminLogin, getAdminToken } from "@/lib/adminAuth";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (getAdminToken()) {
    return <Navigate to="/admin/panel" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminLogin(email, password);
      toast.success("Admin girişi başarılı");
      navigate("/admin/panel");
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
            Admin Girişi
          </h1>
          <p className="mt-2 text-sm italic text-slate-400">
            Kullanıcıları yönetmek için admin hesabınızla giriş yapın.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              required
              placeholder="Admin e-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ether-input"
            />
            <input
              type="password"
              required
              placeholder="Admin şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ether-input"
            />
            {busy ? (
              <Spinner label="Admin girişi yapılıyor..." />
            ) : (
              <button type="submit" className="w-full ether-btn-primary">
                Giriş Yap
              </button>
            )}
          </form>
        </div>
      </div>
    </PageShell>
  );
}
