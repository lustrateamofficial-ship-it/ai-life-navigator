import { describe, it, expect } from "vitest";
import { scrubSentryEvent } from "../config/sentryScrub.js";

describe("scrubSentryEvent", () => {
  it("вычищает личные данные из события", () => {
    const ev: any = {
      request: {
        data: { content: "личный текст" },
        headers: { "x-telegram-init-data": "secret" },
        cookies: { a: 1 },
        query_string: "q=слово",
        url: "https://x.y/journal?q=слово",
        method: "GET",
      },
      breadcrumbs: [{ message: "текст" }],
      user: { id: "1" },
      exception: {
        values: [
          { type: "PrismaClientValidationError", value: "Invalid `prisma.journalEntry.create()` invocation:\n\n{ data: { content: \"очень личное\" } }" },
          { type: "Error", value: "Обычная ошибка" },
        ],
      },
    };
    const r = scrubSentryEvent(ev);
    expect(r.request.data).toBeUndefined();
    expect(r.request.headers).toBeUndefined();
    expect(r.request.cookies).toBeUndefined();
    expect(r.request.url).toBe("https://x.y/journal");
    expect(r.request.method).toBe("GET");
    expect(r.breadcrumbs).toBeUndefined();
    expect(r.user).toBeUndefined();
    expect(r.exception.values[0].value).toBe("Invalid `prisma.journalEntry.create()` invocation:");
    expect(r.exception.values[1].value).toBe("Обычная ошибка");
    expect(JSON.stringify(r)).not.toContain("личн");
  });
});
