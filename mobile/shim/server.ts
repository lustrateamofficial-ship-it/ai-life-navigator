// Локальный «сервер» внутри приложения: те же маршруты, что и на настоящем сервере, но вызываются
// напрямую, без сети. Данные лежат на телефоне (см. prisma.ts).
import { RouterImpl, Router, dispatch } from "./express";
import { prisma, loadDatabase, flushNow } from "./prisma";
import { bootSafety } from "./safety";
import { syncNativeReminders } from "./native";
import { weekRouter } from "./weekStats";
import { budgetRouter } from "./budget";
import { trashRouter, trashBefore, trashAfter } from "./trash";
import { collectExtras, applyExtras } from "./phoneExtras";
import { logError } from "./errorLog";
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
import { moodRouter } from "../../backend/src/routes/mood";
import { accountRouter } from "../../backend/src/routes/account";
import {
  analyticsRouter,
  directionScoreRouter,
  trendsRouter,
  correlationsRouter,
  reportsRouter,
  simulationRouter,
} from "../../backend/src/routes/analytics";
import { aiRouter } from "../../backend/src/routes/ai";
import { lifeGraphRouter } from "../../backend/src/routes/lifeGraph";
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
root.use("/mood", moodRouter as any);
root.use("/account", accountRouter as any);
root.use("/analytics", analyticsRouter as any);
root.use("/direction-score", directionScoreRouter as any);
root.use("/trends", trendsRouter as any);
root.use("/correlations", correlationsRouter as any);
root.use("/reports", reportsRouter as any);
root.use("/simulation", simulationRouter as any);
root.use("/life-graph", lifeGraphRouter as any);
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
