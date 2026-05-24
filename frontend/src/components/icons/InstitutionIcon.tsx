type Props = {
  className?: string;
};

/** Klasik kurum / üniversite binası simgesi */
export function InstitutionIcon({ className = "h-5 w-5" }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden
    >
      <path d="M3 21h18" />
      <path d="M5 21V10l7-5 7 5v11" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h6" />
      <path d="M12 5v5" />
    </svg>
  );
}
