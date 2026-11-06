import { useState } from "react";
import { findCity, readDaily, refreshWeather, writeDaily, type DailySettings } from "../../shim/daily";
import { syncNativeReminders } from "../../shim/native";

// Настройки утренней сводки и вечернего «плана на завтра».
export function DailyCard() {
  const [s, setS] = useState<DailySettings>(readDaily());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function change(next: DailySettings) {
    setS(next);
    writeDaily(next);
    void syncNativeReminders();
  }

  async function lookupCity() {
    setMsg("");
    if (!s.city.trim()) return setMsg("Впиши город.");
    setBusy(true);
    try {
      const c = await findCity(s.city);
      if (!c) return setMsg("Такой город не нашёлся. Попробуй написать иначе.");
      const next = { ...s, city: c.name, lat: c.lat, lon: c.lon };
      change(next);
      const ok = await refreshWeather(true);
      setMsg(ok ? `Город: ${c.name}. Прогноз загружен.` : `Город: ${c.name}. Прогноз пока не загрузился, попробую позже.`);
    } catch {
      setMsg("Не получилось найти город: нет интернета. Попробуй позже.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" id="daily-card">
      <div className="card-title">Утро и вечер</div>
      <p className="small" style={{ marginBottom: 10 }}>
        Утром: погода, вес, три задачи и расписание дня. Перед сном: погода на завтра и напоминание заполнить план. Утром всё это будет собрано из того, что ты запланировал вечером.
      </p>

      <label className="check-row">
        <input type="checkbox" checked={s.morning.enabled} onChange={(e) => change({ ...s, morning: { ...s.morning, enabled: e.target.checked } })} />
        <span>Утренняя сводка</span>
      </label>
      {s.morning.enabled && (
        <input aria-label="Время утренней сводки" id="morning-time" type="time" value={s.morning.time} onChange={(e) => e.target.value && change({ ...s, morning: { ...s.morning, time: e.target.value } })} />
      )}

      <label className="check-row" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={s.bedtime.enabled} onChange={(e) => change({ ...s, bedtime: { ...s.bedtime, enabled: e.target.checked } })} />
        <span>Напоминание перед сном</span>
      </label>
      {s.bedtime.enabled && (
        <input aria-label="Время вечернего напоминания" id="bedtime-time" type="time" value={s.bedtime.time} onChange={(e) => e.target.value && change({ ...s, bedtime: { ...s.bedtime, time: e.target.value } })} />
      )}

      <label className="small" htmlFor="daily-city" style={{ display: "block", margin: "12px 0 6px" }}>
        Город для погоды
      </label>
      <div className="field-row">
        <input id="daily-city" placeholder="Например, Казань" value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} onBlur={() => writeDaily(s)} />
        <button className="secondary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={lookupCity} disabled={busy}>
          {busy ? "..." : "Найти"}
        </button>
      </div>
      {msg && <p className="small mt" role="status">{msg}</p>}

      <label className="check-row" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={s.showLife} onChange={(e) => change({ ...s, showLife: e.target.checked })} />
        <span>Показывать «сколько ещё впереди»</span>
      </label>
      {s.showLife && (
        <>
          <label className="small" htmlFor="daily-birth" style={{ display: "block", margin: "8px 0 6px" }}>
            Дата рождения
          </label>
          <input id="daily-birth" type="date" value={s.birthDate} onChange={(e) => change({ ...s, birthDate: e.target.value })} />
          <label className="small" htmlFor="daily-life" style={{ display: "block", margin: "8px 0 6px" }}>
            Возраст, до которого рассчитываем (лет)
          </label>
          <input id="daily-life" type="number" min={30} max={120} value={s.lifeYears} onChange={(e) => change({ ...s, lifeYears: Number(e.target.value) || 80 })} />
          <p className="small mt">
            Это условный расчёт от выбранного тобой возраста, а не прогноз и не медицинская оценка. Число нужно, чтобы видеть, сколько недель есть на важное. Если оно тревожит, выключи пункт выше.
          </p>
        </>
      )}
      <p className="small mt">Погоду даёт бесплатный сервис Open-Meteo, ключ не нужен. Без интернета показывается последний загруженный прогноз.</p>
    </div>
  );
}
