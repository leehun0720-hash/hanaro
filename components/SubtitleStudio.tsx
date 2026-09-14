"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cue } from "@/lib/video/subtitles";
import { burnSubtitles, DEFAULT_STYLE, downloadFileName, loadFFmpeg, type SubtitleStyle } from "@/lib/video/wasm-subtitles";
import { fontOf, SUBTITLE_FONTS, SUBTITLE_THEMES, themeOf, type SubtitleFontId, type SubtitleThemeId } from "@/lib/video/subtitle-style";

/** 실제로 화면에 나올 수 있는 자막: 문구가 있고 끝이 시작보다 큰 것 */
export const validCues = (cues: Cue[]) => cues.filter((c) => c.text.trim() && c.end > c.start);

export function CueEditor({ cues, onChange, total, maxChars = 20 }: { cues: Cue[]; onChange: (c: Cue[]) => void; total: number; maxChars?: number }) {
  const set = (i: number, patch: Partial<Cue>) => onChange(cues.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = () => {
    const last = cues.at(-1);
    // 마지막 자막이 영상 끝까지 차 있으면 절반으로 나눠 새 줄을 만든다 (시작=끝인 0초 자막 방지)
    if (last && last.end >= total && last.end - last.start >= 1) {
      const mid = Math.round(((last.start + last.end) / 2) * 2) / 2;
      onChange([...cues.slice(0, -1), { ...last, end: mid }, { start: mid, end: total, text: "" }]);
    } else {
      onChange([...cues, { start: Math.min(last?.end ?? 0, Math.max(0, total - 1)), end: total, text: "" }]);
    }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[4.5rem_4.5rem_1fr_auto] gap-2 text-[11px] text-muted"><span>시작(초)</span><span>끝(초)</span><span>자막 문구</span><span /></div>
      {cues.map((c, i) => {
        const bad = c.end <= c.start;
        return (
          <div key={i} className="grid grid-cols-[4.5rem_4.5rem_1fr_auto] items-start gap-2">
            <input type="number" min={0} max={total} step={0.5} value={c.start} onChange={(e) => set(i, { start: Number(e.target.value) })} className={`input px-2 py-1.5 ${bad ? "border-danger" : ""}`} aria-label="시작 초" />
            <input type="number" min={0} max={total} step={0.5} value={c.end} onChange={(e) => set(i, { end: Number(e.target.value) })} className={`input px-2 py-1.5 ${bad ? "border-danger" : ""}`} aria-label="끝 초" />
            <div>
              <input value={c.text} maxLength={60} onChange={(e) => set(i, { text: e.target.value })} className="input px-2 py-1.5" placeholder={`자막 문구 (${maxChars}자 이내 권장)`} />
              {bad && <p className="text-[11px] text-danger mt-0.5">끝(초)이 시작(초)보다 커야 화면에 나와요. 예) 시작 0 · 끝 {total}</p>}
              {!bad && [...c.text].length > maxChars && <p className="text-[11px] text-danger mt-0.5">{[...c.text].length}자 — 한 줄에 너무 길어요. 줄을 나누세요.</p>}
            </div>
            <button type="button" onClick={() => onChange(cues.filter((_, j) => j !== i))} className="text-muted hover:text-danger px-1 py-1.5" aria-label="삭제">✕</button>
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <p className="hint">영상 전체에 한 줄만 넣으려면 시작 0 · 끝 {total}. 여러 줄이면 구간을 나눕니다.</p>
        <button type="button" disabled={cues.length >= 12} onClick={add} className="btn-secondary text-xs">+ 자막 추가</button>
      </div>
    </div>
  );
}

type Props = {
  videoUrl: string; // /api/assets/{id}
  cues: Cue[];
  onCuesChange: (c: Cue[]) => void;
  duration: number;
  ratio: "16:9" | "9:16";
  nickname: string;
  /** 서버가 만든 한국어 내레이션 mp3 (/api/assets/{id}) */
  narrationUrl?: string | null;
  /** 브라우저 처리 실패 시 서버 대체 합성 (현재 스타일 전달) */
  onServerFallback: (style: SubtitleStyle) => Promise<void>;
  /** 완성본을 갤러리에 보관(선택) */
  onKeep?: (blob: Blob) => Promise<void>;
  /** 완료. 브라우저에서 만든 결과가 있으면 그 파일을 함께 넘긴다 */
  onFinish: (burned: Blob | null) => Promise<void>;
  busy: boolean;
};

/** ⑤ 자막 삽입 + ⑥ 다운로드 (브라우저 ffmpeg.wasm) */
export function SubtitleStudio({ videoUrl, cues, onCuesChange, duration, ratio, nickname, narrationUrl, onServerFallback, onKeep, onFinish, busy }: Props) {
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [bgm, setBgm] = useState<File | null>(null);
  const [bgmVol, setBgmVol] = useState(0.25);
  const [useNarration, setUseNarration] = useState(true);
  const [phase, setPhase] = useState<"idle" | "loading" | "encoding" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const outBlob = useRef<Blob | null>(null);
  const [kept, setKept] = useState(false);
  const size = useMemo(() => (ratio === "9:16" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 }), [ratio]);

  useEffect(() => () => { if (outUrl) URL.revokeObjectURL(outUrl); }, [outUrl]);

  async function run() {
    setError(null);
    setPhase("loading");
    setProgress(0);
    try {
      await loadFFmpeg((m) => setLog(m.slice(0, 200)));
      setPhase("encoding");
      const r = await fetch(videoUrl, { cache: "no-store" });
      if (!r.ok) throw new Error("원본 영상을 불러오지 못했어요.");
      const video = await r.blob();
      let narration: { file: Blob } | null = null;
      if (narrationUrl && useNarration) {
        const n = await fetch(narrationUrl, { cache: "no-store" });
        if (n.ok) narration = { file: await n.blob() };
      }
      const blob = await burnSubtitles({ video, cues, style, size, bgm: bgm ? { file: bgm, volume: bgmVol } : null, narration, onProgress: (p) => setProgress(p) });
      outBlob.current = blob;
      if (outUrl) URL.revokeObjectURL(outUrl);
      setOutUrl(URL.createObjectURL(blob));
      setKept(false);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function download() {
    if (!outUrl) return;
    const a = document.createElement("a");
    a.href = outUrl;
    a.download = downloadFileName(nickname);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const working = phase === "loading" || phase === "encoding";

  return (
    <div className="space-y-5">
      <FontFaces />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">자막 폰트</label>
          <select value={style.fontId} onChange={(e) => setStyle({ ...style, fontId: e.target.value as SubtitleFontId })} className="input">
            {Object.values(SUBTITLE_FONTS).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">자막 테마</label>
          <select value={style.themeId} onChange={(e) => setStyle({ ...style, themeId: e.target.value as SubtitleThemeId })} className="input">
            {Object.values(SUBTITLE_THEMES).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">자막 위치</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStyle({ ...style, position: "bottom" })} className={`rounded-lg border px-3 py-2 text-sm ${style.position === "bottom" ? "border-brand bg-brand-soft" : "border-line"}`}>하단</button>
            <button type="button" onClick={() => setStyle({ ...style, position: "top" })} className={`rounded-lg border px-3 py-2 text-sm ${style.position === "top" ? "border-brand bg-brand-soft" : "border-line"}`}>상단</button>
          </div>
        </div>
        <div>
          <label className="label">글자 크기 {style.fontSize}</label>
          <input type="range" min={40} max={120} step={2} value={style.fontSize} onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) })} className="w-full" />
        </div>
      </div>
      <StylePreview style={style} text={cues.find((c) => c.text.trim())?.text ?? "자막 미리보기"} ratio={ratio} />

      <div>
        <label className="label">자막 ({duration}초 · 한 줄 20자 이내 권장)</label>
        <CueEditor cues={cues} onChange={onCuesChange} total={duration} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {narrationUrl && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useNarration} onChange={(e) => setUseNarration(e.target.checked)} /> 한국어 내레이션 포함 (자막을 읽어주는 AI 음성)</label>
            <audio src={narrationUrl} controls className="mt-1 h-8 w-full" />
          </div>
        )}
        <div>
          <label className="label">배경음악 (선택, mp3) — 영상 소리·내레이션과 섞입니다</label>
          <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/mp4" className="input" onChange={(e) => setBgm(e.target.files?.[0] ?? null)} />
        </div>
        {bgm && (
          <div>
            <label className="label">배경음악 볼륨 {Math.round(bgmVol * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={bgmVol} onChange={(e) => setBgmVol(Number(e.target.value))} className="w-full" />
          </div>
        )}
      </div>

      {validCues(cues).length === 0 && <p className="text-sm text-danger">문구가 있고 끝(초)이 시작(초)보다 큰 자막이 한 줄 이상 있어야 자막을 입힐 수 있어요.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={working || busy || validCues(cues).length === 0} onClick={run}>
          {phase === "loading" ? "도구 불러오는 중 (최초 1회 ~30MB)…" : phase === "encoding" ? `자막 입히는 중 ${Math.round(progress * 100)}%` : outUrl ? "다시 만들기" : "⑤ 내 브라우저에서 자막 입히기"}
        </button>
        <button type="button" className="btn-secondary text-xs" disabled={working || busy} onClick={() => onServerFallback(style)}>브라우저에서 안 되면 서버에서 합성</button>
      </div>
      {working && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-100"><div className="h-2 bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="hint">5~10초 영상 기준 30~90초 걸려요. 이 탭을 닫지 마세요. {log && <span className="font-mono text-[10px] text-muted">{log}</span>}</p>
        </div>
      )}
      {error && <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">자막 처리 실패: {error} — 위의 “서버에서 합성” 버튼을 눌러 주세요.</div>}

      {outUrl && (
        <div className="space-y-3 rounded-lg border border-brand/30 bg-brand-soft/40 p-4">
          <video key={outUrl} src={outUrl} controls playsInline className={`w-full rounded-lg border border-line bg-black ${ratio === "9:16" ? "max-h-[70vh] mx-auto" : ""}`} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-primary" onClick={download}>⑥ mp4 다운로드</button>
            {onKeep && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || kept}
                onClick={async () => {
                  if (!outBlob.current) return;
                  await onKeep(outBlob.current);
                  setKept(true);
                }}
              >
                {kept ? "갤러리에 보관됨" : "수업 갤러리에 보관 (선택)"}
              </button>
            )}
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onFinish(outBlob.current)}>완료 · 이 영상 저장</button>
          </div>
          <p className="hint">▲ 자막이 입혀진 결과 영상입니다. 파일명: {downloadFileName(nickname)} · ‘완료’를 누르면 이 영상이 보관함에 저장됩니다.</p>
        </div>
      )}
    </div>
  );
}

/** 번들 폰트를 CSS로 등록 (미리보기용). 선택된 폰트만 브라우저가 내려받는다 */
function FontFaces() {
  const css = Object.values(SUBTITLE_FONTS)
    .map((f) => `@font-face{font-family:"sub-${f.id}";src:url("/fonts/${f.file}");font-display:swap;}`)
    .join("\n");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/** 실제 합성과 비슷한 비율로 자막 모양을 미리 보여준다 (1080p 기준 글자 크기를 축소) */
function StylePreview({ style, text, ratio }: { style: SubtitleStyle; text: string; ratio: "16:9" | "9:16" }) {
  const theme = themeOf(style.themeId);
  const font = fontOf(style.fontId);
  const previewH = 180;
  const shownH = ratio === "9:16" ? 1920 * 0.35 : 1080 * 0.5; // 미리보기에 보이는 영상 높이(px, 원본 기준)
  const px = Math.max(10, Math.round(style.fontSize * (previewH / shownH)));
  const hexA = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  const textStyle: React.CSSProperties = {
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
