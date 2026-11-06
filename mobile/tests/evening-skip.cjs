// Android: вечерний вопрос пропускает сегодняшний день, если запись уже есть и время ещё не пришло.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1");
    window.__sched = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {
      checkPermissions: async () => ({ display: "granted" }), requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [] }), cancel: async () => {},
      schedule: async (a) => window.__sched.push(a.notifications.filter(n => n.id === 2100000000).map(n => ({ on: n.schedule.on || null, at: n.schedule.at instanceof Date ? n.schedule.at.toISOString() : null, every: n.schedule.every || null }))),
    } } };
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(async () => { localStorage.setItem("navigator:evening", JSON.stringify({ enabled: true, time: "23:59" })); await window.__api("PUT", "/profile", { onboardingDone: true }); });
  await p.reload(); await p.waitForTimeout(3500);
  let last = await p.evaluate(() => window.__sched.filter(x => x.length).pop());
  ok("записей за день нет: повтор каждый день в 23:59 (on)", last && last[0].on && last[0].on.hour === 23 && !last[0].at);
  await p.evaluate(() => window.__api("POST", "/journal", { content: "Сегодняшняя запись", private: true })); await p.waitForTimeout(800);
  last = await p.evaluate(() => window.__sched.filter(x => x.length).pop());
  ok("запись есть: первое уведомление завтра, дальше каждый день: " + JSON.stringify(last), last && last[0].every === "day" && last[0].at && new Date(last[0].at) > new Date(Date.now() + 3600e3 * 12));
  await p.evaluate(async () => { for (const j of (await window.__api("GET", "/journal")).body.entries) await window.__api("DELETE", "/journal/" + j.id); }); await p.waitForTimeout(800);
  last = await p.evaluate(() => window.__sched.filter(x => x.length).pop());
  ok("запись удалена: снова сегодня вечером (on)", last && last[0].on && !last[0].at);
  console.log("ERRORS", errs); await b.close();
})();
