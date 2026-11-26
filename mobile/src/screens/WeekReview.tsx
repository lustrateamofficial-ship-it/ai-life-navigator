import { Link } from "react-router-dom";
import { DriftLine } from "../components/DriftLine";
import { StreakCard } from "../components/StreakCard";
import { WeekDigest } from "../components/WeekDigest";
import { WeekTile } from "../components/WeekTile";
import { WeightTile } from "../components/WeightTile";

// «Итоги недели»: живые цифры за последние семь дней. Сюда ведёт воскресное уведомление и плашка на «Сегодня».
export function WeekReview() {
  return (
    <div className="screen">
      <header className="page-header">
        <h2>Итоги недели</h2>
        <p>Последние семь дней, всё считается на телефоне</p>
      </header>
      <div className="home-grid">
        <div className="full">
          <WeekTile />
        </div>
        <div className="full">
          <WeightTile />
        </div>
      </div>
      <WeekDigest />
      <DriftLine />
      <StreakCard />
      <div className="card">
        <div className="card-title">Итоги по записям</div>
        <p className="small" style={{ marginBottom: 10 }}>Короткий пересказ недели с цитатами из дневника делается в разделе «Дневник».</p>
        <Link className="primary-link" to="/journal">Открыть дневник</Link>
      </div>
    </div>
  );
}
