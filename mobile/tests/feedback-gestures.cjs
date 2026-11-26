// Отклик на действия (подпись и вибрация), смахивание задач, постепенное знакомство.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("navigator-debug", "1"); window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; }; });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const txt = () => p.locator("body").innerText();
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));

  // --- Подпись и вибрация
  await p.goto("http://localhost:8099/#/plans?tab=tasks"); await p.reload(); await p.waitForTimeout(800);
  await p.getByLabel("Новая задача").fill("Позвонить маме"); await p.getByRole("button", { name: "Добавить" }).first().click(); await p.waitForTimeout(400);
  ok("после добавления задачи появилась подпись", (await p.locator(".toast").innerText()) === "Задача добавлена");
  ok("и была вибрация", (await p.evaluate(() => window.__vib.length)) > 0);
  ok("подпись для экранных программ (role=status)", (await p.locator("[role=status].toast-region").count()) === 1);

  // --- Смахивание
  ok("подсказка про смахивание видна", (await txt()).includes("Смахни задачу вправо"));
  const row = p.locator(".swipe-inner").first(); const bb = await row.boundingBox();
  await p.mouse.move(bb.x + 120, bb.y + bb.height / 2); await p.mouse.down();
  await p.mouse.move(bb.x + 160, bb.y + bb.height / 2, { steps: 4 });
  await p.mouse.move(bb.x + 280, bb.y + bb.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(500);
  const t1 = await p.evaluate(async () => (await window.__api("GET", "/tasks?range=all")).body);
  ok("смахивание вправо выполнило задачу", t1.length === 1 && t1[0].status === "done");
  ok("подсказка исчезла после первого жеста", !(await txt()).includes("Смахни задачу вправо"));
  // короткое движение не срабатывает
  const add = async (name) => { await p.getByLabel("Новая задача").fill(name); await p.getByRole("button", { name: "Добавить" }).first().click(); await p.waitForTimeout(400); };
  const open = async () => (await p.evaluate(async () => (await window.__api("GET", "/tasks?range=all")).body)).filter((x) => x.status !== "done");
  await add("Вторая");
  const bb2 = await p.locator(".swipe-inner").first().boundingBox();
  await p.mouse.move(bb2.x + 120, bb2.y + bb2.height / 2); await p.mouse.down(); await p.mouse.move(bb2.x + 150, bb2.y + bb2.height / 2, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(300);
  ok("короткий свайп ничего не меняет", (await open()).length === 1);
  // вертикальный жест не срабатывает как смахивание
  await p.mouse.move(bb2.x + 150, bb2.y + 10); await p.mouse.down(); await p.mouse.move(bb2.x + 190, bb2.y + 60, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  ok("диагональное движение вниз не выполняет задачу", (await open()).length === 1);
  // обычные кнопки остались
  ok("кнопки отметки и удаления на месте", (await p.getByLabel("отметить выполненной").count()) === 1 && (await p.getByLabel("удалить").count()) === 1);
  // влево удаляет (подтверждение принимается)
  const bb3 = await p.locator(".swipe-inner").first().boundingBox();
  await p.mouse.move(bb3.x + 300, bb3.y + bb3.height / 2); await p.mouse.down();
  await p.mouse.move(bb3.x + 260, bb3.y + bb3.height / 2, { steps: 4 });
  await p.mouse.move(bb3.x + 120, bb3.y + bb3.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(500);
  ok("смахивание влево удалило задачу", (await p.evaluate(async () => (await window.__api("GET", "/tasks?range=all")).body)).filter((x) => x.status !== "done").length === 0);

  // --- Переключатель вибрации
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(600);
  const sw = p.getByRole("switch", { name: "Вибрация при действиях" });
  ok("вибрация по умолчанию включена", (await sw.getAttribute("aria-checked")) === "true");
  await sw.click(); await p.evaluate(() => (window.__vib = []));
  ok("выключатель сохранился", (await p.evaluate(() => localStorage.getItem("navigator:haptics"))) === "off");
  await p.goto("http://localhost:8099/#/plans?tab=tasks"); await p.waitForTimeout(500);
  await p.getByLabel("Новая задача").fill("Тихая"); await p.getByRole("button", { name: "Добавить" }).first().click(); await p.waitForTimeout(400);
  ok("при выключенной вибрации телефон не вибрирует, подпись есть", (await p.evaluate(() => window.__vib.length)) === 0 && (await p.locator(".toast").count()) === 1);

  // --- Знакомство
  await p.evaluate(async () => {
    const t = (await window.__api("GET", "/tasks?range=all")).body; for (const x of t) await window.__api("DELETE", `/tasks/${x.id}`);
    localStorage.removeItem("navigator:home-layout"); localStorage.setItem("navigator:intro", "active");
  });
  await p.goto("http://localhost:8099/#/"); await p.reload(); await p.waitForTimeout(900);
  ok("новичок видит карточку «Знакомство: 0 из 3»", (await txt()).includes("Знакомство: 0 из 3"));
  ok("и урезанный экран (нет «Раньше» и «Кольца дня»)", (await p.locator("[data-block=earlier]").count()) === 0 && (await p.locator("[data-block=life]").count()) === 0);
  await p.getByRole("button", { name: /Добавь задачу/ }).click(); await p.waitForTimeout(500);
  ok("шаг ведёт в форму задачи", p.url().includes("plans") && p.url().includes("add=1"));
  await p.evaluate(async () => { await window.__api("POST", "/tasks", { title: "Первая" }); });
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(700);
  ok("после задачи «1 из 3» и шаг отмечен", (await txt()).includes("Знакомство: 1 из 3") && (await p.locator(".intro-step.ok").count()) === 1);
  await p.evaluate(async () => { await window.__api("POST", "/journal", { content: "Первая запись" }); await window.__api("POST", "/health/weight", { weightKg: 80 }); });
  await p.goto("http://localhost:8099/#/"); await p.reload(); await p.waitForTimeout(1000);
  ok("после трёх шагов карточка исчезла", !(await txt()).includes("Знакомство:"));
  ok("знакомство отмечено пройденным", (await p.evaluate(() => localStorage.getItem("navigator:intro"))) === "done");
  ok("открылся обычный набор (есть «Раньше» или «Кольцо»)", (await p.locator("[data-block=ring]").count()) + (await p.locator("[data-block=earlier]").count()) > 0);
  // Пропустить
  await p.evaluate(() => { localStorage.removeItem("navigator:home-layout"); localStorage.setItem("navigator:intro", "active"); });
  await p.evaluate(async () => { const t = (await window.__api("GET", "/tasks?range=all")).body; for (const x of t) await window.__api("DELETE", `/tasks/${x.id}`); });
  await p.reload(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Пропустить, покажи всё" }).click(); await p.waitForTimeout(400);
  ok("«Пропустить» убирает карточку", !(await txt()).includes("Знакомство:") && (await p.evaluate(() => localStorage.getItem("navigator:intro"))) === "done");
  // Старый пользователь без флага ничего не замечает
  await p.evaluate(() => { localStorage.removeItem("navigator:intro"); localStorage.removeItem("navigator:home-layout"); });
  await p.reload(); await p.waitForTimeout(700);
  ok("без флага знакомства карточки нет", !(await txt()).includes("Знакомство:"));

  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
