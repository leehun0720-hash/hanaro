/** 내레이션 음성 목록 — 클라이언트·서버 공용 (서버 전용 openai-tts.ts와 분리) */
export const TTS_VOICES = {
  nova: "여성 · 밝고 또렷 (기본)",
  shimmer: "여성 · 차분",
  alloy: "중성 · 안내 방송",
  onyx: "남성 · 낮고 신뢰감",
  echo: "남성 · 활기",
} as const;
export type TtsVoice = keyof typeof TTS_VOICES;
export const DEFAULT_TTS_VOICE: TtsVoice = "nova";
export const isTtsVoice = (v: unknown): v is TtsVoice => typeof v === "string" && v in TTS_VOICES;
