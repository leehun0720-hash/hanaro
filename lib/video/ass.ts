import type { Cue } from "./subtitles";
import { assColor, DEFAULT_STYLE, fontOf, themeOf, type SubtitleStyle } from "./subtitle-style";

/** 순수 함수 — 브라우저(ffmpeg.wasm)와 서버(ffmpeg libass) 공용 ASS 자막 문서 */

const assTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};

const escapeAss = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

/** 큐 → ASS 자막 문서. PlayRes는 출력 해상도 기준, fontSize는 1080p 기준 px */
export function buildAss(cues: Cue[], style: SubtitleStyle = DEFAULT_STYLE, res: { w: number; h: number } = { w: 1920, h: 1080 }): string {
  const font = fontOf(style.fontId);
  const theme = themeOf(style.themeId);
  const align = style.position === "top" ? 8 : 2; // 8=상단 중앙, 2=하단 중앙
  const margin = Math.round(res.h * 0.08);
  const border = theme.box ? 4 : 1; // 4 = 박스, 1 = 외곽선+그림자
  const outline = theme.box ? Math.round(style.fontSize * 0.25) : Math.max(1, Math.round(style.fontSize * theme.outline.width));
  const primary = assColor(theme.text);
  const outlineC = theme.box ? assColor(theme.box.color, theme.box.alpha) : assColor(theme.outline.color);
  const backC = theme.box ? assColor(theme.box.color, theme.box.alpha) : assColor("#000000", 0.5);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${res.w}`,
    `PlayResY: ${res.h}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${font.family},${style.fontSize},${primary},&H000000FF,${outlineC},${backC},${font.bold ? -1 : 0},0,0,0,100,100,0,0,${border},${outline},${theme.box ? 0 : theme.shadow},${align},60,60,${margin},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cues.filter((c) => c.text.trim() && c.end > c.start).map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${escapeAss(c.text.trim())}`);
  return [...header, ...events, ""].join("\n");
}
