// Журнал ошибок на телефоне: последние сбои хранятся здесь и уходят разработчику только по кнопке
// «Поделиться» в настройках, после того как человек сам увидел текст отчёта. Личные записи в журнал не пишутся:
// сохраняются только тип ошибки, короткое сообщение и первые строки трассировки.
declare const __APP_BUILD__: string;

const KEY = "navigator:errors";
const MAX = 40;

export interface LoggedError {
  at: string;
  message: string;
  where?: string;
}

function short(s: unknown, n: number): string {
  return String(s ?? "").replace(/\s+/g, " ").slice(0, n);
}

export function readErrors(): LoggedError[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function logError(error: unknown, where?: string) {
  try {
    const e: any = error;
    const message = short(e?.name && e?.message ? `${e.name}: ${e.message}` : e?.message ?? e, 240);
    const stack = typeof e?.stack === "string" ? e.stack.split("\n").slice(1, 4).map((l: string) => short(l, 120)).join(" | ") : "";
    const list = readErrors();
    list.push({ at: new Date().toISOString(), message: stack ? `${message} @ ${stack}` : message, where });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* журнал не должен сам ломать приложение */
  }
}

export function clearErrors() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ничего не делаем */
  }
}

export function installErrorLog() {
  window.addEventListener("error", (ev) => logError(ev.error ?? ev.message, "окно"));
  window.addEventListener("unhandledrejection", (ev) => logError(ev.reason, "обещание"));
}

export function buildReport(extra: Record<string, string | number>): string {
  const lines = [
    "Отчёт о проблеме. Навигатор Жизни",
    `Сборка: ${typeof __APP_BUILD__ === "undefined" ? "?" : __APP_BUILD__}`,
    `Система: ${short(navigator.userAgent, 200)}`,
    `Время: ${new Date().toISOString()}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    "",
    "Последние ошибки:",
  ];
  const errors = readErrors();
  if (errors.length === 0) lines.push("(нет)");
  for (const e of errors) lines.push(`${e.at} ${e.where ? `[${e.where}] ` : ""}${e.message}`);
  return lines.join("\n");
}
