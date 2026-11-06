import { localRequest } from "../../shim/server";

// На телефоне сервера нет: запросы выполняются прямо в приложении (см. shim/server.ts),
// но интерфейс по-прежнему обращается к ним как к обычному API.

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await localRequest(method, path, body);
  if (res.status >= 400) {
    const err = (res.body as any)?.error;
    throw new ApiError(res.status, typeof err === "string" ? err : "Не удалось выполнить действие");
  }
  return res.body as T;
}

// Двойное нажатие на «Добавить»: два одинаковых запроса на создание, посланные одновременно,
// выполняются один раз, а обе кнопки получают один и тот же ответ.
const inFlight = new Map<string, Promise<unknown>>();
function postOnce<T>(path: string, body?: unknown): Promise<T> {
  let key = "";
  try {
    key = path + "\n" + JSON.stringify(body ?? null);
  } catch {
    return request<T>("POST", path, body);
  }
  if (key.length > 20_000) return request<T>("POST", path, body);
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const p = request<T>("POST", path, body).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => postOnce<T>(path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export { ApiError };
