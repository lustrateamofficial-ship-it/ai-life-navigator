import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { biometricAuthenticate, isBiometricAvailable } from "../telegram/sdk";
import { isLockEnabled, setLockEnabled, RELOCK_AFTER_MS } from "../telegram/appLock";

// Закрывает приложение экраном блокировки: при запуске и когда оно было свёрнуто дольше двух минут.
// Это защита экрана на этом устройстве (чтобы запись не прочитал тот, кому телефон дали на минуту),
// а не шифрование данных: сессия Telegram и сервер остаются как есть.
export function AppLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(isLockEnabled());
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      if (!(await isBiometricAvailable())) {
        setUnavailable(true);
        return;
      }
      setUnavailable(false);
      if (await biometricAuthenticate("Открыть дневник")) setLocked(false);
    } finally {
      setChecking(false);
    }
  }, [checking]);

  // Сразу после запуска пробуем открыть без лишнего нажатия.
  useEffect(() => {
    if (locked) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (isLockEnabled() && away >= RELOCK_AFTER_MS) {
        setLocked(true);
        void unlock();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [unlock]);

  if (!locked) return <>{children}</>;

  return (
    <div className="screen lock-screen">
      <h2>Приложение закрыто</h2>
      <p style={{ marginBottom: 16 }}>
        {unavailable
          ? "На этом устройстве биометрия недоступна, поэтому открыть приложение нельзя. Блокировку можно отключить."
          : "Подтверди вход отпечатком или лицом."}
      </p>
      {!unavailable && (
        <button className="primary" onClick={unlock} disabled={checking}>
          {checking ? "Проверяю..." : "Открыть"}
        </button>
      )}
      {unavailable && (
        <button
          className="secondary"
          style={{ width: "100%" }}
          onClick={() => {
            setLockEnabled(false);
            setLocked(false);
          }}
        >
          Отключить блокировку
        </button>
      )}
    </div>
  );
}
