// Утро и вечер: сводка на день и вечернее «план на завтра».
// Всё считается на телефоне. Погода берётся из бесплатного Open-Meteo (ключ не нужен) и кладётся в кэш,
// поэтому без интернета показывается последний прогноз, а если его нет, строка с погодой просто пропускается.
import { prisma } from "./prisma";

const KEY = "navigator:daily";
const PLAN_KEY = "navigator:dayplan";
const WEATHER_KEY = "navigator:weather";

export interface DailySettings {
  morning: { enabled: boolean; time: string };
  bedtime: { enabled: boolean; time: string };
  city: string;
  lat: number | null;
  lon: number | null;
  birthDate: string; // ГГГГ-ММ-ДД или пусто
  lifeYears: number; // условная оценка, которую человек задаёт сам
  showLife: boolean;
}

export const DEFAULT_DAILY: DailySettings = {
  morning: { enabled: true, time: "07:30" },
  bedtime: { enabled: true, time: "22:30" },
  city: "",
  lat: null,
  lon: null,
  birthDate: "",
  lifeYears: 80,
  showLife: true,
};

const TIME_RE = /^\d{2}:\d{2}$/;

export function normalizeDaily(raw: any): DailySettings {
  const d = DEFAULT_DAILY;
  const o = raw && typeof raw === "object" ? raw : {};
  const slot = (v: any, def: { enabled: boolean; time: string }) => ({
    enabled: typeof v?.enabled === "boolean" ? v.enabled : def.enabled,
    time: typeof v?.time === "string" && TIME_RE.test(v.time) ? v.time : def.time,
  });
  const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : null);
  const life = Number(o.lifeYears);
  return {
    morning: slot(o.morning, d.morning),
    bedtime: slot(o.bedtime, d.bedtime),
    city: typeof o.city === "string" ? o.city.slice(0, 100) : "",
    lat: num(o.lat),
    lon: num(o.lon),
    birthDate: typeof o.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.birthDate) ? o.birthDate : "",
    lifeYears: life >= 30 && life <= 120 ? life : d.lifeYears,
    showLife: typeof o.showLife === "boolean" ? o.showLife : true,
  };
}

export function readDaily(): DailySettings {
  try {
    return normalizeDaily(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return normalizeDaily(null);
  }
}

export function writeDaily(s: DailySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeDaily(s)));
  } catch {
    /* хранилище недоступно: настройка не сохранится */
  }
}

// ── даты ──

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  return x;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const nf = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");

// ── план дня (выбранные вечером задачи) ──

type PlanMap = Record<string, { taskIds: string[] }>;

export function readPlans(): PlanMap {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_KEY) ?? "{}");
    const out: PlanMap = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray((v as any)?.taskIds)) out[k] = { taskIds: (v as any).taskIds.filter((x: any) => typeof x === "string").slice(0, 20) };
    }
    return out;
  } catch {
    return {};
  }
}

export function writePlans(p: PlanMap) {
  // хранятся только последние 14 дней, чтобы не копились
  const keep = Object.keys(p).sort().slice(-14);
  const out: PlanMap = {};
  for (const k of keep) out[k] = p[k];
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(out));
  } catch {
    /* хранилище недоступно */
  }
}

export function plannedTaskIds(date: Date): string[] {
  return readPlans()[dayKey(date)]?.taskIds ?? [];
}

export function setPlannedTaskIds(date: Date, ids: string[]) {
  const p = readPlans();
  p[dayKey(date)] = { taskIds: ids };
  writePlans(p);
}

// ── сколько осталось (условная оценка) ──

export interface LifeLeft {
  weeks: number;
  months: number;
  years: number;
}

export function lifeLeft(s: DailySettings, now = new Date()): LifeLeft | null {
  if (!s.showLife || !s.birthDate) return null;
  const [y, m, d] = s.birthDate.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (isNaN(birth.getTime()) || birth > now) return null;
  const whole = Math.floor(s.lifeYears);
  const end = new Date(y + whole, m - 1, d);
  end.setTime(end.getTime() + (s.lifeYears - whole) * 365.25 * 86400000);
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = ms / 86400000;
  return { weeks: Math.floor(days / 7), months: Math.floor(days / 30.4375), years: Math.round((days / 365.25) * 10) / 10 };
}

export function lifeLeftText(l: LifeLeft): string {
  return `По условной оценке впереди ещё ≈ ${nf(l.weeks)} ${plural(l.weeks, "неделя", "недели", "недель")} (${nf(l.months)} ${plural(l.months, "месяц", "месяца", "месяцев")}, ${String(l.years).replace(".", ",")} ${plural(Math.floor(l.years), "год", "года", "лет")})`;
}

// ── погода ──

export interface DayWeather {
  code: number;
  tmax: number;
  tmin: number;
  pop: number | null; // вероятность осадков, %
}
interface WeatherCache {
  fetchedAt: number;
  lat: number;
  lon: number;
  days: Record<string, DayWeather>;
}

function readWeatherCache(): WeatherCache | null {
  try {
    const raw = JSON.parse(localStorage.getItem(WEATHER_KEY) ?? "null");
    if (raw && typeof raw.fetchedAt === "number" && raw.days && typeof raw.days === "object") return raw;
  } catch {
    /* кэш повреждён */
  }
  return null;
}

export function describeCode(code: number): string {
  if (code === 0) return "ясно";
  if (code === 1) return "в основном ясно";
  if (code === 2) return "переменная облачность";
  if (code === 3) return "пасмурно";
  if (code === 45 || code === 48) return "туман";
  if (code >= 51 && code <= 57) return "морось";
  if (code >= 61 && code <= 67) return "дождь";
  if (code >= 71 && code <= 77) return "снег";
  if (code >= 80 && code <= 82) return "ливень";
  if (code === 85 || code === 86) return "снегопад";
  if (code >= 95) return "гроза";
  return "";
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export function weatherText(w: DayWeather): string {
  const parts = [describeCode(w.code), `${sign(w.tmin)}…${sign(w.tmax)}°`];
  if (w.pop !== null && w.pop >= 30) parts.push(`осадки ${w.pop}%`);
  return parts.filter(Boolean).join(", ");
}

export function weatherFor(date: Date): DayWeather | null {
  return readWeatherCache()?.days[dayKey(date)] ?? null;
}

export async function findCity(name: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const q = name.trim();
  if (!q) return null;
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ru&format=json`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
  return { name: [r.name, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude };
}

const STALE_MS = 3 * 3600_000;

// Обновляет кэш прогноза (4 дня). Без города, без интернета или при сбое молча оставляет старый кэш.
export async function refreshWeather(force = false): Promise<boolean> {
  const s = readDaily();
  if (s.lat === null || s.lon === null) return false;
  const cache = readWeatherCache();
  const fresh = cache && cache.lat === s.lat && cache.lon === s.lon && Date.now() - cache.fetchedAt < STALE_MS && cache.days[dayKey(addDays(new Date(), 1))];
  if (fresh && !force) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=8`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return false;
    const d = (await res.json())?.daily;
    if (!d || !Array.isArray(d.time)) return false;
    const days: Record<string, DayWeather> = {};
    d.time.forEach((t: string, i: number) => {
      const tmax = d.temperature_2m_max?.[i];
      const tmin = d.temperature_2m_min?.[i];
      if (typeof tmax !== "number" || typeof tmin !== "number") return;
      const pop = d.precipitation_probability_max?.[i];
      days[t] = { code: Number(d.weather_code?.[i] ?? -1), tmax: Math.round(tmax), tmin: Math.round(tmin), pop: typeof pop === "number" ? Math.round(pop) : null };
    });
    localStorage.setItem(WEATHER_KEY, JSON.stringify({ fetchedAt: Date.now(), lat: s.lat, lon: s.lon, days } satisfies WeatherCache));
    return true;
  } catch {
    return false;
  }
}

// ── сводка на день ──

export interface PlanTask {
  id: string;
  title: string;
}
export interface ScheduleLine {
  time: string; // "ЧЧ:ММ"
  text: string;
  kind: "event" | "task" | "reminder";
}
export interface DayBrief {
  date: Date;
  weight: { kg: number; goalKg: number | null } | null;
  life: LifeLeft | null;
  weather: DayWeather | null;
  tasks: PlanTask[]; // не больше трёх
  plannedCount: number; // сколько задач выбрано в плане на этот день
  schedule: ScheduleLine[];
}

const PRIORITY: Record<string, number> = { high: 0, medium: 1, low: 2 };

// До трёх задач на день: сначала выбранные вечером, потом просроченные и на этот день, потом самые важные.
export async function pickTasks(date: Date, limit = 3): Promise<{ tasks: PlanTask[]; planned: number }> {
  const open = (await prisma.task.findMany({})).filter((t: any) => t.status !== "done" && t.status !== "cancelled");
  const byId = new Map<string, any>(open.map((t: any) => [t.id, t]));
  const out: PlanTask[] = [];
  const seen = new Set<string>();
  const add = (t: any) => {
    if (t && !seen.has(t.id) && out.length < limit) {
      seen.add(t.id);
      out.push({ id: t.id, title: t.title });
    }
  };
  const planned = plannedTaskIds(date).filter((id) => byId.has(id));
  planned.forEach((id) => add(byId.get(id)));
  const end = endOfDay(date).getTime();
  const start = startOfDay(date).getTime();
  const rest = open.filter((t: any) => !seen.has(t.id));
  const due = (t: any) => (t.deadline ? new Date(t.deadline).getTime() : Infinity);
  rest
    .filter((t: any) => due(t) < end || (t.scheduledTime && new Date(t.scheduledTime).getTime() >= start && new Date(t.scheduledTime).getTime() < end))
    .sort((a: any, b: any) => due(a) - due(b) || (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1))
    .forEach(add);
  rest
    .sort((a: any, b: any) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || due(a) - due(b) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach(add);
  return { tasks: out, planned: planned.length };
}

export async function scheduleFor(date: Date): Promise<ScheduleLine[]> {
  const from = startOfDay(date);
  const to = endOfDay(date);
  const lines: ScheduleLine[] = [];
  const events = await prisma.calendarEvent.findMany({ where: { startTime: { gte: from, lt: to } }, orderBy: { startTime: "asc" } });
  for (const e of events) {
    if (e.category === "sleep") continue;
    lines.push({ time: hhmm(new Date(e.startTime)), text: e.title, kind: "event" });
  }
  const tasks = await prisma.task.findMany({ where: { scheduledTime: { gte: from, lt: to } } });
  for (const t of tasks) if (t.status !== "done" && t.status !== "cancelled") lines.push({ time: hhmm(new Date(t.scheduledTime)), text: t.title, kind: "task" });
  const rems = await prisma.reminder.findMany({ where: { active: true, triggerAt: { gte: from, lt: to } } });
  for (const r of rems) lines.push({ time: hhmm(new Date(r.triggerAt)), text: r.title, kind: "reminder" });
  return lines.sort((a, b) => a.time.localeCompare(b.time));
}

export async function buildBrief(date: Date, now = new Date()): Promise<DayBrief> {
  const s = readDaily();
  const logs = await prisma.weightLog.findMany({ orderBy: { date: "desc" }, take: 1 });
  const profile = await prisma.profile.findFirst({});
  const { tasks, planned } = await pickTasks(date);
  return {
    date,
    weight: logs[0] ? { kg: logs[0].weightKg, goalKg: profile?.weightGoalKg ?? null } : null,
    life: lifeLeft(s, now),
    weather: weatherFor(date),
    tasks,
    plannedCount: planned,
    schedule: await scheduleFor(date),
  };
}

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} кг`;

export function weightText(w: NonNullable<DayBrief["weight"]>): string {
  return w.goalKg ? `Вес ${kg(w.kg)} (цель ${kg(w.goalKg)})` : `Вес ${kg(w.kg)}`;
}

export interface Notice {
  title: string;
  body: string; // коротко, одна строка в свёрнутом виде
  largeBody: string; // полный текст
}

export function morningNotice(b: DayBrief): Notice {
  const lines: string[] = [];
  if (b.weather) lines.push(`Погода: ${weatherText(b.weather)}`);
  if (b.weight) lines.push(weightText(b.weight));
  if (b.life) lines.push(lifeLeftText(b.life));
  if (b.tasks.length) lines.push("Задачи:\n" + b.tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n"));
  else lines.push("Задач на сегодня нет. Можно добавить в «Планах».");
  if (b.schedule.length) lines.push("День:\n" + b.schedule.map((l) => `${l.time} ${l.text}`).join("\n"));
  const short = [b.weather ? weatherText(b.weather) : null, b.tasks.length ? `${b.tasks.length} ${plural(b.tasks.length, "задача", "задачи", "задач")} на день` : null, b.schedule.length ? `в расписании: ${b.schedule.length}` : null]
    .filter(Boolean)
    .join(" · ");
  return { title: "Доброе утро", body: short || "Открой сводку на день", largeBody: lines.join("\n") };
}

export function bedtimeNotice(b: DayBrief): Notice {
  const lines: string[] = [];
  if (b.weather) lines.push(`Завтра: ${weatherText(b.weather)}`);
  const planned = b.plannedCount + b.schedule.length;
  if (planned === 0) lines.push("План на завтра пока пуст. Выбери задачи и расписание: это займёт минуту, а утром всё уже будет готово.");
  else {
    lines.push(`В плане на завтра: ${b.plannedCount} ${plural(b.plannedCount, "задача", "задачи", "задач")} и ${b.schedule.length} в расписании. Загляни, всё ли верно.`);
  }
  return { title: "Перед сном: план на завтра", body: planned === 0 ? (b.weather ? `Завтра ${weatherText(b.weather)}. Заполни план дня` : "Заполни план дня и задачи на завтра") : "Проверь план на завтра", largeBody: lines.join("\n") };
}
