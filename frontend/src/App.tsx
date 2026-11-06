import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { initTelegramApp } from "./telegram/sdk";
import { api } from "./api/client";
import { BottomNav } from "./components/BottomNav";
import { Onboarding } from "./screens/Onboarding";
import { Today } from "./screens/Today";
import { Goals } from "./screens/Goals";
import { Tasks } from "./screens/Tasks";
import { Me } from "./screens/Me";
import { Analytics } from "./screens/Analytics";
import { Calendar } from "./screens/Calendar";
import { Reminders } from "./screens/Reminders";
import { Ideas } from "./screens/Ideas";
import { Memory } from "./screens/Memory";
import { Journal } from "./screens/Journal";
import { Portrait } from "./screens/Portrait";
import { Settings } from "./screens/Settings";
import { Mission } from "./screens/Mission";
import { AppLock } from "./components/AppLock";
import { Reports } from "./screens/Reports";
import { Correlations } from "./screens/Correlations";
import { LifeGraph } from "./screens/LifeGraph";

type AuthState = "loading" | "onboarding" | "ready" | "error";

export function App() {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    initTelegramApp();
    // /auth/me триггерит upsert пользователя на backend (см. middleware/auth.ts)
    // и возвращает профиль, по которому решаем — показывать онбординг или нет.
    api
      .get<{ profile: { onboardingDone: boolean } | null }>("/auth/me")
      .then((user) => setState(user.profile?.onboardingDone ? "ready" : "onboarding"))
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") {
    return (
      <div className="screen">
        <p>Загрузка...</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="screen">
        <h2>Не удалось подключиться</h2>
        <p>
          Проверьте, что приложение открыто внутри Telegram и backend доступен по адресу из
          VITE_API_URL.
        </p>
      </div>
    );
  }

  if (state === "onboarding") {
    return <Onboarding onDone={() => setState("ready")} />;
  }

  return (
    <AppLock>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/me" element={<Me />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/ideas" element={<Ideas />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/portrait" element={<Portrait />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/mission" element={<Mission />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/correlations" element={<Correlations />} />
        <Route path="/life-graph" element={<LifeGraph />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
      <BottomNav />
    </HashRouter>
    </AppLock>
  );
}
