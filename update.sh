#!/usr/bin/env bash
# Обновление приложения на сервере одной командой: ./update.sh
# Что делает: забирает свежий код (если проект лежит в git), пересобирает и перезапускает
# контейнеры, применяет изменения схемы базы и показывает, что запущено.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Нет файла .env. Скопируй .env.example в .env и заполни его." >&2
  exit 1
fi

if [ -d .git ]; then
  echo "Забираю свежий код..."
  git pull --ff-only
else
  echo "Папка не под git: пропускаю получение кода (распакуй новый архив поверх вручную)."
fi

echo "Пересобираю и запускаю..."
docker compose up -d --build

echo "Жду, пока сервер ответит..."
for i in $(seq 1 30); do
  if docker compose ps --status running | grep -q backend; then
    break
  fi
  sleep 2
done

echo
docker compose ps
echo
echo "Последние строки журнала сервера:"
docker compose logs --tail=20 backend
echo
echo "Готово. Если выше нет ошибок, открой приложение в Telegram."
