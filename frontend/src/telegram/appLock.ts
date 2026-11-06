// Настройка блокировки входа. Хранится только на этом устройстве (localStorage), потому что
// биометрия тоже привязана к устройству. localStorage в некоторых окружениях недоступен,
// поэтому все обращения защищены: без него блокировка просто считается выключенной.

const KEY = "navigator:app-lock";

export function isLockEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setLockEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // нечего делать: хранилище недоступно
  }
}

// Сколько приложение может быть свёрнуто, прежде чем снова потребуется подтверждение.
export const RELOCK_AFTER_MS = 2 * 60 * 1000;
