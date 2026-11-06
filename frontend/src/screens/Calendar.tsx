import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";
import { IconClose } from "../components/Icons";

interface CalendarEvent {
  id: string;
  title: string;
  category: string;
  startTime: string;
  endTime: string;
}

interface CalendarEventResponse extends CalendarEvent {
  warning?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  work: "Работа",
  training: "Тренировка",
  meeting: "Встреча",
  personal: "Личное",
  sleep: "Сон",
  free_time: "Свободное время",
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function formatDay(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

// Локальный ISO-datetime (без таймзоны) для значения <input type="datetime-local">.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("personal");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function load() {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    setEvents(await api.get<CalendarEvent[]>(`/calendar?from=${from.toISOString()}&to=${to.toISOString()}`));
  }

  useEffect(() => {
    load();
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setTitle("");
    setCategory("personal");
    setStart("");
    setEnd("");
    setWarning(null);
    setShowForm(true);
  }

  function openEditForm(e: CalendarEvent) {
    setEditingId(e.id);
    setTitle(e.title);
    setCategory(e.category);
    setStart(toDatetimeLocal(e.startTime));
    setEnd(toDatetimeLocal(e.endTime));
    setWarning(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submitForm() {
    if (!title.trim() || !start || !end || saving) return;
    setSaving(true);
    try {
      // <input type="datetime-local"> отдаёт "YYYY-MM-DDTHH:mm" без секунд и таймзоны —
      // backend ждёт полный ISO 8601. new Date(...) интерпретирует это как локальное
      // время браузера и .toISOString() корректно переводит в UTC с "Z".
      const payload = {
        title,
        category,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
      };
      const saved = editingId
        ? await api.put<CalendarEventResponse>(`/calendar/${editingId}`, payload)
        : await api.post<CalendarEventResponse>("/calendar", payload);

      // Предупреждение о пересечении — не блокирует сохранение (раздел "прощающий, не
      // гиперзаботливый интерфейс"): событие в любом случае уже сохранено на бэкенде,
      // поэтому форма закрывается как при обычном успехе, а предупреждение показывается
      // отдельным баннером над списком — иначе повторное нажатие "Сохранить" при открытой
      // форме создало бы дубликат события вместо того, чтобы просто подтвердить пересечение.
      if (saved.warning) {
        hapticNotification("warning");
        setWarning(saved.warning);
      } else {
        hapticNotification("success");
      }
      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.delete(`/calendar/${id}`);
      hapticImpact("medium");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // Группировка по дню — раздел 18: визуальный календарь
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = formatDay(new Date(e.startTime));
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Расписание</h2>
        <p>Ближайшие семь дней</p>
      </header>

      {warning && (
        <div className="card notice" role="status">
          <p>{warning}</p>
          <button className="small-btn" onClick={() => setWarning(null)}>
            Понятно
          </button>
        </div>
      )}

      {Object.keys(grouped).length === 0 && (
        <div className="card">
          <p className="empty">Событий на неделю нет.</p>
        </div>
      )}

      {Object.entries(grouped).map(([day, dayEvents]) => (
        <div key={day}>
          <h3 className="day-heading">{day}</h3>
          <div className="card">
            {dayEvents.map((e) => (
              <div className="task-row" key={e.id}>
                <span className="time-col">{timeOf(e.startTime)}</span>
                <button className="list-main" onClick={() => openEditForm(e)}>
                  <div className="text">{e.title}</div>
                  <div className="list-sub">
                    до {timeOf(e.endTime)} · {CATEGORY_LABEL[e.category] ?? e.category}
                  </div>
                </button>
                <button className="icon-btn" onClick={() => removeEvent(e.id)} disabled={busyId === e.id} aria-label="удалить событие">
                  <IconClose />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!showForm && (
        <button className="primary" onClick={openCreateForm}>
          Новое событие
        </button>
      )}

      {showForm && (
        <div className="card">
          <div className="card-title">{editingId ? "Изменить событие" : "Новое событие"}</div>
          <div className="stack">
            <input aria-label="Название" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select aria-label="Категория" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <label className="list-sub">
              Начало
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="list-sub">
              Конец
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button className="secondary" onClick={closeForm}>
              Отмена
            </button>
            <button className="primary" onClick={submitForm} disabled={saving}>
              {saving ? "..." : editingId ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
