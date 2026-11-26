import { useState, type ReactNode } from "react";

const GROUPS_KEY = "navigator:settings-groups";

function readGroups(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// Раздел настроек, который сворачивается. Что открыто, запоминается; по умолчанию всё закрыто, чтобы экран не был длинным.
export function GroupFold({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  const debugOpen = (() => {
    try {
      return localStorage.getItem("navigator-debug") === "1";
    } catch {
      return false;
    }
  })();
  const [open, setOpen] = useState(() => readGroups()[id] ?? debugOpen);
  return (
    <details
      className="group-fold"
      id={`group-${id}`}
      open={open}
      onToggle={(e) => {
        const o = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(o);
        try {
          localStorage.setItem(GROUPS_KEY, JSON.stringify({ ...readGroups(), [id]: o }));
        } catch {
          /* не запомнится: раздел закроется при следующем входе */
        }
      }}
    >
      <summary className="settings-group">
        <h3>{title}</h3>
        <p>{hint}</p>
      </summary>
      {children}
    </details>
  );
}
