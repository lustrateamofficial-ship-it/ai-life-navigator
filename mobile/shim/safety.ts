// Защита данных при обновлении приложения.
//  1. У данных есть своя версия (DATA_VERSION). Если формат когда-нибудь поменяется, при первом запуске новой версии
//     данные аккуратно переделываются миграциями, а перед этим делается точка восстановления.
//  2. Точки восстановления лежат на телефоне отдельно от самих данных: перед каждым обновлением и раз в сутки.
//     Любую можно вернуть одной кнопкой (перед возвратом делается ещё одна точка, так что возврат тоже обратим).
//  3. Если данные новее приложения (поставили старую версию) или обновление данных не получилось, приложение
//     ничего не записывает и сообщает об этом, а не портит данные.
import { dumpAll, replaceAll, readMeta, writeMeta, freezeWrites, unfreezeWrites, tableCounts, isFrozen, flushNow } from "./prisma";
import { collectExtras, writeBudget, type PhoneExtras } from "./phoneExtras";
import { writeEvening } from "./evening";
import { logError } from "./errorLog";

// Версия формата данных. Поднимай на 1 вместе с новой миграцией в MIGRATIONS.
export const DATA_VERSION = 1;

type Tables = Record<string, Array<Record<string, any>>>;
export interface Migration {
  to: number;
  note: string;
  run: (tables: Tables) => void;
}
// Миграции переделывают копию данных и не пишут на диск сами. Пример для будущего:
// { to: 2, note: "Поле «приоритет» у целей", run: (t) => t.Goal.forEach((g) => (g.priority ??= "medium")) }
export const MIGRATIONS: Migration[] = [];

declare const __APP_BUILD__: string;
declare const __APP_BUILD_CODE__: string;
export const BUILD_ID = `${typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev"}`;

export type FrozenInfo = { kind: "newer" | "failed"; message: string } | null;
let frozenInfo: FrozenInfo = null;
export const getFrozenInfo = () => frozenInfo;
export class DataFrozenError extends Error {
  constructor(public info: NonNullable<FrozenInfo>) {
    super(info.message);
  }
}

// ---------- точки восстановления ----------
const SNAP_DB = "navigator-safety";
const SNAP_STORE = "snaps";
export type SnapKind = "update" | "migration" | "rollback" | "manual" | "daily";
export interface Snapshot {
  id: string;
  at: string;
  kind: SnapKind;
  reason: string;
  build: string;
  dataVersion: number;
  counts: Record<string, number>;
  data: Tables;
  extras: PhoneExtras;
}
const KEEP: Record<"event" | "daily", number> = { event: 4, daily: 3 };

function openSnapDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SNAP_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SNAP_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allSnaps(): Promise<Snapshot[]> {
  const db = await openSnapDb();
  const list = await new Promise<Snapshot[]>((resolve, reject) => {
    const req = db.transaction(SNAP_STORE, "readonly").objectStore(SNAP_STORE).getAll();
    req.onsuccess = () => resolve(req.result as Snapshot[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

export type SnapshotInfo = Omit<Snapshot, "data" | "extras">;
export async function listSnapshots(): Promise<SnapshotInfo[]> {
  try {
    return (await allSnaps()).map(({ data: _d, extras: _e, ...rest }) => rest);
  } catch {
    return [];
  }
}

function hasData(): boolean {
  // Служебная запись пользователя создаётся при первом запуске: она данными не считается.
  const c = tableCounts();
  return Object.entries(c).some(([k, n]) => k !== "User" && n > 0);
}

async function prune() {
  const db = await openSnapDb();
  const list = (await allSnaps()) as Snapshot[];
  const dropIds = [
    ...list.filter((s) => s.kind !== "daily").slice(KEEP.event).map((s) => s.id),
    ...list.filter((s) => s.kind === "daily").slice(KEEP.daily).map((s) => s.id),
  ];
  if (dropIds.length) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(SNAP_STORE, "readwrite");
      for (const id of dropIds) tx.objectStore(SNAP_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  db.close();
}

export async function createSnapshot(kind: SnapKind, reason: string, meta?: { dataVersion?: number }): Promise<string | null> {
  try {
    await flushNow();
    const snap: Snapshot = {
      id: `${new Date().toISOString()}_${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      kind,
      reason,
      build: BUILD_ID,
      dataVersion: meta?.dataVersion ?? (await readMeta())?.dataVersion ?? DATA_VERSION,
      counts: tableCounts(),
      data: dumpAll() as Tables,
      extras: collectExtras(),
    };
    const db = await openSnapDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAP_STORE, "readwrite");
      tx.objectStore(SNAP_STORE).put(snap);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await prune();
    return snap.id;
  } catch (e) {
    // Не удалось сохранить точку (мало места и т.п.): работе приложения это не мешает.
    logError(e, "точка восстановления");
    return null;
  }
}

// «Удалить все данные» стирает и точки восстановления: в них лежат полные копии.
export async function clearSnapshots(): Promise<void> {
  try {
    const db = await openSnapDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(SNAP_STORE, "readwrite");
      tx.objectStore(SNAP_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* хранилища точек нет: стирать нечего */
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openSnapDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SNAP_STORE, "readwrite");
    tx.objectStore(SNAP_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

// Вернуть данные к точке. Перед этим сохраняется текущее состояние (если оно есть и не заморожено).
export async function restoreSnapshot(id: string): Promise<void> {
  const snap = (await allSnaps()).find((s) => s.id === id);
  if (!snap) throw new Error("Точка восстановления не найдена");
  if (!isFrozen() && hasData()) await createSnapshot("rollback", `Перед возвратом к точке от ${snap.at.slice(0, 16).replace("T", " ")}`);
  unfreezeWrites();
  await replaceAll(snap.data);
  writeBudget(snap.extras?.budget ?? {});
  if (snap.extras?.evening) writeEvening(snap.extras.evening);
  // Версия данных берётся из точки: если она старее, при следующем запуске данные доведутся миграциями.
  await writeMeta({ dataVersion: snap.dataVersion, build: BUILD_ID, lastDaily: new Date().toISOString() });
  frozenInfo = null;
}

// ---------- запуск ----------
function runMigrations(from: number, migrations: Migration[]): Tables {
  const copy = JSON.parse(JSON.stringify(dumpAll())) as Tables;
  let v = from;
  for (const m of [...migrations].sort((a, b) => a.to - b.to)) {
    if (m.to <= v) continue;
    m.run(copy);
    v = m.to;
  }
  for (const [k, rows] of Object.entries(copy)) if (!Array.isArray(rows)) throw new Error(`После миграции таблица ${k} повреждена`);
  return copy;
}

// Вызывается после загрузки данных, до первого запроса. Бросает DataFrozenError, если работать с данными нельзя.
export async function bootSafety(opts?: { dataVersion?: number; migrations?: Migration[]; now?: number }): Promise<void> {
  const target = opts?.dataVersion ?? DATA_VERSION;
  const migrations = opts?.migrations ?? MIGRATIONS;
  const now = opts?.now ?? Date.now();
  const meta = await readMeta();
  const stored = meta?.dataVersion ?? 1; // данные без метки созданы до этой защиты: это версия 1
  const present = hasData();

  if (stored > target) {
    frozenInfo = {
      kind: "newer",
      message: "Данные созданы более новой версией приложения, а установлена более старая. Чтобы ничего не испортить, записывать я не буду. Установи свежую версию поверх этой: данные на месте.",
    };
    freezeWrites();
    throw new DataFrozenError(frozenInfo);
  }

  if (meta?.build && meta.build !== BUILD_ID && present) {
    await createSnapshot("update", `Перед обновлением ${meta.build} → ${BUILD_ID}`, { dataVersion: stored });
  }

  let version = stored;
  if (stored < target) {
    if (present) await createSnapshot("migration", `Перед обновлением формата данных ${stored} → ${target}`, { dataVersion: stored });
    try {
      const migrated = runMigrations(stored, migrations);
      await replaceAll(migrated);
      version = target;
    } catch (e) {
      logError(e, "миграция данных");
      frozenInfo = {
        kind: "failed",
        message: "Не удалось перевести данные на новый формат. Твои записи целы и ничего не изменилось. Перед этим сохранена точка восстановления. Закрой приложение и открой снова; если не помогает, поставь прошлую версию.",
      };
      freezeWrites();
      throw new DataFrozenError(frozenInfo);
    }
  }

  let lastDaily = meta?.lastDaily;
  if (present && (!lastDaily || now - new Date(lastDaily).getTime() > 20 * 3600_000)) {
    await createSnapshot("daily", "Ежедневная копия", { dataVersion: version });
    lastDaily = new Date(now).toISOString();
  }
  try {
    await writeMeta({ dataVersion: version, build: BUILD_ID, lastDaily });
  } catch (e) {
    // Не записалась служебная метка (нет места): приложение работает, а проверка повторится при следующем запуске.
    logError(e, "версия данных");
  }
}
