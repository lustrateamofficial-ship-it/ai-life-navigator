import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ВАЖНО: этот dev-сервер Vite используется ТОЛЬКО при локальной разработке
// ("npm run dev" напрямую на машине, Вариант 2 из README). В production-деплое
// (docker-compose.yml) фронтенд собирается статически и отдаётся через nginx
// (см. frontend/Dockerfile, frontend/nginx.conf) — там этот файл вообще не участвует.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Актуально только для локального "npm run dev" за самодельным реверс-прокси —
    // начиная с Vite 5, dev-сервер по умолчанию проверяет заголовок Host и отклоняет
    // запросы с незнакомым доменом ("Blocked request. This host is not allowed").
    allowedHosts: true,
  },
});
