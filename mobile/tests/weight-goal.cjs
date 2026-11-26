// Вес: цель, ежедневная запись, процент выполнения; питания и калорий в приложении нет.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const txt = () => p.locator("body").innerText();
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(900);

  ok("плитки «Питание» нет", !(await txt()).includes("Питание"));
  ok("слов «калор» и «ккал» нет", !/калор|ккал/i.test(await txt()));
  ok("пока цели нет, предлагается её поставить", (await txt()).includes("Поставь цель по весу"));

  // Ошибка ввода
  await p.getByRole("button", { name: "Поставить цель" }).click(); await p.waitForTimeout(150);
  ok("пустая цель даёт подсказку", (await txt()).includes("Укажи цель в килограммах"));

  // Цель 82 -> 76
  await p.getByLabel("Вес сейчас, кг").fill("82"); await p.getByLabel("Цель по весу, кг").fill("76");
  await p.getByRole("button", { name: "Поставить цель" }).click(); await p.waitForTimeout(500);
  ok("цель сохранена, процент 0", (await txt()).includes("Цель: 76 кг") && (await p.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "0");
  ok("стартовый вес стал первой записью", (await txt()).includes("82 кг"));

  // Ежедневная запись: 79 -> половина пути (82 -> 76, прошли 3 из 6)
  await p.getByLabel("Вес в килограммах").fill("79"); await p.getByRole("button", { name: "Записать" }).click(); await p.waitForTimeout(500);
  ok("после записи 79 выполнено 50%", (await p.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "50");
  ok("осталось 3 кг", (await txt()).includes("Осталось 3 кг"));
  ok("написано, что сегодня записано", (await txt()).includes("Сегодня записано"));

  // Повторная запись в тот же день исправляет, а не дублирует
  await p.getByLabel("Вес в килограммах").fill("78,5"); await p.getByRole("button", { name: "Записать" }).click(); await p.waitForTimeout(500);
  const w = await p.evaluate(async () => (await window.__api("GET", "/health/weight")).body);
  ok("за день одна запись (исправлена на 78,5)", w.logs.length === 1 && w.current === 78.5);
  ok("процент по 78,5 = 58%", (await p.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "58");

  // Достижение цели
  await p.getByLabel("Вес в килограммах").fill("75,8"); await p.getByRole("button", { name: "Записать" }).click(); await p.waitForTimeout(500);
  ok("цель достигнута: 100%", (await txt()).includes("Цель достигнута") && (await p.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "100");

  // Копия данных
  const ex = await p.evaluate(async () => { const r = await window.__api("GET", "/account/export"); return JSON.parse(new TextDecoder().decode(r.body)); });
  ok("в копии есть стартовый вес", !!(ex.phoneExtras && ex.phoneExtras.weightStart && ex.phoneExtras.weightStart.kg === 82));
  ok("в копии нет записей питания", !("foodLogs" in ex));
  ok("цель в профиле копии", ex.profile && ex.profile.weightGoalKg === 76);

  // Изменить и убрать цель
  await p.getByRole("button", { name: "Изменить цель" }).click(); await p.waitForTimeout(150);
  ok("форма изменения заполнена текущей целью", (await p.getByLabel("Цель по весу, кг").inputValue()) === "76");
  await p.getByRole("button", { name: "Убрать цель" }).click(); await p.waitForTimeout(500);
  ok("после удаления снова предлагается поставить цель", (await txt()).includes("Поставь цель по весу"));

  // Путь из «+»
  await p.getByLabel("Создать").click(); await p.locator(".sheet-opt", { hasText: "Вес" }).click(); await p.waitForTimeout(600);
  ok("«+» → «Вес» ставит курсор в поле веса", (await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"))) === "Вес в килограммах");

  // Старый маршрут питания больше не существует
  const r = await p.evaluate(async () => { try { const x = await window.__api("POST", "/health/food", { text: "рис" }); return x.status ?? 0; } catch { return -1; } });
  ok("API питания закрыто", r === 404 || r === -1 || r === 0);

  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
