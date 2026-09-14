/** 사이트 대표 주소 — SEO(canonical·sitemap·OG)와 메일 링크 기본값. 여러 도메인 중 하나만 정식으로 취급한다 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.runiq.space").replace(/\/+$/, "");
export const SITE_NAME = "runiq space";
export const SITE_DESCRIPTION = "농축협 현장을 위한 AI 콘텐츠 스튜디오 — 기획서·뉴스레터·카드뉴스·홍보영상·뮤직비디오를 소재 하나로, 오늘 안에.";

/** 검색 노출 대상 공개 페이지 (사이트맵·robots 기준) */
export const PUBLIC_PATHS = ["/", "/pricing", "/privacy", "/terms"] as const;

/** 로그인 후 이동 경로 검증 — 같은 사이트 안의 경로만 허용 (//host, /\host 같은 오픈 리다이렉트 차단) */
export function safeNext(v: unknown, fallback = "/studio"): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s.startsWith("/")) return fallback;
  if (/^\/[\/\\]/.test(s)) return fallback; // 프로토콜 상대 주소
  if (/[\u0000-\u001f\s]/.test(s)) return fallback; // 제어문자·공백
  return s;
}
