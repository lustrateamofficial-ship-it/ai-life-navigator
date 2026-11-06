import { applyAppearance } from "../../shim/appearance";

// Платформенные возможности телефона. Имя файла осталось прежним, чтобы экраны не менять:
// раньше здесь был Telegram, теперь — вибрация, системная тема и биометрия самого Android.

export function getTelegramWebApp() {
  return null;
}

// Тема и цвет системной панели теперь ведёт shim/appearance (системная, светлая, тёмная, по расписанию).
export function initTelegramApp() {
  applyAppearance();
}

export function getInitData(): string {
  return "";
}

function vibrate(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* не поддерживается */
  }
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  vibrate(style === "heavy" ? 30 : style === "medium" ? 20 : 10);
}

export function hapticNotification(type: "success" | "error" | "warning") {
  vibrate(type === "error" ? [20, 40, 20] : type === "warning" ? [15, 30] : 15);
}

export function hapticSelection() {
  vibrate(6);
}

export function openExternalLink(url: string) {
  window.open(url, "_blank", "noopener");
}

// ── Блокировка по отпечатку или лицу (WebAuthn: системное окно подтверждения Android) ──
// Это замок на экране приложения: он не шифрует данные, но не даёт открыть дневник постороннему.

import { isNative, nativeBiometricAvailable, nativeBiometricAuth } from "../../shim/native";

const CRED_KEY = "navigator:webauthn-credential";

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (isNative()) return (await nativeBiometricAvailable()) === true;
  try {
    const PK = (window as any).PublicKeyCredential;
    if (!PK?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PK.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function biometricAuthenticate(reason: string): Promise<boolean> {
  if (isNative()) return nativeBiometricAuth(reason);
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const stored = localStorage.getItem(CRED_KEY);
    if (stored) {
      const res = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: fromB64(stored) as BufferSource, type: "public-key" }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      return Boolean(res);
    }
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Навигатор Жизни" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "me", displayName: "Я" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(CRED_KEY, toB64(cred.rawId));
    return true;
  } catch {
    return false;
  }
}
