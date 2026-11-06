import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";
import { IconClose, IconEdit } from "../components/Icons";

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  fact: "Факт",
  goal_context: "Контекст цели",
  history: "История",
  observation: "Наблюдение",
  principle: "Принцип (из дневника)",
};

export function Memory() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [newFact, setNewFact] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; content: string; type: string; score: number }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setItems(await api.get<MemoryItem[]>("/memory"));
  }

  useEffect(() => {
    load();
  }, []);

  // Раздел 37: Semantic Memory — поиск по смыслу, а не по точному совпадению слов.
  async function search() {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await api.get<Array<{ id: string; content: string; type: string; score: number }>>(
        `/memory/search?q=${encodeURIComponent(query)}`
      );
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }

  // Раздел 21: "Запомни, что..." — пользователь вводит произвольный факт,
  // сохраняется как type=fact. Более тонкая классификация — задача AI-слоя (Этап 7).
  async function saveFact() {
    if (!newFact.trim() || adding) return;
    setAdding(true);
    try {
      await api.post("/memory", { type: "fact", content: newFact });
      hapticNotification("success");
      setNewFact("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.delete(`/memory/${id}`);
      hapticImpact("medium");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(item: MemoryItem) {
    setEditingId(item.id);
    setEditText(item.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  // "Слияние" двух похожих записей на практике — это отредактировать одну, объединив
  // в ней суть обеих, и удалить вторую; отдельный мультивыбор для этого не нужен —
  // редактирование + удаление уже полностью закрывают этот сценарий.
  async function saveEdit(id: string) {
    if (!editText.trim() || busyId) return;
    setBusyId(id);
    try {
      await api.put(`/memory/${id}`, { content: editText });
      hapticNotification("success");
      setEditingId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Память</h2>
        <p>То, что AI знает и учитывает о тебе. Всё можно изменить или удалить.</p>
      </header>

      <div className="card">
        <div className="card-title">Запомнить</div>
        <div className="field-row">
          <input
            aria-label="Что запомнить"
            placeholder="Например: я не ем после восьми вечера"
            value={newFact}
            onChange={(e) => setNewFact(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveFact()}
          />
          <button className="primary" onClick={saveFact} disabled={adding}>
            {adding ? "..." : "Запомнить"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Что ты знаешь обо мне?</div>
        <div className="field-row">
          <input
            aria-label="Вопрос к памяти"
            placeholder="Например: что я говорил про работу?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="primary" onClick={search} disabled={searching}>
            {searching ? "..." : "Найти"}
          </button>
        </div>
        {searchResults && (
          <div className="mt">
            {searchResults.length === 0 && <p>Ничего не нашлось.</p>}
            {searchResults.map((r) => (
              <p key={r.id} className="text" style={{ marginBottom: 6 }}>
                {r.content}
              </p>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="card">
          <p className="empty">Пока ничего не сохранено.</p>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id}>
          <h3 className="day-heading">{TYPE_LABEL[item.type] ?? item.type}</h3>
        <div className="card" >
          {editingId === item.id ? (
            <>
              <textarea rows={3} aria-label="Текст" value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div className="actions">
                <button className="secondary" onClick={cancelEdit}>
                  Отмена
                </button>
                <button className="primary" onClick={() => saveEdit(item.id)} disabled={busyId === item.id}>
                  {busyId === item.id ? "..." : "Сохранить"}
                </button>
              </div>
            </>
          ) : (
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <button className="list-main entry-text" onClick={() => startEdit(item)}>
                {item.content}
              </button>
              <button className="icon-btn" onClick={() => startEdit(item)} aria-label="изменить">
                <IconEdit />
              </button>
              <button className="icon-btn" onClick={() => removeItem(item.id)} disabled={busyId === item.id} aria-label="удалить">
                <IconClose />
              </button>
            </div>
          )}
        </div>
        </div>
      ))}
    </div>
  );
}
