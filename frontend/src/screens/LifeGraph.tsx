import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface GraphNode {
  id: string;
  type: "mission" | "goal" | "stage" | "task" | "habit" | "health";
  label: string;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  from: string;
  to: string;
}

const TYPE_COLOR: Record<string, string> = {
  mission: "var(--accent)",
  goal: "var(--green)",
  stage: "var(--orange)",
  task: "var(--text-muted)",
  habit: "var(--red)",
  health: "#8b7cf6",
};

// Русские подписи для легенды — ключи объекта остаются английскими (это внутренние
// типы из API), но на экране пользователь не должен видеть ни одного английского слова.
const TYPE_LABEL_RU: Record<string, string> = {
  mission: "миссия",
  goal: "цель",
  stage: "этап",
  task: "задача",
  habit: "привычка",
  health: "здоровье",
};

const NODE_RADIUS = 6;
const ROW_HEIGHT = 90;
const COL_GAP = 130;

// Карта жизни: простая раскладка по рядам (миссия, цель, этап, задача) и отдельные ряды
// для привычек и здоровья — это упрощение полного силового графа, но честно отражает реальные связи из БД.
export function LifeGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // БАГ (найден при повторном аудите): без .catch()/.finally() сбой запроса оставлял
    // бы экран на "Строю граф..." навсегда — setLoading(false) стоял только внутри
    // .then(), который при ошибке просто не выполнился бы. Тот же класс бага, что
    // был в Portrait.tsx и Settings.tsx.
    api
      .get<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/life-graph")
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .catch(() => {
        // Сбой — просто покажем пустое состояние ("нечего показывать") вместо
        // зависшего спиннера; пользователь всегда может вернуться на экран позже.
      })
      .finally(() => setLoading(false));
  }, []);

  const rows: Record<GraphNode["type"], GraphNode[]> = {
    mission: [],
    goal: [],
    stage: [],
    task: [],
    habit: [],
    health: [],
  };
  for (const n of nodes) rows[n.type].push(n);

  const rowOrder: GraphNode["type"][] = ["mission", "goal", "stage", "task"];
  const sideRowOrder: GraphNode["type"][] = ["habit", "health"];

  const positions = new Map<string, { x: number; y: number }>();
  let maxWidth = 320;

  rowOrder.forEach((type, rowIndex) => {
    const items = rows[type];
    const width = Math.max(320, items.length * COL_GAP);
    maxWidth = Math.max(maxWidth, width);
    items.forEach((n, i) => {
      const x = items.length === 1 ? width / 2 : (i + 0.5) * (width / items.length);
      positions.set(n.id, { x, y: rowIndex * ROW_HEIGHT + 40 });
    });
  });

  const sideStartY = rowOrder.length * ROW_HEIGHT + 60;
  sideRowOrder.forEach((type, rowIndex) => {
    const items = rows[type];
    items.forEach((n, i) => {
      positions.set(n.id, { x: (i + 0.5) * COL_GAP, y: sideStartY + rowIndex * ROW_HEIGHT });
    });
  });

  const svgHeight = sideStartY + sideRowOrder.length * ROW_HEIGHT + 40;

  return (
    <div className="screen">
      <Link className="back-link" to="/analytics">
        ← Аналитика
      </Link>
      <header className="page-header">
        <h2>Карта жизни</h2>
        <p>Связи между миссией, целями, этапами и задачами.</p>
      </header>

      {loading && <p>Строю карту...</p>}

      {!loading && nodes.length === 0 && (
        <div className="card">
          <p className="empty">Пока нечего показывать. Создай цель, и она появится здесь.</p>
        </div>
      )}

      {!loading && nodes.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <svg width={Math.max(maxWidth, 320)} height={svgHeight} role="img" aria-label="Карта связей">
            {edges.map((e, i) => {
              const from = positions.get(e.from);
              const to = positions.get(e.to);
              if (!from || !to) return null;
              return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--border)" strokeWidth={1.5} />;
            })}

            {nodes.map((n) => {
              const pos = positions.get(n.id);
              if (!pos) return null;
              return (
                <g key={n.id}>
                  <circle cx={pos.x} cy={pos.y} r={NODE_RADIUS} fill={TYPE_COLOR[n.type]} />
                  <text x={pos.x} y={pos.y + 20} fontSize={11} fill="var(--text-muted)" textAnchor="middle">
                    {n.label.length > 16 ? `${n.label.slice(0, 14)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="card">
        <div className="card-title">Обозначения</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(TYPE_COLOR).map(([type, color]) => (
            <span key={type} className="pill">
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
              {TYPE_LABEL_RU[type] ?? type}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
