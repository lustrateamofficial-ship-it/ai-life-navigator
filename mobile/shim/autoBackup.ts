// Автокопия: раз в сутки (при открытии приложения) копия данных пишется в папку, которую человек выбрал один раз.
// Папку можно выбрать на Google Диске: Android показывает Диск как обычное хранилище.
// Хранятся последние 7 копий, старые удаляются. Копию можно зашифровать паролем.
import { localRequest, ready } from "./server";
import { encryptBackup } from "./backupCrypto";
import { isNative } from "./native";
import { nativeFolderInfo, nativePruneBackups, nativeWriteBackup } from "./nativeExtras";

const KEY = "navigator:autobackup";
const PREFIX = "navigator-";
const KEEP = 7;
const EVERY_MS = 20 * 3600_000;

export interface AutoBackupState {
  enabled: boolean;
  password: string; // пустой: копия открытым текстом
  lastAt: string | null;
  lastError: string | null;
}

const DEFAULT: AutoBackupState = { enabled: false, password: "", lastAt: null, lastError: null };

export function readAutoBackup(): AutoBackupState {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (r && typeof r === "object") {
      return {
        enabled: r.enabled === true,
        password: typeof r.password === "string" ? r.password : "",
        lastAt: typeof r.lastAt === "string" && !isNaN(Date.parse(r.lastAt)) ? r.lastAt : null,
        lastError: typeof r.lastError === "string" ? r.lastError : null,
      };
    }
  } catch {
    /* повреждено: значения по умолчанию */
  }
  return { ...DEFAULT };
}

export function writeAutoBackup(s: AutoBackupState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* не сохранится */
  }
  window.dispatchEvent(new Event("navigator:autobackup"));
}

export function autoBackupDue(s: AutoBackupState, now = Date.now()): boolean {
  if (!s.enabled) return false;
  if (!s.lastAt) return true;
  return now - Date.parse(s.lastAt) >= EVERY_MS;
}

let running: Promise<boolean> | null = null;

// force: сделать сейчас, не дожидаясь суток («Скопировать сейчас»)
export function runAutoBackup(force = false): Promise<boolean> {
  if (!isNative()) return Promise.resolve(false);
  if (!running) running = doBackup(force).finally(() => (running = null));
  return running;
}

async function doBackup(force: boolean): Promise<boolean> {
  const s = readAutoBackup();
  if (!s.enabled || (!force && !autoBackupDue(s))) return false;
  try {
    const folder = await nativeFolderInfo();
    if (!folder.configured || !folder.ok) throw new Error("Папка недоступна: выбери её заново");
    await ready();
    const res = await localRequest("GET", "/account/export");
    if (res.status >= 400) throw new Error("Не удалось собрать данные");
    let text = new TextDecoder().decode(res.body as unknown as Uint8Array);
    if (s.password) {
      if (!globalThis.crypto?.subtle) throw new Error("Шифрование недоступно на этом устройстве");
      text = await encryptBackup(text, s.password);
    }
    const day = new Date().toISOString().slice(0, 10);
    await nativeWriteBackup(`${PREFIX}${day}.json`, text);
    await nativePruneBackups(PREFIX, KEEP);
    writeAutoBackup({ ...readAutoBackup(), lastAt: new Date().toISOString(), lastError: null });
    return true;
  } catch (e: any) {
    writeAutoBackup({ ...readAutoBackup(), lastError: String(e?.message ?? e ?? "ошибка").slice(0, 200) });
    return false;
  }
}

export function startAutoBackup() {
  setTimeout(() => void runAutoBackup().catch(() => {}), 6000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void runAutoBackup().catch(() => {});
  });
}
