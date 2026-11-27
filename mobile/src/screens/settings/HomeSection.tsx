import { useState } from "react";
import { SCREENS, type ScreenId } from "../../../phone/homeLayout";
import { TileEditor } from "../../components/TileEditor";
import { useTiles } from "../../components/TileEditPage";

// Плитки экранов: что показывать и в каком порядке. Свой набор для каждого экрана, без привязки ко времени суток.
export function HomeSection() {
  const [screen, setScreen] = useState<ScreenId>("today");
  const [ids, setIds] = useTiles(screen);
  return (
    <div className="home-section">
      <div className="seg-tabs" role="tablist" aria-label="Экран">
        {SCREENS.map((s) => (
          <button key={s.id} role="tab" aria-selected={screen === s.id} className={screen === s.id ? "active" : ""} onClick={() => setScreen(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="custom-hint">Включай нужное и меняй порядок: тяни за точки слева. Маленькие плитки («½») встают по две в ряд, а одинокая сама растягивается на всю ширину, пустого места не остаётся.</p>
      <TileEditor key={screen} screen={screen} ids={ids} onChange={setIds} />
    </div>
  );
}
