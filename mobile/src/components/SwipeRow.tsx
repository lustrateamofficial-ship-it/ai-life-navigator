import { useRef, useState, type ReactNode } from "react";
import { hapticSelection } from "../platform/sdk";

const THRESHOLD = 84;
const MAX = 132;

// Строка, которую можно смахнуть: вправо или влево. Всегда есть и обычные кнопки, жест только ускоряет.
export function SwipeRow({
  children,
  onRight,
  onLeft,
  rightLabel,
  leftLabel,
  disabled,
  onUsed,
}: {
  children: ReactNode;
  onRight?: () => void;
  onLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
  onUsed?: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const armed = useRef(false);

  function down(e: React.PointerEvent) {
    if (disabled) return;
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    armed.current = false;
  }

  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!dragging) {
      // Жест начинается, только если палец ушёл заметно в сторону: так вертикальная прокрутка не мешает.
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.5) return;
      setDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* захват не удался: жест всё равно работает пока палец над строкой */
      }
    }
    const allowed = mx > 0 ? !!onRight : !!onLeft;
    const v = allowed ? Math.max(-MAX, Math.min(MAX, mx)) : 0;
    setDx(v);
    const over = Math.abs(v) >= THRESHOLD;
    if (over && !armed.current) hapticSelection();
    armed.current = over;
  }

  function end(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const fired = dragging && armed.current ? (dx > 0 ? onRight : onLeft) : undefined;
    setDragging(false);
    setDx(0);
    armed.current = false;
    if (fired) {
      onUsed?.();
      fired();
    }
  }

  const shown = dragging ? dx : 0;
  return (
    <div className={`swipe ${dragging ? "dragging" : ""}`}>
      <div className={`swipe-bg ${shown > 0 ? "to-right" : shown < 0 ? "to-left" : ""}`} aria-hidden="true">
        <span className={`swipe-act right ${shown >= THRESHOLD ? "armed" : ""}`}>{rightLabel}</span>
        <span className={`swipe-act left ${shown <= -THRESHOLD ? "armed" : ""}`}>{leftLabel}</span>
      </div>
      <div
        className="swipe-inner task-row"
        style={{ transform: shown ? `translateX(${shown}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {children}
      </div>
    </div>
  );
}
