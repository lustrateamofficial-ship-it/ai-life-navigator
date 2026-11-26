import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface MissionData {
  desiredLife?: string;
  whatToAchieve?: string;
  whoToBecome?: string;
}

const short = (t: string) => (t.length > 110 ? t.slice(0, 107).trimEnd() + "…" : t);

// Одна строка в «Я»: миссия, которую ИИ учитывает во всех советах. Если миссии нет, подсказка, как её написать.
export function MissionLine() {
  const [m, setM] = useState<MissionData | null | undefined>(undefined);
  useEffect(() => {
    api
      .get<MissionData | null>("/mission")
      .then(setM)
      .catch(() => setM(null));
  }, []);
  if (m === undefined) return null;
  const text = (m?.whatToAchieve || m?.desiredLife || m?.whoToBecome || "").trim();
  return (
    <Link className="card mission-line" id="mission-line" to="/mission">
      <div className="card-title">Моя миссия</div>
      {text ? (
        <p className="small">{short(text)} <span className="mission-hint">ИИ учитывает её в советах</span></p>
      ) : (
        <p className="small">Напиши одну-две фразы о том, к чему идёшь: ИИ будет учитывать это в советах.</p>
      )}
    </Link>
  );
}
