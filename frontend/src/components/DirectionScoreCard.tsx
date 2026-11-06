interface Props {
  overall: number;
  goalsScore: number;
  healthScore: number;
  financeScore: number;
  habitsScore: number;
  timeScore: number;
  driftMessage?: string | null;
}

function colorFor(score: number) {
  if (score >= 70) return "green";
  if (score >= 45) return "orange";
  return "red";
}

export function DirectionScoreCard(props: Props) {
  const color = colorFor(props.overall);
  const parts = [
    { label: "Цели", value: props.goalsScore },
    { label: "Здоровье", value: props.healthScore },
    { label: "Финансы", value: props.financeScore },
    { label: "Привычки", value: props.habitsScore },
    { label: "Время", value: props.timeScore },
  ];

  return (
    <div className="card">
      <div className="card-title">Направление</div>
      <div className="big-number" style={{ color: `var(--${color})` }}>
        {props.overall} <span style={{ fontSize: 18, color: "var(--text-muted)", fontWeight: 500 }}>из 100</span>
      </div>
      <div className="stack mt">
        {parts.map((part) => (
          <div key={part.label}>
            <div className="spread small">
              <span>{part.label}</span>
              <span className="text">{part.value}</span>
            </div>
            <div className="progress" role="img" aria-label={`${part.label}: ${part.value} из 100`}>
              <span style={{ width: `${Math.max(0, Math.min(100, part.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
      {props.driftMessage && <p className="mt" style={{ color: "var(--orange)" }}>{props.driftMessage}</p>}
    </div>
  );
}
