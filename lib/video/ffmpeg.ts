import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { escapeFilterPath, subtitleFilter, type Cue } from "./subtitles";
import { DEFAULT_STYLE, type SubtitleStyle } from "./subtitle-style";
import { buildAss } from "./ass";

/** ffmpeg 바이너리 경로: 환경변수 > ffmpeg-static */
export async function ffmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string } | string;
  const p = typeof mod === "string" ? mod : mod.default;
  if (!p) throw new Error("ffmpeg 바이너리를 찾을 수 없습니다.");
  return p;
}

/** 바이너리가 지원하는 필터 목록 (프로세스당 1회). Linux(ffmpeg-static)는 ass만, Windows는 drawtext만 있는 식으로 빌드가 다르다 */
let _filters: Promise<Set<string>> | null = null;
export function availableFilters(): Promise<Set<string>> {
  return (_filters ??= (async () => {
    const bin = await ffmpegPath();
    return new Promise<Set<string>>((resolve) => {
      const proc = spawn(bin, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      proc.stdout.on("data", (d) => (out += d.toString()));
      proc.on("error", () => resolve(new Set()));
      proc.on("close", () => resolve(new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[1]).filter(Boolean))));
    });
  })());
}

export function run(args: string[], bin?: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const b = bin ?? (await ffmpegPath());
    const proc = spawn(b, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 실패(${code}): ${err.slice(-800)}`))));
  });
}

export async function tmpDir(prefix = "hanaro-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function downloadTo(url: string, file: string): Promise<void> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`파일 다운로드 실패: ${r.status}`);
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
}

/** 입력 파일에 오디오 스트림이 있는지 (ffprobe 없이 ffmpeg -i 출력으로 판단) */
export async function hasAudioStream(file: string): Promise<boolean> {
  const bin = await ffmpegPath();
  return new Promise((resolve) => {
    const proc = spawn(bin, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", () => resolve(false));
    proc.on("close", () => resolve(/Stream #\d+:\d+.*Audio:/.test(err)));
  });
}

/** 입력 길이(초). 못 읽으면 null */
export async function probeDuration(file: string): Promise<number | null> {
  const bin = await ffmpegPath();
  return new Promise((resolve) => {
    const proc = spawn(bin, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const m = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    });
  });
}

const SILENCE = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
const AAC = ["-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k"];

export type Size = { w: number; h: number };
export const SIZE_169: Size = { w: 1920, h: 1080 };
export const SIZE_916: Size = { w: 1080, h: 1920 };

/** 어떤 입력이든 동일 규격(해상도·fps·무음 제거)의 mp4 조각으로 정규화. 길이 초과분은 잘라낸다 */
export async function normalizeClip(input: string, output: string, size: Size, seconds: number, opts: { fadeIn?: boolean; keepAudio?: boolean } = {}) {
  // 클립이 목표보다 짧으면(Veo 8초 → 10초 컷) 최대 1.4배까지 슬로모션으로 늘려 빈 구간을 없앤다
  const actual = await probeDuration(input);
  const stretch = actual && actual > 0.5 && actual < seconds - 0.05 ? Math.min(1.4, seconds / actual) : 1;
  const vf = [`scale=${size.w}:${size.h}:force_original_aspect_ratio=increase`, `crop=${size.w}:${size.h}`, ...(stretch > 1 ? [`setpts=${stretch.toFixed(4)}*PTS`] : []), "fps=30", "setsar=1", "format=yuv420p", ...(opts.fadeIn ? ["fade=t=in:st=0:d=0.4"] : [])].join(",");
  // 모든 조각에 오디오 트랙(원본 또는 무음)을 넣어 concat·믹스 규격을 맞춘다
  const keep = opts.keepAudio && (await hasAudioStream(input));
  const audioIn = keep ? [] : SILENCE;
  const map = keep ? ["-map", "0:v:0", "-map", "0:a:0"] : ["-map", "0:v:0", "-map", "1:a:0"];
  const af = keep && stretch > 1 ? ["-af", `atempo=${(1 / stretch).toFixed(4)}`] : [];
  await run(["-i", input, ...audioIn, "-t", String(seconds), ...map, "-vf", vf, ...af, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", ...AAC, "-movflags", "+faststart", output]);
}

/** 정지 이미지 → N초 클립 (살짝 줌인하는 켄번스 효과) */
export async function imageToClip(image: string, output: string, size: Size, seconds: number) {
  const frames = Math.round(seconds * 30);
  const vf = [
    `scale=${size.w * 1.1}:${size.h * 1.1}:force_original_aspect_ratio=increase`,
    `crop=${Math.round(size.w * 1.1)}:${Math.round(size.h * 1.1)}`,
    `zoompan=z='min(zoom+0.0006,1.08)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size.w}x${size.h}:fps=30`,
    "fade=t=in:st=0:d=0.5",
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  await run(["-loop", "1", "-i", image, ...SILENCE, "-t", String(seconds), "-map", "0:v:0", "-map", "1:a:0", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", ...AAC, "-movflags", "+faststart", output]);
}

/**
 * 내레이션 트랙: 문장별 mp3를 각 시작 시각에 배치해 총 길이의 단일 mp3로 만든다.
 * 한 문장이 다음 시작 시각을 넘기면 겹치지 않도록 그 길이에서 잘라낸다.
 */
export async function buildNarrationTrack(parts: { file: string; start: number; maxSeconds?: number }[], totalSeconds: number, output: string) {
  if (!parts.length) throw new Error("내레이션 문장이 없어요.");
  const args: string[] = [];
  const chains: string[] = [];
  parts.forEach((p, i) => {
    args.push("-i", p.file);
    const trim = p.maxSeconds ? `atrim=0:${p.maxSeconds.toFixed(2)},` : "";
    chains.push(`[${i}:a]${trim}aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(p.start * 1000)}:all=1[n${i}]`);
  });
  const mix = parts.length === 1 ? `[n0]apad,atrim=0:${totalSeconds}[out]` : `${parts.map((_, i) => `[n${i}]`).join("")}amix=inputs=${parts.length}:normalize=0:dropout_transition=0,apad,atrim=0:${totalSeconds}[out]`;
  await run([...args, "-filter_complex", [...chains, mix].join(";"), "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "3", output]);
}

/** 동일 규격 클립들을 이어붙인다 (concat demuxer, 재인코딩 없음) */
export async function concatClips(clips: string[], output: string, dir: string) {
  const list = path.join(dir, "concat.txt");
  await fs.writeFile(list, clips.map((c) => `file '${c.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  await run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output]);
}

export type FinalizeAudio = {
  /** 배경음악·음원 파일 (뮤직비디오 음원, 업로드 BGM) */
  audio?: string;
  /** 음원이 영상보다 짧으면 반복 (업로드 BGM용) */
  loopAudio?: boolean;
  /** 배경음악 볼륨 0~1 (기본 1) */
  audioVolume?: number;
  /** 한국어 내레이션 트랙 (buildNarrationTrack 결과) */
  narration?: string;
  /** 영상 자체의 소리(Kling 현장음 등) 유지. 없는 파일이면 자동으로 무시 */
  keepSourceAudio?: boolean;
  /** 원본 소리 볼륨 0~1 (기본 1, 내레이션이 있으면 0.45 권장) */
  sourceVolume?: number;
};

/** 자막 번인 + 오디오 믹스(원본 소리·배경음악·내레이션) + 끝 페이드아웃 → 최종 mp4 */
export async function finalize(video: string, output: string, opts: { cues: Cue[]; size: Size; totalSeconds: number; fadeOut?: boolean; style?: SubtitleStyle } & FinalizeAudio) {
  const filters: string[] = [];
  const cues = opts.cues.filter((c) => c.text.trim() && c.end > c.start);
  if (cues.length) {
    const have = await availableFilters();
    if (have.has("ass")) {
      // libass: 브라우저와 동일한 ASS 문서 + 번들 폰트 디렉터리
      const assFile = path.join(path.dirname(output), `sub-${Date.now()}.ass`);
      await fs.writeFile(assFile, buildAss(cues, opts.style ?? DEFAULT_STYLE, opts.size), "utf8");
      const fontsDir = path.join(process.cwd(), "assets", "fonts");
      filters.push(`ass='${escapeFilterPath(assFile)}':fontsdir='${escapeFilterPath(fontsDir)}'`);
    } else if (have.has("drawtext")) {
      const sub = subtitleFilter(cues, opts.size.h, opts.style ? { style: opts.style } : {});
      if (sub) filters.push(sub);
    } else {
      throw new Error("이 ffmpeg 빌드에는 자막 필터(ass/drawtext)가 없습니다.");
    }
  }
  if (opts.fadeOut) filters.push(`fade=t=out:st=${Math.max(0, opts.totalSeconds - 1).toFixed(2)}:d=1`);
  const args = ["-i", video];
  const vol = (v: number | undefined, d: number) => Math.max(0, Math.min(1, v ?? d)).toFixed(2);

  // 오디오 입력 모으기: [원본 소리] [배경음악] [내레이션] → amix. 원본 소리는 실제로 있을 때만
  const sources: string[] = [];
  let idx = 1;
  if (opts.keepSourceAudio && (await hasAudioStream(video))) sources.push(`[0:a]volume=${vol(opts.sourceVolume, opts.narration ? 0.45 : 1)}`);
  if (opts.audio) {
    args.push(...(opts.loopAudio ? ["-stream_loop", "-1"] : []), "-i", opts.audio);
    sources.push(`[${idx++}:a]volume=${vol(opts.audioVolume, 1)}`);
  }
  if (opts.narration) {
    args.push("-i", opts.narration);
    sources.push(`[${idx++}:a]volume=1.00`);
  }

  if (filters.length) args.push("-vf", filters.join(","));
  args.push("-map", "0:v:0", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (sources.length) {
    const fade = `afade=t=out:st=${Math.max(0, opts.totalSeconds - 2).toFixed(2)}:d=2`;
    const labeled = sources.map((s, i) => `${s}[s${i}]`);
    const mix = sources.length === 1 ? `[s0]${fade}[aout]` : `${sources.map((_, i) => `[s${i}]`).join("")}amix=inputs=${sources.length}:duration=longest:normalize=0:dropout_transition=2,${fade}[aout]`;
    args.push("-filter_complex", [...labeled, mix].join(";"), "-map", "[aout]", ...AAC.slice(0, -2), "-b:a", "192k");
  } else args.push("-an");
  args.push("-t", String(opts.totalSeconds), output);
  await run(args);
}

export async function cleanup(dir: string) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
