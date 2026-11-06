// Лёгкая замена базы данных для телефона. Понимает тот же набор запросов, что и Prisma, поэтому вся
// серверная логика (задачи, цели, дневник, аналитика) работает на телефоне без переписывания.
// Данные лежат в памяти и сразу записываются в IndexedDB — встроенную базу браузера на устройстве.
import schema from "./schema.json";

type Row = Record<string, any>;
type Field = {
  type: string;
  list: boolean;
  optional: boolean;
  id?: boolean;
  updatedAt?: boolean;
  default?: { kind: string; value?: any };
  relation?: { fields: string[]; references: string[]; onDelete: string };
  isRelation: boolean;
  isEnum: boolean;
};
type Model = { fields: Record<string, Field>; uniques: string[][] };
const models = (schema as any).models as Record<string, Model>;

const DB_NAME = "navigator-life";
const STORE = "tables";

const tables: Record<string, Row[]> = {};
const dirty = new Set<string>();
let flushTimer: any = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let dbHandle: IDBDatabase | null = null; // нужен сразу, без ожидания: при закрытии страницы ждать нельзя

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const modelByDelegate: Record<string, string> = {};
for (const name of Object.keys(models)) modelByDelegate[lc(name)] = name;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        dbHandle = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// ── Преобразование значений: в хранилище даты лежат строками, в памяти — настоящими датами ──

function reviveRow(model: string, row: Row): Row {
  const out: Row = { ...row };
  for (const [fname, f] of Object.entries(models[model].fields)) {
    if (f.type === "DateTime" && out[fname] != null && !(out[fname] instanceof Date)) out[fname] = new Date(out[fname]);
  }
  return out;
}

function serializeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

function cloneValue(v: any): any {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v && typeof v === "object") {
    const o: Row = {};
    for (const [k, x] of Object.entries(v)) o[k] = cloneValue(x);
    return o;
  }
  return v;
}

export async function loadDatabase(): Promise<void> {
  for (const name of Object.keys(models)) tables[name] = [];
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    const keysReq = store.getAllKeys();
    tx.oncomplete = () => {
      const vals = req.result as Row[][];
      const keys = keysReq.result as string[];
      keys.forEach((k, i) => {
        if (tables[k]) tables[k] = (vals[i] ?? []).map((r) => reviveRow(k, r));
      });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function scheduleFlush(model: string) {
  dirty.add(model);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, 100);
}

// Если данные созданы более новой версией или обновление данных не удалось, записывать ничего нельзя.
let frozen = false;
export const freezeWrites = () => (frozen = true);
export const unfreezeWrites = () => (frozen = false);
export const isFrozen = () => frozen;

// Служебная запись о версии данных лежит в том же хранилище под ключом, которого нет среди таблиц.
export interface DataMeta {
  dataVersion: number;
  build?: string;
  lastDaily?: string;
}
export async function readMeta(): Promise<DataMeta | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get("__meta");
    req.onsuccess = () => resolve((req.result as DataMeta) ?? null);
    req.onerror = () => resolve(null);
  });
}
export async function writeMeta(meta: DataMeta): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(meta, "__meta");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export function tableCounts(): Record<string, number> {
  return Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
}

function writeDirty(db: IDBDatabase, names: string[]): Promise<void> {
  if (frozen) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const n of names) store.put(tables[n].map(serializeRow), n);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const names = [...dirty];
  dirty.clear();
  if (names.length === 0) return;
  await writeDirty(dbHandle ?? (await openDb()), names);
}

// При сворачивании и закрытии записываем всё немедленно и без ожиданий.
function flushOnLeave() {
  if (dirty.size === 0 || !dbHandle) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const names = [...dirty];
  dirty.clear();
  void writeDirty(dbHandle, names).catch(() => names.forEach((n) => dirty.add(n)));
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnLeave();
  });
  window.addEventListener("pagehide", flushOnLeave);
}

// Для выгрузки и восстановления всего целиком.
export function dumpAll(): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const [n, rows] of Object.entries(tables)) out[n] = rows.map(serializeRow);
  return out;
}

export async function replaceAll(data: Record<string, Row[]>): Promise<void> {
  for (const name of Object.keys(models)) {
    tables[name] = (data[name] ?? []).map((r) => reviveRow(name, r));
    dirty.add(name);
  }
  await flushNow();
}

export async function wipeAll(): Promise<void> {
  for (const name of Object.keys(models)) {
    tables[name] = [];
    dirty.add(name);
  }
  await flushNow();
}

// ── Сравнение значений ──

function norm(v: any): any {
  if (v instanceof Date) return v.getTime();
  return v;
}

function cmp(a: any, b: any): number {
  const x = norm(a);
  const y = norm(b);
  if (x == null && y == null) return 0;
  if (x == null) return -1;
  if (y == null) return 1;
  if (typeof x === "string" && typeof y === "string") return x < y ? -1 : x > y ? 1 : 0;
  return x < y ? -1 : x > y ? 1 : 0;
}

const eq = (a: any, b: any) => norm(a) === norm(b) || (a == null && b == null);

// ── Условия where ──

function matchesWhere(model: string, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "AND") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((c) => matchesWhere(model, row, c))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(cond as Row[]).some((c) => matchesWhere(model, row, c))) return false;
      continue;
    }
    if (key === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (list.some((c) => matchesWhere(model, row, c))) return false;
      continue;
    }
    const m = models[model];
    // составной уникальный ключ: { userId_date: { userId, date } }
    if (!m.fields[key] && cond && typeof cond === "object" && key.includes("_")) {
      if (!matchesWhere(model, row, cond as Row)) return false;
      continue;
    }
    const field = m.fields[key];
    if (!field) throw new Error(`Неизвестное поле ${model}.${key}`);
    if (field.isRelation) {
      const related = findRelated(model, row, key);
      if (cond === null) {
        if (related != null) return false;
        continue;
      }
      if (field.list) {
        const list = related as Row[];
        const c = cond as Row;
        if (c.some && !list.some((r) => matchesWhere(field.type, r, c.some))) return false;
        if (c.none && list.some((r) => matchesWhere(field.type, r, c.none))) return false;
        if (c.every && !list.every((r) => matchesWhere(field.type, r, c.every))) return false;
      } else {
        if (!related || !matchesWhere(field.type, related as Row, cond as Row)) return false;
      }
      continue;
    }
    if (!matchesScalar(row[key], cond)) return false;
  }
  return true;
}

function matchesScalar(value: any, cond: any): boolean {
  if (cond === null) return value == null;
  if (cond instanceof Date || typeof cond !== "object") return eq(value, cond);
  for (const [op, arg] of Object.entries(cond as Row)) {
    if (arg === undefined) continue;
    switch (op) {
      case "equals":
        if (!eq(value, arg)) return false;
        break;
      case "not":
        if (arg === null ? value == null : matchesScalar(value, arg)) return false;
        break;
      case "in":
        if (!(arg as any[]).some((a) => eq(value, a))) return false;
        break;
      case "notIn":
        if ((arg as any[]).some((a) => eq(value, a))) return false;
        break;
      case "gt":
        if (value == null || !(cmp(value, arg) > 0)) return false;
        break;
      case "gte":
        if (value == null || !(cmp(value, arg) >= 0)) return false;
        break;
      case "lt":
        if (value == null || !(cmp(value, arg) < 0)) return false;
        break;
      case "lte":
        if (value == null || !(cmp(value, arg) <= 0)) return false;
        break;
      case "contains":
      case "startsWith":
      case "endsWith": {
        if (typeof value !== "string") return false;
        const ci = (cond as Row).mode === "insensitive";
        const v = ci ? value.toLowerCase() : value;
        const a = ci ? String(arg).toLowerCase() : String(arg);
        if (op === "contains" && !v.includes(a)) return false;
        if (op === "startsWith" && !v.startsWith(a)) return false;
        if (op === "endsWith" && !v.endsWith(a)) return false;
        break;
      }
      case "mode":
        break;
      default:
        throw new Error(`Неподдерживаемое условие ${op}`);
    }
  }
  return true;
}

// ── Связи ──

// Найти связанные строки: к одному (объект или null) или ко многим (массив).
function findRelated(model: string, row: Row, relName: string): Row | Row[] | null {
  const f = models[model].fields[relName];
  const target = f.type;
  if (f.relation && f.relation.fields.length) {
    // эта сторона хранит внешний ключ
    const fk = f.relation.fields[0];
    const ref = f.relation.references[0];
    if (row[fk] == null) return null;
    return tables[target].find((r) => eq(r[ref], row[fk])) ?? null;
  }
  // обратная сторона: ищем поле-связь в целевой модели, которое смотрит на нас
  const back = Object.entries(models[target].fields).find(([, bf]) => bf.isRelation && bf.type === model && bf.relation?.fields.length);
  if (!back) throw new Error(`Нет обратной связи ${model}.${relName}`);
  const [, bf] = back;
  const fk = bf.relation!.fields[0];
  const ref = bf.relation!.references[0];
  const list = tables[target].filter((r) => eq(r[fk], row[ref]));
  return f.list ? list : list[0] ?? null;
}

function applyOrder(model: string, rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  const out = [...rows];
  out.sort((a, b) => {
    for (const o of list) {
      const [key, dir] = Object.entries(o)[0] as [string, any];
      const c = cmp(a[key], b[key]);
      if (c !== 0) return dir === "desc" ? -c : c;
    }
    return 0;
  });
  return out;
}

// Применить select/include к строке.
function shape(model: string, row: Row, args: Row): Row {
  const m = models[model];
  const { select, include } = args;
  const result: Row = {};
  if (select) {
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      const f = m.fields[k];
      if (f?.isRelation) result[k] = loadRelation(model, row, k, v === true ? {} : (v as Row));
      else result[k] = cloneValue(row[k]);
    }
    return result;
  }
  for (const [k, v] of Object.entries(row)) result[k] = cloneValue(v);
  if (include) {
    for (const [k, v] of Object.entries(include)) {
      if (!v) continue;
      result[k] = loadRelation(model, row, k, v === true ? {} : (v as Row));
    }
  }
  return result;
}

function loadRelation(model: string, row: Row, relName: string, args: Row): any {
  const f = models[model].fields[relName];
  const related = findRelated(model, row, relName);
  if (f.list) {
    let list = (related as Row[]).filter((r) => matchesWhere(f.type, r, args.where));
    list = applyOrder(f.type, list, args.orderBy);
    if (args.skip) list = list.slice(args.skip);
    if (args.take != null) list = list.slice(0, args.take);
    return list.map((r) => shape(f.type, r, args));
  }
  if (!related) return null;
  return shape(f.type, related as Row, args);
}

// ── Запись ──

function uuid(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildRow(model: string, data: Row): Row {
  const m = models[model];
  const row: Row = {};
  for (const [fname, f] of Object.entries(m.fields)) {
    if (f.isRelation) continue;
    let v = data[fname];
    if (v === undefined) {
      if (f.default) {
        if (f.default.kind === "uuid") v = uuid();
        else if (f.default.kind === "now") v = new Date();
        else v = f.default.value;
      } else if (f.updatedAt) v = new Date();
      else if (f.list) v = [];
      else v = null;
    }
    if (v instanceof Date) v = new Date(v.getTime());
    else if (f.type === "DateTime" && typeof v === "string") v = new Date(v);
    row[fname] = v;
  }
  return row;
}

function checkUnique(model: string, row: Row, ignore?: Row) {
  const m = models[model];
  const keys: string[][] = [...m.uniques];
  const idField = Object.entries(m.fields).find(([, f]) => f.id)?.[0];
  if (idField) keys.push([idField]);
  for (const key of keys) {
    if (key.some((k) => row[k] == null)) continue;
    const clash = tables[model].find((r) => r !== ignore && key.every((k) => eq(r[k], row[k])));
    if (clash) {
      const err: any = new Error(`Нарушена уникальность ${model}(${key.join(", ")})`);
      err.code = "P2002";
      throw err;
    }
  }
}

// Нормализуем where для поиска по уникальному ключу (userId_date → поля внутри).
function flattenUnique(where: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === "object" && !(v instanceof Date) && k.includes("_") && !Array.isArray(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
}

function applyUpdate(model: string, row: Row, data: Row) {
  const m = models[model];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const f = m.fields[k];
    if (!f) throw new Error(`Неизвестное поле ${model}.${k}`);
    if (f.isRelation) throw new Error("Изменение связей через update не поддерживается");
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && f.type !== "Json") {
      const op = v as Row;
      if ("increment" in op) row[k] = (row[k] ?? 0) + op.increment;
      else if ("decrement" in op) row[k] = (row[k] ?? 0) - op.decrement;
      else if ("set" in op) row[k] = op.set;
      else row[k] = v;
    } else {
      row[k] = v instanceof Date ? new Date(v.getTime()) : v;
    }
  }
  for (const [fname, f] of Object.entries(m.fields)) if (f.updatedAt) row[fname] = new Date();
}

// При удалении: каскадом удаляем зависимые строки или обнуляем ссылки (как в базе).
function removeRow(model: string, row: Row) {
  tables[model] = tables[model].filter((r) => r !== row);
  scheduleFlush(model);
  for (const [childName, child] of Object.entries(models)) {
    for (const [, cf] of Object.entries(child.fields)) {
      if (!cf.isRelation || cf.type !== model || !cf.relation?.fields.length) continue;
      const fk = cf.relation.fields[0];
      const ref = cf.relation.references[0];
      const kids = tables[childName].filter((r) => r[fk] != null && eq(r[fk], row[ref]));
      for (const kid of kids) {
        if (cf.relation.onDelete === "Cascade") removeRow(childName, kid);
        else if (cf.relation.onDelete === "SetNull") {
          kid[fk] = null;
          scheduleFlush(childName);
        }
      }
    }
  }
}

function delegate(model: string) {
  const find = (where?: Row) => {
    const w = where ? flattenUnique(where) : undefined;
    return tables[model].filter((r) => matchesWhere(model, r, w));
  };
  const one = (args: Row) => {
    let rows = find(args.where);
    rows = applyOrder(model, rows, args.orderBy);
    if (args.skip) rows = rows.slice(args.skip);
    return rows[0];
  };
  const api = {
    async findMany(args: Row = {}) {
      let rows = find(args.where);
      rows = applyOrder(model, rows, args.orderBy);
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take != null) rows = rows.slice(0, args.take);
      if (args.distinct) {
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const key = JSON.stringify(args.distinct.map((d: string) => norm(r[d])));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      return rows.map((r) => shape(model, r, args));
    },
    async findFirst(args: Row = {}) {
      const r = one(args);
      return r ? shape(model, r, args) : null;
    },
    async findUnique(args: Row) {
      const r = one(args);
      return r ? shape(model, r, args) : null;
    },
    async findFirstOrThrow(args: Row = {}) {
      const r = one(args);
      if (!r) throw Object.assign(new Error("Запись не найдена"), { code: "P2025" });
      return shape(model, r, args);
    },
    async findUniqueOrThrow(args: Row) {
      const r = one(args);
      if (!r) throw Object.assign(new Error("Запись не найдена"), { code: "P2025" });
      return shape(model, r, args);
    },
    async count(args: Row = {}) {
      return find(args.where).length;
    },
    async create(args: Row) {
      const row = buildRow(model, args.data);
      checkUnique(model, row);
      tables[model].push(row);
      scheduleFlush(model);
      return shape(model, row, args);
    },
    async createMany(args: Row) {
      const list: Row[] = Array.isArray(args.data) ? args.data : [args.data];
      for (const d of list) {
        const row = buildRow(model, d);
        checkUnique(model, row);
        tables[model].push(row);
      }
      scheduleFlush(model);
      return { count: list.length };
    },
    async update(args: Row) {
      const row = one(args);
      if (!row) throw Object.assign(new Error("Запись не найдена"), { code: "P2025" });
      const draft = { ...row };
      applyUpdate(model, draft, args.data);
      checkUnique(model, draft, row);
      Object.assign(row, draft);
      scheduleFlush(model);
      return shape(model, row, args);
    },
    async updateMany(args: Row) {
      const rows = find(args.where);
      for (const row of rows) applyUpdate(model, row, args.data);
      if (rows.length) scheduleFlush(model);
      return { count: rows.length };
    },
    async upsert(args: Row) {
      const row = one(args);
      if (row) {
        const draft = { ...row };
        applyUpdate(model, draft, args.update ?? {});
        checkUnique(model, draft, row);
        Object.assign(row, draft);
        scheduleFlush(model);
        return shape(model, row, args);
      }
      const created = buildRow(model, { ...flattenUnique(args.where ?? {}), ...args.create });
      checkUnique(model, created);
      tables[model].push(created);
      scheduleFlush(model);
      return shape(model, created, args);
    },
    async delete(args: Row) {
      const row = one(args);
      if (!row) throw Object.assign(new Error("Запись не найдена"), { code: "P2025" });
      const snapshot = shape(model, row, args);
      removeRow(model, row);
      return snapshot;
    },
    async deleteMany(args: Row = {}) {
      const rows = find(args.where);
      for (const row of rows) removeRow(model, row);
      return { count: rows.length };
    },
    async aggregate(args: Row) {
      const rows = find(args.where);
      const out: Row = {};
      for (const op of ["_sum", "_avg", "_min", "_max"]) {
        if (!args[op]) continue;
        out[op] = {};
        for (const field of Object.keys(args[op])) {
          const vals = rows.map((r) => r[field]).filter((v) => v != null) as number[];
          if (op === "_sum") out[op][field] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
          if (op === "_avg") out[op][field] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          if (op === "_min") out[op][field] = vals.length ? Math.min(...vals) : null;
          if (op === "_max") out[op][field] = vals.length ? Math.max(...vals) : null;
        }
      }
      if (args._count) out._count = rows.length;
      return out;
    },
  };
  return api;
}

// ── Клиент ──

let txChain: Promise<unknown> = Promise.resolve();

function snapshotTables(): Record<string, Row[]> {
  const snap: Record<string, Row[]> = {};
  for (const [n, rows] of Object.entries(tables)) snap[n] = rows.map((r) => cloneValue(r));
  return snap;
}

const client: any = {
  // Транзакция: если внутри случилась ошибка, все изменения откатываются.
  async $transaction(arg: any) {
    const run = async () => {
      const snap = snapshotTables();
      try {
        if (typeof arg === "function") return await arg(client);
        return await Promise.all(arg);
      } catch (e) {
        for (const n of Object.keys(snap)) {
          tables[n] = snap[n];
          scheduleFlush(n);
        }
        throw e;
      }
    };
    const next = txChain.then(run, run);
    txChain = next.catch(() => {});
    return next;
  },
};
for (const name of Object.keys(models)) client[lc(name)] = delegate(name);

export const prisma = client;
export default prisma;
