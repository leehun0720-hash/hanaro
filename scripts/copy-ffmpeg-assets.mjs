// ffmpeg.wasm(코어·워커)과 한글 자막 폰트를 public/ 아래로 복사한다 (SPEC D8: 브라우저 자막 처리, 자산 자체 호스팅).
// postinstall · predev · prebuild 에서 실행. 실패해도 설치를 막지 않는다.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const jobs = [
  { from: "node_modules/@ffmpeg/core/dist/esm", to: "public/ffmpeg/core" },
  { from: "node_modules/@ffmpeg/ffmpeg/dist/esm", to: "public/ffmpeg/lib" },
  { from: "assets/fonts", to: "public/fonts" },
];
for (const j of jobs) {
  const src = path.join(root, j.from);
  const dst = path.join(root, j.to);
  if (!existsSync(src)) { console.warn(`[ffmpeg-assets] 건너뜀 (없음): ${j.from}`); continue; }
  mkdirSync(dst, { recursive: true });
  // .d.ts는 제외 (tsconfig include에 잡혀 DOM/webworker 타입 충돌을 일으킨다)
  cpSync(src, dst, { recursive: true, force: true, filter: (p) => !p.endsWith(".d.ts") && !p.endsWith(".d.mts") });
  console.log(`[ffmpeg-assets] ${j.from} → ${j.to}`);
}
