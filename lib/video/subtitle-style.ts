/**
 * 자막 폰트·테마 정의 — 브라우저(ffmpeg.wasm ASS)와 서버(drawtext) 양쪽에서 공용.
 * 폰트는 모두 SIL OFL 라이선스(Google Fonts). 파일은 assets/fonts → public/fonts 로 복사된다.
 */

export type SubtitleFontId = "noto" | "gothica1" | "blackhan" | "dohyeon" | "jua" | "myeongjo" | "pen";

export type SubtitleFont = {
  id: SubtitleFontId;
  label: string;
  file: string; // assets/fonts/<file>
  family: string; // 폰트 파일의 family name (ASS Fontname 과 정확히 일치해야 함)
  bold: boolean; // 파일 자체가 볼드면 true → ASS Bold=-1, 아니면 0 (가짜 볼드 방지)
  sample: string;
};

export const SUBTITLE_FONTS: Record<SubtitleFontId, SubtitleFont> = {
  noto: { id: "noto", label: "고딕 · 기본 (Noto Sans KR)", file: "NotoSansKR-Bold.otf", family: "Noto Sans KR", bold: true, sample: "깔끔한 기본 고딕" },
  gothica1: { id: "gothica1", label: "고딕 · 굵게 (Gothic A1)", file: "GothicA1-ExtraBold.ttf", family: "Gothic A1 ExtraBold", bold: false, sample: "더 굵은 고딕" },
  blackhan: { id: "blackhan", label: "제목체 (Black Han Sans)", file: "BlackHanSans-Regular.ttf", family: "Black Han Sans", bold: false, sample: "임팩트 제목체" },
  dohyeon: { id: "dohyeon", label: "도현체", file: "DoHyeon-Regular.ttf", family: "Do Hyeon", bold: false, sample: "또렷한 도현체" },
  jua: { id: "jua", label: "주아체 (둥근 손글씨)", file: "Jua-Regular.ttf", family: "Jua", bold: false, sample: "귀여운 주아체" },
  myeongjo: { id: "myeongjo", label: "명조 (나눔명조)", file: "NanumMyeongjo-Bold.ttf", family: "NanumMyeongjo", bold: true, sample: "단정한 명조체" },
  pen: { id: "pen", label: "손글씨 (나눔펜)", file: "NanumPenScript-Regular.ttf", family: "Nanum Pen", bold: false, sample: "자연스러운 손글씨" },
};
export const DEFAULT_FONT_ID: SubtitleFontId = "noto";
export const fontOf = (id: string | undefined | null): SubtitleFont => SUBTITLE_FONTS[(id as SubtitleFontId) in SUBTITLE_FONTS ? (id as SubtitleFontId) : DEFAULT_FONT_ID];

export type SubtitleThemeId = "box-black" | "box-green" | "outline-white" | "outline-yellow" | "outline-gold" | "box-white";

export type SubtitleTheme = {
  id: SubtitleThemeId;
  label: string;
  /** 글자색 (#RRGGBB) */
  text: string;
  /** 박스 배경 (#RRGGBB) + 불투명도 0~1. 없으면 외곽선 스타일 */
  box?: { color: string; alpha: number };
  /** 외곽선 색·두께(글자 크기 대비 비율) */
  outline: { color: string; width: number };
  shadow: number; // px @1080p
};

export const SUBTITLE_THEMES: Record<SubtitleThemeId, SubtitleTheme> = {
  "box-black": { id: "box-black", label: "흰 글자 · 검정 박스 (기본)", text: "#FFFFFF", box: { color: "#000000", alpha: 0.55 }, outline: { color: "#000000", width: 0 }, shadow: 0 },
  "box-green": { id: "box-green", label: "흰 글자 · 농협 초록 박스", text: "#FFFFFF", box: { color: "#0B6B3A", alpha: 0.85 }, outline: { color: "#0B6B3A", width: 0 }, shadow: 0 },
  "box-white": { id: "box-white", label: "검정 글자 · 흰 박스", text: "#14211A", box: { color: "#FFFFFF", alpha: 0.85 }, outline: { color: "#FFFFFF", width: 0 }, shadow: 0 },
  "outline-white": { id: "outline-white", label: "흰 글자 · 검정 외곽선", text: "#FFFFFF", outline: { color: "#000000", width: 0.07 }, shadow: 2 },
  "outline-yellow": { id: "outline-yellow", label: "노랑 글자 · 검정 외곽선 (예능 자막)", text: "#FFE600", outline: { color: "#000000", width: 0.08 }, shadow: 2 },
  "outline-gold": { id: "outline-gold", label: "골드 글자 · 진초록 외곽선", text: "#F2C94C", outline: { color: "#084D2A", width: 0.08 }, shadow: 2 },
};
export const DEFAULT_THEME_ID: SubtitleThemeId = "box-black";
export const themeOf = (id: string | undefined | null): SubtitleTheme => SUBTITLE_THEMES[(id as SubtitleThemeId) in SUBTITLE_THEMES ? (id as SubtitleThemeId) : DEFAULT_THEME_ID];

export type SubtitleStyle = {
  position: "bottom" | "top";
  fontSize: number; // 1080p 기준 px (PlayResY=1080)
  fontId: SubtitleFontId;
  themeId: SubtitleThemeId;
};
export const DEFAULT_STYLE: SubtitleStyle = { position: "bottom", fontSize: 64, fontId: DEFAULT_FONT_ID, themeId: DEFAULT_THEME_ID };

/** 저장/전송용 검증 (알 수 없는 값은 기본값으로) */
export function normalizeStyle(raw: unknown): SubtitleStyle {
  const r = (raw ?? {}) as Partial<Record<keyof SubtitleStyle, unknown>>;
  const size = Number(r.fontSize);
  return {
    position: r.position === "top" ? "top" : "bottom",
    fontSize: Number.isFinite(size) ? Math.max(32, Math.min(140, Math.round(size))) : DEFAULT_STYLE.fontSize,
    fontId: fontOf(typeof r.fontId === "string" ? r.fontId : undefined).id,
    themeId: themeOf(typeof r.themeId === "string" ? r.themeId : undefined).id,
  };
}

/* ---------- 색 변환 ---------- */

/** #RRGGBB + alpha(0~1, 1=불투명) → ASS &HAABBGGRR */
export function assColor(hex: string, alpha = 1): string {
  const h = hex.replace("#", "").padStart(6, "0");
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  const a = Math.round((1 - Math.max(0, Math.min(1, alpha))) * 255).toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** #RRGGBB + alpha → ffmpeg drawtext 색 (0xRRGGBB@alpha) */
export const ffColor = (hex: string, alpha = 1) => `0x${hex.replace("#", "")}@${Math.max(0, Math.min(1, alpha)).toFixed(2)}`;
