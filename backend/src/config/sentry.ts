import * as Sentry from "@sentry/node";
import { env, isSentryConfigured } from "./env.js";
import { scrubSentryEvent } from "./sentryScrub.js";

// Мониторинг ошибок — рекомендация "как разработчик" после очередного раунда правок:
// без этого любая реальная ошибка в проде видна только в "console.error" внутри
// контейнера, который никто не читает, пока сам не зайдёт и не посмотрит логи. С
// SENTRY_DSN — пуш о первом же настоящем креше, а не "узнал через неделю, когда сам
// заметил, что что-то не работает".
//
// Бесплатный тариф Sentry (sentry.io) — щедрый free tier для одного личного проекта.
// Graceful degradation (раздел 48): без SENTRY_DSN — тихо не инициализируется,
// Sentry.captureException() в этом случае просто ничего не делает (официальное
// поведение SDK — вызов без init() безопасен, не кидает исключение), так что
// остальной код может звать его безусловно, не проверяя каждый раз isSentryConfigured().
export function initSentry(): void {
  if (!isSentryConfigured()) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    // tracesSampleRate: 0 — это именно error monitoring, а не APM/tracing. Полный трейсинг
    // каждого запроса стоил бы заметно больше free tier и не даёт того, ради чего это
    // вообще подключалось (узнать о крешах), поэтому осознанно выключен.
    tracesSampleRate: 0,
    // Приватность дневника: не собираем персональные данные запросов и «хлебные крошки» консоли,
    // а перед отправкой чистим событие (тела запросов, заголовки, фрагменты запросов к базе).
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    beforeSend: (event) => scrubSentryEvent(event as any),
  });

  console.log("[sentry] error monitoring enabled");
}

export { Sentry };
