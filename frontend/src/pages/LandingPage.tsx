import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";

const stats = [
  { icon: "🛡️", value: "12.5 s", label: "Blok Onay Süresi", color: "text-emerald-400" },
  { icon: "🔒", value: "SHA-256", label: "Şifreleme Standardı", color: "text-indigo-400" },
  { icon: "⛓️", value: "1M+", label: "Aktif Düğüm (Node)", color: "text-purple-400" },
  { icon: "🌐", value: "Amoy", label: "Testnet Altyapısı", color: "text-sky-400" },
];

export function LandingPage() {
  return (
    <PageShell topPad="landing">
      <section className="relative px-6 pb-16 pt-12 text-center">
        <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-400">
          Ethereum · Polygon Amoy
        </p>
        <div className="relative z-10 mx-auto mt-6 max-w-5xl">
          <h1 className="text-5xl font-black uppercase italic leading-none tracking-tight text-white md:text-7xl lg:text-8xl">
            Dijital Kimliğiniz
          </h1>
          <div
            className="pointer-events-none relative my-6 md:my-8"
            aria-hidden
          >
            <div className="mx-auto h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-amber-200/25 to-transparent" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.06] blur-2xl" />
          </div>
          <h1 className="overflow-visible text-5xl font-black uppercase italic leading-none tracking-tight md:text-7xl lg:text-8xl">
            <span className="text-mor-neon">Blockchain</span>{" "}
            <span className="text-white">Altında.</span>
          </h1>
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-lg italic text-slate-400">
          Belgelerinizi Ethereum ağının sarsılmaz güvenliği ile mühürleyin.
          Etherescan ile sahteciliğe son verin.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <Link to="/uygulama" className="ether-btn-primary px-10 py-4">
            Hemen Doğrula
          </Link>
          <Link to="/uygulama" className="ether-btn-secondary px-10 py-4">
            Sistemi Başlat
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass-panel p-6 text-center">
            <span className="text-2xl">{s.icon}</span>
            <p className={`mt-3 text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {s.label}
            </p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">
        © 2024 Etherescan · Polygon Amoy · React
      </footer>
    </PageShell>
  );
}
