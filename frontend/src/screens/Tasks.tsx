import { useEffect, useState } from "react";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
}

const RANGES = [
  { key: "today", label: "Сегодня" },
  { key: "tomorrow", label: "Завтра" },
  { key: "week", label: "Неделя" },
  { key: "all", label: "Все" },
  { key: "done", label: "Выполненные" },
];

export function Tasks() {
  const [range, setRange] = useState("today");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setTasks(await api.get<Task[]>(`/tasks?range=${range}`));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function toggle(task: Task) {
    if (togglingId) return; // защита от двойного тапа на медленной сети
    setTogglingId(task.id);
    try {
      await api.put(`/tasks/${task.id}`, { status: task.status === "done" ? "todo" : "done" });
      hapticImpact("light");
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  // Раздел 41: "Лучше: «Завтра сделать страницу проекта на час»" — без AI-ключа
  // просто создаём задачу с заголовком как есть; с AI-ключом бэкенд может парсить через /ai.
  async function quickAdd() {
    if (!quickInput.trim() || adding) return;
    setAdding(true);
    try {
      await api.post("/tasks", { title: quickInput });
      hapticNotification("success");
      setQuickInput("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  const EMPTY: Record<string, string> = {
    today: "На сегодня задач нет. Хороший повод выдохнуть или добавить что-то ниже.",
    tomorrow: "На завтра пока ничего.",
    week: "На эту неделю задач нет.",
    all: "Задач нет. Добавь первую ниже.",
    done: "Выполненных задач пока нет.",
  };

  return (
    <div className="screen">
      <header className="page-header">
        <h2>Задачи</h2>
      </header>

      <div className="card">
        <div className="field-row">
          <input
            aria-label="Новая задача"
            placeholder="Новая задача"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
          />
          <button className="primary" onClick={quickAdd} disabled={adding}>
            {adding ? "..." : "Добавить"}
          </button>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Период">
        {RANGES.map((r) => (
          <button key={r.key} className="chip" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="card">
        {tasks.length === 0 && <p className="empty">{EMPTY[range]}</p>}
        {tasks.map((task) => (
          <div className="task-row" key={task.id}>
            <button
              className={task.status === "done" ? "checkbox done" : "checkbox"}
              onClick={() => toggle(task)}
              disabled={togglingId === task.id}
              aria-label={task.status === "done" ? "вернуть в работу" : "отметить выполненной"}
            />
            <span>{task.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
