import { useEffect, useState } from "react";
import { api } from "../api/client";
import { formatNumber } from "../utils/format";

interface Row {
  category: string;
  limit: number;
  spent: number;
  percent: number;
}
interface State {
  limits: Row[];
  others: Array<{ category: string; spent: number }>;
}

// Месячный лимит по категориям. Без красных тревог: просто сколько потрачено и сколько осталось.
export function BudgetCard({ reloadKey }: { reloadKey: number }) {
  const [state, setState] = useState<State | null>(null);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setState(await api.get<State>("/budget"));
    } catch {
      /* карточка просто не покажется */
    }
  }

  useEffect(() => {
    void load();
  }, [reloadKey]);

  async function save(cat: string, value: string | number | null) {
    setError(null);
    try {
      setState(await api.put<State>("/budget", { category: cat, limit: value }));
      setCategory("");
      setLimit("");
    } catch {
      setError("Не удалось сохранить лимит. Проверь категорию и число.");
    }
  }

  function submit() {
    const n = parseFloat(limit.replace(",", "."));
    if (!category.trim() || !n || n <= 0) {
      setError("Укажи категорию и лимит больше нуля.");
      return;
    }
    void save(category, n);
  }

  if (!state) return null;
  return (
    <div className="card">
      <div className="card-title">Бюджет на месяц</div>
      {state.limits.length === 0 && (
        <p className="small" style={{ marginBottom: 10 }}>
          Задай лимит на категорию, например «Продукты», и приложение будет спокойно показывать, сколько уже потрачено.
        </p>
      )}
      {state.limits.map((r) => {
        const left = r.limit - r.spent;
        return (
          <div key={r.category} style={{ marginBottom: 12 }}>
            <div className="spread small">
              <span className="text">{r.category}</span>
              <span>
                {formatNumber(r.spent)} из {formatNumber(r.limit)} ({r.percent}%)
              </span>
            </div>
            <div className="progress" role="img" aria-label={`${r.category}: потрачено ${r.percent}% лимита`}>
              <span style={{ width: `${Math.min(100, r.percent)}%`, background: r.percent > 100 ? "var(--orange)" : undefined }} />
            </div>
            <div className="spread small" style={{ marginTop: 4 }}>
              <span style={{ color: r.percent > 100 ? "var(--orange)" : undefined }}>
                {left >= 0 ? `Осталось ${formatNumber(left)}` : `Сверх лимита на ${formatNumber(-left)}`}
              </span>
              <button className="icon-btn" aria-label={`убрать лимит: ${r.category}`} onClick={() => save(r.category, null)} style={{ minWidth: 32, minHeight: 32 }}>
                ×
              </button>
            </div>
          </div>
        );
      })}
      {state.others.length > 0 && (
        <p className="small" style={{ marginBottom: 10 }}>
          Без лимита: {state.others.slice(0, 5).map((o) => `${o.category} ${formatNumber(o.spent)}`).join(", ")}
        </p>
      )}
      <div className="field-row">
        <input aria-label="Категория лимита" placeholder="Категория" value={category} onChange={(e) => setCategory(e.target.value)} list="budget-cats" />
        <datalist id="budget-cats">
          {state.others.map((o) => (
            <option key={o.category} value={o.category} />
          ))}
        </datalist>
        <input
          aria-label="Лимит на месяц"
          inputMode="decimal"
          placeholder="Лимит"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: 110, flexShrink: 0 }}
        />
      </div>
      <button className="secondary mt" style={{ width: "100%" }} onClick={submit}>
        Задать лимит
      </button>
      {error && <p className="mt" style={{ color: "var(--orange)" }}>{error}</p>}
    </div>
  );
}
