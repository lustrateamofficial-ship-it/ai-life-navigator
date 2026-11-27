// 1.33: правка задачи (срок, напоминание, полный текст), кольцо дня, шторка «+» тянется вниз, шапки, пропуск дня.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  const long = "Позвонить врачу и записаться на приём, уточнить, нужны ли анализы заранее, и не забыть полис";
  await p.evaluate(async (t) => { await window.__api("PUT", "/profile", { onboardingDone: true }); await window.__api("POST", "/tasks", { title: t }); }, long);
  await p.goto("http://localhost:8099/#/plans?tab=tasks"); await p.reload(); await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Все" }).click(); await p.waitForTimeout(300);
  await p.getByLabel("изменить").first().click(); await p.waitForTimeout(300);
  const ta = p.getByLabel("Название задачи");
  const full = await ta.evaluate((e) => e.scrollHeight <= e.clientHeight + 2);
  ok("при правке виден весь текст задачи", full);
  const day = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10);
  await p.locator(".task-edit input[type=date]").fill(day);
  await p.locator(".task-edit input[type=datetime-local]").fill(day + "T09:30");
  await p.getByRole("button", { name: "Сохранить" }).click(); await p.waitForTimeout(700);
  const t = await p.evaluate(async () => (await window.__api("GET", "/tasks?range=all")).body[0]);
  ok("срок изменён: " + t.deadline, (t.deadline || "").startsWith(day));
  ok("напоминание привязано к задаче: " + t.remindAt, !!t.remindAt);
  // кольцо дня
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(900);
  await p.locator("button:has(svg[aria-label*='Кольцо'], svg[role=img])").first().click().catch(() => {}); await p.waitForTimeout(500);
  ok("тап по кольцу ведёт к задачам: " + p.url(), p.url().includes("plans"));
  // шторка тянется вниз
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(500);
  await p.getByLabel("Создать").click(); await p.waitForTimeout(400);
  const h = await p.locator(".sheet-head").boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + 10); await p.mouse.down(); await p.mouse.move(h.x + h.width / 2, h.y + 260, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(600);
  ok("шторка «+» закрывается, если потянуть за полоску вниз", (await p.locator(".sheet").count()) === 0);
  console.log("ERRORS", JSON.stringify(errs)); await b.close();
})();
