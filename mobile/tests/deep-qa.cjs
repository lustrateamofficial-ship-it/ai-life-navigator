// Тестировщик: консоль, сеть, вредный ввод, длинные тексты, крупный шрифт, двойные нажатия, странные числа.
const { chromium } = require("playwright");
const ROUTES = ["", "journal", "tasks", "goals", "me", "analytics", "calendar", "reminders", "ideas", "memory", "settings", "trash"];
const BAD = [];
const note = (k, v) => BAD.push(k + ": " + v);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 360, height: 760 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage();
  p.on("pageerror", e => note("pageerror", e.message));
  p.on("console", m => { if (["error", "warning"].includes(m.type())) note("console." + m.type(), m.text().slice(0, 160)); });
  p.on("requestfailed", r => { if (!r.url().includes("api.")) note("requestfailed", r.url().slice(0, 100)); });
  p.on("dialog", d => d.accept());
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  const api = (m, path, body) => p.evaluate(([m, path, body]) => window.__api(m, path, body).then(r => ({ s: r.status, b: r.body })), [m, path, body]);
  await api("PUT", "/profile", { onboardingDone: true });

  // B. вредный ввод и C. длинные тексты
  const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'&amp;`;
  const LONG = "я".repeat(6000), WORDS = "слово ".repeat(5000), EMOJI = "👨‍👩‍👧‍👦🏳️‍🌈 مرحبا עברית ​‮";
  const mk = [["POST", "/journal", { content: XSS, private: false }], ["POST", "/journal", { content: LONG, private: false }], ["POST", "/journal", { content: WORDS, private: false }], ["POST", "/journal", { content: EMOJI, private: false }],
    ["POST", "/tasks", { title: XSS }], ["POST", "/tasks", { title: LONG.slice(0, 200) }], ["POST", "/goals", { title: XSS }], ["POST", "/goals", { title: "ж".repeat(200) }],
    ["POST", "/ideas", { content: XSS }], ["POST", "/memory", { type: "principle", content: XSS }], ["POST", "/calendar", { title: XSS, startsAt: new Date().toISOString() }], ["POST", "/reminders", { title: XSS, triggerAt: new Date(Date.now() + 3600e3).toISOString() }]];
  for (const [m, path, body] of mk) { const r = await api(m, path, body); if (r.s >= 500) note("создание", `${m} ${path} → ${r.s} ${JSON.stringify(r.b).slice(0, 80)}`); }
  const big = await api("POST", "/journal", { content: "x".repeat(300000), private: false }); console.log("запись 300 000 знаков:", big.s);

  // A. все экраны: переполнение по ширине, обрезанный текст, крупный шрифт
  for (const scale of [1, 2]) {
    await p.evaluate(s => { document.documentElement.style.fontSize = (16 * s) + "px"; }, scale);
    for (const r of ROUTES) {
      await p.goto("http://localhost:8099/#/" + r); await p.reload(); await p.waitForTimeout(400);
      await p.evaluate(s => { document.documentElement.style.fontSize = (16 * s) + "px"; }, scale);
      const o = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, xss: window.__xss }));
      if (o.over > 1) note("горизонтальная прокрутка", `/${r} шрифт×${scale}: +${o.over}px`);
      if (o.xss) note("XSS СРАБОТАЛ", "/" + r);
      const wide = await p.evaluate(() => [...document.querySelectorAll("body *")].filter(e => { const rc = e.getBoundingClientRect(); return rc.width > 0 && rc.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map(e => e.tagName + "." + String(e.className).slice(0, 20) + " " + Math.round(e.getBoundingClientRect().right)));
      if (wide.length) note("выходит за экран", `/${r} ×${scale}: ${wide.join("; ")}`);
    }
  }
  await p.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await p.goto("http://localhost:8099/#/journal"); await p.reload(); await p.waitForTimeout(500);
  const txt = await p.evaluate(() => document.body.innerText);
  console.log("текст XSS показан буквально:", txt.includes('<img src=x'), "| эмодзи на месте:", txt.includes("🏳️‍🌈"));

  // G. двойные нажатия
  await p.goto("http://localhost:8099/#/"); await p.reload(); await p.waitForTimeout(500);
  const before = (await api("GET", "/journal")).b.entries.length;
  await p.fill("textarea", "двойное нажатие");
  await p.evaluate(() => { const bt = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Записать"); bt.click(); bt.click(); bt.click(); });
  await p.waitForTimeout(800);
  const after = (await api("GET", "/journal")).b.entries.length; console.log("после тройного нажатия «Записать» новых записей:", after - before);
  if (after - before !== 1) note("двойная запись", `${after - before} вместо 1`);

  // H. пустой и пробельный ввод
  for (const [m, path, body] of [["POST", "/journal", { content: "   ", private: false }], ["POST", "/tasks", { title: "  " }], ["POST", "/goals", { title: "" }], ["POST", "/ideas", { content: " " }], ["POST", "/memory", { type: "principle", content: "" }]]) {
    const r = await api(m, path, body); if (r.s < 400) note("пустое принято", `${path} → ${r.s}`);
  }
  // I. странные числа
  for (const v of [0, -5, 1e9, 1e15, NaN, "12,5", "abc", null, 0.0001, 700]) {
    const r = await api("POST", "/health/weight", { weightKg: v }).catch(() => ({ s: -1 }));
    const r2 = await api("POST", "/finance/expenses", { amount: v, category: "Еда" }).catch(() => ({ s: -1 }));
    if (r.s >= 500 || r2.s >= 500) note("число вызвало 5xx", `${JSON.stringify(v)} вес ${r.s} расход ${r2.s}`);
    if (r.s < 400 && (typeof v !== "number" || v <= 0 || v > 500 || !isFinite(v))) note("вес принят зря", JSON.stringify(v) + " → " + r.s);
    if (r2.s < 400 && (typeof v !== "number" || v <= 0 || !isFinite(v) || v > 1e12)) note("расход принят зря", JSON.stringify(v) + " → " + r2.s);
  }
  const uniq = [...new Set(BAD)];
  console.log("\nНАЙДЕНО:", uniq.length); uniq.slice(0, 40).forEach(x => console.log(" •", x));
  await b.close();
})();
