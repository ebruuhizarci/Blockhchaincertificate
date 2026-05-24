type Props = {
  label?: string;
  className?: string;
};

export function Spinner({ label, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center gap-3 py-6 ${className}`}>
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-400"
        aria-hidden
      />
      {label && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </p>
      )}
    </div>
  );
}
