"use client";
/**
 * ⑤ 브라우저 자막 삽입 (SPEC D8·§5⑤) — ffmpeg.wasm 단일 스레드 코어(COOP/COEP 불필요), 자산은 /public에서 자체 호스팅.
 *  - 폰트: /fonts/NotoSansKR-Bold.otf 를 wasm FS의 /fonts 에 마운트, ASS 스타일의 Fontname 과 일치
 *  - 필터: ass=sub.ass:fontsdir=/fonts
 *  - 선택: 배경음악 mp3를 원본 음성(Kling 한국어 대사)과 섞는다 (amix, BGM 볼륨 낮춤)
 */
import type { Cue } from "./subtitles";

export type SubtitleStyle = {
  position: "bottom" | "top";
  fontSize: number; // 1080p 기준 픽셀 (PlayResY=1080)
  box: boolean; // 반투명 배경 박스
};

export const DEFAULT_STYLE: SubtitleStyle = { position: "bottom", fontSize: 64, box: true };
export const FONT_NAME = "Noto Sans KR";
export const FONT_URL = "/fonts/NotoSansKR-Bold.otf";
const CORE_BASE = "/ffmpeg/core";
const LIB_BASE = "/ffmpeg/lib";

const assTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};

const escapeAss = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

/** 큐 → ASS 자막 문서 (순수 함수). PlayRes 1920×1080 기준, 세로 영상은 스케일 자동 적용 */
export function buildAss(cues: Cue[], style: SubtitleStyle = DEFAULT_STYLE, res: { w: number; h: number } = { w: 1920, h: 1080 }): string {
  const align = style.position === "top" ? 8 : 2; // 8=상단 중앙, 2=하단 중앙
  const margin = Math.round(res.h * 0.08);
  const border = style.box ? 4 : 1; // 4 = 불투명 박스, 1 = 외곽선+그림자
  const outline = style.box ? Math.round(style.fontSize * 0.25) : 3;
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
    `Style: Default,${FONT_NAME},${style.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${border},${outline},${style.box ? 0 : 1},${align},60,60,${margin},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cues.filter((c) => c.text.trim() && c.end > c.start).map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${escapeAss(c.text.trim())}`);
  return [...header, ...events, ""].join("\n");
}

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;
let _ffmpeg: FFmpegInstance | null = null;
let _loading: Promise<FFmpegInstance> | null = null;

/** ffmpeg.wasm 로드 (최초 1회, ~32MB 코어는 브라우저 캐시) */
export async function loadFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpegInstance> {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;
  _loading = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => onProgress?.(message));
    const origin = window.location.origin;
    await ff.load({
      coreURL: `${origin}${CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${origin}${CORE_BASE}/ffmpeg-core.wasm`,
      classWorkerURL: `${origin}${LIB_BASE}/worker.js`,
    });
    _ffmpeg = ff;
    return ff;
  })();
  try {
    return await _loading;
  } finally {
    _loading = null;
  }
}

export type BurnOptions = {
  video: Blob;
  cues: Cue[];
  style?: SubtitleStyle;
  /** 영상 해상도 (ASS PlayRes). 모르면 1920×1080 */
  size?: { w: number; h: number };
  bgm?: { file: Blob; volume: number } | null; // volume 0~1
  onProgress?: (ratio: number, phase: string) => void;
};

/** 자막(+BGM) 합성 → mp4 Blob. 5~10초 720p 기준 30~90초 */
export async function burnSubtitles(opts: BurnOptions): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ff = await loadFFmpeg();
  const size = opts.size ?? { w: 1920, h: 1080 };
  const style = opts.style ?? DEFAULT_STYLE;
  opts.onProgress?.(0, "준비 중");

  await ff.createDir("/fonts").catch(() => {});
  await ff.writeFile("/fonts/NotoSansKR-Bold.otf", await fetchFile(FONT_URL));
  await ff.writeFile("in.mp4", await fetchFile(opts.video));
  await ff.writeFile("sub.ass", new TextEncoder().encode(buildAss(opts.cues, style, size)));
  if (opts.bgm) await ff.writeFile("bgm.mp3", await fetchFile(opts.bgm.file));

  const onP = ({ progress }: { progress: number }) => opts.onProgress?.(Math.max(0, Math.min(1, progress)), "인코딩 중");
  ff.on("progress", onP);
  try {
    const args = ["-y", "-i", "in.mp4"];
    if (opts.bgm) {
      const vol = Math.max(0, Math.min(1, opts.bgm.volume));
      args.push("-stream_loop", "-1", "-i", "bgm.mp3");
      args.push("-filter_complex", `[0:v]ass=sub.ass:fontsdir=/fonts[v];[1:a]volume=${vol.toFixed(2)}[b];[0:a][b]amix=inputs=2:duration=first:dropout_transition=2[a]`, "-map", "[v]", "-map", "[a]", "-shortest");
    } else {
      args.push("-vf", "ass=sub.ass:fontsdir=/fonts", "-map", "0:v:0", "-map", "0:a?", "-c:a", "copy");
    }
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
    if (opts.bgm) args.push("-c:a", "aac", "-b:a", "160k");
    args.push("out.mp4");
    const code = await ff.exec(args);
    if (code !== 0) throw new Error(`ffmpeg 종료 코드 ${code}`);
    const data = (await ff.readFile("out.mp4")) as Uint8Array;
    if (!data.length) throw new Error("결과 파일이 비어 있어요.");
    opts.onProgress?.(1, "완료");
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ff.off("progress", onP);
    for (const f of ["in.mp4", "sub.ass", "out.mp4", "bgm.mp3"]) await ff.deleteFile(f).catch(() => {});
  }
}

/** 파일명 규칙 (SPEC §5⑥): {닉네임}_{yyyyMMdd_HHmm}.mp4 */
export function downloadFileName(nickname: string, d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const safe = (nickname || "실습").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30);
  return `${safe}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.mp4`;
}
