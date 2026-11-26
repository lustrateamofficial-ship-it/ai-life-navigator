import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { BLOCKS, PERIODS, PRESETS, HALF_BLOCKS, matchPreset, moveBlock, toggleBlock, type BlockId, type Layout, type Period, type PresetId } from "../../phone/homeLayout";

// Режим «Настроить»: набор блоков для каждого времени суток. Включить, выключить, переставить.
export function HomeCustomize({
  layout,
  period,
  onPeriod,
  onChange,
  onDone,
  embedded = false,
}: {
  layout: Layout;
  period: Period;
  onPeriod: (p: Period) => void;
  onChange: (l: Layout) => void;
  onDone?: () => void;
  embedded?: boolean;
}) {
  const on = layout[period];
  const off = BLOCKS.filter((b) => !on.includes(b.id));
  const current = matchPreset(layout);
  const listRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<BlockId | null>(null);

  // Перетаскивание за ручку: порядок меняется прямо во время движения пальца.
  function dragMove(e: RPointerEvent, id: BlockId) {
    if (dragId !== id || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-row]"));
    let target = 0;
    for (const r of rows) {
      if (r.dataset.row === id) continue;
      const b = r.getBoundingClientRect();
      if (e.clientY > b.top + b.height / 2) target++;
    }
    const from = on.indexOf(id);
    if (target !== from) {
      const next = on.filter((x) => x !== id);
      next.splice(target, 0, id);
      onChange({ ...layout, [period]: next });
    }
  }

  function pickPreset(id: PresetId) {
    onChange(structuredClone(PRESETS.find((p) => p.id === id)!.layout));
  }

  return (
    <div>
      {!embedded && (
        <div className="custom-top">
          <h2>Настроить экран</h2>
          <button className="primary compact" onClick={onDone}>
            Готово
          </button>
        </div>
      )}

      <div className="seg-tabs" role="group" aria-label="Готовые наборы">
        {PRESETS.map((p) => (
          <button key={p.id} aria-pressed={current === p.id} className={current === p.id ? "active" : ""} onClick={() => pickPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="custom-hint">Выбери время суток и включи нужное. Порядок меняй, перетаскивая за точки слева. Свой набор для утра, дня и вечера. Маленькие плитки (отмечены «½») встают по две в ряд, а если рядом пары нет, плитка сама растягивается на всю ширину, пустого места не остаётся.</p>

      <div className="seg-tabs" role="tablist" aria-label="Время суток">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} className={period === p.id ? "active" : ""} onClick={() => onPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div ref={listRef}>
        {on.map((id) => {
          const b = BLOCKS.find((x) => x.id === id)!;
          return (
            <div className={`block-row ${dragId === id ? "dragging" : ""}`} key={id} data-row={id}>
              <button
                className="grab-handle"
                aria-label={`${b.label}: перетащить`}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragId(id);
                }}
                onPointerMove={(e) => dragMove(e, id)}
                onPointerUp={() => setDragId(null)}
                onPointerCancel={() => setDragId(null)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") (e.preventDefault(), onChange({ ...layout, [period]: moveBlock(on, id, -1) }));
                  if (e.key === "ArrowDown") (e.preventDefault(), onChange({ ...layout, [period]: moveBlock(on, id, 1) }));
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
                </svg>
              </button>
              <div className="block-text">
                <b>
                  {b.label}
                  {HALF_BLOCKS.has(b.id) && <span className="half-badge">½</span>}
                </b>
                <small>{b.hint}</small>
              </div>
              <button role="switch" aria-checked="true" aria-label={`${b.label}: показывать`} className="switch on" onClick={() => onChange({ ...layout, [period]: toggleBlock(on, id) })} />
            </div>
          );
        })}
      </div>

      {off.length > 0 && <div className="custom-sub">Выключено</div>}
      {off.map((b) => (
        <div className="block-row off" key={b.id}>
          <div className="block-text">
            <b>{b.label}</b>
            <small>{b.hint}</small>
          </div>
          <button role="switch" aria-checked="false" aria-label={`${b.label}: показывать`} className="switch" onClick={() => onChange({ ...layout, [period]: toggleBlock(on, b.id) })} />
        </div>
      ))}
    </div>
  );
}
