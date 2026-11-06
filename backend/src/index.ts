// КРИТИЧНО: должен быть первым импортом. Патчит Express 4 так, что если async-хендлер
// бросает исключение (например, сломанный JSON от AI, обрыв связи с БД), Express
// передаёт ошибку в error-middleware вместо необработанного Promise rejection,
// который в Node 15+ по умолчанию ЗАВЕРШАЕТ весь процесс — то есть без этой строки
// одна случайная ошибка у одного пользователя валила бы сервер для всех.
import "express-async-errors";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env, isAiConfigured, isAnyAiConfigured, isBotConfigured, isSentryConfigured } from "./config/env.js";
import { initSentry, Sentry } from "./config/sentry.js";
import { isWeatherConfigured } from "./services/weather.js";
import { telegramAuth } from "./middleware/auth.js";

// Инициализируем до создания приложения — чтобы ошибки, возникшие даже в процессе
// настройки middleware ниже, тоже могли быть отправлены.
initSentry();

import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { missionRouter } from "./routes/mission.js";
import { goalsRouter } from "./routes/goals.js";
import { tasksRouter } from "./routes/tasks.js";
import { habitsRouter } from "./routes/habits.js";
import { healthRouter } from "./routes/health.js";
import { financeRouter } from "./routes/finance.js";
import { calendarRouter } from "./routes/calendar.js";
import { remindersRouter } from "./routes/reminders.js";
import { ideasRouter } from "./routes/ideas.js";
import { memoryRouter } from "./routes/memory.js";
import { journalRouter } from "./routes/journal.js";
import { homeRouter } from "./routes/home.js";
import { moodRouter } from "./routes/mood.js";
import { accountRouter } from "./routes/account.js";
import {
  analyticsRouter,
  directionScoreRouter,
  trendsRouter,
  correlationsRouter,
  reportsRouter,
  simulationRouter,
} from "./routes/analytics.js";
import { aiRouter } from "./routes/ai.js";
import { lifeGraphRouter } from "./routes/lifeGraph.js";
import { googleAuthenticatedRouter, googleCallbackRouter } from "./routes/google.js";
import { portraitRouter } from "./routes/portrait.js";

import { startScheduler } from "./jobs/scheduler.js";
import { startBot } from "./bot/bot.js";

const app = express();

// За Caddy (см. docker-compose.yml) стоит ровно один reverse-proxy хоп — без этого
// express-rate-limit либо считает всех пользователей одним IP (Caddy-контейнера),
// либо в новых версиях вовсе кидает ошибку при виде заголовка X-Forwarded-For
// без настроенного trust proxy.
app.set("trust proxy", 1);

// Раздел 39 (Privacy) + общая security-полировка (Этап 11).
app.use(helmet());
// Раздел 39 (Privacy): в проде сужаем CORS до реального домена Mini App вместо wildcard.
// Риск wildcard здесь невысокий (авторизация по заголовку x-telegram-init-data, не по
// cookie, так что классический CSRF не работает), но незачем давать больше, чем нужно.
// В dev (TELEGRAM_WEBAPP_URL не задан) остаётся permissive — иначе localhost-разработка сломается.
app.use(cors({ origin: env.telegramWebAppUrl || true }));
// БАГ (найден при добавлении POST /account/restore): express.json() без явного лимита
// по умолчанию принимает тело запроса размером не больше 100kb — для большинства
// эндпоинтов этого за глаза, но файл экспорта аккаунта (вся история целей, дневника,
// памяти и т.д.) легко превышает это на реальных данных, и запрос на восстановление
// тихо упал бы с 413 ещё до того, как дойти до маршрута. 25mb — с большим запасом
// даже для многолетней истории, но не настолько большой, чтобы открывать практическую
// DoS-дыру через искусственно раздутое тело запроса.
app.use(express.json({ limit: "25mb" }));

// Общий rate limit — защита от злоупотребления API (и от случайного AI cost blowup, раздел 38).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // 120 запросов в минуту на IP — щедро для обычного использования Mini App
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов, попробуйте чуть позже." },
});
app.use(apiLimiter);

// Отдельный, более строгий лимит на дорогие AI-эндпоинты (раздел 38: AI Cost Control).
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов к AI, попробуйте через минуту." },
});

// Раздел 48: базовые функции не должны зависеть от AI/бота.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    // Два разных флага осознанно: aiConfigured — работает ли хоть что-то из AI
    // (роутер/специалист — чат, еда, принципы — могут идти через Gemini/Groq без
    // Anthropic). verifierConfigured — именно Anthropic, от него зависят отчёты,
    // "почему я остановился" и портрет по дневнику, которые всегда идут через verifier-слой.
    aiConfigured: isAnyAiConfigured(),
    verifierConfigured: isAiConfigured(),
    botConfigured: isBotConfigured(),
    weatherConfigured: isWeatherConfigured(),
    monitoringConfigured: isSentryConfigured(),
    env: env.nodeEnv,
  });
});

// Публичный callback от Google OAuth — браузер переходит сюда напрямую, никаких
// Telegram-заголовков в этом запросе нет и быть не может (см. routes/google.ts).
// Должен быть зарегистрирован ДО telegramAuth, как и GET /health выше.
app.use("/google", googleCallbackRouter);

// Все роуты ниже требуют проверенный Telegram initData (раздел 39: Privacy).
app.use(telegramAuth);

app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/mission", missionRouter);
app.use("/goals", goalsRouter);
app.use("/tasks", tasksRouter);
app.use("/habits", habitsRouter);
app.use("/health", healthRouter); // /health/weight, /health/food (не путать с GET /health выше — тот без auth)
app.use("/finance", financeRouter);
app.use("/calendar", calendarRouter);
app.use("/reminders", remindersRouter);
app.use("/ideas", ideasRouter);
app.use("/memory", memoryRouter);
app.use("/journal", journalRouter);
app.use("/home", homeRouter);
app.use("/mood", moodRouter);
app.use("/account", accountRouter);
app.use("/analytics", analyticsRouter);
app.use("/direction-score", directionScoreRouter);
app.use("/trends", trendsRouter);
app.use("/correlations", correlationsRouter);
app.use("/reports", aiLimiter, reportsRouter);
app.use("/simulation", aiLimiter, simulationRouter);
app.use("/life-graph", lifeGraphRouter);
app.use("/google", googleAuthenticatedRouter);
app.use("/ai", aiLimiter, aiRouter);
app.use("/portrait", aiLimiter, portraitRouter);

// 404 для несуществующих маршрутов — иначе Express отдаёт HTML-страницу по умолчанию,
// а не JSON, что ломает фронтенд-парсинг ошибок.
app.use((_req, res) => {
  res.status(404).json({ error: "Не найдено" });
});

// Обработка ошибок — раздел 48: никогда не показывать stack trace пользователю.
// Благодаря express-async-errors (импорт в самом верху файла) сюда долетают
// и ошибки из async-хендлеров, а не только синхронные.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  Sentry.captureException(err); // no-op, если SENTRY_DSN не задан (см. config/sentry.ts)
  if (res.headersSent) return;
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

// Последний рубеж защиты: если ошибка всё же проскочила мимо express-async-errors
// (например, внутри cron-джоба или обработчика бота, не внутри HTTP-запроса),
// логируем и НЕ даём процессу упасть для всех пользователей разом.
process.on("unhandledRejection", (reason) => {
  // Мягкий случай — чаще всего забытый .catch() в фоновом коде (cron/бот), которые и так
  // в основном обёрнуты в forEachUserSafely/try-catch. Не фатально, оставляем процесс жить.
  console.error("[unhandledRejection]", reason);
  Sentry.captureException(reason);
});
process.on("uncaughtException", (err) => {
  // БАГ (найден при независимом аудите): раньше только логировалось, процесс продолжал
  // работать. Документация Node.js прямо предупреждает: после uncaughtException процесс
  // может быть в неопределённом состоянии (незавершённые операции, утечки ресурсов) —
  // продолжать обслуживать новые запросы небезопасно. Правильный паттерн — залогировать
  // и завершить процесс, дав контейнеру (restart: unless-stopped в docker-compose.yml)
  // поднять его заново чистым, а не пытаться жить дальше в неизвестном состоянии.
  console.error("[uncaughtException] fatal, exiting:", err);
  Sentry.captureException(err);
  // Sentry отправляет события по сети асинхронно — без явного flush процесс мог бы
  // завершиться (process.exit ниже) раньше, чем событие реально уйдёт, и Sentry
  // никогда бы о самой важной категории ошибок (фатальных) не узнал. close(2000) ждёт
  // отправки до 2 секунд, затем продолжает в любом случае — не нужно зависать навсегда
  // из-за недоступности самого Sentry.
  Sentry.close(2000).finally(() => process.exit(1));
});

app.listen(env.port, () => {
  console.log(`🧭 AI Life Navigator backend listening on :${env.port}`);
  if (!isAnyAiConfigured()) console.warn("⚠️  AI provider not configured — AI features disabled");
  else if (!isAiConfigured())
    console.warn("⚠️  Anthropic not configured — reports, \"why did I stop\" and the diary portrait will be unavailable (router/specialist AI still works via Gemini/Groq)");
  if (!isBotConfigured()) console.warn("⚠️  Telegram bot token not configured — bot disabled");

  startScheduler();
  startBot();
});
