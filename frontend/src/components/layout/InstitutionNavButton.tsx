import { Link } from "react-router-dom";
import { InstitutionIcon } from "@/components/icons/InstitutionIcon";
import { useSession } from "@/context/SessionContext";

export function InstitutionNavButton() {
  const { mode } = useSession();
  const to = mode === "institution" ? "/kurum/panel" : "/kurum/giris";
  const title =
    mode === "institution" ? "Kurum onay paneli" : "Kurum girişi";

  return (
    <Link
      to={to}
      title={title}
      aria-label={title}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 text-slate-300 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300"
    >
      <InstitutionIcon className="h-5 w-5" />
    </Link>
  );
}
