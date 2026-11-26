import { useEffect, useState } from "react";
import { moveProvider, providerInfo, resetPauses, services, testProvider } from "../../phone/aiRouter";
import { readSettings, writeSettings, type AiService } from "../../shim/env";

const DOT: Record<string, string> = { ok: "#1f9d55", paused: "#d97706", idle: "#8a94a3" };

// Очередь ИИ: порядок, состояние каждого сервиса, проверка и добавление новых.
export function AiRouterCard({ nested = false }: { nested?: boolean }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);
  useEffect(() => {
    // после «Сохранить ключи» выше список сервисов должен обновиться сразу
    window.addEventListener("navigator:ai-services", refresh);
    return () => window.removeEventListener("navigator:ai-services", refresh);
  }, []);
  const [busy, setBusy] = useState<string>("");
  const [result, setResult] = useState<Record<string, { ok: boolean; why: string }>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ key: "", model: "", baseUrl: "", name: "", account: "" });
  const [err, setErr] = useState("");

  const list = providerInfo();
  const own = services();
  void tick;

  async function check(id: string) {
    setBusy(id);
    const r = await testProvider(id);
    setResult((x) => ({ ...x, [id]: { ok: r.ok, why: r.ok ? "" : r.text } }));
    setBusy("");
    refresh();
  }

  // Готовые сервисы (Gemini, Groq, OpenRouter и другие) вводятся ключами выше. Здесь только свой адрес.
  function addService() {
    const baseUrl = form.baseUrl.trim();
    const model = form.model.trim();
    const key = form.key.trim();
    const name = form.name.trim() || "Свой сервис";
    if (!key) return setErr("Вставь ключ.");
    if (!/^https:\/\//.test(baseUrl)) return setErr("Адрес должен начинаться с https://");
    const item: AiService = { id: `svc:${Date.now().toString(36)}`, name, baseUrl, model, key, enabled: true, paid: true };
    writeSettings({ services: [...own, item] });
    setForm({ key: "", model: "", baseUrl: "", name: "", account: "" });
    setAdding(false);
    setErr("");
    refresh();
  }

  function removeService(id: string) {
    if (!window.confirm("Убрать этот сервис из очереди?")) return;
    writeSettings({ services: own.filter((x) => x.id !== id), aiOrder: (readSettings().aiOrder ?? []).filter((x) => x !== id) });
    refresh();
  }

  function changeModel(id: string) {
    const cur = own.find((x) => x.id === id);
    const next = window.prompt("Название модели", cur?.model ?? "");
    if (next && next.trim()) {
      writeSettings({ services: own.map((x) => (x.id === id ? { ...x, model: next.trim() } : x)) });
      refresh();
    }
  }

  return (
    <div className={nested ? "ai-queue" : "card"}>
      <div className="card-title">Очередь ИИ</div>
      <p className="small" style={{ marginBottom: 10 }}>
        Запрос идёт первому сервису в списке. Если он не ответил или кончился лимит, берётся следующий, а сбойный отдыхает несколько минут.
        Чем больше ключей добавлено выше, тем реже приложение останется без ИИ. Платные по умолчанию идут в конце.
      </p>
      {list.length === 0 && <p className="small">Пока нет ни одного сервиса. Добавь ключ выше.</p>}
      <div className="stack">
        {list.map((p, i) => (
          <div key={p.id} style={{ borderTop: i ? "1px solid var(--border, #e5e7eb)" : "none", paddingTop: i ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: DOT[p.state], flex: "none" }} />
              <b style={{ flex: 1 }}>{i + 1}. {p.name}</b>
              <button type="button" className="secondary" aria-label={`Поднять ${p.name} выше`} disabled={i === 0} onClick={() => { moveProvider(p.id, -1); refresh(); }} style={{ minWidth: 44 }}>↑</button>
              <button type="button" className="secondary" aria-label={`Опустить ${p.name} ниже`} disabled={i === list.length - 1} onClick={() => { moveProvider(p.id, 1); refresh(); }} style={{ minWidth: 44 }}>↓</button>
            </div>
            {result[p.id] ? (
              <div style={{ margin: "4px 0" }} role="status">
                <b className={result[p.id]!.ok ? "ok" : "bad"}>{result[p.id]!.ok ? "Работает" : "Не работает"}</b>
                {!result[p.id]!.ok && result[p.id]!.why && (
                  <details className="small">
                    <summary>Почему</summary>
                    {result[p.id]!.why}
                  </details>
                )}
              </div>
            ) : (
              <p className="small" style={{ margin: "4px 0" }}>{p.note}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="secondary" onClick={() => check(p.id)} disabled={busy === p.id} style={{ flex: 1 }}>
                {busy === p.id ? "Проверяю…" : "Проверить"}
              </button>
              {p.id.startsWith("svc:") && (
                <>
                  <button type="button" className="secondary" onClick={() => changeModel(p.id)} style={{ flex: 1 }}>Модель</button>
                  <button type="button" className="secondary" onClick={() => removeService(p.id)} style={{ flex: 1 }}>Убрать</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {list.some((p) => p.state === "paused") && (
        <button type="button" className="secondary mt" style={{ width: "100%" }} onClick={() => { resetPauses(); refresh(); }}>
          Снять паузы и попробовать снова
        </button>
      )}

      {!adding ? (
        <button type="button" className="primary mt" style={{ width: "100%" }} onClick={() => setAdding(true)}>
          Подключить свой сервис (свой адрес)
        </button>
      ) : (
        <div className="stack mt">
          <p className="small">Подойдёт любой сервис с адресом вида …/v1/chat/completions.</p>
          <label className="small text" htmlFor="svc-name">Название</label>
          <input id="svc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="small text" htmlFor="svc-url">Адрес (до /chat/completions)</label>
          <input id="svc-url" placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} autoCapitalize="off" />
          <label className="small text" htmlFor="svc-model">Модель (необязательно, подберётся сама)</label>
          <input id="svc-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <label className="small text" htmlFor="svc-key">Ключ</label>
          <input id="svc-key" type="password" autoComplete="off" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          {err && <p className="small" role="alert">{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary" style={{ flex: 1 }} onClick={addService}>Добавить</button>
            <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => { setAdding(false); setErr(""); }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
