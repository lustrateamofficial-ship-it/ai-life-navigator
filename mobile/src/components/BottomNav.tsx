import { useState } from "react";
import { usePath } from "react-router-dom";
import { AddSheet } from "./AddSheet";

// Раздел 6: главная нижняя навигация — ровно 5 пунктов, не выводить 10-12 разделов на главный экран.
// Дневник — основа приложения, поэтому у него своё место в навигации; «Аналитика» переехала
// на экран «Я», где лежат остальные вторичные разделы.
// Иконки — единый набор линейных SVG вместо эмодзи: эмодзи выглядят по-разному на iOS, Android и
// десктопе, а линейные иконки одной толщины окрашиваются цветом активного пункта.
const ICONS: Record<string, JSX.Element> = {
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </>
  ),
  journal: (
    <>
      <path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5V19c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5z" />
      <path d="M12 6v13.5" />
    </>
  ),
  tasks: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
};

// own: экраны, которые считаются частью раздела (подсвечивается тот раздел, откуда человек пришёл).
const ITEMS = [
  { to: "/", icon: "home", label: "Сегодня", own: ["/", "/week-review"] },
  { to: "/journal", icon: "journal", label: "Дневник", own: ["/journal"] },
  { to: "/plans", icon: "tasks", label: "Планы", own: ["/plans", "/plan-tomorrow"] },
  { to: "/me", icon: "me", label: "Я", own: ["/me", "/habits", "/finance", "/ideas", "/memory", "/mission", "/analytics", "/trash", "/settings", "/portrait"] },
];

function Item({ item }: { item: (typeof ITEMS)[number] }) {
  const path = usePath();
  // Неизвестный адрес показывает «Сегодня», поэтому и подсвечивается он.
  const known = ITEMS.some((i) => i.own.includes(path));
  const active = item.own.includes(path) || (item.to === "/" && !known);
  return (
    <a
      href={`#${item.to}`}
      onClick={(e) => {
        e.preventDefault();
        window.location.hash = item.to;
      }}
      className={`nav-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[item.icon]}
      </svg>
      <span>{item.label}</span>
    </a>
  );
}

// Четыре раздела и по центру кнопка «+» для быстрого добавления.
export function BottomNav() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <nav className="bottom-nav" aria-label="Основная навигация">
        <Item item={ITEMS[0]!} />
        <Item item={ITEMS[1]!} />
        <button className="nav-fab" aria-label="Создать" aria-haspopup="dialog" onClick={() => setAdding(true)}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <Item item={ITEMS[2]!} />
        <Item item={ITEMS[3]!} />
      </nav>
      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </>
  );
}
