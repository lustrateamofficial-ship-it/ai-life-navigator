import { generateText as anthropicText, generateJson as anthropicJson } from "./providers/anthropic.js";
import { generateGeminiText, isGeminiConfigured } from "./providers/gemini.js";
import { generateGroqText, isGroqConfigured } from "./providers/groq.js";
import { isAiConfigured } from "../../config/env.js";

// Трёхслойная AI-система:
//
//   [1] РОУТЕР    — классификация сообщения (это вес? еда? задача? просто разговор?)
//   [2] СПЕЦИАЛИСТ — обработка внутри своего сектора (еда, финансы, цели, коучинг)
//   [3] ПРОВЕРЯЮЩИЙ — сверяет готовый ответ с реальными посчитанными данными
//                      ПЕРЕД тем, как показать его пользователю
//
// Слои [1] и [2] — частые, дешёвые вызовы. Разносятся по бесплатным тарифам
// Gemini (основной) и Groq (фолбэк, если Gemini недоступен/лимит/сбой) — так
// складываются ДВЕ разные бесплатные квоты вместо того, чтобы упираться в одну.
// Если ни один не настроен — по-прежнему работает через Anthropic, как раньше
// (ничего не ломается без новых ключей, просто нет экономии).
//
// Слой [3] — редкие вызовы с высокой ценой ошибки (отчёты, "почему я остановился",
// прогнозы, портрет по дневнику). Всегда через Anthropic — тот же ключ, что и так
// обязателен для всего приложения, так что для verifier-слоя не нужно ничего
// дополнительно настраивать.

async function generateLayeredText(system: string, prompt: string, maxTokens?: number): Promise<string> {
  if (isGeminiConfigured()) {
    try {
      return await generateGeminiText({ system, prompt, maxTokens });
    } catch (err) {
      console.error("[ai] Gemini failed, falling back to Groq:", err);
    }
  }
  if (isGroqConfigured()) {
    try {
      return await generateGroqText({ system, prompt, maxTokens });
    } catch (err) {
      console.error("[ai] Groq failed, falling back to Anthropic:", err);
    }
  }
  if (isAiConfigured()) {
    return anthropicText({ system, prompt, tier: "cheap", maxTokens });
  }
  throw Object.assign(new Error("Ни один AI-провайдер не настроен"), { code: "AI_NOT_CONFIGURED" });
}

// [1]/[2] — роутер и специалисты секторов.
export async function generateRouterOrSpecialistText(params: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  return generateLayeredText(params.system, params.prompt, params.maxTokens);
}

export async function generateRouterOrSpecialistJson<T>(params: { system: string; prompt: string }): Promise<T> {
  const text = await generateLayeredText(
    `${params.system}\n\nОтвечай ТОЛЬКО валидным JSON, без markdown-обрамления, без пояснений.`,
    params.prompt
  );
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

// [3] — верхний, доверенный слой. Используется и для сложного синтеза (где нужна
// модель посильнее), и для собственно шага проверки.
export async function generateVerifierText(system: string, prompt: string): Promise<string> {
  return anthropicText({ system, prompt, tier: "strong" });
}

export async function generateVerifierJson<T>(params: { system: string; prompt: string }): Promise<T> {
  return anthropicJson<T>({ ...params, tier: "strong" });
}

// Сам шаг проверки: берёт черновой ответ специалиста и реальные посчитанные кодом
// факты, сверяет одно с другим. Используется там, где AI формулирует вывод о данных
// пользователя (а не просто классифицирует сообщение или предлагает вариант) —
// отчёты, "почему я остановился", прогнозы, портрет по дневнику.
export async function verifyAgainstData(draftAnswer: string, groundTruthFacts: unknown): Promise<string> {
  const prompt = `Черновой ответ AI-модуля:\n"""\n${draftAnswer}\n"""\n\nРеальные данные, посчитанные кодом (а не AI), с которыми черновик должен совпадать:\n${JSON.stringify(
    groundTruthFacts,
    null,
    2
  )}\n\nПроверь черновик на расхождения с этими данными — неверные числа, выдуманные факты, выводы, которые реальные данные не подтверждают. Если всё совпадает — верни черновик БЕЗ ИЗМЕНЕНИЙ. Если есть расхождение — исправь только его, сохранив тон и структуру остального текста. Ответь только финальным текстом, без пояснений о том, что именно поменялось.`;

  return generateVerifierText(
    "Ты — проверяющий модуль. Твоя единственная задача — не пропустить к пользователю AI-ответ, который противоречит реальным данным.",
    prompt
  );
}
