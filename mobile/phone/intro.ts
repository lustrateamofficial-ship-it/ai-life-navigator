// Постепенное знакомство: новому человеку сначала показываем минимум, остальное открывается после трёх первых шагов.
// Включается только после первого запуска (экран знакомства). У тех, кто уже пользуется приложением, ничего не меняется.
import { prisma } from "../shim/prisma";

const KEY = "navigator:intro";
const EVENT = "navigator:home-layout"; // тот же сигнал, по которому «Сегодня» перечитывает набор блоков

export function introActive(): boolean {
  try {
    return localStorage.getItem(KEY) === "active";
  } catch {
    return false;
  }
}

function set(v: "active" | "done") {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* хранилище недоступно: знакомство просто не включится */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const startIntro = () => set("active");
export const finishIntro = () => set("done");

export interface IntroSteps {
  write: boolean;
  task: boolean;
  weight: boolean;
}

export async function introSteps(): Promise<IntroSteps> {
  const [j, t, w] = await Promise.all([
    prisma.journalEntry.findMany({ take: 1 }),
    prisma.task.findMany({ take: 1 }),
    prisma.weightLog.findMany({ take: 1 }),
  ]);
  return { write: j.length > 0, task: t.length > 0, weight: w.length > 0 };
}
