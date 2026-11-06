import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DirectionScoreCard } from "../components/DirectionScoreCard";

interface AnalyticsData {
  score: {
    overall: number;
    goalsScore: number;
    healthScore: number;
    financeScore: number;
    habitsScore: number;
    timeScore: number;
  };
  drift: { driftDetected: boolean; message: string | null };
}

interface SimulationResult {
  possible: boolean;
  reason?: string;
  currentScore?: number;
  projectedScore?: number;
  adjustedScore?: number;
  narrative?: string | null;
  disclaimer?: string;
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [whyStopped, setWhyStopped] = useState<string | null>(null);
  const [loadingWhy, setLoadingWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extraHours, setExtraHours] = useState("5");
  const [simCurrent, setSimCurrent] = useState<SimulationResult | null>(null);
  const [simExtra, setSimExtra] = useState<SimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    api.get<AnalyticsData>("/analytics").then(setData);
  }, []);

  async function askWhyStopped() {
    setLoadingWhy(true);
    setError(null);
    try {
      const res = await api.post<{ answer: string }>("/ai/analyze", { kind: "why_stopped" });
      setWhyStopped(res.answer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось получить ответ");
    } finally {
      setLoadingWhy(false);
    }
  }

  // Раздел 28: Future Simulation — «Куда я приду через год, если ничего не менять?»
  // и «Что будет, если я добавлю N часов в неделю на эту цель?»
  async function runSimulation() {
    setSimLoading(true);
    try {
      const [current, extra] = await Promise.all([
        api.post<SimulationResult>("/simulation/future", { scenario: "current_trajectory" }),
        api.post<SimulationResult>("/simulation/future", {
          scenario: "extra_hours",
          extraHoursPerWeek: Number(extraHours) || 0,
        }),
      ]);
      setSimCurrent(current);
      setSimExtra(extra);
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Аналитика</h2>
        <p>Спокойный взгляд на то, куда всё движется</p>
      </header>

      {data && (
        <DirectionScoreCard
          overall={data.score.overall}
          goalsScore={data.score.goalsScore}
          healthScore={data.score.healthScore}
          financeScore={data.score.financeScore}
          habitsScore={data.score.habitsScore}
          timeScore={data.score.timeScore}
          driftMessage={data.drift.driftDetected ? data.drift.message : null}
        />
      )}

      <div className="card">
        <div className="card-title">Почему я остановился?</div>
        <p className="small" style={{ marginBottom: 10 }}>
          AI посмотрит на твои данные и предположит, что могло помешать. Это версия, а не диагноз.
        </p>
        <button className="primary" onClick={askWhyStopped} disabled={loadingWhy}>
          {loadingWhy ? "Анализирую..." : "Спросить AI"}
        </button>
        {error && <p className="mt" style={{ color: "var(--red)" }}>{error}</p>}
        {whyStopped && <p className="mt text">{whyStopped}</p>}
      </div>

      <div className="card">
        <div className="card-title">Куда я приду через год?</div>
        <div className="spread" style={{ marginBottom: 12 }}>
          <label htmlFor="extra-hours" className="small" style={{ flex: 1 }}>
            Дополнительных часов в неделю на цель
          </label>
          <input
            id="extra-hours"
            inputMode="numeric"
            style={{ width: 72, textAlign: "center" }}
            value={extraHours}
            onChange={(e) => setExtraHours(e.target.value)}
          />
        </div>
        <button className="primary" onClick={runSimulation} disabled={simLoading}>
          {simLoading ? "Считаю..." : "Построить прогноз"}
        </button>

        {simCurrent && !simCurrent.possible && <p className="mt">{simCurrent.reason}</p>}

        {simCurrent?.possible && (
          <div className="mt">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">Сейчас</div>
                <div className="stat-value">{simCurrent.currentScore}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Через год без изменений</div>
                <div className="stat-value">{simCurrent.projectedScore}</div>
              </div>
              {simExtra?.possible && (
                <div className="stat" style={{ gridColumn: "1 / -1" }}>
                  <div className="stat-label">С дополнительными часами</div>
                  <div className="stat-value good">{simExtra.adjustedScore}</div>
                </div>
              )}
            </div>
            {simCurrent.narrative && <p className="mt text">{simCurrent.narrative}</p>}
            <p className="small mt">{simCurrent.disclaimer}</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Подробнее</div>
        <nav className="link-list">
          <Link className="link-row" to="/reports">Отчёты за неделю и месяц</Link>
          <Link className="link-row" to="/correlations">Закономерности</Link>
          <Link className="link-row" to="/life-graph">Карта жизни</Link>
        </nav>
      </div>
    </div>
  );
}
