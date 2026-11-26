import { useEffect, useState } from "react";
import { TOAST_EVENT } from "../../phone/feedback";

// Короткая подпись над нижней панелью: «Вес записан», «Задача выполнена». Читается и экранными программами.
export function Toast() {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    let timer = 0;
    const onToast = (e: Event) => {
      const text = String((e as CustomEvent).detail ?? "");
      if (!text) return;
      setMsg({ id: Date.now(), text });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2200);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {msg && (
        <div className="toast" key={msg.id}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
