// Быстрые записи, сделанные вне приложения (шторка уведомлений, виджет), переносятся в дневник.
// Очередь живёт в памяти телефона и не требует интернета. Запись попадает в дневник с настоящим временем,
// когда её написали, а не когда открыли приложение.
import { prisma } from "./prisma";
import { localRequest, ready } from "./server";
import { nativeDrainNotes, nativePutBackNotes, type QuickNote } from "./nativeExtras";
import { isNative } from "./native";

let running: Promise<number> | null = null;

export function importQuickNotes(): Promise<number> {
  if (!isNative()) return Promise.resolve(0);
  if (!running) running = doImport().finally(() => (running = null));
  return running;
}

async function doImport(): Promise<number> {
  const notes = await nativeDrainNotes();
  if (notes.length === 0) return 0;
  await ready();
  const failed: QuickNote[] = [];
  let saved = 0;
  for (const n of notes) {
    try {
      const res = await localRequest("POST", "/journal", { content: n.text, private: false });
      if (res.status >= 400) throw new Error("не принято");
      const id = (res.body as any)?.id;
      const when = new Date(n.ts);
      if (id && !isNaN(when.getTime()) && when.getTime() < Date.now()) {
        await prisma.journalEntry.update({ where: { id }, data: { createdAt: when } });
      }
      saved++;
    } catch {
      failed.push(n);
    }
  }
  if (failed.length) await nativePutBackNotes(failed);
  if (saved) window.dispatchEvent(new Event("navigator:notes-imported"));
  return saved;
}

export function startQuickNotes() {
  setTimeout(() => void importQuickNotes().catch(() => {}), 1200);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void importQuickNotes().catch(() => {});
  });
}
