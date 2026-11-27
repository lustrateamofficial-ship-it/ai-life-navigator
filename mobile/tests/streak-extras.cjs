// 1.26: часовой пояс обновляется сам, плитка недели считает вес и привычки, серия заполняет прошлое, пропуск дня.
process.env.TZ = "Asia/Tokyo"; // даты в тесте считаются в том же поясе, что и в браузере (иначе после 15:00 по Гринвичу день в Токио уже другой)
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Asia/Tokyo" });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  const body = (r) => (r.body && !(r.body instanceof Uint8Array) ? r.body : JSON.parse(new TextDecoder().decode(r.body)));
  const tz = async () => p.evaluate(async () => { const r = await window.__api("GET", "/account"); return (r.body.timezone ?? JSON.parse(new TextDecoder().decode(r.body)).timezone); });
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  ok("первый запуск: пояс телефона (Asia/Tokyo): " + (await tz()), (await tz()) === "Asia/Tokyo");
  // ── часовой пояс ──
  await p.evaluate(() => window.__api("PUT", "/account", { timezone: "UTC" }));
  await p.reload(); await p.waitForTimeout(700);
  ok("после перезапуска пояс снова по телефону: " + (await tz()), (await tz()) === "Asia/Tokyo");
  await p.evaluate(() => { localStorage.setItem("navigator:tz-manual", "1"); return window.__api("PUT", "/account", { timezone: "Europe/Paris" }); });
  await p.reload(); await p.waitForTimeout(700);
  ok("вручную заданный пояс не трогается: " + (await tz()), (await tz()) === "Europe/Paris");
  await p.evaluate(() => localStorage.removeItem("navigator:tz-manual"));
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await p.waitForTimeout(500);
  ok("при возвращении в приложение без ручного выбора пояс подхватывается: " + (await tz()), (await tz()) === "Asia/Tokyo");

  // ── плитка недели: вес и привычки ──
  const lv = () => p.evaluate(() => [...document.querySelectorAll(".week-days .wd i")].map((i) => Number(i.className.match(/lv(\d)/)?.[1])));
  const today = (new Date().getDay() + 6) % 7;
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(900);
  ok("сначала неделя пустая: " + (await lv()).join(""), (await lv())[today] === 0);
  await p.evaluate(() => window.__api("POST", "/health/weight", { weightKg: 70 }));
  await p.reload(); await p.waitForTimeout(900);
  ok("запись веса даёт сегодня уровень 1: " + (await lv()).join(""), (await lv())[today] === 1);
  const h = await p.evaluate(async () => { const r = await window.__api("POST", "/habits", { title: "Вода" }); return (r.body.id ?? JSON.parse(new TextDecoder().decode(r.body)).id); });
  await p.evaluate(async (id) => { await window.__api("POST", `/habits/${id}/activate`, {}); await window.__api("POST", `/habits/${id}/log`, {}); }, h);
  await p.reload(); await p.waitForTimeout(900);
  ok("вес + отметка привычки дают уровень 2: " + (await lv()).join(""), (await lv())[today] === 2);

  // ── серия: прошлое по выполненным задачам ──
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x; };
  await p.evaluate(async ([d1, d2, d3]) => {
    const mk = async (title, when, extra = {}) => window.__prisma.task.create({ data: { title, status: "done", completedAt: new Date(when), ...extra } });
    await mk("a", d1); await mk("b", d2);
    // третий день: задача закрыта, но другая с тем же сроком осталась открытой — день не считается
    await mk("c", d3);
    await window.__prisma.task.create({ data: { title: "висит", status: "todo", deadline: new Date(d3) } });
    localStorage.removeItem("navigator:streak-days"); localStorage.removeItem("navigator:streak-backfilled");
  }, [d(1).toISOString(), d(2).toISOString(), d(4).toISOString()]);
  const added = await p.evaluate(() => window.__streak.backfillStreak());
  const days = await p.evaluate(() => window.__streak.readStreakDays());
  ok("заполнены только полностью закрытые прошлые дни (2): " + days.join(","), added === 2 && days.includes(key(d(1))) && days.includes(key(d(2))) && !days.includes(key(d(4))));
  ok("серия по прошлому = 2", (await p.evaluate(() => window.__streak.readStreak())) === 2);
  ok("повторное заполнение ничего не добавляет", (await p.evaluate(() => window.__streak.backfillStreak())) === 0);

  // ── пропуск дня ──
  await p.evaluate(() => localStorage.setItem("navigator:streak-days", JSON.stringify([])));
  const y = key(d(1)), y2 = key(d(2)), y4 = key(d(4)), y5 = key(d(5));
  await p.evaluate(([a, b2, c]) => { localStorage.setItem("navigator:streak-days", JSON.stringify([a, b2, c])); localStorage.setItem("navigator:streak-skips", JSON.stringify([key3()])); function key3() { const x = new Date(); x.setDate(x.getDate() - 3); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; } }, [y, y2, y4]);
  ok("пропущенный день между двумя закрытыми не рвёт серию (вчера, позавчера, пропуск, 4 дня назад = 3)", (await p.evaluate(() => window.__streak.readStreak())) === 3);
  ok("лучшая серия тоже её учитывает", (await p.evaluate(() => window.__streak.bestStreakFrom(window.__streak.readStreakDays()))) === 3);
  await p.evaluate(() => localStorage.setItem("navigator:streak-skips", "[]"));
  ok("без пропуска серия = 2", (await p.evaluate(() => window.__streak.readStreak())) === 2);
  // кнопка на экране «Я»
  await p.evaluate(() => { localStorage.setItem("navigator:streak-days", JSON.stringify([])); });
  await p.goto("http://localhost:8099/#/me"); await p.reload(); await p.waitForTimeout(900);
  await p.locator(".tile-grid .tile", { hasText: "Серия" }).click(); await p.waitForTimeout(300);
  await p.locator("#skip-day").scrollIntoViewIfNeeded().catch(() => {});
  ok("кнопка «Пропустить сегодня» есть", (await p.locator("#skip-day").count()) === 1);
  await p.click("#skip-day"); await p.waitForTimeout(300);
  ok("после пропуска кнопка «Отменить пропуск»", (await p.locator("#unskip-day").count()) === 1);
  ok("сегодня отмечен пунктиром в календаре", (await p.locator(".cal5 i.skip").count()) === 1);
  await p.click("#unskip-day"); await p.waitForTimeout(300);
  ok("отмена возвращает кнопку", (await p.locator("#skip-day").count()) === 1);
  // лимит: два в неделю
  await p.evaluate(() => { const k = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }; localStorage.setItem("navigator:streak-skips", JSON.stringify([k(1), k(2)])); });
  ok("после двух пропусков за неделю третий не даётся", (await p.evaluate(() => window.__streak.skipToday())) === false);
  // копия
  const ex = await p.evaluate(() => { const k = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }; localStorage.setItem("navigator:streak-skips", JSON.stringify([k(1)])); return null; });
  const saved = await p.evaluate(async () => { const r = await window.__api("GET", "/account/export"); const t = new TextDecoder().decode(r.body); return t.includes("streakSkips"); });
  ok("пропуски попадают в копию данных", saved);
  console.log("ERRORS", errs);
  await b.close();
})();
