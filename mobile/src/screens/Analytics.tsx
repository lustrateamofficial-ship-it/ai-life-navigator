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

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [whyStopped, setWhyStopped] = useState<string | null>(null);
  const [loadingWhy, setLoadingWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          ИИ посмотрит на твои данные и предположит, что могло помешать. Это версия, а не диагноз.
        </p>
        <button className="primary" onClick={askWhyStopped} disabled={loadingWhy}>
          {loadingWhy ? "Анализирую..." : "Спросить ИИ"}
        </button>
        {error && <p className="mt" style={{ color: "var(--red)" }}>{error}</p>}
        {whyStopped && <p className="mt text">{whyStopped}</p>}
      </div>

      <div className="card">
        <div className="card-title">Подробнее</div>
        <nav className="link-list">
          <Link className="link-row" to="/portrait">Портрет по дневнику</Link>
        </nav>
      </div>
    </div>
  );
}
