import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { readSettings, writeSettings } from "../../shim/env";
import { readEvening, writeEvening } from "../../shim/evening";
import { isNative, nativeAskNotifications, nativeNotificationState, syncNativeReminders } from "../../shim/native";

const HIDE = "navigator:setup-hidden";

function hasKey() {
  const s = readSettings();
  return !!(s.anthropicApiKey || s.openaiApiKey || s.geminiApiKey || s.deepseekApiKey || s.groqApiKey || (s.services ?? []).some((x) => x.enabled && x.key));
}

async function notifGranted(): Promise<boolean> {
  if (isNative()) return (await nativeNotificationState()) === "granted";
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

// Быстрая настройка на главном экране: ключ ИИ и напоминания, не заходя в «Настройки».
// Пропадает, когда всё настроено, или по кнопке «Позже».
export function SetupCard() {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE) === "1";
    } catch {
      return false;
    }
  });
  const [keyOk, setKeyOk] = useState(hasKey());
  const [notifOk, setNotifOk] = useState<boolean | null>(null);
  const [eveningOn, setEveningOn] = useState(readEvening().enabled);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");

  if (notifOk === null) void notifGranted().then(setNotifOk);

  const remindersOk = notifOk === true && eveningOn;
  if (hidden || notifOk === null || (keyOk && remindersOk)) return null;

  function saveKey() {
    const k = key.trim();
    if (k.length < 20 || /\s/.test(k)) {
      setMsg("Ключ выглядит слишком коротким. Скопируй его целиком.");
      return;
    }
    const patch = k.startsWith("sk-ant-")
      ? { anthropicApiKey: k }
      : k.startsWith("AIza")
        ? { geminiApiKey: k }
        : k.startsWith("gsk_")
          ? { groqApiKey: k }
          : k.startsWith("sk-proj-")
            ? { openaiApiKey: k }
            : null;
    if (!patch) {
      setMsg("Не удалось понять, чей это ключ. Добавь его в «Настройках», там поля подписаны.");
      return;
    }
    writeSettings(patch);
    setKeyOk(true);
    setKey("");
    setMsg("");
  }

  async function enableReminders() {
    setMsg("");
    let granted = false;
    if (isNative()) granted = (await nativeAskNotifications()) === "granted";
    else if (typeof Notification !== "undefined") granted = (await Notification.requestPermission()) === "granted";
    setNotifOk(granted);
    if (!granted) {
      setMsg("Уведомления запрещены. Разреши их в настройках телефона для этого приложения.");
      return;
    }
    const cur = readEvening();
    writeEvening({ ...cur, enabled: true });
    setEveningOn(true);
    void syncNativeReminders();
  }

  function later() {
    try {
      localStorage.setItem(HIDE, "1");
    } catch {
      /* не запомнится: плашка покажется снова */
    }
    setHidden(true);
  }

  return (
    <div className="card">
      <div className="card-title">Быстрая настройка</div>
      {!keyOk && (
        <div style={{ marginBottom: 14 }}>
          <p className="small" style={{ marginBottom: 8 }}>
            <b>1. ИИ-подсказки.</b> Нужен бесплатный ключ Gemini: без карты и оплаты. Открой страницу, войди в аккаунт Google, создай ключ и вставь его сюда. Другие бесплатные сервисы (Groq, OpenRouter, Cerebras и другие) добавляются в «Настройках», они подстрахуют, если у одного кончится лимит.
          </p>
          <button type="button" className="secondary" style={{ width: "100%", marginBottom: 8 }} onClick={() => window.open("https://aistudio.google.com/apikey", "_blank", "noopener")}>
            Получить бесплатный ключ
          </button>
          <input
            aria-label="Ключ ИИ"
            placeholder="Вставь ключ сюда"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" className="primary" style={{ marginTop: 8, width: "100%" }} onClick={saveKey} disabled={!key.trim()}>
            Сохранить ключ
          </button>
        </div>
      )}
      {!remindersOk && (
        <div style={{ marginBottom: 14 }}>
          <p className="small" style={{ marginBottom: 8 }}>
            <b>{keyOk ? "1" : "2"}. Напоминания.</b> Приложение напомнит о делах и вечером спросит, как прошёл день.
            {isNative() ? " Если телефон экономит заряд, разреши приложению работать в фоне." : ""}
          </p>
          <button type="button" className="primary" style={{ width: "100%" }} onClick={enableReminders}>
            Включить напоминания
          </button>
        </div>
      )}
      {msg && <p className="small" role="alert" style={{ marginBottom: 10 }}>{msg}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => navigate("/settings")}>Все настройки</button>
        <button type="button" className="secondary" style={{ flex: 1 }} onClick={later}>Позже</button>
      </div>
    </div>
  );
}
