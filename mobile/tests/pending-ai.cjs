// Если все ИИ-сервисы недоступны при сохранении записи: запись цела, разбор ждёт в очереди и доделывается сам.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  let status = 429;
  const JSONP = (t) => JSON.stringify({ choices: [{ message: { content: t } }] });
  const answer = JSON.stringify({ tasks: [{ title: "Купить хлеб", deadline: null }], reminders: [], ideas: [], transactions: [], weight: null, food: [] });
  await p.route("https://api.mistral.ai/**", r => r.fulfill({ status, contentType: "application/json", body: status === 200 ? JSONP(answer) : "{}" }));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem("navigator-settings", JSON.stringify({ services: [{ id: "svc:a", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "m", key: "k", enabled: true }] })); return window.__api("PUT", "/profile", { onboardingDone: true }); });
  await p.reload(); await p.waitForTimeout(900);
  const save = async (t) => { await p.fill("textarea[aria-label='Запись в дневник']", t); await p.locator("button:has-text('Записать'), button:has-text('Сохранить')").first().click(); await p.waitForTimeout(1800); };
  await save("Завтра надо купить хлеб");
  const q1 = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-pending") || "[]"));
  ok("все сервисы ответили лимитом: запись в очереди (" + q1.length + ")", q1.length === 1);
  ok("человеку сказали, что ИИ недоступен и разбор будет позже", /ИИ сейчас недоступен/.test(await p.locator("body").innerText()));
  const entries = await p.evaluate(async () => (await window.__api("GET", "/journal")).body.entries.length);
  ok("сама запись сохранена", entries === 1);
  ok("на главном экране «Ждёт ИИ: 1»", /Ждёт ИИ: 1/.test(await p.locator("#ready-analyses").innerText()));
  // сервис ожил
  status = 200; await p.evaluate(() => localStorage.removeItem("navigator:ai-health"));
  await p.getByRole("button", { name: "Попробовать сейчас" }).click(); await p.waitForTimeout(1500);
  const card = await p.locator("#ready-analyses").innerText();
  ok("после «Попробовать сейчас» очередь пуста, предложение готово: Купить хлеб", /Купить хлеб/.test(card) && !/Ждёт ИИ/.test(card));
  ok("очередь в хранилище пуста, готовое одно", await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-pending") || "[]").length === 0 && JSON.parse(localStorage.getItem("navigator:ai-ready") || "[]").length === 1));
  const before = await p.evaluate(async () => (await window.__api("GET", "/tasks")).body.length);
  ok("пока не подтверждено, задача не создана", before === 0);
  await p.locator("#ready-analyses").getByRole("button", { name: /Добавить/ }).click(); await p.waitForTimeout(800);
  const after = await p.evaluate(async () => (await window.__api("GET", "/tasks")).body.map(t => t.title));
  ok("после подтверждения задача создана: " + after, after.includes("Купить хлеб"));
  await p.waitForTimeout(3000);
  ok("карточка исчезла сама", (await p.locator("#ready-analyses").count()) === 0);
  // нет интернета
  await ctx.setOffline(true); await save("Позвонить врачу в пятницу");
  const q2 = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-pending") || "[]"));
  ok("без интернета запись тоже в очереди", q2.length === 1);
  await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event("online"))); await p.waitForTimeout(2500);
  ok("со связью очередь разобралась сама", await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-pending") || "[]").length === 0));
  // личные записи не попадают в ИИ и в очередь
  status = 429; await p.evaluate(() => { localStorage.removeItem("navigator:ai-health"); localStorage.setItem("navigator:ai-ready", "[]"); });
  await p.reload(); await p.waitForTimeout(800);
  ok("переключателя «личная запись» нет", (await p.locator(".private-toggle").count()) === 0); await save("Запись для ИИ");
  const q3 = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-pending") || "[]"));
  ok("запись при недоступном ИИ встала в очередь", q3.length === 1);
  console.log("ERRORS", errs); await b.close();
})();
