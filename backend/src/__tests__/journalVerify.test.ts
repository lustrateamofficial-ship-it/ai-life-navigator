import { describe, it, expect } from "vitest";
import { verifyQuote, verifyObservation, verifyWeekSummary, verifyGoalSuggestions } from "../services/journalObservation.js";

const E = [
  "Опять не выспался и отложил тренировку на завтра.",
  "Хочу выучить английский до лета, это для меня важно.",
  "Сегодня закончил отчёт, доволен.",
];

describe("verifyQuote", () => {
  it("принимает цитату, которая есть в записях", () => {
    expect(verifyQuote("отложил тренировку на завтра", E)).toBe("отложил тренировку на завтра");
    expect(verifyQuote("«Хочу выучить английский до лета»", E)).toBe("«Хочу выучить английский до лета»");
  });
  it("отвергает выдуманную цитату", () => {
    expect(verifyQuote("такого нет в записях совсем", E)).toBeNull();
  });
});

describe("verifyObservation", () => {
  it("принимает наблюдение с настоящей цитатой", () => {
    expect(verifyObservation({ observation: "Ты откладываешь тренировку.", quote: "отложил тренировку на завтра" }, E)?.quote).toBe(
      "отложил тренировку на завтра",
    );
  });
});

describe("verifyWeekSummary", () => {
  it("оставляет только подтверждённые цитатами пункты", () => {
    const r = verifyWeekSummary(
      {
        summary: "Неделя была неровной.",
        highlights: [
          { text: "Тренировка откладывалась", quote: "отложил тренировку на завтра" },
          { text: "Выдумка", quote: "я бросил всё и уехал" },
        ],
      },
      E,
    );
    expect(r?.highlights).toHaveLength(1);
  });
  it("отвергает клинические формулировки", () => {
    expect(
      verifyWeekSummary({ summary: "Похоже на депрессию.", highlights: [{ text: "x", quote: "отложил тренировку на завтра" }] }, E),
    ).toBeNull();
  });
  it("отвергает сводку без подтверждённых пунктов и мусор", () => {
    expect(verifyWeekSummary({ summary: "Ок.", highlights: [{ text: "Выдумка", quote: "я бросил всё и уехал" }] }, E)).toBeNull();
    expect(verifyWeekSummary({ summary: "Ок" }, E)).toBeNull();
  });
});

describe("verifyGoalSuggestions", () => {
  it("убирает выдуманные цитаты, дубли и уже существующие цели", () => {
    const g = verifyGoalSuggestions(
      {
        suggestions: [
          { title: "Выучить английский", why: "Ты назвал это важным.", quote: "Хочу выучить английский до лета" },
          { title: "Выучить английский", why: "дубль", quote: "Хочу выучить английский до лета" },
          { title: "Бросить курить", why: "в записях нет", quote: "бросаю курить с понедельника" },
          { title: "Регулярные тренировки", why: "Откладывал.", quote: "отложил тренировку на завтра" },
        ],
      },
      E,
      ["Регулярные тренировки"],
    );
    expect(g.map((x) => x.title)).toEqual(["Выучить английский"]);
  });
  it("на мусорном вводе возвращает пустой список", () => {
    expect(verifyGoalSuggestions(null, E, [])).toEqual([]);
  });
});
