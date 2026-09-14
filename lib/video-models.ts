/** 제작실에서 고르는 영상 모델 — fal.ai 위에서 키 하나로 전환. 가격은 fal 공개 단가(2026-09), 초당 USD */
export const VIDEO_MODELS = {
  kling: { label: "Kling 3.0", desc: "안정적 · 최대 15초 · 기본", priceNote: "표준 $0.112/초, 현장음 $0.14/초, Pro $0.14/초" },
  veo: { label: "Veo 3.1 Fast", desc: "구글 · 사실감·조명 우수 · 현장음 기본 · 4/6/8초", priceNote: "$0.10/초, 현장음 $0.15/초 (720p·1080p 동일)" },
} as const;
export type VideoModel = keyof typeof VIDEO_MODELS;
export const DEFAULT_VIDEO_MODEL: VideoModel = "kling";
export const isVideoModel = (v: unknown): v is VideoModel => typeof v === "string" && v in VIDEO_MODELS;
