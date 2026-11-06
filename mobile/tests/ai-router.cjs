// Маршрутизатор ИИ: порядок, пауза при лимите, ключ не принят, все на паузе, интерфейс.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const calls = []; const mode = { cerebras: 200, mistral: 200, openrouter: 200 };
  const ok = t => JSON.stringify({ choices: [{ message: { content: t } }] });
  for (const [name, host] of [["cerebras", "api.cerebras.ai"], ["mistral", "api.mistral.ai"], ["openrouter", "openrouter.ai"]]) {
    await p.route(`https://${host}/**`, r => { calls.push(name); const st = mode[name]; r.fulfill({ status: st, contentType: "application/json", body: st === 200 ? ok("Ответ " + name) : "{}" }); });
  }
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  const svc = (id, name, host, model) => ({ id, name, baseUrl: `https://${host}/v1`, model, key: "key-" + id, enabled: true });
  await p.evaluate(s => { localStorage.setItem("navigator-settings", JSON.stringify(s)); localStorage.removeItem("navigator:ai-health"); return window.__api("PUT", "/profile", { onboardingDone: true }); },
    { services: [svc("svc:a", "Cerebras", "api.cerebras.ai", "m1"), svc("svc:b", "Mistral", "api.mistral.ai", "m2"), svc("svc:c", "OpenRouter", "openrouter.ai", "openrouter/free")] });
  const chat = () => p.evaluate(() => window.__api("POST", "/ai/chat", { message: "Привет, помоги спланировать день" }).then(r => r.status + " " + JSON.stringify(r.body).slice(0, 60)));
  calls.length = 0; console.log("1) первый в очереди:", await chat(), "|", calls.join(","));
  mode.cerebras = 429; calls.length = 0; console.log("2) лимит у первого:", await chat(), "|", calls.join(","));
  calls.length = 0; console.log("3) следующий запрос обходит паузу:", await chat(), "|", calls.join(","));
  mode.mistral = 401; mode.cerebras = 200; calls.length = 0; await p.evaluate(() => localStorage.removeItem("navigator:ai-health"));
  mode.cerebras = 429; console.log("4) первые два сбоят:", await chat(), "|", calls.join(","));
  mode.openrouter = 500; calls.length = 0; console.log("5) все на паузе, пробуем всё равно:", await chat(), "|", calls.join(","));
  mode.cerebras = 200; mode.mistral = 200; mode.openrouter = 200; calls.length = 0; console.log("6) лимит снят, всё на паузе → пробует и получает ответ:", await chat(), "|", calls.join(","));
  // интерфейс
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(600);
  console.log("карточка видна:", await p.locator("text=Очередь ИИ").count() > 0);
  await p.click('button[aria-label="Поднять Mistral выше"]'); await p.waitForTimeout(200);
  console.log("порядок после ↑:", JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem("navigator-settings")).aiOrder.slice(0, 3))));
  await p.locator("text=Проверить").first().click(); await p.waitForTimeout(800);
  console.log("проверка показала:", (await p.locator("text=/работает \\(|не вышло/").first().textContent().catch(() => "—")));
  await p.click("text=Подключить ещё сервис"); await p.selectOption("#svc-preset", "mistral"); await p.fill("#svc-key", "kk"); await p.click("button:has-text('Добавить')");
  console.log("без модели берётся из шаблона, сервис добавлен:", await p.evaluate(() => JSON.parse(localStorage.getItem("navigator-settings")).services.length) === 4);
  await p.click("text=Подключить ещё сервис"); await p.selectOption("#svc-preset", "custom"); await p.fill("#svc-key", "kk"); await p.fill("#svc-url", "http://плохой"); await p.fill("#svc-model", "m"); await p.click("button:has-text('Добавить')");
  console.log("http-адрес отклонён:", await p.locator("text=https://").count() > 0);
  await p.screenshot({ path: "/tmp/claude-0/router.png", fullPage: false });
  console.log("ERRORS", errs); await b.close();
})();
