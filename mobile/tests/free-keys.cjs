// Постоянные поля ключей для пяти бесплатных сервисов в настройках.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll("details.fold").forEach((d) => { d.open = true; })); await p.waitForTimeout(200);
  for (const id of ["geminiApiKey", "groqApiKey", "free-openrouter", "free-mistral", "free-nvidia", "free-cloudflare", "free-cohere"])
    ok("поле ключа есть: " + id, (await p.locator("#" + id).count()) === 1);
  ok("у Cloudflare есть поле Account ID", (await p.locator("#free-cloudflare-acc").count()) === 1);
  await p.fill("#geminiApiKey", "g-key"); await p.fill("#groqApiKey", "q-key");
  await p.fill("#free-openrouter", "or-key"); await p.fill("#free-mistral", "mi-key"); await p.fill("#free-nvidia", "nv-key"); await p.fill("#free-cohere", "co-key");
  await p.fill("#free-cloudflare", "cf-key"); await p.fill("#free-cloudflare-acc", "bad");
  await p.getByRole("button", { name: "Сохранить ключи" }).click(); await p.waitForTimeout(400);
  ok("неверный Account ID: понятная ошибка и ничего не сохранено", /32 букв/.test(await p.locator("body").innerText()) && (await p.evaluate(() => (JSON.parse(localStorage.getItem("navigator-settings") || "{}").services || []).length)) === 0);
  await p.fill("#free-cloudflare-acc", "0123456789abcdef0123456789abcdef");
  await p.getByRole("button", { name: "Сохранить ключи" }).click(); await p.waitForTimeout(500);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator-settings") || "{}"));
  ok("сохранено 5 сервисов: " + (st.services || []).map(s => s.name).join(", "), (st.services || []).length === 5);
  const cf = (st.services || []).find(s => s.id === "svc:preset-cloudflare");
  ok("Cloudflare: Account ID подставлен в адрес", cf && cf.baseUrl.includes("/accounts/0123456789abcdef0123456789abcdef/ai/v1"));
  ok("Gemini и Groq сохранены как раньше", st.geminiApiKey === "g-key" && st.groqApiKey === "q-key");
  const list = await p.locator("body").innerText();
  ok("в очереди ИИ сразу видны все семь сервисов", ["Gemini", "Groq", "OpenRouter", "Mistral", "NVIDIA", "Cloudflare", "Cohere"].every(n => list.includes(n)));
  await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll("details.fold").forEach((d) => { d.open = true; })); await p.waitForTimeout(200);
  ok("после перезапуска ключи на месте", (await p.inputValue("#free-mistral")) === "mi-key" && (await p.inputValue("#free-cloudflare-acc")) === "0123456789abcdef0123456789abcdef");
  await p.fill("#free-mistral", ""); await p.getByRole("button", { name: "Сохранить ключи" }).click(); await p.waitForTimeout(400);
  const st2 = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator-settings") || "{}"));
  ok("пустое поле убирает сервис из очереди", (st2.services || []).length === 4 && !(st2.services || []).some(s => s.id === "svc:preset-mistral"));
  console.log("ERRORS", errs); await b.close();
})();
