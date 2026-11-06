# Многоэтапная сборка: собираем статические файлы через Vite (этап builder), затем
# отдаём их обычным nginx (этап runner) — никакого Node.js и dev-сервера Vite в проде
# не остаётся, только html/css/js и лёгкий веб-сервер.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# ВАЖНО: переменные окружения Vite (VITE_*) встраиваются в собранный JS ВО ВРЕМЯ
# СБОРКИ, а не читаются во время работы контейнера — поэтому их нельзя передать
# обычной переменной окружения runner-контейнеру, они должны попасть сюда как
# build-time ARG. Если адрес backend'а изменится, недостаточно поменять .env и
# перезапустить контейнер — нужно пересобрать именно frontend-образ:
#   docker compose build frontend && docker compose up -d frontend
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
