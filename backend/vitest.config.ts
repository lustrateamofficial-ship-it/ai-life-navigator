import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Модульные тесты не поднимают базу: настоящий клиент Prisma подменён заглушкой (она падает, если тест полез в базу).
const prismaStub = fileURLToPath(new URL("./src/__tests__/stubs/prisma.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.\.?\/)+db\/prisma(\.js)?$/, replacement: prismaStub }],
  },
  test: {
    environment: "node",
    // Настройки, без которых серверный модуль настроек ругается при подключении (настоящие ключи тестам не нужны).
    env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test" },
    include: ["src/__tests__/**/*.test.ts"],
  },
});
