import { useEffect, useState } from "react";
import { dayProgress, expensesByCategory, financeSeries, type CategoryRow, type DayProgress, type MonthRow } from "../../phone/charts";
import { formatNumber } from "../utils/format";

// Кольцо дня: сколько задач из сегодняшних сделано.
export function DayRing() {
  const [p, setP] = useState<DayProgress | null>(null);
  useEffect(() => {
    let off = false;
    const load = () => void dayProgress().then((v) => !off && setP(v)).catch(() => {});
    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      off = true;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  if (!p) return null;
  const R = 34;
  const C = 2 * Math.PI * R;
  const share = p.total ? Math.min(1, p.done / p.total) : 0;
  const caption = p.total === 0 ? "На сегодня задач нет" : p.done === p.total ? "Всё сделано" : `Осталось ${p.total - p.done}`;
  return (
    <div className="card ring-card">
      <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Сделано ${p.done} из ${p.total}`}>
        <circle cx="44" cy="44" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <circle cx="44" cy="44" r={R} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${C * share} ${C}`} transform="rotate(-90 44 44)" />
        <text x="44" y="49" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)">
          {p.done}/{p.total}
        </text>
      </svg>
      <div>
        <div className="card-title" style={{ marginBottom: 4 }}>Кольцо дня</div>
        <b className="ring-main">{caption}</b>
        <p className="small">Сделано {p.done} из {p.total}</p>
      </div>
    </div>
  );
}

const PALETTE = ["#0E7C7B", "#E3A24B", "#5B8DEF", "#C8553D", "#8E6BBF", "#6B7F7D"];

// Финансы: доходы и расходы по месяцам и расходы текущего месяца по категориям.
export function FinanceCharts({ reloadKey }: { reloadKey: number }) {
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  useEffect(() => {
    void financeSeries().then(setRows).catch(() => {});
    void expensesByCategory().then(setCats).catch(() => {});
  }, [reloadKey]);
  if (!rows) return null;
  const has = rows.some((r) => r.income > 0 || r.expense > 0);
  if (!has) return <p className="small mt">Когда появятся доходы и расходы, здесь будут графики по месяцам и по категориям.</p>;

  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]));
  const W = 320;
  const H = 120;
  const slot = W / rows.length;
  const bw = Math.min(16, slot / 2 - 3);
  const totalCat = cats.reduce((s, c) => s + c.amount, 0);
  const R = 38;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div className="mt">
      <div className="chart-legend">
        <span><i style={{ background: "var(--accent)" }} />Доходы</span>
        <span><i style={{ background: "#E3A24B" }} />Расходы</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={"Доходы и расходы по месяцам: " + rows.map((r) => `${r.label} ${formatNumber(r.income)} и ${formatNumber(r.expense)}`).join("; ")}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" />
        {rows.map((r, i) => {
          const x = i * slot + slot / 2;
          const hi = (r.income / max) * (H - 8);
          const he = (r.expense / max) * (H - 8);
          return (
            <g key={i}>
              <rect x={x - bw - 1} y={H - hi} width={bw} height={hi} rx="3" fill="var(--accent)" />
              <rect x={x + 1} y={H - he} width={bw} height={he} rx="3" fill="#E3A24B" />
              <text x={x} y={H + 15} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{r.label}</text>
            </g>
          );
        })}
      </svg>

      {totalCat > 0 && (
        <div className="donut-row">
          <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Расходы месяца по категориям">
            {cats.map((c, i) => {
              const len = (c.amount / totalCat) * C;
              const el = <circle key={c.category} cx="48" cy="48" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 48 48)" />;
              acc += len;
              return el;
            })}
          </svg>
          <ul className="cat-list">
            {cats.map((c, i) => (
              <li key={c.category}>
                <i style={{ background: PALETTE[i % PALETTE.length] }} />
                <span>{c.category}</span>
                <b>{formatNumber(c.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
