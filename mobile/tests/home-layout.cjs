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

  // Настройка плиток: переключатель, перетаскивание за ручку вниз и вверх на несколько мест, клавиатура
  await p.getByLabel("Настроить экран").click(); await p.waitForTimeout(300);
  ok("наборов «Баланс/Минимум/Все» и вкладок времени суток нет", (await p.getByRole("button", { name: "Минимум" }).count()) === 0 && (await p.getByRole("tab", { name: "Вечер" }).count()) === 0);
  await p.getByRole("switch", { name: "Запись в дневник: показывать" }).click(); await p.waitForTimeout(200);
  ok("выключенная плитка ушла в «Скрыто»", (await p.locator(".tile-row.off").allInnerTexts()).join(" ").includes("Запись в дневник"));
  const names = () => p.locator(".tile-list .tile-row b").allInnerTexts();
  const before = await names();
  const drag = async (i, j) => {
    const hs = p.locator(".grab-handle"); const h1 = await hs.nth(i).boundingBox(); const h2 = await hs.nth(j).boundingBox();
    await p.mouse.move(h1.x + h1.width / 2, h1.y + h1.height / 2); await p.mouse.down();
    await p.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2 + (j > i ? 12 : -12), { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(500);
  };
  await drag(0, 3);
  const afterDown = await names();
  ok("за одно перетаскивание плитка ушла вниз на 3 места: " + afterDown.join(","), afterDown[3] === before[0]);
  await drag(3, 0);
  ok("и так же вернулась вверх", (await names()).join() === before.join());
  await p.locator(".grab-handle").first().focus(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(100);
  ok("стрелки с клавиатуры тоже двигают", (await names())[1] === before[0]);
  await p.getByRole("button", { name: "Готово" }).click(); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(800);
  ok("настройка пережила перезапуск", await p.evaluate(() => { const l = JSON.parse(localStorage.getItem("navigator:home-layout") || "{}"); return Array.isArray(l.today) && !l.today.includes("write"); }));
  const ex = await p.evaluate(async () => { const r = await window.__api("GET", "/account/export"); return JSON.parse(new TextDecoder().decode(r.body)).phoneExtras; });
  ok("настройки экранов попадают в копию", !!(ex && ex.homeLayout && Array.isArray(ex.homeLayout.today) && !ex.homeLayout.today.includes("write")));

  // «+»
  await p.getByLabel("Создать").click(); await p.waitForTimeout(200);
  ok("шторка «+» с четырьмя пунктами", (await p.locator(".sheet-opt").count()) === 4);
  await p.getByRole("button", { name: /^Задача/ }).click(); await p.waitForTimeout(500);
  ok("«Задача» открывает Планы с курсором в поле", p.url().includes("plans") && (await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"))) === "Новая задача");
  await p.getByLabel("Создать").click(); await p.getByRole("button", { name: /^Цель/ }).click(); await p.waitForTimeout(500);
  ok("«Цель» открывает форму цели", /Цели/.test(await txt()) && (await p.locator("input").count()) >= 1);
  await p.getByLabel("Создать").click(); await p.getByRole("button", { name: /^Запись/ }).click(); await p.waitForTimeout(600);
  ok("«Запись» открывает поле записи", (await p.locator("textarea").count()) >= 1);
  await p.getByLabel("Создать").click(); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok("Esc закрывает шторку", (await p.locator(".sheet").count()) === 0);

  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
