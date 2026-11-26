// 1.31: скрытые функции стали видны: миссия в «Я», сигнал дрейфа в итогах недели, дата портрета; симуляции будущего больше нет.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  const text = () => p.evaluate(() => document.body.innerText);

  // миссия в «Я»
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(900);
  ok("без миссии в «Я» есть подсказка", /Напиши одну-две фразы/.test(await text()));
  await p.evaluate(() => window.__api("PUT", "/mission", { whatToAchieve: "Построить спокойную жизнь и закончить университет" }));
  await p.reload(); await p.waitForTimeout(900);
  const t1 = await text();
  ok("с миссией в «Я» показан её текст и пометка про ИИ", /Построить спокойную жизнь/.test(t1) && /ИИ учитывает её/.test(t1));
  await p.click("#mission-line"); await p.waitForTimeout(500);
  ok("строка ведёт на экран миссии, где сказано, что её видит ИИ", /Заполненное видит ИИ/.test(await text()));

  // дрейф в итогах недели
  await p.goto("http://localhost:8099/#/week-review"); await p.reload(); await p.waitForTimeout(900);
  ok("пока задач мало, сигнала нет", !/Задачи уходят от цели/.test(await text()));
  await p.evaluate(async () => { for (let i = 0; i < 9; i++) await window.__prisma.task.create({ data: { userId: "local-user", title: "дело " + i, status: "done", completedAt: new Date() } }); });
  await p.waitForTimeout(500); // запись на диск отложена на 100 мс
  await p.reload(); await p.waitForTimeout(900);
  ok("9 задач без связи с целью: в итогах недели появляется сигнал", /Задачи уходят от цели/.test(await text()));
  // если задачи связаны с целью, сигнал уходит
  await p.evaluate(async () => { const g = await window.__prisma.goal.create({ data: { userId: "local-user", title: "Цель", status: "active" } }); await window.__prisma.task.updateMany({ data: { goalId: g.id } }); });
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(900);
  ok("когда задачи связаны с целью, сигнала нет", !/Задачи уходят от цели/.test(await text()));

  // аналитика без симуляции
  await p.goto("http://localhost:8099/#/analytics"); await p.reload(); await p.waitForTimeout(900);
  const an = await text();
  ok("в «Аналитике» нет симуляции будущего", !/Куда я приду через год|Построить прогноз/.test(an));
  ok("в «Аналитике» остались «Почему я остановился» и портрет", /Почему я остановился/.test(an) && /Портрет по дневнику/.test(an));
  ok("маршрута симуляции на сервере нет", await p.evaluate(async () => { const r = await window.__api("POST", "/simulation/future", {}).catch(() => ({ status: 404 })); return r.status === 404; }));

  // дата портрета
  await p.evaluate(() => window.__prisma.selfPortrait.create({ data: { userId: "local-user", content: { patterns: ["Пишешь по вечерам"], statedPrinciples: [], goalAlignment: "Совпадает", advisorVoice: "Спокойно" } } }));
  await p.waitForTimeout(500);
  await p.goto("http://localhost:8099/#/portrait"); await p.reload(); await p.waitForTimeout(900);
  ok("у портрета есть дата и пометка, что его учитывает ИИ", /Составлен .*20\d\d/.test(await text()) && /сейчас учитывает ИИ/.test(await text()));
  console.log("ERRORS", errs);
  await b.close();
})();
