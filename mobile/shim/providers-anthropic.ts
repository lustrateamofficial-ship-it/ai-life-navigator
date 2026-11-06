// Вместо библиотеки Anthropic: запросы идут через маршрутизатор ИИ (aiRouter.ts),
// который по очереди пробует подключённые сервисы.
import { generateText as routed, type AiModelTier } from "./aiRouter";

export type { AiModelTier };

export function generateText(params: { system: string; prompt: string; tier?: AiModelTier; maxTokens?: number }): Promise<string> {
  return routed(params);
}

export async function generateJson<T>(params: { system: string; prompt: string; tier?: AiModelTier }): Promise<T> {
  const text = await generateText({
    system: `${params.system}\n\nОтвечай ТОЛЬКО валидным JSON, без markdown-обрамления, без пояснений.`,
    prompt: params.prompt,
    tier: params.tier,
  });
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as T;
}
