// Лёгкий старт: после паузы в дневнике или в самом начале предлагаем не пустое поле, а три маленьких
// затравки. Без счётчиков серий и упрёков: цель в том, чтобы вернуться за одну короткую фразу.
const STARTERS = [
  { label: "Что на уме", text: "Сейчас у меня на уме " },
  { label: "Что получилось", text: "Одно, что получилось за последние дни: " },
  { label: "Не забыть", text: "Не хочу забыть: " },
];

export function EasyStart({ daysSince, nudge, onPick }: { daysSince: number | null; nudge: "none" | "today_empty" | "first"; onPick: (s: string) => void }) {
  const show = nudge === "first" || (nudge === "today_empty" && (daysSince ?? 0) >= 3);
  if (!show) return null;
  return (
    <div className="card" role="group" aria-label="Лёгкий старт">
      <div className="card-title">{nudge === "first" ? "Начни с одной фразы" : "Рад, что ты здесь"}</div>
      <p className="small" style={{ marginBottom: 10 }}>
        {nudge === "first" ? "Достаточно одной строки. Выбери начало и допиши." : "Не нужно рассказывать всё, что было. Хватит одной строки, выбери начало."}
      </p>
      <div className="chips">
        {STARTERS.map((s) => (
          <button key={s.label} className="chip" onClick={() => onPick(s.text)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
