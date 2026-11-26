// Ищет в коде необъявленные имена и импорты того, чего нет в файле (ошибки TS2304, TS2552, TS2305, TS2724, TS2614).
// esbuild такое не замечает: приложение собирается, а экран потом ломается. Остальные ошибки типов (например, из-за
// отсутствия типов React) здесь намеренно не проверяются. Запуск: node tools/check-names.mjs
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let tsc;
for (const base of [root, "/opt/npm-tools/node_modules"]) {
  try {
    tsc = require.resolve("typescript/bin/tsc", { paths: [base] });
    break;
  } catch {
    /* пробуем следующий путь */
  }
}
if (!tsc) {
  console.error("Не найден typescript: выполни npm install");
  process.exit(2);
}
const r = spawnSync(
  process.execPath,
  [tsc, "--noEmit", "--jsx", "react-jsx", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck", "--lib", "es2022,dom,dom.iterable", "src/main.tsx"],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);
// Клиент базы (@prisma/client) создаётся командой prisma generate, которой в проверке нет, а в приложении база подменена:
// поэтому его имена здесь не проверяются.
const bad = (r.stdout + r.stderr)
  .split("\n")
  .filter((l) => /error TS(2304|2552|2305|2724|2614):/.test(l) && !l.includes("@prisma/client"));
if (bad.length) {
  console.error("Найдены необъявленные имена или неверные импорты:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("Проверка имён: всё в порядке");
