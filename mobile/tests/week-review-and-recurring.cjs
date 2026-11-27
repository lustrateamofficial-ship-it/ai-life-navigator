// 1.25: итоги недели (экран, плашка, воскресное уведомление), повторяющиеся задачи, «Я» с весом и серией, единый блок ИИ.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const errs = [];
  // ── воскресенье вечером ──
  let ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Kyiv", locale: "ru-RU" });
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1");
    window.__sched = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {
      checkPermissions: async () => ({ display: "granted" }), requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [] }), cancel: async () => {}, addListener: () => {},
      schedule: async (a) => window.__sched.push(a.notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.schedule.at instanceof Date ? n.schedule.at.toISOString() : null, route: n.extra && n.extra.route }))),
    } } };
  });
  let p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.setFixedTime(new Date("2026-11-22T10:00:00Z")); // воскресенье 12:00 в Киеве
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true }); });
  await p.reload(); await p.waitForTimeout(3200);
  const all = await p.evaluate(() => window.__sched.flat());
  const wk = all.filter((n) => n.id === 2100000030).pop();
  ok("воскресное уведомление «Итоги недели» запланировано на 19:00 воскресенья: " + (wk && wk.at), wk && wk.route === "/week-review" && /T17:00:00/.test(wk.at));
  ok("до 18:00 плашки на «Сегодня» нет", (await p.locator(".week-nudge").count()) === 0);
  await p.clock.setFixedTime(new Date("2026-11-22T17:30:00Z")); // 19:30
  await p.reload(); await p.waitForTimeout(1000);
  ok("в воскресенье после 18:00 плашка «Итоги недели готовы» есть", (await p.locator(".week-nudge").count()) === 1);
  await p.getByRole("link", { name: "Посмотреть" }).click(); await p.waitForTimeout(800);
  const body = await p.locator("body").innerText();
  ok("экран «Итоги недели»: неделя, серия, цифры", /Итоги недели/.test(body) && /Серия дней/.test(body) && /Эта неделя/.test(body));
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(600);
  ok("после «Посмотреть» плашка больше не показывается", (await p.locator(".week-nudge").count()) === 0);
  await ctx.close();
  // ── повторы, «Я», ИИ ──
  ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  const j = (r) => (r.body && r.body.id ? r.body : JSON.parse(new TextDecoder().decode(r.body)));
  const res = await p.evaluate(async () => {
    await window.__api("PUT", "/profile", { onboardingDone: true });
    const a = await window.__api("POST", "/tasks", { title: "Зарядка", recurrence: "daily" });
    const bb = await window.__api("POST", "/tasks", { title: "Планёрка", recurrence: "weekdays" });
    const c = await window.__api("POST", "/tasks", { title: "Прогулка", recurrence: "weekends" });
    const bad = await window.__api("POST", "/tasks", { title: "Плохой", recurrence: "yearly" });
    const dec = (r) => (r.body && r.body.id ? r.body : JSON.parse(new TextDecoder().decode(r.body)));
    return { a: dec(a), b: dec(bb), c: dec(c), badStatus: bad.status };
  });
  const dayOf = (iso) => new Date(iso).getUTCDay();
  const todayUtc = new Date().getDate();
  ok("«каждый день» без срока получает срок на сегодня", res.a.deadline && new Date(res.a.deadline).getUTCDate() === todayUtc);
  ok("«по будням» попадает на будний день", res.b.deadline && ![0, 6].includes(dayOf(res.b.deadline)));
  ok("«по выходным» попадает на субботу или воскресенье", res.c.deadline && [0, 6].includes(dayOf(res.c.deadline)));
  ok("неизвестный повтор отклоняется", res.badStatus === 400);
  const after = await p.evaluate(async (id) => { await window.__api("PUT", `/tasks/${id}`, { status: "done" }); const r = await window.__api("GET", "/tasks?range=all"); const l = r.body && Array.isArray(r.body) ? r.body : JSON.parse(new TextDecoder().decode(r.body)); return l.filter((t) => t.title === "Зарядка").map((t) => ({ s: t.status, d: t.deadline })); }, res.a.id);
  ok("после выполнения появилась следующая «Зарядка» на завтра", after.length === 2 && after.some((t) => t.s !== "done" && new Date(t.d).getTime() > Date.now()));
  await p.goto("http://localhost:8099/#/plans"); await p.reload(); await p.waitForTimeout(800);
  const opts = await p.locator("#task-repeat option").allInnerTexts();
  ok("в списке повторов есть «По будням» и «По выходным»", opts.includes("По будням") && opts.includes("По выходным"));
  // «Я»
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(800);
  const tiles = await p.locator(".tile-grid .tile").allInnerTexts();
  ok("в «Я» сверху две плитки: Вес и Серия: " + tiles.map((t) => t.split("\n")[0]).join(", "), tiles.length === 2 && /Вес/.test(tiles[0]) && /Серия/.test(tiles[1]));
  await p.locator(".tile-grid .tile", { hasText: "Серия" }).click(); await p.waitForTimeout(300);
  ok("плитка «Серия» открывает календарь", (await p.locator("#streak-card .cal5").count()) === 1);
  await p.goto("http://localhost:8099/#/habits"); await p.waitForTimeout(300);
  ok("«Привычки» открываются из «Разделы»", /Привычки/.test(await p.locator("body").innerText()) && (await p.locator("#streak-card").count()) === 0);
  await p.goto("http://localhost:8099/#/finance"); await p.waitForTimeout(300);
  ok("«Финансы» открываются из «Разделы»", (await p.getByText("Баланс").count()) > 0 || (await p.locator("body").innerText()).includes("Доход"));
  // ИИ
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll("details.fold").forEach((d) => (d.open = true))); await p.waitForTimeout(200);
  ok("«Очередь ИИ» одна и лежит внутри «Помощник ИИ»", (await p.locator("text=Очередь ИИ").count()) === 1 && (await p.locator("details.fold:has-text('Помощник ИИ') .ai-queue").count()) === 1);
  ok("готовых сервисов в форме «свой сервис» нет (без выбора шаблона)", (await p.locator("#svc-preset").count()) === 0);
  ok("без ошибок", errs.length === 0);
  if (errs.length) console.log("ERRORS", errs);
  await b.close();
})();
