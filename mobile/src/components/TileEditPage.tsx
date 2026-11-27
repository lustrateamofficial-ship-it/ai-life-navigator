import { useEffect, useState } from "react";
import { SCREENS, readTiles, writeTiles, type ScreenId } from "../../phone/homeLayout";
import { TileEditor } from "./TileEditor";

// Набор плиток одного экрана: читается из памяти телефона и обновляется, когда его меняют в другом месте (например, в «Настройках»).
export function useTiles(screen: ScreenId): [string[], (next: string[]) => void] {
  const [ids, setIds] = useState<string[]>(() => readTiles(screen));
  useEffect(() => {
    const sync = () => setIds(readTiles(screen));
    window.addEventListener("navigator:home-layout", sync);
    return () => window.removeEventListener("navigator:home-layout", sync);
  }, [screen]);
  return [ids, (next) => (setIds(next), writeTiles(screen, next))];
}

// Кнопка-карандаш в шапке экрана: открывает настройку плиток именно этого экрана.
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-btn" aria-label="Настроить экран" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
        <path d="M14 7l3 3" />
      </svg>
    </button>
  );
}

// Режим «Настроить» на самом экране: вместо содержимого показывается редактор плиток этого экрана.
export function TileEditPage({ screen, onDone }: { screen: ScreenId; onDone: () => void }) {
  const [ids, setIds] = useTiles(screen);
  const title = SCREENS.find((s) => s.id === screen)!.title;
  return (
    <div className="screen">
      <div className="custom-top">
        <h2>Настроить: {title}</h2>
        <button className="primary compact" onClick={onDone}>
          Готово
        </button>
      </div>
      <p className="custom-hint">Включай нужное и меняй порядок: тяни за точки слева. То же самое можно сделать в «Настройках».</p>
      <TileEditor screen={screen} ids={ids} onChange={setIds} />
    </div>
  );
}
