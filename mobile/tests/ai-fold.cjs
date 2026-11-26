// Блок «Помощник ИИ» в настройках сворачивается; при вводе ключа не захлопывается.
const { chromium } = require("playwright");
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
 await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1")); const p = await ctx.newPage();
 await p.goto("http://localhost:8099/"); await p.waitForTimeout(500); await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
 await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
 const d = p.locator("details.fold", { hasText: "Помощник ИИ" }).first();
 const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
 ok("без ключей блок ИИ раскрыт", await d.evaluate((e) => e.open));
 await p.getByLabel(/Ключ Gemini/).fill("AIzaTEST"); await p.getByRole("button", { name: "Сохранить ключи" }).click(); await p.waitForTimeout(500);
 await d.locator(":scope > summary").click(); await p.waitForTimeout(200); ok("блок сворачивается", !(await d.evaluate((e) => e.open)));
 await p.reload(); await p.waitForTimeout(800);
 const d2 = p.locator("details.fold", { hasText: "Помощник ИИ" }).first();
 ok("с ключом блок при входе свёрнут и показывает число ключей", !(await d2.evaluate((e) => e.open)) && (await d2.locator(":scope > summary").innerText()).includes("ключей: 1"));
 await d2.locator(":scope > summary").click(); ok("блок раскрывается обратно", await d2.evaluate((e) => e.open));
 await b.close(); })();
