// Маленькая замена react-router-dom: маршруты по адресу после «#», без лишних зависимостей.
import { createContext, createElement, useContext, useEffect, useState, type ReactNode, type MouseEvent } from "react";

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.split("?")[0] || "/";
}

const PathContext = createContext<string>("/");
// Параметры адреса после «?»: меняются без смены экрана (#/plans?tab=goals → ?tab=tasks), и экран должен это увидеть.
const QueryContext = createContext<string>("");

function currentQuery(): string {
  return window.location.hash.split("?")[1] ?? "";
}

export function HashRouter({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath());
  const [query, setQuery] = useState(currentQuery());
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      setQuery(currentQuery());
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return createElement(PathContext.Provider, { value: path }, createElement(QueryContext.Provider, { value: query }, children));
}

export function useNavigate() {
  return (to: string) => {
    window.location.hash = to;
  };
}

export function Routes({ children }: { children: ReactNode }) {
  const path = useContext(PathContext);
  let found: ReactNode = null;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list as any[]) {
    if (child?.props?.path === path) {
      found = child.props.element;
      break;
    }
  }
  // Неизвестный адрес (старая закладка, убранный экран): показываем маршрут "*", а не пустой экран.
  if (found === null) found = (list as any[]).find((c) => c?.props?.path === "*")?.props.element ?? null;
  return createElement("div", { key: path, className: "route" }, found);
}

export function Route(_props: { path: string; element: ReactNode }) {
  return null;
}

export function Link({ to, children, ...rest }: { to: string; children?: ReactNode; [k: string]: any }) {
  const onClick = (e: MouseEvent) => {
    rest.onClick?.(e); // обработчик, переданный снаружи, выполняется до перехода
    e.preventDefault();
    window.location.hash = to;
  };
  return createElement("a", { ...rest, href: `#${to}`, onClick }, children);
}

export function NavLink({ to, className, children, ...rest }: { to: string; className?: any; children?: any; [k: string]: any }) {
  const path = useContext(PathContext);
  const isActive = to === "/" ? path === "/" : path === to || path.startsWith(to + "/");
  const cls = typeof className === "function" ? className({ isActive }) : className;
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    window.location.hash = to;
  };
  return createElement("a", { ...rest, className: cls, href: `#${to}`, onClick }, typeof children === "function" ? children({ isActive }) : children);
}

// Параметры после «?» в адресе (#/plans?tab=goals). Запись заменяет текущий адрес без новой записи в истории.
export function useSearchParams(): [URLSearchParams, (next: Record<string, string>, opts?: { replace?: boolean }) => void] {
  useContext(PathContext);
  const q = useContext(QueryContext);
  const set = (next: Record<string, string>, opts?: { replace?: boolean }) => {
    const target = `#${currentPath()}?${new URLSearchParams(next).toString()}`;
    if (opts?.replace) window.history.replaceState(null, "", target);
    else window.location.hash = target.slice(1);
  };
  return [new URLSearchParams(q), set];
}
