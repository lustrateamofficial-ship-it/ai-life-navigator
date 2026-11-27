// 1.34: праздник при выполнении всех задач дня: один раз в день, можно выключить, закрывается касанием.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true }); for (const t of ["Раз", "Два", "Три"]) await window.__api("POST", "/tasks", { title: t, deadline: new Date().toISOString().slice(0, 10) + "T12:00:00.000Z" }); });
  await p.goto("http://localhost:8099/#/plans?tab=tasks"); await p.reload(); await p.waitForTimeout(900);
  const done = async () => { await p.getByLabel("отметить выполненной").first().click(); await p.waitForTimeout(700); };
  await done(); await done();
  ok("пока одна задача осталась, праздника нет", (await p.locator(".celebrate").count()) === 0);
  await p.getByLabel("отметить выполненной").first().click();
  ok("все три выполнены: праздник показан", await p.waitForSelector(".celebrate", { timeout: 5000 }).then(() => true).catch(() => false));
  ok("картинка и холст на месте", (await p.locator(".celebrate img").count()) === 1 && (await p.locator("canvas.celebrate-canvas").count()) === 1);
  const gif = await p.evaluate(() => fetch("./celebrate.gif").then((r) => r.ok && r.headers.get("content-type")));
  const mp3 = await p.evaluate(() => fetch("./celebrate.mp3").then((r) => r.ok && r.headers.get("content-type")));
  ok("файлы гифки и музыки отдаются: " + gif + ", " + mp3, !!gif && !!mp3);
  await p.waitForTimeout(3200); await p.screenshot({ path: "/tmp/w/ego/celebrate.png" });
  await p.getByRole("button", { name: "Ура!" }).click(); await p.waitForTimeout(300);
  ok("закрывается кнопкой", (await p.locator(".celebrate").count()) === 0);
  // второй раз за день не показывается
  await p.evaluate(async () => { await window.__api("POST", "/tasks", { title: "Четыре", deadline: new Date().toISOString().slice(0, 10) + "T12:00:00.000Z" }); });
  await p.reload(); await p.waitForTimeout(800); await p.getByLabel("отметить выполненной").first().click(); await p.waitForTimeout(1200);
  ok("повторно в тот же день не показывается", (await p.locator(".celebrate").count()) === 0);
  // выключатель и просмотр из настроек
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await p.getByRole("button", { name: "Посмотреть" }).click(); await p.waitForTimeout(400);
  ok("кнопка «Посмотреть» в настройках показывает праздник", (await p.locator(".celebrate").count()) === 1);
  await p.locator(".celebrate").click({ position: { x: 5, y: 5 } }); await p.waitForTimeout(300);
  ok("закрывается касанием фона", (await p.locator(".celebrate").count()) === 0);
  console.log("ERRORS", JSON.stringify(errs)); await b.close();
})();
