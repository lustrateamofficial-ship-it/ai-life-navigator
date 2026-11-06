import { useState } from "react";
import { api } from "../api/client";
import { hapticNotification } from "../platform/sdk";
import { flattenProposals, pickSelected, type Proposals } from "./JournalComposer";

// Кнопка «В задачи» у старой записи: ИИ ищет в тексте дела, напоминания, траты и предлагает их,
// а человек отмечает нужное. Пока не нажато «Добавить», ничего не создаётся.
export function EntryToTasks({ entryId, onDone }: { entryId: string; onDone?: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "review" | "empty" | "error" | "done">("idle");
  const [proposals, setProposals] = useState<Proposals | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(0);

  async function find() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await api.post<{ aiAvailable: boolean; proposals: Proposals }>(`/journal/${entryId}/analyze`);
      const rows = flattenProposals(res.proposals);
      if (rows.length === 0) return setState(res.aiAvailable === false ? "error" : "empty");
      setProposals(res.proposals);
      setSelected(new Set(rows.map((r) => r.key)));
      setState("review");
    } catch {
      setState("error");
    }
  }

  async function add() {
    if (!proposals) return;
    const chosen = pickSelected(proposals, selected);
    const n = flattenProposals(chosen).length;
    if (n === 0) return setState("idle");
    setState("loading");
    try {
      await api.post(`/journal/${entryId}/apply`, chosen);
      hapticNotification("success");
      setCount(n);
      setState("done");
      onDone?.();
    } catch {
      hapticNotification("error");
      setState("error");
    }
  }

  if (state === "idle")
    return (
      <button className="small-btn" onClick={find} style={{ marginTop: 8 }}>
        В задачи
      </button>
    );
  if (state === "loading") return <p className="small" style={{ marginTop: 8 }}>Ищу дела в записи...</p>;
  if (state === "empty") return <p className="small" style={{ marginTop: 8 }}>В этой записи нет дел, напоминаний или трат.</p>;
  if (state === "error")
    return (
      <p className="small" style={{ marginTop: 8 }}>
        Не получилось. Проверь ИИ в Настройках и попробуй ещё раз.{" "}
        <button className="small-btn" onClick={() => setState("idle")}>Ещё раз</button>
      </p>
    );
  if (state === "done") return <p className="small ok" role="status" style={{ marginTop: 8 }}>Добавлено: {count}. Всё можно поправить в разделах.</p>;
  return (
    <div className="review" style={{ marginTop: 10 }}>
      <p className="small" style={{ marginBottom: 6 }}>Ничего не сохранится, пока не нажмёшь «Добавить».</p>
      {proposals &&
        flattenProposals(proposals).map((row) => (
          <label key={row.key} className="check-row">
            <input
              type="checkbox"
              checked={selected.has(row.key)}
              onChange={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(row.key)) next.delete(row.key);
                  else next.add(row.key);
                  return next;
                })
              }
            />
            <span>{row.label}</span>
          </label>
        ))}
      <div className="actions">
        <button className="secondary" onClick={() => setState("idle")}>Не нужно</button>
        <button className="primary" onClick={add} disabled={selected.size === 0}>Добавить ({selected.size})</button>
      </div>
    </div>
  );
}
