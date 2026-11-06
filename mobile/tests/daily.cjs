// «Планы» с тремя вкладками, утренняя сводка и вечерний «план на завтра» (Android-режим с имитацией уведомлений).
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  const tom = new Date(Date.now() + 86400000), today = new Date();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await ctx.route("**/geocoding-api.open-meteo.com/**", (r) => r.fulfill({ json: { results: [{ name: "Казань", country: "Россия", latitude: 55.79, longitude: 49.12 }] } }));
  await ctx.route("**/api.open-meteo.com/**", (r) => r.fulfill({ json: { daily: {
    time: [0, 1, 2, 3].map((i) => key(new Date(Date.now() + i * 86400000))),
    weather_code: [3, 61, 0, 0], temperature_2m_max: [7, 4, 9, 9], temperature_2m_min: [1, -1, 2, 2], precipitation_probability_max: [10, 70, 0, 0] } } }));
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1");
    window.__sched = []; window.__listener = null;
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {
      checkPermissions: async () => ({ display: "granted" }), requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [] }), cancel: async () => {},
      addListener: (n, f) => { window.__listener = f; },
      schedule: async (a) => window.__sched.push(a.notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, largeBody: n.largeBody, at: n.schedule.at instanceof Date ? n.schedule.at.toISOString() : null, route: n.extra && n.extra.route }))),
    } } };
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true, weightGoalKg: 80 }); });
  await p.reload(); await p.waitForTimeout(1500);

  // ── экран «Планы» ──
  const nav = await p.locator("nav").innerText();
  ok("в нижней навигации есть «Планы», нет отдельных «Задачи» и «Цели»", /Планы/.test(nav) && !/Задачи/.test(nav) && !/Цели/.test(nav));
  await p.evaluate(() => (location.hash = "#/goals")); await p.waitForTimeout(500);
  ok("старый адрес /goals ведёт на «Планы», вкладка «Цели»", /plans\?tab=goals/.test(await p.url()) && (await p.locator('[role=tab][aria-selected=true]').innerText()) === "Цели");
  await p.evaluate(() => (location.hash = "#/reminders")); await p.waitForTimeout(500);
  ok("старый адрес /reminders: вкладка «Напоминания»", (await p.locator('[role=tab][aria-selected=true]').innerText()) === "Напоминания" && /Напоминаний нет/.test(await p.locator("body").innerText()));
  await p.evaluate(() => (location.hash = "#/tasks")); await p.waitForTimeout(500);
  ok("вкладка «Задачи»: поле новой задачи", (await p.getByLabel("Новая задача").count()) > 0);
  await p.getByRole("tab", { name: "Цели" }).click(); await p.waitForTimeout(300);
  ok("переключение на «Цели» без перехода", /plans/.test(await p.url()) && !(await p.getByLabel("Новая задача").count()));

  // ── настройки: город, дата рождения ──
  await p.evaluate(() => (location.hash = "#/settings")); await p.waitForTimeout(500);
  await p.fill("#daily-city", "Казань"); await p.getByRole("button", { name: "Найти" }).click(); await p.waitForTimeout(800);
  ok("город найден, прогноз загружен", /Прогноз загружен/.test(await p.locator("#daily-card").innerText()));
  const born = key(new Date(today.getFullYear() - 40, today.getMonth(), today.getDate()));
  await p.fill("#daily-birth", born); await p.fill("#morning-time", "07:30");

  // ── данные: вес, задачи, расписание ──
  await p.evaluate(async (tomIso) => {
    await window.__api("POST", "/health/weight", { weightKg: 86.4 });
    await window.__api("POST", "/tasks", { title: "Позвонить маме", priority: "low" });
    await window.__api("POST", "/tasks", { title: "Сдать отчёт", priority: "high" });
    await window.__api("POST", "/tasks", { title: "Купить хлеб", priority: "medium" });
    await window.__api("POST", "/tasks", { title: "Разобрать почту", priority: "low" });
  }, tom.toISOString());

  // ── вечерний экран «План на завтра» ──
  await p.evaluate(() => (location.hash = "#/plan-tomorrow")); await p.waitForTimeout(800);
  ok("на экране плана видна погода на завтра (дождь)", /дождь/.test(await p.locator("body").innerText()));
  await p.locator("label.check-row", { hasText: "Позвонить маме" }).locator("input").check();
  await p.getByLabel("Новая задача на завтра").fill("Записаться к врачу"); await p.getByRole("button", { name: "Добавить" }).first().click(); await p.waitForTimeout(500);
  await p.fill('input[aria-label="Время"]', "10:30"); await p.getByLabel("Что запланировано").fill("Встреча с Олегом");
  await p.getByRole("button", { name: "Добавить" }).nth(1).click(); await p.waitForTimeout(600);
  ok("событие появилось в расписании на завтра", /10:30\s+Встреча с Олегом/.test(await p.locator("body").innerText()));
  await p.getByRole("button", { name: /Готово/ }).click(); await p.waitForTimeout(1500);

  // ── что запланировано в уведомлениях ──
  const all = await p.evaluate(() => window.__sched.flat());
  const last = (id) => all.filter((n) => n.id === id).pop();
  const m1 = last(2100000011), bed0 = last(2100000020) || last(2100000021);
  console.log(JSON.stringify(m1 || null).slice(0, 700));
  ok("утро: запланировано на неделю вперёд", all.filter((n) => n.id >= 2100000010 && n.id < 2100000020).length >= 6);
  ok("утро завтра: погода, вес, остаток недель/месяцев/лет", m1 && /дождь/.test(m1.largeBody) && /86,4 кг/.test(m1.largeBody) && /недел/.test(m1.largeBody) && /месяц/.test(m1.largeBody) && /год|лет/.test(m1.largeBody));
  ok("утро завтра: выбранные вечером задачи идут первыми", m1 && m1.largeBody.indexOf("Позвонить маме") > -1 && m1.largeBody.indexOf("Позвонить маме") < m1.largeBody.indexOf("Сдать отчёт") && m1.largeBody.indexOf("Записаться к врачу") > -1);
  ok("утро завтра: ровно 3 задачи", m1 && (m1.largeBody.match(/^\d\. /gm) || []).length === 3);
  ok("утро завтра: расписание «10:30 Встреча с Олегом»", m1 && /10:30 Встреча с Олегом/.test(m1.largeBody));
  ok("утро открывает главный экран", m1 && m1.route === "/");
  ok("вечер: уведомление ведёт на «План на завтра»", all.some((n) => n.id >= 2100000020 && n.route === "/plan-tomorrow"));
  ok("вечер: в тексте погода на завтра и состояние плана", all.filter((n) => n.id >= 2100000020).some((n) => /дождь/.test(n.largeBody) && /В плане на завтра/.test(n.largeBody)));

  // ── главный экран ──
  await p.evaluate(() => (location.hash = "#/")); await p.waitForTimeout(800);
  const brief = await p.locator("#day-brief").innerText();
  const evening = new Date().getHours() >= 18;
  ok("на главном экране есть сводка: " + (evening ? "завтра" : "сегодня"), evening ? /Завтра/.test(brief) : /Сегодня/.test(brief) && /86,4 кг/.test(brief) && /недел/.test(brief));

  // ── нажатие на уведомление ──
  await p.evaluate(() => window.__listener && window.__listener({ notification: { extra: { route: "/plan-tomorrow" } } })); await p.waitForTimeout(500);
  ok("нажатие на вечернее уведомление открывает план на завтра", /plan-tomorrow/.test(await p.url()));

  // ── копия: настройки едут в файл ──
  const ex = await p.evaluate(async () => { const r = await window.__api("GET", "/account/export"); return JSON.parse(new TextDecoder().decode(r.body)).phoneExtras; });
  ok("в копии есть daily и dayPlans", ex && ex.daily && ex.daily.city.includes("Казань") && ex.dayPlans && Object.keys(ex.dayPlans).length === 1);

  // ── выключатель ──
  await p.evaluate(() => (location.hash = "#/settings")); await p.waitForTimeout(500);
  await p.evaluate(() => { const l = [...document.querySelectorAll("#daily-card .check-row")].find((x) => /Утренняя/.test(x.innerText)); l.querySelector("input").click(); });
  await p.waitForTimeout(1200);
  const n0 = await p.evaluate(() => window.__sched.length);
  await p.evaluate(() => window.__api("POST", "/tasks", { title: "Ещё одна" })); await p.waitForTimeout(1000);
  const after = await p.evaluate(() => window.__sched.slice(-1)[0]);
  ok("утренняя сводка выключена: утренних уведомлений нет", after.every((n) => !(n.id >= 2100000010 && n.id < 2100000020)));
  console.log("ERRORS", errs); await b.close();
})();
