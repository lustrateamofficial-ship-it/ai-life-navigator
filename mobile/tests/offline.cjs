// Запись без интернета: с включённым Service Worker, после первой загрузки сеть отключается.
const { chromium } = require("playwright");
const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, acceptDownloads: true });
  await ctx.addInitScript(() => { localStorage.setItem("navigator-debug", "1"); localStorage.setItem("navigator-settings", JSON.stringify({ geminiApiKey: "AIzaTEST12345678901234567" })); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  let aiCalls = 0;
  await ctx.route(/generativelanguage|openrouter|api\.mistral|cohere|nvidia|cloudflare/, route => { aiCalls++; route.abort(); });
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.reload(); await p.waitForTimeout(2500); // Service Worker успевает закэшировать приложение
  ok("Service Worker активен", await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active));

  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(1500);
  const t = await p.innerText("body");
  ok("без сети приложение открывается", t.includes("Записать") && !t.includes("не удалось"));
  await p.fill("textarea", "Запись без интернета: нужно позвонить врачу");
  await p.click("button:has-text('Записать')"); await p.waitForTimeout(1500);
  const body = await p.innerText("body");
  ok("запись сохранена без сети и сказано про ИИ", body.includes("Запись сохранена на телефоне") && body.includes("Без интернета ИИ"));
  ok("ИИ-сервисы без сети не вызывались", aiCalls === 0);
  const n = await p.evaluate(async () => (await window.__api("GET", "/journal")).body.entries.length);
  ok("запись лежит в дневнике", n === 1);

  // после перезапуска без сети запись на месте, поиск и правка работают
  await p.reload(); await p.waitForTimeout(1500);
  await p.goto("http://localhost:8099/#/journal"); await p.waitForTimeout(1200);
  ok("после перезапуска запись видна", (await p.innerText("body")).includes("позвонить врачу"));
  await p.fill("input[type=search]", "врачу"); await p.waitForTimeout(900);
  ok("поиск работает без сети", (await p.locator(".entry-text").count()) === 1);
  await p.fill("input[type=search]", ""); await p.waitForTimeout(600);
  // «В задачи» без сети: понятное сообщение, а не зависание
  await p.locator("button:has-text('В задачи')").first().click(); await p.waitForTimeout(1500);
  const t2 = await p.innerText("body");
  ok("«В задачи» без сети отвечает понятно", /Не получилось|нет дел|Ищу дела/.test(t2) && !/Ищу дела/.test(t2));
  // итог недели без сети
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(800);
  // экспорт EPUB без сети
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(900);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), p.click("button:has-text('Сохранить дневник в EPUB')")]);
  ok("экспорт EPUB работает без сети", !!dl);

  // сеть вернулась: запись остаётся, новая сохраняется, ИИ снова доступен
  await ctx.setOffline(false);
  ok("ИИ не получил пауз из-за отсутствия сети", await p.evaluate(() => { const h = JSON.parse(localStorage.getItem("navigator:ai-health") || "{}"); return !Object.values(h).some(v => v && v.until); }));
  // «Wi-Fi есть, интернета нет»: телефон считает себя онлайн, но запросы обрываются
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(900);
  const before = aiCalls; const t0 = Date.now();
  await p.fill("textarea", "Запись при плохой сети");
  await p.click("button:has-text('Записать')");
  await p.waitForFunction(() => !document.querySelector("textarea") || document.querySelector("textarea").value === "", null, { timeout: 15000 });
  const took = Date.now() - t0;
  ok(`при обрыве сети запись сохраняется быстро (${took} мс), ИИ пробовали ${aiCalls - before} раз`, took < 8000 && aiCalls - before >= 1 && aiCalls - before <= 3);
  ok("обрыв сети не ставит сервисы на паузу", await p.evaluate(() => { const h = JSON.parse(localStorage.getItem("navigator:ai-health") || "{}"); return !Object.values(h).some(v => v && v.until); }));
  console.log("ERRORS", errs);
  await b.close();
})().catch(e => { console.log("СБОЙ ТЕСТА:", e.message.split("\n")[0]); process.exit(0); });
