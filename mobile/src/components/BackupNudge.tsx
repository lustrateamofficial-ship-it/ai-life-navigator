import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { readAutoBackup } from "../../phone/autoBackup";

const KEY = "navigator:last-backup";
const DAY = 86_400_000;

// Отмечаем, что копия сделана: вызывается из настроек после успешной отправки или скачивания.
export function markBackupDone() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* хранилище недоступно: напоминание просто покажется снова */
  }
}

// Данные лежат только на телефоне, поэтому раз в неделю мягко напоминаем про копию,
// но только если в приложении уже есть записи.
export function BackupNudge() {
  const [show, setShow] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {
      /* считаем, что копий не было */
    }
    const auto = readAutoBackup();
    if (auto.enabled) {
      // Автокопия включена: напоминаем, только если она давно не удавалась.
      const lastAuto = auto.lastAt ? Date.parse(auto.lastAt) : 0;
      if (auto.lastError || Date.now() - lastAuto > 10 * DAY) {
        void api
          .get<{ entries: unknown[] }>("/journal")
          .then((r) => r.entries.length >= 3 && (setBroken(auto.lastError ?? "копия давно не делалась"), setShow(true)))
          .catch(() => {});
      }
      return;
    }
    if (Date.now() - last < 7 * DAY) return;
    void api
      .get<{ entries: unknown[] }>("/journal")
      .then((r) => setShow(r.entries.length >= 3))
      .catch(() => {});
  }, []);

  if (!show) return null;
  return (
    <div className="card">
      <div className="card-title">{broken ? "Автокопия не сработала" : "Сохрани копию записей"}</div>
      <p className="small" style={{ marginBottom: 10 }}>
        {broken
          ? `Записи лежат только на этом телефоне, а последняя автокопия не удалась: ${broken}. Открой настройки и проверь папку.`
          : "Записи лежат только на этом телефоне. Включи автокопию в настройках: раз в неделю копия сама ляжет в выбранную папку (можно на Google Диск). Или сохрани копию вручную, это минута."}
      </p>
      <button type="button" className="secondary" style={{ width: "100%" }} onClick={() => navigate("/settings")}>
        {broken ? "Проверить автокопию" : "Сохранить копию"}
      </button>
    </div>
  );
}
