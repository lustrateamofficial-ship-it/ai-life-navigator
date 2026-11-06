import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticImpact, hapticNotification } from "../telegram/sdk";
import { IconClose, IconEdit } from "../components/Icons";

interface Idea {
  id: string;
  content: string;
  createdAt: string;
}

export function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [query, setQuery] = useState("");
  const [newIdea, setNewIdea] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(q?: string) {
    setIdeas(await api.get<Idea[]>(`/ideas${q ? `?q=${encodeURIComponent(q)}` : ""}`));
  }

  useEffect(() => {
    load();
  }, []);

  async function addIdea() {
    if (!newIdea.trim() || adding) return; // защита от двойного сабмита на медленной сети
    setAdding(true);
    try {
      await api.post("/ideas", { content: newIdea });
      hapticNotification("success");
      setNewIdea("");
      await load(query);
    } finally {
      setAdding(false);
    }
  }

  async function removeIdea(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.delete(`/ideas/${id}`);
      hapticImpact("medium");
      await load(query);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(idea: Idea) {
    setEditingId(idea.id);
    setEditText(idea.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(id: string) {
    if (!editText.trim() || busyId) return;
    setBusyId(id);
    try {
      await api.put(`/ideas/${id}`, { content: editText });
      hapticNotification("success");
      setEditingId(null);
      await load(query);
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
        <h2>Идеи</h2>
        <p>Всё, что пришло в голову и что не хочется потерять</p>
      </header>

      <div className="card">
        <div className="field-row">
          <input
            aria-label="Новая идея"
            placeholder="Новая идея"
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addIdea()}
          />
          <button className="primary" onClick={addIdea} disabled={adding}>
            {adding ? "..." : "Добавить"}
          </button>
        </div>
      </div>

      <input
        type="search"
        aria-label="Поиск по идеям"
        placeholder="Поиск по идеям"
        value={query}
        style={{ marginBottom: 12 }}
        onChange={(e) => {
          setQuery(e.target.value);
          load(e.target.value);
        }}
      />

      {ideas.length === 0 && (
        <div className="card">
          <p className="empty">{query ? "Ничего не нашлось." : "Идей пока нет."}</p>
        </div>
      )}

      {ideas.map((idea) => (
        <div className="card" key={idea.id}>
          {editingId === idea.id ? (
            <>
              <textarea rows={3} aria-label="Текст" value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div className="actions">
                <button className="secondary" onClick={cancelEdit}>
                  Отмена
                </button>
                <button className="primary" onClick={() => saveEdit(idea.id)} disabled={busyId === idea.id}>
                  {busyId === idea.id ? "..." : "Сохранить"}
                </button>
              </div>
            </>
          ) : (
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <button className="list-main entry-text" onClick={() => startEdit(idea)}>
                {idea.content}
              </button>
              <button className="icon-btn" onClick={() => startEdit(idea)} aria-label="изменить">
                <IconEdit />
              </button>
              <button className="icon-btn" onClick={() => removeIdea(idea.id)} disabled={busyId === idea.id} aria-label="удалить">
                <IconClose />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
