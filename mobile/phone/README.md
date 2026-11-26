# phone: возможности приложения на телефоне

Модули, которых в серверной логике никогда не было. Это то, что умеет само приложение: оно вызывает их напрямую, а не через маршруты.

- **Данные и надёжность:** `safety.ts` (версия данных, миграции, точки восстановления), `autoBackup.ts`, `backupCrypto.ts`, `trash.ts`, `phoneExtras.ts` (настройки телефона в копиях), `pendingAnalysis.ts` (разбор записей, отложенный до появления ИИ), `errorLog.ts`.
- **Дни и привычки:** `daily.ts` (утренняя сводка, вечерний план), `streak.ts`, `weekStats.ts`, `weightGoal.ts`, `recurrence.ts`, `evening.ts`, `reminderRunner.ts`, `budget.ts`, `quickNotes.ts`, `charts.ts`.
- **ИИ:** `aiRouter.ts` (очередь сервисов, паузы, выбор моделей).
- **Android:** `native.ts`, `nativeExtras.ts` (уведомления, общий доступ к файлам, биометрия, папка автокопии), `updater.ts`.
- **Вид:** `appearance.ts`, `homeLayout.ts`, `feedback.ts`, `intro.ts`.
- **Экспорт дневника:** `epub.ts`, `pdf.ts`.

Эти модули можно свободно импортировать из `src/`. Подменные файлы для сборки находятся в `../shim`.
