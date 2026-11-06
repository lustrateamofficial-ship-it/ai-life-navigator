const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  p.on("dialog", d => d.accept());
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  const earlier = () => p.evaluate(async () => (await window.__api("GET", "/week/earlier")).body.entry);
  await p.evaluate(async () => {
    const a = window.__api;
    await a("PUT", "/profile", { onboardingDone: true });
    for (const [t, pr] of [["Месяц назад: обычная запись", false], ["Год назад: личная запись", true], ["Год назад: не хочу жить, всё бессмысленно", false], ["Неделю назад: обычная запись", false]]) await a("POST", "/journal", { content: t, private: pr });
  });
  // сдвигаем даты записей: выгрузка → правка createdAt → восстановление (перезапись по id)
  await p.evaluate(async () => {
    const exp = await window.__api("GET", "/account/export");
    const data = JSON.parse(new TextDecoder().decode(exp.body));
    const ago = d => new Date(Date.now() - d * 86400e3).toISOString();
    for (const e of data.journalEntries) {
      if (e.content.startsWith("Месяц")) e.createdAt = ago(30);
      else if (e.content.startsWith("Год назад: личная")) e.createdAt = ago(365);
      else if (e.content.startsWith("Год назад: не хочу")) e.createdAt = ago(365);
      else if (e.content.startsWith("Неделю")) e.createdAt = ago(7);
    }
    const r = await window.__api("POST", "/account/restore", data);
    window.__restored = r.status;
  });
  let e = await earlier();
  console.log("1. выбрана запись:", e && e.label, "|", e && e.content);
  console.log("   личная и тяжёлая годовалые пропущены:", e && e.label === "Месяц назад");
  // убираем месячную → остаётся недельная
  await p.evaluate(async () => { for (const j of (await window.__api("GET", "/journal")).body.entries.filter(x => x.content.startsWith("Месяц"))) await window.__api("DELETE", "/journal/" + j.id); });
  e = await earlier(); console.log("2. следующая по сроку:", e && e.label);
  await p.reload(); await p.waitForTimeout(900);
  const txt = (await p.innerText("body")).replace(/\n+/g, " | ");
  console.log("3. карточка на главном экране:", txt.includes("Неделю назад") && txt.includes("Неделю назад: обычная запись"));
  console.log("ERRORS", errs);
  await b.close();
})();
