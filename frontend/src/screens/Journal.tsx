import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";
import { JournalComposer } from "../components/JournalComposer";
import { IconClose, IconEdit } from "../components/Icons";
import { WeekSummaryCard } from "../components/WeekSummaryCard";

interface Principle {
  id: string;
  content: string;
}

interface JournalEntry {
  id: string;
  content: string;
  createdAt: string;
  extractedPrinciples: Principle[];
  isPrivate?: boolean;
}

interface JournalPage {
  entries: JournalEntry[];
  hasMore: boolean;
  principles: Principle[];
}

const SEARCH_DELAY_MS = 350;
const MIN_QUERY = 2;

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

// Дневник: свободные записи — мысли, планы, траты, качества, к которым хочешь стремиться.
// Записи листаются по дням («Показать ещё») и ищутся по словам.
export function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestId = useRef(0); // чтобы ответ на устаревший поиск не затёр свежий

  const load = useCallback(async (q: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (q) params.set("q", q);
      const page = await api.get<JournalPage>(`/journal?${params.toString()}`);
      if (id !== requestId.current) return;
      setEntries(page.entries);
      setHasMore(page.hasMore);
      if (!q) setPrinciples(page.principles);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Поиск с задержкой: запрос уходит, когда человек перестал печатать, а не на каждую букву.
  useEffect(() => {
    const trimmed = query.trim();
    const effective = trimmed.length >= MIN_QUERY ? trimmed : "";
    const t = setTimeout(() => setActiveQuery(effective), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void load(activeQuery);
  }, [activeQuery, load]);

  async function showMore() {
    if (loadingMore || entries.length === 0) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "30", before: entries[entries.length - 1].createdAt });
      if (activeQuery) params.set("q", activeQuery);
      const page = await api.get<JournalPage>(`/journal?${params.toString()}`);
      setEntries((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function removeEntry(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.delete(`/journal/${id}`);
      hapticImpact("medium");
      await load(activeQuery);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditText(entry.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  // Правка текста НЕ перезапускает извлечение принципов (см. комментарий в
  // routes/journal.ts) — уже извлечённые принципы при редактировании записи остаются
  // как есть, их можно изменить/удалить отдельно на экране "Память".
  async function saveEdit(id: string) {
    if (!editText.trim() || busyId) return;
    setBusyId(id);
    try {
      await api.put(`/journal/${id}`, { content: editText });
      hapticNotification("success");
      setEditingId(null);
      await load(activeQuery);
    } finally {
      setBusyId(null);
    }
  }

  let lastDay = "";

  return (
    <div className="screen">
      <header className="page-header">
        <h2>Дневник</h2>
        <p>
          Пиши как в обычный дневник. AI предложит, что добавить в задачи и учёт, а ты подтвердишь.{" "}
          <Link to="/portrait">Портрет по дневнику</Link>
        </p>
      </header>

      <JournalComposer onSaved={() => load(activeQuery)} />

      <WeekSummaryCard />

      {principles.length > 0 && (
        <details className="card">
          <summary>Мои принципы ({principles.length})</summary>
          <div style={{ marginTop: 10 }}>
            {principles.map((p) => (
              <p key={p.id} style={{ color: "var(--text)", marginBottom: 6 }}>
                • {p.content}
              </p>
            ))}
          </div>
        </details>
      )}

      <input
        type="search"
        aria-label="Поиск по дневнику"
        placeholder="Поиск по записям"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {loading && entries.length === 0 && <p>Загрузка...</p>}
      {failed && (
        <div className="card">
          <p>Не удалось загрузить записи. Проверь соединение.</p>
          <button className="secondary" style={{ marginTop: 10 }} onClick={() => load(activeQuery)}>
            Повторить
          </button>
        </div>
      )}

      {entries.map((entry) => {
        const label = dayLabel(entry.createdAt);
        const showDay = label !== lastDay;
        lastDay = label;
        return (
          <div key={entry.id}>
            {showDay && <h3 className="day-heading">{label}</h3>}
            <div className="card">
              {editingId === entry.id ? (
                <>
                  <textarea rows={5} value={editText} onChange={(e) => setEditText(e.target.value)} style={{ marginBottom: 8 }} />
                  <div className="actions">
                    <button className="secondary" onClick={cancelEdit}>
                      Отмена
                    </button>
                    <button className="primary" onClick={() => saveEdit(entry.id)} disabled={busyId === entry.id}>
                      {busyId === entry.id ? "..." : "Сохранить"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <p className="entry-text" onClick={() => startEdit(entry)}>
                      {entry.content}
                    </p>
                    <div style={{ display: "flex", flexShrink: 0 }}>
                      <button className="icon-btn" onClick={() => startEdit(entry)} aria-label="изменить запись">
                        <IconEdit />
                      </button>
                      <button className="icon-btn" onClick={() => removeEntry(entry.id)} disabled={busyId === entry.id} aria-label="удалить запись">
                        <IconClose />
                      </button>
                    </div>
                  </div>
                  <p style={{ marginTop: 8, fontSize: 12 }}>
                    {entry.isPrivate ? "Личная · " : ""}
                    {new Date(entry.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}

      {!loading && !failed && entries.length === 0 && (
        <div className="card">
          <p>{activeQuery ? `Ничего не нашлось по запросу «${activeQuery}».` : "Пока пусто. Напиши первую запись выше."}</p>
        </div>
      )}

      {hasMore && (
        <button className="secondary" style={{ width: "100%" }} onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Загружаю..." : "Показать ещё"}
        </button>
      )}
    </div>
  );
}
