export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
}
export function matchesSearch(query: string, ...values: (string | undefined)[]): boolean {
  const needle = normalizeSearch(query);
  return !needle || values.some(value => normalizeSearch(value || '').includes(needle));
}
