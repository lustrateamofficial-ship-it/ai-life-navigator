const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("navigator-debug", "1"); localStorage.setItem("navigator-settings", JSON.stringify({ geminiApiKey: "test" })); });
  await ctx.route("**/generativelanguage.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tasks: [{ title: "Купить молоко", deadline: null }], reminders: [], ideas: [], transactions: [], weight: null, food: [] }) }] } }] }) }));
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  const txt = async () => (await p.innerText("body")).replace(/\n+/g, " | ");
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
  await p.locator("textarea").first().fill("Надо купить молоко.");
  await p.getByRole("button", { name: "Записать" }).first().click(); await p.waitForTimeout(2000);
  console.log("предложения в знакомстве:", (await txt()).includes("Задача: Купить молоко"), "| кнопка:", (await txt()).includes("Продолжить"));
  await p.getByRole("button", { name: /Добавить \(/ }).click(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Продолжить" }).click(); await p.waitForTimeout(800);
  console.log("главный экран:", (await txt()).includes("Купить молоко"), (await txt()).startsWith("Сегодня"));
  // шифрование
  await p.goto("http://localhost:8099/#/settings"); await p.waitForTimeout(600);
  await p.locator("#backup-password").fill("секрет123");
  const [dl] = await Promise.all([p.waitForEvent("download").catch(() => null), p.getByText("Скачать файл на телефон").click()]);
  let content = "";
  if (dl) { const fs = require("fs"); const path = await dl.path(); content = fs.readFileSync(path, "utf8"); }
  console.log("файл зашифрован:", content.includes('"navigator-encrypted"'), "| виден открытый текст:", content.includes("Купить молоко"));
  p.on("dialog", d => d.accept().catch(() => {}));
  // восстановление с неверным и верным паролем
  const fs = require("fs"); fs.writeFileSync("/tmp/enc-backup.json", content);
  await p.evaluate(async () => { await window.__api("POST", "/journal", { content: "лишнее", private: true }); });
  await p.locator("input[type=file]").setInputFiles("/tmp/enc-backup.json");
  await p.waitForTimeout(1200);
  await p.locator("#backup-password").fill("не тот");
  await p.locator("input[type=file]").setInputFiles("/tmp/enc-backup.json"); await p.waitForTimeout(1200);
  console.log("неверный пароль:", (await txt()).includes("неверный пароль"));
  await p.locator("#backup-password").fill("секрет123");
  await p.locator("input[type=file]").setInputFiles("/tmp/enc-backup.json"); await p.waitForTimeout(1500);
  {const t=await txt(); console.log("верный пароль:", t.includes("Готово, восстановлено"), t.slice(t.indexOf("Восстанов"),t.indexOf("Восстанов")+160));}
  console.log("ERRORS", errs);
  await b.close();
})();
