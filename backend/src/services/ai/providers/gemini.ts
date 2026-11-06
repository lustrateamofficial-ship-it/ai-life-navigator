import { env, isGeminiConfigured } from "../../../config/env.js";

// Слой "роутер/специалист" (частые дешёвые вызовы) — Google Gemini, щедрый бесплатный
// тариф на Flash-моделях. Сырые REST-вызовы, без @google/generative-ai SDK — тот же
// принцип минимальных зависимостей, что и у остальных провайдеров в проекте.

export { isGeminiConfigured };

export async function generateGeminiText(params: { system: string; prompt: string; maxTokens?: number }): Promise<string> {
  if (!isGeminiConfigured()) {
    throw Object.assign(new Error("Gemini not configured"), { code: "GEMINI_NOT_CONFIGURED" });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      generationConfig: { maxOutputTokens: params.maxTokens ?? 1024 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text (возможно, сработал content filter)");
  return text;
}
