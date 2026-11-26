// Дизайн 1.23 («Плитки с неделей»): на всех экранах в обеих темах нет острых углов у видимых плашек,
// на «Сегодня» есть плитки «Неделя» и «Вес», а ряд из двух половинок встаёт в две колонки.
const { chromium } = require("playwright");
const scan = () => {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
  const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const path = (e) => { let s = e.tagName.toLowerCase(); if (e.id) s += "#" + e.id; if (typeof e.className === "string" && e.className.trim()) s += "." + e.className.trim().split(/\s+/).join("."); return s; };
  for (const e of document.querySelectorAll("body *")) {
    if (["SCRIPT", "STYLE", "path", "circle", "rect", "line", "polyline", "g", "text", "svg", "use", "tspan"].includes(e.tagName)) continue;
    if (!vis(e)) continue;
    const s = getComputedStyle(e);
    const bg = alpha(s.backgroundColor) > 0.02 || s.backgroundImage !== "none";
    const sides = ["Top", "Right", "Bottom", "Left"].map((k) => parseFloat(s["border" + k + "Width"]) > 0 && s["border" + k + "Style"] !== "none" && alpha(s["border" + k + "Color"]) > 0.02);
    const allBorder = sides.every(Boolean);
    const outline = false;
    if (!bg && !allBorder) continue;
    const rad = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => parseFloat(s["border" + k + "Radius"]) || 0);
    const r = e.getBoundingClientRect();
    const isNavLike = s.position === "fixed" && r.bottom >= innerHeight - 1;
    const bad = rad.map((v, i) => v < 1 && !(isNavLike && i > 1));
    if (bad.some(Boolean)) {
      if (e.tagName === "INPUT" && (e.type === "checkbox" || e.type === "radio")) continue;
      out.push(path(e).slice(0, 90) + " r=" + rad.join("/") + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
  }
  return out;
};
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const scheme of ["light", "dark"]) {
    const c = await b.newContext({ viewport: { width: 360, height: 780 }, colorScheme: scheme, serviceWorkers: "block" });
    await c.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
    const p = await c.newPage();
    await p.goto("http://localhost:8099/"); await p.waitForTimeout(400);
    await p.evaluate(async () => {
      const A = window.__api; const t = async (...a) => { try { await A(...a); } catch (e) {} };
      await t("PUT", "/profile", { onboardingDone: true, weightGoalKg: 76 });
      for (const x of ["Позвонить маме", "Купить воду"]) await t("POST", "/tasks", { title: x });
      await t("POST", "/journal", { content: "Запись" });
      await t("POST", "/goals", { title: "Цель", description: "x" });
      await t("POST", "/habits", { title: "Зарядка", targetDays: 30 });
      await t("POST", "/health/weight", { weightKg: 80 });
    });
    await p.reload(); await p.waitForTimeout(700);
    for (const r of ["", "journal", "plans", "plans?tab=goals", "plans?tab=calendar", "plans?tab=reminders", "me", "settings", "ideas", "memory", "mission", "analytics", "trash", "week-review"]) {
      await p.goto("http://localhost:8099/#/" + r); await p.waitForTimeout(450);
      await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
      const list = await p.evaluate(scan);
      if (list.length) { bad++; console.log("НЕТ: острые углы", scheme, "/" + r, list.slice(0, 4)); }
    }
    await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(500);
    const info = await p.evaluate(() => {
      const w = document.querySelector('[data-block="week"]'), g = document.querySelector('[data-block="weight"]'), r = document.querySelector('[data-block="ring"]');
      const bw = (e) => e && Math.round(e.getBoundingClientRect().width);
      const top = (e) => e && Math.round(e.getBoundingClientRect().top);
      return { week: !!w, weight: !!g, ring: !!r, wW: bw(w), gW: bw(g), rW: bw(r), sameRow: g && r && top(g) === top(r) };
    });
    if (!info.week || !info.weight || !info.ring) { bad++; console.log("НЕТ: плитки на «Сегодня»", scheme, info); }
    else if (!info.sameRow || info.gW > info.wW * 0.6) { bad++; console.log("НЕТ: «Вес» и «Кольцо» не в одном ряду", scheme, info); }
    await c.close();
  }
  console.log(bad ? "ERRORS [design]" : "design a4: ok");
  await b.close();
  process.exit(bad ? 1 : 0);
})();
