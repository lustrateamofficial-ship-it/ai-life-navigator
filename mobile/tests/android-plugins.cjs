const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("navigator-debug", "1");
    window.__log = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      LocalNotifications: {
        checkPermissions: async () => ({ display: "granted" }),
        requestPermissions: async () => ({ display: "granted" }),
        getPending: async () => ({ notifications: [{ id: 1 }] }),
        cancel: async (a) => window.__log.push(["cancel", a.notifications.length]),
        schedule: async (a) => window.__log.push(["schedule", a.notifications.map(n => [n.body, n.schedule.at instanceof Date, n.id])]),
      },
      Filesystem: { writeFile: async (a) => { window.__log.push(["write", a.path, a.data.length]); return { uri: "file:///cache/" + a.path }; } },
      Share: { share: async (a) => window.__log.push(["share", a.url]) },
      BiometricAuth: { checkBiometry: async () => ({ isAvailable: true }), authenticate: async () => window.__log.push(["auth"]) },
    } };
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(800);
  const iso = h => new Date(Date.now() + h * 3600e3).toISOString();
  await p.evaluate(async (a) => {
    await window.__api("PUT", "/profile", { onboardingDone: true });
    await window.__api("POST", "/reminders", { title: "Позвонить", triggerAt: a[0], recurrence: "once" });
    await window.__api("POST", "/reminders", { title: "Зарядка", triggerAt: a[1], recurrence: "daily" });
    await window.__api("POST", "/reminders", { title: "Прошло", triggerAt: a[2], recurrence: "once" });
  }, [iso(1), iso(2), iso(-5)]);
  await p.waitForTimeout(500);
  console.log(JSON.stringify(await p.evaluate(() => window.__log)).slice(0, 700));
  await p.goto("http://localhost:8099/#/settings"); await p.reload(); await p.waitForTimeout(800);
  await p.getByText("Сохранить копию в облако").click(); await p.waitForTimeout(600);
  const t = await p.innerText("body");
  console.log("log tail", JSON.stringify((await p.evaluate(() => window.__log)).slice(-2)));
  console.log("has download button:", t.includes("Скачать файл"), "| notif:", t.includes("Включены"));
  console.log("ERR", errs);
  await b.close();
})();
