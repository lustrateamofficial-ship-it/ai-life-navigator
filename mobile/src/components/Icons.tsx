// Небольшой набор значков: одинаковая толщина линии, цвет берётся из текста кнопки.
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconClose() {
  return (
    <svg {...base}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconEdit() {
  return (
    <svg {...base}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}


export function IconBell() {
  return (
    <svg {...base}>
      <path d="M6 8a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 14 6 8M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconUndo() {
  return (
    <svg {...base}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
