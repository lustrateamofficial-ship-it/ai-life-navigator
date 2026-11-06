import { useEffect, useState } from "react";
import { biometricAuthenticate, isBiometricAvailable } from "../telegram/sdk";
import { isLockEnabled, setLockEnabled } from "../telegram/appLock";

// Включение блокировки. Сначала проверяем, что биометрия действительно работает: иначе человек
// включил бы блокировку и не смог бы открыть собственный дневник.
export function AppLockCard() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(isLockEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isBiometricAvailable().then(setAvailable);
  }, []);

  async function toggle() {
    if (busy) return;
    setError(null);
    if (enabled) {
      setLockEnabled(false);
      setEnabled(false);
      return;
    }
    setBusy(true);
    try {
      if (await biometricAuthenticate("Включить блокировку входа")) {
        setLockEnabled(true);
        setEnabled(true);
      } else {
        setError("Не удалось подтвердить. Блокировка не включена.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Блокировка входа</div>
      <p style={{ marginBottom: 10 }}>
        Приложение просит отпечаток или лицо при запуске и после двух минут в свёрнутом виде. Работает только на этом
        устройстве. Это защита экрана, а не шифрование данных.
      </p>
      {available === false && <p>Биометрия Telegram недоступна на этом устройстве или в этой версии Telegram.</p>}
      {available && (
        <button className={enabled ? "secondary" : "primary"} style={{ width: "100%" }} onClick={toggle} disabled={busy}>
          {busy ? "Проверяю..." : enabled ? "Отключить блокировку" : "Включить блокировку"}
        </button>
      )}
      {error && <p style={{ marginTop: 8, color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
