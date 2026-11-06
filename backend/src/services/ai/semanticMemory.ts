import { prisma } from "../../db/prisma.js";
import { embed, cosineSimilarity } from "./providers/embeddings.js";
import { isEmbeddingsConfigured } from "../../config/env.js";
import { env } from "../../config/env.js";

// Раздел 37: Semantic Memory (vector embeddings) поверх Structured Memory (SQL).
// "При вопросе AI сначала ищет релевантный контекст" — вот эта функция и есть тот поиск.

export async function embedMemoryItem(memoryItemId: string, content: string) {
  if (!isEmbeddingsConfigured()) return; // без ключа Semantic Memory просто не активна

  // БАГ (найден при аудите): раньше сетевая ошибка к Voyage API (таймаут, обрыв связи)
  // вылетала необработанной прямо из этой функции. Вызывающий код (POST /memory,
  // POST /journal) не оборачивал вызов в try/catch — в итоге сама запись УЖЕ успешно
  // сохранялась в БД, но запрос всё равно падал с 500. Пользователь видел ошибку и мог
  // нажать "Сохранить" повторно, создав дубликат, хотя первая запись была цела.
  // embedding — это best-effort индексация для поиска, а не критичная часть сохранения,
  // поэтому её сбой никогда не должен ронять основной запрос.
  try {
    const vector = await embed(content);
    if (!vector) return;

    await prisma.memoryEmbedding.upsert({
      where: { memoryItemId },
      update: { vector, model: env.embeddingModel },
      create: { memoryItemId, vector, model: env.embeddingModel },
    });
  } catch (err) {
    console.error("[semanticMemory] embedding failed, continuing without it:", err);
  }
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  type: string;
  score: number;
}

// Раздел 37/38: не грузим ВСЮ историю в промпт — берём top-K релевантных фактов.
export async function semanticSearchMemory(
  userId: string,
  query: string,
  topK = 5
): Promise<SemanticSearchResult[]> {
  if (!isEmbeddingsConfigured()) {
    // Fallback без embeddings-ключа: простой поиск по вхождению слов —
    // хуже семантического поиска, но не оставляет функцию полностью нерабочей.
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const items = await prisma.memoryItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return items
      .map((item) => {
        const contentLower = item.content.toLowerCase();
        const score = words.filter((w) => contentLower.includes(w)).length / Math.max(words.length, 1);
        return { id: item.id, content: item.content, type: item.type, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // БАГ (найден при аудите): та же проблема, что в embedMemoryItem — но здесь цена выше.
  // Эта функция вызывается из contextBuilder.buildDailyContext при КАЖДОМ сообщении в
  // AI-чат и при каждом "Что делать сейчас?". Необработанная сетевая ошибка к Voyage API
  // здесь роняла бы весь AI-ответ целиком — хотя речь всего лишь об одном из источников
  // контекста. Деградация в пустой список (а значит, в контексте просто не будет
  // top-K релевантных фактов) гораздо лучше полного отказа AI-функции.
  let queryVector: number[] | null;
  try {
    queryVector = await embed(query);
  } catch (err) {
    console.error("[semanticMemory] search embedding failed, degrading to no results:", err);
    return [];
  }
  if (!queryVector) return [];

  const embeddings = await prisma.memoryEmbedding.findMany({
    where: { memoryItem: { userId } },
    include: { memoryItem: true },
  });

  return embeddings
    .map((e) => ({
      id: e.memoryItem.id,
      content: e.memoryItem.content,
      type: e.memoryItem.type,
      score: cosineSimilarity(queryVector, e.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
