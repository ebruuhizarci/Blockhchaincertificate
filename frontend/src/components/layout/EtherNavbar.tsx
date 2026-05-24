import { Link } from "react-router-dom";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useSession } from "@/context/SessionContext";

type Props = {
  subtitle?: string;
};

export function EtherNavbar({ subtitle }: Props) {
  const { mode, user, institution, logoutUser, logoutInstitution } = useSession();

  const label =
    subtitle ??
    (mode === "institution" && institution
      ? `${institution.code} YETKİLİSİ`
      : "Blockchain Noter Altyapısı");

  const showWallet = mode === "user" && !!user;

  return (
    <nav className="ether-nav px-6 py-4 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="text-3xl text-indigo-500 animate-pulse" aria-hidden>
            ◆
          </span>
          <div className="flex flex-col">
            <span className="text-xl font-black uppercase italic leading-none tracking-tighter">
              ETHERESCAN
            </span>
            <span className="text-[8px] font-bold uppercase italic tracking-[0.3em] text-emerald-500">
              {label}
            </span>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {mode === "institution" && institution ? (
            <>
              <span className="hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 sm:inline">
                {institution.code}
              </span>
              <button
                type="button"
                onClick={logoutInstitution}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-[10px] font-black uppercase shadow-lg hover:bg-red-500"
              >
                Güvenli Çıkış
              </button>
            </>
          ) : mode === "user" && user ? (
            <>
              <span className="hidden text-xs text-slate-400 sm:inline">
                {user.full_name}
              </span>
              <button
                type="button"
                onClick={logoutUser}
                className="rounded-xl border border-slate-600 px-4 py-2 text-[10px] font-black uppercase text-slate-300 hover:bg-slate-800"
              >
                Çıkış
              </button>
              <Link to="/belgelerim" className="ether-btn-primary !px-5 !py-2.5">
                Belgelerim
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/giris"
                className="rounded-xl border border-slate-600 px-4 py-2 text-[10px] font-black uppercase text-slate-300 hover:bg-slate-800"
              >
                Üye Girişi
              </Link>
              <Link to="/kurum/giris" className="ether-btn-primary !px-5 !py-2.5">
                Kurumsal Giriş
              </Link>
            </>
          )}
          {showWallet && <WalletButton />}
        </div>
      </div>
    </nav>
  );
}
