import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Goals } from "./Goals";
import { Tasks } from "./Tasks";
import { Calendar } from "./Calendar";
import { TileEditPage, EditButton, useTiles } from "../components/TileEditPage";

// Один экран «Планы»: задачи (с напоминаниями внутри), цели и расписание — вкладки одного раздела.
// Вкладка хранится в адресе (?tab=goals), поэтому ссылки и кнопка «назад» работают предсказуемо.
const TABS = [
  { id: "tasks", label: "Задачи" },
  { id: "goals", label: "Цели" },
  { id: "calendar", label: "Расписание" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Plans() {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [order] = useTiles("plans");
  // Вкладки показываются в том порядке, что выбран в настройках; выключенные не показываются.
  const tabs = order.map((id) => TABS.find((t) => t.id === id)).filter((t): t is (typeof TABS)[number] => !!t);
  // Старые ссылки на вкладку «Напоминания» ведут в «Задачи»: напоминание теперь поле задачи.
  const fromUrl = params.get("tab") === "reminders" ? "tasks" : params.get("tab");
  const [autoAdd] = useState(params.get("add") === "1"); // пришли из «+»: сразу открыть форму добавления
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : "tasks");
  // Пришли из «+» в скрытую вкладку (например, «Задача»): всё равно открываем её, чтобы форма добавления была под рукой.
  const current: TabId | null = tabs.some((t) => t.id === tab) || (autoAdd && TABS.some((t) => t.id === tab)) ? tab : (tabs[0]?.id ?? null);

  // Адрес изменили снаружи (ссылка, «назад»): вкладка следует за ним.
  useEffect(() => {
    if (TABS.some((t) => t.id === fromUrl)) setTab(fromUrl as TabId);
  }, [fromUrl]);

  function pick(id: TabId) {
    setTab(id);
    setParams({ tab: id }, { replace: true });
  }

  if (editing) return <TileEditPage screen="plans" onDone={() => setEditing(false)} />;

  return (
    <div className="screen">
      <header className="page-header page-header-row">
        <h2>Планы</h2>
        <div className="header-actions">
          <EditButton onClick={() => setEditing(true)} />
        </div>
      </header>
      {tabs.length > 1 && (
        <div className="seg-tabs" role="tablist" aria-label="Разделы планов">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={current === t.id} className={current === t.id ? "active" : ""} onClick={() => pick(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {current === "tasks" && <Tasks embedded autoAdd={autoAdd} />}
      {current === "goals" && <Goals embedded autoAdd={autoAdd} />}
      {current === "calendar" && <Calendar embedded />}
      {current === null && <p className="custom-hint">Все вкладки выключены. Нажми карандаш сверху и выбери, что показывать.</p>}
    </div>
  );
}
