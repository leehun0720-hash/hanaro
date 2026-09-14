import { openaiClient } from "./openai-image";
import { withRetry } from "./retry";

/**
 * OpenAI 음성 합성 — 한국어 내레이션(자막·대사 읽어주기).
 * Kling 네이티브 음성은 중국어·영어만 지원하므로 한국어 음성은 여기서 만든다.
 * 모델은 환경변수로 교체 가능 (기본 gpt-4o-mini-tts, 분당 약 $0.015).
 */
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

export { TTS_VOICES, DEFAULT_TTS_VOICE, isTtsVoice, type TtsVoice } from "@/lib/tts-voices";
import { DEFAULT_TTS_VOICE, type TtsVoice } from "@/lib/tts-voices";

/** 문장 하나 → mp3 */
export async function synthesizeSpeech(opts: { text: string; voice?: TtsVoice; speed?: number; instructions?: string }): Promise<Buffer> {
  const text = opts.text.trim().slice(0, 1000);
  if (!text) throw new Error("읽을 문장이 없어요.");
  return withRetry(
    async () => {
      const c = await openaiClient();
      const r = await c.audio.speech.create({
        model: TTS_MODEL,
        voice: opts.voice ?? DEFAULT_TTS_VOICE,
        input: text,
        response_format: "mp3",
        speed: Math.max(0.5, Math.min(2, opts.speed ?? 1)),
        instructions: opts.instructions ?? "한국어 홍보 내레이션. 따뜻하고 또렷하게, 너무 빠르지 않게 읽는다. 문장 부호는 읽지 않는다.",
      });
      return Buffer.from(await r.arrayBuffer());
    },
    { tries: 3, label: "openai-tts" },
  );
}

/** 대략적 원가 (관리자 비용 표시용) — 글자 수 기준 */
export function ttsCostUsd(chars: number): number {
  return Math.round((chars / 1_000_000) * 12 * 10000) / 10000; // 입력 100만 자당 약 $12
}
