import { useEffect } from "react";

export type ConfirmTone = "danger" | "warning" | "default";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const toneStyles: Record<
  ConfirmTone,
  { icon: string; border: string; confirmClass: string }
> = {
  danger: {
    icon: "⚠",
    border: "border-red-500/40",
    confirmClass:
      "rounded-2xl border border-red-500/40 bg-red-500/15 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-red-500/25 disabled:opacity-50",
  },
  warning: {
    icon: "🔑",
    border: "border-amber-500/40",
    confirmClass:
      "rounded-2xl border border-amber-500/40 bg-amber-500/15 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/25 disabled:opacity-50",
  },
  default: {
    icon: "?",
    border: "border-indigo-500/40",
    confirmClass: "ether-btn-primary !py-2.5 disabled:opacity-50",
  },
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "İptal",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const styles = toneStyles[tone];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className={`relative w-full max-w-md rounded-3xl border bg-slate-900/95 p-6 shadow-2xl shadow-black/50 ${styles.border}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${
              tone === "danger"
                ? "bg-red-500/15 text-red-300"
                : tone === "warning"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-indigo-500/15 text-indigo-300"
            }`}
          >
            {styles.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-sm font-black uppercase tracking-wide text-white"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-message"
              className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-400"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="ether-btn-secondary !py-2.5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={styles.confirmClass}
          >
            {busy ? "İşleniyor..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
