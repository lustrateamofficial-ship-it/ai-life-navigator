import Anthropic from "@anthropic-ai/sdk";
import { env, isAiConfigured } from "../../../config/env.js";

// Провайдер-агностичный слой (раздел 4 и 36 ТЗ):
// бизнес-логика не завязана напрямую на Anthropic — она вызывает функции
// generateText/generateJson ниже, а провайдер можно заменить, реализовав
// тот же интерфейс для другого SDK.

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!isAiConfigured()) {
      throw new Error("AI provider not configured: missing ANTHROPIC_API_KEY");
    }
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export type AiModelTier = "cheap" | "strong";

function modelFor(tier: AiModelTier): string {
  return tier === "cheap" ? env.aiModelCheap : env.aiModelStrong;
}

// Раздел 38 (AI Cost Control): простой запрос -> дешёвая модель, сложный анализ -> мощная.
export async function generateText(params: {
  system: string;
  prompt: string;
  tier?: AiModelTier;
  maxTokens?: number;
}): Promise<string> {
  const res = await getClient().messages.create({
    model: modelFor(params.tier ?? "cheap"),
    max_tokens: params.maxTokens ?? 1024,
    system: params.system,
    messages: [{ role: "user", content: params.prompt }],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

// Структурированный вывод в JSON (для распознавания еды, задач и т.д.)
export async function generateJson<T>(params: {
  system: string;
  prompt: string;
  tier?: AiModelTier;
}): Promise<T> {
  const text = await generateText({
    system: `${params.system}\n\nОтвечай ТОЛЬКО валидным JSON, без markdown-обрамления, без пояснений.`,
    prompt: params.prompt,
    tier: params.tier,
  });

  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as T;
}
