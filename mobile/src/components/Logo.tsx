// Знак приложения «Выход»: кольцо с разрывом, через него выходит стрелка.
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size, borderRadius: size * 0.23 }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size * 0.66} height={size * 0.66} fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M56 31.2 A24 24 0 1 1 32.8 8" />
        <path d="M28 36 L54 10 M42 10 H54 V22" />
      </svg>
    </span>
  );
}
