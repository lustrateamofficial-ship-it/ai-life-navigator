// Обратная связь на действия: короткая вибрация и подпись «Готово». Вибрацию можно выключить в настройках.
const KEY = "navigator:haptics";

export function hapticsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHaptics(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    /* хранилище недоступно: настройка не сохранится */
  }
}

export const TOAST_EVENT = "navigator:toast";

/** Показывает короткую подпись внизу экрана. Работает с любого места приложения. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}
