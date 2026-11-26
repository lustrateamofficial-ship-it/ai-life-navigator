// Цель по весу: сколько человек весил, когда поставил цель, и сколько уже сделано.
// Сама цель лежит в профиле (weightGoalKg), стартовый вес хранится на телефоне и попадает в копию данных.

const KEY = "navigator:weight-start";

export interface WeightStart {
  kg: number;
  date: string; // YYYY-MM-DD
}

export function readStart(): WeightStart | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return normalizeStart(v);
  } catch {
    return null;
  }
}

export function normalizeStart(v: any): WeightStart | null {
  if (!v || typeof v !== "object" || typeof v.kg !== "number" || !isFinite(v.kg) || v.kg <= 0 || v.kg > 500) return null;
  const date = typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : localDay();
  return { kg: Math.round(v.kg * 10) / 10, date };
}

export function writeStart(s: WeightStart | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* хранилище недоступно: стартовый вес не сохранится */
  }
}

export interface WeightProgress {
  direction: "lose" | "gain" | "keep";
  percent: number; // 0..100
  left: number; // сколько кг осталось, 0 если цель достигнута
  moved: number; // на сколько кг сдвинулся в нужную сторону (может быть отрицательным)
  reached: boolean;
  wrongWay: boolean; // вес ушёл от цели дальше, чем был в начале
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function weightProgress(startKg: number, nowKg: number, goalKg: number): WeightProgress {
  const total = goalKg - startKg;
  if (Math.abs(total) < 0.05) {
    const hold = Math.abs(nowKg - goalKg) < 0.5;
    return { direction: "keep", percent: hold ? 100 : 0, left: hold ? 0 : r1(Math.abs(nowKg - goalKg)), moved: 0, reached: hold, wrongWay: false };
  }
  const direction = total < 0 ? "lose" : "gain";
  const reached = direction === "lose" ? nowKg <= goalKg : nowKg >= goalKg;
  const done = (nowKg - startKg) / total;
  return {
    direction,
    percent: Math.round(Math.max(0, Math.min(1, done)) * 100),
    left: reached ? 0 : r1(Math.abs(goalKg - nowKg)),
    moved: r1(direction === "lose" ? startKg - nowKg : nowKg - startKg),
    reached,
    wrongWay: done < 0,
  };
}

const kg = (n: number) => `${String(r1(n)).replace(".", ",")} кг`;

/** Одна строка для сводки: «Вес 82 кг, цель 75 кг: выполнено 40%». */
export function goalLine(nowKg: number, goalKg: number | null, startKg: number | null): string {
  if (!goalKg) return `Вес ${kg(nowKg)}`;
  if (startKg == null) return `Вес ${kg(nowKg)} (цель ${kg(goalKg)})`;
  const p = weightProgress(startKg, nowKg, goalKg);
  if (p.reached) return `Вес ${kg(nowKg)}: цель ${kg(goalKg)} достигнута`;
  return `Вес ${kg(nowKg)}, цель ${kg(goalKg)}: выполнено ${p.percent}%`;
}

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
