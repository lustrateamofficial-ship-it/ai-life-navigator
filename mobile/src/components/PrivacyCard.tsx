import { readSettings } from "../../shim/env";

// Честный список: куда уходят данные. Строится из того, что подключено, поэтому отключённые
// сервисы не упоминаются так, будто они работают.
export function PrivacyCard() {
  const s = readSettings();
  const providers = [s.anthropicApiKey && "Claude (Anthropic)", s.openaiApiKey && "ChatGPT (OpenAI)", s.geminiApiKey && "Gemini", s.deepseekApiKey && "DeepSeek", s.groqApiKey && "Groq", ...(s.services ?? []).filter((x) => x.enabled && x.key).map((x) => x.name)].filter(Boolean);

  const rows: Array<{ title: string; text: string }> = [
    {
      title: "Где хранятся записи",
      text: "Только на этом телефоне, в памяти самого приложения. Своего сервера у приложения нет, поэтому никто, кроме тебя, их не видит.",
    },
    {
      title: "Обычные записи дневника",
      text:
        providers.length > 0
          ? `Для разбора на задачи, принципов, наблюдений, итогов недели и подсказок целей уходят в ИИ-сервисы: ${providers.join(", ")}.`
          : "ИИ не подключён: записи никуда не отправляются, а разбор и подсказки не работают.",
    },
    {
      title: "Личные записи и записи о тяжёлом состоянии",
      text: "Не отправляются ни в один ИИ-сервис: ни для разбора, ни для портрета, ни для наблюдений.",
    },
  ];
  if (s.voyageApiKey) {
    rows.push({ title: "Память", text: "Принципы и факты из памяти (не личные записи) уходят в Voyage ИИ для поиска по смыслу." });
  }
  if (s.weatherApiKey) {
    rows.push({ title: "Погода", text: "Название твоего города отправляется в OpenWeatherMap." });
  }
  rows.push({
    title: "Ключи доступа к ИИ",
    text: "Лежат на этом телефоне и отправляются только самому ИИ-сервису. Не вставляй чужие ключи и не делись ключами с другими людьми.",
  });
  rows.push({
    title: "Резервная копия и выгрузка",
    text: "Содержат все записи, включая личные, открытым текстом, если не задан пароль копии. Храни файл бережно.",
  });

  return (
    <div className="card">
      <div className="card-title">Кто что видит</div>
      {rows.map((r) => (
        <div key={r.title} style={{ marginBottom: 12 }}>
          <p style={{ color: "var(--text)", fontWeight: 600 }}>{r.title}</p>
          <p>{r.text}</p>
        </div>
      ))}
    </div>
  );
}
