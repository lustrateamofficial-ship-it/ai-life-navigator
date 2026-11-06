import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    // Не бросаем в dev-режиме на импорте, чтобы приложение поднималось
    // и явно сообщало о нехватке ключей через /health, а не падало молча.
    console.warn(`[env] Missing environment variable: ${name}`);
    return "";
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebAppUrl: process.env.TELEGRAM_WEBAPP_URL ?? "",

  aiProvider: process.env.AI_PROVIDER ?? "anthropic",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  aiModelCheap: process.env.AI_MODEL_CHEAP ?? "claude-haiku-4-5-20251001",
  aiModelStrong: process.env.AI_MODEL_STRONG ?? "claude-sonnet-5",

  // Semantic Memory (раздел 37) — Anthropic не даёт embeddings API, используем Voyage AI.
  voyageApiKey: process.env.VOYAGE_API_KEY ?? "",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "voyage-3",

  // Голосовой ввод (раздел 44, Версия 2) — Anthropic не даёт audio API, используем OpenAI Whisper.
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",

  // Многоуровневая AI-система (роутер/специалист — дешёвые частые вызовы, Gemini с
  // фолбэком на Groq; verifier — редкие дорогие проверки, остаётся на Anthropic).
  // Оба опциональны: без них всё продолжает работать через Anthropic на всех уровнях,
  // как раньше, просто без экономии на частых вызовах.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",

  weatherApiKey: process.env.WEATHER_API_KEY ?? "",
  weatherDefaultCity: process.env.WEATHER_DEFAULT_CITY ?? "Moscow",

  // Мониторинг ошибок (Sentry) — без него любой сбой виден только в логах контейнера,
  // которые никто не читает, пока сам не зайдёт и не посмотрит. С ключом — моментальное
  // уведомление о первом же реальном креше. См. config/sentry.ts.
  sentryDsn: process.env.SENTRY_DSN ?? "",

  // Резервные копии в Google Drive (раздел "Настройки"). Получаются в Google Cloud
  // Console → APIs & Services → Credentials → OAuth client ID (тип "Web application").
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Должен совпадать 1-в-1 с тем, что указано в Google Cloud Console как Authorized redirect URI.
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
};

export const isAiConfigured = () => Boolean(env.anthropicApiKey);
export const isBotConfigured = () => Boolean(env.telegramBotToken);
export const isEmbeddingsConfigured = () => Boolean(env.voyageApiKey);
export const isTranscriptionConfigured = () => Boolean(env.openaiApiKey);
export const isGoogleDriveConfigured = () => Boolean(env.googleClientId && env.googleClientSecret && env.googleRedirectUri);
export const isGeminiConfigured = () => Boolean(env.geminiApiKey);
export const isGroqConfigured = () => Boolean(env.groqApiKey);
export const isSentryConfigured = () => Boolean(env.sentryDsn);

// БАГ (найден при аудите): isAiConfigured() проверяет ТОЛЬКО Anthropic-ключ. Это верно
// для verifier-слоя (он всегда на Anthropic по дизайну), но этой же проверкой ошибочно
// гейтились функции роутера/специалиста (чат, распознавание еды, извлечение принципов
// из дневника) — те, что должны уметь работать через Gemini/Groq. В итоге у человека,
// который настроил ТОЛЬКО бесплатные Gemini+Groq без платного Anthropic-ключа — то есть
// сделал ровно то, ради чего эти два провайдера вообще добавлялись, — чат и похожие
// функции были бы заблокированы, хотя технически прекрасно работали бы. Используйте
// isAnyAiConfigured() для гейтов роутера/специалиста, isAiConfigured() — только там, где
// код действительно вызывает исключительно Anthropic (verifier-слой: отчёты, "почему я
// остановился", портрет по дневнику, прогноз).
export const isAnyAiConfigured = () => isAiConfigured() || isGeminiConfigured() || isGroqConfigured();
