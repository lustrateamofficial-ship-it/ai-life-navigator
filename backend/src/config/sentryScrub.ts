// Очистка событий перед отправкой в Sentry. Дневник — самое личное, что есть в приложении, а в сообщение
// об ошибке легко попадает чужой текст: ошибки базы данных (Prisma) часто содержат фрагмент запроса
// вместе с содержимым записи, а заголовки запроса несут данные авторизации Telegram.
// Поэтому наружу уходит только «что сломалось и где», без тел запросов, заголовков и содержимого.
// Функция не зависит от SDK, чтобы её можно было проверить тестом.

interface ScrubbableEvent {
  request?: { data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown; url?: string };
  breadcrumbs?: unknown;
  exception?: { values?: Array<{ type?: string; value?: string }> };
  user?: unknown;
  [key: string]: unknown;
}

const MAX_MESSAGE = 160;

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (typeof event.request.url === "string") event.request.url = event.request.url.split("?")[0];
  }
  delete event.user;
  delete event.breadcrumbs; // в них попадают строки console.error, а там бывает пользовательский текст

  for (const v of event.exception?.values ?? []) {
    if (typeof v.value !== "string") continue;
    const looksLikeDb = (v.type ?? "").startsWith("Prisma") || v.value.includes("`prisma.") || v.value.includes("Invalid `");
    // У ошибок базы первая строка («Invalid `prisma.journalEntry.create()` invocation») говорит, что
    // сломалось, а дальше идёт фрагмент запроса с данными: его не отправляем.
    v.value = (looksLikeDb ? v.value.split("\n")[0] : v.value).slice(0, looksLikeDb ? MAX_MESSAGE : 500);
  }
  return event;
}
