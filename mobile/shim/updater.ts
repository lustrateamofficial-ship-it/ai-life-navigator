// Проверка обновлений через GitHub Releases: сборка в Actions выкладывает navigator.apk в релиз с тегом b<номер сборки>.
// Номер сборки (минуты с 1970 года) вшит в приложение и совпадает с versionCode в Android, поэтому «новее» = «число больше».
import { readSettings } from "./env";

declare const __APP_VERSION__: string;
declare const __APP_BUILD_CODE__: string;
declare const __APP_REPO__: string;

export const CURRENT_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const CURRENT_CODE = Number(typeof __APP_BUILD_CODE__ === "string" ? __APP_BUILD_CODE__ : 0) || 0;

export function updateRepo(): string {
  const s = readSettings() as Record<string, any>;
  const r = String(s.updateRepo || (typeof __APP_REPO__ === "string" ? __APP_REPO__ : "")).trim();
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : "";
}

export interface UpdateInfo {
  available: boolean;
  version: string;
  code: number;
  notes: string;
  size: number;
  apkUrl: string;
  pageUrl: string;
}
export type CheckResult = { ok: true; info: UpdateInfo; checkedAt: number } | { ok: false; error: string };

const LAST = "navigator:update-check";

export async function checkForUpdate(fetcher: typeof fetch = fetch): Promise<CheckResult> {
  const repo = updateRepo();
  if (!repo) return { ok: false, error: "Не указан репозиторий с обновлениями. Введи его в формате владелец/название." };
  let res: Response;
  try {
    res = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    return { ok: false, error: "Нет связи. Проверь интернет и попробуй ещё раз." };
  }
  if (res.status === 404) return { ok: false, error: "Релизов пока нет, либо репозиторий закрытый. Для обновлений из приложения репозиторий должен быть открытым." };
  if (res.status === 403 || res.status === 429) return { ok: false, error: "GitHub временно ограничил проверки. Попробуй через час." };
  if (!res.ok) return { ok: false, error: `Не удалось проверить обновление (${res.status}).` };
  let j: any;
  try {
    j = await res.json();
  } catch {
    return { ok: false, error: "GitHub вернул непонятный ответ." };
  }
  const code = Number(/^b(\d+)$/.exec(String(j?.tag_name ?? ""))?.[1] ?? 0);
  const asset = (Array.isArray(j?.assets) ? j.assets : []).find((a: any) => a?.name === "navigator.apk");
  if (!code || !asset?.browser_download_url) return { ok: false, error: "В последнем релизе нет файла navigator.apk." };
  const info: UpdateInfo = {
    available: code > CURRENT_CODE,
    version: String(j?.name || j?.tag_name),
    code,
    notes: String(j?.body ?? "").slice(0, 2000),
    size: Number(asset.size) || 0,
    apkUrl: String(asset.browser_download_url),
    pageUrl: String(j?.html_url ?? ""),
  };
  const result: CheckResult = { ok: true, info, checkedAt: Date.now() };
  try {
    localStorage.setItem(LAST, JSON.stringify(result));
  } catch {
    /* не запомнится: проверка просто повторится */
  }
  return result;
}

export function lastCheck(): CheckResult | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? "null");
    return v && v.ok && v.info ? (v as CheckResult) : null;
  } catch {
    return null;
  }
}

// Раз в сутки, тихо: нужен ли значок «есть обновление». Ошибки сети не показываются.
export async function autoCheck(): Promise<UpdateInfo | null> {
  const last = lastCheck();
  if (last && last.ok && Date.now() - last.checkedAt < 20 * 3600_000) return last.info.available && last.info.code > CURRENT_CODE ? last.info : null;
  const r = await checkForUpdate();
  return r.ok && r.info.available ? r.info : null;
}
