/** Akademik yıl seçenekleri (Eylül başlangıç varsayımı). */
export function getAcademicYearOptions(): string[] {
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    `${startYear}-${startYear + 1}`,
    `${startYear - 1}-${startYear}`,
    `${startYear + 1}-${startYear + 2}`,
  ];
}
