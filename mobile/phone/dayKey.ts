// Ключ дня «ГГГГ-ММ-ДД» по местному времени и сдвиг на дни. Отдельный файл без зависимостей: им пользуются и тесты.
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  return x;
}
