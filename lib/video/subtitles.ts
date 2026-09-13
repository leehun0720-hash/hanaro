import path from "node:path";
import { DEFAULT_STYLE, ffColor, fontOf, themeOf, type SubtitleStyle } from "./subtitle-style";

export const FONT_PATH = path.join(process.cwd(), "assets", "fonts", "NotoSansKR-Bold.otf");
export const fontPathOf = (fontId?: string) => path.join(process.cwd(), "assets", "fonts", fontOf(fontId).file);

export type Cue = { start: number; end: number; text: string };

/** ffmpeg 필터 문자열 안에서 안전한 값으로 (drawtext text= 용) */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’") // 작은따옴표는 유니코드 인용부호로 대체
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/** Windows 경로의 콜론·백슬래시를 필터용으로 이스케이프 */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * 자막 큐 → drawtext 필터 체인. 하단 반투명 띠 + 흰 글자, 무음 시청 대응.
 * @param height 출력 영상 높이(px) — 글자 크기·위치 계산
 */
export function subtitleFilter(cues: Cue[], height: number, opts: { fontPath?: string; fontSize?: number; boxAlpha?: number; style?: SubtitleStyle } = {}): string {
  const style = opts.style ?? DEFAULT_STYLE;
  const theme = themeOf(style.themeId);
  const font = escapeFilterPath(opts.fontPath ?? (opts.style ? fontPathOf(style.fontId) : FONT_PATH));
  // style.fontSize는 1080p 기준 → 실제 높이에 비례
  const size = opts.fontSize ?? (opts.style ? Math.round((style.fontSize / 1080) * height) : Math.round(height * 0.055));
  const y = style.position === "top" ? `${Math.round(height * 0.08)}` : `h-${Math.round(height * 0.14)}`;
  const look = theme.box
    ? `box=1:boxcolor=${ffColor(theme.box.color, opts.boxAlpha ?? theme.box.alpha)}:boxborderw=${Math.round(size * 0.35)}`
    : `borderw=${Math.max(1, Math.round(size * theme.outline.width))}:bordercolor=${ffColor(theme.outline.color)}:shadowx=${theme.shadow}:shadowy=${theme.shadow}:shadowcolor=black@0.6`;
  return cues
    .filter((c) => c.text.trim() && c.end > c.start)
    .map(
      (c) =>
        `drawtext=fontfile='${font}':expansion=none:text='${escapeDrawtext(c.text.trim())}':fontcolor=${ffColor(theme.text)}:fontsize=${size}:` +
        `${look}:x=(w-text_w)/2:y=${y}:` +
        `enable='between(t\\,${c.start.toFixed(2)}\\,${c.end.toFixed(2)})'`,
    )
    .join(",");
}

/** 컷별 길이 배열로 누적 시간 큐 생성 */
export function cuesFromSegments(segments: { seconds: number; text: string }[]): Cue[] {
  let t = 0;
  return segments.map((s) => {
    const cue = { start: t, end: t + s.seconds, text: s.text };
    t += s.seconds;
    return cue;
  });
}
