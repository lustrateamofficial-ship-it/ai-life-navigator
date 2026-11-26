// Запускает модульные тесты в нескольких часовых поясах: ошибки вида «работает только в UTC» ловятся сразу.
// Запуск: node scripts/test-tz.mjs backend   или   node scripts/test-tz.mjs mobile
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Папка задаётся относительно корня репозитория, поэтому скрипт работает из любого места.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(repo, process.argv[2] ?? "backend");
const zones = ["UTC", "Europe/Kyiv", "America/New_York", "Pacific/Auckland"];
let failed = false;
for (const tz of zones) {
  console.log(`\n=== Часовой пояс ${tz} ===`);
  const r = spawnSync("npx", ["vitest", "run"], { cwd: dir, stdio: "inherit", env: { ...process.env, TZ: tz }, shell: process.platform === "win32" });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
