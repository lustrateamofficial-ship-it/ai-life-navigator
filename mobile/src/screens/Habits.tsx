import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../platform/sdk";
import { confirmDelete } from "../utils/format";

interface HabitLog {
  date: string;
  completed: boolean;
}

interface Habit {
  id: string;
  title: string;
  status: string;
  streak: number;
  targetDays: number;
  logs: HabitLog[];
}

// Привычки: отдельный экран, как и остальные разделы из «Я».
export function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [bankHabits, setBankHabits] = useState<Habit[]>([]);
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [historyHabitId, setHistoryHabitId] = useState<string | null>(null);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const [addingHabit, setAddingHabit] = useState(false);

  async function loadAll() {
    const h = await api.get<Habit[]>("/habits");
    setHabits(h.filter((x) => x.status === "active"));
    setBankHabits(h.filter((x) => x.status === "in_bank"));
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Раздел 16: максимум 2 активные привычки одновременно — создание кладёт в "банк",
  // активация переносит оттуда (backend сам отклонит, если слоты заняты).
  async function addHabit() {
    if (!newHabitTitle.trim() || addingHabit) return;
    setAddingHabit(true);
    try {
      await api.post("/habits", { title: newHabitTitle, targetDays: 30 });
      hapticNotification("success");
      setNewHabitTitle("");
      await loadAll();
    } finally {
      setAddingHabit(false);
    }
  }

  async function activateHabit(id: string) {
    if (busyHabitId) return;
    setBusyHabitId(id);
    try {
      await api.post(`/habits/${id}/activate`, {});
      hapticNotification("success");
      await loadAll();
    } catch {
      hapticNotification("error");
      alert("Можно активировать максимум 2 привычки одновременно — заверши или подожди одну из текущих.");
    } finally {
      setBusyHabitId(null);
    }
  }

  async function logHabitToday(id: string) {
    if (busyHabitId) return;
    setBusyHabitId(id);
    try {
      await api.post(`/habits/${id}/log`, { completed: true });
      hapticNotification("success");
      await loadAll();
    } finally {
      setBusyHabitId(null);
    }
  }

  async function removeHabit(id: string) {
    if (!confirmDelete("Удалить эту привычку вместе с историей отметок?")) return;
    if (busyHabitId) return;
    setBusyHabitId(id);
    try {
      await api.delete(`/habits/${id}`);
      hapticImpact("medium");
      await loadAll();
    } finally {
      setBusyHabitId(null);
    }
  }

  // История привычки: 30 дней сеткой. Даты в логах — UTC-полночь календарного дня
  // человека, поэтому сравниваем по первым десяти символам, без пересчёта часовых поясов.
  const pad = (n: number) => String(n).padStart(2, "0");
  const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function doneToday(habit: Habit) {
    const today = localKey(new Date());
    return habit.logs.some((l) => l.completed && l.date.slice(0, 10) === today);
  }

  function renderHabitHistory(habit: Habit) {
    const completedDates = new Set(habit.logs.filter((l) => l.completed).map((l) => l.date.slice(0, 10)));
    const days: { label: string; done: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), done: completedDates.has(localKey(d)) });
    }
    return (
      <>
        <div className="dot-grid" aria-label="Последние 30 дней">
          {days.map((d, i) => (
            <div key={i} title={d.label} className={d.done ? "dot on" : "dot"} />
          ))}
        </div>
        <button className="small-btn danger" onClick={() => removeHabit(habit.id)} disabled={busyHabitId === habit.id}>
          Удалить привычку
        </button>
      </>
    );
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Привычки</h2>
        <p>Отмечай день, когда сделал. Серия растёт, пока не пропускаешь.</p>
      </header>

      <div className="card">
        <div className="card-title">Привычки</div>
        {habits.length === 0 && <p className="empty">Активных привычек нет. Добавь первую ниже.</p>}
        {habits.map((h) => {
          const done = doneToday(h);
          return (
            <div key={h.id}>
              <div className="task-row">
                <button
                  className={done ? "checkbox done" : "checkbox"}
                  onClick={() => !done && logHabitToday(h.id)}
                  disabled={done || busyHabitId === h.id}
                  aria-label={done ? "сегодня уже отмечено" : "отметить на сегодня"}
                />
                <button
                  className="text"
                  style={{ flex: 1, textAlign: "left" }}
                  onClick={() => setHistoryHabitId(historyHabitId === h.id ? null : h.id)}
                  aria-expanded={historyHabitId === h.id}
                >
                  {h.title}
                  <span className="tag">
                    серия {h.streak} из {h.targetDays}
                  </span>
                </button>
              </div>
              {historyHabitId === h.id && renderHabitHistory(h)}
            </div>
          );
        })}

        {bankHabits.length > 0 && (
          <div className="mt">
            <p className="small">В запасе (не активны):</p>
            {bankHabits.map((h) => (
              <div key={h.id} className="task-row">
                <span style={{ flex: 1 }}>{h.title}</span>
                <button className="small-btn accent" onClick={() => activateHabit(h.id)} disabled={busyHabitId === h.id}>
                  Включить
                </button>
                <button className="icon-btn" onClick={() => removeHabit(h.id)} disabled={busyHabitId === h.id} aria-label="удалить привычку">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field-row mt">
          <input
            aria-label="Новая привычка"
            placeholder="Новая привычка"
            value={newHabitTitle}
            onChange={(e) => setNewHabitTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
          />
          <button className="primary" onClick={addHabit} disabled={addingHabit}>
            {addingHabit ? "..." : "Добавить"}
          </button>
        </div>
        <p className="small mt">Одновременно можно вести не больше двух привычек: так их легче довести до конца.</p>
      </div>
    </div>
  );
}
