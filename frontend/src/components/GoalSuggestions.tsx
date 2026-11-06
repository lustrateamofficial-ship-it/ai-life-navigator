import { useState } from "react";
import { api, ApiError } from "../api/client";
import { hapticNotification } from "../telegram/sdk";

interface Suggestion {
  title: string;
  why: string;
  quote: string;
}

// Цели из дневника: предлагаются только темы, о которых человек сам писал. Цель создаётся
// только по нажатию «Сделать целью», ничего не появляется само.
export function GoalSuggestions({ onCreated }: { onCreated: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyTitle, setBusyTitle] = useState<string | null>(null);

  async function load() {
    if (loading) return;
    setLoading(true);
    setReason(null);
    try {
      const res = await api.post<{ suggestions: Suggestion[]; reason?: string }>("/home/goal-suggestions");
      setItems(res.suggestions);
      setReason(res.suggestions.length === 0 ? res.reason ?? "Ничего определённого по записям пока не видно." : null);
    } catch (err) {
      setItems([]);
      setReason(err instanceof ApiError ? err.message : "Не получилось сейчас. Попробуй позже.");
    } finally {
      setLoading(false);
    }
  }

  async function accept(s: Suggestion) {
    if (busyTitle) return;
    setBusyTitle(s.title);
    try {
      await api.post("/goals", { title: s.title, reason: s.why });
      hapticNotification("success");
      setItems((prev) => (prev ?? []).filter((x) => x.title !== s.title));
      onCreated();
    } finally {
      setBusyTitle(null);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Цели из дневника</div>
      <p style={{ marginBottom: 8, fontSize: 13 }}>
        Темы, о которых ты сам писал в дневнике. Личные записи не используются.
      </p>
      <button className="secondary" style={{ width: "100%" }} onClick={load} disabled={loading}>
        {loading ? "Читаю..." : "Подсказать из записей"}
      </button>

      {items?.map((s) => (
        <div key={s.title} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text)", fontWeight: 600 }}>{s.title}</p>
          <p style={{ marginTop: 2 }}>{s.why}</p>
          <blockquote className="quote">«{s.quote}»</blockquote>
          <button className="primary compact" style={{ marginTop: 10 }} onClick={() => accept(s)} disabled={busyTitle === s.title}>
            {busyTitle === s.title ? "Создаю..." : "Сделать целью"}
          </button>
        </div>
      ))}
      {reason && <p style={{ marginTop: 12 }}>{reason}</p>}
    </div>
  );
}
