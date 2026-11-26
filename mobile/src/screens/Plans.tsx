import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Goals } from "./Goals";
import { Tasks } from "./Tasks";
import { Reminders } from "./Reminders";
import { Calendar } from "./Calendar";

// Один экран «Планы»: задачи, цели, напоминания и расписание — вкладки одного раздела.
// Вкладка хранится в адресе (?tab=goals), поэтому ссылки и кнопка «назад» работают предсказуемо.
const TABS = [
  { id: "tasks", label: "Задачи" },
  { id: "goals", label: "Цели" },
  { id: "reminders", label: "Напоминания" },
  { id: "calendar", label: "Расписание" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Plans() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("tab");
  const [autoAdd] = useState(params.get("add") === "1"); // пришли из «+»: сразу открыть форму добавления
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : "tasks");

  // Адрес изменили снаружи (ссылка, «назад»): вкладка следует за ним.
  useEffect(() => {
    if (TABS.some((t) => t.id === fromUrl)) setTab(fromUrl as TabId);
  }, [fromUrl]);

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
      {tab === "tasks" && <Tasks embedded autoAdd={autoAdd} />}
      {tab === "goals" && <Goals embedded autoAdd={autoAdd} />}
      {tab === "reminders" && <Reminders embedded autoAdd={autoAdd} />}
      {tab === "calendar" && <Calendar embedded />}
    </div>
  );
}
