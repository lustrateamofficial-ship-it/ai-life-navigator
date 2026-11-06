import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, buildBrief, lifeLeftText, readDaily, refreshWeather, weatherText, weightText, type DayBrief as Brief } from "../../shim/daily";

// Сводка на главном экране: утром и днём показывает сегодняшний день, с вечера (после 18:00) предлагает план на завтра.
export function DayBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const evening = new Date().getHours() >= 18;

  useEffect(() => {
    let alive = true;
    const day = evening ? addDays(new Date(), 1) : new Date();
    void refreshWeather().catch(() => false).then(() => buildBrief(day)).then((b) => alive && setBrief(b)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [evening]);

  if (!brief) return null;
  const s = readDaily();
  const empty = brief.tasks.length === 0 && brief.schedule.length === 0;

  if (evening) {
    return (
      <div className="card" id="day-brief">
        <div className="card-title">Завтра</div>
        {brief.weather && <p>Погода: {weatherText(brief.weather)}</p>}
        <p className="small">
          {empty ? "План на завтра пока пуст." : `Уже в плане: задач ${brief.plannedCount}, в расписании ${brief.schedule.length}.`}
        </p>
        <Link className="primary-link" to="/plan-tomorrow">
          {empty ? "Заполнить план на завтра" : "Открыть план на завтра"}
        </Link>
      </div>
    );
  }

  return (
    <div className="card" id="day-brief">
      <div className="card-title">Сегодня</div>
      {brief.weather && <p>Погода: {weatherText(brief.weather)}</p>}
      {brief.weight && <p className="small">{weightText(brief.weight)}</p>}
      {brief.life && <p className="small">{lifeLeftText(brief.life)}</p>}
      {!s.city && <p className="small">Чтобы здесь была погода, укажи город в Настройках, раздел «Утро и вечер».</p>}
      {brief.tasks.length > 0 && (
        <>
          <div className="small mt">Главное на день</div>
          <ol style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {brief.tasks.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ol>
        </>
      )}
      {brief.schedule.length > 0 && (
        <>
          <div className="small mt">Расписание</div>
          {brief.schedule.map((l, i) => (
            <div key={i} className="list-sub">
              <b>{l.time}</b> {l.text}
            </div>
          ))}
        </>
      )}
      {empty && <p className="small">На сегодня ничего не запланировано.</p>}
    </div>
  );
}
