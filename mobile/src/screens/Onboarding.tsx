import { useState } from "react";
import { api } from "../api/client";
import { hapticNotification } from "../platform/sdk";
import { JournalComposer } from "../components/JournalComposer";

interface Props {
  onDone: () => void;
}

// Вход один: первая запись. Поле записи то же, что на главном экране, поэтому тяжёлую запись
// сопровождает поддержка, а обычную приложение разбирает и предлагает добавить задачи и траты.
// Цели приложение предложит позже, по тому, о чём человек пишет сам. Миссию можно заполнить в разделе «Я».
export function Onboarding({ onDone }: Props) {
  const [wrote, setWrote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.put("/profile", { onboardingDone: true });
      hapticNotification("success");
      onDone();
    } catch {
      setError("Не получилось сохранить. Закрой приложение и открой снова.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="page-header">
        <h2>Навигатор Жизни</h2>
        <p>Дневник, из которого вырастают задачи, цели и учёт.</p>
      </header>

      <JournalComposer
        onSaved={() => setWrote(true)}
        placeholder="Что сейчас на уме? Что для тебя важно, что беспокоит, чего хочешь. Пиши как есть."
      />

      <p style={{ margin: "16px 0", fontSize: 13 }}>
        Записи доступны только тебе. Личные записи не отправляются во внешние ИИ-сервисы. Пустую запись можно не писать.
      </p>

      <button className="primary" onClick={start} disabled={busy}>
        {busy ? "Сохраняю..." : wrote ? "Продолжить" : "Начать без записи"}
      </button>
      {error && <p style={{ marginTop: 10, color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
