const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; const dialogs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("dialog", d => { dialogs.push(d.message().split("\n")[0]); d.dismiss(); });
  const txt = async () => (await p.innerText("body")).replace(/\n+/g, " | ");
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(async () => { const a = window.__api; await a("PUT", "/profile", { onboardingDone: true }); await a("POST", "/tasks", { title: "Старое название" }); await a("POST", "/goals", { title: "Моя цель" }); await a("POST", "/journal", { content: "тест", private: false }); });
  await p.goto("http://localhost:8099/#/tasks"); await p.reload(); await p.waitForTimeout(800);
  // правка
  await p.getByLabel("изменить").first().click();
  await p.getByLabel("Название задачи").fill("Новое название"); await p.getByRole("button", { name: "Готово" }).click(); await p.waitForTimeout(600);
  console.log("переименована:", (await txt()).includes("Новое название"));
  // удаление: сначала отказ, потом согласие
  await p.getByLabel("удалить").first().click(); await p.waitForTimeout(300);
  console.log("после отказа осталась:", (await txt()).includes("Новое название"), "| вопрос:", dialogs[0]);
  p.removeAllListeners("dialog"); p.on("dialog", d => d.accept());
  await p.getByLabel("удалить").first().click(); await p.waitForTimeout(600);
  console.log("после согласия удалена:", !(await txt()).includes("Новое название"));
  // цель
  await p.goto("http://localhost:8099/#/goals"); await p.waitForTimeout(700);
  await p.getByLabel("удалить цель").click(); await p.waitForTimeout(600);
  console.log("цель удалена:", !(await txt()).includes("Моя цель"));
  // запись дневника
  await p.goto("http://localhost:8099/#/journal"); await p.waitForTimeout(700);
  await p.getByLabel("удалить").first().click(); await p.waitForTimeout(600);
  console.log("запись удалена:", !(await txt()).includes("тест"));
  console.log("ERRORS", errs);
  await b.close();
})();
