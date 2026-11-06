// Параллельные запросы: ничего не теряется и не дублируется, после перезагрузки всё на месте.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  const r = await p.evaluate(async () => {
    const a = window.__api;
    const created = await Promise.all(Array.from({ length: 150 }, (_, i) => a("POST", "/tasks", { title: "П" + i })));
    const ids = created.map(x => x.body.id);
    const uniq = new Set(ids).size;
    await Promise.all(ids.slice(0, 75).map(id => a("PUT", "/tasks/" + id, { status: "done" })));
    await Promise.all(ids.slice(75, 100).map(id => a("DELETE", "/tasks/" + id)));
    // одновременные записи веса за один день: должна остаться одна запись
    await Promise.all(Array.from({ length: 10 }, (_, i) => a("POST", "/health/weight", { weightKg: 80 + i / 10 })));
    const all = (await a("GET", "/tasks?range=all")).body;
    const weights = (await a("GET", "/health/weight")).body.logs.length;
    const trash = (await a("GET", "/trash")).body.length;
    return { uniq, total: all.length, done: all.filter(t => t.status === "done").length, weights, trash };
  });
  console.log("создано разных:", r.uniq === 150, "| осталось 125:", r.total === 125, "| выполнено 75:", r.done === 75, "| вес за день одной записью:", r.weights === 1, "| в корзине 25:", r.trash === 25);
  await p.reload(); await p.waitForTimeout(800);
  const after = await p.evaluate(async () => { const a = window.__api; return { total: (await a("GET", "/tasks?range=all")).body.length, trash: (await a("GET", "/trash")).body.length }; });
  console.log("после перезагрузки то же:", after.total === 125 && after.trash === 25);
  console.log("ERRORS", errs);
  await b.close();
})();
