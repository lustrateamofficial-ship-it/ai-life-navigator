import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installErrorLog } from "../shim/errorLog";
import { startReminderRunner } from "../shim/reminderRunner";
import { startAppearance } from "../shim/appearance";
import { startQuickNotes } from "../shim/quickNotes";
import { bindNotificationTaps } from "../shim/native";
import { startAutoBackup } from "../shim/autoBackup";
import { localRequest } from "../shim/server";
import * as safety from "../shim/safety";
import * as updater from "../shim/updater";
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
startAutoBackup();

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
