import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";

interface ReportContent {
  stats: {
    tasksDone: number;
    tasksTotal: number;
    weightStart: number | null;
    weightEnd: number | null;
    balance: number;
  };
  aiSummary: string;
}

export function Reports() {
  const [kind, setKind] = useState<"weekly" | "monthly">("weekly");
  const [report, setReport] = useState<ReportContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await api.get<{ content: ReportContent }>(`/reports/${kind}`);
      setReport(res.content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сформировать отчёт");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/analytics">
        ← Аналитика
      </Link>
      <header className="page-header">
        <h2>Отчёты</h2>
      </header>

      <div className="segmented" role="group" aria-label="Период отчёта" style={{ marginBottom: 12 }}>
        <button aria-pressed={kind === "weekly"} onClick={() => setKind("weekly")}>
          Неделя
        </button>
        <button aria-pressed={kind === "monthly"} onClick={() => setKind("monthly")}>
          Месяц
        </button>
      </div>

      <div className="card">
        <button className="primary" onClick={generate} disabled={loading}>
          {loading ? "Формирую..." : `Сформировать ${kind === "weekly" ? "недельный" : "месячный"} отчёт`}
        </button>
        {error && <p className="mt" style={{ color: "var(--red)" }}>{error}</p>}
      </div>

      {report && (
        <>
          <div className="card">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">Задачи</div>
                <div className="stat-value">
                  {report.stats.tasksDone} из {report.stats.tasksTotal}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Баланс за период</div>
                <div className={report.stats.balance < 0 ? "stat-value bad" : "stat-value"}>{report.stats.balance}</div>
              </div>
              {report.stats.weightStart !== null && (
                <div className="stat" style={{ gridColumn: "1 / -1" }}>
                  <div className="stat-label">Вес</div>
                  <div className="stat-value">
                    {report.stats.weightStart} → {report.stats.weightEnd} кг
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Разбор от AI</div>
            <p className="text" style={{ whiteSpace: "pre-wrap" }}>{report.aiSummary}</p>
          </div>
        </>
      )}
    </div>
  );
}
