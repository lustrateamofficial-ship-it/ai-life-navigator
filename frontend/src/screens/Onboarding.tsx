import { useState } from "react";
import { api } from "../api/client";
import { hapticNotification } from "../telegram/sdk";

interface Props {
  onDone: () => void;
}

// Раньше первый запуск требовал шесть вопросов про миссию. Дневник — основа приложения, поэтому теперь
// вход один: первая запись. Цели приложение предложит позже, по тому, о чём человек пишет сам.
// Миссию можно заполнить когда угодно в разделе «Я».
export function Onboarding({ onDone }: Props) {
  const [text, setText] = useState("");
  const [privateEntry, setPrivateEntry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<Array<{ label: string; contact: string }> | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let entry: { support: { resources: Array<{ label: string; contact: string }> } | null } | null = null;
      if (text.trim()) entry = await api.post("/journal", { content: text, private: privateEntry });
      await api.put("/profile", { onboardingDone: true });
      hapticNotification("success");
      // Если первая запись звучит тяжело, сначала показываем поддержку, а не уводим человека дальше.
      if (entry?.support) setSupport(entry.support.resources);
      else onDone();
    } catch {
      setError("Не получилось сохранить. Проверь соединение и попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (support) {
    return (
      <div className="screen">
        <div className="card support" role="status">
          <div className="card-title">Я рядом</div>
          <p style={{ marginBottom: 10 }}>
            Запись сохранена. То, что ты написал, звучит тяжело, и это важно. Если можешь, расскажи о том, как тебе
            сейчас, кому-то из близких. Ты не обязан справляться один.
          </p>
          {support.map((r) => (
            <p key={r.label} style={{ marginBottom: 6 }}>
              {r.label}: <b>{r.contact}</b>
            </p>
          ))}
          <p style={{ marginTop: 10, fontSize: 13 }}>
            Я приложение, а не специалист, и помочь так, как может живой человек, не могу.
          </p>
        </div>
        <button className="primary" onClick={onDone}>
          Продолжить
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="page-header">
        <h2>Навигатор Жизни</h2>
        <p>Дневник, из которого вырастают задачи, цели и учёт.</p>
      </header>

      <div className="composer">
        <textarea
          rows={5}
          aria-label="Первая запись"
          placeholder="Что сейчас на уме? Что для тебя важно, что беспокоит, чего хочешь. Пиши как есть."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="composer-bar">
          <label className={`private-toggle ${privateEntry ? "on" : ""}`}>
            <input type="checkbox" checked={privateEntry} onChange={(e) => setPrivateEntry(e.target.checked)} />
            {privateEntry ? "AI не увидит" : "Личная запись"}
          </label>
        </div>
      </div>

      <p style={{ marginBottom: 16, fontSize: 13 }}>
        Записи доступны только тебе. Личные записи не отправляются во внешние AI-сервисы. Пустую запись можно не писать.
      </p>

      <button className="primary" onClick={start} disabled={busy}>
        {busy ? "Сохраняю..." : text.trim() ? "Записать и начать" : "Начать без записи"}
      </button>
      {error && <p style={{ marginTop: 10, color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
