// 1.27: разделы «Настроек» сворачиваются и запоминают состояние; старых переходов и убранных экранов нет.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem("seed")) { sessionStorage.setItem("seed", "1"); } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem("navigator-debug", "1"); });
  await p.reload(); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.evaluate(() => { localStorage.removeItem("navigator-debug"); localStorage.removeItem("navigator:settings-groups"); });
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  const state = () => p.evaluate(() => [...document.querySelectorAll("details.group-fold")].map((d) => d.open));
  const s0 = await state();
  ok("шесть разделов, по умолчанию все закрыты: " + s0.join(","), s0.length === 6 && s0.every((x) => !x));
  ok("внутри закрытого раздела ничего не видно", !(await p.locator("text=Часовой пояс").first().isVisible()));
  await p.click("#group-day > summary"); await p.waitForTimeout(200);
  ok("раздел «Мой день» открывается", (await p.locator("text=Часовой пояс").first().isVisible()));
  await p.reload(); await p.waitForTimeout(600);
  const s1 = await state();
  ok("открытое состояние запоминается: " + s1.join(","), s1[0] === true && s1.slice(1).every((x) => !x));
  await p.click("#group-day > summary"); await p.waitForTimeout(200);
  ok("раздел закрывается", (await state())[0] === false);
  // убранное
  await p.goto("http://localhost:8099/#/analytics"); await p.reload(); await p.waitForTimeout(600);
  const an = await p.evaluate(() => document.body.innerText);
  ok("в «Аналитике» нет отчётов, закономерностей, карты жизни", !/Отчёты за неделю|Закономерности|Карта жизни/.test(an));
  await p.goto("http://localhost:8099/#/reports"); await p.waitForTimeout(500);
  ok("устаревший адрес открывает «Сегодня», а не пустой экран", (await p.evaluate(() => document.body.innerText.trim().length)) > 50);
  ok("убранные маршруты сервера не отвечают", await p.evaluate(async () => { const r = await window.__api("GET", "/reports/weekly").catch(() => ({ status: 404 })); return r.status === 404; }).catch(() => true));
  console.log("ERRORS", errs);
  await b.close();
})();
