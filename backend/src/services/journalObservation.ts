// Наблюдение по дневнику («что видно по моим записям»). Модель легко придумывает закономерности,
// поэтому её вывод принимается только если:
//  1) к наблюдению приложена цитата, и эта цитата ДОСЛОВНО есть в одной из записей;
//  2) в тексте нет клинических терминов и диагнозов;
//  3) длина разумная.
// Иначе наблюдение отбрасывается, лучше показать «ничего определённого не вижу», чем выдумку.

export interface VerifiedObservation {
  observation: string;
  quote: string;
}

const MIN_QUOTE_LEN = 8;
const MAX_OBSERVATION_LEN = 320;
const MAX_QUOTE_LEN = 200;

const CLINICAL_TERMS = [
  "депресси",
  "тревожное расстройство",
  "тревожный расстройство",
  "расстройств",
  "биполяр",
  "сдвг",
  "невроз",
  "психоз",
  "паническ",
  "диагноз",
  "нарциссическ",
  "пограничн",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[«»"“”„]/g, "").replace(/\s+/g, " ").trim();
}

export function hasClinicalTerms(text: string): boolean {
  const lowered = norm(text);
  return CLINICAL_TERMS.some((t) => lowered.includes(t));
}

// Цитата принимается, только если дословно (с точностью до регистра, кавычек и пробелов) есть в записях.
export function verifyQuote(quote: unknown, entries: string[]): string | null {
  if (typeof quote !== "string") return null;
  const trimmed = quote.trim();
  if (trimmed.length < MIN_QUOTE_LEN || trimmed.length > MAX_QUOTE_LEN) return null;
  const q = norm(trimmed).replace(/[….]+$/g, "");
  if (q.length < MIN_QUOTE_LEN) return null;
  return entries.some((e) => norm(e).includes(q)) ? trimmed : null;
}

export function verifyObservation(raw: unknown, entries: string[]): VerifiedObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.observation !== "string" || typeof r.quote !== "string") return null;

  const observation = r.observation.trim();
  const quote = r.quote.trim();
  if (!observation || observation.length > MAX_OBSERVATION_LEN) return null;
  if (quote.length < MIN_QUOTE_LEN || quote.length > MAX_QUOTE_LEN) return null;

  const lowered = norm(observation);
  if (CLINICAL_TERMS.some((t) => lowered.includes(t))) return null;

  const q = norm(quote).replace(/[….]+$/g, "");
  if (q.length < MIN_QUOTE_LEN) return null;
  if (!entries.some((e) => norm(e).includes(q))) return null;

  return { observation, quote };
}

// ── Итоги недели ──
// Принимаются только те пункты, у которых цитата найдена в записях. Общий вывод («summary») —
// это формулировка модели, он проверяется только на длину и клинические термины, а не на факты:
// именно поэтому без хотя бы одного подтверждённого пункта итоги не показываются совсем.
export interface WeekSummary {
  summary: string;
  highlights: Array<{ text: string; quote: string }>;
}

const MAX_SUMMARY_LEN = 420;
const MAX_ITEM_LEN = 240;

export function verifyWeekSummary(raw: unknown, entries: string[]): WeekSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.summary !== "string") return null;
  const summary = r.summary.trim();
  if (!summary || summary.length > MAX_SUMMARY_LEN || hasClinicalTerms(summary)) return null;

  const highlights: WeekSummary["highlights"] = [];
  for (const item of Array.isArray(r.highlights) ? r.highlights.slice(0, 6) : []) {
    const h = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const text = typeof h?.text === "string" ? h.text.trim() : "";
    const quote = verifyQuote(h?.quote, entries);
    if (!text || text.length > MAX_ITEM_LEN || hasClinicalTerms(text) || !quote) continue;
    highlights.push({ text, quote });
    if (highlights.length === 4) break;
  }
  return highlights.length > 0 ? { summary, highlights } : null;
}

// ── Цели из дневника ──
export interface GoalSuggestion {
  title: string;
  why: string;
  quote: string;
}

const MAX_TITLE_LEN = 80;
const MAX_WHY_LEN = 220;

export function verifyGoalSuggestions(raw: unknown, entries: string[], existingTitles: string[]): GoalSuggestion[] {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const items = Array.isArray(root?.suggestions) ? root!.suggestions.slice(0, 6) : [];
  const existing = new Set(existingTitles.map((t) => norm(t)));
  const out: GoalSuggestion[] = [];
  for (const item of items) {
    const g = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const title = typeof g?.title === "string" ? g.title.trim() : "";
    const why = typeof g?.why === "string" ? g.why.trim() : "";
    const quote = verifyQuote(g?.quote, entries);
    if (!title || title.length > MAX_TITLE_LEN || !why || why.length > MAX_WHY_LEN || !quote) continue;
    if (hasClinicalTerms(title) || hasClinicalTerms(why)) continue;
    if (existing.has(norm(title)) || out.some((o) => norm(o.title) === norm(title))) continue;
    out.push({ title, why, quote });
    if (out.length === 3) break;
  }
  return out;
}
