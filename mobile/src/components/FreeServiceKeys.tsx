import { PRESETS, services } from "../../phone/aiRouter";
import { writeSettings, readSettings, type AiService } from "../../shim/env";
import { openExternalLink } from "../platform/sdk";

// Постоянные поля для пяти бесплатных сервисов (Gemini и Groq вводятся отдельно выше). Каждый хранится как обычный
// сервис очереди ИИ под своим номером «svc:preset-…», поэтому проверка, порядок и паузы работают так же, как у остальных.
export const FREE_PRESET_IDS = ["openrouter", "mistral", "nvidia", "cloudflare", "cohere"] as const;
const PREFIX = "svc:preset-";

export type FreeKeys = Record<string, { key: string; account: string }>;

const ACCOUNT_RE = /([0-9a-f]{32})/i;

export function readFreeKeys(): FreeKeys {
  const out: FreeKeys = {};
  for (const id of FREE_PRESET_IDS) out[id] = { key: "", account: "" };
  for (const s of services()) {
    if (!s.id.startsWith(PREFIX)) continue;
    const id = s.id.slice(PREFIX.length);
    if (!out[id]) continue;
    out[id] = { key: s.key, account: ACCOUNT_RE.exec(s.baseUrl)?.[1] ?? "" };
  }
  return out;
}

// Сохраняет заполненные ключи как сервисы, пустые убирает. Возвращает текст ошибки или null.
export function saveFreeKeys(v: FreeKeys): string | null {
  const next: AiService[] = [];
  for (const id of FREE_PRESET_IDS) {
    const preset = PRESETS.find((p) => p.id === id)!;
    const key = (v[id]?.key ?? "").trim();
    if (!key) continue;
    let baseUrl = preset.baseUrl;
    if (preset.needsAccount) {
      const acc = (v[id]?.account ?? "").trim();
      if (!/^[0-9a-f]{32}$/i.test(acc)) return `${preset.name}: Account ID состоит из 32 букв a–f и цифр, он есть в панели Cloudflare.`;
      baseUrl = baseUrl.replace("{ACCOUNT_ID}", acc);
    }
    const old = services().find((s) => s.id === PREFIX + id);
    next.push({ id: PREFIX + id, name: preset.name, baseUrl, model: old?.model || preset.model, key, enabled: true, paid: false });
  }
  const others = services().filter((s) => !s.id.startsWith(PREFIX));
  const removed = FREE_PRESET_IDS.map((id) => PREFIX + id).filter((id) => !next.some((n) => n.id === id));
  writeSettings({ services: [...others, ...next], aiOrder: (readSettings().aiOrder ?? []).filter((x) => !removed.includes(x)) });
  return null;
}

export function FreeServiceKeys({ value, onChange }: { value: FreeKeys; onChange: (v: FreeKeys) => void }) {
  return (
    <>
      {FREE_PRESET_IDS.map((id) => {
        const p = PRESETS.find((x) => x.id === id)!;
        return (
          <div key={id}>
            <label className="small text" htmlFor={`free-${id}`}>
              Ключ {p.name} (бесплатный)
            </label>
            <input
              id={`free-${id}`}
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              value={value[id]?.key ?? ""}
              onChange={(e) => onChange({ ...value, [id]: { ...value[id], key: e.target.value } })}
            />
            {p.needsAccount && (
              <>
                <label className="small text" htmlFor={`free-${id}-acc`} style={{ display: "block", marginTop: 6 }}>
                  Account ID (Cloudflare)
                </label>
                <input
                  id={`free-${id}-acc`}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={value[id]?.account ?? ""}
                  onChange={(e) => onChange({ ...value, [id]: { ...value[id], account: e.target.value } })}
                />
              </>
            )}
            <p className="small">
              {p.note}{" "}
              <a
                href={p.link}
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink(p.link);
                }}
              >
                Получить ключ
              </a>
            </p>
          </div>
        );
      })}
    </>
  );
}
