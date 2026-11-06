// Путь обновления в приложении на имитации Android: проверка → разрешение → скачивание → установка.
const { chromium } = require("playwright");
const BAD = []; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) BAD.push(t); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1");
    localStorage.setItem("navigator-settings", JSON.stringify({ updateRepo: "owner/navigator" }));
    window.__native = { allowed: false, downloaded: 0, installed: 0, openedSettings: 0, listeners: [] };
    const N = window.__native;
    window.Capacitor = { isNativePlatform: () => true, Plugins: { ApkInstaller: {
      canInstall: async () => ({ allowed: N.allowed }),
      openInstallSettings: async () => { N.openedSettings++; },
      addListener: async (name, cb) => { N.listeners.push(cb); return { remove: async () => {} }; },
      download: async ({ url }) => { N.url = url; for (const pct of [10, 55, 100]) { N.listeners.forEach(cb => cb({ received: pct * 12345, total: 1234500 })); await new Promise(r => setTimeout(r, 250)); } N.downloaded++; return { size: 1234500 }; },
      install: async () => { N.installed++; },
    }, LocalNotifications: { checkPermissions: async () => ({ display: "granted" }), requestPermissions: async () => ({ display: "granted" }), schedule: async () => {}, cancel: async () => {}, getPending: async () => ({ notifications: [] }), addListener: async () => ({ remove: async () => {} }) } } };
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.route("https://api.github.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tag_name: "b99999999", name: "Версия 9.9.9", body: "Что нового\n- быстрее работает\n- исправлены ошибки", html_url: "https://github.com/owner/navigator/releases/tag/b99999999", assets: [{ name: "navigator.apk", size: 1234500, browser_download_url: "https://github.com/owner/navigator/releases/download/b99999999/navigator.apk" }] }) }));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(600);
  await p.evaluate(async () => { await window.__api("PUT", "/profile", { onboardingDone: true }); await window.__api("POST", "/journal", { content: "моя запись", private: false }); });
  // главный экран: плашка «Вышла новая версия»
  await p.reload(); await p.waitForTimeout(1200);
  ok(await p.locator("text=Вышла новая версия").count() > 0, "на главном экране появилась плашка «Вышла новая версия»");
  await p.click("button:has-text('Обновить')"); await p.waitForTimeout(500);
  ok(p.url().includes("#/settings"), "кнопка плашки ведёт в «Версия и обновление»");
  ok(await p.locator("text=Доступна версия Версия 9.9.9").count() > 0 || await p.locator("text=/Доступна версия/").count() > 0, "показана доступная версия");
  ok(await p.locator("text=быстрее работает").count() > 0, "показан список «Что нового»");
  await p.locator("text=Доступна версия").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: "/tmp/claude-0/upd-available.png" });
  // 1-е нажатие: нет разрешения на установку
  await p.click("button:has-text('Обновить')"); await p.waitForTimeout(400);
  ok(await p.locator("text=/разрешить этому приложению/").count() > 0, "без разрешения Android показан понятный шаг «Открыть настройки»");
  await p.click("button:has-text('Открыть настройки')");
  ok(await p.evaluate(() => window.__native.openedSettings) === 1, "кнопка открыла системные настройки установки");
  await p.evaluate(() => { window.__native.allowed = true; });
  await p.click("button:has-text('Я разрешил')"); await p.waitForTimeout(500);
  ok(await p.locator("text=/Скачиваю обновление/").count() > 0, "после разрешения идёт скачивание с процентами");
  await p.screenshot({ path: "/tmp/claude-0/upd-progress.png" });
  await p.waitForTimeout(1200);
  const n = await p.evaluate(() => window.__native);
  ok(n.downloaded === 1 && n.installed === 1 && /navigator\.apk$/.test(n.url), "файл скачан и передан установщику Android");
  ok(await p.locator("text=/Android показал окно установки/").count() > 0, "после запуска установки показано, что делать дальше");
  const snaps = await p.evaluate(() => window.__safety.listSnapshots());
  ok(snaps.some(s => s.kind === "update" && /Перед установкой версии/.test(s.reason)), "перед установкой автоматически сохранена точка восстановления");
  ok((await p.evaluate(() => window.__api("GET", "/journal").then(r => r.body.entries.length))) === 1, "запись дневника на месте");
  await p.screenshot({ path: "/tmp/claude-0/upd-installing.png" });
  // неполная загрузка
  const p2 = await ctx.newPage(); p2.on("pageerror", e => errs.push(e.message));
  await p2.addInitScript(() => { window.__fix = true; });
  await p2.goto("http://localhost:8099/#/settings"); await p2.waitForTimeout(700);
  await p2.evaluate(() => { window.__native.allowed = true; window.Capacitor.Plugins.ApkInstaller.download = async () => ({ size: 5 }); window.__native.installed = 0; });
  await p2.reload(); await p2.waitForTimeout(800);
  console.log("ERRORS", errs); BAD.push(...errs);
  await b.close(); console.log(BAD.length ? "\nНЕ ПРОШЛО: " + BAD.length : "\nВсё прошло");
})();
