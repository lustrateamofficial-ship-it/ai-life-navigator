const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const errs = [];
  // 1. Неделя в цифрах: известные данные → известные строки
  let ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  let p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
  await p.evaluate(async () => {
    const a = window.__api;
    await a("PUT", "/profile", { onboardingDone: true });
    await a("POST", "/journal", { content: "раз", private: false });
    await a("POST", "/journal", { content: "два", private: true });
    await a("POST", "/tasks", { title: "А" }); await a("POST", "/tasks", { title: "Б" });
    const t = (await a("GET", "/tasks")).body; await a("PUT", "/tasks/" + t[0].id, { status: "done" });
    await a("PUT", "/mood", { rating: "good" });
    await a("POST", "/health/weight", { weightKg: 80.5 });
    await a("POST", "/finance/expenses", { amount: 500, category: "Еда" });
    await a("POST", "/finance/income", { amount: 1000, category: "Работа" });
  });
  const w = await p.evaluate(async () => (await window.__api("GET", "/week")).body);
  console.log("week:", JSON.stringify(w));
  const ok = w.entries.count === 2 && w.entries.days === 1 && w.tasks.done === 1 && w.tasks.created === 2 && w.tasks.open === 1 && w.mood.good === 1 && w.weight?.last === 80.5 && w.money.expenses === 500 && w.money.income === 1000;
  console.log("цифры верные:", ok);
  await p.goto("http://localhost:8099/#/journal"); await p.reload(); await p.waitForTimeout(900);
  const t = (await p.innerText("body")).replace(/\n+/g, " | ");
  console.log("карточка на экране:", t.includes("Неделя в цифрах") && t.includes("Записей в дневнике: 2 за 1 день из 7"), "|", t.includes("Задач выполнено: 1, добавлено: 2"));
  await ctx.close();

  // 2. Вечерний вопрос в браузере: время уже наступило, записей сегодня нет
  ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("navigator-debug", "1"); localStorage.setItem("navigator:evening", JSON.stringify({ enabled: true, time: "00:00" })); });
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.reload(); await p.waitForTimeout(3500);
  const banner = (await p.innerText("body")).includes("Как прошёл день? Запиши пару строк.");
  console.log("вечерняя плашка показана:", banner);
  await p.reload(); await p.waitForTimeout(3500);
  console.log("не повторяется в тот же день:", !(await p.innerText("body")).includes("Запиши пару строк."));
  await ctx.close();

  // 3. Android: ежедневное уведомление в выбранное время
  ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1"); window.__log = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {
      checkPermissions: async () => ({ display: "granted" }), requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [] }), cancel: async () => {},
      schedule: async (a) => window.__log.push(a.notifications.map(n => ({ id: n.id, body: n.body, on: n.schedule.on || null }))) } } };
  });
  p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.reload(); await p.waitForTimeout(800);
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(600);
  await p.getByText("Напоминать каждый вечер").click(); await p.waitForTimeout(500);
  await p.locator("#evening-time").fill("20:30"); await p.waitForTimeout(800);
  const log = await p.evaluate(() => window.__log);
  console.log("Android расписание:", JSON.stringify(log[log.length - 1]));
  console.log("ERRORS", errs);
  await b.close();
})();
