import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { useSession } from "@/context/SessionContext";
import { Spinner } from "@/components/ui/Spinner";

type Step = "form" | "verify";

export function RegisterPage() {
  const { mode, startRegistration, verifyRegistration } = useSession();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [devCodes, setDevCodes] = useState<{ sms?: string; email?: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  if (mode === "institution") {
    return <Navigate to="/kurum/panel" replace />;
  }

  const onStartSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await startRegistration(email, password, fullName, phone);
      setSessionId(result.session_id);
      if (result.mock_mode && result.dev_sms_code && result.dev_email_code) {
        setDevCodes({
          sms: result.dev_sms_code,
          email: result.dev_email_code,
        });
      } else {
        setDevCodes(null);
      }
      setStep("verify");
      toast.success("Doğrulama kodları gönderildi.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyRegistration(sessionId, smsCode, emailCode);
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
            {step === "form"
              ? "Ücretsiz hesap oluşturun ve belgelerinizi blockchain'e kaydedin."
              : "Test modunda kodlar ekranda ve backend terminalinde görünür; gerçek SMS/e-posta gitmez."}
          </p>

          {step === "form" ? (
            <form onSubmit={onStartSubmit} className="mt-6 space-y-4">
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
                type="tel"
                required
                placeholder="Telefon (05XX XXX XX XX)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="ether-input"
                autoComplete="tel"
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
                <Spinner label="Kodlar gönderiliyor..." />
              ) : (
                <button type="submit" className="w-full ether-btn-primary">
                  Doğrulama Kodlarını Gönder
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={onVerifySubmit} className="mt-6 space-y-4">
              {devCodes && (
                <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-100">
                  <p className="font-semibold text-indigo-200">
                    Test modu — gerçek SMS/e-posta gönderilmedi
                  </p>
                  <p className="mt-1 text-slate-300">
                    Aşağıdaki kodları ilgili alanlara yazın veya otomatik doldurun.
                  </p>
                  <p className="mt-2 font-mono">SMS: {devCodes.sms}</p>
                  <p className="font-mono">E-posta: {devCodes.email}</p>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg border border-indigo-400/40 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-500/20"
                    onClick={() => {
                      setSmsCode(devCodes.sms ?? "");
                      setEmailCode(devCodes.email ?? "");
                    }}
                  >
                    Kodları otomatik doldur
                  </button>
                </div>
              )}
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="SMS doğrulama kodu"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                className="ether-input"
              />
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="E-posta doğrulama kodu"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
                className="ether-input"
              />
              {busy ? (
                <Spinner label="Doğrulanıyor..." />
              ) : (
                <button type="submit" className="w-full ether-btn-primary">
                  Doğrula ve Üye Ol
                </button>
              )}
              <button
                type="button"
                className="w-full text-sm text-slate-400 hover:text-white"
                onClick={() => {
                  setStep("form");
                  setSmsCode("");
                  setEmailCode("");
                  setSessionId("");
                  setDevCodes(null);
                }}
              >
                Bilgileri düzenle
              </button>
            </form>
          )}

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
