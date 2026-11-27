import { MissionLine } from "../components/MissionLine";
import { TileEditPage, EditButton, useTiles } from "../components/TileEditPage";
import { ME_SHORTCUTS, shortcutSpans } from "../../phone/homeLayout";
import { StreakCard } from "../components/StreakCard";
import { readStreak, streakEvent } from "../../phone/streak";
import { plural } from "../components/WeekDigest";
import { WeightSection } from "../components/WeightGoalCard";
import { formatNumber } from "../utils/format";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface WeightData {
  logs?: Array<{ date: string; weightKg: number }>;
  current: number | null;
  avg7d: number | null;
  avg30d: number | null;
}

type Section = "weight" | "streak";

function Ic({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const MORE: Record<string, { to: string; label: string; d: string }> = {
  habits: { to: "/habits", label: "Привычки", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 9.5" },
  finance: { to: "/finance", label: "Финансы", d: "M3 7h18v12H3zM3 11h18M16 15h2" },
  ideas: { to: "/ideas", label: "Идеи", d: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z" },
  memory: { to: "/memory", label: "Память", d: "M4 5h16v14H4zM8 9h8M8 13h5" },
  "mission-page": { to: "/mission", label: "Моя миссия", d: "M5 21V4M5 4h11l-2 4 2 4H5" },
  analytics: { to: "/analytics", label: "Аналитика", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  trash: { to: "/trash", label: "Корзина", d: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" },
};

export function Me() {
  const [editing, setEditing] = useState(false);
  const [tiles] = useTiles("me");
  const [focusTick, setFocusTick] = useState(0);
  const [section, setSectionRaw] = useState<Section>("weight");
  const setSection = (x: Section) => setSectionRaw(x);
  const [streak, setStreak] = useState(() => readStreak());
  useEffect(() => {
    const on = () => setStreak(readStreak());
    window.addEventListener(streakEvent, on);
    return () => window.removeEventListener(streakEvent, on);
  }, []);
  const [weight, setWeight] = useState<WeightData | null>(null);

  async function loadAll() {
    setWeight(await api.get<WeightData>("/health/weight"));
  }

  useEffect(() => {
    loadAll();
  }, []);

  // «+» → «Вес» открывает этот экран со ссылкой #/me?weigh=1: показываем вес и ставим курсор в поле.
  useEffect(() => {
    const check = () => {
      if (!window.location.hash.includes("weigh=1")) return;
      setSection("weight");
      setFocusTick((t) => t + 1);
      window.history.replaceState(null, "", "#/me");
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  if (editing) return <TileEditPage screen="me" onDone={() => setEditing(false)} />;

  // Ярлыки разделов, идущие подряд, собираются в одну сетку; последний неполный ряд растягивается, пустых мест нет.
  const parts: JSX.Element[] = [];
  let group: string[] = [];
  let shownHeading = false;
  const flush = () => {
    if (!group.length) return;
    const sp = shortcutSpans(group.length);
    const first = !shownHeading;
    shownHeading = true;
    parts.push(
      <div key={`g-${parts.length}`}>
        {first && (
          <div className="settings-group" style={{ marginTop: 26 }}>
            <h3>Разделы</h3>
          </div>
        )}
        <nav className="more-grid" aria-label="Другие разделы">
          {group.map((id, i) => {
            const m = MORE[id]!;
            return (
              <Link key={id} className="more-item" to={m.to} style={{ gridColumn: `span ${sp[i]}` }}>
                <span className="sheet-ic">
                  <Ic d={m.d} />
                </span>
                <span>{m.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
    group = [];
  };
  for (const id of tiles) {
    if (ME_SHORTCUTS.has(id)) {
      group.push(id);
      continue;
    }
    flush();
    if (id === "mission") parts.push(<MissionLine key="mission" />);
    if (id === "stats")
      parts.push(
        <div key="stats">
          <div className="tile-grid" role="group" aria-label="Раздел">
            <button className={`tile ${section === "weight" ? "active" : ""}`} aria-pressed={section === "weight"} onClick={() => setSection("weight")}>
              <Ic d="M4 12h4l2-6 4 12 2-6h4" />
              <span className="tile-label">Вес</span>
              <b>{weight?.current ? `${formatNumber(weight.current)} кг` : "—"}</b>
            </button>
            <button className={`tile ${section === "streak" ? "active" : ""}`} aria-pressed={section === "streak"} onClick={() => setSection("streak")}>
              <Ic d="M12 3c1 3 4 4.500 4 8.500a4 4 0 0 1-8 0c0-1.500.5-2.500 1.500-3.500C9.500 10 10 8 12 3z" />
              <span className="tile-label">Серия</span>
              <b>{streak > 0 ? `${streak} ${plural(streak, "день", "дня", "дней")}` : "нет"}</b>
            </button>
          </div>
          {section === "streak" && <StreakCard />}
          {section === "weight" && <WeightSection weight={weight} onChanged={loadAll} focusTick={focusTick} />}
        </div>
      );
  }
  flush();

  return (
    <div className="screen">
      <header className="page-header page-header-row">
        <div>
          <h2>Я</h2>
          <p>Вес, серия дней и всё остальное</p>
        </div>
        <div className="header-actions">
          <EditButton onClick={() => setEditing(true)} />
          <Link className="icon-btn" to="/settings" aria-label="Настройки">
            <Ic d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 1 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z" />
          </Link>
        </div>
      </header>

      {parts}
      {tiles.length === 0 && <p className="custom-hint">Все плитки выключены. Нажми карандаш сверху и выбери, что показывать.</p>}
    </div>
  );
}
