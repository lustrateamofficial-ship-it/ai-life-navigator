// Испорченные настройки ИИ не должны ронять приложение.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const errs = [];
  const cases = ["{не json", "null", "[]", '{"services":"x","aiOrder":5,"primaryAi":7}', '{"services":[null,1,{"id":3}],"aiOrder":[null,{}],"geminiApiKey":123}', '{"services":[{"id":"svc:a","name":"A","baseUrl":"ftp://x","model":"","key":"k","enabled":true}]}'];
  for (const c of cases) {
    const ctx = await b.newContext({ serviceWorkers: "block" }); await ctx.addInitScript(([c]) => { localStorage.setItem("navigator-debug", "1"); localStorage.setItem("navigator-settings", c); localStorage.setItem("navigator:ai-health", "мусор"); }, [c]);
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(c.slice(0, 20) + " → " + e.message));
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
    await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
    const r = await p.evaluate(() => window.__api("POST", "/ai/chat", { message: "привет" }).then(r => r.status));
    for (const route of ["settings", "", "me"]) { await p.goto("http://localhost:8099/#/" + route); await p.reload(); await p.waitForTimeout(350); }
    const alive = await p.locator("nav, .tabbar, [class*=nav]").count() > 0;
    console.log("настройки", JSON.stringify(c).slice(0, 40).padEnd(42), "чат:", r, "| экран жив:", alive);
    await ctx.close();
  }
  console.log("ERRORS", errs); await b.close();
})();
