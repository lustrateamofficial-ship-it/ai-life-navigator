import { confirmDelete } from "../utils/format";
import { IconClose, IconEdit } from "../components/Icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../platform/sdk";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline?: string | null;
  recurrence?: string | null;
}

const RANGES = [
  { key: "today", label: "Сегодня" },
  { key: "tomorrow", label: "Завтра" },
  { key: "week", label: "Неделя" },
  { key: "all", label: "Все" },
  { key: "done", label: "Выполненные" },
];

export function Tasks({ embedded = false }: { embedded?: boolean } = {}) {
  const [range, setRange] = useState("today");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [quickDate, setQuickDate] = useState("");
  const [quickRepeat, setQuickRepeat] = useState("");
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

  // Раздел 41: "Лучше: «Завтра сделать страницу проекта на час»" — без ИИ-ключа
  // просто создаём задачу с заголовком как есть; с ИИ-ключом бэкенд может парсить через /ai.
  async function quickAdd() {
    if (!quickInput.trim() || adding) return;
    setAdding(true);
    try {
      // Срок хранится как полдень выбранного дня: так задача попадает в нужный день при любом часовом поясе.
      await api.post("/tasks", { title: quickInput, ...(quickDate ? { deadline: `${quickDate}T12:00:00.000Z` } : {}), ...(quickRepeat ? { recurrence: quickRepeat } : {}) });
      hapticNotification("success");
      setQuickInput("");
      setQuickDate("");
      setQuickRepeat("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function saveEdit(id: string) {
    const title = editText.trim();
    if (!title) return;
    try {
      await api.put(`/tasks/${id}`, { title });
      hapticNotification("success");
      setEditingId(null);
      await load();
    } catch {
      /* название не сохранилось: окно правки остаётся открытым, можно повторить */
    }
  }

  async function removeTask(id: string) {
    if (!confirmDelete("Удалить эту задачу?", true)) return;
    try {
      await api.delete(`/tasks/${id}`);
      hapticImpact("medium");
      await load();
    } catch {
      /* задача осталась в списке: можно повторить */
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
    <div className={embedded ? undefined : "screen"}>
      {!embedded && (
        <header className="page-header">
          <h2>Задачи</h2>
        </header>
      )}

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
        <label className="small" htmlFor="task-date" style={{ display: "block", margin: "10px 0 6px" }}>
          Срок (необязательно)
        </label>
        <input id="task-date" type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} />
        <label className="small" htmlFor="task-repeat" style={{ display: "block", margin: "10px 0 6px" }}>
          Повтор
        </label>
        <select id="task-repeat" value={quickRepeat} onChange={(e) => setQuickRepeat(e.target.value)}>
          <option value="">Не повторять</option>
          <option value="daily">Каждый день</option>
          <option value="weekly">Каждую неделю</option>
          <option value="monthly">Каждый месяц</option>
        </select>
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
            {editingId === task.id ? (
              <>
                <input
                  aria-label="Название задачи"
                  value={editText}
                  autoFocus
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveEdit(task.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button className="primary" style={{ width: "auto", padding: "0 14px" }} onClick={() => saveEdit(task.id)}>
                  Готово
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>
                  {task.title}
                  {task.recurrence && (
                    <span className="small" style={{ display: "block" }}>
                      повторяется: {{ daily: "каждый день", weekly: "каждую неделю", monthly: "каждый месяц" }[task.recurrence] ?? task.recurrence}
                    </span>
                  )}
                  {task.deadline && (
                    <span className="small" style={{ display: "block" }}>
                      до {new Date(task.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })}
                    </span>
                  )}
                </span>
                <button
                  className="icon-btn"
                  aria-label="изменить"
                  onClick={() => {
                    setEditingId(task.id);
                    setEditText(task.title);
                  }}
                >
                  <IconEdit />
                </button>
                <button className="icon-btn" aria-label="удалить" onClick={() => removeTask(task.id)}>
                  <IconClose />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
