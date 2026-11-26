import { useState, type ChangeEvent } from "react";
import { api } from "../../api/client";
import { localRequest } from "../../../shim/server";
import { localDayKey } from "../../utils/format";
import { AutoBackupCard } from "../../components/QuickAndBackupCards";
import { RestorePointsCard } from "../../components/RestorePointsCard";
import { markBackupDone } from "../../components/BackupNudge";
import { buildDiaryEpub } from "../../../phone/epub";
import { buildDiaryPdf, TooManyPagesError, type PdfPeriod } from "../../../phone/pdf";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "../../../phone/backupCrypto";
import { isNative, nativeShareText, nativeShareBinary } from "../../../phone/native";

function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

// Копии, восстановление и дневник-книга.
export function DataSection({ notify }: { notify: (text: string) => void }) {
  const [exporting, setExporting] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [includePrivate, setIncludePrivate] = useState(false);
  const [epubBusy, setEpubBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfPeriod, setPdfPeriod] = useState<PdfPeriod>("365");
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<Record<string, number> | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function exportPdf() {
    if (pdfBusy) return;
    setPdfBusy("Рисую страницы...");
    try {
      const { bytes, count, pages } = await buildDiaryPdf(includePrivate, pdfPeriod, (n) => setPdfBusy(`Готово страниц: ${n}`));
      const name = `дневник-${localDayKey()}.pdf`;
      if (isNative() && (await nativeShareBinary(name, bytes, "Мой дневник"))) {
        notify(`PDF готов: записей ${count}, страниц ${pages}.`);
      } else {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify(`PDF скачан: записей ${count}, страниц ${pages}.`);
      }
    } catch (err: any) {
      if (err instanceof TooManyPagesError) notify("Слишком много страниц для одного PDF. Выбери период покороче или сохрани дневник в EPUB.");
      else if (err?.name !== "AbortError") notify("Не удалось собрать PDF. Попробуй период покороче.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function exportEpub() {
    if (epubBusy) return;
    setEpubBusy(true);
    try {
      const { bytes, count } = await buildDiaryEpub(includePrivate);
      const name = `дневник-${localDayKey()}.epub`;
      if (isNative() && (await nativeShareBinary(name, bytes, "Мой дневник"))) {
        notify(`Книга готова: записей ${count}.`);
      } else {
        const blob = new Blob([bytes as BlobPart], { type: "application/epub+zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify(`Книга скачана: записей ${count}.`);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") notify("Не удалось собрать книгу. Попробуй ещё раз.");
    } finally {
      setEpubBusy(false);
    }
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
      downloadBytes(await buildExport(), `мои-данные-${localDayKey()}.json`);
      markBackupDone();
    } catch {
      notify("Не удалось скачать данные. Попробуй ещё раз.");
    } finally {
      setExporting(false);
    }
  }

  async function shareData() {
    setExporting(true);
    try {
      const bytes = await buildExport();
      if (isNative()) {
        if (await nativeShareText(`мои-данные-${localDayKey()}.json`, new TextDecoder().decode(bytes))) {
          markBackupDone();
          return;
        }
      }
      const file = new File([bytes as BlobPart], `мои-данные-${localDayKey()}.json`, { type: "application/json" });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "Копия данных Навигатора Жизни" });
        markBackupDone();
      } else {
        downloadBytes(bytes, file.name);
        notify("На этом устройстве нет меню «Поделиться», файл скачан. Загрузи его на Google Диск вручную.");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") notify("Не удалось отправить копию. Попробуй скачать файл.");
    } finally {
      setExporting(false);
    }
  }

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

  return (
    <>
      <details className="card fold">
        <summary>Копии и восстановление</summary>
        <div className="fold-body">
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

      <AutoBackupCard />

      <RestorePointsCard />
        </div>
      </details>

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
    </>
  );
}
