import { useEffect, useState, type ChangeEvent } from "react";
import { AppLockCard } from "../components/AppLockCard";
import { PrivacyCard } from "../components/PrivacyCard";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { getInitData, openExternalLink } from "../telegram/sdk";

interface Account {
  id: string;
  username: string | null;
  timezone: string;
  createdAt: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function Settings() {
  const [account, setAccount] = useState<Account | null>(null);
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming">("idle");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);

  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<Record<string, number> | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function loadDriveStatus() {
    // БАГ (найден при повторном аудите): без .catch() сбой запроса (сеть/сервер) оставлял
    // driveConnected равным null навсегда — а в состоянии null на экране нет НИ ОДНОЙ
    // кнопки (ни "подключить", ни "проверить статус"), только надпись "Проверяю...".
    // Пользователь застревал без единого способа выйти из этого состояния, кроме полной
    // перезагрузки приложения. Теперь сбой трактуется как "не подключено" — показывается
    // обычный экран подключения, где есть что нажать.
    api
      .get<{ connected: boolean }>("/google/status")
      .then((s) => setDriveConnected(s.connected))
      .catch(() => setDriveConnected(false));
  }

  useEffect(() => {
    api
      .get<Account>("/account")
      .then((a) => {
        setAccount(a);
        setTimezone(a.timezone);
      })
      .catch(() => {
        // Сбой загрузки — не блокируем экран: поле часового пояса просто останется
        // пустым, пользователь всё ещё может ввести его вручную или нажать "Определить
        // автоматически" ниже.
      });
    loadDriveStatus();
  }, []);

  // Открываем окно авторизации Google в системном браузере; после подключения
  // пользователь возвращается в приложение и жмёт "Проверить статус" — отдельного
  // способа узнать о завершении OAuth-потока изнутри Mini App нет, он происходит
  // в отдельном окне браузера, а не внутри iframe приложения.
  async function connectGoogleDrive() {
    setDriveLoading(true);
    try {
      const { url } = await api.get<{ url: string }>("/google/auth-url");
      openExternalLink(url);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Не удалось начать подключение к Google Drive");
    } finally {
      setDriveLoading(false);
    }
  }

  async function disconnectGoogleDrive() {
    setDriveLoading(true);
    try {
      await api.delete("/google/disconnect");
      setDriveConnected(false);
    } catch {
      alert("Не удалось отключить Google Drive");
    } finally {
      setDriveLoading(false);
    }
  }

  // Определяем часовой пояс устройства сами — пользователь не должен искать его
  // в списке вручную, если можем узнать это сами.
  function detectTimezone() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(detected);
    } catch {
      // браузер не поддерживает — оставляем как есть
    }
  }

  async function saveTimezone() {
    if (!timezone.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/account", { timezone });
      setSaved(true);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Не удалось сохранить часовой пояс");
    } finally {
      setSaving(false);
    }
  }

  // Скачивание файла требует заголовок авторизации, поэтому обычная ссылка <a href>
  // не подойдёт — делаем fetch сами и отдаём файл через Blob.
  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/account/export`, {
        headers: { "x-telegram-init-data": getInitData() },
      });
      if (!res.ok) throw new Error("Не удалось выгрузить данные");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "мои-данные.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать данные. Попробуй ещё раз.");
    } finally {
      setExporting(false);
    }
  }

  // Русские подписи для сводки по таблицам, которую возвращает POST /account/restore —
  // ключи совпадают с именами таблиц на бэкенде (см. services/accountRestore.ts).
  const RESTORE_LABELS: Record<string, string> = {
    profile: "Профиль",
    mission: "Миссия",
    goals: "Цели",
    stages: "Этапы",
    tasks: "Задачи",
    habits: "Привычки",
    habitLogs: "Отметки привычек",
    weightLogs: "Записи веса",
    foodLogs: "Записи питания",
    foodLogEntries: "Блюда в записях питания",
    financialAccounts: "Финансовые счета",
    transactions: "Доходы и расходы",
    debts: "Долги",
    savingsGoals: "Цели накоплений",
    calendarEvents: "События календаря",
    reminders: "Напоминания",
    journalEntries: "Записи дневника",
    memoryItems: "Записи памяти",
    ideas: "Идеи",
    dailyCheckins: "Вечерние вопросы",
    dailySummaries: "Дневные сводки",
    selfPortraits: "Портреты по дневнику",
    weeklyReviews: "Еженедельные отчёты",
    monthlyReviews: "Ежемесячные отчёты",
    directionScores: "Снимки оценки направления",
    detectedTrends: "Замеченные тенденции",
    correlations: "Закономерности",
    aiInsights: "Выводы AI",
    aiAlerts: "Оповещения AI",
  };

  // Восстановление ДОБАВЛЯЕТ данные поверх текущих (не затирает всё подряд) — но записи
  // за даты, которые уже есть (вес, вечерние вопросы, отчёты, оценка направления), будут перезаписаны
  // значениями из файла. Поэтому — явное подтверждение перед запуском, хотя и не такое
  // тяжёлое, как для удаления аккаунта: действие обратимо (можно восстановить более
  // свежий бэкап или просто продолжить пользоваться приложением), просто не мгновенное.
  async function handleRestoreFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы повторный выбор того же файла снова вызвал onChange
    if (!file) return;

    if (
      !confirm(
        "Восстановить данные из этого файла? Существующие цели, задачи и т.д. не удалятся, " +
          "но записи за те же даты (вес, вечерние вопросы, отчёты) будут обновлены значениями из файла."
      )
    ) {
      return;
    }

    setRestoring(true);
    setRestoreSummary(null);
    setRestoreError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Это не похоже на корректный JSON-файл");
      }
      const { summary } = await api.post<{ summary: Record<string, number> }>("/account/restore", parsed);
      setRestoreSummary(summary);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Не удалось восстановить данные");
    } finally {
      setRestoring(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmText !== "УДАЛИТЬ") return;
    setDeleting(true);
    try {
      await api.delete("/account", { confirm: "УДАЛИТЬ" });
      alert("Аккаунт и все данные удалены.");
      window.location.reload();
    } catch {
      alert("Не удалось удалить аккаунт. Попробуй ещё раз.");
      setDeleting(false);
    }
  }

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Настройки</h2>
      </header>

      <div className="card">
        <div className="card-title">Часовой пояс</div>
        <p className="small" style={{ marginBottom: 10 }}>
          От него зависит, что считается «сегодня» для веса, еды, задач и итогов.
        </p>
        <input aria-label="Часовой пояс" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        <div className="actions">
          <button className="secondary" onClick={detectTimezone}>
            Определить
          </button>
          <button className="primary" onClick={saveTimezone} disabled={saving}>
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
        {saved && (
          <p className="mt ok" role="status">
            Сохранено
          </p>
        )}
      </div>

      <AppLockCard />
      <PrivacyCard />

      <div className="card">
        <div className="card-title">Мои данные</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Скачай всё, что приложение о тебе знает, одним файлом. В файле личные записи дневника лежат открытым текстом, храни его
          бережно.
        </p>
        <button className="primary" onClick={exportData} disabled={exporting}>
          {exporting ? "Готовлю файл..." : "Скачать мои данные"}
        </button>

        <p className="small mt" style={{ marginBottom: 10 }}>
          Загрузи обратно файл, который раньше скачал здесь, или резервную копию из Google Drive. Данные добавятся к тем, что уже
          есть.
        </p>
        <label className={restoring ? "file-btn busy" : "file-btn"}>
          {restoring ? "Восстанавливаю..." : "Восстановить из файла"}
          <input type="file" accept="application/json,.json" onChange={handleRestoreFile} disabled={restoring} />
        </label>

        {restoreError && <p className="mt" style={{ color: "var(--red)" }}>{restoreError}</p>}

        {restoreSummary && (
          <div className="mt">
            <p className="ok">Готово, восстановлено:</p>
            <ul className="bullets">
              {Object.entries(restoreSummary)
                .filter(([, count]) => count > 0)
                .map(([key, count]) => (
                  <li key={key}>
                    {RESTORE_LABELS[key] ?? key}: {count}
                  </li>
                ))}
            </ul>
            {Object.values(restoreSummary).every((count) => count === 0) && (
              <p className="small">В файле не нашлось данных для восстановления.</p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Резервные копии в Google Drive</div>

        {driveConnected === null && <p>Проверяю подключение...</p>}

        {driveConnected === false && (
          <>
            <p className="small" style={{ marginBottom: 10 }}>
              Каждую субботу приложение само сохранит файл со всеми данными в папку «Навигатор Жизни — бэкапы» на твоём Google
              Drive.
            </p>
            <button className="primary" onClick={connectGoogleDrive} disabled={driveLoading}>
              {driveLoading ? "Открываю..." : "Подключить Google Drive"}
            </button>
            <button className="secondary" style={{ marginTop: 8, width: "100%" }} onClick={loadDriveStatus}>
              Я уже подключил, проверить
            </button>
          </>
        )}

        {driveConnected === true && (
          <>
            <p className="ok" style={{ marginBottom: 10 }}>
              Подключено
            </p>
            <button className="secondary" style={{ width: "100%" }} onClick={disconnectGoogleDrive} disabled={driveLoading}>
              {driveLoading ? "..." : "Отключить"}
            </button>
          </>
        )}
      </div>

      <div className="card danger-zone">
        <div className="card-title">Удаление аккаунта</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Безвозвратно удалит цели, задачи, историю веса и питания, финансы, память и дневник. Отменить это нельзя.
        </p>

        {deleteStep === "idle" && (
          <button className="danger-outline" onClick={() => setDeleteStep("confirming")}>
            Удалить аккаунт
          </button>
        )}

        {deleteStep === "confirming" && (
          <div>
            <p className="text" style={{ marginBottom: 8 }}>
              Чтобы подтвердить, напиши слово <b>УДАЛИТЬ</b>.
            </p>
            <input aria-label="Подтверждение удаления" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
            <div className="actions">
              <button
                className="secondary"
                onClick={() => {
                  setDeleteStep("idle");
                  setDeleteConfirmText("");
                }}
              >
                Отмена
              </button>
              <button className="danger-fill" onClick={deleteAccount} disabled={deleteConfirmText !== "УДАЛИТЬ" || deleting}>
                {deleting ? "Удаляю..." : "Удалить навсегда"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
