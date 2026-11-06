// Крайние случаи 1.19: EPUB (пусто, спецсимволы, много записей, личные), копия и возврат внешнего вида,
// «Цели» в облегчённом режиме, добавление Cloudflare.
const { chromium } = require("playwright");
const fs = require("fs");
const { execFileSync } = require("child_process");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: "block", acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem("navigator-debug", "1"));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  const ok = (n, v) => console.log((v ? "ДА  " : "НЕТ ") + n);
  const check = (path) => execFileSync("python3", ["-I", "-c", `
import zipfile,sys,xml.dom.minidom as m
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
i=z.infolist(); assert i[0].filename=="mimetype" and i[0].compress_type==0 and z.read("mimetype")==b"application/epub+zip"
n=0
for f in z.namelist():
    if f.endswith((".xml",".xhtml",".opf")): m.parseString(z.read(f)); n+=1
opf=z.read("OEBPS/content.opf").decode()
import re
ids=re.findall(r'<item id="(c\\d+)"',opf); refs=re.findall(r'idref="(c\\d+)"',opf)
assert ids==refs and all(("OEBPS/"+h) in z.namelist() for h in re.findall(r'href="(ch\\d+\\.xhtml)"',opf))
print(len(ids), z.read("OEBPS/ch001.xhtml").decode().count("<p>"))
`, path]).toString().trim();
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(500);
  await p.evaluate(() => window.__api("PUT", "/profile", { onboardingDone: true }));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(700);
  const epub = async (name) => { const [dl] = await Promise.all([p.waitForEvent("download"), p.click("button:has-text('Сохранить дневник в EPUB')")]); const path = `/tmp/claude-0/${name}.epub`; await dl.saveAs(path); return path; };

  // 1. пустой дневник
  let path = await epub("empty");
  try { ok("пустой дневник: корректная книга (" + check(path) + ")", true); } catch (e) { ok("пустой дневник: " + String(e.message).slice(-200), false); }

  // 2. спецсимволы и много записей
  const t0 = Date.now();
  await p.evaluate(async () => {
    await window.__api("POST", "/journal", { content: 'Тест <b>&amp;</b> "кавычки" \'и\' ]]> <![CDATA[ x ]]> 😀 \u0007 конец', private: false });
    await window.__api("POST", "/journal", { content: "Личное секретное слово ЗЕБРА", private: true });
    const data = JSON.parse(new TextDecoder().decode((await window.__api("GET", "/account/export")).body));
    const base = data.journalEntries[0]; const rows = [];
    for (let i = 0; i < 5000; i++) { const d = new Date(Date.now() - i * 6 * 3600e3).toISOString(); rows.push({ ...base, id: "e" + i, content: "Запись " + i + "\nвторая строка " + "слово ".repeat(40), isPrivate: false, createdAt: d, updatedAt: d }); }
    data.journalEntries = [...data.journalEntries, ...rows];
    await window.__api("POST", "/account/restore", data);
  });
  await p.reload(); await p.waitForTimeout(900);
  const t1 = Date.now(); path = await epub("big"); const ms = Date.now() - t1;
  try { ok(`5000 записей: корректная книга (глав/абзацев: ${check(path)}), ${ms} мс, ${(fs.statSync(path).size / 1024) | 0} КБ`, ms < 8000); } catch (e) { ok("5000 записей: " + String(e.message).slice(-300), false); }
  const raw = fs.readFileSync(path).toString("latin1");
  ok("личная запись по умолчанию не попала", !Buffer.from(fs.readFileSync(path)).includes(Buffer.from("ЗЕБРА")));
  ok("текст <b> экранирован", Buffer.from(fs.readFileSync(path)).includes(Buffer.from("&lt;b&gt;")));
  await p.locator("label.check-row:has-text('Включить личные записи') input").check();
  path = await epub("with-private");
  ok("с галочкой личная запись попала", Buffer.from(fs.readFileSync(path)).includes(Buffer.from("ЗЕБРА")));
  try { check(path); ok("с личными: корректная книга", true); } catch (e) { ok("с личными: " + String(e.message).slice(-200), false); }

  // 3. копия и возврат внешнего вида
  await p.selectOption("#theme-mode", "dark");
  await p.locator("label.check-row:has-text('Облегчённый режим') input").check();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("button:has-text('Скачать файл на телефон')")]);
  await dl.saveAs("/tmp/claude-0/appearance-backup.json");
  const body = fs.readFileSync("/tmp/claude-0/appearance-backup.json", "utf8");
  ok("в копии есть внешний вид", /"appearance"/.test(body) && /"lite":\s*true/.test(body));
  await p.selectOption("#theme-mode", "light");
  await p.locator("label.check-row:has-text('Облегчённый режим') input").uncheck();
  await p.locator("input[type=file]").setInputFiles("/tmp/claude-0/appearance-backup.json"); await p.waitForTimeout(1800);
  const st = await p.evaluate(() => ({ t: document.documentElement.getAttribute("data-theme"), l: document.documentElement.getAttribute("data-lite") }));
  ok("после восстановления тема и режим вернулись: " + JSON.stringify(st), st.t === "dark" && st.l === "1");

  // 4. «Цели» — вкладка экрана «Планы», в облегчённом режиме тоже доступна
  await p.goto("http://localhost:8099/#/plans?tab=goals"); await p.waitForTimeout(700);
  ok("в облегчённом режиме «Планы» с вкладкой «Цели» открываются", (await p.locator("[role=tab]:has-text('Цели')").count()) === 1 && (await p.locator("nav").innerText()).includes("Планы"));

  // 5. Cloudflare: добавление требует Account ID
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem("navigator:appearance")); a.lite = false; localStorage.setItem("navigator:appearance", JSON.stringify(a)); });
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  await p.click("button:has-text('Подключить ещё сервис')"); await p.selectOption("#svc-preset", "cloudflare");
  await p.fill("#svc-key", "cf-token-123"); 
  ok("поле Account ID показано", (await p.locator("#svc-account").count()) === 1);
  await p.locator("button.primary", { hasText: /^Добавить$/ }).click(); await p.waitForTimeout(300);
  ok("без Account ID — понятная ошибка", (await p.innerText("body")).includes("Account ID — 32 символа"));
  await p.fill("#svc-account", "0123456789abcdef0123456789abcdef"); await p.locator("button.primary", { hasText: /^Добавить$/ }).click(); await p.waitForTimeout(300);
  const svc = await p.evaluate(() => JSON.parse(localStorage.getItem("navigator-settings")).services);
  ok("адрес собран с ID: " + (svc && svc[0] && svc[0].baseUrl), svc && svc[0] && svc[0].baseUrl === "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1");
  console.log("ERRORS", errs);
  await b.close();
})();
