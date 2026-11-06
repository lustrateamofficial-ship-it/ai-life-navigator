const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => { if (!String(e.message).includes("проверка журнала")) errs.push(e.message); });
  p.on("dialog", d => d.accept());
  const ok = (name, cond) => console.log((cond ? "ДА  " : "НЕТ ") + name);
  const txt = async () => (await p.innerText("body")).replace(/\n+/g, " | ");
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));

  // 1. повторяющиеся задачи
  const rec = await p.evaluate(async () => {
    const a = window.__api;
    const dl = new Date().toLocaleDateString("sv-SE") + "T12:00:00.000Z";
    const t = (await a("POST", "/tasks", { title: "Полить цветы", deadline: dl, recurrence: "daily" })).body;
    await a("PUT", "/tasks/" + t.id, { status: "done" });
    await a("PUT", "/tasks/" + t.id, { status: "done" }); // повторное сохранение не создаёт копию
    const all = (await a("GET", "/tasks?range=all")).body.filter(x => x.title === "Полить цветы");
    const bad = await a("POST", "/tasks", { title: "x", recurrence: "yearly" });
    return { n: all.length, done: all.filter(x => x.status === "done").length, next: all.find(x => x.status !== "done"), dl, badStatus: bad.status };
  });
  ok("повтор: после выполнения одна новая задача", rec.n === 2 && rec.done === 1);
  ok("повтор: срок следующей на день позже", rec.next && rec.next.deadline.slice(0, 10) === new Date(Date.now() + 86400e3).toLocaleDateString("sv-SE") && rec.next.recurrence === "daily");
  ok("повтор: неверное значение отклоняется", rec.badStatus === 400);

  // 2. бюджет
  const bud = await p.evaluate(async () => {
    const a = window.__api;
    await a("POST", "/finance/expenses", { amount: 500, category: "Продукты" });
    await a("POST", "/finance/expenses", { amount: 300, category: " продукты " });
    await a("POST", "/finance/expenses", { amount: 200, category: "Такси" });
    await a("PUT", "/budget", { category: "Продукты", limit: 1000 });
    const s1 = (await a("GET", "/budget")).body;
    const bad = await a("PUT", "/budget", { category: "Еда", limit: "abc" });
    const exp = JSON.parse(new TextDecoder().decode((await a("GET", "/account/export")).body));
    await a("PUT", "/budget", { category: "Продукты", limit: 0 });
    const s2 = (await a("GET", "/budget")).body;
    await a("POST", "/account/restore", exp);
    const s3 = (await a("GET", "/budget")).body;
    return { s1, badStatus: bad.status, extras: exp.phoneExtras, s2, s3 };
  });
  ok("бюджет: 800 из 1000 (80%) с учётом регистра и пробелов", bud.s1.limits[0]?.spent === 800 && bud.s1.limits[0].percent === 80);
  ok("бюджет: категория без лимита в «others»", bud.s1.others.some(o => o.category === "Такси" && o.spent === 200));
  ok("бюджет: плохой лимит отклоняется", bud.badStatus === 400);
  ok("бюджет: лимит попал в файл копии", bud.extras?.budget?.["Продукты"] === 1000);
  ok("бюджет: снятие лимита", bud.s2.limits.length === 0);
  ok("бюджет: возврат лимита при восстановлении", bud.s3.limits.length === 1);

  // 3. график веса
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(800);
  ok("график: до трёх записей подсказка", (await txt()).includes("График появится после трёх записей"));
  await p.evaluate(async () => { for (let i = 6; i >= 0; i--) await window.__api("POST", "/health/weight", { weightKg: 82 - i * 0.3 + (i % 2) * 0.4, date: new Date(Date.now() - i * 86400e3).toISOString() }); });
  await p.reload(); await p.waitForTimeout(800);
  const label = await p.locator("svg[role=img][aria-label^='Вес с']").getAttribute("aria-label").catch(() => null);
  ok("график: рисуется и подписан для чтения с экрана", !!label && label.includes("тренд") && label.includes("Записей: 7"));
  ok("бюджет на экране «Я»", (await txt()).includes("Бюджет на месяц"));
  await p.screenshot({ path: "/tmp/claude-0/e2e/nf-me.png", fullPage: true });

  // 4. корзина
  const tr = await p.evaluate(async () => {
    const a = window.__api;
    const j = (await a("POST", "/journal", { content: "Запись для корзины", private: false })).body;
    const t = (await a("POST", "/tasks", { title: "Задача для корзины" })).body;
    const i = (await a("POST", "/ideas", { content: "Идея для корзины" })).body;
    for (const [m, path] of [["DELETE", "/journal/" + j.id], ["DELETE", "/tasks/" + t.id], ["DELETE", "/ideas/" + i.id]]) await a(m, path);
    const list = (await a("GET", "/trash")).body;
    const gone = (await a("GET", "/journal")).body.entries.every(x => x.id !== j.id);
    const item = list.find(x => x.label === "Запись для корзины");
    const r = await a("POST", "/trash/" + item.id + "/restore", {});
    const back = (await a("GET", "/journal")).body.entries.find(x => x.id === j.id);
    const afterList = (await a("GET", "/trash")).body;
    return { n: list.length, gone, restored: r.body.restored, back: !!back && back.content === "Запись для корзины", left: afterList.length, kinds: list.map(x => x.kind).sort().join(",") };
  });
  ok("корзина: три удалённых лежат в ней", tr.n >= 3 && tr.kinds.includes("Запись дневника") && tr.kinds.includes("Задача") && tr.kinds.includes("Идея"));
  ok("корзина: из дневника запись исчезла", tr.gone);
  ok("корзина: возврат с тем же id и текстом", tr.restored === true && tr.back && tr.left === tr.n - 1);
  await p.goto("http://localhost:8099/#/trash"); await p.waitForTimeout(700);
  ok("корзина: экран показывает записи и кнопку «Вернуть»", (await txt()).includes("Задача для корзины") && (await txt()).includes("Вернуть"));
  await p.getByRole("button", { name: "Вернуть" }).first().click(); await p.waitForTimeout(700);
  ok("корзина: возврат из интерфейса", (await txt()).includes("Возвращено."));
  // срок хранения: просроченное исчезает
  const exp30 = await p.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open("navigator-trash", 1); q.onsuccess = () => r(q.result); });
    const items = await new Promise(r => { const g = db.transaction("items").objectStore("items").get("items"); g.onsuccess = () => r(g.result || []); });
    items.push({ id: "old", delegate: "idea", kind: "Идея", row: { id: "zzz", content: "старая", userId: "local-user", createdAt: new Date().toISOString() }, deletedAt: new Date(Date.now() - 31 * 86400e3).toISOString() });
    await new Promise(r => { const t = db.transaction("items", "readwrite"); t.objectStore("items").put(items, "items"); t.oncomplete = r; });
    db.close();
    return (await window.__api("GET", "/trash")).body.some(x => x.id === "old");
  });
  ok("корзина: старше 30 дней исчезает", exp30 === false);
  // «Удалить все данные» очищает и корзину
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Удалить все данные" }).click();
  await p.getByLabel("Подтверждение удаления").fill("УДАЛИТЬ");
  await p.getByRole("button", { name: "Удалить навсегда" }).click(); await p.waitForTimeout(2500);
  const afterWipe = await p.evaluate(async () => { try { return (await window.__api("GET", "/trash")).body.length; } catch { return -1; } });
  ok("удаление всех данных очищает и корзину", afterWipe === 0);

  // 5. журнал ошибок
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.evaluate(() => window.__api("POST", "/journal", { content: "СЕКРЕТНАЯ ЛИЧНАЯ ЗАПИСЬ", private: true }));
  await p.evaluate(() => setTimeout(() => { throw new Error("проверка журнала"); }, 0)); await p.waitForTimeout(300);
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Показать отчёт о проблеме" }).click(); await p.waitForTimeout(500);
  const rep = await p.locator("pre").innerText();
  ok("отчёт: содержит ошибку, сборку и систему", rep.includes("проверка журнала") && rep.includes("Сборка:") && rep.includes("Система:"));
  ok("отчёт: не содержит текст записей", !rep.includes("СЕКРЕТНАЯ"));
  console.log("ERRORS", errs);
  await b.close();
})();
