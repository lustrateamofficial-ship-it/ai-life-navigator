import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";

interface WeightData {
  current: number | null;
  avg7d: number | null;
  avg30d: number | null;
}

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

interface FinanceDashboard {
  income: number;
  expenses: number;
  balance: number;
  saved: number;
  debts: number;
}

export function Me() {
  const [weight, setWeight] = useState<WeightData | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [foodInput, setFoodInput] = useState("");
  const [habits, setHabits] = useState<Habit[]>([]);
  const [bankHabits, setBankHabits] = useState<Habit[]>([]);
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [historyHabitId, setHistoryHabitId] = useState<string | null>(null);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingFood, setSavingFood] = useState(false);
  const [addingHabit, setAddingHabit] = useState(false);
  const [addingTx, setAddingTx] = useState(false);

  async function loadAll() {
    const [w, h, f] = await Promise.all([
      api.get<WeightData>("/health/weight"),
      api.get<Habit[]>("/habits"),
      api.get<FinanceDashboard>("/finance/dashboard"),
    ]);
    setWeight(w);
    setHabits(h.filter((x) => x.status === "active"));
    setBankHabits(h.filter((x) => x.status === "in_bank"));
    setFinance(f);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function submitWeight() {
    const value = parseFloat(weightInput.replace(",", "."));
    if (!value || savingWeight) return;
    setSavingWeight(true);
    try {
      await api.post("/health/weight", { weightKg: value });
      hapticNotification("success");
      setWeightInput("");
      await loadAll();
    } finally {
      setSavingWeight(false);
    }
  }

  async function submitFood() {
    if (!foodInput.trim() || savingFood) return;
    setSavingFood(true);
    try {
      await api.post("/health/food", { text: foodInput });
      hapticNotification("success");
      setFoodInput("");
    } finally {
      setSavingFood(false);
    }
  }

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

  // Раздел 17: без формы добавления дохода/расхода дашборд финансов всегда показывает 0.
  async function addTransaction() {
    const amount = parseFloat(txAmount.replace(",", "."));
    if (!amount || !txCategory.trim() || addingTx) return;
    setAddingTx(true);
    try {
      await api.post(`/finance/${txType === "income" ? "income" : "expenses"}`, {
        amount,
        category: txCategory,
      });
      hapticNotification("success");
      setTxAmount("");
      setTxCategory("");
      await loadAll();
    } finally {
      setAddingTx(false);
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

  const balanceClass = finance && finance.balance < 0 ? "stat-value bad" : "stat-value";

  return (
    <div className="screen">
      <header className="page-header">
        <h2>Я</h2>
        <p>Здоровье, привычки и деньги в одном месте</p>
      </header>

      <div className="card">
        <div className="card-title">Вес</div>
        <div className="big-number">{weight?.current ? `${weight.current} кг` : "—"}</div>
        <div className="stat-grid mt">
          <div className="stat">
            <div className="stat-label">Среднее за 7 дней</div>
            <div className="stat-value">{weight?.avg7d ? `${weight.avg7d.toFixed(1)} кг` : "—"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Среднее за 30 дней</div>
            <div className="stat-value">{weight?.avg30d ? `${weight.avg30d.toFixed(1)} кг` : "—"}</div>
          </div>
        </div>
        <div className="field-row mt">
          <input
            inputMode="decimal"
            aria-label="Вес в килограммах"
            placeholder="Вес сегодня, кг"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitWeight()}
          />
          <button className="primary" onClick={submitWeight} disabled={savingWeight}>
            {savingWeight ? "..." : "Записать"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Питание</div>
        <div className="field-row">
          <input
            aria-label="Что ты съел"
            placeholder="Например: 250 г курицы и 200 г риса"
            value={foodInput}
            onChange={(e) => setFoodInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitFood()}
          />
          <button className="primary" onClick={submitFood} disabled={savingFood}>
            {savingFood ? "..." : "Записать"}
          </button>
        </div>
      </div>

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

      <div className="card">
        <div className="card-title">Финансы</div>
        {finance && (
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Доходы за месяц</div>
              <div className="stat-value">{finance.income}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Расходы за месяц</div>
              <div className="stat-value">{finance.expenses}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Баланс месяца</div>
              <div className={balanceClass}>{finance.balance}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Накоплено всего</div>
              <div className="stat-value">{finance.saved}</div>
            </div>
          </div>
        )}
        {finance && finance.debts > 0 && <p className="mt text">Долги всего: {finance.debts}</p>}

        <div className="segmented mt" role="group" aria-label="Тип записи">
          <button aria-pressed={txType === "expense"} onClick={() => setTxType("expense")}>
            Расход
          </button>
          <button aria-pressed={txType === "income"} onClick={() => setTxType("income")}>
            Доход
          </button>
        </div>
        <div className="field-row mt">
          <input
            inputMode="decimal"
            aria-label="Сумма"
            placeholder="Сумма"
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
            style={{ width: 110, flexShrink: 0 }}
          />
          <input aria-label="Категория" placeholder="Категория" value={txCategory} onChange={(e) => setTxCategory(e.target.value)} />
        </div>
        <button className="primary mt" onClick={addTransaction} disabled={addingTx}>
          {addingTx ? "Добавляю..." : txType === "income" ? "Добавить доход" : "Добавить расход"}
        </button>
      </div>

      <div className="card">
        <div className="card-title">Ещё</div>
        <nav className="link-list">
          <Link className="link-row" to="/calendar">Расписание</Link>
          <Link className="link-row" to="/reminders">Напоминания</Link>
          <Link className="link-row" to="/ideas">Идеи</Link>
          <Link className="link-row" to="/memory">Память</Link>
          <Link className="link-row" to="/mission">Моя миссия</Link>
          <Link className="link-row" to="/analytics">Аналитика</Link>
          <Link className="link-row" to="/settings">Настройки</Link>
        </nav>
      </div>
    </div>
  );
}
