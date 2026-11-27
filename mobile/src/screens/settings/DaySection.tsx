import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { deviceTimezone, setTimezoneManual } from "../../../shim/server";
import { DailyCard } from "../../components/DailyCard";
import { readEvening, writeEvening, suggestEveningTime, type EveningSettings } from "../../../phone/evening";
import { syncNativeReminders, isNative, nativeAskNotifications, nativeNotificationState } from "../../../phone/native";

interface Account {
  timezone: string;
}

// Утро и вечер, уведомления и часовой пояс.
export function DaySection({ notify }: { notify: (text: string) => void }) {
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifState, setNotifState] = useState<string>(
    isNative() ? "default" : typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [eveningHint, setEveningHint] = useState("");
  const [evening, setEvening] = useState<EveningSettings>(readEvening());

  useEffect(() => {
    if (isNative()) void nativeNotificationState().then((st) => setNotifState(st === "prompt" ? "default" : st));
  }, []);

  useEffect(() => {
    api
      .get<Account>("/account")
      .then((a) => setTimezone(a.timezone))
      .catch(() => {
        /* поле останется пустым: можно ввести вручную или нажать «Определить» */
      });
  }, []);

  async function pickEveningTime() {
    try {
      const r = await api.get<{ entries: Array<{ createdAt: string }> }>("/journal?limit=60");
      const t = suggestEveningTime(r.entries.map((e) => e.createdAt));
      if (!t) return setEveningHint("Пока мало записей, чтобы подобрать время. Нужно хотя бы пять.");
      changeEvening({ ...evening, time: t });
      setEveningHint(`Поставил ${t}: примерно в это время ты обычно пишешь.`);
    } catch {
      setEveningHint("Не получилось подобрать время. Выбери его вручную.");
    }
  }

  function changeEvening(next: EveningSettings) {
    setEvening(next);
    writeEvening(next);
    void syncNativeReminders();
  }

  function detectTimezone() {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setTimezoneManual(false);
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
      setTimezoneManual(timezone.trim() !== deviceTimezone());
      setSaved(true);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Не удалось сохранить часовой пояс");
    } finally {
      setSaving(false);
    }
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

  return (
    <>
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

      <div className="card">
        <div className="card-title">Часовой пояс</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Определяется по телефону сам, в том числе после поездки. От него зависит, что считается «сегодня» для веса, задач, серии и итогов. Если впишешь свой пояс, автоопределение отключится, пока не нажмёшь «Определить».
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
    </>
  );
}
