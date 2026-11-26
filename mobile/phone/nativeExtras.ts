// Возможности Android, которых нет в обычных плагинах: быстрые записи вне приложения, голос,
// автокопия в выбранную папку. Работает только в оболочке Android; в браузере всё молча недоступно.
import { isNative } from "./native";

function plugin(): any | null {
  try {
    const cap = (window as any).Capacitor;
    return cap?.Plugins?.NavigatorNative ?? cap?.registerPlugin?.("NavigatorNative") ?? null;
  } catch {
    return null;
  }
}

export interface QuickNote {
  text: string;
  ts: number;
}

export async function nativeDrainNotes(): Promise<QuickNote[]> {
  if (!isNative()) return [];
  try {
    const r = await plugin()?.drainNotes();
    return Array.isArray(r?.notes) ? r.notes.filter((n: any) => n && typeof n.text === "string" && n.text.trim()) : [];
  } catch {
    return [];
  }
}

export async function nativePutBackNotes(notes: QuickNote[]) {
  try {
    await plugin()?.putBackNotes({ notes });
  } catch {
    /* остаётся шанс, что записи уже сохранены */
  }
}

export async function nativeQuickNotificationState(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return Boolean((await plugin()?.quickNotificationState())?.enabled);
  } catch {
    return false;
  }
}

export async function nativeSetQuickNotification(enabled: boolean): Promise<boolean> {
  try {
    return Boolean((await plugin()?.setQuickNotification({ enabled }))?.enabled);
  } catch {
    return false;
  }
}

// Голосовой ввод: на Android системное окно распознавания, в браузере Chrome встроенное распознавание речи.
export type ListenResult = { ok: true; text: string } | { ok: false; reason: "cancelled" | "unavailable" | "error" };

export function voiceSupported(): boolean {
  if (isNative()) return Boolean(plugin());
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export async function listenOnce(): Promise<ListenResult> {
  if (isNative()) {
    try {
      const r = await plugin()?.listen();
      const text = String(r?.text ?? "").trim();
      return text ? { ok: true, text } : { ok: false, reason: "cancelled" };
    } catch (e: any) {
      const m = String(e?.message ?? e ?? "");
      return { ok: false, reason: m.includes("cancel") ? "cancelled" : m.includes("unavailable") ? "unavailable" : "error" };
    }
  }
  const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Rec) return { ok: false, reason: "unavailable" };
  return new Promise((resolve) => {
    const rec = new Rec();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    const finish = (r: ListenResult) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    rec.onresult = (ev: any) => finish({ ok: true, text: String(ev.results?.[0]?.[0]?.transcript ?? "").trim() });
    rec.onerror = (ev: any) => finish({ ok: false, reason: ev?.error === "no-speech" || ev?.error === "aborted" ? "cancelled" : ev?.error === "not-allowed" ? "unavailable" : "error" });
    rec.onend = () => finish({ ok: false, reason: "cancelled" });
    try {
      rec.start();
    } catch {
      finish({ ok: false, reason: "error" });
    }
  });
}

// Папка для автокопий
export interface FolderInfo {
  configured: boolean;
  ok: boolean;
  name: string;
}

export async function nativeFolderInfo(): Promise<FolderInfo> {
  if (!isNative()) return { configured: false, ok: false, name: "" };
  try {
    const r = await plugin()?.backupFolderInfo();
    return { configured: !!r?.configured, ok: !!r?.ok, name: String(r?.name ?? "") };
  } catch {
    return { configured: false, ok: false, name: "" };
  }
}

export async function nativePickFolder(): Promise<FolderInfo | null> {
  try {
    const r = await plugin()?.pickBackupFolder();
    return { configured: !!r?.configured, ok: !!r?.ok, name: String(r?.name ?? "") };
  } catch {
    return null;
  }
}

export async function nativeForgetFolder() {
  try {
    await plugin()?.forgetBackupFolder();
  } catch {
    /* папка уже недоступна */
  }
}

export async function nativeWriteBackup(name: string, data: string): Promise<void> {
  const p = plugin();
  if (!p) throw new Error("Автокопия доступна только в приложении на Android");
  await p.writeBackup({ name, data });
}

export async function nativePruneBackups(prefix: string, keep: number) {
  try {
    await plugin()?.pruneBackups({ prefix, keep });
  } catch {
    /* лишние копии просто останутся */
  }
}
