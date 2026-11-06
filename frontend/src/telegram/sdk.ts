// Тонкая обёртка над Telegram WebApp JS API (подключён в index.html через telegram-web-app.js).
// Не тянем весь @telegram-apps/sdk, чтобы не усложнять MVP — используем window.Telegram.WebApp напрямую.

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: Record<string, unknown>;
        ready: () => void;
        expand: () => void;
        colorScheme: "light" | "dark";
        themeParams: Record<string, string>;
        isVersionAtLeast?: (version: string) => boolean;
        BiometricManager?: {
          isInited: boolean;
          isBiometricAvailable: boolean;
          isAccessGranted: boolean;
          init: (cb?: () => void) => void;
          requestAccess: (params: { reason?: string }, cb?: (granted: boolean) => void) => void;
          authenticate: (params: { reason?: string }, cb?: (ok: boolean) => void) => void;
        };
        onEvent?: (event: string, cb: () => void) => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
        MainButton: {
          show: () => void;
          hide: () => void;
          setText: (t: string) => void;
          onClick: (cb: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
          selectionChanged: () => void;
        };
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
      };
    };
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function initTelegramApp() {
  const wa = getTelegramWebApp();
  if (!wa) {
    console.warn("[telegram] Telegram WebApp SDK не найден — приложение открыто вне Telegram?");
    return;
  }
  wa.ready();
  wa.expand();
  syncTheme();
  // Человек может сменить тему Telegram, пока приложение открыто.
  wa.onEvent?.("themeChanged", syncTheme);
}

// Светлая/тёмная тема приложения повторяет тему Telegram (стили читают data-theme на <html>),
// а верхняя панель и фон Telegram красятся в цвет приложения, чтобы не было «шва» вокруг экрана.
function syncTheme() {
  const wa = getTelegramWebApp();
  if (!wa) return;
  document.documentElement.dataset.theme = wa.colorScheme === "dark" ? "dark" : "light";
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (/^#[0-9a-f]{6}$/i.test(bg)) {
    try {
      wa.setHeaderColor?.(bg);
      wa.setBackgroundColor?.(bg);
    } catch {
      // старые версии Telegram не поддерживают произвольный цвет, это не критично
    }
  }
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

// Haptic feedback — тактильный отклик на действия (раздел "рекомендации разработчика":
// три строчки кода, а ощущение "нативности" Mini App совсем другое). Вне Telegram
// (разработка в обычном браузере) HapticFeedback просто не существует — все три функции
// тихо ничего не делают вместо падения.
export function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: "success" | "error" | "warning") {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
}

export function hapticSelection() {
  getTelegramWebApp()?.HapticFeedback?.selectionChanged();
}

// Открывает внешнюю ссылку (например, страницу авторизации Google) в системном браузере —
// обычный <a href> или window.open внутри Telegram Mini App часто не работает как ожидается,
// нужен именно нативный метод Telegram WebApp.
export function openExternalLink(url: string) {
  const wa = getTelegramWebApp();
  if (wa?.openLink) {
    wa.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

// ── Биометрия Telegram (Face ID, отпечаток) для блокировки входа в приложение ──
// Нужна версия Telegram с поддержкой BiometricManager (7.2+). На старых версиях и вне Telegram
// биометрия считается недоступной.

function biometricManager() {
  const wa = getTelegramWebApp();
  if (!wa || !wa.isVersionAtLeast?.("7.2")) return null;
  return wa.BiometricManager ?? null;
}

// Обёртка с ограничением по времени: если Telegram не вызвал callback, не висим вечно.
function withTimeout<T>(run: (done: (v: T) => void) => void, fallback: T, ms = 60_000): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    run((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

export async function isBiometricAvailable(): Promise<boolean> {
  const m = biometricManager();
  if (!m) return false;
  if (!m.isInited) await withTimeout<void>((done) => m.init(() => done()), undefined, 10_000);
  return Boolean(m.isBiometricAvailable);
}

export async function biometricAuthenticate(reason: string): Promise<boolean> {
  const m = biometricManager();
  if (!m || !(await isBiometricAvailable())) return false;
  const granted = m.isAccessGranted || (await withTimeout<boolean>((done) => m.requestAccess({ reason }, done), false));
  if (!granted) return false;
  return withTimeout<boolean>((done) => m.authenticate({ reason }, done), false);
}
