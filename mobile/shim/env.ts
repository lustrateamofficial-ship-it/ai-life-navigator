// Настройки на телефоне: ключи ИИ и прочее хранятся в самом приложении (на устройстве).
// Вместо переменных окружения сервера значения берутся из локальных настроек в момент обращения.

const KEY = "navigator-settings";

// Дополнительный ИИ-сервис с адресом в формате OpenAI (Cerebras, Mistral, OpenRouter и другие).
export interface AiService {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  key: string;
  enabled: boolean;
  paid?: boolean; // платный сервис: в очереди по умолчанию идёт после бесплатных
}

export interface LocalSettings {
  updateRepo?: string;
  services?: AiService[];
  aiOrder?: string[];
  geminiApiKey?: string;
  groqApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  deepseekApiKey?: string;
  primaryAi?: string;
  voyageApiKey?: string;
  weatherApiKey?: string;
  weatherDefaultCity?: string;
  googleClientId?: string;
}

// Настройки читаются осторожно: если там мусор (повреждение, ручная правка), лишнее отбрасывается.
export function readSettings(): LocalSettings {
  let raw: any;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && k !== "services" && k !== "aiOrder") out[k] = v;
  if (Array.isArray(raw.aiOrder)) out.aiOrder = raw.aiOrder.filter((x: unknown) => typeof x === "string");
  if (Array.isArray(raw.services)) {
    out.services = raw.services
      .filter((x: any) => x && typeof x === "object" && typeof x.id === "string")
      .map((x: any) => ({ id: x.id, name: String(x.name ?? "Свой сервис"), baseUrl: String(x.baseUrl ?? ""), model: String(x.model ?? ""), key: String(x.key ?? ""), enabled: x.enabled !== false, paid: x.paid === true }));
  }
  return out as LocalSettings;
}

export function writeSettings(patch: LocalSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch {
    /* хранилище недоступно — настройки не сохранятся */
  }
}

const s = () => readSettings();

export const env: any = {
  get port() {
    return 0;
  },
  nodeEnv: "production",
  databaseUrl: "",
  jwtSecret: "",
  telegramBotToken: "",
  telegramWebAppUrl: "",
  aiProvider: "anthropic",
  get anthropicApiKey() {
    return s().anthropicApiKey ?? "";
  },
  aiModelCheap: "claude-haiku-5-5",
  aiModelStrong: "claude-sonnet-5-5",
  get voyageApiKey() {
    return s().voyageApiKey ?? "";
  },
  embeddingModel: "voyage-3",
  get openaiApiKey() {
    return s().openaiApiKey ?? "";
  },
  openaiModel: "gpt-4o-mini",
  get deepseekApiKey() {
    return s().deepseekApiKey ?? "";
  },
  deepseekModel: "deepseek-chat",
  get primaryAi() {
    return s().primaryAi ?? "";
  },
  get geminiApiKey() {
    return s().geminiApiKey ?? "";
  },
  geminiModel: "gemini-2.5-flash-lite",
  get groqApiKey() {
    return s().groqApiKey ?? "";
  },
  groqModel: "openai/gpt-oss-120b",
  get weatherApiKey() {
    return s().weatherApiKey ?? "";
  },
  get weatherDefaultCity() {
    return s().weatherDefaultCity ?? "Moscow";
  },
  sentryDsn: "",
  get googleClientId() {
    return s().googleClientId ?? "";
  },
  googleClientSecret: "",
  googleRedirectUri: "",
};

// На телефоне «слой проверки» умеет работать и без платного ключа: если Anthropic не настроен,
// он использует бесплатный Gemini или Groq (см. providers-anthropic.ts). Поэтому достаточно любого ключа.
export const isAiConfigured = () =>
  Boolean(env.anthropicApiKey || env.openaiApiKey || env.geminiApiKey || env.deepseekApiKey || env.groqApiKey || (readSettings().services ?? []).some((x) => x.enabled && x.key));
export const isBotConfigured = () => false;
export const isEmbeddingsConfigured = () => Boolean(env.voyageApiKey);
export const isTranscriptionConfigured = () => false;
export const isGoogleDriveConfigured = () => Boolean(env.googleClientId);
export const isGeminiConfigured = () => Boolean(env.geminiApiKey);
export const isGroqConfigured = () => Boolean(env.groqApiKey);
export const isSentryConfigured = () => false;
export const isAnyAiConfigured = () => isAiConfigured();
