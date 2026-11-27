// 1.32: плитки главного экрана настраиваются в «Настройках»; одинокая «половинка» растягивается, дыр нет.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.evaluate(() => localStorage.setItem("navigator:home-layout", JSON.stringify({ today: ["week","ring","weight","focus"] })));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  ok("раздел «Плитки главного экрана» есть", await p.locator("#group-home").count() === 1);
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); await p.waitForTimeout(200);
  const rows = await p.locator("#group-home .tile-row:not(.off)").count();
  ok("в разделе видны переключатели плиток: " + rows, rows === 4);
  // ring и weight рядом -> обе половинки
  const widths = async () => p.evaluate(() => [...document.querySelectorAll(".home-grid > [data-block]")].map((e) => [e.dataset.block, Math.round(e.getBoundingClientRect().width)]));
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(800);
  let w = await widths(); const full = Math.max(...w.map((x) => x[1]));
  ok("кольцо и вес стоят рядом, каждая вдвое уже: " + JSON.stringify(w), w.find((x) => x[0]==="ring")[1] < full * 0.6 && w.find((x) => x[0]==="weight")[1] < full * 0.6);
  // выключаем «Вес» в настройках: «Кольцо» остаётся одно и растягивается
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await p.locator("#group-home").getByRole("switch", { name: "Вес: показывать" }).click();
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(800);
  w = await widths();
  ok("плитки «Вес» нет", !w.find((x) => x[0]==="weight"));
  ok("одинокое «Кольцо» на всю ширину: " + JSON.stringify(w), w.find((x) => x[0]==="ring")[1] >= full - 2);
  // перестановка стрелкой с клавиатуры
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await p.locator("#group-home").getByLabel("Кольцо дня: перетащить").focus(); await p.keyboard.press("ArrowDown");
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(500);
  const order = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:home-layout")).today);
  ok("порядок меняется и сохраняется: " + order.join(","), order.join(",") === "week,focus,ring");
  console.log("ERRORS", errs);
  await b.close();
})();
