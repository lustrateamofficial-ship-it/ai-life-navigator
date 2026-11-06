import { useEffect, useState } from "react";
import { isNative, nativeAskNotifications, nativeNotificationState } from "../../shim/native";
import { nativeFolderInfo, nativeForgetFolder, nativePickFolder, nativeQuickNotificationState, nativeSetQuickNotification, type FolderInfo } from "../../shim/nativeExtras";
import { readAutoBackup, runAutoBackup, writeAutoBackup, type AutoBackupState } from "../../shim/autoBackup";

// Быстрая запись без открытия приложения: плашка в шторке и виджет. Работает без интернета.
export function QuickNoteCard() {
  const native = isNative();
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (native) void nativeQuickNotificationState().then(setOn);
  }, [native]);

  async function toggle(next: boolean) {
    setMsg("");
    if (next && (await nativeNotificationState()) !== "granted") {
      if ((await nativeAskNotifications()) !== "granted") {
        setMsg("Нужно разрешение на уведомления. Включи его в настройках телефона и попробуй ещё раз.");
        return;
      }
    }
    setOn(await nativeSetQuickNotification(next));
  }

  return (
    <div className="card">
      <div className="card-title">Быстрая запись</div>
      {!native ? (
        <p className="small">Плашка в шторке и виджет работают в приложении на Android. В браузере запись делается на главном экране.</p>
      ) : (
        <>
          <label className="check-row">
            <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} />
            <span>Поле записи в шторке уведомлений</span>
          </label>
          <p className="small">Потяни шторку вниз, нажми «Записать», набери строку. Запись попадёт в дневник при следующем открытии приложения. Интернет не нужен.</p>
          <p className="small">Виджет: нажми на пустое место главного экрана и подержи, выбери «Виджеты», найди «Навигатор» и перетащи на экран.</p>
          {msg && <p className="small" role="status">{msg}</p>}
        </>
      )}
    </div>
  );
}

// Автокопия в папку (можно на Google Диске): раз в сутки при открытии приложения.
export function AutoBackupCard() {
  const native = isNative();
  const [s, setS] = useState<AutoBackupState>(readAutoBackup());
  const [folder, setFolder] = useState<FolderInfo>({ configured: false, ok: false, name: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (native) void nativeFolderInfo().then(setFolder);
    const on = () => setS(readAutoBackup());
    window.addEventListener("navigator:autobackup", on);
    return () => window.removeEventListener("navigator:autobackup", on);
  }, [native]);

  function save(next: AutoBackupState) {
    setS(next);
    writeAutoBackup(next);
  }

  async function pick() {
    setMsg("");
    const f = await nativePickFolder();
    if (f) setFolder(f);
    else setMsg("Папка не выбрана.");
  }

  async function now() {
    setBusy(true);
    setMsg("");
    const ok = await runAutoBackup(true);
    setS(readAutoBackup());
    setMsg(ok ? "Копия записана в папку." : "Не получилось, причина написана ниже.");
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-title">Автокопия в папку</div>
      {!native ? (
        <p className="small">Автокопия работает в приложении на Android. В браузере используй кнопки копии ниже.</p>
      ) : (
        <>
          <p className="small" style={{ marginBottom: 10 }}>
            Раз в сутки при открытии приложения копия данных пишется в выбранную папку. Если выбрать папку на Google Диске, копия окажется в облаке. Хранятся последние 7.
          </p>
          <button className="secondary" style={{ width: "100%" }} onClick={pick}>
            {folder.configured ? `Папка: ${folder.name || "выбрана"}. Выбрать другую` : "Выбрать папку"}
          </button>
          {folder.configured && !folder.ok && <p className="small mt" role="alert">Доступ к папке потерян, выбери её заново.</p>}
          <label className="check-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={s.enabled} disabled={!folder.configured || !folder.ok} onChange={(e) => save({ ...s, enabled: e.target.checked })} />
            <span>Копировать автоматически</span>
          </label>
          <label className="small" htmlFor="auto-pass" style={{ display: "block", marginTop: 10 }}>Пароль для копий (необязательно)</label>
          <input id="auto-pass" type="password" autoComplete="off" value={s.password} onChange={(e) => save({ ...s, password: e.target.value })} />
          <p className="small">Без пароля копия в папке лежит открытым текстом. С паролем она зашифрована, но сам пароль хранится на этом телефоне, чтобы копии шли сами. Забытый пароль восстановить нельзя.</p>
          <button className="secondary mt" style={{ width: "100%" }} onClick={now} disabled={busy || !folder.configured || !folder.ok}>
            {busy ? "Копирую..." : "Скопировать сейчас"}
          </button>
          {s.lastAt && <p className="small mt">Последняя копия: {new Date(s.lastAt).toLocaleString("ru-RU")}</p>}
          {s.lastError && <p className="small mt" role="alert">Ошибка: {s.lastError}</p>}
          {msg && <p className="small" role="status">{msg}</p>}
          {folder.configured && (
            <button className="small-btn" style={{ marginTop: 8 }} onClick={async () => { await nativeForgetFolder(); setFolder({ configured: false, ok: false, name: "" }); save({ ...s, enabled: false }); }}>
              Забыть папку
            </button>
          )}
        </>
      )}
    </div>
  );
}
