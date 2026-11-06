import { describe, it, expect } from "vitest";
import { calcProgressFromStages, calcProgressFromTasks } from "../services/goalProgress.js";

describe("calcProgressFromStages", () => {
  it("считает долю завершённых этапов в процентах", () => {
    expect(calcProgressFromStages([{ status: "completed" }, { status: "active" }, { status: "planned" }, { status: "completed" }])).toBe(50);
  });

  it("возвращает 0, если ни один этап не завершён", () => {
    expect(calcProgressFromStages([{ status: "active" }, { status: "planned" }])).toBe(0);
  });

  it("возвращает 100, если все этапы завершены", () => {
    expect(calcProgressFromStages([{ status: "completed" }, { status: "completed" }])).toBe(100);
  });

  it("округляет до целого процента", () => {
    // 1 из 3 = 33.33...% → округляется до 33
    expect(calcProgressFromStages([{ status: "completed" }, { status: "active" }, { status: "active" }])).toBe(33);
  });
});

describe("calcProgressFromTasks", () => {
  it("возвращает null (не трогать прогресс), если задач нет вообще — раздел 10: это честное отсутствие данных, а не 0%", () => {
    expect(calcProgressFromTasks(0, 0)).toBeNull();
  });

  it("считает долю выполненных задач в процентах", () => {
    expect(calcProgressFromTasks(4, 1)).toBe(25);
  });

  it("возвращает 100, если все задачи выполнены", () => {
    expect(calcProgressFromTasks(5, 5)).toBe(100);
  });
});
