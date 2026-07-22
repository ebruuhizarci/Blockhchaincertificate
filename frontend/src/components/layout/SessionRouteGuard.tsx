import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { getStoredUser } from "@/lib/auth";

type Props = {
  children: ReactNode;
  /** Kurum oturumundayken bu sayfaya girmesin */
  blockInstitution?: boolean;
  /** Sadece kurum oturumu gerekir */
  institutionOnly?: boolean;
  /** Üye girişi zorunlu */
  requireUser?: boolean;
};

export function SessionRouteGuard({
  children,
  blockInstitution,
  institutionOnly,
  requireUser,
}: Props) {
  const { mode, user } = useSession();
  const activeUser = user ?? getStoredUser();

  if (blockInstitution && mode === "institution") {
    return <Navigate to="/kurum/panel" replace />;
  }
  if (requireUser && !activeUser) {
    return <Navigate to="/giris" replace />;
  }
  if (institutionOnly) {
    if (mode === "user") return <Navigate to="/belgelerim" replace />;
    if (mode !== "institution") return <Navigate to="/kurum/giris" replace />;
  }

  return <>{children}</>;
}
