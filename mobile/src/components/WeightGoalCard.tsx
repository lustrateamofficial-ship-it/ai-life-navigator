import { toast } from "../../phone/feedback";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { hapticNotification } from "../platform/sdk";
import { formatNumber, localDayKey } from "../utils/format";
import { readStart, writeStart, weightProgress } from "../../phone/weightGoal";
import { WeightChart } from "./WeightChart";

interface WeightData {
  logs?: Array<{ date: string; weightKg: number }>;
  current: number | null;
  avg7d: number | null;
  avg30d: number | null;
}

const num = (s: string) => parseFloat(s.replace(",", "."));
const todayIso = () => localDayKey();
const kg = (n: number) => `${formatNumber(n)} кг`;

// Вес: цель, ежедневная запись после взвешивания и сколько цели уже выполнено.
export function WeightSection({ weight, onChanged, focusTick }: { weight: WeightData | null; onChanged: () => void | Promise<void>; focusTick?: number }) {
  const [goal, setGoal] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [todayInput, setTodayInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadGoal() {
    const p = await api.get<{ weightGoalKg?: number | null } | null>("/profile");
    setGoal(p?.weightGoalKg ?? null);
    setLoaded(true);
  }
  useEffect(() => {
    loadGoal();
  }, []);
  useEffect(() => {
    if (!focusTick) return;
    // Шторка «+» возвращает фокус на свою кнопку при закрытии, поэтому ставим курсор чуть позже.
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [focusTick, loaded]);

  const logs = weight?.logs ?? [];
  const latest = logs[0] ?? null; // сервер отдаёт от новых к старым
  const oldest = logs.length ? logs[logs.length - 1] : null;
  const now = weight?.current ?? null;
  const wroteToday = !!latest && latest.date.slice(0, 10) === todayIso();
  const start = readStart()?.kg ?? oldest?.weightKg ?? now;
  const progress = goal && start != null && now != null ? weightProgress(start, now, goal) : null;

  async function saveGoal() {
    const g = num(goalInput);
    const s = startInput.trim() ? num(startInput) : now ?? NaN;
    if (!(g > 20 && g < 400)) return setError("Укажи цель в килограммах, например 75.");
    if (!(s > 20 && s < 400)) return setError("Укажи, сколько ты весишь сейчас, например 82.");
    setBusy(true);
    setError("");
    try {
      await api.put("/profile", { weightGoalKg: Math.round(g * 10) / 10 });
      writeStart({ kg: s, date: todayIso() });
      // Если вес сегодня ещё не записан, стартовое значение становится первой записью.
      if (!now) await api.post("/health/weight", { weightKg: s });
      hapticNotification("success");
      setEditing(false);
      toast("Цель по весу поставлена");
      await Promise.all([loadGoal(), onChanged()]);
    } finally {
      setBusy(false);
    }
  }

  async function removeGoal() {
    setBusy(true);
    try {
      await api.put("/profile", { weightGoalKg: null });
      writeStart(null);
      setEditing(false);
      await loadGoal();
    } finally {
      setBusy(false);
    }
  }

  async function submitToday() {
    const v = num(todayInput);
    if (!(v > 20 && v < 400)) return setError("Укажи вес в килограммах, например 81,4.");
    setBusy(true);
    setError("");
    try {
      await api.post("/health/weight", { weightKg: Math.round(v * 10) / 10 });
      if (goal && !readStart()) writeStart({ kg: Math.round(v * 10) / 10, date: todayIso() });
      hapticNotification("success");
      toast(goal && start != null && weightProgress(start, v, goal).reached ? "Вес записан. Цель достигнута" : "Вес записан");
      setTodayInput("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    setGoalInput(goal ? String(goal).replace(".", ",") : "");
    setStartInput(start != null ? String(start).replace(".", ",") : "");
    setError("");
    setEditing(true);
  }

  const showForm = loaded && (editing || !goal);

  return (
    <>
      <div className="card">
        <div className="card-title">Вес сегодня</div>
        <div className="big-number">{now ? kg(now) : "—"}</div>
        <p className="small" style={{ marginTop: 6 }}>
          {wroteToday ? "Сегодня записано. Можно исправить, если ошибся." : "Встань на весы и запиши результат. Один раз в день."}
        </p>
        <div className="field-row mt">
          <input
            ref={inputRef}
            inputMode="decimal"
            aria-label="Вес в килограммах"
            placeholder="Вес сегодня, кг"
            value={todayInput}
            onChange={(e) => setTodayInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitToday()}
          />
          <button className="primary" onClick={submitToday} disabled={busy}>
            {busy ? "..." : "Записать"}
          </button>
        </div>
        {error && !showForm && <p className="small bad" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      {loaded && goal && progress && !editing && (
        <div className="card goal-card">
          <div className="card-title">Цель: {kg(goal)}</div>
          <div className="goal-pct" aria-label={`Выполнено ${progress.percent} процентов`}>
            {progress.percent}%
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Выполнение цели по весу">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="goal-left">
            {progress.reached
              ? "Цель достигнута"
              : progress.wrongWay
                ? `Пока вес ушёл от цели. Осталось ${kg(progress.left)}`
                : `Осталось ${kg(progress.left)}`}
          </p>
          <div className="goal-track">
            <div>
              <small>Старт</small>
              <b>{start != null ? kg(start) : "—"}</b>
            </div>
            <div>
              <small>Сейчас</small>
              <b>{now ? kg(now) : "—"}</b>
            </div>
            <div>
              <small>Цель</small>
              <b>{kg(goal)}</b>
            </div>
          </div>
          <div className="goal-actions">
            <button className="link-btn" onClick={openEdit}>
              Изменить цель
            </button>
          </div>
        </div>
      )}

      {loaded && goal && !progress && !editing && (
        <div className="card goal-card">
          <div className="card-title">Цель: {kg(goal)}</div>
          <p className="small">Запиши первый вес, и здесь появится, сколько цели выполнено.</p>
          <div className="goal-actions">
            <button className="link-btn" onClick={openEdit}>
              Изменить цель
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card">
          <div className="card-title">{goal ? "Изменить цель" : "Поставь цель по весу"}</div>
          <div className="goal-form">
            <label>
              <span>Сейчас, кг</span>
              <input inputMode="decimal" aria-label="Вес сейчас, кг" placeholder="82" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
            </label>
            <label>
              <span>Хочу, кг</span>
              <input inputMode="decimal" aria-label="Цель по весу, кг" placeholder="75" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveGoal()} />
            </label>
          </div>
          {error && <p className="small bad" role="alert" style={{ marginTop: 8 }}>{error}</p>}
          <div className="goal-actions">
            <button className="primary" onClick={saveGoal} disabled={busy}>
              {goal ? "Сохранить" : "Поставить цель"}
            </button>
            {goal && (
              <>
                <button className="link-btn" onClick={() => setEditing(false)}>
                  Отмена
                </button>
                <button className="link-btn danger-link" onClick={removeGoal}>
                  Убрать цель
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Динамика</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Среднее за 7 дней</div>
            <div className="stat-value">{weight?.avg7d ? kg(weight.avg7d) : "—"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Среднее за 30 дней</div>
            <div className="stat-value">{weight?.avg30d ? kg(weight.avg30d) : "—"}</div>
          </div>
        </div>
        <WeightChart logs={logs} goalKg={goal} />
      </div>
    </>
  );
}
