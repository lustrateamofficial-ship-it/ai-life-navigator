// Сборка приложения: один файл скрипта, один файл стилей, страница, манифест и значки.
// Запуск: node build.mjs   (нужен только esbuild; sharp нужен только для значков)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
// Номер сборки: в GitHub Actions задаётся извне (минуты с 1970 года, он же versionCode в Android), локально считается сам.
const BUILD_CODE = String(process.env.NAV_BUILD || Math.floor(Date.now() / 60000));
const APP_BUILD = `${PKG_VERSION}-${BUILD_CODE}`;

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");
const backend = resolve(root, "../backend/src");
const shim = resolve(root, "shim");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Серверные файлы подменяются лёгкими версиями для телефона.
const swap = {
  "db/prisma": resolve(shim, "prisma.ts"),
  "config/env": resolve(shim, "env.ts"),
  "providers/anthropic": resolve(shim, "providers-anthropic.ts"),
};

const plugin = {
  name: "phone-swap",
  setup(b) {
    b.onResolve({ filter: /^(express|react-router-dom|zustand|node:zlib|node:crypto)$/ }, (args) => {
      if (args.path === "express") return { path: resolve(shim, "express.ts") };
      if (args.path === "react-router-dom") return { path: resolve(shim, "router.tsx") };
      if (args.path === "zustand") return { path: resolve(shim, "zustand.ts") };
      return { path: resolve(shim, "node-stub.ts") };
    });
    b.onResolve({ filter: /\.\.?\/.*(db\/prisma|config\/env|providers\/anthropic)(\.js)?$/ }, (args) => {
      for (const [key, target] of Object.entries(swap)) {
        if (args.path.replace(/\.js$/, "").endsWith(key)) return { path: target };
      }
    });
    // Серверные модули, которые на телефоне не нужны: Google, бот, расписание, Sentry.
    b.onResolve({ filter: /^\.\.?\/.*(googleDrive|sentry|scheduler)(\.js)?$/ }, () => ({ path: resolve(shim, "node-stub.ts") }));
    // @prisma/client нужен только для типов
    // На телефоне сервера нет: тексты для пользователя говорят про настройки приложения.
    b.onLoad({ filter: /backend\/src\/.*\.ts$/ }, (args) => {
      let text = readFileSync(args.path, "utf8");
      // На телефоне выбор ИИ делает одна общая очередь (providers-anthropic.ts): главный и запасные.
      const isTextGeneration = /services\/ai\/textGeneration\.ts$/.test(args.path);
      if (isTextGeneration) {
        text = text.replace("if (isGeminiConfigured()) {", "if (false) {").replace("if (isGroqConfigured()) {", "if (false) {");
      }
      if (!/на сервере|ошибка сервера|AI временно|AI недоступен/.test(text) && !isTextGeneration) return undefined;
      text = text
        .replaceAll("AI не настроен на сервере.", "ИИ не настроен: добавь ключ в разделе «Настройки».")
        .replaceAll("AI временно недоступен.", "ИИ временно недоступен.")
        .replaceAll("AI недоступен — показана", "ИИ недоступен — показана")
        .replaceAll("Внутренняя ошибка сервера", "Внутренняя ошибка приложения");
      return { contents: text, loader: "ts" };
    });
    b.onResolve({ filter: /^@prisma\/client$/ }, () => ({ path: resolve(shim, "node-stub.ts") }));
  },
};

const result = await build({
  entryPoints: { app: resolve(root, "src/main.tsx") },
  outdir: dist,
  bundle: true,
  minify: !process.env.DEBUG_BUILD,
  format: "esm",
  target: ["chrome90"],
  jsx: "automatic",
  platform: "browser",
  sourcemap: false,
  legalComments: "none",
  plugins: [plugin],
  loader: { ".json": "json" },
  define: { __APP_VERSION__: JSON.stringify(PKG_VERSION), __APP_BUILD_CODE__: JSON.stringify(BUILD_CODE), __APP_REPO__: JSON.stringify(process.env.NAV_REPO || ""), "process.env.NODE_ENV": '"production"', "import.meta.env": "{}", __APP_BUILD__: JSON.stringify(APP_BUILD) },
  logLevel: "info",
  metafile: true,
  nodePaths: ["/opt/npm-tools/node_modules", resolve(root, "node_modules")],
});

copyFileSync(resolve(root, "public", "manifest.webmanifest"), resolve(dist, "manifest.webmanifest"));
// Версия кэша офлайн-режима берётся из версии приложения и номера сборки: новая сборка всегда обновляет кэш.
writeFileSync(resolve(dist, "sw.js"), readFileSync(resolve(root, "public", "sw.js"), "utf8").replace(/VERSION = "[^"]*"/, `VERSION = "${APP_BUILD}"`));
for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
  if (existsSync(resolve(root, "public", f))) copyFileSync(resolve(root, "public", f), resolve(dist, f));
}
writeFileSync(
  resolve(dist, "index.html"),
  readFileSync(resolve(root, "public/index.html"), "utf8")
);
console.log("Готово:", dist);
