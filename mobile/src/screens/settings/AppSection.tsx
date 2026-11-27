import { useState } from "react";
import { api } from "../../api/client";
import { clearErrors, buildReport, readErrors } from "../../../phone/errorLog";
import { hapticsOn, setHaptics } from "../../../phone/feedback";
import { writeAppearance, type HeaderStyle, type ThemeMode } from "../../../phone/appearance";
import { useAppearance } from "../../useAppearance";
import { QuickNoteCard } from "../../components/QuickAndBackupCards";
import { UpdateCard } from "../../components/UpdateCard";
import { isNative, nativeShareText } from "../../../phone/native";
import { readCelebrate, writeCelebrate, showCelebration } from "../../../phone/celebrate";

// Вид, отклик, быстрая запись, обновления и отчёт о проблеме.
export function AppSection({ notify }: { notify: (text: string) => void }) {
  const [cel, setCel] = useState(readCelebrate);
  const writeAndGet = (s: ReturnType<typeof readCelebrate>) => (writeCelebrate(s), s);
  const [reportText, setReportText] = useState<string | null>(null);
  const appearance = useAppearance();
  const [haptics, setHapticsState] = useState(hapticsOn());

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
        notify("Отчёт скопирован. Вставь его в сообщение.");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") notify("Не удалось отправить отчёт. Выдели текст и скопируй вручную.");
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Отклик на действия</div>
        <div className="block-row" style={{ borderBottom: 0, padding: 0 }}>
          <div className="block-text">
            <b>Вибрация</b>
            <small>Короткий отклик, когда записал вес, отметил задачу или сохранил запись</small>
          </div>
          <button role="switch" aria-checked={haptics} aria-label="Вибрация при действиях" className={haptics ? "switch on" : "switch"} onClick={() => { setHaptics(!haptics); setHapticsState(!haptics); }} />
        </div>
      </div>

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
        <div className="small" style={{ margin: "14px 0 6px" }}>Шапка экранов</div>
        <div className="header-picks" role="radiogroup" aria-label="Шапка экранов">
          {([
            ["center", "По центру", "Крупный заголовок по центру"],
            ["plate", "Плашка", "Заголовок на цветной плашке"],
            ["bar", "Строка", "Тонкая строка сверху"],
          ] as Array<[HeaderStyle, string, string]>).map(([id, name, hint]) => (
            <button key={id} role="radio" aria-checked={appearance.header === id} className={`header-pick ${appearance.header === id ? "on" : ""}`} onClick={() => writeAppearance({ ...appearance, header: id })}>
              <span className={`hp-demo hp-${id}`} aria-hidden="true">
                <i />
                <i />
              </span>
              <b>{name}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        <label className="check-row" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={appearance.lite} onChange={(e) => writeAppearance({ ...appearance, lite: e.target.checked })} />
          <span>Облегчённый режим</span>
        </label>
        <p className="small">Меньше кнопок и карточек: на главном остаются запись, задачи и «Раньше». Всё остальное доступно через «Я».</p>
      </div>

      <div className="card">
        <div className="card-title">Праздник за все задачи</div>
        <label className="check-row">
          <input type="checkbox" checked={cel.on} onChange={(e) => setCel(writeAndGet({ ...cel, on: e.target.checked }))} />
          <span>Праздновать, когда выполнены все задачи на сегодня</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={cel.sound} disabled={!cel.on} onChange={(e) => setCel(writeAndGet({ ...cel, sound: e.target.checked }))} />
          <span>С музыкой</span>
        </label>
        <p className="small">Картинка, музыка и каскад карт, как при победе в косынке. Один раз в день.</p>
        <button className="secondary" style={{ width: "100%", marginTop: 8 }} onClick={showCelebration}>
          Посмотреть
        </button>
      </div>

      <QuickNoteCard />

      <UpdateCard />

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
    </>
  );
}
