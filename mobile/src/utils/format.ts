// Числа в русском виде: «20 000», «82,4». Не больше одного знака после запятой.
const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
export function formatNumber(n: number): string {
  return nf.format(n);
}

// Удаление нельзя отменить, поэтому просим подтвердить. Так случайное нажатие не стирает записи.
// Если удалённое уходит в корзину, так и говорим: тогда решение не страшное.
export function confirmDelete(what: string, recoverable = false): boolean {
  return window.confirm(`${what}\n${recoverable ? "Удалённое можно вернуть из корзины в течение 30 дней." : "Это нельзя отменить."}`);
}

// Сегодняшняя дата ГГГГ-ММ-ДД по местному времени телефона (а не по UTC: ночью UTC уже или ещё в другом дне).
export function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
