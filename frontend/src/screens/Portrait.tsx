import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";

interface PortraitContent {
  patterns: string[];
  statedPrinciples: string[];
  goalAlignment: string;
  advisorVoice: string;
}

interface PortraitRecord {
  id: string;
  content: PortraitContent;
  createdAt: string;
}

// "Портрет по дневнику" — не клон и не диагноз, а отражение паттернов, которые видны
// в том, что человек сам написал. Осторожные формулировки, опора на текст — см.
// backend/src/services/ai/selfPortrait.ts.
export function Portrait() {
  const [portrait, setPortrait] = useState<PortraitRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    // БАГ (найден при повторном аудите): без try/catch сбой запроса оставлял бы экран
    // на "Загрузка..." навсегда — setLoading(false) просто никогда не выполнился бы,
    // если бы api.get выбросил ошибку. Тот же класс бага, что был в Settings.tsx.
    try {
      const p = await api.get<PortraitRecord | null>("/portrait");
      setPortrait(p);
    } catch {
      // Сбой начальной загрузки не критичен — кнопка "Составить портрет" ниже всё равно
      // доступна и не зависит от того, успела ли подгрузиться предыдущая версия.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const content = await api.post<PortraitContent>("/portrait/generate");
      setPortrait({ id: "new", content, createdAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось составить портрет");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/journal">
        ← Дневник
      </Link>
      <header className="page-header">
        <h2>Портрет по дневнику</h2>
        <p>
          Что видно в твоих же записях. Это не диагноз, а отражение с опорой на то, что ты сам написал. Чем больше записей,
          тем точнее. Личные и тяжёлые записи в портрете не участвуют.
        </p>
      </header>

      <div className="card">
        <button className="primary" onClick={generate} disabled={generating}>
          {generating ? "Анализирую записи..." : portrait ? "Обновить портрет" : "Составить портрет"}
        </button>
        {error && <p className="mt" style={{ color: "var(--red)" }}>{error}</p>}
      </div>

      {loading && <p>Загрузка...</p>}

      {!loading && !portrait && !generating && (
        <div className="card">
          <p className="empty">Портрета пока нет. Нажми «Составить портрет».</p>
        </div>
      )}

      {portrait && (
        <>
          <div className="card">
            <div className="card-title">Закономерности в записях</div>
            {portrait.content.patterns.map((p, i) => (
              <p key={i} className="text" style={{ marginBottom: 8 }}>
                {p}
              </p>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Принципы, которые ты назвал</div>
            {portrait.content.statedPrinciples.length === 0 && <p>Пока не выделены.</p>}
            {portrait.content.statedPrinciples.map((p, i) => (
              <p key={i} className="text" style={{ marginBottom: 6 }}>
                {p}
              </p>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Совпадают ли цели с тем, что важно</div>
            <p className="text">{portrait.content.goalAlignment}</p>
          </div>

          <div className="card">
            <div className="card-title">Как AI теперь говорит с тобой</div>
            <p className="text">{portrait.content.advisorVoice}</p>
            <p className="small mt">Это учитывается во всех ответах AI: в чате, в подсказках «что делать сейчас», в отчётах.</p>
          </div>
        </>
      )}
    </div>
  );
}
