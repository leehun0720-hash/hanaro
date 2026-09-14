"use client";
import type { CSSProperties } from "react";
import { fontOf, SUBTITLE_FONTS, SUBTITLE_THEMES, themeOf, type SubtitleFontId, type SubtitleStyle, type SubtitleThemeId } from "@/lib/video/subtitle-style";

/** 번들 폰트를 CSS로 등록 (미리보기용). 선택된 폰트만 브라우저가 내려받는다 */
export function FontFaces() {
  const css = Object.values(SUBTITLE_FONTS)
    .map((f) => `@font-face{font-family:"sub-${f.id}";src:url("/fonts/${f.file}");font-display:swap;}`)
    .join("\n");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/** 실제 합성과 비슷한 비율로 자막 모양을 미리 보여준다 (1080p 기준 글자 크기를 축소) */
export function StylePreview({ style, text, ratio }: { style: SubtitleStyle; text: string; ratio: "16:9" | "9:16" }) {
  const theme = themeOf(style.themeId);
  const font = fontOf(style.fontId);
  const previewH = 180;
  const shownH = ratio === "9:16" ? 1920 * 0.35 : 1080 * 0.5; // 미리보기에 보이는 영상 높이(px, 원본 기준)
  const px = Math.max(10, Math.round(style.fontSize * (previewH / shownH)));
  const hexA = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  const textStyle: CSSProperties = {
    fontFamily: `"sub-${font.id}", "Noto Sans KR", sans-serif`,
    fontWeight: font.bold ? 700 : 400,
    fontSize: px,
    lineHeight: 1.3,
    color: theme.text,
    padding: theme.box ? `${Math.round(px * 0.15)}px ${Math.round(px * 0.4)}px` : 0,
    background: theme.box ? hexA(theme.box.color, theme.box.alpha) : "transparent",
    borderRadius: theme.box ? 4 : 0,
    WebkitTextStroke: theme.box ? undefined : `${Math.max(1, Math.round(px * theme.outline.width * 0.6))}px ${theme.outline.color}`,
    paintOrder: "stroke fill",
    textShadow: theme.box ? undefined : `${theme.shadow}px ${theme.shadow}px 2px rgba(0,0,0,.6)`,
    whiteSpace: "nowrap",
  };
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-gradient-to-b from-sky-200 via-amber-100 to-emerald-700" style={{ height: previewH }}>
      <div className={`absolute left-0 right-0 flex justify-center px-4 ${style.position === "top" ? "top-4" : "bottom-4"}`}>
        <span style={textStyle}>{text}</span>
      </div>
      <span className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white">미리보기</span>
    </div>
  );
}

/** 폰트·테마·위치·크기 선택 + 미리보기 (홍보영상·뮤직비디오·실습 공용) */
export function SubtitleStylePicker({ style, onChange, ratio, sampleText, compact }: { style: SubtitleStyle; onChange: (s: SubtitleStyle) => void; ratio: "16:9" | "9:16"; sampleText?: string; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <FontFaces />
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
        <div>
          <label className="label">자막 폰트</label>
          <select value={style.fontId} onChange={(e) => onChange({ ...style, fontId: e.target.value as SubtitleFontId })} className="input">
            {Object.values(SUBTITLE_FONTS).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">자막 테마</label>
          <select value={style.themeId} onChange={(e) => onChange({ ...style, themeId: e.target.value as SubtitleThemeId })} className="input">
            {Object.values(SUBTITLE_THEMES).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">자막 위치</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChange({ ...style, position: "bottom" })} className={`rounded-lg border px-3 py-2 text-sm ${style.position === "bottom" ? "border-brand bg-brand-soft" : "border-line"}`}>하단</button>
            <button type="button" onClick={() => onChange({ ...style, position: "top" })} className={`rounded-lg border px-3 py-2 text-sm ${style.position === "top" ? "border-brand bg-brand-soft" : "border-line"}`}>상단</button>
          </div>
        </div>
        <div>
          <label className="label">글자 크기 {style.fontSize}</label>
          <input type="range" min={40} max={120} step={2} value={style.fontSize} onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value) })} className="w-full" />
        </div>
      </div>
      <StylePreview style={style} text={sampleText?.trim() || "자막 미리보기"} ratio={ratio} />
    </div>
  );
}
