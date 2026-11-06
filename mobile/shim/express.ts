// Крошечная замена Express: достаточно, чтобы серверные маршруты работали прямо в приложении,
// без сети и без сервера. Поддерживает ровно то, что используют маршруты: Router, get/post/put/delete/use,
// параметры пути, req.query/body/params, res.json/status/send/setHeader.

type Handler = (req: any, res: any, next?: () => void) => any;

interface Route {
  method: string;
  pattern: string;
  keys: string[];
  regex: RegExp;
  handler: Handler;
}

function compile(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = pattern
    .replace(/\/+$/, "")
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^${src}/?$`), keys };
}

export class RouterImpl {
  routes: Route[] = [];
  mounts: { prefix: string; router: RouterImpl }[] = [];

  private add(method: string, pattern: string, handlers: Handler[]) {
    const { regex, keys } = compile(pattern === "/" ? "" : pattern);
    for (const handler of handlers) this.routes.push({ method, pattern, keys, regex, handler });
  }
  get(p: string, ...h: Handler[]) {
    this.add("GET", p, h);
    return this;
  }
  post(p: string, ...h: Handler[]) {
    this.add("POST", p, h);
    return this;
  }
  put(p: string, ...h: Handler[]) {
    this.add("PUT", p, h);
    return this;
  }
  patch(p: string, ...h: Handler[]) {
    this.add("PATCH", p, h);
    return this;
  }
  delete(p: string, ...h: Handler[]) {
    this.add("DELETE", p, h);
    return this;
  }
  use(prefix: string, router: RouterImpl) {
    this.mounts.push({ prefix: prefix.replace(/\/+$/, ""), router });
    return this;
  }

  // Ищем маршрут: сначала свои, затем подключённые под префиксом.
  match(method: string, path: string): { handlers: Handler[]; params: Record<string, string> } | null {
    const found: Route[] = [];
    let params: Record<string, string> = {};
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(path);
      if (!m) continue;
      if (found.length === 0) params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      found.push(r);
      // несколько обработчиков на один путь (цепочка) — берём подряд идущие с тем же шаблоном
    }
    if (found.length) {
      const first = found[0].pattern;
      return { handlers: found.filter((f) => f.pattern === first).map((f) => f.handler), params };
    }
    for (const m of this.mounts) {
      if (path === m.prefix || path.startsWith(m.prefix + "/")) {
        const sub = m.router.match(method, path.slice(m.prefix.length) || "/");
        if (sub) return sub;
      }
    }
    return null;
  }
}

export function Router() {
  return new RouterImpl();
}

export interface LocalResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

// Выполнить запрос так, как если бы он пришёл на сервер.
export async function dispatch(
  root: RouterImpl,
  method: string,
  fullPath: string,
  body: unknown,
  ctx: { userId: string; userTimezone: string }
): Promise<LocalResponse> {
  const [pathPart, queryPart = ""] = fullPath.split("?");
  const query: Record<string, string> = {};
  new URLSearchParams(queryPart).forEach((v, k) => (query[k] = v));

  const matched = root.match(method.toUpperCase(), pathPart.replace(/\/+$/, "") || "/");
  if (!matched) return { status: 404, body: { error: "Не найдено" }, headers: {} };

  const result: LocalResponse = { status: 200, body: undefined, headers: {} };
  let sent = false;
  const res: any = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(b: unknown) {
      result.body = b;
      sent = true;
      return res;
    },
    send(b: unknown) {
      result.body = b;
      sent = true;
      return res;
    },
    setHeader(k: string, v: string) {
      result.headers[k] = v;
      return res;
    },
    sendStatus(code: number) {
      result.status = code;
      sent = true;
      return res;
    },
    end() {
      sent = true;
      return res;
    },
  };
  const req: any = {
    method: method.toUpperCase(),
    params: matched.params,
    query,
    body: body ?? {},
    userId: ctx.userId,
    userTimezone: ctx.userTimezone,
    headers: {},
  };

  try {
    for (const h of matched.handlers) {
      await new Promise<void>((resolve, reject) => {
        let nextCalled = false;
        const next = (err?: unknown) => {
          nextCalled = true;
          err ? reject(err) : resolve();
        };
        Promise.resolve(h(req, res, next)).then(
          () => {
            if (!nextCalled) resolve();
          },
          reject
        );
      });
      if (sent) break;
    }
  } catch (err: any) {
    console.error("[локальный сервер]", err);
    return { status: 500, body: { error: err?.message ?? "Ошибка" }, headers: {} };
  }
  if (!sent) result.status = result.status === 200 ? 204 : result.status;
  return result;
}

export default { Router };
