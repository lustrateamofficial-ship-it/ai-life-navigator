import { useState } from "react";
import { Link } from "react-router-dom";
import { localDayKey } from "../utils/format";

const KEY = "navigator:week-review-seen";

// Номер недели для запоминания закрытой плашки: понедельник этой недели (после воскресного вечера считаем прошедшую).
function weekId(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (d.getDay() === 1 ? 7 : 0)); // в понедельник утром это всё ещё прошедшая неделя
  return localDayKey(d);
}

// Плашка «Итоги недели готовы»: воскресенье с 18:00 и понедельник до полудня.
export function WeekReviewNudge({ now = new Date() }: { now?: Date }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === weekId(now);
    } catch {
      return false;
    }
  });
  const day = now.getDay();
  const inWindow = (day === 0 && now.getHours() >= 18) || (day === 1 && now.getHours() < 12);
  if (!inWindow || hidden) return null;
  function close() {
    try {
      localStorage.setItem(KEY, weekId(now));
    } catch {
      /* не запомнится: плашка покажется снова */
    }
    setHidden(true);
  }
  return (
    <div className="card week-nudge" role="status">
      <div className="card-title">Итоги недели готовы</div>
      <p className="small" style={{ marginBottom: 10 }}>Задачи, дни, вес и серия за последние семь дней.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <Link className="primary-link" style={{ flex: 1, margin: 0 }} to="/week-review" onClick={close}>Посмотреть</Link>
        <button type="button" className="secondary" style={{ flex: 1 }} onClick={close}>Позже</button>
      </div>
    </div>
  );
}
