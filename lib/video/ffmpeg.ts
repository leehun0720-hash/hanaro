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

export type Size = { w: number; h: number };
export const SIZE_169: Size = { w: 1920, h: 1080 };
export const SIZE_916: Size = { w: 1080, h: 1920 };

/** 어떤 입력이든 동일 규격(해상도·fps·무음 제거)의 mp4 조각으로 정규화. 길이 초과분은 잘라낸다 */
export async function normalizeClip(input: string, output: string, size: Size, seconds: number, opts: { fadeIn?: boolean } = {}) {
  const vf = [`scale=${size.w}:${size.h}:force_original_aspect_ratio=increase`, `crop=${size.w}:${size.h}`, "fps=30", "setsar=1", "format=yuv420p", ...(opts.fadeIn ? ["fade=t=in:st=0:d=0.4"] : [])].join(",");
  await run(["-i", input, "-t", String(seconds), "-an", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", output]);
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
  await run(["-loop", "1", "-i", image, "-t", String(seconds), "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", output]);
}

/** 동일 규격 클립들을 이어붙인다 (concat demuxer, 재인코딩 없음) */
export async function concatClips(clips: string[], output: string, dir: string) {
  const list = path.join(dir, "concat.txt");
  await fs.writeFile(list, clips.map((c) => `file '${c.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  await run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output]);
}

/** 자막 번인 + (선택) 오디오 합성 + 끝 페이드아웃 → 최종 mp4 */
export async function finalize(video: string, output: string, opts: { cues: Cue[]; size: Size; audio?: string; totalSeconds: number; fadeOut?: boolean; loopAudio?: boolean; style?: SubtitleStyle }) {
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
  // loopAudio: 음원이 영상보다 짧으면 반복 (업로드 BGM용). -t 로 총 길이를 자른다
  if (opts.audio) args.push(...(opts.loopAudio ? ["-stream_loop", "-1"] : []), "-i", opts.audio);
  if (filters.length) args.push("-vf", filters.join(","));
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (opts.audio) args.push("-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest", "-af", `afade=t=out:st=${Math.max(0, opts.totalSeconds - 2).toFixed(2)}:d=2`);
  else args.push("-an");
  args.push("-t", String(opts.totalSeconds), output);
  await run(args);
}

export async function cleanup(dir: string) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
