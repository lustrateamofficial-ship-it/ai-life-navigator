import { toast } from "../../phone/feedback";
import { SwipeRow } from "../components/SwipeRow";
import { AutoTextarea } from "../components/AutoTextarea";
import { Reminders } from "./Reminders";
import { confirmDelete } from "../utils/format";
import { IconBell, IconClose, IconEdit, IconUndo } from "../components/Icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../platform/sdk";
import { celebrateIfDayDone } from "../../phone/celebrate";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline?: string | null;
  recurrence?: string | null;
  completedAt?: string | null;
  remindAt?: string | null;
  remindActive?: boolean;
}

const RANGES = [
  { key: "today", label: "Сегодня" },
  { key: "tomorrow", label: "Завтра" },
  { key: "week", label: "Неделя" },
  { key: "all", label: "Все" },
  { key: "done", label: "Выполненные" },
];

const REPEAT_LABEL: Record<string, string> = { daily: "каждый день", weekdays: "по будням", weekends: "по выходным", weekly: "каждую неделю", monthly: "каждый месяц" };

// Срок хранится как полдень выбранного дня по UTC: так задача попадает в нужный день при любом часовом поясе.
const dateKey = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const deadlineOf = (key: string) => (key ? `${key}T12:00:00.000Z` : null);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const fmtRemind = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDone = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

// Значение для <input type="datetime-local">: то же местное время, что сохранено.
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const remindIso = (local: string) => (local ? new Date(local).toISOString() : null);

// Поля срока, напоминания и повтора: одинаковые при создании и при правке задачи.
function TaskFields({ date, onDate, remind, onRemind, repeat, onRepeat, idPrefix }: { date: string; onDate: (v: string) => void; remind: string; onRemind: (v: string) => void; repeat: string; onRepeat: (v: string) => void; idPrefix: string }) {
  return (
    <div className="task-fields">
      <label htmlFor={`${idPrefix}-date`}>
        <span className="small">Срок</span>
        <input id={`${idPrefix}-date`} type="date" value={date} onChange={(e) => onDate(e.target.value)} />
      </label>
      <label htmlFor={`${idPrefix}-remind`}>
        <span className="small">Напомнить</span>
        <input id={`${idPrefix}-remind`} type="datetime-local" value={remind} onChange={(e) => onRemind(e.target.value)} />
      </label>
      <label htmlFor={`${idPrefix}-repeat`}>
        <span className="small">Повтор</span>
        <select id={`${idPrefix}-repeat`} value={repeat} onChange={(e) => onRepeat(e.target.value)}>
          <option value="">Не повторять</option>
          <option value="daily">Каждый день</option>
          <option value="weekdays">По будням</option>
          <option value="weekends">По выходным</option>
          <option value="weekly">Каждую неделю</option>
          <option value="monthly">Каждый месяц</option>
        </select>
      </label>
    </div>
  );
}

export function Tasks({ embedded = false, autoAdd = false }: { embedded?: boolean; autoAdd?: boolean } = {}) {
  const [range, setRange] = useState("today");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [quickDate, setQuickDate] = useState("");
  const [quickRemind, setQuickRemind] = useState("");
  const [quickRepeat, setQuickRepeat] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [swipeUsed, setSwipeUsed] = useState(() => {
    try {
      return localStorage.getItem("navigator:swipe-used") === "1";
    } catch {
      return false;
    }
  });
  function markSwipeUsed() {
    setSwipeUsed(true);
    try {
      localStorage.setItem("navigator:swipe-used", "1");
    } catch {
      /* подсказка просто покажется снова */
    }
  }

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
      toast(task.status === "done" ? "Задача возвращена в работу" : "Задача выполнена");
      await load();
      if (task.status !== "done") void celebrateIfDayDone();
    } finally {
      setTogglingId(null);
    }
  }

  async function quickAdd() {
    if (!quickInput.trim() || adding) return;
    setAdding(true);
    try {
      await api.post("/tasks", {
        title: quickInput,
        ...(quickDate ? { deadline: deadlineOf(quickDate) } : {}),
        ...(quickRemind ? { remindAt: remindIso(quickRemind) } : {}),
        ...(quickRepeat ? { recurrence: quickRepeat } : {}),
      });
      hapticNotification("success");
      toast(quickRemind ? "Задача добавлена, напомню вовремя" : "Задача добавлена");
      setQuickInput("");
      setQuickDate("");
      setQuickRemind("");
      setQuickRepeat("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  // Правка задачи: название (поле растёт по тексту, видно всё), срок, напоминание и повтор.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRemind, setEditRemind] = useState("");
  const [editRepeat, setEditRepeat] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditText(task.title);
    setEditDate(dateKey(task.deadline));
    setEditRemind(toLocalInput(task.remindAt));
    setEditRepeat(task.recurrence ?? "");
  }

  async function saveEdit(id: string) {
    const title = editText.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await api.put(`/tasks/${id}`, { title, deadline: deadlineOf(editDate), remindAt: remindIso(editRemind), recurrence: editRepeat || null });
      hapticNotification("success");
      toast("Изменения сохранены");
      setEditingId(null);
      await load();
    } catch {
      /* не сохранилось: окно правки остаётся открытым, можно повторить */
    } finally {
      setSaving(false);
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
    today: "На сегодня задач нет. Хороший повод выдохнуть или добавить что-то выше.",
    tomorrow: "На завтра пока ничего.",
    week: "На эту неделю задач нет.",
    all: "Задач нет. Добавь первую выше.",
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
            autoFocus={autoAdd}
            placeholder="Новая задача"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
          />
          <button className="primary" onClick={quickAdd} disabled={adding}>
            {adding ? "..." : "Добавить"}
          </button>
        </div>
        <TaskFields idPrefix="task" date={quickDate} onDate={setQuickDate} remind={quickRemind} onRemind={setQuickRemind} repeat={quickRepeat} onRepeat={setQuickRepeat} />
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
        {tasks.map((task) =>
          editingId === task.id ? (
            <div className="task-edit" key={task.id}>
              <AutoTextarea
                aria-label="Название задачи"
                minRows={2}
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
              />
              <TaskFields idPrefix={`e-${task.id}`} date={editDate} onDate={setEditDate} remind={editRemind} onRemind={setEditRemind} repeat={editRepeat} onRepeat={setEditRepeat} />
              <div className="actions">
                <button className="secondary" onClick={() => setEditingId(null)}>
                  Отмена
                </button>
                <button className="primary" onClick={() => saveEdit(task.id)} disabled={saving || !editText.trim()}>
                  {saving ? "..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : (
            <SwipeRow
              key={task.id}
              disabled={togglingId === task.id}
              rightLabel={task.status === "done" ? "Вернуть" : "Выполнено"}
              leftLabel="Удалить"
              onRight={() => toggle(task)}
              onLeft={() => removeTask(task.id)}
              onUsed={markSwipeUsed}
            >
              {task.status === "done" ? (
                <>
                  <span className="done-mark" aria-hidden="true" />
                  <span className="task-main done-text">
                    <span className="task-title">{task.title}</span>
                    {task.completedAt && <span className="small">Выполнено {fmtDone(task.completedAt)}</span>}
                  </span>
                  <button className="undo-btn" onClick={() => toggle(task)} disabled={togglingId === task.id} aria-label={`Вернуть в работу: ${task.title}`}>
                    <IconUndo />
                    Вернуть
                  </button>
                </>
              ) : (
                <>
                  <button className="checkbox" onClick={() => toggle(task)} disabled={togglingId === task.id} aria-label="отметить выполненной" />
                  <span className="task-main">
                    <span className="task-title">{task.title}</span>
                    {(task.deadline || task.remindAt || task.recurrence) && (
                      <span className="task-meta">
                        {task.deadline && <span className="meta-chip">до {fmtDay(task.deadline)}</span>}
                        {task.remindAt && (
                          <span className={`meta-chip bell ${task.remindActive ? "" : "past"}`}>
                            <IconBell />
                            {fmtRemind(task.remindAt)}
                          </span>
                        )}
                        {task.recurrence && <span className="meta-chip">{REPEAT_LABEL[task.recurrence] ?? task.recurrence}</span>}
                      </span>
                    )}
                  </span>
                  <button className="icon-btn" aria-label="изменить" onClick={() => startEdit(task)}>
                    <IconEdit />
                  </button>
                  <button className="icon-btn" aria-label="удалить" onClick={() => removeTask(task.id)}>
                    <IconClose />
                  </button>
                </>
              )}
            </SwipeRow>
          )
        )}
        {tasks.length > 0 && !swipeUsed && <p className="small swipe-hint">Смахни задачу вправо, чтобы выполнить, или влево, чтобы удалить.</p>}
      </div>

      {/* Напоминания, созданные раньше отдельно от задач: остаются здесь, пока их не удалят. Новые создаются из задачи («Напомнить»). */}
      <Reminders embedded legacyOnly />
    </div>
  );
}
