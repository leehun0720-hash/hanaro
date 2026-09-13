"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cue } from "@/lib/video/subtitles";
import { burnSubtitles, DEFAULT_STYLE, downloadFileName, loadFFmpeg, type SubtitleStyle } from "@/lib/video/wasm-subtitles";

export function CueEditor({ cues, onChange, total, maxChars = 20 }: { cues: Cue[]; onChange: (c: Cue[]) => void; total: number; maxChars?: number }) {
  const set = (i: number, patch: Partial<Cue>) => onChange(cues.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {cues.map((c, i) => (
        <div key={i} className="grid grid-cols-[4.5rem_4.5rem_1fr_auto] items-center gap-2">
          <input type="number" min={0} max={total} step={0.5} value={c.start} onChange={(e) => set(i, { start: Number(e.target.value) })} className="input px-2 py-1.5" aria-label="시작 초" />
          <input type="number" min={0} max={total} step={0.5} value={c.end} onChange={(e) => set(i, { end: Number(e.target.value) })} className="input px-2 py-1.5" aria-label="끝 초" />
          <div>
            <input value={c.text} maxLength={60} onChange={(e) => set(i, { text: e.target.value })} className="input px-2 py-1.5" placeholder={`자막 문구 (${maxChars}자 이내 권장)`} />
            {[...c.text].length > maxChars && <p className="text-[11px] text-danger mt-0.5">{[...c.text].length}자 — 한 줄에 너무 길어요. 줄을 나누세요.</p>}
          </div>
          <button type="button" onClick={() => onChange(cues.filter((_, j) => j !== i))} className="text-muted hover:text-danger px-1" aria-label="삭제">✕</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <p className="hint">시작·끝은 초 단위(0~{total}). 줄바꿈은 Enter 대신 자막을 나눠 추가하세요.</p>
        <button type="button" disabled={cues.length >= 12} onClick={() => onChange([...cues, { start: cues.at(-1)?.end ?? 0, end: total, text: "" }])} className="btn-secondary text-xs">+ 자막 추가</button>
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
  /** 브라우저 처리 실패 시 서버 대체 합성 */
  onServerFallback: () => Promise<void>;
  /** 완성본을 갤러리에 보관(선택) */
  onKeep?: (blob: Blob) => Promise<void>;
  /** 완료. 브라우저에서 만든 결과가 있으면 그 파일을 함께 넘긴다 */
  onFinish: (burned: Blob | null) => Promise<void>;
  busy: boolean;
};

/** ⑤ 자막 삽입 + ⑥ 다운로드 (브라우저 ffmpeg.wasm) */
export function SubtitleStudio({ videoUrl, cues, onCuesChange, duration, ratio, nickname, onServerFallback, onKeep, onFinish, busy }: Props) {
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [bgm, setBgm] = useState<File | null>(null);
  const [bgmVol, setBgmVol] = useState(0.25);
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
      const blob = await burnSubtitles({ video, cues, style, size, bgm: bgm ? { file: bgm, volume: bgmVol } : null, onProgress: (p) => setProgress(p) });
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
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">자막 위치</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStyle({ ...style, position: "bottom" })} className={`rounded-lg border px-3 py-2 text-sm ${style.position === "bottom" ? "border-brand bg-brand-soft" : "border-line"}`}>하단</button>
            <button type="button" onClick={() => setStyle({ ...style, position: "top" })} className={`rounded-lg border px-3 py-2 text-sm ${style.position === "top" ? "border-brand bg-brand-soft" : "border-line"}`}>상단</button>
          </div>
        </div>
        <div>
          <label className="label">글자 크기 {style.fontSize}</label>
          <input type="range" min={40} max={110} step={2} value={style.fontSize} onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) })} className="w-full" />
        </div>
        <div>
          <label className="label">배경 박스</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={style.box} onChange={(e) => setStyle({ ...style, box: e.target.checked })} /> 반투명 검정 박스</label>
        </div>
      </div>

      <div>
        <label className="label">자막 ({duration}초 · 한 줄 20자 이내 권장)</label>
        <CueEditor cues={cues} onChange={onCuesChange} total={duration} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">배경음악 (선택, mp3) — 영상 속 한국어 음성과 섞입니다</label>
          <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/mp4" className="input" onChange={(e) => setBgm(e.target.files?.[0] ?? null)} />
        </div>
        {bgm && (
          <div>
            <label className="label">배경음악 볼륨 {Math.round(bgmVol * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={bgmVol} onChange={(e) => setBgmVol(Number(e.target.value))} className="w-full" />
          </div>
        )}
      </div>

      {!cues.some((c) => c.text.trim()) && <p className="text-sm text-danger">자막 문구를 한 줄 이상 입력해야 자막을 입힐 수 있어요.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={working || busy || !cues.some((c) => c.text.trim())} onClick={run}>
          {phase === "loading" ? "도구 불러오는 중 (최초 1회 ~30MB)…" : phase === "encoding" ? `자막 입히는 중 ${Math.round(progress * 100)}%` : outUrl ? "다시 만들기" : "⑤ 내 브라우저에서 자막 입히기"}
        </button>
        <button type="button" className="btn-secondary text-xs" disabled={working || busy} onClick={onServerFallback}>브라우저에서 안 되면 서버에서 합성</button>
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
