import { useEffect, useState } from "react";
import { HomeCustomize } from "../../components/HomeCustomize";
import { periodAt, readLayout, writeLayout, type Layout, type Period } from "../../../phone/homeLayout";

// Плитки главного экрана: какие показывать и в каком порядке, отдельно для утра, дня и вечера.
export function HomeSection() {
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [period, setPeriod] = useState<Period>(periodAt());

  useEffect(() => {
    const sync = () => setLayout(readLayout());
    window.addEventListener("navigator:home-layout", sync);
    return () => window.removeEventListener("navigator:home-layout", sync);
  }, []);

  return (
    <div className="home-section">
      <HomeCustomize
        embedded
        layout={layout}
        period={period}
        onPeriod={setPeriod}
        onChange={(l) => {
          setLayout(l);
          writeLayout(l);
        }}
      />
    </div>
  );
}
