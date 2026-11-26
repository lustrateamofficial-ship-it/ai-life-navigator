import { useState } from "react";
import { api } from "../../api/client";
import { AppLockCard } from "../../components/AppLockCard";
import { PrivacyCard } from "../../components/PrivacyCard";
import { wipeAll } from "../../../shim/prisma";
import { clearSnapshots } from "../../../phone/safety";
import { writeBudget } from "../../../phone/phoneExtras";
import { clearErrors } from "../../../phone/errorLog";
import { syncNativeReminders } from "../../../phone/native";

// Пароль, приватность и стирание данных.
export function SafetySection({ notify }: { notify: (text: string) => void }) {
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming">("idle");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    if (deleteConfirmText !== "УДАЛИТЬ") return;
    setDeleting(true);
    try {
      await wipeAll();
      // Вместе с данными уходит и корзина, иначе «удалить всё» оставило бы записи в ней.
      await api.delete("/trash").catch(() => {});
      await clearSnapshots(); // точки восстановления тоже содержат все данные
      clearErrors();
      writeBudget({});
      void syncNativeReminders(); // напоминания об удалённых данных больше не должны приходить
      window.location.reload();
    } catch {
      notify("Не удалось удалить данные. Попробуй ещё раз.");
      setDeleting(false);
    }
  }

  return (
    <>
      <AppLockCard />

      <PrivacyCard />

      <div className="card danger-zone">
        <div className="card-title">Удаление всех данных</div>
        <p className="small" style={{ marginBottom: 10 }}>
          Безвозвратно удалит с этого телефона цели, задачи, историю веса, финансы, память и дневник, а также точки восстановления. Копия на Диске останется, если ты её делал. Отменить это нельзя.
        </p>

        {deleteStep === "idle" && (
          <button className="danger-outline" onClick={() => setDeleteStep("confirming")}>
            Удалить все данные
          </button>
        )}

        {deleteStep === "confirming" && (
          <div>
            <p className="text" style={{ marginBottom: 8 }}>
              Чтобы подтвердить, напиши слово <b>УДАЛИТЬ</b>.
            </p>
            <input aria-label="Подтверждение удаления" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
            <div className="actions">
              <button
                className="secondary"
                onClick={() => {
                  setDeleteStep("idle");
                  setDeleteConfirmText("");
                }}
              >
                Отмена
              </button>
              <button className="danger-fill" onClick={deleteAccount} disabled={deleteConfirmText !== "УДАЛИТЬ" || deleting}>
                {deleting ? "Удаляю..." : "Удалить навсегда"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
