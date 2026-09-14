import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg 바이너리는 번들하지 않고 그대로 실행
  serverExternalPackages: ["ffmpeg-static"],
  // 서버리스 함수 배포 시 함께 포함해야 하는 파일들
  outputFileTracingIncludes: {
    "/api/jobs/**": ["./assets/**/*", "./node_modules/ffmpeg-static/**/*"],
    "/api/cron/**": ["./assets/**/*", "./node_modules/ffmpeg-static/**/*"],
    "/api/webhooks/**": ["./assets/**/*", "./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
