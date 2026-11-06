import { describe, it, expect, vi } from "vitest";

// Настоящая база в этих тестах не нужна: вместо неё подставляется заглушка.
vi.mock("../db/prisma.js", () => ({ prisma: {} }));

import { parsePrivatePrefix, describeProposals, EMPTY_PROPOSALS } from "../services/journalExtraction.js";
import { savePending, takePending } from "../services/pendingProposals.js";
import { supportMessageText, supportResourcesForTimezone } from "../services/distressDetection.js";

describe("parsePrivatePrefix", () => {
  it("распознаёт приставку «Личное»", () => {
    expect(parsePrivatePrefix("Личное: сегодня было тяжело")).toEqual({ text: "сегодня было тяжело", isPrivate: true });
    expect(parsePrivatePrefix("личная запись - думаю о маме")).toEqual({ text: "думаю о маме", isPrivate: true });
  });
  it("не трогает обычный текст и пустую приставку", () => {
    expect(parsePrivatePrefix("Личное:")).toEqual({ text: "Личное:", isPrivate: false });
    expect(parsePrivatePrefix("Личное дело нужно отнести")).toEqual({ text: "Личное дело нужно отнести", isPrivate: false });
  });
});

describe("describeProposals", () => {
  it("описывает предложения короткими строками", () => {
    const p = {
      ...EMPTY_PROPOSALS,
      tasks: [{ title: "Отчёт" }],
      transactions: [{ type: "expense" as const, amount: 450, category: "еда" }],
      weight: { weightKg: 90.4 },
    };
    expect(describeProposals(p, "UTC")).toEqual(["Задача: Отчёт", "Расход: 450, еда", "Вес сегодня: 90.4 кг"]);
  });
});

// Простая замена базы: одна запись дневника в памяти, поведение updateMany/findFirst как у настоящей.
function fakeDb(userId: string) {
  const row: { id: string; userId: string; pendingProposals: unknown; pendingExpiresAt: Date | null } = {
    id: "e1",
    userId,
    pendingProposals: null,
    pendingExpiresAt: null,
  };
  return {
    journalEntry: {
      findFirst: async ({ where }: any) => (where.id === row.id && where.userId === row.userId ? { ...row } : null),
      updateMany: async ({ where, data }: any) => {
        const okExpiry = where.pendingExpiresAt === undefined || where.pendingExpiresAt?.getTime() === row.pendingExpiresAt?.getTime();
        if (where.id !== row.id || where.userId !== row.userId || !okExpiry) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  } as any;
}

describe("pendingProposals", () => {
  const p = { ...EMPTY_PROPOSALS, tasks: [{ title: "Отчёт" }] };
  const t0 = 1_000_000;

  it("отдаёт предложение только владельцу", async () => {
    const db = fakeDb("u1");
    await savePending("e1", "u1", p, t0, db);
    expect(await takePending("e1", "u2", t0 + 1, db)).toBeNull();
    expect(await takePending("e1", "u1", t0 + 1, db)).toEqual(p);
  });
  it("отдаёт предложение только один раз", async () => {
    const db = fakeDb("u1");
    await savePending("e1", "u1", p, t0, db);
    expect(await takePending("e1", "u1", t0 + 1000, db)).not.toBeNull();
    expect(await takePending("e1", "u1", t0 + 1000, db)).toBeNull();
  });
  it("забывает предложение через 30 минут", async () => {
    const db = fakeDb("u1");
    await savePending("e1", "u1", p, t0, db);
    expect(await takePending("e1", "u1", t0 + 31 * 60 * 1000, db)).toBeNull();
  });
});

describe("supportMessageText", () => {
  it("для украинского часового пояса называет номера", () => {
    expect(supportMessageText(supportResourcesForTimezone("Europe/Kyiv"))).toMatch(/7333/);
  });
});
