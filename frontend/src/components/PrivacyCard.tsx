import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Privacy {
  ai: { gemini: boolean; groq: boolean; anthropic: boolean };
  embeddings: boolean;
  transcription: boolean;
  weather: boolean;
  googleDriveBackup: boolean;
  monitoring: boolean;
}

// Честный список: куда уходят данные на ЭТОМ сервере. Строится из того, что реально подключено,
// а не из общего текста, поэтому отключённые сервисы здесь не упоминаются как будто они работают.
export function PrivacyCard() {
  const [p, setP] = useState<Privacy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get<Privacy>("/account/privacy").then(setP).catch(() => setFailed(true));
  }, []);

  const providers = p ? [p.ai.gemini && "Gemini", p.ai.groq && "Groq", p.ai.anthropic && "Anthropic"].filter(Boolean) : [];

  const rows: Array<{ title: string; text: string }> = [];
  if (p) {
    rows.push({
      title: "Обычные записи дневника",
      text:
        providers.length > 0
          ? `Для разбора на задачи, принципов, наблюдений, итогов недели и подсказок целей уходят в AI-сервисы: ${providers.join(", ")} (порядок: Gemini, затем Groq, затем Anthropic).`
          : "AI не подключён на сервере: записи никуда не отправляются, а разбор и подсказки не работают.",
    });
    if (p.ai.anthropic) {
      rows.push({ title: "Портрет по дневнику", text: "Собирается только через Anthropic, по не личным записям." });
    }
    rows.push({
      title: "Личные записи и записи о тяжёлом состоянии",
      text: "Не отправляются ни в один AI-сервис: ни для разбора, ни для портрета, ни для наблюдений.",
    });
    if (p.transcription) {
      rows.push({
        title: "Голосовые сообщения боту",
        text: "Аудио целиком уходит в OpenAI на распознавание речи, даже если потом пометить запись личной. Если это важно, пиши текстом.",
      });
    }
    if (p.embeddings) {
      rows.push({ title: "Память", text: "Принципы и факты из памяти (не личные записи) уходят в Voyage AI для поиска по смыслу." });
    }
    if (p.weather) {
      rows.push({ title: "Погода", text: "Название твоего города отправляется в OpenWeatherMap." });
    }
    rows.push({
      title: "Резервная копия и экспорт",
      text: `Содержат все записи, включая личные, в обычном (не зашифрованном) виде.${
        p.googleDriveBackup ? " Копия лежит в твоём Google Диске." : ""
      }`,
    });
    rows.push({ title: "Сообщения боту", text: "Проходят через Telegram, как любые сообщения бота." });
    if (p.monitoring) {
      rows.push({ title: "Отчёты об ошибках", text: "Уходят в Sentry без текста запросов, заголовков и записей." });
    }
  }

  return (
    <div className="card">
      <div className="card-title">Кто что видит</div>
      {!p && !failed && <p>Загрузка...</p>}
      {failed && <p>Не удалось загрузить. Попробуй позже.</p>}
      {rows.map((r) => (
        <div key={r.title} style={{ marginBottom: 12 }}>
          <p style={{ color: "var(--text)", fontWeight: 600 }}>{r.title}</p>
          <p>{r.text}</p>
        </div>
      ))}
    </div>
  );
}
