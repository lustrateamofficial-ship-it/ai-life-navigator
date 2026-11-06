import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";
import { IconClose } from "../components/Icons";

interface Reminder {
  id: string;
  title: string;
  triggerAt: string;
  recurrence: string;
}

const RECURRENCE_LABEL: Record<string, string> = {
  once: "Одноразовое",
  daily: "Каждый день",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
};

// Локальный ISO-datetime (без таймзоны) для значения <input type="datetime-local">,
// чтобы при редактировании поле показывало то же время, что уже сохранено.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [triggerAt, setTriggerAt] = useState("");
  const [recurrence, setRecurrence] = useState("once");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setReminders(await api.get<Reminder[]>("/reminders"));
  }

  useEffect(() => {
    load();
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setTitle("");
    setTriggerAt("");
    setRecurrence("once");
    setShowForm(true);
  }

  function openEditForm(r: Reminder) {
    setEditingId(r.id);
    setTitle(r.title);
    setTriggerAt(toDatetimeLocal(r.triggerAt));
    setRecurrence(r.recurrence);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submitForm() {
    if (!title.trim() || !triggerAt || saving) return;
    setSaving(true);
    try {
      const payload = { title, triggerAt: new Date(triggerAt).toISOString(), recurrence };
      if (editingId) {
        await api.put(`/reminders/${editingId}`, payload);
      } else {
        await api.post("/reminders", payload);
      }
      hapticNotification("success");
      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeReminder(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.delete(`/reminders/${id}`);
      hapticImpact("medium");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Напоминания</h2>
        <p>Бот пришлёт сообщение в назначенное время</p>
      </header>

      <div className="card">
        {reminders.length === 0 && <p className="empty">Напоминаний нет.</p>}
        {reminders.map((r) => (
          <div className="task-row" key={r.id}>
            <button className="list-main" onClick={() => openEditForm(r)}>
              <div className="text">{r.title}</div>
              <div className="list-sub">
                {new Date(r.triggerAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                {" · "}
                {RECURRENCE_LABEL[r.recurrence] ?? r.recurrence}
              </div>
            </button>
            <button className="icon-btn" onClick={() => removeReminder(r.id)} disabled={busyId === r.id} aria-label="удалить напоминание">
              <IconClose />
            </button>
          </div>
        ))}
      </div>

      {!showForm && (
        <button className="primary" onClick={openCreateForm}>
          Новое напоминание
        </button>
      )}

      {showForm && (
        <div className="card">
          <div className="card-title">{editingId ? "Изменить напоминание" : "Новое напоминание"}</div>
          <div className="stack">
            <input aria-label="Название" placeholder="Например: купить продукты" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input aria-label="Когда напомнить" type="datetime-local" value={triggerAt} onChange={(e) => setTriggerAt(e.target.value)} />
            <select aria-label="Повтор" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="once">Одноразовое</option>
              <option value="daily">Каждый день</option>
              <option value="weekly">Каждую неделю</option>
              <option value="monthly">Каждый месяц</option>
            </select>
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
