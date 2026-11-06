import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticNotification } from "../platform/sdk";

interface Item {
  id: string;
  kind: string;
  label: string;
  deletedAt: string;
  daysLeft: number;
}

function daysWord(n: number) {
  const a = n % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return "дней";
  if (b === 1) return "день";
  if (b > 1 && b < 5) return "дня";
  return "дней";
}

// Корзина: удалённое хранится 30 дней и возвращается одним нажатием.
export function Trash() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await api.get<Item[]>("/trash"));
    } catch {
      setItems([]);
      setNote("Не удалось открыть корзину.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(id: string) {
    if (busy) return;
    setBusy(id);
    setNote(null);
    try {
      const r = await api.post<{ restored: boolean; note?: string }>(`/trash/${id}/restore`, {});
      hapticNotification("success");
      setNote(r.restored ? "Возвращено." : r.note ?? "Уже на месте.");
      await load();
    } catch {
      setNote("Не удалось вернуть. Попробуй ещё раз.");
    } finally {
      setBusy(null);
    }
  }

  async function purge(id: string) {
    if (busy || !window.confirm("Удалить насовсем?\nЭто нельзя отменить.")) return;
    setBusy(id);
    try {
      await api.delete(`/trash/${id}`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function empty() {
    if (busy || !window.confirm("Очистить корзину?\nВсё в ней будет удалено насовсем.")) return;
    setBusy("all");
    try {
      await api.delete("/trash");
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen">
      <Link to="/me" className="back-link">← Я</Link>
      <header className="page-header">
        <h2>Корзина</h2>
        <p>Удалённое хранится 30 дней, потом исчезает само.</p>
      </header>

      {note && (
        <div className="card" role="status">
          <p style={{ color: "var(--text)" }}>{note}</p>
        </div>
      )}

      <div className="card">
        {items === null && <p className="empty">Загружаю...</p>}
        {items?.length === 0 && <p className="empty">Корзина пуста.</p>}
        {items?.map((i) => (
          <div className="task-row" key={i.id} style={{ alignItems: "flex-start" }}>
            <span style={{ flex: 1 }}>
              <span className="small" style={{ display: "block" }}>
                {i.kind}. Осталось {i.daysLeft} {daysWord(i.daysLeft)}
              </span>
              {i.label}
            </span>
            <button className="secondary" style={{ width: "auto", padding: "0 12px" }} onClick={() => restore(i.id)} disabled={busy !== null}>
              Вернуть
            </button>
            <button className="icon-btn" aria-label="удалить насовсем" onClick={() => purge(i.id)} disabled={busy !== null}>
              ×
            </button>
          </div>
        ))}
      </div>

      {items && items.length > 0 && (
        <button className="secondary" style={{ width: "100%" }} onClick={empty} disabled={busy !== null}>
          Очистить корзину
        </button>
      )}
    </div>
  );
}
