import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { buildNarrationTrack, cleanup, concatClips, finalize, hasAudioStream, imageToClip, normalizeClip, run, SIZE_169, tmpDir } from "@/lib/video/ffmpeg";

describe("ffmpeg audio pipeline (smoke)", () => {
  it("silent+voiced clips → concat → narration mix", async () => {
    const tmp = await tmpDir("ffsmoke-");
    try {
      const size = { w: 640, h: 360 };
      // 소리 없는 클립, 소리 있는 클립(사인파), 정지 이미지
      const mute = path.join(tmp, "mute.mp4");
      await run(["-f", "lavfi", "-i", `color=c=red:s=640x360:d=2`, "-c:v", "libx264", "-pix_fmt", "yuv420p", mute]);
      const voiced = path.join(tmp, "voiced.mp4");
      await run(["-f", "lavfi", "-i", `color=c=blue:s=640x360:d=2`, "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", voiced]);
      const png = path.join(tmp, "img.png");
      await run(["-f", "lavfi", "-i", "color=c=green:s=640x360:d=1", "-frames:v", "1", png]);
      expect(await hasAudioStream(mute)).toBe(false);
      expect(await hasAudioStream(voiced)).toBe(true);

      const n1 = path.join(tmp, "n1.mp4");
      const n2 = path.join(tmp, "n2.mp4");
      const n3 = path.join(tmp, "n3.mp4");
      await normalizeClip(mute, n1, size, 2, { keepAudio: true });
      await normalizeClip(voiced, n2, size, 2, { keepAudio: true });
      await imageToClip(png, n3, size, 2);
      for (const f of [n1, n2, n3]) expect(await hasAudioStream(f)).toBe(true);

      const joined = path.join(tmp, "joined.mp4");
      await concatClips([n1, n2, n3], joined, tmp);

      // 내레이션: 두 문장(사인파로 대체) 을 0초·2초에 배치
      const s1 = path.join(tmp, "s1.mp3");
      const s2 = path.join(tmp, "s2.mp3");
      await run(["-f", "lavfi", "-i", "sine=frequency=660:duration=1", "-c:a", "libmp3lame", s1]);
      await run(["-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-c:a", "libmp3lame", s2]);
      const narr = path.join(tmp, "narr.mp3");
      await buildNarrationTrack([{ file: s1, start: 0, maxSeconds: 2 }, { file: s2, start: 2, maxSeconds: 2 }], 6, narr);
      expect((await fs.stat(narr)).size).toBeGreaterThan(1000);

      const final = path.join(tmp, "final.mp4");
      await finalize(joined, final, { cues: [{ start: 0, end: 6, text: "테스트" }], size: SIZE_169, totalSeconds: 6, fadeOut: true, keepSourceAudio: true, narration: narr });
      expect(await hasAudioStream(final)).toBe(true);
      expect((await fs.stat(final)).size).toBeGreaterThan(10_000);

      // 오디오 없이도 동작 (-an)
      const silent = path.join(tmp, "silent.mp4");
      await finalize(joined, silent, { cues: [], size: SIZE_169, totalSeconds: 6 });
      expect(await hasAudioStream(silent)).toBe(false);
    } finally {
      await cleanup(tmp);
    }
  }, 120_000);
});
