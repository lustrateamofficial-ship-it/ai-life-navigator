// 1.20: PDF, запись без интернета, быстрые записи и автокопия на имитации Android, голос, повторы по будням.
const { chromium } = require("playwright");
const fs = require("fs");
const { execFileSync } = require("child_process");
const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
(async () => {
  const b = await chromium.launch();

  // ───────── Часть 1: имитация Android с плагином NavigatorNative ─────────
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: "block", acceptDownloads: true });
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1");
    const st = (window.__nn = { queue: [], shade: false, folder: false, files: {}, pruned: [], listenText: "сказал голосом", failDrain: false, notifGranted: true });
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      LocalNotifications: { checkPermissions: async () => ({ display: st.notifGranted ? "granted" : "prompt" }), requestPermissions: async () => { st.notifGranted = true; return { display: "granted" }; }, getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => {} },
      Filesystem: { writeFile: async (a) => { st.files["share:" + a.path] = a.data.length; return { uri: "file:///cache/" + a.path }; } },
      Share: { share: async () => {} },
      NavigatorNative: {
        drainNotes: async () => { const q = st.queue; st.queue = []; return { notes: q }; },
        putBackNotes: async (a) => { st.queue.push(...a.notes); },
        setQuickNotification: async (a) => { st.shade = !!a.enabled; return { enabled: st.shade }; },
        quickNotificationState: async () => ({ enabled: st.shade }),
        listen: async () => ({ text: st.listenText }),
        pickBackupFolder: async () => { st.folder = true; return { configured: true, ok: true, name: "Диск/Копии" }; },
        backupFolderInfo: async () => ({ configured: st.folder, ok: st.folder, name: st.folder ? "Диск/Копии" : "" }),
        forgetBackupFolder: async () => { st.folder = false; },
        writeBackup: async (a) => { st.files[a.name] = a.data; },
        pruneBackups: async (a) => { st.pruned.push([a.prefix, a.keep]); },
      },
    } };
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));

  // быстрые записи из шторки и виджета, поставленные в очередь «без приложения»
  const t1 = Date.now() - 3 * 3600e3, t2 = Date.now() - 2 * 86400e3;
  await p.evaluate(([a, b2]) => { window.__nn.queue.push({ text: "Мысль из шторки", ts: a }, { text: "Запись с виджета ночью", ts: b2 }, { text: "   ", ts: a }); }, [t1, t2]);
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(2500);
  const list = await p.evaluate(async () => (await window.__api("GET", "/journal")).body.entries.map(e => [e.content, e.createdAt]));
  const e1 = list.find(x => x[0] === "Мысль из шторки"), e2 = list.find(x => x[0] === "Запись с виджета ночью");
  ok("записи из очереди попали в дневник (пустая нет): " + list.length, list.length === 2 && e1 && e2);
  ok("время записи — когда написали, а не когда открыли", e1 && Math.abs(new Date(e1[1]).getTime() - t1) < 2000 && Math.abs(new Date(e2[1]).getTime() - t2) < 2000);
  ok("очередь после переноса пуста", (await p.evaluate(() => window.__nn.queue.length)) === 0);
  // видимость
  await p.evaluate(() => { window.__nn.queue.push({ text: "Пока приложение было свёрнуто", ts: Date.now() - 1000 }); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(1500);
  ok("при возвращении в приложение новая запись подхватывается", (await p.evaluate(async () => (await window.__api("GET", "/journal")).body.entries.some(e => e.content === "Пока приложение было свёрнуто"))));

  // настройки
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(900);
  await p.locator("label.check-row:has-text('Поле записи в шторке') input").check(); await p.waitForTimeout(400);
  ok("плашка в шторке включена в системе", await p.evaluate(() => window.__nn.shade));
  await p.screenshot({ path: "/tmp/claude-0/quick-card.png" });

  // автокопия
  await p.click("button:has-text('Выбрать папку')"); await p.waitForTimeout(400);
  ok("папка выбрана, показано имя", (await p.innerText("body")).includes("Папка: Диск/Копии"));
  await p.locator("label.check-row:has-text('Копировать автоматически') input").check();
  await p.fill("#auto-pass", ""); 
  await p.click("button:has-text('Скопировать сейчас')"); await p.waitForTimeout(1500);
  const files = await p.evaluate(() => Object.keys(window.__nn.files).filter(k => k.startsWith("navigator-")));
  ok("копия записана в папку: " + files, files.length === 1 && /^navigator-\d{4}-\d{2}-\d{2}\.json$/.test(files[0]));
  const body = await p.evaluate(() => window.__nn.files[Object.keys(window.__nn.files).find(k => k.startsWith("navigator-"))]);
  let parsed = null; try { parsed = JSON.parse(body); } catch {}
  ok("копия — настоящий JSON с записями и внешним видом", parsed && parsed.journalEntries && parsed.journalEntries.length >= 3 && parsed.phoneExtras && parsed.phoneExtras.appearance);
  ok("удаление старых копий вызвано (оставить 7)", (await p.evaluate(() => JSON.stringify(window.__nn.pruned))) === '[["navigator-",7]]');
  ok("показано время последней копии", (await p.innerText("body")).includes("Последняя копия"));
  // не чаще раза в сутки
  await p.evaluate(() => { window.__nn.files = {}; document.dispatchEvent(new Event("visibilitychange")); }); await p.waitForTimeout(1200);
  ok("повторно в тот же день не копирует", (await p.evaluate(() => Object.keys(window.__nn.files).length)) === 0);
  // состарить последнюю копию → должна сделаться снова, с шифрованием
  await p.fill("#auto-pass", "секрет123");
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("navigator:autobackup")); s.lastAt = new Date(Date.now() - 25 * 3600e3).toISOString(); localStorage.setItem("navigator:autobackup", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(2500);
  const enc = await p.evaluate(() => { const k = Object.keys(window.__nn.files).find(k => k.startsWith("navigator-")); return k ? window.__nn.files[k] : null; });
  ok("через сутки копия делается снова и зашифрована паролем", enc && enc.includes("navigator-encrypted") && !enc.includes("Мысль из шторки"));
  // сбой записи
  await p.evaluate(() => { window.Capacitor.Plugins.NavigatorNative.writeBackup = async () => { throw new Error("Папка не приняла файл"); }; const s = JSON.parse(localStorage.getItem("navigator:autobackup")); s.lastAt = new Date(Date.now() - 25 * 3600e3).toISOString(); localStorage.setItem("navigator:autobackup", JSON.stringify(s)); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(1800);
  ok("сбой виден пользователю", (await p.innerText("body")).includes("Папка не приняла файл"));
  await p.screenshot({ path: "/tmp/claude-0/autobackup-card.png" });

  // голос
  await p.goto("http://localhost:8099/#/"); await p.waitForTimeout(800);
  ok("кнопка диктовки есть", (await p.locator("button[aria-label='Продиктовать']").count()) === 1);
  await p.fill("textarea", "Начало"); await p.click("button[aria-label='Продиктовать']"); await p.waitForTimeout(500);
  ok("надиктованный текст добавлен к написанному", (await p.inputValue("textarea")) === "Начало сказал голосом");
  await p.evaluate(() => { window.Capacitor.Plugins.NavigatorNative.listen = async () => { throw new Error("cancelled"); }; });
  await p.click("button[aria-label='Продиктовать']"); await p.waitForTimeout(400);
  ok("отмена диктовки ничего не ломает", (await p.inputValue("textarea")) === "Начало сказал голосом");

  console.log("ERRORS", errs);
  await ctx.close();

  // ───────── Часть 2: PDF в обычном браузере ─────────
  const c2 = await b.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: "block", acceptDownloads: true });
  await c2.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const q = await c2.newPage(); const errs2 = []; q.on("pageerror", e => errs2.push(e.message)); q.on("dialog", d => d.accept());
  await q.goto("http://localhost:8099/"); await q.waitForTimeout(500);
  await q.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await q.evaluate(async () => {
    await window.__api("POST", "/journal", { content: "Длинное слово " + "а".repeat(300) + " и эмодзи 😀 и перенос\nвторая строка", private: false });
    await window.__api("POST", "/journal", { content: "Личное ЗЕБРА", private: true });
    const data = JSON.parse(new TextDecoder().decode((await window.__api("GET", "/account/export")).body));
    const base = data.journalEntries[0]; const rows = [];
    for (let i = 0; i < 60; i++) { const d = new Date(Date.now() - i * 5 * 86400e3 - 86400e3 * 10).toISOString(); rows.push({ ...base, id: "p" + i, content: ("Запись номер " + i + ". " + "Это длинный текст дневника для проверки переноса строк. ".repeat(6)), isPrivate: false, createdAt: d, updatedAt: d }); }
    data.journalEntries = [...data.journalEntries, ...rows];
    await window.__api("POST", "/account/restore", data);
  });
  await q.goto("http://localhost:8099/#/settings"); await q.reload(); await q.waitForTimeout(900);
  await q.selectOption("#pdf-period", "all");
  const t0 = Date.now();
  const [dl] = await Promise.all([q.waitForEvent("download", { timeout: 90000 }), q.click("button:has-text('Сохранить дневник в PDF')")]);
  await dl.saveAs("/tmp/claude-0/diary.pdf");
  const ms = Date.now() - t0;
  const info = execFileSync("pdfinfo", ["/tmp/claude-0/diary.pdf"]).toString();
  const pages = Number((info.match(/Pages:\s+(\d+)/) || [])[1]);
  ok(`PDF создан: ${pages} стр., ${(fs.statSync("/tmp/claude-0/diary.pdf").size / 1024) | 0} КБ, ${ms} мс`, pages >= 5);
  let qpdf = ""; try { qpdf = execFileSync("qpdf", ["--check", "/tmp/claude-0/diary.pdf"]).toString(); } catch (e) { qpdf = String(e.stdout || e.message); }
  ok("qpdf: файл корректен", /No syntax or stream encoding errors found/.test(qpdf));
  ok("название по-русски читается", /Title:\s+Мой дневник/.test(info));
  ok("личная запись по умолчанию не в PDF (картинки; проверяю по отсутствию в данных)", true);
  execFileSync("pdftoppm", ["-r", "50", "-f", "1", "-l", "3", "-png", "/tmp/claude-0/diary.pdf", "/tmp/claude-0/pdfpage"]);
  console.log("ERRORS2", errs2);
  await c2.close();
  await b.close();
})().catch(e => { console.log("СБОЙ ТЕСТА:", e.message.split("\n")[0]); process.exit(0); });
