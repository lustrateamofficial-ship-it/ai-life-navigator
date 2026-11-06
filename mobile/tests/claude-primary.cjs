// Ключ Claude главный; при отказе Claude приложение отвечает через бесплатные ключи.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const calls = [];
  let claudeFails = false;
  await p.route("https://api.anthropic.com/**", r => { const h = r.request().headers(); const body = JSON.parse(r.request().postData() || "{}"); calls.push({ who: "claude", key: h["x-api-key"], model: body.model });
    if (claudeFails) return r.fulfill({ status: 402, body: "no credit" });
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: "Ответ от Claude" }] }) }); });
  await p.route("https://generativelanguage.googleapis.com/**", r => { calls.push({ who: "gemini" }); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "Ответ от Gemini" }] } }] }) }); });
  await p.route("https://api.groq.com/**", r => { calls.push({ who: "groq" }); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: "Ответ от Groq" } }] }) }); });
  await p.route("https://api.openai.com/**", r => { calls.push({ who: "openai", auth: r.request().headers()["authorization"] }); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: "Ответ от ChatGPT" } }] }) }); });
  await p.route("https://api.deepseek.com/**", r => { calls.push({ who: "deepseek" }); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: "Ответ от DeepSeek" } }] }) }); });
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem("navigator-settings", JSON.stringify({ anthropicApiKey: "sk-ant-TEST1234567890123456", geminiApiKey: "AIzaTEST12345678901234567", aiOrder: ["anthropic"] })); return window.__api("PUT", "/profile", { onboardingDone: true }); });
  const chat = () => p.evaluate(() => window.__api("POST", "/ai/chat", { message: "Привет, как мне лучше спланировать день?" }).then(r => ({ s: r.status, b: JSON.stringify(r.body).slice(0, 160) })));
  let r = await chat(); console.log("1) со всеми ключами:", r.s, r.b, "| вызовы:", calls.map(c => c.who).join(","));
  const claudeOnly = calls.length > 0 && calls.every(c => c.who === "claude");
  console.log("   только Claude:", claudeOnly, "| ключ передан:", calls[0]?.key === "sk-ant-TEST1234567890123456", "| модель:", calls[0]?.model);
  calls.length = 0; claudeFails = true; r = await chat();
  console.log("2) Claude отказал (402):", r.s, r.b, "| вызовы:", calls.map(c => c.who).join(","), "| ответили запасные:", calls.some(c => c.who === "gemini"));
  calls.length = 0; await p.evaluate(() => localStorage.setItem("navigator-settings", JSON.stringify({ anthropicApiKey: "sk-ant-TEST1234567890123456" })));
  r = await chat(); console.log("3) только Claude и он отказал:", r.s, r.b);
  // главный по выбору и цепочка запасных
  const set = o => p.evaluate(o => localStorage.setItem("navigator-settings", JSON.stringify(o)), o);
  calls.length = 0; claudeFails = false;
  await set({ anthropicApiKey: "sk-ant-TEST1234567890123456", openaiApiKey: "sk-TESTOPENAI", deepseekApiKey: "dsk-TEST", primaryAi: "deepseek" });
  r = await chat(); console.log("4) главный DeepSeek:", r.b, "| вызовы:", calls.map(c => c.who).join(","));
  calls.length = 0; claudeFails = true; await set({ anthropicApiKey: "sk-ant-TEST1234567890123456", openaiApiKey: "sk-TESTOPENAI" });
  r = await chat(); console.log("5) Claude отказал, есть ChatGPT:", r.b, "| вызовы:", calls.map(c => c.who).join(","), "| ключ OpenAI передан:", calls.find(c => c.who === "openai")?.auth === "Bearer sk-TESTOPENAI");
  calls.length = 0; await set({ deepseekApiKey: "dsk-TEST" }); r = await chat(); console.log("6) только DeepSeek:", r.b);
  // по умолчанию бесплатные первыми, платные только в конце
  calls.length = 0; claudeFails = false;
  await set({ anthropicApiKey: "sk-ant-TEST1234567890123456", openaiApiKey: "sk-TESTOPENAI", deepseekApiKey: "dsk-TEST", geminiApiKey: "AIzaTEST12345678901234567" });
  r = await chat(); console.log("7) по умолчанию при бесплатном Gemini и платных ключах:", r.b.slice(0, 40), "| вызовы:", calls.map(c => c.who).join(","), "| только бесплатный:", calls.length > 0 && calls.every(c => c.who === "gemini"));
  console.log("ERRORS", errs); await b.close();
})();
