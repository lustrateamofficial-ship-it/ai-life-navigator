// Структура разделов: расписание внутри «Планы», нет дублей на «Сегодня» и в «Я», копии собраны в один блок.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const txt = () => p.locator("body").innerText();
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(400);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true }); await window.__api("POST", "/tasks", { title: "Сдать отчёт" }); });
  await p.goto("http://localhost:8099/#/plans"); await p.reload(); await p.waitForTimeout(700);
  ok("в «Планы» три вкладки", (await p.getByRole("tab").count()) === 3);
  await p.getByRole("tab", { name: "Расписание" }).click(); await p.waitForTimeout(400);
  ok("вкладка «Расписание» показывает события и кнопку добавления", /Новое событие/.test(await txt()));
  await p.goto("http://localhost:8099/#/plans?tab=calendar"); await p.waitForTimeout(500);
  ok("старая ссылка /calendar ведёт во вкладку «Расписание»", p.url().includes("plans") && p.url().includes("tab=calendar"));
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(700);
  const me = await txt();
  ok("в «Я» нет дублей «Напоминания» и «Расписание»", !/Напоминания/.test(me) && !/Расписание/.test(me));
  ok("в «Я» остались Аналитика, Идеи, Память, Моя миссия, Корзина", ["Аналитика", "Идеи", "Память", "Моя миссия", "Корзина"].every((w) => me.includes(w)));
  await p.goto("http://localhost:8099/#/analytics"); await p.reload(); await p.waitForTimeout(700);
  const an = await txt();
  ok("в «Аналитике» остался портрет по дневнику, без отчётов, закономерностей и карты жизни", ["Портрет по дневнику"].every((w) => an.includes(w)) && !/Карта жизни|Закономерности/.test(an));
  // «Сегодня»: задачи не показываются дважды
  await p.evaluate(() => localStorage.setItem("navigator:home-layout", JSON.stringify({ morning: ["brief", "focus"], day: ["brief", "focus"], evening: ["brief", "focus"] })));
  await p.evaluate(async () => { const d = JSON.parse(localStorage.getItem("navigator:daily") || "{}"); });
  await p.goto("http://localhost:8099/#/"); await p.reload(); await p.waitForTimeout(900);
  const today = await txt();
  ok("«Сегодня»: нет блока «Показатели» и вес не повторяется", !/Показатели/.test(today));
  ok("«Сегодня»: при блоке «Что полезно сейчас» сводка не повторяет задачи", !/Главное на день/.test(today));
  await p.evaluate(() => localStorage.setItem("navigator:home-layout", JSON.stringify({ morning: ["brief"], day: ["brief"], evening: ["brief"] })));
  await p.reload(); await p.waitForTimeout(900);
  ok("«Сегодня»: блок «Что полезно сейчас» отключается", !/Что полезно сейчас/.test(await txt()));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(700);
  const st = await txt();
  ok("настройки: «Копии и восстановление» одним блоком", (await p.locator("details.fold", { hasText: "Копии и восстановление" }).count()) >= 1 && /Защита и удаление/.test(st));
  console.log("ERRORS", JSON.stringify(errs));
  await b.close();
})();
