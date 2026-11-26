import { useEffect, useState } from "react";
import { dropReady, queueEvent, readPending, readReady, retryPending, type ReadyItem } from "../../phone/pendingAnalysis";
import { EntryToTasks } from "./EntryToTasks";

// Главный экран: что накопилось из отложенного разбора. Сначала «ждёт ИИ», потом готовые предложения на подтверждение.
export function ReadyAnalyses() {
  const [ready, setReady] = useState<ReadyItem[]>(readReady());
  const [waiting, setWaiting] = useState(readPending().length);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => {
      setReady(readReady());
      setWaiting(readPending().length);
    };
    window.addEventListener(queueEvent, on);
    return () => window.removeEventListener(queueEvent, on);
  }, []);

  async function again() {
    setBusy(true);
    try {
      await retryPending();
    } finally {
      setBusy(false);
    }
  }

  if (ready.length === 0 && waiting === 0) return null;
  return (
    <div className="card" id="ready-analyses">
      <div className="card-title">Разбор записей</div>
      {waiting > 0 && (
        <p className="small">
          Ждёт ИИ: {waiting}. Записи сохранены, как только сервис ответит, предложения появятся здесь сами.{" "}
          <button className="small-btn" onClick={again} disabled={busy}>
            {busy ? "Пробую…" : "Попробовать сейчас"}
          </button>
        </p>
      )}
      {ready.map((r) => (
        <div key={r.id} style={{ marginTop: 10 }}>
          <div className="list-sub">Из записи «{r.snippet}»</div>
          <EntryToTasks entryId={r.id} initial={r.proposals} onDone={() => setTimeout(() => dropReady(r.id), 2500)} onDismiss={() => dropReady(r.id)} />
        </div>
      ))}
    </div>
  );
}
