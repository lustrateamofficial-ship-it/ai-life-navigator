import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface Correlation {
  id: string;
  metricA: string;
  metricB: string;
  strength: number;
  observations: number;
  description: string;
}

export function Correlations() {
  const [items, setItems] = useState<Correlation[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Correlation[]>("/correlations")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="screen">
      <Link className="back-link" to="/analytics">
        ← Аналитика
      </Link>
      <header className="page-header">
        <h2>Закономерности</h2>
        <p>Найденные связи между твоими данными. Это не доказанная причина, а только наблюдения.</p>
      </header>

      {loading && <p>Ищу закономерности...</p>}

      {!loading && items?.length === 0 && (
        <div className="card">
          <p className="empty">Пока мало данных для закономерностей. Продолжай вести дневник, задачи, вес и траты.</p>
        </div>
      )}

      {items?.map((c) => (
        <div className="card" key={c.id}>
          <p className="text">{c.description}</p>
          <p className="small mt">
            Сила связи: {c.strength} · наблюдений: {c.observations}
          </p>
        </div>
      ))}
    </div>
  );
}
