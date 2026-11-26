// Локальный «сервер» внутри приложения: те же маршруты, что и на настоящем сервере, но вызываются
// напрямую, без сети. Данные лежат на телефоне (см. prisma.ts).
import { recordDayDone } from "../phone/streak";
import { RouterImpl, Router, dispatch } from "./express";
import { prisma, loadDatabase, flushNow } from "./prisma";
import { bootSafety } from "../phone/safety";
import { syncNativeReminders } from "../phone/native";
import { weekRouter } from "../phone/weekStats";
import { budgetRouter } from "../phone/budget";
import { trashRouter, trashBefore, trashAfter } from "../phone/trash";
import { collectExtras, applyExtras } from "../phone/phoneExtras";
import { logError } from "../phone/errorLog";
import { authRouter } from "../../backend/src/routes/auth";
import { profileRouter } from "../../backend/src/routes/profile";
import { missionRouter } from "../../backend/src/routes/mission";
import { goalsRouter } from "../../backend/src/routes/goals";
import { tasksRouter } from "../../backend/src/routes/tasks";
import { habitsRouter } from "../../backend/src/routes/habits";
import { healthRouter } from "../../backend/src/routes/health";
import { financeRouter } from "../../backend/src/routes/finance";
import { calendarRouter } from "../../backend/src/routes/calendar";
import { remindersRouter } from "../../backend/src/routes/reminders";
import { ideasRouter } from "../../backend/src/routes/ideas";
import { memoryRouter } from "../../backend/src/routes/memory";
import { journalRouter } from "../../backend/src/routes/journal";
import { homeRouter } from "../../backend/src/routes/home";
import { accountRouter } from "../../backend/src/routes/account";
import {
  analyticsRouter,
  directionScoreRouter,
  trendsRouter,
} from "../../backend/src/routes/analytics";
import { aiRouter } from "../../backend/src/routes/ai";
import { portraitRouter } from "../../backend/src/routes/portrait";

export const LOCAL_USER_ID = "local-user";

const root: RouterImpl = Router();
root.use("/auth", authRouter as any);
root.use("/profile", profileRouter as any);
root.use("/mission", missionRouter as any);
root.use("/goals", goalsRouter as any);
root.use("/tasks", tasksRouter as any);
root.use("/habits", habitsRouter as any);
root.use("/health", healthRouter as any);
root.use("/finance", financeRouter as any);
root.use("/calendar", calendarRouter as any);
root.use("/reminders", remindersRouter as any);
root.use("/ideas", ideasRouter as any);
root.use("/memory", memoryRouter as any);
root.use("/journal", journalRouter as any);
root.use("/home", homeRouter as any);
root.use("/account", accountRouter as any);
root.use("/analytics", analyticsRouter as any);
root.use("/direction-score", directionScoreRouter as any);
root.use("/trends", trendsRouter as any);
root.use("/ai", aiRouter as any);
root.use("/portrait", portraitRouter as any);
root.use("/week", weekRouter as any);
root.use("/budget", budgetRouter as any);
root.use("/trash", trashRouter as any);

let readyPromise: Promise<void> | null = null;

async function init() {
  await loadDatabase();
  await bootSafety(); // версия данных, миграции, точки восстановления
  const existing = await prisma.user.findUnique({ where: { id: LOCAL_USER_ID } });
  if (!existing) {
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* оставляем UTC */
    }
    await prisma.user.create({ data: { id: LOCAL_USER_ID, telegramId: 1, timezone: tz } });
    await flushNow();
  } else {
    await refreshTimezone();
  }
}

const TZ_MANUAL = "navigator:tz-manual";

export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Человек сам вписал пояс в настройках: тогда автоматически его не меняем. «Определить» снимает этот выбор. */
export function setTimezoneManual(manual: boolean) {
  try {
    if (manual) localStorage.setItem(TZ_MANUAL, "1");
    else localStorage.removeItem(TZ_MANUAL);
  } catch {
    /* хранилище недоступно: поведение по умолчанию (автоопределение) */
  }
}

/** Часовой пояс телефона мог измениться (поездка). Обновляем при запуске и возвращении в приложение, если пояс не задан вручную. */
export async function refreshTimezone(): Promise<void> {
  try {
    if (localStorage.getItem(TZ_MANUAL) === "1") return;
    const tz = deviceTimezone();
    if (!tz) return;
    const u = await prisma.user.findUnique({ where: { id: LOCAL_USER_ID }, select: { timezone: true } });
    if (u && u.timezone !== tz) {
      await prisma.user.update({ where: { id: LOCAL_USER_ID }, data: { timezone: tz } });
      await flushNow();
      window.dispatchEvent(new Event("navigator:timezone"));
    }
  } catch {
    /* без изменений: останется прежний пояс */
  }
}

export function ready(): Promise<void> {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

export async function getTimezone(): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: LOCAL_USER_ID }, select: { timezone: true } });
  return u?.timezone ?? "UTC";
}

// Выполнить запрос к локальному серверу. Тело и ответ проходят через JSON, как по сети:
// даты становятся строками, лишнее отбрасывается.
export async function localRequest(method: string, path: string, body?: unknown) {
  await ready();
  const tz = await getTimezone();
  let plainBody = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  // Дополнительные настройки телефона едут в файле копии отдельным разделом и применяются при восстановлении.
  let extras: unknown = undefined;
  if (method.toUpperCase() === "POST" && path === "/account/restore" && plainBody && typeof plainBody === "object" && "phoneExtras" in plainBody) {
    extras = plainBody.phoneExtras;
    delete plainBody.phoneExtras;
  }
  const pendingTrash = await trashBefore(method, path).catch(() => null);
  let res;
  try {
    res = await dispatch(root, method, path, plainBody, { userId: LOCAL_USER_ID, userTimezone: tz });
  } catch (e) {
    logError(e, `${method} ${path}`);
    throw e;
  }
  if (res.status >= 500) logError(new Error(`Ответ ${res.status}`), `${method} ${path}`);
  if (pendingTrash && res.status < 300) await trashAfter(pendingTrash).catch((e) => logError(e, "корзина"));
  if (extras !== undefined && res.status < 300) applyExtras(extras);
  if (method.toUpperCase() !== "GET" && path.startsWith("/tasks") && res.status < 300) void recordDayDone().catch(() => undefined);
  let outBody: any = res.body;
  if (method.toUpperCase() === "GET" && path === "/account/export" && outBody instanceof Uint8Array) {
    try {
      const data = JSON.parse(new TextDecoder().decode(outBody));
      data.phoneExtras = collectExtras();
      outBody = new TextEncoder().encode(JSON.stringify(data, null, 2));
    } catch {
      /* оставляем файл как есть: настройки телефона в него не попадут */
    }
  }
  // Ответ об успехе отдаём только после записи на диск: закрытие приложения сразу после действия ничего не теряет.
  if (method.toUpperCase() !== "GET") {
    await flushNow();
    if (/^\/(reminders|account|trash|journal|tasks|calendar|health|profile)/.test(path)) void syncNativeReminders();
  }
  return {
    status: res.status,
    headers: res.headers,
    body: outBody instanceof Uint8Array ? outBody : outBody === undefined ? undefined : JSON.parse(JSON.stringify(outBody)),
  };
}
