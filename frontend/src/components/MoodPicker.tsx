import { useEffect, useState } from "react";
import { api } from "../api/client";
import { hapticSelection } from "../telegram/sdk";

export type Mood = "good" | "normal" | "bad";

// Три варианта — те же, что в вечернем вопросе бота («Хорошо / Нормально / Плохо»): это одна и та же
// оценка дня, поэтому ответ в боте и отметка здесь не расходятся.
const OPTIONS: Array<{ value: Mood; label: string; mouth: string }> = [
  { value: "good", label: "Хорошо", mouth: "M8 14c1 2 2.5 3 4 3s3-1 4-3" },
  { value: "normal", label: "Нормально", mouth: "M8.5 15.5h7" },
  { value: "bad", label: "Плохо", mouth: "M8 17c1-2 2.5-3 4-3s3 1 4 3" },
];

// Отметка настроения одним нажатием. Повторное нажатие на выбранный вариант снимает отметку.
export function MoodPicker({ initial }: { initial: Mood | null }) {
  const [value, setValue] = useState<Mood | null>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  async function choose(next: Mood) {
    if (busy) return;
    const target = value === next ? null : next;
    const previous = value;
    setValue(target); // сразу показываем выбор, не дожидаясь сети
    setBusy(true);
    hapticSelection();
    try {
      await api.put("/mood", { rating: target });
    } catch {
      setValue(previous); // не сохранилось: возвращаем прежнее значение, а не обманываем человека
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Как ты сегодня?</div>
      <div className="mood" role="group" aria-label="Настроение сегодня">
        {OPTIONS.map((o) => (
          <button key={o.value} className="mood-option" aria-pressed={value === o.value} onClick={() => choose(o.value)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="9.5" r="0.6" fill="currentColor" />
              <circle cx="15" cy="9.5" r="0.6" fill="currentColor" />
              <path d={o.mouth} />
            </svg>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
