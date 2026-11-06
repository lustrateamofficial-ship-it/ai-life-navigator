import { useState } from "react";
import { dumpAll } from "../../shim/prisma";
import { getFrozenInfo } from "../../shim/safety";
import { isNative, nativeShareText } from "../../shim/native";

// Показывается, когда данные нельзя трогать: они новее приложения или обновление данных не удалось.
export function Frozen() {
  const info = getFrozenInfo();
  const [msg, setMsg] = useState("");

  async function save() {
    const name = `данные-как-есть-${new Date().toISOString().slice(0, 10)}.json`;
    const text = JSON.stringify(dumpAll());
    if (isNative() && (await nativeShareText(name, text))) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Файл скачан.");
  }

  return (
    <div className="screen">
      <h2>{info?.kind === "newer" ? "Нужна свежая версия приложения" : "Данные не тронуты"}</h2>
      <p>{info?.message}</p>
      <button type="button" className="secondary mt" onClick={save}>Сохранить данные в файл</button>
      <button type="button" className="primary mt" onClick={() => window.location.reload()}>Открыть заново</button>
      {msg && <p className="small mt">{msg}</p>}
    </div>
  );
}
