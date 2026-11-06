const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
  // 1. устойчивость к плохому файлу копии: данные не должны пострадать
  const integ = await p.evaluate(async () => {
    const a = window.__api;
    await a("POST", "/tasks", { title: "Важная задача" });
    const before = (await a("GET", "/tasks")).body.length;
    const r1 = await a("POST", "/account/restore", { exportVersion: 1, tasks: [{ title: "ok" }, { title: 5, status: "нет такого" }], goals: "не массив" });
    const r2 = await a("POST", "/account/restore", { мусор: true });
    const r3 = await a("POST", "/account/restore", null);
    const after = (await a("GET", "/tasks")).body.length;
    return { before, after, statuses: [r1.status, r2.status, r3.status] };
  });
  console.log("плохие копии:", JSON.stringify(integ), "| данные целы:", integ.after === integ.before || integ.after === integ.before + 1);
  // 2. объём: три года ежедневных записей и много задач
  const t0 = Date.now();
  const made = await p.evaluate(async () => {
    const a = window.__api; const exp = (await a("GET", "/account/export")).body; const data = JSON.parse(new TextDecoder().decode(exp));
    const long = "Сегодня был обычный день, много дел и мыслей. ".repeat(12);
    data.journalEntries = []; data.tasks = []; data.weightLogs = []; data.transactions = [];
    for (let i = 0; i < 1100; i++) {
      const d = new Date(Date.now() - i * 86400e3).toISOString();
      data.journalEntries.push({ id: "j" + i, content: long + i, isPrivate: i % 7 === 0, createdAt: d });
      data.weightLogs.push({ date: d.slice(0, 10) + "T00:00:00.000Z", weightKg: 80 + (i % 10) / 10 });
      data.transactions.push({ type: i % 3 ? "expense" : "income", amount: 100 + i, category: "К" + (i % 9), date: d });
      for (let k = 0; k < 3; k++) data.tasks.push({ title: "Задача " + i + "-" + k, status: i % 2 ? "done" : "todo", completedAt: i % 2 ? d : null, createdAt: d });
    }
    const t = performance.now(); const r = await a("POST", "/account/restore", data); return { status: r.status, ms: Math.round(performance.now() - t), summary: r.body.summary };
  });
  console.log("восстановление 1100 дней:", made.status, made.ms + " мс", JSON.stringify({ записей: made.summary.journalEntries, задач: made.summary.tasks }));
  const timing = await p.evaluate(async () => {
    const a = window.__api; const out = {};
    for (const [k, m, path] of [["журнал", "GET", "/journal"], ["задачи", "GET", "/tasks?range=all"], ["сегодня", "GET", "/home"], ["неделя", "GET", "/week"], ["раньше", "GET", "/week/earlier"], ["аналитика", "GET", "/analytics"], ["запись", "POST", "/journal"]]) {
      const t = performance.now(); await a(m, path, m === "POST" ? { content: "новая", private: false } : undefined); out[k] = Math.round(performance.now() - t);
    }
    return out;
  });
  console.log("время запросов, мс:", JSON.stringify(timing));
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  // 3. перезапуск: загрузка большой базы с диска
  const t1 = Date.now(); await p.reload(); await p.waitForFunction(() => document.body.innerText.includes("Сегодня"), null, { timeout: 20000 }); console.log("загрузка приложения с большой базой, мс:", Date.now() - t1);
  const size = await p.evaluate(async () => { const e = await window.__api("GET", "/account/export"); return e.body.length; });
  console.log("размер выгрузки, КБ:", Math.round(size / 1024));
  console.log("ERRORS", errs);
  await b.close();
})();
