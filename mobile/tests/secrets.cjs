// Ключи ИИ не должны попадать в файл копии, отчёт об ошибке и журнал, даже если сервис вернул ключ в тексте ошибки.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = [];  p.on("pageerror", e => errs.push(e.message));
  const SECRET = "sk-ant-SECRETSECRETSECRET123456", G = "AIzaSECRETGEMINI1234567890", S = "svc-SECRET-987654321";
  await p.route("https://api.anthropic.com/**", r => r.fulfill({ status: 500, body: "boom " + SECRET }));
  await p.route("https://generativelanguage.googleapis.com/**", r => r.fulfill({ status: 500, body: "bad key " + G + " " + r.request().url() }));
  await p.route("https://openrouter.ai/**", r => r.fulfill({ status: 500, body: "x " + S }));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(([a, g, s]) => { localStorage.setItem("navigator-settings", JSON.stringify({ anthropicApiKey: a, geminiApiKey: g, services: [{ id: "svc:x", name: "OR", baseUrl: "https://openrouter.ai/api/v1", model: "m", key: s, enabled: true }] })); return window.__api("PUT", "/profile", { onboardingDone: true }); }, [SECRET, G, S]);
  for (let i = 0; i < 3; i++) await p.evaluate(() => window.__api("POST", "/ai/chat", { message: "тест " + Math.random() }));
  const exp = await p.evaluate(() => window.__api("GET", "/account/export").then(r => typeof r.body === "string" ? r.body : JSON.stringify(r.body)));
  const stored = await p.evaluate(() => (localStorage.getItem("navigator:errors") ?? "") + (localStorage.getItem("navigator:ai-health") ?? ""));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(600);
  const page = await p.evaluate(() => document.body.innerText);
  const leaks = (t) => [SECRET, G, S].filter(x => t.includes(x)).length;
  console.log("в файле копии ключей:", leaks(exp), "| в журнале ошибок и состоянии:", leaks(stored), "| в тексте экрана настроек:", leaks(page));
  console.log("ERRORS", errs); await b.close();
})();
