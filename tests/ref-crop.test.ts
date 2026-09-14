import { describe, expect, it } from "vitest";
import path from "node:path";
import { cleanup, ffmpegPath, run, tmpDir } from "@/lib/video/ffmpeg";

/** referenceUrls가 쓰는 crop·scale 필터가 실제 ffmpeg에서 목표 비율을 만드는지 */
describe("참조 사진 비율 맞추기", () => {
  it("가로 1600x900 → 9:16 세로 크롭", async () => {
    const tmp = await tmpDir("refcrop-");
    try {
      const src = path.join(tmp, "src.jpg");
      await run(["-f", "lavfi", "-i", "color=c=orange:s=1600x900:d=1", "-frames:v", "1", src]);
      const out = path.join(tmp, "out.jpg");
      const [rw, rh] = [9, 16];
      const crop = `crop=w='min(iw,ih*${rw}/${rh})':h='min(ih,iw*${rh}/${rw})'`;
      const scale = "scale=w=-2:h='min(1440,ih)'";
      await run(["-i", src, "-vf", `${crop},${scale}`, "-q:v", "2", out]);
      // 크기 확인: ffmpeg -i 출력에서 WxH 파싱
      const { spawn } = await import("node:child_process");
      const bin = await ffmpegPath();
      const info = await new Promise<string>((resolve) => {
        const p = spawn(bin, ["-hide_banner", "-i", out], { stdio: ["ignore", "ignore", "pipe"] });
        let e = "";
        p.stderr.on("data", (d) => (e += d.toString()));
        p.on("close", () => resolve(e));
      });
      const m = info.match(/(\d{3,4})x(\d{3,4})/);
      expect(m).toBeTruthy();
      const w = Number(m![1]);
      const h = Number(m![2]);
      expect(Math.abs(w / h - 9 / 16)).toBeLessThan(0.01);
      expect(h).toBe(900);
    } finally {
      await cleanup(tmp);
    }
  }, 60_000);
});
