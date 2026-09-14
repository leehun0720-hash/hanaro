import type { NextConfig } from "next";

/**
 * 보안 응답 헤더 (모든 경로).
 * CSP는 프레임 삽입·기본 URL·플러그인만 제한하는 최소 구성 — 결제창(토스)·ffmpeg.wasm 워커·서명 URL 미디어를 깨지 않는다.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // ffmpeg 바이너리는 번들하지 않고 그대로 실행
  serverExternalPackages: ["ffmpeg-static"],
  // 서버리스 함수 배포 시 함께 포함해야 하는 파일들
  outputFileTracingIncludes: {
    "/api/jobs/**": ["./assets/**/*", "./node_modules/ffmpeg-static/**/*"],
    "/api/cron/**": ["./assets/**/*", "./node_modules/ffmpeg-static/**/*"],
    "/api/webhooks/**": ["./assets/**/*", "./node_modules/ffmpeg-static/**/*"],
    "/opengraph-image": ["./assets/fonts/NotoSansKR-Bold.otf"],
  },
};

export default nextConfig;
