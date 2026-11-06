// Сквозная итоговая проверка: удаление данных стирает точки, большие данные, сбой хранилища точек, запуск на трёх годах данных.
const { chromium } = require("playwright");
const BAD = []; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) BAD.push(t); };
(async () => {
  const b = await chromium.launch();
  const open = async (init) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1")); if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage(); p.errs = []; p.on("pageerror", e => p.errs.push(e.message)); p.on("dialog", d => d.accept());
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
    p.api = (m, path, body) => p.evaluate(([m, path, body]) => window.__api(m, path, body).then(r => ({ s: r.status, b: r.body })), [m, path, body]);
    return p;
  };
  // 1. «Удалить все данные» стирает и точки восстановления
  console.log("1) удаление данных");
  let p = await open();
  await p.api("PUT", "/profile", { onboardingDone: true }); await p.api("POST", "/journal", { content: "секретная запись", private: false });
  await p.reload(); await p.waitForTimeout(600);
  ok((await p.evaluate(() => window.__safety.listSnapshots())).length > 0, "точка восстановления существует");
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(600);
  await p.click("button:has-text('Удалить все данные')"); await p.fill('input[aria-label="Подтверждение удаления"]', "УДАЛИТЬ"); await p.click("button:has-text('Удалить навсегда')");
  await p.waitForTimeout(2000);
  ok((await p.api("GET", "/journal")).b.entries.length === 0, "сами записи удалены");
  const left = await p.evaluate(async () => { const s = await window.__safety.listSnapshots(); const dump = JSON.stringify(await new Promise(r => { const q = indexedDB.open("navigator-safety"); q.onsuccess = () => { const g = q.result.transaction("snaps").objectStore("snaps").getAll(); g.onsuccess = () => r(g.result); }; })); return { n: s.length, leaked: dump.includes("секретная запись") }; });
  ok(left.n === 0 && !left.leaked, `после «Удалить все данные» точек не осталось, текст записи нигде не хранится (точек: ${left.n})`);
  await p.context().close();
  // 2. три года данных: запуск и точка не тормозят
  console.log("2) большой объём");
  p = await open();
  await p.api("PUT", "/profile", { onboardingDone: true });
  await p.evaluate(async () => { for (let i = 0; i < 1500; i++) { await window.__api("POST", "/journal", { content: "запись номер " + i + " " + "слово ".repeat(40), private: false }); if (i % 3 === 0) await window.__api("POST", "/tasks", { title: "задача " + i }); } });
  const t0 = Date.now(); await p.evaluate(() => window.__safety.createSnapshot("manual", "объём")); const snapMs = Date.now() - t0;
  const size = await p.evaluate(async () => (await window.__safety.listSnapshots()).length);
  ok(snapMs < 3000, `точка на ~2000 записей сохраняется за ${snapMs} мс`);
  const t1 = Date.now(); await p.reload(); await p.waitForSelector("nav, .tabbar, [class*=nav]", { timeout: 15000 }); const bootMs = Date.now() - t1;
  ok(bootMs < 5000, `запуск с большим объёмом и автоточкой за ${bootMs} мс`);
  const cnt = (await p.evaluate(() => window.__safety.listSnapshots())).sort((a, c) => c.at.localeCompare(a.at))[0].counts.JournalEntry; ok(cnt >= 1500, `в точке после перезапуска записей: ${cnt}`);
  await p.context().close();
  // 3. хранилище точек недоступно: приложение должно работать
  console.log("3) сбой хранилища точек");
  p = await open(() => { const real = indexedDB.open.bind(indexedDB); indexedDB.open = (name, v) => { if (name === "navigator-safety") { const r = real("navigator-safety-блок", 1); const fake = {}; setTimeout(() => { fake.error = new Error("нет места"); fake.onerror && fake.onerror({}); }, 0); return fake; } return real(name, v); }; });
  await p.api("PUT", "/profile", { onboardingDone: true }); await p.api("POST", "/journal", { content: "работает без точек", private: false });
  await p.reload(); await p.waitForTimeout(900);
  ok((await p.api("GET", "/journal")).b.entries.some(e => e.content === "работает без точек"), "при сбое хранилища точек приложение запускается, данные целы");
  ok(await p.locator("text=Хранилище недоступно").count() === 0, "ошибка «Хранилище недоступно» не показана");
  console.log("ERRORS", p.errs); BAD.push(...p.errs); await p.context().close();
  await b.close(); console.log(BAD.length ? "\nНЕ ПРОШЛО: " + BAD.length : "\nВсё прошло");
})();
