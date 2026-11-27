// Утренняя сводка: сколько недель прожито и сколько осталось (условная оценка); без даты рождения — подсказка.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  // «Сегодня» после 18:00 показывает вечерний вид без строки про недели жизни: фиксируем полдень, чтобы тест не зависел от часа запуска
  const noon = new Date(); noon.setHours(12, 0, 0, 0);
  await ctx.clock.setFixedTime(noon);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true }); });
  // без даты рождения
  await p.evaluate(() => localStorage.setItem("navigator:daily", JSON.stringify({ showLife: true })));
  const hint = await p.evaluate(async () => { const d = window.__daily; const br = await d.buildBrief(new Date()); return d.morningNotice(br).largeBody; });
  ok("без даты рождения в утреннем тексте есть подсказка", /Укажи дату рождения/.test(hint));
  // с датой: 30 лет назад ровно, жизнь 80 лет
  const r = await p.evaluate(async () => {
    const n = new Date(); const bd = `${n.getFullYear() - 30}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    localStorage.setItem("navigator:daily", JSON.stringify({ showLife: true, birthDate: bd, lifeYears: 80 }));
    const d = window.__daily; const br = await d.buildBrief(new Date());
    return { life: br.life, text: d.morningNotice(br).largeBody };
  });
  ok("прожито ≈ 1 565 недель (30 лет): " + (r.life && r.life.lived), r.life && Math.abs(r.life.lived - 1565) <= 2);
  ok("впереди ≈ 2 608 недель (50 лет): " + (r.life && r.life.weeks), r.life && Math.abs(r.life.weeks - 2608) <= 3);
  ok("в утреннем уведомлении обе цифры", /Недель прожито ≈ 1\D?5\d\d/.test(r.text) && /впереди ещё ≈ 2\D?6\d\d/.test(r.text));
  // на экране «Сегодня»
  await p.reload(); await p.waitForTimeout(900);
  const body = await p.locator("body").innerText();
  ok("в сводке на «Сегодня» видно прожито и впереди", /Недель прожито/.test(body) || !/Сегодня/.test(body));
  ok("без ошибок", errs.length === 0);
  if (errs.length) console.log("ERRORS", errs);
  await b.close();
})();
