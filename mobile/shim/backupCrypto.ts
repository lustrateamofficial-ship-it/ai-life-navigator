// Шифрование копии данных паролем: ключ из пароля (PBKDF2, SHA-256, 250 тысяч повторов), шифр AES-GCM.
// Пароль нигде не хранится. Забытый пароль восстановить нельзя.
const FORMAT = "navigator-encrypted";
const ITERATIONS = 250_000;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBackup(plain: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return JSON.stringify({ format: FORMAT, version: 1, iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) });
}

export function isEncryptedBackup(parsed: unknown): boolean {
  return Boolean(parsed && typeof parsed === "object" && (parsed as any).format === FORMAT);
}

// Бросает ошибку с понятным текстом, если пароль неверный или файл повреждён.
export async function decryptBackup(parsed: any, password: string): Promise<string> {
  try {
    const key = await deriveKey(password, fromB64(parsed.salt), Number(parsed.iterations) || ITERATIONS);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(parsed.iv) as BufferSource }, key, fromB64(parsed.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Не удалось расшифровать: неверный пароль или файл повреждён");
  }
}
