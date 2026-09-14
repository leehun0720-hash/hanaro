/**
 * 사이트 색 테마 — 관리자 브랜딩에서 고른다 (site_settings.theme, 마이그레이션 0008).
 * 값은 globals.css의 CSS 변수(--brand 등)를 <html> 인라인 스타일로 덮어쓴다.
 */
export type ThemeColors = {
  brand: string; // 주색 (버튼·링크)
  brandDeep: string; // 진한 주색 (히어로 배경·hover)
  brandSoft: string; // 연한 주색 (배경 배지)
  accent: string; // 강조색 (--gold 자리)
  accentSoft: string;
  background: string; // 페이지 바탕
  line: string; // 구분선
  foreground: string;
  muted: string;
};

export const THEMES = {
  green: { label: "그린", desc: "농협 초록 · 가을 골드 (기본)", colors: { brand: "#0b6b3a", brandDeep: "#084d2a", brandSoft: "#e6f2ea", accent: "#c9a227", accentSoft: "#fbf3d9", background: "#f7f8f5", line: "#e2e7e1", foreground: "#14211a", muted: "#5d6b63" } },
  navy: { label: "네이비", desc: "짙은 남색 · 골드", colors: { brand: "#1e3a8a", brandDeep: "#172554", brandSoft: "#e4eaf8", accent: "#d4a72c", accentSoft: "#fbf3d9", background: "#f5f7fa", line: "#dfe4ec", foreground: "#111827", muted: "#5b6472" } },
  purple: { label: "퍼플", desc: "보라 · 골드", colors: { brand: "#6d28d9", brandDeep: "#4c1d95", brandSoft: "#ede9fe", accent: "#f2c94c", accentSoft: "#fbf3d9", background: "#f8f7fb", line: "#e5e2ee", foreground: "#1b1530", muted: "#5f5a72" } },
  red: { label: "레드", desc: "진홍 · 앰버", colors: { brand: "#b3261e", brandDeep: "#7a1410", brandSoft: "#fbe9e7", accent: "#e0a526", accentSoft: "#fdf3dc", background: "#faf7f5", line: "#ece2df", foreground: "#231413", muted: "#6b5a58" } },
  pink: { label: "핑크", desc: "로즈 · 피치", colors: { brand: "#d6336c", brandDeep: "#9c1c4c", brandSoft: "#fce7ef", accent: "#f4a261", accentSoft: "#fdebdd", background: "#fbf6f8", line: "#efe0e6", foreground: "#26141b", muted: "#6d5a62" } },
} as const;

export type ThemeId = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeId = "green";
export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && v in THEMES;

/** <html style={...}>에 넣을 CSS 변수 */
export function themeVars(id: ThemeId): Record<string, string> {
  const c = THEMES[id].colors;
  return {
    "--brand": c.brand,
    "--brand-deep": c.brandDeep,
    "--brand-soft": c.brandSoft,
    "--gold": c.accent,
    "--gold-soft": c.accentSoft,
    "--gold-deep": GOLD_DEEP[id],
    "--background": c.background,
    "--line": c.line,
    "--foreground": c.foreground,
    "--muted": c.muted,
  };
}

/** 강조색 배지의 글자색 (연한 강조 배경 위) */
const GOLD_DEEP: Record<ThemeId, string> = { green: "#7a5d00", navy: "#7a5d00", purple: "#7a5d00", red: "#7a4a00", pink: "#8a4a1a" };
