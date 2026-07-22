import type { ReactNode } from "react";
import { EtherNavbar } from "@/components/layout/EtherNavbar";
import { BackendBanner } from "@/components/layout/BackendBanner";

type Props = {
  children: ReactNode;
  subtitle?: string;
  /** pt-44 for app pages, pt-56 for landing */
  topPad?: "landing" | "app";
};

export function PageShell({ children, subtitle, topPad = "app" }: Props) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0b0f1a" }}>
      {topPad !== "landing" && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-px w-[120%] -translate-x-1/2 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent" />
          <div className="absolute left-1/2 top-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />
        </div>
      )}
      <EtherNavbar subtitle={subtitle} />
      <BackendBanner />
      <div className={topPad === "landing" ? "pt-44" : "pt-36 md:pt-44"}>
        {children}
      </div>
    </div>
  );
}
