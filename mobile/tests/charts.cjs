// Графики: кольцо дня, полоса жизни, финансы по месяцам и категориям.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(async () => {
    await window.__api("PUT", "/profile", { onboardingDone: true });
    const today = new Date(); today.setHours(23, 0, 0, 0);
    const a = await window.__api("POST", "/tasks", { title: "Сделанная", deadline: today.toISOString() });
    await window.__api("POST", "/tasks", { title: "Открытая 1", deadline: today.toISOString() });
    await window.__api("POST", "/tasks", { title: "Открытая 2", deadline: today.toISOString() });
    await window.__api("POST", "/tasks", { title: "Без даты, не в плане" });
    const id = a.body && a.body.id ? a.body.id : JSON.parse(new TextDecoder().decode(a.body)).id;
    await window.__api("PUT", `/tasks/${id}`, { status: "done" });
    localStorage.setItem("navigator:home-layout", JSON.stringify({ morning: ["ring"], day: ["ring"], evening: ["ring"] }));
  });
  await p.goto("http://localhost:8099/#/"); await p.reload(); await p.waitForTimeout(900);
  const ring = await p.locator(".ring-card svg").getAttribute("aria-label");
  ok("кольцо дня: сделана 1 из 3 (задача без даты не считается): " + ring, ring === "Сделано 1 из 3");
  ok("в кольце виден счёт 1/3", (await p.locator(".ring-card text").textContent()).replace(/\s/g, "") === "1/3");
  // финансы
  await p.evaluate(async () => {
    const d = (m, day) => new Date(new Date().getFullYear(), new Date().getMonth() - m, day, 12).toISOString();
    await window.__api("POST", "/finance/income", { amount: 50000, category: "Зарплата", date: d(0, 1) });
    await window.__api("POST", "/finance/income", { amount: 48000, category: "Зарплата", date: d(1, 1) });
    await window.__api("POST", "/finance/expenses", { amount: 12000, category: "Еда", date: d(0, 2) });
    await window.__api("POST", "/finance/expenses", { amount: 8000, category: "Жильё", date: d(0, 3) });
    await window.__api("POST", "/finance/expenses", { amount: 30000, category: "Еда", date: d(1, 2) });
  });
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: /Финансы/ }).click(); await p.waitForTimeout(600);
  const label = await p.locator("svg[aria-label^='Доходы и расходы']").getAttribute("aria-label");
  ok("график по месяцам: суммы по месяцам верные", /окт 48\D?000 и 30\D?000/.test(label) && /ноя 50\D?000 и 20\D?000/.test(label));
  const cats = await p.locator(".cat-list li").allInnerTexts();
  ok("категории расходов месяца: Еда и Жильё, крупная первой", cats.length === 2 && /Еда/.test(cats[0]) && /Жильё/.test(cats[1]));
  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
