import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Earlier {
  label: string;
  id: string;
  content: string;
  createdAt: string;
}

// Запись из прошлого на главном экране. Только обычные записи, личные и тяжёлые не показываются.
export function EarlierCard() {
  const [entry, setEntry] = useState<Earlier | null>(null);

  useEffect(() => {
    void api
      .get<{ entry: Earlier | null }>("/week/earlier")
      .then((r) => setEntry(r.entry))
      .catch(() => {});
  }, []);

  if (!entry) return null;
  const date = new Date(entry.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const text = entry.content.length > 280 ? entry.content.slice(0, 280).trimEnd() + "…" : entry.content;
  return (
    <div className="card">
      <div className="card-title">{entry.label}</div>
      <p className="small" style={{ marginBottom: 8 }}>
        {date}
      </p>
      <p className="entry-text" style={{ margin: 0 }}>
        {text}
      </p>
    </div>
  );
}
