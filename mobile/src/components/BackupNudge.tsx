import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

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
  const navigate = useNavigate();

  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {
      /* считаем, что копий не было */
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
      <div className="card-title">Сохрани копию записей</div>
      <p className="small" style={{ marginBottom: 10 }}>
        Записи лежат только на этом телефоне. Копия на Google Диске за минуту защитит их, если телефон потеряется или сломается.
      </p>
      <button type="button" className="secondary" style={{ width: "100%" }} onClick={() => navigate("/settings")}>
        Сохранить копию
      </button>
    </div>
  );
}
