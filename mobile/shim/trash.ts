// Корзина: удалённые записи дневника, задачи, идеи, память, события и напоминания хранятся 30 дней
// и возвращаются одним нажатием. Лежит отдельно от основной базы, поэтому в файл копии не попадает.
import { Router } from "express";
import { prisma } from "./prisma";

const DB = "navigator-trash";
const STORE = "items";
const KEEP_DAYS = 30;
const DAY = 86_400_000;

interface TrashItem {
  id: string;
  delegate: string;
  kind: string;
  row: Record<string, any>;
  deletedAt: string;
}

// Какие пути удаления попадают в корзину.
const KINDS: Array<{ re: RegExp; delegate: string; kind: string }> = [
  { re: /^\/journal\/([^/]+)$/, delegate: "journalEntry", kind: "Запись дневника" },
  { re: /^\/tasks\/([^/]+)$/, delegate: "task", kind: "Задача" },
  { re: /^\/ideas\/([^/]+)$/, delegate: "idea", kind: "Идея" },
  { re: /^\/memory\/([^/]+)$/, delegate: "memoryItem", kind: "Память" },
  { re: /^\/calendar\/([^/]+)$/, delegate: "calendarEvent", kind: "Событие" },
  { re: /^\/reminders\/([^/]+)$/, delegate: "reminder", kind: "Напоминание" },
];

// Все изменения корзины идут строго по очереди: иначе два удаления подряд читают один и тот же список,
// и записывается только последнее (так терялись удалённые элементы при одновременных удалениях).
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function load(): Promise<TrashItem[]> {
  const db = await open();
  const items = await new Promise<TrashItem[]>((resolve, reject) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get("items");
    r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result : []);
    r.onerror = () => reject(r.error);
  });
  db.close();
  const cutoff = Date.now() - KEEP_DAYS * DAY;
  return items.filter((i) => new Date(i.deletedAt).getTime() >= cutoff);
}

async function save(items: TrashItem[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(items, "items");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Перед удалением запоминаем строку; после успешного удаления кладём её в корзину.
export async function trashBefore(method: string, path: string): Promise<null | { delegate: string; kind: string; row: any }> {
  if (method.toUpperCase() !== "DELETE") return null;
  for (const k of KINDS) {
    const m = path.match(k.re);
    if (!m) continue;
    const row = await (prisma as any)[k.delegate].findFirst({ where: { id: m[1] } });
    return row ? { delegate: k.delegate, kind: k.kind, row } : null;
  }
  return null;
}

export function trashAfter(pending: { delegate: string; kind: string; row: any }): Promise<void> {
  return locked(async () => {
    const items = await load();
    const row = JSON.parse(JSON.stringify(pending.row));
    items.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(), delegate: pending.delegate, kind: pending.kind, row, deletedAt: new Date().toISOString() });
    await save(items.slice(0, 500));
  });
}

function label(i: TrashItem): string {
  const r = i.row;
  const text: string = r.title ?? r.content ?? "";
  return text.length > 120 ? text.slice(0, 120).trimEnd() + "…" : text || i.kind;
}

export const trashRouter = Router();

trashRouter.get("/", async (_req: any, res: any) => {
  const items = await load();
  res.json(
    items.map((i) => ({
      id: i.id,
      kind: i.kind,
      label: label(i),
      deletedAt: i.deletedAt,
      daysLeft: Math.max(1, Math.ceil((new Date(i.deletedAt).getTime() + KEEP_DAYS * DAY - Date.now()) / DAY)),
    }))
  );
});

trashRouter.post("/:id/restore", (req: any, res: any) => locked(async () => {
  const items = await load();
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Не найдено: возможно, срок хранения истёк" });
  const row = { ...item.row };
  // Если цель или этап удалили, пока задача лежала в корзине, связь не восстанавливаем.
  if (item.delegate === "task") {
    if (row.goalId && !(await prisma.goal.findFirst({ where: { id: row.goalId } }))) row.goalId = null;
    if (row.stageId && !(await prisma.goalStage.findFirst({ where: { id: row.stageId } }))) row.stageId = null;
  }
  if (await (prisma as any)[item.delegate].findFirst({ where: { id: row.id } })) {
    await save(items.filter((i) => i.id !== item.id));
    return res.json({ restored: false, note: "Такая запись уже есть" });
  }
  await (prisma as any)[item.delegate].create({ data: row });
  await save(items.filter((i) => i.id !== item.id));
  res.json({ restored: true });
}));

trashRouter.delete("/:id", (req: any, res: any) =>
  locked(async () => {
    await save((await load()).filter((i) => i.id !== req.params.id));
    res.status(204).send();
  })
);

trashRouter.delete("/", (_req: any, res: any) =>
  locked(async () => {
    await save([]);
    res.status(204).send();
  })
);
