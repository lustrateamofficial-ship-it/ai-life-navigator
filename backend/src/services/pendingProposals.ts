import { prisma } from "../db/prisma.js";
import type { JournalProposals } from "./journalExtraction.js";

// Предложения из записи, отправленной боту, ждут нажатия кнопки «Добавить всё». Хранятся прямо в записи
// дневника на 30 минут и стираются после нажатия, поэтому перезапуск сервера их не теряет.
// Если прошло больше получаса, предложение считается устаревшим, и бот честно об этом говорит
// (сама запись дневника при этом остаётся).

export const PENDING_TTL_MS = 30 * 60 * 1000;

// Последний параметр нужен тестам: в них вместо базы подставляется простая заглушка.
type Db = Pick<typeof prisma, "journalEntry">;

export async function savePending(entryId: string, userId: string, proposals: JournalProposals, now = Date.now(), db: Db = prisma) {
  await db.journalEntry.updateMany({
    where: { id: entryId, userId },
    data: { pendingProposals: proposals as object, pendingExpiresAt: new Date(now + PENDING_TTL_MS) },
  });
}

// Забрать и стереть. Один раз, только владельцу и только пока не истёк срок.
export async function takePending(
  entryId: string,
  userId: string,
  now = Date.now(),
  db: Db = prisma
): Promise<JournalProposals | null> {
  const entry = await db.journalEntry.findFirst({
    where: { id: entryId, userId },
    select: { pendingProposals: true, pendingExpiresAt: true },
  });
  if (!entry || !entry.pendingProposals || !entry.pendingExpiresAt) return null;

  // updateMany с условием делает «забрать» атомарным: при двойном нажатии сработает только одно.
  const claimed = await db.journalEntry.updateMany({
    where: { id: entryId, userId, pendingExpiresAt: entry.pendingExpiresAt },
    data: { pendingProposals: null as never, pendingExpiresAt: null },
  });
  if (claimed.count !== 1) return null;
  if (entry.pendingExpiresAt.getTime() <= now) return null;
  return entry.pendingProposals as unknown as JournalProposals;
}
