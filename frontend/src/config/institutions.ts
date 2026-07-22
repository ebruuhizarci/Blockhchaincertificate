export const INSTITUTION_OPTIONS = [
  { code: "BEUN", label: "Zonguldak Bülent Ecevit Üniversitesi" },
  { code: "SAGLIK_BAKANLIGI", label: "Sağlık Bakanlığı" },
  { code: "OZEL_SIRKET", label: "Özel Kurum" },
] as const;

export const INSTITUTION_LABELS: Record<string, string> = Object.fromEntries(
  INSTITUTION_OPTIONS.map((o) => [o.code, o.label])
);
