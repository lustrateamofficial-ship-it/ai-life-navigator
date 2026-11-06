import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticNotification } from "../telegram/sdk";

const FIELDS = [
  { key: "desiredLife", label: "Какой жизнью я хочу жить?" },
  { key: "whatToAchieve", label: "Чего хочу добиться?" },
  { key: "whyImportant", label: "Почему это важно?" },
  { key: "whatToAvoid", label: "Чего хочу избежать?" },
  { key: "whoToBecome", label: "Каким человеком хочу стать?" },
  { key: "successDefinition", label: "Каким будет признак успеха?" },
] as const;

type Answers = Record<(typeof FIELDS)[number]["key"], string>;
const EMPTY: Answers = { desiredLife: "", whatToAchieve: "", whyImportant: "", whatToAvoid: "", whoToBecome: "", successDefinition: "" };

// Миссия — необязательный верхний уровень модели (Миссия → Цель → Этап → Задача): AI использует её как
// контекст. Раньше её можно было заполнить только при первом запуске, теперь её можно открыть и изменить в любой момент.
export function Mission() {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<Partial<Answers> | null>("/mission")
      .then((m) => m && setAnswers({ ...EMPTY, ...Object.fromEntries(FIELDS.map((f) => [f.key, m[f.key] ?? ""])) }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/mission", answers);
      hapticNotification("success");
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Моя миссия</h2>
        <p>Необязательно. Чем честнее ответы, тем точнее советы. Любой вопрос можно пропустить.</p>
      </header>

      {loading && <p>Загрузка...</p>}
      {!loading &&
        FIELDS.map((f) => (
          <div className="card" key={f.key}>
            <label className="card-title" htmlFor={`m-${f.key}`} style={{ display: "block" }}>
              {f.label}
            </label>
            <textarea id={`m-${f.key}`} rows={3} value={answers[f.key]} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />
          </div>
        ))}
      {!loading && (
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? "Сохраняю..." : "Сохранить"}
        </button>
      )}
      {saved && (
        <p className="mt" style={{ color: "var(--green)" }} role="status">
          Сохранено.
        </p>
      )}
    </div>
  );
}
