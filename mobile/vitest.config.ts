import { defineConfig } from "vitest/config";

// Модульные тесты чистых правил приложения (серия, неделя, цель по весу). Экраны и хранилище проверяют браузерные тесты в tests/.
export default defineConfig({
  test: {
    environment: "node",
    include: ["unit/**/*.test.ts"],
  },
});
