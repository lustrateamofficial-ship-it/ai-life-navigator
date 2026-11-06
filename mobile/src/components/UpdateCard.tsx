import { useEffect, useState } from "react";
import { CURRENT_VERSION, autoCheck, checkForUpdate, lastCheck, updateRepo, type UpdateInfo } from "../../shim/updater";
import { isNative, nativeApkCanInstall, nativeApkDownload, nativeApkInstall, nativeApkOpenInstallSettings } from "../../shim/native";
import { createSnapshot } from "../../shim/safety";
import { writeSettings } from "../../shim/env";

type Step = "idle" | "checking" | "downloading" | "installing" | "needPermission";

const mb = (n: number) => (n / 1048576).toFixed(1).replace(".", ",") + " МБ";

// Обновление внутри приложения: проверить, скачать, установить поверх старой версии. Данные остаются на месте.
export function UpdateCard() {
  const native = isNative();
  const [step, setStep] = useState<Step>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(() => {
    const l = lastCheck();
    return l && l.ok ? l.info : null;
  });
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState(0);
  const [repo, setRepo] = useState(updateRepo());
  const [editRepo, setEditRepo] = useState(false);
  const stale = info && !info.available;

  async function check() {
    setStep("checking");
    setMsg("");
    const r = await checkForUpdate();
    setStep("idle");
    if (r.ok) {
      setInfo(r.info);
      setMsg(r.info.available ? "" : "У тебя последняя версия.");
    } else setMsg(r.error);
  }

  async function install() {
    if (!info) return;
    setMsg("");
    if (!(await nativeApkCanInstall())) {
      setStep("needPermission");
      return;
    }
    // Перед любой установкой фиксируем точку восстановления: если что-то пойдёт не так, всё можно вернуть.
    await createSnapshot("update", `Перед установкой версии ${info.version}`);
    setStep("downloading");
    setPct(0);
    try {
      const size = await nativeApkDownload(info.apkUrl, (got, total) => setPct(total > 0 ? Math.round((got / total) * 100) : 0));
      if (info.size && size && size !== info.size) throw new Error("Файл скачался не полностью. Попробуй ещё раз.");
      setStep("installing");
      await nativeApkInstall();
    } catch (e) {
      setStep("idle");
      setMsg(e instanceof Error && e.message ? e.message : "Не удалось скачать обновление. Проверь интернет и попробуй ещё раз.");
    }
  }

  function saveRepo() {
    const v = repo.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(v)) return setMsg("Нужен вид владелец/название, например ivan/navigator.");
    writeSettings({ updateRepo: v } as any);
    setEditRepo(false);
    setMsg("");
  }

  return (
    <div className="card">
      <div className="card-title">Версия и обновление</div>
      <p className="small" style={{ marginBottom: 8 }}>
        Версия {CURRENT_VERSION}. При обновлении поверх старой версии записи, настройки и ключи сохраняются. Перед установкой приложение само делает точку восстановления.
      </p>

      {!native && <p className="small">В браузере приложение обновляется само при открытии. Если появится плашка «Вышла новая версия», нажми на неё.</p>}

      {native && (
        <>
          {info?.available && step === "idle" && (
            <div style={{ marginBottom: 10 }}>
              <p><b>Доступна версия {info.version}</b>{info.size ? ` · ${mb(info.size)}` : ""}</p>
              {info.notes && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{info.notes}</p>}
              <button type="button" className="primary" style={{ width: "100%", marginTop: 8 }} onClick={install}>
                Обновить
              </button>
            </div>
          )}

          {step === "needPermission" && (
            <div style={{ marginBottom: 10 }}>
              <p className="small">Android просит один раз разрешить этому приложению устанавливать обновления. Открой настройки, включи переключатель и вернись сюда.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="primary" style={{ flex: 1 }} onClick={() => void nativeApkOpenInstallSettings()}>Открыть настройки</button>
                <button type="button" className="secondary" style={{ flex: 1 }} onClick={install}>Я разрешил</button>
              </div>
            </div>
          )}

          {step === "downloading" && (
            <div style={{ marginBottom: 10 }} role="status" aria-live="polite">
              <p>Скачиваю обновление… {pct}%</p>
              <div style={{ height: 8, borderRadius: 4, background: "var(--border, #e5e7eb)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent, #2563eb)" }} />
              </div>
            </div>
          )}

          {step === "installing" && (
            <p role="status" style={{ marginBottom: 10 }}>
              Android показал окно установки. Нажми в нём «Обновить» и дождись конца. Потом открой приложение: все записи на месте.
            </p>
          )}

          {step !== "downloading" && step !== "installing" && (
            <button type="button" className="secondary" style={{ width: "100%" }} onClick={check} disabled={step === "checking"}>
              {step === "checking" ? "Проверяю…" : stale || !info ? "Проверить обновление" : "Проверить ещё раз"}
            </button>
          )}
          {msg && <p className="small mt" role="alert">{msg}</p>}

          <p className="small mt">
            Источник обновлений: {updateRepo() || "не указан"}{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); setEditRepo((v) => !v); }}>изменить</a>
          </p>
          {editRepo && (
            <div className="stack">
              <input aria-label="Репозиторий с обновлениями" placeholder="владелец/название" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button type="button" className="secondary" onClick={saveRepo}>Сохранить</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Маленькая плашка на главном экране, когда обновление уже найдено. Проверка идёт тихо раз в сутки.
export function UpdateNotice({ onOpen }: { onOpen: () => void }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!isNative()) return;
    let alive = true;
    void autoCheck().then((i) => alive && setInfo(i)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!info) return null;
  return (
    <div className="card" role="status">
      <div className="card-title">Вышла новая версия</div>
      <p className="small" style={{ marginBottom: 8 }}>Версия {info.version}. Данные сохранятся.</p>
      <button type="button" className="primary" style={{ width: "100%" }} onClick={onOpen}>Обновить</button>
    </div>
  );
}

