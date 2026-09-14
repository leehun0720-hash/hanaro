"use client";
/**
 * ⑤ 브라우저 자막 삽입 (SPEC D8·§5⑤) — ffmpeg.wasm 단일 스레드 코어(COOP/COEP 불필요), 자산은 /public에서 자체 호스팅.
 *  - 폰트: /fonts/NotoSansKR-Bold.otf 를 wasm FS의 /fonts 에 마운트, ASS 스타일의 Fontname 과 일치
 *  - 필터: ass=sub.ass:fontsdir=/fonts
 *  - 선택: 배경음악 mp3를 원본 음성(Kling 한국어 대사)과 섞는다 (amix, BGM 볼륨 낮춤)
 */
import type { Cue } from "./subtitles";
import { DEFAULT_STYLE, fontOf, type SubtitleStyle } from "./subtitle-style";
import { buildAss } from "./ass";
export { DEFAULT_STYLE, type SubtitleStyle } from "./subtitle-style";

const CORE_BASE = "/ffmpeg/core";
const LIB_BASE = "/ffmpeg/lib";

export { buildAss } from "./ass";

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
  /** 한국어 내레이션 mp3 (서버가 만든 트랙) */
  narration?: { file: Blob; volume?: number } | null;
  /** 원본 영상 소리(Kling 현장음) 볼륨 0~1. 원본에 소리가 없으면 무시 */
  sourceVolume?: number;
  onProgress?: (ratio: number, phase: string) => void;
};

/** 자막(+BGM) 합성 → mp4 Blob. 5~10초 720p 기준 30~90초 */
export async function burnSubtitles(opts: BurnOptions): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ff = await loadFFmpeg();
  const size = opts.size ?? { w: 1920, h: 1080 };
  const style = opts.style ?? DEFAULT_STYLE;
  if (!opts.cues.some((c) => c.text.trim() && c.end > c.start)) throw new Error("화면에 나올 자막이 없어요. 끝(초)이 시작(초)보다 큰지 확인하세요.");
  opts.onProgress?.(0, "준비 중");

  const font = fontOf(style.fontId);
  await ff.createDir("/fonts").catch(() => {});
  await ff.writeFile(`/fonts/${font.file}`, await fetchFile(`/fonts/${font.file}`)); // 선택한 폰트만 올린다
  await ff.writeFile("in.mp4", await fetchFile(opts.video));
  await ff.writeFile("sub.ass", new TextEncoder().encode(buildAss(opts.cues, style, size)));
  if (opts.bgm) await ff.writeFile("bgm.mp3", await fetchFile(opts.bgm.file));
  if (opts.narration) await ff.writeFile("narr.mp3", await fetchFile(opts.narration.file));

  const onP = ({ progress }: { progress: number }) => opts.onProgress?.(Math.max(0, Math.min(1, progress)), "인코딩 중");
  ff.on("progress", onP);
  try {
    const clamp = (v: number | undefined, d: number) => Math.max(0, Math.min(1, v ?? d)).toFixed(2);
    const mixing = Boolean(opts.bgm || opts.narration);
    /**
     * 오디오 믹스 명령. withSource=true면 원본 소리도 섞는다 — Kling turbo 영상처럼 원본에 소리가 없으면
     * [0:a]가 없어 실패하므로, 실패 시 withSource=false로 한 번 더 시도한다.
     */
    const build = (withSource: boolean) => {
      const args = ["-y", "-i", "in.mp4"];
      const ins: string[] = [];
      let idx = 1;
      if (opts.bgm) {
        args.push("-stream_loop", "-1", "-i", "bgm.mp3");
        ins.push(`[${idx++}:a]volume=${clamp(opts.bgm.volume, 0.25)}[b]`);
      }
      if (opts.narration) {
        args.push("-i", "narr.mp3");
        ins.push(`[${idx++}:a]volume=${clamp(opts.narration.volume, 1)}[n]`);
      }
      if (mixing) {
        const labels = [...(withSource ? ["[s]"] : []), ...(opts.bgm ? ["[b]"] : []), ...(opts.narration ? ["[n]"] : [])];
        const src = withSource ? `[0:a]volume=${clamp(opts.sourceVolume, opts.narration ? 0.45 : 1)}[s];` : "";
        const mix = labels.length === 1 ? `${labels[0]}anull[a]` : `${labels.join("")}amix=inputs=${labels.length}:duration=first:normalize=0:dropout_transition=2[a]`;
        args.push("-filter_complex", `[0:v]ass=sub.ass:fontsdir=/fonts[v];${src}${ins.join(";")};${mix}`, "-map", "[v]", "-map", "[a]", "-shortest");
      } else {
        args.push("-vf", "ass=sub.ass:fontsdir=/fonts", "-map", "0:v:0", "-map", "0:a?", "-c:a", "copy");
      }
      args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
      if (mixing) args.push("-c:a", "aac", "-b:a", "160k");
      args.push("out.mp4");
      return args;
    };
    let code = await ff.exec(build(true));
    if (code !== 0 && mixing) code = await ff.exec(build(false));
    if (code !== 0) throw new Error(`ffmpeg 종료 코드 ${code}`);
    const data = (await ff.readFile("out.mp4")) as Uint8Array;
    if (!data.length) throw new Error("결과 파일이 비어 있어요.");
    opts.onProgress?.(1, "완료");
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ff.off("progress", onP);
    for (const f of ["in.mp4", "sub.ass", "out.mp4", "bgm.mp3", "narr.mp3"]) await ff.deleteFile(f).catch(() => {});
  }
}

/** 파일명 규칙 (SPEC §5⑥): {닉네임}_{yyyyMMdd_HHmm}.mp4 */
export function downloadFileName(nickname: string, d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const safe = (nickname || "실습").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30);
  return `${safe}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.mp4`;
}
