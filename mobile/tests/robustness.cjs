// Грубая проверка устойчивости: ни один маршрут не должен падать (код 500) или бросать исключение
// на пустых, чужих и испорченных данных.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
  const result = await p.evaluate(async () => {
    const a = window.__api; const bad = [];
    const fakeId = "00000000-0000-4000-8000-000000000000";
    const bodies = [undefined, {}, { title: "" }, { content: "" }, { title: 5 }, { amount: "abc" }, { date: "не дата" }, null, [], "строка"];
    const paths = [];
    for (const base of ["goals","tasks","habits","calendar","reminders","ideas","memory","journal","finance/income","finance/expenses","finance/debts","finance/savings","health/weight","health/food","mission","profile","mood","account","home/observation","home/week-summary","home/goal-suggestions","ai/chat","ai/next-action","ai/analyze","portrait/generate","simulation/future","analytics/snapshot","week","week/earlier"]) paths.push(base);
    for (const base of ["goals","tasks","habits","calendar","reminders","ideas","memory","journal","finance/transactions","finance/debts","finance/savings"]) { paths.push(base + "/" + fakeId); paths.push(base + "/not-a-uuid"); }
    for (const path of paths) for (const method of ["GET","POST","PUT","DELETE"]) for (const body of bodies) {
      try { const r = await a(method, "/" + path, body); if (r.status >= 500) bad.push([method, path, JSON.stringify(body)?.slice(0, 30), r.status, JSON.stringify(r.body)?.slice(0, 80)]); }
      catch (e) { bad.push([method, path, JSON.stringify(body)?.slice(0, 30), "EXC", String(e.message || e).slice(0, 100)]); }
    }
    return { total: paths.length * 4 * bodies.length, bad };
  });
  console.log("запросов:", result.total, "| сбоев:", result.bad.length);
  const seen = new Set();
  for (const x of result.bad) { const k = x[0] + " " + x[1] + " " + x[3]; if (!seen.has(k)) { seen.add(k); console.log(" ", x.join(" | ")); } if (seen.size > 25) break; }
  console.log("ERRORS", errs);
  await b.close();
})();
