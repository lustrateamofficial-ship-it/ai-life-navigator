import { useEffect, useState } from "react";
import { JournalComposer } from "../components/JournalComposer";
import { EarlierCard } from "../components/Earlier";
import { BackupNudge } from "../components/BackupNudge";
import { SetupCard } from "../components/SetupCard";
import { UpdateNotice } from "../components/UpdateCard";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TileEditPage, EditButton, useTiles } from "../components/TileEditPage";
import { DayRing } from "../components/charts";
import { IntroCard } from "../components/IntroCard";
import { plural } from "../components/WeekDigest";
import { readStreak, recordDayDone, streakEvent } from "../../phone/streak";
import { WeekReviewNudge } from "../components/WeekReviewNudge";
import { WeekTile } from "../components/WeekTile";
import { WeightTile } from "../components/WeightTile";
import { PERIODS, periodAt, spans, TILES, type BlockId } from "../../phone/homeLayout";
import { api, ApiError } from "../api/client";
import { hapticImpact } from "../platform/sdk";
import { useAppearance } from "../useAppearance";
import { EasyStart } from "../components/EasyStart";
import { DayBrief } from "../components/DayBrief";
import { ReadyAnalyses } from "../components/ReadyAnalyses";
import { celebrateIfDayDone } from "../../phone/celebrate";

interface HomeFocus {
  focusTasks: Array<{ id: string; title: string; reason: "overdue" | "today" | "priority" | "open" }>;
  overdueCount: number;
  openCount: number;
  nextReminder: { title: string; triggerAt: string } | null;
  journalNudge: "none" | "today_empty" | "first";
  journalDaysSince: number | null;
}

interface Observation {
  observation: string | null;
  quote?: string;
  reason?: string;
}

const REASON_LABEL: Record<HomeFocus["focusTasks"][number]["reason"], string> = {
  overdue: "просрочено",
  today: "на сегодня",
  priority: "важное",
  open: "",
};

function nudgeText(f: HomeFocus): string | null {
  if (f.journalNudge === "first") return "Дневник пока пуст. Начни с пары строк: что сейчас на уме.";
  if (f.journalNudge === "today_empty") {
    const d = f.journalDaysSince ?? 0;
    return d === 1 ? "Вчера ты писал, сегодня записей ещё нет." : `Последняя запись была ${d} дн. назад.`;
  }
  return null;
}

// Главный экран построен вокруг дневника: сверху поле записи, под ним то, что полезно сейчас.
// Показатели (оценка направления, вес) остались, но свёрнуты: оценка числом не должна быть первым,
// что видит человек, особенно в плохой день.
export function Today() {
  const navigate = useNavigate();
  const { lite } = useAppearance();
  const [params, setParams] = useSearchParams();
  const [tiles] = useTiles("today");
  const [editing, setEditing] = useState(false);
  const [streak, setStreak] = useState(() => readStreak());
  useEffect(() => {
    const on = () => setStreak(readStreak());
    void recordDayDone().then(setStreak);
    window.addEventListener(streakEvent, on);
    return () => window.removeEventListener(streakEvent, on);
  }, []);
  const period = periodAt();
  const [forceWrite, setForceWrite] = useState(false); // пришли из «+ → Запись»: показать поле, даже если блок выключен
  const [draft, setDraft] = useState("");
  const [home, setHome] = useState<HomeFocus | null>(null);
  const [homeError, setHomeError] = useState(false);
  const [doneBusyId, setDoneBusyId] = useState<string | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [observing, setObserving] = useState(false);
  const [nextAction, setNextAction] = useState<{ actions: string[]; reasoning: string } | null>(null);
  const [nextActionLoading, setNextActionLoading] = useState(false);
  const [nextActionError, setNextActionError] = useState<string | null>(null);

  async function loadHome() {
    try {
      setHome(await api.get<HomeFocus>("/home"));
      setHomeError(false);
    } catch {
      setHomeError(true);
    }
  }

  useEffect(() => {
    if (params.get("write") !== "1") return;
    setForceWrite(true);
    setParams({}, { replace: true });
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Запись в дневник"]');
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    }, 120);
  }, [params, setParams]);

  useEffect(() => {
    loadHome();
  }, []);

  async function markDone(id: string) {
    if (doneBusyId) return;
    setDoneBusyId(id);
    try {
      await api.put(`/tasks/${id}`, { status: "done" });
      hapticImpact("light");
      await loadHome();
      void celebrateIfDayDone();
    } finally {
      setDoneBusyId(null);
    }
  }

  async function handleObservation() {
    if (observing) return;
    setObserving(true);
    try {
      setObservation(await api.post<Observation>("/home/observation"));
    } catch (err) {
      setObservation({ observation: null, reason: err instanceof ApiError ? err.message : "Не получилось сейчас. Попробуй позже." });
    } finally {
      setObserving(false);
    }
  }

  async function handleWhatToDoNow() {
    setNextActionLoading(true);
    setNextActionError(null);
    try {
      setNextAction(await api.post<{ actions: string[]; reasoning: string }>("/ai/next-action"));
    } catch (err) {
      setNextActionError(err instanceof ApiError ? err.message : "Не удалось получить рекомендацию");
    } finally {
      setNextActionLoading(false);
    }
  }

  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const nudge = home ? nudgeText(home) : null;
  const current = PERIODS.find((p) => p.id === period)!;

  const blocks: Record<BlockId, JSX.Element | null> = {
    week: <WeekTile />,
    weight: <WeightTile />,
    brief: <DayBrief showTasks={!tiles.includes("focus")} />,
    ring: <DayRing />,
    write: (
      <div>
        <EasyStart daysSince={home?.journalDaysSince ?? null} nudge={home?.journalNudge ?? "none"} onPick={setDraft} />
        <JournalComposer onSaved={loadHome} draft={draft} onDraftUsed={() => setDraft("")} placeholder="Как день? Что на уме, что нужно сделать, на что потратил?" />
      </div>
    ),
    focus: (
      <div className="card list-tile">
        <div className="card-title">Что полезно сейчас</div>
        {!home && !homeError && <p>Загрузка...</p>}
        {homeError && <p>Не удалось загрузить. Потяни вниз и попробуй ещё раз.</p>}
        {home && home.focusTasks.length === 0 && <p>Открытых задач нет. Можно просто записать мысли.</p>}
        {home && home.overdueCount > 0 && (
          <p style={{ color: "var(--orange)", marginBottom: 4, fontWeight: 500 }}>Просроченных задач: {home.overdueCount}</p>
        )}
        {home?.focusTasks.map((task) => (
          <div className="task-row" key={task.id}>
            <button className="checkbox" onClick={() => markDone(task.id)} disabled={doneBusyId === task.id} aria-label="отметить выполненной" />
            <span>
              {task.title}
              {REASON_LABEL[task.reason] && <span className={`tag ${task.reason === "overdue" ? "overdue" : ""}`}>{REASON_LABEL[task.reason]}</span>}
            </span>
          </div>
        ))}
        {home && home.openCount > home.focusTasks.length && (
          <p style={{ marginTop: 8, fontSize: 12 }}>Ещё открытых задач: {home.openCount - home.focusTasks.length}</p>
        )}
        {home?.nextReminder && (
          <p style={{ marginTop: 8, color: "var(--text)" }}>
            Скоро: {home.nextReminder.title},{" "}
            {new Date(home.nextReminder.triggerAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    ),
    earlier: <EarlierCard />,
    insight: lite ? null : (
      <div>
        <div className="card">
          <div className="card-title">Что видно по моим записям</div>
          <p style={{ marginBottom: 8, fontSize: 13 }}>Одно осторожное наблюдение по недавним записям, с цитатой.</p>
          <button className="secondary" style={{ width: "100%" }} onClick={handleObservation} disabled={observing}>
            {observing ? "Читаю..." : "Показать наблюдение"}
          </button>
          {observation?.observation && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: "var(--text)" }}>{observation.observation}</p>
              {observation.quote && <blockquote className="quote">«{observation.quote}»</blockquote>}
              <p style={{ marginTop: 10, fontSize: 13 }}>Это не диагноз и не вывод о тебе, только наблюдение по тексту.</p>
            </div>
          )}
          {observation && !observation.observation && <p style={{ marginTop: 12 }}>{observation.reason}</p>}
        </div>
        <div className="card">
          <div className="card-title">Что делать сейчас</div>
          <button className="secondary" style={{ width: "100%" }} onClick={handleWhatToDoNow} disabled={nextActionLoading}>
            {nextActionLoading ? "Думаю..." : "Что мне делать сейчас?"}
          </button>
          {nextActionError && <p style={{ color: "var(--red)", marginTop: 8 }}>{nextActionError}</p>}
          {nextAction && (
            <div style={{ marginTop: 12 }}>
              {nextAction.actions.map((a, i) => (
                <p key={i} style={{ color: "var(--text)", marginBottom: 4 }}>
                  {a}
                </p>
              ))}
              <p style={{ marginTop: 8, fontSize: 13 }}>{nextAction.reasoning}</p>
            </div>
          )}
        </div>
      </div>
    ),
  };

  const shown = (forceWrite && !tiles.includes("write") ? ["write", ...tiles] : tiles) as BlockId[];
  const sizes = spans(shown, (id) => !!TILES.today.find((d) => d.id === id)?.half);

  if (editing) {
    return <TileEditPage screen="today" onDone={() => setEditing(false)} />;
  }

  return (
    <div className="screen">
      <header className="page-header page-header-row">
        <div>
          <p className="date-line">{today}</p>
          <h2>{current.greeting}</h2>
          {streak > 0 && (
            <span className="streak-chip" role="status" aria-label={`Серия: ${streak} ${plural(streak, "день", "дня", "дней")} подряд`}>
              серия {streak} {plural(streak, "день", "дня", "дней")}
            </span>
          )}
        </div>
        <div className="header-actions">
          <EditButton onClick={() => setEditing(true)} />
        </div>
      </header>

      <WeekReviewNudge />
      {nudge && <p className="nudge">{nudge}</p>}
      <ReadyAnalyses />
      <UpdateNotice onOpen={() => navigate("/settings")} />
      <IntroCard />
      <SetupCard />
      <BackupNudge />

      <div className="home-grid">
        {shown.map((id, i) => (
          // Размер считается по всему списку: две маленькие плитки подряд рядом, одинокая на всю ширину.
          <div key={id} data-block={id} className={sizes[i]}>
            {blocks[id]}
          </div>
        ))}
      </div>
      {shown.length === 0 && <p className="custom-hint">Все блоки выключены. Нажми карандаш сверху и выбери, что показывать.</p>}
    </div>
  );
}
