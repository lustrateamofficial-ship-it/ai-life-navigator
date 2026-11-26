// Повторы напоминаний: сводка дня учитывает повторяющиеся напоминания, месячный повтор держит исходное число.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  const r = await p.evaluate(async () => {
    const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    await window.__api("POST", "/reminders", { title: "Каждый день", triggerAt: at(1, 8), recurrence: "daily" });
    await window.__api("POST", "/reminders", { title: "Раз в неделю", triggerAt: at(1, 9), recurrence: "weekly" });
    await window.__api("POST", "/reminders", { title: "Один раз", triggerAt: at(2, 10), recurrence: "once" });
    const day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x; };
    const names = async (n) => (await window.__daily.scheduleFor(day(n))).filter((l) => l.kind === "reminder").map((l) => l.text);
    const chain = []; let cur = new Date(2027, 0, 31, 9); for (let i = 0; i < 5; i++) { cur = window.__recurrence.nextTrigger("t-anchor", cur, "monthly"); chain.push(cur.getMonth() + 1 + "/" + cur.getDate()); }
    return { d1: await names(1), d3: await names(3), d8: await names(8), d2: await names(2), chain };
  });
  ok("завтра: ежедневное и недельное", r.d1.includes("Каждый день") && r.d1.includes("Раз в неделю"));
  ok("через 3 дня: только ежедневное", r.d3.includes("Каждый день") && !r.d3.includes("Раз в неделю"));
  ok("через 8 дней: недельное вернулось", r.d8.includes("Раз в неделю"));
  ok("разовое напоминание только в свой день", r.d2.includes("Один раз") && !r.d3.includes("Один раз"));
  ok("31 января: " + r.chain.join(" → "), r.chain.join(",") === "2/28,3/31,4/30,5/31,6/30");
  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
