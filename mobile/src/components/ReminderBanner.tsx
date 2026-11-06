import { useEffect, useState } from "react";
import { REMINDER_EVENT } from "../../shim/reminderRunner";
import { hapticNotification } from "../platform/sdk";

// Плашка сверху: показывается, когда сработало напоминание, а приложение открыто.
export function ReminderBanner() {
  const [titles, setTitles] = useState<string[]>([]);

  useEffect(() => {
    const onReminder = (e: Event) => {
      const title = (e as CustomEvent).detail?.title as string;
      if (!title) return;
      hapticNotification("warning");
      setTitles((prev) => [...prev, title]);
    };
    window.addEventListener(REMINDER_EVENT, onReminder);
    return () => window.removeEventListener(REMINDER_EVENT, onReminder);
  }, []);

  if (titles.length === 0) return null;

  return (
    <div className="reminder-banner" role="alert">
      <div style={{ flex: 1 }}>
        <div className="card-title" style={{ marginBottom: 2 }}>
          Напоминание
        </div>
        {titles.map((t, i) => (
          <p key={i} className="text">
            {t}
          </p>
        ))}
      </div>
      <button className="small-btn" onClick={() => setTitles([])}>
        Понятно
      </button>
    </div>
  );
}
