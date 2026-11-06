#!/bin/sh
set -e

echo "🧭 AI Life Navigator — syncing database schema..."
# См. комментарий в docker-compose.yml: "migrate deploy" требует заранее сгенерированных
# файлов миграций, которых в этом репозитории нет — "db push" синхронизирует схему
# с базой напрямую, без них.
npx prisma db push

echo "🧭 Starting backend..."
# Образ собирается в два этапа (см. Dockerfile) — в финальном слое уже лежит готовый
# dist/, исходников и tsx тут нет, поэтому запускаем сразу скомпилированный файл.
node dist/index.js
