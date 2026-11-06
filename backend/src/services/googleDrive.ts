import { env } from "../config/env.js";

// Резервные копии в Google Drive. Используем ограниченный scope "drive.file" —
// приложение видит и может трогать ТОЛЬКО файлы, которые само создало, не весь диск
// пользователя целиком. Реализовано через сырые REST-вызовы к Google OAuth2/Drive API,
// без пакета googleapis — он весит десятки МБ ради нескольких вызовов, которые нужны здесь.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Навигатор Жизни — бэкапы";

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // нужен refresh_token, а не только часовой access_token
    prompt: "consent", // иначе Google не вернёт refresh_token при повторном подключении
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.googleRedirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as TokenResponse;
  return data.access_token;
}

// Находит (или создаёт при первом разе) папку для бэкапов — чтобы файлы не разлетались
// по корню диска пользователя вперемешку с остальным.
export async function ensureBackupFolder(accessToken: string, existingFolderId?: string | null): Promise<string> {
  if (existingFolderId) {
    // Проверяем, что папка всё ещё существует (пользователь мог удалить её руками).
    const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFolderId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (checkRes.ok) {
      const data = await checkRes.json();
      if (!data.trashed) return existingFolderId;
    }
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!createRes.ok) throw new Error(`Не удалось создать папку в Google Drive: ${createRes.status}`);
  const folder = await createRes.json();
  return folder.id as string;
}

// БАГ, которого не должно было случиться: первая версия собирала multipart-тело через
// строковую конкатенацию (`content.toString("utf-8")`) — это безопасно для обычного JSON,
// но ПОВРЕЖДАЕТ бинарные данные (gzip), потому что некоторые байтовые последовательности
// в бинарном потоке не представимы как валидная UTF-8-строка и искажаются туда-обратно.
// Здесь тело собирается из Buffer'ов, а не строк, поэтому бинарное содержимое (gzip)
// доходит до Google побайтово в точности таким, какое было.
export async function uploadBackupFile(
  accessToken: string,
  folderId: string,
  filename: string,
  content: Buffer,
  mimeType: string
): Promise<void> {
  const boundary = "navigator_backup_boundary";
  const metadata = JSON.stringify({ name: filename, parents: [folderId], mimeType });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) throw new Error(`Не удалось загрузить файл в Google Drive: ${res.status} ${await res.text()}`);
}

// Ротация старых копий — чтобы папка с бэкапами не росла бесконечно. Экономия места
// здесь не "хранить меньше подробностей в каждом файле", а "хранить меньше файлов":
// каждый отдельный бэкап остаётся полным, просто старые со временем убираются.
export async function listBackupFiles(
  accessToken: string,
  folderId: string
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,createdTime)",
    orderBy: "createdTime desc",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Не удалось получить список файлов в Google Drive: ${res.status}`);
  const data = await res.json();
  return data.files ?? [];
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404 — файл уже удалён (например, руками) — не считаем это ошибкой.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Не удалось удалить старый бэкап из Google Drive: ${res.status}`);
  }
}

// Оставляет только последние keepCount файлов в папке бэкапов, остальные удаляет.
export async function pruneOldBackups(accessToken: string, folderId: string, keepCount: number): Promise<number> {
  const files = await listBackupFiles(accessToken, folderId); // уже отсортированы по дате, новые первыми
  const toDelete = files.slice(keepCount);
  for (const file of toDelete) {
    await deleteFile(accessToken, file.id);
  }
  return toDelete.length;
}
