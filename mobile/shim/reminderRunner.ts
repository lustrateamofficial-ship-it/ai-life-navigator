// Напоминания на телефоне: пока приложение открыто (или телефон его не выгрузил), раз в полминуты
// проверяем, не пора ли напомнить. Показываем системное уведомление, а если оно запрещено, то плашку в приложении.
// Для надёжных напоминаний при закрытом приложении нужна Android-сборка (см. README, раздел про Android).
import { prisma } from "./prisma";
import { ready } from "./server";
import { isNative, syncNativeReminders } from "./native";
import { EVENING_BODY, eveningParts, readEvening } from "./evening";
import { computeNextTrigger } from "../../backend/src/utils/reminderRecurrence";

export const REMINDER_EVENT = "navigator:reminder";

async function notify(title: string) {
  window.dispatchEvent(new CustomEvent(REMINDER_EVENT, { detail: { title } }));
  try {
    if (isNative()) return; // в приложении для Android системное уведомление уже запланировано заранее
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification("Напоминание", { body: title, tag: `reminder-${title}`, icon: "./icon-192.png" });
    else new Notification("Напоминание", { body: title });
  } catch {
    /* уведомление не показалось: плашка в приложении уже есть */
  }
}

export async function checkReminders(now = new Date()) {
  await ready();
  const due = await prisma.reminder.findMany({ where: { active: true, triggerAt: { lte: now } }, orderBy: { triggerAt: "asc" } });
  for (const r of due) {
    await notify(r.title);
    if (r.recurrence === "once") {
      await prisma.reminder.update({ where: { id: r.id }, data: { active: false } });
    } else {
      // Если телефон долго был выключен, сдвигаем сразу в будущее, а не засыпаем уведомлениями.
      let next = computeNextTrigger(r.triggerAt, r.recurrence);
      while (next <= now) next = computeNextTrigger(next, r.recurrence);
      await prisma.reminder.update({ where: { id: r.id }, data: { triggerAt: next } });
    }
  }
}

const EVENING_DONE_KEY = "navigator:evening-last";

// В браузере вечерний вопрос показывается, когда приложение открыто и время уже наступило.
// Если сегодня запись уже есть, не напоминаем.
export async function checkEvening(now = new Date()) {
  if (isNative()) return; // в приложении для Android его показывает система по расписанию
  const s = readEvening();
  if (!s.enabled) return;
  const { hour, minute } = eveningParts(s);
  if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return;
  const today = now.toLocaleDateString("sv-SE");
  try {
    if (localStorage.getItem(EVENING_DONE_KEY) === today) return;
  } catch {
    /* без хранилища напомним ещё раз: лучше лишнее напоминание, чем пропущенное */
  }
  await ready();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEntries = await prisma.journalEntry.count({ where: { createdAt: { gte: startOfDay } } });
  try {
    localStorage.setItem(EVENING_DONE_KEY, today);
  } catch {
    /* см. выше */
  }
  if (todayEntries === 0) await notify(EVENING_BODY);
}

export function startReminderRunner() {
  const tick = () => {
    void checkReminders().catch(() => {});
    void checkEvening().catch(() => {});
  };
  setTimeout(tick, 1500);
  setTimeout(() => void syncNativeReminders(), 2000);
  setInterval(tick, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
      void syncNativeReminders();
    }
  });
}
