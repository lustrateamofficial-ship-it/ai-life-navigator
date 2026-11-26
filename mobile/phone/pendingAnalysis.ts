// Отложенный разбор записей. Если при сохранении записи все ИИ-сервисы недоступны (лимит, сбой, нет интернета),
// запись остаётся в дневнике, а её разбор на задачи ставится в очередь и повторяется сам: при запуске, при возврате
// в приложение и раз в несколько минут. Готовые предложения ждут на главном экране, пока человек их не примет.
// Ничего не создаётся без подтверждения. Личные записи в очередь не попадают.
import { aiFailureCount } from "./aiRouter";
import { localRequest } from "../shim/server";

const PENDING = "navigator:ai-pending";
const READY = "navigator:ai-ready";
const EVENT = "navigator:ai-queue";
const MAX_AGE = 7 * 24 * 3600_000;

export interface PendingItem {
  id: string;
  snippet: string;
  at: number;
}
export interface ReadyItem extends PendingItem {
  proposals: any;
}

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* хранилище недоступно: очередь не сохранится */
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* нет окна: подписчиков нет */
  }
}

export const readPending = () => read<PendingItem>(PENDING);
export const readReady = () => read<ReadyItem>(READY);
export const queueEvent = EVENT;

export function queueAnalysis(id: string, text: string) {
  const list = readPending().filter((x) => x.id !== id);
  list.push({ id, snippet: text.replace(/\s+/g, " ").trim().slice(0, 80), at: Date.now() });
  write(PENDING, list);
}

export function dropReady(id: string) {
  write(READY, readReady().filter((x) => x.id !== id));
}

export function hasAnyProposals(p: any): boolean {
  return !!p && ((p.tasks?.length ?? 0) + (p.reminders?.length ?? 0) + (p.ideas?.length ?? 0) + (p.transactions?.length ?? 0) > 0 || !!p.weight);
}

let running = false;

// Один проход по очереди. Возвращает, сколько записей стало готово. Останавливается на первом же сбое ИИ:
// остальным повезёт не больше, а очередь сохраняется для следующей попытки.
export async function retryPending(): Promise<number> {
  if (running) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  running = true;
  let made = 0;
  try {
    const now = Date.now();
    let list = readPending().filter((x) => now - x.at < MAX_AGE);
    if (list.length !== readPending().length) write(PENDING, list);
    for (const item of [...list].slice(0, 5)) {
      const before = aiFailureCount();
      let res;
      try {
        res = await localRequest("POST", `/journal/${item.id}/analyze`);
      } catch {
        break;
      }
      if (res.status === 404) {
        list = list.filter((x) => x.id !== item.id); // запись удалили
        write(PENDING, list);
        continue;
      }
      if (res.status >= 300 || aiFailureCount() > before) break; // ИИ всё ещё недоступен
      list = list.filter((x) => x.id !== item.id);
      write(PENDING, list);
      const proposals = (res.body as any)?.proposals;
      if (hasAnyProposals(proposals)) {
        write(READY, [...readReady().filter((x) => x.id !== item.id), { ...item, proposals }]);
        made++;
      }
    }
  } finally {
    running = false;
  }
  return made;
}

let started = false;
export function startPendingAnalysis() {
  if (started || typeof window === "undefined") return;
  started = true;
  const go = () => void retryPending().catch(() => undefined);
  setTimeout(go, 4000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && go());
  window.addEventListener("online", go);
  setInterval(go, 5 * 60_000);
}
