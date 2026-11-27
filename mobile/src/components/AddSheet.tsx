import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useNavigate } from "react-router-dom";

// Шторка кнопки «+»: одно место для всего, что можно добавить. Выбор ведёт сразу в нужную форму.
// Как и в других телефонах, шторку можно убрать, потянув за серую полоску (или за заголовок) вниз.
const OPTIONS = [
  { id: "write", label: "Запись", hint: "Мысль или событие дня", to: "/?write=1", d: "M4 20l4-1 11-11-3-3L5 16l-1 4z" },
  { id: "task", label: "Задача", hint: "Что нужно сделать и когда напомнить", to: "/plans?tab=tasks&add=1", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 9.5" },
  { id: "weight", label: "Вес", hint: "Записать вес после взвешивания", to: "/me?weigh=1", d: "M4 12h4l2-6 4 12 2-6h4" },
  { id: "goal", label: "Цель", hint: "Куда идёшь", to: "/plans?tab=goals&add=1", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
];

const CLOSE_DISTANCE = 90; // px: дальше этого отпущенная шторка закрывается
const CLOSE_SPEED = 0.6; // px/мс: быстрый короткий «щелчок» вниз тоже закрывает

export function AddSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y0: number; t0: number; id: number } | null>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function down(e: RPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, t0: performance.now(), id: e.pointerId };
    setDragging(true);
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setDy(Math.max(0, e.clientY - drag.current.y0));
  }
  function up(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const dist = Math.max(0, e.clientY - d.y0);
    const speed = dist / Math.max(1, performance.now() - d.t0);
    if (dist > CLOSE_DISTANCE || (dist > 24 && speed > CLOSE_SPEED)) close();
    else setDy(0);
  }

  const shift = closing ? "100%" : `${dy}px`;
  const fade = closing ? 0 : Math.max(0.15, 1 - dy / 320);

  return (
    <div className="sheet-wrap" style={{ background: `rgba(20, 32, 31, ${0.45 * fade})` }} onClick={close}>
      <div
        className={`sheet ${dragging ? "dragging" : ""} ${closing ? "closing" : ""}`}
        style={{ transform: `translateY(${shift})` }}
        role="dialog"
        aria-modal="true"
        aria-label="Что добавить"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet-head"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="button"
          tabIndex={0}
          aria-label="Закрыть: потяни вниз или нажми"
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), close())}
        >
          <div className="sheet-grip" />
          <h3>Что добавить?</h3>
        </div>
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
