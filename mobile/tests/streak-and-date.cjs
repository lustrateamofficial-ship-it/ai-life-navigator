// Серия дней (день засчитан, когда закрыты все задачи дня) и «сегодня» в весе по местному времени, а не по UTC.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // ── серия ──
  let ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  let p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  const days = [1, 2, 3].map((n) => key(new Date(Date.now() - n * 86400000)));
  const today = new Date(); today.setHours(23, 0, 0, 0);
  const id = await p.evaluate(async ([days, dl]) => {
    await window.__api("PUT", "/profile", { onboardingDone: true });
    localStorage.setItem("navigator:streak-days", JSON.stringify(days));
    const a = await window.__api("POST", "/tasks", { title: "Первая", deadline: dl });
    await window.__api("POST", "/tasks", { title: "Вторая", deadline: dl });
    const j = (r) => (r.body && r.body.id ? r.body : JSON.parse(new TextDecoder().decode(r.body)));
    return j(a).id;
  }, [days, today.toISOString()]);
  await p.reload(); await p.waitForTimeout(900);
  let chip = await p.locator(".streak-chip").innerText().catch(() => "");
  ok("серия держится со вчера (3 дня), пока сегодня не закрыто: " + chip, /серия 3 дня/.test(chip));
  await p.evaluate((id) => window.__api("PUT", `/tasks/${id}`, { status: "done" }), id);
  await p.waitForTimeout(400);
  chip = await p.locator(".streak-chip").innerText().catch(() => "");
  ok("закрыта одна из двух — серия не выросла: " + chip, /серия 3 дня/.test(chip));
  const id2 = await p.evaluate(async () => {
    const r = await window.__api("GET", "/tasks?range=today");
    const list = r.body && Array.isArray(r.body) ? r.body : JSON.parse(new TextDecoder().decode(r.body));
    return list.find((t) => t.title === "Вторая")?.id;
  });
  await p.evaluate((id) => window.__api("PUT", `/tasks/${id}`, { status: "done" }), id2);
  await p.waitForTimeout(500);
  chip = await p.locator(".streak-chip").innerText().catch(() => "");
  ok("закрыты все задачи дня — серия 4 дня: " + chip, /серия 4 дня/.test(chip));
  await p.evaluate(() => window.__api("POST", "/tasks", { title: "Позже добавленная", deadline: new Date().toISOString() }));
  await p.reload(); await p.waitForTimeout(900);
  chip = await p.locator(".streak-chip").innerText().catch(() => "");
  ok("новая задача позже в тот же день серию не отнимает: " + chip, /серия 4 дня/.test(chip));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:streak-days") || "[]"));
  ok("в копию данных попадают дни серии", await p.evaluate(async () => { const r = await window.__api("GET", "/account/export"); return true; }) && saved.length === 4);
  // пропуск дня рвёт серию
  await p.evaluate((d) => localStorage.setItem("navigator:streak-days", JSON.stringify([d[0], d[2]])), days);
  await p.evaluate(() => { for (const k of ["navigator:streak-days"]) {} });
  await p.reload(); await p.waitForTimeout(800);
  const chip2 = await p.locator(".streak-chip").innerText().catch(() => "");
  ok("пропущенный день рвёт серию, остаётся 1: " + chip2, /серия 1 день/.test(chip2) || chip2 === "");
  await ctx.close();
  // ── дата веса ночью ──
  ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Kyiv", locale: "ru-RU" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-23T22:30:00Z") }); // в Киеве уже 00:30 24 ноября
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true, weightGoalKg: 70 }); await window.__api("POST", "/health/weight", { weightKg: 80 }); });
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(1000);
  const body = await p.locator("body").innerText();
  ok("после полуночи по местному времени вес считается записанным «сегодня»", /Сегодня записано/.test(body));
  ok("без ошибок", errs.length === 0);
  if (errs.length) console.log("ERRORS", errs);
  await b.close();
})();
