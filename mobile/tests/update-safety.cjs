// Обновление без потери данных: версия данных, миграции, точки восстановления, защита от старой версии, проверка обновлений.
const { chromium } = require("playwright");
const BAD = [];
const ok = (cond, text) => { console.log((cond ? "  ✓ " : "  ✗ ") + text); if (!cond) BAD.push(text); };
(async () => {
  const b = await chromium.launch();
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
    const p = await ctx.newPage(); p.errs = []; p.on("pageerror", e => p.errs.push(e.message));
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
    p.api = (m, path, body) => p.evaluate(([m, path, body]) => window.__api(m, path, body).then(r => ({ s: r.status, b: r.body })), [m, path, body]);
    return p;
  };
  // --- 1. обычная жизнь: точки восстановления создаются, данные переживают перезапуск ---
  let p = await open();
  await p.api("PUT", "/profile", { onboardingDone: true });
  for (let i = 0; i < 5; i++) await p.api("POST", "/journal", { content: "запись " + i, private: false });
  await p.api("POST", "/tasks", { title: "задача", recurrence: "weekly" });
  await p.evaluate(() => localStorage.setItem("navigator:budget", JSON.stringify({ "Еда": 5000 })));
  console.log("1) точки восстановления");
  await p.reload(); await p.waitForTimeout(700);
  let snaps = await p.evaluate(() => window.__safety.listSnapshots());
  ok(snaps.some(s => s.kind === "daily"), "при первом запуске с данными есть ежедневная точка (" + snaps.map(s => s.kind).join(",") + ")");
  await p.reload(); await p.waitForTimeout(700);
  snaps = await p.evaluate(() => window.__safety.listSnapshots());
  ok(snaps.filter(s => s.kind === "daily").length === 1, "повторный запуск в тот же день не плодит ежедневные точки");
  // --- 2. ручная точка, потом «поломка», потом возврат ---
  await p.evaluate(() => window.__safety.createSnapshot("manual", "тест"));
  await p.api("POST", "/journal", { content: "ЛИШНЯЯ после точки", private: false });
  await p.evaluate(() => localStorage.setItem("navigator:budget", JSON.stringify({ "Еда": 1 })));
  const before = (await p.api("GET", "/journal")).b.entries.length;
  const manual = (await p.evaluate(() => window.__safety.listSnapshots())).find(s => s.kind === "manual");
  await p.evaluate(id => window.__safety.restoreSnapshot(id), manual.id);
  await p.reload(); await p.waitForTimeout(700);
  const after = (await p.api("GET", "/journal")).b.entries;
  ok(after.length === before - 1 && !after.some(e => e.content.includes("ЛИШНЯЯ")), `возврат убрал запись после точки (${before} → ${after.length})`);
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem("navigator:budget")))["Еда"] === 5000, "бюджет тоже вернулся к состоянию точки");
  snaps = await p.evaluate(() => window.__safety.listSnapshots());
  ok(snaps.some(s => s.kind === "rollback"), "перед возвратом сохранена точка «rollback» (возврат можно отменить)");
  const rb = snaps.find(s => s.kind === "rollback");
  await p.evaluate(id => window.__safety.restoreSnapshot(id), rb.id); await p.reload(); await p.waitForTimeout(700);
  ok((await p.api("GET", "/journal")).b.entries.some(e => e.content.includes("ЛИШНЯЯ")), "отмена возврата вернула запись обратно");
  // --- 3. хранение ограничено ---
  for (let i = 0; i < 9; i++) await p.evaluate(() => window.__safety.createSnapshot("manual", "лишняя"));
  snaps = await p.evaluate(() => window.__safety.listSnapshots());
  ok(snaps.filter(s => s.kind !== "daily").length <= 4, "обычных точек не больше 4 (" + snaps.filter(s => s.kind !== "daily").length + ")");
  ok(snaps.filter(s => s.kind === "daily").length >= 1, "ежедневная точка не вытеснена");
  await p.context().close();

  // --- 4. миграция формата данных ---
  console.log("2) миграция данных");
  p = await open();
  await p.api("PUT", "/profile", { onboardingDone: true });
  await p.api("POST", "/goals", { title: "цель А" }); await p.api("POST", "/journal", { content: "до миграции", private: false });
  await p.reload(); await p.waitForTimeout(600);
  const res = await p.evaluate(async () => {
    const m = [{ to: 2, note: "тест", run: t => t.Goal.forEach(g => { g.title = g.title + " (мигр.)"; }) }];
    await window.__safety.bootSafety({ dataVersion: 2, migrations: m });
    const r = await window.__api("GET", "/goals"); return r.body;
  });
  const goals = Array.isArray(res) ? res : res.goals;
  ok(goals.some(g => g.title === "цель А (мигр.)"), "миграция изменила данные");
  const sn = await p.evaluate(() => window.__safety.listSnapshots());
  ok(sn.some(s => s.kind === "migration" && s.dataVersion === 1), "перед миграцией сохранена точка со старой версией данных");
  await p.reload(); await p.waitForTimeout(700); // код всё ещё версии 1, данные уже версии 2 → заморозка
  ok(await p.locator("text=Нужна свежая версия приложения").count() > 0, "данные новее приложения → экран «Нужна свежая версия», записи не трогаются");
  const afterWrite = await p.evaluate(async () => { try { await window.__api("POST", "/journal", { content: "не должна записаться", private: false }); } catch (e) {} return window.__safety.getFrozenInfo()?.kind; });
  ok(afterWrite === "newer", "приложение в режиме «только чтение»");
  await p.context().close();

  // --- 5. сбой миграции не портит данные ---
  p = await open();
  await p.api("PUT", "/profile", { onboardingDone: true });
  await p.api("POST", "/journal", { content: "важная запись", private: false }); await p.api("POST", "/goals", { title: "цель" });
  await p.reload(); await p.waitForTimeout(600);
  const bad = await p.evaluate(async () => {
    const m = [{ to: 2, note: "падает", run: t => { t.Goal.forEach(g => { g.title = "ИСПОРЧЕНО"; }); throw new Error("сбой"); } }];
    let err = ""; try { await window.__safety.bootSafety({ dataVersion: 2, migrations: m }); } catch (e) { err = e.info?.kind || String(e); }
    return { err, goals: (await window.__api("GET", "/goals")).body };
  });
  ok(bad.err === "failed", "сбой миграции даёт режим «failed»");
  await p.reload(); await p.waitForTimeout(700);
  const g2 = await p.api("GET", "/goals"); const gl = Array.isArray(g2.b) ? g2.b : g2.b.goals;
  ok(gl.some(g => g.title === "цель"), "после сбоя миграции исходная цель на месте, ничего не испорчено");
  ok((await p.api("GET", "/journal")).b.entries.some(e => e.content === "важная запись"), "запись дневника цела");
  await p.context().close();

  // --- 5б. новая сборка → автоматическая точка «перед обновлением» ---
  p = await open();
  await p.api("PUT", "/profile", { onboardingDone: true }); await p.api("POST", "/journal", { content: "до обновления сборки", private: false });
  await p.reload(); await p.waitForTimeout(600);
  await p.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open("navigator-life", 1); r.onsuccess = () => { const tx = r.result.transaction("tables", "readwrite"); tx.objectStore("tables").put({ dataVersion: 1, build: "0.0.1-старая", lastDaily: new Date().toISOString() }, "__meta"); tx.oncomplete = resolve; tx.onerror = reject; }; }));
  await p.reload(); await p.waitForTimeout(800);
  const up = (await p.evaluate(() => window.__safety.listSnapshots())).find(s => s.kind === "update");
  ok(!!up && /0\.0\.1-старая/.test(up.reason), "при смене сборки сохранена точка «Перед обновлением» (" + (up ? up.reason : "нет") + ")");
  ok((await p.api("GET", "/journal")).b.entries.some(e => e.content === "до обновления сборки"), "данные после смены сборки на месте");
  await p.context().close();
  p = await open();

  // --- 6. проверка обновления через GitHub ---
  console.log("3) проверка обновления");
  p = await open();
  const release = (tag, apk = true) => ({ tag_name: tag, name: "Версия 9.9.9", body: "Что нового\n- тест", html_url: "https://github.com/o/r/releases/tag/" + tag, assets: apk ? [{ name: "navigator.apk", size: 1234567, browser_download_url: "https://github.com/o/r/releases/download/" + tag + "/navigator.apk" }] : [] });
  const run = (status, body) => p.evaluate(async ([status, body]) => {
    const f = async () => new Response(JSON.stringify(body), { status });
    window.__r = await window.__updater.checkForUpdate(f); return window.__r;
  }, [status, body]);
  await p.evaluate(() => localStorage.setItem("navigator-settings", JSON.stringify({ updateRepo: "o/r" })));
  let r = await run(200, release("b99999999")); ok(r.ok && r.info.available, "новый тег → «есть обновление»");
  r = await run(200, release("b1")); ok(r.ok && !r.info.available, "старый тег → «последняя версия»");
  r = await run(404, {}); ok(!r.ok && /закрытый/.test(r.error), "404 → понятное сообщение про закрытый репозиторий");
  r = await run(403, {}); ok(!r.ok && /ограничил/.test(r.error), "403 → «GitHub ограничил проверки»");
  r = await run(200, release("b99999999", false)); ok(!r.ok && /navigator\.apk/.test(r.error), "релиз без файла → понятная ошибка");
  r = await run(200, { tag_name: "v1.2", assets: [] }); ok(!r.ok, "посторонний тег не принимается за сборку");
  await p.evaluate(() => localStorage.setItem("navigator-settings", JSON.stringify({})));
  r = await run(200, release("b99999999")); ok(!r.ok && /репозиторий/i.test(r.error), "без указанного репозитория → просьба его ввести");
  // интерфейс в браузере
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(700);
  ok(await p.locator("text=Версия и обновление").count() > 0 && await p.locator("text=Точки восстановления").count() > 0, "в настройках есть «Версия и обновление» и «Точки восстановления»");
  ok(await p.locator("text=/Версия \\d+\\.\\d+\\.\\d+/").count() > 0, "показана версия приложения");
  await p.screenshot({ path: "/tmp/claude-0/update-card.png", fullPage: false });
  console.log("ERRORS", p.errs); BAD.push(...p.errs);
  await b.close();
  console.log(BAD.length ? "\nНЕ ПРОШЛО: " + BAD.length : "\nВсё прошло");
})();
