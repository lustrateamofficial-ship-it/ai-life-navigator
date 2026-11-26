import { useState } from "react";
import { AiRouterCard } from "../../components/AiRouterCard";
import { FreeServiceKeys, readFreeKeys, saveFreeKeys, type FreeKeys } from "../../components/FreeServiceKeys";
import { readSettings, writeSettings, type LocalSettings } from "../../../shim/env";
import { openExternalLink } from "../../platform/sdk";

const KEY_FIELDS: Array<{ key: keyof LocalSettings; label: string; hint: string; link?: string }> = [
  {
    key: "geminiApiKey",
    label: "Ключ Gemini (бесплатный)",
    hint: "Рекомендую начать с него: бесплатный, без карты, хватает на обычный дневник.",
    link: "https://aistudio.google.com/apikey",
  },
  {
    key: "groqApiKey",
    label: "Ключ Groq (бесплатный)",
    hint: "Бесплатный, очень быстрый. Подхватит запросы, если у Gemini закончился лимит.",
    link: "https://console.groq.com/keys",
  },
  {
    key: "anthropicApiKey",
    label: "Ключ Claude (платный, по желанию)",
    hint: "Не нужен. Если добавишь, он будет в самом конце очереди (подписка Claude не подходит, нужен ключ API со счётом).",
    link: "https://console.anthropic.com/settings/keys",
  },
  {
    key: "openaiApiKey",
    label: "Ключ ChatGPT (платный, по желанию)",
    hint: "Не нужен. Если добавишь, будет в конце очереди.",
    link: "https://platform.openai.com/api-keys",
  },
  {
    key: "deepseekApiKey",
    label: "Ключ DeepSeek (платный, по желанию)",
    hint: "Не нужен. Дешёвый платный сервис, серверы в Китае.",
    link: "https://platform.deepseek.com/api_keys",
  },
];

const PAID_KEYS: Array<keyof LocalSettings> = ["anthropicApiKey", "openaiApiKey", "deepseekApiKey"];

// Ключи ИИ и очередь сервисов.
export function AiSection() {
  const [keys, setKeys] = useState<LocalSettings>(readSettings());
  const [keysSaved, setKeysSaved] = useState(false);
  const [freeKeys, setFreeKeys] = useState<FreeKeys>(readFreeKeys());
  const [keysError, setKeysError] = useState("");
  // При входе: блок раскрыт, если ключей ещё нет, и свёрнут, если они уже введены. Дальше решает только нажатие.
  const [aiOpen, setAiOpen] = useState<boolean>(() => {
    const k = readSettings();
    const n = KEY_FIELDS.filter((f) => String(k[f.key] ?? "").trim() !== "").length + Object.values(readFreeKeys()).filter((v) => v.key.trim() !== "").length;
    return n === 0;
  });
  function saveKeys() {
    const clean: LocalSettings = {};
    for (const f of KEY_FIELDS) (clean as Record<string, string>)[f.key] = String(keys[f.key] ?? "").trim();
    const bad = saveFreeKeys(freeKeys);
    if (bad) {
      setKeysError(bad);
      return;
    }
    setKeysError("");
    writeSettings(clean);
    window.dispatchEvent(new Event("navigator:ai-services"));
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2500);
  }

  function renderKeyField(f: (typeof KEY_FIELDS)[number]) {
    return (
      <div key={f.key}>
        <label className="small text" htmlFor={f.key}>
          {f.label}
        </label>
        <input
          id={f.key}
          type="password"
          autoComplete="off"
          value={keys[f.key] ?? ""}
          onChange={(e) => setKeys({ ...keys, [f.key]: e.target.value })}
        />
        <p className="small">
          {f.hint}{" "}
          {f.link && (
            <a
              href={f.link}
              onClick={(e) => {
                e.preventDefault();
                openExternalLink(f.link!);
              }}
            >
              Получить ключ
            </a>
          )}
        </p>
      </div>
    );
  }
  const keyCount =
    KEY_FIELDS.filter((f) => String(keys[f.key] ?? "").trim() !== "").length + Object.values(freeKeys).filter((v) => v.key.trim() !== "").length;

  return (
    <>
      <details
        className="card fold"
        open={aiOpen}
        onToggle={(e) => setAiOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          Помощник ИИ
          <span className="fold-meta">{keyCount > 0 ? `ключей: ${keyCount}` : "нет ключей"}</span>
        </summary>
        <p className="small" style={{ margin: "10px 0" }}>
          Чтобы приложение разбирало записи и давало подсказки, нужен хотя бы один ключ. Он хранится только на этом телефоне.
          Без ключей всё остальное (записи, задачи, цели, учёт) работает.
        </p>
        <div className="stack">
          {KEY_FIELDS.filter((f) => !PAID_KEYS.includes(f.key)).map((f) => renderKeyField(f))}
          <FreeServiceKeys value={freeKeys} onChange={setFreeKeys} />
          <details open={PAID_KEYS.some((k) => String(keys[k] ?? "").trim() !== "")}>
            <summary>Платные сервисы (не нужны)</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              {KEY_FIELDS.filter((f) => PAID_KEYS.includes(f.key)).map((f) => renderKeyField(f))}
            </div>
          </details>
        </div>
        <button className="primary mt" onClick={saveKeys}>
          Сохранить ключи
        </button>
        {keysError && <p className="mt" role="alert">{keysError}</p>}
        {keysSaved && (
          <p className="mt ok" role="status">
            Сохранено
          </p>
        )}
        <AiRouterCard nested />
      </details>
    </>
  );
}
