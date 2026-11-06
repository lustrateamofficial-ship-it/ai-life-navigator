import { formatNumber } from "../utils/format";

interface Log {
  date: string;
  weightKg: number;
}

// График веса за последние записи (до 90) и сглаженный тренд: среднее по 7 последним точкам.
// Тренд нужен, чтобы единичный скачок не выглядел катастрофой.
export function WeightChart({ logs }: { logs: Log[] }) {
  const pts = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 3) {
    return (
      <p className="small" style={{ marginTop: 12 }}>
        График появится после трёх записей веса. Сейчас: {pts.length}.
      </p>
    );
  }
  const W = 320;
  const H = 130;
  const padX = 8;
  const padY = 14;
  const values = pts.map((p) => p.weightKg);
  const trend = values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - 6), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const min = Math.min(...values, ...trend);
  const max = Math.max(...values, ...trend);
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (pts.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = new Date(pts[0].date).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const last = new Date(pts[pts.length - 1].date).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const change = Math.round((trend[trend.length - 1] - trend[0]) * 10) / 10;
  const summary = `Вес с ${first} по ${last}: тренд ${formatNumber(trend[0])} → ${formatNumber(trend[trend.length - 1])} кг, изменение ${change > 0 ? "+" : ""}${formatNumber(change)} кг. Записей: ${pts.length}.`;

  return (
    <div style={{ marginTop: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={padX} x2={W - padX} y1={y(min)} y2={y(min)} stroke="var(--border)" strokeWidth="1" />
        <line x1={padX} x2={W - padX} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeWidth="1" />
        <path d={line(values)} fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="3 3" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--text-muted)" />
        ))}
        <path d={line(trend)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="spread small" style={{ marginTop: 4 }}>
        <span>{first}</span>
        <span>{last}</span>
      </div>
      <p className="small" style={{ marginTop: 6 }}>
        Точки — отдельные записи, линия — тренд (среднее за 7 записей). Тренд: {formatNumber(trend[0])} → {formatNumber(trend[trend.length - 1])} кг ({change > 0 ? "+" : ""}
        {formatNumber(change)}).
      </p>
    </div>
  );
}
