import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth, useSession } from "@/context/SessionContext";
import { Spinner } from "@/components/ui/Spinner";

export function RegisterPage() {
  const { mode } = useSession();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
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
      await register(email, password, fullName);
      toast.success("Kayıt başarılı! Hoş geldiniz.");
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
            Üye Ol
          </h1>
          <p className="mt-2 text-sm italic text-slate-400">
            Ücretsiz hesap oluşturun ve belgelerinizi blockchain'e kaydedin.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="text"
              required
              placeholder="Ad Soyad"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="ether-input"
            />
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
              placeholder="Şifre (en az 6 karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ether-input"
            />
            {busy ? (
              <Spinner label="Kayıt oluşturuluyor..." />
            ) : (
              <button type="submit" className="w-full ether-btn-primary">
                Üye Ol
              </button>
            )}
          </form>
          <p className="mt-4 text-center text-sm text-slate-400">
            Zaten üye misiniz?{" "}
            <Link to="/giris" className="font-bold text-indigo-400 hover:underline">
              Giriş yapın
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
