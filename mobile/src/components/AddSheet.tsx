import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Шторка кнопки «+»: одно место для всего, что можно добавить. Выбор ведёт сразу в нужную форму.
const OPTIONS = [
  { id: "write", label: "Запись", hint: "Мысль или событие дня", to: "/?write=1", d: "M4 20l4-1 11-11-3-3L5 16l-1 4z" },
  { id: "task", label: "Задача", hint: "Что нужно сделать", to: "/plans?tab=tasks&add=1", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 9.5" },
  { id: "reminder", label: "Напоминание", hint: "Напомнить в нужный час", to: "/plans?tab=reminders&add=1", d: "M6 8a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 14 6 8M10 19a2 2 0 0 0 4 0" },
  { id: "weight", label: "Вес", hint: "Записать вес после взвешивания", to: "/me?weigh=1", d: "M4 12h4l2-6 4 12 2-6h4" },
  { id: "goal", label: "Цель", hint: "Куда идёшь", to: "/plans?tab=goals&add=1", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
];

export function AddSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Что добавить" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h3>Что добавить?</h3>
        <div className="sheet-grid">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              className="sheet-opt"
              onClick={() => {
                onClose();
                navigate(o.to);
              }}
            >
              <span className="sheet-ic">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={o.d} />
                </svg>
              </span>
              <b>{o.label}</b>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
