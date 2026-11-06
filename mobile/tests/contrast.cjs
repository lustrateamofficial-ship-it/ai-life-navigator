// Контраст текста (WCAG): обычный текст не ниже 4.5, крупный (от 18,7 px жирным или 24 px) не ниже 3.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const bad = new Map();
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block", colorScheme: scheme });
    await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
    const p = await ctx.newPage();
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
    await p.evaluate(async () => { const a = window.__api; await a("PUT", "/profile", { onboardingDone: true }); await a("POST", "/tasks", { title: "Задача", recurrence: "daily" }); await a("POST", "/goals", { title: "Цель" }); await a("POST", "/journal", { content: "Запись", private: false }); await a("POST", "/finance/expenses", { amount: 5000, category: "Еда" }); await a("PUT", "/budget", { category: "Еда", limit: 1000 }); const t = (await a("POST", "/tasks", { title: "к" })).body; await a("DELETE", "/tasks/" + t.id); });
    for (const r of ["", "journal", "tasks", "goals", "me", "analytics", "calendar", "reminders", "ideas", "memory", "settings", "trash"]) {
      await p.goto("http://localhost:8099/#/" + r); await p.reload(); await p.waitForTimeout(450);
      const found = await p.evaluate(() => {
        const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,\/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
        const lum = ({ r, g, b }) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = el => { let layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255 }; for (const c of layers.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = walker.nextNode()); ) {
          const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el) continue;
          const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || el.closest("[disabled]")) continue;
          const rect = el.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) continue;
          const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el);
          const a = fg.a; const f = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
          const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold);
          if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} «${t.slice(0, 28)}» ${size}px ${el.className.toString().slice(0, 24)}`);
        }
        return out;
      });
      for (const f of found) { const k = scheme + " | " + f; if (!bad.has(k)) bad.set(k, r || "сегодня"); }
    }
    await ctx.close();
  }
  console.log("мало контраста:", bad.size);
  for (const [k, r] of [...bad.entries()].slice(0, 25)) console.log("  " + k + "  [" + r + "]");
  await b.close();
})();
