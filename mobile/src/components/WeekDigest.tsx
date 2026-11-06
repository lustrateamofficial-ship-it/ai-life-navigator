import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Week {
  entries: { count: number; days: number; previousCount: number };
  tasks: { done: number; donePrevious: number; created: number; open: number };
  mood: { good: number; normal: number; bad: number };
  weight: { first: number; last: number; count: number } | null;
  money: { income: number; expenses: number };
  habitMarks: number;
}

// Форма слова по числу: plural(2, "запись", "записи", "записей") → "записи".
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);

// Строки итогов недели. Только факты из данных, без оценок и без ИИ: что произошло, а не как это понимать.
export function weekLines(w: Week): string[] {
  const lines: string[] = [];
  const e = w.entries;
  if (e.count > 0) {
    let s = `Записей в дневнике: ${e.count} за ${e.days} ${plural(e.days, "день", "дня", "дней")} из 7`;
    if (e.previousCount > 0) s += ` (неделей раньше: ${e.previousCount})`;
    lines.push(s + ".");
  } else {
    lines.push("За эту неделю в дневнике нет записей.");
  }
  const t = w.tasks;
  if (t.done > 0 || t.created > 0) {
    let s = `Задач выполнено: ${t.done}, добавлено: ${t.created}`;
    if (t.donePrevious > 0) s += ` (неделей раньше выполнено: ${t.donePrevious})`;
    lines.push(s + `. Открытых сейчас: ${t.open}.`);
  } else if (t.open > 0) {
    lines.push(`Открытых задач сейчас: ${t.open}.`);
  }
  const m = w.mood;
  if (m.good + m.normal + m.bad > 0) {
    lines.push(`Настроение дня: хорошо ${m.good}, нормально ${m.normal}, плохо ${m.bad}.`);
  }
  if (w.weight) {
    if (w.weight.count > 1) {
      const d = Math.round((w.weight.last - w.weight.first) * 10) / 10;
      lines.push(`Вес: ${fmt(w.weight.first)} → ${fmt(w.weight.last)} кг (${d > 0 ? "+" : ""}${fmt(d)}).`);
    } else {
      lines.push(`Вес: ${fmt(w.weight.last)} кг (одна запись).`);
    }
  }
  if (w.money.income > 0 || w.money.expenses > 0) {
    lines.push(`Деньги: доходы ${fmt(w.money.income)}, расходы ${fmt(w.money.expenses)}.`);
  }
  if (w.habitMarks > 0) lines.push(`Отметок привычек: ${w.habitMarks}.`);
  return lines;
}

export function WeekDigest() {
  const [week, setWeek] = useState<Week | null>(null);

  useEffect(() => {
    void api
      .get<Week>("/week")
      .then(setWeek)
      .catch(() => {});
  }, []);

  if (!week) return null;
  return (
    <div className="card">
      <div className="card-title">Неделя в цифрах</div>
      <p className="small" style={{ marginBottom: 8 }}>
        Последние 7 дней. Считается по твоим данным на телефоне, без ИИ.
      </p>
      {weekLines(week).map((line) => (
        <p key={line} style={{ color: "var(--text)", marginBottom: 6 }}>
          {line}
        </p>
      ))}
    </div>
  );
}
