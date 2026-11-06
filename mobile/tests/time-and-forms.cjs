// Время: граница суток, смена часового пояса, летнее время. Формы: двойные нажатия. Кнопка «Назад».
const { chromium } = require("playwright");
const BAD = [];
(async () => {
  const b = await chromium.launch();
  const mkPage = async (tz, iso) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block", timezoneId: tz });
    await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
    const p = await ctx.newPage(); p.on("pageerror", e => BAD.push("pageerror " + e.message)); p.on("dialog", d => d.accept());
    if (iso) await p.clock.install({ time: new Date(iso) });
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
    p.api = (m, path, body) => p.evaluate(([m, path, body]) => window.__api(m, path, body).then(r => ({ s: r.status, b: r.body })), [m, path, body]);
    return p;
  };
  // 1. запись в 23:50 по Киеву — «сегодня»; в 00:10 следующего дня — уже «вчера»
  let p = await mkPage("Europe/Kyiv", "2026-11-02T21:50:00Z"); // 23:50 Киев (UTC+2)
  await p.api("PUT", "/profile", { onboardingDone: true, timezone: "Europe/Kyiv" });
  await p.api("POST", "/journal", { content: "запись перед полуночью", private: false });
  const t1 = await p.api("GET", "/home"); console.log("home:", JSON.stringify(t1.b).slice(0, 200));
  await p.clock.fastForward(20 * 60 * 1000); // 00:10
  const t2 = await p.api("GET", "/today"); const stillToday = JSON.stringify(t2.b).includes("перед полуночью");
  console.log("00:10 следующего дня запись уже не «сегодняшняя»:", !stillToday);
  if (stillToday) BAD.push("граница суток: запись прошлого дня осталась в «Сегодня»");
  // 2. телефон в другом поясе, чем профиль: ничего не падает, задачи на «сегодня» считаются по поясу профиля
  await p.api("POST", "/tasks", { title: "на сегодня", deadline: new Date().toISOString() });
  for (const r of ["/tasks?view=today", "/week", "/calendar", "/reminders", "/budget"]) { const x = await p.api("GET", r); if (x.s >= 500) BAD.push(`5xx ${r} ${x.s}`); }
  await p.context().close();
  // 3. летнее время: переход в Киеве 25 октября 2026 (03:00 → 02:00). Напоминание «каждый день» в 03:30 не должно прыгать на полчаса/сутки
  p = await mkPage("Europe/Kyiv", "2026-10-24T20:00:00Z");
  await p.api("PUT", "/profile", { onboardingDone: true, timezone: "Europe/Kyiv" });
  const rem = await p.api("POST", "/reminders", { title: "ежедневное", triggerAt: "2026-10-25T01:30:00.000Z", recurrence: "daily" });
  console.log("напоминание создано:", rem.s, JSON.stringify(rem.b).slice(0, 90));
  if (rem.s < 400) {
    const id = rem.b.id; const times = [];
    for (let i = 0; i < 4; i++) { const r = await p.api("GET", "/reminders"); const it = (r.b.reminders || r.b).find(x => x.id === id); if (!it) break; times.push(it.triggerAt); await p.api("POST", `/reminders/${id}/fire`).catch(() => {}); break; }
    console.log("время срабатывания:", times.join(" "));
  }
  await p.context().close();
  // 4. формы: быстрые повторные нажатия не плодят дубли
  p = await mkPage("Europe/Kyiv");
  await p.api("PUT", "/profile", { onboardingDone: true });
  const count = async (path, key) => { const r = await p.api("GET", path); const arr = Array.isArray(r.b) ? r.b : (r.b[key] ?? r.b.items ?? []); return arr.length; };
  const tripleClick = async (label) => p.evaluate((label) => { const bt = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === label); if (!bt) return false; bt.click(); bt.click(); bt.click(); return true; }, label);
  const forms = [
    ["tasks", "Добавить", async () => p.fill('input[placeholder="Новая задача"]', "дубль-задача"), "/tasks?view=all", "tasks"],
    ["goals", "Добавить", async () => { await p.click("text=+ Новая цель"); await p.fill('input[placeholder="Название цели"]', "дубль-цель"); }, "/goals", "goals"],
  ];
  for (const [route, label, fill, path, key] of forms) {
    await p.goto("http://localhost:8099/#/" + route); await p.reload(); await p.waitForTimeout(500);
    const before = await count(path, key); await fill(); const ok = await tripleClick(route === "goals" ? "Создать" : label); await p.waitForTimeout(700);
    const after = await count(path, key); console.log(`${route}: тройное нажатие «${label}» → новых: ${after - before}${ok ? "" : " (кнопка не найдена)"}`);
    if (after - before > 1) BAD.push(`дубли в ${route}: ${after - before}`);
  }
  // 5. кнопка «Назад»: переходы по вкладкам и возврат
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(300);
  for (const r of ["journal", "tasks", "me", "settings"]) { await p.goto("http://localhost:8099/#/" + r); await p.waitForTimeout(150); }
  const trail = [];
  for (let i = 0; i < 4; i++) { await p.goBack(); await p.waitForTimeout(250); trail.push(await p.evaluate(() => location.hash)); }
  console.log("назад по истории:", trail.join(" ← "));
  console.log("экран после «Назад» не пустой:", (await p.evaluate(() => document.body.innerText.trim().length)) > 20);
  await p.context().close();
  console.log("\nНАЙДЕНО:", BAD.length); BAD.forEach(x => console.log(" •", x));
  await b.close();
})();
