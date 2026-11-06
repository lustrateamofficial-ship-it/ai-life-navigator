import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { addDays, dayKey, plannedTaskIds, refreshWeather, scheduleFor, setPlannedTaskIds, weatherFor, weatherText, type ScheduleLine } from "../../shim/daily";
import { syncNativeReminders } from "../../shim/native";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
}

// Вечерний экран: выбрать задачи и записать расписание на завтра. Утром из этого собирается сводка.
export function PlanTomorrow() {
  const nav = useNavigate();
  const tomorrow = addDays(new Date(), 1);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [picked, setPicked] = useState<string[]>(plannedTaskIds(tomorrow));
  const [schedule, setSchedule] = useState<ScheduleLine[]>([]);
  const [newTask, setNewTask] = useState("");
  const [time, setTime] = useState("09:00");
  const [what, setWhat] = useState("");
  const [weather, setWeather] = useState(weatherFor(tomorrow));
  const [busy, setBusy] = useState(false);

  async function loadTasks() {
    const list = await api.get<TaskRow[]>("/tasks");
    setTasks(list.filter((t) => t.status !== "done" && t.status !== "cancelled"));
  }
  async function loadSchedule() {
    setSchedule(await scheduleFor(tomorrow));
  }

  useEffect(() => {
    void loadTasks();
    void loadSchedule();
    void refreshWeather().then(() => setWeather(weatherFor(tomorrow)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePick(id: string) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    setPlannedTaskIds(tomorrow, next);
    void syncNativeReminders();
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const t = await api.post<TaskRow>("/tasks", { title });
      setNewTask("");
      await loadTasks();
      const next = [...picked, t.id];
      setPicked(next);
      setPlannedTaskIds(tomorrow, next);
    } finally {
      setBusy(false);
    }
  }

  async function addEvent() {
    const title = what.trim();
    if (!title || !/^\d{2}:\d{2}$/.test(time) || busy) return;
    setBusy(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), h, m);
      await api.post("/calendar", { title, category: "personal", startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600_000).toISOString() });
      setWhat("");
      await loadSchedule();
    } finally {
      setBusy(false);
    }
  }

  const label = tomorrow.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="screen" data-day={dayKey(tomorrow)}>
      <Link className="back-link" to="/">
        ← Сегодня
      </Link>
      <header className="page-header">
        <h2>План на завтра</h2>
        <p>{label}</p>
      </header>
      {weather && <div className="card">Погода: {weatherText(weather)}</div>}

      <div className="card">
        <div className="card-title">Что нужно сделать</div>
        <p className="small" style={{ marginBottom: 8 }}>Отметь главное. Утром в сводку попадут три первые отмеченные.</p>
        {tasks.length === 0 && <p className="empty">Открытых задач нет. Добавь ниже.</p>}
        {tasks.map((t) => (
          <label className="check-row" key={t.id}>
            <input type="checkbox" checked={picked.includes(t.id)} onChange={() => togglePick(t.id)} />
            <span>{t.title}</span>
          </label>
        ))}
        <div className="field-row mt">
          <input aria-label="Новая задача на завтра" placeholder="Новая задача на завтра" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
          <button className="primary" onClick={addTask} disabled={busy}>
            Добавить
          </button>
        </div>
        {picked.length > 3 && <p className="small mt">Отмечено больше трёх: в утренней сводке покажу первые три, остальные останутся в «Планах».</p>}
      </div>

      <div className="card">
        <div className="card-title">Расписание дня</div>
        {schedule.length === 0 && <p className="empty">Пока пусто.</p>}
        {schedule.map((l, i) => (
          <div className="list-sub" key={i} style={{ padding: "4px 0" }}>
            <b>{l.time}</b> {l.text}
          </div>
        ))}
        <input aria-label="Время" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt" />
        <div className="field-row mt">
          <input aria-label="Что запланировано" placeholder="Что запланировано" value={what} onChange={(e) => setWhat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEvent()} />
          <button className="primary" onClick={addEvent} disabled={busy}>
            Добавить
          </button>
        </div>
      </div>

      <button className="primary" style={{ width: "100%" }} onClick={() => nav("/")}>
        Готово, спокойной ночи
      </button>
    </div>
  );
}
