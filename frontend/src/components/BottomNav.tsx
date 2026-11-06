import { NavLink } from "react-router-dom";

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

const ITEMS = [
  { to: "/", icon: "home", label: "Сегодня" },
  { to: "/journal", icon: "journal", label: "Дневник" },
  { to: "/tasks", icon: "tasks", label: "Задачи" },
  { to: "/goals", icon: "goals", label: "Цели" },
  { to: "/me", icon: "me", label: "Я" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <svg
            className="nav-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[item.icon]}
          </svg>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
