import { env, isEmbeddingsConfigured } from "../../../config/env.js";

// Anthropic не предоставляет собственный embeddings API — для Semantic Memory
// (раздел 37 ТЗ) используем Voyage AI, которую сама Anthropic рекомендует
// как партнёра для embeddings: https://docs.claude.com/en/docs/build-with-claude/embeddings
//
// Провайдер-агностично: если завтра появится другой embeddings-провайдер,
// меняется только этот файл, вызывающий код не трогаем.

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

export async function embed(text: string): Promise<number[] | null> {
  if (!isEmbeddingsConfigured()) return null;

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [text],
      model: env.embeddingModel,
    }),
  });

  if (!res.ok) {
    console.error("[embeddings] Voyage API error:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0]?.embedding ?? null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
