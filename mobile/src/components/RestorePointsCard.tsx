import { useEffect, useState } from "react";
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot, type SnapshotInfo } from "../../shim/safety";

const KIND: Record<string, string> = {
  update: "Перед обновлением",
  migration: "Перед переводом данных",
  rollback: "Перед возвратом",
  manual: "Сделана вручную",
  daily: "Ежедневная",
};

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// Точки восстановления: копии всех данных на самом телефоне. Возврат одной кнопкой.
export function RestorePointsCard() {
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => void listSnapshots().then(setList);
  useEffect(load, []);

  async function make() {
    setBusy("make");
    const id = await createSnapshot("manual", "Сделана вручную");
    setBusy("");
    setMsg(id ? "Точка сохранена." : "Не удалось сохранить точку: возможно, не хватает места.");
    load();
  }

  async function back(s: SnapshotInfo) {
    const n = (s.counts.JournalEntry ?? 0) + (s.counts.Task ?? 0) + (s.counts.Goal ?? 0);
    if (!window.confirm(`Вернуть данные к состоянию на ${when(s.at)}? Всё, что добавлено после, исчезнет из приложения (перед этим я сохраню точку с текущим состоянием, так что возврат можно отменить). В той точке записей и задач: ${n}.`)) return;
    setBusy(s.id);
    try {
      await restoreSnapshot(s.id);
      window.location.reload();
    } catch (e) {
      setBusy("");
      setMsg(e instanceof Error ? e.message : "Не удалось вернуть данные.");
    }
  }

  async function drop(s: SnapshotInfo) {
    if (!window.confirm("Удалить эту точку восстановления?")) return;
    await deleteSnapshot(s.id);
    load();
  }

  return (
    <div className="card">
      <div className="card-title">Точки восстановления</div>
      <p className="small" style={{ marginBottom: 8 }}>
        Копии всех твоих данных хранятся на этом телефоне: перед каждым обновлением и раз в сутки. Если после обновления что-то пропало или сломалось, вернись к нужной точке.
        В точках остаются и записи, которые ты удалил уже после их создания, пока точка не устареет. Кнопка «Удалить все данные» стирает и точки. Точки не заменяют файл с копией на Google Диске: при потере телефона они пропадут вместе с ним.
      </p>
      {list === null && <p className="small">Загружаю…</p>}
      {list && list.length === 0 && <p className="small">Пока нет ни одной точки. Они появятся при следующем запуске, когда в приложении будут записи.</p>}
      <div className="stack">
        {list?.map((s, i) => (
          <div key={s.id} style={{ borderTop: i ? "1px solid var(--border, #e5e7eb)" : "none", paddingTop: i ? 10 : 0 }}>
            <p><b>{when(s.at)}</b> · {KIND[s.kind] ?? s.kind}</p>
            <p className="small">
              Записей дневника: {s.counts.JournalEntry ?? 0}, задач: {s.counts.Task ?? 0}, целей: {s.counts.Goal ?? 0}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className="secondary" style={{ flex: 1 }} disabled={!!busy} onClick={() => back(s)}>{busy === s.id ? "Возвращаю…" : "Вернуть"}</button>
              <button type="button" className="secondary" style={{ flex: 1 }} disabled={!!busy} onClick={() => drop(s)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="primary mt" style={{ width: "100%" }} disabled={!!busy} onClick={make}>
        {busy === "make" ? "Сохраняю…" : "Сделать точку сейчас"}
      </button>
      {msg && <p className="small mt" role="status">{msg}</p>}
    </div>
  );
}
