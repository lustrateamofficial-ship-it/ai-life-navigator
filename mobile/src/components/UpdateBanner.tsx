import { useEffect, useState } from "react";
import { flushNow } from "../../shim/prisma";

// В браузере новая версия подхватывается в фоне; чтобы она заработала, страницу надо перезапустить.
// Плашка предлагает сделать это, сначала записав всё на диск.
export function UpdateBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener("navigator:update-ready", on);
    return () => window.removeEventListener("navigator:update-ready", on);
  }, []);
  if (!show) return null;
  return (
    <div role="status" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "calc(10px + env(safe-area-inset-top, 0px)) 16px 10px", background: "var(--accent, #2563eb)", color: "#fff", display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ flex: 1 }}>Вышла новая версия приложения</span>
      <button type="button" style={{ background: "#fff", color: "#1d4ed8", borderRadius: 8, padding: "6px 12px", minHeight: 36 }} onClick={async () => { await flushNow().catch(() => {}); window.location.reload(); }}>
        Обновить
      </button>
    </div>
  );
}
