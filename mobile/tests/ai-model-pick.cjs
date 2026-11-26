// Подбор модели не по названию: сервис отвергает старое имя, приложение берёт список моделей у сервиса и выбирает текстовую.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const used = { mistral: [], cohere: [], nolist: [] };
  const mistralList = ["mistral-embed", "mistral-moderation-latest", "mistral-ocr-latest", "pixtral-12b-2409", "codestral-latest", "mistral-large-2512", "mistral-small-2603", "voxtral-mini-transcribe", "open-mistral-nemo"];
  await p.route("https://api.mistral.ai/v1/**", (r) => {
    const u = r.request().url();
    if (/\/models$/.test(u)) return r.fulfill({ json: { data: mistralList.map((id) => ({ id })) } });
    const m = JSON.parse(r.request().postData()).model; used.mistral.push(m);
    if (m === "mistral-small-latest") return r.fulfill({ status: 404, json: { message: "Model not found: mistral-small-latest" } });
    return r.fulfill({ json: { choices: [{ message: { content: "ок" } }] } });
  });
  await p.route("https://api.cohere.ai/**", (r) => {
    const u = r.request().url();
    if (/\/models$/.test(u)) return r.fulfill({ json: { data: [{ id: "embed-v4.0" }, { id: "rerank-v3.5" }, { id: "command-a-vision-07-2025" }, { id: "command-a-03-2025" }, { id: "command-r7b-12-2024" }] } });
    const m = JSON.parse(r.request().postData()).model; used.cohere.push(m);
    return r.fulfill({ json: { choices: [{ message: { content: "ок" } }] } });
  });
  await p.route("https://nolist.example.com/**", (r) => {
    const u = r.request().url(); used.nolist.push(u);
    if (/\/models$/.test(u)) return r.fulfill({ status: 404, json: { error: "no" } });
    return r.fulfill({ status: 404, json: { error: { message: "model not found" } } });
  });
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => {
    localStorage.setItem("navigator-settings", JSON.stringify({ services: [
      { id: "svc:m", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", key: "k1", enabled: true, paid: false },
      { id: "svc:c", name: "Cohere", baseUrl: "https://api.cohere.ai/compatibility/v1", model: "", key: "k2", enabled: true, paid: false },
      { id: "svc:n", name: "Без списка", baseUrl: "https://nolist.example.com/v1", model: "x", key: "k3", enabled: true, paid: false },
    ] }));
    return window.__api("PUT", "/profile", { onboardingDone: true });
  });
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll("details.fold").forEach((d) => { d.open = true; })); await p.waitForTimeout(200);
  await p.evaluate(() => { for (const bt of document.querySelectorAll("button")) if (/^Проверить$/.test(bt.textContent.trim())) bt.click(); }); await p.waitForTimeout(3500);
  const bad = /embed|moderation|ocr|transcribe|rerank|vision/;
  ok("Mistral: старое имя отвергнуто, взята текстовая модель из списка сервиса: " + used.mistral.join(" → "), used.mistral[0] === "mistral-small-latest" && used.mistral.length >= 2 && !bad.test(used.mistral[1]));
  ok("Cohere без названия модели: подобрана чат-модель, не embed/rerank/vision: " + used.cohere.join(", "), used.cohere.length >= 1 && !used.cohere.some((m) => bad.test(m)) && /command/.test(used.cohere[0]));
  const cache = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator:ai-models") || "{}"));
  ok("рабочие модели запомнены: " + JSON.stringify(cache), cache["svc:m"] && cache["svc:m"] !== "mistral-small-latest" && /command/.test(cache["svc:c"] || ""));
  const body = await p.locator("body").innerText();
  ok("два сервиса показывают «Работает», сервис без списка моделей «Не работает»", (body.match(/Работает/g) || []).length >= 2 && /Не работает/.test(body));
  ok("запрос списка моделей идёт только после отказа, не каждый раз", used.mistral.length <= 3);
  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
