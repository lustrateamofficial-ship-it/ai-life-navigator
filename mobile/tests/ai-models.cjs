// Подбор моделей Gemini и Groq (старое название закрыто для нового ключа), подробность ошибок, поле возраста.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const seen = []; let geminiKeyOk = true, groqOld = true;
  await p.route("https://generativelanguage.googleapis.com/**", r => {
    const u = r.request().url(); seen.push(u.replace(/key=[^&]+/, "key=*"));
    if (!geminiKeyOk) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }) });
    if (/\/models\?/.test(u)) return r.fulfill({ json: { models: [
      { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.1-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.1-flash-lite-preview", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] } ] } });
    if (/gemini-2\.5-flash-lite:/.test(u)) return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "This model models/gemini-2.5-flash-lite is no longer available to new users." } }) });
    return r.fulfill({ json: { candidates: [{ content: { parts: [{ text: "ок" }] } }] } });
  });
  await p.route("https://api.groq.com/**", r => {
    const u = r.request().url();
    if (/\/models$/.test(u)) return r.fulfill({ json: { data: [{ id: "llama-3.3-70b-versatile" }, { id: "whisper-large-v3" }, { id: "openai/gpt-oss-20b" }] } });
    const m = JSON.parse(r.request().postData() || "{}").model;
    if (m === "openai/gpt-oss-120b" && groqOld) return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "The model `openai/gpt-oss-120b` does not exist" } }) });
    return r.fulfill({ json: { choices: [{ message: { content: "ок " + m } }] } });
  });
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem("navigator-settings", JSON.stringify({ geminiApiKey: "AIzaSECRETKEY123", groqApiKey: "gsk_secret" })); return window.__api("PUT", "/profile", { onboardingDone: true }); });
  await p.reload(); await p.waitForTimeout(800);
  const t = async (id) => p.evaluate(async (id) => { const m = await import("/app.js").catch(() => null); return null; }, id);
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll("details.fold").forEach((d) => { d.open = true; })); await p.waitForTimeout(200); // очередь ИИ теперь внутри блока «Помощник ИИ»
  const rows = p.locator("button:has-text('Проверить')");
  await p.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/^Проверить$/.test(b.textContent.trim())) b.click(); }); await p.waitForTimeout(3000);
  const body = await p.locator("body").innerText();
  ok("Gemini: старая модель закрыта, взята новая и проверка успешна", /Работает/.test(body) && seen.some(u => /gemini-3\.1-flash-lite:generateContent/.test(u)) && !seen.some(u => /preview|embedding/.test(u.split("?")[0]) && /generateContent/.test(u)));
  ok("Gemini: выбрана «lite» новее, а не обычная flash", !seen.some(u => /gemini-3\.6-flash:generateContent/.test(u)));
  ok("Groq: модели нет, выбрана доступная из списка", (body.match(/Работает/g) || []).length >= 2);
  const cache = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-models") || "{}"));
  ok("рабочие модели запомнены: " + JSON.stringify(cache), cache.gemini === "gemini-3.1-flash-lite" && cache.groq === "llama-3.3-70b-versatile");
  // неверный ключ: понятная причина без ключа в тексте
  geminiKeyOk = false; await p.evaluate(() => localStorage.removeItem("navigator:ai-models"));
  await p.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/^Проверить$/.test(b.textContent.trim())) b.click(); }); await p.waitForTimeout(2500);
  const body2 = await p.locator("body").innerText();
  ok("неверный ключ: видно причину «API key not valid»", /Не работает/.test(body2) && /API key not valid/.test(await p.locator("body").textContent()));
  ok("ключ в тексте ошибки не показывается", !/AIzaSECRETKEY123/.test(body2));
  // поле возраста
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  const f = p.locator("#daily-life");
  await f.fill(""); ok("возраст можно стереть полностью", (await f.inputValue()) === "");
  await f.fill("75"); ok("и вписать другой: 75", (await f.inputValue()) === "75");
  await f.fill("5"); await f.blur(); ok("недопустимое значение при выходе возвращается к последнему верному (75)", (await f.inputValue()) === "75");
  await f.fill("90"); await f.blur(); await p.reload(); await p.waitForTimeout(600);
  ok("90 сохранилось", (await p.locator("#daily-life").inputValue()) === "90");
  console.log("ERRORS", errs); await b.close();
})();
