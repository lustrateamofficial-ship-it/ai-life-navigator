import { env, isGroqConfigured } from "../../../config/env.js";

// Фолбэк для слоя "роутер/специалист", если Gemini недоступен (лимит/сбой/не настроен).
// Groq тоже бесплатен на базовом тарифе и даёт OpenAI-совместимый REST API —
// это самый простой протокол для ручного вызова без SDK.

export { isGroqConfigured };

export async function generateGroqText(params: { system: string; prompt: string; maxTokens?: number }): Promise<string> {
  if (!isGroqConfigured()) {
    throw Object.assign(new Error("Groq not configured"), { code: "GROQ_NOT_CONFIGURED" });
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.groqModel,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      max_tokens: params.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned no text");
  return text;
}
