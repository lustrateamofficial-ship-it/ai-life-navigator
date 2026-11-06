import { env, isTranscriptionConfigured } from "../../../config/env.js";

// Anthropic не предоставляет audio-транскрипцию — для голосового ввода (раздел 44,
// Версия 2: "голосовой ввод") используем OpenAI Whisper API. Отдельный опциональный
// ключ, вся остальная логика приложения от него не зависит.

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string | null> {
  if (!isTranscriptionConfigured()) return null;

  const form = new FormData();
  form.append("file", new Blob([audioBuffer]), filename);
  form.append("model", "whisper-1");
  form.append("language", "ru");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiApiKey}` },
    body: form,
  });

  if (!res.ok) {
    console.error("[transcription] Whisper API error:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = (await res.json()) as { text: string };
  return data.text ?? null;
}
