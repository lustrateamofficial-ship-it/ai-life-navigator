// Новое в 1.19: тема по расписанию, облегчённый режим, EPUB, лёгкий старт, итоги месяца,
// поиск по периоду, «В задачи», «год назад», подбор времени вечернего вопроса.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: "block", acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  const aiCalls = [];
  await ctx.route("**/generativelanguage.googleapis.com/**", async (route) => {
    const body = route.request().postData() || ""; aiCalls.push(body);
    const month = body.includes("месяца");
    let text;
    if (body.includes("итоги")) text = JSON.stringify({ summary: month ? "За месяц ты часто писал про работу." : "За неделю ты писал про дела.", highlights: [{ text: "Дела", quote: "позвонить врачу" }] });
    else text = JSON.stringify({ tasks: [{ title: "Позвонить врачу", deadline: null }], reminders: [], ideas: [], transactions: [], weight: null, food: [] });
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) });
  });
  const ok = (name, v) => console.log((v ? "ДА  " : "НЕТ ") + name);
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(async () => { localStorage.setItem("navigator-settings", JSON.stringify({ geminiApiKey: "AIzaTEST12345678901234567" })); await window.__api("PUT", "/profile", { onboardingDone: true }); });

  // записи с разными датами (через восстановление копии)
  await p.evaluate(async () => {
    const a = window.__api;
    await a("POST", "/journal", { content: "позвонить врачу завтра", private: false });
    const data = JSON.parse(new TextDecoder().decode((await a("GET", "/account/export")).body));
    const base = data.journalEntries[0];
    const ago = d => new Date(Date.now() - d * 86400e3);
    const mk = (i, days, content, priv) => ({ ...base, id: "x" + i, content, isPrivate: !!priv, createdAt: ago(days).toISOString(), updatedAt: ago(days).toISOString() });
    const hour = (d, h) => { d.setHours(h, 0, 0, 0); return d; };
    const rows = [];
    for (let i = 0; i < 6; i++) { const e = mk(10 + i, 2 + i * 4, "Запись про работу номер " + i); e.createdAt = hour(ago(2 + i * 4), 22).toISOString(); rows.push(e); }
    rows.push(mk(30, 366, "Запись ровно год назад"));
    rows.push(mk(31, 100, "Секретная личная запись", true));
    data.journalEntries = [...data.journalEntries, ...rows];
    await a("POST", "/account/restore", data);
  });

  // 1. год назад с запасом в день
  const er = await p.evaluate(async () => (await window.__api("GET", "/week/earlier")).body.entry);
  ok("«Около года назад» находит запись на день раньше: " + (er && er.label), er && er.label === "Около года назад" && er.content.includes("год назад"));

  // 2. поиск по периоду + подсветка
  await p.goto("http://localhost:8099/#/journal"); await p.reload(); await p.waitForTimeout(900);
  await p.fill("input[type=search]", "работу"); await p.waitForTimeout(900);
  ok("подсветка найденного слова", (await p.locator("mark").count()) > 0);
  ok("счётчик найденных", (await p.innerText("body")).includes("Найдено записей: 6"));
  await p.click("button:has-text('30 дней')"); await p.waitForTimeout(800);
  const n30 = await p.locator(".entry-text").count();
  ok("за 30 дней только свежие (" + n30 + ")", n30 === 6);
  await p.fill("input[type=search]", "год назад"); await p.waitForTimeout(900);
  ok("запись годовой давности не видна за 30 дней", (await p.locator(".entry-text").count()) === 0);
  await p.click("button:has-text('Год')"); await p.waitForTimeout(800);
  ok("за «Год» запись 366-дневной давности тоже не входит", (await p.locator(".entry-text").count()) === 0);
  await p.click("button:has-text('Всё время')"); await p.waitForTimeout(800);
  ok("за всё время находится", (await p.locator(".entry-text").count()) === 1);
  await p.fill("input[type=search]", ""); await p.waitForTimeout(800);

  // 3. «В задачи»
  const priv = await p.locator(".card", { hasText: "Секретная личная запись" }).locator("button:has-text('В задачи')").count();
  ok("у личной записи кнопки «В задачи» нет", priv === 0);
  await p.locator(".card", { hasText: "позвонить врачу завтра" }).locator("button:has-text('В задачи')").click(); await p.waitForTimeout(900);
  ok("показано предложение задачи", (await p.innerText("body")).includes("Задача: Позвонить врачу"));
  const before = await p.evaluate(async () => (await window.__api("GET", "/tasks")).body.length ?? (await window.__api("GET", "/tasks")).body.tasks?.length);
  await p.click("button:has-text('Добавить (')"); await p.waitForTimeout(900);
  const after = await p.evaluate(async () => { const r = (await window.__api("GET", "/tasks")).body; return r.length ?? r.tasks?.length; });
  ok("задача создана только после подтверждения (" + before + "→" + after + ")", after === before + 1);

  // 4. итоги недели и месяца
  await p.click("button:has-text('Подвести итоги недели')"); await p.waitForTimeout(1200);
  ok("итог недели", (await p.innerText("body")).includes("За неделю ты писал"));
  await p.click("button[aria-pressed='false']:has-text('Месяц')"); await p.waitForTimeout(300);
  ok("после переключения старый итог скрыт", !(await p.innerText("body")).includes("За неделю ты писал"));
  await p.click("button:has-text('Подвести итоги месяца')"); await p.waitForTimeout(1200);
  ok("итог месяца", (await p.innerText("body")).includes("За месяц ты часто писал"));
  ok("в запрос ушло «месяца»", aiCalls.some(c => c.includes("итоги месяца")));

  // 5. настройки: подбор времени, тема, EPUB
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(700);
  await p.locator("label.check-row:has-text('Напоминать каждый вечер') input").check();
  await p.click("button:has-text('Подобрать время')"); await p.waitForTimeout(900);
  const t = await p.inputValue("#evening-time");
  ok("время подобрано по записям (22:00): " + t, t === "22:00");

  await p.selectOption("#theme-mode", "schedule");
  await p.fill("#dark-from", "00:00"); await p.fill("#dark-to", "23:59");
  const dark = await p.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok("по расписанию (весь день) тема тёмная: " + dark, dark === "dark");
  await p.fill("#dark-from", "03:00"); await p.fill("#dark-to", "03:01");
  const light = await p.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok("вне окна расписания тема светлая: " + light, light === "light");
  await p.selectOption("#theme-mode", "auto");
  ok("«как в телефоне» снимает принудительную тему", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null);

  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("button:has-text('Сохранить дневник в EPUB')")]);
  const path = "/tmp/claude-0/diary.epub"; await dl.saveAs(path);
  fs.writeFileSync("/tmp/claude-0/epub-name.txt", dl.suggestedFilename());
  console.log("файл:", dl.suggestedFilename(), fs.statSync(path).size, "байт");

  // 6. облегчённый режим
  await p.locator("label.check-row:has-text('Облегчённый режим') input").check(); await p.waitForTimeout(300);
  ok("в облегчённом режиме внизу нет «Цели»", (await p.locator(".bottom-nav a:has-text('Цели')").count()) === 0);
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(800);
  const t1 = await p.innerText("body");
  ok("на главном нет «Что видно по моим записям» и «Показатели»", !t1.includes("Что видно по моим записям") && !t1.includes("Показатели"));
  ok("на главном остались запись и задачи", t1.includes("Что полезно сейчас") && (await p.locator("textarea").count()) === 1);
  await p.screenshot({ path: "/tmp/claude-0/lite.png" });
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem("navigator:appearance")); a.lite = false; localStorage.setItem("navigator:appearance", JSON.stringify(a)); });

  // 7. лёгкий старт: пауза 5 дней
  await p.evaluate(async () => {
    const data = JSON.parse(new TextDecoder().decode((await window.__api("GET", "/account/export")).body));
    for (const e of data.journalEntries) e.createdAt = e.updatedAt = new Date(Date.now() - 5 * 86400e3).toISOString();
    for (const e of data.journalEntries) await window.__api("DELETE", "/journal/" + e.id);
    await window.__api("POST", "/account/restore", data);
  });
  await p.reload(); await p.waitForTimeout(900);
  ok("после паузы 5 дней виден лёгкий старт", (await p.locator("[aria-label='Лёгкий старт']").count()) === 1);
  await p.click("[aria-label='Лёгкий старт'] button:has-text('Не забыть')"); await p.waitForTimeout(200);
  ok("затравка подставлена в поле записи", (await p.inputValue("textarea")).startsWith("Не хочу забыть"));
  await p.screenshot({ path: "/tmp/claude-0/easystart.png" });
  console.log("ERRORS", errs);
  await b.close();
})();
