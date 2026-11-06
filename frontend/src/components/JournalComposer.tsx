import { useState } from "react";
import { api } from "../api/client";
import { hapticNotification, hapticSelection } from "../telegram/sdk";

interface SupportInfo {
  resources: Array<{ label: string; contact: string }>;
}

interface Proposals {
  tasks: Array<{ title: string; deadline?: string }>;
  reminders: Array<{ title: string; triggerAt: string }>;
  ideas: Array<{ content: string }>;
  transactions: Array<{ type: "income" | "expense"; amount: number; category: string; comment?: string }>;
  weight: { weightKg: number } | null;
  food: Array<{ rawInput: string }>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Плоский список предложений для показа: у каждого стабильный ключ вида "вид:номер",
// по нему отслеживается, что пользователь оставил отмеченным.
function flattenProposals(p: Proposals): Array<{ key: string; icon: string; label: string }> {
  const rows: Array<{ key: string; icon: string; label: string }> = [];
  p.tasks.forEach((t, i) =>
    rows.push({ key: `tasks:${i}`, icon: "", label: `Задача: ${t.title}${t.deadline ? ` (до ${fmtDate(t.deadline)})` : ""}` })
  );
  p.reminders.forEach((r, i) => rows.push({ key: `reminders:${i}`, icon: "", label: `Напоминание: ${r.title} — ${fmtDate(r.triggerAt)}` }));
  p.ideas.forEach((x, i) => rows.push({ key: `ideas:${i}`, icon: "", label: `Идея: ${x.content}` }));
  p.transactions.forEach((t, i) =>
    rows.push({
      key: `transactions:${i}`,
      icon: "",
      label: `${t.type === "income" ? "Доход" : "Расход"}: ${t.amount} — ${t.category}`,
    })
  );
  if (p.weight) rows.push({ key: "weight:0", icon: "", label: `Вес сегодня: ${p.weight.weightKg} кг` });
  p.food.forEach((f, i) => rows.push({ key: `food:${i}`, icon: "", label: `Приём пищи: ${f.rawInput}` }));
  return rows;
}

// Оставляет в предложениях только отмеченное пользователем.
function pickSelected(p: Proposals, selected: Set<string>): Proposals {
  return {
    tasks: p.tasks.filter((_, i) => selected.has(`tasks:${i}`)),
    reminders: p.reminders.filter((_, i) => selected.has(`reminders:${i}`)),
    ideas: p.ideas.filter((_, i) => selected.has(`ideas:${i}`)),
    transactions: p.transactions.filter((_, i) => selected.has(`transactions:${i}`)),
    weight: p.weight && selected.has("weight:0") ? p.weight : null,
    food: p.food.filter((_, i) => selected.has(`food:${i}`)),
  };
}

// Поле записи в дневник вместе с разбором и подтверждением. Используется и на главном
// экране, и на экране «Дневник», чтобы поведение было одинаковым.
export function JournalComposer({ onSaved, placeholder }: { onSaved?: () => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [privateEntry, setPrivateEntry] = useState(false);
  const [review, setReview] = useState<{ entryId: string; proposals: Proposals } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [support, setSupport] = useState<SupportInfo | null>(null);

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setReview(null);
    setNote(null);
    setSupport(null);
    try {
      const entry = await api.post<{ id: string; support: SupportInfo | null }>("/journal", { content: text, private: privateEntry });
      hapticNotification("success");
      setText("");
      onSaved?.();

      // Тяжёлая запись: вместо разбора на задачи показываем поддержку.
      if (entry.support) {
        setSupport(entry.support);
        return;
      }

      // Запись уже сохранена. Разбор на задачи/траты — необязательное дополнение: если он
      // не получился, запись остаётся, а пользователь просто не видит предложений.
      if (!privateEntry) {
        try {
          const res = await api.post<{ aiAvailable: boolean; proposals: Proposals }>(`/journal/${entry.id}/analyze`);
          const rows = flattenProposals(res.proposals);
          if (rows.length > 0) {
            setReview({ entryId: entry.id, proposals: res.proposals });
            setSelected(new Set(rows.map((r) => r.key)));
          }
        } catch {
          // тихо: запись сохранена, предложения просто не показываем
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function applyReview() {
    if (!review || applying) return;
    const chosen = pickSelected(review.proposals, selected);
    const count = flattenProposals(chosen).length;
    if (count === 0) {
      setReview(null);
      return;
    }
    setApplying(true);
    try {
      await api.post(`/journal/${review.entryId}/apply`, chosen);
      hapticNotification("success");
      setNote(`Добавлено: ${count}. Всё можно поправить в соответствующих разделах.`);
      setReview(null);
      onSaved?.();
    } catch {
      hapticNotification("error");
      setNote("Не удалось добавить. Запись дневника сохранена, попробуй ещё раз позже.");
    } finally {
      setApplying(false);
    }
  }

  function toggleRow(key: string) {
    hapticSelection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <div className="composer">
        <textarea
          rows={4}
          aria-label="Запись в дневник"
          placeholder={placeholder ?? "Что на уме? Пиши как есть: мысли, планы, траты, что съел."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="composer-bar">
          <label className={`private-toggle ${privateEntry ? "on" : ""}`}>
            <input type="checkbox" checked={privateEntry} onChange={(e) => setPrivateEntry(e.target.checked)} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {privateEntry ? "AI не увидит" : "Личная запись"}
          </label>
          <button className="primary compact" onClick={save} disabled={saving || !text.trim()}>
            {saving ? "Сохраняю..." : "Записать"}
          </button>
        </div>
      </div>

      {support && (
        <div className="card support" role="status">
          <div className="card-title">Я рядом</div>
          <p style={{ marginBottom: 10 }}>
            Запись сохранена. То, что ты написал, звучит тяжело, и это важно. Я не стал разбирать её на задачи.
            Если можешь, расскажи о том, как тебе сейчас, кому-то из близких. Ты не обязан справляться один.
          </p>
          {support.resources.map((r) => (
            <p key={r.label} style={{ marginBottom: 6 }}>
              {r.label}: <b>{r.contact}</b>
            </p>
          ))}
          <p style={{ marginTop: 10, fontSize: 13 }}>
            Я приложение, а не специалист, и помочь так, как может живой человек, не могу.
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => setSupport(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {note && (
        <div className="card" role="status">
          <p style={{ color: "var(--text)" }}>{note}</p>
        </div>
      )}

      {review && (
        <div className="card review">
          <div className="card-title">Я понял так — проверь</div>
          <p style={{ marginBottom: 6 }}>
            Ничего не сохранится, пока не нажмёшь «Добавить». Сними галочку с лишнего.
          </p>
          {flattenProposals(review.proposals).map((row) => (
            <label key={row.key} className="check-row">
              <input type="checkbox" checked={selected.has(row.key)} onChange={() => toggleRow(row.key)} />
              <span>{row.label}</span>
            </label>
          ))}
          <div className="actions">
            <button className="secondary" onClick={() => setReview(null)} disabled={applying}>
              Не нужно
            </button>
            <button className="primary" onClick={applyReview} disabled={applying || selected.size === 0}>
              {applying ? "Добавляю..." : `Добавить (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
