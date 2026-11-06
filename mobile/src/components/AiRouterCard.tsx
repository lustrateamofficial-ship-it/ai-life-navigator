import { useState } from "react";
import { PRESETS, moveProvider, providerInfo, resetPauses, services, testProvider } from "../../shim/aiRouter";
import { readSettings, writeSettings, type AiService } from "../../shim/env";
import { openExternalLink } from "../platform/sdk";

const DOT: Record<string, string> = { ok: "#1f9d55", paused: "#d97706", idle: "#8a94a3" };

// Очередь ИИ: порядок, состояние каждого сервиса, проверка и добавление новых.
export function AiRouterCard() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);
  const [busy, setBusy] = useState<string>("");
  const [result, setResult] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [form, setForm] = useState({ key: "", model: "", baseUrl: "", name: "", account: "" });
  const [err, setErr] = useState("");

  const list = providerInfo();
  const own = services();
  const preset = PRESETS.find((x) => x.id === presetId)!;
  void tick;

  async function check(id: string) {
    setBusy(id);
    const r = await testProvider(id);
    setResult((x) => ({ ...x, [id]: r.ok ? `работает (${(r.ms / 1000).toFixed(1)} с)` : `не вышло: ${r.text}` }));
    setBusy("");
    refresh();
  }

  function addService() {
    const isCustom = preset.id === "custom";
    let baseUrl = (isCustom ? form.baseUrl : preset.baseUrl).trim();
    if (preset.needsAccount) {
      const acc = form.account.trim();
      if (!/^[0-9a-f]{32}$/i.test(acc)) return setErr("Account ID — 32 символа из букв a–f и цифр, он есть в панели Cloudflare.");
      baseUrl = baseUrl.replace("{ACCOUNT_ID}", acc);
    }
    const model = (form.model || preset.model).trim();
    const key = form.key.trim();
    const name = (isCustom ? form.name.trim() : preset.name) || "Свой сервис";
    if (!key) return setErr("Вставь ключ.");
    if (!/^https:\/\//.test(baseUrl)) return setErr("Адрес должен начинаться с https://");
    if (!model) return setErr("Укажи название модели.");
    const item: AiService = { id: `svc:${Date.now().toString(36)}`, name, baseUrl, model, key, enabled: true, paid: !preset.free };
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
    <div className="card">
      <div className="card-title">Очередь ИИ</div>
      <p className="small" style={{ marginBottom: 10 }}>
        Запрос идёт первому сервису в списке. Если он не ответил или кончился лимит, берётся следующий, а сбойный отдыхает несколько минут.
        Подключи столько сервисов, сколько хочешь: чем больше бесплатных, тем реже приложение останется без ИИ. Платные (если добавишь) по умолчанию идут в конце.
      </p>
      {list.length === 0 && <p className="small">Пока нет ни одного сервиса. Добавь ключ выше или подключи сервис ниже.</p>}
      <div className="stack">
        {list.map((p, i) => (
          <div key={p.id} style={{ borderTop: i ? "1px solid var(--border, #e5e7eb)" : "none", paddingTop: i ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: DOT[p.state], flex: "none" }} />
              <b style={{ flex: 1 }}>{i + 1}. {p.name}</b>
              <button type="button" className="secondary" aria-label={`Поднять ${p.name} выше`} disabled={i === 0} onClick={() => { moveProvider(p.id, -1); refresh(); }} style={{ minWidth: 44 }}>↑</button>
              <button type="button" className="secondary" aria-label={`Опустить ${p.name} ниже`} disabled={i === list.length - 1} onClick={() => { moveProvider(p.id, 1); refresh(); }} style={{ minWidth: 44 }}>↓</button>
            </div>
            <p className="small" style={{ margin: "4px 0" }}>{result[p.id] ?? p.note}</p>
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
          Подключить ещё сервис
        </button>
      ) : (
        <div className="stack mt">
          <label className="small text" htmlFor="svc-preset">Сервис</label>
          <select id="svc-preset" value={presetId} onChange={(e) => { setPresetId(e.target.value); setForm({ ...form, model: "" }); setErr(""); }}>
            {[...PRESETS].sort((a, b) => Number(b.free) - Number(a.free)).map((x) => (
              <option key={x.id} value={x.id}>{x.name}{x.free ? " · бесплатно" : " · платный"}</option>
            ))}
          </select>
          <p className="small">
            {preset.note}{" "}
            {preset.link && (
              <a href={preset.link} onClick={(e) => { e.preventDefault(); openExternalLink(preset.link); }}>Получить ключ</a>
            )}
          </p>
          {preset.needsAccount && (
            <>
              <label className="small text" htmlFor="svc-account">Account ID</label>
              <input id="svc-account" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            </>
          )}
          {preset.id === "custom" && (
            <>
              <label className="small text" htmlFor="svc-name">Название</label>
              <input id="svc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label className="small text" htmlFor="svc-url">Адрес (до /chat/completions)</label>
              <input id="svc-url" placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} autoCapitalize="off" />
            </>
          )}
          <label className="small text" htmlFor="svc-model">Модель</label>
          <input id="svc-model" placeholder={preset.model} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
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
