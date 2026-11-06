// Связь с Android-оболочкой (Capacitor). В обычном браузере ничего из этого не работает,
// и приложение молча использует веб-способы. Плагины берутся из глобального объекта Capacitor,
// поэтому в браузерную сборку они не попадают и размер не растёт.
import { prisma } from "./prisma";
import { ready } from "./server";
import { addDays, bedtimeNotice, buildBrief, morningNotice, readDaily, refreshWeather } from "./daily";
import { EVENING_BODY, EVENING_TITLE, eveningParts, readEvening } from "./evening";
import { computeNextTrigger } from "../../backend/src/utils/reminderRecurrence";

export function isNative(): boolean {
  try {
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function plugin(name: string): any | null {
  try {
    return (window as any).Capacitor?.Plugins?.[name] ?? null;
  } catch {
    return null;
  }
}

// ── Уведомления: планируются в системе и приходят, даже когда приложение закрыто ──

export async function nativeNotificationState(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  const p = plugin("LocalNotifications");
  if (!p) return "unsupported";
  try {
    const r = await p.checkPermissions();
    return r.display === "granted" ? "granted" : r.display === "denied" ? "denied" : "prompt";
  } catch {
    return "unsupported";
  }
}

export async function nativeAskNotifications(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  const p = plugin("LocalNotifications");
  if (!p) return "unsupported";
  try {
    await p.requestPermissions();
  } catch {
    /* состояние узнаем ниже */
  }
  const state = await nativeNotificationState();
  if (state === "granted") void syncNativeReminders();
  return state;
}

const AHEAD_PER_REMINDER = 6; // для повторяющихся заранее планируем несколько ближайших раз
const MAX_TOTAL = 60;

// Идентификатор для системы должен быть целым числом: берём его из текста идентификатора и номера повтора.
function numericId(id: string, n: number): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2_000_000) * 10 + n;
}

let syncing: Promise<void> | null = null;

// Пересоздаёт все будущие системные уведомления по списку напоминаний. Вызывается при запуске,
// при возврате в приложение и после любого изменения напоминаний.
export function syncNativeReminders(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  syncing = (syncing ?? Promise.resolve()).then(doSync, doSync);
  return syncing;
}

async function doSync() {
  const p = plugin("LocalNotifications");
  if (!p) return;
  try {
    if ((await nativeNotificationState()) !== "granted") return;
    await ready();
    const pending = await p.getPending();
    if (pending?.notifications?.length) await p.cancel({ notifications: pending.notifications.map((n: any) => ({ id: n.id })) });
    const now = new Date();
    const rows = await prisma.reminder.findMany({ where: { active: true }, orderBy: { triggerAt: "asc" } });
    const list: any[] = [];
    for (const r of rows) {
      let at: Date = r.triggerAt;
      for (let n = 0; n < (r.recurrence === "once" ? 1 : AHEAD_PER_REMINDER); n++) {
        let guard = 0;
        while (at <= now && r.recurrence !== "once" && guard++ < 500) at = computeNextTrigger(at, r.recurrence);
        if (at > now) {
          list.push({
            id: numericId(r.id, n),
            title: "Напоминание",
            body: r.title,
            schedule: { at: new Date(at.getTime()), allowWhileIdle: true },
          });
        }
        if (r.recurrence === "once") break;
        at = computeNextTrigger(at, r.recurrence);
      }
    }
    list.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
    const toSchedule = list.slice(0, MAX_TOTAL);
    const evening = readEvening();
    if (evening.enabled) {
      // Повторяется каждый день в одно и то же время; отдельный номер, чтобы не пересекаться с напоминаниями.
      // Если запись за сегодня уже есть, а время вопроса ещё не наступило, первое уведомление переносим на завтра.
      const { hour, minute } = eveningParts(evening);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      let schedule: any = { on: { hour, minute }, allowWhileIdle: true };
      if (today > now) {
        const wrote = await prisma.journalEntry.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } });
        if (wrote > 0) schedule = { at: new Date(today.getTime() + 24 * 3600_000), every: "day", allowWhileIdle: true };
      }
      toSchedule.push({ id: 2_100_000_000, title: EVENING_TITLE, body: EVENING_BODY, schedule });
    }
    await refreshWeather().catch(() => false);
    toSchedule.push(...(await dailyNotifications(now)));
    if (toSchedule.length) await p.schedule({ notifications: toSchedule });
  } catch {
    /* система не приняла уведомления: останется плашка внутри приложения */
  }
}

// ── Копия данных: файл во временную папку и системное меню «Поделиться» (там есть Google Диск) ──

export async function nativeShareText(fileName: string, text: string): Promise<boolean> {
  const fs = plugin("Filesystem");
  const share = plugin("Share");
  if (!fs || !share) return false;
  const written = await fs.writeFile({ path: fileName, data: text, directory: "CACHE", encoding: "utf8" });
  await share.share({ title: "Копия данных Навигатора Жизни", url: written.uri, dialogTitle: "Куда сохранить копию" });
  return true;
}

// Двоичный файл (книга EPUB): передаётся как base64, чтобы система получила его без изменений.
export async function nativeShareBinary(fileName: string, bytes: Uint8Array, title: string): Promise<boolean> {
  const fs = plugin("Filesystem");
  const share = plugin("Share");
  if (!fs || !share) return false;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const written = await fs.writeFile({ path: fileName, data: btoa(bin), directory: "CACHE" });
  await share.share({ title, url: written.uri, dialogTitle: "Куда сохранить книгу" });
  return true;
}

// ── Блокировка по отпечатку или лицу через системный запрос ──

export async function nativeBiometricAvailable(): Promise<boolean | null> {
  const p = plugin("BiometricAuth");
  if (!p) return null;
  try {
    const r = await p.checkBiometry();
    return Boolean(r?.isAvailable);
  } catch {
    return false;
  }
}

export async function nativeBiometricAuth(reason: string): Promise<boolean> {
  const p = plugin("BiometricAuth");
  if (!p) return false;
  try {
    await p.authenticate({ reason, cancelTitle: "Отмена", allowDeviceCredential: true });
    return true;
  } catch {
    return false;
  }
}

// ── Установка обновления: свой плагин ApkInstaller (создаётся при сборке, см. tools/android-prepare.cjs) ──

function apkPlugin(): any | null {
  try {
    const cap = (window as any).Capacitor;
    return cap?.Plugins?.ApkInstaller ?? cap?.registerPlugin?.("ApkInstaller") ?? null;
  } catch {
    return null;
  }
}

export async function nativeApkCanInstall(): Promise<boolean> {
  try {
    return Boolean((await apkPlugin()?.canInstall())?.allowed);
  } catch {
    return false;
  }
}

export async function nativeApkOpenInstallSettings(): Promise<void> {
  try {
    await apkPlugin()?.openInstallSettings();
  } catch {
    /* окно настроек не открылось: человек может разрешить установку вручную */
  }
}

// Скачивает файл обновления во внутренний кэш приложения. Возвращает число байт.
export async function nativeApkDownload(url: string, onProgress: (received: number, total: number) => void): Promise<number> {
  const p = apkPlugin();
  if (!p) throw new Error("Установка обновлений здесь недоступна");
  const handle = await p.addListener?.("progress", (e: { received: number; total: number }) => onProgress(e.received, e.total));
  try {
    const r = await p.download({ url });
    return Number(r?.size ?? 0);
  } finally {
    try {
      await handle?.remove?.();
    } catch {
      /* слушатель уже снят */
    }
  }
}

export async function nativeApkInstall(): Promise<void> {
  const p = apkPlugin();
  if (!p) throw new Error("Установка обновлений здесь недоступна");
  await p.install();
}


// Утренняя сводка и вечернее «план на завтра» на ближайшие дни. Текст уведомления фиксируется в момент
// планирования, поэтому план пересчитывается при каждом запуске, возврате в приложение и изменении данных;
// на несколько дней вперёд берутся те же данные, а погода и план обновятся, как только откроешь приложение.
const DAYS_AHEAD = 7;
const MORNING_ID = 2_100_000_010;
const BEDTIME_ID = 2_100_000_020;

async function dailyNotifications(now: Date): Promise<any[]> {
  const s = readDaily();
  const out: any[] = [];
  const at = (day: Date, time: string) => {
    const [h, m] = time.split(":").map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
  };
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = addDays(now, i);
    if (s.morning.enabled) {
      const when = at(day, s.morning.time);
      if (when > now) {
        const n = morningNotice(await buildBrief(day, now));
        out.push({ id: MORNING_ID + i, title: n.title, body: n.body, largeBody: n.largeBody, summaryText: "Сводка на день", schedule: { at: when, allowWhileIdle: true }, extra: { route: "/" } });
      }
    }
    if (s.bedtime.enabled) {
      const when = at(day, s.bedtime.time);
      if (when > now) {
        const n = bedtimeNotice(await buildBrief(addDays(day, 1), now));
        out.push({ id: BEDTIME_ID + i, title: n.title, body: n.body, largeBody: n.largeBody, summaryText: "План на завтра", schedule: { at: when, allowWhileIdle: true }, extra: { route: "/plan-tomorrow" } });
      }
    }
  }
  return out;
}

// Нажатие на уведомление открывает нужный экран: утром главный, вечером «План на завтра».
let tapsBound = false;
export function bindNotificationTaps() {
  if (tapsBound) return;
  const p = plugin("LocalNotifications");
  if (!p?.addListener) return;
  tapsBound = true;
  try {
    p.addListener("localNotificationActionPerformed", (e: any) => {
      const route = e?.notification?.extra?.route;
      if (typeof route === "string" && route.startsWith("/")) location.hash = "#" + route;
    });
  } catch {
    /* слушатель не подключился: уведомление просто откроет приложение */
  }
}
