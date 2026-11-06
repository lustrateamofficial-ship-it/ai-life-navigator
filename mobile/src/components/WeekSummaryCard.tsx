import { useState } from "react";
import { api, ApiError } from "../api/client";

interface WeekSummary {
  summary: string | null;
  highlights?: Array<{ text: string; quote: string }>;
  reason?: string;
}

// Итоги недели по записям дневника. Каждый пункт показывается вместе с дословной цитатой из записи,
// чтобы можно было проверить, что это сказал сам человек, а не придумала модель.
export function WeekSummaryCard() {
  const [data, setData] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"week" | "month">("week");

  async function load(p: "week" | "month" = period) {
    if (loading) return;
    setLoading(true);
    try {
      setData(await api.post<WeekSummary>("/home/week-summary", { period: p }));
    } catch (err) {
      setData({ summary: null, reason: err instanceof ApiError ? err.message : "Не получилось сейчас. Попробуй позже." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Итоги {period === "week" ? "недели" : "месяца"}</div>
      <div className="chips" role="group" aria-label="Период итогов">
        <button className="chip" aria-pressed={period === "week"} onClick={() => { setPeriod("week"); setData(null); }}>Неделя</button>
        <button className="chip" aria-pressed={period === "month"} onClick={() => { setPeriod("month"); setData(null); }}>Месяц</button>
      </div>
      <p style={{ marginBottom: 8, fontSize: 13 }}>
        Короткий итог по записям за последние {period === "week" ? "7 дней" : "30 дней"}, с цитатами. Личные записи не используются.
      </p>
      <button className="secondary" style={{ width: "100%" }} onClick={() => load()} disabled={loading}>
        {loading ? "Читаю..." : data ? "Обновить итоги" : period === "week" ? "Подвести итоги недели" : "Подвести итоги месяца"}
      </button>

      {data?.summary && (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: "var(--text)" }}>{data.summary}</p>
          {data.highlights?.map((h, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <p style={{ color: "var(--text)" }}>{h.text}</p>
              <blockquote className="quote">«{h.quote}»</blockquote>
            </div>
          ))}
          <p style={{ marginTop: 10, fontSize: 13 }}>Это не диагноз и не вывод о тебе, только пересказ записей.</p>
        </div>
      )}
      {data && !data.summary && <p style={{ marginTop: 12 }}>{data.reason}</p>}
    </div>
  );
}
