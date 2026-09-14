import { timingSafeEqual } from "node:crypto";

/** 비밀 토큰 비교 — 길이가 달라도 상수 시간에 가깝게, 타이밍 공격을 피한다 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** `Authorization: Bearer <CRON_SECRET>` 검사 (Vercel Cron·수동 호출 공용) */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization"), `Bearer ${secret}`);
}
