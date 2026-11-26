import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installErrorLog } from "../phone/errorLog";
import { startReminderRunner } from "../phone/reminderRunner";
import { startAppearance } from "../phone/appearance";
import { startQuickNotes } from "../phone/quickNotes";
import { bindNotificationTaps } from "../phone/native";
import { startPendingAnalysis } from "../phone/pendingAnalysis";
import { startAutoBackup } from "../phone/autoBackup";
import { localRequest, refreshTimezone, ready } from "../shim/server";
import * as streak from "../phone/streak";
import { backfillStreak, streakEvent } from "../phone/streak";
import { prisma } from "../shim/prisma";
import * as safety from "../phone/safety";
import * as updater from "../phone/updater";
import * as daily from "../phone/daily";
import * as recurrence from "../phone/recurrence";
import "./styles.css";

// Серверная логика местами использует Buffer; на телефоне нужна только его простая часть.
(globalThis as any).Buffer ??= { from: (s: string) => new TextEncoder().encode(s) };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

installErrorLog();
startReminderRunner();
startAppearance();
startQuickNotes();
bindNotificationTaps();
startPendingAnalysis();
startAutoBackup();

// Один раз заполняем прошлое серии по уже выполненным задачам.
void ready().then(async () => {
  if ((await backfillStreak()) > 0) window.dispatchEvent(new Event(streakEvent));
});

// Вернулись в приложение после поездки: подхватываем новый часовой пояс телефона.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshTimezone();
});

// Просим браузер не удалять записи при нехватке места на телефоне (в приложении для Android это не нужно).
try {
  void navigator.storage?.persist?.();
} catch {
  /* не поддерживается: записи всё равно сохраняются */
}

// Отладочный вход для автоматических проверок: включается вручную в хранилище страницы.
try {
  if (localStorage.getItem("navigator-debug") === "1") {
    (globalThis as any).__api = localRequest;
    (globalThis as any).__safety = safety; // проверки обновления данных
    (globalThis as any).__updater = updater;
    (globalThis as any).__daily = daily;
    (globalThis as any).__recurrence = recurrence;
    (globalThis as any).__streak = streak;
    (globalThis as any).__prisma = prisma;
  }
} catch {
  /* хранилище недоступно: отладка не нужна */
}

if ("serviceWorker" in navigator) {
  // Сообщаем интерфейсу, когда в фоне заработала новая версия (первая установка не считается).
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.dispatchEvent(new Event("navigator:update-ready"));
  });
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* работа без офлайн-кэша: приложение всё равно открывается */
  });
}
