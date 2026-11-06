import { confirmDelete } from "../utils/format";
import { IconClose } from "../components/Icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../platform/sdk";
import { GoalSuggestions } from "../components/GoalSuggestions";

interface Stage {
  id: string;
  title: string;
  status: string;
}

interface Goal {
  id: string;
  title: string;
  reason: string | null;
  deadline: string | null;
  progress: number;
  stages: Stage[];
}

export function Goals({ embedded = false }: { embedded?: boolean } = {}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null); // этап или цель, по которым идёт запрос

  async function load() {
    setGoals(await api.get<Goal[]>("/goals"));
  }

  useEffect(() => {
    load();
  }, []);

  async function createGoal() {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      await api.post("/goals", { title, reason: reason || undefined });
      hapticNotification("success");
      setTitle("");
      setReason("");
      setShowForm(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  // Тап по этапу переключает его между "выполнен" и "в работе" — именно этого
  // раньше не хватало (см. аудит): прогресс цели нигде не обновлялся, потому что
  // нечем было отметить этап выполненным.
  async function removeGoal(id: string) {
    if (!confirmDelete("Удалить эту цель вместе с этапами? Задачи, привязанные к ней, останутся.")) return;
    try {
      await api.delete(`/goals/${id}`);
      hapticImpact("medium");
      await load();
    } catch {
      /* цель осталась в списке: можно повторить */
    }
  }

  async function toggleStage(goalId: string, stage: Stage) {
    if (busyKey) return;
    setBusyKey(stage.id);
    try {
      const nextStatus = stage.status === "completed" ? "active" : "completed";
      await api.put(`/goals/${goalId}/stages/${stage.id}`, { status: nextStatus });
      hapticImpact("light");
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function addStage(goalId: string) {
    const text = stageInputs[goalId]?.trim();
    if (!text || busyKey) return;
    setBusyKey(`new:${goalId}`);
    try {
      await api.post(`/goals/${goalId}/stages`, { title: text, status: "planned" });
      hapticNotification("success");
      setStageInputs((prev) => ({ ...prev, [goalId]: "" }));
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className={embedded ? undefined : "screen"}>
      {!embedded && <h2>Цели</h2>}

      {goals.map((goal) => (
        <div className="card" key={goal.id}>
          <div className="spread">
            <h3 style={{ flex: 1 }}>{goal.title}</h3>
            <button className="icon-btn" aria-label="удалить цель" onClick={() => removeGoal(goal.id)}>
              <IconClose />
            </button>
          </div>
          {goal.reason && <p style={{ marginBottom: 8 }}>Почему: {goal.reason}</p>}
          <div className="spread small" style={{ marginBottom: 4 }}>
            <span>Прогресс</span>
            <span className="text">{goal.progress}%</span>
          </div>
          <div className="progress" role="img" aria-label={`Прогресс: ${goal.progress}%`} style={{ marginBottom: 12 }}>
            <span style={{ width: `${Math.max(0, Math.min(100, goal.progress))}%` }} />
          </div>
          {goal.stages.map((stage) => (
            <div className="task-row" key={stage.id}>
              <button
                className={stage.status === "completed" ? "checkbox done" : "checkbox"}
                onClick={() => toggleStage(goal.id, stage)}
                disabled={busyKey === stage.id}
                aria-label={stage.status === "completed" ? "вернуть этап в работу" : "отметить этап выполненным"}
              />
              <span style={{ color: stage.status === "overdue" ? "var(--red)" : stage.status === "blocked" ? "var(--orange)" : undefined }}>
                {stage.title}
              </span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input
              placeholder="Новый этап..."
              value={stageInputs[goal.id] ?? ""}
              onChange={(e) => setStageInputs((prev) => ({ ...prev, [goal.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addStage(goal.id)}
            />
            <button
              className="primary"
              style={{ width: "auto", padding: "10px 16px" }}
              onClick={() => addStage(goal.id)}
              disabled={busyKey === `new:${goal.id}`}
              aria-label="добавить этап"
            >
              +
            </button>
          </div>
        </div>
      ))}

      {goals.length === 0 && (
        <div className="card">
          <p>Целей пока нет. Можно создать свою или попросить подсказку из записей дневника ниже.</p>
        </div>
      )}

      <GoalSuggestions onCreated={load} />

      {!showForm && (
        <button className="primary" onClick={() => setShowForm(true)}>
          + Новая цель
        </button>
      )}

      {showForm && (
        <div className="card">
          <input
            placeholder="Название цели"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <input
            placeholder="Почему это важно (необязательно)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <button className="primary" onClick={createGoal} disabled={creating}>
            {creating ? "Создаю..." : "Создать"}
          </button>
        </div>
      )}
    </div>
  );
}
