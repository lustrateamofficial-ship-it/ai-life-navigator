import { useEffect, useState } from "react";
import { bestStreakFrom, isSkipped, readSkips, readStreakDays, skipsLeft, skipToday, streakEvent, streakFrom, unskipToday } from "../../phone/streak";
import { dayKey } from "../../phone/daily";
import { MAX_SKIPS_PER_WEEK } from "../../phone/streakCore";
import { plural } from "./WeekDigest";

const WEEKS = 5;
const NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// «Я → Серия»: текущая и лучшая серия и календарь последних пяти недель. Закрашен день, когда закрыты все задачи дня.
export function StreakCard() {
  const [days, setDays] = useState(readStreakDays());
  const [skips, setSkips] = useState(readSkips());
  useEffect(() => {
    const on = () => {
      setDays(readStreakDays());
      setSkips(readSkips());
    };
    window.addEventListener(streakEvent, on);
    return () => window.removeEventListener(streakEvent, on);
  }, []);
  const now = new Date();
  const cur = streakFrom(days, now, skips);
  const best = Math.max(bestStreakFrom(days, skips), cur);
  const skippedToday = isSkipped(now);
  const left = skipsLeft(now, skips);
  const doneToday = days.includes(dayKey(now));
  const set = new Set(days);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - (WEEKS - 1) * 7, 12);
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return { k: dayKey(d), future: d.getTime() > now.getTime() + 43200000, day: d.getDate() };
  });
  return (
    <div className="card" id="streak-card">
      <div className="card-title">Серия дней</div>
      <p className="streak-big">
        <b>{cur}</b> {plural(cur, "день", "дня", "дней")} подряд
      </p>
      <p className="small">Лучшая серия: {best} {plural(best, "день", "дня", "дней")}. Всего закрыто дней: {days.length}.</p>
      <div className="cal5" role="img" aria-label={`Календарь последних пяти недель: закрыто ${cells.filter((c) => set.has(c.k)).length} дней`}>
        {NAMES.map((n) => (
          <span key={n} className="cal5-h">{n}</span>
        ))}
        {cells.map((c) => (
          <i key={c.k} className={set.has(c.k) ? "on" : skips.includes(c.k) ? "skip" : c.future ? "future" : ""} title={c.k}>
            {c.day}
          </i>
        ))}
      </div>
      <p className="small" style={{ marginTop: 10 }}>День засчитывается, когда закрыты все задачи, запланированные на этот день.</p>
      {!doneToday && (
        <div className={`skip-panel ${skippedToday ? "is-skipped" : ""}`}>
          <span className="skip-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 5v14M16 5v14" />
            </svg>
          </span>
          <div className="skip-text">
            <b>{skippedToday ? "Сегодня пропущен" : "Нужен выходной?"}</b>
            <span>
              {skippedToday ? "Серия сохранена." : left > 0 ? "Пропуск не прервёт серию." : "Пропуски на этой неделе закончились."}
            </span>
            <span className="skip-pips" aria-label={`Пропусков на неделе осталось: ${left} из ${MAX_SKIPS_PER_WEEK}`}>
              {Array.from({ length: MAX_SKIPS_PER_WEEK }, (_, i) => (
                <i key={i} className={i < left ? "on" : ""} />
              ))}
              <small>{left} из {MAX_SKIPS_PER_WEEK} на неделе</small>
            </span>
          </div>
          {skippedToday ? (
            <button className="skip-btn undo" id="unskip-day" onClick={() => unskipToday()}>
              Отменить пропуск
            </button>
          ) : (
            <button className="skip-btn" id="skip-day" disabled={left <= 0} onClick={() => skipToday()}>
              Пропустить сегодня
            </button>
          )}
        </div>
      )}
    </div>
  );
}
