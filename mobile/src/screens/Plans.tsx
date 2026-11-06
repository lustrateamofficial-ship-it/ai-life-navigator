import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Goals } from "./Goals";
import { Tasks } from "./Tasks";
import { Reminders } from "./Reminders";

// Один экран «Планы»: цели, задачи и напоминания — три вкладки вместо трёх разделов.
// Вкладка хранится в адресе (?tab=goals), поэтому ссылки и кнопка «назад» работают предсказуемо.
const TABS = [
  { id: "tasks", label: "Задачи" },
  { id: "goals", label: "Цели" },
  { id: "reminders", label: "Напоминания" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Plans() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("tab");
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : "tasks");

  function pick(id: TabId) {
    setTab(id);
    setParams({ tab: id }, { replace: true });
  }

  return (
    <div className="screen">
      <header className="page-header">
        <h2>Планы</h2>
      </header>
      <div className="seg-tabs" role="tablist" aria-label="Разделы планов">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tasks" && <Tasks embedded />}
      {tab === "goals" && <Goals embedded />}
      {tab === "reminders" && <Reminders embedded />}
    </div>
  );
}
