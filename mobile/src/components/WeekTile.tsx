import { useEffect, useState } from "react";
import { api } from "../api/client";
import { plural } from "./WeekDigest";
import { dayLevels, weekStart, key, dateOnly } from "../../phone/weekLevels";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Плитка «Эта неделя»: семь скруглённых квадратов, чем темнее, тем больше было сделано в этот день.
export function WeekTile() {
  const [data, setData] = useState<{ levels: number[]; done: number } | null>(null);
  const start = weekStart();
  const todayIdx = (new Date().getDay() + 6) % 7;

  useEffect(() => {
    let off = false;
    const load = async () => {
      try {
        const [j, t, wt, hb] = await Promise.all([
          api.get<{ entries: Array<{ createdAt: string }> }>(`/journal?after=${encodeURIComponent(start.toISOString())}&limit=100`),
          api.get<Array<{ completedAt?: string | null }>>("/tasks?range=done"),
          api.get<{ logs?: Array<{ date: string }> }>("/health/weight").catch(() => null),
          api.get<Array<{ logs?: Array<{ date: string; completed: boolean }> }>>("/habits").catch(() => null),
        ]);
        if (off) return;
        const from = start.getTime();
        const doneAt = (t ?? []).map((x) => x.completedAt).filter((x): x is string => !!x && new Date(x).getTime() >= from);
        const fromKey = key(start);
        const weights = (wt?.logs ?? []).map((x) => x.date).filter((d) => dateOnly(d) >= fromKey);
        const marks = (hb ?? []).flatMap((x) => x.logs ?? []).filter((l) => l.completed && dateOnly(l.date) >= fromKey).map((l) => l.date);
        setData(dayLevels(start, (j?.entries ?? []).map((x) => x.createdAt), doneAt, weights, marks));
      } catch {
        if (!off) setData({ levels: [0, 0, 0, 0, 0, 0, 0], done: 0 });
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      off = true;
      window.removeEventListener("focus", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = data ?? { levels: [0, 0, 0, 0, 0, 0, 0], done: 0 };
  return (
    <section className="tile-card tone-butter week-tile" aria-label="Эта неделя">
      <div className="tile-head">
        <span className="tile-lab">Эта неделя</span>
        <span className="tile-lab">выполнено {d.done} {plural(d.done, "задача", "задачи", "задач")}</span>
      </div>
      <div className="week-days">
        {DAYS.map((n, i) => (
          <div className={`wd ${i === todayIdx ? "today" : ""}`} key={n}>
            <i className={`lv${d.levels[i]}`} role="img" aria-label={`${n}: ${["пусто", "есть активность", "день полный"][d.levels[i]!]}`} />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
