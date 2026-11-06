const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("navigator-debug", "1"); localStorage.setItem("navigator-settings", JSON.stringify({ geminiApiKey: "test" })); });
  await ctx.route("**/generativelanguage.googleapis.com/**", async (route) => {
    const out = { tasks: [{ title: "Купить молоко", deadline: null }], reminders: [], ideas: [{ content: "Завести сад" }], transactions: [{ type: "expense", amount: 500, category: "Продукты", comment: null }], weight: { weightKg: 80 }, food: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  const txt = async (n = 300) => (await p.innerText("body")).replace(/\n+/g, " | ").slice(0, n);
  const go = async (h) => { await p.goto("http://localhost:8099/#" + h); await p.waitForTimeout(600); };
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
  await p.getByText("Начать без записи").click(); await p.waitForTimeout(900);
  await p.locator("textarea").first().fill("Надо купить молоко и завести сад. Потратил 500 на продукты, вес 80.");
  await p.getByRole("button", { name: "Записать" }).first().click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: "u2.png", fullPage: true });
  console.log("review:", (await txt(600)));
  const add = p.getByRole("button", { name: /Добавить \(/ });
  console.log("add btn", await add.count());
  if (await add.count()) { await add.click(); await p.waitForTimeout(1200); console.log("после добавления:", await txt(500)); }
  await go("/tasks");
  console.log("tasks:", await txt(200));
  await p.getByLabel("отметить выполненной").first().click(); await p.waitForTimeout(600);
  console.log("после отметки:", await txt(250));
  await go("/me");
  await p.getByRole("button", { name: "Записать" }).first().click().catch(()=>{});
  console.log("me:", (await txt(500)));
  console.log("ERRORS", errs);
  await b.close();
})();
