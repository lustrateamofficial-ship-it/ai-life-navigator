import { useEffect, useState, type ChangeEvent } from "react";
import { AppLockCard } from "../components/AppLockCard";
import { AiRouterCard } from "../components/AiRouterCard";
import { UpdateCard } from "../components/UpdateCard";
import { RestorePointsCard } from "../components/RestorePointsCard";
import { PrivacyCard } from "../components/PrivacyCard";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { localRequest } from "../../shim/server";
import { wipeAll } from "../../shim/prisma";
import { clearSnapshots } from "../../shim/safety";
import { writeBudget } from "../../shim/phoneExtras";
import { buildReport, clearErrors, readErrors } from "../../shim/errorLog";
import { readSettings, writeSettings, type LocalSettings } from "../../shim/env";
import { openExternalLink } from "../platform/sdk";
import { DailyCard } from "../components/DailyCard";
import { readEvening, writeEvening, suggestEveningTime, type EveningSettings } from "../../shim/evening";
import { writeAppearance, type ThemeMode } from "../../shim/appearance";
import { useAppearance } from "../useAppearance";
import { QuickNoteCard, AutoBackupCard } from "../components/QuickAndBackupCards";
import { buildDiaryEpub } from "../../shim/epub";
import { buildDiaryPdf, TooManyPagesError, type PdfPeriod } from "../../shim/pdf";
import { syncNativeReminders } from "../../shim/native";
import { markBackupDone } from "../components/BackupNudge";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "../../shim/backupCrypto";
import { isNative, nativeAskNotifications, nativeNotificationState, nativeShareText, nativeShareBinary } from "../../shim/native";

interface Account {
  id: string;
  username: string | null;
  timezone: string;
  createdAt: string;
}

const KEY_FIELDS: Array<{ key: keyof LocalSettings; label: string; hint: string; link?: string }> = [
  {
    key: "geminiApiKey",
    label: "Ключ Gemini (бесплатный)",
    hint: "Рекомендую начать с него: бесплатный, без карты, хватает на обычный дневник.",
    link: "https://aistudio.google.com/apikey",
  },
  {
    key: "groqApiKey",
    label: "Ключ Groq (бесплатный)",
    hint: "Бесплатный, очень быстрый. Подхватит запросы, если у Gemini закончился лимит.",
    link: "https://console.groq.com/keys",
  },
  {
    key: "anthropicApiKey",
    label: "Ключ Claude (платный, по желанию)",
    hint: "Не нужен. Если добавишь, он будет в самом конце очереди (подписка Claude не подходит, нужен ключ API со счётом).",
    link: "https://console.anthropic.com/settings/keys",
  },
  {
    key: "openaiApiKey",
    label: "Ключ ChatGPT (платный, по желанию)",
    hint: "Не нужен. Если добавишь, будет в конце очереди.",
    link: "https://platform.openai.com/api-keys",
  },
  {
    key: "deepseekApiKey",
    label: "Ключ DeepSeek (платный, по желанию)",
    hint: "Не нужен. Дешёвый платный сервис, серверы в Китае.",
    link: "https://platform.deepseek.com/api_keys",
  },
];

const PAID_KEYS: Array<keyof LocalSettings> = ["anthropicApiKey", "openaiApiKey", "deepseekApiKey"];

function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Settings() {
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming">("idle");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [keys, setKeys] = useState<LocalSettings>(readSettings());
  const [keysSaved, setKeysSaved] = useState(false);
  const [notifState, setNotifState] = useState<string>(
    isNative() ? "default" : typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [backupPassword, setBackupPassword] = useState("");
  const [reportText, setReportText] = useState<string | null>(null);
  async function showReport() {
    let counts: Record<string, number> = {};
    try {
      const j = await api.get<{ entries: unknown[] }>("/journal");
      const t = await api.get<unknown[]>("/tasks?range=all");
      counts = { "Записей дневника": j.entries.length, "Задач": t.length, "Сбоев в журнале": readErrors().length };
    } catch {
      /* без счётчиков отчёт тоже полезен */
    }
    setReportText(buildReport({ ...counts, "В приложении Android": isNative() ? "да" : "нет" }));
  }
  async function sendReport() {
    if (!reportText) return;
    try {
      if (isNative() && (await nativeShareText("отчёт-о-проблеме.txt", reportText))) return;
      if ((navigator as any).share) await (navigator as any).share({ title: "Отчёт о проблеме", text: reportText });
      else {
        await navigator.clipboard.writeText(reportText);
        setNotice("Отчёт скопирован. Вставь его в сообщение.");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setNotice("Не удалось отправить отчёт. Выдели текст и скопируй вручную.");
    }
  }
  const appearance = useAppearance();
  const [includePrivate, setIncludePrivate] = useState(false);
  const [epubBusy, setEpubBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfPeriod, setPdfPeriod] = useState<PdfPeriod>("365");
  const [eveningHint, setEveningHint] = useState("");
  const [evening, setEvening] = useState<EveningSettings>(readEvening());

  async function pickEveningTime() {
    try {
      const r = await api.get<{ entries: Array<{ createdAt: string; isPrivate?: boolean }> }>("/journal?limit=60");
      const t = suggestEveningTime(r.entries.map((e) => e.createdAt));
      if (!t) return setEveningHint("Пока мало записей, чтобы подобрать время. Нужно хотя бы пять.");
      changeEvening({ ...evening, time: t });
      setEveningHint(`Поставил ${t}: примерно в это время ты обычно пишешь.`);
    } catch {
      setEveningHint("Не получилось подобрать время. Выбери его вручную.");
    }
  }

  async function exportPdf() {
    if (pdfBusy) return;
    setPdfBusy("Рисую страницы...");
    try {
      const { bytes, count, pages } = await buildDiaryPdf(includePrivate, pdfPeriod, (n) => setPdfBusy(`Готово страниц: ${n}`));
      const name = `дневник-${new Date().toISOString().slice(0, 10)}.pdf`;
      if (isNative() && (await nativeShareBinary(name, bytes, "Мой дневник"))) {
        setNotice(`PDF готов: записей ${count}, страниц ${pages}.`);
      } else {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(`PDF скачан: записей ${count}, страниц ${pages}.`);
      }
    } catch (err: any) {
      if (err instanceof TooManyPagesError) setNotice("Слишком много страниц для одного PDF. Выбери период покороче или сохрани дневник в EPUB.");
      else if (err?.name !== "AbortError") setNotice("Не удалось собрать PDF. Попробуй период покороче.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function exportEpub() {
    if (epubBusy) return;
    setEpubBusy(true);
    try {
      const { bytes, count } = await buildDiaryEpub(includePrivate);
      const name = `дневник-${new Date().toISOString().slice(0, 10)}.epub`;
      if (isNative() && (await nativeShareBinary(name, bytes, "Мой дневник"))) {
        setNotice(`Книга готова: записей ${count}.`);
      } else {
        const blob = new Blob([bytes as BlobPart], { type: "application/epub+zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(`Книга скачана: записей ${count}.`);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setNotice("Не удалось собрать книгу. Попробуй ещё раз.");
    } finally {
      setEpubBusy(false);
    }
  }
  function changeEvening(next: EveningSettings) {
    setEvening(next);
    writeEvening(next);
    void syncNativeReminders();
  }
  useEffect(() => {
    if (isNative()) void nativeNotificationState().then((st) => setNotifState(st === "prompt" ? "default" : st));
  }, []);

  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<Record<string, number> | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Account>("/account")
      .then((a) => setTimezone(a.timezone))
      .catch(() => {
        /* поле останется пустым: можно ввести вручную или нажать «Определить» */
      });
  }, []);

  function detectTimezone() {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* не поддерживается: оставляем как есть */
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
      setNotice(err instanceof ApiError ? err.message : "Не удалось сохранить часовой пояс");
    } finally {
      setSaving(false);
    }
  }

  function saveKeys() {
    const clean: LocalSettings = {};
    for (const f of KEY_FIELDS) (clean as Record<string, string>)[f.key] = String(keys[f.key] ?? "").trim();
    writeSettings(clean);
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2500);
  }

  function renderKeyField(f: (typeof KEY_FIELDS)[number]) {
    return (
      <div key={f.key}>
        <label className="small text" htmlFor={f.key}>
          {f.label}
        </label>
        <input
          id={f.key}
          type="password"
          autoComplete="off"
          value={keys[f.key] ?? ""}
          onChange={(e) => setKeys({ ...keys, [f.key]: e.target.value })}
        />
        <p className="small">
          {f.hint}{" "}
          {f.link && (
            <a
              href={f.link}
              onClick={(e) => {
                e.preventDefault();
                openExternalLink(f.link!);
              }}
            >
              Получить ключ
            </a>
          )}
        </p>
      </div>
    );
  }

  async function askNotifications() {
    if (isNative()) {
      const st = await nativeAskNotifications();
      setNotifState(st === "prompt" ? "default" : st);
      return;
    }
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifState(result);
  }

  // Файл со всеми данными: сначала собираем, потом скачиваем или отправляем через «Поделиться»
  // (там можно выбрать Google Диск и сохранить копию в облаке).
  async function buildExport(): Promise<Uint8Array> {
    const res = await localRequest("GET", "/account/export");
    if (res.status >= 400) throw new Error("Не удалось собрать данные");
    const bytes = res.body as unknown as Uint8Array;
    if (!backupPassword) return bytes;
    if (!globalThis.crypto?.subtle) throw new Error("Шифрование доступно только при открытии приложения по защищённому адресу (https).");
    return new TextEncoder().encode(await encryptBackup(new TextDecoder().decode(bytes), backupPassword));
  }

  async function exportData() {
    setExporting(true);
    try {
      downloadBytes(await buildExport(), `мои-данные-${new Date().toISOString().slice(0, 10)}.json`);
      markBackupDone();
    } catch {
      setNotice("Не удалось скачать данные. Попробуй ещё раз.");
    } finally {
      setExporting(false);
    }
  }

  async function shareData() {
    setExporting(true);
    try {
      const bytes = await buildExport();
      if (isNative()) {
        if (await nativeShareText(`мои-данные-${new Date().toISOString().slice(0, 10)}.json`, new TextDecoder().decode(bytes))) {
          markBackupDone();
          return;
        }
      }
      const file = new File([bytes as BlobPart], `мои-данные-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "Копия данных Навигатора Жизни" });
        markBackupDone();
      } else {
        downloadBytes(bytes, file.name);
        setNotice("На этом устройстве нет меню «Поделиться», файл скачан. Загрузи его на Google Диск вручную.");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setNotice("Не удалось отправить копию. Попробуй скачать файл.");
    } finally {
      setExporting(false);
    }
  }

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
    alreadyPresent: "Уже были в приложении, пропущены",
    aiInsights: "Выводы ИИ",
    aiAlerts: "Оповещения ИИ",
  };

  // Восстановление ДОБАВЛЯЕТ данные поверх текущих, но записи за уже занятые даты (вес, вечерние вопросы,
  // отчёты) обновятся значениями из файла, поэтому перед запуском нужно подтверждение.
  async function handleRestoreFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !confirm(
        "Восстановить данные из этого файла? Существующие цели, задачи и т.д. не удалятся, а то, что уже есть, второй раз не добавится. " +
          "Записи за те же даты (вес, вечерние вопросы, отчёты) будут обновлены значениями из файла."
      )
    ) {
      return;
    }
    setRestoring(true);
    setRestoreSummary(null);
    setRestoreError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("Это не похоже на корректный файл с данными");
      }
      if (isEncryptedBackup(parsed)) {
        if (!backupPassword) throw new Error("Файл зашифрован. Введи пароль копии в поле выше и выбери файл ещё раз");
        parsed = JSON.parse(await decryptBackup(parsed, backupPassword));
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
      await wipeAll();
      // Вместе с данными уходит и корзина, иначе «удалить всё» оставило бы записи в ней.
      await api.delete("/trash").catch(() => {});
      await clearSnapshots(); // точки восстановления тоже содержат все данные
      clearErrors();
      writeBudget({});
      void syncNativeReminders(); // напоминания об удалённых данных больше не должны приходить
      window.location.reload();
    } catch {
      setNotice("Не удалось удалить данные. Попробуй ещё раз.");
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

      {notice && (
        <div className="card notice" role="status">
          <p>{notice}</p>
          <button className="small-btn" onClick={() => setNotice(null)}>
            Понятно
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-title">Помощник ИИ</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Чтобы приложение разбирало записи и давало подсказки, нужен хотя бы один ключ. Он хранится только на этом телефоне.
          Без ключей всё остальное (записи, задачи, цели, учёт) работает.
        </p>
        <div className="stack">
          {KEY_FIELDS.filter((f) => !PAID_KEYS.includes(f.key)).map((f) => renderKeyField(f))}
          <details open={PAID_KEYS.some((k) => String(keys[k] ?? "").trim() !== "")}>
            <summary>Платные сервисы (не нужны)</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              {KEY_FIELDS.filter((f) => PAID_KEYS.includes(f.key)).map((f) => renderKeyField(f))}
            </div>
          </details>
        </div>
        <button className="primary mt" onClick={saveKeys}>
          Сохранить ключи
        </button>
        {keysSaved && (
          <p className="mt ok" role="status">
            Сохранено
          </p>
        )}
      </div>

      <AiRouterCard />

      <UpdateCard />

      <RestorePointsCard />

      <div className="card">
        <div className="card-title">Копия данных</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Все записи лежат только на телефоне. Если телефон потеряется или сломается, без копии они пропадут. Сохрани копию на Google Диск:
          нажми кнопку и выбери Диск в меню. Без пароля личные записи в файле лежат открытым текстом, храни его бережно.
        </p>
        <label className="small" htmlFor="backup-password" style={{ display: "block", marginBottom: 6 }}>
          Пароль копии (необязательно)
        </label>
        <input
          id="backup-password"
          type="password"
          autoComplete="off"
          value={backupPassword}
          onChange={(e) => setBackupPassword(e.target.value)}
          placeholder="Оставь пустым, чтобы не шифровать"
          style={{ marginBottom: 6 }}
        />
        <p className="small" style={{ marginBottom: 10 }}>
          С паролем файл нельзя прочитать без него, но забытый пароль восстановить невозможно. Тот же пароль нужен при восстановлении.
        </p>
        <button className="primary" onClick={shareData} disabled={exporting}>
          {exporting ? "Готовлю файл..." : "Сохранить копию в облако"}
        </button>
        {!isNative() && (
          <button className="secondary mt" style={{ width: "100%" }} onClick={exportData} disabled={exporting}>
            Скачать файл на телефон
          </button>
        )}

        <p className="small mt" style={{ marginBottom: 10 }}>
          Чтобы вернуть данные (например, на новом телефоне), выбери файл копии. Данные добавятся к тем, что уже есть.
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
            {Object.values(restoreSummary).every((count) => count === 0) && <p className="small">В файле не нашлось данных для восстановления.</p>}
            {Object.entries(restoreSummary).filter(([k, c]) => k !== "alreadyPresent" && c > 0).length === 0 && (restoreSummary.alreadyPresent ?? 0) > 0 && (
              <p className="small">Все записи из файла уже есть в приложении, ничего не добавлено.</p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Дневник как книга</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Все записи одним файлом EPUB, по главам-месяцам. Откроется в любой читалке и годится для печати или архива.
        </p>
        <label className="check-row">
          <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} />
          <span>Включить личные записи</span>
        </label>
        <button className="secondary mt" style={{ width: "100%" }} onClick={exportEpub} disabled={epubBusy}>
          {epubBusy ? "Собираю книгу..." : "Сохранить дневник в EPUB"}
        </button>
        <label className="small" htmlFor="pdf-period" style={{ display: "block", marginTop: 14 }}>PDF для печати: за какой период</label>
        <select id="pdf-period" value={pdfPeriod} onChange={(e) => setPdfPeriod(e.target.value as PdfPeriod)}>
          <option value="90">Последние 3 месяца</option>
          <option value="365">Последний год</option>
          <option value="all">Весь дневник</option>
        </select>
        <button className="secondary mt" style={{ width: "100%" }} onClick={exportPdf} disabled={!!pdfBusy}>
          {pdfBusy ?? "Сохранить дневник в PDF"}
        </button>
        <p className="small">В PDF страницы собраны как картинки: он хорош для печати, но текст в нём нельзя выделить. Для чтения и поиска лучше EPUB.</p>
      </div>

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

      <QuickNoteCard />

      <AutoBackupCard />

      <div className="card">
        <div className="card-title">Внешний вид</div>
        <label className="small" htmlFor="theme-mode" style={{ display: "block", marginBottom: 6 }}>Тема</label>
        <select id="theme-mode" value={appearance.theme} onChange={(e) => writeAppearance({ ...appearance, theme: e.target.value as ThemeMode })}>
          <option value="auto">Как в телефоне</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
          <option value="schedule">Тёмная по расписанию</option>
        </select>
        {appearance.theme === "schedule" && (
          <div className="actions" style={{ marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="small" htmlFor="dark-from">Тёмная с</label>
              <input id="dark-from" type="time" value={appearance.darkFrom} onChange={(e) => e.target.value && writeAppearance({ ...appearance, darkFrom: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="small" htmlFor="dark-to">до</label>
              <input id="dark-to" type="time" value={appearance.darkTo} onChange={(e) => e.target.value && writeAppearance({ ...appearance, darkTo: e.target.value })} />
            </div>
          </div>
        )}
        <label className="check-row" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={appearance.lite} onChange={(e) => writeAppearance({ ...appearance, lite: e.target.checked })} />
          <span>Облегчённый режим</span>
        </label>
        <p className="small">Меньше кнопок и карточек: на главном остаются запись, задачи и «Раньше». Всё остальное доступно через «Я».</p>
      </div>

      <DailyCard />

      <div className="card">
        <div className="card-title">Вечерний вопрос</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Раз в день в выбранное время приходит напоминание записать пару строк в дневник. Дневник держится на привычке, а ей нужен повод.
        </p>
        <label className="check-row">
          <input type="checkbox" checked={evening.enabled} onChange={(e) => changeEvening({ ...evening, enabled: e.target.checked })} />
          <span>Напоминать каждый вечер</span>
        </label>
        {evening.enabled && (
          <>
            <label className="small" htmlFor="evening-time" style={{ display: "block", margin: "10px 0 6px" }}>
              Время
            </label>
            <input
              id="evening-time"
              type="time"
              value={evening.time}
              onChange={(e) => e.target.value && changeEvening({ ...evening, time: e.target.value })}
            />
            <button className="secondary mt" style={{ width: "100%" }} onClick={pickEveningTime}>
              Подобрать время по моим записям
            </button>
            {eveningHint && <p className="small mt" role="status">{eveningHint}</p>}
            <p className="small mt">
              {isNative()
                ? "Уведомление приходит каждый день в это время. Если к этому часу запись за день уже есть, сегодняшнее пропускается."
                : "Показывается, когда приложение открыто и время уже наступило. Если запись за день уже есть, напоминания не будет."}
            </p>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Уведомления</div>
        {notifState === "unsupported" && <p className="small">Этот браузер не умеет показывать уведомления. Напоминания будут появляться плашкой в приложении.</p>}
        {notifState === "granted" && <p className="ok">Включены</p>}
        {notifState === "denied" && (
          <p className="small">Запрещены. Разреши уведомления для приложения в настройках телефона, иначе напоминания будут только плашкой внутри приложения.</p>
        )}
        {notifState === "default" && (
          <>
            <p className="small" style={{ marginBottom: 10 }}>
              Чтобы напоминания приходили уведомлением, разреши их.
            </p>
            <button className="primary" onClick={askNotifications}>
              Разрешить уведомления
            </button>
          </>
        )}
        <p className="small mt">
          {isNative()
            ? "Уведомления планируются заранее и приходят, даже когда приложение закрыто. Если телефон экономит заряд, разреши приложению работать без ограничений."
            : "Напоминания срабатывают, пока приложение открыто или лежит в фоне. Телефон может выгрузить его из памяти, и тогда напоминание придёт при следующем открытии."}
        </p>
      </div>

      <AppLockCard />
      <PrivacyCard />


      <div className="card">
        <div className="card-title">Если что-то не работает</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Приложение запоминает последние сбои. Отчёт не содержит твоих записей: только версию, систему и тексты ошибок. Ты увидишь его целиком до отправки.
        </p>
        {!reportText && (
          <button className="secondary" style={{ width: "100%" }} onClick={showReport}>
            Показать отчёт о проблеме
          </button>
        )}
        {reportText && (
          <>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, maxHeight: 240, overflow: "auto", background: "var(--surface-2, rgba(127,127,127,.12))", padding: 10, borderRadius: 10 }}>
              {reportText}
            </pre>
            <button className="primary mt" onClick={sendReport}>
              Отправить отчёт
            </button>
            <button
              className="secondary mt"
              style={{ width: "100%" }}
              onClick={() => {
                clearErrors();
                setReportText(null);
              }}
            >
              Очистить журнал
            </button>
          </>
        )}
      </div>

      <div className="card danger-zone">
        <div className="card-title">Удаление всех данных</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Безвозвратно удалит с этого телефона цели, задачи, историю веса и питания, финансы, память и дневник, а также точки восстановления. Копия на Диске останется, если ты её делал. Отменить это нельзя.
        </p>

        {deleteStep === "idle" && (
          <button className="danger-outline" onClick={() => setDeleteStep("confirming")}>
            Удалить все данные
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
