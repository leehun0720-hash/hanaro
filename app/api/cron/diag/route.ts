import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { availableFilters, cleanup, ffmpegPath, finalize, run, SIZE_169, tmpDir } from "@/lib/video/ffmpeg";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * 서버 ffmpeg 진단 (CRON_SECRET 인증). 외부 API 호출 없음.
 * 1초짜리 색 클립을 만들고 한글 자막(ASS 또는 drawtext)을 입혀 성공 여부·크기·사용 필터를 돌려준다.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const report: Record<string, unknown> = { cwd: process.cwd() };
  let tmp: string | null = null;
  try {
    report.ffmpeg = await ffmpegPath();
    const filters = await availableFilters();
    report.filters = { ass: filters.has("ass"), drawtext: filters.has("drawtext"), overlay: filters.has("overlay"), total: filters.size };
    const fontsDir = path.join(process.cwd(), "assets", "fonts");
    report.fonts = await fs.readdir(fontsDir).catch((e) => `읽기 실패: ${e instanceof Error ? e.message : e}`);

    tmp = await tmpDir("diag-");
    const clip = path.join(tmp, "clip.mp4");
    await run(["-f", "lavfi", "-i", "color=c=0x0B6B3A:s=640x360:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
    const out = path.join(tmp, "out.mp4");
    await finalize(clip, out, { cues: [{ start: 0, end: 1, text: "한글 자막 진단 테스트" }], size: SIZE_169, totalSeconds: 1, fadeOut: false, style: { position: "bottom", fontSize: 64, fontId: "blackhan", themeId: "outline-yellow" } });
    const st = await fs.stat(out);
    report.subtitle = { ok: true, bytes: st.size };
  } catch (e) {
    report.subtitle = { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (tmp) await cleanup(tmp);
  }
  report.ms = Date.now() - started;
  return NextResponse.json(report);
}
