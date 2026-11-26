// Запускает все браузерные проверки из папки tests подряд и печатает итог.
// Нужны: собранное приложение (npm run build) и Playwright с Chromium. Сервер для папки dist поднимается здесь же (порт 8099).
// Провал: код выхода не ноль или в выводе есть «НЕТ», «Error:», «TimeoutError» или непустой список ERRORS.
// Запуск: node tests/run-all.mjs [часть имени файла ...]   (без аргументов запускаются все)
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("Нет папки dist: сначала выполни npm run build");
  process.exit(2);
}

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(8099, ok));

const filters = process.argv.slice(2);
const files = readdirSync(join(root, "tests"))
  .filter((f) => f.endsWith(".cjs") && (filters.length === 0 || filters.some((x) => f.includes(x))))
  .sort();

const bad = /НЕТ|ERRORS \[[^\]]|Error:|TimeoutError/;
const failed = [];
for (const f of files) {
  const t0 = Date.now();
  // Асинхронный запуск: сервер живёт в этом же процессе, синхронное ожидание остановило бы его.
  const r = await new Promise((done) => {
    const child = spawn(process.execPath, [join(root, "tests", f)], { cwd: root, env: process.env });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      text += "\nTimeoutError: тест не уложился в 170 секунд";
    }, 170_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ status, text });
    });
  });
  const out = r.text;
  const ok = r.status === 0 && !bad.test(out);
  console.log(`${ok ? "ok  " : "FAIL"} ${f} (${Math.round((Date.now() - t0) / 1000)} с)`);
  if (!ok) {
    failed.push(f);
    console.log(out.split("\n").filter((l) => bad.test(l)).slice(0, 5).join("\n"));
  }
}
server.close();
console.log(`\nИтого: ${files.length - failed.length} из ${files.length} прошли${failed.length ? "; не прошли: " + failed.join(", ") : ""}`);
process.exit(failed.length ? 1 : 0);
