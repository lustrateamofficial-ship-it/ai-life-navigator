import { WeekReview } from "./screens/WeekReview";
import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { initTelegramApp } from "./platform/sdk";
import { api } from "./api/client";
import { BottomNav } from "./components/BottomNav";
import { Onboarding } from "./screens/Onboarding";
import { Today } from "./screens/Today";
import { Me } from "./screens/Me";
import { Analytics } from "./screens/Analytics";
import { Plans } from "./screens/Plans";
import { PlanTomorrow } from "./screens/PlanTomorrow";
import { Ideas } from "./screens/Ideas";
import { Memory } from "./screens/Memory";
import { Journal } from "./screens/Journal";
import { Portrait } from "./screens/Portrait";
import { Settings } from "./screens/Settings";
import { Trash } from "./screens/Trash";
import { Mission } from "./screens/Mission";
import { Habits } from "./screens/Habits";
import { Finance } from "./screens/Finance";
import { AppLock } from "./components/AppLock";
import { ReminderBanner } from "./components/ReminderBanner";
import { Frozen } from "./screens/Frozen";
import { getFrozenInfo } from "../phone/safety";
import { UpdateBanner } from "./components/UpdateBanner";
import { Toast } from "./components/Toast";
import { Celebration } from "./components/Celebration";

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
        <Route path="/me" element={<Me />} />
        <Route path="/ideas" element={<Ideas />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/portrait" element={<Portrait />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/mission" element={<Mission />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/week-review" element={<WeekReview />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Today />} />
      </Routes>
      <ReminderBanner />
      <BottomNav />
      <Toast />
      <Celebration />
    </HashRouter>
    </AppLock>
  );
}
