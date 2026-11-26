import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

// Строка «неделя ушла от цели»: если почти все закрытые за две недели задачи не связаны ни с одной целью.
// Раньше этот сигнал был виден только внутри «Аналитики».
export function DriftLine() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    api
      .get<{ drift?: { driftDetected: boolean; message: string | null } }>("/analytics")
      .then((a) => {
        if (!off && a.drift?.driftDetected && a.drift.message) setMessage(a.drift.message);
      })
      .catch(() => {
        /* без сигнала: строка просто не показывается */
      });
    return () => {
      off = true;
    };
  }, []);
  if (!message) return null;
  return (
    <div className="card drift-line" role="note">
      <div className="card-title">Задачи уходят от цели</div>
      <p className="small">{message}</p>
      <Link className="primary-link" to="/plans?tab=goals">Открыть цели</Link>
    </div>
  );
}
