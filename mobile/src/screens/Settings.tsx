import { useState } from "react";
import { Link } from "react-router-dom";
import { GroupFold } from "./settings/GroupFold";
import { DaySection } from "./settings/DaySection";
import { HomeSection } from "./settings/HomeSection";
import { AiSection } from "./settings/AiSection";
import { AppSection } from "./settings/AppSection";
import { DataSection } from "./settings/DataSection";
import { SafetySection } from "./settings/SafetySection";

// Экран «Настройки»: только оболочка. Каждый раздел живёт в своём файле в папке settings/ и сам хранит своё состояние.
export function Settings() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Настройки</h2>
      </header>

      {notice && (
        <div className="card notice" role="status">
          <p>{notice}</p>
          <button className="small-btn" onClick={() => setNotice(null)}>
            Понятно
          </button>
        </div>
      )}

      <GroupFold id="day" title="Мой день" hint="Утро и вечер, напоминания и время">
        <DaySection notify={setNotice} />
      </GroupFold>

      <GroupFold id="home" title="Плитки главного экрана" hint="Что показывать и в каком порядке">
        <HomeSection />
      </GroupFold>

      <GroupFold id="ai" title="Умный помощник" hint="Ключи ИИ и очередь сервисов">
        <AiSection />
      </GroupFold>

      <GroupFold id="app" title="Приложение" hint="Вид, быстрая запись, обновления">
        <AppSection notify={setNotice} />
      </GroupFold>

      <GroupFold id="data" title="Данные" hint="Копии, восстановление и дневник-книга">
        <DataSection notify={setNotice} />
      </GroupFold>

      <GroupFold id="safety" title="Защита и удаление" hint="Пароль, приватность и стирание данных">
        <SafetySection notify={setNotice} />
      </GroupFold>
    </div>
  );
}
