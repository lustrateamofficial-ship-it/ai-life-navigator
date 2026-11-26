import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { formatNumber } from "../utils/format";
import { readStart, weightProgress } from "../../phone/weightGoal";

interface W {
  logs?: Array<{ date: string; weightKg: number }>;
  current: number | null;
}

// Плитка веса на «Сегодня»: линия последних записей, пунктир цели и процент выполнения.
export function WeightTile() {
  const navigate = useNavigate();
  const [w, setW] = useState<W | null>(null);
  const [goal, setGoal] = useState<number | null>(null);

  useEffect(() => {
    let off = false;
    const load = async () => {
      try {
        const [a, p] = await Promise.all([api.get<W>("/health/weight"), api.get<{ weightGoalKg?: number | null } | null>("/profile")]);
        if (off) return;
        setW(a);
        setGoal(p?.weightGoalKg ?? null);
      } catch {
        /* без данных плитка просто предложит записать вес */
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      off = true;
      window.removeEventListener("focus", load);
    };
  }, []);

  const logs = [...(w?.logs ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const now = w?.current ?? (logs.length ? logs[logs.length - 1]!.weightKg : null);
  const start = readStart()?.kg ?? logs[0]?.weightKg ?? now;
  const pr = goal && start != null && now != null ? weightProgress(start, now, goal) : null;

  const W_ = 120;
  const H_ = 44;
  const vals = logs.map((l) => l.weightKg);
  const all = [...vals, ...(goal ? [goal] : [])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const y = (v: number) => 5 + (1 - (v - min) / span) * (H_ - 10);
  const x = (i: number) => 3 + (logs.length > 1 ? (i / (logs.length - 1)) * (W_ - 8) : (W_ - 8) / 2);
  const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const label = goal ? `Вес, цель ${formatNumber(goal)}` : "Вес";
  return (
    <button type="button" className="tile-card tone-mint weight-tile" onClick={() => navigate(now == null || !goal ? "/me?weigh=1" : "/me")} aria-label={now == null ? "Вес: записать" : `Вес ${formatNumber(now)} кг${pr ? `, выполнено ${pr.percent}%` : ""}`}>
      <span className="tile-lab">{label}</span>
      {logs.length >= 2 ? (
        <svg className="spark" viewBox={`0 0 ${W_} ${H_}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={path} />
          <circle cx={x(logs.length - 1)} cy={y(vals[vals.length - 1]!)} r="3.5" className="dot" />
          {goal && <path d={`M2 ${y(goal).toFixed(1)} H${W_ - 2}`} className="goal-dash" />}
        </svg>
      ) : (
        <span className="tile-sub">{now == null ? "Запиши вес после взвешивания" : "График появится после второй записи"}</span>
      )}
      <span className="tile-big-row">
        <span className="tile-big">{now == null ? "—" : formatNumber(now)}</span>
        <span className="tile-unit"> {now == null ? "" : "кг"}{pr ? ` · ${pr.percent}%` : !goal ? " · цель не задана" : ""}</span>
      </span>
    </button>
  );
}
