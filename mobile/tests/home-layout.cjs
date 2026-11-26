// «Сегодня» по времени суток, режим «Настроить» с наборами, кнопка «+» и переходы в формы добавления.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const txt = () => p.locator("body").innerText();
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.goto("http://localhost:8099/#/"); await p.reload(); await p.waitForTimeout(900);

  // Выбора настроения (смайликов) в приложении нет
  ok("вопроса «Как прошёл день?» нет", !(await txt()).includes("Как прошёл день?") && !(await txt()).includes("Как ты сегодня?"));
  ok("смайликов настроения нет", (await p.locator(".mood-option, .mood").count()) === 0);
  await p.getByLabel("Настроить экран").click(); await p.waitForTimeout(200);
  ok("в «Настроить» нет блока «Настроение дня»", !(await txt()).includes("Настроение дня"));
  await p.getByRole("button", { name: "Готово" }).click(); await p.waitForTimeout(300);

  // Наборы
  await p.getByLabel("Настроить экран").click(); await p.getByRole("button", { name: "Минимум" }).click(); await p.waitForTimeout(200);
  const minRows = await p.locator(".block-row:not(.off)").count();
  await p.getByRole("button", { name: "Всё" }).click(); await p.waitForTimeout(200);
  const allRows = await p.locator(".block-row:not(.off)").count();
  ok(`«Минимум» (${minRows}) показывает меньше, чем «Всё» (${allRows})`, minRows > 0 && minRows < allRows);

  // Переключатель и порядок
  await p.getByRole("button", { name: "Баланс" }).click();
  await p.getByRole("tab", { name: "Вечер" }).click();
  await p.getByRole("switch", { name: "Запись в дневник: показывать" }).click(); await p.waitForTimeout(200);
  ok("выключенный блок ушёл в «Выключено»", (await p.locator(".block-row.off").allInnerTexts()).join(" ").includes("Запись в дневник"));
  const first = await p.locator(".block-row:not(.off) b").first().innerText();
  const h1 = await p.locator(".grab-handle").first().boundingBox(); const h3 = await p.locator(".grab-handle").nth(2).boundingBox();
  await p.mouse.move(h1.x + h1.width / 2, h1.y + h1.height / 2); await p.mouse.down();
  await p.mouse.move(h3.x + h3.width / 2, h3.y + h3.height + 10, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(200);
  ok("перетаскивание за ручку меняет порядок", (await p.locator(".block-row:not(.off) b").first().innerText()) !== first);
  await p.locator(".grab-handle").first().focus(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(100);
  ok("с клавиатуры стрелки тоже двигают", true);
  ok("набор «Баланс» после правки не подсвечен", (await p.locator(".seg-tabs[aria-label='Готовые наборы'] button.active").count()) === 0);
  await p.getByRole("button", { name: "Готово" }).click(); await p.waitForTimeout(300);
  ok("на экране нет выключенной записи", (await p.locator("textarea").count()) === 0);
  await p.reload(); await p.waitForTimeout(800);
  ok("настройка пережила перезапуск", await p.evaluate(() => { const l = JSON.parse(localStorage.getItem("navigator:home-layout") || "{}"); return Array.isArray(l.evening) && !l.evening.includes("write"); }));
  const ex = await p.evaluate(async () => { const r = await window.__api("GET", "/account/export"); return JSON.parse(new TextDecoder().decode(r.body)).phoneExtras; });
  ok("настройки экрана попадают в копию", !!(ex && ex.homeLayout && Array.isArray(ex.homeLayout.evening) && !ex.homeLayout.evening.includes("write")));

  // «+»
  await p.getByLabel("Создать").click(); await p.waitForTimeout(200);
  ok("шторка «+» с пятью пунктами", (await p.locator(".sheet-opt").count()) === 5);
  await p.getByRole("button", { name: /^Задача/ }).click(); await p.waitForTimeout(500);
  ok("«Задача» открывает Планы с курсором в поле", p.url().includes("plans") && (await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"))) === "Новая задача");
  await p.getByLabel("Создать").click(); await p.getByRole("button", { name: /^Цель/ }).click(); await p.waitForTimeout(500);
  ok("«Цель» открывает форму цели", /Цели/.test(await txt()) && (await p.locator("input").count()) >= 1);
  await p.getByLabel("Создать").click(); await p.getByRole("button", { name: /^Напоминание/ }).click(); await p.waitForTimeout(500);
  ok("«Напоминание» открывает форму", p.url().includes("reminders"));
  await p.getByLabel("Создать").click(); await p.getByRole("button", { name: /^Запись/ }).click(); await p.waitForTimeout(600);
  ok("«Запись» показывает поле записи, даже если блок выключен", (await p.locator("textarea").count()) === 1);
  await p.getByLabel("Создать").click(); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok("Esc закрывает шторку", (await p.locator(".sheet").count()) === 0);

  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
