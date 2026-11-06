import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { initTelegramApp } from "./platform/sdk";
import { api } from "./api/client";
import { BottomNav } from "./components/BottomNav";
import { Onboarding } from "./screens/Onboarding";
import { Today } from "./screens/Today";
import { Me } from "./screens/Me";
import { Analytics } from "./screens/Analytics";
import { Calendar } from "./screens/Calendar";
import { Plans } from "./screens/Plans";
import { PlanTomorrow } from "./screens/PlanTomorrow";
import { Navigate } from "react-router-dom";
import { Ideas } from "./screens/Ideas";
import { Memory } from "./screens/Memory";
import { Journal } from "./screens/Journal";
import { Portrait } from "./screens/Portrait";
import { Settings } from "./screens/Settings";
import { Trash } from "./screens/Trash";
import { Mission } from "./screens/Mission";
import { AppLock } from "./components/AppLock";
import { ReminderBanner } from "./components/ReminderBanner";
import { Reports } from "./screens/Reports";
import { Correlations } from "./screens/Correlations";
import { LifeGraph } from "./screens/LifeGraph";
import { Frozen } from "./screens/Frozen";
import { getFrozenInfo } from "../shim/safety";
import { UpdateBanner } from "./components/UpdateBanner";

type AuthState = "loading" | "onboarding" | "ready" | "error" | "frozen";

export function App() {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    initTelegramApp();
    // Читаем профиль из локального хранилища: по нему решаем, показывать ли знакомство.
    api
      .get<{ profile: { onboardingDone: boolean } | null }>("/auth/me")
      .then((user) => setState(user.profile?.onboardingDone ? "ready" : "onboarding"))
      .catch((e) => { console.error("Ошибка запуска", e instanceof Error ? e.stack : e); setState(getFrozenInfo() ? "frozen" : "error"); });
  }, []);

  if (state === "loading") {
    return (
      <div className="screen">
        <p>Загрузка...</p>
      </div>
    );
  }

  if (state === "frozen") return <Frozen />;

  if (state === "error") {
    return (
      <div className="screen">
        <h2>Не удалось открыть данные</h2>
        <p>
          Хранилище на телефоне недоступно. Закрой приложение и открой его снова. Если окно браузера было приватным, открой
          приложение в обычном окне.
        </p>
      </div>
    );
  }

  if (state === "onboarding") {
    return <Onboarding onDone={() => setState("ready")} />;
  }

  return (
    <AppLock>
    <UpdateBanner />
    <HashRouter>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/plan-tomorrow" element={<PlanTomorrow />} />
        <Route path="/goals" element={<Navigate to="/plans?tab=goals" replace />} />
        <Route path="/tasks" element={<Navigate to="/plans?tab=tasks" replace />} />
        <Route path="/me" element={<Me />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reminders" element={<Navigate to="/plans?tab=reminders" replace />} />
        <Route path="/ideas" element={<Ideas />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/portrait" element={<Portrait />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/mission" element={<Mission />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/correlations" element={<Correlations />} />
        <Route path="/life-graph" element={<LifeGraph />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
      <ReminderBanner />
      <BottomNav />
    </HashRouter>
    </AppLock>
  );
}
