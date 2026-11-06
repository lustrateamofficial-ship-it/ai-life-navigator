// Полный круг копии: заполнить все разделы, выгрузить, добавить мусор, восстановить, выгрузить снова, сравнить.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  const call = (m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await window.__api(m, path, body); return { s: r.status, body: r.body instanceof Uint8Array ? Array.from(r.body) : r.body }; }, [m, path, body]);
  await call("PUT", "/profile", { onboardingDone: true });
  const d = (n) => new Date(Date.now() + n * 86400e3).toISOString();
  const seed = [
    ["POST", "/journal", { content: "обычная запись", private: false }], ["POST", "/journal", { content: "личная запись", private: true }],
    ["POST", "/tasks", { title: "разовая", deadline: d(2) }], ["POST", "/tasks", { title: "повтор", deadline: d(1), recurrence: "weekly" }],
    ["POST", "/goals", { title: "цель", reason: "потому что" }], ["POST", "/ideas", { content: "идея" }], ["POST", "/memory", { type: "principle", content: "принцип" }],
    ["POST", "/calendar", { title: "встреча", startTime: d(3), endTime: d(3.05) }], ["POST", "/reminders", { title: "напомнить", triggerAt: d(1), recurrence: "daily" }],
    ["POST", "/health/weight", { weightKg: 81.5 }], ["POST", "/health/food", { text: "200 г риса" }],
    ["POST", "/finance/income", { amount: 90000, category: "Зарплата" }], ["POST", "/finance/expenses", { amount: 1234, category: "Еда" }],
    ["POST", "/finance/debts", { title: "долг", totalAmount: 5000, remainingAmount: 4000 }], ["POST", "/finance/savings", { title: "копилка", targetAmount: 10000, currentAmount: 1000 }],
    ["POST", "/habits", { title: "зарядка" }],
  ];
  const res = []; for (const [m, path, body] of seed) { const r = await call(m, path, body); res.push(`${path}:${r.s}`); }
  console.log("создано:", res.join(" "));
  await call("PUT", "/budget", { category: "Еда", limit: 5000 });
  const ex1 = await call("GET", "/account/export"); const t1 = Buffer.from(ex1.body).toString("utf8"); const j1 = JSON.parse(t1);
  console.log("в выгрузке разделов:", Object.keys(j1).length, "| размер", t1.length);
  const strip = (v) => Array.isArray(v) ? v.map(strip).sort((a, c) => JSON.stringify(a).localeCompare(JSON.stringify(c))) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !/^(id|userId|exportedAt|updatedAt|.*Id)$/.test(k)).map(([k, x]) => [k, strip(x)])) : v;
  const NOCREATED = new Set(["profile", "habits", "transactions", "reminders", "weightLogs", "foodLogs", "debts", "savingsGoals", "calendarEvents"]);
  const compare = (A, B, label) => { let diffs = 0; const drop = (o, k) => NOCREATED.has(k) ? JSON.parse(JSON.stringify(o ?? null), (kk, v) => kk === "createdAt" ? undefined : v) : o; A = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, drop(v, k)])); B = Object.fromEntries(Object.entries(B).map(([k, v]) => [k, drop(v, k)])); for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { const a = JSON.stringify(strip(A[k])), c = JSON.stringify(strip(B[k])); if (a !== c) { diffs++; console.log("  РАЗЛИЧИЕ", label, k, "\n    до:", a.slice(0, 150), "\n    после:", c.slice(0, 150)); } } console.log(label + ": разделов с различиями:", diffs); return diffs; };
  // 1) повторное восстановление того же файла в то же приложение ничего не удваивает
  const rs = await call("POST", "/account/restore", j1); console.log("повторное восстановление:", rs.s, JSON.stringify(rs.body.summary).slice(0, 260));
  const ex2 = await call("GET", "/account/export"); const j2 = JSON.parse(Buffer.from(ex2.body).toString("utf8"));
  compare(j1, j2, "повтор в те же данные");
  // 2) добавленное после выгрузки не удаляется и не дублируется
  await call("POST", "/journal", { content: "ЛИШНЯЯ", private: false });
  await call("POST", "/account/restore", j1);
  const j3 = JSON.parse(Buffer.from((await call("GET", "/account/export")).body).toString("utf8"));
  console.log("новая запись осталась:", JSON.stringify(j3).includes("ЛИШНЯЯ"), "| копий «обычная запись»:", (JSON.stringify(j3).match(/обычная запись/g) || []).length);
  // 3) в чистое приложение (новая переустановка)
  const ctx2 = await b.newContext({ serviceWorkers: "block" }); await ctx2.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p2 = await ctx2.newPage(); p2.on("pageerror", e => errs.push(e.message)); await p2.goto("http://localhost:8099/"); await p2.waitForTimeout(500);
  const rs2 = await p2.evaluate(async (j) => { const r = await window.__api("POST", "/account/restore", j); const e = await window.__api("GET", "/account/export"); return { s: r.status, ex: Array.from(e.body) }; }, j1);
  const j4 = JSON.parse(Buffer.from(rs2.ex).toString("utf8")); console.log("в чистое приложение:", rs2.s);
  compare(j1, j4, "в чистое приложение");
  console.log("ERRORS", errs); await b.close();
})();
