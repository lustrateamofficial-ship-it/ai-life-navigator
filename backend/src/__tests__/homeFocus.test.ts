import { describe, it, expect } from "vitest";
import { buildHomeFocus, type HomeTaskInput } from "../services/homeFocus.js";
import { verifyObservation } from "../services/journalObservation.js";

const NOW = new Date("2026-10-28T10:00:00.000Z");
const task = (o: Partial<HomeTaskInput> & { id: string }): HomeTaskInput => ({
  title: o.id,
  priority: "medium",
  status: "todo",
  deadline: null,
  scheduledTime: null,
  ...o,
});

describe("buildHomeFocus", () => {
  it("просроченные задачи идут первыми, выполненные не учитываются", () => {
    const r = buildHomeFocus({
      tasks: [
        task({ id: "обычная" }),
        task({ id: "просрочена", deadline: new Date("2026-10-20T10:00:00Z") }),
        task({ id: "готово", status: "done", deadline: new Date("2026-10-01T10:00:00Z") }),
      ],
      reminders: [],
      lastJournalAt: NOW,
      now: NOW,
      timezone: "UTC",
    });
    expect(r.focusTasks.map((t) => t.id)).toEqual(["просрочена", "обычная"]);
    expect(r.overdueCount).toBe(1);
    expect(r.openCount).toBe(2);
  });

  it("берёт не больше трёх задач", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task({ id: `t${i}` }));
    expect(buildHomeFocus({ tasks, reminders: [], lastJournalAt: NOW, now: NOW, timezone: "UTC" }).focusTasks).toHaveLength(3);
  });

  it("находит ближайшее напоминание только в пределах суток", () => {
    const r = buildHomeFocus({
      tasks: [],
      reminders: [
        { title: "через двое суток", triggerAt: new Date("2026-10-30T10:00:00Z") },
        { title: "вечером", triggerAt: new Date("2026-10-28T17:00:00Z") },
        { title: "уже прошло", triggerAt: new Date("2026-10-28T08:00:00Z") },
      ],
      lastJournalAt: NOW,
      now: NOW,
      timezone: "UTC",
    });
    expect(r.nextReminder?.title).toBe("вечером");
  });

  it("подсказка про дневник: пусто, не писал сегодня, писал сегодня", () => {
    const base = { tasks: [], reminders: [], now: NOW, timezone: "UTC" };
    expect(buildHomeFocus({ ...base, lastJournalAt: null }).journalNudge).toBe("first");
    const old = buildHomeFocus({ ...base, lastJournalAt: new Date("2026-10-25T10:00:00Z") });
    expect(old.journalNudge).toBe("today_empty");
    expect(old.journalDaysSince).toBe(3);
    expect(buildHomeFocus({ ...base, lastJournalAt: new Date("2026-10-28T01:00:00Z") }).journalNudge).toBe("none");
  });

  it("учитывает часовой пояс при определении «сегодня»", () => {
    // 22:30 UTC 27 октября — это уже 28 октября в Киеве (UTC+2).
    const r = buildHomeFocus({
      tasks: [],
      reminders: [],
      lastJournalAt: new Date("2026-10-27T22:30:00Z"),
      now: NOW,
      timezone: "Europe/Kyiv",
    });
    expect(r.journalNudge).toBe("none");
  });
});

describe("verifyObservation", () => {
  const entries = ["Сегодня опять не выспался, и снова отложил тренировку на завтра.", "Хочу больше времени уделять семье."];

  it("принимает наблюдение с дословной цитатой", () => {
    const r = verifyObservation({ observation: "В нескольких записях ты откладываешь тренировку.", quote: "отложил тренировку на завтра" }, entries);
    expect(r?.quote).toBe("отложил тренировку на завтра");
  });
  it("отбрасывает цитату, которой нет в записях", () => {
    expect(verifyObservation({ observation: "Ты устал.", quote: "я ужасно устал от всего" }, entries)).toBeNull();
  });
  it("отбрасывает клинические термины", () => {
    expect(verifyObservation({ observation: "Похоже на депрессию.", quote: "не выспался, и снова отложил" }, entries)).toBeNull();
  });
  it("отбрасывает мусор и слишком короткие цитаты", () => {
    expect(verifyObservation(null, entries)).toBeNull();
    expect(verifyObservation({ observation: "x", quote: "не" }, entries)).toBeNull();
    expect(verifyObservation({ observation: null }, entries)).toBeNull();
  });
});
