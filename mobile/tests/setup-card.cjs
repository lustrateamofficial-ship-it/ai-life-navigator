const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true })); await p.reload(); await p.waitForTimeout(600);
  console.log("плашка видна:", await p.locator("text=Быстрая настройка").count() > 0);
  await p.fill('input[aria-label="Ключ ИИ"]', "abc"); await p.click("text=Сохранить ключ");
  console.log("короткий ключ отклонён:", await p.locator("text=слишком коротким").count() > 0);
  await p.fill('input[aria-label="Ключ ИИ"]', "AIzaSyTEST_KEY_1234567890abcdef"); await p.click("text=Сохранить ключ");
  console.log("ключ сохранён:", await p.evaluate(() => JSON.parse(localStorage.getItem("navigator-settings")).geminiApiKey) === "AIzaSyTEST_KEY_1234567890abcdef", "| блок ключа скрыт:", await p.locator('input[aria-label="Ключ ИИ"]').count() === 0);
  await p.screenshot({ path: "/tmp/claude-0/setup.png" });
  await p.click("text=Позже"); console.log("после «Позже» скрыта:", await p.locator("text=Быстрая настройка").count() === 0);
  await p.reload(); await p.waitForTimeout(500); console.log("после перезагрузки скрыта:", await p.locator("text=Быстрая настройка").count() === 0);
  console.log("ERRORS", errs); await b.close();
})();
