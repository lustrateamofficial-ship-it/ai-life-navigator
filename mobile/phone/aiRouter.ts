// Маршрутизатор ИИ: несколько сервисов в очереди. Если один не ответил или кончился лимит,
// запрос уходит следующему, а сбойный на время откладывается, чтобы не тормозить каждый ответ.
import { env, readSettings, writeSettings, type AiService } from "../shim/env";
import { generateGeminiText } from "../../backend/src/services/ai/providers/gemini";
import { generateGroqText } from "../../backend/src/services/ai/providers/groq";

export type AiModelTier = "cheap" | "strong";
export interface CallParams {
  system: string;
  prompt: string;
  tier?: AiModelTier;
  maxTokens?: number;
}

interface Candidate {
  id: string;
  name: string;
  call: (p: CallParams) => Promise<string>;
}

// Готовые шаблоны: адрес известен, название модели можно поправить (они меняются).
export const PRESETS: Array<{ id: string; name: string; baseUrl: string; model: string; free: boolean; link: string; note: string; needsAccount?: boolean }> = [
  // Gemini и Groq встроены в приложение (ключ вводится в Настройках выше), здесь остальные бесплатные.
  // Убраны (проверено по открытым источникам в ноябре 2026): Cerebras (бесплатный тариф заменили пробным с картой), Hugging Face (бесплатных кредитов нет), GitHub Models (закрыт 30 июля 2026).
  { id: "openrouter", name: "OpenRouter (бесплатные модели)", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free", free: true, link: "https://openrouter.ai/keys", note: "Сам выбирает свободную бесплатную модель. Около 50 запросов в день без пополнения, карта не нужна." },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", free: true, link: "https://console.mistral.ai/api-keys", note: "Бесплатный тариф Experiment, серверы в ЕС. По условиям тарифа запросы могут использоваться для обучения." },
  { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", model: "meta/llama-3.3-70b-instruct", free: true, link: "https://build.nvidia.com/settings/api-keys", note: "Бесплатный доступ для разработчиков, около тысячи запросов в день." },
  { id: "cloudflare", name: "Cloudflare Workers AI", baseUrl: "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", free: true, needsAccount: true, link: "https://dash.cloudflare.com/profile/api-tokens", note: "Бесплатно около 10 тысяч «нейронов» в день, карта не нужна. Нужны токен API и Account ID (виден в панели Cloudflare справа на главной)." },
  { id: "cohere", name: "Cohere", baseUrl: "https://api.cohere.ai/compatibility/v1", model: "command-a-03-2025", free: true, link: "https://dashboard.cohere.com/api-keys", note: "Пробный ключ бесплатный, без карты: 1000 запросов в месяц, 20 в минуту. Для личного пользования." },
  { id: "custom", name: "Другой сервис (свой адрес)", baseUrl: "", model: "", free: false, link: "", note: "Любой сервис с адресом вида …/v1/chat/completions." },
];

// ---------- состояние сервисов ----------
const HEALTH = "navigator:ai-health";
interface Health {
  until?: number;
  err?: string;
  okAt?: number;
}

function readHealth(): Record<string, Health> {
  try {
    return JSON.parse(localStorage.getItem(HEALTH) ?? "{}");
  } catch {
    return {};
  }
}
function writeHealth(h: Record<string, Health>) {
  try {
    localStorage.setItem(HEALTH, JSON.stringify(h));
  } catch {
    /* состояние не запомнится: сервисы просто пробуются заново */
  }
}
function mark(id: string, patch: Health | null) {
  const h = readHealth();
  if (patch) h[id] = { ...h[id], ...patch };
  else delete h[id];
  writeHealth(h);
}

function statusOf(err: unknown): number {
  const m = /\b([1-5]\d\d)\b/.exec(String((err as Error)?.message ?? ""));
  return m ? Number(m[1]) : 0;
}

// Сколько отдыхать сервису после сбоя и что показать человеку.
function pauseFor(err: unknown): { ms: number; why: string } {
  const st = statusOf(err);
  if (st === 429) return { ms: 15 * 60_000, why: "лимит закончился, подождём" };
  if (st === 402) return { ms: 60 * 60_000, why: "нет денег на счёте" };
  if (st === 401 || st === 403) return { ms: 6 * 3600_000, why: "ключ не принят" };
  if (st === 404) return { ms: 30 * 60_000, why: "подходящая модель не нашлась" };
  if (st === 400) return { ms: 2 * 60_000, why: "запрос не принят" };
  return { ms: 3 * 60_000, why: "нет ответа" };
}

// ---------- вызовы ----------
async function fetchTimeout(url: string, init: RequestInit, ms = 30_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function openAiCompatible(baseUrl: string, key: string, model: string, p: CallParams): Promise<string> {
  const res = await fetchTimeout(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: p.system },
        { role: "user", content: p.prompt },
      ],
      max_tokens: p.maxTokens ?? 1024,
    }),
  });
  if (!res.ok) throw new Error(`AI error: ${res.status}`);
  const text = (await res.json()).choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("AI error: 502");
  return text;
}

async function claude(p: CallParams, modelOverride?: string): Promise<string> {
  const res = await fetchTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: modelOverride || ((p.tier ?? "cheap") === "cheap" ? env.aiModelCheap : env.aiModelStrong),
      max_tokens: p.maxTokens ?? 1024,
      system: p.system,
      messages: [{ role: "user", content: p.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const block = ((await res.json()).content ?? []).find((b: any) => b.type === "text");
  return block?.text ?? "";
}

function withTimeout<T>(p: Promise<T>, ms = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("AI error: 504")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}


// ---------- подбор модели ----------
// Названия бесплатных моделей меняются: старые закрывают для новых ключей (ответ 404 или «больше не доступна»).
// Поэтому список моделей спрашиваем у самого сервиса и берём подходящую; рабочую запоминаем.
const MODEL_CACHE = "navigator:ai-models";
function readModelCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MODEL_CACHE) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function saveModel(id: string, model: string) {
  try {
    localStorage.setItem(MODEL_CACHE, JSON.stringify({ ...readModelCache(), [id]: model }));
  } catch {
    /* кэш недоступен: подбор повторится в следующий раз */
  }
}
function dropModel(id: string) {
  try {
    const c = readModelCache();
    delete c[id];
    localStorage.setItem(MODEL_CACHE, JSON.stringify(c));
  } catch {
    /* ничего страшного */
  }
}
function isModelProblem(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "");
  const st = statusOf(err);
  return st === 404 || /no longer available|not supported|not found|decommissioned|does not exist/i.test(msg) || (st === 400 && /model/i.test(msg));
}

export function rankGeminiModels(list: Array<{ name?: string; supportedGenerationMethods?: string[] }>): string[] {
  const bad = /(preview|exp|image|tts|live|embedding|audio|robotics|computer|thinking|customtools|deep-research|vision|aqa|gemma|nano)/i;
  const rows = list
    .filter((m) => typeof m.name === "string" && /^models\/gemini-/.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent") && !bad.test(m.name))
    .map((m) => {
      const name = (m.name as string).replace(/^models\//, "");
      const ver = parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? "0");
      return { name, ver, lite: /flash-lite/.test(name), flash: /flash/.test(name) };
    })
    .filter((m) => m.flash);
  // сначала лёгкие «lite» (у них щедрее бесплатный лимит), внутри группы новее выше
  rows.sort((a, b) => Number(b.lite) - Number(a.lite) || b.ver - a.ver || a.name.localeCompare(b.name));
  return rows.map((r) => r.name);
}

export function rankGroqModels(ids: string[]): string[] {
  const want = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
  const have = want.filter((w) => ids.includes(w));
  const extra = ids.filter((i) => /llama|gpt-oss|qwen|kimi/i.test(i) && !/whisper|guard|tts|prompt|compound|vision|distil/i.test(i) && !have.includes(i));
  return [...have, ...extra];
}

async function geminiWithModelPick(p: CallParams): Promise<string> {
  const cached = readModelCache().gemini;
  let queue: string[] = cached ? [cached] : [];
  let lastErr: unknown = new Error("Gemini: нет подходящей модели");
  let listed = false;
  for (let i = 0; i < 4; i++) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      try {
        const res = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(env.geminiApiKey)}`, {}, 15_000);
        if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text().catch(() => "")}`);
        queue = rankGeminiModels((await res.json()).models ?? []);
      } catch (e) {
        if (!isModelProblem(e) && statusOf(e) !== 0) throw e; // ключ не принят, лимит: дальше нет смысла
        if (isNetworkError(e)) throw e;
        queue = [];
      }
      if (!queue.length) queue = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite"];
      queue = queue.filter((m) => m !== cached);
    }
    const model = queue.shift() as string;
    (env as any).geminiModel = model;
    try {
      const text = await generateGeminiText({ system: p.system, prompt: p.prompt, maxTokens: p.maxTokens });
      saveModel("gemini", model);
      return text;
    } catch (e) {
      lastErr = e;
      if (!isModelProblem(e)) throw e;
      dropModel("gemini");
    }
  }
  throw lastErr;
}

async function groqWithModelPick(p: CallParams): Promise<string> {
  const cached = readModelCache().groq;
  let queue: string[] = cached ? [cached] : ["openai/gpt-oss-120b"];
  let lastErr: unknown = new Error("Groq: нет подходящей модели");
  let listed = false;
  for (let i = 0; i < 4; i++) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      try {
        const res = await fetchTimeout("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${env.groqApiKey}` } }, 15_000);
        if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
        queue = rankGroqModels(((await res.json()).data ?? []).map((m: any) => String(m.id)));
      } catch (e) {
        if (!isModelProblem(e)) throw e;
        queue = [];
      }
    }
    const model = queue.shift();
    if (!model) break;
    (env as any).groqModel = model;
    try {
      const text = await generateGroqText({ system: p.system, prompt: p.prompt, maxTokens: p.maxTokens });
      saveModel("groq", model);
      return text;
    } catch (e) {
      lastErr = e;
      if (!isModelProblem(e)) throw e;
      dropModel("groq");
    }
  }
  throw lastErr;
}

// Общий подбор модели для любого сервиса с OpenAI-совместимым адресом (Mistral, NVIDIA, Cohere, Cloudflare,
// OpenRouter, ChatGPT, DeepSeek и свой адрес). Названия в коде не зашиты: если модель не принята,
// список берётся у самого сервиса (GET …/models), выбирается подходящая текстовая, рабочая запоминается.
export function rankChatModels(ids: string[], configured = ""): string[] {
  const bad = /(embed|rerank|whisper|tts|audio|speech|transcri|image|vision|\bvl\b|-vl|guard|moderat|safety|ocr|diffus|flux|dall|video|realtime|search|codex|computer|translate|classif|reward|retriev|parse|clip|sdxl|stable|lora|detect|ner\b|sentiment|summariz)/i;
  const rows = ids
    .filter((id) => typeof id === "string" && id && !bad.test(id))
    .map((id) => {
      const size = parseFloat(/(\d+(?:\.\d+)?)\s?b\b/i.exec(id)?.[1] ?? "0");
      const ver = parseFloat(/(\d+(?:\.\d+)?)/.exec(id.replace(/\d{4}-\d{2}-\d{2}|\d{6,8}/g, ""))?.[1] ?? "0");
      let score = 0;
      if (/instruct|chat|versatile|command|assistant/i.test(id)) score += 2;
      if (/latest|small|mini|flash|lite|medium|large/i.test(id)) score += 1;
      if (/preview|exp|beta|alpha|deprecated|legacy|old|test/i.test(id)) score -= 3;
      if (size >= 20 && size <= 130) score += 3;
      else if (size > 130) score += 1;
      else if (size > 0 && size < 8) score -= 1;
      return { id, score, ver };
    });
  rows.sort((a, b) => b.score - a.score || b.ver - a.ver || a.id.localeCompare(b.id));
  const out = rows.map((r) => r.id);
  return configured && out.includes(configured) ? [configured, ...out.filter((x) => x !== configured)] : out;
}

async function listModelIds(baseUrl: string, key: string): Promise<string[]> {
  const res = await fetchTimeout(baseUrl.replace(/\/+$/, "") + "/models", { headers: { Authorization: `Bearer ${key}` } }, 15_000);
  if (!res.ok) throw new Error(`AI error: ${res.status}`);
  const j = await res.json();
  const rows: any[] = Array.isArray(j) ? j : j.data ?? j.models ?? j.result ?? [];
  return rows.map((m) => String(typeof m === "string" ? m : m.id ?? m.name ?? "")).filter(Boolean);
}

async function openAiWithModelPick(id: string, baseUrl: string, key: string, configured: string, p: CallParams): Promise<string> {
  const cached = readModelCache()[id];
  let queue: string[] = [cached || configured].filter(Boolean);
  let listed = false;
  let lastErr: unknown = new Error("AI error: 404");
  for (let i = 0; i < 4; i++) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      try {
        queue = rankChatModels(await listModelIds(baseUrl, key), configured).filter((m) => m !== cached);
      } catch (e) {
        if (isNetworkError(e)) throw e;
        if (!isModelProblem(e)) throw e; // ключ не принят или лимит: перебирать модели бессмысленно
        throw lastErr; // сервис не отдаёт список: остаётся прежняя ошибка
      }
    }
    const model = queue.shift();
    if (!model) break;
    try {
      const text = await openAiCompatible(baseUrl, key, model, p);
      saveModel(id, model);
      return text;
    } catch (e) {
      lastErr = e;
      if (!isModelProblem(e)) throw e;
      dropModel(id);
    }
  }
  throw lastErr;
}

// Claude: если названия моделей из настроек устарели, берём самую новую подходящую из списка Anthropic.
async function claudeWithModelPick(p: CallParams): Promise<string> {
  const tier = p.tier ?? "cheap";
  const key = `anthropic:${tier}`;
  const cached = readModelCache()[key];
  try {
    const text = await claude(p, cached);
    return text;
  } catch (e) {
    if (!isModelProblem(e)) throw e;
    dropModel(key);
  }
  const res = await fetchTimeout("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": env.anthropicApiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
  }, 15_000);
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const ids: string[] = ((await res.json()).data ?? []).map((m: any) => String(m.id));
  const want = tier === "cheap" ? /haiku/i : /sonnet|opus/i;
  const pick = ids.filter((i) => want.test(i)); // список приходит от новых к старым
  let lastErr: unknown = new Error("Anthropic API error: 404");
  for (const model of pick.slice(0, 3)) {
    try {
      const text = await claude(p, model);
      saveModel(key, model);
      return text;
    } catch (e) {
      lastErr = e;
      if (!isModelProblem(e)) throw e;
    }
  }
  throw lastErr;
}

// ---------- список и порядок ----------
// Порядок по умолчанию: сначала бесплатные, платные в самом конце (деньги тратятся, только если бесплатные не ответили).
const FREE_BUILTIN = ["gemini", "groq"];
const PAID_BUILTIN = ["anthropic", "openai", "deepseek"];

function allCandidates(): Candidate[] {
  const out: Candidate[] = [];
  const add = (on: boolean, id: string, name: string, call: Candidate["call"]) => on && out.push({ id, name, call });
  add(!!env.anthropicApiKey, "anthropic", "Claude", (p) => claudeWithModelPick(p));
  add(!!env.openaiApiKey, "openai", "ChatGPT", (p) => openAiWithModelPick("openai", "https://api.openai.com/v1", env.openaiApiKey, env.openaiModel, p));
  add(!!env.geminiApiKey, "gemini", "Gemini", (p) => withTimeout(geminiWithModelPick(p)));
  add(!!env.deepseekApiKey, "deepseek", "DeepSeek", (p) => openAiWithModelPick("deepseek", "https://api.deepseek.com", env.deepseekApiKey, env.deepseekModel, p));
  add(!!env.groqApiKey, "groq", "Groq", (p) => withTimeout(groqWithModelPick(p)));
  for (const s of services()) {
    if (s.enabled && s.key && s.baseUrl) add(true, s.id, s.name, (p) => withTimeout(openAiWithModelPick(s.id, s.baseUrl, s.key, s.model, p), 60_000));
  }
  return out;
}

export function services(): AiService[] {
  const v = readSettings().services;
  return Array.isArray(v) ? v : [];
}

export function readOrder(): string[] {
  const s = readSettings();
  const saved = Array.isArray(s.aiOrder) ? s.aiOrder : [];
  // Старая настройка «главный ИИ»: ставим его первым.
  const legacy = s.primaryAi ? [s.primaryAi] : [];
  const svc = services();
  const rest = [...FREE_BUILTIN, ...svc.filter((x) => !x.paid).map((x) => x.id), ...PAID_BUILTIN, ...svc.filter((x) => x.paid).map((x) => x.id)];
  return [...new Set([...saved, ...legacy, ...rest])];
}

function ordered(): Candidate[] {
  const all = allCandidates();
  return readOrder().flatMap((id) => all.filter((c) => c.id === id));
}

export function moveProvider(id: string, dir: -1 | 1) {
  const visible = ordered().map((c) => c.id);
  const i = visible.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= visible.length) return;
  [visible[i], visible[j]] = [visible[j], visible[i]];
  const hidden = readOrder().filter((x) => !visible.includes(x));
  writeSettings({ aiOrder: [...visible, ...hidden], primaryAi: "" });
}

export interface ProviderInfo {
  id: string;
  name: string;
  state: "ok" | "paused" | "idle";
  note: string;
}

export function providerInfo(): ProviderInfo[] {
  const h = readHealth();
  const now = Date.now();
  return ordered().map((c) => {
    const x = h[c.id] ?? {};
    if (x.until && x.until > now) {
      const min = Math.max(1, Math.ceil((x.until - now) / 60_000));
      return { id: c.id, name: c.name, state: "paused", note: `${x.err ?? "пауза"}, повтор через ${min >= 90 ? Math.round(min / 60) + " ч" : min + " мин"}` };
    }
    return { id: c.id, name: c.name, state: x.okAt ? "ok" : "idle", note: x.okAt ? "отвечает" : "ещё не проверялся" };
  });
}

export function resetPauses() {
  const h = readHealth();
  for (const k of Object.keys(h)) delete h[k].until;
  writeHealth(h);
}

// ---------- запрос ----------
// Сетевая ошибка (нет интернета, обрыв, DNS): виноват не сервис, поэтому его на паузу не ставим
// и другие сервисы не перебираем: у них та же сеть.
function isNetworkError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return err instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network|ERR_INTERNET|ERR_NETWORK/i.test(msg) && !/\b(40\d|429|5\d\d)\b/.test(msg);
}

const TOTAL_BUDGET_MS = 45_000; // на весь перебор: плохая связь не должна держать приложение минутами

// Сколько раз запрос не получил ответа ни от одного сервиса (лимит, сбой, нет сети). По разнице значений до и после
// вызова можно понять, что ИИ был недоступен, даже если вызывающий код проглотил ошибку.
let failures = 0;
export const aiFailureCount = () => failures;

export async function generateText(params: CallParams): Promise<string> {
  try {
    return await generateTextInner(params);
  } catch (e) {
    failures++;
    throw e;
  }
}

async function generateTextInner(params: CallParams): Promise<string> {
  const queue = ordered();
  if (queue.length === 0) throw Object.assign(new Error("Ни один ИИ-провайдер не настроен"), { code: "AI_NOT_CONFIGURED" });
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw Object.assign(new Error("Нет интернета"), { code: "AI_OFFLINE" });
  const h = readHealth();
  const now = Date.now();
  const ready = queue.filter((c) => !(h[c.id]?.until && h[c.id]!.until! > now));
  // Если все на паузе, всё равно пробуем: лимит мог уже сняться.
  const tryList = ready.length > 0 ? ready : queue;
  let last: unknown;
  for (const c of tryList) {
    if (Date.now() - now > TOTAL_BUDGET_MS) break;
    try {
      const text = await c.call(params);
      mark(c.id, { until: undefined, err: undefined, okAt: Date.now() });
      return text;
    } catch (err) {
      last = err;
      if (isNetworkError(err)) throw Object.assign(new Error("Нет связи с интернетом"), { code: "AI_OFFLINE" });
      const p = pauseFor(err);
      mark(c.id, { until: Date.now() + p.ms, err: p.why });
    }
  }
  throw last ?? new Error("ИИ не ответил вовремя");
}

export async function testProvider(id: string): Promise<{ ok: boolean; ms: number; text: string }> {
  const c = allCandidates().find((x) => x.id === id);
  if (!c) return { ok: false, ms: 0, text: "не подключён" };
  const t0 = Date.now();
  try {
    const text = await c.call({ system: "Отвечай одним словом.", prompt: "Скажи «ок».", tier: "cheap", maxTokens: 400 });
    mark(id, { until: undefined, err: undefined, okAt: Date.now() });
    return { ok: true, ms: Date.now() - t0, text: text.trim().slice(0, 40) };
  } catch (err) {
    const p = pauseFor(err);
    mark(id, { until: Date.now() + p.ms, err: p.why });
    return { ok: false, ms: Date.now() - t0, text: `${p.why}. ${detailOf(err)}` };
  }
}

// Что показать человеку про ошибку: код и начало текста без ключа, чтобы было понятно, что не так.
export function detailOf(err: unknown): string {
  const raw = String((err as Error)?.message ?? err ?? "").replace(/key=[^&\s"']+/gi, "key=***").replace(/Bearer\s+\S+/gi, "Bearer ***");
  const clean = raw.replace(/\s+/g, " ").trim();
  return clean ? `(${clean.slice(0, 160)})` : "";
}
