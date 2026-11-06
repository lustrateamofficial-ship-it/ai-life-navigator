// Автоматический обход всех экранов: горизонтальная прокрутка, мелкие и безымянные элементы,
// латиница в тексте, ошибки консоли. Запуск на трёх ширинах экрана и в обеих темах.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const routes = ["", "journal", "tasks", "goals", "me", "analytics", "calendar", "reminders", "ideas", "memory", "mission", "settings", "portrait", "trash", "reports", "correlations", "life-graph"];
  const problems = new Map(); const latin = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, v); };
  for (const [w, scheme] of [[320, "light"], [360, "dark"], [414, "light"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: "block", colorScheme: scheme });
    await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
    const p = await ctx.newPage();
    p.on("pageerror", e => add(problems, "ОШИБКА СТРАНИЦЫ " + e.message, w));
    p.on("console", m => { if (m.type() === "error") add(problems, "КОНСОЛЬ " + m.text().slice(0, 100), w); });
    p.on("dialog", d => d.accept());
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
    await p.evaluate(async () => {
      const a = window.__api; const iso = h => new Date(Date.now() + h * 3600e3).toISOString();
      await a("PUT", "/profile", { onboardingDone: true });
      await a("POST", "/tasks", { title: "Очень длинное название задачи, которое точно не поместится в одну строку на узком экране телефона", recurrence: "weekly", deadline: new Date().toISOString().slice(0, 10) + "T12:00:00.000Z" });
      await a("POST", "/goals", { title: "Длинная цель: сбросить пять килограммов и пробежать десять километров без остановки к лету", reason: "Потому что хочу лучше себя чувствовать каждый день" });
      await a("POST", "/habits", { title: "Утренняя зарядка по двадцать минут", targetDays: 30 });
      for (let i = 0; i < 6; i++) await a("POST", "/health/weight", { weightKg: 82 - i * 0.2, date: new Date(Date.now() - i * 86400e3).toISOString() });
      await a("POST", "/finance/expenses", { amount: 123456.5, category: "Очень длинная категория расходов" });
      await a("PUT", "/budget", { category: "Очень длинная категория расходов", limit: 100000 });
      await a("POST", "/calendar", { title: "Встреча с очень длинным названием для проверки переноса", category: "work", startTime: iso(26), endTime: iso(27) });
      await a("POST", "/reminders", { title: "Напоминание с длинным названием для проверки переноса строк", triggerAt: iso(3), recurrence: "daily" });
      await a("POST", "/ideas", { content: "Идея с очень длинным текстом ".repeat(8) });
      await a("POST", "/memory", { type: "fact", content: "Факт ".repeat(40) });
      await a("POST", "/journal", { content: "Длинная запись дневника. ".repeat(30), private: false });
      const t = (await a("POST", "/tasks", { title: "в корзину" })).body; await a("DELETE", "/tasks/" + t.id);
    });
    for (const r of routes) {
      await p.goto("http://localhost:8099/#/" + r); await p.reload(); await p.waitForTimeout(500);
      const res = await p.evaluate(() => {
        const out = { overflow: null, small: [], unnamed: [], latin: [] };
        const de = document.documentElement;
        if (de.scrollWidth > window.innerWidth + 1) {
          const wide = [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 3).map(e => e.tagName + "." + (e.className || "").toString().slice(0, 30));
          out.overflow = de.scrollWidth + ">" + window.innerWidth + " " + wide.join(",");
        }
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
        for (const e of document.querySelectorAll("button, a, input, select, textarea, [role=button]")) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect();
          const isCheck = e.type === "checkbox";
          if (!isCheck && (r.height < 32 || r.width < 32) && e.tagName !== "A") out.small.push(`${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          const name = e.getAttribute("aria-label") || e.getAttribute("title") || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent || e.placeholder || e.getAttribute("aria-labelledby");
          if (!name || !name.trim()) out.unnamed.push(e.tagName + (e.className ? "." + e.className.toString().slice(0, 20) : ""));
        }
        const text = document.body.innerText;
        for (const m of text.matchAll(/[A-Za-z]{2,}/g)) out.latin.push(m[0]);
        return out;
      });
      const where = `${r || "сегодня"}@${w}`;
      if (res.overflow) add(problems, `ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА ${where}: ${res.overflow}`, w);
      for (const s of res.small) add(problems, `МЕЛКИЙ ЭЛЕМЕНТ ${r || "сегодня"}: ${s}`, w);
      for (const s of res.unnamed) add(problems, `БЕЗ НАЗВАНИЯ ${r || "сегодня"}: ${s}`, w);
      for (const l of res.latin) add(latin, l, r || "сегодня");
    }
    await ctx.close();
  }
  console.log("— проблемы (" + problems.size + "):"); for (const k of problems.keys()) console.log("  " + k);
  console.log("— латиница в видимом тексте:", [...latin.entries()].map(([k, v]) => k + "(" + v + ")").join(", "));
  await b.close();
})();
