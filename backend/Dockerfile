# Многоэтапная сборка: в финальном образе остаётся только скомпилированный dist/ и
# production-зависимости — без исходников TypeScript и без devDependencies (tsx,
# vitest, typescript и т.д.), которые в проде не нужны и только раздувают образ.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# prisma generate здесь нужен, чтобы "npm run build" (tsc) видел типы Prisma Client
# при компиляции — сам сгенерированный клиент в финальный образ не копируется,
# он будет заново сгенерирован ниже уже под целевую платформу (см. комментарий ниже).
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# --omit=dev: ставим только то, что нужно для запуска (включая prisma — он теперь в
# dependencies, а не devDependencies, потому что entrypoint вызывает "npx prisma
# db push" прямо в проде при каждом старте контейнера).
RUN npm install --omit=dev

COPY prisma ./prisma
# Генерируем Prisma Client заново уже в финальном образе: бинарный "engine" Prisma
# зависит от платформы, на которой выполняется "generate", а builder-этап и
# runner-этап в принципе МОГУТ собираться на разных платформах (например, сборка на
# Apple Silicon, деплой на amd64-сервер) — копировать сгенерированный клиент из
# builder было бы ненадёжно.
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 4000
CMD ["./entrypoint.sh"]
