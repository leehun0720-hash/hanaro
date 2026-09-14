/**
 * 제작실에서 고르는 영상 모델. 기준 설정: 720p · 현장음 없음.
 * 구글 직접(Gemini API)이 가장 싸고 실패 시 과금이 없다. Kling(fal)은 사람 사진 관대함·15초용.
 */
export const VIDEO_MODELS = {
  veo_lite: { label: "Veo 3.1 Lite", desc: "구글 직접 · 최저가 · 4/6/8초", priceNote: "$0.05/초", provider: "google" },
  veo_fast: { label: "Veo 3.1 Fast", desc: "구글 직접 · 사실감·조명 우수 · 4/6/8초", priceNote: "$0.10/초", provider: "google" },
  kling: { label: "Kling 3.0", desc: "fal.ai · 사람 사진에 관대 · 최대 15초", priceNote: "$0.112/초", provider: "fal" },
} as const;
export type VideoModel = keyof typeof VIDEO_MODELS;
export const isVideoModel = (v: unknown): v is VideoModel => typeof v === "string" && v in VIDEO_MODELS;
/** 구글 키가 있으면 Lite, 없으면 Kling */
export const defaultVideoModel = (googleReady: boolean): VideoModel => (googleReady ? "veo_lite" : "kling");
export const DEFAULT_VIDEO_MODEL: VideoModel = "kling";
