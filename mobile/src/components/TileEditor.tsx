import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { TILES, moveTile, spans, toggleTile, type ScreenId } from "../../phone/homeLayout";
import { hapticImpact } from "../platform/sdk";

const GAP = 8; // расстояние между строками списка, px: должно совпадать с CSS (.tile-row)

interface Drag {
  id: string;
  from: number; // где строка была в начале
  to: number; // где окажется, если отпустить сейчас
  dy: number; // на сколько пальцем уже сдвинута
  settling: boolean; // палец отпущен, строка доезжает до места
}

// Редактор плиток одного экрана: включить, выключить, перетащить за точки. Порядок меняется плавно:
// строки не перестраиваются, пока идёт перетаскивание, а сдвигаются «трансформацией», поэтому палец не теряется
// и тянуть можно на любое расстояние, вверх и вниз.
export function TileEditor({ screen, ids, onChange }: { screen: ScreenId; ids: string[]; onChange: (next: string[]) => void }) {
  const defs = TILES[screen];
  const label = (id: string) => defs.find((d) => d.id === id)!;
  const off = defs.filter((d) => !ids.includes(d.id));
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [instant, setInstant] = useState(false); // на один кадр отключает анимацию при замене порядка
  const geo = useRef<{ tops: number[]; heights: number[]; startPageY: number; pointerId: number; clientY: number } | null>(null);
  const raf = useRef(0);

  // После смены порядка один кадр без анимации: иначе строки «доехали бы» обратно.
  useLayoutEffect(() => {
    if (!instant) return;
    const r = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(r);
  }, [instant]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Новые верхние края строк, если строка `from` переедет на место `to`. Высоты у строк могут быть разными.
  function newTops(from: number, to: number): number[] {
    const g = geo.current!;
    const order = ids.map((_, i) => i);
    order.splice(from, 1);
    order.splice(to, 0, from);
    const out: number[] = [];
    let y = g.tops[0]!;
    for (const i of order) {
      out[i] = y;
      y += g.heights[i]! + GAP;
    }
    return out;
  }

  function targetIndex(from: number, dy: number): number {
    const g = geo.current!;
    const center = g.tops[from]! + g.heights[from]! / 2 + dy;
    let to = 0;
    ids.forEach((_, i) => {
      if (i === from) return;
      if (g.tops[i]! + g.heights[i]! / 2 < center) to++;
    });
    return to;
  }

  function update(clientY: number) {
    const g = geo.current;
    if (!g) return;
    g.clientY = clientY;
    setDrag((d) => {
      if (!d || d.settling) return d;
      const dy = clientY + window.scrollY - g.startPageY;
      const to = targetIndex(d.from, dy);
      if (to !== d.to) hapticImpact("light");
      return { ...d, dy, to };
    });
  }

  // Пока палец у края экрана, страница сама прокручивается: так можно дотянуть до дальней плитки.
  function autoscroll() {
    const g = geo.current;
    if (!g) return;
    const edge = 90;
    const speed = g.clientY < edge ? -Math.ceil((edge - g.clientY) / 6) : g.clientY > window.innerHeight - edge - 70 ? Math.ceil((g.clientY - (window.innerHeight - edge - 70)) / 6) : 0;
    if (speed) {
      window.scrollBy(0, speed);
      update(g.clientY);
    }
    raf.current = requestAnimationFrame(autoscroll);
  }

  function down(e: RPointerEvent<HTMLButtonElement>, id: string) {
    const list = listRef.current;
    if (!list || drag) return;
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"));
    const base = window.scrollY;
    geo.current = {
      tops: rows.map((r) => r.getBoundingClientRect().top + base),
      heights: rows.map((r) => r.offsetHeight),
      startPageY: e.clientY + base,
      pointerId: e.pointerId,
      clientY: e.clientY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = ids.indexOf(id);
    hapticImpact("medium");
    setDrag({ id, from, to: from, dy: 0, settling: false });
    raf.current = requestAnimationFrame(autoscroll);
  }

  function up() {
    cancelAnimationFrame(raf.current);
    const d = drag;
    if (!d || d.settling || !geo.current) return;
    const final = newTops(d.from, d.to)[d.from]! - geo.current.tops[d.from]!;
    setDrag({ ...d, dy: final, settling: true });
    window.setTimeout(() => {
      setInstant(true);
      setDrag(null);
      geo.current = null;
      if (d.to !== d.from) onChange(moveTile(ids, d.from, d.to));
    }, 170);
  }

  // На сколько сдвинуть строку i, пока перетаскивание идёт.
  function shiftOf(i: number): number {
    if (!drag || !geo.current) return 0;
    if (i === drag.from) return drag.dy;
    return newTops(drag.from, drag.to)[i]! - geo.current.tops[i]!;
  }

  const sizes = useMemo(() => spans(ids, (id) => !!label(id).half), [ids, screen]);
  const hasHalf = defs.some((d) => d.half);

  return (
    <div className="tile-editor">
      {hasHalf && ids.length > 0 && (
        <div className="mini-wrap" aria-hidden="true">
          <div className="mini-title">Так выглядит порядок</div>
          <div className="mini-grid">
            {ids.map((id, i) => (
              <div key={id} className={`mini-tile ${sizes[i]}`}>
                {label(id).label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={listRef} className={`tile-list ${drag ? "is-dragging" : ""} ${instant ? "instant" : ""}`}>
        {ids.map((id, i) => {
          const b = label(id);
          const isDrag = drag?.id === id;
          return (
            <div
              className={`tile-row ${isDrag ? "dragging" : ""} ${isDrag && drag?.settling ? "settling" : ""}`}
              key={id}
              data-row={id}
              style={drag ? { transform: `translateY(${shiftOf(i)}px)${isDrag && !drag.settling ? " scale(1.02)" : ""}` } : undefined}
            >
              <button
                className="grab-handle"
                aria-label={`${b.label}: перетащить`}
                onPointerDown={(e) => down(e, id)}
                onPointerMove={(e) => isDrag && update(e.clientY)}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") (e.preventDefault(), onChange(moveTile(ids, i, i - 1)));
                  if (e.key === "ArrowDown") (e.preventDefault(), onChange(moveTile(ids, i, i + 1)));
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
                </svg>
              </button>
              <div className="block-text">
                <b>
                  {b.label}
                  {b.half && <span className="half-badge">½</span>}
                </b>
                <small>{b.hint}</small>
              </div>
              <button role="switch" aria-checked="true" aria-label={`${b.label}: показывать`} className="switch on" onClick={() => onChange(toggleTile(ids, id))} />
            </div>
          );
        })}
      </div>

      {off.length > 0 && <div className="custom-sub">Скрыто</div>}
      {off.map((b) => (
        <div className="tile-row off" key={b.id}>
          <div className="block-text">
            <b>
              {b.label}
              {b.half && <span className="half-badge">½</span>}
            </b>
            <small>{b.hint}</small>
          </div>
          <button role="switch" aria-checked="false" aria-label={`${b.label}: показывать`} className="switch" onClick={() => onChange(toggleTile(ids, b.id))} />
        </div>
      ))}
    </div>
  );
}
