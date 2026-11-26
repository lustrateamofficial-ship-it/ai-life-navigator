import { MissionLine } from "../components/MissionLine";
import { StreakCard } from "../components/StreakCard";
import { readStreak, streakEvent } from "../../phone/streak";
import { plural } from "../components/WeekDigest";
import { WeightSection } from "../components/WeightGoalCard";
import { BudgetCard } from "../components/BudgetCard";
import { confirmDelete, formatNumber } from "../utils/format";
import { FinanceCharts } from "../components/charts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../platform/sdk";

interface WeightData {
  logs?: Array<{ date: string; weightKg: number }>;
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

type Section = "weight" | "streak" | "habits" | "money";

function Ic({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const MORE: Array<{ to: string; label: string; d: string }> = [
  { to: "/ideas", label: "Идеи", d: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z" },
  { to: "/memory", label: "Память", d: "M4 5h16v14H4zM8 9h8M8 13h5" },
  { to: "/mission", label: "Моя миссия", d: "M5 21V4M5 4h11l-2 4 2 4H5" },
  { to: "/analytics", label: "Аналитика", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { to: "/trash", label: "Корзина", d: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" },
];

export function Me() {
  const [focusTick, setFocusTick] = useState(0);
  const [section, setSectionRaw] = useState<Section>("weight");
  const setSection = (x: Section) => setSectionRaw(x);
  const [streak, setStreak] = useState(() => readStreak());
  useEffect(() => {
    const on = () => setStreak(readStreak());
    window.addEventListener(streakEvent, on);
    return () => window.removeEventListener(streakEvent, on);
  }, []);
  const [weight, setWeight] = useState<WeightData | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [bankHabits, setBankHabits] = useState<Habit[]>([]);
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [historyHabitId, setHistoryHabitId] = useState<string | null>(null);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
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

  // «+» → «Вес» открывает этот экран со ссылкой #/me?weigh=1: показываем вес и ставим курсор в поле.
  useEffect(() => {
    const check = () => {
      if (!window.location.hash.includes("weigh=1")) return;
      setSection("weight");
      setFocusTick((t) => t + 1);
      window.history.replaceState(null, "", "#/me");
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
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
      <header className="page-header page-header-row">
        <div>
          <h2>Я</h2>
          <p>Вес, серия дней и всё остальное</p>
        </div>
        <Link className="icon-btn" to="/settings" aria-label="Настройки">
          <Ic d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 1 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z" />
        </Link>
      </header>

      <MissionLine />

      <div className="tile-grid" role="group" aria-label="Раздел">
        <button className={`tile ${section === "weight" ? "active" : ""}`} aria-pressed={section === "weight"} onClick={() => setSection("weight")}>
          <Ic d="M4 12h4l2-6 4 12 2-6h4" />
          <span className="tile-label">Вес</span>
          <b>{weight?.current ? `${formatNumber(weight.current)} кг` : "—"}</b>
        </button>
        <button className={`tile ${section === "streak" ? "active" : ""}`} aria-pressed={section === "streak"} onClick={() => setSection("streak")}>
          <Ic d="M12 3c1 3 4 4.500 4 8.500a4 4 0 0 1-8 0c0-1.500.5-2.500 1.500-3.500C9.500 10 10 8 12 3z" />
          <span className="tile-label">Серия</span>
          <b>{streak > 0 ? `${streak} ${plural(streak, "день", "дня", "дней")}` : "нет"}</b>
        </button>
      </div>

{section === "streak" && <StreakCard />}

{section === "weight" && <WeightSection weight={weight} onChanged={loadAll} focusTick={focusTick} />}

      {section === "habits" && (
<>
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
</>
)}

      {section === "money" && (
<>
      <div className="card">
        <div className="card-title">Финансы</div>
        {finance && (
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Доходы за месяц</div>
              <div className="stat-value">{formatNumber(finance.income)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Расходы за месяц</div>
              <div className="stat-value">{formatNumber(finance.expenses)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Баланс месяца</div>
              <div className={balanceClass}>{formatNumber(finance.balance)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Накоплено всего</div>
              <div className="stat-value">{formatNumber(finance.saved)}</div>
            </div>
          </div>
        )}
        {finance && finance.debts > 0 && <p className="mt text">Долги всего: {finance.debts}</p>}
        <FinanceCharts reloadKey={(finance?.income ?? 0) + (finance?.expenses ?? 0)} />

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

      <BudgetCard reloadKey={finance?.expenses ?? 0} />
</>
)}

            <div className="settings-group" style={{ marginTop: 26 }}>
        <h3>Разделы</h3>
      </div>
      <nav className="more-grid" aria-label="Другие разделы">
        <button type="button" className="more-item" onClick={() => { setSection("habits"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="sheet-ic">
            <Ic d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.500l2.700 2.700L16 9.500" />
          </span>
          <span>Привычки</span>
        </button>
        <button type="button" className="more-item" onClick={() => { setSection("money"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="sheet-ic">
            <Ic d="M3 7h18v12H3zM3 11h18M16 15h2" />
          </span>
          <span>Финансы</span>
        </button>
        {MORE.map((m) => (
          <Link key={m.to} className="more-item" to={m.to}>
            <span className="sheet-ic">
              <Ic d={m.d} />
            </span>
            <span>{m.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
